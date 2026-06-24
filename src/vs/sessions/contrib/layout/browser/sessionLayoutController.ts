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
import { ViewContainerLocation } from '../../../../workbench/common/views.js';
import { IEditorGroupsService, IEditorWorkingSet } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { IPaneCompositePartService } from '../../../../workbench/services/panecomposite/browser/panecomposite.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';
import { IActiveSession, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { SessionStatus } from '../../../services/sessions/common/session.js';
import { CHANGES_VIEW_ID } from '../../changes/common/changes.js';
import { SESSIONS_FILES_CONTAINER_ID } from '../../files/browser/files.contribution.js';

/**
 * Per-session view state: auxiliary bar visibility and active view container.
 */
interface ISessionViewState {
	readonly auxiliaryBarVisible: boolean;
	readonly auxiliaryBarActiveViewContainerId: string | undefined;
}

/**
 * Shared layout state for the new-session (untitled) view. Untitled sessions
 * each have a distinct resource, so a single value carries the user's choices
 * across new sessions.
 */
interface INewSessionViewState {
	readonly auxiliaryBarVisible: boolean;
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
/** Shared layout state for the new-session (untitled) view. */
const NEW_SESSION_VIEW_STATE_KEY = 'sessions.newSessionViewState';

export class LayoutController extends Disposable {

	static readonly ID = 'workbench.contrib.sessionsLayoutController';

	private readonly _panelVisibilityBySession = new ResourceMap<boolean>();
	private readonly _viewStateBySession: ResourceMap<ISessionViewState>;
	private readonly _workingSets: ResourceMap<IEditorWorkingSet>;
	private readonly _workingSetSequencer = new Sequencer();

	/**
	 * Shared layout state for the new-session view, persisted across reloads.
	 * `undefined` means no explicit choice yet (aux bar defaults to visible).
	 */
	private _newSessionViewState: INewSessionViewState | undefined;

	private readonly _useModalConfigObs;
	constructor(

		@IAgentWorkbenchLayoutService private readonly _layoutService: IAgentWorkbenchLayoutService,
		@ISessionsManagementService private readonly _sessionManagementService: ISessionsManagementService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
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
			const activeSession = this._sessionsService.activeSession.read(reader);
			return activeSession?.resource;
		});

		const activeSessionHasChangesObs = derived<boolean>(reader => {
			const activeSession = this._sessionsService.activeSession.read(reader);
			if (!activeSession) {
				return false;
			}
			const changes = activeSession.changes.read(reader);
			return changes.length > 0;
		});

		const activeSessionIsUntitledObs = derived<boolean>(reader => {
			const activeSession = this._sessionsService.activeSession.read(reader);
			const activeSessionStatus = activeSession?.status.read(reader);

			return activeSessionStatus === SessionStatus.Untitled;
		});

		const activeSessionHasWorkspaceObs = derived<boolean>(reader => {
			const activeSession = this._sessionsService.activeSession.read(reader);
			return activeSession?.workspace.read(reader)?.folders?.[0]?.root !== undefined;
		});

		const multipleSessionsVisibleObs = derived<boolean>(reader => {
			return this._sessionsService.visibleSessions.read(reader).length > 1;
		});

		// When multiple sessions are visible, drop per-session view/panel state
		// for each visible session (editor working sets are preserved).
		// This will ensure the default visibility logic will be used again after
		// closing all visible session and opening an existing one
		this._register(autorun(reader => {
			const visibleSessions = this._sessionsService.visibleSessions.read(reader);
			if (visibleSessions.length <= 1) {
				return;
			}
			for (const session of visibleSessions) {
				if (!session) {
					continue;
				}
				this._viewStateBySession.delete(session.resource);
				this._panelVisibilityBySession.delete(session.resource);
			}
		}));

		// Switch between sessions — sync auxiliary bar (skip on mobile to avoid
		// disruptive auto-expand on narrow viewports)
		if (!(isWeb && isMobile)) {
			let previousSessionResource: URI | undefined;
			this._register(autorun(reader => {
				const activeSessionResource = activeSessionResourceObs.read(reader);
				const isUntitled = activeSessionIsUntitledObs.read(reader);
				const activeSessionHasWorkspace = activeSessionHasWorkspaceObs.read(reader);
				const activeSessionHasChanges = activeSessionHasChangesObs.read(reader);
				const multipleVisible = multipleSessionsVisibleObs.read(reader);

				if (multipleVisible) {
					previousSessionResource = activeSessionResource;
					return;
				}

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
			if (multipleSessionsVisibleObs.read(reader)) {
				return;
			}
			this._syncPanelVisibility(activeSessionResource);
		}));

		// Track panel visibility changes by the user
		this._register(this._layoutService.onDidChangePartVisibility(e => {
			if (e.partId !== Parts.PANEL_PART) {
				return;
			}
			if (multipleSessionsVisibleObs.get()) {
				return;
			}
			const activeSession = this._sessionsService.activeSession.get();
			if (activeSession) {
				this._panelVisibilityBySession.set(activeSession.resource, e.visible);
			}
		}));

		// Track auxiliary bar visibility changes by the user so that hiding the
		// secondary side bar (Side Panel) for a session is remembered immediately,
		// not only on the next session switch. Without this the sync autorun
		// (which re-runs when e.g. the session's changes state updates) would fall
		// back to the default visibility logic and re-reveal the aux bar.
		if (!(isWeb && isMobile)) {
			this._register(this._layoutService.onDidChangePartVisibility(e => {
				if (e.partId !== Parts.AUXILIARYBAR_PART) {
					return;
				}
				if (multipleSessionsVisibleObs.get()) {
					return;
				}
				const activeSession = this._sessionsService.activeSession.get();
				if (!activeSession) {
					return;
				}
				if (activeSession.status.get() === SessionStatus.Untitled) {
					this._setNewSessionViewState({ auxiliaryBarVisible: e.visible });
				} else {
					this._captureViewState(activeSession.resource);
				}
			}));
		}

		// --- Editor working sets ---

		this._useModalConfigObs = observableConfigValue<'off' | 'some' | 'all'>('workbench.editor.useModal', 'all', this._configurationService);

		// Workspace folders — used to defer session switch until workspace is ready
		const workspaceFoldersObs = observableFromEvent(
			this._workspaceContextService.onDidChangeWorkspaceFolders,
			() => this._workspaceContextService.getWorkspace().folders);

		const activeSessionForWorkingSet = derivedObservableWithCache<IActiveSession | undefined>(this, (reader, lastValue) => {
			const workspaceFolders = workspaceFoldersObs.read(reader);
			const activeSession = this._sessionsService.activeSession.read(reader);
			const activeSessionWorkspaceUri = activeSession?.workspace.read(reader)?.folders[0]?.workingDirectory;

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
			const useModalConfig = this._useModalConfigObs.read(reader);
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
					void this._applyWorkingSet(session?.resource, { isInitialRestore: !previousSession });
				}
			}));

			// Session state changed (archive, delete)
			reader.store.add(this._sessionManagementService.onDidChangeSessions(e => {
				const archivedSessions = e.changed.filter(session => session.isArchived.read(undefined));
				for (const session of [...e.removed, ...archivedSessions]) {
					this._deleteWorkingSet(session.resource);
					this._viewStateBySession.delete(session.resource);
				}
			}));
		}));
	}

	// --- Auxiliary bar ---

	/**
	 * Reveals the editor part. Editor working sets are restored into the shared
	 * editor area on session switch, which requires the editor part to be
	 * visible.
	 */
	private _revealEditorPartForWorkingSet(): void {
		this._layoutService.setPartHidden(false, Parts.EDITOR_PART);
	}

	private _captureViewState(sessionResource: URI): void {
		const auxiliaryBarVisible = this._layoutService.isVisible(Parts.AUXILIARYBAR_PART);
		const activeViewContainerId = this._paneCompositePartService.getActivePaneComposite(ViewContainerLocation.AuxiliaryBar)?.getId();
		this._viewStateBySession.set(sessionResource, {
			auxiliaryBarVisible,
			auxiliaryBarActiveViewContainerId: activeViewContainerId,
		});
	}

	private _setNewSessionViewState(state: INewSessionViewState): void {
		this._newSessionViewState = state;
		this._storageService.store(NEW_SESSION_VIEW_STATE_KEY, JSON.stringify(state), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	private _syncAuxiliaryBarVisibility(sessionResource: URI | undefined, hasWorkspace: boolean, isUntitled: boolean, hasChanges: boolean): void {
		if (!sessionResource || !hasWorkspace) {
			return;
		}

		// New-session view: all untitled sessions share one state.
		if (isUntitled) {
			if (this._newSessionViewState && !this._newSessionViewState.auxiliaryBarVisible) {
				this._layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
			} else {
				this._openDefaultAuxiliaryBarContainer(hasChanges);
			}
			return;
		}

		const savedState = this._viewStateBySession.get(sessionResource);

		// Existing sessions are never auto-opened: hide unless explicitly left visible.
		if (!savedState || !savedState.auxiliaryBarVisible) {
			this._layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
			return;
		}

		// Restore the user's last explicit choice, but only if that pane is still pinned.
		const savedContainerId = savedState.auxiliaryBarActiveViewContainerId;
		if (savedContainerId && this._isAuxiliaryBarContainerPinned(savedContainerId)) {
			this._viewsService.openViewContainer(savedContainerId, false);
			return;
		}

		this._openDefaultAuxiliaryBarContainer(hasChanges);
	}

	/** Prefer Changes when the session has changes, otherwise Files (falling back to Changes if Files is hidden). */
	private _openDefaultAuxiliaryBarContainer(hasChanges: boolean): void {
		if (hasChanges || !this._isAuxiliaryBarContainerPinned(SESSIONS_FILES_CONTAINER_ID)) {
			this._viewsService.openView(CHANGES_VIEW_ID, false);
		} else {
			this._viewsService.openViewContainer(SESSIONS_FILES_CONTAINER_ID, false);
		}
	}

	private _isAuxiliaryBarContainerPinned(containerId: string): boolean {
		return this._paneCompositePartService
			.getPinnedPaneCompositeIds(ViewContainerLocation.AuxiliaryBar)
			.includes(containerId);
	}

	private _loadState(): void {
		const newSessionRaw = this._storageService.get(NEW_SESSION_VIEW_STATE_KEY, StorageScope.WORKSPACE);
		if (newSessionRaw) {
			try {
				const parsed = JSON.parse(newSessionRaw);
				if (parsed && typeof parsed.auxiliaryBarVisible === 'boolean') {
					this._newSessionViewState = { auxiliaryBarVisible: parsed.auxiliaryBarVisible };
				} else {
					this._storageService.remove(NEW_SESSION_VIEW_STATE_KEY, StorageScope.WORKSPACE);
				}
			} catch {
				this._storageService.remove(NEW_SESSION_VIEW_STATE_KEY, StorageScope.WORKSPACE);
			}
		}

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
		const activeSession = this._sessionsService.activeSession.get();
		const multipleVisible = this._sessionsService.visibleSessions.get().length > 1;

		// Capture current state for the active session (skip multiple-visible and untitled).
		if (activeSession && !multipleVisible && activeSession.status.read(undefined) !== SessionStatus.Untitled) {
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

	private async _applyWorkingSet(sessionResource: URI | undefined, options?: { readonly isInitialRestore?: boolean }): Promise<void> {
		const preserveFocus = this._layoutService.hasFocus(Parts.PANEL_PART);
		const workingSet: IEditorWorkingSet | 'empty' = sessionResource
			? (this._workingSets.get(sessionResource) ?? 'empty')
			: 'empty';

		return this._workingSetSequencer.queue(async () => {
			// When multiple sessions are visible, applying a working set must never
			// change the visibility of the editor part: the editor area is shared
			// across the visible sessions and its visibility is controlled by the
			// user (and by direct editor open/close events outside this path).
			// Suppress the auto show/hide so restoring editors into the shared
			// editor part does not toggle it.
			if (this._sessionsService.visibleSessions.get().length > 1) {
				const suppression = this._layoutService.suppressEditorPartAutoVisibility();
				try {
					await this._editorGroupsService.applyWorkingSet(workingSet, { preserveFocus });
				} finally {
					suppression.dispose();
				}
				return;
			}

			// Switching the active session must never reveal the main editor area
			// (or restore editors into it) while modal-only mode is in effect — the
			// outer autorun already guards against this, but `useModal` may have
			// flipped to 'all' between this call being queued and now.
			const isModal = this._useModalConfigObs.get() === 'all';

			if (workingSet === 'empty') {
				await this._editorGroupsService.applyWorkingSet(workingSet, { preserveFocus });
				return;
			}

			// On the initial restore after a reload, preserve the editor part
			// visibility that the workbench already restored. The user may have
			// hidden the editor part while keeping its editors open (e.g. closing
			// the Side Panel hides both the auxiliary bar and the editor part). The
			// working set still exists, so restore its editors without auto-showing
			// the part — otherwise the editor area would re-appear on every reload.
			if (options?.isInitialRestore) {
				const suppression = this._layoutService.suppressEditorPartAutoVisibility();
				try {
					await this._editorGroupsService.applyWorkingSet(workingSet, { preserveFocus });
				} finally {
					suppression.dispose();
				}
				return;
			}

			if (!isModal && !this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
				this._revealEditorPartForWorkingSet();
			}

			const result = await this._editorGroupsService.applyWorkingSet(workingSet, { preserveFocus });
			if (!isModal && result && !this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
				this._revealEditorPartForWorkingSet();
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
	}
}
