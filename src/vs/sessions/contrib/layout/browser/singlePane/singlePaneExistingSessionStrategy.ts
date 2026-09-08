/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../../base/browser/window.js';
import { Event } from '../../../../../base/common/event.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IReader, observableFromEvent } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { AuxiliaryBarVisibleContext, IsAuxiliaryWindowContext, IsSessionsWindowContext, IsTopRightEditorGroupContext, MainEditorAreaVisibleContext } from '../../../../../workbench/common/contextkeys.js';
import { GroupModelChangeKind } from '../../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { HasDockedDetailsContext, SinglePaneLayoutEnabledContext } from '../../../../common/contextkeys.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionChangesService } from '../../../changes/browser/sessionChangesService.js';
import { EmptyFileEditorInput } from '../../../editor/browser/emptyFileEditorInput.js';
import { DetailPanelTarget, SinglePaneDetailPanelCoordinator } from './singlePaneDetailPanelCoordinator.js';
import { SinglePaneDockedTabsCoordinator } from './singlePaneDockedTabsCoordinator.js';
import { isChangesEditorInput, isEditorWithoutDockedDetails, isFileEditorInput, isMainPartEmpty } from './singlePaneSharedHelpers.js';
import { ISinglePaneLayoutContext, SinglePaneLayoutStrategy } from './singlePaneLayoutStrategy.js';
import { SessionVisibilityProfile, SinglePaneVisibilityProfileStore } from './singlePaneVisibilityProfileStore.js';

/** Command that toggles the single-pane detail panel (auxiliary bar) from the editor header. */
export const TOGGLE_DETAILS_COMMAND_ID = 'workbench.action.agentSessions.toggleDetails';
const singlePaneHeaderToggleDetailsOrder = 9;

/**
 * Behaviour for the **Existing Session** lifecycle stage — a created, workspace-backed
 * session:
 *  - the shared Existing Session Editor visibility profile, applied on entry and captured
 *    while the user adjusts it;
 *  - detecting a New→Existing submit and, at that moment, capturing the *current* on-screen
 *    composition into **both** the New and Existing profiles so the view never jumps;
 *  - the detail-panel mapping while an Existing Session is active;
 *  - the Toggle Details command (kind-agnostic — it also applies while a New Session's docked
 *    tabs are visible — hosted here since Existing is the steady-state default);
 *  - owning (constructing/disposing) the shared {@link SinglePaneDockedTabsCoordinator}, whose
 *    managed-tabs reconcile pipeline and detail-only editor-area collapse must stay
 *    single-instance across the New→Existing submit transition — see its doc comment.
 */
export class SinglePaneExistingSessionStrategy extends SinglePaneLayoutStrategy {

	private _managedTabs: SinglePaneDockedTabsCoordinator | undefined;
	private _detailHiddenTransiently = false;
	private _detailHiddenByEditor = false;
	private _changingDetailTransiently = false;

	constructor(
		ctx: ISinglePaneLayoutContext,
		private readonly _visibilityStore: SinglePaneVisibilityProfileStore,
		private readonly _detailPanel: SinglePaneDetailPanelCoordinator,
		@IAgentWorkbenchLayoutService private readonly _layoutService: IAgentWorkbenchLayoutService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@IEditorService private readonly _editorService: IEditorService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@ISessionChangesService private readonly _sessionChangesService: ISessionChangesService,
	) {
		super(ctx);

		this._registerVisibility();
		this._registerEmptyGroupClose();
		this._registerDetailPanel();
		this._register(this._registerToggleDetailsAction());
	}

	/** Toggle the detail panel and return whether it is now visible. */
	toggleDetails(): boolean {
		const nowVisible = !this._layoutService.isVisible(Parts.AUXILIARYBAR_PART);
		this._layoutService.setPartHidden(!nowVisible, Parts.AUXILIARYBAR_PART);
		return nowVisible;
	}

