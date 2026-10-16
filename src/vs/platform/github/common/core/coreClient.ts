/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { GitHubRequestError } from '../githubTypes.js';
import { isDefined } from '../../../../base/common/types.js';
import { collectPages, nextPagePath, PaginatedApiRequest } from '../client/pagination.js';
import { parseGraphQLResponse, throwGraphQLErrors } from '../client/graphql.js';
import { ApiRequest, ApiRequestOptions, IApiRequestProvider, PaginationOptions } from '../client/request.js';
import { parse } from '../client/schema.js';
import { Account, Actor, ChangedFile, Connection, CursorOptions, Label, Milestone, NodeIdentity, Reaction, RepositoryIdentity, Team } from './core.js';

/** Executes GitHub REST and GraphQL operations and returns their parsed results. */
export class CoreClient {
	constructor(
		private readonly _restProvider: IApiRequestProvider,
		private readonly _graphqlProvider: IApiRequestProvider) { }

	async request(request: ApiRequest & { readonly responseBody: 'none' }, signal: AbortSignal): Promise<void>;
	async request<T>(request: ApiRequest & { readonly responseBody?: 'json' | 'text' }, signal: AbortSignal, parser: parse.Parser<T>): Promise<T>;
	async request<T>(request: ApiRequest, signal: AbortSignal, parser?: parse.Parser<T>): Promise<T | void> {
		return (await this._restProvider.request(request, signal, parser)).data;
	}

	async requestPages<T>(request: PaginatedApiRequest, signal: AbortSignal, parser: parse.Parser<T>, merge: (pages: readonly T[]) => T): Promise<T> {
		const { maxPages, pageLimitBehavior, ...options } = request.options ?? {};
		if (maxPages === undefined) {
			signal.throwIfAborted();
			const response = await this._restProvider.request({ ...request, options }, signal, parser);
			signal.throwIfAborted();
			return response.data;
		}
		const response = await collectPages(
			request.path,
			path => this._restProvider.request({ ...request, path: path ?? request.path, options }, signal, parser),
			page => nextPagePath(page.metadata),
			pages => ({ ...pages[pages.length - 1], data: merge(pages.map(page => page.data)) }),
			signal,
			{ maxPages, pageLimitBehavior },
		);
		return response.data;
	}

	async graphql<T>(query: string, variables: object, signal: AbortSignal, parser: parse.Parser<T>, options?: ApiRequestOptions): Promise<T> {
		const { data: { errors, data }, status } = await this._graphqlProvider.request({
			method: 'POST',
			path: '/',
			body: { query, variables },
			authentication: 'required',
			expectedStatus: 200,
			accept: 'application/json',
			responseBody: 'json',
			options,
		}, signal, parseGraphQLResponse);

		throwGraphQLErrors(errors, status);
		return parser(data);
	}

	graphqlPages<T, TVariables extends CursorOptions>(query: string, variables: TVariables, signal: AbortSignal, parser: parse.Parser<Connection<T>>, options?: ApiRequestOptions & PaginationOptions): Promise<Connection<T>>;
	graphqlPages<T, TVariables extends CursorOptions>(query: string, variables: TVariables, signal: AbortSignal, parser: parse.Parser<Connection<T> | null>, options?: ApiRequestOptions & PaginationOptions): Promise<Connection<T> | null>;
	async graphqlPages<T, TVariables extends CursorOptions>(query: string, variables: TVariables, signal: AbortSignal, parser: parse.Parser<Connection<T> | null>, options: ApiRequestOptions & PaginationOptions = {}): Promise<Connection<T> | null> {
		const { maxPages, pageLimitBehavior, ...requestOptions } = options;
		if (maxPages === undefined) {
			signal.throwIfAborted();
			const page = await this.graphql(
				query,
				variables,
				signal,
				parser,
				requestOptions
			);
			signal.throwIfAborted();
			return page;
		}
		return collectPages(
			variables.after,
			after => this.graphql(
				query,
				after === variables.after ? variables : { ...variables, after },
				signal,
				parser,
				requestOptions
			),
			page => {
				if (!page?.pageInfo.hasNextPage) {
					return undefined;
				}
				if (!page.pageInfo.endCursor) {
					throw new GitHubRequestError('GitHub pagination did not return a cursor', 'malformedResponse');
				}
				return page.pageInfo.endCursor;
			},
			pages => {
				const available = pages.filter(isDefined);
				return available.length !== pages.length ? null : {
					...available[available.length - 1],
					nodes: available.some(page => page.nodes === null) ? null : available.flatMap(page => page.nodes ?? []),
				};
			},
			signal,
			{ maxPages, pageLimitBehavior },
		);
	}
}

