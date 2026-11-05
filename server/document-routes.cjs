const express = require("express");
const fs = require("./storage-files.cjs");
const path = require("node:path");
const crypto = require("node:crypto");

const uuid = (v) =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const decodedHeader = (v) => {
  try {
    return decodeURIComponent(v || "");
  } catch {
    return "";
  }
};
const string = (v, max = 500) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
const validDate = (v) =>
  v == null ||
  v === "" ||
  (typeof v === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    !Number.isNaN(Date.parse(v)) &&
    new Date(v).toISOString().slice(0, 10) === v);
const categories = [
  "CONSTITUTION_AND_BYLAWS",
  "MEETING_MINUTES",
  "CERTIFICATES_AND_RECOGNITIONS",
  "OTHER",
];
const docTypes = ["FORM_7", "RESOLUTION", "EVALUATION", "OTHER"];
const statuses = ["NOT CONDUCTED", "CONDUCTED", "POSTPONED", "CANCELLED"];
const mimeExtensions = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const folder = path.resolve(__dirname, "uploads", "documents");
const rawFile = express.raw({
  type: Object.keys(mimeExtensions),
  limit: "10mb",
});
function verifiedBytes(mime, buf) {
  if (!Buffer.isBuffer(buf) || !buf.length || buf.length > 10 * 1024 * 1024)
    return false;
  if (mime === "application/pdf")
    return buf.subarray(0, 5).toString() === "%PDF-";
  if (mime === "image/jpeg")
    return buf.length > 3 && buf[0] === 255 && buf[1] === 216 && buf[2] === 255;
  if (mime === "image/png")
    return buf
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === "image/webp")
    return (
      buf.toString("ascii", 0, 4) === "RIFF" &&
      buf.toString("ascii", 8, 12) === "WEBP"
    );
  return false;
}
const bad = (res, message, code = 400) =>
  res.status(code).json({ error: message });
const fail = (res, err) => {
  console.error("Document Management API:", err);
  if (err?.code === "23505") {
    const constraint = String(err?.constraint || "");
    if (constraint.includes("resolution") || constraint.includes("issued"))
      return bad(
        res,
        "This Resolution No. is already assigned to an existing activity for this academic year. Choose another number.",
        409,
      );
    return bad(
      res,
      "A record with this unique value already exists. Check the entered values.",
      409,
    );
  }
  if (err?.code === "P0001" || err?.code === "23514")
    return bad(res, err.message, 409);
  return bad(res, "Document Management request failed.", 500);
};

