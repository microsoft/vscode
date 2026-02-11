/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, reset } from '../../../../../../base/browser/dom.js';
import { BaseActionViewItem, IBaseActionViewItemOptions } from '../../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { getDefaultHoverDelegate } from '../../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { renderIcon } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IAction } from '../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { renderAsPlaintext } from '../../../../../../base/browser/markdownRenderer.js';
import { localize } from '../../../../../../nls.js';
import { IActionViewItemService } from '../../../../../../platform/actions/browser/actionViewItemService.js';
import { MenuId, MenuRegistry, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService, ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { registerSingleton, InstantiationType } from '../../../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../common/contributions.js';
import { IChatWidget, IChatWidgetService } from '../../chat.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { ChatAgentLocation, ChatConfiguration } from '../../../common/constants.js';
import { IChatEditingService, ModifiedFileEntryState } from '../../../common/editing/chatEditingService.js';
import { AgentSessionProviders } from '../agentSessions.js';
import { AgentSessionStatus, IAgentSession, isSessionInProgressStatus } from '../agentSessionsModel.js';
import { openSession } from '../agentSessionsOpener.js';
import { IAgentSessionsService } from '../agentSessionsService.js';
import { IAgentSessionProjectionService, AgentSessionProjectionService, AGENT_SESSION_PROJECTION_ENABLED_PROVIDERS } from './agentSessionProjectionService.js';
import { EnterAgentSessionProjectionAction, ExitAgentSessionProjectionAction, ToggleAgentStatusAction } from './agentSessionProjectionActions.js';
import { AgentTitleBarStatusRendering } from './agentTitleBarStatusWidget.js';
import { AgentTitleBarStatusService, IAgentTitleBarStatusService } from './agentTitleBarStatusService.js';
import { UnifiedQuickAccessContribution, _setUnifiedQuickAccessContribution } from './unifiedQuickAccessActions.js';

/**
 * Contribution that watches for projection-capable sessions and shows
 * the "session ready" state in the title bar when changes are available for review.
 */
class AgentSessionReadyContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'chat.agentSessionReady';

	private readonly _widgetDisposables = this._register(new DisposableStore());
	private _entriesWatcher: IDisposable | undefined;
	private _watchedSessionResource: URI | undefined;
	private _suppressSessionReady = false; // Suppress re-showing session-ready after user explicitly exits projection

	constructor(
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IAgentTitleBarStatusService private readonly agentTitleBarStatusService: IAgentTitleBarStatusService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IAgentSessionProjectionService private readonly agentSessionProjectionService: IAgentSessionProjectionService,
		@IChatEditingService private readonly chatEditingService: IChatEditingService,
	) {
		super();

		// Monitor existing widgets
		for (const widget of this.chatWidgetService.getAllWidgets()) {
			if (widget.location === ChatAgentLocation.Chat) {
				this._watchWidget(widget);
			}
		}

		// Monitor new widgets
		this._register(this.chatWidgetService.onDidAddWidget(widget => {
			if (widget.location === ChatAgentLocation.Chat) {
				this._watchWidget(widget);
			}
		}));

		// When projection mode exits, suppress session-ready for the same session
		this._register(this.agentSessionProjectionService.onDidChangeProjectionMode(isActive => {
			if (!isActive) {
				// User explicitly exited projection - suppress re-showing session-ready for this session
				this._suppressSessionReady = true;
				this._clearEntriesWatcher();
				this.agentTitleBarStatusService.exitSessionReadyMode();
			}
		}));

		// Also watch for editing session changes - an editing session might be created after the chat is opened
		this._register(autorun(reader => {
			// Read the observable to track changes
			this.chatEditingService.editingSessionsObs.read(reader);
			// When editing sessions change, re-check the current session
			const currentWidget = this.chatWidgetService.getAllWidgets().find(w => w.location === ChatAgentLocation.Chat);
			if (currentWidget) {
				this._checkSession(currentWidget.viewModel?.sessionResource);
			}
		}));

		// Watch for agent sessions model changes - sessions are resolved asynchronously
		this._register(this.agentSessionsService.model.onDidChangeSessions(() => {
			const currentWidget = this.chatWidgetService.getAllWidgets().find(w => w.location === ChatAgentLocation.Chat);
			if (currentWidget) {
				this._checkSession(currentWidget.viewModel?.sessionResource);
			}
		}));
	}

	private _watchWidget(widget: IChatWidget): void {
		// Clear previous disposables when switching widgets
		this._widgetDisposables.clear();

		// Check initial state
		this._checkSession(widget.viewModel?.sessionResource);

		// Watch for viewmodel changes
		this._widgetDisposables.add(widget.onDidChangeViewModel(() => {
			this._checkSession(widget.viewModel?.sessionResource);
		}));
	}

	private _checkSession(sessionResource: URI | undefined): void {
		// Clear the suppress flag when switching to a different session
		if (sessionResource?.toString() !== this._watchedSessionResource?.toString()) {
			this._suppressSessionReady = false;
		}

		// If we're in projection mode and switching to a different session,
		// automatically enter projection for the new session (if eligible)
		if (this.agentSessionProjectionService.isActive) {
			const activeSession = this.agentSessionProjectionService.activeSession;
			if (sessionResource && activeSession && sessionResource.toString() !== activeSession.resource.toString()) {
				const newSession = this.agentSessionsService.getSession(sessionResource);
				if (newSession) {
					// enterProjection handles session switching and will check eligibility
					this.agentSessionProjectionService.enterProjection(newSession);
				}
			}
			return;
		}

		// Update state based on current session
		this._updateSessionReadyState(sessionResource);
	}

	private _clearEntriesWatcher(): void {
		this._entriesWatcher?.dispose();
		this._entriesWatcher = undefined;
		this._watchedSessionResource = undefined;
	}

	private _updateSessionReadyState(sessionResource: URI | undefined): void {
		// Check if projection is enabled
		const isEnabled = this.configurationService.getValue<boolean>(ChatConfiguration.AgentSessionProjectionEnabled);
		if (!isEnabled) {
			this._clearEntriesWatcher();
			this.agentTitleBarStatusService.exitSessionReadyMode();
			return;
		}

		// If already in projection mode, don't show session-ready (handled by _checkSession)
		if (this.agentSessionProjectionService.isActive) {
			this._clearEntriesWatcher();
			return;
		}

		if (!sessionResource) {
			this._clearEntriesWatcher();
			this.agentTitleBarStatusService.exitSessionReadyMode();
			return;
		}

		// Get the session
		const session = this.agentSessionsService.getSession(sessionResource);
		if (!session) {
			this._clearEntriesWatcher();
			this.agentTitleBarStatusService.exitSessionReadyMode();
			return;
		}

		// Check if this is a projection-capable provider
		if (!AGENT_SESSION_PROJECTION_ENABLED_PROVIDERS.has(session.providerType)) {
			this._clearEntriesWatcher();
			this.agentTitleBarStatusService.exitSessionReadyMode();
			return;
		}

		// Check if session is in progress
		if (isSessionInProgressStatus(session.status)) {
			this._clearEntriesWatcher();
			this.agentTitleBarStatusService.exitSessionReadyMode();
			return;
		}

		let hasPendingChanges = false;

		if (session.providerType === AgentSessionProviders.Local) {
			// Local sessions track undecided edits via the editing service
			const editingSession = this.chatEditingService.getEditingSession(sessionResource);
			if (!editingSession) {
				this._clearEntriesWatcher();
				this.agentTitleBarStatusService.exitSessionReadyMode();
				return;
			}

			const entries = editingSession.entries.get();
			hasPendingChanges = entries.some(entry => entry.state.get() === ModifiedFileEntryState.Modified);

			if (hasPendingChanges && !this._suppressSessionReady) {
				this.agentTitleBarStatusService.enterSessionReadyMode(session.resource, session.label);

				if (!this._watchedSessionResource || this._watchedSessionResource.toString() !== sessionResource.toString()) {
					this._clearEntriesWatcher();
					this._watchedSessionResource = sessionResource;

					// Monitor the entries for changes
					this._entriesWatcher = autorun(reader => {
						const currentEntries = editingSession.entries.read(reader);
						const stillHasChanges = currentEntries.some(entry => entry.state.read(reader) === ModifiedFileEntryState.Modified);
						if (!stillHasChanges) {
							this.agentTitleBarStatusService.exitSessionReadyMode();
						}
					});
				}
			} else {
				this._clearEntriesWatcher();
				this.agentTitleBarStatusService.exitSessionReadyMode();
			}
		} else {
			// Cloud/remote sessions: rely on changes array from the session
			this._clearEntriesWatcher();
			const changeCount = Array.isArray(session.changes)
				? session.changes.filter(change => !!change.originalUri).length
				: 0;
			hasPendingChanges = changeCount > 0;

			if (hasPendingChanges && !this._suppressSessionReady) {
				this.agentTitleBarStatusService.enterSessionReadyMode(session.resource, session.label);
			} else {
				this.agentTitleBarStatusService.exitSessionReadyMode();
			}
		}
	}
}

