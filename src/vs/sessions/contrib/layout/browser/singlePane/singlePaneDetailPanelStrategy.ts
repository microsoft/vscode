/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../../base/browser/window.js';
import { Sequencer } from '../../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Event } from '../../../../../base/common/event.js';
import { autorun, IObservable, IReader, observableFromEvent } from '../../../../../base/common/observable.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { DiffEditorInput } from '../../../../../workbench/common/editor/diffEditorInput.js';
import { BrowserEditorInput } from '../../../../../workbench/contrib/browserView/common/browserEditorInput.js';
import { FileEditorInput } from '../../../../../workbench/contrib/files/browser/editors/fileEditorInput.js';
import { MultiDiffEditorInput } from '../../../../../workbench/contrib/multiDiffEditor/browser/multiDiffEditorInput.js';
import { WebviewInput } from '../../../../../workbench/contrib/webviewPanel/browser/webviewEditorInput.js';
import { IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { HasDockedDetailsContext } from '../../../../common/contextkeys.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
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

const MARKDOWN_EDITOR_VIEW_TYPES = new Set([
	'markdown.preview',
	'vscode.markdown.editor',
	'vscode.markdown.preview.editor',
]);

/**
 * Maps the active editor to its detail container (Changes / Files) and
 * reveals/hides the auxiliary bar accordingly. See SINGLE_PANE_SCENARIOS.md
 * section 5 for the full per-tab behavior catalog.
 */
export class SinglePaneDetailPanelStrategy extends SinglePaneLayoutStrategy {

	private _hasDockedDetailsContext: IContextKey<boolean> | undefined;
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

		this._hasDockedDetailsContext = HasDockedDetailsContext.bindTo(this._contextKeyService);
		const activeEditorObs = observableFromEvent(this, this._editorService.onDidActiveEditorChange, () => this._editorService.activeEditor);
		const mainPartEmptyObs = observableFromEvent(this, Event.any(this._editorService.onDidActiveEditorChange, this._editorService.onDidEditorsChange, this._editorService.onDidCloseEditor), () => this._isMainPartEmpty());
		const auxBarVisibleObs = observableFromEvent(this, this._layoutService.onDidChangePartVisibility, () => this._layoutService.isVisible(Parts.AUXILIARYBAR_PART));
		const editorPartVisibleObs = observableFromEvent(this, this._layoutService.onDidChangePartVisibility, () => this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow));
		const editorMaximizedObs = observableFromEvent(this, this._layoutService.onDidChangeEditorMaximized, () => this._layoutService.isEditorMaximized());

		this._register(autorun(reader => {
			const activeEditor = activeEditorObs.read(reader);
			const target = this._computeDetailTarget(reader, activeEditor, mainPartEmptyObs, editorMaximizedObs, editorPartVisibleObs);
			const hasDockedDetails = target === DetailPanelTarget.Changes || target === DetailPanelTarget.ChangesForced || target === DetailPanelTarget.Files || target === DetailPanelTarget.FilesForced;
			this._hasDockedDetailsContext!.set(hasDockedDetails);
			auxBarVisibleObs.read(reader);
			const syncTarget = this._ctx.multipleSessionsVisibleObs.read(reader) ? DetailPanelTarget.Preserve : target;
			const generation = ++this._detailGeneration;
			void this._detailSequencer.queue(() => this._syncDetailTarget(syncTarget, generation)).catch(onUnexpectedError);
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

	private _computeDetailTarget(reader: IReader, activeEditor: EditorInput | undefined, mainPartEmptyObs: IObservable<boolean>, editorMaximizedObs: IObservable<boolean>, editorPartVisibleObs: IObservable<boolean>): DetailPanelTarget {
		const activeSession = this._sessionsService.activeSession.read(reader);
		if (!activeSession) {
			return DetailPanelTarget.Preserve;
		}
		const isQuickChat = activeSession?.isQuickChat?.read(reader) ?? false;
		const workspace = activeSession?.workspace.read(reader);
		if (isQuickChat) {
			return DetailPanelTarget.Hidden;
		}
		if (!workspace) {
			return DetailPanelTarget.Preserve;
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
			// Browser has no detail of its own, so it only hides the panel
			// while the editor area is visible; once hidden, fall back to the
			// contextual Changes/Files default instead of leaving it blank.
			if (editorPartVisibleObs.read(reader)) {
				return DetailPanelTarget.BrowserHidden;
			}
			return activeSession?.isCreated.read(reader) ? DetailPanelTarget.Changes : DetailPanelTarget.Files;
		}

		if (this._isChangesEditor(activeEditor)) {
			return DetailPanelTarget.ChangesForced;
		}

		if (this._isFileEditor(activeEditor)) {
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
			// The detail panel is hidden. The global visibility choice is respected,
			// so a Changes/file editor becoming active never
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
		if (editor instanceof DiffEditorInput || editor instanceof MultiDiffEditorInput) {
			return true;
		}
		const resource = editor.resource;
		return !!resource && this._sessionChangesService.getSessionResource(resource) !== undefined;
	}

	private _isFileEditor(editor: EditorInput): boolean {
		if (editor instanceof WebviewInput) {
			return MARKDOWN_EDITOR_VIEW_TYPES.has(editor.viewType) || MARKDOWN_EDITOR_VIEW_TYPES.has(editor.providerId ?? '');
		}
		return editor instanceof EmptyFileEditorInput || editor instanceof FileEditorInput;
	}
}
