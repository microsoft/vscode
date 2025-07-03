/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatSetup.css';
import { $ } from '../../../../base/browser/dom.js';
import { Dialog, DialogContentsAlignment } from '../../../../base/browser/ui/dialog/dialog.js';
import { WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from '../../../../base/common/actions.js';
import { timeout } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { Disposable, DisposableStore, IDisposable, markAsSingleton, MutableDisposable } from '../../../../base/common/lifecycle.js';
import Severity from '../../../../base/common/severity.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { equalsIgnoreCase } from '../../../../base/common/strings.js';
import { isObject } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { MarkdownRenderer } from '../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { createWorkbenchDialogOptions } from '../../../../platform/dialogs/browser/dialog.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import product from '../../../../platform/product/common/product.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ITelemetryService, TelemetryLevel } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../common/views.js';
import { IActivityService, ProgressBadge } from '../../../services/activity/common/activity.js';
import { AuthenticationSession, IAuthenticationService } from '../../../services/authentication/common/authentication.js';
import { ExtensionUrlHandlerOverrideRegistry } from '../../../services/extensions/browser/extensionUrlHandler.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { CountTokensCallback, ILanguageModelToolsService, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolResult, ToolDataSource, ToolProgress } from '../../chat/common/languageModelToolsService.js';
import { IExtensionsWorkbenchService } from '../../extensions/common/extensions.js';
import { IChatAgentImplementation, IChatAgentRequest, IChatAgentResult, IChatAgentService } from '../common/chatAgents.js';
import { ChatContextKeys } from '../common/chatContextKeys.js';
import { ChatEntitlement, ChatEntitlementContext, ChatEntitlementRequests, ChatEntitlementService, IChatEntitlementService, isProUser } from '../common/chatEntitlementService.js';
import { ChatModel, ChatRequestModel, IChatRequestModel, IChatRequestVariableData } from '../common/chatModel.js';
import { IChatRequestToolEntry } from '../common/chatVariableEntries.js';
import { ChatRequestAgentPart, ChatRequestToolPart } from '../common/chatParserTypes.js';
import { IChatProgress, IChatService } from '../common/chatService.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind, validateChatMode } from '../common/constants.js';
import { ILanguageModelsService } from '../common/languageModels.js';
import { CHAT_CATEGORY, CHAT_OPEN_ACTION_ID, CHAT_SETUP_ACTION_ID } from './actions/chatActions.js';
import { ChatViewId, IChatWidgetService, showCopilotView } from './chat.js';
import { CHAT_SIDEBAR_PANEL_ID } from './chatViewPane.js';
import { coalesce } from '../../../../base/common/arrays.js';
import { IButton } from '../../../../base/browser/ui/button/button.js';
import { ChatMode } from '../common/chatModes.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';

const defaultChat = {
	extensionId: product.defaultChatAgent?.extensionId ?? '',
	chatExtensionId: product.defaultChatAgent?.chatExtensionId ?? '',
	documentationUrl: product.defaultChatAgent?.documentationUrl ?? '',
	skusDocumentationUrl: product.defaultChatAgent?.skusDocumentationUrl ?? '',
	publicCodeMatchesUrl: product.defaultChatAgent?.publicCodeMatchesUrl ?? '',
	manageOveragesUrl: product.defaultChatAgent?.manageOverageUrl ?? '',
	upgradePlanUrl: product.defaultChatAgent?.upgradePlanUrl ?? '',
	signUpUrl: product.defaultChatAgent?.signUpUrl ?? '',
	providerId: product.defaultChatAgent?.providerId ?? '',
	providerName: product.defaultChatAgent?.providerName ?? '',
	enterpriseProviderId: product.defaultChatAgent?.enterpriseProviderId ?? '',
	enterpriseProviderName: product.defaultChatAgent?.enterpriseProviderName ?? '',
	alternativeProviderId: product.defaultChatAgent?.alternativeProviderId ?? '',
	alternativeProviderName: product.defaultChatAgent?.alternativeProviderName ?? '',
	providerUriSetting: product.defaultChatAgent?.providerUriSetting ?? '',
	providerScopes: product.defaultChatAgent?.providerScopes ?? [[]],
	manageSettingsUrl: product.defaultChatAgent?.manageSettingsUrl ?? '',
	completionsAdvancedSetting: product.defaultChatAgent?.completionsAdvancedSetting ?? '',
	walkthroughCommand: product.defaultChatAgent?.walkthroughCommand ?? '',
	completionsRefreshTokenCommand: product.defaultChatAgent?.completionsRefreshTokenCommand ?? '',
	chatRefreshTokenCommand: product.defaultChatAgent?.chatRefreshTokenCommand ?? '',
};

//#region Contribution

const ToolsAgentContextKey = ContextKeyExpr.and(
	ContextKeyExpr.equals(`config.${ChatConfiguration.AgentEnabled}`, true),
	ContextKeyExpr.not(`previewFeaturesDisabled`) // Set by extension
);

class SetupAgent extends Disposable implements IChatAgentImplementation {

	static registerDefaultAgents(instantiationService: IInstantiationService, location: ChatAgentLocation, mode: ChatModeKind | undefined, context: ChatEntitlementContext, controller: Lazy<ChatSetupController>): { agent: SetupAgent; disposable: IDisposable } {
		return instantiationService.invokeFunction(accessor => {
			const chatAgentService = accessor.get(IChatAgentService);

			let id: string;
			let description = ChatMode.Ask.description.get();
			switch (location) {
				case ChatAgentLocation.Panel:
					if (mode === ChatModeKind.Ask) {
						id = 'setup.chat';
					} else if (mode === ChatModeKind.Edit) {
						id = 'setup.edits';
						description = ChatMode.Edit.description.get();
					} else {
						id = 'setup.agent';
						description = ChatMode.Agent.description.get();
					}
					break;
				case ChatAgentLocation.Terminal:
					id = 'setup.terminal';
					break;
				case ChatAgentLocation.Editor:
					id = 'setup.editor';
					break;
				case ChatAgentLocation.Notebook:
					id = 'setup.notebook';
					break;
			}

			return SetupAgent.doRegisterAgent(instantiationService, chatAgentService, id, `${defaultChat.providerName} Copilot`, true, description, location, mode, context, controller);
		});
	}

	static registerVSCodeAgent(instantiationService: IInstantiationService, context: ChatEntitlementContext, controller: Lazy<ChatSetupController>): { agent: SetupAgent; disposable: IDisposable } {
		return instantiationService.invokeFunction(accessor => {
			const chatAgentService = accessor.get(IChatAgentService);

			const disposables = new DisposableStore();

			const { agent, disposable } = SetupAgent.doRegisterAgent(instantiationService, chatAgentService, 'setup.vscode', 'vscode', false, localize2('vscodeAgentDescription', "Ask questions about VS Code").value, ChatAgentLocation.Panel, undefined, context, controller);
			disposables.add(disposable);

			disposables.add(SetupTool.registerTool(instantiationService, {
				id: 'setup.tools.createNewWorkspace',
				source: ToolDataSource.Internal,
				icon: Codicon.newFolder,
				displayName: localize('setupToolDisplayName', "New Workspace"),
				modelDescription: localize('setupToolsDescription', "Scaffold a new workspace in VS Code"),
				userDescription: localize('setupToolsDescription', "Scaffold a new workspace in VS Code"),
				canBeReferencedInPrompt: true,
				toolReferenceName: 'new',
				when: ContextKeyExpr.true(),
			}).disposable);

			return { agent, disposable: disposables };
		});
	}

	private static doRegisterAgent(instantiationService: IInstantiationService, chatAgentService: IChatAgentService, id: string, name: string, isDefault: boolean, description: string, location: ChatAgentLocation, mode: ChatModeKind | undefined, context: ChatEntitlementContext, controller: Lazy<ChatSetupController>): { agent: SetupAgent; disposable: IDisposable } {
		const disposables = new DisposableStore();
		disposables.add(chatAgentService.registerAgent(id, {
			id,
			name,
			isDefault,
			isCore: true,
			modes: mode ? [mode] : [ChatModeKind.Ask],
			when: mode === ChatModeKind.Agent ? ToolsAgentContextKey?.serialize() : undefined,
			slashCommands: [],
			disambiguation: [],
			locations: [location],
			metadata: { helpTextPrefix: SetupAgent.SETUP_NEEDED_MESSAGE },
			description,
			extensionId: nullExtensionDescription.identifier,
			extensionDisplayName: nullExtensionDescription.name,
			extensionPublisherId: nullExtensionDescription.publisher
		}));

		const agent = disposables.add(instantiationService.createInstance(SetupAgent, context, controller, location));
		disposables.add(chatAgentService.registerAgentImplementation(id, agent));
		if (mode === ChatModeKind.Agent) {
			chatAgentService.updateAgent(id, { themeIcon: Codicon.tools });
		}

		return { agent, disposable: disposables };
	}

	private static readonly SETUP_NEEDED_MESSAGE = new MarkdownString(localize('settingUpCopilotNeeded', "You need to set up Copilot and be signed in to use Chat."));
	private static readonly TRUST_NEEDED_MESSAGE = new MarkdownString(localize('trustNeeded', "You need to trust this workspace to use Chat."));

	private readonly _onUnresolvableError = this._register(new Emitter<void>());
	readonly onUnresolvableError = this._onUnresolvableError.event;

	private readonly pendingForwardedRequests = new Map<string, Promise<void>>();

	constructor(
		private readonly context: ChatEntitlementContext,
		private readonly controller: Lazy<ChatSetupController>,
		private readonly location: ChatAgentLocation,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustManagementService: IWorkspaceTrustManagementService
	) {
		super();
	}

	async invoke(request: IChatAgentRequest, progress: (parts: IChatProgress[]) => void): Promise<IChatAgentResult> {
		return this.instantiationService.invokeFunction(async accessor /* using accessor for lazy loading */ => {
			const chatService = accessor.get(IChatService);
			const languageModelsService = accessor.get(ILanguageModelsService);
			const chatWidgetService = accessor.get(IChatWidgetService);
			const chatAgentService = accessor.get(IChatAgentService);
			const languageModelToolsService = accessor.get(ILanguageModelToolsService);

			return this.doInvoke(request, part => progress([part]), chatService, languageModelsService, chatWidgetService, chatAgentService, languageModelToolsService);
		});
	}

	private async doInvoke(request: IChatAgentRequest, progress: (part: IChatProgress) => void, chatService: IChatService, languageModelsService: ILanguageModelsService, chatWidgetService: IChatWidgetService, chatAgentService: IChatAgentService, languageModelToolsService: ILanguageModelToolsService): Promise<IChatAgentResult> {
		if (!this.context.state.installed || this.context.state.disabled || this.context.state.untrusted || this.context.state.entitlement === ChatEntitlement.Available || this.context.state.entitlement === ChatEntitlement.Unknown) {
			return this.doInvokeWithSetup(request, progress, chatService, languageModelsService, chatWidgetService, chatAgentService, languageModelToolsService);
		}

		return this.doInvokeWithoutSetup(request, progress, chatService, languageModelsService, chatWidgetService, chatAgentService, languageModelToolsService);
	}

	private async doInvokeWithoutSetup(request: IChatAgentRequest, progress: (part: IChatProgress) => void, chatService: IChatService, languageModelsService: ILanguageModelsService, chatWidgetService: IChatWidgetService, chatAgentService: IChatAgentService, languageModelToolsService: ILanguageModelToolsService): Promise<IChatAgentResult> {
		const requestModel = chatWidgetService.getWidgetBySessionId(request.sessionId)?.viewModel?.model.getRequests().at(-1);
		if (!requestModel) {
			this.logService.error('[chat setup] Request model not found, cannot redispatch request.');
			return {}; // this should not happen
		}

		progress({
			kind: 'progressMessage',
			content: new MarkdownString(localize('waitingCopilot', "Getting Copilot ready")),
		});

		await this.forwardRequestToCopilot(requestModel, progress, chatService, languageModelsService, chatAgentService, chatWidgetService, languageModelToolsService);

		return {};
	}

	private async forwardRequestToCopilot(requestModel: IChatRequestModel, progress: (part: IChatProgress) => void, chatService: IChatService, languageModelsService: ILanguageModelsService, chatAgentService: IChatAgentService, chatWidgetService: IChatWidgetService, languageModelToolsService: ILanguageModelToolsService): Promise<void> {
		try {
			await this.doForwardRequestToCopilot(requestModel, progress, chatService, languageModelsService, chatAgentService, chatWidgetService, languageModelToolsService);
		} catch (error) {
			progress({
				kind: 'warning',
				content: new MarkdownString(localize('copilotUnavailableWarning', "Copilot failed to get a response. Please try again."))
			});
		}
	}

	private async doForwardRequestToCopilot(requestModel: IChatRequestModel, progress: (part: IChatProgress) => void, chatService: IChatService, languageModelsService: ILanguageModelsService, chatAgentService: IChatAgentService, chatWidgetService: IChatWidgetService, languageModelToolsService: ILanguageModelToolsService): Promise<void> {
		if (this.pendingForwardedRequests.has(requestModel.session.sessionId)) {
			throw new Error('Request already in progress');
		}

		const forwardRequest = this.doForwardRequestToCopilotWhenReady(requestModel, progress, chatService, languageModelsService, chatAgentService, chatWidgetService, languageModelToolsService);
		this.pendingForwardedRequests.set(requestModel.session.sessionId, forwardRequest);

		try {
			await forwardRequest;
		} finally {
			this.pendingForwardedRequests.delete(requestModel.session.sessionId);
		}
	}

	private async doForwardRequestToCopilotWhenReady(requestModel: IChatRequestModel, progress: (part: IChatProgress) => void, chatService: IChatService, languageModelsService: ILanguageModelsService, chatAgentService: IChatAgentService, chatWidgetService: IChatWidgetService, languageModelToolsService: ILanguageModelToolsService): Promise<void> {
		const widget = chatWidgetService.getWidgetBySessionId(requestModel.session.sessionId);
		const mode = widget?.input.currentModeKind;
		const languageModel = widget?.input.currentLanguageModel;

		// We need a signal to know when we can resend the request to
		// Copilot. Waiting for the registration of the agent is not
		// enough, we also need a language/tools model to be available.

		const whenAgentReady = this.whenAgentReady(chatAgentService, mode);
		const whenLanguageModelReady = this.whenLanguageModelReady(languageModelsService);
		const whenToolsModelReady = this.whenToolsModelReady(languageModelToolsService, requestModel);

		if (whenLanguageModelReady instanceof Promise || whenAgentReady instanceof Promise || whenToolsModelReady instanceof Promise) {
			const timeoutHandle = setTimeout(() => {
				progress({
					kind: 'progressMessage',
					content: new MarkdownString(localize('waitingCopilot2', "Copilot is almost ready")),
				});
			}, 10000);

			try {
				const ready = await Promise.race([
					timeout(this.environmentService.remoteAuthority ? 60000 /* increase for remote scenarios */ : 20000).then(() => 'timedout'),
					this.whenDefaultAgentFailed(chatService).then(() => 'error'),
					Promise.allSettled([whenLanguageModelReady, whenAgentReady, whenToolsModelReady])
				]);

				if (ready === 'error' || ready === 'timedout') {
					let warningMessage: string;
					if (ready === 'timedout') {
						warningMessage = localize('copilotTookLongWarning', "Copilot took too long to get ready. Please ensure you are signed in to {0} and that the extension `{1}` is installed and enabled.", defaultChat.providerName, defaultChat.chatExtensionId);
					} else {
						warningMessage = localize('copilotFailedWarning', "Copilot failed to get ready. Please ensure you are signed in to {0} and that the extension `{1}` is installed and enabled.", defaultChat.providerName, defaultChat.chatExtensionId);
					}

					progress({
						kind: 'warning',
						content: new MarkdownString(warningMessage)
					});

					// This means Copilot is unhealthy and we cannot retry the
					// request. Signal this to the outside via an event.
					this._onUnresolvableError.fire();
					return;
				}
			} finally {
				clearTimeout(timeoutHandle);
			}
		}

		await chatService.resendRequest(requestModel, {
			...widget?.getModeRequestOptions(),
			mode,
			userSelectedModelId: languageModel,
		});
	}

	private whenLanguageModelReady(languageModelsService: ILanguageModelsService): Promise<unknown> | void {
		for (const id of languageModelsService.getLanguageModelIds()) {
			const model = languageModelsService.lookupLanguageModel(id);
			if (model && model.isDefault) {
				return; // we have language models!
			}
		}

		return Event.toPromise(Event.filter(languageModelsService.onDidChangeLanguageModels, e => e.added?.some(added => added.metadata.isDefault) ?? false));
	}

	private whenToolsModelReady(languageModelToolsService: ILanguageModelToolsService, requestModel: IChatRequestModel): Promise<unknown> | void {
		const needsToolsModel = requestModel.message.parts.some(part => part instanceof ChatRequestToolPart);
		if (!needsToolsModel) {
			return; // No tools in this request, no need to check
		}

		// check that tools other than setup. and internal tools are registered.
		for (const tool of languageModelToolsService.getTools()) {
			if (typeof tool.id === 'string' && tool.id.startsWith('copilot_')) {
				return; // we have tools!
			}
		}

		return Event.toPromise(Event.filter(languageModelToolsService.onDidChangeTools, () => {
			for (const tool of languageModelToolsService.getTools()) {
				if (typeof tool.id === 'string' && tool.id.startsWith('copilot_')) {
					return true; // we have tools!
				}
			}

			return false; // no external tools found
		}));
	}

	private whenAgentReady(chatAgentService: IChatAgentService, mode: ChatModeKind | undefined): Promise<unknown> | void {
		const defaultAgent = chatAgentService.getDefaultAgent(this.location, mode);
		if (defaultAgent && !defaultAgent.isCore) {
			return; // we have a default agent from an extension!
		}

		return Event.toPromise(Event.filter(chatAgentService.onDidChangeAgents, () => {
			const defaultAgent = chatAgentService.getDefaultAgent(this.location, mode);
			return Boolean(defaultAgent && !defaultAgent.isCore);
		}));
	}

	private async whenDefaultAgentFailed(chatService: IChatService): Promise<void> {
		return new Promise<void>(resolve => {
			chatService.activateDefaultAgent(this.location).catch(() => resolve());
		});
	}

	private async doInvokeWithSetup(request: IChatAgentRequest, progress: (part: IChatProgress) => void, chatService: IChatService, languageModelsService: ILanguageModelsService, chatWidgetService: IChatWidgetService, chatAgentService: IChatAgentService, languageModelToolsService: ILanguageModelToolsService): Promise<IChatAgentResult> {
		this.telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: CHAT_SETUP_ACTION_ID, from: 'chat' });

		const widget = chatWidgetService.getWidgetBySessionId(request.sessionId);
		const requestModel = widget?.viewModel?.model.getRequests().at(-1);

		const setupListener = Event.runAndSubscribe(this.controller.value.onDidChange, (() => {
			switch (this.controller.value.step) {
				case ChatSetupStep.SigningIn:
					progress({
						kind: 'progressMessage',
						content: new MarkdownString(localize('setupChatSignIn2', "Signing in to {0}.", ChatEntitlementRequests.providerId(this.configurationService) === defaultChat.enterpriseProviderId ? defaultChat.enterpriseProviderName : defaultChat.providerName)),
					});
					break;
				case ChatSetupStep.Installing:
					progress({
						kind: 'progressMessage',
						content: new MarkdownString(localize('installingCopilot', "Getting Copilot ready")),
					});
					break;
			}
		}));

		let result: IChatSetupResult | undefined = undefined;
		try {
			result = await ChatSetup.getInstance(this.instantiationService, this.context, this.controller).run({ disableChatViewReveal: true /* we are already in a chat context */ });
		} catch (error) {
			this.logService.error(`[chat setup] Error during setup: ${toErrorMessage(error)}`);
		} finally {
			setupListener.dispose();
		}

		// User has agreed to run the setup
		if (typeof result?.success === 'boolean') {
			if (result.success) {
				if (result.dialogSkipped) {
					widget?.clear(); // make room for the Chat welcome experience
				} else if (requestModel) {
					let newRequest = this.replaceAgentInRequestModel(requestModel, chatAgentService); 	// Replace agent part with the actual Copilot agent...
					newRequest = this.replaceToolInRequestModel(newRequest); 							// ...then replace any tool parts with the actual Copilot tools

					await this.forwardRequestToCopilot(newRequest, progress, chatService, languageModelsService, chatAgentService, chatWidgetService, languageModelToolsService);
				}
			} else {
				progress({
					kind: 'warning',
					content: new MarkdownString(localize('copilotSetupError', "Copilot setup failed."))
				});
			}
		}

		// User has cancelled the setup
		else {
			progress({
				kind: 'markdownContent',
				content: this.workspaceTrustManagementService.isWorkspaceTrusted() ? SetupAgent.SETUP_NEEDED_MESSAGE : SetupAgent.TRUST_NEEDED_MESSAGE
			});
		}

		return {};
	}

	private replaceAgentInRequestModel(requestModel: IChatRequestModel, chatAgentService: IChatAgentService): IChatRequestModel {
		const agentPart = requestModel.message.parts.find((r): r is ChatRequestAgentPart => r instanceof ChatRequestAgentPart);
		if (!agentPart) {
			return requestModel;
		}

		const agentId = agentPart.agent.id.replace(/setup\./, `${defaultChat.extensionId}.`.toLowerCase());
		const githubAgent = chatAgentService.getAgent(agentId);
		if (!githubAgent) {
			return requestModel;
		}

		const newAgentPart = new ChatRequestAgentPart(agentPart.range, agentPart.editorRange, githubAgent);

		return new ChatRequestModel({
			session: requestModel.session as ChatModel,
			message: {
				parts: requestModel.message.parts.map(part => {
					if (part instanceof ChatRequestAgentPart) {
						return newAgentPart;
					}
					return part;
				}),
				text: requestModel.message.text
			},
			variableData: requestModel.variableData,
			timestamp: Date.now(),
			attempt: requestModel.attempt,
			confirmation: requestModel.confirmation,
			locationData: requestModel.locationData,
			attachedContext: requestModel.attachedContext,
			isCompleteAddedRequest: requestModel.isCompleteAddedRequest,
		});
	}

	private replaceToolInRequestModel(requestModel: IChatRequestModel): IChatRequestModel {
		const toolPart = requestModel.message.parts.find((r): r is ChatRequestToolPart => r instanceof ChatRequestToolPart);
		if (!toolPart) {
			return requestModel;
		}

		const toolId = toolPart.toolId.replace(/setup.tools\./, `copilot_`.toLowerCase());
		const newToolPart = new ChatRequestToolPart(
			toolPart.range,
			toolPart.editorRange,
			toolPart.toolName,
			toolId,
			toolPart.displayName,
			toolPart.icon
		);

		const chatRequestToolEntry: IChatRequestToolEntry = {
			id: toolId,
			name: 'new',
			range: toolPart.range,
			kind: 'tool',
			value: undefined
		};

		const variableData: IChatRequestVariableData = {
			variables: [chatRequestToolEntry]
		};

		return new ChatRequestModel({
			session: requestModel.session as ChatModel,
			message: {
				parts: requestModel.message.parts.map(part => {
					if (part instanceof ChatRequestToolPart) {
						return newToolPart;
					}
					return part;
				}),
				text: requestModel.message.text
			},
			variableData: variableData,
			timestamp: Date.now(),
			attempt: requestModel.attempt,
			confirmation: requestModel.confirmation,
			locationData: requestModel.locationData,
			attachedContext: [chatRequestToolEntry],
			isCompleteAddedRequest: requestModel.isCompleteAddedRequest,
		});
	}
}


