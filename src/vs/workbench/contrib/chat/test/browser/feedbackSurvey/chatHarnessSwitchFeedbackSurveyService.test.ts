/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { ITelemetryService, TelemetryLevel } from '../../../../../../platform/telemetry/common/telemetry.js';
import { ChatHarnessSwitchFeedbackSurveyService } from '../../../browser/feedbackSurvey/chatHarnessSwitchFeedbackSurveyService.js';
import { IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { IChatQuestionAnswerValue, IChatQuestionCarousel } from '../../../common/chatService/chatService.js';
import { ChatQuestionCarouselPart, IChatQuestionCarouselOptions } from '../../../browser/widget/chatContentParts/chatQuestionCarouselPart.js';
import { ChatInputPart } from '../../../browser/widget/input/chatInputPart.js';
import { ChatConfiguration, CopilotHarnessIntroductionMode } from '../../../common/constants.js';

suite('ChatHarnessSwitchFeedbackSurveyService', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const inputUri = URI.parse('vscode-chat-input://input-1');
	const eventName = 'chatHarnessSwitchFeedbackSurvey';
	const context = {
		mode: CopilotHarnessIntroductionMode.AfterRequest,
		surface: 'sidebar' as const,
		chatSessionId: 'session-1',
		sessionType: 'agent-host-copilotcli',
		harness: 'copilotcli',
	};

	function createService(options: { surveyEnabled?: boolean; feedbackEnabled?: boolean; telemetryLevel?: TelemetryLevel; hasWidget?: boolean; storageService?: IStorageService } = {}) {
		const events: { readonly eventName: string; readonly data: object | undefined }[] = [];
		const carousels: { readonly carousel: IChatQuestionCarousel; readonly options: IChatQuestionCarouselOptions }[] = [];
		const cleared: (string | undefined)[] = [];
		let focusRestores = 0;
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.HarnessSwitchFeedbackSurveyEnabled]: options.surveyEnabled ?? true,
		});
		configurationService.setUserConfiguration('telemetry', { feedback: { enabled: options.feedbackEnabled ?? true } });

		const widget = upcastPartial<IChatWidget>({
			input: upcastPartial<ChatInputPart>({
				renderQuestionCarousel: (carousel: IChatQuestionCarousel, _context: undefined, carouselOptions: IChatQuestionCarouselOptions) => {
					carousels.push({ carousel, options: carouselOptions });
					return new class extends mock<ChatQuestionCarouselPart>() { }();
				},
				clearQuestionCarousel: (_responseId?: string, resolveId?: string) => cleared.push(resolveId),
				focus: () => focusRestores++,
			}),
		});
		const chatWidgetService = new class extends mock<IChatWidgetService>() {
			override readonly onDidRemoveWidget = Event.None;
			override getWidgetByInputUri(uri: URI): IChatWidget | undefined {
				return options.hasWidget === false || uri.toString() !== inputUri.toString() ? undefined : widget;
			}
		}();
		const telemetryService = new class extends mock<ITelemetryService>() {
			override telemetryLevel = options.telemetryLevel ?? TelemetryLevel.USAGE;
			override publicLog2(eventName: string, data?: object): void {
				events.push({ eventName, data });
			}
		}();

		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IStorageService, options.storageService ?? store.add(new InMemoryStorageService()));
		instantiationService.stub(ITelemetryService, telemetryService);
		instantiationService.stub(IChatWidgetService, chatWidgetService);

		const service = store.add(instantiationService.createInstance(ChatHarnessSwitchFeedbackSurveyService));
		return { service, events, carousels, cleared, configurationService, telemetryService, get focusRestores() { return focusRestores; } };
	}

	function getExpectedEventData(carousel: IChatQuestionCarousel) {
		return {
			...context,
			surveyId: 'copilot-local-switch-v1',
			surveyInstanceId: carousel.resolveId?.slice('chat.harnessSwitchFeedbackSurvey.'.length),
			stepCount: 1,
			stepId: undefined,
			stepIndex: undefined,
			answerId: undefined,
			fromHarness: 'copilot',
			toHarness: 'local',
		};
	}

	test('reports the fixed-choice answer through core telemetry and offers a GitHub feedback link', async () => {
		const harness = createService();
		const { service, events, carousels, cleared } = harness;
		service.prompt(inputUri, context);

		const rendered = carousels[0];
		const answers = new Map<string, IChatQuestionAnswerValue>([
			['reason', { selectedValue: 'performance', freeformValue: 'This must not reach telemetry.' }],
			['feedback', '  It took too long to start.  '],
		]);
		rendered.options.onSubmit(answers);
		const clearedBeforeAcknowledgementDismiss = cleared.length;
		rendered.options.submissionAcknowledgement?.onDidDismiss();
		await Promise.resolve();
		const commonData = getExpectedEventData(rendered.carousel);

		assert.deepStrictEqual({
			carousel: {
				kind: rendered.carousel.kind,
				resolveId: rendered.carousel.resolveId?.startsWith('chat.harnessSwitchFeedbackSurvey.'),
				allowSkip: rendered.carousel.allowSkip,
				questions: rendered.carousel.questions,
				dismissLabel: rendered.options.dismissLabel,
				submissionAcknowledgement: rendered.options.submissionAcknowledgement && {
					message: rendered.options.submissionAcknowledgement.message,
					description: rendered.options.submissionAcknowledgement.description?.value,
					dismissLabel: rendered.options.submissionAcknowledgement.dismissLabel,
				},
				shouldAutoFocus: rendered.options.shouldAutoFocus,
			},
			events,
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
				}],
				dismissLabel: 'Dismiss Survey',
				submissionAcknowledgement: {
					message: 'Thanks, your feedback has been recorded.',
					description: 'Have specific feedback? [Share it on GitHub](https://github.com/microsoft/vscode/issues).',
					dismissLabel: 'Dismiss Feedback Acknowledgement',
				},
				shouldAutoFocus: true,
			},
			events: [
				{ eventName, data: { ...commonData, kind: 'shown' } },
				{ eventName, data: { ...commonData, kind: 'step', stepId: 'reason', stepIndex: 0, answerId: 'performance' } },
				{ eventName, data: { ...commonData, kind: 'submitted' } },
			],
			clearedBeforeAcknowledgementDismiss: 0,
			clearedAfterAcknowledgementDismiss: 1,
			focusRestores: 1,
		});
	});

	test('reports only the predefined draft reason when the carousel is dismissed', async () => {
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
		const commonData = getExpectedEventData(rendered.carousel);

		assert.deepStrictEqual({
			events,
			cleared: cleared.length,
			focusRestores: harness.focusRestores,
		}, {
			events: [
				{ eventName, data: { ...commonData, kind: 'shown' } },
				{ eventName, data: { ...commonData, kind: 'step', stepId: 'reason', stepIndex: 0, answerId: 'preferLocal' } },
				{ eventName, data: { ...commonData, kind: 'dismissed' } },
			],
			cleared: 1,
			focusRestores: 1,
		});
	});

	for (const answerId of ['preferLocal', 'missingFeature', 'performance', 'reliability', 'other']) {
		test(`logs predefined reason ${answerId} only once`, () => {
			const { service, events, carousels } = createService();
			service.prompt(inputUri, context);
			const rendered = carousels[0];
			const answers = new Map<string, IChatQuestionAnswerValue>([['reason', { selectedValue: answerId }]]);
			rendered.options.onSubmit(answers);
			rendered.options.onSubmit(answers);
			rendered.options.onSubmit(undefined);
			const commonData = getExpectedEventData(rendered.carousel);

			assert.deepStrictEqual(events, [
				{ eventName, data: { ...commonData, kind: 'shown' } },
				{ eventName, data: { ...commonData, kind: 'step', stepId: 'reason', stepIndex: 0, answerId } },
				{ eventName, data: { ...commonData, kind: 'submitted' } },
			]);
		});
	}

	test('does not log free text, unknown reason IDs, or unrelated answers', () => {
		const invalidReasons: IChatQuestionAnswerValue[] = [
			'arbitrary feedback',
			{ selectedValue: 'unknown reason' },
			{ freeformValue: 'arbitrary feedback' },
			{ selectedValues: ['preferLocal'] },
		];
		for (const reason of invalidReasons) {
			const { service, events, carousels } = createService();
			service.prompt(inputUri, context);
			const rendered = carousels[0];
			rendered.options.onSubmit(new Map<string, IChatQuestionAnswerValue>([
				['reason', reason],
				['feedback', 'private feedback'],
				['unexpected', 'unrelated answer'],
			]));
			const commonData = getExpectedEventData(rendered.carousel);

			assert.deepStrictEqual(events, [
				{ eventName, data: { ...commonData, kind: 'shown' } },
				{ eventName, data: { ...commonData, kind: 'submitted' } },
			]);
		}
	});

	test('uses the dedicated experiment gate and requires feedback, usage telemetry, and a target input', () => {
		const experimentOff = createService({ surveyEnabled: false });
		experimentOff.service.prompt(inputUri, context);
		const introductionOff = createService();
		introductionOff.service.prompt(inputUri, { ...context, mode: CopilotHarnessIntroductionMode.Off });
		const feedbackOff = createService({ feedbackEnabled: false });
		feedbackOff.service.prompt(inputUri, context);
		const telemetryOff = createService({ telemetryLevel: TelemetryLevel.NONE });
		telemetryOff.service.prompt(inputUri, context);
		const errorTelemetry = createService({ telemetryLevel: TelemetryLevel.ERROR });
		errorTelemetry.service.prompt(inputUri, context);
		const crashTelemetry = createService({ telemetryLevel: TelemetryLevel.CRASH });
		crashTelemetry.service.prompt(inputUri, context);
		const missingInput = createService({ hasWidget: false });
		missingInput.service.prompt(inputUri, context);

		assert.deepStrictEqual({
			experimentOff: experimentOff.carousels.length,
			introductionOff: introductionOff.carousels.length,
			feedbackOff: feedbackOff.carousels.length,
			telemetryOff: telemetryOff.carousels.length,
			errorTelemetry: errorTelemetry.carousels.length,
			crashTelemetry: crashTelemetry.carousels.length,
			missingInput: missingInput.carousels.length,
			suppressedEvents: [experimentOff, feedbackOff, telemetryOff, errorTelemetry, crashTelemetry, missingInput].flatMap(harness => harness.events),
		}, {
			experimentOff: 0,
			introductionOff: 1,
			feedbackOff: 0,
			telemetryOff: 0,
			errorTelemetry: 0,
			crashTelemetry: 0,
			missingInput: 0,
			suppressedEvents: [],
		});
	});

	for (const setting of ['feedback', 'telemetry'] as const) {
		test(`stops reporting when ${setting} is disabled after the survey opens`, async () => {
			const { service, events, carousels, configurationService, telemetryService } = createService();
			service.prompt(inputUri, context);
			if (setting === 'feedback') {
				await configurationService.setUserConfiguration('telemetry', { feedback: { enabled: false } });
			} else {
				telemetryService.telemetryLevel = TelemetryLevel.ERROR;
			}
			carousels[0].options.onDidDismiss?.(new Map<string, IChatQuestionAnswerValue>([['reason', { selectedValue: 'other' }]]));
			carousels[0].options.onSubmit(undefined);

			assert.deepStrictEqual(events, [
				{ eventName, data: { ...getExpectedEventData(carousels[0].carousel), kind: 'shown' } },
			]);
		});
	}

	test('prompts only once after the survey is shown', () => {
		const { service, carousels } = createService();
		service.prompt(inputUri, context);
		carousels[0].options.onSubmit(undefined);
		service.prompt(inputUri, context);

		assert.strictEqual(carousels.length, 1);
	});

	test('does not reprompt previously surveyed users after the service is recreated', () => {
		const storageService = store.add(new InMemoryStorageService());
		const first = createService({ storageService });
		first.service.prompt(inputUri, context);
		first.service.dispose();
		const second = createService({ storageService });
		second.service.prompt(inputUri, context);

		assert.deepStrictEqual({
			firstPrompts: first.carousels.length,
			secondPrompts: second.carousels.length,
			secondEvents: second.events,
		}, {
			firstPrompts: 1,
			secondPrompts: 0,
			secondEvents: [],
		});
	});
});
