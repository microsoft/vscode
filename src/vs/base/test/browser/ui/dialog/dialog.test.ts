/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append, getWindow } from '../../../../browser/dom.js';
import { unthemedButtonStyles } from '../../../../browser/ui/button/button.js';
import { Dialog, IDialogStyles } from '../../../../browser/ui/dialog/dialog.js';
import { unthemedInboxStyles } from '../../../../browser/ui/inputbox/inputBox.js';
import { ICheckboxStyles } from '../../../../browser/ui/toggle/toggle.js';
import { toDisposable } from '../../../../common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

const unthemedDialogStyles: IDialogStyles = {
	dialogForeground: undefined,
	dialogBackground: undefined,
	dialogShadow: undefined,
	dialogBorder: undefined,
	errorIconForeground: undefined,
	warningIconForeground: undefined,
	infoIconForeground: undefined,
	textLinkForeground: undefined,
};

const unthemedCheckboxStyles: ICheckboxStyles = {
	checkboxBackground: undefined,
	checkboxBorder: undefined,
	checkboxForeground: undefined,
	checkboxDisabledBackground: undefined,
	checkboxDisabledForeground: undefined,
};

suite('Dialog', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps horizontal arrow keys in editable custom body controls', async () => {
		const container = append(document.body, $('.test-dialog-container'));
		disposables.add(toDisposable(() => container.remove()));
		let textarea!: HTMLTextAreaElement;
		const dialog = disposables.add(new Dialog(container, 'Message', ['Save', 'Cancel'], {
			renderBody: body => {
				textarea = append(body, $('textarea'));
			},
			buttonStyles: unthemedButtonStyles,
			checkboxStyles: unthemedCheckboxStyles,
			inputBoxStyles: unthemedInboxStyles,
			dialogStyles: unthemedDialogStyles,
		}));
		const result = dialog.show();
		textarea.focus();

		const event = new (getWindow(textarea).KeyboardEvent)('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
		textarea.dispatchEvent(event);

		assert.deepStrictEqual({
			activeElement: getWindow(textarea).document.activeElement,
			defaultPrevented: event.defaultPrevented,
		}, {
			activeElement: textarea,
			defaultPrevented: false,
		});

		dialog.dispose();
		await result;
	});
});
