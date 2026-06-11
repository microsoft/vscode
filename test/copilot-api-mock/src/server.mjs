/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Mock Copilot API server.
 *
 * Serves the four endpoints VS Code core's `DefaultAccountProvider` hits, so
 * enterprise-managed plugins (and account policy) can be validated against Code
 * OSS without a real GitHub backend.
 *
 * The PRIMARY input is an editable `managed_settings` payload — the real
 * `.github/copilot/settings.json` artifact an admin authors. DELIVERY CONDITIONS
 * (the chat_enabled gate, the managed_settings HTTP status) are an orthogonal
 * axis you combine with any payload. Example payloads under `examples/` are
 * starting points, not the central abstraction.
 *
 * Endpoints mocked (paths from product.json -> defaultChatAgent):
 *   GET /copilot_internal/user             entitlements (chat_enabled gates the rest)
 *   GET /copilot_internal/v2/token         token entitlements (agent_mode / mcp / preview flags)
 *   GET /copilot/mcp_registry              MCP registry (only fetched when token mcp=1)
 *   GET /copilot_internal/managed_settings the editable enterprise policy payload
 *
 * Control plane:
 *   GET  /__health         liveness + port + example names
 *   GET  /__examples       [{ name, description }] starting-point payloads
 *   GET  /__example/<name> a single example payload
 *   GET  /__state          { settings, conditions }
 *   POST /__settings       raw managed_settings JSON -> set the active payload
 *   POST /__conditions     partial { chatEnabled, managedSettingsStatus, retryAfterSeconds } -> merge
 *   GET  /__adapted        current payload through core's real adaptManagedSettings
 *   GET  /__log            recent request log (what core actually fetched)
 */

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEntitlements, buildManagedSettings, buildMcpRegistry, buildToken } from './responses.mjs';
import { loadAdaptManagedSettings } from './adapter.mjs';
import { listExamples, loadExample, loadMeta } from './examples.mjs';

/** @param {string[]} argv */
function parseArgs(argv) {
	/** @type {Record<string, string>} */
	const out = {};
	for (let i = 0; i < argv.length; i++) {
		if (argv[i].startsWith('--')) {
			const key = argv[i].slice(2);
			const next = argv[i + 1];
			out[key] = next && !next.startsWith('--') ? argv[++i] : 'true';
		}
	}
	return out;
}

const args = parseArgs(process.argv.slice(2));
const PORT = Number(args.port ?? process.env.PORT ?? 3000);

const WEB_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'web');

// --- live server state ---------------------------------------------------
// The active managed_settings payload — the editable artifact. Seeded from an
// example when `--example <name>` is given, else empty (no enterprise policy).
let settings = {};
const seedExample = args.example ?? process.env.EXAMPLE;
if (seedExample) {
	try {
		settings = loadExample(seedExample);
	} catch {
		console.warn(`[copilot-api-mock] unknown --example "${seedExample}"; starting with no policy`);
	}
}

// Delivery conditions — an axis orthogonal to the payload. The gate is applied
// via the entitlements endpoint; the status drives the managed_settings fetch.
const conditions = {
	chatEnabled: true,
	managedSettingsStatus: 200,
	retryAfterSeconds: 3,
};

/** @type {Array<{ id: number; at: string; method: string; url: string; endpoint: string | null; authorized: boolean; conditions: object; status: number; durationMs: number; body?: unknown; adapted?: unknown; warnings: string[] }>} */
const requestLog = [];
const MAX_LOG = 200;
let logSeq = 0;

/**
 * Maps each mocked endpoint path to its key and a builder for the success body.
 * The builders read live server state, so edits to `settings` / `conditions`
 * take effect on the next fetch with no restart.
 */
const ENDPOINTS = {
	'/copilot_internal/user': { key: 'user', build: () => buildEntitlements({ chat_enabled: conditions.chatEnabled }) },
	'/copilot_internal/v2/token': { key: 'token', build: () => buildToken() },
	'/copilot/mcp_registry': { key: 'mcp_registry', build: () => buildMcpRegistry() },
	'/copilot_internal/managed_settings': { key: 'managed_settings', build: () => buildManagedSettings(settings) },
};

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {number} status
 * @param {{ durationMs?: number; endpoint?: string | null; body?: unknown; adapted?: unknown; warnings?: string[] }} [extra]
 */
function record(req, status, extra = {}) {
	requestLog.push({
		id: ++logSeq,
		at: new Date().toISOString(),
		method: req.method ?? 'GET',
		url: req.url ?? '',
		endpoint: extra.endpoint ?? null,
		authorized: Boolean(req.headers['authorization']),
		conditions: { ...conditions },
		status,
		durationMs: extra.durationMs ?? 0,
		body: extra.body,
		adapted: extra.adapted,
		warnings: extra.warnings ?? [],
	});
	if (requestLog.length > MAX_LOG) {
		requestLog.shift();
	}
}

/** @param {import('node:http').ServerResponse} res @param {number} status @param {unknown} bodyObj @param {Record<string, string>} [extraHeaders] */
function send(res, status, bodyObj, extraHeaders = {}) {
	const body = bodyObj === undefined ? '' : JSON.stringify(bodyObj, null, 2);
	res.writeHead(status, { 'Content-Type': 'application/json', ...extraHeaders });
	res.end(body);
}

/** @param {import('node:http').IncomingMessage} req */
function readBody(req) {
	return new Promise((resolve) => {
		let data = '';
		req.on('data', chunk => { data += chunk; });
		req.on('end', () => resolve(data));
	});
}

