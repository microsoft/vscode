/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { LanguageModelToolInvokedClassification, LanguageModelToolInvokedEvent } from '../../telemetry/common/languageModelToolTelemetry.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { TelemetryTrustedValue } from '../../telemetry/common/telemetryUtils.js';
import { hash } from '../../../base/common/hash.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { AgentSession, type AgentTurnProviderCallState, type AgentTurnProviderSessionState, type IAgentTurnDiagnosticSnapshot } from '../common/agent.js';
import type { SessionMode } from '../common/agentHostSchema.js';
import { getTelemetryChatSessionId } from '../common/agentTelemetryCorrelation.js';
import { readAgentErrorTelemetryMeta } from '../common/meta/agentErrorMeta.js';
import type { ErrorInfo, Message, MessageKind, SessionInputRequestKind, ToolDefinition } from '../common/state/protocol/state.js';
import { ActionType } from '../common/state/sessionActions.js';
import { isAhpChatChannel, isSubagentChatUri, isSubagentSession, parseRequiredSessionUriFromChatUri, type ISessionWithDefaultChat } from '../common/state/sessionState.js';
import type { ToolInvokedResult } from './agentHostToolCallTracker.js';
import { multiplexProperties, type IAgentHostRestrictedTelemetry, type IAgentHostRestrictedTelemetryContext } from './agentHostRestrictedTelemetry.js';
import { AgentHostClientType } from '../common/agentHostClientInfo.js';
import { AgentHostClientConnectionKind, AgentHostLaunchKind, AgentHostTransportKind, type IAgentHostClientTelemetryContext } from '../common/agentHostTelemetry.js';

export type AgentHostUserMessageSentSource = 'direct' | 'queued';

export interface IAgentHostInitiatorTelemetry {
	initiatorClientType?: AgentHostClientType;
	initiatorConnectionKind?: AgentHostClientConnectionKind;
	initiatorTransportKind?: AgentHostTransportKind;
	hostLaunchKind?: AgentHostLaunchKind;
	initiatorMachineId?: string;
	initiatorDevDeviceId?: string;
}

export type IAgentHostInitiatorClassification = {
	initiatorClientType?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The type of VS Code client that initiated the event.' };
	initiatorConnectionKind?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The route the initiating client used to reach the agent host.' };
	initiatorTransportKind?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The physical transport on which the agent host received the initiating client action.' };
	hostLaunchKind?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the agent host process was launched by the VS Code main process or VS Code CLI.' };
	initiatorMachineId?: { classification: 'EndUserPseudonymizedInformation'; purpose: 'FeatureInsight'; endpoint: 'MacAddressHash'; comment: 'The machine identifier of the VS Code client that initiated the event.' };
	initiatorDevDeviceId?: { classification: 'EndUserPseudonymizedInformation'; purpose: 'BusinessInsight'; endpoint: 'SqmMachineId'; comment: 'The development device identifier of the VS Code client that initiated the event.' };
};

export interface IAgentHostExecutionModeChangedEvent extends IAgentHostInitiatorTelemetry {
	provider: string;
	agentSessionId: string;
	isSubagentSession: boolean;
	previousMode: SessionMode;
	newMode: SessionMode;
	turnCount: number;
}

export type IAgentHostExecutionModeChangedClassification = IAgentHostInitiatorClassification & {
	provider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The provider handling the agent host session.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The agent host session identifier.' };
	isSubagentSession: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the mode change belongs to a subagent session.' };
	previousMode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The previous agent host execution mode.' };
	newMode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The new agent host execution mode.' };
	turnCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of completed turns in the agent host chat.' };
	owner: 'amunger';
	comment: 'Reports agent host execution mode changes.';
};

export interface IAgentHostUserMessageSentEvent {
	provider: string;
	hostLaunchKind: AgentHostLaunchKind;
	initiatorClientId: string | undefined;
	initiatorClientType: AgentHostClientType;
	initiatorConnectionKind: AgentHostClientConnectionKind;
	initiatorTransportKind: AgentHostTransportKind;
	initiatorMachineId?: string;
	initiatorDevDeviceId?: string;
	agentSessionId: string;
	source: AgentHostUserMessageSentSource;
	messageOriginKind: MessageKind;
	isSubagentSession: boolean;
	turnCount: number;
	activeClientId?: string;
	activeClientToolCount?: number;
	activeClientCustomizationCount?: number;
	attachmentCount: number;
}

export type IAgentHostUserMessageSentClassification = {
	provider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The provider handling the agent host session.' };
	hostLaunchKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the agent host process was launched by the VS Code main process or VS Code CLI.' };
	initiatorClientId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The opaque AHP client identifier that initiated the message.' };
	initiatorClientType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The type of AHP client that initiated the message.' };
	initiatorConnectionKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The route the initiating client declared it used to reach the agent host.' };
	initiatorTransportKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The physical transport on which the agent host received the initiating client action.' };
	initiatorMachineId?: { classification: 'EndUserPseudonymizedInformation'; purpose: 'FeatureInsight'; endpoint: 'MacAddressHash'; comment: 'The initiating VS Code client machine identifier.' };
	initiatorDevDeviceId?: { classification: 'EndUserPseudonymizedInformation'; purpose: 'BusinessInsight'; endpoint: 'SqmMachineId'; comment: 'The initiating VS Code client development device identifier.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The agent host session identifier.' };
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the message was sent directly or from the queued-message flow.' };
	messageOriginKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The kind of actor that produced the message: a user, an agent (session orchestration tools such as create_session/create_chat/send_message), a tool, an automation, or a system notification.' };
	isSubagentSession: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the message was sent to a subagent session.' };
	turnCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of completed turns in the session when the message was sent.' };
	activeClientId?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The identifier of the first active client for the session, if any.' };
	activeClientToolCount?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The total number of tools provided by the active clients, if any.' };
	activeClientCustomizationCount?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The total number of customizations provided by the active clients, if any.' };
	attachmentCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of attachments included with the message.' };
	owner: 'roblourens';
	comment: 'Tracks messages sent from the agent host process to an agent provider, including which kind of actor produced them.';
};

export type AgentHostClientConnectionAction = 'connected' | 'disconnected';

export interface IAgentHostClientConnectionEvent {
	action: AgentHostClientConnectionAction;
	hostLaunchKind: AgentHostLaunchKind;
	clientId: string;
	clientType: AgentHostClientType;
	clientImplementationName: string | undefined;
	clientImplementationVersion: string | undefined;
	connectionKind: AgentHostClientConnectionKind;
	transportKind: AgentHostTransportKind;
	clientMachineId?: string;
	clientDevDeviceId?: string;
	protocolVersion: string;
	isReconnect: boolean;
	connectedClientCount: number;
	connectedTransportCount: number;
	clientTransportCount: number;
	connectionDurationMs: number | undefined;
	subscriptionCount: number | undefined;
}

export type IAgentHostClientConnectionClassification = {
	action: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether an initialized AHP client transport connected or disconnected.' };
	hostLaunchKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the agent host process was launched by the VS Code main process or VS Code CLI.' };
	clientId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The opaque AHP client identifier.' };
	clientType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The bounded type of the connected AHP client.' };
	clientImplementationName: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The implementation name declared by the AHP client.' };
	clientImplementationVersion: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The implementation version declared by the AHP client.' };
	connectionKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The route the client declared it used to reach the agent host.' };
	transportKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The physical transport accepted by the agent host.' };
	clientMachineId?: { classification: 'EndUserPseudonymizedInformation'; purpose: 'FeatureInsight'; endpoint: 'MacAddressHash'; comment: 'The connected VS Code client machine identifier.' };
	clientDevDeviceId?: { classification: 'EndUserPseudonymizedInformation'; purpose: 'BusinessInsight'; endpoint: 'SqmMachineId'; comment: 'The connected VS Code client development device identifier.' };
	protocolVersion: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The negotiated AHP protocol version.' };
	isReconnect: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether this client identifier was previously known to the agent host.' };
	connectedClientCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of logical AHP clients with at least one live transport after this lifecycle change.' };
	connectedTransportCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The total number of live initialized AHP transports after this lifecycle change.' };
	clientTransportCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of live initialized transports for this client after this lifecycle change.' };
	connectionDurationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'The duration of the disconnected transport in milliseconds.' };
	subscriptionCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of protocol subscriptions held by the client transport when it disconnected.' };
	owner: 'roblourens';
	comment: 'Tracks initialized Agent Host client connection topology and lifecycle.';
};

export interface IAgentHostClientConnectionReport {
	action: AgentHostClientConnectionAction;
	context: IAgentHostClientTelemetryContext;
	clientId: string;
	clientImplementationName: string | undefined;
	clientImplementationVersion: string | undefined;
	protocolVersion: string;
	isReconnect: boolean;
	connectedClientCount: number;
	connectedTransportCount: number;
	clientTransportCount: number;
	connectionDurationMs?: number;
	subscriptionCount?: number;
}

