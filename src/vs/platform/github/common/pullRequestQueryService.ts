/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	PullRequestCheck,
	PullRequestChecks,
	PullRequestCheckSuite,
	PullRequestComment,
	PullRequestCore,
	PullRequestFragment,
	PullRequestInlineComment,
	PullRequestMergeability,
	PullRequestRef,
	PullRequestReview,
	PullRequestReviewThread,
	PullRequestSubscriptionOptions,
} from './githubPullRequestService.js';
import { GitHubHostCapabilities, IGitHubEndpointProvider } from './githubTypes.js';
import { GitHubCredential } from './githubCredentialService.js';
import { IGitHubCapabilities } from './githubHostCapabilitiesService.js';
import { arrayProperty, asObject, booleanProperty, idProperty, nextLink, normalizedEnumProperty, nullableStringProperty, numberProperty, objectAt, objectProperty, optionalObjectProperty, requiredId, requiredString, stringProperty } from './githubResponse.js';
import { GitHubGraphQLError, GitHubRequestError, IGitHubTransport } from './githubTransport.js';
import { ILogService } from '../../log/common/log.js';
import { PullRequestRequestPlanner } from './pullRequestRequestPlanner.js';
import { annotateRequiredCheckDependencies, getRequiredPullRequestCheckNames, getUnfinishedRequiredPullRequestCheckNames, parseWorkflowJobs, WorkflowJob } from './pullRequestRequiredChecks.js';
import { IRequestScheduler, systemRequestScheduler } from './scheduler.js';

/** How long an idle check suite of an app other than GitHub Actions is awaited before it is considered not to report. */
const idleCheckSuiteGracePeriod = 10 * 1000;

export type PullRequestFragmentResult =
	| { readonly fragment: 'core'; readonly value: PullRequestCore; readonly complete: true }
	| { readonly fragment: 'topLevelComments'; readonly value: readonly PullRequestComment[]; readonly complete: true }
	| { readonly fragment: 'submittedReviews'; readonly value: readonly PullRequestReview[]; readonly complete: true }
	| { readonly fragment: 'reviewThreads'; readonly value: readonly PullRequestReviewThread[]; readonly complete: boolean; readonly headSha: string }
	| { readonly fragment: 'checks'; readonly value: PullRequestChecks; readonly complete: boolean; readonly headSha: string }
	| { readonly fragment: 'mergeability'; readonly value: PullRequestMergeability; readonly complete: boolean; readonly headSha: string };

export interface IPullRequestQuery {
	promote(signal: AbortSignal, priority: PullRequestSubscriptionOptions['priority']): void;
	fetch(
		fragment: PullRequestFragment,
		ref: PullRequestRef,
		core: PullRequestCore | undefined,
		options: PullRequestSubscriptionOptions,
		credential: GitHubCredential,
		signal: AbortSignal,
	): Promise<PullRequestFragmentResult>;
}

const maximumPaginationPages = 100;

const reviewThreadsQuery = `query AgentHostPullRequestReviewThreads($owner: String!, $repo: String!, $number: Int!, $after: String) {
	repository(owner: $owner, name: $repo) {
		pullRequest(number: $number) {
			headRefOid
			reviewThreads(first: 100, after: $after) {
				nodes {
					id isResolved isOutdated path diffSide line originalLine
					comments(first: 100) {
						nodes { id databaseId body url createdAt updatedAt path line originalLine state authorAssociation commit { oid } originalCommit { oid } author { login ... on User { databaseId } ... on Bot { databaseId } } }
						pageInfo { hasNextPage endCursor }
					}
				}
				pageInfo { hasNextPage endCursor }
			}
		}
	}
	rateLimit { limit remaining used resetAt }
}`;

const reviewThreadCommentsQuery = `query AgentHostPullRequestReviewThreadComments($threadId: ID!, $after: String) {
	node(id: $threadId) {
		... on PullRequestReviewThread {
			comments(first: 100, after: $after) {
				nodes { id databaseId body url createdAt updatedAt path line originalLine state authorAssociation commit { oid } originalCommit { oid } author { login ... on User { databaseId } ... on Bot { databaseId } } }
				pageInfo { hasNextPage endCursor }
			}
		}
	}
	rateLimit { limit remaining used resetAt }
}`;

const checksQuery = (includeRequiredness: boolean, includeWorkflowNames: boolean) => `query AgentHostPullRequestChecks($owner: String!, $repo: String!, $number: Int!, $after: String) {
	repository(owner: $owner, name: $repo) {
		pullRequest(number: $number) {
			headRefOid
			commits(last: 1) {
				nodes {
					commit {
						statusCheckRollup {
							contexts(first: 100, after: $after) {
								nodes {
									__typename
									... on CheckRun {
										databaseId name status conclusion detailsUrl
										${includeWorkflowNames ? 'checkSuite { workflowRun { databaseId file { path } workflow { name } } }' : ''}
										${includeRequiredness ? 'isRequired(pullRequestNumber: $number)' : ''}
									}
									... on StatusContext {
										id context state targetUrl
										${includeRequiredness ? 'isRequired(pullRequestNumber: $number)' : ''}
									}
								}
								pageInfo { hasNextPage endCursor }
							}
						}
					}
				}
			}
		}
	}
	rateLimit { limit remaining used resetAt }
}`;

const expectedCheckSuitesQuery = `query AgentHostPullRequestExpectedCheckSuites($owner: String!, $repo: String!, $headSha: GitObjectID!, $after: String) {
	repository(owner: $owner, name: $repo) {
		object(oid: $headSha) {
			... on Commit {
				oid
				checkSuites(first: 100, after: $after) {
					nodes { id status conclusion createdAt app { name slug } workflowRun { workflow { name } } checkRuns(first: 1) { totalCount } }
					pageInfo { hasNextPage endCursor }
				}
			}
		}
	}
	rateLimit { limit remaining used resetAt }
}`;

