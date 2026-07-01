/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Standalone dev tool: a local mock of the Copilot "policy" endpoints that
 * `DefaultAccountService` calls (entitlements, token, MCP registry, managed
 * settings), plus a small web GUI to author each response and to wire/unwire
 * `product.overrides.json`.
 *
 * This tool is NOT part of the shipped product. Run it from sources with:
 *
 *     npm run mock-policy-server
 *
 * Then open the printed URL, pick an endpoint, edit the JSON, Save, and Wire.
 * Reload Code OSS and run "Developer: Sync Account Policy" +
 * "Developer: Policy Diagnostics".
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { EndpointDef } from './endpoints';

const http = require('node:http') as typeof import('node:http');
const fs = require('node:fs') as typeof import('node:fs');
const path = require('node:path') as typeof import('node:path');
const { fileURLToPath } = require('node:url') as typeof import('node:url');
const { stripTypeScriptTypes } = require('node:module') as typeof import('node:module');

const endpoints: EndpointDef[] = require('./endpoints.ts');

const ROOT = path.resolve(__dirname, '..', '..');
const PRODUCT_JSON = path.join(ROOT, 'product.json');
const PRODUCT_OVERRIDES_JSON = path.join(ROOT, 'product.overrides.json');
const PRODUCT_OVERRIDES_BACKUP = path.join(ROOT, 'product.overrides.json.pre-mock-server');
const PUBLIC_DIR = path.join(__dirname, 'public');

/**
 * Default location of the managed-settings JSON schema, resolved against the
 * app's current working directory (i.e. where `npm run mock-policy-server` is
 * invoked — normally the vscode repo root). On dev machines the schema sits at
 * `./copilot-agent-runtime/schema/managed-settings-schema.json`. Override with
 * `--schema <url|file-uri|path>` or the `MANAGED_SETTINGS_SCHEMA` env var; web
 * (`http(s)://`) and `file://` URIs are both accepted.
 */
const DEFAULT_SCHEMA_SOURCE = 'copilot-agent-runtime/schema/managed-settings-schema.json';

const args = parseArgs(process.argv.slice(2));
const PORT = Number(args.port || process.env.PORT || 3000);
const HOST = args.host || '127.0.0.1';
const SCHEMA_SOURCE = args.schema || process.env.MANAGED_SETTINGS_SCHEMA || DEFAULT_SCHEMA_SOURCE;

/** Path -> endpoint definition. */
const endpointByPath = new Map(endpoints.map(e => [e.path, e]));

const currentBodies: Record<string, unknown> = {};
for (const endpoint of endpoints) {
	currentBodies[endpoint.id] = endpoint.presets[0] ? clone(endpoint.presets[0].body) : {};
}