export type AgentHostTurnResult = 'success' | 'error' | 'cancelled';
export type AgentHostModelTelemetryKind = 'trusted' | 'byok' | 'unknown';
type AgentHostModelSelectionKind = 'default' | 'auto' | 'explicit';
export type AgentHostTurnFailureStage = 'validation' | 'workingDirectory' | 'modelSelection' | 'sendMessage' | 'provider';
export type AgentHostInitiatorClientConnectionState = 'connected' | 'disconnected' | 'unknown';
export type AgentHostProviderDiagnosticState = 'available' | 'error' | 'missingChat' | 'missingTurn' | 'unavailable' | 'unsupported';

interface IAgentHostTurnAttributedReport {
	clientContext?: IAgentHostClientTelemetryContext;
}

export interface IAgentHostTurnCompletedEvent extends IAgentHostInitiatorTelemetry {
	provider: string;
	agentSessionId: string;
	chatSessionId: string;
	isSubagentSession: boolean;
	turnId: string;
	parentTurnId: string | undefined;
	parentToolCallId: string | undefined;
	timeToFirstProgress: number | undefined;
	totalTime: number;
	result: AgentHostTurnResult;
	model: string | TelemetryTrustedValue<string> | undefined;
	modelSelectionKind: AgentHostModelSelectionKind;
	isBYOK: boolean | undefined;
	permissionLevel: string | undefined;
	interactionMode: SessionMode | undefined;
	errorType: string | undefined;
	failureStage: AgentHostTurnFailureStage | undefined;
	isMultiRoot: boolean;
	folderCount: number;
	billedNanoAiu: number | undefined;
	directPromptTokenCount: number | undefined;
	directPromptCacheTokenCount: number | undefined;
	directCompletionTokenCount: number | undefined;
	directBilledNanoAiu: number | undefined;
	modelCallCount: number;
}

export type IAgentHostTurnCompletedClassification = IAgentHostInitiatorClassification & {
	provider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The provider handling the agent host session.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The agent host session identifier.' };
	chatSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The chat identifier within the agent host session.' };
	isSubagentSession: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the turn belongs to a subagent session.' };
	turnId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The identifier of the turn within the agent host session.' };
	parentTurnId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The immediate parent turn identifier for a subagent turn.' };
	parentToolCallId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The identifier of the tool call that spawned the subagent owning this turn; stable across resumed turns of the same subagent.' };
	timeToFirstProgress: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time in milliseconds from turn start to the first visible progress (text delta, response part, tool call start, or reasoning).' };
	totalTime: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Total time in milliseconds from turn start to turn completion.' };
	result: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the turn completed successfully, with an error, or was cancelled.' };
	model: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The trusted provider model identifier selected at turn start, or a generic value for BYOK and unknown models.' };
	modelSelectionKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the client used the provider default, Auto, or an explicit model.' };
	isBYOK: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the selected model is a bring-your-own-key model, when model context is available.' };
	permissionLevel: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The tool auto-approval level configured for the session at turn start (e.g. default, autoApprove, autopilot).' };
	interactionMode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The agent host interaction mode configured at turn start.' };
	errorType: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The structured agent host or provider error type when the turn fails.' };
	failureStage: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The bounded stage at which the agent host turn failed.' };
	isMultiRoot: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the session spans more than one working directory.' };
	folderCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of effective working directories for the session at turn completion.' };
	billedNanoAiu: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The AI credit usage billed for the turn in nano-AIU, when reported by the provider.' };
	directPromptTokenCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Input tokens used directly by this turn, excluding descendant sub-agent calls.' };
	directPromptCacheTokenCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Input tokens read from cache directly by this turn, excluding descendant sub-agent calls.' };
	directCompletionTokenCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Output tokens generated directly by this turn, excluding descendant sub-agent calls.' };
	directBilledNanoAiu: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'AI credit usage billed directly to this turn in nano-AIU, excluding descendant sub-agent calls.' };
	modelCallCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of completed upstream model responses attributed directly to this turn, excluding descendant sub-agent calls.' };
	owner: 'roblourens';
	comment: 'Tracks agent host turn completion, including performance, configuration context, completed model responses, and billed AI credit usage when reported by the provider.';
};

export interface IAgentHostTurnFailedEvent extends IAgentHostInitiatorTelemetry {
	provider: string;
	agentSessionId: string;
	chatSessionId: string;
	isSubagentSession: boolean;
	turnId: string;
	failureStage: AgentHostTurnFailureStage;
	errorType: string;
	errorName: string | undefined;
	errorCode: string | undefined;
	providerCallId: string | undefined;
	serviceRequestId: string | undefined;
	msg: string;
	callstack: string | undefined;
}

export type IAgentHostTurnFailedClassification = IAgentHostInitiatorClassification & {
	provider: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The provider handling the failed agent host turn.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The agent host session identifier.' };
	chatSessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The chat identifier within the agent host session.' };
	isSubagentSession: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the failed turn belongs to a subagent session.' };
	turnId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The identifier of the failed turn within the agent host session.' };
	failureStage: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The bounded stage at which the agent host turn failed.' };
	errorType: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The structured agent host or provider error type.' };
	errorName: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'The name of the exception, when available.' };
	errorCode: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'The exception or protocol error code, when available.' };
	providerCallId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The GitHub provider request identifier, when available.' };
	serviceRequestId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The Copilot service request identifier, when available.' };
	msg: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'The error message. VS Code telemetry scrubs file paths and likely secrets before transmission.' };
	callstack: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'The error stack. VS Code telemetry scrubs file paths and likely secrets before transmission.' };
	owner: 'roblourens';
	comment: 'Captures diagnostic details for failed agent host turns.';
};

export interface IAgentHostTurnFailure {
	stage: AgentHostTurnFailureStage;
	error: ErrorInfo;
	errorName?: string;
	errorCode?: string;
	errorStack?: string;
}

export interface IAgentHostTurnCompletedReport extends IAgentHostTurnAttributedReport {
	provider: string;
	session: string;
	turnId: string;
	parentTurnId: string | undefined;
	parentToolCallId: string | undefined;
	timeToFirstProgress: number | undefined;
	totalTime: number;
	result: AgentHostTurnResult;
	model: string | undefined;
	modelTelemetryKind: AgentHostModelTelemetryKind | undefined;
	modelSelectionKind: AgentHostModelSelectionKind;
	permissionLevel: string | undefined;
	interactionMode: SessionMode | undefined;
	failure: IAgentHostTurnFailure | undefined;
	isMultiRoot: boolean;
	folderCount: number;
	billedNanoAiu: number | undefined;
	directPromptTokenCount: number | undefined;
	directPromptCacheTokenCount: number | undefined;
	directCompletionTokenCount: number | undefined;
	directBilledNanoAiu: number | undefined;
	modelCallCount: number;
}

/**
 * Why a turn was quiet when the hang watchdog fired.
 *
 * Unexpected (these are real bugs and are what dashboards should alert on):
 *  - `noProgress`: the turn started but literally nothing was ever observed for
 *    it — no text, no reasoning, no tool call, no error, no completion. This is
 *    the signature of a lost turn (e.g. a dropped provider callback
 *    registration) where the UI sits on "Working…" forever.
 *  - `stalledAfterProgress`: the turn made progress and then went quiet without
 *    anything outstanding to explain the silence.
 *
 * Expected (the turn is legitimately waiting; reported so the two populations
 * can be told apart in queries rather than silently dropped):
 *  - `waitingOnUser`: a request that blocks on a *human* is outstanding — a
 *    tool confirmation, a tool authentication, or an elicitation. Client tool
 *    execution is deliberately excluded: it is delegated running work rather
 *    than a prompt, and is reported as `runningTool` instead.
 *  - `runningTool`: a tool call is still in flight. Covers genuinely long tool
 *    invocations (builds, test runs), client-executed tools, and subagents,
 *    whose work is reported on the subagent's own chat channel rather than the
 *    parent turn's.
 */
export type AgentHostTurnHangReason = 'noProgress' | 'stalledAfterProgress' | 'waitingOnUser' | 'runningTool';

