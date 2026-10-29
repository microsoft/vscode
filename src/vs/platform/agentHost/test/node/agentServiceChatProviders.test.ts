/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { createInMemoryFileService } from '../../../files/test/common/inMemoryFileService.js';
import { NullLogService } from '../../../log/common/log.js';
import type { IProductService } from '../../../product/common/productService.js';
import type { IAgent, IAgentChatContext, IAgentChatMetadata, IAgentCreateChatResult, IAgentResolveChatConfigParams, IAgentSpawnChatEvent } from '../../common/agent.js';
import { ChatMoveConfigKey } from '../../common/agentHostChatMove.js';
import { ChatProvidersConfigKey } from '../../common/agentHostChatProviders.js';
import { AgentHostCodexEnabledConfigKey } from '../../common/agentHostSchema.js';
import type { ResolveSessionConfigResult } from '../../common/state/protocol/commands.js';
import { JsonRpcErrorCodes, ProtocolError } from '../../common/state/sessionProtocol.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { buildChatUri, MessageKind } from '../../common/state/sessionState.js';
import { decodeAgentHostCatalogPayload } from '../../node/agentHostCatalogProjection.js';
import { AgentHostDatabase } from '../../node/agentHostDatabase.js';
import type { AgentService } from '../../node/agentService.js';
import { createNoopGitService, createSessionDataService, TestSessionDatabase } from '../common/sessionTestHelpers.js';
import { disposeTestSessionStateDatabases } from './chatMetadataTestHelpers.js';
import { seedMultipleChatProvidersFromEnvironment } from '../../node/agentConfigurationService.js';
import { AgentHostMultipleChatProvidersEnabledEnvVar } from '../../common/agentService.js';
import { createTestAgentService, getTestAgentHostDatabase, getTestSessionStateStore, getTestAgentHostProviderService, getTestAgentServiceComposition, getTestAgentStateManager, registerTestAgentProvider } from './agentServiceTestUtils.js';
import { MockAgent } from './mockAgent.js';

/** A multi-chat agent whose chat config has a chat-settable `mode` and a session-only `isolationHint`. */
class ChatAgent extends MockAgent {
	readonly disposedChats: string[] = [];
	/** Runs inside the agent's chat creation, before Agent Host registers the chat. */
	onCreateChat: ((chat: URI) => void) | undefined;
	readonly spawnEmitter = new Emitter<IAgentSpawnChatEvent>();
	override readonly onDidSpawnChat = this.spawnEmitter.event;

	constructor(id: string, private readonly _defaultMode: string, multipleChats = true, multipleWorkingDirectories = false) {
		super(id, { ...(multipleChats ? { multipleChats: { fork: true, sideChat: true } } : {}), ...(multipleWorkingDirectories ? { multipleWorkingDirectories: {} } : {}) });
		const createChat = this.chats.createChat;
		this.chats.createChat = (chat, context, options) => {
			this.onCreateChat?.(chat);
			return createChat(chat, context, options);
		};
	}

	override async resolveChatConfig(params: IAgentResolveChatConfigParams): Promise<ResolveSessionConfigResult> {
		return {
			schema: {
				type: 'object',
				properties: {
					mode: { type: 'string', title: 'Mode', enum: ['agent', 'plan', 'ask'], default: this._defaultMode, chatMutable: true, sessionMutable: true },
					isolationHint: { type: 'string', title: 'Hint', default: `${this.id}-hint` },
				},
			},
			values: { mode: this._defaultMode, isolationHint: `${this.id}-hint`, ...params.config },
		};
	}

	override async createChat(_session: URI, _chat: URI): Promise<IAgentCreateChatResult> {
		return { providerData: `${this.id}-backing` };
	}

	override async disposeChat(_session: URI, chat: URI): Promise<void> {
		this.disposedChats.push(chat.toString());
	}

	/** Knows every session, as a restarted provider whose native catalog holds them does. */
	knowsAllSessions = false;

	override async getChatMetadata(chat: URI, context: URI | IAgentChatContext): Promise<IAgentChatMetadata | undefined> {
		return this.knowsAllSessions ? { chat, startTime: 1, modifiedTime: 1 } : super.getChatMetadata(chat, context);
	}

	override dispose(): void {
		this.spawnEmitter.dispose();
		super.dispose();
	}

	override async materializeChat(_chat: URI, _context: URI | IAgentChatContext, _providerData: string | undefined): Promise<void> { }
}

