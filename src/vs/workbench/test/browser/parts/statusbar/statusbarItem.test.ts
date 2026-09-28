/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { EventType as TouchEventType } from '../../../../../base/browser/touch.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IHoverService, WorkbenchHoverDelegate } from '../../../../../platform/hover/browser/hover.js';
import { HoverService } from '../../../../../platform/hover/browser/hoverService.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { StatusbarEntryItem } from '../../../../browser/parts/statusbar/statusbarItem.js';
import { IStatusbarEntry, ShowTooltipCommand, ToggleTooltipCommand } from '../../../../services/statusbar/browser/statusbar.js';
import { workbenchInstantiationService } from '../../workbenchTestServices.js';

suite('StatusbarEntryItem', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createItem(command: IStatusbarEntry['command'] = ToggleTooltipCommand) {
		const fixture = $('div');
		const otherTarget = $('button');
		fixture.appendChild(otherTarget);
		const container = $('.statusbar-item');
		fixture.appendChild(container);
		mainWindow.document.body.appendChild(fixture);
		store.add(toDisposable(() => fixture.remove()));

		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(ILayoutService, {
			activeContainer: fixture,
			mainContainer: fixture,
			getContainer: () => fixture,
			onDidLayoutContainer: Event.None,
		});
		const commands: { id: string; args: string[] }[] = [];
		instantiationService.stub(ICommandService, {
			executeCommand: async (id: string, ...args: string[]) => { commands.push({ id, args }); },
		});
		const hoverService = store.add(instantiationService.createInstance(HoverService));
		instantiationService.stub(IHoverService, hoverService);
		const hoverDelegate = store.add(instantiationService.createInstance(WorkbenchHoverDelegate, 'element', { dynamicDelay: () => 500 }, (_, focus) => ({
			persistence: { hideOnKeyDown: true, sticky: focus }
		})));
		const entry: IStatusbarEntry = {
			name: 'Test',
			text: 'Test',
			ariaLabel: 'Test',
			tooltip: { element: () => $('div', undefined, 'Dashboard') },
			command,
		};
		const item = store.add(instantiationService.createInstance(StatusbarEntryItem, container, entry, hoverDelegate));

		const isVisible = () => !!fixture.querySelector('.monaco-hover');
		const isFocused = () => !!fixture.querySelector('.monaco-hover')?.contains(mainWindow.document.activeElement);
		const click = async () => {
			item.labelContainer.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'mouse' }));
			item.labelContainer.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
			item.labelContainer.focus();
			item.labelContainer.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, pointerType: 'mouse' }));
			item.labelContainer.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
			item.labelContainer.dispatchEvent(new PointerEvent('click', { bubbles: true, detail: 1, pointerId: 1, pointerType: 'mouse' }));
			await timeout(0);
		};

		return { item, entry, container, otherTarget, commands, isVisible, isFocused, click };
	}

	test('successive clicks show, hide, and reopen the tooltip', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { click, isVisible } = createItem();
		const visibility = [isVisible()];
		for (let i = 0; i < 4; i++) {
			await click();
			visibility.push(isVisible());
		}

		assert.deepStrictEqual(visibility, [false, true, false, true, false]);
	}));

	test('reopens after clicking outside the tooltip', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { click, isVisible } = createItem();
		await click();
		mainWindow.document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		const afterDismiss = isVisible();
		await click();

		assert.deepStrictEqual({ afterDismiss, afterReopen: isVisible() }, { afterDismiss: false, afterReopen: true });
	}));

	for (const interaction of ['right-click', 'drag-away', 'pointer-cancel'] as const) {
		test(`click-only activation reopens after ${interaction}`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { item, container, otherTarget, click, isVisible } = createItem();
			await click();
			const button = interaction === 'right-click' ? 2 : 0;
			item.labelContainer.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button, pointerId: 1, pointerType: 'mouse' }));
			item.labelContainer.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button }));

			if (interaction === 'right-click') {
				item.labelContainer.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button }));
			} else if (interaction === 'drag-away') {
				container.dispatchEvent(new MouseEvent('mouseleave'));
				otherTarget.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, pointerType: 'mouse' }));
				otherTarget.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
			} else {
				item.labelContainer.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1, pointerType: 'mouse' }));
			}

			const afterDismiss = isVisible();
			item.labelContainer.click();
			await timeout(0);

			assert.deepStrictEqual({ afterDismiss, afterReopen: isVisible() }, { afterDismiss: false, afterReopen: true });
		}));
	}

	test('click-only activation uses live visibility after keyboard activation', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { item, isVisible } = createItem();
		item.labelContainer.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'mouse' }));
		item.labelContainer.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1, pointerType: 'mouse' }));
		item.labelContainer.focus();
		item.labelContainer.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 13, bubbles: true, cancelable: true }));
		await timeout(0);

		const afterKeyboard = isVisible();
		item.labelContainer.click();
		await timeout(0);

		assert.deepStrictEqual({ afterKeyboard, afterClick: isVisible() }, { afterKeyboard: true, afterClick: false });
	}));

	for (const preview of ['hover', 'focus'] as const) {
		test(`activation focuses a passive ${preview} preview before toggling it closed`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { item, otherTarget, click, isVisible, isFocused } = createItem();
			otherTarget.focus();
			if (preview === 'hover') {
				item.labelContainer.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
			} else {
				item.labelContainer.focus();
				item.labelContainer.dispatchEvent(new FocusEvent('focus', { bubbles: true, relatedTarget: otherTarget }));
			}
			await timeout(500);

			const states = [{ visible: isVisible(), focused: isFocused() }];
			for (let i = 0; i < 2; i++) {
				if (preview === 'hover') {
					await click();
				} else {
					item.labelContainer.focus();
					item.labelContainer.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 13, bubbles: true, cancelable: true }));
					await timeout(0);
				}
				states.push({ visible: isVisible(), focused: isFocused() });
			}

			assert.deepStrictEqual(states, [
				{ visible: true, focused: false },
				{ visible: true, focused: true },
				{ visible: false, focused: false },
			]);
		}));
	}

	test('still toggles after leaving the status entry', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { container, click, isVisible } = createItem();
		await click();
		container.dispatchEvent(new MouseEvent('mouseleave'));
		const afterMouseLeave = isVisible();
		await click();

		assert.deepStrictEqual({ afterMouseLeave, afterClick: isVisible() }, { afterMouseLeave: true, afterClick: false });
	}));

	test('keyboard activation toggles the tooltip and Escape restores focus', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { item, isVisible } = createItem();
		const visibility: boolean[] = [];
		for (const keyCode of [13, 13, 32, 27]) {
			item.labelContainer.focus();
			item.labelContainer.dispatchEvent(new KeyboardEvent('keydown', { keyCode, bubbles: true, cancelable: true }));
			await timeout(0);
			visibility.push(isVisible());
		}

		assert.deepStrictEqual({
			visibility,
			focusRestored: mainWindow.document.activeElement === item.labelContainer,
		}, {
			visibility: [true, false, true, false],
			focusRestored: true,
		});
	}));

	test('touch activation toggles the tooltip', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { item, isVisible } = createItem();
		const visibility: boolean[] = [];
		for (let i = 0; i < 2; i++) {
			item.labelContainer.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
			item.labelContainer.dispatchEvent(new mainWindow.CustomEvent(TouchEventType.Tap, { bubbles: true }));
			await timeout(0);
			visibility.push(isVisible());
		}

		assert.deepStrictEqual(visibility, [true, false]);
	}));

	test('preserves show-only tooltip commands', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { click, isVisible } = createItem(ShowTooltipCommand);
		const visibility: boolean[] = [];
		for (let i = 0; i < 2; i++) {
			await click();
			visibility.push(isVisible());
		}

		assert.deepStrictEqual(visibility, [true, true]);
	}));

	test('updates command listeners when switching to the toggle command', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { item, entry, click, isVisible, commands } = createItem({ id: 'test.command', title: 'Test', arguments: ['argument'] });
		await click();
		item.update({ ...entry, command: ToggleTooltipCommand });
		await click();
		await click();

		assert.deepStrictEqual({
			commands,
			isVisible: isVisible(),
		}, {
			commands: [{ id: 'test.command', args: ['argument'] }],
			isVisible: false,
		});
	}));
});
