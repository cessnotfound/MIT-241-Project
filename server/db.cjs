const { Pool } = require("pg");
const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");

dotenv.config({
  path: path.join(__dirname, "..", ".env.server"),
});

const certificate = fs.readFileSync(
  path.join(__dirname, "..", "certs", "prod-ca-2021.crt"),
  "utf8",
);

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    ca: certificate,
    rejectUnauthorized: true,
  },
  connectionTimeoutMillis: 10000,
});

// PostgreSQL may emit an error on an idle connection when the remote server
// closes it. Without a listener, Node treats this event as an uncaught error.
// pg removes that client from the pool automatically; a later query reconnects.
pool.on("error", (error) => {
  console.error("[Database] Idle connection error:", error.message);
});

module.exports = pool;