class SetupTool extends Disposable implements IToolImpl {

	static registerTool(instantiationService: IInstantiationService, toolData: IToolData): { tool: SetupTool; disposable: IDisposable } {
		return instantiationService.invokeFunction(accessor => {
			const toolService = accessor.get(ILanguageModelToolsService);

			const disposables = new DisposableStore();

			disposables.add(toolService.registerToolData(toolData));

			const tool = instantiationService.createInstance(SetupTool);
			disposables.add(toolService.registerToolImplementation(toolData.id, tool));

			return { tool, disposable: disposables };
		});
	}

	async invoke(invocation: IToolInvocation, countTokens: CountTokensCallback, progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const result: IToolResult = {
			content: [
				{
					kind: 'text',
					value: ''
				}
			]
		};

		return result;
	}

	async prepareToolInvocation?(parameters: any, token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		return undefined;
	}
}

enum ChatSetupStrategy {
	Canceled = 0,
	DefaultSetup = 1,
	SetupWithoutEnterpriseProvider = 2,
	SetupWithEnterpriseProvider = 3,
	SetupWithAccountCreate = 4,
	SetupWithAlternateProvider = 5
}

type ChatSetupResultValue = boolean /* success */ | undefined /* canceled */;

interface IChatSetupResult {
	readonly success: ChatSetupResultValue;
	readonly dialogSkipped: boolean;
}

