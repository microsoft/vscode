/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hasKey } from '../../../../base/common/types.js';
import { ToolCallStatus, type StringOrMarkdown, type ToolCallState, type ToolDefinition } from '../state/protocol/state.js';
import type { IAgentMetadataSource } from './metadata.js';
import { hasVSCodeToolCallMeta, readToolCallMeta as readVSCodeToolCallMeta, type ToolKind } from './vscode/agentToolCallMeta.js';
import { readCopilotToolOutputDelta, withCopilotToolPreferences } from './copilotd/copilotdMetadataReader.js';
import { readCopilotToolPresentation, readCopilotWritePermissionPresentation } from './copilotd/toolPresentation.js';

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

export interface IToolCallPresentation {
	readonly toolKind?: ToolKind;
	readonly invocationMessage?: StringOrMarkdown;
	readonly pastTenseMessage?: StringOrMarkdown;
	readonly confirmationTitle?: StringOrMarkdown;
}

export function readToolCallPresentation(call: ToolCallState): IToolCallPresentation {
	const metadata = readVSCodeToolCallMeta(call);
	const fallback = hasVSCodeToolCallMeta(call) ? undefined : readCopilotToolPresentation(call);
	const permission = hasVSCodeToolCallMeta(call) ? undefined : readCopilotWritePermissionPresentation(call);
	const invocation = permission?.invocationMessage ?? call.invocationMessage;
	const pastTense = hasKey(call, { pastTenseMessage: true }) ? call.pastTenseMessage : undefined;
	const genericInvocation = invocation === undefined || typeof invocation === 'string'
		&& ['Running tool', `Running ${call.displayName}`, `Running ${call.toolName}`].includes(invocation.trim());
	const genericCompletion = pastTense === undefined || typeof pastTense === 'string'
		&& ['Tool finished', `Ran ${call.displayName}`, `Ran ${call.toolName}`].includes(pastTense.trim());
	return {
		toolKind: metadata.toolKind ?? (genericInvocation || call.status === ToolCallStatus.Completed && genericCompletion ? fallback?.toolKind : undefined),
		invocationMessage: fallback && genericInvocation
			? call.status === ToolCallStatus.Completed && !call.success ? fallback.pastTenseMessage : fallback.invocationMessage
			: invocation,
		pastTenseMessage: fallback && genericCompletion ? fallback.pastTenseMessage : pastTense,
		...(permission?.confirmationTitle ? { confirmationTitle: permission.confirmationTitle } : {}),
	};
}

export function readAgentToolOutputDelta(action: IAgentMetadataSource, initial: Pick<ToolCallState, '_meta'>, current: Pick<ToolCallState, '_meta'>): IAgentToolOutputChunk | undefined {
	return hasVSCodeToolCallMeta(initial) || hasVSCodeToolCallMeta(current) ? undefined : readCopilotToolOutputDelta(action);
}

export function withAgentToolPreferences<T extends ToolDefinition>(tool: T, preferences: IAgentClientToolPreferences | undefined): T {
	return withCopilotToolPreferences(tool, preferences);
}
