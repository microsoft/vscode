/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
const readline = require('readline');

// Parse command line arguments
const args = process.argv.slice(2);
function getArg(name, defaultValue = undefined) {
	const index = args.indexOf(`--${name}`);
	if (index === -1 || index + 1 >= args.length) {
		return defaultValue;
	}
	return args[index + 1];
}

const PORT = parseInt(getArg('port', '8080'), 10);
let ZIP_PATH = getArg('zip');
let VERSION = getArg('version', '99.0.0');
let COMMIT = getArg('commit', crypto.randomBytes(20).toString('hex'));

// Compute SHA256 of ZIP file
function computeSha256(filePath) {
	if (!filePath || !fs.existsSync(filePath)) {
		return null;
	}
	const data = fs.readFileSync(filePath);
	return crypto.createHash('sha256').update(data).digest('hex');
}

let sha256hash = computeSha256(ZIP_PATH);

function printStatus() {
	console.log('\nCurrent state:');
	console.log(`  ZIP:     ${ZIP_PATH || '(not set - no update available)'}`);
	console.log(`  Version: ${VERSION}`);
	console.log(`  Commit:  ${COMMIT}`);
	console.log(`  SHA256:  ${sha256hash || '(none)'}`);
	console.log('');
}

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

	// 404 for everything else
	res.writeHead(404);
	res.end('Not found');
});

server.listen(PORT, () => {
	console.log(`\nVS Code Update Server running on http://localhost:${PORT}\n`);
	console.log('Endpoints:');
	console.log(`  GET  /api/update/:platform/:quality/:commit  - Check for updates`);
	console.log(`  GET  /download/update.zip                    - Download update ZIP`);
	printStatus();
	startRepl();
});

function startRepl() {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
		prompt: '> '
	});

	console.log('Commands: status, set <zip> <version> [commit], none, quit');
	rl.prompt();

	rl.on('line', (line) => {
		const parts = line.trim().split(/\s+/);
		const cmd = parts[0]?.toLowerCase();

		switch (cmd) {
			case 'status':
			case 's':
				printStatus();
				break;

			case 'set':
				if (parts.length < 3) {
					console.log('Usage: set <zip-path> <version> [commit]');
				} else {
					const zipPath = parts[1];
					if (!fs.existsSync(zipPath)) {
						console.log(`Error: File not found: ${zipPath}`);
					} else {
						ZIP_PATH = zipPath;
						VERSION = parts[2];
						COMMIT = parts[3] || crypto.randomBytes(20).toString('hex');
						sha256hash = computeSha256(ZIP_PATH);
						console.log('Update configured:');
						printStatus();
					}
				}
				break;

			case 'none':
			case 'clear':
				ZIP_PATH = null;
				sha256hash = null;
				console.log('Update cleared - no update will be available');
				break;

			case 'quit':
			case 'q':
			case 'exit':
				console.log('Shutting down...');
				process.exit(0);
				break;

			case '':
				break;

			default:
				console.log('Commands: status, set <zip> <version> [commit], none, quit');
		}

		rl.prompt();
	});

	rl.on('close', () => {
		console.log('\nShutting down...');
		process.exit(0);
	});
}
