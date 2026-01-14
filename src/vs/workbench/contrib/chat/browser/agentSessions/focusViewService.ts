/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/focusView.css';

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IEditorGroupsService, IEditorWorkingSet } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IAgentSession } from './agentSessionsModel.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../chat.js';
import { AgentSessionProviders } from './agentSessions.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';
import { ChatConfiguration } from '../../common/constants.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { ACTION_ID_NEW_CHAT } from '../actions/chatActions.js';

//#region Configuration

/**
 * Provider types that support agent session projection mode.
 * Only sessions from these providers will trigger focus view.
 *
 * Configuration:
 * - AgentSessionProviders.Local: Local chat sessions (disabled)
 * - AgentSessionProviders.Background: Background CLI agents (enabled)
 * - AgentSessionProviders.Cloud: Cloud agents (enabled)
 */
const AGENT_SESSION_PROJECTION_ENABLED_PROVIDERS: Set<string> = new Set([
	AgentSessionProviders.Background,
	AgentSessionProviders.Cloud,
]);

//#endregion

//#region Focus View Service Interface

export interface IFocusViewService {
	readonly _serviceBrand: undefined;

	/**
	 * Whether focus view mode is active.
	 */
	readonly isActive: boolean;

	/**
	 * The currently active session in focus view, if any.
	 */
	readonly activeSession: IAgentSession | undefined;

	/**
	 * Event fired when focus view mode changes.
	 */
	readonly onDidChangeFocusViewMode: Event<boolean>;

	/**
	 * Event fired when the active session changes (including when switching between sessions).
	 */
	readonly onDidChangeActiveSession: Event<IAgentSession | undefined>;

	/**
	 * Enter focus view mode for the given session.
	 */
	enterFocusView(session: IAgentSession): Promise<void>;

	/**
	 * Exit focus view mode.
	 */
	exitFocusView(): Promise<void>;
}

export const IFocusViewService = createDecorator<IFocusViewService>('focusViewService');

//#endregion

//#region Focus View Service Implementation

export class FocusViewService extends Disposable implements IFocusViewService {

	declare readonly _serviceBrand: undefined;

	private _isActive = false;
	get isActive(): boolean { return this._isActive; }

	private _activeSession: IAgentSession | undefined;
	get activeSession(): IAgentSession | undefined { return this._activeSession; }

	private readonly _onDidChangeFocusViewMode = this._register(new Emitter<boolean>());
	readonly onDidChangeFocusViewMode = this._onDidChangeFocusViewMode.event;

	private readonly _onDidChangeActiveSession = this._register(new Emitter<IAgentSession | undefined>());
	readonly onDidChangeActiveSession = this._onDidChangeActiveSession.event;

	private readonly _inFocusViewModeContextKey: IContextKey<boolean>;

