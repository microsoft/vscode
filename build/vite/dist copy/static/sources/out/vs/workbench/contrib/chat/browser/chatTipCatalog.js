/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { localize } from '../../../../nls.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { ProductQualityContext } from '../../../../platform/contextkey/common/contextkeys.js';
import { ChatContextKeys } from '../common/actions/chatContextKeys.js';
import { ChatConfiguration, ChatModeKind } from '../common/constants.js';
import { IsSessionsWindowContext } from '../../../common/contextkeys.js';
import { localChatSessionType } from '../common/chatSessionsService.js';
import { TipTrackingCommands } from './chatTipStorageKeys.js';
import { GENERATE_AGENT_COMMAND_ID, GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID, GENERATE_PROMPT_COMMAND_ID, GENERATE_SKILL_COMMAND_ID, INSERT_FORK_CONVERSATION_COMMAND_ID, INSERT_TROUBLESHOOT_COMMAND_ID, } from './actions/chatActions.js';
export var ChatTipTier;
(function (ChatTipTier) {
    ChatTipTier["Foundational"] = "foundational";
    ChatTipTier["Qol"] = "qol";
})(ChatTipTier || (ChatTipTier = {}));
/**
 * Gets the display label for a command, looking it up from MenuRegistry.
 * Falls back to extracting a readable name from the command ID.
 */
