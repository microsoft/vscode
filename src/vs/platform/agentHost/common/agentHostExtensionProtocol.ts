/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ValidatorBase, vBoolean, vEnum, vObj, vOptionalProp, vString, type ValidationError, type ValidatorType } from '../../../base/common/validation.js';
import type { IJSONSchema } from '../../../base/common/jsonSchema.js';
import type { IDevContainerAgentHostConnectResult } from './devContainerAgentHost.js';
import type { AgentExtensionMode, AgentExtensionSource, AgentExtensionStatus } from './agent.js';
import type { AgentHostDebugLogsArtifactKind, IAgentHostManagedSettingsDiagnostics, IAgentHostNetworkDiagnosticsInfo, IAgentHostNetworkFetchResult } from './agentService.js';
import type { McpServerAuthenticateTarget } from './state/sessionProtocol.js';
import type { InitializeResult } from './state/protocol/common/commands.js';
import type { McpAuthRequirement } from './state/protocol/channels-session/state.js';
import { AgentHostArtifactRemovalCapabilityMetaKey } from './meta/agentHostArtifactRemovalMeta.js';
import { AgentHostSessionImportCapabilityMetaKey } from './meta/agentHostSessionImportMeta.js';
import { AgentHostSessionMoveCapabilityMetaKey } from './meta/agentHostSessionMoveMeta.js';
import { AgentHostSavedChatCapabilityMetaKey, AgentHostSavedChatContinuationCapabilityMetaKey } from './meta/agentHostSavedChatMeta.js';
import { AgentHostDevContainersCapabilityMetaKey } from './meta/agentHostDevContainersMeta.js';
import { AgentHostTimingCapabilityMetaKey, ChatUserInteractionCapability } from './meta/agentHostTimingMeta.js';
import type { IAgentHostFirstResponseDiagnostic } from './otel/agentHostTiming.js';
import type { IChatUserInteractionTiming } from '../../otel/common/chatUserInteraction.js';
import type { IAgentHostSavedChatDto, IAgentHostSavedChatContinuationResult } from './agentHostSavedChat.js';
import { AgentHostAutonomousAutomationsCapabilityMetaKey } from './meta/agentHostAutomationsMeta.js';
import { AgentHostChatUrisCapabilityMetaKey, AgentHostNativeImplementationMetaKey, AgentHostSessionUrisCapabilityMetaKey } from './meta/agentHostSessionUrisMeta.js';
import { AgentHostDebugLogsCancellationCapabilityMetaKey } from './meta/agentHostDebugLogsMeta.js';
import { AgentHostWorktreeDiskUsageCapabilityMetaKey } from './meta/agentHostWorktreeDiskUsageMeta.js';
import { AgentHostWorktreeCleanupCapabilityMetaKey } from './meta/agentHostWorktreeCleanupMeta.js';
import { SessionWorktreeCleanupExtensionMethod, sessionWorktreeCleanupParamsValidator, type IAgentHostWorktreeCleanupStatus } from './agentHostWorktreeCleanup.js';
import { AgentHostCreateChatWorkspaceCapabilityMetaKey, chatWorkspaceValueValidator } from './meta/agentHostCreateChatWorkspaceMeta.js';
import { AgentHostCreateSessionImportCapabilityMetaKey, StageCreateSessionImportChunkExtensionMethod, stageCreateSessionImportChunkParamsValidator, supportsAgentHostCreateSessionImport } from './meta/agentHostCreateSessionImportMeta.js';
import { InstallSandboxCertificateExtensionMethod, RemoveSandboxCertificateExtensionMethod, RotateSandboxCertificateExtensionMethod, sandboxCertificateParamsValidator } from './sandboxCertificateProtocol.js';
import { AgentHostArtifactIntegrationsCapabilityMetaKey, AgentHostArtifactNoticesCapabilityMetaKey } from './meta/agentHostArtifactIntegrationMeta.js';
import type { ArtifactIntegrationRequest, ArtifactIntegrationResponse, ArtifactIntegrationUpdate } from '../../artifactIntegrations/common/artifactIntegrationProtocol.js';
import type { ArtifactIntegrationDescriptor } from '../../artifactIntegrations/common/artifactIntegration.js';
import { AgentHostCopilotExtensionsCapabilityMetaKey } from './meta/agentHostCopilotExtensionsMeta.js';

