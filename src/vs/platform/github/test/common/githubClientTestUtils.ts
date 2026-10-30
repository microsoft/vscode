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
import { ApiResponse, BufferedApiRequestProvider } from '../../common/client/request.js';

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

export class FixtureApiRequestProvider extends BufferedApiRequestProvider {
	constructor(private readonly response: unknown) { super(); }

	protected override async execute(): Promise<ApiResponse<string | undefined>> {
		return { status: 200, data: JSON.stringify(this.response) };
	}
}

export function createTestPullRequestResponse(overrides: Record<string, unknown> = {}): object {
	return {
		id: 1, node_id: 'PR_1', number: 1,
		html_url: 'https://github.com/owner/repo/pull/1',
		url: 'https://api.github.com/repos/owner/repo/pulls/1',
		title: 'Fix the repository', body: 'Description', state: 'closed', draft: false, user: null,
		head: { label: 'owner:feature', ref: 'feature', sha: 'a'.repeat(40), repo: null },
		base: { label: 'owner:main', ref: 'main', sha: 'b'.repeat(40), repo: null },
		labels: [], milestone: null,
		created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-02T00:00:00Z',
		closed_at: '2026-10-02T00:00:00Z', merged_at: '2026-10-02T00:00:00Z', merge_commit_sha: 'c'.repeat(40),
		merged: true, mergeable: false, mergeable_state: 'unknown', maintainer_can_modify: false, merged_by: null,
		commits: 1, changed_files: 1, additions: 1, deletions: 0, comments: 0, review_comments: 0,
		auto_merge: null,
		...overrides,
	};
}
