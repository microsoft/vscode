/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../base/browser/window.js';
import { Sequencer } from '../../../../base/common/async.js';
import { autorun, derived, derivedObservableWithCache, derivedOpts, observableFromEvent, runOnChange } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { isMobile, isWeb } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ViewContainerLocation } from '../../../../workbench/common/views.js';
import { IEditorGroupsService, IEditorWorkingSet } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IWorkbenchLayoutService, Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { IPaneCompositePartService } from '../../../../workbench/services/panecomposite/browser/panecomposite.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { IActiveSession, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { SessionStatus } from '../../../services/sessions/common/session.js';
import { CHANGES_VIEW_ID } from '../../changes/common/changes.js';
import { SESSIONS_FILES_CONTAINER_ID } from '../../files/browser/files.contribution.js';

interface IPendingTurnState {
	readonly hadChangesBeforeSend: boolean;
	readonly submittedAt: number;
}

/**
 * Per-session view state: auxiliary bar visibility and active view container.
 */
interface ISessionViewState {
	readonly auxiliaryBarVisible: boolean;
	readonly auxiliaryBarActiveViewContainerId: string | undefined;
}

/**
 * Full per-session layout state persisted to storage.
 */
interface ISessionLayoutEntry {
	readonly sessionResource: string;
	readonly viewState?: ISessionViewState;
	readonly editorWorkingSet?: IEditorWorkingSet;
}

/** New unified storage key for all per-session layout state. */
const SESSION_LAYOUT_STATE_KEY = 'sessions.layoutState';
/** Legacy key — read on startup for migration only. */
const WORKING_SETS_STORAGE_KEY = 'sessions.workingSets';

export class LayoutController extends Disposable {

	static readonly ID = 'workbench.contrib.sessionsLayoutController';

	private readonly _pendingTurnStateByResource = new ResourceMap<IPendingTurnState>();
	private readonly _panelVisibilityBySession = new ResourceMap<boolean>();
	private readonly _viewStateBySession: ResourceMap<ISessionViewState>;
	private readonly _workingSets: ResourceMap<IEditorWorkingSet>;
	private readonly _workingSetSequencer = new Sequencer();

