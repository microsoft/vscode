/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as DOM from '../../../../../base/browser/dom.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { createTextInputActions } from '../../../../../workbench/browser/actions/textInputActions.js';
import { AutomationCronInput } from '../../browser/automationCronInput.js';

suite('Automation cron segmented input', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function create(expression = '') {
		const container = DOM.append(DOM.getActiveDocument().body, DOM.$('div'));
		store.add(toDisposable(() => container.remove()));
		const input = store.add(new AutomationCronInput(container, expression, 'UTC', new class extends mock<IContextViewService>() { }));
		const elements = Array.from(container.querySelectorAll('input'));
		const targetWindow = DOM.getWindow(container);
		const change = (index: number, value: string) => {
			elements[index].value = value;
			elements[index].dispatchEvent(new targetWindow.Event('input'));
		};
		const key = (index: number, key: string, ctrlKey = false, metaKey = false) => {
			const event = new KeyboardEvent('keydown', { key, ctrlKey, metaKey, bubbles: true, cancelable: true });
			elements[index].dispatchEvent(event);
			return event;
		};
		const paste = (index: number, text: string) => {
			const clipboardData = new DataTransfer();
			clipboardData.setData('text/plain', text);
			elements[index].setSelectionRange(0, elements[index].value.length);
			elements[index].dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
		};
		return { container, input, elements, change, key, paste };
	}

	test('labels each part, keeps empty input neutral, and interprets blank parts as wildcards', () => {
		const { container, input, elements, change } = create();
		const initial = { value: input.value, error: container.querySelector('.automation-form-cron-error')?.textContent };
		change(0, '*/2');
		assert.deepStrictEqual({
			initial, value: input.value,
			labels: elements.map(element => element.getAttribute('aria-label')),
			placeholders: elements.map(element => element.placeholder),
		}, {
			initial: { value: '', error: '' }, value: '*/2 * * * *',
			labels: ['Minute', 'Hour', 'Day of month', 'Month', 'Day of week'],
			placeholders: ['*', '*', '*', '*', '*'],
		});
	});

	test('spreads a full expression on paste but never discards surplus fields', () => {
		const { container, input, paste } = create();
		paste(2, '*/2 * * * MON-FRI');
		const valid = input.value;
		paste(0, '0 1 2 3');
		const missing = input.value;
		const missingInvalid = container.querySelector('.automation-cron-segments')?.classList.contains('invalid');
		paste(0, '0 1 2 3 4 5');
		const surplus = input.value;
		paste(0, '@daily');
		assert.deepStrictEqual({ valid, missing, missingInvalid, surplus, macro: input.value, invalid: container.querySelector('.automation-cron-segments')?.classList.contains('invalid') }, {
			valid: '*/2 * * * MON-FRI', missing: '0 1 2 3', missingInvalid: true, surplus: '0 1 2 3 4 5', macro: '@daily', invalid: true,
		});
	});

	test('all paste ingress shares parts, value, validation and one notification without losing other fields', async () => {
		const cases = [
			{ name: 'empty first', initial: '', index: 0, text: '0 9 * * MON', parts: ['0', '9', '*', '*', 'MON'], value: '0 9 * * MON', invalid: false },
			{ name: 'empty middle', initial: '', index: 2, text: '0 9 * * MON', parts: ['0', '9', '*', '*', 'MON'], value: '0 9 * * MON', invalid: false },
			{ name: 'selected nonempty', initial: '15 1 1 JAN MON-FRI', index: 1, text: '0 9 * * MON', parts: ['0', '9', '*', '*', 'MON'], value: '0 9 * * MON', invalid: false },
			{ name: 'native suffix retained', initial: '15 1 1 JAN MON-FRI', index: 1, text: '0 9 * * MON', caret: 0, parts: ['0', '9', '*', '*', 'MON1'], value: '0 9 * * MON1', invalid: true },
			{ name: 'partial preserves tail', initial: '15 1 1 JAN MON-FRI', index: 1, text: '9 *', parts: ['15', '9', '*', 'JAN', 'MON-FRI'], value: '15 9 * JAN MON-FRI', invalid: false },
			{ name: 'partial overflow visible', initial: '15 1 1 JAN MON-FRI', index: 4, text: 'MON FRI', parts: ['15', '1', '1', 'JAN', 'MON FRI'], value: '15 1 1 JAN MON FRI', invalid: true },
			{ name: 'missing whole fields', initial: '15 1 1 JAN MON-FRI', index: 0, text: '0 1 2 3', parts: ['0', '1', '2', '3', ''], value: '0 1 2 3', invalid: true },
			{ name: 'whole overflow visible', initial: '', index: 2, text: '0 1 2 3 4 5', parts: ['0', '1', '2', '3', '4 5'], value: '0 1 2 3 4 5', invalid: true },
			{ name: 'macro visible', initial: '15 1 1 JAN MON-FRI', index: 3, text: '@daily', parts: ['@daily', '', '', '', ''], value: '@daily', invalid: true },
			{ name: 'one field', initial: '15 1 1 JAN MON-FRI', index: 1, text: '2', parts: ['15', '2', '1', 'JAN', 'MON-FRI'], value: '15 2 1 JAN MON-FRI', invalid: false },
			{ name: 'virtual whole partial', initial: '15 1 1 JAN MON-FRI', index: 3, text: 'JAN MON', whole: true, parts: ['JAN', 'MON', '', '', ''], value: 'JAN MON', invalid: true },
			{ name: 'invalid symbol retained', initial: '', index: 0, text: '0 ? * * MON', parts: ['0', '?', '*', '*', 'MON'], value: '0 ? * * MON', invalid: true },
		];
		const results = [];
		for (const source of ['paste-event', 'workbench-input']) {
			for (const item of cases) {
				const { container, input, elements, key } = create(item.initial);
				const element = elements[item.index];
				element.focus();
				element.setSelectionRange(item.caret ?? 0, item.caret ?? element.value.length);
				if (item.whole) {
					key(item.index, 'a', true);
				}
				const changes: string[] = [];
				store.add(input.onDidChange(value => changes.push(value)));
				if (source === 'workbench-input') {
					const clipboard = new class extends mock<IClipboardService>() {
						override async readText() { return item.text; }
					};
					await createTextInputActions(clipboard, store.add(new NullLogService())).find(action => action.id === 'editor.action.clipboardPasteAction')!.run(element);
				} else {
					const data = new DataTransfer();
					data.setData('text/plain', item.text);
					const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
					element.dispatchEvent(event);
					if (!event.defaultPrevented) {
						const start = element.selectionStart ?? 0;
						element.value = element.value.slice(0, start) + item.text + element.value.slice(element.selectionEnd ?? 0);
						element.setSelectionRange(start + item.text.length, start + item.text.length);
						element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
					}
				}
				results.push({ source, name: item.name, parts: elements.map(element => element.value), value: input.value, invalid: container.querySelector('.automation-cron-segments')!.classList.contains('invalid'), changes });
			}
		}
		assert.deepStrictEqual(results, ['paste-event', 'workbench-input'].flatMap(source => cases.map(item => ({
			source, name: item.name, parts: item.parts, value: item.value, invalid: item.invalid, changes: [item.value],
		}))));
	});

	test('native history changes cancel whole-expression selection without clearing other fields', () => {
		const results = ['historyUndo', 'historyRedo'].map(inputType => {
			const { input, elements, change, key } = create('15 1 * * MON-FRI');
			key(1, 'a', true);
			elements[1].dispatchEvent(new InputEvent('beforeinput', { inputType, bubbles: true, cancelable: true }));
			change(1, '2');
			return { inputType, value: input.value, parts: elements.map(element => element.value) };
		});
		assert.deepStrictEqual(results, ['historyUndo', 'historyRedo'].map(inputType => ({
			inputType, value: '15 2 * * MON-FRI', parts: ['15', '2', '*', '*', 'MON-FRI'],
		})));
	});

	test('supports whole-expression selection, copy, replacement, and clearing', () => {
		const expression = '*/2 * * * MON-FRI';
		const results = [false, true].map(metaKey => {
			const { input, elements, key, change, paste } = create(expression);
			const changes: string[] = [];
			store.add(input.onDidChange(value => changes.push(value)));
			const selectAll = (index: number) => key(index, 'a', !metaKey, metaKey);
			selectAll(3);
			const clipboardData = new DataTransfer();
			elements[3].dispatchEvent(new ClipboardEvent('copy', { clipboardData, bubbles: true, cancelable: true }));
			change(3, 'JAN');
			const replaced = input.value;
			selectAll(3);
			paste(3, '0 9 * * MON');
			const pasted = input.value;
			selectAll(0);
			key(0, 'Backspace');
			const cleared = input.value;
			paste(0, expression);
			selectAll(0);
			const deletePrevented = key(0, 'Delete').defaultPrevented;
			const deleted = input.value;
			paste(0, expression);
			selectAll(0);
			const cutData = new DataTransfer();
			elements[0].dispatchEvent(new ClipboardEvent('cut', { clipboardData: cutData, bubbles: true, cancelable: true }));
			return { copied: clipboardData.getData('text/plain'), replaced, pasted, cleared, deleted, deletePrevented, cut: cutData.getData('text/plain'), afterCut: input.value, changes };
		});
		assert.deepStrictEqual(results, [false, true].map(() => ({
			copied: expression, replaced: '* * * JAN *', pasted: '0 9 * * MON', cleared: '',
			deleted: '', deletePrevented: true, cut: expression, afterCut: '',
			changes: ['* * * JAN *', '0 9 * * MON', '', expression, '', expression, ''],
		})));
	});

	test('caret navigation cancels whole-expression selection before field edits and deletion', () => {
		const parts = ['15', '1', '*', '*', 'MON-FRI'];
		const cases = ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'ArrowUp', 'ArrowDown'].flatMap(navigation =>
			['Control', 'Meta'].flatMap(modifier =>
				['edit', 'Backspace', 'Delete'].map(action => ({ navigation, modifier, action }))));
		const results = cases.map(({ navigation, modifier, action }) => {
			const { container, elements, key, change } = create(parts.join(' '));
			const index = navigation === 'ArrowUp' || navigation === 'ArrowDown' ? 4 : 1;
			elements[index].focus();
			key(index, 'a', modifier === 'Control', modifier === 'Meta');
			const event = key(index, navigation);
			const selected = container.querySelector('.automation-cron-segments')!.classList.contains('all-selected');
			const deletionPrevented = action === 'edit' ? false : key(index, action).defaultPrevented;
			change(index, action === 'edit' ? '2' : '');
			return {
				navigation, modifier, action, selected,
				navigationPrevented: event.defaultPrevented, deletionPrevented,
				untouched: elements.filter((_, position) => position !== index).map(element => element.value),
			};
		});
		assert.deepStrictEqual(results, cases.map(({ navigation, modifier, action }) => ({
			navigation, modifier, action, selected: false, navigationPrevented: false, deletionPrevented: false,
			untouched: parts.filter((_, index) => index !== (navigation === 'ArrowUp' || navigation === 'ArrowDown' ? 4 : 1)),
		})));
	});

	test('arrow keys cycle numeric values and wildcards but leave compound expressions alone', () => {
		const { input, key } = create('59 * * * MON-FRI');
		key(0, 'ArrowUp');
		const wildcard = input.value;
		key(0, 'ArrowUp');
		key(1, 'ArrowDown');
		key(4, 'ArrowUp');
		assert.deepStrictEqual({ wildcard, stepped: input.value }, { wildcard: '* * * * MON-FRI', stepped: '0 23 * * MON-FRI' });
	});
});
