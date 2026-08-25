/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../base/browser/window.js';
import { timeout } from '../../../base/common/async.js';
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { getChatChangesPillAriaLabel } from '../../browser/chatChangesPill.js';
import { ChatPillsRow } from '../../browser/chatPills.js';

suite('ChatPills', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps an empty pill row keyboard-accessible', async () => {
		const disposables = store.add(new DisposableStore());
		const row = disposables.add(new ChatPillsRow('ChatPills.test'));
		mainWindow.document.body.appendChild(row.element);
		disposables.add(toDisposable(() => row.element.remove()));
		let contextMenuRequests = 0;
		let contextMenuTarget: HTMLElement | undefined;
		disposables.add(row.onDidRequestContextMenu(target => {
			contextMenuRequests++;
			contextMenuTarget = target;
		}));

		row.setEmpty(true, 'Configure Session Status Pills');
		const event = new mainWindow.KeyboardEvent('keydown', { bubbles: true });
		Object.defineProperty(event, 'keyCode', { value: 13 });
		row.content.dispatchEvent(event);
		row.restoreFocus(() => []);
		await timeout(0);
		const emptyState = {
			role: row.content.getAttribute('role'),
			ariaLabel: row.content.getAttribute('aria-label'),
			tabIndex: row.content.tabIndex,
			contextMenuRequests,
			focused: mainWindow.document.activeElement === row.content,
			contextTarget: contextMenuTarget === row.content,
		};
		const pill = mainWindow.document.createElement('button');
		row.content.appendChild(pill);
		row.setEmpty(false, '');
		row.restoreFocus(() => [pill]);
		await timeout(0);
		const contextMenuEvent = new mainWindow.KeyboardEvent('keydown', { bubbles: true, shiftKey: true });
		Object.defineProperty(contextMenuEvent, 'keyCode', { value: 121 });
		pill.dispatchEvent(contextMenuEvent);

		assert.deepStrictEqual({
			emptyState,
			restored: {
				role: row.content.getAttribute('role'),
				ariaLabel: row.content.getAttribute('aria-label'),
				tabIndex: row.content.getAttribute('tabindex'),
				pillFocused: mainWindow.document.activeElement === pill,
				contextTarget: contextMenuTarget === pill,
				contextMenuRequests,
			},
			changesAriaLabel: getChatChangesPillAriaLabel('Branch Changes', { files: 3, insertions: 12, deletions: 4 }),
		}, {
			emptyState: {
				role: 'button',
				ariaLabel: 'Configure Session Status Pills',
				tabIndex: 0,
				contextMenuRequests: 1,
				focused: true,
				contextTarget: true,
			},
			restored: {
				role: null,
				ariaLabel: null,
				tabIndex: null,
				pillFocused: true,
				contextTarget: true,
				contextMenuRequests: 2,
			},
			changesAriaLabel: 'Branch Changes: 3 Files, +12, -4',
		});

		disposables.dispose();
	});
});
