/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ISettableObservable, observableValue } from '../../../base/common/observable.js';
import { hasKey } from '../../../base/common/types.js';
import { ILogService } from '../../log/common/log.js';
import {
	GitHubChangedFile,
	GitHubComparison,
	GitHubComparisonCommit,
	GitHubIssue,
	GitHubIssueRef,
	GitHubIssueResource,
	GitHubIssueSubscription,
	GitHubPullRequestContext,
	GitHubPullRequestContextComment,
	GitHubPullRequestLookup,
	GitHubPullRequestsPage,
	GitHubPullRequestSummary,
	GitHubQueryApi,
	GitHubRecentIssue,
	GitHubRecentPullRequest,
	GitHubRecentPullRequestReviewThread,
	GitHubRepository,
	GitHubRepositoryRef,
	GitHubRepositoryResource,
	GitHubRepositorySubscription,
	GitHubResourcePriority,
	GitHubResourceSubscriptionOptions,
} from './githubQueryService.js';
import { FragmentState, GitHubActor, PullRequestRef } from './githubPullRequestService.js';
import { GitHubCredential, GitHubCredentialInvalidation, IGitHubCredentials } from './githubCredentialService.js';
import { IGitHubCapabilities } from './githubHostCapabilitiesService.js';
import { IGitHubScheduler, systemGitHubScheduler } from './githubScheduler.js';
import { GitHubGraphQLError, GitHubRequestError, IGitHubTransport } from './githubTransport.js';
import { IGitHubEndpointProvider } from './githubTypes.js';
import { PullRequestScheduler } from './pullRequestScheduler.js';

export interface IGitHubQuery extends GitHubQueryApi {
	clear(): void;
}

export interface GitHubEntityPollingPolicy {
	readonly dormantGrace: number;
	readonly maximumDormantEntries: number;
	readonly visible: number;
	readonly background: number;
	readonly jitter: number;
}

const defaultPollingPolicy: GitHubEntityPollingPolicy = {
	dormantGrace: 120_000,
	maximumDormantEntries: 50,
	visible: 60_000,
	background: 300_000,
	jitter: 5_000,
};

const maximumPaginationPages = 100;
const maximumCommitPullRequests = 100;
const maximumIssueLinkageBatchSize = 20;

const listPullRequestsQuery = `query AgentHostListPullRequests($owner: String!, $repo: String!, $cursor: String) {
	repository(owner: $owner, name: $repo) {
		pullRequests(first: 100, after: $cursor, states: OPEN, orderBy: { field: UPDATED_AT, direction: DESC }) {
			nodes { number title author { login ... on User { databaseId } } headRefName isDraft updatedAt additions deletions }
			pageInfo { endCursor hasNextPage }
		}
	}
	rateLimit { limit remaining used resetAt }
}`;

const searchPullRequestsQuery = `query AgentHostSearchPullRequests($query: String!) {
	search(first: 100, query: $query, type: ISSUE) {
		nodes {
			... on PullRequest {
				number title author { login ... on User { databaseId } } headRefName isDraft updatedAt additions deletions
			}
		}
	}
	rateLimit { limit remaining used resetAt }
}`;

const recentIssuesQuery = `query AgentHostRecentAssignedIssues($query: String!) {
	search(query: $query, type: ISSUE, first: 5) {
		nodes { ... on Issue { number title url updatedAt } }
	}
	rateLimit { limit remaining used resetAt }
}`;

const recentPullRequestsQuery = `query AgentHostRecentAuthoredPullRequests($query: String!) {
	search(query: $query, type: ISSUE, first: 5) {
		nodes {
			... on PullRequest {
				number title url updatedAt
				commits(last: 1) {
					nodes { commit { committedDate statusCheckRollup { state } } }
				}
			}
		}
	}
	rateLimit { limit remaining used resetAt }
}`;

const reviewThreadSummaryQuery = `query AgentHostPullRequestReviewThreadSummary($owner: String!, $repo: String!, $number: Int!, $after: String) {
	repository(owner: $owner, name: $repo) {
		pullRequest(number: $number) {
			reviewThreads(first: 100, after: $after) {
				nodes { isResolved comments(last: 1) { nodes { createdAt } } }
				pageInfo { hasNextPage endCursor }
			}
		}
	}
	rateLimit { limit remaining used resetAt }
}`;

type EntityKind = 'repository' | 'issue';
type EntityRef = GitHubRepositoryRef | GitHubIssueRef;
type EntityValue = GitHubRepository | GitHubIssue;

interface IEntityOperation {
	readonly controller: AbortController;
	readonly promise: Promise<void>;
}

class EntityEntry<TRef extends EntityRef, TValue extends EntityValue> {

	readonly state: ISettableObservable<FragmentState<TValue>>;
	readonly resource: GitHubRepositoryResource | GitHubIssueResource;
	readonly subscriptions = new Set<EntitySubscription<TRef, TValue>>();
	readonly keys = new Set<string>();
	operation: IEntityOperation | undefined;
	dormantAt: number | undefined;
	disposed = false;

	constructor(
		readonly id: number,
		readonly kind: EntityKind,
		ref: TRef,
	) {
		this.ref = ref;
		this.state = observableValue(this, { status: 'missing', complete: false });
		this.resource = kind === 'repository'
			? new RepositoryResourceImpl(this as EntityEntry<GitHubRepositoryRef, GitHubRepository>)
			: new IssueResourceImpl(this as EntityEntry<GitHubIssueRef, GitHubIssue>);
	}

	ref: TRef;
}

class RepositoryResourceImpl implements GitHubRepositoryResource {

	constructor(private readonly _entry: EntityEntry<GitHubRepositoryRef, GitHubRepository>) { }

	get ref(): GitHubRepositoryRef {
		return this._entry.ref;
	}

	get state(): ISettableObservable<FragmentState<GitHubRepository>> {
		return this._entry.state;
	}
}

class IssueResourceImpl implements GitHubIssueResource {

	constructor(private readonly _entry: EntityEntry<GitHubIssueRef, GitHubIssue>) { }

	get ref(): GitHubIssueRef {
		return this._entry.ref;
	}

	get state(): ISettableObservable<FragmentState<GitHubIssue>> {
		return this._entry.state;
	}
}

class EntitySubscription<TRef extends EntityRef, TValue extends EntityValue> {

	private _disposed = false;

