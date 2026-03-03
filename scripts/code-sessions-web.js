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
		boolean: ['help', 'no-open'],
		string: ['host', 'port'],
	});

	if (args.help) {
		console.log(
			'./scripts/code-sessions-web.sh [options]\n' +
			'  --host <host>   Host to bind to (default: localhost)\n' +
			'  --port <port>   Port to bind to (default: 8081)\n' +
			'  --no-open       Do not open browser automatically\n'
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
			res.end(getSessionsHTML(HOST, PORT, cssModules));
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
		if (!args['no-open']) {
			open.default(`http://${HOST}:${PORT}/`);
		}
	});

	process.on('SIGINT', () => { server.close(); process.exit(0); });
	process.on('SIGTERM', () => { server.close(); process.exit(0); });
}

function getSessionsHTML(host, port, cssModules) {
	const baseUrl = `http://${host}:${port}`;
	return `<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>Sessions</title>
	<link rel="stylesheet" href="${baseUrl}/out/vs/sessions/sessions.desktop.main.css">
	<style id="vscode-css-modules"></style>
	<script>
		globalThis._VSCODE_FILE_ROOT = '${baseUrl}/out';
		globalThis._VSCODE_CSS_MODULES = ${JSON.stringify(cssModules)};
	</script>
	<script>
		// CSS import map for dev mode
		const sheet = document.getElementById('vscode-css-modules').sheet;
		globalThis._VSCODE_CSS_LOAD = function (url) { sheet.insertRule(\`@import url(\${url});\`); };
		const importMap = { imports: {} };
		for (const cssModule of (globalThis._VSCODE_CSS_MODULES || [])) {
			const cssUrl = new URL(cssModule, globalThis._VSCODE_FILE_ROOT).href;
			const jsSrc = \`globalThis._VSCODE_CSS_LOAD('\${cssUrl}');\\n\`;
			const blob = new Blob([jsSrc], { type: 'application/javascript' });
			importMap.imports[cssUrl] = URL.createObjectURL(blob);
		}
		if (Object.keys(importMap.imports).length > 0) {
			const importMapElement = document.createElement('script');
			importMapElement.type = 'importmap';
			importMapElement.textContent = JSON.stringify(importMap, undefined, 2);
			document.head.appendChild(importMapElement);
		}
	</script>
</head>
<body aria-label="">
	<script type="module">
		import { create } from '${baseUrl}/out/vs/sessions/sessions.web.main.internal.js';
		create(document.body, {
			productConfiguration: {
				nameShort: 'Sessions (Web)',
				nameLong: 'Sessions (Web)',
				enableTelemetry: false,
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

