/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { GITHUB_REPO_PROTECTED_RESOURCE, IAgentService } from '../common/agentService.js';
import { parseChangesetUri } from '../common/changesetUri.js';
import { AHP_AUTH_REQUIRED, AHP_SESSION_NOT_FOUND, JsonRpcErrorCodes, ProtocolError } from '../common/state/sessionProtocol.js';
import { readSessionGitState, type ChangesetOperationFollowUp, type SessionState } from '../common/state/sessionState.js';
import { ILogService } from '../../log/common/log.js';
import { IAgentHostGitService } from './agentHostGitService.js';
import { type IChangesetOperationHandler } from '../common/changesetOperation.js';
import { IAgentHostOctoKitService } from './shared/agentHostOctoKitService.js';
import type { InvokeChangesetOperationParams, InvokeChangesetOperationResult } from '../common/state/protocol/channels-changeset/commands.js';

export interface PullRequestCreatedEvent {
	readonly sessionKey: string;
	readonly branchName: string;
}

/**
 * Server-side handler for the `create-pr` and `create-draft-pr` changeset
 * operations advertised on git-backed sessions whose working directory has
 * a GitHub remote. Operation availability is recomputed by
 * `AgentHostChangesetOperationContributionService.updateOperations`.
 *
 * The flow mirrors the Copilot CLI extension's `createPullRequest` helper
 * (`extensions/copilot/src/extension/chatSessions/vscode-node/copilotCLIChatSessionsContribution.ts`):
 *
 * 1. Resolve session → working directory + current/base branch from
 *    {@link ISessionGitState}.
 * 2. Commit any uncommitted working-tree changes.
 * 3. Push the current branch to `origin` (with `--set-upstream` when missing).
 * 4. Resolve `owner` / `repo` from {@link ISessionGitState.githubOwner}
 *    / {@link ISessionGitState.githubRepo} (populated by the git probe).
 * 5. Reuse an existing PR for the branch, or POST `/repos/{owner}/{repo}/pulls`
 *    via {@link IAgentHostOctoKitService}.
 * 6. Return the PR URL as an {@link InvokeChangesetOperationResult.followUp}.
 */
export class AgentHostPullRequestOperationHandler implements IChangesetOperationHandler {

	public static readonly OPERATION_CREATE_PR = 'create-pr';
	public static readonly OPERATION_CREATE_DRAFT_PR = 'create-draft-pr';

	constructor(
		private readonly _draft: boolean,
		private readonly _getSessionState: (sessionKey: string) => SessionState | undefined,
		private readonly _onPullRequestCreated: (event: PullRequestCreatedEvent) => void,
		@IAgentService private readonly _agentService: IAgentService,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@IAgentHostOctoKitService private readonly _octoKitService: IAgentHostOctoKitService,
		@ILogService private readonly _logService: ILogService,
	) { }

	async invoke(params: InvokeChangesetOperationParams, token: CancellationToken): Promise<InvokeChangesetOperationResult> {
		const abortController = new AbortController();
		if (token.isCancellationRequested) {
			abortController.abort();
		}
		const cancellationListener = token.onCancellationRequested(() => abortController.abort());
		try {
			return await this._invoke(params, token, abortController.signal);
		} finally {
			cancellationListener.dispose();
		}
	}

