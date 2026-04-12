/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ChatQuestionCarouselData } from '../../../common/model/chatProgressTypes/chatQuestionCarouselData.js';
suite('ChatQuestionCarouselData', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    function createQuestions() {
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
        carousel.draftAnswers = { q2: 'draft' };
        carousel.draftCurrentIndex = 1;
        const json = carousel.toJSON();
        assert.strictEqual(json.kind, 'questionCarousel');
        assert.strictEqual(json.resolveId, 'test-resolve-id');
        assert.deepStrictEqual(json.data, { q1: 'saved' });
        assert.strictEqual(json.isUsed, true);
        assert.strictEqual(json.completion, undefined, 'toJSON should not include completion');
        assert.strictEqual(json.draftAnswers, undefined, 'toJSON should not include draftAnswers');
        assert.strictEqual(json.draftCurrentIndex, undefined, 'toJSON should not include draftCurrentIndex');
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
                    assert.deepStrictEqual(result1.answers, undefined);
                    assert.deepStrictEqual(result2.answers, { q1: 'answer2' });
                }
                finally {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFF1ZXN0aW9uQ2Fyb3VzZWxEYXRhLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L3Rlc3QvY29tbW9uL21vZGVsL2NoYXRRdWVzdGlvbkNhcm91c2VsRGF0YS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDakUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDL0YsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDdEcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0scUVBQXFFLENBQUM7QUFHL0csS0FBSyxDQUFDLDBCQUEwQixFQUFFLEdBQUcsRUFBRTtJQUN0Qyx1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLFNBQVMsZUFBZTtRQUN2QixPQUFPO1lBQ04sRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLFlBQVksRUFBRTtZQUMvQyxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLGNBQWMsRUFBRSxLQUFLLEVBQUUsWUFBWSxFQUFFLE9BQU8sRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFO1NBQ3ZHLENBQUM7SUFDSCxDQUFDO0lBRUQsSUFBSSxDQUFDLG9EQUFvRCxFQUFFLEdBQUcsRUFBRTtRQUMvRCxNQUFNLFFBQVEsR0FBRyxJQUFJLHdCQUF3QixDQUFDLGVBQWUsRUFBRSxFQUFFLElBQUksRUFBRSxpQkFBaUIsQ0FBQyxD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