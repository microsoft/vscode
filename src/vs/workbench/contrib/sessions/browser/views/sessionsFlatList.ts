/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SessionItemStatusContext, SessionItemIsAutomationContext, SessionItemIsInSessionsListContext, SessionsGrouping, SessionListItem, isSessionItem } from './sessionsListCommon.js';
import { isAutomationSession } from './sessionsListHelpers.js';
import { SessionContextKeyProvider, DEFAULT_APPROVAL_ROW_MAX_LINES, SessionsTreeDelegate, SessionItemActionRunner, ISessionItemTemplate, IApprovedSession, ISessionCIFixModel, SessionItemRenderer, logDefaultSettingExperimentTrigger, SessionsAccessibilityProvider } from './sessionsListRenderers.js';
import * as DOM from '../../../../../base/browser/dom.js';
import { $ } from '../../../../../base/browser/dom.js';
import { IListStyles } from '../../../../../base/browser/ui/list/listWidget.js';
import { ITreeNode, ITreeContextMenuEvent } from '../../../../../base/browser/ui/tree/tree.js';
import { RenderIndentGuides } from '../../../../../base/browser/ui/tree/abstractTree.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { FuzzyScore } from '../../../../../base/common/filters.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, IReader, autorun } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { MenuId, IMenuService } from '../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { SessionProviderIdContext, SessionSupportsDeleteContext, SessionSupportsMultipleChatsContext, SessionSupportsRenameContext, SessionTypeContext, IsQuickChatSessionContext, SessionIsArchivedContext, SessionIsReadContext } from '../../common/contextkeys.js';
import { ExternalSessionApplicationBadgeMode, SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SETTING, SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SHOW_FROM_SETTING } from '../../common/sessionConfig.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { WorkbenchObjectTree } from '../../../../../platform/list/browser/listService.js';
import { IStyleOverride } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { AgentSessionApprovalModel } from '../../../chat/browser/agentSessions/agentSessionApprovalModel.js';
import { IVoicePlaybackService } from '../../../chat/common/voicePlaybackService.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { IAction, Separator } from '../../../../../base/common/actions.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { ISessionsManagementService } from '../../common/sessionsManagement.js';
import { getMainWindowHost, ISessionHostService } from '../../../../services/sessions/browser/sessionHost.js';
import { ISessionsNavigationService } from '../sessionsNavigationService.js';
import { ISessionsListModelService } from '../sessionsListModelService.js';
// =============================================================================
// TEMPORARY (tracked by https://github.com/microsoft/vscode/issues/320480)
// -----------------------------------------------------------------------------
// `IAgentSessionsService` is a Copilot-provider internal and must normally only
// be consumed by the Copilot chat sessions provider — the rest of the Agents
// window stays provider-agnostic (see SESSIONS.md). This single, deliberate
// exception lets the sessions list trigger lazy resolution of expensive session
// properties (e.g. changes) for rows that scroll into view, until Don
// re-implements it the right way (driven from inside the Copilot provider, or
// via a provider-agnostic visibility signal on the shared services).
// DO NOT add further usages of this import in the sessions workbench, and DO NOT
// copy this suppression elsewhere.
// =============================================================================
// eslint-disable-next-line no-restricted-imports
import { IAgentSessionsService } from '../../../chat/browser/agentSessions/agentSessionsService.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ISessionsProvidersService } from '../sessionsProvidersService.js';
import { Menus } from '../menus.js';

//#region Flat List

