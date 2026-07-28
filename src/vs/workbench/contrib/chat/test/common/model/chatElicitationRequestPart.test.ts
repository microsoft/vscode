/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ChatElicitationRequestPart } from '../../../common/model/chatProgressTypes/chatElicitationRequestPart.js';
import { ElicitationState } from '../../../common/chatService/chatService.js';

suite('ChatElicitationRequestPart', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	interface IHarness {
		readonly part: ChatElicitationRequestPart;
		readonly acceptCalls: number[];
		readonly rejectCalls: number[];
		readonly releaseAccept: DeferredPromise<void>;
	}

	function harness(acceptResult = ElicitationState.Accepted): IHarness {
		const acceptCalls: number[] = [];
		const rejectCalls: number[] = [];
		const releaseAccept = new DeferredPromise<void>();
		const part = new ChatElicitationRequestPart(
			'title',
			'message',
			'subtitle',
			'Accept',
			'Reject',
			async () => {
				acceptCalls.push(1);
				await releaseAccept.p;
				return acceptResult;
			},
			async () => {
				rejectCalls.push(1);
				return ElicitationState.Rejected;
			},
		);
		return { part, acceptCalls, rejectCalls, releaseAccept };
	}

	test('accept records the handler state', async () => {
		const { part, releaseAccept } = harness();
		const accepted = part.accept(true);
		releaseAccept.complete();
		await accepted;
		assert.strictEqual(part.state.get(), ElicitationState.Accepted);
	});

	test('reject records the handler state', async () => {
		const { part } = harness();
		await part.reject!();
		assert.strictEqual(part.state.get(), ElicitationState.Rejected);
	});

	test('a reject during an in-flight accept does not run and does not win', async () => {
		const { part, rejectCalls, releaseAccept } = harness();

		const accepted = part.accept(true);
		await part.reject!();

		assert.deepStrictEqual(rejectCalls, [], 'the accept claimed the settlement first');
		assert.strictEqual(part.state.get(), ElicitationState.Pending, 'the outcome is not known until the accept handler answers');

		releaseAccept.complete();
		await accepted;
		assert.strictEqual(part.state.get(), ElicitationState.Accepted);
	});

	test('an accept after a reject never runs its handler', async () => {
		const { part, acceptCalls } = harness();

		await part.reject!();
		await part.accept(true);

		assert.deepStrictEqual(acceptCalls, [], 'running the accept handler would perform the action the user declined');
		assert.strictEqual(part.state.get(), ElicitationState.Rejected);
	});

	test('a second accept does not run the handler twice', async () => {
		const { part, acceptCalls, releaseAccept } = harness();

		const first = part.accept(true);
		await part.accept(true);
		releaseAccept.complete();
		await first;

		assert.deepStrictEqual(acceptCalls, [1]);
	});

	test('hide settles an untouched request as rejected', () => {
		const { part } = harness();
		part.hide();
		assert.strictEqual(part.state.get(), ElicitationState.Rejected);
	});

	test('hide does not preempt an in-flight accept', async () => {
		const { part, releaseAccept } = harness();

		const accepted = part.accept(true);
		part.hide();
		releaseAccept.complete();
		await accepted;

		assert.strictEqual(part.state.get(), ElicitationState.Accepted);
	});

	test('hide leaves an already-recorded state alone', () => {
		const { part } = harness();
		part.settle(ElicitationState.Accepted);
		part.hide();
		assert.strictEqual(part.state.get(), ElicitationState.Accepted);
	});

	// Some handlers deliberately do not settle. The sandbox prompt's "Focus
	// Terminal" hands the user off to the terminal and leaves the request open,
	// so claiming it forever would strand the chat showing "awaiting input".

	test('a handler that stays pending releases the request for later settlement', async () => {
		const { part, releaseAccept } = harness(ElicitationState.Pending);

		const accepted = part.accept(true);
		releaseAccept.complete();
		await accepted;

		assert.strictEqual(part.state.get(), ElicitationState.Pending);

		await part.reject!();
		assert.strictEqual(part.state.get(), ElicitationState.Rejected, 'the request must still be settleable');
	});

	test('hiding during a handler that stays pending still settles it', async () => {
		const { part, releaseAccept } = harness(ElicitationState.Pending);

		const accepted = part.accept(true);
		part.hide();
		releaseAccept.complete();
		await accepted;

		assert.strictEqual(part.state.get(), ElicitationState.Rejected, 'a hidden request left pending never stops blocking the session');
	});

	// An outcome the server already recorded beats anything this client is still
	// doing, or the assistant reports an approval the server was never given.

	test('an externally recorded outcome supersedes an in-flight accept', async () => {
		const { part, releaseAccept } = harness();

		const accepted = part.accept(true);
		part.settle(ElicitationState.Rejected);
		releaseAccept.complete();
		await accepted;

		assert.strictEqual(part.state.get(), ElicitationState.Rejected);
	});
});
