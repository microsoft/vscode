/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { hasKey } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService, TelemetryLevel } from '../../../../../platform/telemetry/common/telemetry.js';
import { IChatWidgetService } from '../chat.js';
import type { ChatInputPart } from '../widget/input/chatInputPart.js';
import { IChatQuestion, IChatQuestionAnswerValue, IChatQuestionCarousel, IChatSingleSelectAnswer } from '../../common/chatService/chatService.js';
import { ChatConfiguration, CopilotHarnessIntroductionMode } from '../../common/constants.js';
import { CHAT_HARNESS_SWITCH_FEEDBACK_SURVEY_TELEMETRY_COMMAND_ID, ChatHarnessSwitchFeedbackSurveyEventKind, IChatHarnessSwitchFeedbackSurveyTelemetryEvent } from '../../common/feedbackSurvey/chatHarnessSwitchFeedbackSurveyTelemetry.js';

const FEEDBACK_ENABLED_CONFIG = 'telemetry.feedback.enabled';
const SURVEY_ID = 'copilot-local-switch-v1';
const PROMPTED_STORAGE_KEY = `chat.harnessSwitchFeedbackSurvey.${SURVEY_ID}.prompted`;
const STEP_COUNT = 2;
const MAX_COMMENT_LENGTH = 1000;

const REASON_IDS = new Set([
	'preferLocal',
	'missingFeature',
	'performance',
	'reliability',
	'other',
]);

export interface IChatHarnessSwitchFeedbackSurveyContext {
	readonly mode: CopilotHarnessIntroductionMode;
	readonly surface: 'sidebar' | 'editor';
	readonly chatSessionId: string | undefined;
	readonly sessionType: string | undefined;
	readonly harness: string | undefined;
}

interface IChatHarnessSwitchFeedbackSurveyState {
	readonly instanceId: string;
	readonly input: ChatInputPart;
	readonly carouselKey: string;
	readonly dimensions: IChatHarnessSwitchFeedbackSurveyContext;
	draftAnswers?: ReadonlyMap<string, IChatQuestionAnswerValue>;
	submitted: boolean;
	reportedReason?: string;
	reportedComment?: string;
}

export const IChatHarnessSwitchFeedbackSurveyService = createDecorator<IChatHarnessSwitchFeedbackSurveyService>('chatHarnessSwitchFeedbackSurveyService');

export interface IChatHarnessSwitchFeedbackSurveyService {
	readonly _serviceBrand: undefined;

	/** Offers the one-shot survey to the input that initiated a Copilot-to-Local switch. */
	prompt(inputUri: URI, context: IChatHarnessSwitchFeedbackSurveyContext): void;
}

export class ChatHarnessSwitchFeedbackSurveyService extends Disposable implements IChatHarnessSwitchFeedbackSurveyService {

	declare readonly _serviceBrand: undefined;

