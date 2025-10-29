/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../base/common/network.js';
import { IChatSessionsService } from './chatSessionsService.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';

export enum ChatConfiguration {
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
	TodosShowWidget = 'chat.tools.todos.showWidget',
	UseCloudButtonV2 = 'chat.useCloudButtonV2',
	ShowAgentSessionsViewDescription = 'chat.showAgentSessionsViewDescription',
	EmptyStateHistoryEnabled = 'chat.emptyState.history.enabled',
	NotifyWindowOnResponseReceived = 'chat.notifyWindowOnResponseReceived',
}

/**
 * The "kind" of agents for custom agents.
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
	Default = 'default',
	Collapsed = 'collapsed',
	CollapsedPreview = 'collapsedPreview',
	Expanded = 'expanded',
	None = 'none',
	CollapsedPerItem = 'collapsedPerItem',
	FixedScrolling = 'fixedScrolling',
	FixedScrollingTools = 'fixedScrollingTools'
}

export type RawChatParticipantLocation = 'panel' | 'terminal' | 'notebook' | 'editing-session';

export enum ChatAgentLocation {
	/**
	 * This is chat, whether it's in the sidebar, a chat editor, or quick chat.
	 * Leaving the values alone as they are in stored data so we don't have to normalize them.
	 */
	Chat = 'panel',
	Terminal = 'terminal',
	Notebook = 'notebook',
	/**
	 * EditorInline means inline chat in a text editor.
	 */
	EditorInline = 'editor',
}

export namespace ChatAgentLocation {
	export function fromRaw(value: RawChatParticipantLocation | string): ChatAgentLocation {
		switch (value) {
			case 'panel': return ChatAgentLocation.Chat;
			case 'terminal': return ChatAgentLocation.Terminal;
			case 'notebook': return ChatAgentLocation.Notebook;
			case 'editor': return ChatAgentLocation.EditorInline;
		}
		return ChatAgentLocation.Chat;
	}
}

/**
 * List of file schemes that are always unsupported for use in chat
 */
const chatAlwaysUnsupportedFileSchemes = new Set([
	Schemas.vscodeChatEditor,
	Schemas.walkThrough,
	Schemas.vscodeChatSession,
	Schemas.vscodeSettings,
	Schemas.webviewPanel,
	'ccreq',
]);

export function isSupportedChatFileScheme(accessor: ServicesAccessor, scheme: string): boolean {
	const chatService = accessor.get(IChatSessionsService);

	// Exclude schemes we always know are bad
	if (chatAlwaysUnsupportedFileSchemes.has(scheme)) {
		return false;
	}

	// Plus any schemes used by content providers
	if (chatService.getContentProviderSchemes().includes(scheme)) {
		return false;
	}

	// Everything else is supported
	return true;
}

export const AGENT_SESSIONS_VIEWLET_ID = 'workbench.view.chat.sessions'; // TODO@bpasero clear once settled

export const ChatEditorTitleMaxLength = 30;
