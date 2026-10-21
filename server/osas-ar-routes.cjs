"use strict";
const express = require("express");
const fs = require("./storage-files.cjs");
const path = require("node:path");
const crypto = require("node:crypto");
const validId = (x) =>
  typeof x === "string" && /^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(x);
module.exports = function createOsasArRouter(pool) {
  const router = express.Router();
  router.use(async (req, res, next) => {
    if (req.session?.accountRole !== "OSAS" || !req.session.osasAccountId)
      return res.status(401).json({ error: "OSAS login required" });
    try {
      const r = await pool.query(
        "SELECT id FROM public.osas_accounts WHERE id=$1 AND is_active=TRUE",
        [req.session.osasAccountId],
      );
      if (!r.rowCount)
        return res.status(401).json({ error: "OSAS account inactive" });
      next();
    } catch (e) {
      next(e);
    }
  });
  router.use((req, res, next) => {
    if (["GET", "HEAD"].includes(req.method)) return next();
    if (
      req.get("origin") !==
      (process.env.FRONTEND_ORIGIN || "http://localhost:5173")
    )
      return res.status(403).json({ error: "Origin denied" });
    next();
  });
  const err = (res, e) => {
    console.error("OSAS AR:", e);
    res.status(500).json({ error: "Unable to process accomplishment report" });
  };
  async function details(db, id) {
    const [r, a, p, s, at] = await Promise.all([
      db.query("SELECT * FROM public.accomplishment_reports WHERE id=$1", [id]),
      db.query(
        "SELECT * FROM public.accomplishment_activities WHERE report_id=$1 ORDER BY created_at",
        [id],
      ),
      db.query(
        "SELECT * FROM public.accomplishment_tangible_projects WHERE report_id=$1 ORDER BY created_at",
        [id],
      ),
      db.query(
        "SELECT * FROM public.accomplishment_scoring_options ORDER BY scoring_group,raw_points",
      ),
      db.query(
        `SELECT t.* FROM public.accomplishment_attachments t LEFT JOIN public.accomplishment_activities a ON a.id=t.activity_id LEFT JOIN public.accomplishment_tangible_projects p ON p.id=t.tangible_project_id WHERE a.report_id=$1 OR p.report_id=$1`,
        [id],
      ),
    ]);
    return r.rowCount
      ? {
          report: r.rows[0],
          activities: a.rows,
          projects: p.rows,
          scoring: s.rows,
          attachments: at.rows,
        }
      : null;
  }
  router.get("/reports", async (req, res) => {
    try {
      const r = await pool.query(
        `SELECT r.id,r.organization_id,r.academic_year,r.reference_number,r.status,r.submitted_at,o.organization_name,o.college,o.current_academic_year,CASE WHEN r.status='APPROVED' THEN 'APPROVED' WHEN r.status='RETURNED' THEN 'RETURNED' ELSE 'SUBMITTED' END review_status FROM public.accomplishment_reports r JOIN public.organizations o ON o.id=r.organization_id LEFT JOIN public.osas_ar_reviews v ON v.report_id=r.id WHERE r.status IN ('SUBMITTED','RETURNED','APPROVED') ORDER BY r.submitted_at DESC NULLS LAST`,
        [],
      );
      res.json(r.rows);
    } catch (e) {
      err(res, e);
    }
  });
  router.get("/repository", async (req, res) => {
    try {
      const r = await pool.query(
        `SELECT p.id,p.report_id,p.academic_year,p.reference_number,p.approved_at,p.organization_id,o.organization_name,o.college FROM public.osas_ar_repository p JOIN public.organizations o ON o.id=p.organization_id ORDER BY p.approved_at DESC`,
      );
      res.json(r.rows);
    } catch (e) {
      err(res, e);
    }
  });
  router.get("/repository/:id", async (req, res) => {
    if (!validId(req.params.id))
      return res.status(400).json({ error: "Invalid ID" });
    try {
      const r = await pool.query(
        "SELECT * FROM public.osas_ar_repository WHERE id=$1",
        [req.params.id],
      );
      if (!r.rowCount)
        return res.status(404).json({ error: "Repository record not found" });
      const f = await pool.query(
        "SELECT id,original_filename,content_type,file_size_bytes FROM public.osas_ar_repository_files WHERE repository_id=$1",
        [req.params.id],
      );
      res.json({ ...r.rows[0], files: f.rows });
    } catch (e) {
      err(res, e);
    }
  });
  router.get("/repository/:id/files/:fileId", async (req, res) => {
    if (!validId(req.params.id) || !validId(req.params.fileId))
      return res.status(400).end();
    try {
      const r = await pool.query(
        "SELECT f.* FROM public.osas_ar_repository_files f WHERE f.repository_id=$1 AND f.id=$2",
        [req.params.id, req.params.fileId],
      );
      if (!r.rowCount) return res.status(404).end();
      const f = r.rows[0];
      if (path.basename(f.storage_path) !== f.storage_path)
        return res.status(404).end();
      const bytes = await fs.readFile(
        path.join(__dirname, "uploads", "osas-ar-repository", f.storage_path),
      );
      res
        .type(f.content_type || "application/octet-stream")
        .set(
          "Content-Disposition",
          `inline; filename="${String(f.original_filename).replace(/["\r\n]/g, "")} "`,
        )
        .send(bytes);
    } catch (e) {
      if (e.code === "ENOENT") return res.status(404).end();
      err(res, e);
    }
  });
  router.get("/reports/:id", async (req, res) => {
    if (!validId(req.params.id))
      return res.status(400).json({ error: "Invalid report ID" });
    try {
      const d = await details(pool, req.params.id);
      if (!d) return res.status(404).json({ error: "Not found" });
      if (!["SUBMITTED", "RETURNED", "APPROVED"].includes(d.report.status))
        return res.status(403).json({ error: "Draft not submitted" });
      const [comments, review, organization] = await Promise.all([
        pool.query(
          `SELECT c.id,c.comment_text,c.created_at,coalesce(u.full_name,'OSAS') sender FROM public.osas_ar_comments c LEFT JOIN public.osas_accounts u ON u.id=c.osas_account_id WHERE c.report_id=$1 ORDER BY c.created_at,c.id`,
          [req.params.id],
        ),
        pool.query("SELECT * FROM public.osas_ar_reviews WHERE report_id=$1", [
          req.params.id,
        ]),
        pool.query(
          "SELECT organization_name,college FROM public.organizations WHERE id=$1",
          [d.report.organization_id],
        ),
      ]);
      res.json({
        ...d,
        attachments: d.attachments.map(({ file_path, ...f }) => f),
        comments: comments.rows,
        review: review.rows[0] || null,
        organization: organization.rows[0],
      });
    } catch (e) {
      err(res, e);
    }
  });
  router.get("/reports/:id/attachments/:attachmentId", async (req, res) => {
    if (!validId(req.params.id) || !validId(req.params.attachmentId))
      return res.status(400).end();
    try {
      const r = await pool.query(
        `SELECT f.file_path,f.file_name,f.mime_type,f.file_kind FROM public.accomplishment_attachments f
      LEFT JOIN public.accomplishment_activities a ON a.id=f.activity_id
      LEFT JOIN public.accomplishment_tangible_projects p ON p.id=f.tangible_project_id
      JOIN public.accomplishment_reports rpt ON rpt.id=COALESCE(a.report_id,p.report_id)
      WHERE rpt.id=$1 AND f.id=$2 AND rpt.status IN ('SUBMITTED','RETURNED','APPROVED')`,
        [req.params.id, req.params.attachmentId],
      );
      if (!r.rowCount) return res.status(404).end();
      const f = r.rows[0],
        name = path.basename(f.file_path || "");
      if (!/^[0-9a-f-]{36}\.(pdf|docx|jpg|jpeg|png|webp)$/i.test(name))
        return res.status(404).end();
      const folder =
        f.file_kind === "PHOTO"
          ? "accomplishments"
          : "accomplishment-documents";
      const data = await fs.readFile(
        path.join(__dirname, "uploads", folder, name),
      );
      res.set("Content-Type", f.mime_type || "application/octet-stream");
      res.set("Cache-Control", "private,no-store");
      res.set("X-Content-Type-Options", "nosniff");
      res.set(
        "Content-Disposition",
        `inline; filename="${String(f.file_name || "attachment").replace(/["\r\n]/g, "_")}"`,
      );
      res.send(data);
    } catch (e) {
      if (e.code === "ENOENT") return res.status(404).end();
      err(res, e);
    }
  });
  router.post("/reports/:id/comments", async (req, res) => {
    if (!validId(req.params.id))
      return res.status(400).json({ error: "Invalid ID" });
    const message = String(req.body?.comment || "").trim();
    if (!message || message.length > 5000)
      return res
        .status(400)
        .json({ error: "Enter a comment up to 5000 characters" });
    try {
      const r = await pool.query(
        `INSERT INTO public.osas_ar_comments(report_id,osas_account_id,comment_text) SELECT id,$2,$3 FROM public.accomplishment_reports WHERE id=$1 AND status IN ('SUBMITTED','RETURNED') RETURNING id,created_at`,
        [req.params.id, req.session.osasAccountId, message],
      );
      if (!r.rowCount)
        return res
          .status(409)
          .json({
            error:
              "Only submitted or returned reports can receive review comments",
          });
      res.status(201).json(r.rows[0]);
    } catch (e) {
      err(res, e);
    }
  });
  router.post("/reports/:id/return", async (req, res) => {
    if (!validId(req.params.id))
      return res.status(400).json({ error: "Invalid ID" });
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const r = await c.query(
        `UPDATE public.accomplishment_reports SET status='RETURNED',reviewed_at=NOW(),updated_at=NOW() WHERE id=$1 AND status='SUBMITTED' RETURNING id`,
        [req.params.id],
      );
      if (!r.rowCount) {
        await c.query("ROLLBACK");
        return res
          .status(409)
          .json({ error: "Only submitted reports can be returned" });
      }
      await c.query(
        `INSERT INTO public.osas_ar_reviews(report_id,status,reviewed_by,returned_at) VALUES($1,'RETURNED',$2,NOW()) ON CONFLICT(report_id) DO UPDATE SET status='RETURNED',reviewed_by=$2,returned_at=NOW(),updated_at=NOW()`,
        [req.params.id, req.session.osasAccountId],
      );
      await c.query("COMMIT");
      res.json({ success: true });
    } catch (e) {
      await c.query("ROLLBACK").catch(() => {});
      err(res, e);
    } finally {
      c.release();
    }
  });
  router.post("/reports/:id/approve", async (req, res) => {
    if (!validId(req.params.id))
      return res.status(400).json({ error: "Invalid ID" });
    const c = await pool.connect();
    const copied = [];
    const folder = path.join(__dirname, "uploads", "osas-ar-repository");
    try {
      await c.query("BEGIN");
      const locked = await c.query(
        `SELECT * FROM public.accomplishment_reports WHERE id=$1 FOR UPDATE`,
        [req.params.id],
      );
      if (!locked.rowCount || locked.rows[0].status !== "SUBMITTED") {
        await c.query("ROLLBACK");
        return res
          .status(409)
          .json({ error: "Only submitted reports can be approved" });
      }
      const d = await details(c, req.params.id);
      const existing = await c.query(
        "SELECT id FROM public.osas_ar_repository WHERE report_id=$1",
        [req.params.id],
      );
      if (existing.rowCount) {
        await c.query("ROLLBACK");
        return res.status(409).json({ error: "Already archived" });
      }
      const snapshot = {
        report: d.report,
        activities: d.activities,
        projects: d.projects,
        scoring: d.scoring,
        attachments: d.attachments.map(({ file_path, ...a }) => a),
      };
      // Copy every uploaded attachment before committing approval: no repository with missing evidence.
      await fs.mkdir(folder, { recursive: true });
      const files = [];
      for (const a of d.attachments) {
        const filename = path.basename(a.file_path || "");
        if (!/^[0-9a-f-]{36}\.(pdf|docx|jpg|jpeg|png|webp)$/i.test(filename))
          throw Error("Invalid source attachment path");
        const sub =
          a.file_kind === "PHOTO"
            ? "accomplishments"
            : "accomplishment-documents";
        const source = path.join(__dirname, "uploads", sub, filename);
        const bytes = await fs.readFile(source);
        const stored = crypto.randomUUID() + path.extname(filename);
        await fs.writeFile(path.join(folder, stored), bytes, { flag: "wx" });
        copied.push(stored);
        files.push({
          ...a,
          stored,
          sha: crypto.createHash("sha256").update(bytes).digest("hex"),
          size: bytes.length,
        });
      }
      const archive = await c.query(
        `INSERT INTO public.osas_ar_repository(report_id,organization_id,academic_year,reference_number,snapshot,approved_by) VALUES($1,$2,$3,$4,$5::jsonb,$6) RETURNING id`,
        [
          req.params.id,
          d.report.organization_id,
          d.report.academic_year,
          d.report.reference_number,
          JSON.stringify(snapshot),
          req.session.osasAccountId,
        ],
      );
      for (const f of files)
        await c.query(
          `INSERT INTO public.osas_ar_repository_files(repository_id,original_filename,stored_filename,storage_path,content_type,file_size_bytes,sha256_hex) VALUES($1,$2,$3,$4,$5,$6,$7)`,
          [
            archive.rows[0].id,
            f.file_name,
            f.stored,
            f.stored,
            f.mime_type,
            f.size,
            f.sha,
          ],
        );
      await c.query(
        `INSERT INTO public.osas_ar_reviews(report_id,status,reviewed_by,approved_at) VALUES($1,'APPROVED',$2,NOW()) ON CONFLICT(report_id) DO UPDATE SET status='APPROVED',reviewed_by=$2,approved_at=NOW(),updated_at=NOW()`,
        [req.params.id, req.session.osasAccountId],
      );
      await c.query(
        `UPDATE public.accomplishment_reports SET status='APPROVED',reviewed_at=NOW(),updated_at=NOW() WHERE id=$1`,
        [req.params.id],
      );
      await c.query("COMMIT");
      res.json({ success: true, repository_id: archive.rows[0].id });
    } catch (e) {
      await c.query("ROLLBACK").catch(() => {});
      await Promise.all(
        copied.map((f) => fs.unlink(path.join(folder, f)).catch(() => {})),
      );
      err(res, e);
    } finally {
      c.release();
    }
  });
  return router;
};
