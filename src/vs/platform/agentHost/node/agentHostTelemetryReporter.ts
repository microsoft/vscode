/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { LanguageModelToolApprovalClassification, LanguageModelToolInvokedClassification, LanguageModelToolInvokedEvent } from '../../telemetry/common/languageModelToolTelemetry.js';
import { ITelemetryService, normalizeModelRouterTelemetryId } from '../../telemetry/common/telemetry.js';
import { TelemetryTrustedValue } from '../../telemetry/common/telemetryUtils.js';
import { hash } from '../../../base/common/hash.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { AgentSession, type AgentCanvasOpenFailure, type AgentSubagentKind, type AgentSubagentTaskModelSource, type AgentTurnProviderCallState, type AgentTurnProviderSessionState, type IAgentTurnDiagnosticSnapshot, type IAgentTokenUsageSummary, type IAgentTelemetryContext, type IAgentTurnInteraction } from '../common/agent.js';
import { isReasoningEffortLevel } from '../common/reasoningEffort.js';
import { isAutoModeRoutingTier, normalizeAutoModeTier } from '../common/autoModeTiers.js';
import { isCopilotHydraFusionModelId } from '../common/copilotCliConfig.js';
import type { SessionMode } from '../common/agentHostSchema.js';
import { getTelemetryChatSessionId } from '../common/agentTelemetryCorrelation.js';
import { readAgentErrorTelemetryMeta } from '../common/meta/errorMeta.js';
import { readLocalModelRowMeta } from '../common/meta/localModelStatus.js';
import type { IAgentMetadataSource } from '../common/meta/metadata.js';
import { isAgentMergeMessage } from '../common/meta/agentMergeMessageMeta.js';
import type { McpServerSource } from '../common/meta/mcpCustomizationMeta.js';
import type { SessionArtifactAddOutcome } from '../common/sessionArtifactCollection.js';
import type { SessionArtifactType } from '../common/sessionArtifacts.js';
import { MessageKind, type ErrorInfo, type Message, type SessionInputRequestKind, type ToolDefinition } from '../common/state/protocol/state.js';
import { ActionType } from '../common/state/sessionActions.js';
import { getAgentHostChatId, isSubagentSession, type ISessionWithDefaultChat } from '../common/state/sessionState.js';
import { IAgentHostOTelService, NullAgentHostOTelService } from '../common/otel/agentHostOTelService.js';
import type { ToolInvokedResult } from './agentHostToolCallTracker.js';
import type { AutomaticTitleGenerationStrategy } from './agentHostSessionTitleController.js';
import { multiplexProperties, type IAgentHostRestrictedTelemetry, type IAgentHostRestrictedTelemetryContext } from './agentHostRestrictedTelemetry.js';
import { AgentHostClientType } from '../common/agentHostClientInfo.js';
import { AgentHostClientConnectionKind, AgentHostLaunchKind, AgentHostTransportKind, type AgentHostPrewarmSkipReason, type CodexModelProvider, type AgentHostProviderSendStage, type AgentHostTurnFailureStage, type AgentHostTurnSendStage, type IAgentHostClientTelemetryContext, type IAgentProviderTurnTelemetryContext, type ICodexAccountTelemetryContext } from '../common/agentHostTelemetry.js';
import { isAgentHostTelemetryService } from './agentHostTelemetryService.js';
import { toCopilotTelemetryData } from './shared/copilotSkuTelemetry.js';
import { getCodexAccountTelemetryData, type CodexAccountTelemetryClassification } from './codex/codexAccountTelemetry.js';
import { groupAgentHostProviderTimings, sanitizeAgentHostProviderTiming, type AgentHostProviderTimingMeasurement, type AgentHostProviderTimingMeasurements, type IAgentHostProviderTiming } from '../common/agentHostProviderTiming.js';

/* __GDPR__
	"copilot-chat/conversation.messageText": {
		"owner": "amunger",
		"comment": "SDK conversation correlation on existing restricted user and model text events.",
		"${include}": [ "${AgentHostRestrictedSdkSession}" ]
	}
*/

/* __GDPR__
	"copilot-chat/request.options.tools": {
		"owner": "amunger",
		"comment": "SDK conversation correlation on the existing restricted offered-tools event.",
		"${include}": [ "${AgentHostRestrictedSdkSession}" ]
	}
*/

type AgentHostProviderTimingEvent = IAgentHostEventTelemetry & AgentHostProviderTimingMeasurements & {
	schemaVersion: number;
	group: string;
	provider: string;
	agentSessionId: string;
	chatSessionId: string;
	turnId: string;
	result: AgentHostTurnResult;
	model: string | TelemetryTrustedValue<string> | undefined;
};

type AgentHostProviderTimingClassification = IAgentHostEventClassification & {
	[K in AgentHostProviderTimingMeasurement]?: {
		classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true;
		comment: 'Allowlisted operation aggregate: start/end offsets and queue/execution durations in milliseconds, or invocation/error/incomplete counts. Milestone fields are first-observation offsets in milliseconds. See the provider timing contract.';
	};
} & {
	owner: 'roblourens';
	comment: 'Grouped VS Code provider-operation and SDK-observation timings, correlated to a completed host turn.';
	schemaVersion: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Version of the provider timing contract.' };
	group: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Code-defined timing group: input, permissions, sandboxShell, mcp, execution, interactions or milestones.' };
	provider: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Agent provider identifier.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Opaque agent session identifier.' };
	chatSessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Opaque chat correlation identifier.' };
	turnId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Host turn correlation identifier.' };
	result: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Terminal host turn outcome, not the operation outcome.' };
	model: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Privacy-normalized selected model.' };
};

export type AgentHostUserMessageSentSource = 'direct' | 'queued';

/**
 * The message origin used for telemetry. Extends the protocol's
 * {@link MessageKind} with host-owned classifications for Agent Merge repair
 * turns and VS Code sessions marked ephemeral, which telemetry reports as
 * `inline`.
 */
export type AgentHostMessageOriginTelemetryKind = MessageKind | 'agentMerge' | 'inline';

/** Classifies a turn's message origin, including host-owned session classifications. */
export function getMessageOriginTelemetryKind(message: Message, isEphemeralSession: boolean): AgentHostMessageOriginTelemetryKind {
	if (isEphemeralSession) {
		return 'inline';
	}
	// The marker only counts on the origin the host stamps it with, so a client
	// cannot dress a user message up as automated merge work.
	if (message.origin.kind === MessageKind.SystemNotification && isAgentMergeMessage(message)) {
		return 'agentMerge';
	}
	return message.origin.kind;
}

export interface IAgentHostCopilotSkuTelemetry {
	copilotSku?: string;
}

export type IAgentHostCopilotSkuClassification = {
	copilotSku?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The raw Copilot entitlement SKU for the authenticated GitHub account.' };
};

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

export interface IAgentHostEventTelemetry extends IAgentHostInitiatorTelemetry, IAgentHostCopilotSkuTelemetry { }

export type IAgentHostEventClassification = IAgentHostInitiatorClassification & IAgentHostCopilotSkuClassification;

type AgentHostSessionCreatedEvent = IAgentHostInitiatorTelemetry & {
	provider: string | undefined;
};

type AgentHostSessionCreatedClassification = IAgentHostInitiatorClassification & {
	owner: 'roblourens';
	comment: 'Counts successful AHP session allocations by provider and initiating connection route, excluding discovery and restoration.';
	provider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The provider of the newly allocated session, when known.' };
};

type CanvasExtensionSource = 'project' | 'user' | 'plugin' | 'session' | 'unknown';

type CanvasOpenedEvent = IAgentHostEventTelemetry & {
	schemaVersion: number;
	provider: string;
	agentSessionId: string;
	extensionSource: CanvasExtensionSource;
};

type CanvasOpenedClassification = IAgentHostEventClassification & {
	owner: 'jruales';
	comment: 'Counts live runtime first-open records, excluding restored history, updates, and provider recovery.';
	schemaVersion: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Canvas open event schema version.' };
	provider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The agent provider opening the canvas.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Existing agent host session identifier, not a URI or canvas instance name.' };
	extensionSource: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Bounded extension provenance from discovery metadata, or unknown when unavailable.' };
};

export interface ICanvasExtensionsReadyEvent {
	schemaVersion: number;
	launchKind: 'create' | 'resume';
	outcome: 'alreadySettled' | 'settled' | 'consentPending' | 'timeout' | 'error' | 'cancelled';
	durationMs: number;
	extensionCount?: number;
	failedExtensionCount?: number;
	dormantExtensionCount?: number;
}

type CanvasExtensionsReadyClassification = {
	owner: 'jruales';
	comment: 'Measures host canvas readiness, not runtime startup or model TTFT. Settled may include failed providers.';
	schemaVersion: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Canvas readiness event schema version.' };
	launchKind: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the session is being created or resumed.' };
	outcome: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether extensions were already settled, settled during the wait, stopped waiting because an extension waits for consent to load, timed out, failed, or the operation was cancelled.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Elapsed milliseconds for the host readiness operation, including extension listing, waiting, and canvas listing.' };
	extensionCount?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Extensions in the latest observed status snapshot; omitted when no snapshot was obtained.' };
	failedExtensionCount?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Failed extensions in the latest observed status snapshot; omitted when no snapshot was obtained.' };
	dormantExtensionCount?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Extensions in the latest observed status snapshot that wait to start until their tools or canvases are first used, so readiness did not include their startup; omitted when no snapshot was obtained.' };
};

/** The bounded outcome of a canvas open the host asked the runtime for. */
export type CanvasHostOpenOutcome = 'opened' | 'consentDenied' | AgentCanvasOpenFailure | 'timeout' | 'error' | 'cancelled';

export interface ICanvasHostOpenEvent {
	schemaVersion: number;
	trigger: 'user' | 'restore';
	extensionStatus: 'dormant' | 'running' | 'other' | 'unknown';
	extensionSource: CanvasExtensionSource;
	outcome: CanvasHostOpenOutcome;
	askedForConsent: boolean;
	durationMs: number;
}

type CanvasHostOpenClassification = {
	owner: 'ulugbekna';
	comment: 'Measures canvas opens the host asks the runtime for, including starting an extension that waits for first use. Excludes opens by the model and repeated reopens by the runtime itself.';
	schemaVersion: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Host canvas open event schema version.' };
	trigger: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'user when a person opened the canvas from the UI; restore when the host reopened a restored canvas in the background.' };
	extensionStatus: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The status of the canvas extension just before the open: dormant when the open had to start it, running when it was already started, other when it was starting, failed, or disabled, or unknown when it could not be read in time.' };
	extensionSource: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Bounded extension provenance from the runtime extension list, or unknown when unavailable.' };
	outcome: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'opened; consentDenied when the user did not allow the extension to load; dismissed, reloaded, mismatchedDeclaration, startFailed, or unavailable when the runtime declined the open for that reason; timeout when the open did not finish before its client or the background reopen stopped waiting; error for other failures; cancelled when the session ended first.' };
	askedForConsent: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the user was shown a request to allow the extension to load during the open, in a turn or by the client, so durationMs includes their response time.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds from the open request until it ended as its client saw it, including any permission mode sync, extension status read, extension startup, and consent prompt.' };
};

export type IAgentHostSubagentKindClassification = {
	subagentKind?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'What the subagent chat represents, set only when isSubagentSession is true: task for a delegated subagent, or fusionPhase for a presentation-only HydraFusion phase chat that shows part of the parent turn.' };
};

/** The Auto tier a turn was sent with and the HydraFusion model that routed it, when known. */
export interface IAgentHostFusionTurnTelemetry {
	autoTier?: string;
	fusionModel?: string;
	/** Set when the turn selected a model router; see {@link ModelRouterOutcome}. */
	modelRouterOutcome?: string;
}

/** What a model router did for a turn. */
export type ModelRouterOutcome = 'picked' | 'defaulted' | 'kept' | 'switched' | 'failed';
const modelRouterOutcomes: ReadonlySet<string> = new Set<ModelRouterOutcome>(['picked', 'defaulted', 'kept', 'switched', 'failed']);

export type IAgentHostFusionTurnClassification = {
	autoTier?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The Auto tier selected for the turn, e.g. balance, or hydrafusion or hydrafusion-max for Copilot Fusion High or Max; other for an unrecognized tier. Set only for Copilot turns on Auto. A tier override setting or managed policy can change the tier that runs; fusionModel reports what ran.' };
	fusionModel?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The HydraFusion model (hydrafusion or hydrafusion-max) the runtime routed the turn with. Absent when the turn did not route through HydraFusion, or was cancelled before routing completed.' };
	modelRouterOutcome?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How a user-defined model router chose the turn\'s model: picked (the decision model chose a route), defaulted (its first route), kept (stayed on the chat\'s model), switched (moved the chat to another route), or failed (the chat kept its model). Absent when the turn did not select a model router. Router names are never sent.' };
};

/** Bounds a selected Auto tier to its known values, mapping anything else to `other`. */
export function toAutoTierTelemetry(tier: string | undefined): string | undefined {
	if (tier === undefined) {
		return undefined;
	}
	const normalized = normalizeAutoModeTier(tier);
	return typeof normalized === 'string' && (isAutoModeRoutingTier(normalized) || isCopilotHydraFusionModelId(normalized)) ? normalized : 'other';
}

/** Keeps only the known HydraFusion models, so an unexpected runtime value is never reported. */
export function toFusionModelTelemetry(fusionModel: string | undefined): string | undefined {
	return isCopilotHydraFusionModelId(fusionModel) ? fusionModel : undefined;
}

