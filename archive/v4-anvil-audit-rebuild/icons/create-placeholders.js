#!/usr/bin/env node

/**
 * Creates simple placeholder PNG icons for the Anvil extension
 * These are minimal valid PNG files - replace with proper icons later
 */

const fs = require('fs');
const path = require('path');

// Minimal 1x1 purple PNG (base64 encoded)
// This is a valid PNG that can be scaled by the browser
const purplePng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAA' +
  'LEwAACxMBAJqcGAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAABeSURBVHhe7d' +
  'ExAQAAAMKg9U9tCU+gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMD4M0UAAemOVqkAAAAASUVORK5CYII=',
  'base64'
);

// Create icons at different sizes (they'll be upscaled, but valid)
const sizes = [16, 48, 128];

console.log('Creating placeholder icons...');

sizes.forEach(size => {
  const filename = path.join(__dirname, `icon${size}.png`);
  fs.writeFileSync(filename, purplePng);
  console.log(`✓ Created ${filename}`);
});

console.log('\n✓ Placeholder icons created successfully!');
console.log('ℹ Replace these with proper icons using generate-icons.html or another method');
