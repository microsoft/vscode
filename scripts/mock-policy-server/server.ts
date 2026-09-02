/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Local mock and passthrough proxy for the Copilot policy endpoints. */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { EndpointDef, EndpointResponseMode } from './endpoints';

const http = require('node:http') as typeof import('node:http');
const https = require('node:https') as typeof import('node:https');
const fs = require('node:fs') as typeof import('node:fs');
const os = require('node:os') as typeof import('node:os');
const path = require('node:path') as typeof import('node:path');
const { fileURLToPath } = require('node:url') as typeof import('node:url');
const { stripTypeScriptTypes } = require('node:module') as typeof import('node:module');

const endpoints: EndpointDef[] = require('./endpoints.ts');

const ROOT = path.resolve(__dirname, '..', '..');
const PUBLIC_DIR = path.join(__dirname, 'public');

const DEFAULT_SCHEMA_RELATIVE_PATH = 'copilot-agent-runtime/schema/managed-settings-schema.json';
const DEFAULT_SCHEMA_SOURCE = resolveDefaultSchemaSource();

/** Real API that un-mocked requests are forwarded to. */
const DEFAULT_UPSTREAM = 'https://api.github.com';
const DEFAULT_PORT = 3000;
const DEFAULT_STATE_FILE = path.join(os.homedir(), '.mock-policy-server', 'state.json');
const SETUP_PROBE_PARAM = 'mockPolicySetupProbe';
const MOCK_SERVER_HEADER = 'X-Mock-Policy-Server';

const args = parseArgs(process.argv.slice(2));
const PORT = args.port ?? DEFAULT_PORT;
const HOST = args.host || '127.0.0.1';
let schemaSource = args.schema || process.env.MANAGED_SETTINGS_SCHEMA || DEFAULT_SCHEMA_SOURCE;
const UPSTREAM = stripTrailingSlash(args.upstream || process.env.MOCK_POLICY_UPSTREAM || DEFAULT_UPSTREAM);
const STATE_FILE = path.resolve(args.stateFile || process.env.MOCK_POLICY_STATE_FILE || DEFAULT_STATE_FILE);

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
	mode: EndpointResponseMode;
	/** When false the endpoint is proxied upstream instead of mocked. */
	active: boolean;
}

const state = new Map<string, EndpointState>();
let hasPersistedState = false;
initializeEndpointState();

interface EndpointUpdate {
	endpoint: string;
	preset?: string;
	status?: number;
	body?: unknown;
	mode?: EndpointResponseMode;
	active?: boolean;
}

interface LogEntry {
	at: number;
	method: string;
	path: string;
	outcome: 'mocked' | 'passthrough' | 'upstream-error';
	status: number;
}

const CONTROL_ROUTES = [
	{ method: 'GET', path: '/api', purpose: 'Discover request shapes, response contracts, routes, and side effects.', returns: 'This discovery document.', sideEffects: 'none' },
	{ method: 'GET', path: '/api/state', purpose: 'Read endpoint definitions, presets, and current state.', returns: 'Server state with endpoint definitions and configuration.', sideEffects: 'none' },
	{ method: 'POST', path: '/api/state', purpose: 'Apply and persist one update or an atomic endpoints array.', returns: 'Updated server state.', sideEffects: 'server-state,filesystem' },
	{ method: 'POST', path: '/api/reset', purpose: 'Restore and persist default endpoint state.', returns: 'Reset server state.', sideEffects: 'server-state,filesystem' },
	{ method: 'GET', path: '/api/schema', purpose: 'Read the managed-settings schema.', returns: 'Schema source, resolved location, load status, and schema or error.', sideEffects: 'none' },
	{ method: 'POST', path: '/api/schema', purpose: 'Change and reload the managed-settings schema source for this server process. Only accepted through a loopback URL.', returns: 'Schema source, resolved location, load status, and schema or error.', sideEffects: 'server-state' },
	{ method: 'GET', path: '/api/file-deployment', purpose: 'Generate install and removal commands for the current Managed Settings body.', returns: 'Source body and per-platform paths, install commands, and removal commands.', sideEffects: 'none' },
	{ method: 'GET', path: '/api/log', purpose: 'Read the request log.', returns: 'Object containing the newest-first entries array.', sideEffects: 'none' },
	{ method: 'DELETE', path: '/api/log', purpose: 'Clear the request log.', returns: 'Object containing an empty entries array.', sideEffects: 'server-state' },
	{ method: 'DELETE', path: '/api/cache', purpose: 'Clear the managed-settings disk cache on the server machine.', returns: 'Cleared directories with file counts and missing directories.', sideEffects: 'filesystem' }
] as const;

