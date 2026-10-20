'use strict'

const fs = require('fs')
const path = require('path')

/**
 * Minimal .env reader. Existing process.env values win, so anything can be
 * overridden from the command line.
 */
function loadEnv (file = path.join(__dirname, '..', '.env')) {
  const abs = path.resolve(file)
  if (!fs.existsSync(abs)) return false
  const text = fs.readFileSync(abs, 'utf8')
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 1) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if (val.length > 1 &&
      ((val.startsWith('"') && val.endsWith('"')) ||
       (val.startsWith("'") && val.endsWith("'")))) {
      val = val.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = val
  }
  return true
}

module.exports = { loadEnv }
