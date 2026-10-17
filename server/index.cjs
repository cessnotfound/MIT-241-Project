
const express = require('express')
const session = require('express-session')
const { rateLimit } = require('express-rate-limit')
const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const path = require('node:path')

const pool = require('./db.cjs')
const createStructureRouter = require('./structure-routes.cjs')
const createRenewalRouter = require('./renewal-routes.cjs')
const createAccomplishmentRouter = require('./accomplishment-routes.cjs')
const createFinancialRouter = require('./financial-routes.cjs')
const createDocumentRouter = require('./document-routes.cjs')
const createOsasProfileRoutes = require('./osas-profile-routes.cjs')
const createOsasArRouter = require('./osas-ar-routes.cjs')
const createOsasFinancialRouter = require('./osas-fs-routes.cjs')

const app = express()
const PORT = Number(process.env.PORT || 3001)
const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN || 'http://localhost:5173'

const uploadDirectory = path.join(__dirname, 'uploads')

app.disable('x-powered-by')

app.use(express.json({ limit: '20kb' }))

if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is missing from .env.server')
}

app.use(
  session({
    name: 'sas_session',
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 8 * 60 * 60 * 1000,
    },
  })
)

function checkOrigin(req, res, next) {
  if (req.get('origin') !== FRONTEND_ORIGIN) {
    return res.status(403).json({
      error: 'Request origin is not allowed',
    })
  }

  next()
}

async function requireOrganization(req, res, next) {
  if (!req.session?.accountId || req.session.accountRole === 'OSAS') {
    return res.status(401).json({
      error: 'Organization login required',
    })
  }

  try {
    const result = await pool.query(
      `
      SELECT organization_id
      FROM public.organization_accounts
      WHERE id = $1
        AND is_active = TRUE
      LIMIT 1
      `,
      [req.session.accountId]
    )

    if (!result.rows.length) {
      return res.status(401).json({
        error: 'Account unavailable',
      })
    }

    req.organizationId = result.rows[0].organization_id
    next()
  } catch (error) {
    console.error('Authentication error:', error.message)

    res.status(500).json({
      error: 'Authentication check failed',
    })
  }
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
})

const accountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
})

// =============================================
// DATABASE HEALTH
// =============================================

app.get('/api/health', async (_req, res) => {
  try {
    const result = await pool.query(
      'SELECT NOW() AS database_time'
    )

    res.json({
      success: true,
      message: 'SAS Portal backend connected to Supabase',
      database_time: result.rows[0].database_time,
    })
  } catch (error) {
    console.error('Database health error:', error.message)

    res.status(500).json({
      error: 'Database connection failed',
    })
  }
})

// =============================================
// LOGIN
// =============================================

app.post(
  '/api/login',
  checkOrigin,
  loginLimiter,
  async (req, res) => {
    const { username, password } = req.body || {}

    if (
      typeof username !== 'string' ||
      typeof password !== 'string' ||
      !/^[a-z0-9][a-z0-9-]{2,49}$/.test(username) ||
      !password ||
      password.length > 1024
    ) {
      return res.status(400).json({
        error: 'Invalid username or password',
      })
    }

    try {
      const result = await pool.query(
        `
        SELECT id, organization_id
        FROM public.organization_accounts
        WHERE username = $1
          AND is_active = TRUE
          AND password_hash =
            extensions.crypt($2, password_hash)
        LIMIT 1
        `,
        [username, password]
      )

      let accountRole = 'ORGANIZATION'
      let account = result.rows[0]

      if (!account) {
        const osasResult = await pool.query(
          `SELECT id FROM public.osas_accounts
           WHERE username = $1 AND is_active = TRUE
             AND password_hash = extensions.crypt($2, password_hash)
           LIMIT 1`,
          [username, password]
        )
        account = osasResult.rows[0]
        accountRole = 'OSAS'
      }

      if (!account) {
        return res.status(401).json({ error: 'Invalid username or password' })
      }

      req.session.regenerate((error) => {
        if (error) {
          return res.status(500).json({
            error: 'Unable to create login session',
          })
        }

        // Use separate session keys so OSAS can never impersonate an
        // organization account, even if the two tables have matching IDs.
        if (accountRole === 'OSAS') {
          req.session.osasAccountId = account.id
        } else {
          req.session.accountId = account.id
        }
        req.session.accountRole = accountRole

        req.session.save((saveError) => {
          if (saveError) {
            return res.status(500).json({
              error: 'Unable to save login session',
            })
          }

          res.json({
            success: true,
            message: 'Login successful',
            role: accountRole,
          })
        })
      })
    } catch (error) {
      console.error('Login error:', error.message)

      res.status(500).json({
        error: 'Login server error',
      })
    }
  }
)

