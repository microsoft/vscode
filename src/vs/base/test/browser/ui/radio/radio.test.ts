/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getWindow } from '../../../../browser/dom.js';
import { Radio, IRadioOptions } from '../../../../browser/ui/radio/radio.js';
import { mainWindow } from '../../../../browser/window.js';
import { toDisposable } from '../../../../common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

suite('Radio', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createRadio(options: IRadioOptions): Radio {
		const radio = disposables.add(new Radio(options));
		mainWindow.document.body.appendChild(radio.domNode);
		disposables.add(toDisposable(() => radio.domNode.remove()));
		radio.domNode.style.cssText = `
			position: absolute;
			top: 0;
			left: 0;
			font-family: sans-serif;
			--vscode-spacing-sizeNone: 0px;
			--vscode-spacing-size20: 2px;
			--vscode-spacing-size60: 6px;
			--vscode-spacing-size240: 24px;
			--vscode-strokeThickness: 1px;
			--vscode-fontSize-label2: 11px;
			--vscode-fontWeight-semiBold: 600;
		`;
		return radio;
	}

	for (const labels of [
		['Low', 'Medium', 'High'],
		['Low', 'Medium', 'High', 'Extra High'],
		['Minimal', 'Low', 'Medium', 'High', 'Max'],
		['None', 'Low', 'Medium', 'High', 'Extra High', 'Max'],
		['Standard', '$(zap) Fast'],
	]) {
		for (const width of [200, 276]) {
			test(`segmented option bounds stay fixed at ${width}px: ${labels.join(', ')}`, () => {
				const radio = createRadio({
					className: 'segmented',
					items: labels.map(text => ({ text })),
				});
				radio.domNode.style.width = `${width}px`;
				const measure = () => radio.optionElements.map(element => {
					const { x, y, width, height } = element.getBoundingClientRect();
					return { x, y, width, height };
				});
				const initial = measure();
				const selections = labels.map((_, index) => {
					radio.optionElements[index].click();
					return measure();
				});

				assert.deepStrictEqual({
					laidOut: initial.every(box => box.width > 0 && box.height > 0),
					selections,
				}, {
					laidOut: true,
					selections: labels.map(() => initial),
				});
			});
		}
	}

	test('segmented label sizing follows temporary labels and restoration without duplicating icons', () => {
		const radio = createRadio({ className: 'segmented', items: [{ text: '$(zap) Fast', ariaLabel: 'Fast' }] });
		const element = radio.optionElements[0];
		const readLabel = () => ({
			text: element.textContent,
			labels: Array.from(element.querySelectorAll('[data-label]'), label => label.getAttribute('data-label')),
			icons: element.querySelectorAll('.codicon').length,
			ariaLabel: element.getAttribute('aria-label'),
		});
		const initial = readLabel();
		const override = disposables.add(radio.overrideOptionLabel(0, '$(check) Standard'));
		const temporary = readLabel();
		override.dispose();

		assert.deepStrictEqual({ initial, temporary, restored: readLabel() }, {
			initial: { text: 'Fast', labels: ['Fast'], icons: 1, ariaLabel: 'Fast' },
			temporary: { text: 'Standard', labels: ['Standard'], icons: 1, ariaLabel: 'Fast' },
			restored: { text: 'Fast', labels: ['Fast'], icons: 1, ariaLabel: 'Fast' },
		});
	});

	test('joined radios retain shared borders and do not add label sizing', () => {
		const radio = createRadio({ items: [{ text: 'One' }, { text: 'Two' }, { text: 'Three' }] });
		const borders = () => radio.optionElements.map(element => {
			const style = getWindow(element).getComputedStyle(element);
			return [style.borderLeftWidth, style.borderRightWidth];
		});
		const firstSelected = borders();
		radio.setActiveItem(1);

		assert.deepStrictEqual({
			firstSelected,
			secondSelected: borders(),
			sizingLabels: radio.domNode.querySelectorAll('[data-label]').length,
		}, {
			firstSelected: [['1px', '1px'], ['0px', '0px'], ['1px', '1px']],
			secondSelected: [['1px', '0px'], ['1px', '1px'], ['0px', '1px']],
			sizingLabels: 0,
		});
	});

	test('segmented arrows can move focus without selecting until Enter', () => {
		const radio = createRadio({
			className: 'segmented',
			arrowKeyBehavior: 'focus',
			items: [{ text: 'Low' }, { text: 'Medium' }, { text: 'High' }],
		});
		const selected: number[] = [];
		disposables.add(radio.onDidSelect(index => selected.push(index)));
		const [low, medium] = radio.optionElements;
		low.focus();
		low.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', keyCode: 39, bubbles: true }));
		const beforeEnter = {
			focused: mainWindow.document.activeElement === medium,
			checked: radio.optionElements.map(element => element.getAttribute('aria-checked')),
			tabIndexes: radio.optionElements.map(element => element.tabIndex),
		};
		medium.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));

		assert.deepStrictEqual({
			beforeEnter,
			selected,
			checked: radio.optionElements.map(element => element.getAttribute('aria-checked')),
		}, {
			beforeEnter: { focused: true, checked: ['true', 'false', 'false'], tabIndexes: [-1, 0, -1] },
			selected: [1],
			checked: ['false', 'true', 'false'],
		});
	});

	test('activation fires for clicks on both selected and unselected items without changing selection events', () => {
		const radio = createRadio({ items: [{ text: 'One' }, { text: 'Two' }] });
		const events: string[] = [];
		disposables.add(radio.onDidSelect(index => events.push(`selected:${index}`)));
		disposables.add(radio.onDidActivate(index => events.push(`activated:${index}`)));
		radio.optionElements[0].click();
		radio.optionElements[1].click();
		radio.optionElements[1].click();
		radio.setActiveItem(0);

		assert.deepStrictEqual(events, ['activated:0', 'selected:1', 'activated:1', 'activated:1']);
	});

	for (const [key, keyCode] of [['Enter', 13], [' ', 32]] as const) {
		test(`${key === ' ' ? 'Space' : key} activates both selected and unselected items exactly once`, () => {
			const radio = createRadio({
				arrowKeyBehavior: 'focus',
				items: [{ text: 'One' }, { text: 'Two' }],
			});
			const events: string[] = [];
			disposables.add(radio.onDidSelect(index => events.push(`selected:${index}`)));
			disposables.add(radio.onDidActivate(index => events.push(`activated:${index}`)));
			for (const index of [0, 1, 1]) {
				radio.optionElements[index].dispatchEvent(new KeyboardEvent('keydown', { key, keyCode, bubbles: true }));
			}

			assert.deepStrictEqual(events, ['activated:0', 'selected:1', 'activated:1', 'activated:1']);
		});
	}

	for (const arrowKeyBehavior of ['select', 'focus'] as const) {
		test(`arrows in ${arrowKeyBehavior} mode skip disabled items and never activate`, () => {
			const radio = createRadio({
				arrowKeyBehavior,
				items: [{ text: 'One' }, { text: 'Two', disabled: true }, { text: 'Three' }],
			});
			const selected: number[] = [];
			const activated: number[] = [];
			disposables.add(radio.onDidSelect(index => selected.push(index)));
			disposables.add(radio.onDidActivate(index => activated.push(index)));
			radio.focusActiveItem();
			radio.optionElements[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', keyCode: 39, bubbles: true }));
			const focusedAfterArrow = mainWindow.document.activeElement === radio.optionElements[2];
			radio.optionElements[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', keyCode: 39, bubbles: true }));

			assert.deepStrictEqual({
				selected,
				activated,
				focusedAfterArrow,
				focusedAfterWrap: mainWindow.document.activeElement === radio.optionElements[0],
			}, {
				selected: arrowKeyBehavior === 'select' ? [2, 0] : [],
				activated: [],
				focusedAfterArrow: true,
				focusedAfterWrap: true,
			});
		});
	}

	test('disabled items and disabled controls cannot be activated', () => {
		const radio = createRadio({ items: [{ text: 'One' }, { text: 'Two', disabled: true }] });
		const events: string[] = [];
		disposables.add(radio.onDidSelect(index => events.push(`selected:${index}`)));
		disposables.add(radio.onDidActivate(index => events.push(`activated:${index}`)));
		const activate = (element: HTMLElement) => {
			element.click();
			element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
			element.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', keyCode: 32, bubbles: true }));
		};
		activate(radio.optionElements[1]);
		radio.setEnabled(false);
		activate(radio.optionElements[0]);

		assert.deepStrictEqual(events, []);
	});

	test('restoring focus keeps one tab stop without selecting or activating', () => {
		const radio = createRadio({ arrowKeyBehavior: 'focus', items: [{ text: 'One' }, { text: 'Two' }] });
		const events: number[] = [];
		disposables.add(radio.onDidSelect(index => events.push(index)));
		disposables.add(radio.onDidActivate(index => events.push(index)));
		radio.focusItem(1);
		const focusedItem = {
			focused: mainWindow.document.activeElement === radio.optionElements[1],
			tabIndexes: radio.optionElements.map(element => element.tabIndex),
			checked: radio.optionElements.map(element => element.getAttribute('aria-checked')),
		};
		radio.focusActiveItem();

		assert.deepStrictEqual({
			focusedItem,
			events,
			activeFocused: mainWindow.document.activeElement === radio.optionElements[0],
			tabIndexes: radio.optionElements.map(element => element.tabIndex),
		}, {
			focusedItem: { focused: true, tabIndexes: [-1, 0], checked: ['true', 'false'] },
			events: [],
			activeFocused: true,
			tabIndexes: [0, -1],
		});
	});

	test('replaced and disposed buttons no longer select or activate', () => {
		const radio = createRadio({ items: [{ text: 'One' }, { text: 'Two' }] });
		const events: number[] = [];
		disposables.add(radio.onDidSelect(index => events.push(index)));
		disposables.add(radio.onDidActivate(index => events.push(index)));
		const previousButton = radio.optionElements[1];
		radio.setItems([{ text: 'Three' }]);
		previousButton.click();
		const currentButton = radio.optionElements[0];
		radio.dispose();
		currentButton.click();

		assert.deepStrictEqual(events, []);
	});

	test('focusing an invalid item reports an error without changing the tab order', () => {
		const radio = createRadio({ items: [{ text: 'One' }] });
		assert.throws(() => radio.focusItem(-1), /Invalid Index/);
		assert.throws(() => radio.focusItem(1), /Invalid Index/);
		assert.deepStrictEqual(radio.optionElements.map(element => element.tabIndex), [0]);
	});
});
