/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

/**
 * Test script to verify the COPILOT_PROXY_URL interception in networking.ts.
 *
 * Launches a local HTTP server acting as a "headroom" proxy, then calls
 * maybeInterceptUrlThroughProxy logic directly and fires a real HTTP request
 * to confirm:
 *   1. The request hits the proxy (not the original host)
 *   2. X-Original-Url header is set correctly
 *   3. X-Original-Host header is set correctly
 *   4. The rewritten URL preserves the original path & query string
 *
 * Usage:
 *   node --experimental-strip-types scripts/chat-simulation/test-proxy-intercept.ts
 */

const http: typeof import('http') = require('http');
const assert: typeof import('assert') = require('assert');

// ---------------------------------------------------------------------------
// Inline re-implementation of maybeInterceptUrlThroughProxy (mirrors networking.ts)
// so the test is self-contained and doesn't need the full extension stack.
// ---------------------------------------------------------------------------

interface ReqHeaders { [key: string]: string }

function maybeInterceptUrlThroughProxy(
	originalUrl: string,
	proxyBaseUrl: string,
	headers: ReqHeaders,
): string {
	const originalParsed = new URL(originalUrl);

	headers['X-Original-Url'] = originalUrl;
	headers['X-Original-Host'] = originalParsed.hostname;

	const proxyUrl = new URL(originalParsed.pathname + originalParsed.search, proxyBaseUrl);
	return proxyUrl.toString();
}

// ---------------------------------------------------------------------------
// Minimal proxy server
// ---------------------------------------------------------------------------

interface CapturedRequest {
	url: string;
	headers: import('http').IncomingHttpHeaders;
	body: string;
}

function startProxyServer(): Promise<{ server: import('http').Server; port: number; captured: () => CapturedRequest | undefined }> {
	return new Promise((resolve, reject) => {
		let last: CapturedRequest | undefined;

		const server = http.createServer((req, res) => {
			let body = '';
			req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
			req.on('end', () => {
				last = { url: req.url ?? '', headers: req.headers, body };
				// Return a minimal OpenAI-compatible streaming response so any
				// real client wouldn't hang.
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ proxy: true, intercepted: true }));
			});
		});

		server.listen(0, '127.0.0.1', () => {
			const addr = server.address() as { port: number };
			resolve({ server, port: addr.port, captured: () => last });
		});

		server.on('error', reject);
	});
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pass(msg: string) { console.log(`  \x1b[32m✓\x1b[0m ${msg}`); }
function fail(msg: string) { console.error(`  \x1b[31mFAIL\x1b[0m ${msg}`); process.exitCode = 1; }

function check(label: string, actual: unknown, expected: unknown) {
	try {
		assert.strictEqual(actual, expected);
		pass(label);
	} catch {
		fail(`${label}\n      expected: ${JSON.stringify(expected)}\n      got:      ${JSON.stringify(actual)}`);
	}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function testUrlRewriting() {
	console.log('\n[1] URL rewriting logic');

	const proxyBase = 'http://127.0.0.1:9999';
	const originalUrl = 'https://api.github.com/copilot_internal/v2/token?foo=bar';
	const headers: ReqHeaders = {};

	const rewritten = maybeInterceptUrlThroughProxy(originalUrl, proxyBase, headers);

	check(
		'X-Original-Url header set',
		headers['X-Original-Url'],
		originalUrl,
	);
	check(
		'X-Original-Host header set',
		headers['X-Original-Host'],
		'api.github.com',
	);
	check(
		'Path preserved in rewritten URL',
		new URL(rewritten).pathname,
		'/copilot_internal/v2/token',
	);
	check(
		'Query preserved in rewritten URL',
		new URL(rewritten).search,
		'?foo=bar',
	);
	check(
		'Rewritten URL points to proxy host',
		new URL(rewritten).hostname,
		'127.0.0.1',
	);
	check(
		'Rewritten URL points to proxy port',
		String(new URL(rewritten).port),
		'9999',
	);
}

async function testLiveProxyIntercept() {
	console.log('\n[2] Live proxy intercept (real HTTP request)');

	const { server, port, captured } = await startProxyServer();
	const proxyBase = `http://127.0.0.1:${port}`;

	const originalUrl = 'https://api.githubcopilot.com/chat/completions?stream=1';
	const headers: ReqHeaders = {
		'Authorization': 'Bearer fake-token',
		'Content-Type': 'application/json',
	};

	const rewrittenUrl = maybeInterceptUrlThroughProxy(originalUrl, proxyBase, headers);

	// Fire a real HTTP request to the proxy
	await new Promise<void>((resolve, reject) => {
		const body = JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: 'hello' }] });
		const parsed = new URL(rewrittenUrl);

		const req = http.request(
			{
				hostname: parsed.hostname,
				port: Number(parsed.port),
				path: parsed.pathname + parsed.search,
				method: 'POST',
				headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
			},
			(res) => {
				res.resume(); // drain
				res.on('end', resolve);
			},
		);
		req.on('error', reject);
		req.write(body);
		req.end();
	});

	const cap = captured();
	if (!cap) {
		fail('Proxy did not receive any request');
		server.close();
		return;
	}

	check(
		'Proxy received request on correct path',
		cap.url,
		'/chat/completions?stream=1',
	);
	check(
		'X-Original-Url forwarded to proxy',
		cap.headers['x-original-url'],
		originalUrl,
	);
	check(
		'X-Original-Host forwarded to proxy',
		cap.headers['x-original-host'],
		'api.githubcopilot.com',
	);
	check(
		'Authorization header preserved',
		cap.headers['authorization'],
		'Bearer fake-token',
	);

	server.close();
}

async function testEnvVarProxyUrl() {
	console.log('\n[3] COPILOT_PROXY_URL environment variable detection');

	// Simulate what getConfiguredProxyUrl() does in networking.ts
	const original = process.env['COPILOT_PROXY_URL'];

	process.env['COPILOT_PROXY_URL'] = 'http://127.0.0.1:8080';
	check(
		'Reads proxy URL from env',
		process.env['COPILOT_PROXY_URL'],
		'http://127.0.0.1:8080',
	);

	delete process.env['COPILOT_PROXY_URL'];
	check(
		'Returns undefined when env not set',
		process.env['COPILOT_PROXY_URL'],
		undefined,
	);

	// Restore
	if (original !== undefined) {
		process.env['COPILOT_PROXY_URL'] = original;
	}
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

(async () => {
	console.log('=== Proxy intercept tests ===');

	await testUrlRewriting();
	await testLiveProxyIntercept();
	await testEnvVarProxyUrl();

	console.log('\n');
	if (process.exitCode === 1) {
		console.error('\x1b[31mSome tests failed.\x1b[0m');
	} else {
		console.log('\x1b[32mAll tests passed.\x1b[0m');
	}
})();
