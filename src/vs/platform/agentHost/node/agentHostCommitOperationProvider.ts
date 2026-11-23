/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { localize } from '../../../nls.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import type { IChangesetOperationContribution, IChangesetOperationContext, IChangesetOperationRegistry } from '../common/agentHostChangesetOperationService.js';
import { ChangesetKind, parseChangesetUri } from '../common/changesetUri.js';
import { ChangesetOperationScope, ChangesetOperationStatus, type ChangesetOperation, type ISessionGitState } from '../common/state/sessionState.js';
import { resolveChangesetOwnerScope } from './agentHostBranchChangesetScope.js';
import { AgentHostCommitOperationHandler } from './agentHostCommitOperationHandler.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';
import type { IAgentHostCredentialSource } from '../common/agentHostCredentials.js';

export class AgentHostCommitOperationContribution extends Disposable implements IChangesetOperationContribution {

	private _registry: IChangesetOperationRegistry | undefined;

	constructor(
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
	}

	registerHandlers(registry: IChangesetOperationRegistry): IDisposable {
		this._registry = registry;
		const store = new DisposableStore();
		const getSessionState = (sessionKey: string) => this._stateManager.getSessionState(sessionKey);
		const handler = this._instantiationService.createInstance(AgentHostCommitOperationHandler, getSessionState, (sessionKey: string, source?: IAgentHostCredentialSource) => this._onCommitted(sessionKey, source));
		store.add(registry.registerChangesetOperationHandler(AgentHostCommitOperationHandler.OPERATION_COMMIT, handler));
		store.add({ dispose: () => { this._registry = undefined; } });
		return store;
	}

	getOperations({ sessionKey, ownerKey, changesetUri, changesetKind, gitState }: IChangesetOperationContext): ChangesetOperation[] {
		// Commit always commits every uncommitted change in the working directory,
		// so it is only advertised on changesets that show exactly those changes:
		// the uncommitted changeset, and the branch changeset of a single-repository
		// owner that works directly on its base branch without outgoing commits.
		// A multi-repository branch changeset shows the changes of every repository,
		// while Commit, like the git state, covers only the first one.
		const isCommittableBranchChangeset = changesetKind === ChangesetKind.Branch
			&& isOnBaseBranchWithoutOutgoingCommits(gitState)
			&& resolveChangesetOwnerScope(this._stateManager, ownerKey ?? parseChangesetUri(changesetUri)?.ownerUri ?? sessionKey).workingDirectories.length === 1;
		if (changesetKind !== ChangesetKind.Uncommitted && !isCommittableBranchChangeset) {
			return [];
		}

		const isNewSession = this._stateManager.isUnusedDraft(sessionKey) === true;
		if (!isNewSession && (gitState?.uncommittedChanges ?? 0) <= 0) {
			return [];
		}

		return [{
			id: AgentHostCommitOperationHandler.OPERATION_COMMIT,
			label: localize('agentHost.changeset.commit', "Commit"),
			icon: 'git-commit',
			group: 'commit',
			scopes: [ChangesetOperationScope.Changeset],
			status: ChangesetOperationStatus.Idle,
		} satisfies ChangesetOperation];
	}

	private async _onCommitted(sessionKey: string, source?: IAgentHostCredentialSource): Promise<void> {
		this._registry?.onDidChangeOperations(sessionKey);
		await this._registry?.refreshSessionGitState(sessionKey, source);
	}
}

/**
 * Whether the working directory is checked out on its base branch, tracks the
 * base branch on `origin`, and has no commits ahead of it. The branch changeset
 * diffs the working tree against the merge base with `origin/<base>`, which is
 * then the current commit, so it shows exactly the uncommitted changes. Without
 * that upstream the outgoing commits are unknown, and committed work could make
 * the branch changeset show more than Commit commits.
 */
function isOnBaseBranchWithoutOutgoingCommits(gitState: ISessionGitState | undefined): boolean {
	return !!gitState?.branchName
		&& !gitState.isDetachedHead
		&& gitState.branchName === gitState.baseBranchName
		&& gitState.upstreamBranchName === `origin/${gitState.baseBranchName}`
		&& gitState.outgoingChanges === 0;
}
