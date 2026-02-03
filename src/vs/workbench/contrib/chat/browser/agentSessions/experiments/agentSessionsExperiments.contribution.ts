/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton, InstantiationType } from '../../../../../../platform/instantiation/common/extensions.js';
import { MenuId, MenuRegistry, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { IAgentSessionProjectionService, AgentSessionProjectionService, AGENT_SESSION_PROJECTION_ENABLED_PROVIDERS } from './agentSessionProjectionService.js';
import { EnterAgentSessionProjectionAction, ExitAgentSessionProjectionAction, ToggleAgentStatusAction, ToggleUnifiedAgentsBarAction } from './agentSessionProjectionActions.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../common/contributions.js';
import { AgentTitleBarStatusRendering } from './agentTitleBarStatusWidget.js';
import { AgentTitleBarStatusService, IAgentTitleBarStatusService } from './agentTitleBarStatusService.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { localize } from '../../../../../../nls.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { ProductQualityContext } from '../../../../../../platform/contextkey/common/contextkeys.js';
import { ChatAgentLocation, ChatConfiguration } from '../../../common/constants.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { IChatWidget, IChatWidgetService } from '../../chat.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IAgentSessionsService } from '../agentSessionsService.js';
import { AgentSessionProviders } from '../agentSessions.js';
import { IChatEditingService, ModifiedFileEntryState } from '../../../common/editing/chatEditingService.js';
import { isSessionInProgressStatus } from '../agentSessionsModel.js';
import { URI } from '../../../../../../base/common/uri.js';
import { autorun } from '../../../../../../base/common/observable.js';

import './unifiedQuickAccessActions.js'; // Register unified quick access actions

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
registerAction2(ToggleUnifiedAgentsBarAction);

registerSingleton(IAgentSessionProjectionService, AgentSessionProjectionService, InstantiationType.Delayed);
registerSingleton(IAgentTitleBarStatusService, AgentTitleBarStatusService, InstantiationType.Delayed);

registerWorkbenchContribution2(AgentTitleBarStatusRendering.ID, AgentTitleBarStatusRendering, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(AgentSessionReadyContribution.ID, AgentSessionReadyContribution, WorkbenchPhase.AfterRestored);

// Register Agent Status as a menu item in the command center (alongside the search box, not replacing it)
MenuRegistry.appendMenuItem(MenuId.CommandCenter, {
	submenu: MenuId.AgentsTitleBarControlMenu,
	title: localize('agentsControl', "Agents"),
	icon: Codicon.chatSparkle,
	when: ContextKeyExpr.and(
		ChatContextKeys.enabled,
		ContextKeyExpr.or(
			ContextKeyExpr.has(`config.${ChatConfiguration.AgentStatusEnabled}`),
			ContextKeyExpr.has(`config.${ChatConfiguration.UnifiedAgentsBar}`)
		)
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
		ContextKeyExpr.or(
			ContextKeyExpr.has(`config.${ChatConfiguration.AgentStatusEnabled}`),
			ContextKeyExpr.has(`config.${ChatConfiguration.UnifiedAgentsBar}`)
		)
	),
	group: 'a_open',
	order: 1
});

// Toggle for Agent Quick Input (Insiders only)
MenuRegistry.appendMenuItem(MenuId.AgentsTitleBarControlMenu, {
	command: {
		id: `toggle.${ChatConfiguration.UnifiedAgentsBar}`,
		title: localize('toggleAgentQuickInput', "Agent Quick Input (Experimental)"),
		toggled: ContextKeyExpr.has(`config.${ChatConfiguration.UnifiedAgentsBar}`),
	},
	when: ContextKeyExpr.and(
		ChatContextKeys.enabled,
		ProductQualityContext.notEqualsTo('stable')
	),
	group: 'z_experimental',
	order: 10
});

//#endregion