	constructor(
		@IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
		@ISessionsManagementService private readonly _sessionManagementService: ISessionsManagementService,
		@IChatService private readonly _chatService: IChatService,
		@IViewsService private readonly _viewsService: IViewsService,
		@IPaneCompositePartService private readonly _paneCompositePartService: IPaneCompositePartService,
		@IStorageService private readonly _storageService: IStorageService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IEditorService private readonly _editorService: IEditorService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
	) {
		super();

		this._viewStateBySession = new ResourceMap<ISessionViewState>();
		this._workingSets = new ResourceMap<IEditorWorkingSet>();
		this._loadState();

		this._register(this._storageService.onWillSaveState(() => this._saveState()));

		const activeSessionResourceObs = derivedOpts<URI | undefined>({
			equalsFn: isEqual
		}, reader => {
			const activeSession = this._sessionManagementService.activeSession.read(reader);
			return activeSession?.resource;
		});

		const activeSessionHasChangesObs = derived<boolean>(reader => {
			const activeSession = this._sessionManagementService.activeSession.read(reader);
			if (!activeSession) {
				return false;
			}
			const changes = activeSession.changes.read(reader);
			return changes.length > 0;
		});

		const activeSessionIsUntitledObs = derived<boolean>(reader => {
			const activeSession = this._sessionManagementService.activeSession.read(reader);
			const activeSessionStatus = activeSession?.status.read(reader);

			return activeSessionStatus === SessionStatus.Untitled;
		});

		const activeSessionHasWorkspaceObs = derived<boolean>(reader => {
			const activeSession = this._sessionManagementService.activeSession.read(reader);
			return activeSession?.workspace.read(reader)?.repositories?.[0]?.uri !== undefined;
		});

		// Switch between sessions — sync auxiliary bar (skip on mobile to avoid
		// disruptive auto-expand on narrow viewports)
		if (!(isWeb && isMobile)) {
			let previousSessionResource: URI | undefined;
			this._register(autorun(reader => {
				const activeSessionResource = activeSessionResourceObs.read(reader);
				const isUntitled = activeSessionIsUntitledObs.read(reader);
				const activeSessionHasWorkspace = activeSessionHasWorkspaceObs.read(reader);
				const activeSessionHasChanges = activeSessionHasChangesObs.read(reader);

				// Save auxiliary bar state for the session we're switching away from
				const isSessionSwitch = previousSessionResource !== undefined && !isEqual(previousSessionResource, activeSessionResource);
				if (isSessionSwitch) {
					this._captureViewState(previousSessionResource!);
				}
				previousSessionResource = activeSessionResource;

				this._syncAuxiliaryBarVisibility(activeSessionResource, activeSessionHasWorkspace, isUntitled, activeSessionHasChanges);
			}));
		}

		// Switch between sessions — sync panel visibility
		this._register(autorun(reader => {
			const activeSessionResource = activeSessionResourceObs.read(reader);
			this._syncPanelVisibility(activeSessionResource);
		}));

		// When a turn is completed, check if there were changes before the turn and
		// if there are changes after the turn. If there were no changes before the
		// turn and there are changes after the turn, show the auxiliary bar.
		// Skip on mobile to avoid disruptive auto-expand on narrow viewports.
		if (!(isWeb && isMobile)) {
			this._register(autorun((reader) => {
				const activeSession = this._sessionManagementService.activeSession.read(reader);
				const activeSessionHasChanges = activeSessionHasChangesObs.read(reader);
				if (!activeSession) {
					return;
				}

				const pendingTurnState = this._pendingTurnStateByResource.get(activeSession.resource);
				if (!pendingTurnState) {
					return;
				}

				const lastTurnEnd = activeSession.lastTurnEnd.read(reader);
				const turnCompleted = !!lastTurnEnd && lastTurnEnd.getTime() >= pendingTurnState.submittedAt;
				if (!turnCompleted) {
					return;
				}

				if (!pendingTurnState.hadChangesBeforeSend && activeSessionHasChanges) {
					this._layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
					// Clear saved view state so the aux bar stays visible on next switch
					this._viewStateBySession.delete(activeSession.resource);
				}

				this._pendingTurnStateByResource.delete(activeSession.resource);
			}));

			this._register(this._chatService.onDidSubmitRequest(({ chatSessionResource }) => {
				this._pendingTurnStateByResource.set(chatSessionResource, {
					hadChangesBeforeSend: activeSessionHasChangesObs.get(),
					submittedAt: Date.now(),
				});
			}));
		}

		// Track panel visibility changes by the user
		this._register(this._layoutService.onDidChangePartVisibility(e => {
			if (e.partId !== Parts.PANEL_PART) {
				return;
			}
			const activeSession = this._sessionManagementService.activeSession.get();
			if (activeSession) {
				this._panelVisibilityBySession.set(activeSession.resource, e.visible);
			}
		}));

		// --- Editor working sets ---

		const useModalConfigObs = observableConfigValue<'off' | 'some' | 'all'>('workbench.editor.useModal', 'all', this._configurationService);

		// Workspace folders — used to defer session switch until workspace is ready
		const workspaceFoldersObs = observableFromEvent(
			this._workspaceContextService.onDidChangeWorkspaceFolders,
			() => this._workspaceContextService.getWorkspace().folders);

		const activeSessionForWorkingSet = derivedObservableWithCache<IActiveSession | undefined>(this, (reader, lastValue) => {
			const workspaceFolders = workspaceFoldersObs.read(reader);
			const activeSession = this._sessionManagementService.activeSession.read(reader);
			const activeSessionWorkspace = activeSession?.workspace.read(reader)?.repositories[0];
			const activeSessionWorkspaceUri = activeSessionWorkspace?.workingDirectory ?? activeSessionWorkspace?.uri;

			// The active session is updated before the workspace folders are updated. We
			// need to wait until the workspace folders are updated before considering the
			// active session.
			if (
				activeSessionWorkspaceUri &&
				!workspaceFolders.some(folder => isEqual(folder.uri, activeSessionWorkspaceUri))
			) {
				return lastValue;
			}

			if (isEqual(activeSession?.resource, lastValue?.resource)) {
				return lastValue;
			}

			return activeSession;
		});

		this._register(autorun(reader => {
			const useModalConfig = useModalConfigObs.read(reader);
			if (useModalConfig === 'all') {
				return;
			}

			// Session changed (save, apply)
			reader.store.add(runOnChange(activeSessionForWorkingSet, (session, previousSession) => {
				// Save working set for previous session (skip for untitled sessions)
				if (previousSession && previousSession.status.read(undefined) !== SessionStatus.Untitled) {
					this._saveWorkingSet(previousSession.resource);
				}

				// Apply working set for current session.
				// On initial load (no previous session), only apply if we have a saved working set —
				// skip applying 'empty' to avoid closing editors that are being restored.
				if (previousSession || (session && this._workingSets.has(session.resource))) {
					void this._applyWorkingSet(session?.resource);
				}
			}));

			// Session state changed (archive, delete)
			reader.store.add(this._sessionManagementService.onDidChangeSessions(e => {
				const archivedSessions = e.changed.filter(session => session.isArchived.read(undefined));
				for (const session of [...e.removed, ...archivedSessions]) {
					this._deleteWorkingSet(session.resource);
				}
			}));
		}));
	}