const turnActivityKindsByActionType = {
	[ActionType.ChatTurnStarted]: 'chat.turnStarted',
	[ActionType.ChatDelta]: 'chat.delta',
	[ActionType.ChatResponsePart]: 'chat.responsePart',
	[ActionType.ChatToolCallStart]: 'chat.toolCallStart',
	[ActionType.ChatToolCallDelta]: 'chat.toolCallDelta',
	[ActionType.ChatToolCallReady]: 'chat.toolCallReady',
	[ActionType.ChatToolCallConfirmed]: 'chat.toolCallConfirmed',
	[ActionType.ChatToolCallComplete]: 'chat.toolCallComplete',
	[ActionType.ChatToolCallResultConfirmed]: 'chat.toolCallResultConfirmed',
	[ActionType.ChatToolCallContentChanged]: 'chat.toolCallContentChanged',
	[ActionType.ChatToolCallAuthRequired]: 'chat.toolCallAuthRequired',
	[ActionType.ChatToolCallAuthResolved]: 'chat.toolCallAuthResolved',
	[ActionType.ChatTurnComplete]: 'chat.turnComplete',
	[ActionType.ChatTurnCancelled]: 'chat.turnCancelled',
	[ActionType.ChatError]: 'chat.error',
	[ActionType.ChatActivityChanged]: 'chat.activityChanged',
	[ActionType.ChatWorkingDirectorySet]: 'chat.workingDirectorySet',
	[ActionType.ChatWorkingDirectoryRemoved]: 'chat.workingDirectoryRemoved',
	[ActionType.ChatUsage]: 'chat.usage',
	[ActionType.ChatReasoning]: 'chat.reasoning',
	[ActionType.ChatPendingMessageSet]: 'chat.pendingMessageSet',
	[ActionType.ChatPendingMessageRemoved]: 'chat.pendingMessageRemoved',
	[ActionType.ChatQueuedMessagesReordered]: 'chat.queuedMessagesReordered',
	[ActionType.ChatDraftChanged]: 'chat.draftChanged',
	[ActionType.ChatInputRequested]: 'chat.inputRequested',
	[ActionType.ChatInputAnswerChanged]: 'chat.inputAnswerChanged',
	[ActionType.ChatInputCompleted]: 'chat.inputCompleted',
	[ActionType.ChatTruncated]: 'chat.truncated',
	[ActionType.ChatTurnsLoaded]: 'chat.turnsLoaded',
	[ActionType.SessionInputNeededSet]: 'session.inputNeededSet',
	[ActionType.SessionInputNeededRemoved]: 'session.inputNeededRemoved',
} as const;

export type AgentHostTurnActivityTelemetryKind = 'none' | 'other' | typeof turnActivityKindsByActionType[keyof typeof turnActivityKindsByActionType];

function normalizeTurnActivityKind(activityKind: string): AgentHostTurnActivityTelemetryKind {
	if (activityKind === 'none') {
		return 'none';
	}

	return turnActivityKindsByActionType[activityKind as keyof typeof turnActivityKindsByActionType] ?? 'other';
}

export interface IAgentHostTurnHungEvent extends IAgentHostInitiatorTelemetry {
	provider: string;
	agentSessionId: string;
	chatSessionId: string;
	isSubagentSession: boolean;
	turnId: string;
	hangReason: AgentHostTurnHangReason;
	isExpected: boolean;
	hadAnyProgress: boolean;
	lastActivityKind: AgentHostTurnActivityTelemetryKind;
	currentStage: AgentHostTurnFailureStage;
	providerDiagnosticState: AgentHostProviderDiagnosticState;
	providerCallState?: AgentTurnProviderCallState;
	providerTurnStarted?: boolean;
	providerSessionState?: AgentTurnProviderSessionState;
	initiatorClientConnectionState: AgentHostInitiatorClientConnectionState;
	blockedOn: SessionInputRequestKind | undefined;
	toolId: string | undefined;
	toolSourceKind: string | undefined;
	inFlightToolCallCount: number;
	quietTimeMs: number;
	turnElapsedMs: number;
	model: string | TelemetryTrustedValue<string> | undefined;
	modelSelectionKind: AgentHostModelSelectionKind;
	permissionLevel: string | undefined;
}

export type IAgentHostTurnHungClassification = IAgentHostInitiatorClassification & {
	provider: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The provider handling the hung agent host turn.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The agent host session identifier.' };
	chatSessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The chat identifier within the agent host session.' };
	isSubagentSession: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the hung turn belongs to a subagent session.' };
	turnId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The identifier of the hung turn within the agent host session.' };
	hangReason: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The bounded state the turn was quiet in: noProgress, stalledAfterProgress, waitingOnUser, or runningTool.' };
	isExpected: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the quiet period is explained by a legitimate wait (blocked on the user or running a tool) rather than an unexplained hang.' };
	hadAnyProgress: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether any turn activity at all was observed before the watchdog fired.' };
	lastActivityKind: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'A bounded category for the last observed turn activity, preserving the AHP action namespace and action name without slash-like syntax. Values are none, other, or categories such as chat.delta and chat.toolCallReady.' };
	currentStage: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The bounded turn stage active when the hang watchdog fired.' };
	providerDiagnosticState: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether bounded provider diagnostics were available, unsupported, unavailable, failed, or missing the expected chat or turn.' };
	providerCallState?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the provider call had not started, was pending, resolved, or rejected when the hang watchdog fired.' };
	providerTurnStarted?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the provider reported that its turn started before the hang watchdog fired.' };
	providerSessionState?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The bounded provider session state when the hang watchdog fired.' };
	initiatorClientConnectionState: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the client that initiated the turn was still connected when the hang watchdog fired, or unknown when the client could not be identified.' };
	blockedOn: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The kind of outstanding user-blocking session input request, when there is one. Client tool execution is not counted, since it is delegated work rather than a prompt.' };
	toolId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The identifier of the tool the turn appears to be stuck on. When hangReason is waitingOnUser this is the tool gated by the blocking request, which is exact; when it is runningTool this is the longest-running in-flight tool call, which is a best guess when several are running. Undefined when no tool explains the hang.' };
	toolSourceKind: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the stuck tool is provided by the agent host, an MCP server, or a client.' };
	inFlightToolCallCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of tool calls that had started but not completed when the watchdog fired. When hangReason is runningTool, a value above one means toolId is a best guess among several running tools; when it is waitingOnUser, toolId comes from the blocking request and is exact regardless of this count.' };
	quietTimeMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time in milliseconds since the last observed turn activity.' };
	turnElapsedMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time in milliseconds from turn start to the hang report.' };
	model: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The trusted provider model identifier for the turn, or a generic value for BYOK and unknown models.' };
	modelSelectionKind: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the client used the provider default, Auto, or an explicit model.' };
	permissionLevel: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The tool auto-approval level configured for the session at turn start (e.g. default, autoApprove, autopilot).' };
	owner: 'roblourens';
	comment: 'Tracks agent host turns that stop making progress for longer than the hang threshold, so permanently stuck sessions are visible as a positive signal instead of missing turnCompleted events.';
};

export interface IAgentHostTurnHungReport extends IAgentHostTurnAttributedReport {
	provider: string;
	session: string;
	turnId: string;
	hangReason: AgentHostTurnHangReason;
	hadAnyProgress: boolean;
	lastActivityKind: string;
	currentStage: AgentHostTurnFailureStage;
	providerDiagnosticState: AgentHostProviderDiagnosticState;
	providerDiagnosticSnapshot: IAgentTurnDiagnosticSnapshot | undefined;
	initiatorClientConnectionState: AgentHostInitiatorClientConnectionState;
	blockedOn: SessionInputRequestKind | undefined;
	toolId: string | undefined;
	toolSourceKind: string | undefined;
	inFlightToolCallCount: number;
	quietTimeMs: number;
	turnElapsedMs: number;
	model: string | undefined;
	modelTelemetryKind: AgentHostModelTelemetryKind | undefined;
	modelSelectionKind: AgentHostModelSelectionKind;
	permissionLevel: string | undefined;
}

export interface IAgentHostHungTurnCompletedEvent extends IAgentHostInitiatorTelemetry {
	provider: string;
	agentSessionId: string;
	chatSessionId: string;
	isSubagentSession: boolean;
	turnId: string;
	hangReason: AgentHostTurnHangReason;
	result: AgentHostTurnResult;
	hangReportCount: number;
	totalTimeMs: number;
	timeAfterHangMs: number;
}

export type IAgentHostHungTurnCompletedClassification = IAgentHostInitiatorClassification & {
	provider: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The provider handling the recovered agent host turn.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The agent host session identifier.' };
	chatSessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The chat identifier within the agent host session.' };
	isSubagentSession: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the recovered turn belongs to a subagent session.' };
	turnId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The identifier of the recovered turn within the agent host session.' };
	hangReason: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The most recently reported hang reason for the turn before it completed.' };
	result: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the previously hung turn eventually completed successfully, with an error, or was cancelled.' };
	hangReportCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of hang reports emitted for the turn before it completed.' };
	totalTimeMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Total time in milliseconds from turn start to turn completion.' };
	timeAfterHangMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time in milliseconds from the most recent hang report to turn completion.' };
	owner: 'roblourens';
	comment: 'Tracks agent host turns that complete after previously being reported as hung, so permanent hangs can be separated from merely slow ones.';
};

export interface IAgentHostHungTurnCompletedReport extends IAgentHostTurnAttributedReport {
	provider: string;
	session: string;
	turnId: string;
	hangReason: AgentHostTurnHangReason;
	result: AgentHostTurnResult;
	hangReportCount: number;
	totalTimeMs: number;
	timeAfterHangMs: number;
}

