/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export enum ChatConfiguration {
	UseFileStorage = 'chat.useFileStorage',
	AgentEnabled = 'chat.agent.enabled',
	Edits2Enabled = 'chat.edits2.enabled',
	ExtensionToolsEnabled = 'chat.extensionTools.enabled',
}

export enum ChatMode {
	Ask = 'ask',
	Edit = 'edit',
	Agent = 'agent'
}

export function modeToString(mode: ChatMode) {
	switch (mode) {
		case ChatMode.Agent:
			return 'Agent';
		case ChatMode.Edit:
			return 'Edit';
		case ChatMode.Ask:
		default:
			return 'Ask';
	}
}

export function validateChatMode(mode: unknown): ChatMode | undefined {
	switch (mode) {
		case ChatMode.Ask:
		case ChatMode.Edit:
		case ChatMode.Agent:
			return mode as ChatMode;
		default:
			return undefined;
	}
}

export function isChatMode(mode: unknown): mode is ChatMode {
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
