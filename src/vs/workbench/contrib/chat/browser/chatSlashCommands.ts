/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../../base/common/async.js';
import { MarkdownString, isMarkdownString } from '../../../../base/common/htmlContent.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import * as nls from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IChatAgentService } from '../common/participants/chatAgents.js';
import { IChatDebugEvent, IChatDebugService } from '../common/chatDebugService.js';
import { IChatSlashCommandService } from '../common/participants/chatSlashCommands.js';
import { ChatRequestQueueKind, IChatService } from '../common/chatService/chatService.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../common/constants.js';
import { IChatRequestVariableEntry } from '../common/attachments/chatVariableEntries.js';
import { ACTION_ID_NEW_CHAT } from './actions/chatActions.js';
import { ChatSubmitAction, OpenModePickerAction, OpenModelPickerAction } from './actions/chatExecuteActions.js';
import { ManagePluginsAction } from './actions/chatPluginActions.js';
import { ConfigureToolsAction } from './actions/chatToolActions.js';
import { IAgentSessionsService } from './agentSessions/agentSessionsService.js';
import { CONFIGURE_INSTRUCTIONS_ACTION_ID } from './promptSyntax/attachInstructionsAction.js';
import { showConfigureHooksQuickPick } from './promptSyntax/hookActions.js';
import { CONFIGURE_PROMPTS_ACTION_ID } from './promptSyntax/runPromptAction.js';
import { CONFIGURE_SKILLS_ACTION_ID } from './promptSyntax/skillActions.js';
import {
	AutoApproveStorageKeys,
	globalAutoApproveDescription,
} from './tools/languageModelToolsService.js';
import { agentSlashCommandToMarkdown, agentToMarkdown } from './widget/chatContentParts/chatMarkdownDecorationsRenderer.js';
import { ILanguageModelToolsService } from '../common/tools/languageModelToolsService.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ChatContextKeys } from '../common/actions/chatContextKeys.js';
import { Target } from '../common/promptSyntax/promptTypes.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IChatWidgetService } from './chat.js';

export class ChatSlashCommandsContribution extends Disposable {

	static readonly ID = 'workbench.contrib.chatSlashCommands';

