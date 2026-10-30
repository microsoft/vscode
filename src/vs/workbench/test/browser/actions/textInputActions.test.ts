/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../base/browser/dom.js';
import { IContextMenuDelegate } from '../../../../base/browser/contextmenu.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestClipboardService } from '../../../../platform/clipboard/test/common/testClipboardService.js';
import { ContextMenuHandler } from '../../../../platform/contextview/browser/contextMenuHandler.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { ContextViewService } from '../../../../platform/contextview/browser/contextViewService.js';
import { MockKeybindingService } from '../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { TestNotificationService } from '../../../../platform/notification/test/common/testNotificationService.js';
import { NullTelemetryService } from '../../../../platform/telemetry/common/telemetryUtils.js';
import { createTextInputActions, TextInputActionsProvider } from '../../../browser/actions/textInputActions.js';
import { TestLayoutService } from '../workbenchTestServices.js';

suite('Text input actions', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createProvider() {
		const delegates: IContextMenuDelegate[] = [];
		const contextMenuService = upcastPartial<IContextMenuService>({
			showContextMenu: delegate => { delegates.push(delegate as IContextMenuDelegate); }
		});
		store.add(new TextInputActionsProvider(new TestLayoutService(), contextMenuService, new TestClipboardService(), new NullLogService()));
		return delegates;
	}

	function appendToBody<T extends HTMLElement>(element: T): T {
		mainWindow.document.body.appendChild(element);
		store.add(toDisposable(() => element.remove()));
		return element;
	}

	function rightClick(target: HTMLElement): MouseEvent {
		const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 });
		target.dispatchEvent(event);
		return event;
	}

	test('hosts the menu as a popover at the right-clicked input\'s parent', () => {
		const delegates = createProvider();
		const owner = appendToBody($('.owner'));
		const input = owner.appendChild($('input'));
		const textarea = owner.appendChild($('textarea'));

		const inputEvent = rightClick(input);
		rightClick(textarea);

		assert.deepStrictEqual(delegates.map(d => ({ domForShadowRoot: d.domForShadowRoot === owner, hostAsPopover: d.hostAsPopover, context: d.getActionsContext?.() })), [
			{ domForShadowRoot: true, hostAsPopover: true, context: input },
			{ domForShadowRoot: true, hostAsPopover: true, context: textarea },
		]);
		assert.strictEqual(inputEvent.defaultPrevented, true);
	});

	test('ignores non-input targets and prevented events', () => {
		const delegates = createProvider();
		const owner = appendToBody($('.owner'));
		const div = owner.appendChild($('div'));
		const input = owner.appendChild($('input'));
		input.addEventListener('contextmenu', e => e.preventDefault());

		rightClick(div);
		rightClick(input);

		assert.strictEqual(delegates.length, 0);
	});

	test('the menu for an ordinary input opens in its parent and leaves nothing behind when closed', () => {
		const delegates = createProvider();
		const owner = appendToBody($('.owner'));
		const input = owner.appendChild($('input')) as HTMLInputElement;
		input.focus();
		rightClick(input);

		const contextViewService = store.add(new ContextViewService(new TestLayoutService()));
		const handler = new ContextMenuHandler(contextViewService, NullTelemetryService, new TestNotificationService(), new MockKeybindingService());
		handler.showContextMenu(delegates[0]);
		const host = owner.querySelector('.shadow-root-host') as HTMLElement | null;
		const open = {
			hostInOwner: !!host,
			popoverOpen: !!host?.matches(':popover-open'),
			block: !!host?.shadowRoot?.querySelector('.context-view-block'),
		};
		contextViewService.hideContextView();

		assert.deepStrictEqual({
			open,
			afterHide: {
				popoverOpen: !!host?.matches(':popover-open'),
				hostConnected: !!host?.isConnected,
				ownerChildren: Array.from(owner.children).map(child => child.tagName),
				value: input.value,
				focus: mainWindow.document.activeElement === input
			}
		}, {
			open: { hostInOwner: true, popoverOpen: true, block: false },
			afterHide: { popoverOpen: false, hostConnected: false, ownerChildren: ['INPUT'], value: '', focus: true }
		});

		// Reopening attaches the menu to the owner again
		handler.showContextMenu(delegates[0]);
		const reopened = { inOwner: host?.parentElement === owner, popoverOpen: !!host?.matches(':popover-open') };
		contextViewService.hideContextView();
		assert.deepStrictEqual({ reopened, ownerChildren: Array.from(owner.children).map(child => child.tagName) }, { reopened: { inOwner: true, popoverOpen: true }, ownerChildren: ['INPUT'] });
	});

	async function paste(clipboardText: string | Error) {
		const clipboardService = new TestClipboardService();
		if (typeof clipboardText === 'string') {
			await clipboardService.writeText(clipboardText);
		} else {
			clipboardService.readText = () => Promise.reject(clipboardText);
		}
		const input = appendToBody(mainWindow.document.createElement('input'));
		input.value = 'harmless';
		input.setSelectionRange(2, 5);
		let inputEvents = 0;
		input.addEventListener('input', () => inputEvents++);
		const action = createTextInputActions(clipboardService, new NullLogService()).find(action => action.id === 'editor.action.clipboardPasteAction')!;
		await action.run(input);
		return { value: input.value, selection: [input.selectionStart, input.selectionEnd], inputEvents };
	}

	test('paste replaces the selection with the clipboard text', async () => {
		assert.deepStrictEqual(await paste('XY'), { value: 'haXYess', selection: [4, 4], inputEvents: 1 });
	});

	test('paste keeps the value and selection when the clipboard is empty', async () => {
		assert.deepStrictEqual(await paste(''), { value: 'harmless', selection: [2, 5], inputEvents: 0 });
	});

	test('paste keeps the value and selection when reading the clipboard is denied', async () => {
		assert.deepStrictEqual(await paste(new DOMException('Read permission denied.', 'NotAllowedError')), { value: 'harmless', selection: [2, 5], inputEvents: 0 });
	});
});
