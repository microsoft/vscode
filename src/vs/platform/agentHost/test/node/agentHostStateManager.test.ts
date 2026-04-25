/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { NullLogService } from '../../../log/common/log.js';
import { ActionType, NotificationType, type ActionEnvelope, type INotification } from '../../common/state/sessionActions.js';
import { SessionSummary, ResponsePartKind, ROOT_STATE_URI, SessionLifecycle, SessionStatus, TurnState, buildSubagentSessionUri, isSubagentSession, parseSubagentSessionUri, type MarkdownResponsePart, type SessionState } from '../../common/state/sessionState.js';
import { type SessionSummaryChangedNotification } from '../../common/state/protocol/notifications.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';

suite('AgentHostStateManager', () => {

	let disposables: DisposableStore;
	let manager: AgentHostStateManager;
	const sessionUri = URI.from({ scheme: 'copilot', path: '/test-session' }).toString();

	function makeSessionSummary(resource?: string): SessionSummary {
		return {
			resource: resource ?? sessionUri,
			provider: 'copilot',
			title: 'Test',
			status: SessionStatus.Idle,
			createdAt: Date.now(),
			modifiedAt: Date.now(),
			project: { uri: 'file:///test-project', displayName: 'Test Project' },
		};
	}

	setup(() => {
		disposables = new DisposableStore();
		manager = disposables.add(new AgentHostStateManager(new NullLogService()));
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
		const unknown = URI.from({ scheme: 'copilot', path: '/unknown' }).toString();
		const snapshot = manager.getSnapshot(unknown);
		assert.strictEqual(snapshot, undefined);
	});

	test('getSnapshot returns root snapshot', () => {
		const snapshot = manager.getSnapshot(ROOT_STATE_URI);
		assert.ok(snapshot);
		assert.strictEqual(snapshot.resource.toString(), ROOT_STATE_URI.toString());
		const root = snapshot.state as { agents: unknown[]; activeSessions: number; config?: { values?: Record<string, unknown> } };
		assert.deepStrictEqual(root.agents, []);
		assert.strictEqual(root.activeSessions, 0);
		// Host config is seeded with the platform root schema and defaults.
		assert.ok(root.config, 'root state should include a seeded config');
	});

	test('getSnapshot returns session snapshot after creation', () => {
		manager.createSession(makeSessionSummary());
		const snapshot = manager.getSnapshot(sessionUri);
		assert.ok(snapshot);
		assert.strictEqual(snapshot.resource.toString(), sessionUri.toString());
		assert.strictEqual((snapshot.state as SessionState).lifecycle, SessionLifecycle.Creating);
	});

	test('dispatchServerAction applies action and emits envelope', () => {
		manager.createSession(makeSessionSummary());

		const envelopes: ActionEnvelope[] = [];
		disposables.add(manager.onDidEmitEnvelope(e => envelopes.push(e)));

		manager.dispatchServerAction({
			type: ActionType.SessionReady,
			session: sessionUri,
		});

		const state = manager.getSessionState(sessionUri);
		assert.ok(state);
		assert.strictEqual(state.lifecycle, SessionLifecycle.Ready);

		assert.strictEqual(envelopes.length, 1);
		assert.strictEqual(envelopes[0].action.type, ActionType.SessionReady);
		assert.strictEqual(envelopes[0].serverSeq, 1);
		assert.strictEqual(envelopes[0].origin, undefined);
	});

	test('serverSeq increments monotonically', () => {
		manager.createSession(makeSessionSummary());

		const envelopes: ActionEnvelope[] = [];
		disposables.add(manager.onDidEmitEnvelope(e => envelopes.push(e)));

		manager.dispatchServerAction({ type: ActionType.SessionReady, session: sessionUri });
		manager.dispatchServerAction({ type: ActionType.SessionTitleChanged, session: sessionUri, title: 'Updated' });

		assert.strictEqual(envelopes.length, 2);
		assert.strictEqual(envelopes[0].serverSeq, 1);
		assert.strictEqual(envelopes[1].serverSeq, 2);
		assert.ok(envelopes[1].serverSeq > envelopes[0].serverSeq);
	});

	test('dispatchClientAction includes origin in envelope', () => {
		manager.createSession(makeSessionSummary());

		const envelopes: ActionEnvelope[] = [];
		disposables.add(manager.onDidEmitEnvelope(e => envelopes.push(e)));

		const origin = { clientId: 'renderer-1', clientSeq: 42 };
		manager.dispatchClientAction(
			{ type: ActionType.SessionReady, session: sessionUri },
			origin,
		);

		assert.strictEqual(envelopes.length, 1);
		assert.deepStrictEqual(envelopes[0].origin, origin);
	});

	test('removeSession clears state without notification', () => {
		manager.createSession(makeSessionSummary());

		const notifications: INotification[] = [];
		disposables.add(manager.onDidEmitNotification(n => notifications.push(n)));

		manager.removeSession(sessionUri);

		assert.strictEqual(manager.getSessionState(sessionUri), undefined);
		assert.strictEqual(manager.getSnapshot(sessionUri), undefined);
		assert.strictEqual(notifications.length, 0);
	});

	test('deleteSession clears state and emits notification', () => {
		manager.createSession(makeSessionSummary());

		const notifications: INotification[] = [];
		disposables.add(manager.onDidEmitNotification(n => notifications.push(n)));

		manager.deleteSession(sessionUri);

		assert.strictEqual(manager.getSessionState(sessionUri), undefined);
		assert.strictEqual(manager.getSnapshot(sessionUri), undefined);
		assert.strictEqual(notifications.length, 1);
		assert.strictEqual(notifications[0].type, NotificationType.SessionRemoved);
	});

	test('createSession emits sessionAdded notification', () => {
		const notifications: INotification[] = [];
		disposables.add(manager.onDidEmitNotification(n => notifications.push(n)));

		manager.createSession(makeSessionSummary());

		assert.strictEqual(notifications.length, 1);
		assert.strictEqual(notifications[0].type, NotificationType.SessionAdded);
	});

	test('getActiveTurnId returns active turn id after turnStarted', () => {
		manager.createSession(makeSessionSummary());
		manager.dispatchServerAction({ type: ActionType.SessionReady, session: sessionUri });

		assert.strictEqual(manager.getActiveTurnId(sessionUri), undefined);

		manager.dispatchServerAction({
			type: ActionType.SessionTurnStarted,
			session: sessionUri,
			turnId: 'turn-1',
			userMessage: { text: 'hello' },
		});

		assert.strictEqual(manager.getActiveTurnId(sessionUri), 'turn-1');
	});

	test('root state starts with activeSessions: 0', () => {
		const snapshot = manager.getSnapshot(ROOT_STATE_URI);
		assert.ok(snapshot);
		const root = snapshot.state as { agents: unknown[]; activeSessions: number };
		assert.deepStrictEqual(root.agents, []);
		assert.strictEqual(root.activeSessions, 0);
	});

	test('turnStarted dispatches root/activeSessionsChanged with correct count', () => {
		manager.createSession(makeSessionSummary());
		manager.dispatchServerAction({ type: ActionType.SessionReady, session: sessionUri });

		const envelopes: ActionEnvelope[] = [];
		disposables.add(manager.onDidEmitEnvelope(e => envelopes.push(e)));

		manager.dispatchServerAction({
			type: ActionType.SessionTurnStarted,
			session: sessionUri,
			turnId: 'turn-1',
			userMessage: { text: 'hello' },
		});

		const activeChanged = envelopes.filter(e => e.action.type === ActionType.RootActiveSessionsChanged);
		assert.strictEqual(activeChanged.length, 1);
		assert.strictEqual((activeChanged[0].action as { activeSessions: number }).activeSessions, 1);
		assert.strictEqual(manager.rootState.activeSessions, 1);
	});

	test('turnComplete dispatches root/activeSessionsChanged back to 0', () => {
		manager.createSession(makeSessionSummary());
		manager.dispatchServerAction({ type: ActionType.SessionReady, session: sessionUri });
		manager.dispatchServerAction({
			type: ActionType.SessionTurnStarted,
			session: sessionUri,
			turnId: 'turn-1',
			userMessage: { text: 'hello' },
		});

		const envelopes: ActionEnvelope[] = [];
		disposables.add(manager.onDidEmitEnvelope(e => envelopes.push(e)));

		manager.dispatchServerAction({
			type: ActionType.SessionTurnComplete,
			session: sessionUri,
			turnId: 'turn-1',
		});

		const activeChanged = envelopes.filter(e => e.action.type === ActionType.RootActiveSessionsChanged);
		assert.strictEqual(activeChanged.length, 1);
		assert.strictEqual((activeChanged[0].action as { activeSessions: number }).activeSessions, 0);
		assert.strictEqual(manager.rootState.activeSessions, 0);
	});

	test('activeSessions reflects concurrent turn count across sessions', () => {
		const session2Uri = URI.from({ scheme: 'copilot', path: '/test-session-2' }).toString();
		manager.createSession(makeSessionSummary(sessionUri));
		manager.createSession(makeSessionSummary(session2Uri));
		manager.dispatchServerAction({ type: ActionType.SessionReady, session: sessionUri });
		manager.dispatchServerAction({ type: ActionType.SessionReady, session: session2Uri });

		manager.dispatchServerAction({
			type: ActionType.SessionTurnStarted,
			session: sessionUri,
			turnId: 'turn-1',
			userMessage: { text: 'a' },
		});
		manager.dispatchServerAction({
			type: ActionType.SessionTurnStarted,
			session: session2Uri,
			turnId: 'turn-2',
			userMessage: { text: 'b' },
		});
		assert.strictEqual(manager.rootState.activeSessions, 2);

		manager.dispatchServerAction({
			type: ActionType.SessionTurnComplete,
			session: sessionUri,
			turnId: 'turn-1',
		});
		assert.strictEqual(manager.rootState.activeSessions, 1);

		manager.dispatchServerAction({
			type: ActionType.SessionTurnComplete,
			session: session2Uri,
			turnId: 'turn-2',
		});
		assert.strictEqual(manager.rootState.activeSessions, 0);
	});

	test('restoreSession creates session in Ready state with pre-populated turns', () => {
		const turns = [
			{
				id: 'turn-1',
				userMessage: { text: 'hello' },
				responseParts: [{ kind: ResponsePartKind.Markdown, id: 'p1', content: 'world' } satisfies MarkdownResponsePart],
				usage: undefined,
				state: TurnState.Complete,
			},
		];

		const state = manager.restoreSession(makeSessionSummary(), turns);
		assert.strictEqual(state.lifecycle, SessionLifecycle.Ready);
		assert.strictEqual(state.turns.length, 1);
		assert.strictEqual(state.turns[0].userMessage.text, 'hello');
		assert.strictEqual((state.turns[0].responseParts[0] as MarkdownResponsePart).content, 'world');
	});

	test('restoreSession returns existing state for duplicate session', () => {
		manager.createSession(makeSessionSummary());
		const existing = manager.getSessionState(sessionUri);

		const state = manager.restoreSession(makeSessionSummary(), []);
		assert.strictEqual(state, existing);
	});

	test('restoreSession does not emit sessionAdded notification', () => {
		const notifications: INotification[] = [];
		disposables.add(manager.onDidEmitNotification(n => notifications.push(n)));

		manager.restoreSession(makeSessionSummary(), []);

		assert.strictEqual(notifications.length, 0, 'should not emit notification for restored sessions');
	});

	test('emits sessionSummaryChanged when summary changes', () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			manager.createSession(makeSessionSummary());
			manager.dispatchServerAction({ type: ActionType.SessionReady, session: sessionUri });

			const notifications: INotification[] = [];
			disposables.add(manager.onDidEmitNotification(n => notifications.push(n)));

			manager.dispatchServerAction({ type: ActionType.SessionTitleChanged, session: sessionUri, title: 'New Title' });

			// Should not fire synchronously (debounced)
			assert.strictEqual(notifications.filter(n => n.type === NotificationType.SessionSummaryChanged).length, 0);

			// Advance past debounce
			await new Promise(r => setTimeout(r, 150));

			const changed = notifications.filter(n => n.type === NotificationType.SessionSummaryChanged);
			assert.strictEqual(changed.length, 1);
			const notification = changed[0] as SessionSummaryChangedNotification;
			assert.strictEqual(notification.session, sessionUri);
			assert.strictEqual(notification.changes.title, 'New Title');
			assert.strictEqual(notification.changes.status, undefined, 'unchanged fields should be omitted');
		});
	});

	test('coalesces multiple summary changes into one notification', () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			manager.createSession(makeSessionSummary());
			manager.dispatchServerAction({ type: ActionType.SessionReady, session: sessionUri });

			const notifications: INotification[] = [];
			disposables.add(manager.onDidEmitNotification(n => notifications.push(n)));

			manager.dispatchServerAction({ type: ActionType.SessionTitleChanged, session: sessionUri, title: 'First' });
			manager.dispatchServerAction({ type: ActionType.SessionTitleChanged, session: sessionUri, title: 'Second' });

			await new Promise(r => setTimeout(r, 150));

			const changed = notifications.filter(n => n.type === NotificationType.SessionSummaryChanged);
			assert.strictEqual(changed.length, 1, 'should coalesce into one notification');
			assert.strictEqual((changed[0] as SessionSummaryChangedNotification).changes.title, 'Second');
		});
	});

	test('does not emit sessionSummaryChanged when summary is unchanged', () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			manager.createSession(makeSessionSummary());
			manager.dispatchServerAction({ type: ActionType.SessionReady, session: sessionUri });

			const notifications: INotification[] = [];
			disposables.add(manager.onDidEmitNotification(n => notifications.push(n)));

			// SessionReady changes lifecycle, not summary — so no summary notification
			await new Promise(r => setTimeout(r, 150));

			const changed = notifications.filter(n => n.type === NotificationType.SessionSummaryChanged);
			assert.strictEqual(changed.length, 0);
		});
	});

	test('does not emit sessionSummaryChanged for deleted session', () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			manager.createSession(makeSessionSummary());
			manager.dispatchServerAction({ type: ActionType.SessionReady, session: sessionUri });

			const notifications: INotification[] = [];
			disposables.add(manager.onDidEmitNotification(n => notifications.push(n)));

			manager.dispatchServerAction({ type: ActionType.SessionTitleChanged, session: sessionUri, title: 'New Title' });
			manager.deleteSession(sessionUri);

			await new Promise(r => setTimeout(r, 150));

			const changed = notifications.filter(n => n.type === NotificationType.SessionSummaryChanged);
			assert.strictEqual(changed.length, 0, 'should not emit for deleted sessions');
		});
	});
});

suite('Subagent URI helpers', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('buildSubagentSessionUri creates correct URI', () => {
		assert.strictEqual(
			buildSubagentSessionUri('copilot:/session-1', 'tc-1'),
			'copilot:/session-1/subagent/tc-1',
		);
	});

	test('parseSubagentSessionUri extracts parent and toolCallId', () => {
		const parsed = parseSubagentSessionUri('copilot:/session-1/subagent/tc-1');
		assert.deepStrictEqual(parsed, {
			parentSession: 'copilot:/session-1',
			toolCallId: 'tc-1',
		});
	});

	test('parseSubagentSessionUri returns undefined for non-subagent URIs', () => {
		assert.strictEqual(parseSubagentSessionUri('copilot:/session-1'), undefined);
	});

	test('isSubagentSession identifies subagent URIs', () => {
		assert.strictEqual(isSubagentSession('copilot:/session-1/subagent/tc-1'), true);
		assert.strictEqual(isSubagentSession('copilot:/session-1'), false);
	});
});
