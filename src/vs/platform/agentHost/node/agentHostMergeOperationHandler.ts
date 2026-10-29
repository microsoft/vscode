/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { isEqual } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { ILogService } from '../../log/common/log.js';
import { AGENT_HOST_MERGE_CHANGESET_OPERATION_ID, IChangesetOperationHandler } from '../common/agentHostChangesetOperationService.js';
import { IAgentHostGitService, tryResolvePrimaryWorktreeRoot } from '../common/agentHostGitService.js';
import { mergeOperationDirtyTargetErrorData, readMergeOperationStashTargetChanges } from '../common/meta/agentMergeOperationMeta.js';
import { parseChangesetUri } from '../common/changesetUri.js';
import type { InvokeChangesetOperationParams, InvokeChangesetOperationResult } from '../common/state/protocol/channels-changeset/commands.js';
import { AHP_SESSION_NOT_FOUND, JsonRpcErrorCodes, ProtocolError } from '../common/state/sessionProtocol.js';
import { hasSessionPullRequestForBranch, readSessionGitHubState, readSessionGitState, type SessionState } from '../common/state/sessionState.js';
import { resolveChangesetOwnerScope } from './agentHostBranchChangesetScope.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';
import type { IAgentHostCredentialSource } from '../common/agentHostCredentials.js';
import { IAgentHostGitHubService } from './agentHostGitHubService.js';

export class AgentHostMergeOperationHandler implements IChangesetOperationHandler {

	static readonly OPERATION_MERGE = AGENT_HOST_MERGE_CHANGESET_OPERATION_ID;

	constructor(
		private readonly _getSessionState: (sessionKey: string) => SessionState | undefined,
		private readonly _resolveBaseBranchName: (sessionKey: string) => Promise<string | undefined>,
		private readonly _onGitStateChanged: (sessionKey: string, source?: IAgentHostCredentialSource) => Promise<void>,
		private readonly _onMerged: (sessionKey: string, commit: string) => Promise<void>,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@ILogService private readonly _logService: ILogService,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostGitHubService private readonly _gitHubService: IAgentHostGitHubService,
	) { }

	captureCredentialSource(params: InvokeChangesetOperationParams, source?: IAgentHostCredentialSource): IAgentHostCredentialSource | undefined {
		const parsed = parseChangesetUri(params.channel);
		const scope = parsed ? resolveChangesetOwnerScope(this._stateManager, parsed.ownerUri) : undefined;
		return scope ? this._gitHubService.captureSessionCredentialSource(scope.sourceUri, source, scope.sessionUri, true) : source;
	}

