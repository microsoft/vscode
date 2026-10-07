/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import type * as http from 'http';
import { createRequire } from 'module';
import type { StreamableHTTPServerTransport as HttpServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { retry } from '../../../../../../base/common/async.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import type { AuthenticateResult, SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { CustomizationEnablementKind, McpAuthRequiredReason, McpServerStatus, type McpServerAuthRequiredState } from '../../../../common/state/protocol/state.js';
import { ActionType } from '../../../../common/state/sessionActions.js';
import { AHP_AUTH_REQUIRED } from '../../../../common/state/sessionProtocol.js';
import { buildDefaultChatUri, customizationId, CustomizationType, ROOT_STATE_URI, type ClientPluginCustomization, type McpServerCustomization, type PluginCustomization, type SessionState } from '../../../../common/state/sessionState.js';
import { getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import { assertToolCallCompleteText, createRealSession, driveTurnToCompletion, type IDrivenTurnResult } from '../harness/agentHostE2ETestHarness.js';
import { assertRecordedAhpSnapshot } from '../harness/ahpSnapshot.js';
import type { IAgentHostE2ETestContext } from './e2eTestContext.js';

const nodeRequire = createRequire(import.meta.url);
const httpModule = nodeRequire('http') as typeof http;
const protocolModule = nodeRequire('@modelcontextprotocol/sdk/server/index.js') as typeof import('@modelcontextprotocol/sdk/server/index.js');
const streamableModule = nodeRequire('@modelcontextprotocol/sdk/server/streamableHttp.js') as typeof import('@modelcontextprotocol/sdk/server/streamableHttp.js');
const mcpTypes = nodeRequire('@modelcontextprotocol/sdk/types.js') as typeof import('@modelcontextprotocol/sdk/types.js');
const serverName = 'runtime-authorization';
const toolName = 'authorization_probe';
const initialToken = 'synthetic-local-fixture-initial';
const replacementToken = 'synthetic-local-fixture-replacement';

type MetadataScenario = 'pointer' | 'well-known' | 'unavailable' | 'malformed' | 'invalid-json' | 'canonical';

interface IAuthorizationOptions {
	readonly metadata?: MetadataScenario;
	readonly scopes?: readonly string[];
	readonly publicClient?: boolean;
}

interface IAuthorizationRequest {
	readonly method: string | undefined;
	readonly path: string;
	readonly rpcMethod?: string;
	readonly credential: 'none' | 'initial' | 'replacement' | 'unexpected';
	readonly challenged: boolean;
}

interface IAuthorizationTurn {
	readonly completed: Promise<IDrivenTurnResult>;
	readonly challenge: Promise<McpServerAuthRequiredState>;
}

interface IAuthorizationScenario {
	readonly sessionUri: string;
	readonly fixture: AuthorizationFixture;
	nextClientSeq(): number;
	server(): Promise<McpServerCustomization>;
	authenticate(auth: McpServerAuthRequiredState, token?: string, scopes?: readonly string[], resource?: string): Promise<void>;
	initialAuthorization(): IAuthorizationTurn;
	call(tag: string): Promise<void>;
	challengeTool(tag: string): IAuthorizationTurn;
}

class AuthorizationFixture extends Disposable {
	readonly requests: IAuthorizationRequest[] = [];
	readonly calls: string[] = [];
	private readonly server: http.Server;
	private readonly connections = this._register(new DisposableMap<string, DisposableStore>());
	private readonly transports = new Map<string, HttpServerTransport>();
	private readonly closeTasks: Promise<void>[] = [];
	private readonly errors: Error[] = [];
	private readonly closed: Promise<void>;
	private baseUrl = '';
	private requiredToken = initialToken;
	private callChallenge: 'refresh' | 'upscope' | undefined;
	private requiredScopes: readonly string[];

	constructor(readonly options: IAuthorizationOptions) {
		super();
		this.requiredScopes = options.scopes ?? ['fixture.read'];
		this.server = httpModule.createServer((request, response) => {
			void this.handle(request, response).catch(error => {
				this.errors.push(error instanceof Error ? error : new Error(String(error)));
				if (!response.headersSent) {
					response.writeHead(500);
				}
				response.end();
			});
		});
		this.closed = new Promise<void>(resolve => {
			this._register(toDisposable(() => {
				this.server.close(() => resolve());
				this.server.closeAllConnections();
			}));
		});
	}

	get url(): string {
		assert.ok(this.baseUrl);
		return this.baseUrl;
	}

	get resource(): string {
		return `${this.url}/${this.options.metadata === 'canonical' ? 'canonical-resource' : 'mcp'}`;
	}

	get authorizationServer(): string {
		return `${this.url}/issuer`;
	}

	armToolChallenge(kind: 'refresh' | 'upscope'): void {
		this.callChallenge = kind;
	}

	assertHealthy(): void {
		assert.deepStrictEqual(this.errors.map(error => error.message), []);
		assert.ok(this.requests.every(request => request.path === '/mcp' || request.path === '/metadata' || request.path.startsWith('/.well-known/oauth-protected-resource')),
			'No browser, token endpoint, or account service may be contacted by the fixture');
		assert.ok(this.requests.every(request => request.credential !== 'unexpected'), 'Only the fixture-specific credentials may reach this loopback server');
	}

	async start(): Promise<void> {
		await new Promise<void>((resolve, reject) => {
			const onError = (error: Error) => {
				this.server.off('listening', onListening);
				reject(error);
			};
			const onListening = () => {
				this.server.off('error', onError);
				resolve();
			};
			this.server.once('error', onError);
			this.server.once('listening', onListening);
			this.server.listen(0, '127.0.0.1');
		});
		const address = this.server.address();
		assert.ok(address && typeof address !== 'string');
		this.baseUrl = `http://127.0.0.1:${address.port}`;
	}

	async whenClosed(): Promise<void> {
		await this.closed;
		await Promise.all(this.closeTasks);
	}

	private challenge(response: http.ServerResponse, kind: 'initial' | 'refresh' | 'upscope'): void {
		const fields: string[] = [];
		if ((this.options.metadata ?? 'pointer') !== 'well-known') {
			fields.push(`resource_metadata="${this.url}/metadata"`);
		}
		fields.push(`scope="${this.requiredScopes.join(' ')}"`);
		if (kind !== 'initial') {
			fields.push(`error="${kind === 'upscope' ? 'insufficient_scope' : 'invalid_token'}"`);
		}
		response.writeHead(kind === 'upscope' ? 403 : 401, {
			'WWW-Authenticate': `Bearer ${fields.join(', ')}`,
			'Content-Type': 'application/json',
		});
		response.end(JSON.stringify({ error: kind === 'upscope' ? 'insufficient_scope' : 'invalid_token' }));
	}

	private metadata(response: http.ServerResponse): void {
		if (this.options.metadata === 'unavailable') {
			response.writeHead(404).end();
			return;
		}
		response.setHeader('Content-Type', 'application/json');
		if (this.options.metadata === 'invalid-json') {
			response.end('{invalid-protected-resource-metadata');
			return;
		}
		if (this.options.metadata === 'malformed') {
			response.end(JSON.stringify({ resource: 42, authorization_servers: 'invalid-local-metadata' }));
			return;
		}
		response.end(JSON.stringify({
			resource: this.resource,
			authorization_servers: [this.authorizationServer],
			scopes_supported: ['fixture.read', 'fixture.write', 'fixture.admin'],
			resource_name: 'Synthetic loopback MCP resource',
		}));
	}

	private async handle(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
		const url = new URL(request.url ?? '/', this.baseUrl);
		let message: ReturnType<typeof mcpTypes.JSONRPCMessageSchema.parse> | undefined;
		if (request.method === 'POST') {
			const chunks: Buffer[] = [];
			for await (const chunk of request) {
				assert.ok(Buffer.isBuffer(chunk));
				chunks.push(chunk);
			}
			message = mcpTypes.JSONRPCMessageSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
		}
		const authorization = request.headers.authorization;
		const credential = authorization === undefined ? 'none'
			: authorization === `Bearer ${initialToken}` ? 'initial'
				: authorization === `Bearer ${replacementToken}` ? 'replacement' : 'unexpected';
		const rpcMethod = message && (mcpTypes.isJSONRPCRequest(message) || mcpTypes.isJSONRPCNotification(message)) ? message.method : undefined;
		if (url.pathname === '/metadata' || url.pathname.startsWith('/.well-known/oauth-protected-resource')) {
			this.requests.push({ method: request.method, path: url.pathname, credential, challenged: false, rpcMethod });
			this.metadata(response);
			return;
		}
		if (url.pathname !== '/mcp') {
			this.requests.push({ method: request.method, path: url.pathname, credential, challenged: false, rpcMethod });
			response.writeHead(404).end();
			return;
		}
		if (rpcMethod === 'tools/call' && this.callChallenge !== undefined) {
			const kind = this.callChallenge;
			this.callChallenge = undefined;
			this.requiredToken = replacementToken;
			if (kind === 'upscope') {
				this.requiredScopes = ['fixture.write'];
			}
			this.requests.push({ method: request.method, path: url.pathname, credential, challenged: true, rpcMethod });
			this.challenge(response, kind);
			return;
		}
		if (authorization !== `Bearer ${this.requiredToken}`) {
			this.requests.push({ method: request.method, path: url.pathname, credential, challenged: true, rpcMethod });
			this.challenge(response, 'initial');
			return;
		}
		this.requests.push({ method: request.method, path: url.pathname, credential, challenged: false, rpcMethod });
		const sessionId = typeof request.headers['mcp-session-id'] === 'string' ? request.headers['mcp-session-id'] : undefined;
		let transport = sessionId ? this.transports.get(sessionId) : undefined;
		if (!transport) {
			if (sessionId || request.method !== 'POST') {
				response.writeHead(404).end();
				return;
			}
			const connection = new DisposableStore();
			this.connections.set(randomUUID(), connection);
			transport = new streamableModule.StreamableHTTPServerTransport({
				sessionIdGenerator: () => randomUUID(),
				enableJsonResponse: true,
				onsessioninitialized: id => {
					assert.ok(transport);
					this.transports.set(id, transport);
				},
			});
			const ownedTransport = transport;
			connection.add(toDisposable(() => { this.closeTasks.push(ownedTransport.close()); }));
			const protocol = new protocolModule.Server({ name: serverName, version: '1.0.0' }, { capabilities: { tools: {} } });
			connection.add(toDisposable(() => { this.closeTasks.push(protocol.close()); }));
			protocol.setRequestHandler(mcpTypes.ListToolsRequestSchema, async () => ({
				tools: [{
					name: toolName, description: 'Returns a fixture result only after its local authorization succeeds.',
					inputSchema: { type: 'object', properties: { tag: { type: 'string' } }, required: ['tag'], additionalProperties: false },
					annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
				}],
			}));
			protocol.setRequestHandler(mcpTypes.CallToolRequestSchema, async input => {
				assert.strictEqual(input.params.name, toolName);
				const tag = input.params.arguments?.tag;
				assert.ok(typeof tag === 'string');
				this.calls.push(tag);
				return { content: [{ type: 'text' as const, text: `RUNTIME_MCP_AUTHORIZED:${tag}` }] };
			});
			await protocol.connect(transport);
		}
		await transport.handleRequest(request, response, message);
	}
}

export function defineCopilotRuntimeMcpAuthorizationCoverageTests(context: IAgentHostE2ETestContext): void {
	if (context.tier !== 'parity' || context.config.provider !== 'copilotcli') {
		return;
	}
	// Keep the generated snapshot paths within Windows checkout limits.
	suite('MCP', () => {
		ensureNoDisposablesAreLeakedInTestSuite();
		defineAuthorizationTests(context);
	});
}

function defineAuthorizationTests(context: IAgentHostE2ETestContext): void {
	function authTest(title: string, options: IAuthorizationOptions, run: (scenario: IAuthorizationScenario) => Promise<void>, knownIssue = false): void {
		(knownIssue && !context.runKnownIssueTests ? test.skip : test)(`runtime coverage mcp authorization: ${title}`, async function () {
			this.timeout(240_000);
			const root = join(process.cwd(), '.build', 'agent-host-mcp-authorization-fixtures');
			mkdirSync(root, { recursive: true });
			const workspace = mkdtempSync(join(root, 'fixture-'));
			context.tempDirs.push(workspace);
			execFileSync('git', ['init', '--quiet', workspace]);
			const store = new DisposableStore();
			const fixture = store.add(new AuthorizationFixture(options));
			const turns: Promise<IDrivenTurnResult>[] = [];
			let sessionUri: string | undefined;
			try {
				await fixture.start();
				store.add(context.registerFixtureUrl('mcp_auth', fixture.url));
				const plugin = join(workspace, 'plugin');
				mkdirSync(join(plugin, '.plugin'), { recursive: true });
				writeFileSync(join(plugin, '.plugin', 'plugin.json'), JSON.stringify({ name: 'runtime-mcp-authorization' }));
				writeFileSync(join(plugin, '.mcp.json'), JSON.stringify({
					mcpServers: {
						[serverName]: {
							type: 'http', url: `${fixture.url}/mcp`, tools: ['*'],
							...(options.publicClient ? { oauthClientId: 'synthetic-loopback-public-client' } : {}),
						},
					},
				}));
				const pluginUri = URI.file(plugin).toString();
				const clientId = 'runtime-mcp-authorization-client';
				sessionUri = await createRealSession(context.client, context.config, clientId, context.createdSessions, URI.file(workspace));
				const customization: ClientPluginCustomization = {
					type: CustomizationType.Plugin, id: customizationId(pluginUri), uri: pluginUri,
					name: 'runtime-mcp-authorization', nonce: '1',
					enablement: [{ kind: CustomizationEnablementKind.Global, enabled: true }],
				};
				context.client.dispatch({
					channel: sessionUri, clientSeq: 1,
					action: { type: ActionType.SessionActiveClientSet, activeClient: { clientId, tools: [], customizations: [customization] } },
				});
				const created = sessionUri;
				let sequence = 10;
				const waitAuth = async (): Promise<McpServerAuthRequiredState> => {
					const notification = await context.client.waitForNotification(item => {
						if (!isActionNotification(item, ActionType.SessionMcpServerStateChanged)) {
							return false;
						}
						const { channel, action } = getActionEnvelope(item);
						return channel === created && action.type === ActionType.SessionMcpServerStateChanged && action.state.kind === McpServerStatus.AuthRequired;
					}, 60_000);
					const action = getActionEnvelope(notification).action;
					assert.ok(action.type === ActionType.SessionMcpServerStateChanged && action.state.kind === McpServerStatus.AuthRequired);
					return action.state;
				};
				const startTurn = (tag: string, materialize = false): Promise<IDrivenTurnResult> => {
					const prompt = materialize ? 'Reply exactly MCP_AUTH_READY. Do not call tools or run commands.'
						: `Call ${toolName} exactly once with {"tag":"${tag}"}. Do not retry it or call other tools. Afterwards reply exactly MCP_AUTH_DONE.`;
					const completed = driveTurnToCompletion(context.client, created, tag, prompt, sequence++);
					turns.push(completed);
					void completed.catch(() => { });
					return completed;
				};
				const challengedTurn = (tag: string, materialize = false): IAuthorizationTurn => {
					context.client.clearReceived();
					const challenge = waitAuth();
					void challenge.catch(() => { });
					return { challenge, completed: startTurn(tag, materialize) };
				};
				const scenario: IAuthorizationScenario = {
					sessionUri, fixture, nextClientSeq: () => sequence++,
					server: async () => retry(async () => {
						const subscribed = await context.client.call<SubscribeResult>('subscribe', { channel: created });
						const pluginState = (subscribed.snapshot!.state as SessionState).customizations?.find((item): item is PluginCustomization =>
							item.type === CustomizationType.Plugin && item.uri === pluginUri);
						const servers = pluginState?.children?.filter((item): item is McpServerCustomization => item.type === CustomizationType.McpServer) ?? [];
						assert.strictEqual(servers.length, 1);
						return servers[0];
					}, 100, 100),
					authenticate: async (auth, token = initialToken, scopes = auth.requiredScopes ?? [], resource = auth.resource.resource) => {
						const result = await context.client.call<AuthenticateResult>('authenticate', { channel: ROOT_STATE_URI, resource, token, scopes: [...scopes] }, 30_000);
						assert.deepStrictEqual(result, {});
					},
					initialAuthorization: () => challengedTurn('mcp-auth-materialize', true),
					challengeTool: tag => challengedTurn(tag),
					call: async tag => {
						await startTurn(tag);
						assertToolCallCompleteText(context.client, {
							channel: buildDefaultChatUri(created), turnId: tag,
							toolNames: [`${serverName}-${toolName}`, toolName],
							expected: [new RegExp(`RUNTIME_MCP_AUTHORIZED:${tag}`)], success: true,
						});
					},
				};
				await scenario.server();
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
					await Promise.allSettled(turns);
				}
			}
		});
	}

	async function ready(scenario: IAuthorizationScenario): Promise<McpServerCustomization> {
		return retry(async () => {
			const server = await scenario.server();
			assert.strictEqual(server.state.kind, McpServerStatus.Ready, JSON.stringify({ state: server.state, requests: scenario.fixture.requests, calls: scenario.fixture.calls }));
			return server;
		}, 100, 100);
	}

	async function authorize(scenario: IAuthorizationScenario): Promise<McpServerAuthRequiredState> {
		const turn = scenario.initialAuthorization();
		const auth = await turn.challenge;
		assertChallenge(auth, scenario, scenario.fixture.options.scopes ?? ['fixture.read'],
			scenario.fixture.options.metadata !== 'unavailable' && scenario.fixture.options.metadata !== 'invalid-json' && scenario.fixture.options.metadata !== 'malformed');
		assert.deepStrictEqual(auth.oauthClient, scenario.fixture.options.publicClient ? { clientId: 'synthetic-loopback-public-client' } : undefined);
		assert.deepStrictEqual(scenario.fixture.calls, []);
		await scenario.authenticate(auth);
		await finishInitialAuthorization(scenario, turn);
		return auth;
	}

	async function finishInitialAuthorization(scenario: IAuthorizationScenario, turn: IAuthorizationTurn): Promise<void> {
		await turn.completed;
		await retry(async () => {
			assert.ok(scenario.fixture.requests.some(request => request.rpcMethod === 'tools/list' && request.credential === 'initial' && !request.challenged),
				JSON.stringify({ requests: scenario.fixture.requests, calls: scenario.fixture.calls }));
		}, 100, 100);
		assert.deepStrictEqual(scenario.fixture.calls, [], 'Initial authorization must not execute an MCP tool');
		// Initial challenge and root-auth replies are directly asserted; snapshot the subsequent contract, not provider startup.
		context.client.clearAhpSnapshot();
	}

	function assertChallenge(auth: McpServerAuthRequiredState, scenario: IAuthorizationScenario, expectedScopes: readonly string[], metadata: boolean): void {
		assert.deepStrictEqual({
			kind: auth.kind, reason: auth.reason, resource: auth.resource.resource,
			scopes: auth.requiredScopes, issuers: auth.resource.authorization_servers,
		}, {
			kind: McpServerStatus.AuthRequired, reason: McpAuthRequiredReason.Required,
			resource: scenario.fixture.resource, scopes: [...expectedScopes],
			issuers: metadata ? [scenario.fixture.authorizationServer] : undefined,
		});
	}

	authTest('uses advertised protected resource metadata and required scopes', { scopes: ['fixture.read'] }, async scenario => {
		const auth = await authorize(scenario);
		assertChallenge(auth, scenario, ['fixture.read'], true);
		await ready(scenario);
		await scenario.call('metadata-authorized');
		assert.deepStrictEqual({
			calls: scenario.fixture.calls,
			metadataRequested: scenario.fixture.requests.some(request => request.path === '/metadata'),
		}, { calls: ['metadata-authorized'], metadataRequested: true });
	}, true);

	authTest('discovers well-known metadata without a challenge pointer', { metadata: 'well-known' }, async scenario => {
		const auth = await authorize(scenario);
		assertChallenge(auth, scenario, ['fixture.read'], true);
		await scenario.call('well-known-authorized');
		assert.deepStrictEqual({
			calls: scenario.fixture.calls,
			wellKnownRequested: scenario.fixture.requests.some(request => request.path.startsWith('/.well-known/oauth-protected-resource')),
		}, { calls: ['well-known-authorized'], wellKnownRequested: true });
	});

	authTest('falls back to the challenged resource when metadata is unavailable', { metadata: 'unavailable' }, async scenario => {
		const auth = await authorize(scenario);
		assertChallenge(auth, scenario, ['fixture.read'], false);
		await scenario.call('metadata-unavailable');
		assert.deepStrictEqual(scenario.fixture.calls, ['metadata-unavailable']);
	});

	authTest('ignores malformed protected resource metadata without bypassing authentication', { metadata: 'malformed' }, async scenario => {
		const turn = scenario.initialAuthorization();
		const auth = await turn.challenge;
		assertChallenge(auth, scenario, ['fixture.read'], false);
		await scenario.authenticate(auth);
		await turn.completed;
		await scenario.call('metadata-malformed');
		assert.deepStrictEqual(scenario.fixture.calls, ['metadata-malformed']);
	}, true);

	authTest('falls back safely when protected resource metadata is invalid JSON', { metadata: 'invalid-json' }, async scenario => {
		const auth = await authorize(scenario);
		assertChallenge(auth, scenario, ['fixture.read'], false);
		await scenario.call('metadata-invalid-json');
		assert.deepStrictEqual(scenario.fixture.calls, ['metadata-invalid-json']);
	});

	authTest('binds authentication to the canonical resource rather than the transport URL', { metadata: 'canonical' }, async scenario => {
		const turn = scenario.initialAuthorization();
		const auth = await turn.challenge;
		assertChallenge(auth, scenario, ['fixture.read'], true);
		await assert.rejects(scenario.authenticate(auth, initialToken, ['fixture.read'], `${scenario.fixture.url}/mcp`), {
			code: AHP_AUTH_REQUIRED,
			message: `Authentication failed for resource: ${scenario.fixture.url}/mcp`,
		});
		assert.deepStrictEqual({ state: (await scenario.server()).state.kind, calls: scenario.fixture.calls }, { state: McpServerStatus.AuthRequired, calls: [] });
		await scenario.authenticate(auth);
		await finishInitialAuthorization(scenario, turn);
		await scenario.call('canonical-authorized');
		assert.deepStrictEqual(scenario.fixture.calls, ['canonical-authorized']);
	});

	authTest('rejects insufficient scope and accepts a satisfying scope set', { scopes: ['fixture.read', 'fixture.write'] }, async scenario => {
		const turn = scenario.initialAuthorization();
		const auth = await turn.challenge;
		assertChallenge(auth, scenario, ['fixture.read', 'fixture.write'], true);
		await assert.rejects(scenario.authenticate(auth, initialToken, ['fixture.read']), {
			code: AHP_AUTH_REQUIRED,
			message: `Authentication failed for resource: ${auth.resource.resource}`,
		});
		assert.deepStrictEqual({ state: (await scenario.server()).state.kind, calls: scenario.fixture.calls }, { state: McpServerStatus.AuthRequired, calls: [] });
		await scenario.authenticate(auth, initialToken, ['fixture.admin', 'fixture.write', 'fixture.read']);
		await finishInitialAuthorization(scenario, turn);
		await scenario.call('scopes-authorized');
		assert.deepStrictEqual(scenario.fixture.calls, ['scopes-authorized']);
	});

	authTest('projects a configured public OAuth client without starting browser authorization', { publicClient: true }, async scenario => {
		const auth = await authorize(scenario);
		assert.deepStrictEqual(auth.oauthClient, { clientId: 'synthetic-loopback-public-client' });
		await scenario.call('public-client-authorized');
		assert.deepStrictEqual(scenario.fixture.calls, ['public-client-authorized']);
	});

	authTest('refreshes an expired credential during a tool call and resumes it once', {}, async scenario => {
		await authorize(scenario);
		scenario.fixture.armToolChallenge('refresh');
		const turn = scenario.challengeTool('refresh-authorized');
		const auth = await turn.challenge;
		assert.deepStrictEqual({ reason: auth.reason, scopes: auth.requiredScopes, calls: scenario.fixture.calls }, { reason: McpAuthRequiredReason.Expired, scopes: ['fixture.read'], calls: [] });
		await scenario.authenticate(auth, replacementToken);
		await turn.completed;
		assertToolCallCompleteText(context.client, {
			channel: buildDefaultChatUri(scenario.sessionUri), turnId: 'refresh-authorized',
			toolNames: [`${serverName}-${toolName}`, toolName], expected: [/RUNTIME_MCP_AUTHORIZED:refresh-authorized/], success: true,
		});
		const toolAuth = context.client.receivedNotifications(notification => isActionNotification(notification, ActionType.ChatToolCallAuthRequired));
		const toolResolved = context.client.receivedNotifications(notification => isActionNotification(notification, ActionType.ChatToolCallAuthResolved));
		assert.deepStrictEqual({
			calls: scenario.fixture.calls, toolAuthCount: toolAuth.length, resolvedCount: toolResolved.length,
			retriedWithReplacement: scenario.fixture.requests.some(request => request.rpcMethod === 'tools/call' && request.credential === 'replacement' && !request.challenged),
		}, { calls: ['refresh-authorized'], toolAuthCount: 1, resolvedCount: 1, retriedWithReplacement: true });
	});

	authTest('requires the step-up challenge scopes rather than metadata supported scopes', {}, async scenario => {
		await authorize(scenario);
		scenario.fixture.armToolChallenge('upscope');
		const turn = scenario.challengeTool('step-up-authorized');
		const auth = await turn.challenge;
		assert.deepStrictEqual({
			reason: auth.reason, required: auth.requiredScopes,
			supported: auth.resource.scopes_supported, calls: scenario.fixture.calls,
		}, {
			reason: McpAuthRequiredReason.InsufficientScope, required: ['fixture.read', 'fixture.write'],
			supported: ['fixture.read', 'fixture.write', 'fixture.admin'], calls: [],
		});
		await assert.rejects(scenario.authenticate(auth, replacementToken, ['fixture.read']), {
			code: AHP_AUTH_REQUIRED,
			message: `Authentication failed for resource: ${auth.resource.resource}`,
		});
		await assert.rejects(scenario.authenticate(auth, replacementToken, ['fixture.write']), {
			code: AHP_AUTH_REQUIRED,
			message: `Authentication failed for resource: ${auth.resource.resource}`,
		});
		await scenario.authenticate(auth, replacementToken, ['fixture.read', 'fixture.write']);
		await turn.completed;
		assertToolCallCompleteText(context.client, {
			channel: buildDefaultChatUri(scenario.sessionUri), turnId: 'step-up-authorized',
			toolNames: [`${serverName}-${toolName}`, toolName], expected: [/RUNTIME_MCP_AUTHORIZED:step-up-authorized/], success: true,
		});
		assert.deepStrictEqual(scenario.fixture.calls, ['step-up-authorized']);
	});

	authTest('reuses its cached fixture credential after stopping and reconnecting the server', {}, async scenario => {
		await authorize(scenario);
		await scenario.call('cached-before');
		const server = await scenario.server();
		const challenges = scenario.fixture.requests.filter(request => request.challenged).length;
		context.client.dispatch({ channel: scenario.sessionUri, clientSeq: scenario.nextClientSeq(), action: { type: ActionType.SessionMcpServerStopRequested, id: server.id } });
		await retry(async () => assert.strictEqual((await scenario.server()).state.kind, McpServerStatus.Stopped), 100, 100);
		context.client.dispatch({ channel: scenario.sessionUri, clientSeq: scenario.nextClientSeq(), action: { type: ActionType.SessionMcpServerStartRequested, id: server.id } });
		await scenario.call('cached-after');
		assert.deepStrictEqual({
			calls: scenario.fixture.calls,
			additionalChallenges: scenario.fixture.requests.filter(request => request.challenged).length - challenges,
			reconnectedWithCachedCredential: scenario.fixture.requests.some(request => request.rpcMethod === 'initialize' && request.credential === 'initial' && !request.challenged),
		}, { calls: ['cached-before', 'cached-after'], additionalChallenges: 0, reconnectedWithCachedCredential: true });
	});
}
