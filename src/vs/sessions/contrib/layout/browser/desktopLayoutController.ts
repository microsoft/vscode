/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IEditorWorkingSet } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { LifecyclePhase } from '../../../../workbench/services/lifecycle/common/lifecycle.js';
import { DesktopChangesEditorTransitionContext } from '../../../common/contextkeys.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { BaseLayoutController } from './baseSessionLayoutController.js';
import { IDesktopLayoutContext } from './desktop/desktopLayoutStrategy.js';
import { DesktopDetailPanelCoordinator } from './desktop/desktopDetailPanelCoordinator.js';
import { DesktopDockedTabsCoordinator } from './desktop/desktopDockedTabsCoordinator.js';
import { DesktopDraftSessionStrategy } from './desktop/desktopDraftSessionStrategy.js';
import { DesktopExistingSessionStrategy } from './desktop/desktopExistingSessionStrategy.js';
import { DesktopOwnerCompositionStore } from './desktop/desktopOwnerCompositionStore.js';
import { DesktopVisibilityProfileStore } from './desktop/desktopVisibilityProfileStore.js';

export { TOGGLE_DETAILS_COMMAND_ID } from './desktop/desktopExistingSessionStrategy.js';

/** Storage key for per-session desktop layout state. */
const DESKTOP_LAYOUT_STATE_KEY = 'sessions.singlePane.layoutState';
const DESKTOP_CHAT_LAYOUT_STATE_KEY = 'sessions.singlePane.chatLayoutState';

type ChangesEditorTransitionPhase = 'idle' | 'awaitingWorkingSet' | 'restoringWorkingSet' | 'reconciling';

/**
 * Layout controller for the desktop detail-panel layout. It owns its behavior
 * through exactly two composed lifecycle strategies:
 *  - {@link DesktopDraftSessionStrategy} — workspace-backed and workspace-less drafts;
 *  - {@link DesktopExistingSessionStrategy} — a created, workspace-backed session
 *    (also owns the Toggle Details command and the shared managed-tabs coordinator);
 *
 * Each owns the full vertical slice of behaviour for its stage: side-pane visibility, the
 * detail-panel (Changes/Files) mapping, and — for the two workspace stages — a supplementary
 * nuance on the shared managed-docked-tabs reconcile pipeline (`DesktopDockedTabsCoordinator`,
 * which also performs the detail-only editor-area collapse). That coordinator, the detail
 * panel's sync mechanics (`DesktopDetailPanelCoordinator`), and the shared New/Existing
 * Editor-visibility-profile storage (`DesktopVisibilityProfileStore`) are non-strategy coordinator
 * objects — see `desktop/desktopLayoutStrategy.ts`'s doc comment for why.
 *
 * Strategies coordinate through this controller (the {@link IDesktopLayoutContext}):
 * a session-switch restore is signalled by {@link _isRestoringSessionLayout}, so
 * a restore-driven editor change is never mistaken for a user action.
 */
export class DesktopLayoutController extends BaseLayoutController {

	private _context: IDesktopLayoutContext | undefined;
	private _existingSession: DesktopExistingSessionStrategy | undefined;
	private _managedTabs: DesktopDockedTabsCoordinator | undefined;
	protected _compositionStore: DesktopOwnerCompositionStore | undefined;
	private _changesEditorTransitionPhase: ChangesEditorTransitionPhase = 'idle';
	private _onDidChangeChangesEditorTransition: Emitter<void> | undefined;
	private readonly _changesEditorTransitionContextKey = DesktopChangesEditorTransitionContext.bindTo(this._contextKeyService);

	protected override get _layoutStateStorageKey(): string {
		return this._chatLayoutEnabled ? DESKTOP_CHAT_LAYOUT_STATE_KEY : DESKTOP_LAYOUT_STATE_KEY;
	}

	protected override get _legacyWorkingSetsStorageKey(): string | undefined {
		return undefined;
	}

	protected override get _legacyLayoutStateStorageKey(): string | undefined {
		return this._chatLayoutEnabled ? DESKTOP_LAYOUT_STATE_KEY : undefined;
	}

