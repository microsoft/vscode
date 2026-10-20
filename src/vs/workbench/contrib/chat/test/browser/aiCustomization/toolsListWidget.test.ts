/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CustomizationToggle } from '../../../browser/aiCustomization/customizationToggle.js';
import { isToolsTreeKeyboardTarget } from '../../../browser/aiCustomization/toolsListWidget.js';

suite('toolsListWidget', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('handles tree keys only from the row itself', () => {
		const row = document.createElement('div');
		const moreButton = document.createElement('button');
		row.appendChild(moreButton);

		assert.deepStrictEqual({
			row: isToolsTreeKeyboardTarget(row, row),
			moreButton: isToolsTreeKeyboardTarget(moreButton, row),
		}, {
			row: true,
			moreButton: false,
		});
	});

	test('uses switches for customization enablement', () => {
		const enabledToggle = disposables.add(new CustomizationToggle({ ariaLabel: 'Enabled', checked: true }));
		const mixedToggle = disposables.add(new CustomizationToggle({ ariaLabel: 'Mixed', checked: 'mixed' }));

		assert.deepStrictEqual({
			enabledRole: enabledToggle.domNode.firstElementChild?.getAttribute('role'),
			enabledChecked: enabledToggle.domNode.firstElementChild?.getAttribute('aria-checked'),
			mixedRole: mixedToggle.domNode.firstElementChild?.getAttribute('role'),
			mixedChecked: mixedToggle.domNode.firstElementChild?.getAttribute('aria-checked'),
		}, {
			enabledRole: 'switch',
			enabledChecked: 'true',
			mixedRole: 'switch',
			mixedChecked: 'mixed',
		});
	});
});
