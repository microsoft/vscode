/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ApiPaginationOptions } from '../client/request.js';
import { PageOptions } from '../client/types.js';
import { Account, Connection, CursorOptions, RepositoryIdentity } from './core.js';
import { PullRequestListItem } from './pullRequests.js';

/** A page of search results with the total match count and a completeness indicator. */
export interface SearchPage<T> {
	/** Total reported matches; GitHub limits retrievable search results separately. */
	readonly total_count: number;
	/** Whether the server could not finish evaluating the search. */
	readonly incomplete_results: boolean;
	/** Matches on the requested or collected pages; the search API exposes at most 1,000 matches. */
	readonly items: readonly T[];
}

/** Repository metadata returned with a search match. */
export interface RepositorySearchItem extends RepositoryIdentity {
	/** Default branch name. */
	readonly default_branch: string;
	/** Primary language, or null. */
	readonly language: string | null;
	/** Star count. */
	readonly stargazers_count: number;
	/** Server-provided ranking score, which may be fractional. */
	readonly score: number;
}

/** An issue or PR search match; presence of pull_request distinguishes a PR. */
export interface IssueSearchItem {
	/** Numeric database ID. */
	readonly id: number;
	/** GraphQL node ID. */
	readonly node_id: string;
	/** Repository-local issue or PR number. */
	readonly number: number;
	/** Issue or PR title. */
	readonly title: string;
	/** Markdown body, when included. */
	readonly body?: string | null;
	/** Browser URL. */
	readonly html_url: string;
	/** Owning repository's REST URL. */
	readonly repository_url: string;
	/** Open or closed state, independent of a PR's merged state. */
	readonly state: string;
	/** Most recent update time in RFC 3339 format. */
	readonly updated_at: string;
	/** Author, or null when unavailable. */
	readonly user: Account | null;
	/** Server-provided ranking score. */
	readonly score: number;
	/** PR-specific link metadata; omitted for issues. */
	readonly pull_request?: {
		/** Pull request REST URL. */
		readonly url: string | null;
		/** Pull request browser URL. */
		readonly html_url: string | null;
		/** Merge timestamp, when reported. */
		readonly merged_at?: string | null;
	};
}

/** A pull request search match with mergeability and latest-commit status. */
export interface PullRequestSearchItem extends PullRequestListItem {
	/** Mergeability reported by GitHub; UNKNOWN means it has not been determined. */
	readonly mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';
	/** The last commit in the pull request, preserving nullable connection nodes. */
	readonly commits: {
		readonly nodes: readonly ({
			readonly commit: {
				/** Commit time in RFC 3339 format. */
				readonly committedDate: string;
				/** Combined checks and commit statuses, or null when unavailable. */
				readonly statusCheckRollup: {
					readonly state: 'ERROR' | 'EXPECTED' | 'FAILURE' | 'PENDING' | 'SUCCESS';
				} | null;
			};
		} | null)[] | null;
	};
}

/** Repository search filters and ordering options. */
export type SearchRepositoriesOptions = ApiPaginationOptions<PageOptions & {
	/** Ordering field; omission uses the server's relevance ranking. */
	readonly sort?: 'stars' | 'forks' | 'help-wanted-issues' | 'updated';
	/** Ordering direction. */
	readonly order?: 'asc' | 'desc';
}>;

/** Issue and PR search ordering. */
export type SearchIssuesOptions = ApiPaginationOptions<PageOptions & {
	/** Ordering field; query qualifiers remain in the query string. */
	readonly sort?: 'comments' | 'reactions' | 'reactions-+1' | 'reactions--1' | 'reactions-smile' | 'reactions-thinking_face' | 'reactions-heart' | 'reactions-tada' | 'interactions' | 'created' | 'updated';
	/** Ordering direction. */
	readonly order?: 'asc' | 'desc';
}>;

/** Operations for searching GitHub repositories, issues, and pull requests. */
export interface ISearchClient {

	/** GET /search/repositories: return one page of repository matches. */
	repositories(query: string, signal: AbortSignal, options?: SearchRepositoriesOptions): Promise<SearchPage<RepositorySearchItem>>;

	/** GET /search/issues: search issues only and return one page of matches. */
	issues(query: string, signal: AbortSignal, options?: SearchIssuesOptions): Promise<SearchPage<IssueSearchItem>>;

	/** GET /search/issues: search issues and PRs, using is:issue or is:pr to restrict the query. */
	issuesAndPullRequests(query: string, signal: AbortSignal, options?: SearchIssuesOptions): Promise<SearchPage<IssueSearchItem>>;

	/** GraphQL PR search with cursor pagination, defaulting to 100 per page; GitHub exposes at most 1,000 results. */
	pullRequests(query: string, signal: AbortSignal, options?: ApiPaginationOptions<CursorOptions>): Promise<Connection<PullRequestSearchItem>>;
}
