/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../base/browser/dom.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { MobileSessionFilterChips } from '../../browser/parts/mobile/mobileSessionFilterChips.js';

suite('MobileSessionFilterChips', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('exposes only keyboard-operable Sort and Find actions', () => {
		const container = dom.$('div');
		const chips = store.add(new MobileSessionFilterChips(container));
		const requests: string[] = [];
		store.add(chips.onDidRequestSortGroup(() => requests.push('sort')));
		store.add(chips.onDidRequestFind(() => requests.push('find')));
		const buttons = [...container.querySelectorAll<HTMLElement>('[role="button"]')];
		buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
		buttons[1].dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
		assert.deepStrictEqual({
			role: chips.element.getAttribute('role'),
			buttons: buttons.map(button => ({ label: button.getAttribute('aria-label'), tabIndex: button.tabIndex, pressed: button.getAttribute('aria-pressed') })),
			requests,
		}, {
			role: 'toolbar',
			buttons: [
				{ label: 'Sort and group options', tabIndex: 0, pressed: null },
				{ label: 'Find session', tabIndex: 0, pressed: null },
			],
			requests: ['sort', 'find'],
		});
	});
});
