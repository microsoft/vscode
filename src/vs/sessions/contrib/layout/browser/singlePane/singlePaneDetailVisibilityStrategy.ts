/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { autorun, derived, observableFromEvent } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { StorageScope, StorageTarget, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { CHANGES_VIEW_ID } from '../../../changes/common/changes.js';
import { ISinglePaneLayoutContext, SinglePaneLayoutStrategy } from './singlePaneLayoutStrategy.js';

/** Shared layout state for the new-session (untitled) view. */
interface INewSessionViewState {
	readonly auxiliaryBarVisible: boolean;
}

/** Fresh single-pane key for the new-session view state (not shared with the classic desktop controller). */
const SINGLE_PANE_NEW_SESSION_VIEW_STATE_KEY = 'sessions.singlePane.newSessionViewState';

/**
 * Owns **only** the single-pane detail panel's *per-session visibility* (shown /
 * hidden) — capturing the user's choice ([D1]/[D2]), restoring it on session
 * switch ([D3]) by revealing/hiding the auxiliary-bar **part**, and the
 * new-session submit transition ([D4]). It deliberately does **not** choose which
 * container (Changes / Files) is shown, nor react to editor maximize, nor hide
 * for quick chats: that is the sole responsibility of
 * {@link import('./singlePaneDetailPanelStrategy.js').SinglePaneDetailPanelStrategy},
 * which maps the active editor to its container and hides the detail when there
 * is nothing to show. The one exception is the submit transition, which reveals
 * the Changes view as the committed session's initial content.
 */
export class SinglePaneDetailVisibilityStrategy extends SinglePaneLayoutStrategy {

	private _newSessionViewState: INewSessionViewState | undefined;

	constructor(
		ctx: ISinglePaneLayoutContext,
		@IAgentWorkbenchLayoutService private readonly _layoutService: IAgentWorkbenchLayoutService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@IViewsService private readonly _viewsService: IViewsService,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super(ctx);

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

		// Switch between sessions — restore per-session detail visibility.
		let previousSessionResource: URI | undefined;
		let previousIsCreated = false;
		this._register(autorun(reader => {
			const editorMaximized = editorMaximizedObs.read(reader);
			const activeSessionResource = this._ctx.activeSessionResourceObs.read(reader);
			const isCreated = activeSessionIsCreatedObs.read(reader);

			// [D5] While maximized, the detail's visibility/container is owned by the
			// detail-panel strategy (it forces Changes). Skip capture/restore so the
			// forced state is never recorded as the session's per-session preference;
			// un-maximizing re-runs this autorun and restores the real state.
			if (editorMaximized) {
				previousSessionResource = activeSessionResource;
				previousIsCreated = isCreated;
				return;
			}

			const activeSessionHasWorkspace = activeSessionHasWorkspaceObs.read(reader);
			const multipleVisible = this._ctx.multipleSessionsVisibleObs.read(reader);

			if (multipleVisible) {
				previousSessionResource = activeSessionResource;
				previousIsCreated = isCreated;
				return;
			}

			// [D1] Save detail visibility for the session we're switching away from.
			const isSessionSwitch = previousSessionResource !== undefined && !isEqual(previousSessionResource, activeSessionResource);
			if (isSessionSwitch) {
				this._captureViewState(previousSessionResource!);
			}

			// [D4] Submit: a new (uncreated) session transitions to a created one.
			// The classic provider commits in place (same resource); the agent-host /
			// Copilot provider commits by *replacing* the draft with a new resource
			// (`onDidReplaceSession`). Detect both intrinsically from the transition
			// — `!previousIsCreated && isCreated` — instead of relying on the
			// controller's `_onSessionReplaced`, which (being a later-registered
			// listener on the same event) runs *after* this autorun has already
			// hidden the detail. The `!viewStateBySession.has` guard keeps a genuine
			// navigation from a draft to an *existing* created session (which has
			// saved state) on the D3 restore path, so only a brand-new committed
			// session (no saved state yet) is treated as a submit.
			const isSubmit = previousSessionResource !== undefined
				&& !previousIsCreated
				&& isCreated
				&& activeSessionResource !== undefined
				&& !this._ctx.viewStateBySession.has(activeSessionResource);

			previousSessionResource = activeSessionResource;
			previousIsCreated = isCreated;

			if (isSubmit) {
				this._ctx.withSessionLayoutRestore(() => this._onNewSessionSubmitted(activeSessionResource!));
				return;
			}

			// [D3] Restore the session's detail visibility.
			this._ctx.withSessionLayoutRestore(() =>
				this._syncDetailVisibility(activeSessionResource, activeSessionHasWorkspace, isCreated)
			);
		}));

		// [D2] Track detail (aux-bar) visibility changes by the user so that hiding
		// the detail for a session is remembered immediately (not only on switch).
		this._register(this._layoutService.onDidChangePartVisibility(e => {
			if (e.partId !== Parts.AUXILIARYBAR_PART) {
				return;
			}
			// [D9] Toggling the whole side pane hides/shows the aux bar as a side
			// effect, not as a per-session choice, so don't record it.
			if (this._ctx.togglingSidePane) {
				return;
			}
			// A restore-driven hide replays remembered state, not a user action.
			if (this._ctx.hidingAuxiliaryBarForRestore) {
				return;
			}
			// While restoring a session's layout, visibility changes triggered by the
			// detail-panel strategy must not overwrite the session's intended state.
			if (this._ctx.isRestoringSessionLayout) {
				return;
			}
			if (this._ctx.multipleSessionsVisibleObs.get()) {
				return;
			}
			// [D5] While maximized the detail is forced visible; not a user choice.
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
				this._captureViewState(activeSession.resource);
			}
		}));
	}

	// [B4] Snapshot the active session's detail visibility when persisting.
	captureActiveSessionViewState(sessionResource: URI): void {
		this._captureViewState(sessionResource);
	}

	/** The shared new-session view's detail visibility, or `undefined` if never chosen. */
	get newSessionAuxiliaryBarVisible(): boolean | undefined {
		return this._newSessionViewState?.auxiliaryBarVisible;
	}

	/**
	 * [D9b] Records a whole-side-pane toggle for the active session. For an
	 * uncreated session it updates the shared new-session choice. For a created
	 * session, only a full collapse of a previously-visible detail is marked as a
	 * collapse-driven hide (so opening it later re-reveals it); any other outcome
	 * just captures the resulting state, preserving an explicit hide.
	 */
	onSidePaneToggled(collapsed: boolean, previousAuxiliaryBarVisible: boolean): void {
		if (this._ctx.multipleSessionsVisibleObs.get()) {
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
			this._ctx.viewStateBySession.set(activeSession.resource, {
				auxiliaryBarVisible: false,
				auxiliaryBarActiveViewContainerId: undefined,
				auxiliaryBarHiddenByCollapse: true,
			});
			return;
		}
		this._captureViewState(activeSession.resource);
	}

	private _captureViewState(sessionResource: URI): void {
		const auxiliaryBarVisible = this._layoutService.isVisible(Parts.AUXILIARYBAR_PART);
		// [D9] Preserve a collapse marker while the detail stays hidden; the marker
		// is only set by `onSidePaneToggled` for the session that was collapsed, so
		// an explicit hide is never mistaken for a collapse.
		const previous = this._ctx.viewStateBySession.get(sessionResource);
		const auxiliaryBarHiddenByCollapse = !auxiliaryBarVisible && previous?.auxiliaryBarHiddenByCollapse === true;
		this._ctx.viewStateBySession.set(sessionResource, {
			auxiliaryBarVisible,
			auxiliaryBarActiveViewContainerId: undefined,
			...(auxiliaryBarHiddenByCollapse ? { auxiliaryBarHiddenByCollapse: true } : {}),
		});
	}

	private _setNewSessionViewState(state: INewSessionViewState): void {
		this._newSessionViewState = state;
		this._storageService.store(SINGLE_PANE_NEW_SESSION_VIEW_STATE_KEY, JSON.stringify(state), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	/**
	 * [D4] When a new (uncreated) session is submitted it becomes a real session
	 * while staying active. Keep the detail as the user left it (visible/hidden)
	 * and, when visible, reveal the Changes view as the committed session's
	 * initial content. The resulting visibility is persisted so later restores
	 * don't fall back to hidden.
	 */
	private _onNewSessionSubmitted(sessionResource: URI): void | Promise<unknown> {
		const auxiliaryBarVisible = this._layoutService.isVisible(Parts.AUXILIARYBAR_PART);
		this._ctx.viewStateBySession.set(sessionResource, {
			auxiliaryBarVisible,
			auxiliaryBarActiveViewContainerId: undefined,
		});
		if (auxiliaryBarVisible) {
			return this._viewsService.openView(CHANGES_VIEW_ID, false);
		}
	}

	// [D3] Restore the detail panel's visibility (shown/hidden) for the session.
	// The container shown when visible is chosen by the detail-panel strategy.
	// Synchronous (void): the reveal is fire-and-forget so the restore epoch ends
	// immediately.
	private _syncDetailVisibility(sessionResource: URI | undefined, hasWorkspace: boolean, isCreated: boolean): void {
		// [D3a] No resource / no workspace → do nothing.
		if (!sessionResource || !hasWorkspace) {
			return;
		}

		// [D3b] New-session view: all uncreated sessions share one state. Default to
		// the detail shown (the detail-panel strategy opens Files) unless the user
		// hid it.
		if (!isCreated) {
			if (this._newSessionViewState && !this._newSessionViewState.auxiliaryBarVisible) {
				this._ctx.hideAuxiliaryBarForRestore();
			} else {
				this._layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
			}
			return;
		}

		// [D3c] Existing sessions: restore the user's last explicit visibility.
		// A session with NO saved state yet (a just-submitted committed session, or
		// a created session seen for the first time) must be left in its current
		// on-screen state — never force-hidden. Forcing a hide here re-closes the
		// detail the user had open in the new-session view: on submit the committed
		// session's resource can change again after the initial transition, so a
		// later restore run lands here with no saved state, and the intrinsic
		// submit detection ([D4]) no longer applies. The detail-panel strategy keeps
		// the container in sync either way; the state is captured on the next
		// switch-away or user toggle.
		const savedState = this._ctx.viewStateBySession.get(sessionResource);
		if (!savedState) {
			return;
		}
		if (!savedState.auxiliaryBarVisible) {
			this._ctx.hideAuxiliaryBarForRestore();
		} else {
			this._layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
		}
	}

	private _loadNewSessionViewState(): void {
		const newSessionRaw = this._storageService.get(SINGLE_PANE_NEW_SESSION_VIEW_STATE_KEY, StorageScope.WORKSPACE);
		if (!newSessionRaw) {
			return;
		}
		try {
			const parsed = JSON.parse(newSessionRaw);
			if (parsed && typeof parsed.auxiliaryBarVisible === 'boolean') {
				this._newSessionViewState = { auxiliaryBarVisible: parsed.auxiliaryBarVisible };
			} else {
				this._storageService.remove(SINGLE_PANE_NEW_SESSION_VIEW_STATE_KEY, StorageScope.WORKSPACE);
			}
		} catch {
			this._storageService.remove(SINGLE_PANE_NEW_SESSION_VIEW_STATE_KEY, StorageScope.WORKSPACE);
		}
	}
}
