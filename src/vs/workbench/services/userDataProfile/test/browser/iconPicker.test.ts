/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, addDisposableListener, append, EventType, isHTMLElement } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IQuickInputHideEvent, IQuickInputService, IQuickWidget, QuickInputHideReason } from '../../../../../platform/quickinput/common/quickInput.js';
import { defaultInputBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { TerminalIconPicker } from '../../../../contrib/terminal/browser/terminalIconPicker.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IconPicker } from '../../browser/iconPicker.js';
import { WorkbenchIconSelectBox } from '../../browser/iconSelectBox.js';

suite('Shared IconPicker', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function setup() {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const host = append(mainWindow.document.body, $('div'));
		host.style.width = '600px';
		disposables.add(toDisposable(() => host.remove()));
		const hidden = disposables.add(new Emitter<IQuickInputHideEvent>());
		let grid: HTMLElement | undefined;
		let disposed = false;
		const quickWidget = upcastPartial<IQuickWidget>({
			onDidHide: hidden.event,
			buttons: [],
			show() {
				if (isHTMLElement(this.widget)) {
					grid = append(host, this.widget);
				}
			},
			hide() {
				hidden.fire({ reason: QuickInputHideReason.Gesture });
			},
			dispose() {
				disposed = true;
				grid?.remove();
				hidden.fire({ reason: QuickInputHideReason.Other });
			},
		});
		instantiationService.stub(IQuickInputService, 'createQuickWidget', () => quickWidget);
		const picker = disposables.add(instantiationService.createInstance(IconPicker));
		return { picker, host, hidden, quickWidget, grid: () => grid!, disposed: () => disposed };
	}

	test('terminal and session consumers share the original icon picker implementation', () => {
		assert.strictEqual(TerminalIconPicker, IconPicker);
	});

	for (const action of ['select', 'reset', 'cancel']) {
		test(`QuickWidget supports ${action} entirely inside the icon-select UI`, async () => {
			const harness = setup();
			const result = harness.picker.pickIcons();
			assert.deepStrictEqual({
				title: harness.quickWidget.title,
				buttons: harness.quickWidget.buttons,
				reset: harness.grid().querySelector('[role="button"]')?.textContent,
				embeddedLists: harness.grid().querySelectorAll('.quick-input-list').length,
			}, {
				title: 'Change icon',
				buttons: [],
				reset: 'Reset to default',
				embeddedLists: 0,
			});
			if (action === 'cancel') {
				harness.hidden.fire({ reason: QuickInputHideReason.Gesture });
			} else if (action === 'reset') {
				harness.grid().querySelector<HTMLElement>('[role="button"]')!.click();
			} else {
				harness.grid().querySelector<HTMLElement>('.icon-container[title="rocket"]')!.click();
			}
			harness.hidden.fire({ reason: QuickInputHideReason.Other });
			const selected = await result;
			assert.deepStrictEqual({ selected: selected ? { id: selected.id } : selected, disposed: harness.disposed() }, {
				selected: action === 'cancel' ? undefined : action === 'reset' ? null : { id: 'rocket' },
				disposed: true,
			});
		});
	}

	test('Enter in the icon grid selects an icon rather than resetting', async () => {
		const harness = setup();
		const result = harness.picker.pickIcons();
		harness.grid().querySelector<HTMLInputElement>('input')!.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		const selected = await result;
		assert.strictEqual(selected?.id !== undefined, true);
	});

	test('accepting an empty icon search neither resets nor throws', async () => {
		const harness = setup();
		const result = harness.picker.pickIcons();
		const input = harness.grid().querySelector<HTMLInputElement>('input')!;
		input.value = 'no matching icon';
		input.dispatchEvent(new mainWindow.Event('input', { bubbles: true }));
		input.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		harness.hidden.fire({ reason: QuickInputHideReason.Gesture });
		assert.strictEqual(await result, undefined);
	});

	for (const [key, keyCode] of [['Enter', 13], [' ', 32], ['Escape', 27]] as const) {
		test(`${key} on the reset button does not select the active icon`, async () => {
			const harness = setup();
			const result = harness.picker.pickIcons();
			const reset = harness.grid().querySelector<HTMLElement>('[role="button"]')!;
			reset.focus();
			reset.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key, keyCode, bubbles: true }));
			assert.strictEqual(await result, key === 'Escape' ? undefined : null);
		});
	}

	test('reset isolates grid navigation without swallowing workbench shortcuts', async () => {
		const harness = setup();
		const result = harness.picker.pickIcons();
		const reset = harness.grid().querySelector<HTMLElement>('[role="button"]')!;
		const selectedIcon = harness.grid().querySelector('.icon-container.focused')!;
		const bubbled: string[] = [];
		disposables.add(addDisposableListener(harness.host, EventType.KEY_DOWN, event => bubbled.push(event.key)));
		reset.focus();
		for (const event of [
			{ key: 'F1', keyCode: 112 },
			{ key: 'P', keyCode: 80, ctrlKey: true, shiftKey: true },
			{ key: 'Escape', keyCode: 27, shiftKey: true },
			{ key: 'ArrowDown', keyCode: 40, ctrlKey: true },
			{ key: 'Tab', keyCode: 9 },
			{ key: 'ArrowUp', keyCode: 38 },
			{ key: 'ArrowDown', keyCode: 40 },
			{ key: 'ArrowLeft', keyCode: 37 },
			{ key: 'ArrowRight', keyCode: 39 },
			{ key: 'Home', keyCode: 36 },
			{ key: 'End', keyCode: 35 },
		]) {
			reset.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { ...event, bubbles: true, cancelable: true }));
		}
		assert.deepStrictEqual({
			bubbled,
			resetFocused: mainWindow.document.activeElement === reset,
			iconUnchanged: harness.grid().querySelector('.icon-container.focused') === selectedIcon,
		}, { bubbled: ['F1', 'P', 'Escape', 'ArrowDown', 'Tab'], resetFocused: true, iconUnchanged: true });
		harness.hidden.fire({ reason: QuickInputHideReason.Gesture });
		await result;
	});

	test('the reset divider is decorative, non-focusable, and unaffected by hover', async () => {
		const harness = setup();
		const result = harness.picker.pickIcons();
		const divider = harness.grid().querySelector('hr')!;
		const reset = harness.grid().querySelector<HTMLElement>('[role="button"]')!;
		const before = mainWindow.getComputedStyle(divider).backgroundColor;
		divider.dispatchEvent(new mainWindow.MouseEvent('mouseover', { bubbles: true }));
		assert.deepStrictEqual({
			hidden: divider.getAttribute('aria-hidden'),
			tabIndex: divider.tabIndex,
			pointerEvents: mainWindow.getComputedStyle(divider).pointerEvents,
			unchanged: mainWindow.getComputedStyle(divider).backgroundColor === before,
			resetLabel: reset.textContent,
			resetTabIndex: reset.tabIndex,
		}, { hidden: 'true', tabIndex: -1, pointerEvents: 'none', unchanged: true, resetLabel: 'Reset to default', resetTabIndex: 0 });
		harness.hidden.fire({ reason: QuickInputHideReason.Gesture });
		await result;
	});

	test('other icon-select consumers do not acquire a reset action', () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const box = disposables.add(instantiationService.createInstance(WorkbenchIconSelectBox, {
			icons: [Codicon.rocket],
			inputBoxStyles: defaultInputBoxStyles,
		}));
		assert.strictEqual(box.domNode.querySelector('.icon-select-reset'), null);
	});

	test('search updates do not repeatedly grow the custom picker', async () => {
		const harness = setup();
		const result = harness.picker.pickIcons();
		const input = harness.grid().querySelector<HTMLInputElement>('input')!;
		const heights = [harness.grid().clientHeight];
		for (const value of ['rocket', '', 'no matching icon', '']) {
			input.value = value;
			input.dispatchEvent(new mainWindow.Event('input', { bubbles: true }));
			heights.push(harness.grid().clientHeight);
		}
		harness.hidden.fire({ reason: QuickInputHideReason.Gesture });
		await result;
		assert.deepStrictEqual(heights, heights.map(() => heights[0]));
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
