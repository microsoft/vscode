/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ActionType, type IActionEnvelope } from '../../common/state/sessionActions.js';
import { SessionLifecycle, SessionStatus, TerminalClaimKind, type IRootState, type ISessionState, type ITerminalState } from '../../common/state/protocol/state.js';
import { StateComponents } from '../../common/state/sessionState.js';
import { AgentSubscriptionManager, RootStateSubscription, SessionStateSubscription, TerminalStateSubscription } from '../../common/state/agentSubscription.js';

// Helpers

function makeRootState(overrides?: Partial<IRootState>): IRootState {
	return {
		agents: [],
		activeSessions: 0,
		terminals: [],
		...overrides,
	};
}

function makeSessionState(sessionUri: string, overrides?: Partial<ISessionState>): ISessionState {
	return {
		summary: {
			resource: sessionUri,
			provider: 'copilot',
			title: 'Test',
			status: SessionStatus.Idle,
			createdAt: 1,
			modifiedAt: 1,
			project: { uri: 'file:///test-project', displayName: 'Test Project' },
		},
		lifecycle: SessionLifecycle.Ready,
		turns: [],
		...overrides,
	};
}

function makeTerminalState(overrides?: Partial<ITerminalState>): ITerminalState {
	return {
		title: 'bash',
		content: [],
		claim: { kind: TerminalClaimKind.Client, clientId: 'c1' },
		...overrides,
	};
}

function makeEnvelope(action: IActionEnvelope['action'], serverSeq: number, origin?: IActionEnvelope['origin'], rejectionReason?: string): IActionEnvelope {
	return { action, serverSeq, origin, rejectionReason };
}

