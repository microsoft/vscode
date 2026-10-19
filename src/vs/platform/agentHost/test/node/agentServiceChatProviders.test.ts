/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import type { IProductService } from '../../../product/common/productService.js';
import type { IAgentChatContext, IAgentCreateChatResult, IAgentResolveChatConfigParams } from '../../common/agent.js';
import { ChatMoveConfigKey } from '../../common/agentHostChatMove.js';
import { ChatProvidersConfigKey } from '../../common/agentHostChatProviders.js';
import type { ResolveSessionConfigResult } from '../../common/state/protocol/commands.js';
import { JsonRpcErrorCodes, ProtocolError } from '../../common/state/sessionProtocol.js';
import { buildChatUri } from '../../common/state/sessionState.js';
import { AgentHostDatabase } from '../../node/agentHostDatabase.js';
import type { AgentService } from '../../node/agentService.js';
import { createNoopGitService, createSessionDataService, TestSessionDatabase } from '../common/sessionTestHelpers.js';
import { disposeTestSessionStateDatabases } from './chatMetadataTestHelpers.js';
import { createTestAgentService, getTestAgentHostProviderService, getTestAgentServiceComposition, getTestAgentStateManager, registerTestAgentProvider } from './agentServiceTestUtils.js';
import { MockAgent } from './mockAgent.js';

/** A multi-chat agent whose chat config has a chat-settable `mode` and a session-only `isolationHint`. */
class ChatAgent extends MockAgent {
	readonly disposedChats: string[] = [];