export interface ISessionsFlatListOptions {
	readonly overrideStyles?: IStyleOverride<IListStyles>;
	readonly showSessionHover?: boolean;
	/** Session shown as selected in this list, without moving DOM focus. */
	readonly activeSession?: IObservable<ISession | undefined>;
	/** Reports when a rich session hover is shown or hidden. */
	readonly onDidChangeSessionHoverVisibility?: (visible: boolean) => void;
	/** Called when a session row is opened (clicked / activated). */
	onSessionOpen(resource: URI, preserveFocus: boolean, sideBySide: boolean): void;
	/**
	 * Approval model tracking pending tool confirmations for the shown sessions.
	 * When omitted the list creates and owns its own; injectable so tests and
	 * fixtures can supply pending approvals without a live chat session.
	 */
	readonly approvalModel?: AgentSessionApprovalModel;
	/**
	 * Supplies the per-session "Fix CI" row for sessions whose pull request has
	 * failing CI checks. Only the blocked-sessions dropdown passes one, so the row
	 * never appears in other lists. When omitted no fix-CI rows are rendered.
	 */
	readonly ciFixModel?: ISessionCIFixModel;
	/**
	 * Maximum number of terminal-command lines shown in a session's approval
	 * prompt. Defaults to the same limit as the main sessions list; the
	 * blocked-sessions dropdown passes a larger value.
	 */
	readonly approvalRowMaxLines?: number;
	/**
	 * Menu used by each session row's inline toolbar. Defaults to the main sessions
	 * item toolbar menu.
	 */
	readonly toolbarMenuId?: MenuId;
	/**
	 * The `from` value of the `workbenchActionExecuted` event sent for row toolbar
	 * actions. Defaults to `sessionsFlatList.row`.
	 */
	readonly toolbarTelemetrySource?: string;
	/** Allows focused list surfaces to handle actions from their custom toolbar menu. */
	readonly onToolbarAction?: (action: IAction, session: ISession) => boolean | Promise<boolean>;
	/** Optional context menu shown for each session row. */
	readonly contextMenuId?: MenuId;
	/** Allows focused list surfaces to handle actions from their custom context menu. */
	readonly onContextMenuAction?: (action: IAction, session: ISession) => boolean | Promise<boolean>;
	/** Per-session context shared by the inline toolbar and context menu. */
	readonly getAdditionalContextKeys?: SessionContextKeyProvider;
	/** Keeps repository and time visible alongside progress in history views. */
	readonly showMetadataWhileActive?: (session: ISession) => boolean;
	/** Keeps dot separators between metadata items in history views. Defaults to `false`. */
	readonly showMetadataSeparators?: boolean;
	/** Short outcome shown before the time of a completed row, such as "Cancelled". */
	readonly getCompletedStatusMessage?: (session: ISession, reader: IReader | undefined) => string | undefined;
	/** Whether opening a row immediately marks its session as read. Defaults to `true`. */
	readonly markSessionReadOnOpen?: boolean;
	/**
	 * When `false` wheel events bubble to the parent scroller instead of being
	 * consumed by the embedded tree. Defaults to `true` (standard list behavior).
	 */
	readonly alwaysConsumeMouseWheel?: boolean;
	/**
	 * Whether quick chats use the compact single-line presentation. Defaults to
	 * `true`; consumers showing homogeneous history entries can opt into regular rows.
	 */
	readonly useCompactQuickChatRows?: boolean;
}

/**
 * A lightweight, flat sessions list that renders session rows exactly like the
 * main {@link SessionsList} but without any sections, groups or workspace
 * headers. Only the sessions passed to {@link setSessions} are shown. Used by
 * surfaces that need a focused, sectionless view of a specific set of sessions
 * (e.g. the titlebar "N blocked" hover).
 */
export class SessionsFlatList extends Disposable {

	private static readonly ROW_HEIGHT = 54;

	private readonly _onDidChangeContentHeight = this._register(new Emitter<void>());
	readonly onDidChangeContentHeight = this._onDidChangeContentHeight.event;
	private readonly _onDidApproveSession = this._register(new Emitter<IApprovedSession>());
	/** Fires when a session's pending action is approved from its "Allow" button. */
	readonly onDidApproveSession: Event<IApprovedSession> = this._onDidApproveSession.event;
	private readonly tree: WorkbenchObjectTree<SessionListItem, FuzzyScore>;
	private readonly _delegate: SessionsTreeDelegate;
	private readonly renderedSessions = new Map<ISession, HTMLElement>();
	private _sessions: readonly ISession[] = [];

