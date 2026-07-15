/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import {
	FileEditKind,
	ResponsePartKind,
	ToolCallConfirmationReason,
	ToolCallStatus,
	ToolResultContentType,
	type ResponsePart,
} from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { SessionFileOperation } from '../../../../../services/sessions/common/session.js';
import { BrowserChatToolReferenceName } from '../../../../../../platform/browserView/common/browserChatToolReferenceNames.js';
import {
	createIncrementalChatFileEditsParser,
	IFileEditChatState,
	IParsedFileEdit,
	parseBrowserUrlFromResponseParts,
	parseResponseParts,
	reduceSessionFiles,
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

/** A completed browser tool call with the given tool name and raw JSON input. */
function browserToolCallPart(toolName: string, toolInput: string | undefined): ResponsePart {
	return toolCallPart({
		status: ToolCallStatus.Completed,
		toolCallId: `tc-${seq++}`,
		toolName,
		displayName: 'Browser',
		invocationMessage: 'Browsing',
		confirmed: ToolCallConfirmationReason.NotNeeded,
		success: true,
		pastTenseMessage: 'Browsed',
		toolInput,
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

	test('incremental parser parses each completed turn once and re-parses only the active turn', () => {
		// Count how many times each distinct responseParts array is parsed.
		const parseCounts = new Map<ResponsePart[], number>();
		const countingParseTurn = (parts: ResponsePart[]): readonly IParsedFileEdit[] => {
			parseCounts.set(parts, (parseCounts.get(parts) ?? 0) + 1);
			return [];
		};

		const parse = createIncrementalChatFileEditsParser(undefined, countingParseTurn);

		// Each turn / active-turn snapshot gets a uniquely-identifiable array.
		const t1Parts: ResponsePart[] = [];
		const t2Parts: ResponsePart[] = [];
		const active1Parts: ResponsePart[] = [];
		const active2Parts: ResponsePart[] = [];
		const active3Parts: ResponsePart[] = [];

		// 1) First completed turn arrives.
		parse({ turns: [{ id: 't1', responseParts: t1Parts }] });
		// 2) A turn starts streaming (active).
		parse({ turns: [{ id: 't1', responseParts: t1Parts }], activeTurn: { responseParts: active1Parts } });
		// 3) Same active turn streams another delta.
		parse({ turns: [{ id: 't1', responseParts: t1Parts }], activeTurn: { responseParts: active2Parts } });
		// 4) Active turn finalizes into t2.
		parse({ turns: [{ id: 't1', responseParts: t1Parts }, { id: 't2', responseParts: t2Parts }] });
		// 5) A new turn starts streaming.
		parse({
			turns: [{ id: 't1', responseParts: t1Parts }, { id: 't2', responseParts: t2Parts }],
			activeTurn: { responseParts: active3Parts },
		});

		// Completed turns are parsed exactly once regardless of how many deltas
		// followed; each active-turn snapshot is parsed exactly once.
		assert.deepStrictEqual(
			{
				t1: parseCounts.get(t1Parts),
				t2: parseCounts.get(t2Parts),
				active1: parseCounts.get(active1Parts),
				active2: parseCounts.get(active2Parts),
				active3: parseCounts.get(active3Parts),
			},
			{ t1: 1, t2: 1, active1: 1, active2: 1, active3: 1 },
		);
	});

	test('incremental parser keeps completed-turn edits while a new turn streams and tracks the last turn', () => {
		const parse = createIncrementalChatFileEditsParser();

		const t1Parts = [completedToolCallPart([createEdit('file:///a.txt')])];
		const completed: IFileEditChatState = { turns: [{ id: 't1', responseParts: t1Parts }] };

		const first = parse(completed);
		const streaming = parse({
			turns: [{ id: 't1', responseParts: t1Parts }],
			activeTurn: { responseParts: [completedToolCallPart([createEdit('file:///b.txt')])] },
		});

		assert.deepStrictEqual(
			{
				firstAll: first.allEdits.map(e => e.afterUri?.toString()),
				firstLastTurn: first.lastTurnEdits.map(e => e.afterUri?.toString()),
				streamingAll: streaming.allEdits.map(e => e.afterUri?.toString()),
				streamingLastTurn: streaming.lastTurnEdits.map(e => e.afterUri?.toString()),
			},
			{
				// When idle, the last turn is the most recently completed turn.
				firstAll: ['file:///a.txt'],
				firstLastTurn: ['file:///a.txt'],
				// While streaming, `allEdits` unions every turn but `lastTurnEdits`
				// reflects only the in-progress turn.
				streamingAll: ['file:///a.txt', 'file:///b.txt'],
				streamingLastTurn: ['file:///b.txt'],
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

	test('parseBrowserUrlFromResponseParts returns the last browser URL and ignores non-browser/malformed calls', () => {
		const openInput = (url: string) => JSON.stringify({ url });
		const navigateInput = (fields: object) => JSON.stringify(fields);

		assert.deepStrictEqual(
			{
				none: parseBrowserUrlFromResponseParts([markdownPart('hi'), completedToolCallPart([createEdit('file:///a.txt')])]),
				open: parseBrowserUrlFromResponseParts([browserToolCallPart(BrowserChatToolReferenceName.OpenBrowserPage, openInput('https://a.com/'))]),
				navigate: parseBrowserUrlFromResponseParts([browserToolCallPart(BrowserChatToolReferenceName.NavigatePage, navigateInput({ pageId: 'p1', type: 'url', url: 'https://b.com/' }))]),
				// Later browser calls win so the pill reflects the most recent page.
				last: parseBrowserUrlFromResponseParts([
					browserToolCallPart(BrowserChatToolReferenceName.OpenBrowserPage, openInput('https://first.com/')),
					markdownPart('mid'),
					browserToolCallPart(BrowserChatToolReferenceName.NavigatePage, navigateInput({ pageId: 'p1', type: 'url', url: 'https://last.com/' })),
				]),
				// A back/forward/reload navigation carries no URL.
				navigateNoUrl: parseBrowserUrlFromResponseParts([browserToolCallPart(BrowserChatToolReferenceName.NavigatePage, navigateInput({ pageId: 'p1', type: 'reload' }))]),
				malformed: parseBrowserUrlFromResponseParts([browserToolCallPart(BrowserChatToolReferenceName.OpenBrowserPage, '{not json')]),
				missingInput: parseBrowserUrlFromResponseParts([browserToolCallPart(BrowserChatToolReferenceName.OpenBrowserPage, undefined)]),
			},
			{
				none: undefined,
				open: 'https://a.com/',
				navigate: 'https://b.com/',
				last: 'https://last.com/',
				navigateNoUrl: undefined,
				malformed: undefined,
				missingInput: undefined,
			},
		);
	});

	test('reduceSessionFiles classifies operations and filters workspace files', () => {
		const edits: IParsedFileEdit[] = [
			// created-then-edited outside workspace → Created
			parsedEdit(FileEditKind.Create, { after: '/home/user/.config/app.json' }),
			parsedEdit(FileEditKind.Edit, { after: '/home/user/.config/app.json', beforeContent: '/home/user/.config/app.json.before' }),
			// edited outside workspace → Modified (keeps original for diff)
			parsedEdit(FileEditKind.Edit, { after: '/home/user/.bashrc', beforeContent: '/home/user/.bashrc.before' }),
			// deleted outside workspace → removed from the list entirely
			parsedEdit(FileEditKind.Delete, { before: '/tmp/scratch.log', beforeContent: '/tmp/scratch.log.before' }),
			// inside workspace → excluded
			parsedEdit(FileEditKind.Create, { after: '/repo/src/index.ts' }),
		];

		const files = reduceSessionFiles(edits, [URI.file('/repo')]);

		assert.deepStrictEqual(
			files.map(f => ({ uri: f.uri.path, operation: f.operation, original: f.originalUri?.path })),
			[
				{ uri: '/home/user/.bashrc', operation: SessionFileOperation.Modified, original: '/home/user/.bashrc.before' },
				{ uri: '/home/user/.config/app.json', operation: SessionFileOperation.Created, original: undefined },
			],
		);
	});

	test('reduceSessionFiles reports a rename as a create of the target and drops the source', () => {
		const edits: IParsedFileEdit[] = [
			parsedEdit(FileEditKind.Rename, { before: '/home/user/old.txt', after: '/home/user/new.txt', beforeContent: '/home/user/old.txt.before' }),
		];

		const files = reduceSessionFiles(edits, [URI.file('/repo')]);

		assert.deepStrictEqual(
			files.map(f => ({ uri: f.uri.path, operation: f.operation })),
			[
				{ uri: '/home/user/new.txt', operation: SessionFileOperation.Created },
			],
		);
	});

	test('reduceSessionFiles drops a file that is created and then deleted', () => {
		const edits: IParsedFileEdit[] = [
			parsedEdit(FileEditKind.Create, { after: '/home/user/scratch.tmp' }),
			parsedEdit(FileEditKind.Delete, { before: '/home/user/scratch.tmp' }),
		];

		const files = reduceSessionFiles(edits, [URI.file('/repo')]);

		assert.deepStrictEqual(files, []);
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

		const changes = reduceTurnChanges(edits).map(c => ({
			uri: c.uri.path,
			modified: c.modifiedUri?.path,
			original: c.originalUri?.path,
			insertions: c.insertions,
			deletions: c.deletions,
		}));

		assert.deepStrictEqual(changes, [
			{ uri: '/repo/new.ts', modified: '/repo/new.ts', original: undefined, insertions: 13, deletions: 1 },
			{ uri: '/repo/existing.ts', modified: '/repo/existing.ts', original: '/repo/existing.ts.before', insertions: 3, deletions: 4 },
			{ uri: '/repo/gone.ts', modified: undefined, original: '/repo/gone.ts.before', insertions: 0, deletions: 8 },
		]);
	});

	test('reduceTurnChanges filters files outside the workspace and worktree roots', () => {
		const edits: IParsedFileEdit[] = [
			parsedEdit(FileEditKind.Edit, { after: '/repo/src/app.ts', beforeContent: '/repo/src/app.ts.before' }, { insertions: 2 }),
			parsedEdit(FileEditKind.Create, { after: '/tmp/session-worktree/README.md' }, { insertions: 5 }),
			parsedEdit(FileEditKind.Edit, { after: '/home/user/.config/tool.json', beforeContent: '/home/user/.config/tool.json.before' }, { insertions: 10, deletions: 1 }),
		];

		const changes = reduceTurnChanges(edits, [URI.file('/repo'), URI.file('/tmp/session-worktree')]).map(c => ({
			uri: c.uri.path,
			modified: c.modifiedUri?.path,
			original: c.originalUri?.path,
			insertions: c.insertions,
			deletions: c.deletions,
		}));

		assert.deepStrictEqual(changes, [
			{ uri: '/repo/src/app.ts', modified: '/repo/src/app.ts', original: '/repo/src/app.ts.before', insertions: 2, deletions: 0 },
			{ uri: '/tmp/session-worktree/README.md', modified: '/tmp/session-worktree/README.md', original: undefined, insertions: 5, deletions: 0 },
		]);
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

		const changes = reduceTurnChanges(edits).map(c => ({
			uri: c.uri.path,
			modified: c.modifiedUri?.path,
			original: c.originalUri?.path,
			insertions: c.insertions,
			deletions: c.deletions,
		}));

		assert.deepStrictEqual(changes, [
			{ uri: '/repo/renamed.ts', modified: '/repo/renamed.ts', original: '/repo/old.ts.before', insertions: 1, deletions: 2 },
		]);
	});
});
