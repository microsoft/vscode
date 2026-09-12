/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { InitializeResult } from '../state/protocol/common/commands.js';

const AgentHostChatStateFileCapabilityMetaKey = 'vscode.getAgentHostSessionStateFile.chat';
const AgentHostDetachedWorktreeCapabilityMetaKey = 'vscode.detachedWorktrees';
const AgentHostCanvasChatInitializationCapabilityMetaKey = 'vscode.initializeCanvasChat';

export interface IAgentHostExtensionInitializeResultMeta extends Record<string, unknown> {
	readonly [AgentHostChatStateFileCapabilityMetaKey]?: true;
	readonly [AgentHostDetachedWorktreeCapabilityMetaKey]?: true;
	readonly [AgentHostCanvasChatInitializationCapabilityMetaKey]?: true;
}

export interface IAgentHostExtensionInitializeResult extends InitializeResult {
	readonly _meta?: IAgentHostExtensionInitializeResultMeta;
}

export function getAgentHostExtensionInitializeResultMeta(canInitializeCanvasChat = false): IAgentHostExtensionInitializeResultMeta {
	return {
		[AgentHostChatStateFileCapabilityMetaKey]: true,
		[AgentHostDetachedWorktreeCapabilityMetaKey]: true,
		...(canInitializeCanvasChat ? { [AgentHostCanvasChatInitializationCapabilityMetaKey]: true as const } : {}),
	};
}

export function supportsAgentHostCanvasChatInitialization(result: IAgentHostExtensionInitializeResult | undefined): boolean {
	return result?.canvases !== undefined && result._meta?.[AgentHostCanvasChatInitializationCapabilityMetaKey] === true;
}

export function supportsAgentHostChatStateFile(result: IAgentHostExtensionInitializeResult | undefined): boolean {
	return result?._meta?.[AgentHostChatStateFileCapabilityMetaKey] === true;
}

export function supportsAgentHostDetachedWorktrees(result: IAgentHostExtensionInitializeResult | undefined): boolean {
	return result?._meta?.[AgentHostDetachedWorktreeCapabilityMetaKey] === true;
}
