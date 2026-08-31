/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CCAModel } from '@vscode/copilot-api';
import assert from 'assert';
import { PassThrough } from 'stream';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { INativeEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { AgentSession, type AgentSignal, type IAgentChatContext, type IAgentCreateChatOptions, type IAgentCreateChatResult, type IAgentMaterializeChatEvent } from '../../../common/agent.js';
import { buildChatUri, buildDefaultChatUri } from '../../../common/state/sessionState.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { CustomizationType, McpServerStatus } from '../../../common/state/protocol/channels-session/state.js';
import type { IAgentServerToolHost } from '../../../common/agentServerTools.js';
import { ISessionDataService, type ISessionDatabase } from '../../../common/sessionDataService.js';
import { IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE } from '../../../common/agentHostCheckpointService.js';
import { IAgentHostOTelService } from '../../../common/otel/agentHostOTelService.js';
import { AgentConfigurationService, IAgentConfigurationService } from '../../../node/agentConfigurationService.js';
import { IAgentHostWorktreeIsolation, NullAgentHostWorktreeIsolation } from '../../../node/shared/worktreeIsolation.js';
import { IAgentHostCustomizationEnablementService } from '../../../node/agentHostCustomizationEnablementService.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../../node/agentHostStateManager.js';
import { IAgentHostSessionTitleSignal } from '../../../node/agentHostSessionTitleSignal.js';
import { IAgentHostGitHubEndpointService } from '../../../node/agentHostGitHubEndpointService.js';
import { IAgentHostProxyResolver } from '../../../node/agentHostProxyResolver.js';
import { IAgentSdkDownloader } from '../../../node/agentSdkDownloader.js';
import { CodexAgent, toCodexModelSelectionId } from '../../../node/codex/codexAgent.js';
import { CodexAppServerClient, type ICodexAppServerTransport } from '../../../node/codex/codexAppServerClient.js';
import { ICodexProxyService } from '../../../node/codex/codexProxyService.js';
import { ICopilotApiService } from '../../../node/shared/copilotApiService.js';
import { createSessionDataService, TestSessionDatabase } from '../../common/sessionTestHelpers.js';
import { createTestGitHubEndpointService } from '../testGitHubEndpointService.js';
import { createNoopCustomizationEnablementService } from '../testCustomizationEnablementService.js';
import { createTestAgentHostProxyResolver } from '../agentServiceTestUtils.js';

const COPILOT_TEST_MODEL = toCodexModelSelectionId('vscode-proxy', 'gpt-test');

interface ITestWireRequest {
	readonly id: number;
	readonly method: string;
	readonly params: {
		readonly cwd?: string;
		readonly threadId?: string;
		readonly includeTurns?: boolean;
		readonly numTurns?: number;
		readonly input?: readonly { readonly type: string; readonly text?: string; readonly text_elements?: readonly object[] }[];
		readonly additionalContext?: Readonly<Record<string, { readonly kind: string; readonly value: string }>>;
		readonly dynamicTools?: readonly { readonly name: string }[];
	};
}

interface ITestPeer {
	readonly transport: ICodexAppServerTransport;
	readonly outbound: PassThrough;
	/** Extra disposables (e.g. request-handler registrations from `connectPeer`) released alongside the peer. */
	readonly disposables: DisposableStore;
	push(message: object): void;
	dispose(): void;
}

function createTestPeer(): ITestPeer {
	const stdin = new PassThrough();
	const stdout = new PassThrough();
	const onExit = new Emitter<{ readonly code: number | null; readonly signal: NodeJS.Signals | null }>();
	const disposables = new DisposableStore();
	const transport: ICodexAppServerTransport = {
		stdin,
		stdout,
		kill: () => true,
		onExit: onExit.event,
		onExitOnce: () => { },
	};
	return {
		transport,
		outbound: stdin,
		disposables,
		push: message => stdout.write(JSON.stringify(message) + '\n'),
		dispose: () => {
			disposables.dispose();
			onExit.dispose();
			stdin.destroy();
			stdout.destroy();
		},
	};
}

function readNextRequest(stream: PassThrough): Promise<ITestWireRequest> {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			cleanup();
			reject(new Error('Timed out waiting for Codex request'));
		}, 1_000);
		const onData = (chunk: Buffer | string) => {
			cleanup();
			try {
				resolve(JSON.parse(typeof chunk === 'string' ? chunk : chunk.toString('utf8')));
			} catch (err) {
				reject(err);
			}
		};
		const cleanup = () => {
			clearTimeout(timeout);
			stream.off('data', onData);
		};
		stream.once('data', onData);
	});
}

interface ICreateAgentOptions {
	/**
	 * Whether prewarm may proceed to a real `thread/start`. Defaults to
	 * `false` so fresh/import tests don't need a live connection; fork tests
	 * (which always need a connection for `thread/fork`) opt in.
	 */
	readonly sdkResolvableWithoutDownload?: boolean;
	/**
	 * Durable per-session storage shared across "processes". Supply the same
	 * store to two agents to model a host restart.
	 */
	readonly sessionStore?: ITestSessionStore;
	/**
	 * Override the OTel service stub. Lets a test observe/record the exact
	 * key a trace context is acquired and released under, instead of the
	 * default inert no-op.
	 */
	readonly otelService?: Pick<IAgentHostOTelService, 'getSessionTraceContext' | 'releaseSessionTraceContext'>;
}

/**
 * Per-session durable storage, keyed by session URI exactly like the real
 * service. Restore tests depend on this: a runtime's metadata overlay (its
 * codex thread id) is stored under the session URI it was persisted with, so a
 * blob that names the wrong id must not accidentally find someone else's
 * overlay.
 */
interface ITestSessionStore {
	readonly service: ISessionDataService;
	databaseFor(session: URI): TestSessionDatabase;
}

function createTestSessionStore(): ITestSessionStore {
	const databases = new Map<string, TestSessionDatabase>();
	const databaseFor = (session: URI): TestSessionDatabase => {
		const key = session.toString();
		let database = databases.get(key);
		if (!database) {
			database = new TestSessionDatabase();
			databases.set(key, database);
		}
		return database;
	};
	const base = createSessionDataService();
	return {
		databaseFor,
		service: {
			...base,
			openDatabase: session => createSessionDatabaseReference(databaseFor(session)),
			tryOpenDatabase: async session => createSessionDatabaseReference(databaseFor(session)),
		},
	};
}

function createSessionDatabaseReference(database: ISessionDatabase) {
	return { object: database, dispose: () => { } };
}

async function createAgent(disposables: Pick<DisposableStore, 'add'>, options: ICreateAgentOptions = {}): Promise<CodexAgent> {
	const models = [{ id: 'gpt-test', name: 'GPT Test', supported_endpoints: ['/responses'] }] as CCAModel[];
	const instantiationService = new TestInstantiationService();
	const logService = new NullLogService();
	const fileService = disposables.add(new FileService(logService));
	disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new InMemoryFileSystemProvider())));
	const stateManager = disposables.add(new AgentHostStateManager(logService));
	const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
	instantiationService.stub(IAgentHostStateManager, stateManager);
	instantiationService.stub(IAgentHostCustomizationEnablementService, createNoopCustomizationEnablementService());
	instantiationService.stub(ISessionDataService, options.sessionStore?.service ?? { _serviceBrand: undefined });
	instantiationService.stub(ICopilotApiService, { _serviceBrand: undefined, models: async () => models });
	instantiationService.stub(ICodexProxyService, { _serviceBrand: undefined });
	instantiationService.stub(IAgentConfigurationService, configurationService);
	instantiationService.stub(IAgentHostWorktreeIsolation, new NullAgentHostWorktreeIsolation());
	instantiationService.stub(IAgentHostGitHubEndpointService, createTestGitHubEndpointService());
	instantiationService.stub(IAgentHostProxyResolver, createTestAgentHostProxyResolver());
	instantiationService.stub(IAgentSdkDownloader, {
		_serviceBrand: undefined,
		onDidDownloadProgress: Event.None,
		acquireDownloadProgressInterest: () => toDisposable(() => { }),
		loadSdkRoot: async () => { throw new Error('test stub: downloader.loadSdkRoot should not be called'); },
		isAvailable: () => true,
		isSdkResolvableWithoutDownload: async () => options.sdkResolvableWithoutDownload ?? false,
	});
	instantiationService.stub(IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE);
	instantiationService.stub(IAgentHostOTelService, {
		_serviceBrand: undefined,
		getNativeSdkTelemetryConfig: async () => undefined,
		getSessionTraceContext: () => undefined,
		releaseSessionTraceContext: () => { },
		...options.otelService,
	});
	instantiationService.stub(IAgentHostSessionTitleSignal, { _serviceBrand: undefined, onDidChangeSessionTitle: Event.None });
	instantiationService.stub(IProductService, { _serviceBrand: undefined, version: '1.0.0-test' } as IProductService);
	instantiationService.stub(INativeEnvironmentService, { userHome: URI.file('/tmp') });
	instantiationService.stub(IFileService, fileService);
	instantiationService.stub(ILogService, logService);
	const agent = disposables.add(instantiationService.createInstance(CodexAgent));
	agent['_probeAccountAtStartup'] = async () => { };
	agent['_activated'] = true;
	agent['_refreshSkillHookCustomizations'] = async () => { };
	agent['_refreshSkillExtraRoots'] = async () => { };
	await agent.authenticate(agent.getProtectedResources()[0].resource, 'test-token');
	await agent.refreshModels();
	return agent;
}

/**
 * Create a session's first chat over the single {@link IAgentChats.createChat}
 * seam, with the fully resolved options Agent Host supplies. Providers never
 * echo session identity back, so the test carries the caller's own
 * `context.configurationResource` alongside the create result.
 */
async function createSessionBackedChat(agent: CodexAgent, chat: URI, context: IAgentChatContext, options: IAgentCreateChatOptions = {}): Promise<IAgentCreateChatResult & { readonly session: URI }> {
	const result = await agent.chats.createChat(chat, context, { deferBacking: !options.fork && !options.importConversation, ...options });
	return { ...result, session: context.configurationResource };
}

function connectPeer(agent: CodexAgent, peer: ITestPeer): void {
	const client = new CodexAppServerClient(peer.transport);
	// Mirrors the real `item/tool/call` wiring from `_startConnection` so
	// tests can simulate the codex app-server invoking a dynamic (server)
	// tool without needing the full connection bootstrap.
	peer.disposables.add(client.onRequest<'item/tool/call'>('item/tool/call', params => agent['_handleDynamicToolCallRpc'](params)));
	agent['_connection'] = {
		kind: 'ready',
		client,
		usageSource: 'github',
		child: { kill: () => true },
	} as never;
}

/**
 * Records which sessions the agent advertises the host's server tools on. Every
 * other member is inert: only {@link IAgentServerToolHost.advertise} is under
 * test.
 */
function createRecordingServerToolHost(advertised: string[]): IAgentServerToolHost {
	return {
		definitions: [],
		toolNames: [],
		advertise: session => advertised.push(session.toString()),
		getDefinitionsForSession: () => [],
		canRequireConfirmation: () => false,
		requiresConfirmation: () => false,
		executeTool: () => '',
	};
}

/** A server-tool host whose `advertise` always throws, to exercise the create-failure rollback at the advertise seam. */
function createThrowingAdvertiseServerToolHost(message: string): IAgentServerToolHost {
	return {
		definitions: [],
		toolNames: [],
		advertise: () => { throw new Error(message); },
		getDefinitionsForSession: () => [],
		canRequireConfirmation: () => false,
		requiresConfirmation: () => false,
		executeTool: () => '',
	};
}

const PEER_TEST_TOOL_NAME = 'peer_test_tool';

/**
 * Records the exact chat channel Codex hands the server-tool host for a single
 * server tool ({@link PEER_TEST_TOOL_NAME}).
 */
function createRecordingChatServerToolHost(calls: { readonly method: 'requiresConfirmation' | 'executeTool'; readonly chatUri: string }[]): IAgentServerToolHost {
	return {
		definitions: [{ name: PEER_TEST_TOOL_NAME, description: 'test', inputSchema: { type: 'object' } }],
		toolNames: [PEER_TEST_TOOL_NAME],
		advertise: () => { },
		getDefinitionsForSession: () => [{ name: PEER_TEST_TOOL_NAME, description: 'test', inputSchema: { type: 'object' } }],
		canRequireConfirmation: () => false,
		requiresConfirmation: (chatUri, toolName) => {
			calls.push({ method: 'requiresConfirmation', chatUri: chatUri.toString() });
			return false;
		},
		executeTool: (chatUri, _toolName, _rawArgs) => {
			calls.push({ method: 'executeTool', chatUri: chatUri.toString() });
			return 'tool result';
		},
	};
}

/** Reads the next raw JSON-RPC message (request or response) written to `stream`. */
function readNextMessage(stream: PassThrough): Promise<{ readonly id?: number; readonly result?: { readonly contentItems?: readonly { readonly type: string; readonly text: string }[]; readonly success?: boolean }; readonly error?: unknown }> {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			cleanup();
			reject(new Error('Timed out waiting for Codex message'));
		}, 1_000);
		const onData = (chunk: Buffer | string) => {
			cleanup();
			try {
				resolve(JSON.parse(typeof chunk === 'string' ? chunk : chunk.toString('utf8')));
			} catch (err) {
				reject(err);
			}
		};
		const cleanup = () => {
			clearTimeout(timeout);
			stream.off('data', onData);
		};
		stream.once('data', onData);
	});
}