	constructor(
		container: HTMLElement,
		private readonly options: ISessionsFlatListOptions,
		@ISessionsNavigationService private readonly _sessionsNavigationService: ISessionsNavigationService,
		@ISessionHostService private readonly _sessionHostService: ISessionHostService,
		@ISessionsListModelService private readonly _sessionsListModelService: ISessionsListModelService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IMarkdownRendererService markdownRendererService: IMarkdownRendererService,
		@IHoverService hoverService: IHoverService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IConfigurationService configurationService: IConfigurationService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@IVoicePlaybackService voicePlaybackService: IVoicePlaybackService,
		@IAgentHostConnectionsService agentHostConnectionsService: IAgentHostConnectionsService,
		@IOpenerService openerService: IOpenerService,
		@ILabelService labelService: ILabelService,
		@ITelemetryService telemetryService: ITelemetryService,
		@INotificationService notificationService: INotificationService,
	) {
		super();

		// Wrap in `.sessions-list-control` so the row styles scoped to that class
		// (needs-input/pinned row highlights) apply exactly like the main list.
		const listRoot = DOM.append(container, $('.sessions-list-control'));
		const approvalModel = this.options.approvalModel ?? this._register(instantiationService.createInstance(AgentSessionApprovalModel));

		// TEMPORARY (#320480): the row renderer reaches into a Copilot-provider
		// internal to lazily resolve expensive session properties. Resolved via
		// the instantiation service so this file's single suppressed import stays
		// the only reference. See the note on the `IAgentSessionsService` import.
		const agentSessionsService = instantiationService.invokeFunction(accessor => accessor.get(IAgentSessionsService));
		const useCompactQuickChatRows = this.options.useCompactQuickChatRows ?? true;
		const externalApplicationBadgeMode = observableConfigValue(SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SETTING, ExternalSessionApplicationBadgeMode.Off, configurationService);
		const externalApplicationBadgeShowFrom = observableConfigValue(SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SHOW_FROM_SETTING, false, configurationService);
		const reportExternalApplicationBadgeModeExperimentTrigger = () => logDefaultSettingExperimentTrigger(configurationService, telemetryService, SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SETTING);
		const reportExternalApplicationBadgeShowFromExperimentTrigger = () => logDefaultSettingExperimentTrigger(configurationService, telemetryService, SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SHOW_FROM_SETTING);

		const renderedSessions = this.renderedSessions;
		const sessionRenderer = new class extends SessionItemRenderer {
			override renderElement(node: ITreeNode<SessionListItem, FuzzyScore>, index: number, template: ISessionItemTemplate): void {
				super.renderElement(node, index, template);
				const session = node.element;
				if (isSessionItem(session)) {
					renderedSessions.set(session, template.container);
					template.elementDisposables.add(toDisposable(() => renderedSessions.delete(session)));
				}
			}
		}(
			{
				grouping: () => SessionsGrouping.Date,
				isPinned: s => this._sessionsListModelService.isSessionPinned(s),
				slotPanes: this._sessionsNavigationService.slotPanes,
				getMultiSelectedSessions: s => [s],
				showHover: this.options.showSessionHover ?? true,
				onDidChangeHoverVisibility: this.options.onDidChangeSessionHoverVisibility,
				useCompactQuickChatRows,
				compact: () => false,
				approvalRowMaxLines: this.options.approvalRowMaxLines ?? DEFAULT_APPROVAL_ROW_MAX_LINES,
				// This list renders no nested chat rows, so the session row is the
				// only place an approval on any of its chats can surface.
				aggregateChatApprovals: true,
				toolbarMenuId: this.options.toolbarMenuId ?? Menus.SessionItemToolbar,
				toolbarTelemetrySource: this.options.toolbarTelemetrySource ?? 'sessionsFlatList.row',
				inlineRename: false,
				handleToolbarAction: this.options.onToolbarAction,
				externalApplicationBadgeMode,
				externalApplicationBadgeShowFrom,
				reportExternalApplicationBadgeModeExperimentTrigger,
				reportExternalApplicationBadgeShowFromExperimentTrigger,
				getAdditionalContextKeys: this.options.getAdditionalContextKeys,
				showMetadataWhileActive: this.options.showMetadataWhileActive,
				showMetadataSeparators: this.options.showMetadataSeparators,
				getCompletedStatusMessage: this.options.getCompletedStatusMessage,
			},
			approvalModel,
			this.options.ciFixModel,
			instantiationService,
			contextKeyService,
			configurationService,
			markdownRendererService,
			hoverService,
			sessionsProvidersService,
			this._sessionsManagementService,
			agentHostConnectionsService,
			openerService,
			labelService,
			agentSessionsService,
			voicePlaybackService,
			notificationService,
		);

		this._delegate = new SessionsTreeDelegate(approvalModel, () => false, () => false, session => session.status.get(), this.options.approvalRowMaxLines ?? DEFAULT_APPROVAL_ROW_MAX_LINES, this.options.ciFixModel, useCompactQuickChatRows, true /* aggregateChatApprovals */);

		this.tree = this._register(instantiationService.createInstance(
			WorkbenchObjectTree<SessionListItem, FuzzyScore>,
			'SessionsFlatList',
			listRoot,
			this._delegate,
			[sessionRenderer],
			{
				accessibilityProvider: new SessionsAccessibilityProvider(undefined, {
					grouping: () => SessionsGrouping.Date,
					isPinned: session => this._sessionsListModelService.isSessionPinned(session),
					includeQuickChatInAriaLabel: !useCompactQuickChatRows,
					externalApplicationBadgeMode,
					reportExternalApplicationBadgeModeExperimentTrigger,
					reportExternalApplicationBadgeShowFromExperimentTrigger,
					showMetadataWhileActive: this.options.showMetadataWhileActive,
					getCompletedStatusMessage: this.options.getCompletedStatusMessage,
				}),
				identityProvider: {
					getId: (element: SessionListItem) => (element as ISession).resource.toString(),
				},
				horizontalScrolling: false,
				alwaysConsumeMouseWheel: this.options.alwaysConsumeMouseWheel ?? true,
				multipleSelectionSupport: false,
				indent: 0,
				overrideStyles: this.options.overrideStyles,
				renderIndentGuides: RenderIndentGuides.None,
				twistieAdditionalCssClass: () => 'force-no-twistie',
			}
		));
		if (this.options.activeSession) {
			const activeSession = this.options.activeSession;
			this._register(autorun(reader => {
				activeSession.read(reader);
				this._syncActiveSessionSelection();
			}));
		}

		this._register(this.tree.onDidOpen(e => {
			const element = e.element;
			if (!element || !isSessionItem(element)) {
				return;
			}
			if (this.options.markSessionReadOnOpen !== false && getMainWindowHost(this._sessionHostService).session.get()?.sessionId !== element.sessionId) {
				this._sessionsManagementService.markRead(element);
			}
			const isLeftClick = DOM.isMouseEvent(e.browserEvent) && e.browserEvent.button === 0;
			const preserveFocus = isLeftClick ? false : (e.editorOptions.preserveFocus ?? false);
			this.options.onSessionOpen(element.resource, preserveFocus, e.sideBySide);
		}));
		if (this.options.contextMenuId) {
			this._register(this.tree.onContextMenu(e => this.onContextMenu(e)));
		}

		this._register(sessionRenderer.onDidChangeItemHeight(session => {
			if (this.tree.hasElement(session)) {
				this.tree.updateElementHeight(session, this._delegate.getHeight(session));
				this._onDidChangeContentHeight.fire();
			}
		}));

		this._register(sessionRenderer.onDidApproveSession(approved => this._onDidApproveSession.fire(approved)));
	}

