/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { UsageInfo } from '../state/protocol/common/state.js';
import { hasAgentMetadata } from './metadata.js';
import { readCopilotUsageDetail } from './copilotd/copilotdMetadataReader.js';
import { agentModelCallMetaKey, readAgentModelCallDiagnostics } from './vscode/agentModelCallMeta.js';

export { agentModelCallMetaKey, readAgentModelCallDiagnostics } from './vscode/agentModelCallMeta.js';
export type { IAgentModelCallDiagnostics } from './vscode/agentModelCallMeta.js';

export interface IAgentModelCallDetail {
	readonly apiCallId?: string;
	readonly providerCallId?: string;
	readonly serviceRequestId?: string;
	readonly durationMs?: number;
	readonly timeToFirstTokenMs?: number;
	readonly reasoningTokens?: number;
}

export function readAgentModelCallDetail(usage: UsageInfo): IAgentModelCallDetail | undefined {
	if (hasAgentMetadata(usage, [agentModelCallMetaKey])) {
		return readAgentModelCallDiagnostics(usage);
	}
	const detail = readCopilotUsageDetail(usage);
	return detail ? {
		apiCallId: detail.apiCallId,
		providerCallId: detail.providerCallId,
		serviceRequestId: detail.serviceRequestId,
		durationMs: detail.duration,
		timeToFirstTokenMs: detail.timeToFirstTokenMs,
		reasoningTokens: detail.reasoningTokens,
	} : undefined;
}
