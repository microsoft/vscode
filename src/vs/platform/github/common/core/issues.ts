/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ApiPaginationOptions, ApiRequestOptions } from '../client/request.js';
import { JsonObject, PageOptions, RepositoryRef } from '../client/types.js';
import { Account, Label, Milestone, Reaction, ReactionContent } from './core.js';

/** Label metadata included in an issue response. */
export interface IssueLabel {
	/** Numeric label ID, when supplied. */
	readonly id?: number;
	/** GraphQL node ID, when supplied. */
	readonly node_id?: string;
	/** Label name, when supplied. */
	readonly name?: string;
	/** Hexadecimal color without a leading hash, or null. */
	readonly color?: string | null;
	/** Description, or null when unset. */
	readonly description?: string | null;
}

/** Issue representation; the issues API also returns PR conversation metadata. */
export interface Issue {
	/** Numeric database ID. */
	readonly id: number;
	/** GraphQL node ID. */
	readonly node_id: string;
	/** Repository-local issue or PR number. */
	readonly number: number;
	/** Browser URL. */
	readonly html_url: string;
	/** Owning repository's REST URL. */
	readonly repository_url: string;
	/** Issue title. */
	readonly title: string;
	/** Markdown body, omitted by some representations and nullable when unset. */
	readonly body?: string | null;
	/** Open or closed state; does not indicate whether a PR was merged. */
	readonly state: 'open' | 'closed';
	/** Reason for the current state, when reported. */
	readonly state_reason?: 'completed' | 'reopened' | 'not_planned' | 'duplicate' | null;
	/** Whether the conversation is locked. */
	readonly locked: boolean;
	/** Author, or null when unavailable. */
	readonly user: Account | null;
	/** Assigned accounts, when reported. */
	readonly assignees?: readonly Account[];
	/** Labels represented by names or metadata objects. */
	readonly labels: readonly (string | IssueLabel)[];
	/** Assigned milestone, or null. */
	readonly milestone: Milestone | null;
	/** Top-level conversation comment count, not inline review comment count. */
	readonly comments: number;
	/** Creation timestamp. */
	readonly created_at: string;
	/** Last update timestamp. */
	readonly updated_at: string;
	/** Closure timestamp, or null. */
	readonly closed_at: string | null;
	/** Present only when this issue represents a pull request. */
	readonly pull_request?: {
		/** Pull request REST URL, or null when unavailable. */
		readonly url: string | null;
		/** Pull request browser URL, or null when unavailable. */
		readonly html_url: string | null;
	};
}

/** A top-level comment on an issue or PR, never an inline review comment. */
export interface IssueComment {
	/** Numeric comment ID used in REST routes. */
	readonly id: number;
	/** GraphQL node ID. */
	readonly node_id: string;
	/** Browser URL. */
	readonly html_url: string;
	/** Owning issue's REST URL. */
	readonly issue_url: string;
	/** Comment author, or null. */
	readonly user: Account | null;
	/** Markdown body, when included in the selected media representation. */
	readonly body?: string;
	/** Creation timestamp. */
	readonly created_at: string;
	/** Last update timestamp. */
	readonly updated_at: string;
}

/** An issue timeline event with event-specific fields. */
export type TimelineEvent = JsonObject & {
	/** Event kind, used to interpret the remaining payload. */
	readonly event: string;
};

/** Repository issue-list filters; results can include PRs. */
export type ListIssuesOptions = ApiPaginationOptions<PageOptions & {
	/** Issue state filter. */
	readonly state?: 'open' | 'closed' | 'all';
	/** Assignee login, * for any assignee, or none for unassigned. */
	readonly assignee?: string;
	/** Creator login. */
	readonly creator?: string;
	/** Comma-separated label names. */
	readonly labels?: string;
	/** Milestone number, * for any milestone, or none for no milestone. */
	readonly milestone?: number | '*' | 'none';
	/** Ordering field. */
	readonly sort?: 'created' | 'updated' | 'comments';
	/** Ordering direction. */
	readonly direction?: 'asc' | 'desc';
	/** RFC 3339 lower bound on update time. */
	readonly since?: string;
}>;

