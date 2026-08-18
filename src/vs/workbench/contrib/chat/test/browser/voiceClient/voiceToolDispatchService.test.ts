/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AgentSessionStatus, IAgentSessionsModel } from '../../../browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../../browser/agentSessions/agentSessionsService.js';
import { IVoiceModelSelectionResult, IVoiceToolDispatchDelegate, resolveVoiceModel, VoiceToolDispatchService } from '../../../browser/voiceClient/voiceToolDispatchService.js';
import { IChatQuestionAnswers, IChatService, IChatToolInvocation, ToolConfirmKind } from '../../../common/chatService/chatService.js';
import { IChatModel } from '../../../common/model/chatModel.js';
import { ChatPlanReviewData } from '../../../common/model/chatProgressTypes/chatPlanReviewData.js';
import { ChatQuestionCarouselData } from '../../../common/model/chatProgressTypes/chatQuestionCarouselData.js';
import { ILanguageModelToolsService } from '../../../common/tools/languageModelToolsService.js';
import { AskQuestionsToolId } from '../../../common/tools/builtinTools/askQuestionsTool.js';
import { derivePendingId, IVoiceToolCall } from '../../../common/voiceClient/voiceClientService.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../common/languageModels.js';

suite('VoiceToolDispatchService - model selection', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const model = (identifier: string, name: string, id = name): ILanguageModelChatMetadataAndIdentifier => ({
		identifier,
		metadata: { name, id, family: id, vendor: 'copilot' },
	} as ILanguageModelChatMetadataAndIdentifier);

	test('matches a unique normalized model name', () => {
		const result = resolveVoiceModel([
			model('copilot/gpt-5', 'GPT-5'),
			model('copilot/claude', 'Claude Sonnet 4'),
		], 'gpt 5');

		assert.deepStrictEqual(result, {
			ok: true,
			identifier: 'copilot/gpt-5',
			selected_model: { identifier: 'copilot/gpt-5', name: 'GPT-5', vendor: 'copilot' },
		});
	});

	test('returns candidates instead of guessing between ambiguous names', () => {
		const result = resolveVoiceModel([
			model('copilot/gpt-5-fast', 'GPT-5'),
			model('openai/gpt-5', 'GPT-5'),
		], 'GPT-5');

		assert.strictEqual(result.ok, false);
		assert.strictEqual(result.reason, 'ambiguous_model');
		assert.deepStrictEqual(result.available_models?.map(candidate => candidate.identifier), ['copilot/gpt-5-fast', 'openai/gpt-5']);
	});
});

