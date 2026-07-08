/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../../base/browser/window.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Event } from '../../../../../base/common/event.js';
import { Schemas } from '../../../../../base/common/network.js';
import { autorun, IReader, observableFromEvent, observableSignalFromEvent } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { EditorActivation, IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../../../workbench/common/editor.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { SinglePaneChangesTabMissingContext, SinglePaneFilesTabMissingContext } from '../../../../common/contextkeys.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionChangesService } from '../../../changes/browser/sessionChangesService.js';
import { IChangesViewService } from '../../../changes/common/changesViewService.js';
import { EmptyFileEditorInput } from '../../../editor/browser/emptyFileEditorInput.js';
import { ISinglePaneLayoutContext, SinglePaneDockedTabsCoordinator, SinglePaneLayoutStrategy } from './singlePaneLayoutStrategy.js';

const changesEditorOptions: IEditorOptions = {
	pinned: true,
	index: 0,
	inactive: true,
	preserveFocus: true,
	activation: EditorActivation.PRESERVE,
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

interface IManagedFilesTabState {
	readonly placeholder: EmptyFileEditorInput | undefined;
	readonly shouldShow: boolean;
}

/**
 * Owns the two managed docked tabs — the pinned Changes multi-diff tab and the
 * empty Files placeholder tab — keeping them in sync with the active session's
 * changes. Auto-managed but user-closable: a user close is remembered so the
 * sync does not immediately re-create the tab.
 */
export class SinglePaneManagedTabsStrategy extends SinglePaneLayoutStrategy {

	/** Managed tab kinds the user explicitly closed; not re-ensured until the session changes or the side pane is reopened. */
	private readonly _dismissedManagedTabs = new Set<'changes' | 'files'>();
	private _lastSyncedSessionKey: string | undefined;
	private _sidePaneWasVisible = false;
	private _tabSyncGeneration = 0;
	/** True when the session supports a Changes editor but its tab is not currently open (drives the `+` "Changes" entry). */
	private _changesTabMissingContext: IContextKey<boolean> | undefined;
	/** True when the session supports a Files tab but its tab is not currently open (drives the `+` "Files" entry). */
	private _filesTabMissingContext: IContextKey<boolean> | undefined;

	constructor(
		ctx: ISinglePaneLayoutContext,
		private readonly _coordinator: SinglePaneDockedTabsCoordinator,
		@IAgentWorkbenchLayoutService private readonly _layoutService: IAgentWorkbenchLayoutService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@IEditorService private readonly _editorService: IEditorService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@ISessionChangesService private readonly _sessionChangesService: ISessionChangesService,
		@IChangesViewService private readonly _changesViewService: IChangesViewService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super(ctx);

		this._changesTabMissingContext = SinglePaneChangesTabMissingContext.bindTo(this._contextKeyService);
		this._filesTabMissingContext = SinglePaneFilesTabMissingContext.bindTo(this._contextKeyService);

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
			void this._coordinator.sequencer.queue(() => this._syncManagedTabs(targetState, generation)).catch(onUnexpectedError);
		}));

		// A user-initiated close of a managed tab is remembered so the sync does not
		// immediately re-create it.
		this._register(this._editorService.onDidCloseEditor(e => this._handleManagedTabClosed(e.editor)));
	}

	/** Queue work on the shared docked-tab sequencer (used by the editor-area collapse strategy). */
	queue<T>(work: () => Promise<T>): Promise<T> {
		return this._coordinator.sequencer.queue(work);
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
		if (sessionKey !== this._lastSyncedSessionKey) {
			// A new session has its own editors; drop any tabs captured while the
			// previous session's editor area was hidden so they are not reopened here.
			this._coordinator.collapsedEditors = undefined;
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
			} else if (this._dismissedManagedTabs.has('changes') && changesResource && this._findChangesEditor(group, changesResource)) {
				// The Changes tab was reopened (e.g. via the `+` "Changes" entry)
				// after a user dismissal; resume managing it.
				this._dismissedManagedTabs.delete('changes');
			}

			if (generation !== this._tabSyncGeneration || !state.ensureFileTab) {
				return;
			}

			const filesTabState = this._getManagedFilesTabState(group);
			if (!filesTabState.shouldShow) {
				await this._removeDefaultFileTab(group, filesTabState.placeholder);
			} else if (!this._dismissedManagedTabs.has('files')) {
				await this._ensureDefaultFileTab(group);
			}
		} finally {
			suppressEditorPartAutoVisibility.dispose();
			// Recompute the `+` add-tab contexts against the final group state, so
			// they reflect the ensured/closed tabs rather than the pre-sync state.
			if (generation === this._tabSyncGeneration) {
				this._updateAddTabContexts(state);
			}
		}
	}

	private _getManagedFilesTabState(group: IEditorGroup): IManagedFilesTabState {
		const placeholder = group.editors.find((editor): editor is EmptyFileEditorInput => editor instanceof EmptyFileEditorInput);
		const editorVisible = this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow);
		// Only a workspace file collapses the Files placeholder; other editors
		// (e.g. the integrated browser) keep it shown.
		const hasWorkspaceFile = group.editors.some(editor => this._isWorkspaceFileEditor(editor));
		return { placeholder, shouldShow: !editorVisible || !hasWorkspaceFile };
	}

	/** Whether the editor shows a workspace file (a file-system resource), excluding managed placeholders. */
	private _isWorkspaceFileEditor(editor: EditorInput): boolean {
		if (this._coordinator.isManagedEditor(editor)) {
			return false;
		}
		const resource = EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY });
		return resource?.scheme === Schemas.file || resource?.scheme === Schemas.vscodeRemote;
	}

	private async _removeDefaultFileTab(group: IEditorGroup, editor: EmptyFileEditorInput | undefined): Promise<void> {
		if (!editor) {
			return;
		}

		this._coordinator.internallyClosingEditors.add(editor);
		try {
			await this._editorService.closeEditors([{ groupId: group.id, editor }], { preserveFocus: true });
		} finally {
			this._coordinator.internallyClosingEditors.delete(editor);
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
			const resource = this._coordinator.getChangesEditorResource(editor);
			return resource && (!activeChangesResource || !isEqual(resource, activeChangesResource));
		});

		if (editorsToClose.length > 0) {
			editorsToClose.forEach(editor => this._coordinator.internallyClosingEditors.add(editor));
			try {
				await this._editorService.closeEditors(editorsToClose.map(editor => ({ groupId: group.id, editor })), { preserveFocus: true });
			} finally {
				editorsToClose.forEach(editor => this._coordinator.internallyClosingEditors.delete(editor));
			}
		}
	}

	private _findChangesEditor(group: IEditorGroup, changesResource: URI): EditorInput | undefined {
		return group.editors.find(editor => {
			const resource = this._coordinator.getChangesEditorResource(editor);
			return !!resource && isEqual(resource, changesResource);
		});
	}

	private _ensureFirst(group: IEditorGroup, editor: EditorInput): void {
		if (!group.isPinned(editor)) {
			group.pinEditor(editor);
		}

		if (group.getIndexOfEditor(editor) !== 0) {
			group.moveEditor(editor, group, changesEditorOptions);
		}
	}

	/** Offer the `+` "Changes"/"Files" entries when the session supports them but their tabs are closed. */
	private _updateAddTabContexts(state: IManagedTabTargetState): void {
		const group = this._editorGroupsService.mainPart.activeGroup;
		const changesPresent = group.editors.some(editor => this._coordinator.getChangesEditorResource(editor) !== undefined);
		this._changesTabMissingContext?.set(!!state.changesSessionResource && !changesPresent);
		const filesPresent = group.editors.some(editor => editor instanceof EmptyFileEditorInput);
		this._filesTabMissingContext?.set(state.ensureFileTab && !filesPresent);
	}

	private _handleManagedTabClosed(editor: EditorInput): void {
		// Ignore layout-driven closes (working-set apply on session switch): only a
		// genuine user close should dismiss a managed tab. The controller's own
		// reconciliation closes are tracked via `internallyClosingEditors`.
		if (this._coordinator.internallyClosingEditors.has(editor) || this._ctx.isRestoringSessionLayout) {
			return;
		}
		if (editor instanceof EmptyFileEditorInput) {
			this._dismissedManagedTabs.add('files');
		} else if (this._coordinator.getChangesEditorResource(editor) !== undefined) {
			this._dismissedManagedTabs.add('changes');
		}
	}
}