	private _registerEmptyGroupClose(): void {
		// Close the whole pane before detail synchronization can persist its combined width as Editor-only.
		this._register(this._editorService.onDidEditorsChange(event => {
			if (!event || event.event.kind !== GroupModelChangeKind.EDITOR_CLOSE) {
				return;
			}

			const session = this._sessionsService.activeSession.get();
			if (this._ctx.isRestoringSessionLayout
				|| this._ctx.multipleSessionsVisibleObs.get()
				|| this._layoutService.isEditorPartAutoVisibilitySuppressed()
				|| !session
				|| session.isQuickChat?.get()
				|| !session.isCreated.get()
				|| !session.workspace.get()
				|| !isMainPartEmpty(this._editorGroupsService)) {
				return;
			}

			this._layoutService.hideSidePane();
		}));
	}

	/**
	 * Constructs and owns the shared managed-tabs coordinator, and registers this strategy's
	 * "activate Changes on submit" supplement to it. Deferred to `LifecyclePhase.Restored` by
	 * the controller (mirrors the original managed-tabs/editor-collapse strategies' timing) so
	 * the reconcile pipeline only starts once the workbench's restored editor group exists.
	 */
	registerManagedTabs(managedTabs: SinglePaneDockedTabsCoordinator): void {
		this._managedTabs = managedTabs;
		this._registerManagedTabsSupplement();
	}

	private get managedTabs(): SinglePaneDockedTabsCoordinator {
		if (!this._managedTabs) {
			throw new Error('SinglePaneExistingSessionStrategy: managed tabs accessed before registerManagedTabs()');
		}
		return this._managedTabs;
	}

	// --- Side-pane visibility ------------------------------------------------------------

	private _registerVisibility(): void {
		let initialized = false;
		let wasExistingActive = false;
		let previousQuickChatResource: URI | undefined;
		let previousIsCreated: boolean | undefined;
		let previousSession: IActiveSession | undefined;
		let togglingSidePane = false;

		this._register(autorun(reader => {
			const multipleSessionsVisible = this._ctx.multipleSessionsVisibleObs.read(reader);
			const activeSession = this._sessionsService.activeSession.read(reader);
			const isQuickChat = activeSession?.isQuickChat?.read(reader) ?? false;
			const wasQuickChatActive = previousQuickChatResource !== undefined;
			const isWorkspaceConversion = !isQuickChat && !!activeSession && isEqual(previousQuickChatResource, activeSession.resource);
			previousQuickChatResource = isQuickChat ? activeSession?.resource : undefined;
			if (isWorkspaceConversion) {
				this._captureExistingProfile();
			}

			if (multipleSessionsVisible) {
				const workspace = activeSession?.workspace.read(reader);
				const isCreated = activeSession?.isCreated.read(reader);
				if (!isWorkspaceConversion && activeSession && !isQuickChat && workspace && isCreated === true) {
					this._ctx.withSessionLayoutRestore(() => this._reveal(this._visibilityStore.get(SessionVisibilityProfile.Existing)));
				}
				wasExistingActive = false;
				return;
			}

			if (!activeSession) {
				return;
			}

			if (isQuickChat) {
				wasExistingActive = false;
				return;
			}

			const isCreated = activeSession.isCreated.read(reader);
			const sessionChanged = previousSession !== undefined && !isEqual(previousSession.resource, activeSession.resource);
			const isSubmit = !wasQuickChatActive && previousIsCreated === false && isCreated
				&& (previousSession === activeSession || previousSession?.isCreated.read(undefined) === true);
			if (isSubmit) {
				this._captureExistingProfile();
			}

			if (isCreated) {
				if (!isSubmit && !isWorkspaceConversion && (!initialized || !wasExistingActive || wasQuickChatActive || sessionChanged)) {
					this._ctx.withSessionLayoutRestore(() => this._apply(this._visibilityStore.get(SessionVisibilityProfile.Existing)));
				}
				wasExistingActive = true;
			} else {
				wasExistingActive = false;
			}

			previousIsCreated = isCreated;
			previousSession = activeSession;
			initialized = true;
		}));

		this._register(this._layoutService.onDidChangePartVisibility(e => {
			if (e.partId !== Parts.EDITOR_PART && e.partId !== Parts.AUXILIARYBAR_PART) {
				return;
			}
			if (togglingSidePane || (e.partId === Parts.AUXILIARYBAR_PART && this._changingDetailTransiently)) {
				return;
			}
			this._captureExistingProfileIfApplicable();
		}));
		this._register(this._layoutService.onWillToggleSidePane(() => {
			togglingSidePane = true;
		}));
		this._register(this._layoutService.onDidToggleSidePane(() => {
			try {
				this._captureExistingProfileIfApplicable();
			} finally {
				togglingSidePane = false;
			}
		}));
	}

