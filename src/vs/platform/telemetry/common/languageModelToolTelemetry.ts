/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type LanguageModelToolTelemetryData = {
	chatSessionId: string | undefined;
	toolId: string;
	toolExtensionId: string | undefined;
	toolSourceKind: string;
};

export type LanguageModelToolTelemetryClassification = {
	chatSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The ID of the chat session that the tool was used within, if applicable.' };
	toolId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The ID of the tool used.' };
	toolExtensionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The extension that contributed the tool.' };
	toolSourceKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The source kind of the tool.' };
};

export type LanguageModelToolInvokedEvent = LanguageModelToolTelemetryData & {
	result: 'success' | 'error' | 'userCancelled';
	prepareTimeMs?: number;
	invocationTimeMs?: number;
};

export type LanguageModelToolInvokedClassification = LanguageModelToolTelemetryClassification & {
	result: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether invoking the LanguageModelTool resulted in an error.' };
	prepareTimeMs?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Time spent in prepareToolInvocation method in milliseconds.' };
	invocationTimeMs?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Time spent in tool invoke method in milliseconds.' };
	owner: 'roblourens';
	comment: 'Provides insight into the usage of language model tools.';
};