	constructor(
		readonly resource: TRef extends GitHubIssueRef ? GitHubIssueResource : GitHubRepositoryResource,
		readonly entry: EntityEntry<TRef, TValue>,
		private readonly _service: GitHubQueryService,
		options: GitHubResourceSubscriptionOptions,
	) {
		this.options = options;
	}

	options: GitHubResourceSubscriptionOptions;

	update(options: GitHubResourceSubscriptionOptions): void {
		if (this._disposed || this.entry.disposed) {
			throw new Error('GitHub resource subscription has been disposed');
		}
		this.options = options;
		this._service.updateEntitySubscription(this.entry);
	}

	refresh(token: CancellationToken = CancellationToken.None): Promise<void> {
		if (this._disposed || this.entry.disposed) {
			return Promise.reject(new Error('GitHub resource subscription has been disposed'));
		}
		return this._service.refreshEntity(this.entry, token);
	}

	dispose(): void {
		if (this._disposed) {
			return;
		}
		this._disposed = true;
		this._service.removeEntitySubscription(this);
	}
}

export class GitHubQueryService extends Disposable implements IGitHubQuery {

	private readonly _entriesByKey = new Map<string, EntityEntry<EntityRef, EntityValue>>();
	private readonly _entries = new Set<EntityEntry<EntityRef, EntityValue>>();
	private readonly _dormant = new Map<number, EntityEntry<EntityRef, EntityValue>>();
	private readonly _unsupportedGraphQLQueries = new Set<string>();
	private readonly _scheduler: PullRequestScheduler;
	private readonly _clock: IGitHubScheduler;
	private _entryId = 0;

	constructor(
		scheduler: IGitHubScheduler | undefined,
		private readonly _policy: GitHubEntityPollingPolicy = defaultPollingPolicy,
		private readonly _credentials: IGitHubCredentials,
		private readonly _transport: IGitHubTransport,
		private readonly _endpoint: IGitHubEndpointProvider,
		private readonly _capabilities: IGitHubCapabilities,
		private readonly _logService: ILogService,
	) {
		super();
		this._clock = scheduler ?? systemGitHubScheduler;
		this._scheduler = this._register(new PullRequestScheduler(this._clock));
		this._register(this._credentials.onDidInvalidate(event => this._handleCredentialInvalidation(event)));
	}

	subscribeRepository(ref: GitHubRepositoryRef, options: GitHubResourceSubscriptionOptions): GitHubRepositorySubscription {
		const normalized = normalizeRepositoryRef(ref);
		const entry = this._getOrCreateEntity<GitHubRepositoryRef, GitHubRepository>('repository', normalized);
		const subscription = new EntitySubscription(entry.resource as GitHubRepositoryResource, entry, this, options);
		entry.subscriptions.add(subscription);
		this._logService.trace(`[GitHubQueryService] Added repository subscription for ${formatEntityRef(entry.ref)} (entry ${entry.id}, subscriptions: ${entry.subscriptions.size})`);
		this._activateEntity(entry);
		return subscription;
	}

	subscribeIssue(ref: GitHubIssueRef, options: GitHubResourceSubscriptionOptions): GitHubIssueSubscription {
		const normalized = normalizeIssueRef(ref);
		const entry = this._getOrCreateEntity<GitHubIssueRef, GitHubIssue>('issue', normalized);
		const subscription = new EntitySubscription(entry.resource as GitHubIssueResource, entry, this, options);
		entry.subscriptions.add(subscription);
		this._logService.trace(`[GitHubQueryService] Added issue subscription for ${formatEntityRef(entry.ref)} (entry ${entry.id}, subscriptions: ${entry.subscriptions.size})`);
		this._activateEntity(entry);
		return subscription;
	}

	async compare(ref: GitHubRepositoryRef, base: string, head: string, signal: AbortSignal): Promise<GitHubComparison> {
		const normalized = normalizeRepositoryRef(ref);
		if (!base || !head) {
			throw new Error('GitHub comparison requires base and head refs');
		}
		return this._withCredential(normalized, signal, async (credential, combinedSignal) => {
			const commits: GitHubComparisonCommit[] = [];
			let files: GitHubChangedFile[] = [];
			let filesPresent = false;
			let first: object | undefined;
			let totalCommits = 0;
			for (let page = 1; page <= maximumPaginationPages; page++) {
				const response = await this._transport.rest<unknown>(credential.account, credential.token, {
					method: 'GET',
					url: `${this._restUrl(normalized, `compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`)}?per_page=100&page=${page}`,
					etag: true,
					priority: 'interactive',
				}, combinedSignal);
				const value = asObject(response.data, 'GitHub comparison response was malformed');
				first ??= value;
				totalCommits = numberProperty(value, 'total_commits') ?? totalCommits;
				commits.push(...arrayProperty(value, 'commits').map(toComparisonCommit));
				if (page === 1) {
					const fileValues = optionalArrayProperty(value, 'files');
					filesPresent = fileValues !== undefined;
					files = (fileValues ?? []).map(toChangedFile);
				}
				if (commits.length >= totalCommits || arrayProperty(value, 'commits').length < 100) {
					break;
				}
			}
			if (!first) {
				throw new GitHubRequestError('GitHub comparison did not return a response', 'malformedResponse');
			}
			const mergeBaseSha = requiredString(objectProperty(first, 'merge_base_commit'), 'sha');
			const commitsComplete = commits.length >= totalCommits;
			return {
				baseSha: requiredString(objectProperty(first, 'base_commit'), 'sha'),
				mergeBaseSha,
				headSha: commitsComplete ? commits.at(-1)?.sha ?? mergeBaseSha : undefined,
				status: enumProperty(first, 'status', ['ahead', 'behind', 'diverged', 'identical'], 'diverged'),
				aheadBy: numberProperty(first, 'ahead_by') ?? 0,
				behindBy: numberProperty(first, 'behind_by') ?? 0,
				totalCommits,
				commits,
				commitsComplete,
				files,
				filesComplete: filesPresent && files.length < 300,
			};
		});
	}

