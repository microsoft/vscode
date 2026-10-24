/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { chatWindowPartOptions } from '../../browser/chatWindowService.js';

suite('Chat window part options', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('an editor area leaves showTabs to workbench.editor.showTabs', () => {
		assert.deepStrictEqual(chatWindowPartOptions(true), {
			closeEmptyGroups: false,
			alwaysShowEditorActions: true,
			doubleClickTabToToggleEditorGroupSizes: 'off',
		});
	});

	test('showTabs none shows as single, so that the terminal row keeps its title and actions', () => {
		assert.deepStrictEqual([undefined, 'multiple', 'single', 'none'].map(showTabs => chatWindowPartOptions(true, showTabs).showTabs), [undefined, undefined, undefined, 'single']);
	});

	test('a window without an editor area shows no tabs', () => {
		assert.deepStrictEqual(chatWindowPartOptions(false, 'multiple'), {
			showTabs: 'none',
			showBreadcrumbs: false,
			editorActionsLocation: 'hidden',
			doubleClickTabToToggleEditorGroupSizes: 'off',
		});
	});
});
