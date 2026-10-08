/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import type { IAgent, IAgentChatSessionEvent } from '../../common/agent.js';
import type { CancellationToken } from '../../../../base/common/cancellation.js';
import { ISessionDataService, type ISessionDatabase } from '../../common/sessionDataService.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { MessageKind, SessionStatus, buildDefaultChatUri } from '../../common/state/sessionState.js';
import { IAgentHostProviderService } from '../../node/agentHostProviderService.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../node/agentHostStateManager.js';
import { MissionControlSdkEventSource } from '../../node/missionControl/missionControlSdkEventSource.js';
import { MissionControlSessionMirror, type MissionControlMirrorEvent } from '../../node/missionControl/missionControlSessionMirror.js';

const session = 'ahp-session:/native';
const chat = URI.parse(buildDefaultChatUri(session));
const at = '2026-10-02T21:00:00Z';

function event(id: string, type = 'session.idle', data: object = {}): IAgentChatSessionEvent {
	return { chat, id, timestamp: at, persisted: true, type, data };
}

suite('MissionControlSdkEventSource', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let clock: sinon.SinonFakeTimers;
	setup(() => { clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); });
	teardown(() => sinon.restore());

	function fixture(history: readonly IAgentChatSessionEvent[] = [], metadata = new Map<string, string>(), initiallyEnabled = true, provisional = false) {
		const instantiation = store.add(new TestInstantiationService());
		const log = store.add(new NullLogService());
		const errors = sinon.spy(log, 'error');
		instantiation.stub(ILogService, log);
		const state = store.add(new AgentHostStateManager(log));
		const summary = { resource: session, provider: 'copilotcli', title: 'Native title', status: SessionStatus.Idle, createdAt: at, modifiedAt: at };
		if (provisional) {
			state.createSession(summary, { emitNotification: false });
		} else {
			state.restoreSession(summary, []);
		}
		instantiation.stub(IAgentHostStateManager, state);
		const emitter = store.add(new Emitter<IAgentChatSessionEvent>());
		let historyRead = 0;
		const provider = new class extends mock<IAgent>() {
			override readonly id = 'copilotcli';
			override readonly onDidChatSessionEvent = emitter.event;
			override async *readChatSessionEvents() {
				historyRead++;
				yield* history;
			}
			override async synchronizeChatSessionTitle(_chat: URI, title: string) {
				emitter.fire({ ...event('native-title', 'session.title_changed', { title }), persisted: false });
				return true;
			}
		}();
		const providers = new class extends mock<IAgentHostProviderService>() {
			override readonly onDidRegisterProvider = Event.None;
			override getProviders() { return [provider]; }
			override getProviderForSession() { return provider; }
		}();
		instantiation.stub(IAgentHostProviderService, providers);
		const writes: string[] = [];
		const db = new class extends mock<ISessionDatabase>() {
			override async getMetadata(key: string) { return metadata.get(key); }
			override async setMetadata(key: string, value: string) {
				if (key.includes('sdkSequence')) { writes.push(value); }
				metadata.set(key, value);
			}
		}();
		instantiation.stub(ISessionDataService, new class extends mock<ISessionDataService>() {
			override openDatabase() { return { object: db, dispose: () => { } }; }
		}());
		const events: MissionControlMirrorEvent[] = [];
		const mirror = store.add(instantiation.createInstance(MissionControlSessionMirror, 'env', {}));
		store.add(mirror.attach(value => { events.push(value); }));
		let enabled = initiallyEnabled;
		const source = store.add(instantiation.createInstance(MissionControlSdkEventSource, 'env', mirror, () => enabled));
		return { state, source, mirror, emitter, provider, events, errors, writes, metadata, setEnabled: (value: boolean) => { enabled = value; }, historyRead: () => historyRead };
	}

	test('does not register, read or synchronize an unused draft at startup or on native events', async () => {
		const f = fixture([event('idle')], new Map(), true, true);
		const title = sinon.spy(f.provider, 'synchronizeChatSessionTitle');
		f.source.observeSession(session);
		f.emitter.fire(event('ignored', 'session.start', { sessionId: 'native' }));
		await f.source.whenIdle();
		clock.runAll();
		assert.deepStrictEqual({
			events: f.events, sessions: f.mirror.statistics.sessions, reads: f.historyRead(), writes: f.writes, titles: title.callCount,
		}, { events: [], sessions: 0, reads: 0, writes: [], titles: 0 });
	});

	test('reconciles history and synchronizes the title when the first message makes a draft eligible', async () => {
		const f = fixture([event('persisted-start', 'session.start', { sessionId: 'native' })], new Map(), true, true);
		f.emitter.fire(event('ignored'));
		f.state.dispatchServerAction(chat.toString(), {
			type: ActionType.ChatTurnStarted, turnId: 'first-turn', startedAt: at,
			message: { text: 'First user message', origin: { kind: MessageKind.User } },
		});
		f.source.observeSession(session);
		f.emitter.fire(event('first-turn', 'assistant.turn_start', { turnId: 'first-turn' }));
		await f.source.whenIdle();
		clock.runAll();
		assert.deepStrictEqual({
			events: f.events.flatMap(value => value.event === 'sessionEvents' && value.data.ns === 'sdk' ? [value.data.payload] : []),
			writes: f.writes, reads: f.historyRead(),
		}, {
			events: [
				{ type: 'session.start', data: { sessionId: 'native' } },
				{ type: 'assistant.turn_start', data: { turnId: 'first-turn' } },
				{ type: 'session.title_changed', data: { title: 'Native title' } },
			],
			writes: ['1024'], reads: 1,
		});
	});

	test('reconciles genuine metadata history, deduplicates live overlap and synchronizes the native title', async () => {
		const idle = event('idle');
		const f = fixture([event('old-title', 'session.title_changed', { title: 'Old title' }), idle]);
		f.emitter.fire(idle);
		await f.source.whenIdle();
		clock.runAll();
		assert.deepStrictEqual({
			events: f.events.flatMap(value => value.event === 'sessionEvents' && value.data.ns === 'sdk' ? [value.data.payload] : []),
			writes: f.writes,
			historyReads: f.historyRead(),
		}, {
			events: [
				{ type: 'session.title_changed', data: { title: 'Old title' } },
				{ type: 'session.idle', data: {} },
				{ type: 'session.title_changed', data: { title: 'Native title' } },
			],
			writes: ['1024'], historyReads: 1,
		});
	});

	test('durably reserves non-colliding SDK sequence ranges across process restart', async () => {
		const first = fixture([event('idle')]);
		await first.source.whenIdle();
		clock.runAll();
		first.mirror.ingestAck({ watermarks: { [session]: { sdk: 1 } } });
		await first.source.whenIdle();
		first.source.dispose();
		first.mirror.dispose();
		const second = fixture([event('idle')], first.metadata);
		await second.source.whenIdle();
		clock.runAll();
		assert.deepStrictEqual({
			writes: second.writes,
			sequences: second.events.flatMap(value => value.event === 'sessionEvents' ? [value.data.seq] : []),
		}, { writes: ['2048'], sequences: [1024] });
	});

	test('disabled mirroring performs no provider reads, title writes or sequence reservations', async () => {
		const f = fixture([], new Map(), false);
		await f.source.whenIdle();
		f.emitter.fire(event('ignored'));
		clock.runAll();
		assert.deepStrictEqual({ events: f.events, reads: f.historyRead(), writes: f.writes }, { events: [], reads: 0, writes: [] });
	});

	test('peer-chat events cannot overwrite the owning task metadata', async () => {
		const f = fixture();
		await f.source.whenIdle();
		clock.runAll();
		f.events.length = 0;
		f.emitter.fire({ ...event('peer-title', 'session.title_changed', { title: 'Wrong title' }), chat: URI.parse('ahp-chat://peer/YWhwLXNlc3Npb246L25hdGl2ZQ') });
		await f.source.whenIdle();
		clock.runAll();
		assert.deepStrictEqual(f.events, []);
	});

	test('a failed durable write prevents publication and reports the failure', async () => {
		const f = fixture([event('idle')]);
		sinon.stub(f.metadata, 'set').throws(new Error('disk failure'));
		await f.source.whenIdle();
		clock.runAll();
		assert.deepStrictEqual({ events: f.events, failed: f.errors.called }, { events: [], failed: true });
	});

	test('disposal fences a pending metadata read and prevents late publication', async () => {
		const f = fixture();
		const gate = new DeferredPromise<void>();
		sinon.stub(f.provider, 'readChatSessionEvents').callsFake(async function* () {
			await gate.p;
			yield event('late');
		});
		await Promise.resolve();
		f.source.dispose();
		gate.complete();
		await f.source.whenIdle();
		clock.runAll();
		assert.deepStrictEqual(f.events, []);
	});

	test('a title RPC failure does not stop subsequent metadata or poison the local session', async () => {
		const f = fixture([event('idle')]);
		sinon.stub(f.provider, 'synchronizeChatSessionTitle').onFirstCall().rejects(new Error('name RPC unavailable')).onSecondCall().resolves(false);
		await f.source.whenIdle();
		f.emitter.fire(event('next-turn', 'assistant.turn_start', { turnId: 'next' }));
		await f.source.whenIdle();
		clock.runAll();
		assert.deepStrictEqual({
			types: f.events.flatMap(value => value.event === 'sessionEvents' && value.data.ns === 'sdk' ? [value.data.payload.type] : []),
			logged: f.errors.called,
		}, { types: ['session.idle', 'assistant.turn_start'], logged: true });
	});

	test('an unreadable journal is reported without preventing fresh native metadata', async () => {
		const f = fixture();
		sinon.stub(f.provider, 'readChatSessionEvents').callsFake(async function* () { throw new Error('Corrupt journal'); });
		f.emitter.fire(event('fresh-idle'));
		await f.source.whenIdle();
		clock.runAll();
		assert.deepStrictEqual({
			types: f.events.flatMap(value => value.event === 'sessionEvents' && value.data.ns === 'sdk' ? [value.data.payload.type] : []),
			logged: f.errors.called,
		}, { types: ['session.idle', 'session.title_changed'], logged: true });
	});

	test('restart replays unacknowledged native metadata instead of advancing the durable cursor at admission', async () => {
		const first = fixture([event('idle')]);
		await first.source.whenIdle();
		clock.runAll();
		assert.strictEqual(first.metadata.has('missionControl.sdkJournalCursor.env'), false);
		first.source.dispose();
		first.mirror.dispose();
		const second = fixture([event('idle')], first.metadata);
		await second.source.whenIdle();
		clock.runAll();
		assert.deepStrictEqual(second.events.flatMap(value => value.event === 'sessionEvents' && value.data.ns === 'sdk' ? [value.data.payload.type] : []),
			['session.idle', 'session.title_changed']);
	});

	test('initial reconciliation discards queued events already superseded by the journal snapshot', async () => {
		const f = fixture();
		const start = event('overlapping-start', 'assistant.turn_start', { turnId: 'turn' });
		const end = event('reconciled-end', 'assistant.turn_end', { turnId: 'turn' });
		sinon.stub(f.provider, 'readChatSessionEvents').callsFake(async function* (
			_chat?: URI, _context?: object, _token?: CancellationToken, _cursor?: string, onRead?: (id: string) => void,
		) {
			onRead?.(start.id);
			onRead?.(end.id);
			yield end;
		});
		f.emitter.fire(start);
		f.emitter.fire(end);
		await f.source.whenIdle();
		clock.runAll();
		assert.deepStrictEqual(f.events.flatMap(value => value.event === 'sessionEvents' && value.data.ns === 'sdk' ? [value.data.payload.type] : []),
			['assistant.turn_end', 'session.title_changed']);
	});
});
