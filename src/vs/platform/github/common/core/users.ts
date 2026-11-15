/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ApiPaginationOptions, ApiRequestOptions } from '../client/request.js';
import { PageOptions } from '../client/types.js';
import { Account } from './core.js';

/** A GitHub user's profile. */
export interface User extends Account {
	/** Display name, or null when unset. */
	readonly name: string | null;
	/** Public profile email, or null; this is not the account's complete email list. */
	readonly email: string | null;
	/** Biography, or null when unset. */
	readonly bio: string | null;
	/** Profile location, or null when unset. */
	readonly location: string | null;
}

/** An email address returned for the authenticated account. */
export interface UserEmail {
	/** Email address. */
	readonly email: string;
	/** Whether this is the primary email address. */
	readonly primary: boolean;
	/** Whether GitHub has verified the address. */
	readonly verified: boolean;
	/** Visibility setting, or null when unset. */
	readonly visibility: string | null;
}

/** Operations for user profiles and the authenticated user's email addresses. */
export interface IUsersClient {

	/** GET /user: read the authenticated user's profile. */
	getAuthenticated(signal: AbortSignal, options?: ApiRequestOptions): Promise<User>;

	/** GET /users/{username}: read a public user profile. */
	get(username: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<User>;

	/** GET /user/emails: read one page of email addresses with the required user permission. */
	listEmails(signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<readonly UserEmail[]>;
}