function toFusionTurnTelemetry(report: IAgentHostFusionTurnTelemetry): IAgentHostFusionTurnTelemetry {
	const autoTier = toAutoTierTelemetry(report.autoTier);
	const fusionModel = toFusionModelTelemetry(report.fusionModel);
	const modelRouterOutcome = report.modelRouterOutcome !== undefined && modelRouterOutcomes.has(report.modelRouterOutcome) ? report.modelRouterOutcome : undefined;
	return {
		...(autoTier !== undefined ? { autoTier } : {}),
		...(fusionModel !== undefined ? { fusionModel } : {}),
		...(modelRouterOutcome !== undefined ? { modelRouterOutcome } : {}),
	};
}

export interface IAgentHostExecutionModeChangedEvent extends IAgentHostEventTelemetry {
	provider: string;
	agentSessionId: string;
	isSubagentSession: boolean;
	previousMode: SessionMode;
	newMode: SessionMode;
	turnCount: number;
}

export type IAgentHostExecutionModeChangedClassification = IAgentHostEventClassification & {
	provider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The provider handling the agent host session.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The agent host session identifier.' };
	isSubagentSession: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the mode change belongs to a subagent session.' };
	previousMode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The previous agent host execution mode.' };
	newMode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The new agent host execution mode.' };
	turnCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of completed turns in the agent host chat.' };
	owner: 'amunger';
	comment: 'Reports agent host execution mode changes.';
};

/** How a first-turn workspace snapshot was prepared relative to the send. */
export type AgentHostWorkspaceSnapshotPreparation = 'prepared' | 'startedAtSend' | 'directoriesChanged';

export interface IAgentHostWorkspaceSnapshotEvent {
	preparation: AgentHostWorkspaceSnapshotPreparation;
	rootCount: number;
	includedRootCount: number;
	pendingRootCount: number;
	emptyRootCount: number;
	failedRootCount: number;
	waitMs: number;
	snapshotLength: number;
}

type IAgentHostWorkspaceSnapshotClassification = {
	preparation: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the snapshot was prepared before the send, started at the send, or restarted because the turn ran in different directories.' };
	rootCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of working-directory roots the first turn runs in.' };
	includedRootCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of roots whose file-name tree was included in the first turn.' };
	pendingRootCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of roots omitted because their tree was not ready within the send wait.' };
	emptyRootCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of roots omitted because they had no visible files or are Git storage directories.' };
	failedRootCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of roots omitted because they could not be read.' };
	waitMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds the first send waited for unfinished roots.' };
	snapshotLength: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Length in characters of the file-name tree included in the first turn, or 0 when none was.' };
	owner: 'bhavyaus';
	comment: 'Reports whether the first turn of a new Copilot Agent Host conversation included its initial workspace file-name snapshot, and why roots were left out.';
};

export interface IAgentHostUserMessageSentEvent extends IAgentHostCopilotSkuTelemetry {
	provider: string;
	isOtelEnabled: boolean;
	hostLaunchKind: AgentHostLaunchKind;
	initiatorClientId: string | undefined;
	initiatorClientType: AgentHostClientType;
	initiatorConnectionKind: AgentHostClientConnectionKind;
	initiatorTransportKind: AgentHostTransportKind;
	initiatorMachineId?: string;
	initiatorDevDeviceId?: string;
	agentSessionId: string;
	chatSessionId: string;
	turnId: string;
	source: AgentHostUserMessageSentSource;
	messageOriginKind: AgentHostMessageOriginTelemetryKind;
	messageActorKind: MessageKind;
	isSubagentSession: boolean;
	turnCount: number;
	activeClientId?: string;
	activeClientToolCount?: number;
	activeClientCustomizationCount?: number;
	attachmentCount: number;
}

export type IAgentHostUserMessageSentClassification = IAgentHostCopilotSkuClassification & {
	provider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The provider handling the agent host session.' };
	isOtelEnabled: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the resolved Agent Host configuration enables OTel.' };
	hostLaunchKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the agent host process was launched by the VS Code main process or VS Code CLI.' };
	initiatorClientId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The opaque AHP client identifier that initiated the message.' };
	initiatorClientType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The type of AHP client that initiated the message.' };
	initiatorConnectionKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The route the initiating client declared it used to reach the agent host.' };
	initiatorTransportKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The physical transport on which the agent host received the initiating client action.' };
	initiatorMachineId?: { classification: 'EndUserPseudonymizedInformation'; purpose: 'FeatureInsight'; endpoint: 'MacAddressHash'; comment: 'The initiating VS Code client machine identifier.' };
	initiatorDevDeviceId?: { classification: 'EndUserPseudonymizedInformation'; purpose: 'BusinessInsight'; endpoint: 'SqmMachineId'; comment: 'The initiating VS Code client development device identifier.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The agent host session identifier.' };
	chatSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The telemetry-safe chat identifier within the owning agent host session.' };
	turnId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The admitted turn identifier, used to deduplicate sends and correlate turn outcomes.' };
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the message was sent directly or from the queued-message flow.' };
	messageOriginKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The message origin: a user, an agent (session orchestration tools such as create_session/send_message), Agent Merge, an inline session (derived from the VS Code ephemeral-session marker), a tool, an automation, or a system notification.' };
	messageActorKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The protocol message actor: user, agent, tool, automation, or systemNotification, independent of inline-session and Agent Merge classifications.' };
	isSubagentSession: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the message was sent to a subagent session.' };
	turnCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of completed turns in the session when the message was sent.' };
	activeClientId?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The identifier of the first active client for the session, if any.' };
	activeClientToolCount?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The total number of tools provided by the active clients, if any.' };
	activeClientCustomizationCount?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The total number of customizations provided by the active clients, if any.' };
	attachmentCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of attachments included with the message.' };
	owner: 'roblourens';
	comment: 'Tracks admitted turns before provider dispatch. Queued messages are counted when drained; rejected requests, steering messages, and same-turn resumes are not new sends.';
};

export type AgentHostClientConnectionAction = 'connected' | 'disconnected';

export interface IAgentHostClientConnectionEvent extends IAgentHostCopilotSkuTelemetry {
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

export type IAgentHostClientConnectionClassification = IAgentHostCopilotSkuClassification & {
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
/** How a turn's model was selected; `onDeviceDirect` is an on-device direct row, `autoOnDevice` is Auto while an on-device model is active. */
export type AgentHostModelSelectionKind = 'default' | 'auto' | 'autoOnDevice' | 'hydrafusion' | 'hydrafusionMax' | 'explicit' | 'onDeviceDirect';

/** Refines a selection kind with on-device models: direct rows are classified from their `_meta["vscode.localModel"]`, never as unknown explicit models. */
export function refineModelSelectionKindForLocalModels(kind: AgentHostModelSelectionKind, selectedModel: IAgentMetadataSource | undefined, models: readonly IAgentMetadataSource[]): AgentHostModelSelectionKind {
	if (kind === 'explicit' && readLocalModelRowMeta(selectedModel)) {
		return 'onDeviceDirect';
	}
	if (kind === 'auto' && models.some(model => readLocalModelRowMeta(model)?.active)) {
		return 'autoOnDevice';
	}
	return kind;
}
export type { AgentHostTurnFailureStage, AgentHostTurnSendStage };
export type AgentHostInitiatorClientConnectionState = 'connected' | 'disconnected' | 'unknown';
export type AgentHostProviderDiagnosticState = 'available' | 'error' | 'missingChat' | 'missingTurn' | 'unavailable' | 'unsupported';

interface IAgentHostTurnAttributedReport {
	readonly telemetryContext?: IAgentTelemetryContext;
	clientContext?: IAgentHostClientTelemetryContext;
}

export interface IAgentHostTurnCompletedEvent extends IAgentHostEventTelemetry, Partial<ICodexAccountTelemetryContext>, IAgentHostFusionTurnTelemetry {
	sdkSessionId?: string;
	originalTurnId?: string;
	steeredFromTurn?: string;
	interactionIds?: string;
	interactionIdsTruncated?: boolean;
	steeringDelivery?: IAgentTurnInteraction['steeringDelivery'];
	codexModelProvider?: CodexModelProvider;
	usedPrewarmedSession?: boolean;
	prewarmedSessionDiscardReason?: string;
	prewarmReadyAfterTurnStartMs?: number;
	prewarmReadyBeforeTurnStartMs?: number;
	prewarmLaunchCount?: number;
	prewarmWarmUpComplete?: boolean;
	prewarmSkipReason?: AgentHostPrewarmSkipReason;
	hostRootTurnOrdinal?: number;
	hostProcessAgeMs?: number;
	titleGenerationStrategy?: AutomaticTitleGenerationStrategy;
	provider: string;
	agentSessionId: string;
	chatSessionId: string;
	isSubagentSession: boolean;
	subagentKind?: AgentSubagentKind;
	turnId: string;
	parentTurnId: string | undefined;
	parentToolCallId: string | undefined;
	subagentTaskModelSource: AgentSubagentTaskModelSource | undefined;
	timeToFirstProgress: number | undefined;
	timeToFirstSubstantiveProgress: number | undefined;
	timeToFirstEdit: number | undefined;
	startedWithSteering: boolean;
	receivedSteering: boolean;
	sendStageWorkingDirectoryMs: number | undefined;
	sendStageModelSelectionMs: number | undefined;
	sendStageAttachmentsMs: number | undefined;
	sendStageContributionsMs: number | undefined;
	sendStageProviderPreparationMs: number | undefined;
	sendStageCheckpointMs: number | undefined;
	timeToProviderDispatch: number | undefined;
	providerStageQueueMs?: number;
	providerStageClientMs?: number;
	providerStageSnapshotMs?: number;
	providerStageConfigMs?: number;
	providerStageCreateMs?: number;
	providerStageFinalizeMs?: number;
	providerStagePersistMs?: number;
	providerStageRefreshMs?: number;
	providerStageTurnPrepareMs?: number;
	providerStageModelResponseMs?: number;
	totalTime: number;
	result: AgentHostTurnResult;
	model: string | TelemetryTrustedValue<string> | undefined;
	modelSelectionKind: AgentHostModelSelectionKind;
	isBYOK: boolean | undefined;
	permissionLevel: string | undefined;
	interactionMode: SessionMode | undefined;
	messageOriginKind: AgentHostMessageOriginTelemetryKind | undefined;
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

export type IAgentHostTurnCompletedClassification = IAgentHostEventClassification & CodexAccountTelemetryClassification & IAgentHostSubagentKindClassification & IAgentHostFusionTurnClassification & {
	sdkSessionId?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Provider SDK session scope for the observed interactions.' };
	originalTurnId?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Known original execution in the steering chain; absent for unresolved or unavailable lineage.' };
	steeredFromTurn?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Immediate host steering predecessor. Runtime agreement is reported separately by turnSteered.' };
	interactionIds?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'JSON array of up to 64 distinct interaction IDs observed for this execution turn.' };
	interactionIdsTruncated?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether more distinct interactions were observed than could be retained.' };
	steeringDelivery?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Provider-confirmed delivery of a host steering submission: steering, idle, queued, or unknown while confirmation is unavailable. Omitted for providers or turns without delivery tracking.' };
	codexModelProvider?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Bounded model provider actually used by a Codex turn: openai, copilot, other, or unknown.' };
	usedPrewarmedSession?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the turn claimed a provider session that was started before the first message; absent when it did not.' };
	prewarmedSessionDiscardReason?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Bounded reason the turn discarded a provider session started before the first message and launched one instead, such as modelChanged or clientToolsChanged; absent when it did not.' };
	prewarmReadyAfterTurnStartMs?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'For a turn that used a pre-warmed provider session: milliseconds after the turn started that the session became ready (0 when it was ready before), which the send spent waiting for it; absent otherwise.' };
	prewarmReadyBeforeTurnStartMs?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'For a turn that used a pre-warmed provider session: milliseconds the session had been ready before the turn started (0 when it became ready during the turn); absent otherwise.' };
	prewarmLaunchCount?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'For a turn that used a pre-warmed provider session: the warm launches of the draft, including the used one; more than one means it was warmed again, for example after a model change; absent otherwise.' };
	prewarmWarmUpComplete?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'For a turn that used a pre-warmed provider session: whether its background warm-up (MCP startup and tool initialization) had finished; absent otherwise.' };
	prewarmSkipReason?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Bounded reason the turn launched a deferred provider session without one started before the first message to claim or discard, such as disabled, expired or customizationsPending; absent otherwise.' };
	hostRootTurnOrdinal?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'One-based root-turn ordinal over the agent host process lifetime, captured at turn start and excluding subagent turns.' };
	hostProcessAgeMs?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Agent host process age in milliseconds captured at root turn start, not completion.' };
	titleGenerationStrategy?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The effective persisted automatic title generation strategy captured before sending the root turn: activeAgent, utility, deferred, or agentReview.' };
	provider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The provider handling the agent host session.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The agent host session identifier.' };
	chatSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The chat identifier within the agent host session.' };
	isSubagentSession: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the turn belongs to a subagent session.' };
	turnId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The identifier of the turn within the agent host session.' };
	parentTurnId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The immediate parent turn identifier for a subagent turn.' };
	parentToolCallId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The identifier of the tool call that spawned the subagent owning this turn; stable across resumed turns of the same subagent.' };
	subagentTaskModelSource: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Where the model input for a task-tool subagent came from: the parent agent\'s task argument, the per-subagent settings entry, the custom agent definition, or unset.' };
	timeToFirstProgress: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time in milliseconds from turn start to the first visible progress (text delta, response part, tool call start, or reasoning).' };
	timeToFirstSubstantiveProgress: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time in milliseconds from turn start to the first visible progress that advances the user request, excluding host bookkeeping such as the chat rename tool call.' };
	timeToFirstEdit: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Cumulative provider-dispatch time in milliseconds through the first accepted response that requests a built-in file edit. Excludes prompt construction, retry backoff, tool execution, confirmations, and post-response processing.' };
	startedWithSteering: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether this turn began with confirmed steering delivery when steeringDelivery is present; otherwise the provider-promoted steering classification. Time to first edit is measured per execution turn.' };
	receivedSteering: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether a steering message was submitted to this chat while this turn was active, regardless of whether the provider consumed it. Previously recorded time to first edit is preserved.' };
	sendStageWorkingDirectoryMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time in milliseconds the host spent resolving the working directory before dispatching the turn, including first-send worktree creation.' };
	sendStageModelSelectionMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time in milliseconds the host spent applying the model and agent selection on the provider before dispatching the turn.' };
	sendStageAttachmentsMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time in milliseconds the host spent resolving chat attachments before dispatching the turn.' };
	sendStageContributionsMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time in milliseconds the host spent running outgoing-turn chat contributions before dispatching the turn.' };
	sendStageProviderPreparationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time in milliseconds the host still waited on provider turn preparation before dispatching the turn, after it overlapped the earlier pre-send stages and the checkpoint capture.' };
	sendStageCheckpointMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time in milliseconds the host spent still waiting on the turn-start checkpoint before dispatching the turn, after it overlapped the earlier pre-send stages.' };
	timeToProviderDispatch: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time in milliseconds from turn start until the message was handed to the provider, covering all host pre-send stages.' };
	providerStageQueueMs?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time in milliseconds after dispatch the provider waited behind earlier operations on the same chat, before first progress.' };
	providerStageClientMs?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time in milliseconds after dispatch the provider spent acquiring or starting its SDK client, before first progress.' };
	providerStageSnapshotMs?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time in milliseconds after dispatch the provider spent resolving customization, agent and MCP state for a session launch.' };
	providerStageConfigMs?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time in milliseconds after dispatch the provider spent building the session configuration.' };
	providerStageCreateMs?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time in milliseconds after dispatch the provider SDK create or resume session call took.' };
	providerStageFinalizeMs?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time in milliseconds after dispatch the provider spent on post-create session setup.' };
	providerStagePersistMs?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time in milliseconds after dispatch the provider spent registering and persisting a newly launched session.' };
	providerStageRefreshMs?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time in milliseconds after dispatch the provider spent refreshing a live session whose configuration changed.' };
	providerStageTurnPrepareMs?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time in milliseconds after dispatch the provider spent on per-turn preparation before the SDK send.' };
	providerStageModelResponseMs?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time in milliseconds from the provider SDK send until first visible progress, or until the turn ended without progress.' };
	totalTime: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Total time in milliseconds from turn start to turn completion.' };
	result: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the turn completed successfully, with an error, or was cancelled.' };
	model: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The trusted provider model identifier selected at turn start, or a generic value for BYOK and unknown models.' };
	modelSelectionKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the turn used the provider default, Auto (autoOnDevice while an on-device model is active), HydraFusion or HydraFusion Max (hydrafusion, hydrafusionMax: the HydraFusion model, or Copilot Fusion High or Max, which is Auto at that tier), an explicit model, or an on-device model selected directly (onDeviceDirect).' };
	isBYOK: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the selected model is a bring-your-own-key model, when model context is available.' };
	permissionLevel: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The tool auto-approval level configured for the session at turn start (e.g. default, autoApprove, autopilot).' };
	interactionMode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The agent host interaction mode configured at turn start.' };
	messageOriginKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The message origin that started the turn: a user, an agent (session orchestration tools such as create_session/create_chat/send_message), Agent Merge, an inline session (derived from the VS Code ephemeral-session marker), a tool, an automation, or a system notification.' };
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

