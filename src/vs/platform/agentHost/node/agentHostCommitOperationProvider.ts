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

export class AgentHostCommitOperationContribution extends Disposable implements IChangesetOperationContribution {

	constructor(
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
	}

	registerHandlers(registry: IChangesetOperationRegistry): IDisposable {
		const store = new DisposableStore();
		const getSessionState = (sessionKey: string) => this._stateManager.getSessionState(sessionKey);
		const handler = this._instantiationService.createInstance(AgentHostCommitOperationHandler, getSessionState);
		store.add(registry.registerChangesetOperationHandler(AgentHostCommitOperationHandler.OPERATION_COMMIT, handler));
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
}

/**
 * Whether the working directory is checked out on its base branch with no
 * commits ahead of {@link ISessionGitState.baseBranchRef}, the ref the branch
 * changeset diffs the working tree against. The merge base with that ref is
 * then the current commit, so the branch changeset shows exactly the
 * uncommitted changes:
 * - a local base (`refs/heads/<base>`) is the checked-out branch itself, so
 *   neither its upstream nor its outgoing commits matter;
 * - a remote base (`refs/remotes/<remote>/<base>`) must be the branch's
 *   upstream with no outgoing commits. Without that upstream the outgoing
 *   commits are unknown, and committed work could make the branch changeset
 *   show more than Commit commits.
 * Without a base ref, as in git state saved by older builds, the base the
 * branch changeset uses is unknown.
 */
function isOnBaseBranchWithoutOutgoingCommits(gitState: ISessionGitState | undefined): boolean {
	if (!gitState?.branchName || gitState.isDetachedHead || gitState.branchName !== gitState.baseBranchName) {
		return false;
	}
	if (gitState.baseBranchRef === `refs/heads/${gitState.branchName}`) {
		return true;
	}
	return !!gitState.upstreamBranchName
		&& gitState.baseBranchRef === `refs/remotes/${gitState.upstreamBranchName}`
		&& gitState.outgoingChanges === 0;
}