const server = createServer(async (req, res) => {
	const path = new URL(req.url ?? '/', `http://localhost:${PORT}`).pathname;

	// --- dev web app (served at /) -------------------------------------------
	if (path === '/' || path === '/index.html') {
		try {
			const html = readFileSync(join(WEB_DIR, 'index.html'));
			res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
			return res.end(html);
		} catch {
			return send(res, 500, { error: 'web/index.html not found' });
		}
	}
	if (path === '/favicon.ico') {
		// Answer the dashboard browser's automatic favicon request so it does not
		// show up as 404 noise in the request log (which is for Code OSS fetches).
		res.writeHead(204);
		return res.end();
	}

	// --- control plane -------------------------------------------------------
	// Deliberately NOT logged: only the four mocked endpoints (what Code OSS
	// fetched) belong in the request log, not the inspector's own polling.
	if (path === '/__health') {
		return send(res, 200, { ok: true, port: PORT, examples: listExamples() });
	}
	if (path === '/__examples') {
		const meta = loadMeta();
		return send(res, 200, listExamples().map(name => ({ name, description: meta[name] ?? '' })));
	}
	if (path.startsWith('/__example/')) {
		const name = decodeURIComponent(path.slice('/__example/'.length));
		try {
			return send(res, 200, { name, settings: loadExample(name) });
		} catch {
			return send(res, 404, { error: `no example "${name}"`, available: listExamples() });
		}
	}
	if (path === '/__state') {
		return send(res, 200, { settings, conditions });
	}
	if (path === '/__settings' && req.method === 'POST') {
		const body = await readBody(req);
		try {
			const parsed = JSON.parse(body || '{}');
			if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
				return send(res, 400, { error: 'managed_settings must be a JSON object' });
			}
			settings = parsed;
			return send(res, 200, { settings });
		} catch (err) {
			return send(res, 400, { error: `invalid JSON: ${String((err && /** @type {Error} */(err).message) || err)}` });
		}
	}
	if (path === '/__conditions' && req.method === 'POST') {
		const body = await readBody(req);
		try {
			const patch = JSON.parse(body || '{}');
			if (typeof patch.chatEnabled === 'boolean') { conditions.chatEnabled = patch.chatEnabled; }
			if (Number.isFinite(patch.managedSettingsStatus)) { conditions.managedSettingsStatus = Number(patch.managedSettingsStatus); }
			if (Number.isFinite(patch.retryAfterSeconds)) { conditions.retryAfterSeconds = Number(patch.retryAfterSeconds); }
			return send(res, 200, { conditions });
		} catch (err) {
			return send(res, 400, { error: `invalid JSON: ${String((err && /** @type {Error} */(err).message) || err)}` });
		}
	}
	if (path === '/__log') {
		return send(res, 200, requestLog);
	}
	if (path === '/__adapted') {
		const adapter = await loadAdaptManagedSettings();
		const raw = buildManagedSettings(settings);
		if (!adapter.available) {
			return send(res, 200, { available: false, reason: adapter.reason, raw, adapted: null, warnings: [] });
		}
		const warnings = [];
		const adapted = adapter.adapt(raw, m => warnings.push(m));
		return send(res, 200, { available: true, raw, adapted, warnings });
	}

	// --- mocked Copilot endpoints (logged — this is what Code OSS fetched) ----
	const endpoint = ENDPOINTS[path];
	if (endpoint) {
		const t0 = Date.now();

		// Delivery condition: a managed_settings failure status (e.g. 429/500). The
		// chat_enabled gate is applied separately, via the entitlements endpoint.
		if (endpoint.key === 'managed_settings' && conditions.managedSettingsStatus >= 400) {
			const status = conditions.managedSettingsStatus;
			const headers = status === 429 ? { 'Retry-After': String(conditions.retryAfterSeconds) } : {};
			const body = { error: `mock ${status}` };
			record(req, status, { durationMs: Date.now() - t0, endpoint: endpoint.key, body });
			return send(res, status, body, headers);
		}

		const body = endpoint.build();

		// For managed_settings, capture what core's REAL adapter computes from this
		// exact payload, so a timeline row stays self-contained even after the
		// payload or conditions change.
		let adapted;
		let warnings = [];
		if (endpoint.key === 'managed_settings') {
			const adapter = await loadAdaptManagedSettings();
			if (adapter.available) {
				const w = [];
				adapted = adapter.adapt(body, m => w.push(m));
				warnings = w;
			}
		}

		record(req, 200, { durationMs: Date.now() - t0, endpoint: endpoint.key, body, adapted, warnings });
		return send(res, 200, body);
	}

	record(req, 404);
	return send(res, 404, { error: `no mock for ${path}` });
});

server.listen(PORT, () => {
	const base = `http://localhost:${PORT}`;
	console.log('');
	console.log('  copilot-api-mock listening');
	console.log(`  ${'─'.repeat(48)}`);
	console.log(`  inspector: ${base}    ← Policy Inspector (open in a browser)`);
	console.log(`  base URL : ${base}`);
	console.log(`  examples : ${listExamples().join(', ')}`);
	console.log('');
	console.log('  Point Code OSS at this server:');
	console.log('    node scripts/apply-overrides.mjs' + (PORT !== 3000 ? ` --port ${PORT}` : ''));
	console.log('');
	console.log('  Control plane:');
	console.log(`    curl ${base}/__state`);
	console.log(`    curl -XPOST ${base}/__settings -d '{"strictKnownMarketplaces":true}'`);
	console.log(`    curl -XPOST ${base}/__conditions -d '{"managedSettingsStatus":429}'`);
	console.log(`    curl ${base}/__log`);
	console.log('');
});
