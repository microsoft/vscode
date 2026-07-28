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

	function harness(): IHarness {
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
				return ElicitationState.Accepted;
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
		part.state.set(ElicitationState.Accepted, undefined);
		part.hide();
		assert.strictEqual(part.state.get(), ElicitationState.Accepted);
	});
});