suite('VoiceToolDispatchService - session actions', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	interface IActionHarnessOptions {
		readonly currentResource?: URI;
		readonly targetResource?: URI;
		readonly agentSessionResources?: readonly URI[];
		readonly chatModels?: readonly IChatModel[];
		readonly selectModelResult?: IVoiceModelSelectionResult;
		readonly switchSucceeds?: boolean;
	}

	function createActionHarness(options: IActionHarnessOptions = {}) {
		const calls = {
			switchedTo: [] as URI[],
			targeted: [] as URI[],
			selectedModels: [] as string[],
		};
		let currentResource = options.currentResource;
		let targetResource = options.targetResource;
		const agentSessionsService = new class extends mock<IAgentSessionsService>() {
			override get model(): IAgentSessionsModel {
				return {
					sessions: (options.agentSessionResources ?? []).map(resource => ({
						isArchived: () => false,
						resource,
						label: 'Agent session',
						status: AgentSessionStatus.NeedsInput,
						timing: {},
						changes: undefined,
					})),
				} as IAgentSessionsModel;
			}
		};
		const chatService = new class extends mock<IChatService>() {
			override readonly chatModels = observableValue<readonly IChatModel[]>('chatModels', options.chatModels ?? []);
			override getSession(resource: URI): IChatModel | undefined {
				return this.chatModels.get().find(model => model.sessionResource.toString() === resource.toString());
			}
		};
		const service = new VoiceToolDispatchService(
			agentSessionsService,
			chatService,
			new class extends mock<ILanguageModelToolsService>() { },
		);
		service.setDelegate(new class extends mock<IVoiceToolDispatchDelegate>() {
			override async getCurrentSessionResource(): Promise<URI | undefined> { return currentResource; }
			override async switchToSession(resource: URI): Promise<boolean> {
				calls.switchedTo.push(resource);
				if (options.switchSucceeds === false) {
					return false;
				}
				currentResource = resource;
				return true;
			}
			override setTargetSession(resource: URI): void {
				targetResource = resource;
				calls.targeted.push(resource);
			}
			override getTargetSessionResource(): URI | undefined { return targetResource; }
			override async selectModel(requestedModel: string): Promise<IVoiceModelSelectionResult> {
				calls.selectedModels.push(requestedModel);
				return options.selectModelResult ?? {
					ok: true,
					selected_model: { identifier: requestedModel, name: requestedModel, vendor: 'test' },
				};
			}
		}());
		return { service, calls };
	}

	async function dispatch(service: VoiceToolDispatchService, name: string, args: Record<string, unknown> = {}) {
		return JSON.parse(await service.dispatchToolCall({ name, args } as IVoiceToolCall));
	}

	test('focusing a session also retargets subsequent voice turns', async () => {
		const resource = URI.parse('agent-session://test/target');
		const { service, calls } = createActionHarness({ agentSessionResources: [resource] });

		const result = await dispatch(service, 'focus_session', { coding_session_id: resource.toString() });

		assert.deepStrictEqual(result, { ok: true, session_id: resource.toString() });
		assert.strictEqual(calls.switchedTo[0]?.toString(), resource.toString());
		assert.strictEqual(calls.targeted[0]?.toString(), resource.toString());
	});

	test('sets a model on the current session without changing the voice target', async () => {
		const currentResource = URI.parse('vscode-chat://test/current');
		const { service, calls } = createActionHarness({ currentResource });

		const result = await dispatch(service, 'set_model', { model: 'GPT-5' });

		assert.deepStrictEqual(result, {
			ok: true,
			selected_model: { identifier: 'GPT-5', name: 'GPT-5', vendor: 'test' },
		});
		assert.deepStrictEqual(calls.selectedModels, ['GPT-5']);
		assert.deepStrictEqual(calls.switchedTo, []);
		assert.deepStrictEqual(calls.targeted, []);
	});

	test('targets a requested session and preserves a model selection failure', async () => {
		const currentResource = URI.parse('vscode-chat://test/current');
		const targetResource = URI.parse('vscode-chat://test/target');
		const targetModel = { sessionResource: targetResource } as IChatModel;
		const { service, calls } = createActionHarness({
			currentResource,
			chatModels: [targetModel],
			selectModelResult: { ok: false, reason: 'selection_failed' },
		});

		const result = await dispatch(service, 'set_model', { model_id: 'copilot/gpt-5', coding_session_id: targetResource.toString() });

		assert.deepStrictEqual(result, { ok: false, reason: 'selection_failed' });
		assert.strictEqual(calls.switchedTo[0]?.toString(), targetResource.toString());
		assert.strictEqual(calls.targeted[0]?.toString(), targetResource.toString());
		assert.deepStrictEqual(calls.selectedModels, ['copilot/gpt-5']);
	});

	test('does not select a model when the requested session cannot be found or shown', async () => {
		const currentResource = URI.parse('vscode-chat://test/current');
		const targetResource = URI.parse('vscode-chat://test/target');
		const targetModel = { sessionResource: targetResource } as IChatModel;
		const missing = createActionHarness({ currentResource });
		const unavailable = createActionHarness({ currentResource, chatModels: [targetModel], switchSucceeds: false });

		assert.deepStrictEqual(
			await dispatch(missing.service, 'set_model', { model: 'GPT-5', coding_session_id: targetResource.toString() }),
			{ ok: false, reason: 'session_not_found' },
		);
		assert.deepStrictEqual(
			await dispatch(unavailable.service, 'set_model', { model: 'GPT-5', coding_session_id: targetResource.toString() }),
			{ ok: false, reason: 'switch_failed' },
		);
		assert.deepStrictEqual(missing.calls.selectedModels, []);
		assert.deepStrictEqual(unavailable.calls.selectedModels, []);
		assert.deepStrictEqual(unavailable.calls.targeted, []);
	});

	test('includes an active regular chat before its first request', async () => {
		const resource = URI.parse('vscode-chat://test/empty-active');
		const model = {
			sessionResource: resource,
			title: 'New chat',
			lastMessageDate: 0,
			getRequests: () => [],
		} as unknown as IChatModel;
		const { service } = createActionHarness({ currentResource: resource, chatModels: [model] });

		const result = await dispatch(service, 'get_session_info');

		assert.strictEqual(result.total_sessions, 1);
		assert.deepStrictEqual(result.counts, { working: 0, waiting_for_input: 0, idle: 1 });
		assert.deepStrictEqual(result.sessions[0], {
			id: resource.toString(),
			label: 'New chat',
			session_type: 'chat',
			state: 'idle',
			is_active: true,
			insertions: 0,
			deletions: 0,
		});
	});

	test('reports Agent Host sessions using the backend session id', async () => {
		const resource = URI.parse('agent-host-copilotcli:/waiting-session');
		const { service } = createActionHarness({ currentResource: resource, agentSessionResources: [resource] });

		const result = await dispatch(service, 'get_session_info');

		assert.deepStrictEqual(result.sessions[0], {
			id: 'copilotcli:/waiting-session',
			label: 'Agent session',
			session_type: 'agent',
			state: 'waiting_for_input',
			is_active: true,
			insertions: 0,
			deletions: 0,
		});
	});
});