	private _captureExistingProfileIfApplicable(): void {
		if (this._ctx.isRestoringSessionLayout || this._ctx.multipleSessionsVisibleObs.get()) {
			return;
		}
		const activeSession = this._sessionsService.activeSession.get();
		if (!activeSession || activeSession.isQuickChat?.get() || !activeSession.isCreated.get()
			|| this._layoutService.isEditorMaximized() || this._layoutService.isVisible(Parts.CUSTOM_VIEW_GRID_PART)) {
			return;
		}
		this._captureExistingProfile();
	}

	/** Seeds the Existing profile from the on-screen composition for an in-place lifecycle transition. */
	private _captureExistingProfile(): void {
		const state = {
			editorVisible: this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow),
			auxiliaryBarVisible: this._layoutService.isVisible(Parts.AUXILIARYBAR_PART),
		};
		this._visibilityStore.set(SessionVisibilityProfile.Existing, state);
	}

	private _apply(state: { readonly editorVisible: boolean; readonly auxiliaryBarVisible: boolean }): void {
		const suppression = this._layoutService.suppressEditorPartAutoVisibility();
		try {
			if (!state.editorVisible && this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
				this._layoutService.setPartHidden(true, Parts.EDITOR_PART);
			}
			if (!state.auxiliaryBarVisible && this._layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
				this._layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
			}
			if (state.auxiliaryBarVisible && !this._layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
				this._layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
			}
			if (state.editorVisible && !this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
				this._layoutService.setPartHidden(false, Parts.EDITOR_PART);
			}
		} finally {
			suppression.dispose();
		}
	}

	private _reveal(state: { readonly editorVisible: boolean; readonly auxiliaryBarVisible: boolean }): void {
		const suppression = this._layoutService.suppressEditorPartAutoVisibility();
		try {
			if (state.auxiliaryBarVisible && !this._layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
				this._layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
			}
			if (state.editorVisible && !this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
				this._layoutService.setPartHidden(false, Parts.EDITOR_PART);
			}
		} finally {
			suppression.dispose();
		}
	}

	// --- Detail panel ----------------------------------------------------------------------

	private _registerDetailPanel(): void {
		const activeEditorObs = observableFromEvent(this, this._editorService.onDidActiveEditorChange, () => this._editorService.activeEditor);
		const mainPartEmptyObs = observableFromEvent(this, Event.any(this._editorService.onDidActiveEditorChange, this._editorService.onDidEditorsChange, this._editorService.onDidCloseEditor), () => isMainPartEmpty(this._editorGroupsService));
		const editorPartVisibleObs = observableFromEvent(this, this._layoutService.onDidChangePartVisibility, () => this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow));
		const editorMaximizedObs = observableFromEvent(this, this._layoutService.onDidChangeEditorMaximized, () => this._layoutService.isEditorMaximized());
		let initialized = false;
		let wasExistingActive = false;
		let activeSessionKey: string | undefined;
		let pendingSessionKey: string | undefined;
		let pendingOutgoingEditor: EditorInput | undefined;
		let previousActiveEditor: EditorInput | undefined;
		let previousEditorPartVisible = false;
		let previousEditorSessionKey: string | undefined;
		let previousQuickChatResource: URI | undefined;

		const sync = (reader: IReader | undefined) => {
			const activeSession = this._sessionsService.activeSession.read(reader);
			const isQuickChat = activeSession?.isQuickChat?.read(reader) ?? false;
			const isWorkspaceConversion = !isQuickChat && !!activeSession && isEqual(previousQuickChatResource, activeSession.resource);
			if (!isWorkspaceConversion) {
				previousQuickChatResource = isQuickChat ? activeSession?.resource : undefined;
			}
			if (!activeSession
				|| isQuickChat
				|| !activeSession.workspace.read(reader)
				|| !activeSession.isCreated.read(reader)) {
				wasExistingActive = false;
				previousActiveEditor = undefined;
				previousEditorPartVisible = false;
				previousEditorSessionKey = undefined;
				return;
			}
			previousQuickChatResource = undefined;

			const sessionKey = activeSession.resource.toString();
			const sessionChanged = activeSessionKey !== undefined && activeSessionKey !== sessionKey;
			if (!wasExistingActive || sessionChanged) {
				activeSessionKey = sessionKey;
				wasExistingActive = true;
				if (initialized && !isWorkspaceConversion) {
					pendingSessionKey = sessionKey;
					pendingOutgoingEditor = this._editorService.activeEditor;
				}
				initialized = true;
			}
			if (isWorkspaceConversion) {
				pendingSessionKey = undefined;
				pendingOutgoingEditor = undefined;
				this._detailHiddenTransiently = false;
				this._detailHiddenByEditor = false;
			}

			const activeEditor = activeEditorObs.read(reader);
			const mainPartEmpty = mainPartEmptyObs.read(reader);
			const editorMaximized = editorMaximizedObs.read(reader);
			const editorPartVisible = editorPartVisibleObs.read(reader);
			if (pendingSessionKey && activeEditor && activeEditor !== pendingOutgoingEditor) {
				pendingSessionKey = undefined;
				pendingOutgoingEditor = undefined;
			}
			if (pendingSessionKey) {
				return;
			}

			const emptyFilesShown = activeEditor instanceof EmptyFileEditorInput
				&& editorPartVisible
				&& (activeEditor !== previousActiveEditor || !previousEditorPartVisible || sessionKey !== previousEditorSessionKey);
			previousActiveEditor = activeEditor;
			previousEditorPartVisible = editorPartVisible;
			previousEditorSessionKey = sessionKey;
			const target = this._computeTarget(activeEditor, mainPartEmpty, editorMaximized, editorPartVisible);
			const revealOnly = this._ctx.multipleSessionsVisibleObs.read(reader);
			if (!isWorkspaceConversion) {
				this._syncDetailVisibility(target, revealOnly, emptyFilesShown);
			}
			this._detailPanel.sync(target);
		};

		this._register(autorun(sync));
		this._register(this._ctx.onDidEndSessionLayoutRestore(() => {
			const activeSession = this._sessionsService.activeSession.get();
			if (!activeSession || activeSession.resource.toString() !== pendingSessionKey) {
				return;
			}
			pendingSessionKey = undefined;
			pendingOutgoingEditor = undefined;
			sync(undefined);
		}));
		this._register(this._layoutService.onDidChangePartVisibility(event => {
			if (event.partId === Parts.AUXILIARYBAR_PART && event.source !== 'resize') {
				this._detailHiddenTransiently = false;
				this._detailHiddenByEditor = false;
			}
		}));
	}

	private _syncDetailVisibility(target: DetailPanelTarget, revealOnly: boolean, emptyFilesShown: boolean): void {
		const detailVisible = this._layoutService.isVisible(Parts.AUXILIARYBAR_PART);
		if (emptyFilesShown && !detailVisible) {
			this._detailHiddenTransiently = false;
			this._detailHiddenByEditor = false;
			this._setDetailHiddenTransiently(false);
			return;
		}
		if (this._ctx.isRestoringSessionLayout || target === DetailPanelTarget.Preserve) {
			return;
		}

		if (target === DetailPanelTarget.Hidden || target === DetailPanelTarget.EditorHidden) {
			if ((target === DetailPanelTarget.EditorHidden || !revealOnly) && detailVisible) {
				this._detailHiddenTransiently = true;
				this._detailHiddenByEditor = target === DetailPanelTarget.EditorHidden;
				this._setDetailHiddenTransiently(true);
			}
			return;
		}

		if (!this._detailHiddenTransiently || (revealOnly && !this._detailHiddenByEditor) || !this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
			return;
		}
		this._detailHiddenTransiently = false;
		this._detailHiddenByEditor = false;
		this._setDetailHiddenTransiently(false);
	}

	private _setDetailHiddenTransiently(hidden: boolean): void {
		this._changingDetailTransiently = true;
		try {
			this._layoutService.setAuxiliaryBarHiddenForResize(hidden);
		} finally {
			this._changingDetailTransiently = false;
		}
	}

	private _computeTarget(activeEditor: EditorInput | undefined, mainPartEmpty: boolean, editorMaximized: boolean, editorPartVisible: boolean): DetailPanelTarget {
		if (mainPartEmpty) {
			return this._ctx.isRestoringSessionLayout ? DetailPanelTarget.Preserve : DetailPanelTarget.Hidden;
		}

		if (activeEditor && isEditorWithoutDockedDetails(activeEditor)) {
			return editorPartVisible ? DetailPanelTarget.EditorHidden : DetailPanelTarget.Changes;
		}

		if (editorMaximized) {
			return DetailPanelTarget.Changes;
		}

		if (!activeEditor) {
			return DetailPanelTarget.Changes;
		}

		if (isChangesEditorInput(activeEditor, this._sessionChangesService)) {
			return DetailPanelTarget.ChangesForced;
		}

		if (isFileEditorInput(activeEditor)) {
			return DetailPanelTarget.FilesForced;
		}

		return DetailPanelTarget.Preserve;
	}

	// --- Managed-tabs supplement (submit "activate Changes" nuance) ------------------------

	private _registerManagedTabsSupplement(): void {
		let previousSessionKey: string | undefined;
		let previousIsCreated: boolean | undefined;
		let previousSession: IActiveSession | undefined;
		let changesActivationPendingForSession: string | undefined;

		this._register(autorun(reader => {
			const session = this._sessionsService.activeSession.read(reader);
			const isQuickChat = session?.isQuickChat?.read(reader) ?? false;
			const isCreated = session && !isQuickChat ? session.isCreated.read(reader) : false;
			const sessionKey = session?.resource.toString();

			const isSubmit = !isQuickChat && previousIsCreated === false && isCreated
				&& (previousSession === session || previousSession?.isCreated.read(undefined) === true);
			if (isSubmit) {
				changesActivationPendingForSession = sessionKey;
			} else if (sessionKey !== previousSessionKey) {
				changesActivationPendingForSession = undefined;
			}

			if (session && !isQuickChat && isCreated) {
				const target = this.managedTabs.readTarget(reader);
				const hasChanges = (session.changes.read(reader).length ?? 0) > 0;
				const ensureChangesActive = changesActivationPendingForSession === sessionKey && hasChanges;
				if (ensureChangesActive) {
					changesActivationPendingForSession = undefined;
				}
				if (isSubmit || ensureChangesActive) {
					this.managedTabs.queueReconcile(target, { openDefaultsIfEmpty: isSubmit, ensureChangesActive });
				}
			}

			previousIsCreated = session && !isQuickChat ? isCreated : undefined;
			previousSession = session;
			previousSessionKey = sessionKey;
		}));
	}

	private _registerToggleDetailsAction(): IDisposable {
		const that = this;
		return registerAction2(class extends Action2 {
			constructor() {
				super({
					id: TOGGLE_DETAILS_COMMAND_ID,
					title: localize2('toggleDetails', "Toggle Details"),
					icon: Codicon.listSelection,
					f1: false,
					toggled: AuxiliaryBarVisibleContext,
					keybinding: {
						weight: KeybindingWeight.SessionsContrib,
						primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyL,
						when: ContextKeyExpr.and(
							IsSessionsWindowContext,
							IsAuxiliaryWindowContext.toNegated(),
							SinglePaneLayoutEnabledContext)
					},
					menu: {
						id: MenuId.EditorTitleLayout,
						group: 'navigation',
						order: singlePaneHeaderToggleDetailsOrder,
						// Not every tab type has a detail panel to show/hide (e.g. browser and
						// search tabs), so only surface the toggle for tab types that do.
						when: ContextKeyExpr.and(
							IsSessionsWindowContext,
							IsAuxiliaryWindowContext.toNegated(),
							IsTopRightEditorGroupContext,
							SinglePaneLayoutEnabledContext,
							MainEditorAreaVisibleContext,
							HasDockedDetailsContext)
					}
				});
			}

			run(): void {
				that.toggleDetails();
			}
		});
	}
}
