/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { IApiRequestProvider } from '../client/request.js';
import { ContentClient } from '../content/contentClient.js';
import { CoreClient } from '../core/coreClient.js';
import { SearchClient } from '../core/searchClient.js';
import { GistsClient } from '../gists/gistsClient.js';
import { GitHubRequestError } from '../githubTypes.js';
import { IGitHubAnonymousClient } from './anonymous.js';

export class AnonymousClient extends Disposable implements IGitHubAnonymousClient {
	readonly content: IGitHubAnonymousClient['content'];
	readonly gist: IGitHubAnonymousClient['gist'];
	readonly search: IGitHubAnonymousClient['search'];

	constructor(provider: IApiRequestProvider, rawContent: IApiRequestProvider | undefined, lifetime: IDisposable) {
		super();
		this._register(lifetime);
		this.content = new ContentClient(provider, rawContent);
		const gist = new GistsClient(provider);
		this.gist = { get: (gistId, signal, options) => gist.get(gistId, signal, options) };
		const core = new CoreClient(provider, {
			request: async () => {
				throw new GitHubRequestError('GitHub GraphQL requests require an authenticated client', 'authentication');
			},
		});
		const search = new SearchClient(core);
		this.search = { issues: (query, signal, options) => search.issues(query, signal, options) };
	}
}
