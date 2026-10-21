
const express = require('express')
const fs = require('./storage-files.cjs')
const path = require('node:path')
const crypto = require('node:crypto')

const UPLOAD_DIR = path.join(__dirname, 'renewal-uploads')
const MAX_FILE_SIZE = 10 * 1024 * 1024

module.exports = function createRenewalRouter(pool) {
  const router = express.Router()

  function validFormNumber(value) {
    return /^[1-6]$/.test(String(value))
  }

  function canEditApplication(status) {
    return status === 'DRAFT' || status === 'FOR REVISION'
  }

  function validStoredPath(value) {
    return (
      typeof value === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png)$/i.test(value)
    )
  }

  function detectFile(buffer) {
    if (
      buffer.length >= 5 &&
      buffer.toString('ascii', 0, 5) === '%PDF-'
    ) {
      return {
        extension: 'pdf',
        mime: 'application/pdf',
      }
    }

    if (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    ) {
      return {
        extension: 'jpg',
        mime: 'image/jpeg',
      }
    }

    const pngSignature = Buffer.from([
      137, 80, 78, 71, 13, 10, 26, 10,
    ])

    if (
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(pngSignature)
    ) {
      return {
        extension: 'png',
        mime: 'image/png',
      }
    }

    return null
  }

  async function getApplication(db, organizationId, academicYear) {
    const result = await db.query(
      `
      SELECT id, status, submitted_at
      FROM public.renewal_applications
      WHERE organization_id = $1
        AND academic_year = $2
      LIMIT 1
      `,
      [organizationId, academicYear]
    )

    return result.rows[0] || null
  }

  // ==========================================
  // AUTHENTICATION
  // ==========================================

  router.use(async (req, res, next) => {
    if (!req.session?.accountId) {
      return res.status(401).json({
        error: 'Not authenticated',
      })
    }

    try {
      const result = await pool.query(
        `
        SELECT a.organization_id, o.current_academic_year
        FROM public.organization_accounts a
        JOIN public.organizations o ON o.id = a.organization_id
        WHERE a.id = $1
          AND a.is_active = TRUE
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
      req.academicYear = result.rows[0].current_academic_year
      next()
    } catch (error) {
      console.error('Renewal authentication:', error.message)

      return res.status(500).json({
        error: 'Authentication failed',
      })
    }
  })

  // ==========================================
  // ORIGIN CHECK
  // ==========================================

  router.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') {
      return next()
    }

    const expectedOrigin =
      process.env.FRONTEND_ORIGIN ||
      'http://localhost:5173'

    if (req.get('origin') !== expectedOrigin) {
      return res.status(403).json({
        error: 'Request origin not allowed',
      })
    }

    next()
  })

  // ==========================================
  // LOAD APPLICATION
  // ==========================================

  router.get('/', async (req, res) => {
    try {
      const application = await getApplication(
        pool,
        req.organizationId,
        req.academicYear
      )

      let savedForms = []

      if (application) {
        const result = await pool.query(
          `
          SELECT
            form_number,
            file_name,
            file_path,
            status,
            reviewer_comment
          FROM public.renewal_forms
          WHERE renewal_application_id = $1
          ORDER BY form_number
          `,
          [application.id]
        )

        savedForms = result.rows
      }

      const timeline = application ? (await pool.query(`
        SELECT event_type, form_number, created_at
        FROM public.renewal_submission_events
        WHERE renewal_application_id=$1
        ORDER BY created_at ASC, id ASC
      `, [application.id])).rows : []

      // Preserve all OSAS comments in chronological order, including after resubmissions.
      let commentHistory = []
      if (application) {
        const history = await pool.query(`
          SELECT c.id, c.form_number, c.comment_text, c.created_at,
                 COALESCE(oa.full_name, 'OSAS Administrator') AS author
          FROM public.renewal_form_comments c
          LEFT JOIN public.osas_accounts oa ON oa.id = c.osas_account_id
          WHERE c.renewal_application_id = $1
          ORDER BY c.created_at ASC, c.id ASC
        `, [application.id])
        commentHistory = history.rows
      }

      const forms = Array.from({ length: 6 }, (_, index) => {
        const number = index + 1

        const saved = savedForms.find(
          (form) => Number(form.form_number) === number
        )

        return {
          form_number: number,
          file_name: saved?.file_path
            ? saved.file_name
            : null,
          status: saved?.status || 'NOT SUBMITTED',
          reviewer_comment: saved?.reviewer_comment || null,
          comments: commentHistory.filter((c) => Number(c.form_number) === number),
          activity: timeline.filter((e) => Number(e.form_number) === number),
        }
      })

      return res.json({
        academic_year: req.academicYear,
        status: application?.status || 'DRAFT',
        submitted_at: application?.submitted_at || null,
        first_submitted_at: timeline.find(e => e.event_type === 'FIRST_SUBMITTED')?.created_at || application?.submitted_at || null,
        activity: timeline,
        forms,
      })
    } catch (error) {
      console.error('Renewal loading:', error.message)

      return res.status(500).json({
        error: 'Unable to load renewal application',
      })
    }
  })

  // ==========================================
  // UPLOAD PARSER
  // ==========================================

  const uploadParser = express.raw({
    type: [
      'application/pdf',
      'image/jpeg',
      'image/png',
    ],
    limit: MAX_FILE_SIZE,
  })

  // ==========================================
  // UPLOAD OR REPLACE FORM
  // ==========================================

  router.put(
    '/forms/:number',
    uploadParser,
    async (req, res) => {
      if (!validFormNumber(req.params.number)) {
        return res.status(400).json({
          error: 'Invalid form number',
        })
      }

      if (
        !Buffer.isBuffer(req.body) ||
        req.body.length === 0 ||
        req.body.length > MAX_FILE_SIZE
      ) {
        return res.status(400).json({
          error: 'Select a document of 10 MB or less',
        })
      }

      const detected = detectFile(req.body)

      if (
        !detected ||
        req.get('content-type') !== detected.mime
      ) {
        return res.status(400).json({
          error: 'Only valid PDF, JPG, and PNG documents are allowed',
        })
      }

      let originalName

      try {
        originalName = decodeURIComponent(
          req.get('x-file-name') || ''
        )
      } catch {
        return res.status(400).json({
          error: 'Invalid document name',
        })
      }

      const safeName = path
        .basename(originalName.replace(/\\/g, '/'))
        .replace(/[\x00-\x1f\x7f]/g, '')
        .slice(0, 200)

      if (!safeName) {
        return res.status(400).json({
          error: 'Document name is required',
        })
      }

      const fileName =
        `${crypto.randomUUID()}.${detected.extension}`

      const filePath = path.join(UPLOAD_DIR, fileName)

      const client = await pool.connect()
      let transactionOpen = false
      let fileCreated = false
      let previousFile = null

      try {
        await client.query('BEGIN')
        transactionOpen = true

        const organization = await client.query(
          `
          SELECT id
          FROM public.organizations
          WHERE id = $1
          FOR UPDATE
          `,
          [req.organizationId]
        )

        if (!organization.rows.length) {
          await client.query('ROLLBACK')
          transactionOpen = false

          return res.status(404).json({
            error: 'Organization not found',
          })
        }

        let application = await getApplication(
          client,
          req.organizationId,
          req.academicYear
        )

        if (!application) {
          const created = await client.query(
            `
            INSERT INTO public.renewal_applications (
              organization_id,
              academic_year,
              status
            )
            VALUES ($1, $2, 'DRAFT')
            RETURNING id, status, submitted_at
            `,
            [req.organizationId, req.academicYear]
          )

          application = created.rows[0]
        }

        if (!canEditApplication(application.status)) {
          await client.query('ROLLBACK')
          transactionOpen = false

          return res.status(409).json({
            error:
              'Documents cannot be changed while the application is under review or finalized',
          })
        }

        const number = Number(req.params.number)

        const existingResult = await client.query(
          `
          SELECT id, file_path, status
          FROM public.renewal_forms
          WHERE renewal_application_id = $1
            AND form_number = $2
          FOR UPDATE
          `,
          [application.id, number]
        )

        const existing = existingResult.rows[0]

        if (existing?.status === 'APPROVED') {
          await client.query('ROLLBACK')
          transactionOpen = false

          return res.status(409).json({
            error: 'This form is already approved',
          })
        }

        const returnedEarlier = existing && (await client.query(`SELECT 1 FROM public.renewal_submission_events WHERE renewal_application_id=$1 AND form_number=$2 AND event_type='RETURNED' LIMIT 1`, [application.id, number])).rowCount > 0
        if (application.status === 'FOR REVISION' && existing?.status !== 'FOR REVISION' && !(existing?.status === 'NOT SUBMITTED' && returnedEarlier)) {
          await client.query('ROLLBACK'); transactionOpen = false
          return res.status(409).json({error:'Only forms returned for revision may be replaced.'})
        }
        previousFile = existing?.file_path || null

        await fs.mkdir(UPLOAD_DIR, {
          recursive: true,
        })

        await fs.writeFile(filePath, req.body, {
          flag: 'wx',
        })

        fileCreated = true

        if (existing) {
          await client.query(
            `
            UPDATE public.renewal_forms
            SET file_name = $1,
                file_path = $2,
                status = 'NOT SUBMITTED',
                reviewer_comment = NULL,
                updated_at = NOW()
            WHERE id = $3
            `,
            [safeName, fileName, existing.id]
          )
        } else {
          await client.query(
            `
            INSERT INTO public.renewal_forms (
              renewal_application_id,
              form_number,
              file_name,
              file_path,
              status
            )
            VALUES ($1, $2, $3, $4, 'NOT SUBMITTED')
            `,
            [
              application.id,
              number,
              safeName,
              fileName,
            ]
          )
        }

        if (application.status === 'FOR REVISION' && (existing?.status === 'FOR REVISION' || (existing?.status === 'NOT SUBMITTED' && returnedEarlier))) {
          await client.query(`INSERT INTO public.renewal_submission_events
            (renewal_application_id, organization_id, academic_year, form_number, event_type, actor_role)
            VALUES ($1,$2,$3,$4,'REVISED_UPLOAD','ORGANIZATION')`,
            [application.id, req.organizationId, req.academicYear, number])
        }
        await client.query('COMMIT')
        transactionOpen = false

        if (validStoredPath(previousFile)) {
          await fs.unlink(
            path.join(UPLOAD_DIR, previousFile)
          ).catch(() => {})
        }

        return res.json({
          success: true,
          message: `Form ${number} uploaded successfully`,
        })
      } catch (error) {
        if (transactionOpen) {
          await client.query('ROLLBACK').catch(() => {})
        }

        if (fileCreated) {
          await fs.unlink(filePath).catch(() => {})
        }

        console.error('Renewal upload:', error.message)

        return res.status(500).json({
          error: 'Unable to save renewal document',
        })
      } finally {
        client.release()
      }
    }
  )

  // ==========================================
  // REMOVE AN UPLOADED FORM (DRAFT / REVISION ONLY)
  // ==========================================

  router.delete('/forms/:number', async (req, res) => {
    if (!validFormNumber(req.params.number)) {
      return res.status(400).json({ error: 'Invalid form number' })
    }

    const client = await pool.connect()
    let transactionOpen = false
    let previousFile = null

    try {
      await client.query('BEGIN')
      transactionOpen = true

      // Serialize with uploads and submission for the same organization.
      const organization = await client.query(
        `SELECT id FROM public.organizations WHERE id = $1 FOR UPDATE`,
        [req.organizationId]
      )

      if (!organization.rows.length) {
        await client.query('ROLLBACK')
        transactionOpen = false
        return res.status(404).json({ error: 'Organization not found' })
      }

      const application = await getApplication(
        client, req.organizationId, req.academicYear
      )

      if (!application) {
        await client.query('ROLLBACK')
        transactionOpen = false
        return res.status(404).json({ error: 'Renewal application not found' })
      }

      if (!canEditApplication(application.status)) {
        await client.query('ROLLBACK')
        transactionOpen = false
        return res.status(409).json({
          error: 'Submitted or finalized applications cannot be changed',
        })
      }

      const formResult = await client.query(
        `SELECT id, file_path, status
         FROM public.renewal_forms
         WHERE renewal_application_id = $1 AND form_number = $2
         FOR UPDATE`,
        [application.id, Number(req.params.number)]
      )
      const form = formResult.rows[0]

      if (!form?.file_path) {
        await client.query('ROLLBACK')
        transactionOpen = false
        return res.status(404).json({ error: 'No uploaded document to remove' })
      }

      if (application.status === 'FOR REVISION' && form.status !== 'FOR REVISION') {
        await client.query('ROLLBACK'); transactionOpen = false
        return res.status(409).json({error:'Only returned forms may be removed for replacement.'})
      }
      if (form.status === 'APPROVED') {
        await client.query('ROLLBACK')
        transactionOpen = false
        return res.status(409).json({ error: 'Approved forms cannot be removed' })
      }

      previousFile = form.file_path

      // Clear the upload and reset its review state while keeping the form row.
      await client.query(
        `UPDATE public.renewal_forms
         SET file_name = NULL,
             file_path = NULL,
             status = 'NOT SUBMITTED',
             reviewer_comment = NULL,
             uploaded_at = NULL,
             reviewed_at = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [form.id]
      )

      await client.query('COMMIT')
      transactionOpen = false

      // Remove only safely named server-owned files, after the DB succeeds.
      if (validStoredPath(previousFile)) {
        await fs.unlink(path.join(UPLOAD_DIR, previousFile)).catch((error) => {
          if (error.code !== 'ENOENT') {
            console.error('Renewal file cleanup:', error.message)
          }
        })
      }

      return res.json({
        success: true,
        message: `Form ${req.params.number} document removed`,
      })
    } catch (error) {
      if (transactionOpen) await client.query('ROLLBACK').catch(() => {})
      console.error('Renewal document removal:', error.message)
      return res.status(500).json({ error: 'Unable to remove renewal document' })
    } finally {
      client.release()
    }
  })

  // ==========================================
  // VIEW FILE IN BROWSER
  // ==========================================

  router.get(
    '/forms/:number/download',
    async (req, res) => {
      if (!validFormNumber(req.params.number)) {
        return res.status(400).json({
          error: 'Invalid form number',
        })
      }

      try {
        const result = await pool.query(
          `
          SELECT f.file_name, f.file_path
          FROM public.renewal_forms f
          INNER JOIN public.renewal_applications a
            ON a.id = f.renewal_application_id
          WHERE a.organization_id = $1
            AND a.academic_year = $2
            AND f.form_number = $3
          LIMIT 1
          `,
          [
            req.organizationId,
            req.academicYear,
            Number(req.params.number),
          ]
        )

        const document = result.rows[0]

        if (
          !document ||
          !validStoredPath(document.file_path)
        ) {
          return res.sendStatus(404)
        }

        const extension = path.extname(
          document.file_path
        ).toLowerCase()

        const mimeTypes = {
          '.pdf': 'application/pdf',
          '.jpg': 'image/jpeg',
          '.png': 'image/png',
        }

        const mimeType = mimeTypes[extension]

        if (!mimeType) {
          return res.status(415).json({
            error: 'Unsupported document type',
          })
        }

        // Display in the browser instead of
        // forcing the user to download.
        res.set({
          'Content-Type': mimeType,
          'Content-Disposition': 'inline',
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        })

        return await fs.send(res, path.join(UPLOAD_DIR, document.file_path))

      } catch (error) {
        console.error(
          'Renewal document retrieval:',
          error.message
        )

        if (!res.headersSent) {
          return res.status(500).json({
            error: 'Unable to retrieve renewal document',
          })
        }
      }
    }
  )

  // ==========================================
  // SUBMIT COMPLETE APPLICATION
  // ==========================================

  router.post('/submit', async (req, res) => {
    const client = await pool.connect()
    let transactionOpen = false

    try {
      await client.query('BEGIN')
      transactionOpen = true

      await client.query(
        `
        SELECT id
        FROM public.organizations
        WHERE id = $1
        FOR UPDATE
        `,
        [req.organizationId]
      )

      const application = await getApplication(
        client,
        req.organizationId,
        req.academicYear
      )

      if (!application) {
        await client.query('ROLLBACK')
        transactionOpen = false

        return res.status(400).json({
          error: 'Upload all six forms before submitting',
        })
      }

      if (!canEditApplication(application.status)) {
        await client.query('ROLLBACK')
        transactionOpen = false

        return res.status(409).json({
          error: 'This application cannot be submitted again',
        })
      }

      const result = await client.query(
        `
        SELECT form_number, file_path, status
        FROM public.renewal_forms
        WHERE renewal_application_id = $1
        `,
        [application.id]
      )

      const complete = [1, 2, 3, 4, 5, 6].every(
        (number) =>
          result.rows.some(
            (form) =>
              Number(form.form_number) === number &&
              Boolean(form.file_path) &&
              !['FOR REVISION', 'REJECTED'].includes(form.status)
          )
      )

      if (!complete) {
        await client.query('ROLLBACK')
        transactionOpen = false

        return res.status(400).json({
          error:
            'Upload all six forms and replace any forms requiring revision',
        })
      }

      await client.query(
        `
        UPDATE public.renewal_forms
        SET status = 'SUBMITTED',
            updated_at = NOW()
        WHERE renewal_application_id = $1
          AND status = 'NOT SUBMITTED'
        `,
        [application.id]
      )

      const firstSubmission = !application.submitted_at
      if (firstSubmission) {
        await client.query(`INSERT INTO public.renewal_submission_events
          (renewal_application_id, organization_id, academic_year, event_type, actor_role)
          VALUES ($1,$2,$3,'FIRST_SUBMITTED','ORGANIZATION')`,
          [application.id, req.organizationId, req.academicYear])
      } else {
        const revised = result.rows.filter(f => f.status === 'NOT SUBMITTED')
        for (const form of revised) {
          await client.query(`INSERT INTO public.renewal_submission_events
            (renewal_application_id, organization_id, academic_year, form_number, event_type, actor_role)
            VALUES ($1,$2,$3,$4,'RESUBMITTED','ORGANIZATION')`,
            [application.id, req.organizationId, req.academicYear, form.form_number])
        }
      }
      await client.query(
        `
        UPDATE public.renewal_applications
        SET status = 'SUBMITTED',
            submitted_at = COALESCE(submitted_at, NOW()),
            updated_at = NOW()
        WHERE id = $1
        `,
        [application.id]
      )

      await client.query('COMMIT')
      transactionOpen = false

      return res.json({
        success: true,
        message:
          'Renewal application submitted for administrator review',
      })
    } catch (error) {
      if (transactionOpen) {
        await client.query('ROLLBACK').catch(() => {})
      }

      console.error(
        'Renewal submission:',
        error.message
      )

      return res.status(500).json({
        error: 'Unable to submit renewal application',
      })
    } finally {
      client.release()
    }
  })

  return router
}
