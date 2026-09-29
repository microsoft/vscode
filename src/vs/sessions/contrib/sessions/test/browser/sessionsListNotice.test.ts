/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IManagedHover } from '../../../../../base/browser/ui/hover/hover.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
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
		}, upcastPartial<IHoverService>({ setupManagedHover: () => upcastPartial<IManagedHover>({ dispose: () => { } }) })));
		document.body.appendChild(notice.domNode);
		disposables.add(toDisposable(() => notice.domNode.remove()));
		const buttons = [...notice.domNode.querySelectorAll<HTMLElement>('[role="button"], button')];
		buttons.find(button => button.textContent === 'Continue')!.click();
		buttons.find(button => button.textContent === 'Don\'t Show Again')!.click();
		buttons[0].focus();
		buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		assert.deepStrictEqual({
			actions, focusReturned: document.activeElement === list,
			role: notice.domNode.getAttribute('role'), label: notice.domNode.getAttribute('aria-label'),
			dismissLabel: buttons[0].getAttribute('aria-label'),
			keyboardAccessible: buttons.length === 3 && buttons.every(button => button.tabIndex === 0),
		}, {
			actions: ['continue', 'disable', 'dismiss'], focusReturned: true,
			role: 'region', label: 'Continue', dismissLabel: 'Dismiss Suggestion', keyboardAccessible: true,
		});
	});
});
