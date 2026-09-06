/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITelemetryService } from './telemetry.js';

export type EditTelemetryMode = 'longterm' | '10minFocusWindow' | '20minFocusWindow';
export type EditTelemetryTrigger = '10hours' | 'hashChange' | 'branchChange' | 'closed' | 'time';

export interface IEditSourcesDetailsTelemetryData {
	mode: EditTelemetryMode;
	sourceKey: string;
	sourceKeyCleaned: string;
	extensionId: string | undefined;
	extensionVersion: string | undefined;
	modelId: string | undefined;
	trigger: EditTelemetryTrigger;
	languageId: string | undefined;
	statsUuid: string;
	conversationId: string | undefined;
	requestId: string | undefined;
	origin: string | undefined;
	harness: string | undefined;
	modifiedCount: number;
	deltaModifiedCount: number;
	totalModifiedCount: number;
}

type EditSourcesDetailsTelemetryClassification = {
	owner: 'hediet';
	comment: 'Provides detailed character count breakdown for individual edit sources (typing, paste, inline completions, NES, etc.) within a session. Reports the top 10-30 sources per session with granular metadata including extension IDs and model IDs for AI edits. Sessions are scoped to either 10-minute or 20-minute focus time windows for visible documents, or longer periods ending on branch changes, commits, or 10-hour intervals. Focus time is computed as the accumulated time where VS Code has focus and there was recent user activity (within the last minute). This event complements editSources.stats by providing source-specific details. @sentToGitHub';
	mode: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Describes the session mode. Is either longterm, 10minFocusWindow, or 20minFocusWindow.' };
	sourceKey: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'A description of the source of the edit.' };
	sourceKeyCleaned: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The source of the edit with some properties (such as extensionId, extensionVersion and modelId) removed.' };
	extensionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The extension id.' };
	extensionVersion: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The version of the extension.' };
	modelId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The LLM id.' };
	languageId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The language id of the document.' };
	statsUuid: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The unique identifier of the session for which stats are reported. The sourceKey is unique in this session.' };
	conversationId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The chat conversation identifier when the edit source comes from chat. Sourced from the chat edit session id.' };
	requestId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The chat request identifier when the edit source comes from chat.' };
	origin: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The process or subsystem that observed the edit source.' };
	harness: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The Agent Host provider that produced the edit.' };
	trigger: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Indicates why the session ended.' };
	modifiedCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The number of characters inserted by the given edit source during the session that are still in the text document at the end of the session.'; isMeasurement: true };
	deltaModifiedCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The number of characters inserted by the given edit source during the session.'; isMeasurement: true };
	totalModifiedCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The number of characters inserted by any edit source during the session that are still in the text document at the end of the session.'; isMeasurement: true };
};

export function sendEditSourcesDetailsTelemetry(telemetryService: ITelemetryService, data: IEditSourcesDetailsTelemetryData): void {
	telemetryService.publicLog2<IEditSourcesDetailsTelemetryData, EditSourcesDetailsTelemetryClassification>('editTelemetry.editSources.details', data);
}

export interface IEditSourcesStatsTelemetryData {
	attributionSchemaVersion: 2;
	mode: EditTelemetryMode;
	languageId?: string;
	statsUuid: string;
	nesModifiedCount: number;
	inlineCompletionsCopilotModifiedCount: number;
	inlineCompletionsNESModifiedCount: number;
	otherAIModifiedCount: number;
	agentHostModifiedCount: number;
	unknownModifiedCount: number;
	userModifiedCount: number;
	ideModifiedCount: number;
	totalModifiedCharacters: number;
	externalModifiedCount: number;
	isTrackedByGit?: number;
	focusTime?: number;
	actualTime?: number;
	trigger: EditTelemetryTrigger;
	trackingScope?: 'agentHostStandalone';
	agentHostAttributionCoverage?: 'complete' | 'partial';
	agentHostUntrackedEditCount?: number;
	agentHostUntrackedInsertedCount?: number;
}

type EditSourcesStatsTelemetryClassification = {
	owner: 'hediet';
	comment: 'Aggregates character counts by edit source category (user typing, AI completions, NES, IDE actions, external changes) for each editing session. Sessions represent units of work and end when documents close, branches change, commits occur, or time limits are reached (10 or 20 minutes of focus time for visible documents, or 10 hours otherwise). Focus time is computed as accumulated 1-minute blocks where VS Code has focus and there was recent user activity. Tracks both total characters inserted and characters remaining at session end to measure retention. This high-level summary complements editSources.details which provides granular per-source breakdowns. @sentToGitHub';

	attributionSchemaVersion: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Version 2 identifies rows where Agent Host edits are a mutually exclusive category and standalone Agent Host rows may be included.' };
	mode: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'longterm, 10minFocusWindow, or 20minFocusWindow' };
	languageId?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The language id of the document.' };
	statsUuid: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The unique identifier for the telemetry event.' };

	nesModifiedCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Fraction of nes modified characters'; isMeasurement: true };
	inlineCompletionsCopilotModifiedCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Fraction of inline completions copilot modified characters'; isMeasurement: true };
	inlineCompletionsNESModifiedCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Fraction of inline completions nes modified characters'; isMeasurement: true };
	otherAIModifiedCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Fraction of other AI modified characters, excluding Agent Host edits'; isMeasurement: true };
	agentHostModifiedCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Number of retained characters attributed to Agent Host edits.'; isMeasurement: true };
	unknownModifiedCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Fraction of unknown modified characters'; isMeasurement: true };
	userModifiedCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Fraction of user modified characters'; isMeasurement: true };
	ideModifiedCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Fraction of IDE modified characters'; isMeasurement: true };
	totalModifiedCharacters: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Total modified characters'; isMeasurement: true };
	externalModifiedCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Fraction of external modified characters'; isMeasurement: true };
	isTrackedByGit?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Indicates if the document is tracked by git.' };
	focusTime?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The focus time in ms during the session.'; isMeasurement: true };
	actualTime?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The actual time in ms during the session.'; isMeasurement: true };
	trigger: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Indicates why the session ended.' };
	trackingScope?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Identifies stats emitted for files tracked only by the Agent Host.' };
	agentHostAttributionCoverage?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether long-term Agent Host edit attribution was complete or an oversized edit prevented retained-character attribution.' };
	agentHostUntrackedEditCount?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Number of Agent Host edits excluded from detailed retained-character attribution after an oversized edit.'; isMeasurement: true };
	agentHostUntrackedInsertedCount?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Characters inserted by Agent Host edits excluded from retained-character attribution after an oversized edit.'; isMeasurement: true };
};

export function sendEditSourcesStatsTelemetry(telemetryService: ITelemetryService, data: IEditSourcesStatsTelemetryData): void {
	telemetryService.publicLog2<IEditSourcesStatsTelemetryData, EditSourcesStatsTelemetryClassification>('editTelemetry.editSources.stats', data);
}
