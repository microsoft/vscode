/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { parseTaskEventsResponse, replayTaskAhpEvents, TaskEventReplayError } from '../../common/taskEventReplay.js';

const SESSION_A = 'ahp-session:/aaaaaaaa-0000-4000-8000-000000000001';
const SESSION_B = 'ahp-session:/bbbbbbbb-0000-4000-8000-000000000002';

/**
 * The default chat channel as Mission Control's recorded frames name it. Deliberately NOT
 * `buildDefaultChatUri`: the host writes `<session>/chat`, while a client builds
 * `ahp-chat://default/<base64>` for the same chat. Replay must accept what was recorded.
 */
function defaultChat(sessionId: string): string {
	return `${sessionId}/chat`;
}

/** A persisted event carrying a whole (unchunked) action envelope. */
function event(sessionId: string, seq: number, channel: string, action: object, extra?: object): object {
	return {
		ns: 'ahp',
		session_id: sessionId,
		seq,
		at: '2026-08-04T12:00:00.000Z',
		payload: { kind: 'message', data: { channel, serverSeq: seq, action, ...extra } },
	};
}

/** Split one envelope across `parts` chunk events, mirroring the relay's chunk codec. */
function chunkedEvents(sessionId: string, startSeq: number, channel: string, action: object, parts: number): object[] {
	const json = JSON.stringify({ channel, serverSeq: startSeq, action });
	const bytes = VSBuffer.fromString(json).buffer;
	const size = Math.ceil(bytes.byteLength / parts);
	const events: object[] = [];
	for (let i = 0; i < parts; i++) {
		events.push({
			ns: 'ahp',
			session_id: sessionId,
			seq: startSeq + i,
			at: '2026-08-04T12:00:00.000Z',
			payload: {
				kind: 'chunk',
				group_id: `g-${startSeq}`,
				seq: i,
				total: parts,
				bytes: encodeBase64(VSBuffer.wrap(bytes.slice(i * size, (i + 1) * size))),
			},
		});
	}
	return events;
}

function titleChanged(title: string): object {
	return { type: 'session/titleChanged', title };
}

function turnStarted(turnId: string, text: string): object {
	return {
		type: 'chat/turnStarted',
		turnId,
		startedAt: '2026-08-04T12:00:00.000Z',
		message: { text, origin: { kind: 'user' } },
	};
}

function turnComplete(turnId: string): object {
	return { type: 'chat/turnComplete', turnId, duration: 1200 };
}

/**
 * The two events a finished turn is recorded as. A turn only lands in `ChatState.turns` once it
 * completes; while it is running it lives in `activeTurn`.
 */
function completedTurn(sessionId: string, startSeq: number, chat: string, turnId: string, text: string): object[] {
	return [
		event(sessionId, startSeq, chat, turnStarted(turnId, text)),
		event(sessionId, startSeq + 1, chat, turnComplete(turnId)),
	];
}

