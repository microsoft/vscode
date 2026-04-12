/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IGitHubService } from '../../../github/browser/githubService.js';
import { ISessionsManagementService } from '../../../sessions/browser/sessionsManagementService.js';
import { CodeReviewService, getCodeReviewFilesFromSessionChanges, getCodeReviewVersion } from '../../browser/codeReviewService.js';
suite('CodeReviewService', () => {
    const store = new DisposableStore();
    let instantiationService;
    let service;
    let commandService;
    let storageService;
    let sessionsManagement;
    let session;
    let fileA;
    let fileB;
    class MockCommandService {
        constructor() {
            this.onWillExecuteCommand = Event.None;
            this.onDidExecuteCommand = Event.None;
            this.result = undefined;
        }
        async executeCommand(commandId, ...args) {
            this.lastCommandId = commandId;
            this.lastArgs = args;
            if (this.executeDeferred) {
                return await new Promise((resolve, reject) => {
                    this.executeDeferred = { resolve: resolve, reject };
                });
            }
            return this.result;
        }
        /**
         * Configure the mock to defer execution until manually resolved/rejected.
         */
        deferNextExecution() {
            this.executeDeferred = undefined;
            const self = this;
            const originalResult = this.result;
            // Override executeCommand for next call to capture the deferred promise
            const origExecute = this.executeCommand.bind(this);
            this.executeCommand = async function (commandId, ...args) {
                self.lastCommandId = commandId;
                self.lastArgs = args;
                return new Promise((resolve, reject) => {
                    self.executeDeferred = { resolve: resolve, reject };
                });
            };
            // Restore after use
            this._restoreExecute = () => {
                this.executeCommand = origExecute;
                this.result = originalResult;
            };
        }
        resolveExecution(value) {
            this.executeDeferred?.resolve(value);
            this.executeDeferred = undefined;
            this._restoreExecute?.();
        }
        rejectExecution(error) {
            this.executeDeferred?.reject(error);
            this.executeDeferred = undefined;
            this._restoreExecute?.();
        }
    }
    class MockSessionsManagementService extends mock() {
        constructor(disposables) {
            super();
            this._sessions = new Map();
            this._onDidChangeSessions = disposables.add(new Emitter());
            this.onDidChangeSessions = this._onDidChangeSessions.event;
            this.activeSession = observableValue('test.activeSession', undefined);
        }
        getSession(resource) {
            return this._sessions.get(resource.toString());
        }
        addSession(resource, changes, archived = false) {
            const changesObs = observableValue('test.changes', (changes ?? []).map(c => ({ modifiedUri: c.modifiedUri ?? c.uri, originalUri: c.originalUri, insertions: c.insertions, deletions: c.deletions })));
            const isArchivedObs = observableValue('test.isArchived', archived);
            const sessionData = {
                sessionId: `test:${resource.toString()}`,
                resource,
                changes: changesObs,
                isArchived: isArchivedObs,
                gitHubInfo: observableValue('test.gitHubInfo', undefined),
            };
            this._sessions.set(resource.toString(), sessionData);
            return sessionData;
        }
        updateSessionChanges(resource, changes) {
            const session = this._sessions.get(resource.toString());
            if (session) {
                const obs = session.changes;
                obs.set((changes ?? []).map(c => ({ modifiedUri: c.modifiedUri ?? c.uri, originalUri: c.originalUri, insertions: c.insertions, deletions: c.deletions })), undefined);
            }
        }
        removeSession(resource) {
            this._sessions.delete(resource.toString());
        }
        getSessions() {
            return [...this._sessions.values()];
        }
        fireSessionsChanged(event) {
            this._onDidChangeSessions.fire({
                added: event?.added ?? [],
                removed: event?.removed ?? [],
                changed: event?.changed ?? [],
            });
        }
    }
    setup(() => {
        instantiationService = store.add(new TestInstantiationService());
        commandService = new MockCommandService();
        instantiationService.stub(ICommandService, commandService);
        instantiationService.stub(ILogService, new NullLogService());
        instantiationService.stub(IGitHubService, new class extends mock() {
        }());
        sessionsManagement = new MockSessionsManagementService(store);
        instantiationService.stub(ISessionsManagementService, sessionsManagement);
        storageService = store.add(new InMemoryStorageService());
        instantiationService.stub(IStorageService, storageService);
        service = store.add(instantiationService.createInstance(CodeReviewService));
        session = URI.parse('test://session/1');
        fileA = URI.parse('file:///a.ts');
        fileB = URI.parse('file:///b.ts');
    });
    teardown(() => {
        store.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    // --- getReviewState ---
    test('initial state is idle', () => {
        const state = service.getReviewState(session).get();
        assert.strictEqual(state.kind, "idle" /* CodeReviewStateKind.Idle */);
    });
    test('getReviewState returns the same observable for the same session', () => {
        const obs1 = service.getReviewState(session);
        const obs2 = service.getReviewState(session);
        assert.strictEqual(obs1, obs2);
    });
    test('getReviewState returns different observables for different sessions', () => {
        const session2 = URI.parse('test://session/2');
        const obs1 = service.getReviewState(session);
        const obs2 = service.getReviewState(session2);
        assert.notStrictEqual(obs1, obs2);
    });
    // --- hasReview ---
    test('hasReview returns false when no review exists', () => {
        assert.strictEqual(service.hasReview(session, 'v1'), false);
    });
    test('hasReview returns false when review is for a different version', async () => {
        commandService.result = { type: 'success', comments: [] };
        service.requestReview(session, 'v1', [{ currentUri: fileA }]);
        // Wait for async command to complete
        await tick();
        assert.strictEqual(service.hasReview(session, 'v1'), true);
        assert.strictEqual(service.hasReview(session, 'v2'), false);
    });
    test('hasReview returns true after successful review', async () => {
        commandService.result = { type: 'success', comments: [] };
        service.requestReview(session, 'v1', [{ currentUri: fileA }]);
        await tick();
        assert.strictEqual(service.hasReview(session, 'v1'), true);
    });
    // --- requestReview ---
    test('requestReview transitions to loading state', () => {
        commandService.deferNextExecution();
        service.requestReview(session, 'v1', [{ currentUri: fileA }]);
        const state = service.getReviewState(session).get();
        assert.strictEqual(state.kind, "loading" /* CodeReviewStateKind.Loading */);
        if (state.kind === "loading" /* CodeReviewStateKind.Loading */) {
            assert.strictEqual(state.version, 'v1');
            assert.strictEqual(state.reviewCount, 1);
        }
        // Resolve to avoid leaking
        commandService.resolveExecution({ type: 'success', comments: [] });
    });
    test('requestReview calls command with correct arguments', async () => {
        commandService.result = { type: 'success', comments: [] };
        service.requestReview(session, 'v1', [
            { currentUri: fileA, baseUri: fileB },
            { currentUri: fileB },
        ]);
        await tick();
        assert.strictEqual(commandService.lastCommandId, 'chat.internal.codeReview.run');
        const args = commandService.lastArgs?.[0];
        assert.strictEqual(args.files.length, 2);
        assert.strictEqual(args.files[0].currentUri.toString(), fileA.toString());
        assert.strictEqual(args.files[0].baseUri?.toString(), fileB.toString());
        assert.strictEqual(args.files[1].currentUri.toString(), fileB.toString());
        assert.strictEqual(args.files[1].baseUri, undefined);
    });
    test('requestReview with success populates comments', async () => {
        commandService.result = {
            type: 'success',
            comments: [
                {
                    uri: fileA,
                    range: new Range(1, 1, 5, 1),
                    body: 'Bug found',
                    kind: 'bug',
                    severity: 'high',
                },
                {
                    uri: fileB,
                    range: new Range(10, 1, 15, 1),
                    body: 'Style issue',
                    kind: 'style',
                    severity: 'low',
                },
            ],
        };
        service.requestReview(session, 'v1', [{ currentUri: fileA }, { currentUri: fileB }]);
        await tick();
        const state = service.getReviewState(session).get();
        assert.strictEqual(state.kind, "result" /* CodeReviewStateKind.Result */);
        if (state.kind === "result" /* CodeReviewStateKind.Result */) {
            assert.strictEqual(state.version, 'v1');
            assert.strictEqual(state.reviewCount, 1);
            assert.strictEqual(state.comments.length, 2);
            assert.strictEqual(state.comments[0].body, 'Bug found');
            assert.strictEqual(state.comments[0].kind, 'bug');
            assert.strictEqual(state.comments[0].severity, 'high');
            assert.strictEqual(state.comments[0].uri.toString(), fileA.toString());
            assert.strictEqual(state.comments[1].body, 'Style issue');
        }
    });
    test('requestReview with error transitions to error state', async () => {
        commandService.result = { type: 'error', reason: 'Auth failed' };
        service.requestReview(session, 'v1', [{ currentUri: fileA }]);
        await tick();
        const state = service.getReviewState(session).get();
        assert.strictEqual(state.kind, "error" /* CodeReviewStateKind.Error */);
        if (state.kind === "error" /* CodeReviewStateKind.Error */) {
            assert.strictEqual(state.version, 'v1');
            assert.strictEqual(state.reviewCount, 1);
            assert.strictEqual(state.reason, 'Auth failed');
        }
    });
    test('requestReview with cancelled result transitions to idle', async () => {
        commandService.result = { type: 'cancelled' };
        service.requestReview(session, 'v1', [{ currentUri: fileA }]);
        await tick();
        const state = service.getReviewState(session).get();
        assert.strictEqual(state.kind, "idle" /* CodeReviewStateKind.Idle */);
    });
    test('requestReview with undefined result transitions to idle', async () => {
        commandService.result = undefined;
        service.requestReview(session, 'v1', [{ currentUri: fileA }]);
        await tick();
        const state = service.getReviewState(session).get();
        assert.strictEqual(state.kind, "idle" /* CodeReviewStateKind.Idle */);
    });
    test('requestReview with thrown error transitions to error state', async () => {
        commandService.deferNextExecution();
        service.requestReview(session, 'v1', [{ currentUri: fileA }]);
        commandService.rejectExecution(new Error('Network error'));
        await tick();
        const state = service.getReviewState(session).get();
        assert.strictEqual(state.kind, "error" /* CodeReviewStateKind.Error */);
        if (state.kind === "error" /* CodeReviewStateKind.Error */) {
            assert.strictEqual(state.reviewCount, 1);
            assert.ok(state.reason.includes('Network error'));
        }
    });
    test('requestReview is a no-op when loading for the same version', () => {
        commandService.deferNextExecution();
        service.requestReview(session, 'v1', [{ currentUri: fileA }]);
        // Attempt to request again for the same version
        service.requestReview(session, 'v1', [{ currentUri: fileA }]);
        // Should still be loading (not re-triggered)
        const state = service.getReviewState(session).get();
        assert.strictEqual(state.kind, "loading" /* CodeReviewStateKind.Loading */);
        commandService.resolveExecution({ type: 'success', comments: [] });
    });
    test('requestReview is a no-op when unresolved comments exist for the same version', async () => {
        commandService.result = { type: 'success', comments: [{ uri: fileA, range: new Range(1, 1, 1, 1), body: 'comment' }] };
        service.requestReview(session, 'v1', [{ currentUri: fileA }]);
        await tick();
        // Attempt to request again
        service.requestReview(session, 'v1', [{ currentUri: fileA }]);
        // Should still have the result
        const state = service.getReviewState(session).get();
        assert.strictEqual(state.kind, "result" /* CodeReviewStateKind.Result */);
        if (state.kind === "result" /* CodeReviewStateKind.Result */) {
            assert.strictEqual(state.comments.length, 1);
        }
    });
    test('requestReview reruns when previous result for the same version had no comments', async () => {
        commandService.result = { type: 'success', comments: [] };
        service.requestReview(session, 'v1', [{ currentUri: fileA }]);
        await tick();
        commandService.deferNextExecution();
        service.requestReview(session, 'v1', [{ currentUri: fileA }]);
        const state = service.getReviewState(session).get();
        assert.strictEqual(state.kind, "loading" /* CodeReviewStateKind.Loading */);
        commandService.resolveExecution({ type: 'success', comments: [] });
        await tick();
    });
    test('requestReview reruns when all comments for the same version were removed', async () => {
        commandService.result = { type: 'success', comments: [{ uri: fileA, range: new Range(1, 1, 1, 1), body: 'comment' }] };
        service.requestReview(session, 'v1', [{ currentUri: fileA }]);
        await tick();
        const initialState = service.getReviewState(session).get();
        assert.strictEqual(initialState.kind, "result" /* CodeReviewStateKind.Result */);
        if (initialState.kind !== "result" /* CodeReviewStateKind.Result */) {
            return;
        }
        service.removeComment(session, initialState.comments[0].id);
        commandService.deferNextExecution();
        service.requestReview(session, 'v1', [{ currentUri: fileA }]);
        const state = service.getReviewState(session).get();
        assert.strictEqual(state.kind, "loading" /* CodeReviewStateKind.Loading */);
        commandService.resolveExecution({ type: 'success', comments: [] });
        await tick();
    });
    test('requestReview is a no-op after five reviews for the same version', async () => {
        commandService.result = { type: 'success', comments: [] };
        for (let i = 0; i < 5; i++) {
            service.requestReview(session, 'v1', [{ currentUri: fileA }]);
            await tick();
        }
        const stateBefore = service.getReviewState(session).get();
        assert.strictEqual(stateBefore.kind, "result" /* CodeReviewStateKind.Result */);
        if (stateBefore.kind === "result" /* CodeReviewStateKind.Result */) {
            assert.strictEqual(stateBefore.reviewCount, 5);
        }
        commandService.deferNextExecution();
        service.requestReview(session, 'v1', [{ currentUri: fileA }]);
        const stateAfter = service.getReviewState(session).get();
        assert.strictEqual(stateAfter.kind, "result" /* CodeReviewStateKind.Result */);
        if (stateAfter.kind === "result" /* CodeReviewStateKind.Result */) {
            assert.strictEqual(stateAfter.reviewCount, 5);
        }
    });
    test('requestReview for a new version replaces loading state', async () => {
        // Start v1 review — it will complete immediately with empty result
        commandService.result = { type: 'success', comments: [] };
        service.requestReview(session, 'v1', [{ currentUri: fileA }]);
        await tick();
        assert.strictEqual(service.hasReview(session, 'v1'), true);
        // Request v2 — since v1 is a different version, it should proceed
        commandService.result = { type: 'success', comments: [{ uri: fileA, range: new Range(1, 1, 1, 1), body: 'v2 comment' }] };
        service.requestReview(session, 'v2', [{ currentUri: fileA }]);
        await tick();
        const state = service.getReviewState(session).get();
        assert.strictEqual(state.kind, "result" /* CodeReviewStateKind.Result */);
        if (state.kind === "result" /* CodeReviewStateKind.Result */) {
            assert.strictEqual(state.version, 'v2');
            assert.strictEqual(state.comments.length, 1);
            assert.strictEqual(state.comments[0].body, 'v2 comment');
        }
        // v1 is no longer valid
        assert.strictEqual(service.hasReview(session, 'v1'), false);
    });
    // --- removeComment ---
    test('removeComment removes a specific comment', async () => {
        commandService.result = {
            type: 'success',
            comments: [
                { uri: fileA, range: new Range(1, 1, 1, 1), body: 'comment1' },
                { uri: fileA, range: new Range(5, 1, 5, 1), body: 'comment2' },
                { uri: fileB, range: new Range(10, 1, 10, 1), body: 'comment3' },
            ],
        };
        service.requestReview(session, 'v1', [{ currentUri: fileA }, { currentUri: fileB }]);
        await tick();
        const state = service.getReviewState(session).get();
        assert.strictEqual(state.kind, "result" /* CodeReviewStateKind.Result */);
        if (state.kind !== "result" /* CodeReviewStateKind.Result */) {
            return;
        }
        const commentToRemove = state.comments[1];
        service.removeComment(session, commentToRemove.id);
        const newState = service.getReviewState(session).get();
        assert.strictEqual(newState.kind, "result" /* CodeReviewStateKind.Result */);
        if (newState.kind === "result" /* CodeReviewStateKind.Result */) {
            assert.strictEqual(newState.comments.length, 2);
            assert.strictEqual(newState.comments[0].body, 'comment1');
            assert.strictEqual(newState.comments[1].body, 'comment3');
        }
    });
    test('removeComment is a no-op for unknown comment id', async () => {
        commandService.result = {
            type: 'success',
            comments: [{ uri: fileA, range: new Range(1, 1, 1, 1), body: 'comment1' }],
        };
        service.requestReview(session, 'v1', [{ currentUri: fileA }]);
        await tick();
        service.removeComment(session, 'nonexistent-id');
        const state = service.getReviewState(session).get();
        if (state.kind === "result" /* CodeReviewStateKind.Result */) {
            assert.strictEqual(state.comments.length, 1);
        }
    });
    test('removeComment is a no-op when no review exists', () => {
        // Should not throw
        service.removeComment(session, 'some-id');
        const state = service.getReviewState(session).get();
        assert.strictEqual(state.kind, "idle" /* CodeReviewStateKind.Idle */);
    });
    test('removeComment is a no-op when state is not result', () => {
        commandService.deferNextExecution();
        service.requestReview(session, 'v1', [{ currentUri: fileA }]);
        // State is loading — removeComment should be ignored
        service.removeComment(session, 'some-id');
        const state = service.getReviewState(session).get();
        assert.strictEqual(state.kind, "loading" /* CodeReviewStateKind.Loading */);
        commandService.resolveExecution({ type: 'success', comments: [] });
    });
    test('removeComment preserves version in result', async () => {
        commandService.result = {
            type: 'success',
            comments: [
                { uri: fileA, range: new Range(1, 1, 1, 1), body: 'comment1' },
                { uri: fileA, range: new Range(5, 1, 5, 1), body: 'comment2' },
            ],
        };
        service.requestReview(session, 'v1', [{ currentUri: fileA }]);
        await tick();
        const state = service.getReviewState(session).get();
        if (state.kind !== "result" /* CodeReviewStateKind.Result */) {
            return;
        }
        service.removeComment(session, state.comments[0].id);
        const newState = service.getReviewState(session).get();
        if (newState.kind === "result" /* CodeReviewStateKind.Result */) {
            assert.strictEqual(newState.version, 'v1');
        }
    });
    // --- dismissReview ---
    test('dismissReview resets to idle', async () => {
        commandService.result = { type: 'success', comments: [] };
        service.requestReview(session, 'v1', [{ currentUri: fileA }]);
        await tick();
        assert.strictEqual(service.getReviewState(session).get().kind, "result" /* CodeReviewStateKind.Result */);
        service.dismissReview(session);
        assert.strictEqual(service.getReviewState(session).get().kind, "idle" /* CodeReviewStateKind.Idle */);
    });
    test('dismissReview while loading resets to idle', () => {
        commandService.deferNextExecution();
        service.requestReview(session, 'v1', [{ currentUri: fileA }]);
        assert.strictEqual(service.getReviewState(session).get().kind, "loading" /* CodeReviewStateKind.Loading */);
        service.dismissReview(session);
        assert.strictEqual(service.getReviewState(session).get().kind, "idle" /* CodeReviewStateKind.Idle */);
        // Resolve the pending command — should be ignored since dismissed
        commandService.resolveExecution({ type: 'success', comments: [{ uri: fileA, range: new Range(1, 1, 1, 1), body: 'late' }] });
    });
    test('dismissReview is a no-op when no data exists', () => {
        // Should not throw
        service.dismissReview(session);
    });
    test('hasReview returns false after dismissReview', async () => {
        commandService.result = { type: 'success', comments: [] };
        service.requestReview(session, 'v1', [{ currentUri: fileA }]);
        await tick();
        assert.strictEqual(service.hasReview(session, 'v1'), true);
        service.dismissReview(session);
        assert.strictEqual(service.hasReview(session, 'v1'), false);
    });
    // --- Isolation between sessions ---
    test('different sessions are independent', async () => {
        const session2 = URI.parse('test://session/2');
        commandService.result = {
            type: 'success',
            comments: [{ uri: fileA, range: new Range(1, 1, 1, 1), body: 'session1 comment' }],
        };
        service.requestReview(session, 'v1', [{ currentUri: fileA }]);
        await tick();
        commandService.result = {
            type: 'success',
            comments: [{ uri: fileB, range: new Range(2, 1, 2, 1), body: 'session2 comment' }],
        };
        service.requestReview(session2, 'v2', [{ currentUri: fileB }]);
        await tick();
        const state1 = service.getReviewState(session).get();
        const state2 = service.getReviewState(session2).get();
        assert.strictEqual(state1.kind, "result" /* CodeReviewStateKind.Result */);
        assert.strictEqual(state2.kind, "result" /* CodeReviewStateKind.Result */);
        if (state1.kind === "result" /* CodeReviewStateKind.Result */ && state2.kind === "result" /* CodeReviewStateKind.Result */) {
            assert.strictEqual(state1.comments[0].body, 'session1 comment');
            assert.strictEqual(state2.comments[0].body, 'session2 comment');
        }
        // Dismissing session1 doesn't affect session2
        service.dismissReview(session);
        assert.strictEqual(service.getReviewState(session).get().kind, "idle" /* CodeReviewStateKind.Idle */);
        assert.strictEqual(service.getReviewState(session2).get().kind, "result" /* CodeReviewStateKind.Result */);
    });
    // --- Comment parsing ---
    test('comments with string URIs are parsed correctly', async () => {
        commandService.result = {
            type: 'success',
            comments: [
                {
                    uri: 'file:///parsed.ts',
                    range: new Range(1, 1, 1, 1),
                    body: 'parsed comment',
                },
            ],
        };
        service.requestReview(session, 'v1', [{ currentUri: fileA }]);
        await tick();
        const state = service.getReviewState(session).get();
        if (state.kind === "result" /* CodeReviewStateKind.Result */) {
            assert.strictEqual(state.comments[0].uri.toString(), 'file:///parsed.ts');
        }
    });
    test('comments with missing optional fields get defaults', async () => {
        commandService.result = {
            type: 'success',
            comments: [
                {
                    uri: fileA,
                    range: new Range(1, 1, 1, 1),
                    // body, kind, severity omitted
                },
            ],
        };
        service.requestReview(session, 'v1', [{ currentUri: fileA }]);
        await tick();
        const state = service.getReviewState(session).get();
        if (state.kind === "result" /* CodeReviewStateKind.Result */) {
            assert.strictEqual(state.comments[0].body, '');
            assert.strictEqual(state.comments[0].kind, '');
            assert.strictEqual(state.comments[0].severity, '');
            assert.strictEqual(state.comments[0].suggestion, undefined);
        }
    });
    test('comments normalize VS Code API style ranges', async () => {
        commandService.result = {
            type: 'success',
            comments: [
                {
                    uri: fileA,
                    range: {
                        start: { line: 4, character: 2 },
                        end: { line: 6, character: 5 },
                    },
                    body: 'normalized comment',
                    suggestion: {
                        edits: [
                            {
                                range: {
                                    start: { line: 8, character: 1 },
                                    end: { line: 8, character: 9 },
                                },
                                oldText: 'let value',
                                newText: 'const value',
                            },
                        ],
                    },
                },
            ],
        };
        service.requestReview(session, 'v1', [{ currentUri: fileA }]);
        await tick();
        const state = service.getReviewState(session).get();
        assert.strictEqual(state.kind, "result" /* CodeReviewStateKind.Result */);
        if (state.kind === "result" /* CodeReviewStateKind.Result */) {
            assert.deepStrictEqual(state.comments[0].range, new Range(5, 3, 7, 6));
            assert.deepStrictEqual(state.comments[0].suggestion?.edits[0].range, new Range(9, 2, 9, 10));
        }
    });
    test('comments normalize serialized URIs and tuple ranges from API payloads', async () => {
        const serializedUri = JSON.parse(JSON.stringify(URI.parse('git:/c%3A/Code/vscode.worktrees/copilot-worktree-2026-03-04T14-44-38/src/vs/sessions/contrib/changesView/test/browser/codeReviewService.test.ts?%7B%22path%22%3A%22c%3A%5C%5CCode%5C%5Cvscode.worktrees%5C%5Ccopilot-worktree-2026-03-04T14-44-38%5C%5Csrc%5C%5Cvs%5C%5Csessions%5C%5Ccontrib%5C%5CchangesView%5C%5Ctest%5C%5Cbrowser%5C%5CcodeReviewService.test.ts%22%2C%22ref%22%3A%22copilot-worktree-2026-03-04T14-44-38%22%7D')));
        commandService.result = {
            type: 'success',
            comments: [
                {
                    uri: serializedUri,
                    range: [
                        { line: 72, character: 2 },
                        { line: 72, character: 3 },
                    ],
                    body: 'tuple range comment',
                    kind: 'bug',
                    severity: 'medium',
                },
            ],
        };
        service.requestReview(session, 'v1', [{ currentUri: fileA }]);
        await tick();
        const state = service.getReviewState(session).get();
        assert.strictEqual(state.kind, "result" /* CodeReviewStateKind.Result */);
        if (state.kind === "result" /* CodeReviewStateKind.Result */) {
            assert.strictEqual(state.comments[0].uri.toString(), URI.revive(serializedUri).toString());
            assert.deepStrictEqual(state.comments[0].range, new Range(73, 3, 73, 4));
        }
    });
    test('each comment gets a unique id', async () => {
        commandService.result = {
            type: 'success',
            comments: [
                { uri: fileA, range: new Range(1, 1, 1, 1), body: 'a' },
                { uri: fileA, range: new Range(1, 1, 1, 1), body: 'b' },
            ],
        };
        service.requestReview(session, 'v1', [{ currentUri: fileA }]);
        await tick();
        const state = service.getReviewState(session).get();
        if (state.kind === "result" /* CodeReviewStateKind.Result */) {
            assert.notStrictEqual(state.comments[0].id, state.comments[1].id);
        }
    });
    // --- Observable reactivity ---
    test('observable fires on state transitions', async () => {
        const states = [];
        const obs = service.getReviewState(session);
        // Collect initial state
        states.push(obs.get().kind);
        commandService.deferNextExecution();
        service.requestReview(session, 'v1', [{ currentUri: fileA }]);
        states.push(obs.get().kind);
        commandService.resolveExecution({ type: 'success', comments: [] });
        await tick();
        states.push(obs.get().kind);
        service.dismissReview(session);
        states.push(obs.get().kind);
        assert.deepStrictEqual(states, [
            "idle" /* CodeReviewStateKind.Idle */,
            "loading" /* CodeReviewStateKind.Loading */,
            "result" /* CodeReviewStateKind.Result */,
            "idle" /* CodeReviewStateKind.Idle */,
        ]);
    });
    // --- Storage persistence ---
    test('review results are persisted to storage', async () => {
        commandService.result = {
            type: 'success',
            comments: [{ uri: fileA, range: new Range(1, 1, 5, 1), body: 'Persisted comment', kind: 'bug', severity: 'high' }],
        };
        service.requestReview(session, 'v1', [{ currentUri: fileA }]);
        await tick();
        const raw = storageService.get('codeReview.reviews', 1 /* StorageScope.WORKSPACE */);
        assert.ok(raw, 'Storage should contain review data');
        const stored = JSON.parse(raw);
        const reviewData = stored[session.toString()];
        assert.ok(reviewData);
        assert.strictEqual(reviewData.version, 'v1');
        assert.strictEqual(reviewData.reviewCount, 1);
        assert.strictEqual(reviewData.comments.length, 1);
        assert.strictEqual(reviewData.comments[0].body, 'Persisted comment');
    });
    test('reviews are restored from storage on service creation', async () => {
        commandService.result = {
            type: 'success',
            comments: [{ uri: fileA, range: new Range(1, 1, 5, 1), body: 'Restored comment', kind: 'bug', severity: 'high' }],
        };
        service.requestReview(session, 'v1', [{ currentUri: fileA }]);
        await tick();
        // Create a second service with the same storage
        const service2 = store.add(instantiationService.createInstance(CodeReviewService));
        const state = service2.getReviewState(session).get();
        assert.strictEqual(state.kind, "result" /* CodeReviewStateKind.Result */);
        if (state.kind === "result" /* CodeReviewStateKind.Result */) {
            assert.strictEqual(state.version, 'v1');
            assert.strictEqual(state.reviewCount, 1);
            assert.strictEqual(state.comments.length, 1);
            assert.strictEqual(state.comments[0].body, 'Restored comment');
            assert.strictEqual(state.comments[0].uri.toString(), fileA.toString());
            assert.deepStrictEqual(state.comments[0].range, { startLineNumber: 1, startColumn: 1, endLineNumber: 5, endColumn: 1 });
        }
    });
    test('suggestions are persisted and restored correctly', async () => {
        commandService.result = {
            type: 'success',
            comments: [{
                    uri: fileA,
                    range: new Range(1, 1, 5, 1),
                    body: 'suggestion comment',
                    suggestion: {
                        edits: [{
                                range: new Range(2, 1, 3, 10),
                                oldText: 'let x = 1;',
                                newText: 'const x = 1;',
                            }],
                    },
                }],
        };
        service.requestReview(session, 'v1', [{ currentUri: fileA }]);
        await tick();
        const service2 = store.add(instantiationService.createInstance(CodeReviewService));
        const state = service2.getReviewState(session).get();
        assert.strictEqual(state.kind, "result" /* CodeReviewStateKind.Result */);
        if (state.kind === "result" /* CodeReviewStateKind.Result */) {
            assert.strictEqual(state.comments[0].suggestion?.edits.length, 1);
            assert.strictEqual(state.comments[0].suggestion?.edits[0].oldText, 'let x = 1;');
            assert.strictEqual(state.comments[0].suggestion?.edits[0].newText, 'const x = 1;');
        }
    });
    test('removeComment updates storage', async () => {
        commandService.result = {
            type: 'success',
            comments: [
                { uri: fileA, range: new Range(1, 1, 1, 1), body: 'comment1' },
                { uri: fileA, range: new Range(5, 1, 5, 1), body: 'comment2' },
            ],
        };
        service.requestReview(session, 'v1', [{ currentUri: fileA }]);
        await tick();
        const state = service.getReviewState(session).get();
        if (state.kind !== "result" /* CodeReviewStateKind.Result */) {
            return;
        }
        service.removeComment(session, state.comments[0].id);
        const raw = storageService.get('codeReview.reviews', 1 /* StorageScope.WORKSPACE */);
        const stored = JSON.parse(raw);
        assert.strictEqual(stored[session.toString()].comments.length, 1);
        assert.strictEqual(stored[session.toString()].comments[0].body, 'comment2');
    });
    test('dismissReview removes session from storage', async () => {
        commandService.result = { type: 'success', comments: [{ uri: fileA, range: new Range(1, 1, 1, 1), body: 'c' }] };
        service.requestReview(session, 'v1', [{ currentUri: fileA }]);
        await tick();
        assert.ok(storageService.get('codeReview.reviews', 1 /* StorageScope.WORKSPACE */));
        service.dismissReview(session);
        assert.strictEqual(storageService.get('codeReview.reviews', 1 /* StorageScope.WORKSPACE */), undefined);
    });
    test('corrupted storage is handled gracefully', () => {
        storageService.store('codeReview.reviews', 'not-valid-json{{{', 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        const service2 = store.add(instantiationService.createInstance(CodeReviewService));
        const state = service2.getReviewState(session).get();
        assert.strictEqual(state.kind, "idle" /* CodeReviewStateKind.Idle */);
    });
    // --- Session lifecycle cleanup ---
    test('archived session reviews are cleaned up', async () => {
        commandService.result = { type: 'success', comments: [{ uri: fileA, range: new Range(1, 1, 1, 1), body: 'comment' }] };
        service.requestReview(session, 'v1', [{ currentUri: fileA }]);
        await tick();
        assert.strictEqual(service.getReviewState(session).get().kind, "result" /* CodeReviewStateKind.Result */);
        const mockSession = sessionsManagement.addSession(session, undefined, true);
        sessionsManagement.fireSessionsChanged({ changed: [mockSession] });
        assert.strictEqual(service.getReviewState(session).get().kind, "idle" /* CodeReviewStateKind.Idle */);
        assert.strictEqual(storageService.get('codeReview.reviews', 1 /* StorageScope.WORKSPACE */), undefined);
    });
    test('non-archived session change does not clean up review', async () => {
        const changes = [
            { uri: fileA, modifiedUri: fileA, insertions: 1, deletions: 0 },
        ];
        const files = getCodeReviewFilesFromSessionChanges(changes);
        const version = getCodeReviewVersion(files);
        commandService.result = { type: 'success', comments: [{ uri: fileA, range: new Range(1, 1, 1, 1), body: 'comment' }] };
        service.requestReview(session, version, files);
        await tick();
        const mockSession = sessionsManagement.addSession(session, changes, false);
        sessionsManagement.fireSessionsChanged({ changed: [mockSession] });
        assert.strictEqual(service.getReviewState(session).get().kind, "result" /* CodeReviewStateKind.Result */);
    });
    test('session with changed version has review cleaned up', async () => {
        const changes = [
            { uri: fileA, modifiedUri: fileA, insertions: 1, deletions: 0 },
        ];
        sessionsManagement.addSession(session, changes);
        const files = getCodeReviewFilesFromSessionChanges(changes);
        const version = getCodeReviewVersion(files);
        commandService.result = { type: 'success', comments: [{ uri: fileA, range: new Range(1, 1, 1, 1), body: 'stale comment' }] };
        service.requestReview(session, version, files);
        await tick();
        assert.strictEqual(service.getReviewState(session).get().kind, "result" /* CodeReviewStateKind.Result */);
        const newChanges = [
            { uri: fileA, modifiedUri: fileA, insertions: 1, deletions: 0 },
            { uri: fileB, modifiedUri: fileB, insertions: 2, deletions: 0 },
        ];
        sessionsManagement.updateSessionChanges(session, newChanges);
        sessionsManagement.fireSessionsChanged();
        assert.strictEqual(service.getReviewState(session).get().kind, "idle" /* CodeReviewStateKind.Idle */);
        assert.strictEqual(storageService.get('codeReview.reviews', 1 /* StorageScope.WORKSPACE */), undefined);
    });
    test('session that no longer exists has review cleaned up', async () => {
        commandService.result = { type: 'success', comments: [{ uri: fileA, range: new Range(1, 1, 1, 1), body: 'orphaned comment' }] };
        service.requestReview(session, 'v1', [{ currentUri: fileA }]);
        await tick();
        assert.strictEqual(service.getReviewState(session).get().kind, "result" /* CodeReviewStateKind.Result */);
        sessionsManagement.fireSessionsChanged();
        assert.strictEqual(service.getReviewState(session).get().kind, "idle" /* CodeReviewStateKind.Idle */);
    });
    test('session with no changes has review cleaned up', async () => {
        sessionsManagement.addSession(session, [
            { uri: fileA, modifiedUri: fileA, insertions: 1, deletions: 0 },
        ]);
        commandService.result = { type: 'success', comments: [{ uri: fileA, range: new Range(1, 1, 1, 1), body: 'comment' }] };
        service.requestReview(session, 'v1', [{ currentUri: fileA }]);
        await tick();
        sessionsManagement.updateSessionChanges(session, undefined);
        sessionsManagement.fireSessionsChanged();
        assert.strictEqual(service.getReviewState(session).get().kind, "idle" /* CodeReviewStateKind.Idle */);
    });
    test('session with matching version keeps review intact', async () => {
        const changes = [
            { uri: fileA, modifiedUri: fileA, insertions: 1, deletions: 0 },
        ];
        sessionsManagement.addSession(session, changes);
        const files = getCodeReviewFilesFromSessionChanges(changes);
        const version = getCodeReviewVersion(files);
        commandService.result = { type: 'success', comments: [{ uri: fileA, range: new Range(1, 1, 1, 1), body: 'valid comment' }] };
        service.requestReview(session, version, files);
        await tick();
        sessionsManagement.fireSessionsChanged();
        const state = service.getReviewState(session).get();
        assert.strictEqual(state.kind, "result" /* CodeReviewStateKind.Result */);
        if (state.kind === "result" /* CodeReviewStateKind.Result */) {
            assert.strictEqual(state.comments[0].body, 'valid comment');
        }
    });
});
function tick() {
    return new Promise(resolve => setTimeout(resolve, 0));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29kZVJldmlld1NlcnZpY2UudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3Nlc3Npb25zL2NvbnRyaWIvY29kZVJldmlldy90ZXN0L2Jyb3dzZXIvY29kZVJldmlld1NlcnZpY2UudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNuRSxPQUFPLEVBQWUsZUFBZSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDeEYsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sK0VBQStFLENBQUM7QUFDekgsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUN0RixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsV0FBVyxFQUFFLGNBQWMsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxlQUFlLEVBQStCLE1BQU0sbURBQW1ELENBQUM7QUFFekksT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQzFFLE9BQU8sRUFBd0MsMEJBQTBCLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUUxSSxPQUFPLEVBQXNCLGlCQUFpQixFQUF1QixvQ0FBb0MsRUFBRSxvQkFBb0IsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBRTVLLEtBQUssQ0FBQyxtQkFBbUIsRUFBRSxHQUFHLEVBQUU7SUFFL0IsTUFBTSxLQUFLLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztJQUNwQyxJQUFJLG9CQUE4QyxDQUFDO0lBQ25ELElBQUksT0FBMkIsQ0FBQztJQUNoQyxJQUFJLGNBQWtDLENBQUM7SUFDdkMsSUFBSSxjQUFzQyxDQUFDO0lBQzNDLElBQUksa0JBQWlELENBQUM7SUFFdEQsSUFBSSxPQUFZLENBQUM7SUFDakIsSUFBSSxLQUFVLENBQUM7SUFDZixJQUFJLEtBQVUsQ0FBQztJQUVmLE1BQU0sa0JBQWtCO1FBQXhCO1lBRVUseUJBQW9CLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztZQUNsQyx3QkFBbUIsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO1lBRTFDLFdBQU0sR0FBWSxTQUFTLENBQUM7UUF5RDdCLENBQUM7UUFwREEsS0FBSyxDQUFDLGNBQWMsQ0FBSSxTQUFpQixFQUFFLEdBQUcsSUFBZTtZQUM1RCxJQUFJLENBQUMsYUFBYSxHQUFHLFNBQVMsQ0FBQztZQUMvQixJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQztZQUVyQixJQUFJLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztnQkFDMUIsT0FBTyxNQUFNLElBQUksT0FBTyxDQUFJLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxFQUFFO29CQUMvQyxJQUFJLENBQUMsZUFBZSxHQUFHLEVBQUUsT0FBTyxFQUFFLE9BQStCLEVBQUUsTUFBTSxFQUFFLENBQUM7Z0JBQzdFLENBQUMsQ0FBQyxDQUFDO1lBQ0osQ0FBQztZQUVELE9BQU8sSUFBSSxDQUFDLE1BQVcsQ0FBQztRQUN6QixDQUFDO1FBRUQ7O1dBRUc7UUFDSCxrQkFBa0I7WUFDakIsSUFBSSxDQUFDLGVBQWUsR0FBRyxTQUFTLENBQUM7WUFDakMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDO1lBQ2xCLE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUM7WUFFbkMsd0VBQXdFO1lBQ3hFLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ25ELElBQUksQ0FBQyxjQUFjLEdBQUcsS0FBSyxXQUFjLFNBQWlCLEVBQUUsR0FBRyxJQUFlO2dCQUM3RSxJQUFJLENBQUMsYUFBYSxHQUFHLFNBQVMsQ0FBQztnQkFDL0IsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUM7Z0JBRXJCLE9BQU8sSUFBSSxPQUFPLENBQUksQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7b0JBQ3pDLElBQUksQ0FBQyxlQUFlLEdBQUcsRUFBRSxPQUFPLEVBQUUsT0FBK0IsRUFBRSxNQUFNLEVBQUUsQ0FBQztnQkFDN0UsQ0FBQyxDQUFDLENBQUM7WUFDSixDQUF1QixDQUFDO1lBRXhCLG9CQUFvQjtZQUNwQixJQUFJLENBQUMsZUFBZSxHQUFHLEdBQUcsRUFBRTtnQkFDM0IsSUFBSSxDQUFDLGNBQWMsR0FBRyxXQUFXLENBQUM7Z0JBQ2xDLElBQUksQ0FBQyxNQUFNLEdBQUcsY0FBYyxDQUFDO1lBQzlCLENBQUMsQ0FBQztRQUNILENBQUM7UUFJRCxnQkFBZ0IsQ0FBQyxLQUFjO1lBQzlCLElBQUksQ0FBQyxlQUFlLEVBQUUsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3JDLElBQUksQ0FBQyxlQUFlLEdBQUcsU0FBUyxDQUFDO1lBQ2pDLElBQUksQ0FBQyxlQUFlLEVBQUUsRUFBRSxDQUFDO1FBQzFCLENBQUM7UUFFRCxlQUFlLENBQUMsS0FBYztZQUM3QixJQUFJLENBQUMsZUFBZSxFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNwQyxJQUFJLENBQUMsZUFBZSxHQUFHLFNBQVMsQ0FBQztZQUNqQyxJQUFJLENBQUMsZUFBZSxFQUFFLEVBQUUsQ0FBQztRQUMxQixDQUFDO0tBQ0Q7SUFFRCxNQUFNLDZCQUE4QixTQUFRLElBQUksRUFBOEI7UUFPN0UsWUFBWSxXQUE0QjtZQUN2QyxLQUFLLEVBQUUsQ0FBQztZQUhRLGNBQVMsR0FBRyxJQUFJLEdBQUcsRUFBb0IsQ0FBQztZQUl4RCxJQUFJLENBQUMsb0JBQW9CLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLE9BQU8sRUFBd0IsQ0FBQyxDQUFDO1lBQ2pGLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsS0FBSyxDQUFDO1lBQzNELElBQUksQ0FBQyxhQUFhLEdBQUcsZUFBZSxDQUE2QixvQkFBb0IsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUNuRyxDQUFDO1FBRVEsVUFBVSxDQUFDLFFBQWE7WUFDaEMsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUNoRCxDQUFDO1FBRUQsVUFBVSxDQUFDLFFBQWEsRUFBRSxPQUE0QyxFQUFFLFFBQVEsR0FBRyxLQUFLO1lBQ3ZGLE1BQU0sVUFBVSxHQUFHLGVBQWUsQ0FBb0MsY0FBYyxFQUNuRixDQUFDLE9BQU8sSUFBSSxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsV0FBVyxFQUFFLENBQUMsQ0FBQyxXQUFXLElBQUksQ0FBQyxDQUFDLEdBQUcsRUFBRSxXQUFXLEVBQUUsQ0FBQyxDQUFDLFdBQVcsRUFBRSxVQUFVLEVBQUUsQ0FBQyxDQUFDLFVBQVUsRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsQ0FDakosQ0FBQztZQUNGLE1BQU0sYUFBYSxHQUFHLGVBQWUsQ0FBVSxpQkFBaUIsRUFBRSxRQUFRLENBQUMsQ0FBQztZQUM1RSxNQUFNLFdBQVcsR0FBYTtnQkFDN0IsU0FBUyxFQUFFLFFBQVEsUUFBUSxDQUFDLFFBQVEsRUFBRSxFQUFFO2dCQUN4QyxRQUFRO2dCQUNSLE9BQU8sRUFBRSxVQUFVO2dCQUNuQixVQUFVLEVBQUUsYUFBYTtnQkFDekIsVUFBVSxFQUFFLGVBQWUsQ0FBQyxpQkFBaUIsRUFBRSxTQUFTLENBQUM7YUFDbEMsQ0FBQztZQUN6QixJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFLEVBQUUsV0FBVyxDQUFDLENBQUM7WUFDckQsT0FBTyxXQUFXLENBQUM7UUFDcEIsQ0FBQztRQUVELG9CQUFvQixDQUFDLFFBQWEsRUFBRSxPQUF1RDtZQUMxRixNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztZQUN4RCxJQUFJLE9BQU8sRUFBRSxDQUFDO2dCQUNiLE1BQU0sR0FBRyxHQUFHLE9BQU8sQ0FBQyxPQUFnRixDQUFDO2dCQUNyRyxHQUFHLENBQUMsR0FBRyxDQUNOLENBQUMsT0FBTyxJQUFJLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxXQUFXLEVBQUUsQ0FBQyxDQUFDLFdBQVcsSUFBSSxDQUFDLENBQUMsR0FBRyxFQUFFLFdBQVcsRUFBRSxDQUFDLENBQUMsV0FBVyxFQUFFLFVBQVUsRUFBRSxDQUFDLENBQUMsVUFBVSxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxFQUNqSixTQUFTLENBQ1QsQ0FBQztZQUNILENBQUM7UUFDRixDQUFDO1FBRUQsYUFBYSxDQUFDLFFBQWE7WUFDMUIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFDNUMsQ0FBQztRQUVRLFdBQVc7WUFDbkIsT0FBTyxDQUFDLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBQ3JDLENBQUM7UUFFRCxtQkFBbUIsQ0FBQyxLQUFxQztZQUN4RCxJQUFJLENBQUMsb0JBQW9CLENBQUMsSUFBSSxDQUFDO2dCQUM5QixLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssSUFBSSxFQUFFO2dCQUN6QixPQUFPLEVBQUUsS0FBSyxFQUFFLE9BQU8sSUFBSSxFQUFFO2dCQUM3QixPQUFPLEVBQUUsS0FBSyxFQUFFLE9BQU8sSUFBSSxFQUFFO2FBQzdCLENBQUMsQ0FBQztRQUNKLENBQUM7S0FDRDtJQUVELEtBQUssQ0FBQyxHQUFHLEVBQUU7UUFDVixvQkFBb0IsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksd0JBQXdCLEVBQUUsQ0FBQyxDQUFDO1FBRWpFLGNBQWMsR0FBRyxJQUFJLGtCQUFrQixFQUFFLENBQUM7UUFDMUMsb0JBQW9CLENBQUMsSUFBSSxDQUFDLGVBQWUsRUFBRSxjQUFjLENBQUMsQ0FBQztRQUMzRCxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLElBQUksY0FBYyxFQUFFLENBQUMsQ0FBQztRQUM3RCxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLElBQUksS0FBTSxTQUFRLElBQUksRUFBa0I7U0FBSSxFQUFFLENBQUMsQ0FBQztRQUUxRixrQkFBa0IsR0FBRyxJQUFJLDZCQUE2QixDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzlELG9CQUFvQixDQUFDLElBQUksQ0FBQywwQkFBMEIsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO1FBRTFFLGNBQWMsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksc0JBQXNCLEVBQUUsQ0FBQyxDQUFDO1FBQ3pELG9CQUFvQixDQUFDLElBQUksQ0FBQyxlQUFlLEVBQUUsY0FBYyxDQUFDLENBQUM7UUFFM0QsT0FBTyxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQztRQUM1RSxPQUFPLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBQ3hDLEtBQUssR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQ2xDLEtBQUssR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxDQUFDO0lBQ25DLENBQUMsQ0FBQyxDQUFDO0lBRUgsUUFBUSxDQUFDLEdBQUcsRUFBRTtRQUNiLEtBQUssQ0FBQyxLQUFLLEVBQUUsQ0FBQztJQUNmLENBQUMsQ0FBQyxDQUFDO0lBRUgsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyx5QkFBeUI7SUFFekIsSUFBSSxDQUFDLHVCQUF1QixFQUFFLEdBQUcsRUFBRTtRQUNsQyxNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQ3BELE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLElBQUksd0NBQTJCLENBQUM7SUFDMUQsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsaUVBQWlFLEVBQUUsR0FBRyxFQUFFO1FBQzVFLE1BQU0sSUFBSSxHQUFHLE9BQU8sQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDN0MsTUFBTSxJQUFJLEdBQUcsT0FBTyxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUM3QyxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztJQUNoQyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxxRUFBcUUsRUFBRSxHQUFHLEVBQUU7UUFDaEYsTUFBTSxRQUFRLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBQy9DLE1BQU0sSUFBSSxHQUFHLE9BQU8sQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDN0MsTUFBTSxJQUFJLEdBQUcsT0FBTyxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUM5QyxNQUFNLENBQUMsY0FBYyxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztJQUNuQyxDQUFDLENBQUMsQ0FBQztJQUVILG9CQUFvQjtJQUVwQixJQUFJLENBQUMsK0NBQStDLEVBQUUsR0FBRyxFQUFFO1FBQzFELE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDN0QsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsZ0VBQWdFLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDakYsY0FBYyxDQUFDLE1BQU0sR0FBRyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLEVBQUUsRUFBRSxDQUFDO1FBQzFELE9BQU8sQ0FBQyxhQUFhLENBQUMsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztRQUU5RCxxQ0FBcUM7UUFDckMsTUFBTSxJQUFJLEVBQUUsQ0FBQztRQUViLE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDM0QsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUM3RCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxnREFBZ0QsRUFBRSxLQUFLLElBQUksRUFBRTtRQUNqRSxjQUFjLENBQUMsTUFBTSxHQUFHLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxRQUFRLEVBQUUsRUFBRSxFQUFFLENBQUM7UUFDMUQsT0FBTyxDQUFDLGFBQWEsQ0FBQyxPQUFPLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRTlELE1BQU0sSUFBSSxFQUFFLENBQUM7UUFFYixNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQzVELENBQUMsQ0FBQyxDQUFDO0lBRUgsd0JBQXdCO0lBRXhCLElBQUksQ0FBQyw0Q0FBNEMsRUFBRSxHQUFHLEVBQUU7UUFDdkQsY0FBYyxDQUFDLGtCQUFrQixFQUFFLENBQUM7UUFDcEMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxPQUFPLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRTlELE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDcEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsSUFBSSw4Q0FBOEIsQ0FBQztRQUM1RCxJQUFJLEtBQUssQ0FBQyxJQUFJLGdEQUFnQyxFQUFFLENBQUM7WUFDaEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQ3hDLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMxQyxDQUFDO1FBRUQsMkJBQTJCO1FBQzNCLGNBQWMsQ0FBQyxnQkFBZ0IsQ0FBQyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDcEUsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsb0RBQW9ELEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDckUsY0FBYyxDQUFDLE1BQU0sR0FBRyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLEVBQUUsRUFBRSxDQUFDO1FBQzFELE9BQU8sQ0FBQyxhQUFhLENBQUMsT0FBTyxFQUFFLElBQUksRUFBRTtZQUNwQyxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRTtZQUNyQyxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUU7U0FDckIsQ0FBQyxDQUFDO1FBRUgsTUFBTSxJQUFJLEVBQUUsQ0FBQztRQUViLE1BQU0sQ0FBQyxXQUFXLENBQUMsY0FBYyxDQUFDLGFBQWEsRUFBRSw4QkFBOEIsQ0FBQyxDQUFDO1FBQ2pGLE1BQU0sSUFBSSxHQUFHLGNBQWMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQW9ELENBQUM7UUFDN0YsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN6QyxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLFFBQVEsRUFBRSxFQUFFLEtBQUssQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO1FBQzFFLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLEVBQUUsUUFBUSxFQUFFLEVBQUUsS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFDeEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxRQUFRLEVBQUUsRUFBRSxLQUFLLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUMxRSxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxFQUFFLFNBQVMsQ0FBQyxDQUFDO0lBQ3RELENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLCtDQUErQyxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ2hFLGNBQWMsQ0FBQyxNQUFNLEdBQUc7WUFDdkIsSUFBSSxFQUFFLFNBQVM7WUFDZixRQUFRLEVBQUU7Z0JBQ1Q7b0JBQ0MsR0FBRyxFQUFFLEtBQUs7b0JBQ1YsS0FBSyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztvQkFDNUIsSUFBSSxFQUFFLFdBQVc7b0JBQ2pCLElBQUksRUFBRSxLQUFLO29CQUNYLFFBQVEsRUFBRSxNQUFNO2lCQUNoQjtnQkFDRDtvQkFDQyxHQUFHLEVBQUUsS0FBSztvQkFDVixLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO29CQUM5QixJQUFJLEVBQUUsYUFBYTtvQkFDbkIsSUFBSSxFQUFFLE9BQU87b0JBQ2IsUUFBUSxFQUFFLEtBQUs7aUJBQ2Y7YUFDRDtTQUNELENBQUM7UUFFRixPQUFPLENBQUMsYUFBYSxDQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDckYsTUFBTSxJQUFJLEVBQUUsQ0FBQztRQUViLE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDcEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsSUFBSSw0Q0FBNkIsQ0FBQztRQUMzRCxJQUFJLEtBQUssQ0FBQyxJQUFJLDhDQUErQixFQUFFLENBQUM7WUFDL0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQ3hDLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUN6QyxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzdDLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsV0FBVyxDQUFDLENBQUM7WUFDeEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQztZQUNsRCxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQ3ZELE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLEVBQUUsS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7WUFDdkUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxhQUFhLENBQUMsQ0FBQztRQUMzRCxDQUFDO0lBQ0YsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMscURBQXFELEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDdEUsY0FBYyxDQUFDLE1BQU0sR0FBRyxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLGFBQWEsRUFBRSxDQUFDO1FBQ2pFLE9BQU8sQ0FBQyxhQUFhLENBQUMsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztRQUU5RCxNQUFNLElBQUksRUFBRSxDQUFDO1FBRWIsTUFBTSxLQUFLLEdBQUcsT0FBTyxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUNwRCxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxJQUFJLDBDQUE0QixDQUFDO1FBQzFELElBQUksS0FBSyxDQUFDLElBQUksNENBQThCLEVBQUUsQ0FBQztZQUM5QyxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDeEMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3pDLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxhQUFhLENBQUMsQ0FBQztRQUNqRCxDQUFDO0lBQ0YsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMseURBQXlELEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDMUUsY0FBYyxDQUFDLE1BQU0sR0FBRyxFQUFFLElBQUksRUFBRSxXQUFXLEVBQUUsQ0FBQztRQUM5QyxPQUFPLENBQUMsYUFBYSxDQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFOUQsTUFBTSxJQUFJLEVBQUUsQ0FBQztRQUViLE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDcEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsSUFBSSx3Q0FBMkIsQ0FBQztJQUMxRCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx5REFBeUQsRUFBRSxLQUFLLElBQUksRUFBRTtRQUMxRSxjQUFjLENBQUMsTUFBTSxHQUFHLFNBQVMsQ0FBQztRQUNsQyxPQUFPLENBQUMsYUFBYSxDQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFOUQsTUFBTSxJQUFJLEVBQUUsQ0FBQztRQUViLE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDcEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsSUFBSSx3Q0FBMkIsQ0FBQztJQUMxRCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyw0REFBNEQsRUFBRSxLQUFLLElBQUksRUFBRTtRQUM3RSxjQUFjLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztRQUNwQyxPQUFPLENBQUMsYUFBYSxDQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDOUQsY0FBYyxDQUFDLGVBQWUsQ0FBQyxJQUFJLEtBQUssQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDO1FBRTNELE1BQU0sSUFBSSxFQUFFLENBQUM7UUFFYixNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQ3BELE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLElBQUksMENBQTRCLENBQUM7UUFDMUQsSUFBSSxLQUFLLENBQUMsSUFBSSw0Q0FBOEIsRUFBRSxDQUFDO1lBQzlDLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUN6QyxNQUFNLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUM7UUFDbkQsQ0FBQztJQUNGLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDREQUE0RCxFQUFFLEdBQUcsRUFBRTtRQUN2RSxjQUFjLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztRQUNwQyxPQUFPLENBQUMsYUFBYSxDQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFOUQsZ0RBQWdEO1FBQ2hELE9BQU8sQ0FBQyxhQUFhLENBQUMsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztRQUU5RCw2Q0FBNkM7UUFDN0MsTUFBTSxLQUFLLEdBQUcsT0FBTyxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUNwRCxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxJQUFJLDhDQUE4QixDQUFDO1FBRTVELGNBQWMsQ0FBQyxnQkFBZ0IsQ0FBQyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDcEUsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsOEVBQThFLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDL0YsY0FBYyxDQUFDLE1BQU0sR0FBRyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLENBQUMsRUFBRSxDQUFDO1FBQ3ZILE9BQU8sQ0FBQyxhQUFhLENBQUMsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM5RCxNQUFNLElBQUksRUFBRSxDQUFDO1FBRWIsMkJBQTJCO1FBQzNCLE9BQU8sQ0FBQyxhQUFhLENBQUMsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztRQUU5RCwrQkFBK0I7UUFDL0IsTUFBTSxLQUFLLEdBQUcsT0FBTyxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUNwRCxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxJQUFJLDRDQUE2QixDQUFDO1FBQzNELElBQUksS0FBSyxDQUFDLElBQUksOENBQStCLEVBQUUsQ0FBQztZQUMvQyxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzlDLENBQUM7SUFDRixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxnRkFBZ0YsRUFBRSxLQUFLLElBQUksRUFBRTtRQUNqRyxjQUFjLENBQUMsTUFBTSxHQUFHLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxRQUFRLEVBQUUsRUFBRSxFQUFFLENBQUM7UUFDMUQsT0FBTyxDQUFDLGFBQWEsQ0FBQyxPQUFPLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzlELE1BQU0sSUFBSSxFQUFFLENBQUM7UUFFYixjQUFjLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztRQUNwQyxPQUFPLENBQUMsYUFBYSxDQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFOUQsTUFBTSxLQUFLLEdBQUcsT0FBTyxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUNwRCxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxJQUFJLDhDQUE4QixDQUFDO1FBRTVELGNBQWMsQ0FBQyxnQkFBZ0IsQ0FBQyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDbkUsTUFBTSxJQUFJLEVBQUUsQ0FBQztJQUNkLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDBFQUEwRSxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQzNGLGNBQWMsQ0FBQyxNQUFNLEdBQUcsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLFFBQVEsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxDQUFDLEVBQUUsQ0FBQztRQUN2SCxPQUFPLENBQUMsYUFBYSxDQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDOUQsTUFBTSxJQUFJLEVBQUUsQ0FBQztRQUViLE1BQU0sWUFBWSxHQUFHLE9BQU8sQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDM0QsTUFBTSxDQUFDLFdBQVcsQ0FBQyxZQUFZLENBQUMsSUFBSSw0Q0FBNkIsQ0FBQztRQUNsRSxJQUFJLFlBQVksQ0FBQyxJQUFJLDhDQUErQixFQUFFLENBQUM7WUFDdEQsT0FBTztRQUNSLENBQUM7UUFFRCxPQUFPLENBQUMsYUFBYSxDQUFDLE9BQU8sRUFBRSxZQUFZLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBRTVELGNBQWMsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1FBQ3BDLE9BQU8sQ0FBQyxhQUFhLENBQUMsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztRQUU5RCxNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQ3BELE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLElBQUksOENBQThCLENBQUM7UUFFNUQsY0FBYyxDQUFDLGdCQUFnQixDQUFDLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxRQUFRLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNuRSxNQUFNLElBQUksRUFBRSxDQUFDO0lBQ2QsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsa0VBQWtFLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDbkYsY0FBYyxDQUFDLE1BQU0sR0FBRyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLEVBQUUsRUFBRSxDQUFDO1FBRTFELEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUM1QixPQUFPLENBQUMsYUFBYSxDQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDOUQsTUFBTSxJQUFJLEVBQUUsQ0FBQztRQUNkLENBQUM7UUFFRCxNQUFNLFdBQVcsR0FBRyxPQUFPLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQzFELE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLElBQUksNENBQTZCLENBQUM7UUFDakUsSUFBSSxXQUFXLENBQUMsSUFBSSw4Q0FBK0IsRUFBRSxDQUFDO1lBQ3JELE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNoRCxDQUFDO1FBRUQsY0FBYyxDQUFDLGtCQUFrQixFQUFFLENBQUM7UUFDcEMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxPQUFPLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRTlELE1BQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDekQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsSUFBSSw0Q0FBNkIsQ0FBQztRQUNoRSxJQUFJLFVBQVUsQ0FBQyxJQUFJLDhDQUErQixFQUFFLENBQUM7WUFDcEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQy9DLENBQUM7SUFDRixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx3REFBd0QsRUFBRSxLQUFLLElBQUksRUFBRTtRQUN6RSxtRUFBbUU7UUFDbkUsY0FBYyxDQUFDLE1BQU0sR0FBRyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLEVBQUUsRUFBRSxDQUFDO1FBQzFELE9BQU8sQ0FBQyxhQUFhLENBQUMsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM5RCxNQUFNLElBQUksRUFBRSxDQUFDO1FBRWIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUUzRCxrRUFBa0U7UUFDbEUsY0FBYyxDQUFDLE1BQU0sR0FBRyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsWUFBWSxFQUFFLENBQUMsRUFBRSxDQUFDO1FBQzFILE9BQU8sQ0FBQyxhQUFhLENBQUMsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM5RCxNQUFNLElBQUksRUFBRSxDQUFDO1FBRWIsTUFBTSxLQUFLLEdBQUcsT0FBTyxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUNwRCxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxJQUFJLDRDQUE2QixDQUFDO1FBQzNELElBQUksS0FBSyxDQUFDLElBQUksOENBQStCLEVBQUUsQ0FBQztZQUMvQyxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDeEMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztZQUM3QyxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLFlBQVksQ0FBQyxDQUFDO1FBQzFELENBQUM7UUFFRCx3QkFBd0I7UUFDeEIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUM3RCxDQUFDLENBQUMsQ0FBQztJQUVILHdCQUF3QjtJQUV4QixJQUFJLENBQUMsMENBQTBDLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDM0QsY0FBYyxDQUFDLE1BQU0sR0FBRztZQUN2QixJQUFJLEVBQUUsU0FBUztZQUNmLFFBQVEsRUFBRTtnQkFDVCxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxVQUFVLEVBQUU7Z0JBQzlELEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRTtnQkFDOUQsRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUFFO2FBQ2hFO1NBQ0QsQ0FBQztRQUVGLE9BQU8sQ0FBQyxhQUFhLENBQUMsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxFQUFFLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNyRixNQUFNLElBQUksRUFBRSxDQUFDO1FBRWIsTUFBTSxLQUFLLEdBQUcsT0FBTyxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUNwRCxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxJQUFJLDRDQUE2QixDQUFDO1FBQzNELElBQUksS0FBSyxDQUFDLElBQUksOENBQStCLEVBQUUsQ0FBQztZQUFDLE9BQU87UUFBQyxDQUFDO1FBRTFELE1BQU0sZUFBZSxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDMUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxPQUFPLEVBQUUsZUFBZSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBRW5ELE1BQU0sUUFBUSxHQUFHLE9BQU8sQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDdkQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsSUFBSSw0Q0FBNkIsQ0FBQztRQUM5RCxJQUFJLFFBQVEsQ0FBQyxJQUFJLDhDQUErQixFQUFFLENBQUM7WUFDbEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNoRCxNQUFNLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLFVBQVUsQ0FBQyxDQUFDO1lBQzFELE1BQU0sQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDM0QsQ0FBQztJQUNGLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGlEQUFpRCxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ2xFLGNBQWMsQ0FBQyxNQUFNLEdBQUc7WUFDdkIsSUFBSSxFQUFFLFNBQVM7WUFDZixRQUFRLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxVQUFVLEVBQUUsQ0FBQztTQUMxRSxDQUFDO1FBRUYsT0FBTyxDQUFDLGFBQWEsQ0FBQyxPQUFPLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzlELE1BQU0sSUFBSSxFQUFFLENBQUM7UUFFYixPQUFPLENBQUMsYUFBYSxDQUFDLE9BQU8sRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO1FBRWpELE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDcEQsSUFBSSxLQUFLLENBQUMsSUFBSSw4Q0FBK0IsRUFBRSxDQUFDO1lBQy9DLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDOUMsQ0FBQztJQUNGLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGdEQUFnRCxFQUFFLEdBQUcsRUFBRTtRQUMzRCxtQkFBbUI7UUFDbkIsT0FBTyxDQUFDLGFBQWEsQ0FBQyxPQUFPLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDMUMsTUFBTSxLQUFLLEdBQUcsT0FBTyxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUNwRCxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxJQUFJLHdDQUEyQixDQUFDO0lBQzFELENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLG1EQUFtRCxFQUFFLEdBQUcsRUFBRTtRQUM5RCxjQUFjLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztRQUNwQyxPQUFPLENBQUMsYUFBYSxDQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFOUQscURBQXFEO1FBQ3JELE9BQU8sQ0FBQyxhQUFhLENBQUMsT0FBTyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBRTFDLE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDcEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsSUFBSSw4Q0FBOEIsQ0FBQztRQUU1RCxjQUFjLENBQUMsZ0JBQWdCLENBQUMsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLFFBQVEsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQ3BFLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDJDQUEyQyxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQzVELGNBQWMsQ0FBQyxNQUFNLEdBQUc7WUFDdkIsSUFBSSxFQUFFLFNBQVM7WUFDZixRQUFRLEVBQUU7Z0JBQ1QsRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUFFO2dCQUM5RCxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxVQUFVLEVBQUU7YUFDOUQ7U0FDRCxDQUFDO1FBRUYsT0FBTyxDQUFDLGFBQWEsQ0FBQyxPQUFPLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzlELE1BQU0sSUFBSSxFQUFFLENBQUM7UUFFYixNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQ3BELElBQUksS0FBSyxDQUFDLElBQUksOENBQStCLEVBQUUsQ0FBQztZQUFDLE9BQU87UUFBQyxDQUFDO1FBRTFELE9BQU8sQ0FBQyxhQUFhLENBQUMsT0FBTyxFQUFFLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7UUFFckQsTUFBTSxRQUFRLEdBQUcsT0FBTyxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUN2RCxJQUFJLFFBQVEsQ0FBQyxJQUFJLDhDQUErQixFQUFFLENBQUM7WUFDbEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzVDLENBQUM7SUFDRixDQUFDLENBQUMsQ0FBQztJQUVILHdCQUF3QjtJQUV4QixJQUFJLENBQUMsOEJBQThCLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDL0MsY0FBYyxDQUFDLE1BQU0sR0FBRyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLEVBQUUsRUFBRSxDQUFDO1FBQzFELE9BQU8sQ0FBQyxhQUFhLENBQUMsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM5RCxNQUFNLElBQUksRUFBRSxDQUFDO1FBRWIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksNENBQTZCLENBQUM7UUFFM0YsT0FBTyxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUUvQixNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSx3Q0FBMkIsQ0FBQztJQUMxRixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyw0Q0FBNEMsRUFBRSxHQUFHLEVBQUU7UUFDdkQsY0FBYyxDQUFDLGtCQUFrQixFQUFFLENBQUM7UUFDcEMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxPQUFPLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRTlELE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLDhDQUE4QixDQUFDO1FBRTVGLE9BQU8sQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFL0IsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksd0NBQTJCLENBQUM7UUFFekYsa0VBQWtFO1FBQ2xFLGNBQWMsQ0FBQyxnQkFBZ0IsQ0FBQyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDOUgsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsOENBQThDLEVBQUUsR0FBRyxFQUFFO1FBQ3pELG1CQUFtQjtRQUNuQixPQUFPLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ2hDLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDZDQUE2QyxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQzlELGNBQWMsQ0FBQyxNQUFNLEdBQUcsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLFFBQVEsRUFBRSxFQUFFLEVBQUUsQ0FBQztRQUMxRCxPQUFPLENBQUMsYUFBYSxDQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDOUQsTUFBTSxJQUFJLEVBQUUsQ0FBQztRQUViLE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFM0QsT0FBTyxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUUvQixNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQzdELENBQUMsQ0FBQyxDQUFDO0lBRUgscUNBQXFDO0lBRXJDLElBQUksQ0FBQyxvQ0FBb0MsRUFBRSxLQUFLLElBQUksRUFBRTtRQUNyRCxNQUFNLFFBQVEsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFFL0MsY0FBYyxDQUFDLE1BQU0sR0FBRztZQUN2QixJQUFJLEVBQUUsU0FBUztZQUNmLFFBQVEsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLGtCQUFrQixFQUFFLENBQUM7U0FDbEYsQ0FBQztRQUNGLE9BQU8sQ0FBQyxhQUFhLENBQUMsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM5RCxNQUFNLElBQUksRUFBRSxDQUFDO1FBRWIsY0FBYyxDQUFDLE1BQU0sR0FBRztZQUN2QixJQUFJLEVBQUUsU0FBUztZQUNmLFFBQVEsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLGtCQUFrQixFQUFFLENBQUM7U0FDbEYsQ0FBQztRQUNGLE9BQU8sQ0FBQyxhQUFhLENBQUMsUUFBUSxFQUFFLElBQUksRUFBRSxDQUFDLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMvRCxNQUFNLElBQUksRUFBRSxDQUFDO1FBRWIsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUNyRCxNQUFNLE1BQU0sR0FBRyxPQUFPLENBQUMsY0FBYyxDQUFDLFFBQVEsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBRXRELE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLElBQUksNENBQTZCLENBQUM7UUFDNUQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsSUFBSSw0Q0FBNkIsQ0FBQztRQUU1RCxJQUFJLE1BQU0sQ0FBQyxJQUFJLDhDQUErQixJQUFJLE1BQU0sQ0FBQyxJQUFJLDhDQUErQixFQUFFLENBQUM7WUFDOUYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO1lBQ2hFLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztRQUNqRSxDQUFDO1FBRUQsOENBQThDO1FBQzlDLE9BQU8sQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDL0IsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksd0NBQTJCLENBQUM7UUFDekYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLFFBQVEsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksNENBQTZCLENBQUM7SUFDN0YsQ0FBQyxDQUFDLENBQUM7SUFFSCwwQkFBMEI7SUFFMUIsSUFBSSxDQUFDLGdEQUFnRCxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ2pFLGNBQWMsQ0FBQyxNQUFNLEdBQUc7WUFDdkIsSUFBSSxFQUFFLFNBQVM7WUFDZixRQUFRLEVBQUU7Z0JBQ1Q7b0JBQ0MsR0FBRyxFQUFFLG1CQUFtQjtvQkFDeEIsS0FBSyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztvQkFDNUIsSUFBSSxFQUFFLGdCQUFnQjtpQkFDdEI7YUFDRDtTQUNELENBQUM7UUFFRixPQUFPLENBQUMsYUFBYSxDQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDOUQsTUFBTSxJQUFJLEVBQUUsQ0FBQztRQUViLE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDcEQsSUFBSSxLQUFLLENBQUMsSUFBSSw4Q0FBK0IsRUFBRSxDQUFDO1lBQy9DLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLEVBQUUsbUJBQW1CLENBQUMsQ0FBQztRQUMzRSxDQUFDO0lBQ0YsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsb0RBQW9ELEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDckUsY0FBYyxDQUFDLE1BQU0sR0FBRztZQUN2QixJQUFJLEVBQUUsU0FBUztZQUNmLFFBQVEsRUFBRTtnQkFDVDtvQkFDQyxHQUFHLEVBQUUsS0FBSztvQkFDVixLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO29CQUM1QiwrQkFBK0I7aUJBQy9CO2FBQ0Q7U0FDRCxDQUFDO1FBRUYsT0FBTyxDQUFDLGFBQWEsQ0FBQyxPQUFPLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzlELE1BQU0sSUFBSSxFQUFFLENBQUM7UUFFYixNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQ3BELElBQUksS0FBSyxDQUFDLElBQUksOENBQStCLEVBQUUsQ0FBQztZQUMvQyxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQy9DLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDL0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUNuRCxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQzdELENBQUM7SUFDRixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyw2Q0FBNkMsRUFBRSxLQUFLLElBQUksRUFBRTtRQUM5RCxjQUFjLENBQUMsTUFBTSxHQUFHO1lBQ3ZCLElBQUksRUFBRSxTQUFTO1lBQ2YsUUFBUSxFQUFFO2dCQUNUO29CQUNDLEdBQUcsRUFBRSxLQUFLO29CQUNWLEtBQUssRUFBRTt3QkFDTixLQUFLLEVBQUUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLFNBQVMsRUFBRSxDQUFDLEVBQUU7d0JBQ2hDLEdBQUcsRUFBRSxFQUFFLElBQUksRUFBRSxDQUFDLEVBQUUsU0FBUyxFQUFFLENBQUMsRUFBRTtxQkFDOUI7b0JBQ0QsSUFBSSxFQUFFLG9CQUFvQjtvQkFDMUIsVUFBVSxFQUFFO3dCQUNYLEtBQUssRUFBRTs0QkFDTjtnQ0FDQyxLQUFLLEVBQUU7b0NBQ04sS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFBRSxTQUFTLEVBQUUsQ0FBQyxFQUFFO29DQUNoQyxHQUFHLEVBQUUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLFNBQVMsRUFBRSxDQUFDLEVBQUU7aUNBQzlCO2dDQUNELE9BQU8sRUFBRSxXQUFXO2dDQUNwQixPQUFPLEVBQUUsYUFBYTs2QkFDdEI7eUJBQ0Q7cUJBQ0Q7aUJBQ0Q7YUFDRDtTQUNELENBQUM7UUFFRixPQUFPLENBQUMsYUFBYSxDQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDOUQsTUFBTSxJQUFJLEVBQUUsQ0FBQztRQUViLE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDcEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsSUFBSSw0Q0FBNkIsQ0FBQztRQUMzRCxJQUFJLEtBQUssQ0FBQyxJQUFJLDhDQUErQixFQUFFLENBQUM7WUFDL0MsTUFBTSxDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3ZFLE1BQU0sQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxVQUFVLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzlGLENBQUM7SUFDRixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx1RUFBdUUsRUFBRSxLQUFLLElBQUksRUFBRTtRQUN4RixNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxxYUFBcWEsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVuZSxjQUFjLENBQUMsTUFBTSxHQUFHO1lBQ3ZCLElBQUksRUFBRSxTQUFTO1lBQ2YsUUFBUSxFQUFFO2dCQUNUO29CQUNDLEdBQUcsRUFBRSxhQUFhO29CQUNsQixLQUFLLEVBQUU7d0JBQ04sRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLFNBQVMsRUFBRSxDQUFDLEVBQUU7d0JBQzFCLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxTQUFTLEVBQUUsQ0FBQyxFQUFFO3FCQUMxQjtvQkFDRCxJQUFJLEVBQUUscUJBQXFCO29CQUMzQixJQUFJLEVBQUUsS0FBSztvQkFDWCxRQUFRLEVBQUUsUUFBUTtpQkFDbEI7YUFDRDtTQUNELENBQUM7UUFFRixPQUFPLENBQUMsYUFBYSxDQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDOUQsTUFBTSxJQUFJLEVBQUUsQ0FBQztRQUViLE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDcEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsSUFBSSw0Q0FBNkIsQ0FBQztRQUMzRCxJQUFJLEtBQUssQ0FBQyxJQUFJLDhDQUErQixFQUFFLENBQUM7WUFDL0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7WUFDM0YsTUFBTSxDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzFFLENBQUM7SUFDRixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQywrQkFBK0IsRUFBRSxLQUFLLElBQUksRUFBRTtRQUNoRCxjQUFjLENBQUMsTUFBTSxHQUFHO1lBQ3ZCLElBQUksRUFBRSxTQUFTO1lBQ2YsUUFBUSxFQUFFO2dCQUNULEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRTtnQkFDdkQsRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFO2FBQ3ZEO1NBQ0QsQ0FBQztRQUVGLE9BQU8sQ0FBQyxhQUFhLENBQUMsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM5RCxNQUFNLElBQUksRUFBRSxDQUFDO1FBRWIsTUFBTSxLQUFLLEdBQUcsT0FBTyxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUNwRCxJQUFJLEtBQUssQ0FBQyxJQUFJLDhDQUErQixFQUFFLENBQUM7WUFDL0MsTUFBTSxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ25FLENBQUM7SUFDRixDQUFDLENBQUMsQ0FBQztJQUVILGdDQUFnQztJQUVoQyxJQUFJLENBQUMsdUNBQXVDLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDeEQsTUFBTSxNQUFNLEdBQWEsRUFBRSxDQUFDO1FBQzVCLE1BQU0sR0FBRyxHQUFHLE9BQU8sQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFNUMsd0JBQXdCO1FBQ3hCLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBRTVCLGNBQWMsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1FBQ3BDLE9BQU8sQ0FBQyxhQUFhLENBQUMsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM5RCxNQUFNLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUU1QixjQUFjLENBQUMsZ0JBQWdCLENBQUMsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLFFBQVEsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ25FLE1BQU0sSUFBSSxFQUFFLENBQUM7UUFDYixNQUFNLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUU1QixPQUFPLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQy9CLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBRTVCLE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxFQUFFOzs7OztTQUs5QixDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILDhCQUE4QjtJQUU5QixJQUFJLENBQUMseUNBQXlDLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDMUQsY0FBYyxDQUFDLE1BQU0sR0FBRztZQUN2QixJQUFJLEVBQUUsU0FBUztZQUNmLFFBQVEsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLG1CQUFtQixFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxDQUFDO1NBQ2xILENBQUM7UUFDRixPQUFPLENBQUMsYUFBYSxDQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDOUQsTUFBTSxJQUFJLEVBQUUsQ0FBQztRQUViLE1BQU0sR0FBRyxHQUFHLGNBQWMsQ0FBQyxHQUFHLENBQUMsb0JBQW9CLGlDQUF5QixDQUFDO1FBQzdFLE1BQU0sQ0FBQyxFQUFFLENBQUMsR0FBRyxFQUFFLG9DQUFvQyxDQUFDLENBQUM7UUFDckQsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFJLENBQUMsQ0FBQztRQUNoQyxNQUFNLFVBQVUsR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFDOUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUN0QixNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDN0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzlDLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDbEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxtQkFBbUIsQ0FBQyxDQUFDO0lBQ3RFLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHVEQUF1RCxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ3hFLGNBQWMsQ0FBQyxNQUFNLEdBQUc7WUFDdkIsSUFBSSxFQUFFLFNBQVM7WUFDZixRQUFRLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxrQkFBa0IsRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsQ0FBQztTQUNqSCxDQUFDO1FBQ0YsT0FBTyxDQUFDLGFBQWEsQ0FBQyxPQUFPLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzlELE1BQU0sSUFBSSxFQUFFLENBQUM7UUFFYixnREFBZ0Q7UUFDaEQsTUFBTSxRQUFRLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDO1FBQ25GLE1BQU0sS0FBSyxHQUFHLFFBQVEsQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDckQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsSUFBSSw0Q0FBNkIsQ0FBQztRQUMzRCxJQUFJLEtBQUssQ0FBQyxJQUFJLDhDQUErQixFQUFFLENBQUM7WUFDL0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQ3hDLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUN6QyxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzdDLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztZQUMvRCxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxFQUFFLEtBQUssQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO1lBQ3ZFLE1BQU0sQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsRUFBRSxlQUFlLEVBQUUsQ0FBQyxFQUFFLFdBQVcsRUFBRSxDQUFDLEVBQUUsYUFBYSxFQUFFLENBQUMsRUFBRSxTQUFTLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUN6SCxDQUFDO0lBQ0YsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsa0RBQWtELEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDbkUsY0FBYyxDQUFDLE1BQU0sR0FBRztZQUN2QixJQUFJLEVBQUUsU0FBUztZQUNmLFFBQVEsRUFBRSxDQUFDO29CQUNWLEdBQUcsRUFBRSxLQUFLO29CQUNWLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7b0JBQzVCLElBQUksRUFBRSxvQkFBb0I7b0JBQzFCLFVBQVUsRUFBRTt3QkFDWCxLQUFLLEVBQUUsQ0FBQztnQ0FDUCxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO2dDQUM3QixPQUFPLEVBQUUsWUFBWTtnQ0FDckIsT0FBTyxFQUFFLGNBQWM7NkJBQ3ZCLENBQUM7cUJBQ0Y7aUJBQ0QsQ0FBQztTQUNGLENBQUM7UUFDRixPQUFPLENBQUMsYUFBYSxDQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDOUQsTUFBTSxJQUFJLEVBQUUsQ0FBQztRQUViLE1BQU0sUUFBUSxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQztRQUNuRixNQUFNLEtBQUssR0FBRyxRQUFRLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQ3JELE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLElBQUksNENBQTZCLENBQUM7UUFDM0QsSUFBSSxLQUFLLENBQUMsSUFBSSw4Q0FBK0IsRUFBRSxDQUFDO1lBQy9DLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxVQUFVLEVBQUUsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNsRSxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLEVBQUUsWUFBWSxDQUFDLENBQUM7WUFDakYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxFQUFFLGNBQWMsQ0FBQyxDQUFDO1FBQ3BGLENBQUM7SUFDRixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQywrQkFBK0IsRUFBRSxLQUFLLElBQUksRUFBRTtRQUNoRCxjQUFjLENBQUMsTUFBTSxHQUFHO1lBQ3ZCLElBQUksRUFBRSxTQUFTO1lBQ2YsUUFBUSxFQUFFO2dCQUNULEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRTtnQkFDOUQsRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUFFO2FBQzlEO1NBQ0QsQ0FBQztRQUNGLE9BQU8sQ0FBQyxhQUFhLENBQUMsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM5RCxNQUFNLElBQUksRUFBRSxDQUFDO1FBRWIsTUFBTSxLQUFLLEdBQUcsT0FBTyxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUNwRCxJQUFJLEtBQUssQ0FBQyxJQUFJLDhDQUErQixFQUFFLENBQUM7WUFBQyxPQUFPO1FBQUMsQ0FBQztRQUUxRCxPQUFPLENBQUMsYUFBYSxDQUFDLE9BQU8sRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBRXJELE1BQU0sR0FBRyxHQUFHLGNBQWMsQ0FBQyxHQUFHLENBQUMsb0JBQW9CLGlDQUF5QixDQUFDO1FBQzdFLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBSSxDQUFDLENBQUM7UUFDaEMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRSxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLFVBQVUsQ0FBQyxDQUFDO0lBQzdFLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDRDQUE0QyxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQzdELGNBQWMsQ0FBQyxNQUFNLEdBQUcsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLFFBQVEsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQztRQUNqSCxPQUFPLENBQUMsYUFBYSxDQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDOUQsTUFBTSxJQUFJLEVBQUUsQ0FBQztRQUViLE1BQU0sQ0FBQyxFQUFFLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsaUNBQXlCLENBQUMsQ0FBQztRQUU1RSxPQUFPLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBRS9CLE1BQU0sQ0FBQyxXQUFXLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsaUNBQXlCLEVBQUUsU0FBUyxDQUFDLENBQUM7SUFDakcsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMseUNBQXlDLEVBQUUsR0FBRyxFQUFFO1FBQ3BELGNBQWMsQ0FBQyxLQUFLLENBQUMsb0JBQW9CLEVBQUUsbUJBQW1CLGdFQUFnRCxDQUFDO1FBRS9HLE1BQU0sUUFBUSxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQztRQUNuRixNQUFNLEtBQUssR0FBRyxRQUFRLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQ3JELE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLElBQUksd0NBQTJCLENBQUM7SUFDMUQsQ0FBQyxDQUFDLENBQUM7SUFFSCxvQ0FBb0M7SUFFcEMsSUFBSSxDQUFDLHlDQUF5QyxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQzFELGNBQWMsQ0FBQyxNQUFNLEdBQUcsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLFFBQVEsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxDQUFDLEVBQUUsQ0FBQztRQUN2SCxPQUFPLENBQUMsYUFBYSxDQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDOUQsTUFBTSxJQUFJLEVBQUUsQ0FBQztRQUViLE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLDRDQUE2QixDQUFDO1FBRTNGLE1BQU0sV0FBVyxHQUFHLGtCQUFrQixDQUFDLFVBQVUsQ0FBQyxPQUFPLEVBQUUsU0FBUyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzVFLGtCQUFrQixDQUFDLG1CQUFtQixDQUFDLEVBQUUsT0FBTyxFQUFFLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBRW5FLE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLHdDQUEyQixDQUFDO1FBQ3pGLE1BQU0sQ0FBQyxXQUFXLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsaUNBQXlCLEVBQUUsU0FBUyxDQUFDLENBQUM7SUFDakcsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsc0RBQXNELEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDdkUsTUFBTSxPQUFPLEdBQThCO1lBQzFDLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxXQUFXLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRSxDQUFDLEVBQUUsU0FBUyxFQUFFLENBQUMsRUFBRTtTQUMvRCxDQUFDO1FBQ0YsTUFBTSxLQUFLLEdBQUcsb0NBQW9DLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDNUQsTUFBTSxPQUFPLEdBQUcsb0JBQW9CLENBQUMsS0FBSyxDQUFDLENBQUM7UUFFNUMsY0FBYyxDQUFDLE1BQU0sR0FBRyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLENBQUMsRUFBRSxDQUFDO1FBQ3ZILE9BQU8sQ0FBQyxhQUFhLENBQUMsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLENBQUMsQ0FBQztRQUMvQyxNQUFNLElBQUksRUFBRSxDQUFDO1FBRWIsTUFBTSxXQUFXLEdBQUcsa0JBQWtCLENBQUMsVUFBVSxDQUFDLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDM0Usa0JBQWtCLENBQUMsbUJBQW1CLENBQUMsRUFBRSxPQUFPLEVBQUUsQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLENBQUM7UUFFbkUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksNENBQTZCLENBQUM7SUFDNUYsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsb0RBQW9ELEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDckUsTUFBTSxPQUFPLEdBQThCO1lBQzFDLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxXQUFXLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRSxDQUFDLEVBQUUsU0FBUyxFQUFFLENBQUMsRUFBRTtTQUMvRCxDQUFDO1FBQ0Ysa0JBQWtCLENBQUMsVUFBVSxDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQztRQUVoRCxNQUFNLEtBQUssR0FBRyxvQ0FBb0MsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUM1RCxNQUFNLE9BQU8sR0FBRyxvQkFBb0IsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUU1QyxjQUFjLENBQUMsTUFBTSxHQUFHLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxRQUFRLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxlQUFlLEVBQUUsQ0FBQyxFQUFFLENBQUM7UUFDN0gsT0FBTyxDQUFDLGFBQWEsQ0FBQyxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQy9DLE1BQU0sSUFBSSxFQUFFLENBQUM7UUFFYixNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSw0Q0FBNkIsQ0FBQztRQUUzRixNQUFNLFVBQVUsR0FBOEI7WUFDN0MsRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLFdBQVcsRUFBRSxLQUFLLEVBQUUsVUFBVSxFQUFFLENBQUMsRUFBRSxTQUFTLEVBQUUsQ0FBQyxFQUFFO1lBQy9ELEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxXQUFXLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRSxDQUFDLEVBQUUsU0FBUyxFQUFFLENBQUMsRUFBRTtTQUMvRCxDQUFDO1FBQ0Ysa0JBQWtCLENBQUMsb0JBQW9CLENBQUMsT0FBTyxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBQzdELGtCQUFrQixDQUFDLG1CQUFtQixFQUFFLENBQUM7UUFFekMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksd0NBQTJCLENBQUM7UUFDekYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLG9CQUFvQixpQ0FBeUIsRUFBRSxTQUFTLENBQUMsQ0FBQztJQUNqRyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxxREFBcUQsRUFBRSxLQUFLLElBQUksRUFBRTtRQUN0RSxjQUFjLENBQUMsTUFBTSxHQUFHLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxRQUFRLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxrQkFBa0IsRUFBRSxDQUFDLEVBQUUsQ0FBQztRQUNoSSxPQUFPLENBQUMsYUFBYSxDQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDOUQsTUFBTSxJQUFJLEVBQUUsQ0FBQztRQUViLE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLDRDQUE2QixDQUFDO1FBRTNGLGtCQUFrQixDQUFDLG1CQUFtQixFQUFFLENBQUM7UUFFekMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksd0NBQTJCLENBQUM7SUFDMUYsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsK0NBQStDLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDaEUsa0JBQWtCLENBQUMsVUFBVSxDQUFDLE9BQU8sRUFBRTtZQUN0QyxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsV0FBVyxFQUFFLEtBQUssRUFBRSxVQUFVLEVBQUUsQ0FBQyxFQUFFLFNBQVMsRUFBRSxDQUFDLEVBQUU7U0FDL0QsQ0FBQyxDQUFDO1FBRUgsY0FBYyxDQUFDLE1BQU0sR0FBRyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLENBQUMsRUFBRSxDQUFDO1FBQ3ZILE9BQU8sQ0FBQyxhQUFhLENBQUMsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM5RCxNQUFNLElBQUksRUFBRSxDQUFDO1FBRWIsa0JBQWtCLENBQUMsb0JBQW9CLENBQUMsT0FBTyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQzVELGtCQUFrQixDQUFDLG1CQUFtQixFQUFFLENBQUM7UUFFekMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksd0NBQTJCLENBQUM7SUFDMUYsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsbURBQW1ELEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDcEUsTUFBTSxPQUFPLEdBQThCO1lBQzFDLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxXQUFXLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRSxDQUFDLEVBQUUsU0FBUyxFQUFFLENBQUMsRUFBRTtTQUMvRCxDQUFDO1FBQ0Ysa0JBQWtCLENBQUMsVUFBVSxDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQztRQUVoRCxNQUFNLEtBQUssR0FBRyxvQ0FBb0MsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUM1RCxNQUFNLE9BQU8sR0FBRyxvQkFBb0IsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUU1QyxjQUFjLENBQUMsTUFBTSxHQUFHLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxRQUFRLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxlQUFlLEVBQUUsQ0FBQyxFQUFFLENBQUM7UUFDN0gsT0FBTyxDQUFDLGFBQWEsQ0FBQyxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQy9DLE1BQU0sSUFBSSxFQUFFLENBQUM7UUFFYixrQkFBa0IsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO1FBRXpDLE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDcEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsSUFBSSw0Q0FBNkIsQ0FBQztRQUMzRCxJQUFJLEtBQUssQ0FBQyxJQUFJLDhDQUErQixFQUFFLENBQUM7WUFDL0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxlQUFlLENBQUMsQ0FBQztRQUM3RCxDQUFDO0lBQ0YsQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQztBQUVILFNBQVMsSUFBSTtJQUNaLE9BQU8sSUFBSSxPQUFPLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDdkQsQ0FBQyJ9