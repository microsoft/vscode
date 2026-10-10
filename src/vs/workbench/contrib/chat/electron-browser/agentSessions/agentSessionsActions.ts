/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import './media/openInAgents.css';
import { $, addDisposableListener, append, EventType } from '../../../../../base/browser/dom.js';
import { BaseActionViewItem, IBaseActionViewItemOptions } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IManagedHover } from '../../../../../base/browser/ui/hover/hover.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IAction } from '../../../../../base/common/actions.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { StringSHA1 } from '../../../../../base/common/hash.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { localize, localize2 } from '../../../../../nls.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { Categories } from '../../../../../platform/action/common/actionCommonCategories.js';
import { Action2, MenuId } from '../../../../../platform/actions/common/actions.js';
import { AgentSession } from '../../../../../platform/agentHost/common/agentService.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IsLinuxContext } from '../../../../../platform/contextkey/common/contextkeys.js';
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from '../../../../../platform/accessibility/common/accessibility.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { INativeHostService, IOpenAgentsWindowOptions } from '../../../../../platform/native/common/native.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../../platform/workspace/common/workspace.js';
import { EditorAreaFocusContext, IsSessionsWindowContext } from '../../../../common/contextkeys.js';
import { ToggleTitleBarConfigAction } from '../../../../browser/parts/titlebar/titlebarActions.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { CHAT_CATEGORY } from '../../browser/actions/chatActions.js';
import { IChatWidget, IChatWidgetService, isIChatResourceViewContext } from '../../browser/chat.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { getChatSessionTelemetryContext } from '../../common/chatService/chatServiceTelemetry.js';
import { IChatSessionsService, isAgentHostTarget, isLocalAgentHostTarget, SessionType } from '../../common/chatSessionsService.js';
import { IChatViewTitleActionContext } from '../../common/actions/chatActions.js';
import { getChatSessionType, isUntitledChatSession } from '../../common/model/chatUri.js';
import { ChatInputNotificationSeverity, IChatInputNotificationService } from '../../browser/widget/input/chatInputNotificationService.js';
import { OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID, OPEN_AGENTS_WINDOW_PRECONDITION, OPEN_AGENTS_WINDOW_COMMAND_ID, ChatAgentLocation, ChatConfiguration, CopilotHarnessIntroductionMode, getCopilotHarnessIntroductionMode } from '../../common/constants.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { logExperimentTrigger, logSettingExperimentTrigger } from '../../../../../platform/telemetry/common/experimentTrigger.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { AgentsWindowOpenSource, isAgentsWindowOpenSource } from '../../../../../platform/window/common/window.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../../common/editor.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IWorkbenchAssignmentService } from '../../../../services/assignment/common/assignmentService.js';
import { serializeChatDraft, UnsupportedChatDraftAttachmentError } from '../../common/attachments/chatDraft.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { CopilotHarnessIntroductionButtonVariant, copilotHarnessIntroductionButtonVariants, CopilotHarnessIntroductionCopyVariant, copilotHarnessIntroductionCopyVariants, copilotHarnessIntroductionFeedbackCommandId, copilotHarnessIntroductionLearnMoreCommandId, getCopilotHarnessIntroductionContent } from '../../browser/agentSessions/copilotHarnessIntroduction.js';
import { isNewConversation } from '../../browser/widget/input/chatInputModelUtils.js';
import { AgentsWindowUsage } from '../../common/agentsWindowUsage.js';
import { IAgentHostEditorActivityService } from './agentHostEditorActivity.js';

const OPEN_WORKSPACE_IN_AGENTS_WINDOW_TITLE = localize2('openWorkspaceInAgentsWindow', "Open in Agents");
const OPEN_WORKSPACE_IN_AGENTS_WINDOW_CHAT_TITLE_COMMAND_ID = 'workbench.action.chat.openWorkspaceInAgentsWindow.chatTitle';
const OPEN_WORKSPACE_IN_AGENTS_WINDOW_TITLE_BAR_COMMAND_ID = 'workbench.action.chat.openWorkspaceInAgentsWindow.titleBar';
const COPILOT_HARNESS_INTRODUCTION_IGNORED_STORAGE_KEY = 'chat.agentsParallelWork.copilotHarnessIntroductionIgnored';

type OpenInAgentsWindowDecisionEvent = {
	branch: 'revealCurrentSession' | 'openWorkspaceFallback';
	entryPoint: 'applicationTitleBar';
	agentSessionId: string;
};

type OpenInAgentsWindowDecisionClassification = {
	branch: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The navigation branch selected from the effective reveal-current-session setting.' };
	entryPoint: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The application surface where the Open in Agents action was invoked.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'A SHA-1 hash of the local Agent Host session identifier for deterministic correlation.' };
	owner: 'alexdima';
	comment: 'Tracks eligible application title-bar decisions between revealing the current local Agent Host session and opening the workspace fallback.';
};

function hashAgentSessionIdForTelemetry(sessionResource: URI): string {
	const sha1 = new StringSHA1();
	sha1.update(AgentSession.id(sessionResource));
	return sha1.digest();
}

