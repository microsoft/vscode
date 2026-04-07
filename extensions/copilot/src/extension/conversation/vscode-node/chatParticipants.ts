/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { IChatAgentService, defaultAgentName, editingSessionAgentEditorName, editingSessionAgentName, editsAgentName, getChatParticipantIdFromName, notebookEditorAgentName, terminalAgentName, vscodeAgentName } from '../../../platform/chat/common/chatAgents';
import { IChatQuotaService } from '../../../platform/chat/common/chatQuotaService';
import { IChatSessionService } from '../../../platform/chat/common/chatSessionService';
import { IInteractionService } from '../../../platform/chat/common/interactionService';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { ChatExtPerfMark, clearChatExtMarks, markChatExt } from '../../../util/common/performance';
import { DisposableStore, IDisposable } from '../../../util/vs/base/common/lifecycle';
import { autorun } from '../../../util/vs/base/common/observableInternal';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ChatRequest } from '../../../vscodeTypes';
import { Intent, agentsToCommands } from '../../common/constants';
import { ICopilotChatResultIn } from '../../prompt/common/conversation';
import { getSwitchToAutoOnRateLimitConfirmation, isContinueOnError } from '../../prompt/common/specialRequestTypes';
import { ChatParticipantRequestHandler } from '../../prompt/node/chatParticipantRequestHandler';
import { IFeedbackReporter } from '../../prompt/node/feedbackReporter';
import { IPromptCategorizerService } from '../../prompt/node/promptCategorizer';
import { ChatSummarizerProvider } from '../../prompt/node/summarizer';
import { ChatTitleProvider } from '../../prompt/node/title';
import { IUserFeedbackService } from './userActions';
import { getAdditionalWelcomeMessage } from './welcomeMessageProvider';

export class ChatAgentService implements IChatAgentService {
	declare readonly _serviceBrand: undefined;

	private _lastChatAgents: ChatAgents | undefined; // will be cleared when disposed

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }
	public debugGetCurrentChatAgents(): ChatAgents | undefined {
		return this._lastChatAgents;
	}

	register(): IDisposable {
		const chatAgents = this.instantiationService.createInstance(ChatAgents);
		chatAgents.register();
		this._lastChatAgents = chatAgents;
		return {
			dispose: () => {
				chatAgents.dispose();
				this._lastChatAgents = undefined;
			}
		};
	}
}

class ChatAgents implements IDisposable {
	private readonly _disposables = new DisposableStore();

	private additionalWelcomeMessage: vscode.MarkdownString | undefined;

	constructor(
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IUserFeedbackService private readonly userFeedbackService: IUserFeedbackService,
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
		@IFeedbackReporter private readonly feedbackReporter: IFeedbackReporter,
		@IInteractionService private readonly interactionService: IInteractionService,
		@IChatQuotaService private readonly _chatQuotaService: IChatQuotaService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExperimentationService private readonly experimentationService: IExperimentationService,
		@IPromptCategorizerService private readonly promptCategorizerService: IPromptCategorizerService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IChatSessionService chatSessionService: IChatSessionService,
	) {
		this._disposables.add(chatSessionService.onDidDisposeChatSession(sessionId => clearChatExtMarks(sessionId)));
	}

	dispose() {
		this._disposables.dispose();
	}

	register(): void {
		this.additionalWelcomeMessage = this.instantiationService.invokeFunction(getAdditionalWelcomeMessage);
		this._disposables.add(this.registerDefaultAgent());
		this._disposables.add(this.registerEditingAgent());
		this._disposables.add(this.registerEditingAgentEditor());
		this._disposables.add(this.registerEditsAgent());
		this._disposables.add(this.registerNotebookEditorDefaultAgent());
		this._disposables.add(this.registerNotebookDefaultAgent());
		this._disposables.add(this.registerVSCodeAgent());
		this._disposables.add(this.registerTerminalAgent());
		this._disposables.add(this.registerTerminalPanelAgent());
	}

