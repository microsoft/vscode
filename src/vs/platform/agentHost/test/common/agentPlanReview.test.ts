/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { ChatInputRequestWithPlanReview } from '../../common/agentHostPlanReview.js';
import { readAgentPlanReview, type IAgentPlanReviewResult } from '../../common/meta/agentPlanReview.js';
import { ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind, ChatInputResponseKind, type ChatInputAnswer, type ChatInputRequest } from '../../common/state/protocol/state.js';

function copilotRequest(actions = ['autopilot', 'interactive', 'exit_only']): ChatInputRequest {
	return {
		id: 'opaque-request',
		message: '# Plan\nImplement the feature.',
		questions: [
			{
				id: 'selectedAction',
				kind: ChatInputQuestionKind.SingleSelect,
				title: 'Action',
				message: 'Choose how to exit plan mode.',
				required: true,
				options: actions.map(id => ({ id, label: id, recommended: id === 'interactive' })),
			},
			{
				id: 'feedback',
				kind: ChatInputQuestionKind.Text,
				title: 'Feedback',
				message: 'Optional feedback for the agent.',
			},
		],
	};
}

function vscodeRequest(): ChatInputRequestWithPlanReview {
	return {
		id: 'vscode-request',
		planReview: {
			title: 'Review Plan',
			content: '# Native plan',
			canProvideFeedback: true,
			answerQuestionId: 'opaque-question',
			planUri: 'file:///session/plan.md',
			actions: [
				{ id: 'interactive', label: 'Implement Plan', default: true },
				{ id: 'autopilot', label: 'Implement with Autopilot', permissionLevel: 'autopilot' },
			],
		},
	};
}

function selected(value: string, feedback?: string): ChatInputAnswer {
	return {
		state: ChatInputAnswerState.Submitted,
		value: { kind: ChatInputAnswerValueKind.Selected, value, ...(feedback ? { freeformValues: [feedback] } : {}) },
	};
}

function text(value: string): ChatInputAnswer {
	return { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Text, value } };
}