// #region Agent Session Projection & Status

registerAction2(EnterAgentSessionProjectionAction);
registerAction2(ExitAgentSessionProjectionAction);
registerAction2(ToggleAgentStatusAction);
registerSingleton(IAgentSessionProjectionService, AgentSessionProjectionService, InstantiationType.Delayed);
registerSingleton(IAgentTitleBarStatusService, AgentTitleBarStatusService, InstantiationType.Delayed);

registerWorkbenchContribution2(AgentTitleBarStatusRendering.ID, AgentTitleBarStatusRendering, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(AgentSessionReadyContribution.ID, AgentSessionReadyContribution, WorkbenchPhase.AfterRestored);

// Register and expose the UnifiedQuickAccess contribution so actions can access it
registerWorkbenchContribution2(UnifiedQuickAccessContribution.ID, class extends UnifiedQuickAccessContribution {
	constructor(...args: ConstructorParameters<typeof UnifiedQuickAccessContribution>) {
		super(...args);
		_setUnifiedQuickAccessContribution(this);
	}
}, WorkbenchPhase.AfterRestored);

// Register Agent Status as a menu item in the command center (alongside the search box, not replacing it)
MenuRegistry.appendMenuItem(MenuId.CommandCenter, {
	submenu: MenuId.AgentsTitleBarControlMenu,
	title: localize('agentsControl', "Agents"),
	icon: Codicon.chatSparkle,
	when: ContextKeyExpr.and(
		ChatContextKeys.enabled,
		ContextKeyExpr.has(`config.${ChatConfiguration.AgentStatusEnabled}`)
	),
	order: 10002 // to the right of the chat button
});

// Add to the global title bar if command center is disabled
MenuRegistry.appendMenuItem(MenuId.TitleBar, {
	submenu: MenuId.ChatTitleBarMenu,
	title: localize('title4', "Chat"),
	group: 'navigation',
	icon: Codicon.chatSparkle,
	when: ContextKeyExpr.and(
		ChatContextKeys.supported,
		ContextKeyExpr.and(
			ChatContextKeys.Setup.hidden.negate(),
			ChatContextKeys.Setup.disabled.negate()
		),
		ContextKeyExpr.has(`config.${ChatConfiguration.AgentStatusEnabled}`),
		ContextKeyExpr.has('config.window.commandCenter').negate(),
	),
	order: 1
});

// Register a placeholder action to the submenu so it appears (required for submenus)
MenuRegistry.appendMenuItem(MenuId.AgentsTitleBarControlMenu, {
	command: {
		id: 'workbench.action.chat.toggle',
		title: localize('openChat', "Open Chat"),
	},
	when: ContextKeyExpr.and(
		ChatContextKeys.enabled,
		ContextKeyExpr.has(`config.${ChatConfiguration.AgentStatusEnabled}`)
	),
	group: 'a_open',
	order: 1
});

// #region Chat Command Center Attention Indicator

const OPEN_ATTENTION_SESSION_ID = 'chat.commandCenter.openAttentionSession';

/**
 * Sort sessions by most recently started request (descending).
 */
function compareByMostRecentRequest(a: IAgentSession, b: IAgentSession): number {
	const timeA = a.timing.lastRequestStarted ?? a.timing.created;
	const timeB = b.timing.lastRequestStarted ?? b.timing.created;
	return timeB - timeA;
}

/**
 * Get background agent sessions that need user attention (NeedsInput, not archived,
 * not currently displayed in a chat widget).
 */
function getAttentionSessions(agentSessionsService: IAgentSessionsService, chatWidgetService: IChatWidgetService): IAgentSession[] {
	return agentSessionsService.model.sessions.filter(
		s => s.status === AgentSessionStatus.NeedsInput
			&& !s.isArchived()
			&& !chatWidgetService.getWidgetBySessionResource(s.resource)
	);
}

/** Events that can change the set of attention sessions. */
function onAttentionSessionsChanged(agentSessionsService: IAgentSessionsService, chatWidgetService: IChatWidgetService, callback: () => void, store: DisposableStore): void {
	store.add(agentSessionsService.model.onDidChangeSessions(callback));
	store.add(chatWidgetService.onDidAddWidget(callback));
	store.add(chatWidgetService.onDidBackgroundSession(callback));
}

/**
 * Contribution that watches agent sessions for NeedsInput status and
 * sets the `chat.sessionNeedsAttention` context key accordingly.
 */
class ChatAttentionContextKeyContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'chat.attentionContextKey';

	constructor(
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		const sessionNeedsAttention = ChatContextKeys.sessionNeedsAttention.bindTo(contextKeyService);

		const update = () => {
			sessionNeedsAttention.set(getAttentionSessions(this.agentSessionsService, this.chatWidgetService).length > 0);
		};

		update();
		onAttentionSessionsChanged(this.agentSessionsService, this.chatWidgetService, update, this._store);
	}
}

