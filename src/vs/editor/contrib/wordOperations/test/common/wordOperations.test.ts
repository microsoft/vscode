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
	CursorWordStartRightSelect, CursorWordEndRightSelect, CursorWordRightSelect,
	DeleteWordLeft, DeleteWordStartLeft, DeleteWordEndLeft,
	DeleteWordRight, DeleteWordStartRight, DeleteWordEndRight
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
	const _deleteWordLeft = new DeleteWordLeft();
	const _deleteWordStartLeft = new DeleteWordStartLeft();
	const _deleteWordEndLeft = new DeleteWordEndLeft();
	const _deleteWordRight = new DeleteWordRight();
	const _deleteWordStartRight = new DeleteWordStartRight();
	const _deleteWordEndRight = new DeleteWordEndRight();

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
	function deleteWordLeft(editor: ICommonCodeEditor): void {
		runEditorCommand(editor, _deleteWordLeft);
	}
	function deleteWordStartLeft(editor: ICommonCodeEditor): void {
		runEditorCommand(editor, _deleteWordStartLeft);
	}
	function deleteWordEndLeft(editor: ICommonCodeEditor): void {
		runEditorCommand(editor, _deleteWordEndLeft);
	}
	function deleteWordRight(editor: ICommonCodeEditor): void {
		runEditorCommand(editor, _deleteWordRight);
	}
	function deleteWordStartRight(editor: ICommonCodeEditor): void {
		runEditorCommand(editor, _deleteWordStartRight);
	}
	function deleteWordEndRight(editor: ICommonCodeEditor): void {
		runEditorCommand(editor, _deleteWordEndRight);
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

	test('delete word left for non-empty selection', () => {
		withMockCodeEditor([
			'    \tMy First Line\t ',
			'\tMy Second Line',
			'    Third Line🐶',
			'',
			'1',
		], {}, (editor, _) => {
			const model = editor.getModel();
			editor.setSelection(new Selection(3, 7, 3, 9));
			deleteWordLeft(editor);
			assert.equal(model.getLineContent(3), '    Thd Line🐶');
			assert.deepEqual(editor.getPosition(), new Position(3, 7));
		});
	});

	test('delete word left for caret at beginning of document', () => {
		withMockCodeEditor([
			'    \tMy First Line\t ',
			'\tMy Second Line',
			'    Third Line🐶',
			'',
			'1',
		], {}, (editor, _) => {
			const model = editor.getModel();
			editor.setPosition(new Position(1, 1));
			deleteWordLeft(editor);
			assert.equal(model.getLineContent(1), '    \tMy First Line\t ');
			assert.deepEqual(editor.getPosition(), new Position(1, 1));
		});
	});

	test('delete word left for caret at end of whitespace', () => {
		withMockCodeEditor([
			'    \tMy First Line\t ',
			'\tMy Second Line',
			'    Third Line🐶',
			'',
			'1',
		], {}, (editor, _) => {
			const model = editor.getModel();
			editor.setPosition(new Position(3, 11));
			deleteWordLeft(editor);
			assert.equal(model.getLineContent(3), '    Line🐶');
			assert.deepEqual(editor.getPosition(), new Position(3, 5));
		});
	});

	test('delete word left for caret just behind a word', () => {
		withMockCodeEditor([
			'    \tMy First Line\t ',
			'\tMy Second Line',
			'    Third Line🐶',
			'',
			'1',
		], {}, (editor, _) => {
			const model = editor.getModel();
			editor.setPosition(new Position(2, 11));
			deleteWordLeft(editor);
			assert.equal(model.getLineContent(2), '\tMy  Line');
			assert.deepEqual(editor.getPosition(), new Position(2, 5));
		});
	});

	test('delete word left for caret inside of a word', () => {
		withMockCodeEditor([
			'    \tMy First Line\t ',
			'\tMy Second Line',
			'    Third Line🐶',
			'',
			'1',
		], {}, (editor, _) => {
			const model = editor.getModel();
			editor.setPosition(new Position(1, 12));
			deleteWordLeft(editor);
			assert.equal(model.getLineContent(1), '    \tMy st Line\t ');
			assert.deepEqual(editor.getPosition(), new Position(1, 9));
		});
	});

	test('delete word right for non-empty selection', () => {
		withMockCodeEditor([
			'    \tMy First Line\t ',
			'\tMy Second Line',
			'    Third Line🐶',
			'',
			'1',
		], {}, (editor, _) => {
			const model = editor.getModel();
			editor.setSelection(new Selection(3, 7, 3, 9));
			deleteWordRight(editor);
			assert.equal(model.getLineContent(3), '    Thd Line🐶');
			assert.deepEqual(editor.getPosition(), new Position(3, 7));
		});
	});

	test('delete word right for caret at end of document', () => {
		withMockCodeEditor([
			'    \tMy First Line\t ',
			'\tMy Second Line',
			'    Third Line🐶',
			'',
			'1',
		], {}, (editor, _) => {
			const model = editor.getModel();
			editor.setPosition(new Position(5, 3));
			deleteWordRight(editor);
			assert.equal(model.getLineContent(5), '1');
			assert.deepEqual(editor.getPosition(), new Position(5, 2));
		});
	});

	test('delete word right for caret at beggining of whitespace', () => {
		withMockCodeEditor([
			'    \tMy First Line\t ',
			'\tMy Second Line',
			'    Third Line🐶',
			'',
			'1',
		], {}, (editor, _) => {
			const model = editor.getModel();
			editor.setPosition(new Position(3, 1));
			deleteWordRight(editor);
			assert.equal(model.getLineContent(3), 'Third Line🐶');
			assert.deepEqual(editor.getPosition(), new Position(3, 1));
		});
	});

	test('delete word right for caret just before a word', () => {
		withMockCodeEditor([
			'    \tMy First Line\t ',
			'\tMy Second Line',
			'    Third Line🐶',
			'',
			'1',
		], {}, (editor, _) => {
			const model = editor.getModel();
			editor.setPosition(new Position(2, 5));
			deleteWordRight(editor);
			assert.equal(model.getLineContent(2), '\tMy  Line');
			assert.deepEqual(editor.getPosition(), new Position(2, 5));
		});
	});

	test('delete word right for caret inside of a word', () => {
		withMockCodeEditor([
			'    \tMy First Line\t ',
			'\tMy Second Line',
			'    Third Line🐶',
			'',
			'1',
		], {}, (editor, _) => {
			const model = editor.getModel();
			editor.setPosition(new Position(1, 11));
			deleteWordRight(editor);
			assert.equal(model.getLineContent(1), '    \tMy Fi Line\t ');
			assert.deepEqual(editor.getPosition(), new Position(1, 11));
		});
	});

	test('issue #832: deleteWordLeft', () => {
		withMockCodeEditor([
			'   /* Just some text a+= 3 +5 */  '
		], {}, (editor, _) => {
			const model = editor.getModel();
			editor.setPosition(new Position(1, 37));
			deleteWordLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5 */', '001');
			deleteWordLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5 ', '002');
			deleteWordLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +', '003');
			deleteWordLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 ', '004');
			deleteWordLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= ', '005');
			deleteWordLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a', '006');
			deleteWordLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text ', '007');
			deleteWordLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some ', '008');
			deleteWordLeft(editor); assert.equal(model.getLineContent(1), '   /* Just ', '009');
			deleteWordLeft(editor); assert.equal(model.getLineContent(1), '   /* ', '010');
			deleteWordLeft(editor); assert.equal(model.getLineContent(1), '   ', '011');
			deleteWordLeft(editor); assert.equal(model.getLineContent(1), '', '012');
		});
	});

	test('deleteWordStartLeft', () => {
		withMockCodeEditor([
			'   /* Just some text a+= 3 +5 */  '
		], {}, (editor, _) => {
			const model = editor.getModel();
			editor.setPosition(new Position(1, 37));

			deleteWordStartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5 ', '001');
			deleteWordStartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +', '002');
			deleteWordStartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 ', '003');
			deleteWordStartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= ', '004');
			deleteWordStartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a', '005');
			deleteWordStartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text ', '006');
			deleteWordStartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some ', '007');
			deleteWordStartLeft(editor); assert.equal(model.getLineContent(1), '   /* Just ', '008');
			deleteWordStartLeft(editor); assert.equal(model.getLineContent(1), '   /* ', '009');
			deleteWordStartLeft(editor); assert.equal(model.getLineContent(1), '   ', '010');
			deleteWordStartLeft(editor); assert.equal(model.getLineContent(1), '', '011');
		});
	});

	test('deleteWordEndLeft', () => {
		withMockCodeEditor([
			'   /* Just some text a+= 3 +5 */  '
		], {}, (editor, _) => {
			const model = editor.getModel();
			editor.setPosition(new Position(1, 37));
			deleteWordEndLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5 */', '001');
			deleteWordEndLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +5', '002');
			deleteWordEndLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3 +', '003');
			deleteWordEndLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+= 3', '004');
			deleteWordEndLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a+=', '005');
			deleteWordEndLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text a', '006');
			deleteWordEndLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some text', '007');
			deleteWordEndLeft(editor); assert.equal(model.getLineContent(1), '   /* Just some', '008');
			deleteWordEndLeft(editor); assert.equal(model.getLineContent(1), '   /* Just', '009');
			deleteWordEndLeft(editor); assert.equal(model.getLineContent(1), '   /*', '010');
			deleteWordEndLeft(editor); assert.equal(model.getLineContent(1), '', '011');
		});
	});

	test('issue #832: deleteWordRight', () => {
		withMockCodeEditor([
			'   /* Just some text a+= 3 +5-3 */  '
		], {}, (editor, _) => {
			const model = editor.getModel();
			editor.setPosition(new Position(1, 1));
			deleteWordRight(editor); assert.equal(model.getLineContent(1), '/* Just some text a+= 3 +5-3 */  ', '001');
			deleteWordRight(editor); assert.equal(model.getLineContent(1), ' Just some text a+= 3 +5-3 */  ', '002');
			deleteWordRight(editor); assert.equal(model.getLineContent(1), ' some text a+= 3 +5-3 */  ', '003');
			deleteWordRight(editor); assert.equal(model.getLineContent(1), ' text a+= 3 +5-3 */  ', '004');
			deleteWordRight(editor); assert.equal(model.getLineContent(1), ' a+= 3 +5-3 */  ', '005');
			deleteWordRight(editor); assert.equal(model.getLineContent(1), '+= 3 +5-3 */  ', '006');
			deleteWordRight(editor); assert.equal(model.getLineContent(1), ' 3 +5-3 */  ', '007');
			deleteWordRight(editor); assert.equal(model.getLineContent(1), ' +5-3 */  ', '008');
			deleteWordRight(editor); assert.equal(model.getLineContent(1), '5-3 */  ', '009');
			deleteWordRight(editor); assert.equal(model.getLineContent(1), '-3 */  ', '010');
			deleteWordRight(editor); assert.equal(model.getLineContent(1), '3 */  ', '011');
			deleteWordRight(editor); assert.equal(model.getLineContent(1), ' */  ', '012');
			deleteWordRight(editor); assert.equal(model.getLineContent(1), '  ', '013');
		});
	});

	test('issue #3882: deleteWordRight', () => {
		withMockCodeEditor([
			'public void Add( int x,',
			'                 int y )'
		], {}, (editor, _) => {
			const model = editor.getModel();
			editor.setPosition(new Position(1, 24));
			deleteWordRight(editor); assert.equal(model.getLineContent(1), 'public void Add( int x,int y )', '001');
		});
	});

	test('issue #3882: deleteWordStartRight', () => {
		withMockCodeEditor([
			'public void Add( int x,',
			'                 int y )'
		], {}, (editor, _) => {
			const model = editor.getModel();
			editor.setPosition(new Position(1, 24));
			deleteWordStartRight(editor); assert.equal(model.getLineContent(1), 'public void Add( int x,int y )', '001');
		});
	});

	test('issue #3882: deleteWordEndRight', () => {
		withMockCodeEditor([
			'public void Add( int x,',
			'                 int y )'
		], {}, (editor, _) => {
			const model = editor.getModel();
			editor.setPosition(new Position(1, 24));
			deleteWordEndRight(editor); assert.equal(model.getLineContent(1), 'public void Add( int x,int y )', '001');
		});
	});

	test('deleteWordStartRight', () => {
		withMockCodeEditor([
			'   /* Just some text a+= 3 +5-3 */  '
		], {}, (editor, _) => {
			const model = editor.getModel();
			editor.setPosition(new Position(1, 1));

			deleteWordStartRight(editor); assert.equal(model.getLineContent(1), '/* Just some text a+= 3 +5-3 */  ', '001');
			deleteWordStartRight(editor); assert.equal(model.getLineContent(1), 'Just some text a+= 3 +5-3 */  ', '002');
			deleteWordStartRight(editor); assert.equal(model.getLineContent(1), 'some text a+= 3 +5-3 */  ', '003');
			deleteWordStartRight(editor); assert.equal(model.getLineContent(1), 'text a+= 3 +5-3 */  ', '004');
			deleteWordStartRight(editor); assert.equal(model.getLineContent(1), 'a+= 3 +5-3 */  ', '005');
			deleteWordStartRight(editor); assert.equal(model.getLineContent(1), '+= 3 +5-3 */  ', '006');
			deleteWordStartRight(editor); assert.equal(model.getLineContent(1), '3 +5-3 */  ', '007');
			deleteWordStartRight(editor); assert.equal(model.getLineContent(1), '+5-3 */  ', '008');
			deleteWordStartRight(editor); assert.equal(model.getLineContent(1), '5-3 */  ', '009');
			deleteWordStartRight(editor); assert.equal(model.getLineContent(1), '-3 */  ', '010');
			deleteWordStartRight(editor); assert.equal(model.getLineContent(1), '3 */  ', '011');
			deleteWordStartRight(editor); assert.equal(model.getLineContent(1), '*/  ', '012');
			deleteWordStartRight(editor); assert.equal(model.getLineContent(1), '', '013');
		});
	});

	test('deleteWordEndRight', () => {
		withMockCodeEditor([
			'   /* Just some text a+= 3 +5-3 */  '
		], {}, (editor, _) => {
			const model = editor.getModel();
			editor.setPosition(new Position(1, 1));
			deleteWordEndRight(editor); assert.equal(model.getLineContent(1), ' Just some text a+= 3 +5-3 */  ', '001');
			deleteWordEndRight(editor); assert.equal(model.getLineContent(1), ' some text a+= 3 +5-3 */  ', '002');
			deleteWordEndRight(editor); assert.equal(model.getLineContent(1), ' text a+= 3 +5-3 */  ', '003');
			deleteWordEndRight(editor); assert.equal(model.getLineContent(1), ' a+= 3 +5-3 */  ', '004');
			deleteWordEndRight(editor); assert.equal(model.getLineContent(1), '+= 3 +5-3 */  ', '005');
			deleteWordEndRight(editor); assert.equal(model.getLineContent(1), ' 3 +5-3 */  ', '006');
			deleteWordEndRight(editor); assert.equal(model.getLineContent(1), ' +5-3 */  ', '007');
			deleteWordEndRight(editor); assert.equal(model.getLineContent(1), '5-3 */  ', '008');
			deleteWordEndRight(editor); assert.equal(model.getLineContent(1), '-3 */  ', '009');
			deleteWordEndRight(editor); assert.equal(model.getLineContent(1), '3 */  ', '010');
			deleteWordEndRight(editor); assert.equal(model.getLineContent(1), ' */  ', '011');
			deleteWordEndRight(editor); assert.equal(model.getLineContent(1), '  ', '012');
		});
	});

	test('issue #3882 (1): Ctrl+Delete removing entire line when used at the end of line', () => {
		withMockCodeEditor([
			'A line with text.',
			'   And another one'
		], {}, (editor, _) => {
			const model = editor.getModel();
			editor.setPosition(new Position(1, 18));
			deleteWordRight(editor); assert.equal(model.getLineContent(1), 'A line with text.And another one', '001');
		});
	});

	test('issue #3882 (2): Ctrl+Delete removing entire line when used at the end of line', () => {
		withMockCodeEditor([
			'A line with text.',
			'   And another one'
		], {}, (editor, _) => {
			const model = editor.getModel();
			editor.setPosition(new Position(2, 1));
			deleteWordLeft(editor); assert.equal(model.getLineContent(1), 'A line with text   And another one', '001');
		});
	});
});