	async listPullRequests(ref: GitHubRepositoryRef, cursor: string | undefined, signal: AbortSignal): Promise<GitHubPullRequestsPage> {
		return this._graphqlWithCredential(ref, listPullRequestsQuery, {
			owner: ref.owner,
			repo: ref.repo,
			cursor: cursor ?? null,
		}, signal, data => {
			const repository = objectProperty(asObject(data, 'GitHub pull request page was malformed'), 'repository');
			const connection = objectProperty(repository, 'pullRequests');
			const pageInfo = objectProperty(connection, 'pageInfo');
			return {
				pullRequests: arrayProperty(connection, 'nodes').map(value => toPullRequestSummary(value, false, false)),
				cursor: nullableStringProperty(pageInfo, 'endCursor'),
				hasNextPage: booleanProperty(pageInfo, 'hasNextPage') ?? false,
			};
		});
	}

	listPullRequestsWaitingForReview(ref: GitHubRepositoryRef, signal: AbortSignal): Promise<readonly GitHubPullRequestSummary[]> {
		return this._searchPullRequests(ref, `repo:${ref.owner}/${ref.repo} is:pr is:open review-requested:@me sort:updated-desc`, true, false, signal);
	}

	listPullRequestsAssignedToViewer(ref: GitHubRepositoryRef, signal: AbortSignal): Promise<readonly GitHubPullRequestSummary[]> {
		return this._searchPullRequests(ref, `repo:${ref.owner}/${ref.repo} is:pr is:open assignee:@me sort:updated-desc`, false, true, signal);
	}

