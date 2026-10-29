/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append, isHTMLElement } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Emitter } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IContextMenuDelegate } from '../../../../../base/browser/contextmenu.js';
import { IQuickInputHideEvent, IQuickInputService, IQuickPick, IQuickPickDidAcceptEvent, IQuickPickItem, IQuickPickWillAcceptEvent, ItemActivation, QuickInputHideReason } from '../../../../../platform/quickinput/common/quickInput.js';
import { TerminalIconPicker } from '../../../../contrib/terminal/browser/terminalIconPicker.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IconPicker } from '../../browser/iconPicker.js';

suite('Shared IconPicker', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function setup() {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const host = append(mainWindow.document.body, $('div'));
		host.style.width = '600px';
		disposables.add(toDisposable(() => host.remove()));
		const hidden = disposables.add(new Emitter<IQuickInputHideEvent>());
		const accepting = disposables.add(new Emitter<IQuickPickWillAcceptEvent>());
		const accepted = disposables.add(new Emitter<IQuickPickDidAcceptEvent>());
		let grid: HTMLElement | undefined;
		let disposed = false;
		const quickPick = upcastPartial<IQuickPick<IQuickPickItem, { useSeparators: true }>>({
			onDidHide: hidden.event,
			onWillAccept: accepting.event,
			onDidAccept: accepted.event,
			focus() { },
			show() {
				if (isHTMLElement(this.widget)) {
					grid = append(host, this.widget);
				}
			},
			dispose() {
				disposed = true;
				grid?.remove();
				hidden.fire({ reason: QuickInputHideReason.Other });
			},
		});
		instantiationService.stub(IQuickInputService, 'createQuickPick', () => quickPick);
		const menus: IContextMenuDelegate[] = [];
		instantiationService.stub(IContextMenuService, 'showContextMenu', (delegate: IContextMenuDelegate) => { menus.push(delegate); });
		const picker = disposables.add(instantiationService.createInstance(IconPicker));
		return { picker, host, hidden, accepting, accepted, quickPick, menus, grid: () => grid!, disposed: () => disposed };
	}

	test('terminal and session consumers share the original icon picker implementation', () => {
		assert.strictEqual(TerminalIconPicker, IconPicker);
	});

	for (const action of ['select', 'reset', 'cancel']) {
		test(`standard Quick Pick supports ${action} without a bespoke footer`, async () => {
			const harness = setup();
			const result = harness.picker.pickIcons();
			assert.deepStrictEqual({
				items: harness.quickPick.items,
				hideInput: harness.quickPick.hideInput,
				activation: harness.quickPick.itemActivation,
				neutralSelection: harness.quickPick.useNeutralSelection,
				embeddedLists: harness.grid().querySelectorAll('.quick-input-list, .monaco-button').length,
			}, {
				items: [{ type: 'separator' }, { label: 'Reset to default' }],
				hideInput: true,
				activation: ItemActivation.NONE,
				neutralSelection: true,
				embeddedLists: 0,
			});
			if (action === 'cancel') {
				harness.hidden.fire({ reason: QuickInputHideReason.Gesture });
			} else if (action === 'reset') {
				harness.accepted.fire({ inBackground: false });
			} else {
				harness.grid().querySelector<HTMLElement>('.icon-container[title="rocket"]')!.click();
			}
			harness.hidden.fire({ reason: QuickInputHideReason.Other });
			harness.accepted.fire({ inBackground: false });
			const selected = await result;
			assert.deepStrictEqual({ selected: selected ? { id: selected.id } : selected, disposed: harness.disposed() }, {
				selected: action === 'cancel' ? undefined : action === 'reset' ? null : { id: 'rocket' },
				disposed: true,
			});
		});
	}

	test('accepting from the icon grid selects an icon rather than resetting', async () => {
		const harness = setup();
		const result = harness.picker.pickIcons();
		let vetoed = false;
		harness.accepting.fire({ veto: () => vetoed = true });
		const selected = await result;
		assert.deepStrictEqual({ vetoed, selectedIcon: selected?.id !== undefined }, { vetoed: true, selectedIcon: true });
	});

	test('the context menu of the icon search box is rendered inside the icon grid', async () => {
		const harness = setup();
		const result = harness.picker.pickIcons();
		const input = harness.grid().querySelector<HTMLInputElement>('input')!;
		const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
		input.dispatchEvent(event);
		harness.hidden.fire({ reason: QuickInputHideReason.Gesture });
		await result;
		assert.deepStrictEqual({
			defaultPrevented: event.defaultPrevented,
			menus: harness.menus.map(menu => ({ hostIsGrid: menu.domForShadowRoot === harness.grid(), context: menu.getActionsContext?.() === input, actions: (menu.getActions?.() ?? []).map(action => action.id) })),
		}, {
			defaultPrevented: true,
			menus: [{
				hostIsGrid: true, context: true,
				actions: ['undo', 'redo', 'vs.actions.separator', 'editor.action.clipboardCutAction', 'editor.action.clipboardCopyAction', 'editor.action.clipboardPasteAction', 'vs.actions.separator', 'editor.action.selectAll'],
			}],
		});
	});

	test('accepting an empty icon search neither resets nor throws', async () => {
		const harness = setup();
		const result = harness.picker.pickIcons();
		const input = harness.grid().querySelector<HTMLInputElement>('input')!;
		input.value = 'no matching icon';
		input.dispatchEvent(new mainWindow.Event('input', { bubbles: true }));
		let vetoed = false;
		harness.accepting.fire({ veto: () => vetoed = true });
		harness.hidden.fire({ reason: QuickInputHideReason.Gesture });
		assert.deepStrictEqual({ vetoed, selected: await result }, { vetoed: true, selected: undefined });
	});

	test('the grid fills the standard picker width on open, shrink, and grow', async () => {
		const harness = setup();
		const result = harness.picker.pickIcons();
		const widths = [harness.grid().clientWidth];
		for (const width of [280, 720]) {
			harness.host.style.width = `${width}px`;
			await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => mainWindow.requestAnimationFrame(() => resolve())));
			widths.push(harness.grid().clientWidth);
		}
		harness.hidden.fire({ reason: QuickInputHideReason.Gesture });
		await result;
		assert.deepStrictEqual(widths, [600, 280, 720]);
	});
});
