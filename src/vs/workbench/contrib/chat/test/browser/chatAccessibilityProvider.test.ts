/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Emitter } from '../../../../../base/common/event.js';
import { observableFromEvent } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAccessibleViewService } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ChatAccessibilityProvider } from '../../browser/chatAccessibilityProvider.js';
import { IChatResponseViewModel } from '../../common/chatViewModel.js';
import { IChatToolInvocation } from '../../common/chatService.js';

suite('ChatAccessibilityProvider', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let chatAccessibilityProvider: ChatAccessibilityProvider;

	setup(() => {
		instantiationService = testDisposables.add(new TestInstantiationService());
		
		// Mock IAccessibleViewService
		const mockAccessibleViewService = {
			getOpenAriaHint: () => undefined
		} as IAccessibleViewService;
		instantiationService.stub(IAccessibleViewService, mockAccessibleViewService);

		chatAccessibilityProvider = testDisposables.add(instantiationService.createInstance(ChatAccessibilityProvider));
	});

	test('should handle tool invocation with undefined confirmationMessages.title gracefully', () => {
		// Create a mock tool invocation with undefined confirmationMessages.title
		const mockToolInvocation: IChatToolInvocation = {
			kind: 'toolInvocation',
			toolId: 'test-tool',
			toolCallId: 'test-call-id',
			presentation: undefined,
			confirmationMessages: undefined, // This is the problematic case
			confirmed: new DeferredPromise<boolean>(),
			isConfirmed: undefined,
			originMessage: undefined,
			invocationMessage: 'Test tool invocation',
			pastTenseMessage: undefined,
			resultDetails: undefined,
			progress: observableFromEvent(new Emitter<{ message?: string | MarkdownString; progress: number }>().event, () => ({ message: undefined, progress: 0 })),
			isCompletePromise: Promise.resolve(),
			isComplete: true,
			complete: () => {}
		};

		// Create a mock response view model
		const mockResponseViewModel: IChatResponseViewModel = {
			response: {
				value: [mockToolInvocation],
				toString: () => 'Mock response content'
			}
		} as any;

		// Test that getAriaLabel doesn't throw and doesn't include "undefined"
		const ariaLabel = chatAccessibilityProvider.getAriaLabel(mockResponseViewModel);
		
		// The aria label should not contain "undefined"
		assert.ok(!ariaLabel.includes('undefined'), `Aria label should not contain "undefined", but got: "${ariaLabel}"`);
		
		// The aria label should not contain "Tool undefined completed"
		assert.ok(!ariaLabel.includes('Tool undefined completed'), `Aria label should not contain "Tool undefined completed", but got: "${ariaLabel}"`);
		
		// The aria label should contain the fallback tool id
		assert.ok(ariaLabel.includes('Tool test-tool completed'), `Aria label should contain "Tool test-tool completed", but got: "${ariaLabel}"`);
	});

	test('should handle tool invocation with undefined title but defined confirmationMessages', () => {
		// Create a mock tool invocation with confirmationMessages but undefined title
		const mockToolInvocation: IChatToolInvocation = {
			kind: 'toolInvocation',
			toolId: 'test-tool-2',
			toolCallId: 'test-call-id-2',
			presentation: undefined,
			confirmationMessages: {
				title: undefined as any, // This is another problematic case
				message: 'Test message'
			},
			confirmed: new DeferredPromise<boolean>(),
			isConfirmed: undefined,
			originMessage: undefined,
			invocationMessage: 'Test tool invocation',
			pastTenseMessage: undefined,
			resultDetails: undefined,
			progress: observableFromEvent(new Emitter<{ message?: string | MarkdownString; progress: number }>().event, () => ({ message: undefined, progress: 0 })),
			isCompletePromise: Promise.resolve(),
			isComplete: true,
			complete: () => {}
		};

		// Create a mock response view model
		const mockResponseViewModel: IChatResponseViewModel = {
			response: {
				value: [mockToolInvocation],
				toString: () => 'Mock response content'
			}
		} as any;

		// Test that getAriaLabel doesn't throw and doesn't include "undefined"
		const ariaLabel = chatAccessibilityProvider.getAriaLabel(mockResponseViewModel);
		
		// The aria label should not contain "undefined"
		assert.ok(!ariaLabel.includes('undefined'), `Aria label should not contain "undefined", but got: "${ariaLabel}"`);
		
		// The aria label should not contain "Tool undefined completed"
		assert.ok(!ariaLabel.includes('Tool undefined completed'), `Aria label should not contain "Tool undefined completed", but got: "${ariaLabel}"`);
		
		// The aria label should contain the fallback tool id
		assert.ok(ariaLabel.includes('Tool test-tool-2 completed'), `Aria label should contain "Tool test-tool-2 completed", but got: "${ariaLabel}"`);
	});

	test('should handle tool invocation with valid string title', () => {
		// Create a mock tool invocation with a valid string title
		const mockToolInvocation: IChatToolInvocation = {
			kind: 'toolInvocation',
			toolId: 'test-tool',
			toolCallId: 'test-call-id',
			presentation: undefined,
			confirmationMessages: {
				title: 'Test Tool',
				message: 'Test message'
			},
			confirmed: new DeferredPromise<boolean>(),
			isConfirmed: undefined,
			originMessage: undefined,
			invocationMessage: 'Test tool invocation',
			pastTenseMessage: undefined,
			resultDetails: undefined,
			progress: observableFromEvent(new Emitter<{ message?: string | MarkdownString; progress: number }>().event, () => ({ message: undefined, progress: 0 })),
			isCompletePromise: Promise.resolve(),
			isComplete: true,
			complete: () => {}
		};

		// Create a mock response view model
		const mockResponseViewModel: IChatResponseViewModel = {
			response: {
				value: [mockToolInvocation],
				toString: () => 'Mock response content'
			}
		} as any;

		// Test that getAriaLabel works correctly with valid title
		const ariaLabel = chatAccessibilityProvider.getAriaLabel(mockResponseViewModel);
		
		// The aria label should contain "Tool Test Tool completed"
		assert.ok(ariaLabel.includes('Tool Test Tool completed'), `Aria label should contain "Tool Test Tool completed", but got: "${ariaLabel}"`);
	});

	test('should handle tool invocation with valid MarkdownString title', () => {
		// Create a mock tool invocation with a valid MarkdownString title
		const mockToolInvocation: IChatToolInvocation = {
			kind: 'toolInvocation',
			toolId: 'test-tool',
			toolCallId: 'test-call-id',
			presentation: undefined,
			confirmationMessages: {
				title: new MarkdownString('**Test Tool**'),
				message: 'Test message'
			},
			confirmed: new DeferredPromise<boolean>(),
			isConfirmed: undefined,
			originMessage: undefined,
			invocationMessage: 'Test tool invocation',
			pastTenseMessage: undefined,
			resultDetails: undefined,
			progress: observableFromEvent(new Emitter<{ message?: string | MarkdownString; progress: number }>().event, () => ({ message: undefined, progress: 0 })),
			isCompletePromise: Promise.resolve(),
			isComplete: true,
			complete: () => {}
		};

		// Create a mock response view model
		const mockResponseViewModel: IChatResponseViewModel = {
			response: {
				value: [mockToolInvocation],
				toString: () => 'Mock response content'
			}
		} as any;

		// Test that getAriaLabel works correctly with MarkdownString title
		const ariaLabel = chatAccessibilityProvider.getAriaLabel(mockResponseViewModel);
		
		// The aria label should contain "Tool **Test Tool** completed"
		assert.ok(ariaLabel.includes('Tool **Test Tool** completed'), `Aria label should contain "Tool **Test Tool** completed", but got: "${ariaLabel}"`);
	});

	test('should handle tool invocation with empty or whitespace-only title', () => {
		// Create a mock tool invocation with empty title
		const mockToolInvocation1: IChatToolInvocation = {
			kind: 'toolInvocation',
			toolId: 'empty-title-tool',
			toolCallId: 'test-call-id-empty',
			presentation: undefined,
			confirmationMessages: {
				title: '',
				message: 'Test message'
			},
			confirmed: new DeferredPromise<boolean>(),
			isConfirmed: undefined,
			originMessage: undefined,
			invocationMessage: 'Test tool invocation',
			pastTenseMessage: undefined,
			resultDetails: undefined,
			progress: observableFromEvent(new Emitter<{ message?: string | MarkdownString; progress: number }>().event, () => ({ message: undefined, progress: 0 })),
			isCompletePromise: Promise.resolve(),
			isComplete: true,
			complete: () => {}
		};

		// Create a mock tool invocation with whitespace-only title
		const mockToolInvocation2: IChatToolInvocation = {
			kind: 'toolInvocation',
			toolId: 'whitespace-title-tool',
			toolCallId: 'test-call-id-whitespace',
			presentation: undefined,
			confirmationMessages: {
				title: '   ',
				message: 'Test message'
			},
			confirmed: new DeferredPromise<boolean>(),
			isConfirmed: undefined,
			originMessage: undefined,
			invocationMessage: 'Test tool invocation',
			pastTenseMessage: undefined,
			resultDetails: undefined,
			progress: observableFromEvent(new Emitter<{ message?: string | MarkdownString; progress: number }>().event, () => ({ message: undefined, progress: 0 })),
			isCompletePromise: Promise.resolve(),
			isComplete: true,
			complete: () => {}
		};

		// Test empty title
		const mockResponseViewModel1: IChatResponseViewModel = {
			response: {
				value: [mockToolInvocation1],
				toString: () => 'Mock response content'
			}
		} as any;

		const ariaLabel1 = chatAccessibilityProvider.getAriaLabel(mockResponseViewModel1);
		assert.ok(ariaLabel1.includes('Tool empty-title-tool completed'), `Aria label should use tool ID for empty title, but got: "${ariaLabel1}"`);

		// Test whitespace-only title
		const mockResponseViewModel2: IChatResponseViewModel = {
			response: {
				value: [mockToolInvocation2],
				toString: () => 'Mock response content'
			}
		} as any;

		const ariaLabel2 = chatAccessibilityProvider.getAriaLabel(mockResponseViewModel2);
		assert.ok(ariaLabel2.includes('Tool whitespace-title-tool completed'), `Aria label should use tool ID for whitespace-only title, but got: "${ariaLabel2}"`);
	});
});