export interface IAgentHostTurnFailedEvent extends IAgentHostEventTelemetry, IAgentHostFusionTurnTelemetry {
	provider: string;
	agentSessionId: string;
	chatSessionId: string;
	isSubagentSession: boolean;
	subagentKind?: AgentSubagentKind;
	turnId: string;
	messageOriginKind: AgentHostMessageOriginTelemetryKind | undefined;
	failureStage: AgentHostTurnFailureStage;
	usedPrewarmedSession?: boolean;
	prewarmedSessionDiscardReason?: string;
	prewarmReadyAfterTurnStartMs?: number;
	prewarmReadyBeforeTurnStartMs?: number;
	prewarmLaunchCount?: number;
	prewarmWarmUpComplete?: boolean;
	prewarmSkipReason?: AgentHostPrewarmSkipReason;
	errorType: string;
	errorName: string | undefined;
	errorCode: string | undefined;
	providerCallId: string | undefined;
	serviceRequestId: string | undefined;
	msg: string;
	callstack: string | undefined;
}

export type IAgentHostTurnFailedClassification = IAgentHostEventClassification & IAgentHostSubagentKindClassification & IAgentHostFusionTurnClassification & {
	provider: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The provider handling the failed agent host turn.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The agent host session identifier.' };
	chatSessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The chat identifier within the agent host session.' };
	isSubagentSession: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the failed turn belongs to a subagent session.' };
	turnId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The identifier of the failed turn within the agent host session.' };
	messageOriginKind: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The kind of actor or host-owned session classification that started the failed turn.' };
	failureStage: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The bounded stage at which the agent host turn failed.' };
	usedPrewarmedSession?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the failed turn claimed a provider session that was started before the first message; absent when it did not.' };
	prewarmedSessionDiscardReason?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Bounded reason the failed turn discarded a provider session started before the first message and launched one instead; absent when it did not.' };
	prewarmReadyAfterTurnStartMs?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'For a turn that used a pre-warmed provider session: milliseconds after the turn started that the session became ready (0 when it was ready before), which the send spent waiting for it; absent otherwise.' };
	prewarmReadyBeforeTurnStartMs?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'For a turn that used a pre-warmed provider session: milliseconds the session had been ready before the turn started (0 when it became ready during the turn); absent otherwise.' };
	prewarmLaunchCount?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'For a turn that used a pre-warmed provider session: the warm launches of the draft, including the used one; more than one means it was warmed again, for example after a model change; absent otherwise.' };
	prewarmWarmUpComplete?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'For a turn that used a pre-warmed provider session: whether its background warm-up (MCP startup and tool initialization) had finished; absent otherwise.' };
	prewarmSkipReason?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Bounded reason the failed turn launched a deferred provider session without one started before the first message to claim or discard; absent otherwise.' };
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

export interface IAgentHostTurnCompletedReport extends IAgentHostTurnAttributedReport, IAgentHostFusionTurnTelemetry {
	turnInteraction?: IAgentTurnInteraction;
	providerTelemetryContext?: IAgentProviderTurnTelemetryContext;
	codexModelProvider?: CodexModelProvider;
	hostRootTurnOrdinal?: number;
	hostProcessAgeMs?: number;
	titleGenerationStrategy?: AutomaticTitleGenerationStrategy;
	provider: string;
	session: string;
	/** Owning session, recorded when the turn or request started. */
	owner: string;
	subagentKind?: AgentSubagentKind;
	turnId: string;
	parentTurnId: string | undefined;
	parentToolCallId: string | undefined;
	subagentTaskModelSource: AgentSubagentTaskModelSource | undefined;
	timeToFirstProgress: number | undefined;
	timeToFirstSubstantiveProgress: number | undefined;
	timeToFirstEditMs: number | undefined;
	startedWithSteering: boolean;
	receivedSteering: boolean;
	/** Elapsed time of each host pre-send stage that ran, in milliseconds. */
	sendStageDurationsMs?: ReadonlyMap<AgentHostTurnSendStage, number>;
	/** Elapsed time from turn start to provider dispatch, in milliseconds. */
	sendDispatchedMs?: number;
	/** Elapsed time of each provider stage between dispatch and first progress, in milliseconds. */
	providerStageDurationsMs?: ReadonlyMap<AgentHostProviderSendStage, number>;
	providerTimings?: readonly IAgentHostProviderTiming[];
	totalTime: number;
	result: AgentHostTurnResult;
	model: string | undefined;
	modelTelemetryKind: AgentHostModelTelemetryKind | undefined;
	modelSelectionKind: AgentHostModelSelectionKind;
	permissionLevel: string | undefined;
	interactionMode: SessionMode | undefined;
	messageOriginKind: AgentHostMessageOriginTelemetryKind | undefined;
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

type ModelCallUsageCountedEvent = {
	sdkSessionId: string;
	modelCallId: string;
	usageCountedInTurnId: string;
};

type ModelCallUsageCountedClassification = {
	owner: 'amunger';
	comment: 'Identifies the accounting turn for a Copilot root model usage report so its placement can be compared with the call owner.';
	sdkSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'SDK session containing the model call.' };
	modelCallId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'SDK API call identifier shared with model-call correlation and response telemetry.' };
	usageCountedInTurnId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Agent Host execution turn accumulating the reported root model usage.' };
};

interface IRequestTokenUsageEvent extends IAgentHostEventTelemetry, Omit<IAgentTokenUsageSummary, 'model'> {
	provider: string;
	agentSessionId: string;
	chatSessionId: string;
	requestId: string;
	parentTurnId?: string;
	parentToolCallId?: string;
	isSubagentSession: boolean;
	subagentKind?: AgentSubagentKind;
	model: string | TelemetryTrustedValue<string>;
	selectedModel?: string | TelemetryTrustedValue<string>;
	result: AgentHostTurnResult;
	usageAccountingVersion: number;
	inputTokenSemantics: 'sdkReported';
	usageRecordSource: 'sdkUsageEvent';
	reasoningEffortSource: 'sdkReported';
}

type RequestTokenUsageClassification = IAgentHostEventClassification & IAgentHostSubagentKindClassification & {
	provider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Agent provider.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Opaque owning session identifier.' };
	chatSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Opaque owning chat identifier.' };
	requestId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Host canonical owning turn identifier, not an SDK API call identifier.' };
	parentTurnId?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Parent turn of a nested request.' };
	parentToolCallId?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Tool call that owns a nested request.' };
	isSubagentSession: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether this request is a child request.' };
	model: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Observed usage model, classified through the provider model catalog. Unknown and BYOK names are redacted; missing actual models are unknown, never inferred from selection.' };
	selectedModel?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Selected request model, separately classified from the observed usage model.' };
	reasoningEffort?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Known bounded reasoning effort for these observed records.' };
	reasoningEffortSource: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Reasoning effort is reported on SDK usage events when available, never inferred from requested effort.' };
	result: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Actual terminal outcome, independent of counter availability.' };
	usageScope: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Direct model or compaction usage; descendants are separate requests.' };
	usageStatus: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Counter availability among observed records only, not delivery completeness.' };
	usageAccountingVersion: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Version 1 observed record accounting.' };
	inputTokenSemantics: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'SDK-reported input counters without adjustment; cache inclusion has not been verified.' };
	usageRecordSource: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Records are observed SDK usage events, not all fetch results or network calls.' };
	usageRecordCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Observed deduplicated usage records, not network calls.' };
	inputKnownRecordCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Records with valid input tokens.' };
	outputKnownRecordCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Records with valid output tokens.' };
	cacheKnownRecordCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Records with valid cache read tokens.' };
	knownInputTokens?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Input subtotal over valid SDK records only; omitted when unknown. Cache overlap is unverified; do not add cache tokens or assume parity with cache-inclusive totals.' };
	knownOutputTokens?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Output subtotal over valid records only; omitted when unknown.' };
	knownCacheReadTokens?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Cache read subtotal over valid records only; omitted when unknown.' };
	owner: 'roblourens';
	comment: 'Additive per-request observed provider token accounting, independent of UI and billing counters.';
};

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

/** Whether a hang reason is a legitimate wait rather than a real hang; see {@link AgentHostTurnHangReason}. */
export function isExpectedTurnHang(reason: AgentHostTurnHangReason): boolean {
	return reason === 'waitingOnUser' || reason === 'runningTool';
}

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

