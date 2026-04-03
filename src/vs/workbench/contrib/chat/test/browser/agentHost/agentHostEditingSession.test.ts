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
import { IDocumentDiff } from '../../../../../../editor/common/diff/documentDiffProvider.js';
import { DetailedLineRangeMapping } from '../../../../../../editor/common/diff/rangeMapping.js';
import { IEditorWorkerService } from '../../../../../../editor/common/services/editorWorker.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../../editor/common/services/resolverService.js';
import { toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { IToolCallState, ToolCallConfirmationReason, ToolCallStatus, ToolResultContentType } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import type { IToolCallCompletedState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IFileContent, IFileService } from '../../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { AgentHostEditingSession } from '../../../browser/agentSessions/agentHost/agentHostEditingSession.js';
import { ChatEditingSessionState, ModifiedFileEntryState } from '../../../common/editing/chatEditingService.js';
import { autorun, IObservable } from '../../../../../../base/common/observable.js';

// ---- Test helpers -----------------------------------------------------------

/**
 * Waits for an observable to satisfy a condition by subscribing to it.
 */
function waitForObservable<T>(obs: IObservable<T>, predicate: (v: T) => boolean, timeoutMs = 2000): Promise<T> {
	return new Promise<T>((resolve, reject) => {
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

function makeToolCall(opts: {
	toolCallId: string;
	filePath: string;
	beforeURI: string;
	afterURI: string;
	added?: number;
	removed?: number;
}): IToolCallCompletedState {
	return {
		status: ToolCallStatus.Completed,
		toolCallId: opts.toolCallId,
		toolName: 'codeEdit',
		displayName: 'Edit File',
		invocationMessage: 'Editing file',
		toolInput: JSON.stringify({ path: opts.filePath }),
		success: true,
		pastTenseMessage: 'Edited file',
		confirmed: ToolCallConfirmationReason.NotNeeded,
		content: [{
			type: ToolResultContentType.FileEdit,
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

function makeMockFileService(contentMap: Map<string, string>): IFileService {
	return new class extends mock<IFileService>() {
		override async readFile(uri: URI) {
			const key = uri.toString();
			const data = contentMap.get(key);
			if (data === undefined) {
				throw new Error(`Content not found: ${key}`);
			}
			return { value: VSBuffer.fromString(data) } as IFileContent;
		}
		override async writeFile(uri: URI, content: VSBuffer): Promise<any> {
			contentMap.set(uri.toString(), content.toString());
			return {};
		}
		override async del(uri: URI) {
			contentMap.delete(uri.toString());
		}
		override async move(source: URI, target: URI): Promise<any> {
			const data = contentMap.get(source.toString());
			if (data !== undefined) {
				contentMap.set(target.toString(), data);
				contentMap.delete(source.toString());
			}
			return {};
		}
	};
}

function createSession(store: DisposableStore, contentMap: Map<string, string>, opts?: { computeDiffResult?: IDocumentDiff | null }): AgentHostEditingSession {
	const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/test-session' });
	const mockEditorService = new class extends mock<IEditorService>() {
		override readonly onDidActiveEditorChange = Event.None;
	};
	const mockInstantiationService = new class extends mock<IInstantiationService>() { };
	const mockFileService = makeMockFileService(contentMap);
	const mockTextModelService = new class extends mock<ITextModelService>() {
		override async createModelReference(uri: URI) {
			const content = contentMap.get(uri.toString()) ?? '';
			return {
				object: { textEditorModel: { uri, getValue: () => content } } as IResolvedTextEditorModel,
				dispose: () => { },
			};
		}
	};
	const mockEditorWorkerService = new class extends mock<IEditorWorkerService>() {
		override async computeDiff(_original: URI, _modified: URI): Promise<IDocumentDiff | null> {
			return opts?.computeDiffResult ?? { identical: false, quitEarly: false, changes: [], moves: [] };
		}
	};
	const session = new AgentHostEditingSession(
		sessionResource,
		'local',
		mockEditorService,
		mockInstantiationService,
		new NullLogService(),
		mockFileService,
		mockTextModelService,
		mockEditorWorkerService,
	);
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
		assert.strictEqual(session.state.get(), ChatEditingSessionState.Idle);
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

		assert.strictEqual(session.state.get(), ChatEditingSessionState.Idle);
		assert.strictEqual(session.entries.get().length, 1);

		const entry = session.entries.get()[0];
		assert.strictEqual(entry.lastModifyingRequestId, 'req-1');
		assert.strictEqual(entry.state.get(), ModifiedFileEntryState.Accepted);
		assert.strictEqual(entry.linesAdded?.get(), 5);
		assert.strictEqual(entry.linesRemoved?.get(), 2);
		assert.strictEqual(session.canUndo.get(), true);
		assert.strictEqual(session.canRedo.get(), false);
	});

	test('addToolCallEdits ignores non-completed tool calls', () => {
		const session = createSession(store, new Map());

		const tc = { ...makeToolCall({ toolCallId: 'tc-1', filePath: '/f.ts', beforeURI: 'b', afterURI: 'a' }), status: ToolCallStatus.Running } as IToolCallState;
		session.addToolCallEdits('req-1', tc);

		assert.strictEqual(session.state.get(), ChatEditingSessionState.Idle);
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
		const diffResult: IDocumentDiff = {
			identical: false, quitEarly: false, moves: [],
			changes: [{
				original: { startLineNumber: 1, endLineNumberExclusive: 3 },
				modified: { startLineNumber: 1, endLineNumberExclusive: 6 },
				innerChanges: null,
			} as unknown as DetailedLineRangeMapping],
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
			const contentMap = new Map<string, string>();
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
			const contentMap = new Map<string, string>();
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
			const contentMap = new Map<string, string>();
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
			const diffResult: IDocumentDiff = {
				identical: false, quitEarly: false, moves: [],
				changes: [{
					original: { startLineNumber: 1, endLineNumberExclusive: 3 },
					modified: { startLineNumber: 1, endLineNumberExclusive: 11 },
					innerChanges: null,
				} as unknown as DetailedLineRangeMapping],
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
			const diffResult: IDocumentDiff = {
				identical: false, quitEarly: false, moves: [],
				changes: [{
					original: { startLineNumber: 1, endLineNumberExclusive: 1 },
					modified: { startLineNumber: 1, endLineNumberExclusive: 6 },
					innerChanges: null,
				} as unknown as DetailedLineRangeMapping],
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
			assert.strictEqual(snapshotUri!.scheme, 'chat-editing-snapshot-text-model');
		});

		test('getSnapshotUri returns undefined for unknown request', () => {
			const session = createSession(store, new Map());

			const result = session.getSnapshotUri('nonexistent', URI.file('/x'), undefined);
			assert.strictEqual(result, undefined);
		});

		test('getSnapshotContents fetches content from connection', async () => {
			const contentMap = new Map<string, string>();
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
			assert.strictEqual(content!.toString(), 'file content here');
		});
	});

	suite('dispose', () => {
		test('sets state to Disposed and fires event', () => {
			const session = createSession(store, new Map());

			let disposed = false;
			store.add(session.onDidDispose(() => { disposed = true; }));

			session.dispose();

			assert.strictEqual(session.state.get(), ChatEditingSessionState.Disposed);
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
			const contentMap = new Map<string, string>();
			const beforeUri = toAgentHostUri(URI.parse('content://before-1'), 'local');
			const afterUri = toAgentHostUri(URI.parse('content://after-1'), 'local');
			contentMap.set(beforeUri.toString(), 'line1\nline2\n');
			contentMap.set(afterUri.toString(), 'line1\nline2\nline3\n');

			const diffResult: IDocumentDiff = {
				identical: false,
				quitEarly: false,
				changes: [{
					original: { startLineNumber: 3, endLineNumberExclusive: 3 },
					modified: { startLineNumber: 3, endLineNumberExclusive: 4 },
					innerChanges: null,
				} as unknown as DetailedLineRangeMapping],
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
			let diff = diffObs!.get();
			if (diff?.isBusy) {
				await new Promise(r => setTimeout(r, 50));
				diff = diffObs!.get();
			}
			assert.ok(diff);
			assert.strictEqual(diff!.added, 1);
			assert.strictEqual(diff!.removed, 0);
			assert.strictEqual(diff!.isFinal, true);
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
			const contentMap = new Map<string, string>();
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
			assert.strictEqual(diff!.isFinal, true);
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
			const contentMap = new Map<string, string>();
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
			const contentMap = new Map<string, string>();
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
			const contentMap = new Map<string, string>();
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
			const contentMap = new Map<string, string>();
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
			const contentMap = new Map<string, string>();
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
			const contentMap = new Map<string, string>();
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
			const contentMap = new Map<string, string>();
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
			const contentMap = new Map<string, string>();
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
			const contentMap = new Map<string, string>();
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
			const contentMap = new Map<string, string>();
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
