/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { equals } from '../../../base/common/objects.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { IAgentHostAuthenticationService } from './agentHostAuthenticationService.js';
import { IAgentHostGitHubEndpointService } from './agentHostGitHubEndpointService.js';
import { parseChangesetUri } from '../common/changesetUri.js';
import { AHP_AUTH_REQUIRED, AHP_SESSION_NOT_FOUND, JsonRpcErrorCodes, ProtocolError } from '../common/state/sessionProtocol.js';
import { readSessionGitHubState, readSessionGitState, type ChangesetOperationFollowUp, type ISessionFileDiff, type ISessionWithDefaultChat } from '../common/state/sessionState.js';
import { ILogService } from '../../log/common/log.js';
import { IAgentHostGitService, parseUpstreamBranchName } from '../common/agentHostGitService.js';
import { type IChangesetOperationHandler } from '../common/agentHostChangesetOperationService.js';
import { type AutoMergeMethod, type CreatedPullRequest, type GitHubRepositoryMergeCapabilities, IAgentHostOctoKitService } from './shared/agentHostOctoKitService.js';
import type { InvokeChangesetOperationParams, InvokeChangesetOperationResult } from '../common/state/protocol/channels-changeset/commands.js';
import { ICopilotApiService, type ICopilotUtilityChatMessage } from './shared/copilotApiService.js';
import { buildConversationContext } from '../common/agentHostConversationContext.js';
import { IAgentBranchNameGenerator } from './shared/agentBranchNameGenerator.js';
import { SessionConfigKey } from '../common/sessionConfigKeys.js';
import { AgentMergeConfigKey, agentMergeRootConfigSchema, readAgentMergeSessionState } from '../common/agentMerge.js';
import { IAgentConfigurationService } from './agentConfigurationService.js';
import { createPullRequestDetailsResult, readPullRequestOperationMeta, readPullRequestValidationMeta, type IPullRequestContext, type IPullRequestCreateOptions } from '../common/meta/agentPullRequestOperationMeta.js';
import { getAgentMergeConfiguration } from './agentMergeConfiguration.js';

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

type PullRequestCreationConfiguration = Pick<IPullRequestCreateOptions, 'draft' | 'agentMerge' | 'agentMergeOptions' | 'autoMergeMethod'>;

export interface PullRequestCreatedEvent {
	readonly sessionKey: string;
	readonly pullRequestUrl: string;
	/** The head branch the pull request was created (or found) for. */
	readonly branchName: string;
}

/**
 * Server-side handler for pull request creation changeset operations advertised
 * on git-backed sessions whose working directory has a GitHub remote.
 * Operation availability is recomputed by
 * `AgentHostChangesetOperationService.updateOperations`.
 *
 * The flow mirrors the Copilot CLI extension's `createPullRequest` helper
 * (`extensions/copilot/src/extension/chatSessions/vscode-node/copilotCLIChatSessionsContribution.ts`):
 *
 * 1. Resolve session → working directory + current/base branch from
 *    {@link ISessionGitState}.
 * 2. If the current branch is the base branch, create a generated session branch.
 * 3. Commit any uncommitted working-tree changes.
 * 4. Push the current branch to its GitHub upstream remote (with `--set-upstream` when missing).
 * 5. Resolve `owner` / `repo` from {@link ISessionGitState.githubOwner}
 *    / {@link ISessionGitState.githubRepo} (populated by the git probe).
 * 6. Reuse an existing PR for the branch, or POST `/repos/{owner}/{repo}/pulls`
 *    via {@link IAgentHostOctoKitService}.
 * 7. Return the PR URL as an {@link InvokeChangesetOperationResult.followUp}.
 */
export class AgentHostPullRequestOperationHandler implements IChangesetOperationHandler {

