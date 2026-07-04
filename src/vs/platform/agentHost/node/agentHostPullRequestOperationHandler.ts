/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { GITHUB_COPILOT_PROTECTED_RESOURCE, GITHUB_REPO_PROTECTED_RESOURCE, IAgentService } from '../common/agentService.js';
import { parseChangesetUri } from '../common/changesetUri.js';
import { AHP_AUTH_REQUIRED, AHP_SESSION_NOT_FOUND, JsonRpcErrorCodes, ProtocolError } from '../common/state/sessionProtocol.js';
import { readSessionGitHubState, readSessionGitState, type ChangesetOperationFollowUp, type ISessionFileDiff, type ISessionWithDefaultChat } from '../common/state/sessionState.js';
import { ILogService } from '../../log/common/log.js';
import { IAgentHostGitService } from '../common/agentHostGitService.js';
import { type IChangesetOperationHandler } from '../common/agentHostChangesetOperationService.js';
import { type AutoMergeMethod, type CreatedPullRequest, IAgentHostOctoKitService } from './shared/agentHostOctoKitService.js';
import type { InvokeChangesetOperationParams, InvokeChangesetOperationResult } from '../common/state/protocol/channels-changeset/commands.js';
import { ICopilotApiService, type ICopilotUtilityChatMessage } from './shared/copilotApiService.js';
import { buildConversationContext } from '../common/agentHostConversationContext.js';

/**
 * Soft upper bound, in characters, for the conversation context fed to the
 * utility model when generating a PR title and description. Sized to stay
 * within the small model's context window while leaving room for the changed
 * file summary and prompt scaffolding.
 */
const MAX_PR_CONVERSATION_CONTEXT_CHARS = 12_000;

/**
 * Soft upper bound, in characters, for the changed-file summary fed to the
 * utility model when generating a PR title and description.
 */
const MAX_PR_CHANGE_SUMMARY_CHARS = 4_000;

export interface PullRequestCreatedEvent {
	readonly sessionKey: string;
	readonly pullRequestUrl: string;
}