class ChatSetup {

	private static instance: ChatSetup | undefined = undefined;
	static getInstance(instantiationService: IInstantiationService, context: ChatEntitlementContext, controller: Lazy<ChatSetupController>): ChatSetup {
		let instance = ChatSetup.instance;
		if (!instance) {
			instance = ChatSetup.instance = instantiationService.invokeFunction(accessor => {
				return new ChatSetup(context, controller, instantiationService, accessor.get(ITelemetryService), accessor.get(IWorkbenchLayoutService), accessor.get(IKeybindingService), accessor.get(IChatEntitlementService) as ChatEntitlementService, accessor.get(ILogService), accessor.get(IConfigurationService), accessor.get(IViewsService), accessor.get(IOpenerService), accessor.get(IWorkspaceTrustRequestService));
			});
		}

		return instance;
	}

	private pendingRun: Promise<IChatSetupResult> | undefined = undefined;

	private skipDialogOnce = false;

	private constructor(
		private readonly context: ChatEntitlementContext,
		private readonly controller: Lazy<ChatSetupController>,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ILayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IChatEntitlementService private readonly chatEntitlementService: ChatEntitlementService,
		@ILogService private readonly logService: ILogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IViewsService private readonly viewsService: IViewsService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IWorkspaceTrustRequestService private readonly workspaceTrustRequestService: IWorkspaceTrustRequestService
	) { }