	async getPullRequestContext(ref: PullRequestRef, signal: AbortSignal): Promise<GitHubPullRequestContext> {
		const repositoryRef = normalizeRepositoryRef(ref);
		return this._withCredential(repositoryRef, signal, async (credential, combinedSignal) => {
			const root = `pulls/${ref.number}`;
			const [coreResponse, files, issueComments, reviewComments] = await Promise.all([
				this._transport.rest<unknown>(credential.account, credential.token, {
					method: 'GET',
					url: this._restUrl(repositoryRef, root),
					etag: true,
					priority: 'interactive',
				}, combinedSignal),
				this._fetchRestPages(repositoryRef, credential, `${root}/files`, combinedSignal),
				this._fetchRestPages(repositoryRef, credential, `issues/${ref.number}/comments`, combinedSignal),
				this._fetchRestPages(repositoryRef, credential, `${root}/comments`, combinedSignal),
			]);
			const pullRequest = asObject(coreResponse.data, 'GitHub pull request context was malformed');
			const base = objectProperty(pullRequest, 'base');
			const head = objectProperty(pullRequest, 'head');
			const comments: GitHubPullRequestContextComment[] = [
				...issueComments.map(value => toContextComment('issue', value)),
				...reviewComments.map(value => toContextComment('review', value)),
			].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.updatedAt.localeCompare(right.updatedAt));
			return {
				ref,
				url: requiredString(pullRequest, 'html_url'),
				title: requiredString(pullRequest, 'title'),
				description: nullableStringProperty(pullRequest, 'body') ?? '',
				author: requiredString(objectProperty(pullRequest, 'user'), 'login'),
				draft: booleanProperty(pullRequest, 'draft') ?? false,
				baseRef: requiredString(base, 'ref'),
				branchName: requiredString(head, 'ref'),
				headRef: requiredString(head, 'ref'),
				updatedAt: requiredString(pullRequest, 'updated_at'),
				patch: createPatch(files),
				filesComplete: files.length < 3_000,
				comments,
				commentsComplete: true,
			};
		});
	}

	async findPullRequestByHeadBranch(
		ref: GitHubRepositoryRef,
		branch: string,
		headOwner: string | undefined,
		signal: AbortSignal,
	): Promise<GitHubPullRequestLookup | undefined> {
		const normalized = normalizeRepositoryRef(ref);
		const owner = headOwner ?? normalized.owner;
		return this._withCredential(normalized, signal, async (credential, combinedSignal) => {
			const response = await this._transport.rest<unknown>(credential.account, credential.token, {
				method: 'GET',
				url: `${this._restUrl(normalized, 'pulls')}?head=${encodeURIComponent(`${owner}:${branch}`)}&state=all&sort=updated&direction=desc&per_page=1`,
				etag: true,
				priority: 'interactive',
			}, combinedSignal);
			const values = asArray(response.data, 'GitHub pull request lookup response was malformed');
			return values.length > 0 ? toPullRequestLookup(normalized, values[0]) : undefined;
		});
	}

	async findPullRequestByHeadSha(ref: GitHubRepositoryRef, sha: string, signal: AbortSignal): Promise<GitHubPullRequestLookup | undefined> {
		const normalized = normalizeRepositoryRef(ref);
		return this._withCredential(normalized, signal, async (credential, combinedSignal) => {
			let values: readonly unknown[];
			try {
				const response = await this._transport.rest<unknown>(credential.account, credential.token, {
					method: 'GET',
					url: `${this._restUrl(normalized, `commits/${encodeURIComponent(sha)}/pulls`)}?per_page=${maximumCommitPullRequests}`,
					etag: true,
					priority: 'interactive',
				}, combinedSignal);
				values = asArray(response.data, 'GitHub commit pull request lookup response was malformed');
			} catch (error) {
				if (error instanceof GitHubRequestError && error.statusCode === 422 && error.responseBody?.includes('No commit found for SHA')) {
					return undefined;
				}
				throw error;
			}
			if (values.length >= maximumCommitPullRequests) {
				return undefined;
			}
			const atHead = values.filter(value => stringProperty(objectProperty(asObject(value, 'GitHub pull request was malformed'), 'head'), 'sha') === sha);
			const open = atHead.filter(value => stringProperty(asObject(value, 'GitHub pull request was malformed'), 'state') === 'open');
			const candidates = open.length > 0 ? open : atHead;
			return candidates.length === 1 ? toPullRequestLookup(normalized, candidates[0]) : undefined;
		});
	}

	getRecentAssignedIssues(ref: GitHubRepositoryRef, signal: AbortSignal): Promise<readonly GitHubRecentIssue[]> {
		return this._graphqlWithCredential(ref, recentIssuesQuery, {
			query: `repo:${ref.owner}/${ref.repo} is:issue is:open assignee:@me sort:updated-desc`,
		}, signal, data => arrayProperty(objectProperty(asObject(data, 'GitHub recent issues response was malformed'), 'search'), 'nodes')
			.filter(isObject)
			.map(toRecentIssue));
	}

	getRecentAuthoredPullRequests(ref: GitHubRepositoryRef, signal: AbortSignal): Promise<readonly GitHubRecentPullRequest[]> {
		return this._graphqlWithCredential(ref, recentPullRequestsQuery, {
			query: `repo:${ref.owner}/${ref.repo} is:pr is:open author:@me sort:updated-desc`,
		}, signal, data => arrayProperty(objectProperty(asObject(data, 'GitHub recent pull requests response was malformed'), 'search'), 'nodes')
			.filter(isObject)
			.map(toRecentPullRequest));
	}

	async getPullRequestReviewThreadSummary(ref: PullRequestRef, signal: AbortSignal): Promise<readonly GitHubRecentPullRequestReviewThread[]> {
		const result: GitHubRecentPullRequestReviewThread[] = [];
		let after: string | undefined;
		for (let page = 0; page < maximumPaginationPages; page++) {
			const response = await this._graphqlRaw(ref, reviewThreadSummaryQuery, {
				owner: ref.owner,
				repo: ref.repo,
				number: ref.number,
				after,
			}, signal);
			const connection = objectAt(response, 'repository', 'pullRequest', 'reviewThreads');
			result.push(...arrayProperty(connection, 'nodes').filter(isObject).map(toReviewThreadSummary));
			const pageInfo = objectProperty(connection, 'pageInfo');
			if (!booleanProperty(pageInfo, 'hasNextPage')) {
				return result;
			}
			after = requiredString(pageInfo, 'endCursor');
		}
		throw new GitHubRequestError('GitHub review-thread summary pagination exceeded its page limit', 'malformedResponse');
	}

	async getIssuesWithLinkedPullRequests(
		ref: GitHubRepositoryRef,
		issueNumbers: readonly number[],
		signal: AbortSignal,
	): Promise<readonly number[]> {
		const normalizedNumbers = [...new Set(issueNumbers.filter(number => Number.isInteger(number) && number > 0))];
		const linked: number[] = [];
		for (let offset = 0; offset < normalizedNumbers.length; offset += maximumIssueLinkageBatchSize) {
			const batch = normalizedNumbers.slice(offset, offset + maximumIssueLinkageBatchSize);
			const variableDefinitions = batch.map((_, index) => `$issue${index}: Int!`).join(', ');
			const selections = batch.map((_, index) => `issue${index}: issue(number: $issue${index}) {
				closedByPullRequestsReferences(first: 1, includeClosedPrs: true) { totalCount }
			}`).join('\n');
			const query = `query AgentHostIssueLinkage($owner: String!, $repo: String!, ${variableDefinitions}) {
				repository(owner: $owner, name: $repo) { ${selections} }
				rateLimit { limit remaining used resetAt }
			}`;
			const variables: Record<string, string | number> = { owner: ref.owner, repo: ref.repo };
			batch.forEach((number, index) => variables[`issue${index}`] = number);
			const data = await this._graphqlRaw(ref, query, variables, signal);
			const repository = objectProperty(asObject(data, 'GitHub issue linkage response was malformed'), 'repository');
			batch.forEach((number, index) => {
				const issue = optionalObjectProperty(repository, `issue${index}`);
				const references = issue ? optionalObjectProperty(issue, 'closedByPullRequestsReferences') : undefined;
				if ((references ? numberProperty(references, 'totalCount') ?? 0 : 0) > 0) {
					linked.push(number);
				}
			});
		}
		return linked;
	}

	updateEntitySubscription(entry: EntityEntry<EntityRef, EntityValue>): void {
		if (this._shouldPollEntity(entry)) {
			this._scheduleEntity(entry, this._clock.now() + this._pollDelay(entry));
		}
	}

	async refreshEntity(entry: EntityEntry<EntityRef, EntityValue>, token: CancellationToken): Promise<void> {
		if (entry.disposed || entry.subscriptions.size === 0) {
			return;
		}
		this._scheduler.cancel(this._entityTaskKey(entry));
		if (entry.operation) {
			await raceCancellationError(entry.operation.promise, token);
			return;
		}
		const controller = new AbortController();
		const operation: IEntityOperation = {
			controller,
			promise: this._runEntityFetch(entry, controller).finally(() => {
				if (entry.operation === operation) {
					entry.operation = undefined;
				}
			}),
		};
		entry.operation = operation;
		await raceCancellationError(operation.promise, token);
	}

	removeEntitySubscription(subscription: EntitySubscription<EntityRef, EntityValue>): void {
		const entry = subscription.entry;
		if (!entry.subscriptions.delete(subscription)) {
			return;
		}
		if (entry.subscriptions.size > 0) {
			this.updateEntitySubscription(entry);
			return;
		}
		entry.dormantAt = this._clock.now();
		this._logService.trace(`[GitHubQueryService] ${entry.kind} ${formatEntityRef(entry.ref)} became dormant (entry ${entry.id})`);
		this._scheduler.cancel(this._entityTaskKey(entry));
		entry.operation?.controller.abort(new Error('GitHub resource became dormant'));
		entry.operation = undefined;
		this._dormant.set(entry.id, entry);
		this._scheduler.schedule(this._dormantTaskKey(entry), this._clock.now() + this._policy.dormantGrace, () => {
			if (entry.dormantAt !== undefined) {
				this._disposeEntity(entry);
			}
		});
		this._trimDormant();
	}

	clear(): void {
		for (const entry of [...this._entries]) {
			this._disposeEntity(entry);
		}
		this._scheduler.clear();
		this._unsupportedGraphQLQueries.clear();
	}

	override dispose(): void {
		this.clear();
		super.dispose();
	}

	private _getOrCreateEntity<TRef extends EntityRef, TValue extends EntityValue>(kind: EntityKind, ref: TRef): EntityEntry<TRef, TValue> {
		const key = entityKey(kind, ref);
		const existing = this._entriesByKey.get(key);
		if (existing) {
			return existing as EntityEntry<TRef, TValue>;
		}
		const entry = new EntityEntry<TRef, TValue>(this._entryId++, kind, ref);
		entry.keys.add(key);
		this._entriesByKey.set(key, entry as EntityEntry<EntityRef, EntityValue>);
		this._entries.add(entry as EntityEntry<EntityRef, EntityValue>);
		this._logService.debug(`[GitHubQueryService] Created ${kind} resource ${formatEntityRef(ref)} (entry ${entry.id})`);
		return entry;
	}

	private _activateEntity(entry: EntityEntry<EntityRef, EntityValue>): void {
		let resumed = false;
		if (entry.dormantAt !== undefined) {
			entry.dormantAt = undefined;
			this._dormant.delete(entry.id);
			this._scheduler.cancel(this._dormantTaskKey(entry));
			resumed = true;
		}
		const state = entry.state.get();
		if (state.status === 'missing'
			|| state.status === 'stale'
			|| state.status === 'error'
			|| resumed && entry.operation === undefined && state.status !== 'ready') {
			this._scheduleEntity(entry, this._clock.now());
		} else if (resumed && this._shouldPollEntity(entry)) {
			this._scheduleEntity(entry, this._clock.now() + this._pollDelay(entry));
		}
	}

	private async _runEntityFetch(entry: EntityEntry<EntityRef, EntityValue>, controller: AbortController): Promise<void> {
		const previous = entry.state.get();
		entry.state.set({
			...previous,
			status: 'loading',
			complete: false,
			attemptedAt: new Date(this._clock.now()).toISOString(),
			error: undefined,
		}, undefined);
		let credential: GitHubCredential | undefined;
		const startedAt = this._clock.now();
		this._logService.trace(`[GitHubQueryService] Refreshing ${entry.kind} ${formatEntityRef(entry.ref)} (entry ${entry.id})`);
		try {
			credential = await this._credentials.getCredential(controller.signal);
			if (!sameAccount(entry.ref, credential)) {
				throw new GitHubRequestError('GitHub resource account does not match the current credential', 'authentication');
			}
			const response = await this._transport.rest<unknown>(credential.account, credential.token, {
				method: 'GET',
				url: entry.kind === 'repository'
					? this._restUrl(entry.ref, '')
					: this._restUrl(entry.ref, `issues/${(entry.ref as GitHubIssueRef).number}`),
				etag: true,
				priority: toRequestPriority(this._effectivePriority(entry)),
			}, AbortSignal.any([controller.signal, credential.signal]));
			if (entry.disposed || controller.signal.aborted || entry.subscriptions.size === 0) {
				return;
			}
			const value = entry.kind === 'repository'
				? toRepository(response.data)
				: toIssue(response.data);
			entry.state.set({
				value,
				status: 'ready',
				complete: true,
				observedAt: new Date(this._clock.now()).toISOString(),
				attemptedAt: new Date(this._clock.now()).toISOString(),
			}, undefined);
			if (entry.kind === 'repository') {
				this._canonicalizeRepository(entry as EntityEntry<GitHubRepositoryRef, GitHubRepository>, value as GitHubRepository);
			}
			this._logService.trace(`[GitHubQueryService] Refreshed ${entry.kind} ${formatEntityRef(entry.ref)} in ${this._clock.now() - startedAt}ms (entry ${entry.id})`);
			if (this._shouldPollEntity(entry)) {
				this._scheduleEntity(entry, this._clock.now() + this._pollDelay(entry) + this._clock.jitter(this._policy.jitter));
			}
		} catch (error) {
			if (credential && sameAccount(entry.ref, credential)) {
				this._credentials.handleRequestError(credential, error);
			}
			if (!entry.disposed && !controller.signal.aborted && entry.subscriptions.size > 0) {
				if (credential?.signal.aborted) {
					this._scheduleEntity(entry, this._clock.now());
					throw error;
				}
				entry.state.set({
					...previous,
					status: 'error',
					complete: false,
					attemptedAt: new Date(this._clock.now()).toISOString(),
					error: toFragmentError(error),
				}, undefined);
				if (!(error instanceof GitHubRequestError) || error.kind !== 'authentication') {
					this._scheduleEntity(entry, this._clock.now() + this._pollDelay(entry) + this._clock.jitter(this._policy.jitter));
				}
			}
			this._logService.debug(`[GitHubQueryService] Refresh ${entry.kind} ${formatEntityRef(entry.ref)} ${controller.signal.aborted ? 'cancelled' : 'failed'} after ${this._clock.now() - startedAt}ms (${queryErrorKind(error)})`);
			throw error;
		}
	}

	private async _searchPullRequests(
		ref: GitHubRepositoryRef,
		query: string,
		reviewRequested: boolean,
		assigned: boolean,
		signal: AbortSignal,
	): Promise<readonly GitHubPullRequestSummary[]> {
		return this._graphqlWithCredential(ref, searchPullRequestsQuery, { query }, signal, data =>
			arrayProperty(objectProperty(asObject(data, 'GitHub pull request search response was malformed'), 'search'), 'nodes')
				.filter(isObject)
				.map(value => toPullRequestSummary(value, reviewRequested, assigned)));
	}

	private async _graphqlRaw(
		ref: GitHubRepositoryRef,
		query: string,
		variables: Readonly<Record<string, unknown>>,
		signal: AbortSignal,
	): Promise<unknown> {
		return this._withCredential(ref, signal, async (credential, combinedSignal) => {
			const capabilities = await this._capabilities.getCapabilities(credential, undefined, combinedSignal);
			if (!capabilities.graphql) {
				throw new GitHubRequestError('GitHub GraphQL is unavailable on this host', 'schema');
			}
			const queryKey = `${credential.account.host.toLowerCase()}\x00${query}`;
			if (this._unsupportedGraphQLQueries.has(queryKey)) {
				throw new GitHubRequestError('GitHub GraphQL query is unsupported on this host', 'schema');
			}
			try {
				const response = await this._transport.graphql<unknown>(
					credential.account,
					credential.token,
					this._endpoint.getGraphQlUri(),
					query,
					variables,
					combinedSignal,
					'interactive',
				);
				throwGraphQLErrors(response.errors);
				return response.data;
			} catch (error) {
				if (error instanceof GitHubRequestError && error.kind === 'schema') {
					this._unsupportedGraphQLQueries.add(queryKey);
				}
				throw error;
			}
		});
	}

	private async _graphqlWithCredential<T>(
		ref: GitHubRepositoryRef,
		query: string,
		variables: Readonly<Record<string, unknown>>,
		signal: AbortSignal,
		map: (data: unknown) => T,
	): Promise<T> {
		return map(await this._graphqlRaw(ref, query, variables, signal));
	}

	private async _fetchRestPages(
		ref: GitHubRepositoryRef,
		credential: GitHubCredential,
		route: string,
		signal: AbortSignal,
	): Promise<readonly unknown[]> {
		const result: unknown[] = [];
		let url: string | undefined = `${this._restUrl(ref, route)}?per_page=100&page=1`;
		for (let page = 0; url && page < maximumPaginationPages; page++) {
			const response = await this._transport.rest<unknown>(credential.account, credential.token, {
				method: 'GET',
				url,
				etag: true,
				priority: 'interactive',
			}, signal);
			const values = asArray(response.data, 'GitHub paginated response was not an array');
			result.push(...values);
			url = nextLink(response.link);
			if (!url && values.length === 100) {
				url = `${this._restUrl(ref, route)}?per_page=100&page=${page + 2}`;
			}
			if (values.length < 100) {
				url = undefined;
			}
		}
		if (url) {
			throw new GitHubRequestError('GitHub pagination exceeded its page limit', 'malformedResponse');
		}
		return result;
	}

	private async _withCredential<T>(
		ref: GitHubRepositoryRef,
		signal: AbortSignal,
		task: (credential: GitHubCredential, signal: AbortSignal) => Promise<T>,
	): Promise<T> {
		const credential = await this._credentials.getCredential(signal);
		if (!sameAccount(ref, credential)) {
			throw new GitHubRequestError('GitHub query account does not match the current credential', 'authentication');
		}
		try {
			return await task(credential, AbortSignal.any([signal, credential.signal]));
		} catch (error) {
			this._credentials.handleRequestError(credential, error);
			throw error;
		}
	}

	private _canonicalizeRepository(entry: EntityEntry<GitHubRepositoryRef, GitHubRepository>, repository: GitHubRepository): void {
		const [owner, repo, extra] = repository.nameWithOwner.split('/');
		if (!owner || !repo || extra) {
			return;
		}
		entry.ref = { ...entry.ref, owner, repo };
		const alias = entityKey('repository', entry.ref);
		if (!this._entriesByKey.has(alias)) {
			this._entriesByKey.set(alias, entry as EntityEntry<EntityRef, EntityValue>);
			entry.keys.add(alias);
			this._logService.debug(`[GitHubQueryService] Canonicalized repository ${formatEntityRef(entry.ref)} (entry ${entry.id}, aliases: ${entry.keys.size})`);
		}
	}

	private _handleCredentialInvalidation(event: GitHubCredentialInvalidation): void {
		this._logService.debug(`[GitHubQueryService] Handling credential invalidation (${event.reason}) for ${this._entries.size} resource(s)`);
		for (const entry of [...this._entries]) {
			if (!event.credential || sameAccount(entry.ref, event.credential)) {
				if (event.reason === 'replacement' || event.reason === 'authentication') {
					const current = entry.state.get();
					entry.state.set({
						...current,
						status: current.value ? 'stale' : 'missing',
						complete: false,
						error: undefined,
					}, undefined);
					if (entry.subscriptions.size > 0) {
						this._scheduleEntity(entry, this._clock.now());
					}
				} else {
					this._disposeEntity(entry);
				}
			}
		}
	}

	private _disposeEntity(entry: EntityEntry<EntityRef, EntityValue>): void {
		if (entry.disposed) {
			return;
		}
		entry.disposed = true;
		this._logService.trace(`[GitHubQueryService] Disposing ${entry.kind} ${formatEntityRef(entry.ref)} (entry ${entry.id})`);
		entry.operation?.controller.abort(new Error('GitHub resource was disposed'));
		this._scheduler.cancel(this._entityTaskKey(entry));
		this._scheduler.cancel(this._dormantTaskKey(entry));
		for (const key of entry.keys) {
			if (this._entriesByKey.get(key) === entry) {
				this._entriesByKey.delete(key);
			}
		}
		entry.subscriptions.clear();
		this._dormant.delete(entry.id);
		this._entries.delete(entry);
	}

	private _trimDormant(): void {
		while (this._dormant.size > this._policy.maximumDormantEntries) {
			const oldest = [...this._dormant.values()]
				.sort((left, right) => (left.dormantAt ?? 0) - (right.dormantAt ?? 0) || left.id - right.id)[0];
			this._disposeEntity(oldest);
		}
	}

	private _scheduleEntity(entry: EntityEntry<EntityRef, EntityValue>, dueAt: number): void {
		if (entry.disposed || entry.subscriptions.size === 0) {
			return;
		}
		this._scheduler.schedule(this._entityTaskKey(entry), dueAt, () => {
			void this.refreshEntity(entry, CancellationToken.None).catch(error => {
				if (!entry.disposed && entry.subscriptions.size > 0) {
					this._logService.warn(`[GitHubQueryService] Failed to refresh ${entry.kind} ${entry.ref.owner}/${entry.ref.repo}`, error);
				}
			});
		});
	}

	private _effectivePriority(entry: EntityEntry<EntityRef, EntityValue>): GitHubResourcePriority {
		let result: GitHubResourcePriority = 'background';
		for (const subscription of entry.subscriptions) {
			if (subscription.options.priority === 'interactive') {
				return 'interactive';
			}
			if (subscription.options.priority === 'visible') {
				result = 'visible';
			}
		}
		return result;
	}

	private _pollDelay(entry: EntityEntry<EntityRef, EntityValue>): number {
		return this._effectivePriority(entry) === 'background' ? this._policy.background : this._policy.visible;
	}

	private _shouldPollEntity(entry: EntityEntry<EntityRef, EntityValue>): boolean {
		if (entry.kind === 'repository') {
			return true;
		}
		const state = entry.state.get();
		return state.status !== 'ready' || (state.value as GitHubIssue | undefined)?.state === 'open';
	}

	private _entityTaskKey(entry: EntityEntry<EntityRef, EntityValue>): string {
		return `entity\x00${entry.id}`;
	}

	private _dormantTaskKey(entry: EntityEntry<EntityRef, EntityValue>): string {
		return `entity-dormant\x00${entry.id}`;
	}

	private _restUrl(ref: GitHubRepositoryRef, route: string): string {
		const suffix = route ? `/${route}` : '';
		return `${this._endpoint.getApiBaseUri()}/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}${suffix}`;
	}
}

