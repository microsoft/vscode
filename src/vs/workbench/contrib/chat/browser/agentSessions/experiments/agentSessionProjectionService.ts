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
import { IAgentSession } from '../agentSessionsModel.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../../chat.js';
import { AgentSessionProviders } from '../agentSessions.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { IWorkbenchLayoutService } from '../../../../../services/layout/browser/layoutService.js';
import { ACTION_ID_NEW_CHAT } from '../../actions/chatActions.js';
import { IChatEditingService, ModifiedFileEntryState } from '../../../common/editing/chatEditingService.js';
import { IAgentTitleBarStatusService } from './agentTitleBarStatusService.js';
import { IWorkbenchContribution } from '../../../../../common/contributions.js';
import { inAgentSessionProjection } from './agentSessionProjection.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { ISessionOpenOptions, sessionOpenerRegistry } from '../agentSessionsOpener.js';
import { ServicesAccessor } from '../../../../../../editor/browser/editorExtensions.js';

//#region Configuration

/**
 * Provider types that support agent session projection mode.
 * Only sessions from these providers will trigger projection mode.
 */
const AGENT_SESSION_PROJECTION_ENABLED_PROVIDERS: Set<string> = new Set(Object.values(AgentSessionProviders));

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
	 */
	exitProjection(): Promise<void>;
}

export const IAgentSessionProjectionService = createDecorator<IAgentSessionProjectionService>('agentSessionProjectionService');

//#endregion

//#region Agent Session Projection Service Implementation

export class AgentSessionProjectionService extends Disposable implements IAgentSessionProjectionService {

	declare readonly _serviceBrand: undefined;

	private _isActive = false;
	get isActive(): boolean { return this._isActive; }

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
	) {
		super();

		this._inProjectionModeContextKey = inAgentSessionProjection.bindTo(contextKeyService);

		// Listen for editor close events to exit projection mode when all editors are closed
		this._register(this.editorService.onDidCloseEditor(() => this._checkForEmptyEditors()));
	}

	private _isEnabled(): boolean {
		return this.configurationService.getValue<boolean>(ChatConfiguration.AgentSessionProjectionEnabled) === true;
	}

	private _checkForEmptyEditors(): void {
		// Only check if we're in projection mode
		if (!this._isActive) {
			return;
		}

		// Check if there are any visible editors
		const hasVisibleEditors = this.editorService.visibleEditors.length > 0;

		if (!hasVisibleEditors) {
			this.logService.trace('[AgentSessionProjection] All editors closed, exiting projection mode');
			this.exitProjection();
		}
	}

	/**
	 * Open the session's files in a multi-diff editor.
	 * @returns true if any files were opened, false if nothing to display
	 */
	private async _openSessionFiles(session: IAgentSession): Promise<boolean> {
		// Clear editors first
		await this.editorGroupsService.applyWorkingSet('empty', { preserveFocus: true });

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

		// For local sessions, check if there are pending edits to show
		// If there's nothing to focus, just open the chat without entering projection mode
		let hasUndecidedChanges = true;
		if (session.providerType === AgentSessionProviders.Local) {
			const editingSession = this.chatEditingService.getEditingSession(session.resource);
			hasUndecidedChanges = editingSession?.entries.get().some(e => e.state.get() === ModifiedFileEntryState.Modified) ?? false;
			if (!hasUndecidedChanges) {
				this.logService.trace('[AgentSessionProjection] Local session has no undecided changes, opening chat without projection mode');
			}
		}

		// Only enter projection mode if there are changes to show
		if (hasUndecidedChanges) {
			if (!this._isActive) {
				// First time entering projection mode - save the current working set as our backup
				this._preProjectionWorkingSet = this.editorGroupsService.saveWorkingSet('agent-session-projection-backup');
			} else if (this._activeSession) {
				// Already in projection mode, switching sessions - save the current session's working set
				const previousSessionKey = this._activeSession.resource.toString();
				const previousWorkingSet = this.editorGroupsService.saveWorkingSet(`agent-session-projection-${previousSessionKey}`);
				this._sessionWorkingSets.set(previousSessionKey, previousWorkingSet);
			}

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

				// Update the agent status to show session mode
				this.agentTitleBarStatusService.enterSessionMode(session.resource.toString(), session.label);

				if (!wasActive) {
					this._onDidChangeProjectionMode.fire(true);
				}
				// Always fire session change event (for title updates when switching sessions)
				this._onDidChangeActiveSession.fire(session);
			}
		}

		// Open the session in the chat panel (always, even without changes)
		session.setRead(true);
		await this.chatSessionsService.activateChatSessionItemProvider(session.providerType);
		await this.chatWidgetService.openSession(session.resource, ChatViewPaneTarget, {
			title: { preferred: session.label },
			revealIfOpened: true
		});

		// For local sessions with changes, also pop open the edit session's changes view
		// Must be after openSession so the editing session context is available
		if (session.providerType === AgentSessionProviders.Local && hasUndecidedChanges) {
			await this.commandService.executeCommand('chatEditing.viewChanges');
		}
	}

	async exitProjection(): Promise<void> {
		if (!this._isActive) {
			return;
		}

		// Save the current session's working set before exiting
		if (this._activeSession) {
			const sessionKey = this._activeSession.resource.toString();
			const workingSet = this.editorGroupsService.saveWorkingSet(`agent-session-projection-${sessionKey}`);
			this._sessionWorkingSets.set(sessionKey, workingSet);
		}

		// Restore the pre-projection working set
		if (this._preProjectionWorkingSet) {
			const existingWorkingSets = this.editorGroupsService.getWorkingSets();
			const exists = existingWorkingSets.some(ws => ws.id === this._preProjectionWorkingSet!.id);
			if (exists) {
				await this.editorGroupsService.applyWorkingSet(this._preProjectionWorkingSet);
				this.editorGroupsService.deleteWorkingSet(this._preProjectionWorkingSet);
			} else {
				await this.editorGroupsService.applyWorkingSet('empty', { preserveFocus: true });
			}
			this._preProjectionWorkingSet = undefined;
		}

		this._isActive = false;
		this._activeSession = undefined;
		this._inProjectionModeContextKey.set(false);
		this.layoutService.mainContainer.classList.remove('agent-session-projection-active');

		// Update the agent status to exit session mode
		this.agentTitleBarStatusService.exitSessionMode();

		this._onDidChangeProjectionMode.fire(false);
		this._onDidChangeActiveSession.fire(undefined);

		// Start a new chat to clear the sidebar
		await this.commandService.executeCommand(ACTION_ID_NEW_CHAT);
	}
}

//#endregion

//#region Agent Session Projection Opener Contribution

export class AgentSessionProjectionOpenerContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentSessionProjectionOpener';

	constructor(
		@IAgentSessionProjectionService private readonly agentSessionProjectionService: IAgentSessionProjectionService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();

		this._register(sessionOpenerRegistry.registerParticipant({
			handleOpenSession: async (_accessor: ServicesAccessor, session: IAgentSession, _openOptions?: ISessionOpenOptions): Promise<boolean> => {
				// Only handle if projection mode is enabled
				if (this.configurationService.getValue<boolean>(ChatConfiguration.AgentSessionProjectionEnabled) !== true) {
					return false;
				}

				// Enter projection mode for the session
				await this.agentSessionProjectionService.enterProjection(session);

				// Return true to indicate we handled the session (projection mode opens the chat itself)
				return true;
			}
		}));
	}
}

//#endregion
