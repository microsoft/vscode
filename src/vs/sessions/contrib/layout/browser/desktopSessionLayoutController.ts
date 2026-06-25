/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../base/browser/window.js';
import { autorun, derived, observableFromEvent } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import product from '../../../../platform/product/common/product.js';
import { StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ViewContainerLocation } from '../../../../workbench/common/views.js';
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
 * [D7] Below this main-container width the sessions sidebar is auto-managed
 * against the editor + auxiliary bar visibility so all three don't compete for
 * a cramped horizontal layout.
 */
const SMALL_WINDOW_MAX_WIDTH = 1800;

/** [D7] Experimental setting gating the responsive sessions sidebar. */
export const RESPONSIVE_SIDEBAR_SETTING = 'sessions.layout.autoCollapseSessionsSidebar';

/**
 * Full layout controller used on desktop and on the web desktop layout. In
 * addition to the shared panel / working-set / state management of
 * {@link BaseLayoutController}, it manages the per-session auxiliary bar
 * visibility and active view container.
 *
 * Its behaviour is enumerated as rules **D1-D8** in
 * [desktopSessionLayoutController.md](./desktopSessionLayoutController.md).
 */
export class LayoutController extends BaseLayoutController {

	static readonly ID = 'workbench.contrib.sessionsLayoutController';

	/**
	 * Shared layout state for the new-session view, persisted across reloads.
	 * `undefined` means no explicit choice yet (aux bar defaults to visible).
	 */
	private _newSessionViewState: INewSessionViewState | undefined;

	/** [D7] `true` once the user manually closed the sidebar; suppresses auto-open until they open it again. */
	private _userClosedSidebar = false;
	/** [D7] Guards the manual-toggle listener while the controller itself toggles the sidebar. */
	private _applyingAutoSidebar = false;
	/** [D7] Last computed space-constrained state, so the autorun only acts on real transitions. */
	private _previousSpaceConstrained = false;

