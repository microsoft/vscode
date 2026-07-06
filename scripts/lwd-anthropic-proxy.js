/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

// Localhost-only proxy that lets the Living Documents web build (served by @vscode/test-web at
// http://localhost:8080) reach the Claude Developer Platform without ever embedding a credential
// in the renderer. On each /v1/messages request it fetches a FRESH OAuth access token via
// `ant auth print-credentials --access-token` (which refreshes the token if needed), caches it for
// a short TTL, and forwards the request to api.anthropic.com with the OAuth headers. The developer
// authenticates once with `ant auth login`; the token lives only in ~/.config/anthropic and is
// never written here, logged, or sent to the browser.
//
// Run it with ./scripts/lwd-anthropic-proxy.sh (Node 24). Nothing is committed except this script.

'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, spawn } = require('child_process');
const { Readable } = require('stream');

const HOST = '127.0.0.1';
const PORT = Number(process.env.LWD_PROXY_PORT || 8090);
const UPSTREAM = 'https://api.anthropic.com/v1/messages';

// Backend selection. Default 'anthropic' = the production OAuth path (token via `ant`). 'openrouter'
// is a TEST-ONLY backend: it translates the Anthropic Messages request to OpenRouter's OpenAI-style
// chat API and the response back, so the unchanged renderer/service can be exercised against a cheap
// model without Anthropic Console credits. The OpenRouter key is read from env / a key file at
// runtime and is NEVER committed.
const BACKEND = (process.env.LWD_BACKEND || 'anthropic').toLowerCase();
const OPENROUTER_URL = process.env.OPENROUTER_URL || 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
// Tokens are short-lived; print-credentials refreshes on demand. A small cache avoids spawning
// `ant` on every keystroke-driven call without ever holding a stale token for long.
const TOKEN_TTL_MS = 60 * 1000;
// Bound the request body so a runaway client cannot exhaust memory; model calls here are tiny.
const MAX_BODY_BYTES = 1 * 1024 * 1024;

/** @type {{ token: string; fetchedAt: number } | undefined} */
let cachedToken;

/** Resolve a fresh OAuth access token, refreshing via `ant` when the cache is cold or stale. */
function getAccessToken() {
	const now = Date.now();
	if (cachedToken && (now - cachedToken.fetchedAt) < TOKEN_TTL_MS) {
		return Promise.resolve(cachedToken.token);
	}
	return new Promise((resolve, reject) => {
		// A set ANTHROPIC_API_KEY (even empty) silently shadows the OAuth profile, so strip it from
		// the child environment. print-credentials --access-token prints the bare token and refreshes.
		const env = Object.assign({}, process.env);
		delete env.ANTHROPIC_API_KEY;
		execFile('ant', ['auth', 'print-credentials', '--access-token'], { env, timeout: 20000 }, (err, stdout, stderr) => {
			if (err) {
				reject(new Error(`ant auth print-credentials failed: ${stderr ? String(stderr).trim() : err.message}`));
				return;
			}
			const token = String(stdout).trim();
			if (!token) {
				reject(new Error('ant auth print-credentials returned an empty token (is `ant auth login` done?)'));
				return;
			}
			cachedToken = { token, fetchedAt: Date.now() };
			resolve(token);
		});
	});
}

/** Standard permissive CORS for a localhost-only dev proxy (the page origin is http://localhost:8080). */
function setCors(res) {
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', 'content-type, anthropic-version, anthropic-beta');
	res.setHeader('Access-Control-Max-Age', '600');
}

function sendJson(res, status, obj) {
	const body = JSON.stringify(obj);
	res.writeHead(status, { 'content-type': 'application/json' });
	res.end(body);
}

function readBody(req) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let size = 0;
		req.on('data', chunk => {
			size += chunk.length;
			if (size > MAX_BODY_BYTES) {
				reject(new Error('request body too large'));
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
		req.on('error', reject);
	});
}

