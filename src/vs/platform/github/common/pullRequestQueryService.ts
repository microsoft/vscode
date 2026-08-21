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
	PullRequestParticipant,
	PullRequestParticipants,
	PullRequestRef,
	PullRequestReview,
	PullRequestReviewThread,
	PullRequestSubscriptionOptions,
} from './githubPullRequestService.js';
import { GitHubHostCapabilities, IGitHubEndpointProvider } from './githubTypes.js';
import { GitHubCredential } from './githubCredentialService.js';
import { IGitHubCapabilities } from './githubHostCapabilitiesService.js';
import { GitHubGraphQLError, GitHubRequestError, IGitHubTransport } from './githubTransport.js';
import { ILogService } from '../../log/common/log.js';
import { PullRequestRequestPlanner } from './pullRequestRequestPlanner.js';

export type PullRequestFragmentResult =
	| { readonly fragment: 'core'; readonly value: PullRequestCore; readonly complete: true }
	| { readonly fragment: 'topLevelComments'; readonly value: readonly PullRequestComment[]; readonly complete: true }
	| { readonly fragment: 'submittedReviews'; readonly value: readonly PullRequestReview[]; readonly complete: true }
	| { readonly fragment: 'inlineComments'; readonly value: readonly PullRequestInlineComment[]; readonly complete: true }
	| { readonly fragment: 'reviewThreads'; readonly value: readonly PullRequestReviewThread[]; readonly complete: boolean; readonly headSha: string }
	| { readonly fragment: 'checks'; readonly value: PullRequestChecks; readonly complete: boolean; readonly headSha: string }
	| { readonly fragment: 'mergeability'; readonly value: PullRequestMergeability; readonly complete: boolean; readonly headSha: string }
	| { readonly fragment: 'participants'; readonly value: PullRequestParticipants; readonly complete: true };

export interface IPullRequestQuery {
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
										${includeWorkflowNames ? 'checkSuite { workflowRun { workflow { name } } }' : ''}
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
					nodes { id status conclusion app { name slug } checkRuns(first: 1) { totalCount } }
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

export class PullRequestQueryService implements IPullRequestQuery {

	private readonly _planner = new PullRequestRequestPlanner();

	/** Repositories whose host refused the workflow-name subselection, keyed by `owner/repo`. */
	private readonly _workflowNamesUnavailable = new Set<string>();

	constructor(
		private readonly _transport: IGitHubTransport,
		private readonly _capabilities: IGitHubCapabilities,
		private readonly _endpoint: IGitHubEndpointProvider,
		private readonly _logService?: ILogService,
	) { }

	async fetch(
		fragment: PullRequestFragment,
		ref: PullRequestRef,
		core: PullRequestCore | undefined,
		options: PullRequestSubscriptionOptions,
		credential: GitHubCredential,
		signal: AbortSignal,
	): Promise<PullRequestFragmentResult> {
		const capabilities = needsCapabilities(fragment)
			? await this._capabilities.getCapabilities(credential, undefined, signal)
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
			case 'inlineComments':
				return {
					fragment,
					value: (await this._fetchRestArray(ref, credential, `pulls/${ref.number}/comments?per_page=100`, signal, plan.priority))
						.map(item => toInlineComment(item, options.conversation?.includeBodies === true)),
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
			case 'participants':
				return {
					fragment,
					value: await this._fetchParticipants(ref, core, credential, signal, plan.priority),
					complete: true,
				};
		}
	}

