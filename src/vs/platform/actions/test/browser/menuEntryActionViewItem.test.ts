/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append, ModifierKeyEmitter } from '../../../../base/browser/dom.js';
import { Menu, unthemedMenuStyles } from '../../../../base/browser/ui/menu/menu.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { toAction } from '../../../../base/common/actions.js';
import { isLinux, isWindows } from '../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ICommandService } from '../../../commands/common/commands.js';
import { MockContextKeyService, MockKeybindingService } from '../../../keybinding/test/common/mockKeybindingService.js';
import { ContextMenuService } from '../../../contextview/browser/contextMenuService.js';
import { IContextViewDelegate, IContextViewService } from '../../../contextview/browser/contextView.js';
import { TestNotificationService } from '../../../notification/test/common/testNotificationService.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { getFlatContextMenuActions } from '../../browser/menuEntryActionViewItem.js';
import { IMenuService, MenuItemAction } from '../../common/actions.js';

suite('Context menu alternative actions', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	for (const modifier of ['Alt', 'Shift'] as const) {
		test(`HTML context menus retain ${modifier} at opening and update without hover`, () => {
			const modifiers = ModifierKeyEmitter.getInstance();
			modifiers.resetKeyStatus();
			disposables.add(toDisposable(() => modifiers.resetKeyStatus()));
			const host = append(mainWindow.document.body, $('div'));
			disposables.add(toDisposable(() => host.remove()));
			let hide: (() => void) | undefined;
			const contextViewService = new class extends mock<IContextViewService>() {
				override showContextView(delegate: IContextViewDelegate) {
					const rendered = disposables.add(delegate.render(host));
					hide = () => {
						rendered.dispose();
						delegate.onHide?.(true);
					};
					return { close: () => this.hideContextView() };
				}
				override hideContextView() {
					const onHide = hide;
					hide = undefined;
					onHide?.();
				}
			};
			const service = disposables.add(new ContextMenuService(NullTelemetryService, new TestNotificationService(), contextViewService, new MockKeybindingService(), new class extends mock<IMenuService>() { }, new MockContextKeyService()));
			service.configure({ blockMouse: false });
			const action = toAction({ id: 'primary', label: 'Primary', run: () => { }, alt: toAction({ id: 'alternative', label: 'Alternative', run: () => { } }) });
			const press = () => mainWindow.dispatchEvent(new KeyboardEvent('keydown', { key: modifier, keyCode: modifier === 'Alt' ? 18 : 16, altKey: modifier === 'Alt', shiftKey: modifier === 'Shift' }));
			press();
			service.showContextMenu({ getAnchor: () => host, getActions: () => [action] });
			const labels = [host.querySelector('.action-label')?.textContent];
			mainWindow.dispatchEvent(new KeyboardEvent('keyup', { key: modifier, keyCode: modifier === 'Alt' ? 18 : 16 }));
			labels.push(host.querySelector('.action-label')?.textContent);
			press();
			labels.push(host.querySelector('.action-label')?.textContent);
			contextViewService.hideContextView();
			const alternative = modifier === 'Alt' || isWindows || isLinux ? 'Alternative' : 'Primary';
			assert.deepStrictEqual({ labels, altKey: modifiers.keyStatus.altKey, shiftKey: modifiers.keyStatus.shiftKey }, {
				labels: [alternative, 'Primary', alternative], altKey: false, shiftKey: false
			});
		});
	}

	for (const altAtOpen of [false, true]) {
		for (const altAtActivation of [false, true]) {
			test(`Alt at open: ${altAtOpen}, Alt at activation: ${altAtActivation}`, async () => {
				const modifiers = ModifierKeyEmitter.getInstance();
				const commands: unknown[][] = [];
				const action = new MenuItemAction(
					{ id: 'primary', title: 'Primary' },
					{ id: 'alternative', title: 'Alternative' },
					{ args: ['source'] }, undefined, undefined, new MockContextKeyService(),
					new class extends mock<ICommandService>() {
						override async executeCommand<T>(...args: unknown[]): Promise<T | undefined> {
							commands.push(args);
							return undefined;
						}
					}
				);
				mainWindow.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', keyCode: 18, altKey: altAtOpen }));
				try {
					const actions = getFlatContextMenuActions([['navigation', [action]]]);
					const host = append(mainWindow.document.body, $('div'));
					disposables.add(toDisposable(() => host.remove()));
					const menu = disposables.add(new Menu(host, actions, {}, unthemedMenuStyles));
					menu.focus(true);
					const labelAtOpen = host.querySelector('.action-label')?.textContent;
					mainWindow.dispatchEvent(new KeyboardEvent(altAtActivation ? 'keydown' : 'keyup', { key: 'Alt', keyCode: 18, altKey: altAtActivation }));
					const labelAtActivation = host.querySelector('.action-label')?.textContent;
					host.querySelector<HTMLElement>('.action-item')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, altKey: altAtActivation, bubbles: true }));
					await Promise.resolve();
					assert.deepStrictEqual({ labelAtOpen, labelAtActivation, commands }, {
						labelAtOpen: altAtOpen ? 'Alternative' : 'Primary',
						labelAtActivation: altAtActivation ? 'Alternative' : 'Primary',
						commands: [[altAtActivation ? 'alternative' : 'primary', 'source']]
					});
				} finally {
					modifiers.resetKeyStatus();
				}
			});
		}
	}
});
