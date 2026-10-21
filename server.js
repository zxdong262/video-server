'use strict'

const http = require('http')
const fs = require('fs')
const fsp = require('fs/promises')
const path = require('path')

const { loadEnv } = require('./lib/env')
const {
  isVideo, isSubtitle, mimeOf, resolveInside, dirUrl, watchUrl, readDir
} = require('./lib/fsx')
const { listingPage, watchPage, errorPage, loginPage } = require('./lib/views')
const { createAuth, parseCookies } = require('./lib/auth')

loadEnv()

const PORT = Number(process.env.PORT || 24433)
const HOST = process.env.HOST || '0.0.0.0'
const SITE_TITLE = process.env.SITE_TITLE || 'Media'
const MEDIA_ROOT = path.resolve(process.env.MEDIA_ROOT || '.')
const auth = createAuth(process.env.AUTH_USER, process.env.AUTH_PASS)

if (!process.env.MEDIA_ROOT) {
  console.error('[video-server] MEDIA_ROOT is not set. Copy .env.example to .env and set it.')
  process.exit(1)
}
if (!fs.existsSync(MEDIA_ROOT)) {
  console.error(`[video-server] MEDIA_ROOT does not exist: ${MEDIA_ROOT}`)
  process.exit(1)
}

const PUBLIC_DIR = path.join(__dirname, 'public')
const ASSETS = {
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/player.js': ['player.js', 'application/javascript; charset=utf-8']
}

function send (res, status, body, type = 'text/html; charset=utf-8') {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body))
  res.writeHead(status, {
    'Content-Type': type,
    'Content-Length': buf.length,
    'Cache-Control': 'no-cache'
  })
  res.end(buf)
}

function notFound (res, msg = '页面不存在') {
  send(res, 404, errorPage({ status: 404, message: msg, title: SITE_TITLE }))
}

function redirect (res, location, extraHeaders = {}) {
  res.writeHead(302, { Location: location, 'Cache-Control': 'no-store', ...extraHeaders })
  res.end()
}

function safeNext (raw) {
  const v = String(raw || '/')
  if (!v.startsWith('/') || v.startsWith('//')) return '/'
  return v
}

function readBody (req, limit = 4096) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', c => {
      size += c.length
      if (size > limit) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/** split a decoded pathname into safe segments */
function segmentsOf (pathname) {
  return pathname.split('/').map(s => s.trim()).filter(Boolean)
}

async function serveListing (req, res, segs, query) {
  const relPath = segs.join('/')
  const abs = resolveInside(MEDIA_ROOT, relPath)
  if (!abs) return notFound(res, '路径非法')

  const st = await fsp.stat(abs).catch(() => null)
  if (!st || !st.isDirectory()) return notFound(res, '目录不存在')

  const sort = ['name', 'size', 'time'].includes(query.get('sort')) ? query.get('sort') : 'name'
  const order = query.get('order') === 'desc' ? 'desc' : 'asc'
  const items = await readDir(abs, sort, order)

  send(res, 200, listingPage({
    title: SITE_TITLE,
    segs,
    items,
    hasParent: segs.length > 0,
    sort,
    order,
    relPath,
    showLogout: !!auth
  }))
}

async function serveWatch (req, res, segs) {
  const relPath = segs.join('/')
  const abs = resolveInside(MEDIA_ROOT, relPath)
  if (!abs) return notFound(res, '路径非法')

  const st = await fsp.stat(abs).catch(() => null)
  if (!st || !st.isFile()) return notFound(res, '文件不存在')

  const dirAbs = path.dirname(abs)
  const dirRel = segs.slice(0, -1).join('/')
  const siblings = await readDir(dirAbs, 'name', 'asc')

  const items = siblings
    .filter(e => e.video)
    .map(e => ({
      name: e.name,
      path: dirRel ? `${dirRel}/${e.name}` : e.name,
      size: e.size
    }))

  // attach matching .vtt subtitle if present
  const base = path.basename(abs, path.extname(abs))
  const names = new Set(siblings.map(s => s.name))
  const subtitles = []
  for (const cand of [`${base}.vtt`, `${base}.zh.vtt`, `${base}.cht.vtt`, `${base}.en.vtt`]) {
    if (names.has(cand)) {
      subtitles.push({
        label: cand === `${base}.vtt` ? '默认' : cand.slice(base.length + 1, -4),
        path: dirRel ? `${dirRel}/${cand}` : cand
      })
    }
  }

  send(res, 200, watchPage({
    title: SITE_TITLE,
    segs,
    relPath,
    items,
    current: relPath,
    subtitles,
    showLogout: !!auth
  }))
}