function normalizeRepositoryRef(ref: GitHubRepositoryRef): GitHubRepositoryRef {
	const host = ref.host.trim().toLowerCase();
	const accountId = ref.accountId.trim();
	const owner = ref.owner.trim();
	const repo = ref.repo.trim();
	if (!host || !accountId || !owner || !repo) {
		throw new Error('GitHub repository reference is incomplete');
	}
	return { host, accountId, owner, repo };
}

function normalizeIssueRef(ref: GitHubIssueRef): GitHubIssueRef {
	const repository = normalizeRepositoryRef(ref);
	if (!Number.isInteger(ref.number) || ref.number <= 0) {
		throw new Error('GitHub issue reference requires a positive number');
	}
	return { ...repository, number: ref.number };
}

function entityKey(kind: EntityKind, ref: EntityRef): string {
	return [
		kind,
		ref.host.toLowerCase(),
		ref.accountId,
		ref.owner.toLowerCase(),
		ref.repo.toLowerCase(),
		hasKey(ref, { number: true }) ? ref.number : '',
	].join('\x00');
}

function sameAccount(
	ref: GitHubRepositoryRef,
	credential: { readonly account: { readonly host: string; readonly accountId: string } },
): boolean {
	return ref.host.toLowerCase() === credential.account.host.toLowerCase() && ref.accountId === credential.account.accountId;
}

