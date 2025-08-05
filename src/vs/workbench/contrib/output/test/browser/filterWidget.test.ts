/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { FilterWidget } from '../../../browser/parts/views/viewFilter.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';

suite('FilterWidget Event Handling', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;

	setup(() => {
		instantiationService = disposables.add(workbenchInstantiationService({}, disposables));
	});

	test('eventTargetShouldHandleInput returns true for input events in text fields', () => {
		const filterWidget = disposables.add(instantiationService.createInstance(FilterWidget, {
			placeholder: 'Test filter',
			text: ''
		}));

		// Create a mock input element and keyboard event
		const inputElement = document.createElement('input');
		const keyEvent = new KeyboardEvent('keydown', { code: 'KeyA' });

		// Mock the event target
		Object.defineProperty(keyEvent, 'target', { value: inputElement });

		// Test that typing events should be handled by input
		const shouldHandle = (filterWidget as any).eventTargetShouldHandleInput(keyEvent);
		assert.strictEqual(shouldHandle, true, 'Input field should handle typing events');
	});

	test('eventTargetShouldHandleInput returns true for escape key when input has text', () => {
		const filterWidget = disposables.add(instantiationService.createInstance(FilterWidget, {
			placeholder: 'Test filter',
			text: ''
		}));

		// Create a mock input element with text and escape key event
		const inputElement = document.createElement('input');
		inputElement.value = 'some text';
		const escapeEvent = new KeyboardEvent('keydown', { code: 'Escape' });

		// Mock the event target
		Object.defineProperty(escapeEvent, 'target', { value: inputElement });

		// Test that escape should be handled by input when there's text
		const shouldHandle = (filterWidget as any).eventTargetShouldHandleInput(escapeEvent);
		assert.strictEqual(shouldHandle, true, 'Input field should handle escape when it has text');
	});

	test('eventTargetShouldHandleInput returns false for escape key when input is empty', () => {
		const filterWidget = disposables.add(instantiationService.createInstance(FilterWidget, {
			placeholder: 'Test filter',
			text: ''
		}));

		// Create a mock input element without text and escape key event
		const inputElement = document.createElement('input');
		inputElement.value = '';
		const escapeEvent = new KeyboardEvent('keydown', { code: 'Escape' });

		// Mock the event target
		Object.defineProperty(escapeEvent, 'target', { value: inputElement });

		// Test that escape should not be handled by input when it's empty
		const shouldHandle = (filterWidget as any).eventTargetShouldHandleInput(escapeEvent);
		assert.strictEqual(shouldHandle, false, 'Input field should not handle escape when empty');
	});

	test('eventTargetShouldHandleInput returns false for non-input elements', () => {
		const filterWidget = disposables.add(instantiationService.createInstance(FilterWidget, {
			placeholder: 'Test filter',
			text: ''
		}));

		// Create a mock div element and keyboard event
		const divElement = document.createElement('div');
		const keyEvent = new KeyboardEvent('keydown', { code: 'KeyA' });

		// Mock the event target
		Object.defineProperty(keyEvent, 'target', { value: divElement });

		// Test that non-input elements should not handle input events
		const shouldHandle = (filterWidget as any).eventTargetShouldHandleInput(keyEvent);
		assert.strictEqual(shouldHandle, false, 'Non-input elements should not handle input events');
	});
});