export interface IAgentHostToolInvokedReport extends IAgentHostTurnAttributedReport {
	provider: string;
	session: string;
	turnId: string;
	toolId: string;
	toolSourceKind: string;
	toolCallId: string;
	result: ToolInvokedResult;
	invocationTimeMs?: number;
	resultSizeInCharacters: number;
	model: string | undefined;
	modelTelemetryKind: AgentHostModelTelemetryKind | undefined;
	errorCode: string | undefined;
	errorMessage: string | undefined;
}

export type IAgentHostToolInvokedEvent = LanguageModelToolInvokedEvent & IAgentHostInitiatorTelemetry & {
	provider: string;
	agentSessionId: string;
	chatSessionId: string;
	isSubagentSession: boolean;
	errorCode: string | undefined;
	msg: string | undefined;
};

export type IAgentHostToolInvokedClassification = Omit<LanguageModelToolInvokedClassification, 'provider' | 'chatSessionId' | 'owner' | 'comment'> & IAgentHostInitiatorClassification & {
	provider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The Agent Host provider that invoked the tool.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The Agent Host session identifier.' };
	chatSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The chat identifier within the Agent Host session.' };
	isSubagentSession: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the tool call belongs to a subagent session.' };
	errorCode: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'The tool failure code, when available.' };
	msg: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'The tool failure message, when available. VS Code telemetry scrubs file paths and likely secrets before transmission.' };
	owner: 'roblourens';
	comment: 'Tracks Agent Host tool invocations with Agent Host correlation and optional failure diagnostics.';
};

export interface IAgentHostAskQuestionsToolInvokedEvent extends IAgentHostInitiatorTelemetry {
	requestId: string;
	questionCount: number;
	answeredCount: number;
	skippedCount: number;
	freeTextCount: number;
	recommendedAvailableCount: number;
	recommendedSelectedCount: number;
	duration: number;
	provider: string;
	agentSessionId: string;
	isSubagentSession: boolean;
}

export type IAgentHostAskQuestionsToolInvokedClassification = IAgentHostInitiatorClassification & {
	requestId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The id of the current request turn.' };
	questionCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The total number of questions asked' };
	answeredCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of questions that were answered' };
	skippedCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of questions that were skipped' };
	freeTextCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of questions answered with free text input' };
	recommendedAvailableCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of questions that had a recommended option' };
	recommendedSelectedCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of questions where the user selected the recommended option' };
	duration: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'The total time in milliseconds to complete all questions' };
	provider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The provider handling the agent host session.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The agent host session identifier.' };
	isSubagentSession: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the questions belong to a subagent session.' };
	owner: 'digitarald';
	comment: 'Tracks usage of the AskQuestions tool for agent clarifications';
};

export interface IAgentHostAskQuestionsToolInvokedReport extends IAgentHostTurnAttributedReport {
	provider: string;
	session: string;
	requestId: string;
	questionCount: number;
	answeredCount: number;
	skippedCount: number;
	freeTextCount: number;
	recommendedAvailableCount: number;
	recommendedSelectedCount: number;
	duration: number;
}

type AgentHostToolCallResponseType = 'success' | 'cancelled' | 'failed';

export interface IAgentHostToolCallDetailsEvent extends IAgentHostInitiatorTelemetry {
	provider: string;
	agentSessionId: string;
	isSubagentSession: boolean;
	conversationId: string;
	requestId: string;
	responseType: AgentHostToolCallResponseType;
	toolCounts: string;
	model: string | undefined;
	numRequests: number;
	turnIndex: number;
	turnDuration: number;
	messageCharLen: number | undefined;
	availableToolCount: number;
	totalToolCalls: number;
	parallelToolCallRounds: number;
	parallelToolCallsTotal: number;
}

export type IAgentHostToolCallDetailsClassification = IAgentHostInitiatorClassification & {
	provider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The provider handling the agent host session.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The agent host session identifier.' };
	isSubagentSession: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the tool-call aggregate belongs to a subagent session.' };
	conversationId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The identifier of the current chat conversation.' };
	requestId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The identifier of the current turn request.' };
	responseType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the turn completed successfully, was cancelled, or failed.' };
	toolCounts: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The number of times each tool was requested during the turn.' };
	model: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The model used for the final model call in the turn, when known.' };
	numRequests: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of model-call rounds in the turn.' };
	turnIndex: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The zero-based turn ordinal within the agent host session.' };
	turnDuration: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'The elapsed time in milliseconds for the turn.' };
	messageCharLen: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of characters in the user message, when known.' };
	availableToolCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of tools offered to the model.' };
	totalToolCalls: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The total number of tool calls requested during the turn.' };
	parallelToolCallRounds: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of model-call rounds containing multiple tool calls.' };
	parallelToolCallsTotal: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of tool calls belonging to parallel tool-call rounds.' };
	owner: 'roblourens';
	comment: 'Records aggregate information about tool calls during an agent host turn.';
};

export interface IAgentHostToolCallDetailsReport extends IAgentHostTurnAttributedReport {
	provider: string;
	session: string;
	turnId: string;
	clientType: AgentHostClientType;
	model: string | undefined;
	responseType: AgentHostToolCallResponseType;
	/** Count of invocations keyed by tool name, across all rounds in the turn. */
	toolCounts: Record<string, number>;
	/** Names of the tools offered to the model for this turn. */
	availableTools: readonly string[];
	/** Number of model-call rounds in the turn, including the final tool-free response round (matches the extension's `toolCallRounds.length`). */
	numRequests: number;
	turnIndex: number;
	turnDuration: number;
	messageCharLen: number | undefined;
	totalToolCalls: number;
	parallelToolCallRounds: number;
	parallelToolCallsTotal: number;
}

export interface IAgentHostToolApprovalReport extends IAgentHostTurnAttributedReport {
	provider: string;
	session: string;
	turnId: string;
	toolId: string;
	toolSourceKind: string;
	confirmKind: AgentHostToolApprovalConfirmKind;
	confirmationNotNeededReason: string | undefined;
	requestUnsandboxedExecution: boolean | undefined;
}

type AgentHostToolApprovalConfirmKind = 'userAction' | 'setting' | 'confirmationNotNeeded' | 'denied';

export interface IAgentHostToolApprovalEvent extends IAgentHostInitiatorTelemetry {
	provider: string;
	agentSessionId: string;
	isSubagentSession: boolean;
	chatSessionId: string;
	requestId: string;
	toolId: string;
	toolExtensionId: string | undefined;
	toolSourceKind: string;
	confirmKind: AgentHostToolApprovalConfirmKind;
	settingId: string | undefined;
	lmServiceScope: string | undefined;
	customButtonKind: string | undefined;
	confirmationNotNeededReason: string | undefined;
	sandboxWrapped: boolean | undefined;
	requestUnsandboxedExecution: boolean | undefined;
}

export type IAgentHostToolApprovalClassification = IAgentHostInitiatorClassification & {
	provider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The provider handling the agent host session.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The agent host session identifier.' };
	isSubagentSession: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the tool approval belongs to a subagent session.' };
	chatSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The ID of the chat session that the tool was used within, if applicable.' };
	requestId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The ID of the chat request turn that this tool approval is associated with, if available.' };
	toolId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The ID of the tool used.' };
	toolExtensionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The extension that contributed the tool.' };
	toolSourceKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The source kind of the tool.' };
	confirmKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How the confirmation was resolved (userAction, setting, confirmationNotNeeded, denied).' };
	settingId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'When confirmKind is setting, the configuration id that auto-approved the tool.' };
	lmServiceScope: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'When confirmKind is lmServicePerTool, the scope (session/workspace/profile).' };
	customButtonKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'When the user clicked a custom button on the confirmation widget, whether the button represents approve or deny semantics.' };
	confirmationNotNeededReason: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'When confirmKind is confirmationNotNeeded, a stable identifier for why the tool did not require confirmation.' };
	sandboxWrapped: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'For terminal tool calls, whether this specific invocation runs inside the agent terminal sandbox.' };
	requestUnsandboxedExecution: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'For terminal tool calls, whether the model requested to bypass the sandbox for this invocation.' };
	owner: 'roblourens';
	comment: 'Provides insight into how tool confirmations are resolved (user action vs. auto-approval) in agent host sessions.';
};

export interface IAgentHostAutoModeRouterDecisionReport {
	session: string;
	turnId: string;
	clientType: AgentHostClientType;
	chosenModel: string;
	predictedLabel: string | undefined;
	confidence: number | undefined;
	candidateModels: readonly string[] | undefined;
	categoryScores: Readonly<Record<string, number | undefined>> | undefined;
	routingMethod: string | undefined;
	availableModels: readonly string[] | undefined;
	fallback: boolean | undefined;
	fallbackReason: string | undefined;
	stickyOverride: boolean | undefined;
	routerLatencyMs: number | undefined;
	endToEndLatencyMs: number | undefined;
	chosenShortfall: number | undefined;
	hasImage: boolean | undefined;
}

