/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { getMainWindowHost, ISessionHostService } from '../../../../workbench/services/sessions/browser/sessionHost.js';
import { IGitHubService } from '../../../../workbench/contrib/sessions/browser/github/githubService.js';
import { IChangesViewService } from '../../../../workbench/contrib/sessions/common/changesViewService.js';
import { bindSessionActionContextKeys } from '../../../../workbench/contrib/sessionChanges/browser/sessionActionContextKeys.js';

/** Binds the session action context keys of the main window host's session on the global context key service. */
class ActiveSessionActionContextKeysContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessions.activeSessionActionContextKeys';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ISessionHostService sessionHostService: ISessionHostService,
		@IChangesViewService changesViewService: IChangesViewService,
		@IGitHubService gitHubService: IGitHubService,
	) {
		super();
		const mainWindowHost = getMainWindowHost(sessionHostService);
		this._register(bindSessionActionContextKeys(instantiationService, {
			session: mainWindowHost.session,
			chat: mainWindowHost.chat,
			changes: {
				changesObs: changesViewService.activeSessionChangesObs,
				changesetsLoadingObs: changesViewService.activeSessionChangesetsLoadingObs,
				loadingObs: changesViewService.activeSessionLoadingObs,
				changesetObs: changesViewService.activeSessionChangesetObs,
				changesetOperationsObs: changesViewService.activeSessionChangesetOperationsObs,
				stateObs: changesViewService.activeSessionStateObs,
			},
			pullRequest: { pullRequestCIObs: gitHubService.activeSessionPullRequestCIObs },
		}, contextKeyService));
	}
}

registerWorkbenchContribution2(ActiveSessionActionContextKeysContribution.ID, ActiveSessionActionContextKeysContribution, WorkbenchPhase.AfterRestored);