	/** Working set saved when entering focus view (to restore on exit) */
	private _nonFocusViewWorkingSet: IEditorWorkingSet | undefined;

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
	) {
		super();

		this._inFocusViewModeContextKey = ChatContextKeys.inFocusViewMode.bindTo(contextKeyService);

		// Listen for editor close events to exit focus view when all editors are closed
		this._register(this.editorService.onDidCloseEditor(() => this._checkForEmptyEditors()));
	}

	private _isEnabled(): boolean {
		return this.configurationService.getValue<boolean>(ChatConfiguration.AgentSessionProjectionEnabled) === true;
	}

	private _checkForEmptyEditors(): void {
		// Only check if we're in focus view mode
		if (!this._isActive) {
			return;
		}

		// Check if there are any visible editors
		const hasVisibleEditors = this.editorService.visibleEditors.length > 0;

		if (!hasVisibleEditors) {
			this.logService.trace('[FocusView] All editors closed, exiting focus view mode');
			this.exitFocusView();
		}
	}

	private async _openSessionFiles(session: IAgentSession): Promise<void> {
		// Clear editors first
		await this.editorGroupsService.applyWorkingSet('empty', { preserveFocus: true });

		this.logService.trace(`[FocusView] Opening files for session '${session.label}'`, {
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

			this.logService.trace(`[FocusView] Found ${diffResources.length} files with diffs to display`);

			if (diffResources.length > 0) {
				// Open multi-diff editor showing all changes
				await this.commandService.executeCommand('_workbench.openMultiDiffEditor', {
					multiDiffSourceUri: session.resource.with({ scheme: session.resource.scheme + '-agent-session-projection' }),
					title: localize('agentSessionProjection.changes.title', '{0} - All Changes', session.label),
					resources: diffResources,
				});

				this.logService.trace(`[FocusView] Multi-diff editor opened successfully`);

				// Save this as the session's working set
				const sessionKey = session.resource.toString();
				const newWorkingSet = this.editorGroupsService.saveWorkingSet(`focus-view-session-${sessionKey}`);
				this._sessionWorkingSets.set(sessionKey, newWorkingSet);
			} else {
				this.logService.trace(`[FocusView] No files with diffs to display (all changes missing originalUri)`);
			}
		} else {
			this.logService.trace(`[FocusView] Session has no changes to display`);
		}
	}

	async enterFocusView(session: IAgentSession): Promise<void> {
		// Check if the feature is enabled
		if (!this._isEnabled()) {
			this.logService.trace('[FocusView] Agent Session Projection is disabled');
			return;
		}

		// Check if this session's provider type supports agent session projection
		if (!AGENT_SESSION_PROJECTION_ENABLED_PROVIDERS.has(session.providerType)) {
			this.logService.trace(`[FocusView] Provider type '${session.providerType}' does not support agent session projection`);
			return;
		}

		if (!this._isActive) {
			// First time entering focus view - save the current working set as our "non-focus-view" backup
			this._nonFocusViewWorkingSet = this.editorGroupsService.saveWorkingSet('focus-view-backup');
		} else if (this._activeSession) {
			// Already in focus view, switching sessions - save the current session's working set
			const previousSessionKey = this._activeSession.resource.toString();
			const previousWorkingSet = this.editorGroupsService.saveWorkingSet(`focus-view-session-${previousSessionKey}`);
			this._sessionWorkingSets.set(previousSessionKey, previousWorkingSet);
		}

		// Always open session files to ensure they're displayed
		await this._openSessionFiles(session);

		// Set active state
		const wasActive = this._isActive;
		this._isActive = true;
		this._activeSession = session;
		this._inFocusViewModeContextKey.set(true);
		this.layoutService.mainContainer.classList.add('focus-view-active');
		if (!wasActive) {
			this._onDidChangeFocusViewMode.fire(true);
		}
		// Always fire session change event (for title updates when switching sessions)
		this._onDidChangeActiveSession.fire(session);

		// Open the session in the chat panel
		session.setRead(true);
		await this.chatSessionsService.activateChatSessionItemProvider(session.providerType);
		await this.chatWidgetService.openSession(session.resource, ChatViewPaneTarget, {
			title: { preferred: session.label },
			revealIfOpened: true
		});
	}

	async exitFocusView(): Promise<void> {
		if (!this._isActive) {
			return;
		}

		// Save the current session's working set before exiting
		if (this._activeSession) {
			const sessionKey = this._activeSession.resource.toString();
			const workingSet = this.editorGroupsService.saveWorkingSet(`focus-view-session-${sessionKey}`);
			this._sessionWorkingSets.set(sessionKey, workingSet);
		}

		// Restore the non-focus-view working set
		if (this._nonFocusViewWorkingSet) {
			const existingWorkingSets = this.editorGroupsService.getWorkingSets();
			const exists = existingWorkingSets.some(ws => ws.id === this._nonFocusViewWorkingSet!.id);
			if (exists) {
				await this.editorGroupsService.applyWorkingSet(this._nonFocusViewWorkingSet);
				this.editorGroupsService.deleteWorkingSet(this._nonFocusViewWorkingSet);
			} else {
				await this.editorGroupsService.applyWorkingSet('empty', { preserveFocus: true });
			}
			this._nonFocusViewWorkingSet = undefined;
		}

		this._isActive = false;
		this._activeSession = undefined;
		this._inFocusViewModeContextKey.set(false);
		this.layoutService.mainContainer.classList.remove('focus-view-active');
		this._onDidChangeFocusViewMode.fire(false);
		this._onDidChangeActiveSession.fire(undefined);

		// Start a new chat to clear the sidebar
		await this.commandService.executeCommand(ACTION_ID_NEW_CHAT);
	}
}

//#endregion
