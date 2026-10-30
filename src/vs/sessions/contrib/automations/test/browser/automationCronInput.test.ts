/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as DOM from '../../../../../base/browser/dom.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { IHoverOptions, IHoverWidget } from '../../../../../base/browser/ui/hover/hover.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { createTextInputActions } from '../../../../../workbench/browser/actions/textInputActions.js';
import { AutomationCronInput } from '../../browser/automationCronInput.js';
import '../../browser/media/automationDialog.css';
import '../../../../../workbench/browser/media/style.css';

suite('Automation cron segmented input', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function create(expression = '', timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone, hoverService: IHoverService = NullHoverService) {
		const container = DOM.append(DOM.getActiveDocument().body, DOM.$('div'));
		store.add(toDisposable(() => container.remove()));
		const input = store.add(new AutomationCronInput(container, expression, timeZone, new class extends mock<IContextViewService>() { }, hoverService));
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
			expressionLabel: container.querySelector('.automation-form-label')?.textContent,
			expressionAriaLabel: container.querySelector('[role="group"]')?.getAttribute('aria-label'),
			labels: elements.map(element => element.getAttribute('aria-label')),
			placeholders: elements.map(element => element.placeholder),
			captions: Array.from(container.querySelectorAll('.automation-cron-caption'), caption => caption.textContent),
		}, {
			initial: { value: '', error: '' }, value: '*/2 * * * *',
			expressionLabel: 'CRON expression', expressionAriaLabel: 'CRON expression',
			labels: ['Minute', 'Hour', 'Day of month', 'Month', 'Day of week'],
			placeholders: ['*', '*', '*', '*', '*'],
			captions: ['min', 'hour', 'day', 'month', 'weekday'],
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

	test('removes per-part focus outlines without removing the shared validation border', async () => {
		const { container, elements, change } = create('0 9 * * *');
		container.classList.add('monaco-workbench', 'automation-dialog');
		container.style.setProperty('--vscode-focusBorder', 'blue');
		container.style.setProperty('--vscode-inputValidation-errorBorder', 'red');
		await new Promise<void>(resolve => DOM.getWindow(container).requestAnimationFrame(() => resolve()));
		const group = container.querySelector<HTMLElement>('.automation-cron-segments')!;
		const results = [false, true].flatMap(invalid => {
			if (invalid) {
				change(2, 'asd');
			}
			return elements.map((element, index) => {
				element.focus();
				const inputBox = element.closest<HTMLElement>('.monaco-inputbox')!;
				const hasOutline = (target: HTMLElement) => {
					const style = DOM.getWindow(target).getComputedStyle(target);
					return style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
				};
				return {
					invalid, index, inputOutline: hasOutline(element), inputBoxOutline: hasOutline(inputBox),
					validationBorder: invalid ? DOM.getWindow(group).getComputedStyle(group).borderTopColor : undefined,
				};
			});
		});
		assert.deepStrictEqual(results, [false, true].flatMap(invalid => elements.map((_, index) => ({
			invalid, index, inputOutline: false, inputBoxOutline: false,
			validationBorder: invalid ? 'rgb(255, 0, 0)' : undefined,
		}))));
	});

	test('shows GitHub field guidance only for the focused segment and disposes it on Escape, blur and teardown', () => {
		const hovers: IHoverOptions[] = [];
		let active = 0;
		const hoverService: IHoverService = {
			...NullHoverService,
			showInstantHover: options => {
				hovers.push(options);
				active++;
				let disposed = false;
				const hover: IHoverWidget = {
					get isDisposed() { return disposed; },
					dispose: () => {
						if (!disposed) {
							disposed = true;
							active--;
						}
					},
				};
				return hover;
			},
		};
		const { container, input, elements, key } = create('15 1 * * MON-FRI', undefined, hoverService);
		const fields = elements.map(element => {
			element.focus();
			// Hidden Electron test pages update activeElement without emitting native focus events.
			element.dispatchEvent(new FocusEvent('focus'));
			const hover = hovers.at(-1);
			return {
				content: hover?.content,
				targetMatches: hover?.target === element,
				focused: DOM.getActiveDocument().activeElement === element,
				active,
			};
		});
		const escape = key(4, 'Escape');
		const dismissed = { active, prevented: escape.defaultPrevented, focused: DOM.getActiveDocument().activeElement === elements[4] };
		elements[0].focus();
		elements[0].dispatchEvent(new FocusEvent('focus'));
		elements[0].blur();
		elements[0].dispatchEvent(new FocusEvent('blur'));
		const afterBlur = active;
		elements[1].focus();
		elements[1].dispatchEvent(new FocusEvent('focus'));
		input.dispose();
		assert.deepStrictEqual({
			fields, dismissed, afterBlur, afterDispose: active,
			value: input.value, footer: container.querySelector('#automation-cron-hint')?.textContent,
		}, {
			fields: [
				'Every minute * or from 0 to 59',
				'Every hour * or from 0 to 23',
				'Every day * or from 1 to 31',
				'Every month * or from January (1) to December (12)',
				'Every day of week * or from Monday (1) to Sunday (7 and 0)',
			].map(content => ({ content, targetMatches: true, focused: true, active: 1 })),
			dismissed: { active: 0, prevented: true, focused: true }, afterBlur: 0, afterDispose: 0,
			value: '15 1 * * MON-FRI', footer: 'Evaluated in local time.',
		});
	});

	test('keeps the local-time footer visible during editing without mislabeling a saved foreign zone', () => {
		const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		const foreignTimeZone = localTimeZone === 'UTC' ? 'Europe/Berlin' : 'UTC';
		const results = [localTimeZone, foreignTimeZone].map(timeZone => {
			const { container, elements } = create('0 9 * * *', timeZone);
			const footer = () => container.querySelector('#automation-cron-hint')?.textContent;
			const before = footer();
			elements[0].focus();
			const focused = footer();
			const description = elements[0].getAttribute('aria-describedby')!.split(' ')
				.map(id => container.querySelector(`#${id}`)?.textContent);
			elements[0].blur();
			return { timeZone, before, focused, blurred: footer(), description };
		});
		assert.deepStrictEqual(results, [localTimeZone, foreignTimeZone].map(timeZone => {
			const text = timeZone === localTimeZone ? 'Evaluated in local time.' : `Evaluated in ${timeZone}.`;
			return { timeZone, before: text, focused: text, blurred: text, description: ['Every minute * or from 0 to 59', text, ''] };
		}));
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

	test('clipboard menus retain whole-expression selection until an outside control gains focus', () => {
		const expression = '15 1 * * MON-FRI';
		const results = ['copy', 'cut'].map(type => {
			const { input, elements, key } = create(expression);
			const menu = DOM.append(DOM.getActiveDocument().body, DOM.$('.monaco-menu-container'));
			store.add(toDisposable(() => menu.remove()));
			const menuItem = DOM.append(menu, DOM.$('button'));
			elements[1].focus();
			key(1, 'a', true);
			elements[1].dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true }));
			menuItem.focus();
			elements[1].dispatchEvent(new FocusEvent('blur', { relatedTarget: menuItem }));
			elements[1].focus();
			const clipboardData = new DataTransfer();
			elements[1].dispatchEvent(new ClipboardEvent(type, { clipboardData, bubbles: true, cancelable: true }));
			const value = input.value;
			key(1, 'a', true);
			menuItem.focus();
			elements[1].dispatchEvent(new FocusEvent('blur', { relatedTarget: menuItem }));
			const outside = DOM.append(DOM.getActiveDocument().body, DOM.$('button'));
			store.add(toDisposable(() => outside.remove()));
			outside.focus();
			outside.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
			elements[1].focus();
			const afterOutside = new DataTransfer();
			elements[1].dispatchEvent(new ClipboardEvent('copy', { clipboardData: afterOutside, bubbles: true, cancelable: true }));
			return { type, copied: clipboardData.getData('text/plain'), value, copiedAfterOutside: afterOutside.getData('text/plain') };
		});
		assert.deepStrictEqual(results, [
			{ type: 'copy', copied: expression, value: expression, copiedAfterOutside: '' },
			{ type: 'cut', copied: expression, value: '', copiedAfterOutside: '' },
		]);
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
