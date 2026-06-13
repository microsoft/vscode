/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CoreNavigationCommands } from '../../../browser/coreCommands.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { Position } from '../../../common/core/position.js';
import { Selection } from '../../../common/core/selection.js';
import { CursorMove } from '../../../common/cursor/cursorMoveCommands.js';
import { ViewModel } from '../../../common/viewModel/viewModelImpl.js';
import { ITestCodeEditor, withTestCodeEditor } from '../testCodeEditor.js';

suite('Editor Virtual Space', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const TEXT = [
		'line1',
		'line2',
		'line3',
	].join('\n');

	function executeTest(options: any, callback: (editor: ITestCodeEditor, viewModel: ViewModel) => void): void {
		withTestCodeEditor(TEXT, options, (editor, viewModel) => {
			callback(editor, viewModel);
		});
	}

	test('moving right past EOL should enter virtual space', () => {
		executeTest({ virtualSpace: true }, (editor, viewModel) => {
			moveTo(viewModel, 1, 6); // end of 'line1'
			moveRight(viewModel);
			cursorEqual(viewModel, 1, 6, 1);
			moveRight(viewModel, 2);
			cursorEqual(viewModel, 1, 6, 3);
		});
	});

	test('moving left in virtual space should decrease offset', () => {
		executeTest({ virtualSpace: true }, (editor, viewModel) => {
			moveTo(viewModel, 1, 6);
			moveRight(viewModel, 5);
			cursorEqual(viewModel, 1, 6, 5);

			moveLeft(viewModel);
			cursorEqual(viewModel, 1, 6, 4);
		});
	});

	test('moving left past virtual space should enter real content', () => {
		executeTest({ virtualSpace: true }, (editor, viewModel) => {
			moveTo(viewModel, 1, 6);
			moveRight(viewModel, 2);
			cursorEqual(viewModel, 1, 6, 2);

			moveLeft(viewModel, 3);
			cursorEqual(viewModel, 1, 5, 0);
		});
	});

	test('half-line move left from virtual space should enter real content', () => {
		executeTest({ virtualSpace: true }, (editor, viewModel) => {
			moveTo(viewModel, 1, 6);
			moveRight(viewModel, 2);
			cursorEqual(viewModel, 1, 6, 2);

			// half-line move left should land at column 1
			moveLeft(viewModel, 1, CursorMove.RawUnit.HalfLine);
			cursorEqual(viewModel, 1, 1, 0);
		});
	});

	test('typing in virtual space should prepend spaces', () => {
		executeTest({ virtualSpace: true }, (editor, viewModel) => {
			moveTo(viewModel, 1, 6);
			moveRight(viewModel, 3);
			cursorEqual(viewModel, 1, 6, 3);

			editor.type('x');
			assert.strictEqual(viewModel.model.getLineContent(1), 'line1   x');
			cursorEqual(viewModel, 1, 10, 0);
		});
	});

	test('pasting in virtual space should prepend spaces', () => {
		executeTest({ virtualSpace: true }, (editor, viewModel) => {
			moveTo(viewModel, 1, 6);
			moveRight(viewModel, 2);
			cursorEqual(viewModel, 1, 6, 2);

			editor.trigger('test', 'paste', { text: 'abc' });
			assert.strictEqual(viewModel.model.getLineContent(1), 'line1  abc');
			cursorEqual(viewModel, 1, 11, 0);
		});
	});

	test('virtual space behavior should be disabled when setting is off', () => {
		executeTest({ virtualSpace: false }, (editor, viewModel) => {
			moveTo(viewModel, 1, 6);
			moveRight(viewModel);
			// Should move to next line instead of virtual space
			cursorEqual(viewModel, 2, 1, 0);
		});
	});

	test('pasting in virtual space with multiple cursors', () => {
		executeTest({ virtualSpace: true }, (editor, viewModel) => {
			editor.setSelections([
				new Selection(1, 6, 1, 6),
				new Selection(2, 6, 2, 6)
			]);
			// move both cursors 2 columns into virtual space
			moveRight(viewModel, 2);

			editor.trigger('test', 'paste', { text: 'x' });
			assert.strictEqual(viewModel.model.getLineContent(1), 'line1  x');
			assert.strictEqual(viewModel.model.getLineContent(2), 'line2  x');
		});
	});

	test('typing should NOT prepend spaces if NOT at EOL (even if leftover > 0)', () => {
		executeTest({ virtualSpace: true }, (editor, viewModel) => {
			// This is a bit tricky to set up without virtual space normally,
			// but we can simulate a leftover by moving down from a longer line to a shorter one.
			const LONG_TEXT = [
				'long line with many characters',
				'short'
			].join('\n');

			withTestCodeEditor(LONG_TEXT, { virtualSpace: true }, (editor, viewModel) => {
				moveTo(viewModel, 1, 20);
				moveDown(viewModel);
				// Now on line 2, at column 6 (end of 'short'), with leftover.
				// Wait, if it's at column 6, it IS at EOL.
				// Let's move it to column 3.
				moveTo(viewModel, 2, 3);
				// The leftover should still be there from the vertical move.
				const state = viewModel.getPrimaryCursorState();
				assert.ok(state.modelState.leftoverVisibleColumns > 0);

				editor.type('z');
				// Should NOT have prepended spaces because we are at column 3, not EOL.
				assert.strictEqual(viewModel.model.getLineContent(2), 'shzort');
			});
		});
	});

	// Helpers (adapted from cursorMoveCommand.test.ts)

	function move(viewModel: ViewModel, args: any) {
		CoreNavigationCommands.CursorMove.runCoreEditorCommand(viewModel, args);
	}

	function moveLeft(viewModel: ViewModel, value?: number, by?: string, select?: boolean) {
		move(viewModel, { to: CursorMove.RawDirection.Left, by: by, value: value, select: select });
	}

	function moveRight(viewModel: ViewModel, value?: number, by?: string, select?: boolean) {
		move(viewModel, { to: CursorMove.RawDirection.Right, by: by, value: value, select: select });
	}

	function moveDown(viewModel: ViewModel, noOfLines: number = 1, select?: boolean) {
		move(viewModel, { to: CursorMove.RawDirection.Down, by: CursorMove.RawUnit.WrappedLine, value: noOfLines, select: select });
	}

	function cursorEqual(viewModel: ViewModel, posLineNumber: number, posColumn: number, leftover: number) {
		const state = viewModel.getPrimaryCursorState();
		assert.strictEqual(state.modelState.position.lineNumber, posLineNumber, 'lineNumber');
		assert.strictEqual(state.modelState.position.column, posColumn, 'column');
		assert.strictEqual(state.modelState.leftoverVisibleColumns, leftover, 'leftoverVisibleColumns');
	}

	function moveTo(viewModel: ViewModel, lineNumber: number, column: number) {
		CoreNavigationCommands.MoveTo.runCoreEditorCommand(viewModel, {
			position: new Position(lineNumber, column)
		});
	}
});