	// --- Auxiliary bar ---

	private _captureViewState(sessionResource: URI): void {
		const auxiliaryBarVisible = this._layoutService.isVisible(Parts.AUXILIARYBAR_PART);
		const activeViewContainerId = this._paneCompositePartService.getActivePaneComposite(ViewContainerLocation.AuxiliaryBar)?.getId();
		this._viewStateBySession.set(sessionResource, {
			auxiliaryBarVisible,
			auxiliaryBarActiveViewContainerId: activeViewContainerId,
		});
	}

	private _syncAuxiliaryBarVisibility(sessionResource: URI | undefined, hasWorkspace: boolean, isUntitled: boolean, hasChanges: boolean): void {
		if (!sessionResource || !hasWorkspace) {
			return;
		}

		if (isUntitled) {
			this._viewsService.openViewContainer(SESSIONS_FILES_CONTAINER_ID, false);
			return;
		}

		// On session switch or initial load, restore the saved view state
		const savedState = this._viewStateBySession.get(sessionResource);
		if (savedState) {
			if (!savedState.auxiliaryBarVisible) {
				this._layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
				return;
			}
			if (savedState.auxiliaryBarActiveViewContainerId) {
				this._viewsService.openViewContainer(savedState.auxiliaryBarActiveViewContainerId, false);
				return;
			}
		}

		if (hasChanges) {
			this._viewsService.openView(CHANGES_VIEW_ID, false);
		} else {
			this._viewsService.openViewContainer(SESSIONS_FILES_CONTAINER_ID, false);
		}
	}

	private _loadState(): void {
		// Load from new key first
		const raw = this._storageService.get(SESSION_LAYOUT_STATE_KEY, StorageScope.WORKSPACE);
		if (raw) {
			try {
				for (const entry of JSON.parse(raw) as ISessionLayoutEntry[]) {
					const resource = URI.parse(entry.sessionResource);
					if (entry.editorWorkingSet) {
						this._workingSets.set(resource, entry.editorWorkingSet);
					}
					if (entry.viewState) {
						this._viewStateBySession.set(resource, entry.viewState);
					}
				}
				return;
			} catch {
				// Corrupted data — remove the bad key so we don't keep failing, then fall through to legacy migration
				this._storageService.remove(SESSION_LAYOUT_STATE_KEY, StorageScope.WORKSPACE);
			}
		}

		// Migrate from legacy key (sessions.workingSets)
		const legacyRaw = this._storageService.get(WORKING_SETS_STORAGE_KEY, StorageScope.WORKSPACE);
		if (legacyRaw) {
			try {
				type LegacyEntry = { sessionResource: string; editorWorkingSet?: IEditorWorkingSet; auxiliaryBarState?: { visible: boolean; activeViewContainerId: string | undefined } };
				for (const entry of JSON.parse(legacyRaw) as LegacyEntry[]) {
					const resource = URI.parse(entry.sessionResource);
					if (entry.editorWorkingSet) {
						this._workingSets.set(resource, entry.editorWorkingSet);
					}
					if (entry.auxiliaryBarState) {
						this._viewStateBySession.set(resource, {
							auxiliaryBarVisible: entry.auxiliaryBarState.visible,
							auxiliaryBarActiveViewContainerId: entry.auxiliaryBarState.activeViewContainerId,
						});
					}
				}
			} catch {
				// ignore corrupted data
			}
			// Remove legacy key after migration
			this._storageService.remove(WORKING_SETS_STORAGE_KEY, StorageScope.WORKSPACE);
		}
	}

