/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Integration tests for the agent host's MCP plugin pipeline using real
 * `@modelcontextprotocol/sdk` servers and the real Copilot SDK.
 *
 * Each test:
 *  1. Builds an in-memory Open Plugin filesystem containing a `.mcp.json`
 *     plus any server source the upstream needs.
 *  2. Starts a real agent host server (no mock agent).
 *  3. Hooks `resourceList` / `resourceRead` reverse-RPC handlers on the
 *     test client so the host's plugin manager can copy the plugin via
 *     `vscode-agent-client://` URIs without anything ever touching disk.
 *  4. Creates a `copilotcli` session whose `activeClient.customizations`
 *     references the in-memory plugin. The agent eagerly snapshots and
 *     publishes the MCP server immediately — no warmup turn required.
 *  5. Waits for the MCP server to reach `Ready` (handling
 *     `AuthRequired` for the HTTP test).
 *  6. Dispatches a real LLM turn that asks the model to invoke
 *     `say_hello`, auto-approves any tool-confirmation prompts, and
 *     asserts the resulting tool output text — proving the upstream
 *     MCP server was actually exercised end-to-end through the SDK.
 *
 * These tests are **disabled by default**. Enable them with
 * `AGENT_HOST_REAL_SDK=1` (matching `toolApprovalRealSdk.integrationTest.ts`).
 */

