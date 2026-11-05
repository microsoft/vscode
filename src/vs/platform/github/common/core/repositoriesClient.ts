/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mergeArrayPages } from '../client/pagination.js';
import { ApiPaginationOptions, ApiRequestOptions } from '../client/request.js';
import { numberSegment, pathSegment, repositoryPath, withQuery } from '../client/routing.js';
import { parse } from '../client/schema.js';
import { PageOptions, RepositoryRef } from '../client/types.js';
import { RepositoryIdentity } from './core.js';
import { CoreClient, parseAccount, parseChangedFile, parseRepositoryIdentity, repositoryIdentitySchema } from './coreClient.js';
import { Branch, BranchProtection, Commit, Comparison, CreateRepositoryRequest, ForkRepositoryRequest, IRepositoriesClient, ListRepositoriesOptions, ListRulesetsOptions, Repository, RepositoryRuleset } from './repositories.js';

export class RepositoriesClient implements IRepositoriesClient {
	constructor(private readonly _client: CoreClient) { }

	async get(repository: RepositoryRef, signal: AbortSignal, options?: ApiRequestOptions): Promise<Repository> {
		return this._client.request({
			domain: 'repositories',
			method: 'GET',
			path: repositoryPath(repository),
			authentication: 'optional',
			expectedStatus: 200,
			options
		}, signal, parseRepository);
	}

	async getById(repositoryId: number, signal: AbortSignal, options?: ApiRequestOptions): Promise<Repository> {
		return this._client.request({
			domain: 'repositories',
			method: 'GET',
			path: `/repositories/${numberSegment(repositoryId)}`,
			authentication: 'optional',
			expectedStatus: 200,
			options
		}, signal, parseRepository);
	}

	async listForAuthenticatedUser(signal: AbortSignal, options?: ListRepositoriesOptions): Promise<readonly Repository[]> {
		const { query, ...requestOptions } = options ?? {};
		return this._client.requestPages({
			domain: 'repositories',
			method: 'GET',
			path: withQuery('/user/repos', { ...query }),
			authentication: 'required',
			expectedStatus: 200,
			options: requestOptions
		}, signal, parseRepositories, mergeArrayPages);
	}