suite('VoiceToolDispatchService - respondToSession', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const sessionResource = URI.parse('agent-session://test/one');
	const requestId = 'req-1';

	function serviceFor(part: object | readonly object[]): VoiceToolDispatchService {
		const parts = Array.isArray(part) ? part : [part];
		const model = new class extends mock<IChatModel>() {
			override getRequests() {
				return [{ id: requestId, response: { response: { value: parts } } }] as unknown as ReturnType<IChatModel['getRequests']>;
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

	test('refuses an approval id after the same tool is re-armed', async () => {
		const confirmations: ToolConfirmKind[] = [];
		const state = observableValue<IChatToolInvocation.State>('state', {
			type: IChatToolInvocation.StateKind.WaitingForConfirmation,
			parameters: {},
			confirm: reason => confirmations.push(reason.type),
		});
		const tool = new class extends mock<IChatToolInvocation>() {
			override readonly kind = 'toolInvocation' as const;
			override readonly toolId = 'testTool';
			override readonly state = state;
		}();
		const staleCall = approvalCall(tool, 'approve');

		state.set({
			type: IChatToolInvocation.StateKind.WaitingForConfirmation,
			parameters: {},
			confirm: reason => confirmations.push(reason.type),
		}, undefined);
		const result = await serviceFor(tool).respondToSession(staleCall);

		assert.deepStrictEqual({ result, confirmations }, {
			result: { ok: false, reason: 'stale_pending' },
			confirmations: [],
		});
	});

	test('a spoken approval retires every rehydrated copy', async () => {
		const confirmations: ToolConfirmKind[] = [];
		const tool = () => {
			const state = observableValue<IChatToolInvocation.State>('state', {
				type: IChatToolInvocation.StateKind.WaitingForConfirmation,
				parameters: { command: 'npm install' },
				confirm: reason => confirmations.push(reason.type),
			});
			const part = new class extends mock<IChatToolInvocation>() {
				override readonly kind = 'toolInvocation' as const;
				override readonly toolId = 'testTool';
				override readonly toolCallId = 'tool-call';
				override readonly state = state;
			}();
			return { part, state };
		};
		const first = tool();
		const staleCopy = tool();
		const parts = [first.part, staleCopy.part];
		const service = serviceFor(parts);
		const call = approvalCall(first.part, 'approve');
		assert.strictEqual(derivePendingId(requestId, staleCopy.part), call.args['pending_id']);

		const firstResult = await service.respondToSession(call);
		const duplicateResult = await service.respondToSession(call);

		assert.deepStrictEqual({ firstResult, duplicateResult, confirmations }, {
			firstResult: { ok: true },
			duplicateResult: { ok: false, reason: 'stale_pending' },
			confirmations: [ToolConfirmKind.UserAction],
		});

		for (const copy of [first, staleCopy]) {
			copy.state.set({
				type: IChatToolInvocation.StateKind.Cancelled,
				reason: ToolConfirmKind.Skipped,
				parameters: {},
			}, undefined);
		}
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
