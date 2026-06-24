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
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IEditorGroupsService, IEditorWorkingSet } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { IPaneCompositePartService } from '../../../../workbench/services/panecomposite/browser/panecomposite.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';
import { IActiveSession, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { SessionStatus } from '../../../services/sessions/common/session.js';

/**
 * Per-session view state: auxiliary bar visibility and active view container.
 * Treated as opaque persisted data by the base controller; only the desktop
 * controller interprets it (see `desktopSessionLayoutController.md`).
 */
export interface ISessionViewState {
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

/**
 * Shared, platform-agnostic per-session layout state management. The behaviour
 * specified here is enumerated as rules **B1-B5** in
 * [baseSessionLayoutController.md](./baseSessionLayoutController.md).
 *
 * It owns the panel visibility, editor working sets, persistence, and the
 * multi-session suppression that every layout needs. Auxiliary bar management
 * is platform-specific and supplied by subclasses through
 * {@link _registerViewStateManagement} (see the desktop / mobile controllers).
 */
export abstract class BaseLayoutController extends Disposable {

	// [B3] Per-session state, keyed by session resource and persisted to storage.
	protected readonly _panelVisibilityBySession = new ResourceMap<boolean>();
	protected readonly _viewStateBySession = new ResourceMap<ISessionViewState>();
	protected readonly _workingSets = new ResourceMap<IEditorWorkingSet>();
	private readonly _workingSetSequencer = new Sequencer();

	protected readonly activeSessionResourceObs;
	protected readonly multipleSessionsVisibleObs;

	/**
	 * `> 0` while the controller is restoring a session's layout on a session
	 * switch (editor working set and/or auxiliary bar). Subclasses can use this to
	 * re-baseline responsive behaviour instead of reacting to the restore-driven
	 * part-visibility changes (see the desktop controller's [D7] sidebar logic).
	 */
	private _restoringSessionLayoutDepth = 0;

	protected get _isRestoringSessionLayout(): boolean {
		return this._restoringSessionLayoutDepth > 0;
	}

	private readonly _useModalConfigObs;
	constructor(

		@IAgentWorkbenchLayoutService protected readonly _layoutService: IAgentWorkbenchLayoutService,
		@ISessionsManagementService private readonly _sessionManagementService: ISessionsManagementService,
		@ISessionsService protected readonly _sessionsService: ISessionsService,
		@IViewsService protected readonly _viewsService: IViewsService,
		@IPaneCompositePartService protected readonly _paneCompositePartService: IPaneCompositePartService,
		@IStorageService protected readonly _storageService: IStorageService,
		@IConfigurationService protected readonly _configurationService: IConfigurationService,
		@IEditorService private readonly _editorService: IEditorService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
	) {
		super();

		// [B3] Restore persisted state (with one-time legacy migration).
		this._loadState();

		// [B4] Persist on shutdown.
		this._register(this._storageService.onWillSaveState(() => this._saveState()));

		// All session-switch logic is observable-driven.
		this.activeSessionResourceObs = derivedOpts<URI | undefined>({
			equalsFn: isEqual
		}, reader => {
			const activeSession = this._sessionsService.activeSession.read(reader);
			return activeSession?.resource;
		});

		this.multipleSessionsVisibleObs = derived<boolean>(reader => {
			return this._sessionsService.visibleSessions.read(reader).length > 1;
		});

		// [B5] When multiple sessions are visible, drop per-session view/panel state
		// for each visible session (editor working sets are preserved). This ensures
		// the default visibility logic runs again after collapsing back to one session.
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

		// [B1] Switch between sessions — sync panel visibility
		this._register(autorun(reader => {
			const activeSessionResource = this.activeSessionResourceObs.read(reader);
			if (this.multipleSessionsVisibleObs.read(reader)) {
				return;
			}
			this._syncPanelVisibility(activeSessionResource);
		}));

		// [B1] Track panel visibility changes by the user
		this._register(this._layoutService.onDidChangePartVisibility(e => {
			if (e.partId !== Parts.PANEL_PART) {
				return;
			}
			if (this.multipleSessionsVisibleObs.get()) {
				return;
			}
			const activeSession = this._sessionsService.activeSession.get();
			if (activeSession) {
				this._panelVisibilityBySession.set(activeSession.resource, e.visible);
			}
		}));

		// [B2] Editor working sets

		this._useModalConfigObs = observableConfigValue<'off' | 'some' | 'all'>('workbench.editor.useModal', 'all', this._configurationService);

		// Workspace folders — used to defer session switch until workspace is ready
		const workspaceFoldersObs = observableFromEvent(
			this._workspaceContextService.onDidChangeWorkspaceFolders,
			() => this._workspaceContextService.getWorkspace().folders);

		// [B2] The active session updates before the workspace folders do; hold back
		// the new session until the folders reflect its working directory.
		const activeSessionForWorkingSet = derivedObservableWithCache<IActiveSession | undefined>(this, (reader, lastValue) => {
			const workspaceFolders = workspaceFoldersObs.read(reader);
			const activeSession = this._sessionsService.activeSession.read(reader);
			const activeSessionWorkspaceUri = activeSession?.workspace.read(reader)?.folders[0]?.workingDirectory;

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

			// [B2] Session changed (save, apply)
			reader.store.add(runOnChange(activeSessionForWorkingSet, (session, previousSession) => {
				// Save working set for previous session (skip for untitled sessions)
				if (previousSession && previousSession.status.read(undefined) !== SessionStatus.Untitled) {
					this._saveWorkingSet(previousSession.resource);
				}

				// Apply working set for current session.
				// On initial load (no previous session), only apply if we have a saved working set —
				// skip applying 'empty' to avoid closing editors that are being restored.
				if (previousSession || (session && this._workingSets.has(session.resource))) {
					this._withSessionLayoutRestore(() => this._applyWorkingSet(session?.resource, { isInitialRestore: !previousSession }));
				}
			}));

			// [B2] Session state changed (archive, delete)
			reader.store.add(this._sessionManagementService.onDidChangeSessions(e => {
				const archivedSessions = e.changed.filter(session => session.isArchived.read(undefined));
				for (const session of [...e.removed, ...archivedSessions]) {
					this._deleteWorkingSet(session.resource);
					this._viewStateBySession.delete(session.resource);
				}
			}));
		}));

		// Platform-specific auxiliary bar / view-state management.
		this._registerViewStateManagement();
	}

	/**
	 * Hook for subclasses to register platform-specific auxiliary bar
	 * view-state management. Runs at the end of the base constructor. The base
	 * implementation does nothing.
	 */
	protected _registerViewStateManagement(): void { }

	/**
	 * [B4] Hook that lets a subclass snapshot the active session's view state when
	 * state is about to be persisted. The base implementation does nothing.
	 */
	protected _captureActiveSessionViewState(_sessionResource: URI): void { }

	/**
	 * Runs a session-switch layout restore with {@link _isRestoringSessionLayout}
	 * held until the (possibly async) work settles, so part-visibility changes the
	 * restore causes can be re-baselined rather than reacted to.
	 */
	protected _withSessionLayoutRestore(work: () => void | Promise<unknown>): void {
		this._restoringSessionLayoutDepth++;
		let settledSync = true;
		try {
			const result = work();
			if (result instanceof Promise) {
				settledSync = false;
				Promise.resolve(result).catch(() => undefined).finally(() => this._restoringSessionLayoutDepth--);
			}
		} finally {
			if (settledSync) {
				this._restoringSessionLayoutDepth--;
			}
		}
	}

	// --- Editor part reveal ---

	/**
	 * Reveals the editor part. Editor working sets are restored into the shared
	 * editor area on session switch, which requires the editor part to be visible.
	 */
	private _revealEditorPartForWorkingSet(): void {
		this._layoutService.setPartHidden(false, Parts.EDITOR_PART);
	}

	// --- Persistence [B3] ---

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
		const activeSession = this._sessionsService.activeSession.get();
		const multipleVisible = this._sessionsService.visibleSessions.get().length > 1;

		// [B4] Capture current state for the active session (skip multiple-visible and untitled).
		if (activeSession && !multipleVisible && activeSession.status.read(undefined) !== SessionStatus.Untitled) {
			this._captureActiveSessionViewState(activeSession.resource);
		}

		// [B4] Capture working set for the active session (skip untitled)
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

	// --- Panel [B1] ---

	private _syncPanelVisibility(sessionResource: URI | undefined): void {
		if (!sessionResource) {
			this._layoutService.setPartHidden(true, Parts.PANEL_PART);
			return;
		}

		const wasVisible = this._panelVisibilityBySession.get(sessionResource);
		// Default to hidden if we have no record for this session
		this._layoutService.setPartHidden(wasVisible !== true, Parts.PANEL_PART);
	}

	// --- Editor working sets [B2] ---

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
			if (this._sessionsService.visibleSessions.get().length > 1) {
				const suppression = this._layoutService.suppressEditorPartAutoVisibility();
				try {
					await this._editorGroupsService.applyWorkingSet(workingSet, { preserveFocus });
				} finally {
					suppression.dispose();
				}
				return;
			}

			const isModal = this._useModalConfigObs.get() === 'all';

			if (workingSet === 'empty') {
				await this._editorGroupsService.applyWorkingSet(workingSet, { preserveFocus });
				return;
			}

			// On the initial restore after a reload, preserve the editor part
			// visibility that the workbench already restored.
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