suite('CodexAgent createChat', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('advertises chat fork and side-chat support', async () => {
		const agent = await createAgent(disposables);

		assert.deepStrictEqual(agent.getDescriptor().capabilities?.multipleChats, { fork: true, sideChat: true });
	});

	test('fresh: binds the exact target chat during creation, never leaving the runtime unbound', async () => {
		const agent = await createAgent(disposables);
		const sessionUri = AgentSession.uri('codex', 'session-fresh');
		const chat = URI.parse(buildDefaultChatUri(sessionUri));
		const folder = URI.file('/repo/fresh');

		const created = await createSessionBackedChat(agent, chat, { configurationResource: sessionUri, resource: chat }, {
			workingDirectories: [folder],
			model: { id: COPILOT_TEST_MODEL },
		});

		assert.deepStrictEqual({
			session: created.session.toString(),
			provisional: created.provisional,
			resolvedWorkingDirectory: created.resolvedWorkingDirectory?.toString(),
			boundSessionId: agent['_sessionIdByChatUri'].get(chat.toString()),
			chatChannel: agent['_sessions'].get('session-fresh')?.chatChannel?.toString(),
		}, {
			session: sessionUri.toString(),
			provisional: true,
			resolvedWorkingDirectory: folder.toString(),
			boundSessionId: 'session-fresh',
			chatChannel: chat.toString(),
		});
	});

	test('legacy default restore recovers and returns the historical session-id backing', async () => {
		const agent = await createAgent(disposables);
		const session = AgentSession.uri('codex', 'legacy-session');
		const chat = URI.parse(buildDefaultChatUri(session));
		await createSessionBackedChat(agent, chat, { configurationResource: session, resource: chat }, {
			workingDirectories: [URI.file('/repo/legacy')],
			model: { id: COPILOT_TEST_MODEL },
		});
		agent['_sessionIdByChatUri'].delete(chat.toString());
		agent['_sessions'].get('legacy-session')!.chatChannel = undefined;

		const recovered = await agent.recoverLegacyChat(chat, { configurationResource: session, resource: chat });

		assert.deepStrictEqual({
			providerData: recovered?.providerData ? JSON.parse(recovered.providerData) : undefined,
			boundSessionId: agent['_sessionIdByChatUri'].get(chat.toString()),
			chatChannel: agent['_sessions'].get('legacy-session')?.chatChannel?.toString(),
		}, {
			providerData: { sessionId: 'legacy-session' },
			boundSessionId: 'legacy-session',
			chatChannel: chat.toString(),
		});
	});

	test('fresh: a rebind (same session id, new createChat call) binds directly as part of creation', async () => {
		const agent = await createAgent(disposables);
		const sessionUri = AgentSession.uri('codex', 'session-rebind');
		const chat = URI.parse(buildDefaultChatUri(sessionUri));
		const folder = URI.file('/repo/rebind');

		await createSessionBackedChat(agent, chat, { configurationResource: sessionUri, resource: chat }, {
			workingDirectories: [folder],
		});

		// Workbench rebind: a second createChat for the same session id,
		// e.g. after a chip-selection change re-mints the request. Model
		// changes here, so the reconnect ("existing") branch runs.
		const rebound = await createSessionBackedChat(agent, chat, { configurationResource: sessionUri, resource: chat }, {
			workingDirectories: [folder],
			model: { id: COPILOT_TEST_MODEL },
		});

		assert.deepStrictEqual({
			provisional: rebound.provisional,
			boundSessionId: agent['_sessionIdByChatUri'].get(chat.toString()),
			chatChannel: agent['_sessions'].get('session-rebind')?.chatChannel?.toString(),
		}, {
			provisional: true,
			boundSessionId: 'session-rebind',
			chatChannel: chat.toString(),
		});
	});

	test('concurrent creates for the same chat share the first backing', async () => {
		const agent = await createAgent(disposables);
		const sessionUri = AgentSession.uri('codex', 'session-concurrent-create');
		const chat = URI.parse(buildDefaultChatUri(sessionUri));
		const folder = URI.file('/repo/concurrent-create');
		const catalog = agent['_models'].get();
		agent['_models'].set([], undefined);

		const refreshStarted = new DeferredPromise<void>();
		const releaseRefresh = new DeferredPromise<void>();
		const originalRefreshModels = agent.refreshModels.bind(agent);
		const originalStartChatBacking = agent['_startChatBacking'].bind(agent);
		agent.refreshModels = async () => {
			await refreshStarted.complete(undefined);
			await releaseRefresh.p;
			agent['_models'].set(catalog, undefined);
		};
		agent['_startChatBacking'] = async () => {
			throw new Error('duplicate create tried to mint another backing');
		};

		try {
			const first = agent.chats.createChat(chat, { configurationResource: sessionUri, resource: chat }, {
				workingDirectories: [folder],
			});
			const second = agent.chats.createChat(chat, { configurationResource: sessionUri, resource: chat }, {
				workingDirectories: [folder],
			});
			await refreshStarted.p;
			await releaseRefresh.complete(undefined);

			const results = await Promise.all([first, second]);
			assert.deepStrictEqual({
				sessionCount: agent['_sessions'].size,
				boundSessionId: agent['_sessionIdByChatUri'].get(chat.toString()),
				providerData: results.map(result => result?.providerData && JSON.parse(result.providerData)),
			}, {
				sessionCount: 1,
				boundSessionId: AgentSession.id(sessionUri),
				providerData: [{ sessionId: AgentSession.id(sessionUri), model: { id: COPILOT_TEST_MODEL } }, { sessionId: AgentSession.id(sessionUri), model: { id: COPILOT_TEST_MODEL } }],
			});
		} finally {
			agent.refreshModels = originalRefreshModels;
			agent['_startChatBacking'] = originalStartChatBacking;
		}
	});

	test('dispose waits for an in-flight create of the same chat', async () => {
		const agent = await createAgent(disposables);
		const sessionUri = AgentSession.uri('codex', 'session-create-dispose-race');
		const chat = URI.parse(buildDefaultChatUri(sessionUri));
		const catalog = agent['_models'].get();
		agent['_models'].set([], undefined);
		const refreshStarted = new DeferredPromise<void>();
		const releaseRefresh = new DeferredPromise<void>();
		const originalRefreshModels = agent.refreshModels.bind(agent);
		agent.refreshModels = async () => {
			await refreshStarted.complete(undefined);
			await releaseRefresh.p;
			agent['_models'].set(catalog, undefined);
		};

		try {
			const create = agent.chats.createChat(chat, { configurationResource: sessionUri, resource: chat }, {
				workingDirectories: [URI.file('/repo/create-dispose-race')],
			});
			await refreshStarted.p;
			const dispose = agent.chats.disposeChat(chat, { configurationResource: sessionUri, resource: chat });
			await releaseRefresh.complete(undefined);
			await Promise.all([create, dispose]);

			assert.deepStrictEqual({
				sessionCount: agent['_sessions'].size,
				boundSessionId: agent['_sessionIdByChatUri'].get(chat.toString()),
				trackedScope: agent['_configScopeByChat'].get(chat.toString()),
			}, {
				sessionCount: 0,
				boundSessionId: undefined,
				trackedScope: undefined,
			});
		} finally {
			agent.refreshModels = originalRefreshModels;
		}
	});

	test('rebind moves a chat between configuration scopes without leaking the old scope', async () => {
		const agent = await createAgent(disposables);
		const originalScope = AgentSession.uri('codex', 'scope-original');
		const replacementScope = AgentSession.uri('codex', 'scope-replacement');
		const chat = URI.parse(buildDefaultChatUri(originalScope));
		const folder = URI.file('/repo/rebind-scope');
		const advertised: string[] = [];
		agent.setServerToolHost(createRecordingServerToolHost(advertised));

		await createSessionBackedChat(agent, chat, { configurationResource: originalScope, resource: chat }, {
			workingDirectories: [folder],
		});
		await agent.chats.createChat(chat, { configurationResource: replacementScope, resource: chat }, {
			workingDirectories: [folder],
		});
		await agent.chats.disposeChat(chat, { configurationResource: replacementScope, resource: chat });

		assert.deepStrictEqual({
			trackedScopes: [...agent['_configScopeChats'].keys()],
			trackedChatScope: agent['_configScopeByChat'].get(chat.toString()),
			advertised,
		}, {
			trackedScopes: [],
			trackedChatScope: undefined,
			advertised: [originalScope.toString(), replacementScope.toString()],
		});
	});

	test('a failed rebind preserves the existing runtime and configuration scope', async () => {
		const agent = await createAgent(disposables);
		const originalScope = AgentSession.uri('codex', 'rebind-failure-original');
		const replacementScope = AgentSession.uri('codex', 'rebind-failure-replacement');
		const chat = URI.parse(buildDefaultChatUri(originalScope));
		const folder = URI.file('/repo/rebind-failure');
		await createSessionBackedChat(agent, chat, { configurationResource: originalScope, resource: chat }, {
			workingDirectories: [folder],
		});
		const entry = agent['_sessions'].get(AgentSession.id(originalScope))!;
		// Make the requested model a real provisional change. The test catalog's
		// only model is also the default selected by the initial creation.
		entry.model = undefined;
		const originalSync = agent['_syncClientCustomizations'].bind(agent);
		agent['_syncClientCustomizations'] = async () => { throw new Error('rebind sync failed'); };
		try {
			await assert.rejects(agent.chats.createChat(chat, { configurationResource: replacementScope, resource: chat }, {
				workingDirectories: [folder],
				model: { id: COPILOT_TEST_MODEL },
				activeClient: { clientId: 'rebind-client', tools: [], customizations: [] },
			}), /rebind sync failed/);
		} finally {
			agent['_syncClientCustomizations'] = originalSync;
		}

		assert.deepStrictEqual({
			model: entry.model,
			configurationResource: entry.configurationResource.toString(),
			trackedScope: agent['_configScopeByChat'].get(chat.toString()),
			boundSession: agent['_sessionIdByChatUri'].get(chat.toString()),
			hasFailedHandle: agent['_activeClientHandles'].has(`${chat.toString()}\u0000rebind-client`),
		}, {
			model: undefined,
			configurationResource: originalScope.toString(),
			trackedScope: originalScope.toString(),
			boundSession: AgentSession.id(originalScope),
			hasFailedHandle: false,
		});
	});

	test('importConversation: explicitly rejects instead of silently creating an empty fresh session', async () => {
		const agent = await createAgent(disposables);
		const sessionUri = AgentSession.uri('codex', 'session-import');
		const chat = URI.parse(buildDefaultChatUri(sessionUri));

		await assert.rejects(
			createSessionBackedChat(agent, chat, { configurationResource: sessionUri, resource: chat }, {
				workingDirectories: [URI.file('/repo/import')],
				importConversation: { turns: [] },
			}),
			/does not support importing/,
		);

		assert.deepStrictEqual({
			hasSession: agent['_sessions'].has('session-import'),
			hasBinding: agent['_sessionIdByChatUri'].has(chat.toString()),
			// The config-scope ref this call registered before rejecting must
			// be rolled back too, or a retried create piles a second ref onto
			// a scope that already thinks this chat is live.
			hasConfigScopeRef: agent['_configScopeChats'].has(sessionUri.toString()),
			hasConfigScopeBinding: agent['_configScopeByChat'].has(chat.toString()),
		}, {
			hasSession: false,
			hasBinding: false,
			hasConfigScopeRef: false,
			hasConfigScopeBinding: false,
		});
	});

	test('createChat is transactional: a failure at any seam after the config-scope ref is registered rolls back cleanly, so a retried create starts from scratch', async () => {
		// No connection needed: every failure below is reached before (or without ever
		// requiring) `thread/start`, and prewarm bails out immediately since the default
		// SDK-resolvable stub is `false`.
		const agent = await createAgent(disposables);

		// --- model seam: an explicit but unsupported model rejects before any runtime is registered ---
		{
			const sessionUri = AgentSession.uri('codex', 'session-fail-model');
			const chat = URI.parse(buildDefaultChatUri(sessionUri));
			const context = { configurationResource: sessionUri, resource: chat };
			await assert.rejects(
				createSessionBackedChat(agent, chat, context, {
					workingDirectories: [URI.file('/repo/fail-model')],
					model: { id: 'not-a-real-model' },
				}),
				/not available/,
			);
			assert.deepStrictEqual({
				hasSession: agent['_sessions'].has('session-fail-model'),
				hasBinding: agent['_sessionIdByChatUri'].has(chat.toString()),
				hasConfigScopeRef: agent['_configScopeChats'].has(sessionUri.toString()),
			}, { hasSession: false, hasBinding: false, hasConfigScopeRef: false });

			// A retried create for the exact same chat must succeed cleanly,
			// proving the failed attempt left no half-registered state behind.
			const retried = await createSessionBackedChat(agent, chat, context, {
				workingDirectories: [URI.file('/repo/fail-model')],
			});
			assert.strictEqual(retried.provisional, true);
			assert.strictEqual(agent['_sessionIdByChatUri'].get(chat.toString()), 'session-fail-model');
		}

		// --- fork seam: an unresolvable fork source rejects before any runtime is registered ---
		{
			const sessionUri = AgentSession.uri('codex', 'session-fail-fork');
			const chat = URI.parse(buildDefaultChatUri(sessionUri));
			const context = { configurationResource: sessionUri, resource: chat };
			await assert.rejects(
				createSessionBackedChat(agent, chat, context, {
					fork: { source: URI.parse('codex:/never-created-chat'), turnId: 'turn-1', turnIndex: 0 },
				}),
				/backing thread could not be resolved/,
			);
			assert.deepStrictEqual({
				hasSession: agent['_sessions'].has('session-fail-fork'),
				hasBinding: agent['_sessionIdByChatUri'].has(chat.toString()),
				hasConfigScopeRef: agent['_configScopeChats'].has(sessionUri.toString()),
			}, { hasSession: false, hasBinding: false, hasConfigScopeRef: false });
		}

		// --- eager-active-client seam: a runtime is registered, then the eager client seed fails ---
		{
			const sessionUri = AgentSession.uri('codex', 'session-fail-client');
			const chat = URI.parse(buildDefaultChatUri(sessionUri));
			const context = { configurationResource: sessionUri, resource: chat };
			const originalSync = agent['_syncClientCustomizations'].bind(agent);
			agent['_syncClientCustomizations'] = async () => { throw new Error('client sync boom'); };
			try {
				await assert.rejects(
					createSessionBackedChat(agent, chat, context, {
						workingDirectories: [URI.file('/repo/fail-client')],
						activeClient: { clientId: 'client-fail', tools: [], customizations: [] },
					}),
					/client sync boom/,
				);
			} finally {
				agent['_syncClientCustomizations'] = originalSync;
			}
			assert.deepStrictEqual({
				hasSession: agent['_sessions'].has('session-fail-client'),
				hasBinding: agent['_sessionIdByChatUri'].has(chat.toString()),
				hasConfigScopeRef: agent['_configScopeChats'].has(sessionUri.toString()),
				hasActiveClientHandle: agent['_activeClientHandles'].has(`${chat.toString()}\u0000client-fail`),
			}, { hasSession: false, hasBinding: false, hasConfigScopeRef: false, hasActiveClientHandle: false });
		}

		// --- advertise seam: a runtime is registered, then the host's server-tool advertise throws ---
		{
			agent.setServerToolHost(createThrowingAdvertiseServerToolHost('advertise boom'));
			try {
				const sessionUri = AgentSession.uri('codex', 'session-fail-advertise');
				const chat = URI.parse(buildDefaultChatUri(sessionUri));
				const context = { configurationResource: sessionUri, resource: chat };
				await assert.rejects(
					createSessionBackedChat(agent, chat, context, {
						workingDirectories: [URI.file('/repo/fail-advertise')],
					}),
					/advertise boom/,
				);
				assert.deepStrictEqual({
					hasSession: agent['_sessions'].has('session-fail-advertise'),
					hasBinding: agent['_sessionIdByChatUri'].has(chat.toString()),
					hasConfigScopeRef: agent['_configScopeChats'].has(sessionUri.toString()),
				}, { hasSession: false, hasBinding: false, hasConfigScopeRef: false });
			} finally {
				agent.setServerToolHost(createRecordingServerToolHost([]));
			}
		}
	});

	test('failed eager chat creation archives the thread it minted before releasing it', async () => {
		const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true });
		const peer = disposables.add(createTestPeer());
		connectPeer(agent, peer);

		try {
			const sessionUri = AgentSession.uri('codex', 'session-failed-eager-backing');
			const sessionChat = URI.parse(buildDefaultChatUri(sessionUri));
			const peerChat = URI.parse(buildChatUri(sessionUri, 'failed-eager'));
			const folder = URI.file('/repo/failed-eager-backing');
			await createSessionBackedChat(agent, sessionChat, { configurationResource: sessionUri, resource: sessionChat }, {
				workingDirectories: [folder],
				model: { id: COPILOT_TEST_MODEL },
			});
			const sessionStart = await readNextRequest(peer.outbound);
			peer.push({ id: sessionStart.id, result: { thread: { id: 'owning-thread', cwd: folder.fsPath } } });
			await agent['_sessions'].get('session-failed-eager-backing')!.materializePromise;

			const originalSync = agent['_syncClientCustomizations'].bind(agent);
			agent['_syncClientCustomizations'] = async () => { throw new Error('eager client sync failed'); };
			try {
				const creating = agent.chats.createChat(peerChat, { configurationResource: sessionUri, resource: peerChat }, {
					workingDirectories: [folder],
					model: { id: COPILOT_TEST_MODEL },
					activeClient: { clientId: 'client-failed-eager', tools: [], customizations: [] },
				});
				const peerStart = await readNextRequest(peer.outbound);
				peer.push({ id: peerStart.id, result: { thread: { id: 'orphaned-thread', cwd: folder.fsPath } } });

				const firstCleanup = await readNextRequest(peer.outbound);
				peer.push({ id: firstCleanup.id, result: {} });
				let secondCleanup: ITestWireRequest | undefined;
				if (firstCleanup.method === 'thread/archive') {
					secondCleanup = await readNextRequest(peer.outbound);
					peer.push({ id: secondCleanup.id, result: {} });
				}
				await assert.rejects(creating, /eager client sync failed/);

				assert.deepStrictEqual({
					start: { method: peerStart.method, cwd: peerStart.params.cwd },
					firstCleanup: { method: firstCleanup.method, threadId: firstCleanup.params.threadId },
					secondCleanup: secondCleanup && { method: secondCleanup.method, threadId: secondCleanup.params.threadId },
					hasRuntime: agent['_sessions'].has('orphaned-thread'),
					hasBinding: agent['_sessionIdByChatUri'].has(peerChat.toString()),
				}, {
					start: { method: 'thread/start', cwd: folder.fsPath },
					firstCleanup: { method: 'thread/archive', threadId: 'orphaned-thread' },
					secondCleanup: { method: 'thread/unsubscribe', threadId: 'orphaned-thread' },
					hasRuntime: false,
					hasBinding: false,
				});
			} finally {
				agent['_syncClientCustomizations'] = originalSync;
			}
		} finally {
			peer.dispose();
		}
	});

	test('failed eager chat creation archives its minted thread after the app-server connection is replaced', async () => {
		const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true });
		const peer = disposables.add(createTestPeer());
		connectPeer(agent, peer);

		try {
			const sessionUri = AgentSession.uri('codex', 'session-failed-eager-reconnect');
			const sessionChat = URI.parse(buildDefaultChatUri(sessionUri));
			const peerChat = URI.parse(buildChatUri(sessionUri, 'failed-eager-reconnect'));
			const folder = URI.file('/repo/failed-eager-reconnect');
			await createSessionBackedChat(agent, sessionChat, { configurationResource: sessionUri, resource: sessionChat }, {
				workingDirectories: [folder],
				model: { id: COPILOT_TEST_MODEL },
			});
			const sessionStart = await readNextRequest(peer.outbound);
			peer.push({ id: sessionStart.id, result: { thread: { id: 'owning-reconnect-thread', cwd: folder.fsPath } } });
			await agent['_sessions'].get('session-failed-eager-reconnect')!.materializePromise;

			const replacementRequests: Array<{ readonly method: string; readonly threadId?: string }> = [];
			const replacement = {
				kind: 'ready',
				client: {
					request: async (method: string, params: { readonly threadId?: string }) => {
						replacementRequests.push({ method, threadId: params.threadId });
						return {};
					},
				},
				proxyHandle: { dispose() { } },
				child: { kill: () => true },
			};
			const originalEnsureConnection = agent['_ensureConnection'].bind(agent);
			const originalSync = agent['_syncClientCustomizations'].bind(agent);
			agent['_ensureConnection'] = async () => {
				if (agent['_connection'].kind === 'idle') {
					agent['_connection'] = replacement as never;
					return replacement as never;
				}
				return originalEnsureConnection();
			};
			agent['_syncClientCustomizations'] = async () => {
				const lost = agent['_connection'];
				assert.strictEqual(lost.kind, 'ready');
				agent['_handleConnectionLost'](lost as never, agent['_connectionGeneration']);
				throw new Error('eager client sync failed after disconnect');
			};
			try {
				const creating = agent.chats.createChat(peerChat, { configurationResource: sessionUri, resource: peerChat }, {
					workingDirectories: [folder],
					model: { id: COPILOT_TEST_MODEL },
					activeClient: { clientId: 'client-failed-eager-reconnect', tools: [], customizations: [] },
				});
				const peerStart = await readNextRequest(peer.outbound);
				peer.push({ id: peerStart.id, result: { thread: { id: 'orphaned-reconnect-thread', cwd: folder.fsPath } } });

				await assert.rejects(creating, /eager client sync failed after disconnect/);

				assert.deepStrictEqual({
					replacementRequests,
					hasRuntime: agent['_sessions'].has('orphaned-reconnect-thread'),
					hasBinding: agent['_sessionIdByChatUri'].has(peerChat.toString()),
				}, {
					replacementRequests: [
						{ method: 'thread/archive', threadId: 'orphaned-reconnect-thread' },
						{ method: 'thread/unsubscribe', threadId: 'orphaned-reconnect-thread' },
					],
					hasRuntime: false,
					hasBinding: false,
				});
			} finally {
				agent['_ensureConnection'] = originalEnsureConnection;
				agent['_syncClientCustomizations'] = originalSync;
			}
		} finally {
			peer.dispose();
		}
	});

	test('fork: preserves the exact source thread and binds the forked session directly to the target chat', async () => {
		const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true });
		const peer = disposables.add(createTestPeer());
		connectPeer(agent, peer);

		try {
			const sourceSessionUri = AgentSession.uri('codex', 'session-source');
			const sourceChat = URI.parse(buildDefaultChatUri(sourceSessionUri));
			const folder = URI.file('/repo/source');
			await createSessionBackedChat(agent, sourceChat, { configurationResource: sourceSessionUri, resource: sourceChat }, {
				workingDirectories: [folder],
				model: { id: COPILOT_TEST_MODEL },
			});
			const sourceEntry = agent['_sessions'].get('session-source')!;
			const start = await readNextRequest(peer.outbound);
			peer.push({ id: start.id, result: { thread: { id: 'source-thread', cwd: folder.fsPath } } });
			await sourceEntry.materializePromise;

			const forkSessionUri = AgentSession.uri('codex', 'session-fork-target');
			const forkChat = URI.parse(buildDefaultChatUri(forkSessionUri));
			const forking = createSessionBackedChat(agent, forkChat, { configurationResource: forkSessionUri, resource: forkChat }, {
				fork: { source: sourceChat, turnId: 'turn-1', turnIndex: 0 },
			});

			const read = await readNextRequest(peer.outbound);
			assert.strictEqual(read.method, 'thread/read');
			assert.strictEqual(read.params.threadId, 'source-thread');
			assert.strictEqual(read.params.includeTurns, true);
			peer.push({
				id: read.id,
				result: { thread: { id: 'source-thread', cwd: folder.fsPath, turns: [{ id: 'turn-1' }] } },
			});

			const fork = await readNextRequest(peer.outbound);
			assert.strictEqual(fork.method, 'thread/fork');
			assert.strictEqual(fork.params.threadId, 'source-thread');
			peer.push({
				id: fork.id,
				result: { thread: { id: 'forked-thread', cwd: folder.fsPath }, cwd: folder.fsPath },
			});

			const forked = await forking;
			const newThreadId = 'forked-thread';
			const forkInventory = await readNextRequest(peer.outbound);
			assert.strictEqual(forkInventory.method, 'mcpServerStatus/list');
			assert.strictEqual(forkInventory.params.threadId, newThreadId);
			peer.push({ id: forkInventory.id, result: { data: [], nextCursor: null } });

			assert.deepStrictEqual({
				provisional: forked.provisional,
				// The fork stands the owning session's runtime up, so it adopts
				// that session's identity and reports the forked thread as the
				// exact backing — the host keeps addressing the session by the
				// URI it minted.
				session: forked.session.toString(),
				backingSession: forked.backingSession?.toString(),
				// The exact-chat binding must already be in place by the time the
				// caller observes the result — creation is the only binding seam.
				boundSessionId: agent['_sessionIdByChatUri'].get(forkChat.toString()),
				threadId: agent['_sessions'].get('session-fork-target')?.threadId,
				chatChannel: agent['_sessions'].get('session-fork-target')?.chatChannel?.toString(),
			}, {
				provisional: undefined,
				session: forkSessionUri.toString(),
				backingSession: AgentSession.uri('codex', newThreadId).toString(),
				boundSessionId: 'session-fork-target',
				threadId: newThreadId,
				chatChannel: forkChat.toString(),
			});

			// Exact chat binding is directly usable: sending on the forked chat
			// resolves through the binding creation recorded.
			const sending = agent.chats.sendMessage(forkChat, 'hello', undefined, undefined, 'turn-2');
			const unsubscribe = await readNextRequest(peer.outbound);
			assert.strictEqual(unsubscribe.method, 'thread/unsubscribe');
			assert.strictEqual(unsubscribe.params.threadId, newThreadId);
			peer.push({ id: unsubscribe.id, result: {} });
			const resume = await readNextRequest(peer.outbound);
			assert.strictEqual(resume.method, 'thread/resume');
			assert.strictEqual(resume.params.threadId, newThreadId);
			peer.push({ id: resume.id, result: { thread: { id: newThreadId, cwd: folder.fsPath }, cwd: folder.fsPath } });
			const resumeInventory = await readNextRequest(peer.outbound);
			assert.strictEqual(resumeInventory.method, 'mcpServerStatus/list');
			assert.strictEqual(resumeInventory.params.threadId, newThreadId);
			peer.push({ id: resumeInventory.id, result: { data: [], nextCursor: null } });
			const turn = await readNextRequest(peer.outbound);
			peer.push({ id: turn.id, result: {} });
			await sending;
		} finally {
			peer.dispose();
		}
	});

	test('fork resumes a source from a replacement app-server before reading or forking it', async () => {
		const agent = await createAgent(disposables);
		const peer = disposables.add(createTestPeer());
		connectPeer(agent, peer);

		try {
			const sourceSession = AgentSession.uri('codex', 'resume-before-fork-source');
			const sourceChat = URI.parse(buildDefaultChatUri(sourceSession));
			const targetSession = AgentSession.uri('codex', 'resume-before-fork-target');
			const targetChat = URI.parse(buildDefaultChatUri(targetSession));
			const folder = URI.file('/repo/resume-before-fork');
			await createSessionBackedChat(agent, sourceChat, { configurationResource: sourceSession, resource: sourceChat }, {
				workingDirectories: [folder],
				model: { id: COPILOT_TEST_MODEL },
			});
			const sourceEntry = agent['_sessions'].get(AgentSession.id(sourceSession))!;
			sourceEntry.threadId = 'resume-before-fork-thread';
			sourceEntry.needsResume = true;
			agent['_sessionIdByThreadId'].set(sourceEntry.threadId, sourceEntry.sessionId);

			const forking = createSessionBackedChat(agent, targetChat, { configurationResource: targetSession, resource: targetChat }, {
				fork: { source: sourceChat, turnId: 'source-turn', turnIndex: 0 },
			});
			const resume = await readNextRequest(peer.outbound);
			peer.push({ id: resume.id, result: { thread: { id: sourceEntry.threadId, cwd: folder.fsPath }, cwd: folder.fsPath } });
			const resumeInventory = await readNextRequest(peer.outbound);
			peer.push({ id: resumeInventory.id, result: { data: [], nextCursor: null } });
			const read = await readNextRequest(peer.outbound);
			peer.push({ id: read.id, result: { thread: { id: sourceEntry.threadId, cwd: folder.fsPath, turns: [{ id: 'source-turn' }] } } });
			const fork = await readNextRequest(peer.outbound);
			peer.push({ id: fork.id, result: { thread: { id: 'resumed-fork-thread', cwd: folder.fsPath }, cwd: folder.fsPath } });
			await forking;
			const forkInventory = await readNextRequest(peer.outbound);
			peer.push({ id: forkInventory.id, result: { data: [], nextCursor: null } });

			assert.deepStrictEqual([
				{ method: resume.method, threadId: resume.params.threadId },
				{ method: resumeInventory.method, threadId: resumeInventory.params.threadId },
				{ method: read.method, threadId: read.params.threadId },
				{ method: fork.method, threadId: fork.params.threadId },
			], [
				{ method: 'thread/resume', threadId: 'resume-before-fork-thread' },
				{ method: 'mcpServerStatus/list', threadId: 'resume-before-fork-thread' },
				{ method: 'thread/read', threadId: 'resume-before-fork-thread' },
				{ method: 'thread/fork', threadId: 'resume-before-fork-thread' },
			]);
		} finally {
			peer.dispose();
		}
	});

	test('fork resumes again when the app-server is replaced after the source read', async () => {
		const agent = await createAgent(disposables);
		const firstPeer = disposables.add(createTestPeer());
		const secondPeer = disposables.add(createTestPeer());
		connectPeer(agent, firstPeer);

		try {
			const sourceSession = AgentSession.uri('codex', 'replace-after-read-source');
			const sourceChat = URI.parse(buildDefaultChatUri(sourceSession));
			const targetSession = AgentSession.uri('codex', 'replace-after-read-target');
			const targetChat = URI.parse(buildDefaultChatUri(targetSession));
			const folder = URI.file('/repo/replace-after-read');
			await createSessionBackedChat(agent, sourceChat, { configurationResource: sourceSession, resource: sourceChat }, {
				workingDirectories: [folder],
				model: { id: COPILOT_TEST_MODEL },
			});
			const sourceEntry = agent['_sessions'].get(AgentSession.id(sourceSession))!;
			sourceEntry.threadId = 'replace-after-read-thread';
			sourceEntry.needsResume = false;
			agent['_sessionIdByThreadId'].set(sourceEntry.threadId, sourceEntry.sessionId);

			const forking = createSessionBackedChat(agent, targetChat, { configurationResource: targetSession, resource: targetChat }, {
				fork: { source: sourceChat, turnId: 'source-turn', turnIndex: 0 },
			});
			const read = await readNextRequest(firstPeer.outbound);
			assert.strictEqual(read.method, 'thread/read');
			firstPeer.push({ id: read.id, result: { thread: { id: sourceEntry.threadId, cwd: folder.fsPath, turns: [{ id: 'source-turn' }] } } });

			// Replace the process in the response-to-next-request gap. The fork must
			// not be sent to the new process until its source thread is resumed there.
			const lostConnection = agent['_connection'];
			assert.strictEqual(lostConnection.kind, 'ready');
			agent['_handleConnectionLost'](lostConnection as never, agent['_connectionGeneration']);
			connectPeer(agent, secondPeer);

			const resume = await readNextRequest(secondPeer.outbound);
			assert.strictEqual(resume.method, 'thread/resume');
			secondPeer.push({ id: resume.id, result: { thread: { id: sourceEntry.threadId, cwd: folder.fsPath }, cwd: folder.fsPath } });
			const resumeInventory = await readNextRequest(secondPeer.outbound);
			secondPeer.push({ id: resumeInventory.id, result: { data: [], nextCursor: null } });
			const retriedRead = await readNextRequest(secondPeer.outbound);
			assert.strictEqual(retriedRead.method, 'thread/read');
			secondPeer.push({ id: retriedRead.id, result: { thread: { id: sourceEntry.threadId, cwd: folder.fsPath, turns: [{ id: 'source-turn' }] } } });
			const fork = await readNextRequest(secondPeer.outbound);
			secondPeer.push({ id: fork.id, result: { thread: { id: 'replace-after-read-fork', cwd: folder.fsPath }, cwd: folder.fsPath } });
			await forking;
			const forkInventory = await readNextRequest(secondPeer.outbound);
			secondPeer.push({ id: forkInventory.id, result: { data: [], nextCursor: null } });

			assert.deepStrictEqual([
				{ method: read.method, threadId: read.params.threadId },
				{ method: resume.method, threadId: resume.params.threadId },
				{ method: retriedRead.method, threadId: retriedRead.params.threadId },
				{ method: fork.method, threadId: fork.params.threadId },
			], [
				{ method: 'thread/read', threadId: 'replace-after-read-thread' },
				{ method: 'thread/resume', threadId: 'replace-after-read-thread' },
				{ method: 'thread/read', threadId: 'replace-after-read-thread' },
				{ method: 'thread/fork', threadId: 'replace-after-read-thread' },
			]);
		} finally {
			firstPeer.dispose();
			secondPeer.dispose();
		}
	});

	test('an additional chat mints a backing thread of its own, and re-creating it never mints a second', async () => {
		const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true });
		const peer = disposables.add(createTestPeer());
		connectPeer(agent, peer);

		try {
			const sessionUri = AgentSession.uri('codex', 'session-additional');
			const sessionChat = URI.parse(buildDefaultChatUri(sessionUri));
			const additionalChat = URI.parse(buildChatUri(sessionUri, 'additional'));
			const folder = URI.file('/repo/additional');
			await createSessionBackedChat(agent, sessionChat, { configurationResource: sessionUri, resource: sessionChat }, {
				workingDirectories: [folder],
				model: { id: COPILOT_TEST_MODEL },
			});
			const sessionStart = await readNextRequest(peer.outbound);
			peer.push({ id: sessionStart.id, result: { thread: { id: 'session-thread', cwd: folder.fsPath } } });
			await agent['_sessions'].get('session-additional')!.materializePromise;

			const creating = agent.chats.createChat(additionalChat, { configurationResource: sessionUri, resource: additionalChat }, {
				workingDirectories: [folder],
				model: { id: COPILOT_TEST_MODEL },
				config: {},
			});
			const start = await readNextRequest(peer.outbound);
			const connection = agent['_connection'];
			assert.strictEqual(connection.kind, 'ready');
			if (connection.kind !== 'ready') {
				throw new Error('Expected ready Codex connection');
			}
			agent['_handleMcpStartupStatus'](connection.client, 'additional-thread', 'early-mcp', 'starting', null);
			assert.strictEqual(agent['_pendingMcpStartupStatuses'].has('additional-thread'), true);
			peer.push({ id: start.id, result: { thread: { id: 'additional-thread', cwd: folder.fsPath } } });
			const created = await creating;
			const earlyMcpState = agent['_mcpInventory'].forThread('additional-thread').get('early-mcp')?.state.kind;

			// A repeated create for the same chat must hand the exact same
			// backing back; a second thread/start here would orphan the first.
			const recreated = await agent.chats.createChat(additionalChat, { configurationResource: sessionUri, resource: additionalChat }, {
				workingDirectories: [folder],
				model: { id: COPILOT_TEST_MODEL },
			});
			agent['_mcpInventory'].setState('session-thread', 'default-mcp', { kind: McpServerStatus.Ready });
			agent['_mcpInventory'].setState('additional-thread', 'peer-mcp', { kind: McpServerStatus.Ready });
			agent['_fetchSkillHookContainers'] = async () => [];
			const peerCustomizations = await agent.getChatCustomizations(additionalChat, { configurationResource: sessionUri, resource: additionalChat });

			assert.deepStrictEqual({
				started: { method: start.method, cwd: start.params.cwd },
				// The owning session's identity is already taken, so this chat is
				// identified by the thread it minted and reported as an internal
				// backing rather than as a session of its own.
				backingSession: created?.backingSession?.toString(),
				backingId: created?.providerData ? JSON.parse(created.providerData).sessionId : undefined,
				recreatedBackingId: recreated?.providerData ? JSON.parse(recreated.providerData).sessionId : undefined,
				recreatedBackingSession: recreated?.backingSession?.toString(),
				boundSessionId: agent['_sessionIdByChatUri'].get(additionalChat.toString()),
				sessionRuntimeUntouched: agent['_sessions'].get('session-additional')?.threadId,
				earlyMcpState,
				peerMcp: peerCustomizations.filter(customization => customization.type === CustomizationType.McpServer).map(customization => customization.name),
				configurationResource: agent['_sessions'].get('additional-thread')?.configurationResource.toString(),
			}, {
				started: { method: 'thread/start', cwd: folder.fsPath },
				backingSession: AgentSession.uri('codex', 'additional-thread').toString(),
				backingId: 'additional-thread',
				recreatedBackingId: 'additional-thread',
				recreatedBackingSession: AgentSession.uri('codex', 'additional-thread').toString(),
				boundSessionId: 'additional-thread',
				sessionRuntimeUntouched: 'session-thread',
				earlyMcpState: McpServerStatus.Starting,
				peerMcp: ['early-mcp', 'peer-mcp'],
				configurationResource: sessionUri.toString(),
			});
		} finally {
			peer.dispose();
		}
	});

	test('forking an additional chat goes through createChat({ fork }) like every other creation', async () => {
		const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true });
		const peer = disposables.add(createTestPeer());
		connectPeer(agent, peer);

		try {
			const sessionUri = AgentSession.uri('codex', 'session-fork-chat');
			const sessionChat = URI.parse(buildDefaultChatUri(sessionUri));
			const forkChat = URI.parse(buildChatUri(sessionUri, 'forked'));
			const folder = URI.file('/repo/fork-chat');
			await createSessionBackedChat(agent, sessionChat, { configurationResource: sessionUri, resource: sessionChat }, {
				workingDirectories: [folder],
				model: { id: COPILOT_TEST_MODEL },
			});
			const sessionStart = await readNextRequest(peer.outbound);
			peer.push({ id: sessionStart.id, result: { thread: { id: 'fork-chat-source', cwd: folder.fsPath } } });
			await agent['_sessions'].get('session-fork-chat')!.materializePromise;

			// There is no separate fork entry point: a fork is a create whose
			// options name the source chat to branch from.
			const forking = agent.chats.createChat(forkChat, { configurationResource: sessionUri, resource: forkChat }, {
				model: { id: COPILOT_TEST_MODEL },
				workingDirectories: [folder],
				fork: { source: sessionChat, turnId: 'turn-1' },
			});
			const read = await readNextRequest(peer.outbound);
			peer.push({
				id: read.id,
				result: { thread: { id: 'fork-chat-source', cwd: folder.fsPath, turns: [{ id: 'turn-1' }] } },
			});
			const fork = await readNextRequest(peer.outbound);
			peer.push({ id: fork.id, result: { thread: { id: 'fork-chat-thread', cwd: folder.fsPath }, cwd: folder.fsPath } });
			const forked = await forking;

			assert.deepStrictEqual({
				forkRequest: { method: fork.method, threadId: fork.params.threadId },
				backingSession: forked?.backingSession?.toString(),
				backingId: forked?.providerData ? JSON.parse(forked.providerData).sessionId : undefined,
				boundSessionId: agent['_sessionIdByChatUri'].get(forkChat.toString()),
				chatChannel: agent['_sessions'].get('fork-chat-thread')?.chatChannel?.toString(),
			}, {
				forkRequest: { method: 'thread/fork', threadId: 'fork-chat-source' },
				backingSession: AgentSession.uri('codex', 'fork-chat-thread').toString(),
				backingId: 'fork-chat-thread',
				boundSessionId: 'fork-chat-thread',
				chatChannel: forkChat.toString(),
			});
		} finally {
			peer.dispose();
		}
	});

	test('importConversation is rejected for every chat, not only a session\u2019s first', async () => {
		const agent = await createAgent(disposables);
		const sessionUri = AgentSession.uri('codex', 'session-import-additional');
		const sessionChat = URI.parse(buildDefaultChatUri(sessionUri));
		const additionalChat = URI.parse(buildChatUri(sessionUri, 'import'));
		const folder = URI.file('/repo/import-additional');
		await createSessionBackedChat(agent, sessionChat, { configurationResource: sessionUri, resource: sessionChat }, {
			workingDirectories: [folder],
			model: { id: COPILOT_TEST_MODEL },
		});

		await assert.rejects(
			agent.chats.createChat(additionalChat, { configurationResource: sessionUri, resource: additionalChat }, {
				workingDirectories: [folder],
				model: { id: COPILOT_TEST_MODEL },
				importConversation: { turns: [] },
			}),
			/does not support importing/,
		);

		assert.deepStrictEqual({
			hasBinding: agent['_sessionIdByChatUri'].has(additionalChat.toString()),
			runtimes: [...agent['_sessions'].keys()],
		}, {
			hasBinding: false,
			runtimes: ['session-import-additional'],
		});
	});

	test('fresh: prewarm and the exact chat binding cooperate so a first send never needs a separate bind', async () => {
		const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true });
		const peer = disposables.add(createTestPeer());
		connectPeer(agent, peer);

		try {
			const sessionUri = AgentSession.uri('codex', 'session-prewarm');
			const chat = URI.parse(buildDefaultChatUri(sessionUri));
			const folder = URI.file('/repo/prewarm');
			const created = await createSessionBackedChat(agent, chat, { configurationResource: sessionUri, resource: chat }, {
				workingDirectories: [folder],
				model: { id: COPILOT_TEST_MODEL },
			});
			assert.strictEqual(created.provisional, true);
			// The binding lands as part of creation, not as a follow-up: check it
			// before the prewarmed thread/start round trip below even completes.
			assert.strictEqual(agent['_sessionIdByChatUri'].get(chat.toString()), 'session-prewarm');

			const start = await readNextRequest(peer.outbound);
			peer.push({ id: start.id, result: { thread: { id: 'prewarmed-thread', cwd: folder.fsPath } } });
			const entry = agent['_sessions'].get('session-prewarm')!;
			await entry.materializePromise;

			const sending = agent.chats.sendMessage(chat, 'hello', [folder], undefined, 'turn-1', undefined, {
				configurationResource: sessionUri,
				resource: chat,
				hostInstructions: ['Rename with exact casing'],
			});
			const turn = await readNextRequest(peer.outbound);
			assert.strictEqual(turn.method, 'turn/start');
			assert.strictEqual(turn.params.threadId, 'prewarmed-thread');
			assert.deepStrictEqual(turn.params.input, [{ type: 'text', text: 'hello', text_elements: [] }]);
			assert.deepStrictEqual(turn.params.additionalContext, {
				'vscode.agentHost': { kind: 'application', value: 'Rename with exact casing' },
			});
			peer.push({ id: turn.id, result: {} });
			await sending;
		} finally {
			peer.dispose();
		}
	});

	test('prewarmed draft stays provisional while its launch config changes before first send', async () => {
		const sessionStore = createTestSessionStore();
		const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true, sessionStore });
		const peer = disposables.add(createTestPeer());
		connectPeer(agent, peer);

		try {
			const sessionUri = AgentSession.uri('codex', 'session-prewarm-restart');
			const chat = URI.parse(buildDefaultChatUri(sessionUri));
			const folder = URI.file('/repo/prewarm-restart');
			const context = { configurationResource: sessionUri, resource: chat };
			const materialized: string[] = [];
			disposables.add(agent.onDidMaterializeChat(e => materialized.push(e.chat.toString())));

			await createSessionBackedChat(agent, chat, context, {
				workingDirectories: [folder],
				model: { id: COPILOT_TEST_MODEL },
			});
			const prewarmStart = await readNextRequest(peer.outbound);
			peer.push({ id: prewarmStart.id, result: { thread: { id: 'prewarmed-thread', cwd: folder.fsPath } } });
			await new Promise(resolve => setImmediate(resolve));

			const activeClient = agent.getOrCreateActiveClient(chat, context, { clientId: 'client-1' });
			activeClient.tools = [{ name: 'client_tool', description: 'client tool', inputSchema: { type: 'object' } }];
			const changingAgent = agent.chats.changeAgent(chat, undefined, context);
			const unsubscribe = await readNextRequest(peer.outbound);
			peer.push({ id: unsubscribe.id, result: {} });
			const restartedThread = await readNextRequest(peer.outbound);
			peer.push({ id: restartedThread.id, result: { thread: { id: 'restarted-thread', cwd: folder.fsPath } } });
			await changingAgent;
			await new Promise(resolve => setImmediate(resolve));
			const beforeSend = [...materialized];
			const persistedBeforeSend = await agent['_metadataStore'].read(sessionUri);

			const sending = agent.chats.sendMessage(chat, 'hello', [folder], undefined, 'turn-1', undefined, undefined, context);
			const turn = await readNextRequest(peer.outbound);
			peer.push({ id: turn.id, result: {} });
			await sending;
			await new Promise(resolve => setImmediate(resolve));
			const persistedAfterSend = await agent['_metadataStore'].read(sessionUri);

			assert.deepStrictEqual({
				beforeSend,
				afterSend: materialized,
				persistedThreadBeforeSend: persistedBeforeSend.threadId,
				persistedThreadAfterSend: persistedAfterSend.threadId,
				restartedDynamicTools: restartedThread.params.dynamicTools?.map(tool => tool.name),
				requests: [prewarmStart, unsubscribe, restartedThread, turn].map(request => ({
					method: request.method,
					threadId: request.params.threadId,
				})),
			}, {
				beforeSend: [],
				afterSend: [chat.toString()],
				persistedThreadBeforeSend: undefined,
				persistedThreadAfterSend: 'restarted-thread',
				restartedDynamicTools: ['client_tool'],
				requests: [
					{ method: 'thread/start', threadId: undefined },
					{ method: 'thread/unsubscribe', threadId: 'prewarmed-thread' },
					{ method: 'thread/start', threadId: undefined },
					{ method: 'turn/start', threadId: 'restarted-thread' },
				],
			});
		} finally {
			peer.dispose();
		}
	});
});

