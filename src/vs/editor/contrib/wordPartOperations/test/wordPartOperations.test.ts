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
			'thisIsACamelCaseVar  this_is_a_snake_case_var',
			'end line'
		], {}, (editor, _) => {
			editor.setPosition(new Position(3, 8));
			const expectedStops = [
				[3, 5],
				[3, 4],
				[3, 1],
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
			'thisIsACamelCaseVar  this_is_a_snake_case_var',
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
			'   /* Just some text a+= 3 +5-3 */  thisIsACamelCaseVar  this_is_a_snake_case_var'
		], {}, (editor, _) => {
			const model = editor.getModel();
			editor.setPosition(new Position(1, 84));

			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5-3 */  thisIsACamelCaseVar  this_is_a_snake_case', '001');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5-3 */  thisIsACamelCaseVar  this_is_a_snake', '002');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5-3 */  thisIsACamelCaseVar  this_is_a', '003');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5-3 */  thisIsACamelCaseVar  this_is', '004');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5-3 */  thisIsACamelCaseVar  this', '005');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5-3 */  thisIsACamelCaseVar  ', '006');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5-3 */  thisIsACamelCaseVar', '007');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5-3 */  thisIsACamelCase', '008');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5-3 */  thisIsACamel', '009');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5-3 */  thisIsA', '010');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5-3 */  thisIs', '011');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5-3 */  this', '012');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5-3 */  ', '013');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5-3 */', '014');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5-3 ', '015');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5-3', '015bis');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5-', '016');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5', '017');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +', '018');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 ', '019');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3', '019bis');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= ', '020');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+=', '021');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a', '022');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text ', '023');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text', '024');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some ', '025');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some', '026');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just ', '027');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just', '028');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /* ', '029');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   /*', '030');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '   ', '031');
			deleteWordPartLeft(editor); assert.equal(model.getLineContent(1), '', '032');
		});
	});

	test('delete word part right basic', () => {
		withTestCodeEditor([
			'   /* Just some text a+= 3 +5-3 */  thisIsACamelCaseVar  this_is_a_snake_case_var'
		], {}, (editor, _) => {
			const model = editor.getModel();
			editor.setPosition(new Position(1, 1));

			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), '/* Just some text a+= 3 +5-3 */  thisIsACamelCaseVar  this_is_a_snake_case_var', '001');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), ' Just some text a+= 3 +5-3 */  thisIsACamelCaseVar  this_is_a_snake_case_var', '002');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), 'Just some text a+= 3 +5-3 */  thisIsACamelCaseVar  this_is_a_snake_case_var', '003');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), ' some text a+= 3 +5-3 */  thisIsACamelCaseVar  this_is_a_snake_case_var', '004');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), 'some text a+= 3 +5-3 */  thisIsACamelCaseVar  this_is_a_snake_case_var', '005');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), ' text a+= 3 +5-3 */  thisIsACamelCaseVar  this_is_a_snake_case_var', '006');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), 'text a+= 3 +5-3 */  thisIsACamelCaseVar  this_is_a_snake_case_var', '007');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), ' a+= 3 +5-3 */  thisIsACamelCaseVar  this_is_a_snake_case_var', '008');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), 'a+= 3 +5-3 */  thisIsACamelCaseVar  this_is_a_snake_case_var', '009');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), '+= 3 +5-3 */  thisIsACamelCaseVar  this_is_a_snake_case_var', '010');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), ' 3 +5-3 */  thisIsACamelCaseVar  this_is_a_snake_case_var', '011');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), ' +5-3 */  thisIsACamelCaseVar  this_is_a_snake_case_var', '012');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), '5-3 */  thisIsACamelCaseVar  this_is_a_snake_case_var', '013');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), '-3 */  thisIsACamelCaseVar  this_is_a_snake_case_var', '014');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), '3 */  thisIsACamelCaseVar  this_is_a_snake_case_var', '015');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), ' */  thisIsACamelCaseVar  this_is_a_snake_case_var', '016');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), '  thisIsACamelCaseVar  this_is_a_snake_case_var', '017');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), 'thisIsACamelCaseVar  this_is_a_snake_case_var', '018');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), 'IsACamelCaseVar  this_is_a_snake_case_var', '019');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), 'ACamelCaseVar  this_is_a_snake_case_var', '020');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), 'CamelCaseVar  this_is_a_snake_case_var', '021');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), 'CaseVar  this_is_a_snake_case_var', '022');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), 'Var  this_is_a_snake_case_var', '023');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), '  this_is_a_snake_case_var', '024');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), 'this_is_a_snake_case_var', '025');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), 'is_a_snake_case_var', '026');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), 'a_snake_case_var', '027');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), 'snake_case_var', '028');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), 'case_var', '029');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), 'var', '030');
			deleteWordPartRight(editor); assert.equal(model.getLineContent(1), '', '031');
		});
	});
});
