/**
 * Jitter Badge — Visible trust indicator
 *
 * Renders a small badge next to content showing verification status.
 * Uses Shadow DOM so host site styles can't break it.
 *
 * Badges:
 *   verified  — "Human Verified" green checkmark
 *   suspicious — "Under Review" yellow warning
 *   bot       — "Automated" red X
 *   building  — "Building Trust" gray progress
 */

var BADGE_STYLES = [
  ':host { display: inline-flex; align-items: center; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }',
  '.jitter-badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; line-height: 16px; white-space: nowrap; }',
  '.jitter-badge--verified { background: #dcfce7; color: #166534; }',
  '.jitter-badge--suspicious { background: #fef9c3; color: #854d0e; }',
  '.jitter-badge--bot { background: #fee2e2; color: #991b1b; }',
  '.jitter-badge--building { background: #f3f4f6; color: #6b7280; }',
  '.jitter-icon { width: 12px; height: 12px; flex-shrink: 0; }',
].join('\n')

var ICONS = {
  verified: '<svg class="jitter-icon" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 110 14A7 7 0 018 1zm3.22 4.72a.75.75 0 00-1.06-1.06L7 7.83 5.84 6.66a.75.75 0 00-1.06 1.06l1.69 1.69a.75.75 0 001.06 0l3.69-3.69z"/></svg>',
  suspicious: '<svg class="jitter-icon" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 110 14A7 7 0 018 1zm0 3a.75.75 0 00-.75.75v3.5a.75.75 0 001.5 0v-3.5A.75.75 0 008 4zm0 7a1 1 0 100-2 1 1 0 000 2z"/></svg>',
  bot: '<svg class="jitter-icon" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 110 14A7 7 0 018 1zm2.53 4.47a.75.75 0 00-1.06 0L8 6.94 6.53 5.47a.75.75 0 00-1.06 1.06L6.94 8 5.47 9.47a.75.75 0 001.06 1.06L8 9.06l1.47 1.47a.75.75 0 001.06-1.06L9.06 8l1.47-1.47a.75.75 0 000-1.06z"/></svg>',
  building: '<svg class="jitter-icon" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 110 14A7 7 0 018 1zm0 2.5a4.5 4.5 0 100 9 4.5 4.5 0 000-9zm0 1.5a3 3 0 011.83 5.37.75.75 0 01-.91-1.19A1.5 1.5 0 108 5.5a.75.75 0 010-1.5z"/></svg>',
}

var LABELS = {
  verified: 'Human Verified',
  suspicious: 'Under Review',
  bot: 'Automated',
  building: 'Building Trust',
}

/**
 * Create a Jitter badge element.
 * @param {string} classification - 'verified' | 'suspicious' | 'bot' | 'building'
 * @param {Object} [opts] - reserved; the badge shows a label only, never a score.
 * @returns {HTMLElement}
 */
function createBadge(classification, opts) {
  var type = classification || 'building'
  if (!ICONS[type]) type = 'building'

  var host = document.createElement('jitter-badge')

  // Shadow DOM for style isolation
  var shadow = host.attachShadow({ mode: 'closed' })

  var style = document.createElement('style')
  style.textContent = BADGE_STYLES

  var badge = document.createElement('span')
  badge.className = 'jitter-badge jitter-badge--' + type
  // Label only — the numeric confidence/score is NEVER rendered (score secrecy).
  badge.innerHTML = ICONS[type] + ' ' + LABELS[type]

  shadow.appendChild(style)
  shadow.appendChild(badge)

  return host
}

/**
 * Insert a badge after an element.
 * @param {HTMLElement} el - Element to badge
 * @param {string} classification
 * @param {Object} [opts]
 */
function insertBadge(el, classification, opts) {
  // Remove existing badge if any
  var existing = el.parentNode && el.parentNode.querySelector('jitter-badge')
  if (existing) existing.remove()

  var badge = createBadge(classification, opts)
  if (el.nextSibling) {
    el.parentNode.insertBefore(badge, el.nextSibling)
  } else {
    el.parentNode.appendChild(badge)
  }

  return badge
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createBadge: createBadge, insertBadge: insertBadge }
}
