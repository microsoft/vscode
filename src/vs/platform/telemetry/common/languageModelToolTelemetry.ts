/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { TelemetryTrustedValue } from './telemetryUtils.js';

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

export type LanguageModelToolApprovalClassification = LanguageModelToolTelemetryClassification & {
	confirmKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How the confirmation was resolved (userAction, setting, lmServicePerTool, confirmationNotNeeded, denied, skipped). Anything other than userAction implies auto-approval. "denied" and "skipped" mean the tool did not run; otherwise it ran (note: a custom Deny button click resolves as userAction since the tool still runs and the chosen label is passed to it; see customButtonKind to distinguish).' };
	requestId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The ID of the chat request turn that this tool approval is associated with, if available.' };
	settingId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'When confirmKind is setting, the configuration id that auto-approved the tool.' };
	lmServiceScope: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'When confirmKind is lmServicePerTool, the scope (session/workspace/profile).' };
	customButtonKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'When the user clicked a custom button on the confirmation widget, whether the button represents approve or deny semantics. Undefined when no custom button was clicked.' };
	confirmationNotNeededReason: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'When confirmKind is confirmationNotNeeded, a stable identifier for why the tool did not require confirmation. Limited to a known allowlist (e.g. auto-approve-all, inlineChat); set to "other" for any other reason; undefined when no reason was supplied.' };
	sandboxWrapped: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'For terminal tool calls, whether this specific invocation runs inside the agent terminal sandbox. Undefined for non-terminal tools.' };
	requestUnsandboxedExecution: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'For terminal tool calls, whether the model requested to bypass the sandbox for this invocation. Undefined for non-terminal tools.' };
	owner: 'chrmarti';
	comment: 'Provides insight into how tool confirmations are resolved (user action vs. auto-approval).';
};

export type LanguageModelToolInvokedEvent = LanguageModelToolTelemetryData & {
	result: 'success' | 'error' | 'userCancelled';
	prepareTimeMs?: number;
	invocationTimeMs?: number;
	provider?: string;
	resultSizeInCharacters?: number;
	turnId?: string;
	model?: string | TelemetryTrustedValue<string>;
	toolCallId?: string;
};

export type LanguageModelToolInvokedClassification = LanguageModelToolTelemetryClassification & {
	result: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether invoking the LanguageModelTool resulted in an error.' };
	prepareTimeMs?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Time spent in prepareToolInvocation method in milliseconds.' };
	invocationTimeMs?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Time spent in tool invoke method in milliseconds.' };
	provider?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The agent host provider that invoked the tool (e.g. copilotcli, claude, codex), if applicable.' };
	resultSizeInCharacters?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Length of the serialized Agent Host tool result in UTF-16 code units, if applicable.' };
	turnId?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The identifier of the Agent Host turn containing the tool invocation, if applicable.' };
	model?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The trusted provider model identifier that produced the tool call, or a generic value for BYOK and unknown models, if applicable.' };
	toolCallId?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The agent host tool call identifier, if applicable.' };
	owner: 'roblourens';
	comment: 'Provides insight into the usage of language model tools.';
};