	/** [D2/D8] `true` while the controller hides the side pane to restore a session's remembered state, so the hide isn't captured as a user choice. */
	private _hidingAuxiliaryBarForRestore = false;

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
				this._withSessionLayoutRestore(() => this._onNewSessionSubmitted(activeSessionResource!));
				return;
			}

			// [D3] Restore the session's auxiliary bar state.
			this._withSessionLayoutRestore(() => this._syncAuxiliaryBarVisibility(activeSessionResource, activeSessionHasWorkspace, isUntitled, activeSessionHasChanges));
		}));

		// [D2] Track auxiliary bar visibility changes by the user so that hiding the
		// Side Panel for a session is remembered immediately (not only on switch).
		this._register(this._layoutService.onDidChangePartVisibility(e => {
			if (e.partId !== Parts.AUXILIARYBAR_PART) {
				return;
			}
			// [D9] Toggling the whole side pane (editor + aux bar together) hides or
			// shows the aux bar as a side effect, not as a per-session choice, so
			// don't record it.
			if (this._togglingSidePane) {
				return;
			}
			// A restore-driven hide replays the remembered state rather than
			// reacting to a user action, so don't record it as a new per-session
			// choice (this keeps "no remembered choice yet" meaningful for the
			// first-time Changes reveal, D8).
			if (this._hidingAuxiliaryBarForRestore) {
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

		// [D8] Reveal the Changes view in the side pane the first time a Changes
		// editor is opened for an existing session; afterwards respect the
		// remembered per-session choice (D1/D2/D3).
		this._register(this._editorService.onDidActiveEditorChange(() => this._revealChangesViewOnFirstOpen()));

		// [D8] Re-opening the Changes editor while it is already the active editor
		// (e.g. after the whole side pane was closed, which only hides the editor
		// part) re-reveals the editor part without firing an active-editor change,
		// so also react to the editor part becoming visible.
		this._register(this._layoutService.onDidChangePartVisibility(e => {
			if (e.partId === Parts.EDITOR_PART && e.visible) {
				this._revealChangesViewOnFirstOpen();
			}
		}));

		this._registerResponsiveSidebar();
	}

	/**
	 * [D8] When a Changes (multi-diff) editor is opened (becomes active, or its
	 * editor part is re-revealed) for an existing session, show the Changes view
	 * in the side pane unless the user explicitly hid the aux bar for that
	 * session. This reveals it the first time (no remembered choice) and again
	 * after the whole side pane was closed (D9, which keeps the remembered choice
	 * "open"), but respects an explicit aux-bar-hidden choice. The reveal is
	 * captured by [D2]. Skipped while a side-pane toggle is in progress (so the
	 * toggle restores exactly the remembered parts, D9), while the editor is
	 * maximized (D5) or while multiple sessions are visible, where the side pane
	 * is managed by other rules.
	 */
	private _revealChangesViewOnFirstOpen(): void {
		// A side-pane toggle restores exactly the remembered parts; don't let the
		// editor part it reveals force the Changes view open (D9).
		if (this._togglingSidePane) {
			return;
		}
		const activeEditorResource = this._editorService.activeEditor?.resource;
		if (!activeEditorResource) {
			return;
		}
		const changesSessionResource = this._sessionChangesService.getSessionResource(activeEditorResource);
		if (!changesSessionResource) {
			return;
		}
		if (this.multipleSessionsVisibleObs.get() || this._layoutService.isEditorMaximized()) {
			return;
		}
		const activeSession = this._sessionsService.activeSession.get();
		if (!activeSession || !isEqual(activeSession.resource, changesSessionResource)) {
			return;
		}
		// Untitled sessions share the new-session side-pane state (D3b/D4).
		if (activeSession.status.get() === SessionStatus.Untitled) {
			return;
		}
		const savedState = this._viewStateBySession.get(changesSessionResource);
		if (savedState) {
			// The user explicitly hid the aux bar for this session, or the side
			// pane is already open (leave it on whatever view they chose). Only an
			// "open but currently closed" state (e.g. after the side pane was
			// closed whole, D9) falls through to re-reveal the Changes view.
			if (!savedState.auxiliaryBarVisible || this._layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
				return;
			}
		}
		this._viewsService.openView(CHANGES_VIEW_ID, false);
	}

	/**
	 * On a small window, auto-hide the sessions sidebar while both the editor and
	 * auxiliary bar are open and auto-show it again once either closes — unless the
	 * user closed the sidebar themselves. Disabled while multiple sessions are
	 * visible and never triggered by session navigation. Gated by the experimental
	 * `sessions.layout.autoCollapseSessionsSidebar` setting.
	 */
	private _registerResponsiveSidebar(): void {
		const enabledObs = observableConfigValue<boolean>(RESPONSIVE_SIDEBAR_SETTING, product.quality !== 'stable', this._configurationService);

		const smallWindowObs = observableFromEvent(this,
			this._layoutService.onDidLayoutMainContainer,
			() => this._layoutService.mainContainerDimension.width <= SMALL_WINDOW_MAX_WIDTH);

		const editorVisibleObs = observableFromEvent(this,
			this._layoutService.onDidChangePartVisibility,
			() => this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow));

		const auxiliaryBarVisibleObs = observableFromEvent(this,
			this._layoutService.onDidChangePartVisibility,
			() => this._layoutService.isVisible(Parts.AUXILIARYBAR_PART));

		const editorMaximizedObs = observableFromEvent(this,
			this._layoutService.onDidChangeEditorMaximized,
			() => this._layoutService.isEditorMaximized());

		// [D7] Disabled while multiple sessions are visible.
		const spaceConstrainedObs = derived<boolean>(reader =>
			enabledObs.read(reader) &&
			!this.multipleSessionsVisibleObs.read(reader) &&
			smallWindowObs.read(reader) &&
			editorVisibleObs.read(reader) &&
			auxiliaryBarVisibleObs.read(reader));

		this._previousSpaceConstrained = spaceConstrainedObs.get();

		this._register(autorun(reader => {
			// While the editor is maximized the side layout is forced (D5); leave the
			// sidebar to the maximize/restore logic and re-evaluate on un-maximize.
			if (editorMaximizedObs.read(reader)) {
				return;
			}

			const constrained = spaceConstrainedObs.read(reader);

			// [D7] While the controller restores a session's layout (e.g. switching
			// sessions reveals the saved side panel), re-baseline instead of reacting
			// so navigation never auto-hides the sidebar — only in-session changes do.
			if (this._isRestoringSessionLayout) {
				this._previousSpaceConstrained = constrained;
				return;
			}

			if (constrained === this._previousSpaceConstrained) {
				return;
			}
			this._previousSpaceConstrained = constrained;

			if (constrained) {
				this._setSidebarAutoHidden(true);
			} else if (!this._userClosedSidebar) {
				this._setSidebarAutoHidden(false);
			}
		}));

		// Track manual sidebar toggles: a manual close suppresses auto-open, a manual
		// open resumes auto-management. Maximize toggles the sidebar too, but its
		// enter/restore pair self-cancels here, so it needs no special handling.
		this._register(this._layoutService.onDidChangePartVisibility(e => {
			if (e.partId !== Parts.SIDEBAR_PART || this._applyingAutoSidebar) {
				return;
			}
			this._userClosedSidebar = !e.visible;
		}));
	}

	private _setSidebarAutoHidden(hidden: boolean): void {
		if (this._layoutService.isVisible(Parts.SIDEBAR_PART) === !hidden) {
			return;
		}
		this._applyingAutoSidebar = true;
		try {
			this._layoutService.setPartHidden(hidden, Parts.SIDEBAR_PART);
		} finally {
			this._applyingAutoSidebar = false;
		}
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
	private _onNewSessionSubmitted(sessionResource: URI): void | Promise<unknown> {
		const auxiliaryBarVisible = this._layoutService.isVisible(Parts.AUXILIARYBAR_PART);
		this._viewStateBySession.set(sessionResource, {
			auxiliaryBarVisible,
			auxiliaryBarActiveViewContainerId: auxiliaryBarVisible ? CHANGES_VIEW_CONTAINER_ID : undefined,
		});
		if (auxiliaryBarVisible) {
			return this._viewsService.openView(CHANGES_VIEW_ID, false);
		}
	}

	// [D3] Restore the auxiliary bar in strict priority order.
	private _syncAuxiliaryBarVisibility(sessionResource: URI | undefined, hasWorkspace: boolean, isUntitled: boolean, hasChanges: boolean): void | Promise<unknown> {
		// [D3a] No resource / no workspace → do nothing.
		if (!sessionResource || !hasWorkspace) {
			return;
		}

		// [D3b] New-session view: all untitled sessions share one state.
		if (isUntitled) {
			if (this._newSessionViewState && !this._newSessionViewState.auxiliaryBarVisible) {
				this._hideAuxiliaryBarForRestore();
				return;
			}
			return this._openDefaultAuxiliaryBarContainer(hasChanges);
		}

		const savedState = this._viewStateBySession.get(sessionResource);

		// [D3c] Existing sessions are never auto-opened: hide unless explicitly left visible.
		if (!savedState || !savedState.auxiliaryBarVisible) {
			this._hideAuxiliaryBarForRestore();
			return;
		}

		// [D3c] Restore the user's last explicit choice, but only if that pane is still pinned.
		const savedContainerId = savedState.auxiliaryBarActiveViewContainerId;
		if (savedContainerId && this._isAuxiliaryBarContainerPinned(savedContainerId)) {
			return this._viewsService.openViewContainer(savedContainerId, false);
		}

		return this._openDefaultAuxiliaryBarContainer(hasChanges);
	}

	/** [D3d] Prefer Changes when the session has changes, otherwise Files (falling back to Changes if Files is hidden). */
	private _openDefaultAuxiliaryBarContainer(hasChanges: boolean): Promise<unknown> {
		if (hasChanges || !this._isAuxiliaryBarContainerPinned(SESSIONS_FILES_CONTAINER_ID)) {
			return this._viewsService.openView(CHANGES_VIEW_ID, false);
		} else {
			return this._viewsService.openViewContainer(SESSIONS_FILES_CONTAINER_ID, false);
		}
	}

	/**
	 * [D2/D8] Hide the side pane as part of restoring a session's remembered
	 * state. The synchronous guard makes the [D2] listener ignore the resulting
	 * visibility change so a restore-driven hide is never recorded as a new
	 * per-session choice.
	 */
	private _hideAuxiliaryBarForRestore(): void {
		this._hidingAuxiliaryBarForRestore = true;
		try {
			this._layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
		} finally {
			this._hidingAuxiliaryBarForRestore = false;
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
