/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { ActionType, type ActionEnvelope, type ChatDeltaAction } from '../../common/state/sessionActions.js';
import { Reassembler } from '../../common/webPubSub/chunking.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import {
	MissionControlSessionMirror, type IMissionControlSessionMirrorOptions, type MissionControlMirrorEvent, type IMissionControlMirrorBackfill,
} from '../../node/missionControlSessionMirror.js';

const environment = 'env_xyz';
const sessionId = 'ahp-session:/sess_abc123';
const otherSession = 'custom-session:/different-owner';
const at = '2026-05-19T18:00:00.123Z';

function action(serverSeq = 102, content = 'part-102'): ActionEnvelope & { readonly action: ChatDeltaAction } {
	return {
		channel: 'ahp-chat:/opaque-chat', action: { type: ActionType.ChatDelta, turnId: 't1', partId: 'p1', content },
		serverSeq, origin: undefined,
	};
}

function backfill(from_seq: number, to_seq: number, session_id = sessionId): IMissionControlMirrorBackfill {
	return { kind: 'backfill_request', environment_id: environment, session_id, ns: 'ahp', from_seq, to_seq, request_id: 'bf-request' };
}

function frames(events: readonly MissionControlMirrorEvent[]) {
	return events.flatMap(event => event.event === 'sessionEvents' && event.data.ns === 'ahp' ? [event.data] : []);
}

function sdkFrames(events: readonly MissionControlMirrorEvent[]) {
	return events.flatMap(event => event.event === 'sessionEvents' && event.data.ns === 'sdk' ? [event.data] : []);
}

