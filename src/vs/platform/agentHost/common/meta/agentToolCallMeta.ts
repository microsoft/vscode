/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ToolCallState, ToolDefinition } from '../state/protocol/state.js';
import type { IAgentMetadataSource } from './metadata.js';
import { hasVSCodeToolCallMeta, readToolCallMeta as readVSCodeToolCallMeta } from './vscode/agentToolCallMeta.js';
import { readCopilotToolOutputDelta, withCopilotToolPreferences } from './copilotd/copilotdMetadataReader.js';

export { isPresentationOnlyToolCall, toToolCallMeta } from './vscode/agentToolCallMeta.js';
export type { AgentFusionPhaseStatus, IFusionPhaseMeta, IToolCallMeta, IToolCallUiMeta, IToolSearchCandidate, ToolKind } from './vscode/agentToolCallMeta.js';

export interface IAgentToolOutputChunk {
	readonly output: string;
	readonly isPty: boolean;
}

export interface IAgentClientToolPreferences {
	readonly defer?: 'auto' | 'never';
	readonly availability?: 'session' | 'userChats';
}

export function readToolCallMeta(source: IAgentMetadataSource) {
	return readVSCodeToolCallMeta(source);
}

export function readAgentToolOutputDelta(action: IAgentMetadataSource, initial: Pick<ToolCallState, '_meta'>, current: Pick<ToolCallState, '_meta'>): IAgentToolOutputChunk | undefined {
	return hasVSCodeToolCallMeta(initial) || hasVSCodeToolCallMeta(current) ? undefined : readCopilotToolOutputDelta(action);
}

export function withAgentToolPreferences<T extends ToolDefinition>(tool: T, preferences: IAgentClientToolPreferences | undefined): T {
	return withCopilotToolPreferences(tool, preferences);
}
