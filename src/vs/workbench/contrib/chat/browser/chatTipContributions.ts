/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ChatContextKeys } from '../common/actions/chatContextKeys.js';
import { ChatModeKind } from '../common/constants.js';
import { localChatSessionType } from '../common/chatSessionsService.js';
import { TipTrackingCommands } from './chatTipStorageKeys.js';
import { ChatTipTier, formatKeybinding, getCommandLabel } from './chatTipCatalog.js';
import { IChatTipService } from './chatTipService.js';
import {
	GENERATE_AGENT_COMMAND_ID,
	GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID,
	GENERATE_PROMPT_COMMAND_ID,
	GENERATE_SKILL_COMMAND_ID,
	INSERT_FORK_CONVERSATION_COMMAND_ID,
} from './actions/chatActions.js';

/**
 * Registers the built-in chat tips that do not require custom eligibility
 * logic beyond what the tip service already handles (when clauses,
 * excludeWhenCommandsExecuted, etc.). Tips with complex eligibility like
 * tip.yoloMode and tip.thinkingPhrases have their own contributions.
 */
export class ChatTipsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'chat.tipsContribution';

	constructor(
		@IKeybindingService keybindingService: IKeybindingService,
		@IChatTipService chatTipService: IChatTipService,
	) {
		super();

		this._register(chatTipService.registerTip({
			id: 'tip.switchToAuto',
			tier: ChatTipTier.Foundational,
			priority: 0,
			message: new MarkdownString(
				localize(
					'tip.switchToAuto',
					"Using gpt-4.1? Try switching to [{0}](command:workbench.action.chat.openModelPicker){1} for better coding performance.",
					getCommandLabel('workbench.action.chat.openModelPicker'),
					formatKeybinding(keybindingService, 'workbench.action.chat.openModelPicker')
				)
			),
			onlyWhenModelIds: ['gpt-4.1'],
		}));

		this._register(chatTipService.registerTip({
			id: 'tip.init',
			tier: ChatTipTier.Foundational,
			priority: 50,
			message: new MarkdownString(
				localize(
					'tip.init',
					"Use [{0}](command:{1}){2} to generate or update a workspace instructions file for AI coding agents.",
					'/init',
					GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID,
					formatKeybinding(keybindingService, GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID)
				)
			),
			when: ChatContextKeys.chatSessionType.isEqualTo(localChatSessionType),
			excludeWhenCommandsExecuted: [
				GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID,
				TipTrackingCommands.CreateAgentInstructionsUsed,
			],
		}));

		this._register(chatTipService.registerTip({
			id: 'tip.createPrompt',
			tier: ChatTipTier.Foundational,
			message: new MarkdownString(
				localize(
					'tip.createPrompt',
					"Use [{0}](command:{1}){2} to generate a reusable prompt file with the agent.",
					'/create-prompt',
					GENERATE_PROMPT_COMMAND_ID,
					formatKeybinding(keybindingService, GENERATE_PROMPT_COMMAND_ID)
				)
			),
			when: ChatContextKeys.chatSessionType.isEqualTo(localChatSessionType),
			excludeWhenCommandsExecuted: [
				GENERATE_PROMPT_COMMAND_ID,
				TipTrackingCommands.CreatePromptUsed,
			],
		}));

		this._register(chatTipService.registerTip({
			id: 'tip.createAgent',
			tier: ChatTipTier.Foundational,
			priority: 30,
			message: new MarkdownString(
				localize(
					'tip.createAgent',
					"Use [{0}](command:{1}){2} to scaffold a custom agent for your workflow.",
					'/create-agent',
					GENERATE_AGENT_COMMAND_ID,
					formatKeybinding(keybindingService, GENERATE_AGENT_COMMAND_ID)
				)
			),
			when: ChatContextKeys.chatSessionType.isEqualTo(localChatSessionType),
			excludeWhenCommandsExecuted: [
				GENERATE_AGENT_COMMAND_ID,
				TipTrackingCommands.CreateAgentUsed,
			],
		}));

		this._register(chatTipService.registerTip({
			id: 'tip.createSkill',
			tier: ChatTipTier.Foundational,
			priority: 40,
			message: new MarkdownString(
				localize(
					'tip.createSkill',
					"Use [{0}](command:{1}){2} to create a skill the agent can load when relevant.",
					'/create-skill',
					GENERATE_SKILL_COMMAND_ID,
					formatKeybinding(keybindingService, GENERATE_SKILL_COMMAND_ID)
				)
			),
			when: ChatContextKeys.chatSessionType.isEqualTo(localChatSessionType),
			excludeWhenCommandsExecuted: [
				GENERATE_SKILL_COMMAND_ID,
				TipTrackingCommands.CreateSkillUsed,
			],
		}));

		this._register(chatTipService.registerTip({
			id: 'tip.agentMode',
			tier: ChatTipTier.Foundational,
			priority: 10,
			message: new MarkdownString(
				localize(
					'tip.agentMode',
					"Try [{0}](command:workbench.action.chat.openEditSession){1} to make edits across your project and run commands.",
					getCommandLabel('workbench.action.chat.openEditSession'),
					formatKeybinding(keybindingService, 'workbench.action.chat.openEditSession')
				)
			),
			when: ChatContextKeys.chatModeKind.notEqualsTo(ChatModeKind.Agent),
			excludeWhenModesUsed: [ChatModeKind.Agent],
		}));

		this._register(chatTipService.registerTip({
			id: 'tip.planMode',
			tier: ChatTipTier.Foundational,
			priority: 20,
			message: new MarkdownString(
				localize(
					'tip.planMode',
					"Try the [{0}](command:workbench.action.chat.openPlan){1} to research and plan before implementing changes.",
					'Plan agent',
					formatKeybinding(keybindingService, 'workbench.action.chat.openPlan')
				)
			),
			when: ChatContextKeys.chatModeName.notEqualsTo('Plan'),
			excludeWhenCommandsExecuted: ['workbench.action.chat.openPlan'],
			excludeWhenModesUsed: ['Plan'],
		}));

		this._register(chatTipService.registerTip({
			id: 'tip.attachFiles',
			tier: ChatTipTier.Qol,
			message: new MarkdownString(
				localize('tip.attachFiles', "Reference files or folders with # to give the agent more context about the task.")
			),
			excludeWhenCommandsExecuted: [
				'workbench.action.chat.attachContext',
				'workbench.action.chat.attachFile',
				'workbench.action.chat.attachFolder',
				'workbench.action.chat.attachSelection',
				TipTrackingCommands.AttachFilesReferenceUsed,
			],
		}));

		this._register(chatTipService.registerTip({
			id: 'tip.codeActions',
			tier: ChatTipTier.Qol,
			message: new MarkdownString(
				localize('tip.codeActions', "Select a code block in the editor and right-click to access more AI actions.")
			),
			excludeWhenCommandsExecuted: ['inlineChat.start'],
		}));

		this._register(chatTipService.registerTip({
			id: 'tip.undoChanges',
			tier: ChatTipTier.Qol,
			message: new MarkdownString(
				localize('tip.undoChanges', "Select \"Restore Checkpoint\" to undo changes after that point in the chat conversation.")
			),
			when: ContextKeyExpr.and(
				ChatContextKeys.chatSessionType.isEqualTo(localChatSessionType),
				ContextKeyExpr.or(
					ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
					ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Edit),
				),
			),
			excludeWhenCommandsExecuted: ['workbench.action.chat.restoreCheckpoint', 'workbench.action.chat.restoreLastCheckpoint'],
		}));

		this._register(chatTipService.registerTip({
			id: 'tip.messageQueueing',
			tier: ChatTipTier.Qol,
			message: new MarkdownString(
				localize('tip.messageQueueing', "Steer the agent mid-task by sending follow-up messages. They queue and apply in order.")
			),
			when: ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
			excludeWhenCommandsExecuted: ['workbench.action.chat.queueMessage', 'workbench.action.chat.steerWithMessage'],
		}));

		this._register(chatTipService.registerTip({
			id: 'tip.forkConversation',
			tier: ChatTipTier.Qol,
			message: new MarkdownString(
				localize(
					'tip.forkConversation',
					"Use [{0}](command:{1}){2} to branch the conversation. Explore a different approach without losing the original context.",
					'/fork',
					INSERT_FORK_CONVERSATION_COMMAND_ID,
					formatKeybinding(keybindingService, INSERT_FORK_CONVERSATION_COMMAND_ID)
				)
			),
			excludeWhenCommandsExecuted: [
				INSERT_FORK_CONVERSATION_COMMAND_ID,
				'workbench.action.chat.forkConversation',
				TipTrackingCommands.ForkConversationUsed,
			],
		}));

		this._register(chatTipService.registerTip({
			id: 'tip.agenticBrowser',
			tier: ChatTipTier.Qol,
			message: new MarkdownString(
				localize(
					'tip.agenticBrowser',
					"Enable [{0}](command:workbench.action.openSettings?%5B%22workbench.browser.enableChatTools%22%5D) to let the agent open and interact with pages in the Integrated Browser.",
					'agentic browser integration'
				)
			),
			when: ContextKeyExpr.and(
				ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
				ContextKeyExpr.notEquals('config.workbench.browser.enableChatTools', true),
			),
			excludeWhenSettingsChanged: ['workbench.browser.enableChatTools'],
			dismissWhenCommandsClicked: ['workbench.action.openSettings'],
		}));

		this._register(chatTipService.registerTip({
			id: 'tip.mermaid',
			tier: ChatTipTier.Qol,
			message: new MarkdownString(
				localize('tip.mermaid', "Ask the agent to draw an architectural diagram or flow chart; it can render Mermaid diagrams directly in chat.")
			),
			when: ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
			excludeWhenToolsInvoked: ['renderMermaidDiagram'],
		}));

		this._register(chatTipService.registerTip({
			id: 'tip.subagents',
			tier: ChatTipTier.Qol,
			message: new MarkdownString(
				localize('tip.subagents', "Ask the agent to work in parallel to complete large tasks faster.")
			),
			when: ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
			excludeWhenToolsInvoked: ['runSubagent'],
		}));
	}
}