// =============================================
// OSAS IDENTITY (ADMIN FOUNDATION)
// =============================================

app.get('/api/osas/me', async (req, res) => {
  if (req.session?.accountRole !== 'OSAS' || !req.session?.osasAccountId) {
    return res.status(401).json({ error: 'OSAS login required' })
  }
  try {
    const result = await pool.query(
      `SELECT id, username, full_name, is_active,
              (profile_photo_path IS NOT NULL AND profile_photo_path <> '') AS has_profile_photo
       FROM public.osas_accounts
       WHERE id = $1 AND is_active = TRUE LIMIT 1`,
      [req.session.osasAccountId]
    )
    if (!result.rows.length) return res.status(401).json({ error: 'OSAS account unavailable' })
    res.json({ role: 'OSAS', ...result.rows[0] })
  } catch (error) {
    console.error('OSAS identity error:', error.message)
    res.status(500).json({ error: 'Unable to load OSAS account' })
  }
})

// =============================================
// OSAS OVERVIEW & ORGANIZATION DIRECTORY (READ ONLY)
// =============================================
async function requireOsas(req, res, next) {
  if (req.session?.accountRole !== 'OSAS' || !req.session?.osasAccountId) {
    return res.status(401).json({ error: 'OSAS login required' })
  }
  try {
    const active = await pool.query(
      'SELECT 1 FROM public.osas_accounts WHERE id = $1 AND is_active = TRUE',
      [req.session.osasAccountId]
    )
    if (!active.rowCount) return res.status(401).json({ error: 'OSAS account unavailable' })
    next()
  } catch (error) {
    console.error('OSAS authorization:', error.message)
    res.status(500).json({ error: 'Unable to verify OSAS access' })
  }
}

app.use('/api/osas', createOsasProfileRoutes(pool, requireOsas, checkOrigin, accountLimiter, uploadDirectory))

// Scoped academic year is provided by each organization; OSAS sees the
// organization's current year rather than an unrelated global year.
const osasOrganizationsQuery = `
  SELECT o.id, o.organization_name, o.college, o.description,
         (o.profile_photo_path IS NOT NULL AND o.profile_photo_path <> '') AS has_profile_photo,
         o.current_academic_year AS academic_year,
         COALESCE(r.status, 'NOT RENEWED') AS recognition_status,
         COALESCE(o.office_order_number, r.office_order_number) AS office_order_number,
         COALESCE(a.username, '') AS username
  FROM public.organizations o
  LEFT JOIN LATERAL (
    SELECT status, office_order_number
    FROM public.organization_recognitions
    WHERE organization_id = o.id
      AND academic_year = o.current_academic_year
    ORDER BY created_at DESC LIMIT 1
  ) r ON TRUE
  LEFT JOIN LATERAL (
    SELECT username FROM public.organization_accounts
    WHERE organization_id = o.id ORDER BY is_active DESC, id LIMIT 1
  ) a ON TRUE
  ORDER BY o.organization_name ASC
`

// Read-only organization profile photos for authenticated OSAS staff.
// Uses the exact same uploaded file that Organization Profile displays.
app.get('/api/osas/organizations/:id/photo', requireOsas, async (req, res) => {
  try {
    const org = await pool.query(
      'SELECT profile_photo_path FROM public.organizations WHERE id = $1',
      [req.params.id]
    )
    if (!org.rowCount) return res.sendStatus(404)
    const fileName = org.rows[0]?.profile_photo_path
    // Never accept a file path from the browser; only use the stored safe filename.
    if (!fileName || !/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(fileName)) {
      return res.sendStatus(404)
    }
    res.set('Cache-Control', 'private, no-store')
    return res.sendFile(path.join(uploadDirectory, fileName), err => {
      if (err && !res.headersSent) res.sendStatus(404)
    })
  } catch (error) {
    console.error('OSAS organization photo:', error.message)
    if (!res.headersSent) res.sendStatus(404)
  }
})