const mergeabilityQuery = (includeMergeQueue: boolean) => `query AgentHostPullRequestMergeability($owner: String!, $repo: String!, $number: Int!${includeMergeQueue ? ', $baseBranch: String!' : ''}) {
	repository(owner: $owner, name: $repo) {
		id nameWithOwner mergeCommitAllowed squashMergeAllowed rebaseMergeAllowed viewerPermission
		${includeMergeQueue ? 'mergeQueue(branch: $baseBranch) { id }' : ''}
		pullRequest(number: $number) {
			id headRefOid baseRefOid mergeable mergeStateStatus reviewDecision
			viewerCanUpdateBranch viewerCanEnableAutoMerge
			autoMergeRequest { enabledAt }
			mergeQueueEntry { id }
		}
	}
	rateLimit { limit remaining used resetAt }
}`;

/** Reads workflow files at a commit, each named by a `<commit>:<path>` expression in `$fileN`. */
const workflowFilesQuery = (count: number) => `query AgentHostPullRequestWorkflowFiles($owner: String!, $repo: String!${Array.from({ length: count }, (_, index) => `, $file${index}: String!`).join('')}) {
	repository(owner: $owner, name: $repo) {
		${Array.from({ length: count }, (_, index) => `file${index}: object(expression: $file${index}) { ... on Blob { text isTruncated } }`).join('\n\t\t')}
	}
	rateLimit { limit remaining used resetAt }
}`;

/** How long the required checks of a base branch are reused before its protection and rulesets are read again. */
const requiredContextsLifetime = 5 * 60 * 1000;

/** How many parsed workflow files are kept; a workflow at a commit never changes. */
const maximumCachedWorkflows = 50;

export class PullRequestQueryService implements IPullRequestQuery {

	private readonly _planner = new PullRequestRequestPlanner();

	/** Repositories whose host refused the workflow-name subselection, keyed by `owner/repo`. */
	private readonly _workflowNamesUnavailable = new Set<string>();

	/** The required checks of each base branch, keyed by `host/owner/repo#branch`. */
	private readonly _requiredContexts = new Map<string, { readonly contexts: readonly string[]; readonly observedAt: number }>();

	/** The jobs of each workflow file, keyed by `host/owner/repo@commit:path`, or `undefined` when unreadable. */
	private readonly _workflowJobs = new Map<string, ReadonlyMap<string, WorkflowJob> | undefined>();

	constructor(
		private readonly _transport: IGitHubTransport,
		private readonly _capabilities: IGitHubCapabilities,
		private readonly _endpoint: IGitHubEndpointProvider,
		private readonly _logService?: ILogService,
		private readonly _clock: Pick<IRequestScheduler, 'now'> = systemRequestScheduler,
	) { }

	promote(signal: AbortSignal, priority: PullRequestSubscriptionOptions['priority']): void {
		this._transport.promote(signal, priority);
	}

	async fetch(
		fragment: PullRequestFragment,
		ref: PullRequestRef,
		core: PullRequestCore | undefined,
		options: PullRequestSubscriptionOptions,
		credential: GitHubCredential,
		signal: AbortSignal,
	): Promise<PullRequestFragmentResult> {
		const capabilities = needsCapabilities(fragment)
			? await this._capabilities.getCapabilities(credential, signal)
			: restCapabilities;
		const plan = this._planner.plan(fragment, options.priority, capabilities);
		switch (fragment) {
			case 'core':
				return { fragment, value: await this._fetchCore(ref, credential, signal, plan.priority), complete: true };
			case 'topLevelComments':
				return {
					fragment,
					value: (await this._fetchRestArray(ref, credential, `issues/${ref.number}/comments?per_page=100`, signal, plan.priority))
						.map(item => toComment(item, options.conversation?.includeBodies === true)),
					complete: true,
				};
			case 'submittedReviews':
				return {
					fragment,
					value: (await this._fetchRestArray(ref, credential, `pulls/${ref.number}/reviews?per_page=100`, signal, plan.priority))
						.map(item => toReview(item, options.conversation?.includeBodies === true)),
					complete: true,
				};
			case 'reviewThreads':
				if (!core) {
					throw new GitHubRequestError('Pull request core is required before review threads', 'malformedResponse');
				}
				if (plan.strategy === 'unavailable') {
					return { fragment, value: [], complete: false, headSha: core.headSha };
				}
				return {
					fragment,
					value: await this._fetchReviewThreads(ref, core, credential, signal, plan.priority, options.conversation?.includeBodies === true),
					complete: true,
					headSha: core.headSha,
				};
			case 'checks':
				if (!core) {
					throw new GitHubRequestError('Pull request core is required before checks', 'malformedResponse');
				}
				if (plan.strategy === 'restChecksFallback') {
					return {
						fragment,
						value: await this._fetchChecksFallback(ref, core, credential, signal, plan.priority),
						complete: false,
						headSha: core.headSha,
					};
				}
				return {
					fragment,
					value: await this._fetchChecks(
						ref,
						core,
						credential,
						signal,
						plan.priority,
						capabilities.checkContextRequiredness,
						options.checks?.required === true,
						options.checks?.includeOptional === true,
					),
					complete: plan.completeWhenSuccessful,
					headSha: core.headSha,
				};
			case 'mergeability': {
				if (!core) {
					throw new GitHubRequestError('Pull request core is required before mergeability', 'malformedResponse');
				}
				if (plan.strategy === 'restMergeabilityFallback') {
					return {
						fragment,
						value: await this._fetchMergeabilityFallback(ref, core, credential, signal, plan.priority),
						complete: false,
						headSha: core.headSha,
					};
				}
				const mergeability = await this._fetchMergeability(ref, core, credential, signal, plan.priority, capabilities.mergeQueue);
				return {
					fragment,
					value: mergeability,
					complete: mergeability.mergeable !== 'UNKNOWN' && mergeability.queueRequirementKnown,
					headSha: mergeability.headSha,
				};
			}
		}
	}

	private async _fetchCore(ref: PullRequestRef, credential: GitHubCredential, signal: AbortSignal, priority: import('./types.js').RequestPriority): Promise<PullRequestCore> {
		const response = await this._transport.rest<unknown>(credential.account, credential.token, {
			caller: 'github.pullRequestQuery',
			method: 'GET',
			url: this._restUrl(ref, `pulls/${ref.number}`),
			etag: true,
			priority,
		}, signal);
		return toCore(response.data, ref);
	}

