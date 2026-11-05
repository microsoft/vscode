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
			domain: 'gists',
			method: 'GET',
			path: `/gists/${pathSegment(gistId)}`,
			expectedStatus: 200,
			options,
		}, signal, parseGist);
		return response.data;
	}

	async create(request: CreateGistRequest, signal: AbortSignal, options?: ApiRequestOptions): Promise<Gist> {
		const response = await this._provider.request({
			domain: 'gists',
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

const parseGist = parse.copyObject<Gist>({
	id: parse.nonEmptyString,
	html_url: parse.nonEmptyString,
	files: parse.dictionary(parse.copyObject({
		truncated: parse.boolean,
		content: parse.string,
		encoding: parse.oneOf('utf-8', 'base64'),
	})),
});
