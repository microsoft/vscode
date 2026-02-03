/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../base/common/network.js';
import { IChatSessionsService } from './chatSessionsService.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';

export enum ChatConfiguration {
	AIDisabled = 'chat.disableAIFeatures',
	AgentEnabled = 'chat.agent.enabled',
	RequestQueueingEnabled = 'chat.requestQueuing.enabled',
	AgentStatusEnabled = 'chat.agentsControl.enabled',
	EditorAssociations = 'chat.editorAssociations',
	UnifiedAgentsBar = 'chat.unifiedAgentsBar.enabled',
	AgentSessionProjectionEnabled = 'chat.agentSessionProjection.enabled',
	EditModeHidden = 'chat.editMode.hidden',
	AlternativeToolAction = 'chat.alternativeToolAction.enabled',
	Edits2Enabled = 'chat.edits2.enabled',
	ExtensionToolsEnabled = 'chat.extensionTools.enabled',
	RepoInfoEnabled = 'chat.repoInfo.enabled',
	EditRequests = 'chat.editRequests',
	InlineReferencesStyle = 'chat.inlineReferences.style',
	GlobalAutoApprove = 'chat.tools.global.autoApprove',
	AutoApproveEdits = 'chat.tools.edits.autoApprove',
	AutoApprovedUrls = 'chat.tools.urls.autoApprove',
	EligibleForAutoApproval = 'chat.tools.eligibleForAutoApproval',
	EnableMath = 'chat.math.enabled',
	CheckpointsEnabled = 'chat.checkpoints.enabled',
	ThinkingStyle = 'chat.agent.thinkingStyle',
	ThinkingGenerateTitles = 'chat.agent.thinking.generateTitles',
	TerminalToolsInThinking = 'chat.agent.thinking.terminalTools',
	AutoExpandToolFailures = 'chat.tools.autoExpandFailures',
	TodosShowWidget = 'chat.tools.todos.showWidget',
	NotifyWindowOnResponseReceived = 'chat.notifyWindowOnResponseReceived',
	ChatViewSessionsEnabled = 'chat.viewSessions.enabled',
	ChatViewSessionsGrouping = 'chat.viewSessions.grouping',
	ChatViewSessionsOrientation = 'chat.viewSessions.orientation',
	ChatViewProgressBadgeEnabled = 'chat.viewProgressBadge.enabled',
	SubagentToolCustomAgents = 'chat.customAgentInSubagent.enabled',
	ShowCodeBlockProgressAnimation = 'chat.agent.codeBlockProgress',
	RestoreLastPanelSession = 'chat.restoreLastPanelSession',
	ExitAfterDelegation = 'chat.exitAfterDelegation',
	AgentsControlClickBehavior = 'chat.agentsControl.clickBehavior',
	ExplainChangesEnabled = 'chat.editing.explainChanges.enabled',
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
	Collapsed = 'collapsed',
	CollapsedPreview = 'collapsedPreview',
	FixedScrolling = 'fixedScrolling',
}

export enum CollapsedToolsDisplayMode {
	Off = 'off',
	WithThinking = 'withThinking',
	Always = 'always',
}

export enum AgentsControlClickBehavior {
	Default = 'default',
	Cycle = 'cycle',
	Focus = 'focus',
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
	Schemas.vscodeLocalChatSession,
	Schemas.vscodeSettings,
	Schemas.webviewPanel,
	Schemas.vscodeUserData,
	Schemas.extension,
	'ccreq',
	'openai-codex', // Codex session custom editor scheme
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

export const MANAGE_CHAT_COMMAND_ID = 'workbench.action.chat.manage';
export const ChatEditorTitleMaxLength = 30;

export const CHAT_TERMINAL_OUTPUT_MAX_PREVIEW_LINES = 1000;
export const CONTEXT_MODELS_EDITOR = new RawContextKey<boolean>('inModelsEditor', false);
export const CONTEXT_MODELS_SEARCH_FOCUS = new RawContextKey<boolean>('inModelsSearch', false);
