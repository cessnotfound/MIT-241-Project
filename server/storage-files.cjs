// Private Supabase Storage access for uploaded files.
// Uploaded bytes are kept in Supabase Storage, not on the local filesystem.
const path = require('node:path');
const SERVER_ROOT = path.resolve(__dirname);

function objectKey(filename) {
  const full = path.resolve(filename);
  const relative = path.relative(SERVER_ROOT, full).replace(/\\/g, '/');
  if (relative === '..' || relative.startsWith('../') || path.isAbsolute(relative) || relative.split('/').includes('..')) {
    throw new Error('Invalid upload storage path');
  }
  if (!relative.startsWith('uploads/') && !relative.startsWith('renewal-uploads/')) {
    throw new Error('Storage access outside upload folders is not allowed');
  }
  return relative;
}

// Environment variables MUST be read at request time, not at module import time.
// db.cjs loads .env.server after this module is imported by index.cjs.
function config() {
  const url = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const bucket = (process.env.SUPABASE_STORAGE_BUCKET || 'sas-portal').trim();
  if (!/^https:\/\/[^/]+$/.test(url) || !key || !bucket) {
    throw new Error('Supabase Storage configuration missing: check SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_STORAGE_BUCKET in .env.server');
  }
  return {url,key,bucket};
}
function endpoint({url,bucket}, key, download) {
  const encoded = key.split('/').map(encodeURIComponent).join('/');
  return `${url}/storage/v1/object/${download ? 'authenticated/' : ''}${encodeURIComponent(bucket)}/${encoded}`;
}
async function request(method, filename, body, extra={}) {
  const settings = config();
  const url = endpoint(settings, objectKey(filename), method === 'GET');
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {apikey:settings.key,Authorization:`Bearer ${settings.key}`,...extra},
      body,
    });
  } catch (cause) {
    throw new Error(`Unable to connect to Supabase Storage: ${cause.message}`);
  }
  if (!response.ok) {
    const detail = (await response.text()).slice(0,400);
    const error = new Error(`Supabase Storage ${method} failed (${response.status}): ${detail}`);
    error.status = response.status;
    throw error;
  }
  return response;
}
async function writeFile(file, bytes, options={}) {
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) throw new Error('File upload must contain bytes');
  await request('POST',file,bytes,{
    'Content-Type':'application/octet-stream',
    'x-upsert':options.flag === 'wx' ? 'false' : 'true',
  });
}
async function readFile(file) {
  const response = await request('GET',file);
  return Buffer.from(await response.arrayBuffer());
}
async function unlink(file) {
  try { await request('DELETE',file); }
  catch (error) { if (error.status !== 404) throw error; }
}
async function access(file) { await readFile(file); }
async function mkdir(folder) { objectKey(path.join(folder,'storage-check')); }
async function send(res,file) { return res.send(await readFile(file)); }
module.exports = {writeFile,readFile,unlink,access,mkdir,send,objectKey};
