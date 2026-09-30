/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Wire contract between the workbench and the Copilot extension for harness switch survey telemetry.
 *
 * Free-text answers must reach GitHub restricted telemetry, which only the Copilot extension can
 * send to. Keep the shape in sync with `chatHarnessSwitchFeedbackSurveyForwardingContrib.ts`.
 */
export const CHAT_HARNESS_SWITCH_FEEDBACK_SURVEY_TELEMETRY_COMMAND_ID = '_github.copilot.chat.reportHarnessSwitchFeedbackSurvey';

export type ChatHarnessSwitchFeedbackSurveyEventKind =
	| 'shown'
	| 'step'
	| 'submitted'
	| 'dismissed';

export interface IChatHarnessSwitchFeedbackSurveyTelemetryEvent {
	readonly kind: ChatHarnessSwitchFeedbackSurveyEventKind;
	readonly surveyId: string;
	readonly surveyInstanceId: string;
	readonly stepCount: number;
	readonly stepId?: string;
	readonly stepIndex?: number;
	readonly answerId?: string;
	/** Free text. Must only reach GitHub restricted telemetry, never `publicLog2`. */
	readonly comment?: string;
	readonly mode: string;
	readonly fromHarness: 'copilot';
	readonly toHarness: 'local';
	readonly surface: 'sidebar' | 'editor';
	readonly chatSessionId?: string;
	readonly sessionType?: string;
	readonly harness?: string;
}
