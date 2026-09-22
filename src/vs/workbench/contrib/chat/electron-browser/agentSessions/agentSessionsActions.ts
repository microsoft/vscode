/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import './media/openInAgents.css';
import { $, append } from '../../../../../base/browser/dom.js';
import { BaseActionViewItem, IBaseActionViewItemOptions } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IAction } from '../../../../../base/common/actions.js';
import { disposableLongTimeout } from '../../../../../base/common/async.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, observableFromEvent } from '../../../../../base/common/observable.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { localize, localize2 } from '../../../../../nls.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, MenuId } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
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
import { IsSessionsWindowContext } from '../../../../common/contextkeys.js';
import { ToggleTitleBarConfigAction } from '../../../../browser/parts/titlebar/titlebarActions.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { CHAT_CATEGORY } from '../../browser/actions/chatActions.js';
import { IChatWidget, IChatWidgetService, isIChatResourceViewContext } from '../../browser/chat.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { isAgentHostTarget, isLocalAgentHostTarget, SessionType } from '../../common/chatSessionsService.js';
import { IChatViewTitleActionContext } from '../../common/actions/chatActions.js';
import { getChatSessionType, isUntitledChatSession } from '../../common/model/chatUri.js';
import { IChatModel } from '../../common/model/chatModel.js';
import { ChatInputNotificationActionKind, ChatInputNotificationSeverity, IChatInputNotificationService } from '../../browser/widget/input/chatInputNotificationService.js';
import { OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID, OPEN_AGENTS_WINDOW_PRECONDITION, OPEN_AGENTS_WINDOW_COMMAND_ID, ChatAgentLocation, ChatConfiguration, DEFAULT_AGENTS_HANDOFF_TIP_DELAY_SECONDS } from '../../common/constants.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { AgentsWindowOpenSource, isAgentsWindowOpenSource } from '../../../../../platform/window/common/window.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../../common/editor.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IWorkbenchAssignmentService } from '../../../../services/assignment/common/assignmentService.js';
import { serializeChatDraft, UnsupportedChatDraftAttachmentError } from '../../common/attachments/chatDraft.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { IAgentSessionsService } from '../../browser/agentSessions/agentSessionsService.js';
import { AgentSessionStatus, isAgentHostAgentSessionItem } from '../../browser/agentSessions/agentSessionsModel.js';
import { isNewConversation } from '../../browser/widget/input/chatInputModelUtils.js';

const OPEN_WORKSPACE_IN_AGENTS_WINDOW_TITLE = localize2('openWorkspaceInAgentsWindow', "Open in Agents");
const OPEN_WORKSPACE_IN_AGENTS_WINDOW_CHAT_TITLE_COMMAND_ID = 'workbench.action.chat.openWorkspaceInAgentsWindow.chatTitle';
const OPEN_WORKSPACE_IN_AGENTS_WINDOW_TITLE_BAR_COMMAND_ID = 'workbench.action.chat.openWorkspaceInAgentsWindow.titleBar';

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

function isDraftWidget(widget: IChatWidget | undefined): widget is IChatWidget {
	const viewModel = widget?.viewModel;
	return !!widget && !!viewModel
		&& widget.location === ChatAgentLocation.Chat
		&& !(isIChatResourceViewContext(widget.viewContext) && (widget.viewContext.isQuickChat || widget.viewContext.isInlineChat))
		&& isNewConversation(viewModel.sessionResource, viewModel.model.hasRequests === false);
}

function isAgentHostDraftWidget(widget: IChatWidget | undefined): widget is IChatWidget {
	const resource = widget?.viewModel?.sessionResource;
	return !!resource && isDraftWidget(widget) && isAgentHostTarget(getChatSessionType(resource));
}

function hasRunningAgentHostSession(service: IAgentSessionsService): boolean {
	return service.model.sessions.some(session => session.status === AgentSessionStatus.InProgress && !session.isArchived() && isAgentHostAgentSessionItem(session));
}

function getDraftHandoffOptions(accessor: ServicesAccessor, sessionResource?: URI, forceTransfer = false, inputUri?: URI): Pick<IOpenAgentsWindowOptions, 'draft' | 'folderUriIsDefault'> {
	if (!forceTransfer && accessor.get(IConfigurationService).getValue<boolean>(ChatConfiguration.OpenInAgentsWindowTransferDraft) !== true) {
		return {};
	}
	const widgets = accessor.get(IChatWidgetService);
	const widget = inputUri ? widgets.getWidgetByInputUri(inputUri) : sessionResource ? widgets.getWidgetBySessionResource(sessionResource) : widgets.lastFocusedWidget;
	if (sessionResource && !isEqual(widget?.viewModel?.sessionResource, sessionResource)) {
		return {};
	}
	return captureDraftHandoffOptions(accessor, widget);
}

