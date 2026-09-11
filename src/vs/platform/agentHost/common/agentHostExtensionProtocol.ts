/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { vBoolean, vEnum, vObj, vOptionalProp, vString, type ValidatorType } from '../../../base/common/validation.js';
import { Schemas } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
import type { AgentHostDebugLogsArtifactKind, IAgentHostManagedSettingsDiagnostics, IAgentHostNetworkDiagnosticsInfo, IAgentHostNetworkFetchResult } from './agentService.js';
import type { InitializeResult } from './state/protocol/common/commands.js';
import type { AgentHostCanvasJson, IAgentHostCanvasActionParams, IAgentHostCanvasInstance, IAgentHostCanvasOpenParams, IAgentHostCanvasState } from './agentHostCanvases.js';
import type { IAgentHostCanvasPackage } from './agentHostCanvasPackages.js';

export const CollectAgentHostDebugLogsExtensionMethod = 'vscode/collectAgentHostDebugLogs';
export const GetAgentHostSessionStateFileExtensionMethod = 'vscode/getAgentHostSessionStateFile';
export const CreateAgentHostDetachedWorktreeExtensionMethod = 'vscode/createAgentHostDetachedWorktree';
export const ClaimAgentHostDetachedWorktreeExtensionMethod = 'vscode/claimAgentHostDetachedWorktree';
export const DeleteAgentHostDetachedWorktreeExtensionMethod = 'vscode/deleteAgentHostDetachedWorktree';
export const ReconcileAgentHostDetachedWorktreesExtensionMethod = 'vscode/reconcileAgentHostDetachedWorktrees';
export const ReadAgentHostDebugLogsChunkExtensionMethod = 'vscode/readAgentHostDebugLogsChunk';
export const SetAgentHostDetachedWorktreeArchivedExtensionMethod = 'vscode/setAgentHostDetachedWorktreeArchived';
export const RequestAgentHostWorkspaceTrustExtensionMethod = 'vscode/requestWorkspaceTrust';
export const GetAgentHostCanvasesExtensionMethod = 'vscode/getCanvases';
export const OpenAgentHostCanvasExtensionMethod = 'vscode/openCanvas';
export const InvokeAgentHostCanvasActionExtensionMethod = 'vscode/invokeCanvasAction';
export const CloseAgentHostCanvasExtensionMethod = 'vscode/closeCanvas';
export const ReloadAgentHostCanvasesExtensionMethod = 'vscode/reloadCanvases';
export const ListCanvasPackagesExtensionMethod = 'vscode/listCanvasPackages';
export const PrepareCanvasPackageExtensionMethod = 'vscode/prepareCanvasPackage';
export const ApproveCanvasPackageExtensionMethod = 'vscode/approveCanvasPackage';
export const RevokeCanvasPackageExtensionMethod = 'vscode/revokeCanvasPackage';
export const RemoveCanvasPackageExtensionMethod = 'vscode/removeCanvasPackage';
export const AgentHostCanvasPreviewEnabledMetaKey = 'vscode.localCanvases.enabled';

const canvasPreviewMetaValidator = vObj({ [AgentHostCanvasPreviewEnabledMetaKey]: vOptionalProp(vBoolean()) });
const canvasPreviewInitializeValidator = vObj({ _meta: vOptionalProp(canvasPreviewMetaValidator) });

export type IAgentHostExtensionInitializeMeta = Readonly<ValidatorType<typeof canvasPreviewMetaValidator>> & Record<string, unknown>;

export function readAgentHostCanvasPreviewEnabled(source: unknown): boolean | undefined {
	// eslint-disable-next-line local/code-no-untyped-meta-access -- the namespaced handshake field is validated above.
	return canvasPreviewInitializeValidator.validate(source).content?._meta?.[AgentHostCanvasPreviewEnabledMetaKey];
}

const AgentHostChatStateFileCapabilityMetaKey = 'vscode.getAgentHostSessionStateFile.chat';
const AgentHostDetachedWorktreeCapabilityMetaKey = 'vscode.detachedWorktrees';
const AgentHostLocalCanvasesCapabilityMetaKey = 'vscode.localCanvases';
const AgentHostLocalCanvasWorkspaceMetaKey = 'vscode.localCanvases.workspace';
const AgentHostCanvasPackagesMetaKey = 'vscode.localCanvasPackages';

