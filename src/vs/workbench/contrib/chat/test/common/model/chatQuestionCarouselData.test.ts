/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ChatQuestionCarouselData } from '../../../common/model/chatProgressTypes/chatQuestionCarouselData.js';
import { IChatQuestion } from '../../../common/chatService/chatService.js';

suite('ChatQuestionCarouselData', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function createQuestions(): IChatQuestion[] {
		return [
			{ id: 'q1', type: 'text', title: 'Question 1' },
			{ id: 'q2', type: 'singleSelect', title: 'Question 2', options: [{ id: 'a', label: 'A', value: 'a' }] }
		];
	}

	test('creates a carousel with DeferredPromise completion', () => {
		const carousel = new ChatQuestionCarouselData(createQuestions(), true, 'test-resolve-id');

		assert.strictEqual(carousel.kind, 'questionCarousel');
		assert.strictEqual(carousel.resolveId, 'test-resolve-id');
		assert.ok(carousel.completion, 'Should have completion promise');
		assert.strictEqual(carousel.completion.isSettled, false, 'Completion should not be settled initially');
	});

	test('completion promise can be resolved with answers', async () => {
		const carousel = new ChatQuestionCarouselData(createQuestions(), true, 'test-resolve-id');

		const answers = { q1: 'answer1', q2: 'a' };
		carousel.completion.complete({ answers });

		const result = await carousel.completion.p;
		assert.strictEqual(carousel.completion.isSettled, true, 'Completion should be settled');
		assert.deepStrictEqual(result.answers, answers);
	});

	test('completion promise can be resolved with undefined (skipped)', async () => {
		const carousel = new ChatQuestionCarouselData(createQuestions(), true, 'test-resolve-id');

		carousel.completion.complete({ answers: undefined });

		const result = await carousel.completion.p;
		assert.strictEqual(carousel.completion.isSettled, true, 'Completion should be settled');
		assert.strictEqual(result.answers, undefined, 'Skipped carousel should have undefined answers');
	});

	test('toJSON strips the completion promise', () => {
		const carousel = new ChatQuestionCarouselData(createQuestions(), true, 'test-resolve-id', { q1: 'saved' }, true);

		const json = carousel.toJSON();

		assert.strictEqual(json.kind, 'questionCarousel');
		assert.strictEqual(json.resolveId, 'test-resolve-id');
		assert.deepStrictEqual(json.data, { q1: 'saved' });
		assert.strictEqual(json.isUsed, true);
		assert.strictEqual((json as { completion?: unknown }).completion, undefined, 'toJSON should not include completion');
	});

	test('multiple carousels can have independent completion promises', async () => {
		const carousel1 = new ChatQuestionCarouselData(createQuestions(), true, 'resolve-1');
		const carousel2 = new ChatQuestionCarouselData(createQuestions(), true, 'resolve-2');

		// Complete carousel2 first
		carousel2.completion.complete({ answers: { q1: 'answer2' } });

		assert.strictEqual(carousel1.completion.isSettled, false, 'Carousel 1 should not be settled');
		assert.strictEqual(carousel2.completion.isSettled, true, 'Carousel 2 should be settled');

		// Now complete carousel1
		carousel1.completion.complete({ answers: { q1: 'answer1' } });

		const result1 = await carousel1.completion.p;
		const result2 = await carousel2.completion.p;

		assert.deepStrictEqual(result1.answers, { q1: 'answer1' });
		assert.deepStrictEqual(result2.answers, { q1: 'answer2' });
	});

	suite('Parallel Carousel Handling', () => {
		test('when carousel is superseded, completing with undefined does not block', async () => {
			await runWithFakedTimers({ useFakeTimers: true }, async () => {
				// This simulates the scenario where parallel subagents call askQuestions
				// and the first carousel is superseded by the second
				const carousel1 = new ChatQuestionCarouselData(createQuestions(), true, 'resolve-1');
				const carousel2 = new ChatQuestionCarouselData(createQuestions(), true, 'resolve-2');

				// Simulate carousel1 being superseded - we complete it with undefined (skipped)
				carousel1.completion.complete({ answers: undefined });

				// Now complete carousel2 normally
				carousel2.completion.complete({ answers: { q1: 'answer2' } });

				const timeoutPromise1 = timeout(100);
				const timeoutPromise2 = timeout(100);

				try {
					// Both should complete without blocking
					const [result1, result2] = await Promise.all([
						Promise.race([carousel1.completion.p, timeoutPromise1.then(() => 'timeout')]),
						Promise.race([carousel2.completion.p, timeoutPromise2.then(() => 'timeout')])
					]);

					assert.notStrictEqual(result1, 'timeout', 'Carousel 1 should not timeout');
					assert.notStrictEqual(result2, 'timeout', 'Carousel 2 should not timeout');
					assert.deepStrictEqual((result1 as { answers: unknown }).answers, undefined);
					assert.deepStrictEqual((result2 as { answers: unknown }).answers, { q1: 'answer2' });
				} finally {
					timeoutPromise1.cancel();
					timeoutPromise2.cancel();
				}
			});
		});

		test('completing an already settled carousel is safe', () => {
			const carousel = new ChatQuestionCarouselData(createQuestions(), true, 'resolve-1');

			// Complete once
			carousel.completion.complete({ answers: { q1: 'first' } });
			assert.strictEqual(carousel.completion.isSettled, true);

			// Completing again should not throw
			assert.doesNotThrow(() => {
				carousel.completion.complete({ answers: { q1: 'second' } });
			});
		});
	});
});
