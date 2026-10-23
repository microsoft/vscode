/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ApiPaginationOptions, ApiRequestOptions } from '../client/request.js';
import { JsonObject, PageOptions, RepositoryRef } from '../client/types.js';
import { Account, ChangedFile, RepositoryIdentity } from './core.js';

/** A repository's metadata, settings, and permissions. */
export interface Repository extends RepositoryIdentity {
	/** Default branch name, not a resolved commit. */
	readonly default_branch: string;
	/** HTTPS clone URL. */
	readonly clone_url: string;
	/** SSH clone URL. */
	readonly ssh_url: string;
	/** Whether the repository is archived. */
	readonly archived: boolean;
	/** Whether GitHub disabled the repository. */
	readonly disabled: boolean;
	/** Detected primary language, or null. */
	readonly language: string | null;
	/** Star count. */
	readonly stargazers_count: number;
	/** Viewer permissions, omitted when unavailable. */
	readonly permissions?: {
		/** Administrator permission. */
		readonly admin: boolean;
		/** Read permission. */
		readonly pull: boolean;
		/** Write permission. */
		readonly push: boolean;
		/** Triage permission, when reported. */
		readonly triage?: boolean;
		/** Maintain permission, when reported. */
		readonly maintain?: boolean;
	};
	/** Whether merge commits are allowed, when visible to the caller. */
	readonly allow_merge_commit?: boolean;
	/** Whether squash merges are allowed, when visible to the caller. */
	readonly allow_squash_merge?: boolean;
	/** Whether rebase merges are allowed, when visible to the caller. */
	readonly allow_rebase_merge?: boolean;
	/** Whether auto-merge is allowed, when visible to the caller. */
	readonly allow_auto_merge?: boolean;
	/** Whether merged branches are automatically deleted, when reported. */
	readonly delete_branch_on_merge?: boolean;
	/** Immediate parent repository for a fork. */
	readonly parent?: RepositoryIdentity;
	/** Root repository of the fork network. */
	readonly source?: RepositoryIdentity;
}

/** Authenticated repository listing filters. */
export type ListRepositoriesOptions = ApiPaginationOptions<PageOptions & {
	/** Repository visibility filter. */
	readonly visibility?: 'all' | 'public' | 'private';
	/** Comma-separated owner, collaborator, and organization_member affiliations. */
	readonly affiliation?: string;
	/** Server ordering field. */
	readonly sort?: 'created' | 'updated' | 'pushed' | 'full_name';
	/** Server ordering direction. */
	readonly direction?: 'asc' | 'desc';
}>;

/** Ruleset listing options. */
export type ListRulesetsOptions = ApiPaginationOptions<PageOptions & {
	/** Include parent-organization rulesets. */
	readonly includes_parents?: boolean;
}>;

/** Options for creating a repository owned by the authenticated user. */
export interface CreateRepositoryRequest {
	/** New repository name. */
	readonly name: string;
	/** Repository description. */
	readonly description?: string;
	/** Homepage URL. */
	readonly homepage?: string;
	/** Whether the repository is private. */
	readonly private?: boolean;
	/** Whether GitHub creates an initial README commit. */
	readonly auto_init?: boolean;
	/** Server-supported gitignore template name. */
	readonly gitignore_template?: string;
	/** Server-supported license template name. */
	readonly license_template?: string;
}

/** Options for asynchronously creating a fork. */
export interface ForkRepositoryRequest {
	/** Destination organization; omission uses the authenticated user. */
	readonly organization?: string;
	/** Name for the fork; omission retains the source name. */
	readonly name?: string;
	/** Whether to fork only the default branch. */
	readonly default_branch_only?: boolean;
}

/** A repository branch and its current commit. */
export interface Branch {
	/** Branch name, which may contain slashes. */
	readonly name: string;
	/** Current branch tip. */
	readonly commit: {
		/** Commit SHA. */
		readonly sha: string;
		/** Commit API URL. */
		readonly url: string;
	};
	/** Whether the branch is protected. */
	readonly protected: boolean;
}

/** Git commit author metadata, which need not map to a GitHub account. */
export interface CommitAuthor {
	/** Git author or committer name, when supplied. */
	readonly name?: string;
	/** Git email address, when supplied. */
	readonly email?: string;
	/** Git timestamp in RFC 3339 format, when supplied. */
	readonly date?: string;
}

/** A repository commit, including its metadata, parents, and changed files. */
export interface Commit {
	/** Commit SHA. */
	readonly sha: string;
	/** GraphQL node ID. */
	readonly node_id: string;
	/** Browser URL. */
	readonly html_url: string;
	/** REST resource URL. */
	readonly url: string;
	/** Metadata from the Git commit. */
	readonly commit: {
		/** Unmodified commit message. */
		readonly message: string;
		/** Git author identity, or null when unavailable. */
		readonly author: CommitAuthor | null;
		/** Git committer identity, or null when unavailable. */
		readonly committer: CommitAuthor | null;
		/** Root tree referenced by the commit. */
		readonly tree: {
			/** Tree SHA. */
			readonly sha: string;
			/** Git tree API URL. */
			readonly url: string;
		};
	};
	/** GitHub author account, or null when no account is associated. */
	readonly author: Account | null;
	/** GitHub committer account, or null when no account is associated. */
	readonly committer: Account | null;
	/** Parent commits in Git order. */
	readonly parents: readonly {
		/** Parent commit SHA. */
		readonly sha: string;
		/** Parent commit API URL. */
		readonly url: string;
	}[];
	/** Changed files on this response page, when included. */
	readonly files?: readonly ChangedFile[];
}

