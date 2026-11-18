/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../base/common/event.js';
import type { URI } from '../../../../base/common/uri.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import type { IAgentHostChatContributions } from '../../common/agentHostChatContributionsService.js';
import { AgentHostRequestSearchEnabledConfigKey } from '../../common/agentHostSchema.js';
import type { ISessionDatabase, ISessionDataService } from '../../common/sessionDataService.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { buildChatUri, buildDefaultChatUri, isAhpChatChannel, MessageKind, SessionStatus } from '../../common/state/sessionState.js';
import type { IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostChatContributions } from '../../node/agentHostChatContributionsService.js';
import type { IAgentHostDatabase } from '../../node/agentHostDatabase.js';
import { AgentHostRequestIndex, buildRequestSnippet, IAgentHostRequestIndex } from '../../node/agentHostRequestIndex.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../node/agentHostStateManager.js';
import { RequestIndexContribution } from '../../node/chatContributions/requestIndex/requestIndexContribution.js';
import { createTestChatOwnershipService } from './chatOwnershipTestUtils.js';

suite('AgentHostRequestIndex', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const session = 'copilot:/search';
	const defaultChat = buildDefaultChatUri(session);
	const peer = buildChatUri(session, 'peer');

	function createContext() {
		const logService = new NullLogService();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const chatOwnership = createTestChatOwnershipService(stateManager);
		const rootChange = disposables.add(new Emitter<void>());
		let enabled = true;
		const configurationService = upcastPartial<IAgentConfigurationService>({
			onDidRootConfigChange: rootChange.event,
			getRootValue: ((_schema: unknown, key: string) => key === AgentHostRequestSearchEnabledConfigKey ? enabled : undefined) as IAgentConfigurationService['getRootValue'],
		});
		const eventIds = new Map<string, string>();
		const openedDatabases: string[] = [];
		const sessionDataService = upcastPartial<ISessionDataService>({
			tryOpenDatabase: async (storage: URI) => {
				openedDatabases.push(storage.toString());
				return { object: upcastPartial<ISessionDatabase>({ getTurnEventId: async (turnId: string) => eventIds.get(`${storage.toString()}|${turnId}`) }), dispose: () => { } };
			},
		});
		const suppressed = new Set<string>();
		const hostDatabase = upcastPartial<IAgentHostDatabase>({ isSessionSuppressed: async (resource: string) => suppressed.has(resource) });
		const index = disposables.add(new AgentHostRequestIndex(':memory:', configurationService, stateManager, sessionDataService, hostDatabase, logService));
		const instantiationService = disposables.add(new InstantiationService(new ServiceCollection(
			[ILogService, logService],
			[IAgentHostStateManager, stateManager],
			[IAgentHostRequestIndex, index],
		), true));
		const contributions: IAgentHostChatContributions = disposables.add(new AgentHostChatContributions(logService, instantiationService));
		disposables.add(contributions.registerContribution(RequestIndexContribution));
		disposables.add(stateManager.onDidEmitEnvelope(envelope => contributions.didDispatchAction({
			channel: envelope.channel,
			session: isAhpChatChannel(envelope.channel) ? chatOwnership.requireChatOwner(envelope.channel) : envelope.channel,
			action: envelope.action,
			origin: envelope.origin,
			rejectionReason: envelope.rejectionReason,
		})));
		stateManager.createSession({
			resource: session, defaultChat, provider: 'copilot', title: 'Login work', status: SessionStatus.IsRead,
			createdAt: '2026-11-01T00:00:00.000Z', modifiedAt: '2026-11-01T00:00:00.000Z',
		});
		stateManager.dispatchServerAction(session, { type: ActionType.SessionReady });
		stateManager.addChat(session, peer, peer, { title: 'Layout side chat' });
		const send = (chat: string, turnId: string, text: string, kind = MessageKind.User) => {
			stateManager.dispatchServerAction(chat, { type: ActionType.ChatTurnStarted, turnId, startedAt: '2026-11-01T00:00:00.000Z', message: { text, origin: { kind } } });
			stateManager.dispatchServerAction(chat, { type: ActionType.ChatTurnComplete, turnId, duration: 1 });
		};
		const setEnabled = (value: boolean) => {
			enabled = value;
			rootChange.fire();
		};
		return { stateManager, index, eventIds, suppressed, openedDatabases, send, setEnabled };
	}

	test('finds user requests containing every term, newest first, with titles and chat identities', async () => {
		const { index, send } = createContext();
		send(defaultChat, 'request-1', 'Fix the LOGIN bug in the auth flow');
		send(peer, 'request-2', 'Tweak the login page layout');
		send(defaultChat, 'request-3', 'Summarize the login failures', MessageKind.Agent);

		const login = await index.search('login', undefined);
		assert.deepStrictEqual({
			login: { ...login, indexedSince: typeof login.indexedSince, hits: login.hits.map(({ startedAt, ...hit }) => ({ ...hit, startedAt: !Number.isNaN(Date.parse(startedAt)) })) },
			loginAuth: (await index.search('auth Login', undefined)).hits.map(hit => hit.turnId),
			none: (await index.search('missing', undefined)).hits,
		}, {
			login: {
				indexEnabled: true,
				truncated: false,
				indexedSince: 'string',
				hits: [
					{ session, chat: peer, turnId: 'request-2', startedAt: true, snippet: 'Tweak the login page layout', sessionTitle: 'Login work', chatTitle: 'Layout side chat' },
					{ session, turnId: 'request-1', startedAt: true, snippet: 'Fix the LOGIN bug in the auth flow', sessionTitle: 'Login work' },
				],
			},
			loginAuth: ['request-1'],
			none: [],
		});
	});

	test('links a chat that is no longer loaded to the turn ID its provider restores', async () => {
		const { stateManager, index, eventIds, openedDatabases, send } = createContext();
		send(defaultChat, 'request-1', 'deploy to staging');
		send(peer, 'request-2', 'deploy to production');
		eventIds.set(`${session}|request-1`, 'event-1');
		const live = (await index.search('deploy', undefined)).hits.map(hit => hit.turnId);
		const openedWhileLive = openedDatabases.length;
		stateManager.removeSession(session);

		assert.deepStrictEqual({
			live,
			openedWhileLive,
			restored: (await index.search('deploy', undefined)).hits.map(hit => ({ chat: hit.chat, turnId: hit.turnId })),
		}, {
			live: ['request-2', 'request-1'],
			openedWhileLive: 0,
			restored: [{ chat: peer, turnId: 'request-2' }, { chat: undefined, turnId: 'event-1' }],
		});
	});

	test('skips deleted sessions and reports more matches than the limit', async () => {
		const { index, suppressed, send } = createContext();
		for (let i = 0; i < 3; i++) {
			send(defaultChat, `request-${i}`, `refactor step ${i}`);
		}
		const limited = await index.search('refactor', 2);
		suppressed.add(session);
		assert.deepStrictEqual({
			limited: { truncated: limited.truncated, turns: limited.hits.map(hit => hit.turnId) },
			deleted: await index.search('refactor', 2),
		}, {
			limited: { truncated: true, turns: ['request-2', 'request-1'] },
			deleted: { indexEnabled: true, hits: [], truncated: false, indexedSince: limited.indexedSince },
		});
	});

	test('a client truncation removes the requests after the kept turn, including by its restored ID', async () => {
		const { stateManager, index, eventIds, send } = createContext();
		send(defaultChat, 'request-1', 'first attempt');
		send(defaultChat, 'request-2', 'second attempt');
		send(defaultChat, 'request-3', 'third attempt');
		eventIds.set(`${session}|request-1`, 'event-1');
		// The host refreshes history with a server truncation; it must not drop requests.
		stateManager.dispatchServerAction(defaultChat, { type: ActionType.ChatTruncated });
		const afterRefresh = (await index.search('attempt', undefined)).hits.length;
		stateManager.dispatchClientAction(defaultChat, { type: ActionType.ChatTruncated, turnId: 'event-1' }, { clientId: 'client', clientSeq: 1 });
		const afterTruncation = (await index.search('attempt', undefined)).hits.map(hit => hit.snippet);
		stateManager.dispatchClientAction(defaultChat, { type: ActionType.ChatTruncated }, { clientId: 'client', clientSeq: 2 });

		assert.deepStrictEqual({ afterRefresh, afterTruncation, afterClear: (await index.search('attempt', undefined)).hits }, {
			afterRefresh: 3,
			afterTruncation: ['first attempt'],
			afterClear: [],
		});
	});

	test('a moved chat keeps its requests under its new session, and a deleted chat drops them', async () => {
		const { stateManager, index, send } = createContext();
		const target = 'copilot:/target';
		stateManager.createSession({
			resource: target, defaultChat: buildDefaultChatUri(target), provider: 'copilot', title: 'Target', status: SessionStatus.IsRead,
			createdAt: '2026-11-01T00:00:00.000Z', modifiedAt: '2026-11-01T00:00:00.000Z',
		});
		stateManager.dispatchServerAction(target, { type: ActionType.SessionReady });
		send(peer, 'request-1', 'migrate the schema');
		stateManager.transferChats(session, target, [peer], undefined);
		const moved = (await index.search('schema', undefined)).hits.map(hit => ({ session: hit.session, chat: hit.chat, turnId: hit.turnId }));
		stateManager.removeChat(target, peer);

		assert.deepStrictEqual({ moved, deleted: (await index.search('schema', undefined)).hits }, {
			moved: [{ session: target, chat: peer, turnId: 'request-1' }],
			deleted: [],
		});
	});

	test('turning request search off stops indexing and deletes the index', async () => {
		const { index, send, setEnabled } = createContext();
		send(defaultChat, 'request-1', 'remember this');
		setEnabled(false);
		send(defaultChat, 'request-2', 'remember that');
		const disabled = await index.search('remember', undefined);
		setEnabled(true);

		assert.deepStrictEqual({ disabled, reenabled: await index.search('remember', undefined) }, {
			disabled: { indexEnabled: false, hits: [], truncated: false },
			reenabled: { indexEnabled: true, hits: [], truncated: false },
		});
	});

	test('snippets center on the first match and mark cut text', () => {
		const text = `${'a'.repeat(300)}\n\n  needle ${'b'.repeat(300)}`;
		const snippet = buildRequestSnippet(text, ['needle']);
		assert.deepStrictEqual({
			short: buildRequestSnippet('  short\n request ', ['request']),
			start: snippet.slice(0, 1),
			end: snippet.slice(-1),
			containsMatch: snippet.includes('needle'),
			length: snippet.length,
		}, { short: 'short request', start: '…', end: '…', containsMatch: true, length: 202 });
	});
});