/** Rolling log of what this server has served, newest first. Shown in the GUI. */
let requestLog: LogEntry[] = [];
const REQUEST_LOG_LIMIT = 200;

const server = http.createServer((req, res) => {
	const url = new URL(req.url || '/', `http://${req.headers.host}`);
	const pathname = url.pathname;

	try {
		// Control API and GUI assets are same-origin only — no CORS headers — so
		// an unrelated website cannot drive filesystem control routes.
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

		// A credential-free browser probe to the upstream URL is redirected here
		// by a correctly configured system proxy. Keep it out of the request log
		// so setup checks are not mistaken for real client traffic.
		const endpoint = endpoints.find(endpoint => pathname === endpoint.path);
		if (endpoint && url.searchParams.has(SETUP_PROBE_PARAM)) {
			setMockResponseHeaders(res);
			if (req.method === 'OPTIONS' || req.method === 'GET') {
				res.writeHead(204);
				res.end();
				return;
			}
		}

		// Mocked Copilot endpoints. Only these get permissive CORS, so the web
		// build (browser) of Code OSS can call them cross-origin.
		if (endpoint && state.get(endpoint.id)?.active) {
			const entry = state.get(endpoint.id)!;
			setMockResponseHeaders(res);
			if (req.method === 'OPTIONS') {
				res.writeHead(204);
				res.end();
				return;
			}
			if (req.method === 'GET') {
				return sendMockedResponse(req, res, pathname, entry);
			}
		}

		// Everything else — including endpoints left in passthrough — goes to the
		// real API so a blanket proxy rule stays safe.
		return passthrough(req, res, url);
	} catch (e) {
		sendJson(res, 500, { error: errorMessage(e) });
	}
});

function setMockResponseHeaders(res: ServerResponse): void {
	res.setHeader(MOCK_SERVER_HEADER, 'true');
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Editor-Version, Copilot-Runtime-Version');
	res.setHeader('Access-Control-Expose-Headers', MOCK_SERVER_HEADER);
}