app.get('/api/osas/organizations', requireOsas, async (_req, res) => {
  try {
    const result = await pool.query(osasOrganizationsQuery)
    res.json({ organizations: result.rows })
  } catch (error) {
    console.error('OSAS organization directory:', error.message)
    res.status(500).json({ error: 'Unable to load organizations' })
  }
})

app.get('/api/osas/overview', requireOsas, async (_req, res) => {
  try {
    const result = await pool.query(osasOrganizationsQuery)
    const organizations = result.rows
    const normalized = (row) => String(row.recognition_status || '').toUpperCase().replace(/[_-]/g, ' ')
    res.json({
      total_organizations: organizations.length,
      renewed: organizations.filter(row => normalized(row) === 'RENEWED').length,
      not_renewed: organizations.filter(row => normalized(row) === 'NOT RENEWED').length,
      organizations: organizations.slice(0, 8),
      pending_applications: Number((await pool.query("SELECT COUNT(*)::int AS total FROM public.renewal_applications WHERE status='SUBMITTED'")).rows[0].total),
    })
  } catch (error) {
    console.error('OSAS overview:', error.message)
    res.status(500).json({ error: 'Unable to load OSAS overview' })
  }
})

// OSAS renewal review (organization's existing six-form records).
const renewalUploadFolder = path.join(__dirname, 'renewal-uploads')
const allowedReviewStatuses = new Set(['SUBMITTED', 'FOR REVISION', 'APPROVED'])

app.get('/api/osas/renewals', requireOsas, async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.id, a.organization_id, a.academic_year, a.status,
             a.submitted_at, o.organization_name, o.college,
             (SELECT COUNT(*)::int FROM public.renewal_forms f
               WHERE f.renewal_application_id = a.id AND f.file_path IS NOT NULL) AS uploaded_forms
      FROM public.renewal_applications a
      JOIN public.organizations o ON o.id = a.organization_id
      ORDER BY a.submitted_at DESC NULLS LAST, o.organization_name
    `)
    res.json({ applications: result.rows })
  } catch (error) {
    console.error('OSAS renewal list:', error.message)
    res.status(500).json({ error: 'Unable to load renewal applications' })
  }
})

app.get('/api/osas/renewals/:id', requireOsas, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.id, a.organization_id, a.academic_year, a.status,
             a.submitted_at, o.organization_name, o.college, o.office_order_number
      FROM public.renewal_applications a
      JOIN public.organizations o ON o.id=a.organization_id WHERE a.id=$1
    `, [req.params.id])
    if (!result.rowCount) return res.status(404).json({ error: 'Application not found' })
    const forms = await pool.query(`
      SELECT form_number, file_name, (file_path IS NOT NULL) AS uploaded,
             status, reviewer_comment FROM public.renewal_forms
      WHERE renewal_application_id=$1 ORDER BY form_number
    `, [req.params.id])
    const history = await pool.query(`
      SELECT c.id, c.form_number, c.comment_text, c.created_at,
             COALESCE(oa.full_name, 'OSAS Administrator') AS author
      FROM public.renewal_form_comments c
      LEFT JOIN public.osas_accounts oa ON oa.id = c.osas_account_id
      WHERE c.renewal_application_id = $1
      ORDER BY c.created_at ASC, c.id ASC
    `, [req.params.id])
    const timeline = await pool.query(`SELECT event_type, form_number, created_at FROM public.renewal_submission_events WHERE renewal_application_id=$1 ORDER BY created_at, id`,[req.params.id])
    res.json({ application: result.rows[0], forms: forms.rows, comments: history.rows, activity:timeline.rows })
  } catch (error) {
    console.error('OSAS renewal details:', error.message)
    res.status(500).json({ error: 'Unable to load application' })
  }
})