export { supportsAgentHostArtifactRemoval } from './meta/agentHostArtifactRemovalMeta.js';
export { StageCreateSessionImportChunkExtensionMethod, stageCreateSessionImportChunkParamsValidator, supportsAgentHostCreateSessionImport };
export { supportsAgentHostDevContainers } from './meta/agentHostDevContainersMeta.js';
export { supportsAgentHostSessionMove } from './meta/agentHostSessionMoveMeta.js';

export const DevContainerIsDockerAvailableExtensionMethod = 'vscode/devContainers/isDockerAvailable';
export const DevContainerConnectExtensionMethod = 'vscode/devContainers/connect';
export const DevContainerDisconnectExtensionMethod = 'vscode/devContainers/disconnect';
export const DevContainerStopExtensionMethod = 'vscode/devContainers/stop';
export const DevContainerRemoveExtensionMethod = 'vscode/devContainers/remove';
export const DevContainerRelaySendExtensionMethod = 'vscode/devContainers/relaySend';
export const DevContainerRelayMessageNotification = 'vscode/devContainers/relayMessage';
export const DevContainerRelayCloseNotification = 'vscode/devContainers/relayClose';
export const DevContainerCloseConnectionNotification = 'vscode/devContainers/closeConnection';
export const DevContainerOutputNotification = 'vscode/devContainers/output';
export const DevContainerSandboxSupportNotification = 'vscode/devContainers/sandboxSupport';

export const devContainerConnectionParamsValidator = vObj({ connectionId: vString() });
export const devContainerConnectParamsValidator = vObj({ connectionId: vString(), workspaceFolder: vString(), name: vString(), resume: vOptionalProp(vBoolean()), sandboxEnabled: vOptionalProp(vBoolean()) });
export const devContainerWorkspaceParamsValidator = vObj({ workspaceFolder: vString() });
export const devContainerRelayMessageValidator = vObj({ connectionId: vString(), data: vString() });
export const devContainerSandboxSupportValidator = vObj({ connectionId: vString(), supported: vBoolean() });
export const devContainerConnectResultValidator = vObj({
	connectionId: vString(),
	address: vString(),
	name: vString(),
	remoteWorkspaceFolder: vString(),
	hostWorkspaceFolder: vOptionalProp(vString()),
	sandboxSupported: vOptionalProp(vBoolean()),
});

export const CollectAgentHostDebugLogsExtensionMethod = 'vscode/collectAgentHostDebugLogs';
export const CancelAgentHostDebugLogsExtensionMethod = 'vscode/cancelAgentHostDebugLogs';
export const GetAgentHostSessionStateFileExtensionMethod = 'vscode/getAgentHostSessionStateFile';
export const CreateAgentHostDetachedWorktreeExtensionMethod = 'vscode/createAgentHostDetachedWorktree';
export const ClaimAgentHostDetachedWorktreeExtensionMethod = 'vscode/claimAgentHostDetachedWorktree';
export const DeleteAgentHostDetachedWorktreeExtensionMethod = 'vscode/deleteAgentHostDetachedWorktree';
export const ReconcileAgentHostDetachedWorktreesExtensionMethod = 'vscode/reconcileAgentHostDetachedWorktrees';
export const ReadAgentHostDebugLogsChunkExtensionMethod = 'vscode/readAgentHostDebugLogsChunk';
export const SetAgentHostDetachedWorktreeArchivedExtensionMethod = 'vscode/setAgentHostDetachedWorktreeArchived';
export const RequestAgentHostWorkspaceTrustExtensionMethod = 'vscode/requestWorkspaceTrust';
export const RequestAgentHostMcpAuthenticationExtensionMethod = 'vscode/requestMcpAuthentication';
export const RemoveSessionArtifactExtensionMethod = 'vscode/removeSessionArtifact';
export const StopBackgroundWorkExtensionMethod = 'vscode/stopBackgroundWork';
export const MeasureWorktreeDiskUsageExtensionMethod = 'vscode/measureWorktreeDiskUsage';
export const CancelWorktreeDiskUsageExtensionMethod = 'vscode/cancelWorktreeDiskUsage';
export const measureWorktreeDiskUsageParamsValidator = vObj({ uri: vString(), requestId: vString() });
export const cancelWorktreeDiskUsageParamsValidator = vObj({ requestId: vString() });
export const ImportSessionExtensionMethod = 'vscode/importSession';
/**
 * Moves a single-chat session under another session (Block 4); advertised by `vscode.sessionMove` whether or not moving
 * chats is enabled, which can change after a client connected. A move while it is off is refused with `disabled`.
 */
