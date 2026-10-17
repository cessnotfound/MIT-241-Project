import { useEffect, useState, type FormEvent } from 'react'
import { osasGet } from './osasTypes'

type Overview = { total_organizations:number; renewed:number; not_renewed:number; pending_applications:number|null }
type Me = {username:string;full_name:string}
async function putAccount(url:string,body:object) {
  const res=await fetch(url,{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
  const payload=await res.json() as {error?:string;username?:string}
  if (!res.ok) throw new Error(payload.error || 'Unable to save changes')
  return payload
}
export default function OsasOverviewPage() {
  const [data,setData]=useState<Overview|null>(null)
  const [me,setMe]=useState<Me|null>(null)
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const [editingUsername,setEditingUsername]=useState(false)
  const [editingPassword,setEditingPassword]=useState(false)
  const [username,setUsername]=useState('')
  const [currentPassword,setCurrentPassword]=useState('')
  const [newPassword,setNewPassword]=useState('')
  const [confirmPassword,setConfirmPassword]=useState('')
  const [busy,setBusy]=useState(false)
  useEffect(()=>{
    const controller=new AbortController()
    void Promise.all([osasGet<Overview>('/api/osas/overview',controller.signal),osasGet<Me>('/api/osas/me',controller.signal)])
      .then(([statistics,account])=>{if(!controller.signal.aborted){setData(statistics);setMe(account);setUsername(account.username)}})
      .catch((e:unknown)=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Unable to load overview')})
    return ()=>controller.abort()
  },[])
  async function saveUsername(e:FormEvent) {
    e.preventDefault();setError('');setMessage('')
    const value=username.trim().toLowerCase()
    if (!/^[a-z0-9][a-z0-9-]{2,49}$/.test(value)){setError('Username must have 3–50 lowercase letters, numbers or hyphens.');return}
    setBusy(true)
    try {
      const result=await putAccount('/api/osas/username',{username:value,currentPassword})
      setMe(old=>old?{...old,username:result.username||value}:old)
      window.dispatchEvent(new CustomEvent('osas-username-updated',{detail:{username:result.username||value}}))
      setEditingUsername(false);setCurrentPassword('');setMessage('Username updated successfully.')
    } catch(e){setError(e instanceof Error?e.message:'Username change failed')}
    finally{setBusy(false)}
  }
  async function savePassword(e:FormEvent){
    e.preventDefault();setError('');setMessage('')
    if(newPassword!==confirmPassword){setError('New passwords do not match.');return}
    setBusy(true)
    try{await putAccount('/api/osas/change-password',{currentPassword,newPassword});setEditingPassword(false);setCurrentPassword('');setNewPassword('');setConfirmPassword('');setMessage('Password updated successfully.')}
    catch(e){setError(e instanceof Error?e.message:'Password change failed')}
    finally{setBusy(false)}
  }
  return <div className="osas-page">
    <h1>Overview</h1><p className="osas-muted">Office of Student Affairs and Services</p>
    {error&&<p role="alert" className="osas-error">{error}</p>}{message&&<p role="status" className="osas-account-success">{message}</p>}
    {!data&&!error&&<p>Loading OSAS overview...</p>}
    {data&&<div className="osas-stat-grid">
      {([['Total Organizations',data.total_organizations],['Renewed',data.renewed],['Not Renewed',data.not_renewed],['Pending Applications',data.pending_applications??'—']] as const).map(([label,value])=><div className="osas-stat" key={label}><span>{label}</span><strong>{value}</strong></div>)}
    </div>}
    <section className="osas-account-section">
      <h2>Account Information</h2>
      <div className="osas-account-row"><strong>Username</strong><span>{me?.username||'—'}</span></div>
      {!editingUsername&&<button className="osas-primary" type="button" onClick={()=>{setError('');setMessage('');setEditingUsername(true);setEditingPassword(false)}}>Edit Username</button>}
      {editingUsername&&<form className="osas-account-form" onSubmit={e=>void saveUsername(e)}>
        <label>New Username<input value={username} onChange={e=>setUsername(e.target.value)} required /></label>
        <label>Current Password<input type="password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} required autoComplete="current-password"/></label>
        <div className="osas-account-buttons"><button type="submit" className="osas-primary" disabled={busy}>Save Username</button><button type="button" disabled={busy} onClick={()=>{setEditingUsername(false);setCurrentPassword('')}}>Cancel</button></div>
      </form>}
      <div className="osas-account-password">
        {!editingPassword&&<button className="osas-primary" type="button" onClick={()=>{setError('');setMessage('');setCurrentPassword('');setEditingPassword(true);setEditingUsername(false)}}>Change Password</button>}
        {editingPassword&&<form className="osas-account-form" onSubmit={e=>void savePassword(e)}>
          <label>Current Password<input type="password" required autoComplete="current-password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)}/></label>
          <label>New Password<input type="password" required autoComplete="new-password" value={newPassword} onChange={e=>setNewPassword(e.target.value)}/></label>
          <label>Confirm New Password<input type="password" required autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)}/></label>
          <div className="osas-account-buttons"><button className="osas-primary" type="submit" disabled={busy}>Save Password</button><button type="button" disabled={busy} onClick={()=>{setEditingPassword(false);setCurrentPassword('');setNewPassword('');setConfirmPassword('')}}>Cancel</button></div>
        </form>}
      </div>
    </section>
  </div>
}