app.get('/api/osas/renewals/:id/forms/:number/view', requireOsas, async (req, res) => {
  const formNo = Number(req.params.number)
  if (!Number.isInteger(formNo) || formNo < 1 || formNo > 6) return res.sendStatus(400)
  try {
    const result = await pool.query(`
      SELECT f.file_path FROM public.renewal_forms f
      JOIN public.renewal_applications a ON a.id=f.renewal_application_id
      WHERE a.id=$1 AND f.form_number=$2
    `, [req.params.id, formNo])
    const file = result.rows[0]?.file_path
    if (typeof file !== 'string' || !/^[0-9a-f-]{36}\.(pdf|jpg|png)$/i.test(file)) return res.sendStatus(404)
    const extension = path.extname(file).toLowerCase()
    res.set({
      'Content-Type': { '.pdf':'application/pdf', '.jpg':'image/jpeg', '.png':'image/png' }[extension],
      'Content-Disposition': 'inline', 'Cache-Control':'private, no-store',
      'X-Content-Type-Options':'nosniff'
    })
    res.sendFile(path.join(renewalUploadFolder, file), error => {
      if (error && !res.headersSent) res.status(404).json({ error: 'Document not found' })
    })
  } catch (error) {
    console.error('OSAS renewal file:', error.message)
    if (!res.headersSent) res.status(500).json({ error: 'Unable to open document' })
  }
})

// Append-only OSAS comments. The old reviewer_comment field remains the latest
// comment for compatibility with the existing Organization renewal page.
app.post('/api/osas/renewals/:id/forms/:number/comments', checkOrigin, requireOsas, async (req, res) => {
  const number = Number(req.params.number)
  const comment = req.body?.comment
  if (!Number.isInteger(number) || number < 1 || number > 6 ||
      typeof comment !== 'string' || !comment.trim() || comment.length > 2000) {
    return res.status(400).json({ error: 'Enter a comment of up to 2000 characters.' })
  }
  let client
  try {
    client = await pool.connect()
    await client.query('BEGIN')
    const form = await client.query(`
      SELECT f.form_number FROM public.renewal_forms f
      JOIN public.renewal_applications a ON a.id=f.renewal_application_id
      WHERE a.id=$1 AND f.form_number=$2 AND a.status IN ('SUBMITTED','FOR REVISION') AND f.status='SUBMITTED' AND f.file_path IS NOT NULL
      FOR UPDATE OF f
    `, [req.params.id, number])
    if (!form.rowCount) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'Form is unavailable or the application is not submitted.' })
    }
    const inserted = await client.query(`
      INSERT INTO public.renewal_form_comments
        (renewal_application_id, form_number, osas_account_id, comment_text)
      VALUES ($1, $2, $3, $4) RETURNING id, created_at
    `, [req.params.id, number, req.session.osasAccountId, comment.trim()])
    await client.query(`
      UPDATE public.renewal_forms SET reviewer_comment=$3, updated_at=NOW()
      WHERE renewal_application_id=$1 AND form_number=$2
    `, [req.params.id, number, comment.trim()])
    await client.query('COMMIT')
    res.status(201).json({ success:true, ...inserted.rows[0] })
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(()=>{})
    console.error('OSAS append comment:',error.message)
    res.status(500).json({ error: 'Unable to send comment. Check the comment-history migration.' })
  } finally { if (client) client.release() }
})

