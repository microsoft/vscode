/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MiddleScrollController } from '../../browser/middleScroll.js';
import { withTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { getWindow } from '../../../../../base/browser/dom.js';

suite('middleScroll', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('Adds the class to body', () => {
		withTestCodeEditor('test', {}, (editor) => {
			const middleScrollController = editor.registerAndInstantiateContribution(MiddleScrollController.ID, MiddleScrollController);

			editor.getDomNode().dispatchEvent(new MouseEvent('mousedown', { button: 1 }));

			assert.equal(getWindow(editor.getDomNode()).document.body.classList.contains('scroll-editor-on-middle-click-editor'), true);

			middleScrollController.dispose();
		});
	});
});
