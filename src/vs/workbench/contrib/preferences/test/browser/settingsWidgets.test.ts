/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { ExcludeSettingWidget, IIncludeExcludeDataItem, SettingListEvent } from '../../browser/settingsWidgets.js';

suite('ExcludeSettingWidget', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('offers adding an exception only when requested and adds it as a !-prefixed pattern', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const container = $('div');
		const widget = store.add(instantiationService.createInstance(ExcludeSettingWidget, container));
		const events: SettingListEvent<IIncludeExcludeDataItem>[] = [];
		store.add(widget.onDidChangeList(e => events.push(e)));
		const addButtons = () => [...container.querySelectorAll<HTMLElement>('.setting-list-addButton')];
		const visibleAddButtonLabels = () => addButtons().filter(button => button.style.display !== 'none').map(button => button.textContent);

		widget.setValue([], { showAddExceptionButton: false });
		const withoutExceptions = visibleAddButtonLabels();
		widget.setValue([], { showAddExceptionButton: true });
		const withExceptions = visibleAddButtonLabels();

		addButtons()[1].click();
		const input = container.querySelector<HTMLInputElement>('.setting-list-valueInput input')!;
		const newException = { value: input.value, ariaLabel: input.getAttribute('aria-label') };
		input.value = '!node_modules/@types';
		container.querySelector<HTMLElement>('.setting-list-ok-button')!.click();

		assert.deepStrictEqual({
			withoutExceptions,
			withExceptions,
			newException,
			events: events.map(e => ({ type: e.type, pattern: e.type === 'add' ? e.newItem.value.data : undefined })),
		}, {
			withoutExceptions: ['Add Pattern'],
			withExceptions: ['Add Pattern', 'Add Exception'],
			newException: { value: '!', ariaLabel: 'Exception Pattern' },
			events: [{ type: 'add', pattern: '!node_modules/@types' }],
		});
	});
});
