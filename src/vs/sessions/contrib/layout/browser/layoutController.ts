/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { autorun, derived } from '../../../../base/common/observable.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { URI } from '../../../../base/common/uri.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IWorkbenchLayoutService, Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { CHANGES_VIEW_ID } from '../../changes/browser/changesView.js';

interface IPendingTurnState {
	readonly hadChangesBeforeSend: boolean;
	readonly submittedAt: number;
}

export class LayoutController extends Disposable {

	static readonly ID = 'workbench.contrib.sessionsLayoutController';

	private readonly _pendingTurnStateByResource = new ResourceMap<IPendingTurnState>();
	private readonly _panelVisibilityBySession = new ResourceMap<boolean>();

	constructor(
		@IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
		@ISessionsManagementService private readonly _sessionManagementService: ISessionsManagementService,
		@IChatService private readonly _chatService: IChatService,
		@IViewsService private readonly _viewsService: IViewsService,
	) {
		super();

		const activeSessionHasChangesObs = derived<boolean>(reader => {
			const activeSession = this._sessionManagementService.activeSession.read(reader);
			if (!activeSession) {
				return false;
			}
			const changes = activeSession.changes.read(reader);
			return changes.length > 0;
		});

		// Switch between sessions — sync auxiliary bar and panel visibility
		this._register(autorun(reader => {
			const activeSession = this._sessionManagementService.activeSession.read(reader);
			const activeSessionHasChanges = activeSessionHasChangesObs.read(reader);
			this._syncAuxiliaryBarVisibility(activeSessionHasChanges);
			this._syncPanelVisibility(activeSession?.resource);
		}));

		// When a turn is completed, check if there were changes before the turn and
		// if there are changes after the turn. If there were no changes before the
		// turn and there are changes after the turn, show the auxiliary bar.
		this._register(autorun((reader) => {
			const activeSession = this._sessionManagementService.activeSession.read(reader);
			const activeSessionHasChanges = activeSessionHasChangesObs.read(reader);
			if (!activeSession) {
				return;
			}

			const pendingTurnState = this._pendingTurnStateByResource.get(activeSession.resource);
			if (!pendingTurnState) {
				return;
			}

			const lastTurnEnd = activeSession.lastTurnEnd.read(reader);
			const turnCompleted = !!lastTurnEnd && lastTurnEnd.getTime() >= pendingTurnState.submittedAt;
			if (!turnCompleted) {
				return;
			}

			if (!pendingTurnState.hadChangesBeforeSend && activeSessionHasChanges) {
				this._layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
			}

			this._pendingTurnStateByResource.delete(activeSession.resource);
		}));

		this._register(this._chatService.onDidSubmitRequest(({ chatSessionResource }) => {
			this._pendingTurnStateByResource.set(chatSessionResource, {
				hadChangesBeforeSend: activeSessionHasChangesObs.get(),
				submittedAt: Date.now(),
			});
		}));

		// Track panel visibility changes by the user
		this._register(this._layoutService.onDidChangePartVisibility(e => {
			if (e.partId !== Parts.PANEL_PART) {
				return;
			}
			const activeSession = this._sessionManagementService.activeSession.get();
			if (activeSession) {
				this._panelVisibilityBySession.set(activeSession.resource, e.visible);
			}
		}));
	}

	private _syncAuxiliaryBarVisibility(hasChanges: boolean): void {
		if (hasChanges) {
			this._viewsService.openView(CHANGES_VIEW_ID, false);
		} else {
			this._layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
		}
	}

	private _syncPanelVisibility(sessionResource: URI | undefined): void {
		if (!sessionResource) {
			this._layoutService.setPartHidden(true, Parts.PANEL_PART);
			return;
		}

		const wasVisible = this._panelVisibilityBySession.get(sessionResource);
		// Default to hidden if we have no record for this session
		this._layoutService.setPartHidden(wasVisible !== true, Parts.PANEL_PART);
	}
}