	private async _fetchRestArray(
		ref: PullRequestRef,
		credential: GitHubCredential,
		route: string,
		signal: AbortSignal,
		priority: import('./types.js').RequestPriority,
	): Promise<readonly unknown[]> {
		const result: unknown[] = [];
		let url: string | undefined = this._restUrl(ref, route);
		for (let page = 0; url && page < maximumPaginationPages; page++) {
			const response = await this._transport.rest<unknown>(credential.account, credential.token, {
				caller: 'github.pullRequestQuery',
				method: 'GET',
				url,
				etag: true,
				priority,
			}, signal);
			if (!Array.isArray(response.data)) {
				throw new GitHubRequestError('GitHub paginated response was not an array', 'malformedResponse');
			}
			result.push(...response.data);
			url = nextLink(response.link);
		}
		if (url) {
			throw new GitHubRequestError('GitHub pagination exceeded its page limit', 'malformedResponse');
		}
		return result;
	}

	private async _fetchReviewThreads(
		ref: PullRequestRef,
		core: PullRequestCore,
		credential: GitHubCredential,
		signal: AbortSignal,
		priority: import('./types.js').RequestPriority,
		includeBodies: boolean,
	): Promise<readonly PullRequestReviewThread[]> {
		const result: PullRequestReviewThread[] = [];
		let after: string | undefined;
		for (let page = 0; page < maximumPaginationPages; page++) {
			const response = await this._transport.graphql<unknown>(
				credential.account,
				credential.token,
				this._endpoint.getGraphQlUri(),
				reviewThreadsQuery,
				{ owner: ref.owner, repo: ref.repo, number: ref.number, after },
				signal,
				priority,
				{ caller: 'github.pullRequestQuery' },
			);
			throwGraphQLErrors(response.errors);
			const pullRequest = objectAt(response.data, 'repository', 'pullRequest');
			if (requiredString(pullRequest, 'headRefOid') !== core.headSha) {
				throw new GitHubRequestError('GitHub review threads response was for an old pull request head', 'unknown');
			}
			const connection = objectProperty(pullRequest, 'reviewThreads');
			for (const node of arrayProperty(connection, 'nodes')) {
				const thread = await this._toReviewThread(node, credential, signal, priority, includeBodies);
				result.push(thread);
			}
			const pageInfo = pageInfoFrom(connection);
			if (!pageInfo.hasNextPage) {
				return result;
			}
			after = requiredCursor(pageInfo.endCursor);
		}
		throw new GitHubRequestError('GitHub review-thread pagination exceeded its page limit', 'malformedResponse');
	}

	private async _toReviewThread(
		value: unknown,
		credential: GitHubCredential,
		signal: AbortSignal,
		priority: import('./types.js').RequestPriority,
		includeBodies: boolean,
	): Promise<PullRequestReviewThread> {
		const thread = asObject(value, 'GitHub review thread was malformed');
		const id = requiredString(thread, 'id');
		const diffSide = stringProperty(thread, 'diffSide');
		const connection = objectProperty(thread, 'comments');
		const comments = arrayProperty(connection, 'nodes').map(item => toGraphQLInlineComment(item, includeBodies, diffSide));
		let pageInfo = pageInfoFrom(connection);
		let after = pageInfo.endCursor;
		for (let page = 1; pageInfo.hasNextPage && page < maximumPaginationPages; page++) {
			const response = await this._transport.graphql<unknown>(
				credential.account,
				credential.token,
				this._endpoint.getGraphQlUri(),
				reviewThreadCommentsQuery,
				{ threadId: id, after: requiredCursor(after) },
				signal,
				priority,
				{ caller: 'github.pullRequestQuery' },
			);
			throwGraphQLErrors(response.errors);
			const nextConnection = objectAt(response.data, 'node', 'comments');
			comments.push(...arrayProperty(nextConnection, 'nodes').map(item => toGraphQLInlineComment(item, includeBodies, diffSide)));
			pageInfo = pageInfoFrom(nextConnection);
			after = pageInfo.endCursor;
		}
		if (pageInfo.hasNextPage) {
			throw new GitHubRequestError('GitHub review-thread comment pagination exceeded its page limit', 'malformedResponse');
		}
		return {
			id,
			isResolved: booleanProperty(thread, 'isResolved') ?? false,
			isOutdated: booleanProperty(thread, 'isOutdated'),
			path: stringProperty(thread, 'path'),
			diffSide,
			line: numberProperty(thread, 'line'),
			originalLine: numberProperty(thread, 'originalLine'),
			comments,
		};
	}

	/**
	 * Loads the checks of the pull request head. A subscriber that needs to
	 * know which checks are required (`loadRequired`) also gets the expected
	 * check suites, the checks the base branch requires and, while a required
	 * check has not finished, the checks it waits for; see
	 * {@link annotateRequiredCheckDependencies}.
	 */
	private async _fetchChecks(
		ref: PullRequestRef,
		core: PullRequestCore,
		credential: GitHubCredential,
		signal: AbortSignal,
		priority: import('./types.js').RequestPriority,
		includeRequiredness: boolean,
		loadRequired: boolean,
		includeOptional: boolean,
	): Promise<PullRequestChecks> {
		const rollup = await this._fetchCheckRollupWithWorkflowNames(ref, core, credential, signal, priority, includeRequiredness);
		const expected = loadRequired
			? await this._fetchExpectedCheckSuitesWhenPermitted(ref, core.headSha, credential, signal, priority)
			: { suites: [], complete: false };
		const requiredContexts = loadRequired ? await this._fetchRequiredContexts(ref, core.baseRef, credential, signal, priority) : undefined;
		let value: PullRequestChecks = {
			headSha: rollup.headSha,
			checks: rollup.checks,
			requirednessComplete: includeRequiredness,
			...(requiredContexts ? { requiredContexts } : {}),
			expectedSuites: expected.suites,
			expectedSuitesComplete: expected.complete,
		};
		const unfinished = loadRequired ? getUnfinishedRequiredPullRequestCheckNames(value) : [];
		if (unfinished.length > 0) {
			const workflows = await this._fetchWorkflowJobs(ref, rollup.headSha, rollup.checks, credential, signal, priority);
			value = { ...value, checks: annotateRequiredCheckDependencies(value.checks, unfinished, path => workflows.get(path)) };
		}
		// When nothing is required every check counts, so none is dropped as optional.
		const everyCheckCounts = getRequiredPullRequestCheckNames(value).size === 0;
		return { ...value, checks: filterChecks(value.checks, includeRequiredness, includeOptional || everyCheckCounts) };
	}

