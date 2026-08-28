/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../../base/browser/window.js';
import { autorun } from '../../../../../base/common/observable.js';
import { IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { DetailPanelTarget, SinglePaneDetailPanelCoordinator } from './singlePaneDetailPanelCoordinator.js';
import { isMainPartEmpty } from './singlePaneSharedHelpers.js';
import { ISinglePaneLayoutContext, SinglePaneLayoutStrategy } from './singlePaneLayoutStrategy.js';
import { SessionVisibilityProfile, SinglePaneVisibilityProfileStore } from './singlePaneVisibilityProfileStore.js';

/**
 * Behaviour for the **Quick Chat** lifecycle stage — a workspace-less chat:
 *  - shares side-pane visibility with Existing Sessions when it has editors;
 *  - otherwise hides the side pane without changing the shared visibility;
 *  - later explicit editor opens follow normal workbench behavior;
 *  - never touches the managed docked tabs — a quick
 *    chat's session simply reports `wantsChangesTab`/`wantsFilesTab` as `false` to the shared
 *    managed-tabs coordinator (owned by {@link import('./singlePaneExistingSessionStrategy.js').SinglePaneExistingSessionStrategy}),
 *    which reconciles any stray tabs away on its own ambient session-change trigger.
 */
export class SinglePaneQuickChatStrategy extends SinglePaneLayoutStrategy {

	private _activeQuickChatKey: string | undefined;
	private _pendingEditorRestoreKey: string | undefined;
	private _changingVisibility = false;

	constructor(
		ctx: ISinglePaneLayoutContext,
		private readonly _detailPanel: SinglePaneDetailPanelCoordinator,
		private readonly _visibilityStore: SinglePaneVisibilityProfileStore,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@IAgentWorkbenchLayoutService private readonly _layoutService: IAgentWorkbenchLayoutService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IEditorService private readonly _editorService: IEditorService,
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
				const hasSavedWorkingSet = this._ctx.hasSavedWorkingSet(activeSession.resource);
				this._pendingEditorRestoreKey = !multipleSessionsVisible && hasSavedWorkingSet
					? sessionKey
					: undefined;
				if (!multipleSessionsVisible) {
					if (hasSavedWorkingSet) {
						this._applySharedVisibility();
					} else {
						this._hideSidePaneTransiently();
					}
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
				this._hideSidePaneTransiently();
				return;
			}

			this._applySharedVisibility();
		}));

		this._register(this._layoutService.onDidChangePartVisibility(e => {
			if (e.partId !== Parts.EDITOR_PART && e.partId !== Parts.AUXILIARYBAR_PART) {
				return;
			}

			this._captureSharedVisibility();
		}));
		this._register(this._editorService.onDidEditorsChange(() => this._captureSharedVisibility()));
	}

	private _captureSharedVisibility(): void {
		if (this._changingVisibility
			|| this._ctx.isRestoringSessionLayout
			|| this._ctx.multipleSessionsVisibleObs.get()
			|| this._layoutService.isEditorMaximized()
			|| this._layoutService.isVisible(Parts.CUSTOM_VIEW_GRID_PART)
			|| isMainPartEmpty(this._editorGroupsService)) {
			return;
		}

		const activeSession = this._sessionsService.activeSession.get();
		if (!activeSession || !(activeSession.isQuickChat?.get() ?? false)) {
			return;
		}

		this._visibilityStore.set(SessionVisibilityProfile.Existing, {
			editorVisible: this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow),
			auxiliaryBarVisible: false,
		});
	}

	private _hideSidePaneTransiently(): void {
		this._changingVisibility = true;
		try {
			this._layoutService.hideSidePane();
		} finally {
			this._changingVisibility = false;
		}
	}

	private _applySharedVisibility(): void {
		const sharedState = this._visibilityStore.get(SessionVisibilityProfile.Existing);
		const sidePaneVisible = sharedState.editorVisible || sharedState.auxiliaryBarVisible;
		const suppression = this._layoutService.suppressEditorPartAutoVisibility();
		this._changingVisibility = true;
		try {
			if (this._layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
				this._layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
			}
			if (sidePaneVisible !== this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
				this._layoutService.setPartHidden(!sidePaneVisible, Parts.EDITOR_PART);
			}
		} finally {
			this._changingVisibility = false;
			suppression.dispose();
		}
	}
}