	skipDialog(): void {
		this.skipDialogOnce = true;
	}

	async run(options?: { disableChatViewReveal?: boolean }): Promise<IChatSetupResult> {
		if (this.pendingRun) {
			return this.pendingRun;
		}

		this.pendingRun = this.doRun(options);

		try {
			return await this.pendingRun;
		} finally {
			this.pendingRun = undefined;
		}
	}

	private async doRun(options?: { disableChatViewReveal?: boolean }): Promise<IChatSetupResult> {
		this.context.update({ later: false });

		const dialogSkipped = this.skipDialogOnce;
		this.skipDialogOnce = false;

		const trusted = await this.workspaceTrustRequestService.requestWorkspaceTrust({
			message: localize('copilotWorkspaceTrust', "Copilot is currently only supported in trusted workspaces.")
		});
		if (!trusted) {
			this.context.update({ later: true });
			this.telemetryService.publicLog2<InstallChatEvent, InstallChatClassification>('commandCenter.chatInstall', { installResult: 'failedNotTrusted', installDuration: 0, signUpErrorCode: undefined, provider: undefined });

			return { dialogSkipped, success: undefined /* canceled */ };
		}

		let setupStrategy: ChatSetupStrategy;
		if (dialogSkipped || isProUser(this.chatEntitlementService.entitlement) || this.chatEntitlementService.entitlement === ChatEntitlement.Free) {
			setupStrategy = ChatSetupStrategy.DefaultSetup; // existing pro/free users setup without a dialog
		} else {
			setupStrategy = await this.showDialog();
		}

		if (setupStrategy === ChatSetupStrategy.DefaultSetup && ChatEntitlementRequests.providerId(this.configurationService) === defaultChat.enterpriseProviderId) {
			setupStrategy = ChatSetupStrategy.SetupWithEnterpriseProvider; // users with a configured provider go through provider setup
		}

		if (setupStrategy !== ChatSetupStrategy.Canceled && !options?.disableChatViewReveal) {
			// Show the chat view now to better indicate progress
			// while installing the extension or returning from sign in
			showCopilotView(this.viewsService, this.layoutService);
		}

		let success: ChatSetupResultValue = undefined;
		try {
			switch (setupStrategy) {
				case ChatSetupStrategy.SetupWithEnterpriseProvider:
					success = await this.controller.value.setupWithProvider({ useEnterpriseProvider: true, useAlternateProvider: false });
					break;
				case ChatSetupStrategy.SetupWithoutEnterpriseProvider:
					success = await this.controller.value.setupWithProvider({ useEnterpriseProvider: false, useAlternateProvider: false });
					break;
				case ChatSetupStrategy.SetupWithAlternateProvider:
					success = await this.controller.value.setupWithProvider({ useEnterpriseProvider: false, useAlternateProvider: true });
					break;
				case ChatSetupStrategy.DefaultSetup:
					success = await this.controller.value.setup();
					break;
				case ChatSetupStrategy.SetupWithAccountCreate:
					this.openerService.open(URI.parse(defaultChat.signUpUrl));
					return this.doRun(options); // open dialog again
				case ChatSetupStrategy.Canceled:
					this.context.update({ later: true });
					this.telemetryService.publicLog2<InstallChatEvent, InstallChatClassification>('commandCenter.chatInstall', { installResult: 'failedMaybeLater', installDuration: 0, signUpErrorCode: undefined, provider: undefined });
					break;
			}
		} catch (error) {
			this.logService.error(`[chat setup] Error during setup: ${toErrorMessage(error)}`);
			success = false;
		}

		return { success, dialogSkipped };
	}

