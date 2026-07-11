/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ActionType, type ActionEnvelope, type ClientChangesetAction } from '../../common/state/sessionActions.js';
import { ChangesetStatus, MessageKind, SessionLifecycle, SessionStatus, TerminalClaimKind, TurnState, type ChangesetState, type RootState, type SessionState, type SessionSummary, type TerminalState } from '../../common/state/protocol/state.js';
import { buildDefaultChatUri, createChatState, createDefaultChatSummary, ROOT_STATE_URI, StateComponents, type ChatState } from '../../common/state/sessionState.js';
import { AgentSubscriptionManager, ChangesetStateSubscription, ChatStateSubscription, isActionEnvelopeRelevantToSubscriptionUris, RootStateSubscription, SessionStateSubscription, TerminalStateSubscription } from '../../common/state/agentSubscription.js';

// Helpers

function makeRootState(overrides?: Partial<RootState>): RootState {
	return {
		agents: [],
		activeSessions: 0,
		terminals: [],
		...overrides,
	};
}

function makeSessionSummary(sessionUri: string): SessionSummary {
	return {
		resource: sessionUri,
		provider: 'copilot',
		title: 'Test',
		status: SessionStatus.Idle,
		createdAt: new Date(1).toISOString(),
		modifiedAt: new Date(1).toISOString(),
		project: { uri: 'file:///test-project', displayName: 'Test Project' },
	};
}

function makeSessionState(sessionUri: string, overrides?: Partial<SessionState>): SessionState {
	return {
		provider: 'copilot',
		title: 'Test',
		status: SessionStatus.Idle,
		project: { uri: 'file:///test-project', displayName: 'Test Project' },
		lifecycle: SessionLifecycle.Ready,
		activeClients: [],
		chats: [],
		...overrides,
	};
}

function makeChatState(chatUri: string, sessionSummary: SessionSummary = makeSessionSummary(sessionUri), overrides?: Partial<ChatState>): ChatState {
	return {
		...createChatState(createDefaultChatSummary(sessionSummary, chatUri)),
		...overrides,
	};
}

function makeTerminalState(overrides?: Partial<TerminalState>): TerminalState {
	return {
		title: 'bash',
		content: [],
		claim: { kind: TerminalClaimKind.Client, clientId: 'c1' },
		...overrides,
	};
}

function makeEnvelope(action: ActionEnvelope['action'], serverSeq: number, origin?: ActionEnvelope['origin'], rejectionReason?: string, channel?: string): ActionEnvelope {
	const resolvedChannel = channel ?? (
		action.type.startsWith('root/') ? ROOT_STATE_URI
			: action.type.startsWith('chat/') ? chatUri
				: action.type.startsWith('terminal/') ? terminalUri
					: action.type.startsWith('changeset/') ? changesetUri
						: sessionUri
	);
	return { channel: resolvedChannel, action, serverSeq, origin, rejectionReason };
}

const noop = () => { };
const sessionUri = URI.from({ scheme: 'copilot', path: '/test-session' }).toString();
const terminalUri = URI.from({ scheme: 'agenthost-terminal', path: '/term1' }).toString();
const chatUri = buildDefaultChatUri(sessionUri);
const changesetUri = `${sessionUri}/changeset/session`;

suite('ChangesetStateSubscription', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('optimistically applies and reconciles file review state', () => {
		const state: ChangesetState = {
			status: ChangesetStatus.Ready,
			files: [{
				id: 'file:///test.txt',
				edit: {
					before: { uri: 'file:///test.txt', content: { uri: 'file:///before.txt' } },
					after: { uri: 'file:///test.txt', content: { uri: 'file:///after.txt' } },
				},
			}],
		};
		const subscription = disposables.add(new ChangesetStateSubscription(changesetUri, 'c1', () => 1, noop));
		subscription.handleSnapshot(state, 0);

		const action: ClientChangesetAction = {
			type: ActionType.ChangesetFilesReviewChanged,
			files: ['file:///test.txt'],
			reviewed: true,
		};
		const clientSeq = subscription.applyOptimistic(action);
		const optimisticState = subscription.value as ChangesetState;
		subscription.receiveEnvelope(makeEnvelope(action, 1, { clientId: 'c1', clientSeq }));

		assert.deepStrictEqual({
			optimisticReviewed: optimisticState.files[0].reviewed,
			verifiedBeforeEcho: state.files[0].reviewed,
			verifiedAfterEcho: subscription.verifiedValue?.files[0].reviewed,
			pendingCleared: subscription.value === subscription.verifiedValue,
		}, {
			optimisticReviewed: true,
			verifiedBeforeEcho: undefined,
			verifiedAfterEcho: true,
			pendingCleared: true,
		});
	});

});

