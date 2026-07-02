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
import {
	createIncrementalChatFileEditsParser,
	IFileEditChatState,
	IParsedFileEdit,
	parseResponseParts,
	reduceSessionFiles,
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

function createEdit(uri: string): object {
	return { type: ToolResultContentType.FileEdit, after: { uri, content: { uri: `${uri}.after` } } };
}

function editEdit(uri: string): object {
	return {
		type: ToolResultContentType.FileEdit,
		before: { uri, content: { uri: `${uri}.before` } },
		after: { uri, content: { uri: `${uri}.after` } },
	};
}

function deleteEdit(uri: string): object {
	return { type: ToolResultContentType.FileEdit, before: { uri, content: { uri: `${uri}.before` } } };
}

function parsedEdit(kind: FileEditKind, uris: { after?: string; before?: string; beforeContent?: string }): IParsedFileEdit {
	return {
		kind,
		afterUri: uris.after ? URI.file(uris.after) : undefined,
		beforeUri: uris.before ? URI.file(uris.before) : undefined,
		beforeContentUri: uris.beforeContent ? URI.file(uris.beforeContent) : undefined,
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

	test('incremental parser keeps completed-turn edits while a new turn streams', () => {
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
				first: first.map(e => e.afterUri?.toString()),
				streaming: streaming.map(e => e.afterUri?.toString()),
			},
			{
				first: ['file:///a.txt'],
				streaming: ['file:///a.txt', 'file:///b.txt'],
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

	test('reduceSessionFiles classifies operations and filters workspace files', () => {
		const edits: IParsedFileEdit[] = [
			// created-then-edited outside workspace → Created
			parsedEdit(FileEditKind.Create, { after: '/home/user/.config/app.json' }),
			parsedEdit(FileEditKind.Edit, { after: '/home/user/.config/app.json', beforeContent: '/home/user/.config/app.json.before' }),
			// edited outside workspace → Modified (keeps original for diff)
			parsedEdit(FileEditKind.Edit, { after: '/home/user/.bashrc', beforeContent: '/home/user/.bashrc.before' }),
			// deleted outside workspace → Deleted
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
				{ uri: '/tmp/scratch.log', operation: SessionFileOperation.Deleted, original: '/tmp/scratch.log.before' },
			],
		);
	});

	test('reduceSessionFiles models a rename as a delete of the source and a create of the target', () => {
		const edits: IParsedFileEdit[] = [
			parsedEdit(FileEditKind.Rename, { before: '/home/user/old.txt', after: '/home/user/new.txt', beforeContent: '/home/user/old.txt.before' }),
		];

		const files = reduceSessionFiles(edits, [URI.file('/repo')]);

		assert.deepStrictEqual(
			files.map(f => ({ uri: f.uri.path, operation: f.operation })),
			[
				{ uri: '/home/user/new.txt', operation: SessionFileOperation.Created },
				{ uri: '/home/user/old.txt', operation: SessionFileOperation.Deleted },
			],
		);
	});
});
