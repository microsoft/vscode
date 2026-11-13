/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** A temporary URL for downloading a resource. */
export interface DownloadRedirect {
	readonly url: string;
}

/** Forward pagination for a GraphQL connection. */
export interface CursorOptions {
	/** Opaque cursor from the previous page. */
	readonly after?: string;
	/** Requested number of nodes, from 1 through 100. */
	readonly first?: number;
}

/** Pagination metadata for a GraphQL connection. */
export interface PageInfo {
	/** Cursor for the last returned edge, or null for an empty connection. */
	readonly endCursor: string | null;
	/** Whether another page is available. */
	readonly hasNextPage: boolean;
}

/** GraphQL nodes with pagination metadata from the last requested or collected page. */
export interface Connection<T> {
	/** Requested nodes, including nulls permitted by the GraphQL schema. */
	readonly nodes: readonly (T | null)[] | null;
	/** Pagination for this connection, not any nested connection. */
	readonly pageInfo: PageInfo;
}

/** An opaque GraphQL node identity, distinct from REST numeric IDs and issue numbers. */
export interface NodeIdentity {
	/** GraphQL node ID. */
	readonly id: string;
}

/** Public metadata for a GitHub account. */
export interface Account {
	/** Numeric database ID. */
	readonly id: number;
	/** GraphQL node ID. */
	readonly node_id: string;
	/** Account login. */
	readonly login: string;
	/** Avatar image URL. */
	readonly avatar_url: string;
	/** Browser profile URL. */
	readonly html_url: string;
	/** Server-defined account kind, such as User, Bot, or Organization. */
	readonly type: string;
}

/** An account or integration that performs an action on GitHub. */
export interface Actor {
	/** Concrete GraphQL actor type. */
	readonly __typename: string;
	/** Actor login. */
	readonly login: string;
	/** Avatar image URL. */
	readonly avatarUrl: string;
	/** Browser profile URL. */
	readonly url: string;
}

/** Repository identity available in embedded and minimal REST representations. */
export interface RepositoryIdentity {
	/** Numeric repository ID, stable across renames. */
	readonly id: number;
	/** GraphQL node ID. */
	readonly node_id: string;
	/** Repository name. */
	readonly name: string;
	/** Owner and repository name separated by a slash. */
	readonly full_name: string;
	/** Owning account. */
	readonly owner: Account;
	/** Whether the repository is private. */
	readonly private: boolean;
	/** Browser URL. */
	readonly html_url: string;
	/** REST resource URL. */
	readonly url: string;
	/** Repository description, or null when unset. */
	readonly description: string | null;
	/** Whether this repository is a fork. */
	readonly fork: boolean;
}

/** A label for repository issues and pull requests. */
export interface Label {
	/** Numeric label ID. */
	readonly id: number;
	/** GraphQL node ID. */
	readonly node_id: string;
	/** Label name. */
	readonly name: string;
	/** Hexadecimal color without a leading hash. */
	readonly color: string;
	/** Whether GitHub supplied this as a default label. */
	readonly default: boolean;
	/** Description, or null when unset. */
	readonly description: string | null;
}

/** A repository milestone for issues and pull requests. */
export interface Milestone {
	/** Numeric database ID. */
	readonly id: number;
	/** GraphQL node ID. */
	readonly node_id: string;
	/** Repository-local milestone number used in REST routes. */
	readonly number: number;
	/** Milestone title. */
	readonly title: string;
	/** Description, or null when unset. */
	readonly description: string | null;
	/** Whether the milestone is open or closed. */
	readonly state: 'open' | 'closed';
	/** Due date in RFC 3339 format, or null. */
	readonly due_on: string | null;
}

/** A team's identity and descriptive metadata. */
export interface Team {
	/** Numeric team ID. */
	readonly id: number;
	/** GraphQL node ID. */
	readonly node_id: string;
	/** Display name. */
	readonly name: string;
	/** Organization-local slug used in REST routes. */
	readonly slug: string;
	/** Browser URL. */
	readonly html_url: string;
	/** Description, or null when unset. */
	readonly description: string | null;
}

/** A changed file in a pull request, commit, or comparison. */
export interface ChangedFile {
	/** Blob SHA, or null when the API cannot supply it. */
	readonly sha: string | null;
	/** Repository-relative path. */
	readonly filename: string;
	/** Previous path for a renamed file. */
	readonly previous_filename?: string;
	/** Change classification supplied by GitHub. */
	readonly status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged';
	/** Added line count. */
	readonly additions: number;
	/** Removed line count. */
	readonly deletions: number;
	/** Total changed line count. */
	readonly changes: number;
	/** Unified patch, omitted for binary or oversized diffs. */
	readonly patch?: string;
	/** Browser URL for the file. */
	readonly blob_url: string;
}

/** Reaction names accepted by the REST API. */
export type ReactionContent = '+1' | '-1' | 'laugh' | 'confused' | 'heart' | 'hooray' | 'rocket' | 'eyes';

/** A reaction on an issue or comment. */
export interface Reaction {
	/** Numeric reaction ID used for deletion. */
	readonly id: number;
	/** GraphQL node ID. */
	readonly node_id: string;
	/** Reacting account, or null if unavailable. */
	readonly user: Account | null;
	/** Reaction kind. */
	readonly content: ReactionContent;
	/** Creation time in RFC 3339 format. */
	readonly created_at: string;
}

/** Lifecycle phase of a check run, check suite, or Actions job. */
export type CheckStatus = 'queued' | 'in_progress' | 'completed' | 'waiting' | 'requested' | 'pending';

/** A completed check-run or Actions-job outcome. */
export type CheckConclusion = 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | 'stale';
