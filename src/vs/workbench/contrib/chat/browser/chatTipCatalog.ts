/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { localize } from '../../../../nls.js';
import { ContextKeyExpr, ContextKeyExpression } from '../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { ChatContextKeys } from '../common/actions/chatContextKeys.js';
import { ChatConfiguration, ChatModeKind } from '../common/constants.js';
import { localChatSessionType } from '../common/chatSessionsService.js';
import { ITipExclusionConfig } from './chatTipEligibilityTracker.js';
import { TipTrackingCommands } from './chatTipStorageKeys.js';
import {
	GENERATE_AGENT_COMMAND_ID,
	GENERATE_ON_DEMAND_INSTRUCTIONS_COMMAND_ID,
	GENERATE_PROMPT_COMMAND_ID,
	GENERATE_SKILL_COMMAND_ID,
} from './actions/chatActions.js';

/**
 * Context provided to tip builders for dynamic message construction.
 */
export interface ITipBuildContext {
	/**
	 * Keybinding service for looking up keyboard shortcuts.
	 */
	readonly keybindingService: IKeybindingService;
}

/**
 * Gets the display label for a command, looking it up from MenuRegistry.
 * Falls back to extracting a readable name from the command ID.
 */
export function getCommandLabel(commandId: string): string {
	const command = MenuRegistry.getCommand(commandId);
	if (command?.title) {
		// Handle both string and ILocalizedString formats
		return typeof command.title === 'string' ? command.title : command.title.value;
	}
	// Fallback: extract readable name from command ID
	// e.g., 'workbench.action.chat.openEditSession' -> 'openEditSession'
	const parts = commandId.split('.');
	return parts[parts.length - 1];
}

/**
 * Formats a keybinding for display in a tip message.
 * Returns empty string if no keybinding is bound.
 */
function formatKeybinding(ctx: ITipBuildContext, commandId: string): string {
	const kb = ctx.keybindingService.lookupKeybinding(commandId);
	return kb ? ` (${kb.getLabel()})` : '';
}

/**
 * Extracts command IDs from command: links in a markdown string.
 * Used to automatically populate enabledCommands for trusted markdown.
 */
export function extractCommandIds(markdown: string): string[] {
	const commandPattern = /\[.*?\]\(command:([^?\s)]+)/g;
	const commands = new Set<string>();
	let match;
	while ((match = commandPattern.exec(markdown)) !== null) {
		commands.add(match[1]);
	}
	return [...commands];
}

/**
 * Interface for tip definitions in the catalog.
 */
export interface ITipDefinition extends ITipExclusionConfig {
	readonly id: string;
	/**
	 * Builds the tip message dynamically at runtime.
	 * This enables keybindings and command labels to be looked up fresh.
	 * The returned MarkdownString should NOT include the "Tip:" prefix.
	 */
	buildMessage(ctx: ITipBuildContext): MarkdownString;
	/**
	 * When clause expression that determines if this tip is eligible to be shown.
	 */
	readonly when?: ContextKeyExpression;
	/**
	 * Chat model IDs for which this tip is eligible (lowercase).
	 */
	readonly onlyWhenModelIds?: readonly string[];
	/**
	 * Setting keys that, if changed from default, make this tip ineligible.
	 */
	readonly excludeWhenSettingsChanged?: readonly string[];
	/**
	 * Command IDs that dismiss this tip when clicked from the tip markdown.
	 */
	readonly dismissWhenCommandsClicked?: readonly string[];
}

// -----------------------------------------------------------------------------
// Tip Catalog
// -----------------------------------------------------------------------------

/**
 * Static catalog of tips. Tips are built dynamically at runtime to enable
 * keybindings and command labels to be resolved fresh.
 */