export const MoveAgentHostSessionExtensionMethod = 'vscode/moveSession';
/**
 * Applies a workspace (folder, worktree or scratch folder) to an existing peer chat that hasn't started a turn, as
 * `createChat` does with `vscode.chatWorkspace`; gated by the same `vscode.createChatWorkspace` capability.
 */
export const SetChatWorkspaceExtensionMethod = 'vscode/setChatWorkspace';
export const ReadSavedChatExtensionMethod = 'vscode/readSavedChat';
export const CompleteSavedChatContinuationExtensionMethod = 'vscode/completeSavedChatContinuation';
export const ReportAgentHostFirstResponseExtensionMethod = 'vscode/reportAgentHostFirstResponse';
export const ReportChatUserInteractionExtensionMethod = 'vscode/reportChatUserInteraction';
export const ArtifactIntegrationExtensionMethod = 'vscode/artifactIntegrations';
export const ArtifactIntegrationUpdateNotification = 'vscode/artifactIntegrations/update';
/** Client → host: offers or withdraws the client's own integrations; an empty list withdraws them. */
export const RegisterClientArtifactIntegrationsExtensionMethod = 'vscode/clientArtifactIntegrations/register';
/** Client → host: an update for a subscription the host opened on the client's integrations. */
export const ClientArtifactIntegrationUpdateExtensionMethod = 'vscode/clientArtifactIntegrations/update';
/** Host → client: a request against the client's own integrations. */
export const ClientArtifactIntegrationExtensionMethod = 'vscode/clientArtifactIntegrations';
export const ListAgentExtensionsExtensionMethod = 'vscode/listAgentExtensions';
export const SetAgentExtensionEnabledExtensionMethod = 'vscode/setAgentExtensionEnabled';
const AgentHostChatStateFileCapabilityMetaKey = 'vscode.getAgentHostSessionStateFile.chat';
const AgentHostDetachedWorktreeCapabilityMetaKey = 'vscode.detachedWorktrees';

