/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { isEqual } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import type { IChangesetOperationContribution, IChangesetOperationContext, IChangesetOperationRegistry } from '../common/agentHostChangesetOperationService.js';
import { IAgentHostGitStateService } from '../common/agentHostGitStateService.js';
import { resolveDiffBaseBranchName } from '../common/agentHostGitService.js';
import { ChangesetKind } from '../common/changesetUri.js';
import { SessionConfigKey } from '../common/sessionConfigKeys.js';
import { ChangesetOperationScope, ChangesetOperationStatus, hasSessionPullRequestForBranch, SessionLifecycle, type ChangesetOperation, type SessionState } from '../common/state/sessionState.js';
import { AgentHostMergeOperationHandler } from './agentHostMergeOperationHandler.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';

export class AgentHostMergeOperationContribution extends Disposable implements IChangesetOperationContribution {

	private _registry: IChangesetOperationRegistry | undefined;

	constructor(
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IAgentHostGitStateService private readonly _gitStateService: IAgentHostGitStateService,
	) {
		super();
	}

	registerHandlers(registry: IChangesetOperationRegistry): IDisposable {
		this._registry = registry;
		const store = new DisposableStore();
		const handler = this._instantiationService.createInstance(
			AgentHostMergeOperationHandler,
			(sessionKey: string) => this._stateManager.getSessionState(sessionKey),
			(sessionKey: string) => this._gitStateService.resolveSessionBaseBranchName(sessionKey),
			(sessionKey: string) => this._onGitStateChanged(sessionKey),
			(sessionKey: string, commit: string) => this._gitStateService.recordSessionMerge(sessionKey, commit),
		);
		store.add(registry.registerChangesetOperationHandler(AgentHostMergeOperationHandler.OPERATION_MERGE, handler));
		store.add({ dispose: () => { this._registry = undefined; } });
		return store;
	}

	getOperations({ sessionKey, changesetKind, gitState, gitHubState }: IChangesetOperationContext): ChangesetOperation[] | undefined {
		const state = this._stateManager.getSessionState(sessionKey);
		if (changesetKind !== ChangesetKind.Branch
			|| state?.lifecycle !== SessionLifecycle.Ready
			|| !this._isWorktreeSession(state)) {
			return undefined;
		}

		const branchName = gitState?.branchName;
		const configuredBaseBranch = state.config?.values[SessionConfigKey.Isolation] === 'worktree'
			? state.config.values[SessionConfigKey.Branch]
			: undefined;
		const baseBranchName = typeof configuredBaseBranch === 'string' && configuredBaseBranch.trim()
			? resolveDiffBaseBranchName(configuredBaseBranch.trim(), undefined)
			: resolveDiffBaseBranchName(undefined, gitState?.baseBranchName);
		if (!branchName || !baseBranchName || branchName === baseBranchName || hasSessionPullRequestForBranch(gitHubState, branchName)) {
			return undefined;
		}

		const hasBranchChanges = gitState?.hasBaseBranchChanges ?? (gitState?.outgoingChanges ?? 0) > 0;
		const uncommittedChanges = gitState?.uncommittedChanges ?? 0;
		if (!hasBranchChanges && uncommittedChanges === 0) {
			return undefined;
		}

		return [{
			id: AgentHostMergeOperationHandler.OPERATION_MERGE,
			label: localize('agentHost.changeset.merge', "Merge Changes"),
			description: localize('agentHost.changeset.merge.description', "Commit any uncommitted changes and merge '{0}' into '{1}' in the parent repository.", branchName, baseBranchName),
			confirmation: localize('agentHost.changeset.merge.confirmation', "Merge the worktree changes into the parent repository? Any uncommitted worktree changes will be committed first."),
			icon: 'git-merge',
			group: 'merge',
			scopes: [ChangesetOperationScope.Changeset],
			status: ChangesetOperationStatus.Idle,
		} satisfies ChangesetOperation];
	}

	private _isWorktreeSession(state: SessionState | undefined): boolean {
		if (!state) {
			return false;
		}
		if (state.config?.values[SessionConfigKey.Isolation] === 'worktree') {
			return true;
		}
		const workingDirectory = state.workingDirectories?.[0];
		const project = state.project?.uri;
		return !!workingDirectory && !!project && !isEqual(URI.parse(workingDirectory), URI.parse(project));
	}

	private async _onGitStateChanged(sessionKey: string): Promise<void> {
		this._registry?.onDidChangeOperations(sessionKey);
		await this._registry?.refreshSessionGitState(sessionKey);
	}
}
