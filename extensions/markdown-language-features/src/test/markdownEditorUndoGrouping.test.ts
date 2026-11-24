/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import { MarkdownEditorUndoGrouper } from '../preview/markdownEditorUndoGrouping';
import type { UndoEditHint } from '../preview/markdownEditorProtocol';

suite('MarkdownEditorUndoGrouper', () => {

	function applyInsertion(grouper: MarkdownEditorUndoGrouper, offset: number, newText: string, hint?: UndoEditHint) {
		if (hint) {
			grouper.acceptHint(hint);
		}
		const steps = grouper.planEdits([{ offset, length: 0, newText }], '');
		for (const step of steps) {
			step.commit();
		}
		return steps;
	}

	function applySingleInsertion(grouper: MarkdownEditorUndoGrouper, offset: number, newText: string, hint?: UndoEditHint) {
		const steps = applyInsertion(grouper, offset, newText, hint);
		assert.strictEqual(steps.length, 1);
		return steps[0].metadata;
	}

	function applyDeletion(grouper: MarkdownEditorUndoGrouper, offset: number, length: number, deletedText = 'x'.repeat(length), hint?: UndoEditHint) {
		if (hint) {
			grouper.acceptHint(hint);
		}
		const steps = grouper.planEdits([{ offset, length, newText: '' }], deletedText);
		assert.strictEqual(steps.length, 1);
		steps[0].commit();
		return steps[0].metadata;
	}

	test('groups contiguous characters of a word and breaks on space boundaries', () => {
		const grouper = new MarkdownEditorUndoGrouper();
		const text = 'hello world';
		const stops: boolean[] = [];

		for (let i = 0; i < text.length; i++) {
			const meta = applySingleInsertion(grouper, i, text[i]);
			stops.push(meta.undoStopBefore);
			assert.strictEqual(meta.undoStopAfter, false);
		}

		// 'h' starts group 1; 'e','l','l','o' coalesce; ' ' starts group 2; 'w','o','r','l','d' coalesce with the leading space
		assert.deepStrictEqual(stops, [
			true, false, false, false, false, // "hello"
			true, false, false, false, false, false, // " world"
		]);
	});

	test('splits batched insertions at word/space undo boundaries', () => {
		const grouper = new MarkdownEditorUndoGrouper();
		assert.deepStrictEqual(applySingleInsertion(grouper, 0, 'hell'), { undoStopBefore: true, undoStopAfter: false });

		// Receiving "o " as one batch splits into "o" (coalesces with "hell") and " " (starts new group)
		const split = applyInsertion(grouper, 4, 'o ');
		assert.deepStrictEqual(
			split.map(s => ({ edits: s.edits, metadata: s.metadata })),
			[
				{ edits: [{ offset: 4, length: 0, newText: 'o' }], metadata: { undoStopBefore: false, undoStopAfter: false } },
				{ edits: [{ offset: 5, length: 0, newText: ' ' }], metadata: { undoStopBefore: true, undoStopAfter: false } },
			],
		);

		// Following "world" coalesces into the " " group
		assert.deepStrictEqual(applySingleInsertion(grouper, 6, 'world'), { undoStopBefore: false, undoStopAfter: false });
	});

	test('groups consecutive spaces together and breaks before the next word', () => {
		const grouper = new MarkdownEditorUndoGrouper();
		assert.deepStrictEqual(applySingleInsertion(grouper, 0, 'a'), { undoStopBefore: true, undoStopAfter: false });
		assert.deepStrictEqual(applySingleInsertion(grouper, 1, ' '), { undoStopBefore: true, undoStopAfter: false });
		assert.deepStrictEqual(applySingleInsertion(grouper, 2, ' '), { undoStopBefore: false, undoStopAfter: false });
		assert.deepStrictEqual(applySingleInsertion(grouper, 3, 'b'), { undoStopBefore: true, undoStopAfter: false });
	});

	test('breaks undo group when cursor jumps to a non-contiguous offset', () => {
		const grouper = new MarkdownEditorUndoGrouper();
		assert.deepStrictEqual(applySingleInsertion(grouper, 0, 'a'), { undoStopBefore: true, undoStopAfter: false });
		assert.deepStrictEqual(applySingleInsertion(grouper, 1, 'b'), { undoStopBefore: false, undoStopAfter: false });
		// Jump to offset 10
		assert.deepStrictEqual(applySingleInsertion(grouper, 10, 'c'), { undoStopBefore: true, undoStopAfter: false });
		assert.deepStrictEqual(applySingleInsertion(grouper, 11, 'd'), { undoStopBefore: false, undoStopAfter: false });
	});

	test('isolates short pastes via isolated hint and breaks on navigation hint', () => {
		const grouper = new MarkdownEditorUndoGrouper();
		assert.deepStrictEqual(applySingleInsertion(grouper, 0, 'foo'), { undoStopBefore: true, undoStopAfter: false });
		// Short 3-char paste is isolated both before and after
		assert.deepStrictEqual(applySingleInsertion(grouper, 3, 'bar', 'isolated'), { undoStopBefore: true, undoStopAfter: true });
		// Subsequent typing starts a fresh group
		assert.deepStrictEqual(applySingleInsertion(grouper, 6, '!'), { undoStopBefore: true, undoStopAfter: false });

		// Navigation back to same offset breaks the group
		grouper.acceptHint('break');
		assert.deepStrictEqual(applySingleInsertion(grouper, 7, '?'), { undoStopBefore: true, undoStopAfter: false });
	});

	test('always isolates newlines, large pastes, and multi-edit batches', () => {
		const grouper = new MarkdownEditorUndoGrouper();
		applySingleInsertion(grouper, 0, 'a');

		// Newline
		assert.deepStrictEqual(applySingleInsertion(grouper, 1, '\n'), { undoStopBefore: true, undoStopAfter: true });
		// Next typing after newline starts fresh
		assert.deepStrictEqual(applySingleInsertion(grouper, 2, 'b'), { undoStopBefore: true, undoStopAfter: false });

		// Large paste (> 32 chars)
		assert.deepStrictEqual(applySingleInsertion(grouper, 3, 'x'.repeat(40)), { undoStopBefore: true, undoStopAfter: true });
		assert.deepStrictEqual(applySingleInsertion(grouper, 43, 'c'), { undoStopBefore: true, undoStopAfter: false });

		// Multi-edit batch
		const multi = grouper.planEdits([
			{ offset: 0, length: 1, newText: 'A' },
			{ offset: 2, length: 1, newText: 'B' },
		], '');
		assert.strictEqual(multi.length, 1);
		multi[0].commit();
		assert.deepStrictEqual(multi[0].metadata, { undoStopBefore: true, undoStopAfter: true });
	});

	test('breaks undo group when switching between Backspace and Delete even after one deletion', () => {
		const grouper = new MarkdownEditorUndoGrouper();
		// Starting at abc|def (offset 3): Backspace deletes 'c' at offset 2
		assert.deepStrictEqual(applyDeletion(grouper, 2, 1, 'c', 'deleteBackward'), { undoStopBefore: true, undoStopAfter: false });
		// Delete removes 'd' at offset 2 -> direction changed, must break!
		assert.deepStrictEqual(applyDeletion(grouper, 2, 1, 'd', 'deleteForward'), { undoStopBefore: true, undoStopAfter: false });
		// Another Delete at offset 2 coalesces with the forward-delete step
		assert.deepStrictEqual(applyDeletion(grouper, 2, 1, 'e', 'deleteForward'), { undoStopBefore: false, undoStopAfter: false });
		// Switching back to Backspace at offset 1 breaks again
		assert.deepStrictEqual(applyDeletion(grouper, 1, 1, 'b', 'deleteBackward'), { undoStopBefore: true, undoStopAfter: false });
		assert.deepStrictEqual(applyDeletion(grouper, 0, 1, 'a', 'deleteBackward'), { undoStopBefore: false, undoStopAfter: false });

		// Deleting a newline breaks the group
		assert.deepStrictEqual(applyDeletion(grouper, 0, 1, '\n', 'deleteForward'), { undoStopBefore: true, undoStopAfter: true });
	});

	test('reset flushes active group and ignores stale in-flight commits', () => {
		const grouper = new MarkdownEditorUndoGrouper();
		assert.deepStrictEqual(applySingleInsertion(grouper, 0, 'a'), { undoStopBefore: true, undoStopAfter: false });

		// Plan edit 'b' (simulates in-flight applyEdit)
		const inFlight = grouper.planEdits([{ offset: 1, length: 0, newText: 'b' }], '');
		assert.deepStrictEqual(inFlight[0].metadata, { undoStopBefore: false, undoStopAfter: false });

		// A navigation break arrives while 'b' is in flight
		grouper.acceptHint('break');
		// 'b' finishes and commits, but its stale commit must not undo the break
		inFlight[0].commit();

		// Next char at offset 2 starts a fresh undo group
		assert.deepStrictEqual(applySingleInsertion(grouper, 2, 'c'), { undoStopBefore: true, undoStopAfter: false });
	});
});
