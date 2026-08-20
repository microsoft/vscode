/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
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
import { INewSessionComposer, INewSessionComposerService, INewSessionPromptOption, INewSessionPromptOptionsController, NEW_SESSION_PROMPT_TYPING_DURATION_MS, NewSessionPromptOptionsState } from '../../chat/browser/newSessionComposerService.js';
import { getGitHubRepositoryFromUri } from '../../github/common/utils.js';
import { GitHubAuthenticationError } from '../../github/browser/githubApiClient.js';
import { IGitHubRecentIssue, IGitHubRecentPullRequest, IGitHubRecentUserWork } from '../../github/browser/fetchers/githubRecentUserWorkFetcher.js';
import { IGitHubService } from '../../github/browser/githubService.js';
import { computeIssueIcon, computePullRequestIcon, GitHubIssueState, GitHubPullRequestState } from '../../github/common/types.js';
import { resolveGitHubRepositoryFromGitConfig } from './gitHubRepositoryResolver.js';
import { NEW_SESSION_VIEW_V3_GITHUB_PROMPT_VARIATION, NEW_SESSION_VIEW_V3_OPTIONS_VARIATION, NEW_SESSION_VIEW_V3_PROMPT_VARIATION, NEW_SESSION_VIEW_V3_TOUR_ID, NEW_SESSION_VIEW_V3_VARIATION_TREATMENT } from './tours/newSessionViewV3Tour.js';

const DEFAULT_GITHUB_LOOKUP_TIMEOUTS = {
	totalMs: 10_000,
	summaryMs: 5_000,
	linkageMs: 2_500,
	reviewMs: 4_000,
};
const LOG_PREFIX = '[NewSessionViewV3Prompt]';
const PROMPT_TEMPLATE_TREATMENT = 'onb.newSessionViewV3.promptTemplate';
const PLACEHOLDER_TREATMENT = 'onb.newSessionViewV3.placeholder';
const DEFAULT_TASK_PLACEHOLDER = localize('sessions.onboarding.newSessionViewV3.prompt.taskPlaceholder', "[describe the coding task]");
const DEFAULT_PROMPT_TEMPLATE = localize('sessions.onboarding.newSessionViewV3.prompt.text', "Help me complete {0} in this project. First, inspect the relevant files and explain your approach briefly. Then implement the solution using existing project conventions, avoid unrelated changes, and run the most relevant tests or checks. If anything is unclear, make a reasonable assumption and state it. When finished, summarize what changed and mention any remaining issues.");
const PROMPT_OPTION_COUNT = 3;

export type NewSessionViewV3ConfiguredVariation = 'prompt' | 'githubPrompt' | 'options' | 'unknown';
export type NewSessionViewV3EffectiveStrategy = 'prompt' | 'options' | 'githubMergeConflict' | 'githubCiFailure' | 'githubReviewComments' | 'githubIssue';
export type NewSessionViewV3FallbackReason = 'none' | 'unsupportedVariation' | 'noRepository' | 'noAuthentication' | 'timeout' | 'requestFailed' | 'noCandidate';

interface INewSessionViewV3PromptPlan {
	readonly prompt: string;
	readonly taskPlaceholder: string;
	readonly effectiveStrategy: NewSessionViewV3EffectiveStrategy;
	readonly fallbackReason: NewSessionViewV3FallbackReason;
}

interface INewSessionViewV3GitHubCandidate {
	readonly number: number;
	readonly title: string;
	readonly url: string;
	readonly strategy: Exclude<NewSessionViewV3EffectiveStrategy, 'prompt' | 'options'>;
}

interface INewSessionViewV3PromptOptionsPlan {
	readonly options: readonly INewSessionPromptOption[];
	readonly fallbackReason: NewSessionViewV3FallbackReason;
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
	readonly candidates: readonly INewSessionViewV3GitHubCandidate[];
	readonly failures: readonly GitHubLookupFailureReason[];
}

interface IGitHubCandidateLookupResult {
	readonly candidates: readonly INewSessionViewV3GitHubCandidate[];
	readonly failures: readonly GitHubLookupFailureReason[];
}

type GitHubPromptOptionsResult =
	| {
		readonly kind: 'candidates';
		readonly issueCandidates: readonly INewSessionViewV3GitHubCandidate[];
		readonly pullRequestCandidates: readonly INewSessionViewV3GitHubCandidate[];
		readonly failures: readonly GitHubLookupFailureReason[];
	}
	| { readonly kind: 'fallback'; readonly reason: Extract<NewSessionViewV3FallbackReason, 'noRepository' | 'noAuthentication' | 'timeout' | 'requestFailed' | 'noCandidate'> };