export interface IAgentHostSkillContentReadReport {
	clientType: AgentHostClientType;
	/** The skill name. */
	name: string;
	/** Path to the SKILL.md file. */
	path: string;
	/** Full skill content; hashed (never sent raw), matching the extension. */
	content: string;
	/** Where the skill was discovered (project, personal-copilot, plugin, builtin, …). */
	source: string | undefined;
	/** Name of the plugin the skill came from, when applicable (AH-native analog of the extension's skill extension id). */
	pluginName: string | undefined;
	/** Version of the plugin the skill came from, when applicable. */
	pluginVersion: string | undefined;
}

export type AgentHostRepoInfoResult = 'success' | 'filesChanged' | 'diffTooLarge' | 'noChanges' | 'tooManyChanges' | 'mergeBaseTooOld' | 'virtualFileSystem' | 'tooManyCommits';

export interface IAgentHostRepoInfoReport {
	telemetryMessageId: string;
	clientType: AgentHostClientType;
	location: 'begin' | 'end';
	remoteUrl: string;
	repoId: string;
	repoType: 'github' | 'ado';
	headCommitHash: string;
	headBranchName: string | undefined;
	fileRelativePaths: string | undefined;
	diffsJSON: string | undefined;
	result: AgentHostRepoInfoResult;
	isActiveRepository: 'true';
	workspaceFileCount: number;
	changedFileCount: number;
	diffSizeBytes: number;
}

export interface IAgentHostToolCallStalledEvent extends IAgentHostInitiatorTelemetry {
	provider: string;
	agentSessionId: string;
	isSubagentSession: boolean;
	blockerKind: SessionInputRequestKind.ToolConfirmation | SessionInputRequestKind.ToolClientExecution | SessionInputRequestKind.ToolAuthentication;
	toolId: string;
	toolSourceKind: string;
	stalledTimeMs: number;
}

export type IAgentHostToolCallStalledClassification = IAgentHostInitiatorClassification & {
	provider: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The provider handling the stalled agent host tool call.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The agent host session identifier.' };
	isSubagentSession: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the stalled tool call belongs to a subagent session.' };
	blockerKind: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the tool call is waiting for confirmation or client execution.' };
	toolId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The identifier of the stalled tool.' };
	toolSourceKind: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the stalled tool is provided by the agent host, an MCP server, or a client.' };
	stalledTimeMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time in milliseconds that the tool call has remained blocked.' };
	owner: 'roblourens';
	comment: 'Tracks agent host tool calls that remain blocked beyond the stall threshold.';
};

export interface IAgentHostToolCallStalledReport extends IAgentHostTurnAttributedReport {
	provider: string;
	session: string;
	blockerKind: SessionInputRequestKind.ToolConfirmation | SessionInputRequestKind.ToolClientExecution | SessionInputRequestKind.ToolAuthentication;
	toolId: string;
	toolSourceKind: string;
	stalledTimeMs: number;
}

export interface IAgentHostStalledToolCallCompletedEvent extends IAgentHostInitiatorTelemetry {
	provider: string;
	agentSessionId: string;
	isSubagentSession: boolean;
	blockerKind: SessionInputRequestKind.ToolConfirmation | SessionInputRequestKind.ToolClientExecution | SessionInputRequestKind.ToolAuthentication;
	toolId: string;
	toolSourceKind: string;
	result: ToolInvokedResult;
	totalTimeMs: number;
	timeAfterStallMs: number;
}

export type IAgentHostStalledToolCallCompletedClassification = IAgentHostInitiatorClassification & {
	provider: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The provider handling the completed agent host tool call.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The agent host session identifier.' };
	isSubagentSession: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the completed tool call belongs to a subagent session.' };
	blockerKind: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the tool call had stalled waiting for confirmation or client execution.' };
	toolId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The identifier of the completed tool.' };
	toolSourceKind: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the completed tool is provided by the agent host, an MCP server, or a client.' };
	result: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the stalled tool call eventually completed successfully, with an error, or through user cancellation.' };
	totalTimeMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Total time in milliseconds from tool call start to completion.' };
	timeAfterStallMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time in milliseconds from the stall report to tool call completion.' };
	owner: 'roblourens';
	comment: 'Tracks agent host tool calls that complete after previously exceeding the stall threshold.';
};

export interface IAgentHostStalledToolCallCompletedReport extends IAgentHostTurnAttributedReport {
	provider: string;
	session: string;
	blockerKind: SessionInputRequestKind.ToolConfirmation | SessionInputRequestKind.ToolClientExecution | SessionInputRequestKind.ToolAuthentication;
	toolId: string;
	toolSourceKind: string;
	result: ToolInvokedResult;
	totalTimeMs: number;
	timeAfterStallMs: number;
}

function toTelemetryModel(model: string | undefined, modelTelemetryKind: AgentHostModelTelemetryKind | undefined): string | TelemetryTrustedValue<string> | undefined {
	if (model === undefined) {
		return undefined;
	}
	if (modelTelemetryKind === 'trusted') {
		return new TelemetryTrustedValue(model);
	}
	return modelTelemetryKind === 'byok' ? 'byokModel' : 'unknown';
}

export function toInitiatorTelemetry(clientContext: IAgentHostClientTelemetryContext | undefined): IAgentHostInitiatorTelemetry {
	return {
		...(clientContext?.clientType !== undefined && clientContext.clientType !== AgentHostClientType.Unknown ? { initiatorClientType: clientContext.clientType } : {}),
		...(clientContext?.connectionKind !== undefined && clientContext.connectionKind !== AgentHostClientConnectionKind.Unknown ? { initiatorConnectionKind: clientContext.connectionKind } : {}),
		...(clientContext?.transportKind !== undefined && clientContext.transportKind !== AgentHostTransportKind.Unknown ? { initiatorTransportKind: clientContext.transportKind } : {}),
		...(clientContext?.hostLaunchKind !== undefined && clientContext.hostLaunchKind !== AgentHostLaunchKind.Unknown ? { hostLaunchKind: clientContext.hostLaunchKind } : {}),
		...(clientContext?.machineId ? { initiatorMachineId: clientContext.machineId } : {}),
		...(clientContext?.devDeviceId ? { initiatorDevDeviceId: clientContext.devDeviceId } : {}),
	};
}

export const IAgentHostTelemetryReporter = createDecorator<AgentHostTelemetryReporter>('agentHostTelemetryReporter');

export class AgentHostTelemetryReporter {

	declare readonly _serviceBrand: undefined;

	constructor(@ITelemetryService private readonly _telemetryService: ITelemetryService) { }

	/** The restricted GH/MSFT telemetry surface, present when the agent-host telemetry service is wired. */
	private get _restricted(): IAgentHostRestrictedTelemetry | undefined {
		const ts = this._telemetryService as Partial<IAgentHostRestrictedTelemetry>;
		return typeof ts.sendEnhancedGHTelemetryEvent === 'function' ? ts as IAgentHostRestrictedTelemetry : undefined;
	}

	executionModeChanged(provider: string, session: string, previousMode: SessionMode, newMode: SessionMode, turnCount: number, clientContext?: IAgentHostClientTelemetryContext): void {
		this._telemetryService.publicLog2<IAgentHostExecutionModeChangedEvent, IAgentHostExecutionModeChangedClassification>('agentHost.executionModeChanged', {
			...toInitiatorTelemetry(clientContext),
			provider,
			agentSessionId: AgentSession.id(session),
			isSubagentSession: isSubagentSession(session),
			previousMode,
			newMode,
			turnCount,
		});
	}

	userMessageSent(provider: string, clientId: string | undefined, clientContext: IAgentHostClientTelemetryContext, session: string, turnId: string, sessionState: ISessionWithDefaultChat | undefined, source: AgentHostUserMessageSentSource, message: Message): void {
		const attachmentCount = message.attachments?.length ?? 0;
		const activeClients = sessionState?.activeClients ?? [];
		const sessionUri = isAhpChatChannel(session) ? parseRequiredSessionUriFromChatUri(session) : session;
		this._telemetryService.publicLog2<IAgentHostUserMessageSentEvent, IAgentHostUserMessageSentClassification>('agentHost.userMessageSent', {
			provider,
			hostLaunchKind: clientContext.hostLaunchKind,
			initiatorClientId: clientId,
			initiatorClientType: clientContext.clientType,
			initiatorConnectionKind: clientContext.connectionKind,
			initiatorTransportKind: clientContext.transportKind,
			...(clientContext.machineId ? { initiatorMachineId: clientContext.machineId } : {}),
			...(clientContext.devDeviceId ? { initiatorDevDeviceId: clientContext.devDeviceId } : {}),
			agentSessionId: AgentSession.id(sessionUri),
			source,
			messageOriginKind: message.origin.kind,
			isSubagentSession: isSubagentSession(sessionUri),
			turnCount: sessionState?.turns.length ?? 0,
			...(activeClients.length > 0 ? {
				activeClientId: activeClients[0].clientId,
				activeClientToolCount: activeClients.reduce((sum, client) => sum + client.tools.length, 0),
				activeClientCustomizationCount: activeClients.reduce((sum, client) => sum + (client.customizations?.length ?? 0), 0),
			} : {}),
			attachmentCount,
		});
		this._restricted?.sendGHTelemetryEvent('agentHost.userMessageSent', {
			provider,
			initiatorClientType: clientContext.clientType,
			conversationId: AgentSession.id(sessionUri),
			turnId,
			messageOriginKind: message.origin.kind,
		});
	}