	private _saveState(): void {
		const activeSession = this._sessionManagementService.activeSession.get();

		// Capture current state for the active session
		if (activeSession) {
			this._captureViewState(activeSession.resource);
		}

		// Capture working set for the active session (skip untitled)
		if (activeSession && activeSession.status.read(undefined) !== SessionStatus.Untitled) {
			this._saveWorkingSet(activeSession.resource);
		}

		// Collect all session resources across all maps
		const allResources = new ResourceMap<true>();
		this._workingSets.forEach((_, r) => allResources.set(r, true));
		this._viewStateBySession.forEach((_, r) => allResources.set(r, true));

		if (allResources.size === 0) {
			this._storageService.remove(SESSION_LAYOUT_STATE_KEY, StorageScope.WORKSPACE);
			return;
		}

		const entries: ISessionLayoutEntry[] = [];
		allResources.forEach((_, resource) => {
			entries.push({
				sessionResource: resource.toString(),
				editorWorkingSet: this._workingSets.get(resource),
				viewState: this._viewStateBySession.get(resource),
			});
		});
		this._storageService.store(SESSION_LAYOUT_STATE_KEY, JSON.stringify(entries), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	// --- Panel ---

	private _syncPanelVisibility(sessionResource: URI | undefined): void {
		if (!sessionResource) {
			this._layoutService.setPartHidden(true, Parts.PANEL_PART);
			return;
		}

		const wasVisible = this._panelVisibilityBySession.get(sessionResource);
		// Default to hidden if we have no record for this session
		this._layoutService.setPartHidden(wasVisible !== true, Parts.PANEL_PART);
	}

	// --- Editor working sets ---

	private async _applyWorkingSet(sessionResource: URI | undefined): Promise<void> {
		const preserveFocus = this._layoutService.hasFocus(Parts.PANEL_PART);
		const workingSet: IEditorWorkingSet | 'empty' = sessionResource
			? (this._workingSets.get(sessionResource) ?? 'empty')
			: 'empty';

		return this._workingSetSequencer.queue(async () => {
			if (workingSet === 'empty') {
				await this._editorGroupsService.applyWorkingSet(workingSet, { preserveFocus });
				return;
			}

			if (!this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
				this._layoutService.setPartHidden(false, Parts.EDITOR_PART);
			}

			const result = await this._editorGroupsService.applyWorkingSet(workingSet, { preserveFocus });
			if (result && !this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
				this._layoutService.setPartHidden(false, Parts.EDITOR_PART);
			}
		});
	}

	private _saveWorkingSet(sessionResource: URI): void {
		this._deleteWorkingSet(sessionResource);

		if (this._editorService.visibleEditors.length > 0) {
			const workingSetName = `session-working-set:${sessionResource.toString()}`;
			const workingSet = this._editorGroupsService.saveWorkingSet(workingSetName);
			this._workingSets.set(sessionResource, workingSet);
		}
	}

	private _deleteWorkingSet(sessionResource: URI): void {
		const existingWorkingSet = this._workingSets.get(sessionResource);
		if (!existingWorkingSet) {
			return;
		}

		this._editorGroupsService.deleteWorkingSet(existingWorkingSet);
		this._workingSets.delete(sessionResource);
		this._viewStateBySession.delete(sessionResource);
	}
}
