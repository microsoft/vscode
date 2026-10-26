/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import Severity from '../../../../../base/common/severity.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IContextMenuService, IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IInlineEditInputBoxOptions, InlineEditInputBox } from '../../../../browser/parts/views/inlineEditInputBox.js';
import { IEditableData } from '../../../../common/views.js';

suite('InlineEditInputBox', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let container: HTMLElement;
	let instantiationService: TestInstantiationService;
	let finished: [string, boolean][];
	let onDidFinish: Emitter<void>;
	let onDidHideContextMenu: Emitter<void>;

	setup(() => {
		container = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		finished = [];
		onDidFinish = store.add(new Emitter<void>());
		onDidHideContextMenu = store.add(new Emitter<void>());
		instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IContextViewService, { showContextView: () => ({ close: () => { } }), hideContextView: () => { }, layout: () => { } });
		instantiationService.stub(IContextMenuService, { onDidHideContextMenu: onDidHideContextMenu.event });
	});

	teardown(() => {
		container.remove();
	});

	function createInputBox(editableData: Partial<IEditableData>, options: IInlineEditInputBoxOptions): InlineEditInputBox {
		return store.add(instantiationService.createInstance(InlineEditInputBox, container, {
			validationMessage: () => null,
			onFinish: async (value, success) => {
				finished.push([value, success]);
				onDidFinish.fire();
			},
			...editableData
		}, options));
	}

	function pressKey(inputBox: InlineEditInputBox, key: 'Enter' | 'Escape'): void {
		inputBox.inputBox.inputElement.dispatchEvent(new KeyboardEvent('keydown', { key, keyCode: key === 'Enter' ? 13 : 27, bubbles: true, cancelable: true }));
	}

	function appendButton(parent: HTMLElement): HTMLElement {
		return parent.appendChild(mainWindow.document.createElement('button'));
	}

	async function moveFocus(inputBox: InlineEditInputBox, target: HTMLElement): Promise<void> {
		target.focus();
		// Focus events are not dispatched reliably while the test window itself is not focused
		inputBox.inputBox.inputElement.dispatchEvent(new FocusEvent('blur'));
		await timeout(0);
	}

	test('initializes the value and selection and accepts on Enter', () => {
		const inputBox = createInputBox({}, { ariaLabel: 'Rename', value: 'file.txt', selection: { start: 0, end: 4 } });
		const input = inputBox.inputBox.inputElement;
		const initial = { value: input.value, selection: [input.selectionStart, input.selectionEnd], focused: mainWindow.document.activeElement === input };

		inputBox.inputBox.value = 'other.txt';
		pressKey(inputBox, 'Enter');

		assert.deepStrictEqual({ initial, finished, rendered: container.childElementCount }, {
			initial: { value: 'file.txt', selection: [0, 4], focused: true },
			finished: [['other.txt', true]],
			rendered: 0
		});
	});

	test('keeps editing on Enter with an error and cancels on Escape', () => {
		const inputBox = createInputBox({ validationMessage: value => value === 'bad' ? { content: 'Error', severity: Severity.Error } : null }, { ariaLabel: 'Rename', value: 'good' });

		inputBox.inputBox.value = 'bad';
		pressKey(inputBox, 'Enter');
		const finishedAfterEnter = [...finished];
		pressKey(inputBox, 'Escape');

		assert.deepStrictEqual({ finishedAfterEnter, finished, rendered: container.childElementCount }, {
			finishedAfterEnter: [],
			finished: [['bad', false]],
			rendered: 0
		});
	});

	test('accepts values with non-error messages', () => {
		const inputBox = createInputBox({ validationMessage: () => ({ content: 'Info', severity: Severity.Info }) }, { ariaLabel: 'Rename', value: 'name' });

		const valid = inputBox.inputBox.isInputValid();
		pressKey(inputBox, 'Enter');

		assert.deepStrictEqual({ valid, finished }, { valid: true, finished: [['name', true]] });
	});

	test('refreshes messages on value changes without key events', () => {
		const inputBox = createInputBox({
			validationMessage: value => value === 'bad' ? { content: 'Error', severity: Severity.Error } : value ? null : { content: 'Info', severity: Severity.Info }
		}, { ariaLabel: 'Rename', value: 'name' });
		const messageType = () => ['info', 'warning', 'error'].find(type => inputBox.inputBox.element.classList.contains(type)) ?? 'none';
		const changeValue = (value: string) => {
			// Pasting, dropping or composing text changes the value without key up events
			inputBox.inputBox.inputElement.value = value;
			inputBox.inputBox.inputElement.dispatchEvent(new InputEvent('input'));
			return messageType();
		};

		assert.deepStrictEqual(
			[messageType(), changeValue(''), changeValue('bad'), changeValue(''), changeValue('name')],
			['none', 'info', 'error', 'info', 'none']
		);
	});

	test('accepts valid values and cancels invalid values when focus moves elsewhere', async () => {
		const validationMessage = (value: string) => value === 'bad' ? { content: 'Error', severity: Severity.Error } : null;
		const elsewhere = appendButton(container);

		const valid = createInputBox({ validationMessage }, { ariaLabel: 'Rename', value: 'good' });
		await moveFocus(valid, elsewhere);

		const invalid = createInputBox({ validationMessage }, { ariaLabel: 'Rename', value: 'good' });
		invalid.inputBox.value = 'bad';
		await moveFocus(invalid, elsewhere);

		assert.deepStrictEqual(finished, [['good', true], ['bad', false]]);
	});

	test('keeps editing while a context menu is open', async () => {
		const inputBox = createInputBox({}, { ariaLabel: 'Rename', value: 'name' });
		const contextView = container.appendChild(mainWindow.document.createElement('div'));
		contextView.classList.add('context-view');
		const elsewhere = appendButton(container);

		await moveFocus(inputBox, appendButton(contextView));
		const finishedWhileMenuOpen = [...finished];

		const didFinish = Event.toPromise(onDidFinish.event);
		elsewhere.focus();
		onDidHideContextMenu.fire();
		await didFinish;

		assert.deepStrictEqual({ finishedWhileMenuOpen, finished }, { finishedWhileMenuOpen: [], finished: [['name', true]] });
	});

	test('defaults to the starting value and removes the input box without finishing when disposed', () => {
		const inputBox = createInputBox({ startingValue: 'start', placeholder: 'Placeholder' }, { ariaLabel: 'Rename' });
		const input = inputBox.inputBox.inputElement;
		const initial = { value: input.value, placeholder: input.placeholder, selection: [input.selectionStart, input.selectionEnd] };

		inputBox.dispose();

		assert.deepStrictEqual({ initial, finished, rendered: container.childElementCount }, {
			initial: { value: 'start', placeholder: 'Placeholder', selection: [0, 5] },
			finished: [],
			rendered: 0
		});
	});
});
