/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { CompletionItemKind } from '../../common/state/protocol/commands.js';
import { buildChatUri, buildDefaultChatUri, ChatInteractivity, ChatOriginKind, createChatState, createSessionState, MessageAttachmentKind, MessageKind, mergeSessionWithDefaultChat, SessionStatus, TurnState, type ActiveTurn, type ChatOrigin, type ChatState, type ChatSummary, type ISessionWithDefaultChat, type SessionSummary, type Turn, type URI } from '../../common/state/sessionState.js';
import { AgentHostCompletions, CompletionTriggerCharacter } from '../../node/agentHostCompletions.js';
import { AgentHostChatCompletionProvider, extractChatToken } from '../../node/agentHostChatCompletionProvider.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';

const SESSION_URI = 'ahp-copilot://session-1';
const DEFAULT_CHAT_URI = buildDefaultChatUri(SESSION_URI);

function makeTurn(id: string): Turn {
	return { id, message: { text: '', origin: { kind: MessageKind.User } }, responseParts: [], usage: undefined, state: TurnState.Complete };
}

function makeActiveTurn(id: string): ActiveTurn {
	return { id, startedAt: new Date(0).toISOString(), message: { text: '', origin: { kind: MessageKind.User } }, responseParts: [], usage: undefined };
}

function makeChatSummary(resource: string, title: string, opts?: { modifiedAt?: string; origin?: ChatOrigin; interactivity?: ChatInteractivity }): ChatSummary {
	return {
		resource,
		title,
		status: SessionStatus.Idle,
		modifiedAt: opts?.modifiedAt ?? new Date(0).toISOString(),
		origin: opts?.origin,
		interactivity: opts?.interactivity,
	};
}

/**
 * A fixture chat: its catalog summary plus the completed/active turns of its
 * {@link ChatState}.
 */
interface IFixtureChat {
	readonly summary: ChatSummary;
	readonly turns?: readonly Turn[];
	readonly activeTurn?: ActiveTurn;
}

/**
 * A minimal {@link AgentHostStateManager} that serves controlled fixtures for
 * the three read methods the provider uses. Every chat state (default and peer)
 * is keyed by its resource in one map, so `getChatState` resolves them all.
 */
class FakeStateManager extends AgentHostStateManager {
	private readonly _session: ISessionWithDefaultChat;
	private readonly _fixtureChatStates = new Map<string, ChatState>();

	constructor(chats: readonly IFixtureChat[], defaultChat?: string) {
		super(new NullLogService());
		const summary: SessionSummary = {
			resource: SESSION_URI,
			provider: 'copilot',
			title: 't',
			status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(),
			modifiedAt: new Date(0).toISOString(),
		};
		this._session = mergeSessionWithDefaultChat({ ...createSessionState(summary), chats: chats.map(c => c.summary), defaultChat }, undefined);
		for (const chat of chats) {
			this._fixtureChatStates.set(chat.summary.resource, { ...createChatState(chat.summary), turns: [...(chat.turns ?? [])], activeTurn: chat.activeTurn });
		}
	}

	override getSessionState(): ISessionWithDefaultChat | undefined {
		return this._session;
	}

	override getChatState(chat: URI): ChatState | undefined {
		return this._fixtureChatStates.get(chat);
	}

	override getDefaultChatState(): ChatState | undefined {
		return this._fixtureChatStates.get(DEFAULT_CHAT_URI);
	}
}

