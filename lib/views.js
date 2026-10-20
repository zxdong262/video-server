'use strict'

const { humanSize, dirUrl, watchUrl } = require('./fsx')

function esc (s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function stamp (d) {
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function layout ({ title, body, bodyClass = '' }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<title>${esc(title)}</title>
<link rel="icon" href="data:,">
<link rel="stylesheet" href="/style.css">
</head>
<body class="${bodyClass}">
${body}
</body>
</html>`
}

function crumbs (segs, rootLabel, count) {
  const parts = [`<a href="/">${esc(rootLabel)}</a>`]
  let acc = ''
  segs.forEach((s, i) => {
    acc = acc ? acc + '/' + s : s
    const last = i === segs.length - 1
    parts.push(last
      ? `<span>${esc(s)}</span>`
      : `<a href="${dirUrl(acc)}">${esc(s)}</a>`)
  })
  return `<header class="bar">
  <nav class="crumbs">${parts.join('<i>/</i>')}</nav>
  ${count == null ? '' : `<span class="count">${count}</span>`}
</header>`
}

function sortLink (label, key, cur, order, base) {
  const active = cur === key
  const next = active && order === 'asc' ? 'desc' : 'asc'
  const mark = active ? (order === 'asc' ? ' ↑' : ' ↓') : ''
  return `<a class="sort${active ? ' on' : ''}" href="${base}?sort=${key}&order=${next}">${label}${mark}</a>`
}

function listingPage ({ title, segs, items, hasParent, sort, order, relPath }) {
  const base = dirUrl(relPath)
  const rows = []

  if (hasParent) {
    const parent = segs.slice(0, -1).join('/')
    rows.push(`<tr class="up"><td><a href="${dirUrl(parent)}">..</a></td><td></td><td></td></tr>`)
  }

  for (const it of items) {
    const childPath = relPath ? relPath + '/' + it.name : it.name
    const href = it.dir ? dirUrl(childPath) : (it.video ? watchUrl(childPath) : '/f/' + childPath.split('/').map(encodeURIComponent).join('/'))
    const cls = it.dir ? 'dir' : it.video ? 'vid' : 'file'
    const name = it.dir ? it.name + '/' : it.name
    rows.push(`<tr class="${cls}"><td><a href="${href}">${esc(name)}</a></td><td class="num">${it.dir ? '' : humanSize(it.size)}</td><td class="num dim">${stamp(it.mtime)}</td></tr>`)
  }

  if (!rows.length) rows.push('<tr><td colspan="3" class="empty">空目录</td></tr>')

  const nVideos = items.filter(i => i.video).length
  const count = items.length + (nVideos ? ` · ${nVideos} 视频` : '')

  const body = `${crumbs(segs, title, count)}
<main>
  <table class="list">
    <thead><tr>
      <th>${sortLink('名称', 'name', sort, order, base)}</th>
      <th class="num">${sortLink('大小', 'size', sort, order, base)}</th>
      <th class="num">${sortLink('修改时间', 'time', sort, order, base)}</th>
    </tr></thead>
    <tbody>
${rows.join('\n')}
    </tbody>
  </table>
</main>`

  return layout({ title: segs.length ? `${segs[segs.length - 1]} — ${title}` : title, body })
}

function watchPage ({ title, segs, relPath, items, current, subtitles }) {
  const parentSegs = segs.slice(0, -1)
  const parentPath = parentSegs.join('/')
  const data = {
    current,
    items: items.map(i => ({
      p: i.path,
      n: i.name,
      s: i.size,
      sub: i.sub || null
    }))
  }

  const pl = items.map((i, idx) => `<li class="pl-item${i.path === current ? ' on' : ''}" data-path="${esc(i.path)}" data-idx="${idx}">
    <span class="pl-name">${esc(i.name)}</span>
    <span class="pl-size">${humanSize(i.size)}</span>
    <i class="pl-prog"></i>
  </li>`).join('\n')

  const subTags = subtitles.map(s =>
    `<track kind="subtitles" label="${esc(s.label)}" srclang="zh" src="/f/${s.path.split('/').map(encodeURIComponent).join('/')}" default>`).join('')

  const body = `${crumbs(parentSegs, title, null)}
<main class="watch">
  <section class="stage">
    <video id="v" controls autoplay playsinline preload="metadata" src="/f/${current.split('/').map(encodeURIComponent).join('/')}">
      ${subTags}
    </video>
    <div class="now">
      <h1 id="title">${esc(current.split('/').pop())}</h1>
      <div class="hint">空格 播放/暂停 · ←/→ 5 秒 · ↑/↓ 上下集 · F 全屏</div>
    </div>
  </section>
  <aside class="side">
    <div class="side-head"><a href="${dirUrl(parentPath)}">返回目录</a><span>${items.length} 个视频</span></div>
    <ol class="pl" id="pl">
${pl}
    </ol>
  </aside>
</main>
<script id="vod-data" type="application/json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
<script src="/player.js"></script>`

  return layout({ title: `${current.split('/').pop()} — ${title}`, body, bodyClass: 'watch-body' })
}

function errorPage ({ status, message, title }) {
  const body = `<header class="bar"><nav class="crumbs"><a href="/">${esc(title)}</a></nav></header>
<main class="err">
  <p class="code">${status}</p>
  <p>${esc(message)}</p>
</main>`
  return layout({ title: `${status} ${message}`, body })
}

module.exports = { listingPage, watchPage, errorPage, esc }