	constructor(id: string, private readonly _defaultMode: string, multipleChats = true) {
		super(id, multipleChats ? { multipleChats: { fork: true, sideChat: true } } : {});
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

	override async materializeChat(_chat: URI, _context: URI | IAgentChatContext, _providerData: string | undefined): Promise<void> { }
}

suite('AgentService - chats with their own agent', () => {

	const disposables = new DisposableStore();
	let fileService: FileService;

	setup(() => {
		fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
	});

	teardown(() => disposables.clear());
	teardown(() => disposeTestSessionStateDatabases());
	ensureNoDisposablesAreLeakedInTestSuite();

	function createService(enabled: boolean, options?: { readonly secondSupportsChats?: boolean }) {
		const catalogDatabase = disposables.add(new AgentHostDatabase(':memory:'));
		const service = disposables.add(createTestAgentService(
			new NullLogService(), fileService, createSessionDataService(new TestSessionDatabase()),
			{ _serviceBrand: undefined } as IProductService, createNoopGitService(),
			undefined, undefined, undefined, undefined, undefined, [], undefined, undefined, catalogDatabase,
		));
		const copilot = disposables.add(new ChatAgent('copilot', 'plan'));
		const second = disposables.add(new ChatAgent('second', 'agent', options?.secondSupportsChats ?? true));
		registerTestAgentProvider(service, copilot);
		registerTestAgentProvider(service, second);
		if (enabled) {
			getTestAgentServiceComposition(service).configurationService.updateRootConfig({ [ChatProvidersConfigKey.Enabled]: true });
		}
		return { service, copilot, second };
	}

	async function createSessionWithSecondChat(service: AgentService, name = 'second-chat') {
		const session = await service.createSession({ legacyChatUris: true, provider: 'copilot', workingDirectories: [URI.file('/repo')] });
		const chat = URI.parse(buildChatUri(session, name));
		await service.createChat(session, chat, { provider: 'second' });
		return { session, chat };
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
			chatValues: configuration.getChatConfigValues({ session: session.toString(), chat: chat.toString() }),
			sessionMode: configuration.getSessionConfigValues(session.toString())?.mode,
			defaultChatMode: configuration.getChatConfigValues({ session: session.toString(), chat: defaultChat })?.mode,
		}, {
			chatConfig: {
				schema: { type: 'object', properties: { mode: { type: 'string', title: 'Mode', enum: ['agent', 'plan', 'ask'], default: 'agent', chatMutable: true, sessionMutable: true } } },
				values: { mode: 'plan' },
			},
			chatValues: { mode: 'plan' },
			sessionMode: 'ask',
			defaultChatMode: 'ask',
		});
	});

	test('a restored session routes a chat with its own agent to that agent with its own config', async () => {
		const { service, second } = createService(true);
		const { session, chat } = await createSessionWithSecondChat(service);
		getTestAgentServiceComposition(service).configurationService.updateChatConfig({ session: session.toString(), chat: chat.toString() }, { mode: 'ask' });
		await timeout(0);

		getTestAgentStateManager(service).deleteSession(session.toString());
		await service.restoreSession(session);
		const stateManager = getTestAgentStateManager(service);

		assert.deepStrictEqual({
			summaryProvider: chatSummary(service, session, chat)?.provider,
			chatAgent: getTestAgentHostProviderService(service).getProviderForChat(session, chat)?.id,
			config: stateManager.getChatConfig(chat.toString()),
			listed: (await service.listSessions()).find(candidate => candidate.session.toString() === session.toString())?.chats?.map(candidate => ({ kind: candidate.kind, provider: candidate.provider })),
			materializedIn: createdIn(second),
		}, {
			summaryProvider: 'second',
			chatAgent: 'second',
			config: {
				schema: { type: 'object', properties: { mode: { type: 'string', title: 'Mode', enum: ['agent', 'plan', 'ask'], default: 'agent', chatMutable: true, sessionMutable: true } } },
				values: { mode: 'ask' },
			},
			listed: [{ kind: 'default', provider: undefined }, { kind: 'peer', provider: 'second' }],
			materializedIn: [chat.toString()],
		});
	});

	test('disposing a session disposes its chats in their own agents', async () => {
		const { service, copilot, second } = createService(true);
		const { session, chat } = await createSessionWithSecondChat(service);

		await service.disposeSession(session);

		assert.deepStrictEqual({ second: second.disposedChats, copilotPeers: copilot.disposedChats.filter(candidate => candidate === chat.toString()) }, { second: [chat.toString()], copilotPeers: [] });
	});

	test('a chat with its own agent keeps it when moved to a session of another agent; a chat that would gain or lose its own agent is refused', async () => {
		const { service } = createService(true);
		getTestAgentServiceComposition(service).configurationService.updateRootConfig({ [ChatMoveConfigKey.Enabled]: true });
		const { session: source, chat } = await createSessionWithSecondChat(service);
		const copilotTarget = await service.createSession({ legacyChatUris: true, provider: 'copilot', workingDirectories: [URI.file('/repo')] });
		const secondTarget = await service.createSession({ legacyChatUris: true, provider: 'second', workingDirectories: [URI.file('/repo')] });
		const native = URI.parse(buildChatUri(source, 'native'));
		await service.createChat(source, native);
		await timeout(0);

		const refusedNative = await service.moveChat(source, native, { kind: 'session', session: secondTarget, after: undefined }).then(() => 'moved', (error: { reason?: string }) => error.reason);
		const refusedToOwnAgent = await service.moveChat(source, chat, { kind: 'session', session: secondTarget, after: undefined }).then(() => 'moved', (error: { reason?: string }) => error.reason);
		await service.moveChat(source, chat, { kind: 'session', session: copilotTarget, after: undefined });

		assert.deepStrictEqual({
			refusedNative,
			refusedToOwnAgent,
			movedProvider: chatSummary(service, copilotTarget, chat)?.provider,
			chatAgent: getTestAgentHostProviderService(service).getProviderForChat(copilotTarget, chat)?.id,
			configSchema: getTestAgentStateManager(service).getChatConfig(chat.toString())?.schema !== undefined,
		}, {
			refusedNative: 'differentProvider',
			refusedToOwnAgent: 'differentProvider',
			movedProvider: 'second',
			chatAgent: 'second',
			configSchema: true,
		});
	});
});