/** Namespaced VS Code implementation capabilities carried alongside standardized AHP initialize capabilities. */
export interface IAgentHostExtensionInitializeResultMeta extends Record<string, unknown> {
	readonly [AgentHostArtifactIntegrationsCapabilityMetaKey]?: 1;
	readonly [AgentHostArtifactNoticesCapabilityMetaKey]?: 1;
	readonly [AgentHostWorktreeDiskUsageCapabilityMetaKey]?: true;
	readonly [AgentHostWorktreeCleanupCapabilityMetaKey]?: true;
	readonly [AgentHostDebugLogsCancellationCapabilityMetaKey]?: true;
	readonly [AgentHostSessionUrisCapabilityMetaKey]?: true;
	readonly [AgentHostChatUrisCapabilityMetaKey]?: true;
	readonly [AgentHostNativeImplementationMetaKey]?: true;
	readonly [AgentHostChatStateFileCapabilityMetaKey]?: true;
	readonly [AgentHostDetachedWorktreeCapabilityMetaKey]?: true;
	/** Present when `createChat` honors a requested chat workspace (folder, worktree or scratch folder). */
	readonly [AgentHostCreateChatWorkspaceCapabilityMetaKey]?: true;
	/** Present when `createSession` honors an imported conversation on `_meta`. */
	readonly [AgentHostCreateSessionImportCapabilityMetaKey]?: true;
	readonly [AgentHostSavedChatCapabilityMetaKey]?: true;
	readonly [AgentHostSavedChatContinuationCapabilityMetaKey]?: true;
	readonly [AgentHostArtifactRemovalCapabilityMetaKey]?: true;
	readonly [AgentHostSessionImportCapabilityMetaKey]?: true;
	readonly [AgentHostSessionMoveCapabilityMetaKey]?: true;
	readonly [AgentHostDevContainersCapabilityMetaKey]?: true;
	readonly [AgentHostTimingCapabilityMetaKey]?: true;
	readonly [ChatUserInteractionCapability]?: true;
	readonly [AgentHostCopilotExtensionsCapabilityMetaKey]?: true;
	/** Present when Automation execution does not require a client activation or migration handshake. */
	readonly [AgentHostAutonomousAutomationsCapabilityMetaKey]?: true;
}

/** Standard AHP initialize response with typed VS Code-specific capability metadata. */
export interface IAgentHostExtensionInitializeResult extends InitializeResult {
	readonly _meta?: IAgentHostExtensionInitializeResultMeta;
}

export function getAgentHostExtensionInitializeResultMeta(artifactRemoval = true, devContainers = false, timing = false, sessionImport = false, savedChat = false, savedChatContinuation = false, sessionMove = false, artifactIntegrations = false, copilotExtensions = false): IAgentHostExtensionInitializeResultMeta {
	return {
		[AgentHostDebugLogsCancellationCapabilityMetaKey]: true,
		[AgentHostSessionUrisCapabilityMetaKey]: true,
		[AgentHostChatUrisCapabilityMetaKey]: true,
		[AgentHostNativeImplementationMetaKey]: true,
		[AgentHostChatStateFileCapabilityMetaKey]: true,
		[AgentHostDetachedWorktreeCapabilityMetaKey]: true,
		[AgentHostCreateChatWorkspaceCapabilityMetaKey]: true,
		[AgentHostCreateSessionImportCapabilityMetaKey]: true,
		[AgentHostAutonomousAutomationsCapabilityMetaKey]: true,
		[AgentHostArtifactRemovalCapabilityMetaKey]: artifactRemoval ? true : undefined,
		...(savedChat ? { [AgentHostSavedChatCapabilityMetaKey]: true as const } : {}),
		...(savedChatContinuation ? { [AgentHostSavedChatContinuationCapabilityMetaKey]: true as const } : {}),
		...(sessionImport ? { [AgentHostSessionImportCapabilityMetaKey]: true as const } : {}),
		...(sessionMove ? { [AgentHostSessionMoveCapabilityMetaKey]: true as const } : {}),
		...(devContainers ? { [AgentHostDevContainersCapabilityMetaKey]: true as const } : {}),
		...(timing ? { [AgentHostTimingCapabilityMetaKey]: true as const } : {}),
		...(timing ? { [ChatUserInteractionCapability]: true as const } : {}),
		...(artifactIntegrations ? { [AgentHostArtifactIntegrationsCapabilityMetaKey]: 1 as const, [AgentHostArtifactNoticesCapabilityMetaKey]: 1 as const } : {}),
		[AgentHostCopilotExtensionsCapabilityMetaKey]: copilotExtensions ? true : undefined,
	};
}

export function supportsAgentHostChatStateFile(result: IAgentHostExtensionInitializeResult | undefined): boolean {
	const meta = result?._meta;
	return meta?.[AgentHostChatStateFileCapabilityMetaKey] === true;
}

