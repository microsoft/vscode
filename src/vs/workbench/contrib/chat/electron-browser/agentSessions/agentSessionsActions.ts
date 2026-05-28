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
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI, UriComponents } from '../../../../../base/common/uri.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../../platform/workspace/common/workspace.js';
import { IsSessionsWindowContext } from '../../../../common/contextkeys.js';
import { TitleBarLeadingActionsGroup } from '../../../../browser/parts/titlebar/titlebarActions.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { CHAT_CATEGORY } from '../../browser/actions/chatActions.js';
import { IChatWidgetService } from '../../browser/chat.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { SessionType } from '../../common/chatSessionsService.js';
import { IChatViewTitleActionContext } from '../../common/actions/chatActions.js';
import { getChatSessionType, isUntitledChatSession } from '../../common/model/chatUri.js';
import { ChatInputNotificationSeverity, IChatInputNotificationService } from '../../browser/widget/input/chatInputNotificationService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID, OPEN_AGENTS_WINDOW_PRECONDITION, OPEN_AGENTS_WINDOW_COMMAND_ID } from '../../common/constants.js';

// Provider id for the local agent host. Duplicated from
// `vs/sessions/common/agentHostSessionsProvider.LOCAL_AGENT_HOST_PROVIDER_ID`
// because the workbench layer cannot import from `vs/sessions`. The string is
// part of the handoff IPC wire protocol so both sides must keep it in sync.
const LOCAL_AGENT_HOST_PROVIDER_ID = 'local-agent-host';

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
				id: MenuId.TitleBar,
				group: TitleBarLeadingActionsGroup,
				order: -1000,
				when: OPEN_AGENTS_WINDOW_PRECONDITION,
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

	async run(accessor: ServicesAccessor, args?: { folderUri?: UriComponents; initialQuery?: string; sessionResource?: UriComponents }) {
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

		// No real session URI to hand off (empty-workspace path triggered
		// from the input tip): pre-seed the agents window's session-type
		// picker so it lands on Copilot CLI [Local].
		let preferredSessionType: { providerId?: string; sessionTypeId: string } | undefined;
		const hasRealSession = sessionResource && !isUntitledChatSession(sessionResource);
		if (!hasRealSession) {
			preferredSessionType = { providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionTypeId: SessionType.CopilotCLI };
		}

		const folderUri = workspaceContextService.getWorkspace().folders[0]?.uri;
		await nativeHostService.openAgentsWindow({
			folderUri: folderUri?.scheme === Schemas.file ? folderUri.toJSON() : undefined,
			sessionResource: hasRealSession ? sessionResource?.toJSON() : undefined,
			preferredSessionType,
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
	) {
		super(undefined, action, options);
	}

	override render(container: HTMLElement): void {
		super.render(container);

		container.classList.add('open-in-agents-titlebar-widget');
		container.setAttribute('role', 'button');

		const label = this.action.label;
		const hoverText = localize('openInAgentsHover', "Open in Agents Window");
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
		this._register(actionViewItemService.register(MenuId.TitleBar, OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID, (action, options) => {
			return instantiationService.createInstance(OpenWorkspaceInAgentsTitleBarWidget, action, options);
		}, undefined));
	}
}

/**
 * Posts a tip notification above the chat input whenever the focused chat
 * widget is showing a contributed session (Copilot CLI, Cloud, Claude, etc.)
 * that the Agents Window can render directly. The notification provides a
 * one-click button to hand off the current session to the Agents Window.
 */
export class AgentsHandoffInputTipContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentsHandoffInputTip';

	private static readonly NOTIFICATION_ID = 'chat.agentsHandoff.openInAgentsWindow';

	/** Session types eligible for the handoff tip — the same set the Agents window can render directly. */
	private static readonly ELIGIBLE_SESSION_TYPES: ReadonlySet<string> = new Set([SessionType.CopilotCLI, SessionType.AgentHostCopilot]);

	/**
	 * Storage key for the dismissed-sessions list. WORKSPACE scope so a user's
	 * dismissal in one workspace doesn't permanently silence the tip across
	 * all of their workspaces. The empty-workspace dismissal lives under the
	 * shared key {@link EMPTY_WORKSPACE_KEY} and is itself scoped per
	 * empty-workspace window.
	 */
	private static readonly DISMISSED_STORAGE_KEY = 'chat.agentsHandoff.tip.dismissedSessions';

	/** Pseudo-key tracking dismissal of the empty-workspace tip (no real session URI exists). */
	private static readonly EMPTY_WORKSPACE_KEY = '__empty-workspace__';

	/** The session URI we last posted a notification for. Used to avoid clearing the user's dismissal when re-evaluating the same state. */
	private _lastPostedFor: string | undefined;

	/** Sessions for which the user has previously dismissed the tip; never re-posted. */
	private readonly _dismissedSessions: Set<string>;

	constructor(
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IChatInputNotificationService private readonly _notificationService: IChatInputNotificationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IStorageService private readonly _storageService: IStorageService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
	) {
		super();
		this._dismissedSessions = new Set(this._loadDismissed());
		this._register(this._chatWidgetService.onDidChangeFocusedSession(() => this._update()));
		this._register(this._chatWidgetService.onDidAddWidget(() => this._update()));
		this._register(contextKeyService.onDidChangeContext(() => this._update()));
		this._register(this._workspaceContextService.onDidChangeWorkbenchState(() => this._update()));
		this._register(this._notificationService.onDidDismiss(id => {
			if (id !== AgentsHandoffInputTipContribution.NOTIFICATION_ID || !this._lastPostedFor) {
				return;
			}
			this._dismissedSessions.add(this._lastPostedFor);
			this._saveDismissed();
		}));
		this._update();
	}

	private _update(): void {
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
			&& !isUntitledChatSession(sessionResource)
			&& !this._dismissedSessions.has(sessionResource.toString());

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
			&& !this._dismissedSessions.has(AgentsHandoffInputTipContribution.EMPTY_WORKSPACE_KEY);

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

		// Only forward a real (non-untitled) session resource. In the empty
		// workspace case the picker may have created a placeholder untitled
		// session that we shouldn't try to restore on the other side.
		const commandArgs: unknown[] = eligible && sessionResource ? [sessionResource] : [];

		// Empty-workspace + local Copilot CLI: the local agent host can't
		// run without a folder, so frame the tip as the path forward rather
		// than a generic "continue in agents" upsell.
		const useEmptyWorkspaceCopy = emptyWorkspaceEligible && !eligible;
		const message = useEmptyWorkspaceCopy
			? localize('chat.agentsHandoff.tip.emptyWorkspace.message', "Copilot CLI [Local] isn't available without an open folder")
			: localize('chat.agentsHandoff.tip.message', "Continue this session in the Agents Window");
		const description = useEmptyWorkspaceCopy
			? localize('chat.agentsHandoff.tip.emptyWorkspace.description', "Open the Agents Window to start a Copilot CLI session.")
			: localize('chat.agentsHandoff.tip.description', "Get a dedicated, multi-pane view alongside your workspace.");

		this._notificationService.setNotification({
			id: AgentsHandoffInputTipContribution.NOTIFICATION_ID,
			severity: ChatInputNotificationSeverity.Info,
			message,
			description,
			actions: [
				{
					label: localize('chat.agentsHandoff.tip.action', "Open in Agents Window"),
					commandId: OpenChatSessionInAgentsWindowAction.ID,
					commandArgs,
				},
			],
			dismissible: true,
			autoDismissOnMessage: false,
			sessionTypes: useEmptyWorkspaceCopy
				? [SessionType.AgentHostCopilot]
				: Array.from(AgentsHandoffInputTipContribution.ELIGIBLE_SESSION_TYPES),
		});
	}

	private _loadDismissed(): readonly string[] {
		const raw = this._storageService.get(AgentsHandoffInputTipContribution.DISMISSED_STORAGE_KEY, StorageScope.WORKSPACE);
		if (!raw) {
			return [];
		}
		try {
			const parsed = JSON.parse(raw);
			return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : [];
		} catch {
			return [];
		}
	}

	private _saveDismissed(): void {
		this._storageService.store(
			AgentsHandoffInputTipContribution.DISMISSED_STORAGE_KEY,
			JSON.stringify(Array.from(this._dismissedSessions)),
			StorageScope.WORKSPACE,
			StorageTarget.MACHINE,
		);
	}
}

