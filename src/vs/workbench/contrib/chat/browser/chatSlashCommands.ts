/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../../base/common/async.js';
import { MarkdownString, isMarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import * as nls from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IChatAgentService } from '../common/participants/chatAgents.js';
import { IChatSlashCommandService } from '../common/participants/chatSlashCommands.js';
import { IChatService } from '../common/chatService/chatService.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../common/constants.js';
import { ACTION_ID_NEW_CHAT } from './actions/chatActions.js';
import { ChatSubmitAction, OpenModePickerAction, OpenModelPickerAction } from './actions/chatExecuteActions.js';
import { ConfigureToolsAction } from './actions/chatToolActions.js';
import { IAgentSessionsService } from './agentSessions/agentSessionsService.js';
import { CONFIGURE_INSTRUCTIONS_ACTION_ID } from './promptSyntax/attachInstructionsAction.js';
import { showConfigureHooksQuickPick } from './promptSyntax/hookActions.js';
import { CONFIGURE_PROMPTS_ACTION_ID } from './promptSyntax/runPromptAction.js';
import { CONFIGURE_SKILLS_ACTION_ID } from './promptSyntax/skillActions.js';
import { globalAutoApproveDescription } from './tools/languageModelToolsService.js';
import { agentSlashCommandToMarkdown, agentToMarkdown } from './widget/chatContentParts/chatMarkdownDecorationsRenderer.js';
import { Target } from '../common/promptSyntax/service/promptsService.js';

export class ChatSlashCommandsContribution extends Disposable {

	static readonly ID = 'workbench.contrib.chatSlashCommands';

