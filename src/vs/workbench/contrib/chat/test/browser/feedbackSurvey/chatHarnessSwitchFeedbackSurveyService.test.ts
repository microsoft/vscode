/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { ITelemetryService, TelemetryLevel } from '../../../../../../platform/telemetry/common/telemetry.js';
import { ChatHarnessSwitchFeedbackSurveyService } from '../../../browser/feedbackSurvey/chatHarnessSwitchFeedbackSurveyService.js';
import { IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { IChatQuestionAnswerValue, IChatQuestionCarousel } from '../../../common/chatService/chatService.js';
import { IChatQuestionCarouselOptions } from '../../../browser/widget/chatContentParts/chatQuestionCarouselPart.js';
import { ChatConfiguration, CopilotHarnessIntroductionMode } from '../../../common/constants.js';
import { CHAT_HARNESS_SWITCH_FEEDBACK_SURVEY_TELEMETRY_COMMAND_ID, IChatHarnessSwitchFeedbackSurveyTelemetryEvent } from '../../../common/feedbackSurvey/chatHarnessSwitchFeedbackSurveyTelemetry.js';

suite('ChatHarnessSwitchFeedbackSurveyService', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const inputUri = URI.parse('vscode-chat-input://input-1');
	const context = {
		mode: CopilotHarnessIntroductionMode.AfterRequest,
		surface: 'sidebar' as const,
		chatSessionId: 'session-1',
		sessionType: 'agent-host-copilotcli',
		harness: 'copilotcli',
	};

	function createService(options: { surveyEnabled?: boolean; feedbackEnabled?: boolean; telemetryLevel?: TelemetryLevel; hasWidget?: boolean } = {}) {
		const events: { readonly commandId: string; readonly event: IChatHarnessSwitchFeedbackSurveyTelemetryEvent }[] = [];
		const carousels: { readonly carousel: IChatQuestionCarousel; readonly options: IChatQuestionCarouselOptions }[] = [];
		const cleared: (string | undefined)[] = [];
		let focusRestores = 0;
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.HarnessSwitchFeedbackSurveyEnabled]: options.surveyEnabled ?? true,
		});
		configurationService.setUserConfiguration('telemetry', { feedback: { enabled: options.feedbackEnabled ?? true } });

		const widget = {
			input: {
				renderQuestionCarousel: (carousel: IChatQuestionCarousel, _context: undefined, carouselOptions: IChatQuestionCarouselOptions) => {
					carousels.push({ carousel, options: carouselOptions });
					return undefined!;
				},
				clearQuestionCarousel: (_responseId?: string, resolveId?: string) => cleared.push(resolveId),
				focus: () => focusRestores++,
			},
		} as unknown as IChatWidget;
		const chatWidgetService = new class extends mock<IChatWidgetService>() {
			override readonly onDidRemoveWidget = Event.None;
			override getWidgetByInputUri(uri: URI): IChatWidget | undefined {
				return options.hasWidget === false || uri.toString() !== inputUri.toString() ? undefined : widget;
			}
		}();

		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
		instantiationService.stub(ITelemetryService, { telemetryLevel: options.telemetryLevel ?? TelemetryLevel.USAGE } as ITelemetryService);
		instantiationService.stub(ICommandService, {
			executeCommand: async (commandId: string, event: IChatHarnessSwitchFeedbackSurveyTelemetryEvent) => {
				events.push({ commandId, event });
			},
		} as unknown as ICommandService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IChatWidgetService, chatWidgetService);

		const service = store.add(instantiationService.createInstance(ChatHarnessSwitchFeedbackSurveyService));
		return { service, events, carousels, cleared, get focusRestores() { return focusRestores; } };
	}

	test('renders the existing question carousel and reports submitted answers through restricted telemetry', async () => {
		const harness = createService();
		const { service, events, carousels, cleared } = harness;
		service.prompt(inputUri, context);

		const rendered = carousels[0];
		const answers = new Map<string, IChatQuestionAnswerValue>([
			['reason', { selectedValue: 'performance' }],
			['feedback', '  It took too long to start.  '],
		]);
		rendered.options.onSubmit(answers);
		const clearedBeforeAcknowledgementDismiss = cleared.length;
		rendered.options.submissionAcknowledgement?.onDidDismiss();
		await Promise.resolve();

		assert.deepStrictEqual({
			carousel: {
				kind: rendered.carousel.kind,
				resolveId: rendered.carousel.resolveId?.startsWith('chat.harnessSwitchFeedbackSurvey.'),
				allowSkip: rendered.carousel.allowSkip,
				questions: rendered.carousel.questions,
				dismissLabel: rendered.options.dismissLabel,
				submissionAcknowledgement: rendered.options.submissionAcknowledgement && {
					message: rendered.options.submissionAcknowledgement.message,
					dismissLabel: rendered.options.submissionAcknowledgement.dismissLabel,
				},
				shouldAutoFocus: rendered.options.shouldAutoFocus,
			},
			events: events.map(({ commandId, event }) => ({
				commandId,
				kind: event.kind,
				stepId: event.stepId,
				stepIndex: event.stepIndex,
				answerId: event.answerId,
				comment: event.comment,
				mode: event.mode,
				fromHarness: event.fromHarness,
				toHarness: event.toHarness,
				surface: event.surface,
			})),
			clearedBeforeAcknowledgementDismiss,
			clearedAfterAcknowledgementDismiss: cleared.length,
			focusRestores: harness.focusRestores,
		}, {
			carousel: {
				kind: 'questionCarousel',
				resolveId: true,
				allowSkip: true,
				questions: [{
					id: 'reason',
					type: 'singleSelect',
					title: 'Why did you switch harnesses?',
					options: [
						{ id: 'preferLocal', label: 'I prefer the Local experience', value: 'preferLocal' },
						{ id: 'missingFeature', label: 'A feature I need was unavailable', value: 'missingFeature' },
						{ id: 'performance', label: 'Copilot was too slow', value: 'performance' },
						{ id: 'reliability', label: 'Copilot did not work as expected', value: 'reliability' },
						{ id: 'other', label: 'Something else', value: 'other' },
					],
					allowFreeformInput: false,
					required: true,
				}, {
					id: 'feedback',
					type: 'text',
					title: 'Any feedback?',
					description: 'Share any additional feedback (optional).',
					required: false,
					validation: { maxLength: 1000 },
				}],
				dismissLabel: 'Dismiss Survey',
				submissionAcknowledgement: {
					message: 'Thanks, your feedback has been recorded.',
					dismissLabel: 'Dismiss Feedback Acknowledgement',
				},
				shouldAutoFocus: true,
			},
			events: [
				{
					commandId: CHAT_HARNESS_SWITCH_FEEDBACK_SURVEY_TELEMETRY_COMMAND_ID,
					kind: 'shown',
					stepId: undefined,
					stepIndex: undefined,
					answerId: undefined,
					comment: undefined,
					mode: CopilotHarnessIntroductionMode.AfterRequest,
					fromHarness: 'copilot',
					toHarness: 'local',
					surface: 'sidebar',
				},
				{
					commandId: CHAT_HARNESS_SWITCH_FEEDBACK_SURVEY_TELEMETRY_COMMAND_ID,
					kind: 'step',
					stepId: 'reason',
					stepIndex: 0,
					answerId: 'performance',
					comment: undefined,
					mode: CopilotHarnessIntroductionMode.AfterRequest,
					fromHarness: 'copilot',
					toHarness: 'local',
					surface: 'sidebar',
				},
				{
					commandId: CHAT_HARNESS_SWITCH_FEEDBACK_SURVEY_TELEMETRY_COMMAND_ID,
					kind: 'step',
					stepId: 'feedback',
					stepIndex: 1,
					answerId: undefined,
					comment: 'It took too long to start.',
					mode: CopilotHarnessIntroductionMode.AfterRequest,
					fromHarness: 'copilot',
					toHarness: 'local',
					surface: 'sidebar',
				},
				{
					commandId: CHAT_HARNESS_SWITCH_FEEDBACK_SURVEY_TELEMETRY_COMMAND_ID,
					kind: 'submitted',
					stepId: undefined,
					stepIndex: undefined,
					answerId: undefined,
					comment: undefined,
					mode: CopilotHarnessIntroductionMode.AfterRequest,
					fromHarness: 'copilot',
					toHarness: 'local',
					surface: 'sidebar',
				},
			],
			clearedBeforeAcknowledgementDismiss: 0,
			clearedAfterAcknowledgementDismiss: 1,
			focusRestores: 1,
		});
	});

	test('reports draft answers when the carousel is dismissed', async () => {
		const harness = createService();
		const { service, events, carousels, cleared } = harness;
		service.prompt(inputUri, context);
		const rendered = carousels[0];
		rendered.options.onDidDismiss?.(new Map<string, IChatQuestionAnswerValue>([
			['reason', { selectedValue: 'preferLocal' }],
			['feedback', 'Keep the startup flow simpler.'],
		]));
		rendered.options.onSubmit(undefined);
		await Promise.resolve();

		assert.deepStrictEqual({
			events: events.map(({ event }) => ({
				kind: event.kind,
				stepId: event.stepId,
				answerId: event.answerId,
				comment: event.comment,
			})),
			cleared: cleared.length,
			focusRestores: harness.focusRestores,
		}, {
			events: [
				{ kind: 'shown', stepId: undefined, answerId: undefined, comment: undefined },
				{ kind: 'step', stepId: 'reason', answerId: 'preferLocal', comment: undefined },
				{ kind: 'step', stepId: 'feedback', answerId: undefined, comment: 'Keep the startup flow simpler.' },
				{ kind: 'dismissed', stepId: undefined, answerId: undefined, comment: undefined },
			],
			cleared: 1,
			focusRestores: 1,
		});
	});

	test('uses the dedicated experiment gate and still requires feedback telemetry and a target input', () => {
		const experimentOff = createService({ surveyEnabled: false });
		experimentOff.service.prompt(inputUri, context);
		const introductionOff = createService();
		introductionOff.service.prompt(inputUri, { ...context, mode: CopilotHarnessIntroductionMode.Off });
		const feedbackOff = createService({ feedbackEnabled: false });
		feedbackOff.service.prompt(inputUri, context);
		const telemetryOff = createService({ telemetryLevel: TelemetryLevel.NONE });
		telemetryOff.service.prompt(inputUri, context);
		const missingInput = createService({ hasWidget: false });
		missingInput.service.prompt(inputUri, context);

		assert.deepStrictEqual({
			experimentOff: experimentOff.carousels.length,
			introductionOff: introductionOff.carousels.length,
			feedbackOff: feedbackOff.carousels.length,
			telemetryOff: telemetryOff.carousels.length,
			missingInput: missingInput.carousels.length,
		}, {
			experimentOff: 0,
			introductionOff: 1,
			feedbackOff: 0,
			telemetryOff: 0,
			missingInput: 0,
		});
	});

	test('prompts only once after the survey is shown', () => {
		const { service, carousels } = createService();
		service.prompt(inputUri, context);
		carousels[0].options.onSubmit(undefined);
		service.prompt(inputUri, context);

		assert.strictEqual(carousels.length, 1);
	});
});
