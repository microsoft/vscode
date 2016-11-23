/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { Selection } from 'vs/editor/common/core/selection';
import { withMockCodeEditor } from 'vs/editor/test/common/mocks/mockCodeEditor';
import { DeleteAllLeftAction, JoinLinesAction } from 'vs/editor/contrib/linesOperations/common/linesOperations';

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
});