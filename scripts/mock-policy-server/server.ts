/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Standalone dev tool: a local mock of the Copilot "policy" endpoints that
 * `DefaultAccountService` calls (entitlements, token, MCP registry, managed
 * settings), plus a small web GUI to author each response.
 *
 * The server sits *in front of* the real API: requests for endpoints you have
 * not switched to "Mock" are proxied upstream and streamed back untouched. That
 * is what makes a blanket system-proxy rule safe — you can redirect a whole URL
 * prefix and still only fake the endpoints you deliberately enabled.
 *
 * Two ways to point a client here:
 *
 *   1. `product.overrides.json` (default; Code OSS from sources only)
 *   2. A system HTTP proxy rule (Proxyman/Charles/mitmproxy), which also works
 *      for stable/Insiders builds and the CLI, and needs no reload.
 *
 * This tool is NOT part of the shipped product. Run it from sources with:
 *
 *     npm run mock-policy-server
 *
 * Then open the printed URL, pick an endpoint, edit the status and JSON, and
 * either Wire the overrides or add the proxy rule shown in the GUI. See
 * README.md — in particular the managed-settings disk cache section, which is
 * the most common reason an override appears to do nothing.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { EndpointDef } from './endpoints';

const http = require('node:http') as typeof import('node:http');
const https = require('node:https') as typeof import('node:https');
const fs = require('node:fs') as typeof import('node:fs');
const os = require('node:os') as typeof import('node:os');
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

/** Real API that un-mocked requests are forwarded to. */
const DEFAULT_UPSTREAM = 'https://api.github.com';

const args = parseArgs(process.argv.slice(2));
const PORT = Number(args.port || process.env.PORT || 3000);
const HOST = args.host || '127.0.0.1';
const SCHEMA_SOURCE = args.schema || process.env.MANAGED_SETTINGS_SCHEMA || DEFAULT_SCHEMA_SOURCE;
const UPSTREAM = stripTrailingSlash(args.upstream || process.env.MOCK_POLICY_UPSTREAM || DEFAULT_UPSTREAM);

if (args.help === 'true' || args.h === 'true') {
	printHelp();
	process.exit(0);
}

/**
 * Endpoint routes, longest path first so a shorter path can never shadow a
 * longer sibling.
 */
const routes = [...endpoints].sort((a, b) => b.path.length - a.path.length);

/**
 * URL path -> file on disk for the GUI. An explicit allowlist rather than a
 * "does this look like a file" probe of `public/`, so a static read can never
 * intercept a real API path we are meant to proxy upstream.
 */
const GUI_ASSETS = new Map<string, string>([
	['/', path.join(PUBLIC_DIR, 'index.html')],
	['/index.html', path.join(PUBLIC_DIR, 'index.html')],
	['/style.css', path.join(PUBLIC_DIR, 'style.css')],
	['/app.js', path.join(PUBLIC_DIR, 'app.ts')],
	// Shared with the server, so it lives one level up.
	['/endpoints.js', path.join(__dirname, 'endpoints.ts')]
]);

interface EndpointState {
	status: number;
	body: unknown;
	/** When false the endpoint is proxied upstream instead of mocked. */
	active: boolean;
}

const state = new Map<string, EndpointState>();
for (const endpoint of endpoints) {
	const preset = endpoint.presets[0];
	state.set(endpoint.id, {
		status: preset?.status ?? 200,
		body: preset ? clone(preset.body) : {},
		active: endpoint.mockedByDefault === true
	});
}

interface LogEntry {
	at: number;
	method: string;
	path: string;
	outcome: 'mocked' | 'passthrough' | 'upstream-error';
	status: number;
}

/** Rolling log of what this server has served, newest first. Shown in the GUI. */
let requestLog: LogEntry[] = [];
const REQUEST_LOG_LIMIT = 200;

