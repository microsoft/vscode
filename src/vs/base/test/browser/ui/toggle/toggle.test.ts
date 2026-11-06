/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Toggle, unthemedToggleStyles } from '../../../../browser/ui/toggle/toggle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

suite('Toggle', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('focusable toggle is removed from the tab order when disabled', () => {
		const toggle = new Toggle({ title: 'toggle', isChecked: false, ...unthemedToggleStyles });

		// Focusable toggles are tabbable by default.
		assert.strictEqual(toggle.domNode.tabIndex, 0);

		toggle.disable();
		assert.strictEqual(toggle.domNode.tabIndex, -1, 'disabled toggle should not be tabbable');

		toggle.enable();
		assert.strictEqual(toggle.domNode.tabIndex, 0, 'enabled toggle should be tabbable again');

		toggle.dispose();
	});

	test('notFocusable toggle keeps externally managed tabIndex when enabled/disabled', () => {
		const toggle = new Toggle({ title: 'toggle', isChecked: false, notFocusable: true, ...unthemedToggleStyles });

		// notFocusable toggles are never tabbable on their own; their tabIndex is managed by the owner.
		assert.strictEqual(toggle.domNode.tabIndex, -1);

		// The owner (e.g. a toolbar using roving tabindex) may make it focusable.
		toggle.domNode.tabIndex = 0;

		toggle.disable();
		assert.strictEqual(toggle.domNode.tabIndex, 0, 'notFocusable toggle tabIndex should be left untouched on disable');

		toggle.enable();
		assert.strictEqual(toggle.domNode.tabIndex, 0, 'notFocusable toggle tabIndex should be left untouched on enable');

		toggle.dispose();
	});
});
