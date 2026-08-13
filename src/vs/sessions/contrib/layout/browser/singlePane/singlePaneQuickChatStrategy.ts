/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../../base/browser/window.js';
import { autorun } from '../../../../../base/common/observable.js';
import { IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { DetailPanelTarget, SinglePaneDetailPanelCoordinator } from './singlePaneDetailPanelCoordinator.js';
import { isMainPartEmpty } from './singlePaneSharedHelpers.js';
import { ISinglePaneLayoutContext, SinglePaneLayoutStrategy } from './singlePaneLayoutStrategy.js';

/**
 * Behaviour for the **Quick Chat** lifecycle stage — a workspace-less chat:
 *  - hides the side pane once when Quick Chat becomes active;
 *  - reveals the Editor after a saved working set has been restored;
 *  - later explicit editor opens follow normal workbench behavior;
 *  - never persists a visibility profile and never touches the managed docked tabs — a quick
 *    chat's session simply reports `wantsChangesTab`/`wantsFilesTab` as `false` to the shared
 *    managed-tabs coordinator (owned by {@link import('./singlePaneExistingSessionStrategy.js').SinglePaneExistingSessionStrategy}),
 *    which reconciles any stray tabs away on its own ambient session-change trigger.
 */
export class SinglePaneQuickChatStrategy extends SinglePaneLayoutStrategy {

	private _activeQuickChatKey: string | undefined;
	private _pendingEditorRestoreKey: string | undefined;

	constructor(
		ctx: ISinglePaneLayoutContext,
		private readonly _detailPanel: SinglePaneDetailPanelCoordinator,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@IAgentWorkbenchLayoutService private readonly _layoutService: IAgentWorkbenchLayoutService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
	) {
		super(ctx);

		this._register(autorun(reader => {
			const activeSession = this._sessionsService.activeSession.read(reader);
			if (!activeSession || !(activeSession.isQuickChat?.read(reader) ?? false)) {
				this._activeQuickChatKey = undefined;
				this._pendingEditorRestoreKey = undefined;
				return;
			}

			const sessionKey = activeSession.resource.toString();
			const multipleSessionsVisible = this._ctx.multipleSessionsVisibleObs.read(reader);
			if (this._activeQuickChatKey !== sessionKey) {
				this._activeQuickChatKey = sessionKey;
				this._pendingEditorRestoreKey = !multipleSessionsVisible && this._ctx.hasSavedWorkingSet(activeSession.resource)
					? sessionKey
					: undefined;
				if (!multipleSessionsVisible) {
					this._layoutService.hideSidePane();
				}
				this._detailPanel.sync(DetailPanelTarget.Hidden);
			}
		}));

		this._register(this._ctx.onDidEndSessionLayoutRestore(() => {
			const activeSession = this._sessionsService.activeSession.get();
			const sessionKey = activeSession?.resource.toString();
			if (!activeSession
				|| !(activeSession.isQuickChat?.get() ?? false)
				|| this._ctx.multipleSessionsVisibleObs.get()
				|| this._pendingEditorRestoreKey !== sessionKey) {
				return;
			}

			this._pendingEditorRestoreKey = undefined;
			if (isMainPartEmpty(this._editorGroupsService)) {
				return;
			}

			const suppression = this._layoutService.suppressEditorPartAutoVisibility();
			try {
				if (this._layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
					this._layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
				}
				if (!this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
					this._layoutService.setPartHidden(false, Parts.EDITOR_PART);
				}
			} finally {
				suppression.dispose();
			}
		}));
	}
}
