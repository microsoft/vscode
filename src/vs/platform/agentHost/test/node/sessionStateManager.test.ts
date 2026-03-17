/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { IActionEnvelope, INotification } from '../../common/state/sessionActions.js';
import { ISessionSummary, ROOT_STATE_URI, SessionLifecycle, SessionStatus, type ISessionState } from '../../common/state/sessionState.js';
import { SessionStateManager } from '../../node/sessionStateManager.js';

suite('SessionStateManager', () => {

	let disposables: DisposableStore;
	let manager: SessionStateManager;
	const sessionUri = URI.from({ scheme: 'copilot', path: '/test-session' });

	function makeSessionSummary(resource?: URI): ISessionSummary {
		return {
			resource: resource ?? sessionUri,
			provider: 'copilot',
			title: 'Test',
			status: SessionStatus.Idle,
			createdAt: Date.now(),
			modifiedAt: Date.now(),
		};
	}

	setup(() => {
		disposables = new DisposableStore();
		manager = disposables.add(new SessionStateManager(new NullLogService()));
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('createSession creates initial state with lifecycle Creating', () => {
		const state = manager.createSession(makeSessionSummary());
		assert.strictEqual(state.lifecycle, SessionLifecycle.Creating);
		assert.strictEqual(state.turns.length, 0);
		assert.strictEqual(state.activeTurn, undefined);
		assert.strictEqual(state.summary.resource.toString(), sessionUri.toString());
	});

	test('getSnapshot returns undefined for unknown session', () => {
		const unknown = URI.from({ scheme: 'copilot', path: '/unknown' });
		const snapshot = manager.getSnapshot(unknown);
		assert.strictEqual(snapshot, undefined);
	});

	test('getSnapshot returns root snapshot', () => {
		const snapshot = manager.getSnapshot(ROOT_STATE_URI);
		assert.ok(snapshot);
		assert.strictEqual(snapshot.resource.toString(), ROOT_STATE_URI.toString());
		assert.deepStrictEqual(snapshot.state, { agents: [] });
	});

	test('getSnapshot returns session snapshot after creation', () => {
		manager.createSession(makeSessionSummary());
		const snapshot = manager.getSnapshot(sessionUri);
		assert.ok(snapshot);
		assert.strictEqual(snapshot.resource.toString(), sessionUri.toString());
		assert.strictEqual((snapshot.state as ISessionState).lifecycle, SessionLifecycle.Creating);
	});

	test('dispatchServerAction applies action and emits envelope', () => {
		manager.createSession(makeSessionSummary());

		const envelopes: IActionEnvelope[] = [];
		disposables.add(manager.onDidEmitEnvelope(e => envelopes.push(e)));

		manager.dispatchServerAction({
			type: 'session/ready',
			session: sessionUri,
		});

		const state = manager.getSessionState(sessionUri);
		assert.ok(state);
		assert.strictEqual(state.lifecycle, SessionLifecycle.Ready);

		assert.strictEqual(envelopes.length, 1);
		assert.strictEqual(envelopes[0].action.type, 'session/ready');
		assert.strictEqual(envelopes[0].serverSeq, 1);
		assert.strictEqual(envelopes[0].origin, undefined);
	});

	test('serverSeq increments monotonically', () => {
		manager.createSession(makeSessionSummary());

		const envelopes: IActionEnvelope[] = [];
		disposables.add(manager.onDidEmitEnvelope(e => envelopes.push(e)));

		manager.dispatchServerAction({ type: 'session/ready', session: sessionUri });
		manager.dispatchServerAction({ type: 'session/titleChanged', session: sessionUri, title: 'Updated' });

		assert.strictEqual(envelopes.length, 2);
		assert.strictEqual(envelopes[0].serverSeq, 1);
		assert.strictEqual(envelopes[1].serverSeq, 2);
		assert.ok(envelopes[1].serverSeq > envelopes[0].serverSeq);
	});

	test('dispatchClientAction includes origin in envelope', () => {
		manager.createSession(makeSessionSummary());

		const envelopes: IActionEnvelope[] = [];
		disposables.add(manager.onDidEmitEnvelope(e => envelopes.push(e)));

		const origin = { clientId: 'renderer-1', clientSeq: 42 };
		manager.dispatchClientAction(
			{ type: 'session/ready', session: sessionUri },
			origin,
		);

		assert.strictEqual(envelopes.length, 1);
		assert.deepStrictEqual(envelopes[0].origin, origin);
	});

	test('removeSession clears state and emits notification', () => {
		manager.createSession(makeSessionSummary());

		const notifications: INotification[] = [];
		disposables.add(manager.onDidEmitNotification(n => notifications.push(n)));

		manager.removeSession(sessionUri);

		assert.strictEqual(manager.getSessionState(sessionUri), undefined);
		assert.strictEqual(manager.getSnapshot(sessionUri), undefined);
		assert.strictEqual(notifications.length, 1);
		assert.strictEqual(notifications[0].type, 'notify/sessionRemoved');
	});

	test('createSession emits sessionAdded notification', () => {
		const notifications: INotification[] = [];
		disposables.add(manager.onDidEmitNotification(n => notifications.push(n)));

		manager.createSession(makeSessionSummary());

		assert.strictEqual(notifications.length, 1);
		assert.strictEqual(notifications[0].type, 'notify/sessionAdded');
	});

	test('getActiveTurnId returns active turn id after turnStarted', () => {
		manager.createSession(makeSessionSummary());
		manager.dispatchServerAction({ type: 'session/ready', session: sessionUri });

		assert.strictEqual(manager.getActiveTurnId(sessionUri), undefined);

		manager.dispatchServerAction({
			type: 'session/turnStarted',
			session: sessionUri,
			turnId: 'turn-1',
			userMessage: { text: 'hello' },
		});

		assert.strictEqual(manager.getActiveTurnId(sessionUri), 'turn-1');
	});
});
