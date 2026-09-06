/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { ITelemetryService, TelemetryLevel } from '../../../../../../platform/telemetry/common/telemetry.js';
import { IAssignmentFilter, IWorkbenchAssignmentService } from '../../../../../services/assignment/common/assignmentService.js';
import { ChatModelFeedbackSurveyService, ChatModelFeedbackSurveyStatus } from '../../../browser/feedbackSurvey/chatModelFeedbackSurveyService.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { CHAT_MODEL_FEEDBACK_SURVEY_CONFIG_VERSION } from '../../../common/feedbackSurvey/chatModelFeedbackSurveyConfig.js';
import { IChatModelFeedbackSurveyTelemetryEvent } from '../../../common/feedbackSurvey/chatModelFeedbackSurveyTelemetry.js';
import { ILanguageModelsService } from '../../../common/languageModels.js';
import { IChatResponseViewModel } from '../../../common/model/chatViewModel.js';

suite('ChatModelFeedbackSurveyService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const steps = [
		{ kind: 'choice', id: 'routing', title: 'Right model?', options: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }] },
		{ kind: 'text', id: 'comments', title: 'Anything else?', maxLength: 200 },
	];

	/** Probabilities use their boundaries so no random source needs stubbing. */
	function makePayload(prompt: object = {}): string {
		return JSON.stringify({
			version: CHAT_MODEL_FEEDBACK_SURVEY_CONFIG_VERSION,
			id: 'auto-routing',
			match: { selectedModels: ['auto'] },
			prompt,
			steps,
		});
	}

	/** Manual-only: the control is available but the survey never surfaces on its own. */
	const payload = makePayload();

	/** A treatment that resolves but yields no config, as a malformed or retired one would. */
	const UNUSABLE_PAYLOAD = '{}';

	const defaultSession = URI.parse('vscode-chat-editor://session-1');

	/** Responses default to being the newest row, which is the only one that offers a survey. */
	function createResponse(requestId: string, options?: { modelId?: string; sessionResource?: URI; isComplete?: boolean; isLast?: boolean }): IChatResponseViewModel {
		return {
			requestId,
			sessionResource: options?.sessionResource ?? defaultSession,
			isComplete: options?.isComplete ?? true,
			isLast: options?.isLast ?? true,
			isCanceled: false,
			errorDetails: undefined,
			result: undefined,
			model: { request: { modelId: options?.modelId ?? 'copilot/auto', modeInfo: { telemetryModeId: 'agent' } } },
		} as unknown as IChatResponseViewModel;
	}

	async function createService(options: {
		treatment?: string;
		feedbackEnabled?: boolean;
		onDidRefetchAssignments?: Event<void>;
		getTreatment?: () => string | undefined;
	} = {}) {
		const events: IChatModelFeedbackSurveyTelemetryEvent[] = [];
		const instantiationService = disposables.add(new TestInstantiationService());

		const configurationService = new TestConfigurationService();
		configurationService.setUserConfiguration('telemetry', { feedback: { enabled: options.feedbackEnabled ?? true } });

		instantiationService.stub(IWorkbenchAssignmentService, {
			_serviceBrand: undefined,
			onDidRefetchAssignments: options.onDidRefetchAssignments ?? Event.None,
			getCurrentExperiments: async () => [],
			addTelemetryAssignmentFilter(_filter: IAssignmentFilter): void { },
			getTreatment: async <T extends string | number | boolean>() => (options.getTreatment
				? options.getTreatment()
				: options.treatment ?? payload) as T | undefined,
		} satisfies IWorkbenchAssignmentService);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
		instantiationService.stub(ITelemetryService, { telemetryLevel: TelemetryLevel.USAGE } as ITelemetryService);
		instantiationService.stub(ICommandService, {
			executeCommand: async (_id: string, event: IChatModelFeedbackSurveyTelemetryEvent) => { events.push(event); },
		} as unknown as ICommandService);
		instantiationService.stub(ILanguageModelsService, { lookupLanguageModel: () => undefined } as unknown as ILanguageModelsService);
		instantiationService.stub(IChatSessionsService, { getChatSessionContribution: () => undefined } as unknown as IChatSessionsService);
		const disposeSession = disposables.add(new Emitter<{ readonly sessionResources: readonly URI[]; readonly reason: 'cleared' }>());
		instantiationService.stub(IChatService, { onDidDisposeSession: disposeSession.event } as unknown as IChatService);
		instantiationService.stub(ILogService, new NullLogService());

		const service = disposables.add(instantiationService.createInstance(ChatModelFeedbackSurveyService));
		await new Promise(resolve => setTimeout(resolve, 0)); // let the treatment resolve
		return { service, events, disposeSession, configurationService };
	}

	test('offers a matching response one stable survey and reports it as shown once', async () => {
		const { service, events } = await createService();
		const response = createResponse('req-1');

		const first = service.getSurvey(response);
		const second = service.getSurvey(response);

		assert.deepStrictEqual({
			offered: !!first,
			status: first?.status,
			stableInstance: first?.instanceId === second?.instanceId,
			reportedKinds: events.map(e => e.kind),
		}, {
			offered: true,
			status: ChatModelFeedbackSurveyStatus.Collapsed,
			stableInstance: true,
			reportedKinds: ['shown'],
		});
	});

	test('withholds the survey when the response does not qualify', async () => {
		const { service } = await createService();

		assert.deepStrictEqual({
			wrongModel: service.getSurvey(createResponse('req-1', { modelId: 'copilot/gpt-5.2' })),
			stillStreaming: service.getSurvey(createResponse('req-2', { isComplete: false })),
		}, {
			wrongModel: undefined,
			stillStreaming: undefined,
		});
	});

	test('reports each step as it is answered so an abandoned survey still yields data', async () => {
		const { service, events } = await createService();
		const response = createResponse('req-1');
		service.getSurvey(response);

		service.toggle(response);
		service.answerChoice(response, 'routing', 'yes');
		service.setCommentDraft(response, 'some thoughts');
		service.dismiss(response);

		assert.deepStrictEqual(events.map(e => ({ kind: e.kind, stepId: e.stepId, answerId: e.answerId, comment: e.comment })), [
			{ kind: 'shown', stepId: undefined, answerId: undefined, comment: undefined },
			{ kind: 'opened', stepId: undefined, answerId: undefined, comment: undefined },
			{ kind: 'step', stepId: 'routing', answerId: 'yes', comment: undefined },
			{ kind: 'step', stepId: 'comments', answerId: undefined, comment: 'some thoughts' },
			{ kind: 'dismissed', stepId: undefined, answerId: undefined, comment: undefined },
		]);
	});

	test('ignores answers that are not configured options', async () => {
		const { service, events } = await createService();
		const response = createResponse('req-1');
		service.getSurvey(response);
		service.toggle(response);

		service.answerChoice(response, 'routing', 'injected-value');

		assert.deepStrictEqual(events.map(e => e.kind), ['shown', 'opened']);
	});

	test('acknowledges an answered response instead of re-asking, without removing the control', async () => {
		const { service, events } = await createService();
		const response = createResponse('req-1');
		service.getSurvey(response);
		service.toggle(response);
		service.submit(response, 'done');

		const afterSubmit = service.getSurvey(response);
		service.dismiss(response);      // close the acknowledgement
		service.toggle(response);         // and reopen it

		assert.deepStrictEqual({
			stillAvailable: !!afterSubmit,
			isSubmitted: afterSubmit?.isSubmitted,
			reopened: service.getSurvey(response)?.isSubmitted,
			// Reopening an answered survey must not inflate the funnel.
			opens: events.filter(e => e.kind === 'opened').length,
			submissions: events.filter(e => e.kind === 'submitted').length,
			dismissals: events.filter(e => e.kind === 'dismissed').length,
		}, {
			stillAvailable: true,
			isSubmitted: true,
			reopened: true,
			opens: 1,
			submissions: 1,
			dismissals: 0,
		});
	});

	test('offers the survey only on the newest response', async () => {
		const { service } = await createService();

		const older = createResponse('req-1', { isLast: false });
		const newest = createResponse('req-2');

		assert.deepStrictEqual({
			older: service.getSurvey(older),
			newest: !!service.getSurvey(newest),
		}, {
			older: undefined,
			newest: true,
		});
	});

	test('drops the control from a response once a newer one arrives', async () => {
		const { service } = await createService();
		const response = createResponse('req-1');
		service.getSurvey(response);

		const superseded = createResponse('req-1', { isLast: false });

		assert.strictEqual(service.getSurvey(superseded), undefined);
	});

	test('keeps a part answered survey alive after it is superseded', async () => {
		const { service } = await createService();
		const response = createResponse('req-1');
		service.getSurvey(response);
		service.toggle(response);
		service.answerChoice(response, 'routing', 'yes');

		// The user is mid answer, so a newer response must not pull the form away.
		const superseded = createResponse('req-1', { isLast: false });

		assert.deepStrictEqual(service.getSurvey(superseded)?.status, ChatModelFeedbackSurveyStatus.Open);
	});

	test('opening a survey closes the one already showing', async () => {
		const { service, events } = await createService();
		const first = createResponse('req-1');
		service.getSurvey(first);
		service.toggle(first);

		const second = createResponse('req-2');
		service.getSurvey(second);
		service.toggle(second);

		assert.deepStrictEqual({
			// Closed by the second opening, then dropped because it is no longer the newest row.
			first: service.getSurvey(createResponse('req-1', { isLast: false })),
			second: service.getSurvey(second)?.status,
			// Being superseded is the UI moving on, so it is not reported as a dismissal.
			dismissals: events.filter(e => e.kind === 'dismissed').length,
		}, {
			first: undefined,
			second: ChatModelFeedbackSurveyStatus.Open,
			dismissals: 0,
		});
	});

	test('leaves other sessions alone when a new response supersedes one', async () => {
		const { service, events } = await createService();
		const otherSession = URI.parse('vscode-chat-editor://session-2');

		const other = createResponse('other-1', { sessionResource: otherSession });
		const otherInstance = service.getSurvey(other)?.instanceId;

		// A new response in the first session must not evict the second session's state.
		service.getSurvey(createResponse('req-1'));
		service.getSurvey(createResponse('req-2'));

		assert.deepStrictEqual({
			sameInstance: service.getSurvey(other)?.instanceId === otherInstance,
			shownForOther: events.filter(e => e.kind === 'shown' && e.requestId === 'other-1').length,
		}, {
			sameInstance: true,
			shownForOther: 1,
		});
	});

	test('does not let an automatic prompt displace a survey being answered', async () => {
		const { service } = await createService({ treatment: makePayload({ chance: { initial: 1 }, maxPerSession: 5, cooldownDays: 0 }) });

		const first = createResponse('req-1');
		service.getSurvey(first);
		service.answerChoice(first, 'routing', 'yes');

		// The next response would normally auto open, but the user is mid answer.
		const second = createResponse('req-2');

		assert.deepStrictEqual({
			first: service.getSurvey(createResponse('req-1', { isLast: false }))?.status,
			second: service.getSurvey(second)?.status,
		}, {
			first: ChatModelFeedbackSurveyStatus.Open,
			second: ChatModelFeedbackSurveyStatus.Collapsed,
		});
	});

	test('stops a stale response being prompted once a newer one arrives', async () => {
		const { service } = await createService({ treatment: makePayload({ chance: { initial: 0 }, triggers: { modelSwitchedAway: true } }) });
		const surveyed = createResponse('req-1');
		service.getSurvey(surveyed);

		// A newer response the survey does not match still supersedes the old one.
		service.getSurvey(createResponse('req-2', { modelId: 'copilot/gpt-5.2' }));
		service.notifyModelSwitchedAway(defaultSession, 'copilot/auto', 'copilot/gpt-5.2');

		assert.strictEqual(service.getSurvey(createResponse('req-1', { isLast: false })), undefined);
	});

	test('toggles the survey closed when the control is pressed again', async () => {
		const { service, events } = await createService();
		const response = createResponse('req-1');
		service.getSurvey(response);

		service.toggle(response);
		const opened = service.getSurvey(response)?.status;
		service.toggle(response);
		const closed = service.getSurvey(response)?.status;
		service.toggle(response);

		assert.deepStrictEqual({
			opened,
			closed,
			reopened: service.getSurvey(response)?.status,
			kinds: events.map(e => e.kind),
		}, {
			opened: ChatModelFeedbackSurveyStatus.Open,
			closed: ChatModelFeedbackSurveyStatus.Collapsed,
			reopened: ChatModelFeedbackSurveyStatus.Open,
			// Closing by the control is a dismissal, exactly as the X and Escape are.
			kinds: ['shown', 'opened', 'dismissed', 'opened'],
		});
	});

	test('toggling an acknowledgement closed does not report a second dismissal', async () => {
		const { service, events } = await createService();
		const response = createResponse('req-1');
		service.getSurvey(response);
		service.toggle(response);
		service.submit(response, 'done');

		service.toggle(response);   // hide the acknowledgement
		const hidden = service.getSurvey(response)?.status;
		service.toggle(response);   // and show it again

		assert.deepStrictEqual({
			hidden,
			shownAgain: service.getSurvey(response)?.isSubmitted,
			dismissals: events.filter(e => e.kind === 'dismissed').length,
			opens: events.filter(e => e.kind === 'opened').length,
		}, {
			hidden: ChatModelFeedbackSurveyStatus.Collapsed,
			shownAgain: true,
			dismissals: 0,
			opens: 1,
		});
	});

	test('stops offering a survey once feedback is switched off', async () => {
		const { service, configurationService } = await createService();
		const response = createResponse('req-1');
		const offered = !!service.getSurvey(response);

		configurationService.setUserConfiguration('telemetry', { feedback: { enabled: false } });

		assert.deepStrictEqual({ offered, afterDisabling: service.getSurvey(response) }, { offered: true, afterDisabling: undefined });
	});

	test('releases what it held for a session once that session goes away', async () => {
		const { service, disposeSession } = await createService();
		const response = createResponse('req-1');
		const first = service.getSurvey(response)?.instanceId;

		disposeSession.fire({ sessionResources: [defaultSession], reason: 'cleared' });

		// A fresh instance means the entry really was released rather than reused.
		assert.notStrictEqual(service.getSurvey(createResponse('req-1'))?.instanceId, first);
	});

	test('keeps the control on the newest response even after the prompt budget is spent', async () => {
		// Pacing governs unprompted surfacing only, so manual feedback is never rationed.
		const { service } = await createService({ treatment: makePayload({ chance: { initial: 1 }, maxPerSession: 1 }) });

		const first = service.getSurvey(createResponse('req-1'));
		const second = service.getSurvey(createResponse('req-2'));
		const third = service.getSurvey(createResponse('req-3'));

		assert.deepStrictEqual({
			available: [!!first, !!second, !!third],
			autoOpened: [first?.status, second?.status, third?.status],
		}, {
			available: [true, true, true],
			autoOpened: [
				ChatModelFeedbackSurveyStatus.Open, // the one automatic prompt this session allows
				ChatModelFeedbackSurveyStatus.Collapsed,
				ChatModelFeedbackSurveyStatus.Collapsed,
			],
		});
	});

	test('manual activation always opens, whatever the prompting rules say', async () => {
		// One automatic prompt per session and a year long cooldown, both of which the first
		// response consumes so the second is left with no automatic budget at all.
		const { service, events } = await createService({ treatment: makePayload({ chance: { initial: 1 }, maxPerSession: 1, cooldownDays: 365 }) });

		const prompted = createResponse('req-1');
		const autoStatus = service.getSurvey(prompted)?.status;

		const second = createResponse('req-2');
		const beforeManual = service.getSurvey(second)?.status;
		service.toggle(second);

		assert.deepStrictEqual({
			autoStatus,
			beforeManual,
			afterManual: service.getSurvey(second)?.status,
			triggers: events.filter(e => e.kind === 'opened').map(e => e.trigger),
		}, {
			autoStatus: ChatModelFeedbackSurveyStatus.Open,
			beforeManual: ChatModelFeedbackSurveyStatus.Collapsed,
			afterManual: ChatModelFeedbackSurveyStatus.Open,
			triggers: ['chance', 'manual'],
		});
	});

	test('ramps the odds with each response that passes without prompting', async () => {
		// An increment of 1 makes the ramp observable without stubbing random. The first response
		// has probability 0 and the second, after one miss, has probability 1.
		const { service } = await createService({ treatment: makePayload({ chance: { initial: 0, increment: 1 }, maxPerSession: 5, cooldownDays: 0 }) });

		assert.deepStrictEqual([
			service.getSurvey(createResponse('req-1'))?.status,
			service.getSurvey(createResponse('req-2'))?.status,
		], [
			ChatModelFeedbackSurveyStatus.Collapsed,
			ChatModelFeedbackSurveyStatus.Open,
		]);
	});

	test('prompts on switching away from the surveyed model, and only within the trigger rules', async () => {
		const enabled = await createService({ treatment: makePayload({ chance: { initial: 0 }, triggers: { modelSwitchedAway: true } }) });
		const disabled = await createService({ treatment: makePayload({ chance: { initial: 0 } }) });

		const enabledResponse = createResponse('req-1');
		enabled.service.getSurvey(enabledResponse);
		enabled.service.notifyModelSwitchedAway(defaultSession, 'copilot/auto', 'copilot/gpt-5.2');

		const disabledResponse = createResponse('req-1');
		disabled.service.getSurvey(disabledResponse);
		disabled.service.notifyModelSwitchedAway(defaultSession, 'copilot/auto', 'copilot/gpt-5.2');

		assert.deepStrictEqual({
			enabled: enabled.service.getSurvey(enabledResponse)?.status,
			enabledTrigger: enabled.events.filter(e => e.kind === 'opened').map(e => e.trigger),
			disabled: disabled.service.getSurvey(disabledResponse)?.status,
		}, {
			enabled: ChatModelFeedbackSurveyStatus.Open,
			enabledTrigger: ['modelSwitchedAway'],
			disabled: ChatModelFeedbackSurveyStatus.Collapsed,
		});
	});

	test('ignores model switches that are not away from the surveyed model', async () => {
		const { service } = await createService({ treatment: makePayload({ chance: { initial: 0 }, triggers: { modelSwitchedAway: true } }) });

		const unrelated = createResponse('req-1');
		service.getSurvey(unrelated);
		// A switch between two unsurveyed models says nothing about Auto, even though an Auto
		// response is still the most recent surveyed one here.
		service.notifyModelSwitchedAway(defaultSession, 'copilot/gpt-5.2', 'copilot/claude-sonnet-4.5');
		const afterUnrelated = service.getSurvey(unrelated)?.status;

		// Moving between two surveyed models is not abandoning the thing being surveyed.
		service.notifyModelSwitchedAway(defaultSession, 'copilot/auto', 'agent-host-copilotcli:auto');

		assert.deepStrictEqual({
			afterUnrelated,
			afterMatchedToMatched: service.getSurvey(unrelated)?.status,
		}, {
			afterUnrelated: ChatModelFeedbackSurveyStatus.Collapsed,
			afterMatchedToMatched: ChatModelFeedbackSurveyStatus.Collapsed,
		});
	});

	test('completes a survey whose last step is a choice, since it has no submit button', async () => {
		const choiceOnly = JSON.stringify({
			version: CHAT_MODEL_FEEDBACK_SURVEY_CONFIG_VERSION,
			id: 'choice-only',
			match: { selectedModels: ['auto'] },
			steps: [{ kind: 'choice', id: 'routing', title: 'Right model?', options: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }] }],
		});
		const { service, events } = await createService({ treatment: choiceOnly });
		const response = createResponse('req-1');
		service.getSurvey(response);
		service.toggle(response);

		service.answerChoice(response, 'routing', 'yes');

		assert.deepStrictEqual({
			kinds: events.map(e => e.kind),
			// The survey is over, so it acknowledges rather than asking again.
			isSubmitted: service.getSurvey(response)?.isSubmitted,
		}, {
			kinds: ['shown', 'opened', 'step', 'submitted'],
			isSubmitted: true,
		});
	});

	test('keeps an open survey and its budget when the treatment stops resolving to a usable config', async () => {
		const refetch = new Emitter<void>();
		const treatments: (string | undefined)[] = [payload, UNUSABLE_PAYLOAD];
		const { service } = await createService({ onDidRefetchAssignments: refetch.event, getTreatment: () => treatments.shift() });
		const response = createResponse('req-1');
		service.getSurvey(response);
		service.toggle(response);

		refetch.fire();
		await new Promise(resolve => setTimeout(resolve, 0));

		assert.deepStrictEqual(service.getSurvey(response)?.status, ChatModelFeedbackSurveyStatus.Open);
		refetch.dispose();
	});

	test('preserves an uncommitted comment draft across a widget recycle', async () => {
		const { service } = await createService();
		const response = createResponse('req-1');
		service.getSurvey(response);
		service.toggle(response);
		service.answerChoice(response, 'routing', 'yes');

		service.setCommentDraft(response, 'half typed');

		assert.strictEqual(service.getSurvey(response)?.commentDraft, 'half typed');
	});

	test('collects nothing without a usable experiment or with feedback disabled', async () => {
		const unconfigured = await createService({ treatment: UNUSABLE_PAYLOAD });
		const feedbackOff = await createService({ feedbackEnabled: false });

		assert.deepStrictEqual({
			unconfiguredSurvey: unconfigured.service.getSurvey(createResponse('req-1')),
			unconfiguredEvents: unconfigured.events,
			feedbackOffSurvey: feedbackOff.service.getSurvey(createResponse('req-1')),
			feedbackOffEvents: feedbackOff.events,
		}, {
			unconfiguredSurvey: undefined,
			unconfiguredEvents: [],
			feedbackOffSurvey: undefined,
			feedbackOffEvents: [],
		});
	});
});