	private async _invoke(params: InvokeChangesetOperationParams, token: CancellationToken, signal: AbortSignal): Promise<InvokeChangesetOperationResult> {
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

		const workingDirectoryStr = sessionState.summary.workingDirectory;
		if (!workingDirectoryStr) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Session has no working directory: ${sessionUri}`);
		}
		const workingDirectory = URI.parse(workingDirectoryStr);

		const gitState = readSessionGitState(sessionState._meta);
		if (!gitState?.hasGitHubRemote || !gitState.githubOwner || !gitState.githubRepo) {
			throw new ProtocolError(
				JsonRpcErrorCodes.InternalError,
				`Session's working directory is not a GitHub-backed git repo: ${sessionUri}`,
			);
		}

		const branchName = gitState.branchName ?? await this._gitService.getCurrentBranch(workingDirectory);
		if (!branchName) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Could not determine current branch for ${workingDirectory}`);
		}

		const baseBranchName = gitState.baseBranchName ?? await this._gitService.getDefaultBranch(workingDirectory);
		if (!baseBranchName) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Could not determine base branch for ${workingDirectory}`);
		}
		// `getDefaultBranch` may return `origin/<branch>` — `pulls` API wants the bare name.
		const base = baseBranchName.startsWith('origin/') ? baseBranchName.substring('origin/'.length) : baseBranchName;

		const authToken = this._agentService.getAuthToken(GITHUB_REPO_PROTECTED_RESOURCE);
		if (!authToken) {
			throw new ProtocolError(
				AHP_AUTH_REQUIRED,
				localize('agentHost.changeset.pr.authRequired', "Sign in to GitHub with repository access to create a pull request."),
				[GITHUB_REPO_PROTECTED_RESOURCE],
			);
		}

		const hasUncommitted = await this._gitService.hasUncommittedChanges(workingDirectory);
		if (hasUncommitted) {
			this._throwIfCancelled(token);
			this._logService.info(`[AgentHostPullRequestOperationHandler] Committing uncommitted changes for session ${sessionUri}`);
			try {
				await this._gitService.commitAll(workingDirectory, this._formatCommitMessage(branchName));
			} catch (err) {
				this._throwIfCancelled(token);
				throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Failed to commit changes before creating a pull request: ${err instanceof Error ? err.message : String(err)}`);
			}
		}
		this._throwIfCancelled(token);

		const branchChanges = await this._gitService.computeSessionFileDiffs(workingDirectory, { sessionUri, baseBranch: base });
		if (branchChanges === undefined) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, localize('agentHost.changeset.pr.computeChangesFailed', "Could not compute branch changes to create a pull request."));
		}
		if (branchChanges !== undefined && branchChanges.length === 0) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, localize('agentHost.changeset.pr.noChanges', "There are no branch changes to create a pull request for."));
		}
		this._throwIfCancelled(token);

		this._logService.info(`[AgentHostPullRequestOperationHandler] Pushing branch ${branchName} for session ${sessionUri}`);
		const upstreamPresent = await this._gitService.hasUpstream(workingDirectory, branchName);
		this._throwIfCancelled(token);
		try {
			await this._gitService.pushBranch(workingDirectory, branchName, !upstreamPresent);
		} catch (err) {
			this._throwIfCancelled(token);
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Failed to push branch '${branchName}': ${err instanceof Error ? err.message : String(err)}`);
		}
		this._throwIfCancelled(token);

		const title = this._formatTitle(branchName);
		const body = this._formatBody(branchName, base);

		const existing = await this._octoKitService.findPullRequestByHeadBranch(gitState.githubOwner, gitState.githubRepo, branchName, authToken, signal);
		if (existing) {
			this._throwIfCancelled(token);
			this._onPullRequestCreated({ sessionKey: sessionUri, branchName });
			return this._createResult(existing, localize('agentHost.changeset.pr.existing', "Pull request [#{0}]({1}) already exists.", existing.number, existing.url));
		}
		this._throwIfCancelled(token);

		this._logService.info(`[AgentHostPullRequestOperationHandler] Creating ${this._draft ? 'draft ' : ''}PR ${gitState.githubOwner}/${gitState.githubRepo} ${branchName} -> ${base}`);
		let created: { readonly url: string; readonly number: number };
		try {
			created = await this._octoKitService.createPullRequest(
				gitState.githubOwner,
				gitState.githubRepo,
				title,
				body,
				branchName,
				base,
				this._draft,
				authToken,
				signal,
			);
		} catch (err) {
			this._throwIfCancelled(token);
			let foundAfterFailure: { readonly url: string; readonly number: number } | undefined;
			try {
				foundAfterFailure = await this._octoKitService.findPullRequestByHeadBranch(gitState.githubOwner, gitState.githubRepo, branchName, authToken, signal);
			} catch {
				this._throwIfCancelled(token);
				throw err;
			}
			if (foundAfterFailure) {
				this._throwIfCancelled(token);
				this._onPullRequestCreated({ sessionKey: sessionUri, branchName });
				return this._createResult(foundAfterFailure, localize('agentHost.changeset.pr.existing', "Pull request [#{0}]({1}) already exists.", foundAfterFailure.number, foundAfterFailure.url));
			}
			throw err;
		}
		this._throwIfCancelled(token);
		const message = this._draft
			? localize('agentHost.changeset.pr.createdDraft', "Created draft pull request [#{0}]({1}).", created.number, created.url)
			: localize('agentHost.changeset.pr.created', "Created pull request [#{0}]({1}).", created.number, created.url);

		this._onPullRequestCreated({ sessionKey: sessionUri, branchName });
		return this._createResult(created, message);
	}

	private _throwIfCancelled(token: CancellationToken): void {
		if (token.isCancellationRequested) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, localize('agentHost.changeset.pr.cancelled', "Pull request operation was cancelled."));
		}
	}

	private _formatTitle(branchName: string): string {
		// Beautify a branch name like `feat/foo-bar` into `feat: foo bar`.
		const idx = branchName.indexOf('/');
		if (idx > 0 && idx < branchName.length - 1) {
			const prefix = branchName.substring(0, idx);
			const rest = branchName.substring(idx + 1).replace(/[-_]+/g, ' ');
			return `${prefix}: ${rest}`;
		}
		return branchName.replace(/[-_]+/g, ' ');
	}

	private _formatCommitMessage(branchName: string): string {
		return localize('agentHost.changeset.pr.commitMessage', "Agent Host changes for {0}", branchName);
	}

	private _formatBody(branchName: string, baseBranchName: string): string {
		return localize('agentHost.changeset.pr.body', "Created from `{0}` targeting `{1}`.", branchName, baseBranchName);
	}

	private _createResult(created: { readonly url: string; readonly number: number }, message: string): InvokeChangesetOperationResult {
		const followUp: ChangesetOperationFollowUp = {
			content: { uri: created.url, contentType: 'text/html' },
			external: true,
		};
		return { message: { markdown: message }, followUp };
	}
}
