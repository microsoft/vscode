/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IPlanReviewFeedbackRegistration, IPlanReviewFeedbackService, PlanReviewFeedbackService } from '../../browser/planReviewFeedback/planReviewFeedbackService.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AgentEditorCommentsBridge } from '../../../../services/agentEditorComments/common/agentEditorComments.js';
import { Event } from '../../../../../base/common/event.js';

function feedbackSummary(items: readonly { line: number; column: number }[]): string[] {
	return items.map(f => `${f.line}:${f.column}`);
}

function createRegistration(overrides?: Partial<IPlanReviewFeedbackRegistration>): IPlanReviewFeedbackRegistration {
	return {
		actions: [{ id: 'approve', label: 'Approve', default: true }],
		hasOverallFeedback: () => false,
		submitFeedback: async () => { },
		submitAction: async () => { },
		reject: async () => { },
		...overrides,
	};
}

suite('PlanReviewFeedbackService - Ordering', () => {

	const store = new DisposableStore();
	let service: IPlanReviewFeedbackService;
	let planUri: URI;

	setup(() => {
		service = store.add(new PlanReviewFeedbackService(store.add(new AgentEditorCommentsBridge())));
		planUri = URI.parse('file:///plan.md');
		store.add(service.registerPlanReview(planUri, createRegistration()));
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
		service = store.add(new PlanReviewFeedbackService(store.add(new AgentEditorCommentsBridge())));
		planUri = URI.parse('file:///plan.md');
		store.add(service.registerPlanReview(planUri, createRegistration()));
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
		service = store.add(new PlanReviewFeedbackService(store.add(new AgentEditorCommentsBridge())));
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
		store.add(service.registerPlanReview(planUri, createRegistration()));
		assert.strictEqual(service.isActivePlanReview(planUri), true);
	});

	test('isActivePlanReview returns false after dispose', () => {
		const planUri = URI.parse('file:///plan.md');
		const registration = service.registerPlanReview(planUri, createRegistration());
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
		const registration = service.registerPlanReview(planUri, createRegistration());
		service.addFeedback(planUri, 1, 1, 'text');
		assert.strictEqual(service.getFeedback(planUri).length, 1);
		registration.dispose();
		assert.strictEqual(service.getFeedback(planUri).length, 0);
	});

	test('onDidChangeRegistrations fires on register and dispose', () => {
		const planUri = URI.parse('file:///plan.md');
		let fireCount = 0;
		store.add(service.onDidChangeRegistrations(() => fireCount++));

		const registration = service.registerPlanReview(planUri, createRegistration());
		assert.strictEqual(fireCount, 1);

		registration.dispose();
		assert.strictEqual(fireCount, 2);
	});

	test('onDidChangeFeedback fires on add and remove', () => {
		const planUri = URI.parse('file:///plan.md');
		store.add(service.registerPlanReview(planUri, createRegistration()));

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
		service = store.add(new PlanReviewFeedbackService(store.add(new AgentEditorCommentsBridge())));
	});

	teardown(() => {
		store.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('submitAllFeedback delegates to the registered review', async () => {
		const planUri = URI.parse('file:///plan.md');
		let submitCount = 0;
		store.add(service.registerPlanReview(planUri, createRegistration({
			submitFeedback: async () => { submitCount++; },
		})));

		service.addFeedback(planUri, 1, 1, 'fix this');
		service.addFeedback(planUri, 45, 45, 'change that');

		await service.submitAllFeedback(planUri);

		assert.strictEqual(submitCount, 1);
	});

	test('submitAllFeedback does nothing when no items', async () => {
		const planUri = URI.parse('file:///plan.md');
		let called = false;
		store.add(service.registerPlanReview(planUri, createRegistration({
			submitFeedback: async () => { called = true; },
		})));

		await service.submitAllFeedback(planUri);
		assert.strictEqual(called, false);
	});

	test('submitAllFeedback delegates when only overall feedback exists', async () => {
		const planUri = URI.parse('file:///plan.md');
		let called = false;
		store.add(service.registerPlanReview(planUri, createRegistration({
			hasOverallFeedback: () => true,
			submitFeedback: async () => { called = true; },
		})));

		await service.submitAllFeedback(planUri);

		assert.strictEqual(called, true);
	});

	test('submitPlanAction delegates the selected action', async () => {
		const planUri = URI.parse('file:///plan.md');
		const action = { id: 'autopilot', label: 'Implement with Autopilot' };
		let submittedAction: string | undefined;
		store.add(service.registerPlanReview(planUri, createRegistration({
			actions: [action],
			submitAction: async submitted => { submittedAction = submitted.id; },
		})));

		await service.submitPlanAction(planUri, action);

		assert.strictEqual(submittedAction, 'autopilot');
	});

	test('rejectPlan delegates rejection', async () => {
		const planUri = URI.parse('file:///plan.md');
		let rejected = false;
		store.add(service.registerPlanReview(planUri, createRegistration({
			reject: async () => { rejected = true; },
		})));

		await service.rejectPlan(planUri);

		assert.strictEqual(rejected, true);
	});
});

suite('PlanReviewFeedbackService - Custom Editor Comments', () => {

	const store = new DisposableStore();

	teardown(() => {
		store.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('bridges selected Markdown ranges into plan feedback', () => {
		const bridge = store.add(new AgentEditorCommentsBridge());
		const service = store.add(new PlanReviewFeedbackService(bridge));
		const planUri = URI.parse('file:///plan.md');
		store.add(service.registerPlanReview(planUri, createRegistration()));

		bridge.addComment(planUri, {
			startLineNumber: 3,
			startColumn: 4,
			endLineNumber: 5,
			endColumn: 8,
		}, 'Clarify this section');

		assert.deepStrictEqual(service.getFeedback(planUri), [{
			id: service.getFeedback(planUri)[0].id,
			line: 3,
			column: 4,
			endLine: 5,
			endColumn: 8,
			text: 'Clarify this section',
		}]);
	});

	test('falls back to an earlier provider outside an active plan review', () => {
		const bridge = store.add(new AgentEditorCommentsBridge());
		let fallbackAddCount = 0;
		store.add(bridge.registerProvider({
			onDidChangeComments: Event.None,
			acceptsComments: () => true,
			getComments: () => [],
			addComment: () => { fallbackAddCount++; },
			deleteComment: () => { },
		}));
		const service = store.add(new PlanReviewFeedbackService(bridge));
		const planUri = URI.parse('file:///plan.md');
		const registration = service.registerPlanReview(planUri, createRegistration());

		bridge.addComment(planUri, {
			startLineNumber: 1,
			startColumn: 1,
			endLineNumber: 1,
			endColumn: 1,
		}, 'Plan comment');
		registration.dispose();
		bridge.addComment(planUri, {
			startLineNumber: 1,
			startColumn: 1,
			endLineNumber: 1,
			endColumn: 1,
		}, 'Session comment');

		assert.strictEqual(fallbackAddCount, 1);
	});
});