registerWorkbenchContribution2(ChatAttentionContextKeyContribution.ID, ChatAttentionContextKeyContribution, WorkbenchPhase.AfterRestored);

// Register active content submenu on CommandCenterCenter - when visible,
// replaces the entire command center center with attention indicator.
MenuRegistry.appendMenuItem(MenuId.CommandCenterCenter, {
	submenu: MenuId.CommandCenterCenterActiveContent,
	title: localize('chatAttention', "Chat Attention"),
	icon: Codicon.report,
	order: 0,
	when: ContextKeyExpr.and(
		ChatContextKeys.sessionNeedsAttention,
		ContextKeyExpr.has(`config.${ChatConfiguration.CommandCenterShowStatus}`)
	),
});

// Register attention action on the active content menu
MenuRegistry.appendMenuItem(MenuId.CommandCenterCenterActiveContent, {
	command: {
		id: OPEN_ATTENTION_SESSION_ID,
		title: localize('openAttentionSession', "Open Session"),
		icon: Codicon.report,
	},
});

/**
 * Custom view item for the attention indicator in CommandCenterCenter.
 * Shows report icon + count badge + freeform text from the most-recent session needing attention.
 */
class ChatAttentionViewItem extends BaseActionViewItem {

	private _displayedSession: IAgentSession | undefined;

