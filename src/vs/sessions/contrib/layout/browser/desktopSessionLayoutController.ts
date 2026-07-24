/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../base/browser/window.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, derived, observableFromEvent } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import product from '../../../../platform/product/common/product.js';
import { StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ViewContainerLocation } from '../../../../workbench/common/views.js';
import { Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { ISession } from '../../../services/sessions/common/session.js';
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
 * Its behaviour is enumerated as rules **D1-D11** in
 * [desktopSessionLayoutController.md](./desktopSessionLayoutController.md).
 */
export class LayoutController extends BaseLayoutController {

	static readonly ID = 'workbench.contrib.sessionsLayoutController';

	/**
	 * Shared layout state for the new-session view, persisted across reloads.
	 * `undefined` means no explicit choice yet (aux bar defaults to visible).
	 */
	private _newSessionViewState: INewSessionViewState | undefined;

	/** [D7] `true` while the sidebar is hidden because the controller auto-hid it; only such hides are auto-reverted. */
	protected _sidebarAutoHidden = false;
	/** [D7] Guards the manual-toggle listener while the controller itself toggles the sidebar. */
	protected _applyingAutoSidebar = false;
	/** [D7] Last computed space-constrained state, so the autorun only acts on real transitions. */
	private _previousSpaceConstrained = false;

	/** [D2/D8] `true` while the controller hides the side pane to restore a session's remembered state, so the hide isn't captured as a user choice. */
	private _hidingAuxiliaryBarForRestore = false;

	protected override _registerViewStateManagement(): void {
		this._loadNewSessionViewState();

		const activeSessionIsCreatedObs = derived<boolean>(reader => {
			const activeSession = this._sessionsService.activeSession.read(reader);
			return activeSession?.isCreated.read(reader) ?? false;
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
		let previousIsCreated = false;
		this._register(autorun(reader => {
			const editorMaximized = editorMaximizedObs.read(reader);
			const activeSessionResource = this.activeSessionResourceObs.read(reader);
			const isCreated = activeSessionIsCreatedObs.read(reader);

			// [D5] While the editor area is maximized, always show the Changes view
			// regardless of the session's saved/previous state. The forced visibility
			// is never captured ([D2] listener skips while maximized), so un-maximizing
			// re-runs this autorun and restores the session's real state.
			if (editorMaximized) {
				previousSessionResource = activeSessionResource;
				previousIsCreated = isCreated;
				void this._viewsService.openView(CHANGES_VIEW_ID, false);
				return;
			}

			const activeSessionHasWorkspace = activeSessionHasWorkspaceObs.read(reader);
			const multipleVisible = this.multipleSessionsVisibleObs.read(reader);

			if (multipleVisible) {
				previousSessionResource = activeSessionResource;
				previousIsCreated = isCreated;
				return;
			}

			// [D1] Save auxiliary bar state for the session we're switching away from
			const isSessionSwitch = previousSessionResource !== undefined && !isEqual(previousSessionResource, activeSessionResource);
			if (isSessionSwitch) {
				this._captureViewState(previousSessionResource!);
			}

			// [D4] Submit: the same session transitions from new (uncreated) to real.
			const isSubmit = previousSessionResource !== undefined
				&& !isSessionSwitch
				&& !previousIsCreated
				&& isCreated
				&& activeSessionResource !== undefined;

			previousSessionResource = activeSessionResource;
			previousIsCreated = isCreated;

			if (isSubmit) {
				this._withSessionLayoutRestore(() => this._onNewSessionSubmitted(activeSessionResource!));
				return;
			}

			// [D3] Restore the session's auxiliary bar state.
			this._withSessionLayoutRestore(() =>
				this._syncAuxiliaryBarVisibility(activeSessionResource, activeSessionHasWorkspace, isCreated)
			);
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
			// While restoring a session's layout (e.g., working-set apply in progress),
			// visibility changes triggered by the single-pane detail-panel logic must
			// not overwrite the session's intended state.
			if (this._isRestoringSessionLayout) {
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
			if (!activeSession.isCreated.get()) {
				this._setNewSessionViewState({ auxiliaryBarVisible: e.visible });
			} else {
				if (e.visible && this._restoreSavedAuxiliaryBarContainerOnReveal(activeSession.resource)) {
					return;
				}
				this._captureViewState(activeSession.resource);
			}
		}));

		this._registerChangesAutoReveal();

		this._registerResponsiveSidebar();
		this._registerAuxiliaryBarPartVisibility();
		this._registerNewSessionRules();
	}

	protected _registerChangesAutoReveal(): void {
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
	}

	protected _registerNewSessionRules(): void { }

	protected override _onSessionReplaced(from: ISession, to: ISession): void {
		super._onSessionReplaced(from, to);

		const activeSession = this._sessionsService.activeSession.get();
		const replacedSessionIsActive = isEqual(activeSession?.resource, from.resource) || isEqual(activeSession?.resource, to.resource);
		const auxiliaryBarVisible = replacedSessionIsActive
			? this._layoutService.isVisible(Parts.AUXILIARYBAR_PART)
			: this._newSessionViewState?.auxiliaryBarVisible;
		if (auxiliaryBarVisible === undefined) {
			return;
		}

		this._viewStateBySession.set(to.resource, {
			auxiliaryBarVisible,
			auxiliaryBarActiveViewContainerId: CHANGES_VIEW_CONTAINER_ID,
		});

		if (replacedSessionIsActive && auxiliaryBarVisible) {
			void this._viewsService.openView(CHANGES_VIEW_ID, false);
		}
	}

	/**
	 * [D10] Keep the auxiliary-bar part hidden when it has no active view
	 * containers (e.g. a workspace-less quick chat where Changes+Files are gated
	 * off), so an empty column is never shown. Re-checks on container add/remove,
	 * location moves, active-view-descriptor changes (the gating signal), and
	 * aux-bar visibility changes. Only ever hides — reveals stay with [D3]/[D8].
	 */
	private _registerAuxiliaryBarPartVisibility(): void {
		const modelListeners = this._register(new DisposableStore());
		const rewire = (): void => {
			modelListeners.clear();
			for (const container of this._viewDescriptorService.getViewContainersByLocation(ViewContainerLocation.AuxiliaryBar)) {
				modelListeners.add(this._viewDescriptorService.getViewContainerModel(container)
					.onDidChangeActiveViewDescriptors(() => this._syncAuxiliaryBarPartVisibility()));
			}
			this._syncAuxiliaryBarPartVisibility();
		};
		this._register(this._viewDescriptorService.onDidChangeViewContainers(rewire));
		this._register(this._viewDescriptorService.onDidChangeContainerLocation(rewire));
		this._register(this._viewsService.onDidChangeViewContainerVisibility(e => {
			if (e.location === ViewContainerLocation.AuxiliaryBar) {
				this._syncAuxiliaryBarPartVisibility();
			}
		}));
		// The aux part can become visible without any container-/descriptor-change
		// signal firing (e.g. a bare detail toggle that shows the part before any
		// container is opened, or a restore that shows it while its containers are
		// gated off). React to the part itself becoming visible so an empty column
		// is reconciled away and the toggle never reads "on" over a blank panel.
		this._register(this._layoutService.onDidChangePartVisibility(e => {
			if (e.partId === Parts.AUXILIARYBAR_PART && e.visible) {
				this._syncAuxiliaryBarPartVisibility();
			}
		}));
		rewire();
	}

	/** [D10] Hide the aux-bar part when it has no active view containers; never reveals it. */
	private _syncAuxiliaryBarPartVisibility(): void {
		if (this._hasActiveAuxViewContainers()) {
			return;
		}
		// No active aux view containers. This is only a genuine "empty column" for a
		// workspace-less quick chat (Changes+Files permanently gated off). For a
		// workspace-backed session it is a transient startup/activation state (the
		// Files/Changes views gate on `SessionHasWorkspaceContext`, set async after
		// the session activates), and during early reload there is no active session
		// yet at all. Hiding in those transient cases collapses the restored-visible
		// side pane and, since this method only ever hides, it stays closed — the
		// reload flicker (opens then closes) and "Files not shown". So hide ONLY for
		// an actual quick chat; a real quick-chat switch still fires
		// `onDidChangeActiveViewDescriptors`, which re-runs this and hides then.
		const activeSession = this._sessionsService.activeSession.get();
		if (activeSession?.isQuickChat?.get() !== true) {
			return;
		}
		if (this._layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
			// Removing an empty column must not, as a side effect, pop the editor
			// open: the editor's visibility is governed by its own rules ([D3]/[D8]),
			// not by this cleanup. Suppress the docked swap-reveal for the hide.
			const suppression = this._layoutService.suppressEditorPartAutoVisibility();
			try {
				this._hideAuxiliaryBarForRestore();
			} finally {
				suppression.dispose();
			}
		}
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
		// Uncreated (untitled) sessions share the new-session side-pane state (D3b/D4).
		if (!activeSession.isCreated.get()) {
			return;
		}
		// A restored Changes editor can become active while the editor part is
		// still hidden (e.g. its working set is restored on reload). Only reveal
		// the side pane when the user actually opened the editor (part visible).
		if (!this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
			return;
		}
		const savedState = this._viewStateBySession.get(changesSessionResource);
		if (savedState) {
			// [D8] Already open, or an explicit aux-bar hide (not a D9 collapse).
			if (this._layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
				return;
			}
			if (!savedState.auxiliaryBarVisible && !savedState.auxiliaryBarHiddenByCollapse) {
				return;
			}
		}
		void this._viewsService.openView(CHANGES_VIEW_ID, false);
	}

	/**
	 * On a small window, auto-hide the sessions sidebar while both the editor and
	 * auxiliary bar are open and auto-show it again once either closes — unless the
	 * user closed the sidebar themselves. Disabled while multiple sessions are
	 * visible and never triggered by session navigation. Gated by the experimental
	 * `sessions.layout.autoCollapseSessionsSidebar` setting.
	 */
	protected _registerResponsiveSidebar(): void {
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
				// Only remember an auto-hide when we actually hid a visible sidebar; a
				// sidebar that was already closed (e.g. by the user, including before a
				// reload) must not be auto-revealed when space is no longer constrained.
				if (this._setSidebarAutoHidden(true)) {
					this._sidebarAutoHidden = true;
				}
			} else if (this._sidebarAutoHidden) {
				this._setSidebarAutoHidden(false);
				this._sidebarAutoHidden = false;
			}
		}));

		// A manual sidebar toggle hands control back to the user: stop tracking the
		// sidebar as auto-hidden so a later un-constrain neither reopens a sidebar the
		// user closed nor re-hides one they opened. Maximize toggles the sidebar too,
		// but its enter/restore pair self-cancels here, so it needs no special handling.
		this._register(this._layoutService.onDidChangePartVisibility(e => {
			if (e.partId !== Parts.SIDEBAR_PART || this._applyingAutoSidebar) {
				return;
			}
			this._sidebarAutoHidden = false;
		}));
	}

	/** Returns `true` when the sidebar visibility was actually changed. */
	protected _setSidebarAutoHidden(hidden: boolean): boolean {
		if (this._layoutService.isVisible(Parts.SIDEBAR_PART) === !hidden) {
			return false;
		}
		this._applyingAutoSidebar = true;
		try {
			this._layoutService.setPartHidden(hidden, Parts.SIDEBAR_PART);
		} finally {
			this._applyingAutoSidebar = false;
		}
		return true;
	}

	// [B4] Snapshot the active session's aux-bar state when persisting.
	protected override _captureActiveSessionViewState(sessionResource: URI): void {
		this._captureViewState(sessionResource);
	}

	/**
	 * [D9b] Records a whole-side-pane toggle for the active session. For an
	 * uncreated session it updates the shared new-session choice. For a created
	 * session, only a full collapse of a previously-visible aux bar is marked as a
	 * collapse-driven hide (so opening Changes later re-reveals it); any other
	 * outcome just captures the resulting state, preserving an explicit aux-bar
	 * hide. See `desktopSessionLayoutController.md`.
	 */
	protected override _onSidePaneToggled(collapsed: boolean, previousAuxiliaryBarVisible: boolean): void {
		if (this.multipleSessionsVisibleObs.get()) {
			return;
		}
		if (this._layoutService.isEditorMaximized()) {
			return;
		}
		const activeSession = this._sessionsService.activeSession.get();
		if (!activeSession) {
			return;
		}
		if (!activeSession.isCreated.get()) {
			this._setNewSessionViewState({ auxiliaryBarVisible: this._layoutService.isVisible(Parts.AUXILIARYBAR_PART) });
			return;
		}
		if (collapsed && previousAuxiliaryBarVisible) {
			const activeViewContainerId = this._paneCompositePartService.getActivePaneComposite(ViewContainerLocation.AuxiliaryBar)?.getId();
			this._viewStateBySession.set(activeSession.resource, {
				auxiliaryBarVisible: false,
				auxiliaryBarActiveViewContainerId: activeViewContainerId,
				auxiliaryBarHiddenByCollapse: true,
			});
			return;
		}
		// Re-opened, or collapsed an already-hidden aux bar: capture the resulting
		// state without fabricating a collapse marker (preserving explicit hides).
		this._captureViewState(activeSession.resource);
	}

	// --- Auxiliary bar [D1] ---

	private _captureViewState(sessionResource: URI): void {
		const auxiliaryBarVisible = this._layoutService.isVisible(Parts.AUXILIARYBAR_PART);
		const activeViewContainerId = this._paneCompositePartService.getActivePaneComposite(ViewContainerLocation.AuxiliaryBar)?.getId();
		// [D9] Preserve a collapse marker while the aux bar stays hidden; the
		// marker is only ever set by `_onSidePaneToggled` for the session that was
		// collapsed, so an explicit aux-bar hide is never mistaken for a collapse.
		const previous = this._viewStateBySession.get(sessionResource);
		const auxiliaryBarHiddenByCollapse = !auxiliaryBarVisible && previous?.auxiliaryBarHiddenByCollapse === true;
		this._viewStateBySession.set(sessionResource, {
			auxiliaryBarVisible,
			auxiliaryBarActiveViewContainerId: activeViewContainerId,
			...(auxiliaryBarHiddenByCollapse ? { auxiliaryBarHiddenByCollapse: true } : {}),
		});
	}

	private _setNewSessionViewState(state: INewSessionViewState): void {
		this._newSessionViewState = state;
		this._storageService.store(NEW_SESSION_VIEW_STATE_KEY, JSON.stringify(state), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	/**
	 * [D4] When a new (uncreated) session is submitted it becomes a real session
	 * while staying active. Keep the auxiliary bar as the user left it: if open,
	 * keep it open and switch to the Changes view; if closed, keep it closed. The
	 * resulting state is persisted so later syncs don't fall back to hidden.
	 */
	private _onNewSessionSubmitted(sessionResource: URI): void | Promise<unknown> {
		const auxiliaryBarVisible = this._layoutService.isVisible(Parts.AUXILIARYBAR_PART);
		this._viewStateBySession.set(sessionResource, {
			auxiliaryBarVisible,
			auxiliaryBarActiveViewContainerId: CHANGES_VIEW_CONTAINER_ID,
		});
		if (auxiliaryBarVisible) {
			return this._viewsService.openView(CHANGES_VIEW_ID, false);
		}
	}

	// [D3] Restore the auxiliary bar in strict priority order.
	// Note: This method is intentionally synchronous (void return). View-opening calls are
	// fire-and-forget so that _isRestoringSessionLayout ends immediately after sync operations.
	// This allows D2 to capture user actions that happen after the sync restore but before
	// working-set apply, while still skipping single-pane detail-panel reveals during working-set apply.
	private _syncAuxiliaryBarVisibility(sessionResource: URI | undefined, hasWorkspace: boolean, isCreated: boolean): void {
		// [D3a] No resource / no workspace → do nothing.
		if (!sessionResource || !hasWorkspace) {
			return;
		}

		// [D3b] New-session view: all uncreated sessions share one state.
		if (!isCreated) {
			if (this._newSessionViewState && !this._newSessionViewState.auxiliaryBarVisible) {
				this._hideAuxiliaryBarForRestore();
				return;
			}
			void this._openDefaultAuxiliaryBarContainer(false);
			return;
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
			void this._viewsService.openViewContainer(savedContainerId, false);
			return;
		}

		void this._openDefaultAuxiliaryBarContainer(true);
	}

	/** [D3d] Prefer Changes for created sessions and Files for new sessions. */
	private _openDefaultAuxiliaryBarContainer(isCreated: boolean): Promise<unknown> {
		if (isCreated || !this._isAuxiliaryBarContainerPinned(SESSIONS_FILES_CONTAINER_ID)) {
			return this._viewsService.openView(CHANGES_VIEW_ID, false);
		} else {
			return this._viewsService.openViewContainer(SESSIONS_FILES_CONTAINER_ID, false);
		}
	}

	private _restoreSavedAuxiliaryBarContainerOnReveal(sessionResource: URI): boolean {
		const savedState = this._viewStateBySession.get(sessionResource);
		if (!savedState || savedState.auxiliaryBarVisible) {
			return false;
		}

		const savedContainerId = savedState.auxiliaryBarActiveViewContainerId;
		if (savedContainerId && this._isAuxiliaryBarContainerPinned(savedContainerId)) {
			this._viewStateBySession.set(sessionResource, { ...savedState, auxiliaryBarVisible: true });
			void this._viewsService.openViewContainer(savedContainerId, false);
		} else {
			this._viewStateBySession.set(sessionResource, {
				auxiliaryBarVisible: true,
				auxiliaryBarActiveViewContainerId: CHANGES_VIEW_CONTAINER_ID,
			});
			void this._openDefaultAuxiliaryBarContainer(true);
		}
		return true;
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
