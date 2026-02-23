/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../../base/common/async.js';
import { MarkdownString, isMarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import * as nls from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IChatAgentService } from '../common/participants/chatAgents.js';
import { IChatSlashCommandService } from '../common/participants/chatSlashCommands.js';
import { IChatService } from '../common/chatService/chatService.js';
import { ChatAgentLocation, ChatModeKind } from '../common/constants.js';
import { ACTION_ID_NEW_CHAT } from './actions/chatActions.js';
import { ChatSubmitAction, OpenModePickerAction, OpenModelPickerAction } from './actions/chatExecuteActions.js';
import { ConfigureToolsAction } from './actions/chatToolActions.js';
import { IAgentSessionsService } from './agentSessions/agentSessionsService.js';
import { IChatWidgetService } from './chat.js';
import { CONFIGURE_INSTRUCTIONS_ACTION_ID } from './promptSyntax/attachInstructionsAction.js';
import { showConfigureHooksQuickPick } from './promptSyntax/hookActions.js';
import { CONFIGURE_PROMPTS_ACTION_ID } from './promptSyntax/runPromptAction.js';
import { CONFIGURE_SKILLS_ACTION_ID } from './promptSyntax/skillActions.js';
import { agentSlashCommandToMarkdown, agentToMarkdown } from './widget/chatContentParts/chatMarkdownDecorationsRenderer.js';

export class ChatSlashCommandsContribution extends Disposable {

	static readonly ID = 'workbench.contrib.chatSlashCommands';

