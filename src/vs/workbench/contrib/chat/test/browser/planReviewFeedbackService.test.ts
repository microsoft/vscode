/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IPlanReviewFeedbackRegistration, IPlanReviewFeedbackService, PlanReviewFeedbackService } from '../../browser/planReviewFeedback/planReviewFeedbackService.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AgentEditorCommentsBridge, IAgentEditorComment } from '../../../../services/agentEditorComments/common/agentEditorComments.js';
import { Event } from '../../../../../base/common/event.js';

function createService(store: DisposableStore): PlanReviewFeedbackService {
	return store.add(new PlanReviewFeedbackService(store.add(new AgentEditorCommentsBridge())));
}

function feedbackSummary(items: readonly { line: number; column: number }[]): string[] {
	return items.map(f => `${f.line}:${f.column}`);
}

function createRegistration(overrides?: Partial<IPlanReviewFeedbackRegistration>): IPlanReviewFeedbackRegistration {
	return {
		sessionResource: URI.parse('test://session/1'),
		actions: [{ id: 'approve', label: 'Approve', default: true }],
		hasOverallFeedback: () => false,
		submitFeedback: async () => true,
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
		service = createService(store);
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

	test('comments preserve their selection range', () => {
		const range = {
			startLineNumber: 5,
			startColumn: 2,
			endLineNumber: 7,
			endColumn: 12,
		};

		(service as PlanReviewFeedbackService).addComment(planUri, range, 'selected text');

		assert.deepStrictEqual((service as PlanReviewFeedbackService).getComments(planUri), [{
			id: service.getFeedback(planUri)[0].id,
			resource: planUri,
			range,
			body: 'selected text',
		}]);
	});
});

