#!/usr/bin/env node

/**
 * Simple proxy server for testing Copilot proxy interception.
 * This mock proxy logs all requests it receives with their headers and bodies.
 * It forwards requests to the original endpoint specified in X-Original-Url header.
 *
 * Usage: node test-proxy.js [port]
 * Default: http://localhost:8787
 *
 * Environment:
 * - Set COPILOT_PROXY_URL=http://localhost:8787/v1 to enable proxy in VS Code
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');
const zlib = require('zlib');

const PORT = process.argv[2] || 8787;
const BASE_PATH = '/v1';

// Color codes for console output
const colors = {
	reset: '\x1b[0m',
	bright: '\x1b[1m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	magenta: '\x1b[35m',
};

function log(level, msg, data) {
	const timestamp = new Date().toISOString();
	const color = level === 'INFO' ? colors.green : level === 'WARN' ? colors.yellow : colors.blue;
	console.log(`${color}[${timestamp}] [${level}]${colors.reset} ${msg}`, data ? JSON.stringify(data, null, 2) : '');
}

function createProxyServer() {
	const server = http.createServer(async (req, res) => {
		const requestId = req.headers['x-request-id'] || 'unknown';
		log('INFO', `[${requestId}] ${req.method} ${req.url}`);

		// Log incoming headers (excluding auth tokens for security)
		const safeHeaders = { ...req.headers };
		if (safeHeaders.authorization) {
			safeHeaders.authorization = 'Bearer ***REDACTED***';
		}
		log('INFO', `[${requestId}] Headers:`, safeHeaders);

		// Handle OPTIONS for CORS
		if (req.method === 'OPTIONS') {
			res.writeHead(200, {
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
				'Access-Control-Allow-Headers': '*',
			});
			res.end();
			return;
		}

		// Collect request body
		let body = '';
		req.on('data', chunk => {
			body += chunk.toString();
		});

		req.on('end', async () => {
			try {
				// Parse body if JSON
				let parsedBody = null;
				if (body) {
					try {
						parsedBody = JSON.parse(body);
						log('INFO', `[${requestId}] Request Body:`, parsedBody);

						// Log token counts if available
						if (parsedBody.messages) {
							const inputTokens = parsedBody.messages.reduce((sum, msg) => sum + (msg.content?.length || 0), 0);
							log('INFO', `[${requestId}] Approximate input tokens: ~${Math.ceil(inputTokens / 4)} (chars/${4})`);
						}
					} catch {
						log('INFO', `[${requestId}] Body (non-JSON): ${body.substring(0, 200)}...`);
					}
				}

				// Get original endpoint from header
				const originalUrl = req.headers['x-original-url'];
				if (!originalUrl) {
					log('WARN', `[${requestId}] No X-Original-Url header found!`);
					res.writeHead(400, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ error: 'Missing X-Original-Url header' }));
					return;
				}

				log('INFO', `[${requestId}] Forwarding to: ${originalUrl}`);

				// Forward request to original endpoint
				await forwardRequest(req, res, originalUrl, body, requestId);
			} catch (err) {
				log('ERROR', `[${requestId}] Error processing request: ${err.message}`);
				res.writeHead(500, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: 'Proxy error: ' + err.message }));
			}
		});
	});

	return server;
}

async function forwardRequest(req, res, targetUrl, body, requestId) {
	try {
		const url = new URL(targetUrl);
		const isHttps = url.protocol === 'https:';
		const client = isHttps ? https : http;

		const forwardReq = client.request({
			hostname: url.hostname,
			port: url.port,
			path: url.pathname + url.search,
			method: req.method,
			headers: {
				...req.headers,
				'X-Proxy-Forward': 'true',
				'X-Proxy-Request-Id': requestId,
			},
		}, (forwardRes) => {
			log('INFO', `[${requestId}] Response status: ${forwardRes.statusCode}`);

			// Copy response headers
			const responseHeaders = { ...forwardRes.headers };
			responseHeaders['X-Proxy-Response-Time'] = Date.now();

			// Handle streaming or buffering response
			res.writeHead(forwardRes.statusCode, responseHeaders);

			let responseBody = '';
			forwardRes.on('data', chunk => {
				responseBody += chunk.toString();
				res.write(chunk);
			});

			forwardRes.on('end', () => {
				res.end();

				// Log response (truncated for display)
				if (responseBody && forwardRes.headers['content-type']?.includes('application/json')) {
					try {
						const parsed = JSON.parse(responseBody);
						log('INFO', `[${requestId}] Response Body (truncated):`, {
							...parsed,
							content: parsed.content ? parsed.content.substring(0, 100) + '...' : undefined,
						});
					} catch {
						log('INFO', `[${requestId}] Response (non-JSON): ${responseBody.substring(0, 200)}...`);
					}
				}
			});
		});

		forwardReq.on('error', (err) => {
			log('ERROR', `[${requestId}] Forward request error: ${err.message}`);
			res.writeHead(502, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Bad Gateway: ' + err.message }));
		});

		if (body) {
			forwardReq.write(body);
		}

		forwardReq.end();
	} catch (err) {
		log('ERROR', `[${requestId}] Failed to forward: ${err.message}`);
		res.writeHead(500, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Proxy error: ' + err.message }));
	}
}

const server = createProxyServer();

server.listen(PORT, () => {
	log('INFO', `${colors.bright}Proxy server listening on http://localhost:${PORT}${colors.reset}`);
	log('INFO', `${colors.bright}Base path: ${BASE_PATH}${colors.reset}`);
	log('INFO', `${colors.bright}To enable in VS Code, set: COPILOT_PROXY_URL=http://localhost:${PORT}${colors.reset}`);
	log('INFO', `${colors.bright}Example: COPILOT_PROXY_URL=http://localhost:${PORT}/v1 ./scripts/code.sh${colors.reset}`);
});

server.on('error', (err) => {
	if (err.code === 'EADDRINUSE') {
		log('ERROR', `Port ${PORT} is already in use. Try a different port.`);
	} else {
		log('ERROR', `Server error: ${err.message}`);
	}
	process.exit(1);
});

// Handle shutdown gracefully
process.on('SIGINT', () => {
	log('INFO', 'Shutting down proxy server...');
	server.close(() => {
		log('INFO', 'Proxy server closed');
		process.exit(0);
	});
});
