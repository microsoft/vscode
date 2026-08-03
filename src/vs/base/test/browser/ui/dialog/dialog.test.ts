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
		let contentEditable!: HTMLDivElement;
		const dialog = disposables.add(new Dialog(container, 'Message', ['Save', 'Cancel'], {
			renderBody: body => {
				textarea = append(body, $('textarea'));
				contentEditable = append(body, $('div'));
				contentEditable.contentEditable = 'true';
			},
			buttonStyles: unthemedButtonStyles,
			checkboxStyles: unthemedCheckboxStyles,
			inputBoxStyles: unthemedInboxStyles,
			dialogStyles: unthemedDialogStyles,
		}));
		const result = dialog.show();

		const dispatchArrowRight = (target: HTMLElement) => {
			target.focus();
			const event = new (getWindow(target).KeyboardEvent)('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
			target.dispatchEvent(event);
			return {
				activeElement: getWindow(target).document.activeElement,
				defaultPrevented: event.defaultPrevented,
			};
		};

		assert.deepStrictEqual({
			textarea: dispatchArrowRight(textarea),
			contentEditable: dispatchArrowRight(contentEditable),
		}, {
			textarea: { activeElement: textarea, defaultPrevented: false },
			contentEditable: { activeElement: contentEditable, defaultPrevented: false },
		});

		dialog.dispose();
		await result;
	});
});