export function supportsAgentHostDetachedWorktrees(result: IAgentHostExtensionInitializeResult | undefined): boolean {
	const meta = result?._meta;
	return meta?.[AgentHostDetachedWorktreeCapabilityMetaKey] === true;
}

/** Whether the host honors a workspace requested for a new peer chat on `createChat`. */
export function supportsAgentHostCreateChatWorkspace(result: IAgentHostExtensionInitializeResult | undefined): boolean {
	const meta = result?._meta;
	return meta?.[AgentHostCreateChatWorkspaceCapabilityMetaKey] === true;
}

export const collectAgentHostDebugLogsParamsValidator = vObj({
	session: vOptionalProp(vString()),
	chat: vOptionalProp(vString()),
	kind: vEnum('archive', 'directory'),
	progressToken: vOptionalProp(vString()),
});

export type CollectAgentHostDebugLogsParams = ValidatorType<typeof collectAgentHostDebugLogsParamsValidator>;

export const removeSessionArtifactParamsValidator = vObj({
	session: vString(),
	artifactId: vString(),
});

/** Stops a chat's background work entry that the host marked stoppable in its `_meta`. */
export const stopBackgroundWorkParamsValidator = vObj({
	chat: vString(),
	id: vString(),
});

export const importSessionParamsValidator = vObj({ session: vString() });

/** `workspace` has the shape of the `vscode.chatWorkspace` `createChat` `_meta` value. */
export const setChatWorkspaceParamsValidator = vObj({ chat: vString(), workspace: chatWorkspaceValueValidator });

class StringOrNullValidator extends ValidatorBase<string | null> {
	validate(content: unknown): { content: string | null; error: undefined } | { content: undefined; error: ValidationError } {
		return content === null || typeof content === 'string'
			? { content, error: undefined }
			: { content: undefined, error: { message: `Expected a string or null, but got ${typeof content}` } };
	}

	getJSONSchema(): IJSONSchema {
		return { type: ['string', 'null'] };
	}
}

/** Every property is required: `after` is the chat of `destination` to place the session's chat after, `null` places it first. */
export const moveSessionParamsValidator = vObj({ session: vString(), destination: vString(), after: new StringOrNullValidator() });

/** The host doesn't move sessions under other sessions: it doesn't advertise `vscode.sessionMove`. */
export class AgentHostSessionMoveUnsupportedError extends Error {
	constructor(message = 'This agent host can\'t move sessions under other sessions.') {
		super(message);
		this.name = 'AgentHostSessionMoveUnsupportedError';
	}
}
export const readSavedChatParamsValidator = vObj({ session: vString(), chat: vOptionalProp(vString()) });
export const completeSavedChatContinuationParamsValidator = vObj({ session: vString(), chat: vString(), identity: vString(), destination: vString() });
export const listAgentExtensionsParamsValidator = vObj({
	session: vOptionalProp(vString()),
	chat: vOptionalProp(vString()),
});
export const setAgentExtensionEnabledParamsValidator = vObj({
	extensionId: vString(),
	enabled: vBoolean(),
	session: vOptionalProp(vString()),
	chat: vOptionalProp(vString()),
});

export interface IAgentHostAgentExtensionInventoryResult {
	readonly mode: AgentExtensionMode;
	readonly extensions: readonly {
		readonly id: string;
		readonly name: string;
		readonly resource?: string;
		readonly source: AgentExtensionSource;
		readonly status: AgentExtensionStatus;
		readonly pluginName?: string;
	}[];
}

