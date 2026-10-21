const express = require("express");
const path = require("node:path");
const fs = require("./storage-files.cjs");
const crypto = require("node:crypto");
const uuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const str = (v, max = 2000) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
const date = (v) =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 10) === v;
const amount = (v) => {
  const n = Number(v);
  return v !== "" &&
    v !== null &&
    v !== undefined &&
    Number.isFinite(n) &&
    n >= 0 &&
    Math.round(n * 100) === n * 100
    ? n
    : null;
};
const error400 = (res, msg) => res.status(400).json({ error: msg });
module.exports = function financialRouter(pool) {
  const router = express.Router();
  router.use(async (req, res, next) => {
    if (!req.session?.accountId)
      return res.status(401).json({ error: "Not authenticated" });
    try {
      const r = await pool.query(
        "SELECT organization_id FROM organization_accounts WHERE id=$1 AND is_active=TRUE",
        [req.session.accountId],
      );
      if (!r.rowCount)
        return res.status(401).json({ error: "Account unavailable" });
      req.orgId = r.rows[0].organization_id;
      next();
    } catch (e) {
      console.error("Financial auth:", e);
      res.status(500).json({ error: "Authentication failed" });
    }
  });
  router.use((req, res, next) => {
    if (["GET", "HEAD"].includes(req.method)) return next();
    if (
      req.get("origin") !==
      (process.env.FRONTEND_ORIGIN || "http://localhost:5173")
    )
      return res.status(403).json({ error: "Request origin not allowed" });
    next();
  });
  const crash = (res, e) => {
    console.error("Financial API:", e);
    res.status(500).json({ error: "Financial request failed" });
  };
  async function statement(req, res) {
    if (!uuid(req.params.id)) {
      error400(res, "Invalid statement ID");
      return null;
    }
    const r = await pool.query(
      "SELECT * FROM financial_statements WHERE id=$1 AND organization_id=$2",
      [req.params.id, req.orgId],
    );
    if (!r.rowCount) {
      res.status(404).json({ error: "Statement not found" });
      return null;
    }
    return r.rows[0];
  }
  function writable(s, res) {
    if (["DRAFT", "RETURNED"].includes(s.status)) return true;
    res
      .status(409)
      .json({ error: "Only draft or returned statements are editable" });
    return false;
  }
  async function schedule(req, res, s) {
    if (!uuid(req.params.scheduleId)) {
      error400(res, "Invalid schedule ID");
      return null;
    }
    const r = await pool.query(
      "SELECT * FROM financial_schedules WHERE id=$1 AND financial_statement_id=$2",
      [req.params.scheduleId, s.id],
    );
    if (!r.rowCount) {
      res.status(404).json({ error: "Schedule not found" });
      return null;
    }
    return r.rows[0];
  }
  async function entry(req, res, sch) {
    if (!uuid(req.params.entryId)) {
      error400(res, "Invalid entry ID");
      return null;
    }
    const r = await pool.query(
      "SELECT * FROM financial_entries WHERE id=$1 AND schedule_id=$2",
      [req.params.entryId, sch.id],
    );
    if (!r.rowCount) {
      res.status(404).json({ error: "Entry not found" });
      return null;
    }
    return r.rows[0];
  }
  router.get("/statements", async (req, res) => {
    try {
      const r = await pool.query(
        "SELECT * FROM financial_statements WHERE organization_id=$1 ORDER BY academic_year DESC",
        [req.orgId],
      );
      const org = await pool.query(
        "SELECT current_academic_year FROM organizations WHERE id=$1",
        [req.orgId],
      );
      res.json({
        statements: r.rows,
        current_academic_year:
          org.rows[0]?.current_academic_year || "2026-2027",
      });
    } catch (e) {
      crash(res, e);
    }
  });
  router.post("/statements", async (req, res) => {
    const year = str(req.body?.academic_year, 9);
    if (
      !/^\d{4}-\d{4}$/.test(year) ||
      Number(year.slice(5)) !== Number(year.slice(0, 4)) + 1
    )
      return error400(res, "Invalid academic year");
    try {
      const r = await pool.query(
        "INSERT INTO financial_statements(organization_id,academic_year,reference_number) VALUES($1,$2,$3) ON CONFLICT (organization_id,academic_year) DO NOTHING RETURNING *",
        [
          req.orgId,
          year,
          `FS-${year}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
        ],
      );
      if (!r.rowCount)
        return res
          .status(409)
          .json({ error: "Statement already exists for this academic year" });
      res.status(201).json(r.rows[0]);
    } catch (e) {
      crash(res, e);
    }
  });
  router.get("/statements/:id", async (req, res) => {
    try {
      const s = await statement(req, res);
      if (!s) return;
      const [schedules, entries, attachments, collectibles] = await Promise.all(
        [
          pool.query(
            "SELECT * FROM financial_schedules WHERE financial_statement_id=$1 ORDER BY cash_flow_type,semester,schedule_code",
            [s.id],
          ),
          pool.query(
            "SELECT e.* FROM financial_entries e JOIN financial_schedules sc ON sc.id=e.schedule_id WHERE sc.financial_statement_id=$1 ORDER BY e.entry_date,e.created_at",
            [s.id],
          ),
          pool.query(
            `SELECT a.id,a.schedule_id,a.entry_id,a.file_name,a.file_kind,a.mime_type,a.file_size_bytes,a.caption,a.uploaded_at FROM financial_attachments a LEFT JOIN financial_schedules sc ON sc.id=a.schedule_id LEFT JOIN financial_entries e ON e.id=a.entry_id LEFT JOIN financial_schedules es ON es.id=e.schedule_id WHERE COALESCE(sc.financial_statement_id,es.financial_statement_id)=$1 ORDER BY a.uploaded_at`,
            [s.id],
          ),
          pool.query(
            "SELECT * FROM financial_collectibles WHERE financial_statement_id=$1 ORDER BY created_at",
            [s.id],
          ),
        ],
      );
      const comments = await pool.query(
        "SELECT c.id,c.comment_text,c.created_at,COALESCE(u.full_name,'OSAS') sender FROM public.osas_fs_comments c LEFT JOIN public.osas_accounts u ON u.id=c.osas_account_id WHERE c.statement_id=$1 ORDER BY c.created_at,c.id",
        [s.id],
      );
      const review = await pool.query(
        "SELECT returned_at,updated_at reviewed_at FROM public.osas_fs_reviews WHERE statement_id=$1",
        [s.id],
      );
      res.json({
        statement: s,
        schedules: schedules.rows,
        entries: entries.rows,
        attachments: attachments.rows,
        collectibles: collectibles.rows,
        comments: comments.rows,
        review_timeline: review.rows[0] || null,
      });
    } catch (e) {
      crash(res, e);
    }
  });
  router.delete("/statements/:id", async (req, res) => {
    try {
      const s = await statement(req, res);
      if (!s || !writable(s, res)) return;
      const ok = await cascadeDelete(
        `SELECT a.file_path FROM financial_attachments a
     LEFT JOIN financial_schedules sc ON sc.id=a.schedule_id
     LEFT JOIN financial_entries e ON e.id=a.entry_id
     LEFT JOIN financial_schedules es ON es.id=e.schedule_id
     WHERE COALESCE(sc.financial_statement_id,es.financial_statement_id)=$1`,
        "DELETE FROM financial_statements WHERE id=$1 AND organization_id=$2 AND status IN ('DRAFT','RETURNED') RETURNING id",
        [s.id, req.orgId],
        async (client) => {
          await client.query(
            "DELETE FROM public.osas_fs_comments WHERE statement_id=$1",
            [s.id],
          );
          await client.query(
            "DELETE FROM public.osas_fs_reviews WHERE statement_id=$1",
            [s.id],
          );
        },
      );
      if (!ok)
        return res
          .status(409)
          .json({ error: "Statement could not be deleted" });
      res.json({ success: true });
    } catch (e) {
      crash(res, e);
    }
  });
  router.post("/statements/:id/submit", async (req, res) => {
    try {
      const s = await statement(req, res);
      if (!s || !writable(s, res)) return;
      const count = await pool.query(
        "SELECT COUNT(*)::int n FROM financial_entries e JOIN financial_schedules sc ON sc.id=e.schedule_id WHERE sc.financial_statement_id=$1",
        [s.id],
      );
      if (!count.rows[0].n)
        return error400(
          res,
          "Add at least one financial entry before submitting",
        );
      const r = await pool.query(
        "UPDATE financial_statements SET status='SUBMITTED',submitted_at=NOW(),updated_at=NOW() WHERE id=$1 RETURNING *",
        [s.id],
      );
      res.json(r.rows[0]);
    } catch (e) {
      crash(res, e);
    }
  });
  async function cascadeDelete(sqlFiles, sqlDelete, parameters, beforeDelete) {
    const client = await pool.connect();
    let files = [];
    try {
      await client.query("BEGIN");
      const found = await client.query(sqlFiles, parameters.slice(0, 1));
      files = found.rows.map((row) => row.file_path).filter(Boolean);
      if (beforeDelete) await beforeDelete(client);
      const result = await client.query(sqlDelete, parameters);
      if (!result.rowCount) {
        await client.query("ROLLBACK");
        return false;
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    for (const file of files) {
      try {
        await fs.unlink(path.join(folder, path.basename(file)));
      } catch (error) {
        if (error.code !== "ENOENT")
          console.warn("Financial attachment cleanup:", error.message);
      }
    }
    return true;
  }
  const scheduleData = (b) => {
    const code = str(b?.schedule_code, 20).toUpperCase(),
      title = str(b?.schedule_title, 500),
      flow = b?.cash_flow_type,
      sem = Number(b?.semester);
    if (
      !code ||
      !title ||
      !["INFLOW", "OUTFLOW"].includes(flow) ||
      ![1, 2].includes(sem)
    )
      return null;
    return [code, title, flow, sem, str(b?.description, 4000) || null];
  };
  router.post("/statements/:id/schedules", async (req, res) => {
    const data = scheduleData(req.body);
    if (!data)
      return error400(
        res,
        "Provide valid schedule code, name, cash flow type, and semester",
      );
    try {
      const s = await statement(req, res);
      if (!s || !writable(s, res)) return;
      const r = await pool.query(
        "INSERT INTO financial_schedules(financial_statement_id,schedule_code,schedule_title,cash_flow_type,semester,description) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
        [s.id, ...data],
      );
      res.status(201).json(r.rows[0]);
    } catch (e) {
      if (e.code === "23505")
        return res
          .status(409)
          .json({ error: "Schedule code already exists in this statement" });
      crash(res, e);
    }
  });
  router.put("/statements/:id/schedules/:scheduleId", async (req, res) => {
    const data = scheduleData(req.body);
    if (!data) return error400(res, "Invalid schedule details");
    try {
      const s = await statement(req, res);
      if (!s || !writable(s, res)) return;
      const sc = await schedule(req, res, s);
      if (!sc) return;
      const r = await pool.query(
        "UPDATE financial_schedules SET schedule_code=$2,schedule_title=$3,cash_flow_type=$4,semester=$5,description=$6,updated_at=NOW() WHERE id=$1 RETURNING *",
        [sc.id, ...data],
      );
      res.json(r.rows[0]);
    } catch (e) {
      if (e.code === "23505")
        return res.status(409).json({ error: "Schedule code already in use" });
      crash(res, e);
    }
  });
  router.delete("/statements/:id/schedules/:scheduleId", async (req, res) => {
    try {
      const s = await statement(req, res);
      if (!s || !writable(s, res)) return;
      const sc = await schedule(req, res, s);
      if (!sc) return;
      const ok = await cascadeDelete(
        `SELECT a.file_path FROM financial_attachments a
     LEFT JOIN financial_entries e ON e.id=a.entry_id
     WHERE a.schedule_id=$1 OR e.schedule_id=$1`,
        "DELETE FROM financial_schedules WHERE id=$1 AND financial_statement_id=$2 RETURNING id",
        [sc.id, s.id],
      );
      if (!ok) return res.status(404).json({ error: "Schedule not found" });
      res.json({ success: true });
    } catch (e) {
      crash(res, e);
    }
  });
  const entryData = (b) => {
    const qty =
        b?.quantity === "" || b?.quantity == null ? null : Number(b.quantity),
      price =
        b?.unit_price === "" || b?.unit_price == null
          ? null
          : amount(b.unit_price);
    if (qty !== null && (!Number.isSafeInteger(qty) || qty <= 0)) return null;
    if (b?.unit_price !== "" && b?.unit_price != null && price === null)
      return null;
    if ((qty === null) !== (price === null)) return null;
    const a =
      qty !== null ? Math.round(qty * price * 100) / 100 : amount(b?.amount);
    if (
      !date(b?.entry_date) ||
      !str(b?.description, 500) ||
      a === null ||
      !Number.isFinite(a)
    )
      return null;
    return [
      b.entry_date,
      str(b.description, 500),
      str(b.receipt_number, 100) || null,
      qty,
      price,
      a,
      str(b.notes, 4000) || null,
    ];
  };
  router.post(
    "/statements/:id/schedules/:scheduleId/entries",
    async (req, res) => {
      const data = entryData(req.body);
      if (!data)
        return error400(
          res,
          "Provide valid date, description, and nonnegative amount",
        );
      try {
        const s = await statement(req, res);
        if (!s || !writable(s, res)) return;
        const sc = await schedule(req, res, s);
        if (!sc) return;
        const r = await pool.query(
          "INSERT INTO financial_entries(schedule_id,entry_date,description,receipt_number,quantity,unit_price,amount,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
          [sc.id, ...data],
        );
        res.status(201).json(r.rows[0]);
      } catch (e) {
        crash(res, e);
      }
    },
  );
  router.put(
    "/statements/:id/schedules/:scheduleId/entries/:entryId",
    async (req, res) => {
      const data = entryData(req.body);
      if (!data) return error400(res, "Invalid financial entry");
      try {
        const s = await statement(req, res);
        if (!s || !writable(s, res)) return;
        const sc = await schedule(req, res, s);
        if (!sc) return;
        const en = await entry(req, res, sc);
        if (!en) return;
        const r = await pool.query(
          "UPDATE financial_entries SET entry_date=$2,description=$3,receipt_number=$4,quantity=$5,unit_price=$6,amount=$7,notes=$8,updated_at=NOW() WHERE id=$1 RETURNING *",
          [en.id, ...data],
        );
        res.json(r.rows[0]);
      } catch (e) {
        crash(res, e);
      }
    },
  );
  router.delete(
    "/statements/:id/schedules/:scheduleId/entries/:entryId",
    async (req, res) => {
      try {
        const s = await statement(req, res);
        if (!s || !writable(s, res)) return;
        const sc = await schedule(req, res, s);
        if (!sc) return;
        const en = await entry(req, res, sc);
        if (!en) return;
        const ok = await cascadeDelete(
          "SELECT file_path FROM financial_attachments WHERE entry_id=$1",
          "DELETE FROM financial_entries WHERE id=$1 AND schedule_id=$2 RETURNING id",
          [en.id, sc.id],
        );
        if (!ok)
          return res.status(404).json({ error: "Transaction not found" });
        res.json({ success: true });
      } catch (e) {
        crash(res, e);
      }
    },
  );
  router.post("/statements/:id/collectibles", async (req, res) => {
    const d = collectData(req.body);
    if (!d) return error400(res, "Check collectible description and amounts");
    try {
      const s = await statement(req, res);
      if (!s || !writable(s, res)) return;
      const r = await pool.query(
        "INSERT INTO financial_collectibles(financial_statement_id,debtor_name,description,due_date,amount_due,amount_received,notes) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
        [s.id, ...d],
      );
      res.status(201).json(r.rows[0]);
    } catch (e) {
      crash(res, e);
    }
  });
  router.put(
    "/statements/:id/collectibles/:collectibleId",
    async (req, res) => {
      const d = collectData(req.body);
      if (!d || !uuid(req.params.collectibleId))
        return error400(res, "Invalid collectible");
      try {
        const s = await statement(req, res);
        if (!s || !writable(s, res)) return;
        const r = await pool.query(
          "UPDATE financial_collectibles SET debtor_name=$3,description=$4,due_date=$5,amount_due=$6,amount_received=$7,notes=$8,updated_at=NOW() WHERE id=$1 AND financial_statement_id=$2 RETURNING *",
          [req.params.collectibleId, s.id, ...d],
        );
        if (!r.rowCount)
          return res.status(404).json({ error: "Collectible not found" });
        res.json(r.rows[0]);
      } catch (e) {
        crash(res, e);
      }
    },
  );
  router.delete(
    "/statements/:id/collectibles/:collectibleId",
    async (req, res) => {
      if (!uuid(req.params.collectibleId))
        return error400(res, "Invalid collectible ID");
      try {
        const s = await statement(req, res);
        if (!s || !writable(s, res)) return;
        const r = await pool.query(
          "DELETE FROM financial_collectibles WHERE id=$1 AND financial_statement_id=$2 RETURNING id",
          [req.params.collectibleId, s.id],
        );
        if (!r.rowCount)
          return res.status(404).json({ error: "Collectible not found" });
        res.json({ success: true });
      } catch (e) {
        crash(res, e);
      }
    },
  );
  const folder = path.join(__dirname, "uploads", "financial");
  const raw = express.raw({
    type: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
    limit: "10mb",
  });
  async function parent(req, res) {
    const s = await statement(req, res);
    if (!s) return null;
    const sc = await schedule(req, res, s);
    if (!sc) return null;
    let en = null;
    if (req.params.entryId) {
      en = await entry(req, res, sc);
      if (!en) return null;
    }
    return { s, sc, en };
  }
  async function upload(req, res) {
    try {
      const p = await parent(req, res);
      if (!p || !writable(p.s, res)) return;
      const mime = req.get("content-type")?.split(";")[0]?.toLowerCase(),
        bytes = req.body;
      if (
        !Buffer.isBuffer(bytes) ||
        !bytes.length ||
        bytes.length > 10 * 1024 * 1024
      )
        return error400(res, "File must be 10 MB or less");
      const good =
        (mime === "application/pdf" &&
          bytes.subarray(0, 5).toString() === "%PDF-") ||
        (mime === "image/png" &&
          bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
        (mime === "image/jpeg" &&
          bytes[0] === 255 &&
          bytes[1] === 216 &&
          bytes[2] === 255) ||
        (mime === "image/webp" &&
          bytes.toString("ascii", 0, 4) === "RIFF" &&
          bytes.toString("ascii", 8, 12) === "WEBP");
      if (!good)
        return error400(
          res,
          "Only verified PDF, JPG, PNG, or WebP files are allowed",
        );
      const ext = {
        "application/pdf": "pdf",
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/webp": "webp",
      }[mime];
      const name = crypto.randomUUID() + "." + ext;
      await fs.mkdir(folder, { recursive: true });
      await fs.writeFile(path.join(folder, name), bytes, { flag: "wx" });
      try {
        const r = await pool.query(
          "INSERT INTO financial_attachments(schedule_id,entry_id,file_name,file_path,mime_type,file_size_bytes,file_kind,caption) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,file_name,file_kind,mime_type,file_size_bytes,caption,uploaded_at,schedule_id,entry_id",
          [
            p.en ? null : p.sc.id,
            p.en?.id || null,
            str(req.get("x-file-name"), 240) || name,
            name,
            mime,
            bytes.length,
            req.get("x-file-kind") === "DOCUMENT" ? "DOCUMENT" : "RECEIPT",
            str(req.get("x-file-caption"), 300) || null,
          ],
        );
        res.status(201).json(r.rows[0]);
      } catch (e) {
        await fs.unlink(path.join(folder, name)).catch(() => {});
        throw e;
      }
    } catch (e) {
      crash(res, e);
    }
  }
  router.post("/statements/:id/schedules/:scheduleId/attachments", raw, upload);
  router.post(
    "/statements/:id/schedules/:scheduleId/entries/:entryId/attachments",
    raw,
    upload,
  );
  router.get("/statements/:id/attachments/:attachmentId", async (req, res) => {
    try {
      const s = await statement(req, res);
      if (!s) return;
      if (!uuid(req.params.attachmentId))
        return error400(res, "Invalid attachment ID");
      const r = await pool.query(
        `SELECT a.* FROM financial_attachments a LEFT JOIN financial_schedules sc ON sc.id=a.schedule_id LEFT JOIN financial_entries e ON e.id=a.entry_id LEFT JOIN financial_schedules es ON es.id=e.schedule_id WHERE a.id=$1 AND COALESCE(sc.financial_statement_id,es.financial_statement_id)=$2`,
        [req.params.attachmentId, s.id],
      );
      if (!r.rowCount)
        return res.status(404).json({ error: "Attachment not found" });
      const a = r.rows[0];
      res.type(a.mime_type);
      res.set(
        "Content-Disposition",
        `inline; filename="${a.mime_type === "application/pdf" ? "document.pdf" : "receipt." + ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[a.mime_type] || "bin")}"`,
      );
      res.set("X-Content-Type-Options", "nosniff");
      await fs.send(res,path.join(folder, path.basename(a.file_path)));
    } catch (e) {
      crash(res, e);
    }
  });
  router.delete(
    "/statements/:id/attachments/:attachmentId",
    async (req, res) => {
      try {
        const s = await statement(req, res);
        if (!s || !writable(s, res)) return;
        if (!uuid(req.params.attachmentId))
          return error400(res, "Invalid attachment ID");
        const r = await pool.query(
          `DELETE FROM financial_attachments WHERE id=$1 AND id IN (SELECT a.id FROM financial_attachments a LEFT JOIN financial_schedules sc ON sc.id=a.schedule_id LEFT JOIN financial_entries e ON e.id=a.entry_id LEFT JOIN financial_schedules es ON es.id=e.schedule_id WHERE COALESCE(sc.financial_statement_id,es.financial_statement_id)=$2) RETURNING file_path`,
          [req.params.attachmentId, s.id],
        );
        if (!r.rowCount)
          return res.status(404).json({ error: "File not found" });
        await fs
          .unlink(path.join(folder, path.basename(r.rows[0].file_path)))
          .catch((e) => console.warn("File cleanup:", e.message));
        res.json({ success: true });
      } catch (e) {
        crash(res, e);
      }
    },
  );
  return router;
};
