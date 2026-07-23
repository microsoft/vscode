/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import './media/openInAgents.css';
import { $, append } from '../../../../../base/browser/dom.js';
import { BaseActionViewItem, IBaseActionViewItemOptions } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IAction } from '../../../../../base/common/actions.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
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
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI, UriComponents } from '../../../../../base/common/uri.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../../platform/workspace/common/workspace.js';
import { IsSessionsWindowContext } from '../../../../common/contextkeys.js';
import { ToggleTitleBarConfigAction } from '../../../../browser/parts/titlebar/titlebarActions.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { CHAT_CATEGORY } from '../../browser/actions/chatActions.js';
import { IChatWidgetService } from '../../browser/chat.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { SessionType } from '../../common/chatSessionsService.js';
import { IChatViewTitleActionContext } from '../../common/actions/chatActions.js';
import { getChatSessionType, isUntitledChatSession } from '../../common/model/chatUri.js';
import { ChatInputNotificationActionKind, ChatInputNotificationSeverity, IChatInputNotificationService } from '../../browser/widget/input/chatInputNotificationService.js';
import { OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID, OPEN_AGENTS_WINDOW_PRECONDITION, OPEN_AGENTS_WINDOW_COMMAND_ID, ChatConfiguration } from '../../common/constants.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';

export class OpenWorkspaceInAgentsWindowAction extends Action2 {
	constructor() {
		super({
			id: OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID,
			title: localize2('openWorkspaceInAgentsWindow', "Open in Agents"),
			category: CHAT_CATEGORY,
			precondition: OPEN_AGENTS_WINDOW_PRECONDITION,
			f1: true,
			menu: [{
				id: MenuId.ChatTitleBarMenu,
				group: 'c_sessions',
				order: 1,
				when: OPEN_AGENTS_WINDOW_PRECONDITION,
			}, {
				id: MenuId.TitleBarAdjacentCenter,
				order: -1000,
				when: ContextKeyExpr.and(
					OPEN_AGENTS_WINDOW_PRECONDITION,
					ContextKeyExpr.notEquals(`config.${ChatConfiguration.TitleBarOpenInAgentsWindowEnabled}`, false),
				),
			}]
		});
	}

