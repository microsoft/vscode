/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { WebviewFindDelegate, WebviewFindWidget } from '../../browser/webviewFindWidget.js';

suite('WebviewFindWidget', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let input: HTMLInputElement;
	let nextButton: HTMLElement;
	let hasFindResult: Emitter<boolean>;
	let searches: string[];
	let inputFocusSpy: sinon.SinonSpy;
	let nextButtonFocusSpy: sinon.SinonSpy;

	setup(async () => {
		searches = [];
		hasFindResult = store.add(new Emitter<boolean>());
		const delegate: WebviewFindDelegate = {
			hasFindResult: hasFindResult.event,
			onDidStopFind: Event.None,
			checkImeCompletionState: true,
			find: () => { },
			updateFind: value => { searches.push(value); },
			stopFind: () => { },
			focus: () => { },
		};

		const container = document.createElement('div');
		container.className = 'monaco-workbench';
		document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));

		const instantiationService = workbenchInstantiationService(undefined, store);
		const widget = store.add(instantiationService.createInstance(WebviewFindWidget, delegate));
		container.appendChild(widget.getDomNode());
		widget.show();
		await timeout(0);

		const inputElement = widget.getFindInputDomNode().querySelector('input');
		const nextButtonElement = widget.getDomNode().querySelector<HTMLElement>('.codicon-find-next-match');
		assert.ok(inputElement);
		assert.ok(nextButtonElement);
		input = inputElement;
		nextButton = nextButtonElement;
		input.focus();
		assert.strictEqual(document.activeElement, input);

		// An unfocused Electron test window does not reliably dispatch DOM focus events.
		inputFocusSpy = sinon.spy(input, 'focus');
		nextButtonFocusSpy = sinon.spy(nextButton, 'focus');
	});

	teardown(() => {
		sinon.restore();
	});

	test('compositionend updates search without moving focus', () => {
		input.dispatchEvent(new CompositionEvent('compositionstart'));
		input.value = 'ㅇ';
		input.dispatchEvent(new InputEvent('input', { isComposing: true }));
		const searchesDuringComposition = [...searches];

		// Chromium delivers the committed input before compositionend, while still composing.
		input.value = '안';
		input.dispatchEvent(new InputEvent('input', { isComposing: true }));
		input.dispatchEvent(new CompositionEvent('compositionend', { data: '안' }));

		assert.deepStrictEqual({
			searchesDuringComposition,
			searches,
			inputFocusCalls: inputFocusSpy.callCount,
			nextButtonFocusCalls: nextButtonFocusSpy.callCount,
			inputHasFocus: document.activeElement === input,
		}, {
			searchesDuringComposition: [],
			searches: ['안'],
			inputFocusCalls: 0,
			nextButtonFocusCalls: 0,
			inputHasFocus: true,
		});
	});

	test('find results do not move focus after a new composition starts', () => {
		input.dispatchEvent(new CompositionEvent('compositionstart'));
		input.value = '안';
		input.dispatchEvent(new CompositionEvent('compositionend', { data: '안' }));

		input.dispatchEvent(new CompositionEvent('compositionstart'));
		input.value = '안ㄴ';
		input.dispatchEvent(new InputEvent('input', { isComposing: true }));
		inputFocusSpy.resetHistory();
		nextButtonFocusSpy.resetHistory();

		// Deliver the previous search result after the next syllable has started composing.
		hasFindResult.fire(true);

		assert.deepStrictEqual({
			searches,
			nextButtonEnabled: nextButton.getAttribute('aria-disabled') === 'false',
			inputFocusCalls: inputFocusSpy.callCount,
			nextButtonFocusCalls: nextButtonFocusSpy.callCount,
			inputHasFocus: document.activeElement === input,
		}, {
			searches: ['안'],
			nextButtonEnabled: true,
			inputFocusCalls: 0,
			nextButtonFocusCalls: 0,
			inputHasFocus: true,
		});
	});

	test('normal input still updates search and restores focus', () => {
		input.value = 'hello';
		input.dispatchEvent(new InputEvent('input', { data: 'hello' }));

		assert.deepStrictEqual({
			searches,
			inputFocusCalls: inputFocusSpy.callCount,
			nextButtonFocusCalls: nextButtonFocusSpy.callCount,
			inputFocusedAfterNextButton: inputFocusSpy.calledAfter(nextButtonFocusSpy),
			inputHasFocus: document.activeElement === input,
		}, {
			searches: ['hello'],
			inputFocusCalls: 1,
			nextButtonFocusCalls: 1,
			inputFocusedAfterNextButton: true,
			inputHasFocus: true,
		});
	});
});
