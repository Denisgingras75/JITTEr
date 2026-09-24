/**
 * jitter-capture.js — JITTEr portable capture layer (WGH first integration)
 * Drop-in. Zero dependencies beyond jitter.min.js loaded before this file.
 * Attaches silently to any textarea with data-jitter="true" attribute.
 *
 * Usage:
 *   <textarea data-jitter="true" id="review-text"></textarea>
 *   <script src="jitter.min.js"></script>
 *   <script src="jitter-capture.js"></script>
 *
 * Setup (optional attestation):
 *   JitterCapture.init({ siteKey: 'wgh', attestUrl: 'https://xxx.supabase.co/functions/v1/attest' });
 *
 * On submit:
 *   var result = await JitterCapture.scoreAndAttest('review-text', siteUserId);
 *   // result = { war, classification, flags, badge, meta,
 *   //            badge_hash, verifyUrl, attestation, server_signature, attestError }
 *
 * Identity: on first use this origin gets a P-256 device key, generated
 * non-extractable and kept in IndexedDB. Badges are signed with it and bound
 * to the text (SHA-256) and page. The attestation server tracks device age
 * and rate limits by that key; the site's own user id travels along as an
 * opaque reference. No login, nothing to configure.
 */

;(function(global) {

  var sessions = typeof WeakMap !== 'undefined' ? new WeakMap() : null
  var sessionList = [] // fallback for no WeakMap

  function getSession(el) {
    if (sessions) return sessions.get(el)
    for (var i = 0; i < sessionList.length; i++) {
      if (sessionList[i].el === el) return sessionList[i].session
    }
    return null
  }

  function setSession(el, s) {
    if (sessions) { sessions.set(el, s); return }
    for (var i = 0; i < sessionList.length; i++) {
      if (sessionList[i].el === el) { sessionList[i].session = s; return }
    }
    sessionList.push({ el: el, session: s })
  }

  function createWidgetSession() {
    return {
      flightTimes: [],
      dwellTimes: [],
      keyDownTimes: {},
      lastKeydown: 0,
      humanChars: 0,
      alienChars: 0,
      pasteLengths: [],
      backspaceCount: 0,
      pauseCount: 0,

      pasteCount: 0,
      copyCount: 0,
      focusCount: 0,
      blurCount: 0,
      timeToFirstKeystroke: null,
      firstFocusTime: null,
      firstKeystrokeTime: null,
      totalFocusMs: 0,
      lastFocusTime: null,
      sessionStartTime: Date.now(),
    }
  }

  function attachToElement(el) {
    if (getSession(el)) return
    var session = createWidgetSession()
    setSession(el, session)

    el.addEventListener('keydown', function(e) {
      // Page scripts can dispatch KeyboardEvents; only real input counts.
      if (!e.isTrusted || e.repeat || typeof e.key !== 'string') return
      var now = performance.now()
      var s = getSession(el)

      if (s.firstKeystrokeTime === null && s.firstFocusTime !== null) {
        s.firstKeystrokeTime = now
        s.timeToFirstKeystroke = now - s.firstFocusTime
      }

      if (e.key === 'Backspace' || e.key === 'Delete') {
        s.backspaceCount++
        return
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        if (s.lastKeydown > 0) {
          var gap = now - s.lastKeydown
          if (gap > 2000) s.pauseCount++
          if (gap > 20 && gap < 2000) {
            s.flightTimes.push(gap)
          }
        }
        s.humanChars++
        s.keyDownTimes[e.key.toLowerCase()] = now
        s.lastKeydown = now
      }
    })

    el.addEventListener('keyup', function(e) {
      if (!e.isTrusted || typeof e.key !== 'string') return
      var now = performance.now()
      var s = getSession(el)
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        // Dwell is this key's own keydown -> keyup; with rollover the last
        // keydown may belong to the next key.
        var keyLower = e.key.toLowerCase()
        var down = s.keyDownTimes[keyLower]
        if (down > 0) {
          var dwell = now - down
          if (dwell > 0 && dwell < 500) {
            s.dwellTimes.push(dwell)
          }
          delete s.keyDownTimes[keyLower]
        }
      }
    })

    el.addEventListener('paste', function(e) {
      if (!e.isTrusted) return
      var s = getSession(el)
      s.pasteCount++
      var text = e.clipboardData ? e.clipboardData.getData('text/plain') : ''
      if (text.length > 0) {
        s.alienChars += text.length
        s.pasteLengths.push(text.length)
      }
    })

    el.addEventListener('copy', function() {
      getSession(el).copyCount++
    })

    el.addEventListener('focus', function() {
      var now = performance.now()
      var s = getSession(el)
      s.focusCount++
      s.lastFocusTime = now
      if (s.firstFocusTime === null) s.firstFocusTime = now
    })

    el.addEventListener('blur', function() {
      var now = performance.now()
      var s = getSession(el)
      s.blurCount++
      if (s.lastFocusTime !== null) {
        s.totalFocusMs += now - s.lastFocusTime
        s.lastFocusTime = null
      }
    })
  }

  function resolveElement(elOrId) {
    return typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId
  }

  function scoreElement(elOrId) {
    var el = resolveElement(elOrId)
    if (!el) return { war: null, classification: 'untracked', flags: [], badge: null, meta: null }

    var s = getSession(el)
    if (!s) return { war: null, classification: 'untracked', flags: [], badge: null, meta: null }

    if (s.flightTimes.length < 10) {
      return {
        war: null,
        classification: 'insufficient_data',
        flags: ['too_short'],
        badge: null,
        meta: buildMeta(s),
      }
    }

    var captureData = {
      flightTimes: s.flightTimes,
      dwellTimes: s.dwellTimes,
      humanChars: s.humanChars,
      alienChars: s.alienChars,
      pasteLengths: s.pasteLengths,
      backspaceCount: s.backspaceCount,
      pauseCount: s.pauseCount,
    }

    var result = null
    if (global.JitterBox && global.JitterBox.scoreRaw) {
      result = global.JitterBox.scoreRaw(captureData)
    }

    if (!result) {
      return {
        war: null,
        classification: 'no_scorer',
        flags: [],
        badge: null,
        meta: buildMeta(s),
        captureData: captureData,
      }
    }

    return {
      war: result.war,
      raw_war: result.raw_war,
      classification: result.classification,
      flags: result.flags,
      badge: buildBadge(result),
      meta: buildMeta(s),
      session: {
        keys: s.humanChars, pastes: s.pasteCount, pastedChars: s.alienChars,
        meanDwell: s.dwellTimes.length ? Math.round(s.dwellTimes.reduce(function(a, b) { return a + b }, 0) / s.dwellTimes.length) : null,
      },
    }
  }

  function buildMeta(s) {
    return {
      pasteCount: s.pasteCount,
      copyCount: s.copyCount,
      focusCount: s.focusCount,
      blurCount: s.blurCount,
      timeToFirstKeystroke: s.timeToFirstKeystroke,
      totalFocusMs: Math.round(s.totalFocusMs),
      sessionDurationMs: Date.now() - s.sessionStartTime,
      backspaceCount: s.backspaceCount,
      pauseCount: s.pauseCount,
    }
  }

  function buildBadge(result) {
    var host = document.createElement('span')
    var shadow = host.attachShadow({ mode: 'closed' })

    var color = result.war >= 0.80 ? '#00BA7C'
      : result.war >= 0.50 ? '#F59E0B'
      : '#EF4444'

    var label = result.war >= 0.80 ? 'Verified Human'
      : result.war >= 0.50 ? 'Unverified'
      : 'Suspicious'

    shadow.innerHTML =
      '<style>' +
      '.badge { display: inline-flex; align-items: center; gap: 5px; ' +
      'background: ' + color + '18; color: ' + color + '; ' +
      'border: 1px solid ' + color + '; border-radius: 100px; ' +
      'padding: 2px 10px; font-size: 11px; font-family: sans-serif; ' +
      'font-weight: 600; cursor: default; }' +
      '.dot { width: 6px; height: 6px; border-radius: 50%; background: ' + color + '; }' +
      '</style>' +
      '<span class="badge" title="WAR: ' + result.war + '">' +
      '<span class="dot"></span>' + label +
      '</span>'

    return host
  }

  function resetElement(elOrId) {
    var el = resolveElement(elOrId)
    if (el) setSession(el, createWidgetSession())
  }

  function autoAttach() {
    var els = document.querySelectorAll('textarea[data-jitter="true"]')
    for (var i = 0; i < els.length; i++) attachToElement(els[i])

    if (typeof MutationObserver !== 'undefined') {
      var observer = new MutationObserver(function(mutations) {
        for (var j = 0; j < mutations.length; j++) {
          var added = mutations[j].addedNodes
          for (var k = 0; k < added.length; k++) {
            var node = added[k]
            if (node.nodeType !== 1) continue
            if (node.matches && node.matches('textarea[data-jitter="true"]')) attachToElement(node)
            if (node.querySelectorAll) {
              var children = node.querySelectorAll('textarea[data-jitter="true"]')
              for (var l = 0; l < children.length; l++) attachToElement(children[l])
            }
          }
        }
      })
      observer.observe(document.body, { childList: true, subtree: true })
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', autoAttach)
    } else {
      autoAttach()
    }
  }

  // --- Device key ---
  // One P-256 key pair per origin, generated non-extractable and kept in
  // IndexedDB. Its public key is the device's identity on the server.

  var DB_NAME = 'jitter-device'
  var deviceKeyPromise = null

  function openDb() {
    return new Promise(function(resolve, reject) {
      var req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = function() { req.result.createObjectStore('keys') }
      req.onsuccess = function() { resolve(req.result) }
      req.onerror = function() { reject(req.error) }
    })
  }

  function idbGet(db, key) {
    return new Promise(function(resolve, reject) {
      var req = db.transaction('keys').objectStore('keys').get(key)
      req.onsuccess = function() { resolve(req.result) }
      req.onerror = function() { reject(req.error) }
    })
  }

  function idbPut(db, key, value) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction('keys', 'readwrite')
      tx.objectStore('keys').put(value, key)
      tx.oncomplete = function() { resolve() }
      tx.onerror = function() { reject(tx.error) }
    })
  }

  function getDeviceKey() {
    if (!deviceKeyPromise) {
      deviceKeyPromise = (async function() {
        var db = await openDb()
        var pair = await idbGet(db, 'device')
        if (!pair) {
          pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'])
          await idbPut(db, 'device', pair)
        }
        var jwk = await crypto.subtle.exportKey('jwk', pair.publicKey)
        return { pair: pair, jwk: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y } }
      })().catch(function(e) { deviceKeyPromise = null; throw e })
    }
    return deviceKeyPromise
  }

  // Canonical JSON: keys sorted at every depth, undefined dropped. Must match
  // what the attestation server (supabase/functions/_shared/trust.ts) computes.
  function canonicalJson(value) {
    if (value === undefined) return 'null'
    if (value === null || typeof value !== 'object') return JSON.stringify(value)
    if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']'
    return '{' + Object.keys(value).sort()
      .filter(function(k) { return value[k] !== undefined })
      .map(function(k) { return JSON.stringify(k) + ':' + canonicalJson(value[k]) })
      .join(',') + '}'
  }

  function toBase64(buf) {
    var bytes = new Uint8Array(buf), s = ''
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
    return btoa(s)
  }

  async function sha256Hex(text) {
    var digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    return Array.from(new Uint8Array(digest)).map(function(b) { return b.toString(16).padStart(2, '0') }).join('')
  }

  // Same normalisation as the extension's verify page, so pasted text matches.
  function textHash(text) {
    return sha256Hex(String(text).replace(/\r\n?/g, '\n').trim())
  }

  async function signBadge(badge) {
    var device = await getDeviceKey()
    var sig = await crypto.subtle.sign({ name: 'ECDSA', hash: { name: 'SHA-256' } }, device.pair.privateKey,
      new TextEncoder().encode(canonicalJson(badge)))
    return toBase64(sig)
  }

  // --- Config + Attestation ---

  var config = { siteKey: 'wgh', attestUrl: null, timeoutMs: 8000 }

  function init(opts) {
    if (opts.siteKey) config.siteKey = opts.siteKey
    if (opts.attestUrl) config.attestUrl = opts.attestUrl
    if (opts.timeoutMs) config.timeoutMs = opts.timeoutMs
  }

  /**
   * Scores the element and, when attestUrl is configured, signs the result
   * with the device key and sends it to the attestation server. The server's
   * record (device age, cap, verdict, countersignature) comes back on the
   * result. Attestation failures are reported on result.attestError and
   * never throw: the site always gets the local score.
   * @param {string|HTMLElement} elOrId
   * @param {string} [siteUser] the site's own id for this user, passed along as an opaque reference
   */
  async function scoreAndAttest(elOrId, siteUser) {
    var el = resolveElement(elOrId)
    var result = scoreElement(el)
    if (!config.attestUrl || result.war == null) return result

    try {
      var device = await getDeviceKey()
      var badge = {
        version: '3.0',
        type: 'capture',
        site_key: config.siteKey,
        site_user: siteUser ? String(siteUser).slice(0, 128) : null,
        war: result.war,
        war_uncapped: result.war,
        raw_war: result.raw_war == null ? null : result.raw_war,
        war_flags: result.flags || [],
        keys: result.session.keys,
        pastes: result.session.pastes,
        pastedChars: result.session.pastedChars,
        text_hash: await textHash(el.value || ''),
        url: location.origin + location.pathname,
        minted_at: new Date().toISOString(),
        publicKeyJwk: device.jwk,
        meta: result.meta,
      }
      var signature = await signBadge(badge)
      result.signed = { badge: badge, signature: signature }

      var controller = typeof AbortController !== 'undefined' ? new AbortController() : null
      var timer = controller ? setTimeout(function() { controller.abort() }, config.timeoutMs) : null
      var res
      try {
        res = await fetch(config.attestUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ site_key: config.siteKey, badge: badge, signature: signature }),
          signal: controller ? controller.signal : undefined,
        })
      } finally {
        if (timer) clearTimeout(timer)
      }
      var data = null
      try { data = await res.json() } catch (e) { data = null }
      if (!res.ok || !data || !data.badge_hash) {
        result.attestError = { status: res.status, error: data && data.error ? data.error : 'attest_failed' }
        return result
      }
      result.badge_hash = data.badge_hash
      result.attestation = data.attestation || null
      result.server_signature = data.server_signature || null
      result.server_key_id = data.server_key_id || null
      if (data.attestation && data.attestation.classification) result.classification = data.attestation.classification
      result.verifyUrl = config.attestUrl.replace(/\/attest$/, '/verify') + '?hash=' + data.badge_hash
      return result
    } catch (e) {
      // Never block: attestation is additive
      result.attestError = { status: 0, error: e && e.name === 'AbortError' ? 'timeout' : 'network' }
      return result
    }
  }

  global.JitterCapture = {
    init: init,
    attach: attachToElement,
    score: scoreElement,
    scoreAndAttest: scoreAndAttest,
    reset: resetElement,
    canonicalJson: canonicalJson,
    textHash: textHash,
  }

})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this)
