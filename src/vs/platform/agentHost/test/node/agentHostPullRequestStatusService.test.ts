/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { observableValue } from '../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { GitHubCredential, GitHubCredentialInvalidation, IGitHubCredentials } from '../../../github/common/githubCredentialService.js';
import type { PullRequestRef, PullRequestSnapshot, PullRequestSubscription } from '../../../github/common/githubPullRequestService.js';
import type { IGitHubService } from '../../../github/common/githubService.js';
import type { IPullRequestResources } from '../../../github/common/pullRequestResourceService.js';
import { mock } from '../../../../base/test/common/mock.js';
import { IAgentHostChangesetSubscriptionService } from '../../common/agentHostChangesetSubscriptionService.js';
import type { IAgentHostGitStateService } from '../../common/agentHostGitStateService.js';
import { SessionStatus, withSessionGitHubState, withSessionGitState, type SessionSummary } from '../../common/state/sessionState.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentHostPullRequestStatusService } from '../../node/agentHostPullRequestStatusService.js';

const account = { host: 'api.github.com', accountId: '1' };
const pullRequestUrl = 'https://github.com/octo/repo/pull/7';

function summary(resource: string): SessionSummary {
	const now = new Date().toISOString();
	return { resource, provider: 'copilot', title: 'PR status', status: SessionStatus.Idle, createdAt: now, modifiedAt: now };
}

function snapshot(ref: PullRequestRef, overrides?: { readonly draft?: boolean; readonly headSha?: string }): PullRequestSnapshot {
	const headSha = overrides?.headSha ?? 'sha1';
	const ready = { status: 'ready', complete: true } as const;
	return {
		ref,
		generation: 1,
		headGeneration: 1,
		core: {
			...ready,
			value: {
				id: 'PR_1',
				repositoryNameWithOwner: 'octo/repo',
				number: 7,
				title: 'Title',
				url: pullRequestUrl,
				state: 'open',
				draft: overrides?.draft ?? false,
				headSha,
				headRef: 'feature',
				baseSha: 'base',
				baseRef: 'main',
			},
		},
		topLevelComments: { status: 'missing', complete: false },
		submittedReviews: { status: 'missing', complete: false },
		inlineComments: { status: 'missing', complete: false },
		reviewThreads: { status: 'missing', complete: false },
		checks: { status: 'missing', complete: false },
		mergeability: {
			...ready,
			headSha,
			value: {
				headSha,
				baseSha: 'base',
				mergeable: 'MERGEABLE',
				mergeStateStatus: 'CLEAN',
				viewerCanUpdate: true,
				viewerCanMerge: true,
				viewerCanEnableAutoMerge: false,
				allowedMergeMethods: ['SQUASH'],
				autoMergeEnabled: false,
				mergeQueueRequired: false,
				queueRequirementKnown: true,
			},
		},
		participants: { status: 'missing', complete: false },
	} as PullRequestSnapshot;
}

/** Records subscription lifecycle so tests can assert nothing is leaked. */
class TestPullRequestResources implements IPullRequestResources {

	readonly subscribed: PullRequestRef[] = [];
	disposedCount = 0;
	private _snapshot = observableValue<PullRequestSnapshot | undefined>('snapshot', undefined);

	get liveSubscriptions(): number { return this.subscribed.length - this.disposedCount; }

	subscribePullRequest(ref: PullRequestRef): PullRequestSubscription {
		this.subscribed.push(ref);
		this._snapshot.set(snapshot(ref), undefined);
		return {
			resource: { ref, snapshot: this._snapshot as never },
			update: () => { },
			refresh: async () => { },
			dispose: () => { this.disposedCount++; },
		} as PullRequestSubscription;
	}

	invalidatePullRequest(): void { }
	clear(): void { }
}

class TestCredentials implements IGitHubCredentials {

	private readonly _onDidInvalidate = new Emitter<GitHubCredentialInvalidation>();
	readonly onDidInvalidate = this._onDidInvalidate.event;

	/** Resolved by the test so a sync can be suspended mid-flight. */
	pending: DeferredPromise<void> | undefined;

	async getCredential(): Promise<GitHubCredential> {
		if (this.pending) {
			await this.pending.p;
		}
		return { account, token: 'token', generation: 1, signal: new AbortController().signal };
	}

	async resolveCredential(): Promise<GitHubCredential> { throw new Error('not implemented'); }
	handleRequestError(): void { }

	invalidate(reason: GitHubCredentialInvalidation['reason']): void {
		this._onDidInvalidate.fire({ credential: { account, token: 'token', generation: 1, signal: new AbortController().signal }, reason });
	}

	dispose(): void { this._onDidInvalidate.dispose(); }
}

class TestChangesetSubscriptions implements IAgentHostChangesetSubscriptionService {

	declare readonly _serviceBrand: undefined;

	private readonly _subscriptions = new Map<string, Set<string>>();
	private readonly _onDidChange = new Emitter<string>();
	readonly onDidChangeSessionSubscriptions = this._onDidChange.event;

	getSessionSubscriptions(session: string): ReadonlySet<string> {
		return this._subscriptions.get(session) ?? new Set();
	}