	constructor(
		@IChatSlashCommandService slashCommandService: IChatSlashCommandService,
		@ICommandService commandService: ICommandService,
		@IChatAgentService chatAgentService: IChatAgentService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IAgentSessionsService agentSessionsService: IAgentSessionsService,
		@IChatService chatService: IChatService,
		@IChatDebugService chatDebugService: IChatDebugService,
		@IConfigurationService configurationService: IConfigurationService,
		@IDialogService dialogService: IDialogService,
		@INotificationService notificationService: INotificationService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ILanguageModelToolsService languageModelToolsService: ILanguageModelToolsService,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
	) {
		super();

		const troubleshootSessions = new Set<string>();
		const hasTroubleshootDataKey = ChatContextKeys.chatSessionHasTroubleshootData.bindTo(this.contextKeyService);
		this._store.add(chatWidgetService.onDidChangeFocusedSession(() => {
			const sessionResource = chatWidgetService.lastFocusedWidget?.viewModel?.sessionResource;
			hasTroubleshootDataKey.set(!!sessionResource && troubleshootSessions.has(sessionResource.toString()));
			languageModelToolsService.flushToolUpdates();
		}));
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
			target: Target.VSCode
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
			target: Target.VSCode
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
			command: 'plugins',
			detail: nls.localize('plugins', "Manage plugins"),
			sortText: 'z3_plugins',
			executeImmediately: true,
			silent: true,
			locations: [ChatAgentLocation.Chat],
			target: Target.VSCode
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
			command: 'troubleshoot',
			detail: nls.localize('troubleshoot', "Troubleshoot with a snapshot of debug events from the conversation so far (run again to refresh)"),
			sortText: 'z3_troubleshoot',
			executeImmediately: false,
			silent: true,
			locations: [ChatAgentLocation.Chat],
		}, async (prompt, _progress, _history, _location, sessionResource, _token, options) => {
			troubleshootSessions.add(sessionResource.toString());
			hasTroubleshootDataKey.set(true);
			languageModelToolsService.flushToolUpdates();
			await chatDebugService.invokeProviders(sessionResource);
			const events = chatDebugService.getEvents(sessionResource);
			const summary = events.length > 0
				? formatDebugEventsForContext(events)
				: nls.localize('troubleshoot.noEvents', "No debug events found for this conversation.");

			const attachedContext: IChatRequestVariableEntry[] = [{
				id: 'chatDebugEvents',
				name: nls.localize('troubleshoot.contextName', "Debug Events Snapshot"),
				kind: 'debugEvents',
				snapshotTime: Date.now(),
				sessionResource,
				value: summary,
				modelDescription: 'These are the debug event logs from the current chat conversation. Analyze them to help answer the user\'s troubleshooting question.\n'
					+ '\n'
					+ 'CRITICAL INSTRUCTION: You MUST call the resolveDebugEventDetails tool on relevant events BEFORE answering. The log lines below are only summaries — they do NOT contain the actual data (file paths, prompt content, tool I/O, etc.). The real information is only available by resolving events. Never answer based solely on the summary lines. Always resolve first, then answer.\n'
					+ '\n'
					+ 'Call resolveDebugEventDetails in parallel on all events that could be relevant to the user\'s question. When in doubt, resolve more events rather than fewer.\n'
					+ '\n'
					+ 'IMPORTANT: Do NOT mention event IDs, tool resolution steps, or internal debug mechanics in your response. The user does not know about debug events or event IDs. Present your findings directly and naturally, as if you simply know the answer. Never say things like "I need to resolve events" or show event IDs.\n'
					+ '\n'
					+ 'Event types and what resolving them returns:\n'
					+ '- generic (category: "discovery"): File discovery for instructions, skills, agents, hooks. Resolving returns a fileList with full file paths, load status, skip reasons, and source folders. Always resolve these for questions about customization files.\n'
					+ '- userMessage: The full prompt sent to the model. Resolving returns the complete message and all prompt sections (system prompt, instructions, context). Essential for understanding what the model received.\n'
					+ '- agentResponse: The model\'s response. Resolving returns the full response text and sections.\n'
					+ '- modelTurn: An LLM round-trip. Resolving returns model name, token usage, timing, errors, and prompt sections.\n'
					+ '- toolCall: A tool invocation. Resolving returns tool name, input, output, status, and duration.\n'
					+ '- subagentInvocation: A sub-agent spawn. Resolving returns agent name, status, duration, and counts.\n'
					+ '- generic (other): Miscellaneous logs. Resolving returns additional text details.',
			}];

			chatService.sendRequest(sessionResource, prompt, {
				...options,
				queue: ChatRequestQueueKind.Queued,
				attachedContext,
			});
		}));
		this._store.add(slashCommandService.registerSlashCommand({
			command: 'agents',
			detail: nls.localize('agents', "Configure custom agents"),
			sortText: 'z3_agents',
			executeImmediately: true,
			silent: true,
			locations: [ChatAgentLocation.Chat],
			target: Target.VSCode
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
			target: Target.VSCode
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
			target: Target.VSCode
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
			target: Target.VSCode
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
			const alreadyOptedIn = storageService.getBoolean(AutoApproveStorageKeys.GlobalAutoApproveOptIn, StorageScope.APPLICATION, false);
			if (!alreadyOptedIn) {
				const store = new DisposableStore();
				try {
					const cts = new CancellationTokenSource();
					store.add(cts);
					store.add(storageService.onDidChangeValue(StorageScope.APPLICATION, AutoApproveStorageKeys.GlobalAutoApproveOptIn, store)(() => {
						if (storageService.getBoolean(AutoApproveStorageKeys.GlobalAutoApproveOptIn, StorageScope.APPLICATION, false)) {
							cts.cancel();
						}
					}));

					const result = await dialogService.prompt({
						type: Severity.Warning,
						message: nls.localize('autoApprove.enable.title', 'Enable global auto approve?'),
						buttons: [
							{ label: nls.localize('autoApprove.enable.button', 'Enable'), run: () => true },
							{ label: nls.localize('autoApprove.cancel.button', 'Cancel'), run: () => false },
						],
						custom: {
							markdownDetails: [{ markdown: new MarkdownString(globalAutoApproveDescription.value, { isTrusted: { enabledCommands: ['workbench.action.openSettings'] } }) }],
						},
						token: cts.token,
					});

					if (!cts.token.isCancellationRequested && result.result !== true) {
						return;
					}
					storageService.store(AutoApproveStorageKeys.GlobalAutoApproveOptIn, true, StorageScope.APPLICATION, StorageTarget.USER);
				} finally {
					store.dispose();
				}
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

function formatDebugEventsForContext(events: readonly IChatDebugEvent[]): string {
	const lines: string[] = [];
	for (const event of events) {
		const ts = event.created.toISOString();
		const id = event.id ? ` [id=${event.id}]` : '';
		switch (event.kind) {
			case 'generic':
				lines.push(`[${ts}]${id} ${event.level >= 3 ? 'ERROR' : event.level >= 2 ? 'WARN' : 'INFO'}: ${event.name}${event.details ? ' - ' + event.details : ''}${event.category ? ' (category: ' + event.category + ')' : ''}`);
				break;
			case 'toolCall':
				lines.push(`[${ts}]${id} TOOL_CALL: ${event.toolName}${event.result ? ' result=' + event.result : ''}${event.durationInMillis !== undefined ? ' duration=' + event.durationInMillis + 'ms' : ''}`);
				break;
			case 'modelTurn':
				lines.push(`[${ts}]${id} MODEL_TURN: ${event.requestName ?? 'unknown'}${event.model ? ' model=' + event.model : ''}${event.inputTokens !== undefined ? ' tokens(in=' + event.inputTokens + ',out=' + (event.outputTokens ?? '?') + ')' : ''}${event.durationInMillis !== undefined ? ' duration=' + event.durationInMillis + 'ms' : ''}`);
				break;
			case 'subagentInvocation':
				lines.push(`[${ts}]${id} SUBAGENT: ${event.agentName}${event.status ? ' status=' + event.status : ''}${event.durationInMillis !== undefined ? ' duration=' + event.durationInMillis + 'ms' : ''}`);
				break;
			case 'userMessage':
				lines.push(`[${ts}]${id} USER_MESSAGE: ${event.message.substring(0, 200)}${event.message.length > 200 ? '...' : ''} (${event.sections.length} sections)`);
				break;
			case 'agentResponse':
				lines.push(`[${ts}]${id} AGENT_RESPONSE: ${event.message.substring(0, 200)}${event.message.length > 200 ? '...' : ''} (${event.sections.length} sections)`);
				break;
			default: {
				const _: never = event;
				void _;
				break;
			}
		}
	}
	return lines.join('\n');
}