function captureDraftHandoffOptions(accessor: ServicesAccessor, widget: IChatWidget | undefined): Pick<IOpenAgentsWindowOptions, 'draft' | 'folderUriIsDefault'> {
	if (!isDraftWidget(widget) || !widget.scopedContextKeyService.contextMatchesRules(ContextKeyExpr.and(OPEN_AGENTS_WINDOW_PRECONDITION, ChatContextKeys.enabled))) {
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

async function openCurrentWorkspaceInAgentsWindow(accessor: ServicesAccessor, source: AgentsWindowOpenSource, sessionResource?: URI, draftOptions?: Pick<IOpenAgentsWindowOptions, 'draft' | 'folderUriIsDefault'>): Promise<void> {
	ensureAgentModeEnabled(accessor.get(IConfigurationService));
	const nativeHostService = accessor.get(INativeHostService);
	const workspaceContextService = accessor.get(IWorkspaceContextService);
	const handoff = draftOptions ?? getDraftHandoffOptions(accessor, sessionResource);
	await nativeHostService.openAgentsWindow({
		folderUri: getInvokingWorkspaceFolder(accessor) ?? workspaceContextService.getWorkspace().folders[0]?.uri,
		source,
		...handoff,
	});
}

function isOpenChatSessionInAgentsWindowOptions(value: unknown): value is { readonly agentsWindowOpenSource: AgentsWindowOpenSource; readonly transferDraft?: boolean } {
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

	async run(accessor: ServicesAccessor, options?: { readonly source?: AgentsWindowOpenSource; readonly sessionResource?: URI; readonly inputUri?: URI }): Promise<void> {
		ensureAgentModeEnabled(accessor.get(IConfigurationService));
		const draftOptions = getDraftHandoffOptions(accessor, options?.sessionResource, false, options?.inputUri);
		await openCurrentWorkspaceInAgentsWindow(accessor, options?.source ?? AgentsWindowOpenSource.CommandPalette, options?.sessionResource, draftOptions);
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
		if (configurationService.getValue<boolean>(ChatConfiguration.OpenInAgentsWindowRevealCurrentSession) === true
			&& sessionResource
			&& !isUntitledChatSession(sessionResource)
			&& isLocalAgentHostTarget(getChatSessionType(sessionResource))) {
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
				when: ContextKeyExpr.and(IsSessionsWindowContext.toNegated(), CONTEXT_ACCESSIBILITY_MODE_ENABLED.toNegated()),
				args: { source: AgentsWindowOpenSource.KeyboardShortcut },
			}, {
				// In screen reader mode, Cmd/Ctrl+Shift+A conflicts with many screen reader keybindings,
				// so require an additional Alt modifier.
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.KeyA,
				weight: KeybindingWeight.WorkbenchContrib,
				when: ContextKeyExpr.and(IsSessionsWindowContext.toNegated(), CONTEXT_ACCESSIBILITY_MODE_ENABLED),
				args: { source: AgentsWindowOpenSource.KeyboardShortcut },
			}],
		});
	}

	async run(accessor: ServicesAccessor, args?: IOpenAgentsWindowOptions): Promise<void> {
		ensureAgentModeEnabled(accessor.get(IConfigurationService));
		const nativeHostService = accessor.get(INativeHostService);
		const draftOptions: Pick<IOpenAgentsWindowOptions, 'draft' | 'folderUriIsDefault'> = !args?.folderUri && !args?.sessionResource && !args?.draft ? getDraftHandoffOptions(accessor) : {};
		const folderUri = !args?.folderUri && !args?.sessionResource
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

		// Hand off a real (persisted, non-untitled) session so the agents window
		// opens that same session (it carries its own workspace). Otherwise fall
		// back to forwarding the workspace folder so the agents window scopes its
		// new-session composer to it.
		const draftOptions = getDraftHandoffOptions(accessor, sessionResource, commandOptions?.transferDraft === true, inputUri);
		const hasRealSession = sessionResource && !isUntitledChatSession(sessionResource) && !draftOptions.draft;
		const folderUri = getInvokingWorkspaceFolder(accessor) ?? workspaceContextService.getWorkspace().folders[0]?.uri;
		await nativeHostService.openAgentsWindow({
			folderUri: !hasRealSession && (draftOptions.draft || folderUri?.scheme === Schemas.file) ? folderUri?.toJSON() : undefined,
			sessionResource: hasRealSession ? sessionResource?.toJSON() : undefined,
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

	constructor(
		action: IAction,
		options: IBaseActionViewItemOptions | undefined,
		@IHoverService private readonly hoverService: IHoverService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
	) {
		super(undefined, action, options);
	}

	override render(container: HTMLElement): void {
		super.render(container);

		container.classList.add('open-in-agents-titlebar-widget');
		container.setAttribute('role', 'button');

		const label = this.action.label;
		const hoverText = this.keybindingService.appendKeybinding(localize('openInAgentsHover', "Open in Agents Window"), OPEN_AGENTS_WINDOW_COMMAND_ID);
		container.setAttribute('aria-label', hoverText);
		this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), container, hoverText));

		const icon = append(container, $('span.open-in-agents-titlebar-widget-icon'));
		icon.setAttribute('aria-hidden', 'true');

		const labelEl = append(container, $('span.open-in-agents-titlebar-widget-label'));
		labelEl.textContent = label;
	}
}

export class OpenWorkspaceInAgentsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.openWorkspaceInAgents.desktop';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IProductService productService: IProductService,
	) {
		super();
		this._register(actionViewItemService.register(MenuId.TitleBarAdjacentCenter, OPEN_WORKSPACE_IN_AGENTS_WINDOW_TITLE_BAR_COMMAND_ID, (action, options) => {
			return instantiationService.createInstance(OpenWorkspaceInAgentsTitleBarWidget, action, options);
		}, undefined));
	}
}

function registerAgentsWindowCopyTreatments(
	titleTreatment: string,
	descriptionTreatment: string,
	logPrefix: string,
	onChange: (title: string | undefined, description: string | undefined) => void,
	assignmentService: IWorkbenchAssignmentService,
	logService: ILogService,
): IDisposable {
	const store = new DisposableStore();
	let treatmentRequest = 0;
	const getTreatmentText = (name: string, value: string | undefined): string | undefined => {
		if (value === undefined || (typeof value === 'string' && value.trim())) {
			return value;
		}
		logService.warn(`[${logPrefix}] Ignoring invalid ${name} treatment`);
		return undefined;
	};
	const update = async (): Promise<void> => {
		const request = ++treatmentRequest;
		let title: string | undefined;
		let description: string | undefined;
		try {
			[title, description] = await Promise.all([
				assignmentService.getTreatment<string>(titleTreatment),
				assignmentService.getTreatment<string>(descriptionTreatment),
			]);
		} catch (error) {
			if (!store.isDisposed && request === treatmentRequest && !isCancellationError(error)) {
				logService.warn(`[${logPrefix}] Failed to resolve banner copy treatments`, error);
			}
			return;
		}
		if (store.isDisposed || request !== treatmentRequest) {
			return;
		}
		onChange(getTreatmentText(titleTreatment, title), getTreatmentText(descriptionTreatment, description));
	};
	store.add(assignmentService.onDidRefetchAssignments(() => void update()));
	void update();
	return store;
}

/**
 * Display modes for the agents-window handoff input tip, exposed via the
 * {@link ChatConfiguration.AgentsHandoffTipMode} setting.
 */
export const enum AgentsHandoffTipMode {
	/** Don't show the tip. */
	Hidden = 'hidden',
	/** Show the tip with the default message + description. */
	Default = 'default',
	/** Show the tip with the alternate "Free with your Copilot" framing. */
	Custom = 'custom',
}

type AgentsHandoffTipActionEvent = {
	action: string;
	mode: string;
	sessionType: string;
};

type AgentsHandoffTipActionClassification = {
	action: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Which tip affordance the user activated: open, dismiss, or mute.' };
	mode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The configured tip mode active when the tip was clicked (default, custom).' };
	sessionType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The chat session type / agent harness being handed off (e.g. copilot-cli, agent-host-copilot).' };
	owner: 'justschen';
	comment: 'Tracks user interactions (open, dismiss, mute) with the agents-window handoff input tip to measure engagement across wording variants.';
};

/**
 * Offers to continue running agent-host sessions in the Agents Window after the configured delay.
 * Also offers Agents when local Copilot cannot run in an empty workspace.
 */
export class AgentsHandoffInputTipContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentsHandoffInputTip';

	private static readonly NOTIFICATION_ID = 'chat.agentsHandoff.openInAgentsWindow';
	private static readonly TITLE_TREATMENT = 'chatAgentsHandoffTipTitle';
	private static readonly DESCRIPTION_TREATMENT = 'chatAgentsHandoffTipDescription';

	/**
	 * Dedicated command backing the tip's action button. Lets us attach
	 * mode + harness telemetry to the exact tip click (the title-bar menu
	 * entry runs {@link OpenChatSessionInAgentsWindowAction} directly and is
	 * intentionally not tracked here).
	 */
	private static readonly TIP_OPEN_COMMAND_ID = 'workbench.action.chat.agentsHandoffTip.open';

	/**
	 * Dedicated command backing the tip's "Don't Show Again" button. Closes the
	 * tip and flips {@link ChatConfiguration.AgentsHandoffTipMode} to `hidden`
	 * so it never shows again.
	 */
	private static readonly TIP_MUTE_COMMAND_ID = 'workbench.action.chat.agentsHandoffTip.mute';

	/** Pseudo-key used as the {@link _lastPostedFor} value for the empty-workspace tip (no real session URI exists). */
	private static readonly EMPTY_WORKSPACE_KEY = '__empty-workspace__';

	/** The key (session URI or {@link EMPTY_WORKSPACE_KEY}) we last posted a notification for. Used to avoid redundantly re-posting the tip when the same state is re-evaluated. */
	private _lastPostedFor: string | undefined;
	private _lastPostedMessage: string | undefined;
	private _lastPostedDescription: string | undefined;
	private _titleTreatment: string | undefined;
	private _descriptionTreatment: string | undefined;
	private readonly _handoffTimer = this._register(new MutableDisposable());
	private _handoffDelayMs = DEFAULT_AGENTS_HANDOFF_TIP_DELAY_SECONDS * 1000;

	/** The session type (agent harness) of the currently posted tip, for telemetry. */
	private _lastPostedSessionType: string | undefined;

	/**
	 * Set once the user dismisses (X) or opens the tip. Suppresses the tip for
	 * the rest of this window's lifetime — intentionally in-memory only, so it
	 * shows again the next time VS Code is reopened.
	 */
	private _dismissedForWindow = false;

	constructor(
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IChatInputNotificationService private readonly _notificationService: IChatInputNotificationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IAgentSessionsService private readonly _agentSessionsService: IAgentSessionsService,
		@IWorkbenchAssignmentService assignmentService: IWorkbenchAssignmentService,
		@ILogService logService: ILogService,
	) {
		super();

		const updateDelay = () => {
			const delay = this._configurationService.getValue<number>(ChatConfiguration.AgentsHandoffTipDelaySeconds);
			if (typeof delay === 'number' && delay >= 0 && Number.isFinite(delay * 1000)) {
				this._handoffDelayMs = delay * 1000;
			} else {
				if (delay !== undefined) {
					logService.warn('[AgentsHandoffTip] Invalid delay; using the default delay.');
				}
				this._handoffDelayMs = DEFAULT_AGENTS_HANDOFF_TIP_DELAY_SECONDS * 1000;
			}
		};
		updateDelay();

		this._register(CommandsRegistry.registerCommand(AgentsHandoffInputTipContribution.TIP_OPEN_COMMAND_ID, (accessor, source: AgentsWindowOpenSource, ...args: unknown[]) => {
			this._logTipAction('open');
			// Opening the tip counts as handling it: don't show it again this window.
			this._dismissForWindow();
			return accessor.get(ICommandService).executeCommand(OpenChatSessionInAgentsWindowAction.ID, { agentsWindowOpenSource: source }, ...args);
		}));

		this._register(CommandsRegistry.registerCommand(AgentsHandoffInputTipContribution.TIP_MUTE_COMMAND_ID, () => {
			this._logTipAction('mute');
			// Tear down the visible tip first (uses the still-valid `_lastPostedFor`),
			// then persist `hidden` so it never shows again.
			this._dismissForWindow();
			return this._configurationService.updateValue(ChatConfiguration.AgentsHandoffTipMode, AgentsHandoffTipMode.Hidden);
		}));

		this._register(this._chatWidgetService.onDidChangeFocusedSession(() => this._update()));
		this._register(this._chatWidgetService.onDidAddWidget(() => this._update()));
		this._register(this._agentSessionsService.model.onDidChangeSessions(() => this._update()));
		this._register(contextKeyService.onDidChangeContext(() => this._update()));
		this._register(this._workspaceContextService.onDidChangeWorkbenchState(() => this._update()));
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.AgentsHandoffTipDelaySeconds)) {
				updateDelay();
				this._update();
			}
			if (e.affectsConfiguration(ChatConfiguration.AgentsHandoffTipMode) || e.affectsConfiguration(ChatConfiguration.AgentsParallelWorkBannerEnabled)) {
				// Mode changed: force a re-post so the description swaps or the
				// tip appears/disappears immediately.
				this._notificationService.deleteNotification(AgentsHandoffInputTipContribution.NOTIFICATION_ID);
				this._lastPostedFor = undefined;
				this._update();
			}
		}));
		this._register(this._notificationService.onDidDismiss(id => {
			if (id !== AgentsHandoffInputTipContribution.NOTIFICATION_ID) {
				return;
			}
			this._logTipAction('dismiss');
			this._dismissForWindow();
		}));
		this._register(registerAgentsWindowCopyTreatments(
			AgentsHandoffInputTipContribution.TITLE_TREATMENT,
			AgentsHandoffInputTipContribution.DESCRIPTION_TREATMENT,
			'AgentsHandoffTip',
			(title, description) => {
				this._titleTreatment = title;
				this._descriptionTreatment = description;
				this._update();
			},
			assignmentService,
			logService,
		));

		const focusedModel = observableFromEvent(this, this._chatWidgetService.onDidChangeFocusedSession, () => this._chatWidgetService.lastFocusedWidget?.viewModel?.model);
		this._register(autorun(reader => {
			const model = focusedModel.read(reader);
			if (model) {
				model.requestInProgress.read(reader);
				reader.store.add(model.onDidChange(() => this._update()));
				reader.store.add(model.onDidChangePendingRequests(() => this._update()));
			}
			this._update();
		}));
	}

	/** Log a user interaction (open, dismiss, mute) with the handoff tip. */
	private _logTipAction(action: 'open' | 'dismiss' | 'mute'): void {
		this._telemetryService.publicLog2<AgentsHandoffTipActionEvent, AgentsHandoffTipActionClassification>('chat.agentsHandoffTip.action', {
			action,
			mode: this._getMode(),
			sessionType: this._lastPostedSessionType ?? '',
		});
	}

	private _getMode(): AgentsHandoffTipMode {
		const value = this._configurationService.getValue<string>(ChatConfiguration.AgentsHandoffTipMode);
		switch (value) {
			case AgentsHandoffTipMode.Hidden:
			case AgentsHandoffTipMode.Custom:
				return value;
			default:
				return AgentsHandoffTipMode.Default;
		}
	}

	private _isReadyForHandoff(model: IChatModel): boolean {
		if (!model.requestInProgress.get()) {
			return false;
		}
		let lastMessageTime = model.getRequests().findLast(request => !request.isSystemInitiated)?.timestamp;
		for (const { request } of model.getPendingRequests()) {
			if (!request.isSystemInitiated) {
				lastMessageTime = Math.max(lastMessageTime ?? request.timestamp, request.timestamp);
			}
		}
		if (lastMessageTime === undefined) {
			return false;
		}
		const remaining = lastMessageTime + this._handoffDelayMs - Date.now();
		if (remaining > 0) {
			this._handoffTimer.value = disposableLongTimeout(() => this._update(), remaining);
			return false;
		}
		return true;
	}

	private _update(): void {
		if (this._store.isDisposed) {
			return;
		}
		this._handoffTimer.clear();
		const mode = this._getMode();

		// Suppress the tip entirely when the mode hides it, or once the user has
		// dismissed/opened it for this window.
		if (mode === AgentsHandoffTipMode.Hidden || this._dismissedForWindow) {
			if (this._lastPostedFor) {
				this._notificationService.deleteNotification(AgentsHandoffInputTipContribution.NOTIFICATION_ID);
				this._lastPostedFor = undefined;
			}
			return;
		}

		const widget = this._chatWidgetService.lastFocusedWidget;
		const model = widget?.viewModel?.model;
		const sessionResource = widget?.viewModel?.sessionResource;
		const resourceSessionType = sessionResource ? getChatSessionType(sessionResource) : undefined;
		const preconditionMet = widget?.scopedContextKeyService.contextMatchesRules(OPEN_AGENTS_WINDOW_PRECONDITION) ?? false;

		const eligible = preconditionMet
			&& !!sessionResource
			&& !!resourceSessionType
			&& isAgentHostTarget(resourceSessionType)
			&& !isUntitledChatSession(sessionResource)
			&& !!model
			&& this._isReadyForHandoff(model);

		// Empty-workspace path: no usable session yet (CLI / agent-host local
		// can't run here, and picking the mode only creates a placeholder
		// untitled session that we shouldn't try to hand off). Gate on the
		// widget's current session type so we don't churn `_lastPostedFor`
		// while the user is on a non-eligible mode (Claude, Cloud, …) — the
		// notification widget's own `sessionTypes` filter would still hide
		// the rendered banner, but we don't want to post-then-hide.
		const widgetSessionType = widget?.scopedContextKeyService.getContextKeyValue<string>(ChatContextKeys.chatSessionType.key);
		const isEmptyWorkspace = this._workspaceContextService.getWorkbenchState() === WorkbenchState.EMPTY;
		const emptyWorkspaceEligible = preconditionMet
			&& isEmptyWorkspace
			&& (!sessionResource || isUntitledChatSession(sessionResource))
			&& widgetSessionType === SessionType.AgentHostCopilot
			&& !(this._configurationService.getValue<boolean>(ChatConfiguration.AgentsParallelWorkBannerEnabled) && hasRunningAgentHostSession(this._agentSessionsService));

		if (!eligible && !emptyWorkspaceEligible) {
			if (this._lastPostedFor) {
				this._notificationService.deleteNotification(AgentsHandoffInputTipContribution.NOTIFICATION_ID);
				this._lastPostedFor = undefined;
			}
			return;
		}

		const key = eligible && sessionResource
			? sessionResource.toString()
			: AgentsHandoffInputTipContribution.EMPTY_WORKSPACE_KEY;

		// Only forward a real (non-untitled) session resource. In the empty
		// workspace case the picker may have created a placeholder untitled
		// session that we shouldn't try to restore on the other side.
		const commandArgs: unknown[] = eligible && sessionResource
			? [AgentsWindowOpenSource.CurrentChatHandoff, sessionResource]
			: [AgentsWindowOpenSource.EmptyWorkspaceCurrentChatHandoff];

		// Empty-workspace + local Copilot: the local agent host can't
		// run without a folder, so frame the tip as the path forward rather
		// than a generic "continue in agents" upsell.
		const useEmptyWorkspaceCopy = emptyWorkspaceEligible && !eligible;
		const message = this._titleTreatment ?? (useEmptyWorkspaceCopy
			? localize('chat.agentsHandoff.tip.emptyWorkspace.message', "Copilot isn't available without an open folder")
			: localize('chat.agentsHandoff.tip.message', "Continue this session in the Agents Window"));
		const description = this._descriptionTreatment ?? (useEmptyWorkspaceCopy
			? localize('chat.agentsHandoff.tip.emptyWorkspace.description', "Open the Agents Window to start a Copilot session.")
			: mode === AgentsHandoffTipMode.Custom
				? localize('chat.agentsHandoff.tip.description.copilot', "Free with your Copilot plan — get a dedicated, multi-pane view alongside your workspace.")
				: localize('chat.agentsHandoff.tip.description', "Get a dedicated, multi-pane view alongside your workspace."));
		const actionLabel = useEmptyWorkspaceCopy
			? localize('chat.agentsHandoff.tip.action', "Open in Agents Window")
			: mode === AgentsHandoffTipMode.Custom
				? localize('chat.agentsHandoff.tip.action.custom', "Give your agent more room?")
				: localize('chat.agentsHandoff.tip.action.default', "Continue in Agents Window");

		// Reposting clears notification dismissal, so only do it when the session or copy changes.
		if (this._lastPostedFor === key && this._lastPostedMessage === message && this._lastPostedDescription === description) {
			return;
		}
		this._lastPostedFor = key;
		this._lastPostedMessage = message;
		this._lastPostedDescription = description;
		this._lastPostedSessionType = eligible ? resourceSessionType : widgetSessionType;

		this._notificationService.setNotification({
			id: AgentsHandoffInputTipContribution.NOTIFICATION_ID,
			severity: ChatInputNotificationSeverity.Info,
			message,
			description,
			actions: [
				{
					kind: ChatInputNotificationActionKind.Command,
					label: actionLabel,
					commandId: AgentsHandoffInputTipContribution.TIP_OPEN_COMMAND_ID,
					commandArgs,
				},
			],
			dismissible: true,
			autoDismissOnMessage: false,
			mute: {
				commandId: AgentsHandoffInputTipContribution.TIP_MUTE_COMMAND_ID,
				tooltip: localize('chat.agentsHandoff.tip.mute', "Don't Show Again"),
			},
			sessionTypes: eligible ? [resourceSessionType] : [SessionType.AgentHostCopilot],
			sessionResources: eligible ? [sessionResource] : undefined,
		});
	}

	/**
	 * Mark the tip as handled (dismissed or opened) for the rest of this
	 * window's lifetime and tear down any currently posted notification.
	 */
	private _dismissForWindow(): void {
		if (this._dismissedForWindow) {
			return;
		}
		this._dismissedForWindow = true;
		this._update();
	}

	override dispose(): void {
		super.dispose();
		this._lastPostedFor = undefined;
		this._notificationService.deleteNotification(AgentsHandoffInputTipContribution.NOTIFICATION_ID);
	}
}

