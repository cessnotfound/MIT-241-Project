
const { Pool } = require('pg')
const fs = require('node:fs')
const path = require('node:path')

require('dotenv').config({ path: '.env.server' })

const certificate = fs.readFileSync(
  path.join(__dirname, 'certs', 'prod-ca-2021.crt'),
  'utf8'
)

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    ca: certificate,
    rejectUnauthorized: true,
  },
  connectionTimeoutMillis: 10000,
})

async function testConnection() {
  let client

  try {
    console.log('Connecting securely to Supabase...')

    client = await pool.connect()

    // Verify TLS encryption on the Node.js connection
    const stream = client.connection.stream

    if (!stream.encrypted || !stream.authorized) {
      throw new Error('TLS certificate verification failed')
    }

    console.log('SSL/TLS connection verified!')

    // Retrieve database tables
    const result = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `)

    console.log('\nDatabase Tables:')

    result.rows.forEach((row) => {
      console.log('- ' + row.table_name)
    })
  } catch (error) {
    console.error('Connection failed:', error.message)
  } finally {
    if (client) client.release()
    await pool.end()
  }
}

testConnection()