// Change review status without replacing or deleting any existing comments.
// Return one specific form for correction, preserving every comment and other form.
app.patch('/api/osas/renewals/:id/forms/:number', checkOrigin, requireOsas, async (req, res) => {
  const number = Number(req.params.number)
  if (!Number.isInteger(number) || number < 1 || number > 6 || req.body?.status !== 'FOR REVISION') {
    return res.status(400).json({ error: 'Only individual form returns are allowed.' })
  }
  let client
  try {
    client = await pool.connect()
    await client.query('BEGIN')
    const form = await client.query(`
      SELECT f.form_number, f.status FROM public.renewal_forms f
      JOIN public.renewal_applications a ON a.id=f.renewal_application_id
      WHERE a.id=$1 AND f.form_number=$2 AND a.status IN ('SUBMITTED','FOR REVISION') AND f.status='SUBMITTED' AND f.file_path IS NOT NULL
      FOR UPDATE OF f, a
    `, [req.params.id, number])
    if (!form.rowCount) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'This form is not available for return.' })
    }
    const reason = await client.query(`
      SELECT 1 FROM public.renewal_form_comments
      WHERE renewal_application_id=$1 AND form_number=$2 LIMIT 1
    `,[req.params.id,number])
    if (!reason.rowCount) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: `Send a comment for Form ${number} explaining the correction before returning it.` })
    }
    await client.query(`UPDATE public.renewal_forms
      SET status='FOR REVISION', updated_at=NOW()
      WHERE renewal_application_id=$1 AND form_number=$2`,[req.params.id,number])
    // The application becomes editable, but other forms and all feedback remain intact.
    await client.query(`UPDATE public.renewal_applications
      SET status='FOR REVISION', updated_at=NOW() WHERE id=$1`,[req.params.id])
    const context = await client.query(`SELECT organization_id, academic_year FROM public.renewal_applications WHERE id=$1`,[req.params.id])
    await client.query(`INSERT INTO public.renewal_submission_events (renewal_application_id,organization_id,academic_year,form_number,event_type,actor_role) VALUES ($1,$2,$3,$4,'RETURNED','OSAS')`,[req.params.id,context.rows[0].organization_id,context.rows[0].academic_year,number])
    await client.query('COMMIT')
    res.json({success:true,message:`Form ${number} returned for correction. The organization may replace it and resubmit.`})
  } catch (error) {
    if(client) await client.query('ROLLBACK').catch(()=>{})
    console.error('OSAS individual form return:',error)
    res.status(500).json({error:'Unable to return this form.'})
  } finally {if(client)client.release()}
})

app.post('/api/osas/renewals/:id/decision', checkOrigin, requireOsas, async (req,res) => {
  const decision = req.body?.decision
  if (decision !== 'ACCEPT') return res.status(400).json({ error: 'Return individual forms using their Return icon.' })
  let client
  try {
    client = await pool.connect()
    await client.query('BEGIN')
    const application = await client.query(`
      SELECT a.id, a.organization_id, a.academic_year, o.current_academic_year
      FROM public.renewal_applications a
      JOIN public.organizations o ON o.id = a.organization_id
      WHERE a.id = $1 AND a.status = 'SUBMITTED'
      FOR UPDATE OF a, o
    `, [req.params.id])
    if (!application.rowCount) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'Only submitted applications can be reviewed.' })
    }
    const record = application.rows[0]
    const forms = await client.query(`
      SELECT form_number, status, file_path
      FROM public.renewal_forms WHERE renewal_application_id = $1
    `, [record.id])
    if (record.academic_year !== record.current_academic_year) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'Only applications for the organization’s current academic year can be approved.' })
    }
    const complete = [1,2,3,4,5,6].every(n =>
      forms.rows.some(f => Number(f.form_number) === n && f.file_path && f.status !== 'FOR REVISION')
    )
    if (!complete) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'All six forms must be uploaded and none may be marked for revision.' })
    }
    // Office Order Numbers are assigned to organizations already and remain permanent.
    // Never generate or replace an organization number during annual renewal.
    const existing = await client.query(`
      SELECT office_order_number FROM public.organizations WHERE id = $1 FOR UPDATE
    `, [record.organization_id])
    let officeOrder = String(existing.rows[0]?.office_order_number || '').trim()
    if (!officeOrder) {
      const prior = await client.query(`
        SELECT office_order_number FROM public.organization_recognitions
        WHERE organization_id = $1 AND NULLIF(BTRIM(office_order_number), '') IS NOT NULL
        ORDER BY created_at ASC LIMIT 1
      `, [record.organization_id])
      officeOrder = String(prior.rows[0]?.office_order_number || '').trim()
    }
    if (!officeOrder) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'No permanent Office Order Number is stored for this organization. Run the included Office Order lookup and assignment SQL using its official existing number, then approve again.' })
    }
    // Sync a previously assigned historical number to the permanent organization record.
    await client.query(`
      UPDATE public.organizations SET office_order_number = $2 WHERE id = $1
    `, [record.organization_id, officeOrder])
    // Recognition status belongs to the academic year, but the order number is permanent.
    const updated = await client.query(`
      UPDATE public.organization_recognitions
      SET status = 'RENEWED', office_order_number = $3
      WHERE organization_id = $1 AND academic_year = $2
      RETURNING organization_id
    `, [record.organization_id, record.academic_year, officeOrder])
    if (!updated.rowCount) {
      await client.query(`
        INSERT INTO public.organization_recognitions
          (organization_id, academic_year, status, office_order_number)
        VALUES ($1, $2, 'RENEWED', $3)
      `, [record.organization_id, record.academic_year, officeOrder])
    }
    await client.query(`
      UPDATE public.renewal_applications
      SET status = 'APPROVED', updated_at = NOW() WHERE id = $1
    `, [record.id])
    await client.query('COMMIT')
    return res.json({ success: true, office_order_number: officeOrder,
      message: `Renewal approved. Office Order Number: ${officeOrder}. Organization is now RENEWED.` })
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {})
    console.error('OSAS renewal decision:', { code: error.code, constraint: error.constraint, detail: error.detail, message: error.message })
    // Keep the diagnostic short and exclude SQL statements, values, passwords or connection strings.
    const dbCode = typeof error.code === 'string' ? error.code : 'SERVER_ERROR'
    const dbConstraint = typeof error.constraint === 'string' ? `, constraint ${error.constraint}` : ''
    return res.status(500).json({ error: `Renewal approval failed (${dbCode}${dbConstraint}). Check the Express server log for the specific database error.` })
  } finally { if (client) client.release() }
})

