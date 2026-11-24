/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import { MarkdownEditorUndoGrouper } from '../preview/markdownEditorUndoGrouping';

suite('MarkdownEditorUndoGrouper', () => {

	function applyInsertion(grouper: MarkdownEditorUndoGrouper, offset: number, newText: string) {
		const metadata = grouper.prepareEdit([{ offset, length: 0, newText }], '');
		grouper.commitEdit();
		return metadata;
	}

	function applyDeletion(grouper: MarkdownEditorUndoGrouper, offset: number, length: number, deletedText = 'x'.repeat(length)) {
		const metadata = grouper.prepareEdit([{ offset, length, newText: '' }], deletedText);
		grouper.commitEdit();
		return metadata;
	}

	test('groups contiguous characters of a word and breaks on space boundaries', () => {
		const grouper = new MarkdownEditorUndoGrouper();
		const text = 'hello world';
		const stops: boolean[] = [];

		for (let i = 0; i < text.length; i++) {
			const meta = applyInsertion(grouper, i, text[i]);
			stops.push(meta.undoStopBefore);
			assert.strictEqual(meta.undoStopAfter, false);
		}

		// 'h' starts group 1; 'e','l','l','o' coalesce; ' ' starts group 2; 'w','o','r','l','d' coalesce with the leading space
		assert.deepStrictEqual(stops, [
			true, false, false, false, false, // "hello"
			true, false, false, false, false, false, // " world"
		]);
	});

	test('groups consecutive spaces together and breaks before the next word', () => {
		const grouper = new MarkdownEditorUndoGrouper();
		assert.deepStrictEqual(applyInsertion(grouper, 0, 'a'), { undoStopBefore: true, undoStopAfter: false });
		assert.deepStrictEqual(applyInsertion(grouper, 1, ' '), { undoStopBefore: true, undoStopAfter: false });
		assert.deepStrictEqual(applyInsertion(grouper, 2, ' '), { undoStopBefore: false, undoStopAfter: false });
		assert.deepStrictEqual(applyInsertion(grouper, 3, 'b'), { undoStopBefore: true, undoStopAfter: false });
	});

	test('breaks undo group when cursor jumps to a non-contiguous offset', () => {
		const grouper = new MarkdownEditorUndoGrouper();
		assert.deepStrictEqual(applyInsertion(grouper, 0, 'a'), { undoStopBefore: true, undoStopAfter: false });
		assert.deepStrictEqual(applyInsertion(grouper, 1, 'b'), { undoStopBefore: false, undoStopAfter: false });
		// Jump to offset 10
		assert.deepStrictEqual(applyInsertion(grouper, 10, 'c'), { undoStopBefore: true, undoStopAfter: false });
		assert.deepStrictEqual(applyInsertion(grouper, 11, 'd'), { undoStopBefore: false, undoStopAfter: false });
	});

	test('always isolates newlines, large pastes, and multi-edit batches', () => {
		const grouper = new MarkdownEditorUndoGrouper();
		applyInsertion(grouper, 0, 'a');

		// Newline
		assert.deepStrictEqual(applyInsertion(grouper, 1, '\n'), { undoStopBefore: true, undoStopAfter: true });
		// Next typing after newline starts fresh
		assert.deepStrictEqual(applyInsertion(grouper, 2, 'b'), { undoStopBefore: true, undoStopAfter: false });

		// Large paste (> 32 chars)
		assert.deepStrictEqual(applyInsertion(grouper, 3, 'x'.repeat(40)), { undoStopBefore: true, undoStopAfter: true });
		assert.deepStrictEqual(applyInsertion(grouper, 43, 'c'), { undoStopBefore: true, undoStopAfter: false });

		// Multi-edit batch
		const multi = grouper.prepareEdit([
			{ offset: 0, length: 1, newText: 'A' },
			{ offset: 2, length: 1, newText: 'B' },
		], '');
		grouper.commitEdit();
		assert.deepStrictEqual(multi, { undoStopBefore: true, undoStopAfter: true });
	});

	test('groups contiguous backspace and forward-delete separately', () => {
		const grouper = new MarkdownEditorUndoGrouper();
		// Backspace from offset 5 -> 4 -> 3
		assert.deepStrictEqual(applyDeletion(grouper, 4, 1), { undoStopBefore: true, undoStopAfter: false });
		assert.deepStrictEqual(applyDeletion(grouper, 3, 1), { undoStopBefore: false, undoStopAfter: false });
		assert.deepStrictEqual(applyDeletion(grouper, 2, 1), { undoStopBefore: false, undoStopAfter: false });

		// Switching to forward delete at offset 2 breaks the group
		assert.deepStrictEqual(applyDeletion(grouper, 2, 1), { undoStopBefore: true, undoStopAfter: false });
		assert.deepStrictEqual(applyDeletion(grouper, 2, 1), { undoStopBefore: false, undoStopAfter: false });

		// Deleting a newline breaks the group
		assert.deepStrictEqual(applyDeletion(grouper, 2, 1, '\n'), { undoStopBefore: true, undoStopAfter: true });
	});

	test('reset flushes active group and uncommitted prepareEdit does not advance state', () => {
		const grouper = new MarkdownEditorUndoGrouper();
		assert.deepStrictEqual(applyInsertion(grouper, 0, 'a'), { undoStopBefore: true, undoStopAfter: false });

		// Prepare without commit (simulates rejected applyEdit)
		assert.deepStrictEqual(grouper.prepareEdit([{ offset: 1, length: 0, newText: 'b' }], ''), { undoStopBefore: false, undoStopAfter: false });
		// State is still at offset 1, so preparing at offset 1 still coalesces
		assert.deepStrictEqual(applyInsertion(grouper, 1, 'b'), { undoStopBefore: false, undoStopAfter: false });

		// Reset forces a new undo stop
		grouper.reset();
		assert.deepStrictEqual(applyInsertion(grouper, 2, 'c'), { undoStopBefore: true, undoStopAfter: false });
	});
});
