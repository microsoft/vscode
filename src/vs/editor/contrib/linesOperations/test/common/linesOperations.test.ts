/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { Selection } from 'vs/editor/common/core/selection';
import { withMockCodeEditor } from 'vs/editor/test/common/mocks/mockCodeEditor';
import { DeleteAllLeftAction, JoinLinesAction, TransposeAction, UpperCaseAction, LowerCaseAction } from 'vs/editor/contrib/linesOperations/common/linesOperations';

suite('Editor Contrib - Line Operations', () => {
	test('delete all left', function () {
		withMockCodeEditor(
			[
				'one',
				'two',
				'three'
			], {}, (editor, cursor) => {
				let model = editor.getModel();
				let deleteAllLeftAction = new DeleteAllLeftAction();

				editor.setSelection(new Selection(1, 2, 1, 2));
				deleteAllLeftAction.run(null, editor);
				assert.equal(model.getLineContent(1), 'ne', '001');

				editor.setSelections([new Selection(2, 2, 2, 2), new Selection(3, 2, 3, 2)]);
				deleteAllLeftAction.run(null, editor);
				assert.equal(model.getLineContent(2), 'wo', '002');
				assert.equal(model.getLineContent(3), 'hree', '003');
			});
	});

	test('delete all left in multi cursor mode', function () {
		withMockCodeEditor(
			[
				'hello',
				'world',
				'hello world',
				'hello',
				'bonjour',
				'hola',
				'world',
				'hello world',
			], {}, (editor, cursor) => {
				let model = editor.getModel();
				let deleteAllLeftAction = new DeleteAllLeftAction();

				editor.setSelections([new Selection(1, 2, 1, 2), new Selection(1, 4, 1, 4)]);
				deleteAllLeftAction.run(null, editor);
				assert.equal(model.getLineContent(1), 'lo', '001');

				editor.setSelections([new Selection(2, 2, 2, 2), new Selection(2, 4, 2, 5)]);
				deleteAllLeftAction.run(null, editor);
				assert.equal(model.getLineContent(2), 'ord', '002');

				editor.setSelections([new Selection(3, 2, 3, 5), new Selection(3, 7, 3, 7)]);
				deleteAllLeftAction.run(null, editor);
				assert.equal(model.getLineContent(3), 'world', '003');

				editor.setSelections([new Selection(4, 3, 4, 3), new Selection(4, 5, 5, 4)]);
				deleteAllLeftAction.run(null, editor);
				assert.equal(model.getLineContent(4), 'lljour', '004');

				editor.setSelections([new Selection(5, 3, 6, 3), new Selection(6, 5, 7, 5), new Selection(7, 7, 7, 7)]);
				deleteAllLeftAction.run(null, editor);
				assert.equal(model.getLineContent(5), 'horlworld', '005');
			});
	});

	test('Join lines', function () {
		withMockCodeEditor(
			[
				'hello',
				'world',
				'hello ',
				'world',
				'hello		',
				'	world',
				'hello   ',
				'	world',
				'',
				'',
				'hello world'
			], {}, (editor, cursor) => {
				let model = editor.getModel();
				let joinLinesAction = new JoinLinesAction();

				editor.setSelection(new Selection(1, 2, 1, 2));
				joinLinesAction.run(null, editor);
				assert.equal(model.getLineContent(1), 'hello world', '001');
				assert.deepEqual(editor.getSelection().toString(), new Selection(1, 6, 1, 6).toString(), '002');

				editor.setSelection(new Selection(2, 2, 2, 2));
				joinLinesAction.run(null, editor);
				assert.equal(model.getLineContent(2), 'hello world', '003');
				assert.deepEqual(editor.getSelection().toString(), new Selection(2, 7, 2, 7).toString(), '004');

				editor.setSelection(new Selection(3, 2, 3, 2));
				joinLinesAction.run(null, editor);
				assert.equal(model.getLineContent(3), 'hello world', '005');
				assert.deepEqual(editor.getSelection().toString(), new Selection(3, 7, 3, 7).toString(), '006');

				editor.setSelection(new Selection(4, 2, 5, 3));
				joinLinesAction.run(null, editor);
				assert.equal(model.getLineContent(4), 'hello world', '007');
				assert.deepEqual(editor.getSelection().toString(), new Selection(4, 2, 4, 8).toString(), '008');

				editor.setSelection(new Selection(5, 1, 7, 3));
				joinLinesAction.run(null, editor);
				assert.equal(model.getLineContent(5), 'hello world', '009');
				assert.deepEqual(editor.getSelection().toString(), new Selection(5, 1, 5, 3).toString(), '010');
			});
	});

	test('transpose', function () {
		withMockCodeEditor(
			[
				'hello world',
				'',
				'',
				'   ',
			], {}, (editor, cursor) => {
				let model = editor.getModel();
				let transposeAction = new TransposeAction();

				editor.setSelection(new Selection(1, 1, 1, 1));
				transposeAction.run(null, editor);
				assert.equal(model.getLineContent(1), 'hello world', '001');
				assert.deepEqual(editor.getSelection().toString(), new Selection(1, 2, 1, 2).toString(), '002');

				editor.setSelection(new Selection(1, 6, 1, 6));
				transposeAction.run(null, editor);
				assert.equal(model.getLineContent(1), 'hell oworld', '003');
				assert.deepEqual(editor.getSelection().toString(), new Selection(1, 7, 1, 7).toString(), '004');

				editor.setSelection(new Selection(1, 12, 1, 12));
				transposeAction.run(null, editor);
				assert.equal(model.getLineContent(1), 'hell oworl', '005');
				assert.deepEqual(editor.getSelection().toString(), new Selection(2, 2, 2, 2).toString(), '006');

				editor.setSelection(new Selection(3, 1, 3, 1));
				transposeAction.run(null, editor);
				assert.equal(model.getLineContent(3), '', '007');
				assert.deepEqual(editor.getSelection().toString(), new Selection(4, 1, 4, 1).toString(), '008');

				editor.setSelection(new Selection(4, 2, 4, 2));
				transposeAction.run(null, editor);
				assert.equal(model.getLineContent(4), '   ', '009');
				assert.deepEqual(editor.getSelection().toString(), new Selection(4, 3, 4, 3).toString(), '010');
			}
		);

		// fix #16633
		withMockCodeEditor(
			[
				'',
				'',
				'hello',
				'world',
				'',
				'hello world',
				'',
				'hello world'
			], {}, (editor, cursor) => {
				let model = editor.getModel();
				let transposeAction = new TransposeAction();

				editor.setSelection(new Selection(1, 1, 1, 1));
				transposeAction.run(null, editor);
				assert.equal(model.getLineContent(2), '', '011');
				assert.deepEqual(editor.getSelection().toString(), new Selection(2, 1, 2, 1).toString(), '012');

				editor.setSelection(new Selection(3, 6, 3, 6));
				transposeAction.run(null, editor);
				assert.equal(model.getLineContent(4), 'oworld', '013');
				assert.deepEqual(editor.getSelection().toString(), new Selection(4, 2, 4, 2).toString(), '014');

				editor.setSelection(new Selection(6, 12, 6, 12));
				transposeAction.run(null, editor);
				assert.equal(model.getLineContent(7), 'd', '015');
				assert.deepEqual(editor.getSelection().toString(), new Selection(7, 2, 7, 2).toString(), '016');

				editor.setSelection(new Selection(8, 12, 8, 12));
				transposeAction.run(null, editor);
				assert.equal(model.getLineContent(8), 'hello world', '019');
				assert.deepEqual(editor.getSelection().toString(), new Selection(8, 12, 8, 12).toString(), '020');
			}
		);
	});

	test('toggle case', function () {
		withMockCodeEditor(
			[
				'hello world',
				'öçşğü'
			], {}, (editor, cursor) => {
				let model = editor.getModel();
				let uppercaseAction = new UpperCaseAction();
				let lowercaseAction = new LowerCaseAction();

				editor.setSelection(new Selection(1, 1, 1, 12));
				uppercaseAction.run(null, editor);
				assert.equal(model.getLineContent(1), 'HELLO WORLD', '001');
				assert.deepEqual(editor.getSelection().toString(), new Selection(1, 1, 1, 12).toString(), '002');

				editor.setSelection(new Selection(1, 1, 1, 12));
				lowercaseAction.run(null, editor);
				assert.equal(model.getLineContent(1), 'hello world', '003');
				assert.deepEqual(editor.getSelection().toString(), new Selection(1, 1, 1, 12).toString(), '004');

				editor.setSelection(new Selection(1, 3, 1, 3));
				uppercaseAction.run(null, editor);
				assert.equal(model.getLineContent(1), 'HELLO world', '005');
				assert.deepEqual(editor.getSelection().toString(), new Selection(1, 3, 1, 3).toString(), '006');

				editor.setSelection(new Selection(1, 4, 1, 4));
				lowercaseAction.run(null, editor);
				assert.equal(model.getLineContent(1), 'hello world', '007');
				assert.deepEqual(editor.getSelection().toString(), new Selection(1, 4, 1, 4).toString(), '008');

				editor.setSelection(new Selection(2, 1, 2, 6));
				uppercaseAction.run(null, editor);
				assert.equal(model.getLineContent(2), 'ÖÇŞĞÜ', '009');
				assert.deepEqual(editor.getSelection().toString(), new Selection(2, 1, 2, 6).toString(), '010');

				editor.setSelection(new Selection(2, 1, 2, 6));
				lowercaseAction.run(null, editor);
				assert.equal(model.getLineContent(2), 'öçşğü', '011');
				assert.deepEqual(editor.getSelection().toString(), new Selection(2, 1, 2, 6).toString(), '012');
			}
		);

		withMockCodeEditor(
			[
				'',
				'   '
			], {}, (editor, cursor) => {
				let model = editor.getModel();
				let uppercaseAction = new UpperCaseAction();
				let lowercaseAction = new LowerCaseAction();

				editor.setSelection(new Selection(1, 1, 1, 1));
				uppercaseAction.run(null, editor);
				assert.equal(model.getLineContent(1), '', '013');
				assert.deepEqual(editor.getSelection().toString(), new Selection(1, 1, 1, 1).toString(), '014');

				editor.setSelection(new Selection(1, 1, 1, 1));
				lowercaseAction.run(null, editor);
				assert.equal(model.getLineContent(1), '', '015');
				assert.deepEqual(editor.getSelection().toString(), new Selection(1, 1, 1, 1).toString(), '016');

				editor.setSelection(new Selection(2, 2, 2, 2));
				uppercaseAction.run(null, editor);
				assert.equal(model.getLineContent(2), '   ', '017');
				assert.deepEqual(editor.getSelection().toString(), new Selection(2, 2, 2, 2).toString(), '018');

				editor.setSelection(new Selection(2, 2, 2, 2));
				lowercaseAction.run(null, editor);
				assert.equal(model.getLineContent(2), '   ', '019');
				assert.deepEqual(editor.getSelection().toString(), new Selection(2, 2, 2, 2).toString(), '020');
			}
		);
	});
});