suite('PlanReviewFeedbackService - Navigation', () => {

	const store = new DisposableStore();
	let service: IPlanReviewFeedbackService;
	let planUri: URI;

	setup(() => {
		service = createService(store);
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
		service = createService(store);
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

	test('comment eligibility changes when a review is registered or disposed', () => {
		const planUri = URI.parse('file:///plan.md');
		const planService = createService(store);
		let fireCount = 0;
		store.add(planService.onDidChangeComments(() => fireCount++));

		const registration = planService.registerPlanReview(planUri, createRegistration());
		registration.dispose();

		assert.strictEqual(fireCount, 2);
	});

	test('disposing a superseded registration leaves the active registration intact', () => {
		const planUri = URI.parse('file:///plan.md');
		const firstSession = URI.parse('test://session/first');
		const secondSession = URI.parse('test://session/second');
		const scopes: string[] = [];
		store.add(service.onDidChangePlanReviewScope(event => scopes.push(`${event.active ? 'active' : 'inactive'}:${event.sessionResource.path.slice(1)}`)));

		const first = service.registerPlanReview(planUri, createRegistration({ sessionResource: firstSession }));
		store.add(service.registerPlanReview(planUri, createRegistration({ sessionResource: secondSession })));
		first.dispose();

		assert.deepStrictEqual({
			activeSession: service.getPlanReview(planUri)?.sessionResource.toString(),
			scopes,
		}, {
			activeSession: secondSession.toString(),
			scopes: [
				'active:first',
				'inactive:first',
				'active:second',
			],
		});
	});

	test('disposing the active registration restores the previous registration', () => {
		const planUri = URI.parse('file:///plan.md');
		const firstSession = URI.parse('test://session/first');
		const secondSession = URI.parse('test://session/second');
		const scopes: string[] = [];
		store.add(service.onDidChangePlanReviewScope(event => scopes.push(`${event.active ? 'active' : 'inactive'}:${event.sessionResource.path.slice(1)}`)));

		store.add(service.registerPlanReview(planUri, createRegistration({ sessionResource: firstSession })));
		const second = service.registerPlanReview(planUri, createRegistration({ sessionResource: secondSession }));
		second.dispose();

		assert.deepStrictEqual({
			activeSession: service.getPlanReview(planUri)?.sessionResource.toString(),
			scopes,
		}, {
			activeSession: firstSession.toString(),
			scopes: [
				'active:first',
				'inactive:first',
				'active:second',
				'inactive:second',
				'active:first',
			],
		});
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
		service = createService(store);
	});

	teardown(() => {
		store.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('submitAllFeedback delegates to the registered review', async () => {
		const planUri = URI.parse('file:///plan.md');
		let submitCount = 0;
		store.add(service.registerPlanReview(planUri, createRegistration({
			submitFeedback: async () => { submitCount++; return true; },
		})));

		service.addFeedback(planUri, 1, 1, 'fix this');
		service.addFeedback(planUri, 45, 45, 'change that');

		const didSubmit = await service.submitAllFeedback(planUri);

		assert.deepStrictEqual({ submitCount, didSubmit }, { submitCount: 1, didSubmit: true });
	});

	test('submitAllFeedback does nothing when no items', async () => {
		const planUri = URI.parse('file:///plan.md');
		let called = false;
		store.add(service.registerPlanReview(planUri, createRegistration({
			submitFeedback: async () => { called = true; return true; },
		})));

		await service.submitAllFeedback(planUri);
		assert.strictEqual(called, false);
	});

	test('submitAllFeedback delegates when only overall feedback exists', async () => {
		const planUri = URI.parse('file:///plan.md');
		let called = false;
		store.add(service.registerPlanReview(planUri, createRegistration({
			hasOverallFeedback: () => true,
			submitFeedback: async () => { called = true; return true; },
		})));

		await service.submitAllFeedback(planUri);

		assert.strictEqual(called, true);
	});

	test('submitAllFeedback returns false when the registered review does not submit', async () => {
		const planUri = URI.parse('file:///plan.md');
		store.add(service.registerPlanReview(planUri, createRegistration({
			submitFeedback: async () => false,
		})));
		service.addFeedback(planUri, 1, 1, 'fix this');

		assert.strictEqual(await service.submitAllFeedback(planUri), false);
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

suite('PlanReviewFeedbackService - Provider-backed navigation', () => {

	const store = new DisposableStore();

	teardown(() => {
		store.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('navigation and bearings use comments from the selected provider', () => {
		const planUri = URI.parse('file:///plan.md');
		const relatedUri = URI.parse('file:///related.ts');
		const bridge = store.add(new AgentEditorCommentsBridge());
		const service = store.add(new PlanReviewFeedbackService(bridge));
		const reveals: string[] = [];
		store.add(bridge.onDidRevealComment(event => reveals.push(`${event.resource.toString()}:${event.id}`)));
		store.add(service.registerPlanReview(planUri, createRegistration()));
		store.add(bridge.registerProvider({
			priority: 100,
			onDidChangeComments: Event.None,
			onDidRevealComment: Event.None,
			acceptsComments: resource => resource.toString() === planUri.toString(),
			getComments: () => [
				{ id: 'plan', resource: planUri, range: { startLineNumber: 3, startColumn: 1, endLineNumber: 3, endColumn: 2 }, body: 'Plan' },
				{ id: 'related', resource: relatedUri, range: { startLineNumber: 7, startColumn: 1, endLineNumber: 7, endColumn: 2 }, body: 'Related' },
			],
			addComment: () => { },
			deleteComment: () => { },
		}));
		const first = service.getNextFeedback(planUri, true);
		const second = service.getNextFeedback(planUri, true);

		assert.deepStrictEqual({
			first: first?.id,
			second: second?.id,
			bearing: service.getNavigationBearing(planUri),
			reveals,
		}, {
			first: 'plan',
			second: 'related',
			bearing: { activeIdx: 1, totalCount: 2 },
			reveals: [
				`${planUri.toString()}:plan`,
				`${relatedUri.toString()}:related`,
			],
		});
	});

	test('pre-existing hidden comments remain excluded after becoming visible', () => {
		const planUri = URI.parse('file:///plan.md');
		const bridge = store.add(new AgentEditorCommentsBridge());
		const service = store.add(new PlanReviewFeedbackService(bridge));
		const comments: IAgentEditorComment[] = [];
		store.add(bridge.registerProvider({
			priority: 100,
			onDidChangeComments: Event.None,
			onDidRevealComment: Event.None,
			acceptsComments: () => true,
			getComments: () => comments,
			getCommentIds: () => ['existing'],
			addComment: () => { },
			deleteComment: () => { },
		}));
		store.add(service.registerPlanReview(planUri, createRegistration()));
		comments.push(
			{ id: 'existing', resource: planUri, range: { startLineNumber: 3, startColumn: 1, endLineNumber: 3, endColumn: 2 }, body: 'Existing' },
			{ id: 'new', resource: planUri, range: { startLineNumber: 7, startColumn: 1, endLineNumber: 7, endColumn: 2 }, body: 'New' },
		);

		assert.deepStrictEqual(service.getFeedback(planUri).map(item => item.id), ['new']);
	});

	test('submission feedback excludes and preserves comments that predate the review', () => {
		const planUri = URI.parse('file:///plan.md');
		const relatedUri = URI.parse('file:///related.ts');
		const bridge = store.add(new AgentEditorCommentsBridge());
		const service = store.add(new PlanReviewFeedbackService(bridge));
		const comments = [{
			id: 'existing',
			resource: relatedUri,
			range: { startLineNumber: 3, startColumn: 1, endLineNumber: 3, endColumn: 2 },
			body: 'Existing session feedback',
		}];
		const deleted: string[] = [];
		store.add(bridge.registerProvider({
			priority: 100,
			onDidChangeComments: Event.None,
			onDidRevealComment: Event.None,
			acceptsComments: resource => resource.toString() === planUri.toString(),
			getComments: () => comments,
			addComment: () => { },
			deleteComment: (_resource, id) => {
				deleted.push(id);
				const index = comments.findIndex(comment => comment.id === id);
				if (index !== -1) {
					comments.splice(index, 1);
				}
			},
		}));
		store.add(service.registerPlanReview(planUri, createRegistration()));
		comments.push({
			id: 'plan-review',
			resource: planUri,
			range: { startLineNumber: 7, startColumn: 1, endLineNumber: 7, endColumn: 2 },
			body: 'Plan review feedback',
		});

		const feedback = service.getFeedback(planUri);
		service.clearFeedback(planUri);

		assert.deepStrictEqual({
			feedback: feedback.map(item => item.id),
			deleted,
			remaining: comments.map(comment => comment.id),
		}, {
			feedback: ['plan-review'],
			deleted: ['plan-review'],
			remaining: ['existing'],
		});
	});
});
