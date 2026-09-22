/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../log/common/log.js';
import { ActionType, type ChatAction } from '../../../common/state/sessionActions.js';
import { ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputResponseKind, ResponsePartKind } from '../../../common/state/sessionState.js';
import { CodexAgent } from '../../../node/codex/codexAgent.js';
import type { CodexAsyncQuestions } from '../../../node/codex/codexAsyncQuestions.js';
import { createCodexSessionMapState } from '../../../node/codex/codexMapAppServerEvents.js';
import type { ItemStartedNotification } from '../../../node/codex/protocol/generated/v2/ItemStartedNotification.js';
import type { Turn } from '../../../node/codex/protocol/generated/v2/Turn.js';

interface IQuestionSession {
	readonly sessionId: string;
	readonly sessionUri: URI;
	readonly threadId: string;
	currentTurnId: string | undefined;
	currentAppTurnId: string | undefined;
	readonly hostTurnIdByAppTurnId: Map<string, string>;
	readonly mapState: ReturnType<typeof createCodexSessionMapState>;
	asyncQuestions?: CodexAsyncQuestions;
}

interface IQuestionHarness {
	_getAsyncQuestions(session: IQuestionSession): CodexAsyncQuestions;
	_handleItemStarted(session: IQuestionSession, notification: ItemStartedNotification): ChatAction[];
	_abort(chat: URI, context: URI): Promise<void>;
}

/** Reuses the actual agent methods, controlling only transport and unrelated service effects. */
function setup() {
	const session: IQuestionSession = {
		sessionId: 'root', sessionUri: URI.parse('codex:/root'), threadId: 'thread',
		currentTurnId: 'host', currentAppTurnId: 'original', hostTurnIdByAppTurnId: new Map(),
		mapState: createCodexSessionMapState(),
	};
	const sessions = new Map([['root', session]]);
	const reply = new DeferredPromise<{ turn: Turn }>();
	const calls: { method: string; params: { threadId: string; turnId?: string } }[] = [];
	const events: ChatAction[] = [];
	const harness: IQuestionHarness = Object.assign(Object.create(CodexAgent.prototype), {
		_sessions: sessions,
		_connection: { kind: 'ready', client: { request: async (method: string, params: { threadId: string; turnId?: string }) => {
			calls.push({ method, params });
			return method === 'turn/start' ? reply.p : undefined;
		} } },
		_traceContext: () => undefined,
		_fire: (_uri: URI, action: ChatAction) => events.push(action),
		_handleTurnCompletedNotification: () => { throw new Error('Completed the old turn instead of interrupting the continuation'); },
		_logService: new NullLogService(),
		_resolveConversationSession: () => session.sessionUri,
		_drainPendingSteering: () => undefined,
		_withHostTurnId: (_session: IQuestionSession, notification: ItemStartedNotification) => notification,
	});
	const controller = harness._getAsyncQuestions(session);
	return { session, sessions, reply, calls, events, harness, controller };
}

suite('Codex asynchronous question routing', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const turn = (id: string): Turn => ({ id, items: [], itemsView: 'full', status: 'completed', error: null, startedAt: null, completedAt: null, durationMs: null });
	const notification: ItemStartedNotification = {
		threadId: 'thread', turnId: 'original', startedAtMs: 0,
		item: { type: 'agentMessage', id: 'question', text: 'Format?', phase: 'final_answer', memoryCitation: null, delivery: 'async', questions: [{ title: 'Format?', options: ['PDF', 'Text'] }] },
	};

	function answer(h: ReturnType<typeof setup>): void {
		h.harness._handleItemStarted(h.session, notification);
		const event = h.events.find(action => action.type === ActionType.ChatInputRequested);
		assert.ok(event?.type === ActionType.ChatInputRequested);
		h.controller.respond(event.request.id, ChatInputResponseKind.Accept, {
			'0': { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Selected, value: 'PDF' } },
		});
	}

	test('Stop interrupts the acknowledged continuation before its notification arrives', async () => {
		const h = setup();
		answer(h);
		h.controller.holdCompletion({ threadId: 'thread', turn: turn('original') });
		const stopping = h.harness._abort(URI.parse('chat:/root'), h.session.sessionUri);
		await h.reply.complete({ turn: turn('continuation') });
		await stopping;
		assert.deepStrictEqual(h.calls[1], { method: 'turn/interrupt', params: { threadId: 'thread', turnId: 'continuation' } });
		assert.strictEqual(h.session.hostTurnIdByAppTurnId.get('continuation'), 'host');
	});

	test('isolated subagents do not create unreachable interactive controls', () => {
		const h = setup();
		const child = { ...h.session, asyncQuestions: undefined, mapState: createCodexSessionMapState() };
		const actions = h.harness._handleItemStarted(child, notification);
		assert.deepStrictEqual(actions.map(action => action.type === ActionType.ChatResponsePart ? action.part.kind : action.type), [ResponsePartKind.Markdown]);
		assert.strictEqual(child.asyncQuestions, undefined);
		assert.deepStrictEqual(h.events, []);
	});

	for (const scenario of ['newer native turn', 'replacement host turn', 'disposed session', 'completed host turn']) {
		test(`late acknowledgement preserves ${scenario}`, async () => {
			const h = setup();
			answer(h);
			if (scenario === 'newer native turn') {
				h.session.currentAppTurnId = 'newer';
			} else if (scenario === 'replacement host turn') {
				h.session.currentTurnId = 'replacement';
			} else if (scenario === 'disposed session') {
				h.sessions.clear();
			} else {
				h.session.currentTurnId = undefined;
			}
			const expected = h.session.currentAppTurnId;
			await h.reply.complete({ turn: turn('late') });
			await h.controller.whenIdle();
			assert.strictEqual(h.session.currentAppTurnId, expected);
			assert.strictEqual(h.session.hostTurnIdByAppTurnId.has('late'), false);
		});
	}
});