// =============================================
// CURRENT ORGANIZATION
// =============================================

app.get(
  '/api/me',
  requireOrganization,
  async (req, res) => {
    try {
      const result = await pool.query(
        `
        SELECT
          a.username,
          o.id AS organization_id,
          o.organization_name,
          o.college,
          o.description,
          o.profile_photo_path,
          o.current_academic_year,
          r.academic_year,
          CASE WHEN UPPER(COALESCE(r.status, '')) = 'RENEWED' THEN COALESCE(o.office_order_number, r.office_order_number) ELSE NULL END AS office_order_number,
          COALESCE(
            r.status,
            'NOT RENEWED'
          ) AS recognition_status
        FROM public.organization_accounts a
        JOIN public.organizations o
          ON o.id = a.organization_id
        LEFT JOIN LATERAL (
          SELECT
            academic_year,
            office_order_number,
            status
          FROM public.organization_recognitions
          WHERE organization_id = o.id
            AND academic_year = o.current_academic_year
          ORDER BY created_at DESC
          LIMIT 1
        ) r ON TRUE
        WHERE a.id = $1
          AND o.id = $2
          AND a.is_active = TRUE
        LIMIT 1
        `,
        [
          req.session.accountId,
          req.organizationId,
        ]
      )

      if (!result.rows.length) {
        return res.status(404).json({
          error: 'Organization not found',
        })
      }

      res.json(result.rows[0])
    } catch (error) {
      console.error('Organization profile:', error.message)

      res.status(500).json({
        error: 'Unable to load organization',
      })
    }
  }
)

// =============================================
// ORGANIZATIONAL STRUCTURE SUMMARY
// =============================================

app.get(
  '/api/organization/structure-summary',
  requireOrganization,
  async (req, res) => {
    try {
      const year = '2026-2027'

      const advisers = await pool.query(
        `
        SELECT id, full_name, department, academic_year
        FROM public.organization_advisers
        WHERE organization_id = $1
          AND academic_year = $2
          AND is_active = TRUE
        ORDER BY full_name
        `,
        [req.organizationId, year]
      )

      const officers = await pool.query(
        `
        SELECT id, full_name, position, academic_year
        FROM public.organization_officers
        WHERE organization_id = $1
          AND academic_year = $2
          AND is_active = TRUE
        ORDER BY position, full_name
        `,
        [req.organizationId, year]
      )

      res.json({
        academic_year: year,
        advisers: advisers.rows,
        officers: officers.rows,
      })
    } catch (error) {
      console.error('Structure summary:', error.message)

      res.status(500).json({
        error: 'Unable to load organization structure',
      })
    }
  }
)

