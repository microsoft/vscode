/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { isObject } from '../../../../base/common/types.js';
import { IGitHubClient } from '../../common/githubService.js';
import { GitHubTransport } from '../../common/githubTransport.js';
import { IGitHubEndpointProvider } from '../../common/githubTypes.js';

interface GitHubClientInternals extends IGitHubClient {
	readonly transport: GitHubTransport;
	readonly endpoint: IGitHubEndpointProvider;
	readonly onDidInvalidate: Event<void>;
}

function hasClientInternals(client: IGitHubClient): client is GitHubClientInternals {
	const endpoint: unknown = Reflect.get(client, 'endpoint');
	return Reflect.get(client, 'transport') instanceof GitHubTransport
		&& typeof Reflect.get(client, 'onDidInvalidate') === 'function'
		&& isObject(endpoint)
		&& ['onDidChange', 'getApiBaseUri', 'getGraphQlUri'].every(key => typeof Reflect.get(endpoint, key) === 'function');
}

/** Exposes engine internals to white-box transport and lifetime tests. */
export function getGitHubClientInternals(client: IGitHubClient): GitHubClientInternals {
	assert.ok(hasClientInternals(client), 'Expected an engine-owned GitHub client');
	return client;
}
