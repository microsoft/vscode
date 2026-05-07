/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { autorun, derived, derivedOpts } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { isMobile, isWeb } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IWorkbenchLayoutService, Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { CHANGES_VIEW_ID } from '../../changes/common/changes.js';
import { SESSIONS_FILES_CONTAINER_ID } from '../../files/browser/files.contribution.js';
import { SessionStatus } from '../../../services/sessions/common/session.js';

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

		const activeSessionResourceObs = derivedOpts<URI | undefined>({
			equalsFn: isEqual
		}, reader => {
			const activeSession = this._sessionManagementService.activeSession.read(reader);
			return activeSession?.resource;
		});

		const activeSessionHasChangesObs = derived<boolean>(reader => {
			const activeSession = this._sessionManagementService.activeSession.read(reader);
			if (!activeSession) {
				return false;
			}
			const changes = activeSession.changes.read(reader);
			return changes.length > 0;
		});

		const activeSessionIsUntitledObs = derived<boolean>(reader => {
			const activeSession = this._sessionManagementService.activeSession.read(reader);
			const activeSessionStatus = activeSession?.status.read(reader);

			return activeSessionStatus === SessionStatus.Untitled;
		});

		const activeSessionHasWorkspaceObs = derived<boolean>(reader => {
			const activeSession = this._sessionManagementService.activeSession.read(reader);
			return activeSession?.workspace.read(reader)?.repositories?.[0]?.uri !== undefined;
		});

		// Switch between sessions — sync auxiliary bar (skip on mobile to avoid
		// disruptive auto-expand on narrow viewports)
		if (!(isWeb && isMobile)) {
			this._register(autorun(reader => {
				const isUntitled = activeSessionIsUntitledObs.read(reader);
				const activeSessionHasWorkspace = activeSessionHasWorkspaceObs.read(reader);
				const activeSessionHasChanges = activeSessionHasChangesObs.read(reader);

				this._syncAuxiliaryBarVisibility(activeSessionHasWorkspace, isUntitled, activeSessionHasChanges);
			}));
		}

		// Switch between sessions — sync panel visibility
		this._register(autorun(reader => {
			const activeSessionResource = activeSessionResourceObs.read(reader);
			this._syncPanelVisibility(activeSessionResource);
		}));

		// When a turn is completed, check if there were changes before the turn and
		// if there are changes after the turn. If there were no changes before the
		// turn and there are changes after the turn, show the auxiliary bar.
		// Skip on mobile to avoid disruptive auto-expand on narrow viewports.
		if (!(isWeb && isMobile)) {
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
		}

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

	private _syncAuxiliaryBarVisibility(hasWorkspace: boolean, isUntitled: boolean, hasChanges: boolean): void {
		if (!hasWorkspace) {
			// Hide the auxiliary bar
			this._viewsService.closeViewContainer(SESSIONS_FILES_CONTAINER_ID);
		} else if (isUntitled) {
			// Show the auxiliary bar (files view)
			this._viewsService.openViewContainer(SESSIONS_FILES_CONTAINER_ID, false);
		} else if (hasChanges) {
			// Show the auxiliary bar (changes view)
			this._viewsService.openView(CHANGES_VIEW_ID, false);
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