/** Payload for creating a repository issue. */
export interface CreateIssueRequest {
	/** Issue title. */
	readonly title: string;
	/** Markdown body. */
	readonly body?: string;
	/** Assignee logins; assignment depends on the caller's permissions. */
	readonly assignees?: readonly string[];
	/** Label names; labels depend on the caller's permissions. */
	readonly labels?: readonly string[];
	/** Repository-local milestone number. */
	readonly milestone?: number | null;
}

/** Partial issue update, with omission distinct from explicitly clearing a field. */
export interface UpdateIssueRequest {
	/** Replacement title. */
	readonly title?: string;
	/** Replacement Markdown body, or null to clear it. */
	readonly body?: string | null;
	/** Requested issue state. */
	readonly state?: 'open' | 'closed';
	/** Reason for the requested state. */
	readonly state_reason?: 'completed' | 'not_planned' | 'reopened' | 'duplicate' | null;
	/** Replacement assignee logins; an empty array clears assignments. */
	readonly assignees?: readonly string[];
	/** Replacement label names; an empty array clears labels. */
	readonly labels?: readonly string[];
	/** Milestone number, or null to clear it. */
	readonly milestone?: number | null;
}

/** Fields for creating a repository label. */
export interface CreateLabelRequest {
	/** Label name. */
	readonly name: string;
	/** Six-digit hexadecimal color without a leading hash; omission uses GitHub's default. */
	readonly color?: string;
	/** Optional label description. */
	readonly description?: string;
}

/** Fields for creating a milestone. */
export interface CreateMilestoneRequest {
	/** Milestone title. */
	readonly title: string;
	/** Initial state. */
	readonly state?: 'open' | 'closed';
	/** Milestone description. */
	readonly description?: string;
	/** Due date in RFC 3339 format. */
	readonly due_on?: string;
}

/** Milestone listing options. */
export type ListMilestonesOptions = ApiPaginationOptions<PageOptions & {
	/** Milestone state filter. */
	readonly state?: 'open' | 'closed' | 'all';
}>;

/** A reaction target, keeping issue numbers separate from database comment IDs. */
export type ReactionTarget =
	| {
		/** Reaction on an issue or PR description. */
		readonly kind: 'issue';
		/** Repository-local issue or PR number. */
		readonly number: number;
	}
	| {
		/** Reaction on a top-level conversation comment. */
		readonly kind: 'issueComment';
		/** Numeric issue-comment ID. */
		readonly commentId: number;
	}
	| {
		/** Reaction on an inline review comment. */
		readonly kind: 'reviewComment';
		/** Numeric review-comment ID. */
		readonly commentId: number;
	};

/** Issues, PR conversation comments, labels, milestones, assignees, and reactions. */
export interface IIssuesClient {

	/** GET /repos/{owner}/{repo}/issues/{number}: read issue or PR conversation metadata. */
	get(respository: RepositoryRef, issueNumber: number, signal: AbortSignal, options?: ApiRequestOptions): Promise<Issue>;

	/** GET /repos/{owner}/{repo}/issues: return one page, including PRs. */
	list(respository: RepositoryRef, signal: AbortSignal, options?: ListIssuesOptions): Promise<readonly Issue[]>;

	/** GraphQL: count closing PRs, including closed PRs, in batches. Unavailable issues or references map to null; an unavailable repository returns null. */
	getClosingPullRequestCounts(repository: RepositoryRef, issueNumbers: readonly number[], signal: AbortSignal, options?: ApiRequestOptions): Promise<Readonly<Record<number, number | null>> | null>;

	/** POST /repos/{owner}/{repo}/issues: create an issue. */
	create(repository: RepositoryRef, request: CreateIssueRequest, signal: AbortSignal, options?: ApiRequestOptions): Promise<Issue>;

	/** PATCH /repos/{owner}/{repo}/issues/{number}: update only supplied fields. */
	update(repository: RepositoryRef, issueNumber: number, request: UpdateIssueRequest, signal: AbortSignal, options?: ApiRequestOptions): Promise<Issue>;