function toRequestPriority(priority: GitHubResourcePriority): 'interactive' | 'visible' | 'background' {
	return priority;
}

function toRepository(value: unknown): GitHubRepository {
	const item = asObject(value, 'GitHub repository response was malformed');
	const owner = objectProperty(item, 'owner');
	return {
		id: idProperty(item, 'node_id') ?? idProperty(item, 'id'),
		owner: requiredActor(owner),
		name: requiredString(item, 'name'),
		nameWithOwner: requiredString(item, 'full_name'),
		defaultBranch: requiredString(item, 'default_branch'),
		private: booleanProperty(item, 'private') ?? false,
		description: nullableStringProperty(item, 'description') ?? '',
		url: requiredString(item, 'html_url'),
		archived: booleanProperty(item, 'archived') ?? false,
		fork: booleanProperty(item, 'fork') ?? false,
	};
}

function toIssue(value: unknown): GitHubIssue {
	const item = asObject(value, 'GitHub issue response was malformed');
	if (Reflect.has(item, 'pull_request')) {
		throw new GitHubRequestError('Requested GitHub issue is a pull request', 'validation');
	}
	return {
		id: idProperty(item, 'node_id') ?? idProperty(item, 'id'),
		number: requiredNumber(item, 'number'),
		title: requiredString(item, 'title'),
		body: nullableStringProperty(item, 'body') ?? '',
		url: requiredString(item, 'html_url'),
		state: stringProperty(item, 'state') === 'closed' ? 'closed' : 'open',
		stateReason: enumProperty(item, 'state_reason', ['completed', 'not_planned', 'duplicate', 'reopened'], undefined),
		author: requiredActor(objectProperty(item, 'user')),
		assignees: arrayProperty(item, 'assignees').filter(isObject).map(requiredActor),
		labels: arrayProperty(item, 'labels').flatMap(label => {
			if (typeof label === 'string') {
				return [label];
			}
			if (isObject(label)) {
				const name = stringProperty(label, 'name');
				return name ? [name] : [];
			}
			return [];
		}),
		createdAt: requiredString(item, 'created_at'),
		updatedAt: requiredString(item, 'updated_at'),
		closedAt: nullableStringProperty(item, 'closed_at'),
	};
}

