/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getWindow } from '../../../base/browser/dom.js';
import { ensureCodeWindow, mainWindow } from '../../../base/browser/window.js';
import { timeout } from '../../../base/common/async.js';
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { ChatPillsRow } from '../../browser/chatPills.js';

suite('ChatPills', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps an empty compact pill row keyboard-accessible', async () => {
		const disposables = store.add(new DisposableStore());
		const row = disposables.add(new ChatPillsRow('ChatPills.test', { compact: true }));
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
			compact: row.element.classList.contains('compact'),
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

		assert.deepStrictEqual({
			emptyState,
			restored: {
				role: row.content.getAttribute('role'),
				ariaLabel: row.content.getAttribute('aria-label'),
				tabIndex: row.content.getAttribute('tabindex'),
				pillFocused: mainWindow.document.activeElement === pill,
			},
		}, {
			emptyState: {
				compact: true,
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
			},
		});

		disposables.dispose();
	});

	test('creates the row in its target window realm', () => {
		const disposables = store.add(new DisposableStore());
		const iframe = mainWindow.document.createElement('iframe');
		mainWindow.document.body.appendChild(iframe);
		disposables.add(toDisposable(() => iframe.remove()));
		const auxiliaryWindow = iframe.contentWindow!;
		ensureCodeWindow(auxiliaryWindow, 999);

		const row = disposables.add(new ChatPillsRow('ChatPills.auxiliaryWindowTest', { targetWindow: auxiliaryWindow }));
		auxiliaryWindow.document.body.appendChild(row.element);

		assert.deepStrictEqual({
			contentDocument: row.content.ownerDocument === auxiliaryWindow.document,
			elementDocument: row.element.ownerDocument === auxiliaryWindow.document,
			windowId: getWindow(row.content).vscodeWindowId,
		}, {
			contentDocument: true,
			elementDocument: true,
			windowId: 999,
		});

		disposables.dispose();
	});

	test('compact rows collapse pill details while retaining icons', () => {
		const disposables = store.add(new DisposableStore());
		const row = disposables.add(new ChatPillsRow('ChatPills.compactTest', { compact: true }));
		mainWindow.document.body.appendChild(row.element);
		disposables.add(toDisposable(() => row.element.remove()));

		const button = mainWindow.document.createElement('button');
		button.className = 'monaco-button chat-pill-button chat-resource-pill-button';
		const item = mainWindow.document.createElement('div');
		item.className = 'chat-pill-item';
		const icon = mainWindow.document.createElement('span');
		icon.className = 'chat-pill-icon';
		const label = mainWindow.document.createElement('span');
		label.className = 'chat-pill-label';
		const counter = mainWindow.document.createElement('div');
		counter.className = 'monaco-animated-counter';
		const chevron = mainWindow.document.createElement('span');
		chevron.className = 'chat-pill-chevron';
		const resourceIcon = mainWindow.document.createElement('span');
		resourceIcon.className = 'chat-resource-pill-compact-icon';
		const resourceName = mainWindow.document.createElement('span');
		resourceName.className = 'monaco-icon-label';
		button.append(icon, label, counter, chevron, resourceIcon, resourceName);
		item.appendChild(button);
		row.content.appendChild(item);

		const compactState = {
			iconVisible: mainWindow.getComputedStyle(icon).display !== 'none',
			labelVisible: mainWindow.getComputedStyle(label).display !== 'none',
			counterVisible: mainWindow.getComputedStyle(counter).display !== 'none',
			chevronVisible: mainWindow.getComputedStyle(chevron).display !== 'none',
			resourceIconVisible: mainWindow.getComputedStyle(resourceIcon).display !== 'none',
			resourceNameVisible: mainWindow.getComputedStyle(resourceName).display !== 'none',
		};
		row.element.classList.remove('compact');

		assert.deepStrictEqual({
			compactState,
			expandedResourceIconVisible: mainWindow.getComputedStyle(resourceIcon).display !== 'none',
		}, {
			compactState: {
				iconVisible: true,
				labelVisible: false,
				counterVisible: false,
				chevronVisible: false,
				resourceIconVisible: true,
				resourceNameVisible: false,
			},
			expandedResourceIconVisible: false,
		});

		disposables.dispose();
	});

	test('automatic compact mode follows available width', () => {
		const disposables = store.add(new DisposableStore());
		const row = disposables.add(new ChatPillsRow('ChatPills.responsiveTest', { compact: 'auto' }));
		row.element.style.width = '600px';
		mainWindow.document.body.appendChild(row.element);
		disposables.add(toDisposable(() => row.element.remove()));

		const item = mainWindow.document.createElement('div');
		item.className = 'chat-pill-item';
		const button = mainWindow.document.createElement('button');
		button.className = 'monaco-button chat-pill-button';
		const icon = mainWindow.document.createElement('span');
		icon.className = 'chat-pill-icon';
		const label = mainWindow.document.createElement('span');
		label.className = 'chat-pill-label';
		label.textContent = 'A detailed pill label that needs room';
		button.append(icon, label);
		item.appendChild(button);
		row.content.appendChild(item);

		row.layout();
		const wideCompact = row.element.classList.contains('compact');
		row.element.style.width = '40px';
		row.layout();
		const narrowCompact = row.element.classList.contains('compact');
		row.element.style.width = '600px';
		row.layout();

		assert.deepStrictEqual({
			wideCompact,
			narrowCompact,
			expandedAgain: !row.element.classList.contains('compact'),
		}, {
			wideCompact: false,
			narrowCompact: true,
			expandedAgain: true,
		});

		disposables.dispose();
	});
});