	private createAgent(name: string, defaultIntentIdOrGetter: IntentOrGetter, options?: { id?: string }): vscode.ChatParticipant {
		const id = options?.id || getChatParticipantIdFromName(name);
		const agent = vscode.chat.createChatParticipant(id, this.getChatParticipantHandler(id, name, defaultIntentIdOrGetter));
		agent.onDidReceiveFeedback(e => {
			this.userFeedbackService.handleFeedback(e, id);
		});
		agent.onDidPerformAction(e => {
			this.userFeedbackService.handleUserAction(e, id);
		});
		this._disposables.add(autorun(reader => {
			agent.supportIssueReporting = this.feedbackReporter.canReport.read(reader);
		}));

		return agent;
	}

	private registerVSCodeAgent(): IDisposable {
		const useInsidersIcon = vscode.env.appName.includes('Insiders') || vscode.env.appName.includes('OSS');
		const vscodeAgent = this.createAgent(vscodeAgentName, Intent.VSCode);
		vscodeAgent.iconPath = useInsidersIcon ? new vscode.ThemeIcon('vscode-insiders') : new vscode.ThemeIcon('vscode');
		return vscodeAgent;
	}

	private registerTerminalAgent(): IDisposable {
		const terminalAgent = this.createAgent(terminalAgentName, Intent.Terminal);

		terminalAgent.iconPath = new vscode.ThemeIcon('terminal');
		return terminalAgent;
	}

	private registerTerminalPanelAgent(): IDisposable {
		const terminalPanelAgent = this.createAgent(terminalAgentName, Intent.Terminal, { id: 'github.copilot.terminalPanel' });

		terminalPanelAgent.iconPath = new vscode.ThemeIcon('terminal');

		return terminalPanelAgent;
	}

	private registerEditingAgent(): IDisposable {
		const editingAgent = this.createAgent(editingSessionAgentName, Intent.Edit);
		editingAgent.iconPath = new vscode.ThemeIcon('copilot');
		editingAgent.additionalWelcomeMessage = this.additionalWelcomeMessage;
		editingAgent.titleProvider = this.instantiationService.createInstance(ChatTitleProvider);
		return editingAgent;
	}

	private registerEditingAgentEditor(): IDisposable {
		const editingAgent = this.createAgent(editingSessionAgentEditorName, Intent.InlineChat);
		editingAgent.iconPath = new vscode.ThemeIcon('copilot');
		return editingAgent;
	}

	private registerEditsAgent(): IDisposable {
		const editingAgent = this.createAgent(editsAgentName, Intent.Agent);
		editingAgent.iconPath = new vscode.ThemeIcon('tools');
		editingAgent.additionalWelcomeMessage = this.additionalWelcomeMessage;
		editingAgent.titleProvider = this.instantiationService.createInstance(ChatTitleProvider);
		return editingAgent;
	}

	private registerDefaultAgent(): IDisposable {
		const intentGetter = (request: vscode.ChatRequest) => {
			if (this.configurationService.getExperimentBasedConfig(ConfigKey.TeamInternal.AskAgent, this.experimentationService) && request.model.capabilities.supportsToolCalling && this.configurationService.getNonExtensionConfig('chat.agent.enabled')) {
				return Intent.AskAgent;
			}
			return Intent.Unknown;
		};
		const defaultAgent = this.createAgent(defaultAgentName, intentGetter);
		defaultAgent.iconPath = new vscode.ThemeIcon('copilot');

		defaultAgent.helpTextPrefix = vscode.l10n.t('You can ask me general programming questions, or chat with the following participants which have specialized expertise and can perform actions:');
		const helpPostfix = vscode.l10n.t({
			message: `To have a great conversation, ask me questions as if I was a real programmer:

* **Show me the code** you want to talk about by having the files open and selecting the most important lines.
* **Make refinements** by asking me follow-up questions, adding clarifications, providing errors, etc.
* **Review my suggested code** and tell me about issues or improvements, so I can iterate on it.

You can also ask me questions about your editor selection by [starting an inline chat session](command:inlineChat.start).

Learn more about [GitHub Copilot](https://docs.github.com/copilot/using-github-copilot/getting-started-with-github-copilot?tool=vscode&utm_source=editor&utm_medium=chat-panel&utm_campaign=2024q3-em-MSFT-getstarted) in [Visual Studio Code](https://code.visualstudio.com/docs/copilot/overview). Or explore the [Copilot walkthrough](command:github.copilot.open.walkthrough).`,
			comment: `{Locked='](command:inlineChat.start)'}`
		});
		const markdownString = new vscode.MarkdownString(helpPostfix);
		markdownString.isTrusted = { enabledCommands: ['inlineChat.start', 'github.copilot.open.walkthrough'] };
		defaultAgent.helpTextPostfix = markdownString;

		defaultAgent.additionalWelcomeMessage = this.additionalWelcomeMessage;
		defaultAgent.titleProvider = this.instantiationService.createInstance(ChatTitleProvider);
		defaultAgent.summarizer = this.instantiationService.createInstance(ChatSummarizerProvider);

		return defaultAgent;
	}

