/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { SessionsListNotice } from '../../browser/views/sessionsListNotice.js';

suite('SessionsListNotice', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	test('keyboard actions are labelled and Escape dismisses back to the list', () => {
		const list = document.createElement('button');
		document.body.appendChild(list);
		disposables.add(toDisposable(() => list.remove()));
		const actions: string[] = [];
		const notice = disposables.add(new SessionsListNotice({
			description: 'A session suggestion', label: 'Continue', disableLabel: 'Don\'t Show Again',
			run: () => actions.push('continue'), disable: () => actions.push('disable'), dismiss: () => actions.push('dismiss'),
			focusSessionsList: () => list.focus(),
		}));
		document.body.appendChild(notice.domNode);
		disposables.add(toDisposable(() => notice.domNode.remove()));
		const buttons = [...notice.domNode.querySelectorAll<HTMLElement>('[role="button"], button')];
		for (const button of buttons) {
			button.focus();
			button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
			assert.strictEqual(document.activeElement, list);
		}
		for (const keyCode of [13, 32]) {
			buttons[0].focus();
			buttons[0].dispatchEvent(new KeyboardEvent('keydown', { keyCode, bubbles: true }));
			assert.strictEqual(document.activeElement, list);
		}
		buttons.find(button => button.textContent === 'Continue')!.click();
		buttons.find(button => button.textContent === 'Don\'t Show Again')!.click();
		assert.deepStrictEqual({
			actions, focusReturned: document.activeElement === list,
			role: notice.domNode.getAttribute('role'), label: notice.domNode.getAttribute('aria-label'),
			dismissLabel: buttons[0].getAttribute('aria-label'),
			keyboardAccessible: buttons.length === 3 && buttons.every(button => button.tabIndex === 0),
		}, {
			actions: ['dismiss', 'dismiss', 'dismiss', 'dismiss', 'dismiss', 'continue', 'disable'], focusReturned: true,
			role: 'region', label: 'Continue', dismissLabel: 'Dismiss Suggestion', keyboardAccessible: true,
		});
	});
});