	private state: IChatHarnessSwitchFeedbackSurveyState | undefined;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IStorageService private readonly storageService: IStorageService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ICommandService private readonly commandService: ICommandService,
		@ILogService private readonly logService: ILogService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
	) {
		super();
		this._register(this.chatWidgetService.onDidRemoveWidget(widget => {
			if (this.state?.input === widget.inputPart || this.state?.input === widget.input) {
				this.state = undefined;
			}
		}));
	}

	prompt(inputUri: URI, context: IChatHarnessSwitchFeedbackSurveyContext): void {
		if (!this.configurationService.getValue<boolean>(ChatConfiguration.HarnessSwitchFeedbackSurveyEnabled)
			|| !this.isFeedbackUiEnabled()
			|| this.state
			|| this.storageService.getBoolean(PROMPTED_STORAGE_KEY, StorageScope.APPLICATION, false)) {
			return;
		}

		const widget = this.chatWidgetService.getWidgetByInputUri(inputUri);
		if (!widget) {
			return;
		}

		const instanceId = generateUuid();
		const carouselKey = `chat.harnessSwitchFeedbackSurvey.${instanceId}`;
		const state: IChatHarnessSwitchFeedbackSurveyState = {
			instanceId,
			input: widget.input,
			carouselKey,
			dimensions: context,
			submitted: false,
		};
		const carousel: IChatQuestionCarousel = {
			kind: 'questionCarousel',
			resolveId: carouselKey,
			allowSkip: true,
			questions: this.getQuestions(),
		};
		this.state = state;

		widget.input.renderQuestionCarousel(carousel, undefined, {
			shouldAutoFocus: true,
			dismissLabel: localize('chat.harnessSwitchFeedbackSurvey.dismiss', "Dismiss Survey"),
			submissionAcknowledgement: {
				message: localize('chat.harnessSwitchFeedbackSurvey.acknowledgement', "Thanks, your feedback has been recorded."),
				dismissLabel: localize('chat.harnessSwitchFeedbackSurvey.dismissAcknowledgement', "Dismiss Feedback Acknowledgement"),
				onDidDismiss: () => this.dismissAcknowledgement(instanceId),
			},
			onDidDismiss: answers => state.draftAnswers = new Map(answers),
			onSubmit: answers => {
				if (answers) {
					this.submit(instanceId, answers);
				} else {
					this.dismiss(instanceId);
				}
			},
		});

		this.storageService.store(PROMPTED_STORAGE_KEY, true, StorageScope.APPLICATION, StorageTarget.USER);
		this.report(state, 'shown');
	}

	private getQuestions(): IChatQuestion[] {
		return [{
			id: 'reason',
			type: 'singleSelect',
			title: localize('chat.harnessSwitchFeedbackSurvey.reason', "Why did you switch harnesses?"),
			options: [
				{ id: 'preferLocal', label: localize('chat.harnessSwitchFeedbackSurvey.reason.preferLocal', "I prefer the Local experience"), value: 'preferLocal' },
				{ id: 'missingFeature', label: localize('chat.harnessSwitchFeedbackSurvey.reason.missingFeature', "A feature I need was unavailable"), value: 'missingFeature' },
				{ id: 'performance', label: localize('chat.harnessSwitchFeedbackSurvey.reason.performance', "Copilot was too slow"), value: 'performance' },
				{ id: 'reliability', label: localize('chat.harnessSwitchFeedbackSurvey.reason.reliability', "Copilot did not work as expected"), value: 'reliability' },
				{ id: 'other', label: localize('chat.harnessSwitchFeedbackSurvey.reason.other', "Something else"), value: 'other' },
			],
			allowFreeformInput: false,
			required: true,
		}, {
			id: 'feedback',
			type: 'text',
			title: localize('chat.harnessSwitchFeedbackSurvey.feedback', "Any feedback?"),
			description: localize('chat.harnessSwitchFeedbackSurvey.feedbackDescription', "Share any additional feedback (optional)."),
			required: false,
			validation: { maxLength: MAX_COMMENT_LENGTH },
		}];
	}

	private submit(instanceId: string, answers: ReadonlyMap<string, IChatQuestionAnswerValue>): void {
		const state = this.getState(instanceId);
		if (!state) {
			return;
		}

		this.reportAnswers(state, answers);
		this.report(state, 'submitted');
		state.submitted = true;
	}

	private dismiss(instanceId: string): void {
		const state = this.getState(instanceId);
		if (!state || state.submitted) {
			return;
		}

		if (state.draftAnswers) {
			this.reportAnswers(state, state.draftAnswers);
		}
		this.report(state, 'dismissed');
		this.finish(state);
	}

	private dismissAcknowledgement(instanceId: string): void {
		const state = this.getState(instanceId);
		if (state?.submitted) {
			this.finish(state);
		}
	}

	private reportAnswers(state: IChatHarnessSwitchFeedbackSurveyState, answers: ReadonlyMap<string, IChatQuestionAnswerValue>): void {
		const reason = answers.get('reason');
		const reasonAnswer = typeof reason === 'object' && reason !== null && hasKey(reason, { selectedValue: true }) ? reason as IChatSingleSelectAnswer : undefined;
		const answerId = reasonAnswer?.selectedValue;
		if (answerId && REASON_IDS.has(answerId) && answerId !== state.reportedReason) {
			state.reportedReason = answerId;
			this.report(state, 'step', { stepId: 'reason', stepIndex: 0, answerId });
		}

		const feedback = answers.get('feedback');
		if (typeof feedback === 'string') {
			this.reportCommentOnce(state, feedback);
		}
	}

	private reportCommentOnce(state: IChatHarnessSwitchFeedbackSurveyState, comment: string): void {
		const trimmed = comment.trim();
		if (!trimmed || trimmed === state.reportedComment) {
			return;
		}

		const clamped = trimmed.slice(0, MAX_COMMENT_LENGTH);
		state.reportedComment = clamped;
		this.report(state, 'step', { stepId: 'feedback', stepIndex: 1, comment: clamped });
	}

	private finish(state: IChatHarnessSwitchFeedbackSurveyState): void {
		this.state = undefined;
		queueMicrotask(() => {
			state.input.clearQuestionCarousel(undefined, state.carouselKey);
			state.input.focus();
		});
	}

	private getState(instanceId: string): IChatHarnessSwitchFeedbackSurveyState | undefined {
		return this.state?.instanceId === instanceId ? this.state : undefined;
	}

	private isFeedbackUiEnabled(): boolean {
		return this.configurationService.getValue<boolean>(FEEDBACK_ENABLED_CONFIG) !== false
			&& this.telemetryService.telemetryLevel !== TelemetryLevel.NONE;
	}

	private report(
		state: IChatHarnessSwitchFeedbackSurveyState,
		kind: ChatHarnessSwitchFeedbackSurveyEventKind,
		details: Pick<IChatHarnessSwitchFeedbackSurveyTelemetryEvent, 'stepId' | 'stepIndex' | 'answerId' | 'comment'> = {},
	): void {
		if (!this.isFeedbackUiEnabled()) {
			return;
		}

		const event: IChatHarnessSwitchFeedbackSurveyTelemetryEvent = {
			kind,
			surveyId: SURVEY_ID,
			surveyInstanceId: state.instanceId,
			stepCount: STEP_COUNT,
			...details,
			...state.dimensions,
			fromHarness: 'copilot',
			toHarness: 'local',
		};
		this.commandService.executeCommand(CHAT_HARNESS_SWITCH_FEEDBACK_SURVEY_TELEMETRY_COMMAND_ID, event)
			.catch(error => this.logService.trace(`[chatHarnessSwitchFeedbackSurvey] failed to report '${kind}': ${error}`));
	}
}
