/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatSetup.css';
import { $ } from '../../../../base/browser/dom.js';
import { IButton } from '../../../../base/browser/ui/button/button.js';
import { Dialog, DialogContentsAlignment } from '../../../../base/browser/ui/dialog/dialog.js';
import { WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from '../../../../base/common/actions.js';
import { coalesce } from '../../../../base/common/arrays.js';
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
import { IMarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { createWorkbenchDialogOptions } from '../../../../platform/dialogs/browser/dialog.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
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
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { EnablementState, IWorkbenchExtensionEnablementService } from '../../../services/extensionManagement/common/extensionManagement.js';
import { ExtensionUrlHandlerOverrideRegistry } from '../../../services/extensions/browser/extensionUrlHandler.js';
import { IExtensionService, nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { CountTokensCallback, ILanguageModelToolsService, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolResult, ToolDataSource, ToolProgress } from '../../chat/common/languageModelToolsService.js';
import { IExtension, IExtensionsWorkbenchService } from '../../extensions/common/extensions.js';
import { IChatAgentImplementation, IChatAgentRequest, IChatAgentResult, IChatAgentService } from '../common/chatAgents.js';
import { ChatContextKeys } from '../common/chatContextKeys.js';
import { ChatEntitlement, ChatEntitlementContext, ChatEntitlementRequests, ChatEntitlementService, IChatEntitlementService, isProUser } from '../../../services/chat/common/chatEntitlementService.js';
import { ChatModel, ChatRequestModel, IChatRequestModel, IChatRequestVariableData } from '../common/chatModel.js';
import { ChatMode, IChatModeService } from '../common/chatModes.js';
import { ChatRequestAgentPart, ChatRequestToolPart } from '../common/chatParserTypes.js';
import { IChatProgress, IChatService } from '../common/chatService.js';
import { IChatRequestToolEntry } from '../common/chatVariableEntries.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../common/constants.js';
import { ILanguageModelsService } from '../common/languageModels.js';
import { CHAT_CATEGORY, CHAT_OPEN_ACTION_ID, CHAT_SETUP_ACTION_ID, CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID } from './actions/chatActions.js';
import { ChatViewId, IChatWidgetService, showChatView } from './chat.js';
import { CHAT_SIDEBAR_PANEL_ID } from './chatViewPane.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { chatViewsWelcomeRegistry } from './viewsWelcome/chatViewsWelcome.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { NewSymbolName, NewSymbolNameTriggerKind } from '../../../../editor/common/languages.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { IRange } from '../../../../editor/common/core/range.js';

const defaultChat = {
	extensionId: product.defaultChatAgent?.extensionId ?? '',
	chatExtensionId: product.defaultChatAgent?.chatExtensionId ?? '',
	documentationUrl: product.defaultChatAgent?.documentationUrl ?? '',
	skusDocumentationUrl: product.defaultChatAgent?.skusDocumentationUrl ?? '',
	publicCodeMatchesUrl: product.defaultChatAgent?.publicCodeMatchesUrl ?? '',
	manageOveragesUrl: product.defaultChatAgent?.manageOverageUrl ?? '',
	upgradePlanUrl: product.defaultChatAgent?.upgradePlanUrl ?? '',
	provider: product.defaultChatAgent?.provider ?? { default: { id: '', name: '' }, enterprise: { id: '', name: '' }, apple: { id: '', name: '' }, google: { id: '', name: '' } },
	providerUriSetting: product.defaultChatAgent?.providerUriSetting ?? '',
	providerScopes: product.defaultChatAgent?.providerScopes ?? [[]],
	manageSettingsUrl: product.defaultChatAgent?.manageSettingsUrl ?? '',
	completionsAdvancedSetting: product.defaultChatAgent?.completionsAdvancedSetting ?? '',
	walkthroughCommand: product.defaultChatAgent?.walkthroughCommand ?? '',
	completionsRefreshTokenCommand: product.defaultChatAgent?.completionsRefreshTokenCommand ?? '',
	chatRefreshTokenCommand: product.defaultChatAgent?.chatRefreshTokenCommand ?? '',
	termsStatementUrl: product.defaultChatAgent?.termsStatementUrl ?? '',
	privacyStatementUrl: product.defaultChatAgent?.privacyStatementUrl ?? ''
};

enum ChatSetupAnonymous {
	Disabled = 0,
	EnabledWithDialog = 1,
	EnabledWithoutDialog = 2
}

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
				case ChatAgentLocation.Chat:
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
				case ChatAgentLocation.EditorInline:
					id = 'setup.editor';
					break;
				case ChatAgentLocation.Notebook:
					id = 'setup.notebook';
					break;
			}

			return SetupAgent.doRegisterAgent(instantiationService, chatAgentService, id, `${defaultChat.provider.default.name} Copilot` /* Do NOT change, this hides the username altogether in Chat */, true, description, location, mode, context, controller);
		});
	}

	static registerBuiltInAgents(instantiationService: IInstantiationService, context: ChatEntitlementContext, controller: Lazy<ChatSetupController>): IDisposable {
		return instantiationService.invokeFunction(accessor => {
			const chatAgentService = accessor.get(IChatAgentService);

			const disposables = new DisposableStore();

			// Register VSCode agent
			const { disposable: vscodeDisposable } = SetupAgent.doRegisterAgent(instantiationService, chatAgentService, 'setup.vscode', 'vscode', false, localize2('vscodeAgentDescription', "Ask questions about VS Code").value, ChatAgentLocation.Chat, undefined, context, controller);
			disposables.add(vscodeDisposable);

			// Register workspace agent
			const { disposable: workspaceDisposable } = SetupAgent.doRegisterAgent(instantiationService, chatAgentService, 'setup.workspace', 'workspace', false, localize2('workspaceAgentDescription', "Ask about your workspace").value, ChatAgentLocation.Chat, undefined, context, controller);
			disposables.add(workspaceDisposable);

			// Register terminal agent
			const { disposable: terminalDisposable } = SetupAgent.doRegisterAgent(instantiationService, chatAgentService, 'setup.terminal.agent', 'terminal', false, localize2('terminalAgentDescription', "Ask how to do something in the terminal").value, ChatAgentLocation.Chat, undefined, context, controller);
			disposables.add(terminalDisposable);

			// Register tools
			disposables.add(SetupTool.registerTool(instantiationService, {
				id: 'setup_tools_createNewWorkspace',
				source: ToolDataSource.Internal,
				icon: Codicon.newFolder,
				displayName: localize('setupToolDisplayName', "New Workspace"),
				modelDescription: localize('setupToolsDescription', "Scaffold a new workspace in VS Code"),
				userDescription: localize('setupToolsDescription', "Scaffold a new workspace in VS Code"),
				canBeReferencedInPrompt: true,
				toolReferenceName: 'new',
				when: ContextKeyExpr.true(),
			}));

			return disposables;
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
			extensionVersion: undefined,
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

	private static readonly SETUP_NEEDED_MESSAGE = new MarkdownString(localize('settingUpCopilotNeeded', "You need to set up GitHub Copilot and be signed in to use Chat."));
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
		@IWorkspaceTrustManagementService private readonly workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
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
		if (
			!this.context.state.installed ||									// Extension not installed: run setup to install
			this.context.state.disabled ||										// Extension disabled: run setup to enable
			this.context.state.untrusted ||										// Workspace untrusted: run setup to ask for trust
			this.context.state.entitlement === ChatEntitlement.Available ||		// Entitlement available: run setup to sign up
			(
				this.context.state.entitlement === ChatEntitlement.Unknown &&	// Entitlement unknown: run setup to sign in / sign up
				!this.chatEntitlementService.anonymous							// unless anonymous access is enabled
			)
		) {
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
			content: new MarkdownString(localize('waitingChat', "Getting chat ready...")),
		});

		await this.forwardRequestToChat(requestModel, progress, chatService, languageModelsService, chatAgentService, chatWidgetService, languageModelToolsService);

		return {};
	}

	private async forwardRequestToChat(requestModel: IChatRequestModel, progress: (part: IChatProgress) => void, chatService: IChatService, languageModelsService: ILanguageModelsService, chatAgentService: IChatAgentService, chatWidgetService: IChatWidgetService, languageModelToolsService: ILanguageModelToolsService): Promise<void> {
		try {
			await this.doForwardRequestToChat(requestModel, progress, chatService, languageModelsService, chatAgentService, chatWidgetService, languageModelToolsService);
		} catch (error) {
			progress({
				kind: 'warning',
				content: new MarkdownString(localize('copilotUnavailableWarning', "Failed to get a response. Please try again."))
			});
		}
	}

	private async doForwardRequestToChat(requestModel: IChatRequestModel, progress: (part: IChatProgress) => void, chatService: IChatService, languageModelsService: ILanguageModelsService, chatAgentService: IChatAgentService, chatWidgetService: IChatWidgetService, languageModelToolsService: ILanguageModelToolsService): Promise<void> {
		if (this.pendingForwardedRequests.has(requestModel.session.sessionId)) {
			throw new Error('Request already in progress');
		}

		const forwardRequest = this.doForwardRequestToChatWhenReady(requestModel, progress, chatService, languageModelsService, chatAgentService, chatWidgetService, languageModelToolsService);
		this.pendingForwardedRequests.set(requestModel.session.sessionId, forwardRequest);

		try {
			await forwardRequest;
		} finally {
			this.pendingForwardedRequests.delete(requestModel.session.sessionId);
		}
	}

	private async doForwardRequestToChatWhenReady(requestModel: IChatRequestModel, progress: (part: IChatProgress) => void, chatService: IChatService, languageModelsService: ILanguageModelsService, chatAgentService: IChatAgentService, chatWidgetService: IChatWidgetService, languageModelToolsService: ILanguageModelToolsService): Promise<void> {
		const widget = chatWidgetService.getWidgetBySessionResource(requestModel.session.sessionResource);
		const modeInfo = widget?.input.currentModeInfo;

		// We need a signal to know when we can resend the request to
		// Chat. Waiting for the registration of the agent is not
		// enough, we also need a language/tools model to be available.

		let agentReady = false;
		let languageModelReady = false;
		let toolsModelReady = false;

		const whenAgentReady = this.whenAgentReady(chatAgentService, modeInfo?.kind)?.then(() => agentReady = true);
		const whenLanguageModelReady = this.whenLanguageModelReady(languageModelsService, requestModel.modelId)?.then(() => languageModelReady = true);
		const whenToolsModelReady = this.whenToolsModelReady(languageModelToolsService, requestModel)?.then(() => toolsModelReady = true);

		if (whenLanguageModelReady instanceof Promise || whenAgentReady instanceof Promise || whenToolsModelReady instanceof Promise) {
			const timeoutHandle = setTimeout(() => {
				progress({
					kind: 'progressMessage',
					content: new MarkdownString(localize('waitingChat2', "Chat is almost ready...")),
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
						if (this.chatEntitlementService.anonymous) {
							warningMessage = localize('chatTookLongWarningAnonymous', "Chat took too long to get ready. Please ensure that the extension `{0}` is installed and enabled.", defaultChat.chatExtensionId);
						} else {
							warningMessage = localize('chatTookLongWarning', "Chat took too long to get ready. Please ensure you are signed in to {0} and that the extension `{1}` is installed and enabled.", defaultChat.provider.default.name, defaultChat.chatExtensionId);
						}
					} else {
						if (this.chatEntitlementService.anonymous) {
							warningMessage = localize('chatFailedWarningAnonymous', "Chat failed to get ready. Please ensure that the extension `{0}` is installed and enabled.", defaultChat.chatExtensionId);
						} else {
							warningMessage = localize('chatFailedWarning', "Chat failed to get ready. Please ensure you are signed in to {0} and that the extension `{1}` is installed and enabled.", defaultChat.provider.default.name, defaultChat.chatExtensionId);
						}
					}

					this.logService.warn(warningMessage, {
						agentReady: whenAgentReady ? agentReady : undefined,
						languageModelReady: whenLanguageModelReady ? languageModelReady : undefined,
						toolsModelReady: whenToolsModelReady ? toolsModelReady : undefined
					});

					progress({
						kind: 'warning',
						content: new MarkdownString(warningMessage)
					});

					// This means Chat is unhealthy and we cannot retry the
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
			modeInfo,
			userSelectedModelId: widget?.input.currentLanguageModel
		});
	}

	private whenLanguageModelReady(languageModelsService: ILanguageModelsService, modelId: string | undefined): Promise<unknown> | void {
		const hasModelForRequest = () => {
			if (modelId) {
				return !!languageModelsService.lookupLanguageModel(modelId);
			}

			for (const id of languageModelsService.getLanguageModelIds()) {
				const model = languageModelsService.lookupLanguageModel(id);
				if (model?.isDefault) {
					return true;
				}
			}

			return false;
		};

		if (hasModelForRequest()) {
			return;
		}

		return Event.toPromise(Event.filter(languageModelsService.onDidChangeLanguageModels, () => hasModelForRequest()));
	}

	private whenToolsModelReady(languageModelToolsService: ILanguageModelToolsService, requestModel: IChatRequestModel): Promise<unknown> | void {
		const needsToolsModel = requestModel.message.parts.some(part => part instanceof ChatRequestToolPart);
		if (!needsToolsModel) {
			return; // No tools in this request, no need to check
		}

		// check that tools other than setup. and internal tools are registered.
		for (const tool of languageModelToolsService.getTools()) {
			if (tool.id.startsWith('copilot_')) {
				return; // we have tools!
			}
		}

		return Event.toPromise(Event.filter(languageModelToolsService.onDidChangeTools, () => {
			for (const tool of languageModelToolsService.getTools()) {
				if (tool.id.startsWith('copilot_')) {
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
						content: new MarkdownString(localize('setupChatSignIn2', "Signing in to {0}...", ChatEntitlementRequests.providerId(this.configurationService) === defaultChat.provider.enterprise.id ? defaultChat.provider.enterprise.name : defaultChat.provider.default.name)),
					});
					break;
				case ChatSetupStep.Installing:
					progress({
						kind: 'progressMessage',
						content: new MarkdownString(localize('installingChat', "Getting chat ready...")),
					});
					break;
			}
		}));

		let result: IChatSetupResult | undefined = undefined;
		try {
			result = await ChatSetup.getInstance(this.instantiationService, this.context, this.controller).run({
				disableChatViewReveal: true, 																				// we are already in a chat context
				forceAnonymous: this.chatEntitlementService.anonymous ? ChatSetupAnonymous.EnabledWithoutDialog : undefined	// only enable anonymous selectively
			});
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
					let newRequest = this.replaceAgentInRequestModel(requestModel, chatAgentService); 	// Replace agent part with the actual Chat agent...
					newRequest = this.replaceToolInRequestModel(newRequest); 							// ...then replace any tool parts with the actual Chat tools

					await this.forwardRequestToChat(newRequest, progress, chatService, languageModelsService, chatAgentService, chatWidgetService, languageModelToolsService);
				}
			} else {
				progress({
					kind: 'warning',
					content: new MarkdownString(localize('chatSetupError', "Chat setup failed."))
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
			modeInfo: requestModel.modeInfo,
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
			modeInfo: requestModel.modeInfo,
			confirmation: requestModel.confirmation,
			locationData: requestModel.locationData,
			attachedContext: [chatRequestToolEntry],
			isCompleteAddedRequest: requestModel.isCompleteAddedRequest,
		});
	}
}


class SetupTool implements IToolImpl {

	static registerTool(instantiationService: IInstantiationService, toolData: IToolData): IDisposable {
		return instantiationService.invokeFunction(accessor => {
			const toolService = accessor.get(ILanguageModelToolsService);

			const disposables = new DisposableStore();

			const tool = instantiationService.createInstance(SetupTool);
			disposables.add(toolService.registerTool(toolData, tool));

			return disposables;
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

	async prepareToolInvocation?(parameters: unknown, token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		return undefined;
	}
}

class DefaultNewSymbolNamesProvider {

	static registerProvider(instantiationService: IInstantiationService, context: ChatEntitlementContext, controller: Lazy<ChatSetupController>): IDisposable {
		return instantiationService.invokeFunction(accessor => {
			const languageFeaturesService = accessor.get(ILanguageFeaturesService);

			const disposables = new DisposableStore();

			const provider = instantiationService.createInstance(DefaultNewSymbolNamesProvider, context, controller);
			disposables.add(languageFeaturesService.newSymbolNamesProvider.register('*', provider));

			return disposables;
		});
	}

	constructor(
		private readonly context: ChatEntitlementContext,
		private readonly controller: Lazy<ChatSetupController>,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
	) {
	}

	async provideNewSymbolNames(model: ITextModel, range: IRange, triggerKind: NewSymbolNameTriggerKind, token: CancellationToken): Promise<NewSymbolName[] | undefined> {
		await this.instantiationService.invokeFunction(accessor => {
			return ChatSetup.getInstance(this.instantiationService, this.context, this.controller).run({
				forceAnonymous: this.chatEntitlementService.anonymous ? ChatSetupAnonymous.EnabledWithDialog : undefined
			});
		});

		return [];
	}
}

enum ChatSetupStrategy {
	Canceled = 0,
	DefaultSetup = 1,
	SetupWithoutEnterpriseProvider = 2,
	SetupWithEnterpriseProvider = 3,
	SetupWithGoogleProvider = 4,
	SetupWithAppleProvider = 5
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
				return new ChatSetup(context, controller, accessor.get(ITelemetryService), accessor.get(IWorkbenchLayoutService), accessor.get(IKeybindingService), accessor.get(IChatEntitlementService) as ChatEntitlementService, accessor.get(ILogService), accessor.get(IConfigurationService), accessor.get(IViewsService), accessor.get(IWorkspaceTrustRequestService), accessor.get(IMarkdownRendererService));
			});
		}

		return instance;
	}

	private pendingRun: Promise<IChatSetupResult> | undefined = undefined;

	private skipDialogOnce = false;

	private constructor(
		private readonly context: ChatEntitlementContext,
		private readonly controller: Lazy<ChatSetupController>,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ILayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IChatEntitlementService private readonly chatEntitlementService: ChatEntitlementService,
		@ILogService private readonly logService: ILogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IViewsService private readonly viewsService: IViewsService,
		@IWorkspaceTrustRequestService private readonly workspaceTrustRequestService: IWorkspaceTrustRequestService,
		@IMarkdownRendererService private readonly markdownRendererService: IMarkdownRendererService,
	) { }

	skipDialog(): void {
		this.skipDialogOnce = true;
	}

	async run(options?: { disableChatViewReveal?: boolean; forceSignInDialog?: boolean; additionalScopes?: readonly string[]; forceAnonymous?: ChatSetupAnonymous }): Promise<IChatSetupResult> {
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

	private async doRun(options?: { disableChatViewReveal?: boolean; forceSignInDialog?: boolean; additionalScopes?: readonly string[]; forceAnonymous?: ChatSetupAnonymous }): Promise<IChatSetupResult> {
		this.context.update({ later: false });

		const dialogSkipped = this.skipDialogOnce;
		this.skipDialogOnce = false;

		const trusted = await this.workspaceTrustRequestService.requestWorkspaceTrust({
			message: localize('chatWorkspaceTrust', "AI features are currently only supported in trusted workspaces.")
		});
		if (!trusted) {
			this.context.update({ later: true });
			this.telemetryService.publicLog2<InstallChatEvent, InstallChatClassification>('commandCenter.chatInstall', { installResult: 'failedNotTrusted', installDuration: 0, signUpErrorCode: undefined, provider: undefined });

			return { dialogSkipped, success: undefined /* canceled */ };
		}

		let setupStrategy: ChatSetupStrategy;
		if (!options?.forceSignInDialog && (dialogSkipped || isProUser(this.chatEntitlementService.entitlement) || this.chatEntitlementService.entitlement === ChatEntitlement.Free)) {
			setupStrategy = ChatSetupStrategy.DefaultSetup; // existing pro/free users setup without a dialog
		} else if (options?.forceAnonymous === ChatSetupAnonymous.EnabledWithoutDialog) {
			setupStrategy = ChatSetupStrategy.DefaultSetup; // anonymous setup without a dialog
		} else {
			setupStrategy = await this.showDialog(options);
		}

		if (setupStrategy === ChatSetupStrategy.DefaultSetup && ChatEntitlementRequests.providerId(this.configurationService) === defaultChat.provider.enterprise.id) {
			setupStrategy = ChatSetupStrategy.SetupWithEnterpriseProvider; // users with a configured provider go through provider setup
		}

		if (setupStrategy !== ChatSetupStrategy.Canceled && !options?.disableChatViewReveal) {
			// Show the chat view now to better indicate progress
			// while installing the extension or returning from sign in
			showChatView(this.viewsService, this.layoutService);
		}

		let success: ChatSetupResultValue = undefined;
		try {
			switch (setupStrategy) {
				case ChatSetupStrategy.SetupWithEnterpriseProvider:
					success = await this.controller.value.setupWithProvider({ useEnterpriseProvider: true, useSocialProvider: undefined, additionalScopes: options?.additionalScopes, forceAnonymous: options?.forceAnonymous });
					break;
				case ChatSetupStrategy.SetupWithoutEnterpriseProvider:
					success = await this.controller.value.setupWithProvider({ useEnterpriseProvider: false, useSocialProvider: undefined, additionalScopes: options?.additionalScopes, forceAnonymous: options?.forceAnonymous });
					break;
				case ChatSetupStrategy.SetupWithAppleProvider:
					success = await this.controller.value.setupWithProvider({ useEnterpriseProvider: false, useSocialProvider: 'apple', additionalScopes: options?.additionalScopes, forceAnonymous: options?.forceAnonymous });
					break;
				case ChatSetupStrategy.SetupWithGoogleProvider:
					success = await this.controller.value.setupWithProvider({ useEnterpriseProvider: false, useSocialProvider: 'google', additionalScopes: options?.additionalScopes, forceAnonymous: options?.forceAnonymous });
					break;
				case ChatSetupStrategy.DefaultSetup:
					success = await this.controller.value.setup({ ...options, forceAnonymous: options?.forceAnonymous });
					break;
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

	private async showDialog(options?: { forceSignInDialog?: boolean; forceAnonymous?: ChatSetupAnonymous }): Promise<ChatSetupStrategy> {
		const disposables = new DisposableStore();

		const dialogVariant = this.configurationService.getValue<'default' | 'apple' | unknown>('chat.setup.signInDialogVariant');
		const buttons = this.getButtons(dialogVariant, options);

		const dialog = disposables.add(new Dialog(
			this.layoutService.activeContainer,
			this.getDialogTitle(options),
			buttons.map(button => button[0]),
			createWorkbenchDialogOptions({
				type: 'none',
				extraClasses: ['chat-setup-dialog'],
				detail: ' ', // workaround allowing us to render the message in large
				icon: Codicon.copilotLarge,
				alignment: DialogContentsAlignment.Vertical,
				cancelId: buttons.length - 1,
				disableCloseButton: true,
				renderFooter: footer => footer.appendChild(this.createDialogFooter(disposables, options)),
				buttonOptions: buttons.map(button => button[2])
			}, this.keybindingService, this.layoutService)
		));

		const { button } = await dialog.show();
		disposables.dispose();

		return buttons[button]?.[1] ?? ChatSetupStrategy.Canceled;
	}

	private getButtons(variant: 'default' | 'apple' | unknown, options?: { forceSignInDialog?: boolean; forceAnonymous?: ChatSetupAnonymous }): Array<[string, ChatSetupStrategy, { styleButton?: (button: IButton) => void } | undefined]> {
		type ContinueWithButton = [string, ChatSetupStrategy, { styleButton?: (button: IButton) => void } | undefined];
		const styleButton = (...classes: string[]) => ({ styleButton: (button: IButton) => button.element.classList.add(...classes) });

		let buttons: Array<ContinueWithButton>;
		if (!options?.forceAnonymous && (this.context.state.entitlement === ChatEntitlement.Unknown || options?.forceSignInDialog)) {
			const defaultProviderButton: ContinueWithButton = [localize('continueWith', "Continue with {0}", defaultChat.provider.default.name), ChatSetupStrategy.SetupWithoutEnterpriseProvider, styleButton('continue-button', 'default')];
			const defaultProviderLink: ContinueWithButton = [defaultProviderButton[0], defaultProviderButton[1], styleButton('link-button')];

			const enterpriseProviderButton: ContinueWithButton = [localize('continueWith', "Continue with {0}", defaultChat.provider.enterprise.name), ChatSetupStrategy.SetupWithEnterpriseProvider, styleButton('continue-button', 'default')];
			const enterpriseProviderLink: ContinueWithButton = [enterpriseProviderButton[0], enterpriseProviderButton[1], styleButton('link-button')];

			const googleProviderButton: ContinueWithButton = [localize('continueWith', "Continue with {0}", defaultChat.provider.google.name), ChatSetupStrategy.SetupWithGoogleProvider, styleButton('continue-button', 'google')];
			const appleProviderButton: ContinueWithButton = [localize('continueWith', "Continue with {0}", defaultChat.provider.apple.name), ChatSetupStrategy.SetupWithAppleProvider, styleButton('continue-button', 'apple')];

			if (ChatEntitlementRequests.providerId(this.configurationService) !== defaultChat.provider.enterprise.id) {
				buttons = coalesce([
					defaultProviderButton,
					googleProviderButton,
					variant === 'apple' ? appleProviderButton : undefined,
					enterpriseProviderLink
				]);
			} else {
				buttons = coalesce([
					enterpriseProviderButton,
					googleProviderButton,
					variant === 'apple' ? appleProviderButton : undefined,
					defaultProviderLink
				]);
			}
		} else {
			buttons = [[localize('setupAIButton', "Use AI Features"), ChatSetupStrategy.DefaultSetup, undefined]];
		}

		buttons.push([localize('skipForNow', "Skip for now"), ChatSetupStrategy.Canceled, styleButton('link-button', 'skip-button')]);

		return buttons;
	}

	private getDialogTitle(options?: { forceSignInDialog?: boolean; forceAnonymous?: ChatSetupAnonymous }): string {
		if (this.chatEntitlementService.anonymous) {
			if (options?.forceAnonymous) {
				return localize('startUsing', "Start using AI Features");
			} else {
				return localize('enableMore', "Enable more AI features");
			}
		}

		if (this.context.state.entitlement === ChatEntitlement.Unknown || options?.forceSignInDialog) {
			return localize('signIn', "Sign in to use AI Features");
		}

		return localize('startUsing', "Start using AI Features");
	}

	private createDialogFooter(disposables: DisposableStore, options?: { forceAnonymous?: ChatSetupAnonymous }): HTMLElement {
		const element = $('.chat-setup-dialog-footer');


		let footer: string;
		if (options?.forceAnonymous || this.telemetryService.telemetryLevel === TelemetryLevel.NONE) {
			footer = localize({ key: 'settingsAnonymous', comment: ['{Locked="["}', '{Locked="]({1})"}', '{Locked="]({2})"}'] }, "By continuing, you agree to {0}'s [Terms]({1}) and [Privacy Statement]({2}).", defaultChat.provider.default.name, defaultChat.termsStatementUrl, defaultChat.privacyStatementUrl);
		} else {
			footer = localize({ key: 'settings', comment: ['{Locked="["}', '{Locked="]({1})"}', '{Locked="]({2})"}', '{Locked="]({4})"}', '{Locked="]({5})"}'] }, "By continuing, you agree to {0}'s [Terms]({1}) and [Privacy Statement]({2}). {3} Copilot may show [public code]({4}) suggestions and use your data to improve the product. You can change these [settings]({5}) anytime.", defaultChat.provider.default.name, defaultChat.termsStatementUrl, defaultChat.privacyStatementUrl, defaultChat.provider.default.name, defaultChat.publicCodeMatchesUrl, defaultChat.manageSettingsUrl);
		}
		element.appendChild($('p', undefined, disposables.add(this.markdownRendererService.render(new MarkdownString(footer, { isTrusted: true }))).element));

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
		@IChatModeService private readonly chatModeService: IChatModeService,
		@ILogService private readonly logService: ILogService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
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
		this.checkExtensionInstallation(context);
	}

	private registerSetupAgents(context: ChatEntitlementContext, controller: Lazy<ChatSetupController>): void {
		if (this.configurationService.getValue<boolean>('chat.experimental.disableCoreAgents')) {
			return; // TODO@bpasero eventually remove this when we figured out extension activation issues
		}

		const defaultAgentDisposables = markAsSingleton(new MutableDisposable()); // prevents flicker on window reload
		const vscodeAgentDisposables = markAsSingleton(new MutableDisposable());

		const renameProviderDisposables = markAsSingleton(new MutableDisposable());

		const updateRegistration = () => {

			// Agent + Tools
			{
				if (!context.state.hidden && !context.state.disabled) {

					// Default Agents (always, even if installed to allow for speedy requests right on startup)
					if (!defaultAgentDisposables.value) {
						const disposables = defaultAgentDisposables.value = new DisposableStore();

						// Panel Agents
						const panelAgentDisposables = disposables.add(new DisposableStore());
						for (const mode of [ChatModeKind.Ask, ChatModeKind.Edit, ChatModeKind.Agent]) {
							const { agent, disposable } = SetupAgent.registerDefaultAgents(this.instantiationService, ChatAgentLocation.Chat, mode, context, controller);
							panelAgentDisposables.add(disposable);
							panelAgentDisposables.add(agent.onUnresolvableError(() => {
								const panelAgentHasGuidance = chatViewsWelcomeRegistry.get().some(descriptor => this.contextKeyService.contextMatchesRules(descriptor.when));
								if (panelAgentHasGuidance) {
									// An unresolvable error from our agent registrations means that
									// Chat is unhealthy for some reason. We clear our panel
									// registration to give Chat a chance to show a custom message
									// to the user from the views and stop pretending as if there was
									// a functional agent.
									this.logService.error('[chat setup] Unresolvable error from Chat agent registration, clearing registration.');
									panelAgentDisposables.dispose();
								}
							}));
						}

						// Inline Agents
						disposables.add(SetupAgent.registerDefaultAgents(this.instantiationService, ChatAgentLocation.Terminal, undefined, context, controller).disposable);
						disposables.add(SetupAgent.registerDefaultAgents(this.instantiationService, ChatAgentLocation.Notebook, undefined, context, controller).disposable);
						disposables.add(SetupAgent.registerDefaultAgents(this.instantiationService, ChatAgentLocation.EditorInline, undefined, context, controller).disposable);
					}

					// Built-In Agent + Tool (unless installed, signed-in and enabled)
					if ((!context.state.installed || context.state.entitlement === ChatEntitlement.Unknown || context.state.entitlement === ChatEntitlement.Unresolved) && !vscodeAgentDisposables.value) {
						const disposables = vscodeAgentDisposables.value = new DisposableStore();
						disposables.add(SetupAgent.registerBuiltInAgents(this.instantiationService, context, controller));
					}
				} else {
					defaultAgentDisposables.clear();
					vscodeAgentDisposables.clear();
				}

				if (context.state.installed && !context.state.disabled) {
					vscodeAgentDisposables.clear(); // we need to do this to prevent showing duplicate agent/tool entries in the list
				}
			}

			// Rename Provider
			{
				if (!context.state.installed && !context.state.hidden && !context.state.disabled) {
					if (!renameProviderDisposables.value) {
						renameProviderDisposables.value = DefaultNewSymbolNamesProvider.registerProvider(this.instantiationService, context, controller);
					}
				} else {
					renameProviderDisposables.clear();
				}
			}
		};

		this._register(Event.runAndSubscribe(context.onDidChange, () => updateRegistration()));
	}

	private registerActions(context: ChatEntitlementContext, requests: ChatEntitlementRequests, controller: Lazy<ChatSetupController>): void {

		class ChatSetupTriggerAction extends Action2 {

			static CHAT_SETUP_ACTION_LABEL = localize2('triggerChatSetup', "Use AI Features with Copilot for free...");

			constructor() {
				super({
					id: CHAT_SETUP_ACTION_ID,
					title: ChatSetupTriggerAction.CHAT_SETUP_ACTION_LABEL,
					category: CHAT_CATEGORY,
					f1: true,
					precondition: ContextKeyExpr.or(
						ChatContextKeys.Setup.hidden,
						ChatContextKeys.Setup.disabled,
						ChatContextKeys.Setup.untrusted,
						ChatContextKeys.Setup.installed.negate(),
						ChatContextKeys.Entitlement.canSignUp
					)
				});
			}

			override async run(accessor: ServicesAccessor, mode?: ChatModeKind | string, options?: { forceSignInDialog?: boolean; additionalScopes?: readonly string[]; forceAnonymous?: ChatSetupAnonymous }): Promise<boolean> {
				const viewsService = accessor.get(IViewsService);
				const layoutService = accessor.get(IWorkbenchLayoutService);
				const instantiationService = accessor.get(IInstantiationService);
				const dialogService = accessor.get(IDialogService);
				const commandService = accessor.get(ICommandService);
				const lifecycleService = accessor.get(ILifecycleService);
				const configurationService = accessor.get(IConfigurationService);

				await context.update({ hidden: false });
				configurationService.updateValue(ChatTeardownContribution.CHAT_DISABLED_CONFIGURATION_KEY, false);

				if (mode) {
					const chatWidget = await showChatView(viewsService, layoutService);
					chatWidget?.input.setChatMode(mode);
				}

				const setup = ChatSetup.getInstance(instantiationService, context, controller);
				const { success } = await setup.run(options);
				if (success === false && !lifecycleService.willShutdown) {
					const { confirmed } = await dialogService.confirm({
						type: Severity.Error,
						message: localize('setupErrorDialog', "Chat setup failed. Would you like to try again?"),
						primaryButton: localize('retry', "Retry"),
					});

					if (confirmed) {
						return Boolean(await commandService.executeCommand(CHAT_SETUP_ACTION_ID, mode, options));
					}
				}

				return Boolean(success);
			}
		}

		class ChatSetupTriggerSupportAnonymousAction extends Action2 {

			constructor() {
				super({
					id: CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID,
					title: ChatSetupTriggerAction.CHAT_SETUP_ACTION_LABEL
				});
			}

			override async run(accessor: ServicesAccessor): Promise<unknown> {
				const commandService = accessor.get(ICommandService);
				const telemetryService = accessor.get(ITelemetryService);
				const chatEntitlementService = accessor.get(IChatEntitlementService);

				telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: CHAT_SETUP_ACTION_ID, from: 'api' });

				return commandService.executeCommand(CHAT_SETUP_ACTION_ID, undefined, {
					forceAnonymous: chatEntitlementService.anonymous ? ChatSetupAnonymous.EnabledWithDialog : undefined
				});
			}
		}

		class ChatSetupTriggerForceSignInDialogAction extends Action2 {

			constructor() {
				super({
					id: 'workbench.action.chat.triggerSetupForceSignIn',
					title: localize2('forceSignIn', "Sign in to use AI features")
				});
			}

			override async run(accessor: ServicesAccessor): Promise<unknown> {
				const commandService = accessor.get(ICommandService);
				const telemetryService = accessor.get(ITelemetryService);

				telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: CHAT_SETUP_ACTION_ID, from: 'api' });

				return commandService.executeCommand(CHAT_SETUP_ACTION_ID, undefined, { forceSignInDialog: true });
			}
		}

		class ChatSetupTriggerAnonymousWithoutDialogAction extends Action2 {

			constructor() {
				super({
					id: 'workbench.action.chat.triggerSetupAnonymousWithoutDialog',
					title: ChatSetupTriggerAction.CHAT_SETUP_ACTION_LABEL
				});
			}

			override async run(accessor: ServicesAccessor): Promise<unknown> {
				const commandService = accessor.get(ICommandService);
				const telemetryService = accessor.get(ITelemetryService);

				telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: CHAT_SETUP_ACTION_ID, from: 'api' });

				return commandService.executeCommand(CHAT_SETUP_ACTION_ID, undefined, { forceAnonymous: ChatSetupAnonymous.EnabledWithoutDialog });
			}
		}

		class ChatSetupFromAccountsAction extends Action2 {

			constructor() {
				super({
					id: 'workbench.action.chat.triggerSetupFromAccounts',
					title: localize2('triggerChatSetupFromAccounts', "Sign in to use AI features..."),
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

		const windowFocusListener = this._register(new MutableDisposable());
		class UpgradePlanAction extends Action2 {
			constructor() {
				super({
					id: 'workbench.action.chat.upgradePlan',
					title: localize2('managePlan', "Upgrade to GitHub Copilot Pro"),
					category: localize2('chat.category', 'Chat'),
					f1: true,
					precondition: ContextKeyExpr.and(
						ChatContextKeys.Setup.hidden.negate(),
						ContextKeyExpr.or(
							ChatContextKeys.Entitlement.canSignUp,
							ChatContextKeys.Entitlement.planFree
						)
					),
					menu: {
						id: MenuId.ChatTitleBarMenu,
						group: 'a_first',
						order: 1,
						when: ContextKeyExpr.and(
							ChatContextKeys.Entitlement.planFree,
							ContextKeyExpr.or(
								ChatContextKeys.chatQuotaExceeded,
								ChatContextKeys.completionsQuotaExceeded
							)
						)
					}
				});
			}

			override async run(accessor: ServicesAccessor): Promise<void> {
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
					title: localize2('manageOverages', "Manage GitHub Copilot Overages"),
					category: localize2('chat.category', 'Chat'),
					f1: true,
					precondition: ContextKeyExpr.and(
						ChatContextKeys.Setup.hidden.negate(),
						ContextKeyExpr.or(
							ChatContextKeys.Entitlement.planPro,
							ChatContextKeys.Entitlement.planProPlus,
						)
					),
					menu: {
						id: MenuId.ChatTitleBarMenu,
						group: 'a_first',
						order: 1,
						when: ContextKeyExpr.and(
							ContextKeyExpr.or(
								ChatContextKeys.Entitlement.planPro,
								ChatContextKeys.Entitlement.planProPlus,
							),
							ContextKeyExpr.or(
								ChatContextKeys.chatQuotaExceeded,
								ChatContextKeys.completionsQuotaExceeded
							)
						)
					}
				});
			}

			override async run(accessor: ServicesAccessor): Promise<void> {
				const openerService = accessor.get(IOpenerService);
				openerService.open(URI.parse(defaultChat.manageOveragesUrl));
			}
		}

		registerAction2(ChatSetupTriggerAction);
		registerAction2(ChatSetupTriggerForceSignInDialogAction);
		registerAction2(ChatSetupFromAccountsAction);
		registerAction2(ChatSetupTriggerAnonymousWithoutDialogAction);
		registerAction2(ChatSetupTriggerSupportAnonymousAction);
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

				const agentParam = params.get('agent') ?? params.get('mode');
				if (agentParam) {
					const agents = this.chatModeService.getModes();
					const allAgents = [...agents.builtin, ...agents.custom];

					// check if the given param is a valid mode ID
					let foundAgent = allAgents.find(agent => agent.id === agentParam);
					if (!foundAgent) {
						// if not, check if the given param is a valid mode name, note the parameter as name is case insensitive
						const nameLower = agentParam.toLowerCase();
						foundAgent = allAgents.find(agent => agent.name.toLowerCase() === nameLower);
					}
					// execute the command to change the mode in panel, note that the command only supports mode IDs, not names
					await this.commandService.executeCommand(CHAT_SETUP_ACTION_ID, foundAgent?.id);
					return true;
				}

				return false;
			}
		}));
	}

	private async checkExtensionInstallation(context: ChatEntitlementContext): Promise<void> {

		// When developing extensions, await registration and then check
		if (this.environmentService.isExtensionDevelopment) {
			await this.extensionService.whenInstalledExtensionsRegistered();
			if (this.extensionService.extensions.find(ext => ExtensionIdentifier.equals(ext.identifier, defaultChat.chatExtensionId))) {
				context.update({ installed: true, disabled: false, untrusted: false });
				return;
			}
		}

		// Await extensions to be ready to be queried
		await this.extensionsWorkbenchService.queryLocal();

		// Listen to extensions change and process extensions once
		this._register(Event.runAndSubscribe<IExtension | undefined>(this.extensionsWorkbenchService.onChange, e => {
			if (e && !ExtensionIdentifier.equals(e.identifier.id, defaultChat.chatExtensionId)) {
				return; // unrelated event
			}

			const defaultChatExtension = this.extensionsWorkbenchService.local.find(value => ExtensionIdentifier.equals(value.identifier.id, defaultChat.chatExtensionId));
			const installed = !!defaultChatExtension?.local;

			let disabled: boolean;
			let untrusted = false;
			if (installed) {
				disabled = !this.extensionEnablementService.isEnabled(defaultChatExtension.local);
				if (disabled) {
					const state = this.extensionEnablementService.getEnablementState(defaultChatExtension.local);
					if (state === EnablementState.DisabledByTrustRequirement) {
						disabled = false; // not disabled by user choice but
						untrusted = true; // by missing workspace trust
					}
				}
			} else {
				disabled = false;
			}

			context.update({ installed, disabled, untrusted });
		}));
	}
}

