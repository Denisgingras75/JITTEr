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
 *   JitterCapture.init({
 *     siteKey: 'wgh',
 *     attestProxyUrl: 'https://wgh.app/api/jitter-attest', // site backend, holds secret + signs
 *     verifyUrlBase:  'https://xxx.supabase.co/functions/v1/verify',
 *   });
 *
 * On submit:
 *   var result = await JitterCapture.scoreAndAttest('review-text', userId);
 *   // result = { war, classification, flags, badge, meta, badge_hash, verifyUrl }
 *   // NOTE: result.war is LOCAL ONLY (live UI). The server scores authoritatively
 *   //       from the raw capture; the numeric score is never sent or returned.
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
      lastKeydown: 0,
      lastKeydownTime: 0,
      humanChars: 0,
      alienChars: 0,
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
        s.lastKeydownTime = now
        s.lastKeydown = now
      }
    })

    el.addEventListener('keyup', function(e) {
      var now = performance.now()
      var s = getSession(el)
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && s.lastKeydownTime > 0) {
        var dwell = now - s.lastKeydownTime
        if (dwell > 0 && dwell < 500) {
          s.dwellTimes.push(dwell)
        }
      }
    })

    el.addEventListener('paste', function(e) {
      var s = getSession(el)
      s.pasteCount++
      var text = e.clipboardData ? e.clipboardData.getData('text/plain') : ''
      if (text.length > 0) s.alienChars += text.length
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

  function scoreElement(elOrId) {
    var el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId
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
      // Raw timing arrays travel with the result so scoreAndAttest can POST them
      // to the signing proxy. The server re-scores authoritatively; result.war
      // above is LOCAL ONLY (live UI feedback) and is never sent.
      captureData: captureData,
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
    var el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId
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

  // --- Config + Attestation ---

  // attestProxyUrl points at the SITE'S OWN backend signing proxy (which holds
  // the per-site secret and forwards to JITTEr's attest endpoint). The site
  // secret is never shipped in the browser bundle. verifyUrlBase is JITTEr's
  // public verify function used to build the badge's verification link.
  var config = { siteKey: 'wgh', attestProxyUrl: null, verifyUrlBase: null }

  function init(opts) {
    if (opts.siteKey) config.siteKey = opts.siteKey
    if (opts.attestProxyUrl) config.attestProxyUrl = opts.attestProxyUrl
    if (opts.verifyUrlBase) config.verifyUrlBase = opts.verifyUrlBase
  }

  // HARDENED: instead of POSTing a client-computed war_score (forgeable), we POST
  // the raw capture arrays. The site's backend signs the body (HMAC over the
  // shared secret) and forwards to JITTEr's attest endpoint, which scores
  // authoritatively. We never send — or receive — the numeric score.
  //
  //   Browser → site backend (/api/jitter-attest, holds secret, signs) → JITTEr attest
  //
  // See sdk/site-proxy-reference.js for the signing proxy.
  function scoreAndAttest(elOrId, userId) {
    var result = scoreElement(elOrId)

    // No attest if we lack what we need. result.war here is LOCAL ONLY — used for
    // immediate UI feedback (the badge). It is never sent to the server.
    if (!config.attestProxyUrl || !userId || result.war == null) {
      return Promise.resolve(result)
    }

    // Send RAW CAPTURE, not the score. The site's backend signs + forwards.
    var body = {
      user_id: userId,
      capture: result.captureData || {
        flightTimes: [], dwellTimes: [], humanChars: 0,
        alienChars: 0, backspaceCount: 0, pauseCount: 0,
      },
      meta: result.meta,
    }

    return fetch(config.attestProxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(function(res) { return res.json() })
      .then(function(data) {
        // Server returns classification + hash ONLY. It does not return a score.
        result.classification = data.classification || result.classification
        result.badge_hash = data.badge_hash || null
        result.time_cap = data.time_cap
        if (data.badge_hash && config.verifyUrlBase) {
          result.verifyUrl = config.verifyUrlBase + '?hash=' + data.badge_hash
        }
        // Re-render the badge from the SERVER classification, not the local score,
        // so the visible badge matches the authoritative verdict.
        result.badge = buildBadgeFromClassification(data.classification)
        return result
      })
      .catch(function() {
        // Never block — attestation is additive
        return result
      })
  }

  // Badge built from classification label only — no score in the DOM.
  function buildBadgeFromClassification(classification) {
    var host = document.createElement('span')
    var shadow = host.attachShadow({ mode: 'closed' })
    var map = {
      verified:   ['#00BA7C', 'Verified Human'],
      suspicious: ['#F59E0B', 'Unverified'],
      bot:        ['#EF4444', 'Suspicious'],
      building:   ['#6B7280', 'Building Trust'],
    }
    var pair = map[classification] || map.suspicious
    var color = pair[0], label = pair[1]
    shadow.innerHTML =
      '<style>.badge{display:inline-flex;align-items:center;gap:5px;background:' + color +
      '18;color:' + color + ';border:1px solid ' + color +
      ';border-radius:100px;padding:2px 10px;font-size:11px;font-family:sans-serif;font-weight:600}' +
      '.dot{width:6px;height:6px;border-radius:50%;background:' + color + '}</style>' +
      '<span class="badge"><span class="dot"></span>' + label + '</span>'
    // NOTE: no title="WAR: ..." — the score never enters the DOM.
    return host
  }

  global.JitterCapture = {
    init: init,
    attach: attachToElement,
    score: scoreElement,
    scoreAndAttest: scoreAndAttest,
    reset: resetElement,
  }

})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this)
