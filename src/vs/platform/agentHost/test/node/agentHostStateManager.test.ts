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
import { ChatInputQuestionKind, ChatInputResponseKind, MessageKind, SessionSummary, ResponsePartKind, ROOT_STATE_URI, SessionLifecycle, SessionStatus, TurnState, buildChatUri, buildDefaultChatUri, buildSubagentSessionUri, buildSubagentSessionUriPrefix, isSubagentSession, mergeSessionWithDefaultChat, parseSubagentSessionUri, readHostBuildInfo, readSessionEhcliAdoptable, withSessionEhcliAdoptable, type ChatState, type MarkdownResponsePart, type SessionState, type Turn } from '../../common/state/sessionState.js';
import { type SessionSummaryChangedParams } from '../../common/state/protocol/notifications.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { buildChangesetUri, buildSessionChangesetUri } from '../../common/changesetUri.js';
import { withAgentCustomizationSettings } from '../../common/agentCustomizationSettings.js';
import { buildAnnotationsUri } from '../../common/annotationsUri.js';
import { withEphemeralSessionMeta } from '../../common/meta/agentEphemeralSessionMeta.js';
import { ChatInputRequestPurpose, withChatInputRequestPurpose } from '../../common/meta/agentChatInputRequestMeta.js';

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

	test('onDidChangeSessionWorkingDirectories fires only when the working-directory set changes', () => {
		manager.createSession(makeSessionSummary());
		const fired: string[] = [];
		disposables.add(manager.onDidChangeSessionWorkingDirectories(({ session }) => fired.push(session)));

		// Adding a root changes the set -> fires.
		manager.dispatchServerAction(sessionUri, { type: ActionType.SessionWorkingDirectorySet, directory: 'file:///a' });
		// Re-adding the same root is a reducer no-op -> does not fire.
		manager.dispatchServerAction(sessionUri, { type: ActionType.SessionWorkingDirectorySet, directory: 'file:///a' });
		// Adding a second root changes the set -> fires.
		manager.dispatchServerAction(sessionUri, { type: ActionType.SessionWorkingDirectorySet, directory: 'file:///b' });
		// Removing a root changes the set -> fires.
		manager.dispatchServerAction(sessionUri, { type: ActionType.SessionWorkingDirectoryRemoved, directory: 'file:///b' });

		assert.deepStrictEqual(fired, [sessionUri, sessionUri, sessionUri]);
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

	test('emits session title changes and suppresses no-op assignments', () => {
		manager.createSession(makeSessionSummary());

		const changes: Array<{ session: string; title: string }> = [];
		disposables.add(manager.onDidChangeSessionTitle(e => changes.push(e)));

		manager.dispatchServerAction(sessionUri, { type: ActionType.SessionTitleChanged, title: 'Updated' });
		manager.dispatchServerAction(sessionUri, { type: ActionType.SessionTitleChanged, title: 'Updated' });

		assert.deepStrictEqual(changes, [{ session: sessionUri, title: 'Updated' }]);
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

	test('root config replacement preserves provider-backed values', () => {
		const rootState = manager.rootState;
		assert.ok(rootState.config);
		rootState.config.values['codex.personality'] = 'friendly';
		rootState._meta = withAgentCustomizationSettings(rootState, [{
			provider: 'codex',
			title: 'Codex',
			description: 'Codex settings',
			settings: [{ key: 'codex.personality', group: 'Personalization' }],
		}]);

		const envelopes: ActionEnvelope[] = [];
		disposables.add(manager.onDidEmitEnvelope(e => envelopes.push(e)));
		manager.dispatchClientAction(ROOT_STATE_URI, {
			type: ActionType.RootConfigChanged,
			config: { someProviderSetting: 'openai' },
			replace: true,
		}, { clientId: 'renderer-1', clientSeq: 1 });

		assert.deepStrictEqual(manager.rootState.config?.values, {
			someProviderSetting: 'openai',
			'codex.personality': 'friendly',
		});
		assert.deepStrictEqual(envelopes[0].action, {
			type: ActionType.RootConfigChanged,
			config: {
				someProviderSetting: 'openai',
				'codex.personality': 'friendly',
			},
			replace: true,
		});
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

	test('deleteSession clears parent and subagent annotations', () => {
		const subagent = buildSubagentSessionUri(sessionUri, 'tool-call');
		const parentAnnotations = buildAnnotationsUri(sessionUri);
		const subagentAnnotations = buildAnnotationsUri(subagent);
		manager.createSession(makeSessionSummary());
		manager.restoreAnnotations(sessionUri, { annotations: [] });
		manager.restoreAnnotations(subagent, { annotations: [] });

		manager.deleteSession(sessionUri);

		assert.deepStrictEqual({
			parent: manager.getAnnotationsState(parentAnnotations),
			subagent: manager.getAnnotationsState(subagentAnnotations),
		}, {
			parent: undefined,
			subagent: undefined,
		});
	});

	test('createSession emits sessionAdded only for non-ephemeral sessions', () => {
		const notifications: INotification[] = [];
		disposables.add(manager.onDidEmitNotification(n => notifications.push(n)));

		manager.createSession(makeSessionSummary());
		manager.createSession({
			...makeSessionSummary(URI.from({ scheme: 'copilot', path: '/ephemeral-session' }).toString()),
			_meta: withEphemeralSessionMeta(undefined, true),
		});

		assert.deepStrictEqual(notifications.map(notification => notification.type), [NotificationType.SessionAdded]);
	});

	test('default chat inherits the session working directory resolved at materialization', () => {
		// A deferred (provisional) session is created with a pre-materialization
		// working directory; materialization later resolves it to a different
		// one (e.g. a git worktree) via markSessionPersisted. The default chat
		// has no per-chat working-directory override, so getSessionState must
		// project the RESOLVED session working directory, never the stale
		// create-time value that was seeded onto the default chat.
		manager.createSession({ ...makeSessionSummary(), workingDirectories: ['file:///provisional'] }, { emitNotification: false });
		manager.markSessionPersisted(sessionUri, { ...makeSessionSummary(), workingDirectories: ['file:///resolved-worktree'] });

		assert.deepStrictEqual({
			session: manager.getSessionState(sessionUri)?.workingDirectories?.[0],
			defaultChat: manager.getSessionState(sessionChatUri)?.workingDirectories?.[0],
		}, {
			session: 'file:///resolved-worktree',
			defaultChat: 'file:///resolved-worktree',
		});
	});

	test('listed provisional session still applies the materialization upsert', () => {
		const provisional = { ...makeSessionSummary(), workingDirectories: ['file:///provisional'] };
		manager.createSession(provisional, { emitNotification: false });
		manager.dispatchServerAction(sessionChatUri, {
			type: ActionType.ChatTurnStarted,
			turnId: 'turn-1',
			startedAt: '2025-01-01T00:00:00.000Z',
			message: { text: 'hello', origin: { kind: MessageKind.User } },
		});
		manager.prepareSessionSummariesForListing([manager.getSessionSummary(sessionUri)!]);
		const notifications: INotification[] = [];
		disposables.add(manager.onDidEmitNotification(notification => notifications.push(notification)));

		const persisted = {
			...makeSessionSummary(),
			project: { uri: 'file:///resolved-worktree', displayName: 'Resolved Worktree' },
			workingDirectories: ['file:///resolved-worktree'],
		};
		manager.markSessionPersisted(sessionUri, persisted);

		const added = notifications.find(notification => notification.type === NotificationType.SessionAdded);
		assert.deepStrictEqual({
			status: manager.getSessionState(sessionUri)?.status,
			project: manager.getSessionState(sessionUri)?.project,
			workingDirectories: manager.getSessionState(sessionUri)?.workingDirectories,
			addedStatus: added?.type === NotificationType.SessionAdded ? added.summary.status : undefined,
			addedProject: added?.type === NotificationType.SessionAdded ? added.summary.project : undefined,
			addedWorkingDirectories: added?.type === NotificationType.SessionAdded ? added.summary.workingDirectories : undefined,
		}, {
			status: SessionStatus.InProgress,
			project: persisted.project,
			workingDirectories: persisted.workingDirectories,
			addedStatus: SessionStatus.InProgress,
			addedProject: persisted.project,
			addedWorkingDirectories: persisted.workingDirectories,
		});
	});

	test('getActiveTurnId returns active turn id after turnStarted', () => {
		manager.createSession(makeSessionSummary());
		manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });

		assert.strictEqual(manager.getActiveTurnId(sessionUri), undefined);

		manager.dispatchServerAction(sessionChatUri, {
			type: ActionType.ChatTurnStarted,
			turnId: 'turn-1',
			startedAt: '2025-01-01T00:00:00.000Z',
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
			startedAt: '2025-01-01T00:00:00.000Z',
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
			startedAt: '2025-01-01T00:00:00.000Z',
			message: { text: 'hello', origin: { kind: MessageKind.User } },
		});

		const envelopes: ActionEnvelope[] = [];
		disposables.add(manager.onDidEmitEnvelope(e => envelopes.push(e)));

		manager.dispatchServerAction(sessionChatUri, {
			type: ActionType.ChatTurnComplete,
			turnId: 'turn-1',
			duration: 1000,
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
			startedAt: '2025-01-01T00:00:00.000Z',
			message: { text: 'a', origin: { kind: MessageKind.User } },
		});
		manager.dispatchServerAction(buildDefaultChatUri(session2Uri), {
			type: ActionType.ChatTurnStarted,
			turnId: 'turn-2',
			startedAt: '2025-01-01T00:00:00.000Z',
			message: { text: 'b', origin: { kind: MessageKind.User } },
		});
		assert.strictEqual(manager.rootState.activeSessions, 2);

		manager.dispatchServerAction(sessionChatUri, {
			type: ActionType.ChatTurnComplete,
			turnId: 'turn-1',
			duration: 1000,
		});
		assert.strictEqual(manager.rootState.activeSessions, 1);

		manager.dispatchServerAction(buildDefaultChatUri(session2Uri), {
			type: ActionType.ChatTurnComplete,
			turnId: 'turn-2',
			duration: 1000,
		});
		assert.strictEqual(manager.rootState.activeSessions, 0);
	});

	test('removeSession decrements active sessions when an active turn is stranded', () => {
		manager.createSession(makeSessionSummary());
		manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });
		manager.dispatchServerAction(sessionChatUri, {
			type: ActionType.ChatTurnStarted,
			turnId: 'turn-1',
			startedAt: '2025-01-01T00:00:00.000Z',
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
			startedAt: '2025-01-01T00:00:00.000Z',
			message: { text: 'hello', origin: { kind: MessageKind.User } },
		});
		assert.strictEqual(manager.rootState.activeSessions, 1);

		manager.dispatchServerAction(sessionChatUri, {
			type: ActionType.ChatTurnComplete,
			turnId: 'stale-turn',
			duration: 1000,
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
			startedAt: '2025-01-01T00:00:00.000Z',
			message: { text: 'a', origin: { kind: MessageKind.User } },
		});
		manager.dispatchServerAction(sessionChatUri, {
			type: ActionType.ChatTurnStarted,
			turnId: 'turn-2',
			startedAt: '2025-01-01T00:00:00.000Z',
			message: { text: 'b', origin: { kind: MessageKind.User } },
		});

		assert.strictEqual(manager.rootState.activeSessions, 1);

		manager.dispatchServerAction(sessionChatUri, {
			type: ActionType.ChatTurnComplete,
			turnId: 'turn-2',
			duration: 1000,
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
			startedAt: '2025-01-01T00:00:00.000Z',
			message: { text: 'hello', origin: { kind: MessageKind.User } },
		});
		manager.dispatchServerAction(sessionChatUri, {
			type: ActionType.ChatTurnComplete,
			turnId: 'stale-turn',
			duration: 1000,
		});
		manager.dispatchServerAction(sessionChatUri, {
			type: ActionType.ChatError,
			turnId: 'turn-1',
			duration: 1000,
			part: { kind: ResponsePartKind.Error, error: { errorType: 'failed', message: 'boom' } },
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
			startedAt: '2025-01-01T00:00:00.000Z',
			message: { text: 'hello', origin: { kind: MessageKind.User } },
		});
		manager.dispatchServerAction(sessionChatUri, {
			type: ActionType.ChatTurnCancelled,
			turnId: 'turn-1',
			duration: 1000,
		});
		manager.dispatchServerAction(buildDefaultChatUri(session2Uri), {
			type: ActionType.ChatTurnStarted,
			turnId: 'turn-2',
			startedAt: '2025-01-01T00:00:00.000Z',
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

	test('restored unpublished sessions retain summary changes without notifying root clients', () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			manager.restoreSession(makeSessionSummary(), []);
			const notifications: INotification[] = [];
			disposables.add(manager.onDidEmitNotification(notification => notifications.push(notification)));

			manager.dispatchServerAction(sessionUri, { type: ActionType.SessionTitleChanged, title: 'Hidden Title' });
			await new Promise(resolve => setTimeout(resolve, 150));
			const hiddenChanges = notifications.filter(notification => notification.type === NotificationType.SessionSummaryChanged);
			const retainedTitle = manager.getSessionSummary(sessionUri)?.title;

			manager.setSessionSummaryPublished(sessionUri, true);
			const added = notifications.find(notification => notification.type === NotificationType.SessionAdded);
			manager.dispatchServerAction(sessionUri, { type: ActionType.SessionTitleChanged, title: 'Visible Title' });
			await new Promise(resolve => setTimeout(resolve, 150));
			const visibleChanges = notifications.filter(notification => notification.type === NotificationType.SessionSummaryChanged) as SessionSummaryChangedParams[];

			assert.deepStrictEqual({
				hiddenChangeCount: hiddenChanges.length,
				retainedTitle,
				addedTitle: added?.type === NotificationType.SessionAdded ? added.summary.title : undefined,
				visibleChanges: visibleChanges.map(change => change.changes.title),
			}, {
				hiddenChangeCount: 0,
				retainedTitle: 'Hidden Title',
				addedTitle: 'Hidden Title',
				visibleChanges: ['Visible Title'],
			});
		});
	});

	test('restoreSession emits sessionSummaryChanged clearing the adoptable marker for a previously surfaced session', () => {
		// A surfaced adoptable-legacy session is announced with the marker; adopting
		// it via restoreSession must notify clients the marker was cleared so they
		// update the entry in place instead of dropping the just-opened session.
		manager.announceSurfacedSession({ ...makeSessionSummary(), _meta: withSessionEhcliAdoptable(undefined) });

		const notifications: INotification[] = [];
		disposables.add(manager.onDidEmitNotification(n => notifications.push(n)));

		manager.restoreSession(makeSessionSummary(), []);

		const changed = notifications.filter(n => n.type === NotificationType.SessionSummaryChanged) as SessionSummaryChangedParams[];
		assert.strictEqual(changed.length, 1);
		assert.strictEqual(changed[0].session, sessionUri);
		assert.strictEqual(Object.prototype.hasOwnProperty.call(changed[0].changes, '_meta'), true);
		assert.strictEqual(readSessionEhcliAdoptable(changed[0].changes._meta), false);
	});

	test('publishing a restored session announces it to clients that never saw it', () => {
		// A legacy chat adopted after startup was never surfaced by discovery, so
		// restore records it silently and clients have no entry. Publishing is what
		// makes an adopted session appear instead of existing only on the host.
		manager.restoreSession(makeSessionSummary(), []);
		const notifications: INotification[] = [];
		disposables.add(manager.onDidEmitNotification(n => notifications.push(n)));

		manager.setSessionSummaryPublished(sessionUri, true);

		assert.deepStrictEqual(
			notifications.filter(n => n.type === NotificationType.SessionAdded).map(n => (n as { summary: { resource: string } }).summary.resource),
			[sessionUri],
		);
	});

	suite('unused-draft tracking', () => {

		test('reports draft status by origin, addressable by session or chat URI', () => {
			const restoredUri = URI.from({ scheme: 'copilot', path: '/restored-session' }).toString();
			manager.createSession(makeSessionSummary());
			manager.restoreSession(makeSessionSummary(restoredUri), []);

			assert.deepStrictEqual({
				created: manager.isUnusedDraft(sessionUri),
				createdViaChatUri: manager.isUnusedDraft(sessionChatUri),
				restored: manager.isUnusedDraft(restoredUri),
				restoredViaChatUri: manager.isUnusedDraft(buildDefaultChatUri(restoredUri)),
				unknown: manager.isUnusedDraft(URI.from({ scheme: 'copilot', path: '/nope' }).toString()),
			}, {
				created: true,
				createdViaChatUri: true,
				restored: false,
				restoredViaChatUri: false,
				unknown: undefined,
			});
		});

		test('a restored session that was first created is no longer a draft', () => {
			// `restoreSession` short-circuits when the session is already in state.
			manager.createSession(makeSessionSummary());
			manager.restoreSession(makeSessionSummary(), []);

			assert.strictEqual(manager.isUnusedDraft(sessionUri), true);
		});

		test('draft status is retired by a turn and does not come back on truncate', () => {
			manager.createSession(makeSessionSummary());
			const observed: (boolean | undefined)[] = [manager.isUnusedDraft(sessionUri)];

			manager.dispatchServerAction(sessionChatUri, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'hello', origin: { kind: MessageKind.User } },
			});
			observed.push(manager.isUnusedDraft(sessionUri));

			manager.dispatchServerAction(sessionChatUri, { type: ActionType.ChatTurnComplete, turnId: 'turn-1', duration: 1 });
			observed.push(manager.isUnusedDraft(sessionUri));

			// Truncate-to-zero empties the chat but must not resurrect the draft.
			manager.dispatchServerAction(sessionChatUri, { type: ActionType.ChatTruncated });
			observed.push(manager.isUnusedDraft(sessionUri));

			assert.deepStrictEqual({
				observed,
				turnsAfterTruncate: manager.getDefaultChatState(sessionUri)?.turns.length,
			}, {
				observed: [true, false, false, false],
				turnsAfterTruncate: 0,
			});
		});

		test('seeding turns for a fork retires draft status', () => {
			manager.createSession(makeSessionSummary());
			manager.seedDefaultChatTurns(sessionUri, [{
				id: 'turn-1',
				message: { text: 'hello', origin: { kind: MessageKind.User } },
				responseParts: [],
				usage: undefined,
				state: TurnState.Complete,
			}]);

			assert.strictEqual(manager.isUnusedDraft(sessionUri), false);
		});
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
		// Regression: when residency eviction calls removeSession within the
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
				startedAt: '2025-01-01T00:00:00.000Z',
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
				duration: 1000,
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
		// Regression: residency eviction calls removeSession to drop an
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

		test('catalog-only SessionChatAdded does not create chat state', () => {
			manager.createSession(makeSessionSummary());
			manager.dispatchServerAction(sessionUri, {
				type: ActionType.SessionChatAdded,
				summary: {
					resource: peerChat,
					title: 'Catalog only',
					status: SessionStatus.Idle,
					modifiedAt: '2025-01-01T00:00:00.000Z',
				},
			});

			assert.deepStrictEqual({
				catalogTitle: manager.getSessionState(sessionUri)?.chats.find(chat => chat.resource === peerChat)?.title,
				chatState: manager.getChatState(peerChat),
			}, {
				catalogTitle: 'Catalog only',
				chatState: undefined,
			});
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

		test('restored peer chat snapshots the inherited default chat title', () => {
			manager.restoreSession(makeSessionSummary(), []);
			const defaultChat = buildDefaultChatUri(sessionUri);
			const beforeRestore = manager.getSessionState(sessionUri)?.chats.find(chat => chat.resource === defaultChat)?.title;

			manager.registerRestoredChatSummary(sessionUri, peerChat, { title: 'Peer' });

			assert.deepStrictEqual({
				beforeRestore,
				afterRestore: manager.getSessionState(sessionUri)?.chats.find(chat => chat.resource === defaultChat)?.title,
			}, {
				beforeRestore: '',
				afterRestore: 'Test',
			});
		});

		test('adding a chat snapshots the canonical default when routing defaults to a peer', () => {
			manager.createSession(makeSessionSummary());
			const canonicalDefault = buildDefaultChatUri(sessionUri);
			const peer2 = buildChatUri(sessionUri, 'peer-2');
			manager.addChat(sessionUri, peerChat, { title: 'Peer' });
			manager.updateChatTitle(sessionUri, canonicalDefault, '');
			manager.updateChatTitle(sessionUri, peerChat, '');
			manager.dispatchServerAction(sessionUri, { type: ActionType.SessionDefaultChatChanged, defaultChat: peerChat });

			manager.addChat(sessionUri, peer2, { title: 'Peer 2' });

			const state = manager.getSessionState(sessionUri);
			assert.deepStrictEqual({
				canonicalDefaultTitle: state?.chats.find(chat => chat.resource === canonicalDefault)?.title,
				routingDefaultTitle: state?.chats.find(chat => chat.resource === peerChat)?.title,
			}, {
				canonicalDefaultTitle: 'Test',
				routingDefaultTitle: '',
			});
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
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'a', origin: { kind: MessageKind.User } },
			});
			const afterStart = manager.hasActiveTurn(sessionUri);

			manager.dispatchServerAction(sessionChatUri, {
				type: ActionType.ChatTurnComplete,
				turnId: 'turn-1',
				duration: 1000,
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
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'a', origin: { kind: MessageKind.User } },
			});
			manager.dispatchServerAction(sessionChatUri, {
				type: ActionType.ChatTurnComplete,
				turnId: 'turn-1',
				duration: 1000,
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
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'a', origin: { kind: MessageKind.User } },
			});
			const afterDefaultStart = manager.hasActiveTurn(sessionUri);

			manager.dispatchServerAction(peerChat, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-peer',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'b', origin: { kind: MessageKind.User } },
			});
			const afterBothStart = manager.hasActiveTurn(sessionUri);

			// Completing the default chat must NOT clear while the peer streams.
			manager.dispatchServerAction(defaultChat, {
				type: ActionType.ChatTurnComplete,
				turnId: 'turn-default',
				duration: 1000,
			});
			const afterDefaultComplete = manager.hasActiveTurn(sessionUri);

			// Only once the peer finishes too does the session go idle.
			manager.dispatchServerAction(peerChat, {
				type: ActionType.ChatTurnComplete,
				turnId: 'turn-peer',
				duration: 1000,
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
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'b', origin: { kind: MessageKind.User } },
			});
			const whilePeerRuns = manager.getSessionState(sessionUri)?.status;

			// Once the peer finishes the session falls back to idle.
			manager.dispatchServerAction(peerChat, {
				type: ActionType.ChatTurnComplete,
				turnId: 'turn-peer',
				duration: 1000,
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
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'b', origin: { kind: MessageKind.User } },
			});
			const runningCatalog = peerCatalogStatus();
			const updatesAfterStart = chatUpdatesForPeer();

			manager.dispatchServerAction(peerChat, {
				type: ActionType.ChatTurnComplete,
				turnId: 'turn-peer',
				duration: 1000,
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
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'a', origin: { kind: MessageKind.User } },
			});

			manager.dispatchServerAction(peerChat, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-peer',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'b', origin: { kind: MessageKind.User } },
			});
			const activeWhileBothRun = manager.rootState.activeSessions;

			manager.dispatchServerAction(defaultChat, {
				type: ActionType.ChatTurnComplete,
				turnId: 'turn-default',
				duration: 1000,
			});
			const activeAfterFirstCompletes = manager.rootState.activeSessions;

			manager.dispatchServerAction(peerChat, {
				type: ActionType.ChatTurnComplete,
				turnId: 'turn-peer',
				duration: 1000,
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

		test('session-status event captures every lifecycle transition without debouncing', () => {
			manager.createSession(makeSessionSummary());
			const defaultChat = buildDefaultChatUri(sessionUri);
			const statuses: SessionStatus[] = [];
			disposables.add(manager.onDidChangeSessionStatus(e => statuses.push(e.status & ~(SessionStatus.IsRead | SessionStatus.IsArchived))));

			manager.dispatchServerAction(defaultChat, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-default',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'a', origin: { kind: MessageKind.User } },
			});
			manager.dispatchServerAction(defaultChat, {
				type: ActionType.ChatInputRequested,
				request: withChatInputRequestPurpose({
					id: 'request',
					questions: [{ kind: ChatInputQuestionKind.Text, id: 'question', message: 'Continue?' }],
				}, ChatInputRequestPurpose.AskUser),
			});
			manager.dispatchServerAction(defaultChat, {
				type: ActionType.ChatInputCompleted,
				requestId: 'request',
				response: ChatInputResponseKind.Accept,
			});
			manager.dispatchServerAction(defaultChat, {
				type: ActionType.ChatTurnComplete,
				turnId: 'turn-default',
				duration: 1000,
			});

			assert.deepStrictEqual(statuses, [
				SessionStatus.InProgress,
				SessionStatus.InputNeeded,
				SessionStatus.InProgress,
				SessionStatus.Idle,
			]);
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
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'a', origin: { kind: MessageKind.User } },
			});
			manager.dispatchServerAction(peerChat, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-peer',
				startedAt: '2025-01-01T00:00:00.000Z',
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
				duration: 1000,
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
				startedAt: '2025-01-01T00:00:00.000Z',
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
	// — the default-chat pointer set up by `_ensureDefaultChat`, restored peer
	// resolution, and the rolled-up session summary produced by the
	// SessionSummaryNotifier — so the upcoming `providerData` change cannot
	// silently regress them.
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

		test('registerRestoredChatSummary and resolveChatState hydrate a peer without dispatching SessionChatAdded', async () => {
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
			manager.registerRestoredChatSummary(sessionUri, peerChat, {
				title: 'Restored Peer',
				draft,
				resolver: async () => ({ turns }),
			});
			const peerState = await manager.resolveChatState(peerChat);
			assert.deepStrictEqual(
				{
					chatResources: manager.getSessionState(sessionUri)?.chats.map(c => c.resource.toString()).sort(),
					restoredTitle: manager.getSessionState(sessionUri)?.chats.find(c => c.resource === peerChat)?.title,
					peerTurns: peerState?.turns.length,
					peerDraft: peerState?.draft?.text,
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

		test('resolveChatState coalesces restored peer resolution and atomically installs its state', async () => {
			manager.restoreSession(makeSessionSummary(), []);

			let resolverCalls = 0;
			manager.registerRestoredChatSummary(sessionUri, peerChat, {
				title: 'Restored Peer',
				draft: { text: 'work in progress', origin: { kind: MessageKind.User } },
				resolver: async () => {
					resolverCalls++;
					return {
						turns: [{
							id: 'peer-turn-1',
							message: { text: 'restored', origin: { kind: MessageKind.User } },
							responseParts: [],
							usage: undefined,
							state: TurnState.Complete,
						}],
					};
				},
			});
			const beforeHydration = {
				summary: manager.getSessionState(sessionUri)?.chats.find(c => c.resource === peerChat)?.title,
				state: manager.getChatState(peerChat),
			};
			const [first, second] = await Promise.all([
				manager.resolveChatState(peerChat),
				manager.resolveChatState(peerChat),
			]);
			const state = manager.getChatState(peerChat);

			assert.deepStrictEqual({
				beforeHydration,
				sameState: first === second,
				resolverCalls,
				afterHydration: state && { title: state.title, turns: state.turns.map(turn => turn.id), draft: state.draft?.text },
			}, {
				beforeHydration: { summary: 'Restored Peer', state: undefined },
				sameState: true,
				resolverCalls: 1,
				afterHydration: { title: 'Restored Peer', turns: ['peer-turn-1'], draft: 'work in progress' },
			});
		});

		test('resolveChatState retries failed restored peer resolution', async () => {
			manager.restoreSession(makeSessionSummary(), []);
			let resolverCalls = 0;
			manager.registerRestoredChatSummary(sessionUri, peerChat, {
				resolver: async () => {
					resolverCalls++;
					if (resolverCalls === 1) {
						throw new Error('history unavailable');
					}
					return { turns: [] };
				},
			});

			await assert.rejects(() => manager.resolveChatState(peerChat), /history unavailable/);
			const state = await manager.resolveChatState(peerChat);

			assert.deepStrictEqual({
				resolverCalls,
				state: state && { title: state.title, turns: state.turns.length },
			}, {
				resolverCalls: 2,
				state: { title: '', turns: 0 },
			});
		});

		test('uses the latest unresolved summary when resolving a restored peer chat', async () => {
			manager.restoreSession(makeSessionSummary(), []);
			let resolveHistory!: (state: { turns: Turn[] }) => void;
			manager.registerRestoredChatSummary(sessionUri, peerChat, {
				title: 'Original title',
				resolver: () => new Promise(resolve => { resolveHistory = resolve; }),
			});

			const resolving = manager.resolveChatState(peerChat);
			manager.updateChatTitle(sessionUri, peerChat, 'Updated title');
			resolveHistory({ turns: [] });
			const state = await resolving;

			assert.deepStrictEqual({
				catalogTitle: manager.getSessionState(sessionUri)?.chats.find(c => c.resource === peerChat)?.title,
				stateTitle: state?.title,
			}, {
				catalogTitle: 'Updated title',
				stateTitle: 'Updated title',
			});
		});

		test('invalidates a pending restored peer resolver before same-URI reuse', async () => {
			manager.restoreSession(makeSessionSummary(), []);
			let resolveHistory!: (state: { turns: Turn[] }) => void;
			manager.registerRestoredChatSummary(sessionUri, peerChat, {
				resolver: () => new Promise(resolve => { resolveHistory = resolve; }),
			});

			const resolving = manager.resolveChatState(peerChat);
			manager.removeChat(sessionUri, peerChat);
			manager.addChat(sessionUri, peerChat, { title: 'Replacement' });
			resolveHistory({ turns: [] });
			await assert.rejects(() => resolving, /invalidated/);

			assert.deepStrictEqual({
				replacement: manager.getChatState(peerChat) && { title: manager.getChatState(peerChat)?.title, turns: manager.getChatState(peerChat)?.turns.length },
			}, {
				replacement: { title: 'Replacement', turns: 0 },
			});
		});

		test('registerRestoredChatSummary does not replace an already-hydrated chat URI', async () => {
			manager.createSession(makeSessionSummary());
			manager.addChat(sessionUri, peerChat, { title: 'Peer' });

			let resolverCalls = 0;
			manager.registerRestoredChatSummary(sessionUri, peerChat, {
				title: 'Ignored',
				resolver: async () => {
					resolverCalls++;
					return { turns: [] };
				},
			});
			await manager.resolveChatState(peerChat);

			assert.deepStrictEqual(
				{
					chatCount: manager.getSessionState(sessionUri)?.chats.length,
					title: manager.getSessionState(sessionUri)?.chats.find(c => c.resource === peerChat)?.title,
					peerTurns: manager.getChatState(peerChat)?.turns.length,
					resolverCalls,
				},
				{
					chatCount: 2,
					title: 'Peer',
					peerTurns: 0,
					resolverCalls: 0,
				},
			);
		});

		test('registerRestoredChatSummary does not register a peer for an unknown session', async () => {
			const summary = manager.registerRestoredChatSummary('copilot:/missing', peerChat, {
				resolver: async () => ({ turns: [] }),
			});

			assert.deepStrictEqual({
				summary,
				state: await manager.resolveChatState(peerChat),
			}, {
				summary: undefined,
				state: undefined,
			});
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
					startedAt: '2025-01-01T00:00:00.000Z',
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

	// Exercises the opaque, agent-owned `providerData` blob supplied to restored
	// peer resolvers. The StateManager must pass through the authoritative value
	// without parsing it, including after updates and retries.
	suite('providerData (G-B1)', () => {
		const peerChat = buildChatUri(sessionUri, 'peer-1');
		const peerChat2 = buildChatUri(sessionUri, 'peer-2');

		test('passes initial providerData verbatim to a restored peer resolver', async () => {
			manager.restoreSession(makeSessionSummary(), []);
			const blob = '{"sdkSessionId":"abc-123","model":{"id":"x\\"y"}}';
			let received: string | undefined;
			manager.registerRestoredChatSummary(sessionUri, peerChat, {
				providerData: blob,
				resolver: async providerData => {
					received = providerData;
					return { turns: [] };
				},
			});

			await manager.resolveChatState(peerChat);

			assert.strictEqual(received, blob);
		});

		test('passes providerData updated before resolution to the resolver', async () => {
			manager.restoreSession(makeSessionSummary(), []);
			let received: string | undefined;
			manager.registerRestoredChatSummary(sessionUri, peerChat, {
				providerData: 'v1',
				resolver: async providerData => {
					received = providerData;
					return { turns: [] };
				},
			});
			manager.updateChatProviderData(peerChat, 'v2');

			await manager.resolveChatState(peerChat);

			assert.strictEqual(received, 'v2');
		});

		test('retries resolution with current providerData', async () => {
			manager.restoreSession(makeSessionSummary(), []);
			const received: Array<string | undefined> = [];
			manager.registerRestoredChatSummary(sessionUri, peerChat, {
				providerData: 'v1',
				resolver: async providerData => {
					received.push(providerData);
					if (received.length === 1) {
						throw new Error('materialization failed');
					}
					return { turns: [] };
				},
			});

			await assert.rejects(() => manager.resolveChatState(peerChat), /materialization failed/);
			manager.updateChatProviderData(peerChat, 'v2');
			await manager.resolveChatState(peerChat);

			assert.deepStrictEqual(received, ['v1', 'v2']);
		});

		test('removeChat prevents an unresolved peer resolver from observing stale providerData', async () => {
			manager.restoreSession(makeSessionSummary(), []);
			let resolverCalls = 0;
			manager.registerRestoredChatSummary(sessionUri, peerChat, {
				providerData: 'blob',
				resolver: async () => {
					resolverCalls++;
					return { turns: [] };
				},
			});
			manager.removeChat(sessionUri, peerChat);

			assert.deepStrictEqual({
				state: await manager.resolveChatState(peerChat),
				resolverCalls,
			}, {
				state: undefined,
				resolverCalls: 0,
			});
		});

		test('removeSession prevents unresolved peer resolvers from observing stale providerData', async () => {
			manager.restoreSession(makeSessionSummary(), []);
			const resolverCalls: string[] = [];
			for (const chat of [peerChat, peerChat2]) {
				manager.registerRestoredChatSummary(sessionUri, chat, {
					providerData: `blob-${chat}`,
					resolver: async () => {
						resolverCalls.push(chat);
						return { turns: [] };
					},
				});
			}
			manager.removeSession(sessionUri);

			assert.deepStrictEqual(
				{
					peer1: await manager.resolveChatState(peerChat),
					peer2: await manager.resolveChatState(peerChat2),
					resolverCalls,
				},
				{
					peer1: undefined,
					peer2: undefined,
					resolverCalls: [],
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
				workingDirectories: workingDirectory ? [workingDirectory] : undefined,
			};
		}

		function makeChatState(workingDirectory?: string): ChatState {
			return {
				resource: 'copilot:/test-session/chat/peer',
				title: 'Peer',
				status: SessionStatus.Idle,
				modifiedAt: new Date().toISOString(),
				workingDirectories: workingDirectory ? [workingDirectory] : undefined,
				turns: [],
			};
		}

		test('resolves the per-chat working directory override over the session default', () => {
			const merged = mergeSessionWithDefaultChat(
				makeSessionState('file:///session-wd'),
				makeChatState('file:///peer-worktree'),
			);
			assert.strictEqual(merged.workingDirectories?.[0], 'file:///peer-worktree');
		});

		test('falls back to the session working directory when the chat does not override it', () => {
			const merged = mergeSessionWithDefaultChat(
				makeSessionState('file:///session-wd'),
				makeChatState(undefined),
			);
			assert.strictEqual(merged.workingDirectories?.[0], 'file:///session-wd');
		});

		test('falls back to the session working directory when no chat state is hydrated', () => {
			const merged = mergeSessionWithDefaultChat(makeSessionState('file:///session-wd'), undefined);
			assert.strictEqual(merged.workingDirectories?.[0], 'file:///session-wd');
			assert.deepStrictEqual(merged.turns, []);
		});
	});
});
