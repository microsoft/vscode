/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { getChatChangesDiffEditorLabel } from '../../../../browser/widget/chatContentParts/chatDiffEditorLabel.js';

suite('chatDiffEditorLabel', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('getChatChangesDiffEditorLabel returns a short chat-scoped tab title', () => {
		assert.strictEqual(getChatChangesDiffEditorLabel('file.ts'), 'file.ts (changes from chat)');
		assert.strictEqual(getChatChangesDiffEditorLabel('README.md'), 'README.md (changes from chat)');
	});
});
