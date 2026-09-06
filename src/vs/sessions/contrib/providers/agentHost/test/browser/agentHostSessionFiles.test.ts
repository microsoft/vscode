/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { DisposableStore, IReference } from '../../../../../../base/common/lifecycle.js';
import { autorun, constObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import {
	buildChatUri,
	FileEditKind,
	ResponsePartKind,
	StateComponents,
	ToolCallConfirmationReason,
	ToolCallStatus,
	ToolResultContentType,
	type ResponsePart,
} from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IAgentHostAdapterOptions } from '../../browser/baseAgentHostSessionsProvider.js';
import {
	createIncrementalChatFileEditsParser,
	createSessionOutputObs,
	IParsedFileEdit,
	ISessionOutputObs,
	parseResponseParts,
	reduceTurnChanges,
} from '../../browser/agentHostSessionFiles.js';

// ── Protocol fixture helpers ────────────────────────────────────────────────

let seq = 0;

function toolCallPart(toolCall: object): ResponsePart {
	return { kind: ResponsePartKind.ToolCall, toolCall } as ResponsePart;
}

function markdownPart(content: string): ResponsePart {
	return { kind: ResponsePartKind.Markdown, id: `md-${seq++}`, content } as ResponsePart;
}

/** A completed tool call carrying the given file-edit results. */
function completedToolCallPart(content: object[]): ResponsePart {
	return toolCallPart({
		status: ToolCallStatus.Completed,
		toolCallId: `tc-${seq++}`,
		toolName: 'editFile',
		displayName: 'Edit File',
		invocationMessage: 'Editing',
		confirmed: ToolCallConfirmationReason.NotNeeded,
		success: true,
		pastTenseMessage: 'Edited',
		content,
	});
}

/** A tool call awaiting confirmation, carrying its planned edits. */
function pendingConfirmationToolCallPart(items: object[]): ResponsePart {
	return toolCallPart({
		status: ToolCallStatus.PendingConfirmation,
		toolCallId: `tc-${seq++}`,
		toolName: 'editFile',
		displayName: 'Edit File',
		invocationMessage: 'Editing',
		edits: { items },
	});
}

function createEdit(uri: string, diff?: { added?: number; removed?: number }): object {
	return { type: ToolResultContentType.FileEdit, after: { uri, content: { uri: `${uri}.after` } }, diff };
}

function editEdit(uri: string, diff?: { added?: number; removed?: number }): object {
	return {
		type: ToolResultContentType.FileEdit,
		before: { uri, content: { uri: `${uri}.before` } },
		after: { uri, content: { uri: `${uri}.after` } },
		diff,
	};
}

function deleteEdit(uri: string, diff?: { added?: number; removed?: number }): object {
	return { type: ToolResultContentType.FileEdit, before: { uri, content: { uri: `${uri}.before` } }, diff };
}

function parsedEdit(kind: FileEditKind, uris: { after?: string; before?: string; beforeContent?: string }, diff?: { insertions?: number; deletions?: number }): IParsedFileEdit {
	return {
		kind,
		afterUri: uris.after ? URI.file(uris.after) : undefined,
		beforeUri: uris.before ? URI.file(uris.before) : undefined,
		beforeContentUri: uris.beforeContent ? URI.file(uris.beforeContent) : undefined,
		insertions: diff?.insertions ?? 0,
		deletions: diff?.deletions ?? 0,
	};
}

// ── Tests ───────────────────────────────────────────────────────────────────

