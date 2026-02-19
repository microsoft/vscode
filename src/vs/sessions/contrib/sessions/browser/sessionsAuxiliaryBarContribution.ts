/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { autorun, derivedOpts } from '../../../../base/common/observable.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { AgentSessionProviders } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { IAgentSessionsService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatEditingService } from '../../../../workbench/contrib/chat/common/editing/chatEditingService.js';
import { getChatSessionType } from '../../../../workbench/contrib/chat/common/model/chatUri.js';
import { IWorkbenchLayoutService, Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { ISessionsManagementService } from './sessionsManagementService.js';

interface IPendingTurnState {
	readonly hadChangesBeforeSend: boolean;
	readonly submittedAt: number;
}

export class SessionsAuxiliaryBarContribution extends Disposable {

	static readonly ID = 'workbench.contrib.sessionsAuxiliaryBarContribution';

	private readonly pendingTurnStateByResource = new ResourceMap<IPendingTurnState>();

	constructor(
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@ISessionsManagementService private readonly sessionManagementService: ISessionsManagementService,
		@IChatEditingService private readonly chatEditingService: IChatEditingService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IChatService private readonly chatService: IChatService,
	) {
		super();

		const activeSessionResourceObs = derivedOpts<URI | undefined>({
			equalsFn: isEqual,
		}, (reader) => {
			return this.sessionManagementService.activeSession.map(activeSession => activeSession?.resource).read(reader);
		}).recomputeInitiallyAndOnChange(this._store);

		this._register(this.chatService.onDidSubmitRequest(({ chatSessionResource }) => {
			this.pendingTurnStateByResource.set(chatSessionResource, {
				hadChangesBeforeSend: this.hasSessionChanges(chatSessionResource),
				submittedAt: Date.now(),
			});
		}));

		// When a turn is completed, check if there were changes before the turn and if there are changes after the turn.
		// If there were no changes before the turn and there are changes after the turn, show the auxiliary bar.
		this._register(autorun((reader) => {
			const activeSessionResource = activeSessionResourceObs.read(reader);
			if (!activeSessionResource) {
				return;
			}

			const pendingTurnState = this.pendingTurnStateByResource.get(activeSessionResource);
			if (!pendingTurnState) {
				return;
			}

			const activeSession = this.agentSessionsService.getSession(activeSessionResource);
			const turnCompleted = !!activeSession?.timing.lastRequestEnded && activeSession.timing.lastRequestEnded >= pendingTurnState.submittedAt;
			if (!turnCompleted) {
				return;
			}

			const hasChangesAfterTurn = this.hasSessionChanges(activeSessionResource);
			if (!pendingTurnState.hadChangesBeforeSend && hasChangesAfterTurn) {
				this.layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
			}

			this.pendingTurnStateByResource.delete(activeSessionResource);
		}));

		// When the session is switched, show the auxiliary bar if there are pending changes from the session
		this._register(autorun(reader => {
			const sessionResource = activeSessionResourceObs.read(reader);
			if (!sessionResource) {
				this.syncAuxiliaryBarVisibility(false);
				return;
			}

			const hasChanges = this.hasSessionChanges(sessionResource);
			this.syncAuxiliaryBarVisibility(hasChanges);
		}));
	}

	private hasSessionChanges(sessionResource: URI): boolean {
		const isBackgroundSession = getChatSessionType(sessionResource) === AgentSessionProviders.Background;

		let editingSessionCount = 0;
		if (!isBackgroundSession) {
			const sessions = this.chatEditingService.editingSessionsObs.read(undefined);
			const editingSession = sessions.find(candidate => isEqual(candidate.chatSessionResource, sessionResource));
			editingSessionCount = editingSession ? editingSession.entries.read(undefined).length : 0;
		}

		const session = this.agentSessionsService.getSession(sessionResource);
		const sessionFilesCount = session?.changes instanceof Array ? session.changes.length : 0;

		return editingSessionCount + sessionFilesCount > 0;
	}

	private syncAuxiliaryBarVisibility(hasChanges: boolean): void {
		const shouldHideAuxiliaryBar = !hasChanges;
		const isAuxiliaryBarVisible = this.layoutService.isVisible(Parts.AUXILIARYBAR_PART);
		if (shouldHideAuxiliaryBar === !isAuxiliaryBarVisible) {
			return;
		}

		this.layoutService.setPartHidden(shouldHideAuxiliaryBar, Parts.AUXILIARYBAR_PART);
	}
}