	/**
	 * Reads the checks the base branch requires from its branch protection and
	 * rulesets, which name a required check even before it reports. Falls back
	 * to the last value read, or `undefined` when there is none, so callers
	 * only see the checks GitHub reports as required.
	 */
	private async _fetchRequiredContexts(
		ref: PullRequestRef,
		baseRef: string,
		credential: GitHubCredential,
		signal: AbortSignal,
		priority: import('./types.js').RequestPriority,
	): Promise<readonly string[] | undefined> {
		// Branch names are case-sensitive, unlike the host, owner and repository.
		const key = `${ref.host}/${ref.owner}/${ref.repo}`.toLowerCase() + `#${baseRef}`;
		const cached = this._requiredContexts.get(key);
		if (cached && this._clock.now() - cached.observedAt < requiredContextsLifetime) {
			return cached.contexts;
		}
		try {
			const branch = await this._transport.rest<unknown>(credential.account, credential.token, {
				caller: 'github.pullRequestQuery',
				method: 'GET',
				url: this._restUrl(ref, `branches/${encodeURIComponent(baseRef)}`),
				etag: true,
				priority,
			}, signal);
			const contexts = new Set(toBranchProtectionContexts(branch.data));
			for (const context of await this._fetchRulesetContexts(ref, baseRef, credential, signal, priority)) {
				contexts.add(context);
			}
			const result = [...contexts].sort();
			this._requiredContexts.set(key, { contexts: result, observedAt: this._clock.now() });
			return result;
		} catch (error) {
			if (signal.aborted || !(error instanceof GitHubRequestError)) {
				throw error;
			}
			this._logService?.warn(`[PullRequestQueryService] Could not read the required checks of ${ref.owner}/${ref.repo}@${baseRef} (${error.kind}): ${error.message}`);
			return cached?.contexts;
		}
	}

	/** Reads the checks the base branch's rulesets require; a host without rulesets requires none through them. */
	private async _fetchRulesetContexts(
		ref: PullRequestRef,
		baseRef: string,
		credential: GitHubCredential,
		signal: AbortSignal,
		priority: import('./types.js').RequestPriority,
	): Promise<readonly string[]> {
		try {
			const rules = await this._fetchRestArray(ref, credential, `rules/branches/${encodeURIComponent(baseRef)}?per_page=100`, signal, priority);
			return rules.flatMap(toRulesetContexts);
		} catch (error) {
			if (error instanceof GitHubRequestError && error.kind === 'notFound') {
				return [];
			}
			throw error;
		}
	}

	/**
	 * Reads the jobs of the workflows that reported checks on the head, as of
	 * the head commit. GitHub runs a pull request's workflows as of its merge
	 * with the base branch, which only differs when the base changed a workflow
	 * after the branch was created. A workflow that cannot be read contributes
	 * no dependencies.
	 */
	private async _fetchWorkflowJobs(
		ref: PullRequestRef,
		headSha: string,
		checks: readonly PullRequestCheck[],
		credential: GitHubCredential,
		signal: AbortSignal,
		priority: import('./types.js').RequestPriority,
	): Promise<ReadonlyMap<string, ReadonlyMap<string, WorkflowJob> | undefined>> {
		const keyOf = (path: string) => `${ref.host}/${ref.owner}/${ref.repo}`.toLowerCase() + `@${headSha}:${path}`;
		const result = new Map<string, ReadonlyMap<string, WorkflowJob> | undefined>();
		const unread: string[] = [];
		for (const path of new Set(checks.flatMap(check => check.workflowRunId !== undefined && check.workflowPath !== undefined ? [check.workflowPath] : []))) {
			const key = keyOf(path);
			if (this._workflowJobs.has(key)) {
				result.set(path, this._workflowJobs.get(key));
			} else {
				unread.push(path);
			}
		}
		if (unread.length === 0) {
			return result;
		}
		try {
			const response = await this._transport.graphql<unknown>(
				credential.account,
				credential.token,
				this._endpoint.getGraphQlUri(),
				workflowFilesQuery(unread.length),
				{ owner: ref.owner, repo: ref.repo, ...Object.fromEntries(unread.map((path, index) => [`file${index}`, `${headSha}:${path}`])) },
				signal,
				priority,
				{ caller: 'github.pullRequestQuery' },
			);
			throwGraphQLErrors(response.errors);
			const repository = objectAt(response.data, 'repository');
			unread.forEach((path, index) => {
				const blob = optionalObjectProperty(repository, `file${index}`);
				const text = blob && booleanProperty(blob, 'isTruncated') !== true ? stringProperty(blob, 'text') : undefined;
				const jobs = text === undefined ? undefined : parseWorkflowJobs(text);
				this._workflowJobs.set(keyOf(path), jobs);
				if (this._workflowJobs.size > maximumCachedWorkflows) {
					this._workflowJobs.delete(this._workflowJobs.keys().next().value!);
				}
				result.set(path, jobs);
			});
		} catch (error) {
			if (signal.aborted || !(error instanceof GitHubRequestError)) {
				throw error;
			}
			this._logService?.warn(`[PullRequestQueryService] Could not read the workflows of ${ref.owner}/${ref.repo}@${headSha}, so the checks that required checks wait for are unknown (${error.kind}): ${error.message}`);
		}
		return result;
	}

	/**
	 * Loads the check rollup, dropping the workflow-name subselection for a
	 * repository whose host refuses it so the rest of the checks stay readable.
	 */
	private async _fetchCheckRollupWithWorkflowNames(
		ref: PullRequestRef,
		core: PullRequestCore,
		credential: GitHubCredential,
		signal: AbortSignal,
		priority: import('./types.js').RequestPriority,
		includeRequiredness: boolean,
	): Promise<{ readonly headSha: string; readonly checks: readonly PullRequestCheck[] }> {
		const repositoryKey = `${ref.owner}/${ref.repo}`.toLowerCase();
		const includeWorkflowNames = !this._workflowNamesUnavailable.has(repositoryKey);
		try {
			return await this._fetchCheckRollup(ref, core, credential, signal, priority, includeRequiredness, includeWorkflowNames);
		} catch (error) {
			if (!includeWorkflowNames || !(error instanceof GitHubRequestError) || error.kind !== 'authorization') {
				throw error;
			}
			this._workflowNamesUnavailable.add(repositoryKey);
			this._logService?.warn(`[PullRequestQueryService] Retrying checks for ${ref.owner}/${ref.repo}#${ref.number} without workflow names because GitHub refused them: ${error.message}`);
			return await this._fetchCheckRollup(ref, core, credential, signal, priority, includeRequiredness, false);
		}
	}