	public static readonly OPERATION_CREATE_PR = 'create-pr';
	public static readonly OPERATION_CREATE_DRAFT_PR = 'create-draft-pr';
	public static readonly OPERATION_CREATE_PR_AUTO_MERGE = 'create-pr-auto-merge';
	public static readonly OPERATION_CREATE_PR_AUTO_SQUASH = 'create-pr-auto-squash';
	public static readonly OPERATION_CREATE_PR_AUTO_REBASE = 'create-pr-auto-rebase';
	public static readonly OPERATION_CREATE_PR_AGENT_MERGE = 'create-pr-agent-merge';
	public static readonly OPERATION_CREATE_DRAFT_PR_AGENT_MERGE = 'create-draft-pr-agent-merge';

	constructor(
		private readonly _draft: boolean,
		private readonly _autoMergeMethod: AutoMergeMethod | undefined,
		private readonly _enableAgentMerge: boolean,
		private readonly _getSessionState: (sessionKey: string) => ISessionWithDefaultChat | undefined,
		private readonly _resolveBaseBranchName: (sessionKey: string) => Promise<string | undefined>,
		private readonly _onPullRequestCreated: (event: PullRequestCreatedEvent) => void,
		@IAgentHostAuthenticationService private readonly _authenticationService: IAgentHostAuthenticationService,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@IAgentHostOctoKitService private readonly _octoKitService: IAgentHostOctoKitService,
		@IAgentHostGitHubEndpointService private readonly _gitHubEndpointService: IAgentHostGitHubEndpointService,
		@ICopilotApiService private readonly _copilotApiService: ICopilotApiService,
		@IAgentBranchNameGenerator private readonly _branchNameGenerator: IAgentBranchNameGenerator,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@ILogService private readonly _logService: ILogService,
	) { }

	async invoke(params: InvokeChangesetOperationParams, token: CancellationToken): Promise<InvokeChangesetOperationResult> {
		return this._withAbortSignal(token, signal => this._invoke(params, token, signal));
	}

	async prepare(params: InvokeChangesetOperationParams, token: CancellationToken): Promise<InvokeChangesetOperationResult> {
		return this._withAbortSignal(token, async signal => {
			const expectedContext = readPullRequestValidationMeta(params);
			const { sessionUri, sessionState, workingDirectory, gitHubState, branchName, baseBranchName, authToken, preparationContext } = await this._resolveContext(params, token, expectedContext);
			if (expectedContext) {
				return {};
			}
			let capabilities: GitHubRepositoryMergeCapabilities;
			try {
				capabilities = await this._octoKitService.getRepositoryMergeCapabilities(gitHubState.owner, gitHubState.repo, authToken, signal);
			} catch (err) {
				this._throwIfCancelled(token);
				this._logService.warn('[AgentHostPullRequestOperationHandler] Could not read repository merge settings; GitHub auto-merge is unavailable during PR preparation.', err);
				capabilities = { autoMergeAllowed: false, mergeMethods: [] };
			}
			this._throwIfCancelled(token);
			const branchChanges = await this._getBranchChanges(workingDirectory, sessionUri, baseBranchName, token);
			let title = '';
			let description = '';
			let generationError: string | undefined;
			try {
				({ title, description } = await this._generateTitleAndDescription(sessionState, branchName, baseBranchName, branchChanges, signal, token));
			} catch (err) {
				this._throwIfCancelled(token);
				generationError = this._reportGenerationError(err);
			}
			this._throwIfCancelled(token);
			const agentMergeAvailable = this._isAgentMergeEnabled();
			const configuration = agentMergeAvailable
				? getAgentMergeConfiguration(this._configurationService, readAgentMergeSessionState(this._configurationService.getSessionConfigValues(sessionUri))?.overrides)
				: undefined;
			return createPullRequestDetailsResult({
				title,
				description,
				branchName,
				baseBranchName,
				repository: `${gitHubState.owner}/${gitHubState.repo}`,
				context: preparationContext,
				...capabilities,
				agentMergeAvailable,
				...(configuration ? {
					agentMergeOptions: {
						addressReviews: configuration.addressReviews,
						fixCI: configuration.fixCI,
						resolveConflicts: configuration.resolveConflicts,
						mergePullRequest: configuration.mergePullRequest,
					},
				} : {}),
				...(generationError !== undefined ? { generationError } : {}),
			});
		});
	}

