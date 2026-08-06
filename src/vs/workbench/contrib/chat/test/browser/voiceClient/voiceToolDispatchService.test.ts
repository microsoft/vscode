/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentSessionsModel } from '../../../browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../../browser/agentSessions/agentSessionsService.js';
import { VoiceToolDispatchService } from '../../../browser/voiceClient/voiceToolDispatchService.js';
import { IChatQuestionAnswers, IChatService, IChatToolInvocation, ToolConfirmKind } from '../../../common/chatService/chatService.js';
import { IChatModel } from '../../../common/model/chatModel.js';
import { ChatPlanReviewData } from '../../../common/model/chatProgressTypes/chatPlanReviewData.js';
import { ChatQuestionCarouselData } from '../../../common/model/chatProgressTypes/chatQuestionCarouselData.js';
import { ILanguageModelToolsService } from '../../../common/tools/languageModelToolsService.js';
import { AskQuestionsToolId } from '../../../common/tools/builtinTools/askQuestionsTool.js';
import { derivePendingId, IVoiceToolCall } from '../../../common/voiceClient/voiceClientService.js';

suite('VoiceToolDispatchService - respondToSession', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const sessionResource = URI.parse('agent-session://test/one');
	const requestId = 'req-1';

	function serviceFor(part: object): VoiceToolDispatchService {
		const model = new class extends mock<IChatModel>() {
			override getRequests() {
				return [{ id: requestId, response: { response: { value: [part] } } }] as unknown as ReturnType<IChatModel['getRequests']>;
			}
		};
		const agentSessionsService = new class extends mock<IAgentSessionsService>() {
			override get model(): IAgentSessionsModel {
				return { sessions: [{ isArchived: () => false, resource: sessionResource }] } as IAgentSessionsModel;
			}
		};
		const chatService = new class extends mock<IChatService>() {
			override getSession() {
				return model as IChatModel;
			}
			override notifyQuestionCarouselAnswer() { }
		};
		return new VoiceToolDispatchService(
			agentSessionsService,
			chatService,
			new class extends mock<ILanguageModelToolsService>() { },
		);
	}

	function approvalCall(part: object, type: 'approve' | 'reject'): IVoiceToolCall {
		return {
			name: 'respond_to_session',
			args: {
				coding_session_id: sessionResource.toString(),
				request_id: requestId,
				pending_id: derivePendingId(requestId, part),
				response: { type },
			},
		} as unknown as IVoiceToolCall;
	}

	function carousel(allowSkip = false): ChatQuestionCarouselData {
		return new ChatQuestionCarouselData([{
			id: 'region',
			type: 'singleSelect',
			title: 'Region',
			message: 'Which region should this deploy to?',
			options: [
				{ id: 'west', label: 'West US', value: 'westus' },
				{ id: 'east', label: 'East US', value: 'eastus' },
			],
		}], allowSkip, 'resolve-1');
	}

	function answerCall(part: object, response: object): IVoiceToolCall {
		return {
			name: 'respond_to_session',
			args: {
				coding_session_id: sessionResource.toString(),
				request_id: requestId,
				pending_id: derivePendingId(requestId, part),
				response,
			},
		} as unknown as IVoiceToolCall;
	}

	// The reported bug: a spoken answer left the form on screen, unanswered.

	test('a spoken answer submits the form', async () => {
		const part = carousel();
		const call = answerCall(part, { type: 'answer', answers: [{ question_id: 'region', value: 'eastus' }] });

		const result = await serviceFor(part).respondToSession(call);

		const answers: IChatQuestionAnswers = { region: { selectedValue: 'eastus' } };
		assert.deepStrictEqual(result, { ok: true });
		assert.strictEqual(part.isUsed, true);
		assert.deepStrictEqual(part.data, answers);
		assert.deepStrictEqual(await part.completion.p, { answers });
	});

	test('a value the form does not offer leaves it untouched', async () => {
		// The backend resolves ordinals against its own mirror, so an unmatched
		// value means that mirror was stale. Answering with a guess would submit
		// something the user never chose.
		const part = carousel();
		const call = answerCall(part, { type: 'answer', answers: [{ question_id: 'region', value: 'West US' }] });

		const result = await serviceFor(part).respondToSession(call);

		assert.deepStrictEqual(result, { ok: false, reason: 'invalid_answer' });
		assert.strictEqual(part.isUsed, undefined);
	});

	test('an approval spoken at a question form is refused rather than applied', async () => {
		const part = carousel();

		const result = await serviceFor(part).respondToSession(approvalCall(part, 'approve'));

		assert.deepStrictEqual(result, { ok: false, reason: 'unsupported' });
		assert.strictEqual(part.isUsed, undefined);
	});

	test('an approval spoken at the ask-questions tool is refused rather than applied', async () => {
		const confirmations: ToolConfirmKind[] = [];
		const part = new class extends mock<IChatToolInvocation>() {
			override readonly kind = 'toolInvocation' as const;
			override readonly toolId = AskQuestionsToolId;
			override readonly state = observableValue<IChatToolInvocation.State>('state', {
				type: IChatToolInvocation.StateKind.WaitingForConfirmation,
				parameters: { questions: [{ question: 'Which region?', options: [{ label: 'West US' }] }] },
				confirmationMessages: {
					title: 'Answer questions?',
					message: 'The questionnaire is open.',
				},
				confirm: reason => confirmations.push(reason.type),
			});
		}();

		const result = await serviceFor(part).respondToSession(approvalCall(part, 'approve'));

		assert.deepStrictEqual({ result, confirmations }, {
			result: { ok: false, reason: 'unsupported' },
			confirmations: [],
		});
	});

	test('tool and plan confirmations remain voice-approvable', async () => {
		const confirmations: ToolConfirmKind[] = [];
		const tool = new class extends mock<IChatToolInvocation>() {
			override readonly kind = 'toolInvocation' as const;
			override readonly toolId = 'testTool';
			override readonly state = observableValue<IChatToolInvocation.State>('state', {
				type: IChatToolInvocation.StateKind.WaitingForConfirmation,
				parameters: {},
				confirmationMessages: {
					title: 'Run the build?',
					message: 'Runs the visible build task.',
				},
				confirm: reason => confirmations.push(reason.type),
			});
		}();
		const plan = new ChatPlanReviewData('Review plan', 'Plan body', [
			{ id: 'implement', label: 'Implement Plan', default: true },
		], true);

		const toolResult = await serviceFor(tool).respondToSession(approvalCall(tool, 'approve'));
		const planResult = await serviceFor(plan).respondToSession(approvalCall(plan, 'approve'));

		assert.deepStrictEqual({
			toolResult,
			confirmations,
			planResult,
			planData: plan.data,
			planCompletion: await plan.completion.p,
		}, {
			toolResult: { ok: true },
			confirmations: [ToolConfirmKind.UserAction],
			planResult: { ok: true },
			planData: {
				action: 'Implement Plan',
				actionId: 'implement',
				rejected: false,
			},
			planCompletion: {
				action: 'Implement Plan',
				actionId: 'implement',
				rejected: false,
			},
		});
	});

	test('a skip is refused when the form forbids it', async () => {
		const part = carousel();

		const result = await serviceFor(part).respondToSession(answerCall(part, { type: 'skip' }));

		assert.deepStrictEqual(result, { ok: false, reason: 'stale_pending' });
		assert.strictEqual(part.isUsed, undefined);
	});

	test('a skip submits an unanswered form when the form allows it', async () => {
		const part = carousel(true);

		const result = await serviceFor(part).respondToSession(answerCall(part, { type: 'skip' }));

		assert.deepStrictEqual(result, { ok: true });
		assert.strictEqual(part.isUsed, true);
	});

	test('an answer is refused once the form has been used', async () => {
		const part = carousel();
		part.dismiss({ region: { selectedValue: 'westus' } });
		const call = answerCall(part, { type: 'answer', answers: [{ question_id: 'region', value: 'eastus' }] });

		const result = await serviceFor(part).respondToSession(call);

		assert.deepStrictEqual(result, { ok: false, reason: 'stale_pending' });
		assert.deepStrictEqual(part.data, { region: { selectedValue: 'westus' } });
	});

	test('refuses an answer that leaves a required question blank', async () => {
		// The widget will not submit this form; neither may a spoken answer.
		const part = new ChatQuestionCarouselData([
			{ id: 'region', type: 'singleSelect', title: 'Region', options: [{ id: 'west', label: 'West US', value: 'westus' }] },
			{ id: 'tier', type: 'singleSelect', title: 'Tier', required: true, options: [{ id: 'std', label: 'Standard', value: 'standard' }] },
		], true, 'resolve-1');
		const call = answerCall(part, { type: 'answer', answers: [{ question_id: 'region', value: 'westus' }] });

		assert.deepStrictEqual(await serviceFor(part).respondToSession(call), { ok: false, reason: 'invalid_answer' });
		assert.strictEqual(part.isUsed, undefined);
	});

	test('skipping may leave a required question blank', async () => {
		// Skip is the user declining the form, not an incomplete submission.
		const part = new ChatQuestionCarouselData([
			{ id: 'tier', type: 'singleSelect', title: 'Tier', required: true, options: [{ id: 'std', label: 'Standard', value: 'standard' }] },
		], true, 'resolve-1');

		assert.deepStrictEqual(await serviceFor(part).respondToSession(answerCall(part, { type: 'skip' })), { ok: true });
	});

	test('refuses a malformed answers field rather than reading it as empty', async () => {
		// Coercing a present non-array to empty would let a skip succeed while
		// silently discarding whatever the call actually carried.
		const part = carousel(true);

		const result = await serviceFor(part).respondToSession(answerCall(part, { type: 'skip', answers: 'westus' }));

		assert.deepStrictEqual(result, { ok: false, reason: 'invalid_answer' });
		assert.strictEqual(part.isUsed, undefined);
	});

	test('refuses an unresolvable carousel without marking it answered', async () => {
		// A plain carousel with no deferred completion and no resolve id has
		// nowhere to put an answer. Mutating it first would leave the form
		// answered on screen while the assistant reports that it did not land.
		const part = {
			kind: 'questionCarousel',
			questions: [{ id: 'region', type: 'singleSelect', title: 'Region', options: [{ id: 'west', label: 'West US', value: 'westus' }] }],
			isUsed: false,
			data: undefined as IChatQuestionAnswers | undefined,
		};

		const result = await serviceFor(part).respondToSession(
			answerCall(part, { type: 'answer', answers: [{ question_id: 'region', value: 'westus' }] }));

		assert.deepStrictEqual(result, { ok: false, reason: 'unsupported' });
		assert.strictEqual(part.isUsed, false);
		assert.strictEqual(part.data, undefined);
	});

	test('refuses an id minted for a part that has since been replaced', async () => {
		// A pending id is an identity, not a position. `Response.clear` and
		// `clearToPreviousToolInvocation` splice the part list, so a position the
		// backend was told about can end up occupied by a different form, and
		// answering *that* answers something the user was never shown.
		const published = carousel();
		const call = answerCall(published, { type: 'answer', answers: [{ question_id: 'region', value: 'eastus' }] });
		const replacement = carousel();

		const result = await serviceFor(replacement).respondToSession(call);

		assert.deepStrictEqual(result, { ok: false, reason: 'stale_pending' });
		assert.strictEqual(replacement.isUsed, undefined);
	});
});