	/** Loads the expected check suites, reporting them absent and incomplete when the host refuses them. */
	private async _fetchExpectedCheckSuitesWhenPermitted(
		ref: PullRequestRef,
		headSha: string,
		credential: GitHubCredential,
		signal: AbortSignal,
		priority: import('./types.js').RequestPriority,
	): Promise<{ readonly suites: readonly PullRequestCheckSuite[]; readonly complete: boolean }> {
		try {
			return { suites: await this._fetchExpectedCheckSuites(ref, headSha, credential, signal, priority), complete: true };
		} catch (error) {
			if (!(error instanceof GitHubRequestError) || error.kind !== 'authorization') {
				throw error;
			}
			this._logService?.warn(`[PullRequestQueryService] Reporting expected check suites for ${ref.owner}/${ref.repo}#${ref.number} as unavailable because GitHub refused them: ${error.message}`);
			return { suites: [], complete: false };
		}
	}

	private async _fetchCheckRollup(
		ref: PullRequestRef,
		core: PullRequestCore,
		credential: GitHubCredential,
		signal: AbortSignal,
		priority: import('./types.js').RequestPriority,
		includeRequiredness: boolean,
		includeWorkflowNames: boolean,
	): Promise<{ readonly headSha: string; readonly checks: readonly PullRequestCheck[] }> {
		const checks: PullRequestCheck[] = [];
		let after: string | undefined;
		for (let page = 0; page < maximumPaginationPages; page++) {
			const response = await this._transport.graphql<unknown>(
				credential.account,
				credential.token,
				this._endpoint.getGraphQlUri(),
				checksQuery(includeRequiredness, includeWorkflowNames),
				{ owner: ref.owner, repo: ref.repo, number: ref.number, after },
				signal,
				priority,
				{ caller: 'github.pullRequestQuery' },
			);
			throwGraphQLErrors(response.errors);
			const pullRequest = objectAt(response.data, 'repository', 'pullRequest');
			const observedHead = requiredString(pullRequest, 'headRefOid');
			if (observedHead !== core.headSha) {
				throw new GitHubRequestError('GitHub checks response was for an old pull request head', 'unknown');
			}
			const commits = objectProperty(pullRequest, 'commits');
			const commitNode = firstObject(arrayProperty(commits, 'nodes'), 'GitHub checks response did not contain the current commit');
			const commit = objectProperty(commitNode, 'commit');
			const rollup = optionalObjectProperty(commit, 'statusCheckRollup');
			if (!rollup) {
				return { headSha: observedHead, checks: [] };
			}
			const contexts = objectProperty(rollup, 'contexts');
			checks.push(...arrayProperty(contexts, 'nodes').map(toCheck));
			const pageInfo = pageInfoFrom(contexts);
			if (!pageInfo.hasNextPage) {
				return { headSha: observedHead, checks };
			}
			after = requiredCursor(pageInfo.endCursor);
		}
		throw new GitHubRequestError('GitHub check pagination exceeded its page limit', 'malformedResponse');
	}

	private async _fetchExpectedCheckSuites(
		ref: PullRequestRef,
		headSha: string,
		credential: GitHubCredential,
		signal: AbortSignal,
		priority: import('./types.js').RequestPriority,
	): Promise<readonly PullRequestCheckSuite[]> {
		const suites: PullRequestCheckSuite[] = [];
		let after: string | undefined;
		for (let page = 0; page < maximumPaginationPages; page++) {
			const response = await this._transport.graphql<unknown>(
				credential.account,
				credential.token,
				this._endpoint.getGraphQlUri(),
				expectedCheckSuitesQuery,
				{ owner: ref.owner, repo: ref.repo, headSha, after },
				signal,
				priority,
				{ caller: 'github.pullRequestQuery' },
			);
			throwGraphQLErrors(response.errors.filter(error => !isRefusedCheckSuiteLabel(error)));
			const commit = objectAt(response.data, 'repository', 'object');
			if (requiredString(commit, 'oid') !== headSha) {
				throw new GitHubRequestError('GitHub expected check suites were for an old pull request head', 'unknown');
			}
			const connection = objectProperty(commit, 'checkSuites');
			for (const node of arrayProperty(connection, 'nodes')) {
				const suite = toExpectedCheckSuite(node, this._clock.now());
				if (suite) {
					suites.push(suite);
				}
			}
			const pageInfo = pageInfoFrom(connection);
			if (!pageInfo.hasNextPage) {
				return suites;
			}
			after = requiredCursor(pageInfo.endCursor);
		}
		throw new GitHubRequestError('GitHub expected check-suite pagination exceeded its page limit', 'malformedResponse');
	}

	private async _fetchChecksFallback(
		ref: PullRequestRef,
		core: PullRequestCore,
		credential: GitHubCredential,
		signal: AbortSignal,
		priority: import('./types.js').RequestPriority,
	): Promise<PullRequestChecks> {
		const checks: PullRequestCheck[] = [];
		let url: string | undefined = this._restUrl(ref, `commits/${encodeURIComponent(core.headSha)}/check-runs?per_page=100`);
		for (let page = 0; url && page < maximumPaginationPages; page++) {
			const response = await this._transport.rest<unknown>(credential.account, credential.token, {
				caller: 'github.pullRequestQuery',
				method: 'GET',
				url,
				etag: true,
				priority,
			}, signal);
			const body = asObject(response.data, 'GitHub check-runs response was malformed');
			checks.push(...arrayProperty(body, 'check_runs').map(toRestCheckRun));
			url = nextLink(response.link);
		}
		if (url) {
			throw new GitHubRequestError('GitHub check-run pagination exceeded its page limit', 'malformedResponse');
		}
		const statuses = await this._transport.rest<unknown>(credential.account, credential.token, {
			caller: 'github.pullRequestQuery',
			method: 'GET',
			url: this._restUrl(ref, `commits/${encodeURIComponent(core.headSha)}/status?per_page=100`),
			etag: true,
			priority,
		}, signal);
		const statusBody = asObject(statuses.data, 'GitHub status response was malformed');
		checks.push(...arrayProperty(statusBody, 'statuses').map(toRestStatus));
		return {
			headSha: core.headSha,
			checks,
			requirednessComplete: false,
			expectedSuites: [],
			expectedSuitesComplete: false,
		};
	}

