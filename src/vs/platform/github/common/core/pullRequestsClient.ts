/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mergeArrayPages } from '../client/pagination.js';
import { ApiPaginationOptions, ApiRequestOptions } from '../client/request.js';
import { numberSegment, pathSegment, repositoryPath, withQuery } from '../client/routing.js';
import { parse } from '../client/schema.js';
import { PageOptions, RepositoryRef } from '../client/types.js';
import { ChangedFile, Connection, CursorOptions, NodeIdentity } from './core.js';
import { CoreClient, cursorVariables, parseAccount, parseActor, parseChangedFile, parseConnection, parseLabel, parseMilestone, parseNodeIdentity, parseRepositoryIdentity, parseTeam } from './coreClient.js';
import { UpdateBranchOptions, AutoMergeState, CreatePullRequestRequest, DraftState, EnableAutoMergeRequest, EnqueuePullRequestRequest, IPullRequestsClient, ListPullRequestsOptions, MergePullRequestRequest, MergeResult, PullRequest, PullRequestBranch, PullRequestListItem, PullRequestSummary, UpdateBranchResult, UpdatePullRequestRequest } from './pullRequests.js';
import { Commit } from './repositories.js';
import { parseCommit } from './repositoriesClient.js';

export class PullRequestsClient implements IPullRequestsClient {
	constructor(private readonly _client: CoreClient) { }

	async list(repository: RepositoryRef, signal: AbortSignal, options?: ListPullRequestsOptions): Promise<readonly PullRequestSummary[]> {
		const { query, ...requestOptions } = options ?? {};
		return this._client.requestPages({
			method: 'GET',
			path: withQuery(`${repositoryPath(repository)}/pulls`, { ...query }),
			authentication: 'optional',
			expectedStatus: 200,
			options: requestOptions
		}, signal, parsePullRequests, mergeArrayPages);
	}

	async listConnection(repository: RepositoryRef, signal: AbortSignal, options?: ApiPaginationOptions<CursorOptions>): Promise<Connection<PullRequestListItem> | null> {
		const { query = {}, ...requestOptions } = options ?? {};
		return this._client.graphqlPages(
			listPullRequestsQuery,
			{ owner: repository.owner, name: repository.name, ...cursorVariables(query) },
			signal,
			data => parsePullRequestsQuery(data)?.repository?.pullRequests ?? null,
			requestOptions
		);
	}

	async get(repository: RepositoryRef, pullNumber: number, signal: AbortSignal, options?: ApiRequestOptions): Promise<PullRequest> {
		return this._client.request({
			method: 'GET',
			path: pullRequestPath(repository, pullNumber),
			authentication: 'optional',
			expectedStatus: 200,
			options
		}, signal, parsePullRequest);
	}

	async create(repository: RepositoryRef, request: CreatePullRequestRequest, signal: AbortSignal, options?: ApiRequestOptions): Promise<PullRequest> {
		return this._client.request({
			method: 'POST',
			path: `${repositoryPath(repository)}/pulls`,
			body: request,
			authentication: 'required',
			expectedStatus: 201,
			options
		}, signal, parsePullRequest);
	}

	async update(repository: RepositoryRef, pullNumber: number, request: UpdatePullRequestRequest, signal: AbortSignal, options?: ApiRequestOptions): Promise<PullRequest> {
		return this._client.request({
			method: 'PATCH',
			path: pullRequestPath(repository, pullNumber),
			body: request,
			authentication: 'required',
			expectedStatus: 200,
			options
		}, signal, parsePullRequest);
	}