	constructor(
		@IChatSlashCommandService slashCommandService: IChatSlashCommandService,
		@ICommandService commandService: ICommandService,
		@IChatAgentService chatAgentService: IChatAgentService,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IAgentSessionsService agentSessionsService: IAgentSessionsService,
		@IChatService chatService: IChatService,
	) {
		super();
		this._store.add(slashCommandService.registerSlashCommand({
			command: 'clear',
			detail: nls.localize('clear', "Start a new chat and archive the current one"),
			sortText: 'z2_clear',
			executeImmediately: true,
			locations: [ChatAgentLocation.Chat]
		}, async (_prompt, _progress, _history, _location, sessionResource) => {
			agentSessionsService.getSession(sessionResource)?.setArchived(true);
			commandService.executeCommand(ACTION_ID_NEW_CHAT);
		}));
		this._store.add(slashCommandService.registerSlashCommand({
			command: 'hooks',
			detail: nls.localize('hooks', "Configure hooks"),
			sortText: 'z3_hooks',
			executeImmediately: true,
			silent: true,
			locations: [ChatAgentLocation.Chat]
		}, async () => {
			await instantiationService.invokeFunction(showConfigureHooksQuickPick);
		}));
		this._store.add(slashCommandService.registerSlashCommand({
			command: 'models',
			detail: nls.localize('models', "Open the model picker"),
			sortText: 'z3_models',
			executeImmediately: true,
			silent: true,
			locations: [ChatAgentLocation.Chat]
		}, async () => {
			await commandService.executeCommand(OpenModelPickerAction.ID);
		}));
		this._store.add(slashCommandService.registerSlashCommand({
			command: 'tools',
			detail: nls.localize('tools', "Configure tools"),
			sortText: 'z3_tools',
			executeImmediately: true,
			silent: true,
			locations: [ChatAgentLocation.Chat]
		}, async () => {
			await commandService.executeCommand(ConfigureToolsAction.ID);
		}));
		this._store.add(slashCommandService.registerSlashCommand({
			command: 'debug',
			detail: nls.localize('debug', "Show Chat Debug View"),
			sortText: 'z3_debug',
			executeImmediately: true,
			silent: true,
			locations: [ChatAgentLocation.Chat]
		}, async () => {
			await commandService.executeCommand('github.copilot.debug.showChatLogView');
		}));
		this._store.add(slashCommandService.registerSlashCommand({
			command: 'agents',
			detail: nls.localize('agents', "Configure custom agents"),
			sortText: 'z3_agents',
			executeImmediately: true,
			silent: true,
			locations: [ChatAgentLocation.Chat]
		}, async () => {
			await commandService.executeCommand(OpenModePickerAction.ID);
		}));
		this._store.add(slashCommandService.registerSlashCommand({
			command: 'skills',
			detail: nls.localize('skills', "Configure skills"),
			sortText: 'z3_skills',
			executeImmediately: true,
			silent: true,
			locations: [ChatAgentLocation.Chat]
		}, async () => {
			await commandService.executeCommand(CONFIGURE_SKILLS_ACTION_ID);
		}));
		this._store.add(slashCommandService.registerSlashCommand({
			command: 'instructions',
			detail: nls.localize('instructions', "Configure instructions"),
			sortText: 'z3_instructions',
			executeImmediately: true,
			silent: true,
			locations: [ChatAgentLocation.Chat]
		}, async () => {
			await commandService.executeCommand(CONFIGURE_INSTRUCTIONS_ACTION_ID);
		}));
		this._store.add(slashCommandService.registerSlashCommand({
			command: 'prompts',
			detail: nls.localize('prompts', "Configure prompt files"),
			sortText: 'z3_prompts',
			executeImmediately: true,
			silent: true,
			locations: [ChatAgentLocation.Chat]
		}, async () => {
			await commandService.executeCommand(CONFIGURE_PROMPTS_ACTION_ID);
		}));
		this._store.add(slashCommandService.registerSlashCommand({
			command: 'fork',
			detail: nls.localize('fork', "Fork conversation into a new chat session"),
			sortText: 'z2_fork',
			executeImmediately: true,
			silent: true,
			locations: [ChatAgentLocation.Chat]
		}, async (_prompt, _progress, _history, _location, sessionResource) => {
			await commandService.executeCommand('workbench.action.chat.forkConversation', sessionResource);
		}));
		this._store.add(slashCommandService.registerSlashCommand({
			command: 'rename',
			detail: nls.localize('rename', "Rename this chat"),
			sortText: 'z2_rename',
			executeImmediately: false,
			silent: true,
			locations: [ChatAgentLocation.Chat]
		}, async (prompt, _progress, _history, _location, sessionResource) => {
			const title = prompt.trim();
			if (title) {
				chatService.setChatSessionTitle(sessionResource, title);
			}
		}));
		this._store.add(slashCommandService.registerSlashCommand({
			command: 'help',
			detail: '',
			sortText: 'z1_help',
			executeImmediately: true,
			locations: [ChatAgentLocation.Chat],
			modes: [ChatModeKind.Ask]
		}, async (prompt, progress, _history, _location, sessionResource) => {
			const defaultAgent = chatAgentService.getDefaultAgent(ChatAgentLocation.Chat);
			const agents = chatAgentService.getAgents();

			// Report prefix
			if (defaultAgent?.metadata.helpTextPrefix) {
				if (isMarkdownString(defaultAgent.metadata.helpTextPrefix)) {
					progress.report({ content: defaultAgent.metadata.helpTextPrefix, kind: 'markdownContent' });
				} else {
					progress.report({ content: new MarkdownString(defaultAgent.metadata.helpTextPrefix), kind: 'markdownContent' });
				}
				progress.report({ content: new MarkdownString('\n\n'), kind: 'markdownContent' });
			}

			// Report agent list
			const agentText = (await Promise.all(agents
				.filter(a => !a.isDefault && !a.isCore)
				.filter(a => a.locations.includes(ChatAgentLocation.Chat))
				.map(async a => {
					const description = a.description ? `- ${a.description}` : '';
					const agentMarkdown = instantiationService.invokeFunction(accessor => agentToMarkdown(a, sessionResource, true, accessor));
					const agentLine = `- ${agentMarkdown} ${description}`;
					const commandText = a.slashCommands.map(c => {
						const description = c.description ? `- ${c.description}` : '';
						return `\t* ${agentSlashCommandToMarkdown(a, c, sessionResource)} ${description}`;
					}).join('\n');

					return (agentLine + '\n' + commandText).trim();
				}))).join('\n');
			progress.report({ content: new MarkdownString(agentText, { isTrusted: { enabledCommands: [ChatSubmitAction.ID] } }), kind: 'markdownContent' });

			// Report help text ending
			if (defaultAgent?.metadata.helpTextPostfix) {
				progress.report({ content: new MarkdownString('\n\n'), kind: 'markdownContent' });
				if (isMarkdownString(defaultAgent.metadata.helpTextPostfix)) {
					progress.report({ content: defaultAgent.metadata.helpTextPostfix, kind: 'markdownContent' });
				} else {
					progress.report({ content: new MarkdownString(defaultAgent.metadata.helpTextPostfix), kind: 'markdownContent' });
				}
			}

			// Without this, the response will be done before it renders and so it will not stream. This ensures that if the response starts
			// rendering during the next 200ms, then it will be streamed. Once it starts streaming, the whole response streams even after
			// it has received all response data has been received.
			await timeout(200);
		}));
	}
}