suite('agentHostSessionFiles', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('incremental parser parses only the last turn and re-parses only the active turn', () => {
		// Count how many times each distinct responseParts array is parsed.
		const parseCounts = new Map<ResponsePart[], number>();
		const countingParseTurn = (parts: ResponsePart[]): readonly IParsedFileEdit[] => {
			parseCounts.set(parts, (parseCounts.get(parts) ?? 0) + 1);
			return [];
		};

		const parse = createIncrementalChatFileEditsParser(undefined, countingParseTurn);

		// Each turn / active-turn snapshot gets a uniquely-identifiable array.
		const t0Parts: ResponsePart[] = [];
		const t1Parts: ResponsePart[] = [];
		const t2Parts: ResponsePart[] = [];
		const active1Parts: ResponsePart[] = [];
		const active2Parts: ResponsePart[] = [];
		const active3Parts: ResponsePart[] = [];

		// 1) A chat with history arrives; only its last turn is of interest.
		parse({ turns: [{ id: 't0', responseParts: t0Parts }, { id: 't1', responseParts: t1Parts }] });
		// 2) The same completed last turn is seen again.
		parse({ turns: [{ id: 't0', responseParts: t0Parts }, { id: 't1', responseParts: t1Parts }] });
		// 3) A turn starts streaming (active).
		parse({ turns: [{ id: 't1', responseParts: t1Parts }], activeTurn: { responseParts: active1Parts } });
		// 4) Same active turn streams another delta.
		parse({ turns: [{ id: 't1', responseParts: t1Parts }], activeTurn: { responseParts: active2Parts } });
		// 5) Active turn finalizes into t2.
		parse({ turns: [{ id: 't1', responseParts: t1Parts }, { id: 't2', responseParts: t2Parts }] });
		// 6) A new turn starts streaming.
		parse({
			turns: [{ id: 't1', responseParts: t1Parts }, { id: 't2', responseParts: t2Parts }],
			activeTurn: { responseParts: active3Parts },
		});

		// Turns that were never the last turn are never parsed; a completed last
		// turn is parsed once no matter how often it is seen; each active-turn
		// snapshot is parsed exactly once.
		assert.deepStrictEqual(
			{
				t0: parseCounts.get(t0Parts),
				t1: parseCounts.get(t1Parts),
				t2: parseCounts.get(t2Parts),
				active1: parseCounts.get(active1Parts),
				active2: parseCounts.get(active2Parts),
				active3: parseCounts.get(active3Parts),
			},
			{ t0: undefined, t1: 1, t2: 1, active1: 1, active2: 1, active3: 1 },
		);
	});

	test('incremental parser reports the active turn while streaming and the last completed turn when idle', () => {
		const parse = createIncrementalChatFileEditsParser();

		const t1Parts = [completedToolCallPart([createEdit('file:///a.txt')])];

		const idle = parse({ turns: [{ id: 't1', responseParts: t1Parts }] });
		const streaming = parse({
			turns: [{ id: 't1', responseParts: t1Parts }],
			activeTurn: { responseParts: [completedToolCallPart([createEdit('file:///b.txt')])] },
		});

		assert.deepStrictEqual(
			{
				idle: idle.map(e => e.afterUri?.toString()),
				streaming: streaming.map(e => e.afterUri?.toString()),
			},
			{
				idle: ['file:///a.txt'],
				streaming: ['file:///b.txt'],
			},
		);
	});

	test('parseResponseParts extracts edits from completed and pending tool calls and ignores non-tool parts', () => {
		const parts: ResponsePart[] = [
			markdownPart('hello'),
			completedToolCallPart([createEdit('file:///created.txt'), editEdit('file:///edited.txt')]),
			pendingConfirmationToolCallPart([deleteEdit('file:///deleted.txt')]),
		];

		const parsed = parseResponseParts(parts);

		assert.deepStrictEqual(
			parsed.map(e => ({ kind: e.kind, uri: (e.afterUri ?? e.beforeUri)?.toString() })),
			[
				{ kind: FileEditKind.Create, uri: 'file:///created.txt' },
				{ kind: FileEditKind.Edit, uri: 'file:///edited.txt' },
				{ kind: FileEditKind.Delete, uri: 'file:///deleted.txt' },
			],
		);
	});

	test('reduceTurnChanges collapses repeated edits per file and aggregates diff stats', () => {
		const edits: IParsedFileEdit[] = [
			// created then edited → one created change, summed diffs, no original side
			parsedEdit(FileEditKind.Create, { after: '/repo/new.ts' }, { insertions: 10 }),
			parsedEdit(FileEditKind.Edit, { after: '/repo/new.ts', beforeContent: '/repo/new.ts.before' }, { insertions: 3, deletions: 1 }),
			// pre-existing file edited twice → one modified change keeping the first original
			parsedEdit(FileEditKind.Edit, { after: '/repo/existing.ts', beforeContent: '/repo/existing.ts.before' }, { insertions: 2, deletions: 4 }),
			parsedEdit(FileEditKind.Edit, { after: '/repo/existing.ts', beforeContent: '/repo/existing.ts.before2' }, { insertions: 1 }),
			// pre-existing file deleted → surfaced as a deletion (no modified side)
			parsedEdit(FileEditKind.Delete, { before: '/repo/gone.ts', beforeContent: '/repo/gone.ts.before' }, { deletions: 8 }),
		];

		const changes = reduceTurnChanges(edits, [URI.file('/repo')]).map(c => ({
			uri: c.uri.path,
			modified: c.modifiedUri?.path,
			original: c.originalUri?.path,
			isOutsideWorkspace: c.isOutsideWorkspace,
			insertions: c.insertions,
			deletions: c.deletions,
		}));

		assert.deepStrictEqual(changes, [
			{ uri: '/repo/new.ts', modified: '/repo/new.ts', original: undefined, isOutsideWorkspace: false, insertions: 13, deletions: 1 },
			{ uri: '/repo/existing.ts', modified: '/repo/existing.ts', original: '/repo/existing.ts.before', isOutsideWorkspace: false, insertions: 3, deletions: 4 },
			{ uri: '/repo/gone.ts', modified: undefined, original: '/repo/gone.ts.before', isOutsideWorkspace: false, insertions: 0, deletions: 8 },
		]);
	});

	test('reduceTurnChanges classifies files against workspace and worktree roots', () => {
		const workspaceFile = URI.file('/repo/src/app.ts');
		const worktreeFile = URI.file('/tmp/session-worktree/README.md');
		const externalFile = URI.file('/home/user/.config/tool.json');
		const edits: IParsedFileEdit[] = [
			parsedEdit(FileEditKind.Edit, { after: workspaceFile.path, beforeContent: '/repo/src/app.ts.before' }, { insertions: 2 }),
			parsedEdit(FileEditKind.Create, { after: worktreeFile.path }, { insertions: 5 }),
			parsedEdit(FileEditKind.Edit, { after: externalFile.path, beforeContent: '/home/user/.config/tool.json.before' }, { insertions: 10, deletions: 1 }),
		];
		const cache = new Map<string, unknown>();

		const changes = reduceTurnChanges(edits, [URI.file('/repo'), URI.file('/tmp/session-worktree')], cache).map(c => ({
			uri: c.uri.path,
			modified: c.modifiedUri?.path,
			original: c.originalUri?.path,
			isOutsideWorkspace: c.isOutsideWorkspace,
			insertions: c.insertions,
			deletions: c.deletions,
		}));

		assert.deepStrictEqual({
			changes,
			cache: [...cache],
		}, {
			changes: [
				{ uri: '/repo/src/app.ts', modified: '/repo/src/app.ts', original: '/repo/src/app.ts.before', isOutsideWorkspace: false, insertions: 2, deletions: 0 },
				{ uri: '/tmp/session-worktree/README.md', modified: '/tmp/session-worktree/README.md', original: undefined, isOutsideWorkspace: false, insertions: 5, deletions: 0 },
				{ uri: '/home/user/.config/tool.json', modified: '/home/user/.config/tool.json', original: '/home/user/.config/tool.json.before', isOutsideWorkspace: true, insertions: 10, deletions: 1 },
			],
			cache: [
				[`isOutsideWorkspace:${workspaceFile.toString()}`, false],
				[`isOutsideWorkspace:${worktreeFile.toString()}`, false],
				[`isOutsideWorkspace:${externalFile.toString()}`, true],
			],
		});
	});

	test('reduceTurnChanges nets out a file created and then deleted in the same turn', () => {
		const edits: IParsedFileEdit[] = [
			parsedEdit(FileEditKind.Create, { after: '/repo/scratch.tmp' }, { insertions: 5 }),
			parsedEdit(FileEditKind.Delete, { before: '/repo/scratch.tmp' }),
		];

		assert.deepStrictEqual(reduceTurnChanges(edits), []);
	});

	test('reduceTurnChanges reports a rename as an edit of the target and drops the source', () => {
		const edits: IParsedFileEdit[] = [
			parsedEdit(FileEditKind.Rename, { before: '/repo/old.ts', after: '/repo/renamed.ts', beforeContent: '/repo/old.ts.before' }, { insertions: 1, deletions: 2 }),
		];

		const changes = reduceTurnChanges(edits, [URI.file('/repo')]).map(c => ({
			uri: c.uri.path,
			modified: c.modifiedUri?.path,
			original: c.originalUri?.path,
			isOutsideWorkspace: c.isOutsideWorkspace,
			insertions: c.insertions,
			deletions: c.deletions,
		}));

		assert.deepStrictEqual(changes, [
			{ uri: '/repo/renamed.ts', modified: '/repo/renamed.ts', original: '/repo/old.ts.before', isOutsideWorkspace: false, insertions: 1, deletions: 2 },
		]);
	});
});

