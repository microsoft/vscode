/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mergeArrayPages } from '../client/pagination.js';
import { BugIndicatingError } from '../../../../base/common/errors.js';
import { ApiPaginationOptions, ApiRequestOptions } from '../client/request.js';
import { numberSegment, pathSegment, repositoryPath, withQuery } from '../client/routing.js';
import { parse } from '../client/schema.js';
import { PageOptions, RepositoryRef } from '../client/types.js';
import { Account, Label, Milestone, Reaction, ReactionContent } from './core.js';
import { CoreClient, parseAccount, parseLabel, parseMilestone, parseReaction } from './coreClient.js';
import { CreateIssueRequest, CreateLabelRequest, CreateMilestoneRequest, IIssuesClient, Issue, IssueComment, IssueLabel, ListIssuesOptions, ListMilestonesOptions, ReactionTarget, TimelineEvent, UpdateIssueRequest } from './issues.js';

const maximumIssueBatchSize = 50;

export class IssuesClient implements IIssuesClient {
	constructor(private readonly _client: CoreClient) { }

	async get(repository: RepositoryRef, issueNumber: number, signal: AbortSignal, options?: ApiRequestOptions): Promise<Issue> {
		return this._client.request({
			domain: 'issues',
			method: 'GET',
			path: issuePath(repository, issueNumber),
			authentication: 'optional',
			expectedStatus: 200,
			options
		}, signal, parseIssue);
	}

	async list(repository: RepositoryRef, signal: AbortSignal, options?: ListIssuesOptions): Promise<readonly Issue[]> {
		const { query, ...requestOptions } = options ?? {};
		return this._client.requestPages({
			domain: 'issues',
			method: 'GET',
			path: withQuery(`${repositoryPath(repository)}/issues`, { ...query }),
			authentication: 'optional',
			expectedStatus: 200,
			options: requestOptions
		}, signal, parseIssues, mergeArrayPages);
	}

	async getClosingPullRequestCounts(repository: RepositoryRef, issueNumbers: readonly number[], signal: AbortSignal, options?: ApiRequestOptions): Promise<Readonly<Record<number, number | null>> | null> {
		signal.throwIfAborted();
		const numbers = [...new Set(parse.arrayOf(parse.range(1, 2_147_483_647))(issueNumbers))];
		const counts: Record<number, number | null> = {};
		for (let offset = 0; offset < numbers.length; offset += maximumIssueBatchSize) {
			const batch = numbers.slice(offset, offset + maximumIssueBatchSize);
			const selections = batch.map(number => `issue${number}: issue(number: ${number}) {
				closedByPullRequestsReferences(first: 1, includeClosedPrs: true) { totalCount }
			}`).join('\n');

			const issues = await this._client.graphql(
				'issues',
				`query IssueClosingPullRequestCounts($owner: String!, $repo: String!) {
					repository(owner: $owner, name: $repo) { ${selections} }
				}`,
				repository,
				signal,
				data => parseClosingPullRequestCountsQuery(data).repository,
				options
			);

			if (issues === null) {
				return null;
			}
			for (const number of batch) {
				const issue = parseIssueClosingPullRequests(issues[`issue${number}`]);
				counts[number] = issue?.closedByPullRequestsReferences?.totalCount ?? null;
			}
		}
		return counts;
	}

	async create(repository: RepositoryRef, request: CreateIssueRequest, signal: AbortSignal, options?: ApiRequestOptions): Promise<Issue> {
		return this._client.request({
			domain: 'issues',
			method: 'POST',
			path: `${repositoryPath(repository)}/issues`,
			body: request,
			authentication: 'required',
			expectedStatus: 201,
			options
		}, signal, parseIssue);
	}

	async update(repository: RepositoryRef, issueNumber: number, request: UpdateIssueRequest, signal: AbortSignal, options?: ApiRequestOptions): Promise<Issue> {
		return this._client.request({
			domain: 'issues',
			method: 'PATCH',
			path: issuePath(repository, issueNumber),
			body: request,
			authentication: 'required',
			expectedStatus: 200,
			options
		}, signal, parseIssue);
	}

