/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { localize } from '../../../nls.js';
import type { PullRequestRef } from '../../github/common/githubPullRequestService.js';
import { IGitHubService } from '../../github/common/githubService.js';
import { ILogService } from '../../log/common/log.js';
import { AgentHostPullRequestOperationId, type IChangesetOperationHandler } from '../common/agentHostChangesetOperationService.js';
import { AgentMergeConfigKey, agentMergeRootConfigSchema, defaultAgentMergeConfiguration, resolveMergeMethod } from '../common/agentMerge.js';
import { parseChangesetUri } from '../common/changesetUri.js';
import type { InvokeChangesetOperationParams, InvokeChangesetOperationResult } from '../common/state/protocol/channels-changeset/commands.js';
import { JsonRpcErrorCodes, ProtocolError } from '../common/state/sessionProtocol.js';
import { IAgentConfigurationService } from './agentConfigurationService.js';
import { parsePullRequestUrl } from './agentMergeController.js';
import { IAgentHostPullRequestStatusService, type IAgentHostPullRequestStatus } from './agentHostPullRequestStatusService.js';

/**
 * The pull request lifecycle actions this handler can execute. Each maps 1:1
 * onto a changeset operation advertised by
 * `AgentHostPullRequestOperationContribution`.
 */
export type PullRequestLifecycleAction = 'mark-ready' | 'merge' | 'enable-auto-merge' | 'disable-auto-merge';

/**
 * Server-side handler for the pull request lifecycle operations advertised once
 * a session's branch has a pull request: marking a draft ready, merging,
 * and toggling GitHub's native auto-merge.
 *
 * Unlike `AgentHostPullRequestOperationHandler` — which drives the local git
 * repository before creating a pull request — every action here is a pure
 * GitHub mutation issued through {@link IGitHubService}, so it inherits that
 * service's credential handling, request queueing, and merge-safety gates.
 */
export class AgentHostPullRequestLifecycleOperationHandler implements IChangesetOperationHandler {

	public static readonly OPERATION_MARK_READY = AgentHostPullRequestOperationId.MarkReady;
	public static readonly OPERATION_MERGE = AgentHostPullRequestOperationId.Merge;
	public static readonly OPERATION_ENABLE_AUTO_MERGE = AgentHostPullRequestOperationId.EnableAutoMerge;
	public static readonly OPERATION_DISABLE_AUTO_MERGE = AgentHostPullRequestOperationId.DisableAutoMerge;

	constructor(
		private readonly _action: PullRequestLifecycleAction,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@IAgentHostPullRequestStatusService private readonly _statusService: IAgentHostPullRequestStatusService,
		@IGitHubService private readonly _gitHubService: IGitHubService,
		@ILogService private readonly _logService: ILogService,
	) { }

	async invoke(params: InvokeChangesetOperationParams, token: CancellationToken): Promise<InvokeChangesetOperationResult> {
		const abortController = new AbortController();
		if (token.isCancellationRequested) {
			abortController.abort();
		}
		const cancellationListener = token.onCancellationRequested(() => abortController.abort());
		try {
			return await this._invoke(params, abortController.signal);
		} finally {
			cancellationListener.dispose();
		}
	}

