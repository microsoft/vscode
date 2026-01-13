/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/focusView.css';

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IEditorGroupsService, IEditorWorkingSet } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IAgentSession } from './agentSessionsModel.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../chat.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { ACTION_ID_NEW_CHAT } from '../actions/chatActions.js';

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

const STORAGE_KEY = 'chat.focusView.workingSets';

type ISerializedWorkingSets = {
	readonly sessionWorkingSets: [string, IEditorWorkingSet][];
};

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
	private _sessionWorkingSets: Map<string, IEditorWorkingSet>;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IEditorService private readonly editorService: IEditorService,
		@ILogService private readonly logService: ILogService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IStorageService private readonly storageService: IStorageService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();

		this._inFocusViewModeContextKey = ChatContextKeys.inFocusViewMode.bindTo(contextKeyService);
		this._sessionWorkingSets = this._loadWorkingSets();
	}

	private _loadWorkingSets(): Map<string, IEditorWorkingSet> {
		const workingSets = new Map<string, IEditorWorkingSet>();
		const raw = this.storageService.get(STORAGE_KEY, StorageScope.WORKSPACE);
		if (!raw) {
			return workingSets;
		}

		try {
			const parsed = JSON.parse(raw) as ISerializedWorkingSets;
			for (const [sessionKey, workingSet] of parsed.sessionWorkingSets) {
				workingSets.set(sessionKey, workingSet);
			}
		} catch (e) {
			this.logService.error('[FocusView] Failed to parse stored working sets:', e);
		}

		return workingSets;
	}

	private _saveWorkingSets(): void {
		const serialized: ISerializedWorkingSets = {
			sessionWorkingSets: [...this._sessionWorkingSets]
		};
		this.storageService.store(STORAGE_KEY, JSON.stringify(serialized), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	private async _openSessionFiles(session: IAgentSession): Promise<void> {
		this.logService.trace('[FocusView] _openSessionFiles called');
		// Clear editors first
		await this.editorGroupsService.applyWorkingSet('empty', { preserveFocus: true });
		this.logService.trace('[FocusView] Applied empty working set');

		// Open modified files from the session if available
		if (session.changes && Array.isArray(session.changes) && session.changes.length > 0) {
			const editorsToOpen = session.changes.map(change => ({
				resource: change.modifiedUri
			}));
			this.logService.trace('[FocusView] Opening editors:', editorsToOpen.map(e => e.resource.toString()).slice(0, 5).join(', '), editorsToOpen.length > 5 ? `... and ${editorsToOpen.length - 5} more` : '');
			await this.editorService.openEditors(editorsToOpen);
			const editorCountsAfter = this.editorGroupsService.groups.map(g => g.count);
			this.logService.trace('[FocusView] Opened', session.changes.length, 'modified files from session. Editor counts now:', editorCountsAfter.join(', '));

			// Immediately save this as the session's working set so it persists
			const sessionKey = session.resource.toString();
			const newWorkingSet = this.editorGroupsService.saveWorkingSet(`focus-view-session-${sessionKey}`);
			this._sessionWorkingSets.set(sessionKey, newWorkingSet);
			this._saveWorkingSets();
			this.logService.trace('[FocusView] Saved new working set for session after opening files:', sessionKey, 'id:', newWorkingSet.id);
		} else {
			this.logService.trace('[FocusView] No modified files to open for session. changes:', session.changes);
		}
	}

	async enterFocusView(session: IAgentSession): Promise<void> {
		const sessionKey = session.resource.toString();
		this.logService.trace('[FocusView] === ENTER FOCUS VIEW ===');
		this.logService.trace('[FocusView] Session:', sessionKey);
		this.logService.trace('[FocusView] Currently active?', this._isActive);
		this.logService.trace('[FocusView] Current active session:', this._activeSession?.resource.toString() ?? 'none');
		this.logService.trace('[FocusView] Session changes:', session.changes ? (Array.isArray(session.changes) ? `${session.changes.length} files` : 'summary only') : 'none');
		this.logService.trace('[FocusView] Stored session working sets:', [...this._sessionWorkingSets.keys()].join(', ') || 'none');

		if (!this._isActive) {
			// First time entering focus view - save the current working set as our "non-focus-view" backup
			this._nonFocusViewWorkingSet = this.editorGroupsService.saveWorkingSet('focus-view-backup');
			this.logService.trace('[FocusView] Saved non-focus-view working set, id:', this._nonFocusViewWorkingSet.id);
		} else if (this._activeSession) {
			// Already in focus view, switching sessions - save the current session's working set
			const previousSessionKey = this._activeSession.resource.toString();
			const previousWorkingSet = this.editorGroupsService.saveWorkingSet(`focus-view-session-${previousSessionKey}`);
			this._sessionWorkingSets.set(previousSessionKey, previousWorkingSet);
			this._saveWorkingSets();
			this.logService.trace('[FocusView] Saved working set for previous session:', previousSessionKey, 'id:', previousWorkingSet.id);
		}

		// Check if we have a saved working set for this session
		const savedWorkingSet = this._sessionWorkingSets.get(sessionKey);
		this.logService.trace('[FocusView] Saved working set for this session:', savedWorkingSet?.id ?? 'none');

		if (savedWorkingSet) {
			// Check if the working set still exists (might have been deleted or VS Code restarted)
			const existingWorkingSets = this.editorGroupsService.getWorkingSets();
			this.logService.trace('[FocusView] Existing working sets:', existingWorkingSets.map(ws => ws.id).join(', ') || 'none');
			const workingSetExists = existingWorkingSets.some(ws => ws.id === savedWorkingSet.id);
			this.logService.trace('[FocusView] Working set exists?', workingSetExists);

			if (workingSetExists) {
				// Restore the session's saved working set
				const applied = await this.editorGroupsService.applyWorkingSet(savedWorkingSet, { preserveFocus: true });
				this.logService.trace('[FocusView] Applied working set result:', applied);
				if (applied) {
					// Check if the restored working set actually has any editors
					const editorCounts = this.editorGroupsService.groups.map(g => g.count);
					const hasEditors = editorCounts.some(c => c > 0);
					this.logService.trace('[FocusView] Editor counts per group:', editorCounts.join(', '));
					this.logService.trace('[FocusView] Has editors?', hasEditors);
					if (hasEditors) {
						this.logService.trace('[FocusView] Restored saved working set for session:', sessionKey);
					} else {
						// Working set was empty, open the session's files instead
						this.logService.trace('[FocusView] Restored working set was empty, opening session files:', sessionKey);
						this._sessionWorkingSets.delete(sessionKey);
						this._saveWorkingSets();
						await this._openSessionFiles(session);
					}
				} else {
					this.logService.warn('[FocusView] Failed to apply saved working set for session:', sessionKey);
					// Fall through to open modified files
					await this._openSessionFiles(session);
				}
			} else {
				this.logService.trace('[FocusView] Saved working set no longer exists, removing and opening files:', sessionKey);
				this._sessionWorkingSets.delete(sessionKey);
				this._saveWorkingSets();
				await this._openSessionFiles(session);
			}
		} else {
			// No saved working set - open modified files from session
			this.logService.trace('[FocusView] No saved working set, opening session files');
			await this._openSessionFiles(session);
		}

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
		this.logService.trace('[FocusView] === EXIT FOCUS VIEW ===');
		this.logService.trace('[FocusView] Currently active?', this._isActive);
		if (!this._isActive) {
			this.logService.trace('[FocusView] Not active, returning early');
			return;
		}

		this.logService.trace('[FocusView] Active session:', this._activeSession?.resource.toString() ?? 'none');
		this.logService.trace('[FocusView] Non-focus-view working set:', this._nonFocusViewWorkingSet?.id ?? 'none');

		// Save the current session's working set before exiting
		if (this._activeSession) {
			const sessionKey = this._activeSession.resource.toString();
			const editorCountsBefore = this.editorGroupsService.groups.map(g => g.count);
			this.logService.trace('[FocusView] Editor counts before saving:', editorCountsBefore.join(', '));
			const workingSet = this.editorGroupsService.saveWorkingSet(`focus-view-session-${sessionKey}`);
			this._sessionWorkingSets.set(sessionKey, workingSet);
			this._saveWorkingSets();
			this.logService.trace('[FocusView] Saved working set for session:', sessionKey, 'id:', workingSet.id);
		}

		// Restore the non-focus-view working set
		if (this._nonFocusViewWorkingSet) {
			const existingWorkingSets = this.editorGroupsService.getWorkingSets();
			const exists = existingWorkingSets.some(ws => ws.id === this._nonFocusViewWorkingSet!.id);
			this.logService.trace('[FocusView] Non-focus-view working set exists?', exists);
			if (exists) {
				await this.editorGroupsService.applyWorkingSet(this._nonFocusViewWorkingSet);
				this.editorGroupsService.deleteWorkingSet(this._nonFocusViewWorkingSet);
				this.logService.trace('[FocusView] Restored and deleted non-focus-view working set');
			} else {
				this.logService.trace('[FocusView] Non-focus-view working set no longer exists, clearing editors');
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

		this.logService.trace('[FocusView] === EXIT COMPLETE ===');
	}
}

//#endregion