export class ChatTeardownContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatTeardown';

	static readonly CHAT_DISABLED_CONFIGURATION_KEY = 'chat.disableAIFeatures';

	constructor(
		@IChatEntitlementService chatEntitlementService: ChatEntitlementService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService,
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService
	) {
		super();

		const context = chatEntitlementService.context?.value;
		if (!context) {
			return; // disabled
		}

		this.registerListeners();
		this.registerActions();

		this.handleChatDisabled(false);
	}

	private handleChatDisabled(fromEvent: boolean): void {
		const chatDisabled = this.configurationService.inspect(ChatTeardownContribution.CHAT_DISABLED_CONFIGURATION_KEY);
		if (chatDisabled.value === true) {
			this.maybeEnableOrDisableExtension(typeof chatDisabled.workspaceValue === 'boolean' ? EnablementState.DisabledWorkspace : EnablementState.DisabledGlobally);
			if (fromEvent) {
				this.maybeHideAuxiliaryBar();
			}
		} else if (chatDisabled.value === false && fromEvent /* do not enable extensions unless its an explicit settings change */) {
			this.maybeEnableOrDisableExtension(typeof chatDisabled.workspaceValue === 'boolean' ? EnablementState.EnabledWorkspace : EnablementState.EnabledGlobally);
		}
	}

	private async registerListeners(): Promise<void> {

		// Configuration changes
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (!e.affectsConfiguration(ChatTeardownContribution.CHAT_DISABLED_CONFIGURATION_KEY)) {
				return;
			}

			this.handleChatDisabled(true);
		}));

		// Extension installation
		await this.extensionsWorkbenchService.queryLocal();
		this._register(this.extensionsWorkbenchService.onChange(e => {
			if (e && !ExtensionIdentifier.equals(e.identifier.id, defaultChat.chatExtensionId)) {
				return; // unrelated event
			}

			const defaultChatExtension = this.extensionsWorkbenchService.local.find(value => ExtensionIdentifier.equals(value.identifier.id, defaultChat.chatExtensionId));
			if (defaultChatExtension?.local && this.extensionEnablementService.isEnabled(defaultChatExtension.local)) {
				this.configurationService.updateValue(ChatTeardownContribution.CHAT_DISABLED_CONFIGURATION_KEY, false);
			}
		}));
	}

	private async maybeEnableOrDisableExtension(state: EnablementState.EnabledGlobally | EnablementState.EnabledWorkspace | EnablementState.DisabledGlobally | EnablementState.DisabledWorkspace): Promise<void> {
		const defaultChatExtension = this.extensionsWorkbenchService.local.find(value => ExtensionIdentifier.equals(value.identifier.id, defaultChat.chatExtensionId));
		if (!defaultChatExtension) {
			return;
		}

		await this.extensionsWorkbenchService.setEnablement([defaultChatExtension], state);
		await this.extensionsWorkbenchService.updateRunningExtensions(state === EnablementState.EnabledGlobally || state === EnablementState.EnabledWorkspace ? localize('restartExtensionHost.reason.enable', "Enabling AI features") : localize('restartExtensionHost.reason.disable', "Disabling AI features"));
	}

	private maybeHideAuxiliaryBar(): void {
		const activeContainers = this.viewDescriptorService.getViewContainersByLocation(ViewContainerLocation.AuxiliaryBar).filter(
			container => this.viewDescriptorService.getViewContainerModel(container).activeViewDescriptors.length > 0
		);
		if (
			(activeContainers.length === 0) ||  													// chat view is already gone but we know it was there before
			(activeContainers.length === 1 && activeContainers.at(0)?.id === CHAT_SIDEBAR_PANEL_ID) // chat view is the only view which is going to go away
		) {
			this.layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART); // hide if there are no views in the secondary sidebar
		}
	}

	private registerActions(): void {

		class ChatSetupHideAction extends Action2 {

			static readonly ID = 'workbench.action.chat.hideSetup';
			static readonly TITLE = localize2('hideChatSetup', "Learn How to Hide AI Features");

			constructor() {
				super({
					id: ChatSetupHideAction.ID,
					title: ChatSetupHideAction.TITLE,
					f1: true,
					category: CHAT_CATEGORY,
					precondition: ChatContextKeys.Setup.hidden.negate(),
					menu: {
						id: MenuId.ChatTitleBarMenu,
						group: 'z_hide',
						order: 1,
						when: ChatContextKeys.Setup.installed.negate()
					}
				});
			}

			override async run(accessor: ServicesAccessor): Promise<void> {
				const preferencesService = accessor.get(IPreferencesService);

				preferencesService.openSettings({ jsonEditor: false, query: `@id:${ChatTeardownContribution.CHAT_DISABLED_CONFIGURATION_KEY}` });
			}
		}

		registerAction2(ChatSetupHideAction);
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
	installResult: 'installed' | 'alreadyInstalled' | 'cancelled' | 'failedInstall' | 'failedNotSignedIn' | 'failedSignUp' | 'failedNotTrusted' | 'failedNoSession' | 'failedMaybeLater' | 'failedEnterpriseSetup';
	installDuration: number;
	signUpErrorCode: number | undefined;
	provider: string | undefined;
};

