/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { InitializeResult } from '../state/protocol/common/commands.js';
import { AgentHostArtifactRemovalCapabilityMetaKey } from './agentHostArtifactRemovalMeta.js';
import { AgentHostAutonomousAutomationsCapabilityMetaKey } from './agentHostAutomationsMeta.js';
import { AgentHostDevContainersCapabilityMetaKey } from './agentHostDevContainersMeta.js';
import { AgentHostSessionImportCapabilityMetaKey } from './agentHostSessionImportMeta.js';
import { AgentHostTimingCapabilityMetaKey } from './agentHostTimingMeta.js';

const AgentHostChatStateFileCapabilityMetaKey = 'vscode.getAgentHostSessionStateFile.chat';
const AgentHostDetachedWorktreeCapabilityMetaKey = 'vscode.detachedWorktrees';
const AgentHostCanvasChatInitializationCapabilityMetaKey = 'vscode.initializeCanvasChat';

export interface IAgentHostExtensionInitializeResultMeta extends Record<string, unknown> {
	readonly [AgentHostChatStateFileCapabilityMetaKey]?: true;
	readonly [AgentHostDetachedWorktreeCapabilityMetaKey]?: true;
	readonly [AgentHostCanvasChatInitializationCapabilityMetaKey]?: true;
	readonly [AgentHostArtifactRemovalCapabilityMetaKey]?: true;
	readonly [AgentHostSessionImportCapabilityMetaKey]?: true;
	readonly [AgentHostDevContainersCapabilityMetaKey]?: true;
	readonly [AgentHostTimingCapabilityMetaKey]?: true;
	/** Present when Automation execution does not require a client activation or migration handshake. */
	readonly [AgentHostAutonomousAutomationsCapabilityMetaKey]?: true;
}

export interface IAgentHostExtensionInitializeResult extends InitializeResult {
	readonly _meta?: IAgentHostExtensionInitializeResultMeta;
}

export function getAgentHostExtensionInitializeResultMeta(canRemoveSessionArtifact = true, canUseDevContainers = false, timing = false, canImportSession = false, canInitializeCanvasChat = false): IAgentHostExtensionInitializeResultMeta {
	return {
		[AgentHostChatStateFileCapabilityMetaKey]: true,
		[AgentHostDetachedWorktreeCapabilityMetaKey]: true,
		[AgentHostAutonomousAutomationsCapabilityMetaKey]: true,
		[AgentHostArtifactRemovalCapabilityMetaKey]: canRemoveSessionArtifact ? true : undefined,
		...(canImportSession ? { [AgentHostSessionImportCapabilityMetaKey]: true as const } : {}),
		...(canUseDevContainers ? { [AgentHostDevContainersCapabilityMetaKey]: true as const } : {}),
		...(timing ? { [AgentHostTimingCapabilityMetaKey]: true as const } : {}),
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
