/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IGitHubEndpoints } from '../../github/common/githubEndpoints.js';
import { ProtectedResourceMetadata } from './state/protocol/state.js';

/**
 * The GitHub Copilot protected resource for the given endpoints. Shared by the
 * endpoint service and tests so the resource identity is defined once.
 */
export function gitHubCopilotResource(endpoints: IGitHubEndpoints): ProtectedResourceMetadata {
	return {
		resource: endpoints.apiBaseUri,
		resource_name: 'GitHub Copilot',
		authorization_servers: [endpoints.oauthServer],
		scopes_supported: ['read:user', 'user:email'],
		required: true,
	};
}

/** The GitHub repository protected resource for the given endpoints. */
export function gitHubRepoResource(endpoints: IGitHubEndpoints): ProtectedResourceMetadata {
	return {
		resource: `${endpoints.apiBaseUri}/repos`,
		resource_name: 'GitHub Repository',
		authorization_servers: [endpoints.oauthServer],
		scopes_supported: ['repo'],
		required: false,
	};
}