/** Same-origin control API used by the GUI. */
function handleControlApi(req: IncomingMessage, res: ServerResponse, pathname: string): void {
	if (pathname === '/api/state' && req.method === 'GET') {
		return sendJson(res, 200, getState());
	}

	if ((pathname === '/api' || pathname === '/api/') && req.method === 'GET') {
		return sendJson(res, 200, {
			name: 'Mock Policy Server Control API',
			version: 1,
			discovery: '/api',
			errorResponse: {
				error: 'Human-readable error message.',
				discovery: 'Routing and method errors also include discovery: "/api".'
			},
			persistence: {
				stateFile: STATE_FILE,
				description: 'Valid endpoint bodies and response configuration are written atomically after every update and restored at server startup. The GUI also keeps response-body drafts in browser storage.'
			},
			recommendedWorkflow: [
				'GET /api/state and choose endpoint and preset ids from the response.',
				'POST /api/state with one update or an endpoints array.',
				'Trigger the client policy request.',
				'GET /api/log to confirm how the request was handled.'
			],
			stateUpdate: {
				fields: {
					endpoint: { type: 'string', required: true, source: 'Use an endpoint id returned by GET /api/state.' },
					preset: { type: 'string', source: 'Use a preset id for the selected endpoint from GET /api/state.' },
					status: { type: 'integer', minimum: 200, maximum: 599 },
					body: { type: 'any JSON value' },
					mode: { type: 'string', enum: ['json', 'malformed-json', 'disconnect', 'timeout'] },
					active: { type: 'boolean', description: 'true mocks the endpoint; false proxies it upstream.' }
				},
				semantics: [
					'A preset sets status and body and enables mocking.',
					'Explicit status, body, mode, and active values override preset values.',
					'Bulk updates are validated first and applied atomically.'
				],
				single: { endpoint: 'managedSettings', preset: 'empty', status: 200, body: {}, mode: 'json', active: true },
				bulk: { endpoints: [{ endpoint: 'managedSettings', active: true }, { endpoint: 'entitlements', active: false }] }
			},
			routes: CONTROL_ROUTES
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
			let result: ReturnType<typeof applyEndpointUpdates>;
			try {
				result = applyEndpointUpdates(payload);
			} catch (e) {
				return sendJson(res, 500, { error: `Failed to persist server state: ${errorMessage(e)}` });
			}
			if (!result.ok) {
				return sendJson(res, 400, { error: result.error });
			}
			return sendJson(res, 200, getState());
		});
	}

	if (pathname === '/api/reset' && req.method === 'POST') {
		try {
			resetEndpointState();
		} catch (e) {
			return sendJson(res, 500, { error: `Failed to persist reset state: ${errorMessage(e)}` });
		}
		return sendJson(res, 200, getState());
	}

	if (pathname === '/api/schema' && req.method === 'GET') {
		return void loadSchema()
			.then(result => sendJson(res, 200, result))
			.catch(e => sendJson(res, 500, { error: errorMessage(e) }));
	}

	if (pathname === '/api/schema' && req.method === 'POST') {
		if (!isLoopbackRequest(req)) {
			return sendJson(res, 403, { error: 'Changing the schema source is only allowed from a loopback URL.' });
		}
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
			if (!isRecord(payload)) {
				return sendJson(res, 400, { error: 'Request body must be a JSON object.' });
			}
			const unknownKeys = Object.keys(payload).filter(key => key !== 'source');
			if (unknownKeys.length) {
				return sendJson(res, 400, { error: `Unknown field${unknownKeys.length > 1 ? 's' : ''}: ${unknownKeys.join(', ')}.` });
			}
			if (typeof payload.source !== 'string' || !payload.source.trim()) {
				return sendJson(res, 400, { error: '"source" must be a non-empty string.' });
			}
			schemaSource = payload.source.trim();
			return void loadSchema()
				.then(result => sendJson(res, 200, result))
				.catch(e => sendJson(res, 500, { error: errorMessage(e) }));
		});
	}

	if (pathname === '/api/file-deployment' && req.method === 'GET') {
		return sendJson(res, 200, getFileDeployment());
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

	const canonicalPath = pathname === '/api/' ? '/api' : pathname;
	const allowedMethods = CONTROL_ROUTES
		.filter(route => route.path === canonicalPath)
		.map(route => route.method);
	if (allowedMethods.length > 0) {
		res.setHeader('Allow', allowedMethods.join(', '));
		return sendJson(res, 405, {
			error: `${req.method ?? 'Unknown method'} is not allowed for ${canonicalPath}. Allowed methods: ${allowedMethods.join(', ')}.`,
			discovery: '/api'
		});
	}
	return sendJson(res, 404, { error: `Unknown control API route "${pathname}".`, discovery: '/api' });
}

