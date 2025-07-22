/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ToggleCountBadge } from '../../../../browser/ui/countBadge/toggleCountBadge.js';
import { unthemedCountStyles } from '../../../../browser/ui/countBadge/countBadge.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';
import { mainWindow } from '../../../../browser/window.js';

suite('ToggleCountBadge', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let container: HTMLElement;

	setup(() => {
		container = document.createElement('div');
		mainWindow.document.body.appendChild(container);
	});

	teardown(() => {
		container.remove();
	});

	test('initial state is not toggled', () => {
		const badge = store.add(new ToggleCountBadge(container, { count: 5 }, unthemedCountStyles));
		assert.strictEqual(badge.isToggled(), false);
	});

	test('toggle() toggles state and fires event', () => {
		const badge = store.add(new ToggleCountBadge(container, { count: 5 }, unthemedCountStyles));
		let eventValue: boolean | undefined;
		const disposable = badge.onDidToggle(toggled => { eventValue = toggled; });
		store.add(disposable);

		badge.toggle();
		assert.strictEqual(badge.isToggled(), true);
		assert.strictEqual(eventValue, true);

		badge.toggle();
		assert.strictEqual(badge.isToggled(), false);
		assert.strictEqual(eventValue, false);
	});

	test('setToggled() only toggles if state changes', () => {
		const badge = store.add(new ToggleCountBadge(container, { count: 5 }, unthemedCountStyles));
		let eventCount = 0;
		const disposable = badge.onDidToggle(() => { eventCount++; });
		store.add(disposable);

		badge.setToggled(true);
		assert.strictEqual(badge.isToggled(), true);
		assert.strictEqual(eventCount, 1);

		badge.setToggled(true);
		assert.strictEqual(badge.isToggled(), true);
		assert.strictEqual(eventCount, 1);

		badge.setToggled(false);
		assert.strictEqual(badge.isToggled(), false);
		assert.strictEqual(eventCount, 2);
	});
});