module.exports = function documentRouter(pool) {
  const router = express.Router();
  router.use(async (req, res, next) => {
    if (!req.session?.accountId) return bad(res, "Not authenticated.", 401);
    try {
      const r = await pool.query(
        "SELECT organization_id FROM organization_accounts WHERE id=$1 AND is_active=TRUE",
        [req.session.accountId],
      );
      if (!r.rowCount) return bad(res, "Account unavailable.", 401);
      req.orgId = r.rows[0].organization_id;
      next();
    } catch (e) {
      fail(res, e);
    }
  });
  router.use((req, res, next) => {
    if (["GET", "HEAD"].includes(req.method)) return next();
    if (
      req.get("origin") !==
      (process.env.FRONTEND_ORIGIN || "http://localhost:5173")
    )
      return bad(res, "Request origin not allowed.", 403);
    next();
  });
  async function year(req) {
    const r = await pool.query(
      "SELECT current_academic_year FROM organizations WHERE id=$1",
      [req.orgId],
    );
    if (!r.rowCount || !r.rows[0].current_academic_year)
      throw new Error("Organization academic year is not configured");
    return r.rows[0].current_academic_year;
  }
  async function activity(req, res) {
    if (!uuid(req.params.id)) {
      bad(res, "Invalid activity ID.");
      return null;
    }
    const r = await pool.query(
      "SELECT * FROM document_activities WHERE id=$1 AND organization_id=$2",
      [req.params.id, req.orgId],
    );
    if (!r.rowCount) {
      bad(res, "Activity not found.", 404);
      return null;
    }
    return r.rows[0];
  }
  async function general(req, res) {
    if (!uuid(req.params.id)) {
      bad(res, "Invalid document ID.");
      return null;
    }
    const r = await pool.query(
      "SELECT * FROM organization_documents WHERE id=$1 AND organization_id=$2",
      [req.params.id, req.orgId],
    );
    if (!r.rowCount) {
      bad(res, "Document not found.", 404);
      return null;
    }
    return r.rows[0];
  }
  async function writable(req, res, record) {
    if (record.academic_year !== (await year(req))) {
      bad(res, "Previous academic years are read-only.", 409);
      return false;
    }
    return true;
  }
  async function saveFile(
    req,
    res,
    recordType,
    parentId,
    docType,
    originalName,
  ) {
    const mime = (req.get("content-type") || "").split(";")[0].toLowerCase();
    if (!verifiedBytes(mime, req.body)) {
      bad(res, "Only PDF, JPG, PNG or WebP files up to 10 MB are allowed.");
      return;
    }
    const key = crypto.randomUUID() + "." + mimeExtensions[mime];
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(path.join(folder, key), req.body, { flag: "wx" });
    try {
      let r;
      if (recordType === "activity") {
        r = await pool.query(
          "INSERT INTO document_activity_files (activity_id,document_type,file_name,storage_path,mime_type,file_size_bytes) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
          [parentId, docType, originalName, key, mime, req.body.length],
        );
      } else {
        r = await pool.query(
          "INSERT INTO organization_documents (organization_id,academic_year,title,category,description,file_name,storage_path,mime_type,file_size_bytes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
          [
            req.orgId,
            null,
            docType.title,
            docType.category,
            docType.description,
            originalName,
            key,
            mime,
            req.body.length,
          ],
        );
      }
      res.status(201).json(r.rows[0]);
    } catch (e) {
      await fs.unlink(path.join(folder, key)).catch(() => {});
      throw e;
    }
  }
  async function sendStoredFile(res, file, mode = "inline") {
    const filename = "document." + (mimeExtensions[file.mime_type] || "bin");
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Cache-Control", "private, no-store");
    res.set("Content-Disposition", `${mode}; filename="${filename}"`);
    res.type(file.mime_type || "application/octet-stream");
    await fs.access(path.join(folder, path.basename(file.storage_path)));
    return fs.send(res, path.join(folder, path.basename(file.storage_path)));
  }

  router.get("/overview", async (req, res) => {
    try {
      const [org, years] = await Promise.all([
        pool.query(
          "SELECT current_academic_year FROM organizations WHERE id=$1",
          [req.orgId],
        ),
        pool.query(
          `SELECT academic_year FROM document_activities WHERE organization_id=$1 UNION SELECT academic_year FROM organization_documents WHERE organization_id=$1 ORDER BY academic_year DESC`,
          [req.orgId],
        ),
      ]);
      const current_academic_year = org.rows[0]?.current_academic_year;
      res.json({
        current_academic_year,
        academic_years: [
          ...new Set(
            [
              current_academic_year,
              ...years.rows.map((r) => r.academic_year),
            ].filter(Boolean),
          ),
        ]
          .sort()
          .reverse(),
      });
    } catch (e) {
      fail(res, e);
    }
  });

  // Academic-year repositories are organization-scoped and persist in PostgreSQL.
  router.get("/academic-repositories", async (req, res) => {
    try {
      const r = await pool.query(
        `SELECT academic_year FROM document_repositories WHERE organization_id=$1
      UNION SELECT academic_year FROM document_activities WHERE organization_id=$1
      UNION SELECT academic_year FROM organization_documents WHERE organization_id=$1
      ORDER BY academic_year DESC`,
        [req.orgId],
      );
      res.json({ repositories: r.rows });
    } catch (e) {
      fail(res, e);
    }
  });
  router.post("/academic-repositories", async (req, res) => {
    try {
      const academicYear = string(req.body?.academic_year, 9);
      const current = await year(req);
      if (academicYear !== current)
        return bad(
          res,
          "Only the current academic year can have a new repository.",
          409,
        );
      const r = await pool.query(
        `INSERT INTO document_repositories (organization_id,academic_year)
      VALUES ($1,$2) ON CONFLICT (organization_id,academic_year) DO NOTHING RETURNING academic_year`,
        [req.orgId, academicYear],
      );
      if (!r.rowCount)
        return bad(
          res,
          "A repository already exists for this academic year.",
          409,
        );
      res.status(201).json({ repository: r.rows[0] });
    } catch (e) {
      fail(res, e);
    }
  });

  router.delete("/academic-repositories/:academicYear", async (req, res) => {
    try {
      const academicYear = string(req.params.academicYear, 9);
      if (!/^\d{4}-\d{4}$/.test(academicYear))
        return bad(res, "Invalid academic year.");
      if (academicYear !== (await year(req)))
        return bad(
          res,
          "Previous academic year repositories are read-only.",
          409,
        );
      const result = await pool.query(
        `DELETE FROM document_repositories r
         WHERE r.organization_id=$1 AND r.academic_year=$2
           AND NOT EXISTS (
             SELECT 1 FROM document_activities a
             WHERE a.organization_id=r.organization_id AND a.academic_year=r.academic_year
           )
           AND NOT EXISTS (
             SELECT 1 FROM organization_documents d
             WHERE d.organization_id=r.organization_id AND d.academic_year=r.academic_year
           )
         RETURNING academic_year`,
        [req.orgId, academicYear],
      );
      if (!result.rowCount)
        return bad(
          res,
          "Repository not found or it still contains activities or documents.",
          409,
        );
      res.json({ deleted: true, academic_year: academicYear });
    } catch (e) {
      fail(res, e);
    }
  });

  router.get("/activities", async (req, res) => {
    try {
      const ay = string(req.query.academic_year, 9) || (await year(req));
      const r = await pool.query(
        `SELECT a.*, (SELECT count(*)::int FROM document_activity_files f WHERE f.activity_id=a.id) AS attachment_count FROM document_activities a WHERE organization_id=$1 AND academic_year=$2 ORDER BY resolution_number`,
        [req.orgId, ay],
      );
      res.json({ activities: r.rows, academic_year: ay });
    } catch (e) {
      fail(res, e);
    }
  });
  router.post("/activities", async (req, res) => {
    try {
      const title = string(req.body?.activity_title, 500),
        description = string(req.body?.description, 4000);
      const activityDate = req.body?.activity_date || null;
      const resolutionNumber = req.body?.resolution_number;
      if (
        !Number.isSafeInteger(resolutionNumber) ||
        resolutionNumber < 1 ||
        resolutionNumber > 2147483647
      )
        return bad(res, "Provide a positive integer Resolution No.");
      if (!title || !validDate(activityDate))
        return bad(res, "Provide a valid activity title and optional date.");
      const r = await pool.query(
        "INSERT INTO document_activities (organization_id,academic_year,resolution_number,activity_title,activity_date,description) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
        [
          req.orgId,
          null,
          resolutionNumber,
          title,
          activityDate,
          description || null,
        ],
      );
      res.status(201).json(r.rows[0]);
    } catch (e) {
      fail(res, e);
    }
  });
  router.get("/activities/:id", async (req, res) => {
    try {
      const a = await activity(req, res);
      if (!a) return;
      const files = await pool.query(
        "SELECT id,activity_id,document_type,file_name,mime_type,file_size_bytes,uploaded_at FROM document_activity_files WHERE activity_id=$1 ORDER BY uploaded_at",
        [a.id],
      );
      res.json({ activity: a, files: files.rows });
    } catch (e) {
      fail(res, e);
    }
  });
  router.put("/activities/:id", async (req, res) => {
    try {
      const a = await activity(req, res);
      if (!a || !(await writable(req, res, a))) return;
      const title = string(req.body?.activity_title, 500),
        description = string(req.body?.description, 4000),
        status = req.body?.activity_status,
        date = req.body?.activity_date || null;
      const resolutionNumber = req.body?.resolution_number;
      if (
        !Number.isSafeInteger(resolutionNumber) ||
        resolutionNumber < 1 ||
        resolutionNumber > 2147483647
      )
        return bad(res, "Provide a valid positive integer Resolution No.");
      if (!title || !validDate(date) || !statuses.includes(status))
        return bad(res, "Invalid activity details or status.");
      const r = await pool.query(
        "UPDATE document_activities SET activity_title=$3,activity_date=$4,description=$5,activity_status=$6,resolution_number=$7 WHERE id=$1 AND organization_id=$2 RETURNING *",
        [
          a.id,
          req.orgId,
          title,
          date,
          description || null,
          status,
          resolutionNumber,
        ],
      );
      res.json(r.rows[0]);
    } catch (e) {
      fail(res, e);
    }
  });
  router.delete("/activities/:id", async (req, res) => {
    try {
      const a = await activity(req, res);
      if (!a || !(await writable(req, res, a))) return;
      const files = await pool.query(
        "SELECT storage_path FROM document_activity_files WHERE activity_id=$1",
        [a.id],
      );
      // Delete metadata and attachments. The database trigger releases this Resolution No. for reuse.
      await pool.query(
        "DELETE FROM document_activities WHERE id=$1 AND organization_id=$2",
        [a.id, req.orgId],
      );
      for (const f of files.rows)
        await fs
          .unlink(path.join(folder, path.basename(f.storage_path)))
          .catch((e) => console.warn("Document file cleanup:", e.message));
      res.json({ success: true });
    } catch (e) {
      fail(res, e);
    }
  });
  router.post("/activities/:id/files", rawFile, async (req, res) => {
    try {
      const a = await activity(req, res);
      if (!a || !(await writable(req, res, a))) return;
      const type = string(req.get("x-document-type"), 24).toUpperCase();
      if (!docTypes.includes(type)) return bad(res, "Invalid document type.");
      await saveFile(
        req,
        res,
        "activity",
        a.id,
        type,
        string(decodedHeader(req.get("x-file-name")), 240) || "document",
      );
    } catch (e) {
      fail(res, e);
    }
  });
  async function activityFile(req, res) {
    const a = await activity(req, res);
    if (!a) return null;
    if (!uuid(req.params.fileId)) {
      bad(res, "Invalid file ID.");
      return null;
    }
    const r = await pool.query(
      "SELECT * FROM document_activity_files WHERE id=$1 AND activity_id=$2",
      [req.params.fileId, a.id],
    );
    if (!r.rowCount) {
      bad(res, "File not found.", 404);
      return null;
    }
    return { a, f: r.rows[0] };
  }
  router.get("/activities/:id/files/:fileId", async (req, res) => {
    try {
      const found = await activityFile(req, res);
      if (!found) return;
      await sendStoredFile(
        res,
        found.f,
        req.query.download === "1" ? "attachment" : "inline",
      );
    } catch (e) {
      if (!res.headersSent) fail(res, e);
    }
  });
  router.delete("/activities/:id/files/:fileId", async (req, res) => {
    try {
      const found = await activityFile(req, res);
      if (!found || !(await writable(req, res, found.a))) return;
      await pool.query("DELETE FROM document_activity_files WHERE id=$1", [
        found.f.id,
      ]);
      await fs
        .unlink(path.join(folder, path.basename(found.f.storage_path)))
        .catch((e) => console.warn("Document file cleanup:", e.message));
      res.json({ success: true });
    } catch (e) {
      fail(res, e);
    }
  });

  router.get("/repository", async (req, res) => {
    try {
      const ay = string(req.query.academic_year, 9) || (await year(req));
      const r = await pool.query(
        "SELECT id,organization_id,academic_year,title,category,description,file_name,mime_type,file_size_bytes,created_at,updated_at FROM organization_documents WHERE organization_id=$1 AND academic_year=$2 ORDER BY created_at DESC",
        [req.orgId, ay],
      );
      res.json({ documents: r.rows, academic_year: ay });
    } catch (e) {
      fail(res, e);
    }
  });
  router.post("/repository", rawFile, async (req, res) => {
    try {
      const meta = {
        title: string(decodedHeader(req.get("x-document-title")), 500),
        category: string(req.get("x-document-category"), 48).toUpperCase(),
        description:
          string(decodedHeader(req.get("x-document-description")), 4000) ||
          null,
      };
      if (!meta.title || !categories.includes(meta.category))
        return bad(res, "Provide document title and valid category.");
      await saveFile(
        req,
        res,
        "general",
        null,
        meta,
        string(decodedHeader(req.get("x-file-name")), 240) || "document",
      );
    } catch (e) {
      fail(res, e);
    }
  });
  router.put("/repository/:id", async (req, res) => {
    try {
      const d = await general(req, res);
      if (!d || !(await writable(req, res, d))) return;
      const title = string(req.body?.title, 500),
        category = string(req.body?.category, 48).toUpperCase(),
        description = string(req.body?.description, 4000);
      if (!title || !categories.includes(category))
        return bad(res, "Invalid document title or category.");
      const r = await pool.query(
        "UPDATE organization_documents SET title=$3,category=$4,description=$5 WHERE id=$1 AND organization_id=$2 RETURNING id,academic_year,title,category,description,file_name,mime_type,file_size_bytes,created_at,updated_at",
        [d.id, req.orgId, title, category, description || null],
      );
      res.json(r.rows[0]);
    } catch (e) {
      fail(res, e);
    }
  });
  router.get("/repository/:id/file", async (req, res) => {
    try {
      const d = await general(req, res);
      if (!d) return;
      await sendStoredFile(
        res,
        d,
        req.query.download === "1" ? "attachment" : "inline",
      );
    } catch (e) {
      if (!res.headersSent) fail(res, e);
    }
  });
  router.delete("/repository/:id", async (req, res) => {
    try {
      const d = await general(req, res);
      if (!d || !(await writable(req, res, d))) return;
      await pool.query(
        "DELETE FROM organization_documents WHERE id=$1 AND organization_id=$2",
        [d.id, req.orgId],
      );
      await fs
        .unlink(path.join(folder, path.basename(d.storage_path)))
        .catch((e) => console.warn("Document file cleanup:", e.message));
      res.json({ success: true });
    } catch (e) {
      fail(res, e);
    }
  });
  return router;
};