	private registerNotebookEditorDefaultAgent(): IDisposable {
		const defaultAgent = this.createAgent('notebook', Intent.Editor);
		defaultAgent.iconPath = new vscode.ThemeIcon('copilot');

		return defaultAgent;
	}

	private registerNotebookDefaultAgent(): IDisposable {
		const defaultAgent = this.createAgent(notebookEditorAgentName, Intent.notebookEditor);
		defaultAgent.iconPath = new vscode.ThemeIcon('copilot');

		return defaultAgent;
	}

	private getChatParticipantHandler(id: string, name: string, defaultIntentIdOrGetter: IntentOrGetter): vscode.ChatExtendedRequestHandler {
		return async (request, context, stream, token): Promise<vscode.ChatResult> => {
			markChatExt(request.sessionId, ChatExtPerfMark.WillHandleParticipant);
			try {
				// If we need to switch to the base model, this function will handle it
				// Otherwise it just returns the same request passed into it
				request = await this.switchToBaseModel(request, stream);

				// Handle switch-to-auto confirmation button clicks from rate limit errors
				const switchToAutoConfirmation = getSwitchToAutoOnRateLimitConfirmation(request);
				if (switchToAutoConfirmation) {
					const action = switchToAutoConfirmation.alwaysSwitchToAuto ? 'switchToAutoAlways' : 'switchToAuto';
					/* __GDPR__
						"chatRateLimitAction" : {
							"owner": "lramos15",
							"comment": "Tracks which action users take when rate limited",
							"action": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The action taken: switchToAuto, switchToAutoAlways, tryAgain, or autoSwitch." },
							"modelId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The model ID the user was rate limited on." }
						}
					*/
					this.telemetryService.sendMSFTTelemetryEvent('chatRateLimitAction', { action, modelId: request.model?.id });
					request = await this.switchToAutoModel(request, stream, switchToAutoConfirmation.alwaysSwitchToAuto);
				} else if (isContinueOnError(request)) {
					this.telemetryService.sendMSFTTelemetryEvent('chatRateLimitAction', { action: 'tryAgain', modelId: request.model?.id });
				}

				// The user is starting an interaction with the chat
				if (!request.subAgentInvocationId) {
					this.interactionService.startInteraction();
				}

				// Generate a shared telemetry message ID on the first turn only — subsequent turns have no
				// categorization event to join and ChatTelemetryBuilder will generate its own ID.
				const telemetryMessageId = context.history.length === 0 ? generateUuid() : undefined;

				// Categorize the first prompt (fire-and-forget)
				if (telemetryMessageId !== undefined) {
					this.promptCategorizerService.categorizePrompt(request, context, telemetryMessageId);
				}

				const defaultIntentId = typeof defaultIntentIdOrGetter === 'function' ?
					defaultIntentIdOrGetter(request) :
					defaultIntentIdOrGetter;

				// empty chatAgentArgs will force InteractiveSession to not use a command or try to parse one out of the query
				const commandsForAgent = agentsToCommands[defaultIntentId];
				const intentId = request.command && commandsForAgent ?
					commandsForAgent[request.command] :
					defaultIntentId;

				const handler = this.instantiationService.createInstance(ChatParticipantRequestHandler, context.history, request, stream, token, { agentName: name, agentId: id, intentId }, () => context.yieldRequested, telemetryMessageId);
				let result = await handler.getResult();

				// Auto-retry with Auto model when the setting is enabled and the handler signals it
				if ((result as ICopilotChatResultIn).metadata?.shouldAutoSwitchToAuto) {
					const previousModelId = request.model?.id;
					const switchedRequest = await this.switchToAutoModel(request, stream, false);
					if (switchedRequest.model?.id !== previousModelId) {
						this.telemetryService.sendMSFTTelemetryEvent('chatRateLimitAction', { action: 'autoSwitch', modelId: previousModelId });
						request = switchedRequest;
						const retryHandler = this.instantiationService.createInstance(ChatParticipantRequestHandler, context.history, request, stream, token, { agentName: name, agentId: id, intentId }, () => context.yieldRequested, telemetryMessageId);
						result = await retryHandler.getResult();
					}
				}

				return result;
			} finally {
				markChatExt(request.sessionId, ChatExtPerfMark.DidHandleParticipant);
				clearChatExtMarks(request.sessionId);
			}
		};
	}

