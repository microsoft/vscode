/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { Position } from 'vs/editor/common/core/position';
import { withTestCodeEditor } from 'vs/editor/test/browser/testCodeEditor';
import {
	DeleteWordPartLeft, DeleteWordPartRight,
	CursorWordPartLeft, CursorWordPartRight
} from 'vs/editor/contrib/wordPartOperations/wordPartOperations';
import { EditorCommand } from 'vs/editor/browser/editorExtensions';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';

suite('WordPartOperations', () => {
	const _deleteWordPartLeft = new DeleteWordPartLeft();
	const _deleteWordPartRight = new DeleteWordPartRight();
	const _cursorWordPartLeft = new CursorWordPartLeft();
	const _cursorWordPartRight = new CursorWordPartRight();

	function runEditorCommand(editor: ICodeEditor, command: EditorCommand): void {
		command.runEditorCommand(null, editor, null);
	}
	function moveWordPartLeft(editor: ICodeEditor, inSelectionmode: boolean = false): void {
		runEditorCommand(editor, inSelectionmode ? _cursorWordPartLeft : _cursorWordPartLeft);
	}
	function moveWordPartRight(editor: ICodeEditor, inSelectionmode: boolean = false): void {
		runEditorCommand(editor, inSelectionmode ? _cursorWordPartLeft : _cursorWordPartRight);
	}
	function deleteWordPartLeft(editor: ICodeEditor): void {
		runEditorCommand(editor, _deleteWordPartLeft);
	}
	function deleteWordPartRight(editor: ICodeEditor): void {
		runEditorCommand(editor, _deleteWordPartRight);
	}

	test('move word part left basic', () => {
		withTestCodeEditor([
			'start line',
			'thisIsACamelCaseVar  this_is_a_snake_case_var THIS_IS_CAPS_SNAKE this_ISMixedUse',
			'end line'
		], {}, (editor, _) => {
			editor.setPosition(new Position(3, 8));
			const expectedStops = [
				[3, 5],
				[3, 4],
				[3, 1],
				[2, 81],
				[2, 78],
				[2, 73],
				[2, 70],
				[2, 66],
				[2, 65],
				[2, 59],
				[2, 54],
				[2, 51],
				[2, 47],
				[2, 46],
				[2, 42],
				[2, 37],
				[2, 31],
				[2, 29],
				[2, 26],
				[2, 22],
				[2, 21],
				[2, 20],
				[2, 17],
				[2, 13],
				[2, 8],
				[2, 7],
				[2, 5],
				[2, 1],
				[1, 11],
				[1, 7],
				[1, 6],
				[1, 1]
			];

			let actualStops: number[][] = [];
			for (let i = 0; i < expectedStops.length; i++) {
				moveWordPartLeft(editor);
				const pos = editor.getPosition();
				actualStops.push([pos.lineNumber, pos.column]);
			}

			assert.deepEqual(actualStops, expectedStops);
		});
	});

	test('move word part right basic', () => {
		withTestCodeEditor([
			'start line',
			'thisIsACamelCaseVar  this_is_a_snake_case_var THIS_IS_CAPS_SNAKE this_ISMixedUse',
			'end line'
		], {}, (editor, _) => {
			editor.setPosition(new Position(1, 1));
			const expectedStops = [
				[1, 6],
				[1, 7],
				[1, 11],
				[2, 1],
				[2, 5],
				[2, 7],
				[2, 8],
				[2, 13],
				[2, 17],
				[2, 20],
				[2, 21],
				[2, 22],
				[2, 27],
				[2, 30],
				[2, 32],
				[2, 38],
				[2, 43],
				[2, 46],
				[2, 47],
				[2, 52],
				[2, 55],
				[2, 60],
				[2, 65],
				[2, 66],
				[2, 71],
				[2, 73],
				[2, 78],
				[2, 81],
				[3, 1],
				[3, 4],
				[3, 5],
				[3, 9]
			];

			let actualStops: number[][] = [];
			for (let i = 0; i < expectedStops.length; i++) {
				moveWordPartRight(editor);
				const pos = editor.getPosition();
				actualStops.push([pos.lineNumber, pos.column]);
			}
			assert.deepEqual(actualStops, expectedStops);
		});
	});

	test('delete word part left basic', () => {
		withTestCodeEditor([
			'   /* Just some text a+= 3 +5-3 */  thisIsACamelCaseVar  this_is_a_snake_case_var THIS_IS_CAPS_SNAKE this_ISMixedUse'
		], {}, (editor, _) => {
			const model = editor.getModel();
			editor.setPosition(new Position(1, 1000));

			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5-3 */  thisIsACamelCaseVar  this_is_a_snake_case_var THIS_IS_CAPS_SNAKE this_ISMixed', '001');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5-3 */  thisIsACamelCaseVar  this_is_a_snake_case_var THIS_IS_CAPS_SNAKE this_IS', '002');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5-3 */  thisIsACamelCaseVar  this_is_a_snake_case_var THIS_IS_CAPS_SNAKE this', '003');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5-3 */  thisIsACamelCaseVar  this_is_a_snake_case_var THIS_IS_CAPS_SNAKE ', '004');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5-3 */  thisIsACamelCaseVar  this_is_a_snake_case_var THIS_IS_CAPS_SNAKE', '005');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5-3 */  thisIsACamelCaseVar  this_is_a_snake_case_var THIS_IS_CAPS', '006');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5-3 */  thisIsACamelCaseVar  this_is_a_snake_case_var THIS_IS', '007');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5-3 */  thisIsACamelCaseVar  this_is_a_snake_case_var THIS', '008');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5-3 */  thisIsACamelCaseVar  this_is_a_snake_case_var ', '009');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5-3 */  thisIsACamelCaseVar  this_is_a_snake_case_var', '010');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5-3 */  thisIsACamelCaseVar  this_is_a_snake_case', '011');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5-3 */  thisIsACamelCaseVar  this_is_a_snake', '012');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5-3 */  thisIsACamelCaseVar  this_is_a', '013');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5-3 */  thisIsACamelCaseVar  this_is', '014');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5-3 */  thisIsACamelCaseVar  this', '015');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5-3 */  thisIsACamelCaseVar  ', '016');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5-3 */  thisIsACamelCaseVar', '017');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5-3 */  thisIsACamelCase', '018');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5-3 */  thisIsACamel', '019');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5-3 */  thisIsA', '020');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5-3 */  thisIs', '021');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5-3 */  this', '022');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5-3 */  ', '023');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5-3 */', '024');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5-3 ', '025');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5-3', '025bis');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5-', '026');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5', '027');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +', '028');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 ', '029');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3', '029bis');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= ', '030');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+=', '031');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a', '032');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text ', '033');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text', '034');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some ', '035');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some', '036');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just ', '037');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just', '038');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* ', '039');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /*', '040');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   ', '041');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '', '042');
		});
	});

	test('delete word part right basic', () => {
		withTestCodeEditor([
			'   /* Just some text a+= 3 +5-3 */  thisIsACamelCaseVar  this_is_a_snake_case_var THIS_IS_CAPS_SNAKE this_ISMixedUse'
		], {}, (editor, _) => {
			const model = editor.getModel();
			editor.setPosition(new Position(1, 1));

			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), '/* Just some text a+= 3 +5-3 */  thisIsACamelCaseVar  this_is_a_snake_case_var THIS_IS_CAPS_SNAKE this_ISMixedUse', '001');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), ' Just some text a+= 3 +5-3 */  thisIsACamelCaseVar  this_is_a_snake_case_var THIS_IS_CAPS_SNAKE this_ISMixedUse', '002');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), 'Just some text a+= 3 +5-3 */  thisIsACamelCaseVar  this_is_a_snake_case_var THIS_IS_CAPS_SNAKE this_ISMixedUse', '003');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), ' some text a+= 3 +5-3 */  thisIsACamelCaseVar  this_is_a_snake_case_var THIS_IS_CAPS_SNAKE this_ISMixedUse', '004');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), 'some text a+= 3 +5-3 */  thisIsACamelCaseVar  this_is_a_snake_case_var THIS_IS_CAPS_SNAKE this_ISMixedUse', '005');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), ' text a+= 3 +5-3 */  thisIsACamelCaseVar  this_is_a_snake_case_var THIS_IS_CAPS_SNAKE this_ISMixedUse', '006');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), 'text a+= 3 +5-3 */  thisIsACamelCaseVar  this_is_a_snake_case_var THIS_IS_CAPS_SNAKE this_ISMixedUse', '007');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), ' a+= 3 +5-3 */  thisIsACamelCaseVar  this_is_a_snake_case_var THIS_IS_CAPS_SNAKE this_ISMixedUse', '008');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), 'a+= 3 +5-3 */  thisIsACamelCaseVar  this_is_a_snake_case_var THIS_IS_CAPS_SNAKE this_ISMixedUse', '009');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), '+= 3 +5-3 */  thisIsACamelCaseVar  this_is_a_snake_case_var THIS_IS_CAPS_SNAKE this_ISMixedUse', '010');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), ' 3 +5-3 */  thisIsACamelCaseVar  this_is_a_snake_case_var THIS_IS_CAPS_SNAKE this_ISMixedUse', '011');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), ' +5-3 */  thisIsACamelCaseVar  this_is_a_snake_case_var THIS_IS_CAPS_SNAKE this_ISMixedUse', '012');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), '5-3 */  thisIsACamelCaseVar  this_is_a_snake_case_var THIS_IS_CAPS_SNAKE this_ISMixedUse', '013');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), '-3 */  thisIsACamelCaseVar  this_is_a_snake_case_var THIS_IS_CAPS_SNAKE this_ISMixedUse', '014');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), '3 */  thisIsACamelCaseVar  this_is_a_snake_case_var THIS_IS_CAPS_SNAKE this_ISMixedUse', '015');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), ' */  thisIsACamelCaseVar  this_is_a_snake_case_var THIS_IS_CAPS_SNAKE this_ISMixedUse', '016');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), '  thisIsACamelCaseVar  this_is_a_snake_case_var THIS_IS_CAPS_SNAKE this_ISMixedUse', '017');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), 'thisIsACamelCaseVar  this_is_a_snake_case_var THIS_IS_CAPS_SNAKE this_ISMixedUse', '018');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), 'IsACamelCaseVar  this_is_a_snake_case_var THIS_IS_CAPS_SNAKE this_ISMixedUse', '019');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), 'ACamelCaseVar  this_is_a_snake_case_var THIS_IS_CAPS_SNAKE this_ISMixedUse', '020');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), 'CamelCaseVar  this_is_a_snake_case_var THIS_IS_CAPS_SNAKE this_ISMixedUse', '021');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), 'CaseVar  this_is_a_snake_case_var THIS_IS_CAPS_SNAKE this_ISMixedUse', '022');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), 'Var  this_is_a_snake_case_var THIS_IS_CAPS_SNAKE this_ISMixedUse', '023');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), '  this_is_a_snake_case_var THIS_IS_CAPS_SNAKE this_ISMixedUse', '024');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), 'this_is_a_snake_case_var THIS_IS_CAPS_SNAKE this_ISMixedUse', '025');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), 'is_a_snake_case_var THIS_IS_CAPS_SNAKE this_ISMixedUse', '026');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), 'a_snake_case_var THIS_IS_CAPS_SNAKE this_ISMixedUse', '027');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), 'snake_case_var THIS_IS_CAPS_SNAKE this_ISMixedUse', '028');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), 'case_var THIS_IS_CAPS_SNAKE this_ISMixedUse', '029');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), 'var THIS_IS_CAPS_SNAKE this_ISMixedUse', '030');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), ' THIS_IS_CAPS_SNAKE this_ISMixedUse', '031');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), 'THIS_IS_CAPS_SNAKE this_ISMixedUse', '032');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), 'IS_CAPS_SNAKE this_ISMixedUse', '033');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), 'CAPS_SNAKE this_ISMixedUse', '034');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), 'SNAKE this_ISMixedUse', '035');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), ' this_ISMixedUse', '036');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), 'this_ISMixedUse', '037');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), 'ISMixedUse', '038');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), 'MixedUse', '039');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), 'Use', '040');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), '', '041');
		});
	});
});