	private async showDialog(): Promise<ChatSetupStrategy> {
		const disposables = new DisposableStore();

		const dialogVariant = this.configurationService.getValue<'default' | 'alternate-first' | 'alternate-color' | 'alternate-monochrome' | unknown>('chat.setup.signInDialogVariant');
		const buttons = this.getButtons(dialogVariant);

		const dialog = disposables.add(new Dialog(
			this.layoutService.activeContainer,
			this.getDialogTitle(),
			buttons.map(button => button[0]),
			createWorkbenchDialogOptions({
				type: 'none',
				extraClasses: ['chat-setup-dialog'],
				detail: ' ', // workaround allowing us to render the message in large
				icon: Codicon.copilotLarge,
				alignment: DialogContentsAlignment.Vertical,
				cancelId: buttons.length - 1,
				disableCloseButton: true,
				renderFooter: this.telemetryService.telemetryLevel !== TelemetryLevel.NONE ? footer => footer.appendChild(this.createDialogFooter(disposables)) : undefined,
				buttonOptions: buttons.map(button => button[2])
			}, this.keybindingService, this.layoutService)
		));

		const { button } = await dialog.show();
		disposables.dispose();

		return buttons[button]?.[1] ?? ChatSetupStrategy.Canceled;
	}

	private getButtons(variant: 'default' | 'alternate-first' | 'alternate-color' | 'alternate-monochrome' | unknown): Array<[string, ChatSetupStrategy, { styleButton?: (button: IButton) => void } | undefined]> {
		let buttons: Array<[string, ChatSetupStrategy, { styleButton?: (button: IButton) => void } | undefined]>;

		if (this.context.state.entitlement === ChatEntitlement.Unknown) {
			let alternateProvider: 'off' | 'monochrome' | 'colorful' | 'first' = 'off';
			if (defaultChat.alternativeProviderId) {
				if (this.configurationService.getValue('chat.setup.signInWithAlternateProvider')) {
					alternateProvider = 'colorful'; // TODO@bpasero remove me soon
				}

				switch (variant) {
					case 'alternate-first':
						alternateProvider = 'first';
						break;
					case 'alternate-color':
						alternateProvider = 'colorful';
						break;
					case 'alternate-monochrome':
						alternateProvider = 'monochrome';
						break;
				}
			}

			if (ChatEntitlementRequests.providerId(this.configurationService) === defaultChat.enterpriseProviderId) {
				buttons = coalesce([
					[localize('continueWith', "Continue with {0}", defaultChat.enterpriseProviderName), ChatSetupStrategy.SetupWithEnterpriseProvider, {
						styleButton: button => button.element.classList.add('continue-button', 'default')
					}],
					alternateProvider !== 'off' ? [localize('continueWith', "Continue with {0}", defaultChat.alternativeProviderName), ChatSetupStrategy.SetupWithAlternateProvider, {
						styleButton: button => button.element.classList.add('continue-button', 'alternate', alternateProvider)
					}] : undefined,
					[localize('signInWithProvider', "Sign in with a {0} account", defaultChat.providerName), ChatSetupStrategy.SetupWithoutEnterpriseProvider, {
						styleButton: button => button.element.classList.add('link-button')
					}]
				]);
			} else {
				buttons = coalesce([
					[localize('continueWith', "Continue with {0}", defaultChat.providerName), ChatSetupStrategy.SetupWithoutEnterpriseProvider, {
						styleButton: button => button.element.classList.add('continue-button', 'default')
					}],
					alternateProvider !== 'off' ? [localize('continueWith', "Continue with {0}", defaultChat.alternativeProviderName), ChatSetupStrategy.SetupWithAlternateProvider, {
						styleButton: button => button.element.classList.add('continue-button', 'alternate', alternateProvider)
					}] : undefined,
					[localize('signInWithProvider', "Sign in with a {0} account", defaultChat.enterpriseProviderName), ChatSetupStrategy.SetupWithEnterpriseProvider, {
						styleButton: button => button.element.classList.add('link-button')
					}]
				]);
			}

			if (alternateProvider === 'first') {
				[buttons[0], buttons[1]] = [buttons[1], buttons[0]];
			}
		} else {
			buttons = [[localize('setupCopilotButton', "Set up Copilot"), ChatSetupStrategy.DefaultSetup, undefined]];
		}

		buttons.push([localize('skipForNow', "Skip for now"), ChatSetupStrategy.Canceled, { styleButton: button => button.element.classList.add('link-button', 'skip-button') }]);

		return buttons;
	}

	private getDialogTitle(): string {
		if (this.context.state.entitlement === ChatEntitlement.Unknown) {
			return localize('signIn', "Sign in to use Copilot");
		}

		return localize('startUsing', "Start using Copilot");
	}

	private createDialogFooter(disposables: DisposableStore): HTMLElement {
		const element = $('.chat-setup-dialog-footer');

		const markdown = this.instantiationService.createInstance(MarkdownRenderer, {});

		// SKU Settings
		const settings = localize({ key: 'settings', comment: ['{Locked="["}', '{Locked="]({0})"}', '{Locked="]({1})"}'] }, "{0} Copilot Free, Pro and Pro+ may show [public code]({1}) suggestions and we may use your data for product improvement. You can change these [settings]({2}) at any time.", defaultChat.providerName, defaultChat.publicCodeMatchesUrl, defaultChat.manageSettingsUrl);
		element.appendChild($('p', undefined, disposables.add(markdown.render(new MarkdownString(settings, { isTrusted: true }))).element));

		return element;
	}
}

