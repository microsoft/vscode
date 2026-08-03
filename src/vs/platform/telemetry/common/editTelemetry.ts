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
