/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { ActionType } from '../../common/state/sessionActions.js';
import {
	AgentSession,
	resolveAgentChatOrigin,
	resolveAgentHostCustomizations,
	resolveSubagentChatParent,
	type IAgentChatContext,
} from '../../common/agentService.js';
import {
	buildChatUri,
	buildDefaultChatUri,
	buildSubagentChatUri,
	ChatOriginKind,
	CustomizationType,
	SessionLifecycle,
	SessionStatus,
	type ChatOrigin,
	type Customization,
	type SessionSummary,
} from '../../common/state/sessionState.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentHostPromptCache } from '../../node/agentHostPromptCache.js';
import { AgentHostSessionTitleSignal } from '../../node/agentHostSessionTitleSignal.js';
import { createAgentChatContext, getSessionChatsForFanOut } from '../../node/agentChatContext.js';

suite('Agent Host provider seams', () => {

	const disposables = new DisposableStore();
	const session = AgentSession.uri('copilot', 'seam-session');
	const sessionKey = session.toString();
	const defaultChat = URI.parse(buildDefaultChatUri(sessionKey));
	const peerChat = URI.parse(buildChatUri(sessionKey, 'peer'));
	const subagentChat = URI.parse(buildSubagentChatUri(sessionKey, 'tool-1'));

	let manager: AgentHostStateManager;

	function summary(): SessionSummary {
		return {
			resource: sessionKey,
			provider: 'copilot',
			title: 'Seams',
			status: SessionStatus.Idle,
			createdAt: new Date().toISOString(),
			modifiedAt: new Date().toISOString(),
		};
	}

	function customization(id: string, enabled: boolean): Customization {
		return {
			type: CustomizationType.Directory,
			id,
			name: id,
			uri: `file:///${id}`,
			enabled,
			contents: CustomizationType.Skill,
			writable: false,
		};
	}

	setup(() => {
		manager = disposables.add(new AgentHostStateManager(new NullLogService()));
	});

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	// ---- Exhaustive origin + customizations on every context ---------------

	suite('createAgentChatContext', () => {

		test('stamps resource and origin for the session-backed default chat', () => {
			manager.createSession(summary());
			const context = createAgentChatContext(manager, session, defaultChat);
			assert.deepStrictEqual({
				configurationResource: context.configurationResource.toString(),
				resource: context.resource.toString(),
				origin: context.origin,
				parent: resolveSubagentChatParent(context),
				customizations: context.customizations,
			}, {
				configurationResource: sessionKey,
				// The default chat's provider-owned storage scope is its session.
				resource: sessionKey,
				origin: { kind: ChatOriginKind.User },
				parent: undefined,
				customizations: undefined,
			});
		});

		test('carries the catalog origin and host customizations for a spawned subagent chat', () => {
			manager.createSession(summary());
			manager.setSessionCustomizations(sessionKey, [customization('alpha', true), customization('beta', false)]);
			manager.addChat(sessionKey, subagentChat.toString(), {
				origin: { kind: ChatOriginKind.Tool, chat: buildDefaultChatUri(sessionKey), toolCallId: 'tool-1' },
			});

			const context = createAgentChatContext(manager, session, subagentChat);
			assert.deepStrictEqual({
				resource: context.resource.toString(),
				origin: context.origin,
				parent: resolveSubagentChatParent(context)?.toolCallId,
				customizations: context.customizations?.map(c => [c.id, c.type === CustomizationType.Directory ? c.enabled : undefined]),
			}, {
				resource: subagentChat.toString(),
				origin: { kind: ChatOriginKind.Tool, chat: buildDefaultChatUri(sessionKey), toolCallId: 'tool-1' },
				parent: 'tool-1',
				customizations: [['alpha', true], ['beta', false]],
			});
		});

		test('resolves the origin of a restored chat before its state is hydrated', () => {
			manager.createSession(summary());
			manager.registerRestoredChatSummary(sessionKey, peerChat.toString(), {
				title: 'Restored',
				origin: { kind: ChatOriginKind.Fork, chat: buildDefaultChatUri(sessionKey), turnId: 'turn-1' },
				resolver: async () => ({ turns: [] }),
			});

			assert.deepStrictEqual({
				// Restored chats have no ChatState until they are resolved…
				state: manager.getChatState(peerChat.toString()),
				// …but their origin is authoritative from the moment they are registered.
				origin: createAgentChatContext(manager, session, peerChat).origin,
			}, {
				state: undefined,
				origin: { kind: ChatOriginKind.Fork, chat: buildDefaultChatUri(sessionKey), turnId: 'turn-1' },
			});
		});
	});

	// ---- Context readers ----------------------------------------------------

	suite('context readers', () => {

		test('tolerate a legacy session-only context', () => {
			assert.deepStrictEqual({
				origin: resolveAgentChatOrigin(session),
				parent: resolveSubagentChatParent(session),
				// No snapshot at all — deliberately not an empty list, which
				// would assert "this session has no customizations".
				customizations: resolveAgentHostCustomizations(session),
				noContext: resolveAgentHostCustomizations(undefined),
			}, {
				origin: undefined,
				parent: undefined,
				customizations: undefined,
				noContext: undefined,
			});
		});

		test('resolveSubagentChatParent only reports tool spawn edges', () => {
			const fork: IAgentChatContext = {
				resource: peerChat,
				configurationResource: session,
				origin: { kind: ChatOriginKind.Fork, chat: buildDefaultChatUri(sessionKey), turnId: 'turn-1' },
			};
			const tool: IAgentChatContext = {
				resource: subagentChat,
				configurationResource: session,
				origin: { kind: ChatOriginKind.Tool, chat: buildDefaultChatUri(sessionKey), toolCallId: 'tool-9' },
			};
			assert.deepStrictEqual({
				fork: resolveSubagentChatParent(fork),
				tool: resolveSubagentChatParent(tool) && {
					chat: resolveSubagentChatParent(tool)!.chat.toString(),
					toolCallId: resolveSubagentChatParent(tool)!.toolCallId,
				},
			}, {
				fork: undefined,
				tool: { chat: buildDefaultChatUri(sessionKey), toolCallId: 'tool-9' },
			});
		});
	});

	// ---- Host-owned active-client fan-out -----------------------------------

	suite('getSessionChatsForFanOut', () => {

		test('distinguishes an absent session from an authoritative catalog', () => {
			const unknown = getSessionChatsForFanOut(manager, session);
			manager.createSession(summary());
			const created = getSessionChatsForFanOut(manager, session)?.map(c => c.toString());
			manager.addChat(sessionKey, peerChat.toString());
			manager.addChat(sessionKey, subagentChat.toString());
			const withPeers = getSessionChatsForFanOut(manager, session)?.map(c => c.toString());

			assert.deepStrictEqual({ unknown, created, withPeers }, {
				// No host state means no authoritative membership to fan out —
				// the default chat is NOT fabricated on the session's behalf.
				unknown: undefined,
				created: [defaultChat.toString()],
				// Default chat first, then the catalog, de-duplicated.
				withPeers: [defaultChat.toString(), peerChat.toString(), subagentChat.toString()],
			});
		});
	});

	// ---- Exhaustive catalog origin ------------------------------------------

	suite('catalog origin', () => {

		test('keeps the default user origin when no explicit origin is supplied', () => {
			manager.createSession(summary());
			manager.addChat(sessionKey, peerChat.toString());
			manager.registerRestoredChatSummary(sessionKey, URI.parse(buildChatUri(sessionKey, 'restored')).toString(), {});

			assert.deepStrictEqual({
				peer: manager.getChatOrigin(peerChat.toString()),
				restored: manager.getChatOrigin(buildChatUri(sessionKey, 'restored')),
				defaultChat: manager.getChatOrigin(defaultChat.toString()),
			}, {
				peer: { kind: ChatOriginKind.User },
				restored: { kind: ChatOriginKind.User },
				defaultChat: { kind: ChatOriginKind.User },
			});
		});

		test('records an explicit origin verbatim', () => {
			manager.createSession(summary());
			const fork: ChatOrigin = { kind: ChatOriginKind.Fork, chat: buildDefaultChatUri(sessionKey), turnId: 'turn-7' };
			manager.addChat(sessionKey, peerChat.toString(), { origin: fork });

			assert.deepStrictEqual(manager.getChatOrigin(peerChat.toString()), fork);
		});
	});

	// ---- Narrow prompt-cache metadata seam ----------------------------------

	suite('AgentHostPromptCache', () => {

		test('reads, writes, and merges the prompt-cache slot without clobbering sibling metadata', () => {
			manager.createSession(summary());
			manager.setSessionMeta(sessionKey, { 'vscode.other': 'keep' });
			const promptCache = new AgentHostPromptCache(manager);

			const initial = promptCache.read(session);
			const written = promptCache.write(session, { modelId: 'model-a', cacheExpiresAt: '2030-01-01T00:00:00.000Z' });
			const readBack = promptCache.read(session);
			// A repeat write of the same value is a no-op that reports the persisted state.
			const repeat = promptCache.write(session, { modelId: 'model-a', cacheExpiresAt: '2030-01-01T00:00:00.000Z' });
			const cleared = promptCache.write(session, undefined);

			assert.deepStrictEqual({
				initial,
				written,
				readBack,
				repeat,
				cleared,
				afterClear: promptCache.read(session),
				siblingMeta: manager.getSessionSummary(sessionKey)?._meta?.['vscode.other'],
			}, {
				initial: undefined,
				written: { modelId: 'model-a', cacheExpiresAt: '2030-01-01T00:00:00.000Z' },
				readBack: { modelId: 'model-a', cacheExpiresAt: '2030-01-01T00:00:00.000Z' },
				repeat: { modelId: 'model-a', cacheExpiresAt: '2030-01-01T00:00:00.000Z' },
				cleared: undefined,
				afterClear: undefined,
				siblingMeta: 'keep',
			});
		});

		test('does not persist for a session the host does not know', () => {
			const promptCache = new AgentHostPromptCache(manager);
			const unknown = AgentSession.uri('copilot', 'nope');
			assert.deepStrictEqual({
				read: promptCache.read(unknown),
				written: promptCache.write(unknown, { modelId: 'model-a', cacheExpiresAt: 'later' }),
				persisted: promptCache.read(unknown),
			}, {
				read: undefined,
				written: { modelId: 'model-a', cacheExpiresAt: 'later' },
				persisted: undefined,
			});
		});
	});

	// ---- Narrow session-title signal ----------------------------------------

	suite('AgentHostSessionTitleSignal', () => {

		test('centralizes the provider filter and conversation-id derivation', () => {
			const signal = disposables.add(new AgentHostSessionTitleSignal(manager));
			const fired: { provider: string; session: string; conversationId: string; title: string }[] = [];
			disposables.add(signal.onDidChangeSessionTitle(e => fired.push({
				provider: e.provider,
				session: e.session.toString(),
				conversationId: e.conversationId,
				title: e.title,
			})));

			manager.createSession(summary());
			manager.dispatchServerAction(sessionKey, { type: ActionType.SessionTitleChanged, title: 'Renamed' });

			assert.deepStrictEqual(fired, [{
				provider: 'copilot',
				session: sessionKey,
				conversationId: 'seam-session',
				title: 'Renamed',
			}]);
		});
	});

	test('a created session is usable by every seam', () => {
		const state = manager.createSession(summary());
		assert.strictEqual(state.lifecycle, SessionLifecycle.Creating);
	});
});
