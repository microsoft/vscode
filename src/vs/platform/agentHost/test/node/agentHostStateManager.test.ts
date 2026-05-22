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
import { SessionSummary, ResponsePartKind, ROOT_STATE_URI, SessionLifecycle, SessionStatus, TurnState, buildSubagentSessionUri, buildSubagentSessionUriPrefix, isSubagentSession, parseSubagentSessionUri, type MarkdownResponsePart, type SessionState } from '../../common/state/sessionState.js';
import { type SessionSummaryChangedParams } from '../../common/state/protocol/notifications.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { buildChangesetUri, buildSessionChangesetUri } from '../../common/changesetUri.js';

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

		manager.dispatchServerAction(sessionUri, {
			type: ActionType.SessionReady,
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

		manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });
		manager.dispatchServerAction(sessionUri, { type: ActionType.SessionTitleChanged, title: 'Updated' });

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
		manager.dispatchClientAction(sessionUri, { type: ActionType.SessionReady, },
			origin,
		);

		assert.strictEqual(envelopes.length, 1);
		assert.deepStrictEqual(envelopes[0].origin, origin);
	});

	test('root action that does not change state is not emitted', () => {
		const envelopes: ActionEnvelope[] = [];
		disposables.add(manager.onDidEmitEnvelope(e => envelopes.push(e)));

		// First dispatch: introduces a new value, should emit.
		manager.dispatchServerAction(ROOT_STATE_URI, {
			type: ActionType.RootConfigChanged,
			config: { 'my.setting': 'value-a' },
		});
		assert.strictEqual(envelopes.length, 1);
		assert.strictEqual(manager.serverSeq, 1);

		// Second dispatch with the same value: should be deduped and not emit.
		manager.dispatchServerAction(ROOT_STATE_URI, {
			type: ActionType.RootConfigChanged,
			config: { 'my.setting': 'value-a' },
		});
		assert.strictEqual(envelopes.length, 1);
		assert.strictEqual(manager.serverSeq, 1, 'serverSeq must not advance on a no-op');

		// Third dispatch with a deeply-equal but newly allocated object value:
		// should also be deduped.
		manager.dispatchServerAction(ROOT_STATE_URI, {
			type: ActionType.RootConfigChanged,
			config: { 'my.nested': { allow: ['x'], deny: [] } },
		});
		assert.strictEqual(envelopes.length, 2);
		assert.strictEqual(manager.serverSeq, 2);
		manager.dispatchServerAction(ROOT_STATE_URI, {
			type: ActionType.RootConfigChanged,
			config: { 'my.nested': { allow: ['x'], deny: [] } },
		});
		assert.strictEqual(envelopes.length, 2);
		assert.strictEqual(manager.serverSeq, 2, 'serverSeq must not advance on a no-op');

		// Real change still emits.
		manager.dispatchServerAction(ROOT_STATE_URI, {
			type: ActionType.RootConfigChanged,
			config: { 'my.setting': 'value-b' },
		});
		assert.strictEqual(envelopes.length, 3);
		assert.strictEqual(manager.serverSeq, 3);
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
		manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });

		assert.strictEqual(manager.getActiveTurnId(sessionUri), undefined);

		manager.dispatchServerAction(sessionUri, {
			type: ActionType.SessionTurnStarted,
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
		manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });

		const envelopes: ActionEnvelope[] = [];
		disposables.add(manager.onDidEmitEnvelope(e => envelopes.push(e)));

		manager.dispatchServerAction(sessionUri, {
			type: ActionType.SessionTurnStarted,
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
		manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });
		manager.dispatchServerAction(sessionUri, {
			type: ActionType.SessionTurnStarted,
			turnId: 'turn-1',
			userMessage: { text: 'hello' },
		});

		const envelopes: ActionEnvelope[] = [];
		disposables.add(manager.onDidEmitEnvelope(e => envelopes.push(e)));

		manager.dispatchServerAction(sessionUri, {
			type: ActionType.SessionTurnComplete,
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
		manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });
		manager.dispatchServerAction(session2Uri, { type: ActionType.SessionReady, });

		manager.dispatchServerAction(sessionUri, {
			type: ActionType.SessionTurnStarted,
			turnId: 'turn-1',
			userMessage: { text: 'a' },
		});
		manager.dispatchServerAction(session2Uri, {
			type: ActionType.SessionTurnStarted,
			turnId: 'turn-2',
			userMessage: { text: 'b' },
		});
		assert.strictEqual(manager.rootState.activeSessions, 2);

		manager.dispatchServerAction(sessionUri, {
			type: ActionType.SessionTurnComplete,
			turnId: 'turn-1',
		});
		assert.strictEqual(manager.rootState.activeSessions, 1);

		manager.dispatchServerAction(session2Uri, {
			type: ActionType.SessionTurnComplete,
			turnId: 'turn-2',
		});
		assert.strictEqual(manager.rootState.activeSessions, 0);
	});

	test('removeSession decrements active sessions when an active turn is stranded', () => {
		manager.createSession(makeSessionSummary());
		manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });
		manager.dispatchServerAction(sessionUri, {
			type: ActionType.SessionTurnStarted,
			turnId: 'turn-1',
			userMessage: { text: 'hello' },
		});
		assert.strictEqual(manager.rootState.activeSessions, 1);

		const envelopes: ActionEnvelope[] = [];
		disposables.add(manager.onDidEmitEnvelope(e => envelopes.push(e)));

		// Evict the session while a turn is still active. The active-sessions
		// count must drop to zero so that the server lifetime tracker (driving
		// `--enable-remote-auto-shutdown`) releases its hold.
		manager.removeSession(sessionUri);

		assert.strictEqual(manager.rootState.activeSessions, 0);
		const activeChanged = envelopes.filter(e => e.action.type === ActionType.RootActiveSessionsChanged);
		assert.strictEqual(activeChanged.length, 1);
		assert.strictEqual((activeChanged[0].action as { activeSessions: number }).activeSessions, 0);
	});

	test('removeSession does not dispatch active-sessions change when no turn is active', () => {
		manager.createSession(makeSessionSummary());
		manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });

		const envelopes: ActionEnvelope[] = [];
		disposables.add(manager.onDidEmitEnvelope(e => envelopes.push(e)));

		manager.removeSession(sessionUri);

		const activeChanged = envelopes.filter(e => e.action.type === ActionType.RootActiveSessionsChanged);
		assert.strictEqual(activeChanged.length, 0);
	});

	test('stale SessionTurnComplete (wrong turnId) does not decrement active sessions', () => {
		// The reducer's `endTurn` no-ops when the action's turnId doesn't match
		// `state.activeTurn.id`. The active-session count must follow suit so
		// the lifetime tracker doesn't release its hold while a turn is still
		// genuinely running.
		manager.createSession(makeSessionSummary());
		manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });
		manager.dispatchServerAction(sessionUri, {
			type: ActionType.SessionTurnStarted,
			turnId: 'turn-1',
			userMessage: { text: 'hello' },
		});
		assert.strictEqual(manager.rootState.activeSessions, 1);

		manager.dispatchServerAction(sessionUri, {
			type: ActionType.SessionTurnComplete,
			turnId: 'stale-turn',
		});

		assert.strictEqual(manager.rootState.activeSessions, 1);
		assert.strictEqual(manager.hasActiveSessions, true);
	});

	test('concurrent SessionTurnStarted on same session keeps active count at one', () => {
		// The reducer unconditionally overwrites `activeTurn`, so two starts
		// without an intervening complete still represent a single active turn
		// from state's point of view. The count must mirror that.
		manager.createSession(makeSessionSummary());
		manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });
		manager.dispatchServerAction(sessionUri, {
			type: ActionType.SessionTurnStarted,
			turnId: 'turn-1',
			userMessage: { text: 'a' },
		});
		manager.dispatchServerAction(sessionUri, {
			type: ActionType.SessionTurnStarted,
			turnId: 'turn-2',
			userMessage: { text: 'b' },
		});

		assert.strictEqual(manager.rootState.activeSessions, 1);

		manager.dispatchServerAction(sessionUri, {
			type: ActionType.SessionTurnComplete,
			turnId: 'turn-2',
		});

		assert.strictEqual(manager.rootState.activeSessions, 0);
		assert.strictEqual(manager.hasActiveSessions, false);
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
			manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });

			const notifications: INotification[] = [];
			disposables.add(manager.onDidEmitNotification(n => notifications.push(n)));

			manager.dispatchServerAction(sessionUri, { type: ActionType.SessionTitleChanged, title: 'New Title' });

			// Should not fire synchronously (debounced)
			assert.strictEqual(notifications.filter(n => n.type === NotificationType.SessionSummaryChanged).length, 0);

			// Advance past debounce
			await new Promise(r => setTimeout(r, 150));

			const changed = notifications.filter(n => n.type === NotificationType.SessionSummaryChanged);
			assert.strictEqual(changed.length, 1);
			const notification = changed[0] as SessionSummaryChangedParams;
			assert.strictEqual(notification.session, sessionUri);
			assert.strictEqual(notification.changes.title, 'New Title');
			assert.strictEqual(notification.changes.status, undefined, 'unchanged fields should be omitted');
		});
	});

	test('coalesces multiple summary changes into one notification', () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			manager.createSession(makeSessionSummary());
			manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });

			const notifications: INotification[] = [];
			disposables.add(manager.onDidEmitNotification(n => notifications.push(n)));

			manager.dispatchServerAction(sessionUri, { type: ActionType.SessionTitleChanged, title: 'First' });
			manager.dispatchServerAction(sessionUri, { type: ActionType.SessionTitleChanged, title: 'Second' });

			await new Promise(r => setTimeout(r, 150));

			const changed = notifications.filter(n => n.type === NotificationType.SessionSummaryChanged);
			assert.strictEqual(changed.length, 1, 'should coalesce into one notification');
			assert.strictEqual((changed[0] as SessionSummaryChangedParams).changes.title, 'Second');
		});
	});

	test('does not emit sessionSummaryChanged when summary is unchanged', () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			manager.createSession(makeSessionSummary());
			manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });

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
			manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });

			const notifications: INotification[] = [];
			disposables.add(manager.onDidEmitNotification(n => notifications.push(n)));

			manager.dispatchServerAction(sessionUri, { type: ActionType.SessionTitleChanged, title: 'New Title' });
			manager.deleteSession(sessionUri);

			await new Promise(r => setTimeout(r, 150));

			const changed = notifications.filter(n => n.type === NotificationType.SessionSummaryChanged);
			assert.strictEqual(changed.length, 0, 'should not emit for deleted sessions');
		});
	});

	test('removeSession flushes pending status=Idle notification before eviction', () => {
		// Regression: when _maybeEvictIdleSession calls removeSession within the
		// 100 ms scheduler window after a turn completes, the client must still
		// receive a SessionSummaryChanged with status=Idle so the spinner clears.
		//
		// The key precondition is that _lastNotifiedSummaries already has
		// status=InProgress (the scheduler must have fired after TurnStarted so
		// the client knows the session is busy). Then TurnComplete flips the
		// summary back to Idle and schedules another flush. If removeSession
		// races with that 100 ms window the flush must happen synchronously.
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			manager.createSession(makeSessionSummary());
			manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });

			// Start a turn → status becomes InProgress.
			manager.dispatchServerAction(sessionUri, {
				type: ActionType.SessionTurnStarted,
				turnId: 'turn-1',
				userMessage: { text: 'hello' },
			});

			// Let the scheduler fire so _lastNotifiedSummaries now has status=InProgress.
			await new Promise(r => setTimeout(r, 150));

			const notifications: INotification[] = [];
			disposables.add(manager.onDidEmitNotification(n => notifications.push(n)));

			// Turn completes — status flips back to Idle. This schedules a summary
			// flush 100 ms later but we will call removeSession before it fires.
			manager.dispatchServerAction(sessionUri, {
				type: ActionType.SessionTurnComplete,
				turnId: 'turn-1',
			});

			// Simulate eviction within the 100 ms debounce window.
			manager.removeSession(sessionUri);

			const changed = notifications.filter(n => n.type === NotificationType.SessionSummaryChanged) as SessionSummaryChangedParams[];
			assert.strictEqual(changed.length, 1, 'should emit SessionSummaryChanged synchronously in removeSession');
			assert.strictEqual(changed[0].changes.status, SessionStatus.Idle, 'status should be Idle so the spinner clears');
		});
	});
	test('disposeChangeset emits ChangesetCleared and removes the state', () => {
		manager.createSession(makeSessionSummary());
		const changeset = manager.registerChangeset(buildSessionChangesetUri(sessionUri));

		const envelopes: ActionEnvelope[] = [];
		disposables.add(manager.onDidEmitEnvelope(e => envelopes.push(e)));

		manager.disposeChangeset(changeset);

		const cleared = envelopes.filter(e => e.action.type === ActionType.ChangesetCleared);
		assert.strictEqual(cleared.length, 1, 'expected exactly one cleared envelope');
		assert.strictEqual(cleared[0].channel, changeset);
		assert.strictEqual(manager.getChangesetState(changeset), undefined, 'state should be deleted');
	});

	test('producer-emitted ChangesetCleared keeps the state alive (recompute path)', () => {
		manager.createSession(makeSessionSummary());
		const changeset = manager.registerChangeset(buildSessionChangesetUri(sessionUri));
		manager.dispatchServerAction(changeset, {
			type: ActionType.ChangesetFileSet,
			file: {
				id: 'file:///a.ts',
				edit: { after: { uri: 'file:///a.ts', content: { uri: 'file:///a.ts' } }, diff: { added: 1, removed: 0 } },
			},
		});
		assert.strictEqual(manager.getChangesetState(changeset)?.files.length, 1);

		manager.dispatchServerAction(changeset, {
			type: ActionType.ChangesetCleared,
		});

		const after = manager.getChangesetState(changeset);
		assert.ok(after, 'state should still exist');
		assert.strictEqual(after.files.length, 0, 'files should be cleared');
	});

	test('removeSession does NOT dispose per-session changesets (LRU eviction must not clear list-view chip)', () => {
		// Regression: _maybeEvictIdleSession calls removeSession to drop an
		// idle session from the in-memory cache. The Agents Window list view
		// keeps a per-row changeset subscription open to render the diff
		// chip, so cascading disposeSessionChangesets here would emit a
		// ChangesetCleared envelope that empties the chip while the row is
		// still on screen. The chip then visibly vanishes and only reappears
		// when the user clicks back into the session and the list re-seeds
		// the changeset.
		manager.createSession(makeSessionSummary());
		const changeset = manager.registerChangeset(buildSessionChangesetUri(sessionUri));
		manager.dispatchServerAction(changeset, {
			type: ActionType.ChangesetFileSet,
			file: {
				id: 'file:///a.ts',
				edit: { after: { uri: 'file:///a.ts', content: { uri: 'file:///a.ts' } }, diff: { added: 1, removed: 0 } },
			},
		});

		const envelopes: ActionEnvelope[] = [];
		disposables.add(manager.onDidEmitEnvelope(e => envelopes.push(e)));

		manager.removeSession(sessionUri);

		const cleared = envelopes.filter(e => e.action.type === ActionType.ChangesetCleared);
		assert.strictEqual(cleared.length, 0, 'removeSession must not emit ChangesetCleared');
		assert.strictEqual(manager.getChangesetState(changeset)?.files.length, 1, 'changeset state should survive eviction');
	});

	test('deleteSession disposes per-session changesets before emitting SessionRemoved', () => {
		manager.createSession(makeSessionSummary());
		const changeset = manager.registerChangeset(buildSessionChangesetUri(sessionUri));
		manager.dispatchServerAction(changeset, {
			type: ActionType.ChangesetFileSet,
			file: {
				id: 'file:///a.ts',
				edit: { after: { uri: 'file:///a.ts', content: { uri: 'file:///a.ts' } }, diff: { added: 1, removed: 0 } },
			},
		});

		const envelopes: ActionEnvelope[] = [];
		const notifications: INotification[] = [];
		disposables.add(manager.onDidEmitEnvelope(e => envelopes.push(e)));
		disposables.add(manager.onDidEmitNotification(n => notifications.push(n)));

		manager.deleteSession(sessionUri);

		const cleared = envelopes.filter(e => e.action.type === ActionType.ChangesetCleared);
		const removed = notifications.filter(n => n.type === NotificationType.SessionRemoved);
		assert.strictEqual(cleared.length, 1, 'deleteSession should emit ChangesetCleared');
		assert.strictEqual(removed.length, 1, 'deleteSession should emit SessionRemoved');
		assert.strictEqual(manager.getChangesetState(changeset), undefined, 'changeset state should be gone after delete');
	});

	test('unknown changeset action is ignored without emitting an envelope', () => {
		manager.createSession(makeSessionSummary());
		const changesetUri = `${sessionUri}/changeset/missing`;

		const envelopes: ActionEnvelope[] = [];
		disposables.add(manager.onDidEmitEnvelope(e => envelopes.push(e)));
		const seqBefore = manager.serverSeq;

		manager.dispatchServerAction(changesetUri, {
			type: ActionType.ChangesetFileSet,
			file: {
				id: 'file:///x.ts',
				edit: { after: { uri: 'file:///x.ts', content: { uri: 'file:///x.ts' } }, diff: { added: 1, removed: 0 } }
			},
		});

		assert.deepStrictEqual(
			{
				envelopeCount: envelopes.length,
				seqAdvanced: manager.serverSeq - seqBefore,
				changesetState: manager.getChangesetState(changesetUri),
			},
			{
				envelopeCount: 0,
				seqAdvanced: 0,
				changesetState: undefined,
			},
		);

		// Sanity: registering the same URI and re-dispatching produces an
		// envelope and advances the seq, proving the early return doesn't
		// break valid changesets.
		const registered = manager.registerChangeset(buildChangesetUri(sessionUri, 'missing'));
		assert.strictEqual(registered, changesetUri);
		manager.dispatchServerAction(changesetUri, {
			type: ActionType.ChangesetFileSet,
			file: {
				id: 'file:///x.ts',
				edit: { after: { uri: 'file:///x.ts', content: { uri: 'file:///x.ts' } }, diff: { added: 1, removed: 0 } }
			},
		});
		assert.strictEqual(envelopes.length, 1, 'registered changeset action should emit an envelope');
		assert.strictEqual(manager.serverSeq - seqBefore, 1, 'serverSeq should advance for registered changeset action');
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

	test('buildSubagentSessionUri preserves parent URI path shape', () => {
		assert.strictEqual(
			buildSubagentSessionUri('copilot:/session-1//nested/../kept', 'tc-1'),
			'copilot:/session-1//nested/../kept/subagent/tc-1',
		);
	});

	test('parseSubagentSessionUri extracts parent and toolCallId', () => {
		const parsed = parseSubagentSessionUri('copilot:/session-1/subagent/tc-1');
		assert.deepStrictEqual(parsed && {
			parentSession: parsed.parentSession.toString(),
			toolCallId: parsed.toolCallId,
		}, {
			parentSession: 'copilot:/session-1',
			toolCallId: 'tc-1',
		});
	});

	test('parseSubagentSessionUri handles nested subagent URIs', () => {
		const parsed = parseSubagentSessionUri('copilot:/session-1/subagent/tc-1/subagent/tc-2');
		assert.deepStrictEqual(parsed && {
			parentSession: parsed.parentSession.toString(),
			toolCallId: parsed.toolCallId,
		}, {
			parentSession: 'copilot:/session-1/subagent/tc-1',
			toolCallId: 'tc-2',
		});
	});

	test('parseSubagentSessionUri returns undefined for non-subagent URIs', () => {
		assert.strictEqual(parseSubagentSessionUri('copilot:/session-1'), undefined);
	});

	test('isSubagentSession identifies subagent URIs', () => {
		assert.strictEqual(isSubagentSession('copilot:/session-1/subagent/tc-1'), true);
		assert.strictEqual(isSubagentSession('copilot:/session-1'), false);
	});

	test('buildSubagentSessionUriPrefix creates state manager prefix', () => {
		assert.strictEqual(
			buildSubagentSessionUriPrefix('copilot:/session-1'),
			'copilot:/session-1/subagent/',
		);
	});

	test('buildSubagentSessionUriPrefix preserves parent URI path shape', () => {
		assert.strictEqual(
			buildSubagentSessionUriPrefix('copilot:/session-1//nested/../kept'),
			'copilot:/session-1//nested/../kept/subagent/',
		);
	});
});
