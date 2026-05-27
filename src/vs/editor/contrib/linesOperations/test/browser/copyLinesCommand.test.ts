/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Selection } from '../../../../common/core/selection.js';
import { CopyLinesCommand } from '../../browser/copyLinesCommand.js';
import { CopyLinesDownAction, CopyLinesUpAction, DuplicateSelectionAction } from '../../browser/linesOperations.js';
import { withTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { testCommand } from '../../../../test/browser/testCommand.js';

function testCopyLinesDownCommand(lines: string[], selection: Selection, expectedLines: string[], expectedSelection: Selection): void {
	testCommand(lines, null, selection, (accessor, sel) => new CopyLinesCommand(sel, true), expectedLines, expectedSelection);
}

function testCopyLinesUpCommand(lines: string[], selection: Selection, expectedLines: string[], expectedSelection: Selection): void {
	testCommand(lines, null, selection, (accessor, sel) => new CopyLinesCommand(sel, false), expectedLines, expectedSelection);
}

suite('Editor Contrib - Copy Lines Command', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('copy first line down', function () {
		testCopyLinesDownCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 3, 1, 1),
			[
				'first',
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(2, 3, 2, 1)
		);
	});

	test('copy first line up', function () {
		testCopyLinesUpCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 3, 1, 1),
			[
				'first',
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 3, 1, 1)
		);
	});

	test('copy last line down', function () {
		testCopyLinesDownCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(5, 3, 5, 1),
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth',
				'fifth'
			],
			new Selection(6, 3, 6, 1)
		);
	});

	test('copy last line up', function () {
		testCopyLinesUpCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(5, 3, 5, 1),
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth',
				'fifth'
			],
			new Selection(5, 3, 5, 1)
		);
	});

	test('issue #1322: copy line up', function () {
		testCopyLinesUpCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(3, 11, 3, 11),
			[
				'first',
				'second line',
				'third line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(3, 11, 3, 11)
		);
	});

	test('issue #1322: copy last line up', function () {
		testCopyLinesUpCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(5, 6, 5, 6),
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth',
				'fifth'
			],
			new Selection(5, 6, 5, 6)
		);
	});

	test('copy many lines up', function () {
		testCopyLinesUpCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(4, 3, 2, 1),
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(4, 3, 2, 1)
		);
	});

	test('ignore empty selection', function () {
		testCopyLinesUpCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(2, 1, 1, 1),
			[
				'first',
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(2, 1, 1, 1)
		);
	});
});

suite('Editor Contrib - Copy Lines Actions', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('issue #309282: copy line down preserves three multi-cursors on the same line', function () {
		withTestCodeEditor(['foo bar baz'], {}, (editor) => {
			editor.setSelections([
				new Selection(1, 5, 1, 5),
				new Selection(1, 9, 1, 9),
				new Selection(1, 12, 1, 12),
			]);
			const action = new CopyLinesDownAction();
			action.run(null!, editor);
			assert.deepStrictEqual(editor.getValue(), 'foo bar baz\nfoo bar baz');
			assert.deepStrictEqual(editor.getSelections()!.map(s => s.toString()), [
				new Selection(2, 5, 2, 5),
				new Selection(2, 9, 2, 9),
				new Selection(2, 12, 2, 12),
			].map(s => s.toString()));
		});
	});

	test('issue #309282: copy line up preserves three multi-cursors on the same line', function () {
		withTestCodeEditor(['foo bar baz'], {}, (editor) => {
			editor.setSelections([
				new Selection(1, 5, 1, 5),
				new Selection(1, 9, 1, 9),
				new Selection(1, 12, 1, 12),
			]);
			const action = new CopyLinesUpAction();
			action.run(null!, editor);
			assert.deepStrictEqual(editor.getValue(), 'foo bar baz\nfoo bar baz');
			assert.deepStrictEqual(editor.getSelections()!.map(s => s.toString()), [
				new Selection(1, 5, 1, 5),
				new Selection(1, 9, 1, 9),
				new Selection(1, 12, 1, 12),
			].map(s => s.toString()));
		});
	});

	test('issue #309282: copy line down preserves four multi-cursors on the same line', function () {
		withTestCodeEditor(['foo bar baz qux'], {}, (editor) => {
			editor.setSelections([
				new Selection(1, 5, 1, 5),
				new Selection(1, 9, 1, 9),
				new Selection(1, 13, 1, 13),
				new Selection(1, 16, 1, 16),
			]);
			const action = new CopyLinesDownAction();
			action.run(null!, editor);
			assert.deepStrictEqual(editor.getValue(), 'foo bar baz qux\nfoo bar baz qux');
			assert.deepStrictEqual(editor.getSelections()!.map(s => s.toString()), [
				new Selection(2, 5, 2, 5),
				new Selection(2, 9, 2, 9),
				new Selection(2, 13, 2, 13),
				new Selection(2, 16, 2, 16),
			].map(s => s.toString()));
		});
	});

	test('copy line down with two cursors on same line still works', function () {
		withTestCodeEditor(['foo bar baz'], {}, (editor) => {
			editor.setSelections([
				new Selection(1, 5, 1, 5),
				new Selection(1, 9, 1, 9),
			]);
			const action = new CopyLinesDownAction();
			action.run(null!, editor);
			assert.deepStrictEqual(editor.getValue(), 'foo bar baz\nfoo bar baz');
			assert.deepStrictEqual(editor.getSelections()!.map(s => s.toString()), [
				new Selection(2, 5, 2, 5),
				new Selection(2, 9, 2, 9),
			].map(s => s.toString()));
		});
	});
});

suite('Editor Contrib - Duplicate Selection', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const duplicateSelectionAction = new DuplicateSelectionAction();

	function testDuplicateSelectionAction(lines: string[], selections: Selection[], expectedLines: string[], expectedSelections: Selection[]): void {
		withTestCodeEditor(lines.join('\n'), {}, (editor) => {
			editor.setSelections(selections);
			duplicateSelectionAction.run(null!, editor, {});
			assert.deepStrictEqual(editor.getValue(), expectedLines.join('\n'));
			assert.deepStrictEqual(editor.getSelections()!.map(s => s.toString()), expectedSelections.map(s => s.toString()));
		});
	}

	test('empty selection', function () {
		testDuplicateSelectionAction(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			[new Selection(2, 2, 2, 2), new Selection(3, 2, 3, 2)],
			[
				'first',
				'second line',
				'second line',
				'third line',
				'third line',
				'fourth line',
				'fifth'
			],
			[new Selection(3, 2, 3, 2), new Selection(5, 2, 5, 2)]
		);
	});

	test('with selection', function () {
		testDuplicateSelectionAction(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			[new Selection(2, 1, 2, 4), new Selection(3, 1, 3, 4)],
			[
				'first',
				'secsecond line',
				'thithird line',
				'fourth line',
				'fifth'
			],
			[new Selection(2, 4, 2, 7), new Selection(3, 4, 3, 7)]
		);
	});
});
