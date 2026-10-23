/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { CheckboxChip, ICheckboxChipState } from '../../browser/checkboxChip.js';

suite('CheckboxChip', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('only exposes an accessible description for a disabled chip with a reason', () => {
		const chip = store.add(new CheckboxChip({
			label: 'Worktree',
			ariaLabel: 'Use a Worktree',
			onToggle: () => { },
		}, NullHoverService));
		const slot = chip.render($('div'));
		const checkbox = slot.querySelector<HTMLElement>('[role="checkbox"]')!;
		const initialDescription = checkbox.getAttribute('aria-description');
		const states: ICheckboxChipState[] = [
			{ checked: false, state: 'disabled', disabledReason: 'Unavailable' },
			{ checked: false, state: 'enabled', disabledReason: 'Unavailable' },
			{ checked: false, state: 'disabled', disabledReason: 'Unavailable' },
			{ checked: false, state: 'disabled', disabledReason: '' },
			{ checked: false, state: 'disabled', disabledReason: 'Unavailable' },
			{ checked: false, state: 'disabled' },
			{ checked: false, state: 'disabled', disabledReason: 'Unavailable' },
			{ checked: false, state: 'hidden', disabledReason: 'Unavailable' },
		];
		const descriptions = states.map(state => {
			chip.update(state);
			return checkbox.getAttribute('aria-description');
		});

		assert.deepStrictEqual({ initialDescription, descriptions }, {
			initialDescription: null,
			descriptions: ['Unavailable', null, 'Unavailable', null, 'Unavailable', null, 'Unavailable', null],
		});
	});
});