const noop = () => { };
const sessionUri = URI.from({ scheme: 'copilot', path: '/test-session' }).toString();
const terminalUri = URI.from({ scheme: 'agenthost-terminal', path: '/term1' }).toString();

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
		const fired: IRootState[] = [];
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
		assert.strictEqual((sub.value as IRootState).activeSessions, 5);
	});

	test('ignores non-root actions', () => {
		const sub = disposables.add(new RootStateSubscription('c1', noop));
		const state = makeRootState();
		sub.handleSnapshot(state, 0);
		sub.receiveEnvelope(makeEnvelope(
			{ type: ActionType.SessionReady, session: sessionUri },
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
		assert.strictEqual((sub.value! as IRootState).activeSessions, 7);
	});

	test('buffered envelopes with serverSeq <= fromSeq are discarded', () => {
		const sub = disposables.add(new RootStateSubscription('c1', noop));
		sub.receiveEnvelope(makeEnvelope(
			{ type: ActionType.RootActiveSessionsChanged, activeSessions: 99 },
			1,
		));
		sub.handleSnapshot(makeRootState({ activeSessions: 0 }), 1);
		// Envelope at seq 1 should not replay since fromSeq === 1
		assert.strictEqual((sub.value as IRootState).activeSessions, 0);
	});

	test('setError makes value return the error', () => {
		const sub = disposables.add(new RootStateSubscription('c1', noop));
		sub.handleSnapshot(makeRootState(), 0);
		const err = new Error('failed');
		sub.setError(err);
		assert.strictEqual(sub.value, err);
		// verifiedValue should still be the state
		assert.ok(sub.verifiedValue);
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
			session: sessionUri,
			title: 'Optimistic',
		});

		assert.strictEqual(clientSeq, 1);
		assert.strictEqual((sub.value as ISessionState).summary.title, 'Optimistic');
		// verifiedValue should remain unchanged
		assert.strictEqual(sub.verifiedValue!.summary.title, 'Test');
	});

	test('confirmed own action removes pending and updates confirmed', () => {
		const sub = createSub();
		sub.handleSnapshot(makeSessionState(sessionUri), 0);

		const clientSeq = sub.applyOptimistic({
			type: ActionType.SessionTitleChanged,
			session: sessionUri,
			title: 'Optimistic',
		});

		// Server confirms the action
		sub.receiveEnvelope(makeEnvelope(
			{ type: ActionType.SessionTitleChanged, session: sessionUri, title: 'Optimistic' },
			1,
			{ clientId: 'c1', clientSeq },
		));

		// After confirmation, verifiedValue should match
		assert.strictEqual(sub.verifiedValue!.summary.title, 'Optimistic');
		// No pending, value falls through to confirmed
		assert.strictEqual((sub.value as ISessionState).summary.title, 'Optimistic');
	});

	test('rejected own action removes pending without updating confirmed', () => {
		const sub = createSub();
		sub.handleSnapshot(makeSessionState(sessionUri), 0);

		const clientSeq = sub.applyOptimistic({
			type: ActionType.SessionTitleChanged,
			session: sessionUri,
			title: 'Optimistic',
		});

		// Server rejects the action
		sub.receiveEnvelope(makeEnvelope(
			{ type: ActionType.SessionTitleChanged, session: sessionUri, title: 'Optimistic' },
			1,
			{ clientId: 'c1', clientSeq },
			'denied',
		));

		// Confirmed state unchanged
		assert.strictEqual(sub.verifiedValue!.summary.title, 'Test');
		// No more pending, value = confirmed
		assert.strictEqual((sub.value as ISessionState).summary.title, 'Test');
	});

	test('foreign action updates confirmed and recomputes optimistic', () => {
		const sub = createSub();
		sub.handleSnapshot(makeSessionState(sessionUri), 0);

		// Local optimistic action
		sub.applyOptimistic({
			type: ActionType.SessionTitleChanged,
			session: sessionUri,
			title: 'Local',
		});

		// Foreign action arrives
		sub.receiveEnvelope(makeEnvelope(
			{ type: ActionType.SessionReady, session: sessionUri },
			1,
			{ clientId: 'other-client', clientSeq: 1 },
		));

		// Confirmed state should have SessionReady applied
		assert.strictEqual(sub.verifiedValue!.lifecycle, SessionLifecycle.Ready);
		// Optimistic should still have 'Local' title on top
		assert.strictEqual((sub.value as ISessionState).summary.title, 'Local');
	});

	test('after all pending cleared, value falls through to verifiedValue', () => {
		const sub = createSub();
		sub.handleSnapshot(makeSessionState(sessionUri), 0);

		const clientSeq = sub.applyOptimistic({
			type: ActionType.SessionTitleChanged,
			session: sessionUri,
			title: 'Temp',
		});

		// Confirm the pending action
		sub.receiveEnvelope(makeEnvelope(
			{ type: ActionType.SessionTitleChanged, session: sessionUri, title: 'Temp' },
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
			session: sessionUri,
			title: 'Pending',
		});

		assert.strictEqual((sub.value as ISessionState).summary.title, 'Pending');

		sub.clearPending();

		// Should fall back to confirmed
		assert.strictEqual((sub.value as ISessionState).summary.title, 'Test');
	});

	test('ignores actions for different session', () => {
		const sub = createSub();
		sub.handleSnapshot(makeSessionState(sessionUri), 0);

		sub.receiveEnvelope(makeEnvelope(
			{ type: ActionType.SessionTitleChanged, session: 'copilot:///other', title: 'Other' },
			1,
		));

		assert.strictEqual((sub.value as ISessionState).summary.title, 'Test');
	});

	test('buffers envelopes before snapshot and replays after', () => {
		const sub = createSub();

		sub.receiveEnvelope(makeEnvelope(
			{ type: ActionType.SessionTitleChanged, session: sessionUri, title: 'Buffered' },
			2,
		));

		assert.strictEqual(sub.value, undefined);

		sub.handleSnapshot(makeSessionState(sessionUri), 1);

		assert.strictEqual((sub.value! as ISessionState).summary.title, 'Buffered');
	});

	test('fires onDidChange on optimistic apply', () => {
		const sub = createSub();
		sub.handleSnapshot(makeSessionState(sessionUri), 0);

		const fired: ISessionState[] = [];
		disposables.add(sub.onDidChange(s => fired.push(s)));

		sub.applyOptimistic({
			type: ActionType.SessionTitleChanged,
			session: sessionUri,
			title: 'Changed',
		});

		assert.strictEqual(fired.length, 1);
		assert.strictEqual(fired[0].summary.title, 'Changed');
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
			{ type: ActionType.TerminalData, terminal: terminalUri, data: 'hello' },
			1,
		));

		assert.deepStrictEqual((sub.value as ITerminalState).content, [
			{ type: 'unclassified', value: 'hello' },
		]);
	});

	test('ignores terminal actions for other URIs', () => {
		const sub = disposables.add(new TerminalStateSubscription(terminalUri, 'c1', noop));
		sub.handleSnapshot(makeTerminalState(), 0);

		sub.receiveEnvelope(makeEnvelope(
			{ type: ActionType.TerminalData, terminal: 'agenthost-terminal:///other', data: 'nope' },
			1,
		));

		assert.deepStrictEqual((sub.value as ITerminalState).content, []);
	});

	test('ignores non-terminal actions', () => {
		const sub = disposables.add(new TerminalStateSubscription(terminalUri, 'c1', noop));
		sub.handleSnapshot(makeTerminalState(), 0);

		sub.receiveEnvelope(makeEnvelope(
			{ type: ActionType.RootActiveSessionsChanged, activeSessions: 5 },
			1,
		));

		assert.deepStrictEqual((sub.value as ITerminalState).content, []);
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

	function createManager(): AgentSubscriptionManager {
		return disposables.add(new AgentSubscriptionManager(
			'c1',
			() => ++seq,
			noop,
			async (resource) => {
				subscribedResources.push(resource.toString());
				const key = resource.toString();
				if (key.startsWith('copilot:')) {
					return { resource: key, state: makeSessionState(key), fromSeq: 0 };
				}
				return { resource: key, state: makeTerminalState(), fromSeq: 0 };
			},
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
		const ref = mgr.getSubscription<ISessionState>(StateComponents.Session, uri);

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
		const ref1 = mgr.getSubscription<ISessionState>(StateComponents.Session, uri);
		const ref2 = mgr.getSubscription<ISessionState>(StateComponents.Session, uri);

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
		const ref = mgr.getSubscription<ISessionState>(StateComponents.Session, uri);

		await new Promise(r => setTimeout(r, 0));

		ref.dispose();
		assert.ok(unsubscribedResources.includes(sessionUri));
	});

	test('receiveEnvelope routes to root and all active subscriptions', async () => {
		const mgr = createManager();
		mgr.handleRootSnapshot(makeRootState(), 0);

		const uri = URI.parse(sessionUri);
		const ref = mgr.getSubscription<ISessionState>(StateComponents.Session, uri);
		await new Promise(r => setTimeout(r, 0));

		// Send a root action
		mgr.receiveEnvelope(makeEnvelope(
			{ type: ActionType.RootActiveSessionsChanged, activeSessions: 10 },
			1,
		));
		assert.strictEqual((mgr.rootState.value as IRootState).activeSessions, 10);

		// Send a session action
		mgr.receiveEnvelope(makeEnvelope(
			{ type: ActionType.SessionTitleChanged, session: sessionUri, title: 'Routed' },
			2,
		));
		assert.strictEqual((ref.object.value as ISessionState).summary.title, 'Routed');

		ref.dispose();
	});

	test('creating session subscription for copilot: URI', async () => {
		const mgr = createManager();
		const mySessionUri = URI.from({ scheme: 'copilot', path: '/my-session' });
		const ref = mgr.getSubscription<ISessionState>(StateComponents.Session, mySessionUri);
		await new Promise(r => setTimeout(r, 0));

		assert.ok(ref.object.value);
		assert.ok(subscribedResources.includes(mySessionUri.toString()));

		ref.dispose();
	});

	test('creating terminal subscription for terminal URI', async () => {
		const mgr = createManager();
		const uri = URI.parse(terminalUri);
		const ref = mgr.getSubscription<ITerminalState>(StateComponents.Terminal, uri);
		await new Promise(r => setTimeout(r, 0));

		assert.ok(ref.object.value);
		assert.ok(subscribedResources.includes(terminalUri));

		ref.dispose();
	});

	test('dispatchOptimistic applies to matching session subscription', async () => {
		const mgr = createManager();
		const uri = URI.parse(sessionUri);
		const ref = mgr.getSubscription<ISessionState>(StateComponents.Session, uri);
		await new Promise(r => setTimeout(r, 0));

		const clientSeq = mgr.dispatchOptimistic({
			type: ActionType.SessionTitleChanged,
			session: sessionUri,
			title: 'Dispatched',
		});

		assert.ok(clientSeq > 0);
		assert.strictEqual((ref.object.value as ISessionState).summary.title, 'Dispatched');
		// verifiedValue unchanged
		assert.strictEqual(ref.object.verifiedValue!.summary.title, 'Test');

		ref.dispose();
	});

	test('dispose clears all subscriptions and calls unsubscribe for each', async () => {
		const mgr = createManager();

		const ref1 = mgr.getSubscription<ISessionState>(StateComponents.Session, URI.parse(sessionUri));
		const ref2 = mgr.getSubscription<ITerminalState>(StateComponents.Terminal, URI.parse(terminalUri));
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
		const result = mgr.getSubscriptionUnmanaged<ISessionState>(URI.parse('copilot:/nonexistent'));
		assert.strictEqual(result, undefined);
	});

	test('getSubscriptionUnmanaged returns existing subscription without affecting refcount', async () => {
		const mgr = createManager();
		const uri = URI.parse(sessionUri);

		// Create a subscription via getSubscription
		const ref = mgr.getSubscription<ISessionState>(StateComponents.Session, uri);
		await new Promise(r => setTimeout(r, 0));

		// Get it unmanaged
		const unmanaged = mgr.getSubscriptionUnmanaged<ISessionState>(uri);
		assert.ok(unmanaged);
		assert.strictEqual(unmanaged, ref.object);

		// Dispose the ref. Subscription should be released (refcount was 1)
		ref.dispose();

		// Now unmanaged should return undefined since it was released
		const after = mgr.getSubscriptionUnmanaged<ISessionState>(uri);
		assert.strictEqual(after, undefined);
	});
});
