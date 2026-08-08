/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../base/common/errors.js';
import { DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { format } from '../../../../base/common/strings.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IGitService } from '../../../../workbench/contrib/git/common/gitService.js';
import { getGitHubRemoteInfo, IGitHubRemoteInfo } from '../../../../workbench/contrib/git/common/utils.js';
import { getOnboardingDeveloperModeVariation, isOnboardingDeveloperModeEnabled, OnboardingDeveloperModeVariations, ONBOARDING_DEVELOPER_MODE_VARIATIONS_CONFIG } from '../../../../workbench/contrib/onboarding/common/onboardingScenarioService.js';
import { IWorkbenchAssignmentService } from '../../../../workbench/services/assignment/common/assignmentService.js';
import { isAgentHostProviderId } from '../../../common/agentHostSessionsProvider.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { INewSessionComposerService } from '../../chat/browser/newSessionComposerService.js';
import { getGitHubRepositoryFromUri } from '../../github/common/utils.js';
import { GitHubAuthenticationError } from '../../github/browser/githubApiClient.js';
import { IGitHubRecentIssue, IGitHubRecentPullRequest, IGitHubRecentUserWork } from '../../github/browser/fetchers/githubRecentUserWorkFetcher.js';
import { IGitHubService } from '../../github/browser/githubService.js';
import { resolveGitHubRepositoryFromGitConfig } from './gitHubRepositoryResolver.js';
import { NEW_SESSION_VIEW_V3_GITHUB_PROMPT_VARIATION, NEW_SESSION_VIEW_V3_PROMPT_VARIATION, NEW_SESSION_VIEW_V3_TOUR_ID, NEW_SESSION_VIEW_V3_VARIATION_TREATMENT } from './tours/newSessionViewV3Tour.js';

const PROMPT_TYPING_DURATION_MS = 2_500;
const DEFAULT_GITHUB_LOOKUP_TIMEOUTS = {
	totalMs: 6_000,
	summaryMs: 2_500,
	linkageMs: 1_500,
	reviewMs: 2_500,
};
const LOG_PREFIX = '[NewSessionViewV3Prompt]';
const PROMPT_TEMPLATE_TREATMENT = 'onb.newSessionViewV3.promptTemplate';
const PLACEHOLDER_TREATMENT = 'onb.newSessionViewV3.placeholder';
const DEFAULT_TASK_PLACEHOLDER = localize('sessions.onboarding.newSessionViewV3.prompt.taskPlaceholder', "[describe the coding task]");
const DEFAULT_PROMPT_TEMPLATE = localize('sessions.onboarding.newSessionViewV3.prompt.text', "Help me complete {0} in this project. First, inspect the relevant files and explain your approach briefly. Then implement the solution using existing project conventions, avoid unrelated changes, and run the most relevant tests or checks. If anything is unclear, make a reasonable assumption and state it. When finished, summarize what changed and mention any remaining issues.");

export type NewSessionViewV3ConfiguredVariation = 'prompt' | 'githubPrompt' | 'unknown';
export type NewSessionViewV3EffectiveStrategy = 'prompt' | 'githubCiFailure' | 'githubReviewComments' | 'githubIssue';
export type NewSessionViewV3FallbackReason = 'none' | 'unsupportedVariation' | 'noRepository' | 'noAuthentication' | 'timeout' | 'requestFailed' | 'noCandidate';

interface INewSessionViewV3PromptPlan {
	readonly prompt: string;
	readonly taskPlaceholder: string;
	readonly effectiveStrategy: NewSessionViewV3EffectiveStrategy;
	readonly fallbackReason: NewSessionViewV3FallbackReason;
}

interface INewSessionViewV3GitHubCandidate {
	readonly title: string;
	readonly url: string;
	readonly strategy: Exclude<NewSessionViewV3EffectiveStrategy, 'prompt'>;
}

interface INewSessionViewV3RepositoryContext {
	readonly session: IActiveSession;
	readonly workspaceUri: string;
	readonly folderUri: string;
	readonly repository: IGitHubRemoteInfo;
}

type AgentHostRepositoryResolution =
	| { readonly kind: 'pending' }
	| { readonly kind: 'sessionChanged' }
	| { readonly kind: 'noGitHubRemote' }
	| { readonly kind: 'resolved'; readonly context: INewSessionViewV3RepositoryContext };

type GitHubPromptResult =
	| { readonly kind: 'candidate'; readonly candidate: INewSessionViewV3GitHubCandidate }
	| { readonly kind: 'fallback'; readonly reason: Extract<NewSessionViewV3FallbackReason, 'noRepository' | 'noAuthentication' | 'timeout' | 'requestFailed' | 'noCandidate'> };

type GitHubLookupFailureReason = 'noAuthentication' | 'timeout' | 'requestFailed' | 'cancelled';

type GitHubLookupOutcome<T> =
	| { readonly kind: 'success'; readonly value: T }
	| { readonly kind: 'failure'; readonly reason: GitHubLookupFailureReason };

interface IGitHubReviewLookupResult {
	readonly candidate: INewSessionViewV3GitHubCandidate | undefined;
	readonly failures: readonly GitHubLookupFailureReason[];
}

interface IGitHubLookupTimeouts {
	readonly totalMs: number;
	readonly summaryMs: number;
	readonly linkageMs: number;
	readonly reviewMs: number;
}

export class NewSessionViewV3PromptRunner {
	private readonly _gitHubLookupTimeouts: IGitHubLookupTimeouts;

	constructor(
		private readonly _assignmentService: IWorkbenchAssignmentService,
		private readonly _configurationService: IConfigurationService,
		private readonly _sessionsService: ISessionsService,
		private readonly _newSessionComposerService: INewSessionComposerService,
		private readonly _gitService: IGitService,
		private readonly _fileService: IFileService,
		private readonly _gitHubService: IGitHubService,
		private readonly _telemetryService: ITelemetryService,
		private readonly _logService: ILogService,
		gitHubLookupTimeouts: Partial<IGitHubLookupTimeouts> = {},
	) {
		this._gitHubLookupTimeouts = { ...DEFAULT_GITHUB_LOOKUP_TIMEOUTS, ...gitHubLookupTimeouts };
	}

	async run(token: CancellationToken): Promise<boolean> {
		this._logService.info(`${LOG_PREFIX} Starting V3 prompt resolution.`);
		const configuredVariation = await this._resolveConfiguredVariation();
		if (token.isCancellationRequested) {
			this._logService.trace(`${LOG_PREFIX} Prompt resolution was cancelled after resolving the configured variation.`);
			return false;
		}

		const plan = configuredVariation === 'githubPrompt'
			? await this._resolveGitHubPromptWithFallback(token)
			: await this._resolvePrompt(configuredVariation === 'unknown' ? 'unsupportedVariation' : 'none');
		if (token.isCancellationRequested) {
			this._logService.trace(`${LOG_PREFIX} Prompt resolution was cancelled before prompt insertion.`);
			return false;
		}

		this._logService.info(`${LOG_PREFIX} Resolved effective strategy '${plan.effectiveStrategy}' with fallback reason '${plan.fallbackReason}'.`);
		const shown = await this._animatePrompt(plan.prompt, plan.taskPlaceholder, token);
		this._logService.info(`${LOG_PREFIX} Prompt insertion completed with shown=${shown}.`);
		this._reportStrategy(configuredVariation, plan, shown);
		return shown;
	}

	private async _resolveConfiguredVariation(): Promise<NewSessionViewV3ConfiguredVariation> {
		const developerModeEnabled = isOnboardingDeveloperModeEnabled(this._configurationService, NEW_SESSION_VIEW_V3_TOUR_ID);
		const developerVariations = this._configurationService.getValue<OnboardingDeveloperModeVariations | undefined>(ONBOARDING_DEVELOPER_MODE_VARIATIONS_CONFIG);
		const configuredDeveloperVariation = typeof developerVariations === 'object' && developerVariations !== null
			? developerVariations[NEW_SESSION_VIEW_V3_TOUR_ID]
			: undefined;
		const developerVariation = getOnboardingDeveloperModeVariation(this._configurationService, NEW_SESSION_VIEW_V3_TOUR_ID);
		if (configuredDeveloperVariation && !developerModeEnabled) {
			this._logService.warn(`${LOG_PREFIX} Ignoring developer variation '${configuredDeveloperVariation}' because developer mode is not enabled for '${NEW_SESSION_VIEW_V3_TOUR_ID}'.`);
		}
		if (developerVariation) {
			this._logService.info(`${LOG_PREFIX} Using developer variation '${developerVariation}'.`);
			return this._normalizeVariation(developerVariation, 'developer setting');
		}

		this._logService.trace(`${LOG_PREFIX} No active developer variation; resolving treatment '${NEW_SESSION_VIEW_V3_VARIATION_TREATMENT}'.`);
		const treatmentVariation = await this._assignmentService.getTreatment<string>(NEW_SESSION_VIEW_V3_VARIATION_TREATMENT);
		this._logService.info(`${LOG_PREFIX} Treatment variation resolved to '${treatmentVariation || NEW_SESSION_VIEW_V3_PROMPT_VARIATION}'.`);
		return this._normalizeVariation(treatmentVariation, 'treatment');
	}

	private _normalizeVariation(variation: string | undefined, source: string): NewSessionViewV3ConfiguredVariation {
		if (variation === undefined || variation === '' || variation === NEW_SESSION_VIEW_V3_PROMPT_VARIATION) {
			return 'prompt';
		}
		if (variation === NEW_SESSION_VIEW_V3_GITHUB_PROMPT_VARIATION) {
			return 'githubPrompt';
		}
		this._logService.warn(`${LOG_PREFIX} Unsupported variation '${variation}' from ${source}; using '${NEW_SESSION_VIEW_V3_PROMPT_VARIATION}'.`);
		return 'unknown';
	}

	private async _resolveGitHubPromptWithFallback(token: CancellationToken): Promise<INewSessionViewV3PromptPlan> {
		this._logService.info(`${LOG_PREFIX} Starting GitHub prompt lookup with a ${this._gitHubLookupTimeouts.totalMs}ms total timeout.`);
		const operationCts = new CancellationTokenSource(token);
		let timedOut = false;
		try {
			const result = await raceTimeout(
				this._resolveGitHubPrompt(operationCts.token),
				this._gitHubLookupTimeouts.totalMs,
				() => {
					timedOut = true;
					this._logService.warn(`${LOG_PREFIX} GitHub prompt lookup timed out after ${this._gitHubLookupTimeouts.totalMs}ms; using the prompt variation.`);
					operationCts.cancel();
				},
			);
			if (timedOut) {
				return this._resolvePrompt('timeout');
			}
			if (!result) {
				return this._resolvePrompt('timeout');
			}
			if (result.kind === 'fallback') {
				this._logService.warn(`${LOG_PREFIX} GitHub prompt lookup requested fallback '${result.reason}'; using the prompt variation.`);
				return this._resolvePrompt(result.reason);
			}
			this._logService.info(`${LOG_PREFIX} Selected GitHub candidate strategy '${result.candidate.strategy}'.`);
			return this._createGitHubPrompt(result.candidate);
		} catch (error) {
			if (isCancellationError(error) && timedOut) {
				return this._resolvePrompt('timeout');
			}
			if (isCancellationError(error) && token.isCancellationRequested) {
				this._logService.trace(`${LOG_PREFIX} GitHub prompt lookup was cancelled by the onboarding flow.`);
				return this._resolvePrompt('requestFailed');
			}
			if (error instanceof GitHubAuthenticationError) {
				this._logService.warn(`${LOG_PREFIX} No existing GitHub authentication session is available; using the prompt variation without requesting sign-in.`);
				return this._resolvePrompt('noAuthentication');
			}
			this._logService.error(`${LOG_PREFIX} GitHub prompt lookup failed; using the prompt variation.`, error);
			return this._resolvePrompt('requestFailed');
		} finally {
			operationCts.dispose();
		}
	}

	private async _resolveGitHubPrompt(token: CancellationToken): Promise<GitHubPromptResult> {
		while (!token.isCancellationRequested) {
			const context = await this._resolveGitHubRepository(token);
			if (!context) {
				this._logService.warn(`${LOG_PREFIX} Could not resolve a GitHub repository for the selected workspace.`);
				return { kind: 'fallback', reason: 'noRepository' };
			}
			const lookupCts = new CancellationTokenSource(token);
			const owner = context.repository.owner;
			const repo = context.repository.repo;
			this._logService.info(`${LOG_PREFIX} Starting independent GitHub lookups for '${owner}/${repo}'.`);
			const issuesLookup = this._resolveIssueCandidates(owner, repo, lookupCts.token);
			try {
				const pullRequestsLookup = await this._runGitHubLookup(
					'authored pull request summaries',
					this._gitHubLookupTimeouts.summaryMs,
					lookupCts.token,
					lookupToken => this._gitHubService.getRecentAuthoredPullRequests(owner, repo, lookupToken),
				);
				if (!this._isCurrentRepositoryContext(context)) {
					this._logService.info(`${LOG_PREFIX} The selected workspace changed during the GitHub lookup; retrying for the current workspace.`);
					continue;
				}

				const failures: GitHubLookupFailureReason[] = [];
				if (pullRequestsLookup.kind === 'success') {
					const pullRequests = [...pullRequestsLookup.value].sort(compareUpdatedAtDescending);
					const failingPullRequest = pullRequests.find(isFailingPullRequest);
					this._logService.info(`${LOG_PREFIX} Pull request summary lookup returned ${pullRequests.length} open authored pull request(s), including ${pullRequests.filter(isFailingPullRequest).length} with failing CI.`);
					if (failingPullRequest) {
						return { kind: 'candidate', candidate: toCandidate(failingPullRequest, 'githubCiFailure') };
					}

					const reviewLookup = await this._resolveReviewCandidate(owner, repo, pullRequests, lookupCts.token);
					failures.push(...reviewLookup.failures);
					if (!this._isCurrentRepositoryContext(context)) {
						this._logService.info(`${LOG_PREFIX} The selected workspace changed during review lookup; retrying for the current workspace.`);
						continue;
					}
					if (reviewLookup.candidate) {
						return { kind: 'candidate', candidate: reviewLookup.candidate };
					}
				} else {
					failures.push(pullRequestsLookup.reason);
				}

				const issues = await issuesLookup;
				if (!this._isCurrentRepositoryContext(context)) {
					this._logService.info(`${LOG_PREFIX} The selected workspace changed during issue lookup; retrying for the current workspace.`);
					continue;
				}
				if (issues.kind === 'success') {
					this._logService.info(`${LOG_PREFIX} Issue lookup returned ${issues.value.length} unlinked open issue(s) assigned to the user.`);
					const issue = [...issues.value].sort(compareUpdatedAtDescending)[0];
					if (issue) {
						return { kind: 'candidate', candidate: { title: issue.title, url: issue.url, strategy: 'githubIssue' } };
					}
				} else {
					failures.push(issues.reason);
				}

				this._logService.warn(`${LOG_PREFIX} No eligible GitHub candidate was available from the lookups that completed in time.`);
				return { kind: 'fallback', reason: getLookupFallbackReason(failures) };
			} finally {
				lookupCts.dispose(true);
			}
		}
		this._logService.trace(`${LOG_PREFIX} GitHub prompt lookup stopped because it was cancelled.`);
		return { kind: 'fallback', reason: 'noRepository' };
	}

	private async _resolveIssueCandidates(owner: string, repo: string, token: CancellationToken): Promise<GitHubLookupOutcome<readonly IGitHubRecentIssue[]>> {
		const issues = await this._runGitHubLookup(
			'assigned issue summaries',
			this._gitHubLookupTimeouts.summaryMs,
			token,
			lookupToken => this._gitHubService.getRecentAssignedIssues(owner, repo, lookupToken),
		);
		if (issues.kind === 'failure' || issues.value.length === 0) {
			return issues;
		}

		const linkedIssues = await this._runGitHubLookup(
			'issue pull request linkage',
			this._gitHubLookupTimeouts.linkageMs,
			token,
			lookupToken => this._gitHubService.getIssuesWithLinkedPullRequests(owner, repo, issues.value.map(issue => issue.number), lookupToken),
		);
		if (linkedIssues.kind === 'success') {
			const unlinkedIssues = issues.value.filter(issue => !linkedIssues.value.has(issue.number));
			this._logService.info(`${LOG_PREFIX} Issue linkage lookup excluded ${issues.value.length - unlinkedIssues.length} issue(s) with related pull requests.`);
			return { kind: 'success', value: unlinkedIssues };
		}
		if (linkedIssues.reason === 'cancelled' && token.isCancellationRequested) {
			return linkedIssues;
		}

		this._logService.warn(`${LOG_PREFIX} Issue linkage was unavailable (${linkedIssues.reason}); treating all assigned issues as having no related pull request.`);
		return issues;
	}

	private async _resolveReviewCandidate(owner: string, repo: string, pullRequests: readonly IGitHubRecentPullRequest[], token: CancellationToken): Promise<IGitHubReviewLookupResult> {
		const eligiblePullRequests = pullRequests.filter(pullRequest => !!pullRequest.latestCommitAt);
		if (eligiblePullRequests.length === 0) {
			this._logService.info(`${LOG_PREFIX} No pull requests have a latest commit timestamp, so review-thread lookup is unnecessary.`);
			return { candidate: undefined, failures: [] };
		}

		this._logService.info(`${LOG_PREFIX} Starting ${eligiblePullRequests.length} independent review-thread lookup(s).`);
		const results = await Promise.all(eligiblePullRequests.map(async pullRequest => ({
			pullRequest,
			outcome: await this._runGitHubLookup(
				`review threads for pull request #${pullRequest.number}`,
				this._gitHubLookupTimeouts.reviewMs,
				token,
				lookupToken => this._gitHubService.getPullRequestReviewThreads(owner, repo, pullRequest.number, lookupToken),
			),
		})));
		const completedPullRequests: IGitHubRecentPullRequest[] = [];
		const failures: GitHubLookupFailureReason[] = [];
		for (const result of results) {
			if (result.outcome.kind === 'success') {
				completedPullRequests.push({ ...result.pullRequest, reviewThreads: result.outcome.value });
			} else {
				failures.push(result.outcome.reason);
			}
		}

		const reviewPullRequest = completedPullRequests.sort(compareUpdatedAtDescending).find(hasUnaddressedReviewComments);
		this._logService.info(`${LOG_PREFIX} Review-thread lookups completed for ${completedPullRequests.length} of ${eligiblePullRequests.length} pull request(s); ${reviewPullRequest ? 'an eligible pull request was found' : 'no eligible pull request was found'}.`);
		return {
			candidate: reviewPullRequest ? toCandidate(reviewPullRequest, 'githubReviewComments') : undefined,
			failures,
		};
	}

	private async _runGitHubLookup<T>(
		label: string,
		timeoutMs: number,
		token: CancellationToken,
		lookup: (token: CancellationToken) => Promise<T>,
	): Promise<GitHubLookupOutcome<T>> {
		const lookupCts = new CancellationTokenSource(token);
		const startTime = Date.now();
		let timedOut = false;
		this._logService.trace(`${LOG_PREFIX} Starting ${label} lookup with a ${timeoutMs}ms timeout.`);
		try {
			const value = await raceTimeout(
				lookup(lookupCts.token),
				timeoutMs,
				() => {
					timedOut = true;
					this._logService.warn(`${LOG_PREFIX} ${capitalize(label)} lookup timed out after ${timeoutMs}ms.`);
					lookupCts.cancel();
				},
			);
			if (timedOut || value === undefined) {
				return { kind: 'failure', reason: 'timeout' };
			}
			this._logService.info(`${LOG_PREFIX} ${capitalize(label)} lookup completed in ${Date.now() - startTime}ms.`);
			return { kind: 'success', value };
		} catch (error) {
			if (timedOut) {
				return { kind: 'failure', reason: 'timeout' };
			}
			if (error instanceof GitHubAuthenticationError) {
				this._logService.warn(`${LOG_PREFIX} ${capitalize(label)} lookup could not run because no existing GitHub authentication session is available.`);
				return { kind: 'failure', reason: 'noAuthentication' };
			}
			if (isCancellationError(error) && token.isCancellationRequested) {
				this._logService.trace(`${LOG_PREFIX} ${capitalize(label)} lookup was cancelled.`);
				return { kind: 'failure', reason: 'cancelled' };
			}
			this._logService.error(`${LOG_PREFIX} ${capitalize(label)} lookup failed after ${Date.now() - startTime}ms.`, error);
			return { kind: 'failure', reason: 'requestFailed' };
		} finally {
			lookupCts.dispose();
		}
	}

	private async _resolveGitHubRepository(token: CancellationToken): Promise<INewSessionViewV3RepositoryContext | undefined> {
		while (!token.isCancellationRequested) {
			const activeSession = this._sessionsService.activeSession.get();
			if (!activeSession) {
				this._logService.trace(`${LOG_PREFIX} No active draft session is available for repository resolution.`);
				return undefined;
			}
			if (activeSession.isCreated.get()) {
				this._logService.trace(`${LOG_PREFIX} The active session is already created, so the V3 new-session prompt cannot resolve its repository.`);
				return undefined;
			}
			const workspace = activeSession.workspace.get();
			const folder = workspace?.folders[0];
			this._logWorkspaceSnapshot(activeSession);
			if (!workspace || !folder) {
				this._logService.trace(`${LOG_PREFIX} The active draft has no primary workspace folder.`);
				return undefined;
			}
			const gitHubInfo = folder.gitRepository?.gitHubInfo.get();
			if (gitHubInfo) {
				this._logService.info(`${LOG_PREFIX} Resolved GitHub repository '${gitHubInfo.owner}/${gitHubInfo.repo}' from session metadata.`);
				return this._createRepositoryContext(activeSession, workspace.uri.toString(), folder.workingDirectory.toString(), { owner: gitHubInfo.owner, repo: gitHubInfo.repo });
			}
			const repositoryFromUri = getGitHubRepositoryFromUri(folder.root)
				?? getGitHubRepositoryFromUri(folder.workingDirectory)
				?? (folder.gitRepository ? getGitHubRepositoryFromUri(folder.gitRepository.uri) : undefined);
			if (repositoryFromUri) {
				this._logService.info(`${LOG_PREFIX} Resolved GitHub repository '${repositoryFromUri.owner}/${repositoryFromUri.repo}' from the workspace URI.`);
				return this._createRepositoryContext(activeSession, workspace.uri.toString(), folder.workingDirectory.toString(), repositoryFromUri);
			}

			try {
				const repositoryFromConfig = await resolveGitHubRepositoryFromGitConfig(this._fileService, folder.workingDirectory);
				if (repositoryFromConfig) {
					this._logService.info(`${LOG_PREFIX} Resolved GitHub repository '${repositoryFromConfig.owner}/${repositoryFromConfig.repo}' directly from .git/config.`);
					return this._createRepositoryContext(activeSession, workspace.uri.toString(), folder.workingDirectory.toString(), repositoryFromConfig);
				}
				this._logService.trace(`${LOG_PREFIX} No supported github.com remote was found directly in .git/config.`);
			} catch (error) {
				this._logService.warn(`${LOG_PREFIX} Reading Git repository metadata directly from the selected workspace failed.`, error);
			}

			if (isAgentHostProviderId(activeSession.providerId)) {
				this._logService.info(`${LOG_PREFIX} Waiting for Agent Host git metadata for the active draft.`);
				const result = await this._waitForAgentHostRepository(activeSession, token);
				if (result.kind === 'sessionChanged') {
					this._logService.info(`${LOG_PREFIX} The active draft changed while waiting for Agent Host git metadata; retrying.`);
					continue;
				}
				if (result.kind === 'noGitHubRemote') {
					this._logService.info(`${LOG_PREFIX} Agent Host git metadata reports that the selected workspace has no github.com remote.`);
					return undefined;
				}
				if (result.kind === 'resolved') {
					this._logService.info(`${LOG_PREFIX} Resolved GitHub repository '${result.context.repository.owner}/${result.context.repository.repo}' from asynchronously published Agent Host metadata.`);
					return result.context;
				}
			}

			this._logService.trace(`${LOG_PREFIX} Session metadata, workspace URIs, and .git/config did not identify GitHub; inspecting Git extension remotes.`);
			const repository = await this._gitService.openRepository(folder.workingDirectory);
			if (!repository) {
				this._logService.trace(`${LOG_PREFIX} The selected workspace folder could not be opened through the Git extension.`);
				return undefined;
			}
			const repositoryFromRemote = getGitHubRemoteInfo(repository.state.get());
			if (!repositoryFromRemote) {
				this._logService.trace(`${LOG_PREFIX} The selected Git repository has no supported github.com remote.`);
				return undefined;
			}
			this._logService.info(`${LOG_PREFIX} Resolved GitHub repository '${repositoryFromRemote.owner}/${repositoryFromRemote.repo}' from Git extension remotes.`);
			return this._createRepositoryContext(activeSession, workspace.uri.toString(), folder.workingDirectory.toString(), repositoryFromRemote);
		}
		return undefined;
	}

	private _waitForAgentHostRepository(activeSession: IActiveSession, token: CancellationToken): Promise<AgentHostRepositoryResolution> {
		return new Promise((resolve, reject) => {
			const disposables = new DisposableStore();
			const reaction = disposables.add(new MutableDisposable());
			const finish = (result: AgentHostRepositoryResolution) => {
				disposables.dispose();
				resolve(result);
			};
			reaction.value = autorun(reader => {
				if (this._sessionsService.activeSession.read(reader) !== activeSession || activeSession.isCreated.read(reader)) {
					finish({ kind: 'sessionChanged' });
					return;
				}
				const workspace = activeSession.workspace.read(reader);
				const folder = workspace?.folders[0];
				const gitRepository = folder?.gitRepository;
				const gitHubInfo = gitRepository?.gitHubInfo.read(reader);
				if (workspace && folder && gitHubInfo) {
					finish({
						kind: 'resolved',
						context: this._createRepositoryContext(activeSession, workspace.uri.toString(), folder.workingDirectory.toString(), { owner: gitHubInfo.owner, repo: gitHubInfo.repo }),
					});
					return;
				}
				if (gitRepository?.hasGitHubRemote === false) {
					finish({ kind: 'noGitHubRemote' });
				}
			});
			disposables.add(token.onCancellationRequested(() => {
				disposables.dispose();
				reject(new CancellationError());
			}));
			if (token.isCancellationRequested) {
				disposables.dispose();
				reject(new CancellationError());
			}
		});
	}

	private _logWorkspaceSnapshot(activeSession: IActiveSession): void {
		const workspace = activeSession.workspace.get();
		const folder = workspace?.folders[0];
		const gitRepository = folder?.gitRepository;
		const gitHubInfo = gitRepository?.gitHubInfo.get();
		this._logService.info(`${LOG_PREFIX} Workspace snapshot: provider='${activeSession.providerId}', sessionType='${activeSession.sessionType}', workspace='${workspace?.uri.toString() ?? 'none'}', root='${folder?.root.toString() ?? 'none'}', workingDirectory='${folder?.workingDirectory.toString() ?? 'none'}', gitRepository='${gitRepository?.uri.toString() ?? 'none'}', hasGitHubRemote=${String(gitRepository?.hasGitHubRemote)}, gitHubRepository='${gitHubInfo ? `${gitHubInfo.owner}/${gitHubInfo.repo}` : 'none'}'.`);
	}

	private _createRepositoryContext(session: IActiveSession, workspaceUri: string, folderUri: string, repository: IGitHubRemoteInfo): INewSessionViewV3RepositoryContext {
		return {
			session,
			workspaceUri,
			folderUri,
			repository,
		};
	}

	private _isCurrentRepositoryContext(context: INewSessionViewV3RepositoryContext): boolean {
		const activeSession = this._sessionsService.activeSession.get();
		const workspace = activeSession?.workspace.get();
		return activeSession === context.session
			&& workspace?.uri.toString() === context.workspaceUri
			&& workspace.folders[0]?.workingDirectory.toString() === context.folderUri;
	}

	private async _resolvePrompt(fallbackReason: NewSessionViewV3FallbackReason): Promise<INewSessionViewV3PromptPlan> {
		const [promptTemplateTreatment, placeholderTreatment] = await Promise.all([
			this._assignmentService.getTreatment<string>(PROMPT_TEMPLATE_TREATMENT),
			this._assignmentService.getTreatment<string>(PLACEHOLDER_TREATMENT),
		]);
		const hasTreatment = typeof promptTemplateTreatment === 'string' && !!promptTemplateTreatment.trim()
			&& typeof placeholderTreatment === 'string' && !!placeholderTreatment.trim();
		const promptTemplate = hasTreatment ? promptTemplateTreatment : DEFAULT_PROMPT_TEMPLATE;
		const taskPlaceholder = hasTreatment ? placeholderTreatment : DEFAULT_TASK_PLACEHOLDER;
		if (hasTreatment) {
			this._logService.info(`${LOG_PREFIX} Using prompt template and placeholder from paired treatments.`);
		} else {
			this._logService.info(`${LOG_PREFIX} Prompt treatments were not both set to non-empty strings; using the default prompt template and placeholder.`);
		}

		return {
			prompt: format(promptTemplate, taskPlaceholder),
			taskPlaceholder,
			effectiveStrategy: 'prompt',
			fallbackReason,
		};
	}

	private _createGitHubPrompt(candidate: INewSessionViewV3GitHubCandidate): INewSessionViewV3PromptPlan {
		const prompt = candidate.strategy === 'githubCiFailure'
			? localize('sessions.onboarding.newSessionViewV3.githubPrompt.ciFailure', "The following pull request has failing CI checks: \"{0}\" ({1}). Investigate the failures and resolve them.", candidate.title, candidate.url)
			: candidate.strategy === 'githubReviewComments'
				? localize('sessions.onboarding.newSessionViewV3.githubPrompt.reviewComments', "The following pull request has unresolved review comments that have not been addressed by a newer commit: \"{0}\" ({1}). Address the review comments and update the pull request.", candidate.title, candidate.url)
				: localize('sessions.onboarding.newSessionViewV3.githubPrompt.issue', "Tackle the following issue and create a pull request for it: \"{0}\" ({1}).", candidate.title, candidate.url);
		return {
			prompt,
			taskPlaceholder: '',
			effectiveStrategy: candidate.strategy,
			fallbackReason: 'none',
		};
	}

	private _animatePrompt(prompt: string, taskPlaceholder: string, token: CancellationToken): Promise<boolean> | boolean {
		const activeSession = this._sessionsService.activeSession.get();
		if (activeSession?.isCreated.get()) {
			this._logService.warn(`${LOG_PREFIX} Skipping prompt insertion because the active session was created before animation started.`);
			return false;
		}
		const composer = this._newSessionComposerService.activeComposer.get();
		if (!composer) {
			this._logService.warn(`${LOG_PREFIX} Skipping prompt insertion because no active new-session composer is available.`);
			return false;
		}
		this._logService.trace(`${LOG_PREFIX} Animating the resolved prompt in the active new-session composer.`);
		return composer.animatePrompt(prompt, PROMPT_TYPING_DURATION_MS, taskPlaceholder, token);
	}

	private _reportStrategy(configuredVariation: NewSessionViewV3ConfiguredVariation, plan: INewSessionViewV3PromptPlan, shown: boolean): void {
		type OnboardingPromptStrategyEvent = {
			scenarioId: string;
			configuredVariation: string;
			effectiveStrategy: string;
			fallbackReason: string;
			shown: boolean;
		};
		type OnboardingPromptStrategyClassification = {
			owner: 'benibenj';
			comment: 'Reports which prompt strategy an onboarding tour selected without collecting prompt or repository content.';
			scenarioId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The id of the onboarding scenario that ran.' };
			configuredVariation: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The configured prompt variation, reduced to a known category.' };
			effectiveStrategy: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The effective prompt strategy selected for the tour.' };
			fallbackReason: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The categorical reason a configured strategy fell back to the default prompt.' };
			shown: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the selected prompt was inserted into the chat input.' };
		};
		this._telemetryService.publicLog2<OnboardingPromptStrategyEvent, OnboardingPromptStrategyClassification>('onboarding.promptStrategy', {
			scenarioId: NEW_SESSION_VIEW_V3_TOUR_ID,
			configuredVariation,
			effectiveStrategy: plan.effectiveStrategy,
			fallbackReason: plan.fallbackReason,
			shown,
		});
	}
}

export function selectNewSessionViewV3GitHubCandidate(recentWork: IGitHubRecentUserWork): INewSessionViewV3GitHubCandidate | undefined {
	const pullRequests = [...recentWork.pullRequests].sort(compareUpdatedAtDescending);
	const failingPullRequest = pullRequests.find(isFailingPullRequest);
	if (failingPullRequest) {
		return toCandidate(failingPullRequest, 'githubCiFailure');
	}

	const reviewPullRequest = pullRequests.find(hasUnaddressedReviewComments);
	if (reviewPullRequest) {
		return toCandidate(reviewPullRequest, 'githubReviewComments');
	}

	const issue = [...recentWork.issues].sort(compareUpdatedAtDescending)[0];
	return issue ? { title: issue.title, url: issue.url, strategy: 'githubIssue' } : undefined;
}

function isFailingPullRequest(pullRequest: IGitHubRecentPullRequest): boolean {
	return pullRequest.statusCheckRollupState === 'FAILURE' || pullRequest.statusCheckRollupState === 'ERROR';
}

function hasUnaddressedReviewComments(pullRequest: IGitHubRecentPullRequest): boolean {
	const latestCommitAt = pullRequest.latestCommitAt ? Date.parse(pullRequest.latestCommitAt) : NaN;
	if (!Number.isFinite(latestCommitAt)) {
		return false;
	}
	return (pullRequest.reviewThreads ?? []).some(thread => {
		const latestCommentAt = thread.latestCommentAt ? Date.parse(thread.latestCommentAt) : NaN;
		return !thread.isResolved && Number.isFinite(latestCommentAt) && latestCommentAt > latestCommitAt;
	});
}

function getLookupFallbackReason(failures: readonly GitHubLookupFailureReason[]): Extract<NewSessionViewV3FallbackReason, 'noAuthentication' | 'timeout' | 'requestFailed' | 'noCandidate'> {
	if (failures.includes('noAuthentication')) {
		return 'noAuthentication';
	}
	if (failures.includes('timeout')) {
		return 'timeout';
	}
	if (failures.includes('requestFailed')) {
		return 'requestFailed';
	}
	return 'noCandidate';
}

function compareUpdatedAtDescending(a: { readonly updatedAt: string }, b: { readonly updatedAt: string }): number {
	return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
}

function toCandidate(pullRequest: IGitHubRecentPullRequest, strategy: 'githubCiFailure' | 'githubReviewComments'): INewSessionViewV3GitHubCandidate {
	return { title: pullRequest.title, url: pullRequest.url, strategy };
}

function capitalize(value: string): string {
	return value.length > 0 ? value[0].toUpperCase() + value.slice(1) : value;
}