	private async _fetchMergeability(
		ref: PullRequestRef,
		core: PullRequestCore,
		credential: GitHubCredential,
		signal: AbortSignal,
		priority: import('./types.js').RequestPriority,
		mergeQueueSupported: boolean,
	): Promise<PullRequestMergeability> {
		const response = await this._transport.graphql<unknown>(
			credential.account,
			credential.token,
			this._endpoint.getGraphQlUri(),
			mergeabilityQuery(mergeQueueSupported),
			mergeQueueSupported
				? { owner: ref.owner, repo: ref.repo, number: ref.number, baseBranch: core.baseRef }
				: { owner: ref.owner, repo: ref.repo, number: ref.number },
			signal,
			priority,
			{ caller: 'github.pullRequestQuery' },
		);
		throwGraphQLErrors(response.errors);
		const repository = objectProperty(asObject(response.data, 'GitHub mergeability response was malformed'), 'repository');
		const pullRequest = objectProperty(repository, 'pullRequest');
		const allowedMergeMethods: ('MERGE' | 'SQUASH' | 'REBASE')[] = [];
		if (booleanProperty(repository, 'mergeCommitAllowed')) {
			allowedMergeMethods.push('MERGE');
		}
		if (booleanProperty(repository, 'squashMergeAllowed')) {
			allowedMergeMethods.push('SQUASH');
		}
		if (booleanProperty(repository, 'rebaseMergeAllowed')) {
			allowedMergeMethods.push('REBASE');
		}
		const mergeQueueEntry = optionalObjectProperty(pullRequest, 'mergeQueueEntry');
		const mergeQueue = optionalObjectProperty(repository, 'mergeQueue');
		return {
			headSha: requiredString(pullRequest, 'headRefOid'),
			baseSha: requiredString(pullRequest, 'baseRefOid'),
			mergeable: enumProperty(pullRequest, 'mergeable', ['MERGEABLE', 'CONFLICTING', 'UNKNOWN'], 'UNKNOWN'),
			mergeStateStatus: stringProperty(pullRequest, 'mergeStateStatus'),
			reviewDecision: stringProperty(pullRequest, 'reviewDecision'),
			viewerCanUpdate: booleanProperty(pullRequest, 'viewerCanUpdateBranch') ?? false,
			viewerCanMerge: canViewerMerge(repository),
			viewerCanEnableAutoMerge: booleanProperty(pullRequest, 'viewerCanEnableAutoMerge') ?? false,
			allowedMergeMethods,
			autoMergeEnabled: optionalObjectProperty(pullRequest, 'autoMergeRequest') !== undefined,
			mergeQueueEntryId: mergeQueueEntry ? stringProperty(mergeQueueEntry, 'id') : undefined,
			mergeQueueRequired: mergeQueueSupported && mergeQueue !== undefined,
			queueRequirementKnown: true,
		};
	}

	private async _fetchMergeabilityFallback(
		ref: PullRequestRef,
		core: PullRequestCore,
		credential: GitHubCredential,
		signal: AbortSignal,
		priority: import('./types.js').RequestPriority,
	): Promise<PullRequestMergeability> {
		const response = await this._transport.rest<unknown>(credential.account, credential.token, {
			caller: 'github.pullRequestQuery',
			method: 'GET',
			url: this._restUrl(ref, `pulls/${ref.number}`),
			unconditional: true,
			priority,
		}, signal);
		const body = asObject(response.data, 'GitHub mergeability fallback response was malformed');
		const mergeable = booleanProperty(body, 'mergeable');
		return {
			headSha: core.headSha,
			baseSha: core.baseSha,
			mergeable: mergeable === true ? 'MERGEABLE' : mergeable === false ? 'CONFLICTING' : 'UNKNOWN',
			mergeStateStatus: stringProperty(body, 'mergeable_state'),
			viewerCanUpdate: false,
			viewerCanMerge: false,
			viewerCanEnableAutoMerge: false,
			allowedMergeMethods: [],
			autoMergeEnabled: optionalObjectProperty(body, 'auto_merge') !== undefined,
			mergeQueueRequired: false,
			queueRequirementKnown: false,
		};
	}

	private _restUrl(ref: PullRequestRef, route: string): string {
		return `${this._endpoint.getApiBaseUri()}/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/${route}`;
	}
}

const restCapabilities: GitHubHostCapabilities = {
	graphql: false,
	mergeQueue: false,
	reviewThreads: false,
	checkContextRequiredness: false,
};

function needsCapabilities(fragment: PullRequestFragment): boolean {
	return fragment === 'reviewThreads' || fragment === 'checks' || fragment === 'mergeability';
}

/** `RepositoryPermission` values that grant push access, and therefore permission to merge a pull request. */
const mergePermissions: ReadonlySet<string> = new Set(['ADMIN', 'MAINTAIN', 'WRITE']);

/**
 * GitHub's GraphQL schema has no `PullRequest.viewerCanMerge`, so merge permission is derived from the
 * viewer's permission on the base repository. `Repository.viewerPermission` is null when the request is
 * authenticated as a GitHub App, which fails closed the same way the REST fallback does.
 */
function canViewerMerge(repository: object): boolean {
	const permission = normalizedEnumProperty(repository, 'viewerPermission');
	return permission !== undefined && mergePermissions.has(permission);
}

