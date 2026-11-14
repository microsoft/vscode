/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { StandardKeyboardEvent } from '../../../../browser/keyboardEvent.js';
import { navigateToggles } from '../../../../browser/ui/findinput/findInputToggles.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

const ESCAPE = 27;
const LEFT_ARROW = 37;
const RIGHT_ARROW = 39;
const KEY_A = 65;

suite('navigateToggles', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	let container: HTMLElement;
	let toggles: HTMLElement[];

	function keydown(keyCode: number): StandardKeyboardEvent {
		// `keyCode` is legacy but is what `StandardKeyboardEvent` reads, so it has to be set explicitly.
		const init: KeyboardEventInit & { keyCode: number } = { keyCode };
		const event = new KeyboardEvent('keydown', init);
		Object.defineProperty(event, 'keyCode', { get: () => init.keyCode });
		return new StandardKeyboardEvent(event);
	}

	setup(() => {
		container = document.createElement('div');
		toggles = [0, 1, 2].map(() => {
			const toggle = document.createElement('div');
			toggle.tabIndex = 0;
			container.appendChild(toggle);
			return toggle;
		});
		document.body.appendChild(container);
	});

	teardown(() => {
		container.remove();
	});

	test('right arrow moves to the next toggle and wraps around', () => {
		toggles[0].focus();
		navigateToggles(keydown(RIGHT_ARROW), container, () => toggles, () => { });
		assert.strictEqual(container.ownerDocument.activeElement, toggles[1]);

		toggles[2].focus();
		navigateToggles(keydown(RIGHT_ARROW), container, () => toggles, () => { });
		assert.strictEqual(container.ownerDocument.activeElement, toggles[0]);
	});

	test('left arrow moves to the previous toggle and wraps around', () => {
		toggles[2].focus();
		navigateToggles(keydown(LEFT_ARROW), container, () => toggles, () => { });
		assert.strictEqual(container.ownerDocument.activeElement, toggles[1]);

		toggles[0].focus();
		navigateToggles(keydown(LEFT_ARROW), container, () => toggles, () => { });
		assert.strictEqual(container.ownerDocument.activeElement, toggles[2]);
	});

	test('escape gives the focus back to the input', () => {
		toggles[1].focus();

		let inputFocused = false;
		navigateToggles(keydown(ESCAPE), container, () => toggles, () => { inputFocused = true; });

		assert.strictEqual(inputFocused, true);
		assert.notStrictEqual(container.ownerDocument.activeElement, toggles[1]);
	});

	test('does nothing when the focus is not on a toggle', () => {
		const outsider = document.createElement('div');
		outsider.tabIndex = 0;
		container.appendChild(outsider);
		outsider.focus();

		navigateToggles(keydown(RIGHT_ARROW), container, () => toggles, () => { });

		assert.strictEqual(container.ownerDocument.activeElement, outsider);
	});

	test('the toggles are only resolved for the keys that navigate', () => {
		toggles[0].focus();

		let resolved = 0;
		function getToggles(): HTMLElement[] {
			resolved++;

			return toggles;
		}

		navigateToggles(keydown(KEY_A), container, getToggles, () => { });
		assert.strictEqual(resolved, 0, 'typing should not resolve the toggles');

		navigateToggles(keydown(RIGHT_ARROW), container, getToggles, () => { });
		assert.strictEqual(resolved, 1);
	});
});
