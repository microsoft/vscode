/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export enum ChatConfiguration {
	UseFileStorage = 'chat.useFileStorage',
	AgentEnabled = 'chat.agent.enabled',
	Edits2Enabled = 'chat.edits2.enabled',
	ExtensionToolsEnabled = 'chat.extensionTools.enabled',
	EditRequests = 'chat.editRequests',
	EnableMath = 'chat.math.enabled',
	CheckpointsEnabled = 'chat.checkpoints.enabled',
	AgentSessionsViewLocation = 'chat.agentSessionsViewLocation',
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
