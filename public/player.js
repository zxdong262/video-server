(function () {
  'use strict'

  var dataEl = document.getElementById('vod-data')
  var video = document.getElementById('v')
  var titleEl = document.getElementById('title')
  var plEl = document.getElementById('pl')
  if (!dataEl || !video) return

  var data = JSON.parse(dataEl.textContent)
  var items = data.items
  var current = data.current
  var POS = 'vod:pos:'

  function encodePath (p) {
    return p.split('/').map(encodeURIComponent).join('/')
  }

  function baseName (p) {
    return p.split('/').pop()
  }

  function readPos (p) {
    try {
      var raw = localStorage.getItem(POS + p)
      if (!raw) return null
      var v = JSON.parse(raw)
      return v && typeof v.t === 'number' ? v : null
    } catch (e) {
      return null
    }
  }

  function writePos (p, t, d) {
    try {
      if (!t || t < 3) localStorage.removeItem(POS + p)
      else localStorage.setItem(POS + p, JSON.stringify({ t: Math.floor(t), d: Math.floor(d || 0) }))
    } catch (e) {}
  }

  function paintProgress () {
    for (var i = 0; i < plEl.children.length; i++) {
      var li = plEl.children[i]
      var bar = li.querySelector('.pl-prog')
      if (!bar) continue
      var p = readPos(li.getAttribute('data-path'))
      var pct = p && p.d ? Math.min(100, (p.t / p.d) * 100) : 0
      bar.style.width = pct + '%'
    }
  }

  function markActive (path) {
    for (var i = 0; i < plEl.children.length; i++) {
      var li = plEl.children[i]
      var on = li.getAttribute('data-path') === path
      li.classList.toggle('on', on)
      if (on && li.scrollIntoView) {
        li.scrollIntoView({ block: 'nearest' })
      }
    }
  }

  function load (path, opts) {
    opts = opts || {}
    var prev = current
    if (prev && prev !== path) writePos(prev, video.currentTime, video.duration)

    current = path
    video.src = '/f/' + encodePath(path)
    titleEl.textContent = baseName(path)
    markActive(path)
    if (opts.push !== false) {
      history.pushState({ path: path }, '', '/w/' + encodePath(path))
    }

    var saved = readPos(path)
    if (saved && saved.t > 5) {
      var apply = function () {
        if (video.duration && saved.t < video.duration - 5) video.currentTime = saved.t
        video.removeEventListener('loadedmetadata', apply)
      }
      video.addEventListener('loadedmetadata', apply)
    }
    var p = video.play()
    if (p && p.catch) p.catch(function () {})
    paintProgress()
  }

  function step (delta) {
    var i = items.findIndex(function (it) { return it.p === current })
    if (i < 0) return
    var n = items[i + delta]
    if (!n) return
    load(n.p)
  }

  var saveTimer = 0
  video.addEventListener('timeupdate', function () {
    var now = Date.now()
    if (now - saveTimer < 4000) return
    saveTimer = now
    writePos(current, video.currentTime, video.duration)
    paintProgress()
  })

  video.addEventListener('ended', function () {
    writePos(current, 0, 0)
    paintProgress()
    step(1)
  })

  video.addEventListener('error', function () {
    if (!video.getAttribute('src')) return
    var hint = document.querySelector('.now .hint')
    if (hint) hint.textContent = '浏览器无法解码该文件，可尝试下载后用本地播放器打开'
  })

  plEl.addEventListener('click', function (e) {
    var li = e.target.closest ? e.target.closest('.pl-item') : null
    if (!li) return
    var p = li.getAttribute('data-path')
    if (p && p !== current) load(p)
  })

  document.addEventListener('keydown', function (e) {
    if (e.target && /input|textarea/i.test(e.target.tagName)) return
    var k = e.key
    if (k === ' ') {
      e.preventDefault()
      if (video.paused) video.play(); else video.pause()
    } else if (k === 'ArrowRight') {
      e.preventDefault(); video.currentTime += 5
    } else if (k === 'ArrowLeft') {
      e.preventDefault(); video.currentTime -= 5
    } else if (k === 'ArrowUp') {
      e.preventDefault(); step(-1)
    } else if (k === 'ArrowDown') {
      e.preventDefault(); step(1)
    } else if (k === 'f' || k === 'F') {
      if (document.fullscreenElement) document.exitFullscreen()
      else if (video.requestFullscreen) video.requestFullscreen()
    } else if (k === 'm' || k === 'M') {
      video.muted = !video.muted
    }
  })

  window.addEventListener('popstate', function (e) {
    var p = (e.state && e.state.path) || decodeURI(location.pathname.replace(/^\/w\//, ''))
    if (p && p !== current) load(p, { push: false })
  })

  history.replaceState({ path: current }, '', location.pathname + location.search)
  paintProgress()
  video.play().catch(function () {})
})()