	clientConnection(report: IAgentHostClientConnectionReport): void {
		this._telemetryService.publicLog2<IAgentHostClientConnectionEvent, IAgentHostClientConnectionClassification>('agentHost.clientConnection', {
			action: report.action,
			hostLaunchKind: report.context.hostLaunchKind,
			clientId: report.clientId,
			clientType: report.context.clientType,
			clientImplementationName: report.clientImplementationName,
			clientImplementationVersion: report.clientImplementationVersion,
			connectionKind: report.context.connectionKind,
			transportKind: report.context.transportKind,
			...(report.context.machineId ? { clientMachineId: report.context.machineId } : {}),
			...(report.context.devDeviceId ? { clientDevDeviceId: report.context.devDeviceId } : {}),
			protocolVersion: report.protocolVersion,
			isReconnect: report.isReconnect,
			connectedClientCount: report.connectedClientCount,
			connectedTransportCount: report.connectedTransportCount,
			clientTransportCount: report.clientTransportCount,
			connectionDurationMs: report.connectionDurationMs,
			subscriptionCount: report.subscriptionCount,
		});
	}

	/**
	 * Mirrors the Copilot extension's enhanced GH `request.options.tools` event for the agent-host
	 * flow. The extension emits it per LLM request from its model fetcher; the agent host observes
	 * the equivalent boundary when an `assistant.message` arrives (one per model call). The
	 * `headerRequestId` is the client-minted `x-request-id`, matching the extension. `messagesJson`
	 * is the raw tool definitions offered for the call, multiplexed across ~8192-char chunks like
	 * the extension, so it lands identically downstream.
	 *
	 * @param session Session URI string; its id becomes `conversationId`.
	 * @param clientRequestId The model call's client-minted `x-request-id`, mapped to the extension's `headerRequestId`. No-ops when absent (e.g. providers that don't surface it).
	 * @param tools The tool definitions offered to the model for this call.
	 */
	async assistantMessageReceived(session: string, clientType: AgentHostClientType, clientRequestId: string | undefined, tools: readonly ToolDefinition[]): Promise<void> {
		const restricted = this._restricted;
		if (!restricted || !clientRequestId || tools.length === 0) {
			return;
		}
		restricted.sendEnhancedGHTelemetryEvent('request.options.tools', await multiplexProperties({
			headerRequestId: clientRequestId,
			conversationId: AgentSession.id(session),
			initiatorClientType: clientType,
			messagesJson: JSON.stringify(tools),
		}));
	}

	/**
	 * Mirrors the Copilot extension's restricted `conversation.messageText` event (the panel-chat
	 * prefix of `sendConversationalMessageTelemetry`) for the user's prompt. The extension emits it
	 * for every user and model message, carrying the raw message text to the enhanced GH
	 * (`copilot_v0_restricted_copilot_event`) and internal MSFT pipelines; the agent host observes
	 * the same boundary at the SDK `user.message` event. The text is multiplexed across ~8192-char
	 * chunks (`messageText`, `messageText_02`, …) so long prompts land untruncated, matching the
	 * extension's `multiplexProperties`.
	 *
	 * @param session Session URI string; its id becomes `conversationId`.
	 * @param content The user's prompt text. No-ops when empty.
	 * @param turnIndex The 0-based ordinal of the turn this message belongs to, matching the extension's numeric `turnIndex` (`conversation.turns.length`). CTS parses `turn_index` as an integer, so a numeric ordinal is required here (a non-numeric id lands empty).
	 */
	async userMessageText(session: string, clientType: AgentHostClientType, content: string, turnIndex: number): Promise<void> {
		const restricted = this._restricted;
		if (!restricted || !content) {
			return;
		}
		const properties = await multiplexProperties({
			source: 'user',
			conversationId: AgentSession.id(session),
			initiatorClientType: clientType,
			turnIndex: String(turnIndex),
			messageText: content,
		});
		const measurements = { messageCharLen: content.length };
		restricted.sendEnhancedGHTelemetryEvent('conversation.messageText', properties, measurements);
		restricted.sendInternalMSFTTelemetryEvent('conversation.messageText', properties, measurements);
	}

	/**
	 * The model-message counterpart to {@link userMessageText}. Emitted when an `assistant.message`
	 * arrives (the agent host's per-model-call boundary), carrying the assistant's response text.
	 * `headerRequestId` is filled with the model call's client-minted `x-request-id`, matching the
	 * extension. VS Code-only enrichment dims (code-block languages/counts) are not reconstructed here.
	 *
	 * @param session Session URI string; its id becomes `conversationId`.
	 * @param content The assistant's response text. No-ops when empty.
	 * @param turnIndex The 0-based ordinal of the turn this message belongs to, matching the extension's numeric `turnIndex` (`conversation.turns.length`). CTS parses `turn_index` as an integer, so a numeric ordinal is required here.
	 * @param clientRequestId The model call's client-minted `x-request-id`, mapped to `headerRequestId`.
	 */
	async modelMessageText(session: string, clientType: AgentHostClientType, content: string, turnIndex: number, clientRequestId: string | undefined): Promise<void> {
		const restricted = this._restricted;
		if (!restricted || !content) {
			return;
		}
		const properties = await multiplexProperties({
			source: 'model',
			conversationId: AgentSession.id(session),
			initiatorClientType: clientType,
			turnIndex: String(turnIndex),
			...(clientRequestId ? { headerRequestId: clientRequestId } : {}),
			messageText: content,
		});
		const measurements = { messageCharLen: content.length };
		restricted.sendEnhancedGHTelemetryEvent('conversation.messageText', properties, measurements);
		restricted.sendInternalMSFTTelemetryEvent('conversation.messageText', properties, measurements);
	}

	/**
	 * Emits the local-compatible tool-call aggregate on standard and restricted telemetry channels.
	 */
	async toolCallDetails(report: IAgentHostToolCallDetailsReport): Promise<void> {
		if (report.availableTools.length === 0) {
			return;
		}
		const session = isAhpChatChannel(report.session) ? parseRequiredSessionUriFromChatUri(report.session) : report.session;
		const conversationId = AgentSession.id(session);
		const toolCounts = JSON.stringify(report.toolCounts);
		this._telemetryService.publicLog2<IAgentHostToolCallDetailsEvent, IAgentHostToolCallDetailsClassification>('toolCallDetails', {
			...toInitiatorTelemetry(report.clientContext),
			provider: report.provider,
			agentSessionId: conversationId,
			isSubagentSession: isSubagentSession(session),
			conversationId,
			requestId: report.turnId,
			responseType: report.responseType,
			toolCounts,
			model: report.model,
			numRequests: report.numRequests,
			turnIndex: report.turnIndex,
			turnDuration: report.turnDuration,
			messageCharLen: report.messageCharLen,
			availableToolCount: report.availableTools.length,
			totalToolCalls: report.totalToolCalls,
			parallelToolCallRounds: report.parallelToolCallRounds,
			parallelToolCallsTotal: report.parallelToolCallsTotal,
		});

		const restricted = this._restricted;
		if (!restricted) {
			return;
		}
		const properties = await multiplexProperties({
			conversationId,
			requestId: report.turnId,
			messageId: report.turnId,
			initiatorClientType: report.clientType,
			responseType: report.responseType,
			...(report.model ? { model: report.model } : {}),
			toolCounts,
			availableTools: JSON.stringify(report.availableTools),
		});
		const measurements = {
			numRequests: report.numRequests,
			turnIndex: report.turnIndex,
			turnDuration: report.turnDuration,
			...(report.messageCharLen !== undefined ? { messageCharLen: report.messageCharLen } : {}),
			availableToolCount: report.availableTools.length,
			totalToolCalls: report.totalToolCalls,
			parallelToolCallRounds: report.parallelToolCallRounds,
			parallelToolCallsTotal: report.parallelToolCallsTotal,
		};
		restricted.sendEnhancedGHTelemetryEvent('toolCallDetailsExternal', properties, measurements);
		restricted.sendInternalMSFTTelemetryEvent('toolCallDetailsInternal', properties, measurements);
	}

