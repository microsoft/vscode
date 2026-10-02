/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { UsageInfo } from '../../state/protocol/common/state.js';

export const agentModelConfigurationMetaKey = 'vscode.modelConfiguration';

export interface IAgentRuntimeModelConfiguration {
	readonly reasoningEffort?: string;
	readonly contextTier?: string;
}

/** Reads the runtime's resolved model options, which can arrive after a turn starts. */
export function readAgentRuntimeModelConfiguration(usage: UsageInfo | undefined): IAgentRuntimeModelConfiguration | undefined {
	const value = usage?._meta?.[agentModelConfigurationMetaKey];
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const { reasoningEffort, contextTier }: { reasoningEffort?: unknown; contextTier?: unknown } = value;
	if ((reasoningEffort !== undefined && (typeof reasoningEffort !== 'string' || !reasoningEffort.length || reasoningEffort.length > 100))
		|| (contextTier !== undefined && (typeof contextTier !== 'string' || !contextTier.length || contextTier.length > 100))) {
		return undefined;
	}
	return {
		...(typeof reasoningEffort === 'string' ? { reasoningEffort } : {}),
		...(typeof contextTier === 'string' ? { contextTier } : {}),
	};
}
