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
const { execFile } = require('child_process');
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
	setCors(res);
	sendJson(res, 404, { type: 'error', error: { type: 'not_found', message: 'unknown route' } });
});

server.listen(PORT, HOST, () => {
	if (BACKEND === 'openrouter') {
		console.log(`[lwd-proxy] listening on http://${HOST}:${PORT} -> ${OPENROUTER_URL} (TEST backend, model ${OPENROUTER_MODEL})`);
		console.log('[lwd-proxy] key source: OPENROUTER_API_KEY / OPENROUTER_API_KEY_FILE');
	} else {
		console.log(`[lwd-proxy] listening on http://${HOST}:${PORT} -> ${UPSTREAM}`);
		console.log('[lwd-proxy] token source: ant auth print-credentials --access-token (run `ant auth login` first)');
	}
});