function applyEndpointUpdates(payload: unknown, persist = true): { ok: true } | { ok: false; error: string } {
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

		const unknownKeys = Object.keys(rawUpdate).filter(key => !['endpoint', 'preset', 'status', 'body', 'mode', 'active'].includes(key));
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
		if (!['preset', 'status', 'body', 'mode', 'active'].some(key => Object.hasOwn(rawUpdate, key))) {
			return { ok: false, error: `${prefix} must include preset, status, body, mode, or active.` };
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
		if (Object.hasOwn(rawUpdate, 'mode') && !isEndpointResponseMode(rawUpdate.mode)) {
			return { ok: false, error: `${prefix}.mode must be one of: json, malformed-json, disconnect, timeout.` };
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
		if (isEndpointResponseMode(rawUpdate.mode)) {
			update.mode = rawUpdate.mode;
		}
		if (typeof rawUpdate.active === 'boolean') {
			update.active = rawUpdate.active;
		}
		updates.push(update);
	}

	const nextState = new Map<string, EndpointState>();
	for (const [id, entry] of state) {
		nextState.set(id, { status: entry.status, body: clone(entry.body), mode: entry.mode, active: entry.active });
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
		if (update.mode !== undefined) {
			entry.mode = update.mode;
		}
		if (update.active !== undefined) {
			entry.active = update.active;
		}
	}

	if (persist) {
		persistEndpointState(nextState);
	}
	replaceEndpointState(nextState);
	return { ok: true };
}

function resetEndpointState(): void {
	const nextState = createDefaultEndpointState();
	persistEndpointState(nextState);
	replaceEndpointState(nextState);
}

function createDefaultEndpointState(): Map<string, EndpointState> {
	const result = new Map<string, EndpointState>();
	for (const endpoint of endpoints) {
		const preset = endpoint.presets[0];
		result.set(endpoint.id, {
			status: preset?.status ?? 200,
			body: preset ? clone(preset.body) : {},
			mode: 'json',
			active: endpoint.mockedByDefault === true
		});
	}
	return result;
}

function replaceEndpointState(nextState: Map<string, EndpointState>): void {
	state.clear();
	for (const [id, entry] of nextState) {
		state.set(id, entry);
	}
}

function initializeEndpointState(): void {
	replaceEndpointState(createDefaultEndpointState());
	if (!fs.existsSync(STATE_FILE)) {
		return;
	}
	try {
		const payload: unknown = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
		const result = applyEndpointUpdates(payload, false);
		if (!result.ok) {
			console.error(`  Ignoring invalid persisted state at ${STATE_FILE}: ${result.error}`);
		} else {
			hasPersistedState = true;
		}
	} catch (e) {
		console.error(`  Ignoring unreadable persisted state at ${STATE_FILE}: ${errorMessage(e)}`);
	}
}

function persistEndpointState(endpointState: Map<string, EndpointState>): void {
	const payload = {
		endpoints: endpoints.map(endpoint => {
			const entry = endpointState.get(endpoint.id)!;
			return {
				endpoint: endpoint.id,
				status: entry.status,
				body: entry.body,
				mode: entry.mode,
				active: entry.active
			};
		})
	};
	const temporaryFile = `${STATE_FILE}.${process.pid}.tmp`;
	fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
	try {
		fs.writeFileSync(temporaryFile, `${JSON.stringify(payload, null, '\t')}\n`, { encoding: 'utf8', mode: 0o600 });
		fs.renameSync(temporaryFile, STATE_FILE);
		hasPersistedState = true;
	} finally {
		fs.rmSync(temporaryFile, { force: true });
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

function isLoopbackRequest(req: IncomingMessage): boolean {
	const remoteAddress = req.socket.remoteAddress;
	const host = req.headers.host;
	if (!remoteAddress || !host || Array.isArray(host)) {
		return false;
	}
	try {
		return isLoopbackAddress(remoteAddress) && isLoopbackAddress(new URL(`http://${host}`).hostname);
	} catch {
		return false;
	}
}

function isLoopbackAddress(address: string): boolean {
	const normalized = address.replace(/^\[|\]$/g, '').replace(/^::ffff:/, '');
	return normalized === '::1' || normalized === 'localhost' || /^127(?:\.\d{1,3}){3}$/.test(normalized);
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
	console.log(`  Schema    ${schemaSource}`);
	console.log(`  State     ${STATE_FILE}`);
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
	console.log(`    --port <number>   Port to bind (default ${DEFAULT_PORT})`);
	console.log('    --upstream <url>  Real API that un-mocked requests are proxied to');
	console.log(`                      (default ${DEFAULT_UPSTREAM}, env MOCK_POLICY_UPSTREAM)`);
	console.log('    --schema <src>    Managed-settings schema path, file: URI, or URL');
	console.log(`                      (default ${DEFAULT_SCHEMA_SOURCE}, env MANAGED_SETTINGS_SCHEMA)`);
	console.log('    --state-file <path> Persisted endpoint state file');
	console.log(`                        (default ${DEFAULT_STATE_FILE}, env MOCK_POLICY_STATE_FILE)`);
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
 * Resolve and load the managed-settings JSON schema from the current source.
 * Accepts a web URL (`http(s)://`), a `file://` URI, or a filesystem path
 * (relative paths are resolved against the app's cwd).
 */
async function loadSchema(): Promise<{ source: string; resolved: string; ok: boolean; schema?: unknown; error?: string }> {
	const source = schemaSource;
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
			mode: state.get(e.id)!.mode,
			active: state.get(e.id)!.active
		})),
		baseUrl: `http://${HOST}:${PORT}`,
		upstream: UPSTREAM,
		stateFile: STATE_FILE,
		hasPersistedState,
		cacheDirs: managedSettingsCacheDirs()
	};
}

function getFileDeployment() {
	const body = JSON.stringify(state.get('managedSettings')?.body ?? {}, null, '\t');
	const macOsPath = '/Library/Application Support/GitHubCopilot/managed-settings.json';
	const windowsPath = '%ProgramFiles%\\GitHubCopilot\\managed-settings.json';
	const linuxPath = '/etc/github-copilot/managed-settings.json';
	return {
		sourceEndpoint: 'managedSettings',
		body: state.get('managedSettings')?.body ?? {},
		note: 'Run one installCommand on the client machine, then restart the client. Delete the file or run removeCommand to unset file-based Managed Settings.',
		platforms: {
			macos: {
				path: macOsPath,
				installCommand: `sudo mkdir -p "/Library/Application Support/GitHubCopilot" && sudo tee "${macOsPath}" >/dev/null <<'JSON'\n${body}\nJSON`,
				removeCommand: `sudo rm -f -- "${macOsPath}"`
			},
			windows: {
				path: windowsPath,
				installCommand: [
					'$dir = Join-Path $env:ProgramFiles \'GitHubCopilot\'',
					'New-Item -ItemType Directory -Force -Path $dir | Out-Null',
					'$json = @\'',
					body,
					'\'@',
					'[System.IO.File]::WriteAllText((Join-Path $dir \'managed-settings.json\'), $json)'
				].join('\n'),
				removeCommand: '$path = Join-Path $env:ProgramFiles \'GitHubCopilot\\managed-settings.json\'; Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue'
			},
			linux: {
				path: linuxPath,
				installCommand: `sudo mkdir -p /etc/github-copilot && sudo tee ${linuxPath} >/dev/null <<'JSON'\n${body}\nJSON`,
				removeCommand: `sudo rm -f -- ${linuxPath}`
			}
		}
	};
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

function sendMockedResponse(req: IncomingMessage, res: ServerResponse, pathname: string, entry: EndpointState): void {
	switch (entry.mode) {
		case 'json':
			record(req, pathname, 'mocked', entry.status);
			sendJson(res, entry.status, entry.body);
			return;
		case 'malformed-json':
			record(req, pathname, 'mocked', entry.status);
			res.writeHead(entry.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
			res.end('{"unterminated":');
			return;
		case 'disconnect':
			record(req, pathname, 'mocked', 0);
			res.destroy();
			return;
		case 'timeout': {
			record(req, pathname, 'mocked', 0);
			const timer = setTimeout(() => res.destroy(), 10_000);
			timer.unref();
			res.on('close', () => clearTimeout(timer));
			return;
		}
	}
}

function isEndpointResponseMode(value: unknown): value is EndpointResponseMode {
	return value === 'json' || value === 'malformed-json' || value === 'disconnect' || value === 'timeout';
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
	port?: number;
	schema?: string;
	upstream?: string;
	stateFile?: string;
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
		if (key !== 'host' && key !== 'port' && key !== 'schema' && key !== 'upstream' && key !== 'state-file') {
			failArgument(`Unknown option "--${key}".`);
		}

		const next = argv[i + 1];
		const value = inline ?? (next && !next.startsWith('--') ? next : undefined);
		if (!value) {
			failArgument(`Option "--${key}" requires a value.`);
		}
		if (key === 'port') {
			const port = Number(value);
			if (!Number.isInteger(port) || port < 1 || port > 65535) {
				failArgument('--port requires an integer from 1 to 65535.');
			}
			out.port = port;
		} else if (key === 'state-file') {
			out.stateFile = value;
		} else {
			out[key] = value;
		}
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
