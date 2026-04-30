/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export { CopilotChatAttr, CopilotCliSdkAttr, GenAiAttr, GenAiOperationName, GenAiProviderName, GenAiTokenType, GenAiToolType, StdAttr } from './genAiAttributes';
export { emitAgentTurnEvent, emitCloudSessionInvokeEvent, emitEditFeedbackEvent, emitEditHunkActionEvent, emitEditSurvivalEvent, emitInferenceDetailsEvent, emitInlineDoneEvent, emitSessionStartEvent, emitToolCallEvent, emitUserFeedbackEvent } from './genAiEvents';
export { GenAiMetrics } from './genAiMetrics';
export { normalizeProviderMessages, toInputMessages, toOutputMessages, toSystemInstructions, toToolDefinitions, truncateForOTel } from './messageFormatters';
export { NoopOTelService } from './noopOtelService';
export { resolveOTelConfig, DEFAULT_OTLP_ENDPOINT, type OTelConfig, type OTelConfigInput } from './otelConfig';
export { IOTelService, SpanKind, SpanStatusCode, type ICompletedSpanData, type ISpanEventData, type ISpanEventRecord, type ISpanHandle, type OTelModelOptions, type SpanOptions, type TraceContext } from './otelService';
export { resolveWorkspaceOTelMetadata, workspaceMetadataToOTelAttributes, type WorkspaceOTelMetadata } from './workspaceOTelMetadata';

