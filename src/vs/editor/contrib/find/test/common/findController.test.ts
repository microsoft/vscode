/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {EditOperation} from 'vs/editor/common/core/editOperation';
import {Position} from 'vs/editor/common/core/position';
import {Selection} from 'vs/editor/common/core/selection';
import {Range} from 'vs/editor/common/core/range';
import {IRange} from 'vs/editor/common/editorCommon';
import {CommonFindController, FindStartFocusAction, IFindStartOptions, NextMatchFindAction, StartFindAction} from 'vs/editor/contrib/find/common/findController';
import {withMockCodeEditor} from 'vs/editor/test/common/mocks/mockCodeEditor';

class TestFindController extends CommonFindController {

	public hasFocus: boolean;

	protected _start(opts:IFindStartOptions): void {
		super._start(opts);

		if (opts.shouldFocus !== FindStartFocusAction.NoFocusChange) {
			this.hasFocus = true;
		}
	}
}

suite('FindController', () => {

	function fromRange(rng:IRange): number[] {
		return [rng.startLineNumber, rng.startColumn, rng.endLineNumber, rng.endColumn];
	}

	test('issue #1857: F3, Find Next, acts like "Find Under Cursor"', () => {
		withMockCodeEditor([
			'ABC',
			'ABC',
			'XYZ',
			'ABC'
		], {}, (editor, cursor) => {

			// The cursor is at the very top, of the file, at the first ABC
			let findController = editor.registerAndInstantiateContribution<TestFindController>(TestFindController);
			let findState = findController.getState();
			let startFindAction = new StartFindAction({id:'',label:''}, editor);
			let nextMatchFindAction = new NextMatchFindAction({id:'',label:''}, editor);

			// I hit Ctrl+F to show the Find dialog
			startFindAction.run();

			// I type ABC.
			findState.change({ searchString: 'A' }, true);
			findState.change({ searchString: 'AB' }, true);
			findState.change({ searchString: 'ABC' }, true);

			// The first ABC is highlighted.
			assert.deepEqual(fromRange(editor.getSelection()), [1, 1, 1, 4]);

			// I hit Esc to exit the Find dialog.
			findController.closeFindWidget();
			findController.hasFocus = false;

			// The cursor is now at end of the first line, with ABC on that line highlighted.
			assert.deepEqual(fromRange(editor.getSelection()), [1, 1, 1, 4]);

			// I hit delete to remove it and change the text to XYZ.
			editor.pushUndoStop();
			editor.executeEdits('test', [EditOperation.delete(new Range(1, 1, 1, 4))]);
			editor.executeEdits('test', [EditOperation.insert(new Position(1, 1), 'XYZ')]);
			editor.pushUndoStop();

			// At this point the text editor looks like this:
			//   XYZ
			//   ABC
			//   XYZ
			//   ABC
			assert.equal(editor.getModel().getLineContent(1), 'XYZ');

			// The cursor is at end of the first line.
			assert.deepEqual(fromRange(editor.getSelection()), [1, 4, 1, 4]);

			// I hit F3 to "Find Next" to find the next occurrence of ABC, but instead it searches for XYZ.
			nextMatchFindAction.run();

			assert.equal(findState.searchString, 'ABC');
			assert.equal(findController.hasFocus, false);

			findController.dispose();
			startFindAction.dispose();
			nextMatchFindAction.dispose();
		});
	});

	test('issue #3090: F3 does not loop with two matches on a single line', () => {
		withMockCodeEditor([
			'import nls = require(\'vs/nls\');'
		], {}, (editor, cursor) => {

			let findController = editor.registerAndInstantiateContribution<TestFindController>(TestFindController);
			let nextMatchFindAction = new NextMatchFindAction({id:'',label:''}, editor);

			editor.setPosition({
				lineNumber: 1,
				column: 9
			});

			nextMatchFindAction.run();
			assert.deepEqual(fromRange(editor.getSelection()), [1, 26, 1, 29]);

			nextMatchFindAction.run();
			assert.deepEqual(fromRange(editor.getSelection()), [1, 8, 1, 11]);

			findController.dispose();
			nextMatchFindAction.dispose();
		});
	});

	test('issue #6149: Auto-escape highlighted text for search and replace regex mode', () => {
		withMockCodeEditor([
			'var x = (3 * 5)',
			'var y = (3 * 5)',
			'var z = (3  * 5)',
		], {}, (editor, cursor) => {

			let findController = editor.registerAndInstantiateContribution<TestFindController>(TestFindController);
			let startFindAction = new StartFindAction({id:'',label:''}, editor);
			let nextMatchFindAction = new NextMatchFindAction({id:'',label:''}, editor);

			editor.setSelection(new Selection(1, 9, 1, 13));

			findController.toggleRegex();
			startFindAction.run();

			nextMatchFindAction.run();
			assert.deepEqual(fromRange(editor.getSelection()), [2, 9, 2, 13]);

			nextMatchFindAction.run();
			assert.deepEqual(fromRange(editor.getSelection()), [1, 9, 1, 13]);

			findController.dispose();
			startFindAction.dispose();
			nextMatchFindAction.dispose();
		});
	});
});