export interface IAgentHostExtensionCommandMap {
	[SessionWorktreeCleanupExtensionMethod]: {
		params: ValidatorType<typeof sessionWorktreeCleanupParamsValidator>;
		result: IAgentHostWorktreeCleanupStatus;
	};
	[MeasureWorktreeDiskUsageExtensionMethod]: {
		params: ValidatorType<typeof measureWorktreeDiskUsageParamsValidator>;
		/** Allocated regular-file bytes on the root volume, excluding files with links outside the measured worktree. */
		result: { sizeBytes?: number };
	};
	[CancelWorktreeDiskUsageExtensionMethod]: {
		params: ValidatorType<typeof cancelWorktreeDiskUsageParamsValidator>;
		result: void;
	};
	[InstallSandboxCertificateExtensionMethod]: { params: ValidatorType<typeof sandboxCertificateParamsValidator>; result: void };
	[RotateSandboxCertificateExtensionMethod]: { params: ValidatorType<typeof sandboxCertificateParamsValidator>; result: void };
	[RemoveSandboxCertificateExtensionMethod]: { params: ValidatorType<typeof sandboxCertificateParamsValidator>; result: void };
	[ReadSavedChatExtensionMethod]: { params: ValidatorType<typeof readSavedChatParamsValidator>; result: IAgentHostSavedChatDto };
	[CompleteSavedChatContinuationExtensionMethod]: { params: ValidatorType<typeof completeSavedChatContinuationParamsValidator>; result: IAgentHostSavedChatContinuationResult };
	[StageCreateSessionImportChunkExtensionMethod]: { params: ValidatorType<typeof stageCreateSessionImportChunkParamsValidator>; result: void };
	[ImportSessionExtensionMethod]: { params: ValidatorType<typeof importSessionParamsValidator>; result: void };
	[MoveAgentHostSessionExtensionMethod]: { params: ValidatorType<typeof moveSessionParamsValidator>; result: { session: string } };
	[SetChatWorkspaceExtensionMethod]: { params: ValidatorType<typeof setChatWorkspaceParamsValidator>; result: void };
	[ReportAgentHostFirstResponseExtensionMethod]: { params: IAgentHostFirstResponseDiagnostic; result: void };
	[ReportChatUserInteractionExtensionMethod]: { params: IChatUserInteractionTiming; result: void };
	[ArtifactIntegrationExtensionMethod]: { params: ArtifactIntegrationRequest; result: ArtifactIntegrationResponse };
	[RegisterClientArtifactIntegrationsExtensionMethod]: { params: { readonly integrations: readonly ArtifactIntegrationDescriptor[] }; result: void };
	[ClientArtifactIntegrationUpdateExtensionMethod]: { params: ArtifactIntegrationUpdate; result: void };
	[ListAgentExtensionsExtensionMethod]: { params: ValidatorType<typeof listAgentExtensionsParamsValidator> | undefined; result: IAgentHostAgentExtensionInventoryResult };
	[SetAgentExtensionEnabledExtensionMethod]: { params: ValidatorType<typeof setAgentExtensionEnabledParamsValidator>; result: void };
	[DevContainerIsDockerAvailableExtensionMethod]: { params: undefined; result: boolean };
	[DevContainerConnectExtensionMethod]: { params: ValidatorType<typeof devContainerConnectParamsValidator>; result: IDevContainerAgentHostConnectResult };
	[DevContainerDisconnectExtensionMethod]: { params: ValidatorType<typeof devContainerConnectionParamsValidator>; result: void };
	[DevContainerStopExtensionMethod]: { params: ValidatorType<typeof devContainerWorkspaceParamsValidator>; result: boolean };
	[DevContainerRemoveExtensionMethod]: { params: ValidatorType<typeof devContainerWorkspaceParamsValidator>; result: boolean };
	[DevContainerRelaySendExtensionMethod]: { params: ValidatorType<typeof devContainerRelayMessageValidator>; result: void };
	[RemoveSessionArtifactExtensionMethod]: {
		params: ValidatorType<typeof removeSessionArtifactParamsValidator>;
		result: void;
	};
	[StopBackgroundWorkExtensionMethod]: {
		params: ValidatorType<typeof stopBackgroundWorkParamsValidator>;
		/** `stopped` is false when the work had already finished or the host no longer tracks it. */
		result: { stopped: boolean };
	};
	'shutdown': { params: undefined; result: void };
	'getNetworkDiagnosticsInfo': { params: undefined; result: IAgentHostNetworkDiagnosticsInfo };
	'getManagedSettingsDiagnostics': { params: undefined; result: readonly IAgentHostManagedSettingsDiagnostics[] };
	'diagnosticsFetch': { params: { url: string }; result: IAgentHostNetworkFetchResult };
	[GetAgentHostSessionStateFileExtensionMethod]: {
		params: { session: string; chat?: string };
		result: { resource?: string };
	};
	[CreateAgentHostDetachedWorktreeExtensionMethod]: {
		params: { session: string; prompt: string };
		result: { handle: string; resource: string };
	};
	[ClaimAgentHostDetachedWorktreeExtensionMethod]: {
		params: { handle: string };
		result: void;
	};
	[SetAgentHostDetachedWorktreeArchivedExtensionMethod]: {
		params: { handle: string; archived: boolean };
		result: void;
	};
	[DeleteAgentHostDetachedWorktreeExtensionMethod]: {
		params: { handle: string };
		result: void;
	};
	[ReconcileAgentHostDetachedWorktreesExtensionMethod]: {
		params: { scope: string; activeHandles: string[] };
		result: void;
	};
	[CollectAgentHostDebugLogsExtensionMethod]: {
		params: CollectAgentHostDebugLogsParams;
		result: { kind: AgentHostDebugLogsArtifactKind; resource: string; providerLogsIncluded: boolean; size: number; uncompressedSize: number; entries: readonly { path: string; size: number }[] };
	};
	[ReadAgentHostDebugLogsChunkExtensionMethod]: {
		params: { resource: string; position: number };
		/** `data` is base64; at most `AGENT_HOST_DEBUG_LOGS_CHUNK_BYTES` decoded bytes. */
		result: { data: string; eof: boolean };
	};
	[CancelAgentHostDebugLogsExtensionMethod]: {
		params: { progressToken: string };
		result: void;
	};
}

