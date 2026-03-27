/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { autorun, derived } from '../../../../base/common/observable.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IWorkbenchLayoutService, Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { CHANGES_VIEW_ID } from './changesView.js';

interface IPendingTurnState {
	readonly hadChangesBeforeSend: boolean;
	readonly submittedAt: number;
}

export class ChangesViewController extends Disposable {

	static readonly ID = 'workbench.contrib.changesViewController';

	private readonly pendingTurnStateByResource = new ResourceMap<IPendingTurnState>();

	constructor(
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@ISessionsManagementService private readonly sessionManagementService: ISessionsManagementService,
		@IChatService private readonly chatService: IChatService,
		@IViewsService private readonly viewsService: IViewsService,
	) {
		super();

		const activeSessionHasChangesObs = derived<boolean>(reader => {
			const activeSession = this.sessionManagementService.activeSession.read(reader);
			if (!activeSession) {
				return false;
			}
			const changes = activeSession.changes.read(reader);
			return changes.length > 0;
		});

		// Switch between sessions
		this._register(autorun(reader => {
			const activeSessionHasChanges = activeSessionHasChangesObs.read(reader);
			this.syncAuxiliaryBarVisibility(activeSessionHasChanges);
		}));

		// When a turn is completed, check if there were changes before the turn and
		// if there are changes after the turn. If there were no changes before the
		// turn and there are changes after the turn, show the auxiliary bar.
		this._register(autorun((reader) => {
			const activeSession = this.sessionManagementService.activeSession.read(reader);
			const activeSessionHasChanges = activeSessionHasChangesObs.read(reader);
			if (!activeSession) {
				return;
			}

			const pendingTurnState = this.pendingTurnStateByResource.get(activeSession.resource);
			if (!pendingTurnState) {
				return;
			}

			const lastTurnEnd = activeSession.lastTurnEnd.read(reader);
			const turnCompleted = !!lastTurnEnd && lastTurnEnd.getTime() >= pendingTurnState.submittedAt;
			if (!turnCompleted) {
				return;
			}

			if (!pendingTurnState.hadChangesBeforeSend && activeSessionHasChanges) {
				this.layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
			}

			this.pendingTurnStateByResource.delete(activeSession.resource);
		}));

		this._register(this.chatService.onDidSubmitRequest(({ chatSessionResource }) => {
			this.pendingTurnStateByResource.set(chatSessionResource, {
				hadChangesBeforeSend: activeSessionHasChangesObs.get(),
				submittedAt: Date.now(),
			});
		}));
	}

	private syncAuxiliaryBarVisibility(hasChanges: boolean): void {
		if (hasChanges) {
			this.viewsService.openView(CHANGES_VIEW_ID, false);
		} else {
			this.layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
		}
	}
}