suite('MissionControlSessionMirror', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let clock: sinon.SinonFakeTimers;

	setup(() => {
		clock = sinon.useFakeTimers({ now: Date.parse(at), toFake: ['Date', 'setTimeout', 'clearTimeout'] });
	});

	teardown(() => {
		sinon.restore();
	});

	function fixture(options: IMissionControlSessionMirrorOptions = {}) {
		const instantiation = store.add(new TestInstantiationService());
		const log = store.add(new NullLogService());
		const errors = sinon.spy(log, 'error');
		const warnings = sinon.spy(log, 'warn');
		instantiation.stub(ILogService, log);
		const mirror = store.add(instantiation.createInstance(MissionControlSessionMirror, environment, options));
		mirror.registerSession(sessionId);
		const events: MissionControlMirrorEvent[] = [];
		const attach = () => store.add(mirror.attach(event => { events.push(event); }));
		return { mirror, events, attach, errors, warnings };
	}

	test('publishes the flat authoritative envelope in the sessionEvents user-event shape, never inline', () => {
		const { mirror, events, attach } = fixture();
		attach();
		const envelope = { ...action(), origin: { clientId: 'client', clientSeq: 9 }, rejectionReason: 'rejected' };
		const expected = JSON.parse(JSON.stringify(envelope));
		assert.strictEqual(mirror.enqueue(envelope, sessionId), true);
		envelope.action.content = 'mutated after dispatch';
		assert.deepStrictEqual(events, []);
		clock.runAll();
		assert.deepStrictEqual(events, [{
			type: 'event', event: 'sessionEvents', dataType: 'json',
			data: { environment_id: environment, session_id: sessionId, ns: 'ahp', seq: 0, at, payload: { kind: 'message', data: expected } },
		}]);
	});

	test('sequences each chunk separately and replays exact retained frames in ordered backfill', () => {
		const { mirror, events, attach } = fixture({ chunkOptions: { maxChunkBytes: 180, newGroupId: () => 'fixed-group' } });
		attach();
		const envelope = action(412, 'large payload '.repeat(50));
		mirror.enqueue(envelope, sessionId);
		clock.runAll();
		const original = frames(events);
		assert.ok(original.length > 3);
		const reassembler = new Reassembler();
		let reassembled: unknown = null;
		for (const [index, frame] of original.entries()) {
			assert.strictEqual(frame.seq, index);
			assert.strictEqual(frame.payload.kind, 'chunk');
			reassembled = reassembler.ingest(frame.payload);
		}
		assert.deepStrictEqual(reassembled, JSON.parse(JSON.stringify(envelope)));
		events.length = 0;
		clock.tick(1000);
		mirror.backfill(backfill(1, 3));
		assert.deepStrictEqual(events, []);
		clock.runAll();
		assert.deepStrictEqual(frames(events), original.slice(1, 4));
	});

	test('has exactly 1024 credits per session, not per channel or transport connection', () => {
		const { mirror, events, attach } = fixture();
		mirror.registerSession(otherSession);
		attach();
		for (let index = 0; index < 1025; index++) {
			mirror.enqueue(action(index), sessionId);
		}
		mirror.enqueue(action(9000), otherSession);
		clock.runAll();
		assert.deepStrictEqual({
			main: frames(events).filter(frame => frame.session_id === sessionId).length,
			other: frames(events).filter(frame => frame.session_id === otherSession).map(frame => frame.seq),
			published: mirror.getSessionStatus(sessionId).publishedSeq,
		}, { main: 1024, other: [0], published: 1023 });
		mirror.ingestAck({ watermarks: { [sessionId]: { ahp: 0 } } });
		clock.runAll();
		assert.deepStrictEqual(frames(events).filter(frame => frame.session_id === sessionId).map(frame => frame.seq),
			Array.from({ length: 1025 }, (_, index) => index));
	});

	test('ingest acknowledgements validate atomically and only free published contiguous prefixes', () => {
		const { mirror, attach } = fixture();
		mirror.registerSession(otherSession);
		mirror.enqueue(action(), sessionId);
		assert.throws(() => mirror.ingestAck({ watermarks: { [sessionId]: { ahp: 0 } } }), /exceeds published/);
		attach();
		mirror.enqueue(action(200), sessionId);
		mirror.enqueue(action(), otherSession);
		clock.runAll();
		for (const invalid of [
			{ watermarks: { [sessionId]: { ahp: -1 } } },
			{ watermarks: { [sessionId]: { ahp: 0.5 } } },
			{ watermarks: { [sessionId]: { ahp: Number.MAX_SAFE_INTEGER + 1 } } },
			{ watermarks: { [sessionId]: { ahp: '0' } } },
			{ watermarks: { [sessionId]: {} } },
			{ watermarks: { [sessionId]: { raw: 0 } } },
			{ watermarks: { [sessionId]: { ahp: 0 }, [otherSession]: { ahp: 1 } } },
			{ watermarks: null },
		]) {
			assert.throws(() => mirror.ingestAck(invalid));
		}
		assert.strictEqual(mirror.statistics.retainedFrames, 3);
		mirror.ingestAck({ ack_for_batch: 'batch-id', watermarks: { [sessionId]: { sdk: 999 } } });
		assert.strictEqual(mirror.statistics.retainedFrames, 3);
		mirror.ingestAck({ watermarks: { [sessionId]: { ahp: 0 }, 'unknown-session:/old': { ahp: 200 } } });
		const retainedBytes = mirror.statistics.retainedBytes;
		mirror.ingestAck({ watermarks: { [sessionId]: { ahp: 0 } } });
		assert.deepStrictEqual({ frames: mirror.statistics.retainedFrames, bytes: mirror.statistics.retainedBytes }, { frames: 2, bytes: retainedBytes });
		mirror.ingestAck({ watermarks: { [sessionId]: { ahp: 1 }, [otherSession]: { ahp: 0 } } });
		mirror.ingestAck({ watermarks: { [sessionId]: { ahp: 0 } } });
		assert.deepStrictEqual(mirror.statistics, { sessions: 2, retainedFrames: 0, retainedBytes: 0, pendingBackfillFrames: 0, pendingBackfillRequests: 0 });
	});

	test('disconnect retains sequences and spools; reconnect retransmits unacknowledged frames without new credit', () => {
		const { mirror, events, attach } = fixture();
		const oldAttachment = attach();
		for (let index = 0; index < 1025; index++) {
			mirror.enqueue(action(index), sessionId);
		}
		clock.runAll();
		mirror.ingestAck({ watermarks: { [sessionId]: { ahp: 0 } } });
		oldAttachment.dispose();
		events.length = 0;
		attach();
		oldAttachment.dispose();
		clock.runAll();
		assert.deepStrictEqual(frames(events).map(frame => frame.seq), Array.from({ length: 1024 }, (_, index) => index + 1));
		assert.deepStrictEqual({
			published: mirror.getSessionStatus(sessionId).publishedSeq, next: mirror.getSessionStatus(sessionId).nextSeq,
			retained: mirror.statistics.retainedFrames,
		}, { published: 1024, next: 1025, retained: 1024 });
	});

	test('disposing a replaced attachment cannot close the current sender', () => {
		const { mirror, events, attach } = fixture();
		const stale = attach();
		attach();
		stale.dispose();
		mirror.enqueue(action(), sessionId);
		clock.runAll();
		assert.deepStrictEqual(frames(events).map(frame => frame.seq), [0]);
	});

	test('a throwing transport detaches without losing the failed frame or disrupting direct AHP', () => {
		const { mirror, events, attach, warnings } = fixture();
		const direct: ActionEnvelope[] = [];
		store.add(mirror.attach(event => {
			if (event.event === 'sessionEvents' && event.data.seq === 1) {
				throw new Error('queue full');
			}
			events.push(event);
		}));
		for (let index = 0; index < 3; index++) {
			const envelope = action(index);
			direct.push(envelope);
			assert.strictEqual(mirror.enqueue(envelope, sessionId), true);
		}
		clock.runAll();
		assert.deepStrictEqual({
			sent: frames(events).map(frame => frame.seq), direct: direct.length, warnings: warnings.callCount,
			published: mirror.getSessionStatus(sessionId).publishedSeq, retained: mirror.statistics.retainedFrames,
			failure: mirror.getSessionStatus(sessionId).failure,
		}, { sent: [0], direct: 3, warnings: 1, published: 0, retained: 3, failure: undefined });
		assert.throws(() => mirror.ingestAck({ watermarks: { [sessionId]: { ahp: 1 } } }), /exceeds published/);
		mirror.ingestAck({ watermarks: { [sessionId]: { ahp: 0 } } });
		events.length = 0;
		attach();
		clock.runAll();
		assert.deepStrictEqual(frames(events).map(frame => frame.seq), [1, 2]);
	});

	test('failed backfill transport resumes with the same chunk groups and sequence positions', () => {
		const { mirror, events, attach } = fixture({ chunkOptions: { maxChunkBytes: 200, newGroupId: () => 'retained-group' } });
		attach();
		mirror.enqueue(action(800, 'x'.repeat(1000)), sessionId);
		clock.runAll();
		const original = JSON.parse(JSON.stringify(frames(events)));
		store.add(mirror.attach(() => { throw new Error('offline'); }));
		mirror.backfill(backfill(0, 2));
		clock.runAll();
		assert.strictEqual(mirror.statistics.pendingBackfillFrames, 3);
		events.length = 0;
		attach();
		clock.runAll();
		assert.deepStrictEqual(frames(events), [...original, ...original.slice(0, 3)]);
		assert.strictEqual(mirror.statistics.pendingBackfillFrames, 0);
	});

	test('acknowledgements prune queued backfill without replaying freed frames', () => {
		const { mirror, events, attach } = fixture();
		attach();
		for (let index = 0; index < 5; index++) {
			mirror.enqueue(action(index), sessionId);
		}
		clock.runAll();
		const original = frames(events);
		mirror.backfill(backfill(0, 4));
		mirror.ingestAck({ watermarks: { [sessionId]: { ahp: 2 } } });
		assert.strictEqual(mirror.statistics.pendingBackfillFrames, 2);
		events.length = 0;
		clock.runAll();
		assert.deepStrictEqual(frames(events), original.slice(3));
		assert.strictEqual(mirror.statistics.pendingBackfillRequests, 0);
		assert.throws(() => mirror.backfill(backfill(0, 1)), /unavailable/);
	});

	test('an ack can retire every scheduled frame and backfill before the next flush', () => {
		const { mirror, events, attach } = fixture();
		attach();
		mirror.enqueue(action(), sessionId);
		clock.runAll();
		mirror.backfill(backfill(0, 0));
		mirror.ingestAck({ watermarks: { [sessionId]: { ahp: 0 } } });
		clock.runAll();
		assert.deepStrictEqual({ sent: frames(events).length, retained: mirror.statistics.retainedFrames, pending: mirror.statistics.pendingBackfillFrames },
			{ sent: 1, retained: 0, pending: 0 });
	});

	test('backfill rejects wrong environments, namespaces, unsent and unbounded ranges without changing the spool', () => {
		const { mirror, attach } = fixture({ maxBackfillFrames: 3, maxBackfillRequests: 2 });
		attach();
		for (let index = 0; index < 5; index++) {
			mirror.enqueue(action(index), sessionId);
		}
		clock.runAll();
		assert.throws(() => mirror.backfill({
			...backfill(0, 1),
			// @ts-expect-error The runtime ingress must also reject the non-backfillable namespace.
			ns: 'sdk',
		}));
		for (const request of [
			{ ...backfill(0, 1), environment_id: 'other' },
			backfill(0, 5), backfill(2, 1), backfill(-1, 1), backfill(0, Number.MAX_SAFE_INTEGER),
			{ ...backfill(0, 1), request_id: '' },
		]) {
			assert.throws(() => mirror.backfill(request));
		}
		assert.throws(() => mirror.backfill(backfill(0, 3)), /capacity/);
		mirror.backfill(backfill(0, 1));
		mirror.backfill(backfill(2, 2));
		assert.throws(() => mirror.backfill(backfill(3, 3)), /capacity/);
		assert.strictEqual(mirror.statistics.pendingBackfillFrames, 3);
		clock.runAll();
		assert.strictEqual(mirror.statistics.retainedFrames, 5);
	});

	test('backfill request entries are bounded separately from frame work and released after publishing', () => {
		const { mirror, attach } = fixture({ maxBackfillFrames: 10, maxBackfillRequests: 1 });
		attach();
		mirror.enqueue(action(), sessionId);
		clock.runAll();
		mirror.backfill(backfill(0, 0));
		assert.throws(() => mirror.backfill(backfill(0, 0)), /capacity/);
		clock.runAll();
		mirror.backfill(backfill(0, 0));
		clock.runAll();
		assert.deepStrictEqual({ frames: mirror.statistics.pendingBackfillFrames, requests: mirror.statistics.pendingBackfillRequests }, { frames: 0, requests: 0 });
	});

	test('spool overflow is atomic for a complete action and emits a sticky sessionLifecycle failure', () => {
		const { mirror, events, attach, errors } = fixture({ maxSessionFrames: 1, chunkOptions: { maxChunkBytes: 180, newGroupId: () => 'group' } });
		assert.strictEqual(mirror.enqueue(action(400, 'small'), sessionId), true);
		assert.strictEqual(mirror.enqueue(action(412, 'x'.repeat(1000)), sessionId), false);
		mirror.setLifecycle(sessionId, 'failed');
		mirror.setLifecycle(sessionId, 'completed');
		assert.strictEqual(mirror.enqueue(action(500), sessionId), false);
		assert.deepStrictEqual({ next: mirror.getSessionStatus(sessionId).nextSeq, errors: errors.callCount }, { next: 1, errors: 1 });
		attach();
		clock.runAll();
		const failure = {
			type: 'event', event: 'sessionLifecycle', dataType: 'json',
			data: {
				environment_id: environment, session_id: sessionId, kind: 'mirror_failed', at,
				details: { namespace: 'ahp', reason: 'spool_capacity', server_seq: 412 },
			},
		};
		assert.deepStrictEqual(events.filter(event => event.event === 'sessionLifecycle'), [
			failure, { type: 'event', event: 'sessionLifecycle', dataType: 'json', data: { environment_id: environment, session_id: sessionId, kind: 'completed', at } },
		]);
		events.length = 0;
		attach();
		clock.runAll();
		assert.deepStrictEqual(events.filter(event => event.event === 'sessionLifecycle'), [failure]);
	});

	for (const limit of ['maxSessionBytes', 'maxTotalBytes', 'maxTotalFrames'] as const) {
		test(`${limit} exhaustion fails visibly without affecting another session`, () => {
			const { mirror, events, attach } = fixture({ [limit]: 1 });
			mirror.registerSession(otherSession);
			if (limit === 'maxTotalFrames') {
				assert.strictEqual(mirror.enqueue(action(), otherSession), true);
			}
			assert.strictEqual(mirror.enqueue(action(412), sessionId), false);
			attach();
			clock.runAll();
			assert.deepStrictEqual(events.find(event => event.event === 'sessionLifecycle')?.data, {
				environment_id: environment, session_id: sessionId, kind: 'mirror_failed', at,
				details: { namespace: 'ahp', reason: 'spool_capacity', server_seq: 412 },
			});
			assert.strictEqual(mirror.getSessionStatus(otherSession).failure, undefined);
		});
	}

	test('exact byte budgets admit a full frame, ack restores capacity, and overflow assigns no sequence', () => {
		const baseline = fixture();
		baseline.attach();
		baseline.mirror.enqueue(action(), sessionId);
		clock.runAll();
		const bytes = Buffer.byteLength(JSON.stringify(baseline.events[0]));
		const { mirror, attach } = fixture({ maxSessionBytes: bytes, maxTotalBytes: bytes });
		attach();
		assert.strictEqual(mirror.enqueue(action(), sessionId), true);
		assert.strictEqual(mirror.statistics.retainedBytes, bytes);
		clock.runAll();
		mirror.ingestAck({ watermarks: { [sessionId]: { ahp: 0 } } });
		assert.strictEqual(mirror.statistics.retainedBytes, 0);
		assert.strictEqual(mirror.enqueue(action(), sessionId), true);
		assert.strictEqual(mirror.enqueue(action(), sessionId), false);
		assert.deepStrictEqual({
			retained: mirror.statistics.retainedBytes, nextSeq: mirror.getSessionStatus(sessionId).nextSeq,
			reason: mirror.getSessionStatus(sessionId).failure?.reason,
		}, { retained: bytes, nextSeq: 2, reason: 'spool_capacity' });
	});

	test('serialization, framing and source lag use the closed failure details, with first failure sticky', () => {
		const { mirror, events, attach } = fixture({ chunkOptions: { newGroupId: () => '', maxChunkBytes: 180 } });
		mirror.registerSession(otherSession);
		mirror.registerSession('custom-session:/lagged');
		const circular: Record<string, unknown> = {};
		circular.self = circular;
		mirror.enqueue({ ...action(412), action: { ...action().action, _meta: circular } }, sessionId);
		mirror.enqueue(action(500, 'x'.repeat(1000)), otherSession);
		mirror.reportSourceLag('custom-session:/lagged', 5);
		mirror.reportSourceLag(sessionId, 10);
		attach();
		clock.runAll();
		assert.deepStrictEqual(events.map(event => event.data), [
			{ environment_id: environment, session_id: sessionId, kind: 'mirror_failed', at, details: { namespace: 'ahp', reason: 'serialization_failed', server_seq: 412 } },
			{ environment_id: environment, session_id: otherSession, kind: 'mirror_failed', at, details: { namespace: 'ahp', reason: 'framing_failed', server_seq: 500 } },
			{ environment_id: environment, session_id: 'custom-session:/lagged', kind: 'mirror_failed', at, details: { namespace: 'ahp', reason: 'source_lag', skipped: 5 } },
		]);
	});

	test('bounds session entries without eviction, sequence reuse or implicit channel ownership', () => {
		const { mirror, events, attach } = fixture({ maxSessions: 1 });
		mirror.registerSession(sessionId);
		assert.throws(() => mirror.registerSession(otherSession), /session capacity/);
		assert.throws(() => mirror.enqueue(action(), otherSession), /not registered/);
		attach();
		mirror.enqueue(action(400), sessionId);
		clock.runAll();
		mirror.ingestAck({ watermarks: { [sessionId]: { ahp: 0 } } });
		mirror.registerSession(sessionId);
		mirror.enqueue({ ...action(900), channel: 'custom-changeset:/unrelated-name' }, sessionId);
		clock.runAll();
		assert.deepStrictEqual(frames(events).map(frame => ({ session: frame.session_id, seq: frame.seq })), [
			{ session: sessionId, seq: 0 }, { session: sessionId, seq: 1 },
		]);
	});

	test('project metadata is repeated without retaining caller mutation and outer event bytes respect the ceiling', () => {
		const { mirror, events, attach } = fixture({ maxEventBytes: 700, chunkOptions: { newGroupId: () => 'g' } });
		const project = { uri: 'https://github.com/octo/repo', display_name: 'octo/repo' };
		mirror.registerSession(otherSession, project);
		project.display_name = 'mutated';
		attach();
		mirror.enqueue(action(412, '\u00e9'.repeat(1000)), otherSession);
		clock.runAll();
		assert.ok(events.length > 1);
		for (const event of events) {
			assert.ok(Buffer.byteLength(JSON.stringify({ ...event, ackId: Number.MAX_SAFE_INTEGER })) <= 700);
		}
		assert.deepStrictEqual(frames(events).map(frame => frame.project),
			events.map(() => ({ uri: 'https://github.com/octo/repo', display_name: 'octo/repo' })));
		assert.throws(() => mirror.registerSession(otherSession, project), /cannot change/);
	});

	test('a slow or saturated session cannot monopolise a bounded flush turn', () => {
		const { mirror, events, attach } = fixture({ maxFramesPerFlush: 2 });
		mirror.registerSession(otherSession);
		attach();
		for (let index = 0; index < 5; index++) {
			mirror.enqueue(action(index), sessionId);
		}
		mirror.enqueue(action(100), otherSession);
		clock.tick(1);
		assert.deepStrictEqual(frames(events).map(frame => frame.session_id), [sessionId, otherSession]);
		clock.runAll();
		assert.strictEqual(frames(events).length, 6);
	});

	test('registration reserves room for visible failure and rejects invalid resource limits', () => {
		const { mirror } = fixture({ maxEventBytes: 400 });
		assert.throws(() => mirror.registerSession(`custom-session:/${'x'.repeat(400)}`), /integrity signal/);
		assert.throws(() => mirror.registerSession('not-a-session-uri'), /metadata/);
		const instantiation = store.add(new TestInstantiationService());
		instantiation.stub(ILogService, store.add(new NullLogService()));
		for (const options of [{ maxSessions: 0 }, { maxTotalBytes: Infinity }, { maxEventBytes: 1024 * 1024 + 1 }]) {
			assert.throws(() => instantiation.createInstance(MissionControlSessionMirror, environment, options), /limits/);
		}
	});

	test('sender mutation cannot alter backfill and disposing cancels all scheduled work', () => {
		const { mirror, events } = fixture();
		store.add(mirror.attach(event => {
			if (event.event === 'sessionEvents' && event.data.ns === 'ahp' && event.data.payload.kind === 'message') {
				const envelope = event.data.payload.data as ActionEnvelope;
				if (envelope.action.type === ActionType.ChatDelta) {
					envelope.action.content = 'sender mutation';
				}
			}
		}));
		mirror.enqueue(action(), sessionId);
		clock.runAll();
		store.add(mirror.attach(event => { events.push(event); }));
		mirror.backfill(backfill(0, 0));
		clock.runAll();
		assert.deepStrictEqual(frames(events).map(frame => frame.payload), [
			{ kind: 'message', data: JSON.parse(JSON.stringify(action())) },
			{ kind: 'message', data: JSON.parse(JSON.stringify(action())) },
		]);
		mirror.enqueue(action(500), sessionId);
		mirror.dispose();
		clock.runAll();
		assert.strictEqual(events.length, 2);
		assert.strictEqual(mirror.statistics.retainedBytes, 0);
		assert.throws(() => mirror.enqueue(action(), sessionId), /disposed/);
	});

	test('SDK metadata has independent sequences and credits and does not block AHP', () => {
		const { mirror, events, attach } = fixture();
		mirror.reserveSdkSequences(sessionId, 2048, 4096);
		attach();
		for (let index = 0; index < 1025; index++) {
			mirror.enqueueSdk(sessionId, { type: 'session.title_changed', data: { title: `Title ${index}` } }, at);
		}
		mirror.enqueue(action(), sessionId);
		clock.runAll();
		assert.deepStrictEqual({
			ahp: frames(events).map(frame => frame.seq),
			sdk: sdkFrames(events).map(frame => frame.seq),
		}, { ahp: [0], sdk: Array.from({ length: 1024 }, (_, index) => 2048 + index) });
		assert.throws(() => mirror.ingestAck({ watermarks: { [sessionId]: { ahp: 0, sdk: 4000 } } }), /exceeds published/);
		assert.strictEqual(mirror.statistics.retainedFrames, 1);
		mirror.ingestAck({ watermarks: { [sessionId]: { sdk: 2048 } } });
		clock.runAll();
		assert.strictEqual(sdkFrames(events).at(-1)?.seq, 3072);
		assert.strictEqual(mirror.statistics.retainedFrames, 1);
	});

	test('SDK overload coalesces a bounded truncation marker without mutating already-published frames', () => {
		const { mirror, events, attach } = fixture({ maxSessionFrames: 1 });
		mirror.reserveSdkSequences(sessionId, 0, 1024);
		mirror.enqueueSdk(sessionId, { type: 'session.title_changed', data: { title: 'Retained' } }, at);
		mirror.enqueueSdk(sessionId, { type: 'session.idle', data: {} }, at);
		mirror.enqueueSdk(sessionId, { type: 'session.idle', data: {} }, at);
		attach();
		clock.runAll();
		mirror.enqueueSdk(sessionId, { type: 'session.idle', data: {} }, at);
		const before = sdkFrames(events).map(frame => frame.payload);
		mirror.ingestAck({ watermarks: { [sessionId]: { sdk: 1 } } });
		clock.runAll();
		assert.deepStrictEqual(sdkFrames(events).map(frame => ({ seq: frame.seq, payload: frame.payload })), [
			{ seq: 0, payload: { type: 'session.title_changed', data: { title: 'Retained' } } },
			{ seq: 1, payload: { type: 'session.events_truncated', data: { dropped_count: 2 } } },
			{ seq: 2, payload: { type: 'session.events_truncated', data: { dropped_count: 1 } } },
		]);
		assert.deepStrictEqual(sdkFrames(events).slice(0, 2).map(frame => frame.payload), before);
	});

	test('oversized SDK bodies become a portable placeholder rather than chunks or authoritative mirror failure', () => {
		const { mirror, events, attach } = fixture({ maxEventBytes: 500 });
		mirror.reserveSdkSequences(sessionId, 0, 1024);
		const payload = { type: 'session.title_changed', data: { title: 'x'.repeat(1000) } };
		mirror.enqueueSdk(sessionId, payload, at);
		attach();
		clock.runAll();
		const frame = sdkFrames(events)[0];
		const expectedBytes = Buffer.byteLength(JSON.stringify({
			type: 'event', event: 'sessionEvents', dataType: 'json',
			data: { environment_id: environment, session_id: sessionId, ns: 'sdk', seq: 0, at, payload },
		}));
		assert.deepStrictEqual(frame.payload, {
			type: 'session.title_changed', data: null, _truncated: { reason: 'oversize', bytes: expectedBytes },
		});
		assert.strictEqual(mirror.getSessionStatus(sessionId).failure, undefined);
		assert.ok(Buffer.byteLength(JSON.stringify(events[0])) < 500);
	});

	test('SDK truncation-marker retransmission preserves losses accumulated after its first publication', () => {
		const { mirror, events, attach } = fixture({ maxSessionFrames: 1 });
		mirror.reserveSdkSequences(sessionId, 0, 1024);
		mirror.enqueueSdk(sessionId, { type: 'session.idle', data: {} }, at);
		mirror.enqueueSdk(sessionId, { type: 'session.idle', data: {} }, at);
		attach().dispose();
		attach();
		clock.runAll();
		mirror.enqueueSdk(sessionId, { type: 'session.idle', data: {} }, at);
		attach();
		clock.runAll();
		mirror.ingestAck({ watermarks: { [sessionId]: { sdk: 1 } } });
		clock.runAll();
		assert.deepStrictEqual(sdkFrames(events).map(frame => frame.payload), [
			{ type: 'session.idle', data: {} },
			{ type: 'session.events_truncated', data: { dropped_count: 1 } },
			{ type: 'session.idle', data: {} },
			{ type: 'session.events_truncated', data: { dropped_count: 1 } },
			{ type: 'session.events_truncated', data: { dropped_count: 1 } },
		]);
	});

	test('journal replay waits for SDK capacity and retains the newest state instead of dropping it', async () => {
		const { mirror, events, attach } = fixture({ maxSessionFrames: 1 });
		mirror.reserveSdkSequences(sessionId, 0, 1024);
		mirror.enqueueSdk(sessionId, { type: 'assistant.turn_start', data: { turnId: 'old' } }, at);
		attach();
		const latest = { type: 'assistant.turn_end', data: { turnId: 'old' } };
		let ready = false;
		const capacity = mirror.waitForSdkCapacity(sessionId, latest, at, CancellationToken.None).then(() => { ready = true; });
		clock.runAll();
		assert.strictEqual(ready, false);
		mirror.ingestAck({ watermarks: { [sessionId]: { sdk: 0 } } });
		await capacity;
		mirror.enqueueSdk(sessionId, latest, at);
		clock.runAll();
		assert.deepStrictEqual(sdkFrames(events).map(frame => frame.payload.type), ['assistant.turn_start', 'assistant.turn_end']);
	});

	test('SDK replay capacity waits cancel without leaking ownership', async () => {
		const { mirror } = fixture({ maxSessionFrames: 1 });
		mirror.reserveSdkSequences(sessionId, 0, 1024);
		mirror.enqueueSdk(sessionId, { type: 'session.idle', data: {} }, at);
		const cancellation = store.add(new CancellationTokenSource());
		const capacity = mirror.waitForSdkCapacity(sessionId, { type: 'session.idle', data: {} }, at, cancellation.token);
		cancellation.cancel();
		await assert.rejects(capacity, /Canceled/);
	});
});