function toCore(value: unknown, ref: PullRequestRef): PullRequestCore {
	const item = asObject(value, 'GitHub pull request response was malformed');
	const base = objectProperty(item, 'base');
	const head = objectProperty(item, 'head');
	const repository = objectProperty(base, 'repo');
	const repositoryNameWithOwner = requiredString(repository, 'full_name');
	const merged = booleanProperty(item, 'merged') === true || stringProperty(item, 'state') === 'merged';
	return {
		id: idProperty(item, 'node_id'),
		repositoryId: idProperty(repository, 'node_id') ?? idProperty(repository, 'id'),
		repositoryNameWithOwner,
		number: numberProperty(item, 'number') ?? ref.number,
		title: requiredString(item, 'title'),
		body: nullableStringProperty(item, 'body'),
		url: requiredString(item, 'html_url'),
		state: merged ? 'merged' : stringProperty(item, 'state') === 'open' ? 'open' : 'closed',
		draft: booleanProperty(item, 'draft') ?? false,
		headSha: requiredString(head, 'sha'),
		headRef: requiredString(head, 'ref'),
		headRepositoryNameWithOwner: optionalObjectProperty(head, 'repo') ? stringProperty(objectProperty(head, 'repo'), 'full_name') : undefined,
		maintainerCanModify: booleanProperty(item, 'maintainer_can_modify') ?? false,
		baseSha: requiredString(base, 'sha'),
		baseRef: requiredString(base, 'ref'),
		author: toActor(optionalObjectProperty(item, 'user'), stringProperty(item, 'author_association')),
		createdAt: stringProperty(item, 'created_at'),
		updatedAt: stringProperty(item, 'updated_at'),
		closedAt: nullableStringProperty(item, 'closed_at'),
		mergedAt: nullableStringProperty(item, 'merged_at'),
	};
}

function toComment(value: unknown, includeBody: boolean): PullRequestComment {
	const item = asObject(value, 'GitHub issue comment was malformed');
	return {
		id: requiredId(item, 'id'),
		nodeId: idProperty(item, 'node_id'),
		author: toActor(optionalObjectProperty(item, 'user'), stringProperty(item, 'author_association')),
		body: includeBody ? nullableStringProperty(item, 'body') : undefined,
		url: stringProperty(item, 'html_url'),
		createdAt: stringProperty(item, 'created_at'),
		updatedAt: stringProperty(item, 'updated_at'),
	};
}

function toReview(value: unknown, includeBody: boolean): PullRequestReview {
	const item = asObject(value, 'GitHub pull request review was malformed');
	return {
		id: requiredId(item, 'id'),
		nodeId: idProperty(item, 'node_id'),
		author: toActor(optionalObjectProperty(item, 'user'), stringProperty(item, 'author_association')),
		state: stringProperty(item, 'state') ?? 'UNKNOWN',
		body: includeBody ? nullableStringProperty(item, 'body') : undefined,
		commitId: stringProperty(item, 'commit_id'),
		submittedAt: stringProperty(item, 'submitted_at'),
	};
}

function toGraphQLInlineComment(value: unknown, includeBody: boolean, diffSide: string | undefined): PullRequestInlineComment {
	const item = asObject(value, 'GitHub review-thread comment was malformed');
	const commit = optionalObjectProperty(item, 'commit');
	const originalCommit = optionalObjectProperty(item, 'originalCommit');
	return {
		id: requiredId(item, 'databaseId', 'id'),
		nodeId: idProperty(item, 'id'),
		author: toActor(optionalObjectProperty(item, 'author'), stringProperty(item, 'authorAssociation')),
		body: includeBody ? nullableStringProperty(item, 'body') : undefined,
		url: stringProperty(item, 'url'),
		createdAt: stringProperty(item, 'createdAt'),
		updatedAt: stringProperty(item, 'updatedAt'),
		state: stringProperty(item, 'state'),
		path: stringProperty(item, 'path'),
		line: numberProperty(item, 'line'),
		originalLine: numberProperty(item, 'originalLine'),
		side: diffSide,
		commitId: commit ? stringProperty(commit, 'oid') : undefined,
		originalCommitId: originalCommit ? stringProperty(originalCommit, 'oid') : undefined,
	};
}

function toCheck(value: unknown): PullRequestCheck {
	const item = asObject(value, 'GitHub check context was malformed');
	const type = requiredString(item, '__typename');
	if (type === 'CheckRun') {
		const suite = optionalObjectProperty(item, 'checkSuite');
		const workflowRun = suite ? optionalObjectProperty(suite, 'workflowRun') : undefined;
		const workflow = workflowRun ? optionalObjectProperty(workflowRun, 'workflow') : undefined;
		const file = workflowRun ? optionalObjectProperty(workflowRun, 'file') : undefined;
		const workflowRunId = workflowRun ? idProperty(workflowRun, 'databaseId') : undefined;
		const workflowPath = file ? stringProperty(file, 'path') : undefined;
		return {
			id: requiredId(item, 'databaseId'),
			type: 'checkRun',
			name: requiredString(item, 'name'),
			status: normalizedEnumProperty(item, 'status'),
			conclusion: normalizedEnumProperty(item, 'conclusion'),
			required: booleanProperty(item, 'isRequired'),
			detailsUrl: stringProperty(item, 'detailsUrl'),
			workflowName: workflow ? stringProperty(workflow, 'name') : undefined,
			...(workflowRunId !== undefined ? { workflowRunId } : {}),
			...(workflowPath !== undefined ? { workflowPath } : {}),
		};
	}
	return {
		id: requiredId(item, 'id'),
		type: 'statusContext',
		name: requiredString(item, 'context'),
		status: normalizedEnumProperty(item, 'state'),
		required: booleanProperty(item, 'isRequired'),
		detailsUrl: stringProperty(item, 'targetUrl'),
	};
}

function toRestCheckRun(value: unknown): PullRequestCheck {
	const item = asObject(value, 'GitHub REST check run was malformed');
	return {
		id: requiredId(item, 'id'),
		type: 'checkRun',
		name: requiredString(item, 'name'),
		status: normalizedEnumProperty(item, 'status'),
		conclusion: normalizedEnumProperty(item, 'conclusion'),
		detailsUrl: stringProperty(item, 'details_url'),
	};
}

function toRestStatus(value: unknown): PullRequestCheck {
	const item = asObject(value, 'GitHub REST status context was malformed');
	return {
		id: requiredId(item, 'id'),
		type: 'statusContext',
		name: requiredString(item, 'context'),
		status: normalizedEnumProperty(item, 'state'),
		detailsUrl: stringProperty(item, 'target_url'),
	};
}

/**
 * GitHub withholds the app of some suites, including GitHub Actions ones, from a token without SSO access to the organization,
 * while still returning the suite itself. The app and the workflow only name the suite, so it stays usable without them.
 */