// =============================================
// EDIT ORGANIZATION DESCRIPTION
// =============================================

app.put(
  '/api/organization/description',
  checkOrigin,
  requireOrganization,
  async (req, res) => {
    const { description } = req.body || {}

    if (
      typeof description !== 'string' ||
      description.length > 3000
    ) {
      return res.status(400).json({
        error: 'Description must be 3000 characters or less',
      })
    }

    try {
      const result = await pool.query(
        `
        UPDATE public.organizations
        SET description = $1,
            updated_at = NOW()
        WHERE id = $2
        RETURNING description
        `,
        [
          description.trim(),
          req.organizationId,
        ]
      )

      if (!result.rows.length) {
        return res.status(404).json({
          error: 'Organization not found',
        })
      }

      res.json({
        success: true,
        description: result.rows[0].description,
      })
    } catch (error) {
      console.error('Description update:', error.message)

      res.status(500).json({
        error: 'Unable to save description',
      })
    }
  }
)

// =============================================
// EDIT USERNAME
// =============================================

app.put(
  '/api/organization/username',
  checkOrigin,
  accountLimiter,
  requireOrganization,
  async (req, res) => {
    const { username, currentPassword } = req.body || {}

    if (
      typeof username !== 'string' ||
      !/^[a-z0-9][a-z0-9-]{2,49}$/.test(username) ||
      typeof currentPassword !== 'string' ||
      !currentPassword ||
      currentPassword.length > 1024
    ) {
      return res.status(400).json({
        error: 'Enter a valid username and current password',
      })
    }

    try {
      const result = await pool.query(
        `
        UPDATE public.organization_accounts
        SET username = $1,
            updated_at = NOW()
        WHERE id = $2
          AND organization_id = $3
          AND is_active = TRUE
          AND password_hash =
            extensions.crypt($4, password_hash)
        RETURNING username
        `,
        [
          username,
          req.session.accountId,
          req.organizationId,
          currentPassword,
        ]
      )

      if (!result.rows.length) {
        return res.status(400).json({
          error: 'Current password is incorrect',
        })
      }

      res.json({
        success: true,
        username: result.rows[0].username,
      })
    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({
          error: 'This username is already taken',
        })
      }

      console.error('Username update:', error.message)

      res.status(500).json({
        error: 'Unable to update username',
      })
    }
  }
)

// =============================================
// PHOTO VALIDATION
// =============================================

const photoParser = express.raw({
  type: [
    'image/jpeg',
    'image/png',
    'image/webp',
  ],
  limit: '2mb',
})

function detectImage(buffer) {
  if (
    buffer.length >= 3 &&
    buffer.subarray(0, 3).equals(
      Buffer.from([0xff, 0xd8, 0xff])
    )
  ) {
    return 'jpg'
  }

  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([
        137, 80, 78, 71, 13, 10, 26, 10,
      ])
    )
  ) {
    return 'png'
  }

  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp'
  }

  return null
}

// =============================================
// UPLOAD PROFILE PHOTO
// =============================================

app.post(
  '/api/organization/photo',
  checkOrigin,
  requireOrganization,
  photoParser,
  async (req, res) => {
    if (
      !Buffer.isBuffer(req.body) ||
      !req.body.length
    ) {
      return res.status(400).json({
        error: 'No photo provided',
      })
    }

    const extension = detectImage(req.body)

    if (!extension) {
      return res.status(400).json({
        error: 'Invalid photo format',
      })
    }

    const fileName = `${crypto.randomUUID()}.${extension}`
    const filePath = path.join(uploadDirectory, fileName)

    try {
      await fs.mkdir(uploadDirectory, { recursive: true })

      await fs.writeFile(filePath, req.body, {
        flag: 'wx',
      })

      const result = await pool.query(
        `
        UPDATE public.organizations
        SET profile_photo_path = $1,
            updated_at = NOW()
        WHERE id = $2
        RETURNING profile_photo_path
        `,
        [
          fileName,
          req.organizationId,
        ]
      )

      if (!result.rows.length) {
        await fs.unlink(filePath).catch(() => {})

        return res.status(404).json({
          error: 'Organization not found',
        })
      }

      res.json({
        success: true,
        message: 'Profile photo uploaded',
      })
    } catch (error) {
      await fs.unlink(filePath).catch(() => {})

      console.error('Photo upload:', error.message)

      res.status(500).json({
        error: 'Unable to upload photo',
      })
    }
  }
)

