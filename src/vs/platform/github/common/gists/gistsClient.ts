/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ApiRequestOptions, IApiRequestProvider } from '../client/request.js';
import { pathSegment } from '../client/routing.js';
import { parse } from '../client/schema.js';
import { CreateGistRequest, Gist, IGistsClient } from './gists.js';

export class GistsClient implements IGistsClient {
	constructor(private readonly _provider: IApiRequestProvider) { }

	async get(gistId: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<Gist> {
		const response = await this._provider.request({
			method: 'GET',
			path: `/gists/${pathSegment(gistId)}`,
			expectedStatus: 200,
			options,
		}, signal, parseGist);
		return response.data;
	}

	async create(request: CreateGistRequest, signal: AbortSignal, options?: ApiRequestOptions): Promise<Gist> {
		const response = await this._provider.request({
			method: 'POST',
			path: '/gists',
			body: request,
			authentication: 'required',
			expectedStatus: 201,
			options,
		}, signal, parseGist);
		return response.data;
	}
}

const parseGist = parse.object<Gist>({
	id: parse.nonEmptyString,
	node_id: parse.nonEmptyString,
	url: parse.nonEmptyString,
	html_url: parse.nonEmptyString,
	git_pull_url: parse.nonEmptyString,
	git_push_url: parse.nonEmptyString,
	forks_url: parse.nonEmptyString,
	commits_url: parse.nonEmptyString,
	comments_url: parse.nonEmptyString,
	public: parse.boolean,
	description: parse.nullable(parse.string),
	files: parse.dictionary(parse.object({
		filename: parse.nonEmptyString,
		type: parse.string,
		language: parse.nullable(parse.string),
		raw_url: parse.nonEmptyString,
		size: parse.nonNegativeInteger,
		truncated: parse.boolean,
		content: parse.string,
		encoding: parse.oneOf('utf-8', 'base64'),
	})),
	truncated: parse.boolean,
	created_at: parse.dateTime,
	updated_at: parse.dateTime,
	comments: parse.nonNegativeInteger,
	comments_enabled: parse.optional(parse.boolean),
	owner: parse.optional(parse.object({
		id: parse.positiveInteger,
		login: parse.nonEmptyString,
		avatar_url: parse.nonEmptyString,
		html_url: parse.nonEmptyString,
	})),
});