// Production path: forward verbatim to the Anthropic Messages API with the OAuth token. OAuth tokens
// go on Authorization: Bearer (NOT x-api-key) and /v1/messages requires the oauth beta header;
// anthropic-version is always required.
async function forwardToAnthropic(body) {
	const token = await getAccessToken();
	const upstream = await fetch(UPSTREAM, {
		method: 'POST',
		headers: {
			'authorization': `Bearer ${token}`,
			'anthropic-version': '2023-06-01',
			'anthropic-beta': 'oauth-2025-04-20',
			'content-type': 'application/json',
		},
		body,
	});
	const text = await upstream.text();
	return { status: upstream.status, contentType: upstream.headers.get('content-type') || 'application/json', text };
}

function openRouterKey() {
	if (process.env.OPENROUTER_API_KEY) { return process.env.OPENROUTER_API_KEY.trim(); }
	const file = process.env.OPENROUTER_API_KEY_FILE;
	if (file) {
		try { return fs.readFileSync(file, 'utf8').trim(); } catch { return ''; }
	}
	return '';
}

function proxyError(message) {
	return { status: 502, contentType: 'application/json', text: JSON.stringify({ type: 'error', error: { type: 'proxy_error', message } }) };
}

// TEST backend: Anthropic Messages request -> OpenRouter chat request, and the response back into the
// Anthropic Messages shape the service parses (content[].text + stop_reason). Lets the renderer/service
// be exercised against a cheap model with no Anthropic credits.
// Flatten an Anthropic Messages request into the OpenAI-style `messages` array OpenRouter expects. Shared
// by the buffered and the streaming OpenRouter paths so the request shape is translated in exactly one place.
function toOpenRouterMessages(req) {
	const messages = [];
	if (typeof req.system === 'string' && req.system) { messages.push({ role: 'system', content: req.system }); }
	for (const m of req.messages || []) {
		const content = typeof m.content === 'string'
			? m.content
			: (Array.isArray(m.content) ? m.content.map(p => (p && p.text) ? p.text : '').join('') : String(m.content ?? ''));
		const role = m.role === 'assistant' ? 'assistant' : (m.role === 'system' ? 'system' : 'user');
		messages.push({ role, content });
	}
	return messages;
}

// Standard SSE headers for an unbuffered event stream (both backends normalise to Anthropic-shaped events).
function writeSseHead(res) {
	setCors(res);
	res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'connection': 'keep-alive' });
}

