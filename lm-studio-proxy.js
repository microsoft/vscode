/**
 * Simple CORS proxy for LM Studio
 * This forwards requests from VS Code webview to LM Studio with proper CORS headers
 */

import http from 'http';

const PROXY_PORT = 3001;
const LM_STUDIO_HOST = '127.0.0.1';
const LM_STUDIO_PORT = 1234;

const server = http.createServer((req, res) => {
	// Enable CORS
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

	// Handle preflight OPTIONS request
	if (req.method === 'OPTIONS') {
		res.writeHead(204);
		res.end();
		return;
	}

	// Forward request to LM Studio
	const options = {
		hostname: LM_STUDIO_HOST,
		port: LM_STUDIO_PORT,
		path: req.url,
		method: req.method,
		headers: {
			'Content-Type': 'application/json'
		}
	};

	console.log(`[Proxy] Forwarding ${req.method} ${req.url} to LM Studio`);

	const proxyReq = http.request(options, (proxyRes) => {
		// Forward response headers and status
		res.writeHead(proxyRes.statusCode, proxyRes.headers);
		proxyRes.pipe(res);
	});

	proxyReq.on('error', (error) => {
		console.error('[Proxy] Error:', error);
		res.writeHead(500, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Proxy error', details: error.message }));
	});

	// Forward request body
	req.pipe(proxyReq);
});

server.listen(PROXY_PORT, () => {
	console.log(`✅ LM Studio CORS Proxy running on http://localhost:${PROXY_PORT}`);
	console.log(`   Forwarding requests to http://${LM_STUDIO_HOST}:${LM_STUDIO_PORT}`);
	console.log(`   Press Ctrl+C to stop`);
});