function isRefusedCheckSuiteLabel(error: GitHubGraphQLError): boolean {
	const path = error.path;
	return error.type?.toUpperCase() === 'FORBIDDEN' && path !== undefined && path.length >= 6 && path[0] === 'repository' && path[1] === 'object'
		&& path[2] === 'checkSuites' && path[3] === 'nodes' && typeof path[4] === 'number' && (path[5] === 'app' || path[5] === 'workflowRun');
}

/**
 * GitHub queues a suite for every installed checks app on each push, and an app that does not report on the commit leaves
 * it queued without check runs indefinitely. A third-party CI app that will report can also take a moment to create its
 * runs, so an idle suite stays expected until the grace period after its creation passes. Only GitHub Actions creates a
 * suite for a triggered workflow, so its suites and those whose app or creation time is unknown always stay expected.
 */
function toExpectedCheckSuite(value: unknown, now: number): PullRequestCheckSuite | undefined {
	const item = asObject(value, 'GitHub check suite was malformed');
	const id = requiredId(item, 'id');
	const app = optionalObjectProperty(item, 'app');
	const slug = app && stringProperty(app, 'slug');
	const status = normalizedEnumProperty(item, 'status');
	const checkRunsReported = (numberProperty(objectProperty(item, 'checkRuns'), 'totalCount') ?? 0) > 0;
	const createdAt = Date.parse(stringProperty(item, 'createdAt') ?? '');
	if (!checkRunsReported && status === 'QUEUED' && slug && slug !== 'github-actions' && now - createdAt >= idleCheckSuiteGracePeriod) {
		return undefined;
	}
	// A GitHub Actions suite is named after its workflow, which tells it apart from the suites of other workflows; GitHub
	// names a workflow that fails to start, such as an invalid one, after its file.
	const workflowRun = optionalObjectProperty(item, 'workflowRun');
	const workflow = workflowRun ? optionalObjectProperty(workflowRun, 'workflow') : undefined;
	return {
		id,
		name: (workflow && stringProperty(workflow, 'name')) ?? (app ? stringProperty(app, 'name') ?? slug ?? 'unknown' : 'unknown'),
		status,
		conclusion: normalizedEnumProperty(item, 'conclusion'),
		checkRunsReported,
	};
}

/** Drops the checks GitHub reports as optional, unless a required check that has not finished waits for them. */
function filterChecks(checks: readonly PullRequestCheck[], requirednessAvailable: boolean, includeOptional: boolean): readonly PullRequestCheck[] {
	return includeOptional || !requirednessAvailable ? checks : checks.filter(check => check.required !== false || check.requiredBy !== undefined);
}

/** The checks a branch's protection requires, which GitHub also reports to collaborators without admin access. */
function toBranchProtectionContexts(value: unknown): readonly string[] {
	const branch = asObject(value, 'GitHub branch response was malformed');
	const protection = optionalObjectProperty(branch, 'protection');
	const required = protection ? optionalObjectProperty(protection, 'required_status_checks') : undefined;
	if (!required || stringProperty(required, 'enforcement_level') === 'off') {
		return [];
	}
	const contexts: unknown = Reflect.get(required, 'contexts');
	return [
		...Array.isArray(contexts) ? contexts.filter((context: unknown): context is string => typeof context === 'string') : [],
		...toContexts(Reflect.get(required, 'checks')),
	];
}

/** The checks one rule of a branch's rulesets requires. */
function toRulesetContexts(value: unknown): readonly string[] {
	if (!value || typeof value !== 'object' || stringProperty(value, 'type') !== 'required_status_checks') {
		return [];
	}
	const parameters = optionalObjectProperty(value, 'parameters');
	return parameters ? toContexts(Reflect.get(parameters, 'required_status_checks')) : [];
}

/** The `context` of each `{ context }` entry of a required status check list. */
function toContexts(value: unknown): readonly string[] {
	return Array.isArray(value)
		? value.flatMap((check: unknown) => {
			const context = check && typeof check === 'object' ? stringProperty(check, 'context') : undefined;
			return context !== undefined ? [context] : [];
		})
		: [];
}

function toActor(value: object | undefined, association?: string): { readonly id?: string; readonly login: string; readonly association?: string } | undefined {
	if (!value) {
		return undefined;
	}
	const login = stringProperty(value, 'login');
	if (!login) {
		return undefined;
	}
	const id = idProperty(value, 'databaseId') ?? idProperty(value, 'id');
	return {
		...(id ? { id } : {}),
		login,
		...(association ? { association } : {}),
	};
}

function throwGraphQLErrors(errors: readonly GitHubGraphQLError[]): void {
	if (errors.length === 0) {
		return;
	}
	const kinds = errors.map(error => error.type?.toUpperCase());
	const kind = kinds.includes('RATE_LIMIT') || kinds.includes('RATE_LIMITED')
		? 'rateLimit'
		: kinds.some(type => type === 'FORBIDDEN' || type === 'UNAUTHORIZED')
			? 'authorization'
			: kinds.some(type => type?.includes('NOT_FOUND'))
				? 'notFound'
				: kinds.some(type => type?.includes('VALIDATION'))
					? 'schema'
					: 'server';
	throw new GitHubRequestError(
		`GitHub GraphQL request failed: ${errors.map(error => error.message ?? error.type ?? 'unknown error').join('; ')}`,
		kind,
		200,
		undefined,
		errors,
	);
}

function pageInfoFrom(connection: object): { readonly hasNextPage: boolean; readonly endCursor?: string } {
	const pageInfo = objectProperty(connection, 'pageInfo');
	return {
		hasNextPage: booleanProperty(pageInfo, 'hasNextPage') ?? false,
		endCursor: nullableStringProperty(pageInfo, 'endCursor'),
	};
}

function requiredCursor(cursor: string | undefined): string {
	if (!cursor) {
		throw new GitHubRequestError('GitHub pagination did not provide an end cursor', 'malformedResponse');
	}
	return cursor;
}

function firstObject(values: readonly unknown[], message: string): object {
	if (values.length === 0) {
		throw new GitHubRequestError(message, 'malformedResponse');
	}
	return asObject(values[0], message);
}

function enumProperty<T extends string>(value: object, key: string, allowed: readonly T[], fallback: T): T {
	const property = stringProperty(value, key);
	return property && allowed.includes(property as T) ? property as T : fallback;
}
