const express = require('express')
const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const path = require('node:path')

const YEARS = ['2026-2027', '2025-2026', '2024-2025', '2023-2024', '2022-2023']
const ROLES = ['INITIATED', 'PARTICIPATED']
const TYPES = ['CO-CURRICULAR', 'EXTRA-CURRICULAR', 'OUTREACH']
const LEVELS = ['DEPARTMENT', 'COLLEGE', 'UNIVERSITY', 'LOCAL', 'REGIONAL', 'NATIONAL', 'INTERNATIONAL']
const AWARDS = ['LOCAL', 'REGIONAL', 'NATIONAL', 'INTERNATIONAL']
const IMPACTS = ['LOW', 'MODERATE', 'HIGH']
const validId = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const clean = (value, max = 2000) => typeof value === 'string' ? value.trim().slice(0, max) : ''
const optional = (value, max) => clean(value, max) || null
const validDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
const choice = (value, values, required = false) => (!value && !required) || values.includes(value)
const number = (value) => value === '' || value === null || value === undefined ? null : Number(value)
const fail = (res, message) => res.status(400).json({ error: message })

module.exports = function createAccomplishmentRouter(pool) {
  const router = express.Router()
  router.use(async (req, res, next) => {
    if (!req.session?.accountId) return res.status(401).json({ error: 'Not authenticated' })
    try {
      const result = await pool.query('SELECT organization_id FROM public.organization_accounts WHERE id=$1 AND is_active=TRUE', [req.session.accountId])
      if (!result.rowCount) return res.status(401).json({ error: 'Account unavailable' })
      req.organizationId = result.rows[0].organization_id
      next()
    } catch (error) { console.error('Accomplishment auth:', error.message); res.status(500).json({ error: 'Authentication failed' }) }
  })
  router.use((req, res, next) => {
    if (['GET', 'HEAD'].includes(req.method)) return next()
    if (req.get('origin') !== (process.env.FRONTEND_ORIGIN || 'http://localhost:5173')) return res.status(403).json({ error: 'Request origin not allowed' })
    next()
  })

  const withReport = async (req, res) => {
    if (!validId(req.params.id)) { fail(res, 'Invalid report ID'); return null }
    const result = await pool.query('SELECT * FROM public.accomplishment_reports WHERE id=$1 AND organization_id=$2', [req.params.id, req.organizationId])
    if (!result.rowCount) { res.status(404).json({ error: 'Report not found' }); return null }
    return result.rows[0]
  }
  const editable = (report, res) => {
    if (['DRAFT', 'RETURNED'].includes(report.status)) return true
    res.status(409).json({ error: 'Only draft or returned reports can be edited' })
    return false
  }
  const crash = (res, error) => { console.error('Accomplishment error:', error.message); res.status(500).json({ error: 'Unable to process request' }) }

  router.get('/reports', async (req, res) => {
    try {
      const result = await pool.query(`SELECT r.*,
        (SELECT COUNT(*)::int FROM public.accomplishment_activities a WHERE a.report_id=r.id) AS activity_count,
        (SELECT COUNT(*)::int FROM public.accomplishment_tangible_projects p WHERE p.report_id=r.id) AS project_count
        FROM public.accomplishment_reports r WHERE organization_id=$1 ORDER BY academic_year DESC`, [req.organizationId])
      res.json(result.rows)
    } catch (e) { crash(res, e) }
  })
  router.post('/reports', async (req, res) => {
    const year = req.body?.academic_year
    if (!YEARS.includes(year)) return fail(res, 'Select an available academic year')
    try {
      const result = await pool.query(`INSERT INTO public.accomplishment_reports (organization_id,academic_year,reference_number)
        VALUES ($1,$2,$3) ON CONFLICT (organization_id,academic_year) DO NOTHING RETURNING *`,
        [req.organizationId, year, `AR-${year}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`])
      if (!result.rowCount) return res.status(409).json({ error: 'Report already exists for this academic year' })
      res.status(201).json(result.rows[0])
    } catch (e) { crash(res, e) }
  })
  router.get('/reports/:id', async (req, res) => {
    try {
      const report = await withReport(req, res)
      if (!report) return
      const [activities, projects, scoring] = await Promise.all([
        pool.query('SELECT * FROM public.accomplishment_activities WHERE report_id=$1 ORDER BY created_at DESC', [report.id]),
        pool.query('SELECT * FROM public.accomplishment_tangible_projects WHERE report_id=$1 ORDER BY created_at DESC', [report.id]),
        pool.query('SELECT * FROM public.accomplishment_scoring_options ORDER BY scoring_group,raw_points', []),
      ])
      const comments=await pool.query(`SELECT c.id,c.comment_text,c.created_at,COALESCE(o.full_name,'OSAS') AS sender FROM public.osas_ar_comments c LEFT JOIN public.osas_accounts o ON o.id=c.osas_account_id WHERE c.report_id=$1 ORDER BY c.created_at,c.id`,[report.id]);res.json({ report, activities: activities.rows, projects: projects.rows, scoring: scoring.rows, osas_comments: comments.rows, review: (await pool.query('SELECT status,returned_at,approved_at FROM public.osas_ar_reviews WHERE report_id=$1',[report.id])).rows[0]||null })
    } catch (e) { crash(res, e) }
  })
  router.delete('/reports/:id', async (req, res) => {
    try {
      const report = await withReport(req, res)
      if (!report || !editable(report, res)) return
      await pool.query('DELETE FROM public.accomplishment_reports WHERE id=$1 AND organization_id=$2', [report.id, req.organizationId])
      res.json({ success: true })
    } catch (e) { crash(res, e) }
  })
  router.post('/reports/:id/submit', async (req, res) => {
    try {
      const report = await withReport(req, res)
      if (!report || !editable(report, res)) return
      const updated = await pool.query(`UPDATE public.accomplishment_reports SET status='SUBMITTED', submitted_at=NOW(), updated_at=NOW()
        WHERE id=$1 AND organization_id=$2 RETURNING *`, [report.id, req.organizationId])
      res.json(updated.rows[0])
    } catch (e) { crash(res, e) }
  })

  function activityInput(body) {
    const b = body || {}
    if (!clean(b.activity_name, 250) || !choice(b.role, ROLES, true) || !choice(b.activity_level, LEVELS, true) ||
        !choice(b.activity_type, TYPES) || (b.role === 'INITIATED' && !b.activity_type) ||
        !choice(b.award_level, AWARDS) || !validDate(b.start_date) || !validDate(b.end_date) || b.end_date < b.start_date) return null
    const count = number(b.participant_count)
    if (count !== null && (!Number.isInteger(count) || count < 0)) return null
    return [clean(b.activity_name,250), optional(b.description,10000), b.role, b.activity_type || null, b.activity_level,
      b.start_date, b.end_date, optional(b.participants,4000), count, optional(b.award_title,250), b.award_level || null, optional(b.award_placement,100)]
  }
  router.post('/reports/:id/activities', async (req, res) => {
    const values = activityInput(req.body)
    if (!values) return fail(res, 'Check required activity fields, choices and dates')
    try {
      const report = await withReport(req, res)
      if (!report || !editable(report,res)) return
      const r = await pool.query(`INSERT INTO public.accomplishment_activities
        (report_id,activity_name,description,role,activity_type,activity_level,start_date,end_date,participants,participant_count,award_title,award_level,award_placement)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`, [report.id,...values])
      res.status(201).json(r.rows[0])
    } catch(e) { crash(res,e) }
  })
  router.put('/reports/:id/activities/:itemId', async (req, res) => {
    if (!validId(req.params.itemId)) return fail(res, 'Invalid activity ID')
    const values = activityInput(req.body)
    if (!values) return fail(res, 'Check required activity fields and inclusive dates')
    try {
      const report = await withReport(req, res)
      if (!report || !editable(report, res)) return
      const result = await pool.query(`UPDATE public.accomplishment_activities SET
        activity_name=$3, description=$4, role=$5, activity_type=$6, activity_level=$7,
        start_date=$8, end_date=$9, participants=$10, participant_count=$11,
        award_title=$12, award_level=$13, award_placement=$14, updated_at=NOW()
        WHERE report_id=$1 AND id=$2 RETURNING *`, [report.id, req.params.itemId, ...values])
      if (!result.rowCount) return res.status(404).json({ error: 'Activity not found' })
      res.json(result.rows[0])
    } catch (e) { crash(res, e) }
  })

  // Photos are stored on the server and served only to the owning organization.
  // Upload raw JPEG/PNG/WebP bytes; do not accept caller-controlled file paths.
  const photoUpload = express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '5mb' })
  const photoFolder = path.join(__dirname, 'uploads', 'accomplishments')
  async function ownedActivity(req, res) {
    if (!validId(req.params.itemId)) { fail(res, 'Invalid activity ID'); return null }
    const report = await withReport(req, res)
    if (!report) return null
    const activity = await pool.query('SELECT id FROM public.accomplishment_activities WHERE id=$1 AND report_id=$2', [req.params.itemId, report.id])
    if (!activity.rowCount) { res.status(404).json({ error: 'Activity not found' }); return null }
    return { report, activityId: activity.rows[0].id }
  }
  router.get('/reports/:id/activities/:itemId/photos', async (req, res) => {
    try {
      const owned = await ownedActivity(req, res)
      if (!owned) return
      const result = await pool.query(`SELECT id, file_name, caption, mime_type, uploaded_at FROM public.accomplishment_attachments
        WHERE activity_id=$1 AND file_kind='PHOTO' ORDER BY uploaded_at`, [owned.activityId])
      res.json(result.rows)
    } catch (e) { crash(res, e) }
  })
  router.post('/reports/:id/activities/:itemId/photos', photoUpload, async (req, res) => {
    try {
      const owned = await ownedActivity(req, res)
      if (!owned || !editable(owned.report, res)) return
      const mime = req.get('content-type')?.split(';')[0]?.toLowerCase()
      const bytes = req.body
      if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 5 * 1024 * 1024) return fail(res, 'Choose an image up to 5 MB')
      // Validate binary signatures, not merely the Content-Type header.
      const jpg = bytes.length >= 3 && bytes[0]===0xff && bytes[1]===0xd8 && bytes[2]===0xff
      const png = bytes.length >= 8 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      const webp = bytes.length >= 12 && bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP'
      const matches = (mime==='image/jpeg'&&jpg)||(mime==='image/png'&&png)||(mime==='image/webp'&&webp)
      if (!matches) return fail(res, 'Only valid JPG, PNG, or WebP images are allowed')
      const ext = mime==='image/jpeg'?'jpg':mime==='image/png'?'png':'webp'
      const stored = `${crypto.randomUUID()}.${ext}`
      await fs.mkdir(photoFolder, { recursive: true })
      const filePath = path.join(photoFolder, stored)
      await fs.writeFile(filePath, bytes, { flag: 'wx' })
      try {
        const result = await pool.query(`INSERT INTO public.accomplishment_attachments
          (activity_id,file_name,file_path,mime_type,file_size_bytes,file_kind,caption)
          VALUES ($1,$2,$3,$4,$5,'PHOTO',$6) RETURNING id,file_name,caption,mime_type,uploaded_at`,
          [owned.activityId, `activity-photo.${ext}`, stored, mime, bytes.length, optional(req.get('x-photo-caption'),300)])
        res.status(201).json(result.rows[0])
      } catch (e) { await fs.unlink(filePath).catch(()=>{}); throw e }
    } catch (e) { crash(res, e) }
  })
  router.get('/reports/:id/activities/:itemId/photos/:photoId', async (req, res) => {
    if (!validId(req.params.photoId)) return fail(res, 'Invalid photo ID')
    try {
      const owned = await ownedActivity(req, res)
      if (!owned) return
      const result = await pool.query(`SELECT file_path,mime_type FROM public.accomplishment_attachments
        WHERE id=$1 AND activity_id=$2 AND file_kind='PHOTO'`,[req.params.photoId,owned.activityId])
      if (!result.rowCount) return res.status(404).json({ error: 'Photo not found' })
      const file = result.rows[0]
      if (!/^[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(file.file_path)) return res.status(404).end()
      const bytes=await fs.readFile(path.join(photoFolder,file.file_path))
      res.set('Content-Type', file.mime_type)
      res.set('Cache-Control', 'private, no-store')
      res.set('X-Content-Type-Options','nosniff')
      res.send(bytes)
    } catch (e) { if(e.code==='ENOENT') return res.status(404).json({error:'Photo file missing'}); crash(res,e) }
  })
  // Supporting documents are stored privately alongside activity photos.
  // PDF, DOCX and supported images only; never trust filenames as filesystem paths.
  const docUpload = express.raw({type:()=>true,limit:'10mb'})
  const documentFolder=path.join(__dirname,'uploads','accomplishment-documents')
  // Linked evidence from Document Management (no duplicate file upload).
  router.get('/reports/:id/document-library', async(req,res)=>{
    try {
      const report=await withReport(req,res);if(!report)return
      const rows=await pool.query(`
        SELECT f.id, f.file_name, f.document_type, a.activity_title, a.resolution_number,
               'activity'::text AS source_kind, a.id AS source_activity_id
        FROM public.document_activity_files f
        JOIN public.document_activities a ON a.id=f.activity_id
        WHERE a.organization_id=$1 AND a.academic_year=$2
        UNION ALL
        SELECT d.id,d.file_name,d.category,d.title,NULL::integer,
               'repository'::text,NULL::uuid
        FROM public.organization_documents d
        WHERE d.organization_id=$1 AND d.academic_year=$2
        ORDER BY activity_title,file_name`,[req.organizationId,report.academic_year])
      res.json(rows.rows)
    }catch(e){crash(res,e)}
  })
  router.get('/reports/:id/activities/:itemId/linked-documents',async(req,res)=>{
    try {
      const owned=await ownedActivity(req,res);if(!owned)return
      const rows=await pool.query(`SELECT l.id,l.source_kind,l.source_file_id,
        COALESCE(f.file_name,d.file_name) AS file_name,
        COALESCE(f.document_type,d.category) AS document_type,
        a.id AS source_activity_id, a.resolution_number, a.activity_title
        FROM public.accomplishment_document_links l
        LEFT JOIN public.document_activity_files f ON l.source_kind='activity' AND f.id=l.activity_file_id
        LEFT JOIN public.document_activities a ON a.id=f.activity_id
        LEFT JOIN public.organization_documents d ON l.source_kind='repository' AND d.id=l.repository_document_id
        WHERE l.accomplishment_activity_id=$1 ORDER BY l.created_at DESC`,[owned.activityId])
      res.json(rows.rows)
    }catch(e){crash(res,e)}
  })
  router.post('/reports/:id/activities/:itemId/linked-documents',async(req,res)=>{
    const kind=req.body?.source_kind,sourceId=req.body?.source_file_id
    if(!['activity','repository'].includes(kind)||!validId(sourceId))return fail(res,'Select a valid document')
    try {
      const owned=await ownedActivity(req,res);if(!owned||!editable(owned.report,res))return
      const source=kind==='activity'?
        await pool.query(`SELECT f.id FROM public.document_activity_files f JOIN public.document_activities a ON a.id=f.activity_id WHERE f.id=$1 AND a.organization_id=$2 AND a.academic_year=$3`,[sourceId,req.organizationId,owned.report.academic_year]):
        await pool.query(`SELECT id FROM public.organization_documents WHERE id=$1 AND organization_id=$2 AND academic_year=$3`,[sourceId,req.organizationId,owned.report.academic_year])
      if(!source.rowCount)return res.status(404).json({error:'Document not found in this academic year'})
      const result=await pool.query(`INSERT INTO public.accomplishment_document_links
        (accomplishment_activity_id,source_kind,activity_file_id,repository_document_id)
        VALUES($1,$2,$3,$4)
        ON CONFLICT DO NOTHING RETURNING id`,[owned.activityId,kind,kind==='activity'?sourceId:null,kind==='repository'?sourceId:null])
      res.status(result.rowCount?201:200).json({success:true})
    }catch(e){crash(res,e)}
  })
  router.delete('/reports/:id/activities/:itemId/linked-documents/:linkId',async(req,res)=>{
    if(!validId(req.params.linkId))return fail(res,'Invalid link ID')
    try {
      const owned=await ownedActivity(req,res);if(!owned||!editable(owned.report,res))return
      const result=await pool.query(`DELETE FROM public.accomplishment_document_links WHERE id=$1 AND accomplishment_activity_id=$2 RETURNING id`,[req.params.linkId,owned.activityId])
      if(!result.rowCount)return res.status(404).json({error:'Link not found'})
      res.json({success:true})
    }catch(e){crash(res,e)}
  })
  async function ownedProjectLink(req,res){
    if(!validId(req.params.itemId)){fail(res,'Invalid project ID');return null}
    const report=await withReport(req,res);if(!report)return null
    const row=await pool.query('SELECT id FROM public.accomplishment_tangible_projects WHERE id=$1 AND report_id=$2',[req.params.itemId,report.id])
    if(!row.rowCount){res.status(404).json({error:'Project not found'});return null}
    return {report,projectId:row.rows[0].id}
  }
  router.get('/reports/:id/projects/:itemId/linked-documents',async(req,res)=>{
    try {
      const owned=await ownedProjectLink(req,res);if(!owned)return
      const rows=await pool.query(`SELECT l.id,l.source_kind,l.source_file_id,
        COALESCE(f.file_name,d.file_name) AS file_name,
        COALESCE(f.document_type,d.category) AS document_type,
        a.id AS source_activity_id, a.resolution_number, a.activity_title
        FROM public.accomplishment_project_document_links l
        LEFT JOIN public.document_activity_files f ON l.source_kind='activity' AND f.id=l.activity_file_id
        LEFT JOIN public.document_activities a ON a.id=f.activity_id
        LEFT JOIN public.organization_documents d ON l.source_kind='repository' AND d.id=l.repository_document_id
        WHERE l.accomplishment_project_id=$1 ORDER BY l.created_at DESC`,[owned.projectId])
      res.json(rows.rows)
    }catch(e){crash(res,e)}
  })
  router.post('/reports/:id/projects/:itemId/linked-documents',async(req,res)=>{
    const kind=req.body?.source_kind,sourceId=req.body?.source_file_id
    if(!['activity','repository'].includes(kind)||!validId(sourceId))return fail(res,'Select a valid document')
    try {
      const owned=await ownedProjectLink(req,res);if(!owned||!editable(owned.report,res))return
      const source=kind==='activity'?
        await pool.query(`SELECT f.id FROM public.document_activity_files f JOIN public.document_activities a ON a.id=f.activity_id WHERE f.id=$1 AND a.organization_id=$2 AND a.academic_year=$3`,[sourceId,req.organizationId,owned.report.academic_year]):
        await pool.query(`SELECT id FROM public.organization_documents WHERE id=$1 AND organization_id=$2 AND academic_year=$3`,[sourceId,req.organizationId,owned.report.academic_year])
      if(!source.rowCount)return res.status(404).json({error:'Document not found in this academic year'})
      const result=await pool.query(`INSERT INTO public.accomplishment_project_document_links
        (accomplishment_project_id,source_kind,activity_file_id,repository_document_id)
        VALUES($1,$2,$3,$4)
        ON CONFLICT DO NOTHING RETURNING id`,[owned.projectId,kind,kind==='activity'?sourceId:null,kind==='repository'?sourceId:null])
      res.status(result.rowCount?201:200).json({success:true})
    }catch(e){crash(res,e)}
  })
  router.delete('/reports/:id/projects/:itemId/linked-documents/:linkId',async(req,res)=>{
    if(!validId(req.params.linkId))return fail(res,'Invalid link ID')
    try {
      const owned=await ownedProjectLink(req,res);if(!owned||!editable(owned.report,res))return
      const result=await pool.query(`DELETE FROM public.accomplishment_project_document_links WHERE id=$1 AND accomplishment_project_id=$2 RETURNING id`,[req.params.linkId,owned.projectId])
      if(!result.rowCount)return res.status(404).json({error:'Link not found'})
      res.json({success:true})
    }catch(e){crash(res,e)}
  })
  router.get('/reports/:id/activities/:itemId/documents',async(req,res)=>{
    try{
      const owned=await ownedActivity(req,res);if(!owned)return
      const r=await pool.query(`SELECT id,file_name,caption,mime_type,file_kind,uploaded_at FROM public.accomplishment_attachments WHERE activity_id=$1 AND file_kind='DOCUMENT' ORDER BY uploaded_at`,[owned.activityId])
      res.json(r.rows)
    }catch(e){crash(res,e)}
  })
  router.post('/reports/:id/activities/:itemId/documents',docUpload,async(req,res)=>{
    try{
      const owned=await ownedActivity(req,res);if(!owned||!editable(owned.report,res))return
      const b=req.body
      if(!Buffer.isBuffer(b)||!b.length||b.length>10*1024*1024)return fail(res,'Maximum document size is 10 MB')
      const mime=req.get('content-type')?.split(';')[0]?.toLowerCase()
      const pdf=b.subarray(0,5).toString()==='%PDF-'
      const docx=b.subarray(0,4).equals(Buffer.from([0x50,0x4b,0x03,0x04]))
      const jpg=b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255
      const png=b.length>=8&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      const webp=b.length>=12&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP'
      const types={'application/pdf':['pdf',pdf], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':['docx',docx], 'image/jpeg':['jpg',jpg], 'image/png':['png',png], 'image/webp':['webp',webp]}
      const match=types[mime]
      if(!match||!match[1])return fail(res,'Upload a valid PDF, DOCX, JPG, PNG or WebP file')
      // Limit ZIP-derived DOCX uploads to the Office Open XML content types by client declaration.
      let original='supporting-document.'+match[0]
      try {original=decodeURIComponent(req.get('x-file-name')||original)} catch {}
      original=path.basename(original).replace(/[\\/\x00-\x1f]/g,'_').slice(0,180)||'supporting-document.'+match[0]
      if(!original.toLowerCase().endsWith('.'+match[0]))original+='.'+match[0]
      const stored=crypto.randomUUID()+'.'+match[0]
      await fs.mkdir(documentFolder,{recursive:true})
      await fs.writeFile(path.join(documentFolder,stored),b,{flag:'wx'})
      try{
        const r=await pool.query(`INSERT INTO public.accomplishment_attachments(activity_id,file_name,file_path,mime_type,file_size_bytes,file_kind) VALUES($1,$2,$3,$4,$5,'DOCUMENT') RETURNING id,file_name,mime_type,file_kind,uploaded_at`,[owned.activityId,original,stored,mime,b.length])
        res.status(201).json(r.rows[0])
      }catch(e){await fs.unlink(path.join(documentFolder,stored)).catch(()=>{});throw e}
    }catch(e){crash(res,e)}
  })
  router.get('/reports/:id/activities/:itemId/documents/:documentId',async(req,res)=>{
    if(!validId(req.params.documentId))return fail(res,'Invalid document ID')
    try{
      const owned=await ownedActivity(req,res);if(!owned)return
      const r=await pool.query(`SELECT file_path,file_name,mime_type FROM public.accomplishment_attachments WHERE id=$1 AND activity_id=$2 AND file_kind='DOCUMENT'`,[req.params.documentId,owned.activityId])
      if(!r.rowCount)return res.status(404).json({error:'Document not found'})
      const f=r.rows[0]
      if(!/^[0-9a-f-]{36}\.(pdf|docx|jpg|png|webp)$/i.test(f.file_path))return res.status(404).end()
      const data=await fs.readFile(path.join(documentFolder,f.file_path))
      res.set('Content-Type',f.mime_type)
      res.set('Cache-Control','private, no-store')
      res.set('X-Content-Type-Options','nosniff')
      res.set('Content-Disposition',`${f.mime_type==='application/pdf'?'inline':'attachment'}; filename="${f.file_name.replace(/["\r\n]/g,'_')}"`)
      res.send(data)
    }catch(e){if(e.code==='ENOENT')return res.status(404).json({error:'Document file missing'});crash(res,e)}
  })
  router.delete('/reports/:id/activities/:itemId/documents/:documentId',async(req,res)=>{
    if(!validId(req.params.documentId))return fail(res,'Invalid document ID')
    try{
      const owned=await ownedActivity(req,res);if(!owned||!editable(owned.report,res))return
      const r=await pool.query(`DELETE FROM public.accomplishment_attachments WHERE id=$1 AND activity_id=$2 AND file_kind='DOCUMENT' RETURNING file_path`,[req.params.documentId,owned.activityId])
      if(!r.rowCount)return res.status(404).json({error:'Document not found'})
      if(/^[0-9a-f-]{36}\.(pdf|docx|jpg|png|webp)$/i.test(r.rows[0].file_path))await fs.unlink(path.join(documentFolder,r.rows[0].file_path)).catch(()=>{})
      res.json({success:true})
    }catch(e){crash(res,e)}
  })
  router.delete('/reports/:id/activities/:itemId/photos/:photoId', async (req, res) => {
    if (!validId(req.params.photoId)) return fail(res, 'Invalid photo ID')
    try {
      const owned = await ownedActivity(req,res)
      if (!owned || !editable(owned.report,res)) return
      const result=await pool.query(`DELETE FROM public.accomplishment_attachments WHERE id=$1 AND activity_id=$2 AND file_kind='PHOTO' RETURNING file_path`,[req.params.photoId,owned.activityId])
      if(!result.rowCount) return res.status(404).json({error:'Photo not found'})
      const stored=result.rows[0].file_path
      if (/^[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(stored)) await fs.unlink(path.join(photoFolder,stored)).catch(()=>{})
      res.json({success:true})
    } catch(e){ crash(res,e) }
  })

  router.delete('/reports/:id/activities/:itemId' , async (req,res) => {
    if (!validId(req.params.itemId)) return fail(res,'Invalid activity ID')
    try {
      const report=await withReport(req,res)
      if (!report || !editable(report,res)) return
      const r=await pool.query('DELETE FROM public.accomplishment_activities WHERE id=$1 AND report_id=$2 RETURNING id',[req.params.itemId, report.id])
      if (!r.rowCount) return res.status(404).json({error:'Activity not found'})
      res.json({success:true})
    } catch(e) {crash(res,e)}
  })
  function projectInput(body) {
    const b=body||{}
    if(!clean(b.project_name,250)||!choice(b.impact_level,IMPACTS) || (b.start_date && !validDate(b.start_date)) ||
      (b.end_date && !validDate(b.end_date)) || (b.start_date && b.end_date && b.end_date < b.start_date)) return null
    const count=number(b.participant_count), cost=number(b.estimated_cost)
    if(count!==null&&(!Number.isInteger(count)||count<0)) return null
    if(cost!==null&&(!Number.isFinite(cost)||cost<0)) return null
    return [clean(b.project_name,250),optional(b.description,10000),b.start_date||null,b.end_date||null,
      optional(b.participants,4000),count,optional(b.beneficiaries,4000),optional(b.outcomes,10000),
      b.impact_level||null,optional(b.cost_benefit_analysis,10000),cost]
  }
  router.post('/reports/:id/projects', async(req,res)=>{
    const values=projectInput(req.body)
    if(!values) return fail(res,'Check project name, impact, dates and numbers')
    try {
      const report=await withReport(req,res)
      if(!report||!editable(report,res)) return
      const r=await pool.query(`INSERT INTO public.accomplishment_tangible_projects
        (report_id,project_name,description,start_date,end_date,participants,participant_count,beneficiaries,outcomes,impact_level,cost_benefit_analysis,estimated_cost)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,[report.id,...values])
      res.status(201).json(r.rows[0])
    }catch(e){crash(res,e)}
  })
  // Existing Organization View edits tangible projects using PUT. Keep this route
  // aligned with the validated POST fields and with the report ownership guard.
  router.put('/reports/:id/projects/:itemId', async(req,res)=>{
    if(!validId(req.params.itemId))return fail(res,'Invalid project ID')
    const values=projectInput(req.body)
    if(!values)return fail(res,'Check project name, impact, dates and numbers')
    try{
      const report=await withReport(req,res)
      if(!report||!editable(report,res))return
      const r=await pool.query(`UPDATE public.accomplishment_tangible_projects SET
        project_name=$3,description=$4,start_date=$5,end_date=$6,participants=$7,
        participant_count=$8,beneficiaries=$9,outcomes=$10,impact_level=$11,
        cost_benefit_analysis=$12,estimated_cost=$13
        WHERE id=$1 AND report_id=$2 RETURNING *`,[req.params.itemId,report.id,...values])
      if(!r.rowCount)return res.status(404).json({error:'Tangible project not found'})
      res.json(r.rows[0])
    }catch(e){crash(res,e)}
  })
  // Tangible project attachments use the same private folders and constraints as activities.
  for(const kind of ['photos','documents']){
    const isPhoto=kind==='photos',fileKind=isPhoto?'PHOTO':'DOCUMENT'
    const folder=isPhoto?photoFolder:documentFolder
    const uploader=express.raw({type:()=>true,limit:isPhoto?'5mb':'10mb'})
    router.get(`/reports/:id/projects/:itemId/${kind}`,async(req,res)=>{
      try{
        const owned=await ownedProjectLink(req,res);if(!owned)return
        const r=await pool.query('SELECT id,file_name,caption,mime_type,file_kind,uploaded_at FROM public.accomplishment_attachments WHERE tangible_project_id=$1 AND file_kind=$2 ORDER BY uploaded_at',[owned.projectId,fileKind])
        res.json(r.rows)
      }catch(e){crash(res,e)}
    })
    router.post(`/reports/:id/projects/:itemId/${kind}`,uploader,async(req,res)=>{
      try{
        const owned=await ownedProjectLink(req,res);if(!owned||!editable(owned.report,res))return
        const b=req.body,mime=req.get('content-type')?.split(';')[0]?.toLowerCase()
        if(!Buffer.isBuffer(b)||!b.length||b.length>(isPhoto?5:10)*1024*1024)return fail(res,'Invalid attachment size')
        const jpg=b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255
        const png=b.length>=8&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
        const webp=b.length>=12&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP'
        const pdf=b.subarray(0,5).toString()==='%PDF-'
        const docx=b.length>=4&&b.subarray(0,4).equals(Buffer.from([80,75,3,4]))
        const types={'image/jpeg':['jpg',jpg],'image/png':['png',png],'image/webp':['webp',webp]}
        if(!isPhoto){types['application/pdf']=['pdf',pdf];types['application/vnd.openxmlformats-officedocument.wordprocessingml.document']=['docx',docx]}
        const match=types[mime]
        if(!match||!match[1])return fail(res,isPhoto?'Only JPG, PNG and WebP photos are accepted':'Upload a valid PDF, DOCX, JPG, PNG or WebP file')
        let original=`project-${isPhoto?'photo':'document'}.${match[0]}`
        try{original=decodeURIComponent(req.get('x-file-name')||original)}catch{}
        original=path.basename(original).replace(/[\\/\x00-\x1f]/g,'_').slice(0,180)||`project-attachment.${match[0]}`
        if(!original.toLowerCase().endsWith('.'+match[0]))original+='.'+match[0]
        const stored=crypto.randomUUID()+'.'+match[0]
        await fs.mkdir(folder,{recursive:true})
        await fs.writeFile(path.join(folder,stored),b,{flag:'wx'})
        try{
          const r=await pool.query(`INSERT INTO public.accomplishment_attachments(tangible_project_id,file_name,file_path,mime_type,file_size_bytes,file_kind)
            VALUES($1,$2,$3,$4,$5,$6) RETURNING id,file_name,caption,mime_type,file_kind,uploaded_at`,[owned.projectId,original,stored,mime,b.length,fileKind])
          res.status(201).json(r.rows[0])
        }catch(e){await fs.unlink(path.join(folder,stored)).catch(()=>{});throw e}
      }catch(e){crash(res,e)}
    })
    router.get(`/reports/:id/projects/:itemId/${kind}/:fileId`,async(req,res)=>{
      if(!validId(req.params.fileId))return fail(res,'Invalid attachment ID')
      try{
        const owned=await ownedProjectLink(req,res);if(!owned)return
        const r=await pool.query('SELECT file_path,file_name,mime_type FROM public.accomplishment_attachments WHERE id=$1 AND tangible_project_id=$2 AND file_kind=$3',[req.params.fileId,owned.projectId,fileKind])
        if(!r.rowCount)return res.status(404).end()
        const f=r.rows[0],filename=path.basename(f.file_path)
        if(!/^[0-9a-f-]{36}\.(pdf|docx|jpg|png|webp)$/i.test(filename))return res.status(404).end()
        const bytes=await fs.readFile(path.join(folder,filename))
        res.set('Content-Type',f.mime_type)
        res.set('X-Content-Type-Options','nosniff')
        res.set('Cache-Control','private,no-store')
        res.set('Content-Disposition',`${isPhoto||f.mime_type==='application/pdf'?'inline':'attachment'}; filename="${String(f.file_name).replace(/["\r\n]/g,'_')}"`)
        res.send(bytes)
      }catch(e){if(e.code==='ENOENT')return res.status(404).end();crash(res,e)}
    })
    router.delete(`/reports/:id/projects/:itemId/${kind}/:fileId`,async(req,res)=>{
      if(!validId(req.params.fileId))return fail(res,'Invalid attachment ID')
      try{
        const owned=await ownedProjectLink(req,res);if(!owned||!editable(owned.report,res))return
        const r=await pool.query('DELETE FROM public.accomplishment_attachments WHERE id=$1 AND tangible_project_id=$2 AND file_kind=$3 RETURNING file_path',[req.params.fileId,owned.projectId,fileKind])
        if(!r.rowCount)return res.status(404).json({error:'Attachment not found'})
        const filename=path.basename(r.rows[0].file_path)
        if(/^[0-9a-f-]{36}\.(pdf|docx|jpg|png|webp)$/i.test(filename))await fs.unlink(path.join(folder,filename)).catch(()=>{})
        res.json({success:true})
      }catch(e){crash(res,e)}
    })
  }
  router.delete('/reports/:id/projects/:itemId',async(req,res)=>{
    if(!validId(req.params.itemId)) return fail(res,'Invalid project ID')
    try {
      const report=await withReport(req,res)
      if(!report||!editable(report,res)) return
      const r=await pool.query('DELETE FROM public.accomplishment_tangible_projects WHERE id=$1 AND report_id=$2 RETURNING id',[req.params.itemId,report.id])
      if(!r.rowCount) return res.status(404).json({error:'Project not found'})
      res.json({success:true})
    }catch(e){crash(res,e)}
  })
  return router
}