function ensureAgentModeEnabled(configurationService: IConfigurationService): void {
	if (configurationService.getValue<boolean>(ChatConfiguration.AgentEnabled) === false) {
		throw new Error(localize('agentsWindow.agentModeDisabled', "The Agents window is unavailable because agent mode is disabled."));
	}
}

function getInvokingWorkspaceFolder(accessor: ServicesAccessor): URI | undefined {
	const workspaceContextService = accessor.get(IWorkspaceContextService);
	const folders = workspaceContextService.getWorkspace().folders;
	if (folders.length <= 1) {
		return folders[0]?.uri;
	}
	const resource = EditorResourceAccessor.getOriginalUri(accessor.get(IEditorService).activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
	return resource ? workspaceContextService.getWorkspaceFolder(resource)?.uri : undefined;
}

function isChatWidget(widget: IChatWidget | undefined): widget is IChatWidget {
	const viewModel = widget?.viewModel;
	return !!widget && !!viewModel
		&& widget.location === ChatAgentLocation.Chat
		&& !(isIChatResourceViewContext(widget.viewContext) && (widget.viewContext.isQuickChat || widget.viewContext.isInlineChat));
}

function isDraftWidget(widget: IChatWidget | undefined): widget is IChatWidget {
	const viewModel = widget?.viewModel;
	return isChatWidget(widget) && !!viewModel
		&& isNewConversation(viewModel.sessionResource, viewModel.model.hasRequests === false);
}

export function isAgentHostChatWidget(widget: IChatWidget | undefined): widget is IChatWidget {
	const resource = widget?.viewModel?.sessionResource;
	return !!resource && isChatWidget(widget) && isAgentHostTarget(getChatSessionType(resource));
}

function isAgentHostDraftWidget(widget: IChatWidget | undefined): widget is IChatWidget {
	const resource = widget?.viewModel?.sessionResource;
	return !!resource && isDraftWidget(widget) && isAgentHostTarget(getChatSessionType(resource));
}

function isCopilotHarnessSessionType(chatSessionsService: IChatSessionsService, sessionType: string): boolean {
	return sessionType === SessionType.AgentHostCopilot
		|| chatSessionsService.getChatSessionContribution(sessionType)?.agentHostProviderId === SessionType.CopilotCLI;
}

function getDraftHandoffOptions(accessor: ServicesAccessor, sessionResource?: URI, forceTransfer = false, inputUri?: URI): Pick<IOpenAgentsWindowOptions, 'draft' | 'folderUriIsDefault'> {
	const widgets = accessor.get(IChatWidgetService);
	const widget = inputUri ? widgets.getWidgetByInputUri(inputUri) : sessionResource ? widgets.getWidgetBySessionResource(sessionResource) : widgets.lastFocusedWidget;
	if (sessionResource && !isEqual(widget?.viewModel?.sessionResource, sessionResource)) {
		return {};
	}
	if (!forceTransfer) {
		// Transferring only changes the outcome for a draft with content.
		if (canHandOffDraft(widget) && (widget.getInput().trim().length > 0 || widget.attachmentModel.attachments.length > 0)) {
			logSettingExperimentTrigger(accessor.get(ITelemetryService), ChatConfiguration.OpenInAgentsWindowTransferDraft);
		}
		if (accessor.get(IConfigurationService).getValue<boolean>(ChatConfiguration.OpenInAgentsWindowTransferDraft) !== true) {
			return {};
		}
	}
	return captureDraftHandoffOptions(accessor, widget);
}

function canHandOffDraft(widget: IChatWidget | undefined): widget is IChatWidget {
	return isDraftWidget(widget) && widget.scopedContextKeyService.contextMatchesRules(ContextKeyExpr.and(OPEN_AGENTS_WINDOW_PRECONDITION, ChatContextKeys.enabled));
}

function captureDraftHandoffOptions(accessor: ServicesAccessor, widget: IChatWidget | undefined): Pick<IOpenAgentsWindowOptions, 'draft' | 'folderUriIsDefault'> {
	if (!canHandOffDraft(widget)) {
		return {};
	}
	try {
		const modelService = accessor.get(IModelService);
		return {
			draft: serializeChatDraft({ inputText: widget.getInput(), attachments: widget.attachmentModel.attachments }, resource => modelService.getModel(resource)),
		};
	} catch (error) {
		if (!(error instanceof UnsupportedChatDraftAttachmentError)) {
			throw error;
		}
		accessor.get(INotificationService).warn(localize('agentsWindow.unsupportedDraftAttachment', "This draft contains context that is only available in this window. Your prompt and attachments have been kept here instead of copied to the Agents Window."));
		return { folderUriIsDefault: true };
	}
}

function isOpenChatSessionInAgentsWindowOptions(value: unknown): value is { readonly agentsWindowOpenSource: AgentsWindowOpenSource; readonly reveal?: 'new'; readonly transferDraft?: boolean } {
	return !!value
		&& typeof value === 'object'
		&& isAgentsWindowOpenSource((value as { readonly agentsWindowOpenSource?: unknown }).agentsWindowOpenSource);
}

export class OpenWorkspaceInAgentsWindowAction extends Action2 {
	constructor() {
		super({
			id: OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID,
			title: OPEN_WORKSPACE_IN_AGENTS_WINDOW_TITLE,
			category: CHAT_CATEGORY,
			precondition: OPEN_AGENTS_WINDOW_PRECONDITION,
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor, options?: { readonly source?: AgentsWindowOpenSource; readonly sessionResource?: URI; readonly inputUri?: URI; readonly reveal?: IOpenAgentsWindowOptions['reveal'] }): Promise<void> {
		ensureAgentModeEnabled(accessor.get(IConfigurationService));
		const draftOptions = options?.reveal === 'new' ? getDraftHandoffOptions(accessor, options.sessionResource, false, options.inputUri) : {};
		await accessor.get(INativeHostService).openAgentsWindow({
			folderUri: getInvokingWorkspaceFolder(accessor) ?? accessor.get(IWorkspaceContextService).getWorkspace().folders[0]?.uri,
			reveal: options?.reveal,
			source: options?.source ?? AgentsWindowOpenSource.CommandPalette,
			...draftOptions,
		});
	}
}

export class OpenWorkspaceInAgentsWindowChatTitleAction extends Action2 {
	constructor() {
		super({
			id: OPEN_WORKSPACE_IN_AGENTS_WINDOW_CHAT_TITLE_COMMAND_ID,
			title: OPEN_WORKSPACE_IN_AGENTS_WINDOW_TITLE,
			precondition: OPEN_AGENTS_WINDOW_PRECONDITION,
			f1: false,
			menu: {
				id: MenuId.ChatTitleBarMenu,
				group: 'c_sessions',
				order: 1,
				when: OPEN_AGENTS_WINDOW_PRECONDITION,
			},
		});
	}

	async run(accessor: ServicesAccessor, context?: IChatViewTitleActionContext): Promise<void> {
		await accessor.get(ICommandService).executeCommand(OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID, {
			source: AgentsWindowOpenSource.ChatTitleBar,
			...(context?.sessionResource ? { sessionResource: context.sessionResource } : {}),
			...(context?.inputUri ? { inputUri: context.inputUri } : {}),
		});
	}
}

export class OpenWorkspaceInAgentsWindowTitleBarAction extends Action2 {
	constructor() {
		super({
			id: OPEN_WORKSPACE_IN_AGENTS_WINDOW_TITLE_BAR_COMMAND_ID,
			title: OPEN_WORKSPACE_IN_AGENTS_WINDOW_TITLE,
			precondition: OPEN_AGENTS_WINDOW_PRECONDITION,
			f1: false,
			menu: {
				id: MenuId.TitleBarAdjacentCenter,
				order: -1000,
				when: ContextKeyExpr.and(
					OPEN_AGENTS_WINDOW_PRECONDITION,
					ContextKeyExpr.notEquals(`config.${ChatConfiguration.TitleBarOpenInAgentsWindowEnabled}`, false),
				),
			},
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const configurationService = accessor.get(IConfigurationService);
		const sessionResource = accessor.get(IChatWidgetService).lastFocusedWidget?.viewModel?.sessionResource;
		if (!sessionResource
			|| isUntitledChatSession(sessionResource)
			|| !isLocalAgentHostTarget(getChatSessionType(sessionResource))) {
			await accessor.get(ICommandService).executeCommand(OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID, { source: AgentsWindowOpenSource.TitleBar });
			return;
		}

		const telemetryService = accessor.get(ITelemetryService);
		logSettingExperimentTrigger(telemetryService, ChatConfiguration.OpenInAgentsWindowRevealCurrentSession);
		const revealCurrentSession = configurationService.getValue<boolean>(ChatConfiguration.OpenInAgentsWindowRevealCurrentSession) === true;
		telemetryService.publicLog2<OpenInAgentsWindowDecisionEvent, OpenInAgentsWindowDecisionClassification>('chat.openInAgentsWindowDecision', {
			branch: revealCurrentSession ? 'revealCurrentSession' : 'openWorkspaceFallback',
			entryPoint: 'applicationTitleBar',
			agentSessionId: hashAgentSessionIdForTelemetry(sessionResource),
		});

		if (revealCurrentSession) {
			await accessor.get(ICommandService).executeCommand(
				OpenChatSessionInAgentsWindowAction.ID,
				{ agentsWindowOpenSource: AgentsWindowOpenSource.TitleBar },
				sessionResource,
			);
			return;
		}

		await accessor.get(ICommandService).executeCommand(OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID, { source: AgentsWindowOpenSource.TitleBar });
	}
}

export class ToggleOpenInAgentsWindowTitleBarAction extends ToggleTitleBarConfigAction {
	constructor() {
		super(
			ChatConfiguration.TitleBarOpenInAgentsWindowEnabled,
			localize('toggle.openInAgentsWindow', 'Open in Agents Window'),
			localize('toggle.openInAgentsWindowDescription', "Toggle visibility of the Open in Agents Window button in title bar"),
			6,
			OPEN_AGENTS_WINDOW_PRECONDITION,
		);
	}
}

export class ResetCopilotHarnessIntroductionAction extends Action2 {
	static readonly ID = 'workbench.action.chat.resetCopilotHarnessIntroduction';

	constructor() {
		super({
			id: ResetCopilotHarnessIntroductionAction.ID,
			title: localize2('chat.resetCopilotHarnessIntroduction', "Reset Copilot Harness Introduction"),
			category: Categories.Developer,
			f1: true,
			precondition: ChatContextKeys.enabled,
		});
	}

	override run(accessor: ServicesAccessor): void {
		accessor.get(IStorageService).remove(COPILOT_HARNESS_INTRODUCTION_IGNORED_STORAGE_KEY, StorageScope.APPLICATION);
	}
}

export class OpenAgentsWindowAction extends Action2 {
	constructor() {
		super({
			id: OPEN_AGENTS_WINDOW_COMMAND_ID,
			title: localize2('openAgentsWindow', "Open Agents Window"),
			category: CHAT_CATEGORY,
			precondition: OPEN_AGENTS_WINDOW_PRECONDITION,
			f1: true,
			keybinding: [{
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyA,
				weight: KeybindingWeight.WorkbenchContrib,
				// On Linux, Ctrl+Shift+A is Toggle Block Comment, so defer to it in a focused writable editor.
				when: ContextKeyExpr.and(ChatContextKeys.hasCreatedSessionInAgentsWindow, IsSessionsWindowContext.toNegated(), CONTEXT_ACCESSIBILITY_MODE_ENABLED.toNegated(), ContextKeyExpr.or(IsLinuxContext.toNegated(), EditorAreaFocusContext.toNegated(), EditorContextKeys.readOnly)),
				args: { source: AgentsWindowOpenSource.KeyboardShortcut },
			}, {
				// In screen reader mode, Cmd/Ctrl+Shift+A conflicts with many screen reader keybindings,
				// so require an additional Alt modifier.
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.KeyA,
				weight: KeybindingWeight.WorkbenchContrib,
				when: ContextKeyExpr.and(ChatContextKeys.hasCreatedSessionInAgentsWindow, IsSessionsWindowContext.toNegated(), CONTEXT_ACCESSIBILITY_MODE_ENABLED),
				args: { source: AgentsWindowOpenSource.KeyboardShortcut },
			}],
		});
	}

	async run(accessor: ServicesAccessor, args?: IOpenAgentsWindowOptions): Promise<void> {
		ensureAgentModeEnabled(accessor.get(IConfigurationService));
		const nativeHostService = accessor.get(INativeHostService);
		const draftOptions: Pick<IOpenAgentsWindowOptions, 'draft' | 'folderUriIsDefault'> = args?.reveal === 'new' && !args.folderUri && !args.draft ? getDraftHandoffOptions(accessor) : {};
		const folderUri = !args?.folderUri && (!args?.reveal || args.reveal === 'new')
			? getInvokingWorkspaceFolder(accessor) ?? (draftOptions.draft ? accessor.get(IWorkspaceContextService).getWorkspace().folders[0]?.uri : undefined)
			: undefined;
		await nativeHostService.openAgentsWindow({
			...args,
			...(folderUri ? { folderUri, folderUriIsDefault: !draftOptions.draft } : undefined),
			...draftOptions,
			source: args?.source ?? AgentsWindowOpenSource.CommandPalette,
		});
	}
}

/**
 * Opens the current chat session inside the Agents window. Visible only when
 * the active chat is a first-party agent-host session (Copilot CLI today)
 * since those are the session types the Agents window can render directly.
 */
export class OpenChatSessionInAgentsWindowAction extends Action2 {

	static readonly ID = 'workbench.action.chat.openSessionInAgentsWindow';

	constructor() {
		super({
			id: OpenChatSessionInAgentsWindowAction.ID,
			title: localize2('openSessionInAgentsWindow', "Open in Agents Window"),
			category: CHAT_CATEGORY,
			precondition: OPEN_AGENTS_WINDOW_PRECONDITION,
			f1: false,
			menu: [{
				id: MenuId.ChatTitleBarMenu,
				group: 'c_sessions',
				order: 0,
				when: ContextKeyExpr.and(
					OPEN_AGENTS_WINDOW_PRECONDITION,
					ContextKeyExpr.or(
						ChatContextKeys.chatSessionType.isEqualTo(SessionType.CopilotCLI),
						ChatContextKeys.chatSessionType.isEqualTo(SessionType.AgentHostCopilot),
					),
				),
			}],
		});
	}

	async run(accessor: ServicesAccessor, ...rest: unknown[]): Promise<void> {
		ensureAgentModeEnabled(accessor.get(IConfigurationService));
		const chatWidgetService = accessor.get(IChatWidgetService);
		const nativeHostService = accessor.get(INativeHostService);
		const workspaceContextService = accessor.get(IWorkspaceContextService);

		const commandOptions = isOpenChatSessionInAgentsWindowOptions(rest[0]) ? rest[0] : undefined;
		const source = commandOptions?.agentsWindowOpenSource ?? AgentsWindowOpenSource.ChatTitleBar;
		const args = commandOptions ? rest.slice(1) : rest;
		let sessionResource: URI | undefined;
		let inputUri: URI | undefined;
		const arg = args[0];
		if (URI.isUri(arg)) {
			sessionResource = arg;
		} else if (arg && typeof arg === 'object') {
			const ctx = arg as IChatViewTitleActionContext;
			if (URI.isUri(ctx.sessionResource)) {
				sessionResource = ctx.sessionResource;
			}
			if (URI.isUri(ctx.inputUri)) {
				inputUri = ctx.inputUri;
			}
		}
		if (!sessionResource) {
			const widget = inputUri ? chatWidgetService.getWidgetByInputUri(inputUri) : chatWidgetService.lastFocusedWidget;
			sessionResource = widget?.viewModel?.sessionResource;
			inputUri ??= widget?.inputPart?.inputUri;
		}

		// A persisted session carries its own workspace; otherwise retain the folder for a cold open or explicit new-session reveal.
		const draftOptions = commandOptions?.reveal === 'new' ? getDraftHandoffOptions(accessor, sessionResource, commandOptions.transferDraft === true, inputUri) : {};
		const hasRealSession = sessionResource && !isUntitledChatSession(sessionResource) && commandOptions?.reveal !== 'new';
		const folderUri = getInvokingWorkspaceFolder(accessor) ?? workspaceContextService.getWorkspace().folders[0]?.uri;
		await nativeHostService.openAgentsWindow({
			folderUri: !hasRealSession && (draftOptions.draft || folderUri?.scheme === Schemas.file) ? folderUri?.toJSON() : undefined,
			reveal: hasRealSession ? sessionResource?.toJSON() : commandOptions?.reveal,
			source,
			...draftOptions,
		});
	}
}

/**
 * Renders the "Open in Agents" titlebar entry as an icon-only button that
 * expands to reveal a label on hover / keyboard focus.
 */
class OpenWorkspaceInAgentsTitleBarWidget extends BaseActionViewItem {

	private static readonly LABEL_TREATMENT = 'chatOpenInAgentsTitleBarLabel';
	private static readonly EXPAND_ON_HOVER_TREATMENT = 'chatOpenInAgentsTitleBarExpandOnHover';
	private readonly treatments = this._register(new MutableDisposable());
	private readonly usage: AgentsWindowUsage;
	private labelElement: HTMLElement | undefined;
	private hover: IManagedHover | undefined;
	private treatmentLabel: string | undefined;
	private treatmentsResolved = false;
	private expansionTreatmentResolved = false;
	private isHovered = false;

	constructor(
		action: IAction,
		options: IBaseActionViewItemOptions | undefined,
		@IHoverService private readonly hoverService: IHoverService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchAssignmentService private readonly assignmentService: IWorkbenchAssignmentService,
		@ILogService private readonly logService: ILogService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super(undefined, action, options);
		this.usage = new AgentsWindowUsage(storageService);
		this._register(this.usage.onDidChangeCreatedSessionCount(this._store)(() => {
			if (!this.isEligible) {
				this.treatments.clear();
			}
			this.updateLabel();
		}));
	}

	private get isEligible(): boolean {
		return this.usage.createdSessionCount === 0;
	}

	override render(container: HTMLElement): void {
		super.render(container);

		container.classList.add('open-in-agents-titlebar-widget', 'expand-on-hover');
		container.setAttribute('role', 'button');
		this._register(addDisposableListener(container, EventType.MOUSE_ENTER, () => {
			this.isHovered = true;
			this.logExpansionExperimentTrigger();
		}));
		this._register(addDisposableListener(container, EventType.MOUSE_LEAVE, () => {
			this.isHovered = false;
		}));
		this._register(registerAgentsWindowTreatments<boolean>(
			[OpenWorkspaceInAgentsTitleBarWidget.EXPAND_ON_HOVER_TREATMENT],
			'OpenWorkspaceInAgentsTitleBarWidget',
			([expandOnHover]) => {
				this.expansionTreatmentResolved = true;
				this.logExpansionExperimentTrigger();
				container.classList.toggle('expand-on-hover', expandOnHover ?? true);
			},
			this.assignmentService,
			this.logService,
			value => typeof value === 'boolean',
		));

		const hoverText = this.keybindingService.appendKeybinding(localize('openInAgentsHover', "Open in Agents Window"), OPEN_AGENTS_WINDOW_COMMAND_ID);
		container.setAttribute('aria-label', hoverText);
		this.hover = this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), container, hoverText));

		const icon = append(container, $('span.open-in-agents-titlebar-widget-icon'));
		icon.setAttribute('aria-hidden', 'true');

		this.labelElement = append(container, $('span.open-in-agents-titlebar-widget-label'));
		this.updateLabel();
		if (this.isEligible) {
			this.treatments.value = registerAgentsWindowTreatments(
				[OpenWorkspaceInAgentsTitleBarWidget.LABEL_TREATMENT],
				'OpenWorkspaceInAgentsTitleBarWidget',
				([label]) => {
					this.treatmentLabel = label;
					this.treatmentsResolved = true;
					this.updateLabel();
				},
				this.assignmentService,
				this.logService,
			);
		}
	}

	private logExpansionExperimentTrigger(): void {
		if (this.isHovered && this.expansionTreatmentResolved) {
			logExperimentTrigger(this.telemetryService, OpenWorkspaceInAgentsTitleBarWidget.EXPAND_ON_HOVER_TREATMENT);
		}
	}

	protected override updateLabel(): void {
		if (!this.element || !this.labelElement) {
			return;
		}
		const eligible = this.isEligible;
		if (eligible && this.treatmentsResolved) {
			logExperimentTrigger(this.telemetryService, OpenWorkspaceInAgentsTitleBarWidget.LABEL_TREATMENT);
		}
		const treatmentLabel = eligible ? this.treatmentLabel : undefined;
		this.labelElement.textContent = treatmentLabel ?? this.action.label;
		const hoverText = this.keybindingService.appendKeybinding(treatmentLabel ?? localize('openInAgentsHover', "Open in Agents Window"), OPEN_AGENTS_WINDOW_COMMAND_ID);
		this.element.setAttribute('aria-label', hoverText);
		this.hover?.update(hoverText);
	}
}

export class OpenWorkspaceInAgentsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.openWorkspaceInAgents.desktop';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IProductService productService: IProductService,
		@IStorageService storageService: IStorageService,
	) {
		super();
		const usage = new AgentsWindowUsage(storageService);
		const hasCreatedSession = ChatContextKeys.hasCreatedSessionInAgentsWindow.bindTo(contextKeyService);
		const updateHasCreatedSession = () => hasCreatedSession.set(usage.createdSessionCount > 0);
		updateHasCreatedSession();
		this._register(usage.onDidChangeCreatedSessionCount(this._store)(updateHasCreatedSession));

		this._register(actionViewItemService.register(MenuId.TitleBarAdjacentCenter, OPEN_WORKSPACE_IN_AGENTS_WINDOW_TITLE_BAR_COMMAND_ID, (action, options) => {
			return instantiationService.createInstance(OpenWorkspaceInAgentsTitleBarWidget, action, options);
		}, undefined));
	}
}

