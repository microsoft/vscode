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
import './media/agentsessionprojection.css';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IEditorGroupsService } from '../../../../../services/editor/common/editorGroupsService.js';
import { IEditorService, MODAL_GROUP } from '../../../../../services/editor/common/editorService.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { isSessionInProgressStatus } from '../agentSessionsModel.js';
import { IChatWidgetService } from '../../chat.js';
import { AgentSessionProviders } from '../agentSessions.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { IWorkbenchLayoutService } from '../../../../../services/layout/browser/layoutService.js';
import { ACTION_ID_NEW_CHAT } from '../../actions/chatActions.js';
import { IChatEditingService } from '../../../common/editing/chatEditingService.js';
import { IAgentTitleBarStatusService } from './agentTitleBarStatusService.js';
import { inAgentSessionProjection } from './agentSessionProjection.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { IAgentSessionsService } from '../agentSessionsService.js';
//#region Configuration
/**
 * Provider types that support agent session projection mode.
 * Only sessions from these providers will trigger projection mode.
 */
export const AGENT_SESSION_PROJECTION_ENABLED_PROVIDERS = new Set(Object.values(AgentSessionProviders));
export const IAgentSessionProjectionService = createDecorator('agentSessionProjectionService');
//#endregion
//#region Agent Session Projection Service Implementation
let AgentSessionProjectionService = class AgentSessionProjectionService extends Disposable {
    get isActive() { return this._isActive; }
    get activeSession() { return this._activeSession; }
    constructor(contextKeyService, configurationService, editorGroupsService, editorService, logService, chatWidgetService, chatSessionsService, layoutService, commandService, chatEditingService, agentTitleBarStatusService, agentSessionsService) {
        super();
        this.configurationService = configurationService;
        this.editorGroupsService = editorGroupsService;
        this.editorService = editorService;
        this.logService = logService;
        this.chatWidgetService = chatWidgetService;
        this.chatSessionsService = chatSessionsService;
        this.layoutService = layoutService;
        this.commandService = commandService;
        this.chatEditingService = chatEditingService;
        this.agentTitleBarStatusService = agentTitleBarStatusService;
        this.agentSessionsService = agentSessionsService;
        this._isActive = false;
        /** Prevents re-entrant exits and enter-on-exit races */
        this._isExiting = false;
        /** Prevents checkForEmptyEditors from exiting during session swaps */
        this._isSwappingSessions = false;
        this._onDidChangeProjectionMode = this._register(new Emitter());
        this.onDidChangeProjectionMode = this._onDidChangeProjectionMode.event;
        this._onDidChangeActiveSession = this._register(new Emitter());
        this.onDidChangeActiveSession = this._onDidChangeActiveSession.event;
        /** Working sets per session, keyed by session resource URI string */
        this._sessionWorkingSets = new Map();
        /** Whether the auxiliary bar was maximized when entering projection mode */
        this._wasAuxiliaryBarMaximized = false;
        this._inProjectionModeContextKey = inAgentSessionProjection.bindTo(contextKeyService);
        // Listen for editor close events to exit projection mode when all editors are closed
        this._register(this.editorService.onDidCloseEditor(() => this._checkForEmptyEditors()));
        // Listen for session changes to exit projection mode if active session becomes in progress
        // Note: onDidChangeSessions fires for any session change, but _checkForInProgressSession()
        // has early exit guards and only checks when projection mode is active, making this efficient
        this._register(this.agentSessionsService.model.onDidChangeSessions(() => this._checkForInProgressSession()));
    }
    _isEnabled() {
        return this.configurationService.getValue(ChatConfiguration.AgentSessionProjectionEnabled) === true;
    }
    _checkForEmptyEditors() {
        // Only check if we're in projection mode and not swapping sessions
        if (!this._isActive || this._isExiting || this._isSwappingSessions) {
            return;
        }
        // Check if there are any visible editors
        const hasVisibleEditors = this.editorService.visibleEditors.length > 0;
        if (!hasVisibleEditors) {
            this.logService.trace('[AgentSessionProjection] All editors closed, exiting projection mode');
            this.exitProjection();
        }
    }
    _checkForInProgressSession() {
        // Only check if we're in projection mode
        if (!this._isActive || !this._activeSession) {
            return;
        }
        // Get the updated session from the model
        const updatedSession = this.agentSessionsService.getSession(this._activeSession.resource);
        if (!updatedSession) {
            return;
        }
        // If the session is now in progress, exit projection mode
        if (isSessionInProgressStatus(updatedSession.status)) {
            this.logService.trace('[AgentSessionProjection] Active session transitioned to in-progress, exiting projection mode');
            this.exitProjection({ startNewChat: false });
        }
    }
    /**
     * Opens a session in the chat panel without entering projection mode.
     */
    async _openSessionInChatPanel(session) {
        session.setRead(true);
        await this.chatSessionsService.activateChatSessionItemProvider(session.providerType);
        await this.chatWidgetService.openSession(session.resource, undefined, {
            title: { preferred: session.label },
            revealIfOpened: true
        });
    }
    /**
     * Open the session's files in a multi-diff editor.
     * @returns true if any files were opened, false if nothing to display
     */
    async _openSessionFiles(session) {
        this.logService.trace(`[AgentSessionProjection] Opening files for session '${session.label}'`, {
            hasChanges: !!session.changes,
            isArray: Array.isArray(session.changes),
            changeCount: Array.isArray(session.changes) ? session.changes.length : 0
        });
        // Open changes from the session as a multi-diff editor (like edit session view)
        if (session.changes && Array.isArray(session.changes) && session.changes.length > 0) {
            // Filter to changes that have both original and modified URIs for diff view
            const diffResources = session.changes
                .filter(change => change.originalUri)
                .map(change => ({
                originalUri: change.originalUri,
                modifiedUri: change.modifiedUri
            }));
            this.logService.trace(`[AgentSessionProjection] Found ${diffResources.length} files with diffs to display`);
            if (diffResources.length > 0) {
                // Open multi-diff editor showing all changes in a modal editor
                await this.editorService.openEditor({
                    multiDiffSource: session.resource.with({ scheme: session.resource.scheme + '-agent-session-projection' }),
                    resources: diffResources.map(dr => ({
                        original: { resource: dr.originalUri },
                        modified: { resource: dr.modifiedUri }
                    })),
                    label: localize('agentSessionProjection.changes.title', '{0} - All Changes', session.label),
                }, MODAL_GROUP);
                this.logService.trace(`[AgentSessionProjection] Multi-diff editor opened successfully in modal view`);
                // Save this as the session's working set
                const sessionKey = session.resource.toString();
                const newWorkingSet = this.editorGroupsService.saveWorkingSet(`agent-session-projection-${sessionKey}`);
                this._sessionWorkingSets.set(sessionKey, newWorkingSet);
                return true;
            }
            else {
                this.logService.trace(`[AgentSessionProjection] No files with diffs to display (all changes missing originalUri)`);
                return false;
            }
        }
        else {
            this.logService.trace(`[AgentSessionProjection] Session has no changes to display`);
            return false;
        }
    }
    async enterProjection(session) {
        // Check if the feature is enabled
        if (!this._isEnabled()) {
            this.logService.trace('[AgentSessionProjection] Agent Session Projection is disabled');
            return;
        }
        // Check if this session's provider type supports agent session projection
        if (!AGENT_SESSION_PROJECTION_ENABLED_PROVIDERS.has(session.providerType)) {
            this.logService.trace(`[AgentSessionProjection] Provider type '${session.providerType}' does not support agent session projection`);
            return;
        }
        // Detect if auxiliary bar is maximized before any layout changes
        const isAuxBarMaximized = this.layoutService.isAuxiliaryBarMaximized();
        this.logService.trace('[AgentSessionProjection] enterProjection auxiliary bar state', {
            isAuxiliaryBarMaximized: isAuxBarMaximized
        });
        // Never enter projection mode for sessions that are in progress
        // The user should only be in projection mode when reviewing completed code
        if (isSessionInProgressStatus(session.status)) {
            this.logService.trace('[AgentSessionProjection] Session is in progress, opening chat without projection mode');
            // If we're already in projection mode and switching to an in-progress session, exit projection
            if (this._isActive) {
                await this.exitProjection({ startNewChat: false });
            }
            await this._openSessionInChatPanel(session);
            return;
        }
        // For local sessions, check if there are pending edits to show
        // If there's nothing to focus, just open the chat without entering projection mode
        let hasUndecidedChanges = true;
        let editingSessionExists = true;
        if (session.providerType === AgentSessionProviders.Local) {
            const editingSession = this.chatEditingService.getEditingSession(session.resource);
            editingSessionExists = !!editingSession;
            if (editingSession) {
                hasUndecidedChanges = editingSession.entries.get().some(e => e.state.get() === 0 /* ModifiedFileEntryState.Modified */);
                if (!hasUndecidedChanges) {
                    this.logService.trace('[AgentSessionProjection] Local session has no undecided changes, opening chat without projection mode');
                }
            }
            else {
                // Editing session doesn't exist yet - treat as no changes for now
                hasUndecidedChanges = false;
                this.logService.trace('[AgentSessionProjection] Local session has no editing session yet');
            }
        }
        // If no undecided changes and we're already in projection mode, exit projection
        // But only if we actually checked the editing session (it exists) - if it's undefined,
        // it might just not be loaded yet, so don't exit projection in that case
        if (!hasUndecidedChanges && this._isActive && editingSessionExists) {
            this.logService.trace('[AgentSessionProjection] Switching to session without changes while in projection mode, exiting projection');
            await this.exitProjection({ startNewChat: false });
            await this._openSessionInChatPanel(session);
            return;
        }
        // If we're switching to a session without an editing session yet while in projection,
        // just open the chat panel but stay in projection mode (let the editing session load)
        if (!hasUndecidedChanges && this._isActive && !editingSessionExists) {
            this.logService.trace('[AgentSessionProjection] Switching to session without editing session while in projection mode, staying in projection');
            await this._openSessionInChatPanel(session);
            return;
        }
        // Only enter projection mode if there are changes to show
        if (hasUndecidedChanges) {
            // Capture the user's working set immediately (before any editors are cleared)
            if (!this._isActive && !this._preProjectionWorkingSet) {
                const visibleEditorsBefore = this.editorService.visibleEditors.length;
                this._preProjectionWorkingSet = this.editorGroupsService.saveWorkingSet('agent-session-projection-backup');
                this.logService.trace('[AgentSessionProjection] saved pre-projection working set', {
                    id: this._preProjectionWorkingSet.id,
                    visibleEditorsBefore
                });
            }
            // Set swapping flag to prevent checkForEmptyEditors from exiting during session swap
            const isSwapping = this._isActive && this._activeSession;
            if (isSwapping) {
                this._isSwappingSessions = true;
                // Already in projection mode, switching sessions - save the current session's working set
                const previousSessionKey = this._activeSession.resource.toString();
                const previousWorkingSet = this.editorGroupsService.saveWorkingSet(`agent-session-projection-${previousSessionKey}`);
                this._sessionWorkingSets.set(previousSessionKey, previousWorkingSet);
            }
            try {
                // For local sessions, changes are shown via chatEditing.viewChanges, not _openSessionFiles
                // For other providers, try to open session files from session.changes
                let filesOpened = false;
                if (session.providerType === AgentSessionProviders.Local) {
                    // Local sessions use editing session for changes - we already verified hasUndecidedChanges above
                    filesOpened = true;
                }
                else {
                    // Try to open session files - only continue with projection if files were displayed
                    filesOpened = await this._openSessionFiles(session);
                }
                if (!filesOpened) {
                    this.logService.trace('[AgentSessionProjection] No files to display, opening chat without projection mode');
                    // Restore the working set we just saved if this was our first attempt
                    if (!this._isActive && this._preProjectionWorkingSet) {
                        await this.editorGroupsService.applyWorkingSet(this._preProjectionWorkingSet);
                        this.editorGroupsService.deleteWorkingSet(this._preProjectionWorkingSet);
                        this._preProjectionWorkingSet = undefined;
                    }
                    // Fall through to just open the chat panel
                }
                else {
                    // Set active state
                    const wasActive = this._isActive;
                    this._isActive = true;
                    this._activeSession = session;
                    this._inProjectionModeContextKey.set(true);
                    this.layoutService.mainContainer.classList.add('agent-session-projection-active');
                    // Capture auxiliary bar maximized state when first entering projection
                    if (!wasActive) {
                        this._wasAuxiliaryBarMaximized = isAuxBarMaximized;
                        this.logService.trace('[AgentSessionProjection] captured auxiliary bar maximized state', {
                            wasAuxiliaryBarMaximized: this._wasAuxiliaryBarMaximized
                        });
                    }
                    // Update the agent status to show session mode
                    this.agentTitleBarStatusService.enterSessionMode(session.resource, session.label);
                    if (!wasActive) {
                        this._onDidChangeProjectionMode.fire(true);
                    }
                    // Always fire session change event (for title updates when switching sessions)
                    this._onDidChangeActiveSession.fire(session);
                }
            }
            finally {
                // Clear swapping flag
                this._isSwappingSessions = false;
            }
        }
        // Open the session in the chat panel (always, even without changes)
        await this._openSessionInChatPanel(session);
        // For local sessions with changes, also pop open the edit session's changes view
        // Must be after openSession so the editing session context is available
        if (session.providerType === AgentSessionProviders.Local && hasUndecidedChanges) {
            await this.commandService.executeCommand('chatEditing.viewChanges');
        }
        // If auxiliary bar was maximized, hide it during projection to show full editor
        // This must be done after opening the session to avoid the session opening re-showing the bar
        if (this._wasAuxiliaryBarMaximized) {
            this.logService.trace('[AgentSessionProjection] hiding maximized auxiliary bar during projection');
            this.layoutService.setPartHidden(true, "workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */);
        }
    }
    async exitProjection(options) {
        if (!this._isActive || this._isExiting) {
            return;
        }
        const startNewChat = options?.startNewChat ?? true;
        this._isExiting = true;
        this.logService.trace('[AgentSessionProjection] exitProjection start', {
            hasPreProjectionWorkingSet: !!this._preProjectionWorkingSet,
            activeSession: this._activeSession?.label,
            startNewChat,
            wasAuxiliaryBarMaximized: this._wasAuxiliaryBarMaximized
        });
        // Save the current session's working set before exiting
        if (this._activeSession) {
            const sessionKey = this._activeSession.resource.toString();
            const workingSet = this.editorGroupsService.saveWorkingSet(`agent-session-projection-${sessionKey}`);
            this._sessionWorkingSets.set(sessionKey, workingSet);
        }
        // Close projection editors (multi-diff, etc.) so the restored set is clean
        for (const group of this.editorGroupsService.groups) {
            await group.closeAllEditors();
        }
        this.logService.trace('[AgentSessionProjection] exitProjection closed editors', { visible: this.editorService.visibleEditors.length });
        // Restore the pre-projection working set (original tabs)
        if (this._preProjectionWorkingSet) {
            await this.editorGroupsService.applyWorkingSet(this._preProjectionWorkingSet);
            this.logService.trace('[AgentSessionProjection] exitProjection applied pre-projection working set', {
                visible: this.editorService.visibleEditors.length,
                id: this._preProjectionWorkingSet.id
            });
            this.editorGroupsService.deleteWorkingSet(this._preProjectionWorkingSet);
            this._preProjectionWorkingSet = undefined;
        }
        else {
            await this.editorGroupsService.applyWorkingSet('empty', { preserveFocus: true });
            this.logService.trace('[AgentSessionProjection] exitProjection no pre-working set, applied empty');
        }
        this._isActive = false;
        this._activeSession = undefined;
        this._inProjectionModeContextKey.set(false);
        const shouldRestoreMaximized = this._wasAuxiliaryBarMaximized;
        this._wasAuxiliaryBarMaximized = false;
        this.layoutService.mainContainer.classList.remove('agent-session-projection-active');
        // Update the agent status to exit session mode
        this.agentTitleBarStatusService.exitSessionMode();
        this._onDidChangeProjectionMode.fire(false);
        this._onDidChangeActiveSession.fire(undefined);
        // Start a new chat to clear the sidebar (unless caller wants to keep current chat)
        if (startNewChat) {
            await this.commandService.executeCommand(ACTION_ID_NEW_CHAT);
        }
        // Restore auxiliary bar maximized state if it was maximized before entering projection
        if (shouldRestoreMaximized) {
            this.logService.trace('[AgentSessionProjection] restoring auxiliary bar maximized state');
            // First show the auxiliary bar, then maximize it
            this.layoutService.setPartHidden(false, "workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */);
            await this.commandService.executeCommand('workbench.action.maximizeAuxiliaryBar');
        }
        this.logService.trace('[AgentSessionProjection] exitProjection complete');
        this._isExiting = false;
    }
};
AgentSessionProjectionService = __decorate([
    __param(0, IContextKeyService),
    __param(1, IConfigurationService),
    __param(2, IEditorGroupsService),
    __param(3, IEditorService),
    __param(4, ILogService),
    __param(5, IChatWidgetService),
    __param(6, IChatSessionsService),
    __param(7, IWorkbenchLayoutService),
    __param(8, ICommandService),
    __param(9, IChatEditingService),
    __param(10, IAgentTitleBarStatusService),
    __param(11, IAgentSessionsService)
], AgentSessionProjectionService);
export { AgentSessionProjectionService };
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRTZXNzaW9uUHJvamVjdGlvblNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9leHBlcmltZW50cy9hZ2VudFNlc3Npb25Qcm9qZWN0aW9uU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLG9DQUFvQyxDQUFDO0FBQzVDLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSx3Q0FBd0MsQ0FBQztBQUN4RSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDeEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3BELE9BQU8sRUFBZSxrQkFBa0IsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQzdHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUNuRyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDM0UsT0FBTyxFQUFFLG9CQUFvQixFQUFxQixNQUFNLDhEQUE4RCxDQUFDO0FBQ3ZILE9BQU8sRUFBRSxjQUFjLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDckcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQ3pGLE9BQU8sRUFBaUIseUJBQXlCLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUNwRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxlQUFlLENBQUM7QUFDbkQsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFDNUQsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0s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