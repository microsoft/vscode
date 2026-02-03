/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentsessionprojection.css';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { IContextKey, IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IEditorGroupsService, IEditorWorkingSet } from '../../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IAgentSession, isSessionInProgressStatus } from '../agentSessionsModel.js';
import { IChatWidgetService } from '../../chat.js';
import { AgentSessionProviders } from '../agentSessions.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { IWorkbenchLayoutService, Parts } from '../../../../../services/layout/browser/layoutService.js';
import { ACTION_ID_NEW_CHAT } from '../../actions/chatActions.js';
import { IChatEditingService, ModifiedFileEntryState } from '../../../common/editing/chatEditingService.js';
import { IAgentTitleBarStatusService } from './agentTitleBarStatusService.js';
import { inAgentSessionProjection } from './agentSessionProjection.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { IAgentSessionsService } from '../agentSessionsService.js';

//#region Configuration

/**
 * Provider types that support agent session projection mode.
 * Only sessions from these providers will trigger projection mode.
 */
export const AGENT_SESSION_PROJECTION_ENABLED_PROVIDERS: Set<string> = new Set(Object.values(AgentSessionProviders));

//#endregion

//#region Agent Session Projection Service Interface

export interface IAgentSessionProjectionService {
	readonly _serviceBrand: undefined;

	/**
	 * Whether projection mode is active.
	 */
	readonly isActive: boolean;

	/**
	 * The currently active session in projection mode, if any.
	 */
	readonly activeSession: IAgentSession | undefined;

	/**
	 * Event fired when projection mode changes.
	 */
	readonly onDidChangeProjectionMode: Event<boolean>;

	/**
	 * Event fired when the active session changes (including when switching between sessions).
	 */
	readonly onDidChangeActiveSession: Event<IAgentSession | undefined>;

	/**
	 * Enter projection mode for the given session.
	 */
	enterProjection(session: IAgentSession): Promise<void>;

	/**
	 * Exit projection mode.
	 * @param options.startNewChat If true (default), starts a new chat after exiting. Set to false to keep the current chat open.
	 */
	exitProjection(options?: { startNewChat?: boolean }): Promise<void>;
}

export const IAgentSessionProjectionService = createDecorator<IAgentSessionProjectionService>('agentSessionProjectionService');

//#endregion

//#region Agent Session Projection Service Implementation

export class AgentSessionProjectionService extends Disposable implements IAgentSessionProjectionService {

	declare readonly _serviceBrand: undefined;

	private _isActive = false;
	get isActive(): boolean { return this._isActive; }

	/** Prevents re-entrant exits and enter-on-exit races */
	private _isExiting = false;

	/** Prevents checkForEmptyEditors from exiting during session swaps */
	private _isSwappingSessions = false;

	private _activeSession: IAgentSession | undefined;
	get activeSession(): IAgentSession | undefined { return this._activeSession; }

	private readonly _onDidChangeProjectionMode = this._register(new Emitter<boolean>());
	readonly onDidChangeProjectionMode = this._onDidChangeProjectionMode.event;

	private readonly _onDidChangeActiveSession = this._register(new Emitter<IAgentSession | undefined>());
	readonly onDidChangeActiveSession = this._onDidChangeActiveSession.event;

	private readonly _inProjectionModeContextKey: IContextKey<boolean>;

	/** Working set saved when entering projection mode (to restore on exit) */
	private _preProjectionWorkingSet: IEditorWorkingSet | undefined;

	/** Working sets per session, keyed by session resource URI string */
	private readonly _sessionWorkingSets = new Map<string, IEditorWorkingSet>();

