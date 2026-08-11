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
import { IAgentHostGitService, META_DIFF_BASE_BRANCH, resolveDiffBaseBranchName, tryResolvePrimaryWorktreeRoot } from '../common/agentHostGitService.js';
import { parseChangesetUri } from '../common/changesetUri.js';
import { ISessionDataService } from '../common/sessionDataService.js';
import { SessionConfigKey } from '../common/sessionConfigKeys.js';
import type { InvokeChangesetOperationParams, InvokeChangesetOperationResult } from '../common/state/protocol/channels-changeset/commands.js';
import { AHP_SESSION_NOT_FOUND, JsonRpcErrorCodes, ProtocolError } from '../common/state/sessionProtocol.js';
import { readSessionGitState, type ISessionGitState, type SessionState } from '../common/state/sessionState.js';
import { getRemoteTrackingRef } from './agentHostGitService.js';

export class AgentHostMergeOperationHandler implements IChangesetOperationHandler {

	static readonly OPERATION_MERGE = AGENT_HOST_MERGE_CHANGESET_OPERATION_ID;

	constructor(
		private readonly _getSessionState: (sessionKey: string) => SessionState | undefined,
		private readonly _onGitStateChanged: (sessionKey: string) => Promise<void>,
		private readonly _onMerged: (sessionKey: string, commit: string) => Promise<void>,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@ILogService private readonly _logService: ILogService,
	) { }

	async invoke(params: InvokeChangesetOperationParams, token: CancellationToken): Promise<InvokeChangesetOperationResult> {
		const parsed = parseChangesetUri(params.channel);
		if (!parsed) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Not a changeset URI: ${params.channel}`);
		}
		this._throwIfCancelled(token);

		const sessionUri = parsed.sessionUri;
		const sessionState = this._getSessionState(sessionUri);
		if (!sessionState) {
			throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session not found: ${sessionUri}`);
		}

		const workingDirectoryValue = sessionState.workingDirectories?.[0];
		if (!workingDirectoryValue) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Session has no working directory: ${sessionUri}`);
		}
		const workingDirectory = URI.parse(workingDirectoryValue);
		const worktreeRoot = await this._gitService.getRepositoryRoot(workingDirectory);
		const repositoryRoot = worktreeRoot ? await tryResolvePrimaryWorktreeRoot(this._gitService, worktreeRoot) : undefined;
		if (!worktreeRoot || !repositoryRoot || isEqual(worktreeRoot, repositoryRoot)) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, localize('agentHost.changeset.merge.parentMissing', "Could not resolve the parent repository for this worktree."));
		}
		this._throwIfCancelled(token);

		const gitState = await this._gitService.getSessionGitState(worktreeRoot) ?? readSessionGitState(sessionState._meta);
		const sourceBranch = gitState?.branchName ?? await this._gitService.getCurrentBranch(worktreeRoot);
		if (!sourceBranch) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, localize('agentHost.changeset.merge.sourceBranchMissing', "Could not determine the worktree branch."));
		}
		const targetBranch = await this._resolveTargetBranch(sessionUri, sessionState, gitState);
		if (!targetBranch) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, localize('agentHost.changeset.merge.targetBranchMissing', "Could not determine the branch to merge into."));
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
		if (await this._gitService.hasUncommittedChanges(repositoryRoot)) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('agentHost.changeset.merge.targetDirty', "Commit or stash the changes in the parent repository before merging into '{0}'.", targetBranch));
		}
		this._throwIfCancelled(token);

		let didCommit = false;
		let shouldRefresh = false;
		try {
			if (await this._gitService.hasUncommittedChanges(worktreeRoot)) {
				await this._gitService.commitAll(worktreeRoot, localize('agentHost.changeset.merge.commitMessage', "Agent Host changes for {0}", sourceBranch));
				didCommit = true;
				shouldRefresh = true;
			}
			this._throwIfCancelled(token);

			this._logService.info(`[AgentHostMergeOperationHandler] Merging ${sourceBranch} into ${targetBranch} for session ${sessionUri}`);
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
					await this._onGitStateChanged(sessionUri);
				} catch (error) {
					this._logService.warn(`[AgentHostMergeOperationHandler] Post-merge refresh failed for session ${sessionUri}: ${error instanceof Error ? error.message : String(error)}`);
				}
			}
		}

		return { message: { markdown: localize('agentHost.changeset.merge.merged', "Merged changes from '{0}' into '{1}'.", sourceBranch, targetBranch) } };
	}

	private async _resolveTargetBranch(sessionUri: string, sessionState: SessionState, gitState: ISessionGitState | undefined): Promise<string | undefined> {
		const configuredBranch = sessionState.config?.values[SessionConfigKey.Branch];
		if (typeof configuredBranch === 'string' && configuredBranch.trim()) {
			return configuredBranch.trim();
		}

		const databaseRef = this._sessionDataService.openDatabase(URI.parse(sessionUri));
		let persistedBaseBranch: string | undefined;
		try {
			persistedBaseBranch = await databaseRef.object.getMetadata(META_DIFF_BASE_BRANCH);
		} finally {
			databaseRef.dispose();
		}

		const baseBranch = resolveDiffBaseBranchName(persistedBaseBranch, gitState?.baseBranchName);
		return baseBranch ? getRemoteTrackingRef(baseBranch)?.branchName : undefined;
	}

	private _throwIfCancelled(token: CancellationToken): void {
		if (token.isCancellationRequested) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, localize('agentHost.changeset.merge.cancelled', "Merge operation was cancelled."));
		}
	}
}
