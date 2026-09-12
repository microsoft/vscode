/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { vEnum, vObj, vOptionalProp, vString, type ValidatorType } from '../../../base/common/validation.js';
import type { AgentHostDebugLogsArtifactKind, IAgentHostManagedSettingsDiagnostics, IAgentHostNetworkDiagnosticsInfo, IAgentHostNetworkFetchResult } from './agentService.js';
export { getAgentHostExtensionInitializeResultMeta, supportsAgentHostCanvasChatInitialization, supportsAgentHostChatStateFile, supportsAgentHostDetachedWorktrees, type IAgentHostExtensionInitializeResult, type IAgentHostExtensionInitializeResultMeta } from './meta/agentHostExtensionProtocolMeta.js';

export const CollectAgentHostDebugLogsExtensionMethod = 'vscode/collectAgentHostDebugLogs';
export const GetAgentHostSessionStateFileExtensionMethod = 'vscode/getAgentHostSessionStateFile';
export const CreateAgentHostDetachedWorktreeExtensionMethod = 'vscode/createAgentHostDetachedWorktree';
export const ClaimAgentHostDetachedWorktreeExtensionMethod = 'vscode/claimAgentHostDetachedWorktree';
export const DeleteAgentHostDetachedWorktreeExtensionMethod = 'vscode/deleteAgentHostDetachedWorktree';
export const ReconcileAgentHostDetachedWorktreesExtensionMethod = 'vscode/reconcileAgentHostDetachedWorktrees';
export const ReadAgentHostDebugLogsChunkExtensionMethod = 'vscode/readAgentHostDebugLogsChunk';
export const SetAgentHostDetachedWorktreeArchivedExtensionMethod = 'vscode/setAgentHostDetachedWorktreeArchived';
export const RequestAgentHostWorkspaceTrustExtensionMethod = 'vscode/requestWorkspaceTrust';
export const RequestAgentHostCanvasApprovalExtensionMethod = 'vscode/requestCanvasApproval';
export const CancelAgentHostCanvasApprovalExtensionMethod = 'vscode/cancelCanvasApproval';
export const InitializeCanvasChatExtensionMethod = 'vscode/initializeCanvasChat';
export const CancelCanvasChatInitializationExtensionMethod = 'vscode/cancelCanvasChatInitialization';

export const initializeCanvasChatParamsValidator = vObj({
	channel: vString(),
	requestId: vString(),
});

/** An exact chat and transport-scoped idempotency key for executable registry initialization. */
export type InitializeCanvasChatParams = ValidatorType<typeof initializeCanvasChatParamsValidator>;

export const collectAgentHostDebugLogsParamsValidator = vObj({
	session: vOptionalProp(vString()),
	chat: vOptionalProp(vString()),
	kind: vEnum('archive', 'directory'),
});

export type CollectAgentHostDebugLogsParams = ValidatorType<typeof collectAgentHostDebugLogsParamsValidator>;

export interface IAgentHostExtensionCommandMap {
	[InitializeCanvasChatExtensionMethod]: { params: InitializeCanvasChatParams; result: void };
	[CancelCanvasChatInitializationExtensionMethod]: { params: InitializeCanvasChatParams; result: void };
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

/** Out-of-turn, user-only approval. The nonce and exact chat are connection-bound. */
export interface IAgentHostCanvasApprovalRequest {
	readonly requestId: string;
	readonly chat: string;
	readonly message: string;
}

export interface IAgentHostExtensionServerCommandMap {
	[RequestAgentHostCanvasApprovalExtensionMethod]: {
		params: IAgentHostCanvasApprovalRequest;
		result: { requestId: string; approved: boolean };
	};
	[RequestAgentHostWorkspaceTrustExtensionMethod]: {
		params: IAgentHostWorkspaceTrustRequest;
		result: { trusted: boolean };
	};
}
