/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { derived, IObservable } from '../../../../../base/common/observable.js';
import { PullRequestChecks } from '../../../../../platform/github/common/githubPullRequestService.js';
import { IWorkbenchGitHubService } from '../../../../../workbench/services/github/common/githubService.js';

/** A live subscription to the checks of a pull request. */
export interface IPullRequestChecksSubscription extends IDisposable {
	/**
	 * The checks of the head the shared resources last read, kept while they
	 * reread them, or `undefined` until they were first read.
	 */
	readonly checks: IObservable<PullRequestChecks | undefined>;
	refresh(authoritative: boolean, token?: CancellationToken): Promise<void>;
}

/**
 * Tells which checks of a pull request are required, and which checks a
 * required check that has not finished waits for. They come from the shared
 * GitHub pull request resources, which the agent host reads the same way, so
 * every surface agrees on which failures count.
 */
export interface IPullRequestChecksSource {
	/**
	 * @param headSha The head whose checks the subscriber reads. A refresh
	 * first rereads the pull request while the shared resources have not seen
	 * that head yet, as right after a push, since they only read the checks of
	 * the head they last saw.
	 */
	subscribe(owner: string, repo: string, prNumber: number, headSha: string, signal: AbortSignal): Promise<IPullRequestChecksSubscription>;
}

export class PullRequestChecksSource implements IPullRequestChecksSource {

	constructor(
		@IWorkbenchGitHubService private readonly _gitHubService: IWorkbenchGitHubService,
	) { }

	async subscribe(owner: string, repo: string, prNumber: number, headSha: string, signal: AbortSignal): Promise<IPullRequestChecksSubscription> {
		const reference = await this._gitHubService.acquireDefaultAccountClient(signal);
		try {
			const client = reference.object;
			const { account } = await client.credentials.getCredential(signal);
			signal.throwIfAborted();
			const subscription = client.pullRequests.subscribePullRequest({ ...account, owner, repo, number: prNumber }, {
				priority: 'background',
				checks: { required: true, includeOptional: true },
			});
			return {
				checks: derived(reader => subscription.resource.snapshot.read(reader).checks.value),
				refresh: async (authoritative, token) => {
					if (subscription.resource.snapshot.get().core.value?.headSha !== headSha) {
						await subscription.refresh('core', token, { authoritative });
					}
					await subscription.refresh('checks', token, { authoritative });
				},
				dispose: () => {
					subscription.dispose();
					reference.dispose();
				},
			};
		} catch (error) {
			reference.dispose();
			throw error;
		}
	}
}
