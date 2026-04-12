/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { MenuId, MenuRegistry, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { IAgentSessionProjectionService, AgentSessionProjectionService, AGENT_SESSION_PROJECTION_ENABLED_PROVIDERS } from './agentSessionProjectionService.js';
import { EnterAgentSessionProjectionAction, ExitAgentSessionProjectionAction, ToggleUnifiedAgentsBarAction } from './agentSessionProjectionActions.js';
import { registerWorkbenchContribution2 } from '../../../../../common/contributions.js';
import { AgentTitleBarStatusRendering } from './agentTitleBarStatusWidget.js';
import { AgentTitleBarStatusService, IAgentTitleBarStatusService } from './agentTitleBarStatusService.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { localize } from '../../../../../../nls.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { ProductQualityContext } from '../../../../../../platform/contextkey/common/contextkeys.js';
import { ChatAgentLocation, ChatConfiguration } from '../../../common/constants.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { IChatWidgetService } from '../../chat.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IAgentSessionsService } from '../agentSessionsService.js';
import { AgentSessionProviders } from '../agentSessions.js';
import { IChatEditingService } from '../../../common/editing/chatEditingService.js';
import { isSessionInProgressStatus } from '../agentSessionsModel.js';
import { autorun } from '../../../../../../base/common/observable.js';
import './unifiedQuickAccessActions.js'; // Register unified quick access actions
/**
 * Contribution that watches for projection-capable sessions and shows
 * the "session ready" state in the title bar when changes are available for review.
 */