const server = http.createServer((req, res) => {
	const url = new URL(req.url || '/', `http://${req.headers.host}`);
	const pathname = url.pathname;

	try {
		// Control API and GUI assets are same-origin only — no CORS headers — so
		// an unrelated website cannot drive /api/wire and rewrite the local
		// product.overrides.json from the user's browser.
		if (pathname.startsWith('/api/')) {
			return handleControlApi(req, res, url);
		}

		if (req.method === 'GET' && GUI_ASSETS.has(pathname)) {
			return serveAsset(GUI_ASSETS.get(pathname)!, res);
		}

		// The GUI page triggers an automatic favicon request. Answering it here
		// keeps it out of both the upstream proxy and the request log, which
		// otherwise shows a confusing 404 the user never asked for.
		if (pathname === '/favicon.ico') {
			res.writeHead(204);
			res.end();
			return;
		}

		// Mocked Copilot endpoints. Only these get permissive CORS, so the web
		// build (browser) of Code OSS can call them cross-origin.
		const endpoint = routes.find(route => pathname === route.path);
		if (endpoint && state.get(endpoint.id)?.active) {
			const entry = state.get(endpoint.id)!;
			res.setHeader('Access-Control-Allow-Origin', '*');
			res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
			res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Editor-Version, Copilot-Runtime-Version');
			if (req.method === 'OPTIONS') {
				res.writeHead(204);
				res.end();
				return;
			}
			if (req.method === 'GET') {
				record(req, pathname, 'mocked', entry.status);
				return sendJson(res, entry.status, entry.body);
			}
		}

		// Everything else — including endpoints left in passthrough — goes to the
		// real API so a blanket proxy rule stays safe.
		return passthrough(req, res, url);
	} catch (e) {
		sendJson(res, 500, { error: errorMessage(e) });
	}
});

/** Same-origin control API used by the GUI. */
function handleControlApi(req: IncomingMessage, res: ServerResponse, url: URL): void {
	const pathname = url.pathname;

	if (pathname === '/api/state' && req.method === 'GET') {
		return sendJson(res, 200, getState());
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
				return sendJson(res, 400, { error: `Invalid JSON: ${errorMessage(e)}` });
			}
			const def = endpoints.find(e => e.id === payload?.endpoint);
			if (!def) {
				return sendJson(res, 400, { error: `Unknown endpoint "${payload?.endpoint}".` });
			}
			const entry = state.get(def.id)!;
			if (payload.status !== undefined) {
				if (!Number.isInteger(payload.status) || payload.status < 200 || payload.status > 599) {
					return sendJson(res, 400, { error: 'Status must be an integer from 200 to 599.' });
				}
				entry.status = payload.status;
			}
			if (payload.body !== undefined) {
				entry.body = payload.body;
			}
			if (payload.active !== undefined) {
				entry.active = Boolean(payload.active);
			}
			return sendJson(res, 200, getState());
		});
	}

	if (pathname === '/api/schema' && req.method === 'GET') {
		const sourceParam = url.searchParams.get('source') || undefined;
		return void loadSchema(sourceParam)
			.then(result => sendJson(res, 200, result))
			.catch(e => sendJson(res, 500, { error: errorMessage(e) }));
	}

	if (pathname === '/api/cache' && req.method === 'DELETE') {
		try {
			return sendJson(res, 200, clearManagedSettingsCache());
		} catch (e) {
			return sendJson(res, 500, { error: errorMessage(e) });
		}
	}

	if (pathname === '/api/log' && req.method === 'GET') {
		return sendJson(res, 200, { entries: requestLog });
	}

	if (pathname === '/api/log' && req.method === 'DELETE') {
		requestLog = [];
		return sendJson(res, 200, { entries: requestLog });
	}

	if (pathname === '/api/wire' && req.method === 'POST') {
		try {
			wireOverrides();
			return sendJson(res, 200, getState());
		} catch (e) {
			return sendJson(res, 500, { error: errorMessage(e) });
		}
	}

	if (pathname === '/api/unwire' && req.method === 'POST') {
		try {
			unwireOverrides();
			return sendJson(res, 200, getState());
		} catch (e) {
			return sendJson(res, 500, { error: errorMessage(e) });
		}
	}

	return sendJson(res, 404, { error: 'Not found' });
}

/**
 * Forward a request to the real upstream API and stream the response back, so
 * anything this server is not deliberately faking still behaves normally.
 */
