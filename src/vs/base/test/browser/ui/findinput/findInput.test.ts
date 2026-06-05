/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../browser/window.js';
import { FindInput } from '../../../../browser/ui/findinput/findInput.js';
import { unthemedToggleStyles } from '../../../../browser/ui/toggle/toggle.js';
import { unthemedInboxStyles } from '../../../../browser/ui/inputbox/inputBox.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

function dispatchKeydown(element: HTMLElement, keyCode: number): void {
	const keyboardEvent = new KeyboardEvent('keydown', { bubbles: true });
	Object.defineProperty(keyboardEvent, 'keyCode', { get: () => keyCode });
	element.dispatchEvent(keyboardEvent);
}

// Native keyCodes consumed by StandardKeyboardEvent (see KEY_CODE_MAP in keyCodes.ts).
const KEY_LEFT = 37;
const KEY_RIGHT = 39;
const KEY_ESCAPE = 27;

suite('FindInput', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let container: HTMLElement;

	setup(() => {
		container = document.createElement('div');
		mainWindow.document.body.appendChild(container);
	});

	teardown(() => {
		container.remove();
	});

	/**
	 * Exposes the protected option-navigation hook and mirrors the override
	 * pattern used by `NotebookFindInput`: non-focusable toggles are skipped and
	 * an extra focusable control (modelling the filter button) can be appended.
	 */
	class TestFindInput extends FindInput {
		public extraControl: HTMLElement | undefined;

		public navigationElements(): HTMLElement[] {
			return this.getOptionNavigationElements();
		}

		public toggles() {
			return { caseSensitive: this.caseSensitive!, wholeWords: this.wholeWords!, regex: this.regex! };
		}

		public get controlsContainer(): HTMLElement {
			return this.controls;
		}

		protected override getOptionNavigationElements(): HTMLElement[] {
			const elements = super.getOptionNavigationElements().filter(element => this.isFocusable(element));
			if (this.extraControl && this.isFocusable(this.extraControl)) {
				elements.push(this.extraControl);
			}
			return elements;
		}

		private isFocusable(element: HTMLElement): boolean {
			return element.tabIndex >= 0 && element.getAttribute('aria-disabled') !== 'true';
		}
	}

	function createInput(): TestFindInput {
		const input = store.add(new TestFindInput(container, undefined, {
			label: 'test',
			showCommonFindToggles: true,
			toggleStyles: unthemedToggleStyles,
			inputBoxStyles: unthemedInboxStyles
		}));
		return input;
	}

	test('getOptionNavigationElements() returns the common toggles in order', () => {
		const input = createInput();
		const { caseSensitive, wholeWords, regex } = input.toggles();

		assert.deepStrictEqual(input.navigationElements(), [
			caseSensitive.domNode,
			wholeWords.domNode,
			regex.domNode
		]);
	});

	test('right arrow cycles focus forward through the toggles and wraps around', () => {
		const input = createInput();
		const { caseSensitive, wholeWords, regex } = input.toggles();

		caseSensitive.domNode.focus();
		assert.strictEqual(mainWindow.document.activeElement, caseSensitive.domNode);

		dispatchKeydown(caseSensitive.domNode, KEY_RIGHT);
		assert.strictEqual(mainWindow.document.activeElement, wholeWords.domNode);

		dispatchKeydown(wholeWords.domNode, KEY_RIGHT);
		assert.strictEqual(mainWindow.document.activeElement, regex.domNode);

		// wraps back to the first toggle
		dispatchKeydown(regex.domNode, KEY_RIGHT);
		assert.strictEqual(mainWindow.document.activeElement, caseSensitive.domNode);
	});

	test('left arrow cycles focus backward through the toggles and wraps around', () => {
		const input = createInput();
		const { caseSensitive, wholeWords, regex } = input.toggles();

		caseSensitive.domNode.focus();

		// wraps to the last toggle
		dispatchKeydown(caseSensitive.domNode, KEY_LEFT);
		assert.strictEqual(mainWindow.document.activeElement, regex.domNode);

		dispatchKeydown(regex.domNode, KEY_LEFT);
		assert.strictEqual(mainWindow.document.activeElement, wholeWords.domNode);
	});

	test('escape blurs the focused toggle and returns focus to the input box', () => {
		const input = createInput();
		const { wholeWords } = input.toggles();

		wholeWords.domNode.focus();
		assert.strictEqual(mainWindow.document.activeElement, wholeWords.domNode);

		dispatchKeydown(wholeWords.domNode, KEY_ESCAPE);
		assert.strictEqual(mainWindow.document.activeElement, input.inputBox.inputElement);
	});

	test('arrow navigation reaches an additional focusable control appended by a subclass', () => {
		const input = createInput();
		const { caseSensitive, wholeWords, regex } = input.toggles();

		// Model the notebook find widget's filter button: an extra focusable
		// control that the override adds to the navigation order.
		const filterButton = document.createElement('a');
		filterButton.tabIndex = 0;
		input.controlsContainer.appendChild(filterButton);
		input.extraControl = filterButton;

		assert.deepStrictEqual(input.navigationElements(), [
			caseSensitive.domNode,
			wholeWords.domNode,
			regex.domNode,
			filterButton
		]);

		// Right arrow from the last toggle now lands on the filter button.
		regex.domNode.focus();
		dispatchKeydown(regex.domNode, KEY_RIGHT);
		assert.strictEqual(mainWindow.document.activeElement, filterButton);

		// And it is part of the cycle: another right arrow wraps to the first toggle.
		dispatchKeydown(filterButton, KEY_RIGHT);
		assert.strictEqual(mainWindow.document.activeElement, caseSensitive.domNode);
	});

	test('arrow navigation skips a toggle that has been removed from the tab order', () => {
		const input = createInput();
		const { caseSensitive, wholeWords, regex } = input.toggles();

		// The notebook widget sets regex.domNode.tabIndex = -1 when filters are
		// active; such non-focusable controls must be skipped.
		regex.domNode.tabIndex = -1;

		assert.deepStrictEqual(input.navigationElements(), [
			caseSensitive.domNode,
			wholeWords.domNode
		]);

		// Right arrow from the last focusable toggle wraps directly to the first,
		// never landing on the non-focusable regex toggle.
		wholeWords.domNode.focus();
		dispatchKeydown(wholeWords.domNode, KEY_RIGHT);
		assert.strictEqual(mainWindow.document.activeElement, caseSensitive.domNode);
	});
});
