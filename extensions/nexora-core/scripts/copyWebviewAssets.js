/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const fs = require('fs');
const path = require('path');

function ensureDir(dirPath) {
	fs.mkdirSync(dirPath, { recursive: true });
}

function copyFile(src, dest) {
	ensureDir(path.dirname(dest));
	fs.copyFileSync(src, dest);
}

function main() {
	const root = path.resolve(__dirname, '..');
	const srcDir = path.join(root, 'src', 'webview', 'chat');
	const outDir = path.join(root, 'out', 'webview', 'chat');

	const assets = ['chat.css', 'chat.js'];
	for (const file of assets) {
		const src = path.join(srcDir, file);
		const dest = path.join(outDir, file);
		if (!fs.existsSync(src)) {
			throw new Error(`Missing webview asset: ${src}`);
		}
		copyFile(src, dest);
	}

	console.log('[copyWebviewAssets] copied chat assets');
}

main();

