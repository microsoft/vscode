/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { Event } from '../../../../base/common/event.js';
import { ImmortalReference } from '../../../../base/common/lifecycle.js';
import { mock, upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { IGitHubClient } from '../../../github/common/githubService.js';
import { IGitHubAccountClient } from '../../../github/common/account/account.js';
import { IPullRequestsClient } from '../../../github/common/core/pullRequests.js';
import { IAgentHostGitHubService } from '../../node/agentHostGitHubService.js';
import { createTestGitHubEndpointService } from './testGitHubEndpointService.js';
import type { PullRequestMergeOptions, PullRequestMergePreparation, PullRequestMutationApi } from '../../../github/common/githubPullRequestMutationService.js';
import { AgentMergeConfigKey } from '../../common/agentMerge.js';
import { IAgentHostCredentialSource } from '../../common/agentHostCredentials.js';
import { buildBranchChangesetUri, buildFolderChangesetOwnerUri, buildSessionChangesetUri } from '../../common/changesetUri.js';
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
	legacyAcquisitions: number;
	apiAcquisitions: number;
	apiDisposals: number;
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
			readonly writeError?: Error;
			readonly credentialSource?: IAgentHostCredentialSource;
			/** Status per owner key; takes precedence over `status`. */
			readonly statusByOwner?: ReadonlyMap<string, IAgentHostPullRequestStatus>;
		},
	): { readonly handler: AgentHostPullRequestLifecycleOperationHandler; readonly recorded: IRecordedCalls; readonly refreshes: string[]; readonly merged: string[] } {
		const recorded: IRecordedCalls = { calls: [], legacyAcquisitions: 0, apiAcquisitions: 0, apiDisposals: 0 };
		const refreshes: string[] = [];
		const merged: string[] = [];
		const currentStatus = options?.status === null ? undefined : options?.status ?? status();

		const mutations = new class extends mock<PullRequestMutationApi>() {
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
		}();

		const legacyClient = new class extends mock<IGitHubClient>() {
			override readonly mutations = mutations;
			override readonly credentials = {
				onDidInvalidate: Event.None,
				async getCredential() {
					return { account: { host: 'api.github.com', accountId: '1' }, token: 't', generation: 1, signal: new AbortController().signal };
				},
				handleRequestError() { },
			};
		}();
		const pullRequests = new class extends mock<IPullRequestsClient>() {
			override async markReadyForReview(id: string) {
				recorded.calls.push('markReadyForReview');
				if (options?.writeError) { throw options.writeError; }
				return { id, isDraft: false };
			}
			override async enableAutoMerge(id: string) {
				recorded.calls.push('enableAutoMerge');
				if (options?.writeError) { throw options.writeError; }
				return { id, merged: false, autoMergeRequest: null };
			}
			override async disableAutoMerge(id: string) {
				recorded.calls.push('disableAutoMerge');
				if (options?.writeError) { throw options.writeError; }
				return { id, merged: false, autoMergeRequest: null };
			}
		}();
		const gitHubService = new class extends mock<IAgentHostGitHubService>() {
			override captureSessionCredentialSource(_session: string, source?: IAgentHostCredentialSource) { return source; }
			override acquireRepositoryClient(signal: AbortSignal, source?: IAgentHostCredentialSource) {
				signal.throwIfAborted();
				assert.strictEqual(source, options?.credentialSource);
				recorded.legacyAcquisitions++;
				return new ImmortalReference(legacyClient);
			}
			override acquireRepositoryApiClient(signal: AbortSignal, source?: IAgentHostCredentialSource) {
				signal.throwIfAborted();
				assert.strictEqual(source, options?.credentialSource);
				recorded.apiAcquisitions++;
				return upcastPartial<IGitHubAccountClient>({
					pullRequests,
					dispose: () => { recorded.apiDisposals++; },
				});
			}
		}();

		const statusService: IAgentHostPullRequestStatusService = {
			_serviceBrand: undefined,
			onDidChangePullRequestStatus: Event.None,
			getPullRequestStatus: key => options?.statusByOwner ? options.statusByOwner.get(key) : currentStatus,
			markPullRequestMerged: (sessionKey, url) => { merged.push(`${sessionKey}|${url}`); },
			refresh: async (sessionKey: string, source?: IAgentHostCredentialSource) => {
				assert.strictEqual(source, options?.credentialSource);
				refreshes.push(sessionKey);
			},
			resolveForLifecycle: async () => currentStatus,
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
			createTestGitHubEndpointService(),
			new NullLogService(),
			disposables.add(new AgentHostStateManager(new NullLogService())),
		);
		return { handler, recorded, refreshes, merged };
	}

	function invoke(handler: AgentHostPullRequestLifecycleOperationHandler): Promise<unknown> {
		return handler.invoke({ channel, operationId: 'pr-merge' }, CancellationToken.None);
	}

	test('merges directly with the repository-allowed method', async () => {
		const { handler, recorded, refreshes, merged } = createHandler('merge');
		disposables.add({ dispose: () => { } });

		await invoke(handler);

		// The preparation gate runs before the merge, and the status is
		// refreshed afterwards so the button bar re-derives.
		assert.deepStrictEqual({ calls: recorded.calls, refreshed: refreshes.length, merged }, {
			calls: ['prepareMerge', 'merge:SQUASH'],
			refreshed: 1,
			merged: [`${sessionUri}|${pullRequestUrl}`],
		});
	});

	test('acts on the pull request of the folder whose changes the action was invoked on', async () => {
		const folderOwner = buildFolderChangesetOwnerUri(sessionUri, 'other-folder');
		const otherPullRequestUrl = 'https://github.com/octo/tools/pull/9';
		const { handler, recorded, refreshes, merged } = createHandler('merge', {
			statusByOwner: new Map([[folderOwner, status({ url: otherPullRequestUrl, number: 9 })]]),
		});

		await handler.invoke({ channel: buildBranchChangesetUri(folderOwner), operationId: 'pr-merge' }, CancellationToken.None);

		assert.deepStrictEqual({ calls: recorded.calls, refreshes, merged }, {
			calls: ['prepareMerge', 'merge:SQUASH'],
			refreshes: [folderOwner],
			merged: [`${folderOwner}|${otherPullRequestUrl}`],
		});
	});

	test('enqueues instead of merging when the repository requires a merge queue', async () => {
		const { handler, recorded, merged } = createHandler('merge', {
			preparation: preparation({ mergeQueueRequired: true }),
		});

		await invoke(handler);

		assert.deepStrictEqual({ calls: recorded.calls, merged }, { calls: ['prepareMerge', 'enqueue'], merged: [] });
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

	test('uses only portable clients for non-merge lifecycle actions and releases their leases', async () => {
		const markReady = createHandler('mark-ready', { status: status({ draft: true }) });
		const enable = createHandler('enable-auto-merge', { status: status({ viewerCanEnableAutoMerge: true }) });
		const disable = createHandler('disable-auto-merge', { status: status({ autoMergeEnabled: true }) });

		await invoke(markReady.handler);
		await invoke(enable.handler);
		await invoke(disable.handler);

		assert.deepStrictEqual([markReady, enable, disable].map(value => value.recorded), [
			{ calls: ['markReadyForReview'], legacyAcquisitions: 0, apiAcquisitions: 1, apiDisposals: 1 },
			{ calls: ['enableAutoMerge'], legacyAcquisitions: 0, apiAcquisitions: 1, apiDisposals: 1 },
			{ calls: ['disableAutoMerge'], legacyAcquisitions: 0, apiAcquisitions: 1, apiDisposals: 1 },
		]);
	});

	for (const action of ['mark-ready', 'enable-auto-merge', 'disable-auto-merge', 'merge'] as const) {
		test(`${action} retains the operation sponsor through mutation and refresh`, async () => {
			const source: IAgentHostCredentialSource = {
				getCredential: request => ({ resource: request.resource, token: 'sponsor-token', revision: 1, expiresAt: undefined }),
			};
			const { handler, recorded, refreshes } = createHandler(action, { credentialSource: source });
			await handler.invoke({ channel, operationId: action }, CancellationToken.None, source);
			assert.deepStrictEqual({
				legacy: recorded.legacyAcquisitions, api: recorded.apiAcquisitions, released: recorded.apiDisposals, refreshes,
			}, { legacy: action === 'merge' ? 1 : 0, api: action === 'merge' ? 0 : 1, released: action === 'merge' ? 0 : 1, refreshes: [sessionUri] });
		});
	}

	for (const invalid of [{ url: 'https://other.example.test/octo/repo/pull/7' }, { pullRequestId: undefined }]) {
		test(`rejects an unsafe lifecycle target ${JSON.stringify(invalid)}`, async () => {
			const { handler, recorded } = createHandler('mark-ready', { status: status(invalid) });
			await assert.rejects(invoke(handler));
			assert.deepStrictEqual(recorded, { calls: [], legacyAcquisitions: 0, apiAcquisitions: 1, apiDisposals: 1 });
		});
	}

	test('refreshes status after a failed portable write without retrying it', async () => {
		const error = new Error('Write failed');
		const { handler, recorded, refreshes } = createHandler('disable-auto-merge', { writeError: error });
		await assert.rejects(invoke(handler), error);
		assert.deepStrictEqual({ recorded, refreshes }, {
			recorded: { calls: ['disableAutoMerge'], legacyAcquisitions: 0, apiAcquisitions: 1, apiDisposals: 1 },
			refreshes: [sessionUri],
		});
	});

	test('does not acquire a client for an already cancelled lifecycle action', async () => {
		const source = disposables.add(new CancellationTokenSource());
		source.cancel();
		const { handler, recorded } = createHandler('mark-ready');
		await assert.rejects(handler.invoke({ channel, operationId: 'pr-mark-ready' }, source.token), { name: 'AbortError' });
		assert.deepStrictEqual(recorded, { calls: [], legacyAcquisitions: 0, apiAcquisitions: 0, apiDisposals: 0 });
	});
});
