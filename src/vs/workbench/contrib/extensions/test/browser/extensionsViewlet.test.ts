/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import '../../../../browser/media/style.css';
import '../../browser/media/extensionsViewlet.css';

suite('Extensions viewlet focus styles', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	setup(function () {
		// Hidden Electron windows do not match focus pseudo-classes; run these tests in a browser.
		if (!mainWindow.document.hasFocus()) {
			this.skip();
		}
	});

	for (const theme of ['vs', 'vs-dark', 'hc-black', 'hc-light']) {
		test(`notification action has a separated focus outline in ${theme}`, () => {
			const container = append(mainWindow.document.body, $(`.monaco-workbench.${theme}`));
			store.add(toDisposable(() => container.remove()));
			container.style.setProperty('--vscode-focusBorder', '#0078d4');
			container.style.setProperty('--vscode-button-background', '#0078d4');
			container.style.setProperty('--vscode-button-foreground', '#ffffff');
			container.style.setProperty('--vscode-strokeThickness', '1px');

			const header = append(append(container, $('.extensions-viewlet')), $('.header'));
			const notification = append(header, $('.notification-container'));
			const actions = append(notification, $('.notification-actions'));
			const action = append(actions, $('span.message-action-button', { tabindex: '0', role: 'button' }, 'Restart Extensions'));
			const input = append(container, $('input', { type: 'text' }));
			input.focus();
			action.focus();

			const style = mainWindow.getComputedStyle(action);
			assert.deepStrictEqual({
				focused: mainWindow.document.activeElement === action,
				focusVisible: action.matches(':focus-visible'),
				outlineStyle: style.outlineStyle,
				outlineWidth: style.outlineWidth,
				outlineColor: style.outlineColor,
				outlineOffset: style.outlineOffset,
			}, {
				focused: true,
				focusVisible: true,
				outlineStyle: 'solid',
				outlineWidth: '1px',
				outlineColor: 'rgb(0, 120, 212)',
				outlineOffset: '2px',
			});
		});
	}
});
