/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IContextViewProvider } from '../../../../browser/ui/contextview/contextview.js';
import { ISelectOptionItem, unthemedSelectBoxStyles } from '../../../../browser/ui/selectBox/selectBox.js';
import { SelectBoxList } from '../../../../browser/ui/selectBox/selectBoxCustom.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

suite('SelectBoxList', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('hides disabled options from the custom dropdown', () => {
		const options: ISelectOptionItem[] = [
			{ text: 'Pick an option', isDisabled: true },
			{ text: 'None' },
		];
		const contextViewProvider: IContextViewProvider = {
			showContextView: () => { },
			hideContextView: () => { },
			layout: () => { },
		};
		const selectBox = disposables.add(new SelectBoxList(
			options,
			0,
			contextViewProvider,
			unthemedSelectBoxStyles,
			{ hideDisabledOptions: true }
		));
		const container = document.createElement('div');
		selectBox.render(container);

		assert.deepStrictEqual({
			disabledOptionHeight: selectBox.getHeight(options[0]),
			enabledOptionHeight: selectBox.getHeight(options[1]),
			selectedText: container.querySelector('select')?.selectedOptions[0]?.text,
		}, {
			disabledOptionHeight: 0,
			enabledOptionHeight: 22,
			selectedText: 'Pick an option',
		});
	});
});
