/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { AgentHostEditingSession } from '../../../browser/agentSessions/agentHost/agentHostEditingSession.js';
import { autorun } from '../../../../../../base/common/observable.js';
// ---- Test helpers -----------------------------------------------------------
/**
 * Waits for an observable to satisfy a condition by subscribing to it.
 */
function waitForObservable(obs, predicate, timeoutMs = 2000) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            d.dispose();
            reject(new Error(`waitForObservable timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        const d = autorun(reader => {
            const value = obs.read(reader);
            if (predicate(value)) {
                clearTimeout(timeout);
                queueMicrotask(() => {
                    d.dispose();
                    resolve(value);
                });
            }
        });
    });
}
function makeToolCall(opts) {
    return {
        status: "completed" /* ToolCallStatus.Completed */,
        toolCallId: opts.toolCallId,
        toolName: 'codeEdit',
        displayName: 'Edit File',
        invocationMessage: 'Editing file',
        toolInput: JSON.stringify({ path: opts.filePath }),
        success: true,
        pastTenseMessage: 'Edited file',
        confirmed: "not-needed" /* ToolCallConfirmationReason.NotNeeded */,
        content: [{
                type: "fileEdit" /* ToolResultContentType.FileEdit */,
                before: {
                    uri: URI.file(opts.filePath).toString(),
                    content: { uri: opts.beforeURI },
                },
                after: {
                    uri: URI.file(opts.filePath).toString(),
                    content: { uri: opts.afterURI },
                },
                diff: {
                    added: opts.added ?? 0,
                    removed: opts.removed ?? 0,
                },
            }],
    };
}
function makeMockFileService(contentMap) {
    return new class extends mock() {
        async readFile(uri) {
            const key = uri.toString();
            const data = contentMap.get(key);
            if (data === undefined) {
                throw new Error(`Content not found: ${key}`);
            }
            return { value: VSBuffer.fromString(data) };
        }
        async writeFile(uri, content) {
            contentMap.set(uri.toString(), content.toString());
            return {};
        }
        async del(uri) {
            contentMap.delete(uri.toString());
        }
        async move(source, target) {
            const data = contentMap.get(source.toString());
            if (data !== undefined) {
                contentMap.set(target.toString(), data);
                contentMap.delete(source.toString());
            }
            return {};
        }
    };
}
function createSession(store, contentMap, opts) {
    const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/test-session' });
    const mockEditorService = new class extends mock() {
        constructor() {
            super(...arguments);
            this.onDidActiveEditorChange = Event.None;
        }
    };
    const mockInstantiationService = new class extends mock() {
    };
    const mockFileService = makeMockFileService(contentMap);
    const mockTextModelService = new class extends mock() {
        async createModelReference(uri) {
            const content = contentMap.get(uri.toString()) ?? '';
            return {
                object: { textEditorModel: { uri, getValue: () => content } },
                dispose: () => { },
            };
        }
    };
    const mockEditorWorkerService = new class extends mock() {
        async computeDiff(_original, _modified) {
            return opts?.computeDiffResult ?? { identical: false, quitEarly: false, changes: [], moves: [] };
        }
    };
    const session = new AgentHostEditingSession(sessionResource, 'local', mockEditorService, mockInstantiationService, new NullLogService(), mockFileService, mockTextModelService, mockEditorWorkerService);
    store.add(session);
    return session;
}
// ---- Tests ------------------------------------------------------------------
suite('AgentHostEditingSession', () => {
    const store = new DisposableStore();
    teardown(() => store.clear());
    ensureNoDisposablesAreLeakedInTestSuite();
    test('initial state', () => {
        const session = createSession(store, new Map());
        assert.strictEqual(session.supportsKeepUndo, true);
        assert.strictEqual(session.isGlobalEditingSession, false);
        assert.strictEqual(session.state.get(), 2 /* ChatEditingSessionState.Idle */);
        assert.deepStrictEqual(session.entries.get(), []);
        assert.strictEqual(session.canUndo.get(), false);
        assert.strictEqual(session.canRedo.get(), false);
    });
    test('addToolCallEdits hydrates entries and transitions state', () => {
        const session = createSession(store, new Map());
        session.addToolCallEdits('req-1', makeToolCall({
            toolCallId: 'tc-1',
            filePath: '/workspace/file.ts',
            beforeURI: 'content://before-1',
            afterURI: 'content://after-1',
            added: 5,
            removed: 2,
        }));
        assert.strictEqual(session.state.get(), 2 /* ChatEditingSessionState.Idle */);
        assert.strictEqual(session.entries.get().length, 1);
        const entry = session.entries.get()[0];
        assert.strictEqual(entry.lastModifyingRequestId, 'req-1');
        assert.strictEqual(entry.state.get(), 1 /* ModifiedFileEntryState.Accepted */);
        assert.strictEqual(entry.linesAdded?.get(), 5);
        assert.strictEqual(entry.linesRemoved?.get(), 2);
        assert.strictEqual(session.canUndo.get(), true);
        assert.strictEqual(session.canRedo.get(), false);
    });
    test('addToolCallEdits ignores non-completed tool calls', () => {
        const session = createSession(store, new Map());
        const tc = { ...makeToolCall({ toolCallId: 'tc-1', filePath: '/f.ts', beforeURI: 'b', afterURI: 'a' }), status: "running" /* ToolCallStatus.Running */ };
        session.addToolCallEdits('req-1', tc);
        assert.strictEqual(session.state.get(), 2 /* ChatEditingSessionState.Idle */);
        assert.deepStrictEqual(session.entries.get(), []);
    });
    test('addToolCallEdits deduplicates by toolCallId', () => {
        const session = createSession(store, new Map());
        const tc = makeToolCall({ toolCallId: 'tc-1', filePath: '/f.ts', beforeURI: 'b', afterURI: 'a', added: 3 });
        session.addToolCallEdits('req-1', tc);
        session.addToolCallEdits('req-1', tc);
        assert.strictEqual(session.entries.get().length, 1);
    });
    test('multiple tool calls to same file accumulate diffs', () => {
        const session = createSession(store, new Map());
        session.addToolCallEdits('req-1', makeToolCall({
            toolCallId: 'tc-1',
            filePath: '/workspace/file.ts',
            beforeURI: 'content://before-1',
            afterURI: 'content://after-1',
            added: 5,
            removed: 2,
        }));
        session.addToolCallEdits('req-2', makeToolCall({
            toolCallId: 'tc-2',
            filePath: '/workspace/file.ts',
            beforeURI: 'content://after-1',
            afterURI: 'content://after-2',
            added: 3,
            removed: 1,
        }));
        // Should merge into one entry with accumulated counts
        assert.strictEqual(session.entries.get().length, 1);
        const entry = session.entries.get()[0];
        assert.strictEqual(entry.linesAdded?.get(), 8);
        assert.strictEqual(entry.linesRemoved?.get(), 3);
        assert.strictEqual(entry.lastModifyingRequestId, 'req-2');
    });
    test('multiple tool calls to different files create separate entries', () => {
        const session = createSession(store, new Map());
        session.addToolCallEdits('req-1', makeToolCall({
            toolCallId: 'tc-1',
            filePath: '/workspace/a.ts',
            beforeURI: 'content://before-a',
            afterURI: 'content://after-a',
            added: 2,
        }));
        session.addToolCallEdits('req-1', makeToolCall({
            toolCallId: 'tc-2',
            filePath: '/workspace/b.ts',
            beforeURI: 'content://before-b',
            afterURI: 'content://after-b',
            added: 4,
        }));
        assert.strictEqual(session.entries.get().length, 2);
    });
    test('getEntry finds entry by URI', () => {
        const session = createSession(store, new Map());
        session.addToolCallEdits('req-1', makeToolCall({
            toolCallId: 'tc-1',
            filePath: '/workspace/file.ts',
            beforeURI: 'content://before-1',
            afterURI: 'content://after-1',
        }));
        const entry = session.entries.get()[0];
        assert.ok(session.getEntry(entry.modifiedURI));
        assert.strictEqual(session.getEntry(URI.parse('file:///nonexistent')), undefined);
    });
    test('hasEditsInRequest', () => {
        const session = createSession(store, new Map());
        session.addToolCallEdits('req-1', makeToolCall({
            toolCallId: 'tc-1',
            filePath: '/workspace/file.ts',
            beforeURI: 'b',
            afterURI: 'a',
        }));
        assert.strictEqual(session.hasEditsInRequest('req-1'), true);
        assert.strictEqual(session.hasEditsInRequest('req-other'), false);
    });
    test('getDiffForSession aggregates diff stats', async () => {
        const diffResult = {
            identical: false, quitEarly: false, moves: [],
            changes: [{
                    original: { startLineNumber: 1, endLineNumberExclusive: 3 },
                    modified: { startLineNumber: 1, endLineNumberExclusive: 6 },
                    innerChanges: null,
                }],
        };
        const session = createSession(store, new Map(), { computeDiffResult: diffResult });
        session.addToolCallEdits('req-1', makeToolCall({
            toolCallId: 'tc-1',
            filePath: '/workspace/a.ts',
            beforeURI: 'b1',
            afterURI: 'a1',
        }));
        session.addToolCallEdits('req-2', makeToolCall({
            toolCallId: 'tc-2',
            filePath: '/workspace/b.ts',
            beforeURI: 'b2',
            afterURI: 'a2',
        }));
        // Each file produces +5 -2 from the mock diff result, wait for both
        const stats = await waitForObservable(session.getDiffForSession(), s => s.added === 10);
        assert.deepStrictEqual(stats, { added: 10, removed: 4 });
    });
    suite('undo/redo', () => {
        test('undo writes before-content to file and updates state', async () => {
            const beforeContentUri = toAgentHostUri(URI.parse('content://before-1'), 'local');
            const fileUri = toAgentHostUri(URI.file('/workspace/file.ts'), 'local');
            const contentMap = new Map();
            contentMap.set(beforeContentUri.toString(), 'before-content');
            contentMap.set(fileUri.toString(), 'current-content');
            const session = createSession(store, contentMap);
            session.addToolCallEdits('req-1', makeToolCall({
                toolCallId: 'tc-1',
                filePath: '/workspace/file.ts',
                beforeURI: 'content://before-1',
                afterURI: 'content://after-1',
            }));
            await session.undoInteraction();
            assert.strictEqual(contentMap.get(fileUri.toString()), 'before-content');
            assert.strictEqual(session.canUndo.get(), false);
            assert.strictEqual(session.canRedo.get(), true);
            assert.deepStrictEqual(session.entries.get(), []);
        });
        test('redo writes after-content to file', async () => {
            const beforeContentUri = toAgentHostUri(URI.parse('content://before-1'), 'local');
            const afterContentUri = toAgentHostUri(URI.parse('content://after-1'), 'local');
            const fileUri = toAgentHostUri(URI.file('/workspace/file.ts'), 'local');
            const contentMap = new Map();
            contentMap.set(beforeContentUri.toString(), 'before-content');
            contentMap.set(afterContentUri.toString(), 'after-content');
            contentMap.set(fileUri.toString(), 'current-content');
            const session = createSession(store, contentMap);
            session.addToolCallEdits('req-1', makeToolCall({
                toolCallId: 'tc-1',
                filePath: '/workspace/file.ts',
                beforeURI: 'content://before-1',
                afterURI: 'content://after-1',
            }));
            await session.undoInteraction();
            await session.redoInteraction();
            assert.strictEqual(contentMap.get(fileUri.toString()), 'after-content');
            assert.strictEqual(session.canUndo.get(), true);
            assert.strictEqual(session.canRedo.get(), false);
            assert.strictEqual(session.entries.get().length, 1);
        });
        test('undo when nothing to undo is no-op', async () => {
            const session = createSession(store, new Map());
            await session.undoInteraction();
            // No assertions needed — just verifying no throw
        });
        test('redo when nothing to redo is no-op', async () => {
            const session = createSession(store, new Map());
            session.addToolCallEdits('req-1', makeToolCall({
                toolCallId: 'tc-1',
                filePath: '/f.ts',
                beforeURI: 'b',
                afterURI: 'a',
            }));
            await session.redoInteraction();
            // No assertions needed — just verifying no throw
        });
        test('undo after multiple checkpoints removes entries correctly', async () => {
            const contentMap = new Map();
            contentMap.set(toAgentHostUri(URI.parse('content://before-a'), 'local').toString(), 'a-before');
            contentMap.set(toAgentHostUri(URI.parse('content://before-b'), 'local').toString(), 'b-before');
            contentMap.set(toAgentHostUri(URI.file('/workspace/a.ts'), 'local').toString(), 'a-current');
            contentMap.set(toAgentHostUri(URI.file('/workspace/b.ts'), 'local').toString(), 'b-current');
            const session = createSession(store, contentMap);
            session.addToolCallEdits('req-1', makeToolCall({
                toolCallId: 'tc-1',
                filePath: '/workspace/a.ts',
                beforeURI: 'content://before-a',
                afterURI: 'content://after-a',
                added: 5,
            }));
            session.addToolCallEdits('req-2', makeToolCall({
                toolCallId: 'tc-2',
                filePath: '/workspace/b.ts',
                beforeURI: 'content://before-b',
                afterURI: 'content://after-b',
                added: 3,
            }));
            assert.strictEqual(session.entries.get().length, 2);
            await session.undoInteraction();
            // Only a.ts should remain (b.ts was undone)
            assert.strictEqual(session.entries.get().length, 1);
            assert.ok(session.entries.get()[0].modifiedURI.path.includes('a.ts'));
        });
    });
    suite('getDiffsForFilesInSession', () => {
        test('returns diffs for all files', async () => {
            const diffResult = {
                identical: false, quitEarly: false, moves: [],
                changes: [{
                        original: { startLineNumber: 1, endLineNumberExclusive: 3 },
                        modified: { startLineNumber: 1, endLineNumberExclusive: 11 },
                        innerChanges: null,
                    }],
            };
            const session = createSession(store, new Map(), { computeDiffResult: diffResult });
            session.addToolCallEdits('req-1', makeToolCall({
                toolCallId: 'tc-1',
                filePath: '/workspace/a.ts',
                beforeURI: 'b1',
                afterURI: 'a1',
            }));
            const diffs = await waitForObservable(session.getDiffsForFilesInSession(), d => d.length > 0 && d[0].added > 0);
            assert.strictEqual(diffs.length, 1);
            assert.strictEqual(diffs[0].added, 10);
            assert.strictEqual(diffs[0].removed, 2);
            assert.strictEqual(diffs[0].isFinal, true);
        });
    });
    suite('getDiffsForFilesInRequest', () => {
        test('returns diffs scoped to a request', async () => {
            const diffResult = {
                identical: false, quitEarly: false, moves: [],
                changes: [{
                        original: { startLineNumber: 1, endLineNumberExclusive: 1 },
                        modified: { startLineNumber: 1, endLineNumberExclusive: 6 },
                        innerChanges: null,
                    }],
            };
            const session = createSession(store, new Map(), { computeDiffResult: diffResult });
            session.addToolCallEdits('req-1', makeToolCall({
                toolCallId: 'tc-1',
                filePath: '/workspace/a.ts',
                beforeURI: 'b1',
                afterURI: 'a1',
            }));
            session.addToolCallEdits('req-2', makeToolCall({
                toolCallId: 'tc-2',
                filePath: '/workspace/b.ts',
                beforeURI: 'b2',
                afterURI: 'a2',
            }));
            const req1Diffs = await waitForObservable(session.getDiffsForFilesInRequest('req-1'), d => d.length > 0 && d[0].added > 0);
            assert.strictEqual(req1Diffs.length, 1);
            assert.strictEqual(req1Diffs[0].added, 5);
            const req2Diffs = await waitForObservable(session.getDiffsForFilesInRequest('req-2'), d => d.length > 0 && d[0].added > 0);
            assert.strictEqual(req2Diffs.length, 1);
            assert.strictEqual(req2Diffs[0].added, 5);
            const noReqDiffs = session.getDiffsForFilesInRequest('req-none').get();
            assert.strictEqual(noReqDiffs.length, 0);
        });
    });
    suite('snapshots', () => {
        test('getSnapshotUri returns URI for valid checkpoint', () => {
            const session = createSession(store, new Map());
            session.addToolCallEdits('req-1', makeToolCall({
                toolCallId: 'tc-1',
                filePath: '/workspace/file.ts',
                beforeURI: 'b',
                afterURI: 'a',
            }));
            const entry = session.entries.get()[0];
            const snapshotUri = session.getSnapshotUri('req-1', entry.modifiedURI, undefined);
            assert.ok(snapshotUri);
            assert.strictEqual(snapshotUri.scheme, 'chat-editing-snapshot-text-model');
        });
        test('getSnapshotUri returns undefined for unknown request', () => {
            const session = createSession(store, new Map());
            const result = session.getSnapshotUri('nonexistent', URI.file('/x'), undefined);
            assert.strictEqual(result, undefined);
        });
        test('getSnapshotContents fetches content from connection', async () => {
            const contentMap = new Map();
            const session = createSession(store, contentMap);
            session.addToolCallEdits('req-1', makeToolCall({
                toolCallId: 'tc-1',
                filePath: '/workspace/file.ts',
                beforeURI: 'content://before',
                afterURI: 'content://after',
            }));
            // The afterContentUri is wrapped via toAgentHostUri(URI.parse('content://after'), 'local')
            const wrappedAfterUri = toAgentHostUri(URI.parse('content://after'), 'local');
            contentMap.set(wrappedAfterUri.toString(), 'file content here');
            const entry = session.entries.get()[0];
            const content = await session.getSnapshotContents('req-1', entry.modifiedURI, undefined);
            assert.ok(content);
            assert.strictEqual(content.toString(), 'file content here');
        });
    });
    suite('dispose', () => {
        test('sets state to Disposed and fires event', () => {
            const session = createSession(store, new Map());
            let disposed = false;
            store.add(session.onDidDispose(() => { disposed = true; }));
            session.dispose();
            assert.strictEqual(session.state.get(), 3 /* ChatEditingSessionState.Disposed */);
            assert.strictEqual(disposed, true);
        });
    });
    suite('explanations', () => {
        test('trigger/clear/has cycle', async () => {
            const session = createSession(store, new Map());
            assert.strictEqual(session.hasExplanations(), false);
            await session.triggerExplanationGeneration();
            assert.strictEqual(session.hasExplanations(), true);
            session.clearExplanations();
            assert.strictEqual(session.hasExplanations(), false);
        });
    });
    suite('accept/reject are no-ops', () => {
        test('accept does not throw', async () => {
            const session = createSession(store, new Map());
            await session.accept(URI.file('/test'));
        });
        test('reject does not throw', async () => {
            const session = createSession(store, new Map());
            await session.reject(URI.file('/test'));
        });
    });
    suite('getEntryDiffBetweenStops', () => {
        test('returns undefined for unknown requestId', () => {
            const session = createSession(store, new Map());
            const result = session.getEntryDiffBetweenStops(URI.file('/f'), 'unknown-req', undefined);
            assert.strictEqual(result, undefined);
        });
        test('computes diff for a known stop', async () => {
            const contentMap = new Map();
            const beforeUri = toAgentHostUri(URI.parse('content://before-1'), 'local');
            const afterUri = toAgentHostUri(URI.parse('content://after-1'), 'local');
            contentMap.set(beforeUri.toString(), 'line1\nline2\n');
            contentMap.set(afterUri.toString(), 'line1\nline2\nline3\n');
            const diffResult = {
                identical: false,
                quitEarly: false,
                changes: [{
                        original: { startLineNumber: 3, endLineNumberExclusive: 3 },
                        modified: { startLineNumber: 3, endLineNumberExclusive: 4 },
                        innerChanges: null,
                    }],
                moves: [],
            };
            const session = createSession(store, contentMap, { computeDiffResult: diffResult });
            session.addToolCallEdits('req-1', makeToolCall({
                toolCallId: 'tc-1',
                filePath: '/workspace/file.ts',
                beforeURI: 'content://before-1',
                afterURI: 'content://after-1',
            }));
            const entry = session.entries.get()[0];
            const diffObs = session.getEntryDiffBetweenStops(entry.modifiedURI, 'req-1', 'tc-1');
            assert.ok(diffObs);
            // Wait for the async diff computation by polling the observable
            let diff = diffObs.get();
            if (diff?.isBusy) {
                await new Promise(r => setTimeout(r, 50));
                diff = diffObs.get();
            }
            assert.ok(diff);
            assert.strictEqual(diff.added, 1);
            assert.strictEqual(diff.removed, 0);
            assert.strictEqual(diff.isFinal, true);
        });
    });
    suite('getEntryDiffBetweenRequests', () => {
        test('returns undefined for unknown requests', () => {
            const session = createSession(store, new Map());
            session.addToolCallEdits('req-1', makeToolCall({
                toolCallId: 'tc-1',
                filePath: '/f.ts',
                beforeURI: 'b',
                afterURI: 'a',
            }));
            const diffObs = session.getEntryDiffBetweenRequests(URI.file('/f'), 'unknown', 'also-unknown');
            assert.strictEqual(diffObs.get(), undefined);
        });
        test('computes diff spanning multiple requests', async () => {
            const contentMap = new Map();
            const beforeUri = toAgentHostUri(URI.parse('content://before'), 'local');
            const afterUri1 = toAgentHostUri(URI.parse('content://after-1'), 'local');
            const afterUri2 = toAgentHostUri(URI.parse('content://after-2'), 'local');
            contentMap.set(beforeUri.toString(), 'original');
            contentMap.set(afterUri1.toString(), 'modified-1');
            contentMap.set(afterUri2.toString(), 'modified-2');
            const session = createSession(store, contentMap);
            session.addToolCallEdits('req-1', makeToolCall({
                toolCallId: 'tc-1',
                filePath: '/workspace/file.ts',
                beforeURI: 'content://before',
                afterURI: 'content://after-1',
            }));
            session.addToolCallEdits('req-2', makeToolCall({
                toolCallId: 'tc-2',
                filePath: '/workspace/file.ts',
                beforeURI: 'content://after-1',
                afterURI: 'content://after-2',
            }));
            const entry = session.entries.get()[0];
            const diffObs = session.getEntryDiffBetweenRequests(entry.modifiedURI, 'req-1', 'req-2');
            let diff = diffObs.get();
            if (diff?.isBusy) {
                await new Promise(r => setTimeout(r, 50));
                diff = diffObs.get();
            }
            assert.ok(diff);
            assert.strictEqual(diff.isFinal, true);
        });
    });
    suite('requestDisablement', () => {
        test('returns empty when at the latest checkpoint', () => {
            const session = createSession(store, new Map());
            session.addToolCallEdits('req-1', makeToolCall({
                toolCallId: 'tc-1',
                filePath: '/workspace/file.ts',
                beforeURI: 'b',
                afterURI: 'a',
            }));
            assert.deepStrictEqual(session.requestDisablement.get(), []);
        });
        test('disables requests after undo', async () => {
            const contentMap = new Map();
            contentMap.set(toAgentHostUri(URI.file('/workspace/file.ts'), 'local').toString(), 'before');
            const session = createSession(store, contentMap);
            session.addToolCallEdits('req-1', makeToolCall({
                toolCallId: 'tc-1',
                filePath: '/workspace/file.ts',
                beforeURI: URI.file('/workspace/file.ts').toString(),
                afterURI: 'content://after-1',
            }));
            session.addToolCallEdits('req-2', makeToolCall({
                toolCallId: 'tc-2',
                filePath: '/workspace/file.ts',
                beforeURI: 'content://after-1',
                afterURI: 'content://after-2',
            }));
            // Undo the last tool call — req-2's sentinel + tool call are now after the cursor
            await session.undoInteraction();
            const disabled = session.requestDisablement.get();
            assert.strictEqual(disabled.length, 1);
            assert.strictEqual(disabled[0].requestId, 'req-2');
            // The first checkpoint after current is the sentinel (undoStopId === undefined)
            assert.strictEqual(disabled[0].afterUndoStop, undefined);
        });
        test('clears disablement after redo', async () => {
            const contentMap = new Map();
            contentMap.set(toAgentHostUri(URI.file('/workspace/file.ts'), 'local').toString(), 'before');
            contentMap.set(toAgentHostUri(URI.parse('content://after-2'), 'local').toString(), 'after-2');
            const session = createSession(store, contentMap);
            session.addToolCallEdits('req-1', makeToolCall({
                toolCallId: 'tc-1',
                filePath: '/workspace/file.ts',
                beforeURI: URI.file('/workspace/file.ts').toString(),
                afterURI: 'content://after-1',
            }));
            session.addToolCallEdits('req-2', makeToolCall({
                toolCallId: 'tc-2',
                filePath: '/workspace/file.ts',
                beforeURI: 'content://after-1',
                afterURI: 'content://after-2',
            }));
            await session.undoInteraction();
            assert.strictEqual(session.requestDisablement.get().length, 1);
            await session.redoInteraction();
            assert.deepStrictEqual(session.requestDisablement.get(), []);
        });
    });
    suite('restoreSnapshot', () => {
        test('restoreSnapshot with undefined stopId navigates before the request', async () => {
            const contentMap = new Map();
            contentMap.set(toAgentHostUri(URI.file('/workspace/file.ts'), 'local').toString(), 'before');
            contentMap.set(toAgentHostUri(URI.parse('content://after-1'), 'local').toString(), 'after-1');
            const session = createSession(store, contentMap);
            session.addToolCallEdits('req-1', makeToolCall({
                toolCallId: 'tc-1',
                filePath: '/workspace/file.ts',
                beforeURI: URI.file('/workspace/file.ts').toString(),
                afterURI: 'content://after-1',
            }));
            session.addToolCallEdits('req-2', makeToolCall({
                toolCallId: 'tc-2',
                filePath: '/workspace/file.ts',
                beforeURI: 'content://after-1',
                afterURI: 'content://after-2',
            }));
            // Restore to before req-2 — should undo req-2's edits
            await session.restoreSnapshot('req-2', undefined);
            // Entries should only show req-1's edits
            assert.strictEqual(session.entries.get().length, 1);
            assert.strictEqual(session.entries.get()[0].lastModifyingRequestId, 'req-1');
            // req-2 should be disabled
            assert.strictEqual(session.requestDisablement.get().length, 1);
            assert.strictEqual(session.requestDisablement.get()[0].requestId, 'req-2');
        });
        test('restoreSnapshot with stopId navigates to that checkpoint', async () => {
            const contentMap = new Map();
            contentMap.set(toAgentHostUri(URI.file('/workspace/file.ts'), 'local').toString(), 'before');
            contentMap.set(toAgentHostUri(URI.parse('content://after-1'), 'local').toString(), 'after-1');
            const session = createSession(store, contentMap);
            session.addToolCallEdits('req-1', makeToolCall({
                toolCallId: 'tc-1',
                filePath: '/workspace/file.ts',
                beforeURI: URI.file('/workspace/file.ts').toString(),
                afterURI: 'content://after-1',
            }));
            session.addToolCallEdits('req-1', makeToolCall({
                toolCallId: 'tc-2',
                filePath: '/workspace/file.ts',
                beforeURI: 'content://after-1',
                afterURI: 'content://after-2',
            }));
            // Restore to specific tool call tc-1 within req-1
            await session.restoreSnapshot('req-1', 'tc-1');
            // Should keep tc-1 but not tc-2
            assert.strictEqual(session.canUndo.get(), true);
            assert.strictEqual(session.canRedo.get(), true);
        });
        test('restoreSnapshot for first request navigates to before all edits', async () => {
            const contentMap = new Map();
            contentMap.set(toAgentHostUri(URI.file('/workspace/file.ts'), 'local').toString(), 'before');
            const session = createSession(store, contentMap);
            session.addToolCallEdits('req-1', makeToolCall({
                toolCallId: 'tc-1',
                filePath: '/workspace/file.ts',
                beforeURI: URI.file('/workspace/file.ts').toString(),
                afterURI: 'content://after-1',
            }));
            await session.restoreSnapshot('req-1', undefined);
            // No entries visible, all disabled
            assert.deepStrictEqual(session.entries.get(), []);
            assert.strictEqual(session.canUndo.get(), false);
            assert.strictEqual(session.requestDisablement.get().length, 1);
            assert.strictEqual(session.requestDisablement.get()[0].requestId, 'req-1');
        });
    });
    suite('undo branch (splice stale checkpoints)', () => {
        test('new edits after undo remove stale checkpoints', async () => {
            const contentMap = new Map();
            contentMap.set(toAgentHostUri(URI.file('/workspace/file.ts'), 'local').toString(), 'before');
            const session = createSession(store, contentMap);
            session.addToolCallEdits('req-1', makeToolCall({
                toolCallId: 'tc-1',
                filePath: '/workspace/file.ts',
                beforeURI: URI.file('/workspace/file.ts').toString(),
                afterURI: 'content://after-1',
            }));
            session.addToolCallEdits('req-2', makeToolCall({
                toolCallId: 'tc-2',
                filePath: '/workspace/file.ts',
                beforeURI: 'content://after-1',
                afterURI: 'content://after-2',
            }));
            // Undo last checkpoint
            await session.undoInteraction();
            // Now add a new edit — should splice away req-2's sentinel + checkpoint
            session.addToolCallEdits('req-3', makeToolCall({
                toolCallId: 'tc-3',
                filePath: '/workspace/file.ts',
                beforeURI: 'content://after-1',
                afterURI: 'content://after-3',
            }));
            // req-2 should be gone, req-3 should be present
            assert.strictEqual(session.canRedo.get(), false);
            assert.strictEqual(session.requestDisablement.get().length, 0);
            assert.strictEqual(session.hasEditsInRequest('req-2'), false);
            assert.strictEqual(session.hasEditsInRequest('req-3'), true);
        });
        test('sentinel checkpoint is preserved after splice for new request', async () => {
            const contentMap = new Map();
            contentMap.set(toAgentHostUri(URI.file('/workspace/file.ts'), 'local').toString(), 'before');
            const session = createSession(store, contentMap);
            session.addToolCallEdits('req-1', makeToolCall({
                toolCallId: 'tc-1',
                filePath: '/workspace/file.ts',
                beforeURI: URI.file('/workspace/file.ts').toString(),
                afterURI: 'content://after-1',
            }));
            // Undo
            await session.undoInteraction();
            // Add new request — sentinel should survive the splice
            session.addToolCallEdits('req-2', makeToolCall({
                toolCallId: 'tc-2',
                filePath: '/workspace/file.ts',
                beforeURI: URI.file('/workspace/file.ts').toString(),
                afterURI: 'content://after-2',
            }));
            // Undo once (tc-2), then check that req-2 is disabled via the sentinel
            await session.undoInteraction();
            const disabled = session.requestDisablement.get();
            assert.strictEqual(disabled.length, 1);
            assert.strictEqual(disabled[0].requestId, 'req-2');
            assert.strictEqual(disabled[0].afterUndoStop, undefined);
        });
    });
    suite('ensureRequestCheckpoint', () => {
        test('creates sentinel for request without tool calls', () => {
            const session = createSession(store, new Map());
            session.ensureRequestCheckpoint('req-1');
            // No entries visible (sentinel has no edits)
            assert.deepStrictEqual(session.entries.get(), []);
            // hasEditsInRequest returns true because the sentinel exists
            assert.strictEqual(session.hasEditsInRequest('req-1'), true);
        });
        test('request without edits appears in requestDisablement after undo', async () => {
            const contentMap = new Map();
            contentMap.set(toAgentHostUri(URI.file('/workspace/file.ts'), 'local').toString(), 'before');
            const session = createSession(store, contentMap);
            // req-1 has file edits
            session.addToolCallEdits('req-1', makeToolCall({
                toolCallId: 'tc-1',
                filePath: '/workspace/file.ts',
                beforeURI: URI.file('/workspace/file.ts').toString(),
                afterURI: 'content://after-1',
            }));
            // req-2 has no file edits, only a sentinel
            session.ensureRequestCheckpoint('req-2');
            // Undo tc-1 — both req-1 (partially) and req-2 should be disabled
            await session.undoInteraction();
            const disabled = session.requestDisablement.get();
            const disabledIds = disabled.map(d => d.requestId);
            assert.ok(disabledIds.includes('req-2'), 'req-2 should be disabled');
        });
        test('restoreSnapshot works for request with only sentinel', async () => {
            const contentMap = new Map();
            contentMap.set(toAgentHostUri(URI.file('/workspace/file.ts'), 'local').toString(), 'before');
            const session = createSession(store, contentMap);
            session.addToolCallEdits('req-1', makeToolCall({
                toolCallId: 'tc-1',
                filePath: '/workspace/file.ts',
                beforeURI: URI.file('/workspace/file.ts').toString(),
                afterURI: 'content://after-1',
            }));
            session.ensureRequestCheckpoint('req-2');
            // Restore to before req-2 — should keep req-1's edits but disable req-2
            await session.restoreSnapshot('req-2', undefined);
            assert.strictEqual(session.entries.get().length, 1);
            assert.strictEqual(session.entries.get()[0].lastModifyingRequestId, 'req-1');
            assert.strictEqual(session.requestDisablement.get().length, 1);
            assert.strictEqual(session.requestDisablement.get()[0].requestId, 'req-2');
        });
        test('idempotent — calling twice does not duplicate', () => {
            const session = createSession(store, new Map());
            session.ensureRequestCheckpoint('req-1');
            session.ensureRequestCheckpoint('req-1');
            // Should still work — only one sentinel
            assert.strictEqual(session.hasEditsInRequest('req-1'), true);
        });
        test('splices stale checkpoints when called after restore', async () => {
            const contentMap = new Map();
            contentMap.set(toAgentHostUri(URI.file('/workspace/file.ts'), 'local').toString(), 'before');
            const session = createSession(store, contentMap);
            session.addToolCallEdits('req-1', makeToolCall({
                toolCallId: 'tc-1',
                filePath: '/workspace/file.ts',
                beforeURI: URI.file('/workspace/file.ts').toString(),
                afterURI: 'content://after-1',
            }));
            session.ensureRequestCheckpoint('req-2');
            // Undo to before req-2's sentinel
            await session.undoInteraction();
            // New request should splice away req-2
            session.ensureRequestCheckpoint('req-3');
            assert.strictEqual(session.hasEditsInRequest('req-2'), false);
            assert.strictEqual(session.hasEditsInRequest('req-3'), true);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRIb3N0RWRpdGluZ1Nlc3Npb24udGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL2FnZW50SG9zdC9hZ2VudEhvc3RFZGl0aW5nU2Vzc2lvbi50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDbkUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUM3RSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDM0QsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBS3RHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUs3RixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFFOUUsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0scUVBQXFFLENBQUM7QUFFOUcsT0FBTyxFQUFFLE9BQU8sRUFBZSxNQUFNLDZDQUE2QyxDQUFDO0FBRW5GLGdGQUFnRjtBQUVoRjs7R0FFRztBQUNILFNBQVMsaUJBQWlCLENBQUksR0FBbUIsRUFBRSxTQUE0QixFQUFFLFNBQVMsR0FBRyxJQUFJO0lBQ2hHLE9BQU8sSUFBSSxPQUFPLENBQUksQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7UUFDekMsTUFBTSxPQUFPLEdBQUcsVUFBVSxDQUFDLEdBQUcsRUFBRTtZQUMvQixDQUFDLENB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