	/** Whether the auxiliary bar was maximized when entering projection mode */
	private _wasAuxiliaryBarMaximized = false;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IEditorService private readonly editorService: IEditorService,
		@ILogService private readonly logService: ILogService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@ICommandService private readonly commandService: ICommandService,
		@IChatEditingService private readonly chatEditingService: IChatEditingService,
		@IAgentTitleBarStatusService private readonly agentTitleBarStatusService: IAgentTitleBarStatusService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
	) {
		super();

		this._inProjectionModeContextKey = inAgentSessionProjection.bindTo(contextKeyService);

		// Listen for editor close events to exit projection mode when all editors are closed
		this._register(this.editorService.onDidCloseEditor(() => this._checkForEmptyEditors()));

		// Listen for session changes to exit projection mode if active session becomes in progress
		// Note: onDidChangeSessions fires for any session change, but _checkForInProgressSession()
		// has early exit guards and only checks when projection mode is active, making this efficient
		this._register(this.agentSessionsService.model.onDidChangeSessions(() => this._checkForInProgressSession()));
	}

	private _isEnabled(): boolean {
		return this.configurationService.getValue<boolean>(ChatConfiguration.AgentSessionProjectionEnabled) === true;
	}

	private _checkForEmptyEditors(): void {
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

	private _checkForInProgressSession(): void {
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
	private async _openSessionInChatPanel(session: IAgentSession): Promise<void> {
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
	private async _openSessionFiles(session: IAgentSession): Promise<boolean> {
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
					originalUri: change.originalUri!,
					modifiedUri: change.modifiedUri
				}));

			this.logService.trace(`[AgentSessionProjection] Found ${diffResources.length} files with diffs to display`);

			if (diffResources.length > 0) {
				// Clear editors only when we know we have content to display
				await this.editorGroupsService.applyWorkingSet('empty', { preserveFocus: true });

				// Open multi-diff editor showing all changes
				await this.commandService.executeCommand('_workbench.openMultiDiffEditor', {
					multiDiffSourceUri: session.resource.with({ scheme: session.resource.scheme + '-agent-session-projection' }),
					title: localize('agentSessionProjection.changes.title', '{0} - All Changes', session.label),
					resources: diffResources,
				});

				this.logService.trace(`[AgentSessionProjection] Multi-diff editor opened successfully`);

				// Save this as the session's working set
				const sessionKey = session.resource.toString();
				const newWorkingSet = this.editorGroupsService.saveWorkingSet(`agent-session-projection-${sessionKey}`);
				this._sessionWorkingSets.set(sessionKey, newWorkingSet);
				return true;
			} else {
				this.logService.trace(`[AgentSessionProjection] No files with diffs to display (all changes missing originalUri)`);
				return false;
			}
		} else {
			this.logService.trace(`[AgentSessionProjection] Session has no changes to display`);
			return false;
		}
	}

	async enterProjection(session: IAgentSession): Promise<void> {
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
				hasUndecidedChanges = editingSession.entries.get().some(e => e.state.get() === ModifiedFileEntryState.Modified);
				if (!hasUndecidedChanges) {
					this.logService.trace('[AgentSessionProjection] Local session has no undecided changes, opening chat without projection mode');
				}
			} else {
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
				const previousSessionKey = this._activeSession!.resource.toString();
				const previousWorkingSet = this.editorGroupsService.saveWorkingSet(`agent-session-projection-${previousSessionKey}`);
				this._sessionWorkingSets.set(previousSessionKey, previousWorkingSet);
			}

			try {
				// For local sessions, changes are shown via chatEditing.viewChanges, not _openSessionFiles
				// For other providers, try to open session files from session.changes
				let filesOpened = false;
				if (session.providerType === AgentSessionProviders.Local) {
					// Local sessions use editing session for changes - we already verified hasUndecidedChanges above
					// Clear editors to prepare for the changes view
					await this.editorGroupsService.applyWorkingSet('empty', { preserveFocus: true });
					filesOpened = true;
				} else {
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
				} else {
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
			} finally {
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
			this.layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
		}
	}

	async exitProjection(options?: { startNewChat?: boolean }): Promise<void> {
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
		} else {
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
			this.layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
			await this.commandService.executeCommand('workbench.action.maximizeAuxiliaryBar');
		}

		this.logService.trace('[AgentSessionProjection] exitProjection complete');
		this._isExiting = false;
	}
}
//#endregion