	private get _ctx(): IDesktopLayoutContext {
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
				completeChangesEditorTransition: () => {
					if (that._changesEditorTransitionPhase === 'reconciling') {
						const session = that._sessionsService.activeSession.get();
						// An uncreated workspace-less composer has no Changes editor to await.
						if (session?.isCreated.get() && session.isQuickChat?.get() !== true && !session.workspace.get()) {
							return;
						}
						that._setChangesEditorTransitionPhase('idle');
					}
				},
				chatLayoutActive: reader => that._chatLayoutActive(reader),
				chatLayoutSuspended: reader => that._chatLayoutSuspended(reader),
				ownerKeyFor: (session, reader) => that._ownerKeyFor(session, reader),
				get compositionStore() { return that._compositionStore!; },
			};
		}
		return this._context;
	}

	// --- Side-pane visibility + detail content + Toggle Details ---

	protected override _registerViewStateManagement(): void {
		this._register(toDisposable(() => this._changesEditorTransitionContextKey.reset()));
		this._compositionStore = this._instantiationService.createInstance(DesktopOwnerCompositionStore);
		const visibilityStore = this._instantiationService.createInstance(DesktopVisibilityProfileStore);
		const detailPanel = this._register(this._instantiationService.createInstance(DesktopDetailPanelCoordinator));

		this._existingSession = this._register(this._instantiationService.createInstance(DesktopExistingSessionStrategy, this._ctx, visibilityStore, detailPanel));
		this._register(this._instantiationService.createInstance(DesktopDraftSessionStrategy, this._ctx, detailPanel, visibilityStore));
	}

	// --- Managed tabs + editor-area collapse (deferred to Restored so they reconcile on top of the restored group) ---

	protected override _registerAuxiliaryControllers(): void {
		this._lifecycleService.when(LifecyclePhase.Restored).then(() => {
			if (this._store.isDisposed) {
				return;
			}
			const onDidChangeChangesEditorTransition = this._onDidChangeChangesEditorTransition = this._register(new Emitter<void>());
			this._register(this.onDidEndSessionLayoutRestore(() => {
				if (this._changesEditorTransitionPhase === 'restoringWorkingSet') {
					this._setChangesEditorTransitionPhase('reconciling');
				}
			}));
			this._register(this._editorGroupsService.registerContextKeyProvider({
				contextKey: DesktopChangesEditorTransitionContext,
				getGroupContextKeyValue: group => this._changesEditorTransitionPhase !== 'idle'
					&& group.id === this._editorGroupsService.mainPart.activeGroup.id
					&& (group.activeEditor === null
						|| !!group.activeEditor.resource && this._sessionChangesService.getSessionResource(group.activeEditor.resource) !== undefined),
				onDidChange: onDidChangeChangesEditorTransition.event,
			}));
			this._register(this._editorGroupsService.mainPart.onDidAddGroup(() => onDidChangeChangesEditorTransition.fire()));
			this._managedTabs = this._register(this._instantiationService.createInstance(DesktopDockedTabsCoordinator, this._ctx));
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

	/**
	 */
	protected override get _isPanelVisibilityPerSession(): boolean {
		return this._chatLayoutEnabled;
	}

	protected override get _isPanelViewPerSession(): boolean {
		return true;
	}

	protected override _shouldRevealEditorPartOnApply(_editorPartHidden: boolean, _isModal: boolean): boolean {
		return false;
	}

	protected override _shouldHideEditorPartOnApply(_editorPartHidden: boolean): boolean {
		return false;
	}

	protected override _onWillApplyWorkingSet(workingSet: IEditorWorkingSet | 'empty'): void {
		this._managedTabs?.prepareWorkingSetRestore(workingSet !== 'empty');
		if ((this._changesEditorTransitionPhase ?? 'idle') !== 'idle'
			|| this._shouldPreserveChangesEditor(this._sessionsService.activeSession.get())) {
			this._setChangesEditorTransitionPhase('restoringWorkingSet');
		}
	}

	protected override _onActiveSessionSwitched(_previousSession: IActiveSession, session: IActiveSession | undefined): void {
		this._setChangesEditorTransitionPhase(this._shouldPreserveChangesEditor(session) ? 'awaitingWorkingSet' : 'idle');
	}

	private _shouldPreserveChangesEditor(session: IActiveSession | undefined): boolean {
		const editorResource = this._editorGroupsService.mainPart.activeGroup.activeEditor?.resource;
		return !!session
			&& session.isQuickChat?.get() !== true
			&& !!editorResource
			&& !!this._sessionChangesService.getSessionResource(editorResource);
	}

	private _setChangesEditorTransitionPhase(phase: ChangesEditorTransitionPhase): void {
		const previousPhase = this._changesEditorTransitionPhase ?? 'idle';
		this._changesEditorTransitionPhase = phase;
		this._changesEditorTransitionContextKey.set(phase !== 'idle');
		if ((previousPhase === 'idle') !== (phase === 'idle')) {
			this._onDidChangeChangesEditorTransition?.fire();
		}
	}

	protected override _onOwnerKeyRemapped(oldKey: URI, newKey: URI): void {
		this._compositionStore?.remap(oldKey, newKey);
		this._existingSession?.remapPreHideComposition(oldKey, newKey);
	}

	protected override _onOwnerKeysForgotten(keys: readonly URI[]): void {
		this._compositionStore?.forget(keys);
		this._existingSession?.forgetPreHideComposition(keys);
	}
}
