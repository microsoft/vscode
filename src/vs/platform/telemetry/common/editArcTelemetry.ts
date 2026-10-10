/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const EDIT_TELEMETRY_SETTING_ID = 'telemetry.editStats.enabled';

export interface IEditArcTelemetryEvent {
	sourceKeyCleaned: string;
	extensionId: string | undefined;
	extensionVersion: string | undefined;
	opportunityId: string | undefined;
	editSessionId: string | undefined;
	requestId: string | undefined;
	modelId: string | undefined;
	languageId: string | undefined;
	mode: string | undefined;
	uniqueEditId: string | undefined;
	provider: string | undefined;
	agentSessionId: string | undefined;
	isSubagentSession: string | undefined;

	didBranchChange: number;
	timeDelayMs: number;
	originalCharCount: number;
	originalLineCount: number;
	originalDeletedLineCount: number;
	arc: number;
	currentLineCount: number;
	currentDeletedLineCount: number;
}

export type IEditArcTelemetryClassification = {
	owner: 'hediet';
	comment: 'Reports the accepted and retained character count for an inline completion/edit. @sentToGitHub';

	sourceKeyCleaned: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The key of the edit source.' };
	extensionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The extension id (copilot or copilot-chat); which provided this inline completion.' };
	extensionVersion: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The version of the extension.' };
	opportunityId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Unique identifier for an opportunity to show an inline completion or NES.' };
	editSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The session id.' };
	requestId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The request id.' };
	modelId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The model id.' };
	languageId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The language id of the document.' };
	mode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The mode chat was in.' };
	uniqueEditId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The unique identifier for the edit.' };
	provider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The Agent Host provider that produced the edit.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The Agent Host session identifier.' };
	isSubagentSession: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the edit was produced in an Agent Host subagent session.' };

	didBranchChange: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Indicates if the branch changed in the meantime. If the branch changed (value is 1); this event should probably be ignored.' };
	timeDelayMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The time delay between the user accepting the edit and measuring the survival rate.' };
	originalCharCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The original character count before any edits.' };
	originalLineCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The original line count before any edits.' };
	originalDeletedLineCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The original deleted line count before any edits.' };
	arc: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The accepted and restrained character count.' };
	currentLineCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The current line count after edits.' };
	currentDeletedLineCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The current deleted line count after edits.' };
};