import assert from 'assert';
import { execSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import type { IncomingMessage, Server as HttpServer, ServerResponse } from 'http';
import type { AddressInfo } from 'net';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { encodeBase64, VSBuffer } from '../../../../../base/common/buffer.js';
import { dirname, join, resolve as resolvePath } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { ContentEncoding, SubscribeResult, type DirectoryEntry, type McpMethodCallParams, type McpMethodCallResult, type ResourceListParams, type ResourceListResult, type ResourceReadParams, type ResourceReadResult } from '../../../common/state/protocol/commands.js';
import type { SessionToolCallCompleteAction, SessionToolCallReadyAction, SessionToolCallStartAction } from '../../../common/state/protocol/actions.js';
import { McpServerStatusKind, ToolResultContentType, type AhpMcpUiHostCapabilities, type McpServerStatus, type SessionState, type ToolCallResult, type ToolResultContent, type ToolResultTextContent } from '../../../common/state/protocol/state.js';
import { PROTOCOL_VERSION } from '../../../common/state/protocol/version/registry.js';
import { ProtocolError } from '../../../common/state/sessionProtocol.js';
import {
	getActionEnvelope,
	isActionNotification,
	IServerHandle,
	startRealServer,
	TestProtocolClient,
} from './testHelpers.js';

/** Set `AGENT_HOST_REAL_SDK=1` to run these tests. */
const REAL_SDK_ENABLED = process.env['AGENT_HOST_REAL_SDK'] === '1';

/** AHP `NotFound` (-32008) — surfaced for missing files/directories. */
const RPC_RESOURCE_NOT_FOUND = -32008;

/**
 * Resolve the GitHub token used to authenticate the Copilot SDK. Falls
 * back to `gh auth token` when `GITHUB_TOKEN` is not set, mirroring
 * `toolApprovalRealSdk.integrationTest.ts`.
 */
function resolveGitHubToken(): string {
	const envToken = process.env['GITHUB_TOKEN'];
	if (envToken) {
		return envToken;
	}
	try {
		return execSync('gh auth token', { encoding: 'utf-8' }).trim();
	} catch {
		throw new Error('No GITHUB_TOKEN set and `gh auth token` failed. Run `gh auth login` first.');
	}
}

// ---------------------------------------------------------------------------
// In-memory plugin filesystem
// ---------------------------------------------------------------------------

/**
 * A tiny in-memory plugin filesystem keyed by relative paths under a single
 * root URI. Serves the two reverse-RPC methods the agent host issues during
 * plugin sync (`resourceList` / `resourceRead`).
 *
 * Also exposes every ancestor of {@link rootUri} as a virtual directory
 * containing only the next-deeper segment, so that `stat`-style probes the
 * agent host fires (which list the parent to identify a child's type)
 * succeed all the way up to the URI root.
 */
class InMemoryPluginFilesystem {

	/** Map from absolute URI string → file contents. */
	private readonly _files = new Map<string, string | Uint8Array>();
	/**
	 * Map from absolute URI string → set of immediate child names (with
	 * their types). Pre-populated for the root + every ancestor of the
	 * root + every directory implied by a file path.
	 */
	private readonly _dirs = new Map<string, Map<string, 'file' | 'directory'>>();

	constructor(public readonly rootUri: URI, files: Record<string, string | Uint8Array>) {
		this._registerAncestors(rootUri);

		for (const [relPath, content] of Object.entries(files)) {
			const absolute = this._resolveRelative(relPath);
			this._files.set(absolute.toString(), content);
			// Parent of the file is a directory containing it; bubble up
			// to the root, registering each intermediate directory.
			let cursor = absolute;
			let childName = this._basename(cursor.path);
			let childType: 'file' | 'directory' = 'file';
			while (true) {
				const parent = this._parent(cursor);
				this._addEntry(parent, childName, childType);
				if (parent.toString() === this.rootUri.toString()) {
					break;
				}
				cursor = parent;
				childName = this._basename(cursor.path);
				childType = 'directory';
			}
		}
	}

	private _registerAncestors(uri: URI): void {
		// Ensure rootUri itself is a (possibly empty) directory.
		if (!this._dirs.has(uri.toString())) {
			this._dirs.set(uri.toString(), new Map());
		}
		let cursor = uri;
		while (cursor.path !== '/' && cursor.path !== '') {
			const parent = this._parent(cursor);
			const name = this._basename(cursor.path);
			this._addEntry(parent, name, 'directory');
			cursor = parent;
		}
	}

	private _parent(uri: URI): URI {
		const trimmed = uri.path.replace(/\/+$/, '');
		const idx = trimmed.lastIndexOf('/');
		const parentPath = idx <= 0 ? '/' : trimmed.substring(0, idx);
		return uri.with({ path: parentPath });
	}

	private _basename(path: string): string {
		const trimmed = path.replace(/\/+$/, '');
		const idx = trimmed.lastIndexOf('/');
		return idx === -1 ? trimmed : trimmed.substring(idx + 1);
	}

	private _addEntry(dir: URI, name: string, type: 'file' | 'directory'): void {
		const key = dir.toString();
		let entries = this._dirs.get(key);
		if (!entries) {
			entries = new Map();
			this._dirs.set(key, entries);
		}
		const existing = entries.get(name);
		// Files take precedence over auto-promoted directory entries; once a
		// child is registered as a file, never demote it back to a directory.
		if (existing === 'file' && type === 'directory') {
			return;
		}
		entries.set(name, type);
	}

	private _resolveRelative(relPath: string): URI {
		const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
		const root = this.rootUri.toString().replace(/\/$/, '');
		return URI.parse(`${root}/${normalized}`);
	}

	list(uri: string): ResourceListResult {
		if (this._files.has(uri)) {
			throw new ProtocolError(RPC_RESOURCE_NOT_FOUND, `Not a directory: ${uri}`);
		}
		const entries = this._dirs.get(uri);
		if (!entries) {
			throw new ProtocolError(RPC_RESOURCE_NOT_FOUND, `Directory not found: ${uri}`);
		}
		const list: DirectoryEntry[] = [];
		for (const [name, type] of entries) {
			list.push({ name, type });
		}
		list.sort((a, b) => a.name.localeCompare(b.name));
		return { entries: list };
	}

	read(uri: string): ResourceReadResult {
		const content = this._files.get(uri);
		if (content === undefined) {
			throw new ProtocolError(RPC_RESOURCE_NOT_FOUND, `File not found: ${uri}`);
		}
		if (typeof content === 'string') {
			return { data: content, encoding: ContentEncoding.Utf8, contentType: 'text/plain' };
		}
		return {
			data: encodeBase64(VSBuffer.wrap(content)),
			encoding: ContentEncoding.Base64,
			contentType: 'application/octet-stream',
		};
	}
}

// ---------------------------------------------------------------------------
// Hello-world MCP server source
// ---------------------------------------------------------------------------

/**
 * Source of a minimal stdio MCP server built on `@modelcontextprotocol/sdk`.
 * Registers a single `say_hello` tool that returns `"Hello, <name>!"`.
 *
 * Resolved against the workspace's `node_modules` via `NODE_PATH` so the
 * spawned child can `require()` the SDK from any plugin directory.
 */
/** URI the upstream MCP server advertises for the `say_hello` tool's UI view. */
const HELLO_MCP_UI_RESOURCE_URI = 'ui://hello-mcp/main';
/** HTML body the MCP server serves at {@link HELLO_MCP_UI_RESOURCE_URI}. */
const HELLO_MCP_UI_HTML = '<!doctype html><meta charset="utf-8"><title>hello-mcp</title><p>Hello, MCP Apps!</p>';

const HELLO_MCP_SERVER_JS = `
'use strict';
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
	CallToolRequestSchema,
	ListResourcesRequestSchema,
	ListToolsRequestSchema,
	ReadResourceRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

const UI_RESOURCE_URI = ${JSON.stringify(HELLO_MCP_UI_RESOURCE_URI)};
const UI_HTML = ${JSON.stringify(HELLO_MCP_UI_HTML)};

const server = new Server(
	{ name: 'hello-mcp', version: '1.0.0' },
	{
		capabilities: {
			// Explicitly advertise the MCP-Apps host capabilities the AHP
			// proxy should mirror back through \`_meta.uiHostCapabilities\`
			// on every tool call: tool / resource discovery with change
			// notifications, plus log forwarding.
			tools: { listChanged: true },
			resources: { listChanged: true },
			logging: {},
		},
	},
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
	tools: [{
		name: 'say_hello',
		description: 'Returns a friendly greeting for the given name.',
		inputSchema: {
			type: 'object',
			properties: { name: { type: 'string', description: 'Name to greet.' } },
			required: ['name'],
		},
		_meta: {
			// MCP Apps spec — tools advertise a UI resource that the host
			// renders alongside the tool result.
			ui: {
				resourceUri: UI_RESOURCE_URI,
				visibility: ['model', 'app'],
			},
		},
	}],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
	if (request.params.name !== 'say_hello') {
		throw new Error('Unknown tool: ' + request.params.name);
	}
	const target = (request.params.arguments && request.params.arguments.name) || 'world';
	return { content: [{ type: 'text', text: 'Hello, ' + target + '!' }] };
});

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
	resources: [{
		uri: UI_RESOURCE_URI,
		name: 'hello-app',
		mimeType: 'text/html;profile=mcp-app',
	}],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
	if (request.params.uri !== UI_RESOURCE_URI) {
		throw new Error('Unknown resource: ' + request.params.uri);
	}
	return {
		contents: [{
			uri: UI_RESOURCE_URI,
			mimeType: 'text/html;profile=mcp-app',
			text: UI_HTML,
		}],
	};
});

(async () => {
	const transport = new StdioServerTransport();
	await server.connect(transport);
})().catch(err => {
	console.error('hello-mcp server failed:', err);
	process.exit(1);
});
`;

/**
 * Resolve the absolute path to the workspace's `node_modules` directory so
 * the spawned MCP server can locate `@modelcontextprotocol/sdk` (and its
 * peer `zod`) regardless of where the plugin gets synced on disk.
 */
function getWorkspaceNodeModules(): string {
	const here = fileURLToPath(import.meta.url);
	// out/vs/platform/agentHost/test/node/protocol/<file>.js — 7 segments
	// from the file directory up to the vscode repository root.
	const repoRoot = resolvePath(dirname(here), '..', '..', '..', '..', '..', '..', '..');
	return join(repoRoot, 'node_modules');
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Wire reverse-RPC handlers for `resourceList` / `resourceRead` so the
 * agent host's `AHPFileSystemProvider` can sync the in-memory plugin via
 * `vscode-agent-client://` URIs. Must be installed BEFORE `createSession`
 * is called because the agent's plugin sync runs inline with that call.
 */
function installPluginFsHandlers(client: TestProtocolClient, plugin: InMemoryPluginFilesystem): void {
	client.setRequestHandler('resourceList', async params => {
		return plugin.list((params as ResourceListParams).uri.toString());
	});
	client.setRequestHandler('resourceRead', async params => {
		return plugin.read((params as ResourceReadParams).uri);
	});
}

/**
 * Initialize the AHP client, authenticate against the Copilot API, create
 * a `copilotcli` session, subscribe to it, and then publish the
 * customization via `session/activeClientChanged`. We deliberately split
 * `createSession` and `activeClientChanged` rather than passing
 * `activeClient` on `createSession`:
 *
 *  - Historically, publishing MCP servers during `createSession` raced
 *    the state-manager session entry. The MCP host now keeps those
 *    summaries as its own state while suppressing pre-session action
 *    emission; this split flow still exercises the live
 *    `activeClientChanged` republish path.
 *
 *  - Dispatching `activeClientChanged` after `subscribe` flows through
 *    `agentSideEffects` → `setClientCustomizations` → plugin sync →
 *    `PluginController.onDidChange` → `ActiveClient.republish()` →
 *    `setSessionServers(...)`. By that point the session entry exists
 *    and the client is subscribed, so every MCP lifecycle action is
 *    routed to us.
 */
async function createSessionWithPlugin(
	client: TestProtocolClient,
	clientId: string,
	pluginUri: string,
	sessionScheme: string,
	sessionLabel: string,
): Promise<string> {
	await client.call('initialize', { protocolVersions: [PROTOCOL_VERSION], clientId }, 30_000);
	await client.call('authenticate', { resource: 'https://api.github.com', token: resolveGitHubToken() }, 30_000);

	const sessionUri = URI.from({ scheme: sessionScheme, path: `/${sessionLabel}-${Date.now()}` }).toString();
	await client.call('createSession', {
		session: sessionUri,
		provider: 'copilotcli',
		workingDirectory: URI.file(tmpdir()).toString(),
	}, 30_000);
	await client.call<SubscribeResult>('subscribe', { resource: sessionUri }, 30_000);

	client.notify('dispatchAction', {
		clientSeq: 1,
		action: {
			type: 'session/activeClientChanged',
			session: sessionUri,
			activeClient: {
				clientId,
				displayName: 'MCP Test Client',
				tools: [],
				customizations: [{
					uri: pluginUri,
					displayName: 'MCP Test Plugin',
					nonce: 'v1',
				}],
			},
		},
	});

	return sessionUri;
}

/**
 * Wait for an `session/mcpServerStatusChanged` action whose status
 * matches `predicate`, returning the matched `McpServerStatus` payload
 * and the affected server's `mcp:/...` URI.
 */
async function waitForMcpServerStatus(
	client: TestProtocolClient,
	predicate: (status: McpServerStatus) => boolean,
	timeoutMs: number,
): Promise<{ readonly status: McpServerStatus; readonly mcpServer: string }> {
	const notification = await client.waitForNotification(n => {
		if (!isActionNotification(n, 'session/mcpServerStatusChanged')) {
			return false;
		}
		const action = getActionEnvelope(n).action as { status: McpServerStatus };
		return predicate(action.status);
	}, timeoutMs);
	const action = getActionEnvelope(notification).action as { status: McpServerStatus; mcpServer: string };
	return { status: action.status, mcpServer: action.mcpServer };
}

/**
 * Re-subscribe to `sessionUri` and return the named MCP server's
 * latest summary (or `undefined` if no such server is registered).
 */
async function readMcpServerSummary(
	client: TestProtocolClient,
	sessionUri: string,
	label: string,
) {
	const subscribe = await client.call<SubscribeResult>('subscribe', { resource: sessionUri }, 30_000);
	const state = subscribe.snapshot.state as SessionState;
	return state.mcpServers?.find(s => s.label === label);
}

/**
 * Aggregate the `text` payloads from a `ToolCallResult.content` array
 * into a single string. Returns the empty string when the result has no
 * text content (e.g. binary-only output, which `say_hello` never produces).
 */
function toolResultText(result: ToolCallResult): string {
	const content: readonly ToolResultContent[] = result.content ?? [];
	return content
		.filter((c): c is ToolResultTextContent => c.type === ToolResultContentType.Text)
		.map(c => c.text)
		.join('');
}

interface IObservedToolCall {
	readonly toolName: string;
	readonly result: ToolCallResult;
	/** The `session/toolCallStart` action that opened the matched tool call. */
	readonly start: SessionToolCallStartAction;
}

/**
 * Dispatch a real chat turn and drive it until either the model invokes
 * a tool matching `predicate` (returned), or the turn finishes/errors
 * without matching (throws).
 *
 * Auto-approves every `session/toolCallReady` that arrives without a
 * `confirmed` flag — Copilot's MCP integration surfaces tool calls as
 * permission requests, so we approve them on the AHP client's behalf.
 */
async function driveTurnUntilTool(
	client: TestProtocolClient,
	sessionUri: string,
	turnId: string,
	prompt: string,
	startSeq: number,
	predicate: (toolName: string) => boolean,
	timeoutMs: number,
): Promise<IObservedToolCall> {
	client.clearReceived();
	client.notify('dispatchAction', {
		clientSeq: startSeq,
		action: {
			type: 'session/turnStarted',
			session: sessionUri,
			turnId,
			userMessage: { text: prompt },
		},
	});

	let nextSeq = startSeq + 1;
	const seen = new Set<object>();
	const startsById = new Map<string, SessionToolCallStartAction>();

	const deadline = Date.now() + timeoutMs;
	while (true) {
		const remaining = deadline - Date.now();
		if (remaining <= 0) {
			throw new Error(`driveTurnUntilTool: timed out after ${timeoutMs}ms waiting for a tool call match in turn '${turnId}'`);
		}
		const notification = await client.waitForNotification(n => {
			if (seen.has(n as object)) {
				return false;
			}
			return isActionNotification(n, 'session/toolCallStart')
				|| isActionNotification(n, 'session/toolCallReady')
				|| isActionNotification(n, 'session/toolCallComplete')
				|| isActionNotification(n, 'session/turnComplete')
				|| isActionNotification(n, 'session/turnCancelled')
				|| isActionNotification(n, 'session/error');
		}, remaining);
		seen.add(notification as object);

		if (isActionNotification(notification, 'session/error')) {
			throw new Error(`Session error while driving turn '${turnId}'`);
		}

		if (isActionNotification(notification, 'session/turnComplete') || isActionNotification(notification, 'session/turnCancelled')) {
			throw new Error(`Turn '${turnId}' ended before the model invoked a matching tool. Recorded tool calls: ${[...startsById.values()].map(a => a.toolName).join(', ') || '<none>'}`);
		}

		if (isActionNotification(notification, 'session/toolCallStart')) {
			const action = getActionEnvelope(notification).action as SessionToolCallStartAction;
			startsById.set(action.toolCallId, action);
			continue;
		}

		if (isActionNotification(notification, 'session/toolCallReady')) {
			const action = getActionEnvelope(notification).action as SessionToolCallReadyAction;
			if (!action.confirmed) {
				client.notify('dispatchAction', {
					clientSeq: nextSeq++,
					action: {
						type: 'session/toolCallConfirmed',
						session: sessionUri,
						turnId,
						toolCallId: action.toolCallId,
						approved: true,
					},
				});
			}
			continue;
		}

		// toolCallComplete
		const action = getActionEnvelope(notification).action as SessionToolCallCompleteAction;
		const start = startsById.get(action.toolCallId);
		const toolName = start?.toolName ?? '<unknown>';
		if (start && predicate(toolName)) {
			return { toolName, result: action.result, start };
		}
	}
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

(REAL_SDK_ENABLED ? suite : suite.skip)('Protocol WebSocket — Real MCP SDK', function () {

	let server: IServerHandle;
	let client: TestProtocolClient;
	let userDataDir: string;
	const createdSessions: string[] = [];
	const tempDirs: string[] = [];

	suiteSetup(async function () {
		this.timeout(60_000);
		// Use a dedicated user-data dir so plugin syncs land in a temp location
		// that is wiped between runs.
		userDataDir = mkdtempSync(join(tmpdir(), 'ahp-mcp-real-'));
		tempDirs.push(userDataDir);
		server = await startRealServer({ userDataDir });
	});

	suiteTeardown(function () {
		server?.process.kill();
		if (process.env['AGENT_HOST_REAL_SDK_KEEP_TEMP'] === '1') {
			console.log('[Real MCP SDK] kept temp dirs:', tempDirs);
			return;
		}
		for (const dir of tempDirs) {
			try {
				rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
			} catch {
				// best-effort cleanup — Windows may still hold transient file handles
				// from the just-killed server.
			}
		}
	});

	setup(async function () {
		this.timeout(30_000);
		client = new TestProtocolClient(server.port);
		await client.connect();
	});

	teardown(async function () {
		this.timeout(30_000);
		for (const session of createdSessions) {
			try {
				await client.call('disposeSession', { session }, 10_000);
			} catch {
				// best-effort
			}
		}
		createdSessions.length = 0;
		client.close();
	});

	test('stdio MCP plugin: model calls say_hello end-to-end via Copilot SDK', async function () {
		this.timeout(120_000);

		const clientId = 'real-mcp-stdio-client';
		const pluginUri = 'file:///inmem/hello-mcp';

		// `${PLUGIN_ROOT}` is expanded by the agent host at parse time to the
		// synced plugin's local fsPath, so the spawned child reads `server.js`
		// from the on-disk copy.
		const mcpJson = {
			mcpServers: {
				hello: {
					command: 'node',
					args: ['${PLUGIN_ROOT}/server.js'],
					env: { NODE_PATH: getWorkspaceNodeModules() },
				},
			},
		};
		const plugin = new InMemoryPluginFilesystem(URI.parse(pluginUri), {
			'.plugin/plugin.json': JSON.stringify({ name: 'hello-mcp', version: '1.0.0' }),
			'.mcp.json': JSON.stringify(mcpJson),
			'server.js': HELLO_MCP_SERVER_JS,
		});

		// Reverse-RPC handlers MUST be installed before `activeClientChanged`
		// because the agent's plugin sync issues `resourceList`/`resourceRead`
		// callbacks while the client is being applied.
		installPluginFsHandlers(client, plugin);

		const sessionUri = await createSessionWithPlugin(client, clientId, pluginUri, 'copilotcli', 'mcp-real-stdio');
		createdSessions.push(sessionUri);

		// End-to-end single turn: dispatching `turnStarted` here triggers
		// `_materializeProvisional`, which calls `ActiveClient.snapshot()`
		// → publishes MCP servers → spawns the stdio child →
		// `_resolveMcpServersForSdk` blocks until Ready → SDK gets the
		// tool list including `say_hello`. The model is asked to call the
		// tool; the model's tool call traverses SDK → loopback proxy →
		// stdio child → say_hello → back through the proxy → SDK →
		// `toolCallComplete` on the wire. We auto-approve any
		// `toolCallReady` that needs confirmation along the way.
		const observed = await driveTurnUntilTool(
			client,
			sessionUri,
			'turn-mcp-stdio-real',
			'Please call the `say_hello` MCP tool with the argument `{"name": "integration"}`. Do not explain — just invoke the tool.',
			2,
			toolName => /say_hello/.test(toolName),
			90_000,
		);

		const text = toolResultText(observed.result);
		assert.match(
			text,
			/Hello, integration!/,
			`expected say_hello tool result to contain the greeting; got ${JSON.stringify(observed.result)}`,
		);

		const helloServer = await readMcpServerSummary(client, sessionUri, 'hello');
		assert.ok(helloServer, 'expected hello MCP server on the session');
		assert.strictEqual(helloServer!.status.kind, McpServerStatusKind.Ready);

		// MCP Apps: the proxy sniffed `tools/list` and the agent decorated
		// the `toolCallStart` action with `_meta.ui` (mirroring the MCP
		// `_meta."io.modelcontextprotocol/ui"` payload) plus the per-tool
		// `_meta.uiHostCapabilities` set the AHP host can satisfy.
		const startMeta = (observed.start._meta ?? {}) as {
			ui?: { resourceUri?: string; visibility?: readonly string[] };
			uiHostCapabilities?: AhpMcpUiHostCapabilities;
		};
		assert.deepStrictEqual(
			startMeta.ui,
			{ resourceUri: HELLO_MCP_UI_RESOURCE_URI, visibility: ['model', 'app'] },
			`expected toolCallStart._meta.ui to mirror the MCP server payload; got ${JSON.stringify(startMeta)}`,
		);
		assert.ok(
			startMeta.uiHostCapabilities?.serverTools?.listChanged,
			`expected toolCallStart._meta.uiHostCapabilities.serverTools.listChanged; got ${JSON.stringify(startMeta.uiHostCapabilities)}`,
		);
		assert.ok(
			startMeta.uiHostCapabilities?.serverResources?.listChanged,
			`expected toolCallStart._meta.uiHostCapabilities.serverResources.listChanged; got ${JSON.stringify(startMeta.uiHostCapabilities)}`,
		);
		assert.ok(
			startMeta.uiHostCapabilities?.logging !== undefined,
			`expected toolCallStart._meta.uiHostCapabilities.logging; got ${JSON.stringify(startMeta.uiHostCapabilities)}`,
		);

		// The AHP client can fetch the app's HTML body by invoking
		// `mcpMethodCall` with the standard MCP `resources/read` method —
		// no special envelope is needed beyond pointing at the server.
		const readResult = await client.call<McpMethodCallResult>('mcpMethodCall', {
			server: helloServer!.resource,
			method: 'resources/read',
			params: { uri: HELLO_MCP_UI_RESOURCE_URI },
		} satisfies McpMethodCallParams, 15_000);
		const contents = (readResult.result as { contents?: { uri: string; mimeType?: string; text?: string }[] } | undefined)?.contents;
		assert.ok(contents && contents.length === 1, `expected one resource content block; got ${JSON.stringify(readResult)}`);
		assert.strictEqual(contents[0].uri, HELLO_MCP_UI_RESOURCE_URI);
		assert.strictEqual(contents[0].mimeType, 'text/html;profile=mcp-app');
		assert.strictEqual(contents[0].text, HELLO_MCP_UI_HTML);
	});

	test('HTTP MCP plugin: AuthRequired → authenticate → model calls say_hello', async function () {
		this.timeout(120_000);

		const clientId = 'real-mcp-http-client';
		const pluginUri = 'file:///inmem/secure-mcp';
		const expectedToken = 'test-bearer-token-' + Date.now();
		const oauthResource = `local-secure-mcp-${Date.now()}`;

		const httpServer = await startSecureHttpMcpServer({ expectedToken, oauthResource });
		try {
			const mcpJson = {
				mcpServers: {
					'secure-hello': {
						type: 'http',
						url: httpServer.url,
					},
				},
			};
			const plugin = new InMemoryPluginFilesystem(URI.parse(pluginUri), {
				'.plugin/plugin.json': JSON.stringify({ name: 'secure-mcp', version: '1.0.0' }),
				'.mcp.json': JSON.stringify(mcpJson),
			});

			installPluginFsHandlers(client, plugin);

			const sessionUri = await createSessionWithPlugin(client, clientId, pluginUri, 'copilotcli', 'mcp-real-http');
			createdSessions.push(sessionUri);

			// Phase 1: dispatch a throwaway turn whose only purpose is to
			// trigger `_materializeProvisional`. Inside materialization,
			// `ActiveClient.snapshot()` publishes the MCP server, which
			// performs the HTTP probe, gets a 401, and surfaces
			// `AuthRequired` with metadata fetched from
			// `/.well-known/oauth-protected-resource`. The turn itself is
			// allowed to run (the SDK skips the auth-required server, so
			// the model has no MCP tools yet); we cancel it once we have
			// the auth challenge.
			client.notify('dispatchAction', {
				clientSeq: 2,
				action: {
					type: 'session/turnStarted',
					session: sessionUri,
					turnId: 'turn-mcp-http-warmup',
					userMessage: { text: 'Reply with the single word OK.' },
				},
			});

			const authReqEvent = await waitForMcpServerStatus(
				client,
				s => s.kind === McpServerStatusKind.AuthRequired,
				60_000,
			);
			const authStatus = authReqEvent.status;
			assert.strictEqual(authStatus.kind, McpServerStatusKind.AuthRequired);
			if (authStatus.kind !== McpServerStatusKind.AuthRequired) {
				throw new Error('unreachable');
			}
			assert.strictEqual(
				authStatus.resource.resource,
				oauthResource,
				`expected fetched resource_metadata to carry the synthetic resource id; got ${JSON.stringify(authStatus.resource)}`,
			);

			client.notify('dispatchAction', {
				clientSeq: 3,
				action: {
					type: 'session/turnCancelled',
					session: sessionUri,
					turnId: 'turn-mcp-http-warmup',
				},
			});

			// Phase 2: push a token. The host re-runs the upstream `start()`
			// with the bearer header and transitions the server to Ready.
			// `authenticate` resolves with `{}` on success and throws on
			// failure (per protocol — the empty result IS the success
			// signal), so reaching the next line means the host accepted
			// the token.
			await client.call<{}>('authenticate', {
				resource: authStatus.resource.resource,
				token: expectedToken,
				server: authReqEvent.mcpServer,
			}, 15_000);

			await waitForMcpServerStatus(client, s => s.kind === McpServerStatusKind.Ready, 30_000);

			const secureServer = await readMcpServerSummary(client, sessionUri, 'secure-hello');
			assert.ok(secureServer, 'expected an MCP server named secure-hello on the session');
			assert.strictEqual(secureServer!.status.kind, McpServerStatusKind.Ready);

			// Phase 3: ask the model to invoke `say_hello`. The SDK's
			// cached session was built when `secure-hello` was still
			// `AuthRequired`, so it doesn't yet know about `say_hello`.
			// `ActiveClient.isOutdated()` compares the snapshot's per-MCP
			// `mcpReadiness` map against the current Ready set, sees that
			// `secure-hello` flipped from false → true, and triggers a
			// full SDK-session rebuild on the next `sendMessage`. The new
			// `_resolveMcpServersForSdk` sees `Ready` and advertises the
			// tool to the model.
			const observed = await driveTurnUntilTool(
				client,
				sessionUri,
				'turn-mcp-http-real',
				'Please call the `say_hello` MCP tool with the argument `{"name": "authed"}`. Do not explain — just invoke the tool.',
				4,
				toolName => /say_hello/.test(toolName),
				90_000,
			);

			const text = toolResultText(observed.result);
			assert.match(
				text,
				/Hello, authed!/,
				`expected say_hello tool result to contain the greeting; got ${JSON.stringify(observed.result)}`,
			);

			// Sanity: the upstream HTTP server must have observed at least
			// one unauth'd probe (the discovery handshake) and at least one
			// authenticated request thereafter — proving the host service
			// propagated the bearer token through `setBearerToken` and the
			// SDK actually invoked the tool against the secured endpoint.
			assert.ok(
				httpServer.authedRequestCount > 0,
				'expected at least one authenticated HTTP request to the upstream',
			);
			assert.ok(
				httpServer.unauthedRequestCount >= 1,
				`expected at least one unauthenticated probe; got ${httpServer.unauthedRequestCount}`,
			);
		} finally {
			await httpServer.close();
		}
	});
});

// ---------------------------------------------------------------------------
// Tiny HTTP MCP server with bearer-token auth
// ---------------------------------------------------------------------------

interface ISecureHttpMcpServer {
	readonly url: string;
	readonly close: () => Promise<void>;
	readonly authedRequestCount: number;
	readonly unauthedRequestCount: number;
}

interface ISecureHttpMcpServerOptions {
	readonly expectedToken: string;
	/**
	 * Synthetic OAuth resource identifier returned in
	 * `/.well-known/oauth-protected-resource`. The test uses this to
	 * assert the host actually fetched the metadata document rather than
	 * synthesizing fallback metadata from the request URL.
	 */
	readonly oauthResource: string;
}

/**
 * Spin up a localhost HTTP server that mimics a remote MCP endpoint with
 * RFC 9728-style bearer auth. Without a token, the `/mcp` POST returns
 * 401 + a `WWW-Authenticate: Bearer resource_metadata="…"` header that
 * points at `/.well-known/oauth-protected-resource` on the same origin.
 * With the configured token it answers JSON-RPC `initialize`,
 * `tools/list`, and `tools/call`.
 *
 * Listening on `127.0.0.1:0` keeps the test isolated from any real
 * service and matches the loopback-only convention the agent host uses
 * for its own proxy listener.
 */
async function startSecureHttpMcpServer(options: ISecureHttpMcpServerOptions): Promise<ISecureHttpMcpServer> {
	const counters = { authed: 0, unauthed: 0 };
	const { createServer } = await import('http');

	const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
		const baseUrl = `http://${req.headers.host ?? '127.0.0.1'}`;
		const url = new URL(req.url ?? '/', baseUrl);

		if (req.method === 'GET' && url.pathname === '/.well-known/oauth-protected-resource') {
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({
				resource: options.oauthResource,
				authorization_servers: [`${baseUrl}/auth`],
				scopes_supported: ['mcp:read'],
			}));
			return;
		}

		if (req.method !== 'POST' || url.pathname !== '/mcp') {
			res.writeHead(404, { 'Content-Type': 'text/plain' });
			res.end('not found');
			return;
		}

		const auth = req.headers['authorization'];
		if (auth !== `Bearer ${options.expectedToken}`) {
			counters.unauthed++;
			res.writeHead(401, {
				'Content-Type': 'application/json',
				'WWW-Authenticate': `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`,
			});
			res.end(JSON.stringify({ error: 'unauthorized' }));
			return;
		}

		counters.authed++;
		const body = await readRequestBody(req);
		let parsed: { id?: number | string; method: string; params?: unknown };
		try {
			parsed = JSON.parse(body);
		} catch {
			res.writeHead(400, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'invalid json' }));
			return;
		}

		const reply = handleMcpMethod(parsed);
		if (reply === undefined) {
			// Notification — no response body, HTTP 204.
			res.writeHead(204);
			res.end();
			return;
		}
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ jsonrpc: '2.0', id: parsed.id, ...reply }));
	};

	const server: HttpServer = createServer((req, res) => {
		Promise.resolve(handler(req, res)).catch(err => {
			res.writeHead(500, { 'Content-Type': 'text/plain' });
			res.end(err instanceof Error ? err.message : String(err));
		});
	});

	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			server.removeListener('error', reject);
			resolve();
		});
	});

	const address = server.address() as AddressInfo;
	const url = `http://127.0.0.1:${address.port}/mcp`;

	return {
		url,
		close: () => new Promise<void>(resolve => server.close(() => resolve())),
		get authedRequestCount() { return counters.authed; },
		get unauthedRequestCount() { return counters.unauthed; },
	};
}