	/** Emits the workbench-compatible tool-approval telemetry from the agent host on the standard telemetry channel. */
	toolApproval(report: IAgentHostToolApprovalReport): void {
		const session = isAhpChatChannel(report.session) ? parseRequiredSessionUriFromChatUri(report.session) : report.session;
		const agentSessionId = AgentSession.id(session);
		this._telemetryService.publicLog2<IAgentHostToolApprovalEvent, IAgentHostToolApprovalClassification>('chat.toolApproval', {
			...toInitiatorTelemetry(report.clientContext),
			provider: report.provider,
			agentSessionId,
			isSubagentSession: isSubagentSession(session),
			chatSessionId: agentSessionId,
			requestId: report.turnId,
			toolId: report.toolId,
			toolExtensionId: undefined,
			toolSourceKind: report.toolSourceKind,
			confirmKind: report.confirmKind,
			settingId: undefined,
			lmServiceScope: undefined,
			customButtonKind: undefined,
			confirmationNotNeededReason: report.confirmationNotNeededReason,
			sandboxWrapped: undefined,
			requestUnsandboxedExecution: report.requestUnsandboxedExecution,
		});
	}

	/** Emits the extension's restricted `automode.routerDecisionRestricted` event from authoritative SDK fields. */
	autoModeRouterDecision(report: IAgentHostAutoModeRouterDecisionReport): void {
		const restricted = this._restricted;
		if (!restricted) {
			return;
		}

		const categoryScores = report.categoryScores ?? {};
		const isBinary = categoryScores.needs_reasoning !== undefined || categoryScores.no_reasoning !== undefined;
		const scoreKeys = Object.keys(categoryScores).filter(key => categoryScores[key] !== undefined);
		const candidateModels = report.candidateModels ?? [];
		const properties = {
			conversationId: AgentSession.id(report.session),
			vscodeRequestId: report.turnId,
			initiatorClientType: report.clientType,
			...(report.predictedLabel !== undefined ? { predictedLabel: report.predictedLabel } : {}),
			...(report.routingMethod !== undefined ? { routingMethod: report.routingMethod } : {}),
			...(report.fallback !== undefined ? { fallback: String(report.fallback) } : {}),
			...(report.fallbackReason !== undefined ? { fallbackReason: report.fallbackReason } : {}),
			candidateModel: candidateModels[0] ?? '',
			chosenModel: report.chosenModel,
			candidateModels: JSON.stringify(candidateModels),
			...(report.availableModels !== undefined ? { availableModels: JSON.stringify(report.availableModels) } : {}),
			...(report.stickyOverride !== undefined ? { stickyOverrideStr: String(report.stickyOverride) } : {}),
			...(report.hasImage !== undefined ? { hasImage: String(report.hasImage) } : {}),
			...(scoreKeys.length > 0 ? {
				[isBinary ? 'binaryScores' : 'hydraScores']: JSON.stringify(categoryScores),
			} : {}),
		};
		const measurements = {
			...(report.confidence !== undefined ? { confidence: report.confidence } : {}),
			...(report.routerLatencyMs !== undefined ? { latencyMs: report.routerLatencyMs } : {}),
			...(report.endToEndLatencyMs !== undefined ? { e2eLatencyMs: report.endToEndLatencyMs } : {}),
			...(report.stickyOverride !== undefined ? { stickyOverride: report.stickyOverride ? 1 : 0 } : {}),
			...(report.chosenShortfall !== undefined ? { chosenShortfall: report.chosenShortfall } : {}),
			...(categoryScores.needs_reasoning !== undefined ? { scoreNeedsReasoning: categoryScores.needs_reasoning } : {}),
			...(categoryScores.no_reasoning !== undefined ? { scoreNoReasoning: categoryScores.no_reasoning } : {}),
		};
		restricted.sendEnhancedGHTelemetryEvent('automode.routerDecisionRestricted', properties, measurements);
	}

	/**
	 * Mirrors the Copilot extension's restricted `skillContentRead` event (`skillTelemetry.ts` ->
	 * `sendSkillContentReadTelemetry`) — records which skill file was loaded into the conversation.
	 * The extension emits it from the skill/readFile tools; the agent host observes the equivalent
	 * boundary at the SDK `skill.invoked` event, whose payload already carries the content (hashed
	 * here, never sent raw), the discovery `source`, and the plugin identity. The extension's
	 * `skillExtensionId` / `skillExtensionVersion` encode the contributing *VS Code extension*, which
	 * does not exist in the agent host; the AH-native provenance is the plugin, so `pluginName` /
	 * `pluginVersion` fill those columns. No-ops when the skill name is empty.
	 *
	 * @param report The invoked skill's metadata (from the SDK `skill.invoked` payload).
	 */
	skillContentRead(report: IAgentHostSkillContentReadReport): void {
		const restricted = this._restricted;
		if (!restricted || !report.name) {
			return;
		}
		const contentHash = report.content ? String(hash(report.content)) : '';
		const skillStorage = report.source ?? '';
		// Match the extension: the version is only reported when the (plugin) id is known, so we
		// never emit a `skillExtensionVersion` without a corresponding `skillExtensionId`.
		const skillExtensionVersion = report.pluginName ? (report.pluginVersion ?? '') : '';
		const plaintextProps = {
			initiatorClientType: report.clientType,
			skillName: report.name,
			skillPath: report.path,
			skillExtensionId: report.pluginName ?? '',
			skillExtensionVersion,
			skillStorage,
			skillContentHash: contentHash,
		};
		restricted.sendGHTelemetryEvent('skillContentRead', {
			initiatorClientType: report.clientType,
			skillNameHash: String(hash(report.name)),
			skillExtensionIdHash: report.pluginName ? String(hash(report.pluginName)) : '',
			skillExtensionVersion,
			skillStorage,
			skillContentHash: contentHash,
		});
		restricted.sendEnhancedGHTelemetryEvent('skillContentRead', plaintextProps);
		restricted.sendInternalMSFTTelemetryEvent('skillContentRead', plaintextProps);
	}

	async reportRepoInfo(context: IAgentHostRestrictedTelemetryContext, report: IAgentHostRepoInfoReport): Promise<void> {
		const restricted = this._restricted;
		if (!restricted) {
			return;
		}
		const properties = {
			initiatorClientType: report.clientType,
			remoteUrl: report.remoteUrl,
			repoId: report.repoId,
			repoType: report.repoType,
			headCommitHash: report.headCommitHash,
			headBranchName: report.headBranchName,
			fileRelativePaths: report.fileRelativePaths,
			diffsJSON: report.diffsJSON,
			result: report.result,
			isActiveRepository: report.isActiveRepository,
			location: report.location,
			telemetryMessageId: report.telemetryMessageId,
		};
		const measurements = {
			workspaceFileCount: report.workspaceFileCount,
			changedFileCount: report.changedFileCount,
			diffSizeBytes: report.diffSizeBytes,
			repoIndex: 0,
			repoCount: 1,
		};
		const { headBranchName: _, fileRelativePaths: _2, ...internalProperties } = properties;
		const [enhancedProperties, internalMultiplexedProperties] = await Promise.all([
			multiplexProperties(properties),
			multiplexProperties(internalProperties),
		]);
		restricted.sendEnhancedGHTelemetryEventForContext(context, 'request.repoInfo', enhancedProperties, measurements);
		restricted.sendInternalMSFTTelemetryEventForContext(context, 'request.repoInfo', internalMultiplexedProperties, measurements);
	}

	turnCompleted(report: IAgentHostTurnCompletedReport): void {
		const session = isAhpChatChannel(report.session) ? parseRequiredSessionUriFromChatUri(report.session) : report.session;
		const chatSessionId = getTelemetryChatSessionId(report.session);
		const isSubagent = isSubagentChatUri(report.session) || isSubagentSession(session);
		const model = toTelemetryModel(report.model, report.modelTelemetryKind);
		this._telemetryService.publicLog2<IAgentHostTurnCompletedEvent, IAgentHostTurnCompletedClassification>('agentHost.turnCompleted', {
			...toInitiatorTelemetry(report.clientContext),
			provider: report.provider,
			agentSessionId: AgentSession.id(session),
			chatSessionId,
			isSubagentSession: isSubagent,
			turnId: report.turnId,
			parentTurnId: report.parentTurnId,
			parentToolCallId: report.parentToolCallId,
			timeToFirstProgress: report.timeToFirstProgress,
			totalTime: report.totalTime,
			result: report.result,
			model,
			modelSelectionKind: report.modelSelectionKind,
			isBYOK: report.modelTelemetryKind === undefined ? undefined : report.modelTelemetryKind === 'byok',
			permissionLevel: report.permissionLevel,
			interactionMode: report.interactionMode,
			errorType: report.failure?.error.errorType,
			failureStage: report.failure?.stage,
			isMultiRoot: report.isMultiRoot,
			folderCount: report.folderCount,
			billedNanoAiu: report.billedNanoAiu,
			directPromptTokenCount: report.directPromptTokenCount,
			directPromptCacheTokenCount: report.directPromptCacheTokenCount,
			directCompletionTokenCount: report.directCompletionTokenCount,
			directBilledNanoAiu: report.directBilledNanoAiu,
			modelCallCount: report.modelCallCount,
		});
		if (report.failure) {
			const { providerCallId, serviceRequestId } = readAgentErrorTelemetryMeta(report.failure.error);
			this._telemetryService.publicLogError2<IAgentHostTurnFailedEvent, IAgentHostTurnFailedClassification>('agentHost.turnFailed', {
				...toInitiatorTelemetry(report.clientContext),
				provider: report.provider,
				agentSessionId: AgentSession.id(session),
				chatSessionId,
				isSubagentSession: isSubagent,
				turnId: report.turnId,
				failureStage: report.failure.stage,
				errorType: report.failure.error.errorType,
				errorName: report.failure.errorName,
				errorCode: report.failure.errorCode,
				providerCallId,
				serviceRequestId,
				msg: report.failure.error.message,
				callstack: report.failure.errorStack ?? report.failure.error.stack,
			});
		}
	}

