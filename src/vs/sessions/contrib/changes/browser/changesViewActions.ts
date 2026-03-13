/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { observableFromEvent } from '../../../../base/common/observable.js';
import { localize2 } from '../../../../nls.js';
import { Action2, IAction2Options, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { hasValidDiff } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { CHANGES_VIEW_ID } from './changesView.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { bindContextKey } from '../../../../platform/observable/common/platformObservableUtils.js';

import { activeSessionHasChangesContextKey } from '../common/changes.js';

const openChangesViewActionOptions: IAction2Options = {
	id: 'workbench.action.agentSessions.openChangesView',
	title: localize2('openChangesView', "Changes"),
	icon: Codicon.diffMultiple,
	f1: false,
};

class OpenChangesViewAction extends Action2 {

	static readonly ID = openChangesViewActionOptions.id;

	constructor() {
		super(openChangesViewActionOptions);
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		await viewsService.openView(CHANGES_VIEW_ID, true);
	}
}

registerAction2(OpenChangesViewAction);

class ChangesViewActionsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.changesViewActions';

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@ISessionsManagementService sessionManagementService: ISessionsManagementService,
		@IAgentSessionsService agentSessionsService: IAgentSessionsService,
	) {
		super();

		// Bind context key: true when the active session has changes
		const sessionsChanged = observableFromEvent(this, agentSessionsService.model.onDidChangeSessions, () => { });
		this._register(bindContextKey(activeSessionHasChangesContextKey, contextKeyService, reader => {
			sessionManagementService.activeSession.read(reader);
			sessionsChanged.read(reader);
			const activeSession = sessionManagementService.getActiveSession();
			if (!activeSession) {
				return false;
			}
			const agentSession = agentSessionsService.getSession(activeSession.resource);
			return !!agentSession?.changes && hasValidDiff(agentSession.changes);
		}));
	}
}

registerWorkbenchContribution2(ChangesViewActionsContribution.ID, ChangesViewActionsContribution, WorkbenchPhase.AfterRestored);
