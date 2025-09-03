/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../base/common/network.js';

export enum ChatConfiguration {
	UseFileStorage = 'chat.useFileStorage',
	AgentEnabled = 'chat.agent.enabled',
	Edits2Enabled = 'chat.edits2.enabled',
	ExtensionToolsEnabled = 'chat.extensionTools.enabled',
	EditRequests = 'chat.editRequests',
	GlobalAutoApprove = 'chat.tools.global.autoApprove',
	AutoApproveEdits = 'chat.tools.edits.autoApprove',
	EnableMath = 'chat.math.enabled',
	CheckpointsEnabled = 'chat.checkpoints.enabled',
	AgentSessionsViewLocation = 'chat.agentSessionsViewLocation',
	ThinkingStyle = 'chat.agent.thinkingStyle',
	UseChatSessionsForCloudButton = 'chat.useChatSessionsForCloudButton',
	ShowAgentSessionsViewDescription = 'chat.showAgentSessionsViewDescription',
	EmptyStateHistoryEnabled = 'chat.emptyState.history.enabled'
}

/**
 * The "kind" of the chat mode- "Agent" for custom modes.
 */
export enum ChatModeKind {
	Ask = 'ask',
	Edit = 'edit',
	Agent = 'agent'
}

export function validateChatMode(mode: unknown): ChatModeKind | undefined {
	switch (mode) {
		case ChatModeKind.Ask:
		case ChatModeKind.Edit:
		case ChatModeKind.Agent:
			return mode as ChatModeKind;
		default:
			return undefined;
	}
}

export function isChatMode(mode: unknown): mode is ChatModeKind {
	return !!validateChatMode(mode);
}

// Thinking display modes for pinned content
export enum ThinkingDisplayMode {
	Collapsed = 'collapsed',
	CollapsedPreview = 'collapsedPreview',
	Expanded = 'expanded',
	None = 'none'
}

export type RawChatParticipantLocation = 'panel' | 'terminal' | 'notebook' | 'editing-session';

export enum ChatAgentLocation {
	Panel = 'panel',
	Terminal = 'terminal',
	Notebook = 'notebook',
	Editor = 'editor',
}

export namespace ChatAgentLocation {
	export function fromRaw(value: RawChatParticipantLocation | string): ChatAgentLocation {
		switch (value) {
			case 'panel': return ChatAgentLocation.Panel;
			case 'terminal': return ChatAgentLocation.Terminal;
			case 'notebook': return ChatAgentLocation.Notebook;
			case 'editor': return ChatAgentLocation.Editor;
		}
		return ChatAgentLocation.Panel;
	}
}

export const ChatUnsupportedFileSchemes = new Set([Schemas.vscodeChatEditor, Schemas.walkThrough, Schemas.vscodeChatSession, 'ccreq']);