suite('CodexAgent exact chat routing', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function sessionChatWithPeerShape(session: URI): URI {
		return URI.parse(buildChatUri(session, 'not-the-default-id'));
	}

	test('routes the exact chat without retaining a session or peer classification', async () => {
		const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true });
		const advertised: string[] = [];
		agent.setServerToolHost(createRecordingServerToolHost(advertised));
		const peer = disposables.add(createTestPeer());
		connectPeer(agent, peer);

		try {
			const sessionUri = AgentSession.uri('codex', 'session-intent');
			const chat = sessionChatWithPeerShape(sessionUri);
			const folder = URI.file('/repo/intent');
			const materialized: string[] = [];
			disposables.add(agent.onDidMaterializeChat(e => materialized.push(e.chat.toString())));

			await createSessionBackedChat(agent, chat, { configurationResource: sessionUri, resource: chat }, {
				workingDirectories: [folder],
				model: { id: COPILOT_TEST_MODEL },
				activeClient: { clientId: 'client-1', tools: [{ name: 'client_tool', description: 'client tool', inputSchema: { type: 'object' } }] },
			});
			const entry = agent['_sessions'].get('session-intent')!;
			const start = await readNextRequest(peer.outbound);
			peer.push({ id: start.id, result: { thread: { id: 'intent-thread', cwd: folder.fsPath } } });
			await entry.materializePromise;

			const sending = agent.chats.sendMessage(chat, 'hello', [folder], undefined, 'turn-1', undefined, undefined, { configurationResource: sessionUri, resource: chat });
			const turn = await readNextRequest(peer.outbound);
			peer.push({ id: turn.id, result: {} });
			await sending;

			assert.deepStrictEqual({
				advertised,
				materialized,
				// The eager active client is seeded over the exact chat the call
				// binds, so its tools land on this runtime without any
				// default-chat URI being synthesized to find it.
				clientTools: entry.clientToolSet.merged().map(tool => tool.name),
			}, {
				advertised: [sessionUri.toString()],
				materialized: [chat.toString()],
				clientTools: ['client_tool'],
			});
		} finally {
			peer.dispose();
		}
	});

	test('disposing an unbound peer chat does not tear down the owning session runtime', async () => {
		const agent = await createAgent(disposables);
		const sessionUri = AgentSession.uri('codex', 'session-unbound-peer-dispose');
		const sessionChat = URI.parse(buildDefaultChatUri(sessionUri));
		const unboundPeer = URI.parse(buildChatUri(sessionUri, 'never-bound'));

		await createSessionBackedChat(agent, sessionChat, { configurationResource: sessionUri, resource: sessionChat }, {
			model: { id: COPILOT_TEST_MODEL },
		});
		assert.strictEqual(agent['_sessionIdByChatUri'].get(sessionChat.toString()), 'session-unbound-peer-dispose');

		await agent.chats.disposeChat(unboundPeer, { configurationResource: sessionUri, resource: unboundPeer });

		assert.deepStrictEqual({
			hasRuntime: agent['_sessions'].has('session-unbound-peer-dispose'),
			sessionBinding: agent['_sessionIdByChatUri'].get(sessionChat.toString()),
		}, {
			hasRuntime: true,
			sessionBinding: 'session-unbound-peer-dispose',
		});
	});

	test('disposeChat tears down the runtime of the addressed chat and forgets its binding', async () => {
		const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true });
		const peer = disposables.add(createTestPeer());
		connectPeer(agent, peer);

		try {
			const sessionUri = AgentSession.uri('codex', 'session-dispose-intent');
			const chat = sessionChatWithPeerShape(sessionUri);
			const context = { configurationResource: sessionUri, resource: chat };

			await createSessionBackedChat(agent, chat, context, {
				workingDirectories: [URI.file('/repo/dispose')],
				model: { id: COPILOT_TEST_MODEL },
			});
			const entry = agent['_sessions'].get('session-dispose-intent')!;
			const start = await readNextRequest(peer.outbound);
			peer.push({ id: start.id, result: { thread: { id: 'dispose-thread', cwd: '/repo/dispose' } } });
			await entry.materializePromise;
			assert.strictEqual(agent['_sessionIdByChatUri'].get(chat.toString()), 'session-dispose-intent');

			// Agent Host's teardown order: dispose every chat. Configuration-
			// scope ref tracking reclaims any remaining scope-level resources
			// inline once the scope's last chat is disposed — no separate
			// finalize call is needed.
			const disposing = agent.chats.disposeChat(chat, context);
			const unsubscribe = await readNextRequest(peer.outbound);
			peer.push({ id: unsubscribe.id, result: {} });
			await disposing;

			assert.deepStrictEqual({
				unsubscribed: { method: unsubscribe.method, threadId: unsubscribe.params.threadId },
				hasRuntime: agent['_sessions'].has('session-dispose-intent'),
				hasBinding: agent['_sessionIdByChatUri'].has(chat.toString()),
			}, {
				unsubscribed: { method: 'thread/unsubscribe', threadId: 'dispose-thread' },
				hasRuntime: false,
				hasBinding: false,
			});
		} finally {
			peer.dispose();
		}
	});

	test('releaseChat releases the runtime of the addressed chat but keeps it resumable', async () => {
		const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true });
		const peer = disposables.add(createTestPeer());
		connectPeer(agent, peer);

		try {
			const sessionUri = AgentSession.uri('codex', 'session-release-intent');
			const chat = sessionChatWithPeerShape(sessionUri);
			const context = { configurationResource: sessionUri, resource: chat };

			await createSessionBackedChat(agent, chat, context, {
				workingDirectories: [URI.file('/repo/release')],
				model: { id: COPILOT_TEST_MODEL },
			});
			const entry = agent['_sessions'].get('session-release-intent')!;
			const start = await readNextRequest(peer.outbound);
			peer.push({ id: start.id, result: { thread: { id: 'release-thread', cwd: '/repo/release' } } });
			await entry.materializePromise;

			const releasing = agent.chats.releaseChat(chat, context);
			const unsubscribe = await readNextRequest(peer.outbound);
			peer.push({ id: unsubscribe.id, result: {} });
			await releasing;

			assert.deepStrictEqual({
				unsubscribed: { method: unsubscribe.method, threadId: unsubscribe.params.threadId },
				hasRuntime: agent['_sessions'].has('session-release-intent'),
				// A release is non-destructive: the chat binding survives so the
				// session resumes transparently on the next access.
				hasBinding: agent['_sessionIdByChatUri'].has(chat.toString()),
			}, {
				unsubscribed: { method: 'thread/unsubscribe', threadId: 'release-thread' },
				hasRuntime: false,
				hasBinding: true,
			});
		} finally {
			peer.dispose();
		}
	});

	test('disposeChat tears down a still-provisional (never-sent) chat: pending registries reject, the runtime and binding are dropped, and a queued prewarm can no longer materialize a thread', async () => {
		const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true });
		const sessionUri = AgentSession.uri('codex', 'session-dispose-provisional');
		const chat = sessionChatWithPeerShape(sessionUri);
		const context = { configurationResource: sessionUri, resource: chat };

		await createSessionBackedChat(agent, chat, context, {
			workingDirectories: [URI.file('/repo/dispose-provisional')],
			model: { id: COPILOT_TEST_MODEL },
		});
		const entry = agent['_sessions'].get('session-dispose-provisional')!;
		assert.strictEqual(entry.threadId, undefined, 'precondition: the chat was never sent to, so its codex thread is still deferred');

		// Park entries the way a live call/approval would, to prove disposal
		// unparks them instead of leaving their awaiters hanging forever.
		const toolCall = entry.pendingClientToolCalls.register('tool-call-1');
		const approval = entry.pendingCommandApprovals.register('approval-1');
		const userInput = entry.pendingUserInputs.register('input-1');

		// No peer is connected: a provisional runtime's teardown never touches
		// the wire (there is no codex thread yet to `thread/unsubscribe`), so
		// disposal must resolve entirely in-memory.
		await agent.chats.disposeChat(chat, context);

		await assert.rejects(toolCall);
		// Command approvals are unparked by resolving (`denyAll('decline')`),
		// not rejecting: the caller awaiting the decision unwinds with an
		// explicit "declined" outcome instead of a thrown error.
		assert.strictEqual(await approval, 'decline');
		await assert.rejects(userInput);

		assert.deepStrictEqual({
			hasRuntime: agent['_sessions'].has('session-dispose-provisional'),
			hasBinding: agent['_sessionIdByChatUri'].has(chat.toString()),
			disposed: entry.disposed,
			hasPendingToolCall: entry.pendingClientToolCalls.has('tool-call-1'),
			hasPendingApproval: entry.pendingCommandApprovals.has('approval-1'),
			hasPendingInput: entry.pendingUserInputs.has('input-1'),
		}, {
			hasRuntime: false,
			hasBinding: false,
			disposed: true,
			hasPendingToolCall: false,
			hasPendingApproval: false,
			hasPendingInput: false,
		});

		// A prewarm queued (e.g. by a timer that fired just after dispose) must
		// not resurrect the thread the host already considers gone: dispose
		// unconditionally tore the provisional runtime down, so
		// `_materializeIfNeeded` — the exact call `_schedulePrewarm` makes —
		// must be an in-memory no-op instead of racing a `thread/start` past
		// deletion. Call it directly (rather than racing the fire-and-forget
		// `_schedulePrewarm` timer) so the assertion below is deterministic.
		await agent['_materializeIfNeeded'](entry, entry.sessionUri, false);
		assert.strictEqual(entry.threadId, undefined, 'a queued prewarm must never materialize a thread for a runtime that was already disposed');

		// `_schedulePrewarm` itself must also tolerate being invoked after
		// disposal without throwing (a defensive race against a timer that
		// fires in the same tick dispose runs).
		assert.doesNotThrow(() => agent['_schedulePrewarm'](entry));
	});

	test('dispose during materialization removes a late managed directory and never starts a thread', async () => {
		const agent = await createAgent(disposables);
		const sessionUri = AgentSession.uri('codex', 'session-dispose-materializing');
		const chat = URI.parse(buildDefaultChatUri(sessionUri));
		const context = { configurationResource: sessionUri, resource: chat };
		await createSessionBackedChat(agent, chat, context);
		const entry = agent['_sessions'].get(AgentSession.id(sessionUri))!;
		const directory = URI.file('/tmp/codex-dispose-materializing');
		const directoryStarted = new DeferredPromise<void>();
		const releaseDirectory = new DeferredPromise<void>();
		const removed: string[] = [];
		let connectionStarted = false;
		const originalCreateManagedWorkingDirectory = agent['_createManagedWorkingDirectory'].bind(agent);
		const originalRemoveManagedWorkingDirectory = agent['_removeManagedWorkingDirectory'].bind(agent);
		const originalEnsureConnection = agent['_ensureConnection'].bind(agent);
		agent['_createManagedWorkingDirectory'] = async () => {
			await directoryStarted.complete(undefined);
			await releaseDirectory.p;
			return directory;
		};
		agent['_removeManagedWorkingDirectory'] = async candidate => { removed.push(candidate.toString()); };
		agent['_ensureConnection'] = async () => {
			connectionStarted = true;
			throw new Error('disposed materialization reached the connection');
		};

		try {
			const materializing = agent['_materializeIfNeeded'](entry, sessionUri, false);
			await directoryStarted.p;
			await agent.chats.disposeChat(chat, context);
			await releaseDirectory.complete(undefined);
			await materializing;

			assert.deepStrictEqual({
				removed,
				connectionStarted,
				hasRuntime: agent['_sessions'].has(AgentSession.id(sessionUri)),
				threadId: entry.threadId,
			}, {
				removed: [directory.toString()],
				connectionStarted: false,
				hasRuntime: false,
				threadId: undefined,
			});
		} finally {
			agent['_createManagedWorkingDirectory'] = originalCreateManagedWorkingDirectory;
			agent['_removeManagedWorkingDirectory'] = originalRemoveManagedWorkingDirectory;
			agent['_ensureConnection'] = originalEnsureConnection;
		}
	});

	test('dispose during an in-flight thread start archives the late thread instead of orphaning it', async () => {
		const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true });
		const peer = disposables.add(createTestPeer());
		connectPeer(agent, peer);

		try {
			const sessionUri = AgentSession.uri('codex', 'session-dispose-in-flight-start');
			const chat = URI.parse(buildDefaultChatUri(sessionUri));
			const context = { configurationResource: sessionUri, resource: chat };
			await createSessionBackedChat(agent, chat, context, {
				workingDirectories: [URI.file('/repo/dispose-in-flight-start')],
				model: { id: COPILOT_TEST_MODEL },
			});
			const entry = agent['_sessions'].get(AgentSession.id(sessionUri))!;
			const materializing = agent['_materializeIfNeeded'](entry, sessionUri, false);
			const start = await readNextRequest(peer.outbound);

			await agent.chats.disposeChat(chat, context);
			peer.push({ id: start.id, result: { thread: { id: 'late-disposed-thread', cwd: '/repo/dispose-in-flight-start' } } });
			const cleanup = await readNextRequest(peer.outbound);
			peer.push({ id: cleanup.id, result: {} });
			await materializing;

			assert.deepStrictEqual({
				cleanup: { method: cleanup.method, threadId: cleanup.params.threadId },
				hasRuntime: agent['_sessions'].has(AgentSession.id(sessionUri)),
				hasBinding: agent['_sessionIdByChatUri'].has(chat.toString()),
			}, {
				cleanup: { method: 'thread/archive', threadId: 'late-disposed-thread' },
				hasRuntime: false,
				hasBinding: false,
			});
		} finally {
			peer.dispose();
		}
	});

	test('OTel: releaseChat preserves the runtime\'s trace context; a later disposeChat of the already-evicted runtime releases it through the scope-finalization path', async () => {
		const released: string[] = [];
		const agent = await createAgent(disposables, {
			sdkResolvableWithoutDownload: true,
			otelService: {
				getSessionTraceContext: () => undefined,
				releaseSessionTraceContext: sessionUriKey => released.push(sessionUriKey),
			},
		});
		const peer = disposables.add(createTestPeer());
		connectPeer(agent, peer);

		try {
			const sessionUri = AgentSession.uri('codex', 'session-otel-scope');
			const chat = URI.parse(buildDefaultChatUri(sessionUri));
			const context = { configurationResource: sessionUri, resource: chat };

			await createSessionBackedChat(agent, chat, context, {
				workingDirectories: [URI.file('/repo/otel-scope')],
				model: { id: COPILOT_TEST_MODEL },
			});
			const entry = agent['_sessions'].get('session-otel-scope')!;
			const start = await readNextRequest(peer.outbound);
			peer.push({ id: start.id, result: { thread: { id: 'otel-scope-thread', cwd: '/repo/otel-scope' } } });
			await entry.materializePromise;

			// Idle eviction must never release the trace context: the runtime is
			// expected to resume later under the same trace parent.
			const releasing = agent.chats.releaseChat(chat, context);
			const unsubscribeOnRelease = await readNextRequest(peer.outbound);
			peer.push({ id: unsubscribeOnRelease.id, result: {} });
			await releasing;
			assert.deepStrictEqual(released, [], 'releaseChat must not release the OTel trace context');

			// The runtime is now evicted from memory but the chat binding (and
			// its configuration-scope ref) survive. Disposing it now exercises
			// the scope-finalization reclaim path rather than the in-memory
			// runtime teardown, since `_sessions` no longer has an entry.
			assert.strictEqual(agent['_sessions'].has('session-otel-scope'), false, 'precondition: the runtime was evicted by the release above');
			await agent.chats.disposeChat(chat, context);

			assert.ok(released.length >= 1, 'disposeChat must release the trace context once the scope has no chats left');
			assert.ok(released.every(key => key === sessionUri.toString()), 'every release must use the exact acquisition key (this runtime\'s own sessionUri), never a different one');
		} finally {
			peer.dispose();
		}
	});

	test('OTel: disposeChat of a live in-memory runtime releases its trace context under the exact key it was acquired with', async () => {
		const released: string[] = [];
		const agent = await createAgent(disposables, {
			sdkResolvableWithoutDownload: true,
			otelService: {
				getSessionTraceContext: () => undefined,
				releaseSessionTraceContext: sessionUriKey => released.push(sessionUriKey),
			},
		});
		const peer = disposables.add(createTestPeer());
		connectPeer(agent, peer);

		try {
			const sessionUri = AgentSession.uri('codex', 'session-otel-live');
			const chat = URI.parse(buildDefaultChatUri(sessionUri));
			const context = { configurationResource: sessionUri, resource: chat };

			await createSessionBackedChat(agent, chat, context, {
				workingDirectories: [URI.file('/repo/otel-live')],
				model: { id: COPILOT_TEST_MODEL },
			});
			const entry = agent['_sessions'].get('session-otel-live')!;
			const start = await readNextRequest(peer.outbound);
			peer.push({ id: start.id, result: { thread: { id: 'otel-live-thread', cwd: '/repo/otel-live' } } });
			await entry.materializePromise;

			const disposing = agent.chats.disposeChat(chat, context);
			const unsubscribe = await readNextRequest(peer.outbound);
			peer.push({ id: unsubscribe.id, result: {} });
			await disposing;

			assert.deepStrictEqual(released, [sessionUri.toString()]);
		} finally {
			peer.dispose();
		}
	});

	test('truncateChat rolls back the thread of the addressed chat', async () => {
		const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true });
		const peer = disposables.add(createTestPeer());
		connectPeer(agent, peer);

		try {
			const sessionUri = AgentSession.uri('codex', 'session-truncate');
			const sessionChat = URI.parse(buildDefaultChatUri(sessionUri));
			const peerChat = URI.parse(buildChatUri(sessionUri, 'peer-chat'));
			const folder = URI.file('/repo/truncate');

			await createSessionBackedChat(agent, sessionChat, { configurationResource: sessionUri, resource: sessionChat }, {
				workingDirectories: [folder],
				model: { id: COPILOT_TEST_MODEL },
			});
			const sessionEntry = agent['_sessions'].get('session-truncate')!;
			const sessionStart = await readNextRequest(peer.outbound);
			peer.push({ id: sessionStart.id, result: { thread: { id: 'session-thread', cwd: folder.fsPath } } });
			await sessionEntry.materializePromise;

			const creatingPeer = agent.chats.createChat(peerChat, { configurationResource: sessionUri, resource: peerChat }, {
				model: { id: COPILOT_TEST_MODEL },
				workingDirectories: [folder],
				config: {},
			});
			const peerStart = await readNextRequest(peer.outbound);
			peer.push({ id: peerStart.id, result: { thread: { id: 'peer-thread', cwd: folder.fsPath } } });
			await creatingPeer;

			const truncating = agent.truncateChat(peerChat, 'turn-2', { configurationResource: sessionUri, resource: peerChat });
			const read = await readNextRequest(peer.outbound);
			peer.push({
				id: read.id,
				result: { thread: { id: 'peer-thread', cwd: folder.fsPath, turns: [{ id: 'turn-1' }, { id: 'turn-2' }, { id: 'turn-3' }] } },
			});
			const rollback = await readNextRequest(peer.outbound);
			peer.push({ id: rollback.id, result: {} });
			await truncating;

			assert.deepStrictEqual([
				{ method: read.method, threadId: read.params.threadId },
				{ method: rollback.method, threadId: rollback.params.threadId, numTurns: rollback.params.numTurns },
			], [
				{ method: 'thread/read', threadId: 'peer-thread' },
				{ method: 'thread/rollback', threadId: 'peer-thread', numTurns: 1 },
			]);
		} finally {
			peer.dispose();
		}
	});

	test('truncateChat resumes a replacement app-server before reading or rolling back', async () => {
		const agent = await createAgent(disposables);
		const peer = disposables.add(createTestPeer());
		connectPeer(agent, peer);

		try {
			const session = AgentSession.uri('codex', 'resume-before-truncate');
			const chat = URI.parse(buildDefaultChatUri(session));
			const folder = URI.file('/repo/resume-before-truncate');
			await createSessionBackedChat(agent, chat, { configurationResource: session, resource: chat }, {
				workingDirectories: [folder],
				model: { id: COPILOT_TEST_MODEL },
			});
			const entry = agent['_sessions'].get(AgentSession.id(session))!;
			entry.threadId = 'resume-before-truncate-thread';
			entry.needsResume = true;
			agent['_sessionIdByThreadId'].set(entry.threadId, entry.sessionId);

			const truncating = agent.truncateChat(chat, 'keep-turn', { configurationResource: session, resource: chat });
			const resume = await readNextRequest(peer.outbound);
			peer.push({ id: resume.id, result: { thread: { id: entry.threadId, cwd: folder.fsPath }, cwd: folder.fsPath } });
			const inventory = await readNextRequest(peer.outbound);
			peer.push({ id: inventory.id, result: { data: [], nextCursor: null } });
			const read = await readNextRequest(peer.outbound);
			peer.push({ id: read.id, result: { thread: { id: entry.threadId, cwd: folder.fsPath, turns: [{ id: 'keep-turn' }, { id: 'drop-turn' }] } } });
			const rollback = await readNextRequest(peer.outbound);
			peer.push({ id: rollback.id, result: {} });
			await truncating;

			assert.deepStrictEqual([
				{ method: resume.method, threadId: resume.params.threadId },
				{ method: inventory.method, threadId: inventory.params.threadId },
				{ method: read.method, threadId: read.params.threadId },
				{ method: rollback.method, threadId: rollback.params.threadId, numTurns: rollback.params.numTurns },
			], [
				{ method: 'thread/resume', threadId: 'resume-before-truncate-thread' },
				{ method: 'mcpServerStatus/list', threadId: 'resume-before-truncate-thread' },
				{ method: 'thread/read', threadId: 'resume-before-truncate-thread' },
				{ method: 'thread/rollback', threadId: 'resume-before-truncate-thread', numTurns: 1 },
			]);
		} finally {
			peer.dispose();
		}
	});

	test('thread-scoped MCP calls resume a replacement app-server before forwarding', async () => {
		const agent = await createAgent(disposables);
		const peer = disposables.add(createTestPeer());
		connectPeer(agent, peer);

		try {
			const session = AgentSession.uri('codex', 'resume-before-mcp');
			const chat = URI.parse(buildDefaultChatUri(session));
			const folder = URI.file('/repo/resume-before-mcp');
			await createSessionBackedChat(agent, chat, { configurationResource: session, resource: chat }, {
				workingDirectories: [folder],
				model: { id: COPILOT_TEST_MODEL },
			});
			const entry = agent['_sessions'].get(AgentSession.id(session))!;
			entry.threadId = 'resume-before-mcp-thread';
			entry.needsResume = true;
			agent['_sessionIdByThreadId'].set(entry.threadId, entry.sessionId);
			agent['_mcpInventory'].replace(entry.threadId, new Map([['test-server', {
				state: { kind: McpServerStatus.Ready },
				tools: [],
				resources: [],
				resourceTemplates: [],
			}]]));

			const calling = agent.handleMcpRequest(chat, 'test-server', 'tools/call', { name: 'test-tool', arguments: {} });
			const resume = await readNextRequest(peer.outbound);
			peer.push({ id: resume.id, result: { thread: { id: entry.threadId, cwd: folder.fsPath }, cwd: folder.fsPath } });
			const inventory = await readNextRequest(peer.outbound);
			peer.push({ id: inventory.id, result: { data: [], nextCursor: null } });
			const toolCall = await readNextRequest(peer.outbound);
			peer.push({ id: toolCall.id, result: { content: [] } });
			await calling;

			assert.deepStrictEqual([
				{ method: resume.method, threadId: resume.params.threadId },
				{ method: inventory.method, threadId: inventory.params.threadId },
				{ method: toolCall.method, threadId: toolCall.params.threadId },
			], [
				{ method: 'thread/resume', threadId: 'resume-before-mcp-thread' },
				{ method: 'mcpServerStatus/list', threadId: 'resume-before-mcp-thread' },
				{ method: 'mcpServer/tool/call', threadId: 'resume-before-mcp-thread' },
			]);
		} finally {
			peer.dispose();
		}
	});

	test('thread-scoped MCP calls retry resume when the app-server is replaced as resume completes', async () => {
		const agent = await createAgent(disposables);
		const firstPeer = disposables.add(createTestPeer());
		const secondPeer = disposables.add(createTestPeer());
		connectPeer(agent, firstPeer);

		try {
			const session = AgentSession.uri('codex', 'replace-during-mcp-resume');
			const chat = URI.parse(buildDefaultChatUri(session));
			const folder = URI.file('/repo/replace-during-mcp-resume');
			await createSessionBackedChat(agent, chat, { configurationResource: session, resource: chat }, {
				workingDirectories: [folder],
				model: { id: COPILOT_TEST_MODEL },
			});
			const entry = agent['_sessions'].get(AgentSession.id(session))!;
			entry.threadId = 'replace-during-mcp-resume-thread';
			entry.needsResume = true;
			agent['_sessionIdByThreadId'].set(entry.threadId, entry.sessionId);
			agent['_mcpInventory'].replace(entry.threadId, new Map([['test-server', {
				state: { kind: McpServerStatus.Ready },
				tools: [],
				resources: [],
				resourceTemplates: [],
			}]]));

			const calling = agent.handleMcpRequest(chat, 'test-server', 'tools/call', { name: 'test-tool', arguments: {} });
			const firstResume = await readNextRequest(firstPeer.outbound);
			assert.strictEqual(firstResume.method, 'thread/resume');
			firstPeer.push({ id: firstResume.id, result: { thread: { id: entry.threadId, cwd: folder.fsPath }, cwd: folder.fsPath } });
			const lostConnection = agent['_connection'];
			assert.strictEqual(lostConnection.kind, 'ready');
			agent['_handleConnectionLost'](lostConnection as never, agent['_connectionGeneration']);
			connectPeer(agent, secondPeer);

			const secondResume = await readNextRequest(secondPeer.outbound);
			assert.strictEqual(secondResume.method, 'thread/resume');
			secondPeer.push({ id: secondResume.id, result: { thread: { id: entry.threadId, cwd: folder.fsPath }, cwd: folder.fsPath } });
			const inventory = await readNextRequest(secondPeer.outbound);
			secondPeer.push({ id: inventory.id, result: { data: [], nextCursor: null } });
			const toolCall = await readNextRequest(secondPeer.outbound);
			secondPeer.push({ id: toolCall.id, result: { content: [] } });
			await calling;

			assert.deepStrictEqual([
				{ method: firstResume.method, threadId: firstResume.params.threadId },
				{ method: secondResume.method, threadId: secondResume.params.threadId },
				{ method: toolCall.method, threadId: toolCall.params.threadId },
			], [
				{ method: 'thread/resume', threadId: 'replace-during-mcp-resume-thread' },
				{ method: 'thread/resume', threadId: 'replace-during-mcp-resume-thread' },
				{ method: 'mcpServer/tool/call', threadId: 'replace-during-mcp-resume-thread' },
			]);
		} finally {
			firstPeer.dispose();
			secondPeer.dispose();
		}
	});

	test('an active client is keyed to the exact addressed chat: no sibling inference, and cleanup on removal/disposal never touches a sibling chat', async () => {
		const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true });
		const peer = disposables.add(createTestPeer());
		connectPeer(agent, peer);

		try {
			const sessionUri = AgentSession.uri('codex', 'session-exact-client');
			const sessionChat = URI.parse(buildDefaultChatUri(sessionUri));
			const peerChat = URI.parse(buildChatUri(sessionUri, 'peer-chat'));
			const folder = URI.file('/repo/exact-client');
			const sessionContext = { configurationResource: sessionUri, resource: sessionChat };
			const peerContext = { configurationResource: sessionUri, resource: peerChat };

			await createSessionBackedChat(agent, sessionChat, sessionContext, {
				workingDirectories: [folder],
				model: { id: COPILOT_TEST_MODEL },
			});
			const sessionEntry = agent['_sessions'].get('session-exact-client')!;
			const sessionStart = await readNextRequest(peer.outbound);
			peer.push({ id: sessionStart.id, result: { thread: { id: 'session-thread', cwd: folder.fsPath } } });
			await sessionEntry.materializePromise;

			const creatingPeer = agent.chats.createChat(peerChat, peerContext, {
				model: { id: COPILOT_TEST_MODEL },
				workingDirectories: [folder],
				config: {},
			});
			const peerStart = await readNextRequest(peer.outbound);
			peer.push({ id: peerStart.id, result: { thread: { id: 'peer-thread', cwd: folder.fsPath } } });
			await creatingPeer;
			const peerEntry = agent['_sessions'].get('peer-thread')!;

			// The same clientId contributes different tools to each exact chat;
			// neither handle may leak into the other's runtime.
			const sessionHandle = agent.getOrCreateActiveClient(sessionChat, sessionContext, { clientId: 'client-exact' });
			sessionHandle.tools = [{ name: 'session_tool', description: 'session only', inputSchema: { type: 'object' } }];
			const peerHandle = agent.getOrCreateActiveClient(peerChat, peerContext, { clientId: 'client-exact' });
			peerHandle.tools = [{ name: 'peer_tool', description: 'peer only', inputSchema: { type: 'object' } }];

			assert.deepStrictEqual({
				sessionTools: sessionEntry.clientToolSet.merged().map(tool => tool.name),
				peerTools: peerEntry.clientToolSet.merged().map(tool => tool.name),
			}, {
				sessionTools: ['session_tool'],
				peerTools: ['peer_tool'],
			});

			// Explicitly removing the session chat's client must not disturb the
			// peer chat's contribution or its handle.
			agent.removeActiveClient(sessionChat, sessionContext, 'client-exact');

			const disposing = agent.chats.disposeChat(peerChat, peerContext);
			const unsubscribe = await readNextRequest(peer.outbound);
			peer.push({ id: unsubscribe.id, result: {} });
			await disposing;

			assert.deepStrictEqual({
				sessionTools: sessionEntry.clientToolSet.merged().map(tool => tool.name),
				peerTools: peerEntry.clientToolSet.merged().map(tool => tool.name),
				hasSessionHandle: agent['_activeClientHandles'].has(`${sessionChat.toString()}\u0000client-exact`),
				hasPeerHandle: agent['_activeClientHandles'].has(`${peerChat.toString()}\u0000client-exact`),
			}, {
				// Removal clears only the addressed chat's contribution.
				sessionTools: [],
				// Disposal cleans up the disposed chat's own handle the same way.
				peerTools: [],
				hasSessionHandle: false,
				hasPeerHandle: false,
			});
		} finally {
			peer.dispose();
		}
	});

	test('an eager active client retains its customizations for later removal', async () => {
		const agent = await createAgent(disposables);
		const session = AgentSession.uri('codex', 'session-eager-customizations');
		const chat = URI.parse(buildDefaultChatUri(session));
		const context = { configurationResource: session, resource: chat };
		const plugin = {
			type: CustomizationType.Plugin,
			id: 'plugin-eager',
			uri: 'file:///plugin-eager',
			name: 'Eager Plugin',
		} as const;
		let removed: readonly { readonly id: string }[] | undefined;
		agent['_syncClientCustomizations'] = async () => { };
		agent['_removeClientCustomizations'] = async (_entry, _clientId, customizations) => {
			removed = customizations;
		};

		await createSessionBackedChat(agent, chat, context, {
			workingDirectories: [URI.file('/repo/eager-customizations')],
			activeClient: { clientId: 'client-eager', tools: [], customizations: [plugin] },
		});
		const key = `${chat.toString()}\u0000client-eager`;
		const retained = agent['_activeClientHandles'].get(key)?.customizations;
		agent.removeActiveClient(chat, context, 'client-eager');
		await new Promise(resolve => setImmediate(resolve));

		assert.deepStrictEqual({
			retained: retained?.map(customization => customization.id),
			removed: removed?.map(customization => customization.id),
		}, {
			retained: ['plugin-eager'],
			removed: ['plugin-eager'],
		});
	});

	test('a peer chat\'s server-tool call uses its exact Agent Host chat channel', async () => {
		const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true });
		const calls: { readonly method: 'requiresConfirmation' | 'executeTool'; readonly chatUri: string }[] = [];
		agent.setServerToolHost(createRecordingChatServerToolHost(calls));
		const peer = disposables.add(createTestPeer());
		connectPeer(agent, peer);

		try {
			const sessionUri = AgentSession.uri('codex', 'session-peer-tool');
			const sessionChat = URI.parse(buildDefaultChatUri(sessionUri));
			const peerChat = URI.parse(buildChatUri(sessionUri, 'peer-chat'));
			const folder = URI.file('/repo/peer-tool');
			const sessionContext = { configurationResource: sessionUri, resource: sessionChat };
			const peerContext = { configurationResource: sessionUri, resource: peerChat };

			await createSessionBackedChat(agent, sessionChat, sessionContext, {
				workingDirectories: [folder],
				model: { id: COPILOT_TEST_MODEL },
			});
			const sessionStart = await readNextRequest(peer.outbound);
			peer.push({ id: sessionStart.id, result: { thread: { id: 'session-thread', cwd: folder.fsPath } } });
			await agent['_sessions'].get('session-peer-tool')!.materializePromise;

			// A peer chat under the same session config scope, but backed by
			// its own thread — the runtime this call resolves to is keyed
			// `codex:/peer-thread`, distinct from both the addressed session
			// (`sessionUri`) and the chat channel (`peerChat`).
			const creatingPeer = agent.chats.createChat(peerChat, peerContext, {
				model: { id: COPILOT_TEST_MODEL },
				workingDirectories: [folder],
				config: {},
			});
			const peerStart = await readNextRequest(peer.outbound);
			peer.push({ id: peerStart.id, result: { thread: { id: 'peer-thread', cwd: folder.fsPath } } });
			await creatingPeer;
			const peerEntry = agent['_sessions'].get('peer-thread')!;

			// Simulate the codex app-server invoking the host's server tool on
			// the peer runtime's own thread.
			const responding = readNextMessage(peer.outbound);
			peer.push({
				id: 9001,
				method: 'item/tool/call',
				params: { threadId: 'peer-thread', turnId: 'turn-irrelevant', callId: 'call-1', namespace: null, tool: PEER_TEST_TOOL_NAME, arguments: {} },
			});
			const response = await responding;

			assert.deepStrictEqual({
				peerRuntimeUri: peerEntry.sessionUri.toString(),
				calls,
				toolSucceeded: response.result?.success,
			}, {
				// The bug this guards against: the peer runtime's own
				// `codex:/<threadId>` identity — neither the addressed AH
				// session nor the chat channel — must never reach the host.
				peerRuntimeUri: AgentSession.uri('codex', 'peer-thread').toString(),
				calls: [
					{ method: 'requiresConfirmation', chatUri: peerChat.toString() },
					{ method: 'executeTool', chatUri: peerChat.toString() },
				],
				toolSucceeded: true,
			});
		} finally {
			peer.dispose();
		}
	});
});

