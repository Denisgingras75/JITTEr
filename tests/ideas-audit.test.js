var fs = require('fs')
var path = require('path')

// Ideas that are explicitly parked — if these ship, update the ideas file
var PARKED_IDEAS = [
  { id: 'session_haptics', marker: 'JitterSession.init', files: ['sdk/src/core/session.js', 'sdk/src/core/haptics.js'] },
  { id: 'essay_mode', marker: 'EssayMode', files: ['extension/src/essay.js'] },
  { id: 'hall_effect', marker: 'WebHID', files: ['extension/src/wooting.js'] },
]

function assert(condition, msg) {
  if (!condition) { console.error('AUDIT FAIL:', msg); process.exitCode = 1; return }
  console.log('AUDIT PASS:', msg)
}

var ideasPath = path.join(__dirname, '..', 'JITTER-IDEAS.md')
var ideasContent = fs.existsSync(ideasPath) ? fs.readFileSync(ideasPath, 'utf8') : ''

for (var i = 0; i < PARKED_IDEAS.length; i++) {
  var idea = PARKED_IDEAS[i]
  var inIdeasFile = ideasContent.indexOf(idea.marker) !== -1
  var shipped = false
  for (var j = 0; j < idea.files.length; j++) {
    if (fs.existsSync(path.join(__dirname, '..', idea.files[j]))) {
      shipped = true
      break
    }
  }

  if (shipped && inIdeasFile) {
    console.warn('ACTION NEEDED: ' + idea.id + ' appears to have shipped but IDEAS file still marks it as parked. Update JITTER-IDEAS.md.')
  } else if (!shipped) {
    assert(inIdeasFile, idea.id + ' is parked — IDEAS file should document it')
  } else {
    console.log('PASS: ' + idea.id + ' shipped and IDEAS file is current')
  }
}

console.log('\nIdeas audit done.')
