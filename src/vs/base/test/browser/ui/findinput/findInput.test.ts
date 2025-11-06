/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { FindInput } from '../../../../browser/ui/findinput/findInput.js';
import { Toggle, unthemedToggleStyles } from '../../../../browser/ui/toggle/toggle.js';
import { unthemedInboxStyles } from '../../../../browser/ui/inputbox/inputBox.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

suite('FindInput Toggle Focus', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('Toggle focus group: only first toggle should be tabbable', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		store.add({ dispose: () => container.remove() });

		const additionalToggles = [
			store.add(new Toggle({ title: 'Toggle 1', isChecked: false, ...unthemedToggleStyles })),
			store.add(new Toggle({ title: 'Toggle 2', isChecked: false, ...unthemedToggleStyles }))
		];

		store.add(new FindInput(container, undefined, {
			label: 'test',
			inputBoxStyles: unthemedInboxStyles,
			toggleStyles: unthemedToggleStyles,
			additionalToggles
		}));

		// Verify that only the first toggle is tabbable
		assert.strictEqual(additionalToggles[0].domNode.tabIndex, 0, 'First toggle should have tabIndex 0');
		assert.strictEqual(additionalToggles[1].domNode.tabIndex, -1, 'Second toggle should have tabIndex -1');
	});

	test('Toggle focus group with common toggles: only first toggle should be tabbable', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		store.add({ dispose: () => container.remove() });

		const additionalToggles = [
			store.add(new Toggle({ title: 'Toggle 1', isChecked: false, ...unthemedToggleStyles })),
			store.add(new Toggle({ title: 'Toggle 2', isChecked: false, ...unthemedToggleStyles }))
		];

		const findInput = store.add(new FindInput(container, undefined, {
			label: 'test',
			inputBoxStyles: unthemedInboxStyles,
			toggleStyles: unthemedToggleStyles,
			showCommonFindToggles: true,
			additionalToggles
		}));

		// Get the common toggles from the findInput
		const caseSensitive = (findInput as any).caseSensitive;
		const wholeWords = (findInput as any).wholeWords;
		const regex = (findInput as any).regex;

		// Verify that only the first toggle (caseSensitive) is tabbable
		assert.strictEqual(caseSensitive.domNode.tabIndex, 0, 'Case sensitive toggle should have tabIndex 0');
		assert.strictEqual(wholeWords.domNode.tabIndex, -1, 'Whole words toggle should have tabIndex -1');
		assert.strictEqual(regex.domNode.tabIndex, -1, 'Regex toggle should have tabIndex -1');
		assert.strictEqual(additionalToggles[0].domNode.tabIndex, -1, 'Additional toggle 1 should have tabIndex -1');
		assert.strictEqual(additionalToggles[1].domNode.tabIndex, -1, 'Additional toggle 2 should have tabIndex -1');
	});

	test('Toggle focus group: updating additional toggles maintains focus group behavior', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		store.add({ dispose: () => container.remove() });

		const initialToggles = [
			store.add(new Toggle({ title: 'Toggle 1', isChecked: false, ...unthemedToggleStyles }))
		];

		const findInput = store.add(new FindInput(container, undefined, {
			label: 'test',
			inputBoxStyles: unthemedInboxStyles,
			toggleStyles: unthemedToggleStyles,
			additionalToggles: initialToggles
		}));

		// Verify initial state
		assert.strictEqual(initialToggles[0].domNode.tabIndex, 0, 'First toggle should have tabIndex 0');

		// Update with new toggles
		const newToggles = [
			store.add(new Toggle({ title: 'New Toggle 1', isChecked: false, ...unthemedToggleStyles })),
			store.add(new Toggle({ title: 'New Toggle 2', isChecked: false, ...unthemedToggleStyles }))
		];
		findInput.setAdditionalToggles(newToggles);

		// Verify that only the first toggle is tabbable after update
		assert.strictEqual(newToggles[0].domNode.tabIndex, 0, 'First new toggle should have tabIndex 0');
		assert.strictEqual(newToggles[1].domNode.tabIndex, -1, 'Second new toggle should have tabIndex -1');
	});

	test('Toggle focus group with only common toggles and no additional toggles', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		store.add({ dispose: () => container.remove() });

		const findInput = store.add(new FindInput(container, undefined, {
			label: 'test',
			inputBoxStyles: unthemedInboxStyles,
			toggleStyles: unthemedToggleStyles,
			showCommonFindToggles: true
			// No additionalToggles provided
		}));

		// Get the common toggles from the findInput instance
		const caseSensitive = (findInput as any).caseSensitive;
		const wholeWords = (findInput as any).wholeWords;
		const regex = (findInput as any).regex;

		// Verify that only the first toggle is tabbable
		assert.strictEqual(caseSensitive.domNode.tabIndex, 0, 'Case sensitive toggle should have tabIndex 0');
		assert.strictEqual(wholeWords.domNode.tabIndex, -1, 'Whole words toggle should have tabIndex -1');
		assert.strictEqual(regex.domNode.tabIndex, -1, 'Regex toggle should have tabIndex -1');
	});
});