function passthrough(req: IncomingMessage, res: ServerResponse, url: URL): void {
	const target = new URL(url.pathname + url.search, UPSTREAM);
	const transport = target.protocol === 'http:' ? http : https;

	const headers = { ...req.headers };
	// Rewrite Host so upstream TLS/vhost routing works, and drop hop-by-hop
	// headers that only described the connection to this server. The client's
	// Authorization header is forwarded untouched so the response is real.
	headers.host = target.host;
	delete headers.connection;
	delete headers['proxy-connection'];
	delete headers['keep-alive'];
	// Never negotiate compression on the client's behalf: identity keeps the
	// streamed bytes readable in a proxy UI.
	delete headers['accept-encoding'];

	const upstreamReq = transport.request(target, { method: req.method, headers }, upstreamRes => {
		record(req, url.pathname, 'passthrough', upstreamRes.statusCode ?? 0);
		res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
		upstreamRes.pipe(res);
	});

	upstreamReq.on('error', e => {
		record(req, url.pathname, 'upstream-error', 502);
		if (res.headersSent) {
			res.end();
		} else {
			sendJson(res, 502, { error: `Upstream request to ${target.host} failed: ${errorMessage(e)}` });
		}
	});

	req.pipe(upstreamReq);
}

server.listen(PORT, HOST, () => {
	const base = `http://${HOST}:${PORT}`;
	console.log('');
	console.log('  Mock Copilot policy endpoints dev server');
	console.log('  ----------------------------------------');
	console.log(`  GUI       ${base}/`);
	console.log(`  Upstream  ${UPSTREAM}  (anything not mocked is proxied here)`);
	console.log(`  Schema    ${SCHEMA_SOURCE}`);
	console.log('');
	for (const endpoint of endpoints) {
		const mode = state.get(endpoint.id)?.active ? 'MOCK' : 'pass';
		console.log(`  [${mode}] ${endpoint.label.padEnd(18)} ${base}${endpoint.path}`);
	}
	console.log('');
	console.log('  Open the GUI and either apply product.overrides.json, or add a proxy rule:');
	console.log(`    map  ${UPSTREAM}/copilot_internal/*`);
	console.log(`    to   ${base}/copilot_internal/*`);
	console.log('');
	console.log('  If a policy change seems to do nothing, clear the managed-settings');
	console.log('  disk cache from the GUI — a fresh entry makes the client skip the network.');
	console.log('');
});

function printHelp(): void {
	console.log('');
	console.log('  Mock Copilot policy endpoints dev server.');
	console.log('');
	console.log('  Usage:');
	console.log('    npm run mock-policy-server [-- <options>]');
	console.log('');
	console.log('  Options:');
	console.log('    --port <n>        Port to listen on (default 3000, env PORT)');
	console.log('    --host <addr>     Address to bind (default 127.0.0.1)');
	console.log('    --upstream <url>  Real API that un-mocked requests are proxied to');
	console.log(`                      (default ${DEFAULT_UPSTREAM}, env MOCK_POLICY_UPSTREAM)`);
	console.log('    --schema <src>    Managed-settings schema path, file: URI, or URL');
	console.log(`                      (default ${DEFAULT_SCHEMA_SOURCE}, env MANAGED_SETTINGS_SCHEMA)`);
	console.log('    --help            Show this message');
	console.log('');
}


/**
 * Directories the Copilot runtime may use for its managed-settings disk cache.
 *
 * Mirrors `path_helpers::copilot_cache_home` +
 * `managed_settings_cache::CACHE_SUBDIR` in copilot-agent-runtime:
 * `COPILOT_CACHE_HOME` wins outright, otherwise the platform cache base is
 * `~/Library/Caches` (macOS), `%LOCALAPPDATA%` (Windows) or
 * `${XDG_CACHE_HOME:-~/.cache}` (Linux), with `copilot/managed-settings`
 * beneath it.
 *
 * This matters because a *fresh* entry (< 1 hour) makes the runtime skip the
 * network entirely, so a policy change here is never even requested.
 */
function managedSettingsCacheDirs(): string[] {
	const dirs: string[] = [];
	const add = (base: string | undefined, ...rest: string[]) => {
		if (base) {
			dirs.push(path.join(base, ...rest));
		}
	};

	// COPILOT_CACHE_HOME replaces the whole platform cache base, so
	// `copilot` is not appended beneath it.
	add(process.env.COPILOT_CACHE_HOME, 'managed-settings');

	if (process.platform === 'darwin') {
		add(path.join(os.homedir(), 'Library', 'Caches'), 'copilot', 'managed-settings');
	} else if (process.platform === 'win32') {
		add(process.env.LOCALAPPDATA || path.join(os.homedir(), '.cache'), 'copilot', 'managed-settings');
	} else {
		add(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'copilot', 'managed-settings');
	}

	return [...new Set(dirs)];
}

