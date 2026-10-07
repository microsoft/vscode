/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'fs';
import type * as http from 'http';
import { createRequire } from 'module';
import type { Server as McpProtocolServer } from '@modelcontextprotocol/sdk/server/index.js';
import type { SSEServerTransport as SseServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import type { StreamableHTTPServerTransport as HttpServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { CallToolResult, JSONRPCMessage, ReadResourceResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { retry } from '../../../../../../base/common/async.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import type { SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { CustomizationEnablementKind, McpServerStatus } from '../../../../common/state/protocol/state.js';
import { ActionType } from '../../../../common/state/sessionActions.js';
import { buildDefaultChatUri, customizationId, CustomizationType, type ClientPluginCustomization, type McpServerCustomization, type PluginCustomization, type SessionState } from '../../../../common/state/sessionState.js';
import { getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import { createRealSession, driveTurnToCompletion, textFromContent } from '../harness/agentHostE2ETestHarness.js';
import { assertRecordedAhpSnapshot } from '../harness/ahpSnapshot.js';
import type { IAgentHostE2ETestContext } from './e2eTestContext.js';

const nodeRequire = createRequire(import.meta.url);
const httpModule = nodeRequire('http') as typeof http;
const protocolModule = nodeRequire('@modelcontextprotocol/sdk/server/index.js') as typeof import('@modelcontextprotocol/sdk/server/index.js');
const sseModule = nodeRequire('@modelcontextprotocol/sdk/server/sse.js') as typeof import('@modelcontextprotocol/sdk/server/sse.js');
const streamableModule = nodeRequire('@modelcontextprotocol/sdk/server/streamableHttp.js') as typeof import('@modelcontextprotocol/sdk/server/streamableHttp.js');
const mcpTypes = nodeRequire('@modelcontextprotocol/sdk/types.js') as typeof import('@modelcontextprotocol/sdk/types.js');
const serverName = 'runtime-transport';
const toolName = 'coverage_probe';
const textResource = 'coverage://fixture/document';
const blobResource = 'coverage://fixture/binary';
const missingResource = 'coverage://fixture/missing';
const binaryContent = Buffer.from('RUNTIME_MCP_BINARY_λ', 'utf8').toString('base64');

type FixtureTransport = 'http-json' | 'http-stream' | 'sse' | 'stdio';
type FixtureScenario = 'normal' | 'progress' | 'tool-error' | 'rpc-error' | 'structured' | 'resources' | 'resource-error' | 'unicode' | 'environment';

interface IMcpFixtureOptions {
	readonly transport: FixtureTransport;
	readonly scenario?: FixtureScenario;
	readonly pagination?: boolean;
	readonly nestedSchema?: boolean;
	readonly fragmentedSse?: boolean;
	readonly environmentHeader?: boolean;
}

interface IMcpTrace {
	readonly event?: string;
	readonly method?: string;
	readonly cursor?: string;
	readonly name?: string;
	readonly arguments?: Record<string, unknown>;
	readonly uri?: string;
	readonly progress?: number;
	readonly cwd?: string;
	readonly marker?: string;
	readonly argv?: readonly string[];
}

interface IHttpTrace {
	readonly method: string | undefined;
	readonly path: string;
	readonly marker: string | undefined;
}

interface IToolCompletion {
	readonly success: boolean;
	readonly text: string;
}

interface IMcpScenario {
	readonly sessionUri: string;
	readonly pluginUri: string;
	readonly workspace: string;
	readonly fixture: RuntimeMcpFixture;
	nextClientSeq(): number;
	call(argumentsValue: Record<string, unknown>, turnId?: string): Promise<readonly IToolCompletion[]>;
	server(): Promise<McpServerCustomization>;
}

/** Shared by the in-process HTTP server and its generated, provider-launched stdio counterpart. */
function configureMcpProtocol(
	server: McpProtocolServer,
	options: IMcpFixtureOptions,
	record: (entry: IMcpTrace) => void,
	types: typeof import('@modelcontextprotocol/sdk/types.js'),
): void {
	let calls = 0;
	const probe: Tool = {
		name: 'coverage_probe',
		description: 'A deterministic local transport fixture. Call only when explicitly requested.',
		inputSchema: {
			type: 'object',
			properties: {
				tag: { type: 'string' },
				...(options.nestedSchema ? {
					payload: {
						type: 'object',
						properties: {
							label: { type: 'string' },
							levels: { type: 'array', items: { type: 'integer' } },
							enabled: { type: 'boolean' },
							optional: { type: ['string', 'null'] },
						},
						required: ['label', 'levels', 'enabled', 'optional'],
						additionalProperties: false,
					},
				} : {}),
			},
			required: options.nestedSchema ? ['tag', 'payload'] : ['tag'],
			additionalProperties: false,
		},
		annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
		...(options.scenario === 'structured' ? {
			outputSchema: {
				type: 'object' as const,
				properties: { marker: { type: 'string' }, count: { type: 'integer' }, items: { type: 'array' } },
				required: ['marker', 'count', 'items'],
			},
		} : {}),
	};
	server.setRequestHandler(types.ListToolsRequestSchema, async request => {
		record({ method: 'tools/list', cursor: request.params?.cursor ?? '' });
		if (options.pagination && !request.params?.cursor) {
			return {
				tools: [{ ...probe, name: 'coverage_first_page', description: 'Catalog page sentinel; do not call.' }],
				nextCursor: 'coverage-page-two',
			};
		}
		return { tools: [probe] };
	});
	server.setRequestHandler(types.CallToolRequestSchema, async request => {
		const args = request.params.arguments ?? {};
		record({ method: 'tools/call', name: request.params.name, arguments: args });
		calls++;
		if (request.params.name !== 'coverage_probe') {
			throw new types.McpError(types.ErrorCode.InvalidParams, 'RUNTIME_MCP_UNKNOWN_TOOL');
		}
		if (options.scenario === 'rpc-error' && calls === 1) {
			throw new types.McpError(types.ErrorCode.InternalError, 'RUNTIME_MCP_PROTOCOL_ERROR');
		}
		if (options.scenario === 'tool-error' && calls === 1) {
			return { isError: true, content: [{ type: 'text' as const, text: 'RUNTIME_MCP_TOOL_ERROR' }] };
		}
		if (options.scenario === 'progress') {
			const progressToken = request.params._meta?.progressToken;
			if (progressToken !== undefined) {
				for (const progress of [1, 2]) {
					await server.notification({ method: 'notifications/progress', params: { progressToken, progress, total: 2, message: `RUNTIME_MCP_PROGRESS_${progress}` } });
					record({ event: 'progress', progress });
				}
			}
		}
		if (options.scenario === 'structured') {
			return {
				content: [{ type: 'text' as const, text: 'RUNTIME_MCP_STRUCTURED' }],
				structuredContent: { marker: 'RUNTIME_MCP_STRUCTURED', count: 3, items: [null, 2, 'λ'] },
			};
		}
		if (options.scenario === 'unicode') {
			return { content: [{ type: 'text' as const, text: 'RUNTIME_MCP_UNICODE\n' + 'λ中🙂\n'.repeat(24) + 'RUNTIME_MCP_UNICODE_END' }] };
		}
		if (options.scenario === 'environment') {
			return { content: [{ type: 'text' as const, text: `RUNTIME_MCP_ENV:${process.env['RUNTIME_MCP_FIXTURE_MARKER'] ?? ''}` }] };
		}
		return { content: [{ type: 'text' as const, text: `RUNTIME_MCP_OK:${JSON.stringify(args)}` }] };
	});
	server.setRequestHandler(types.ReadResourceRequestSchema, async request => {
		record({ method: 'resources/read', uri: request.params.uri });
		if (request.params.uri === 'coverage://fixture/missing') {
			throw new types.McpError(types.ErrorCode.InvalidParams, 'RUNTIME_MCP_RESOURCE_NOT_FOUND');
		}
		if (request.params.uri === 'coverage://fixture/binary') {
			return { contents: [{ uri: request.params.uri, mimeType: 'application/octet-stream', blob: Buffer.from('RUNTIME_MCP_BINARY_λ', 'utf8').toString('base64') }] };
		}
		return { contents: [{ uri: request.params.uri, mimeType: 'text/plain', text: 'RUNTIME_MCP_RESOURCE_TEXT\nλ中🙂' }] };
	});
}

class FragmentedSseTransport extends sseModule.SSEServerTransport {
	constructor(endpoint: string, private readonly response: http.ServerResponse) {
		super(endpoint, response);
	}

	override async send(message: JSONRPCMessage): Promise<void> {
		const frame = Buffer.from(`event: message\r\ndata: ${JSON.stringify(message)}\r\n\r\n`, 'utf8');
		for (let offset = 0; offset < frame.length; offset += 7) {
			await new Promise<void>((resolve, reject) => {
				this.response.write(frame.subarray(offset, offset + 7), error => error ? reject(error) : resolve());
			});
		}
	}
}

class RuntimeMcpFixture extends Disposable {
	readonly requests: IHttpTrace[] = [];
	private readonly httpServer: http.Server;
	private readonly connections = this._register(new DisposableMap<string, DisposableStore>());
	private readonly httpTransports = new Map<string, HttpServerTransport>();
	private readonly sseTransports = new Map<string, SseServerTransport>();
	private readonly closeTasks: Promise<void>[] = [];
	private readonly failures: Error[] = [];
	private readonly closed: Promise<void>;
	private baseUrl = '';
	private initializationCount = 0;
	private readonly tracePath: string;

	constructor(readonly options: IMcpFixtureOptions, private readonly workspace: string) {
		super();
		this.tracePath = join(workspace, 'mcp-trace.jsonl');
		writeFileSync(this.tracePath, '');
		this.httpServer = httpModule.createServer((request, response) => {
			this.requests.push({
				method: request.method, path: (request.url ?? '/').split('?')[0],
				marker: typeof request.headers['x-runtime-fixture'] === 'string' ? request.headers['x-runtime-fixture'] : undefined,
			});
			void this.handleHttp(request, response).catch(error => {
				this.failures.push(error instanceof Error ? error : new Error(String(error)));
				if (!response.headersSent) {
					response.writeHead(500);
				}
				response.end();
			});
		});
		this.closed = new Promise<void>(resolve => {
			this._register(toDisposable(() => {
				this.httpServer.close(() => resolve());
				this.httpServer.closeAllConnections();
			}));
		});
	}

	get url(): string {
		assert.ok(this.baseUrl);
		return this.baseUrl;
	}

	get initializations(): number {
		return this.initializationCount;
	}

	get trace(): readonly IMcpTrace[] {
		return readFileSync(this.tracePath, 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line) as IMcpTrace);
	}

	get calls(): readonly { name: string | undefined; arguments: Record<string, unknown> | undefined }[] {
		return this.trace.filter(entry => entry.method === 'tools/call').map(entry => ({ name: entry.name, arguments: entry.arguments }));
	}

	assertHealthy(): void {
		assert.deepStrictEqual(this.failures.map(error => error.message), []);
	}

	async start(): Promise<void> {
		if (this.options.transport === 'stdio') {
			return;
		}
		await new Promise<void>((resolve, reject) => {
			const onError = (error: Error) => {
				this.httpServer.off('listening', onListening);
				reject(error);
			};
			const onListening = () => {
				this.httpServer.off('error', onError);
				resolve();
			};
			this.httpServer.once('error', onError);
			this.httpServer.once('listening', onListening);
			this.httpServer.listen(0, '127.0.0.1');
		});
		const address = this.httpServer.address();
		assert.ok(address && typeof address !== 'string');
		this.baseUrl = `http://127.0.0.1:${address.port}`;
	}

	configuration(): object {
		if (this.options.transport !== 'stdio') {
			return {
				type: this.options.transport === 'sse' ? 'sse' : 'http',
				url: `${this.url}/${this.options.transport === 'sse' ? 'sse' : 'mcp'}`,
				tools: ['*'],
				...(this.options.environmentHeader ? { headers: { 'X-Runtime-Fixture': '$RUNTIME_MCP_FIXTURE_HEADER' } } : {}),
			};
		}
		const script = join(this.workspace, 'fixture-mcp.cjs');
		writeFileSync(script, [
			'const { appendFileSync } = require("fs");',
			`const { Server } = require(${JSON.stringify(nodeRequire.resolve('@modelcontextprotocol/sdk/server/index.js'))});`,
			`const { StdioServerTransport } = require(${JSON.stringify(nodeRequire.resolve('@modelcontextprotocol/sdk/server/stdio.js'))});`,
			`const types = require(${JSON.stringify(nodeRequire.resolve('@modelcontextprotocol/sdk/types.js'))});`,
			`const record = entry => appendFileSync(${JSON.stringify(this.tracePath)}, JSON.stringify(entry) + "\\n");`,
			'record({ event: "stdio-start", cwd: process.cwd(), marker: process.env.RUNTIME_MCP_FIXTURE_MARKER || "", argv: process.argv.slice(2) });',
			'const server = new Server({ name: "runtime-transport", version: "1.0.0" }, { capabilities: { tools: {}, resources: {} } });',
			`const configure = ${configureMcpProtocol.toString()};`,
			`configure(server, ${JSON.stringify(this.options)}, record, types);`,
			'void server.connect(new StdioServerTransport());',
			'process.stdin.once("end", () => { void server.close(); });',
		].join('\n'));
		return {
			command: process.execPath, args: [script, 'fixture argument with spaces'],
			cwd: this.workspace,
			env: { ELECTRON_RUN_AS_NODE: '1', RUNTIME_MCP_FIXTURE_MARKER: 'synthetic-stdio-marker' },
			tools: ['*'],
		};
	}

	async whenClosed(): Promise<void> {
		await this.closed;
		await Promise.all(this.closeTasks);
	}

	private createProtocol(store: DisposableStore): McpProtocolServer {
		const protocol = new protocolModule.Server({ name: serverName, version: '1.0.0' }, { capabilities: { tools: {}, resources: {} } });
		store.add(toDisposable(() => { this.closeTasks.push(protocol.close()); }));
		configureMcpProtocol(protocol, this.options, entry => appendFileSync(this.tracePath, `${JSON.stringify(entry)}\n`), mcpTypes);
		protocol.oninitialized = () => {
			this.initializationCount++;
		};
		return protocol;
	}

	private async handleHttp(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
		const url = new URL(request.url ?? '/', this.baseUrl);
		if (url.pathname === '/sse' && request.method === 'GET') {
			const connection = new DisposableStore();
			const key = randomUUID();
			this.connections.set(key, connection);
			const transport = this.options.fragmentedSse
				? new FragmentedSseTransport('/messages', response)
				: new sseModule.SSEServerTransport('/messages', response);
			connection.add(toDisposable(() => { this.closeTasks.push(transport.close()); }));
			this.sseTransports.set(transport.sessionId, transport);
			const protocol = this.createProtocol(connection);
			await protocol.connect(transport);
			return;
		}
		if (url.pathname === '/messages' && request.method === 'POST') {
			const transport = this.sseTransports.get(url.searchParams.get('sessionId') ?? '');
			if (!transport) {
				response.writeHead(404).end();
				return;
			}
			await transport.handlePostMessage(request, response);
			return;
		}
		if (url.pathname !== '/mcp') {
			response.writeHead(404).end();
			return;
		}
		const sessionId = typeof request.headers['mcp-session-id'] === 'string' ? request.headers['mcp-session-id'] : undefined;
		let transport = sessionId ? this.httpTransports.get(sessionId) : undefined;
		if (!transport) {
			if (sessionId || request.method !== 'POST') {
				response.writeHead(404).end();
				return;
			}
			const connection = new DisposableStore();
			const key = randomUUID();
			this.connections.set(key, connection);
			transport = new streamableModule.StreamableHTTPServerTransport({
				sessionIdGenerator: () => randomUUID(),
				enableJsonResponse: this.options.transport === 'http-json',
				onsessioninitialized: id => {
					assert.ok(transport);
					this.httpTransports.set(id, transport);
				},
			});
			const ownedTransport = transport;
			connection.add(toDisposable(() => { this.closeTasks.push(ownedTransport.close()); }));
			const protocol = this.createProtocol(connection);
			await protocol.connect(transport);
		}
		await transport.handleRequest(request, response);
	}
}

function toolResults(context: IAgentHostE2ETestContext, sessionUri: string, turnId: string): readonly IToolCompletion[] {
	const starts = new Set(context.client.receivedNotifications(notification => isActionNotification(notification, ActionType.ChatToolCallStart)).flatMap(notification => {
		const { channel, action } = getActionEnvelope(notification);
		return channel === buildDefaultChatUri(sessionUri) && action.type === ActionType.ChatToolCallStart && action.turnId === turnId && action.toolName.includes(toolName)
			? [action.toolCallId] : [];
	}));
	const completions = new Map<string, IToolCompletion>();
	for (const notification of context.client.receivedNotifications(item => isActionNotification(item, ActionType.ChatToolCallComplete))) {
		const { channel, action } = getActionEnvelope(notification);
		if (channel === buildDefaultChatUri(sessionUri) && action.type === ActionType.ChatToolCallComplete && action.turnId === turnId && starts.has(action.toolCallId)) {
			completions.set(action.toolCallId, { success: action.result.success, text: textFromContent(action.result.content ?? []) });
		}
	}
	return [...completions.values()];
}

function assertCalls(scenario: IMcpScenario, argumentsValues: readonly Record<string, unknown>[], completions: readonly IToolCompletion[], markers: readonly RegExp[], successes: readonly boolean[]): void {
	assert.deepStrictEqual({
		calls: scenario.fixture.calls,
		successes: completions.map(result => result.success),
		markers: markers.map((marker, index) => marker.test(completions[index]?.text ?? '')),
	}, {
		calls: argumentsValues.map(argumentsValue => ({ name: toolName, arguments: argumentsValue })),
		successes,
		markers: markers.map(() => true),
	}, completions.map(result => result.text).join('\n'));
}

export function defineCopilotRuntimeMcpCoverageTests(context: IAgentHostE2ETestContext): void {
	if (context.tier !== 'parity' || context.config.provider !== 'copilotcli') {
		return;
	}
	suite('Copilot runtime MCP transport coverage', () => {
		ensureNoDisposablesAreLeakedInTestSuite();
		defineMcpCoverageTests(context);
	});
}

function defineMcpCoverageTests(context: IAgentHostE2ETestContext): void {
	function mcpTest(title: string, options: IMcpFixtureOptions, run: (scenario: IMcpScenario) => Promise<void>): void {
		const fullTitle = `runtime coverage mcp: ${title}`;
		if (options.environmentHeader) {
			context.registerTestEnvironment(fullTitle, { RUNTIME_MCP_FIXTURE_HEADER: 'synthetic-header-marker' });
		}
		test(fullTitle, async function () {
			this.timeout(240_000);
			const root = join(process.cwd(), '.build', 'agent-host-mcp-fixtures');
			mkdirSync(root, { recursive: true });
			const workspace = mkdtempSync(join(root, 'fixture-'));
			context.tempDirs.push(workspace);
			execFileSync('git', ['init', '--quiet', workspace]);
			const store = new DisposableStore();
			const fixture = store.add(new RuntimeMcpFixture(options, workspace));
			let sessionUri: string | undefined;
			try {
				await fixture.start();
				if (options.transport !== 'stdio') {
					store.add(context.registerFixtureUrl('mcp', fixture.url));
				}
				const plugin = join(workspace, 'plugin');
				mkdirSync(join(plugin, '.plugin'), { recursive: true });
				writeFileSync(join(plugin, '.plugin', 'plugin.json'), JSON.stringify({ name: 'runtime-mcp-transport' }));
				writeFileSync(join(plugin, '.mcp.json'), JSON.stringify({ mcpServers: { [serverName]: fixture.configuration() } }));
				const pluginUri = URI.file(plugin).toString();
				const clientId = 'runtime-mcp-transport-client';
				sessionUri = await createRealSession(context.client, context.config, clientId, context.createdSessions, URI.file(workspace));
				const customization: ClientPluginCustomization = {
					type: CustomizationType.Plugin, id: customizationId(pluginUri), uri: pluginUri,
					name: 'runtime-mcp-transport', nonce: '1',
					enablement: [{ kind: CustomizationEnablementKind.Global, enabled: true }],
				};
				context.client.dispatch({
					channel: sessionUri, clientSeq: 1,
					action: { type: ActionType.SessionActiveClientSet, activeClient: { clientId, tools: [], customizations: [customization] } },
				});
				let sequence = 10;
				const created = sessionUri;
				const scenario: IMcpScenario = {
					sessionUri, pluginUri, workspace, fixture,
					nextClientSeq: () => sequence++,
					call: async (args, turnId = `mcp-turn-${sequence}`) => {
						await driveTurnToCompletion(context.client, created, turnId,
							`Call ${toolName} exactly once with ${JSON.stringify(args)}. Do not retry it, call other tools, run commands, or change the arguments. Afterwards reply exactly MCP_TURN_DONE.`,
							scenario.nextClientSeq());
						return toolResults(context, created, turnId);
					},
					server: async () => retry(async () => {
						const result = await context.client.call<SubscribeResult>('subscribe', { channel: created });
						const pluginState = (result.snapshot!.state as SessionState).customizations?.find((item): item is PluginCustomization =>
							item.type === CustomizationType.Plugin && item.uri === pluginUri);
						const servers = pluginState?.children?.filter((item): item is McpServerCustomization => item.type === CustomizationType.McpServer) ?? [];
						assert.strictEqual(servers.length, 1, 'The fixture plugin must contribute exactly one MCP server');
						const server = servers[0];
						assert.ok(server, 'The plugin must expose its MCP server through AHP');
						return server;
					}, 100, 100),
				};
				await scenario.server();
				await driveTurnToCompletion(context.client, created, 'mcp-materialize',
					'Reply exactly MCP_TRANSPORT_READY. Do not call tools or run commands.', scenario.nextClientSeq());
				await ready(scenario);
				assert.deepStrictEqual(fixture.calls, [], 'Provider materialization must not execute an MCP tool');
				// Exclude asynchronous provider startup, not the scenario's tool or lifecycle events.
				context.client.clearAhpSnapshot();
				await run(scenario);
				fixture.assertHealthy();
				await assertRecordedAhpSnapshot(this.test!, context.client, { profile: 'behavior' });
			} finally {
				try {
					if (sessionUri) {
						await context.client.call('disposeSession', { channel: sessionUri }, 30_000);
						const index = context.createdSessions.indexOf(sessionUri);
						if (index >= 0) {
							context.createdSessions.splice(index, 1);
						}
					}
				} finally {
					store.dispose();
					await fixture.whenClosed();
				}
			}
		});
	}

	async function ready(scenario: IMcpScenario): Promise<McpServerCustomization> {
		return retry(async () => {
			const server = await scenario.server();
			assert.strictEqual(server.state.kind, McpServerStatus.Ready);
			assert.ok(server.channel, 'Ready MCP servers must advertise their AHP side channel');
			return server;
		}, 100, 100);
	}

	async function bootstrap(scenario: IMcpScenario): Promise<McpServerCustomization> {
		const args = { tag: 'bootstrap' };
		const result = await scenario.call(args);
		assertCalls(scenario, [args], result, [/RUNTIME_MCP_(?:OK|STRUCTURED)/], [true]);
		return ready(scenario);
	}

	async function recover(scenario: IMcpScenario, marker: RegExp): Promise<void> {
		const failedArgs = { tag: 'failure' };
		const healthyArgs = { tag: 'healthy' };
		const failure = await scenario.call(failedArgs, 'mcp-failure');
		const healthy = await scenario.call(healthyArgs, 'mcp-recovery');
		assertCalls(scenario, [failedArgs, healthyArgs], [...failure, ...healthy], [marker, /RUNTIME_MCP_OK/], [false, true]);
		assert.strictEqual((await ready(scenario)).state.kind, McpServerStatus.Ready);
	}

	mcpTest('calls a typed tool over stateful JSON HTTP', { transport: 'http-json' }, async scenario => {
		const args = { tag: 'json-response' };
		const results = await scenario.call(args);
		assertCalls(scenario, [args], results, [/RUNTIME_MCP_OK/], [true]);
		const server = await ready(scenario);
		assert.deepStrictEqual({ ready: server.state.kind, hasPosts: scenario.fixture.requests.some(request => request.method === 'POST' && request.path === '/mcp'), initialized: scenario.fixture.initializations > 0 }, {
			ready: McpServerStatus.Ready, hasPosts: true, initialized: true,
		});
	});

	mcpTest('consumes progress and streamed tool results over HTTP', { transport: 'http-stream', scenario: 'progress' }, async scenario => {
		const args = { tag: 'stream-progress' };
		const results = await scenario.call(args);
		assertCalls(scenario, [args], results, [/RUNTIME_MCP_OK/], [true]);
		assert.deepStrictEqual(scenario.fixture.trace.filter(entry => entry.event === 'progress').map(entry => entry.progress), [1, 2]);
	});

	mcpTest('discovers a tool on the second HTTP catalog page', { transport: 'http-json', pagination: true }, async scenario => {
		const args = { tag: 'second-page' };
		const results = await scenario.call(args);
		assertCalls(scenario, [args], results, [/RUNTIME_MCP_OK/], [true]);
		assert.deepStrictEqual([...new Set(scenario.fixture.trace.filter(entry => entry.method === 'tools/list').map(entry => entry.cursor))], ['', 'coverage-page-two']);
	});

	mcpTest('resolves scoped environment headers for an HTTP server', { transport: 'http-json', environmentHeader: true }, async scenario => {
		const args = { tag: 'environment-header' };
		const results = await scenario.call(args);
		assertCalls(scenario, [args], results, [/RUNTIME_MCP_OK/], [true]);
		assert.deepStrictEqual([...new Set(scenario.fixture.requests.filter(request => request.path === '/mcp').map(request => request.marker))], ['synthetic-header-marker']);
	});

	mcpTest('returns an HTTP tool error and then a healthy result', { transport: 'http-json', scenario: 'tool-error' }, async scenario => {
		await recover(scenario, /RUNTIME_MCP_TOOL_ERROR/);
	});

	mcpTest('recovers from an HTTP JSON-RPC tool exception', { transport: 'http-json', scenario: 'rpc-error' }, async scenario => {
		await recover(scenario, /RUNTIME_MCP_PROTOCOL_ERROR/);
	});

	mcpTest('preserves structured HTTP tool results through the MCP side channel', { transport: 'http-json', scenario: 'structured' }, async scenario => {
		const server = await bootstrap(scenario);
		const result = await context.client.call<CallToolResult>('tools/call', { channel: server.channel, name: toolName, arguments: { tag: 'raw-structure' } });
		assert.deepStrictEqual({
			structured: result.structuredContent,
			text: result.content.filter(item => item.type === 'text').map(item => item.text),
			calls: scenario.fixture.calls,
		}, {
			structured: { marker: 'RUNTIME_MCP_STRUCTURED', count: 3, items: [null, 2, 'λ'] },
			text: ['RUNTIME_MCP_STRUCTURED'],
			calls: [{ name: toolName, arguments: { tag: 'bootstrap' } }, { name: toolName, arguments: { tag: 'raw-structure' } }],
		});
	});

	mcpTest('reads text and binary HTTP resources through AHP', { transport: 'http-json', scenario: 'resources' }, async scenario => {
		const server = await bootstrap(scenario);
		const text = await context.client.call<ReadResourceResult>('resources/read', { channel: server.channel, uri: textResource });
		const binary = await context.client.call<ReadResourceResult>('resources/read', { channel: server.channel, uri: blobResource });
		assert.deepStrictEqual({
			text: text.contents, binary: binary.contents,
			reads: scenario.fixture.trace.filter(entry => entry.method === 'resources/read').map(entry => entry.uri),
		}, {
			text: [{ uri: textResource, mimeType: 'text/plain', text: 'RUNTIME_MCP_RESOURCE_TEXT\nλ中🙂' }],
			binary: [{ uri: blobResource, mimeType: 'application/octet-stream', blob: binaryContent }],
			reads: [textResource, blobResource],
		});
	});

	mcpTest('recovers from an HTTP resource read error', { transport: 'http-json', scenario: 'resource-error' }, async scenario => {
		const server = await bootstrap(scenario);
		await assert.rejects(context.client.call('resources/read', { channel: server.channel, uri: missingResource }), /RUNTIME_MCP_RESOURCE_NOT_FOUND/);
		const result = await context.client.call<ReadResourceResult>('resources/read', { channel: server.channel, uri: textResource });
		assert.deepStrictEqual({
			contents: result.contents,
			reads: scenario.fixture.trace.filter(entry => entry.method === 'resources/read').map(entry => entry.uri),
			state: (await ready(scenario)).state.kind,
		}, {
			contents: [{ uri: textResource, mimeType: 'text/plain', text: 'RUNTIME_MCP_RESOURCE_TEXT\nλ中🙂' }],
			reads: [missingResource, textResource],
			state: McpServerStatus.Ready,
		});
	});

	mcpTest('reconnects an HTTP server after an AHP stop and start', { transport: 'http-json' }, async scenario => {
		const before = { tag: 'before-stop' };
		const after = { tag: 'after-reconnect' };
		const first = await scenario.call(before);
		const server = await ready(scenario);
		const initializations = scenario.fixture.initializations;
		context.client.dispatch({ channel: scenario.sessionUri, clientSeq: scenario.nextClientSeq(), action: { type: ActionType.SessionMcpServerStopRequested, id: server.id } });
		await retry(async () => assert.strictEqual((await scenario.server()).state.kind, McpServerStatus.Stopped), 100, 100);
		context.client.dispatch({ channel: scenario.sessionUri, clientSeq: scenario.nextClientSeq(), action: { type: ActionType.SessionMcpServerStartRequested, id: server.id } });
		await ready(scenario);
		const second = await scenario.call(after);
		assertCalls(scenario, [before, after], [...first, ...second], [/RUNTIME_MCP_OK/, /RUNTIME_MCP_OK/], [true, true]);
		assert.deepStrictEqual({
			reinitialized: scenario.fixture.initializations > initializations,
			closedConnection: scenario.fixture.requests.some(request => request.method === 'DELETE'),
		}, { reinitialized: true, closedConnection: true });
	});

	mcpTest('disables and reenables an HTTP customization without stray calls', { transport: 'http-json' }, async scenario => {
		const before = { tag: 'enabled-before' };
		const after = { tag: 'enabled-after' };
		const first = await scenario.call(before);
		const server = await ready(scenario);
		context.client.dispatch({
			channel: scenario.sessionUri, clientSeq: scenario.nextClientSeq(),
			action: { type: ActionType.SessionCustomizationToggled, id: server.id, enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }] },
		});
		await retry(async () => assert.strictEqual((await scenario.server()).state.kind, McpServerStatus.Stopped), 100, 100);
		await driveTurnToCompletion(context.client, scenario.sessionUri, 'mcp-disabled', 'Reply exactly MCP_DISABLED_IDLE. Do not call tools or run commands.', scenario.nextClientSeq());
		assert.deepStrictEqual(scenario.fixture.calls, [{ name: toolName, arguments: before }]);
		context.client.dispatch({
			channel: scenario.sessionUri, clientSeq: scenario.nextClientSeq(),
			action: { type: ActionType.SessionCustomizationToggled, id: server.id, enablement: [{ kind: CustomizationEnablementKind.Global, enabled: true }] },
		});
		await ready(scenario);
		const second = await scenario.call(after);
		assertCalls(scenario, [before, after], [...first, ...second], [/RUNTIME_MCP_OK/, /RUNTIME_MCP_OK/], [true, true]);
	});

	mcpTest('calls a tool over the legacy SSE transport', { transport: 'sse' }, async scenario => {
		const args = { tag: 'legacy-sse' };
		const results = await scenario.call(args);
		assertCalls(scenario, [args], results, [/RUNTIME_MCP_OK/], [true]);
		assert.deepStrictEqual({
			listened: scenario.fixture.requests.some(request => request.method === 'GET' && request.path === '/sse'),
			posted: scenario.fixture.requests.some(request => request.method === 'POST' && request.path === '/messages'),
		}, { listened: true, posted: true });
	});

	mcpTest('decodes fragmented legacy SSE Unicode and multiline results', { transport: 'sse', scenario: 'unicode', fragmentedSse: true }, async scenario => {
		const args = { tag: 'split-unicode' };
		const results = await scenario.call(args);
		assertCalls(scenario, [args], results, [/RUNTIME_MCP_UNICODE[\s\S]*RUNTIME_MCP_UNICODE_END/], [true]);
		assert.deepStrictEqual({
			unicodeLines: results[0].text.split('λ中🙂').length - 1,
			replacementCharacter: results[0].text.includes('\uFFFD'),
		}, { unicodeLines: 24, replacementCharacter: false });
	});

	mcpTest('recovers from an SSE JSON-RPC exception on the same connection', { transport: 'sse', scenario: 'rpc-error' }, async scenario => {
		await recover(scenario, /RUNTIME_MCP_PROTOCOL_ERROR/);
		assert.strictEqual(scenario.fixture.requests.filter(request => request.method === 'GET' && request.path === '/sse').length, 1);
	});

	mcpTest('discovers paginated stdio tools with nested argument schemas', { transport: 'stdio', pagination: true, nestedSchema: true }, async scenario => {
		const args = { tag: 'stdio-schema', payload: { label: 'λ', levels: [2, 3], enabled: false, optional: null } };
		const results = await scenario.call(args);
		assertCalls(scenario, [args], results, [/RUNTIME_MCP_OK/], [true]);
		assert.deepStrictEqual([...new Set(scenario.fixture.trace.filter(entry => entry.method === 'tools/list').map(entry => entry.cursor))], ['', 'coverage-page-two']);
	});

	mcpTest('preserves stdio working directory and environment launch values', { transport: 'stdio', scenario: 'environment' }, async scenario => {
		const args = { tag: 'stdio-environment' };
		const results = await scenario.call(args);
		assertCalls(scenario, [args], results, [/RUNTIME_MCP_ENV:synthetic-stdio-marker/], [true]);
		assert.deepStrictEqual(scenario.fixture.trace.filter(entry => entry.event === 'stdio-start').map(entry => ({
			cwd: entry.cwd ? realpathSync(entry.cwd) : undefined, marker: entry.marker, argv: entry.argv,
		})), [{
			cwd: realpathSync(scenario.workspace), marker: 'synthetic-stdio-marker', argv: ['fixture argument with spaces'],
		}]);
	});
}
