/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { LifecyclePhase } from '../../../../workbench/services/lifecycle/common/lifecycle.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { BaseLayoutController } from './baseSessionLayoutController.js';
import { SinglePaneDetailPanelStrategy } from './singlePane/singlePaneDetailPanelStrategy.js';
import { SinglePaneDetailVisibilityStrategy } from './singlePane/singlePaneDetailVisibilityStrategy.js';
import { SinglePaneEditorAreaCollapseStrategy } from './singlePane/singlePaneEditorAreaCollapseStrategy.js';
import { ISinglePaneLayoutContext, SinglePaneDockedTabsCoordinator } from './singlePane/singlePaneLayoutStrategy.js';
import { SinglePaneManagedTabsStrategy } from './singlePane/singlePaneManagedTabsStrategy.js';
import { SinglePaneNewSessionRulesStrategy } from './singlePane/singlePaneNewSessionRulesStrategy.js';
import { SinglePaneQuickChatEditorHideStrategy } from './singlePane/singlePaneQuickChatEditorHideStrategy.js';
import { SinglePaneResponsiveSidebarStrategy } from './singlePane/singlePaneResponsiveSidebarStrategy.js';

export { TOGGLE_DETAILS_COMMAND_ID } from './singlePane/singlePaneResponsiveSidebarStrategy.js';

/** Fresh single-pane key for the per-session layout state (not shared with the classic desktop controller). */
const SINGLE_PANE_LAYOUT_STATE_KEY = 'sessions.singlePane.layoutState';

/**
 * Layout controller for the single-pane detail-panel layout. A sibling of the
 * classic {@link import('./desktopSessionLayoutController.js').LayoutController}
 * (both extend {@link BaseLayoutController}), it owns its behaviour through
 * composed strategy objects rather than desktop inheritance:
 *  - auxiliary-bar per-session state ([D1]-[D5]) and empty-aux cleanup ([D10]);
 *  - managed docked tabs (pinned Changes multi-diff + empty Files placeholder)
 *    and editor-area tab collapse;
 *  - the detail panel mapping (active editor → Changes/Files container);
 *  - the responsive sessions-list auto-hide + Toggle Details action;
 *  - the new-session editor-hide rule ([R1]) and quick-chat editor hide.
 *
 * Strategies coordinate through this controller (the {@link ISinglePaneLayoutContext}):
 * a session-switch restore is signalled by {@link _isRestoringSessionLayout}, so
 * a restore-driven editor change is never mistaken for a user action.
 */
export class SinglePaneLayoutController extends BaseLayoutController {

	private _context: ISinglePaneLayoutContext | undefined;
	private _detailVisibility: SinglePaneDetailVisibilityStrategy | undefined;
	private _responsiveSidebar: SinglePaneResponsiveSidebarStrategy | undefined;

	/** `true` while a restore-driven aux-bar hide is in progress, so the [D2] capture ignores it. */
	private _hidingAuxiliaryBarForRestore = false;

	protected override get _layoutStateStorageKey(): string {
		return SINGLE_PANE_LAYOUT_STATE_KEY;
	}

	protected override get _legacyWorkingSetsStorageKey(): string | undefined {
		return undefined;
	}

	private get _ctx(): ISinglePaneLayoutContext {
		if (!this._context) {
			const that = this;
			this._context = {
				get isRestoringSessionLayout() { return that._isRestoringSessionLayout; },
				withSessionLayoutRestore: work => that._withSessionLayoutRestore(work),
				get togglingSidePane() { return that._togglingSidePane; },
				get multipleSessionsVisibleObs() { return that.multipleSessionsVisibleObs; },
				get activeSessionResourceObs() { return that.activeSessionResourceObs; },
				get viewStateBySession() { return that._viewStateBySession; },
				get hidingAuxiliaryBarForRestore() { return that._hidingAuxiliaryBarForRestore; },
				hideAuxiliaryBarForRestore: () => that._hideAuxiliaryBarForRestore(),
			};
		}
		return this._context;
	}

	// --- Auxiliary bar state + empty-aux cleanup + responsive sidebar + R1 ---

	protected override _registerViewStateManagement(): void {
		this._detailVisibility = this._register(this._instantiationService.createInstance(SinglePaneDetailVisibilityStrategy, this._ctx));
		// The detail-panel strategy owns which container (Changes/Files) is shown
		// and the "nothing to show" hide. It only reads the active editor and opens
		// containers, so it registers immediately (not deferred like the managed
		// tabs) — the detail-visibility strategy reveals the part and this strategy
		// fills it with the right container in the same turn.
		this._register(this._instantiationService.createInstance(SinglePaneDetailPanelStrategy, this._ctx));
		this._responsiveSidebar = this._register(this._instantiationService.createInstance(SinglePaneResponsiveSidebarStrategy, this._ctx));
		this._register(this._instantiationService.createInstance(SinglePaneNewSessionRulesStrategy, this._ctx));
	}

	// --- Managed tabs + detail panel (deferred to Restored so they reconcile on top of the restored group) ---

