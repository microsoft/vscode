/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { vEnum, vObj, vOptionalProp, vString, type ValidatorType } from '../../../base/common/validation.js';
import type { IDevContainerAgentHostConnectResult } from './devContainerAgentHost.js';
import type { AgentHostDebugLogsArtifactKind, IAgentHostManagedSettingsDiagnostics, IAgentHostNetworkDiagnosticsInfo, IAgentHostNetworkFetchResult } from './agentService.js';
import type { InitializeResult } from './state/protocol/common/commands.js';
import { AgentHostArtifactRemovalCapabilityMetaKey } from './meta/agentHostArtifactRemovalMeta.js';
import { AgentHostDevContainersCapabilityMetaKey } from './meta/agentHostDevContainersMeta.js';

export { supportsAgentHostArtifactRemoval } from './meta/agentHostArtifactRemovalMeta.js';
export { supportsAgentHostDevContainers } from './meta/agentHostDevContainersMeta.js';

export const DevContainerIsDockerAvailableExtensionMethod = 'vscode/devContainers/isDockerAvailable';
export const DevContainerConnectExtensionMethod = 'vscode/devContainers/connect';
export const DevContainerDisconnectExtensionMethod = 'vscode/devContainers/disconnect';
export const DevContainerRelaySendExtensionMethod = 'vscode/devContainers/relaySend';
export const DevContainerRelayMessageNotification = 'vscode/devContainers/relayMessage';
export const DevContainerRelayCloseNotification = 'vscode/devContainers/relayClose';
export const DevContainerCloseConnectionNotification = 'vscode/devContainers/closeConnection';
export const DevContainerOutputNotification = 'vscode/devContainers/output';

export const devContainerConnectionParamsValidator = vObj({ connectionId: vString() });
export const devContainerConnectParamsValidator = vObj({ connectionId: vString(), workspaceFolder: vString(), name: vString() });
export const devContainerRelayMessageValidator = vObj({ connectionId: vString(), data: vString() });
export const devContainerConnectResultValidator = vObj({
	connectionId: vString(),
	address: vString(),
	name: vString(),
	remoteWorkspaceFolder: vString(),
	hostWorkspaceFolder: vOptionalProp(vString()),
});

export const CollectAgentHostDebugLogsExtensionMethod = 'vscode/collectAgentHostDebugLogs';
export const GetAgentHostSessionStateFileExtensionMethod = 'vscode/getAgentHostSessionStateFile';
export const CreateAgentHostDetachedWorktreeExtensionMethod = 'vscode/createAgentHostDetachedWorktree';
export const ClaimAgentHostDetachedWorktreeExtensionMethod = 'vscode/claimAgentHostDetachedWorktree';
export const DeleteAgentHostDetachedWorktreeExtensionMethod = 'vscode/deleteAgentHostDetachedWorktree';
export const ReconcileAgentHostDetachedWorktreesExtensionMethod = 'vscode/reconcileAgentHostDetachedWorktrees';
export const ReadAgentHostDebugLogsChunkExtensionMethod = 'vscode/readAgentHostDebugLogsChunk';
export const SetAgentHostDetachedWorktreeArchivedExtensionMethod = 'vscode/setAgentHostDetachedWorktreeArchived';
export const RequestAgentHostWorkspaceTrustExtensionMethod = 'vscode/requestWorkspaceTrust';
export const RemoveSessionArtifactExtensionMethod = 'vscode/removeSessionArtifact';

const AgentHostChatStateFileCapabilityMetaKey = 'vscode.getAgentHostSessionStateFile.chat';
const AgentHostDetachedWorktreeCapabilityMetaKey = 'vscode.detachedWorktrees';

export interface IAgentHostExtensionInitializeResultMeta extends Record<string, unknown> {
	readonly [AgentHostChatStateFileCapabilityMetaKey]?: true;
	readonly [AgentHostDetachedWorktreeCapabilityMetaKey]?: true;
	readonly [AgentHostArtifactRemovalCapabilityMetaKey]?: true;
	readonly [AgentHostDevContainersCapabilityMetaKey]?: true;
}

export interface IAgentHostExtensionInitializeResult extends InitializeResult {
	readonly _meta?: IAgentHostExtensionInitializeResultMeta;
}

export function getAgentHostExtensionInitializeResultMeta(artifactRemoval = true, devContainers = false): IAgentHostExtensionInitializeResultMeta {
	return {
		[AgentHostChatStateFileCapabilityMetaKey]: true,
		[AgentHostDetachedWorktreeCapabilityMetaKey]: true,
		[AgentHostArtifactRemovalCapabilityMetaKey]: artifactRemoval ? true : undefined,
		...(devContainers ? { [AgentHostDevContainersCapabilityMetaKey]: true as const } : {}),
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

export const collectAgentHostDebugLogsParamsValidator = vObj({
	session: vOptionalProp(vString()),
	chat: vOptionalProp(vString()),
	kind: vEnum('archive', 'directory'),
});

export type CollectAgentHostDebugLogsParams = ValidatorType<typeof collectAgentHostDebugLogsParamsValidator>;

export const removeSessionArtifactParamsValidator = vObj({
	session: vString(),
	artifactId: vString(),
});

export interface IAgentHostExtensionCommandMap {
	[DevContainerIsDockerAvailableExtensionMethod]: { params: undefined; result: boolean };
	[DevContainerConnectExtensionMethod]: { params: ValidatorType<typeof devContainerConnectParamsValidator>; result: IDevContainerAgentHostConnectResult };
	[DevContainerDisconnectExtensionMethod]: { params: ValidatorType<typeof devContainerConnectionParamsValidator>; result: void };
	[DevContainerRelaySendExtensionMethod]: { params: ValidatorType<typeof devContainerRelayMessageValidator>; result: void };
	[RemoveSessionArtifactExtensionMethod]: {
		params: ValidatorType<typeof removeSessionArtifactParamsValidator>;
		result: void;
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
}

export interface IAgentHostExtensionNotificationMap {
	[DevContainerRelayMessageNotification]: ValidatorType<typeof devContainerRelayMessageValidator>;
	[DevContainerRelayCloseNotification]: ValidatorType<typeof devContainerConnectionParamsValidator>;
	[DevContainerCloseConnectionNotification]: ValidatorType<typeof devContainerConnectionParamsValidator>;
	[DevContainerOutputNotification]: ValidatorType<typeof devContainerRelayMessageValidator>;
}

export interface IAgentHostWorkspaceTrustRequest {
	readonly workspace: string;
	readonly trustedParent?: string;
}

export interface IAgentHostExtensionServerCommandMap {
	[RequestAgentHostWorkspaceTrustExtensionMethod]: {
		params: IAgentHostWorkspaceTrustRequest;
		result: { trusted: boolean };
	};
}
