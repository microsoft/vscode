/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mergeArrayPages } from '../client/pagination.js';
import { ApiPaginationOptions, ApiRequestOptions } from '../client/request.js';
import { pathSegment, withQuery } from '../client/routing.js';
import { parse } from '../client/schema.js';
import { PageOptions } from '../client/types.js';
import { accountSchema, CoreClient } from './coreClient.js';
import { IUsersClient, User, UserEmail } from './users.js';

export class UsersClient implements IUsersClient {
	constructor(private readonly _client: CoreClient) { }

	async getAuthenticated(signal: AbortSignal, options?: ApiRequestOptions): Promise<User> {
		return this._client.request({
			method: 'GET',
			path: '/user',
			authentication: 'required',
			expectedStatus: 200,
			options
		}, signal, parseUser);
	}

	async get(username: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<User> {
		return this._client.request({
			method: 'GET',
			path: `/users/${pathSegment(username)}`,
			authentication: 'optional',
			expectedStatus: 200,
			options
		}, signal, parseUser);
	}

	async listEmails(signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<readonly UserEmail[]> {
		const { query, ...requestOptions } = options ?? {};
		return this._client.requestPages({
			method: 'GET',
			path: withQuery('/user/emails', { ...query }),
			authentication: 'required',
			expectedStatus: 200,
			options: requestOptions
		}, signal, parseEmails, mergeArrayPages);
	}
}

const parseUser = parse.object<User>({
	...accountSchema,
	name: parse.nullable(parse.string),
	email: parse.nullable(parse.string),
	bio: parse.nullable(parse.string),
	location: parse.nullable(parse.string),
});

const parseEmails = parse.arrayOf(parse.object<UserEmail>({
	email: parse.string,
	primary: parse.boolean,
	verified: parse.boolean,
	visibility: parse.nullable(parse.string),
}));