	private onContextMenu(e: ITreeContextMenuEvent<SessionListItem | null>): void {
		const session = e.element;
		if (!session || !isSessionItem(session) || !this.options.contextMenuId) {
			return;
		}

		const disposables = new DisposableStore();
		const contextKeyService = this.contextKeyService.createOverlay([
			[SessionIsArchivedContext.key, session.isArchived.get()],
			[SessionIsReadContext.key, session.mainChat.get().isRead.get()],
			[SessionTypeContext.key, session.sessionType],
			[SessionProviderIdContext.key, session.providerId],
			[SessionSupportsMultipleChatsContext.key, session.capabilities.get().supportsMultipleChats],
			[SessionSupportsRenameContext.key, session.capabilities.get().supportsRename ?? false],
			[SessionSupportsDeleteContext.key, session.capabilities.get().supportsDelete ?? false],
			[IsQuickChatSessionContext.key, session.isQuickChat?.get() ?? false],
			[SessionItemStatusContext.key, session.status.get()],
			[SessionItemIsAutomationContext.key, isAutomationSession(session)],
			[SessionItemIsInSessionsListContext.key, this._sessionsListModelService.isSessionListed(session)],
			...(this.options.getAdditionalContextKeys?.(session, undefined) ?? []),
		]);
		const menu = disposables.add(this.menuService.createMenu(this.options.contextMenuId, contextKeyService));
		const actions = Separator.join(...menu.getActions({ shouldForwardArgs: true }).map(([, groupActions]) => groupActions));
		if (actions.length === 0) {
			disposables.dispose();
			return;
		}

		const actionRunner = disposables.add(new SessionItemActionRunner(selected => [selected], this.options.onContextMenuAction));
		this.contextMenuService.showContextMenu({
			getActions: () => actions,
			getActionsContext: () => session,
			getAnchor: () => e.anchor,
			getKeyBinding: action => this.keybindingService.lookupKeybinding(action.id, contextKeyService, true) ?? undefined,
			actionRunner,
			onHide: () => disposables.dispose(),
		});
	}

