/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Wire contract between the workbench and the Copilot extension for survey telemetry.
 *
 * Answers must reach GitHub restricted telemetry, which only the Copilot extension can send to.
 * A command is used rather than a data channel because `executeCommand` activates the extension,
 * so results produced before activation are not dropped. Command ids are first come first
 * served, so this routes the payload rather than securing it. Keep the shape in sync with
 * `chatModelFeedbackSurveyForwardingContrib.ts` in the extension.
 */
export const CHAT_MODEL_FEEDBACK_SURVEY_TELEMETRY_COMMAND_ID = '_github.copilot.chat.reportModelFeedbackSurvey';

export type ChatModelFeedbackSurveyEventKind =
	/** The pill became available on a response. */
	| 'shown'
	/** The user opened the survey panel. */
	| 'opened'
	/** A step was answered. Sent as it happens so abandoned surveys still report. */
	| 'step'
	/** The user submitted on the final step. */
	| 'submitted'
	/** The user dismissed the survey without submitting. */
	| 'dismissed';

export interface IChatModelFeedbackSurveyTelemetryEvent {
	readonly kind: ChatModelFeedbackSurveyEventKind;
	readonly surveyId: string;
	/** Stitches the events for one survey together. Minted when the survey first applies. */
	readonly surveyInstanceId: string;
	readonly stepCount: number;
	/** What opened the survey, so asked for and unprompted surveys can be measured apart. */
	readonly trigger?: 'manual' | 'chance' | 'modelSwitchedAway';
	readonly stepId?: string;
	readonly stepIndex?: number;
	/** The chosen option id for a `choice` step. Always one of the configured option ids. */
	readonly answerId?: string;
	/** Free text from a text step. Must only reach GitHub restricted telemetry, never `publicLog2`. */
	readonly comment?: string;
	readonly modelId?: string;
	readonly resolvedModelId?: string;
	readonly modeId?: string;
	readonly harness?: string;
	readonly sessionType?: string;
	readonly requestId: string;
}