	async run(accessor: ServicesAccessor) {
		const nativeHostService = accessor.get(INativeHostService);
		const workspaceContextService = accessor.get(IWorkspaceContextService);
		const folderUri = workspaceContextService.getWorkspace().folders[0]?.uri;
		await nativeHostService.openAgentsWindow({ folderUri: folderUri?.scheme === Schemas.file ? folderUri : undefined });
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
			}, {
				// In screen reader mode, Cmd/Ctrl+Shift+A conflicts with many screen reader keybindings,
				// so require an additional Alt modifier.
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.KeyA,
				weight: KeybindingWeight.WorkbenchContrib,
				when: ContextKeyExpr.and(IsSessionsWindowContext.toNegated(), CONTEXT_ACCESSIBILITY_MODE_ENABLED),
			}],
		});
	}

	async run(accessor: ServicesAccessor, args?: { folderUri?: UriComponents; sessionResource?: UriComponents }) {
		const nativeHostService = accessor.get(INativeHostService);
		await nativeHostService.openAgentsWindow(args);
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
		const chatWidgetService = accessor.get(IChatWidgetService);
		const nativeHostService = accessor.get(INativeHostService);
		const workspaceContextService = accessor.get(IWorkspaceContextService);

		let sessionResource: URI | undefined;
		const arg = rest[0];
		if (URI.isUri(arg)) {
			sessionResource = arg;
		} else if (arg && typeof arg === 'object') {
			const ctx = arg as IChatViewTitleActionContext;
			if (URI.isUri(ctx.sessionResource)) {
				sessionResource = ctx.sessionResource;
			}
		}
		if (!sessionResource) {
			sessionResource = chatWidgetService.lastFocusedWidget?.viewModel?.sessionResource;
		}

		// Hand off a real (persisted, non-untitled) session so the agents window
		// opens that same session (it carries its own workspace). Otherwise fall
		// back to forwarding the workspace folder so the agents window scopes its
		// new-session composer to it.
		const hasRealSession = sessionResource && !isUntitledChatSession(sessionResource);
		const folderUri = workspaceContextService.getWorkspace().folders[0]?.uri;
		await nativeHostService.openAgentsWindow({
			folderUri: !hasRealSession && folderUri?.scheme === Schemas.file ? folderUri.toJSON() : undefined,
			sessionResource: hasRealSession ? sessionResource?.toJSON() : undefined,
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
		this._register(actionViewItemService.register(MenuId.TitleBarAdjacentCenter, OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID, (action, options) => {
			return instantiationService.createInstance(OpenWorkspaceInAgentsTitleBarWidget, action, options);
		}, undefined));
	}
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
 * Posts a tip notification above the chat input whenever the focused chat
 * widget is showing a contributed session (Copilot CLI, Cloud, Claude, etc.)
 * that the Agents Window can render directly. The notification provides a
 * one-click button to hand off the current session to the Agents Window.
 */
export class AgentsHandoffInputTipContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentsHandoffInputTip';

	private static readonly NOTIFICATION_ID = 'chat.agentsHandoff.openInAgentsWindow';

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

	/** Session types eligible for the handoff tip — the same set the Agents window can render directly. */
	private static readonly ELIGIBLE_SESSION_TYPES: ReadonlySet<string> = new Set([SessionType.CopilotCLI, SessionType.AgentHostCopilot]);

	/** Pseudo-key used as the {@link _lastPostedFor} value for the empty-workspace tip (no real session URI exists). */
	private static readonly EMPTY_WORKSPACE_KEY = '__empty-workspace__';

	/** The key (session URI or {@link EMPTY_WORKSPACE_KEY}) we last posted a notification for. Used to avoid redundantly re-posting the tip when the same state is re-evaluated. */
	private _lastPostedFor: string | undefined;

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
	) {
		super();

		this._register(CommandsRegistry.registerCommand(AgentsHandoffInputTipContribution.TIP_OPEN_COMMAND_ID, (accessor, ...args) => {
			this._logTipAction('open');
			// Opening the tip counts as handling it: don't show it again this window.
			this._dismissForWindow();
			return accessor.get(ICommandService).executeCommand(OpenChatSessionInAgentsWindowAction.ID, ...args);
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
		this._register(contextKeyService.onDidChangeContext(() => this._update()));
		this._register(this._workspaceContextService.onDidChangeWorkbenchState(() => this._update()));
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.AgentsHandoffTipMode)) {
				// Mode changed: force a re-post so the description swaps or the
				// tip appears/disappears immediately.
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

		this._update();
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

	private _update(): void {
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
		const sessionResource = widget?.viewModel?.sessionResource;
		const resourceSessionType = sessionResource ? getChatSessionType(sessionResource) : undefined;
		const preconditionMet = widget?.scopedContextKeyService.contextMatchesRules(OPEN_AGENTS_WINDOW_PRECONDITION) ?? false;

		// Existing-session path: gate on the URI-derived session type so we
		// don't post the tip for non-eligible session kinds (Copilot Cloud,
		// local, etc.). The notification widget also filters by
		// `sessionTypes`, but we want to avoid even posting when the URI
		// already tells us this isn't a handoff target.
		const eligible = preconditionMet
			&& !!sessionResource
			&& !!resourceSessionType
			&& AgentsHandoffInputTipContribution.ELIGIBLE_SESSION_TYPES.has(resourceSessionType)
			&& !isUntitledChatSession(sessionResource);

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
			&& widgetSessionType === SessionType.AgentHostCopilot;

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

		// Only call setNotification when the target session changes. Re-calling
		// setNotification clears the user's dismissal, which would make the
		// dismiss button effectively a no-op when the context key service
		// fires repeated change events for the same session.
		if (this._lastPostedFor === key) {
			return;
		}
		this._lastPostedFor = key;

		// Record the agent harness (session type) of the posted tip for click telemetry.
		this._lastPostedSessionType = eligible ? resourceSessionType : widgetSessionType;

		// Only forward a real (non-untitled) session resource. In the empty
		// workspace case the picker may have created a placeholder untitled
		// session that we shouldn't try to restore on the other side.
		const commandArgs: unknown[] = eligible && sessionResource ? [sessionResource] : [];

		// Empty-workspace + local Copilot CLI: the local agent host can't
		// run without a folder, so frame the tip as the path forward rather
		// than a generic "continue in agents" upsell.
		const useEmptyWorkspaceCopy = emptyWorkspaceEligible && !eligible;
		const message = useEmptyWorkspaceCopy
			? localize('chat.agentsHandoff.tip.emptyWorkspace.message', "Copilot CLI [Agent Host] isn't available without an open folder")
			: localize('chat.agentsHandoff.tip.message', "Continue this session in the Agents Window");
		const description = useEmptyWorkspaceCopy
			? localize('chat.agentsHandoff.tip.emptyWorkspace.description', "Open the Agents Window to start a Copilot CLI session.")
			: mode === AgentsHandoffTipMode.Custom
				? localize('chat.agentsHandoff.tip.description.copilot', "Free with your Copilot plan — get a dedicated, multi-pane view alongside your workspace.")
				: localize('chat.agentsHandoff.tip.description', "Get a dedicated, multi-pane view alongside your workspace.");
		const actionLabel = useEmptyWorkspaceCopy
			? localize('chat.agentsHandoff.tip.action', "Open in Agents Window")
			: mode === AgentsHandoffTipMode.Custom
				? localize('chat.agentsHandoff.tip.action.custom', "Give your agent more room?")
				: localize('chat.agentsHandoff.tip.action.default', "Continue in Agents Window");

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
			sessionTypes: useEmptyWorkspaceCopy
				? [SessionType.AgentHostCopilot]
				: Array.from(AgentsHandoffInputTipContribution.ELIGIBLE_SESSION_TYPES),
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
}
