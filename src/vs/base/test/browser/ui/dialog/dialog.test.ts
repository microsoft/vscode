/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Dialog, IDialogOptions, IDialogResult, IDialogStyles } from '../../../../browser/ui/dialog/dialog.js';
import { IButtonStyles } from '../../../../browser/ui/button/button.js';
import { ICheckboxStyles } from '../../../../browser/ui/toggle/toggle.js';
import { IInputBoxStyles } from '../../../../browser/ui/inputbox/inputBox.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

function getTestDialogOptions(overrides?: Partial<IDialogOptions>): IDialogOptions {
	const buttonStyles: IButtonStyles = {
		buttonForeground: undefined,
		buttonSeparator: undefined,
		buttonBackground: undefined,
		buttonHoverBackground: undefined,
		buttonSecondaryForeground: undefined,
		buttonSecondaryBackground: undefined,
		buttonSecondaryHoverBackground: undefined,
		buttonSecondaryBorder: undefined,
		buttonBorder: undefined,
	};

	const checkboxStyles: ICheckboxStyles = {
		checkboxBackground: undefined,
		checkboxBorder: undefined,
		checkboxForeground: undefined,
		checkboxDisabledBackground: undefined,
		checkboxDisabledForeground: undefined,
	};

	const inputBoxStyles: IInputBoxStyles = {
		inputBackground: undefined,
		inputForeground: undefined,
		inputBorder: undefined,
		inputValidationInfoBorder: undefined,
		inputValidationInfoBackground: undefined,
		inputValidationInfoForeground: undefined,
		inputValidationWarningBorder: undefined,
		inputValidationWarningBackground: undefined,
		inputValidationWarningForeground: undefined,
		inputValidationErrorBorder: undefined,
		inputValidationErrorBackground: undefined,
		inputValidationErrorForeground: undefined,
	};

	const dialogStyles: IDialogStyles = {
		dialogForeground: undefined,
		dialogBackground: undefined,
		dialogShadow: undefined,
		dialogBorder: undefined,
		errorIconForeground: undefined,
		warningIconForeground: undefined,
		infoIconForeground: undefined,
		textLinkForeground: undefined,
	};

	return {
		type: 'warning',
		buttonStyles,
		checkboxStyles,
		inputBoxStyles,
		dialogStyles,
		...overrides,
	};
}

/**
 * Find a button element by its label text within the container.
 */
function findButtonByLabel(container: HTMLElement, label: string): HTMLElement | undefined {
	const buttons = container.querySelectorAll('.monaco-button');
	for (const button of buttons) {
		if (button.textContent?.trim() === label) {
			return button as HTMLElement;
		}
	}
	return undefined;
}

suite('Dialog', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let container: HTMLElement;

	setup(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
	});

	teardown(() => {
		container.remove();
	});

	test('Enter key activates a non-default focused button', async () => {
		// Simulate the checkout dialog: three action buttons
		// The first button (index 0) is the default, but we want to
		// verify that pressing Enter when a different button is focused
		// activates that focused button instead.
		const dialog = store.add(new Dialog(
			container,
			'Your local changes would be overwritten by checkout.',
			['Stash & Checkout', 'Migrate Changes', 'Force Checkout'],
			getTestDialogOptions({ cancelId: undefined })
		));

		const resultPromise = dialog.show();

		// Find the "Force Checkout" button by its label (platform-independent)
		const forceCheckoutButton = findButtonByLabel(container, 'Force Checkout');
		assert.ok(forceCheckoutButton, 'Force Checkout button should exist in the dialog');

		// Focus the Force Checkout button
		forceCheckoutButton.focus();

		// Simulate Enter keydown event on the focused button
		const enterEvent = new KeyboardEvent('keydown', {
			key: 'Enter',
			code: 'Enter',
			keyCode: 13,
			bubbles: true,
			cancelable: true,
		});
		forceCheckoutButton.dispatchEvent(enterEvent);

		const result: IDialogResult = await resultPromise;

		// The result should be button index 2 (Force Checkout),
		// not index 0 (Stash & Checkout) which is the default
		assert.strictEqual(result.button, 2,
			'Enter key should activate the focused button (Force Checkout at index 2), not the default button');
	});

	test('Enter key activates the default focused button', async () => {
		const dialog = store.add(new Dialog(
			container,
			'Test message',
			['OK', 'Cancel'],
			getTestDialogOptions({ cancelId: 1 })
		));

		const resultPromise = dialog.show();

		// The OK button (index 0) should be focused by default
		const okButton = findButtonByLabel(container, 'OK');
		assert.ok(okButton, 'OK button should exist in the dialog');

		// Verify it has focus (it's the default button)
		// Simulate Enter keydown event
		const enterEvent = new KeyboardEvent('keydown', {
			key: 'Enter',
			code: 'Enter',
			keyCode: 13,
			bubbles: true,
			cancelable: true,
		});
		okButton.dispatchEvent(enterEvent);

		const result: IDialogResult = await resultPromise;

		// The result should be button index 0 (OK)
		assert.strictEqual(result.button, 0,
			'Enter key should activate the default focused button (OK at index 0)');
	});
});
