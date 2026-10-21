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
		const key = (index: number, key: string, ctrlKey = false) => {
			elements[index].dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey, bubbles: true, cancelable: true }));
		};
		const paste = (index: number, text: string) => {
			const clipboardData = new DataTransfer();
			clipboardData.setData('text/plain', text);
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
		paste(0, '*/2 * * * MON-FRI');
		const valid = input.value;
		paste(0, '0 1 2 3 4 5');
		assert.deepStrictEqual({ valid, surplus: input.value, invalid: container.querySelector('.automation-cron-segments')?.classList.contains('invalid') }, {
			valid: '*/2 * * * MON-FRI', surplus: '0 1 2 3 4 5', invalid: true,
		});
	});

	test('supports whole-expression selection, copy, replacement, and clearing', () => {
		const { input, elements, key, change, paste } = create('*/2 * * * MON-FRI');
		const changes: string[] = [];
		store.add(input.onDidChange(value => changes.push(value)));
		key(3, 'a', true);
		const clipboardData = new DataTransfer();
		elements[3].dispatchEvent(new ClipboardEvent('copy', { clipboardData, bubbles: true, cancelable: true }));
		change(3, 'JAN');
		const replaced = input.value;
		key(3, 'a', true);
		paste(3, '0 9 * * MON');
		const pasted = input.value;
		key(0, 'a', true);
		key(0, 'Backspace');
		assert.deepStrictEqual({ copied: clipboardData.getData('text/plain'), replaced, pasted, cleared: input.value, changes }, {
			copied: '*/2 * * * MON-FRI', replaced: '* * * JAN *', pasted: '0 9 * * MON', cleared: '',
			changes: ['* * * JAN *', '0 9 * * MON', ''],
		});
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