	/** GET /repos/{owner}/{repo}/issues/{number}/comments: list one page of top-level comments. */
	listComments(repository: RepositoryRef, issueNumber: number, signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<readonly IssueComment[]>;

	/** GET /repos/{owner}/{repo}/issues/comments/{id}: read one top-level comment. */
	getComment(repository: RepositoryRef, commentId: number, signal: AbortSignal, options?: ApiRequestOptions): Promise<IssueComment>;

	/** POST /repos/{owner}/{repo}/issues/{number}/comments: create a top-level comment. */
	createComment(repository: RepositoryRef, issueNumber: number, body: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<IssueComment>;

	/** PATCH /repos/{owner}/{repo}/issues/comments/{id}: edit a top-level comment. */
	updateComment(repository: RepositoryRef, commentId: number, body: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<IssueComment>;

	/** DELETE /repos/{owner}/{repo}/issues/comments/{id}: delete a top-level comment. */
	deleteComment(repository: RepositoryRef, commentId: number, signal: AbortSignal, options?: ApiRequestOptions): Promise<void>;

	/** GET /repos/{owner}/{repo}/issues/{number}/timeline: list one page of timeline events. */
	listTimeline(repository: RepositoryRef, issueNumber: number, signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<readonly TimelineEvent[]>;

	/** GET /repos/{owner}/{repo}/labels: list one page of repository labels. */
	listLabels(repository: RepositoryRef, signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<readonly Label[]>;

	/** POST /repos/{owner}/{repo}/labels: create a repository label. */
	createLabel(repository: RepositoryRef, request: CreateLabelRequest, signal: AbortSignal, options?: ApiRequestOptions): Promise<Label>;

	/** PUT /repos/{owner}/{repo}/issues/{number}/labels: replace all labels; an empty array clears them. */
	setLabels(repository: RepositoryRef, issueNumber: number, labels: readonly string[], signal: AbortSignal, options?: ApiRequestOptions): Promise<readonly Label[]>;

	/** DELETE /repos/{owner}/{repo}/issues/{number}/labels/{name}: remove one label. */
	removeLabel(repository: RepositoryRef, issueNumber: number, name: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<readonly Label[]>;

	/** GET /repos/{owner}/{repo}/milestones: list one page of milestones. */
	listMilestones(repository: RepositoryRef, signal: AbortSignal, options?: ListMilestonesOptions): Promise<readonly Milestone[]>;

	/** POST /repos/{owner}/{repo}/milestones: create a milestone. */
	createMilestone(repository: RepositoryRef, request: CreateMilestoneRequest, signal: AbortSignal, options?: ApiRequestOptions): Promise<Milestone>;

	/** GET /repos/{owner}/{repo}/assignees: list one page of eligible assignees. */
	listAssignees(repository: RepositoryRef, signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<readonly Account[]>;

	/** POST /repos/{owner}/{repo}/issues/{number}/assignees: add assignees without replacing existing ones. */
	addAssignees(repository: RepositoryRef, issueNumber: number, assignees: readonly string[], signal: AbortSignal, options?: ApiRequestOptions): Promise<Issue>;

	/** DELETE /repos/{owner}/{repo}/issues/{number}/assignees: remove the specified assignees. */
	removeAssignees(repository: RepositoryRef, issueNumber: number, assignees: readonly string[], signal: AbortSignal, options?: ApiRequestOptions): Promise<Issue>;

	/** GET the target's reactions collection: return one page. */
	listReactions(repository: RepositoryRef, target: ReactionTarget, signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<readonly Reaction[]>;

	/** POST the target's reactions collection: create a reaction or return the existing one. */
	createReaction(repository: RepositoryRef, target: ReactionTarget, content: ReactionContent, signal: AbortSignal, options?: ApiRequestOptions): Promise<Reaction>;

	/** DELETE the target's reaction resource by its numeric ID. */
	deleteReaction(repository: RepositoryRef, target: ReactionTarget, reactionId: number, signal: AbortSignal, options?: ApiRequestOptions): Promise<void>;
}
