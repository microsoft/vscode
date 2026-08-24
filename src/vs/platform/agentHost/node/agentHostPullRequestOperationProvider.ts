/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { localize } from '../../../nls.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import type { IChangesetOperationContribution, IChangesetOperationContext, IChangesetOperationRegistry } from '../common/agentHostChangesetOperationService.js';
import { IAgentHostGitStateService } from '../common/agentHostGitStateService.js';
import { ChangesetOperationScope, ChangesetOperationStatus, hasSessionPullRequestForBranch, readSessionGitHubState, SessionLifecycle, withMostRecentRelatedSessionPullRequest, type ChangesetOperation } from '../common/state/sessionState.js';
import { AgentHostPullRequestOperationHandler, type PullRequestCreatedEvent } from './agentHostPullRequestOperationHandler.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';

export class AgentHostPullRequestOperationContribution extends Disposable implements IChangesetOperationContribution {

	private _registry: IChangesetOperationRegistry | undefined;

	constructor(
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IAgentHostGitStateService private readonly _gitStateService: IAgentHostGitStateService
	) {
		super();
	}

	registerHandlers(registry: IChangesetOperationRegistry): IDisposable {
		this._registry = registry;
		const store = new DisposableStore();
		const getSessionState = (sessionKey: string) => this._stateManager.getSessionState(sessionKey);
		const resolveBaseBranchName = (sessionKey: string) => this._gitStateService.resolveSessionBaseBranchName(sessionKey);
		const onCreated = (event: PullRequestCreatedEvent) => this._onPullRequestCreated(event);
		const createPrHandler = this._instantiationService.createInstance(AgentHostPullRequestOperationHandler, false, undefined, getSessionState, resolveBaseBranchName, onCreated);
		const createDraftPrHandler = this._instantiationService.createInstance(AgentHostPullRequestOperationHandler, true, undefined, getSessionState, resolveBaseBranchName, onCreated);
		const createAutoMergePrHandler = this._instantiationService.createInstance(AgentHostPullRequestOperationHandler, false, 'MERGE', getSessionState, resolveBaseBranchName, onCreated);
		const createAutoSquashPrHandler = this._instantiationService.createInstance(AgentHostPullRequestOperationHandler, false, 'SQUASH', getSessionState, resolveBaseBranchName, onCreated);
		const createAutoRebasePrHandler = this._instantiationService.createInstance(AgentHostPullRequestOperationHandler, false, 'REBASE', getSessionState, resolveBaseBranchName, onCreated);
		store.add(registry.registerChangesetOperationHandler(AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR, createPrHandler));
		store.add(registry.registerChangesetOperationHandler(AgentHostPullRequestOperationHandler.OPERATION_CREATE_DRAFT_PR, createDraftPrHandler));
		store.add(registry.registerChangesetOperationHandler(AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR_AUTO_MERGE, createAutoMergePrHandler));
		store.add(registry.registerChangesetOperationHandler(AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR_AUTO_SQUASH, createAutoSquashPrHandler));
		store.add(registry.registerChangesetOperationHandler(AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR_AUTO_REBASE, createAutoRebasePrHandler));
		store.add({ dispose: () => { this._registry = undefined; } });
		return store;
	}

	getOperations({ sessionKey, gitState, gitHubState }: IChangesetOperationContext): ChangesetOperation[] | undefined {
		// New Session
		const state = this._stateManager.getSessionState(sessionKey);
		if (state?.lifecycle === SessionLifecycle.Creating) {
			return undefined;
		}

		// Pull request already exists for the currently checked out branch
		if (hasSessionPullRequestForBranch(gitHubState, gitState?.branchName)) {
			return undefined;
		}

		const hasBranchChanges = gitState?.hasBaseBranchChanges ?? (gitState?.outgoingChanges ?? 0) > 0;
		const uncommittedChanges = gitState?.uncommittedChanges ?? 0;
		const hasChanges = hasBranchChanges || uncommittedChanges > 0;
		if (!gitState?.hasGitHubRemote || !hasChanges) {
			return undefined;
		}

		return [{
			id: 'create-pr',
			label: localize('agentHost.changeset.createPR', "Create PR"),
			icon: 'git-pull-request-create',
			group: 'pull-request',
			scopes: [ChangesetOperationScope.Changeset],
			status: ChangesetOperationStatus.Idle,
		},
		{
			id: 'create-pr-auto-merge',
			label: localize('agentHost.changeset.createPRAutoMerge', "Create PR (Auto-Merge)"),
			icon: 'git-merge',
			group: 'pull-request',
			scopes: [ChangesetOperationScope.Changeset],
			status: ChangesetOperationStatus.Idle,
		},
		{
			id: 'create-pr-auto-squash',
			label: localize('agentHost.changeset.createPRAutoSquash', "Create PR (Auto-Squash)"),
			icon: 'git-merge',
			group: 'pull-request',
			scopes: [ChangesetOperationScope.Changeset],
			status: ChangesetOperationStatus.Idle,
		},
		{
			id: 'create-pr-auto-rebase',
			label: localize('agentHost.changeset.createPRAutoRebase', "Create PR (Auto-Rebase)"),
			icon: 'git-merge',
			group: 'pull-request',
			scopes: [ChangesetOperationScope.Changeset],
			status: ChangesetOperationStatus.Idle,
		},
		{
			id: 'create-draft-pr',
			label: localize('agentHost.changeset.createDraftPR', "Create Draft PR"),
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

		const gitHubState = readSessionGitHubState(this._stateManager.getSessionState(sessionKey)?._meta);
		this._gitStateService.setSessionGitHubState(sessionKey, withMostRecentRelatedSessionPullRequest(gitHubState, event.pullRequestUrl, event.branchName));
	}
}
