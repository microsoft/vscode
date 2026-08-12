/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../../base/browser/window.js';
import { Event } from '../../../../../base/common/event.js';
import { autorun, observableFromEvent } from '../../../../../base/common/observable.js';
import { IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { DetailPanelTarget, SinglePaneDetailPanelCoordinator } from './singlePaneDetailPanelCoordinator.js';
import { isMainPartEmpty } from './singlePaneSharedHelpers.js';
import { ISinglePaneLayoutContext, SinglePaneLayoutStrategy } from './singlePaneLayoutStrategy.js';

/**
 * Behaviour for the **Quick Chat** lifecycle stage — a workspace-less chat with no side pane:
 *  - hides both the editor content and the detail panel while a quick chat is active, hiding
 *    the editor immediately (before the outgoing working set has even cleared) when switching
 *    in directly from a workspace session, so the side-pane width capture is never polluted by
 *    the about-to-be-cleared editor content;
 *  - keeps the detail panel Hidden (it has no Changes/Files content of its own);
 *  - never persists a visibility profile and never touches the managed docked tabs — a quick
 *    chat's session simply reports `wantsChangesTab`/`wantsFilesTab` as `false` to the shared
 *    managed-tabs coordinator (owned by {@link import('./singlePaneExistingSessionStrategy.js').SinglePaneExistingSessionStrategy}),
 *    which reconciles any stray tabs away on its own ambient session-change trigger.
 */
export class SinglePaneQuickChatStrategy extends SinglePaneLayoutStrategy {

	constructor(
		ctx: ISinglePaneLayoutContext,
		private readonly _detailPanel: SinglePaneDetailPanelCoordinator,
		@IAgentWorkbenchLayoutService private readonly _layoutService: IAgentWorkbenchLayoutService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@IEditorService private readonly _editorService: IEditorService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
	) {
		super(ctx);

		const mainPartEmptyObs = observableFromEvent(this,
			Event.any(this._editorService.onDidActiveEditorChange, this._editorService.onDidEditorsChange, this._editorService.onDidCloseEditor),
			() => isMainPartEmpty(this._editorGroupsService));

		// Whether a New/Existing (workspace) session has ever been active before — mirrors the
		// original combined controller's `activeProfile !== undefined` check, used to detect a
		// direct workspace-session → quick-chat switch (as opposed to quick chat being the very
		// first thing shown, e.g. on startup).
		let hasSeenWorkspaceSession = false;
		let wasQuickChatActive = false;

		this._register(autorun(reader => {
			const multipleSessionsVisible = this._ctx.multipleSessionsVisibleObs.read(reader);
			if (multipleSessionsVisible) {
				wasQuickChatActive = false;
				return;
			}

			const activeSession = this._sessionsService.activeSession.read(reader);
			if (!activeSession) {
				return;
			}

			const isQuickChat = activeSession.isQuickChat?.read(reader) ?? false;
			if (!isQuickChat) {
				hasSeenWorkspaceSession = true;
				wasQuickChatActive = false;
				return;
			}

			const mainPartEmpty = mainPartEmptyObs.read(reader);
			const enteringQuickChat = !wasQuickChatActive;
			const switchingFromWorkspaceSession = enteringQuickChat && hasSeenWorkspaceSession;
			wasQuickChatActive = true;
			this._ctx.withSessionLayoutRestore(() => this._hide(switchingFromWorkspaceSession || mainPartEmpty));
		}));

		this._register(autorun(reader => {
			const multipleSessionsVisible = this._ctx.multipleSessionsVisibleObs.read(reader);
			const activeSession = this._sessionsService.activeSession.read(reader);
			const isQuickChat = activeSession?.isQuickChat?.read(reader) ?? false;
			if (!isQuickChat) {
				return;
			}
			this._detailPanel.sync(DetailPanelTarget.Hidden, multipleSessionsVisible ? DetailPanelTarget.Preserve : DetailPanelTarget.Hidden);
		}));
	}

	/** Hides the auxiliary bar, and — when `hideEditor` — the editor content too. */
	private _hide(hideEditor: boolean): void {
		if (hideEditor && this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
			this._layoutService.setPartHidden(true, Parts.EDITOR_PART);
		}
		if (this._layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
			this._layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
		}
	}
}
