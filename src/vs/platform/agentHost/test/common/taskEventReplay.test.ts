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

/** The legacy default chat convention; replay must also accept arbitrary host-provided channels. */
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

	test('ignores overlapping batches and interleaved duplicate deltas', () => {
		const chat = defaultChat(SESSION_A);
		const events = [
			event(SESSION_A, 1926, chat, turnStarted('t1', 'hello')),
			event(SESSION_A, 1927, chat, { type: 'chat/responsePart', turnId: 't1', part: { kind: 'markdown', id: 'p1', content: '' } }),
			event(SESSION_A, 1928, chat, { type: 'chat/delta', turnId: 't1', partId: 'p1', content: 'first ' }),
			event(SESSION_A, 1929, chat, { type: 'chat/delta', turnId: 't1', partId: 'p1', content: 'second ' }),
			event(SESSION_A, 1930, chat, { type: 'chat/delta', turnId: 't1', partId: 'p1', content: 'third' }),
			event(SESSION_A, 1931, chat, turnComplete('t1')),
		];
		const history = replayTaskAhpEvents([
			...events.slice(0, 4),
			...structuredClone(events.slice(2, 4)),
			events[4],
			structuredClone(events[2]),
			events[5],
		]);

		assert.deepStrictEqual(
			{
				truncated: history?.truncated,
				turns: history?.sessions[0].chats.get(chat)?.turns.map(t => ({ id: t.id, responseParts: t.responseParts })),
			},
			{ truncated: false, turns: [{ id: 't1', responseParts: [{ kind: 'markdown', id: 'p1', content: 'first second third' }] }] });
	});

	test('ignores duplicate chunks without disrupting an in-flight group', () => {
		const chat = defaultChat(SESSION_A);
		const chunks = chunkedEvents(SESSION_A, 0, chat, turnStarted('t1', 'chunked'), 3);
		const history = replayTaskAhpEvents([
			chunks[0],
			structuredClone(chunks[0]),
			chunks[1],
			structuredClone(chunks[0]),
			chunks[2],
			...structuredClone(chunks),
			event(SESSION_A, 3, chat, turnComplete('t1')),
		]);

		assert.deepStrictEqual(
			{ truncated: history?.truncated, turns: history?.sessions[0].chats.get(chat)?.turns.map(t => t.id) },
			{ truncated: false, turns: ['t1'] });
	});

	test('does not rewind modifiedAt when skipping an older duplicate', () => {
		const first = event(SESSION_A, 2, SESSION_A, titleChanged('first'));
		const later = { ...event(SESSION_A, 3, SESSION_A, titleChanged('later')), at: '2026-08-04T13:00:00.000Z' };
		const history = replayTaskAhpEvents([first, later, structuredClone(first)]);

		assert.deepStrictEqual(
			history?.sessions.map(s => ({ title: s.state.title, modifiedAt: s.modifiedAt })),
			[{ title: 'later', modifiedAt: later.at }]);
	});

	test('clears duplicate tracking at a mirror restart', () => {
		const repeated = event(SESSION_A, 2, SESSION_A, titleChanged('same in both epochs'));
		const history = replayTaskAhpEvents([
			event(SESSION_A, 1, SESSION_A, titleChanged('first epoch')),
			repeated,
			event(SESSION_A, 3, SESSION_A, titleChanged('before restart')),
			event(SESSION_A, 1, SESSION_A, titleChanged('second epoch')),
			structuredClone(repeated),
			event(SESSION_A, 3, SESSION_A, titleChanged('after restart')),
		]);

		assert.deepStrictEqual(
			{ truncated: history?.truncated, title: history?.sessions[0].state.title },
			{ truncated: false, title: 'after restart' });
	});

	test('rejects conflicting records instead of treating them as duplicates', () => {
		const first = event(SESSION_A, 2, SESSION_A, titleChanged('first'));
		for (const conflicting of [
			event(SESSION_A, 2, SESSION_A, titleChanged('different payload')),
			{ ...first, at: '2026-08-04T13:00:00.000Z' },
		]) {
			assert.throws(() => replayTaskAhpEvents([first, conflicting]), TaskEventReplayError);
		}
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

	test('uses the only recorded chat when the default was not announced', () => {
		const chat = 'ahp-chat:/90b9344c160a544093d7a3ebf4089e3f';
		const history = replayTaskAhpEvents(completedTurn(SESSION_A, 0, chat, 't1', 'hello'));
		const session = history?.sessions[0];

		assert.deepStrictEqual({
			defaultChat: session?.defaultChat,
			chats: [...(session?.chats.keys() ?? [])],
			turns: session?.chats.get(session.defaultChat)?.turns.map(turn => turn.id),
		}, { defaultChat: chat, chats: [chat], turns: ['t1'] });
	});

	for (const origin of [
		{ kind: 'tool', chat: 'ahp-chat:/main', toolCallId: 'tool-1' },
		{ kind: 'sideChat', chat: 'ahp-chat:/main', turnId: 't0' },
		{ kind: 'fork', chat: 'ahp-chat:/main', turnId: 't0' },
	]) {
		test(`does not infer the default from a sole recorded ${origin.kind} chat`, () => {
			const peer = 'ahp-chat:/peer';
			const history = replayTaskAhpEvents([
				event(SESSION_A, 0, SESSION_A, {
					type: 'session/chatAdded',
					summary: { resource: peer, title: '', status: 1, modifiedAt: '2026-08-04T12:00:00.000Z', origin },
				}),
				...completedTurn(SESSION_A, 1, peer, 't1', 'peer conversation'),
			]);
			const session = history?.sessions[0];

			assert.deepStrictEqual({
				defaultChat: session?.defaultChat,
				turns: session?.chats.get(session.defaultChat)?.turns,
				peerTurns: session?.chats.get(peer)?.turns.map(turn => turn.id),
			}, { defaultChat: defaultChat(SESSION_A), turns: [], peerTurns: ['t1'] });
		});
	}

	test('does not infer a default when the catalogue advertises another chat', () => {
		const history = replayTaskAhpEvents([
			event(SESSION_A, 0, SESSION_A, {
				type: 'session/chatAdded',
				summary: { resource: 'ahp-chat:/main', title: '', status: 1, modifiedAt: '2026-08-04T12:00:00.000Z', origin: { kind: 'user' } },
			}),
			...completedTurn(SESSION_A, 1, 'ahp-chat:/peer', 't1', 'peer conversation'),
		]);
		const session = history?.sessions[0];

		assert.deepStrictEqual({
			defaultChat: session?.defaultChat,
			turns: session?.chats.get(session.defaultChat)?.turns,
		}, { defaultChat: defaultChat(SESSION_A), turns: [] });
	});

	for (const kind of ['user', 'tool', 'sideChat', 'fork']) {
		test(`does not infer the default from a removed ${kind} chat`, () => {
			const chat = 'ahp-chat:/removed';
			const history = replayTaskAhpEvents([
				event(SESSION_A, 0, SESSION_A, {
					type: 'session/chatAdded',
					summary: {
						resource: chat, title: '', status: 1, modifiedAt: '2026-08-04T12:00:00.000Z',
						origin: { kind, chat: 'ahp-chat:/main', turnId: 't0', toolCallId: 'tool-1' },
					},
				}),
				...completedTurn(SESSION_A, 1, chat, 't1', 'removed conversation'),
				event(SESSION_A, 3, SESSION_A, { type: 'session/chatRemoved', chat }),
			]);
			const session = history?.sessions[0];

			assert.deepStrictEqual({
				catalogue: session?.state.chats,
				defaultChat: session?.defaultChat,
				turns: session?.chats.get(session.defaultChat)?.turns,
			}, { catalogue: [], defaultChat: defaultChat(SESSION_A), turns: [] });
		});
	}

	test('honours a chat removal even when its addition was not recorded', () => {
		const chat = 'ahp-chat:/removed';
		const history = replayTaskAhpEvents([
			...completedTurn(SESSION_A, 0, chat, 't1', 'removed conversation'),
			event(SESSION_A, 2, SESSION_A, { type: 'session/chatRemoved', chat }),
		]);
		const session = history?.sessions[0];

		assert.deepStrictEqual({
			defaultChat: session?.defaultChat,
			turns: session?.chats.get(session.defaultChat)?.turns,
		}, { defaultChat: defaultChat(SESSION_A), turns: [] });
	});

	test('uses the sole recorded user chat advertised in the catalogue', () => {
		const chat = 'ahp-chat:/main';
		const history = replayTaskAhpEvents([
			event(SESSION_A, 0, SESSION_A, {
				type: 'session/chatAdded',
				summary: { resource: chat, title: '', status: 1, modifiedAt: '2026-08-04T12:00:00.000Z', origin: { kind: 'user' } },
			}),
			...completedTurn(SESSION_A, 1, chat, 't1', 'main conversation'),
		]);
		const session = history?.sessions[0];

		assert.deepStrictEqual({
			defaultChat: session?.defaultChat,
			turns: session?.chats.get(session.defaultChat)?.turns.map(turn => turn.id),
		}, { defaultChat: chat, turns: ['t1'] });
	});

	test('uses the sole recorded chat whose addition predates the mirror but is updated in it', () => {
		// A chat created with its session is announced only in the subscribe snapshot, so the mirror
		// holds its title and read-state updates but never its addition.
		const chat = 'ahp-chat:/efe1067798025ce69f332c535acc56c5';
		const history = replayTaskAhpEvents([
			...completedTurn(SESSION_A, 0, chat, 't1', 'Are you able to see this screenshot?'),
			event(SESSION_A, 2, SESSION_A, { type: 'session/chatUpdated', chat, changes: { title: 'Screenshot check' } }),
			event(SESSION_A, 3, SESSION_A, { type: 'session/chatsReordered', chats: [chat] }),
		]);
		const session = history?.sessions[0];

		assert.deepStrictEqual({
			defaultChat: session?.defaultChat,
			chats: [...(session?.chats.keys() ?? [])],
			turns: session?.chats.get(session.defaultChat)?.turns.map(turn => turn.id),
		}, { defaultChat: chat, chats: [chat], turns: ['t1'] });
	});

	test('does not infer a default when the catalogue updates or orders another chat', () => {
		const recorded = 'ahp-chat:/recorded';
		const other = 'ahp-chat:/other';
		const results = [
			{ type: 'session/chatUpdated', chat: other, changes: { title: 'Other' } },
			{ type: 'session/chatsReordered', chats: [other, recorded] },
		].map(catalogueAction => {
			const history = replayTaskAhpEvents([
				...completedTurn(SESSION_A, 0, recorded, 't1', 'recorded conversation'),
				event(SESSION_A, 2, SESSION_A, catalogueAction),
			]);
			const session = history?.sessions[0];
			return { defaultChat: session?.defaultChat, turns: session?.chats.get(session.defaultChat)?.turns };
		});

		assert.deepStrictEqual(results, [
			{ defaultChat: defaultChat(SESSION_A), turns: [] },
			{ defaultChat: defaultChat(SESSION_A), turns: [] },
		]);
	});

	test('a removed chat no longer counts against the sole recorded chat', () => {
		const recorded = 'ahp-chat:/recorded';
		const removedPeer = 'ahp-chat:/peer';
		const history = replayTaskAhpEvents([
			event(SESSION_A, 0, SESSION_A, { type: 'session/chatUpdated', chat: removedPeer, changes: { title: 'Peer' } }),
			...completedTurn(SESSION_A, 1, recorded, 't1', 'recorded conversation'),
			event(SESSION_A, 3, SESSION_A, { type: 'session/chatRemoved', chat: removedPeer }),
		]);
		const session = history?.sessions[0];

		assert.deepStrictEqual({
			defaultChat: session?.defaultChat,
			turns: session?.chats.get(session.defaultChat)?.turns.map(turn => turn.id),
		}, { defaultChat: recorded, turns: ['t1'] });
	});

	for (const origin of [
		{ kind: 'tool', chat: 'ahp-chat:/778b7d08ad125ac797d5b9e3be43c5bd', toolCallId: 'tool-1' },
		{ kind: 'sideChat', chat: 'ahp-chat:/778b7d08ad125ac797d5b9e3be43c5bd', turnId: 't1' },
		{ kind: 'fork', chat: 'ahp-chat:/778b7d08ad125ac797d5b9e3be43c5bd', turnId: 't1' },
	]) {
		test(`sets a recorded ${origin.kind} chat aside and replays the chat it came from`, () => {
			// The main chat is never announced to the mirror; the peer is, with an origin naming the
			// main chat. Both carry turns, so counting recorded chats alone cannot pick between them.
			const main = origin.chat;
			const peer = 'ahp-chat:/7c81a59347705b4e80b2d587ed6618f6';
			const history = replayTaskAhpEvents([
				...completedTurn(SESSION_A, 0, main, 't1', 'Are you familiar with Jev?'),
				event(SESSION_A, 2, SESSION_A, {
					type: 'session/chatAdded',
					summary: { resource: peer, title: 'Worker', status: 1, modifiedAt: '2026-08-04T12:00:00.000Z', origin },
				}),
				...completedTurn(SESSION_A, 3, peer, 't2', 'delegated work'),
				event(SESSION_A, 5, SESSION_A, { type: 'session/chatUpdated', chat: main, changes: { title: 'Jev' } }),
				event(SESSION_A, 6, SESSION_A, { type: 'session/chatsReordered', chats: [main, peer] }),
			]);
			const session = history?.sessions[0];

			assert.deepStrictEqual({
				defaultChat: session?.defaultChat,
				chats: [...(session?.chats.keys() ?? [])],
				turns: session?.chats.get(session.defaultChat)?.turns.map(turn => turn.id),
				peerTurns: session?.chats.get(peer)?.turns.map(turn => turn.id),
			}, { defaultChat: main, chats: [main, peer], turns: ['t1'], peerTurns: ['t2'] });
		});
	}

	for (const origin of [
		{ kind: 'tool', chat: 'opaque-chat://host/other-root', toolCallId: 'tool-1' },
		{ kind: 'sideChat', chat: 'opaque-chat://host/other-root', turnId: 't0' },
		{ kind: 'fork', chat: 'opaque-chat://host/other-root', turnId: 't0' },
		{ kind: 'future-peer', chat: 'opaque-chat://host/main' },
	]) {
		test(`does not infer a default from unsupported ${origin.kind} ancestry`, () => {
			const main = 'opaque-chat://host/main';
			const peer = 'opaque-chat://host/peer';
			const history = replayTaskAhpEvents([
				...completedTurn(SESSION_A, 0, main, 't1', 'candidate conversation'),
				event(SESSION_A, 2, SESSION_A, {
					type: 'session/chatAdded',
					summary: { resource: peer, title: '', status: 1, modifiedAt: '2026-08-04T12:00:00.000Z', origin },
				}),
			]);
			const session = history?.sessions[0];

			assert.deepStrictEqual({
				defaultChat: session?.defaultChat,
				turns: session?.chats.get(session.defaultChat)?.turns,
				recordedTurns: session?.chats.get(main)?.turns.map(turn => turn.id),
			}, { defaultChat: defaultChat(SESSION_A), turns: [], recordedTurns: ['t1'] });
		});
	}

	test('infers the main chat through a peer chain with an unrecorded intermediate chat', () => {
		const main = 'opaque-chat://host/main';
		const parent = 'opaque-chat://host/parent';
		const child = 'opaque-chat://host/child';
		const history = replayTaskAhpEvents([
			...completedTurn(SESSION_A, 0, main, 't1', 'main conversation'),
			event(SESSION_A, 2, SESSION_A, {
				type: 'session/chatAdded',
				summary: { resource: parent, title: '', status: 1, modifiedAt: '2026-08-04T12:00:00.000Z', origin: { kind: 'tool', chat: main, toolCallId: 'tool-1' } },
			}),
			event(SESSION_A, 3, SESSION_A, {
				type: 'session/chatAdded',
				summary: { resource: child, title: '', status: 1, modifiedAt: '2026-08-04T12:00:00.000Z', origin: { kind: 'fork', chat: parent, turnId: 'parent-turn' } },
			}),
			...completedTurn(SESSION_A, 4, child, 't2', 'child conversation'),
			event(SESSION_A, 6, SESSION_A, { type: 'session/chatsReordered', chats: [child, parent] }),
		]);
		const session = history?.sessions[0];

		assert.deepStrictEqual({
			defaultChat: session?.defaultChat,
			turns: session?.chats.get(session.defaultChat)?.turns.map(turn => turn.id),
			childTurns: session?.chats.get(child)?.turns.map(turn => turn.id),
		}, { defaultChat: main, turns: ['t1'], childTurns: ['t2'] });
	});

	for (const { name, parents } of [
		{ name: 'a cycle', parents: [['opaque-chat:/first', 'opaque-chat:/second'], ['opaque-chat:/second', 'opaque-chat:/first']] },
		{ name: 'a self-cycle', parents: [['opaque-chat:/first', 'opaque-chat:/first']] },
		{ name: 'an unknown ancestor', parents: [['opaque-chat:/first', 'opaque-chat:/missing'], ['opaque-chat:/second', 'opaque-chat:/first']] },
	]) {
		test(`does not infer a default through ${name} in peer ancestry`, () => {
			const main = 'opaque-chat:/main';
			const history = replayTaskAhpEvents([
				...completedTurn(SESSION_A, 0, main, 't1', 'candidate conversation'),
				...parents.map(([resource, parent], index) => event(SESSION_A, index + 2, SESSION_A, {
					type: 'session/chatAdded',
					summary: { resource, title: '', status: 1, modifiedAt: '2026-08-04T12:00:00.000Z', origin: { kind: 'tool', chat: parent, toolCallId: 'tool-1' } },
				})),
			]);
			const session = history?.sessions[0];

			assert.deepStrictEqual({
				defaultChat: session?.defaultChat,
				turns: session?.chats.get(session.defaultChat)?.turns,
			}, { defaultChat: defaultChat(SESSION_A), turns: [] });
		});
	}

	test('does not infer a default through a removed peer ancestor', () => {
		const main = 'opaque-chat:/main';
		const parent = 'opaque-chat:/parent';
		const child = 'opaque-chat:/child';
		const history = replayTaskAhpEvents([
			...completedTurn(SESSION_A, 0, main, 't1', 'candidate conversation'),
			event(SESSION_A, 2, SESSION_A, {
				type: 'session/chatAdded',
				summary: { resource: parent, title: '', status: 1, modifiedAt: '2026-08-04T12:00:00.000Z', origin: { kind: 'tool', chat: main, toolCallId: 'tool-1' } },
			}),
			event(SESSION_A, 3, SESSION_A, {
				type: 'session/chatAdded',
				summary: { resource: child, title: '', status: 1, modifiedAt: '2026-08-04T12:00:00.000Z', origin: { kind: 'sideChat', chat: parent, turnId: 'parent-turn' } },
			}),
			event(SESSION_A, 4, SESSION_A, { type: 'session/chatRemoved', chat: parent }),
		]);
		const session = history?.sessions[0];

		assert.deepStrictEqual({
			defaultChat: session?.defaultChat,
			turns: session?.chats.get(session.defaultChat)?.turns,
		}, { defaultChat: defaultChat(SESSION_A), turns: [] });
	});

	test('does not pick between two recorded user chats even when a peer is set aside', () => {
		const first = 'ahp-chat:/first';
		const second = 'ahp-chat:/second';
		const peer = 'ahp-chat:/peer';
		const history = replayTaskAhpEvents([
			...completedTurn(SESSION_A, 0, first, 't1', 'first conversation'),
			...completedTurn(SESSION_A, 2, second, 't2', 'second conversation'),
			event(SESSION_A, 4, SESSION_A, {
				type: 'session/chatAdded',
				summary: { resource: peer, title: '', status: 1, modifiedAt: '2026-08-04T12:00:00.000Z', origin: { kind: 'tool', chat: first, toolCallId: 'tool-1' } },
			}),
			...completedTurn(SESSION_A, 5, peer, 't3', 'delegated work'),
		]);
		const session = history?.sessions[0];

		assert.deepStrictEqual({
			defaultChat: session?.defaultChat,
			turns: session?.chats.get(session.defaultChat)?.turns,
		}, { defaultChat: defaultChat(SESSION_A), turns: [] });
	});

	test('does not replace an announced empty default with a peer chat', () => {
		const announced = 'ahp-chat:/main';
		const peer = 'ahp-chat:/peer';
		const history = replayTaskAhpEvents([
			event(SESSION_A, 0, SESSION_A, { type: 'session/defaultChatChanged', defaultChat: announced }),
			...completedTurn(SESSION_A, 1, peer, 't1', 'peer conversation'),
		]);
		const session = history?.sessions[0];

		assert.deepStrictEqual({
			defaultChat: session?.defaultChat,
			turns: session?.chats.get(session.defaultChat)?.turns,
			peerTurns: session?.chats.get(peer)?.turns.map(turn => turn.id),
		}, { defaultChat: announced, turns: [], peerTurns: ['t1'] });
	});

	test('preserves separate chats when the recorded default is ambiguous', () => {
		const history = replayTaskAhpEvents([
			...completedTurn(SESSION_A, 0, 'ahp-chat:/first', 't1', 'first conversation'),
			...completedTurn(SESSION_A, 2, 'ahp-chat:/second', 't2', 'second conversation'),
		]);
		const session = history?.sessions[0];

		assert.deepStrictEqual({
			defaultChat: session?.defaultChat,
			turns: [...(session?.chats.values() ?? [])].map(chat => chat.turns.map(turn => turn.id)),
		}, { defaultChat: defaultChat(SESSION_A), turns: [['t1'], ['t2'], []] });
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
