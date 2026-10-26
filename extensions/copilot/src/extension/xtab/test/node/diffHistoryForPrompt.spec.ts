/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { DocumentId } from '../../../../platform/inlineEdits/common/dataTypes/documentId';
import { Edits, RootedEdit } from '../../../../platform/inlineEdits/common/dataTypes/edit';
import { LanguageId } from '../../../../platform/inlineEdits/common/dataTypes/languageId';
import { DEFAULT_REJECTED_EDITS_MAX_EDITS_AFTER, DiffHistoryOptions, PromptMemoryOptions, RejectedEditsMemoryMode, RejectedEditsPlacement } from '../../../../platform/inlineEdits/common/dataTypes/xtabPromptOptions';
import { StatelessNextEditDocument } from '../../../../platform/inlineEdits/common/statelessNextEditProvider';
import { IXtabHistoryEditEntry, IXtabHistoryEntry, IXtabHistoryRejectedEditEntry } from '../../../../platform/inlineEdits/common/workspaceEditTracker/nesXtabHistoryTracker';
import { LineEdit } from '../../../../util/vs/editor/common/core/edits/lineEdit';
import { StringEdit, StringReplacement } from '../../../../util/vs/editor/common/core/edits/stringEdit';
import { OffsetRange } from '../../../../util/vs/editor/common/core/ranges/offsetRange';
import { StringText } from '../../../../util/vs/editor/common/core/text/abstractText';
import { getEditDiffHistory, selectRejectedEditsForPrompt } from '../../common/diffHistoryForPrompt';

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
		ordinal: 0,
		edit: new RootedEdit(base, new StringEdit(replacements)),
	};
}

