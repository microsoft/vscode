/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AgentHostPullRequestOperationId } from '../../../../../platform/agentHost/common/agentHostChangesetOperationService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { SessionPrimaryPullRequestOperationContext } from '../../../../common/contextkeys.js';
import { ISessionChangeset, ISessionChangesetOperation } from '../../../../services/sessions/common/session.js';
import { GitHubPullRequestCIModel } from '../../../github/browser/models/githubPullRequestCIModel.js';
import { IGitHubService } from '../../../github/browser/githubService.js';
import { ActiveSessionState, IChangesSessionObservables, IChangesSessionScope } from '../../common/changesViewService.js';
import { createSessionActionsInstantiationService } from '../../browser/sessionActionsHost.js';
import { hasWorktreeAndRepositoryContextKey } from '../../../../services/sessions/browser/sessionScopedContextKeys.js';

suite('Session Actions Host', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('evaluates the session action context keys of the scoped session on a child context key service', () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const globalService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		instantiationService.stub(IContextKeyService, globalService);
		instantiationService.stub(IGitHubService, upcastPartial<IGitHubService>({
			getSessionPullRequest: () => upcastPartial<ReturnType<IGitHubService['getSessionPullRequest']>>({
				pullRequestCIObs: constObservable(upcastPartial<GitHubPullRequestCIModel>({ checks: constObservable([]), requiredChecks: constObservable(undefined), fixRequested: observableValue('fixRequested', false) })),
			}),
		}));
		const changeset = upcastPartial<ISessionChangeset>({
			operations: constObservable([upcastPartial<ISessionChangesetOperation>({ id: AgentHostPullRequestOperationId.Merge })]),
		});
		const scope = upcastPartial<IChangesSessionScope>({
			session: constObservable(undefined),
			changes: upcastPartial<IChangesSessionObservables>({
				changesObs: constObservable([]),
				changesetsLoadingObs: constObservable(false),
				loadingObs: constObservable(false),
				changesetObs: constObservable(changeset),
				stateObs: constObservable(upcastPartial<ActiveSessionState>({ hasOpenPullRequest: true })),
			}),
		});

		const host = createSessionActionsInstantiationService(instantiationService, document.createElement('div'), scope);
		disposables.add(host.store);

		const childService = host.instantiationService.invokeFunction(accessor => accessor.get(IContextKeyService));
		assert.deepStrictEqual({
			child: SessionPrimaryPullRequestOperationContext.getValue(childService),
			global: SessionPrimaryPullRequestOperationContext.getValue(globalService),
		}, { child: AgentHostPullRequestOperationId.Merge, global: undefined });
	});

	test('does not leak the active session context keys of the global service into the scoped one', () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const globalService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		instantiationService.stub(IContextKeyService, globalService);
		instantiationService.stub(IGitHubService, upcastPartial<IGitHubService>({
			getSessionPullRequest: () => upcastPartial<ReturnType<IGitHubService['getSessionPullRequest']>>({
				pullRequestCIObs: constObservable(upcastPartial<GitHubPullRequestCIModel>({ checks: constObservable([]), requiredChecks: constObservable(undefined), fixRequested: observableValue('fixRequested', false) })),
			}),
		}));
		const scope = upcastPartial<IChangesSessionScope>({
			session: constObservable(undefined),
			changes: upcastPartial<IChangesSessionObservables>({
				changesObs: constObservable([]),
				changesetsLoadingObs: constObservable(false),
				loadingObs: constObservable(false),
				changesetObs: constObservable(undefined),
				stateObs: constObservable(upcastPartial<ActiveSessionState>({})),
			}),
		});
		globalService.createKey(hasWorktreeAndRepositoryContextKey.key, true);

		const host = createSessionActionsInstantiationService(instantiationService, document.createElement('div'), scope);
		disposables.add(host.store);

		const childService = host.instantiationService.invokeFunction(accessor => accessor.get(IContextKeyService));
		assert.deepStrictEqual({
			child: hasWorktreeAndRepositoryContextKey.getValue(childService),
			global: hasWorktreeAndRepositoryContextKey.getValue(globalService),
		}, { child: false, global: true });
	});
});
