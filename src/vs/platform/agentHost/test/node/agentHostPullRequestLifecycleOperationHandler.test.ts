/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { IGitHubService } from '../../../github/common/githubService.js';
import type { PullRequestMergeOptions, PullRequestMergePreparation } from '../../../github/common/githubPullRequestMutationService.js';
import type { IPullRequestMutations } from '../../../github/common/pullRequestMutationService.js';
import { AgentMergeConfigKey } from '../../common/agentMerge.js';
import { buildSessionChangesetUri } from '../../common/changesetUri.js';
import type { IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostPullRequestLifecycleOperationHandler, type PullRequestLifecycleAction } from '../../node/agentHostPullRequestLifecycleOperationHandler.js';
import type { IAgentHostPullRequestStatus, IAgentHostPullRequestStatusService } from '../../node/agentHostPullRequestStatusService.js';

const sessionUri = 'copilot:/pr-lifecycle';
const channel = buildSessionChangesetUri(sessionUri);
const pullRequestUrl = 'https://github.com/octo/repo/pull/7';

function status(overrides?: Partial<IAgentHostPullRequestStatus>): IAgentHostPullRequestStatus {
	return {
		pullRequestId: 'PR_1',
		number: 7,
		url: pullRequestUrl,
		headSha: 'sha1',
		state: 'open',
		draft: false,
		mergeReady: true,
		viewerCanEnableAutoMerge: false,
		autoMergeEnabled: false,
		allowedMergeMethods: ['SQUASH'],
		...overrides,
	};
}

function preparation(overrides?: { readonly mergeQueueRequired?: boolean; readonly allowedMergeMethods?: readonly ('MERGE' | 'SQUASH' | 'REBASE')[] }): PullRequestMergePreparation {
	return {
		token: 'token',
		ref: { host: 'api.github.com', accountId: '1', owner: 'octo', repo: 'repo', number: 7 },
		expectedHeadSha: 'sha1',
		resourceGeneration: 1,
		headGeneration: 1,
		snapshot: {
			mergeability: {
				status: 'ready',
				complete: true,
				value: {
					mergeQueueRequired: overrides?.mergeQueueRequired ?? false,
					allowedMergeMethods: overrides?.allowedMergeMethods ?? ['SQUASH'],
				},
			},
		},
	} as unknown as PullRequestMergePreparation;
}

interface IRecordedCalls {
	readonly calls: string[];
	prepareMergeError?: Error;
}