	async listForCommit(repository: RepositoryRef, commitRef: string, signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<readonly PullRequestSummary[]> {
		const { query, ...requestOptions } = options ?? {};
		return this._client.requestPages({
			method: 'GET',
			path: withQuery(`${repositoryPath(repository)}/commits/${pathSegment(commitRef)}/pulls`, { ...query }),
			authentication: 'optional',
			expectedStatus: 200,
			options: requestOptions
		}, signal, parsePullRequests, mergeArrayPages);
	}

	async listFiles(repository: RepositoryRef, pullNumber: number, signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<readonly ChangedFile[]> {
		const { query, ...requestOptions } = options ?? {};
		return this._client.requestPages({
			method: 'GET',
			path: withQuery(`${pullRequestPath(repository, pullNumber)}/files`, { ...query }),
			authentication: 'optional',
			expectedStatus: 200,
			options: requestOptions
		}, signal, parseFiles, mergeArrayPages);
	}

	async listCommits(repository: RepositoryRef, pullNumber: number, signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<readonly Commit[]> {
		const { query, ...requestOptions } = options ?? {};
		return this._client.requestPages({
			method: 'GET',
			path: withQuery(`${pullRequestPath(repository, pullNumber)}/commits`, { ...query }),
			authentication: 'optional',
			expectedStatus: 200,
			options: requestOptions
		}, signal, parseCommits, mergeArrayPages);
	}

	async getDiff(repository: RepositoryRef, pullNumber: number, format: 'diff' | 'patch', signal: AbortSignal, options?: ApiRequestOptions): Promise<string> {
		return this._client.request({
			method: 'GET',
			path: pullRequestPath(repository, pullNumber),
			accept: `application/vnd.github.${format}`,
			authentication: 'optional',
			expectedStatus: 200,
			responseBody: 'text',
			options
		}, signal, parse.string);
	}

	async merge(repository: RepositoryRef, pullNumber: number, request: MergePullRequestRequest, signal: AbortSignal, options?: ApiRequestOptions): Promise<MergeResult> {
		return this._client.request({
			method: 'PUT',
			path: `${pullRequestPath(repository, pullNumber)}/merge`,
			body: request,
			authentication: 'required',
			expectedStatus: 200,
			options
		}, signal, parseMerge);
	}

	async updateBranch(repository: RepositoryRef, pullNumber: number, signal: AbortSignal, options?: UpdateBranchOptions): Promise<UpdateBranchResult> {
		const { expectedHeadSha, ...requestOptions } = options ?? {};
		return this._client.request({
			method: 'PUT',
			path: `${pullRequestPath(repository, pullNumber)}/update-branch`,
			body: { expected_head_sha: expectedHeadSha },
			authentication: 'required',
			expectedStatus: 202,
			options: requestOptions
		}, signal, parseBranchUpdate);
	}

	async markReadyForReview(pullRequestId: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<DraftState> {
		return this._client.graphql(
			markReadyMutation,
			{ input: { pullRequestId } },
			signal,
			data => parseDraftMutation(data).result.pullRequest,
			options
		);
	}

	async convertToDraft(pullRequestId: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<DraftState> {
		return this._client.graphql(
			convertToDraftMutation,
			{ input: { pullRequestId } },
			signal,
			data => parseDraftMutation(data).result.pullRequest,
			options
		);
	}

	async enableAutoMerge(pullRequestId: string, request: EnableAutoMergeRequest, signal: AbortSignal, options?: ApiRequestOptions): Promise<AutoMergeState> {
		return this._client.graphql(
			enableAutoMergeMutation,
			{ input: { ...request, pullRequestId } },
			signal,
			data => parseAutoMergeMutation(data).result.pullRequest,
			options
		);
	}

	async disableAutoMerge(pullRequestId: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<AutoMergeState> {
		return this._client.graphql(
			disableAutoMergeMutation,
			{ input: { pullRequestId } },
			signal,
			data => parseAutoMergeMutation(data).result.pullRequest,
			options
		);
	}

	async enqueue(pullRequestId: string, request: EnqueuePullRequestRequest, signal: AbortSignal, options?: ApiRequestOptions): Promise<NodeIdentity> {
		return this._client.graphql(
			enqueueMutation,
			{ input: { ...request, pullRequestId } },
			signal,
			data => parseQueueMutation(data).result.mergeQueueEntry,
			options
		);
	}

	async dequeue(pullRequestId: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<NodeIdentity> {
		return this._client.graphql(
			dequeueMutation,
			{ input: { id: pullRequestId } },
			signal,
			data => parseQueueMutation(data).result.mergeQueueEntry,
			options
		);
	}
}

/** Builds the REST resource path for a pull request. */
export function pullRequestPath(ref: RepositoryRef, pullNumber: number): string {
	return `${repositoryPath(ref)}/pulls/${numberSegment(pullNumber)}`;
}

const parseBranch = parse.object<PullRequestBranch>({
	label: parse.string,
	ref: parse.string,
	sha: parse.nonEmptyString,
	repo: parse.nullable(parseRepositoryIdentity),
});

const summarySchema: parse.ObjectSchema<PullRequestSummary> = {
	id: parse.positiveInteger,
	node_id: parse.nonEmptyString,
	number: parse.positiveInteger,
	html_url: parse.nonEmptyString,
	url: parse.nonEmptyString,
	title: parse.string,
	body: parse.nullable(parse.string),
	state: parse.oneOf('open', 'closed'),
	draft: parse.optional(parse.boolean),
	user: parse.nullable(parseAccount),
	head: parseBranch,
	base: parseBranch,
	labels: parse.arrayOf(parseLabel),
	milestone: parse.nullable(parseMilestone),
	assignees: parse.optional(parse.arrayOf(parseAccount)),
	requested_reviewers: parse.optional(parse.arrayOf(parseAccount)),
	requested_teams: parse.optional(parse.arrayOf(parseTeam)),
	created_at: parse.dateTime,
	updated_at: parse.dateTime,
	closed_at: parse.nullable(parse.dateTime),
	merged_at: parse.nullable(parse.dateTime),
	merge_commit_sha: parse.nullable(parse.string),
};

/** Parses pull request summary data. */
export const parsePullRequestSummary = parse.object<PullRequestSummary>(summarySchema);
const parsePullRequests = parse.arrayOf(parsePullRequestSummary);

const parsePullRequest = parse.object<PullRequest>({
	...summarySchema,
	merged: parse.boolean,
	mergeable: parse.nullable(parse.boolean),
	rebaseable: parse.optional(parse.nullable(parse.boolean)),
	mergeable_state: parse.string,
	maintainer_can_modify: parse.boolean,
	merged_by: parse.nullable(parseAccount),
	commits: parse.nonNegativeInteger,
	changed_files: parse.nonNegativeInteger,
	additions: parse.nonNegativeInteger,
	deletions: parse.nonNegativeInteger,
	comments: parse.nonNegativeInteger,
	review_comments: parse.nonNegativeInteger,
	auto_merge: parse.nullable(parse.object({
		enabled_by: parseAccount,
		merge_method: parse.oneOf('merge', 'squash', 'rebase'),
		commit_title: parse.string,
		commit_message: parse.string,
	})),
});

const parseFiles = parse.arrayOf(parseChangedFile);
const parseCommits = parse.arrayOf(parseCommit);

const parseMerge = parse.object<MergeResult>({
	sha: parse.nonEmptyString,
	merged: parse.boolean,
	message: parse.string
});

const parseBranchUpdate = parse.object<UpdateBranchResult>({
	message: parse.string,
	url: parse.nonEmptyString
});

/** Schema for pull request metadata from a GraphQL connection. */
export const pullRequestListItemSchema: parse.ObjectSchema<PullRequestListItem> = {
	id: parse.nonEmptyString,
	number: parse.positiveInteger,
	url: parse.nonEmptyString,
	title: parse.string,
	author: parse.nullable(parseActor),
	headRefName: parse.string,
	isCrossRepository: parse.boolean,
	isDraft: parse.boolean,
	updatedAt: parse.dateTime,
	additions: parse.nonNegativeInteger,
	deletions: parse.nonNegativeInteger,
};

const parsePullRequestListItem = parse.object(pullRequestListItemSchema);

const parsePullRequestsQuery = parse.object({
	repository: parse.nullable(parse.object({
		pullRequests: parseConnection(parsePullRequestListItem),
	})),
});

const parseDraftMutation = parse.object({
	result: parse.object({
		pullRequest: parse.object<DraftState>({
			id: parse.nonEmptyString,
			isDraft: parse.boolean
		})
	}),
});

const parseAutoMergeMutation = parse.object({
	result: parse.object({
		pullRequest: parse.object<AutoMergeState>({
			id: parse.nonEmptyString,
			merged: parse.boolean,
			autoMergeRequest: parse.nullable(parse.object({
				mergeMethod: parse.oneOf('MERGE', 'SQUASH', 'REBASE')
			})),
		}),
	}),
});

const parseQueueMutation = parse.object({
	result: parse.object({
		mergeQueueEntry: parseNodeIdentity
	})
});

/** GraphQL fields for pull request list and search results. */
export const pullRequestListItemFields = `id number url title
	author { __typename login avatarUrl url }
	headRefName isCrossRepository isDraft updatedAt additions deletions`;

const listPullRequestsQuery = `query ListPullRequests($owner: String!, $name: String!, $first: Int! = 100, $after: String) {
	repository(owner: $owner, name: $name) {
		pullRequests(first: $first, after: $after, states: OPEN, orderBy: { field: UPDATED_AT, direction: DESC }) {
			nodes { ${pullRequestListItemFields} }
			pageInfo { endCursor hasNextPage }
		}
	}
}`;

const markReadyMutation = `mutation MarkReadyForReview($input: MarkPullRequestReadyForReviewInput!) {
	result: markPullRequestReadyForReview(input: $input) { pullRequest { id isDraft } }
}`;

const convertToDraftMutation = `mutation ConvertToDraft($input: ConvertPullRequestToDraftInput!) {
	result: convertPullRequestToDraft(input: $input) { pullRequest { id isDraft } }
}`;

const enableAutoMergeMutation = `mutation EnableAutoMerge($input: EnablePullRequestAutoMergeInput!) {
	result: enablePullRequestAutoMerge(input: $input) { pullRequest { id merged autoMergeRequest { mergeMethod } } }
}`;

const disableAutoMergeMutation = `mutation DisableAutoMerge($input: DisablePullRequestAutoMergeInput!) {
	result: disablePullRequestAutoMerge(input: $input) { pullRequest { id merged autoMergeRequest { mergeMethod } } }
}`;

const enqueueMutation = `mutation EnqueuePullRequest($input: EnqueuePullRequestInput!) {
	result: enqueuePullRequest(input: $input) { mergeQueueEntry { id } }
}`;

const dequeueMutation = `mutation DequeuePullRequest($input: DequeuePullRequestInput!) {
	result: dequeuePullRequest(input: $input) { mergeQueueEntry { id } }
}`;