export interface IAgentHostTurnHungEvent extends IAgentHostEventTelemetry, Partial<ICodexAccountTelemetryContext>, IAgentHostFusionTurnTelemetry {
	provider: string;
	agentSessionId: string;
	chatSessionId: string;
	isSubagentSession: boolean;
	subagentKind?: AgentSubagentKind;
	turnId: string;
	messageOriginKind: AgentHostMessageOriginTelemetryKind | undefined;
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

export type IAgentHostTurnHungClassification = IAgentHostEventClassification & CodexAccountTelemetryClassification & IAgentHostSubagentKindClassification & IAgentHostFusionTurnClassification & {
	provider: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The provider handling the hung agent host turn.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The agent host session identifier.' };
	chatSessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The chat identifier within the agent host session.' };
	isSubagentSession: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the hung turn belongs to a subagent session.' };
	turnId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The identifier of the hung turn within the agent host session.' };
	messageOriginKind: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The kind of actor or host-owned session classification that started the hung turn.' };
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
	modelSelectionKind: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the turn used the provider default, Auto (autoOnDevice while an on-device model is active), HydraFusion or HydraFusion Max (hydrafusion, hydrafusionMax: the HydraFusion model, or Copilot Fusion High or Max, which is Auto at that tier), an explicit model, or an on-device model selected directly (onDeviceDirect).' };
	permissionLevel: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The tool auto-approval level configured for the session at turn start (e.g. default, autoApprove, autopilot).' };
	owner: 'roblourens';
	comment: 'Tracks agent host turns that stop making progress for longer than the hang threshold, so permanently stuck sessions are visible as a positive signal instead of missing turnCompleted events.';
};

export interface IAgentHostTurnHungReport extends IAgentHostTurnAttributedReport, IAgentHostFusionTurnTelemetry {
	providerTelemetryContext?: IAgentProviderTurnTelemetryContext;
	provider: string;
	session: string;
	/** Owning session, recorded when the turn or request started. */
	owner: string;
	subagentKind?: AgentSubagentKind;
	turnId: string;
	messageOriginKind: AgentHostMessageOriginTelemetryKind | undefined;
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

export interface IAgentHostHungTurnCompletedEvent extends IAgentHostEventTelemetry, IAgentHostFusionTurnTelemetry {
	provider: string;
	agentSessionId: string;
	chatSessionId: string;
	isSubagentSession: boolean;
	subagentKind?: AgentSubagentKind;
	turnId: string;
	messageOriginKind: AgentHostMessageOriginTelemetryKind | undefined;
	hangReason: AgentHostTurnHangReason;
	result: AgentHostTurnResult;
	hangReportCount: number;
	totalTimeMs: number;
	timeAfterHangMs: number;
}

export type IAgentHostHungTurnCompletedClassification = IAgentHostEventClassification & IAgentHostSubagentKindClassification & IAgentHostFusionTurnClassification & {
	provider: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The provider handling the recovered agent host turn.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The agent host session identifier.' };
	chatSessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The chat identifier within the agent host session.' };
	isSubagentSession: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the recovered turn belongs to a subagent session.' };
	turnId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The identifier of the recovered turn within the agent host session.' };
	messageOriginKind: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The kind of actor or host-owned session classification that started the recovered turn.' };
	hangReason: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The most recently reported hang reason for the turn before it completed.' };
	result: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the previously hung turn eventually completed successfully, with an error, or was cancelled.' };
	hangReportCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of hang reports emitted for the turn before it completed.' };
	totalTimeMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Total time in milliseconds from turn start to turn completion.' };
	timeAfterHangMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time in milliseconds from the most recent hang report to turn completion.' };
	owner: 'roblourens';
	comment: 'Tracks agent host turns that complete after previously being reported as hung, so permanent hangs can be separated from merely slow ones.';
};

export interface IAgentHostHungTurnCompletedReport extends IAgentHostTurnAttributedReport, IAgentHostFusionTurnTelemetry {
	provider: string;
	session: string;
	/** Owning session, recorded when the turn or request started. */
	owner: string;
	subagentKind?: AgentSubagentKind;
	turnId: string;
	messageOriginKind: AgentHostMessageOriginTelemetryKind | undefined;
	hangReason: AgentHostTurnHangReason;
	result: AgentHostTurnResult;
	hangReportCount: number;
	totalTimeMs: number;
	timeAfterHangMs: number;
}

/**
 * Why a session summary was sent: `idle` when the session had no active turn
 * for the idle timeout, `archived` when the session was, `deleted` when the
 * session was deleted, cleaned up as an ephemeral session, or moved into
 * another session, and `shutdown` when the agent host began a graceful
 * shutdown.
 */
export type AgentHostSessionSummaryReason = 'idle' | 'archived' | 'deleted' | 'shutdown';

/**
 * Totals for one session's activity period, summed from the reports behind
 * `agentHost.turnCompleted` and `agentHost.turnHung`. Token and AI credit
 * totals are `undefined` when no turn in the period reported them, and lower
 * bounds when only some did. `missingBilledNanoAiuTurnCount` counts the turns
 * missing from the AI credit totals.
 */
export interface IAgentHostSessionSummaryTotals {
	rootTurnCount: number;
	userTurnCount: number;
	subagentTurnCount: number;
	failedTurnCount: number;
	cancelledTurnCount: number;
	usageLimitFailedTurnCount: number;
	failedSubagentTurnCount: number;
	unexpectedHangTurnCount: number;
	recoveredHangTurnCount: number;
	steeredTurnCount: number;
	modelCallCount: number;
	promptTokenCount: number | undefined;
	promptCacheTokenCount: number | undefined;
	completionTokenCount: number | undefined;
	rootBilledNanoAiu: number | undefined;
	subagentBilledNanoAiu: number | undefined;
	totalBilledNanoAiu: number | undefined;
	missingBilledNanoAiuTurnCount: number;
	durationMs: number;
	activeMs: number;
}

export interface IAgentHostSessionSummaryEvent extends IAgentHostEventTelemetry, IAgentHostSessionSummaryTotals, Partial<IAgentHostSessionArtifactCounts> {
	schemaVersion: number;
	provider: string;
	agentSessionId: string;
	summaryReason: AgentHostSessionSummaryReason;
	summaryIndex: number;
	createdInHostProcess: boolean;
	multipleClientTypes: boolean;
}

export type IAgentHostSessionSummaryClassification = IAgentHostEventClassification & {
	schemaVersion: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Version of the session summary contract.' };
	provider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The provider of the first turn in the summarized period.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The agent host session identifier, the same value as agentSessionId on the other agentHost events.' };
	summaryReason: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Why the summary was sent: idle (no active turn for the idle timeout), archived, deleted (also when the session was cleaned up as ephemeral or moved into another session), or shutdown (graceful agent host shutdown).' };
	summaryIndex: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Zero-based index of this summary among the summaries this agent host process sent for the session.' };
	createdInHostProcess: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the session was created in this agent host process rather than restored from an earlier one.' };
	multipleClientTypes: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether turns in the period came from more than one known client type; a subagent turn counts as the client of the turn that started it. The initiator fields describe the earliest-started root turn with a known client type, else the earliest-started such subagent turn.' };
	rootTurnCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Root turns that completed in the period, including failed and cancelled turns.' };
	userTurnCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Completed root turns that a user message started.' };
	subagentTurnCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Subagent turns that completed in the period.' };
	failedTurnCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Root turns that ended with an error. Each also emitted agentHost.turnFailed.' };
	cancelledTurnCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Root turns that were cancelled.' };
	usageLimitFailedTurnCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Root turns in failedTurnCount that failed because a Copilot quota or rate limit was reached. Subtract it from failedTurnCount to count other failures.' };
	failedSubagentTurnCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Subagent turns that ended with an error.' };
	unexpectedHangTurnCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Root and subagent turns that agentHost.turnHung reported with an unexpected reason (noProgress or stalledAfterProgress), counted once per turn.' };
	recoveredHangTurnCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Turns in unexpectedHangTurnCount that completed later in the same period.' };
	steeredTurnCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Completed root turns during which at least one steering message was submitted.' };
	modelCallCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Completed upstream model responses across root and subagent turns. Each turn counts only its own responses, so nothing is counted twice.' };
	promptTokenCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Input tokens summed over root and subagent turns, each turn counting only its own calls; absent when no turn reported them.' };
	promptCacheTokenCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Input tokens read from cache, summed over root and subagent turns, each turn counting only its own calls; absent when no turn reported them.' };
	completionTokenCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Output tokens summed over root and subagent turns, each turn counting only its own calls; absent when no turn reported them.' };
	rootBilledNanoAiu: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'AI credits in nano-AIU billed directly to root turns, excluding their subagent calls; absent when no root turn reported it.' };
	subagentBilledNanoAiu: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'AI credits in nano-AIU billed directly to subagent turns; absent when no subagent turn reported it.' };
	totalBilledNanoAiu: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'rootBilledNanoAiu plus subagentBilledNanoAiu; absent when neither was reported, and a lower bound when missingBilledNanoAiuTurnCount is above zero.' };
	missingBilledNanoAiuTurnCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Completed root and subagent turns that made model calls but reported no AI credit usage, so they are missing from the AI credit totals.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds from the first observed turn start to the last observed turn end or hang report in the period.' };
	activeMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Sum of root turn durations in milliseconds. Concurrent root turns in different chats each count.' };
	artifactCount?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Artifacts of every kind recorded across the session\'s chats when the summary was sent. This and the other artifact counts are absent when the session\'s state was no longer loaded, such as after deletion.' };
	referenceCount?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'References of every kind recorded across the session\'s chats when the summary was sent.' };
	pullRequestArtifactCount?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Pull requests recorded as artifacts when the summary was sent.' };
	pullRequestReferenceCount?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Pull requests recorded as references when the summary was sent.' };
	issueArtifactCount?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Issues recorded as artifacts when the summary was sent.' };
	issueReferenceCount?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Issues recorded as references when the summary was sent.' };
	ownPullRequestCount?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Distinct pull requests the host found for the session\'s own branches when the summary was sent, excluding ones a folder-isolated session started with. The baseline for whether the session\'s own pull requests were recorded.' };
	ownPullRequestArtifactCount?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Pull requests in ownPullRequestCount recorded as an artifact.' };
	ownPullRequestReferenceCount?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Pull requests in ownPullRequestCount recorded only as a reference. The remaining own pull requests were not recorded.' };
	owner: 'Giuspepe';
	comment: 'One summary per agent host session and activity period, summing the turn telemetry so per-session metrics need no event joins.';
};

export interface IAgentHostSessionSummaryReport {
	readonly clientContext: IAgentHostClientTelemetryContext | undefined;
	readonly telemetryContext: IAgentTelemetryContext | undefined;
	readonly provider: string;
	/** The root session the summary describes. */
	readonly session: string;
	readonly summaryReason: AgentHostSessionSummaryReason;
	readonly summaryIndex: number;
	readonly createdInHostProcess: boolean;
	readonly multipleClientTypes: boolean;
	readonly totals: IAgentHostSessionSummaryTotals;
	/** Absent when the session's state is no longer loaded. */
	readonly artifacts: IAgentHostSessionArtifactCounts | undefined;
}

/**
 * What the session had recorded when its summary was sent, counted across its
 * chats. The own pull request counts compare what was recorded with the pull
 * requests the host found for the session's own branches.
 */
export interface IAgentHostSessionArtifactCounts {
	artifactCount: number;
	referenceCount: number;
	pullRequestArtifactCount: number;
	pullRequestReferenceCount: number;
	issueArtifactCount: number;
	issueReferenceCount: number;
	ownPullRequestCount: number;
	ownPullRequestArtifactCount: number;
	ownPullRequestReferenceCount: number;
}

/** What recorded an artifact or reference: the agent's tool, or the Create Pull Request action. */
export type AgentHostArtifactRecordingSource = 'agentTool' | 'createPullRequestAction';

/** Who removed an artifact or reference: the agent's tool, or the user from the chat. */
export type AgentHostArtifactRemovalInitiator = 'agentTool' | 'user';

export interface IAgentHostArtifactRecordedReport extends IAgentHostTurnAttributedReport {
	readonly provider: string | undefined;
	/** The session that owns the chat the entry was recorded in. */
	readonly session: string;
	/** The chat the entry was recorded in. */
	readonly chat: string;
	readonly turnId: string | undefined;
	readonly toolCallId: string | undefined;
	readonly source: AgentHostArtifactRecordingSource;
	readonly kind: SessionArtifactType;
	/** The classification requested; an existing artifact is never downgraded to a reference. */
	readonly isArtifact: boolean;
	readonly outcome: SessionArtifactAddOutcome;
	readonly isGitHub: boolean;
	readonly batchSize: number;
}

type IAgentHostArtifactRecordedEvent = IAgentHostEventTelemetry & {
	provider: string;
	agentSessionId: string;
	turnId: string | undefined;
	toolCallId: string | undefined;
	source: AgentHostArtifactRecordingSource;
	kind: SessionArtifactType;
	category: 'artifact' | 'reference';
	outcome: SessionArtifactAddOutcome;
	isGitHub: boolean;
	batchSize: number;
};

type IAgentHostArtifactRecordedClassification = IAgentHostEventClassification & {
	owner: 'benibenj';
	comment: 'One event per artifact or reference that an agent or the Create Pull Request action records on an agent host session, to measure what gets recorded and how it is classified.';
	provider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The agent host provider of the session, or unknown.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The agent host session identifier, the same value as agentSessionId on the other agentHost events.' };
	turnId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The turn the agent recorded the entry in; absent for the Create Pull Request action.' };
	toolCallId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The tool call that recorded the entry, matching agentHost.toolInvoked; absent for the Create Pull Request action.' };
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'What recorded the entry: agentTool (add_artifact_or_reference) or createPullRequestAction.' };
	kind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Kind of the entry: pullRequest, issue, commit, website, file or resource.' };
	category: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the entry was requested as an artifact or a reference. An existing artifact is never downgraded, so with outcome alreadyRecorded the stored entry can be an artifact.' };
	outcome: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'What recording did: added a new entry, promoted an existing reference to an artifact, modeUpdated how the chat shows an existing entry, or alreadyRecorded.' };
	isGitHub: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the entry is a pull request or issue on GitHub, which artifact integrations can act on.' };
	batchSize: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of entries recorded by the same call.' };
};

export interface IAgentHostArtifactRemovedReport extends IAgentHostTurnAttributedReport {
	readonly provider: string | undefined;
	readonly session: string;
	/** The chat the agent removed the entry from; absent when the user removed it. */
	readonly chat: string | undefined;
	readonly turnId: string | undefined;
	readonly toolCallId: string | undefined;
	readonly initiator: AgentHostArtifactRemovalInitiator;
	readonly kind: SessionArtifactType;
	readonly isArtifact: boolean;
	readonly isGitHub: boolean;
}

type IAgentHostArtifactRemovedEvent = IAgentHostEventTelemetry & {
	provider: string;
	agentSessionId: string;
	turnId: string | undefined;
	toolCallId: string | undefined;
	initiator: AgentHostArtifactRemovalInitiator;
	kind: SessionArtifactType;
	category: 'artifact' | 'reference';
	isGitHub: boolean;
};

type IAgentHostArtifactRemovedClassification = IAgentHostEventClassification & {
	owner: 'benibenj';
	comment: 'One event per artifact or reference removed from an agent host session, to measure how often recorded entries are removed again and by whom.';
	provider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The agent host provider of the session, or unknown.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The agent host session identifier, the same value as agentSessionId on the other agentHost events.' };
	turnId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The turn the agent removed the entry in; absent when the user removed it.' };
	toolCallId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The tool call that removed the entry, matching agentHost.toolInvoked; absent when the user removed it.' };
	initiator: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Who removed the entry: agentTool (remove_artifact_or_reference) or user.' };
	kind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Kind of the removed entry: pullRequest, issue, commit, website, file or resource.' };
	category: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the removed entry was an artifact or a reference.' };
	isGitHub: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the removed entry is a pull request or issue on GitHub.' };
};