// =============================================
// GET PROFILE PHOTO
// =============================================

app.get(
  '/api/organization/photo',
  requireOrganization,
  async (req, res) => {
    try {
      const result = await pool.query(
        `
        SELECT profile_photo_path
        FROM public.organizations
        WHERE id = $1
        `,
        [req.organizationId]
      )

      const fileName = result.rows[0]?.profile_photo_path

      if (
        !fileName ||
        !/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(fileName)
      ) {
        return res.sendStatus(404)
      }

      res.set('Cache-Control', 'no-store')

      return res.sendFile(
        path.join(uploadDirectory, fileName)
      )
    } catch (error) {
      console.error('Profile photo retrieval:', error.message)
      res.sendStatus(404)
    }
  }
)

// =============================================
// CHANGE PASSWORD
// =============================================

app.put(
  '/api/organization/change-password',
  checkOrigin,
  accountLimiter,
  requireOrganization,
  async (req, res) => {
    const { currentPassword, newPassword } = req.body || {}

    if (
      typeof currentPassword !== 'string' ||
      typeof newPassword !== 'string' ||
      !currentPassword ||
      currentPassword.length > 1024 ||
      newPassword.length < 12 ||
      Buffer.byteLength(newPassword, 'utf8') > 72 ||
      newPassword === currentPassword
    ) {
      return res.status(400).json({
        error:
          'Use a different password with at least 12 characters and no more than 72 UTF-8 bytes',
      })
    }

    try {
      const result = await pool.query(
        `
        UPDATE public.organization_accounts
        SET password_hash = extensions.crypt(
              $2,
              extensions.gen_salt('bf', 12)
            ),
            updated_at = NOW()
        WHERE id = $1
          AND organization_id = $3
          AND is_active = TRUE
          AND password_hash =
            extensions.crypt($4, password_hash)
        RETURNING id
        `,
        [
          req.session.accountId,
          newPassword,
          req.organizationId,
          currentPassword,
        ]
      )

      if (!result.rows.length) {
        return res.status(401).json({
          error: 'Current password is incorrect',
        })
      }

      res.json({
        success: true,
        message: 'Password changed successfully',
      })
    } catch (error) {
      console.error('Password change:', error.message)

      res.status(500).json({
        error: 'Unable to change password',
      })
    }
  }
)

// =============================================
// ORGANIZATIONAL STRUCTURE CRUD
// =============================================

app.use('/api/structure', createStructureRouter(pool))

// =============================================
// APPLICATION FOR RENEWAL
// =============================================

app.use('/api/renewal', createRenewalRouter(pool))
app.use('/api/accomplishments', createAccomplishmentRouter(pool))
// OSAS read-only review, comments, approval and repository endpoints.
app.use('/api/osas/ar', createOsasArRouter(pool))
app.use('/api/osas/fs', createOsasFinancialRouter(pool))
app.use('/api/financial', createFinancialRouter(pool))
app.use('/api/documents', createDocumentRouter(pool))

// =============================================
// LOGOUT
// =============================================

app.post('/api/logout', checkOrigin, (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      return res.status(500).json({
        error: 'Logout failed',
      })
    }

    res.clearCookie('sas_session', {
      path: '/',
      sameSite: 'lax',
    })

    res.json({
      success: true,
      message: 'Logged out successfully',
    })
  })
})

// =============================================
// ERROR HANDLING
// =============================================

app.use((error, _req, res, _next) => {
  if (error.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'The uploaded file exceeds the allowed limit',
    })
  }

  console.error('Request error:', error.message)

  res.status(400).json({
    error: 'Invalid request',
  })
})

// =============================================
// START SERVER
// =============================================

app.listen(PORT, '127.0.0.1', () => {
  console.log(
    `SAS Backend running at http://localhost:${PORT}`
  )
})
