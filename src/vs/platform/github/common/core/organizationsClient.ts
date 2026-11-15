/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mergeArrayPages } from '../client/pagination.js';
import { ApiPaginationOptions, ApiRequestOptions } from '../client/request.js';
import { pathSegment, withQuery } from '../client/routing.js';
import { parse } from '../client/schema.js';
import { PageOptions } from '../client/types.js';
import { Account } from './core.js';
import { CoreClient, parseAccount, parseTeam, teamSchema } from './coreClient.js';
import { IOrganizationsClient, ListTeamMembersOptions, Organization, OrganizationMembership, OrganizationSummary, TeamDetails, UserTeam } from './organizations.js';

export class OrganizationsClient implements IOrganizationsClient {
	constructor(private readonly _client: CoreClient) { }

	async get(org: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<Organization> {
		return this._client.request({
			domain: 'organizations',
			method: 'GET',
			path: `/orgs/${pathSegment(org)}`,
			authentication: 'optional',
			expectedStatus: 200,
			options
		}, signal, parseOrganization);
	}

	async listForAuthenticatedUser(signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<readonly OrganizationSummary[]> {
		const { query, ...requestOptions } = options ?? {};
		return this._client.requestPages({
			domain: 'organizations',
			method: 'GET',
			path: withQuery('/user/orgs', { ...query }),
			authentication: 'required',
			expectedStatus: 200,
			options: requestOptions
		}, signal, parseOrganizations, mergeArrayPages);
	}

	async listForUser(username: string, signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<readonly OrganizationSummary[]> {
		const { query, ...requestOptions } = options ?? {};
		return this._client.requestPages({
			domain: 'organizations',
			method: 'GET',
			path: withQuery(`/users/${pathSegment(username)}/orgs`, { ...query }),
			authentication: 'optional',
			expectedStatus: 200,
			options: requestOptions
		}, signal, parseOrganizations, mergeArrayPages);
	}

	async getAuthenticatedMembership(org: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<OrganizationMembership> {
		return this._client.request({
			domain: 'organizations',
			method: 'GET',
			path: `/user/memberships/orgs/${pathSegment(org)}`,
			authentication: 'required',
			expectedStatus: 200,
			options
		}, signal, parseMembership);
	}

	async getMembership(org: string, username: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<OrganizationMembership> {
		return this._client.request({
			domain: 'organizations',
			method: 'GET',
			path: `/orgs/${pathSegment(org)}/memberships/${pathSegment(username)}`,
			authentication: 'required',
			expectedStatus: 200,
			options
		}, signal, parseMembership);
	}

	async listTeams(org: string, signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<readonly TeamDetails[]> {
		const { query, ...requestOptions } = options ?? {};
		return this._client.requestPages({
			domain: 'organizations',
			method: 'GET',
			path: withQuery(`/orgs/${pathSegment(org)}/teams`, { ...query }),
			authentication: 'required',
			expectedStatus: 200,
			options: requestOptions
		}, signal, parseTeams, mergeArrayPages);
	}

	async getTeam(org: string, teamSlug: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<TeamDetails> {
		return this._client.request({
			domain: 'organizations',
			method: 'GET',
			path: teamPath(org, teamSlug),
			authentication: 'required',
			expectedStatus: 200,
			options
		}, signal, parseTeamDetails);
	}

	async listTeamsForAuthenticatedUser(signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<readonly UserTeam[]> {
		const { query, ...requestOptions } = options ?? {};
		return this._client.requestPages({
			domain: 'organizations',
			method: 'GET',
			path: withQuery('/user/teams', { ...query }),
			authentication: 'required',
			expectedStatus: 200,
			options: requestOptions
		}, signal, parseUserTeams, mergeArrayPages);
	}

	async listTeamMembers(org: string, teamSlug: string, signal: AbortSignal, options?: ListTeamMembersOptions): Promise<readonly Account[]> {
		const { query, ...requestOptions } = options ?? {};
		return this._client.requestPages({
			domain: 'organizations',
			method: 'GET',
			path: withQuery(`${teamPath(org, teamSlug)}/members`, { ...query }),
			authentication: 'required',
			expectedStatus: 200,
			options: requestOptions
		}, signal, parseMembers, mergeArrayPages);
	}
}

function teamPath(org: string, teamSlug: string): string {
	return `/orgs/${pathSegment(org)}/teams/${pathSegment(teamSlug)}`;
}

const summarySchema: parse.ObjectSchema<OrganizationSummary> = {
	id: parse.positiveInteger,
	node_id: parse.nonEmptyString,
	login: parse.nonEmptyString,
	url: parse.nonEmptyString,
	avatar_url: parse.string,
	description: parse.nullable(parse.string),
};

const parseOrganizationSummary = parse.object<OrganizationSummary>(summarySchema);
const parseOrganizations = parse.arrayOf(parseOrganizationSummary);

const parseOrganization = parse.object<Organization>({
	...summarySchema,
	html_url: parse.nonEmptyString,
	name: parse.optional(parse.nullable(parse.string)),
});

const parseMembership = parse.object<OrganizationMembership>({
	state: parse.oneOf('active', 'pending'),
	role: parse.oneOf('admin', 'member', 'billing_manager'),
	organization: parseOrganizationSummary,
	user: parse.nullable(parseAccount),
});

const parseTeamDetails = parse.object<TeamDetails>({
	...teamSchema,
	permission: parse.string,
	parent: parse.nullable(parseTeam),
});

const parseTeams = parse.arrayOf(parseTeamDetails);

const parseUserTeams = parse.arrayOf(parse.object<UserTeam>({
	...teamSchema,
	organization: parseOrganizationSummary,
}));

const parseMembers = parse.arrayOf(parseAccount);
