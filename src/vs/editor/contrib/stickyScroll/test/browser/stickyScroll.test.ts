/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { ITestCodeEditor, withTestCodeEditor } from 'vs/editor/test/browser/testCodeEditor';
import { StickyScrollController } from 'vs/editor/contrib/stickyScroll/browser/stickyScroll';

suite('Sticky Scroll Tests', () => {

	test('issue #8817: Cursor position changes when you cancel multicursor', () => {
		withTestCodeEditor([
			'var x = (3 * 5)',
			'var y = (3 * 5)',
			'var z = (3 * 5)',
		], {}, (editor) => {

			const stickyScrollController = editor.registerAndInstantiateContribution(StickyScrollController.ID, StickyScrollController);

			stickyScrollController.dispose();
		});
	});
});
