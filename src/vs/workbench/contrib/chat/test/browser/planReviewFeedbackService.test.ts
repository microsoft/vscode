/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IPlanReviewFeedbackService, PlanReviewFeedbackService } from '../../browser/planReviewFeedback/planReviewFeedbackService.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

function feedbackSummary(items: readonly { line: number; column: number }[]): string[] {
	return items.map(f => `${f.line}:${f.column}`);
}

suite('PlanReviewFeedbackService - Ordering', () => {

	const store = new DisposableStore();
	let service: IPlanReviewFeedbackService;
	let planUri: URI;

	setup(() => {
		service = store.add(new PlanReviewFeedbackService());
		planUri = URI.parse('file:///plan.md');
		store.add(service.registerPlanReview(planUri, () => { }));
	});

	teardown(() => {
		store.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('items sorted by line number', () => {
		service.addFeedback(planUri, 20, 1, 'line 20');
		service.addFeedback(planUri, 5, 1, 'line 5');
		service.addFeedback(planUri, 10, 1, 'line 10');

		assert.deepStrictEqual(feedbackSummary(service.getFeedback(planUri)), [
			'5:1',
			'10:1',
			'20:1',
		]);
	});

	test('items sorted by line then column', () => {
		service.addFeedback(planUri, 10, 20, 'col 20');
		service.addFeedback(planUri, 10, 5, 'col 5');
		service.addFeedback(planUri, 10, 10, 'col 10');

		assert.deepStrictEqual(feedbackSummary(service.getFeedback(planUri)), [
			'10:5',
			'10:10',
			'10:20',
		]);
	});

	test('removing feedback preserves ordering', () => {
		const id1 = service.addFeedback(planUri, 30, 1, 'line 30');
		service.addFeedback(planUri, 10, 1, 'line 10');
		service.addFeedback(planUri, 20, 1, 'line 20');

		assert.deepStrictEqual(feedbackSummary(service.getFeedback(planUri)), [
			'10:1',
			'20:1',
			'30:1',
		]);

		service.removeFeedback(planUri, id1);
		assert.deepStrictEqual(feedbackSummary(service.getFeedback(planUri)), [
			'10:1',
			'20:1',
		]);
	});

	test('same line number items are stable', () => {
		const id1 = service.addFeedback(planUri, 10, 1, 'first');
		const id2 = service.addFeedback(planUri, 10, 1, 'second');

		const items = service.getFeedback(planUri);
		assert.strictEqual(items[0].id, id1);
		assert.strictEqual(items[1].id, id2);
	});

	test('clear removes all items', () => {
		service.addFeedback(planUri, 1, 1, 'a');
		service.addFeedback(planUri, 2, 1, 'b');
		service.addFeedback(planUri, 3, 1, 'c');

		assert.strictEqual(service.getFeedback(planUri).length, 3);
		service.clearFeedback(planUri);
		assert.strictEqual(service.getFeedback(planUri).length, 0);
	});

	test('update feedback changes text', () => {
		const id = service.addFeedback(planUri, 10, 1, 'original');
		service.updateFeedback(planUri, id, 'updated');

		const items = service.getFeedback(planUri);
		assert.strictEqual(items.length, 1);
		assert.strictEqual(items[0].text, 'updated');
		assert.strictEqual(items[0].line, 10);
	});
});

suite('PlanReviewFeedbackService - Navigation', () => {

	const store = new DisposableStore();
	let service: IPlanReviewFeedbackService;
	let planUri: URI;

	setup(() => {
		service = store.add(new PlanReviewFeedbackService());
		planUri = URI.parse('file:///plan.md');
		store.add(service.registerPlanReview(planUri, () => { }));
	});

	teardown(() => {
		store.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('navigation follows sorted order', () => {
		service.addFeedback(planUri, 20, 1, 'line 20');
		service.addFeedback(planUri, 5, 1, 'line 5');
		service.addFeedback(planUri, 10, 1, 'line 10');

		// Expected order: 5, 10, 20
		const first = service.getNextFeedback(planUri, true)!;
		assert.strictEqual(first.line, 5);

		const second = service.getNextFeedback(planUri, true)!;
		assert.strictEqual(second.line, 10);

		const third = service.getNextFeedback(planUri, true)!;
		assert.strictEqual(third.line, 20);

		// Wraps around
		const fourth = service.getNextFeedback(planUri, true)!;
		assert.strictEqual(fourth.line, 5);
	});

	test('navigation backwards', () => {
		service.addFeedback(planUri, 5, 1, 'line 5');
		service.addFeedback(planUri, 10, 1, 'line 10');
		service.addFeedback(planUri, 20, 1, 'line 20');

		// First backward nav goes to last item
		const first = service.getNextFeedback(planUri, false)!;
		assert.strictEqual(first.line, 20);

		const second = service.getNextFeedback(planUri, false)!;
		assert.strictEqual(second.line, 10);

		const third = service.getNextFeedback(planUri, false)!;
		assert.strictEqual(third.line, 5);

		// Wraps around
		const fourth = service.getNextFeedback(planUri, false)!;
		assert.strictEqual(fourth.line, 20);
	});

	test('navigation bearings reflect sorted position', () => {
		service.addFeedback(planUri, 20, 1, 'line 20');
		service.addFeedback(planUri, 5, 1, 'line 5');
		service.addFeedback(planUri, 10, 1, 'line 10');

		// Before navigation, no anchor
		let bearing = service.getNavigationBearing(planUri);
		assert.strictEqual(bearing.activeIdx, -1);
		assert.strictEqual(bearing.totalCount, 3);

		// Navigate to first (5)
		service.getNextFeedback(planUri, true);
		bearing = service.getNavigationBearing(planUri);
		assert.strictEqual(bearing.activeIdx, 0);

		// Navigate to second (10)
		service.getNextFeedback(planUri, true);
		bearing = service.getNavigationBearing(planUri);
		assert.strictEqual(bearing.activeIdx, 1);

		// Navigate to third (20)
		service.getNextFeedback(planUri, true);
		bearing = service.getNavigationBearing(planUri);
		assert.strictEqual(bearing.activeIdx, 2);
	});

	test('navigation returns undefined for empty feedback', () => {
		const result = service.getNextFeedback(planUri, true);
		assert.strictEqual(result, undefined);
	});

	test('setNavigationAnchor updates the anchor', () => {
		const id = service.addFeedback(planUri, 10, 1, 'line 10');
		service.addFeedback(planUri, 20, 1, 'line 20');

		service.setNavigationAnchor(planUri, id);
		const bearing = service.getNavigationBearing(planUri);
		assert.strictEqual(bearing.activeIdx, 0);
	});
});

suite('PlanReviewFeedbackService - Registration', () => {

	const store = new DisposableStore();
	let service: IPlanReviewFeedbackService;

	setup(() => {
		service = store.add(new PlanReviewFeedbackService());
	});

	teardown(() => {
		store.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('isActivePlanReview returns false before registration', () => {
		const planUri = URI.parse('file:///plan.md');
		assert.strictEqual(service.isActivePlanReview(planUri), false);
	});

	test('isActivePlanReview returns true after registration', () => {
		const planUri = URI.parse('file:///plan.md');
		store.add(service.registerPlanReview(planUri, () => { }));
		assert.strictEqual(service.isActivePlanReview(planUri), true);
	});

	test('isActivePlanReview returns false after dispose', () => {
		const planUri = URI.parse('file:///plan.md');
		const registration = service.registerPlanReview(planUri, () => { });
		assert.strictEqual(service.isActivePlanReview(planUri), true);
		registration.dispose();
		assert.strictEqual(service.isActivePlanReview(planUri), false);
	});

	test('feedback cannot be added to unregistered plan', () => {
		const planUri = URI.parse('file:///plan.md');
		const id = service.addFeedback(planUri, 1, 1, 'text');
		assert.strictEqual(id, '');
		assert.strictEqual(service.getFeedback(planUri).length, 0);
	});

	test('dispose clears feedback items', () => {
		const planUri = URI.parse('file:///plan.md');
		const registration = service.registerPlanReview(planUri, () => { });
		service.addFeedback(planUri, 1, 1, 'text');
		assert.strictEqual(service.getFeedback(planUri).length, 1);
		registration.dispose();
		assert.strictEqual(service.getFeedback(planUri).length, 0);
	});

	test('onDidChangeRegistrations fires on register and dispose', () => {
		const planUri = URI.parse('file:///plan.md');
		let fireCount = 0;
		store.add(service.onDidChangeRegistrations(() => fireCount++));

		const registration = service.registerPlanReview(planUri, () => { });
		assert.strictEqual(fireCount, 1);

		registration.dispose();
		assert.strictEqual(fireCount, 2);
	});

	test('onDidChangeFeedback fires on add and remove', () => {
		const planUri = URI.parse('file:///plan.md');
		store.add(service.registerPlanReview(planUri, () => { }));

		let fireCount = 0;
		store.add(service.onDidChangeFeedback(() => fireCount++));

		const id = service.addFeedback(planUri, 1, 1, 'text');
		assert.strictEqual(fireCount, 1);

		service.removeFeedback(planUri, id);
		assert.strictEqual(fireCount, 2);
	});
});

suite('PlanReviewFeedbackService - Submit', () => {

	const store = new DisposableStore();
	let service: IPlanReviewFeedbackService;

	setup(() => {
		service = store.add(new PlanReviewFeedbackService());
	});

	teardown(() => {
		store.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('submitAllFeedback calls onSubmit with formatted feedback', () => {
		const planUri = URI.parse('file:///plan.md');
		let submittedResult: { rejected: boolean; feedback?: string } | undefined;
		store.add(service.registerPlanReview(planUri, (result) => { submittedResult = result; }));

		service.addFeedback(planUri, 1, 1, 'fix this');
		service.addFeedback(planUri, 45, 45, 'change that');

		service.submitAllFeedback(planUri);

		assert.ok(submittedResult);
		assert.strictEqual(submittedResult!.rejected, false);
		assert.strictEqual(submittedResult!.feedback, [
			'Here\'s the feedback:',
			'Line 1: fix this',
			'Line 45: Column 45: change that',
		].join('\n'));
	});

	test('submitAllFeedback does nothing when no items', () => {
		const planUri = URI.parse('file:///plan.md');
		let called = false;
		store.add(service.registerPlanReview(planUri, () => { called = true; }));

		service.submitAllFeedback(planUri);
		assert.strictEqual(called, false);
	});

	test('feedback at column 1 omits column', () => {
		const planUri = URI.parse('file:///plan.md');
		let submittedResult: { feedback?: string } | undefined;
		store.add(service.registerPlanReview(planUri, (result) => { submittedResult = result; }));

		service.addFeedback(planUri, 10, 1, 'at start');

		service.submitAllFeedback(planUri);

		assert.ok(submittedResult);
		assert.strictEqual(submittedResult!.feedback, [
			'Here\'s the feedback:',
			'Line 10: at start',
		].join('\n'));
	});

	test('feedback at column > 1 includes column', () => {
		const planUri = URI.parse('file:///plan.md');
		let submittedResult: { feedback?: string } | undefined;
		store.add(service.registerPlanReview(planUri, (result) => { submittedResult = result; }));

		service.addFeedback(planUri, 10, 15, 'mid line');

		service.submitAllFeedback(planUri);

		assert.ok(submittedResult);
		assert.strictEqual(submittedResult!.feedback, [
			'Here\'s the feedback:',
			'Line 10: Column 15: mid line',
		].join('\n'));
	});
});