suite('AgentHostPullRequestLifecycleOperationHandler', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createHandler(
		action: PullRequestLifecycleAction,
		options?: {
			readonly status?: IAgentHostPullRequestStatus;
			readonly preparation?: PullRequestMergePreparation;
			readonly prepareMergeError?: Error;
			readonly mergeMethod?: string;
		},
	): { readonly handler: AgentHostPullRequestLifecycleOperationHandler; readonly recorded: IRecordedCalls; readonly refreshes: string[] } {
		const recorded: IRecordedCalls = { calls: [] };
		const refreshes: string[] = [];
		const currentStatus = options?.status === null ? undefined : options?.status ?? status();

		const mutations = new class extends mock<IPullRequestMutations>() {
			override async prepareMerge(): Promise<PullRequestMergePreparation> {
				recorded.calls.push('prepareMerge');
				if (options?.prepareMergeError) {
					throw options.prepareMergeError;
				}
				return options?.preparation ?? preparation();
			}
			override async merge(_p: PullRequestMergePreparation, mergeOptions: PullRequestMergeOptions) {
				recorded.calls.push(`merge:${mergeOptions.method}`);
				return { outcome: 'succeeded' as const };
			}
			override async enqueue() {
				recorded.calls.push('enqueue');
				return { outcome: 'succeeded' as const, mergeQueueEntryId: 'entry' };
			}
			override async markReadyForReview(): Promise<void> { recorded.calls.push('markReadyForReview'); }
			override async enableAutoMerge(): Promise<void> { recorded.calls.push('enableAutoMerge'); }
			override async disableAutoMerge(): Promise<void> { recorded.calls.push('disableAutoMerge'); }
		}();

		const gitHubService = new class extends mock<IGitHubService>() {
			override readonly mutations = mutations;
			override readonly credentials = {
				onDidInvalidate: Event.None,
				async getCredential() {
					return { account: { host: 'api.github.com', accountId: '1' }, token: 't', generation: 1, signal: new AbortController().signal };
				},
				async resolveCredential(): Promise<never> { throw new Error('not implemented'); },
				handleRequestError() { },
			};
		}();

		const statusService: IAgentHostPullRequestStatusService = {
			_serviceBrand: undefined,
			onDidChangePullRequestStatus: Event.None,
			getPullRequestStatus: () => currentStatus,
			refresh: async (sessionKey: string) => { refreshes.push(sessionKey); },
			dispose: () => { },
		};

		const configurationService = new class extends mock<IAgentConfigurationService>() {
			override getRootValue(_schema: never, key: string) {
				return (key === AgentMergeConfigKey.MergeMethod ? options?.mergeMethod : undefined) as never;
			}
		}();

		const handler = new AgentHostPullRequestLifecycleOperationHandler(
			action,
			configurationService,
			statusService,
			gitHubService,
			new NullLogService(),
		);
		return { handler, recorded, refreshes };
	}

	function invoke(handler: AgentHostPullRequestLifecycleOperationHandler): Promise<unknown> {
		return handler.invoke({ channel, operationId: 'pr-merge' }, CancellationToken.None);
	}

	test('merges directly with the repository-allowed method', async () => {
		const { handler, recorded, refreshes } = createHandler('merge');
		disposables.add({ dispose: () => { } });

		await invoke(handler);

		// The preparation gate runs before the merge, and the status is
		// refreshed afterwards so the button bar re-derives.
		assert.deepStrictEqual({ calls: recorded.calls, refreshed: refreshes.length }, { calls: ['prepareMerge', 'merge:SQUASH'], refreshed: 1 });
	});

	test('enqueues instead of merging when the repository requires a merge queue', async () => {
		const { handler, recorded } = createHandler('merge', {
			preparation: preparation({ mergeQueueRequired: true }),
		});

		await invoke(handler);

		assert.deepStrictEqual(recorded.calls, ['prepareMerge', 'enqueue']);
	});

	test('honours the configured merge method and rejects one the repository forbids', async () => {
		const allowed = createHandler('merge', {
			mergeMethod: 'rebase',
			preparation: preparation({ allowedMergeMethods: ['SQUASH', 'REBASE'] }),
		});
		await invoke(allowed.handler);

		const forbidden = createHandler('merge', {
			mergeMethod: 'rebase',
			preparation: preparation({ allowedMergeMethods: ['SQUASH'] }),
		});
		const rejection = await invoke(forbidden.handler).then(() => undefined, error => error as Error);

		assert.deepStrictEqual({
			allowed: allowed.recorded.calls,
			forbidden: forbidden.recorded.calls,
			// Never falls back to a method the repository did not allow.
			rejected: rejection?.message,
			refreshedAfterFailure: forbidden.refreshes.length,
		}, {
			allowed: ['prepareMerge', 'merge:REBASE'],
			forbidden: ['prepareMerge'],
			rejected: 'The repository does not allow the configured merge method.',
			refreshedAfterFailure: 1,
		});
	});

	test('surfaces a stale preparation rather than merging', async () => {
		const { handler, recorded, refreshes } = createHandler('merge', {
			prepareMergeError: new Error('Merge preparation was invalidated by newer pull request state'),
		});

		const rejection = await invoke(handler).then(() => undefined, error => error as Error);

		assert.deepStrictEqual({
			calls: recorded.calls,
			rejected: rejection?.message,
			refreshed: refreshes.length,
		}, {
			calls: ['prepareMerge'],
			rejected: 'Merge preparation was invalidated by newer pull request state',
			refreshed: 1,
		});
	});

	test('refuses to act while the pull request state is unknown', async () => {
		const { handler, recorded } = createHandler('merge', { status: null as never });

		const rejection = await invoke(handler).then(() => undefined, error => error as Error);

		assert.deepStrictEqual({ calls: recorded.calls, rejected: rejection?.message }, {
			calls: [],
			rejected: 'The pull request state is not available yet.',
		});
	});

	test('runs the non-merge lifecycle actions through their own mutations', async () => {
		const markReady = createHandler('mark-ready', { status: status({ draft: true }) });
		const enable = createHandler('enable-auto-merge', { status: status({ viewerCanEnableAutoMerge: true }) });
		const disable = createHandler('disable-auto-merge', { status: status({ autoMergeEnabled: true }) });

		await invoke(markReady.handler);
		await invoke(enable.handler);
		await invoke(disable.handler);

		assert.deepStrictEqual({
			markReady: markReady.recorded.calls,
			enable: enable.recorded.calls,
			disable: disable.recorded.calls,
		}, {
			markReady: ['markReadyForReview'],
			enable: ['enableAutoMerge'],
			disable: ['disableAutoMerge'],
		});
	});
});
