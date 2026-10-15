/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { parsePullRequestUrl } from '../../../github/common/githubUrls.js';
import { createDecorator } from '../../../instantiation/common/instantiation.js';
import { IAgentHostGitHubService } from '../agentHostGitHubService.js';

export const IAgentHostPullRequestResolver = createDecorator<IAgentHostPullRequestResolver>('agentHostPullRequestResolver');

/** A same-repository pull request resolved from its URL. */
export interface IResolvedPullRequest {
	readonly url: string;
	readonly webHost: string;
	readonly owner: string;
	readonly repo: string;
	readonly number: number;
	readonly headRef: string;
	readonly baseRef: string;
}

/** Resolves pull request URLs a session is created from. */
export interface IAgentHostPullRequestResolver {
	readonly _serviceBrand: undefined;
	/**
	 * Parses `pullRequestUrl` and fetches the pull request from GitHub. Throws a
	 * localized error for malformed URLs, other GitHub hosts, inaccessible or
	 * merged pull requests, and pull requests from forks.
	 */
	resolve(pullRequestUrl: string): Promise<IResolvedPullRequest>;
}

export class AgentHostPullRequestResolver extends Disposable implements IAgentHostPullRequestResolver {
	declare readonly _serviceBrand: undefined;

	private readonly _abortController = new AbortController();

	constructor(
		@IAgentHostGitHubService private readonly _gitHubService: IAgentHostGitHubService,
	) {
		super();
		this._register(toDisposable(() => this._abortController.abort()));
	}

	async resolve(pullRequestUrl: string): Promise<IResolvedPullRequest> {
		const parsed = parsePullRequestUrl(pullRequestUrl);
		if (!parsed) {
			throw new Error(localize('agentHost.pullRequest.invalidUrl', "'{0}' is not a valid pull request URL.", pullRequestUrl));
		}

		const store = new DisposableStore();
		try {
			const client = store.add(this._gitHubService.acquireRepositoryClient(this._abortController.signal)).object;
			const { account } = await client.credentials.getCredential(this._abortController.signal);
			// The URL names its own GitHub instance; never query it with an account from another one.
			if (account.host.toLowerCase() !== parsed.apiHost) {
				throw new Error(localize('agentHost.pullRequest.hostMismatch', "Pull request #{0} is not on the GitHub instance of the signed-in account.", parsed.number));
			}

			const subscription = store.add(client.pullRequests.subscribePullRequest({ ...account, owner: parsed.owner, repo: parsed.repo, number: parsed.number }, { core: true, priority: 'interactive' }));
			await subscription.refresh('core', CancellationToken.None, { authoritative: true });
			const core = subscription.resource.snapshot.get().core;
			if (core.status !== 'ready' || !core.value) {
				throw new Error(core.error
					? localize('agentHost.pullRequest.unavailableWithReason', "Pull request #{0} could not be loaded: {1}", parsed.number, core.error.message)
					: localize('agentHost.pullRequest.unavailable', "Pull request #{0} could not be loaded.", parsed.number));
			}

			const pullRequest = core.value;
			if (pullRequest.state === 'merged') {
				throw new Error(localize('agentHost.pullRequest.merged', "Pull request #{0} has already been merged.", parsed.number));
			}
			if (pullRequest.headRepositoryNameWithOwner?.toLowerCase() !== pullRequest.repositoryNameWithOwner.toLowerCase()) {
				throw new Error(localize('agentHost.pullRequest.fork', "Pull request #{0} comes from a fork, which is not supported yet.", parsed.number));
			}

			const webHost = new URL(pullRequestUrl).hostname.toLowerCase();
			return {
				url: pullRequestUrl,
				webHost: webHost === 'www.github.com' ? 'github.com' : webHost,
				owner: parsed.owner,
				repo: parsed.repo,
				number: parsed.number,
				headRef: pullRequest.headRef,
				baseRef: pullRequest.baseRef,
			};
		} finally {
			store.dispose();
		}
	}
}