suite('agentHostSessionFiles - per-chat subscriptions', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const SESSION_URI = URI.parse('ahp-session://session-1');
	const CHAT_A = URI.parse(buildChatUri(SESSION_URI, 'chat-a'));
	const CHAT_B = URI.parse(buildChatUri(SESSION_URI, 'chat-b'));

	/**
	 * A connection that records which resources were subscribed to and how many
	 * of those references are still open, so a test can assert both that an
	 * unread chat never subscribes and that an unobserved one is released.
	 */
	function createRecordingConnection() {
		const acquired: string[] = [];
		const open = new Set<string>();
		const connection = new class extends mock<IAgentConnection>() {
			override getSubscription<T>(_kind: StateComponents, resource: URI, _owner: string): IReference<IAgentSubscription<T>> {
				const key = resource.toString();
				acquired.push(key);
				open.add(key);
				const subscription = new class extends mock<IAgentSubscription<T>>() {
					override readonly value = undefined;
					override readonly onDidChange = Event.None;
				}();
				return { object: subscription, dispose: () => open.delete(key) };
			}
		}();
		return { connection, acquired, openKeys: () => [...open] };
	}

	function createOptions(connection: IAgentConnection): IAgentHostAdapterOptions {
		return new class extends mock<IAgentHostAdapterOptions>() {
			override readonly getConnection = () => connection;
		}();
	}

	function createOutput(connection: IAgentConnection): ISessionOutputObs {
		return createSessionOutputObs(
			SESSION_URI,
			createOptions(connection),
			constObservable(true),
			constObservable(false),
			constObservable(undefined),
			new Map<string, unknown>(),
		);
	}

	test('a chat that is never observed opens no subscription', () => {
		const { connection, acquired } = createRecordingConnection();
		const output = createOutput(connection);

		// Merely asking for the observables must not subscribe: only reading
		// them does, so peer chats the UI never renders cost nothing.
		output.getLastTurnChanges(CHAT_A);
		output.getChatCustomizations(CHAT_B);

		assert.deepStrictEqual(acquired, []);
	});

	test('observing one chat subscribes to that chat alone and releases it when unobserved', () => {
		const { connection, acquired, openKeys } = createRecordingConnection();
		const output = createOutput(connection);
		output.getLastTurnChanges(CHAT_B);

		const observer = store.add(new DisposableStore());
		observer.add(autorun(reader => {
			output.getLastTurnChanges(CHAT_A).read(reader);
		}));
		const whileObserved = openKeys();
		observer.clear();

		assert.deepStrictEqual(
			{ whileObserved, afterDispose: openKeys(), everAcquired: acquired },
			{ whileObserved: [CHAT_A.toString()], afterDispose: [], everAcquired: [CHAT_A.toString()] },
		);
	});

	test('releaseChat drops the cached observables for a removed chat', () => {
		const { connection } = createRecordingConnection();
		const output = createOutput(connection);

		const before = output.getLastTurnChanges(CHAT_A);
		const cached = output.getLastTurnChanges(CHAT_A);
		output.releaseChat(CHAT_A);
		const afterRelease = output.getLastTurnChanges(CHAT_A);

		assert.deepStrictEqual(
			{ reusedWhileLive: cached === before, reusedAfterRelease: afterRelease === before },
			{ reusedWhileLive: true, reusedAfterRelease: false },
		);
	});
});