async function serveFile (req, res, segs, query) {
  const abs = resolveInside(MEDIA_ROOT, segs.join('/'))
  if (!abs) return notFound(res, '路径非法')

  const st = await fsp.stat(abs).catch(() => null)
  if (!st || !st.isFile()) return notFound(res, '文件不存在')

  const headers = {
    'Content-Type': mimeOf(abs),
    'Accept-Ranges': 'bytes',
    'Last-Modified': st.mtime.toUTCString(),
    'Cache-Control': 'public, max-age=3600'
  }
  if (query.get('dl') === '1') {
    headers['Content-Disposition'] =
      `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(abs))}`
  }

  const range = req.headers.range
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim())
    if (m) {
      let start = m[1] === '' ? null : Number(m[1])
      let end = m[2] === '' ? null : Number(m[2])
      if (start === null && end !== null) {
        start = Math.max(0, st.size - end)
        end = st.size - 1
      } else {
        if (start === null) start = 0
        if (end === null || end >= st.size) end = st.size - 1
      }
      if (start > end || start >= st.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${st.size}` })
        return res.end()
      }
      headers['Content-Range'] = `bytes ${start}-${end}/${st.size}`
      headers['Content-Length'] = end - start + 1
      res.writeHead(206, headers)
      if (req.method === 'HEAD') return res.end()
      return streamTo(fs.createReadStream(abs, { start, end }), res)
    }
  }

  headers['Content-Length'] = st.size
  res.writeHead(200, headers)
  if (req.method === 'HEAD') return res.end()
  streamTo(fs.createReadStream(abs), res)
}

function streamTo (stream, res) {
  stream.on('error', () => res.destroy())
  res.on('close', () => stream.destroy())
  stream.pipe(res)
}

function serveAsset (res, name) {
  const [file, type] = ASSETS[name]
  fs.readFile(path.join(PUBLIC_DIR, file), (err, buf) => {
    if (err) return notFound(res, '资源缺失')
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': buf.length,
      'Cache-Control': 'public, max-age=300'
    })
    res.end(buf)
  })
}

async function handleLogin (req, res) {
  if (!auth) return redirect(res, '/')
  let form
  try {
    form = new URLSearchParams(await readBody(req))
  } catch {
    return send(res, 413, errorPage({ status: 413, message: '请求过大', title: SITE_TITLE }))
  }
  const next = safeNext(form.get('next'))
  if (!auth.check(form.get('u') || '', form.get('p') || '')) {
    console.log('[video-server] login failed')
    await new Promise(r => setTimeout(r, 400))
    return send(res, 401, loginPage({ siteTitle: SITE_TITLE, next, error: '用户名或密码不正确' }))
  }
  const { value, maxAge } = auth.issue()
  console.log('[video-server] login ok')
  return redirect(res, next, {
    'Set-Cookie': `${auth.cookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`
  })
}

const server = http.createServer(async (req, res) => {
  const started = Date.now()
  try {
    const isWrite = req.method === 'POST'
    if (!isWrite && req.method !== 'GET' && req.method !== 'HEAD') {
      return send(res, 405, errorPage({ status: 405, message: '只支持 GET', title: SITE_TITLE }))
    }

    const url = new URL(req.url, 'http://localhost')
    const rawPath = decodeURI(url.pathname)
    const query = url.searchParams

    res.on('finish', () => {
      const ms = Date.now() - started
      console.log(`${res.statusCode} ${req.method} ${rawPath} ${ms}ms`)
    })

    if (ASSETS[rawPath]) return serveAsset(res, rawPath)
    if (rawPath === '/api/health') {
      return send(res, 200, JSON.stringify({ ok: true, root: MEDIA_ROOT, auth: !!auth }), 'application/json')
    }

    if (rawPath === '/login') {
      if (req.method === 'POST') return await handleLogin(req, res)
      if (!req.method.startsWith('GET') && req.method !== 'HEAD') {
        return send(res, 405, errorPage({ status: 405, message: '不支持的方法', title: SITE_TITLE }))
      }
      if (!auth) return redirect(res, '/')
      if (auth.isAuthed(parseCookies(req.headers.cookie))) return redirect(res, safeNext(query.get('next')))
      return send(res, 200, loginPage({ siteTitle: SITE_TITLE, next: safeNext(query.get('next')) }))
    }

    if (rawPath === '/logout') {
      return redirect(res, '/login', {
        'Set-Cookie': `${auth ? auth.cookieName : 'vod_sess'}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
      })
    }

    if (isWrite) {
      return send(res, 405, errorPage({ status: 405, message: '不支持的方法', title: SITE_TITLE }))
    }

    if (auth && !auth.isAuthed(parseCookies(req.headers.cookie))) {
      if (rawPath.startsWith('/f/')) {
        return send(res, 401, 'Unauthorized', 'text/plain; charset=utf-8')
      }
      const next = encodeURIComponent(rawPath + (url.search || ''))
      return redirect(res, `/login?next=${next}`)
    }

    const segs = segmentsOf(rawPath)
    if (!segs.length) return await serveListing(req, res, [], query)

    const [head, ...rest] = segs
    if (head === 'b') return await serveListing(req, res, rest, query)
    if (head === 'w') return await serveWatch(req, res, rest)
    if (head === 'f') return await serveFile(req, res, rest, query)

    return notFound(res)
  } catch (e) {
    console.error('[video-server]', e)
    send(res, 500, errorPage({ status: 500, message: '服务器错误', title: SITE_TITLE }))
  }
})

server.listen(PORT, HOST, () => {
  console.log(`[video-server] ${SITE_TITLE} listening on http://${HOST}:${PORT}`)
  console.log(`[video-server] media root: ${MEDIA_ROOT}`)
})
