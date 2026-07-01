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
		const onCreated = (event: PullRequestCreatedEvent) => this._onPullRequestCreated(event);
		const createPrHandler = this._instantiationService.createInstance(AgentHostPullRequestOperationHandler, false, undefined, getSessionState, onCreated);
		const createDraftPrHandler = this._instantiationService.createInstance(AgentHostPullRequestOperationHandler, true, undefined, getSessionState, onCreated);
		const createAutoMergePrHandler = this._instantiationService.createInstance(AgentHostPullRequestOperationHandler, false, 'MERGE', getSessionState, onCreated);
		const createAutoSquashPrHandler = this._instantiationService.createInstance(AgentHostPullRequestOperationHandler, false, 'SQUASH', getSessionState, onCreated);
		const createAutoRebasePrHandler = this._instantiationService.createInstance(AgentHostPullRequestOperationHandler, false, 'REBASE', getSessionState, onCreated);
		store.add(registry.registerChangesetOperationHandler(AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR, createPrHandler));
		store.add(registry.registerChangesetOperationHandler(AgentHostPullRequestOperationHandler.OPERATION_CREATE_DRAFT_PR, createDraftPrHandler));
		store.add(registry.registerChangesetOperationHandler(AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR_AUTO_MERGE, createAutoMergePrHandler));
		store.add(registry.registerChangesetOperationHandler(AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR_AUTO_SQUASH, createAutoSquashPrHandler));
		store.add(registry.registerChangesetOperationHandler(AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR_AUTO_REBASE, createAutoRebasePrHandler));
		store.add({ dispose: () => { this._registry = undefined; } });
		return store;
	}

	getOperations({ gitState, gitHubState }: IChangesetOperationContext): ChangesetOperation[] | undefined {
		if (gitHubState?.pullRequestUrl) {
			return undefined;
		}

		const outgoingChanges = gitState?.outgoingChanges ?? 0;
		const uncommittedChanges = gitState?.uncommittedChanges ?? 0;
		const hasChanges = outgoingChanges > 0 || uncommittedChanges > 0;
		if (!gitState?.hasGitHubRemote || !hasChanges) {
			return undefined;
		}

		return [{
			id: 'create-pr',
			label: localize('agentHost.changeset.createPR', "Create Pull Request"),
			icon: 'git-pull-request-create',
			group: 'pull-request',
			scopes: [ChangesetOperationScope.Changeset],
			status: ChangesetOperationStatus.Idle,
		},
		{
			id: 'create-pr-auto-merge',
			label: localize('agentHost.changeset.createPRAutoMerge', "Create Pull Request (Auto-Merge)"),
			icon: 'git-merge',
			group: 'pull-request',
			scopes: [ChangesetOperationScope.Changeset],
			status: ChangesetOperationStatus.Idle,
		},
		{
			id: 'create-pr-auto-squash',
			label: localize('agentHost.changeset.createPRAutoSquash', "Create Pull Request (Auto-Squash)"),
			icon: 'git-merge',
			group: 'pull-request',
			scopes: [ChangesetOperationScope.Changeset],
			status: ChangesetOperationStatus.Idle,
		},
		{
			id: 'create-pr-auto-rebase',
			label: localize('agentHost.changeset.createPRAutoRebase', "Create Pull Request (Auto-Rebase)"),
			icon: 'git-merge',
			group: 'pull-request',
			scopes: [ChangesetOperationScope.Changeset],
			status: ChangesetOperationStatus.Idle,
		},
		{
			id: 'create-draft-pr',
			label: localize('agentHost.changeset.createDraftPR', "Create Draft Pull Request"),
			icon: 'git-pull-request-draft',
			group: 'pull-request_draft',
			scopes: [ChangesetOperationScope.Changeset],
			status: ChangesetOperationStatus.Idle,
		}] satisfies ChangesetOperation[];
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