/**
 * Delete every managed-settings cache entry, reporting how many files were
 * removed per directory so the GUI can say something more useful than "done".
 * A missing directory is the normal case, not an error.
 */
function clearManagedSettingsCache(): { cleared: { dir: string; files: number }[]; missing: string[] } {
	const cleared: { dir: string; files: number }[] = [];
	const missing: string[] = [];
	for (const dir of managedSettingsCacheDirs()) {
		let entries: string[];
		try {
			entries = fs.readdirSync(dir);
		} catch {
			missing.push(dir);
			continue;
		}
		fs.rmSync(dir, { recursive: true, force: true });
		cleared.push({ dir, files: entries.length });
	}
	return { cleared, missing };
}

/** Append to the rolling request log, newest first. */
function record(req: IncomingMessage, pathname: string, outcome: LogEntry['outcome'], status: number): void {
	requestLog.unshift({ at: Date.now(), method: req.method ?? 'GET', path: pathname, outcome, status });
	if (requestLog.length > REQUEST_LOG_LIMIT) {
		requestLog.length = REQUEST_LOG_LIMIT;
	}
}

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
			schema: e.schema === true,
			url: endpointUrl(e),
			presets: e.presets,
			status: state.get(e.id)!.status,
			body: state.get(e.id)!.body,
			active: state.get(e.id)!.active
		})),
		wired: isWired(),
		overridesPath: PRODUCT_OVERRIDES_JSON,
		overridesSnippet: buildOverridesSnippet(),
		baseUrl: `http://${HOST}:${PORT}`,
		upstream: UPSTREAM,
		cacheDirs: managedSettingsCacheDirs()
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

/**
 * Serve one allowlisted GUI asset. `.ts` sources are served as plain JavaScript
 * via Node's built-in `module.stripTypeScriptTypes()`, which lets the browser
 * GUI stay in TypeScript with no build step.
 *
 * `filePath` always comes from {@link GUI_ASSETS}, so there is no
 * user-controlled path to traverse out of and no way for a static read to
 * shadow an API path that should be proxied upstream.
 */
function serveAsset(filePath: string, res: ServerResponse): void {
	let source: Buffer | string;
	try {
		source = fs.readFileSync(filePath);
	} catch {
		return sendJson(res, 404, { error: `Missing GUI asset ${path.basename(filePath)}` });
	}

	if (filePath.endsWith('.ts')) {
		source = stripTypeScriptTypes(source.toString('utf8'));
	}

	res.writeHead(200, { 'Content-Type': contentType(filePath), 'Cache-Control': 'no-store' });
	res.end(source);
}

function contentType(filePath: string): string {
	switch (path.extname(filePath)) {
		case '.html': return 'text/html; charset=utf-8';
		case '.js': return 'text/javascript; charset=utf-8';
		// `.ts` assets are served type-stripped, so they are JavaScript by the
		// time they reach the browser.
		case '.ts': return 'text/javascript; charset=utf-8';
		case '.css': return 'text/css; charset=utf-8';
		case '.json': return 'application/json; charset=utf-8';
		default: return 'application/octet-stream';
	}
}

function sendJson(res: ServerResponse, status: number, obj: unknown): void {
	res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
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

function errorMessage(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}

function stripTrailingSlash(value: string): string {
	return value.endsWith('/') ? value.slice(0, -1) : value;
}

function parseArgs(argv: string[]): Record<string, string> {
	const out: Record<string, string> = {};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (!a.startsWith('--')) {
			continue;
		}
		const [key, inline] = a.slice(2).split('=', 2);
		if (inline !== undefined) {
			out[key] = inline;
			continue;
		}
		const next = argv[i + 1];
		if (next && !next.startsWith('--')) {
			out[key] = next;
			i++;
		} else {
			out[key] = 'true';
		}
	}
	return out;
}