	protected override _registerAuxiliaryControllers(): void {
		this._lifecycleService.when(LifecyclePhase.Restored).then(() => {
			if (this._store.isDisposed) {
				return;
			}
			const coordinator = this._register(new SinglePaneDockedTabsCoordinator(this._sessionChangesService));

			this._register(this._instantiationService.createInstance(SinglePaneManagedTabsStrategy, this._ctx, coordinator));
			this._register(this._instantiationService.createInstance(SinglePaneEditorAreaCollapseStrategy, this._ctx, coordinator));
			this._register(this._instantiationService.createInstance(SinglePaneQuickChatEditorHideStrategy, this._ctx));
		});
	}

	/**
	 * Toggle the detail panel (auxiliary bar) and, in the same gesture, auto-hide
	 * the sessions list to free room. Returns whether the detail panel is now visible.
	 */
	toggleDetails(): boolean {
		return this._responsiveSidebar?.toggleDetails() ?? false;
	}

	// --- Base hooks ---

	/**
	 * With no remembered state, a created session re-opens to the Changes editor
	 * with the detail panel closed; a new-session view re-opens to the Files detail
	 * (its editor content stays hidden by R1).
	 */
	protected override _defaultReopenSidePaneParts(): { readonly editor: boolean; readonly auxiliaryBar: boolean } {
		if (this._sessionsService.activeSession.get()?.isCreated.get() === false) {
			return { editor: false, auxiliaryBar: true };
		}
		return { editor: true, auxiliaryBar: false };
	}

	/**
	 * A session-switch restore closes/opens the docked editors (empty working-set
	 * apply, managed-tab reconciliation), so suppress editor-part auto-visibility
	 * for the whole restore to avoid closing the side pane or mistaking a
	 * layout-driven close for a user dismissing a managed tab.
	 */
	protected override _suppressEditorVisibilityDuringRestore(): IDisposable | undefined {
		return this._layoutService.suppressEditorPartAutoVisibility();
	}

	/**
	 * The docked editor lives in the grid even when `useModal` is `'all'`, and a
	 * created session shows the docked Changes editor by default (Editor-only), so
	 * reveal the editor part for a created session unless it was explicitly hidden.
	 * New-session views keep their editor closed (R1), so they are excluded. Quick
	 * chats have no side pane at all, so their editor part is never auto-revealed.
	 */
	protected override _shouldRevealEditorPartOnApply(editorPartHidden: boolean, _isModal: boolean): boolean {
		const activeSession = this._sessionsService.activeSession.get();
		const isCreatedSession = activeSession?.isCreated.get() ?? false;
		const isQuickChat = activeSession?.isQuickChat?.get() ?? false;
		return !editorPartHidden && isCreatedSession && !isQuickChat;
	}

	/** A created single-pane session with no saved editors still shows its managed Changes editor. */
	protected override _shouldRevealEditorPartForEmptyWorkingSet(revealEditorPart: boolean): boolean {
		return revealEditorPart;
	}

	/**
	 * A created single-pane session that had its docked editor closed (Detail-only
	 * or whole side pane closed) must be restored to that state on switch — the
	 * editor part is actively hidden rather than left visible from the previous
	 * session. New-session views (R1) and quick chats are handled separately.
	 */
	protected override _shouldHideEditorPartOnApply(editorPartHidden: boolean): boolean {
		const activeSession = this._sessionsService.activeSession.get();
		const isCreatedSession = activeSession?.isCreated.get() ?? false;
		const isQuickChat = activeSession?.isQuickChat?.get() ?? false;
		return editorPartHidden && isCreatedSession && !isQuickChat;
	}

	// [B4] Snapshot the active session's aux-bar state when persisting.
	protected override _captureActiveSessionViewState(sessionResource: URI): void {
		this._detailVisibility?.captureActiveSessionViewState(sessionResource);
	}

	// [D9b] Record a whole-side-pane toggle for the active session.
	protected override _onSidePaneToggled(collapsed: boolean, previousAuxiliaryBarVisible: boolean): void {
		this._detailVisibility?.onSidePaneToggled(collapsed, previousAuxiliaryBarVisible);
	}

	/**
	 * On new-session submit the base transfers the draft's editor-part visibility
	 * to the committed session. The **active** submit's detail (aux-bar) state is
	 * handled reactively by {@link SinglePaneDetailVisibilityStrategy} (it detects
	 * the transition intrinsically, before this later-firing listener runs). Here
	 * we only need to cover a **background** submit — a new session committed while
	 * a *different* session is active — by seeding the committed session's detail
	 * state from the shared new-session choice so it restores correctly on switch.
	 */
	protected override _onSessionReplaced(from: ISession, to: ISession): void {
		super._onSessionReplaced(from, to);

		const activeSession = this._sessionsService.activeSession.get();
		const replacedSessionIsActive = isEqual(activeSession?.resource, from.resource) || isEqual(activeSession?.resource, to.resource);
		if (replacedSessionIsActive) {
			return;
		}

		const auxiliaryBarVisible = this._detailVisibility?.newSessionAuxiliaryBarVisible;
		if (auxiliaryBarVisible === undefined) {
			return;
		}

		this._viewStateBySession.set(to.resource, {
			auxiliaryBarVisible,
			auxiliaryBarActiveViewContainerId: undefined,
		});
	}

	private _hideAuxiliaryBarForRestore(): void {
		this._hidingAuxiliaryBarForRestore = true;
		try {
			this._layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
		} finally {
			this._hidingAuxiliaryBarForRestore = false;
		}
	}
}