	constructor(
		@IChatSlashCommandService slashCommandService: IChatSlashCommandService,
		@ICommandService commandService: ICommandService,
		@IChatAgentService chatAgentService: IChatAgentService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IAgentSessionsService agentSessionsService: IAgentSessionsService,
		@IChatService chatService: IChatService,
		@IConfigurationService configurationService: IConfigurationService,
		@IDialogService dialogService: IDialogService,
		@INotificationService notificationService: INotificationService,
		@IStorageService storageService: IStorageService,
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
			locations: [ChatAgentLocation.Chat],
			target: Target.VSCode
		}, async () => {
			await commandService.executeCommand(ConfigureToolsAction.ID);
		}));
		this._store.add(slashCommandService.registerSlashCommand({
			command: 'debug',
			detail: nls.localize('debug', "Show Chat Debug View"),
			sortText: 'z3_debug',
			executeImmediately: true,
			silent: true,
			locations: [ChatAgentLocation.Chat],
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
			locations: [ChatAgentLocation.Chat],
			target: Target.VSCode
		}, async (_prompt, _progress, _history, _location, sessionResource) => {
			await commandService.executeCommand('workbench.action.chat.forkConversation', sessionResource);
		}));
		this._store.add(slashCommandService.registerSlashCommand({
			command: 'rename',
			detail: nls.localize('rename', "Rename this chat"),
			sortText: 'z2_rename',
			executeImmediately: false,
			silent: true,
			locations: [ChatAgentLocation.Chat],
			target: Target.VSCode
		}, async (prompt, _progress, _history, _location, sessionResource) => {
			const title = prompt.trim();
			if (title) {
				chatService.setChatSessionTitle(sessionResource, title);
			}
		}));
		const handleEnableAutoApprove = async () => {
			const inspection = configurationService.inspect<boolean>(ChatConfiguration.GlobalAutoApprove);
			if (inspection.policyValue !== undefined) {
				if (inspection.policyValue === true) {
					notificationService.info(nls.localize('autoApprove.alreadyEnabled', "Global auto-approve is already enabled."));
					return;
				}
				notificationService.warn(nls.localize('autoApprove.policyBlocked', "Global auto-approve is managed by your organization policy. Contact your administrator to change this setting."));
				return;
			}
			if (configurationService.getValue<boolean>(ChatConfiguration.GlobalAutoApprove)) {
				notificationService.info(nls.localize('autoApprove.alreadyEnabled', "Global auto-approve is already enabled."));
				return;
			}
			const alreadyOptedIn = storageService.getBoolean('chat.tools.global.autoApprove.optIn', StorageScope.APPLICATION, false);
			if (!alreadyOptedIn) {
				const result = await dialogService.prompt({
					type: Severity.Warning,
					message: nls.localize('autoApprove.enable.title', 'Enable global auto approve?'),
					buttons: [
						{ label: nls.localize('autoApprove.enable.button', 'Enable'), run: () => true },
						{ label: nls.localize('autoApprove.cancel.button', 'Cancel'), run: () => false },
					],
					custom: {
						markdownDetails: [{ markdown: new MarkdownString(globalAutoApproveDescription.value, { isTrusted: { enabledCommands: ['workbench.action.openSettings'] } }) }],
					}
				});
				if (result.result !== true) {
					return;
				}
				storageService.store('chat.tools.global.autoApprove.optIn', true, StorageScope.APPLICATION, StorageTarget.USER);
			}
			await configurationService.updateValue(ChatConfiguration.GlobalAutoApprove, true);
			notificationService.info(nls.localize('autoApprove.enabled', "Global auto-approve enabled — all tool calls will be approved automatically"));
		};
		const handleDisableAutoApprove = async () => {
			const inspection = configurationService.inspect<boolean>(ChatConfiguration.GlobalAutoApprove);
			if (inspection.policyValue !== undefined) {
				if (inspection.policyValue === false) {
					notificationService.info(nls.localize('autoApprove.alreadyDisabled', "Global auto-approve is already disabled."));
					return;
				}
				notificationService.warn(nls.localize('autoApprove.policyBlocked', "Global auto-approve is managed by your organization policy. Contact your administrator to change this setting."));
				return;
			}
			if (!configurationService.getValue<boolean>(ChatConfiguration.GlobalAutoApprove)) {
				notificationService.info(nls.localize('autoApprove.alreadyDisabled', "Global auto-approve is already disabled."));
				return;
			}
			await configurationService.updateValue(ChatConfiguration.GlobalAutoApprove, false);
			notificationService.info(nls.localize('autoApprove.disabled', "Global auto-approve disabled — tools will require approval"));
		};
		this._store.add(slashCommandService.registerSlashCommand({
			command: 'autoApprove',
			detail: nls.localize('autoApprove', "Enable global auto-approval of all tool calls"),
			sortText: 'z1_autoApprove',
			executeImmediately: true,
			silent: true,
			locations: [ChatAgentLocation.Chat],
			target: Target.VSCode
		}, handleEnableAutoApprove));
		this._store.add(slashCommandService.registerSlashCommand({
			command: 'disableAutoApprove',
			detail: nls.localize('disableAutoApprove', "Disable global auto-approval of all tool calls"),
			sortText: 'z1_disableAutoApprove',
			executeImmediately: true,
			silent: true,
			locations: [ChatAgentLocation.Chat],
			target: Target.VSCode
		}, handleDisableAutoApprove));
		this._store.add(slashCommandService.registerSlashCommand({
			command: 'yolo',
			detail: nls.localize('yolo', "Enable global auto-approval of all tool calls"),
			sortText: 'z1_yolo',
			executeImmediately: true,
			silent: true,
			locations: [ChatAgentLocation.Chat],
			target: Target.VSCode
		}, handleEnableAutoApprove));
		this._store.add(slashCommandService.registerSlashCommand({
			command: 'disableYolo',
			detail: nls.localize('disableYolo', "Disable global auto-approval of all tool calls"),
			sortText: 'z1_disableYolo',
			executeImmediately: true,
			silent: true,
			locations: [ChatAgentLocation.Chat],
			target: Target.VSCode
		}, handleDisableAutoApprove));
		this._store.add(slashCommandService.registerSlashCommand({
			command: 'help',
			detail: '',
			sortText: 'z1_help',
			executeImmediately: true,
			locations: [ChatAgentLocation.Chat],
			modes: [ChatModeKind.Ask],
			target: Target.VSCode
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
