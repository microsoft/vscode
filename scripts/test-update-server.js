/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Parse command line arguments
const args = process.argv.slice(2);
function getArg(name, defaultValue = undefined) {
	const index = args.indexOf(`--${name}`);
	if (index === -1 || index + 1 >= args.length) {
		return defaultValue;
	}
	return args[index + 1];
}

const PORT = parseInt(getArg('port', '3000'), 10);
let ZIP_PATH = getArg('zip');
let VERSION = getArg('version', '99.0.0');
let COMMIT = getArg('commit', crypto.randomBytes(20).toString('hex'));

// Compute SHA256 of ZIP file
function computeSha256(filePath) {
	if (!filePath || !fs.existsSync(filePath)) {
		return 'no-zip-configured';
	}
	const data = fs.readFileSync(filePath);
	return crypto.createHash('sha256').update(data).digest('hex');
}

let sha256hash = computeSha256(ZIP_PATH);

const server = http.createServer((req, res) => {
	const url = new URL(req.url, `http://localhost:${PORT}`);
	console.log(`[${new Date().toISOString()}] ${req.method} ${url.pathname}`);

	// Update check endpoint: GET /api/update/:platform/:quality/:commit
	const updateMatch = url.pathname.match(/^\/api\/update\/([^/]+)\/([^/]+)\/([^/]+)$/);
	if (updateMatch && req.method === 'GET') {
		const [, platform, quality, currentCommit] = updateMatch;
		console.log(`  Platform: ${platform}, Quality: ${quality}, Current commit: ${currentCommit}`);

		if (!ZIP_PATH) {
			console.log('  → 204 No Content (no ZIP configured)');
			res.writeHead(204);
			res.end();
			return;
		}

		// If client already has this commit, no update
		if (currentCommit === COMMIT) {
			console.log('  → 204 No Content (already up to date)');
			res.writeHead(204);
			res.end();
			return;
		}

		const response = {
			url: `http://localhost:${PORT}/download/update.zip`,
			name: VERSION,
			version: COMMIT,
			productVersion: VERSION,
			timestamp: Date.now(),
			sha256hash: sha256hash,
			supportsFastUpdate: false
		};

		console.log('  → 200 OK (update available)');
		console.log(`     Version: ${VERSION}, Commit: ${COMMIT}`);

		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify(response, null, 2));
		return;
	}

	// Download endpoint: GET /download/update.zip
	if (url.pathname === '/download/update.zip' && req.method === 'GET') {
		if (!ZIP_PATH || !fs.existsSync(ZIP_PATH)) {
			console.log('  → 404 Not Found (ZIP not configured or missing)');
			res.writeHead(404);
			res.end('ZIP file not found');
			return;
		}

		const stat = fs.statSync(ZIP_PATH);
		console.log(`  → 200 OK (serving ${stat.size} bytes)`);

		res.writeHead(200, {
			'Content-Type': 'application/zip',
			'Content-Length': stat.size
		});
		fs.createReadStream(ZIP_PATH).pipe(res);
		return;
	}

	// Admin: Set ZIP path - POST /admin/set-zip?path=/path/to/file.zip
	if (url.pathname === '/admin/set-zip' && req.method === 'POST') {
		const newPath = url.searchParams.get('path');
		if (newPath && fs.existsSync(newPath)) {
			ZIP_PATH = newPath;
			sha256hash = computeSha256(ZIP_PATH);
			console.log(`  → ZIP path set to: ${ZIP_PATH}`);
			console.log(`  → SHA256: ${sha256hash}`);
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ zip: ZIP_PATH, sha256hash }));
		} else {
			res.writeHead(400);
			res.end('Invalid path or file does not exist');
		}
		return;
	}

	// Admin: Set version - POST /admin/set-version?version=1.87.0&commit=abc123
	if (url.pathname === '/admin/set-version' && req.method === 'POST') {
		VERSION = url.searchParams.get('version') || VERSION;
		COMMIT = url.searchParams.get('commit') || crypto.randomBytes(20).toString('hex');
		console.log(`  → Version set to: ${VERSION}, Commit: ${COMMIT}`);
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ version: VERSION, commit: COMMIT }));
		return;
	}

	// Admin: Get current state - GET /admin/status
	if (url.pathname === '/admin/status' && req.method === 'GET') {
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({
			zip: ZIP_PATH,
			version: VERSION,
			commit: COMMIT,
			sha256hash: sha256hash
		}, null, 2));
		return;
	}

	// 404 for everything else
	res.writeHead(404);
	res.end('Not found');
});

server.listen(PORT, () => {
	console.log(`\nVS Code Update Server running on http://localhost:${PORT}\n`);
	console.log('Endpoints:');
	console.log(`  GET  /api/update/:platform/:quality/:commit  - Check for updates`);
	console.log(`  GET  /download/update.zip                    - Download update ZIP`);
	console.log(`  POST /admin/set-zip?path=/path/to/file.zip   - Set ZIP file path`);
	console.log(`  POST /admin/set-version?version=X&commit=Y   - Set version/commit`);
	console.log(`  GET  /admin/status                           - Get current state`);
	console.log('');
	console.log('Current state:');
	console.log(`  ZIP:     ${ZIP_PATH || '(not set)'}`);
	console.log(`  Version: ${VERSION}`);
	console.log(`  Commit:  ${COMMIT}`);
	console.log(`  SHA256:  ${sha256hash}`);
	console.log('');
});
