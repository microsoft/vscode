/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { DocumentId } from '../../../../platform/inlineEdits/common/dataTypes/documentId';
import { Edits, RootedEdit } from '../../../../platform/inlineEdits/common/dataTypes/edit';
import { LanguageId } from '../../../../platform/inlineEdits/common/dataTypes/languageId';
import { DiffHistoryOptions } from '../../../../platform/inlineEdits/common/dataTypes/xtabPromptOptions';
import { StatelessNextEditDocument } from '../../../../platform/inlineEdits/common/statelessNextEditProvider';
import { IXtabHistoryEditEntry, IXtabHistoryEntry } from '../../../../platform/inlineEdits/common/workspaceEditTracker/nesXtabHistoryTracker';
import { LineEdit } from '../../../../util/vs/editor/common/core/edits/lineEdit';
import { StringEdit, StringReplacement } from '../../../../util/vs/editor/common/core/edits/stringEdit';
import { OffsetRange } from '../../../../util/vs/editor/common/core/ranges/offsetRange';
import { StringText } from '../../../../util/vs/editor/common/core/text/abstractText';
import { getEditDiffHistory } from '../../common/diffHistoryForPrompt';

const diffHistoryOptions: DiffHistoryOptions = {
	nEntries: 10,
	maxTokens: Number.MAX_SAFE_INTEGER,
	onlyForDocsInPrompt: false,
	useRelativePaths: false,
};

function createActiveDocument(docId: DocumentId, text: StringText): StatelessNextEditDocument {
	return new StatelessNextEditDocument(
		docId,
		undefined,
		LanguageId.PlainText,
		text.getLines(),
		LineEdit.empty,
		text,
		new Edits(StringEdit, []),
	);
}

function createHistoryEntry(docId: DocumentId, baseContent: string, replacements: readonly StringReplacement[]): IXtabHistoryEditEntry {
	const base = new StringText(baseContent);
	return {
		docId,
		kind: 'edit',
		edit: new RootedEdit(base, new StringEdit(replacements)),
	};
}

describe('getEditDiffHistory', () => {

	function computeTokens(s: string): number {
		// for testing purposes, we'll say each character is a token
		return Math.ceil(s.length / 4);
	}

	function runGetEditDiffHistory(activeDoc: StatelessNextEditDocument, xtabHistory: readonly IXtabHistoryEntry[], docsInPrompt: Set<DocumentId>, computeTokens: (s: string) => number, options: DiffHistoryOptions): string {
		const res = getEditDiffHistory(activeDoc, xtabHistory, docsInPrompt, computeTokens, options);
		const lines = [
			res.nDiffs + ' diffs',
			'-------------',
			res.totalTokens + ' tokens',
			'-------------',
			res.promptPiece,
		];
		return lines.join('\n');
	}

	it('coalesces adjacent line replacements into one hunk', () => {
		const docId = DocumentId.create('file:///workspace/src/a.ts');
		const activeDoc = createActiveDocument(docId, new StringText('aaa\nbbb\nccc'));

		const historyEntry = createHistoryEntry(docId, 'aaa\nbbb\nccc', [
			new StringReplacement(new OffsetRange(0, 3), 'AAA'),
			new StringReplacement(new OffsetRange(4, 7), 'BBB'),
		]);

		const result = runGetEditDiffHistory(activeDoc, [historyEntry], new Set(), computeTokens, diffHistoryOptions);

		expect(result).toMatchInlineSnapshot(`
			"1 diffs
			-------------
			21 tokens
			-------------
			--- /workspace/src/a.ts
			+++ /workspace/src/a.ts
			@@ -0,2 +0,2 @@
			-aaa
			-bbb
			+AAA
			+BBB
			"
		`);
	});

	it('keeps separate hunks for non-adjacent line replacements', () => {
		const docId = DocumentId.create('file:///workspace/src/a.ts');
		const activeDoc = createActiveDocument(docId, new StringText('aaa\nbbb\nccc'));

		const historyEntry = createHistoryEntry(docId, 'aaa\nbbb\nccc', [
			new StringReplacement(new OffsetRange(0, 3), 'AAA'),
			new StringReplacement(new OffsetRange(8, 11), 'CCC'),
		]);

		const result = runGetEditDiffHistory(activeDoc, [historyEntry], new Set(), computeTokens, diffHistoryOptions);

		expect(result).toMatchInlineSnapshot(`
			"1 diffs
			-------------
			25 tokens
			-------------
			--- /workspace/src/a.ts
			+++ /workspace/src/a.ts
			@@ -0,1 +0,1 @@
			-aaa
			+AAA
			@@ -2,1 +2,1 @@
			-ccc
			+CCC
			"
		`);
	});

	it('renders diffs for multiple sequential edits on the same document', () => {
		const docId = DocumentId.create('file:///Users/john/myProject/src/a.ts');
		const activeDoc = createActiveDocument(docId, new StringText('AAA\nBBB\nccc\nddd\neee'));

		const historyEntries: IXtabHistoryEditEntry[] = [
			createHistoryEntry(docId, 'aaa\nbbb\nccc\nddd\neee', [
				new StringReplacement(new OffsetRange(0, 3), 'AAA'),
			]),
			createHistoryEntry(docId, 'AAA\nbbb\nccc\nddd\neee', [
				new StringReplacement(new OffsetRange(4, 7), 'BBB'),
			]),
		];

		const result = runGetEditDiffHistory(activeDoc, historyEntries, new Set(), computeTokens, diffHistoryOptions);

		expect(result).toMatchInlineSnapshot(`
			"2 diffs
			-------------
			48 tokens
			-------------
			--- /Users/john/myProject/src/a.ts
			+++ /Users/john/myProject/src/a.ts
			@@ -0,1 +0,1 @@
			-aaa
			+AAA

			--- /Users/john/myProject/src/a.ts
			+++ /Users/john/myProject/src/a.ts
			@@ -1,1 +1,1 @@
			-bbb
			+BBB
			"
		`);
	});
});