function toChangedFile(value: unknown): GitHubChangedFile {
	const item = asObject(value, 'GitHub changed file was malformed');
	return {
		filename: requiredString(item, 'filename'),
		previousFilename: stringProperty(item, 'previous_filename'),
		status: enumProperty(item, 'status', ['added', 'removed', 'modified', 'renamed', 'copied', 'changed', 'unchanged'], 'changed'),
		additions: numberProperty(item, 'additions') ?? 0,
		deletions: numberProperty(item, 'deletions') ?? 0,
		changes: numberProperty(item, 'changes') ?? 0,
		patch: stringProperty(item, 'patch'),
		blobUrl: stringProperty(item, 'blob_url'),
	};
}

function toComparisonCommit(value: unknown): GitHubComparisonCommit {
	const item = asObject(value, 'GitHub comparison commit was malformed');
	const commit = objectProperty(item, 'commit');
	const author = optionalObjectProperty(item, 'author');
	return {
		sha: requiredString(item, 'sha'),
		message: requiredString(commit, 'message'),
		author: author ? requiredActor(author) : undefined,
		committedAt: optionalObjectProperty(commit, 'committer') ? stringProperty(objectProperty(commit, 'committer'), 'date') : undefined,
		url: stringProperty(item, 'html_url'),
	};
}

function toPullRequestSummary(value: unknown, reviewRequested: boolean, assigned: boolean): GitHubPullRequestSummary {
	const item = asObject(value, 'GitHub pull request summary was malformed');
	const number = requiredNumber(item, 'number');
	const author = optionalObjectProperty(item, 'author');
	return {
		number,
		title: requiredString(item, 'title'),
		author: author ? requiredActor(author) : { login: 'ghost' },
		headRef: requiredString(item, 'headRefName'),
		checkoutRef: `refs/pull/${number}/head`,
		draft: booleanProperty(item, 'isDraft') ?? false,
		updatedAt: requiredString(item, 'updatedAt'),
		additions: numberProperty(item, 'additions') ?? 0,
		deletions: numberProperty(item, 'deletions') ?? 0,
		reviewRequestedFromViewer: reviewRequested,
		assignedToViewer: assigned,
	};
}

function toPullRequestLookup(ref: GitHubRepositoryRef, value: unknown): GitHubPullRequestLookup {
	const item = asObject(value, 'GitHub pull request lookup response was malformed');
	return {
		ref: { ...ref, number: requiredNumber(item, 'number') },
		id: idProperty(item, 'node_id'),
		url: requiredString(item, 'html_url'),
		createdAt: stringProperty(item, 'created_at'),
	};
}

function toContextComment(kind: 'issue' | 'review', value: unknown): GitHubPullRequestContextComment {
	const item = asObject(value, 'GitHub pull request context comment was malformed');
	return {
		kind,
		author: requiredString(objectProperty(item, 'user'), 'login'),
		body: requiredString(item, 'body'),
		createdAt: requiredString(item, 'created_at'),
		updatedAt: requiredString(item, 'updated_at'),
		path: kind === 'review' ? stringProperty(item, 'path') : undefined,
		line: kind === 'review' ? numberProperty(item, 'line') ?? numberProperty(item, 'original_line') : undefined,
	};
}

