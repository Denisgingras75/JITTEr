# Anvil Extension Icons

## Quick Setup

To generate the required PNG icons for the Chrome extension:

### Method 1: Using the HTML Generator (Recommended)
1. Open `generate-icons.html` in your browser
2. Click "Download All" button
3. Save the three PNG files (icon16.png, icon48.png, icon128.png)
4. Move them to this `icons/` directory

### Method 2: Using an SVG to PNG Converter
1. Use the `icon.svg` file in this directory
2. Convert it to PNG at three sizes: 16x16, 48x48, and 128x128
3. Name them: icon16.png, icon48.png, icon128.png

### Method 3: Using ImageMagick (if installed)
```bash
convert -background none icon.svg -resize 16x16 icon16.png
convert -background none icon.svg -resize 48x48 icon48.png
convert -background none icon.svg -resize 128x128 icon128.png
```

### Method 4: Online Converter
1. Go to https://cloudconvert.com/svg-to-png
2. Upload `icon.svg`
3. Generate at sizes: 16x16, 48x48, 128x128
4. Download and rename to icon16.png, icon48.png, icon128.png

## Temporary Placeholders

Simple placeholder icons are provided for development. Replace them with properly generated icons before publishing.
