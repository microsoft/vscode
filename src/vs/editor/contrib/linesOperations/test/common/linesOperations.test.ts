/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { Selection } from 'vs/editor/common/core/selection';
import { withMockCodeEditor } from 'vs/editor/test/common/mocks/mockCodeEditor';
import { DeleteAllLeftAction } from 'vs/editor/contrib/linesOperations/common/linesOperations';

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
});