function createPatch(values: readonly unknown[]): string {
	return values.map(value => {
		const file = asObject(value, 'GitHub pull request file was malformed');
		return [
			`diff --git a/${requiredString(file, 'filename')} b/${requiredString(file, 'filename')}`,
			stringProperty(file, 'patch') ?? `[Patch unavailable: ${stringProperty(file, 'status') ?? 'changed'}, +${numberProperty(file, 'additions') ?? 0} -${numberProperty(file, 'deletions') ?? 0}]`,
		].join('\n');
	}).join('\n\n');
}

function toRecentIssue(value: object): GitHubRecentIssue {
	return {
		number: requiredNumber(value, 'number'),
		title: requiredString(value, 'title'),
		url: requiredString(value, 'url'),
		updatedAt: requiredString(value, 'updatedAt'),
	};
}

function toRecentPullRequest(value: object): GitHubRecentPullRequest {
	const commits = objectProperty(value, 'commits');
	const node = arrayProperty(commits, 'nodes').find(isObject);
	const commit = node ? optionalObjectProperty(node, 'commit') : undefined;
	const rollup = commit ? optionalObjectProperty(commit, 'statusCheckRollup') : undefined;
	return {
		number: requiredNumber(value, 'number'),
		title: requiredString(value, 'title'),
		url: requiredString(value, 'url'),
		updatedAt: requiredString(value, 'updatedAt'),
		statusCheckRollupState: rollup ? stringProperty(rollup, 'state') : undefined,
		latestCommitAt: commit ? stringProperty(commit, 'committedDate') : undefined,
	};
}

function toReviewThreadSummary(value: object): GitHubRecentPullRequestReviewThread {
	const comments = objectProperty(value, 'comments');
	const latest = arrayProperty(comments, 'nodes').find(isObject);
	return {
		isResolved: booleanProperty(value, 'isResolved') ?? false,
		latestCommentAt: latest ? stringProperty(latest, 'createdAt') : undefined,
	};
}

function throwGraphQLErrors(errors: readonly GitHubGraphQLError[]): void {
	if (errors.length === 0) {
		return;
	}
	const types = errors.map(error => error.type?.toUpperCase());
	const codes = errors.map(error => error.extensions?.code?.toUpperCase());
	const kind = types.includes('RATE_LIMITED')
		? 'rateLimit'
		: types.some(type => type === 'FORBIDDEN' || type === 'UNAUTHORIZED')
			? 'authorization'
			: types.some(type => type?.includes('NOT_FOUND'))
				? 'notFound'
				: types.some(type => type?.includes('VALIDATION'))
					? 'schema'
					: codes.some(code => code === 'UNDEFINEDFIELD' || code === 'ARGUMENTNOTACCEPTED' || code === 'VARIABLEMISMATCH')
						? 'schema'
						: 'server';
	throw new GitHubRequestError(
		`GitHub GraphQL query failed: ${errors.map(error => error.message ?? error.type ?? 'unknown error').join('; ')}`,
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

function objectAt(value: unknown, ...path: readonly string[]): object {
	let current = asObject(value, 'GitHub response was malformed');
	for (const part of path) {
		current = objectProperty(current, part);
	}
	return current;
}

function asObject(value: unknown, message: string): object {
	if (!isObject(value)) {
		throw new GitHubRequestError(message, 'malformedResponse');
	}
	return value;
}

function isObject(value: unknown): value is object {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asArray(value: unknown, message: string): readonly unknown[] {
	if (!Array.isArray(value)) {
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
	return asArray(Reflect.get(value, key), `GitHub response property ${key} was not an array`);
}

function optionalArrayProperty(value: object, key: string): readonly unknown[] | undefined {
	const property = Reflect.get(value, key);
	return property === null || property === undefined
		? undefined
		: asArray(property, `GitHub response property ${key} was not an array`);
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

function numberProperty(value: object, key: string): number | undefined {
	const property = Reflect.get(value, key);
	return typeof property === 'number' && Number.isFinite(property) ? property : undefined;
}

function requiredNumber(value: object, key: string): number {
	const property = numberProperty(value, key);
	if (property === undefined) {
		throw new GitHubRequestError(`GitHub response property ${key} was not a number`, 'malformedResponse');
	}
	return property;
}

function booleanProperty(value: object, key: string): boolean | undefined {
	const property = Reflect.get(value, key);
	return typeof property === 'boolean' ? property : undefined;
}

function idProperty(value: object, key: string): string | undefined {
	const property = Reflect.get(value, key);
	return typeof property === 'string' || typeof property === 'number' ? String(property) : undefined;
}

function enumProperty<T extends string>(value: object, key: string, allowed: readonly T[], fallback: T): T;
function enumProperty<T extends string>(value: object, key: string, allowed: readonly T[], fallback: undefined): T | undefined;
function enumProperty<T extends string>(value: object, key: string, allowed: readonly T[], fallback: T | undefined): T | undefined {
	const property = stringProperty(value, key);
	return property && allowed.includes(property as T) ? property as T : fallback;
}

function requiredActor(value: object): GitHubActor {
	const login = requiredString(value, 'login');
	const id = idProperty(value, 'databaseId') ?? idProperty(value, 'id');
	return id ? { id, login } : { login };
}

function toFragmentError(error: unknown): { readonly message: string; readonly kind: import('./githubTypes.js').GitHubRequestErrorKind; readonly statusCode?: number } {
	if (error instanceof GitHubRequestError) {
		return { message: error.message, kind: error.kind, statusCode: error.statusCode };
	}
	return { message: error instanceof Error ? error.message : String(error), kind: 'unknown' };
}

function formatEntityRef(ref: EntityRef): string {
	return `${ref.host}/${ref.owner}/${ref.repo}${hasKey(ref, { number: true }) ? `#${ref.number}` : ''}`;
}

function queryErrorKind(error: unknown): string {
	if (error instanceof GitHubRequestError) {
		return `${error.kind}${error.statusCode === undefined ? '' : `:${error.statusCode}`}`;
	}
	return error instanceof Error ? error.name : typeof error;
}
