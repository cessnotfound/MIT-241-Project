
const express = require('express')


module.exports = function createStructureRouter(pool) {
  const router = express.Router()

  const config = {
    advisers: {
      table: 'public.organization_advisers',
      extraColumn: 'department',
      maxLength: 150,
    },
    officers: {
      table: 'public.organization_officers',
      extraColumn: 'position',
      maxLength: 100,
    },
  }

  function getConfig(kind) {
    return Object.prototype.hasOwnProperty.call(config, kind)
      ? config[kind]
      : null
  }

  // PostgreSQL UUID format validation
  function validId(id) {
    return (
      typeof id === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    )
  }

  function validateRecord(kind, body) {
    const cfg = getConfig(kind)

    if (!cfg || !body || typeof body !== 'object') {
      return null
    }

    const name = body.full_name
    const extra = body[cfg.extraColumn]

    if (
      typeof name !== 'string' ||
      !name.trim() ||
      name.length > 150 ||
      typeof extra !== 'string' ||
      extra.length > cfg.maxLength ||
      (kind === 'officers' && !extra.trim())
    ) {
      return null
    }

    return {
      name: name.trim(),
      extra: extra.trim() || null,
    }
  }

  // Require an authenticated organization account
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

      if (result.rows.length === 0) {
        return res.status(401).json({
          error: 'Account unavailable',
        })
      }

      req.organizationId = result.rows[0].organization_id
      req.academicYear = result.rows[0].current_academic_year
      next()
    } catch (error) {
      console.error(
        'Structure authentication error:',
        error.message
      )

      res.status(500).json({
        error: 'Unable to authenticate organization',
      })
    }
  })

  // Protect modifying requests
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

  // =========================================
  // VIEW ADVISERS AND OFFICERS
  // =========================================

  router.get('/', async (req, res) => {
    try {
      const advisersResult = await pool.query(
        `
        SELECT
          id,
          full_name,
          department,
          academic_year
        FROM public.organization_advisers
        WHERE organization_id = $1
          AND academic_year = $2
          AND is_active = TRUE
        ORDER BY full_name
        `,
        [req.organizationId, req.academicYear]
      )

      const officersResult = await pool.query(
        `
        SELECT
          id,
          full_name,
          position,
          academic_year
        FROM public.organization_officers
        WHERE organization_id = $1
          AND academic_year = $2
          AND is_active = TRUE
        ORDER BY position, full_name
        `,
        [req.organizationId, req.academicYear]
      )

      return res.json({
        academic_year: req.academicYear,
        advisers: advisersResult.rows,
        officers: officersResult.rows,
      })
    } catch (error) {
      console.error(
        'Structure retrieval error:',
        error.message
      )

      return res.status(500).json({
        error: 'Unable to retrieve organizational structure',
      })
    }
  })

  // =========================================
  // ADD ADVISER OR OFFICER
  // =========================================

  router.post('/:kind', async (req, res) => {
    const cfg = getConfig(req.params.kind)
    const input = validateRecord(req.params.kind, req.body)

    if (!cfg || !input) {
      return res.status(400).json({
        error: 'Invalid adviser or officer information',
      })
    }

    try {
      const result = await pool.query(
        `
        INSERT INTO ${cfg.table} (
          organization_id,
          full_name,
          ${cfg.extraColumn},
          academic_year,
          is_active
        )
        VALUES ($1, $2, $3, $4, TRUE)
        RETURNING
          id,
          full_name,
          ${cfg.extraColumn},
          academic_year
        `,
        [
          req.organizationId,
          input.name,
          input.extra,
          req.academicYear,
        ]
      )

      return res.status(201).json(result.rows[0])
    } catch (error) {
      console.error(
        'Add structure error:',
        error.message
      )

      return res.status(500).json({
        error: 'Unable to add record',
      })
    }
  })

  // =========================================
  // EDIT ADVISER OR OFFICER
  // =========================================

  router.put('/:kind/:id', async (req, res) => {
    const cfg = getConfig(req.params.kind)

    if (!cfg) {
      return res.status(400).json({
        error: 'Invalid record type',
      })
    }

    if (!validId(req.params.id)) {
      return res.status(400).json({
        error: 'Invalid record ID',
      })
    }

    const input = validateRecord(req.params.kind, req.body)

    if (!input) {
      return res.status(400).json({
        error: 'Invalid record information',
      })
    }

    try {
      const result = await pool.query(
        `
        UPDATE ${cfg.table}
        SET
          full_name = $1,
          ${cfg.extraColumn} = $2,
          updated_at = NOW()
        WHERE id = $3
          AND organization_id = $4
          AND academic_year = $5
          AND is_active = TRUE
        RETURNING
          id,
          full_name,
          ${cfg.extraColumn},
          academic_year
        `,
        [
          input.name,
          input.extra,
          req.params.id,
          req.organizationId,
          req.academicYear,
        ]
      )

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'Record not found for the active academic year',
        })
      }

      return res.json({
        success: true,
        record: result.rows[0],
      })
    } catch (error) {
      console.error(
        'Edit structure error:',
        error.message
      )

      return res.status(500).json({
        error: 'Unable to update record',
      })
    }
  })

  // =========================================
  // REMOVE ADVISER OR OFFICER
  // =========================================

  router.delete('/:kind/:id', async (req, res) => {
    const cfg = getConfig(req.params.kind)

    if (!cfg) {
      return res.status(400).json({
        error: 'Invalid record type',
      })
    }

    if (!validId(req.params.id)) {
      return res.status(400).json({
        error: 'Invalid record ID',
      })
    }

    try {
      const result = await pool.query(
        `
        UPDATE ${cfg.table}
        SET
          is_active = FALSE,
          updated_at = NOW()
        WHERE id = $1
          AND organization_id = $2
          AND academic_year = $3
          AND is_active = TRUE
        RETURNING id
        `,
        [
          req.params.id,
          req.organizationId,
          req.academicYear,
        ]
      )

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'Record not found for the active academic year',
        })
      }

      return res.json({
        success: true,
        message: 'Record removed successfully',
      })
    } catch (error) {
      console.error(
        'Remove structure error:',
        error.message
      )

      return res.status(500).json({
        error: 'Unable to remove record',
      })
    }
  })

  return router
}
