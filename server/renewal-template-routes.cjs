const express = require("express");

const MAX_SIZE = 10 * 1024 * 1024;
const contentTypes = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function zipFiles(files) {
  let position = 0;
  const local = [],
    central = [];
  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const data = file.data;
    const checksum = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6);
    header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(name.length, 26);
    local.push(header, name, data);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(20, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(0x0800, 8);
    record.writeUInt32LE(checksum, 16);
    record.writeUInt32LE(data.length, 20);
    record.writeUInt32LE(data.length, 24);
    record.writeUInt16LE(name.length, 28);
    record.writeUInt32LE(position, 42);
    central.push(record, name);
    position += header.length + name.length + data.length;
  }
  const centralBytes = central.reduce((sum, item) => sum + item.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBytes, 12);
  end.writeUInt32LE(position, 16);
  return Buffer.concat([...local, ...central, end]);
}

module.exports = function createRenewalTemplateRoutes(pool) {
  const router = express.Router();
  function authenticated(req, res, next) {
    if (
      !req.session ||
      (req.session.accountRole === "OSAS"
        ? !req.session.osasAccountId
        : !req.session.accountId)
    )
      return res
        .status(401)
        .json({ error: "Login required. Please sign in again." });
    next();
  }
  function osasOnly(req, res, next) {
    if (req.session?.accountRole !== "OSAS" || !req.session?.osasAccountId)
      return res.status(403).json({ error: "Only OSAS can manage templates" });
    next();
  }
  function origin(req, res, next) {
    const expected = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
    if (req.get("origin") !== expected)
      return res.status(403).json({ error: "Request origin not allowed" });
    next();
  }
  const handle = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res)).catch(next);
  router.use(authenticated);

  router.get(
    "/",
    handle(async (_req, res) => {
      const result = await pool.query(
        "SELECT form_number, file_name, uploaded_at FROM public.renewal_form_templates ORDER BY form_number",
      );
      res.json({ forms: result.rows });
    }),
  );
  router.put(
    "/:number",
    osasOnly,
    origin,
    express.raw({ type: "application/octet-stream", limit: MAX_SIZE + 1024 }),
    handle(async (req, res) => {
      const number = Number(req.params.number);
      if (!Number.isInteger(number) || number < 1 || number > 6)
        return res.status(400).json({ error: "Invalid form number" });
      const name = decodeURIComponent(String(req.get("x-file-name") || ""));
      const extension = name.split(".").pop().toLowerCase();
      if (
        !/^[a-zA-Z0-9][a-zA-Z0-9 _().-]{0,119}$/.test(name) ||
        !contentTypes[extension]
      )
        return res
          .status(400)
          .json({
            error: "Use a PDF, DOC, or DOCX file with a simple filename",
          });
      if (
        !Buffer.isBuffer(req.body) ||
        !req.body.length ||
        req.body.length > MAX_SIZE
      )
        return res
          .status(400)
          .json({ error: "File must be between 1 byte and 10 MB" });
      const isPdf =
        extension === "pdf" && req.body.subarray(0, 5).toString() === "%PDF-";
      const isDoc =
        extension === "doc" &&
        req.body.subarray(0, 8).equals(Buffer.from("d0cf11e0a1b11ae1", "hex"));
      const isDocx =
        extension === "docx" && req.body.subarray(0, 2).toString() === "PK";
      if (!isPdf && !isDoc && !isDocx)
        return res
          .status(400)
          .json({ error: "The file contents do not match the selected type" });
      await pool.query(
        `INSERT INTO public.renewal_form_templates (form_number,file_name,mime_type,file_data,uploaded_by,uploaded_at)
      VALUES ($1,$2,$3,$4,$5,NOW()) ON CONFLICT (form_number) DO UPDATE SET
      file_name=EXCLUDED.file_name,mime_type=EXCLUDED.mime_type,file_data=EXCLUDED.file_data,
      uploaded_by=EXCLUDED.uploaded_by,uploaded_at=NOW()`,
        [
          number,
          name,
          contentTypes[extension],
          req.body,
          req.session.osasAccountId,
        ],
      );
      res.json({
        message: `Form ${number} saved`,
        form: {
          form_number: number,
          file_name: name,
          uploaded_at: new Date().toISOString(),
        },
      });
    }),
  );
  router.delete(
    "/:number",
    osasOnly,
    origin,
    handle(async (req, res) => {
      const number = Number(req.params.number);
      if (!Number.isInteger(number) || number < 1 || number > 6)
        return res.status(400).json({ error: "Invalid form number" });
      await pool.query(
        "DELETE FROM public.renewal_form_templates WHERE form_number=$1",
        [number],
      );
      res.json({ message: `Form ${number} removed` });
    }),
  );
  router.get(
    "/all/download",
    handle(async (_req, res) => {
      const result = await pool.query(
        "SELECT form_number,file_name,file_data FROM public.renewal_form_templates ORDER BY form_number",
      );
      if (result.rows.length !== 6)
        return res
          .status(409)
          .json({
            error:
              "OSAS must upload all six templates before downloading the complete set",
          });
      const buffer = zipFiles(
        result.rows.map((r) => ({
          name: `Form_${r.form_number}_${r.file_name}`,
          data: r.file_data,
        })),
      );
      res.set("Content-Type", "application/zip");
      res.set(
        "Content-Disposition",
        'attachment; filename="Application_Renewal_Forms.zip"',
      );
      res.send(buffer);
    }),
  );
  router.get(
    "/:number/download",
    handle(async (req, res) => {
      const number = Number(req.params.number);
      if (!Number.isInteger(number) || number < 1 || number > 6)
        return res.status(400).json({ error: "Invalid form number" });
      const result = await pool.query(
        "SELECT file_name,mime_type,file_data FROM public.renewal_form_templates WHERE form_number=$1",
        [number],
      );
      if (!result.rows.length)
        return res.status(404).json({ error: "Template unavailable" });
      const row = result.rows[0];
      res.set("Content-Type", row.mime_type);
      res.set(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(row.file_name)}`,
      );
      res.send(row.file_data);
    }),
  );
  router.use((error, _req, res, _next) => {
    console.error("Renewal template error:", error);
    const missingTable = error.code === "42P01";
    const permissionDenied = error.code === "42501";
    res
      .status(error.status || 500)
      .json({
        error:
          error.status === 413
            ? "File exceeds 10 MB"
            : missingTable
              ? "Renewal template database table is missing. Run server/renewal-form-templates.sql in Supabase SQL Editor."
              : permissionDenied
                ? "Database user cannot write renewal templates. Check database permissions."
                : "Unable to save template. See backend terminal for the database error.",
      });
  });
  return router;
};