export const TIP_CATALOG: readonly ITipDefinition[] = [
	{
		id: 'tip.switchToAuto',
		buildMessage(ctx) {
			const label = getCommandLabel('workbench.action.chat.openModelPicker');
			const kb = formatKeybinding(ctx, 'workbench.action.chat.openModelPicker');
			return new MarkdownString(
				localize(
					'tip.switchToAuto',
					"Using gpt-4.1? Try switching to [{0}](command:workbench.action.chat.openModelPicker){1} for better coding performance.",
					label,
					kb
				)
			);
		},
		onlyWhenModelIds: ['gpt-4.1'],
	},
	{
		id: 'tip.createInstruction',
		buildMessage(ctx) {
			const kb = formatKeybinding(ctx, GENERATE_ON_DEMAND_INSTRUCTIONS_COMMAND_ID);
			return new MarkdownString(
				localize(
					'tip.createInstruction',
					"Use [{0}](command:{1}){2} to generate an on-demand instructions file with the agent.",
					'/create-instructions',
					GENERATE_ON_DEMAND_INSTRUCTIONS_COMMAND_ID,
					kb
				)
			);
		},
		when: ChatContextKeys.chatSessionType.isEqualTo(localChatSessionType),
		excludeWhenCommandsExecuted: [
			GENERATE_ON_DEMAND_INSTRUCTIONS_COMMAND_ID,
			TipTrackingCommands.CreateAgentInstructionsUsed,
		],
	},
	{
		id: 'tip.createPrompt',
		buildMessage(ctx) {
			const kb = formatKeybinding(ctx, GENERATE_PROMPT_COMMAND_ID);
			return new MarkdownString(
				localize(
					'tip.createPrompt',
					"Use [{0}](command:{1}){2} to generate a reusable prompt file with the agent.",
					'/create-prompt',
					GENERATE_PROMPT_COMMAND_ID,
					kb
				)
			);
		},
		when: ChatContextKeys.chatSessionType.isEqualTo(localChatSessionType),
		excludeWhenCommandsExecuted: [
			GENERATE_PROMPT_COMMAND_ID,
			TipTrackingCommands.CreatePromptUsed,
		],
	},
	{
		id: 'tip.createAgent',
		buildMessage(ctx) {
			const kb = formatKeybinding(ctx, GENERATE_AGENT_COMMAND_ID);
			return new MarkdownString(
				localize(
					'tip.createAgent',
					"Use [{0}](command:{1}){2} to scaffold a custom agent for your workflow.",
					'/create-agent',
					GENERATE_AGENT_COMMAND_ID,
					kb
				)
			);
		},
		when: ChatContextKeys.chatSessionType.isEqualTo(localChatSessionType),
		excludeWhenCommandsExecuted: [
			GENERATE_AGENT_COMMAND_ID,
			TipTrackingCommands.CreateAgentUsed,
		],
	},
	{
		id: 'tip.createSkill',
		buildMessage(ctx) {
			const kb = formatKeybinding(ctx, GENERATE_SKILL_COMMAND_ID);
			return new MarkdownString(
				localize(
					'tip.createSkill',
					"Use [{0}](command:{1}){2} to create a skill the agent can load when relevant.",
					'/create-skill',
					GENERATE_SKILL_COMMAND_ID,
					kb
				)
			);
		},
		when: ChatContextKeys.chatSessionType.isEqualTo(localChatSessionType),
		excludeWhenCommandsExecuted: [
			GENERATE_SKILL_COMMAND_ID,
			TipTrackingCommands.CreateSkillUsed,
		],
	},
	{
		id: 'tip.agentMode',
		buildMessage(ctx) {
			const label = getCommandLabel('workbench.action.chat.openEditSession');
			const kb = formatKeybinding(ctx, 'workbench.action.chat.openEditSession');
			return new MarkdownString(
				localize(
					'tip.agentMode',
					"Try [{0}](command:workbench.action.chat.openEditSession){1} to make edits across your project and run commands.",
					label,
					kb
				)
			);
		},
		when: ChatContextKeys.chatModeKind.notEqualsTo(ChatModeKind.Agent),
		excludeWhenModesUsed: [ChatModeKind.Agent],
	},
	{
		id: 'tip.planMode',
		buildMessage(ctx) {
			const kb = formatKeybinding(ctx, 'workbench.action.chat.openPlan');
			return new MarkdownString(
				localize(
					'tip.planMode',
					"Try the [{0}](command:workbench.action.chat.openPlan){1} to research and plan before implementing changes.",
					'Plan agent',
					kb
				)
			);
		},
		when: ChatContextKeys.chatModeName.notEqualsTo('Plan'),
		excludeWhenCommandsExecuted: ['workbench.action.chat.openPlan'],
		excludeWhenModesUsed: ['Plan'],
	},
	{
		id: 'tip.attachFiles',
		buildMessage() {
			return new MarkdownString(
				localize('tip.attachFiles', "Reference files or folders with # to give the agent more context about the task.")
			);
		},
		excludeWhenCommandsExecuted: [
			'workbench.action.chat.attachContext',
			'workbench.action.chat.attachFile',
			'workbench.action.chat.attachFolder',
			'workbench.action.chat.attachSelection',
			TipTrackingCommands.AttachFilesReferenceUsed,
		],
	},
	{
		id: 'tip.codeActions',
		buildMessage() {
			return new MarkdownString(
				localize('tip.codeActions', "Select a code block in the editor and right-click to access more AI actions.")
			);
		},
		excludeWhenCommandsExecuted: ['inlineChat.start'],
	},
	{
		id: 'tip.undoChanges',
		buildMessage() {
			return new MarkdownString(
				localize('tip.undoChanges', "Select \"Restore Checkpoint\" to undo changes after that point in the chat conversation.")
			);
		},
		when: ContextKeyExpr.and(
			ChatContextKeys.chatSessionType.isEqualTo(localChatSessionType),
			ContextKeyExpr.or(
				ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
				ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Edit),
			),
		),
		excludeWhenCommandsExecuted: ['workbench.action.chat.restoreCheckpoint', 'workbench.action.chat.restoreLastCheckpoint'],
	},
	{
		id: 'tip.messageQueueing',
		buildMessage() {
			return new MarkdownString(
				localize('tip.messageQueueing', "Steer the agent mid-task by sending follow-up messages. They queue and apply in order.")
			);
		},
		when: ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
		excludeWhenCommandsExecuted: ['workbench.action.chat.queueMessage', 'workbench.action.chat.steerWithMessage'],
	},
	{
		id: 'tip.yoloMode',
		buildMessage() {
			return new MarkdownString(
				localize(
					'tip.yoloMode',
					"Enable [{0}](command:workbench.action.openSettings?%5B%22{1}%22%5D) to give the agent full control without manual confirmation.",
					'auto approve',
					ChatConfiguration.GlobalAutoApprove
				)
			);
		},
		when: ContextKeyExpr.and(
			ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
			ContextKeyExpr.notEquals('config.chat.tools.global.autoApprove', true),
		),
		excludeWhenSettingsChanged: [ChatConfiguration.GlobalAutoApprove],
		dismissWhenCommandsClicked: ['workbench.action.openSettings'],
	},
	{
		id: 'tip.agenticBrowser',
		buildMessage() {
			return new MarkdownString(
				localize(
					'tip.agenticBrowser',
					"Enable [{0}](command:workbench.action.openSettings?%5B%22workbench.browser.enableChatTools%22%5D) to let the agent open and interact with pages in the Integrated Browser.",
					'agentic browser integration'
				)
			);
		},
		when: ContextKeyExpr.and(
			ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
			ContextKeyExpr.notEquals('config.workbench.browser.enableChatTools', true),
		),
		excludeWhenSettingsChanged: ['workbench.browser.enableChatTools'],
		dismissWhenCommandsClicked: ['workbench.action.openSettings'],
	},
	{
		id: 'tip.mermaid',
		buildMessage() {
			return new MarkdownString(
				localize('tip.mermaid', "Ask the agent to draw an architectural diagram or flow chart; it can render Mermaid diagrams directly in chat.")
			);
		},
		when: ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
		excludeWhenToolsInvoked: ['renderMermaidDiagram'],
	},
	{
		id: 'tip.subagents',
		buildMessage() {
			return new MarkdownString(
				localize('tip.subagents', "Ask the agent to work in parallel to complete large tasks faster.")
			);
		},
		when: ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
		excludeWhenToolsInvoked: ['runSubagent'],
	},
	{
		id: 'tip.thinkingPhrases',
		buildMessage() {
			return new MarkdownString(
				localize(
					'tip.thinkingPhrases',
					"Customize the loading messages shown while the agent works with [{0}](command:workbench.action.openSettings?%5B%22{1}%22%5D).",
					'thinking phrases',
					ChatConfiguration.ThinkingPhrases
				)
			);
		},
		when: ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
		excludeWhenSettingsChanged: [ChatConfiguration.ThinkingPhrases],
		dismissWhenCommandsClicked: ['workbench.action.openSettings'],
	},
];
