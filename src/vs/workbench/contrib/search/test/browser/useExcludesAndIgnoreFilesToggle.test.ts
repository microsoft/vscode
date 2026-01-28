/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { UseExcludesAndIgnoreFilesToggle } from '../../browser/useExcludesAndIgnoreFilesToggle.js';

suite('UseExcludesAndIgnoreFilesToggle', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('initial state - toggle is checked by default', () => {
		const toggle = store.add(new UseExcludesAndIgnoreFilesToggle(undefined));

		assert.strictEqual(toggle.checked, true, 'Toggle should be checked by default');
	});

	test('toggle() - flips checked state', () => {
		const toggle = store.add(new UseExcludesAndIgnoreFilesToggle(undefined));
		const initialState = toggle.checked;

		// Toggle to unchecked
		toggle.toggle();
		assert.strictEqual(toggle.checked, !initialState, 'State should be toggled after first toggle');

		// Toggle back to checked
		toggle.toggle();
		assert.strictEqual(toggle.checked, initialState, 'State should be toggled after second toggle');
	});

	test('toggle() - fires onChange event exactly once per call', () => {
		const toggle = store.add(new UseExcludesAndIgnoreFilesToggle());
		let changeEventCount = 0;

		store.add(toggle.onChange(() => {
			changeEventCount++;
		}));

		toggle.toggle();
		assert.strictEqual(changeEventCount, 1, 'onChange should fire exactly once on toggle');

		toggle.toggle();
		assert.strictEqual(changeEventCount, 2, 'onChange should fire exactly once on toggle');
	});

	test('toggle() - state and event are in sync', () => {
		const toggle = store.add(new UseExcludesAndIgnoreFilesToggle(undefined));
		const stateChanges: boolean[] = [];
		const initialState = toggle.checked;

		store.add(toggle.onChange(() => {
			// Record the state at the moment the event fires

			stateChanges.push(toggle.checked);
		}));

		toggle.toggle();
		toggle.toggle();
		toggle.toggle();

		// State should be changed before event fires
		assert.deepStrictEqual(stateChanges, [!initialState, initialState, !initialState], 'State should be consistent with events');
	});
});
