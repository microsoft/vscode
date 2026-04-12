/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { timeout } from '../../../../base/common/async.js';
import { MarkdownString, isMarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import * as nls from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IChatAgentService } from '../common/participants/chatAgents.js';
import { ChatContextKeys } from '../common/actions/chatContextKeys.js';
import { IChatSlashCommandService } from '../common/participants/chatSlashCommands.js';
import { IChatService } from '../common/chatService/chatService.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind, ChatPermissionLevel } from '../common/constants.js';
import { ACTION_ID_NEW_CHAT } from './actions/chatActions.js';
import { ChatSubmitAction, OpenModePickerAction, OpenModelPickerAction } from './actions/chatExecuteActions.js';
import { ManagePluginsAction } from './actions/chatPluginActions.js';
import { ConfigureToolsAction } from './actions/chatToolActions.js';
import { IAgentSessionsService } from './agentSessions/agentSessionsService.js';
import { CONFIGURE_INSTRUCTIONS_ACTION_ID } from './promptSyntax/attachInstructionsAction.js';
import { showConfigureHooksQuickPick } from './promptSyntax/hookActions.js';
import { CONFIGURE_PROMPTS_ACTION_ID } from './promptSyntax/runPromptAction.js';
import { CONFIGURE_SKILLS_ACTION_ID } from './promptSyntax/skillActions.js';
import { IChatWidgetService } from './chat.js';
import { agentSlashCommandToMarkdown, agentToMarkdown } from './widget/chatContentParts/chatMarkdownDecorationsRenderer.js';
import { Target } from '../common/promptSyntax/promptTypes.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
let ChatSlashCommandsContribution = class ChatSlashCommandsContribution extends Disposable {
    static { this.ID = 'workbench.contrib.chatSlashCommands'; }
    constructor(slashCommandService, commandService, chatAgentService, instantiationService, agentSessionsService, chatService, configurationService, chatWidgetService, environmentService) {
        super();
        this.environmentService = environmentService;
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
            locations: [ChatAgentLocation.Chat],
            targets: [Target.VSCode]
        }, async () => {
            await instantiationService.invokeFunction(showConfigureHooksQuickPick);
        }));
        this._store.add(slashCommandService.registerSlashCommand({
            command: 'models',
            detail: nls.localize('models', "Open the model picker"),
            sortText: 'z3_models',
            executeImmediately: true,
            silent: true,
            locations: [ChatAgentLocation.Chat],
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
            targets: [Target.VSCode]
        }, async () => {
            await commandService.executeCommand(ConfigureToolsAction.ID);
        }));
        this._store.add(slashCommandService.registerSlashCommand({
            command: 'plugins',
            detail: nls.localize('plugins', "Manage plugins"),
            sortText: 'z3_plugins',
            executeImmediately: true,
            silent: true,
            locations: [ChatAgentLocation.Chat],
            targets: [Target.VSCode]
        }, async () => {
            await commandService.executeCommand(ManagePluginsAction.ID);
        }));
        if (!this.environmentService.isSessionsWindow) {
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
        }
        this._store.add(slashCommandService.registerSlashCommand({
            command: 'agents',
            detail: nls.localize('agents', "Configure custom agents"),
            sortText: 'z3_agents',
            executeImmediately: true,
            silent: true,
            locations: [ChatAgentLocation.Chat],
            targets: [Target.VSCode]
        }, async () => {
            await commandService.executeCommand(OpenModePickerAction.ID);
        }));
        this._store.add(slashCommandService.registerSlashCommand({
            command: 'skills',
            detail: nls.localize('skills', "Configure skills"),
            sortText: 'z3_skills',
            executeImmediately: true,
            silent: true,
            locations: [ChatAgentLocation.Chat],
            targets: [Target.VSCode]
        }, async () => {
            await commandService.executeCommand(CONFIGURE_SKILLS_ACTION_ID);
        }));
        this._store.add(slashCommandService.registerSlashCommand({
            command: 'instructions',
            detail: nls.localize('instructions', "Configure instructions"),
            sortText: 'z3_instructions',
            executeImmediately: true,
            silent: true,
            locations: [ChatAgentLocation.Chat],
            targets: [Target.VSCode]
        }, async () => {
            await commandService.executeCommand(CONFIGURE_INSTRUCTIONS_ACTION_ID);
        }));
        this._store.add(slashCommandService.registerSlashCommand({
            command: 'prompts',
            detail: nls.localize('prompts', "Configure prompt files"),
            sortText: 'z3_prompts',
            executeImmediately: true,
            silent: true,
            locations: [ChatAgentLocation.Chat],
            targets: [Target.VSCode]
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
            when: ContextKeyExpr.or(ChatContextKeys.lockedToCodingAgent.negate(), ChatContextKeys.chatSessionSupportsFork),
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
            targets: [Target.VSCode]
        }, async (prompt, _progress, _history, _location, sessionResource) => {
            const title = prompt.trim();
            if (title) {
                chatService.setChatSessionTitle(sessionResource, title);
            }
        }));
        const setPermissionLevelForSession = (sessionResource, level) => {
            const widget = chatWidgetService.getWidgetBySessionResource(sessionResource) ?? chatWidgetService.lastFocusedWidget;
            if (widget) {
                widget.input.setPermissionLevel(level);
            }
        };
        const autoApprovePolicyValue = configurationService.inspect(ChatConfiguration.GlobalAutoApprove).policyValue;
        if (autoApprovePolicyValue !== false) {
            this._store.add(slashCommandService.registerSlashCommand({
                command: 'autoApprove',
                detail: nls.localize('autoApprove', "Set permissions to bypass approvals"),
                sortText: 'z1_autoApprove',
                executeImmediately: true,
                silent: true,
                locations: [ChatAgentLocation.Chat],
                targets: [Target.VSCode, Target.GitHubCopilot]
            }, async (_prompt, _progress, _history, _location, sessionResource) => {
                setPermissionLevelForSession(sessionResource, ChatPermissionLevel.AutoApprove);
            }));
            this._store.add(slashCommandService.registerSlashCommand({
                command: 'disableAutoApprove',
                detail: nls.localize('disableAutoApprove', "Set permissions back to default"),
                sortText: 'z1_disableAutoApprove',
                executeImmediately: true,
                silent: true,
                locations: [ChatAgentLocation.Chat],
                targets: [Target.VSCode, Target.GitHubCopilot]
            }, async (_prompt, _progress, _history, _location, sessionResource) => {
                setPermissionLevelForSession(sessionResource, ChatPermissionLevel.Default);
            }));
            this._store.add(slashCommandService.registerSlashCommand({
                command: 'yolo',
                detail: nls.localize('yolo', "Set permissions to bypass approvals"),
                sortText: 'z1_yolo',
                executeImmediately: true,
                silent: true,
                locations: [ChatAgentLocation.Chat],
                targets: [Target.VSCode, Target.GitHubCopilot]
            }, async (_prompt, _progress, _history, _location, sessionResource) => {
                setPermissionLevelForSession(sessionResource, ChatPermissionLevel.AutoApprove);
            }));
            this._store.add(slashCommandService.registerSlashCommand({
                command: 'disableYolo',
                detail: nls.localize('disableYolo', "Set permissions back to default"),
                sortText: 'z1_disableYolo',
                executeImmediately: true,
                silent: true,
                locations: [ChatAgentLocation.Chat],
                targets: [Target.VSCode, Target.GitHubCopilot]
            }, async (_prompt, _progress, _history, _location, sessionResource) => {
                setPermissionLevelForSession(sessionResource, ChatPermissionLevel.Default);
            }));
            if (configurationService.getValue(ChatConfiguration.AutopilotEnabled) !== false) {
                this._store.add(slashCommandService.registerSlashCommand({
                    command: 'autopilot',
                    detail: nls.localize('autopilot', "Set permissions to autopilot mode"),
                    sortText: 'z1_autopilot',
                    executeImmediately: true,
                    silent: true,
                    locations: [ChatAgentLocation.Chat],
                    targets: [Target.VSCode, Target.GitHubCopilot]
                }, async (_prompt, _progress, _history, _location, sessionResource) => {
                    setPermissionLevelForSession(sessionResource, ChatPermissionLevel.Autopilot);
                }));
                this._store.add(slashCommandService.registerSlashCommand({
                    command: 'exitAutopilot',
                    detail: nls.localize('exitAutopilot', "Set permissions back to default"),
                    sortText: 'z1_exitAutopilot',
                    executeImmediately: true,
                    silent: true,
                    locations: [ChatAgentLocation.Chat],
                    targets: [Target.VSCode, Target.GitHubCopilot]
                }, async (_prompt, _progress, _history, _location, sessionResource) => {
                    setPermissionLevelForSession(sessionResource, ChatPermissionLevel.Default);
                }));
            }
        }
        this._store.add(slashCommandService.registerSlashCommand({
            command: 'help',
            detail: '',
            sortText: 'z1_help',
            executeImmediately: true,
            locations: [ChatAgentLocation.Chat],
            modes: [ChatModeKind.Ask],
            targets: [Target.VSCode]
        }, async (prompt, progress, _history, _location, sessionResource) => {
            const defaultAgent = chatAgentService.getDefaultAgent(ChatAgentLocation.Chat);
            const agents = chatAgentService.getAgents();
            // Report prefix
            if (defaultAgent?.metadata.helpTextPrefix) {
                if (isMarkdownString(defaultAgent.metadata.helpTextPrefix)) {
                    progress.report({ content: defaultAgent.metadata.helpTextPrefix, kind: 'markdownContent' });
                }
                else {
                    progress.report({ content: new MarkdownString(defaultAgent.metadata.helpTextPrefix), kind: 'markdownContent' });
                }
                progress.report({ content: new MarkdownString('\n\n'), kind: 'markdownContent' });
            }
            // Report agent list
            const agentText = (await Promise.all(agents
                .filter(a => !a.isDefault && !a.isCore)
                .filter(a => a.locations.includes(ChatAgentLocation.Chat))
                .map(async (a) => {
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
                }
                else {
                    progress.report({ content: new MarkdownString(defaultAgent.metadata.helpTextPostfix), kind: 'markdownContent' });
                }
            }
            // Without this, the response will be done before it renders and so it will not stream. This ensures that if the response starts
            // rendering during the next 200ms, then it will be streamed. Once it starts streaming, the whole response streams even after
            // it has received all response data has been received.
            await timeout(200);
        }));
    }
};
ChatSlashCommandsContribution = __decorate([
    __param(0, IChatSlashCommandService),
    __param(1, ICommandService),
    __param(2, IChatAgentService),
    __param(3, IInstantiationService),
    __param(4, IAgentSessionsService),
    __param(5, IChatService),
    __param(6, IConfigurationService),
    __param(7, IChatWidgetService),
    __param(8, IWorkbenchEnvironmentService)
], ChatSlashCommandsContribution);
export { ChatSlashCommandsContribution };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFNsYXNoQ29tbWFuZHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdFNsYXNoQ29tbWFuZHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxjQUFjLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUMxRixPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFbEUsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbkYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDekUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNwRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsaUJBQWlCLEVBQUUsWUFBWSxFQUFFLG1CQUFtQixFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDakgsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDOUQsT0FBTyxFQUFFLGdCQUFnQixFQUFFLG9CQUFvQixFQUFFLHFCQUFxQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDaEgs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