	addSubscription(session: string, changeset: string): void {
		let set = this._subscriptions.get(session);
		if (!set) {
			set = new Set();
			this._subscriptions.set(session, set);
		}
		set.add(changeset);
		if (set.size === 1) {
			this._onDidChange.fire(session);
		}
	}

	removeSubscription(session: string, changeset: string): void {
		const set = this._subscriptions.get(session);
		if (!set) {
			return;
		}
		set.delete(changeset);
		if (set.size === 0) {
			this._subscriptions.delete(session);
			this._onDidChange.fire(session);
		}
	}

	clearSessionSubscriptions(session: string): void {
		if (this._subscriptions.delete(session)) {
			this._onDidChange.fire(session);
		}
	}

	dispose(): void { this._onDidChange.dispose(); }
}

suite('AgentHostPullRequestStatusService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createHarness() {
		const logService = new NullLogService();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const subscriptions = disposables.add(new TestChangesetSubscriptions());
		const credentials = disposables.add(new TestCredentials());
		const resources = new TestPullRequestResources();
		const gitHubService = new class extends mock<IGitHubService>() {
			override readonly credentials = credentials;
			override readonly pullRequests = resources;
		}();
		const gitStateService = new class extends mock<IAgentHostGitStateService>() {
			override readonly onDidRefreshSessionGitState = Event.None;
			override readonly onDidChangeSessionGitHubState = Event.None;
		}();
		const service = disposables.add(new AgentHostPullRequestStatusService(
			stateManager,
			subscriptions,
			gitStateService,
			gitHubService,
			logService,
		));

		const session = 'copilot:/pr-status';
		stateManager.createSession(summary(session));
		// A session whose branch carries a pull request, which is the only
		// shape the watcher is eligible for.
		stateManager.setSessionMeta(session, withSessionGitHubState(
			withSessionGitState(undefined, { branchName: 'feature' }),
			{ pullRequestUrls: [pullRequestUrl], pullRequestBranchName: 'feature' },
		));

		return { service, stateManager, subscriptions, credentials, resources, session };
	}

	test('watches only while a client is subscribed to the session changes', async () => {
		const { service, subscriptions, resources, session } = createHarness();

		const beforeSubscribe = resources.liveSubscriptions;
		subscriptions.addSubscription(session, `${session}/changes`);
		await waitForWatch(resources);
		const whileSubscribed = { live: resources.liveSubscriptions, status: service.getPullRequestStatus(session)?.state };

		subscriptions.removeSubscription(session, `${session}/changes`);

		assert.deepStrictEqual({
			beforeSubscribe,
			whileSubscribed,
			afterUnsubscribe: resources.liveSubscriptions,
			statusAfterUnsubscribe: service.getPullRequestStatus(session),
		}, {
			beforeSubscribe: 0,
			whileSubscribed: { live: 1, status: 'open' },
			afterUnsubscribe: 0,
			statusAfterUnsubscribe: undefined,
		});
	});

	test('does not install a watch when the session stopped being eligible mid-sync', async () => {
		const { service, subscriptions, credentials, resources, session } = createHarness();

		// Suspend credential resolution so the session can lose its subscriber
		// while the first sync is still in flight.
		credentials.pending = new DeferredPromise<void>();
		subscriptions.addSubscription(session, `${session}/changes`);
		subscriptions.removeSubscription(session, `${session}/changes`);
		credentials.pending.complete();
		credentials.pending = undefined;
		await pump();

		assert.deepStrictEqual({
			live: resources.liveSubscriptions,
			status: service.getPullRequestStatus(session),
		}, {
			live: 0,
			status: undefined,
		});
	});

	test('rebuilds the watch when the credential account is invalidated', async () => {
		const { subscriptions, credentials, resources, session } = createHarness();

		subscriptions.addSubscription(session, `${session}/changes`);
		await waitForWatch(resources);

		credentials.invalidate('account');
		await pump();

		assert.deepStrictEqual({
			// The dead subscription is dropped and a fresh one installed, so a
			// disposed resource can never keep publishing stale operations.
			subscribed: resources.subscribed.length,
			disposed: resources.disposedCount,
			live: resources.liveSubscriptions,
		}, {
			subscribed: 2,
			disposed: 1,
			live: 1,
		});
	});

	test('keeps the watch when the credential is merely refreshed', async () => {
		const { subscriptions, credentials, resources, session } = createHarness();

		subscriptions.addSubscription(session, `${session}/changes`);
		await waitForWatch(resources);

		// The resource service keeps these entries and refreshes them in place.
		credentials.invalidate('authentication');
		await pump();

		assert.deepStrictEqual({ subscribed: resources.subscribed.length, disposed: resources.disposedCount }, { subscribed: 1, disposed: 0 });
	});
});

/** Lets queued microtasks (the serialized per-session sync) settle. */
async function pump(): Promise<void> {
	for (let i = 0; i < 10; i++) {
		await Promise.resolve();
	}
}

async function waitForWatch(resources: TestPullRequestResources): Promise<void> {
	for (let i = 0; i < 50 && resources.liveSubscriptions === 0; i++) {
		await pump();
	}
}