// Serialise one Anthropic-shaped SSE event the renderer's parser understands.
function sseEvent(event, data) {
	return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function forwardToOpenRouter(body) {
	const key = openRouterKey();
	if (!key) { return proxyError('OPENROUTER_API_KEY (or OPENROUTER_API_KEY_FILE) is not set'); }
	const req = JSON.parse(body);
	const messages = toOpenRouterMessages(req);
	const orBody = JSON.stringify({ model: OPENROUTER_MODEL, max_tokens: req.max_tokens || 1024, messages });
	const upstream = await fetch(OPENROUTER_URL, {
		method: 'POST',
		headers: {
			'authorization': `Bearer ${key}`,
			'content-type': 'application/json',
			'HTTP-Referer': 'http://localhost:8080',
			'X-OpenRouter-Title': 'Living Documents (dev proxy)',
		},
		body: orBody,
	});
	const orText = await upstream.text();
	let orJson;
	try { orJson = JSON.parse(orText); } catch { orJson = undefined; }
	if (!upstream.ok || !orJson || orJson.error) {
		const message = (orJson && orJson.error) ? (orJson.error.message || 'openrouter error') : `openrouter http ${upstream.status}`;
		return proxyError(message);
	}
	const choice = (orJson.choices && orJson.choices[0]) || {};
	const text = (choice.message && choice.message.content) || '';
	const finish = choice.finish_reason || 'stop';
	const stopReason = finish === 'length' ? 'max_tokens' : (finish === 'content_filter' ? 'refusal' : 'end_turn');
	const anthropic = {
		id: orJson.id || 'or-msg',
		type: 'message',
		role: 'assistant',
		model: orJson.model || OPENROUTER_MODEL,
		stop_reason: stopReason,
		content: [{ type: 'text', text: String(text) }],
	};
	return { status: 200, contentType: 'application/json', text: JSON.stringify(anthropic) };
}

// Streaming production path: forward to Anthropic with stream:true and pipe the SSE bytes straight through,
// unbuffered, so deltas reach the renderer as they are produced. If the client disconnects mid-stream
// (the renderer's AbortController on cancel), destroying the node stream cancels the upstream reader and
// closes the socket to Anthropic - no orphaned in-flight call. The credential never leaves the proxy.
async function forwardToAnthropicStream(body, res) {
	const token = await getAccessToken();
	const upstream = await fetch(UPSTREAM, {
		method: 'POST',
		headers: {
			'authorization': `Bearer ${token}`,
			'anthropic-version': '2023-06-01',
			'anthropic-beta': 'oauth-2025-04-20',
			'content-type': 'application/json',
		},
		body,
	});
	if (!upstream.ok || !upstream.body) {
		const text = await upstream.text().catch(() => '');
		setCors(res);
		res.writeHead(upstream.status || 502, { 'content-type': 'application/json' });
		res.end(text || JSON.stringify({ type: 'error', error: { type: 'proxy_error', message: `anthropic http ${upstream.status}` } }));
		return;
	}
	writeSseHead(res);
	const nodeStream = Readable.fromWeb(upstream.body);
	res.on('close', () => nodeStream.destroy());
	nodeStream.on('error', () => { if (!res.writableEnded) { res.end(); } });
	nodeStream.pipe(res);
}

// Streaming TEST path: request OpenAI-style SSE from OpenRouter and normalise each chunk to an Anthropic
// `content_block_delta` (text_delta) event, so the renderer parses ONE format regardless of backend. The
// mapping is deliberately tiny: OpenAI `choices[0].delta.content` -> Anthropic text_delta; `[DONE]` ->
// `message_stop`; everything else (keep-alives, role-only deltas, usage) is ignored.
async function forwardToOpenRouterStream(req, res) {
	const key = openRouterKey();
	if (!key) {
		setCors(res);
		res.writeHead(502, { 'content-type': 'application/json' });
		res.end(JSON.stringify({ type: 'error', error: { type: 'proxy_error', message: 'OPENROUTER_API_KEY (or OPENROUTER_API_KEY_FILE) is not set' } }));
		return;
	}
	const orBody = JSON.stringify({ model: OPENROUTER_MODEL, max_tokens: req.max_tokens || 1024, messages: toOpenRouterMessages(req), stream: true });
	const upstream = await fetch(OPENROUTER_URL, {
		method: 'POST',
		headers: {
			'authorization': `Bearer ${key}`,
			'content-type': 'application/json',
			'accept': 'text/event-stream',
			'HTTP-Referer': 'http://localhost:8080',
			'X-OpenRouter-Title': 'Living Documents (dev proxy)',
		},
		body: orBody,
	});
	if (!upstream.ok || !upstream.body) {
		const text = await upstream.text().catch(() => '');
		let message = `openrouter http ${upstream.status}`;
		try { const j = JSON.parse(text); if (j && j.error && j.error.message) { message = j.error.message; } } catch { /* keep default */ }
		setCors(res);
		res.writeHead(502, { 'content-type': 'application/json' });
		res.end(JSON.stringify({ type: 'error', error: { type: 'proxy_error', message } }));
		return;
	}
	writeSseHead(res);
	const nodeStream = Readable.fromWeb(upstream.body);
	res.on('close', () => nodeStream.destroy());
	let buf = '';
	const endStream = () => { if (!res.writableEnded) { res.write(sseEvent('message_stop', { type: 'message_stop' })); res.end(); } };
	nodeStream.on('data', chunk => {
		buf += chunk.toString('utf8');
		let nl;
		while ((nl = buf.indexOf('\n')) >= 0) {
			const line = buf.slice(0, nl).trim();
			buf = buf.slice(nl + 1);
			if (!line.startsWith('data:')) { continue; }
			const payload = line.slice(5).trim();
			if (payload === '[DONE]') { endStream(); return; }
			try {
				const j = JSON.parse(payload);
				const delta = j.choices && j.choices[0] && j.choices[0].delta;
				const text = delta && delta.content;
				if (typeof text === 'string' && text.length) {
					res.write(sseEvent('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }));
				}
			} catch { /* keep-alive comment or malformed chunk -> ignore */ }
		}
	});
	nodeStream.on('end', endStream);
	nodeStream.on('error', () => { if (!res.writableEnded) { res.end(); } });
}

// --- MCP resolution + credentials (plan 29, iter 4) ------------------------------------------------
// The proxy owns the same trust boundary as the model calls (decision 14): it spawns locally configured
// MCP servers and holds API secrets, so a credential never reaches the renderer or the lock. Config lives
// in an `mcp.json` (D29-B) read from LWD_MCP_CONFIG (or ./mcp.json); secrets in ~/.abstract/secrets.json
// (D29-C, 0600), set via the `set-secret` CLI below.

const MCP_CONFIG_PATH = process.env.LWD_MCP_CONFIG || path.join(process.cwd(), 'mcp.json');
const MCP_TIMEOUT_MS = 10 * 1000;
const SECRETS_DIR = path.join(os.homedir(), '.abstract');
const SECRETS_PATH = path.join(SECRETS_DIR, 'secrets.json');

// Read mcp.json fresh on each resolve so editing it (adding a server) is picked up without a restart.
function loadMcpConfig() {
	try { return JSON.parse(fs.readFileSync(MCP_CONFIG_PATH, 'utf8')); } catch { return { servers: {} }; }
}

function readSecrets() {
	try { return JSON.parse(fs.readFileSync(SECRETS_PATH, 'utf8')); } catch { return {}; }
}
function readSecret(name) {
	const s = readSecrets();
	return (s && typeof s[name] === 'string') ? s[name] : '';
}
// Persist a named secret with 0600 perms (owner-only), creating ~/.abstract at 0700. Never the workspace.
function writeSecret(name, value) {
	const secrets = readSecrets();
	secrets[name] = value;
	fs.mkdirSync(SECRETS_DIR, { recursive: true, mode: 0o700 });
	fs.writeFileSync(SECRETS_PATH, JSON.stringify(secrets, null, 2) + '\n', { mode: 0o600 });
	try { fs.chmodSync(SECRETS_PATH, 0o600); } catch { /* best effort on platforms without chmod */ }
}

/** @type {Map<string, { child: import('child_process').ChildProcess; buf: string; nextId: number; pending: Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>; ready: Promise<void> | null }>} */
const mcpConns = new Map();

// Spawn one configured MCP server and wire its newline-delimited JSON-RPC stdout back to pending requests.
function spawnMcp(name, def) {
	const child = spawn(def.command, def.args || [], { stdio: ['pipe', 'pipe', 'pipe'], env: Object.assign({}, process.env, def.env || {}) });
	const conn = { child, buf: '', nextId: 1, pending: new Map(), ready: null };
	child.stdout.setEncoding('utf8');
	child.stdout.on('data', chunk => {
		conn.buf += chunk;
		let nl;
		while ((nl = conn.buf.indexOf('\n')) >= 0) {
			const line = conn.buf.slice(0, nl).trim();
			conn.buf = conn.buf.slice(nl + 1);
			if (!line) { continue; }
			let msg;
			try { msg = JSON.parse(line); } catch { continue; }
			if (msg && msg.id !== undefined && conn.pending.has(msg.id)) {
				const p = conn.pending.get(msg.id);
				conn.pending.delete(msg.id);
				if (msg.error) { p.reject(new Error(msg.error.message || 'mcp error')); }
				else { p.resolve(msg.result); }
			}
		}
	});
	child.stderr.on('data', () => { /* server diagnostics are ignored; never surfaced to the renderer */ });
	const fail = (reason) => {
		mcpConns.delete(name);
		for (const p of conn.pending.values()) { p.reject(new Error(reason)); }
		conn.pending.clear();
	};
	child.on('exit', () => fail('mcp server exited'));
	child.on('error', () => fail('mcp server failed to start'));
	return conn;
}

// Send one JSON-RPC request and await its matching response, bounded by MCP_TIMEOUT_MS.
function mcpSend(conn, method, params) {
	const id = conn.nextId++;
	const payload = { jsonrpc: '2.0', id, method };
	if (params !== undefined) { payload.params = params; }
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => { conn.pending.delete(id); reject(new Error(`mcp ${method} timed out`)); }, MCP_TIMEOUT_MS);
		conn.pending.set(id, {
			resolve: v => { clearTimeout(timer); resolve(v); },
			reject: e => { clearTimeout(timer); reject(e); },
		});
		try { conn.child.stdin.write(JSON.stringify(payload) + '\n'); }
		catch (e) { clearTimeout(timer); conn.pending.delete(id); reject(e instanceof Error ? e : new Error(String(e))); }
	});
}
function mcpNotify(conn, method) {
	try { conn.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n'); } catch { /* ignore */ }
}

// Get a ready (initialized) connection for a server, spawning + handshaking once and reusing it thereafter.
async function getMcpConn(name) {
	const existing = mcpConns.get(name);
	if (existing) { await existing.ready; return existing; }
	const cfg = loadMcpConfig();
	const def = cfg && cfg.servers && cfg.servers[name];
	if (!def || !def.command) { throw new Error(`no MCP server "${name}" configured in ${MCP_CONFIG_PATH}`); }
	const conn = spawnMcp(name, def);
	mcpConns.set(name, conn);
	conn.ready = (async () => {
		await mcpSend(conn, 'initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'lwd-proxy', version: '1.0.0' } });
		mcpNotify(conn, 'notifications/initialized');
	})();
	await conn.ready;
	return conn;
}

// POST /mcp/resolve: { server, tool, args?, field? } -> { value, raw }. Spawns/reuses the configured MCP
// server, calls the tool, and extracts `field` from the tool's JSON text content. Structured errors on any
// failure so the renderer degrades to a flagged stale binding rather than an error toast.
async function resolveMcp(req, res) {
	const body = await readBody(req);
	let parsed;
	try { parsed = JSON.parse(body); } catch { parsed = undefined; }
	if (!parsed || !parsed.server || !parsed.tool) {
		sendJson(res, 400, { error: { type: 'mcp_error', message: 'server and tool are required' } });
		return;
	}
	try {
		const conn = await getMcpConn(parsed.server);
		const result = await mcpSend(conn, 'tools/call', { name: parsed.tool, arguments: parsed.args || {} });
		const content = (result && Array.isArray(result.content)) ? result.content : [];
		const text = content.filter(c => c && c.type === 'text').map(c => c.text || '').join('');
		let value = text;
		if (parsed.field) {
			try {
				const obj = JSON.parse(text);
				const f = obj[parsed.field];
				value = f === undefined ? '' : (typeof f === 'number' ? f.toLocaleString('en-US') : String(f));
			} catch { value = ''; }
		}
		sendJson(res, 200, { value, raw: text });
	} catch (e) {
		sendJson(res, 502, { error: { type: 'mcp_error', message: String(e && e.message ? e.message : e) } });
	}
}

// POST /proxy/fetch: { url, auth? } -> the upstream JSON, with the named proxy-side secret injected as a
// Bearer header (plan 29, iter 4 API auth). The secret is read here and never returned or logged, so an
// authenticated `api` source resolves without the credential ever reaching the renderer.
async function proxyFetch(req, res) {
	const body = await readBody(req);
	let parsed;
	try { parsed = JSON.parse(body); } catch { parsed = undefined; }
	if (!parsed || !parsed.url) {
		sendJson(res, 400, { error: { type: 'proxy_error', message: 'url is required' } });
		return;
	}
	try {
		const headers = { 'accept': 'application/json' };
		if (parsed.auth) {
			const secret = readSecret(parsed.auth);
			if (secret) { headers['authorization'] = `Bearer ${secret}`; }
		}
		const upstream = await fetch(parsed.url, { method: 'GET', headers });
		const text = await upstream.text();
		setCors(res);
		res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') || 'application/json' });
		res.end(text);
	} catch (e) {
		sendJson(res, 502, { error: { type: 'proxy_error', message: String(e && e.message ? e.message : e) } });
	}
}

async function forwardMessages(req, res) {
	const body = await readBody(req);
	let parsed;
	try { parsed = JSON.parse(body); } catch { parsed = undefined; }
	// A `stream: true` body switches to the unbuffered SSE path; every existing (non-streaming) caller is
	// byte-identical to before.
	if (parsed && parsed.stream === true) {
		if (BACKEND === 'openrouter') { await forwardToOpenRouterStream(parsed, res); }
		else { await forwardToAnthropicStream(body, res); }
		return;
	}
	const result = BACKEND === 'openrouter' ? await forwardToOpenRouter(body) : await forwardToAnthropic(body);
	setCors(res);
	res.writeHead(result.status, { 'content-type': result.contentType });
	res.end(result.text);
}

const server = http.createServer((req, res) => {
	const url = req.url || '';
	if (req.method === 'OPTIONS') {
		setCors(res);
		res.writeHead(204);
		res.end();
		return;
	}
	if (req.method === 'GET' && url.startsWith('/healthz')) {
		setCors(res);
		sendJson(res, 200, { ok: true, backend: BACKEND });
		return;
	}
	if (req.method === 'POST' && url.startsWith('/v1/messages')) {
		forwardMessages(req, res).catch(err => {
			// Surface a clean error to the renderer; never echo the token or message body.
			console.error('[lwd-proxy] request failed:', err && err.message ? err.message : err);
			setCors(res);
			sendJson(res, 502, { type: 'error', error: { type: 'proxy_error', message: String(err && err.message ? err.message : err) } });
		});
		return;
	}
	if (req.method === 'POST' && url.startsWith('/mcp/resolve')) {
		resolveMcp(req, res).catch(err => {
			console.error('[lwd-proxy] mcp resolve failed:', err && err.message ? err.message : err);
			setCors(res);
			sendJson(res, 502, { error: { type: 'mcp_error', message: String(err && err.message ? err.message : err) } });
		});
		return;
	}
	if (req.method === 'POST' && url.startsWith('/proxy/fetch')) {
		proxyFetch(req, res).catch(err => {
			console.error('[lwd-proxy] proxy fetch failed:', err && err.message ? err.message : err);
			setCors(res);
			sendJson(res, 502, { error: { type: 'proxy_error', message: String(err && err.message ? err.message : err) } });
		});
		return;
	}
	setCors(res);
	sendJson(res, 404, { type: 'error', error: { type: 'not_found', message: 'unknown route' } });
});

// CLI: `node scripts/lwd-anthropic-proxy.js set-secret <name> <value>` stores a proxy-side secret (D29-C)
// and exits without starting the server, so a credential is written only to ~/.abstract/secrets.json (0600).
if (process.argv[2] === 'set-secret') {
	const name = process.argv[3];
	const value = process.argv.slice(4).join(' ');
	if (!name || !value) {
		console.error('usage: node scripts/lwd-anthropic-proxy.js set-secret <name> <value>');
		process.exit(1);
	}
	writeSecret(name, value);
	console.log(`[lwd-proxy] stored secret "${name}" in ${SECRETS_PATH} (0600)`);
	process.exit(0);
}

// Tear down any spawned MCP servers when the proxy exits, so no child process is orphaned.
function killMcpServers() {
	for (const conn of mcpConns.values()) { try { conn.child.kill(); } catch { /* already gone */ } }
	mcpConns.clear();
}
process.on('SIGINT', () => { killMcpServers(); process.exit(0); });
process.on('SIGTERM', () => { killMcpServers(); process.exit(0); });

server.listen(PORT, HOST, () => {
	if (BACKEND === 'openrouter') {
		console.log(`[lwd-proxy] listening on http://${HOST}:${PORT} -> ${OPENROUTER_URL} (TEST backend, model ${OPENROUTER_MODEL})`);
		console.log('[lwd-proxy] key source: OPENROUTER_API_KEY / OPENROUTER_API_KEY_FILE');
	} else {
		console.log(`[lwd-proxy] listening on http://${HOST}:${PORT} -> ${UPSTREAM}`);
		console.log('[lwd-proxy] token source: ant auth print-credentials --access-token (run `ant auth login` first)');
	}
});