	async listForUser(username: string, signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<readonly RepositoryIdentity[]> {
		const { query, ...requestOptions } = options ?? {};
		return this._client.requestPages({
			domain: 'repositories',
			method: 'GET',
			path: withQuery(`/users/${pathSegment(username)}/repos`, { ...query }),
			authentication: 'optional',
			expectedStatus: 200,
			options: requestOptions
		}, signal, parseRepositoryIdentities, mergeArrayPages);
	}

	async listForOrganization(org: string, signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<readonly RepositoryIdentity[]> {
		const { query, ...requestOptions } = options ?? {};
		return this._client.requestPages({
			domain: 'repositories',
			method: 'GET',
			path: withQuery(`/orgs/${pathSegment(org)}/repos`, { ...query }),
			authentication: 'optional',
			expectedStatus: 200,
			options: requestOptions
		}, signal, parseRepositoryIdentities, mergeArrayPages);
	}

	async create(request: CreateRepositoryRequest, signal: AbortSignal, options?: ApiRequestOptions): Promise<Repository> {
		return this._client.request({
			domain: 'repositories',
			method: 'POST',
			path: '/user/repos',
			authentication: 'required',
			body: request,
			expectedStatus: 201,
			options
		}, signal, parseRepository);
	}

	async fork(repository: RepositoryRef, request: ForkRepositoryRequest, signal: AbortSignal, options?: ApiRequestOptions): Promise<Repository> {
		return this._client.request({
			domain: 'repositories',
			method: 'POST',
			path: `${repositoryPath(repository)}/forks`,
			authentication: 'required',
			body: request,
			expectedStatus: 202,
			options
		}, signal, parseRepository);
	}

	async listBranches(repository: RepositoryRef, signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<readonly Branch[]> {
		const { query, ...requestOptions } = options ?? {};
		return this._client.requestPages({
			domain: 'repositories',
			method: 'GET',
			path: withQuery(`${repositoryPath(repository)}/branches`, { ...query }),
			authentication: 'optional',
			expectedStatus: 200,
			options: requestOptions
		}, signal, parseBranches, mergeArrayPages);
	}

	async getBranch(repository: RepositoryRef, branch: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<Branch> {
		return this._client.request({
			domain: 'repositories',
			method: 'GET',
			path: `${repositoryPath(repository)}/branches/${pathSegment(branch)}`,
			authentication: 'optional',
			expectedStatus: 200,
			options
		}, signal, parseBranch);
	}

	async getBranchProtection(repository: RepositoryRef, branch: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<BranchProtection> {
		return this._client.request({
			domain: 'repositories',
			method: 'GET',
			path: `${repositoryPath(repository)}/branches/${pathSegment(branch)}/protection`,
			authentication: 'required',
			expectedStatus: 200,
			options
		}, signal, parseBranchProtection);
	}

	async listRulesets(repository: RepositoryRef, signal: AbortSignal, options?: ListRulesetsOptions): Promise<readonly RepositoryRuleset[]> {
		const { query, ...requestOptions } = options ?? {};
		return this._client.requestPages({
			domain: 'repositories',
			method: 'GET',
			path: withQuery(`${repositoryPath(repository)}/rulesets`, { ...query }),
			authentication: 'optional',
			expectedStatus: 200,
			options: requestOptions
		}, signal, parseRulesets, mergeArrayPages);
	}

	async getRuleset(repository: RepositoryRef, rulesetId: number, signal: AbortSignal, options?: ApiRequestOptions): Promise<RepositoryRuleset> {
		return this._client.request({
			domain: 'repositories',
			method: 'GET',
			path: `${repositoryPath(repository)}/rulesets/${numberSegment(rulesetId)}`,
			authentication: 'optional',
			expectedStatus: 200,
			options
		}, signal, parseRuleset);
	}

	async getCommit(repository: RepositoryRef, ref: string, signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<Commit> {
		const { query, ...requestOptions } = options ?? {};
		return this._client.requestPages(
			{
				domain: 'repositories',
				method: 'GET',
				path: withQuery(`${repositoryPath(repository)}/commits/${pathSegment(ref)}`, { ...query }),
				authentication: 'optional',
				expectedStatus: 200,
				options: requestOptions
			},
			signal,
			parseCommit,
			pages => ({
				...pages[pages.length - 1],
				files: pages.every(page => page.files === undefined) ? undefined : pages.flatMap(page => page.files ?? [])
			})
		);
	}

	async compare(repository: RepositoryRef, base: string, head: string, signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<Comparison> {
		const { query, ...requestOptions } = options ?? {};
		return this._client.requestPages(
			{
				domain: 'repositories',
				method: 'GET',
				path: withQuery(`${repositoryPath(repository)}/compare/${pathSegment(base)}...${pathSegment(head)}`, { ...query }),
				authentication: 'optional',
				expectedStatus: 200,
				options: requestOptions
			},
			signal,
			parseComparison,
			pages => ({
				...pages[0],
				commits: pages.flatMap(page => page.commits)
			})
		);
	}
}

const parseRepository = parse.object<Repository>({
	...repositoryIdentitySchema,
	default_branch: parse.string,
	clone_url: parse.nonEmptyString,
	ssh_url: parse.nonEmptyString,
	archived: parse.boolean,
	disabled: parse.boolean,
	language: parse.nullable(parse.string),
	stargazers_count: parse.nonNegativeInteger,
	permissions: parse.optional(parse.object({
		admin: parse.boolean,
		pull: parse.boolean,
		push: parse.boolean,
		triage: parse.optional(parse.boolean),
		maintain: parse.optional(parse.boolean),
	})),
	allow_merge_commit: parse.optional(parse.boolean),
	allow_squash_merge: parse.optional(parse.boolean),
	allow_rebase_merge: parse.optional(parse.boolean),
	allow_auto_merge: parse.optional(parse.boolean),
	delete_branch_on_merge: parse.optional(parse.boolean),
	parent: parse.optional(parseRepositoryIdentity),
	source: parse.optional(parseRepositoryIdentity),
});

const parseRepositories = parse.arrayOf(parseRepository);
const parseRepositoryIdentities = parse.arrayOf(parseRepositoryIdentity);

const parseBranch = parse.object<Branch>({
	name: parse.nonEmptyString,
	commit: parse.object({
		sha: parse.nonEmptyString,
		url: parse.nonEmptyString
	}),
	protected: parse.boolean,
});

const parseBranches = parse.arrayOf(parseBranch);

const parseCommitAuthor = parse.nullable(parse.object({
	name: parse.optional(parse.string),
	email: parse.optional(parse.string),
	date: parse.optional(parse.dateTime),
}));

/** Parses repository commit metadata. */
export const parseCommit = parse.object<Commit>({
	sha: parse.nonEmptyString,
	node_id: parse.nonEmptyString,
	html_url: parse.nonEmptyString,
	url: parse.nonEmptyString,
	commit: parse.object({
		message: parse.string,
		author: parseCommitAuthor,
		committer: parseCommitAuthor,
		tree: parse.object({
			sha: parse.nonEmptyString,
			url: parse.nonEmptyString
		}),
	}),
	author: parse.nullable(parseAccount),
	committer: parse.nullable(parseAccount),
	parents: parse.arrayOf(parse.object({
		sha: parse.nonEmptyString,
		url: parse.nonEmptyString
	})),
	files: parse.optional(parse.arrayOf(parseChangedFile)),
});

const parseComparison = parse.object<Comparison>({
	html_url: parse.nonEmptyString,
	status: parse.oneOf('ahead', 'behind', 'diverged', 'identical'),
	ahead_by: parse.nonNegativeInteger,
	behind_by: parse.nonNegativeInteger,
	total_commits: parse.nonNegativeInteger,
	base_commit: parseCommit,
	merge_base_commit: parseCommit,
	commits: parse.arrayOf(parseCommit),
	files: parse.optional(parse.arrayOf(parseChangedFile)),
});

const parseRuleset = parse.object<RepositoryRuleset>({
	id: parse.positiveInteger,
	name: parse.string,
	target: parse.optional(parse.oneOf('branch', 'tag', 'push', 'repository')),
	source: parse.string,
	source_type: parse.optional(parse.oneOf('Repository', 'Organization', 'Enterprise')),
	enforcement: parse.oneOf('disabled', 'active', 'evaluate'),
	conditions: parse.optional(parse.nullable(parse.jsonObject)),
	rules: parse.optional(parse.arrayOf(parse.amend(parse.jsonObject, value => ({ type: parse.nonEmptyString(value.type) })))),
});
const parseRulesets = parse.arrayOf(parseRuleset);

const parseBranchProtection = parse.object<BranchProtection>({
	required_status_checks: parse.optional(parse.object({
		strict: parse.optional(parse.boolean),
		contexts: parse.strings,
		checks: parse.optional(parse.arrayOf(parse.object({
			context: parse.string,
			app_id: parse.nullable(parse.integer),
		}))),
	})),
	required_pull_request_reviews: parse.optional(parse.object({
		dismiss_stale_reviews: parse.boolean,
		require_code_owner_reviews: parse.boolean,
		required_approving_review_count: parse.optional(parse.nonNegativeInteger),
	})),
	required_conversation_resolution: parse.optional(parse.object({
		enabled: parse.boolean
	})),
});
