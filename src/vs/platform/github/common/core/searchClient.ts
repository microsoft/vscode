/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ApiPaginationOptions } from '../client/request.js';
import { withQuery } from '../client/routing.js';
import { parse } from '../client/schema.js';
import { Connection, CursorOptions } from './core.js';
import { CoreClient, cursorVariables, parseAccount, parseConnection, repositoryIdentitySchema } from './coreClient.js';
import { pullRequestListItemFields, pullRequestListItemSchema } from './pullRequestsClient.js';
import { ISearchClient, IssueSearchItem, PullRequestSearchItem, RepositorySearchItem, SearchIssuesOptions, SearchPage, SearchRepositoriesOptions } from './search.js';

export class SearchClient implements ISearchClient {
	constructor(private readonly _client: CoreClient) { }

	async repositories(query: string, signal: AbortSignal, options?: SearchRepositoriesOptions): Promise<SearchPage<RepositorySearchItem>> {
		const { query: queryOptions, ...requestOptions } = options ?? {};
		return this._client.requestPages(
			{
				method: 'GET',
				path: withQuery('/search/repositories', { ...queryOptions, q: query }),
				authentication: 'optional',
				expectedStatus: 200,
				options: requestOptions,
			},
			signal,
			parseRepositorySearch,
			pages => ({
				...pages[pages.length - 1],
				items: pages.flatMap(page => page.items),
				incomplete_results: pages.some(page => page.incomplete_results)
			})
		);
	}

	async issues(query: string, signal: AbortSignal, options?: SearchIssuesOptions): Promise<SearchPage<IssueSearchItem>> {
		return this.issuesAndPullRequests(`is:issue ${query}`, signal, options);
	}

	async issuesAndPullRequests(query: string, signal: AbortSignal, options?: SearchIssuesOptions): Promise<SearchPage<IssueSearchItem>> {
		const { query: queryOptions, ...requestOptions } = options ?? {};
		return this._client.requestPages(
			{
				method: 'GET',
				path: withQuery('/search/issues', { ...queryOptions, q: query }),
				authentication: 'optional',
				expectedStatus: 200,
				options: requestOptions,
			},
			signal,
			parseIssueSearch,
			pages => ({
				...pages[pages.length - 1],
				items: pages.flatMap(page => page.items),
				incomplete_results: pages.some(page => page.incomplete_results)
			})
		);
	}

	async pullRequests(query: string, signal: AbortSignal, options?: ApiPaginationOptions<CursorOptions>): Promise<Connection<PullRequestSearchItem>> {
		const { query: queryOptions = {}, ...requestOptions } = options ?? {};
		return this._client.graphqlPages(
			searchPullRequestsQuery,
			{ ...cursorVariables(queryOptions), query: `is:pr ${query}` },
			signal,
			data => parsePullRequestSearch(data).search,
			requestOptions
		);
	}
}

const parseRepositorySearch = parse.object<SearchPage<RepositorySearchItem>>({
	total_count: parse.nonNegativeInteger,
	incomplete_results: parse.boolean,
	items: parse.arrayOf(parse.object<RepositorySearchItem>({
		...repositoryIdentitySchema,
		default_branch: parse.string,
		language: parse.nullable(parse.string),
		stargazers_count: parse.nonNegativeInteger,
		score: parse.finiteNumber,
	})),
});

const parseIssueSearch = parse.object<SearchPage<IssueSearchItem>>({
	total_count: parse.nonNegativeInteger,
	incomplete_results: parse.boolean,
	items: parse.arrayOf(parse.object<IssueSearchItem>({
		id: parse.positiveInteger,
		node_id: parse.nonEmptyString,
		number: parse.positiveInteger,
		title: parse.string,
		body: parse.optional(parse.nullable(parse.string)),
		html_url: parse.nonEmptyString,
		repository_url: parse.nonEmptyString,
		state: parse.string,
		updated_at: parse.dateTime,
		user: parse.nullable(parseAccount),
		score: parse.finiteNumber,
		pull_request: parse.optional(parse.object({
			url: parse.nullable(parse.string),
			html_url: parse.nullable(parse.string),
			merged_at: parse.optional(parse.nullable(parse.dateTime)),
		})),
	})),
});

const parsePullRequestSearch = parse.object({
	search: parseConnection(parse.object<PullRequestSearchItem>({
		...pullRequestListItemSchema,
		mergeable: parse.oneOf('MERGEABLE', 'CONFLICTING', 'UNKNOWN'),
		commits: parse.object({
			nodes: parse.nullable(parse.arrayOf(parse.nullable(parse.object({
				commit: parse.object({
					committedDate: parse.dateTime,
					statusCheckRollup: parse.nullable(parse.object({
						state: parse.oneOf('ERROR', 'EXPECTED', 'FAILURE', 'PENDING', 'SUCCESS'),
					})),
				}),
			})))),
		}),
	})),
});

const searchPullRequestsQuery = `query SearchPullRequests($query: String!, $first: Int! = 100, $after: String) {
	search(query: $query, type: ISSUE, first: $first, after: $after) {
		nodes { ... on PullRequest {
			${pullRequestListItemFields}
			mergeable
			commits(last: 1) {
				nodes { commit { committedDate statusCheckRollup { state } } }
			}
		} }
		pageInfo { endCursor hasNextPage }
	}
}`;