	async listComments(repository: RepositoryRef, issueNumber: number, signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<readonly IssueComment[]> {
		const { query, ...requestOptions } = options ?? {};
		return this._client.requestPages({
			domain: 'issues',
			method: 'GET',
			path: withQuery(`${issuePath(repository, issueNumber)}/comments`, { ...query }),
			authentication: 'optional',
			expectedStatus: 200,
			options: requestOptions
		}, signal, parseComments, mergeArrayPages);
	}

	async getComment(repository: RepositoryRef, commentId: number, signal: AbortSignal, options?: ApiRequestOptions): Promise<IssueComment> {
		return this._client.request({
			domain: 'issues',
			method: 'GET',
			path: commentPath(repository, commentId),
			authentication: 'optional',
			expectedStatus: 200,
			options
		}, signal, parseComment);
	}

	async createComment(repository: RepositoryRef, issueNumber: number, body: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<IssueComment> {
		return this._client.request({
			domain: 'issues',
			method: 'POST',
			path: `${issuePath(repository, issueNumber)}/comments`,
			body: { body },
			authentication: 'required',
			expectedStatus: 201,
			options
		}, signal, parseComment);
	}

	async updateComment(repository: RepositoryRef, commentId: number, body: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<IssueComment> {
		return this._client.request({
			domain: 'issues',
			method: 'PATCH',
			path: commentPath(repository, commentId),
			body: { body },
			authentication: 'required',
			expectedStatus: 200,
			options
		}, signal, parseComment);
	}

	async deleteComment(repository: RepositoryRef, commentId: number, signal: AbortSignal, options?: ApiRequestOptions): Promise<void> {
		return this._client.request({
			domain: 'issues',
			method: 'DELETE',
			path: commentPath(repository, commentId),
			authentication: 'required',
			expectedStatus: 204,
			responseBody: 'none',
			options
		}, signal);
	}

	async listTimeline(repository: RepositoryRef, issueNumber: number, signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<readonly TimelineEvent[]> {
		const { query, ...requestOptions } = options ?? {};
		return this._client.requestPages({
			domain: 'issues',
			method: 'GET',
			path: withQuery(`${issuePath(repository, issueNumber)}/timeline`, { ...query }),
			authentication: 'optional',
			expectedStatus: 200,
			options: requestOptions
		}, signal, parseTimeline, mergeArrayPages);
	}

	async listLabels(repository: RepositoryRef, signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<readonly Label[]> {
		const { query, ...requestOptions } = options ?? {};
		return this._client.requestPages({
			domain: 'issues',
			method: 'GET',
			path: withQuery(`${repositoryPath(repository)}/labels`, { ...query }),
			authentication: 'optional',
			expectedStatus: 200,
			options: requestOptions
		}, signal, parseLabels, mergeArrayPages);
	}

	async createLabel(repository: RepositoryRef, request: CreateLabelRequest, signal: AbortSignal, options?: ApiRequestOptions): Promise<Label> {
		return this._client.request({
			domain: 'issues',
			method: 'POST',
			path: `${repositoryPath(repository)}/labels`,
			body: request,
			authentication: 'required',
			expectedStatus: 201,
			options
		}, signal, parseLabel);
	}

	async setLabels(repository: RepositoryRef, issueNumber: number, labels: readonly string[], signal: AbortSignal, options?: ApiRequestOptions): Promise<readonly Label[]> {
		return this._client.request({
			domain: 'issues',
			method: 'PUT',
			path: `${issuePath(repository, issueNumber)}/labels`,
			body: { labels },
			authentication: 'required',
			expectedStatus: 200,
			options
		}, signal, parseLabels);
	}

	async removeLabel(repository: RepositoryRef, issueNumber: number, name: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<readonly Label[]> {
		return this._client.request({
			domain: 'issues',
			method: 'DELETE',
			path: `${issuePath(repository, issueNumber)}/labels/${pathSegment(name)}`,
			authentication: 'required',
			expectedStatus: 200,
			options
		}, signal, parseLabels);
	}

	async listMilestones(repository: RepositoryRef, signal: AbortSignal, options?: ListMilestonesOptions): Promise<readonly Milestone[]> {
		const { query, ...requestOptions } = options ?? {};
		return this._client.requestPages({
			domain: 'issues',
			method: 'GET',
			path: withQuery(`${repositoryPath(repository)}/milestones`, { ...query }),
			authentication: 'optional',
			expectedStatus: 200,
			options: requestOptions
		}, signal, parseMilestones, mergeArrayPages);
	}

	async createMilestone(repository: RepositoryRef, request: CreateMilestoneRequest, signal: AbortSignal, options?: ApiRequestOptions): Promise<Milestone> {
		return this._client.request({
			domain: 'issues',
			method: 'POST',
			path: `${repositoryPath(repository)}/milestones`,
			body: request,
			authentication: 'required',
			expectedStatus: 201,
			options
		}, signal, parseMilestone);
	}

	async listAssignees(repository: RepositoryRef, signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<readonly Account[]> {
		const { query, ...requestOptions } = options ?? {};
		return this._client.requestPages({
			domain: 'issues',
			method: 'GET',
			path: withQuery(`${repositoryPath(repository)}/assignees`, { ...query }),
			authentication: 'optional',
			expectedStatus: 200,
			options: requestOptions
		}, signal, parseAssignees, mergeArrayPages);
	}

	async addAssignees(repository: RepositoryRef, issueNumber: number, assignees: readonly string[], signal: AbortSignal, options?: ApiRequestOptions): Promise<Issue> {
		return this._client.request({
			domain: 'issues',
			method: 'POST',
			path: `${issuePath(repository, issueNumber)}/assignees`,
			body: { assignees },
			authentication: 'required',
			expectedStatus: 201,
			options
		}, signal, parseIssue);
	}

	async removeAssignees(repository: RepositoryRef, issueNumber: number, assignees: readonly string[], signal: AbortSignal, options?: ApiRequestOptions): Promise<Issue> {
		return this._client.request({
			domain: 'issues',
			method: 'DELETE',
			path: `${issuePath(repository, issueNumber)}/assignees`,
			body: { assignees },
			authentication: 'required',
			expectedStatus: 200,
			options
		}, signal, parseIssue);
	}

	async listReactions(repository: RepositoryRef, target: ReactionTarget, signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<readonly Reaction[]> {
		const { query, ...requestOptions } = options ?? {};
		return this._client.requestPages({
			domain: 'issues',
			method: 'GET',
			path: withQuery(reactionPath(repository, target), { ...query }),
			authentication: 'optional',
			expectedStatus: 200,
			options: requestOptions
		}, signal, parseReactions, mergeArrayPages);
	}

	async createReaction(repository: RepositoryRef, target: ReactionTarget, content: ReactionContent, signal: AbortSignal, options?: ApiRequestOptions): Promise<Reaction> {
		return this._client.request({
			domain: 'issues',
			method: 'POST',
			path: reactionPath(repository, target),
			body: { content },
			authentication: 'required',
			expectedStatus: [200, 201],
			options
		}, signal, parseReaction);
	}

	async deleteReaction(repository: RepositoryRef, target: ReactionTarget, reactionId: number, signal: AbortSignal, options?: ApiRequestOptions): Promise<void> {
		return this._client.request({
			domain: 'issues',
			method: 'DELETE',
			path: `${reactionPath(repository, target)}/${numberSegment(reactionId)}`,
			authentication: 'required',
			expectedStatus: 204,
			responseBody: 'none',
			options
		}, signal);
	}
}

function issuePath(repository: RepositoryRef, issueNumber: number): string {
	return `${repositoryPath(repository)}/issues/${numberSegment(issueNumber)}`;
}

function commentPath(repository: RepositoryRef, commentId: number): string {
	return `${repositoryPath(repository)}/issues/comments/${numberSegment(commentId)}`;
}

function reactionPath(repository: RepositoryRef, target: ReactionTarget): string {
	switch (target.kind) {
		case 'issue': return `${issuePath(repository, target.number)}/reactions`;
		case 'issueComment': return `${commentPath(repository, target.commentId)}/reactions`;
		case 'reviewComment': return `${repositoryPath(repository)}/pulls/comments/${numberSegment(target.commentId)}/reactions`;
		default: throw new BugIndicatingError('Unsupported GitHub reaction target.');
	}
}

const parseClosingPullRequestCountsQuery = parse.object({
	repository: parse.nullable(parse.jsonObject),
});

const parseIssueClosingPullRequests = parse.nullable(parse.object({
	closedByPullRequestsReferences: parse.nullable(parse.object({
		totalCount: parse.nonNegativeInteger,
	})),
}));

const parseIssueLabel = parse.object<IssueLabel>({
	id: parse.optional(parse.positiveInteger),
	node_id: parse.optional(parse.nonEmptyString),
	name: parse.optional(parse.string),
	color: parse.optional(parse.nullable(parse.string)),
	description: parse.optional(parse.nullable(parse.string)),
});

const parseIssue = parse.object<Issue>({
	id: parse.positiveInteger,
	node_id: parse.nonEmptyString,
	number: parse.positiveInteger,
	html_url: parse.nonEmptyString,
	repository_url: parse.nonEmptyString,
	title: parse.string,
	body: parse.optional(parse.nullable(parse.string)),
	state: parse.oneOf('open', 'closed'),
	state_reason: parse.optional(parse.nullable(parse.oneOf('completed', 'reopened', 'not_planned', 'duplicate'))),
	locked: parse.boolean,
	user: parse.nullable(parseAccount),
	assignees: parse.optional(parse.arrayOf(parseAccount)),
	labels: parse.arrayOf<string | IssueLabel>(value => typeof value === 'string' ? value : parseIssueLabel(value)),
	milestone: parse.nullable(parseMilestone),
	comments: parse.nonNegativeInteger,
	created_at: parse.dateTime,
	updated_at: parse.dateTime,
	closed_at: parse.nullable(parse.dateTime),
	pull_request: parse.optional(parse.object({
		url: parse.nullable(parse.string),
		html_url: parse.nullable(parse.string),
	})),
});

const parseIssues = parse.arrayOf(parseIssue);

const parseComment = parse.object<IssueComment>({
	id: parse.positiveInteger,
	node_id: parse.nonEmptyString,
	html_url: parse.nonEmptyString,
	issue_url: parse.nonEmptyString,
	user: parse.nullable(parseAccount),
	body: parse.optional(parse.string),
	created_at: parse.dateTime,
	updated_at: parse.dateTime,
});

const parseComments = parse.arrayOf(parseComment);
const parseTimeline = parse.arrayOf(parse.amend(parse.jsonObject, value => ({ event: parse.nonEmptyString(value.event) })));
const parseLabels = parse.arrayOf(parseLabel);
const parseMilestones = parse.arrayOf(parseMilestone);
const parseAssignees = parse.arrayOf(parseAccount);
const parseReactions = parse.arrayOf(parseReaction);