	/**
	 * Reports a turn that has stopped producing activity for longer than the
	 * hang threshold. See {@link AgentHostTurnHangReason} for which reasons are
	 * expected waits and which indicate a real hang.
	 */
	turnHung(report: IAgentHostTurnHungReport): void {
		const session = isAhpChatChannel(report.session) ? parseRequiredSessionUriFromChatUri(report.session) : report.session;
		this._telemetryService.publicLog2<IAgentHostTurnHungEvent, IAgentHostTurnHungClassification>('agentHost.turnHung', {
			...toInitiatorTelemetry(report.clientContext),
			provider: report.provider,
			agentSessionId: AgentSession.id(session),
			chatSessionId: getTelemetryChatSessionId(report.session),
			isSubagentSession: isSubagentChatUri(report.session) || isSubagentSession(session),
			turnId: report.turnId,
			hangReason: report.hangReason,
			isExpected: report.hangReason === 'waitingOnUser' || report.hangReason === 'runningTool',
			hadAnyProgress: report.hadAnyProgress,
			lastActivityKind: normalizeTurnActivityKind(report.lastActivityKind),
			currentStage: report.currentStage,
			providerDiagnosticState: report.providerDiagnosticState,
			...(report.providerDiagnosticSnapshot?.state === 'available' ? {
				providerCallState: report.providerDiagnosticSnapshot.providerCallState,
				providerTurnStarted: report.providerDiagnosticSnapshot.providerTurnStarted,
				providerSessionState: report.providerDiagnosticSnapshot.providerSessionState,
			} : {}),
			initiatorClientConnectionState: report.initiatorClientConnectionState,
			blockedOn: report.blockedOn,
			toolId: report.toolId,
			toolSourceKind: report.toolSourceKind,
			inFlightToolCallCount: report.inFlightToolCallCount,
			quietTimeMs: report.quietTimeMs,
			turnElapsedMs: report.turnElapsedMs,
			model: toTelemetryModel(report.model, report.modelTelemetryKind),
			modelSelectionKind: report.modelSelectionKind,
			permissionLevel: report.permissionLevel,
		});
	}

	/** Paired recovery event for a turn previously reported by {@link turnHung}. */
	hungTurnCompleted(report: IAgentHostHungTurnCompletedReport): void {
		const session = isAhpChatChannel(report.session) ? parseRequiredSessionUriFromChatUri(report.session) : report.session;
		this._telemetryService.publicLog2<IAgentHostHungTurnCompletedEvent, IAgentHostHungTurnCompletedClassification>('agentHost.hungTurnCompleted', {
			...toInitiatorTelemetry(report.clientContext),
			provider: report.provider,
			agentSessionId: AgentSession.id(session),
			chatSessionId: getTelemetryChatSessionId(report.session),
			isSubagentSession: isSubagentChatUri(report.session) || isSubagentSession(session),
			turnId: report.turnId,
			hangReason: report.hangReason,
			result: report.result,
			hangReportCount: report.hangReportCount,
			totalTimeMs: report.totalTimeMs,
			timeAfterHangMs: report.timeAfterHangMs,
		});
	}

	toolInvoked(report: IAgentHostToolInvokedReport): void {
		// `chatSessionId` is the full session URI string (matching the value
		// previously emitted by `CopilotAgentSession`). Action signals are keyed
		// by their chat-channel URI, so normalize it back to the session URI.
		const session = isAhpChatChannel(report.session) ? parseRequiredSessionUriFromChatUri(report.session) : report.session;
		this._telemetryService.publicLog2<LanguageModelToolInvokedEvent & IAgentHostInitiatorTelemetry, LanguageModelToolInvokedClassification & IAgentHostInitiatorClassification>('languageModelToolInvoked', {
			...toInitiatorTelemetry(report.clientContext),
			result: report.result,
			chatSessionId: session,
			toolId: report.toolId,
			toolExtensionId: undefined,
			toolSourceKind: report.toolSourceKind,
			toolCallId: report.toolCallId,
			invocationTimeMs: report.invocationTimeMs,
			provider: report.provider,
			resultSizeInCharacters: report.resultSizeInCharacters,
			turnId: report.turnId,
			model: toTelemetryModel(report.model, report.modelTelemetryKind),
		});
		const event: IAgentHostToolInvokedEvent = {
			...toInitiatorTelemetry(report.clientContext),
			result: report.result,
			agentSessionId: AgentSession.id(session),
			chatSessionId: getTelemetryChatSessionId(report.session),
			isSubagentSession: isSubagentChatUri(report.session) || isSubagentSession(session),
			toolId: report.toolId,
			toolExtensionId: undefined,
			toolSourceKind: report.toolSourceKind,
			toolCallId: report.toolCallId,
			invocationTimeMs: report.invocationTimeMs,
			provider: report.provider,
			resultSizeInCharacters: report.resultSizeInCharacters,
			turnId: report.turnId,
			model: toTelemetryModel(report.model, report.modelTelemetryKind),
			errorCode: report.errorCode,
			msg: report.errorMessage,
		};
		this._telemetryService.publicLog2<IAgentHostToolInvokedEvent, IAgentHostToolInvokedClassification>('agentHost.toolInvoked', event);
	}

	askQuestionsToolInvoked(report: IAgentHostAskQuestionsToolInvokedReport): void {
		const session = isAhpChatChannel(report.session) ? parseRequiredSessionUriFromChatUri(report.session) : report.session;
		this._telemetryService.publicLog2<IAgentHostAskQuestionsToolInvokedEvent, IAgentHostAskQuestionsToolInvokedClassification>('askQuestionsToolInvoked', {
			...toInitiatorTelemetry(report.clientContext),
			requestId: report.requestId,
			questionCount: report.questionCount,
			answeredCount: report.answeredCount,
			skippedCount: report.skippedCount,
			freeTextCount: report.freeTextCount,
			recommendedAvailableCount: report.recommendedAvailableCount,
			recommendedSelectedCount: report.recommendedSelectedCount,
			duration: report.duration,
			provider: report.provider,
			agentSessionId: AgentSession.id(session),
			isSubagentSession: isSubagentChatUri(report.session) || isSubagentSession(session),
		});
	}

	toolCallStalled(report: IAgentHostToolCallStalledReport): void {
		const session = isAhpChatChannel(report.session) ? parseRequiredSessionUriFromChatUri(report.session) : report.session;
		this._telemetryService.publicLog2<IAgentHostToolCallStalledEvent, IAgentHostToolCallStalledClassification>('agentHost.toolCallStalled', {
			...toInitiatorTelemetry(report.clientContext),
			provider: report.provider,
			agentSessionId: AgentSession.id(session),
			isSubagentSession: isSubagentChatUri(report.session) || isSubagentSession(session),
			blockerKind: report.blockerKind,
			toolId: report.toolId,
			toolSourceKind: report.toolSourceKind,
			stalledTimeMs: report.stalledTimeMs,
		});
	}

	stalledToolCallCompleted(report: IAgentHostStalledToolCallCompletedReport): void {
		const session = isAhpChatChannel(report.session) ? parseRequiredSessionUriFromChatUri(report.session) : report.session;
		this._telemetryService.publicLog2<IAgentHostStalledToolCallCompletedEvent, IAgentHostStalledToolCallCompletedClassification>('agentHost.stalledToolCallCompleted', {
			...toInitiatorTelemetry(report.clientContext),
			provider: report.provider,
			agentSessionId: AgentSession.id(session),
			isSubagentSession: isSubagentChatUri(report.session) || isSubagentSession(session),
			blockerKind: report.blockerKind,
			toolId: report.toolId,
			toolSourceKind: report.toolSourceKind,
			result: report.result,
			totalTimeMs: report.totalTimeMs,
			timeAfterStallMs: report.timeAfterStallMs,
		});
	}
}