export function registerAgentsWindowTreatments<T extends string | number | boolean = string>(
	treatments: readonly string[],
	logPrefix: string,
	onChange: (values: readonly (T | undefined)[]) => void,
	assignmentService: IWorkbenchAssignmentService,
	logService: ILogService,
	isValid: (value: T, name: string) => boolean = value => typeof value === 'string' && value.trim().length > 0,
): IDisposable {
	const store = new DisposableStore();
	let treatmentRequest = 0;
	let hasResolved = false;
	const getTreatmentValue = (name: string, value: T | undefined): T | undefined => {
		if (value === undefined || isValid(value, name)) {
			return value;
		}
		logService.warn(`[${logPrefix}] Ignoring invalid ${name} treatment`);
		return undefined;
	};
	const update = async (): Promise<void> => {
		const request = ++treatmentRequest;
		let values: (T | undefined)[];
		try {
			values = await Promise.all(treatments.map(name => assignmentService.getTreatment<T>(name)));
		} catch (error) {
			if (store.isDisposed || request !== treatmentRequest) {
				return;
			}
			if (!isCancellationError(error)) {
				logService.warn(`[${logPrefix}] Failed to resolve treatments`, error);
			}
			if (hasResolved) {
				return;
			}
			values = treatments.map(() => undefined);
		}
		if (store.isDisposed || request !== treatmentRequest) {
			return;
		}
		hasResolved = true;
		onChange(values.map((value, index) => getTreatmentValue(treatments[index], value)));
	};
	store.add(assignmentService.onDidRefetchAssignments(() => void update()));
	void update();
	return store;
}

