/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ModifierKeyEmitter } from '../../../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../../../base/browser/mouseEvent.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Action, ActionRunner, SubmenuAction, toAction } from '../../../../../base/common/actions.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { isLinux, isWindows } from '../../../../../base/common/platform.js';
import { IContextMenuItem } from '../../../../../base/parts/contextmenu/common/contextmenu.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { isMacintosh } from '../../../../../base/common/platform.js';
import { FocusMode } from '../../../../../platform/native/common/native.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IHostService } from '../../../host/browser/host.js';
import { NativeContextMenuService } from '../../electron-browser/contextmenuService.js';

suite('Native ContextMenuService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let service: NativeContextMenuService;
	let focus: DeferredPromise<void>;
	let calls: string[];
	let focusedWindow: Window | undefined;
	let focusMode: FocusMode | undefined;
	let menu: IContextMenuItem[];
	let closeMenu: (() => void) | undefined;

	setup(() => {
		ModifierKeyEmitter.getInstance().resetKeyStatus();
		calls = [];
		focus = new DeferredPromise<void>();
		focusedWindow = undefined;
		focusMode = undefined;
		menu = [];
		closeMenu = undefined;
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IHostService, {
			focus: async (targetWindow, options) => {
				calls.push('focus');
				focusedWindow = targetWindow;
				focusMode = options?.mode;
				await focus.p;
			},
		});
		service = store.add(instantiationService.createInstance(NativeContextMenuService, (items, _options, onHide) => {
			menu = items;
			closeMenu = onHide;
		}));
	});

	teardown(() => ModifierKeyEmitter.getInstance().resetKeyStatus());

	for (const mouseAnchor of [false, true]) {
		for (const mode of ['action', 'submenu', 'action runner'] as const) {
			test(`activates the ${mouseAnchor ? 'mouse' : 'element'} anchor's window before running a selected ${mode}`, async () => {
				const frame = mainWindow.document.createElement('iframe');
				mainWindow.document.body.appendChild(frame);
				store.add(toDisposable(() => frame.remove()));
				const targetWindow = frame.contentWindow!;
				const didRun = new DeferredPromise<void>();
				const action = store.add(new Action('test', 'Test', undefined, true, async () => {
					calls.push('run');
					didRun.complete();
				}));
				const actions = [mode === 'submenu' ? new SubmenuAction('submenu', 'Submenu', [action]) : action];
				service.showContextMenu({
					getAnchor: () => mouseAnchor
						? new StandardMouseEvent(targetWindow, new MouseEvent('contextmenu', { view: targetWindow }))
						: frame.contentDocument!.body,
					getActions: () => actions,
					actionRunner: mode === 'action runner' ? store.add(new ActionRunner()) : undefined,
					onHide: () => calls.push('hide'),
				});
				const beforeSelection = [...calls];
				const item = mode === 'submenu' ? menu[0].submenu![0] : menu[0];
				item.click!({});
				const beforeActivation = [...calls];
				await focus.complete();
				await didRun.p;

				assert.deepStrictEqual({ beforeSelection, beforeActivation, calls, focusedWindow, focusMode }, {
					beforeSelection: [],
					beforeActivation: ['hide', 'focus'],
					calls: ['hide', 'focus', 'run'],
					focusedWindow: targetWindow,
					focusMode: FocusMode.Force,
				});
			});
		}
	}

	test('honors explicit menu mnemonics and escapes ordinary ampersands', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const action = instantiationService.createInstance(MenuItemAction, {
			id: 'test.duplicate',
			title: { value: 'Duplicate tab (D)', original: 'Duplicate tab (D)', mnemonicTitle: '&&Duplicate tab (D)' },
		}, undefined, undefined, undefined, undefined);
		const ordinary = store.add(new Action('test.ordinary', 'Keep & Close'));
		service.showContextMenu({
			getAnchor: () => mainWindow.document.body,
			getActions: () => [action, ordinary],
		});
		assert.deepStrictEqual(menu.map(item => ({ label: item.label, accelerator: item.accelerator })), [
			{ label: isMacintosh ? 'Duplicate tab (D)' : '&Duplicate tab (D)', accelerator: undefined },
			{ label: 'Keep && Close', accelerator: undefined },
		]);
		closeMenu!();
	});

	test('does not apply the original mnemonic to a short title', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const action = instantiationService.createInstance(MenuItemAction, {
			id: 'test.short',
			title: { value: 'Duplicate tab (D)', original: 'Duplicate tab (D)', mnemonicTitle: '&&Duplicate tab (D)' },
			shortTitle: 'Copy',
		}, undefined, { renderShortTitle: true }, undefined, undefined);
		service.showContextMenu({
			getAnchor: () => mainWindow.document.body,
			getActions: () => [action],
		});
		assert.strictEqual(menu[0].label, 'Copy');
		closeMenu!();
	});

	test('does not activate the window when dismissing the menu', () => {
		const action = store.add(new Action('test', 'Test'));
		service.showContextMenu({
			getAnchor: () => mainWindow.document.body,
			getActions: () => [action],
			onHide: () => calls.push('hide'),
		});
		closeMenu!();

		assert.deepStrictEqual(calls, ['hide']);
	});

	for (const submenu of [false, true]) {
		for (const withRunner of [false, true]) {
			test(`freezes the label and command at creation in a ${submenu ? 'submenu' : 'menu'} ${withRunner ? 'with' : 'without'} an action runner`, async () => {
				await focus.complete();
				const runs: unknown[] = [];
				const context = { source: 'test' };
				const runner = withRunner ? store.add(new ActionRunner()) : undefined;
				if (runner) {
					store.add(runner.onWillRun(e => runs.push(e.action.id)));
				}
				const alternative = toAction({ id: 'alternative', label: 'Alternative', run: (value: unknown) => runs.push(['alternative', value]) });
				const action = toAction({ id: 'primary', label: 'Primary', alt: alternative, run: (value: unknown) => runs.push(['primary', value]) });
				const labels: (string | undefined)[] = [];
				const expectedIds: string[] = [];
				for (const modifier of ['Alt', 'Shift'] as const) {
					for (const heldAtOpen of [false, true]) {
						ModifierKeyEmitter.getInstance().resetKeyStatus();
						if (heldAtOpen) {
							mainWindow.dispatchEvent(new KeyboardEvent('keydown', { key: modifier, keyCode: modifier === 'Alt' ? 18 : 16, altKey: modifier === 'Alt', shiftKey: modifier === 'Shift' }));
						}
						service.showContextMenu({
							getAnchor: () => mainWindow.document.body,
							getActions: () => submenu ? [new SubmenuAction('submenu', 'Submenu', [action])] : [action],
							getActionsContext: () => context,
							actionRunner: runner
						});
						const item = submenu ? menu[0].submenu![0] : menu[0];
						labels.push(item.label);
						expectedIds.push(heldAtOpen && (modifier === 'Alt' || isWindows || isLinux) ? 'alternative' : 'primary');
						item.click!({ altKey: !heldAtOpen && modifier === 'Alt', shiftKey: !heldAtOpen && modifier === 'Shift' });
						await Promise.resolve();
						await Promise.resolve();
					}
				}
				assert.deepStrictEqual({ labels, runs }, {
					labels: expectedIds.map(id => id === 'alternative' ? 'Alternative' : 'Primary'),
					runs: expectedIds.flatMap(id => withRunner ? [id, [id, context]] : [[id, context]])
				});
			});
		}
	}

});
