/**
 * Jitter SDK — Public API
 *
 * Usage:
 *   <script src="https://cdn.jitter.dev/v1/jitter.min.js"></script>
 *   <script>Jitter.init({ siteKey: 'site_xxx' })</script>
 *
 * That's it. Every textarea gets biometric capture.
 * Call Jitter.score(element) on submit to get the badge.
 */

var JitterBox = require('./core/jitter-box').default || require('./core/jitter-box')

var instances = new Map()
var config = {
  siteKey: null,
  apiUrl: 'https://api.jitter.dev/v1',
  autoAttach: true,
  selector: 'textarea',
  showBadge: true,
  onScore: null,
}

// ── Verification Threshold ──────────────────────────────────────────

function getVerificationStatus() {
  var count = 0
  var firstReview = null
  try {
    count = parseInt(localStorage.getItem('jitter_review_count') || '0', 10)
    var ts = localStorage.getItem('jitter_first_review')
    if (ts) firstReview = parseInt(ts, 10)
  } catch (e) {}

  var daysSinceFirst = 0
  if (firstReview) {
    daysSinceFirst = Math.floor((Date.now() - firstReview) / (1000 * 60 * 60 * 24))
  }

  return {
    eligible: count >= 3 && daysSinceFirst >= 3,
    reviewCount: count,
    daysSinceFirst: daysSinceFirst,
  }
}

function recordReview() {
  try {
    var count = parseInt(localStorage.getItem('jitter_review_count') || '0', 10)
    localStorage.setItem('jitter_review_count', String(count + 1))
    if (!localStorage.getItem('jitter_first_review')) {
      localStorage.setItem('jitter_first_review', String(Date.now()))
    }
  } catch (e) {}
}

function applyVerification(result) {
  var status = getVerificationStatus()
  result.eligible = status.eligible
  result.reviewCount = status.reviewCount

  // Bot classification overrides everything — even eligible users
  if (result.classification === 'bot') return result

  // If not yet eligible, force 'building' regardless of WAR score
  if (!status.eligible) {
    result.classification = 'building'
  }

  return result
}

/**
 * Initialize Jitter on the page.
 * @param {Object} opts
 * @param {string} opts.siteKey - Your public site key (required)
 * @param {string} [opts.apiUrl] - API endpoint override
 * @param {boolean} [opts.autoAttach=true] - Auto-attach to all textareas
 * @param {string} [opts.selector='textarea'] - CSS selector for auto-attach
 * @param {boolean} [opts.showBadge=true] - Show inline badge
 * @param {Function} [opts.onScore] - Callback when a score is generated
 */
function init(opts) {
  if (!opts || !opts.siteKey) {
    throw new Error('Jitter.init() requires a siteKey. Get one at https://jitter.dev')
  }

  config.siteKey = opts.siteKey
  if (opts.apiUrl) config.apiUrl = opts.apiUrl
  if (opts.autoAttach === false) config.autoAttach = false
  if (opts.selector) config.selector = opts.selector
  if (opts.showBadge === false) config.showBadge = false
  if (opts.onScore) config.onScore = opts.onScore

  if (config.autoAttach) {
    // Attach to existing textareas
    var elements = document.querySelectorAll(config.selector)
    for (var i = 0; i < elements.length; i++) {
      attach(elements[i])
    }

    // Watch for dynamically added textareas
    if (typeof MutationObserver !== 'undefined') {
      var observer = new MutationObserver(function (mutations) {
        for (var j = 0; j < mutations.length; j++) {
          var added = mutations[j].addedNodes
          for (var k = 0; k < added.length; k++) {
            var node = added[k]
            if (node.nodeType !== 1) continue
            if (node.matches && node.matches(config.selector)) {
              attach(node)
            }
            // Check children too
            if (node.querySelectorAll) {
              var children = node.querySelectorAll(config.selector)
              for (var l = 0; l < children.length; l++) {
                attach(children[l])
              }
            }
          }
        }
      })
      observer.observe(document.body, { childList: true, subtree: true })
    }
  }
}

/**
 * Manually attach Jitter to a specific element.
 * @param {HTMLElement} el - The input/textarea element
 * @returns {Object} JitterBox instance with score() and detach()
 */
function attach(el) {
  if (!el || instances.has(el)) return instances.get(el)

  var instance = JitterBox.attach(el)
  instances.set(el, instance)

  // Mark element as jitter-enabled
  el.setAttribute('data-jitter', 'active')

  return instance
}

/**
 * Score a specific element's typing session.
 * @param {HTMLElement} [el] - Element to score. If omitted, scores the most recently active.
 * @returns {Object|null} Score result with WAR, classification, session_token
 */
function score(el) {
  var instance = null

  if (el) {
    instance = instances.get(el)
  } else {
    // Find the most recently active instance
    instances.forEach(function (inst) {
      instance = inst
    })
  }

  if (!instance) return null

  var result = instance.score()
  if (!result) return null

  // Record this review and apply verification threshold
  recordReview()
  result = applyVerification(result)

  // Generate session token for server-side verification
  result.session_token = generateSessionToken(result)

  if (config.onScore) config.onScore(result)

  return result
}

/**
 * Detach Jitter from an element.
 */
function detach(el) {
  var instance = instances.get(el)
  if (instance) {
    instance.detach()
    instances.delete(el)
    el.removeAttribute('data-jitter')
  }
}

/**
 * Detach from all elements.
 */
function detachAll() {
  instances.forEach(function (instance, el) {
    instance.detach()
    el.removeAttribute('data-jitter')
  })
  instances.clear()
}

/**
 * Send session to Jitter API for passport merge.
 * Returns a session token the site can verify server-side.
 */
function generateSessionToken(result) {
  // For MVP: encode the profile stats as a signed token
  // In production: this hits the API and returns a server-generated token
  var payload = {
    site_key: config.siteKey,
    war: result.war,
    classification: result.classification,
    flags: result.flags,
    profile: result.profile,
    ts: Date.now(),
  }

  // Base64 encode for transport (NOT security — server validates with secret key)
  try {
    return 'jtok_' + btoa(JSON.stringify(payload))
  } catch (e) {
    return null
  }
}

// ── Export ──────────────────────────────────────────────────────────────

var Jitter = {
  init: init,
  attach: attach,
  score: score,
  detach: detach,
  detachAll: detachAll,
  createBadge: typeof createBadge !== 'undefined' ? createBadge : null,
  insertBadge: typeof insertBadge !== 'undefined' ? insertBadge : null,
  getVerificationStatus: getVerificationStatus,
  version: '1.0.0',
}

if (typeof window !== 'undefined') {
  window.Jitter = Jitter
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Jitter
  module.exports.getVerificationStatus = getVerificationStatus
  module.exports.recordReview = recordReview
  module.exports.applyVerification = applyVerification
}
