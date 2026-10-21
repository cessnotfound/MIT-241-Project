const express = require('express')
const YEAR = /^(20\d{2})-(20\d{2})$/
const validYear = value => typeof value === 'string' && YEAR.test(value) && Number(value.slice(5)) === Number(value.slice(0,4)) + 1

function createAcademicYearRouter(pool) {
  const router = express.Router()
  router.get('/current', async (_req, res) => {
    try {
      const { rows } = await pool.query('SELECT academic_year, activated_at FROM public.sas_academic_year_settings WHERE id = 1')
      if (!rows.length) return res.status(503).json({error:'Run academic-year-settings.sql in Supabase before using academic year management.'})
      res.json({ academic_year: rows[0].academic_year, activated_at: rows[0].activated_at })
    } catch (e) { console.error('Academic year current:', e); res.status(503).json({error:'Unable to load academic year. Check database setup.'}) }
  })
  router.put('/current', async (req, res) => {
    if (req.session?.accountRole !== 'OSAS' || !req.session?.osasAccountId) return res.status(401).json({ error: 'OSAS login required' })
    if (req.get('origin') !== (process.env.FRONTEND_ORIGIN || 'http://localhost:5173')) return res.status(403).json({error:'Request origin not allowed'})
    const nextYear = req.body?.academic_year
    if (!validYear(nextYear)) return res.status(400).json({error:'Use an academic year like 2027-2028.'})
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const account = await client.query('SELECT id FROM public.osas_accounts WHERE id=$1 AND is_active=TRUE',[req.session.osasAccountId])
      if (!account.rowCount) { await client.query('ROLLBACK'); return res.status(401).json({error:'OSAS account unavailable'}) }
      const current = await client.query('SELECT academic_year FROM public.sas_academic_year_settings WHERE id=1 FOR UPDATE')
      if (!current.rowCount) { await client.query('ROLLBACK'); return res.status(503).json({error:'Academic year settings table is not initialized'}) }
      const oldYear = current.rows[0].academic_year
      if (nextYear === oldYear) { await client.query('ROLLBACK'); return res.status(409).json({error:'This academic year is already active'}) }
      const expectedYear = `${Number(oldYear.slice(0,4))+1}-${Number(oldYear.slice(5))+1}`
      if (nextYear !== expectedYear) { await client.query('ROLLBACK'); return res.status(409).json({error:`Only the next academic year (${expectedYear}) can be activated. This prevents skipping or reopening archived terms.`}) }
      await client.query('UPDATE public.sas_academic_year_settings SET academic_year=$1,activated_at=NOW(),activated_by=$2 WHERE id=1',[nextYear,req.session.osasAccountId])
      // Existing document management uses organizations.current_academic_year as its write guard.
      await client.query('UPDATE public.organizations SET current_academic_year=$1',[nextYear])
      await client.query('COMMIT')
      res.json({academic_year:nextYear, previous_academic_year:oldYear})
    } catch(e) { await client.query('ROLLBACK').catch(()=>{}); console.error('Academic year activation:',e); res.status(500).json({error:'Unable to activate academic year. No changes were saved.'}) }
    finally { client.release() }
  })
  return router
}

// Stops *all* organization AR and FS writes to a previous academic year, including nested routes.
// GET/HEAD requests remain available for historic viewing/downloads.
function protectArchivedReports(pool) {
  return async function(req,res,next) {
    if (['GET','HEAD','OPTIONS'].includes(req.method)) return next()
    if (!req.session?.accountId) return next() // Existing module handles authentication.
    const isAR = req.path.startsWith('/api/accomplishments/reports')
    const isFS = req.path.startsWith('/api/financial/statements')
    if (!isAR && !isFS) return next()
    try {
      const result=await pool.query('SELECT academic_year FROM public.sas_academic_year_settings WHERE id=1')
      if (!result.rowCount) return res.status(503).json({error:'Academic year settings are not initialized'})
      const activeYear=result.rows[0].academic_year
      const parts=req.path.split('/').filter(Boolean)
      const rootIndex=isAR?parts.indexOf('reports'):parts.indexOf('statements')
      const reportId=parts[rootIndex+1]
      if (!reportId) {
        if (req.body?.academic_year !== activeYear) return res.status(409).json({error:`Only the current academic year (${activeYear}) accepts new reports. Previous terms are view-only.`})
        return next()
      }
      if (!/^[0-9a-f-]{36}$/i.test(reportId)) return next() // Existing handler validates report IDs.
      const sql=isAR
        ? 'SELECT academic_year FROM public.accomplishment_reports WHERE id=$1 AND organization_id=(SELECT organization_id FROM public.organization_accounts WHERE id=$2 AND is_active=TRUE)'
        : 'SELECT academic_year FROM public.financial_statements WHERE id=$1 AND organization_id=(SELECT organization_id FROM public.organization_accounts WHERE id=$2 AND is_active=TRUE)'
      const report=await pool.query(sql,[reportId,req.session.accountId])
      if (!report.rowCount) return next() // Existing route returns its usual 404.
      if (report.rows[0].academic_year !== activeYear) return res.status(409).json({error:`Academic Year ${report.rows[0].academic_year} is archived and view-only. Editing, deleting, submitting, or uploading is no longer allowed.`})
      return next()
    } catch(e) {console.error('Archive write protection:',e);return res.status(503).json({error:'Cannot verify the active academic year; changes have been blocked for safety.'})}
  }
}
module.exports={createAcademicYearRouter,protectArchivedReports}