suite('Agent plan review compatibility', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('preserves the complete VS Code presentation, including URI and permission confirmation', () => {
		const request = vscodeRequest();
		const adapter = readAgentPlanReview(JSON.parse(JSON.stringify(request)));
		assert.deepStrictEqual(adapter?.review, request.planReview);
	});

	test('VS Code presentation takes precedence over Copilot-shaped questions', () => {
		const request = { ...copilotRequest(), planReview: vscodeRequest().planReview };
		assert.deepStrictEqual(readAgentPlanReview(request)?.review, request.planReview);
	});

	test('malformed VS Code presentation does not fall through to Copilot conventions', () => {
		const requests = [null, {}, { ...vscodeRequest().planReview, actions: [null] }].map(planReview =>
			JSON.parse(JSON.stringify({ ...copilotRequest(), planReview })));
		assert.deepStrictEqual(requests.map(request => readAgentPlanReview(request)), [undefined, undefined, undefined]);
	});

	test('normalizes Copilot labels, preserves offered order and recommendations, and does not grant permissions', () => {
		const request = copilotRequest(['exit_only', 'interactive', 'autopilot_fleet', 'future_action']);
		const before = JSON.stringify(request);
		const adapter = readAgentPlanReview(request);
		assert.deepStrictEqual({
			title: adapter?.review.title,
			content: adapter?.review.content,
			planUri: adapter?.review.planUri,
			canProvideFeedback: adapter?.review.canProvideFeedback,
			actions: adapter?.review.actions.map(({ id, label, default: recommended, permissionLevel }) => ({ id, label, recommended, permissionLevel })),
			unchanged: JSON.stringify(request) === before,
		}, {
			title: 'Review Plan',
			content: request.message,
			planUri: undefined,
			canProvideFeedback: true,
			actions: [
				{ id: 'exit_only', label: 'Approve Plan Only', recommended: undefined, permissionLevel: undefined },
				{ id: 'interactive', label: 'Implement Plan', recommended: true, permissionLevel: undefined },
				{ id: 'autopilot_fleet', label: 'Implement with Autopilot Fleet', recommended: undefined, permissionLevel: undefined },
				{ id: 'future_action', label: 'future_action', recommended: undefined, permissionLevel: undefined },
			],
			unchanged: true,
		});
	});

	test('preserves host-authored labels and descriptions and does not invent a recommendation', () => {
		const request = copilotRequest(['interactive']);
		request.questions = [
			request.questions![1],
			{
				id: 'selectedAction', kind: ChatInputQuestionKind.SingleSelect, message: 'How?', required: true,
				options: [{ id: 'interactive', label: 'Host label', description: 'Host description' }],
			},
		];
		assert.deepStrictEqual(readAgentPlanReview(request)?.review.actions, [
			{ id: 'interactive', label: 'Host label', description: 'Host description' },
		]);
	});

	const genericQuestions: ChatInputRequest[] = [
		{ id: 'empty' },
		{ ...copilotRequest(), url: 'https://example.com' },
		{ ...copilotRequest(), message: '' },
		{ ...copilotRequest(), questions: copilotRequest().questions!.slice(0, 1) },
		copilotRequest(['future_action']),
		copilotRequest(['interactive', 'interactive']),
		...[
			{ required: false },
			{ allowFreeformInput: true },
			{ id: 'different-question' },
			{ options: [] },
		].map(overrides => {
			const request = copilotRequest();
			request.questions = request.questions!.map(question => question.id === 'selectedAction' ? { ...question, ...overrides } : question);
			return request;
		}),
		...[
			{ required: true },
			{ min: 10 },
			{ kind: ChatInputQuestionKind.MultiSelect as const, options: [] },
			{ id: 'different-feedback' },
		].map(overrides => {
			const request = copilotRequest();
			request.questions = request.questions!.map(question => question.id === 'feedback' ? { ...question, ...overrides } : question);
			return request;
		}),
	];

	for (const [index, request] of genericQuestions.entries()) {
		test(`leaves unrelated or unsupported input ${index} on the generic path`, () => {
			assert.strictEqual(readAgentPlanReview(JSON.parse(JSON.stringify(request))), undefined);
		});
	}

	test('malformed wire options do not throw or select a plan presentation', () => {
		const request = copilotRequest();
		const malformed = [null, [null], [{ id: 7, label: 'Plan' }], [{ id: 'interactive', label: null }]];
		const requests: ChatInputRequest[] = malformed.map(options => JSON.parse(JSON.stringify({
			...request,
			questions: request.questions!.map(question => question.id === 'selectedAction' ? { ...question, options } : question),
		})));
		assert.deepStrictEqual(requests.map(request => readAgentPlanReview(request)), malformed.map(() => undefined));
	});

	test('does not mistake unsubmitted Copilot answer drafts for the completed decision', () => {
		const adapter = readAgentPlanReview(copilotRequest())!;
		const drafts: Record<string, ChatInputAnswer> = {
			selectedAction: { state: ChatInputAnswerState.Draft, value: { kind: ChatInputAnswerValueKind.Selected, value: 'autopilot' } },
			feedback: { state: ChatInputAnswerState.Draft, value: { kind: ChatInputAnswerValueKind.Text, value: 'Unsubmitted feedback' } },
		};
		assert.deepStrictEqual([
			adapter.fromInputCompletion(ChatInputResponseKind.Decline, drafts),
			adapter.fromInputCompletion(ChatInputResponseKind.Accept, drafts),
		], [{ rejected: true }, undefined]);
	});

	for (const dialect of ['VS Code', 'Copilot'] as const) {
		const request = dialect === 'VS Code' ? vscodeRequest() : copilotRequest();
		const questionId = dialect === 'VS Code' ? 'opaque-question' : 'selectedAction';
		const cases: { name: string; result: IAgentPlanReviewResult; response: ChatInputResponseKind; answers?: Record<string, ChatInputAnswer> }[] = [
			{ name: 'approval', result: { rejected: false, actionId: 'interactive' }, response: ChatInputResponseKind.Accept, answers: { [questionId]: selected('interactive') } },
			{ name: 'label-only approval', result: { rejected: false, action: 'Implement Plan' }, response: ChatInputResponseKind.Accept, answers: { [questionId]: selected('interactive') } },
			{ name: 'rejection', result: { rejected: true }, response: ChatInputResponseKind.Decline },
			{ name: 'unknown action', result: { rejected: false, actionId: 'not-offered' }, response: ChatInputResponseKind.Decline },
			{
				name: 'revision feedback',
				result: { rejected: false, feedback: ' Add tests ' },
				response: dialect === 'VS Code' ? ChatInputResponseKind.Accept : ChatInputResponseKind.Decline,
				answers: dialect === 'VS Code' ? { [questionId]: text('Add tests') } : { feedback: text('Add tests') },
			},
			{
				name: 'approval with feedback',
				result: { rejected: false, actionId: 'interactive', feedback: 'Add tests' },
				response: ChatInputResponseKind.Accept,
				answers: dialect === 'VS Code'
					? { [questionId]: selected('interactive', 'Add tests') }
					: { [questionId]: selected('interactive'), feedback: text('Add tests') },
			},
			{
				name: 'rejection with feedback',
				result: { rejected: true, feedback: 'Add tests' },
				response: dialect === 'VS Code' ? ChatInputResponseKind.Accept : ChatInputResponseKind.Decline,
				answers: dialect === 'VS Code' ? { [questionId]: text('Add tests') } : { feedback: text('Add tests') },
			},
		];
		for (const entry of cases) {
			test(`${dialect} encodes ${entry.name}`, () => {
				const adapter = readAgentPlanReview(JSON.parse(JSON.stringify(request)));
				assert.deepStrictEqual(adapter?.toInputCompletion(entry.result), {
					response: entry.response,
					...(entry.answers ? { answers: entry.answers } : {}),
				});
			});
		}

		test(`${dialect} decodes accepted, declined, cancelled and unanswered reviews`, () => {
			const adapter = readAgentPlanReview(request)!;
			assert.deepStrictEqual([
				adapter.fromInputCompletion(ChatInputResponseKind.Accept, { [questionId]: selected('interactive') }),
				adapter.fromInputCompletion(ChatInputResponseKind.Decline, undefined),
				adapter.fromInputCompletion(ChatInputResponseKind.Cancel, { [questionId]: selected('interactive') }),
				adapter.fromInputCompletion(ChatInputResponseKind.Accept, undefined),
				adapter.fromInputCompletion(ChatInputResponseKind.Accept, { [questionId]: { state: ChatInputAnswerState.Skipped } }),
			], [
				{ rejected: false, action: 'Implement Plan', actionId: 'interactive' },
				{ rejected: true },
				undefined,
				undefined,
				undefined,
			]);
		});

		test(`${dialect} round-trips feedback and approval with feedback`, () => {
			const adapter = readAgentPlanReview(request)!;
			const feedback = adapter.toInputCompletion({ rejected: false, feedback: 'Add tests' });
			const approval = adapter.toInputCompletion({ rejected: false, actionId: 'interactive', feedback: 'Add tests' });
			assert.deepStrictEqual([
				adapter.fromInputCompletion(feedback.response, feedback.answers),
				adapter.fromInputCompletion(approval.response, approval.answers),
			], [
				{ rejected: false, feedback: 'Add tests', feedbackOverall: 'Add tests' },
				{ rejected: false, action: 'Implement Plan', actionId: 'interactive', feedback: 'Add tests', feedbackOverall: 'Add tests' },
			]);
		});
	}
});
