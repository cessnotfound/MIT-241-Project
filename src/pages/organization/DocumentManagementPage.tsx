import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import '../../styles/DocumentManagement.css'
import '../../styles/FeedbackNotification.css'
import FeedbackNotification from '../../components/FeedbackNotification'

type Overview = { current_academic_year: string; academic_years: string[] }
type Activity = { id: string; academic_year: string; resolution_number: number; activity_title: string; activity_date: string | null; description: string | null; activity_status: string; attachment_count: number }
type FileRecord = { id: string; document_type: string; file_name: string }
type Document = { id: string; title: string; category: string; description: string | null; file_name: string }
type DocType = 'FORM_7'|'RESOLUTION'|'EVALUATION'
const ROOT = '/api/documents'
const CATEGORIES: [string,string][] = [['CONSTITUTION_AND_BYLAWS','Constitution and By-Laws'],['MEETING_MINUTES','Meeting Minutes'],['CERTIFICATES_AND_RECOGNITIONS','Certificates and Recognitions'],['OTHER','Other Documents']]
const TYPES: [string,string][] = [['FORM_7','Form 7'],['RESOLUTION','Resolution'],['EVALUATION','Evaluation (Optional)'],['OTHER','Other']]
const STATUS = ['NOT CONDUCTED','CONDUCTED','POSTPONED','CANCELLED']
const label = (value: string, choices: [string,string][]) => choices.find(x => x[0] === value)?.[1] || value
async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(ROOT+path,{credentials:'same-origin',...options})
  if (!response.ok) {
    const data = await response.json().catch(()=>({})) as {error?:string}
    throw new Error(data.error || `Request failed (${response.status})`)
  }
  return response.json() as Promise<T>
}
const json = (method:string,body:unknown):RequestInit => ({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
const validFile = (f:File|null) => !!f && f.size>0 && f.size<=10*1024*1024 && ['application/pdf','image/jpeg','image/png','image/webp'].includes(f.type)
async function sendAttachment(id:string,type:string,file:File) {
  await api(`/activities/${id}/files`,{method:'POST',headers:{'Content-Type':file.type,'x-document-type':type,'x-file-name':encodeURIComponent(file.name)},body:file})
}

type DMIconName = 'eye'|'download'|'pencil'|'trash'
function DMIcon({name}:{name:DMIconName}) {
  const common = {viewBox:'0 0 24 24',width:20,height:20,fill:'none',stroke:'currentColor',strokeWidth:2,strokeLinecap:'round' as const,strokeLinejoin:'round' as const,'aria-hidden':true as const}
  if(name==='eye')return <svg {...common}><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="3"/></svg>
  if(name==='download')return <svg {...common}><path d="M12 3v12m-5-5 5 5 5-5M4 17v3h16v-3"/></svg>
  if(name==='pencil')return <svg {...common}><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z"/></svg>
  return <svg {...common}><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
}
function DMAction({name,title,onClick,href,download,disabled}:{name:DMIconName;title:string;onClick?:()=>void;href?:string;download?:boolean;disabled?:boolean}) {
  const cls=`dm-icon-action${name==='trash'?' dm-icon-danger':''}`
  return href ? <a className={cls} title={title} aria-label={title} href={href} target={download?undefined:'_blank'} rel={download?undefined:'noreferrer'} download={download||undefined}><DMIcon name={name}/></a>
    : <button type="button" className={cls} title={title} aria-label={title} onClick={onClick} disabled={disabled}><DMIcon name={name}/></button>
}

export default function DocumentManagementPage() {
  const [overview,setOverview] = useState<Overview|null>(null)
  const [year,setYear] = useState('')
  const [tab,setTab] = useState<'activities'|'repository'>('activities')
  const [activities,setActivities] = useState<Activity[]>([])
  const [documents,setDocuments] = useState<Document[]>([])
  const [search,setSearch] = useState('')
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  const [notice,setNotice] = useState('')
  const dismissFeedback = () => { setError(''); setNotice('') }
  const [form,setForm] = useState<'activity'|'repository'|null>(null)
  const [resolutionNumber,setResolutionNumber] = useState('')
  const [activityTitle,setActivityTitle] = useState('')
  const [activityDate,setActivityDate] = useState('')
  const [description,setDescription] = useState('')
  const [newFiles,setNewFiles] = useState<Record<DocType,File|null>>({FORM_7:null,RESOLUTION:null,EVALUATION:null})
  const [createAdding,setCreateAdding] = useState(false)
  const [createFileType,setCreateFileType] = useState<DocType>('FORM_7')
  const [createCandidate,setCreateCandidate] = useState<File|null>(null)
  const [createStatus,setCreateStatus] = useState('NOT CONDUCTED')
  const [selected,setSelected] = useState<Activity|null>(null)
  const [editResolution,setEditResolution] = useState('')
  const [files,setFiles] = useState<FileRecord[]>([])
  const [addingDocument,setAddingDocument] = useState(false)
  const [fileType,setFileType] = useState<DocType>('FORM_7')
  const [activityFile,setActivityFile] = useState<File|null>(null)
  const [documentTitle,setDocumentTitle] = useState('')
  const [category,setCategory] = useState('CONSTITUTION_AND_BYLAWS')
  const [documentFile,setDocumentFile] = useState<File|null>(null)
  const createFormRef = useRef<HTMLFormElement>(null)
  const editable = Boolean(overview && year===overview.current_academic_year)

  const reload = useCallback(async (ay:string) => {
    if (!ay) return
    const [a,d] = await Promise.all([
      api<{activities:Activity[]}>(`/activities?academic_year=${encodeURIComponent(ay)}`),
      api<{documents:Document[]}>(`/repository?academic_year=${encodeURIComponent(ay)}`),
    ])
    setActivities(a.activities); setDocuments(d.documents)
  },[])
  useEffect(()=>{void api<Overview>('/overview').then(o=>{setOverview(o);setYear(o.current_academic_year)}).catch(e=>setError((e as Error).message))},[])
  useEffect(()=>{void reload(year).catch(e=>setError((e as Error).message))},[year,reload])
  useEffect(()=>{
    if (!error && !notice) return
    const timer=window.setTimeout(()=>{setError('');setNotice('')},5500)
    return ()=>window.clearTimeout(timer)
  },[error,notice])
  useEffect(()=>{
    const handler=(e:KeyboardEvent)=>{if(e.key==='Escape' && !busy){setForm(null);setSelected(null);setAddingDocument(false)}}
    document.addEventListener('keydown',handler)
    return ()=>document.removeEventListener('keydown',handler)
  },[busy])
  async function perform(work:()=>Promise<void>,success:string){
    setBusy(true);setError('');setNotice('')
    try{await work();setNotice(success)}catch(e){setError((e as Error).message)}finally{setBusy(false)}
  }
  function startActivity(){
    setResolutionNumber('');setActivityTitle('');setActivityDate('');setDescription('');setNewFiles({FORM_7:null,RESOLUTION:null,EVALUATION:null});setCreateStatus('NOT CONDUCTED');setCreateAdding(false);setCreateCandidate(null);setCreateFileType('FORM_7');setForm('activity');setError('')
  }
  function attachNewFile(){
    if(!validFile(createCandidate)){setError('Please choose a PDF, JPG, PNG, or WebP file up to 10 MB.');return}
    setNewFiles(old=>({...old,[createFileType]:createCandidate}))
    setCreateCandidate(null)
    setCreateAdding(false)
    setError('')
  }
  async function submitActivity(e:FormEvent){
    e.preventDefault()
    const form7=newFiles.FORM_7, resolution=newFiles.RESOLUTION, evaluation=newFiles.EVALUATION
    const enteredNumber = Number(resolutionNumber)
    if (!Number.isSafeInteger(enteredNumber) || enteredNumber < 1) { setError('Enter a valid Resolution No. (1 or higher).'); return }
    if(!validFile(form7)||!validFile(resolution)|| (evaluation!==null&&!validFile(evaluation))){setError('Form 7 and Resolution are required. Select valid PDF/JPG/PNG/WebP files, up to 10 MB each.');return}
    await perform(async()=>{
      // Create record only after the two mandatory files have passed local validation.
      // Existing API uploads files one at a time. Roll back the activity if any upload fails.
      const created=await api<Activity>('/activities',json('POST',{resolution_number:enteredNumber,activity_title:activityTitle,activity_date:activityDate||null,description}))
      try {
        await sendAttachment(created.id,'FORM_7',form7!)
        await sendAttachment(created.id,'RESOLUTION',resolution!)
        if(evaluation) await sendAttachment(created.id,'EVALUATION',evaluation)
        if(createStatus!=='NOT CONDUCTED') await api(`/activities/${created.id}`,json('PUT',{activity_title:activityTitle,activity_date:activityDate||null,description,activity_status:createStatus}))
      }catch(err){
        try{await api(`/activities/${created.id}`,{method:'DELETE'})}catch{throw new Error('A file upload failed and automatic cleanup also failed. Please contact the administrator to remove the incomplete activity.')}
        throw new Error(`Activity was not saved: ${(err as Error).message}. No. ${created.resolution_number} will not be reused.`)
      }
      setForm(null);setNewFiles({FORM_7:null,RESOLUTION:null,EVALUATION:null});await reload(year)
    },'Activity and required documents saved. Resolution number issued.')
  }
  async function openActivity(a:Activity){
    setSelected(a);setEditResolution(String(a.resolution_number));setFiles([]);setAddingDocument(false);setError('')
    try{const r=await api<{files:FileRecord[]}>(`/activities/${a.id}`);setFiles(r.files)}catch(e){setError((e as Error).message)}
  }
  async function updateActivity(){
    if(!selected)return
    const enteredNumber=Number(editResolution)
    if(!Number.isSafeInteger(enteredNumber)||enteredNumber<1||enteredNumber>2147483647){setError('Resolution No. must be a valid positive whole number.');return}
    await perform(async()=>{
      const updated=await api<Activity>(`/activities/${selected.id}`,json('PUT',{resolution_number:enteredNumber,activity_title:selected.activity_title,activity_date:selected.activity_date?.slice(0,10)||null,description:selected.description||'',activity_status:selected.activity_status}))
      setSelected(updated);setEditResolution(String(updated.resolution_number));await reload(year)
    },'Activity updated.')
  }
  async function deleteActivity(a:Activity){
    if(!window.confirm(`Delete Resolution No. ${a.resolution_number}? This resolution number will not be reused.`))return
    await perform(async()=>{await api(`/activities/${a.id}`,{method:'DELETE'});setSelected(null);await reload(year)},'Activity deleted.')
  }
  async function uploadAttachment(){
    if(!selected || !activityFile)return
    if(!validFile(activityFile)){setError('Select a valid PDF/JPG/PNG/WebP file up to 10 MB.');return}
    await perform(async()=>{
      await sendAttachment(selected.id,fileType,activityFile)
      setActivityFile(null);setAddingDocument(false);await openActivity(selected);await reload(year)
    },'Document uploaded.')
  }
  async function deleteAttachment(f:FileRecord){
    if(!selected || !window.confirm(`Remove ${f.file_name}?`))return
    await perform(async()=>{await api(`/activities/${selected.id}/files/${f.id}`,{method:'DELETE'});await openActivity(selected);await reload(year)},'Attachment removed.')
  }
  async function submitDocument(e:FormEvent){
    e.preventDefault()
    if(!validFile(documentFile)){setError('Select a PDF/JPG/PNG/WebP file up to 10 MB.');return}
    await perform(async()=>{
      await api('/repository',{method:'POST',headers:{'Content-Type':documentFile!.type,'x-file-name':encodeURIComponent(documentFile!.name),'x-document-title':encodeURIComponent(documentTitle),'x-document-category':category,'x-document-description':encodeURIComponent(description)},body:documentFile})
      setForm(null);setDocumentFile(null);setDocumentTitle('');setDescription('');await reload(year)
    },'Document uploaded.')
  }
  async function editDocument(d:Document){
    const title=window.prompt('Edit document title',d.title)
    if(!title?.trim())return
    await perform(async()=>{await api(`/repository/${d.id}`,json('PUT',{title,category:d.category,description:d.description||''}));await reload(year)},'Document updated.')
  }
  async function deleteDocument(d:Document){
    if(!window.confirm(`Delete ${d.title}?`))return
    await perform(async()=>{await api(`/repository/${d.id}`,{method:'DELETE'});await reload(year)},'Document deleted.')
  }
  const visibleActivities=[...activities].sort((a,b)=>a.resolution_number-b.resolution_number).filter(a=>`${a.resolution_number} ${a.activity_title} ${a.activity_status}`.toLowerCase().includes(search.toLowerCase()))
  const visibleDocs=documents.filter(d=>`${d.title} ${d.category} ${d.file_name}`.toLowerCase().includes(search.toLowerCase()))
  const documentItems: {type:DocType;title:string;hint:string;optional:boolean}[]=[
    {type:'FORM_7',title:'Form 7',hint:'Required for the activity record',optional:false},
    {type:'RESOLUTION',title:'Resolution',hint:'Required resolution document',optional:false},
    {type:'EVALUATION',title:'Evaluation',hint:'May be attached later after conducting the activity',optional:true},
  ]
  return <div className="dm-page">
    <header className="dm-page-heading"><h1>Document Management</h1></header>
    <FeedbackNotification error={error} message={notice} onDismiss={dismissFeedback} />
    <div className="dm-year-row"><label htmlFor="dm-year-select">Academic Year</label><select id="dm-year-select" value={year} onChange={e=>{setYear(e.target.value);setSelected(null);setSearch('')}}>{(overview?.academic_years||[]).map(ay=><option key={ay} value={ay}>{ay.replace('-','–')}{ay===overview?.current_academic_year?' (Current)':''}</option>)}</select>{editable?<span className="dm-year-note">Current academic year</span>:<span className="dm-year-note dm-muted">Archived • View only</span>}</div>
    <nav className="dm-tabs" aria-label="Document sections"><button type="button" className={tab==='activities'?'dm-active':''} onClick={()=>setTab('activities')}>Activity Documents</button><button type="button" className={tab==='repository'?'dm-active':''} onClick={()=>setTab('repository')}>Document Repository</button></nav>
    <div className="dm-toolbar"><input aria-label="Search documents" placeholder={tab==='activities'?'Search activities or resolutions...':'Search documents...'} value={search} onChange={e=>setSearch(e.target.value)}/>{editable && <button type="button" className="dm-primary" onClick={()=>{if(tab==='activities')startActivity();else{setForm('repository');setError('');setDescription('')}}}>{tab==='activities'?'+ Add Activity':'+ Upload Document'}</button>}</div>
    {tab==='activities'?<div className="dm-tablewrap"><table><thead><tr><th>Resolution No.</th><th>Activity Title</th><th>Date</th><th>Attached Documents</th><th>Activity Status</th><th>Actions</th></tr></thead><tbody>{visibleActivities.map(a=><tr key={a.id}><td><strong>No. {a.resolution_number}</strong></td><td><span>{a.activity_title}</span></td><td>{a.activity_date?.slice(0,10)||'—'}</td><td>{a.attachment_count||0} file(s)</td><td>{a.activity_status}</td><td><div className="dm-actions"><DMAction name="eye" title={`View ${a.activity_title}`} onClick={()=>void openActivity(a)}/>{editable && <DMAction name="trash" title={`Delete ${a.activity_title}`} disabled={busy} onClick={()=>void deleteActivity(a)}/>}</div></td></tr>)}{visibleActivities.length===0 && <tr><td colSpan={6} className="dm-empty">No activity documents found for this academic year.</td></tr>}</tbody></table></div>:<div className="dm-tablewrap"><table><thead><tr><th>Document Title</th><th>Category</th><th>File Name</th><th>Actions</th></tr></thead><tbody>{visibleDocs.map(d=><tr key={d.id}><td><strong>{d.title}</strong></td><td>{label(d.category,CATEGORIES)}</td><td className="dm-filename"><span>{d.file_name}</span></td><td><div className="dm-actions"><DMAction name="eye" title={`View ${d.file_name}`} href={`${ROOT}/repository/${d.id}/file`}/><DMAction name="download" title={`Download ${d.file_name}`} href={`${ROOT}/repository/${d.id}/file?download=1`} download/>{editable&&<><DMAction name="pencil" title={`Edit ${d.title}`} disabled={busy} onClick={()=>void editDocument(d)}/><DMAction name="trash" title={`Delete ${d.title}`} disabled={busy} onClick={()=>void deleteDocument(d)}/></>}</div></td></tr>)}{visibleDocs.length===0 && <tr><td colSpan={4} className="dm-empty">No documents found for this academic year.</td></tr>}</tbody></table></div>}
    {form==='activity'&&<div className="dm-backdrop" role="presentation"><section className="dm-dialog dm-activity-dialog" role="dialog" aria-modal="true" aria-labelledby="dm-add-title"><form ref={createFormRef} onSubmit={e=>void submitActivity(e)}>
      <header className="dm-dialog-header"><h2 id="dm-add-title">Add Activity</h2><p>Academic Year {year.replace('-','–')} • Enter the official resolution number for this year</p></header>
      <div className="dm-dialog-body dm-activity-form-grid">
        <label className="dm-resolution-field"><span>Resolution No. <span className="dm-required">*</span></span><input required type="number" min="1" step="1" inputMode="numeric" value={resolutionNumber} onChange={e=>setResolutionNumber(e.target.value)} placeholder="e.g., 1"/></label>
        <label><span>Activity Title <span className="dm-required">*</span></span><input required maxLength={500} value={activityTitle} onChange={e=>setActivityTitle(e.target.value)} placeholder="Enter activity title"/></label>
        <label>Activity Date<input type="date" value={activityDate} onChange={e=>setActivityDate(e.target.value)}/></label>
        <label>Activity Status<select value={createStatus} onChange={e=>setCreateStatus(e.target.value)}>{STATUS.map(st=><option key={st}>{st}</option>)}</select></label>
        <label className="dm-full-width"><span>Description <span className="dm-optional">(Optional)</span></span><textarea rows={2} value={description} onChange={e=>setDescription(e.target.value)}/></label>
        <section className="dm-document-section dm-full-width">
          <div className="dm-section-head"><h3>Attached Documents</h3><button type="button" className="dm-outline" onClick={()=>{setCreateAdding(x=>!x);setCreateCandidate(null)}}>+ Add Documents</button></div>
          {documentItems.filter(item=>newFiles[item.type]!==null).length===0 ? (
            <p>No documents attached yet.</p>
          ) : documentItems.filter(item=>newFiles[item.type]!==null).map(item=>{
            const file=newFiles[item.type]!
            return <div className="dm-file dm-create-file" key={item.type}>
              <div className="dm-document-cell"><div><strong>{item.title}</strong><small>{file.name}</small></div></div>
              <DMAction name="trash" title={`Remove ${item.title}`} onClick={()=>setNewFiles(old=>({...old,[item.type]:null}))}/>
            </div>
          })}
          <p className="dm-requirements-note"><strong>Required:</strong> Please attach both Form 7 and Resolution before creating the activity. Evaluation is optional and may be attached later.</p>
          {createAdding&&<div className="dm-add-document">
            <label>Document Type<select value={createFileType} onChange={e=>{setCreateFileType(e.target.value as DocType);setCreateCandidate(null)}}>{documentItems.map(item=><option key={item.type} value={item.type}>{item.title}{item.optional?' (Optional)':''}</option>)}</select></label>
            <label>Choose Document<input key={createFileType} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={e=>setCreateCandidate(e.target.files?.[0]||null)}/></label>
            <button type="button" className="dm-primary" disabled={!validFile(createCandidate)||busy} onClick={attachNewFile}>Add File</button>
          </div>}
        </section>
      </div>
      <footer className="dm-dialog-actions"><button type="button" disabled={busy} onClick={()=>setForm(null)}>Cancel</button><button type="submit" className="dm-primary" disabled={busy||!Number.isSafeInteger(Number(resolutionNumber))||Number(resolutionNumber)<1||!activityTitle.trim()||!validFile(newFiles.FORM_7)||!validFile(newFiles.RESOLUTION)||!!(newFiles.EVALUATION&&!validFile(newFiles.EVALUATION))}>{busy?'Saving...':'Create Activity'}</button></footer>
    </form></section></div>}
    {form==='repository'&&<div className="dm-backdrop"><section className="dm-dialog" role="dialog" aria-modal="true" aria-labelledby="dm-repo-title"><form onSubmit={e=>void submitDocument(e)}><header className="dm-dialog-header"><h2 id="dm-repo-title">Upload Document</h2><p>Academic Year {year.replace('-','–')}</p></header><div className="dm-dialog-body"><label>Document Title<input required maxLength={500} value={documentTitle} onChange={e=>setDocumentTitle(e.target.value)}/></label><label>Category<select value={category} onChange={e=>setCategory(e.target.value)}>{CATEGORIES.map(c=><option value={c[0]} key={c[0]}>{c[1]}</option>)}</select></label><label>Description (Optional)<textarea value={description} onChange={e=>setDescription(e.target.value)}/></label><label>File (PDF/JPG/PNG/WebP; max 10 MB)<input required type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={e=>setDocumentFile(e.target.files?.[0]||null)}/></label></div><footer className="dm-dialog-actions"><button type="button" disabled={busy} onClick={()=>setForm(null)}>Cancel</button><button className="dm-primary" type="submit" disabled={busy}>{busy?'Uploading...':'Upload Document'}</button></footer></form></section></div>}
    {selected&&<div className="dm-backdrop"><section className="dm-dialog dm-activity-dialog" role="dialog" aria-modal="true" aria-labelledby="dm-view-title"><header className="dm-dialog-header"><h2 id="dm-view-title">Resolution No. {selected.resolution_number}</h2><p>Academic Year {selected.academic_year.replace('-','–')}{editable?' • Edit activity details and resolution number':' • Archived record (view only)'}</p></header><div className="dm-dialog-body dm-activity-form-grid"><label className="dm-resolution-field"><span>Resolution No. <span className="dm-required">*</span></span><input type="number" min="1" step="1" inputMode="numeric" required disabled={!editable} value={editResolution} onChange={e=>setEditResolution(e.target.value)}/></label><label><span>Activity Title <span className="dm-required">*</span></span><input required maxLength={500} disabled={!editable} value={selected.activity_title} onChange={e=>setSelected({...selected,activity_title:e.target.value})}/></label><label>Activity Date<input type="date" disabled={!editable} value={selected.activity_date?.slice(0,10)||''} onChange={e=>setSelected({...selected,activity_date:e.target.value||null})}/></label><label>Activity Status<select disabled={!editable} value={selected.activity_status} onChange={e=>setSelected({...selected,activity_status:e.target.value})}>{STATUS.map(s=><option key={s}>{s}</option>)}</select></label><label className="dm-full-width"><span>Description <span className="dm-optional">(Optional)</span></span><textarea rows={2} disabled={!editable} value={selected.description||''} onChange={e=>setSelected({...selected,description:e.target.value})}/></label><section className="dm-document-section dm-full-width"><div className="dm-section-head"><h3>Attached Documents</h3>{editable&&<button type="button" className="dm-outline" onClick={()=>{setAddingDocument(x=>!x);setActivityFile(null)}}>+ Add Documents</button>}</div>{files.length===0?<p>No documents attached yet.</p>:files.map(f=><div className="dm-file" key={f.id}><div className="dm-document-cell"><div><strong>{label(f.document_type,TYPES)}</strong><small>{f.file_name}</small></div></div><div className="dm-actions"><DMAction name="eye" title={`View ${f.file_name}`} href={`${ROOT}/activities/${selected.id}/files/${f.id}`}/><DMAction name="download" title={`Download ${f.file_name}`} href={`${ROOT}/activities/${selected.id}/files/${f.id}?download=1`} download/>{editable&&<DMAction name="trash" title={`Remove ${f.file_name}`} disabled={busy} onClick={()=>void deleteAttachment(f)}/>}</div></div>)}{addingDocument&&editable&&<div className="dm-add-document"><label>Document Type<select value={fileType} onChange={e=>setFileType(e.target.value as DocType)}>{TYPES.filter(t=>t[0]!=='OTHER').map(t=><option key={t[0]} value={t[0]}>{t[1]}</option>)}</select></label><label>Choose Document<input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={e=>setActivityFile(e.target.files?.[0]||null)}/></label><button className="dm-primary" type="button" disabled={busy||!validFile(activityFile)} onClick={()=>void uploadAttachment()}>Upload Document</button></div>}</section></div><footer className="dm-dialog-actions"><button type="button" disabled={busy} onClick={()=>{setSelected(null);setActivityFile(null);setAddingDocument(false)}}>Close</button>{editable&&<button type="button" className="dm-primary" disabled={busy||!Number.isSafeInteger(Number(editResolution))||Number(editResolution)<1||!selected.activity_title.trim()} onClick={()=>void updateActivity()}>Save Changes</button>}</footer></section></div>}
  </div>
}