export interface IAgentHostExtensionNotificationMap {
	[ArtifactIntegrationUpdateNotification]: ArtifactIntegrationUpdate;
	[DevContainerRelayMessageNotification]: ValidatorType<typeof devContainerRelayMessageValidator>;
	[DevContainerRelayCloseNotification]: ValidatorType<typeof devContainerConnectionParamsValidator>;
	[DevContainerCloseConnectionNotification]: ValidatorType<typeof devContainerConnectionParamsValidator>;
	[DevContainerOutputNotification]: ValidatorType<typeof devContainerRelayMessageValidator>;
	[DevContainerSandboxSupportNotification]: ValidatorType<typeof devContainerSandboxSupportValidator>;
}

export interface IAgentHostWorkspaceTrustRequest {
	readonly workspace: string;
	readonly trustedParent?: string;
}

/**
 * Asks a client to silently supply a token for an MCP server challenge raised
 * in a session no client is attending, such as an automation run. Clients
 * MUST NOT prompt; they push any token they already hold through the regular
 * `authenticate` command before responding.
 */
export interface IAgentHostMcpAuthenticationRequest {
	/** Absent from hosts that predate targeted MCP authentication. */
	readonly target?: McpServerAuthenticateTarget;
	readonly serverName: string;
	readonly auth: McpAuthRequirement;
}

export interface IAgentHostExtensionServerCommandMap {
	[RequestAgentHostWorkspaceTrustExtensionMethod]: {
		params: IAgentHostWorkspaceTrustRequest;
		result: { trusted: boolean };
	};
	[ClientArtifactIntegrationExtensionMethod]: {
		params: ArtifactIntegrationRequest;
		result: ArtifactIntegrationResponse;
	};
	[RequestAgentHostMcpAuthenticationExtensionMethod]: {
		params: IAgentHostMcpAuthenticationRequest;
		result: { authenticated: boolean };
	};
}