export class ChatSetupContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatSetup';

	constructor(
		@IProductService private readonly productService: IProductService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ICommandService private readonly commandService: ICommandService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IChatEntitlementService chatEntitlementService: ChatEntitlementService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		const context = chatEntitlementService.context?.value;
		const requests = chatEntitlementService.requests?.value;
		if (!context || !requests) {
			return; // disabled
		}

		const controller = new Lazy(() => this._register(this.instantiationService.createInstance(ChatSetupController, context, requests)));

		this.registerSetupAgents(context, controller);
		this.registerActions(context, requests, controller);
		this.registerUrlLinkHandler();
	}

	private registerSetupAgents(context: ChatEntitlementContext, controller: Lazy<ChatSetupController>): void {
		const defaultAgentDisposables = markAsSingleton(new MutableDisposable()); // prevents flicker on window reload
		const vscodeAgentDisposables = markAsSingleton(new MutableDisposable());

		const updateRegistration = () => {
			if (!context.state.hidden && !context.state.disabled) {

				// Default Agents (always, even if installed to allow for speedy requests right on startup)
				if (!defaultAgentDisposables.value) {
					const disposables = defaultAgentDisposables.value = new DisposableStore();

					// Panel Agents
					const panelAgentDisposables = disposables.add(new DisposableStore());
					for (const mode of [ChatModeKind.Ask, ChatModeKind.Edit, ChatModeKind.Agent]) {
						const { agent, disposable } = SetupAgent.registerDefaultAgents(this.instantiationService, ChatAgentLocation.Panel, mode, context, controller);
						panelAgentDisposables.add(disposable);
						panelAgentDisposables.add(agent.onUnresolvableError(() => {
							// An unresolvable error from our agent registrations means that
							// Copilot is unhealthy for some reason. We clear our panel
							// registration to give Copilot a chance to show a custom message
							// to the user from the views and stop pretending as if there was
							// a functional agent.
							this.logService.error('[chat setup] Unresolvable error from Copilot agent registration, clearing registration.');
							panelAgentDisposables.dispose();
						}));
					}

					// Inline Agents
					disposables.add(SetupAgent.registerDefaultAgents(this.instantiationService, ChatAgentLocation.Terminal, undefined, context, controller).disposable);
					disposables.add(SetupAgent.registerDefaultAgents(this.instantiationService, ChatAgentLocation.Notebook, undefined, context, controller).disposable);
					disposables.add(SetupAgent.registerDefaultAgents(this.instantiationService, ChatAgentLocation.Editor, undefined, context, controller).disposable);
				}

				// VSCode Agent + Tool (unless installed and enabled)
				if (!(context.state.installed && !context.state.disabled) && !vscodeAgentDisposables.value) {
					const disposables = vscodeAgentDisposables.value = new DisposableStore();

					disposables.add(SetupAgent.registerVSCodeAgent(this.instantiationService, context, controller).disposable);
				}
			} else {
				defaultAgentDisposables.clear();
				vscodeAgentDisposables.clear();
			}

			if (context.state.installed && !context.state.disabled) {
				vscodeAgentDisposables.clear(); // we need to do this to prevent showing duplicate agent/tool entries in the list
			}
		};

		this._register(Event.runAndSubscribe(context.onDidChange, () => updateRegistration()));
	}

	private registerActions(context: ChatEntitlementContext, requests: ChatEntitlementRequests, controller: Lazy<ChatSetupController>): void {
		const chatSetupTriggerContext = ContextKeyExpr.or(
			ChatContextKeys.Setup.installed.negate(),
			ChatContextKeys.Entitlement.canSignUp
		);

		const CHAT_SETUP_ACTION_LABEL = localize2('triggerChatSetup', "Use AI Features with Copilot for free...");

		class ChatSetupTriggerAction extends Action2 {

			constructor() {
				super({
					id: CHAT_SETUP_ACTION_ID,
					title: CHAT_SETUP_ACTION_LABEL,
					category: CHAT_CATEGORY,
					f1: true,
					precondition: chatSetupTriggerContext
				});
			}

			override async run(accessor: ServicesAccessor, mode: ChatModeKind): Promise<boolean> {
				const viewsService = accessor.get(IViewsService);
				const layoutService = accessor.get(IWorkbenchLayoutService);
				const instantiationService = accessor.get(IInstantiationService);
				const dialogService = accessor.get(IDialogService);
				const commandService = accessor.get(ICommandService);
				const lifecycleService = accessor.get(ILifecycleService);

				await context.update({ hidden: false });

				if (mode) {
					const chatWidget = await showCopilotView(viewsService, layoutService);
					chatWidget?.input.setChatMode(mode);
				}

				const setup = ChatSetup.getInstance(instantiationService, context, controller);
				const { success } = await setup.run();
				if (success === false && !lifecycleService.willShutdown) {
					const { confirmed } = await dialogService.confirm({
						type: Severity.Error,
						message: localize('setupErrorDialog', "Copilot setup failed. Would you like to try again?"),
						primaryButton: localize('retry', "Retry"),
					});

					if (confirmed) {
						return Boolean(await commandService.executeCommand(CHAT_SETUP_ACTION_ID));
					}
				}

				return Boolean(success);
			}
		}

		class ChatSetupTriggerWithoutDialogAction extends Action2 {

			constructor() {
				super({
					id: 'workbench.action.chat.triggerSetupWithoutDialog',
					title: CHAT_SETUP_ACTION_LABEL,
					precondition: chatSetupTriggerContext
				});
			}

			override async run(accessor: ServicesAccessor): Promise<void> {
				const viewsService = accessor.get(IViewsService);
				const layoutService = accessor.get(IWorkbenchLayoutService);
				const instantiationService = accessor.get(IInstantiationService);

				await context.update({ hidden: false });

				const chatWidget = await showCopilotView(viewsService, layoutService);
				ChatSetup.getInstance(instantiationService, context, controller).skipDialog();
				chatWidget?.acceptInput(localize('setupCopilot', "Set up Copilot."));
			}
		}

		class ChatSetupFromAccountsAction extends Action2 {

			constructor() {
				super({
					id: 'workbench.action.chat.triggerSetupFromAccounts',
					title: localize2('triggerChatSetupFromAccounts', "Sign in to use Copilot..."),
					menu: {
						id: MenuId.AccountsContext,
						group: '2_copilot',
						when: ContextKeyExpr.and(
							ChatContextKeys.Setup.hidden.negate(),
							ChatContextKeys.Setup.installed.negate(),
							ChatContextKeys.Entitlement.signedOut
						)
					}
				});
			}

			override async run(accessor: ServicesAccessor): Promise<void> {
				const commandService = accessor.get(ICommandService);
				const telemetryService = accessor.get(ITelemetryService);

				telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: CHAT_SETUP_ACTION_ID, from: 'accounts' });

				return commandService.executeCommand(CHAT_SETUP_ACTION_ID);
			}
		}

		class ChatSetupHideAction extends Action2 {

			static readonly ID = 'workbench.action.chat.hideSetup';
			static readonly TITLE = localize2('hideChatSetup', "Hide Copilot");

			constructor() {
				super({
					id: ChatSetupHideAction.ID,
					title: ChatSetupHideAction.TITLE,
					f1: true,
					category: CHAT_CATEGORY,
					precondition: ContextKeyExpr.and(ChatContextKeys.Setup.installed.negate(), ChatContextKeys.Setup.hidden.negate()),
					menu: {
						id: MenuId.ChatTitleBarMenu,
						group: 'z_hide',
						order: 1,
						when: ChatContextKeys.Setup.installed.negate()
					}
				});
			}

			override async run(accessor: ServicesAccessor): Promise<void> {
				const viewsDescriptorService = accessor.get(IViewDescriptorService);
				const layoutService = accessor.get(IWorkbenchLayoutService);
				const dialogService = accessor.get(IDialogService);

				const { confirmed } = await dialogService.confirm({
					message: localize('hideChatSetupConfirm', "Are you sure you want to hide Copilot?"),
					detail: localize('hideChatSetupDetail', "You can restore Copilot by running the '{0}' command.", CHAT_SETUP_ACTION_LABEL.value),
					primaryButton: localize('hideChatSetupButton', "Hide Copilot")
				});

				if (!confirmed) {
					return;
				}

				const location = viewsDescriptorService.getViewLocationById(ChatViewId);

				await context.update({ hidden: true });

				if (location === ViewContainerLocation.AuxiliaryBar) {
					const activeContainers = viewsDescriptorService.getViewContainersByLocation(location).filter(container => viewsDescriptorService.getViewContainerModel(container).activeViewDescriptors.length > 0);
					if (activeContainers.length === 0) {
						layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART); // hide if there are no views in the secondary sidebar
					}
				}
			}
		}

		const windowFocusListener = this._register(new MutableDisposable());
		class UpgradePlanAction extends Action2 {
			constructor() {
				super({
					id: 'workbench.action.chat.upgradePlan',
					title: localize2('managePlan', "Upgrade to Copilot Pro"),
					category: localize2('chat.category', 'Chat'),
					f1: true,
					precondition: ContextKeyExpr.or(
						ChatContextKeys.Entitlement.canSignUp,
						ChatContextKeys.Entitlement.free,
					),
					menu: {
						id: MenuId.ChatTitleBarMenu,
						group: 'a_first',
						order: 1,
						when: ContextKeyExpr.and(
							ChatContextKeys.Entitlement.free,
							ContextKeyExpr.or(
								ChatContextKeys.chatQuotaExceeded,
								ChatContextKeys.completionsQuotaExceeded
							)
						)
					}
				});
			}

			override async run(accessor: ServicesAccessor, from?: string): Promise<void> {
				const openerService = accessor.get(IOpenerService);
				const hostService = accessor.get(IHostService);
				const commandService = accessor.get(ICommandService);

				openerService.open(URI.parse(defaultChat.upgradePlanUrl));

				const entitlement = context.state.entitlement;
				if (!isProUser(entitlement)) {
					// If the user is not yet Pro, we listen to window focus to refresh the token
					// when the user has come back to the window assuming the user signed up.
					windowFocusListener.value = hostService.onDidChangeFocus(focus => this.onWindowFocus(focus, commandService));
				}
			}

			private async onWindowFocus(focus: boolean, commandService: ICommandService): Promise<void> {
				if (focus) {
					windowFocusListener.clear();

					const entitlements = await requests.forceResolveEntitlement(undefined);
					if (entitlements?.entitlement && isProUser(entitlements?.entitlement)) {
						refreshTokens(commandService);
					}
				}
			}
		}

		class EnableOveragesAction extends Action2 {
			constructor() {
				super({
					id: 'workbench.action.chat.manageOverages',
					title: localize2('manageOverages', "Manage Copilot Overages"),
					category: localize2('chat.category', 'Chat'),
					f1: true,
					precondition: ContextKeyExpr.or(
						ChatContextKeys.Entitlement.pro,
						ChatContextKeys.Entitlement.proPlus,
					),
					menu: {
						id: MenuId.ChatTitleBarMenu,
						group: 'a_first',
						order: 1,
						when: ContextKeyExpr.and(
							ContextKeyExpr.or(
								ChatContextKeys.Entitlement.pro,
								ChatContextKeys.Entitlement.proPlus,
							),
							ContextKeyExpr.or(
								ChatContextKeys.chatQuotaExceeded,
								ChatContextKeys.completionsQuotaExceeded
							)
						)
					}
				});
			}

			override async run(accessor: ServicesAccessor, from?: string): Promise<void> {
				const openerService = accessor.get(IOpenerService);
				openerService.open(URI.parse(defaultChat.manageOveragesUrl));
			}
		}

		registerAction2(ChatSetupTriggerAction);
		registerAction2(ChatSetupFromAccountsAction);
		registerAction2(ChatSetupTriggerWithoutDialogAction);
		registerAction2(ChatSetupHideAction);
		registerAction2(UpgradePlanAction);
		registerAction2(EnableOveragesAction);
	}

	private registerUrlLinkHandler(): void {
		this._register(ExtensionUrlHandlerOverrideRegistry.registerHandler({
			canHandleURL: url => {
				return url.scheme === this.productService.urlProtocol && equalsIgnoreCase(url.authority, defaultChat.chatExtensionId);
			},
			handleURL: async url => {
				const params = new URLSearchParams(url.query);
				this.telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: CHAT_SETUP_ACTION_ID, from: 'url', detail: params.get('referrer') ?? undefined });

				await this.commandService.executeCommand(CHAT_SETUP_ACTION_ID, validateChatMode(params.get('mode')));

				return true;
			}
		}));
	}
}