suite('AgentHostChatCompletionProvider', () => {

	const disposables = new DisposableStore();
	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('announces only "#" as a trigger character via IAgentHostCompletions', () => {
		const completions = disposables.add(new AgentHostCompletions(new NullLogService()));
		const stateManager = disposables.add(new FakeStateManager([]));
		disposables.add(completions.registerProvider(new AgentHostChatCompletionProvider(stateManager)));
		assert.deepStrictEqual([...completions.triggerCharacters], [CompletionTriggerCharacter.Hash]);
	});

	suite('extractChatToken', () => {
		test('extracts the title filter and range across the prefix lifecycle', () => {
			assert.deepStrictEqual(
				[
					extractChatToken('hello world', 5),          // no '#'
					extractChatToken('ping #file', 10),          // '#file' is not a chat token
					extractChatToken('ping #', 6),               // bare '#': still could become #chat:
					extractChatToken('ping #ch', 8),             // typing the 'chat:' prefix
					extractChatToken('ping #chat:', 11),         // prefix complete, empty filter
					extractChatToken('ping #chat:Pla', 14),      // filter typed
					extractChatToken('#CHAT:Pla', 9),            // case-insensitive prefix
					extractChatToken('a#chat:x', 8),             // '#' not preceded by whitespace
					extractChatToken('#chat:a b', 9),            // whitespace terminates the token
				],
				[
					undefined,
					undefined,
					{ typed: '', rangeStart: 5, rangeEnd: 6 },
					{ typed: '', rangeStart: 5, rangeEnd: 8 },
					{ typed: '', rangeStart: 5, rangeEnd: 11 },
					{ typed: 'Pla', rangeStart: 5, rangeEnd: 14 },
					{ typed: 'Pla', rangeStart: 0, rangeEnd: 9 },
					undefined,
					undefined,
				],
			);
		});
	});

	suite('provideCompletionItems', () => {

		function run(stateManager: AgentHostStateManager, text: string, offset: number, channel = DEFAULT_CHAT_URI) {
			const provider = new AgentHostChatCompletionProvider(stateManager);
			return provider.provideCompletionItems(
				{ kind: CompletionItemKind.UserMessage, channel, text, offset },
				CancellationToken.None,
			);
		}

		test('returns [] when no chat token is being typed', async () => {
			const stateManager = disposables.add(new FakeStateManager([
				{ summary: makeChatSummary(DEFAULT_CHAT_URI, 'Default', { origin: { kind: ChatOriginKind.User } }), turns: [makeTurn('d1')] },
				{ summary: makeChatSummary(buildChatUri(SESSION_URI, 'c1'), 'Planning'), turns: [makeTurn('c1-1')] },
			]));
			assert.deepStrictEqual(await run(stateManager, 'see #file', 9), []);
		});

		test('excludes current chat, subagent chats, hidden chats, and chats without a completed turn', async () => {
			const planningUri = buildChatUri(SESSION_URI, 'planning');
			const stateManager = disposables.add(new FakeStateManager([
				// current chat (the default chat) — must never be listed
				{ summary: makeChatSummary(DEFAULT_CHAT_URI, 'Default', { origin: { kind: ChatOriginKind.User } }), turns: [makeTurn('d1')] },
				// a normal peer chat with two completed turns → endTurn is the last one
				{ summary: makeChatSummary(planningUri, 'Planning notes'), turns: [makeTurn('p1'), makeTurn('p2')] },
				// subagent chat spawned by a tool → excluded
				{ summary: makeChatSummary(buildChatUri(SESSION_URI, 'sub'), 'Worker', { origin: { kind: ChatOriginKind.Tool, chat: DEFAULT_CHAT_URI, toolCallId: 'tc1' } }), turns: [makeTurn('s1')] },
				// hidden worker chat → excluded
				{ summary: makeChatSummary(buildChatUri(SESSION_URI, 'hidden'), 'Hidden', { interactivity: ChatInteractivity.Hidden }), turns: [makeTurn('h1')] },
				// only an active turn, no completed turn → skipped
				{ summary: makeChatSummary(buildChatUri(SESSION_URI, 'active'), 'Active', { interactivity: ChatInteractivity.Full }), activeTurn: makeActiveTurn('a1') },
			]));

			const result = await run(stateManager, 'ref #chat:', 10);

			assert.deepStrictEqual(result, [{
				insertText: '#chat:Planning notes ',
				rangeStart: 4,
				rangeEnd: 10,
				attachment: {
					type: MessageAttachmentKind.Chat,
					resource: planningUri,
					endTurn: 'p2',
					label: 'Planning notes',
				},
			}]);
		});

		test('excludes the default chat when the channel is the session URI', async () => {
			const peerUri = buildChatUri(SESSION_URI, 'peer');
			const stateManager = disposables.add(new FakeStateManager([
				{ summary: makeChatSummary(DEFAULT_CHAT_URI, 'Default', { origin: { kind: ChatOriginKind.User } }), turns: [makeTurn('d1')] },
				{ summary: makeChatSummary(peerUri, 'Peer'), turns: [makeTurn('e1')] },
			]));
			const result = await run(stateManager, '#chat:', 6, SESSION_URI);
			assert.deepStrictEqual(result.map(i => i.attachment), [{
				type: MessageAttachmentKind.Chat,
				resource: peerUri,
				endTurn: 'e1',
				label: 'Peer',
			}]);
		});

		test('filters by title (case-insensitive) and sorts newest first', async () => {
			const alpha = buildChatUri(SESSION_URI, 'alpha');
			const beta = buildChatUri(SESSION_URI, 'beta');
			const gamma = buildChatUri(SESSION_URI, 'gamma');
			const stateManager = disposables.add(new FakeStateManager([
				{ summary: makeChatSummary(DEFAULT_CHAT_URI, 'Default', { origin: { kind: ChatOriginKind.User } }), turns: [makeTurn('d1')] },
				{ summary: makeChatSummary(alpha, 'Alpha review', { modifiedAt: '2025-01-01T00:00:00.000Z' }), turns: [makeTurn('a1')] },
				{ summary: makeChatSummary(beta, 'Beta review', { modifiedAt: '2025-03-01T00:00:00.000Z' }), turns: [makeTurn('b1')] },
				{ summary: makeChatSummary(gamma, 'Unrelated', { modifiedAt: '2025-06-01T00:00:00.000Z' }), turns: [makeTurn('g1')] },
			]));
			const result = await run(stateManager, '#chat:review', 12);
			assert.deepStrictEqual(result.map(i => i.attachment.label), ['Beta review', 'Alpha review']);
		});
	});
});
