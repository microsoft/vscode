/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IProductService } from '../../product/common/productService.js';
import { GitHubClientMetadata, GitHubRequestError, IGitHubEndpointProvider } from './githubTypes.js';

export type GitHubRequestFeature = 'credentials' | 'capabilities' | 'query' | 'pullRequestQuery' | 'mutations' | 'other';

export function getGitHubRequestFeature(caller: string | undefined): GitHubRequestFeature {
	switch (caller) {
		case 'github.credentials': return 'credentials';
		case 'github.capabilities': return 'capabilities';
		case 'github.query': return 'query';
		case 'github.pullRequestQuery': return 'pullRequestQuery';
		case 'github.mutations': return 'mutations';
		default: return 'other';
	}
}

export function createGitHubClientMetadata(product: IProductService, component: 'workbench' | 'agent-host', egress: GitHubClientMetadata['egress']): GitHubClientMetadata {
	let application = product.applicationName;
	switch (application) {
		case 'code': application = 'vscode'; break;
		case 'code-insiders': application = 'vscode-insiders'; break;
		case 'code-exploration': application = 'vscode-exploration'; break;
	}
	return {
		application: `${application}/${product.version}`,
		source: `${application}-${component}/${product.version}`,
		egress,
	};
}

export class GitHubRequestMetadata {

	constructor(
		private readonly _client: GitHubClientMetadata,
		private readonly _endpoint: IGitHubEndpointProvider,
	) {
		const identity = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}\/[a-zA-Z0-9][a-zA-Z0-9.+_-]{0,99}$/;
		if (!identity.test(_client.application) || !identity.test(_client.source)
			|| _client.egress !== 'browser' && _client.egress !== 'node') {
			throw new GitHubRequestError('Invalid GitHub client metadata', 'validation');
		}
	}

	getHeaders(url: string, caller: string | undefined, isRetry: boolean): Record<string, string> {
		const origin = new URL(url).origin;
		if (origin !== new URL(this._endpoint.getApiBaseUri()).origin
			&& origin !== new URL(this._endpoint.getGraphQlUri()).origin) {
			return {};
		}

		if (this._client.egress === 'browser') {
			// GitHub.com only permits X-Client-Application; enterprise browser allowlists are not established.
			return origin === 'https://api.github.com' ? { 'X-Client-Application': this._client.application } : {};
		}

		return {
			'X-Client-Application': this._client.application,
			'X-Client-Source': this._client.source,
			'X-Client-Feature': `github.${getGitHubRequestFeature(caller)}`,
			'X-Is-Retry': String(isRetry),
		};
	}
}