let AgentSessionReadyContribution = class AgentSessionReadyContribution extends Disposable {
    static { this.ID = 'chat.agentSessionReady'; }
    constructor(chatWidgetService, configurationService, agentTitleBarStatusService, agentSessionsService, agentSessionProjectionService, chatEditingService) {
        super();
        this.chatWidgetService = chatWidgetService;
        this.configurationService = configurationService;
        this.agentTitleBarStatusService = agentTitleBarStatusService;
        this.agentSessionsService = agentSessionsService;
        this.agentSessionProjectionService = agentSessionProjectionService;
        this.chatEditingService = chatEditingService;
        this._widgetDisposables = this._register(new DisposableStore());
        this._suppressSessionReady = false; // Suppress re-showing session-ready after user explicitly exits projection
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
    _watchWidget(widget) {
        // Clear previous disposables when switching widgets
        this._widgetDisposables.clear();
        // Check initial state
        this._checkSession(widget.viewModel?.sessionResource);
        // Watch for viewmodel changes
        this._widgetDisposables.add(widget.onDidChangeViewModel(() => {
            this._checkSession(widget.viewModel?.sessionResource);
        }));
    }
    _checkSession(sessionResource) {
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
    _clearEntriesWatcher() {
        this._entriesWatcher?.dispose();
        this._entriesWatcher = undefined;
        this._watchedSessionResource = undefined;
    }
    _updateSessionReadyState(sessionResource) {
        // Check if projection is enabled
        const isEnabled = this.configurationService.getValue(ChatConfiguration.AgentSessionProjectionEnabled);
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
            hasPendingChanges = entries.some(entry => entry.state.get() === 0 /* ModifiedFileEntryState.Modified */);
            if (hasPendingChanges && !this._suppressSessionReady) {
                this.agentTitleBarStatusService.enterSessionReadyMode(session.resource, session.label);
                if (!this._watchedSessionResource || this._watchedSessionResource.toString() !== sessionResource.toString()) {
                    this._clearEntriesWatcher();
                    this._watchedSessionResource = sessionResource;
                    // Monitor the entries for changes
                    this._entriesWatcher = autorun(reader => {
                        const currentEntries = editingSession.entries.read(reader);
                        const stillHasChanges = currentEntries.some(entry => entry.state.read(reader) === 0 /* ModifiedFileEntryState.Modified */);
                        if (!stillHasChanges) {
                            this.agentTitleBarStatusService.exitSessionReadyMode();
                        }
                    });
                }
            }
            else {
                this._clearEntriesWatcher();
                this.agentTitleBarStatusService.exitSessionReadyMode();
            }
        }
        else {
            // Cloud/remote sessions: rely on changes array from the session
            this._clearEntriesWatcher();
            const changeCount = Array.isArray(session.changes)
                ? session.changes.filter(change => !!change.originalUri).length
                : 0;
            hasPendingChanges = changeCount > 0;
            if (hasPendingChanges && !this._suppressSessionReady) {
                this.agentTitleBarStatusService.enterSessionReadyMode(session.resource, session.label);
            }
            else {
                this.agentTitleBarStatusService.exitSessionReadyMode();
            }
        }
    }
};
AgentSessionReadyContribution = __decorate([
    __param(0, IChatWidgetService),
    __param(1, IConfigurationService),
    __param(2, IAgentTitleBarStatusService),
    __param(3, IAgentSessionsService),
    __param(4, IAgentSessionProjectionService),
    __param(5, IChatEditingService)
], AgentSessionReadyContribution);
// #region Agent Session Projection & Status
registerAction2(EnterAgentSessionProjectionAction);
registerAction2(ExitAgentSessionProjectionAction);
registerAction2(ToggleUnifiedAgentsBarAction);
registerSingleton(IAgentSessionProjectionService, AgentSessionProjectionService, 1 /* InstantiationType.Delayed */);
registerSingleton(IAgentTitleBarStatusService, AgentTitleBarStatusService, 1 /* InstantiationType.Delayed */);
registerWorkbenchContribution2(AgentTitleBarStatusRendering.ID, AgentTitleBarStatusRendering, 3 /* WorkbenchPhase.AfterRestored */);
registerWorkbenchContribution2(AgentSessionReadyContribution.ID, AgentSessionReadyContribution, 3 /* WorkbenchPhase.AfterRestored */);
// Register Agent Status as a menu item in the command center (alongside the search box, not replacing it)
MenuRegistry.appendMenuItem(MenuId.CommandCenter, {
    submenu: MenuId.AgentsTitleBarControlMenu,
    title: localize('agentsControl', "Agents"),
    icon: Codicon.chatSparkle,
    when: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.notEquals(`config.${ChatConfiguration.AgentStatusEnabled}`, 'hidden'), ContextKeyExpr.notEquals(`config.${ChatConfiguration.AgentStatusEnabled}`, false)),
    order: 10002 // to the right of the chat button
});
// Add to the global title bar if command center is disabled
MenuRegistry.appendMenuItem(MenuId.TitleBar, {
    submenu: MenuId.ChatTitleBarMenu,
    title: localize('title4', "Chat"),
    group: 'navigation',
    icon: Codicon.chatSparkle,
    when: ContextKeyExpr.and(ChatContextKeys.supported, ContextKeyExpr.and(ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabled.negate()), ContextKeyExpr.has('config.window.commandCenter').negate()),
    order: 1
});
// Register a placeholder action to the submenu so it appears (required for submenus)
MenuRegistry.appendMenuItem(MenuId.AgentsTitleBarControlMenu, {
    command: {
        id: 'workbench.action.chat.toggle',
        title: localize('openChat', "Open Chat"),
    },
    when: ChatContextKeys.enabled,
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
    when: ContextKeyExpr.and(ChatContextKeys.enabled, ProductQualityContext.notEqualsTo('stable')),
    group: 'z_experimental',
    order: 10
});
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRTZXNzaW9uc0V4cGVyaW1lbnRzLmNvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2V4cGVyaW1lbnRzL2FnZW50U2Vzc2lvbnNFeHBlcmltZW50cy5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGlCQUFpQixFQUFxQixNQUFNLCtEQUErRCxDQUFDO0FBQ3JILE9BQU8sRUFBRSxNQUFNLEVBQUUsWUFBWSxFQUFFLGVBQWUsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzdHLE9BQU8sRUFBRSw4QkFBOEIsRUFBRSw2QkFBNkIsRUFBRSwwQ0FBMEMsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQy9KLE9BQU8sRUFBRSxpQ0FBaUMsRUFBRSxnQ0FBZ0MsRUFBRSw0QkFBNEIsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ3ZKLE9BQU8sRUFBMEIsOEJBQThCLEVBQWtCLE1BQU0sd0NBQXdDLENBQUM7QUFDaEksT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDOUUsT0FBTyxFQUFFLDBCQUEwQixFQUFFLDJCQUEyQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDMUcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUNwRCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDNUYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFDcEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLGlCQUFpQixFQUFFLE1BQU0sOEJBQThC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