	private async _invoke(params: InvokeChangesetOperationParams, signal: AbortSignal): Promise<InvokeChangesetOperationResult> {
		const parsed = parseChangesetUri(params.channel);
		if (!parsed) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Not a changeset URI: ${params.channel}`);
		}
		const sessionUri = parsed.sessionUri;
		const status = this._statusService.getPullRequestStatus(sessionUri);
		if (!status) {
			this._logService.warn(`[AgentHostPullRequestLifecycleOperationHandler] Rejected '${this._action}': session=${sessionUri}, reason=pull request state is not available`);
			throw new ProtocolError(
				JsonRpcErrorCodes.InvalidParams,
				localize('agentHost.changeset.pr.stateUnknown', "The pull request state is not available yet."),
			);
		}
		this._logService.info(`[AgentHostPullRequestLifecycleOperationHandler] Invoking '${this._action}': session=${sessionUri}, pr=${status.url}, state=${status.state}, draft=${status.draft}, mergeReady=${status.mergeReady}, autoMergeEnabled=${status.autoMergeEnabled}`);
		const ref = await this._resolveRef(status, signal);

		const startedAt = Date.now();
		try {
			const message = await this._runAction(sessionUri, ref, status, signal);
			await this._statusService.refresh(sessionUri);
			return { message };
		} catch (error) {
			this._logService.error(`[AgentHostPullRequestLifecycleOperationHandler] Failed '${this._action}': session=${sessionUri}, pr=${status.url}, durationMs=${Date.now() - startedAt}, error=${error instanceof Error ? error.message : String(error)}`);
			// The advertised operations are derived from cached pull request
			// state, so a rejection usually means that state has drifted. A
			// refresh re-derives the button bar rather than leaving the user on
			// an action GitHub already refuses.
			await this._statusService.refresh(sessionUri);
			throw error;
		}
	}

	private async _runAction(sessionUri: string, ref: PullRequestRef, status: IAgentHostPullRequestStatus, signal: AbortSignal): Promise<string> {
		switch (this._action) {
			case 'mark-ready': {
				await this._gitHubService.mutations.markReadyForReview(ref, { pullRequestId: this._requireNodeId(status) }, signal);
				this._logService.info(`[AgentHostPullRequestLifecycleOperationHandler] Marked pull request ready: session=${sessionUri}, pr=${status.url}`);
				return localize('agentHost.changeset.pr.markedReady', "Pull request is ready for review.");
			}
			case 'enable-auto-merge': {
				const method = this._requireMergeMethod(status.allowedMergeMethods);
				await this._gitHubService.mutations.enableAutoMerge(ref, { pullRequestId: this._requireNodeId(status), method }, signal);
				this._logService.info(`[AgentHostPullRequestLifecycleOperationHandler] Enabled auto-merge: session=${sessionUri}, pr=${status.url}, method=${method}`);
				return localize('agentHost.changeset.pr.autoMergeEnabled', "Auto-merge is enabled. GitHub merges the pull request once it is ready.");
			}
			case 'disable-auto-merge': {
				await this._gitHubService.mutations.disableAutoMerge(ref, { pullRequestId: this._requireNodeId(status) }, signal);
				this._logService.info(`[AgentHostPullRequestLifecycleOperationHandler] Disabled auto-merge: session=${sessionUri}, pr=${status.url}`);
				return localize('agentHost.changeset.pr.autoMergeDisabled', "Auto-merge is disabled.");
			}
			case 'merge':
				return await this._merge(sessionUri, ref, status, signal);
		}
	}

	/**
	 * Merges through the gated preparation flow: `prepareMerge` captures an
	 * authoritative snapshot that the mutation service validates the merge
	 * against, so a pull request that stopped being mergeable between the button
	 * being rendered and clicked is rejected rather than force-merged.
	 */
	private async _merge(sessionUri: string, ref: PullRequestRef, status: IAgentHostPullRequestStatus, signal: AbortSignal): Promise<string> {
		if (!status.headSha) {
			throw new ProtocolError(
				JsonRpcErrorCodes.InternalError,
				localize('agentHost.changeset.pr.headShaMissing', "Could not determine the pull request head commit."),
			);
		}
		const preparation = await this._gitHubService.mutations.prepareMerge(ref, status.headSha, signal);
		// The user clicking the button is the authorization; the id only has to
		// be stable for the lifetime of this single merge.
		const authorization = { confirmed: true as const, authorizationId: generateUuid() };
		const mergeability = preparation.snapshot.mergeability.value;
		this._logService.debug(`[AgentHostPullRequestLifecycleOperationHandler] Merge preparation complete: session=${sessionUri}, pr=${status.url}, headSha=${status.headSha}, mergeQueueRequired=${mergeability?.mergeQueueRequired ?? 'unknown'}, allowedMergeMethods=${mergeability?.allowedMergeMethods.join('|') || 'none'}`);

		if (mergeability?.mergeQueueRequired) {
			const result = await this._gitHubService.mutations.enqueue(preparation, authorization, signal);
			this._logService.info(`[AgentHostPullRequestLifecycleOperationHandler] Pull request enqueued: session=${sessionUri}, pr=${status.url}, outcome=${result.outcome}`);
			return localize('agentHost.changeset.pr.enqueued', "Pull request was added to the merge queue.");
		}

		const method = this._requireMergeMethod(mergeability?.allowedMergeMethods ?? []);
		const result = await this._gitHubService.mutations.merge(preparation, { method, authorization }, signal);
		this._logService.info(`[AgentHostPullRequestLifecycleOperationHandler] Pull request merged: session=${sessionUri}, pr=${status.url}, method=${method}, outcome=${result.outcome}`);
		return localize('agentHost.changeset.pr.merged', "Pull request was merged.");
	}

	/**
	 * Resolves the configured merge method against what the repository allows.
	 */
	private _requireMergeMethod(allowed: readonly ('MERGE' | 'SQUASH' | 'REBASE')[]): 'MERGE' | 'SQUASH' | 'REBASE' {
		const configured = this._configurationService.getRootValue(agentMergeRootConfigSchema, AgentMergeConfigKey.MergeMethod) ?? defaultAgentMergeConfiguration.mergeMethod;
		const method = resolveMergeMethod(configured, allowed);
		if (!method) {
			this._logService.warn(`[AgentHostPullRequestLifecycleOperationHandler] No usable merge method: configured=${configured}, allowedByRepository=${allowed.join('|') || 'none'}`);
			throw new ProtocolError(
				JsonRpcErrorCodes.InternalError,
				localize('agentHost.changeset.pr.noMergeMethod', "The repository does not allow the configured merge method."),
			);
		}
		this._logService.trace(`[AgentHostPullRequestLifecycleOperationHandler] Resolved merge method: configured=${configured}, resolved=${method}, allowedByRepository=${allowed.join('|')}`);
		return method;
	}

	private _requireNodeId(status: IAgentHostPullRequestStatus): string {
		if (!status.pullRequestId) {
			throw new ProtocolError(
				JsonRpcErrorCodes.InternalError,
				localize('agentHost.changeset.pr.nodeIdMissing', "Could not resolve the pull request on GitHub."),
			);
		}
		return status.pullRequestId;
	}

	private async _resolveRef(status: IAgentHostPullRequestStatus, signal: AbortSignal): Promise<PullRequestRef> {
		const parsed = parsePullRequestUrl(status.url);
		if (!parsed) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Not a pull request URL: ${status.url}`);
		}
		const credential = await this._gitHubService.credentials.getCredential(signal);
		if (credential.account.host.toLowerCase() !== parsed.apiHost.toLowerCase()) {
			throw new ProtocolError(
				JsonRpcErrorCodes.InternalError,
				localize('agentHost.changeset.pr.accountMismatch', "The signed in GitHub account does not host this pull request."),
			);
		}
		return { ...credential.account, owner: parsed.owner, repo: parsed.repo, number: parsed.number };
	}
}
