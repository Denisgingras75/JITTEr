/**
 * Simple build script — concatenates core + init into a single dist file.
 * No webpack, no rollup, no dependencies. Just cat.
 */

var fs = require('fs')
var path = require('path')

var core = fs.readFileSync(path.join(__dirname, 'src/core/jitter-box.js'), 'utf8')
var badge = fs.readFileSync(path.join(__dirname, 'src/badge.js'), 'utf8')
var init = fs.readFileSync(path.join(__dirname, 'src/init.js'), 'utf8')

// Strip module exports/imports from core — we're building a single IIFE
core = core
  .replace(/^import .+$/gm, '')
  .replace(/^export .+$/gm, '')
  .replace('if (typeof window !== \'undefined\') {\n  window.JitterBox = JitterBox\n}', '')

// Strip module exports from badge
badge = badge
  .replace(/^if \(typeof module .+\n.+\n\}/gm, '')

// Strip require/module.exports from init — inline the references
init = init
  .replace(/^var JitterBox = require.+$/gm, '// JitterBox available from core above')
  .replace(/^if \(typeof module .+\n.+\n\}/gm, '')

var output = ';(function() {\n"use strict";\n\n'
  + '// ── Jitter Core ─────────────────────────────────────\n'
  // The core and init.js both declare attach(); in one shared scope the later
  // declaration won and JitterBox.attach called itself forever.
  + 'var JitterBox = (function () {\n'
  + core + '\n'
  + 'return JitterBox\n'
  + '})()\n\n'
  + '// ── Jitter Badge ────────────────────────────────────\n'
  + badge + '\n\n'
  + '// ── Jitter SDK ──────────────────────────────────────\n'
  + init + '\n\n'
  + '// ── Expose ──────────────────────────────────────────\n'
  + 'if (typeof window !== "undefined") {\n'
  + '  window.Jitter = Jitter;\n'
  + '  window.JitterBox = JitterBox;\n'
  + '}\n'
  + '})();\n'

var distDir = path.join(__dirname, 'dist')
if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true })

fs.writeFileSync(path.join(distDir, 'jitter.min.js'), output)

// Also copy to examples/ so the demo works
var examplesDir = path.join(__dirname, 'examples')
if (fs.existsSync(examplesDir)) {
  fs.writeFileSync(path.join(examplesDir, 'jitter.min.js'), output)
}

var size = Buffer.byteLength(output, 'utf8')
console.log('Built dist/jitter.min.js (' + Math.round(size / 1024) + 'KB)')
