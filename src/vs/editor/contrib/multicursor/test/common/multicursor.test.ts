/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { withMockCodeEditor } from 'vs/editor/test/common/mocks/mockCodeEditor';
import { Selection } from 'vs/editor/common/core/selection';
import { InsertCursorAbove, InsertCursorBelow } from 'vs/editor/contrib/multicursor/common/multicursor';
import { Handler } from 'vs/editor/common/editorCommon';


suite('Multicursor', () => {

	test('issue #2205: Multi-cursor pastes in reverse order', () => {
		withMockCodeEditor([
			'abc',
			'def'
		], {}, (editor, cursor) => {
			let addCursorUpAction = new InsertCursorAbove();

			editor.setSelection(new Selection(2, 1, 2, 1));
			addCursorUpAction.run(null, editor, {});
			assert.equal(cursor.getSelections().length, 2);

			editor.trigger('test', Handler.Paste, { text: '1\n2' });
			// cursorCommand(cursor, H.Paste, { text: '1\n2' });
			assert.equal(editor.getModel().getLineContent(1), '1abc');
			assert.equal(editor.getModel().getLineContent(2), '2def');
		});
	});

	test('issue #1336: Insert cursor below on last line adds a cursor to the end of the current line', () => {
		withMockCodeEditor([
			'abc'
		], {}, (editor, cursor) => {
			let addCursorDownAction = new InsertCursorBelow();
			addCursorDownAction.run(null, editor, {});
			assert.equal(cursor.getSelections().length, 1);
		});
	});

});
