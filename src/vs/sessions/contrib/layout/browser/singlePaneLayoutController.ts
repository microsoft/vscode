/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { LifecyclePhase } from '../../../../workbench/services/lifecycle/common/lifecycle.js';
import { BaseLayoutController } from './baseSessionLayoutController.js';
import { SinglePaneDetailPanelStrategy } from './singlePane/singlePaneDetailPanelStrategy.js';
import { SinglePaneEditorAreaCollapseStrategy } from './singlePane/singlePaneEditorAreaCollapseStrategy.js';
import { ISinglePaneLayoutContext, SinglePaneDockedTabsCoordinator } from './singlePane/singlePaneLayoutStrategy.js';
import { SinglePaneManagedTabsStrategy } from './singlePane/singlePaneManagedTabsStrategy.js';
import { SinglePaneDetailsStrategy } from './singlePane/singlePaneDetailsStrategy.js';
import { SinglePaneSidePaneVisibilityStrategy } from './singlePane/singlePaneSidePaneVisibilityStrategy.js';

export { TOGGLE_DETAILS_COMMAND_ID } from './singlePane/singlePaneDetailsStrategy.js';

/** Fresh single-pane key for the per-session layout state (not shared with the classic desktop controller). */
const SINGLE_PANE_LAYOUT_STATE_KEY = 'sessions.singlePane.layoutState';

/**
 * Layout controller for the single-pane detail-panel layout. A sibling of the
 * classic {@link import('./desktopSessionLayoutController.js').LayoutController}
 * (both extend {@link BaseLayoutController}), it owns its behaviour through
 * composed strategy objects rather than desktop inheritance:
 *  - global editor/detail visibility, with temporary quick-chat suppression;
 *  - managed docked tabs (pinned Changes multi-diff + empty Files placeholder)
 *    and editor-area tab collapse;
 *  - the detail panel mapping (active editor → Changes/Files container);
 *  - the Toggle Details action;
 *
 * Strategies coordinate through this controller (the {@link ISinglePaneLayoutContext}):
 * a session-switch restore is signalled by {@link _isRestoringSessionLayout}, so
 * a restore-driven editor change is never mistaken for a user action.
 */
export class SinglePaneLayoutController extends BaseLayoutController {

	private _context: ISinglePaneLayoutContext | undefined;
	private _details: SinglePaneDetailsStrategy | undefined;

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
				onDidEndSessionLayoutRestore: that.onDidEndSessionLayoutRestore,
				get togglingSidePane() { return that._togglingSidePane; },
				get multipleSessionsVisibleObs() { return that.multipleSessionsVisibleObs; },
				get activeSessionResourceObs() { return that.activeSessionResourceObs; },
			};
		}
		return this._context;
	}

	// --- Side-pane visibility + detail content + Toggle Details ---

	protected override _registerViewStateManagement(): void {
		this._register(this._instantiationService.createInstance(SinglePaneSidePaneVisibilityStrategy, this._ctx));
		// The detail-panel strategy owns which container (Changes/Files) is shown
		// and the "nothing to show" hide. It only reads the active editor and opens
		// containers, so it registers immediately (not deferred like the managed
		// tabs) — the side-pane visibility strategy restores the part and this strategy
		// fills it with the right container in the same turn.
		this._register(this._instantiationService.createInstance(SinglePaneDetailPanelStrategy, this._ctx));
		this._details = this._register(this._instantiationService.createInstance(SinglePaneDetailsStrategy, this._ctx));
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
		});
	}

	/** Toggle the detail panel and return whether it is now visible. */
	toggleDetails(): boolean {
		return this._details?.toggleDetails() ?? false;
	}

	// --- Base hooks ---

	/**
	 * A session-switch restore closes/opens the docked editors (empty working-set
	 * apply, managed-tab reconciliation), so suppress editor-part auto-visibility
	 * for the whole restore to avoid closing the side pane or mistaking a
	 * layout-driven close for a user dismissing a managed tab.
	 */
	protected override _suppressEditorVisibilityDuringRestore(): IDisposable | undefined {
		return this._layoutService.suppressEditorPartAutoVisibility();
	}

	protected override get _isEditorPartVisibilityPerSession(): boolean {
		return false;
	}

	protected override get _isViewStatePerSession(): boolean {
		return false;
	}

	protected override _shouldRevealEditorPartOnApply(_editorPartHidden: boolean, _isModal: boolean): boolean {
		return false;
	}

	protected override _shouldHideEditorPartOnApply(_editorPartHidden: boolean): boolean {
		return false;
	}
}
