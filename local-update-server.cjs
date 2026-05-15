/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// test-workbench_change - new file
// Local update server for testing
const http = require('http');
const fs = require('fs');
const path = require('path');

// Configuration
const PORT = 3000;
const UPDATE_FILES_DIR = 'E:/workspace/test-workbench-vscode02/.build/win32-x64/user-setup'; // Your installation package directory

const server = http.createServer((req, res) => {
	console.log(`Request: ${req.method} ${req.url}`);

	// Handle update check requests
	// Format: /api/update/{platform}/{quality}/{commit}?bg=true&u=none
	const updateCheckPattern = /^\/api\/update\/([^\/]+)\/([^\/]+)\/([^\/\?]+)/;
	const match = req.url.match(updateCheckPattern);

	if (match) {
		const [, platform, quality, commit] = match;
		console.log(`Update check: platform=${platform}, quality=${quality}, commit=${commit}`);

		// Simulate server logic:
		// If commit is the current old version, return update
		// Otherwise return 204 to indicate no update
		console.log('commit:' + commit);
		if (commit !== '9c521649abc582aa7064480374c5b04e3449da6e') {
			// Return update information
			const updateInfo = {
				url: `http://localhost:${PORT}/download/TestAgentStudio.exe`,
				name: '1.116.1',
				version: '9c521649abc582aa7064480374c5b04e3449da6e',  // New version commit
				productVersion: '1.116.1',
				hash: '', // Optional: SHA256 hash
				timestamp: Date.now(),
				supportsFastUpdate: true
			};

			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(updateInfo));
			console.log('  → Returning update info');
		} else {
			// No update
			res.writeHead(204);
			res.end();
			console.log('  → No update available (204)');
		}
		return;
	}

	// Handle download requests
	if (req.url.startsWith('/download/')) {
		const filename = path.basename(req.url);
		const filePath = path.join(UPDATE_FILES_DIR, filename);

		console.log(`Download request: ${filename}`);

		if (!fs.existsSync(filePath)) {
			res.writeHead(404);
			res.end('File not found');
			return;
		}

		const stat = fs.statSync(filePath);
		res.writeHead(200, {
			'Content-Type': 'application/octet-stream',
			'Content-Length': stat.size,
			'Content-Disposition': `attachment; filename="${filename}"`
		});

		const fileStream = fs.createReadStream(filePath);
		fileStream.pipe(res);
		return;
	}

	// Other requests
	res.writeHead(404);
	res.end('Not found');
});

server.listen(PORT, () => {
	console.log(`Local update server running at http://localhost:${PORT}`);
	console.log(`Update files directory: ${UPDATE_FILES_DIR}`);
	console.log(`\nUpdate your product.json:`);
	console.log(`  "updateUrl": "http://localhost:${PORT}"`);
	console.log(`  "quality": "test"`);
	console.log(`\nTest the server:`);
	console.log(`  curl http://localhost:${PORT}/api/update/win32-x64-user/test/763ab1996c96190eb1279b06f9bb090139220405`);
});
