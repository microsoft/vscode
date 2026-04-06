// @ts-check

const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const open = require('open');
const minimist = require('minimist');

const APP_ROOT = path.join(__dirname, '..');

const MIME_TYPES = {
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
};

function log(...args) {
	console.log('[Sessions]', ...args);
}

function safeJoin(base, target) {
	const targetPath = path.normalize(path.join(base, target));
	if (!targetPath.startsWith(base)) {
		throw new Error('Path traversal detected');
	}
	return targetPath;
}

async function fileExists(filePath) {
	try {
		const stat = await fs.stat(filePath);
		return stat.isFile();
	} catch {
		return false;
	}
}

async function collectCssFiles(dir, prefix = '') {
	let results = [];
	const entries = await fs.readdir(dir, { withFileTypes: true });

	for (const entry of entries) {
		const rel = prefix ? `${prefix}/${entry.name}` : entry.name;

		if (entry.isDirectory()) {
			results = results.concat(await collectCssFiles(path.join(dir, entry.name), rel));
		} else if (entry.name.endsWith('.css')) {
			results.push(rel);
		}
	}
	return results;
}

function getContentType(filePath) {
	return MIME_TYPES[path.extname(filePath)] || 'application/octet-stream';
}

function getSessionsHTML(host, port, cssModules, useMock) {
	const baseUrl = `http://${host}:${port}`;
	const fileRoot = `${baseUrl}/out`;

	const imports = {};
	for (const css of cssModules) {
		const cssUrl = `${fileRoot}/${css}`;
		const encoded = Buffer.from(
			`globalThis._VSCODE_CSS_LOAD('${cssUrl}');`
		).toString('base64');

		imports[cssUrl] = `data:application/javascript;base64,${encoded}`;
	}

	const importMap = JSON.stringify({ imports }, null, 2);

	return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Sessions</title>

<style id="vscode-css-modules"></style>

<script>
globalThis._VSCODE_FILE_ROOT='${fileRoot}';
const sheet=document.getElementById('vscode-css-modules').sheet;
globalThis._VSCODE_CSS_LOAD=(url)=>sheet.insertRule(\`@import url(\${url});\`);
</script>

<script type="importmap">
${importMap}
</script>
</head>

<body>
<script type="module">
import { create, URI } from '${fileRoot}/vs/sessions/${useMock ? 'test/sessions.web.test.internal' : 'sessions.web.main.internal'}.js';

create(document.body,{
	productConfiguration:{
		nameShort:'Sessions',
		nameLong:'Sessions Web',
		enableTelemetry:false
	},
	workspaceProvider:{
		workspace:${useMock ? `{ folderUri: URI.parse('mock-fs://mock') }` : 'undefined'},
		open: async ()=>false,
		payload:[['isSessionsWindow','true']]
	}
});
</script>
</body>
</html>`;
}

async function main() {
	const args = minimist(process.argv.slice(2), {
		boolean: ['help', 'no-open', 'skip-welcome', 'mock'],
		string: ['host', 'port'],
		default: {
			host: 'localhost',
			port: '8081',
		},
	});

	if (args.help) {
		console.log(`
Usage:
  node server.js [options]

Options:
  --host <host>      Host (default: localhost)
  --port <port>      Port (default: 8081)
  --no-open          Disable auto open
  --mock             Enable mock mode
`);
		return;
	}

	const HOST = args.host;
	const PORT = parseInt(args.port, 10);

	log('Starting server...');

	const cssModules = await collectCssFiles(path.join(APP_ROOT, 'out')).catch(() => []);

	const server = http.createServer(async (req, res) => {
		try {
			const url = new URL(req.url, `http://${HOST}:${PORT}`);

			// Root HTML
			if (url.pathname === '/' || url.pathname === '/index.html') {
				res.writeHead(200, { 'Content-Type': 'text/html' });
				res.end(getSessionsHTML(HOST, PORT, cssModules, args.mock));
				return;
			}

			// Static files
			const filePath = safeJoin(APP_ROOT, url.pathname);

			if (await fileExists(filePath)) {
				const data = await fs.readFile(filePath);
				res.writeHead(200, {
					'Content-Type': getContentType(filePath),
					'Access-Control-Allow-Origin': '*',
					'Cache-Control': 'public, max-age=3600',
				});
				res.end(data);
				return;
			}

			res.writeHead(404);
			res.end('Not Found');

		} catch (err) {
			log('Error:', err.message);
			res.writeHead(500);
			res.end('Internal Server Error');
		}
	});

	server.listen(PORT, HOST, () => {
		log(`Running at http://${HOST}:${PORT}`);

		if (!args['no-open']) {
			open(`http://${HOST}:${PORT}`);
		}
	});

	process.on('SIGINT', shutdown);
	process.on('SIGTERM', shutdown);

	function shutdown() {
		log('Shutting down...');
		server.close(() => process.exit(0));
	}
}

main();
