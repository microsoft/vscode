/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Local mock and passthrough proxy for the Copilot policy endpoints. */

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

const DEFAULT_SCHEMA_RELATIVE_PATH = 'copilot-agent-runtime/schema/managed-settings-schema.json';
const DEFAULT_SCHEMA_SOURCE = resolveDefaultSchemaSource();

/** Real API that un-mocked requests are forwarded to. */
const DEFAULT_UPSTREAM = 'https://api.github.com';
const PORT = 3000;

const args = parseArgs(process.argv.slice(2));
const HOST = args.host || '127.0.0.1';
const SCHEMA_SOURCE = args.schema || process.env.MANAGED_SETTINGS_SCHEMA || DEFAULT_SCHEMA_SOURCE;
const UPSTREAM = stripTrailingSlash(args.upstream || process.env.MOCK_POLICY_UPSTREAM || DEFAULT_UPSTREAM);

if (args.help) {
	printHelp();
	process.exit(0);
}

/** Explicit assets ensure GUI routing cannot shadow proxied API paths. */
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
resetEndpointState();

interface EndpointUpdate {
	endpoint: string;
	preset?: string;
	status?: number;
	body?: unknown;
	active?: boolean;
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
		if (pathname === '/api' || pathname.startsWith('/api/')) {
			if (!isAllowedControlOrigin(req)) {
				return sendJson(res, 403, { error: 'Cross-origin control API requests are not allowed.' });
			}
			return handleControlApi(req, res, pathname);
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
		const endpoint = endpoints.find(endpoint => pathname === endpoint.path);
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
function handleControlApi(req: IncomingMessage, res: ServerResponse, pathname: string): void {
	if (pathname === '/api/state' && req.method === 'GET') {
		return sendJson(res, 200, getState());
	}

	if ((pathname === '/api' || pathname === '/api/') && req.method === 'GET') {
		return sendJson(res, 200, {
			name: 'Mock Policy Server Control API',
			stateUpdate: {
				single: { endpoint: 'managedSettings', preset: 'empty', status: 200, body: {}, active: true },
				bulk: { endpoints: [{ endpoint: 'managedSettings', active: true }, { endpoint: 'entitlements', active: false }] }
			},
			routes: [
				{ method: 'GET', path: '/api/state', purpose: 'Read endpoint definitions, presets, and current state.' },
				{ method: 'POST', path: '/api/state', purpose: 'Apply one update or an atomic endpoints array.' },
				{ method: 'POST', path: '/api/reset', purpose: 'Restore startup endpoint state.' },
				{ method: 'GET', path: '/api/schema', purpose: 'Read the managed-settings schema.' },
				{ method: 'GET', path: '/api/log', purpose: 'Read the request log.' },
				{ method: 'DELETE', path: '/api/log', purpose: 'Clear the request log.' },
				{ method: 'DELETE', path: '/api/cache', purpose: 'Clear the managed-settings disk cache.' },
				{ method: 'POST', path: '/api/wire', purpose: 'Apply product.overrides.json.' },
				{ method: 'POST', path: '/api/unwire', purpose: 'Restore product.overrides.json.' }
			]
		});
	}

	if (pathname === '/api/state' && req.method === 'POST') {
		return readBody(req, (err, raw) => {
			if (err) {
				return sendJson(res, 400, { error: String(err) });
			}
			let payload: unknown;
			try {
				payload = JSON.parse(raw);
			} catch (e) {
				return sendJson(res, 400, { error: `Invalid JSON: ${errorMessage(e)}` });
			}
			const result = applyEndpointUpdates(payload);
			if (!result.ok) {
				return sendJson(res, 400, { error: result.error });
			}
			return sendJson(res, 200, getState());
		});
	}

	if (pathname === '/api/reset' && req.method === 'POST') {
		resetEndpointState();
		return sendJson(res, 200, getState());
	}

	if (pathname === '/api/schema' && req.method === 'GET') {
		return void loadSchema()
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

function applyEndpointUpdates(payload: unknown): { ok: true } | { ok: false; error: string } {
	if (!isRecord(payload)) {
		return { ok: false, error: 'Request body must be a JSON object.' };
	}

	let rawUpdates: unknown[];
	if (Object.hasOwn(payload, 'endpoints')) {
		const unknownKeys = Object.keys(payload).filter(key => key !== 'endpoints');
		if (unknownKeys.length) {
			return { ok: false, error: `Unknown top-level field${unknownKeys.length > 1 ? 's' : ''}: ${unknownKeys.join(', ')}.` };
		}
		if (!Array.isArray(payload.endpoints) || payload.endpoints.length === 0) {
			return { ok: false, error: '"endpoints" must be a non-empty array.' };
		}
		rawUpdates = payload.endpoints;
	} else {
		rawUpdates = [payload];
	}

	const updates: EndpointUpdate[] = [];
	const seen = new Set<string>();
	for (const [index, rawUpdate] of rawUpdates.entries()) {
		const prefix = rawUpdates.length > 1 ? `endpoints[${index}]` : 'Update';
		if (!isRecord(rawUpdate)) {
			return { ok: false, error: `${prefix} must be a JSON object.` };
		}

		const unknownKeys = Object.keys(rawUpdate).filter(key => !['endpoint', 'preset', 'status', 'body', 'active'].includes(key));
		if (unknownKeys.length) {
			return { ok: false, error: `${prefix} has unknown field${unknownKeys.length > 1 ? 's' : ''}: ${unknownKeys.join(', ')}.` };
		}
		if (typeof rawUpdate.endpoint !== 'string') {
			return { ok: false, error: `${prefix}.endpoint must be a string.` };
		}
		if (seen.has(rawUpdate.endpoint)) {
			return { ok: false, error: `Endpoint "${rawUpdate.endpoint}" appears more than once.` };
		}
		seen.add(rawUpdate.endpoint);

		const def = endpoints.find(endpoint => endpoint.id === rawUpdate.endpoint);
		if (!def) {
			return { ok: false, error: `Unknown endpoint "${rawUpdate.endpoint}". Valid endpoints: ${endpoints.map(endpoint => endpoint.id).join(', ')}.` };
		}
		if (!['preset', 'status', 'body', 'active'].some(key => Object.hasOwn(rawUpdate, key))) {
			return { ok: false, error: `${prefix} must include preset, status, body, or active.` };
		}
		if (Object.hasOwn(rawUpdate, 'preset')) {
			if (typeof rawUpdate.preset !== 'string') {
				return { ok: false, error: `${prefix}.preset must be a string.` };
			}
			if (!def.presets.some(preset => preset.id === rawUpdate.preset)) {
				return { ok: false, error: `Unknown preset "${rawUpdate.preset}" for "${def.id}". Valid presets: ${def.presets.map(preset => preset.id).join(', ')}.` };
			}
		}
		if (Object.hasOwn(rawUpdate, 'status')) {
			if (typeof rawUpdate.status !== 'number' || !Number.isInteger(rawUpdate.status) || rawUpdate.status < 200 || rawUpdate.status > 599) {
				return { ok: false, error: `${prefix}.status must be an integer from 200 to 599.` };
			}
		}
		if (Object.hasOwn(rawUpdate, 'active') && typeof rawUpdate.active !== 'boolean') {
			return { ok: false, error: `${prefix}.active must be a boolean.` };
		}

		const update: EndpointUpdate = { endpoint: rawUpdate.endpoint };
		if (typeof rawUpdate.preset === 'string') {
			update.preset = rawUpdate.preset;
		}
		if (typeof rawUpdate.status === 'number') {
			update.status = rawUpdate.status;
		}
		if (Object.hasOwn(rawUpdate, 'body')) {
			update.body = rawUpdate.body;
		}
		if (typeof rawUpdate.active === 'boolean') {
			update.active = rawUpdate.active;
		}
		updates.push(update);
	}

	const nextState = new Map<string, EndpointState>();
	for (const [id, entry] of state) {
		nextState.set(id, { status: entry.status, body: clone(entry.body), active: entry.active });
	}

	for (const update of updates) {
		const def = endpoints.find(endpoint => endpoint.id === update.endpoint)!;
		const entry = nextState.get(update.endpoint)!;
		if (update.preset !== undefined) {
			const preset = def.presets.find(candidate => candidate.id === update.preset)!;
			entry.status = preset.status ?? 200;
			entry.body = clone(preset.body);
			entry.active = true;
		}
		if (update.status !== undefined) {
			entry.status = update.status;
		}
		if (Object.hasOwn(update, 'body')) {
			entry.body = clone(update.body);
		}
		if (update.active !== undefined) {
			entry.active = update.active;
		}
	}

	for (const [id, entry] of nextState) {
		state.set(id, entry);
	}
	return { ok: true };
}

function resetEndpointState(): void {
	state.clear();
	for (const endpoint of endpoints) {
		const preset = endpoint.presets[0];
		state.set(endpoint.id, {
			status: preset?.status ?? 200,
			body: preset ? clone(preset.body) : {},
			active: endpoint.mockedByDefault === true
		});
	}
}

function isAllowedControlOrigin(req: IncomingMessage): boolean {
	const origin = req.headers.origin;
	if (!origin) {
		return true;
	}
	if (Array.isArray(origin) || !req.headers.host) {
		return false;
	}
	try {
		return new URL(origin).origin === new URL(`http://${req.headers.host}`).origin;
	} catch {
		return false;
	}
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
	const connectionHeaders = Array.isArray(headers.connection) ? headers.connection : [headers.connection ?? ''];
	const hopByHopHeaders = [
		'connection',
		'keep-alive',
		'proxy-authenticate',
		'proxy-authorization',
		'proxy-connection',
		'te',
		'trailer',
		'transfer-encoding',
		'upgrade',
		...connectionHeaders.flatMap(value => value.split(',')).map(value => value.trim().toLowerCase()).filter(Boolean),
	];
	for (const header of hopByHopHeaders) {
		delete headers[header];
	}
	// Never negotiate compression on the client's behalf: identity keeps the
	// streamed bytes readable in a proxy UI.
	delete headers['accept-encoding'];

	const upstreamReq = transport.request(target, { method: req.method, headers }, upstreamRes => {
		record(req, url.pathname, 'passthrough', upstreamRes.statusCode ?? 0);
		upstreamRes.on('error', error => {
			record(req, url.pathname, 'upstream-error', 502);
			res.destroy(error);
		});
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

server.on('error', error => {
	if (Reflect.get(error, 'code') === 'EADDRINUSE') {
		console.error(`\n  Error: server already running at http://${HOST}:${PORT}/\n`);
		process.exitCode = 1;
		return;
	}
	throw error;
});

server.listen(PORT, HOST, () => {
	const base = `http://${HOST}:${PORT}`;
	console.log('');
	console.log('  Mock Copilot policy endpoints dev server');
	console.log('  ----------------------------------------');
	console.log('');
	console.log(`  Open the GUI: ${base}/`);
	console.log('  Configure endpoint mocking and client routing in the GUI.');
	console.log('');
	console.log(`  Upstream  ${UPSTREAM}  (anything not mocked is proxied here)`);
	console.log(`  Schema    ${SCHEMA_SOURCE}`);
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
		} catch (error) {
			if (Reflect.get(error, 'code') === 'ENOENT') {
				missing.push(dir);
				continue;
			}
			throw error;
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

/** Local URL for an endpoint. */
function endpointUrl(endpoint: EndpointDef): string {
	return `http://${HOST}:${PORT}${endpoint.path}`;
}

/**
 * Resolve and load the managed-settings JSON schema from {@link SCHEMA_SOURCE}.
 * Accepts a web URL (`http(s)://`), a `file://` URI, or a filesystem path
 * (relative paths are resolved against the app's cwd). The GUI loads it once
 * during initialization.
 */
async function loadSchema(): Promise<{ source: string; resolved: string; ok: boolean; schema?: unknown; error?: string }> {
	const source = SCHEMA_SOURCE;
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

/**
 * Prefer the schema checkout beside the primary VS Code checkout. Git worktrees
 * point their `.git` file back to that checkout, so this also finds repositories
 * such as `/Users/name/git/copilot-agent-runtime` when VS Code is running from a
 * nested worktree.
 */
function resolveDefaultSchemaSource(): string {
	const candidates: string[] = [];
	const primaryCheckout = primaryCheckoutRoot();
	if (primaryCheckout) {
		candidates.push(path.join(path.dirname(primaryCheckout), DEFAULT_SCHEMA_RELATIVE_PATH));
	}
	candidates.push(
		path.resolve(process.cwd(), DEFAULT_SCHEMA_RELATIVE_PATH),
		path.resolve(ROOT, DEFAULT_SCHEMA_RELATIVE_PATH)
	);

	return candidates.find(candidate => fs.existsSync(candidate)) ?? candidates[0];
}

function primaryCheckoutRoot(): string | undefined {
	const dotGit = path.join(ROOT, '.git');
	try {
		if (fs.statSync(dotGit).isDirectory()) {
			return ROOT;
		}

		const match = /^gitdir:\s*(.+)$/m.exec(fs.readFileSync(dotGit, 'utf8'));
		if (!match) {
			return undefined;
		}

		let gitDir = path.resolve(ROOT, match[1].trim());
		while (path.dirname(gitDir) !== gitDir) {
			if (path.basename(gitDir) === '.git') {
				return path.dirname(gitDir);
			}
			gitDir = path.dirname(gitDir);
		}
	} catch {
		return undefined;
	}
	return undefined;
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
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

interface ServerArgs {
	host?: string;
	schema?: string;
	upstream?: string;
	help: boolean;
}

function parseArgs(argv: string[]): ServerArgs {
	const out: ServerArgs = { help: false };
	for (let i = 0; i < argv.length; i++) {
		const argument = argv[i];
		if (argument === '--help') {
			out.help = true;
			continue;
		}
		if (!argument.startsWith('--')) {
			failArgument(`Unexpected argument "${argument}".`);
		}

		const [key, inline] = argument.slice(2).split('=', 2);
		if (key !== 'host' && key !== 'schema' && key !== 'upstream') {
			failArgument(`Unknown option "--${key}".`);
		}

		const next = argv[i + 1];
		const value = inline ?? (next && !next.startsWith('--') ? next : undefined);
		if (!value) {
			failArgument(`Option "--${key}" requires a value.`);
		}
		out[key] = value;
		if (inline === undefined) {
			i++;
		}
	}
	return out;
}

function failArgument(message: string): never {
	console.error(`\n  Error: ${message} Run with --help for usage.\n`);
	process.exit(1);
}
