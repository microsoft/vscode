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
import { MessageKind, SessionSummary, ResponsePartKind, ROOT_STATE_URI, SessionLifecycle, SessionStatus, TurnState, buildChatUri, buildDefaultChatUri, buildSubagentSessionUri, buildSubagentSessionUriPrefix, isSubagentSession, mergeSessionWithDefaultChat, parseSubagentSessionUri, readHostBuildInfo, type ChatState, type MarkdownResponsePart, type SessionState } from '../../common/state/sessionState.js';
import { type SessionSummaryChangedParams } from '../../common/state/protocol/notifications.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { buildChangesetUri, buildSessionChangesetUri } from '../../common/changesetUri.js';

suite('AgentHostStateManager', () => {

	let disposables: DisposableStore;
	let manager: AgentHostStateManager;
	const sessionUri = URI.from({ scheme: 'copilot', path: '/test-session' }).toString();
	const sessionChatUri = buildDefaultChatUri(sessionUri);

	function makeSessionSummary(resource?: string): SessionSummary {
		return {
			resource: resource ?? sessionUri,
			provider: 'copilot',
			title: 'Test',
			status: SessionStatus.Idle,
			createdAt: new Date().toISOString(),
			modifiedAt: new Date().toISOString(),
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
		const chatState = manager.getDefaultChatState(sessionUri);
		assert.strictEqual(chatState?.turns.length, 0);
		assert.strictEqual(chatState?.activeTurn, undefined);
		assert.strictEqual(manager.getSessionSummary(sessionUri)?.resource.toString(), sessionUri.toString());
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

	test('seeds host build info into root state _meta when provided', () => {
		const buildInfo = { version: '1.96.0', commit: 'abc1234', date: '2024-01-02T03:04:05Z', quality: 'insider' };
		const localManager = disposables.add(new AgentHostStateManager(new NullLogService(), { hostBuildInfo: buildInfo }));
		assert.deepStrictEqual(readHostBuildInfo(localManager.rootState), buildInfo);
	});

	test('omits host build info from root state _meta when not provided', () => {
		assert.strictEqual(readHostBuildInfo(manager.rootState), undefined);
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

	test('default chat inherits the session working directory resolved at materialization', () => {
		// A deferred (provisional) session is created with a pre-materialization
		// working directory; materialization later resolves it to a different
		// one (e.g. a git worktree) via markSessionPersisted. The default chat
		// has no per-chat working-directory override, so getSessionState must
		// project the RESOLVED session working directory, never the stale
		// create-time value that was seeded onto the default chat.
		manager.createSession({ ...makeSessionSummary(), workingDirectory: 'file:///provisional' }, { emitNotification: false });
		manager.markSessionPersisted(sessionUri, { ...makeSessionSummary(), workingDirectory: 'file:///resolved-worktree' });

		assert.deepStrictEqual({
			session: manager.getSessionState(sessionUri)?.workingDirectory,
			defaultChat: manager.getSessionState(sessionChatUri)?.workingDirectory,
		}, {
			session: 'file:///resolved-worktree',
			defaultChat: 'file:///resolved-worktree',
		});
	});

	test('getActiveTurnId returns active turn id after turnStarted', () => {
		manager.createSession(makeSessionSummary());
		manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });

		assert.strictEqual(manager.getActiveTurnId(sessionUri), undefined);

		manager.dispatchServerAction(sessionChatUri, {
			type: ActionType.ChatTurnStarted,
			turnId: 'turn-1',
			message: { text: 'hello', origin: { kind: MessageKind.User } },
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

		manager.dispatchServerAction(sessionChatUri, {
			type: ActionType.ChatTurnStarted,
			turnId: 'turn-1',
			message: { text: 'hello', origin: { kind: MessageKind.User } },
		});

		const activeChanged = envelopes.filter(e => e.action.type === ActionType.RootActiveSessionsChanged);
		assert.strictEqual(activeChanged.length, 1);
		assert.strictEqual((activeChanged[0].action as { activeSessions: number }).activeSessions, 1);
		assert.strictEqual(manager.rootState.activeSessions, 1);
	});

	test('turnComplete dispatches root/activeSessionsChanged back to 0', () => {
		manager.createSession(makeSessionSummary());
		manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });
		manager.dispatchServerAction(sessionChatUri, {
			type: ActionType.ChatTurnStarted,
			turnId: 'turn-1',
			message: { text: 'hello', origin: { kind: MessageKind.User } },
		});

		const envelopes: ActionEnvelope[] = [];
		disposables.add(manager.onDidEmitEnvelope(e => envelopes.push(e)));

		manager.dispatchServerAction(sessionChatUri, {
			type: ActionType.ChatTurnComplete,
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

		manager.dispatchServerAction(sessionChatUri, {
			type: ActionType.ChatTurnStarted,
			turnId: 'turn-1',
			message: { text: 'a', origin: { kind: MessageKind.User } },
		});
		manager.dispatchServerAction(buildDefaultChatUri(session2Uri), {
			type: ActionType.ChatTurnStarted,
			turnId: 'turn-2',
			message: { text: 'b', origin: { kind: MessageKind.User } },
		});
		assert.strictEqual(manager.rootState.activeSessions, 2);

		manager.dispatchServerAction(sessionChatUri, {
			type: ActionType.ChatTurnComplete,
			turnId: 'turn-1',
		});
		assert.strictEqual(manager.rootState.activeSessions, 1);

		manager.dispatchServerAction(buildDefaultChatUri(session2Uri), {
			type: ActionType.ChatTurnComplete,
			turnId: 'turn-2',
		});
		assert.strictEqual(manager.rootState.activeSessions, 0);
	});

	test('removeSession decrements active sessions when an active turn is stranded', () => {
		manager.createSession(makeSessionSummary());
		manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });
		manager.dispatchServerAction(sessionChatUri, {
			type: ActionType.ChatTurnStarted,
			turnId: 'turn-1',
			message: { text: 'hello', origin: { kind: MessageKind.User } },
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

	test('stale ChatTurnComplete (wrong turnId) does not decrement active sessions', () => {
		// The reducer's `endTurn` no-ops when the action's turnId doesn't match
		// `state.activeTurn.id`. The active-session count must follow suit so
		// the lifetime tracker doesn't release its hold while a turn is still
		// genuinely running.
		manager.createSession(makeSessionSummary());
		manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });
		manager.dispatchServerAction(sessionChatUri, {
			type: ActionType.ChatTurnStarted,
			turnId: 'turn-1',
			message: { text: 'hello', origin: { kind: MessageKind.User } },
		});
		assert.strictEqual(manager.rootState.activeSessions, 1);

		manager.dispatchServerAction(sessionChatUri, {
			type: ActionType.ChatTurnComplete,
			turnId: 'stale-turn',
		});

		assert.strictEqual(manager.rootState.activeSessions, 1);
		assert.strictEqual(manager.hasActiveSessions, true);
	});

	test('concurrent ChatTurnStarted on same session keeps active count at one', () => {
		// The reducer unconditionally overwrites `activeTurn`, so two starts
		// without an intervening complete still represent a single active turn
		// from state's point of view. The count must mirror that.
		manager.createSession(makeSessionSummary());
		manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });
		manager.dispatchServerAction(sessionChatUri, {
			type: ActionType.ChatTurnStarted,
			turnId: 'turn-1',
			message: { text: 'a', origin: { kind: MessageKind.User } },
		});
		manager.dispatchServerAction(sessionChatUri, {
			type: ActionType.ChatTurnStarted,
			turnId: 'turn-2',
			message: { text: 'b', origin: { kind: MessageKind.User } },
		});

		assert.strictEqual(manager.rootState.activeSessions, 1);

		manager.dispatchServerAction(sessionChatUri, {
			type: ActionType.ChatTurnComplete,
			turnId: 'turn-2',
		});

		assert.strictEqual(manager.rootState.activeSessions, 0);
		assert.strictEqual(manager.hasActiveSessions, false);
	});

	test('active turn event follows reducer-derived active state transitions', () => {
		manager.createSession(makeSessionSummary());
		manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });
		const events: Array<{ session: string; active: boolean }> = [];
		disposables.add(manager.onDidChangeSessionActiveTurn(e => events.push(e)));

		manager.dispatchServerAction(sessionChatUri, {
			type: ActionType.ChatTurnStarted,
			turnId: 'turn-1',
			message: { text: 'hello', origin: { kind: MessageKind.User } },
		});
		manager.dispatchServerAction(sessionChatUri, {
			type: ActionType.ChatTurnComplete,
			turnId: 'stale-turn',
		});
		manager.dispatchServerAction(sessionChatUri, {
			type: ActionType.ChatError,
			turnId: 'turn-1',
			error: { errorType: 'failed', message: 'boom' },
		});

		assert.deepStrictEqual(events, [
			{ session: sessionUri, active: true },
			{ session: sessionUri, active: false },
		]);
	});

	test('active turn event covers cancellation and removal while active', () => {
		const session2Uri = URI.from({ scheme: 'copilot', path: '/test-session-2' }).toString();
		manager.createSession(makeSessionSummary(sessionUri));
		manager.createSession(makeSessionSummary(session2Uri));
		manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });
		manager.dispatchServerAction(session2Uri, { type: ActionType.SessionReady, });
		const events: Array<{ session: string; active: boolean }> = [];
		disposables.add(manager.onDidChangeSessionActiveTurn(e => events.push(e)));

		manager.dispatchServerAction(sessionChatUri, {
			type: ActionType.ChatTurnStarted,
			turnId: 'turn-1',
			message: { text: 'hello', origin: { kind: MessageKind.User } },
		});
		manager.dispatchServerAction(sessionChatUri, {
			type: ActionType.ChatTurnCancelled,
			turnId: 'turn-1',
		});
		manager.dispatchServerAction(buildDefaultChatUri(session2Uri), {
			type: ActionType.ChatTurnStarted,
			turnId: 'turn-2',
			message: { text: 'hi', origin: { kind: MessageKind.User } },
		});
		manager.removeSession(session2Uri);

		assert.deepStrictEqual(events, [
			{ session: sessionUri, active: true },
			{ session: sessionUri, active: false },
			{ session: session2Uri, active: true },
			{ session: session2Uri, active: false },
		]);
	});

	test('restoreSession creates session in Ready state with pre-populated turns', () => {
		const turns = [
			{
				id: 'turn-1',
				message: { text: 'hello', origin: { kind: MessageKind.User } },
				responseParts: [{ kind: ResponsePartKind.Markdown, id: 'p1', content: 'world' } satisfies MarkdownResponsePart],
				usage: undefined,
				state: TurnState.Complete,
			},
		];

		const state = manager.restoreSession(makeSessionSummary(), turns);
		assert.strictEqual(state.lifecycle, SessionLifecycle.Ready);
		const chatState = manager.getDefaultChatState(sessionUri);
		assert.strictEqual(chatState?.turns.length, 1);
		assert.strictEqual(chatState?.turns[0].message.text, 'hello');
		assert.strictEqual((chatState?.turns[0].responseParts[0] as MarkdownResponsePart).content, 'world');
	});

	test('restoreSession returns existing state for duplicate session', () => {
		const existing = manager.createSession(makeSessionSummary());

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
			manager.dispatchServerAction(sessionChatUri, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				message: { text: 'hello', origin: { kind: MessageKind.User } },
			});

			// Let the scheduler fire so _lastNotifiedSummaries now has status=InProgress.
			await new Promise(r => setTimeout(r, 150));

			const notifications: INotification[] = [];
			disposables.add(manager.onDidEmitNotification(n => notifications.push(n)));

			// Turn completes — status flips back to Idle. This schedules a summary
			// flush 100 ms later but we will call removeSession before it fires.
			manager.dispatchServerAction(sessionChatUri, {
				type: ActionType.ChatTurnComplete,
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

	suite('multi-chat catalog', () => {
		const peerChat = buildChatUri(sessionUri, 'peer-1');

		test('addChat grows the catalog, creates chat state and emits SessionChatAdded', () => {
			manager.createSession(makeSessionSummary());
			const envelopes: ActionEnvelope[] = [];
			disposables.add(manager.onDidEmitEnvelope(e => envelopes.push(e)));

			const summary = manager.addChat(sessionUri, peerChat, { title: 'Peer' });

			assert.deepStrictEqual(
				{
					addedTitle: summary?.title,
					chatResources: manager.getSessionState(sessionUri)?.chats.map(c => c.resource.toString()).sort(),
					peerTurns: manager.getChatState(peerChat)?.turns.length,
					chatAddedEvents: envelopes.filter(e => e.action.type === ActionType.SessionChatAdded).length,
				},
				{
					addedTitle: 'Peer',
					chatResources: [buildDefaultChatUri(sessionUri), peerChat].sort(),
					peerTurns: 0,
					chatAddedEvents: 1,
				},
			);
		});

		test('removeChat shrinks the catalog and refuses the default chat', () => {
			manager.createSession(makeSessionSummary());
			manager.addChat(sessionUri, peerChat);

			manager.removeChat(sessionUri, buildDefaultChatUri(sessionUri));
			const afterDefaultRemoval = manager.getSessionState(sessionUri)?.chats.length;

			manager.removeChat(sessionUri, peerChat);

			assert.deepStrictEqual(
				{
					afterDefaultRemoval,
					afterPeerRemoval: manager.getSessionState(sessionUri)?.chats.map(c => c.resource.toString()),
					peerState: manager.getChatState(peerChat),
				},
				{
					afterDefaultRemoval: 2,
					afterPeerRemoval: [buildDefaultChatUri(sessionUri)],
					peerState: undefined,
				},
			);
		});

		test('session title and default chat title stay independent once multi-chat', () => {
			manager.createSession(makeSessionSummary());
			const defaultChat = buildDefaultChatUri(sessionUri);

			// Becoming multi-chat snapshots the session title onto the default chat
			// so it stops inheriting the session title.
			manager.addChat(sessionUri, peerChat);
			const afterAdd = manager.getSessionState(sessionUri)?.chats.find(c => c.resource === defaultChat)?.title;

			// Rename each independently.
			manager.updateChatTitle(sessionUri, defaultChat, 'Chat A');
			manager.dispatchServerAction(sessionUri, { type: ActionType.SessionTitleChanged, title: 'Session B' });

			const state = manager.getSessionState(sessionUri);
			assert.deepStrictEqual(
				{
					afterAdd,
					sessionTitle: state?.title,
					defaultChatTitle: state?.chats.find(c => c.resource === defaultChat)?.title,
				},
				{
					afterAdd: 'Test',
					sessionTitle: 'Session B',
					defaultChatTitle: 'Chat A',
				},
			);
		});

		test('addChat is idempotent for an existing chat URI', () => {
			manager.createSession(makeSessionSummary());
			const first = manager.addChat(sessionUri, peerChat, { title: 'Peer' });

			const envelopes: ActionEnvelope[] = [];
			disposables.add(manager.onDidEmitEnvelope(e => envelopes.push(e)));

			const second = manager.addChat(sessionUri, peerChat, { title: 'Ignored' });

			assert.deepStrictEqual(
				{
					sameSummary: first === second,
					title: second?.title,
					chatCount: manager.getSessionState(sessionUri)?.chats.length,
					chatAddedEvents: envelopes.filter(e => e.action.type === ActionType.SessionChatAdded).length,
				},
				{
					sameSummary: true,
					title: 'Peer',
					chatCount: 2,
					chatAddedEvents: 0,
				},
			);
		});

		test('addChat for an unknown session is a no-op', () => {
			const envelopes: ActionEnvelope[] = [];
			disposables.add(manager.onDidEmitEnvelope(e => envelopes.push(e)));

			const summary = manager.addChat('copilot:/missing', peerChat);

			assert.deepStrictEqual(
				{
					summary,
					events: envelopes.length,
				},
				{
					summary: undefined,
					events: 0,
				},
			);
		});

		test('addChat supports multiple peers and only snapshots the default title once', () => {
			manager.createSession(makeSessionSummary());
			const defaultChat = buildDefaultChatUri(sessionUri);
			const peerChat2 = buildChatUri(sessionUri, 'peer-2');

			manager.addChat(sessionUri, peerChat);
			// Rename the default chat away from the snapshotted session title.
			manager.updateChatTitle(sessionUri, defaultChat, 'Renamed Default');
			// Adding a second peer must not re-snapshot / clobber the default title.
			manager.addChat(sessionUri, peerChat2);

			const state = manager.getSessionState(sessionUri);
			assert.deepStrictEqual(
				{
					chatResources: state?.chats.map(c => c.resource.toString()).sort(),
					defaultChatTitle: state?.chats.find(c => c.resource === defaultChat)?.title,
				},
				{
					chatResources: [defaultChat, peerChat, peerChat2].sort(),
					defaultChatTitle: 'Renamed Default',
				},
			);
		});

		test('updateChatTitle on a peer leaves the session and default titles untouched', () => {
			manager.createSession(makeSessionSummary());
			const defaultChat = buildDefaultChatUri(sessionUri);
			manager.addChat(sessionUri, peerChat, { title: 'Peer' });

			manager.updateChatTitle(sessionUri, peerChat, 'Peer Renamed');

			const state = manager.getSessionState(sessionUri);
			assert.deepStrictEqual(
				{
					sessionTitle: state?.title,
					defaultChatTitle: state?.chats.find(c => c.resource === defaultChat)?.title,
					peerTitle: state?.chats.find(c => c.resource === peerChat)?.title,
					peerStateTitle: manager.getChatState(peerChat)?.title,
				},
				{
					sessionTitle: 'Test',
					defaultChatTitle: 'Test',
					peerTitle: 'Peer Renamed',
					peerStateTitle: 'Peer Renamed',
				},
			);
		});

		test('removeChat of an unknown chat is a no-op', () => {
			manager.createSession(makeSessionSummary());

			const envelopes: ActionEnvelope[] = [];
			disposables.add(manager.onDidEmitEnvelope(e => envelopes.push(e)));

			manager.removeChat(sessionUri, buildChatUri(sessionUri, 'never-added'));

			assert.deepStrictEqual(
				{
					chatCount: manager.getSessionState(sessionUri)?.chats.length,
					removedEvents: envelopes.filter(e => e.action.type === ActionType.SessionChatRemoved).length,
				},
				{
					chatCount: 1,
					removedEvents: 0,
				},
			);
		});

		test('removeChat emits SessionChatRemoved for a peer', () => {
			manager.createSession(makeSessionSummary());
			manager.addChat(sessionUri, peerChat);

			const envelopes: ActionEnvelope[] = [];
			disposables.add(manager.onDidEmitEnvelope(e => envelopes.push(e)));

			manager.removeChat(sessionUri, peerChat);

			assert.deepStrictEqual(
				{
					removed: envelopes
						.filter(e => e.action.type === ActionType.SessionChatRemoved)
						.map(e => (e.action as { chat: string }).chat),
					chatState: manager.getChatState(peerChat),
				},
				{
					removed: [peerChat],
					chatState: undefined,
				},
			);
		});

		test('hasActiveTurn reflects a chat turn lifecycle', () => {
			manager.createSession(makeSessionSummary());

			const idle = manager.hasActiveTurn(sessionUri);

			manager.dispatchServerAction(sessionChatUri, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				message: { text: 'a', origin: { kind: MessageKind.User } },
			});
			const afterStart = manager.hasActiveTurn(sessionUri);

			manager.dispatchServerAction(sessionChatUri, {
				type: ActionType.ChatTurnComplete,
				turnId: 'turn-1',
			});
			const afterComplete = manager.hasActiveTurn(sessionUri);

			assert.deepStrictEqual(
				{ idle, afterStart, afterComplete },
				{ idle: false, afterStart: true, afterComplete: false },
			);
		});

		test('active-turn event observers see the updated active-turn state', () => {
			// Operations are recomputed synchronously from the active-turn event,
			// so hasActiveTurn must already reflect the lifecycle change when that
			// event fires — otherwise operations would stay disabled at turn end.
			manager.createSession(makeSessionSummary());

			const observed: { active: boolean; hasActiveTurn: boolean }[] = [];
			disposables.add(manager.onDidChangeSessionActiveTurn(e => {
				observed.push({ active: e.active, hasActiveTurn: manager.hasActiveTurn(sessionUri) });
			}));

			manager.dispatchServerAction(sessionChatUri, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				message: { text: 'a', origin: { kind: MessageKind.User } },
			});
			manager.dispatchServerAction(sessionChatUri, {
				type: ActionType.ChatTurnComplete,
				turnId: 'turn-1',
			});

			assert.deepStrictEqual(observed, [
				{ active: true, hasActiveTurn: true },
				{ active: false, hasActiveTurn: false },
			]);
		});

		test('hasActiveTurn stays true until all concurrent chat turns finish', () => {
			manager.createSession(makeSessionSummary());
			const defaultChat = buildDefaultChatUri(sessionUri);
			manager.addChat(sessionUri, peerChat, { title: 'Peer' });

			const idle = manager.hasActiveTurn(sessionUri);

			// Start a turn on the default chat, then a concurrent turn on the peer.
			manager.dispatchServerAction(defaultChat, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-default',
				message: { text: 'a', origin: { kind: MessageKind.User } },
			});
			const afterDefaultStart = manager.hasActiveTurn(sessionUri);

			manager.dispatchServerAction(peerChat, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-peer',
				message: { text: 'b', origin: { kind: MessageKind.User } },
			});
			const afterBothStart = manager.hasActiveTurn(sessionUri);

			// Completing the default chat must NOT clear while the peer streams.
			manager.dispatchServerAction(defaultChat, {
				type: ActionType.ChatTurnComplete,
				turnId: 'turn-default',
			});
			const afterDefaultComplete = manager.hasActiveTurn(sessionUri);

			// Only once the peer finishes too does the session go idle.
			manager.dispatchServerAction(peerChat, {
				type: ActionType.ChatTurnComplete,
				turnId: 'turn-peer',
			});
			const afterBothComplete = manager.hasActiveTurn(sessionUri);

			assert.deepStrictEqual(
				{ idle, afterDefaultStart, afterBothStart, afterDefaultComplete, afterBothComplete },
				{ idle: false, afterDefaultStart: true, afterBothStart: true, afterDefaultComplete: true, afterBothComplete: false },
			);
		});

		test('a running peer chat promotes the session summary to InProgress while the default chat is idle', () => {
			manager.createSession(makeSessionSummary());
			const defaultChat = buildDefaultChatUri(sessionUri);
			manager.addChat(sessionUri, peerChat, { title: 'Peer' });

			const idle = manager.getSessionState(sessionUri)?.status;

			// Only the peer (sub) chat starts streaming; the default chat stays idle.
			manager.dispatchServerAction(peerChat, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-peer',
				message: { text: 'b', origin: { kind: MessageKind.User } },
			});
			const whilePeerRuns = manager.getSessionState(sessionUri)?.status;

			// Once the peer finishes the session falls back to idle.
			manager.dispatchServerAction(peerChat, {
				type: ActionType.ChatTurnComplete,
				turnId: 'turn-peer',
			});
			const afterPeerComplete = manager.getSessionState(sessionUri)?.status;

			assert.deepStrictEqual(
				{
					idleHasInProgress: ((idle ?? 0) & SessionStatus.InProgress) === SessionStatus.InProgress,
					whilePeerRunsHasInProgress: ((whilePeerRuns ?? 0) & SessionStatus.InProgress) === SessionStatus.InProgress,
					afterPeerCompleteHasInProgress: ((afterPeerComplete ?? 0) & SessionStatus.InProgress) === SessionStatus.InProgress,
					defaultChatStillIdle: ((manager.getChatState(defaultChat)?.status ?? SessionStatus.Idle) & SessionStatus.InProgress) === 0,
				},
				{
					idleHasInProgress: false,
					whilePeerRunsHasInProgress: true,
					afterPeerCompleteHasInProgress: false,
					defaultChatStillIdle: true,
				},
			);
		});

		test('a running peer chat forwards its own status to the session catalog so its tab can show progress', () => {
			manager.createSession(makeSessionSummary());
			manager.addChat(sessionUri, peerChat, { title: 'Peer' });

			const envelopes: ActionEnvelope[] = [];
			disposables.add(manager.onDidEmitEnvelope(e => envelopes.push(e)));

			const peerCatalogStatus = () => manager.getSessionState(sessionUri)?.chats.find(c => c.resource === peerChat)?.status ?? SessionStatus.Idle;
			const chatUpdatesForPeer = () => envelopes.filter(e => e.action.type === ActionType.SessionChatUpdated && (e.action as { chat: string }).chat === peerChat).length;

			const idleCatalog = peerCatalogStatus();

			manager.dispatchServerAction(peerChat, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-peer',
				message: { text: 'b', origin: { kind: MessageKind.User } },
			});
			const runningCatalog = peerCatalogStatus();
			const updatesAfterStart = chatUpdatesForPeer();

			manager.dispatchServerAction(peerChat, {
				type: ActionType.ChatTurnComplete,
				turnId: 'turn-peer',
			});

			assert.deepStrictEqual(
				{
					idleCatalogInProgress: (idleCatalog & SessionStatus.InProgress) === SessionStatus.InProgress,
					runningCatalogInProgress: (runningCatalog & SessionStatus.InProgress) === SessionStatus.InProgress,
					finalCatalogInProgress: (peerCatalogStatus() & SessionStatus.InProgress) === SessionStatus.InProgress,
					emittedChatUpdateOnStart: updatesAfterStart >= 1,
				},
				{
					idleCatalogInProgress: false,
					runningCatalogInProgress: true,
					finalCatalogInProgress: false,
					emittedChatUpdateOnStart: true,
				},
			);
		});

		test('active-turn event and active-session count flip once per session across concurrent chats', () => {
			manager.createSession(makeSessionSummary());
			const defaultChat = buildDefaultChatUri(sessionUri);
			manager.addChat(sessionUri, peerChat, { title: 'Peer' });

			const turnEvents: boolean[] = [];
			disposables.add(manager.onDidChangeSessionActiveTurn(e => turnEvents.push(e.active)));

			manager.dispatchServerAction(defaultChat, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-default',
				message: { text: 'a', origin: { kind: MessageKind.User } },
			});
			manager.dispatchServerAction(peerChat, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-peer',
				message: { text: 'b', origin: { kind: MessageKind.User } },
			});
			const activeWhileBothRun = manager.rootState.activeSessions;

			manager.dispatchServerAction(defaultChat, {
				type: ActionType.ChatTurnComplete,
				turnId: 'turn-default',
			});
			const activeAfterFirstCompletes = manager.rootState.activeSessions;

			manager.dispatchServerAction(peerChat, {
				type: ActionType.ChatTurnComplete,
				turnId: 'turn-peer',
			});

			assert.deepStrictEqual(
				{
					turnEvents,
					activeWhileBothRun,
					activeAfterFirstCompletes,
					activeAfterBothComplete: manager.rootState.activeSessions,
				},
				{
					// Exactly one true (first chat starts) and one false (last chat ends).
					turnEvents: [true, false],
					activeWhileBothRun: 1,
					activeAfterFirstCompletes: 1,
					activeAfterBothComplete: 0,
				},
			);
		});

		test('removeChat clears a peer chat that is removed mid-turn', () => {
			manager.createSession(makeSessionSummary());
			const defaultChat = buildDefaultChatUri(sessionUri);
			manager.addChat(sessionUri, peerChat, { title: 'Peer' });

			const turnEvents: boolean[] = [];
			disposables.add(manager.onDidChangeSessionActiveTurn(e => turnEvents.push(e.active)));

			// Both the default chat and the peer chat start a concurrent turn.
			manager.dispatchServerAction(defaultChat, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-default',
				message: { text: 'a', origin: { kind: MessageKind.User } },
			});
			manager.dispatchServerAction(peerChat, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-peer',
				message: { text: 'b', origin: { kind: MessageKind.User } },
			});
			const activeWhileBothRun = manager.hasActiveTurn(sessionUri);

			// Removing the peer mid-turn must not strand it in the active set:
			// the session stays active because the default chat still streams.
			manager.removeChat(sessionUri, peerChat);
			const activeAfterPeerRemoved = manager.hasActiveTurn(sessionUri);

			// Completing the default chat is now enough to flip the session idle.
			manager.dispatchServerAction(defaultChat, {
				type: ActionType.ChatTurnComplete,
				turnId: 'turn-default',
			});

			assert.deepStrictEqual(
				{
					turnEvents,
					activeWhileBothRun,
					activeAfterPeerRemoved,
					activeAfterDefaultComplete: manager.hasActiveTurn(sessionUri),
					activeSessions: manager.rootState.activeSessions,
				},
				{
					turnEvents: [true, false],
					activeWhileBothRun: true,
					activeAfterPeerRemoved: true,
					activeAfterDefaultComplete: false,
					activeSessions: 0,
				},
			);
		});

		test('removeChat flips the session idle when the removed peer held the last active turn', () => {
			manager.createSession(makeSessionSummary());
			manager.addChat(sessionUri, peerChat, { title: 'Peer' });

			const turnEvents: boolean[] = [];
			disposables.add(manager.onDidChangeSessionActiveTurn(e => turnEvents.push(e.active)));

			// Only the peer chat has an active turn.
			manager.dispatchServerAction(peerChat, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-peer',
				message: { text: 'b', origin: { kind: MessageKind.User } },
			});
			const activeWhilePeerRuns = manager.hasActiveTurn(sessionUri);

			// Removing that peer is the last active chat, so the session must
			// flip back to idle instead of staying permanently active.
			manager.removeChat(sessionUri, peerChat);

			assert.deepStrictEqual(
				{
					turnEvents,
					activeWhilePeerRuns,
					activeAfterPeerRemoved: manager.hasActiveTurn(sessionUri),
					activeSessions: manager.rootState.activeSessions,
				},
				{
					turnEvents: [true, false],
					activeWhilePeerRuns: true,
					activeAfterPeerRemoved: false,
					activeSessions: 0,
				},
			);
		});
	});

	// Characterization tests (task A3): pin down the *current* catalog behavior
	// — the default-chat pointer set up by `_ensureDefaultChat`, the
	// `restoreChat` re-registration path, and the rolled-up session summary
	// produced by the SessionSummaryNotifier — so the upcoming `providerData`
	// change cannot silently regress them.
	suite('catalog characterization (A3)', () => {
		const peerChat = buildChatUri(sessionUri, 'peer-1');

		test('_ensureDefaultChat seeds a single inheriting default chat and points defaultChat at it on createSession', () => {
			manager.createSession(makeSessionSummary());
			const state = manager.getSessionState(sessionUri);

			assert.deepStrictEqual(
				{
					defaultChat: state?.defaultChat,
					defaultChatIsDeterministic: state?.defaultChat === buildDefaultChatUri(sessionUri),
					chatResources: state?.chats.map(c => c.resource.toString()),
					// Empty title => the default chat inherits the session title for display.
					defaultChatTitle: state?.chats[0]?.title,
					defaultChatStatePresent: manager.getDefaultChatState(sessionUri) !== undefined,
				},
				{
					defaultChat: buildDefaultChatUri(sessionUri),
					defaultChatIsDeterministic: true,
					chatResources: [buildDefaultChatUri(sessionUri)],
					defaultChatTitle: '',
					defaultChatStatePresent: true,
				},
			);
		});

		test('_ensureDefaultChat seeds the default-chat pointer on restoreSession too', () => {
			const turns = [
				{
					id: 'turn-1',
					message: { text: 'hello', origin: { kind: MessageKind.User } },
					responseParts: [{ kind: ResponsePartKind.Markdown, id: 'p1', content: 'world' } satisfies MarkdownResponsePart],
					usage: undefined,
					state: TurnState.Complete,
				},
			];
			manager.restoreSession(makeSessionSummary(), turns);
			const state = manager.getSessionState(sessionUri);

			assert.deepStrictEqual(
				{
					defaultChat: state?.defaultChat,
					chatResources: state?.chats.map(c => c.resource.toString()),
					defaultChatTurns: manager.getDefaultChatState(sessionUri)?.turns.length,
				},
				{
					defaultChat: buildDefaultChatUri(sessionUri),
					chatResources: [buildDefaultChatUri(sessionUri)],
					defaultChatTurns: 1,
				},
			);
		});

		test('restoreChat re-registers a peer chat in place, seeding turns and draft without dispatching SessionChatAdded', () => {
			manager.restoreSession(makeSessionSummary(), []);

			const envelopes: ActionEnvelope[] = [];
			disposables.add(manager.onDidEmitEnvelope(e => envelopes.push(e)));

			const turns = [
				{
					id: 'peer-turn-1',
					message: { text: 'restored', origin: { kind: MessageKind.User } },
					responseParts: [{ kind: ResponsePartKind.Markdown, id: 'p1', content: 'history' } satisfies MarkdownResponsePart],
					usage: undefined,
					state: TurnState.Complete,
				},
			];
			const draft = { text: 'work in progress', origin: { kind: MessageKind.User } };
			manager.restoreChat(sessionUri, peerChat, { title: 'Restored Peer', turns, draft });

			const peerState = manager.getChatState(peerChat);
			assert.deepStrictEqual(
				{
					chatResources: manager.getSessionState(sessionUri)?.chats.map(c => c.resource.toString()).sort(),
					restoredTitle: manager.getSessionState(sessionUri)?.chats.find(c => c.resource === peerChat)?.title,
					peerTurns: peerState?.turns.length,
					peerDraft: peerState?.draft?.text,
					// restoreChat runs before clients subscribe, so it adds the
					// catalog entry in place rather than via a dispatched action.
					chatAddedEvents: envelopes.filter(e => e.action.type === ActionType.SessionChatAdded).length,
				},
				{
					chatResources: [buildDefaultChatUri(sessionUri), peerChat].sort(),
					restoredTitle: 'Restored Peer',
					peerTurns: 1,
					peerDraft: 'work in progress',
					chatAddedEvents: 0,
				},
			);
		});

		test('restoreChat is a no-op for an already-registered chat URI', () => {
			manager.createSession(makeSessionSummary());
			manager.addChat(sessionUri, peerChat, { title: 'Peer' });

			const turns = [
				{
					id: 'ignored-turn',
					message: { text: 'ignored', origin: { kind: MessageKind.User } },
					responseParts: [],
					usage: undefined,
					state: TurnState.Complete,
				},
			];
			manager.restoreChat(sessionUri, peerChat, { title: 'Ignored', turns });

			assert.deepStrictEqual(
				{
					chatCount: manager.getSessionState(sessionUri)?.chats.length,
					title: manager.getSessionState(sessionUri)?.chats.find(c => c.resource === peerChat)?.title,
					// The existing (empty) chat state is preserved; the supplied turns are dropped.
					peerTurns: manager.getChatState(peerChat)?.turns.length,
				},
				{
					chatCount: 2,
					title: 'Peer',
					peerTurns: 0,
				},
			);
		});

		test('restoreChat for an unknown session is a no-op', () => {
			manager.restoreChat('copilot:/missing', peerChat, { turns: [] });

			assert.strictEqual(manager.getChatState(peerChat), undefined);
		});

		test('SessionSummaryNotifier rolls a running peer chat up onto the session summary and emits one coalesced SessionSummaryChanged', () => {
			return runWithFakedTimers({ useFakeTimers: true }, async () => {
				manager.createSession(makeSessionSummary());
				manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
				manager.addChat(sessionUri, peerChat, { title: 'Peer' });

				const notifications: INotification[] = [];
				disposables.add(manager.onDidEmitNotification(n => notifications.push(n)));

				const summaryHasInProgress = () => ((manager.getSessionSummary(sessionUri)?.status ?? 0) & SessionStatus.InProgress) === SessionStatus.InProgress;
				const idleRollup = summaryHasInProgress();

				// Only the peer chat streams; the default chat stays idle.
				manager.dispatchServerAction(peerChat, {
					type: ActionType.ChatTurnStarted,
					turnId: 'turn-peer',
					message: { text: 'b', origin: { kind: MessageKind.User } },
				});
				const runningRollup = summaryHasInProgress();

				await new Promise(r => setTimeout(r, 150));

				const summaryChanges = notifications.filter(n => n.type === NotificationType.SessionSummaryChanged) as SessionSummaryChangedParams[];

				assert.deepStrictEqual(
					{
						idleRollup,
						runningRollup,
						summaryChangedCount: summaryChanges.length,
						notifiedStatusHasInProgress: ((summaryChanges[0]?.changes.status ?? 0) & SessionStatus.InProgress) === SessionStatus.InProgress,
						notifiedSession: summaryChanges[0]?.session,
					},
					{
						idleRollup: false,
						runningRollup: true,
						summaryChangedCount: 1,
						notifiedStatusHasInProgress: true,
						notifiedSession: sessionUri,
					},
				);
			});
		});
	});

	// Exercises the opaque, agent-owned `providerData` blob the StateManager
	// records alongside a peer-chat catalog entry (G-B1). The StateManager must
	// store the string verbatim, return it unchanged, keep it off the default
	// chat, and drop it when the chat or its session goes away — it must NEVER
	// parse or otherwise interpret the value.
	suite('providerData (G-B1)', () => {
		const peerChat = buildChatUri(sessionUri, 'peer-1');
		const peerChat2 = buildChatUri(sessionUri, 'peer-2');

		test('addChat records providerData verbatim and getChatProviderData returns it unchanged', () => {
			manager.createSession(makeSessionSummary());
			// A deliberately structured-but-opaque blob: the StateManager must
			// not parse it, so embedded JSON / quotes must round-trip exactly.
			const blob = '{"sdkSessionId":"abc-123","model":{"id":"x\\"y"}}';
			manager.addChat(sessionUri, peerChat, { title: 'Peer', providerData: blob });

			assert.deepStrictEqual(
				{
					providerData: manager.getChatProviderData(peerChat),
					// The blob is stored separately and never leaks onto the
					// protocol-visible catalog entry / chat state.
					summaryHasBlob: (manager.getSessionState(sessionUri)?.chats.find(c => c.resource === peerChat) as { providerData?: unknown } | undefined)?.providerData !== undefined,
					chatStateHasBlob: (manager.getChatState(peerChat) as { providerData?: unknown } | undefined)?.providerData !== undefined,
				},
				{
					providerData: blob,
					summaryHasBlob: false,
					chatStateHasBlob: false,
				},
			);
		});

		test('the default chat never carries providerData', () => {
			manager.createSession(makeSessionSummary());

			assert.strictEqual(manager.getChatProviderData(buildDefaultChatUri(sessionUri)), undefined);
		});

		test('addChat without providerData stores nothing', () => {
			manager.createSession(makeSessionSummary());
			manager.addChat(sessionUri, peerChat, { title: 'Peer' });

			assert.strictEqual(manager.getChatProviderData(peerChat), undefined);
		});

		test('addChat is idempotent and preserves the originally stored providerData', () => {
			manager.createSession(makeSessionSummary());
			manager.addChat(sessionUri, peerChat, { title: 'Peer', providerData: 'first' });
			// Re-adding the same chat URI is a no-op; it must not clobber the blob.
			manager.addChat(sessionUri, peerChat, { title: 'Ignored', providerData: 'second' });

			assert.strictEqual(manager.getChatProviderData(peerChat), 'first');
		});

		test('restoreChat records providerData verbatim alongside turns', () => {
			manager.restoreSession(makeSessionSummary(), []);
			const blob = 'opaque-restore-token';
			manager.restoreChat(sessionUri, peerChat, { title: 'Restored', turns: [], providerData: blob });

			assert.strictEqual(manager.getChatProviderData(peerChat), blob);
		});

		test('restoreChat without providerData stores nothing', () => {
			manager.restoreSession(makeSessionSummary(), []);
			manager.restoreChat(sessionUri, peerChat, { title: 'Restored', turns: [] });

			assert.strictEqual(manager.getChatProviderData(peerChat), undefined);
		});

		test('removeChat drops the chat providerData', () => {
			manager.createSession(makeSessionSummary());
			manager.addChat(sessionUri, peerChat, { title: 'Peer', providerData: 'blob' });
			manager.removeChat(sessionUri, peerChat);

			assert.strictEqual(manager.getChatProviderData(peerChat), undefined);
		});

		test('removeSession drops providerData for every peer chat', () => {
			manager.createSession(makeSessionSummary());
			manager.addChat(sessionUri, peerChat, { title: 'Peer 1', providerData: 'blob-1' });
			manager.addChat(sessionUri, peerChat2, { title: 'Peer 2', providerData: 'blob-2' });

			manager.removeSession(sessionUri);

			assert.deepStrictEqual(
				{
					peer1: manager.getChatProviderData(peerChat),
					peer2: manager.getChatProviderData(peerChat2),
				},
				{
					peer1: undefined,
					peer2: undefined,
				},
			);
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

	suite('mergeSessionWithDefaultChat', () => {
		function makeSessionState(workingDirectory?: string): SessionState {
			return {
				provider: 'copilot',
				title: 'Session',
				status: SessionStatus.Idle,
				lifecycle: SessionLifecycle.Ready,
				activeClients: [],
				chats: [],
				workingDirectory,
			};
		}

		function makeChatState(workingDirectory?: string): ChatState {
			return {
				resource: 'copilot:/test-session/chat/peer',
				title: 'Peer',
				status: SessionStatus.Idle,
				modifiedAt: new Date().toISOString(),
				workingDirectory,
				turns: [],
			};
		}

		test('resolves the per-chat working directory override over the session default', () => {
			const merged = mergeSessionWithDefaultChat(
				makeSessionState('file:///session-wd'),
				makeChatState('file:///peer-worktree'),
			);
			assert.strictEqual(merged.workingDirectory, 'file:///peer-worktree');
		});

		test('falls back to the session working directory when the chat does not override it', () => {
			const merged = mergeSessionWithDefaultChat(
				makeSessionState('file:///session-wd'),
				makeChatState(undefined),
			);
			assert.strictEqual(merged.workingDirectory, 'file:///session-wd');
		});

		test('falls back to the session working directory when no chat state is hydrated', () => {
			const merged = mergeSessionWithDefaultChat(makeSessionState('file:///session-wd'), undefined);
			assert.strictEqual(merged.workingDirectory, 'file:///session-wd');
			assert.deepStrictEqual(merged.turns, []);
		});
	});
});
