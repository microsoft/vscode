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
				'three',
				'one two three four'
			], {}, (editor, cursor) => {
				let model = editor.getModel();
				let joinLinesAction = new DeleteAllLeftAction();

				editor.setSelection(new Selection(1, 2, 1, 2));
				joinLinesAction.run(null, editor);
				assert.equal(model.getLineContent(1), 'ne', '001');

				editor.setSelections([new Selection(2, 2, 2, 2), new Selection(3, 2, 3, 2)]);
				joinLinesAction.run(null, editor);
				assert.equal(model.getLineContent(2), 'wo', '002');
				assert.equal(model.getLineContent(3), 'hree', '003');

				editor.setSelections([new Selection(4, 5, 4, 5), new Selection(4, 15, 4, 15)]);
				joinLinesAction.run(null, editor);
				assert.equal(model.getLineContent(4), 'four', '004');
			});
	});
});