	constructor(
		action: IAction,
		options: IBaseActionViewItemOptions,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IHoverService private readonly hoverService: IHoverService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super(undefined, action, options);
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('chat-attention-indicator');
		container.role = 'button';

		// Report icon
		const icon = renderIcon(Codicon.report);

		// Count badge
		const countBadge = $('span.chat-attention-count');

		// Text label from the most recent session
		const label = $('span.chat-attention-label');

		reset(container, icon, countBadge, label);

		// Tooltip
		const hoverDelegate = getDefaultHoverDelegate('mouse');
		const hover = this._store.add(this.hoverService.setupManagedHover(hoverDelegate, container, ''));

		const update = () => {
			const attentionSessions = getAttentionSessions(this.agentSessionsService, this.chatWidgetService);

			const sorted = [...attentionSessions].sort(compareByMostRecentRequest);
			this._displayedSession = sorted[0];

			countBadge.textContent = String(attentionSessions.length);

			const text = this._displayedSession?.description
				? (typeof this._displayedSession.description === 'string'
					? this._displayedSession.description
					: renderAsPlaintext(this._displayedSession.description))
				: this._displayedSession?.label ?? '';
			label.textContent = text;

			hover.update(this._displayedSession
				? localize('openAttentionSessionTooltip', "Open session: {0}", this._displayedSession.label)
				: ''
			);
			container.setAttribute('aria-label', localize('attentionSessionAriaLabel', "{0} sessions need attention", attentionSessions.length));
		};

		update();
		onAttentionSessionsChanged(this.agentSessionsService, this.chatWidgetService, update, this._store);
	}

	override onClick(event: Event): void {
		event.preventDefault();
		event.stopPropagation();
		if (this._displayedSession) {
			this.instantiationService.invokeFunction(openSession, this._displayedSession);
		}
	}
}

/**
 * Contribution that registers the ChatAttentionViewItem as a custom renderer
 * for the attention action in the CommandCenterCenter menu.
 */
class ChatAttentionViewItemContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'chat.attentionViewItem';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IAgentSessionsService agentSessionsService: IAgentSessionsService,
	) {
		super();
		this._register(actionViewItemService.register(
			MenuId.CommandCenterCenterActiveContent,
			OPEN_ATTENTION_SESSION_ID,
			(action, options, instaService) => {
				return instaService.createInstance(ChatAttentionViewItem, action, options);
			},
			agentSessionsService.model.onDidChangeSessions
		));
	}
}

registerWorkbenchContribution2(ChatAttentionViewItemContribution.ID, ChatAttentionViewItemContribution, WorkbenchPhase.AfterRestored);

// #endregion

//#endregion
