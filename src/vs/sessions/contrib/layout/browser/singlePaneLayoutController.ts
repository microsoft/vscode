/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { IEditorWorkingSet } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { LifecyclePhase } from '../../../../workbench/services/lifecycle/common/lifecycle.js';
import { BaseLayoutController } from './baseSessionLayoutController.js';
import { ISinglePaneLayoutContext } from './singlePane/singlePaneLayoutStrategy.js';
import { SinglePaneDetailPanelCoordinator } from './singlePane/singlePaneDetailPanelCoordinator.js';
import { SinglePaneDockedTabsCoordinator } from './singlePane/singlePaneDockedTabsCoordinator.js';
import { SinglePaneNewSessionStrategy } from './singlePane/singlePaneNewSessionStrategy.js';
import { SinglePaneExistingSessionStrategy } from './singlePane/singlePaneExistingSessionStrategy.js';
import { SinglePaneQuickChatStrategy } from './singlePane/singlePaneQuickChatStrategy.js';
import { SinglePaneVisibilityProfileStore } from './singlePane/singlePaneVisibilityProfileStore.js';

export { TOGGLE_DETAILS_COMMAND_ID } from './singlePane/singlePaneExistingSessionStrategy.js';

/** Fresh single-pane key for the per-session layout state (not shared with the classic desktop controller). */
const SINGLE_PANE_LAYOUT_STATE_KEY = 'sessions.singlePane.layoutState';

/**
 * Layout controller for the single-pane detail-panel layout. A sibling of the
 * classic {@link import('./desktopSessionLayoutController.js').LayoutController}
 * (both extend {@link BaseLayoutController}), it owns its behaviour through exactly
 * three composed lifecycle strategies rather than desktop inheritance:
 *  - {@link SinglePaneNewSessionStrategy} — an uncreated, workspace-backed draft;
 *  - {@link SinglePaneExistingSessionStrategy} — a created, workspace-backed session
 *    (also owns the Toggle Details command and the shared managed-tabs coordinator);
 *  - {@link SinglePaneQuickChatStrategy} — a workspace-less quick chat.
 *
 * Each owns the full vertical slice of behaviour for its stage: side-pane visibility, the
 * detail-panel (Changes/Files) mapping, and — for the two workspace stages — a supplementary
 * nuance on the shared managed-docked-tabs reconcile pipeline (`SinglePaneDockedTabsCoordinator`,
 * which also performs the detail-only editor-area collapse). That coordinator, the detail
 * panel's sync mechanics (`SinglePaneDetailPanelCoordinator`), and the shared New/Existing
 * Editor-visibility-profile storage (`SinglePaneVisibilityProfileStore`) are non-strategy coordinator
 * objects — see `singlePane/singlePaneLayoutStrategy.ts`'s doc comment for why.
 *
 * Strategies coordinate through this controller (the {@link ISinglePaneLayoutContext}):
 * a session-switch restore is signalled by {@link _isRestoringSessionLayout}, so
 * a restore-driven editor change is never mistaken for a user action.
 */
export class SinglePaneLayoutController extends BaseLayoutController {

	private _context: ISinglePaneLayoutContext | undefined;
	private _existingSession: SinglePaneExistingSessionStrategy | undefined;
	private _managedTabs: SinglePaneDockedTabsCoordinator | undefined;

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
				hasSavedWorkingSet: sessionResource => that._workingSets.has(sessionResource),
			};
		}
		return this._context;
	}

	// --- Side-pane visibility + detail content + Toggle Details ---

	protected override _registerViewStateManagement(): void {
		const visibilityStore = this._instantiationService.createInstance(SinglePaneVisibilityProfileStore);
		const detailPanel = this._register(this._instantiationService.createInstance(SinglePaneDetailPanelCoordinator));

		this._existingSession = this._register(this._instantiationService.createInstance(SinglePaneExistingSessionStrategy, this._ctx, visibilityStore, detailPanel));
		this._register(this._instantiationService.createInstance(SinglePaneNewSessionStrategy, this._ctx, detailPanel));
		this._register(this._instantiationService.createInstance(SinglePaneQuickChatStrategy, this._ctx, detailPanel, visibilityStore));
	}

	// --- Managed tabs + editor-area collapse (deferred to Restored so they reconcile on top of the restored group) ---

	protected override _registerAuxiliaryControllers(): void {
		this._lifecycleService.when(LifecyclePhase.Restored).then(() => {
			if (this._store.isDisposed) {
				return;
			}
			this._managedTabs = this._register(this._instantiationService.createInstance(SinglePaneDockedTabsCoordinator, this._ctx));
			this._existingSession?.registerManagedTabs(this._managedTabs);
		});
	}

	/** Toggle the detail panel and return whether it is now visible. */
	toggleDetails(): boolean {
		return this._existingSession?.toggleDetails() ?? false;
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

	protected override _onWillApplyWorkingSet(workingSet: IEditorWorkingSet | 'empty'): void {
		this._managedTabs?.prepareWorkingSetRestore(workingSet !== 'empty');
	}
}