type IAgentHostLanguageModelToolInvokedEvent = LanguageModelToolInvokedEvent & IAgentHostEventTelemetry & {
	mcpSourceKind?: McpServerSource;
};

type IAgentHostLanguageModelToolInvokedClassification = LanguageModelToolInvokedClassification & IAgentHostEventClassification & {
	mcpSourceKind?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Configuration source of an MCP tool: user, workspace, plugin, builtin, managed, or account. Managed MCP tools include Copilot connectors.' };
};

export interface IAgentHostToolInvokedReport extends IAgentHostTurnAttributedReport {
	provider: string;
	session: string;
	/** Owning session, recorded when the turn or request started. */
	owner: string;
	subagentKind?: AgentSubagentKind;
	turnId: string;
	toolId: string;
	toolSourceKind: string;
	mcpSourceKind: McpServerSource | undefined;
	toolCallId: string;
	result: ToolInvokedResult;
	invocationTimeMs?: number;
	resultSizeInCharacters: number;
	model: string | undefined;
	modelTelemetryKind: AgentHostModelTelemetryKind | undefined;
	errorCode: string | undefined;
}

export type IAgentHostToolInvokedEvent = LanguageModelToolInvokedEvent & IAgentHostEventTelemetry & {
	provider: string;
	agentSessionId: string;
	chatSessionId: string;
	isSubagentSession: boolean;
	subagentKind?: AgentSubagentKind;
	errorCode: string | undefined;
	mcpSourceKind?: McpServerSource;
};

export type IAgentHostToolInvokedClassification = Omit<LanguageModelToolInvokedClassification, 'provider' | 'chatSessionId' | 'toolId' | 'toolSourceKind' | 'owner' | 'comment'> & IAgentHostEventClassification & IAgentHostSubagentKindClassification & {
	toolId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The ID of the tool used; for a tool the session does not offer (toolSourceKind unknown), a SHA-256 hash of the requested name.' };
	toolSourceKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Who provides the tool: agentHost, mcp, client, or unknown (a tool the session does not offer).' };
	provider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The Agent Host provider that invoked the tool.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The Agent Host session identifier.' };
	chatSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The chat identifier within the Agent Host session.' };
	isSubagentSession: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the tool call belongs to a subagent session.' };
	mcpSourceKind?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Configuration source of an MCP tool: user, workspace, plugin, builtin, managed, or account. Managed MCP tools include Copilot connectors.' };
	errorCode: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'The tool failure code, when available; toolNotFound when the session does not offer the tool.' };
	owner: 'roblourens';
	comment: 'Tracks Agent Host tool invocations with Agent Host correlation and optional failure codes.';
};

export interface IAgentHostAskQuestionsToolInvokedEvent extends IAgentHostEventTelemetry {
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
	subagentKind?: AgentSubagentKind;
}

export type IAgentHostAskQuestionsToolInvokedClassification = IAgentHostEventClassification & IAgentHostSubagentKindClassification & {
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
	/** Owning session, recorded when the turn or request started. */
	owner: string;
	subagentKind?: AgentSubagentKind;
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

export interface IAgentHostToolCallDetailsEvent extends IAgentHostEventTelemetry {
	provider: string;
	agentSessionId: string;
	chatSessionId: string;
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

export type IAgentHostToolCallDetailsClassification = IAgentHostEventClassification & {
	provider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The provider handling the agent host session.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The agent host session identifier.' };
	chatSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The hashed chat identifier, scoped to agentSessionId.' };
	isSubagentSession: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the tool-call aggregate belongs to a subagent session.' };
	conversationId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The agent host session identifier, retained for compatibility.' };
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
	/** Owning session, recorded when the turn or request started. */
	owner: string;
	chat: string;
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
	/** Owning session, recorded when the turn or request started. */
	owner: string;
	turnId: string;
	toolId: string;
	toolSourceKind: string;
	confirmKind: AgentHostToolApprovalConfirmKind;
	decisionSource?: string;
	permissionResult?: string;
	confirmationNotNeededReason: string | undefined;
	requestUnsandboxedExecution: boolean | undefined;
}

type AgentHostToolApprovalConfirmKind = 'userAction' | 'setting' | 'confirmationNotNeeded' | 'denied' | 'unknown';

export interface IAgentHostToolApprovalEvent extends IAgentHostEventTelemetry {
	provider: string;
	agentSessionId: string;
	isSubagentSession: boolean;
	chatSessionId: string;
	requestId: string;
	toolId: string;
	toolExtensionId: string | undefined;
	toolSourceKind: string;
	confirmKind: AgentHostToolApprovalConfirmKind;
	decisionSource?: string;
	permissionResult?: string;
	approvalTelemetryVersion: number;
	settingId: string | undefined;
	lmServiceScope: string | undefined;
	customButtonKind: string | undefined;
	confirmationNotNeededReason: string | undefined;
	sandboxWrapped: boolean | undefined;
	requestUnsandboxedExecution: boolean | undefined;
}

export type IAgentHostToolApprovalClassification = IAgentHostEventClassification & LanguageModelToolApprovalClassification & {
	decisionSource?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'SDK permission decision source. human_response is explicit human attribution; missing is unattributed, not human.' };
	permissionResult?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'SDK permission result category, distinguishing rule, hook, policy, cancellation and unavailable-responder outcomes.' };
	approvalTelemetryVersion: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Version of the approval classification. Version 2 requires explicit human attribution for userAction.' };
	provider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The provider handling the agent host session.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The agent host session identifier.' };
	isSubagentSession: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the tool approval belongs to a subagent session.' };
};

export interface IAgentHostAutoModeRouterDecisionReport {
	session: string;
	chat: string;
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

const skillInvocationTriggers: ReadonlySet<string> = new Set(['agent-invoked', 'user-invoked', 'context-load']);

export interface IAgentHostSkillInvokedReport extends IAgentHostTurnAttributedReport {
	provider: string;
	session: string;
	/** Owning session, recorded when the turn or request started. */
	owner: string;
	/** The root turn the invocation belongs to; for a subagent, the turn it (or its spawning subagent) was invoked in. */
	turnId: string | undefined;
	/** The SDK `skill.invoked` event id; equals `event_id` on the forwarded `copilotSdk/skill_invoked`. */
	sdkEventId: string;
	trigger: string | undefined;
	isSubagentInvocation: boolean;
	/** Where the runtime discovered the skill, bounded to its known values. */
	skillSource: string;
	/** Who shipped the skill: `vscode`, `runtime`, or `other`. */
	skillOrigin: string;
	/** The skill name, only when VS Code or the bundled runtime shipped the skill. */
	skillName: string | undefined;
}

type IAgentHostSkillInvokedEvent = IAgentHostEventTelemetry & {
	provider: string;
	agentSessionId: string;
	chatSessionId: string;
	turnId: string | undefined;
	sdkEventId: string;
	trigger: string;
	isSubagentInvocation: boolean;
	skillSource: string;
	skillOrigin: string;
	skillName: string | undefined;
};

type IAgentHostSkillInvokedClassification = IAgentHostEventClassification & {
	owner: 'bhavyaus';
	comment: 'Records what triggered each agent host skill invocation and where the skill came from, to tell skills the agent chose apart from skills the user ran and to measure built-in skills. Names only skills that VS Code or the bundled Copilot runtime ship; other skills are identified by hash on copilotSdk/skill_invoked, joined by sdkEventId.';
	provider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The agent host provider that invoked the skill.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The agent host session identifier.' };
	chatSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The chat identifier within the agent host session; the subagent chat for subagent invocations.' };
	turnId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The root turn the invocation belongs to; for a subagent, the turn it or its spawning subagent was invoked in, even after that turn ends.' };
	sdkEventId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The SDK skill invocation event identifier; equals event_id on copilotSdk/skill_invoked.' };
	trigger: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'What triggered the invocation: agent-invoked (the model chose the skill), user-invoked (slash command or UI), context-load (preloaded by a custom agent or subagent), or unknown.' };
	isSubagentInvocation: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether a subagent, rather than the main agent, invoked the skill.' };
	skillSource: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Where the runtime discovered the skill: project, inherited, personal-copilot, personal-agents, custom, plugin, builtin, remote, sdk, mcp, other, or unknown.' };
	skillOrigin: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Who shipped the skill: vscode (installed with VS Code or served by the agent host), runtime (built into the Copilot runtime or one of its bundled plugins), or other.' };
	skillName: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Name of a skill that VS Code or the bundled Copilot runtime ship. Absent for every other skill, whose name could identify a user.' };
};

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

export interface IAgentHostToolCallStalledEvent extends IAgentHostEventTelemetry {
	provider: string;
	agentSessionId: string;
	isSubagentSession: boolean;
	subagentKind?: AgentSubagentKind;
	blockerKind: SessionInputRequestKind.ToolConfirmation | SessionInputRequestKind.ToolClientExecution | SessionInputRequestKind.ToolAuthentication;
	toolCallId: string;
	toolId: string;
	toolSourceKind: string;
	executorClientConnectionState: AgentHostExecutorClientConnectionState | undefined;
	stalledTimeMs: number;
}

export type AgentHostExecutorClientConnectionState = 'connected' | 'disconnected' | 'unknown';

export type IAgentHostToolCallStalledClassification = IAgentHostEventClassification & IAgentHostSubagentKindClassification & {
	provider: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The provider handling the stalled agent host tool call.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The agent host session identifier.' };
	isSubagentSession: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the stalled tool call belongs to a subagent session.' };
	blockerKind: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the tool call is waiting for confirmation or client execution.' };
	toolCallId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The tool call identifier, matching agentHost.toolInvoked and the eventual stalled completion event.' };
	toolId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The identifier of the stalled tool.' };
	toolSourceKind: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the stalled tool is provided by the agent host, an MCP server, or a client.' };
	executorClientConnectionState: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the delegated executor client was connected when a client-execution stall was reported; unknown when the client had not been observed and omitted for other blocker kinds.' };
	stalledTimeMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time in milliseconds that the tool call has remained blocked.' };
	owner: 'roblourens';
	comment: 'Tracks agent host tool calls that remain blocked beyond the stall threshold.';
};

export interface IAgentHostToolCallStalledReport extends IAgentHostTurnAttributedReport {
	provider: string;
	session: string;
	/** Owning session, recorded when the turn or request started. */
	owner: string;
	subagentKind?: AgentSubagentKind;
	blockerKind: SessionInputRequestKind.ToolConfirmation | SessionInputRequestKind.ToolClientExecution | SessionInputRequestKind.ToolAuthentication;
	toolCallId: string;
	toolId: string;
	toolSourceKind: string;
	executorClientConnectionState: AgentHostExecutorClientConnectionState | undefined;
	stalledTimeMs: number;
}

export interface IAgentHostStalledToolCallCompletedEvent extends IAgentHostEventTelemetry {
	provider: string;
	agentSessionId: string;
	isSubagentSession: boolean;
	subagentKind?: AgentSubagentKind;
	blockerKind: SessionInputRequestKind.ToolConfirmation | SessionInputRequestKind.ToolClientExecution | SessionInputRequestKind.ToolAuthentication;
	toolCallId: string;
	toolId: string;
	toolSourceKind: string;
	executorClientConnectionState: AgentHostExecutorClientConnectionState | undefined;
	result: ToolInvokedResult;
	totalTimeMs: number;
	timeAfterStallMs: number;
}

export type IAgentHostStalledToolCallCompletedClassification = IAgentHostEventClassification & IAgentHostSubagentKindClassification & {
	provider: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The provider handling the completed agent host tool call.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The agent host session identifier.' };
	isSubagentSession: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the completed tool call belongs to a subagent session.' };
	blockerKind: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the tool call had stalled waiting for confirmation or client execution.' };
	toolCallId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The tool call identifier, matching the originating stall and agentHost.toolInvoked events.' };
	toolId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The identifier of the completed tool.' };
	toolSourceKind: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the completed tool is provided by the agent host, an MCP server, or a client.' };
	executorClientConnectionState: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The delegated executor client connection state captured when the client-execution stall was reported; omitted for other blocker kinds.' };
	result: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the stalled tool call eventually completed successfully, with an error, or through user cancellation.' };
	totalTimeMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Total time in milliseconds from tool call start to completion.' };
	timeAfterStallMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time in milliseconds from the stall report to tool call completion.' };
	owner: 'roblourens';
	comment: 'Tracks agent host tool calls that complete after previously exceeding the stall threshold.';
};

export interface IAgentHostStalledToolCallCompletedReport extends IAgentHostTurnAttributedReport {
	provider: string;
	session: string;
	/** Owning session, recorded when the turn or request started. */
	owner: string;
	subagentKind?: AgentSubagentKind;
	blockerKind: SessionInputRequestKind.ToolConfirmation | SessionInputRequestKind.ToolClientExecution | SessionInputRequestKind.ToolAuthentication;
	toolCallId: string;
	toolId: string;
	toolSourceKind: string;
	executorClientConnectionState: AgentHostExecutorClientConnectionState | undefined;
	result: ToolInvokedResult;
	totalTimeMs: number;
	timeAfterStallMs: number;
}

interface IProviderStageMeasurements {
	providerStageQueueMs?: number;
	providerStageClientMs?: number;
	providerStageSnapshotMs?: number;
	providerStageConfigMs?: number;
	providerStageCreateMs?: number;
	providerStageFinalizeMs?: number;
	providerStagePersistMs?: number;
	providerStageRefreshMs?: number;
	providerStageTurnPrepareMs?: number;
	providerStageModelResponseMs?: number;
}

