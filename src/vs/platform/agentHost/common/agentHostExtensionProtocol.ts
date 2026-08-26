/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { vEnum, vObj, vOptionalProp, vString, type ValidatorType } from '../../../base/common/validation.js';
import type { AgentHostDebugLogsArtifactKind, IAgentHostManagedSettingsDiagnostics, IAgentHostNetworkDiagnosticsInfo, IAgentHostNetworkFetchResult } from './agentService.js';
import type { InitializeResult } from './state/protocol/common/commands.js';

export const CollectAgentHostDebugLogsExtensionMethod = 'vscode/collectAgentHostDebugLogs';
export const GetAgentHostSessionStateFileExtensionMethod = 'vscode/getAgentHostSessionStateFile';
export const ReadAgentHostDebugLogsChunkExtensionMethod = 'vscode/readAgentHostDebugLogsChunk';

const AgentHostChatStateFileCapabilityMetaKey = 'vscode.getAgentHostSessionStateFile.chat';

export function getAgentHostExtensionInitializeResultMeta(): Record<string, unknown> {
	return { [AgentHostChatStateFileCapabilityMetaKey]: true };
}

export function supportsAgentHostChatStateFile(result: InitializeResult | undefined): boolean {
	// eslint-disable-next-line local/code-no-untyped-meta-access -- sanctioned reader for the namespaced Agent Host capability slot.
	return result?._meta?.[AgentHostChatStateFileCapabilityMetaKey] === true;
}

export const collectAgentHostDebugLogsParamsValidator = vObj({
	session: vOptionalProp(vString()),
	chat: vOptionalProp(vString()),
	kind: vEnum('archive', 'directory'),
});

export type CollectAgentHostDebugLogsParams = ValidatorType<typeof collectAgentHostDebugLogsParamsValidator>;

export interface IAgentHostExtensionCommandMap {
	'shutdown': { params: undefined; result: void };
	'getNetworkDiagnosticsInfo': { params: undefined; result: IAgentHostNetworkDiagnosticsInfo };
	'getManagedSettingsDiagnostics': { params: undefined; result: readonly IAgentHostManagedSettingsDiagnostics[] };
	'diagnosticsFetch': { params: { url: string }; result: IAgentHostNetworkFetchResult };
	[GetAgentHostSessionStateFileExtensionMethod]: {
		params: { session: string; chat?: string };
		result: { resource?: string };
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