suite('CodexAgent chat backing durability', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function connect(agent: CodexAgent, peer: ITestPeer): void {
		connectPeer(agent, peer);
		agent['_refreshSkillHookCustomizations'] = async () => { };
		agent['_refreshSkillExtraRoots'] = async () => { };
	}

	/**
	 * Provision a session, let its prewarmed `thread/start` land on
	 * `threadId`, and drive the first send so the session-scoped materialize
	 * receipt — the one carrying the refreshed chat backing — is emitted.
	 */
	async function materializeSession(agent: CodexAgent, peer: ITestPeer, session: URI, chat: URI, folder: URI, threadId: string): Promise<IAgentMaterializeChatEvent> {
		const receipts: IAgentMaterializeChatEvent[] = [];
		const listener = agent.onDidMaterializeChat(e => receipts.push(e));
		try {
			await createSessionBackedChat(agent, chat, { configurationResource: session, resource: chat }, {
				workingDirectories: [folder],
				model: { id: COPILOT_TEST_MODEL },
			});
			const start = await readNextRequest(peer.outbound);
			peer.push({ id: start.id, result: { thread: { id: threadId, cwd: folder.fsPath } } });
			await agent['_sessions'].get(AgentSession.id(session))!.materializePromise;

			const sending = agent.chats.sendMessage(chat, 'hello', [folder], undefined, 'turn-1', undefined, undefined, { configurationResource: session, resource: chat });
			const turn = await readNextRequest(peer.outbound);
			peer.push({ id: turn.id, result: {} });
			await sending;
			// The overlay write that records the thread id is fire-and-forget.
			await new Promise(resolve => setImmediate(resolve));
			assert.strictEqual(receipts.length, 1);
			return receipts[0];
		} finally {
			listener.dispose();
		}
	}

	test('a thread started on a replaced app-server is resumed before its first turn', async () => {
		const agent = await createAgent(disposables);
		const firstPeer = disposables.add(createTestPeer());
		const secondPeer = disposables.add(createTestPeer());
		connect(agent, firstPeer);
		const firstConnection = agent['_connection'];
		assert.strictEqual(firstConnection.kind, 'ready');
		const session = AgentSession.uri('codex', 'start-response-reconnect-session');
		const chat = URI.parse(buildDefaultChatUri(session));
		const folder = URI.file('/repo/start-response-reconnect');

		try {
			await createSessionBackedChat(agent, chat, { configurationResource: session, resource: chat }, {
				workingDirectories: [folder],
				model: { id: COPILOT_TEST_MODEL },
			});
			const entry = agent['_sessions'].get(AgentSession.id(session))!;
			const materializing = agent['_materializeIfNeeded'](entry, session, false);
			const start = await readNextRequest(firstPeer.outbound);
			assert.strictEqual(start.method, 'thread/start');

			// The old process can finish a request after connection ownership has
			// moved. Its thread exists durably, but it is not loaded in the new one.
			connect(agent, secondPeer);
			firstPeer.push({ id: start.id, result: { thread: { id: 'start-response-reconnect-thread', cwd: folder.fsPath } } });
			await materializing;
			assert.strictEqual(entry.needsResume, true);

			const sending = agent.chats.sendMessage(chat, 'first turn', [folder], undefined, 'turn-1', undefined, undefined, { configurationResource: session, resource: chat });
			const resume = await readNextRequest(secondPeer.outbound);
			assert.strictEqual(resume.method, 'thread/resume');
			secondPeer.push({ id: resume.id, result: { thread: { id: 'start-response-reconnect-thread', cwd: folder.fsPath }, cwd: folder.fsPath } });
			const inventory = await readNextRequest(secondPeer.outbound);
			assert.strictEqual(inventory.method, 'mcpServerStatus/list');
			secondPeer.push({ id: inventory.id, result: { data: [], nextCursor: null } });
			const turn = await readNextRequest(secondPeer.outbound);
			assert.strictEqual(turn.method, 'turn/start');
			secondPeer.push({ id: turn.id, result: {} });
			await sending;

			assert.deepStrictEqual({
				resumeThreadId: resume.params.threadId,
				turnThreadId: turn.params.threadId,
				needsResume: entry.needsResume,
			}, {
				resumeThreadId: 'start-response-reconnect-thread',
				turnThreadId: 'start-response-reconnect-thread',
				needsResume: false,
			});
		} finally {
			if (firstConnection.kind === 'ready') {
				firstConnection.client.dispose();
			}
			firstPeer.dispose();
			secondPeer.dispose();
		}
	});

	test('a replacement app-server resumes materialized sessions before their next turn', async () => {
		const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true, sessionStore: createTestSessionStore() });
		const firstPeer = disposables.add(createTestPeer());
		const secondPeer = disposables.add(createTestPeer());
		connect(agent, firstPeer);
		const session = AgentSession.uri('codex', 'reconnect-session');
		const chat = URI.parse(buildDefaultChatUri(session));
		const folder = URI.file('/repo/reconnect');

		try {
			await materializeSession(agent, firstPeer, session, chat, folder, 'reconnect-thread');
			const lostConnection = agent['_connection'];
			assert.strictEqual(lostConnection.kind, 'ready');
			agent['_handleConnectionLost'](lostConnection as never, agent['_connectionGeneration']);

			const restored = agent['_sessions'].get(AgentSession.id(session))!;
			assert.deepStrictEqual({
				connection: agent['_connection'].kind,
				needsResume: restored.needsResume,
				currentTurnId: restored.currentTurnId,
			}, {
				connection: 'idle',
				needsResume: true,
				currentTurnId: undefined,
			});

			connect(agent, secondPeer);
			const sending = agent.chats.sendMessage(chat, 'after reconnect', [folder], undefined, 'turn-2', undefined, undefined, { configurationResource: session, resource: chat });
			const resume = await readNextRequest(secondPeer.outbound);
			assert.strictEqual(resume.method, 'thread/resume');
			secondPeer.push({ id: resume.id, result: { thread: { id: 'reconnect-thread', cwd: folder.fsPath }, cwd: folder.fsPath } });
			const inventory = await readNextRequest(secondPeer.outbound);
			assert.strictEqual(inventory.method, 'mcpServerStatus/list');
			secondPeer.push({ id: inventory.id, result: { data: [], nextCursor: null } });
			const turn = await readNextRequest(secondPeer.outbound);
			secondPeer.push({ id: turn.id, result: {} });
			await sending;

			assert.deepStrictEqual({
				resumeThreadId: resume.params.threadId,
				turn: { method: turn.method, threadId: turn.params.threadId },
				needsResume: restored.needsResume,
			}, {
				resumeThreadId: 'reconnect-thread',
				turn: { method: 'turn/start', threadId: 'reconnect-thread' },
				needsResume: false,
			});
		} finally {
			firstPeer.dispose();
			secondPeer.dispose();
		}
	});

	test('drops thread history returned by a replaced app-server', async () => {
		const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true });
		const firstPeer = disposables.add(createTestPeer());
		const secondPeer = disposables.add(createTestPeer());
		connect(agent, firstPeer);
		const firstConnection = agent['_connection'];
		assert.strictEqual(firstConnection.kind, 'ready');
		const session = AgentSession.uri('codex', 'stale-history-session');
		const chat = URI.parse(buildDefaultChatUri(session));
		const folder = URI.file('/repo/stale-history');

		try {
			await createSessionBackedChat(agent, chat, { configurationResource: session, resource: chat }, {
				workingDirectories: [folder],
				model: { id: COPILOT_TEST_MODEL },
			});
			const entry = agent['_sessions'].get(AgentSession.id(session))!;
			entry.threadId = 'stale-history-thread';
			entry.needsResume = false;
			agent['_sessionIdByThreadId'].set(entry.threadId, entry.sessionId);

			const reading = agent['_readSession'](session, true);
			const staleRead = await readNextRequest(firstPeer.outbound);
			assert.strictEqual(staleRead.method, 'thread/read');
			connect(agent, secondPeer);
			firstPeer.push({
				id: staleRead.id,
				result: { thread: { id: entry.threadId, cwd: folder.fsPath, turns: [{ id: 'stale-turn' }] } },
			});
			const currentRead = await readNextRequest(secondPeer.outbound);
			assert.strictEqual(currentRead.method, 'thread/read');
			secondPeer.push({
				id: currentRead.id,
				result: { thread: { id: entry.threadId, cwd: folder.fsPath, turns: [{ id: 'current-turn' }] } },
			});

			assert.deepStrictEqual((await reading)?.thread.turns?.map(turn => turn.id), ['current-turn']);
		} finally {
			if (firstConnection.kind === 'ready') {
				firstConnection.client.dispose();
			}
			firstPeer.dispose();
			secondPeer.dispose();
		}
	});

	test('a disconnect during thread/resume retries on the replacement app-server', async () => {
		const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true, sessionStore: createTestSessionStore() });
		const firstPeer = disposables.add(createTestPeer());
		const secondPeer = disposables.add(createTestPeer());
		const thirdPeer = disposables.add(createTestPeer());
		connect(agent, firstPeer);
		const session = AgentSession.uri('codex', 'resume-request-reconnect-session');
		const chat = URI.parse(buildDefaultChatUri(session));
		const folder = URI.file('/repo/resume-request-reconnect');

		try {
			await materializeSession(agent, firstPeer, session, chat, folder, 'resume-request-reconnect-thread');
			const firstConnection = agent['_connection'];
			assert.strictEqual(firstConnection.kind, 'ready');
			agent['_handleConnectionLost'](firstConnection as never, agent['_connectionGeneration']);
			connect(agent, secondPeer);

			const sending = agent.chats.sendMessage(chat, 'retry resume', [folder], undefined, 'turn-2', undefined, undefined, { configurationResource: session, resource: chat });
			const interruptedResume = await readNextRequest(secondPeer.outbound);
			assert.strictEqual(interruptedResume.method, 'thread/resume');
			const secondConnection = agent['_connection'];
			assert.strictEqual(secondConnection.kind, 'ready');
			agent['_handleConnectionLost'](secondConnection as never, agent['_connectionGeneration']);
			connect(agent, thirdPeer);

			const retriedResume = await readNextRequest(thirdPeer.outbound);
			assert.strictEqual(retriedResume.method, 'thread/resume');
			thirdPeer.push({ id: retriedResume.id, result: { thread: { id: 'resume-request-reconnect-thread', cwd: folder.fsPath }, cwd: folder.fsPath } });
			const inventory = await readNextRequest(thirdPeer.outbound);
			assert.strictEqual(inventory.method, 'mcpServerStatus/list');
			thirdPeer.push({ id: inventory.id, result: { data: [], nextCursor: null } });
			const turn = await readNextRequest(thirdPeer.outbound);
			assert.strictEqual(turn.method, 'turn/start');
			thirdPeer.push({ id: turn.id, result: {} });
			await sending;

			assert.deepStrictEqual({
				interrupted: interruptedResume.params.threadId,
				retried: retriedResume.params.threadId,
				turn: turn.params.threadId,
			}, {
				interrupted: 'resume-request-reconnect-thread',
				retried: 'resume-request-reconnect-thread',
				turn: 'resume-request-reconnect-thread',
			});
		} finally {
			firstPeer.dispose();
			secondPeer.dispose();
			thirdPeer.dispose();
		}
	});

	test('a send carries a replacement connection forward after resuming on it', async () => {
		const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true, sessionStore: createTestSessionStore() });
		const firstPeer = disposables.add(createTestPeer());
		const secondPeer = disposables.add(createTestPeer());
		connect(agent, firstPeer);
		const session = AgentSession.uri('codex', 'mid-send-reconnect-session');
		const chat = URI.parse(buildDefaultChatUri(session));
		const folder = URI.file('/repo/mid-send-reconnect');

		try {
			await materializeSession(agent, firstPeer, session, chat, folder, 'mid-send-reconnect-thread');
			const buildCustomizationLaunch = agent['_buildCustomizationLaunch'].bind(agent);
			let replaceDuringNextBuild = true;
			agent['_buildCustomizationLaunch'] = async entry => {
				const result = await buildCustomizationLaunch(entry);
				if (replaceDuringNextBuild) {
					replaceDuringNextBuild = false;
					const lostConnection = agent['_connection'];
					assert.strictEqual(lostConnection.kind, 'ready');
					agent['_handleConnectionLost'](lostConnection as never, agent['_connectionGeneration']);
					connect(agent, secondPeer);
				}
				return result;
			};

			const sending = agent.chats.sendMessage(chat, 'after mid-send reconnect', [folder], undefined, 'turn-2', undefined, undefined, { configurationResource: session, resource: chat });
			const resume = await readNextRequest(secondPeer.outbound);
			assert.strictEqual(resume.method, 'thread/resume');
			secondPeer.push({ id: resume.id, result: { thread: { id: 'mid-send-reconnect-thread', cwd: folder.fsPath }, cwd: folder.fsPath } });
			const inventory = await readNextRequest(secondPeer.outbound);
			secondPeer.push({ id: inventory.id, result: { data: [], nextCursor: null } });
			const turn = await readNextRequest(secondPeer.outbound);
			secondPeer.push({ id: turn.id, result: {} });
			await sending;

			assert.deepStrictEqual({
				resume: { method: resume.method, threadId: resume.params.threadId },
				turn: { method: turn.method, threadId: turn.params.threadId },
			}, {
				resume: { method: 'thread/resume', threadId: 'mid-send-reconnect-thread' },
				turn: { method: 'turn/start', threadId: 'mid-send-reconnect-thread' },
			});
		} finally {
			firstPeer.dispose();
			secondPeer.dispose();
		}
	});

	test('a disconnect after turn/start is sent finalizes the turn exactly once', async () => {
		const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true, sessionStore: createTestSessionStore() });
		const peer = disposables.add(createTestPeer());
		connect(agent, peer);
		const session = AgentSession.uri('codex', 'disconnect-during-turn-start');
		const chat = URI.parse(buildDefaultChatUri(session));
		const folder = URI.file('/repo/disconnect-during-turn-start');

		try {
			await materializeSession(agent, peer, session, chat, folder, 'disconnect-during-turn-start-thread');
			const signals: AgentSignal[] = [];
			const listener = agent.onDidChatProgress(signal => signals.push(signal));
			try {
				const sending = agent.chats.sendMessage(chat, 'disconnect now', [folder], undefined, 'turn-2', undefined, undefined, { configurationResource: session, resource: chat });
				const turn = await readNextRequest(peer.outbound);
				assert.strictEqual(turn.method, 'turn/start');
				const lostConnection = agent['_connection'];
				assert.strictEqual(lostConnection.kind, 'ready');
				agent['_handleConnectionLost'](lostConnection as never, agent['_connectionGeneration']);
				await sending;
			} finally {
				listener.dispose();
			}

			assert.deepStrictEqual(signals.flatMap(signal => signal.kind === 'action'
				? [{ type: signal.action.type, errorType: signal.action.type === ActionType.ChatError ? signal.action.part.error.errorType : undefined }]
				: []), [
				{ type: ActionType.ChatError, errorType: 'CodexDisconnected' },
				{ type: ActionType.ChatTurnComplete, errorType: undefined },
			]);
		} finally {
			peer.dispose();
		}
	});

	test('passive archive changes use one-off connections without activating Codex', async () => {
		const agent = await createAgent(disposables);
		const archivePeer = disposables.add(createTestPeer());
		const unarchivePeer = disposables.add(createTestPeer());

		try {
			const session = AgentSession.uri('codex', 'idle-archive-session');
			const chat = URI.parse(buildDefaultChatUri(session));
			await createSessionBackedChat(agent, chat, { configurationResource: session, resource: chat }, {
				workingDirectories: [URI.file('/repo/idle-archive')],
				model: { id: COPILOT_TEST_MODEL },
			});
			const entry = agent['_sessions'].get(AgentSession.id(session))!;
			entry.threadId = 'idle-archive-thread';
			agent['_sessionIdByThreadId'].set(entry.threadId, entry.sessionId);
			agent['_activated'] = false;
			agent['_connection'] = { kind: 'idle' };
			await agent['_startupAccountProbe'].p;

			const peers = [archivePeer, unarchivePeer];
			const disposed: string[] = [];
			let connectionStarts = 0;
			agent['_startRawConnection'] = async () => {
				const peer = peers[connectionStarts++];
				return {
					client: new CodexAppServerClient(peer.transport),
					proxyHandle: { dispose: () => disposed.push(`proxy-${connectionStarts}`) },
					child: { kill: () => { disposed.push(`child-${connectionStarts}`); return true; } },
				} as never;
			};

			const archiving = agent.onArchivedChanged(session, true);
			const archive = await readNextRequest(archivePeer.outbound);
			archivePeer.push({ id: archive.id, result: {} });
			await archiving;

			const unarchiving = agent.onArchivedChanged(session, false);
			const unarchive = await readNextRequest(unarchivePeer.outbound);
			unarchivePeer.push({ id: unarchive.id, result: {} });
			await unarchiving;

			assert.deepStrictEqual({
				connectionStarts,
				activated: agent['_activated'],
				connection: agent['_connection'].kind,
				disposed,
				requests: [
					{ method: archive.method, threadId: archive.params.threadId },
					{ method: unarchive.method, threadId: unarchive.params.threadId },
				],
			}, {
				connectionStarts: 2,
				activated: false,
				connection: 'idle',
				disposed: ['proxy-1', 'child-1', 'proxy-2', 'child-2'],
				requests: [
					{ method: 'thread/archive', threadId: 'idle-archive-thread' },
					{ method: 'thread/unarchive', threadId: 'idle-archive-thread' },
				],
			});
		} finally {
			archivePeer.dispose();
			unarchivePeer.dispose();
		}
	});

	test('passive archive resolves a discovered thread from the session URI when no overlay exists', async () => {
		const agent = await createAgent(disposables);
		const peer = disposables.add(createTestPeer());
		const session = AgentSession.uri('codex', 'cold-discovered-thread');
		agent['_activated'] = false;
		agent['_connection'] = { kind: 'idle' };
		await agent['_startupAccountProbe'].p;
		let connectionStarts = 0;
		agent['_startRawConnection'] = async () => {
			connectionStarts++;
			return {
				client: new CodexAppServerClient(peer.transport),
				proxyHandle: { dispose() { } },
				child: { kill: () => true },
			} as never;
		};

		const archiving = agent.onArchivedChanged(session, true);
		const request = await readNextRequest(peer.outbound);
		peer.push({ id: request.id, result: {} });
		await archiving;

		assert.deepStrictEqual({
			connectionStarts,
			method: request.method,
			threadId: request.params.threadId,
			activated: agent['_activated'],
			connection: agent['_connection'].kind,
		}, {
			connectionStarts: 1,
			method: 'thread/archive',
			threadId: 'cold-discovered-thread',
			activated: false,
			connection: 'idle',
		});
	});

	test('materializeChat advertises server tools for an already-restored runtime', async () => {
		const agent = await createAgent(disposables);
		const session = AgentSession.uri('codex', 'existing-restore-advertise');
		const chat = URI.parse(buildDefaultChatUri(session));
		const context = { configurationResource: session, resource: chat };
		const created = await createSessionBackedChat(agent, chat, context);
		const entry = agent['_sessions'].get(AgentSession.id(session))!;
		assert.strictEqual(entry.serverToolsAdvertisement, undefined);
		const advertised: string[] = [];
		agent.setServerToolHost(createRecordingServerToolHost(advertised));

		await agent.materializeChat(chat, context, created.providerData);

		assert.deepStrictEqual({ advertised, serverToolsAdvertisement: entry.serverToolsAdvertisement }, {
			advertised: [session.toString()],
			serverToolsAdvertisement: session.toString(),
		});
	});

	test('materializeChat rejects missing peer and corrupt default providerData', async () => {
		const agent = await createAgent(disposables);
		const session = AgentSession.uri('codex', 'invalid-backing');
		const peer = URI.parse(buildChatUri(session, 'peer'));
		const defaultChat = URI.parse(buildDefaultChatUri(session));

		const missingPeer = await agent.materializeChat(peer, { configurationResource: session, resource: peer }, undefined);
		const corruptDefault = await agent.materializeChat(defaultChat, { configurationResource: session, resource: defaultChat }, '{');

		assert.deepStrictEqual({
			missingPeer,
			corruptDefault,
			sessions: [...agent['_sessions'].keys()],
		}, {
			missingPeer: undefined,
			corruptDefault: undefined,
			sessions: [],
		});
	});

	test('materializeChat replaces a restored backing that has no rollout', async () => {
		const sessionStore = createTestSessionStore();
		const runtime = AgentSession.uri('codex', 'durable-peer-runtime');
		const owningSession = AgentSession.uri('codex', 'owning-session');
		const chat = URI.parse(buildChatUri(owningSession, 'restored-peer'));
		const context = { configurationResource: owningSession, resource: chat };
		const folder = URI.file('/repo/restored-peer');
		const database = sessionStore.databaseFor(runtime);
		await Promise.all([
			database.setMetadata('codex.threadId', 'missing-rollout-thread'),
			database.setMetadata('codex.cwd', folder.toString()),
			database.setMetadata('codex.model', COPILOT_TEST_MODEL),
		]);
		const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true, sessionStore });
		const peer = disposables.add(createTestPeer());
		connect(agent, peer);
		const receipts: IAgentMaterializeChatEvent[] = [];
		const listener = agent.onDidMaterializeChat(event => receipts.push(event));

		try {
			await agent.materializeChat(chat, context, JSON.stringify({
				sessionId: AgentSession.id(runtime),
				model: { id: COPILOT_TEST_MODEL },
			}));
			const materializedBeforeReplacement = agent['_sessions'].get(AgentSession.id(runtime))?.materializedEventFired;
			const reading = agent.chats.getMessages(chat, context);
			const resume = await readNextRequest(peer.outbound);
			peer.push({ id: resume.id, error: { code: -32000, message: 'no rollout found for thread id missing-rollout-thread' } });
			const start = await readNextRequest(peer.outbound);
			peer.push({ id: start.id, result: { thread: { id: 'replacement-thread', cwd: folder.fsPath } } });
			const read = await readNextRequest(peer.outbound);
			peer.push({ id: read.id, result: { thread: { id: 'replacement-thread', cwd: folder.fsPath, turns: [] } } });
			const turns = await reading;
			await new Promise(resolve => setImmediate(resolve));
			assert.strictEqual(receipts.length, 1);
			const restored = receipts[0].result;

			assert.deepStrictEqual({
				materializedBeforeReplacement,
				rematerializationReceipts: receipts.length,
				resume: { method: resume.method, threadId: resume.params.threadId },
				start: { method: start.method, cwd: start.params.cwd },
				read: { method: read.method, threadId: read.params.threadId },
				providerData: restored?.providerData ? JSON.parse(restored.providerData) : undefined,
				backingSession: restored?.backingSession?.toString(),
				boundRuntime: agent['_sessionIdByChatUri'].get(chat.toString()),
				restoredThreadId: agent['_sessions'].get(AgentSession.id(runtime))?.threadId,
				persistedThreadId: await database.getMetadata('codex.threadId'),
				turns,
			}, {
				materializedBeforeReplacement: true,
				rematerializationReceipts: 1,
				resume: { method: 'thread/resume', threadId: 'missing-rollout-thread' },
				start: { method: 'thread/start', cwd: folder.fsPath },
				read: { method: 'thread/read', threadId: 'replacement-thread' },
				providerData: { sessionId: AgentSession.id(runtime), model: { id: COPILOT_TEST_MODEL } },
				backingSession: AgentSession.uri('codex', 'replacement-thread').toString(),
				boundRuntime: AgentSession.id(runtime),
				restoredThreadId: 'replacement-thread',
				persistedThreadId: 'replacement-thread',
				turns: [],
			});
		} finally {
			listener.dispose();
			peer.dispose();
		}
	});

	test('persists the app-server turn id for restored turn metadata', async () => {
		const sessionStore = createTestSessionStore();
		const session = AgentSession.uri('codex', 'turn-id-mapping');
		const chat = URI.parse(buildDefaultChatUri(session));
		const folder = URI.file('/repo/turn-id-mapping');
		const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true, sessionStore });
		const peer = disposables.add(createTestPeer());
		connect(agent, peer);

		try {
			await materializeSession(agent, peer, session, chat, folder, 'codex-thread');
			const codexSession = agent['_sessions'].get(AgentSession.id(session))!;
			agent['_handleTurnStartedNotification'](codexSession, {
				threadId: 'codex-thread',
				turn: {
					id: 'app-turn-1',
					items: [],
					itemsView: 'full',
					status: 'inProgress',
					error: null,
					startedAt: null,
					completedAt: null,
					durationMs: null,
				},
			});
			await new Promise(resolve => setImmediate(resolve));

			assert.deepStrictEqual(sessionStore.databaseFor(session).setTurnEventIdCalls, [{
				turnId: 'turn-1',
				eventId: 'app-turn-1',
			}]);
		} finally {
			peer.dispose();
		}
	});

	test('materializeChat rolls back a newly restored runtime when server-tool advertisement fails', async () => {
		const agent = await createAgent(disposables);
		const session = AgentSession.uri('codex', 'restore-fail-advertise');
		const chat = URI.parse(buildDefaultChatUri(session));
		agent.setServerToolHost(createThrowingAdvertiseServerToolHost('restore advertise boom'));

		await assert.rejects(
			agent.materializeChat(chat, { configurationResource: session, resource: chat }, JSON.stringify({ sessionId: 'restored-backing' })),
			/restore advertise boom/,
		);

		assert.deepStrictEqual({
			hasSession: agent['_sessions'].has('restored-backing'),
			hasBinding: agent['_sessionIdByChatUri'].has(chat.toString()),
			hasConfigScope: agent['_configScopeByChat'].has(chat.toString()),
		}, {
			hasSession: false,
			hasBinding: false,
			hasConfigScope: false,
		});
	});

	test('the materialize receipt re-keys the chat backing onto the runtime, so a restored session stays addressable', async () => {
		const sessionStore = createTestSessionStore();
		const session = AgentSession.uri('codex', 'host-session');
		const chat = URI.parse(buildDefaultChatUri(session));
		const folder = URI.file('/repo/durable');
		const first = await createAgent(disposables, { sdkResolvableWithoutDownload: true, sessionStore });
		const firstPeer = disposables.add(createTestPeer());
		connect(first, firstPeer);
		let secondPeer: ITestPeer | undefined;

		try {
			const receipt = await materializeSession(first, firstPeer, session, chat, folder, 'codex-thread');

			// A host restart: a brand-new agent is offered nothing but the
			// persisted backing blob and the URIs Agent Host owns.
			const second = await createAgent(disposables, { sdkResolvableWithoutDownload: true, sessionStore });
			secondPeer = disposables.add(createTestPeer());
			connect(second, secondPeer);
			const signals: AgentSignal[] = [];
			disposables.add(second.onDidChatProgress(signal => signals.push(signal)));

			const restoring = second.getChatMetadata(chat, { configurationResource: session, resource: chat }, receipt.result?.providerData);
			const originalProbe = await readNextRequest(secondPeer.outbound);
			assert.strictEqual(originalProbe.params.threadId, 'host-session');
			assert.strictEqual(originalProbe.params.includeTurns, false);
			secondPeer.push({ id: originalProbe.id, error: { code: -32000, message: 'thread not found' } });
			const read = await readNextRequest(secondPeer.outbound);
			assert.strictEqual(read.params.threadId, 'codex-thread');
			assert.strictEqual(read.params.includeTurns, false);
			secondPeer.push({ id: read.id, result: { thread: { id: 'codex-thread', cwd: folder.fsPath, modelProvider: 'vscode-proxy', turns: [] } } });
			await restoring;
			assert.strictEqual(secondPeer.outbound.readableLength, 0);
			await second.materializeChat(chat, { configurationResource: session, resource: chat }, receipt.result?.providerData);

			// Ambient discovery can finish after the registered session restore and
			// describe the same Codex thread through its native session id. It must
			// not steal notification routing from the materialized host chat.
			const externalSession = AgentSession.uri('codex', 'codex-thread');
			const externalChat = URI.parse(buildDefaultChatUri(externalSession));
			const discovering = second.getChatMetadata(externalChat, { configurationResource: externalSession, resource: externalChat });
			const discoveryRead = await readNextRequest(secondPeer.outbound);
			secondPeer.push({ id: discoveryRead.id, result: { thread: { id: 'codex-thread', cwd: folder.fsPath, modelProvider: 'vscode-proxy', turns: [] } } });
			await discovering;

			// Cleaning up the unbound ambient entry must leave the route owned by
			// the materialized host chat intact. Exercise the same in-memory teardown
			// used by chat release, then dispatch a synthetic thread notification
			// through the production routing seam.
			const ambient = second['_sessions'].get('codex-thread')!;
			const cleaningAmbient = second['_teardownSessionInMemory'](ambient, ambient.sessionId, false);
			const ambientUnsubscribe = await readNextRequest(secondPeer.outbound);
			secondPeer.push({ id: ambientUnsubscribe.id, result: {} });
			await cleaningAmbient;
			let notificationSession: string | undefined;
			second['_dispatchByThread']('codex-thread', routed => {
				notificationSession = routed.sessionId;
				return [];
			});

			// Drive a turn on the restored chat and fail it at `turn/start`, so
			// the runtime also has to route the resulting actions to its bound chat.
			const resending = second.chats.sendMessage(chat, 'again', [folder], undefined, 'turn-2', undefined, undefined, { configurationResource: session, resource: chat });
			const unsubscribe = await readNextRequest(secondPeer.outbound);
			secondPeer.push({ id: unsubscribe.id, result: {} });
			const resume = await readNextRequest(secondPeer.outbound);
			secondPeer.push({ id: resume.id, result: { thread: { id: 'codex-thread', cwd: folder.fsPath }, cwd: folder.fsPath } });
			const inventory = await readNextRequest(secondPeer.outbound);
			secondPeer.push({ id: inventory.id, result: { data: [], nextCursor: null } });
			const turn = await readNextRequest(secondPeer.outbound);
			secondPeer.push({ id: turn.id, error: { code: -32000, message: 'turn rejected' } });
			await resending;

			const restored = second['_sessions'].get('host-session');
			assert.deepStrictEqual({
				backingSessionId: JSON.parse(receipt.result!.providerData!).sessionId,
				backingSession: receipt.result?.backingSession?.toString(),
				restoredThreadId: restored?.threadId,
				restoredSessionUri: restored?.sessionUri.toString(),
				restoredChatChannel: restored?.chatChannel?.toString(),
				hasAmbientRuntime: second['_sessions'].has('codex-thread'),
				ambientUnsubscribe: { method: ambientUnsubscribe.method, threadId: ambientUnsubscribe.params.threadId },
				notificationSession,
				routedSession: second['_sessionIdByThreadId'].get('codex-thread'),
				discovery: { method: discoveryRead.method, threadId: discoveryRead.params.threadId },
				unsubscribe: { method: unsubscribe.method, threadId: unsubscribe.params.threadId },
				resume: { method: resume.method, threadId: resume.params.threadId },
				turnActions: signals.flatMap(signal => signal.kind === 'action'
					? [{ resource: signal.resource.toString(), type: signal.action.type }]
					: []),
			}, {
				// The runtime's own durable id — not the app-server thread id,
				// which the metadata overlay owns and a rematerialization
				// replaces.
				backingSessionId: 'host-session',
				backingSession: AgentSession.uri('codex', 'codex-thread').toString(),
				restoredThreadId: 'codex-thread',
				restoredSessionUri: session.toString(),
				restoredChatChannel: chat.toString(),
				hasAmbientRuntime: false,
				ambientUnsubscribe: { method: 'thread/unsubscribe', threadId: 'codex-thread' },
				notificationSession: 'host-session',
				routedSession: 'host-session',
				discovery: { method: 'thread/read', threadId: 'codex-thread' },
				unsubscribe: { method: 'thread/unsubscribe', threadId: 'codex-thread' },
				resume: { method: 'thread/resume', threadId: 'codex-thread' },
				turnActions: [
					{ resource: chat.toString(), type: ActionType.ChatError },
					{ resource: chat.toString(), type: ActionType.ChatTurnComplete },
				],
			});
		} finally {
			firstPeer.dispose();
			secondPeer?.dispose();
		}
	});

	test('a restored runtime is addressed by the id its backing names, never by the session that asked for it', async () => {
		const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true, sessionStore: createTestSessionStore() });
		const peer = disposables.add(createTestPeer());
		connect(agent, peer);
		const advertised: string[] = [];
		agent.setServerToolHost(createRecordingServerToolHost(advertised));

		try {
			// A backing that names a different runtime than the addressed
			// session — what a peer chat's blob looks like, and what any
			// re-keyed backing would look like after a restart.
			const addressed = AgentSession.uri('codex', 'addressed-session');
			const chat = URI.parse(buildDefaultChatUri(addressed));
			const context = { configurationResource: addressed, resource: chat };
			const restoring = agent.getChatMetadata(chat, context, JSON.stringify({ sessionId: 'backing-runtime' }));
			const read = await readNextRequest(peer.outbound);
			assert.strictEqual(read.params.includeTurns, false);
			peer.push({ id: read.id, result: { thread: { id: 'backing-thread', cwd: '/repo/addressed', turns: [] } } });
			const metadata = await restoring;
			assert.strictEqual(peer.outbound.readableLength, 0);

			const restored = agent['_sessions'].get('backing-runtime');
			assert.deepStrictEqual({
				metadataChat: metadata?.chat.toString(),
				// The entry's own URI must round-trip to the key it is stored
				// under; stamping it with the addressed session would leave
				// every entry→map lookup pointing at a runtime that does not
				// exist.
				restoredSessionUri: restored?.sessionUri.toString(),
				restoredThreadId: restored?.threadId,
				addressedRuntimeExists: agent['_sessions'].has('addressed-session'),
				// Server tools are session-scoped, so they are advertised on
				// the session Agent Host addressed — the only URI it knows.
				advertised,
			}, {
				metadataChat: chat.toString(),
				restoredSessionUri: AgentSession.uri('codex', 'backing-runtime').toString(),
				restoredThreadId: 'backing-thread',
				addressedRuntimeExists: false,
				advertised: [addressed.toString()],
			});
		} finally {
			peer.dispose();
		}
	});

	test('a live runtime answers metadata from memory with real timestamps instead of a 1970 placeholder', async () => {
		const sessionStore = createTestSessionStore();
		const session = AgentSession.uri('codex', 'live-session');
		const chat = URI.parse(buildDefaultChatUri(session));
		const folder = URI.file('/repo/live');
		const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true, sessionStore });
		const peer = disposables.add(createTestPeer());
		connect(agent, peer);

		try {
			const before = Date.now();
			await materializeSession(agent, peer, session, chat, folder, 'live-thread');

			// No app-server traffic: the codex app-server cannot answer
			// `thread/read` for a thread of its own that is blocked waiting on a
			// dynamic tool call, which is exactly the state a session server
			// tool runs in.
			const metadata = await agent.getChatMetadata(chat, { configurationResource: session, resource: chat }, JSON.stringify({ sessionId: 'live-session' }));

			assert.deepStrictEqual({
				chat: metadata?.chat.toString(),
				workingDirectories: metadata?.workingDirectories?.map(directory => directory.fsPath),
				// Real clock values: `0` would date the session to 1970 and
				// invert the host's created-before / created-after filters.
				startedInThisRun: (metadata?.startTime ?? 0) >= before,
				modifiedAtOrAfterStart: (metadata?.modifiedTime ?? 0) >= (metadata?.startTime ?? 0),
			}, {
				chat: chat.toString(),
				workingDirectories: [folder.fsPath],
				startedInThisRun: true,
				modifiedAtOrAfterStart: true,
			});
		} finally {
			peer.dispose();
		}
	});

	test('a live provisional runtime answers metadata without reading a nonexistent thread', async () => {
		const agent = await createAgent(disposables);
		const session = AgentSession.uri('codex', 'live-provisional-metadata');
		const chat = URI.parse(buildDefaultChatUri(session));
		const context = { configurationResource: session, resource: chat };
		const before = Date.now();
		const created = await createSessionBackedChat(agent, chat, context);
		let reads = 0;
		agent['_readSession'] = async () => {
			reads++;
			throw new Error('provisional metadata must not read an app-server thread');
		};

		const metadata = await agent.getChatMetadata(chat, context, created.providerData);

		assert.deepStrictEqual({
			reads,
			chat: metadata?.chat.toString(),
			startedInThisRun: (metadata?.startTime ?? 0) >= before,
			workingDirectories: metadata?.workingDirectories,
			model: metadata?.model,
		}, {
			reads: 0,
			chat: chat.toString(),
			startedInThisRun: true,
			workingDirectories: undefined,
			model: { id: COPILOT_TEST_MODEL },
		});
	});

	test('a restored runtime preserves its thread summary in subsequent live metadata lookups', async () => {
		const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true, sessionStore: createTestSessionStore() });
		const peer = disposables.add(createTestPeer());
		connect(agent, peer);

		try {
			const session = AgentSession.uri('codex', 'named-session');
			const chat = URI.parse(buildDefaultChatUri(session));
			const context = { configurationResource: session, resource: chat };
			const providerData = JSON.stringify({ sessionId: 'named-session' });
			const restoring = agent.getChatMetadata(chat, context, providerData);
			const read = await readNextRequest(peer.outbound);
			assert.strictEqual(read.method, 'thread/read');
			assert.strictEqual(read.params.includeTurns, false);
			peer.push({
				id: read.id,
				result: {
					thread: {
						id: 'named-thread',
						name: 'Investigate session title loss',
						cwd: '/repo/named',
						createdAt: 1_700_000_000,
						updatedAt: 1_700_000_100,
						turns: [],
					},
				},
			});

			const coldMetadata = await restoring;
			// The first lookup registers a live runtime. The second must retain
			// the title without another app-server request: that server may be
			// blocked waiting on the very dynamic tool call requesting metadata.
			const liveMetadata = await agent.getChatMetadata(chat, context, providerData);

			assert.deepStrictEqual({
				coldSummary: coldMetadata?.summary,
				liveSummary: liveMetadata?.summary,
				liveStartTime: liveMetadata?.startTime,
				liveModifiedTime: liveMetadata?.modifiedTime,
				pendingAppServerBytes: peer.outbound.readableLength,
			}, {
				coldSummary: 'Investigate session title loss',
				liveSummary: 'Investigate session title loss',
				liveStartTime: 1_700_000_000_000,
				liveModifiedTime: 1_700_000_100_000,
				pendingAppServerBytes: 0,
			});
		} finally {
			peer.dispose();
		}
	});

	test('live peer metadata resolves the peer backing instead of the owning default chat', async () => {
		const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true, sessionStore: createTestSessionStore() });
		const session = AgentSession.uri('codex', 'metadata-owner');
		const defaultChat = URI.parse(buildDefaultChatUri(session));
		const peerChat = URI.parse(buildChatUri(session, 'metadata-peer'));
		await agent.materializeChat(defaultChat, { configurationResource: session, resource: defaultChat }, JSON.stringify({ sessionId: 'default-runtime' }));
		await agent.materializeChat(peerChat, { configurationResource: session, resource: peerChat }, JSON.stringify({ sessionId: 'peer-runtime' }));
		agent['_sessions'].get('default-runtime')!.workingDirectory = URI.file('/repo/default');
		agent['_sessions'].get('peer-runtime')!.workingDirectory = URI.file('/repo/peer');

		const metadata = await agent.getChatMetadata(
			peerChat,
			{ configurationResource: session, resource: peerChat },
			JSON.stringify({ sessionId: 'peer-runtime' }),
		);

		assert.deepStrictEqual({
			chat: metadata?.chat.toString(),
			workingDirectories: metadata?.workingDirectories?.map(directory => directory.fsPath),
		}, {
			chat: peerChat.toString(),
			workingDirectories: [URI.file('/repo/peer').fsPath],
		});
	});

	test('a forked session hands back its backing on creation, since it never emits a first-send materialize receipt', async () => {
		const sessionStore = createTestSessionStore();
		const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true, sessionStore });
		const peer = disposables.add(createTestPeer());
		connect(agent, peer);

		try {
			const source = AgentSession.uri('codex', 'fork-source');
			const sourceChat = URI.parse(buildDefaultChatUri(source));
			const folder = URI.file('/repo/fork-backing');
			await materializeSession(agent, peer, source, sourceChat, folder, 'source-thread');

			const forkSession = AgentSession.uri('codex', 'fork-target');
			const forkChat = URI.parse(buildDefaultChatUri(forkSession));
			const forking = createSessionBackedChat(agent, forkChat, { configurationResource: forkSession, resource: forkChat }, {
				fork: { source: sourceChat, turnId: 'turn-1', turnIndex: 0 },
			});
			const read = await readNextRequest(peer.outbound);
			peer.push({ id: read.id, result: { thread: { id: 'source-thread', cwd: folder.fsPath, turns: [{ id: 'turn-1' }] } } });
			const fork = await readNextRequest(peer.outbound);
			peer.push({ id: fork.id, result: { thread: { id: 'forked-thread', cwd: folder.fsPath }, cwd: folder.fsPath } });
			const forked = await forking;

			assert.deepStrictEqual({
				session: forked.session.toString(),
				// The fork is materialized on return, so `onDidMaterializeChat`
				// never fires for it — the create result is the host's only
				// chance to persist a backing it can restore from. The blob names
				// the runtime's own durable id, the thread id is decoupled into
				// the metadata overlay, and the thread itself is reported as the
				// exact backing so the host can mark it internal.
				backingSessionId: forked.providerData ? JSON.parse(forked.providerData).sessionId : undefined,
				backingSession: forked.backingSession?.toString(),
				runtimeSessionUri: agent['_sessions'].get('fork-target')?.sessionUri.toString(),
				runtimeThreadId: agent['_sessions'].get('fork-target')?.threadId,
			}, {
				session: forkSession.toString(),
				backingSessionId: 'fork-target',
				backingSession: AgentSession.uri('codex', 'forked-thread').toString(),
				runtimeSessionUri: forkSession.toString(),
				runtimeThreadId: 'forked-thread',
			});
		} finally {
			peer.dispose();
		}
	});
});