enum ChatSetupStep {
	Initial = 1,
	SigningIn,
	Installing
}

interface IChatSetupControllerOptions {
	readonly forceSignIn?: boolean;
	readonly useSocialProvider?: string;
	readonly useEnterpriseProvider?: boolean;
	readonly additionalScopes?: readonly string[];
	readonly forceAnonymous?: ChatSetupAnonymous;
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

	async setup(options: IChatSetupControllerOptions = {}): Promise<ChatSetupResultValue> {
		const watch = new StopWatch(false);
		const title = localize('setupChatProgress', "Getting chat ready...");
		const badge = this.activityService.showViewContainerActivity(CHAT_SIDEBAR_PANEL_ID, {
			badge: new ProgressBadge(() => title),
		});

		try {
			return await this.progressService.withProgress({
				location: ProgressLocation.Window,
				command: CHAT_OPEN_ACTION_ID,
				title,
			}, () => this.doSetup(options, watch));
		} finally {
			badge.dispose();
		}
	}

	private async doSetup(options: IChatSetupControllerOptions, watch: StopWatch): Promise<ChatSetupResultValue> {
		this.context.suspend();  // reduces flicker

		let success: ChatSetupResultValue = false;
		try {
			const providerId = ChatEntitlementRequests.providerId(this.configurationService);
			let session: AuthenticationSession | undefined;
			let entitlement: ChatEntitlement | undefined;

			let signIn: boolean;
			if (options.forceSignIn) {
				signIn = true; // forced to sign in
			} else if (this.context.state.entitlement === ChatEntitlement.Unknown) {
				if (options.forceAnonymous) {
					signIn = false; // forced to anonymous without sign in
				} else {
					signIn = true; // sign in since we are signed out
				}
			} else {
				signIn = false; // already signed in
			}

			if (signIn) {
				this.setStep(ChatSetupStep.SigningIn);
				const result = await this.signIn(options);
				if (!result.session) {
					this.doInstall(); // still install the extension in the background to remind the user to sign-in eventually

					const provider = options.useSocialProvider ?? (options.useEnterpriseProvider ? defaultChat.provider.enterprise.id : defaultChat.provider.default.id);
					this.telemetryService.publicLog2<InstallChatEvent, InstallChatClassification>('commandCenter.chatInstall', { installResult: 'failedNotSignedIn', installDuration: watch.elapsed(), signUpErrorCode: undefined, provider });
					return undefined; // treat as cancelled because signing in already triggers an error dialog
				}

				session = result.session;
				entitlement = result.entitlement;
			}

			// Await Install
			this.setStep(ChatSetupStep.Installing);
			success = await this.install(session, entitlement ?? this.context.state.entitlement, providerId, watch, options);
		} finally {
			this.setStep(ChatSetupStep.Initial);
			this.context.resume();
		}

		return success;
	}