describe('getEditDiffHistory', () => {

	function computeTokens(s: string): number {
		// for testing purposes, we'll say each character is a token
		return Math.ceil(s.length / 4);
	}

	function runGetEditDiffHistory(activeDoc: StatelessNextEditDocument, xtabHistory: readonly IXtabHistoryEntry[], docsInPrompt: Set<DocumentId>, computeTokens: (s: string) => number, options: DiffHistoryOptions, rejectedEditHistory: readonly IXtabHistoryRejectedEditEntry[] = [], rejectedEditsMode: RejectedEditsMemoryMode | undefined = RejectedEditsMemoryMode.DiffWithTags, memoryOptions: PromptMemoryOptions = {}): string {
		const res = getEditDiffHistory(activeDoc, xtabHistory, docsInPrompt, computeTokens, options, rejectedEditHistory, { ...memoryOptions, rejectedEdits: rejectedEditsMode });
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
			{
				...createHistoryEntry(docId, 'AAA\nbbb\nccc\nddd\neee', [
					new StringReplacement(new OffsetRange(4, 7), 'BBB'),
				]),
				ordinal: 1,
			},
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

	it('adds separately tracked rejected edits with rejection annotations', () => {
		const docId = DocumentId.create('file:///workspace/src/a.ts');
		const activeDoc = createActiveDocument(docId, new StringText('aaa\nbbb'));
		const rejectedEntry: IXtabHistoryRejectedEditEntry = {
			kind: 'rejectedEdit',
			docId,
			ordinal: 0,
			hunks: [{ startLineNumber: 0, oldLines: ['aaa'], newLines: ['AAA'] }],
		};

		const result = runGetEditDiffHistory(activeDoc, [], new Set(), computeTokens, diffHistoryOptions, [rejectedEntry]);

		expect(result).toContain('@@ -0,1 +0,1 @@ <|rejected/|>');
		expect(result).toContain('-aaa\n+AAA');
	});

	it('preserves chronology across normal and rejected histories', () => {
		const docId = DocumentId.create('file:///workspace/src/a.ts');
		const activeDoc = createActiveDocument(docId, new StringText('aaa\nbbb'));
		const rejectedEntry: IXtabHistoryRejectedEditEntry = {
			kind: 'rejectedEdit',
			docId,
			ordinal: 1,
			hunks: [{ startLineNumber: 0, oldLines: ['aaa'], newLines: ['AAA'] }],
		};
		const normalEntry = { ...createHistoryEntry(docId, 'aaa\nbbb', [new StringReplacement(new OffsetRange(4, 7), 'BBB')]), ordinal: 2 };

		const result = runGetEditDiffHistory(activeDoc, [normalEntry], new Set(), computeTokens, diffHistoryOptions, [rejectedEntry]);

		expect(result.indexOf('<|rejected/|>')).toBeLessThan(result.indexOf('+BBB'));
	});

	it('inserts rejections by ordinal before a synthetic history entry', () => {
		const docId = DocumentId.create('file:///workspace/src/a.ts');
		const activeDoc = createActiveDocument(docId, new StringText('aaa\nbbb\nccc'));
		const normalEntry = {
			...createHistoryEntry(docId, 'aaa\nbbb\nccc', [new StringReplacement(new OffsetRange(0, 3), 'AAA')]),
			ordinal: 47,
		};
		const syntheticEntry = {
			...createHistoryEntry(docId, 'AAA\nbbb\nccc', [new StringReplacement(new OffsetRange(8, 11), 'CCC')]),
			ordinal: 49,
		};
		const rejectedEntry: IXtabHistoryRejectedEditEntry = {
			kind: 'rejectedEdit',
			docId,
			ordinal: 48,
			hunks: [{ startLineNumber: 1, oldLines: ['bbb'], newLines: ['BBB'] }],
		};

		const result = runGetEditDiffHistory(activeDoc, [normalEntry, syntheticEntry], new Set(), computeTokens, diffHistoryOptions, [rejectedEntry]);

		expect(result.indexOf('+AAA')).toBeLessThan(result.indexOf('<|rejected/|>'));
		expect(result.indexOf('<|rejected/|>')).toBeLessThan(result.indexOf('+CCC'));
	});

	it('skips an over-budget rejected sample without starving normal history', () => {
		const docId = DocumentId.create('file:///workspace/src/a.ts');
		const activeDoc = createActiveDocument(docId, new StringText('a\nb'));
		const rejectedEntry: IXtabHistoryRejectedEditEntry = {
			kind: 'rejectedEdit',
			docId,
			ordinal: 2,
			hunks: [{ startLineNumber: 0, oldLines: ['a'], newLines: ['x'.repeat(500)] }],
		};
		const normalEntry = { ...createHistoryEntry(docId, 'a\nb', [new StringReplacement(new OffsetRange(2, 3), 'B')]), ordinal: 1 };

		const result = runGetEditDiffHistory(
			activeDoc,
			[normalEntry],
			new Set(),
			computeTokens,
			{ ...diffHistoryOptions, maxTokens: 30 },
			[rejectedEntry],
		);

		expect(result).not.toContain('<|rejected/|>');
		expect(result).toContain('+B');
	});
	it('renders an applied-then-undone rejection as plain history at the position of the rejection', () => {
		const docId = DocumentId.create('file:///workspace/src/a.ts');
		const activeDoc = createActiveDocument(docId, new StringText('aaa\nbbb\nccc'));
		const before = { ...createHistoryEntry(docId, 'aaa\nbbb\nccc', [new StringReplacement(new OffsetRange(0, 3), 'AAA')]), ordinal: 1 };
		const rejectedEntry: IXtabHistoryRejectedEditEntry = {
			kind: 'rejectedEdit',
			docId,
			ordinal: 2,
			hunks: [{ startLineNumber: 1, oldLines: ['bbb'], newLines: ['BBB'] }],
		};
		const after = { ...createHistoryEntry(docId, 'AAA\nbbb\nccc', [new StringReplacement(new OffsetRange(8, 11), 'CCC')]), ordinal: 3 };

		const result = runGetEditDiffHistory(activeDoc, [before, after], new Set(), computeTokens, diffHistoryOptions, [rejectedEntry], RejectedEditsMemoryMode.AppliedThenUndone);

		expect(result).toMatchInlineSnapshot(`
			"3 diffs
			-------------
			75 tokens
			-------------
			--- /workspace/src/a.ts
			+++ /workspace/src/a.ts
			@@ -0,1 +0,1 @@
			-aaa
			+AAA

			--- /workspace/src/a.ts
			+++ /workspace/src/a.ts
			@@ -1,1 +1,1 @@
			-bbb
			+BBB

			--- /workspace/src/a.ts
			+++ /workspace/src/a.ts
			@@ -1,1 +1,1 @@
			-BBB
			+bbb

			--- /workspace/src/a.ts
			+++ /workspace/src/a.ts
			@@ -2,1 +2,1 @@
			-ccc
			+CCC
			"
		`);
		expect(result).not.toContain('<|rejected/|>');
	});

	it.each(['one diff', 'one token less than the pair'])('skips the entire applied-then-undone pair when the budget fits %s without starving normal history', budget => {
		const docId = DocumentId.create('file:///workspace/src/a.ts');
		const activeDoc = createActiveDocument(docId, new StringText('aaa\nbbb'));
		const rejectedEntry: IXtabHistoryRejectedEditEntry = {
			kind: 'rejectedEdit',
			docId,
			ordinal: 2,
			hunks: [{ startLineNumber: 0, oldLines: ['aaa'], newLines: ['AAA'] }],
		};
		const normalEntry = { ...createHistoryEntry(docId, 'aaa\nbbb', [new StringReplacement(new OffsetRange(4, 7), 'BBB')]), ordinal: 1 };
		const applied = '--- /workspace/src/a.ts\n+++ /workspace/src/a.ts\n@@ -0,1 +0,1 @@\n-aaa\n+AAA';
		const undone = '--- /workspace/src/a.ts\n+++ /workspace/src/a.ts\n@@ -0,1 +0,1 @@\n-AAA\n+aaa';
		const maxTokens = budget === 'one diff' ? computeTokens(applied) : computeTokens(`${applied}\n\n${undone}`) - 1;
		const options = { ...diffHistoryOptions, maxTokens };

		const result = getEditDiffHistory(activeDoc, [normalEntry], new Set(), computeTokens, options, [rejectedEntry], { rejectedEdits: RejectedEditsMemoryMode.AppliedThenUndone });
		const normalDiff = '--- /workspace/src/a.ts\n+++ /workspace/src/a.ts\n@@ -1,1 +1,1 @@\n-bbb\n+BBB';

		expect(result).toEqual({
			promptPiece: `${normalDiff}\n`,
			nDiffs: 1,
			totalTokens: computeTokens(normalDiff),
		});
	});

	it.each([0, 1])('keeps an applied-then-undone pair atomic with nEntries=%i and exactly enough tokens', nEntries => {
		const docId = DocumentId.create('file:///workspace/src/a.ts');
		const activeDoc = createActiveDocument(docId, new StringText('aaa\nbbb'));
		const rejectedEntry: IXtabHistoryRejectedEditEntry = {
			kind: 'rejectedEdit',
			docId,
			ordinal: 2,
			hunks: [{ startLineNumber: 0, oldLines: ['aaa'], newLines: ['AAA'] }],
		};
		const normalEntry = { ...createHistoryEntry(docId, 'aaa\nbbb', [new StringReplacement(new OffsetRange(4, 7), 'BBB')]), ordinal: 1 };
		const pair = '--- /workspace/src/a.ts\n+++ /workspace/src/a.ts\n@@ -0,1 +0,1 @@\n-aaa\n+AAA\n\n--- /workspace/src/a.ts\n+++ /workspace/src/a.ts\n@@ -0,1 +0,1 @@\n-AAA\n+aaa';
		const maxTokens = computeTokens(pair);

		const result = getEditDiffHistory(activeDoc, [normalEntry], new Set(), computeTokens, { ...diffHistoryOptions, nEntries, maxTokens }, [rejectedEntry], { rejectedEdits: RejectedEditsMemoryMode.AppliedThenUndone });

		expect(result).toEqual(nEntries === 0
			? { promptPiece: '', nDiffs: 0, totalTokens: 0 }
			: { promptPiece: `${pair}\n`, nDiffs: 1, totalTokens: maxTokens });
	});

	describe('rejection placement and repetitions', () => {
		const docId = DocumentId.create('file:///workspace/src/a.ts');
		const activeDoc = createActiveDocument(docId, new StringText('aaa\nbbb\nccc'));
		const before = { ...createHistoryEntry(docId, 'aaa\nbbb\nccc', [new StringReplacement(new OffsetRange(0, 3), 'AAA')]), ordinal: 1 };
		const rejectedEntry: IXtabHistoryRejectedEditEntry = { kind: 'rejectedEdit', docId, ordinal: 2, hunks: [{ startLineNumber: 1, oldLines: ['bbb'], newLines: ['BBB'] }] };
		const after = { ...createHistoryEntry(docId, 'AAA\nbbb\nccc', [new StringReplacement(new OffsetRange(8, 11), 'CCC')]), ordinal: 3 };
		const render = (mode: RejectedEditsMemoryMode, memory: PromptMemoryOptions = {}) =>
			runGetEditDiffHistory(activeDoc, [before, after], new Set(), computeTokens, diffHistoryOptions, [rejectedEntry], mode, memory);
		const lastHunk = (result: string) => result.trimEnd().split('\n').slice(-3).join('\n');

		it('places the rejection at its own position by default and as the newest entries with the newest placement', () => {
			expect(lastHunk(render(RejectedEditsMemoryMode.AppliedThenUndone))).toContain('+CCC');
			expect(lastHunk(render(RejectedEditsMemoryMode.AppliedThenUndone, { rejectedEditsPlacement: RejectedEditsPlacement.InPlace }))).toContain('+CCC');

			const newest = render(RejectedEditsMemoryMode.AppliedThenUndone, { rejectedEditsPlacement: RejectedEditsPlacement.Newest });
			expect(lastHunk(newest)).toBe('@@ -1,1 +1,1 @@\n-BBB\n+bbb');
			expect(newest.indexOf('+CCC')).toBeLessThan(newest.indexOf('+BBB'));
		});

		it('applies the newest placement to the tagged mode as well', () => {
			const newest = render(RejectedEditsMemoryMode.DiffWithTags, { rejectedEditsPlacement: RejectedEditsPlacement.Newest });
			expect(lastHunk(newest)).toContain('<|rejected/|>');
		});

		it('writes the applied/undone pair as many times as asked and counts it as one entry', () => {
			const count = (text: string, part: string) => text.split(part).length - 1;
			const once = render(RejectedEditsMemoryMode.AppliedThenUndone);
			const twice = render(RejectedEditsMemoryMode.AppliedThenUndone, { rejectedEditsRepetitions: 2 });

			expect(count(once, '+BBB')).toBe(1);
			expect(count(twice, '+BBB')).toBe(2);
			expect(once.split('\n')[0]).toBe(twice.split('\n')[0]);
		});
	});

	it('leaves the history unchanged in applied-then-undone mode when there is no rejection', () => {
		const docId = DocumentId.create('file:///workspace/src/a.ts');
		const activeDoc = createActiveDocument(docId, new StringText('aaa\nbbb'));
		const entry = { ...createHistoryEntry(docId, 'aaa\nbbb', [new StringReplacement(new OffsetRange(0, 3), 'AAA')]), ordinal: 1 };

		const withoutMemory = runGetEditDiffHistory(activeDoc, [entry], new Set(), computeTokens, diffHistoryOptions, [], undefined);
		const withMemory = runGetEditDiffHistory(activeDoc, [entry], new Set(), computeTokens, diffHistoryOptions, [], RejectedEditsMemoryMode.AppliedThenUndone);

		expect(withMemory).toBe(withoutMemory);
	});

	describe('selectRejectedEditsForPrompt', () => {
		const APPLIED_THEN_UNDONE = { rejectedEdits: RejectedEditsMemoryMode.AppliedThenUndone };
		const docId = DocumentId.create('file:///workspace/src/a.ts');
		const otherDocId = DocumentId.create('file:///workspace/src/b.ts');
		const doc = createActiveDocument(docId, new StringText(Array(12).fill('old').join('\n')));
		const rejection = (id: DocumentId, startLineNumber: number, nOldLines: number): IXtabHistoryRejectedEditEntry => ({
			kind: 'rejectedEdit',
			docId: id,
			ordinal: 0,
			hunks: [{ startLineNumber, oldLines: Array(nOldLines).fill('old'), newLines: ['new'] }],
		});

		it('returns nothing when memory is off', () => {
			expect(selectRejectedEditsForPrompt(undefined, [rejection(docId, 5, 1)], [], doc)).toEqual([]);
		});

		it('keeps rejections from every document in diffWithTags mode', () => {
			const rejections = [rejection(docId, 5, 1), rejection(otherDocId, 50, 1)];
			expect(selectRejectedEditsForPrompt({ rejectedEdits: RejectedEditsMemoryMode.DiffWithTags }, rejections, [], doc)).toEqual(rejections);
		});

		it('keeps only same-document rejections in appliedThenUndone mode', () => {
			const sameDoc = rejection(docId, 5, 1);
			const farFromAnyCursor = rejection(docId, 11, 1);
			const otherFile = rejection(otherDocId, 5, 1);

			expect(selectRejectedEditsForPrompt(APPLIED_THEN_UNDONE, [sameDoc, farFromAnyCursor, otherFile], [], doc)).toEqual([sameDoc, farFromAnyCursor]);
		});

		it('keeps a rejection after its lines were edited, like any other history entry', () => {
			const edited = createActiveDocument(docId, new StringText(Array(12).fill('changed').join('\n')));
			const rejected = rejection(docId, 5, 1);

			expect(selectRejectedEditsForPrompt(APPLIED_THEN_UNDONE, [rejected], [], edited)).toEqual([rejected]);
		});

		it('drops a rejection once more than the default number of edits follow it', () => {
			const rejected = { ...rejection(docId, 5, 1), ordinal: 10 };
			const edit = (ordinal: number) => ({ ...createHistoryEntry(docId, 'a', [new StringReplacement(new OffsetRange(0, 1), 'b')]), ordinal });
			const select = (history: IXtabHistoryEntry[]) => selectRejectedEditsForPrompt(APPLIED_THEN_UNDONE, [rejected], history, doc);
			const editsAfter = (n: number) => Array.from({ length: n }, (_, i) => edit(11 + i));

			expect(select([edit(9), ...editsAfter(DEFAULT_REJECTED_EDITS_MAX_EDITS_AFTER)])).toEqual([rejected]);
			expect(select(editsAfter(DEFAULT_REJECTED_EDITS_MAX_EDITS_AFTER + 1))).toEqual([]);
		});

		it('keeps only the most recent rejections when a maximum count is set', () => {
			const rejections = [{ ...rejection(docId, 1, 1), ordinal: 1 }, { ...rejection(docId, 2, 1), ordinal: 2 }, { ...rejection(docId, 3, 1), ordinal: 3 }];
			const select = (rejectedEditsMaxCount?: number) => selectRejectedEditsForPrompt({ ...APPLIED_THEN_UNDONE, rejectedEditsMaxCount }, rejections, [], doc);

			expect(select(undefined)).toEqual(rejections);
			expect(select(2)).toEqual(rejections.slice(1));
			expect(select(0)).toEqual([]);
		});

		it('applies the edit limit to every mode and reads it from the memory options', () => {
			const rejected = { ...rejection(docId, 5, 1), ordinal: 10 };
			const edit = (ordinal: number) => ({ ...createHistoryEntry(docId, 'a', [new StringReplacement(new OffsetRange(0, 1), 'b')]), ordinal });
			const history = [edit(11), edit(12)];

			for (const rejectedEdits of [RejectedEditsMemoryMode.DiffWithTags, RejectedEditsMemoryMode.AppliedThenUndone]) {
				expect(selectRejectedEditsForPrompt({ rejectedEdits, rejectedEditsMaxEditsAfter: 2 }, [rejected], history, doc)).toEqual([rejected]);
				expect(selectRejectedEditsForPrompt({ rejectedEdits, rejectedEditsMaxEditsAfter: 1 }, [rejected], history, doc)).toEqual([]);
			}
		});
	});
});
