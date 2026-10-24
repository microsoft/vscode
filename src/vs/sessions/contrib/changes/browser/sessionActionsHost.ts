/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { setActiveSessionContextKeys } from '../../../services/sessions/common/sessionContextKeys.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { bindHasWorktreeAndRepositoryContextKey } from '../../applyCommitsToParentRepo/browser/applyChangesToParentRepo.js';
import { IGitHubService } from '../../github/browser/githubService.js';
// eslint-disable-next-line local/code-import-patterns -- TODO: move the agent host session context key out of providers
import { bindIsAgentHostSessionContextKey } from '../../providers/agentHost/browser/agentHostSkillButtons.js';
import { IChangesSessionScope } from '../common/changesViewService.js';
import { bindSessionActionContextKeys } from './sessionActionContextKeys.js';

/**
 * Creates an instantiation service whose context key service evaluates the
 * session action context keys for the session of `scope`, instead of the
 * globally bound keys of the active session. Used by hosts of the session
 * actions that show a session other than the active one.
 */
export function createSessionActionsInstantiationService(instantiationService: IInstantiationService, container: HTMLElement, scope: IChangesSessionScope): { readonly instantiationService: IInstantiationService; readonly store: DisposableStore } {
	const store = new DisposableStore();
	const scopedContextKeyService = store.add(instantiationService.invokeFunction(accessor => accessor.get(IContextKeyService)).createScoped(container));
	store.add(autorun(reader => setActiveSessionContextKeys(scope.session.read(reader), scopedContextKeyService, reader)));
	// Every key the host's menus read must be bound for the scoped session, or it is inherited from the active one.
	store.add(bindHasWorktreeAndRepositoryContextKey(scopedContextKeyService, scope.session));
	store.add(instantiationService.invokeFunction(accessor => bindIsAgentHostSessionContextKey(scopedContextKeyService, scope.session, accessor.get(ISessionsProvidersService))));
	store.add(instantiationService.invokeFunction(accessor => bindSessionActionContextKeys(instantiationService, {
		session: scope.session,
		changes: scope.changes,
		pullRequest: accessor.get(IGitHubService).getSessionPullRequest(scope.session),
	}, scopedContextKeyService)));
	return { instantiationService: instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService]), store), store };
}