function readRequestBody(req: IncomingMessage): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		const chunks: Buffer[] = [];
		req.on('data', (chunk: Buffer) => chunks.push(chunk));
		req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
		req.on('error', reject);
	});
}

function handleMcpMethod(message: { id?: number | string; method: string; params?: unknown }): { result: unknown } | { error: { code: number; message: string } } | undefined {
	switch (message.method) {
		case 'initialize':
			return {
				result: {
					protocolVersion: '2024-11-05',
					capabilities: { tools: {} },
					serverInfo: { name: 'secure-hello', version: '1.0.0' },
				},
			};
		case 'notifications/initialized':
			return undefined;
		case 'tools/list':
			return {
				result: {
					tools: [{
						name: 'say_hello',
						description: 'Returns a friendly greeting for the given name.',
						inputSchema: {
							type: 'object',
							properties: { name: { type: 'string' } },
							required: ['name'],
						},
					}],
				},
			};
		case 'tools/call': {
			const params = (message.params ?? {}) as { name?: string; arguments?: { name?: string } };
			if (params.name !== 'say_hello') {
				return { error: { code: -32601, message: `Unknown tool: ${params.name}` } };
			}
			const target = params.arguments?.name ?? 'world';
			return { result: { content: [{ type: 'text', text: `Hello, ${target}!` }] } };
		}
		default:
			return { error: { code: -32601, message: `Method not found: ${message.method}` } };
	}
}
