/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../base/browser/window.js';
import { Sequencer } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable, IReader, observableFromEvent, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { isEqual, isEqualOrParent } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { EditorActivation, IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { ContextKeyExpr, IContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { EditorInput } from '../../../../workbench/common/editor/editorInput.js';
import { AuxiliaryBarVisibleContext, IsAuxiliaryWindowContext, IsSessionsWindowContext, IsTopRightEditorGroupContext, MainEditorAreaVisibleContext } from '../../../../workbench/common/contextkeys.js';
import { BrowserEditorInput } from '../../../../workbench/contrib/browserView/common/browserEditorInput.js';
import { FileEditorInput } from '../../../../workbench/contrib/files/browser/editors/fileEditorInput.js';
import { IEditorGroup } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { LifecyclePhase } from '../../../../workbench/services/lifecycle/common/lifecycle.js';
import { SinglePaneDetailChangesOrFilesActiveContext } from '../../../common/contextkeys.js';
import { DOCK_DETAIL_PANEL_SETTING } from '../../../common/sessionConfig.js';
import type { ISessionWorkspace } from '../../../services/sessions/common/session.js';
import { CHANGES_VIEW_CONTAINER_ID } from '../../changes/common/changes.js';
import { EmptyFileEditorInput } from '../../editor/browser/emptyFileEditorInput.js';
import { SESSIONS_FILES_CONTAINER_ID } from '../../files/browser/files.contribution.js';
import { LayoutController } from './desktopSessionLayoutController.js';

/** Command that toggles the single-pane detail panel (auxiliary bar) from the editor title bar. */
export const TOGGLE_DETAILS_COMMAND_ID = 'workbench.action.agentSessions.toggleDetails';
const singlePaneEditorTitleDetailsOrder = 1000001;

const changesEditorOptions: IEditorOptions = {
	pinned: true,
	index: 0,
	preserveFocus: true,
	isExplicit: false,
};

const fileTabOptions: IEditorOptions = {
	pinned: true,
	inactive: true,
	preserveFocus: true,
	activation: EditorActivation.PRESERVE,
	isExplicit: false,
};

interface IManagedTabTargetState {
	changesSessionResource: URI | undefined;
	ensureFileTab: boolean;
}

const enum DetailPanelTarget {
	Hidden,
	BrowserHidden,
	Changes,
	ChangesForced,
	Files,
	FilesForced,
	Preserve
}

/**
 * Dedicated controller for the single-pane detail-panel layout. In addition to
 * the base layout rules it owns the two single-pane-specific behaviours directly
 * (rather than through separate controllers or a shared service):
 *  - managed docked tabs: the pinned Changes multi-diff tab and the empty Files
 *    placeholder tab, kept in sync with the active session's changes;
 *  - detail panel mapping: mapping the active editor to its detail container
 *    (Changes / Files) and revealing/hiding the auxiliary bar accordingly.
 *
 * Because both live on this controller they coordinate through it: a
 * session-switch restore is signalled by {@link _isRestoringSessionLayout}, so a
 * restore-driven editor change is never mistaken for a user action.
 */
export class SinglePaneDesktopSessionLayoutController extends LayoutController {

	// --- Managed tabs state ---
	private readonly _tabSyncSequencer = new Sequencer();
	private _tabSyncGeneration = 0;
	/** Managed tab kinds the user explicitly closed; not re-ensured until the session changes or the side pane is reopened. */
	private readonly _dismissedManagedTabs = new Set<'changes' | 'files'>();
	/** Editors the controller itself is closing, so their close is not mistaken for a user dismissal. */
	private readonly _internallyClosingEditors = new Set<EditorInput>();
	private _lastSyncedSessionKey: string | undefined;
	private _sidePaneWasVisible = false;

	// --- Detail panel state ---
	private _changesOrFilesActiveContext: IContextKey<boolean> | undefined;
	private readonly _detailSequencer = new Sequencer();
	private _detailGeneration = 0;
	private _hiddenByBrowser = false;

	/** Single-pane maps the active editor to its container (detail panel) instead of D8 auto-reveal. */
	protected override _registerChangesAutoReveal(): void { }

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
	 * Registers the single-pane managed-tab and detail-panel behaviours once
	 * editors are restored, so the managed tabs are reconciled on top of the
	 * restored group rather than racing it.
	 */
	protected override _registerAuxiliaryControllers(): void {
		this._lifecycleService.when(LifecyclePhase.Restored).then(() => {
			if (this._store.isDisposed) {
				return;
			}
			this._registerManagedTabs();
			this._registerDetailPanel();
		});
	}

	// --- Managed docked tabs (Changes + Files placeholder) ---

	private _registerManagedTabs(): void {
		// Re-sync the managed tabs when the session state changes, and also when the
		// side pane (editor part or aux bar) visibility or the group's editors
		// change. Tracking the aux bar too is essential: reopening the side pane in
		// the new-session view only reveals the aux bar (the editor part stays
		// hidden by R1), so without it the managed Files tab would never be
		// re-ensured after the side pane was closed.
		const sidePaneVisibleObs = observableFromEvent(this, this._layoutService.onDidChangePartVisibility,
			() => this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow) || this._layoutService.isVisible(Parts.AUXILIARYBAR_PART));
		const editorsChangedSignal = observableSignalFromEvent(this, Event.any(this._editorService.onDidActiveEditorChange, this._editorService.onDidEditorsChange));

		this._register(autorun(reader => {
			const targetState = this._readManagedTabTargetState(reader);
			sidePaneVisibleObs.read(reader);
			editorsChangedSignal.read(reader);
			const generation = ++this._tabSyncGeneration;
			void this._tabSyncSequencer.queue(() => this._syncManagedTabs(targetState, generation)).catch(onUnexpectedError);
		}));

		// A user-initiated close of a managed tab is remembered so the sync does not
		// immediately re-create it.
		this._register(this._editorService.onDidCloseEditor(e => this._handleManagedTabClosed(e.editor)));
	}

	private _handleManagedTabClosed(editor: EditorInput): void {
		// Ignore layout-driven closes (working-set apply on session switch): only a
		// genuine user close should dismiss a managed tab. The controller's own
		// reconciliation closes are tracked via `_internallyClosingEditors`.
		if (this._internallyClosingEditors.has(editor) || this._isRestoringSessionLayout) {
			return;
		}
		if (editor instanceof EmptyFileEditorInput) {
			this._dismissedManagedTabs.add('files');
		} else if (this._getChangesEditorResource(editor) !== undefined) {
			this._dismissedManagedTabs.add('changes');
		}
	}

	private _readManagedTabTargetState(reader: IReader): IManagedTabTargetState {
		const session = this._sessionsService.activeSession.read(reader);
		if (!session) {
			return { changesSessionResource: undefined, ensureFileTab: false };
		}

		const isCreated = session.isCreated.read(reader);
		const isQuickChat = session.isQuickChat?.read(reader) ?? false;
		const workspace = session.workspace.read(reader);
		if (isQuickChat || !workspace) {
			return { changesSessionResource: undefined, ensureFileTab: false };
		}

		return { changesSessionResource: isCreated ? session.resource : undefined, ensureFileTab: true };
	}

	private async _syncManagedTabs(state: IManagedTabTargetState, generation: number): Promise<void> {
		if (generation !== this._tabSyncGeneration) {
			return;
		}

		// Clear user-dismissed managed tabs on a session change or when the side
		// pane is reopened from fully closed, so the tabs re-populate then while an
		// in-session close stays respected.
		const sessionKey = this._sessionsService.activeSession.get()?.resource.toString();
		const sidePaneVisible = this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow) || this._layoutService.isVisible(Parts.AUXILIARYBAR_PART);
		if (sessionKey !== this._lastSyncedSessionKey || (sidePaneVisible && !this._sidePaneWasVisible)) {
			this._dismissedManagedTabs.clear();
		}
		this._lastSyncedSessionKey = sessionKey;
		this._sidePaneWasVisible = sidePaneVisible;

		const group = this._editorGroupsService.mainPart.activeGroup;
		const changesResource = state.changesSessionResource ? this._sessionChangesService.getChangesEditorResource(state.changesSessionResource) : undefined;

		// Reconciling the managed tabs can transiently empty the group (e.g.
		// closing a stale Changes tab before the Files tab is ensured, or before
		// the workspace resolves on reload). Suppress editor-part auto-visibility
		// across the whole reconciliation so a transient empty group is never
		// mistaken for the user closing all tabs (which would close the side pane).
		const suppressEditorPartAutoVisibility = this._layoutService.suppressEditorPartAutoVisibility();
		try {
			await this._closeInactiveChangesEditors(group, changesResource);
			if (generation !== this._tabSyncGeneration) {
				return;
			}

			if (state.changesSessionResource && changesResource && !this._dismissedManagedTabs.has('changes')) {
				this._changesViewService.setChangesetId(undefined);

				let changesEditor = this._findChangesEditor(group, changesResource);
				if (!changesEditor) {
					await this._sessionChangesService.openChangesEditor(state.changesSessionResource, changesEditorOptions, group);
					if (generation !== this._tabSyncGeneration) {
						return;
					}
					changesEditor = this._findChangesEditor(group, changesResource);
				}

				if (changesEditor) {
					this._ensureFirst(group, changesEditor);
				}
			}

			if (generation !== this._tabSyncGeneration || !state.ensureFileTab) {
				return;
			}

			// The managed Files tab is only removed when the user explicitly closes
			// it (tracked via `_dismissedManagedTabs`); it is never auto-removed
			// based on editor-area visibility, which caused a transient removal on
			// reload that emptied the group and closed the whole side pane.
			if (this._dismissedManagedTabs.has('files') && group.editors.some(editor => editor instanceof EmptyFileEditorInput)) {
				this._dismissedManagedTabs.delete('files');
			}

			if (!this._dismissedManagedTabs.has('files')) {
				await this._ensureDefaultFileTab(group);
			}
		} finally {
			suppressEditorPartAutoVisibility.dispose();
		}
	}

	private async _ensureDefaultFileTab(group: IEditorGroup): Promise<void> {
		if (group.editors.some(editor => editor instanceof EmptyFileEditorInput)) {
			return;
		}

		const suppressEditorPartAutoVisibility = this._layoutService.suppressEditorPartAutoVisibility();
		try {
			await this._editorService.openEditor(this._instantiationService.createInstance(EmptyFileEditorInput), fileTabOptions, group);
		} finally {
			suppressEditorPartAutoVisibility.dispose();
		}
	}

	private async _closeInactiveChangesEditors(group: IEditorGroup, activeChangesResource: URI | undefined): Promise<void> {
		const editorsToClose = group.editors.filter(editor => {
			const resource = this._getChangesEditorResource(editor);
			return resource && (!activeChangesResource || !isEqual(resource, activeChangesResource));
		});

		if (editorsToClose.length > 0) {
			editorsToClose.forEach(editor => this._internallyClosingEditors.add(editor));
			try {
				await this._editorService.closeEditors(editorsToClose.map(editor => ({ groupId: group.id, editor })), { preserveFocus: true });
			} finally {
				editorsToClose.forEach(editor => this._internallyClosingEditors.delete(editor));
			}
		}
	}

	private _findChangesEditor(group: IEditorGroup, changesResource: URI): EditorInput | undefined {
		return group.editors.find(editor => {
			const resource = this._getChangesEditorResource(editor);
			return !!resource && isEqual(resource, changesResource);
		});
	}

	private _getChangesEditorResource(editor: EditorInput): URI | undefined {
		const resource = editor.resource;
		return resource && this._sessionChangesService.getSessionResource(resource) ? resource : undefined;
	}

	private _ensureFirst(group: IEditorGroup, editor: EditorInput): void {
		if (!group.isPinned(editor)) {
			group.pinEditor(editor);
		}

		if (group.getIndexOfEditor(editor) !== 0) {
			group.moveEditor(editor, group, changesEditorOptions);
		}
	}

	// --- Detail panel (active editor -> detail container) ---

	private _registerDetailPanel(): void {
		this._changesOrFilesActiveContext = SinglePaneDetailChangesOrFilesActiveContext.bindTo(this._contextKeyService);
		const activeEditorObs = observableFromEvent(this, this._editorService.onDidActiveEditorChange, () => this._editorService.activeEditor);
		const mainPartEmptyObs = observableFromEvent(this, Event.any(this._editorService.onDidActiveEditorChange, this._editorService.onDidEditorsChange, this._editorService.onDidCloseEditor), () => this._isMainPartEmpty());
		const auxBarVisibleObs = observableFromEvent(this, this._layoutService.onDidChangePartVisibility, () => this._layoutService.isVisible(Parts.AUXILIARYBAR_PART));
		const editorMaximizedObs = observableFromEvent(this, this._layoutService.onDidChangeEditorMaximized, () => this._layoutService.isEditorMaximized());

		this._register(autorun(reader => {
			const activeEditor = activeEditorObs.read(reader);
			const target = this._computeDetailTarget(reader, activeEditor, mainPartEmptyObs, editorMaximizedObs);
			const isChangesOrFilesTarget = target === DetailPanelTarget.Changes || target === DetailPanelTarget.ChangesForced || target === DetailPanelTarget.Files || target === DetailPanelTarget.FilesForced;
			this._changesOrFilesActiveContext!.set(isChangesOrFilesTarget);
			const auxBarVisible = auxBarVisibleObs.read(reader);
			const generation = ++this._detailGeneration;
			void this._detailSequencer.queue(() => this._syncDetailTarget(target, auxBarVisible, generation)).catch(onUnexpectedError);
		}));
	}

	private _computeDetailTarget(reader: IReader, activeEditor: EditorInput | undefined, mainPartEmptyObs: IObservable<boolean>, editorMaximizedObs: IObservable<boolean>): DetailPanelTarget {
		const activeSession = this._sessionsService.activeSession.read(reader);
		const isQuickChat = activeSession?.isQuickChat?.read(reader) ?? false;
		const workspace = activeSession?.workspace.read(reader);
		if (isQuickChat || !workspace) {
			return DetailPanelTarget.Hidden;
		}

		// For a created session an empty editor group means the whole side pane was
		// closed, so hide the detail. In the new-session (uncreated) view the Files
		// detail is open by default and owned by the layout controller (D3b); its
		// editor group is transiently empty while the Files tab is (re)ensured, so
		// don't hide the detail here — that transient hide would otherwise be
		// captured (D2) as the new-session preference and stick across cmd+n.
		if (mainPartEmptyObs.read(reader) && (activeSession?.isCreated.read(reader) ?? true)) {
			return DetailPanelTarget.Hidden;
		}

		if (editorMaximizedObs.read(reader)) {
			return DetailPanelTarget.Changes;
		}

		if (!activeEditor) {
			return activeSession?.isCreated.read(reader) ? DetailPanelTarget.Changes : DetailPanelTarget.Files;
		}

		if (activeEditor instanceof BrowserEditorInput) {
			return DetailPanelTarget.BrowserHidden;
		}

		if (this._isChangesEditor(activeEditor)) {
			return DetailPanelTarget.ChangesForced;
		}

		if (this._isFileEditor(activeEditor, workspace)) {
			return DetailPanelTarget.FilesForced;
		}

		return DetailPanelTarget.Preserve;
	}

	private _isMainPartEmpty(): boolean {
		for (const group of this._editorGroupsService.mainPart.groups) {
			if (!group.isEmpty) {
				return false;
			}
		}
		return true;
	}

	private async _syncDetailTarget(target: DetailPanelTarget, auxBarVisible: boolean, generation: number): Promise<void> {
		if (generation !== this._detailGeneration) {
			return;
		}

		switch (target) {
			case DetailPanelTarget.Hidden:
				if (this._layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
					this._layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
				}
				this._hiddenByBrowser = false;
				return;
			case DetailPanelTarget.BrowserHidden:
				if (this._layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
					this._layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
				}
				this._hiddenByBrowser = true;
				return;
			case DetailPanelTarget.Changes:
				if (!auxBarVisible && this._hiddenByBrowser) {
					this._layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
					auxBarVisible = true;
				}
				// Only switch the active container while the detail panel is visible so the
				// user can hide it; toggling it back on then shows the contextual container.
				if (!auxBarVisible) {
					return;
				}
				await this._viewsService.openViewContainer(CHANGES_VIEW_CONTAINER_ID, false);
				this._hiddenByBrowser = false;
				return;
			case DetailPanelTarget.ChangesForced:
				await this._syncForcedDetailTarget(CHANGES_VIEW_CONTAINER_ID, auxBarVisible);
				return;
			case DetailPanelTarget.Files:
				if (!auxBarVisible && this._hiddenByBrowser) {
					this._layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
					auxBarVisible = true;
				}
				if (!auxBarVisible) {
					return;
				}
				await this._viewsService.openViewContainer(SESSIONS_FILES_CONTAINER_ID, false);
				this._hiddenByBrowser = false;
				return;
			case DetailPanelTarget.FilesForced:
				await this._syncForcedDetailTarget(SESSIONS_FILES_CONTAINER_ID, auxBarVisible);
				return;
			case DetailPanelTarget.Preserve:
				this._hiddenByBrowser = false;
				return;
		}
	}

	private async _syncForcedDetailTarget(viewContainerId: string, auxBarVisible: boolean): Promise<void> {
		if (!auxBarVisible) {
			// The detail panel is hidden. A created session defaults to the Changes
			// editor with the detail closed, and an explicit / per-session hide is
			// respected — so a Changes/file editor becoming active never
			// force-reveals the detail. The one exception is restoring the detail
			// after a *transient* browser-tab hide (`_hiddenByBrowser`). Never reveal
			// while the whole side pane is closed (the editor content is also hidden)
			// or during a session-switch layout restore.
			if (!this._hiddenByBrowser
				|| !this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)
				|| this._isRestoringSessionLayout) {
				return;
			}
			this._layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
		}
		await this._viewsService.openViewContainer(viewContainerId, false);
		this._hiddenByBrowser = false;
	}

	private _isChangesEditor(editor: EditorInput): boolean {
		const resource = editor.resource;
		return !!resource && this._sessionChangesService.getSessionResource(resource) !== undefined;
	}

	private _isFileEditor(editor: EditorInput, workspace: ISessionWorkspace): boolean {
		if (editor instanceof EmptyFileEditorInput) {
			return true;
		}
		const resource = editor instanceof FileEditorInput ? editor.resource : undefined;
		return !!resource && workspace.folders.some(folder =>
			isEqualOrParent(resource, folder.root) || isEqualOrParent(resource, folder.workingDirectory));
	}

	// --- [D7 single-pane] Responsive sessions-list auto-hide ---

	/**
	 * [D7 single-pane] Auto-hide the sessions list when the user needs more room
	 * for the side pane: opening the details pane via the Toggle Details action,
	 * or opening a real file/diff into the editor area (Scenario 8). The list is
	 * restored when details is explicitly closed. Unlike the base responsive rule
	 * this is not window-size driven and never reacts to automatic details opens
	 * (submit, session restore).
	 */
	protected override _registerResponsiveSidebar(): void {
		// The Toggle Details action toggles the detail panel and, as part of the
		// same gesture, auto-hides / restores the sessions list. It is a dedicated
		// command owned by this controller rather than a listener on the core
		// aux-bar toggle command.
		this._register(this._registerToggleDetailsAction());

		// [Scenario 8] Opening a real file/browser editor from the Files or Changes
		// view needs editor-area room, so auto-hide the sessions list — but only in
		// an existing (created) session and only when the editor area is currently
		// closed (this open will reveal it). Managed tabs (the Changes multi-diff
		// and the empty Files placeholder) are not FileEditorInput/BrowserEditorInput
		// so they never trigger this; a session-switch restore is excluded too.
		this._register(this._editorService.onWillOpenEditor(e => {
			if (this._isRestoringSessionLayout || this.multipleSessionsVisibleObs.get() || this._layoutService.isEditorMaximized()) {
				return;
			}
			const activeSession = this._sessionsService.activeSession.get();
			if (!activeSession?.isCreated.get() || this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
				return;
			}
			if (!(e.editor instanceof FileEditorInput || e.editor instanceof BrowserEditorInput)) {
				return;
			}
			if (this._setSidebarAutoHidden(true)) {
				this._sidebarAutoHidden = true;
			}
		}));

		// A manual sessions-sidebar toggle hands control back to the user.
		this._register(this._layoutService.onDidChangePartVisibility(e => {
			if (e.partId !== Parts.SIDEBAR_PART || this._applyingAutoSidebar) {
				return;
			}
			this._sidebarAutoHidden = false;
		}));
	}

	/**
	 * Toggle the detail panel (auxiliary bar) and, in the same gesture, auto-hide
	 * the sessions list to free room when opening it (restoring the list when
	 * closing). Returns whether the detail panel is now visible.
	 */
	toggleDetails(): boolean {
		const nowVisible = !this._layoutService.isVisible(Parts.AUXILIARYBAR_PART);
		this._layoutService.setPartHidden(!nowVisible, Parts.AUXILIARYBAR_PART);

		if (!this.multipleSessionsVisibleObs.get()) {
			if (nowVisible) {
				if (this._setSidebarAutoHidden(true)) {
					this._sidebarAutoHidden = true;
				}
			} else if (this._sidebarAutoHidden) {
				this._setSidebarAutoHidden(false);
				this._sidebarAutoHidden = false;
			}
		}
		return nowVisible;
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
					menu: {
						id: MenuId.EditorTitle,
						group: 'navigation',
						order: singlePaneEditorTitleDetailsOrder,
						when: ContextKeyExpr.and(
							IsSessionsWindowContext,
							IsAuxiliaryWindowContext.toNegated(),
							IsTopRightEditorGroupContext,
							ContextKeyExpr.equals(`config.${DOCK_DETAIL_PANEL_SETTING}`, true),
							MainEditorAreaVisibleContext)
					}
				});
			}

			run(): void {
				that.toggleDetails();
			}
		});
	}

	// --- [R1] Keep the editor content closed in the new-session view ---

	/**
	 * [R1] Keep the editor content closed by default in the new-session view. Hides
	 * the editor when it is revealed (or when the view is entered with the editor
	 * visible) from a non-explicit source with no real content. Explicit reveals
	 * (opening a file, toggling details off) are recorded by the workbench and
	 * stick; automatic reveals (working-set restore, layout races, an
	 * inherited-visible editor from a previous session) are re-hidden. Switching to
	 * a managed tab (e.g. the Files placeholder) while the editor is *already*
	 * visible does not hide it — only a visibility transition or entering the view
	 * does.
	 */
	protected override _registerNewSessionRules(): void {
		const editorMaximizedObs = observableFromEvent(this,
			this._layoutService.onDidChangeEditorMaximized,
			() => this._layoutService.isEditorMaximized());
		const editorVisibleObs = observableFromEvent(this,
			this._layoutService.onDidChangePartVisibility,
			() => this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow));
		const activeEditorObs = observableFromEvent(this,
			this._editorService.onDidActiveEditorChange,
			() => this._editorService.activeEditor);

		let previousEditorVisible = false;
		let previousInNewSessionView = false;
		this._register(autorun(reader => {
			const activeSession = this._sessionsService.activeSession.read(reader);
			const inNewSessionView = !!activeSession
				&& !this.multipleSessionsVisibleObs.read(reader)
				&& !editorMaximizedObs.read(reader)
				&& !activeSession.isCreated.read(reader)
				&& activeSession.isQuickChat?.read(reader) !== true
				&& activeSession.workspace.read(reader)?.folders?.[0]?.root !== undefined;

			// A real user-opened editor: an actual file or the integrated browser.
			// The managed empty landing tab (EmptyFileEditorInput) and "no active
			// editor" are not real content, so the editor content stays hidden.
			const activeEditor = activeEditorObs.read(reader);
			const hasRealContent = activeEditor instanceof FileEditorInput || activeEditor instanceof BrowserEditorInput;

			const editorVisible = editorVisibleObs.read(reader);
			// Hide only when the editor just *became* visible, or when the
			// new-session view was just entered with the editor already visible
			// (an inherited-visible editor from the previous session). Switching to
			// a managed tab while the editor is already visible must not hide it.
			const editorJustRevealed = editorVisible && !previousEditorVisible;
			const justEnteredNewSessionView = inNewSessionView && !previousInNewSessionView;
			previousEditorVisible = editorVisible;
			previousInNewSessionView = inNewSessionView;

			if (!inNewSessionView || hasRealContent || !editorVisible) {
				return;
			}

			// Re-hide the editor from a non-explicit reveal. Entering the new-session
			// view always resets to editor-closed (a stale explicit reveal from a
			// previous session must not carry over). An in-session reveal is re-hidden
			// only when it was automatic — an explicit reveal (opening a file,
			// toggling details off, which reveals the empty editor so the side pane
			// does not vanish) is respected.
			const shouldHide = justEnteredNewSessionView || (editorJustRevealed && !this._layoutService.isEditorRevealedExplicitly());
			if (shouldHide) {
				const suppressEditorPartAutoVisibility = this._layoutService.suppressEditorPartAutoVisibility();
				try {
					this._layoutService.setPartHidden(true, Parts.EDITOR_PART);
				} finally {
					suppressEditorPartAutoVisibility.dispose();
				}
			}
		}));
	}
}
