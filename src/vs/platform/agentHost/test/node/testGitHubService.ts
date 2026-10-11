/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { ImmortalReference } from '../../../../base/common/lifecycle.js';
import { mock } from '../../../../base/test/common/mock.js';
import { IGitHubCredentials } from '../../../github/common/githubCredentialService.js';
import { GitHubPullRequestLookup } from '../../../github/common/githubQueryService.js';
import { IGitHubQuery } from '../../../github/common/githubQueryServiceImpl.js';
import { IGitHubClient } from '../../../github/common/githubService.js';
import { IPullRequestMutations } from '../../../github/common/pullRequestMutationService.js';
import { IAgentHostGitHubService } from '../../node/agentHostGitHubService.js';

export function createTestGitHubService(client: IGitHubClient = new class extends mock<IGitHubClient>() { }(), onDidChange: Event<void> = Event.None): IAgentHostGitHubService {
	return new class extends mock<IAgentHostGitHubService>() {
		override readonly onDidChangeRepositoryClient = onDidChange;
		override acquireRepositoryClient() { return new ImmortalReference(client); }
	}();
}

export function createTestGitHubClient(overrides: Partial<Pick<IGitHubClient, 'credentials' | 'query' | 'mutations'>> = {}): IGitHubClient {
	return new class extends mock<IGitHubClient>() {
		override readonly credentials = overrides.credentials ?? new class extends mock<IGitHubCredentials>() {
			override readonly onDidInvalidate = Event.None;
			override async getCredential(signal: AbortSignal) {
				signal.throwIfAborted();
				return { account: { host: 'api.github.com', accountId: '1' }, token: 'test-token', generation: 1, signal: new AbortController().signal };
			}
		}();
		override readonly query = overrides.query ?? new class extends mock<IGitHubQuery>() { }();
		override readonly mutations = overrides.mutations ?? new class extends mock<IPullRequestMutations>() { }();
	}();
}

export function createTestPullRequest(number: number, overrides: Partial<Omit<GitHubPullRequestLookup, 'ref'>> = {}): GitHubPullRequestLookup {
	return {
		ref: { host: 'api.github.com', accountId: '1', owner: 'microsoft', repo: 'vscode', number },
		url: `https://github.com/microsoft/vscode/pull/${number}`,
		...overrides,
	};
}