	async invoke(params: InvokeChangesetOperationParams, token: CancellationToken, source?: IAgentHostCredentialSource): Promise<InvokeChangesetOperationResult> {
		source = this.captureCredentialSource(params, source);
		const parsed = parseChangesetUri(params.channel);
		if (!parsed) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Not a changeset URI: ${params.channel}`);
		}
		this._throwIfCancelled(token);

		const scope = resolveChangesetOwnerScope(this._stateManager, parsed.ownerUri);
		const sessionUri = scope.sessionUri;
		const sessionState = this._getSessionState(scope.sourceUri);
		if (!sessionState) {
			throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session not found: ${sessionUri}`);
		}

		const workingDirectoryValue = scope.workingDirectories[0];
		if (!workingDirectoryValue) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Changeset owner has no working directory: ${parsed.ownerUri}`);
		}
		const workingDirectory = URI.parse(workingDirectoryValue);
		const worktreeRoot = await this._gitService.getRepositoryRoot(workingDirectory);
		const repositoryRoot = worktreeRoot ? await tryResolvePrimaryWorktreeRoot(this._gitService, worktreeRoot) : undefined;
		if (!worktreeRoot || !repositoryRoot || isEqual(worktreeRoot, repositoryRoot)) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, localize('agentHost.changeset.merge.parentMissing', "Could not resolve the parent repository for this worktree."));
		}
		this._throwIfCancelled(token);

		const storedGitState = readSessionGitState(sessionState._meta);
		const targetBranch = await this._resolveBaseBranchName(scope.sourceUri);
		if (!targetBranch) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, localize('agentHost.changeset.merge.targetBranchMissing', "Could not determine the branch to merge into."));
		}
		const gitState = await this._gitService.getSessionGitState(worktreeRoot, targetBranch) ?? storedGitState;
		const sourceBranch = gitState?.branchName ?? await this._gitService.getCurrentBranch(worktreeRoot);
		if (!sourceBranch) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, localize('agentHost.changeset.merge.sourceBranchMissing', "Could not determine the worktree branch."));
		}
		if (sourceBranch === targetBranch) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('agentHost.changeset.merge.sameBranch', "The worktree is already on the target branch '{0}'.", targetBranch));
		}

		const checkedOutTargetBranch = this._gitService.getCurrentBranchName
			? await this._gitService.getCurrentBranchName(repositoryRoot)
			: await this._gitService.getCurrentBranch(repositoryRoot);
		if (checkedOutTargetBranch !== targetBranch) {
			throw new ProtocolError(
				JsonRpcErrorCodes.InvalidParams,
				checkedOutTargetBranch
					? localize('agentHost.changeset.merge.wrongTargetBranch', "The parent repository is on '{0}'. Check out '{1}' there before merging.", checkedOutTargetBranch, targetBranch)
					: localize('agentHost.changeset.merge.detachedTarget', "Check out '{0}' in the parent repository before merging.", targetBranch)
			);
		}
		if (!await this._gitService.branchExists(repositoryRoot, sourceBranch)) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, localize('agentHost.changeset.merge.sourceBranchMissingInParent', "The worktree branch '{0}' does not exist in the parent repository.", sourceBranch));
		}
		// Checked before anything is committed in the worktree, so a dirty parent leaves both repositories untouched.
		let targetStash: string | undefined;
		let overlappingPaths: string[] | undefined;
		if (await this._gitService.hasUncommittedChanges(repositoryRoot)) {
			overlappingPaths = await this._findOverlappingTargetChanges(repositoryRoot, worktreeRoot, targetBranch);
			if (!readMergeOperationStashTargetChanges(params)) {
				throw new ProtocolError(
					JsonRpcErrorCodes.InvalidParams,
					localize('agentHost.changeset.merge.targetDirty', "Commit or stash the changes in the parent repository before merging into '{0}'. Nothing was committed or merged.", targetBranch),
					mergeOperationDirtyTargetErrorData(targetBranch, overlappingPaths),
				);
			}
			this._throwIfCancelled(token);
			targetStash = await this._stashTargetChanges(repositoryRoot, sourceBranch, targetBranch);
		}

		let result: InvokeChangesetOperationResult;
		try {
			result = await this._commitAndMerge(parsed.ownerUri, sessionUri, worktreeRoot, repositoryRoot, sourceBranch, targetBranch, token, source);
		} catch (error) {
			const restoreFailure = targetStash ? await this._restoreTargetChanges(repositoryRoot, targetStash, undefined) : undefined;
			if (restoreFailure) {
				const detail = error instanceof Error ? error.message : String(error);
				throw new ProtocolError(error instanceof ProtocolError ? error.code : JsonRpcErrorCodes.InternalError, `${detail} ${restoreFailure}`);
			}
			throw error;
		}

		if (targetStash) {
			const restoreFailure = await this._restoreTargetChanges(repositoryRoot, targetStash, overlappingPaths);
			if (restoreFailure) {
				throw new ProtocolError(JsonRpcErrorCodes.InternalError, localize('agentHost.changeset.merge.mergedRestoreFailed', "Merged changes from '{0}' into '{1}'. {2}", sourceBranch, targetBranch, restoreFailure));
			}
			return { message: { markdown: localize('agentHost.changeset.merge.mergedAndRestored', "Merged changes from '{0}' into '{1}' and restored the uncommitted changes in the parent repository.", sourceBranch, targetBranch) } };
		}
		return result;
	}

	/**
	 * Returns the parent repository's uncommitted paths (including untracked
	 * files) that the merge also changes, compared against the same baseline
	 * as the session's Branch Changes plus the worktree's uncommitted changes.
	 * Returns `undefined` when they could not be determined.
	 */
	private async _findOverlappingTargetChanges(repositoryRoot: URI, worktreeRoot: URI, targetBranch: string): Promise<string[] | undefined> {
		try {
			const [targetTree, worktreeTree, baseline] = await Promise.all([
				this._gitService.captureWorkingTreeAsTree(repositoryRoot),
				this._gitService.captureWorkingTreeAsTree(worktreeRoot),
				this._gitService.resolveBranchBaselineCommit(worktreeRoot, targetBranch),
			]);
			if (!targetTree || !worktreeTree || !baseline) {
				return undefined;
			}
			const [targetPaths, mergePaths] = await Promise.all([
				this._gitService.diffTreePaths(repositoryRoot, 'HEAD', targetTree),
				this._gitService.diffTreePaths(worktreeRoot, baseline, worktreeTree),
			]);
			if (!targetPaths || !mergePaths) {
				return undefined;
			}
			const mergePathSet = new Set(mergePaths);
			return targetPaths.filter(path => mergePathSet.has(path));
		} catch (error) {
			this._logService.warn(`[AgentHostMergeOperationHandler] Could not compare parent and merge changes: ${error instanceof Error ? error.message : String(error)}`);
			return undefined;
		}
	}

	/**
	 * Stashes the parent repository's tracked and untracked changes and returns
	 * the stash commit, or `undefined` when there was nothing left to stash.
	 */
	private async _stashTargetChanges(repositoryRoot: URI, sourceBranch: string, targetBranch: string): Promise<string | undefined> {
		const previousStash = await this._gitService.revParse(repositoryRoot, 'refs/stash');
		try {
			await this._gitService.createStash(repositoryRoot, {
				message: localize('agentHost.changeset.merge.stashMessage', "Changes in {0} before merging {1}", targetBranch, sourceBranch),
				includeUntracked: true,
			});
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			// `git stash push` records the stash before cleaning the working tree, so a late failure can leave changes only in the stash.
			const partialStash = await this._gitService.revParse(repositoryRoot, 'refs/stash');
			if (partialStash && partialStash !== previousStash) {
				const restoreFailure = await this._restoreTargetChanges(repositoryRoot, partialStash, undefined);
				throw new ProtocolError(JsonRpcErrorCodes.InternalError, restoreFailure
					? localize('agentHost.changeset.merge.stashFailedPartially', "Could not stash the changes in the parent repository, so nothing was committed or merged. Git reported: {0} {1}", detail, restoreFailure)
					: localize('agentHost.changeset.merge.stashFailedRestored', "Could not stash the changes in the parent repository, so nothing was committed or merged, and your changes were restored. Git reported: {0}", detail));
			}
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, localize('agentHost.changeset.merge.stashFailed', "Could not stash the changes in the parent repository. Nothing was committed or merged. Git reported: {0}", detail));
		}
		const stash = await this._gitService.revParse(repositoryRoot, 'refs/stash');
		if (stash && stash !== previousStash) {
			this._logService.info(`[AgentHostMergeOperationHandler] Stashed parent repository changes in ${repositoryRoot.toString()} as ${stash}`);
			return stash;
		}
		if (await this._gitService.hasUncommittedChanges(repositoryRoot)) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, localize('agentHost.changeset.merge.stashMissing', "Could not stash the changes in the parent repository. Nothing was committed or merged."));
		}
		return undefined;
	}

	/**
	 * Restores the stash created by {@link _stashTargetChanges}. Returns a
	 * user-facing explanation when it could not be restored; the stash entry is
	 * then kept so no changes are lost. `overlappingPaths` are the merged paths
	 * the parent had also changed, which is where a restore conflicts.
	 */
	private async _restoreTargetChanges(repositoryRoot: URI, stash: string, overlappingPaths: readonly string[] | undefined): Promise<string | undefined> {
		const latestStash = await this._gitService.revParse(repositoryRoot, 'refs/stash');
		if (latestStash !== stash) {
			this._logService.warn(`[AgentHostMergeOperationHandler] Not restoring ${stash} in ${repositoryRoot.toString()} because the latest stash is ${latestStash ?? 'missing'}`);
			return localize('agentHost.changeset.merge.restoreSkipped', "Your uncommitted changes in the parent repository were not restored automatically. Git kept them in the stash, so nothing is lost; run 'git stash list' in the parent repository to find and restore them.");
		}
		try {
			await this._gitService.popStash(repositoryRoot);
			return undefined;
		} catch (error) {
			this._logService.warn(`[AgentHostMergeOperationHandler] Restoring ${stash} in ${repositoryRoot.toString()} failed: ${error instanceof Error ? error.message : String(error)}`);
			return overlappingPaths?.length
				? localize('agentHost.changeset.merge.restoreConflicted', "Restoring your uncommitted changes in the parent repository conflicted with the merged changes in {0}. Resolve the conflicts there. Git also kept a copy of your changes in the stash, so nothing is lost.", overlappingPaths.join(', '))
				: localize('agentHost.changeset.merge.restoreFailed', "Your uncommitted changes in the parent repository could not be restored automatically. Git kept them in the stash, so nothing is lost; run 'git stash list' in the parent repository to find and restore them.");
		}
	}

	private async _commitAndMerge(ownerUri: string, sessionUri: string, worktreeRoot: URI, repositoryRoot: URI, sourceBranch: string, targetBranch: string, token: CancellationToken, source: IAgentHostCredentialSource | undefined): Promise<InvokeChangesetOperationResult> {
		this._throwIfCancelled(token);

		let didCommit = false;
		let shouldRefresh = false;
		try {
			const hasUncommittedChanges = await this._gitService.hasUncommittedChanges(worktreeRoot);
			this._throwIfPullRequestExists(sessionUri, sourceBranch);
			if (hasUncommittedChanges) {
				await this._gitService.commitAll(worktreeRoot, localize('agentHost.changeset.merge.commitMessage', "Agent Host changes for {0}", sourceBranch));
				didCommit = true;
				shouldRefresh = true;
			}
			this._throwIfCancelled(token);
			this._throwIfPullRequestExists(sessionUri, sourceBranch);

			this._logService.info(`[AgentHostMergeOperationHandler] Merging ${sourceBranch} into ${targetBranch} for ${ownerUri}`);
			try {
				await this._gitService.mergeBranch(repositoryRoot, sourceBranch);
			} catch (error) {
				this._throwIfCancelled(token);
				const detail = error instanceof Error ? error.message : String(error);
				throw new ProtocolError(
					JsonRpcErrorCodes.InternalError,
					didCommit
						? localize('agentHost.changeset.merge.failedAfterCommit', "The worktree changes were committed, but merging into '{0}' failed. Open the parent repository and merge manually. Git reported: {1}", targetBranch, detail)
						: localize('agentHost.changeset.merge.failed', "Failed to merge changes into '{0}'. Open the parent repository and merge manually. Git reported: {1}", targetBranch, detail)
				);
			}
			shouldRefresh = true;
			let mergeCommit: string | undefined;
			try {
				mergeCommit = await this._gitService.revParse(repositoryRoot, 'HEAD');
			} catch (error) {
				throw new ProtocolError(JsonRpcErrorCodes.InternalError, localize('agentHost.changeset.merge.commitLookupFailed', "Changes were merged into '{0}', but the resulting commit could not be recorded: {1}", targetBranch, error instanceof Error ? error.message : String(error)));
			}
			if (!mergeCommit) {
				throw new ProtocolError(JsonRpcErrorCodes.InternalError, localize('agentHost.changeset.merge.commitMissing', "Changes were merged into '{0}', but the resulting commit could not be recorded.", targetBranch));
			}
			await this._onMerged(sessionUri, mergeCommit);
		} finally {
			if (shouldRefresh) {
				try {
					await this._onGitStateChanged(ownerUri, source);
				} catch (error) {
					this._logService.warn(`[AgentHostMergeOperationHandler] Post-merge refresh failed for ${ownerUri}: ${error instanceof Error ? error.message : String(error)}`);
				}
			}
		}

		return { message: { markdown: localize('agentHost.changeset.merge.merged', "Merged changes from '{0}' into '{1}'.", sourceBranch, targetBranch) } };
	}

	private _throwIfPullRequestExists(sessionUri: string, branchName: string): void {
		const sessionState = this._getSessionState(sessionUri);
		const gitHubState = readSessionGitHubState(sessionState?._meta, sessionState?.workingDirectories?.[0]);
		if (hasSessionPullRequestForBranch(gitHubState, branchName)) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('agentHost.changeset.merge.pullRequestExists', "Merge Changes is no longer available because a pull request exists for branch '{0}'.", branchName));
		}
	}

	private _throwIfCancelled(token: CancellationToken): void {
		if (token.isCancellationRequested) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, localize('agentHost.changeset.merge.cancelled', "Merge operation was cancelled."));
		}
	}
}
