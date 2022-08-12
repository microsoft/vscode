/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { withTestCodeEditor } from 'vs/editor/test/browser/testCodeEditor';

suite('Sticky Scroll Tests', () => {

	test('issue #8817: Cursor position changes when you cancel multicursor', () => {
		withTestCodeEditor([
			'var x = (3 * 5)',
			'var y = (3 * 5)',
			'var z = (3 * 5)',
		], {}, (editor) => {

			// const findController = editor.registerAndInstantiateContribution(CommonFindController.ID, CommonFindController);
			// findController.dispose();
		});
	});
});