/** One commit-comparison response; commits and files have different server limits. */
export interface Comparison {
	/** Browser comparison URL. */
	readonly html_url: string;
	/** Relative history state. */
	readonly status: 'ahead' | 'behind' | 'diverged' | 'identical';
	/** Commits ahead of the base. */
	readonly ahead_by: number;
	/** Commits behind the base. */
	readonly behind_by: number;
	/** Reported total number of comparison commits. */
	readonly total_commits: number;
	/** Resolved base commit. */
	readonly base_commit: Commit;
	/** Resolved merge-base commit. */
	readonly merge_base_commit: Commit;
	/** Commits on this page. */
	readonly commits: readonly Commit[];
	/** Files are supplied on the first page only and are capped by GitHub. */
	readonly files?: readonly ChangedFile[];
}

/** A repository rule and its type-specific settings. */
export type RepositoryRule = JsonObject & {
	/** Server-defined rule type, such as pull_request or required_status_checks. */
	readonly type: string;
};

/** Repository or inherited organization ruleset metadata. */
export interface RepositoryRuleset {
	/** Numeric ruleset ID. */
	readonly id: number;
	/** Ruleset name. */
	readonly name: string;
	/** Target category, when included. */
	readonly target?: 'branch' | 'tag' | 'push' | 'repository';
	/** Ruleset source name. */
	readonly source: string;
	/** Source resource category, when included. */
	readonly source_type?: 'Repository' | 'Organization' | 'Enterprise';
	/** Enforcement mode. */
	readonly enforcement: 'disabled' | 'active' | 'evaluate';
	/** Conditions that determine which repository resources the ruleset applies to. */
	readonly conditions?: JsonObject | null;
	/** Rules, omitted by summary representations. */
	readonly rules?: readonly RepositoryRule[];
}

/** Classic branch-protection requirements for status checks, reviews, and conversations. */
export interface BranchProtection {
	/** Required status-check configuration, when enabled. */
	readonly required_status_checks?: {
		/** Whether the branch must be up to date, when reported. */
		readonly strict?: boolean;
		/** Legacy required status context names. */
		readonly contexts: readonly string[];
		/** App-scoped required checks, when reported. */
		readonly checks?: readonly {
			/** Check context name. */
			readonly context: string;
			/** Required integration ID, or null for any integration. */
			readonly app_id: number | null;
		}[];
	};
	/** Pull request approval configuration, when enabled. */
	readonly required_pull_request_reviews?: {
		/** Whether new commits dismiss prior approvals. */
		readonly dismiss_stale_reviews: boolean;
		/** Whether code-owner approval is required. */
		readonly require_code_owner_reviews: boolean;
		/** Number of required approving reviews, when reported. */
		readonly required_approving_review_count?: number;
	};
	/** Whether every review conversation must be resolved, when reported. */
	readonly required_conversation_resolution?: {
		/** Server-provided enforcement flag. */
		readonly enabled: boolean;
	};
}

/** Operations for repositories, branches, protection rules, commits, and comparisons. */
export interface IRepositoriesClient {

	/** GET /repos/{owner}/{repo}: read repository metadata. */
	get(respository: RepositoryRef, signal: AbortSignal, options?: ApiRequestOptions): Promise<Repository>;

	/** GET /repositories/{id}: resolve a stable numeric repository ID. */
	getById(repositoryId: number, signal: AbortSignal, options?: ApiRequestOptions): Promise<Repository>;

	/** GET /user/repos: list one page of repositories accessible to the authenticated user. */
	listForAuthenticatedUser(signal: AbortSignal, options?: ListRepositoriesOptions): Promise<readonly Repository[]>;

	/** GET /users/{username}/repos: list one page of public repositories for a user. */
	listForUser(username: string, signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<readonly RepositoryIdentity[]>;

	/** GET /orgs/{org}/repos: list one page visible to the current authorization context. */
	listForOrganization(org: string, signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<readonly RepositoryIdentity[]>;

	/** POST /user/repos: create a repository for the authenticated user. */
	create(request: CreateRepositoryRequest, signal: AbortSignal, options?: ApiRequestOptions): Promise<Repository>;

	/** POST /repos/{owner}/{repo}/forks: request fork creation; HTTP 202 acknowledges acceptance, not completion. */
	fork(repository: RepositoryRef, request: ForkRepositoryRequest, signal: AbortSignal, options?: ApiRequestOptions): Promise<Repository>;

	/** GET /repos/{owner}/{repo}/branches: list one page of branches. */
	listBranches(repository: RepositoryRef, signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<readonly Branch[]>;

	/** GET /repos/{owner}/{repo}/branches/{branch}: read a branch tip. */
	getBranch(repository: RepositoryRef, branch: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<Branch>;

	/** GET /repos/{owner}/{repo}/branches/{branch}/protection: read legacy protection settings. */
	getBranchProtection(repository: RepositoryRef, branch: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<BranchProtection>;

	/** GET /repos/{owner}/{repo}/rulesets: list one page, including inherited rulesets when requested. */
	listRulesets(repository: RepositoryRef, signal: AbortSignal, options?: ListRulesetsOptions): Promise<readonly RepositoryRuleset[]>;

	/** GET /repos/{owner}/{repo}/rulesets/{id}: read ruleset details. */
	getRuleset(repository: RepositoryRef, rulesetId: number, signal: AbortSignal, options?: ApiRequestOptions): Promise<RepositoryRuleset>;

	/** GET /repos/{owner}/{repo}/commits/{ref}: read commit metadata and one page of changed files. */
	getCommit(repository: RepositoryRef, ref: string, signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<Commit>;

	/** GET /repos/{owner}/{repo}/compare/{base}...{head}: compare two refs and return one page of commits. */
	compare(repository: RepositoryRef, base: string, head: string, signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<Comparison>;
}
