'use strict'

const fsp = require('fs/promises')
const path = require('path')

const VIDEO_EXT = new Set([
  '.mp4', '.m4v', '.mkv', '.webm', '.mov', '.avi', '.wmv', '.flv',
  '.ts', '.m2ts', '.mpg', '.mpeg', '.rmvb', '.rm', '.3gp', '.ogv'
])

const SUB_EXT = new Set(['.vtt'])

const MIME = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.wmv': 'video/x-ms-wmv',
  '.flv': 'video/x-flv',
  '.ts': 'video/mp2t',
  '.m2ts': 'video/mp2t',
  '.mpg': 'video/mpeg',
  '.mpeg': 'video/mpeg',
  '.rmvb': 'application/vnd.rn-realmedia-vbr',
  '.3gp': 'video/3gpp',
  '.ogv': 'video/ogg',
  '.vtt': 'text/vtt; charset=utf-8',
  '.srt': 'text/plain; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf'
}

function isVideo (name) {
  return VIDEO_EXT.has(path.extname(name).toLowerCase())
}

function isSubtitle (name) {
  return SUB_EXT.has(path.extname(name).toLowerCase())
}

function mimeOf (name) {
  return MIME[path.extname(name).toLowerCase()] || 'application/octet-stream'
}

function humanSize (bytes) {
  if (!Number.isFinite(bytes)) return ''
  if (bytes < 1024) return bytes + ' B'
  const units = ['KB', 'MB', 'GB', 'TB', 'PB']
  let n = bytes / 1024
  let i = 0
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++ }
  return (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)) + ' ' + units[i]
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

function naturalCompare (a, b) {
  return collator.compare(a, b)
}

/**
 * Resolve a url-ish relative path inside root. Returns null when the request
 * tries to escape the media root.
 */
function resolveInside (root, relPath) {
  const cleaned = String(relPath || '').replace(/\\/g, '/').replace(/^\/+/, '')
  const abs = path.resolve(root, cleaned)
  const rel = path.relative(root, abs)
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null
  return abs
}

function dirUrl (relPath) {
  const segs = String(relPath || '').split('/').filter(Boolean)
  return segs.length ? '/b/' + segs.map(encodeURIComponent).join('/') : '/'
}

function watchUrl (relPath) {
  return '/w/' + String(relPath).split('/').filter(Boolean).map(encodeURIComponent).join('/')
}

/**
 * @returns {Promise<{name:string,dir:boolean,size:number,mtime:Date}|null>}
 */
async function statEntry (abs) {
  try {
    const st = await fsp.stat(abs)
    return st
  } catch {
    return null
  }
}

/**
 * Read one directory, folders first, natural sort.
 * sort: name | size | time
 */
async function readDir (abs, sort = 'name', order = 'asc') {
  let ents
  try {
    ents = await fsp.readdir(abs, { withFileTypes: true })
  } catch (e) {
    throw e
  }
  const items = []
  await Promise.all(ents.map(async ent => {
    if (ent.name.startsWith('.') || ent.name === 'System Volume Information') return
    const full = path.join(abs, ent.name)
    let st
    try {
      st = await fsp.stat(full)
    } catch {
      return
    }
    const isDir = st.isDirectory()
    items.push({
      name: ent.name,
      dir: isDir,
      size: isDir ? 0 : st.size,
      mtime: st.mtime,
      video: !isDir && isVideo(ent.name)
    })
  }))

  const sign = order === 'desc' ? -1 : 1
  items.sort((a, b) => {
    if (a.dir !== b.dir) return a.dir ? -1 : 1
    if (sort === 'size') return (a.size - b.size) * sign || naturalCompare(a.name, b.name)
    if (sort === 'time') return (a.mtime - b.mtime) * sign || naturalCompare(a.name, b.name)
    return naturalCompare(a.name, b.name) * sign
  })
  return items
}

module.exports = {
  VIDEO_EXT,
  isVideo,
  isSubtitle,
  mimeOf,
  humanSize,
  naturalCompare,
  resolveInside,
  dirUrl,
  watchUrl,
  statEntry,
  readDir
}