	private async signIn(options: IChatSetupControllerOptions): Promise<{ session: AuthenticationSession | undefined; entitlement: ChatEntitlement | undefined }> {
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
				message: localize('unknownSignInError', "Failed to sign in to {0}. Would you like to try again?", ChatEntitlementRequests.providerId(this.configurationService) === defaultChat.provider.enterprise.id ? defaultChat.provider.enterprise.name : defaultChat.provider.default.name),
				detail: localize('unknownSignInErrorDetail', "You must be signed in to use AI features."),
				primaryButton: localize('retry', "Retry")
			});

			if (confirmed) {
				return this.signIn(options);
			}
		}

		return { session, entitlement: entitlements?.entitlement };
	}

	private async install(session: AuthenticationSession | undefined, entitlement: ChatEntitlement, providerId: string, watch: StopWatch, options: IChatSetupControllerOptions): Promise<ChatSetupResultValue> {
		const wasRunning = this.context.state.installed && !this.context.state.disabled;
		let signUpResult: boolean | { errorCode: number } | undefined = undefined;

		let provider: string;
		if (options.forceAnonymous && entitlement === ChatEntitlement.Unknown) {
			provider = 'anonymous';
		} else {
			provider = options.useSocialProvider ?? (options.useEnterpriseProvider ? defaultChat.provider.enterprise.id : defaultChat.provider.default.id);
		}

		let sessions = session ? [session] : undefined;
		try {
			if (
				!options.forceAnonymous &&						// User is not asking for anonymous access
				entitlement !== ChatEntitlement.Free &&			// User is not signed up to Copilot Free
				!isProUser(entitlement) &&						// User is not signed up for a Copilot subscription
				entitlement !== ChatEntitlement.Unavailable		// User is eligible for Copilot Free
			) {
				if (!sessions) {
					try {
						// Consider all sessions for the provider to be suitable for signing up
						const existingSessions = await this.authenticationService.getSessions(providerId);
						sessions = existingSessions.length > 0 ? [...existingSessions] : undefined;
					} catch (error) {
						// ignore - errors can throw if a provider is not registered
					}

					if (!sessions || sessions.length === 0) {
						this.telemetryService.publicLog2<InstallChatEvent, InstallChatClassification>('commandCenter.chatInstall', { installResult: 'failedNoSession', installDuration: watch.elapsed(), signUpErrorCode: undefined, provider });
						return false; // unexpected
					}
				}

				signUpResult = await this.requests.signUpFree(sessions);

				if (typeof signUpResult !== 'boolean' /* error */) {
					this.telemetryService.publicLog2<InstallChatEvent, InstallChatClassification>('commandCenter.chatInstall', { installResult: 'failedSignUp', installDuration: watch.elapsed(), signUpErrorCode: signUpResult.errorCode, provider });
				}
			}

			await this.doInstallWithRetry();
		} catch (error) {
			this.logService.error(`[chat setup] install: error ${error}`);
			this.telemetryService.publicLog2<InstallChatEvent, InstallChatClassification>('commandCenter.chatInstall', { installResult: isCancellationError(error) ? 'cancelled' : 'failedInstall', installDuration: watch.elapsed(), signUpErrorCode: undefined, provider });
			return false;
		}

		if (typeof signUpResult === 'boolean' /* not an error case */ || typeof signUpResult === 'undefined' /* already signed up */) {
			this.telemetryService.publicLog2<InstallChatEvent, InstallChatClassification>('commandCenter.chatInstall', { installResult: wasRunning && !signUpResult ? 'alreadyInstalled' : 'installed', installDuration: watch.elapsed(), signUpErrorCode: undefined, provider });
		}

		if (wasRunning) {
			// We always trigger refresh of tokens to help the user
			// get out of authentication issues that can happen when
			// for example the sign-up ran after the extension tried
			// to use the authentication information to mint a token
			refreshTokens(this.commandService);
		}

		return true;
	}

	private async doInstallWithRetry(): Promise<void> {
		let error: Error | undefined;
		try {
			await this.doInstall();
		} catch (e) {
			this.logService.error(`[chat setup] install: error ${error}`);
			error = e;
		}

		if (error) {
			if (!this.lifecycleService.willShutdown) {
				const { confirmed } = await this.dialogService.confirm({
					type: Severity.Error,
					message: localize('unknownSetupError', "An error occurred while setting up chat. Would you like to try again?"),
					detail: error && !isCancellationError(error) ? toErrorMessage(error) : undefined,
					primaryButton: localize('retry', "Retry")
				});

				if (confirmed) {
					return this.doInstallWithRetry();
				}
			}

			throw error;
		}
	}

	private async doInstall(): Promise<void> {
		await this.extensionsWorkbenchService.install(defaultChat.chatExtensionId, {
			enable: true,
			isApplicationScoped: true, 	// install into all profiles
			isMachineScoped: false,		// do not ask to sync
			installEverywhere: true,	// install in local and remote
			installPreReleaseVersion: this.productService.quality !== 'stable'
		}, ChatViewId);
	}

	async setupWithProvider(options: IChatSetupControllerOptions): Promise<ChatSetupResultValue> {
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
				this.telemetryService.publicLog2<InstallChatEvent, InstallChatClassification>('commandCenter.chatInstall', { installResult: 'failedEnterpriseSetup', installDuration: 0, signUpErrorCode: undefined, provider: undefined });
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
				'authProvider': defaultChat.provider.enterprise.id
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
			prompt: localize('enterpriseInstance', "What is your {0} instance?", defaultChat.provider.enterprise.name),
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
						content: localize('invalidEnterpriseInstance', 'You must enter a valid {0} instance (i.e. "octocat" or "https://octocat.ghe.com")', defaultChat.provider.enterprise.name),
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