export function getCommandLabel(commandId) {
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
function formatKeybinding(ctx, commandId) {
    const kb = ctx.keybindingService.lookupKeybinding(commandId);
    return kb ? ` (${kb.getLabel()})` : '';
}
/**
 * Extracts command IDs from command: links in a markdown string.
 * Used to automatically populate enabledCommands for trusted markdown.
 */
export function extractCommandIds(markdown) {
    const commandPattern = /\[.*?\]\(command:([^?\s)]+)/g;
    const commands = new Set();
    let match;
    while ((match = commandPattern.exec(markdown)) !== null) {
        commands.add(match[1]);
    }
    return [...commands];
}
// -----------------------------------------------------------------------------
// Tip Catalog
// -----------------------------------------------------------------------------
/**
 * Static catalog of tips. Tips are built dynamically at runtime to enable
 * keybindings and command labels to be resolved fresh.
 */
export const TIP_CATALOG = [
    {
        id: 'tip.switchToAuto',
        tier: "foundational" /* ChatTipTier.Foundational */,
        priority: 0,
        buildMessage(_ctx) {
            return new MarkdownString(localize('tip.switchToAuto', "Using GPT-4.1? Try switching to [Auto](command:workbench.action.chat.openModelPicker \"Open Model Picker\") in the model picker for better coding performance."));
        },
        onlyWhenModelIds: ['gpt-4.1'],
    },
    {
        id: 'tip.init',
        tier: "foundational" /* ChatTipTier.Foundational */,
        priority: 50,
        buildMessage(ctx) {
            const kb = formatKeybinding(ctx, GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID);
            return new MarkdownString(localize('tip.init', "Use [{0}](command:{1} \"Run /init\"){2} to generate or update a workspace instructions file for AI coding agents.", '/init', GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID, kb));
        },
        when: ChatContextKeys.chatSessionType.isEqualTo(localChatSessionType),
        excludeWhenCommandsExecuted: [
            GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID,
            TipTrackingCommands.CreateAgentInstructionsUsed,
        ],
    },
    {
        id: 'tip.createPrompt',
        tier: "foundational" /* ChatTipTier.Foundational */,
        buildMessage(ctx) {
            const kb = formatKeybinding(ctx, GENERATE_PROMPT_COMMAND_ID);
            return new MarkdownString(localize('tip.createPrompt', "Use [{0}](command:{1} \"Run /create-prompt\"){2} to generate a reusable prompt file with the agent.", '/create-prompt', GENERATE_PROMPT_COMMAND_ID, kb));
        },
        when: ChatContextKeys.chatSessionType.isEqualTo(localChatSessionType),
        excludeWhenCommandsExecuted: [
            GENERATE_PROMPT_COMMAND_ID,
            TipTrackingCommands.CreatePromptUsed,
        ],
    },
    {
        id: 'tip.createAgent',
        tier: "foundational" /* ChatTipTier.Foundational */,
        priority: 30,
        buildMessage(ctx) {
            const kb = formatKeybinding(ctx, GENERATE_AGENT_COMMAND_ID);
            return new MarkdownString(localize('tip.createAgent', "Use [{0}](command:{1} \"Run /create-agent\"){2} to scaffold a custom agent for your workflow.", '/create-agent', GENERATE_AGENT_COMMAND_ID, kb));
        },
        when: ChatContextKeys.chatSessionType.isEqualTo(localChatSessionType),
        excludeWhenCommandsExecuted: [
            GENERATE_AGENT_COMMAND_ID,
            TipTrackingCommands.CreateAgentUsed,
        ],
    },
    {
        id: 'tip.createSkill',
        tier: "foundational" /* ChatTipTier.Foundational */,
        priority: 40,
        buildMessage(ctx) {
            const kb = formatKeybinding(ctx, GENERATE_SKILL_COMMAND_ID);
            return new MarkdownString(localize('tip.createSkill', "Use [{0}](command:{1} \"Run /create-skill\"){2} to create a skill the agent can load when relevant.", '/create-skill', GENERATE_SKILL_COMMAND_ID, kb));
        },
        when: ChatContextKeys.chatSessionType.isEqualTo(localChatSessionType),
        excludeWhenCommandsExecuted: [
            GENERATE_SKILL_COMMAND_ID,
            TipTrackingCommands.CreateSkillUsed,
        ],
    },
    {
        id: 'tip.planMode',
        tier: "foundational" /* ChatTipTier.Foundational */,
        priority: 20,
        buildMessage(ctx) {
            const kb = formatKeybinding(ctx, 'workbench.action.chat.openPlan');
            return new MarkdownString(localize('tip.planMode', "Try the [{0}](command:workbench.action.chat.openPlan \"Start Plan Mode\"){1} to research and plan before implementing changes.", 'Plan agent', kb));
        },
        when: ChatContextKeys.chatModeName.notEqualsTo('Plan'),
        excludeWhenCommandsExecuted: ['workbench.action.chat.openPlan'],
        excludeWhenModesUsed: ['Plan'],
    },
    {
        id: 'tip.attachFiles',
        tier: "qol" /* ChatTipTier.Qol */,
        buildMessage() {
            return new MarkdownString(localize('tip.attachFiles', "Reference files or folders with # to give the agent more context about the task."));
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
        tier: "qol" /* ChatTipTier.Qol */,
        buildMessage() {
            return new MarkdownString(localize('tip.codeActions', "Select a code block in the editor and right-click to access more AI actions."));
        },
        excludeWhenCommandsExecuted: ['inlineChat.start'],
    },
    {
        id: 'tip.undoChanges',
        tier: "qol" /* ChatTipTier.Qol */,
        buildMessage() {
            return new MarkdownString(localize('tip.undoChanges', "Hover a previous request and select \"Restore Checkpoint\" to undo changes after that point in the chat conversation."));
        },
        when: ContextKeyExpr.and(ChatContextKeys.chatSessionType.isEqualTo(localChatSessionType), ContextKeyExpr.or(ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent), ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Edit))),
        excludeWhenCommandsExecuted: ['workbench.action.chat.restoreCheckpoint', 'workbench.action.chat.restoreLastCheckpoint'],
    },
    {
        id: 'tip.messageQueueing',
        tier: "qol" /* ChatTipTier.Qol */,
        buildMessage() {
            return new MarkdownString(localize('tip.messageQueueing', "Steer the agent mid-task by sending follow-up messages. They queue and apply in order."));
        },
        when: ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
        excludeWhenCommandsExecuted: ['workbench.action.chat.queueMessage', 'workbench.action.chat.steerWithMessage'],
    },
    {
        id: 'tip.forkConversation',
        tier: "qol" /* ChatTipTier.Qol */,
        buildMessage(ctx) {
            const kb = formatKeybinding(ctx, INSERT_FORK_CONVERSATION_COMMAND_ID);
            return new MarkdownString(localize('tip.forkConversation', "Use [{0}](command:{1} \"Run /fork\"){2} to branch the conversation. Explore a different approach without losing the original context.", '/fork', INSERT_FORK_CONVERSATION_COMMAND_ID, kb));
        },
        excludeWhenCommandsExecuted: [
            INSERT_FORK_CONVERSATION_COMMAND_ID,
            'workbench.action.chat.forkConversation',
            TipTrackingCommands.ForkConversationUsed,
        ],
    },
    {
        id: 'tip.agenticBrowser',
        tier: "qol" /* ChatTipTier.Qol */,
        buildMessage() {
            return new MarkdownString(localize('tip.agenticBrowser', "Enable [{0}](command:workbench.action.openSettings?%5B%22workbench.browser.enableChatTools%22%5D \"Open Settings\") to let the agent open and interact with pages in the Integrated Browser.", 'agentic browser integration'));
        },
        when: ContextKeyExpr.and(ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent), ContextKeyExpr.notEquals('config.workbench.browser.enableChatTools', true)),
        excludeWhenSettingsChanged: ['workbench.browser.enableChatTools'],
        dismissWhenCommandsClicked: ['workbench.action.openSettings'],
    },
    {
        id: 'tip.mermaid',
        tier: "qol" /* ChatTipTier.Qol */,
        buildMessage() {
            return new MarkdownString(localize('tip.mermaid', "Ask the agent to draw an architectural diagram or flow chart. It can render Mermaid diagrams directly in chat."));
        },
        when: ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
        excludeWhenToolsInvoked: ['renderMermaidDiagram'],
    },
    {
        id: 'tip.subagents',
        tier: "qol" /* ChatTipTier.Qol */,
        buildMessage() {
            return new MarkdownString(localize('tip.subagents', "Have another task to work on? Start a new session to run multiple agents at once."));
        },
        when: ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
        excludeWhenToolsInvoked: ['runSubagent'],
    },
    {
        id: 'tip.thinkingPhrases',
        tier: "qol" /* ChatTipTier.Qol */,
        buildMessage() {
            return new MarkdownString(localize('tip.thinkingPhrases', "Customize the loading messages shown while the agent works with [{0}](command:workbench.action.openSettings?%5B%22{1}%22%5D \"Open Settings\").", 'thinking phrases', ChatConfiguration.ThinkingPhrases));
        },
        when: ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
        excludeWhenSettingsChanged: [ChatConfiguration.ThinkingPhrases],
        dismissWhenCommandsClicked: ['workbench.action.openSettings'],
    },
    {
        id: 'tip.autoAcceptDelay',
        tier: "qol" /* ChatTipTier.Qol */,
        buildMessage() {
            return new MarkdownString(localize('tip.autoAcceptDelay', "Configure [{0}](command:workbench.action.openSettings?%5B%22chat.editing.autoAcceptDelay%22%5D \"Open Settings\") to automatically accept changes from the agent after a short countdown.", 'auto-accept delay'));
        },
        when: ContextKeyExpr.or(ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent), ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Edit)),
        excludeWhenSettingsChanged: ['chat.editing.autoAcceptDelay'],
        dismissWhenCommandsClicked: ['workbench.action.openSettings'],
    },
    {
        id: 'tip.troubleshoot',
        tier: "qol" /* ChatTipTier.Qol */,
        buildMessage(ctx) {
            const kb = formatKeybinding(ctx, INSERT_TROUBLESHOOT_COMMAND_ID);
            return new MarkdownString(localize('tip.troubleshoot', "Something not working? Type [{0}](command:{1} \"Run /troubleshoot\"){2} <question> to diagnose issues from debug logs.", '/troubleshoot', INSERT_TROUBLESHOOT_COMMAND_ID, kb));
        },
        when: ChatContextKeys.chatSessionType.isEqualTo(localChatSessionType),
        excludeWhenToolsInvoked: ['listDebugEvents'],
    },
    {
        id: 'tip.openAgentsWindow',
        tier: "qol" /* ChatTipTier.Qol */,
        buildMessage() {
            return new MarkdownString(localize('tip.openAgentsWindow', "Try the [Agents Application](command:workbench.action.openAgentsWindow \"Open Agents Application\") to run multiple agents simultaneously and manage your coding sessions."));
        },
        when: ContextKeyExpr.and(ProductQualityContext.notEqualsTo('stable'), IsSessionsWindowContext.negate(), ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent)),
        excludeWhenCommandsExecuted: ['workbench.action.openAgentsWindow'],
        dismissWhenCommandsClicked: ['workbench.action.openAgentsWindow'],
    },
];
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFRpcENhdGFsb2cuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdFRpcENhdGFsb2cudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsY0FBYyxFQUF3QixNQUFNLHNEQUFzRCxDQUFDO0FBRTVHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUM5RSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUM5RixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDdkUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLFlBQVksRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQ3pFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRXhFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQzlELE9BQU8sRUFDTix5QkFBeUIsRUFDekIsc0NBQXNDLEVBQ3RDLDBCQUEwQixFQUMxQix5QkFBeUIsRUFDekIsbUNBQW1DLEVBQ25DLDhCQUE4QixHQUM5QixNQUFNLDBCQUEwQixDQUFDO0FBRWxDLE1BQU0sQ0FBTixJQUFrQixXQUdqQjtBQUhELFdBQWtCLFdBQVc7SUFDNUIsNENBQTZCLENBQUE7SUFDN0IsMEJBQVcsQ0FBQTtBQUNaLENBQUMsRUFIaUIsV0FBVyxLQUFYLFdBQVcsUUFHNUI7QUFZRDs7O0dBR0c7QUFDSCxNQUFNLFVB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