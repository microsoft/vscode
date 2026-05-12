/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

const http = require('http');
const fs = require('fs');
const path = require('path');
const open = require('open');
const minimist = require('minimist');

const APP_ROOT = path.join(__dirname, '..');

async function main() {
	const args = minimist(process.argv.slice(2), {
		boolean: ['help', 'no-open', 'skip-welcome', 'mock'],
		string: ['host', 'port'],
	});

	if (args.help) {
		console.log(
			'./scripts/code-sessions-web.sh [options]\n' +
			'  --host <host>   Host to bind to (default: localhost)\n' +
			'  --port <port>   Port to bind to (default: 8081)\n' +
			'  --no-open       Do not open browser automatically\n' +
			'  --skip-welcome  Skip the sessions welcome overlay\n' +
			'  --mock          Load mock extension for E2E testing\n'
		);
		return;
	}

	const HOST = args['host'] ?? 'localhost';
	const PORT = parseInt(args['port'] ?? '8081', 10);

	// Collect CSS module paths from the compiled output (same as @vscode/test-web does).
	// These are turned into an import map so the browser can load `import './foo.css'`
	// statements as JavaScript shims that inject the CSS via `_VSCODE_CSS_LOAD`.
	let cssModules = [];
	try {
		const { glob } = require('tinyglobby');
		cssModules = await glob('**/*.css', { cwd: path.join(APP_ROOT, 'out') });
	} catch {
		// tinyglobby may not be installed; fall back to a recursive fs walk
		cssModules = collectCssFiles(path.join(APP_ROOT, 'out'), '');
	}

	const server = http.createServer((req, res) => {
		const url = new URL(req.url, `http://${HOST}:${PORT}`);

		// Serve the sessions workbench HTML at the root
		if (url.pathname === '/' || url.pathname === '/index.html') {
			res.writeHead(200, { 'Content-Type': 'text/html' });
			res.end(getSessionsHTML(HOST, PORT, cssModules, args['mock']));
			return;
		}

		// Serve static files from the repo root (out/, src/, node_modules/, etc.)
		const filePath = path.join(APP_ROOT, url.pathname);
		if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
			const ext = path.extname(filePath);
			const contentType = {
				'.js': 'application/javascript',
				'.mjs': 'application/javascript',
				'.css': 'text/css',
				'.html': 'text/html',
				'.json': 'application/json',
				'.svg': 'image/svg+xml',
				'.png': 'image/png',
				'.ttf': 'font/ttf',
				'.woff': 'font/woff',
				'.woff2': 'font/woff2',
			}[ext] || 'application/octet-stream';

			res.writeHead(200, {
				'Content-Type': contentType,
				'Access-Control-Allow-Origin': '*',
			});
			fs.createReadStream(filePath).pipe(res);
			return;
		}

		res.writeHead(404);
		res.end('Not found');
	});

	server.listen(PORT, HOST, () => {
		console.log(`\n  Sessions Web running at: http://${HOST}:${PORT}/\n`);
		if (!args['no-open'] && args.open !== false) {
			const query = args['skip-welcome'] ? '?skip-sessions-welcome' : '';
			open.default(`http://${HOST}:${PORT}/${query}`);
		}
	});

	process.on('SIGINT', () => { server.close(); process.exit(0); });
	process.on('SIGTERM', () => { server.close(); process.exit(0); });
}

function getSessionsHTML(host, port, cssModules, useMock) {
	const baseUrl = `http://${host}:${port}`;
	const fileRoot = `${baseUrl}/out`;

	// Build the import map server-side. Each CSS file gets mapped to a
	// data: URI containing a JS module that injects the stylesheet via
	// a global helper function. This must be a static <script type="importmap">
	// declared before any <script type="module"> tags.
	const imports = {};
	for (const cssModule of cssModules) {
		const cssUrl = `${fileRoot}/${cssModule}`;
		const jsSrc = `globalThis._VSCODE_CSS_LOAD('${cssUrl}');\n`;
		const encoded = Buffer.from(jsSrc).toString('base64');
		imports[cssUrl] = `data:application/javascript;base64,${encoded}`;
	}
	const importMapJson = JSON.stringify({ imports }, null, 2);

	// When --mock is passed, load the E2E mock extension
	const additionalBuiltinExtensions = useMock
		? `additionalBuiltinExtensions: [{ scheme: 'http', authority: '${host}:${port}', path: '/src/vs/sessions/test/e2e/extensions/sessions-e2e-mock' }],`
		: '';

	return `<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>Sessions</title>
	<style id="vscode-css-modules"></style>
	<script>
		globalThis._VSCODE_FILE_ROOT = '${fileRoot}';
		const sheet = document.getElementById('vscode-css-modules').sheet;
		globalThis._VSCODE_CSS_LOAD = function (url) { sheet.insertRule(\`@import url(\${url});\`); };
	</script>
	<script type="importmap">
${importMapJson}
	</script>
</head>
<body aria-label="">
	<script type="module">
		import { create, URI } from '${fileRoot}/vs/sessions/${useMock ? 'test/sessions.web.test.internal' : 'sessions.web.main.internal'}.js';
		create(document.body, {
			productConfiguration: {
				nameShort: 'Sessions (Web)',
				nameLong: 'Sessions (Web)',
				enableTelemetry: false,
			},
			${additionalBuiltinExtensions}
			workspaceProvider: {
				workspace: ${useMock
			? `{ folderUri: URI.parse('mock-fs://mock-repo/mock-repo') }`
			: 'undefined'},
				open: async () => false,
				payload: [['isSessionsWindow', 'true']],
			},
		});
	</script>
</body>
</html>`;
}

/** Recursively collect *.css paths relative to `dir`. */
function collectCssFiles(dir, prefix) {
	let results = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const rel = prefix ? prefix + '/' + entry.name : entry.name;
		if (entry.isDirectory()) {
			results = results.concat(collectCssFiles(path.join(dir, entry.name), rel));
		} else if (entry.name.endsWith('.css')) {
			results.push(rel);
		}
	}
	return results;
}

main();

