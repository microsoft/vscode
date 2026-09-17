/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { vEnum, vObj, vOptionalProp, vString, type ValidatorType } from '../../../base/common/validation.js';
import type { AgentHostDebugLogsArtifactKind, IAgentHostManagedSettingsDiagnostics, IAgentHostNetworkDiagnosticsInfo, IAgentHostNetworkFetchResult } from './agentService.js';
import type { InitializeResult } from './state/protocol/common/commands.js';
import { AgentHostArtifactRemovalCapabilityMetaKey } from './meta/agentHostArtifactRemovalMeta.js';
import { AgentWorkflowCapabilityMetaKey } from './meta/agentWorkflowMeta.js';
import type { WorkflowControl, WorkflowRun } from '../../workflow/common/workflow.js';
import type { IAgentHostWorkflowStartOptions } from './agentHostWorkflow.js';

export const GetWorkflowRunExtensionMethod = 'vscode/getWorkflowRun';
export const StartWorkflowExtensionMethod = 'vscode/startWorkflow';
export const ControlWorkflowExtensionMethod = 'vscode/controlWorkflow';
export const SetWorkflowSourceEnabledExtensionMethod = 'vscode/setWorkflowSourceEnabled';
export const SetWorkflowExtensionSourcesExtensionMethod = 'vscode/setWorkflowExtensionSources';
export const WorkflowRunChangedExtensionMethod = 'vscode/workflowRunChanged';

export { supportsAgentHostArtifactRemoval } from './meta/agentHostArtifactRemovalMeta.js';

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
	readonly [AgentWorkflowCapabilityMetaKey]?: true;
}

export interface IAgentHostExtensionInitializeResult extends InitializeResult {
	readonly _meta?: IAgentHostExtensionInitializeResultMeta;
}

export function getAgentHostExtensionInitializeResultMeta(artifactRemoval = true, workflows = false): IAgentHostExtensionInitializeResultMeta {
	return {
		[AgentHostChatStateFileCapabilityMetaKey]: true,
		[AgentHostDetachedWorktreeCapabilityMetaKey]: true,
		[AgentHostArtifactRemovalCapabilityMetaKey]: artifactRemoval ? true : undefined,
		...(workflows ? { [AgentWorkflowCapabilityMetaKey]: true as const } : {}),
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
	[GetWorkflowRunExtensionMethod]: { params: { session: string }; result: { run?: WorkflowRun } };
	[StartWorkflowExtensionMethod]: { params: IAgentHostWorkflowStartOptions; result: WorkflowRun };
	[ControlWorkflowExtensionMethod]: { params: WorkflowControl; result: WorkflowRun };
	[SetWorkflowSourceEnabledExtensionMethod]: { params: { sourceId: string; enabled: boolean }; result: void };
	[SetWorkflowExtensionSourcesExtensionMethod]: { params: { sources: Readonly<Record<string, boolean>> }; result: void };
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