	private async _fetchCore(ref: PullRequestRef, credential: GitHubCredential, signal: AbortSignal, priority: import('./githubTypes.js').GitHubRequestPriority): Promise<PullRequestCore> {
		const response = await this._transport.rest<unknown>(credential.account, credential.token, {
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
		priority: import('./githubTypes.js').GitHubRequestPriority,
	): Promise<readonly unknown[]> {
		const result: unknown[] = [];
		let url: string | undefined = this._restUrl(ref, route);
		for (let page = 0; url && page < maximumPaginationPages; page++) {
			const response = await this._transport.rest<unknown>(credential.account, credential.token, {
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
		priority: import('./githubTypes.js').GitHubRequestPriority,
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
		priority: import('./githubTypes.js').GitHubRequestPriority,
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

	private async _fetchChecks(
		ref: PullRequestRef,
		core: PullRequestCore,
		credential: GitHubCredential,
		signal: AbortSignal,
		priority: import('./githubTypes.js').GitHubRequestPriority,
		includeRequiredness: boolean,
		loadExpectedSuites: boolean,
		includeOptional: boolean,
	): Promise<PullRequestChecks> {
		const rollup = await this._fetchCheckRollupWithWorkflowNames(ref, core, credential, signal, priority, includeRequiredness, includeOptional);
		const expected = loadExpectedSuites
			? await this._fetchExpectedCheckSuitesWhenPermitted(ref, core.headSha, credential, signal, priority)
			: { suites: [], complete: false };
		return {
			headSha: rollup.headSha,
			checks: rollup.checks,
			requirednessComplete: includeRequiredness,
			expectedSuites: expected.suites,
			expectedSuitesComplete: expected.complete,
		};
	}

	/**
	 * Loads the check rollup, dropping the workflow-name subselection when the
	 * host refuses it.
	 *
	 * `CheckRun.checkSuite` is non-nullable, so an authorization failure on the
	 * GitHub Actions data it exposes — most commonly SAML SSO enforcement on the
	 * owning organization — fails the whole fragment rather than that one field.
	 * Checks would then never load, and Agent Merge cannot evaluate a pull
	 * request without them. Workflow names are only informational, so a refusal
	 * drops them and keeps the checks themselves. The decision is remembered per
	 * repository so the fragment does not pay for a rejected request on every
	 * poll. Only the rollup request is retried, so a refusal raised by any other
	 * request cannot be misread as this one.
	 */
	private async _fetchCheckRollupWithWorkflowNames(
		ref: PullRequestRef,
		core: PullRequestCore,
		credential: GitHubCredential,
		signal: AbortSignal,
		priority: import('./githubTypes.js').GitHubRequestPriority,
		includeRequiredness: boolean,
		includeOptional: boolean,
	): Promise<{ readonly headSha: string; readonly checks: readonly PullRequestCheck[] }> {
		const repositoryKey = `${ref.owner}/${ref.repo}`.toLowerCase();
		const includeWorkflowNames = !this._workflowNamesUnavailable.has(repositoryKey);
		try {
			return await this._fetchCheckRollup(ref, core, credential, signal, priority, includeRequiredness, includeOptional, includeWorkflowNames);
		} catch (error) {
			if (!includeWorkflowNames || !(error instanceof GitHubRequestError) || error.kind !== 'authorization') {
				throw error;
			}
			this._workflowNamesUnavailable.add(repositoryKey);
			this._logService?.warn(`[PullRequestQueryService] Retrying checks for ${ref.owner}/${ref.repo}#${ref.number} without workflow names because GitHub refused them: ${error.message}`);
			return await this._fetchCheckRollup(ref, core, credential, signal, priority, includeRequiredness, includeOptional, false);
		}
	}

	/**
	 * Loads the check suites expected for the head commit, tolerating a host
	 * that refuses them.
	 *
	 * These suites are supplementary, and they read the same organization
	 * protected GitHub Actions data that can refuse the rollup, so letting a
	 * refusal fail the fragment would leave checks unreadable for the same
	 * reason. Reporting them absent and incomplete keeps the checks themselves
	 * usable and matches how every caller that does not request them is already
	 * served.
	 */
	private async _fetchExpectedCheckSuitesWhenPermitted(
		ref: PullRequestRef,
		headSha: string,
		credential: GitHubCredential,
		signal: AbortSignal,
		priority: import('./githubTypes.js').GitHubRequestPriority,
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
		priority: import('./githubTypes.js').GitHubRequestPriority,
		includeRequiredness: boolean,
		includeOptional: boolean,
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
				return { headSha: observedHead, checks: filterChecks(checks, includeRequiredness, includeOptional) };
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
		priority: import('./githubTypes.js').GitHubRequestPriority,
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
			);
			throwGraphQLErrors(response.errors);
			const commit = objectAt(response.data, 'repository', 'object');
			if (requiredString(commit, 'oid') !== headSha) {
				throw new GitHubRequestError('GitHub expected check suites were for an old pull request head', 'unknown');
			}
			const connection = objectProperty(commit, 'checkSuites');
			suites.push(...arrayProperty(connection, 'nodes').map(toCheckSuite));
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
		priority: import('./githubTypes.js').GitHubRequestPriority,
	): Promise<PullRequestChecks> {
		const checks: PullRequestCheck[] = [];
		let url: string | undefined = this._restUrl(ref, `commits/${encodeURIComponent(core.headSha)}/check-runs?per_page=100`);
		for (let page = 0; url && page < maximumPaginationPages; page++) {
			const response = await this._transport.rest<unknown>(credential.account, credential.token, {
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
		priority: import('./githubTypes.js').GitHubRequestPriority,
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
		priority: import('./githubTypes.js').GitHubRequestPriority,
	): Promise<PullRequestMergeability> {
		const response = await this._transport.rest<unknown>(credential.account, credential.token, {
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

	private async _fetchParticipants(
		ref: PullRequestRef,
		core: PullRequestCore | undefined,
		credential: GitHubCredential,
		signal: AbortSignal,
		priority: import('./githubTypes.js').GitHubRequestPriority,
	): Promise<PullRequestParticipants> {
		const values = await this._fetchRestArray(ref, credential, `issues/${ref.number}/timeline?per_page=100`, signal, priority);
		const participants = new Map<string, { actor: PullRequestParticipant; roles: Set<'author' | 'commenter' | 'reviewer'> }>();
		if (core?.author) {
			addParticipant(participants, core.author, 'author');
		}
		for (const value of values) {
			const item = asObject(value, 'GitHub timeline event was malformed');
			const actor = toActor(optionalObjectProperty(item, 'actor') ?? optionalObjectProperty(item, 'user'));
			if (actor) {
				addParticipant(participants, actor, 'commenter');
			}
			const reviewer = toActor(optionalObjectProperty(item, 'requested_reviewer'));
			if (reviewer) {
				addParticipant(participants, reviewer, 'reviewer');
			}
		}
		return {
			participants: [...participants.values()]
				.map(({ actor, roles }) => ({ ...actor, roles: [...roles].sort() }))
				.sort((left, right) => left.login.localeCompare(right.login)),
		};
	}

	private _restUrl(ref: PullRequestRef, route: string): string {
		return `${this._endpoint.getApiBaseUri()}/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/${route}`;
	}
}

const restCapabilities: GitHubHostCapabilities = {
	graphql: false,
	mergeQueue: false,
	internalMergeStatus: false,
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

function toInlineComment(value: unknown, includeBody: boolean): PullRequestInlineComment {
	const item = asObject(value, 'GitHub pull request inline comment was malformed');
	return {
		...toComment(value, includeBody),
		reviewId: idProperty(item, 'pull_request_review_id'),
		replyToId: idProperty(item, 'in_reply_to_id'),
		path: stringProperty(item, 'path'),
		line: numberProperty(item, 'line'),
		originalLine: numberProperty(item, 'original_line'),
		side: stringProperty(item, 'side'),
		commitId: stringProperty(item, 'commit_id'),
		originalCommitId: stringProperty(item, 'original_commit_id'),
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
		return {
			id: requiredId(item, 'databaseId'),
			type: 'checkRun',
			name: requiredString(item, 'name'),
			status: normalizedEnumProperty(item, 'status'),
			conclusion: normalizedEnumProperty(item, 'conclusion'),
			required: booleanProperty(item, 'isRequired'),
			detailsUrl: stringProperty(item, 'detailsUrl'),
			workflowName: workflow ? stringProperty(workflow, 'name') : undefined,
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

function toCheckSuite(value: unknown): PullRequestCheckSuite {
	const item = asObject(value, 'GitHub check suite was malformed');
	const app = optionalObjectProperty(item, 'app');
	const checkRuns = objectProperty(item, 'checkRuns');
	return {
		id: requiredId(item, 'id'),
		name: app ? stringProperty(app, 'name') ?? stringProperty(app, 'slug') ?? 'unknown' : 'unknown',
		status: normalizedEnumProperty(item, 'status'),
		conclusion: normalizedEnumProperty(item, 'conclusion'),
		checkRunsReported: (numberProperty(checkRuns, 'totalCount') ?? 0) > 0,
	};
}

function filterChecks(checks: readonly PullRequestCheck[], requirednessAvailable: boolean, includeOptional: boolean): readonly PullRequestCheck[] {
	return includeOptional || !requirednessAvailable ? checks : checks.filter(check => check.required !== false);
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

function addParticipant(
	participants: Map<string, { actor: PullRequestParticipant; roles: Set<'author' | 'commenter' | 'reviewer'> }>,
	actor: { readonly id?: string; readonly login: string },
	role: 'author' | 'commenter' | 'reviewer',
): void {
	const key = actor.id ?? actor.login.toLowerCase();
	let participant = participants.get(key);
	if (!participant) {
		participant = { actor: { ...actor, roles: [] }, roles: new Set() };
		participants.set(key, participant);
	}
	participant.roles.add(role);
}

function throwGraphQLErrors(errors: readonly GitHubGraphQLError[]): void {
	if (errors.length === 0) {
		return;
	}
	const kinds = errors.map(error => error.type?.toUpperCase());
	const kind = kinds.includes('RATE_LIMITED')
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

function nextLink(link: string | undefined): string | undefined {
	if (!link) {
		return undefined;
	}
	for (const part of link.split(',')) {
		const match = /^\s*<(?<url>[^>]+)>\s*;\s*rel="(?<rel>[^"]+)"/.exec(part);
		if (match?.groups?.rel.split(/\s+/).includes('next')) {
			return match.groups.url;
		}
	}
	return undefined;
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

function objectAt(value: unknown, ...path: readonly string[]): object {
	let current = asObject(value, 'GitHub response was malformed');
	for (const part of path) {
		current = objectProperty(current, part);
	}
	return current;
}

function firstObject(values: readonly unknown[], message: string): object {
	if (values.length === 0) {
		throw new GitHubRequestError(message, 'malformedResponse');
	}
	return asObject(values[0], message);
}

function asObject(value: unknown, message: string): object {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new GitHubRequestError(message, 'malformedResponse');
	}
	return value;
}

function objectProperty(value: object, key: string): object {
	return asObject(Reflect.get(value, key), `GitHub response property ${key} was malformed`);
}

function optionalObjectProperty(value: object, key: string): object | undefined {
	const property = Reflect.get(value, key);
	return property === null || property === undefined ? undefined : asObject(property, `GitHub response property ${key} was malformed`);
}

function arrayProperty(value: object, key: string): readonly unknown[] {
	const property = Reflect.get(value, key);
	if (!Array.isArray(property)) {
		throw new GitHubRequestError(`GitHub response property ${key} was not an array`, 'malformedResponse');
	}
	return property;
}

function requiredString(value: object, key: string): string {
	const property = stringProperty(value, key);
	if (property === undefined) {
		throw new GitHubRequestError(`GitHub response property ${key} was not a string`, 'malformedResponse');
	}
	return property;
}

function stringProperty(value: object, key: string): string | undefined {
	const property = Reflect.get(value, key);
	return typeof property === 'string' ? property : undefined;
}

function nullableStringProperty(value: object, key: string): string | undefined {
	const property = Reflect.get(value, key);
	return property === null ? undefined : typeof property === 'string' ? property : undefined;
}

function normalizedEnumProperty(value: object, key: string): string | undefined {
	return nullableStringProperty(value, key)?.toUpperCase();
}

function numberProperty(value: object, key: string): number | undefined {
	const property = Reflect.get(value, key);
	return typeof property === 'number' && Number.isFinite(property) ? property : undefined;
}

function booleanProperty(value: object, key: string): boolean | undefined {
	const property = Reflect.get(value, key);
	return typeof property === 'boolean' ? property : undefined;
}

function idProperty(value: object, key: string): string | undefined {
	const property = Reflect.get(value, key);
	return typeof property === 'string' || typeof property === 'number' ? String(property) : undefined;
}

function requiredId(value: object, ...keys: readonly string[]): string {
	for (const key of keys) {
		const id = idProperty(value, key);
		if (id) {
			return id;
		}
	}
	throw new GitHubRequestError(`GitHub response did not contain ${keys.join(' or ')}`, 'malformedResponse');
}

function enumProperty<T extends string>(value: object, key: string, allowed: readonly T[], fallback: T): T {
	const property = stringProperty(value, key);
	return property && allowed.includes(property as T) ? property as T : fallback;
}