const server = http.createServer((req, res) => {
	const url = new URL(req.url || '/', `http://${req.headers.host}`);
	const pathname = url.pathname;

	try {
		// Mocked Copilot endpoints. Only these get permissive CORS, so the web
		// build (browser) of Code OSS can call them cross-origin. The control API
		// (/api/*) and static assets stay same-origin: that avoids a CSRF surface
		// where an unrelated website could drive /api/wire and rewrite the local
		// product.overrides.json.
		const endpoint = endpointByPath.get(pathname);
		if (endpoint) {
			res.setHeader('Access-Control-Allow-Origin', '*');
			res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
			res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
			if (req.method === 'OPTIONS') {
				res.writeHead(204);
				res.end();
				return;
			}
			if (req.method === 'GET') {
				return sendJson(res, 200, currentBodies[endpoint.id]);
			}
		}

		// GUI control API (same-origin only — no CORS).
		if (pathname === '/api/state' && req.method === 'GET') {
			return sendJson(res, 200, getState());
		}

		if (pathname === '/api/schema' && req.method === 'GET') {
			const url = new URL(req.url, `http://${req.headers.host}`);
			const sourceParam = url.searchParams.get('source') || undefined;
			return loadSchema(sourceParam)
				.then(result => sendJson(res, 200, result))
				.catch(e => sendJson(res, 500, { error: e instanceof Error ? e.message : String(e) }));
		}

		if (pathname === '/api/state' && req.method === 'POST') {
			return readBody(req, (err, raw) => {
				if (err) {
					return sendJson(res, 400, { error: String(err) });
				}
				let payload;
				try {
					payload = JSON.parse(raw);
				} catch (e) {
					return sendJson(res, 400, { error: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}` });
				}
				const def = endpoints.find(e => e.id === payload?.endpoint);
				if (!def) {
					return sendJson(res, 400, { error: `Unknown endpoint "${payload?.endpoint}".` });
				}
				currentBodies[def.id] = payload.body;
				return sendJson(res, 200, getState());
			});
		}

		if (pathname === '/api/wire' && req.method === 'POST') {
			try {
				wireOverrides();
				return sendJson(res, 200, getState());
			} catch (e) {
				return sendJson(res, 500, { error: e instanceof Error ? e.message : String(e) });
			}
		}

		if (pathname === '/api/unwire' && req.method === 'POST') {
			try {
				unwireOverrides();
				return sendJson(res, 200, getState());
			} catch (e) {
				return sendJson(res, 500, { error: e instanceof Error ? e.message : String(e) });
			}
		}

		if (req.method === 'GET') {
			return serveStatic(pathname, res);
		}

		sendJson(res, 404, { error: 'Not found' });
	} catch (e) {
		sendJson(res, 500, { error: e instanceof Error ? e.message : String(e) });
	}
});

server.listen(PORT, HOST, () => {
	const base = `http://${HOST}:${PORT}`;
	console.log('');
	console.log('  Mock Copilot policy endpoints dev server');
	console.log('  ----------------------------------------');
	console.log(`  GUI:  ${base}/`);
	for (const endpoint of endpoints) {
		console.log(`  ${endpoint.label.padEnd(18)} ${base}${endpoint.path}`);
	}
	console.log('');
	console.log(`  Managed-settings schema source: ${SCHEMA_SOURCE}`);
	console.log('');
	console.log('  Open the GUI, edit the responses, Save, then Wire product.overrides.json.');
	console.log('  Reload Code OSS and run "Developer: Sync Account Policy".');
	console.log('');
});

/** The URL Code OSS should call for a given endpoint. */
function endpointUrl(endpoint: EndpointDef): string {
	return `http://${HOST}:${PORT}${endpoint.path}`;
}

/**
 * Resolve and load the managed-settings JSON schema from {@link SCHEMA_SOURCE}.
 * Accepts a web URL (`http(s)://`), a `file://` URI, or a filesystem path
 * (relative paths are resolved against the app's cwd). Re-reads on every call so
 * a dev can edit the schema and refresh the GUI without restarting the server.
 */
async function loadSchema(sourceOverride?: string): Promise<{ source: string; resolved: string; ok: boolean; schema?: unknown; error?: string }> {
	const source = sourceOverride || SCHEMA_SOURCE;
	try {
		if (/^https?:\/\//i.test(source)) {
			const res = await fetch(source);
			if (!res.ok) {
				return { source, resolved: source, ok: false, error: `HTTP ${res.status} ${res.statusText}` };
			}
			return { source, resolved: source, ok: true, schema: await res.json() };
		}

		const filePath = source.startsWith('file://')
			? fileURLToPath(source)
			: path.resolve(process.cwd(), source);

		// Guard against relative path traversal.
		if (!path.isAbsolute(source) && filePath.includes('..')) {
			return { source, resolved: filePath, ok: false, error: 'Relative paths must not contain ".."' };
		}

		if (!fs.existsSync(filePath)) {
			return { source, resolved: filePath, ok: false, error: `Schema file not found at ${filePath}` };
		}
		const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
		return { source, resolved: filePath, ok: true, schema };
	} catch (e) {
		return { source, resolved: source, ok: false, error: e instanceof Error ? e.message : String(e) };
	}
}

/** Build the state object the GUI renders. */
function getState() {
	return {
		endpoints: endpoints.map(e => ({
			id: e.id,
			label: e.label,
			path: e.path,
			productKey: e.productKey,
			description: e.description,
			url: endpointUrl(e),
			presets: e.presets,
			body: currentBodies[e.id]
		})),
		wired: isWired(),
		overridesPath: PRODUCT_OVERRIDES_JSON,
		overridesSnippet: buildOverridesSnippet()
	};
}

/** Build the full overrides JSON a user would paste into product.overrides.json. */
function buildOverridesSnippet() {
	const product = JSON.parse(fs.readFileSync(PRODUCT_JSON, 'utf8'));
	const baseAgent = product?.defaultChatAgent ?? {};
	return JSON.stringify({ defaultChatAgent: { ...baseAgent, ...overrideUrls() } }, null, '\t');
}

/** The `defaultChatAgent` URL overrides this server provides. */
function overrideUrls(): Record<string, string> {
	const urls: Record<string, string> = {};
	for (const endpoint of endpoints) {
		urls[endpoint.productKey] = endpointUrl(endpoint);
	}
	return urls;
}

/** Whether `product.overrides.json` currently points every endpoint at this server. */
function isWired(): boolean {
	let overrides;
	try {
		overrides = JSON.parse(fs.readFileSync(PRODUCT_OVERRIDES_JSON, 'utf8'));
	} catch {
		return false;
	}
	const agent = overrides?.defaultChatAgent;
	if (!agent) {
		return false;
	}
	const urls = overrideUrls();
	return Object.keys(urls).every(key => agent[key] === urls[key]);
}

/**
 * Write `product.overrides.json` so Code OSS calls this server for every policy
 * endpoint.
 *
 * `src/bootstrap-meta.ts` merges overrides via `Object.assign` (shallow,
 * top-level), so overriding nested keys requires writing back the whole
 * `defaultChatAgent` object. We seed it from `product.json` and flip only the
 * endpoint URLs, preserving every other key. Any other top-level overrides
 * already present are kept untouched.
 */
function wireOverrides(): void {
	const product = JSON.parse(fs.readFileSync(PRODUCT_JSON, 'utf8'));
	const baseAgent = product?.defaultChatAgent ?? {};

	// Back up existing overrides before touching them.
	if (fs.existsSync(PRODUCT_OVERRIDES_JSON)) {
		fs.copyFileSync(PRODUCT_OVERRIDES_JSON, PRODUCT_OVERRIDES_BACKUP);
		console.log(`  Backed up ${PRODUCT_OVERRIDES_JSON} -> ${PRODUCT_OVERRIDES_BACKUP}`);
	}

	let overrides = {};
	try {
		overrides = JSON.parse(fs.readFileSync(PRODUCT_OVERRIDES_JSON, 'utf8'));
	} catch {
		overrides = {};
	}

	const existingAgent = overrides.defaultChatAgent ?? baseAgent;
	overrides.defaultChatAgent = {
		...baseAgent,
		...existingAgent,
		...overrideUrls()
	};

	fs.writeFileSync(PRODUCT_OVERRIDES_JSON, JSON.stringify(overrides, null, '\t') + '\n');
	console.log(`  Wired ${PRODUCT_OVERRIDES_JSON} -> ${HOST}:${PORT}`);
}

/**
 * Revert the endpoint overrides: restore each URL to its `product.json` value
 * (or drop the key if absent). If `defaultChatAgent` ends up identical to
 * `product.json`, drop it; if the overrides file ends up empty, remove it.
 */
function unwireOverrides(): void {
	// If we have a backup, restore it wholesale instead of surgically reverting.
	if (fs.existsSync(PRODUCT_OVERRIDES_BACKUP)) {
		fs.copyFileSync(PRODUCT_OVERRIDES_BACKUP, PRODUCT_OVERRIDES_JSON);
		fs.rmSync(PRODUCT_OVERRIDES_BACKUP, { force: true });
		console.log(`  Restored ${PRODUCT_OVERRIDES_JSON} from backup`);
		return;
	}

	let overrides;
	try {
		overrides = JSON.parse(fs.readFileSync(PRODUCT_OVERRIDES_JSON, 'utf8'));
	} catch {
		return; // nothing to unwire
	}
	if (!overrides.defaultChatAgent) {
		return;
	}

	const product = JSON.parse(fs.readFileSync(PRODUCT_JSON, 'utf8'));
	const baseAgent = product?.defaultChatAgent ?? {};

	const agent = { ...overrides.defaultChatAgent };
	for (const endpoint of endpoints) {
		if (baseAgent[endpoint.productKey] === undefined) {
			delete agent[endpoint.productKey];
		} else {
			agent[endpoint.productKey] = baseAgent[endpoint.productKey];
		}
	}

	if (shallowEqual(agent, baseAgent)) {
		delete overrides.defaultChatAgent;
	} else {
		overrides.defaultChatAgent = agent;
	}

	if (Object.keys(overrides).length === 0) {
		fs.rmSync(PRODUCT_OVERRIDES_JSON, { force: true });
		console.log(`  Removed ${PRODUCT_OVERRIDES_JSON} (no overrides left)`);
	} else {
		fs.writeFileSync(PRODUCT_OVERRIDES_JSON, JSON.stringify(overrides, null, '\t') + '\n');
		console.log(`  Unwired ${PRODUCT_OVERRIDES_JSON}`);
	}
}

/** Serve a file from the public/ directory (plus the shared endpoints.js). */
/**
 * Read a `.ts` source file, strip type annotations via Node's built-in
 * `module.stripTypeScriptTypes()`, and serve the result as plain JavaScript.
 * This lets the browser GUI stay in TypeScript without a build step.
 */
function serveTypeStripped(tsPath: string, res: ServerResponse): void {
	const source = fs.readFileSync(tsPath, 'utf8');
	const stripped = stripTypeScriptTypes(source);
	res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
	res.end(stripped);
}

function serveStatic(pathname: string, res: ServerResponse): void {
	// The GUI loads the shared endpoints module that lives one level up.
	if (pathname === '/endpoints.js') {
		return serveTypeStripped(path.join(__dirname, 'endpoints.ts'), res);
	}

	const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');

	// Serve .ts sources as type-stripped JS when the browser requests .js.
	if (rel.endsWith('.js')) {
		const tsPath = path.normalize(path.join(PUBLIC_DIR, rel.replace(/\.js$/, '.ts')));
		if (tsPath.startsWith(PUBLIC_DIR + path.sep) && fs.existsSync(tsPath)) {
			return serveTypeStripped(tsPath, res);
		}
	}

	const filePath = path.normalize(path.join(PUBLIC_DIR, rel));

	// Guard against path traversal outside public/.
	if (!filePath.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
		return sendJson(res, 404, { error: 'Not found' });
	}

	res.writeHead(200, { 'Content-Type': contentType(filePath) });
	fs.createReadStream(filePath).pipe(res);
}

function contentType(filePath: string): string {
	switch (path.extname(filePath)) {
		case '.html': return 'text/html; charset=utf-8';
		case '.js': return 'text/javascript; charset=utf-8';
		case '.ts': return 'text/javascript; charset=utf-8';
		case '.css': return 'text/css; charset=utf-8';
		case '.json': return 'application/json; charset=utf-8';
		default: return 'application/octet-stream';
	}
}

function sendJson(res: ServerResponse, status: number, obj: unknown): void {
	res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
	res.end(JSON.stringify(obj, null, 2));
}

function readBody(req: IncomingMessage, cb: (err: Error | null, raw: string) => void): void {
	let raw = '';
	req.on('data', chunk => { raw += chunk; if (raw.length > 1_000_000) { req.destroy(); } });
	req.on('end', () => cb(null, raw));
	req.on('error', err => cb(err, ''));
}

function shallowEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
	const ak = Object.keys(a);
	const bk = Object.keys(b);
	if (ak.length !== bk.length) {
		return false;
	}
	return ak.every(k => JSON.stringify(a[k]) === JSON.stringify(b[k]));
}

function clone(value: unknown): unknown {
	return JSON.parse(JSON.stringify(value));
}

function parseArgs(argv: string[]): Record<string, string> {
	const out: Record<string, string> = {};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a.startsWith('--')) {
			const key = a.slice(2);
			const next = argv[i + 1];
			if (next && !next.startsWith('--')) {
				out[key] = next;
				i++;
			} else {
				out[key] = 'true';
			}
		}
	}
	return out;
}