suite('AgentService - chats with their own agent', () => {

	const disposables = new DisposableStore();
	let fileService: FileService;

	setup(() => {
		fileService = createInMemoryFileService(disposables, Schemas.inMemory);
	});

	teardown(() => disposables.clear());
	teardown(() => disposeTestSessionStateDatabases());
	ensureNoDisposablesAreLeakedInTestSuite();

	function createService(enabled: boolean, options?: { readonly secondSupportsChats?: boolean; readonly catalogDatabase?: AgentHostDatabase; readonly sessionDatabase?: TestSessionDatabase; readonly folderPerChat?: 'copilot' | 'second' }) {
		const catalogDatabase = options?.catalogDatabase ?? disposables.add(new AgentHostDatabase(':memory:'));
		const service = disposables.add(createTestAgentService(
			new NullLogService(), fileService, createSessionDataService(options?.sessionDatabase ?? new TestSessionDatabase()),
			{ _serviceBrand: undefined } as IProductService, createNoopGitService(),
			undefined, undefined, undefined, undefined, undefined, [], undefined, undefined, catalogDatabase,
		));
		const copilot = disposables.add(new ChatAgent('copilot', 'plan', true, options?.folderPerChat === 'copilot'));
		const second = disposables.add(new ChatAgent('second', 'agent', options?.secondSupportsChats ?? true, options?.folderPerChat === 'second'));
		registerTestAgentProvider(service, copilot);
		registerTestAgentProvider(service, second);
		if (enabled) {
			getTestAgentServiceComposition(service).configurationService.updateRootConfig({ [ChatProvidersConfigKey.Enabled]: true });
		}
		return { service, copilot, second, catalogDatabase };
	}

	async function createSessionWithSecondChat(service: AgentService, name = 'second-chat') {
		const session = await service.createSession({ legacyChatUris: true, provider: 'copilot', workingDirectories: [URI.file('/repo')] });
		const chat = URI.parse(buildChatUri(session, name));
		await service.createChat(session, chat, { provider: 'second' });
		return { session, chat };
	}

	/** Completes a first turn in `chat`: a chat moves only once its first turn started. */
	function startTurn(service: AgentService, chat: URI | string): void {
		const stateManager = getTestAgentStateManager(service);
		stateManager.dispatchServerAction(chat.toString(), { type: ActionType.ChatTurnStarted, turnId: 'first-turn', startedAt: new Date(0).toISOString(), message: { text: 'Hello', origin: { kind: MessageKind.User } } });
		stateManager.dispatchServerAction(chat.toString(), { type: ActionType.ChatTurnComplete, turnId: 'first-turn', duration: 1 });
	}

	async function rejection(promise: Promise<unknown>): Promise<string | undefined> {
		try {
			await promise;
			return undefined;
		} catch (error) {
			return error instanceof ProtocolError && error.code === JsonRpcErrorCodes.InvalidParams ? 'InvalidParams' : String(error);
		}
	}

	/** The chats an agent was asked to create, its session's default chat included. */
	function createdIn(agent: MockAgent): string[] {
		return agent.chatContexts.filter(entry => entry.boundary === 'createChat').map(entry => entry.chat.toString());
	}

	function chatSummary(service: AgentService, session: URI, chat: URI) {
		return getTestAgentStateManager(service).getSessionState(session.toString())?.chats.find(candidate => candidate.resource === chat.toString());
	}

	test('a chat created with another agent is created in that agent and routed to it', async () => {
		const { service, copilot, second } = createService(true);
		const { session, chat } = await createSessionWithSecondChat(service);
		const providers = getTestAgentHostProviderService(service);
		const stateManager = getTestAgentStateManager(service);

		assert.deepStrictEqual({
			createdInSecond: createdIn(second),
			createdInCopilot: createdIn(copilot),
			summaryProvider: chatSummary(service, session, chat)?.provider,
			stateProvider: stateManager.getChatState(chat.toString())?.provider,
			listedProvider: stateManager.getSessionSummary(session.toString())?.chats?.find(candidate => candidate.resource === chat.toString())?.provider,
			chatAgent: providers.getProviderForChat(session, chat)?.id,
			defaultChatAgent: providers.getProviderForChat(session, stateManager.getSessionState(session.toString())?.defaultChat)?.id,
		}, {
			createdInSecond: [chat.toString()],
			createdInCopilot: [stateManager.getSessionState(session.toString())!.defaultChat],
			summaryProvider: 'second',
			stateProvider: 'second',
			listedProvider: 'second',
			chatAgent: 'second',
			defaultChatAgent: 'copilot',
		});
	});

	for (const folderPerChat of ['copilot', 'second'] as const) {
		test(`a chat's own workspace is checked against the chat's own agent, not its session's (folders per chat: ${folderPerChat})`, async () => {
			const { service } = createService(true, { folderPerChat });
			const session = await service.createSession({ legacyChatUris: true, provider: 'copilot', workingDirectories: [URI.file('/repo')] });
			const created = URI.parse(buildChatUri(session, 'created'));
			const placeholder = URI.parse(buildChatUri(session, 'placeholder'));
			await service.createChat(session, placeholder, { provider: 'second' });
			const refusal = (error: string | undefined) => error?.match(/provider (\w+) does not support a workspace per chat/)?.[1];

			assert.deepStrictEqual({
				createChat: refusal(await rejection(service.createChat(session, created, { provider: 'second', workspace: { kind: 'scratch' } }))),
				setChatWorkspace: refusal(await rejection(service.setChatWorkspace(session, placeholder, { kind: 'scratch' }))),
			}, folderPerChat === 'copilot'
				// The session's agent gives each chat its own folders, but the chat's own agent doesn't.
				? { createChat: 'second', setChatWorkspace: 'second' }
				: { createChat: undefined, setChatWorkspace: undefined });
		});
	}

	test('a chat without a requested agent, or requesting its session\'s, uses the session\'s agent and reports none', async () => {
		const { service, copilot } = createService(true);
		const session = await service.createSession({ legacyChatUris: true, provider: 'copilot' });
		const plain = URI.parse(buildChatUri(session, 'plain'));
		const explicit = URI.parse(buildChatUri(session, 'explicit'));
		await service.createChat(session, plain);
		await service.createChat(session, explicit, { provider: 'copilot' });

		assert.deepStrictEqual({
			created: createdIn(copilot).slice(1),
			providers: [chatSummary(service, session, plain)?.provider, chatSummary(service, session, explicit)?.provider],
		}, {
			created: [plain.toString(), explicit.toString()],
			providers: [undefined, undefined],
		});
	});

	test('rejects a requested agent when the setting is off, unknown, or without multiple chats', async () => {
		const off = createService(false);
		const offSession = await off.service.createSession({ legacyChatUris: true, provider: 'copilot' });
		const on = createService(true, { secondSupportsChats: false });
		const onSession = await on.service.createSession({ legacyChatUris: true, provider: 'copilot' });

		assert.deepStrictEqual({
			settingOff: await rejection(off.service.createChat(offSession, URI.parse(buildChatUri(offSession, 'off')), { provider: 'second' })),
			unknown: await rejection(on.service.createChat(onSession, URI.parse(buildChatUri(onSession, 'unknown')), { provider: 'missing' })),
			noMultipleChats: await rejection(on.service.createChat(onSession, URI.parse(buildChatUri(onSession, 'single')), { provider: 'second' })),
			created: [...createdIn(off.second), ...createdIn(on.second)],
			chats: [getTestAgentStateManager(off.service).getSessionState(offSession.toString())?.chats.length, getTestAgentStateManager(on.service).getSessionState(onSession.toString())?.chats.length],
		}, {
			settingOff: 'InvalidParams',
			unknown: 'InvalidParams',
			noMultipleChats: 'InvalidParams',
			created: [],
			chats: [1, 1],
		});
	});

	test('a fork keeps its source chat\'s agent and rejects another one', async () => {
		const { service, copilot, second } = createService(true);
		const { session, chat } = await createSessionWithSecondChat(service);
		const fork = URI.parse(buildChatUri(session, 'fork'));
		const mismatched = URI.parse(buildChatUri(session, 'mismatched'));

		const mismatch = await rejection(service.createChat(session, mismatched, { provider: 'copilot', fork: { source: chat, turnId: 'missing-turn' } }));
		await service.createChat(session, fork, { fork: { source: chat, turnId: 'missing-turn' } });

		assert.deepStrictEqual({
			mismatch,
			forkProvider: chatSummary(service, session, fork)?.provider,
			createdInSecond: createdIn(second),
			createdInCopilot: createdIn(copilot).filter(candidate => candidate !== getTestAgentStateManager(service).getSessionState(session.toString())?.defaultChat),
		}, {
			mismatch: 'InvalidParams',
			forkProvider: 'second',
			createdInSecond: [chat.toString(), fork.toString()],
			createdInCopilot: [],
		});
	});

	test('a chat with another agent starts with that agent\'s defaults and its own schema, apart from the session\'s config', async () => {
		const { service } = createService(true);
		const { session, chat } = await createSessionWithSecondChat(service);
		const configuration = getTestAgentServiceComposition(service).configurationService;
		const stateManager = getTestAgentStateManager(service);
		const defaultChat = stateManager.getSessionState(session.toString())!.defaultChat!;

		configuration.updateSessionConfig(session.toString(), { mode: 'ask' });
		configuration.updateChatConfig({ session: session.toString(), chat: chat.toString() }, { mode: 'plan', isolationHint: 'ignored' });

		assert.deepStrictEqual({
			chatConfig: stateManager.getChatState(chat.toString())?.config,
			ownSchema: stateManager.getChatOwnConfigSchema(chat.toString()),
			chatValues: configuration.getChatConfigValues({ session: session.toString(), chat: chat.toString() }),
			sessionMode: configuration.getSessionConfigValues(session.toString())?.mode,
			defaultChatMode: configuration.getChatConfigValues({ session: session.toString(), chat: defaultChat })?.mode,
		}, {
			chatConfig: { schema: { type: 'object', properties: { mode: { type: 'string', title: 'Mode', enum: ['agent', 'plan', 'ask'], default: 'agent', chatMutable: true, sessionMutable: true } } }, values: { mode: 'plan' } },
			ownSchema: { type: 'object', properties: { mode: { type: 'string', title: 'Mode', enum: ['agent', 'plan', 'ask'], default: 'agent', chatMutable: true, sessionMutable: true } } },
			chatValues: { mode: 'plan' },
			sessionMode: 'ask',
			defaultChatMode: 'ask',
		});
	});

	test('a chat on another agent publishes its agent\'s schema with complete values, and clients can set only that schema\'s chat-settable keys', async () => {
		const { service } = createService(true);
		const { chat } = await createSessionWithSecondChat(service);
		const stateManager = getTestAgentStateManager(service);
		service.dispatchAction(chat.toString(), { type: ActionType.ChatConfigChanged, config: { isolationHint: 'client' } }, 'test-client', 1);
		service.dispatchAction(chat.toString(), { type: ActionType.ChatConfigChanged, config: { mode: 'ask' } }, 'test-client', 2);
		await timeout(0);

		assert.deepStrictEqual(stateManager.getChatState(chat.toString())?.config, {
			schema: { type: 'object', properties: { mode: { type: 'string', title: 'Mode', enum: ['agent', 'plan', 'ask'], default: 'agent', chatMutable: true, sessionMutable: true } } },
			values: { mode: 'ask' },
		});
	});

	test('a chat on the session\'s agent has complete values and no schema, and a later session change does not change it', async () => {
		const { service } = createService(true);
		const session = await service.createSession({ legacyChatUris: true, provider: 'copilot', workingDirectories: [URI.file('/repo')] });
		const chat = URI.parse(buildChatUri(session, 'peer'));
		await service.createChat(session, chat);
		const configuration = getTestAgentServiceComposition(service).configurationService;
		const stateManager = getTestAgentStateManager(service);
		const before = stateManager.getChatState(chat.toString())?.config;

		configuration.updateSessionConfig(session.toString(), { mode: 'ask', isolationHint: 'changed' });
		// Only what a chat may set can be changed for it.
		service.dispatchAction(chat.toString(), { type: ActionType.ChatConfigChanged, config: { isolationHint: 'client' } }, 'test-client', 1);
		await timeout(0);

		assert.deepStrictEqual({
			before,
			after: stateManager.getChatState(chat.toString())?.config,
			effective: configuration.getChatConfigValues({ session: session.toString(), chat: chat.toString() }),
		}, {
			before: { values: { mode: 'plan' } },
			after: { values: { mode: 'plan' } },
			// A property a chat cannot set stays session-wide.
			effective: { mode: 'plan', isolationHint: 'changed' },
		});
	});

	test('an older build\'s overlay row of a chat on the session\'s agent is restored as complete values', async () => {
		const { service } = createService(true);
		const session = await service.createSession({ legacyChatUris: true, provider: 'copilot', workingDirectories: [URI.file('/repo')] });
		const chat = URI.parse(buildChatUri(session, 'peer'));
		await service.createChat(session, chat);
		const configuration = getTestAgentServiceComposition(service).configurationService;
		configuration.updateSessionConfig(session.toString(), { mode: 'ask' });
		await timeout(0);
		// An older build stored only what the chat set for itself.
		await getTestSessionStateStore(service).chatRows.setChatConfig(session, chat, {});

		getTestAgentStateManager(service).deleteSession(session.toString());
		await service.restoreSession(session);
		await timeout(0);

		assert.deepStrictEqual({
			config: getTestAgentStateManager(service).getChatConfig(chat.toString()),
			stored: await getTestSessionStateStore(service).chatRows.getChatConfig(session, chat),
		}, {
			config: { values: { mode: 'ask' } },
			stored: { mode: 'ask' },
		});
	});

	test('with chats with their own agents off, a peer\'s values stay an overlay: it follows its session\'s mode, and nothing is completed, dispatched or written', async () => {
		const { service } = createService(false);
		const session = await service.createSession({ legacyChatUris: true, provider: 'copilot', workingDirectories: [URI.file('/repo')] });
		const chat = URI.parse(buildChatUri(session, 'peer'));
		await service.createChat(session, chat);
		await timeout(0);
		// A peer that set nothing itself, as an older build stored it.
		await getTestSessionStateStore(service).chatRows.setChatConfig(session, chat, {});
		const stateManager = getTestAgentStateManager(service);
		stateManager.deleteSession(session.toString());
		const dispatched: string[] = [];
		const listener = stateManager.onDidEmitEnvelope(envelope => {
			if (envelope.action.type === ActionType.ChatConfigChanged) {
				dispatched.push(envelope.channel);
			}
		});
		try {
			await service.restoreSession(session);
			await timeout(0);
			getTestAgentServiceComposition(service).configurationService.updateSessionConfig(session.toString(), { mode: 'ask' });
			await timeout(0);
		} finally {
			listener.dispose();
		}

		assert.deepStrictEqual({
			effective: getTestAgentServiceComposition(service).configurationService.getChatConfigValues({ session: session.toString(), chat: chat.toString() })?.mode,
			published: stateManager.getChatConfig(chat.toString()),
			stored: await getTestSessionStateStore(service).chatRows.getChatConfig(session, chat),
			dispatched,
		}, { effective: 'ask', published: { values: {} }, stored: {}, dispatched: [] });
	});

	test('turning chats with their own agents on completes a loaded peer\'s overlay; turning them off reads its complete values as an overlay again', async () => {
		const { service } = createService(false);
		const session = await service.createSession({ legacyChatUris: true, provider: 'copilot', workingDirectories: [URI.file('/repo')] });
		const chat = URI.parse(buildChatUri(session, 'peer'));
		await service.createChat(session, chat);
		await timeout(0);
		await getTestSessionStateStore(service).chatRows.setChatConfig(session, chat, {});
		const stateManager = getTestAgentStateManager(service);
		stateManager.deleteSession(session.toString());
		await service.restoreSession(session);
		await timeout(0);
		const configuration = getTestAgentServiceComposition(service).configurationService;
		configuration.updateSessionConfig(session.toString(), { mode: 'ask' });
		const defaultChat = stateManager.getSessionState(session.toString())!.defaultChat!;
		const read = async () => ({
			defaultChat: stateManager.getChatConfig(defaultChat)?.values,
			published: stateManager.getChatConfig(chat.toString())?.values,
			effective: configuration.getChatConfigValues({ session: session.toString(), chat: chat.toString() })?.mode,
			stored: await getTestSessionStateStore(service).chatRows.getChatConfig(session, chat),
		});

		configuration.updateRootConfig({ [ChatProvidersConfigKey.Enabled]: true });
		await timeout(0);
		await getTestSessionStateStore(service).whenIdle(undefined);
		const on = await read();
		configuration.updateSessionConfig(session.toString(), { mode: 'agent' });
		const onAfterSessionChange = (await read()).effective;
		configuration.updateRootConfig({ [ChatProvidersConfigKey.Enabled]: false });
		await timeout(0);
		const off = await read();

		assert.deepStrictEqual({ on, onAfterSessionChange, off }, {
			// Completed from its session's values, and persisted so.
			// The default chat publishes what it takes from its session.
			on: { defaultChat: { mode: 'ask' }, published: { mode: 'ask' }, effective: 'ask', stored: { mode: 'ask' } },
			// Its values are its complete config: a later session change doesn't reach it.
			onAfterSessionChange: 'ask',
			// Read as an overlay again, its complete values still decide every property it may set.
			// The default chat publishes only its own values again, so it follows its session.
			off: { defaultChat: {}, published: { mode: 'ask' }, effective: 'ask', stored: { mode: 'ask' } },
		});
	});

	test('turning chats with their own agents off republishes only the default chat\'s own values, without a write or chat events, and it follows its session again', async () => {
		const { service } = createService(false);
		const session = await service.createSession({ legacyChatUris: true, provider: 'copilot', workingDirectories: [URI.file('/repo')] });
		await timeout(0);
		const stateManager = getTestAgentStateManager(service);
		const configuration = getTestAgentServiceComposition(service).configurationService;
		const defaultChat = stateManager.getSessionState(session.toString())!.defaultChat!;
		configuration.updateRootConfig({ [ChatProvidersConfigKey.Enabled]: true });
		configuration.updateSessionConfig(session.toString(), { mode: 'ask' });
		await timeout(0);
		await getTestSessionStateStore(service).whenIdle(undefined);
		const storedBefore = await getTestSessionStateStore(service).chatRows.getChatConfig(session, URI.parse(defaultChat));
		const published: unknown[] = [];
		let chatEvents = 0;
		const listeners = [
			stateManager.onDidEmitEnvelope(envelope => {
				if (envelope.channel === defaultChat && envelope.action.type === ActionType.ChatConfigChanged) {
					published.push(envelope.action.config);
				}
			}),
			configuration.onDidChatConfigChange(() => chatEvents++),
		];
		let off: Record<string, unknown> | undefined;
		try {
			configuration.updateRootConfig({ [ChatProvidersConfigKey.Enabled]: false });
			await timeout(0);
			await getTestSessionStateStore(service).whenIdle(undefined);
			off = stateManager.getChatConfig(defaultChat)?.values;
		} finally {
			listeners.forEach(listener => listener.dispose());
		}
		configuration.updateSessionConfig(session.toString(), { mode: 'agent' });
		await timeout(0);

		assert.deepStrictEqual({
			off,
			published,
			chatEvents,
			stored: await getTestSessionStateStore(service).chatRows.getChatConfig(session, URI.parse(defaultChat)),
			followsSession: configuration.getChatConfigValues({ session: session.toString(), chat: defaultChat })?.mode,
		}, {
			// It set nothing itself: what it took from its session is no longer published as its own.
			off: {},
			// Republished once, with only its own values; no chat config change is announced.
			published: [{}],
			chatEvents: 0,
			stored: storedBefore,
			followsSession: 'agent',
		});
	});

	test('a restored session routes a chat with its own agent to that agent with its own config', async () => {
		const { service, second } = createService(true);
		const { session, chat } = await createSessionWithSecondChat(service);
		getTestAgentServiceComposition(service).configurationService.updateChatConfig({ session: session.toString(), chat: chat.toString() }, { mode: 'ask' });
		await timeout(0);
		// A key the agent's schema no longer has is dropped on restore.
		await getTestSessionStateStore(service).chatRows.setChatConfig(session, chat, { mode: 'ask', removedKey: true });

		getTestAgentStateManager(service).deleteSession(session.toString());
		await service.restoreSession(session);
		const stateManager = getTestAgentStateManager(service);

		assert.deepStrictEqual({
			summaryProvider: chatSummary(service, session, chat)?.provider,
			chatAgent: getTestAgentHostProviderService(service).getProviderForChat(session, chat)?.id,
			config: stateManager.getChatConfig(chat.toString()),
			hasOwnSchema: stateManager.getChatOwnConfigSchema(chat.toString()) !== undefined,
			listed: (await service.listSessions()).find(candidate => candidate.session.toString() === session.toString())?.chats?.map(candidate => ({ kind: candidate.kind, provider: candidate.provider })),
			materializedIn: createdIn(second),
		}, {
			summaryProvider: 'second',
			chatAgent: 'second',
			config: { schema: { type: 'object', properties: { mode: { type: 'string', title: 'Mode', enum: ['agent', 'plan', 'ask'], default: 'agent', chatMutable: true, sessionMutable: true } } }, values: { mode: 'ask' } },
			hasOwnSchema: true,
			listed: [{ kind: 'default', provider: undefined }, { kind: 'peer', provider: 'second' }],
			materializedIn: [chat.toString()],
		});
	});

	suite('a turn\'s model', () => {
		const modelInfo = (provider: string, id: string) => ({ provider, id, name: id, maxContextWindow: 1000, supportsVision: false });

		/** Starts a turn and resolves once `agent` was sent its message. */
		function sendTurn(service: AgentService, agent: MockAgent, chat: URI, model: string): Promise<unknown> {
			const sent = Event.toPromise(agent.onDidSendMessage);
			service.dispatchAction(chat.toString(), { type: ActionType.ChatTurnStarted, turnId: `turn-${model}`, startedAt: new Date().toISOString(), message: { text: 'Hello', origin: { kind: MessageKind.User }, model: { id: model } } }, 'test-client', 1);
			return sent;
		}

		test('a chat on another agent keeps its model for a model only its session\'s agent offers, and takes one its agent offers', async () => {
			const { service, copilot, second } = createService(true);
			copilot.setModels([modelInfo('copilot', 'copilot-model')]);
			second.setModels([modelInfo('second', 'second-model')]);
			const { chat } = await createSessionWithSecondChat(service);

			await sendTurn(service, second, chat, 'copilot-model');
			const ignored = { changed: second.changeModelCalls.map(call => call.model.id), sent: second.sendMessageCalls.length };
			second.sendMessageCalls.length = 0;
			getTestAgentStateManager(service).dispatchServerAction(chat.toString(), { type: ActionType.ChatTurnComplete, turnId: 'turn-copilot-model', duration: 1 });
			await sendTurn(service, second, chat, 'second-model');

			assert.deepStrictEqual({ ignored, applied: second.changeModelCalls.map(call => call.model.id), copilot: copilot.changeModelCalls.length }, {
				ignored: { changed: [], sent: 1 },
				applied: ['second-model'],
				copilot: 0,
			});
		});

		test('a chat on its session\'s agent takes any model, as before', async () => {
			const { service, copilot } = createService(true);
			copilot.setModels([modelInfo('copilot', 'copilot-model')]);
			const session = await service.createSession({ legacyChatUris: true, provider: 'copilot', workingDirectories: [URI.file('/repo')] });
			const chat = URI.parse(buildChatUri(session, 'peer'));
			await service.createChat(session, chat);

			await sendTurn(service, copilot, chat, 'unknown-model');

			assert.deepStrictEqual(copilot.changeModelCalls.map(call => call.model.id), ['unknown-model']);
		});
	});

	test('disposing a session disposes its chats in their own agents', async () => {
		const { service, copilot, second } = createService(true);
		const { session, chat } = await createSessionWithSecondChat(service);

		await service.disposeSession(session);

		assert.deepStrictEqual({ second: second.disposedChats, copilotPeers: copilot.disposedChats.filter(candidate => candidate === chat.toString()) }, { second: [chat.toString()], copilotPeers: [] });
	});

	test('a chat is routed to its own agent and sees its own config while the agent creates it', async () => {
		const { service, second } = createService(true);
		const session = await service.createSession({ legacyChatUris: true, provider: 'copilot', workingDirectories: [URI.file('/repo')] });
		const chat = URI.parse(buildChatUri(session, 'creating'));
		let seen: { readonly registered: boolean; readonly agent: string | undefined; readonly mode: unknown } | undefined;
		second.onCreateChat = created => {
			seen = {
				registered: getTestAgentStateManager(service).getChatOwner(created.toString()) !== undefined,
				agent: getTestAgentHostProviderService(service).getProviderForChat(session, created)?.id,
				mode: getTestAgentServiceComposition(service).configurationService.getChatConfigValues({ session: session.toString(), chat: created.toString() })?.mode,
			};
		};
		await service.createChat(session, chat, { provider: 'second' });

		assert.deepStrictEqual(seen, { registered: false, agent: 'second', mode: 'agent' });
	});

	test('a chat whose own agent is unavailable is never routed to the session\'s agent', async () => {
		const { service } = createService(true);
		const { session, chat } = await createSessionWithSecondChat(service);
		const providers = getTestAgentHostProviderService(service);
		providers.associateChat(chat, 'unregistered');

		assert.deepStrictEqual(providers.getProviderForChat(session, chat)?.id, undefined);
	});

	test('a subagent of a chat with its own agent runs in that agent and records it with its row', async () => {
		const { service, second } = createService(true);
		const { session, chat } = await createSessionWithSecondChat(service);
		const subagent = URI.parse(buildChatUri(session, 'subagent'));
		second.spawnEmitter.fire({ session, chat: subagent, parent: { chat, toolCallId: 'tool-1' }, title: 'Worker' });
		await timeout(10);
		const recorded = await getTestAgentHostDatabase(service).readChatAgentProviders?.();

		assert.deepStrictEqual({
			stateProvider: getTestAgentStateManager(service).getChatProvider(subagent.toString()),
			agent: getTestAgentHostProviderService(service).getProviderForChat(session, subagent)?.id,
			recorded: recorded?.get(subagent.toString()),
		}, { stateProvider: 'second', agent: 'second', recorded: 'second' });
	});

	test('the catalog payloads never carry a chat\'s agent, which older builds read as canonical, and listing and restore still route the chat', async () => {
		const { service } = createService(true);
		const { session, chat } = await createSessionWithSecondChat(service);
		await timeout(10);
		const database = getTestAgentHostDatabase(service);
		const row = await database.getSessionV2(session.toString());
		const decoded = row && decodeAgentHostCatalogPayload(row.payload);
		const [snapshot] = await database.readCatalogSnapshot([session.toString()]);

		getTestAgentStateManager(service).deleteSession(session.toString());
		await service.restoreSession(session);

		assert.deepStrictEqual({
			payloadMentionsProvider: row?.payload.includes('"provider"'),
			// The release/1.143 validators are these unchanged: a payload equal to its canonical re-encoding is accepted as is.
			canonical: decoded?.ok ? decoded.value.payload === row?.payload : decoded?.error,
			chatMetadata: snapshot?.chats.find(candidate => candidate.chat === chat.toString())?.metadata,
			recorded: (await database.readChatAgentProviders?.())?.get(chat.toString()),
			listed: (await service.listSessions()).find(candidate => candidate.session.toString() === session.toString())?.chats?.find(candidate => candidate.chat.toString() === chat.toString())?.provider,
			restoredAgent: getTestAgentHostProviderService(service).getProviderForChat(session, chat)?.id,
		}, {
			payloadMentionsProvider: false,
			canonical: true,
			chatMetadata: { interactivity: 'full' },
			recorded: 'second',
			listed: 'second',
			restoredAgent: 'second',
		});
	});

	test('deleting a chat or its session forgets the chat\'s agent', async () => {
		const { service } = createService(true);
		const { session, chat } = await createSessionWithSecondChat(service);
		const other = URI.parse(buildChatUri(session, 'other'));
		await service.createChat(session, other, { provider: 'second' });
		const database = getTestAgentHostDatabase(service);
		const before = [...(await database.readChatAgentProviders?.())?.keys() ?? []];

		await service.disposeChat(session, other);
		const afterChat = [...(await database.readChatAgentProviders?.())?.keys() ?? []];
		await service.disposeSession(session);
		const afterSession = [...(await database.readChatAgentProviders?.())?.keys() ?? []];

		assert.deepStrictEqual({ before, afterChat, afterSession }, {
			before: [chat.toString(), other.toString()].sort(),
			afterChat: [chat.toString()],
			afterSession: [],
		});
	});

	test('deleting a chat forgets the agents of its subagents too', async () => {
		const { service, second } = createService(true);
		const { session, chat } = await createSessionWithSecondChat(service);
		const subagent = URI.parse(buildChatUri(session, 'subagent'));
		second.spawnEmitter.fire({ session, chat: subagent, parent: { chat, toolCallId: 'tool-1' }, title: 'Worker' });
		await timeout(10);
		const database = getTestAgentHostDatabase(service);
		const before = [...(await database.readChatAgentProviders?.())?.keys() ?? []].sort();

		await service.disposeChat(session, chat);

		assert.deepStrictEqual({ before, after: [...(await database.readChatAgentProviders?.())?.keys() ?? []] }, {
			before: [chat.toString(), subagent.toString()].sort(),
			after: [],
		});
	});

	test('when the agents of chats can\'t be read, a restarted host neither restores nor disposes a chat with its own agent under the session\'s agent', async () => {
		const sessionDatabase = new TestSessionDatabase();
		const first = createService(true, { sessionDatabase });
		const { session, chat } = await createSessionWithSecondChat(first.service);
		await timeout(10);

		const restarted = createService(true, { sessionDatabase, catalogDatabase: first.catalogDatabase });
		restarted.copilot.knowsAllSessions = true;
		restarted.second.knowsAllSessions = true;
		const read = first.catalogDatabase.readChatAgentProviders;
		first.catalogDatabase.readChatAgentProviders = () => Promise.reject(new Error('unreadable'));
		try {
			await restarted.service.restoreSession(session);
			const restoredChats = getTestAgentStateManager(restarted.service).getSessionState(session.toString())?.chats.map(candidate => candidate.resource);
			getTestAgentStateManager(restarted.service).deleteSession(session.toString());
			await restarted.service.disposeSession(session);

			assert.deepStrictEqual({
				restoredPeer: restoredChats?.includes(chat.toString()),
				disposedBySecond: restarted.second.disposedChats,
				disposedByCopilot: restarted.copilot.disposedChats.includes(chat.toString()),
			}, { restoredPeer: false, disposedBySecond: [], disposedByCopilot: false });
		} finally {
			first.catalogDatabase.readChatAgentProviders = read;
		}
	});

	test('a peer chat skipped because the agents of chats can\'t be read is never disposed through the session\'s agent while its session stays loaded', async () => {
		const sessionDatabase = new TestSessionDatabase();
		const first = createService(true, { sessionDatabase });
		const { session, chat } = await createSessionWithSecondChat(first.service);
		await timeout(10);

		const restarted = createService(true, { sessionDatabase, catalogDatabase: first.catalogDatabase });
		restarted.copilot.knowsAllSessions = true;
		restarted.second.knowsAllSessions = true;
		const read = first.catalogDatabase.readChatAgentProviders;
		first.catalogDatabase.readChatAgentProviders = () => Promise.reject(new Error('unreadable'));
		try {
			await restarted.service.restoreSession(session);
			// The session stays loaded with the peer skipped; disposing it must not hand the peer to the session's agent.
			await restarted.service.disposeSession(session);

			assert.deepStrictEqual({
				registered: getTestAgentStateManager(restarted.service).isChatRegistered(chat.toString()),
				disposedByCopilot: restarted.copilot.disposedChats.includes(chat.toString()),
				copilotContexts: restarted.copilot.chatContexts.filter(entry => entry.chat.toString() === chat.toString()).map(entry => entry.boundary),
			}, { registered: false, disposedByCopilot: false, copilotContexts: [] });
		} finally {
			first.catalogDatabase.readChatAgentProviders = read;
		}
	});

	test('a chat with its own agent whose backing must be recreated after a failed workspace change gets it from its own agent, with its own config', async () => {
		const { service, copilot, second } = createService(true);
		const { session, chat } = await createSessionWithSecondChat(service);
		getTestAgentServiceComposition(service).configurationService.updateChatConfig({ session: session.toString(), chat: chat.toString() }, { mode: 'plan' });
		const configs: unknown[] = [];
		const createChat = second.chats.createChat;
		second.chats.createChat = (candidate, context, options) => {
			configs.push(options?.config);
			return createChat(candidate, context, options);
		};
		const internals = service as unknown as { _chatsNeedingBacking: Set<string>; _recreatePendingChatBacking(session: string, chat: string, credentials: undefined): Promise<void> };
		internals._chatsNeedingBacking.add(chat.toString());

		await internals._recreatePendingChatBacking(session.toString(), chat.toString(), undefined);

		assert.deepStrictEqual({ second: createdIn(second), copilotCreatedChat: createdIn(copilot).includes(chat.toString()), configs }, {
			second: [chat.toString(), chat.toString()],
			copilotCreatedChat: false,
			configs: [{ mode: 'plan' }],
		});
	});

	test('a host seeded from its starter\'s environment allows chats with their own agents before any client mirrors the setting', async () => {
		const { service } = createService(false);
		const before = service.multipleChatProvidersEnabled;
		seedMultipleChatProvidersFromEnvironment(getTestAgentServiceComposition(service).configurationService, { [AgentHostMultipleChatProvidersEnabledEnvVar]: 'true' });
		const session = await service.createSession({ legacyChatUris: true, provider: 'copilot', workingDirectories: [URI.file('/repo')] });
		assert.deepStrictEqual({ before, after: service.multipleChatProvidersEnabled, created: await rejection(service.createChat(session, URI.parse(buildChatUri(session, 'second')), { provider: 'second' })) }, { before: false, after: true, created: undefined });
	});

	test('a fork of a restored, unloaded chat of another session keeps that chat\'s agent; with chats with their own agents off it uses its new session\'s agent', async () => {
		const { service, copilot } = createService(true);
		const { session, chat } = await createSessionWithSecondChat(service);
		const native = URI.parse(buildChatUri(session, 'native'));
		await service.createChat(session, native);
		// A chat on its own session's agent, 'second', which differs from the fork's new session's.
		const secondSession = await service.createSession({ legacyChatUris: true, provider: 'second', workingDirectories: [URI.file('/repo')] });
		const secondNative = URI.parse(buildChatUri(secondSession, 'second-native'));
		await service.createChat(secondSession, secondNative);
		await timeout(10);
		const stateManager = getTestAgentStateManager(service);
		stateManager.deleteSession(session.toString());
		await service.restoreSession(session);
		stateManager.deleteSession(secondSession.toString());
		await service.restoreSession(secondSession);
		const target = await service.createSession({ legacyChatUris: true, provider: 'copilot', workingDirectories: [URI.file('/repo')] });
		const resolver = service as unknown as { _resolveCreateChatProvider(session: URI, sessionProvider: IAgent, options: { fork: { source: URI; turnId: string } }): IAgent };
		const forkAgent = (source: URI) => resolver._resolveCreateChatProvider(target, copilot, { fork: { source, turnId: 't' } }).id;
		const on = { unloaded: !stateManager.getChatState(chat.toString()) && !stateManager.getChatState(secondNative.toString()), ownAgent: forkAgent(chat), sessionAgent: forkAgent(native), otherSessionAgent: forkAgent(secondNative) };
		getTestAgentServiceComposition(service).configurationService.updateRootConfig({ [ChatProvidersConfigKey.Enabled]: false });
		const off = { ownAgent: forkAgent(chat), sessionAgent: forkAgent(native), otherSessionAgent: forkAgent(secondNative), unknown: forkAgent(URI.parse(buildChatUri(session, 'unknown'))) };

		assert.deepStrictEqual({ on, off }, {
			// A fork keeps its source chat's agent: its own, else its session's ('second' for a chat of a 'second' session).
			on: { unloaded: true, ownAgent: 'second', sessionAgent: 'copilot', otherSessionAgent: 'second' },
			// A chat that already uses its own agent keeps it; any other fork uses its new session's agent, as before.
			off: { ownAgent: 'second', sessionAgent: 'copilot', otherSessionAgent: 'copilot', unknown: 'copilot' },
		});
	});

	test('a stale record naming the session\'s own agent is ignored and deleted on restore: the chat follows its session', async () => {
		const { service, catalogDatabase } = createService(true);
		const session = await service.createSession({ legacyChatUris: true, provider: 'copilot', workingDirectories: [URI.file('/repo')] });
		const chat = URI.parse(buildChatUri(session, 'peer'));
		await service.createChat(session, chat);
		await timeout(0);
		await catalogDatabase.recordChatAgentProvider!(chat.toString(), 'copilot');
		(service as unknown as { _chatAgentProviders: unknown })._chatAgentProviders = undefined;

		getTestAgentStateManager(service).deleteSession(session.toString());
		await service.restoreSession(session);
		await timeout(0);

		assert.deepStrictEqual({
			provider: chatSummary(service, session, chat)?.provider,
			ownSchema: getTestAgentStateManager(service).getChatOwnConfigSchema(chat.toString()),
			recorded: (await catalogDatabase.readChatAgentProviders?.())?.has(chat.toString()),
		}, { provider: undefined, ownSchema: undefined, recorded: false });
	});

	test('a chat with its own agent hands its own agent and model to chats it creates, and lists the agents chats may use', async () => {
		const { service } = createService(true);
		const { session, chat } = await createSessionWithSecondChat(service);
		getTestAgentStateManager(service).dispatchServerAction(chat.toString(), { type: ActionType.ChatDraftChanged, draft: { text: '', origin: { kind: MessageKind.User }, model: { id: 'second-model' } } });
		const tools = service as unknown as {
			_getServerToolCreationDefaults(source: URI): { readonly provider?: string; readonly sessionProvider?: string; readonly model?: { readonly id: string } } | undefined;
			_getServerToolChatHarnesses(session: URI): readonly string[] | undefined;
		};
		const defaults = tools._getServerToolCreationDefaults(chat);
		const harnessesOn = tools._getServerToolChatHarnesses(session);
		getTestAgentServiceComposition(service).configurationService.updateRootConfig({ [ChatProvidersConfigKey.Enabled]: false });

		assert.deepStrictEqual({
			provider: defaults?.provider,
			sessionProvider: defaults?.sessionProvider,
			model: defaults?.model?.id,
			harnessesOn,
			harnessesOff: tools._getServerToolChatHarnesses(session),
		}, { provider: 'second', sessionProvider: 'copilot', model: 'second-model', harnessesOn: ['copilot', 'second'], harnessesOff: undefined });
	});

	test('a chat with another agent and no own config hands on none of the session\'s config', async () => {
		const { service } = createService(true);
		const session = await service.createSession({ legacyChatUris: true, provider: 'copilot' });
		const stateManager = getTestAgentStateManager(service);
		stateManager.setSessionConfig(session.toString(), { schema: { type: 'object', properties: {} }, values: { mode: 'ask' } });
		// As a restored chat whose own config is not resolved yet: registered on its agent without a config.
		const chat = URI.parse(buildChatUri(session, 'unresolved'));
		stateManager.addChat(session.toString(), chat.toString(), chat.toString(), { provider: 'second' });
		const configs: Record<string, unknown>[] = [];
		const second = getTestAgentHostProviderService(service).getProvider('second')!;
		second.getInheritedChatConfig = values => { configs.push({ ...values }); return values; };
		const tools = service as unknown as { _getServerToolCreationDefaults(source: URI): { readonly config?: Record<string, unknown> } | undefined };
		const config = tools._getServerToolCreationDefaults(chat)?.config;
		assert.deepStrictEqual({ handedToAgent: configs, config }, { handedToAgent: [{}], config: {} });
	});

	test('an agent turned off on the host is neither offered nor accepted for a chat', async () => {
		const { service } = createService(true);
		const codex = disposables.add(new ChatAgent('codex', 'agent'));
		registerTestAgentProvider(service, codex);
		const session = await service.createSession({ legacyChatUris: true, provider: 'copilot' });
		getTestAgentServiceComposition(service).configurationService.updateRootConfig({ [AgentHostCodexEnabledConfigKey]: false });
		const tools = service as unknown as { _getServerToolChatHarnesses(session: URI): readonly string[] | undefined };

		assert.deepStrictEqual({
			offered: tools._getServerToolChatHarnesses(session),
			created: await rejection(service.createChat(session, URI.parse(buildChatUri(session, 'codex-chat')), { provider: 'codex' })),
		}, { offered: ['copilot', 'second'], created: 'InvalidParams' });
	});

	test('a chat with its own agent keeps it when moved to a session of another agent of the same kind', async () => {
		const { service, second } = createService(true);
		getTestAgentServiceComposition(service).configurationService.updateRootConfig({ [ChatMoveConfigKey.Enabled]: true });
		const { session: source, chat } = await createSessionWithSecondChat(service);
		const copilotTarget = await service.createSession({ legacyChatUris: true, provider: 'copilot', workingDirectories: [URI.file('/repo')] });
		const subagent = URI.parse(buildChatUri(source, 'subagent'));
		second.spawnEmitter.fire({ session: source, chat: subagent, parent: { chat, toolCallId: 'tool-1' }, title: 'Worker' });
		await timeout(10);
		startTurn(service, chat);

		const announced: unknown[] = [];
		const listener = getTestAgentStateManager(service).onDidEmitEnvelope(envelope => {
			if (envelope.action.type === ActionType.ChatMoved) {
				announced.push({ channel: envelope.channel, action: envelope.action });
			}
		});
		await service.moveChat(source, chat, { kind: 'session', session: copilotTarget, after: undefined });
		listener.dispose();
		const ownSchema = getTestAgentStateManager(service).getChatOwnConfigSchema(chat.toString());

		assert.deepStrictEqual({
			movedProvider: chatSummary(service, copilotTarget, chat)?.provider,
			chatAgent: getTestAgentHostProviderService(service).getProviderForChat(copilotTarget, chat)?.id,
			configSchema: ownSchema !== undefined,
			announced,
			chatState: { provider: getTestAgentStateManager(service).getChatState(chat.toString())?.provider, schema: getTestAgentStateManager(service).getChatState(chat.toString())?.config?.schema === ownSchema },
		}, {
			movedProvider: 'second',
			chatAgent: 'second',
			configSchema: true,
			// Its subscribers learn its new owner, and that it keeps its own agent and schema there.
			// Its subagent moves with it; it has no config schema of its own.
			announced: [
				{ channel: chat.toString(), action: { type: ActionType.ChatMoved, session: copilotTarget.toString(), provider: 'second', schema: ownSchema } },
				{ channel: subagent.toString(), action: { type: ActionType.ChatMoved, session: copilotTarget.toString(), provider: 'second' } },
			],
			chatState: { provider: 'second', schema: true },
		});
	});

	suite('moves across agents', () => {
		const modeSchema = { type: 'object' as const, properties: { mode: { type: 'string' as const, title: 'Mode', enum: ['agent', 'plan', 'ask'], chatMutable: true, sessionMutable: true } } };

		function createMoveService(enabled: boolean, options?: { readonly secondSupportsChats?: boolean }) {
			const created = createService(enabled, options);
			getTestAgentServiceComposition(created.service).configurationService.updateRootConfig({ [ChatMoveConfigKey.Enabled]: true });
			return created;
		}

		async function createSessionOf(service: AgentService, provider: string, mode: string): Promise<URI> {
			const session = await service.createSession({ legacyChatUris: true, provider, workingDirectories: [URI.file('/repo')] });
			getTestAgentStateManager(service).setSessionConfig(session.toString(), { schema: modeSchema, values: { mode } });
			return session;
		}

		/** The `chat/moved` actions dispatched while `run` runs. */
		async function chatMovedDuring(service: AgentService, run: () => Promise<unknown>): Promise<unknown[]> {
			const announced: unknown[] = [];
			const listener = getTestAgentStateManager(service).onDidEmitEnvelope(envelope => {
				if (envelope.action.type === ActionType.ChatMoved) {
					announced.push({ channel: envelope.channel, action: envelope.action });
				}
			});
			try {
				await run();
			} finally {
				listener.dispose();
			}
			return announced;
		}

		async function refusal(promise: Promise<unknown>): Promise<string> {
			return promise.then(() => 'moved', (error: { reason?: string }) => error.reason ?? String(error));
		}

		test('a chat that joins a session of another agent gains its own agent: its schema, valid values and recorded agent, with its subagent, also after a restart', async () => {
			const { service, copilot } = createMoveService(true);
			const source = await createSessionOf(service, 'copilot', 'agent');
			const target = await createSessionOf(service, 'second', 'plan');
			const chat = URI.parse(buildChatUri(source, 'native'));
			await service.createChat(source, chat);
			await timeout(0);
			const configuration = getTestAgentServiceComposition(service).configurationService;
			configuration.updateChatConfig({ session: source.toString(), chat: chat.toString() }, { mode: 'ask' });
			const subagent = URI.parse(buildChatUri(source, 'native-subagent'));
			copilot.spawnEmitter.fire({ session: source, chat: subagent, parent: { chat, toolCallId: 'tool-1' }, title: 'Worker' });
			await timeout(10);
			startTurn(service, chat);
			const stateManager = getTestAgentStateManager(service);

			const announced = await chatMovedDuring(service, () => service.moveChat(source, chat, { kind: 'session', session: target, after: undefined }));
			const ownSchema = stateManager.getChatOwnConfigSchema(chat.toString());
			const moved = {
				announced,
				ownSchema: ownSchema?.properties && Object.keys(ownSchema.properties),
				config: stateManager.getChatState(chat.toString())?.config?.values,
				agents: [chat, subagent].map(candidate => getTestAgentHostProviderService(service).getProviderForChat(target, candidate)?.id),
				recorded: [chat, subagent].map(async candidate => (await getTestAgentHostDatabase(service).readChatAgentProviders?.())?.get(candidate.toString())),
				stored: await getTestSessionStateStore(service).chatRows.getChatConfig(source, chat),
			};
			const recorded = await Promise.all(moved.recorded);
			stateManager.deleteSession(target.toString());
			await service.restoreSession(target);

			assert.deepStrictEqual({ ...moved, recorded, restored: { provider: chatSummary(service, target, chat)?.provider, hasOwnSchema: stateManager.getChatOwnConfigSchema(chat.toString()) !== undefined } }, {
				announced: [
					{ channel: chat.toString(), action: { type: ActionType.ChatMoved, session: target.toString(), provider: 'copilot', schema: ownSchema } },
					{ channel: subagent.toString(), action: { type: ActionType.ChatMoved, session: target.toString(), provider: 'copilot' } },
				],
				ownSchema: ['mode'],
				config: { mode: 'ask' },
				agents: ['copilot', 'copilot'],
				recorded: ['copilot', 'copilot'],
				stored: { mode: 'ask' },
				restored: { provider: 'copilot', hasOwnSchema: true },
			});
		});

		test('a chat with its own agent that joins a session of its agent loses it: no schema or recorded agent, and its valid values completed from its new session', async () => {
			const { service } = createMoveService(true);
			const { session: source, chat } = await createSessionWithSecondChat(service);
			getTestAgentServiceComposition(service).configurationService.updateChatConfig({ session: source.toString(), chat: chat.toString() }, { mode: 'ask' });
			const target = await createSessionOf(service, 'second', 'plan');
			await timeout(0);
			startTurn(service, chat);
			const stateManager = getTestAgentStateManager(service);

			const announced = await chatMovedDuring(service, () => service.moveChat(source, chat, { kind: 'session', session: target, after: undefined }));
			await timeout(0);

			assert.deepStrictEqual({
				announced,
				summaryProvider: chatSummary(service, target, chat)?.provider,
				ownSchema: stateManager.getChatOwnConfigSchema(chat.toString()),
				config: stateManager.getChatState(chat.toString())?.config,
				agent: getTestAgentHostProviderService(service).getProviderForChat(target, chat)?.id,
				recorded: (await getTestAgentHostDatabase(service).readChatAgentProviders?.())?.has(chat.toString()),
			}, {
				announced: [{ channel: chat.toString(), action: { type: ActionType.ChatMoved, session: target.toString() } }],
				summaryProvider: undefined,
				ownSchema: undefined,
				config: { values: { mode: 'ask' } },
				agent: 'second',
				recorded: false,
			});
		});

		test('a chat with its own agent becomes a session of its agent, with that agent\'s config and its own values', async () => {
			const { service, second } = createMoveService(true);
			// Its agent records a conversation of its own for it, which a new session needs.
			const createChat = second.chats.createChat;
			second.chats.createChat = async (chat, context, options) => ({ ...(await createChat(chat, context, options)), providerData: 'second-backing' });
			const { session: source, chat } = await createSessionWithSecondChat(service);
			getTestAgentServiceComposition(service).configurationService.updateChatConfig({ session: source.toString(), chat: chat.toString() }, { mode: 'ask' });
			startTurn(service, chat);
			const stateManager = getTestAgentStateManager(service);

			let promoted: URI | undefined;
			const announced = await chatMovedDuring(service, async () => { promoted = await service.moveChat(source, chat, { kind: 'newSession' }); });

			assert.deepStrictEqual({
				announced,
				sessionAgent: getTestAgentHostProviderService(service).getProviderForSession(promoted!)?.id,
				defaultChat: stateManager.getSessionState(promoted!.toString())?.defaultChat,
				sessionMode: stateManager.getSessionState(promoted!.toString())?.config?.values.mode,
				ownSchema: stateManager.getChatOwnConfigSchema(chat.toString()),
				recorded: (await getTestAgentHostDatabase(service).readChatAgentProviders?.())?.has(chat.toString()),
			}, {
				announced: [{ channel: chat.toString(), action: { type: ActionType.ChatMoved, session: promoted!.toString() } }],
				sessionAgent: 'second',
				defaultChat: chat.toString(),
				sessionMode: 'ask',
				ownSchema: undefined,
				recorded: false,
			});
		});

		test('a session moved under a session of another agent: its default chat gains its own agent', async () => {
			const { service } = createMoveService(true);
			const source = await createSessionOf(service, 'copilot', 'agent');
			const target = await createSessionOf(service, 'second', 'plan');
			const defaultChat = getTestAgentStateManager(service).getSessionState(source.toString())!.defaultChat!;
			startTurn(service, defaultChat);

			const announced = await chatMovedDuring(service, () => service.moveSession(source, target, undefined));

			assert.deepStrictEqual({
				announced: announced.map(entry => (entry as { action: { provider?: string } }).action.provider),
				summaryProvider: chatSummary(service, target, URI.parse(defaultChat))?.provider,
				agent: getTestAgentHostProviderService(service).getProviderForChat(target, defaultChat)?.id,
				hasOwnSchema: getTestAgentStateManager(service).getChatOwnConfigSchema(defaultChat) !== undefined,
			}, { announced: ['copilot'], summaryProvider: 'copilot', agent: 'copilot', hasOwnSchema: true });
		});

		test('moves across agents are refused while chats can\'t use their own agents, or when the destination\'s agent can\'t host other agents\' chats', async () => {
			const off = createMoveService(false);
			const offSource = await createSessionOf(off.service, 'copilot', 'agent');
			const offTarget = await createSessionOf(off.service, 'second', 'plan');
			const offChat = URI.parse(buildChatUri(offSource, 'native'));
			await off.service.createChat(offSource, offChat);
			const noChats = createMoveService(true, { secondSupportsChats: false });
			const noChatsSource = await createSessionOf(noChats.service, 'copilot', 'agent');
			const noChatsTarget = await createSessionOf(noChats.service, 'second', 'plan');
			const noChatsChat = URI.parse(buildChatUri(noChatsSource, 'native'));
			await noChats.service.createChat(noChatsSource, noChatsChat);
			await timeout(0);
			startTurn(off.service, offChat);
			startTurn(noChats.service, noChatsChat);
			const noConfig = createMoveService(true);
			const noConfigSource = await createSessionOf(noConfig.service, 'copilot', 'agent');
			const noConfigTarget = await createSessionOf(noConfig.service, 'second', 'plan');
			const noConfigChat = URI.parse(buildChatUri(noConfigSource, 'native'));
			await noConfig.service.createChat(noConfigSource, noConfigChat);
			await timeout(0);
			startTurn(noConfig.service, noConfigChat);
			noConfig.copilot.resolveChatConfig = async () => { throw new Error('offline'); };

			assert.deepStrictEqual({
				gateOff: await refusal(off.service.moveChat(offSource, offChat, { kind: 'session', session: offTarget, after: undefined })),
				noMultipleChats: await refusal(noChats.service.moveChat(noChatsSource, noChatsChat, { kind: 'session', session: noChatsTarget, after: undefined })),
				noConfig: await refusal(noConfig.service.moveChat(noConfigSource, noConfigChat, { kind: 'session', session: noConfigTarget, after: undefined })),
			}, { gateOff: 'differentProvider', noMultipleChats: 'agentWithoutChats', noConfig: 'agentConfigUnavailable' });
		});
	});
});
