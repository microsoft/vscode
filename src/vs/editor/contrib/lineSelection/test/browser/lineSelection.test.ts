/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import type { ICodeEditor } from '../../../../browser/editorBrowser.js';
import { EditorAction } from '../../../../browser/editorExtensions.js';
import { Position } from '../../../../common/core/position.js';
import { Selection } from '../../../../common/core/selection.js';
import { ExpandLineSelectionAction } from '../../browser/lineSelection.js';
import { withTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';

function executeAction(action: EditorAction, editor: ICodeEditor): void {
	action.run(null!, editor, undefined);
}

suite('LineSelection', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('', () => {
		const LINE1 = '    \tMy First Line\t ';
		const LINE2 = '\tMy Second Line';
		const LINE3 = '    Third Line🐶';
		const LINE4 = '';
		const LINE5 = '1';

		const TEXT =
			LINE1 + '\r\n' +
			LINE2 + '\n' +
			LINE3 + '\n' +
			LINE4 + '\r\n' +
			LINE5;

		withTestCodeEditor(TEXT, {}, (editor, viewModel) => {
			const action = new ExpandLineSelectionAction();

			//              0          1         2
			//              01234 56789012345678 0
			// let LINE1 = '    \tMy First Line\t ';
			editor.setPosition(new Position(1, 1));
			executeAction(action, editor);
			assert.deepStrictEqual(editor.getSelection(), new Selection(1, 1, 2, 1));

			editor.setPosition(new Position(1, 2));
			executeAction(action, editor);
			assert.deepStrictEqual(editor.getSelection(), new Selection(1, 1, 2, 1));

			editor.setPosition(new Position(1, 5));
			executeAction(action, editor);
			assert.deepStrictEqual(editor.getSelection(), new Selection(1, 1, 2, 1));

			editor.setPosition(new Position(1, 19));
			executeAction(action, editor);
			assert.deepStrictEqual(editor.getSelection(), new Selection(1, 1, 2, 1));

			editor.setPosition(new Position(1, 20));
			executeAction(action, editor);
			assert.deepStrictEqual(editor.getSelection(), new Selection(1, 1, 2, 1));

			editor.setPosition(new Position(1, 21));
			executeAction(action, editor);
			assert.deepStrictEqual(editor.getSelection(), new Selection(1, 1, 2, 1));
			executeAction(action, editor);
			assert.deepStrictEqual(editor.getSelection(), new Selection(1, 1, 3, 1));
			executeAction(action, editor);
			assert.deepStrictEqual(editor.getSelection(), new Selection(1, 1, 4, 1));
			executeAction(action, editor);
			assert.deepStrictEqual(editor.getSelection(), new Selection(1, 1, 5, 1));
			executeAction(action, editor);
			assert.deepStrictEqual(editor.getSelection(), new Selection(1, 1, 5, LINE5.length + 1));
			executeAction(action, editor);
			assert.deepStrictEqual(editor.getSelection(), new Selection(1, 1, 5, LINE5.length + 1));
		});
	});
});