	private async _withAbortSignal(token: CancellationToken, operation: (signal: AbortSignal) => Promise<InvokeChangesetOperationResult>): Promise<InvokeChangesetOperationResult> {
		const abortController = new AbortController();
		if (token.isCancellationRequested) {
			abortController.abort();
		}
		const cancellationListener = token.onCancellationRequested(() => abortController.abort());
		try {
			return await operation(abortController.signal);
		} finally {
			cancellationListener.dispose();
		}
	}

	private async _resolveContext(params: InvokeChangesetOperationParams, token: CancellationToken, expectedContext?: IPullRequestContext) {
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

		const workingDirectoryStr = sessionState.workingDirectories?.[0];
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
		const storedGitState = readSessionGitState(sessionState._meta);
		const effectiveBaseBranch = await this._resolveBaseBranchName(sessionUri);

		const currentGitState = await this._gitService.getSessionGitState(workingDirectory, effectiveBaseBranch);
		if (expectedContext && (!currentGitState?.branchName || currentGitState.isDetachedHead || currentGitState.hasGitHubRemote === false)) {
			throw this._stalePreparationError();
		}
		const gitState = currentGitState ?? storedGitState;
		const branchName = gitState?.branchName ?? await this._gitService.getCurrentBranch(workingDirectory);
		if (!branchName) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Could not determine current branch for ${workingDirectory}`);
		}

		const defaultBranch = await this._gitService.getDefaultBranch(workingDirectory);
		const baseBranchName = effectiveBaseBranch ?? gitState?.baseBranchName ?? defaultBranch?.name;
		if (!baseBranchName) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Could not determine base branch for ${workingDirectory}`);
		}

		const repository = {
			owner: currentGitState?.githubOwner ?? gitHubState.owner,
			repo: currentGitState?.githubRepo ?? gitHubState.repo,
		};
		const preparationContext: IPullRequestContext = {
			workingDirectory: workingDirectory.toString(),
			repository: `${repository.owner}/${repository.repo}`,
			branchName,
			baseBranchName,
			...(gitState?.githubHeadOwner ? { headOwner: gitState.githubHeadOwner } : {}),
			...(gitState?.upstreamBranchName ? { upstreamBranchName: gitState.upstreamBranchName } : {}),
		};
		if (expectedContext && !equals(expectedContext, preparationContext)) {
			throw this._stalePreparationError();
		}

		const repoResource = this._gitHubEndpointService.getRepoResource();
		const authToken = this._authenticationService.getAuthToken({
			resource: repoResource.resource,
			scopes: repoResource.scopes_supported,
		});
		if (!authToken) {
			throw new ProtocolError(
				AHP_AUTH_REQUIRED,
				localize('agentHost.changeset.pr.authRequired', "Sign in to GitHub with repository access to create a pull request."),
				[repoResource],
			);
		}
		this._throwIfCancelled(token);

		return {
			sessionUri, sessionState, workingDirectory, effectiveBaseBranch, gitState, branchName, baseBranchName, authToken,
			gitHubState: repository, preparationContext,
		};
	}

	private _stalePreparationError(): ProtocolError {
		return new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('agentHost.changeset.pr.stalePreparation', "The repository or branches have changed since this pull request was prepared. Reopen Create PR to review the current details."));
	}

	private async _invoke(params: InvokeChangesetOperationParams, token: CancellationToken, signal: AbortSignal): Promise<InvokeChangesetOperationResult> {
		this._throwIfCancelled(token);
		const submitted = readPullRequestOperationMeta(params);
		const options: PullRequestCreationConfiguration = submitted ?? {
			draft: this._draft,
			autoMergeMethod: this._autoMergeMethod,
			agentMerge: this._enableAgentMerge,
		};
		this._validateAgentMergeAvailable(options);
		const context = await this._resolveContext(params, token, submitted?.expectedContext);
		const { sessionUri, sessionState, workingDirectory, gitHubState, effectiveBaseBranch, baseBranchName, authToken } = context;
		let { gitState, branchName } = context;

		if (submitted?.autoMergeMethod) {
			const capabilities = await this._octoKitService.getRepositoryMergeCapabilities(gitHubState.owner, gitHubState.repo, authToken, signal);
			if (!capabilities.autoMergeAllowed || !capabilities.mergeMethods.includes(submitted.autoMergeMethod)) {
				throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('agentHost.changeset.pr.autoMergeUnavailable', "The repository does not allow the requested auto-merge method."));
			}
		}
		this._throwIfCancelled(token);
		this._validateAgentMergeAvailable(options);
		if (submitted && !submitted.agentMerge) {
			this._disableAgentMerge(sessionUri);
		}

		const hasUncommitted = await this._gitService.hasUncommittedChanges(workingDirectory);
		this._throwIfCancelled(token);

		// Create a new branch if the current branch is the same
		// as the base branch and there are uncommitted changes
		if (hasUncommitted && branchName === baseBranchName) {
			const branchPrefix = sessionState.config?.values[SessionConfigKey.WorktreeBranchPrefix];

			try {
				const generatedBranchName = await this._branchNameGenerator.generateBranchName({
					sessionId: URI.parse(sessionUri).path.split('/').filter(Boolean).pop() ?? sessionUri,
					message: sessionState.turns.find(turn => turn.message.text.trim())?.message.text,
					githubToken: authToken,
					signal,
					branchPrefix: typeof branchPrefix === 'string' ? branchPrefix : undefined,
					branchNameCollides: candidate => this._gitService.branchExists(workingDirectory, candidate).catch(() => true),
				});

				this._throwIfCancelled(token);
				this._logService.info(`[AgentHostPullRequestOperationHandler] Creating branch ${generatedBranchName} for session ${sessionUri}`);

				await this._gitService.createBranch(workingDirectory, generatedBranchName, { checkout: true });
				branchName = generatedBranchName;

				gitState = await this._gitService.getSessionGitState(workingDirectory, effectiveBaseBranch);
			} catch (err) {
				this._throwIfCancelled(token);
				throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Failed to create a branch before creating a pull request: ${err instanceof Error ? err.message : String(err)}`);
			}
		}

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

		const branchChanges = await this._getBranchChanges(workingDirectory, sessionUri, baseBranchName, token);

		const githubHeadOwner = gitState?.githubHeadOwner;
		const upstreamBranch = githubHeadOwner ? parseUpstreamBranchName(gitState?.upstreamBranchName) : undefined;
		const headOwner = upstreamBranch && githubHeadOwner ? githubHeadOwner : gitHubState.owner;
		const headBranch = upstreamBranch?.branch ?? branchName;
		const pushRef = headBranch === branchName ? branchName : `${branchName}:${headBranch}`;
		const createHead = headOwner === gitHubState.owner ? headBranch : `${headOwner}:${headBranch}`;

		this._logService.info(`[AgentHostPullRequestOperationHandler] Pushing branch ${branchName} to ${upstreamBranch?.remote ?? 'origin'} for session ${sessionUri}`);
		const upstreamPresent = await this._gitService.hasUpstream(workingDirectory, branchName);
		this._throwIfCancelled(token);
		try {
			await this._gitService.push(workingDirectory, { remote: upstreamBranch?.remote, ref: pushRef, setUpstream: !upstreamPresent });
		} catch (err) {
			this._throwIfCancelled(token);
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Failed to push branch '${branchName}': ${err instanceof Error ? err.message : String(err)}`);
		}
		this._throwIfCancelled(token);

		const existing = await this._octoKitService.findPullRequestByHeadBranch(gitHubState.owner, gitHubState.repo, headBranch, authToken, signal, headOwner);
		if (existing) {
			this._throwIfCancelled(token);
			return await this._finalize(existing, true, sessionUri, gitHubState.owner, gitHubState.repo, branchName, authToken, signal, token, options);
		}
		this._throwIfCancelled(token);

		let generated: { title: string; description: string } | undefined;
		if (!submitted) {
			try {
				generated = await this._generateTitleAndDescription(sessionState, branchName, baseBranchName, branchChanges, signal, token);
			} catch (err) {
				this._throwIfCancelled(token);
				this._reportGenerationError(err);
			}
		}
		const title = submitted?.title ?? generated?.title ?? this._formatTitle(branchName);
		const body = submitted?.description ?? generated?.description ?? this._formatBody(branchName, baseBranchName);
		this._throwIfCancelled(token);

		this._logService.info(`[AgentHostPullRequestOperationHandler] Creating ${options.draft ? 'draft ' : ''}PR ${gitHubState.owner}/${gitHubState.repo} ${createHead} -> ${baseBranchName}`);
		let created: CreatedPullRequest;
		try {
			created = await this._octoKitService.createPullRequest(
				gitHubState.owner,
				gitHubState.repo,
				title,
				body,
				createHead,
				baseBranchName,
				options.draft,
				authToken,
				signal,
			);
		} catch (err) {
			this._throwIfCancelled(token);
			let foundAfterFailure: CreatedPullRequest | undefined;
			try {
				foundAfterFailure = await this._octoKitService.findPullRequestByHeadBranch(gitHubState.owner, gitHubState.repo, headBranch, authToken, signal, headOwner);
			} catch {
				this._throwIfCancelled(token);
				throw err;
			}
			if (foundAfterFailure) {
				this._throwIfCancelled(token);
				return await this._finalize(foundAfterFailure, true, sessionUri, gitHubState.owner, gitHubState.repo, branchName, authToken, signal, token, options);
			}
			throw err;
		}
		this._throwIfCancelled(token);
		return await this._finalize(created, false, sessionUri, gitHubState.owner, gitHubState.repo, branchName, authToken, signal, token, options);
	}

	private async _getBranchChanges(workingDirectory: URI, sessionUri: string, baseBranchName: string, token: CancellationToken): Promise<readonly ISessionFileDiff[]> {
		const branchChanges = await this._gitService.computeSessionFileDiffs(workingDirectory, { sessionUri, baseBranch: baseBranchName });
		this._throwIfCancelled(token);
		if (branchChanges === undefined) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, localize('agentHost.changeset.pr.computeChangesFailed', "Could not compute branch changes to create a pull request."));
		}
		if (branchChanges.length === 0) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, localize('agentHost.changeset.pr.noChanges', "There are no branch changes to create a pull request for."));
		}
		return branchChanges;
	}

	private _isAgentMergeEnabled(): boolean {
		return this._configurationService.getRootValue(agentMergeRootConfigSchema, AgentMergeConfigKey.Enabled) === true;
	}

	private _validateAgentMergeAvailable(options: PullRequestCreationConfiguration): void {
		if (options.agentMerge && !this._isAgentMergeEnabled()) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('agentHost.changeset.pr.agentMergeDisabled', "Agent Merge is disabled in the host configuration."));
		}
	}

	private _disableAgentMerge(sessionUri: string): void {
		const current = readAgentMergeSessionState(this._configurationService.getSessionConfigValues(sessionUri));
		if (!current?.enabled) {
			return;
		}
		// Preserve controller state so disabling can restore its injected session settings.
		this._configurationService.updateSessionConfig(sessionUri, {
			[SessionConfigKey.AgentMerge]: {
				enabled: false,
				...(current.overrides ? { overrides: current.overrides } : {}),
			},
		});
	}

	/**
	 * Notifies listeners that the pull request now exists, optionally enables
	 * auto-merge or Agent Merge, and builds the result message describing what
	 * happened. A failure to enable auto-merge does not fail the operation.
	 */
	private async _finalize(
		pr: CreatedPullRequest,
		isExisting: boolean,
		sessionUri: string,
		owner: string,
		repo: string,
		branchName: string,
		authToken: string,
		signal: AbortSignal,
		token: CancellationToken,
		options: PullRequestCreationConfiguration,
	): Promise<InvokeChangesetOperationResult> {
		if (!options.autoMergeMethod) {
			this._completePullRequestOperation(sessionUri, pr.url, branchName, options);
			return this._createResult(pr, this._buildMessage(pr, isExisting, 'none', undefined, options));
		}

		let autoMergeError: string | undefined;
		let autoMergeOutcome: 'none' | 'enabled' | 'failed' = 'none';

		if (pr.nodeId) {
			try {
				await this._octoKitService.enablePullRequestAutoMerge(pr.nodeId, options.autoMergeMethod, authToken, signal);
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

		this._completePullRequestOperation(sessionUri, pr.url, branchName, options);
		return this._createResult(pr, this._buildMessage(pr, isExisting, autoMergeOutcome, autoMergeError, options));
	}

	private _completePullRequestOperation(sessionUri: string, pullRequestUrl: string, branchName: string, options: PullRequestCreationConfiguration): void {
		this._onPullRequestCreated({ sessionKey: sessionUri, pullRequestUrl, branchName });
		if (!options.agentMerge) {
			return;
		}
		const current = readAgentMergeSessionState(this._configurationService.getSessionConfigValues(sessionUri));
		const overrides = options.agentMergeOptions ?? current?.overrides;
		this._configurationService.updateSessionConfig(sessionUri, {
			[SessionConfigKey.AgentMerge]: {
				enabled: true,
				...(overrides ? { overrides } : {}),
			},
			[SessionConfigKey.AgentMergeController]: {},
		});
	}

	private _buildMessage(pr: CreatedPullRequest, isExisting: boolean, autoMergeOutcome: 'none' | 'enabled' | 'failed', autoMergeError: string | undefined, options: PullRequestCreationConfiguration): string {
		if (options.agentMerge) {
			return isExisting
				? localize('agentHost.changeset.pr.existing.agentMerge', "Pull request [#{0}]({1}) already exists; enabled Agent Merge.", pr.number, pr.url)
				: options.draft
					? localize('agentHost.changeset.pr.createdDraft.agentMerge', "Created draft pull request [#{0}]({1}) and enabled Agent Merge.", pr.number, pr.url)
					: localize('agentHost.changeset.pr.created.agentMerge', "Created pull request [#{0}]({1}) and enabled Agent Merge.", pr.number, pr.url);
		}

		let mergeMethodLabel: string | undefined;
		switch (options.autoMergeMethod) {
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
				return options.draft
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

	/** Generates from bounded conversation and file context; callers decide how to surface failures. */
	private async _generateTitleAndDescription(
		sessionState: ISessionWithDefaultChat,
		branchName: string,
		base: string,
		branchChanges: readonly ISessionFileDiff[],
		signal: AbortSignal,
		token: CancellationToken,
	): Promise<{ title: string; description: string }> {
		const copilotResource = this._gitHubEndpointService.getCopilotResource();
		const authToken = this._authenticationService.getAuthToken({
			resource: copilotResource.resource,
			scopes: copilotResource.scopes_supported,
		});
		if (!authToken) {
			throw new Error(localize('agentHost.changeset.pr.generationAuthRequired', "Sign in to Copilot to generate a pull request title and description, or enter them manually."));
		}

		const conversation = buildConversationContext(sessionState.turns, { maxChars: MAX_PR_CONVERSATION_CONTEXT_CHARS });
		const changeSummary = this._summarizeDiffsForPrompt(branchChanges);
		if (!conversation && !changeSummary) {
			throw new Error(localize('agentHost.changeset.pr.generationNoContext', "There is no conversation or change context to generate a pull request title and description."));
		}

		const raw = await this._copilotApiService.utilityChatCompletion(authToken, {
			messages: this._buildTitleAndDescriptionPrompt(branchName, base, conversation, changeSummary),
		}, { signal });
		this._throwIfCancelled(token);
		const generated = this._parseTitleAndDescription(raw);
		if (!generated) {
			throw new Error(localize('agentHost.changeset.pr.generationInvalidResponse', "The model did not return a pull request title and description. Enter them manually."));
		}
		return generated;
	}

	private _reportGenerationError(error: unknown): string {
		const message = error instanceof Error ? error.message : String(error);
		this._logService.warn(`[AgentHostPullRequestOperationHandler] Failed to generate PR title and description: ${message}`);
		return message;
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
