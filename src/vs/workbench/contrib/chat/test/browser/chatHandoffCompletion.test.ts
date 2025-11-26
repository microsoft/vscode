/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isHandoffResponseComplete, waitForHandoffResponseCompletion } from '../../browser/chatWidget.js';
import { IChatModel } from '../../common/chatModel.js';
import { IChatRequestViewModel, IChatResponseViewModel, IChatViewModel, IChatViewModelChangeEvent, isResponseVM } from '../../common/chatViewModel.js';

/**
 * Creates a minimal mock response that passes the isResponseVM type guard and has the properties
 * needed for handoff completion checking.
 */
function createMockResponse(isComplete: boolean, isPending: boolean): IChatRequestViewModel | IChatResponseViewModel {
	const pendingObs = observableValue<{ startedWaitingAt: number } | undefined>(
		'pending',
		isPending ? { startedWaitingAt: Date.now() } : undefined
	);

	return {
		// Required for isResponseVM type guard - it checks for setVote
		setVote: () => { },
		// Required properties for isHandoffResponseComplete
		isComplete,
		model: {
			isPendingConfirmation: pendingObs
		}
	} as unknown as IChatResponseViewModel;
}

/**
 * Mock view model that provides configurable items and fires change events
 */
class MockChatViewModel implements IChatViewModel {
	private readonly _onDidChange = new Emitter<IChatViewModelChangeEvent>();
	readonly onDidChange = this._onDidChange.event;
	readonly onDidDisposeModel = Event.None;

	private _items: (IChatRequestViewModel | IChatResponseViewModel)[] = [];

	readonly model = undefined as unknown as IChatModel;
	readonly sessionResource = URI.parse('chat-session://test/session');
	readonly inputPlaceholder = undefined;
	readonly editing = undefined;

	constructor(private readonly store: DisposableStore) {
		this.store.add(this._onDidChange);
	}

	getItems(): (IChatRequestViewModel | IChatResponseViewModel)[] {
		return this._items;
	}

	setItems(items: (IChatRequestViewModel | IChatResponseViewModel)[]): void {
		this._items = items;
	}

	fireChange(event: IChatViewModelChangeEvent = null): void {
		this._onDidChange.fire(event);
	}

	setInputPlaceholder = () => { };
	resetInputPlaceholder = () => { };
	setEditing = () => { };
}