/** Validates GraphQL pagination options, including a page size from 1 through 100. */
export function cursorVariables(options: CursorOptions): CursorOptions {
	if (options.first !== undefined && (!Number.isSafeInteger(options.first) || options.first < 1 || options.first > 100)) {
		throw new GitHubRequestError('Invalid GraphQL page size.', 'validation');
	}
	return options;
}

/** Schema for GitHub account metadata. */
export const accountSchema: parse.ObjectSchema<Account> = {
	id: parse.positiveInteger,
	node_id: parse.nonEmptyString,
	login: parse.nonEmptyString,
	avatar_url: parse.string,
	html_url: parse.nonEmptyString,
	type: parse.nonEmptyString,
};

/** Parses GitHub account metadata. */
export const parseAccount = parse.object<Account>(accountSchema);

/** Parses a GraphQL actor. */
export const parseActor = parse.object<Actor>({
	__typename: parse.nonEmptyString,
	login: parse.nonEmptyString,
	avatarUrl: parse.string,
	url: parse.nonEmptyString,
});

/** Schema for repository identity and summary metadata. */
export const repositoryIdentitySchema: parse.ObjectSchema<RepositoryIdentity> = {
	id: parse.positiveInteger,
	node_id: parse.nonEmptyString,
	name: parse.nonEmptyString,
	full_name: parse.nonEmptyString,
	owner: parseAccount,
	private: parse.boolean,
	html_url: parse.nonEmptyString,
	url: parse.nonEmptyString,
	description: parse.nullable(parse.string),
	fork: parse.boolean,
};

/** Parses repository identity and summary metadata. */
export const parseRepositoryIdentity = parse.object<RepositoryIdentity>(repositoryIdentitySchema);

/** Parses repository label metadata. */
export const parseLabel = parse.object<Label>({
	id: parse.positiveInteger,
	node_id: parse.nonEmptyString,
	name: parse.string,
	color: parse.string,
	default: parse.boolean,
	description: parse.nullable(parse.string),
});

/** Parses repository milestone metadata. */
export const parseMilestone = parse.object<Milestone>({
	id: parse.positiveInteger,
	node_id: parse.nonEmptyString,
	number: parse.positiveInteger,
	title: parse.string,
	description: parse.nullable(parse.string),
	state: parse.oneOf('open', 'closed'),
	due_on: parse.nullable(parse.dateTime),
});

/** Schema for a team's identity and descriptive metadata. */
export const teamSchema: parse.ObjectSchema<Team> = {
	id: parse.positiveInteger,
	node_id: parse.nonEmptyString,
	name: parse.string,
	slug: parse.nonEmptyString,
	html_url: parse.nonEmptyString,
	description: parse.nullable(parse.string),
};

/** Parses a team's identity and descriptive metadata. */
export const parseTeam = parse.object<Team>(teamSchema);

/** Parses metadata for a changed repository file. */
export const parseChangedFile = parse.object<ChangedFile>({
	sha: parse.nullable(parse.nonEmptyString),
	filename: parse.nonEmptyString,
	previous_filename: parse.optional(parse.string),
	status: parse.oneOf('added', 'removed', 'modified', 'renamed', 'copied', 'changed', 'unchanged'),
	additions: parse.nonNegativeInteger,
	deletions: parse.nonNegativeInteger,
	changes: parse.nonNegativeInteger,
	patch: parse.optional(parse.string),
	blob_url: parse.nonEmptyString,
});

/** Parses a REST reaction. */
export const parseReaction = parse.object<Reaction>({
	id: parse.positiveInteger,
	node_id: parse.nonEmptyString,
	user: parse.nullable(parseAccount),
	content: parse.oneOf('+1', '-1', 'laugh', 'confused', 'heart', 'hooray', 'rocket', 'eyes'),
	created_at: parse.dateTime,
});

/** Parses an opaque GraphQL node ID. */
export const parseNodeIdentity = parse.object<NodeIdentity>({ id: parse.nonEmptyString });

/** Parses check and workflow-job lifecycle phases. */
export const parseCheckStatus = parse.oneOf('queued', 'in_progress', 'completed', 'waiting', 'requested', 'pending');

/** Parses an outcome accepted for check runs and Actions jobs. */
export const parseCheckConclusion = parse.oneOf('success', 'failure', 'neutral', 'cancelled', 'skipped', 'timed_out', 'action_required', 'stale');

/** Builds a parser for a GraphQL connection with nullable nodes and pagination metadata. */
export function parseConnection<T>(parser: parse.Parser<T>): parse.Parser<Connection<T>> {
	return parse.object<Connection<T>>({
		nodes: parse.nullable(parse.arrayOf(parse.nullable(parser))),
		pageInfo: parse.object({
			endCursor: parse.nullable(parse.string),
			hasNextPage: parse.boolean,
		}),
	});
}