//#endregion

//#region Setup Controller

type InstallChatClassification = {
	owner: 'bpasero';
	comment: 'Provides insight into chat installation.';
	installResult: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the extension was installed successfully, cancelled or failed to install.' };
	installDuration: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The duration it took to install the extension.' };
	signUpErrorCode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The error code in case of an error signing up.' };
	provider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The provider used for the chat installation.' };
};
type InstallChatEvent = {
	installResult: 'installed' | 'alreadyInstalled' | 'cancelled' | 'failedInstall' | 'failedNotSignedIn' | 'failedSignUp' | 'failedNotTrusted' | 'failedNoSession' | 'failedMaybeLater';
	installDuration: number;
	signUpErrorCode: number | undefined;
	provider: string | undefined;
};

enum ChatSetupStep {
	Initial = 1,
	SigningIn,
	Installing
}

class ChatSetupController extends Disposable {

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private _step = ChatSetupStep.Initial;
	get step(): ChatSetupStep { return this._step; }

	constructor(
		private readonly context: ChatEntitlementContext,
		private readonly requests: ChatEntitlementRequests,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IProductService private readonly productService: IProductService,
		@ILogService private readonly logService: ILogService,
		@IProgressService private readonly progressService: IProgressService,
		@IActivityService private readonly activityService: IActivityService,
		@ICommandService private readonly commandService: ICommandService,
		@IDialogService private readonly dialogService: IDialogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
	) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.context.onDidChange(() => this._onDidChange.fire()));
	}

	private setStep(step: ChatSetupStep): void {
		if (this._step === step) {
			return;
		}

		this._step = step;
		this._onDidChange.fire();
	}

	async setup(options?: { forceSignIn?: boolean; useAlternateProvider?: boolean; useEnterpriseProvider?: boolean }): Promise<ChatSetupResultValue> {
		const watch = new StopWatch(false);
		const title = localize('setupChatProgress', "Getting Copilot ready...");
		const badge = this.activityService.showViewContainerActivity(CHAT_SIDEBAR_PANEL_ID, {
			badge: new ProgressBadge(() => title),
		});

		try {
			return await this.progressService.withProgress({
				location: ProgressLocation.Window,
				command: CHAT_OPEN_ACTION_ID,
				title,
			}, () => this.doSetup(options ?? {}, watch));
		} finally {
			badge.dispose();
		}
	}

	private async doSetup(options: { forceSignIn?: boolean; useAlternateProvider?: boolean; useEnterpriseProvider?: boolean }, watch: StopWatch): Promise<ChatSetupResultValue> {
		this.context.suspend();  // reduces flicker

		let success: ChatSetupResultValue = false;
		try {
			const providerId = ChatEntitlementRequests.providerId(this.configurationService);
			let session: AuthenticationSession | undefined;
			let entitlement: ChatEntitlement | undefined;

			const installation = this.doInstall();

			// Entitlement Unknown or `forceSignIn`: we need to sign-in user
			if (this.context.state.entitlement === ChatEntitlement.Unknown || options.forceSignIn) {
				this.setStep(ChatSetupStep.SigningIn);
				const result = await this.signIn({ useAlternateProvider: options.useAlternateProvider });
				if (!result.session) {
					const provider = options.useAlternateProvider ? defaultChat.alternativeProviderId : options.useEnterpriseProvider ? defaultChat.enterpriseProviderId : defaultChat.providerName;
					this.telemetryService.publicLog2<InstallChatEvent, InstallChatClassification>('commandCenter.chatInstall', { installResult: 'failedNotSignedIn', installDuration: watch.elapsed(), signUpErrorCode: undefined, provider });
					return undefined; // treat as cancelled because signing in already triggers an error dialog
				}

				session = result.session;
				entitlement = result.entitlement;
			}

			// Await Install
			this.setStep(ChatSetupStep.Installing);
			success = await this.install(session, entitlement ?? this.context.state.entitlement, providerId, watch, installation, options);
		} finally {
			this.setStep(ChatSetupStep.Initial);
			this.context.resume();
		}

		return success;
	}

	private async signIn(options: { useAlternateProvider?: boolean }): Promise<{ session: AuthenticationSession | undefined; entitlement: ChatEntitlement | undefined }> {
		let session: AuthenticationSession | undefined;
		let entitlements;
		try {
			({ session, entitlements } = await this.requests.signIn(options));
		} catch (e) {
			this.logService.error(`[chat setup] signIn: error ${e}`);
		}

		if (!session && !this.lifecycleService.willShutdown) {
			const { confirmed } = await this.dialogService.confirm({
				type: Severity.Error,
				message: localize('unknownSignInError', "Failed to sign in to {0}. Would you like to try again?", options?.useAlternateProvider ? defaultChat.alternativeProviderName : ChatEntitlementRequests.providerId(this.configurationService) === defaultChat.enterpriseProviderId ? defaultChat.enterpriseProviderName : defaultChat.providerName),
				detail: localize('unknownSignInErrorDetail', "You must be signed in to use Copilot."),
				primaryButton: localize('retry', "Retry")
			});

			if (confirmed) {
				return this.signIn(options);
			}
		}

		return { session, entitlement: entitlements?.entitlement };
	}

	private async install(session: AuthenticationSession | undefined, entitlement: ChatEntitlement, providerId: string, watch: StopWatch, installation: Promise<void>, options: { useAlternateProvider?: boolean; useEnterpriseProvider?: boolean }): Promise<ChatSetupResultValue> {
		const wasRunning = this.context.state.installed && !this.context.state.disabled;
		let signUpResult: boolean | { errorCode: number } | undefined = undefined;

		const provider = options.useAlternateProvider ? defaultChat.alternativeProviderId : options.useEnterpriseProvider ? defaultChat.enterpriseProviderId : defaultChat.providerName;

		try {

			if (
				entitlement !== ChatEntitlement.Free &&		// User is not signed up to Copilot Free
				!isProUser(entitlement) &&					// User is not signed up for a Copilot subscription
				entitlement !== ChatEntitlement.Unavailable	// User is eligible for Copilot Free
			) {
				if (!session) {
					try {
						session = (await this.authenticationService.getSessions(providerId)).at(0);
					} catch (error) {
						// ignore - errors can throw if a provider is not registered
					}

					if (!session) {
						this.telemetryService.publicLog2<InstallChatEvent, InstallChatClassification>('commandCenter.chatInstall', { installResult: 'failedNoSession', installDuration: watch.elapsed(), signUpErrorCode: undefined, provider });
						return false; // unexpected
					}
				}

				signUpResult = await this.requests.signUpFree(session);

				if (typeof signUpResult !== 'boolean' /* error */) {
					this.telemetryService.publicLog2<InstallChatEvent, InstallChatClassification>('commandCenter.chatInstall', { installResult: 'failedSignUp', installDuration: watch.elapsed(), signUpErrorCode: signUpResult.errorCode, provider });
				}
			}

			await this.doInstallWithRetry(installation);
		} catch (error) {
			this.logService.error(`[chat setup] install: error ${error}`);
			this.telemetryService.publicLog2<InstallChatEvent, InstallChatClassification>('commandCenter.chatInstall', { installResult: isCancellationError(error) ? 'cancelled' : 'failedInstall', installDuration: watch.elapsed(), signUpErrorCode: undefined, provider });
			return false;
		}

		if (typeof signUpResult === 'boolean') {
			this.telemetryService.publicLog2<InstallChatEvent, InstallChatClassification>('commandCenter.chatInstall', { installResult: wasRunning && !signUpResult ? 'alreadyInstalled' : 'installed', installDuration: watch.elapsed(), signUpErrorCode: undefined, provider });
		}

		if (wasRunning && signUpResult === true) {
			refreshTokens(this.commandService);
		}

		return true;
	}

	private async doInstallWithRetry(installation: Promise<void>): Promise<void> {
		let error: Error | undefined;
		try {
			await installation;
		} catch (e) {
			this.logService.error(`[chat setup] install: error ${error}`);
			error = e;
		}

		if (error) {
			if (!this.lifecycleService.willShutdown) {
				const { confirmed } = await this.dialogService.confirm({
					type: Severity.Error,
					message: localize('unknownSetupError', "An error occurred while setting up Copilot. Would you like to try again?"),
					detail: error && !isCancellationError(error) ? toErrorMessage(error) : undefined,
					primaryButton: localize('retry', "Retry")
				});

				if (confirmed) {
					return this.doInstallWithRetry(this.doInstall());
				}
			}

			throw error;
		}
	}

	private async doInstall(): Promise<void> {
		await this.extensionsWorkbenchService.install(defaultChat.extensionId, {
			enable: true,
			isApplicationScoped: true, 	// install into all profiles
			isMachineScoped: false,		// do not ask to sync
			installEverywhere: true,	// install in local and remote
			installPreReleaseVersion: this.productService.quality !== 'stable'
		}, ChatViewId);
	}

	async setupWithProvider(options: { useEnterpriseProvider: boolean; useAlternateProvider: boolean }): Promise<ChatSetupResultValue> {
		const registry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
		registry.registerConfiguration({
			'id': 'copilot.setup',
			'type': 'object',
			'properties': {
				[defaultChat.completionsAdvancedSetting]: {
					'type': 'object',
					'properties': {
						'authProvider': {
							'type': 'string'
						}
					}
				},
				[defaultChat.providerUriSetting]: {
					'type': 'string'
				}
			}
		});

		if (options.useEnterpriseProvider) {
			const success = await this.handleEnterpriseInstance();
			if (!success) {
				return success; // not properly configured, abort
			}
		}

		let existingAdvancedSetting = this.configurationService.inspect(defaultChat.completionsAdvancedSetting).user?.value;
		if (!isObject(existingAdvancedSetting)) {
			existingAdvancedSetting = {};
		}

		if (options.useEnterpriseProvider) {
			await this.configurationService.updateValue(`${defaultChat.completionsAdvancedSetting}`, {
				...existingAdvancedSetting,
				'authProvider': defaultChat.enterpriseProviderId
			}, ConfigurationTarget.USER);
		} else {
			await this.configurationService.updateValue(`${defaultChat.completionsAdvancedSetting}`, Object.keys(existingAdvancedSetting).length > 0 ? {
				...existingAdvancedSetting,
				'authProvider': undefined
			} : undefined, ConfigurationTarget.USER);
		}

		return this.setup({ ...options, forceSignIn: true });
	}

	private async handleEnterpriseInstance(): Promise<ChatSetupResultValue> {
		const domainRegEx = /^[a-zA-Z\-_]+$/;
		const fullUriRegEx = /^(https:\/\/)?([a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+\.ghe\.com\/?$/;

		const uri = this.configurationService.getValue<string>(defaultChat.providerUriSetting);
		if (typeof uri === 'string' && fullUriRegEx.test(uri)) {
			return true; // already setup with a valid URI
		}

		let isSingleWord = false;
		const result = await this.quickInputService.input({
			prompt: localize('enterpriseInstance', "What is your {0} instance?", defaultChat.enterpriseProviderName),
			placeHolder: localize('enterpriseInstancePlaceholder', 'i.e. "octocat" or "https://octocat.ghe.com"...'),
			ignoreFocusLost: true,
			value: uri,
			validateInput: async value => {
				isSingleWord = false;
				if (!value) {
					return undefined;
				}

				if (domainRegEx.test(value)) {
					isSingleWord = true;
					return {
						content: localize('willResolveTo', "Will resolve to {0}", `https://${value}.ghe.com`),
						severity: Severity.Info
					};
				} if (!fullUriRegEx.test(value)) {
					return {
						content: localize('invalidEnterpriseInstance', 'You must enter a valid {0} instance (i.e. "octocat" or "https://octocat.ghe.com")', defaultChat.enterpriseProviderName),
						severity: Severity.Error
					};
				}

				return undefined;
			}
		});

		if (!result) {
			return undefined; // canceled
		}

		let resolvedUri = result;
		if (isSingleWord) {
			resolvedUri = `https://${resolvedUri}.ghe.com`;
		} else {
			const normalizedUri = result.toLowerCase();
			const hasHttps = normalizedUri.startsWith('https://');
			if (!hasHttps) {
				resolvedUri = `https://${result}`;
			}
		}

		await this.configurationService.updateValue(defaultChat.providerUriSetting, resolvedUri, ConfigurationTarget.USER);

		return true;
	}
}

//#endregion

function refreshTokens(commandService: ICommandService): void {
	// ugly, but we need to signal to the extension that entitlements changed
	commandService.executeCommand(defaultChat.completionsRefreshTokenCommand);
	commandService.executeCommand(defaultChat.chatRefreshTokenCommand);
}
