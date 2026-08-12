/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../../base/browser/window.js';
import { Sequencer } from '../../../../../base/common/async.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { HasDockedDetailsContext } from '../../../../common/contextkeys.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { CHANGES_VIEW_CONTAINER_ID } from '../../../changes/common/changes.js';
import { SESSIONS_FILES_CONTAINER_ID } from '../../../files/browser/files.contribution.js';
import { EmptyFileEditorInput } from '../../../editor/browser/emptyFileEditorInput.js';
import { ISinglePaneLayoutContext } from './singlePaneLayoutStrategy.js';

export const enum DetailPanelTarget {
	Hidden,
	BrowserHidden,
	Changes,
	ChangesForced,
	Files,
	FilesForced,
	Preserve
}

/**
 * Shared mechanics for syncing the single-pane detail panel (auxiliary bar) to a
 * {@link DetailPanelTarget}. Each lifecycle strategy computes ITS OWN target (the decision:
 * Files-by-default for a New Session, Changes-by-default for an Existing Session, always
 * Hidden for Quick Chat), but the actual reveal/hide + `openViewContainer` calls are serialized
 * through this one sequencer/generation pair so a New→Existing (submit) transition can never
 * race two concurrent view-container opens against each other.
 */
export class SinglePaneDetailPanelCoordinator extends Disposable {

	private readonly _hasDockedDetailsContext: IContextKey<boolean>;
	private readonly _sequencer = new Sequencer();
	private _generation = 0;
	private _hiddenByBrowser = false;

	constructor(
		private readonly _ctx: ISinglePaneLayoutContext,
		@IAgentWorkbenchLayoutService private readonly _layoutService: IAgentWorkbenchLayoutService,
		@IViewsService private readonly _viewsService: IViewsService,
		@IEditorService private readonly _editorService: IEditorService,
		@ISessionsService sessionsService: ISessionsService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		this._hasDockedDetailsContext = HasDockedDetailsContext.bindTo(contextKeyService);
		this._register(autorun(reader => {
			const activeSession = sessionsService.activeSession.read(reader);
			if (!activeSession || (!(activeSession.isQuickChat?.read(reader) ?? false) && !activeSession.workspace.read(reader))) {
				this.sync(DetailPanelTarget.Preserve);
			}
		}));

		// The empty Files placeholder's content (the Files tree) lives in the detail panel;
		// keyed on active-editor (not `onWillOpenEditor`) so the inactive auto-ensured tab
		// never reveals it — only activating it (tab click, `+` Files) does. Kind-agnostic:
		// applies the same way whether a New Session or an Existing Session opened it.
		this._register(this._editorService.onDidActiveEditorChange(() => {
			if (this._editorService.activeEditor instanceof EmptyFileEditorInput
				&& this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)
				&& !this._ctx.isRestoringSessionLayout
				&& !this._layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
				this._layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
			}
		}));
	}

	/** Queues a sync to `target`, superseding any not-yet-run queued sync. */
	/**
	 * Queues a sync to `syncTarget`, superseding any not-yet-run queued sync. `displayTarget`
	 * (typically the same as `syncTarget`, except while multiple sessions are visible — see
	 * below) drives {@link HasDockedDetailsContext}, which reflects what the active tab
	 * *would* show regardless of whether the detail panel is currently allowed to reveal it.
	 */
	sync(displayTarget: DetailPanelTarget, syncTarget: DetailPanelTarget = displayTarget): void {
		const hasDockedDetails = displayTarget === DetailPanelTarget.Changes || displayTarget === DetailPanelTarget.ChangesForced
			|| displayTarget === DetailPanelTarget.Files || displayTarget === DetailPanelTarget.FilesForced;
		this._hasDockedDetailsContext.set(hasDockedDetails);
		const generation = ++this._generation;
		void this._sequencer.queue(() => this._syncTarget(syncTarget, generation));
	}

	private async _syncTarget(target: DetailPanelTarget, generation: number): Promise<void> {
		if (generation !== this._generation) {
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
				await this._syncForcedTarget(CHANGES_VIEW_CONTAINER_ID, auxBarVisible);
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
				await this._syncForcedTarget(SESSIONS_FILES_CONTAINER_ID, auxBarVisible);
				return;
			case DetailPanelTarget.Preserve:
				this._hiddenByBrowser = false;
				return;
		}
	}

	private async _syncForcedTarget(viewContainerId: string, auxBarVisible: boolean): Promise<void> {
		if (!auxBarVisible) {
			// The detail panel is hidden. The global visibility choice is respected, so a
			// Changes/file editor becoming active never force-reveals the detail. The one
			// exception is restoring the detail after a *transient* browser-tab hide
			// (`_hiddenByBrowser`). Never reveal while the whole side pane is closed (the
			// editor content is also hidden) or during a session-switch layout restore.
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
}
