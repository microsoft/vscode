/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, getActiveElement } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Action, Separator } from '../../../../base/common/actions.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ContextMenuHandler } from '../../browser/contextMenuHandler.js';
import { IContextViewDelegate, IContextViewService } from '../../browser/contextView.js';
import { ContextViewDOMPosition } from '../../../../base/browser/ui/contextview/contextview.js';
import { MockKeybindingService } from '../../../keybinding/test/common/mockKeybindingService.js';
import { TestNotificationService } from '../../../notification/test/common/testNotificationService.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';

suite('ContextMenuHandler', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const [selection, expected] of [
		[undefined, undefined],
		[false, undefined],
		[true, 'First'],
		[0, 'First'],
		[2, 'Second'],
		[-1, undefined],
		[NaN, undefined],
		[Infinity, undefined],
		[-Infinity, undefined],
		[0.5, undefined],
		[3, undefined],
	] as const) {
		test(`normalizes HTML menu selection ${selection} to ${expected}`, () => {
			const container = mainWindow.document.body.appendChild($('div'));
			store.add(toDisposable(() => container.remove()));
			const contextViewService = upcastPartial<IContextViewService>({
				showContextView: delegate => {
					store.add(delegate.render(container));
					delegate.focus?.();
					return { close: () => delegate.onHide?.() };
				},
			});
			const handler = new ContextMenuHandler(contextViewService, NullTelemetryService, new TestNotificationService(), new MockKeybindingService());
			const actions = [store.add(new Action('first', 'First')), new Separator(), store.add(new Action('second', 'Second'))];
			handler.showContextMenu({
				getAnchor: () => container,
				getActions: () => actions,
				autoSelectItem: selection,
			});

			assert.strictEqual(getActiveElement()?.closest('.action-item')?.textContent, expected);
		});
	}

	suite('popover hosting', () => {
		function showMenu(domPosition: ContextViewDOMPosition | undefined, hostAsPopover: boolean | undefined) {
			const container = mainWindow.document.body.appendChild($('div'));
			const previous = mainWindow.document.body.appendChild($('input')) as HTMLInputElement;
			store.add(toDisposable(() => { container.remove(); previous.remove(); }));
			previous.focus();
			const delegates: IContextViewDelegate[] = [];
			let close: () => void = () => { };
			const contextViewService = upcastPartial<IContextViewService>({
				showContextView: delegate => {
					delegates.push(delegate);
					store.add(delegate.render(container, domPosition === undefined ? undefined : { domPosition }));
					delegate.focus?.();
					close = () => delegate.onHide?.();
					return { close };
				},
				hideContextView: () => close(),
			});
			const handler = new ContextMenuHandler(contextViewService, NullTelemetryService, new TestNotificationService(), new MockKeybindingService());
			const actions = [store.add(new Action('first', 'First'))];
			handler.showContextMenu({
				getAnchor: () => container,
				getActions: () => actions,
				hostAsPopover,
			});
			const focusInMenu = container.contains(getActiveElement());
			const hasBlock = !!container.querySelector('.context-view-block');
			close();
			return {
				hostAsPopover: delegates.map(d => d.hostAsPopover),
				hasBlock,
				focusInMenu,
				focusReturned: getActiveElement() === previous,
			};
		}

		test('passes hostAsPopover to the context view and renders no mouse block or focus return when hosted as a popover', () => {
			assert.deepStrictEqual(showMenu(ContextViewDOMPosition.POPOVER, true), {
				hostAsPopover: [true],
				hasBlock: false,
				focusInMenu: true,
				focusReturned: false
			});
			assert.deepStrictEqual(showMenu(ContextViewDOMPosition.POPOVER_SHADOW, true).hasBlock, false);
		});

		test('keeps the mouse block and focus return when a requested popover falls back to a fixed position', () => {
			assert.deepStrictEqual(showMenu(ContextViewDOMPosition.FIXED, true), {
				hostAsPopover: [true],
				hasBlock: true,
				focusInMenu: true,
				focusReturned: true
			});
		});

		test('keeps the legacy mouse block and focus return when not hosted as a popover', () => {
			for (const domPosition of [undefined, ContextViewDOMPosition.FIXED, ContextViewDOMPosition.ABSOLUTE]) {
				assert.deepStrictEqual(showMenu(domPosition, undefined), {
					hostAsPopover: [undefined],
					hasBlock: true,
					focusInMenu: true,
					focusReturned: true
				});
			}
		});

	});
});