suite('Task event replay', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('folds session and chat history into state', () => {
		const chat = defaultChat(SESSION_A);
		const history = replayTaskAhpEvents([
			event(SESSION_A, 0, SESSION_A, titleChanged('Fix the login bug')),
			...completedTurn(SESSION_A, 1, chat, 't1', 'hello'),
			...completedTurn(SESSION_A, 3, chat, 't2', 'and again'),
		]);

		assert.deepStrictEqual(
			{
				truncated: history?.truncated,
				sessions: history?.sessions.map(s => ({
					session: s.session,
					title: s.state.title,
					chats: [...s.chats.keys()],
					turns: [...s.chats.values()].map(c => c.turns.map(t => t.id)),
				})),
			},
			{
				truncated: false,
				sessions: [{ session: SESSION_A, title: 'Fix the login bug', chats: [chat], turns: [['t1', 't2']] }],
			});
	});

	test('reassembles a chunked envelope', () => {
		const chat = defaultChat(SESSION_A);
		const history = replayTaskAhpEvents([
			...chunkedEvents(SESSION_A, 0, chat, turnStarted('t1', 'a chunked message'), 3),
			event(SESSION_A, 3, chat, turnComplete('t1')),
		]);

		assert.deepStrictEqual(
			[...(history?.sessions[0].chats.get(chat)?.turns ?? [])].map(t => t.id),
			['t1']);
		assert.strictEqual(history?.truncated, false);
	});

	test('reports a truncated tail instead of dropping it silently', () => {
		const chat = defaultChat(SESSION_A);
		// Record only the first half of a two-part group: the recording stops mid-action.
		const partial = chunkedEvents(SESSION_A, 2, chat, turnStarted('t2', 'lost to truncation'), 2)[0];

		const history = replayTaskAhpEvents([...completedTurn(SESSION_A, 0, chat, 't1', 'complete'), partial]);

		assert.deepStrictEqual(
			{
				truncated: history?.truncated,
				turns: [...(history?.sessions[0].chats.get(chat)?.turns ?? [])].map(t => t.id),
			},
			{ truncated: true, turns: ['t1'] });
	});

	test('reports truncation even when an abandoned group is followed by a complete action', () => {
		// A single "last pending group" marker would be cleared by the later complete event and
		// wrongly report the history as whole.
		const chat = defaultChat(SESSION_A);
		const abandoned = chunkedEvents(SESSION_A, 0, chat, turnStarted('t-lost', 'never finished'), 2)[0];
		const history = replayTaskAhpEvents([abandoned, ...completedTurn(SESSION_A, 1, chat, 't1', 'later turn')]);

		assert.deepStrictEqual(
			{
				truncated: history?.truncated,
				turns: [...(history?.sessions[0].chats.get(chat)?.turns ?? [])].map(t => t.id),
			},
			{ truncated: true, turns: ['t1'] });
	});

	test('keeps multiple sessions under one task', () => {
		// ADR 0016 registers a forked child session under its source task, so a task's history can
		// legitimately span more than one session.
		const history = replayTaskAhpEvents([
			event(SESSION_A, 0, SESSION_A, titleChanged('source')),
			event(SESSION_B, 0, SESSION_B, titleChanged('fork')),
		]);

		assert.deepStrictEqual(
			history?.sessions.map(s => ({ session: s.session, title: s.state.title })),
			[{ session: SESSION_A, title: 'source' }, { session: SESSION_B, title: 'fork' }]);
	});

	test('tolerates a mirror restart that resets the transport sequence', () => {
		const chat = defaultChat(SESSION_A);
		const history = replayTaskAhpEvents([
			...completedTurn(SESSION_A, 0, chat, 't1', 'before restart'),
			...completedTurn(SESSION_A, 2, chat, 't2', 'still before'),
			// Mission Control re-hosted the session; the transport sequence restarts at 0.
			...completedTurn(SESSION_A, 0, chat, 't3', 'after restart'),
		]);

		assert.deepStrictEqual(
			[...(history?.sessions[0].chats.get(chat)?.turns ?? [])].map(t => t.id),
			['t1', 't2', 't3']);
	});

	test('reports truncation from an epoch whose reassembler was replaced by a restart', () => {
		// The restart installs a fresh reassembler, so the incomplete group from the first epoch is
		// no longer buffered — the loss has to be remembered or the transcript reads as whole.
		const chat = defaultChat(SESSION_A);
		const partial = chunkedEvents(SESSION_A, 2, chat, turnStarted('t2', 'lost to the restart'), 2)[0];

		const history = replayTaskAhpEvents([
			...completedTurn(SESSION_A, 0, chat, 't1', 'before restart'),
			partial,
			...completedTurn(SESSION_A, 0, chat, 't3', 'after restart'),
		]);

		assert.deepStrictEqual(
			{
				truncated: history?.truncated,
				turns: [...(history?.sessions[0].chats.get(chat)?.turns ?? [])].map(t => t.id),
			},
			{ truncated: true, turns: ['t1', 't3'] });
	});

	test('fails closed on a sequence gap rather than showing a hole as complete', () => {
		const chat = defaultChat(SESSION_A);
		assert.throws(() => replayTaskAhpEvents([
			event(SESSION_A, 0, chat, turnStarted('t1', 'first')),
			event(SESSION_A, 7, chat, turnStarted('t2', 'jumped')),
		]), TaskEventReplayError);
	});

	test('ignores a rejected action', () => {
		const chat = defaultChat(SESSION_A);
		const history = replayTaskAhpEvents([
			...completedTurn(SESSION_A, 0, chat, 't1', 'accepted'),
			event(SESSION_A, 2, chat, turnStarted('t2', 'rejected'), { rejectionReason: 'not allowed' }),
			event(SESSION_A, 3, chat, turnComplete('t2'), { rejectionReason: 'not allowed' }),
		]);

		assert.deepStrictEqual(
			[...(history?.sessions[0].chats.get(chat)?.turns ?? [])].map(t => t.id),
			['t1']);
	});

	test('honours a host-announced default chat channel', () => {
		// The host may name its default chat anything and announce it via `session/defaultChatChanged`.
		// Routing by action type (not channel scheme) is what makes this work.
		const announced = 'ahp-chat://default/some-opaque-id';
		const history = replayTaskAhpEvents([
			event(SESSION_A, 0, SESSION_A, { type: 'session/defaultChatChanged', defaultChat: announced }),
			...completedTurn(SESSION_A, 1, announced, 't1', 'hello'),
		]);

		assert.deepStrictEqual(
			{
				defaultChat: history?.sessions[0].defaultChat,
				turns: history?.sessions[0].chats.get(announced)?.turns.map(t => t.id),
			},
			{ defaultChat: announced, turns: ['t1'] });
	});

	test('surfaces an empty default chat for a session with no chat history', () => {
		const history = replayTaskAhpEvents([event(SESSION_A, 0, SESSION_A, titleChanged('no chat yet'))]);

		assert.deepStrictEqual(
			[...(history?.sessions[0].chats.keys() ?? [])],
			[defaultChat(SESSION_A)]);
	});

	test('returns undefined when the task has no AHP history', () => {
		assert.strictEqual(replayTaskAhpEvents([]), undefined);
	});

	test('rejects a malformed event record', () => {
		assert.throws(() => replayTaskAhpEvents([{ ns: 'not-ahp', session_id: SESSION_A, seq: 0, at: 'x', payload: {} }]), TaskEventReplayError);
	});

	suite('response parsing', () => {

		test('accepts a consistent response', () => {
			assert.deepStrictEqual(parseTaskEventsResponse({ events: [1, 2], total: 2 }), [1, 2]);
		});

		test('rejects a short page presented as whole', () => {
			assert.throws(() => parseTaskEventsResponse({ events: [1], total: 9 }), TaskEventReplayError);
		});

		test('rejects a malformed body', () => {
			assert.throws(() => parseTaskEventsResponse({ nope: true }), TaskEventReplayError);
		});
	});
});