type CopilotHarnessIntroductionLifecycleEvent = {
	stage: 'opportunity' | 'shown' | 'materialized';
	mode: CopilotHarnessIntroductionMode;
	chatSessionId: string;
	sessionType: string;
	harness: string | undefined;
	committedChatSessionId?: string;
};

type CopilotHarnessIntroductionLifecycleClassification = {
	stage: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether an eligible Copilot harness introduction opportunity was observed or the introduction was actually shown.' };
	mode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The effective Copilot harness introduction experiment mode.' };
	chatSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The random identifier of the eligible chat session.' };
	sessionType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The telemetry-safe chat session type.' };
	harness: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The underlying Agent Host harness, when applicable.' };
	committedChatSessionId?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The random identifier assigned when an untitled opportunity materializes, used to join later request telemetry.' };
	owner: 'justschen';
	comment: 'Tracks eligible opportunities and actual exposure for the Copilot harness introduction experiment.';
};

export class CopilotHarnessIntroductionContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.copilotHarnessIntroduction';
	private static readonly NOTIFICATION_ID = 'chat.agentsParallelWork';
	private static readonly COPY_TREATMENT = 'chatCopilotHarnessIntroductionCopy';
	private static readonly BUTTONS_TREATMENT = 'chatCopilotHarnessIntroductionButtons';

	private readonly eligibleWidgets = new Set<IChatWidget>();
	private readonly recentWidgets = new Set<IChatWidget>();
	private readonly shownModes = new Map<IChatWidget, Set<CopilotHarnessIntroductionMode>>();
	private readonly opportunities = new ResourceMap<CopilotHarnessIntroductionMode>();
	private copy: CopilotHarnessIntroductionCopyVariant = 'current';
	private buttons: CopilotHarnessIntroductionButtonVariant = 'dismiss';
	private treatmentsReady = false;
	private updating = false;
	private posted: { widget: IChatWidget; resource: URI; inputUri: URI; mode: CopilotHarnessIntroductionMode; copy: CopilotHarnessIntroductionCopyVariant; buttons: CopilotHarnessIntroductionButtonVariant } | undefined;

	constructor(
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IChatInputNotificationService private readonly notificationService: IChatInputNotificationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IOpenerService openerService: IOpenerService,
		@IStorageService private readonly storageService: IStorageService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IWorkbenchAssignmentService assignmentService: IWorkbenchAssignmentService,
		@ILogService private readonly logService: ILogService,
		@IAgentHostEditorActivityService private readonly editorActivity: IAgentHostEditorActivityService,
	) {
		super();
		this._register(CommandsRegistry.registerCommand(copilotHarnessIntroductionLearnMoreCommandId, (_accessor, inputUri: URI, resource: URI) => {
			if (this.isCurrent(inputUri, resource)) {
				return openerService.open('https://aka.ms/vscode-copilot-harness', { openExternal: true });
			}
			return undefined;
		}));
		this._register(CommandsRegistry.registerCommand(copilotHarnessIntroductionFeedbackCommandId, (_accessor, inputUri: URI, resource: URI, helpful: boolean) => {
			if (typeof helpful === 'boolean' && this.isCurrent(inputUri, resource)) {
				this.ignore();
			}
		}));
		this._register(chatWidgetService.onDidChangeFocusedSession(() => this.onSessionChanged()));
		this._register(chatWidgetService.onDidAddWidget(() => this.onSessionChanged()));
		this._register(chatWidgetService.onDidChangeWidgetVisibility(() => this.update()));
		this._register(chatWidgetService.onDidRemoveWidget(widget => {
			this.eligibleWidgets.delete(widget);
			this.recentWidgets.delete(widget);
			this.shownModes.delete(widget);
			this.update();
		}));
		this._register(chatSessionsService.onDidCommitSession(({ original, committed }) => {
			const mode = this.opportunities.get(original);
			if (mode !== undefined && !this._store.isDisposed) {
				this.telemetryService.publicLog2<CopilotHarnessIntroductionLifecycleEvent, CopilotHarnessIntroductionLifecycleClassification>('copilotHarnessIntroductionLifecycle', {
					stage: 'materialized', mode, ...getChatSessionTelemetryContext(original),
					committedChatSessionId: getChatSessionTelemetryContext(committed).chatSessionId,
				});
				this.opportunities.set(committed, mode);
			}
		}));
		this._register(contextKeyService.onDidChangeContext(() => this.update()));
		this._register(workspaceContextService.onDidChangeWorkbenchState(() => this.update()));
		this._register(storageService.onDidChangeValue(StorageScope.APPLICATION, COPILOT_HARNESS_INTRODUCTION_IGNORED_STORAGE_KEY, this._store)(() => {
			if (!this.ignored) {
				this.shownModes.clear();
			}
			this.update();
		}));
		this._register(configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(ChatConfiguration.CopilotHarnessIntroductionMode)) {
				this.update();
			}
		}));
		this._register(registerAgentsWindowTreatments(
			[CopilotHarnessIntroductionContribution.COPY_TREATMENT, CopilotHarnessIntroductionContribution.BUTTONS_TREATMENT],
			'CopilotHarnessIntroduction',
			([copy, buttons]) => {
				const copyVariant = copilotHarnessIntroductionCopyVariants.find(variant => variant === copy);
				const buttonVariant = copilotHarnessIntroductionButtonVariants.find(variant => variant === buttons);
				if (copy !== undefined && !copyVariant) {
					logService.warn(`[CopilotHarnessIntroduction] Ignoring invalid ${CopilotHarnessIntroductionContribution.COPY_TREATMENT} treatment`);
				}
				if (buttons !== undefined && !buttonVariant) {
					logService.warn(`[CopilotHarnessIntroduction] Ignoring invalid ${CopilotHarnessIntroductionContribution.BUTTONS_TREATMENT} treatment`);
				}
				this.copy = copyVariant ?? 'current';
				this.buttons = buttonVariant ?? 'dismiss';
				this.treatmentsReady = true;
				this.update();
			},
			assignmentService, logService,
		));
		this.onSessionChanged();
	}

	private get ignored(): boolean {
		return this.storageService.getBoolean(COPILOT_HARNESS_INTRODUCTION_IGNORED_STORAGE_KEY, StorageScope.APPLICATION, false);
	}

	private ignore(): void {
		this.storageService.store(COPILOT_HARNESS_INTRODUCTION_IGNORED_STORAGE_KEY, true, StorageScope.APPLICATION, StorageTarget.USER);
		this.update();
	}

	private onSessionChanged(): void {
		const widget = this.chatWidgetService.lastFocusedWidget;
		if (widget) {
			this.recentWidgets.delete(widget);
			this.recentWidgets.add(widget);
		}
		if (isAgentHostDraftWidget(widget)) {
			const resource = widget.viewModel!.sessionResource;
			if (isCopilotHarnessSessionType(this.chatSessionsService, getChatSessionType(resource)) && !this.eligibleWidgets.has(widget)) {
				this.eligibleWidgets.add(widget);
				if (!this.ignored) {
					const mode = getCopilotHarnessIntroductionMode(this.configurationService);
					this.opportunities.set(resource, mode);
					this.logLifecycle('opportunity', widget, resource, mode);
				}
			}
		}
		this.update();
	}

	private isEligible(widget: IChatWidget): boolean {
		const resource = isAgentHostChatWidget(widget) ? widget.viewModel?.sessionResource : undefined;
		return !!resource && widget.visible && this.treatmentsReady && !this.ignored && this.eligibleWidgets.has(widget)
			&& getCopilotHarnessIntroductionMode(this.configurationService) !== CopilotHarnessIntroductionMode.Off
			&& isCopilotHarnessSessionType(this.chatSessionsService, getChatSessionType(resource))
			&& !(getChatSessionType(resource) === SessionType.AgentHostCopilot && this.workspaceContextService.getWorkbenchState() === WorkbenchState.EMPTY)
			&& widget.scopedContextKeyService.contextMatchesRules(ContextKeyExpr.and(OPEN_AGENTS_WINDOW_PRECONDITION, ChatContextKeys.enabled));
	}

	private isCurrent(inputUri: URI, resource: URI): boolean {
		const posted = this.posted;
		return !!posted && this.isEligible(posted.widget) && isEqual(posted.inputUri, inputUri)
			&& isEqual(posted.resource, resource) && isEqual(posted.widget.viewModel?.sessionResource, resource);
	}

	private update(): void {
		if (this.updating || this._store.isDisposed) {
			return;
		}
		this.updating = true;
		try {
			const widgets = this.chatWidgetService.getAllWidgets();
			const focused = this.chatWidgetService.lastFocusedWidget;
			const widget = focused && widgets.includes(focused) && focused.visible
				? this.isEligible(focused) ? focused : undefined
				: [...this.recentWidgets].reverse().find(widget => widgets.includes(widget) && this.isEligible(widget));
			const resource = widget?.viewModel?.sessionResource;
			const inputUri = widget?.inputPart.inputUri;
			if (!widget || !resource || !inputUri) {
				this.posted = undefined;
				this.notificationService.deleteNotification(CopilotHarnessIntroductionContribution.NOTIFICATION_ID);
				return;
			}
			const mode = getCopilotHarnessIntroductionMode(this.configurationService);
			if (this.posted?.widget === widget && isEqual(this.posted.resource, resource) && isEqual(this.posted.inputUri, inputUri)
				&& this.posted.mode === mode && this.posted.copy === this.copy && this.posted.buttons === this.buttons) {
				return;
			}
			const previous = this.posted;
			const posted = { widget, resource, inputUri, mode, copy: this.copy, buttons: this.buttons };
			this.posted = posted;
			if (previous && (previous.widget !== widget || !isEqual(previous.inputUri, inputUri))) {
				this.notificationService.refresh();
			}
			const content = getCopilotHarnessIntroductionContent(this.copy, this.buttons);
			let shown = false;
			this.notificationService.setNotification({
				id: CopilotHarnessIntroductionContribution.NOTIFICATION_ID,
				inputUri,
				telemetryId: `copilotHarnessIntroduction.${mode}`,
				severity: ChatInputNotificationSeverity.Info,
				message: content.title,
				description: new MarkdownString(content.description),
				sessionResources: [resource],
				when: context => this.posted === posted && !context.isTransientChat && (mode === CopilotHarnessIntroductionMode.NewSession || context.sessionStarted),
				dismissible: content.dismissible,
				onDismiss: content.dismissible ? () => this.ignore() : undefined,
				onDidShow: () => {
					if (shown || this._store.isDisposed) {
						return;
					}
					shown = true;
					this.logLifecycle('shown', widget, resource, mode);
					void this.editorActivity.recordCopilotHarnessIntroductionShown()
						.catch(error => this.logService.error('[CopilotHarnessIntroduction] Failed to record impression', error));
				},
				autoDismissOnMessage: false,
				actions: content.actions.map(action => ({ ...action, commandArgs: [inputUri, resource, ...(action.commandArgs ?? [])] })),
			});
		} finally {
			this.updating = false;
		}
	}

	private logLifecycle(stage: 'opportunity' | 'shown', widget: IChatWidget, resource: URI, mode: CopilotHarnessIntroductionMode): void {
		if (this._store.isDisposed) {
			return;
		}
		if (stage === 'shown') {
			logExperimentTrigger(this.telemetryService, CopilotHarnessIntroductionContribution.COPY_TREATMENT);
			logExperimentTrigger(this.telemetryService, CopilotHarnessIntroductionContribution.BUTTONS_TREATMENT);
			let shown = this.shownModes.get(widget);
			if (!shown) {
				shown = new Set();
				this.shownModes.set(widget, shown);
			}
			if (shown.has(mode)) {
				return;
			}
			shown.add(mode);
		}
		this.telemetryService.publicLog2<CopilotHarnessIntroductionLifecycleEvent, CopilotHarnessIntroductionLifecycleClassification>('copilotHarnessIntroductionLifecycle', {
			stage, mode, ...getChatSessionTelemetryContext(resource),
		});
	}

	override dispose(): void {
		super.dispose();
		this.posted = undefined;
		this.eligibleWidgets.clear();
		this.recentWidgets.clear();
		this.shownModes.clear();
		this.opportunities.clear();
		this.notificationService.deleteNotification(CopilotHarnessIntroductionContribution.NOTIFICATION_ID);
	}
}