const providerStageMeasurementKeys: { readonly [K in AgentHostProviderSendStage]: keyof IProviderStageMeasurements } = {
	queue: 'providerStageQueueMs',
	client: 'providerStageClientMs',
	snapshot: 'providerStageSnapshotMs',
	config: 'providerStageConfigMs',
	create: 'providerStageCreateMs',
	finalize: 'providerStageFinalizeMs',
	persist: 'providerStagePersistMs',
	refresh: 'providerStageRefreshMs',
	turnPrepare: 'providerStageTurnPrepareMs',
	modelResponse: 'providerStageModelResponseMs',
};

/** Projects observed provider stages to measurements, omitting stages that never ran. */
function toProviderStageMeasurements(durations: ReadonlyMap<AgentHostProviderSendStage, number> | undefined): IProviderStageMeasurements {
	const result: IProviderStageMeasurements = {};
	for (const [stage, ms] of durations ?? []) {
		result[providerStageMeasurementKeys[stage]] = ms;
	}
	return result;
}

/** Projects whether a turn used a pre-warmed provider session, why it discarded one, or why it found none to claim, omitting each when absent. */
function prewarmedSessionTelemetry(context: IAgentProviderTurnTelemetryContext | undefined): Pick<IAgentProviderTurnTelemetryContext, 'usedPrewarmedSession' | 'prewarmedSessionDiscardReason' | 'prewarmSkipReason' | 'prewarmReadyAfterTurnStartMs' | 'prewarmReadyBeforeTurnStartMs' | 'prewarmLaunchCount' | 'prewarmWarmUpComplete'> {
	return {
		...(context?.usedPrewarmedSession ? { usedPrewarmedSession: true } : {}),
		...(context?.prewarmedSessionDiscardReason !== undefined ? { prewarmedSessionDiscardReason: context.prewarmedSessionDiscardReason } : {}),
		...(context?.prewarmSkipReason !== undefined ? { prewarmSkipReason: context.prewarmSkipReason } : {}),
		...(context?.prewarmReadyAfterTurnStartMs !== undefined ? { prewarmReadyAfterTurnStartMs: context.prewarmReadyAfterTurnStartMs } : {}),
		...(context?.prewarmReadyBeforeTurnStartMs !== undefined ? { prewarmReadyBeforeTurnStartMs: context.prewarmReadyBeforeTurnStartMs } : {}),
		...(context?.prewarmLaunchCount !== undefined ? { prewarmLaunchCount: context.prewarmLaunchCount } : {}),
		...(context?.prewarmWarmUpComplete !== undefined ? { prewarmWarmUpComplete: context.prewarmWarmUpComplete } : {}),
	};
}