export class AgentsParallelWorkContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.agentsParallelWork';
	private static readonly NOTIFICATION_ID = 'chat.agentsParallelWork';
	private static readonly OPEN_COMMAND_ID = 'workbench.action.chat.agentsParallelWork.open';
	private static readonly IGNORE_COMMAND_ID = 'workbench.action.chat.agentsParallelWork.ignore';
	private static readonly TITLE_TREATMENT = 'chatAgentsParallelWorkBannerTitle';
	private static readonly DESCRIPTION_TREATMENT = 'chatAgentsParallelWorkBannerDescription';

	private readonly _seen = new ResourceSet();
	private readonly _eligible = new ResourceSet();
	/** Dismissals last only until this window reloads. */
	private readonly _dismissed = new ResourceSet();
	private readonly _recentWidgets = new Set<IChatWidget>();
	private _titleTreatment: string | undefined;
	private _descriptionTreatment: string | undefined;
	private _updating = false;
	private _posted: { readonly widget: IChatWidget; readonly resource: URI; readonly inputUri: URI; readonly title: string; readonly description: string } | undefined;

	constructor(
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IAgentSessionsService private readonly _agentSessionsService: IAgentSessionsService,
		@IChatInputNotificationService private readonly _notificationService: IChatInputNotificationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IWorkbenchAssignmentService assignmentService: IWorkbenchAssignmentService,
		@ILogService logService: ILogService,
	) {
		super();
		this._register(CommandsRegistry.registerCommand(AgentsParallelWorkContribution.OPEN_COMMAND_ID, (accessor, inputUri: URI, resource: URI) => {
			const widget = this._chatWidgetService.getWidgetByInputUri(inputUri);
			if (!isAgentHostDraftWidget(widget) || this._posted?.widget !== widget
				|| !isEqual(this._posted.resource, resource) || !isEqual(widget.viewModel?.sessionResource, resource)
				|| this._configurationService.getValue<boolean>(ChatConfiguration.AgentsParallelWorkBannerEnabled) !== true
				|| !widget.scopedContextKeyService.contextMatchesRules(ContextKeyExpr.and(OPEN_AGENTS_WINDOW_PRECONDITION, ChatContextKeys.enabled))) {
				return;
			}
			const draft = captureDraftHandoffOptions(accessor, widget);
			this._dismissChat(resource);
			return openCurrentWorkspaceInAgentsWindow(accessor, AgentsWindowOpenSource.ParallelWorkEmptyChatHandoff, resource, draft);
		}));
		this._register(CommandsRegistry.registerCommand(AgentsParallelWorkContribution.IGNORE_COMMAND_ID, () => {
			if (this._posted) {
				this._dismissChat(this._posted.resource);
			}
			return this._configurationService.updateValue(ChatConfiguration.AgentsParallelWorkBannerEnabled, false, ConfigurationTarget.USER);
		}));
		this._register(this._chatWidgetService.onDidChangeFocusedSession(() => this._onSessionChanged()));
		this._register(this._chatWidgetService.onDidAddWidget(() => this._onSessionChanged()));
		this._register(this._chatWidgetService.onDidChangeWidgetVisibility(() => this._update()));
		this._register(this._chatWidgetService.onDidRemoveWidget(widget => {
			this._recentWidgets.delete(widget);
			this._update();
		}));
		this._register(this._agentSessionsService.model.onDidChangeSessions(() => this._update()));
		this._register(contextKeyService.onDidChangeContext(() => this._update()));
		this._register(this._configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(ChatConfiguration.AgentsParallelWorkBannerEnabled)) {
				this._update();
			}
		}));
		this._register(registerAgentsWindowCopyTreatments(
			AgentsParallelWorkContribution.TITLE_TREATMENT,
			AgentsParallelWorkContribution.DESCRIPTION_TREATMENT,
			'AgentsParallelWork',
			(title, description) => {
				this._titleTreatment = title;
				this._descriptionTreatment = description;
				this._update();
			},
			assignmentService,
			logService,
		));
		this._onSessionChanged();
	}

	private _dismissChat(resource: URI): void {
		if (this._store.isDisposed || this._dismissed.has(resource)) {
			return;
		}
		this._dismissed.add(resource);
		this._update();
	}

	private _onSessionChanged(): void {
		if (this._store.isDisposed) {
			return;
		}
		const widget = this._chatWidgetService.lastFocusedWidget;
		if (widget) {
			this._recentWidgets.delete(widget);
			this._recentWidgets.add(widget);
		}
		const resource = isAgentHostDraftWidget(widget) ? widget.viewModel?.sessionResource : undefined;
		if (resource && !this._seen.has(resource)) {
			this._seen.add(resource);
			if (hasRunningAgentHostSession(this._agentSessionsService)) {
				this._eligible.add(resource);
			}
		}
		this._update();
	}

	private _isEligibleOwner(widget: IChatWidget): boolean {
		const resource = isAgentHostDraftWidget(widget) ? widget.viewModel?.sessionResource : undefined;
		return widget.visible && !!resource && this._eligible.has(resource) && !this._dismissed.has(resource)
			&& widget.scopedContextKeyService.contextMatchesRules(ContextKeyExpr.and(OPEN_AGENTS_WINDOW_PRECONDITION, ChatContextKeys.enabled));
	}

	private _getOwner(): IChatWidget | undefined {
		const widgets = this._chatWidgetService.getAllWidgets();
		const focused = this._chatWidgetService.lastFocusedWidget;
		if (focused && widgets.includes(focused) && focused.visible) {
			return this._isEligibleOwner(focused) ? focused : undefined;
		}
		return [...this._recentWidgets].reverse().find(widget => widgets.includes(widget) && this._isEligibleOwner(widget));
	}

	private _update(): void {
		if (this._updating || this._store.isDisposed) {
			return;
		}
		this._updating = true;
		try {
			this._updateOwner();
		} finally {
			this._updating = false;
		}
	}

	private _updateOwner(): void {
		const widget = this._configurationService.getValue<boolean>(ChatConfiguration.AgentsParallelWorkBannerEnabled) === true
			&& hasRunningAgentHostSession(this._agentSessionsService) ? this._getOwner() : undefined;
		const resource = widget?.viewModel?.sessionResource;
		const inputUri = widget?.inputPart?.inputUri;
		if (!widget || !resource || !inputUri) {
			if (this._posted) {
				this._posted = undefined;
				this._notificationService.deleteNotification(AgentsParallelWorkContribution.NOTIFICATION_ID);
			}
			return;
		}
		const title = this._titleTreatment ?? localize('chat.agentsParallelWorkBanner.defaultTitle', "Run agents side by side");
		const description = this._descriptionTreatment ?? localize('chat.agentsParallelWorkBanner.defaultDescription', "Run multiple tasks in the Agents Window, in one workspace or across projects.");
		if (this._posted?.widget === widget && isEqual(this._posted.inputUri, inputUri) && isEqual(this._posted.resource, resource) && this._posted.title === title && this._posted.description === description) {
			return;
		}
		const previous = this._posted;
		const posted = { widget, resource, inputUri, title, description };
		this._posted = posted;
		if (previous && (previous.widget !== widget || !isEqual(previous.inputUri, inputUri))) {
			// Revoke the old render before publishing its successor, retaining announcement de-duplication.
			this._notificationService.refresh();
		}
		this._notificationService.setNotification({
			id: AgentsParallelWorkContribution.NOTIFICATION_ID,
			inputUri: posted.inputUri,
			severity: ChatInputNotificationSeverity.Info,
			message: title,
			description,
			sessionResources: [resource],
			when: context => this._posted === posted && !context.sessionStarted && !context.isTransientChat,
			dismissible: true,
			onDismiss: () => this._dismissChat(resource),
			autoDismissOnMessage: true,
			actions: [{
				kind: ChatInputNotificationActionKind.Command,
				label: localize('agentsParallelWork.open', "Open Agents Window"),
				commandId: AgentsParallelWorkContribution.OPEN_COMMAND_ID,
				commandArgs: [posted.inputUri, resource],
				primary: true,
				keepOpen: true,
			}, {
				kind: ChatInputNotificationActionKind.Command,
				label: localize('agentsParallelWork.ignore', "Ignore"),
				tooltip: localize('agentsParallelWork.ignoreTooltip', "Don't Show Again"),
				commandId: AgentsParallelWorkContribution.IGNORE_COMMAND_ID,
				primary: false,
				keepOpen: true,
			}],
		});
	}

	override dispose(): void {
		super.dispose();
		this._posted = undefined;
		this._recentWidgets.clear();
		this._seen.clear();
		this._eligible.clear();
		this._dismissed.clear();
		this._notificationService.deleteNotification(AgentsParallelWorkContribution.NOTIFICATION_ID);
	}
}
