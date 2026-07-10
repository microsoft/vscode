/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../../base/browser/window.js';
import { Sequencer } from '../../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Event } from '../../../../../base/common/event.js';
import { autorun, IObservable, IReader, observableFromEvent } from '../../../../../base/common/observable.js';
import { isEqualOrParent } from '../../../../../base/common/resources.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { BrowserEditorInput } from '../../../../../workbench/contrib/browserView/common/browserEditorInput.js';
import { FileEditorInput } from '../../../../../workbench/contrib/files/browser/editors/fileEditorInput.js';
import { IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { SinglePaneDetailChangesOrFilesActiveContext } from '../../../../common/contextkeys.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import type { ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { CHANGES_VIEW_CONTAINER_ID } from '../../../changes/common/changes.js';
import { ISessionChangesService } from '../../../changes/browser/sessionChangesService.js';
import { EmptyFileEditorInput } from '../../../editor/browser/emptyFileEditorInput.js';
import { SESSIONS_FILES_CONTAINER_ID } from '../../../files/browser/files.contribution.js';
import { ISinglePaneLayoutContext, SinglePaneLayoutStrategy } from './singlePaneLayoutStrategy.js';

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
 * Maps the active editor to its detail container (Changes / Files) and
 * reveals/hides the auxiliary bar accordingly. A created single-pane session
 * defaults to the Changes editor with the detail closed; a Changes/file editor
 * becoming active never force-reveals a hidden detail (except restoring it after
 * a transient browser-tab hide). Opening the empty Files placeholder (making it
 * the active editor) reveals the Files detail, since its content lives there.
 */
export class SinglePaneDetailPanelStrategy extends SinglePaneLayoutStrategy {

	private _changesOrFilesActiveContext: IContextKey<boolean> | undefined;
	private readonly _detailSequencer = new Sequencer();
	private _detailGeneration = 0;
	private _hiddenByBrowser = false;

	constructor(
		ctx: ISinglePaneLayoutContext,
		@IAgentWorkbenchLayoutService private readonly _layoutService: IAgentWorkbenchLayoutService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@IEditorService private readonly _editorService: IEditorService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IViewsService private readonly _viewsService: IViewsService,
		@ISessionChangesService private readonly _sessionChangesService: ISessionChangesService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
	) {
		super(ctx);

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
			auxBarVisibleObs.read(reader);
			const generation = ++this._detailGeneration;
			void this._detailSequencer.queue(() => this._syncDetailTarget(target, generation)).catch(onUnexpectedError);
		}));

		// The empty Files placeholder's content (the Files tree) lives in the detail; keyed on active-editor so the inactive auto-ensured tab never reveals it.
		this._register(this._editorService.onDidActiveEditorChange(() => {
			if (this._editorService.activeEditor instanceof EmptyFileEditorInput
				&& this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)
				&& !this._ctx.isRestoringSessionLayout
				&& !this._layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
				this._layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
			}
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
		// closed, so hide the detail. Two transient-empty windows must be excluded,
		// or the detail the user had open gets wrongly hidden:
		//  - the new-session (uncreated) view, whose Files detail is owned by the
		//    layout controller (D3b) while its Files tab is (re)ensured; and
		//  - a session-switch / submit restore, during which the working-set apply
		//    clears the group before the managed Changes/Files tabs are re-ensured.
		//    On submit the committed session flips to created with a momentarily
		//    empty group, so without this guard the just-opened detail is hidden.
		//    Leaving it as-is (Preserve) lets the managed tabs settle; the detail
		//    then follows the active editor.
		if (mainPartEmptyObs.read(reader) && (activeSession?.isCreated.read(reader) ?? true)) {
			return this._ctx.isRestoringSessionLayout ? DetailPanelTarget.Preserve : DetailPanelTarget.Hidden;
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

	private async _syncDetailTarget(target: DetailPanelTarget, generation: number): Promise<void> {
		if (generation !== this._detailGeneration) {
			return;
		}

		let auxBarVisible = this._layoutService.isVisible(Parts.AUXILIARYBAR_PART);
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
				|| this._ctx.isRestoringSessionLayout) {
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
}
