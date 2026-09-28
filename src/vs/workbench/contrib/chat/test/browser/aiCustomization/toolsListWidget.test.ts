/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { CustomizationToggle } from '../../../browser/aiCustomization/customizationToggle.js';
import { isToolsTreeKeyboardTarget } from '../../../browser/aiCustomization/toolsListWidget.js';
import { ChatConfiguration } from '../../../common/constants.js';

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

	test('uses the configured customization toggle style', () => {
		const checkbox = disposables.add(new CustomizationToggle(
			{ ariaLabel: 'Checkbox', checked: true },
			new TestConfigurationService({ [ChatConfiguration.ChatCustomizationsToggleStyle]: 'checkbox' }),
		));
		const toggle = disposables.add(new CustomizationToggle(
			{ ariaLabel: 'Switch', checked: true },
			new TestConfigurationService({ [ChatConfiguration.ChatCustomizationsToggleStyle]: 'switch' }),
		));

		assert.deepStrictEqual({
			checkboxRole: checkbox.domNode.firstElementChild?.getAttribute('role'),
			switchRole: toggle.domNode.firstElementChild?.getAttribute('role'),
			checkboxChecked: checkbox.checked,
			switchChecked: toggle.checked,
		}, {
			checkboxRole: 'checkbox',
			switchRole: 'switch',
			checkboxChecked: true,
			switchChecked: true,
		});
	});
});