suite('Handoff Response Completion', () => {
	let store: DisposableStore;

	setup(() => {
		store = new DisposableStore();
	});

	teardown(() => {
		store.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('isHandoffResponseComplete', () => {
		test('returns false when viewModel is undefined', () => {
			const result = isHandoffResponseComplete(undefined);
			assert.strictEqual(result, false);
		});

		test('returns false when viewModel has no items', () => {
			const viewModel = new MockChatViewModel(store);
			viewModel.setItems([]);

			const result = isHandoffResponseComplete(viewModel);
			assert.strictEqual(result, false);
		});

		test('returns false when last item is not a response', () => {
			const viewModel = new MockChatViewModel(store);
			// Create a request-like item (does not have setVote, so isResponseVM returns false)
			const requestItem = { message: 'test' } as unknown as IChatRequestViewModel;
			viewModel.setItems([requestItem]);

			const result = isHandoffResponseComplete(viewModel);
			assert.strictEqual(result, false);
		});

		test('returns false when response is not complete', () => {
			const viewModel = new MockChatViewModel(store);
			const responseItem = createMockResponse(false, false); // isComplete = false
			viewModel.setItems([responseItem]);

			const result = isHandoffResponseComplete(viewModel);
			assert.strictEqual(result, false);
		});

		test('returns false when response is complete but pending confirmation', () => {
			const viewModel = new MockChatViewModel(store);
			const responseItem = createMockResponse(true, true); // isComplete = true, isPending = true
			viewModel.setItems([responseItem]);

			const result = isHandoffResponseComplete(viewModel);
			assert.strictEqual(result, false);
		});

		test('returns true when response is complete and not pending confirmation', () => {
			const viewModel = new MockChatViewModel(store);
			const responseItem = createMockResponse(true, false); // isComplete = true, not pending
			viewModel.setItems([responseItem]);

			const result = isHandoffResponseComplete(viewModel);
			assert.strictEqual(result, true);
		});

		test('uses last item when multiple items exist', () => {
			const viewModel = new MockChatViewModel(store);

			// First response - incomplete
			const responseItem1 = createMockResponse(false, false);
			// Second response - complete and not pending
			const responseItem2 = createMockResponse(true, false);

			viewModel.setItems([responseItem1, responseItem2]);

			const result = isHandoffResponseComplete(viewModel);
			assert.strictEqual(result, true, 'Should check only the last item');
		});
	});

	suite('waitForHandoffResponseCompletion', () => {
		test('resolves immediately when response completes on first change event', async () => {
			const viewModel = new MockChatViewModel(store);

			// Start with incomplete response
			const responseItem = createMockResponse(false, false);
			viewModel.setItems([responseItem]);

			// Start waiting
			const waitPromise = waitForHandoffResponseCompletion(viewModel, 1000);

			// Update to complete response
			const completeResponse = createMockResponse(true, false);
			viewModel.setItems([completeResponse]);
			viewModel.fireChange();

			// Should resolve quickly
			const startTime = Date.now();
			await waitPromise;
			const elapsed = Date.now() - startTime;

			assert.ok(elapsed < 100, `Should resolve immediately, took ${elapsed}ms`);
		});

		test('resolves after response becomes complete (pending confirmation cleared)', async () => {
			const viewModel = new MockChatViewModel(store);

			// Start with pending confirmation
			const responseItem = createMockResponse(true, true);
			viewModel.setItems([responseItem]);

			// Start waiting
			const waitPromise = waitForHandoffResponseCompletion(viewModel, 1000);

			// Clear pending confirmation after a short delay
			setTimeout(() => {
				const completeResponse = createMockResponse(true, false);
				viewModel.setItems([completeResponse]);
				viewModel.fireChange();
			}, 50);

			const startTime = Date.now();
			await waitPromise;
			const elapsed = Date.now() - startTime;

			assert.ok(elapsed >= 40, `Should wait for pending to clear, took ${elapsed}ms`);
			assert.ok(elapsed < 200, `Should not wait too long, took ${elapsed}ms`);
		});

		test('resolves on timeout when response never completes', async () => {
			const viewModel = new MockChatViewModel(store);

			// Response that stays pending forever
			const responseItem = createMockResponse(true, true);
			viewModel.setItems([responseItem]);

			const timeoutMs = 100; // Short timeout for test
			const startTime = Date.now();
			await waitForHandoffResponseCompletion(viewModel, timeoutMs);
			const elapsed = Date.now() - startTime;

			assert.ok(elapsed >= timeoutMs - 10, `Should wait for timeout, took ${elapsed}ms`);
			assert.ok(elapsed < timeoutMs + 50, `Should not wait too long past timeout, took ${elapsed}ms`);
		});

		test('cleans up disposable when resolved via completion', async () => {
			const viewModel = new MockChatViewModel(store);

			const completeResponse = createMockResponse(true, false);
			viewModel.setItems([completeResponse]);

			// Wait promise should resolve and clean up
			const waitPromise = waitForHandoffResponseCompletion(viewModel, 1000);
			viewModel.fireChange();

			await waitPromise;

			// Fire another change - should not cause issues if cleanup worked
			viewModel.fireChange();
			// If we get here without errors, cleanup was successful
		});

		test('cleans up disposable when resolved via timeout', async () => {
			const viewModel = new MockChatViewModel(store);

			const pendingResponse = createMockResponse(true, true);
			viewModel.setItems([pendingResponse]);

			const waitPromise = waitForHandoffResponseCompletion(viewModel, 50);

			await waitPromise;

			// Fire changes after timeout - should not cause issues if cleanup worked
			viewModel.fireChange();
			// If we get here without errors, cleanup was successful
		});

		test('handles multiple change events before completion', async () => {
			const viewModel = new MockChatViewModel(store);

			const incompleteResponse = createMockResponse(false, false);
			viewModel.setItems([incompleteResponse]);

			const waitPromise = waitForHandoffResponseCompletion(viewModel, 500);

			// Fire several change events before completion
			viewModel.fireChange();
			viewModel.fireChange();
			viewModel.fireChange();

			// Now complete the response
			const completeResponse = createMockResponse(true, false);
			viewModel.setItems([completeResponse]);
			viewModel.fireChange();

			const startTime = Date.now();
			await waitPromise;
			const elapsed = Date.now() - startTime;

			assert.ok(elapsed < 100, `Should resolve on completion, not timeout, took ${elapsed}ms`);
		});
	});

	suite('isResponseVM type guard', () => {
		test('correctly identifies response view model', () => {
			const responseItem = createMockResponse(true, false);

			assert.strictEqual(isResponseVM(responseItem), true);
		});

		test('rejects non-response items', () => {
			const requestItem = { message: 'test' };
			assert.strictEqual(isResponseVM(requestItem), false);
		});

		test('rejects null and undefined', () => {
			assert.strictEqual(isResponseVM(null), false);
			assert.strictEqual(isResponseVM(undefined), false);
		});
	});
});