/**
 * Server-side handler for the `create-pr` and `create-draft-pr` changeset
 * operations advertised on git-backed sessions whose working directory has
 * a GitHub remote. Operation availability is recomputed by
 * `AgentHostChangesetOperationService.updateOperations`.
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
	public static readonly OPERATION_CREATE_PR_AUTO_MERGE = 'create-pr-auto-merge';
	public static readonly OPERATION_CREATE_PR_AUTO_SQUASH = 'create-pr-auto-squash';
	public static readonly OPERATION_CREATE_PR_AUTO_REBASE = 'create-pr-auto-rebase';

	constructor(
		private readonly _draft: boolean,
		private readonly _autoMergeMethod: AutoMergeMethod | undefined,
		private readonly _getSessionState: (sessionKey: string) => ISessionWithDefaultChat | undefined,
		private readonly _onPullRequestCreated: (event: PullRequestCreatedEvent) => void,
		@IAgentService private readonly _agentService: IAgentService,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@IAgentHostOctoKitService private readonly _octoKitService: IAgentHostOctoKitService,
		@ICopilotApiService private readonly _copilotApiService: ICopilotApiService,
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

		const workingDirectoryStr = sessionState.workingDirectory;
		if (!workingDirectoryStr) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Session has no working directory: ${sessionUri}`);
		}

		const gitHubState = readSessionGitHubState(sessionState._meta);
		if (!gitHubState?.owner || !gitHubState?.repo) {
			throw new ProtocolError(
				JsonRpcErrorCodes.InternalError,
				`Session's working directory is not a GitHub-backed git repo: ${sessionUri}`,
			);
		}

		const workingDirectory = URI.parse(workingDirectoryStr);
		const gitState = readSessionGitState(sessionState._meta);
		const branchName = gitState?.branchName ?? await this._gitService.getCurrentBranch(workingDirectory);
		if (!branchName) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Could not determine current branch for ${workingDirectory}`);
		}

		const baseBranchName = gitState?.baseBranchName ?? await this._gitService.getDefaultBranch(workingDirectory);
		if (!baseBranchName) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Could not determine base branch for ${workingDirectory}`);
		}
		// `getDefaultBranch` may return `origin/<branch>` — `pulls` API wants the bare name.
		const base = baseBranchName.startsWith('origin/') ? baseBranchName.substring('origin/'.length) : baseBranchName;

		const authToken = this._agentService.getAuthToken({
			resource: GITHUB_REPO_PROTECTED_RESOURCE.resource,
			scopes: GITHUB_REPO_PROTECTED_RESOURCE.scopes_supported,
		});
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
			await this._gitService.push(workingDirectory, { ref: branchName, setUpstream: !upstreamPresent });
		} catch (err) {
			this._throwIfCancelled(token);
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Failed to push branch '${branchName}': ${err instanceof Error ? err.message : String(err)}`);
		}
		this._throwIfCancelled(token);

		const existing = await this._octoKitService.findPullRequestByHeadBranch(gitHubState.owner, gitHubState.repo, branchName, authToken, signal);
		if (existing) {
			this._throwIfCancelled(token);
			return await this._finalize(existing, true, sessionUri, gitHubState.owner, gitHubState.repo, authToken, signal, token);
		}
		this._throwIfCancelled(token);

		const generated = await this._generateTitleAndDescription(sessionState, branchName, base, branchChanges, signal, token);
		this._throwIfCancelled(token);
		const title = generated?.title ?? this._formatTitle(branchName);
		const body = generated?.description ?? this._formatBody(branchName, base);

		this._logService.info(`[AgentHostPullRequestOperationHandler] Creating ${this._draft ? 'draft ' : ''}PR ${gitHubState.owner}/${gitHubState.repo} ${branchName} -> ${base}`);
		let created: CreatedPullRequest;
		try {
			created = await this._octoKitService.createPullRequest(
				gitHubState.owner,
				gitHubState.repo,
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
			let foundAfterFailure: CreatedPullRequest | undefined;
			try {
				foundAfterFailure = await this._octoKitService.findPullRequestByHeadBranch(gitHubState.owner, gitHubState.repo, branchName, authToken, signal);
			} catch {
				this._throwIfCancelled(token);
				throw err;
			}
			if (foundAfterFailure) {
				this._throwIfCancelled(token);
				return await this._finalize(foundAfterFailure, true, sessionUri, gitHubState.owner, gitHubState.repo, authToken, signal, token);
			}
			throw err;
		}
		this._throwIfCancelled(token);
		return await this._finalize(created, false, sessionUri, gitHubState.owner, gitHubState.repo, authToken, signal, token);
	}

	/**
	 * Notifies listeners that the pull request now exists, optionally enables
	 * auto-merge with the configured {@link AutoMergeMethod} (best-effort: a
	 * failure to enable auto-merge does not fail the operation), and builds the
	 * result message describing what happened.
	 */
	private async _finalize(
		pr: CreatedPullRequest,
		isExisting: boolean,
		sessionUri: string,
		owner: string,
		repo: string,
		authToken: string,
		signal: AbortSignal,
		token: CancellationToken,
	): Promise<InvokeChangesetOperationResult> {
		if (!this._autoMergeMethod) {
			// No auto-merge configured
			this._onPullRequestCreated({ sessionKey: sessionUri, pullRequestUrl: pr.url });
			return this._createResult(pr, this._buildMessage(pr, isExisting, 'none', undefined));
		}

		let autoMergeError: string | undefined;
		let autoMergeOutcome: 'none' | 'enabled' | 'failed' = 'none';

		if (pr.nodeId) {
			try {
				await this._octoKitService.enablePullRequestAutoMerge(pr.nodeId, this._autoMergeMethod, authToken, signal);
				autoMergeOutcome = 'enabled';
			} catch (err) {
				this._throwIfCancelled(token);
				autoMergeError = err instanceof Error ? err.message : String(err);
				autoMergeOutcome = 'failed';
				this._logService.warn(`[AgentHostPullRequestOperationHandler] Failed to enable auto-merge for ${owner}/${repo}#${pr.number}: ${autoMergeError}`);
			}
		} else {
			autoMergeError = localize('agentHost.changeset.pr.autoMerge.noNodeId', "the pull request identifier was not returned by GitHub.");
			autoMergeOutcome = 'failed';
			this._logService.warn(`[AgentHostPullRequestOperationHandler] Cannot enable auto-merge for ${owner}/${repo}#${pr.number}: missing pull request node id`);
		}

		this._onPullRequestCreated({ sessionKey: sessionUri, pullRequestUrl: pr.url });
		return this._createResult(pr, this._buildMessage(pr, isExisting, autoMergeOutcome, autoMergeError));
	}

	private _buildMessage(pr: CreatedPullRequest, isExisting: boolean, autoMergeOutcome: 'none' | 'enabled' | 'failed', autoMergeError: string | undefined): string {
		let mergeMethodLabel: string | undefined;
		switch (this._autoMergeMethod) {
			case 'SQUASH':
				mergeMethodLabel = localize('agentHost.changeset.pr.autoMerge.squash', "squash");
				break;
			case 'REBASE':
				mergeMethodLabel = localize('agentHost.changeset.pr.autoMerge.rebase', "rebase");
				break;
			default:
				mergeMethodLabel = localize('agentHost.changeset.pr.autoMerge.merge', "merge");
				break;
		}

		if (isExisting) {
			switch (autoMergeOutcome) {
				case 'enabled':
					return localize('agentHost.changeset.pr.existing.autoMerge', "Pull request [#{0}]({1}) already exists; enabled auto-merge ({2}).", pr.number, pr.url, mergeMethodLabel);
				case 'failed':
					return localize('agentHost.changeset.pr.existing.autoMergeFailed', "Pull request [#{0}]({1}) already exists, but auto-merge could not be enabled: {2}", pr.number, pr.url, autoMergeError ?? '');
				default:
					return localize('agentHost.changeset.pr.existing', "Pull request [#{0}]({1}) already exists.", pr.number, pr.url);
			}
		}

		switch (autoMergeOutcome) {
			case 'enabled':
				return localize('agentHost.changeset.pr.created.autoMerge', "Created pull request [#{0}]({1}) with auto-merge ({2}) enabled.", pr.number, pr.url, mergeMethodLabel);
			case 'failed':
				return localize('agentHost.changeset.pr.created.autoMergeFailed', "Created pull request [#{0}]({1}), but auto-merge could not be enabled: {2}", pr.number, pr.url, autoMergeError ?? '');
			default:
				return this._draft
					? localize('agentHost.changeset.pr.createdDraft', "Created draft pull request [#{0}]({1}).", pr.number, pr.url)
					: localize('agentHost.changeset.pr.created', "Created pull request [#{0}]({1}).", pr.number, pr.url);
		}
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

	/**
	 * Best-effort generation of a PR title and description using the utility
	 * model. The model is given the main session conversation (only the
	 * markdown text of user requests and agent responses — tool calls,
	 * subagents, and reasoning are excluded and the text is character-bounded)
	 * along with a summary of the changed files. Returns `undefined` when no
	 * Copilot token is available or generation fails, so the caller can fall
	 * back to the branch-name based title/description. PR creation must never
	 * fail just because the model is unavailable.
	 */
	private async _generateTitleAndDescription(
		sessionState: ISessionWithDefaultChat,
		branchName: string,
		base: string,
		branchChanges: readonly ISessionFileDiff[],
		signal: AbortSignal,
		token: CancellationToken,
	): Promise<{ title: string; description: string } | undefined> {
		const copilotToken = this._agentService.getAuthToken({
			resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource,
			scopes: GITHUB_COPILOT_PROTECTED_RESOURCE.scopes_supported,
		});
		if (!copilotToken) {
			return undefined;
		}

		const conversation = buildConversationContext(sessionState.turns, { maxChars: MAX_PR_CONVERSATION_CONTEXT_CHARS });
		const changeSummary = this._summarizeDiffsForPrompt(branchChanges);
		if (!conversation && !changeSummary) {
			return undefined;
		}

		try {
			const raw = await this._copilotApiService.utilityChatCompletion(copilotToken, {
				messages: this._buildTitleAndDescriptionPrompt(branchName, base, conversation, changeSummary),
			}, { signal });
			this._throwIfCancelled(token);
			return this._parseTitleAndDescription(raw);
		} catch (err) {
			if (token.isCancellationRequested) {
				return undefined;
			}
			this._logService.warn(`[AgentHostPullRequestOperationHandler] Failed to generate PR title and description: ${err instanceof Error ? err.message : String(err)}`);
			return undefined;
		}
	}

	private _buildTitleAndDescriptionPrompt(branchName: string, base: string, conversation: string | undefined, changeSummary: string): ICopilotUtilityChatMessage[] {
		const userSections: string[] = [
			`Branch: ${branchName}`,
			`Base branch: ${base}`,
		];
		if (changeSummary) {
			userSections.push(`Changed files:\n${changeSummary}`);
		}
		if (conversation) {
			userSections.push(`Conversation (the request that produced these changes):\n${conversation}`);
		}
		return [
			{
				role: 'system',
				content: [
					'You write clear, concise GitHub pull request titles and descriptions.',
					'The first line of your reply is the PR title: a short imperative summary under 72 characters, with no "Title:" prefix, no surrounding quotes, and no markdown heading.',
					'After the title, add one blank line, then write the PR description in GitHub-flavored markdown.',
					'Summarize what changed and why, grounded in the conversation and changed files. Use a short paragraph and/or bullet points.',
					'Do not invent changes that are not supported by the provided context, and do not wrap the whole reply in code fences.',
				].join(' '),
			},
			{
				role: 'user',
				content: userSections.join('\n\n'),
			},
		];
	}

	private _summarizeDiffsForPrompt(diffs: readonly ISessionFileDiff[]): string {
		const lines: string[] = [];
		let length = 0;
		for (const diff of diffs) {
			const before = diff.before?.uri;
			const after = diff.after?.uri;
			const path = after ?? before ?? '(unknown)';
			let kind = 'Edit';
			if (!before && after) {
				kind = 'Create';
			} else if (before && !after) {
				kind = 'Delete';
			} else if (before && after && before !== after) {
				kind = 'Rename';
			}
			const line = `- ${kind}: ${this._displayUri(path)} (+${diff.diff?.added ?? 0} -${diff.diff?.removed ?? 0})`;
			lines.push(line);
			// `+ 1` accounts for the newline that joins this line to the previous one.
			length += line.length + (lines.length > 1 ? 1 : 0);
			if (length > MAX_PR_CHANGE_SUMMARY_CHARS) {
				lines.push('[file list truncated]');
				break;
			}
		}
		return lines.join('\n');
	}

	private _displayUri(uri: string): string {
		try {
			const parsed = URI.parse(uri);
			return parsed.scheme === 'file' ? parsed.fsPath : parsed.path || uri;
		} catch {
			return uri;
		}
	}

	private _parseTitleAndDescription(raw: string): { title: string; description: string } | undefined {
		let text = raw.trim().replace(/\r\n/g, '\n');
		const fenced = /^```(?:markdown|md|text)?\s*([\s\S]*?)\s*```$/i.exec(text);
		if (fenced) {
			text = fenced[1].trim();
		}
		if (!text) {
			return undefined;
		}

		const lines = text.split('\n');
		let i = 0;
		while (i < lines.length && lines[i].trim().length === 0) {
			i++;
		}
		if (i >= lines.length) {
			return undefined;
		}

		const title = lines[i].trim()
			.replace(/^#+\s*/, '')
			.replace(/^title:\s*/i, '')
			.trim()
			.replace(/^"(?<inner>.+)"$/, (_match, inner) => inner)
			.trim();
		if (!title) {
			return undefined;
		}

		const description = lines.slice(i + 1).join('\n').trim().replace(/^description:\s*/i, '').trim();
		return { title, description };
	}

	private _createResult(created: { readonly url: string; readonly number: number }, message: string): InvokeChangesetOperationResult {
		const followUp: ChangesetOperationFollowUp = {
			content: { uri: created.url, contentType: 'text/html' },
			external: true,
		};
		return { message: { markdown: message }, followUp };
	}
}
