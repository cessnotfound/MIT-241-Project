
const { Pool } = require('pg')
const fs = require('node:fs')
const path = require('node:path')
const dotenv = require('dotenv')

dotenv.config({
  path: path.join(__dirname, '..', '.env.server'),
})

const certificate = fs.readFileSync(
  path.join(__dirname, '..', 'certs', 'prod-ca-2021.crt'),
  'utf8'
)

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is missing')
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    ca: certificate,
    rejectUnauthorized: true,
  },
  connectionTimeoutMillis: 10000,
})

module.exports = pool
