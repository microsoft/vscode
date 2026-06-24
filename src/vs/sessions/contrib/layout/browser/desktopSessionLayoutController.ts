/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { autorun, derived, observableFromEvent } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { isMobile, isWeb } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ViewContainerLocation } from '../../../../workbench/common/views.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { SessionStatus } from '../../../services/sessions/common/session.js';
import { CHANGES_VIEW_CONTAINER_ID, CHANGES_VIEW_ID } from '../../changes/common/changes.js';
import { SESSIONS_FILES_CONTAINER_ID } from '../../files/browser/files.contribution.js';
import { BaseLayoutController } from './baseSessionLayoutController.js';

/**
 * Shared layout state for the new-session (untitled) view. Untitled sessions
 * each have a distinct resource, so a single value carries the user's choices
 * across new sessions.
 */
interface INewSessionViewState {
	readonly auxiliaryBarVisible: boolean;
}

/** Shared layout state for the new-session (untitled) view. */
const NEW_SESSION_VIEW_STATE_KEY = 'sessions.newSessionViewState';

/**
 * Full layout controller used on desktop and on the web desktop layout. In
 * addition to the shared panel / working-set / state management of
 * {@link BaseLayoutController}, it manages the per-session auxiliary bar
 * visibility and active view container.
 *
 * Its behaviour is enumerated as rules **D1-D6** in
 * [desktopSessionLayoutController.md](./desktopSessionLayoutController.md).
 */
export class LayoutController extends BaseLayoutController {

	static readonly ID = 'workbench.contrib.sessionsLayoutController';

	/**
	 * Shared layout state for the new-session view, persisted across reloads.
	 * `undefined` means no explicit choice yet (aux bar defaults to visible).
	 */
	private _newSessionViewState: INewSessionViewState | undefined;

	protected override _registerViewStateManagement(): void {
		this._loadNewSessionViewState();

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

		const editorMaximizedObs = observableFromEvent(this,
			this._layoutService.onDidChangeEditorMaximized,
			() => this._layoutService.isEditorMaximized());

		// Switch between sessions — sync auxiliary bar
		let previousSessionResource: URI | undefined;
		let previousIsUntitled = false;
		this._register(autorun(reader => {
			const editorMaximized = editorMaximizedObs.read(reader);
			const activeSessionResource = this.activeSessionResourceObs.read(reader);
			const isUntitled = activeSessionIsUntitledObs.read(reader);

			// [D5] While the editor area is maximized, always show the Changes view
			// regardless of the session's saved/previous state. The forced visibility
			// is never captured ([D2] listener skips while maximized), so un-maximizing
			// re-runs this autorun and restores the session's real state.
			if (editorMaximized) {
				previousSessionResource = activeSessionResource;
				previousIsUntitled = isUntitled;
				this._viewsService.openView(CHANGES_VIEW_ID, false);
				return;
			}

			const activeSessionHasWorkspace = activeSessionHasWorkspaceObs.read(reader);
			const activeSessionHasChanges = activeSessionHasChangesObs.read(reader);
			const multipleVisible = this.multipleSessionsVisibleObs.read(reader);

			if (multipleVisible) {
				previousSessionResource = activeSessionResource;
				previousIsUntitled = isUntitled;
				return;
			}

			// [D1] Save auxiliary bar state for the session we're switching away from
			const isSessionSwitch = previousSessionResource !== undefined && !isEqual(previousSessionResource, activeSessionResource);
			if (isSessionSwitch) {
				this._captureViewState(previousSessionResource!);
			}

			// [D4] Submit: the same session transitions from new (untitled) to real.
			const isSubmit = !isSessionSwitch && previousIsUntitled && !isUntitled && activeSessionResource !== undefined;

			previousSessionResource = activeSessionResource;
			previousIsUntitled = isUntitled;

			if (isSubmit) {
				this._onNewSessionSubmitted(activeSessionResource!);
				return;
			}

			// [D3] Restore the session's auxiliary bar state.
			this._syncAuxiliaryBarVisibility(activeSessionResource, activeSessionHasWorkspace, isUntitled, activeSessionHasChanges);
		}));

		// [D2] Track auxiliary bar visibility changes by the user so that hiding the
		// Side Panel for a session is remembered immediately (not only on switch).
		this._register(this._layoutService.onDidChangePartVisibility(e => {
			if (e.partId !== Parts.AUXILIARYBAR_PART) {
				return;
			}
			if (this.multipleSessionsVisibleObs.get()) {
				return;
			}
			// [D5] While maximized the aux bar is forced visible, so its visibility
			// must not be captured as the session's per-session preference.
			if (this._layoutService.isEditorMaximized()) {
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

	// [B4] Snapshot the active session's aux-bar state when persisting.
	protected override _captureActiveSessionViewState(sessionResource: URI): void {
		this._captureViewState(sessionResource);
	}

	// --- Auxiliary bar [D1] ---

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

	/**
	 * [D4] When a new (untitled) session is submitted it becomes a real session
	 * while staying active. Keep the auxiliary bar as the user left it: if open,
	 * keep it open and switch to the Changes view; if closed, keep it closed. The
	 * resulting state is persisted so later syncs don't fall back to hidden.
	 */
	private _onNewSessionSubmitted(sessionResource: URI): void {
		const auxiliaryBarVisible = this._layoutService.isVisible(Parts.AUXILIARYBAR_PART);
		if (auxiliaryBarVisible) {
			this._viewsService.openView(CHANGES_VIEW_ID, false);
		}
		this._viewStateBySession.set(sessionResource, {
			auxiliaryBarVisible,
			auxiliaryBarActiveViewContainerId: auxiliaryBarVisible ? CHANGES_VIEW_CONTAINER_ID : undefined,
		});
	}

	// [D3] Restore the auxiliary bar in strict priority order.
	private _syncAuxiliaryBarVisibility(sessionResource: URI | undefined, hasWorkspace: boolean, isUntitled: boolean, hasChanges: boolean): void {
		// [D3a] No resource / no workspace → do nothing.
		if (!sessionResource || !hasWorkspace) {
			return;
		}

		// [D3b] New-session view: all untitled sessions share one state.
		if (isUntitled) {
			if (this._newSessionViewState && !this._newSessionViewState.auxiliaryBarVisible) {
				this._layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
			} else {
				this._openDefaultAuxiliaryBarContainer(hasChanges);
			}
			return;
		}

		const savedState = this._viewStateBySession.get(sessionResource);

		// [D3c] Existing sessions are never auto-opened: hide unless explicitly left visible.
		if (!savedState || !savedState.auxiliaryBarVisible) {
			this._layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
			return;
		}

		// [D3c] Restore the user's last explicit choice, but only if that pane is still pinned.
		const savedContainerId = savedState.auxiliaryBarActiveViewContainerId;
		if (savedContainerId && this._isAuxiliaryBarContainerPinned(savedContainerId)) {
			this._viewsService.openViewContainer(savedContainerId, false);
			return;
		}

		this._openDefaultAuxiliaryBarContainer(hasChanges);
	}

	/** [D3d] Prefer Changes when the session has changes, otherwise Files (falling back to Changes if Files is hidden). */
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

	private _loadNewSessionViewState(): void {
		const newSessionRaw = this._storageService.get(NEW_SESSION_VIEW_STATE_KEY, StorageScope.WORKSPACE);
		if (!newSessionRaw) {
			return;
		}
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
}

// Registered as the layout controller for every layout except web phone.
if (!(isWeb && isMobile)) {
	registerWorkbenchContribution2(LayoutController.ID, LayoutController, WorkbenchPhase.AfterRestored);
}
