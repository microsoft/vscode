#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Read the codicon CSS from node_modules
const codiconCssPath = path.join(__dirname, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css');
const codiconTtfPath = path.join(__dirname, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.ttf');

if (!fs.existsSync(codiconCssPath)) {
    console.error('Error: @vscode/codicons not found. Please run: npm install');
    process.exit(1);
}

// Read the CSS file
let cssContent = fs.readFileSync(codiconCssPath, 'utf8');

// Read the TTF font file and convert to base64
const fontBuffer = fs.readFileSync(codiconTtfPath);
const fontBase64 = fontBuffer.toString('base64');

// Replace the font URL with a data URL
cssContent = cssContent.replace(
    /src:\s*url\("\.\/codicon\.ttf[^"]*"\)\s*format\("truetype"\)/g,
    `src: url(data:font/ttf;base64,${fontBase64}) format("truetype")`
);

// Write the updated CSS to public/theme/codicons.css
const outputPath = path.join(__dirname, 'public', 'theme', 'codicons.css');
fs.writeFileSync(outputPath, cssContent);

console.log('Generated codicons.css with embedded font');
