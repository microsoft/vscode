/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ApiPaginationOptions, ApiRequestOptions } from '../client/request.js';
import { PageOptions } from '../client/types.js';
import { Account, Team } from './core.js';

/** An organization's identity and summary metadata. */
export interface OrganizationSummary {
	/** Numeric organization ID. */
	readonly id: number;
	/** GraphQL node ID. */
	readonly node_id: string;
	/** Organization login. */
	readonly login: string;
	/** REST resource URL. */
	readonly url: string;
	/** Avatar URL. */
	readonly avatar_url: string;
	/** Description, or null when unset. */
	readonly description: string | null;
}

/** An organization's profile details. */
export interface Organization extends OrganizationSummary {
	/** Browser URL. */
	readonly html_url: string;
	/** Display name, when reported, or null when unset. */
	readonly name?: string | null;
}

/** A user's membership in an organization. */
export interface OrganizationMembership {
	/** Active membership or an invitation still awaiting acceptance. */
	readonly state: 'active' | 'pending';
	/** Organization role. */
	readonly role: 'admin' | 'member' | 'billing_manager';
	/** Organization identity. */
	readonly organization: OrganizationSummary;
	/** Member account, or null when unavailable. */
	readonly user: Account | null;
}

/** Team details with hierarchy and repository permission metadata. */
export interface TeamDetails extends Team {
	/** Server-reported default repository permission. */
	readonly permission: string;
	/** Parent team, or null for a top-level team. */
	readonly parent: Team | null;
}

/** Team returned by the authenticated user's cross-organization listing. */
export interface UserTeam extends Team {
	/** The organization within which the team's slug is unique. */
	readonly organization: OrganizationSummary;
}

/** Team-member listing options. */
export type ListTeamMembersOptions = ApiPaginationOptions<PageOptions & {
	/** Team-role filter. */
	readonly role?: 'member' | 'maintainer' | 'all';
}>;

/** Operations for reading organizations, memberships, teams, and team members. */
export interface IOrganizationsClient {

	/** GET /orgs/{org}: read organization profile metadata. */
	get(org: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<Organization>;

	/** GET /user/orgs: return one page of organizations for the authenticated user. */
	listForAuthenticatedUser(signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<readonly OrganizationSummary[]>;

	/** GET /users/{username}/orgs: return one page of publicly visible memberships. */
	listForUser(username: string, signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<readonly OrganizationSummary[]>;

	/** GET /user/memberships/orgs/{org}: read the authenticated user's membership. */
	getAuthenticatedMembership(org: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<OrganizationMembership>;

	/** GET /orgs/{org}/memberships/{username}: read a membership visible to the authenticated caller. */
	getMembership(org: string, username: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<OrganizationMembership>;

	/** GET /orgs/{org}/teams: return one page of teams visible to the caller. */
	listTeams(org: string, signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<readonly TeamDetails[]>;

	/** GET /orgs/{org}/teams/{slug}: read team details by slug. */
	getTeam(org: string, teamSlug: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<TeamDetails>;

	/** GET /user/teams: return one page with owning-organization metadata. */
	listTeamsForAuthenticatedUser(signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<readonly UserTeam[]>;

	/** GET /orgs/{org}/teams/{slug}/members: return one page of team members. */
	listTeamMembers(org: string, teamSlug: string, signal: AbortSignal, options?: ListTeamMembersOptions): Promise<readonly Account[]>;
}