	setSessions(sessions: readonly ISession[]): void {
		this._sessions = sessions;
		this.tree.setChildren(null, sessions.map(session => ({ element: session })));
		this._syncActiveSessionSelection();
	}

	private _syncActiveSessionSelection(): void {
		const activeSessionId = this.options.activeSession?.get()?.sessionId;
		const activeSession = activeSessionId ? this._sessions.find(session => session.sessionId === activeSessionId) : undefined;
		this.tree.setSelection(activeSession && this.tree.hasElement(activeSession) ? [activeSession] : []);
	}

	/** The total pixel height required to render all current rows without scrolling. */
	getContentHeight(): number {
		return this._sessions.reduce((total, session) => total + this._delegate.getHeight(session), 0);
	}

	getRowHeight(): number {
		return SessionsFlatList.ROW_HEIGHT;
	}

	layout(height: number, width: number): void {
		this.tree.layout(height, width);
	}

	focus(): void {
		const session = this.tree.getFocus()[0] ?? this.tree.getSelection()[0] ?? this._sessions[0];
		if (session && this.tree.hasElement(session)) {
			this.tree.setFocus([session]);
		}
		this.tree.domFocus();
	}

	focusSession(session: ISession, revealInParent = false): void {
		if (!this.tree.hasElement(session)) {
			return;
		}
		this.tree.setFocus([session]);
		this.tree.domFocus();
		if (revealInParent) {
			this.tree.reveal(session);
			this.renderedSessions.get(session)?.scrollIntoView({ block: 'nearest' });
		}
	}

	getFocusedSession(): ISession | undefined {
		const activeElement = DOM.getActiveElement();
		if (activeElement) {
			for (const [session, element] of this.renderedSessions) {
				if (element.contains(activeElement)) {
					return session;
				}
			}
		}
		const focused = this.tree.getFocus()[0];
		return focused && isSessionItem(focused) ? focused : undefined;
	}
}

//#endregion