interface IGitHubPromptOptionsProgress {
	readonly context: INewSessionViewV3RepositoryContext;
	readonly issueCandidates: readonly INewSessionViewV3GitHubCandidate[];
	readonly pullRequestCandidates: readonly INewSessionViewV3GitHubCandidate[];
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

		if (configuredVariation === 'options' || configuredVariation === 'unknown') {
			return this._runPromptOptions(configuredVariation, token, configuredVariation === 'unknown' ? 'unsupportedVariation' : undefined);
		}

		const plan = configuredVariation === 'githubPrompt'
			? await this._resolveGitHubPromptWithFallback(token)
			: await this._resolvePrompt('none');
		if (token.isCancellationRequested) {
			this._logService.trace(`${LOG_PREFIX} Prompt resolution was cancelled before prompt insertion.`);
			return false;
		}

		this._logService.info(`${LOG_PREFIX} Resolved effective strategy '${plan.effectiveStrategy}' with fallback reason '${plan.fallbackReason}'.`);
		const shown = await this._animatePrompt(plan.prompt, plan.taskPlaceholder, token);
		this._logService.info(`${LOG_PREFIX} Prompt insertion completed with shown=${shown}.`);
		this._reportStrategy(configuredVariation, plan.effectiveStrategy, plan.fallbackReason, shown);
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
		this._logService.info(`${LOG_PREFIX} Treatment variation resolved to '${treatmentVariation || NEW_SESSION_VIEW_V3_OPTIONS_VARIATION}'.`);
		return this._normalizeVariation(treatmentVariation, 'treatment');
	}

	private _normalizeVariation(variation: string | undefined, source: string): NewSessionViewV3ConfiguredVariation {
		if (variation === undefined || variation === '' || variation === NEW_SESSION_VIEW_V3_OPTIONS_VARIATION) {
			return 'options';
		}
		if (variation === NEW_SESSION_VIEW_V3_PROMPT_VARIATION) {
			return 'prompt';
		}
		if (variation === NEW_SESSION_VIEW_V3_GITHUB_PROMPT_VARIATION) {
			return 'githubPrompt';
		}
		this._logService.warn(`${LOG_PREFIX} Unsupported variation '${variation}' from ${source}; using '${NEW_SESSION_VIEW_V3_OPTIONS_VARIATION}'.`);
		return 'unknown';
	}

	private async _runPromptOptions(configuredVariation: NewSessionViewV3ConfiguredVariation, token: CancellationToken, configuredFallbackReason?: NewSessionViewV3FallbackReason): Promise<boolean> {
		const composer = this._getActiveComposer();
		if (!composer) {
			this._logService.warn(`${LOG_PREFIX} Skipping prompt options because no active new-session composer is available.`);
			this._reportStrategy(configuredVariation, 'options', 'noCandidate', false);
			return false;
		}

		let latestPlan: INewSessionViewV3PromptOptionsPlan | undefined;
		const resolveOptions = async (refreshToken: CancellationToken): Promise<NewSessionPromptOptionsState> => {
			latestPlan = await this._resolveGitHubPromptOptionsWithFallback(refreshToken);
			return { kind: 'resolved', options: latestPlan.options };
		};
		if (composer.setPromptOptionsController && composer.refreshPromptOptions) {
			const controller: INewSessionPromptOptionsController = {
				resolve: resolveOptions,
				onDidSelectOption: option => this._reportPromptOptionInteraction('selected', option),
				onDidClose: () => this._reportPromptOptionInteraction('closed'),
			};
			composer.setPromptOptionsController(controller);
			this._logService.info(`${LOG_PREFIX} Showing prompt option loading skeletons.`);
			const shown = await composer.refreshPromptOptions(token);
			const fallbackReason = configuredFallbackReason ?? latestPlan?.fallbackReason ?? (token.isCancellationRequested ? 'requestFailed' : 'noCandidate');
			this._logService.info(`${LOG_PREFIX} Prompt options completed with shown=${shown} and fallback reason '${fallbackReason}'.`);
			this._reportStrategy(configuredVariation, 'options', fallbackReason, shown);
			return shown;
		}

		if (!composer.showPromptOptions({ kind: 'loading' })) {
			this._logService.warn(`${LOG_PREFIX} Skipping prompt options because the active new-session composer cannot show them.`);
			this._reportStrategy(configuredVariation, 'options', 'noCandidate', false);
			return false;
		}
		this._logService.info(`${LOG_PREFIX} Showing prompt option loading skeletons.`);
		const state = await resolveOptions(token);
		if (token.isCancellationRequested || this._newSessionComposerService.activeComposer.get() !== composer || this._sessionsService.activeSession.get()?.isCreated.get()) {
			composer.showPromptOptions(undefined);
			this._logService.trace(`${LOG_PREFIX} Prompt option resolution was cancelled or its composer is no longer active.`);
			this._reportStrategy(configuredVariation, 'options', configuredFallbackReason ?? latestPlan?.fallbackReason ?? 'requestFailed', false);
			return false;
		}

		const shown = composer.showPromptOptions(state);
		const fallbackReason = configuredFallbackReason ?? latestPlan?.fallbackReason ?? 'noCandidate';
		this._logService.info(`${LOG_PREFIX} Prompt options completed with shown=${shown} and fallback reason '${fallbackReason}'.`);
		this._reportStrategy(configuredVariation, 'options', fallbackReason, shown);
		return shown;
	}

	private _getActiveComposer(): INewSessionComposer | undefined {
		const activeSession = this._sessionsService.activeSession.get();
		if (activeSession?.isCreated.get()) {
			return undefined;
		}
		return this._newSessionComposerService.activeComposer.get();
	}

	private async _resolveGitHubPromptOptionsWithFallback(token: CancellationToken): Promise<INewSessionViewV3PromptOptionsPlan> {
		this._logService.info(`${LOG_PREFIX} Starting GitHub prompt option lookup with a ${this._gitHubLookupTimeouts.totalMs}ms total timeout.`);
		const operationCts = new CancellationTokenSource(token);
		let latestProgress: IGitHubPromptOptionsProgress | undefined;
		let timedOut = false;
		const createTimeoutPlan = () => {
			const candidates = latestProgress && this._isCurrentRepositoryContext(latestProgress.context)
				? [...latestProgress.issueCandidates, ...latestProgress.pullRequestCandidates]
				: [];
			return this._createPromptOptionsPlan(candidates.slice(0, PROMPT_OPTION_COUNT), candidates.length === PROMPT_OPTION_COUNT ? 'none' : 'timeout');
		};
		try {
			const result = await raceTimeout(
				this._resolveGitHubPromptOptions(operationCts.token, progress => latestProgress = progress),
				this._gitHubLookupTimeouts.totalMs,
				() => {
					timedOut = true;
					this._logService.warn(`${LOG_PREFIX} GitHub prompt option lookup timed out after ${this._gitHubLookupTimeouts.totalMs}ms; filling with standard options.`);
					operationCts.cancel();
				},
			);
			if (timedOut || !result) {
				return createTimeoutPlan();
			}
			if (result.kind === 'fallback') {
				return this._createPromptOptionsPlan([], result.reason);
			}

			const candidates = [...result.issueCandidates, ...result.pullRequestCandidates].slice(0, PROMPT_OPTION_COUNT);
			const fallbackReason = candidates.length === PROMPT_OPTION_COUNT ? 'none' : getLookupFallbackReason(result.failures);
			return this._createPromptOptionsPlan(candidates, fallbackReason);
		} catch (error) {
			if (isCancellationError(error) && timedOut) {
				return createTimeoutPlan();
			}
			if (isCancellationError(error) && token.isCancellationRequested) {
				this._logService.trace(`${LOG_PREFIX} GitHub prompt option lookup was cancelled by the onboarding flow.`);
				return this._createPromptOptionsPlan([], 'requestFailed');
			}
			if (error instanceof GitHubAuthenticationError) {
				this._logService.warn(`${LOG_PREFIX} No existing GitHub authentication session is available; filling with standard options without requesting sign-in.`);
				return this._createPromptOptionsPlan([], 'noAuthentication');
			}
			this._logService.error(`${LOG_PREFIX} GitHub prompt option lookup failed; filling with standard options.`, error);
			return this._createPromptOptionsPlan([], 'requestFailed');
		} finally {
			operationCts.dispose();
		}
	}

	private async _resolveGitHubPromptOptions(token: CancellationToken, reportProgress: (progress: IGitHubPromptOptionsProgress) => void): Promise<GitHubPromptOptionsResult> {
		while (!token.isCancellationRequested) {
			const context = await this._resolveGitHubRepository(token);
			if (!context) {
				this._logService.warn(`${LOG_PREFIX} Could not resolve a GitHub repository for prompt options.`);
				return { kind: 'fallback', reason: 'noRepository' };
			}

			const lookupCts = new CancellationTokenSource(token);
			try {
				const owner = context.repository.owner;
				const repo = context.repository.repo;
				let issueResult: IGitHubCandidateLookupResult | undefined;
				let pullRequestResult: IGitHubCandidateLookupResult | undefined;
				const publishProgress = () => {
					if (this._isCurrentRepositoryContext(context)) {
						reportProgress({
							context,
							issueCandidates: issueResult?.candidates ?? [],
							pullRequestCandidates: pullRequestResult?.candidates ?? [],
							failures: [...(issueResult?.failures ?? []), ...(pullRequestResult?.failures ?? [])],
						});
					}
				};
				publishProgress();
				const resolveIssues = async () => {
					issueResult = await this._resolveIssuePromptOptionCandidates(owner, repo, lookupCts.token);
					publishProgress();
					return issueResult;
				};
				const resolvePullRequests = async () => {
					pullRequestResult = await this._resolvePullRequestPromptOptionCandidates(owner, repo, lookupCts.token, candidates => {
						pullRequestResult = { candidates, failures: [] };
						publishProgress();
					});
					publishProgress();
					return pullRequestResult;
				};
				const [issues, pullRequests] = await Promise.all([
					resolveIssues(),
					resolvePullRequests(),
				]);
				if (!this._isCurrentRepositoryContext(context)) {
					this._logService.info(`${LOG_PREFIX} The selected workspace changed during prompt option lookup; retrying for the current workspace.`);
					continue;
				}
				return {
					kind: 'candidates',
					issueCandidates: issues.candidates,
					pullRequestCandidates: pullRequests.candidates,
					failures: [...issues.failures, ...pullRequests.failures],
				};
			} finally {
				lookupCts.dispose(true);
			}
		}
		return { kind: 'fallback', reason: 'noRepository' };
	}

	private async _resolveIssuePromptOptionCandidates(owner: string, repo: string, token: CancellationToken): Promise<IGitHubCandidateLookupResult> {
		const outcome = await this._resolveIssueCandidates(owner, repo, token);
		if (outcome.kind === 'failure') {
			return { candidates: [], failures: [outcome.reason] };
		}
		const candidates = [...outcome.value]
			.sort(compareUpdatedAtDescending)
			.slice(0, 2)
			.map(issue => ({ number: issue.number, title: issue.title, url: issue.url, strategy: 'githubIssue' as const }));
		return { candidates, failures: [] };
	}

	private async _resolvePullRequestPromptOptionCandidates(
		owner: string,
		repo: string,
		token: CancellationToken,
		reportCandidates: (candidates: readonly INewSessionViewV3GitHubCandidate[]) => void = () => undefined,
	): Promise<IGitHubCandidateLookupResult> {
		const summary = await this._runGitHubLookup(
			'authored pull request summaries',
			this._gitHubLookupTimeouts.summaryMs,
			token,
			lookupToken => this._gitHubService.getRecentAuthoredPullRequests(owner, repo, lookupToken),
		);
		if (summary.kind === 'failure') {
			return { candidates: [], failures: [summary.reason] };
		}

		const pullRequests = [...summary.value].sort(compareUpdatedAtDescending);
		const directCandidates = pullRequests
			.map((pullRequest, index) => ({ index, candidate: toDirectPullRequestCandidate(pullRequest) }))
			.filter((entry): entry is { readonly index: number; readonly candidate: INewSessionViewV3GitHubCandidate } => entry.candidate !== undefined);
		const secondDirectCandidateIndex = directCandidates[1]?.index ?? pullRequests.length;
		const reviewPullRequests = pullRequests
			.slice(0, secondDirectCandidateIndex)
			.filter(pullRequest => !toDirectPullRequestCandidate(pullRequest));
		const stableCandidates = getCandidatesInPullRequestOrder(
			pullRequests.slice(0, reviewPullRequests[0] ? pullRequests.indexOf(reviewPullRequests[0]) : secondDirectCandidateIndex),
			directCandidates.map(entry => entry.candidate),
		).slice(0, 2);
		if (stableCandidates.length > 0) {
			reportCandidates(stableCandidates);
		}

		const reviewLookup = await this._resolveReviewCandidates(owner, repo, reviewPullRequests, token);
		const candidates = getCandidatesInPullRequestOrder(
			pullRequests,
			[...directCandidates.map(entry => entry.candidate), ...reviewLookup.candidates],
		).slice(0, 2);
		reportCandidates(candidates);
		return {
			candidates,
			failures: reviewLookup.failures,
		};
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
					const directCandidates = pullRequests
						.map((pullRequest, index) => ({ index, candidate: toDirectPullRequestCandidate(pullRequest) }))
						.filter((entry): entry is { readonly index: number; readonly candidate: INewSessionViewV3GitHubCandidate } => entry.candidate !== undefined);
					this._logService.info(`${LOG_PREFIX} Pull request summary lookup returned ${pullRequests.length} open authored pull request(s), including ${pullRequests.filter(pullRequest => pullRequest.hasMergeConflicts).length} with merge conflicts and ${pullRequests.filter(isFailingPullRequest).length} with failing CI.`);
					if (directCandidates[0]?.index === 0) {
						return { kind: 'candidate', candidate: directCandidates[0].candidate };
					}

					const firstDirectCandidateIndex = directCandidates[0]?.index ?? pullRequests.length;
					const reviewPullRequests = pullRequests
						.slice(0, firstDirectCandidateIndex)
						.filter(pullRequest => !toDirectPullRequestCandidate(pullRequest));
					const reviewLookup = await this._resolveReviewCandidates(owner, repo, reviewPullRequests, lookupCts.token);
					failures.push(...reviewLookup.failures);
					if (!this._isCurrentRepositoryContext(context)) {
						this._logService.info(`${LOG_PREFIX} The selected workspace changed during review lookup; retrying for the current workspace.`);
						continue;
					}
					const candidate = getCandidatesInPullRequestOrder(
						pullRequests,
						[...directCandidates.map(entry => entry.candidate), ...reviewLookup.candidates],
					)[0];
					if (candidate) {
						return { kind: 'candidate', candidate };
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
						return { kind: 'candidate', candidate: { number: issue.number, title: issue.title, url: issue.url, strategy: 'githubIssue' } };
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

	private async _resolveReviewCandidates(
		owner: string,
		repo: string,
		pullRequests: readonly IGitHubRecentPullRequest[],
		token: CancellationToken,
	): Promise<IGitHubReviewLookupResult> {
		const eligiblePullRequests = pullRequests.filter(pullRequest => !!pullRequest.latestCommitAt);
		if (eligiblePullRequests.length === 0) {
			this._logService.info(`${LOG_PREFIX} No pull requests have a latest commit timestamp, so review-thread lookup is unnecessary.`);
			return { candidates: [], failures: [] };
		}

		this._logService.info(`${LOG_PREFIX} Starting ${eligiblePullRequests.length} independent review-thread lookup(s).`);
		const results = await Promise.all(eligiblePullRequests.map(async pullRequest => {
			const outcome = await this._runGitHubLookup(
				`review threads for pull request #${pullRequest.number}`,
				this._gitHubLookupTimeouts.reviewMs,
				token,
				lookupToken => this._gitHubService.getPullRequestReviewThreads(owner, repo, pullRequest.number, lookupToken),
			);
			if (outcome.kind === 'success') {
				const completedPullRequest = { ...pullRequest, reviewThreads: outcome.value };
				return { pullRequest: completedPullRequest, outcome };
			}
			return { pullRequest, outcome };
		}));
		const completedPullRequests: IGitHubRecentPullRequest[] = [];
		const failures: GitHubLookupFailureReason[] = [];
		for (const result of results) {
			if (result.outcome.kind === 'success') {
				completedPullRequests.push(result.pullRequest);
			} else {
				failures.push(result.outcome.reason);
			}
		}

		const reviewPullRequests = completedPullRequests.sort(compareUpdatedAtDescending).filter(hasUnaddressedReviewComments);
		this._logService.info(`${LOG_PREFIX} Review-thread lookups completed for ${completedPullRequests.length} of ${eligiblePullRequests.length} pull request(s); ${reviewPullRequests.length} eligible pull request(s) were found.`);
		return {
			candidates: reviewPullRequests.map(pullRequest => toCandidate(pullRequest, 'githubReviewComments')),
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
			const enterpriseHost = this._gitHubService.enterpriseHost;
			const supportedHosts = enterpriseHost ? [enterpriseHost] : undefined;
			this._logWorkspaceSnapshot(activeSession);
			if (!workspace || !folder) {
				this._logService.trace(`${LOG_PREFIX} The active draft has no primary workspace folder.`);
				return undefined;
			}
			const gitHubInfo = folder.gitRepository?.gitHubInfo.get();
			if (!enterpriseHost && gitHubInfo) {
				this._logService.info(`${LOG_PREFIX} Resolved GitHub repository '${gitHubInfo.owner}/${gitHubInfo.repo}' from session metadata.`);
				return this._createRepositoryContext(activeSession, workspace.uri.toString(), folder.workingDirectory.toString(), { owner: gitHubInfo.owner, repo: gitHubInfo.repo });
			}
			const repositoryFromUri = enterpriseHost ? undefined : getGitHubRepositoryFromUri(folder.root)
				?? getGitHubRepositoryFromUri(folder.workingDirectory)
				?? (folder.gitRepository ? getGitHubRepositoryFromUri(folder.gitRepository.uri) : undefined);
			if (repositoryFromUri) {
				this._logService.info(`${LOG_PREFIX} Resolved GitHub repository '${repositoryFromUri.owner}/${repositoryFromUri.repo}' from the workspace URI.`);
				return this._createRepositoryContext(activeSession, workspace.uri.toString(), folder.workingDirectory.toString(), repositoryFromUri);
			}

			try {
				const repositoryFromConfig = await resolveGitHubRepositoryFromGitConfig(this._fileService, folder.workingDirectory, supportedHosts);
				if (repositoryFromConfig) {
					this._logService.info(`${LOG_PREFIX} Resolved GitHub repository '${repositoryFromConfig.owner}/${repositoryFromConfig.repo}' directly from .git/config.`);
					return this._createRepositoryContext(activeSession, workspace.uri.toString(), folder.workingDirectory.toString(), repositoryFromConfig);
				}
				this._logService.trace(`${LOG_PREFIX} No supported GitHub remote was found directly in .git/config.`);
			} catch (error) {
				this._logService.warn(`${LOG_PREFIX} Reading Git repository metadata directly from the selected workspace failed.`, error);
			}

			if (!enterpriseHost && isAgentHostProviderId(activeSession.providerId)) {
				this._logService.info(`${LOG_PREFIX} Waiting for Agent Host git metadata for the active draft.`);
				const result = await this._waitForAgentHostRepository(activeSession, token);
				if (result.kind === 'sessionChanged') {
					this._logService.info(`${LOG_PREFIX} The active draft changed while waiting for Agent Host git metadata; retrying.`);
					continue;
				}
				if (result.kind === 'noGitHubRemote') {
					this._logService.info(`${LOG_PREFIX} Agent Host git metadata reports that the selected workspace has no GitHub remote.`);
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
			const repositoryFromRemote = getGitHubRemoteInfo(repository.state.get(), supportedHosts);
			if (!repositoryFromRemote) {
				this._logService.trace(`${LOG_PREFIX} The selected Git repository has no supported GitHub remote.`);
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

	private _createPromptOptionsPlan(candidates: readonly INewSessionViewV3GitHubCandidate[], fallbackReason: NewSessionViewV3FallbackReason): INewSessionViewV3PromptOptionsPlan {
		const gitHubOptions = candidates.slice(0, PROMPT_OPTION_COUNT).map(candidate => this._createGitHubPromptOption(candidate));
		const standardOptions = this._createStandardPromptOptions();
		return {
			options: [...gitHubOptions, ...standardOptions.slice(0, PROMPT_OPTION_COUNT - gitHubOptions.length)],
			fallbackReason,
		};
	}

	private _createGitHubPromptOption(candidate: INewSessionViewV3GitHubCandidate): INewSessionPromptOption {
		const plan = this._createGitHubPrompt(candidate);
		const title = candidate.strategy === 'githubIssue'
			? localize('sessions.onboarding.newSessionViewV3.options.githubIssue.title', "Tackle issue")
			: candidate.strategy === 'githubMergeConflict'
				? localize('sessions.onboarding.newSessionViewV3.options.githubConflicts.title', "Resolve conflicts")
				: candidate.strategy === 'githubCiFailure'
					? localize('sessions.onboarding.newSessionViewV3.options.githubCi.title', "Fix CI")
					: localize('sessions.onboarding.newSessionViewV3.options.githubReview.title', "Address PR comments");
		const icon = candidate.strategy === 'githubIssue'
			? computeIssueIcon(GitHubIssueState.Open, undefined)
			: computePullRequestIcon(GitHubPullRequestState.Open, {
				hasMergeConflicts: candidate.strategy === 'githubMergeConflict',
				hasFailingChecks: candidate.strategy === 'githubCiFailure',
				hasUnresolvedComments: candidate.strategy === 'githubReviewComments',
			});
		return {
			id: `${candidate.strategy}:${candidate.url}`,
			title,
			titleDetail: `#${candidate.number}`,
			description: candidate.title,
			prompt: plan.prompt,
			placeholder: '',
			icon,
		};
	}

	private _createStandardPromptOptions(): readonly INewSessionPromptOption[] {
		const implementFeaturePlaceholder = localize('sessions.onboarding.newSessionViewV3.options.implementFeature.placeholder', "[describe the feature]");
		const fixBugPlaceholder = localize('sessions.onboarding.newSessionViewV3.options.fixBug.placeholder', "[describe the bug]");
		const fixCiPlaceholder = localize('sessions.onboarding.newSessionViewV3.options.fixCi.placeholder', "[describe the CI failure or paste a link]");
		return [
			{
				id: 'standard:implementFeature',
				title: localize('sessions.onboarding.newSessionViewV3.options.implementFeature.title', "Implement a feature"),
				description: localize('sessions.onboarding.newSessionViewV3.options.implementFeature.description', "Describe what you want to build"),
				prompt: localize('sessions.onboarding.newSessionViewV3.options.implementFeature.prompt', "Help me implement {0} in this project. Ask me questions if anything is unclear regarding the intended behaviour.", implementFeaturePlaceholder),
				placeholder: implementFeaturePlaceholder,
				icon: Codicon.lightbulbSparkleAutofix,
			},
			{
				id: 'standard:fixBug',
				title: localize('sessions.onboarding.newSessionViewV3.options.fixBug.title', "Fix a bug"),
				description: localize('sessions.onboarding.newSessionViewV3.options.fixBug.description', "Describe the unexpected behavior"),
				prompt: localize('sessions.onboarding.newSessionViewV3.options.fixBug.prompt', "Help me fix {0} in this project. Ask me questions if anything is unclear regarding the bug or the intended behaviour.", fixBugPlaceholder),
				placeholder: fixBugPlaceholder,
				icon: Codicon.bug,
			},
			{
				id: 'standard:fixCi',
				title: localize('sessions.onboarding.newSessionViewV3.options.fixCi.title', "Fix CI"),
				description: localize('sessions.onboarding.newSessionViewV3.options.fixCi.description', "Describe a failing check or paste a link"),
				prompt: localize('sessions.onboarding.newSessionViewV3.options.fixCi.prompt', "Help me fix the failing CI for {0} in this project. Ask me questions if anything is unclear regarding the CI failure or how it should be fixed.", fixCiPlaceholder),
				placeholder: fixCiPlaceholder,
				icon: Codicon.runErrors,
			},
		];
	}

	private _createGitHubPrompt(candidate: INewSessionViewV3GitHubCandidate): INewSessionViewV3PromptPlan {
		const prompt = candidate.strategy === 'githubMergeConflict'
			? localize('sessions.onboarding.newSessionViewV3.githubPrompt.mergeConflict', "The following pull request has merge conflicts: \"{0}\" ({1}). Resolve the conflicts and update the pull request.", candidate.title, candidate.url)
			: candidate.strategy === 'githubCiFailure'
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
		return composer.animatePrompt(prompt, NEW_SESSION_PROMPT_TYPING_DURATION_MS, taskPlaceholder, token);
	}

	private _reportStrategy(configuredVariation: NewSessionViewV3ConfiguredVariation, effectiveStrategy: NewSessionViewV3EffectiveStrategy, fallbackReason: NewSessionViewV3FallbackReason, shown: boolean): void {
		type OnboardingPromptStrategyEvent = {
			scenarioId: string;
			configuredVariation: string;
			effectiveStrategy: string;
			fallbackReason: string;
			shown: boolean;
		};
		type OnboardingPromptStrategyClassification = {
			owner: 'benibenj';
			comment: 'Reports which prompt experience an onboarding tour selected without collecting prompt or repository content.';
			scenarioId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The id of the onboarding scenario that ran.' };
			configuredVariation: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The configured prompt experience, reduced to a known category.' };
			effectiveStrategy: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The effective prompt or prompt-option strategy selected for the tour.' };
			fallbackReason: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The categorical reason GitHub personalization fell back to a default prompt or standard options.' };
			shown: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the selected prompt or prompt-option widget was shown.' };
		};
		this._telemetryService.publicLog2<OnboardingPromptStrategyEvent, OnboardingPromptStrategyClassification>('onboarding.promptStrategy', {
			scenarioId: NEW_SESSION_VIEW_V3_TOUR_ID,
			configuredVariation,
			effectiveStrategy,
			fallbackReason,
			shown,
		});
	}

	private _reportPromptOptionInteraction(interaction: 'selected' | 'closed', option?: INewSessionPromptOption): void {
		type OnboardingPromptOptionInteractionEvent = {
			scenarioId: string;
			interaction: string;
			option: string;
		};
		type OnboardingPromptOptionInteractionClassification = {
			owner: 'benibenj';
			comment: 'Reports privacy-safe interactions with V3 onboarding prompt options without collecting prompt or repository content.';
			scenarioId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The id of the onboarding scenario that showed the prompt options.' };
			interaction: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether an option was selected or the prompt-option widget was closed.' };
			option: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The categorical prompt option selected, or none when the widget was closed.' };
		};
		this._telemetryService.publicLog2<OnboardingPromptOptionInteractionEvent, OnboardingPromptOptionInteractionClassification>('onboarding.promptOptionInteraction', {
			scenarioId: NEW_SESSION_VIEW_V3_TOUR_ID,
			interaction,
			option: option ? getPromptOptionTelemetryKind(option) : 'none',
		});
	}
}

export function selectNewSessionViewV3GitHubCandidate(recentWork: IGitHubRecentUserWork): INewSessionViewV3GitHubCandidate | undefined {
	const pullRequests = [...recentWork.pullRequests].sort(compareUpdatedAtDescending);
	const pullRequestCandidate = pullRequests.map(toPullRequestCandidate).find(candidate => candidate !== undefined);
	if (pullRequestCandidate) {
		return pullRequestCandidate;
	}

	const issue = [...recentWork.issues].sort(compareUpdatedAtDescending)[0];
	return issue ? { number: issue.number, title: issue.title, url: issue.url, strategy: 'githubIssue' } : undefined;
}

function isFailingPullRequest(pullRequest: IGitHubRecentPullRequest): boolean {
	return pullRequest.statusCheckRollupState === 'FAILURE' || pullRequest.statusCheckRollupState === 'ERROR';
}

function toDirectPullRequestCandidate(pullRequest: IGitHubRecentPullRequest): INewSessionViewV3GitHubCandidate | undefined {
	if (pullRequest.hasMergeConflicts) {
		return toCandidate(pullRequest, 'githubMergeConflict');
	}
	if (isFailingPullRequest(pullRequest)) {
		return toCandidate(pullRequest, 'githubCiFailure');
	}
	return undefined;
}

function toPullRequestCandidate(pullRequest: IGitHubRecentPullRequest): INewSessionViewV3GitHubCandidate | undefined {
	return toDirectPullRequestCandidate(pullRequest)
		?? (hasUnaddressedReviewComments(pullRequest) ? toCandidate(pullRequest, 'githubReviewComments') : undefined);
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

function getCandidatesInPullRequestOrder(
	pullRequests: readonly IGitHubRecentPullRequest[],
	candidates: readonly INewSessionViewV3GitHubCandidate[],
): INewSessionViewV3GitHubCandidate[] {
	const candidatesByNumber = new Map(candidates.map(candidate => [candidate.number, candidate]));
	return pullRequests.map(pullRequest => candidatesByNumber.get(pullRequest.number)).filter(candidate => candidate !== undefined);
}

function toCandidate(pullRequest: IGitHubRecentPullRequest, strategy: 'githubMergeConflict' | 'githubCiFailure' | 'githubReviewComments'): INewSessionViewV3GitHubCandidate {
	return { number: pullRequest.number, title: pullRequest.title, url: pullRequest.url, strategy };
}

function getPromptOptionTelemetryKind(option: INewSessionPromptOption): 'implementFeature' | 'fixBug' | 'fixCI' | 'githubIssue' | 'githubPRConflicts' | 'githubPRCI' | 'githubPRComments' | 'unknown' {
	switch (option.id.split(':', 1)[0]) {
		case 'standard':
			switch (option.id) {
				case 'standard:implementFeature':
					return 'implementFeature';
				case 'standard:fixBug':
					return 'fixBug';
				case 'standard:fixCi':
					return 'fixCI';
				default:
					return 'unknown';
			}
		case 'githubIssue':
			return 'githubIssue';
		case 'githubMergeConflict':
			return 'githubPRConflicts';
		case 'githubCiFailure':
			return 'githubPRCI';
		case 'githubReviewComments':
			return 'githubPRComments';
		default:
			return 'unknown';
	}
}

function capitalize(value: string): string {
	return value.length > 0 ? value[0].toUpperCase() + value.slice(1) : value;
}
