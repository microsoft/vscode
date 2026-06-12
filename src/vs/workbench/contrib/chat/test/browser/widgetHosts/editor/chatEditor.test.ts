/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { createChatEditorViewOptions } from '../../../../browser/widgetHosts/editor/chatEditor.js';

suite('ChatEditor', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('uses the editor container for drag and drop', () => {
		const parent = document.createElement('div');
		const options = createChatEditorViewOptions(parent, async () => { });

		assert.strictEqual(options.dndContainer, parent);
	});
});
