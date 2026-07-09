/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export { CopilotChatAttr, CopilotCliSdkAttr, FILE_TOOL_NAMES, GenAiAttr, GenAiOperationName, GenAiProviderName, GenAiTokenType, GenAiToolType, GitHubCopilotAttr, SHELL_TOOL_NAMES, StdAttr, TOOL_PARAM_COMMAND_MAX_LEN } from './genAiAttributes';
export type { AgentType, EditOperationType, HookDecision } from './genAiAttributes';
export { emitAgentTurnEvent, emitCloudSessionInvokeEvent, emitEditFeedbackEvent, emitEditHunkActionEvent, emitEditSurvivalEvent, emitInferenceDetailsEvent, emitInlineDoneEvent, emitSessionStartEvent, emitToolCallEvent, emitUserFeedbackEvent } from './genAiEvents';
export { GenAiMetrics } from './genAiMetrics';
export { collectSystemTextsFromRequestBody, extractTextFromContent, normalizeProviderMessages, stringifyToolDefinitionsForOTel, stringifyToolsRawForTelemetry, toInputMessages, toOutputMessages, toSystemInstructions, toToolDefinitions, truncateForOTel } from './messageFormatters';
export { NoopOTelService } from './noopOtelService';
export { resolveOTelConfig, DEFAULT_OTLP_ENDPOINT, type OTelConfig, type OTelConfigInput } from './otelConfig';
export { IOTelService, SpanKind, SpanStatusCode, type ICompletedSpanData, type ISpanEventData, type ISpanEventRecord, type ISpanHandle, type OTelModelOptions, type SpanOptions, type TraceContext } from './otelService';
export { normalizeResponseModel } from './responseModel';
export { resolveWorkspaceOTelMetadata, workspaceMetadataToOTelAttributes, type WorkspaceOTelMetadata } from './workspaceOTelMetadata';

