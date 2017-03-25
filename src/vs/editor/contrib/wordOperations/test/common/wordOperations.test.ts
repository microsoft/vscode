/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { Position } from 'vs/editor/common/core/position';
import { Selection } from 'vs/editor/common/core/selection';
import { ICommonCodeEditor } from 'vs/editor/common/editorCommon';
import { withMockCodeEditor } from 'vs/editor/test/common/mocks/mockCodeEditor';
import {
	CursorWordLeft, CursorWordLeftSelect, CursorWordStartLeft,
	CursorWordEndLeft, CursorWordStartLeftSelect, CursorWordEndLeftSelect,
	CursorWordStartRight, CursorWordEndRight, CursorWordRight,
	CursorWordStartRightSelect, CursorWordEndRightSelect, CursorWordRightSelect
} from 'vs/editor/contrib/wordOperations/common/wordOperations';
import { EditorCommand } from 'vs/editor/common/config/config';

suite('WordOperations', () => {

	const _cursorWordStartLeft = new CursorWordStartLeft();
	const _cursorWordEndLeft = new CursorWordEndLeft();
	const _cursorWordLeft = new CursorWordLeft();
	const _cursorWordStartLeftSelect = new CursorWordStartLeftSelect();
	const _cursorWordEndLeftSelect = new CursorWordEndLeftSelect();
	const _cursorWordLeftSelect = new CursorWordLeftSelect();
	const _cursorWordStartRight = new CursorWordStartRight();
	const _cursorWordEndRight = new CursorWordEndRight();
	const _cursorWordRight = new CursorWordRight();
	const _cursorWordStartRightSelect = new CursorWordStartRightSelect();
	const _cursorWordEndRightSelect = new CursorWordEndRightSelect();
	const _cursorWordRightSelect = new CursorWordRightSelect();

	function runEditorCommand(editor: ICommonCodeEditor, command: EditorCommand): void {
		command.runEditorCommand(null, editor, null);
	}
	function moveWordLeft(editor: ICommonCodeEditor, inSelectionMode: boolean = false): void {
		runEditorCommand(editor, inSelectionMode ? _cursorWordLeftSelect : _cursorWordLeft);
	}
	function moveWordStartLeft(editor: ICommonCodeEditor, inSelectionMode: boolean = false): void {
		runEditorCommand(editor, inSelectionMode ? _cursorWordStartLeftSelect : _cursorWordStartLeft);
	}
	function moveWordEndLeft(editor: ICommonCodeEditor, inSelectionMode: boolean = false): void {
		runEditorCommand(editor, inSelectionMode ? _cursorWordEndLeftSelect : _cursorWordEndLeft);
	}
	function moveWordRight(editor: ICommonCodeEditor, inSelectionMode: boolean = false): void {
		runEditorCommand(editor, inSelectionMode ? _cursorWordRightSelect : _cursorWordRight);
	}
	function moveWordEndRight(editor: ICommonCodeEditor, inSelectionMode: boolean = false): void {
		runEditorCommand(editor, inSelectionMode ? _cursorWordEndRightSelect : _cursorWordEndRight);
	}
	function moveWordStartRight(editor: ICommonCodeEditor, inSelectionMode: boolean = false): void {
		runEditorCommand(editor, inSelectionMode ? _cursorWordStartRightSelect : _cursorWordStartRight);
	}

	test('move word left', () => {
		withMockCodeEditor([
			'    \tMy First Line\t ',
			'\tMy Second Line',
			'    Third Line🐶',
			'',
			'1',
		], {}, (editor, _) => {
			editor.setPosition(new Position(5, 2));
			const expectedStops = [
				[5, 1],
				[4, 1],
				[3, 11],
				[3, 5],
				[3, 1],
				[2, 12],
				[2, 5],
				[2, 2],
				[2, 1],
				[1, 15],
				[1, 9],
				[1, 6],
				[1, 1],
				[1, 1],
			];

			let actualStops: number[][] = [];
			for (let i = 0; i < expectedStops.length; i++) {
				moveWordLeft(editor);
				const pos = editor.getPosition();
				actualStops.push([pos.lineNumber, pos.column]);
			}

			assert.deepEqual(actualStops, expectedStops);
		});
	});

	test('move word left selection', () => {
		withMockCodeEditor([
			'    \tMy First Line\t ',
			'\tMy Second Line',
			'    Third Line🐶',
			'',
			'1',
		], {}, (editor, _) => {
			editor.setPosition(new Position(5, 2));
			moveWordLeft(editor, true);
			assert.deepEqual(editor.getSelection(), new Selection(5, 2, 5, 1));
		});
	});

	test('issue #832: moveWordLeft', () => {
		withMockCodeEditor([
			'   /* Just some   more   text a+= 3 +5-3 + 7 */  '
		], {}, (editor, _) => {
			editor.setPosition(new Position(1, 50));

			moveWordLeft(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3 + 7 '.length + 1, '001');
			moveWordLeft(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3 + '.length + 1, '002');
			moveWordLeft(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3 '.length + 1, '003');
			moveWordLeft(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3 +5-'.length + 1, '004');
			moveWordLeft(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3 +5'.length + 1, '005');
			moveWordLeft(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3 +'.length + 1, '006');
			moveWordLeft(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3 '.length + 1, '007');
			moveWordLeft(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= '.length + 1, '008');
			moveWordLeft(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a'.length + 1, '009');
			moveWordLeft(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text '.length + 1, '010');
			moveWordLeft(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   '.length + 1, '011');
			moveWordLeft(editor); assert.equal(editor.getPosition().column, '   /* Just some   '.length + 1, '012');
			moveWordLeft(editor); assert.equal(editor.getPosition().column, '   /* Just '.length + 1, '013');
			moveWordLeft(editor); assert.equal(editor.getPosition().column, '   /* '.length + 1, '014');
			moveWordLeft(editor); assert.equal(editor.getPosition().column, '   '.length + 1, '015');
		});
	});

	test('moveWordStartLeft', () => {
		withMockCodeEditor([
			'   /* Just some   more   text a+= 3 +5-3 + 7 */  '
		], {}, (editor, _) => {
			editor.setPosition(new Position(1, 50));

			moveWordStartLeft(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3 + 7 '.length + 1, '001');
			moveWordStartLeft(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3 + '.length + 1, '002');
			moveWordStartLeft(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3 '.length + 1, '003');
			moveWordStartLeft(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3 +5-'.length + 1, '004');
			moveWordStartLeft(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3 +5'.length + 1, '005');
			moveWordStartLeft(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3 +'.length + 1, '006');
			moveWordStartLeft(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3 '.length + 1, '007');
			moveWordStartLeft(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= '.length + 1, '008');
			moveWordStartLeft(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a'.length + 1, '009');
			moveWordStartLeft(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text '.length + 1, '010');
			moveWordStartLeft(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   '.length + 1, '011');
			moveWordStartLeft(editor); assert.equal(editor.getPosition().column, '   /* Just some   '.length + 1, '012');
			moveWordStartLeft(editor); assert.equal(editor.getPosition().column, '   /* Just '.length + 1, '013');
			moveWordStartLeft(editor); assert.equal(editor.getPosition().column, '   /* '.length + 1, '014');
			moveWordStartLeft(editor); assert.equal(editor.getPosition().column, '   '.length + 1, '015');
		});
	});

	test('moveWordEndLeft', () => {
		withMockCodeEditor([
			'   /* Just some   more   text a+= 3 +5-3 + 7 */  '
		], {}, (editor, _) => {
			editor.setPosition(new Position(1, 50));

			moveWordEndLeft(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3 + 7 */'.length + 1, '001');
			moveWordEndLeft(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3 + 7'.length + 1, '002');
			moveWordEndLeft(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3 +'.length + 1, '003');
			moveWordEndLeft(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3'.length + 1, '004');
			moveWordEndLeft(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3 +5-'.length + 1, '005');
			moveWordEndLeft(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3 +5'.length + 1, '006');
			moveWordEndLeft(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3 +'.length + 1, '007');
			moveWordEndLeft(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3'.length + 1, '008');
			moveWordEndLeft(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+='.length + 1, '009');
			moveWordEndLeft(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a'.length + 1, '010');
			moveWordEndLeft(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text'.length + 1, '011');
			moveWordEndLeft(editor); assert.equal(editor.getPosition().column, '   /* Just some   more'.length + 1, '012');
			moveWordEndLeft(editor); assert.equal(editor.getPosition().column, '   /* Just some'.length + 1, '013');
			moveWordEndLeft(editor); assert.equal(editor.getPosition().column, '   /* Just'.length + 1, '014');
			moveWordEndLeft(editor); assert.equal(editor.getPosition().column, '   /*'.length + 1, '015');
			moveWordEndLeft(editor); assert.equal(editor.getPosition().column, ''.length + 1, '016');
		});
	});

	test('move word right', () => {
		withMockCodeEditor([
			'    \tMy First Line\t ',
			'\tMy Second Line',
			'    Third Line🐶',
			'',
			'1',
		], {}, (editor, _) => {
			editor.setPosition(new Position(1, 1));
			let expectedStops = [
				[1, 8],
				[1, 14],
				[1, 19],
				[1, 21],
				[2, 4],
				[2, 11],
				[2, 16],
				[3, 10],
				[3, 17],
				[4, 1],
				[5, 2],
				[5, 2],
			];

			let actualStops: number[][] = [];
			for (let i = 0; i < expectedStops.length; i++) {
				moveWordRight(editor);
				let pos = editor.getPosition();
				actualStops.push([pos.lineNumber, pos.column]);
			}

			assert.deepEqual(actualStops, expectedStops);
		});
	});

	test('move word right selection', () => {
		withMockCodeEditor([
			'    \tMy First Line\t ',
			'\tMy Second Line',
			'    Third Line🐶',
			'',
			'1',
		], {}, (editor, _) => {
			editor.setPosition(new Position(1, 1));
			moveWordRight(editor, true);
			assert.deepEqual(editor.getSelection(), new Selection(1, 1, 1, 8));
		});
	});

	test('issue #832: moveWordRight', () => {
		withMockCodeEditor([
			'   /* Just some   more   text a+= 3 +5-3 + 7 */  '
		], {}, (editor, _) => {
			editor.setPosition(new Position(1, 1));

			moveWordRight(editor); assert.equal(editor.getPosition().column, '   /*'.length + 1, '001');
			moveWordRight(editor); assert.equal(editor.getPosition().column, '   /* Just'.length + 1, '003');
			moveWordRight(editor); assert.equal(editor.getPosition().column, '   /* Just some'.length + 1, '004');
			moveWordRight(editor); assert.equal(editor.getPosition().column, '   /* Just some   more'.length + 1, '005');
			moveWordRight(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text'.length + 1, '006');
			moveWordRight(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a'.length + 1, '007');
			moveWordRight(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+='.length + 1, '008');
			moveWordRight(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3'.length + 1, '009');
			moveWordRight(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3 +'.length + 1, '010');
			moveWordRight(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3 +5'.length + 1, '011');
			moveWordRight(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3 +5-'.length + 1, '012');
			moveWordRight(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3'.length + 1, '013');
			moveWordRight(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3 +'.length + 1, '014');
			moveWordRight(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3 + 7'.length + 1, '015');
			moveWordRight(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3 + 7 */'.length + 1, '016');
			moveWordRight(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3 + 7 */  '.length + 1, '016');

		});
	});

	test('moveWordEndRight', () => {
		withMockCodeEditor([
			'   /* Just some   more   text a+= 3 +5-3 + 7 */  '
		], {}, (editor, _) => {
			editor.setPosition(new Position(1, 1));

			moveWordEndRight(editor); assert.equal(editor.getPosition().column, '   /*'.length + 1, '001');
			moveWordEndRight(editor); assert.equal(editor.getPosition().column, '   /* Just'.length + 1, '003');
			moveWordEndRight(editor); assert.equal(editor.getPosition().column, '   /* Just some'.length + 1, '004');
			moveWordEndRight(editor); assert.equal(editor.getPosition().column, '   /* Just some   more'.length + 1, '005');
			moveWordEndRight(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text'.length + 1, '006');
			moveWordEndRight(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a'.length + 1, '007');
			moveWordEndRight(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+='.length + 1, '008');
			moveWordEndRight(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3'.length + 1, '009');
			moveWordEndRight(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3 +'.length + 1, '010');
			moveWordEndRight(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3 +5'.length + 1, '011');
			moveWordEndRight(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3 +5-'.length + 1, '012');
			moveWordEndRight(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3'.length + 1, '013');
			moveWordEndRight(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3 +'.length + 1, '014');
			moveWordEndRight(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3 + 7'.length + 1, '015');
			moveWordEndRight(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3 + 7 */'.length + 1, '016');
			moveWordEndRight(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3 + 7 */  '.length + 1, '016');

		});
	});

	test('moveWordStartRight', () => {
		withMockCodeEditor([
			'   /* Just some   more   text a+= 3 +5-3 + 7 */  '
		], {}, (editor, _) => {
			editor.setPosition(new Position(1, 1));

			moveWordStartRight(editor); assert.equal(editor.getPosition().column, '   '.length + 1, '001');
			moveWordStartRight(editor); assert.equal(editor.getPosition().column, '   /* '.length + 1, '002');
			moveWordStartRight(editor); assert.equal(editor.getPosition().column, '   /* Just '.length + 1, '003');
			moveWordStartRight(editor); assert.equal(editor.getPosition().column, '   /* Just some   '.length + 1, '004');
			moveWordStartRight(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   '.length + 1, '005');
			moveWordStartRight(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text '.length + 1, '006');
			moveWordStartRight(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a'.length + 1, '007');
			moveWordStartRight(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= '.length + 1, '008');
			moveWordStartRight(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3 '.length + 1, '009');
			moveWordStartRight(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3 +'.length + 1, '010');
			moveWordStartRight(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3 +5'.length + 1, '011');
			moveWordStartRight(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3 +5-'.length + 1, '012');
			moveWordStartRight(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3 '.length + 1, '013');
			moveWordStartRight(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3 + '.length + 1, '014');
			moveWordStartRight(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3 + 7 '.length + 1, '015');
			moveWordStartRight(editor); assert.equal(editor.getPosition().column, '   /* Just some   more   text a+= 3 +5-3 + 7 */  '.length + 1, '016');
		});
	});
});