export interface IAgentHostExtensionInitializeResultMeta extends Record<string, unknown> {
	readonly [AgentHostChatStateFileCapabilityMetaKey]?: true;
	readonly [AgentHostDetachedWorktreeCapabilityMetaKey]?: true;
	readonly [AgentHostLocalCanvasesCapabilityMetaKey]?: true;
	readonly [AgentHostLocalCanvasWorkspaceMetaKey]?: string;
	readonly [AgentHostCanvasPackagesMetaKey]?: true;
}

export interface IAgentHostExtensionInitializeResult extends InitializeResult {
	readonly _meta?: IAgentHostExtensionInitializeResultMeta;
}

export function getAgentHostExtensionInitializeResultMeta(localCanvases = false, localCanvasWorkspace?: string, canvasPackages = false): IAgentHostExtensionInitializeResultMeta {
	return {
		[AgentHostChatStateFileCapabilityMetaKey]: true,
		[AgentHostDetachedWorktreeCapabilityMetaKey]: true,
		...(localCanvases ? { [AgentHostLocalCanvasesCapabilityMetaKey]: true as const } : {}),
		...(localCanvases && localCanvasWorkspace ? { [AgentHostLocalCanvasWorkspaceMetaKey]: localCanvasWorkspace } : {}),
		...(canvasPackages ? { [AgentHostCanvasPackagesMetaKey]: true as const } : {}),
	};
}

export function supportsAgentHostLocalCanvases(result: IAgentHostExtensionInitializeResult | undefined): boolean {
	const meta = result?._meta;
	return meta?.[AgentHostLocalCanvasesCapabilityMetaKey] === true;
}

export function supportsAgentHostCanvasPackages(result: IAgentHostExtensionInitializeResult | undefined): boolean {
	const meta = result?._meta;
	return meta?.[AgentHostCanvasPackagesMetaKey] === true;
}

export function isCanvasPackageExtensionMethod(method: string): boolean {
	return method === ListCanvasPackagesExtensionMethod || method === PrepareCanvasPackageExtensionMethod
		|| method === ApproveCanvasPackageExtensionMethod || method === RevokeCanvasPackageExtensionMethod
		|| method === RemoveCanvasPackageExtensionMethod;
}

export const prepareCanvasPackageValidator = vObj({ source: vString() });
export const approveCanvasPackageValidator = vObj({ id: vString(), revision: vString(), workspace: vOptionalProp(vString()) });
export const canvasPackageIdValidator = vObj({ id: vString() });

export function readAgentHostLocalCanvasWorkspace(result: IAgentHostExtensionInitializeResult | undefined): URI | undefined {
	const meta = result?._meta;
	const value = meta?.[AgentHostLocalCanvasWorkspaceMetaKey];
	if (!supportsAgentHostLocalCanvases(result) || typeof value !== 'string') {
		return undefined;
	}
	const uri = URI.parse(value, true);
	if (uri.scheme !== Schemas.file || !uri.path.startsWith('/') || uri.query || uri.fragment) {
		throw new Error('The local canvas demo workspace must be an absolute file URI.');
	}
	return uri;
}

export function isAgentHostCanvasExtensionMethod(method: string): boolean {
	return method === GetAgentHostCanvasesExtensionMethod
		|| method === OpenAgentHostCanvasExtensionMethod
		|| method === InvokeAgentHostCanvasActionExtensionMethod
		|| method === CloseAgentHostCanvasExtensionMethod
		|| method === ReloadAgentHostCanvasesExtensionMethod;
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

export interface IAgentHostExtensionCommandMap {
	[ListCanvasPackagesExtensionMethod]: { params: undefined; result: readonly IAgentHostCanvasPackage[] };
	[PrepareCanvasPackageExtensionMethod]: { params: { source: string }; result: IAgentHostCanvasPackage };
	[ApproveCanvasPackageExtensionMethod]: { params: { id: string; revision: string; workspace?: string }; result: void };
	[RevokeCanvasPackageExtensionMethod]: { params: { id: string }; result: void };
	[RemoveCanvasPackageExtensionMethod]: { params: { id: string }; result: void };
	[GetAgentHostCanvasesExtensionMethod]: { params: { chat: string }; result: IAgentHostCanvasState };
	[OpenAgentHostCanvasExtensionMethod]: { params: IAgentHostCanvasOpenParams & { chat: string }; result: IAgentHostCanvasInstance };
	[InvokeAgentHostCanvasActionExtensionMethod]: { params: IAgentHostCanvasActionParams & { chat: string }; result: AgentHostCanvasJson };
	[CloseAgentHostCanvasExtensionMethod]: { params: { chat: string; instanceId: string }; result: void };
	[ReloadAgentHostCanvasesExtensionMethod]: { params: { chat: string }; result: void };
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
