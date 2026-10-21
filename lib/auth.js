'use strict'

const crypto = require('crypto')

const COOKIE = 'vod_sess'
const TTL_MS = 30 * 24 * 3600 * 1000

const digest = s => crypto.createHash('sha256').update(String(s)).digest()

/**
 * Stateless cookie auth. The signing key is derived from the credentials
 * themselves, so restarting the server keeps sessions valid and changing the
 * password invalidates every existing cookie.
 *
 * Returns null when AUTH_USER / AUTH_PASS are not both set (auth disabled).
 */
function createAuth (user, pass) {
  if (!user || !pass) return null

  const secret = digest(`video-server:${user}:${pass}`)
  const userHash = digest(user)
  const passHash = digest(pass)

  function sign (exp) {
    return crypto.createHmac('sha256', secret).update(String(exp)).digest('base64url')
  }

  function issue () {
    const exp = Date.now() + TTL_MS
    return { value: `${exp}.${sign(exp)}`, maxAge: Math.floor(TTL_MS / 1000) }
  }

  function verify (token) {
    if (!token || typeof token !== 'string') return false
    const dot = token.lastIndexOf('.')
    if (dot < 1) return false
    const exp = token.slice(0, dot)
    const sig = token.slice(dot + 1)
    if (!/^\d{10,16}$/.test(exp)) return false
    if (Number(exp) < Date.now()) return false
    const want = sign(exp)
    if (sig.length !== want.length) return false
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))
  }

  function check (u, p) {
    const okUser = crypto.timingSafeEqual(digest(u), userHash)
    const okPass = crypto.timingSafeEqual(digest(p), passHash)
    return okUser && okPass
  }

  function isAuthed (cookies) {
    return verify(cookies && cookies[COOKIE])
  }

  return { cookieName: COOKIE, issue, isAuthed, check }
}

function parseCookies (header) {
  const out = {}
  if (!header) return out
  for (const part of String(header).split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    const k = part.slice(0, eq).trim()
    if (!k) continue
    out[k] = decodeURIComponent(part.slice(eq + 1).trim())
  }
  return out
}

module.exports = { createAuth, parseCookies }
