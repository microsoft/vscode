/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { ROOT_STATE_URI } from '../../common/state/sessionState.js';
import { SessionStateManager } from '../../node/sessionStateManager.js';
suite('SessionStateManager', () => {
    let disposables;
    let manager;
    const sessionUri = URI.from({ scheme: 'copilot', path: '/test-session' }).toString();
    function makeSessionSummary(resource) {
        return {
            resource: resource ?? sessionUri,
            provider: 'copilot',
            title: 'Test',
            status: "idle" /* SessionStatus.Idle */,
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
        assert.strictEqual(state.lifecycle, "creating" /* SessionLifecycle.Creating */);
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
        assert.deepStrictEqual(snapshot.state, { agents: [], activeSessions: 0 });
    });
    test('getSnapshot returns session snapshot after creation', () => {
        manager.createSession(makeSessionSummary());
        const snapshot = manager.getSnapshot(sessionUri);
        assert.ok(snapshot);
        assert.strictEqual(snapshot.resource.toString(), sessionUri.toString());
        assert.strictEqual(snapshot.state.lifecycle, "creating" /* SessionLifecycle.Creating */);
    });
    test('dispatchServerAction applies action and emits envelope', () => {
        manager.createSession(makeSessionSummary());
        const envelopes = [];
        disposables.add(manager.onDidEmitEnvelope(e => envelopes.push(e)));
        manager.dispatchServerAction({
            type: "session/ready" /* ActionType.SessionReady */,
            session: sessionUri,
        });
        const state = manager.getSessionState(sessionUri);
        assert.ok(state);
        assert.strictEqual(state.lifecycle, "ready" /* SessionLifecycle.Ready */);
        assert.strictEqual(envelopes.length, 1);
        assert.strictEqual(envelopes[0].action.type, "session/ready" /* ActionType.SessionReady */);
        assert.strictEqual(envelopes[0].serverSeq, 1);
        assert.strictEqual(envelopes[0].origin, undefined);
    });
    test('serverSeq increments monotonically', () => {
        manager.createSession(makeSessionSummary());
        const envelopes = [];
        disposables.add(manager.onDidEmitEnvelope(e => envelopes.push(e)));
        manager.dispatchServerAction({ type: "session/ready" /* ActionType.SessionReady */, session: sessionUri });
        manager.dispatchServerAction({ type: "session/titleChanged" /* ActionType.SessionTitleChanged */, session: sessionUri, title: 'Updated' });
        assert.strictEqual(envelopes.length, 2);
        assert.strictEqual(envelopes[0].serverSeq, 1);
        assert.strictEqual(envelopes[1].serverSeq, 2);
        assert.ok(envelopes[1].serverSeq > envelopes[0].serverSeq);
    });
    test('dispatchClientAction includes origin in envelope', () => {
        manager.createSession(makeSessionSummary());
        const envelopes = [];
        disposables.add(manager.onDidEmitEnvelope(e => envelopes.push(e)));
        const origin = { clientId: 'renderer-1', clientSeq: 42 };
        manager.dispatchClientAction({ type: "session/ready" /* ActionType.SessionReady */, session: sessionUri }, origin);
        assert.strictEqual(envelopes.length, 1);
        assert.deepStrictEqual(envelopes[0].origin, origin);
    });
    test('removeSession clears state without notification', () => {
        manager.createSession(makeSessionSummary());
        const notifications = [];
        disposables.add(manager.onDidEmitNotification(n => notifications.push(n)));
        manager.removeSession(sessionUri);
        assert.strictEqual(manager.getSessionState(sessionUri), undefined);
        assert.strictEqual(manager.getSnapshot(sessionUri), undefined);
        assert.strictEqual(notifications.length, 0);
    });
    test('deleteSession clears state and emits notification', () => {
        manager.createSession(makeSessionSummary());
        const notifications = [];
        disposables.add(manager.onDidEmitNotification(n => notifications.push(n)));
        manager.deleteSession(sessionUri);
        assert.strictEqual(manager.getSessionState(sessionUri), undefined);
        assert.strictEqual(manager.getSnapshot(sessionUri), undefined);
        assert.strictEqual(notifications.length, 1);
        assert.strictEqual(notifications[0].type, "notify/sessionRemoved" /* NotificationType.SessionRemoved */);
    });
    test('createSession emits sessionAdded notification', () => {
        const notifications = [];
        disposables.add(manager.onDidEmitNotification(n => notifications.push(n)));
        manager.createSession(makeSessionSummary());
        assert.strictEqual(notifications.length, 1);
        assert.strictEqual(notifications[0].type, "notify/sessionAdded" /* NotificationType.SessionAdded */);
    });
    test('getActiveTurnId returns active turn id after turnStarted', () => {
        manager.createSession(makeSessionSummary());
        manager.dispatchServerAction({ type: "session/ready" /* ActionType.SessionReady */, session: sessionUri });
        assert.strictEqual(manager.getActiveTurnId(sessionUri), undefined);
        manager.dispatchServerAction({
            type: "session/turnStarted" /* ActionType.SessionTurnStarted */,
            session: sessionUri,
            turnId: 'turn-1',
            userMessage: { text: 'hello' },
        });
        assert.strictEqual(manager.getActiveTurnId(sessionUri), 'turn-1');
    });
    test('root state starts with activeSessions: 0', () => {
        const snapshot = manager.getSnapshot(ROOT_STATE_URI);
        assert.ok(snapshot);
        assert.deepStrictEqual(snapshot.state, { agents: [], activeSessions: 0 });
    });
    test('turnStarted dispatches root/activeSessionsChanged with correct count', () => {
        manager.createSession(makeSessionSummary());
        manager.dispatchServerAction({ type: "session/ready" /* ActionType.SessionReady */, session: sessionUri });
        const envelopes = [];
        disposables.add(manager.onDidEmitEnvelope(e => envelopes.push(e)));
        manager.dispatchServerAction({
            type: "session/turnStarted" /* ActionType.SessionTurnStarted */,
            session: sessionUri,
            turnId: 'turn-1',
            userMessage: { text: 'hello' },
        });
        const activeChanged = envelopes.filter(e => e.action.type === "root/activeSessionsChanged" /* ActionType.RootActiveSessionsChanged */);
        assert.strictEqual(activeChanged.length, 1);
        assert.strictEqual(activeChanged[0].action.activeSessions, 1);
        assert.strictEqual(manager.rootState.activeSessions, 1);
    });
    test('turnComplete dispatches root/activeSessionsChanged back to 0', () => {
        manager.createSession(makeSessionSummary());
        manager.dispatchServerAction({ type: "session/ready" /* ActionType.SessionReady */, session: sessionUri });
        manager.dispatchServerAction({
            type: "session/turnStarted" /* ActionType.SessionTurnStarted */,
            session: sessionUri,
            turnId: 'turn-1',
            userMessage: { text: 'hello' },
        });
        const envelopes = [];
        disposables.add(manager.onDidEmitEnvelope(e => envelopes.push(e)));
        manager.dispatchServerAction({
            type: "session/turnComplete" /* ActionType.SessionTurnComplete */,
            session: sessionUri,
            turnId: 'turn-1',
        });
        const activeChanged = envelopes.filter(e => e.action.type === "root/activeSessionsChanged" /* ActionType.RootActiveSessionsChanged */);
        assert.strictEqual(activeChanged.length, 1);
        assert.strictEqual(activeChanged[0].action.activeSessions, 0);
        assert.strictEqual(manager.rootState.activeSessions, 0);
    });
    test('activeSessions reflects concurrent turn count across sessions', () => {
        const session2Uri = URI.from({ scheme: 'copilot', path: '/test-session-2' }).toString();
        manager.createSession(makeSessionSummary(sessionUri));
        manager.createSession(makeSessionSummary(session2Uri));
        manager.dispatchServerAction({ type: "session/ready" /* ActionType.SessionReady */, session: sessionUri });
        manager.dispatchServerAction({ type: "session/ready" /* ActionType.SessionReady */, session: session2Uri });
        manager.dispatchServerAction({
            type: "session/turnStarted" /* ActionType.SessionTurnStarted */,
            session: sessionUri,
            turnId: 'turn-1',
            userMessage: { text: 'a' },
        });
        manager.dispatchServerAction({
            type: "session/turnStarted" /* ActionType.SessionTurnStarted */,
            session: session2Uri,
            turnId: 'turn-2',
            userMessage: { text: 'b' },
        });
        assert.strictEqual(manager.rootState.activeSessions, 2);
        manager.dispatchServerAction({
            type: "session/turnComplete" /* ActionType.SessionTurnComplete */,
            session: sessionUri,
            turnId: 'turn-1',
        });
        assert.strictEqual(manager.rootState.activeSessions, 1);
        manager.dispatchServerAction({
            type: "session/turnComplete" /* ActionType.SessionTurnComplete */,
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
                responseParts: [{ kind: "markdown" /* ResponsePartKind.Markdown */, id: 'p1', content: 'world' }],
                usage: undefined,
                state: "complete" /* TurnState.Complete */,
            },
        ];
        const state = manager.restoreSession(makeSessionSummary(), turns);
        assert.strictEqual(state.lifecycle, "ready" /* SessionLifecycle.Ready */);
        assert.strictEqual(state.turns.length, 1);
        assert.strictEqual(state.turns[0].userMessage.text, 'hello');
        assert.strictEqual(state.turns[0].responseParts[0].content, 'world');
    });
    test('restoreSession returns existing state for duplicate session', () => {
        manager.createSession(makeSessionSummary());
        const existing = manager.getSessionState(sessionUri);
        const state = manager.restoreSession(makeSessionSummary(), []);
        assert.strictEqual(state, existing);
    });
    test('restoreSession does not emit sessionAdded notification', () => {
        const notifications = [];
        disposables.add(manager.onDidEmitNotification(n => notifications.push(n)));
        manager.restoreSession(makeSessionSummary(), []);
        assert.strictEqual(notifications.length, 0, 'should not emit notification for restored sessions');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvblN0YXRlTWFuYWdlci50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vYWdlbnRIb3N0L3Rlc3Qvbm9kZS9zZXNzaW9uU3RhdGVNYW5hZ2VyLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN2RSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBRTVELE9BQU8sRUFBcUMsY0FBYyxFQUE4RixNQUFNLG9DQUFvQyxDQUFDO0FBQ25NLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRXhFLEtBQUssQ0FBQyxxQkFBcUIsRUFBRSxHQUFHLEVBQUU7SUFFakMsSUFBSSxXQUE0QixDQUFDO0lBQ2pDLElBQUksT0FBNEIsQ0FBQztJQUNqQyxNQUFNLFVBQVUsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsZUFBZSxFQUFFLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQztJQUVyRixTQUFTLGtCQUFrQixDQUFDLFFBQWlCO1FBQzVDLE9BQU87WUFDTixRQUFRLEVBQUUsUUFBUSxJQUFJLFVBQVU7WUFDaEMsUUFBUSxFQUFFLFNBQVM7WUFDbkIsS0FBSyxFQUFFLE1BQU07WUFDYixNQUFNLGlDQUFvQjtZQUMxQixTQUFTLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRTtZQUNyQixVQUFVLEVBQUUsSUFBSSxDQUFDLEdBQUcs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