export function toTelemetryModel(model: string | undefined, modelTelemetryKind: AgentHostModelTelemetryKind | undefined): 'byokModel' | 'unknown' | TelemetryTrustedValue<string> | undefined {
	if (model === undefined) {
		return undefined;
	}
	if (modelTelemetryKind === 'trusted') {
		return new TelemetryTrustedValue(normalizeModelRouterTelemetryId(model));
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

export function toSubagentKindTelemetry(isSubagent: boolean, kind: AgentSubagentKind | undefined): { subagentKind?: AgentSubagentKind } {
	return isSubagent ? { subagentKind: kind ?? 'task' } : {};
}

const INLINE_REASONING_TAGS = [
	{ open: '<think>', close: '</think>' },
	{ open: '<thinking>', close: '</thinking>' },
	{ open: '<analysis>', close: '</analysis>' },
] as const;

interface IStructuredModelMessageText {
	readonly role: 'assistant';
	readonly content: string;
	readonly reasoning_text?: string;
}

function parseFenceMarker(text: string, lineStart: number): { char: string; length: number; lineEnd: number } | undefined {
	let i = lineStart;
	while (i < text.length && (text[i] === ' ' || text[i] === '\t')) {
		i++;
	}
	const ch = text[i];
	if (ch !== '`' && ch !== '~') {
		return undefined;
	}
	let end = i;
	while (end < text.length && text[end] === ch) {
		end++;
	}
	const length = end - i;
	if (length < 3) {
		return undefined;
	}
	const nl = text.indexOf('\n', end);
	const lineEnd = nl === -1 ? text.length : nl + 1;
	return { char: ch, length, lineEnd };
}

function isClosingFenceLine(text: string, lineStart: number, fenceChar: string, fenceLength: number): number | undefined {
	let i = lineStart;
	while (i < text.length && (text[i] === ' ' || text[i] === '\t')) {
		i++;
	}
	if (text[i] !== fenceChar) {
		return undefined;
	}
	let end = i;
	while (end < text.length && text[end] === fenceChar) {
		end++;
	}
	if (end - i < fenceLength) {
		return undefined;
	}
	while (end < text.length && (text[end] === ' ' || text[end] === '\t' || text[end] === '\r')) {
		end++;
	}
	if (end === text.length) {
		return text.length;
	}
	return text[end] === '\n' ? end + 1 : undefined;
}

function extractInlineReasoning(text: string): { content: string; reasoningText: string | undefined } {
	let pos = 0;
	let chunkStart = 0;
	let atLineStart = true;
	let activeFence: { char: string; length: number } | undefined;
	let foundTag = false;
	let hasNonWhitespaceContent = false;
	let nextThink = text.indexOf('<think', 0);
	let nextAnalysis = text.indexOf('<analysis>', 0);
	let nextNewline = text.indexOf('\n', 0);
	const contentParts: string[] = [];
	const reasoningParts: string[] = [];

	while (pos < text.length) {
		if (atLineStart) {
			if (activeFence) {
				const closedEnd = isClosingFenceLine(text, pos, activeFence.char, activeFence.length);
				if (closedEnd !== undefined) {
					activeFence = undefined;
					pos = closedEnd;
					atLineStart = true;
					continue;
				}
				if (nextNewline !== -1 && nextNewline < pos) {
					nextNewline = text.indexOf('\n', pos);
				}
				if (nextNewline === -1) {
					break;
				}
				pos = nextNewline + 1;
				atLineStart = true;
				continue;
			}
			const fence = parseFenceMarker(text, pos);
			if (fence) {
				activeFence = { char: fence.char, length: fence.length };
				pos = fence.lineEnd;
				atLineStart = true;
				continue;
			}
		}

		if (nextThink !== -1 && nextThink < pos) {
			nextThink = text.indexOf('<think', pos);
		}
		if (nextAnalysis !== -1 && nextAnalysis < pos) {
			nextAnalysis = text.indexOf('<analysis>', pos);
		}
		const nextTag = nextThink === -1
			? nextAnalysis
			: nextAnalysis === -1
				? nextThink
				: Math.min(nextThink, nextAnalysis);
		if (nextTag === -1) {
			break;
		}
		if (nextNewline !== -1 && nextNewline < pos) {
			nextNewline = text.indexOf('\n', pos);
		}
		if (nextNewline !== -1 && nextNewline < nextTag) {
			pos = nextNewline + 1;
			atLineStart = true;
			continue;
		}

		const matchedTag = INLINE_REASONING_TAGS.find(tag => text.startsWith(tag.open, nextTag));
		if (!matchedTag) {
			pos = nextTag + 1;
			atLineStart = false;
			continue;
		}

		foundTag = true;
		const before = text.slice(chunkStart, nextTag);
		if (before.length > 0 && (hasNonWhitespaceContent || before.trim().length > 0)) {
			contentParts.push(before);
			hasNonWhitespaceContent = true;
		}

		const innerStart = nextTag + matchedTag.open.length;
		const closeIdx = text.indexOf(matchedTag.close, innerStart);
		if (closeIdx === -1) {
			const inner = text.slice(innerStart).trim();
			if (inner) {
				reasoningParts.push(inner);
			}
			chunkStart = text.length;
			pos = text.length;
			break;
		}

		const inner = text.slice(innerStart, closeIdx).trim();
		if (inner) {
			reasoningParts.push(inner);
		}
		let afterClose = closeIdx + matchedTag.close.length;
		if (contentParts.length === 0) {
			let scan = afterClose;
			let lastNewlineEnd = -1;
			while (scan < text.length && (text[scan] === ' ' || text[scan] === '\t' || text[scan] === '\r' || text[scan] === '\n')) {
				if (text[scan] === '\n') {
					lastNewlineEnd = scan + 1;
				}
				scan++;
			}
			// Preserve leading indentation when a newline separates the closing tag from the
			// answer so indented fenced code blocks retain both indentation and line-start state.
			afterClose = lastNewlineEnd !== -1 ? lastNewlineEnd : scan;
		}
		chunkStart = afterClose;
		pos = afterClose;
		atLineStart = contentParts.length === 0 || pos === 0 || text[pos - 1] === '\n';
	}

	if (!foundTag) {
		return { content: text, reasoningText: undefined };
	}
	if (chunkStart < text.length) {
		contentParts.push(text.slice(chunkStart));
	}
	return {
		content: contentParts.join(''),
		reasoningText: reasoningParts.length > 0 ? reasoningParts.join('\n\n') : undefined,
	};
}

/**
 * Formats assistant text for restricted `conversation.messageText` telemetry into a
 * structured `{ role, content, reasoning_text? }` JSON payload.
 *
 * Uses a native substring scan fast path so messages without inline reasoning tags skip
 * line/fence parsing. Both closed and unclosed `<think>`, `<thinking>`, and `<analysis>`
 * blocks outside fenced code blocks are extracted into `reasoning_text` in linear time.
 */
export function formatModelMessageTextForTelemetry(content: string, wireReasoningText?: string): string {
	const trimmedWireReasoning = wireReasoningText?.trim();
	if (content.indexOf('<think') === -1 && content.indexOf('<analysis>') === -1) {
		const payload: IStructuredModelMessageText = trimmedWireReasoning
			? { role: 'assistant', content, reasoning_text: trimmedWireReasoning }
			: { role: 'assistant', content };
		return JSON.stringify(payload);
	}

	const extracted = extractInlineReasoning(content);
	const reasoningParts: string[] = [];
	if (trimmedWireReasoning) {
		reasoningParts.push(trimmedWireReasoning);
	}
	if (extracted.reasoningText) {
		reasoningParts.push(extracted.reasoningText);
	}
	const reasoningText = reasoningParts.length > 0 ? reasoningParts.join('\n\n') : undefined;
	const payload: IStructuredModelMessageText = reasoningText
		? { role: 'assistant', content: extracted.content, reasoning_text: reasoningText }
		: { role: 'assistant', content: extracted.content };
	return JSON.stringify(payload);
}

export class AgentHostTelemetryReporter {

	declare readonly _serviceBrand: undefined;

	constructor(
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IAgentHostOTelService private readonly _otelService: IAgentHostOTelService = NullAgentHostOTelService,
	) { }

	/** The restricted GH/MSFT telemetry surface, present when the agent-host telemetry service is wired. */
	private get _restricted(): IAgentHostRestrictedTelemetry | undefined {
		const ts = this._telemetryService as Partial<IAgentHostRestrictedTelemetry>;
		return typeof ts.sendEnhancedGHTelemetryEvent === 'function' ? ts as IAgentHostRestrictedTelemetry : undefined;
	}

	private _copilotTelemetryContext(provider: string): IAgentHostCopilotSkuTelemetry {
		return isAgentHostTelemetryService(this._telemetryService) ? toCopilotTelemetryData(this._telemetryService.getCopilotTelemetryContext(provider)) ?? {} : {};
	}

	executionModeChanged(provider: string, session: string, previousMode: SessionMode, newMode: SessionMode, turnCount: number, clientContext?: IAgentHostClientTelemetryContext): void {
		this._telemetryService.publicLog2<IAgentHostExecutionModeChangedEvent, IAgentHostExecutionModeChangedClassification>('agentHost.executionModeChanged', {
			...toInitiatorTelemetry(clientContext),
			...this._copilotTelemetryContext(provider),
			provider,
			agentSessionId: AgentSession.id(session),
			isSubagentSession: isSubagentSession(session),
			previousMode,
			newMode,
			turnCount,
		});
	}

	workspaceSnapshotSent(event: IAgentHostWorkspaceSnapshotEvent): void {
		this._telemetryService.publicLog2<IAgentHostWorkspaceSnapshotEvent, IAgentHostWorkspaceSnapshotClassification>('agentHost.workspaceSnapshot', event);
	}

	canvasOpened(provider: string, session: string, source: string | undefined, clientContext: IAgentHostClientTelemetryContext | undefined): void {
		const extensionSource = source === 'project' || source === 'user' || source === 'plugin' || source === 'session' ? source : 'unknown';
		this._telemetryService.publicLog2<CanvasOpenedEvent, CanvasOpenedClassification>('agentHost.canvasOpened', {
			...toInitiatorTelemetry(clientContext),
			...this._copilotTelemetryContext(provider),
			schemaVersion: 1,
			provider,
			agentSessionId: AgentSession.id(session),
			extensionSource,
		});
	}

	canvasExtensionsReady(event: ICanvasExtensionsReadyEvent): void {
		this._telemetryService.publicLog2<ICanvasExtensionsReadyEvent, CanvasExtensionsReadyClassification>('agentHost.canvasExtensionsReady', event);
	}

	canvasHostOpen(event: ICanvasHostOpenEvent): void {
		this._telemetryService.publicLog2<ICanvasHostOpenEvent, CanvasHostOpenClassification>('agentHost.canvasHostOpen', event);
	}

	userMessageSent(provider: string, clientId: string | undefined, clientContext: IAgentHostClientTelemetryContext, session: string, owner: string, turnId: string, sessionState: ISessionWithDefaultChat | undefined, source: AgentHostUserMessageSentSource, message: Message, isEphemeralSession: boolean, isSubagentChat: boolean): void {
		const telemetryContext = this._copilotTelemetryContext(provider);
		const attachmentCount = message.attachments?.length ?? 0;
		const activeClients = sessionState?.activeClients ?? [];
		const sessionUri = owner;
		this._telemetryService.publicLog2<IAgentHostUserMessageSentEvent, IAgentHostUserMessageSentClassification>('agentHost.userMessageSent', {
			...telemetryContext,
			provider,
			isOtelEnabled: this._otelService.enabled,
			hostLaunchKind: clientContext.hostLaunchKind,
			initiatorClientId: clientId,
			initiatorClientType: clientContext.clientType,
			initiatorConnectionKind: clientContext.connectionKind,
			initiatorTransportKind: clientContext.transportKind,
			...(clientContext.machineId ? { initiatorMachineId: clientContext.machineId } : {}),
			...(clientContext.devDeviceId ? { initiatorDevDeviceId: clientContext.devDeviceId } : {}),
			agentSessionId: AgentSession.id(sessionUri),
			chatSessionId: getTelemetryChatSessionId(session),
			turnId,
			source,
			messageOriginKind: getMessageOriginTelemetryKind(message, isEphemeralSession),
			messageActorKind: message.origin.kind,
			isSubagentSession: isSubagentChat || isSubagentSession(sessionUri),
			turnCount: sessionState?.turns.length ?? 0,
			...(activeClients.length > 0 ? {
				activeClientId: activeClients[0].clientId,
				activeClientToolCount: activeClients.reduce((sum, client) => sum + client.tools.length, 0),
				activeClientCustomizationCount: activeClients.reduce((sum, client) => sum + (client.customizations?.length ?? 0), 0),
			} : {}),
			attachmentCount,
		});
		this._restricted?.sendGHTelemetryEvent('agentHost.userMessageSent', {
			...telemetryContext,
			provider,
			initiatorClientType: clientContext.clientType,
			conversationId: AgentSession.id(sessionUri),
			chatSessionId: getTelemetryChatSessionId(session),
			turnId,
			messageOriginKind: getMessageOriginTelemetryKind(message, isEphemeralSession),
		});
	}

	sessionCreated(provider: string | undefined, clientContext: IAgentHostClientTelemetryContext): void {
		this._telemetryService.publicLog2<AgentHostSessionCreatedEvent, AgentHostSessionCreatedClassification>('agentHost.sessionCreated', {
			provider,
			...toInitiatorTelemetry(clientContext),
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
	async assistantMessageReceived(session: string, chat: string, clientType: AgentHostClientType, clientRequestId: string | undefined, tools: readonly ToolDefinition[], sdkSessionId?: string): Promise<void> {
		const restricted = this._restricted;
		if (!restricted || !clientRequestId || tools.length === 0) {
			return;
		}
		restricted.sendEnhancedGHTelemetryEvent('request.options.tools', await multiplexProperties({
			headerRequestId: clientRequestId,
			...(sdkSessionId ? { sdkSessionId } : {}),
			conversationId: AgentSession.id(session),
			chatSessionId: getTelemetryChatSessionId(chat),
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
	 * compressed chunks (`messageTextChunk`, `messageTextChunk_2`, …), including short text,
	 * matching the extension's `multiplexProperties`. `messageText` retains the raw prefix.
	 *
	 * @param session Session URI string; its id becomes `conversationId`.
	 * @param content The user's prompt text. No-ops when empty.
	 * @param turnIndex The 0-based ordinal of the turn this message belongs to, matching the extension's numeric `turnIndex` (`conversation.turns.length`). CTS parses `turn_index` as an integer, so a numeric ordinal is required here (a non-numeric id lands empty).
	 */
	async userMessageText(session: string, chat: string, clientType: AgentHostClientType, content: string, turnIndex: number, sdkSessionId?: string): Promise<void> {
		const restricted = this._restricted;
		if (!restricted || !content) {
			return;
		}
		const properties = await multiplexProperties({
			source: 'user',
			...(sdkSessionId ? { sdkSessionId } : {}),
			conversationId: AgentSession.id(session),
			chatSessionId: getTelemetryChatSessionId(chat),
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
	 * arrives (the agent host's per-model-call boundary), carrying the assistant's structured
	 * `{ role, content, reasoning_text? }` JSON payload. `headerRequestId` is filled with the
	 * model call's client-minted `x-request-id`, matching the extension. VS Code-only enrichment
	 * dims (code-block languages/counts) are not reconstructed here.
	 *
	 * @param session Session URI string; its id becomes `conversationId`.
	 * @param content The assistant's response text. No-ops when both `content` and `reasoningText` are empty.
	 * @param turnIndex The 0-based ordinal of the turn this message belongs to, matching the extension's numeric `turnIndex` (`conversation.turns.length`). CTS parses `turn_index` as an integer, so a numeric ordinal is required here.
	 * @param clientRequestId The model call's client-minted `x-request-id`, mapped to `headerRequestId`.
	 * @param sdkSessionId The SDK session id, when known.
	 * @param reasoningText Optional structured wire reasoning text from `assistant.message`.
	 */
	async modelMessageText(session: string, chat: string, clientType: AgentHostClientType, content: string, turnIndex: number, clientRequestId: string | undefined, sdkSessionId?: string, reasoningText?: string): Promise<void> {
		const restricted = this._restricted;
		if (!restricted || restricted.isRestrictedTelemetryActive === false || (!content && !reasoningText)) {
			return;
		}
		await Promise.resolve();
		const messageText = formatModelMessageTextForTelemetry(content, reasoningText);
		const properties = await multiplexProperties({
			source: 'model',
			...(sdkSessionId ? { sdkSessionId } : {}),
			conversationId: AgentSession.id(session),
			chatSessionId: getTelemetryChatSessionId(chat),
			initiatorClientType: clientType,
			turnIndex: String(turnIndex),
			...(clientRequestId ? { headerRequestId: clientRequestId } : {}),
			messageText,
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
		const session = report.owner;
		const conversationId = AgentSession.id(session);
		const chatSessionId = getTelemetryChatSessionId(report.chat);
		const toolCounts = JSON.stringify(report.toolCounts);
		this._telemetryService.publicLog2<IAgentHostToolCallDetailsEvent, IAgentHostToolCallDetailsClassification>('toolCallDetails', {
			...toInitiatorTelemetry(report.clientContext),
			...toCopilotTelemetryData(report.telemetryContext),
			provider: report.provider,
			agentSessionId: conversationId,
			chatSessionId,
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
			chatSessionId,
			requestId: report.turnId,
			messageId: report.turnId,
			initiatorClientType: report.clientType,
			...toCopilotTelemetryData(report.telemetryContext),
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
		const session = report.owner;
		const agentSessionId = AgentSession.id(session);
		this._telemetryService.publicLog2<IAgentHostToolApprovalEvent, IAgentHostToolApprovalClassification>('chat.toolApproval', {
			...toInitiatorTelemetry(report.clientContext),
			...toCopilotTelemetryData(report.telemetryContext),
			provider: report.provider,
			agentSessionId,
			isSubagentSession: isSubagentSession(session),
			chatSessionId: agentSessionId,
			requestId: report.turnId,
			toolId: report.toolId,
			toolExtensionId: undefined,
			toolSourceKind: report.toolSourceKind,
			confirmKind: report.confirmKind,
			...(report.decisionSource !== undefined ? { decisionSource: report.decisionSource } : {}),
			...(report.permissionResult !== undefined ? { permissionResult: report.permissionResult } : {}),
			approvalTelemetryVersion: 2,
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
			chatSessionId: getTelemetryChatSessionId(report.chat),
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

	/**
	 * Records what triggered a skill invocation and where the skill came from. Only built-in skills are
	 * named; other skills keep their hashed identity on the forwarded runtime `copilotSdk/skill_invoked`;
	 * join the two on `sdkEventId` = `event_id`.
	 */
	skillInvoked(report: IAgentHostSkillInvokedReport): void {
		const agentSessionId = AgentSession.id(report.owner);
		this._telemetryService.publicLog2<IAgentHostSkillInvokedEvent, IAgentHostSkillInvokedClassification>('agentHost.skillInvoked', {
			...toInitiatorTelemetry(report.clientContext),
			...toCopilotTelemetryData(report.telemetryContext),
			provider: report.provider,
			agentSessionId,
			chatSessionId: getTelemetryChatSessionId(report.session),
			turnId: report.turnId,
			sdkEventId: report.sdkEventId,
			trigger: report.trigger !== undefined && skillInvocationTriggers.has(report.trigger) ? report.trigger : 'unknown',
			isSubagentInvocation: report.isSubagentInvocation,
			skillSource: report.skillSource,
			skillOrigin: report.skillOrigin,
			skillName: report.skillName,
		});
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

	modelCallUsageCounted(report: ModelCallUsageCountedEvent): void {
		this._telemetryService.publicLog2<ModelCallUsageCountedEvent, ModelCallUsageCountedClassification>('agentHost.modelCallUsageCounted', report);
	}

	requestTokenUsage(report: { clientContext: IAgentHostClientTelemetryContext; telemetryContext?: IAgentTelemetryContext; provider: string; session: string; owner: string; requestId: string; parentTurnId?: string; parentToolCallId?: string; subagentKind?: AgentSubagentKind; selectedModel?: string; selectedModelTelemetryKind?: AgentHostModelTelemetryKind; modelTelemetryKind?: AgentHostModelTelemetryKind; result: AgentHostTurnResult; summary: IAgentTokenUsageSummary }): void {
		const session = report.owner;
		const isSubagent = report.subagentKind !== undefined || isSubagentSession(session);
		const { model: usageModel, reasoningEffort, ...summary } = report.summary;
		const model = usageModel === 'auto' ? 'unknown' : toTelemetryModel(usageModel, report.modelTelemetryKind) ?? 'unknown';
		const selectedModel = toTelemetryModel(report.selectedModel, report.selectedModelTelemetryKind);
		const effort = isReasoningEffortLevel(reasoningEffort) ? reasoningEffort : undefined;
		this._telemetryService.publicLog2<IRequestTokenUsageEvent, RequestTokenUsageClassification>('agentHost.requestTokenUsage', {
			...toInitiatorTelemetry(report.clientContext),
			...toCopilotTelemetryData(report.telemetryContext),
			...summary,
			provider: report.provider,
			agentSessionId: AgentSession.id(session),
			chatSessionId: getTelemetryChatSessionId(report.session),
			requestId: report.requestId,
			parentTurnId: report.parentTurnId,
			parentToolCallId: report.parentToolCallId,
			isSubagentSession: isSubagent,
			...toSubagentKindTelemetry(isSubagent, report.subagentKind),
			model,
			...(selectedModel !== undefined ? { selectedModel } : {}),
			...(effort !== undefined ? { reasoningEffort: effort } : {}),
			result: report.result,
			usageAccountingVersion: 1,
			inputTokenSemantics: 'sdkReported',
			usageRecordSource: 'sdkUsageEvent',
			reasoningEffortSource: 'sdkReported',
		});
	}

	turnCompleted(report: IAgentHostTurnCompletedReport): void {
		const session = report.owner;
		const chatSessionId = getTelemetryChatSessionId(report.session);
		const isSubagent = report.subagentKind !== undefined || isSubagentSession(session);
		const subagentKindTelemetry = toSubagentKindTelemetry(isSubagent, report.subagentKind);
		const model = toTelemetryModel(report.model, report.modelTelemetryKind);
		const providerStages = toProviderStageMeasurements(report.providerStageDurationsMs);
		const providerTimings = report.providerTimings?.length ? report.providerTimings.map(sanitizeAgentHostProviderTiming).filter(timing => timing !== undefined) : undefined;
		this._otelService?.emitTurnTiming({
			provider: report.provider,
			agentSessionId: AgentSession.id(session),
			chatId: getAgentHostChatId(report.session),
			turnId: report.turnId,
			isSubagentSession: isSubagent,
			result: report.result,
			totalTime: report.totalTime,
			timeToProviderDispatch: report.sendDispatchedMs,
			timeToFirstProgress: report.timeToFirstProgress,
			timeToFirstSubstantiveProgress: report.timeToFirstSubstantiveProgress,
			sendStageWorkingDirectoryMs: report.sendStageDurationsMs?.get('workingDirectory'),
			sendStageModelSelectionMs: report.sendStageDurationsMs?.get('modelSelection'),
			sendStageAttachmentsMs: report.sendStageDurationsMs?.get('attachments'),
			sendStageContributionsMs: report.sendStageDurationsMs?.get('contributions'),
			sendStageProviderPreparationMs: report.sendStageDurationsMs?.get('providerPreparation'),
			sendStageCheckpointMs: report.sendStageDurationsMs?.get('checkpoint'),
			...providerStages,
			providerTimings,
			hostRootTurnOrdinal: report.hostRootTurnOrdinal,
			hostProcessAgeMs: report.hostProcessAgeMs,
			titleGenerationStrategy: report.titleGenerationStrategy,
		});
		this._telemetryService.publicLog2<IAgentHostTurnCompletedEvent, IAgentHostTurnCompletedClassification>('agentHost.turnCompleted', {
			...(report.turnInteraction ? {
				sdkSessionId: report.turnInteraction.sdkSessionId,
				originalTurnId: report.turnInteraction.originalTurnId,
				steeredFromTurn: report.turnInteraction.steeredFromTurn,
				interactionIds: JSON.stringify(report.turnInteraction.interactionIds),
				interactionIdsTruncated: report.turnInteraction.interactionIdsTruncated,
				...(report.turnInteraction.steeringDelivery ? { steeringDelivery: report.turnInteraction.steeringDelivery } : {}),
			} : {}),
			...toInitiatorTelemetry(report.clientContext),
			...toCopilotTelemetryData(report.telemetryContext),
			...(report.provider === 'codex' ? getCodexAccountTelemetryData(report.providerTelemetryContext?.codex) : undefined),
			...(report.provider === 'codex' ? { codexModelProvider: report.codexModelProvider ?? 'unknown' } : {}),
			...prewarmedSessionTelemetry(report.providerTelemetryContext),
			...(report.hostRootTurnOrdinal !== undefined ? { hostRootTurnOrdinal: report.hostRootTurnOrdinal } : {}),
			...(report.hostProcessAgeMs !== undefined ? { hostProcessAgeMs: report.hostProcessAgeMs } : {}),
			...(report.titleGenerationStrategy !== undefined ? { titleGenerationStrategy: report.titleGenerationStrategy } : {}),
			provider: report.provider,
			agentSessionId: AgentSession.id(session),
			chatSessionId,
			isSubagentSession: isSubagent,
			...subagentKindTelemetry,
			turnId: report.turnId,
			parentTurnId: report.parentTurnId,
			parentToolCallId: report.parentToolCallId,
			subagentTaskModelSource: report.subagentTaskModelSource,
			timeToFirstProgress: report.timeToFirstProgress,
			timeToFirstSubstantiveProgress: report.timeToFirstSubstantiveProgress,
			timeToFirstEdit: report.timeToFirstEditMs,
			startedWithSteering: report.startedWithSteering,
			receivedSteering: report.receivedSteering,
			sendStageWorkingDirectoryMs: report.sendStageDurationsMs?.get('workingDirectory'),
			sendStageModelSelectionMs: report.sendStageDurationsMs?.get('modelSelection'),
			sendStageAttachmentsMs: report.sendStageDurationsMs?.get('attachments'),
			sendStageContributionsMs: report.sendStageDurationsMs?.get('contributions'),
			sendStageProviderPreparationMs: report.sendStageDurationsMs?.get('providerPreparation'),
			sendStageCheckpointMs: report.sendStageDurationsMs?.get('checkpoint'),
			timeToProviderDispatch: report.sendDispatchedMs,
			...providerStages,
			totalTime: report.totalTime,
			result: report.result,
			model,
			modelSelectionKind: report.modelSelectionKind,
			...toFusionTurnTelemetry(report),
			isBYOK: report.modelTelemetryKind === undefined ? undefined : report.modelTelemetryKind === 'byok',
			permissionLevel: report.permissionLevel,
			interactionMode: report.interactionMode,
			messageOriginKind: report.messageOriginKind,
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
		if (providerTimings?.length) {
			const providerTimingContext = {
				...toInitiatorTelemetry(report.clientContext),
				...toCopilotTelemetryData(report.telemetryContext),
				schemaVersion: 2,
				provider: report.provider,
				agentSessionId: AgentSession.id(session),
				chatSessionId,
				turnId: report.turnId,
				result: report.result,
				model,
			};
			for (const [group, measurements] of groupAgentHostProviderTimings(providerTimings)) {
				this._telemetryService.publicLog2<AgentHostProviderTimingEvent, AgentHostProviderTimingClassification>('agentHost.providerTiming', {
					...providerTimingContext, group, ...measurements,
				});
			}
		}
		if (report.failure) {
			const { providerCallId, serviceRequestId } = readAgentErrorTelemetryMeta(report.failure.error);
			this._telemetryService.publicLogError2<IAgentHostTurnFailedEvent, IAgentHostTurnFailedClassification>('agentHost.turnFailed', {
				...toInitiatorTelemetry(report.clientContext),
				...toCopilotTelemetryData(report.telemetryContext),
				provider: report.provider,
				agentSessionId: AgentSession.id(session),
				chatSessionId,
				isSubagentSession: isSubagent,
				...subagentKindTelemetry,
				turnId: report.turnId,
				messageOriginKind: report.messageOriginKind,
				failureStage: report.failure.stage,
				...toFusionTurnTelemetry(report),
				...prewarmedSessionTelemetry(report.providerTelemetryContext),
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
		const session = report.owner;
		const isSubagent = report.subagentKind !== undefined || isSubagentSession(session);
		this._telemetryService.publicLog2<IAgentHostTurnHungEvent, IAgentHostTurnHungClassification>('agentHost.turnHung', {
			...toInitiatorTelemetry(report.clientContext),
			...toCopilotTelemetryData(report.telemetryContext),
			...(report.provider === 'codex' ? getCodexAccountTelemetryData(report.providerTelemetryContext?.codex) : undefined),
			provider: report.provider,
			agentSessionId: AgentSession.id(session),
			chatSessionId: getTelemetryChatSessionId(report.session),
			isSubagentSession: isSubagent,
			...toSubagentKindTelemetry(isSubagent, report.subagentKind),
			turnId: report.turnId,
			messageOriginKind: report.messageOriginKind,
			hangReason: report.hangReason,
			isExpected: isExpectedTurnHang(report.hangReason),
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
			...toFusionTurnTelemetry(report),
			permissionLevel: report.permissionLevel,
		});
	}

	/** Paired recovery event for a turn previously reported by {@link turnHung}. */
	hungTurnCompleted(report: IAgentHostHungTurnCompletedReport): void {
		const session = report.owner;
		const isSubagent = report.subagentKind !== undefined || isSubagentSession(session);
		this._telemetryService.publicLog2<IAgentHostHungTurnCompletedEvent, IAgentHostHungTurnCompletedClassification>('agentHost.hungTurnCompleted', {
			...toInitiatorTelemetry(report.clientContext),
			...toCopilotTelemetryData(report.telemetryContext),
			provider: report.provider,
			agentSessionId: AgentSession.id(session),
			chatSessionId: getTelemetryChatSessionId(report.session),
			isSubagentSession: isSubagent,
			...toSubagentKindTelemetry(isSubagent, report.subagentKind),
			turnId: report.turnId,
			messageOriginKind: report.messageOriginKind,
			hangReason: report.hangReason,
			result: report.result,
			hangReportCount: report.hangReportCount,
			totalTimeMs: report.totalTimeMs,
			timeAfterHangMs: report.timeAfterHangMs,
			...toFusionTurnTelemetry(report),
		});
	}

	/** Reports one session's activity period. See {@link IAgentHostSessionSummaryTotals} for what each total sums. */
	sessionSummary(report: IAgentHostSessionSummaryReport): void {
		this._telemetryService.publicLog2<IAgentHostSessionSummaryEvent, IAgentHostSessionSummaryClassification>('agentHost.sessionSummary', {
			...toInitiatorTelemetry(report.clientContext),
			...toCopilotTelemetryData(report.telemetryContext),
			schemaVersion: 1,
			provider: report.provider,
			agentSessionId: AgentSession.id(report.session),
			summaryReason: report.summaryReason,
			summaryIndex: report.summaryIndex,
			createdInHostProcess: report.createdInHostProcess,
			multipleClientTypes: report.multipleClientTypes,
			...report.totals,
			...report.artifacts,
		});
	}

	/** Reports an artifact or reference that was recorded, promoted, or found already recorded. */
	artifactRecorded(report: IAgentHostArtifactRecordedReport): void {
		this._telemetryService.publicLog2<IAgentHostArtifactRecordedEvent, IAgentHostArtifactRecordedClassification>('agentHost.artifactRecorded', {
			...toInitiatorTelemetry(report.clientContext),
			...this._artifactCopilotTelemetry(report),
			provider: report.provider ?? 'unknown',
			agentSessionId: AgentSession.id(report.session),
			turnId: report.turnId,
			toolCallId: report.toolCallId,
			source: report.source,
			kind: report.kind,
			category: report.isArtifact ? 'artifact' : 'reference',
			outcome: report.outcome,
			isGitHub: report.isGitHub,
			batchSize: report.batchSize,
		});
	}

	artifactRemoved(report: IAgentHostArtifactRemovedReport): void {
		this._telemetryService.publicLog2<IAgentHostArtifactRemovedEvent, IAgentHostArtifactRemovedClassification>('agentHost.artifactRemoved', {
			...toInitiatorTelemetry(report.clientContext),
			...this._artifactCopilotTelemetry(report),
			provider: report.provider ?? 'unknown',
			agentSessionId: AgentSession.id(report.session),
			turnId: report.turnId,
			toolCallId: report.toolCallId,
			initiator: report.initiator,
			kind: report.kind,
			category: report.isArtifact ? 'artifact' : 'reference',
			isGitHub: report.isGitHub,
		});
	}

	/** The account of the turn that changed the entry, else the provider's current account. */
	private _artifactCopilotTelemetry(report: IAgentHostTurnAttributedReport & { readonly provider: string | undefined }): IAgentHostCopilotSkuTelemetry {
		return toCopilotTelemetryData(report.telemetryContext) ?? (report.provider ? this._copilotTelemetryContext(report.provider) : {});
	}

	toolInvoked(report: IAgentHostToolInvokedReport): void {
		// `chatSessionId` is the full session URI string (matching the value
		// previously emitted by `CopilotAgentSession`). Action signals are keyed
		// by their chat-channel URI, so normalize it back to the session URI.
		const session = report.owner;
		const isSubagent = report.subagentKind !== undefined || isSubagentSession(session);
		this._telemetryService.publicLog2<IAgentHostLanguageModelToolInvokedEvent, IAgentHostLanguageModelToolInvokedClassification>('languageModelToolInvoked', {
			...toInitiatorTelemetry(report.clientContext),
			...toCopilotTelemetryData(report.telemetryContext),
			result: report.result,
			chatSessionId: session,
			toolId: report.toolId,
			toolExtensionId: undefined,
			toolSourceKind: report.toolSourceKind,
			...(report.mcpSourceKind ? { mcpSourceKind: report.mcpSourceKind } : {}),
			toolCallId: report.toolCallId,
			invocationTimeMs: report.invocationTimeMs,
			provider: report.provider,
			resultSizeInCharacters: report.resultSizeInCharacters,
			turnId: report.turnId,
			model: toTelemetryModel(report.model, report.modelTelemetryKind),
		});
		const event: IAgentHostToolInvokedEvent = {
			...toInitiatorTelemetry(report.clientContext),
			...toCopilotTelemetryData(report.telemetryContext),
			result: report.result,
			agentSessionId: AgentSession.id(session),
			chatSessionId: getTelemetryChatSessionId(report.session),
			isSubagentSession: isSubagent,
			...toSubagentKindTelemetry(isSubagent, report.subagentKind),
			toolId: report.toolId,
			toolExtensionId: undefined,
			toolSourceKind: report.toolSourceKind,
			...(report.mcpSourceKind ? { mcpSourceKind: report.mcpSourceKind } : {}),
			toolCallId: report.toolCallId,
			invocationTimeMs: report.invocationTimeMs,
			provider: report.provider,
			resultSizeInCharacters: report.resultSizeInCharacters,
			turnId: report.turnId,
			model: toTelemetryModel(report.model, report.modelTelemetryKind),
			errorCode: report.errorCode,
		};
		this._telemetryService.publicLog2<IAgentHostToolInvokedEvent, IAgentHostToolInvokedClassification>('agentHost.toolInvoked', event);
	}

	askQuestionsToolInvoked(report: IAgentHostAskQuestionsToolInvokedReport): void {
		const session = report.owner;
		const isSubagent = report.subagentKind !== undefined || isSubagentSession(session);
		this._telemetryService.publicLog2<IAgentHostAskQuestionsToolInvokedEvent, IAgentHostAskQuestionsToolInvokedClassification>('askQuestionsToolInvoked', {
			...toInitiatorTelemetry(report.clientContext),
			...toCopilotTelemetryData(report.telemetryContext),
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
			isSubagentSession: isSubagent,
			...toSubagentKindTelemetry(isSubagent, report.subagentKind),
		});
	}

	toolCallStalled(report: IAgentHostToolCallStalledReport): void {
		const session = report.owner;
		const isSubagent = report.subagentKind !== undefined || isSubagentSession(session);
		this._telemetryService.publicLog2<IAgentHostToolCallStalledEvent, IAgentHostToolCallStalledClassification>('agentHost.toolCallStalled', {
			...toInitiatorTelemetry(report.clientContext),
			...toCopilotTelemetryData(report.telemetryContext),
			provider: report.provider,
			agentSessionId: AgentSession.id(session),
			isSubagentSession: isSubagent,
			...toSubagentKindTelemetry(isSubagent, report.subagentKind),
			blockerKind: report.blockerKind,
			toolCallId: report.toolCallId,
			toolId: report.toolId,
			toolSourceKind: report.toolSourceKind,
			executorClientConnectionState: report.executorClientConnectionState,
			stalledTimeMs: report.stalledTimeMs,
		});
	}

	stalledToolCallCompleted(report: IAgentHostStalledToolCallCompletedReport): void {
		const session = report.owner;
		const isSubagent = report.subagentKind !== undefined || isSubagentSession(session);
		this._telemetryService.publicLog2<IAgentHostStalledToolCallCompletedEvent, IAgentHostStalledToolCallCompletedClassification>('agentHost.stalledToolCallCompleted', {
			...toInitiatorTelemetry(report.clientContext),
			...toCopilotTelemetryData(report.telemetryContext),
			provider: report.provider,
			agentSessionId: AgentSession.id(session),
			isSubagentSession: isSubagent,
			...toSubagentKindTelemetry(isSubagent, report.subagentKind),
			blockerKind: report.blockerKind,
			toolCallId: report.toolCallId,
			toolId: report.toolId,
			toolSourceKind: report.toolSourceKind,
			executorClientConnectionState: report.executorClientConnectionState,
			result: report.result,
			totalTimeMs: report.totalTimeMs,
			timeAfterStallMs: report.timeAfterStallMs,
		});
	}
}