	private async switchToBaseModel(request: vscode.ChatRequest, stream: vscode.ChatResponseStream): Promise<ChatRequest> {
		const endpoint = await this.endpointProvider.getChatEndpoint(request);
		const baseEndpoint = await this.endpointProvider.getChatEndpoint('copilot-base');
		// If it has a 0x multipler, it's free so don't switch them. If it's BYOK, it's free so don't switch them.
		if (endpoint.multiplier === 0 || request.model.vendor !== 'copilot' || endpoint.multiplier === undefined) {
			return request;
		}
		if (this._chatQuotaService.overagesEnabled || !this._chatQuotaService.quotaExhausted) {
			return request;
		}
		const baseLmModel = (await vscode.lm.selectChatModels({ id: baseEndpoint.model, family: baseEndpoint.family, vendor: 'copilot' }))[0];
		if (!baseLmModel) {
			return request;
		}
		await vscode.commands.executeCommand('workbench.action.chat.changeModel', { vendor: baseLmModel.vendor, id: baseLmModel.id, family: baseLmModel.family });
		// Switch to the base model and show a warning
		request = { ...request, model: baseLmModel };
		let messageString: vscode.MarkdownString;
		if (this.authenticationService.copilotToken?.isIndividual) {
			messageString = new vscode.MarkdownString(vscode.l10n.t({
				message: 'You have exceeded your premium request allowance. We have automatically switched you to {0} which is included with your plan. [Enable additional paid premium requests]({1}) to continue using premium models.',
				args: [baseEndpoint.name, 'command:chat.enablePremiumOverages'],
				// To make sure the translators don't break the link
				comment: [`{Locked=']({'}`]
			}));
			messageString.isTrusted = { enabledCommands: ['chat.enablePremiumOverages'] };
		} else {
			messageString = new vscode.MarkdownString(vscode.l10n.t('You have exceeded your premium request allowance. We have automatically switched you to {0} which is included with your plan. To enable additional paid premium requests, contact your organization admin.', baseEndpoint.name));
		}
		stream.warning(messageString);
		return request;
	}

	private async switchToAutoModel(request: vscode.ChatRequest, stream: vscode.ChatResponseStream, alwaysSwitchToAuto: boolean): Promise<ChatRequest> {
		const autoModel = (await vscode.lm.selectChatModels({ id: 'auto', vendor: 'copilot' }))[0];
		if (!autoModel) {
			return request;
		}
		await vscode.commands.executeCommand('workbench.action.chat.changeModel', { vendor: autoModel.vendor, id: autoModel.id, family: autoModel.family });
		request = { ...request, model: autoModel };
		if (alwaysSwitchToAuto) {
			await vscode.workspace.getConfiguration('github.copilot').update('chat.rateLimitAutoSwitchToAuto', true, vscode.ConfigurationTarget.Global);
		}
		stream.warning(new vscode.MarkdownString(vscode.l10n.t('You were rate-limited on the selected model. Switching to Auto and retrying your request.')));
		return request;
	}
}

type IntentOrGetter = Intent | ((request: vscode.ChatRequest) => Intent);
