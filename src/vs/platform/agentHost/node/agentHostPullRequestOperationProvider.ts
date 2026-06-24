/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { localize } from '../../../nls.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import type { IChangesetOperationContribution, IChangesetOperationContext, IChangesetOperationRegistry } from '../common/agentHostChangesetOperationService.js';
import { IAgentHostGitStateService } from '../common/agentHostGitStateService.js';
import { ChangesetOperationScope, ChangesetOperationStatus, type ChangesetOperation } from '../common/state/sessionState.js';
import { AgentHostPullRequestOperationHandler, type PullRequestCreatedEvent } from './agentHostPullRequestOperationHandler.js';
import { AgentHostStateManager } from './agentHostStateManager.js';

export class AgentHostPullRequestOperationContribution extends Disposable implements IChangesetOperationContribution {

	private _registry: IChangesetOperationRegistry | undefined;

	constructor(
		private readonly _stateManager: AgentHostStateManager,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IAgentHostGitStateService private readonly _gitStateService: IAgentHostGitStateService
	) {
		super();
	}

	registerHandlers(registry: IChangesetOperationRegistry): IDisposable {
		this._registry = registry;
		const store = new DisposableStore();
		const getSessionState = (sessionKey: string) => this._stateManager.getSessionState(sessionKey);
		const createPrHandler = this._instantiationService.createInstance(AgentHostPullRequestOperationHandler, false, getSessionState, (event) => this._onPullRequestCreated(event));
		const createDraftPrHandler = this._instantiationService.createInstance(AgentHostPullRequestOperationHandler, true, getSessionState, (event) => this._onPullRequestCreated(event));
		store.add(registry.registerChangesetOperationHandler(AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR, createPrHandler));
		store.add(registry.registerChangesetOperationHandler(AgentHostPullRequestOperationHandler.OPERATION_CREATE_DRAFT_PR, createDraftPrHandler));
		store.add({ dispose: () => { this._registry = undefined; } });
		return store;
	}

	getOperations({ gitState, gitHubState }: IChangesetOperationContext): ChangesetOperation[] | undefined {
		if (gitHubState?.pullRequestUrl) {
			return undefined;
		}

		const hasChanges = (gitState?.outgoingChanges ?? 0) > 0 || (gitState?.uncommittedChanges ?? 0) > 0;
		if (!gitState?.hasGitHubRemote || !hasChanges) {
			return undefined;
		}

		return [
			{
				id: 'create-pr',
				label: localize('agentHost.changeset.createPR', "Create Pull Request"),
				icon: 'git-pull-request-create',
				group: 'pull-request',
				scopes: [ChangesetOperationScope.Changeset],
				status: ChangesetOperationStatus.Idle,
			},
			{
				id: 'create-draft-pr',
				label: localize('agentHost.changeset.createDraftPR', "Create Draft Pull Request"),
				icon: 'git-pull-request-draft',
				group: 'pull-request',
				scopes: [ChangesetOperationScope.Changeset],
				status: ChangesetOperationStatus.Idle,
			},
		] satisfies ChangesetOperation[];
	}

	private _onPullRequestCreated(event: PullRequestCreatedEvent): void {
		const sessionKey = event.sessionKey;

		this._registry?.onDidChangeOperations(sessionKey);
		this._registry?.refreshSessionGitState(sessionKey);

		this._gitStateService.setSessionGitHubState(sessionKey, {
			pullRequestUrl: event.pullRequestUrl
		});
	}
}