// RootStateSubscription

suite('RootStateSubscription', () => {

	let disposables: DisposableStore;

	setup(() => {
		disposables = new DisposableStore();
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('value is undefined before snapshot', () => {
		const sub = disposables.add(new RootStateSubscription('c1', noop));
		assert.strictEqual(sub.value, undefined);
		assert.strictEqual(sub.verifiedValue, undefined);
	});

	test('handleSnapshot sets value and verifiedValue', () => {
		const sub = disposables.add(new RootStateSubscription('c1', noop));
		const state = makeRootState({ activeSessions: 3 });
		sub.handleSnapshot(state, 0);
		assert.deepStrictEqual(sub.value, state);
		assert.deepStrictEqual(sub.verifiedValue, state);
	});

	test('handleSnapshot fires onDidChange', () => {
		const sub = disposables.add(new RootStateSubscription('c1', noop));
		const fired: RootState[] = [];
		disposables.add(sub.onDidChange(s => fired.push(s)));
		sub.handleSnapshot(makeRootState(), 0);
		assert.strictEqual(fired.length, 1);
	});

	test('receiveEnvelope updates state for root actions', () => {
		const sub = disposables.add(new RootStateSubscription('c1', noop));
		sub.handleSnapshot(makeRootState(), 0);
		sub.receiveEnvelope(makeEnvelope(
			{ type: ActionType.RootActiveSessionsChanged, activeSessions: 5 },
			1,
		));
		assert.strictEqual((sub.value as RootState).activeSessions, 5);
	});

	test('ignores non-root actions', () => {
		const sub = disposables.add(new RootStateSubscription('c1', noop));
		const state = makeRootState();
		sub.handleSnapshot(state, 0);
		sub.receiveEnvelope(makeEnvelope(
			{ type: ActionType.SessionReady, },
			1,
		));
		assert.deepStrictEqual(sub.value, state);
	});

	test('fires onWillApplyAction and onDidApplyAction around envelope', () => {
		const sub = disposables.add(new RootStateSubscription('c1', noop));
		sub.handleSnapshot(makeRootState(), 0);
		const events: string[] = [];
		disposables.add(sub.onWillApplyAction(() => events.push('will')));
		disposables.add(sub.onDidApplyAction(() => events.push('did')));
		sub.receiveEnvelope(makeEnvelope(
			{ type: ActionType.RootActiveSessionsChanged, activeSessions: 1 },
			1,
		));
		assert.deepStrictEqual(events, ['will', 'did']);
	});

	test('buffers envelopes before snapshot and replays after', () => {
		const sub = disposables.add(new RootStateSubscription('c1', noop));
		// Send envelope before snapshot
		sub.receiveEnvelope(makeEnvelope(
			{ type: ActionType.RootActiveSessionsChanged, activeSessions: 7 },
			2,
		));
		assert.strictEqual(sub.value, undefined);

		// Now apply snapshot with fromSeq=1; envelope at seq 2 should replay
		sub.handleSnapshot(makeRootState(), 1);
		assert.strictEqual((sub.value! as RootState).activeSessions, 7);
	});

	test('buffered envelopes with serverSeq <= fromSeq are discarded', () => {
		const sub = disposables.add(new RootStateSubscription('c1', noop));
		sub.receiveEnvelope(makeEnvelope(
			{ type: ActionType.RootActiveSessionsChanged, activeSessions: 99 },
			1,
		));
		sub.handleSnapshot(makeRootState({ activeSessions: 0 }), 1);
		// Envelope at seq 1 should not replay since fromSeq === 1
		assert.strictEqual((sub.value as RootState).activeSessions, 0);
	});

	test('setError makes value return the error', () => {
		const sub = disposables.add(new RootStateSubscription('c1', noop));
		sub.handleSnapshot(makeRootState(), 0);
		const err = new Error('failed');
		const errors: Error[] = [];
		disposables.add(sub.onDidError(error => errors.push(error)));
		sub.setError(err);
		assert.deepStrictEqual({
			value: sub.value,
			verifiedValueExists: !!sub.verifiedValue,
			errors,
		}, {
			value: err,
			verifiedValueExists: true,
			errors: [err],
		});
	});
});

// SessionStateSubscription

suite('SessionStateSubscription', () => {

	let disposables: DisposableStore;
	let seq: number;

	setup(() => {
		disposables = new DisposableStore();
		seq = 0;
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function createSub(uri: string = sessionUri, clientId: string = 'c1'): SessionStateSubscription {
		return disposables.add(new SessionStateSubscription(uri, clientId, () => ++seq, noop));
	}

	test('value is undefined before snapshot', () => {
		const sub = createSub();
		assert.strictEqual(sub.value, undefined);
	});

	test('handleSnapshot sets value and verifiedValue', () => {
		const sub = createSub();
		const state = makeSessionState(sessionUri);
		sub.handleSnapshot(state, 0);
		assert.deepStrictEqual(sub.value, state);
		assert.deepStrictEqual(sub.verifiedValue, state);
	});

	test('applyOptimistic returns clientSeq and updates value but not verifiedValue', () => {
		const sub = createSub();
		const state = makeSessionState(sessionUri);
		sub.handleSnapshot(state, 0);

		const clientSeq = sub.applyOptimistic({
			type: ActionType.SessionTitleChanged,
			title: 'Optimistic',
		});

		assert.strictEqual(clientSeq, 1);
		assert.strictEqual((sub.value as SessionState).title, 'Optimistic');
		// verifiedValue should remain unchanged
		assert.strictEqual(sub.verifiedValue!.title, 'Test');
	});

	test('confirmed own action removes pending and updates confirmed', () => {
		const sub = createSub();
		sub.handleSnapshot(makeSessionState(sessionUri), 0);

		const clientSeq = sub.applyOptimistic({
			type: ActionType.SessionTitleChanged,
			title: 'Optimistic',
		});

		// Server confirms the action
		sub.receiveEnvelope(makeEnvelope(
			{ type: ActionType.SessionTitleChanged, title: 'Optimistic' },
			1,
			{ clientId: 'c1', clientSeq },
		));

		// After confirmation, verifiedValue should match
		assert.strictEqual(sub.verifiedValue!.title, 'Optimistic');
		// No pending, value falls through to confirmed
		assert.strictEqual((sub.value as SessionState).title, 'Optimistic');
	});

	test('rejected own action removes pending without updating confirmed', () => {
		const sub = createSub();
		sub.handleSnapshot(makeSessionState(sessionUri), 0);

		const clientSeq = sub.applyOptimistic({
			type: ActionType.SessionTitleChanged,
			title: 'Optimistic',
		});

		// Server rejects the action
		sub.receiveEnvelope(makeEnvelope(
			{ type: ActionType.SessionTitleChanged, title: 'Optimistic' },
			1,
			{ clientId: 'c1', clientSeq },
			'denied',
		));

		// Confirmed state unchanged
		assert.strictEqual(sub.verifiedValue!.title, 'Test');
		// No more pending, value = confirmed
		assert.strictEqual((sub.value as SessionState).title, 'Test');
	});

	test('foreign action updates confirmed and recomputes optimistic', () => {
		const sub = createSub();
		sub.handleSnapshot(makeSessionState(sessionUri), 0);

		// Local optimistic action
		sub.applyOptimistic({
			type: ActionType.SessionTitleChanged,
			title: 'Local',
		});

		// Foreign action arrives
		sub.receiveEnvelope(makeEnvelope(
			{ type: ActionType.SessionReady, },
			1,
			{ clientId: 'other-client', clientSeq: 1 },
		));

		// Confirmed state should have SessionReady applied
		assert.strictEqual(sub.verifiedValue!.lifecycle, SessionLifecycle.Ready);
		// Optimistic should still have 'Local' title on top
		assert.strictEqual((sub.value as SessionState).title, 'Local');
	});

	test('server terminal turn action remains ignored by session subscription', () => {
		const sub = createSub();
		const state = makeSessionState(sessionUri);
		sub.handleSnapshot(state, 0);

		sub.receiveEnvelope(makeEnvelope(
			{ type: ActionType.ChatTurnComplete, turnId: 'turn-1' },
			1,
			undefined,
		));

		assert.deepStrictEqual(sub.value, state);
	});

	test('after all pending cleared, value falls through to verifiedValue', () => {
		const sub = createSub();
		sub.handleSnapshot(makeSessionState(sessionUri), 0);

		const clientSeq = sub.applyOptimistic({
			type: ActionType.SessionTitleChanged,
			title: 'Temp',
		});

		// Confirm the pending action
		sub.receiveEnvelope(makeEnvelope(
			{ type: ActionType.SessionTitleChanged, title: 'Temp' },
			1,
			{ clientId: 'c1', clientSeq },
		));

		// value and verifiedValue should be the same object reference
		assert.strictEqual(sub.value, sub.verifiedValue);
	});

	test('clearPending resets optimistic state', () => {
		const sub = createSub();
		sub.handleSnapshot(makeSessionState(sessionUri), 0);

		sub.applyOptimistic({
			type: ActionType.SessionTitleChanged,
			title: 'Pending',
		});

		assert.strictEqual((sub.value as SessionState).title, 'Pending');

		sub.clearPending();

		// Should fall back to confirmed
		assert.strictEqual((sub.value as SessionState).title, 'Test');
	});

	test('ignores actions for different session', () => {
		const sub = createSub();
		sub.handleSnapshot(makeSessionState(sessionUri), 0);

		sub.receiveEnvelope(makeEnvelope(
			{ type: ActionType.SessionTitleChanged, title: 'Other' },
			1,
			undefined,
			undefined,
			'copilot:/other-session',
		));

		assert.strictEqual((sub.value as SessionState).title, 'Test');
	});

	test('buffers envelopes before snapshot and replays after', () => {
		const sub = createSub();

		sub.receiveEnvelope(makeEnvelope(
			{ type: ActionType.SessionTitleChanged, title: 'Buffered' },
			2,
		));

		assert.strictEqual(sub.value, undefined);

		sub.handleSnapshot(makeSessionState(sessionUri), 1);

		assert.strictEqual((sub.value! as SessionState).title, 'Buffered');
	});

	test('fires onDidChange on optimistic apply', () => {
		const sub = createSub();
		sub.handleSnapshot(makeSessionState(sessionUri), 0);

		const fired: SessionState[] = [];
		disposables.add(sub.onDidChange(s => fired.push(s)));

		sub.applyOptimistic({
			type: ActionType.SessionTitleChanged,
			title: 'Changed',
		});

		assert.strictEqual(fired.length, 1);
		assert.strictEqual(fired[0].title, 'Changed');
	});
});

// ChatStateSubscription

suite('ChatStateSubscription', () => {

	let disposables: DisposableStore;
	let seq: number;

	setup(() => {
		disposables = new DisposableStore();
		seq = 0;
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function createSub(uri: string = chatUri, clientId: string = 'c1'): ChatStateSubscription {
		return disposables.add(new ChatStateSubscription(uri, clientId, () => ++seq, noop));
	}

	test('server terminal turn action drops stale optimistic turn start', () => {
		const sub = createSub();
		sub.handleSnapshot(makeChatState(chatUri), 0);

		sub.applyOptimistic({
			type: ActionType.ChatTurnStarted,
			turnId: 'turn-1',
			message: { text: 'hello', origin: { kind: MessageKind.User } },
		});

		assert.strictEqual((sub.value as ChatState | undefined)?.activeTurn?.id, 'turn-1');

		sub.receiveEnvelope(makeEnvelope(
			{ type: ActionType.ChatTurnComplete, turnId: 'turn-1' },
			1,
			undefined,
		));

		assert.deepStrictEqual({
			activeTurn: (sub.value as ChatState | undefined)?.activeTurn,
			turns: (sub.value as ChatState | undefined)?.turns.map(turn => ({ id: turn.id, state: turn.state })),
		}, {
			activeTurn: undefined,
			turns: [{ id: 'turn-1', state: TurnState.Complete }],
		});
	});
});

// TerminalStateSubscription

suite('TerminalStateSubscription', () => {

	let disposables: DisposableStore;

	setup(() => {
		disposables = new DisposableStore();
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('accepts terminal actions matching its URI', () => {
		const sub = disposables.add(new TerminalStateSubscription(terminalUri, 'c1', noop));
		sub.handleSnapshot(makeTerminalState(), 0);

		sub.receiveEnvelope(makeEnvelope(
			{ type: ActionType.TerminalData, data: 'hello' },
			1,
		));

		assert.deepStrictEqual((sub.value as TerminalState).content, [
			{ type: 'unclassified', value: 'hello' },
		]);
	});

	test('ignores terminal actions for other URIs', () => {
		const sub = disposables.add(new TerminalStateSubscription(terminalUri, 'c1', noop));
		sub.handleSnapshot(makeTerminalState(), 0);

		sub.receiveEnvelope(makeEnvelope(
			{ type: ActionType.TerminalData, data: 'nope' },
			1,
			undefined,
			undefined,
			'agenthost-terminal:/other-term',
		));

		assert.deepStrictEqual((sub.value as TerminalState).content, []);
	});

	test('ignores non-terminal actions', () => {
		const sub = disposables.add(new TerminalStateSubscription(terminalUri, 'c1', noop));
		sub.handleSnapshot(makeTerminalState(), 0);

		sub.receiveEnvelope(makeEnvelope(
			{ type: ActionType.RootActiveSessionsChanged, activeSessions: 5 },
			1,
		));

		assert.deepStrictEqual((sub.value as TerminalState).content, []);
	});

	test('handleSnapshot sets value', () => {
		const sub = disposables.add(new TerminalStateSubscription(terminalUri, 'c1', noop));
		const state = makeTerminalState({ title: 'zsh' });
		sub.handleSnapshot(state, 0);
		assert.deepStrictEqual(sub.value, state);
	});
});

// AgentSubscriptionManager

suite('AgentSubscriptionManager', () => {

	let disposables: DisposableStore;
	let seq: number;
	let subscribedResources: string[];
	let unsubscribedResources: string[];

	setup(() => {
		disposables = new DisposableStore();
		seq = 0;
		subscribedResources = [];
		unsubscribedResources = [];
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function createManager(subscribe: (resource: URI) => Promise<{ resource: string; state: SessionState | TerminalState | ChangesetState; fromSeq: number }> = async (resource) => {
		subscribedResources.push(resource.toString());
		const key = resource.toString();
		if (key.startsWith('copilot:')) {
			return { resource: key, state: makeSessionState(key), fromSeq: 0 };
		}
		return { resource: key, state: makeTerminalState(), fromSeq: 0 };
	}): AgentSubscriptionManager {
		return disposables.add(new AgentSubscriptionManager(
			'c1',
			() => ++seq,
			noop,
			subscribe,
			(resource) => {
				unsubscribedResources.push(resource.toString());
			},
		));
	}

	test('rootState is available immediately', () => {
		const mgr = createManager();
		assert.ok(mgr.rootState);
		assert.strictEqual(mgr.rootState.value, undefined);
	});

	test('handleRootSnapshot initializes root state', () => {
		const mgr = createManager();
		const state = makeRootState({ activeSessions: 2 });
		mgr.handleRootSnapshot(state, 0);
		assert.deepStrictEqual(mgr.rootState.value, state);
	});

	test('getSubscription returns IReference with subscription', async () => {
		const mgr = createManager();
		const uri = URI.parse(sessionUri);
		const ref = mgr.getSubscription<SessionState>(StateComponents.Session, uri, 'test');

		assert.ok(ref.object);
		assert.strictEqual(ref.object.value, undefined); // not yet initialized (async)

		// Wait for async subscribe
		await new Promise(r => setTimeout(r, 0));

		assert.ok(ref.object.value);
		ref.dispose();
	});

	test('second call for same resource increments refcount', async () => {
		const mgr = createManager();
		const uri = URI.parse(sessionUri);
		const ref1 = mgr.getSubscription<SessionState>(StateComponents.Session, uri, 'test');
		const ref2 = mgr.getSubscription<SessionState>(StateComponents.Session, uri, 'test');

		await new Promise(r => setTimeout(r, 0));

		// Should be the same subscription object
		assert.strictEqual(ref1.object, ref2.object);

		// Disposing one ref should not trigger unsubscribe
		ref1.dispose();
		assert.strictEqual(unsubscribedResources.length, 0);

		// Disposing the last ref should trigger unsubscribe
		ref2.dispose();
		assert.strictEqual(unsubscribedResources.length, 1);
	});

	test('disposing last ref calls unsubscribe callback', async () => {
		const mgr = createManager();
		const uri = URI.parse(sessionUri);
		const ref = mgr.getSubscription<SessionState>(StateComponents.Session, uri, 'test');

		await new Promise(r => setTimeout(r, 0));

		ref.dispose();
		assert.ok(unsubscribedResources.includes(sessionUri));
	});

	test('receiveEnvelope routes to root and all active subscriptions', async () => {
		const mgr = createManager();
		mgr.handleRootSnapshot(makeRootState(), 0);

		const uri = URI.parse(sessionUri);
		const ref = mgr.getSubscription<SessionState>(StateComponents.Session, uri, 'test');
		await new Promise(r => setTimeout(r, 0));

		// Send a root action
		mgr.receiveEnvelope(makeEnvelope(
			{ type: ActionType.RootActiveSessionsChanged, activeSessions: 10 },
			1,
		));
		assert.strictEqual((mgr.rootState.value as RootState).activeSessions, 10);

		// Send a session action
		mgr.receiveEnvelope(makeEnvelope(
			{ type: ActionType.SessionTitleChanged, title: 'Routed' },
			2,
		));
		assert.strictEqual((ref.object.value as SessionState).title, 'Routed');

		ref.dispose();
	});

	test('isActionEnvelopeRelevantToSubscriptionUris filters by subscribed channel', () => {
		assert.deepStrictEqual({
			rootVariant: isActionEnvelopeRelevantToSubscriptionUris(
				makeEnvelope({ type: ActionType.RootActiveSessionsChanged, activeSessions: 1 }, 1, undefined, undefined, ROOT_STATE_URI),
				['ahp-root:'],
			),
			rootOnlyGetsSession: isActionEnvelopeRelevantToSubscriptionUris(
				makeEnvelope({ type: ActionType.SessionTitleChanged, title: 'Nope' }, 2),
				['ahp-root:'],
			),
			exactSession: isActionEnvelopeRelevantToSubscriptionUris(
				makeEnvelope({ type: ActionType.SessionTitleChanged, title: 'Yep' }, 3),
				['ahp-root:', sessionUri],
			),
		}, {
			rootVariant: true,
			rootOnlyGetsSession: false,
			exactSession: true,
		});
	});

	test('creating session subscription for copilot: URI', async () => {
		const mgr = createManager();
		const mySessionUri = URI.from({ scheme: 'copilot', path: '/my-session' });
		const ref = mgr.getSubscription<SessionState>(StateComponents.Session, mySessionUri, 'test');
		await new Promise(r => setTimeout(r, 0));

		assert.ok(ref.object.value);
		assert.ok(subscribedResources.includes(mySessionUri.toString()));

		ref.dispose();
	});

	test('creating terminal subscription for terminal URI', async () => {
		const mgr = createManager();
		const uri = URI.parse(terminalUri);
		const ref = mgr.getSubscription<TerminalState>(StateComponents.Terminal, uri, 'test');
		await new Promise(r => setTimeout(r, 0));

		assert.ok(ref.object.value);
		assert.ok(subscribedResources.includes(terminalUri));

		ref.dispose();
	});

	test('dispatchOptimistic applies to matching session subscription', async () => {
		const mgr = createManager();
		const uri = URI.parse(sessionUri);
		const ref = mgr.getSubscription<SessionState>(StateComponents.Session, uri, 'test');
		await new Promise(r => setTimeout(r, 0));

		const clientSeq = mgr.dispatchOptimistic(uri.toString(), {
			type: ActionType.SessionTitleChanged,
			title: 'Dispatched',
		});

		assert.ok(clientSeq > 0);
		assert.strictEqual((ref.object.value as SessionState).title, 'Dispatched');
		// verifiedValue unchanged
		assert.strictEqual(ref.object.verifiedValue!.title, 'Test');

		ref.dispose();
	});

	test('dispatchOptimistic applies to matching changeset subscription', async () => {
		const state: ChangesetState = {
			status: ChangesetStatus.Ready,
			files: [{
				id: 'file:///test.txt',
				edit: {
					after: { uri: 'file:///test.txt', content: { uri: 'file:///after.txt' } },
				},
			}],
		};
		const mgr = createManager(async resource => ({ resource: resource.toString(), state, fromSeq: 0 }));
		const uri = URI.parse(changesetUri);
		const ref = mgr.getSubscription<ChangesetState>(StateComponents.Changeset, uri, 'test');
		await new Promise(r => setTimeout(r, 0));

		const clientSeq = mgr.dispatchOptimistic(uri.toString(), {
			type: ActionType.ChangesetFilesReviewChanged,
			files: ['file:///test.txt'],
			reviewed: true,
		});

		assert.deepStrictEqual({
			clientSeq,
			optimisticReviewed: (ref.object.value as ChangesetState).files[0].reviewed,
			verifiedReviewed: ref.object.verifiedValue?.files[0].reviewed,
		}, {
			clientSeq: 1,
			optimisticReviewed: true,
			verifiedReviewed: undefined,
		});

		ref.dispose();
	});

	test('dispose clears all subscriptions and calls unsubscribe for each', async () => {
		const mgr = createManager();

		const ref1 = mgr.getSubscription<SessionState>(StateComponents.Session, URI.parse(sessionUri), 'test');
		const ref2 = mgr.getSubscription<TerminalState>(StateComponents.Terminal, URI.parse(terminalUri), 'test');
		await new Promise(r => setTimeout(r, 0));

		// Remove the manager from disposables so we can dispose it manually
		// without double-dispose
		disposables.delete(mgr);
		mgr.dispose();

		assert.ok(unsubscribedResources.includes(sessionUri));
		assert.ok(unsubscribedResources.includes(terminalUri));

		// Clean up refs (already disposed with manager, but safe to call)
		ref1.dispose();
		ref2.dispose();
	});

	test('getSubscriptionUnmanaged returns undefined when no subscription exists', () => {
		const mgr = createManager();
		const result = mgr.getSubscriptionUnmanaged<SessionState>(URI.parse('copilot:/nonexistent'));
		assert.strictEqual(result, undefined);
	});

	test('getSubscriptionUnmanaged returns existing subscription without affecting refcount', async () => {
		const mgr = createManager();
		const uri = URI.parse(sessionUri);

		// Create a subscription via getSubscription
		const ref = mgr.getSubscription<SessionState>(StateComponents.Session, uri, 'test');
		await new Promise(r => setTimeout(r, 0));

		// Get it unmanaged
		const unmanaged = mgr.getSubscriptionUnmanaged<SessionState>(uri);
		assert.ok(unmanaged);
		assert.strictEqual(unmanaged, ref.object);

		// Dispose the ref. Subscription should be released (refcount was 1)
		ref.dispose();

		// Now unmanaged should return undefined since it was released
		const after = mgr.getSubscriptionUnmanaged<SessionState>(uri);
		assert.strictEqual(after, undefined);
	});

	test('getSubscription retries after a failed subscribe for the same resource', async () => {
		let subscribeAttempts = 0;
		const mgr = createManager(async resource => {
			subscribedResources.push(resource.toString());
			subscribeAttempts++;
			if (subscribeAttempts === 1) {
				throw new Error('not found yet');
			}
			return { resource: resource.toString(), state: makeSessionState(resource.toString(), { title: 'Retried' }), fromSeq: 0 };
		});
		const uri = URI.parse(sessionUri);

		const failedRef = mgr.getSubscription<SessionState>(StateComponents.Session, uri, 'test');
		await new Promise(r => setTimeout(r, 0));

		assert.ok(failedRef.object.value instanceof Error);

		const retryRef = mgr.getSubscription<SessionState>(StateComponents.Session, uri, 'test');
		await new Promise(r => setTimeout(r, 0));

		assert.deepStrictEqual({
			subscribeAttempts,
			retriedTitle: (retryRef.object.value as SessionState).title,
			unmanagedIsRetry: mgr.getSubscriptionUnmanaged<SessionState>(uri) === retryRef.object,
		}, {
			subscribeAttempts: 2,
			retriedTitle: 'Retried',
			unmanagedIsRetry: true,
		});

		failedRef.dispose();
		assert.strictEqual(mgr.getSubscriptionUnmanaged<SessionState>(uri), retryRef.object);

		retryRef.dispose();
		assert.strictEqual(mgr.getSubscriptionUnmanaged<SessionState>(uri), undefined);
	});

	test('getActiveSubscriptions reports kind, refCount, holders and status per active subscription', async () => {
		const mgr = createManager();
		const sUri = URI.parse(sessionUri);
		const tUri = URI.parse(terminalUri);

		const sessionRef = mgr.getSubscription<SessionState>(StateComponents.Session, sUri, 'SessionHolder');
		const sessionRef2 = mgr.getSubscription<SessionState>(StateComponents.Session, sUri, 'SessionHolder');
		const terminalRef = mgr.getSubscription<TerminalState>(StateComponents.Terminal, tUri, 'TerminalHolder');

		const map = () => mgr.getActiveSubscriptions().map(s => ({ resource: s.resource.toString(), kind: s.kind, refCount: s.refCount, holders: s.holders, status: s.status }));
		const pending = map();

		await new Promise(r => setTimeout(r, 0));

		const active = map();

		assert.deepStrictEqual({ pending, active }, {
			pending: [
				{ resource: sessionUri, kind: StateComponents.Session, refCount: 2, holders: [{ owner: 'SessionHolder', count: 2 }], status: 'pending' },
				{ resource: terminalUri, kind: StateComponents.Terminal, refCount: 1, holders: [{ owner: 'TerminalHolder', count: 1 }], status: 'pending' },
			],
			active: [
				{ resource: sessionUri, kind: StateComponents.Session, refCount: 2, holders: [{ owner: 'SessionHolder', count: 2 }], status: 'snapshot' },
				{ resource: terminalUri, kind: StateComponents.Terminal, refCount: 1, holders: [{ owner: 'TerminalHolder', count: 1 }], status: 'snapshot' },
			],
		});

		sessionRef.dispose();
		sessionRef2.dispose();
		terminalRef.dispose();

		assert.strictEqual(mgr.getActiveSubscriptions().length, 0);
	});

	test('getActiveSubscriptions tracks distinct holders and drops them as references are disposed', async () => {
		const mgr = createManager();
		const sUri = URI.parse(sessionUri);

		const refA = mgr.getSubscription<SessionState>(StateComponents.Session, sUri, 'HolderA');
		const refB = mgr.getSubscription<SessionState>(StateComponents.Session, sUri, 'HolderB');
		const refB2 = mgr.getSubscription<SessionState>(StateComponents.Session, sUri, 'HolderB');
		await new Promise(r => setTimeout(r, 0));

		const withAll = mgr.getActiveSubscriptions()[0].holders;

		refB.dispose();
		const afterOneB = mgr.getActiveSubscriptions()[0].holders;

		// Disposing the same reference twice must not over-remove holders.
		refB.dispose();
		const afterDoubleDispose = mgr.getActiveSubscriptions()[0].holders;

		refA.dispose();
		refB2.dispose();

		assert.deepStrictEqual({ withAll, afterOneB, afterDoubleDispose, remaining: mgr.getActiveSubscriptions().length }, {
			// Sorted by descending count, so HolderB (2) precedes HolderA (1).
			withAll: [{ owner: 'HolderB', count: 2 }, { owner: 'HolderA', count: 1 }],
			afterOneB: [{ owner: 'HolderA', count: 1 }, { owner: 'HolderB', count: 1 }],
			afterDoubleDispose: [{ owner: 'HolderA', count: 1 }, { owner: 'HolderB', count: 1 }],
			remaining: 0,
		});
	});

	test('getActiveSubscriptions reports error status for a failed subscription', async () => {
		const mgr = createManager(async () => { throw new Error('nope'); });
		const ref = mgr.getSubscription<SessionState>(StateComponents.Session, URI.parse(sessionUri), 'test');
		await new Promise(r => setTimeout(r, 0));

		assert.deepStrictEqual(
			mgr.getActiveSubscriptions().map(s => ({ kind: s.kind, status: s.status })),
			[{ kind: StateComponents.Session, status: 'error' }],
		);
		ref.dispose();
	});
});
