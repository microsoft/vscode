/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../base/common/async.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { localize } from '../../../nls.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import type { IChangesetOperationContribution, IChangesetOperationContext, IChangesetOperationRegistry } from '../common/changesetOperation.js';
import { ChangesetOperationScope, ChangesetOperationStatus, type ChangesetOperation } from '../common/state/sessionState.js';
import { AgentHostPullRequestOperationHandler, type PullRequestCreatedEvent } from './agentHostPullRequestOperationHandler.js';
import { AgentHostStateManager } from './agentHostStateManager.js';

const OPTIMISTIC_PR_CREATED_CACHE_TTL = 30_000;

/**
 * Owns PR-specific changeset operation availability.
 *
 * The optimistic cache is intentionally in-memory only. It hides Create PR
 * immediately after a successful create/reuse while the normal git/session
 * refresh catches up; persisted PR metadata remains out of scope.
 */
export class AgentHostPullRequestOperationContribution extends Disposable implements IChangesetOperationContribution {

	private readonly _optimisticCreatedPullRequests = this._register(new DisposableMap<string>());
	private _registry: IChangesetOperationRegistry | undefined;

	readonly onPullRequestCreated = (event: PullRequestCreatedEvent): void => {
		const key = this._key(event.sessionKey, event.branchName);
		this._optimisticCreatedPullRequests.set(key, disposableTimeout(() => {
			this._optimisticCreatedPullRequests.deleteAndDispose(key);
			this._registry?.onDidChangeOperations(event.sessionKey);
		}, OPTIMISTIC_PR_CREATED_CACHE_TTL));

		this._registry?.onDidChangeOperations(event.sessionKey);
		this._registry?.refreshSessionGitState(event.sessionKey).finally(() => {
			if (this._optimisticCreatedPullRequests.has(key)) {
				this._optimisticCreatedPullRequests.deleteAndDispose(key);
				this._registry?.onDidChangeOperations(event.sessionKey);
			}
		});
	};

	constructor(
		private readonly _stateManager: AgentHostStateManager,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
	}

	registerHandlers(registry: IChangesetOperationRegistry): IDisposable {
		this._registry = registry;
		const store = new DisposableStore();
		const getSessionState = (sessionKey: string) => this._stateManager.getSessionState(sessionKey);
		const createPrHandler = this._instantiationService.createInstance(AgentHostPullRequestOperationHandler, false, getSessionState, this.onPullRequestCreated.bind(this));
		const createDraftPrHandler = this._instantiationService.createInstance(AgentHostPullRequestOperationHandler, true, getSessionState, this.onPullRequestCreated.bind(this));
		store.add(registry.registerChangesetOperationHandler(AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR, createPrHandler));
		store.add(registry.registerChangesetOperationHandler(AgentHostPullRequestOperationHandler.OPERATION_CREATE_DRAFT_PR, createDraftPrHandler));
		store.add({ dispose: () => { this._registry = undefined; } });
		return store;
	}

	getOperations({ sessionKey, gitState }: IChangesetOperationContext): ChangesetOperation[] | undefined {
		if (gitState.branchName && this._optimisticCreatedPullRequests.has(this._key(sessionKey, gitState.branchName))) {
			return undefined;
		}

		const hasChanges = (gitState.outgoingChanges ?? 0) > 0 || (gitState.uncommittedChanges ?? 0) > 0;
		if (!gitState.hasGitHubRemote || !hasChanges) {
			return undefined;
		}

		return [
			{
				id: 'create-pr',
				label: localize('agentHost.changeset.createPR', "Create Pull Request"),
				scopes: [ChangesetOperationScope.Changeset],
				icon: 'git-pull-request',
				status: ChangesetOperationStatus.Idle,
			},
			{
				id: 'create-draft-pr',
				label: localize('agentHost.changeset.createDraftPR', "Create Draft Pull Request"),
				scopes: [ChangesetOperationScope.Changeset],
				icon: 'git-pull-request-draft',
				status: ChangesetOperationStatus.Idle,
			},
		];
	}

	private _key(sessionKey: string, branchName: string): string {
		return `${sessionKey}\n${branchName}`;
	}
}
