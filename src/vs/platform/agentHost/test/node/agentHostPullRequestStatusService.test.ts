/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { ISettableObservable, observableValue } from '../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { GitHubCredential, GitHubCredentialInvalidation, IGitHubCredentials } from '../../../github/common/githubCredentialService.js';
import type { PullRequestFragment, PullRequestRef, PullRequestSnapshot, PullRequestSubscription, PullRequestSubscriptionOptions } from '../../../github/common/githubPullRequestService.js';
import type { IGitHubClient } from '../../../github/common/githubService.js';
import { createTestGitHubService } from './testGitHubService.js';
import type { IPullRequestResources } from '../../../github/common/pullRequestResourceService.js';
import { mock } from '../../../../base/test/common/mock.js';
import { IAgentHostChangesetSubscriptionService } from '../../common/agentHostChangesetSubscriptionService.js';
import type { IAgentHostGitStateService } from '../../common/agentHostGitStateService.js';
import { buildChatUri, buildDefaultChatUri, readSessionGitHubState, SessionStatus, withSessionGitHubState, withSessionGitState, type ISessionGitHubState, type ISessionGitState, type SessionSummary } from '../../common/state/sessionState.js';
import { buildFolderChangesetOwnerUri } from '../../common/changesetUri.js';
import { getWorkingDirectoryScopeId } from '../../common/agentHostWorkingDirectories.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { AgentHostStateManager, creationTimeChatStorageResource } from '../../node/agentHostStateManager.js';
import { AgentHostPullRequestStatusService } from '../../node/agentHostPullRequestStatusService.js';
import { createTestChatOwnershipService } from './chatOwnershipTestUtils.js';
import { captureCredentialSource, type IAgentHostCredentialSource } from '../../common/agentHostCredentials.js';
import { GITHUB_REPO_PROTECTED_RESOURCE } from '../../common/agent.js';
import { AgentHostGitHubService, IAgentHostGitHubService } from '../../node/agentHostGitHubService.js';
import { AgentHostAuthenticationService, type IAgentHostAuthenticationService } from '../../node/agentHostAuthenticationService.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { createTestGitHubEndpointService } from './testGitHubEndpointService.js';
import { ImmortalReference } from '../../../../base/common/lifecycle.js';
import { GitHubRequestError } from '../../../github/common/githubTypes.js';

const account = { host: 'api.github.com', accountId: '1' };
const pullRequestUrl = 'https://github.com/octo/repo/pull/7';

const REPOSITORY = 'file:///repo';

function summary(resource: string): SessionSummary & { readonly defaultChat: string } {
	const now = new Date().toISOString();
	return { resource, provider: 'copilot', title: 'PR status', status: SessionStatus.Idle, createdAt: now, modifiedAt: now, workingDirectories: [REPOSITORY], defaultChat: buildDefaultChatUri(resource) };
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
				number: ref.number,
				title: 'Title',
				url: `https://github.com/${ref.owner}/${ref.repo}/pull/${ref.number}`,
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
	} as PullRequestSnapshot;
}

function agentMergeReadySnapshot(ref: PullRequestRef): PullRequestSnapshot {
	const result = snapshot(ref, { draft: true });
	const ready = { status: 'ready', complete: true } as const;
	return {
		...result,
		topLevelComments: { ...ready, value: [] },
		submittedReviews: { ...ready, value: [] },
		reviewThreads: { ...ready, headSha: 'sha1', value: [] },
		checks: {
			...ready,
			headSha: 'sha1',
			value: {
				headSha: 'sha1',
				requirednessComplete: true,
				expectedSuites: [],
				expectedSuitesComplete: true,
				checks: [],
			},
		},
	};
}

/** Records subscription lifecycle so tests can assert nothing is leaked. */
class TestPullRequestResources implements IPullRequestResources {

	readonly subscribed: PullRequestRef[] = [];
	readonly subscriptionOptions: PullRequestSubscriptionOptions[] = [];
	disposedCount = 0;
	/** One snapshot per subscription, so pull requests of different folders stay apart. */
	private readonly _snapshots: ISettableObservable<PullRequestSnapshot | undefined>[] = [];
	private _nextSubscriptionSnapshot: PullRequestSnapshot | undefined;
	readonly refreshedFragments: (PullRequestFragment | undefined)[] = [];
	refreshHandler: (() => Promise<void>) | undefined;

	get liveSubscriptions(): number { return this.subscribed.length - this.disposedCount; }

	subscribePullRequest(ref: PullRequestRef, options: PullRequestSubscriptionOptions): PullRequestSubscription {
		this.subscribed.push(ref);
		this.subscriptionOptions.push(options);
		const subscriptionSnapshot = observableValue<PullRequestSnapshot | undefined>('snapshot', this._nextSubscriptionSnapshot ?? snapshot(ref));
		this._snapshots.push(subscriptionSnapshot);
		this._nextSubscriptionSnapshot = undefined;
		return {
			resource: { ref, snapshot: subscriptionSnapshot as never },
			update: next => this.subscriptionOptions.push(next),
			refresh: async fragment => {
				this.refreshedFragments.push(fragment);
				await this.refreshHandler?.();
			},
			dispose: () => { this.disposedCount++; },
		} as PullRequestSubscription;
	}

	setSnapshot(value: PullRequestSnapshot): void {
		for (const subscriptionSnapshot of this._snapshots) {
			subscriptionSnapshot.set(value, undefined);
		}
	}

	setSnapshotAt(index: number, value: PullRequestSnapshot): void {
		this._snapshots[index]?.set(value, undefined);
	}

	setNextSubscriptionSnapshot(value: PullRequestSnapshot): void {
		this._nextSubscriptionSnapshot = value;
	}

	invalidatePullRequest(): void { }
	clear(): void { }
}

class TestCredentials implements IGitHubCredentials {

	private readonly _onDidInvalidate = new Emitter<GitHubCredentialInvalidation>();
	readonly onDidInvalidate = this._onDidInvalidate.event;
	private _controller = new AbortController();
	lookups = 0;

	/** Resolved by the test so a sync can be suspended mid-flight. */
	pending: DeferredPromise<void> | undefined;

	async getCredential(): Promise<GitHubCredential> {
		this.lookups++;
		const signal = this._controller.signal;
		if (this.pending) {
			await this.pending.p;
		}
		return { account, token: 'token', generation: 1, signal };
	}

	handleRequestError(): void { }

	invalidate(reason: GitHubCredentialInvalidation['reason']): void {
		const controller = this._controller;
		this._controller = new AbortController();
		controller.abort();
		this._onDidInvalidate.fire({ credential: { account, token: 'token', generation: 1, signal: controller.signal }, reason });
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

	function createHarness(getSource?: () => IAgentHostCredentialSource, authentication?: IAgentHostAuthenticationService) {
		const statusLogs: string[] = [];
		const errors: string[] = [];
		const logService = new class extends NullLogService {
			override info(message: string) { statusLogs.push(message); }
			override error(message: string) { errors.push(message); }
		}();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const subscriptions = disposables.add(new TestChangesetSubscriptions());
		const credentials = disposables.add(new TestCredentials());
		const resources = new TestPullRequestResources();
		const gitHubStates: ISessionGitHubState[] = [];
		const publishedStateKeys: string[] = [];
		const chatGitStates = new Map<string, ISessionGitState>();
		const legacyService = createTestGitHubService(new class extends mock<IGitHubClient>() {
			override readonly credentials = credentials;
			override readonly pullRequests = resources;
		}(), Event.signal(Event.filter(credentials.onDidInvalidate, event => event.reason === 'account' || event.reason === 'endpoint')));
		const observedTokens: string[] = [];
		const gitHubService = authentication ? disposables.add(new class extends AgentHostGitHubService {
			override acquireRepositoryClient(signal: AbortSignal, source?: IAgentHostCredentialSource, session?: string) {
				return legacyService.acquireRepositoryClient(signal, source, session);
			}
		}({ fetch: async () => { throw new Error('Unexpected GitHub network request'); } }, authentication, createTestGitHubEndpointService(), logService, NullTelemetryService)) : getSource ? new class extends mock<IAgentHostGitHubService>() {
			override readonly onDidChangeRepositoryClient = legacyService.onDidChangeRepositoryClient;
			override getAgentMergeCredentialBinding(chat: string) { return legacyService.getAgentMergeCredentialBinding(chat); }
			override getAgentMergeCredentialSource(chat: string) { return legacyService.getAgentMergeCredentialSource(chat); }
			override bindAgentMergeCredentialSource(session: string, chat: string, source: IAgentHostCredentialSource | undefined) {
				legacyService.bindAgentMergeCredentialSource(session, chat, source);
			}
			override captureSessionCredentialSource(_session: string, source?: IAgentHostCredentialSource) {
				return captureCredentialSource(source ?? getSource(), [GITHUB_REPO_PROTECTED_RESOURCE]);
			}
			override acquireRepositoryClient(_signal: AbortSignal, source?: IAgentHostCredentialSource) {
				return new ImmortalReference(new class extends mock<IGitHubClient>() {
					override readonly pullRequests = resources;
					override readonly credentials = new class extends mock<IGitHubCredentials>() {
						override readonly onDidInvalidate = credentials.onDidInvalidate;
						override async getCredential(signal: AbortSignal) {
							signal.throwIfAborted();
							const result = await credentials.getCredential();
							const scoped = source?.getCredential({ resource: GITHUB_REPO_PROTECTED_RESOURCE.resource, scopes: GITHUB_REPO_PROTECTED_RESOURCE.scopes_supported });
							if (!scoped) {
								throw new GitHubRequestError('Captured source is unavailable', 'authentication');
							}
							observedTokens.push(scoped.token);
							return { ...result, token: scoped.token };
						}
					}();
				}());
			}
		}() : legacyService;
		const gitStateService = new class extends mock<IAgentHostGitStateService>() {
			override readonly onDidRefreshSessionGitState = Event.None;
			override readonly onDidChangeSessionGitHubState = Event.None;
			override readonly getSessionGitState = (key: string) => chatGitStates.get(key);
			override async setSessionGitHubState(sessionKey: string, state: ISessionGitHubState): Promise<void> {
				gitHubStates.push(state);
				publishedStateKeys.push(sessionKey);
				const currentMeta = stateManager.getSessionState(sessionKey)?._meta;
				stateManager.setSessionMeta(sessionKey, withSessionGitHubState(currentMeta, REPOSITORY, {
					...readSessionGitHubState(currentMeta, REPOSITORY),
					...state,
				}));
			}
		}();
		const service = disposables.add(new AgentHostPullRequestStatusService(
			stateManager,
			subscriptions,
			gitStateService,
			gitHubService,
			logService,
			createTestChatOwnershipService(stateManager),
		));

		const session = 'copilot:/pr-status';
		stateManager.createSession(summary(session));
		// A session whose branch carries a pull request, which is the only
		// shape the watcher is eligible for.
		stateManager.setSessionMeta(session, withSessionGitHubState(
			withSessionGitState(undefined, { branchName: 'feature' }),
			REPOSITORY,
			{ pullRequestUrls: [pullRequestUrl], pullRequestBranchName: 'feature' },
		));

		return { service, stateManager, subscriptions, credentials, resources, gitHubStates, publishedStateKeys, chatGitStates, session, observedTokens, statusLogs, errors };
	}

	test('logs unavailable real background sponsorship without creating a legacy watcher', async () => {
		const authentication = disposables.add(new AgentHostAuthenticationService(new NullLogService()));
		const session = 'copilot:/pr-status';
		authentication.restoreSessionCredentialPrincipal(session, { apiOrigin: 'https://api.github.com', userId: '101' });
		const h = createHarness(undefined, authentication);
		h.subscriptions.addSubscription(session, `${session}/changes`);
		await pump();
		assert.deepStrictEqual({ statusLogged: h.statusLogs.some(message => message.includes('Sync skipped: sponsor authentication required')), errors: h.errors, subscriptions: h.resources.liveSubscriptions }, {
			statusLogged: true, errors: [], subscriptions: 0,
		});
	});

	test('error logs unexpected real background capture failures', async () => {
		const authentication = disposables.add(new AgentHostAuthenticationService(new NullLogService()));
		const session = 'copilot:/pr-status';
		authentication.bindSessionCredentials(session, {
			principal: { apiOrigin: 'https://api.github.com', userId: '101' },
			getCredential: () => { throw new Error('Credential invariant failed'); },
		});
		const h = createHarness(undefined, authentication);
		h.subscriptions.addSubscription(session, `${session}/changes`);
		await pump();
		assert.deepStrictEqual({ statusLogs: h.statusLogs, errorLogged: h.errors.some(message => message.includes('Sync failed:')), subscriptions: h.resources.liveSubscriptions }, {
			statusLogs: [], errorLogged: true, subscriptions: 0,
		});
	});

	test('a scheduled background sync retains its captured sponsor across connection rotation and session rebinding', async () => {
		let token = 'source-a';
		let current: IAgentHostCredentialSource = {
			getCredential: request => ({ resource: request.resource, token, revision: 1, expiresAt: undefined }),
		};
		const { stateManager, subscriptions, credentials, resources, chatGitStates, session, observedTokens } = createHarness(() => current);
		const otherFolder = 'file:///other';
		const peer = buildChatUri(session, 'peer');
		stateManager.addChat(session, peer, creationTimeChatStorageResource(session, peer, buildDefaultChatUri(session)), { workingDirectories: [otherFolder] });
		stateManager.setSessionMeta(session, withSessionGitHubState(stateManager.getSessionState(session)?._meta, otherFolder, {
			owner: 'octo', repo: 'tools', pullRequestUrls: ['https://github.com/octo/tools/pull/9'], pullRequestBranchName: 'tools-feature',
		}));
		chatGitStates.set(peer, { branchName: 'tools-feature' });
		await pump();
		credentials.pending = new DeferredPromise<void>();
		subscriptions.addSubscription(session, `${session}/changes`);
		token = 'rotated-source-a';
		current = { getCredential: request => ({ resource: request.resource, token: 'source-b', revision: 1, expiresAt: undefined }) };
		credentials.pending.complete();
		credentials.pending = undefined;
		for (let i = 0; i < 50 && resources.liveSubscriptions < 2; i++) {
			await pump();
		}
		assert.deepStrictEqual({ observedTokens, liveSubscriptions: resources.liveSubscriptions }, {
			observedTokens: ['source-a', 'source-a'], liveSubscriptions: 2,
		});
	});

	test('an unavailable isolated background sponsor does not create a legacy watcher', async () => {
		const { subscriptions, resources, session, observedTokens } = createHarness(() => ({ getCredential: () => undefined }));
		subscriptions.addSubscription(session, `${session}/changes`);
		await pump();
		assert.deepStrictEqual({ observedTokens, liveSubscriptions: resources.liveSubscriptions }, { observedTokens: [], liveSubscriptions: 0 });
	});

	test('watches and reports the pull request of each folder a chat works in', async () => {
		const { service, stateManager, subscriptions, resources, publishedStateKeys, chatGitStates, session } = createHarness();
		const otherFolder = 'file:///other';
		const otherPullRequestUrl = 'https://github.com/octo/tools/pull/9';
		const peer = buildChatUri(session, 'peer');
		stateManager.addChat(session, peer, creationTimeChatStorageResource(session, peer, buildDefaultChatUri(session)), { workingDirectories: [otherFolder] });
		stateManager.setSessionMeta(session, withSessionGitHubState(stateManager.getSessionState(session)?._meta, otherFolder, {
			pullRequestUrls: [otherPullRequestUrl],
			pullRequestBranchName: 'tools-feature',
		}));
		chatGitStates.set(peer, { branchName: 'tools-feature' });

		subscriptions.addSubscription(session, session);
		for (let i = 0; i < 50 && resources.liveSubscriptions < 2; i++) {
			await pump();
		}
		const otherFolderOwner = buildFolderChangesetOwnerUri(session, getWorkingDirectoryScopeId([otherFolder]));

		assert.deepStrictEqual({
			watched: resources.subscribed.map(ref => `${ref.owner}/${ref.repo}#${ref.number}`),
			sessionFolder: service.getPullRequestStatus(session)?.url,
			otherFolderByChat: service.getPullRequestStatus(peer)?.url,
			otherFolderByOwner: service.getPullRequestStatus(otherFolderOwner)?.url,
			// Another folder's pull request state is recorded through the chat working in it.
			publishedStateKeys,
		}, {
			watched: ['octo/repo#7', 'octo/tools#9'],
			sessionFolder: pullRequestUrl,
			otherFolderByChat: otherPullRequestUrl,
			otherFolderByOwner: otherPullRequestUrl,
			publishedStateKeys: [session, peer],
		});
	});

	test('refreshes a reused folder watch descriptor when the representative chat changes', async () => {
		const { service, stateManager, subscriptions, resources, publishedStateKeys, chatGitStates, session } = createHarness();
		const otherFolder = 'file:///other';
		const otherPullRequestUrl = 'https://github.com/octo/tools/pull/9';
		const firstPeer = buildChatUri(session, 'first-peer');
		const secondPeer = buildChatUri(session, 'second-peer');
		stateManager.addChat(session, firstPeer, creationTimeChatStorageResource(session, firstPeer, buildDefaultChatUri(session)), { workingDirectories: [otherFolder] });
		stateManager.setSessionMeta(session, withSessionGitHubState(stateManager.getSessionState(session)?._meta, otherFolder, {
			pullRequestUrls: [otherPullRequestUrl],
			pullRequestBranchName: 'tools-feature',
		}));
		chatGitStates.set(firstPeer, { branchName: 'tools-feature' });

		subscriptions.addSubscription(session, session);
		for (let i = 0; i < 50 && resources.liveSubscriptions < 2; i++) {
			await pump();
		}
		publishedStateKeys.length = 0;

		stateManager.addChat(session, secondPeer, creationTimeChatStorageResource(session, secondPeer, buildDefaultChatUri(session)), { workingDirectories: [otherFolder] });
		chatGitStates.set(secondPeer, { branchName: 'tools-feature' });
		stateManager.removeChat(session, firstPeer);
		await pump();
		const toolsSubscription = resources.subscribed.findIndex(ref => ref.owner === 'octo' && ref.repo === 'tools');
		resources.setSnapshotAt(toolsSubscription, snapshot({ ...account, owner: 'octo', repo: 'tools', number: 9 }, { draft: true }));

		assert.deepStrictEqual({
			status: service.getPullRequestStatus(secondPeer)?.url,
			publishedStateKeys,
		}, {
			status: otherPullRequestUrl,
			publishedStateKeys: [secondPeer],
		});
	});

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

	test('resolves a background lifecycle check without a client subscription', async () => {
		const { service, resources, session } = createHarness();

		const status = await service.resolveForLifecycle(session, pullRequestUrl);
		await pump();

		assert.deepStrictEqual({
			status: status?.state,
			subscribed: resources.subscribed.length,
			options: resources.subscriptionOptions[0],
			refreshedFragments: resources.refreshedFragments,
			live: resources.liveSubscriptions,
		}, {
			status: 'open',
			subscribed: 1,
			options: {
				priority: 'background',
				core: true,
			},
			refreshedFragments: ['core'],
			live: 0,
		});
	});

	test('resolves a background lifecycle check for an archived session', async () => {
		const { service, stateManager, resources, session } = createHarness();
		stateManager.dispatchServerAction(session, { type: ActionType.SessionIsArchivedChanged, isArchived: true });

		const status = await service.resolveForLifecycle(session, pullRequestUrl);
		await pump();

		assert.deepStrictEqual({
			status: status?.state,
			subscribed: resources.subscribed.length,
			refreshedFragments: resources.refreshedFragments,
			live: resources.liveSubscriptions,
		}, {
			status: 'open',
			subscribed: 1,
			refreshedFragments: ['core'],
			live: 0,
		});
	});

	test('resolves a supplied lifecycle pull request without restoring session state', async () => {
		const { service, stateManager, resources, session } = createHarness();
		stateManager.deleteSession(session);

		const status = await service.resolveForLifecycle(session, pullRequestUrl);

		assert.deepStrictEqual({
			status: status?.state,
			subscribed: resources.subscribed.length,
			options: resources.subscriptionOptions[0],
			refreshedFragments: resources.refreshedFragments,
			live: resources.liveSubscriptions,
		}, {
			status: 'open',
			subscribed: 1,
			options: {
				priority: 'background',
				core: true,
			},
			refreshedFragments: ['core'],
			live: 0,
		});
	});

	test('tracks review readiness in the host only while Agent Merge is enabled', async () => {
		const { service, stateManager, subscriptions, resources, session } = createHarness();
		stateManager.setSessionConfig(session, {
			schema: { type: 'object', properties: {} },
			values: {
				[SessionConfigKey.AgentMerge]: { enabled: true },
				[SessionConfigKey.AgentMergeController]: {
					target: {
						branchName: 'feature',
						pullRequestUrl,
						enabledAt: new Date(1).toISOString(),
						commentWatermark: '',
					},
				},
			},
		});
		resources.setNextSubscriptionSnapshot(agentMergeReadySnapshot({ ...account, owner: 'octo', repo: 'repo', number: 7 }));
		subscriptions.addSubscription(session, `${session}/changes`);
		await waitForWatch(resources);
		const enabled = {
			options: resources.subscriptionOptions.at(-1),
			readyForReview: service.getPullRequestStatus(session)?.agentMergeReadyForReview,
		};

		stateManager.dispatchServerAction(session, {
			type: ActionType.SessionConfigChanged,
			config: { [SessionConfigKey.AgentMerge]: { enabled: false } },
			replace: true,
		});
		await pump();

		assert.deepStrictEqual({
			enabled,
			disabled: {
				options: resources.subscriptionOptions.at(-1),
				readyForReview: service.getPullRequestStatus(session)?.agentMergeReadyForReview,
			},
		}, {
			enabled: {
				options: {
					priority: 'visible',
					core: true,
					mergeability: true,
					conversation: {
						topLevelComments: true,
						submittedReviews: true,
						reviewThreads: true,
						includeBodies: true,
					},
					checks: { required: true },
				},
				readyForReview: true,
			},
			disabled: {
				options: {
					priority: 'visible',
					core: true,
					mergeability: true,
				},
				readyForReview: undefined,
			},
		});
	});

	test('optimistically records a successful merge in host pull request state', async () => {
		const { service, subscriptions, resources, gitHubStates, session } = createHarness();
		subscriptions.addSubscription(session, `${session}/changes`);
		await waitForWatch(resources);

		service.markPullRequestMerged(session, pullRequestUrl);

		assert.deepStrictEqual({
			status: service.getPullRequestStatus(session)?.state,
			gitHubState: gitHubStates.at(-1),
		}, {
			status: 'merged',
			gitHubState: {
				pullRequestState: 'merged',
				pullRequestStateUrl: pullRequestUrl,
			},
		});
	});

	test('records a successful merge after its pull request watch was disposed', async () => {
		const { service, gitHubStates, session } = createHarness();

		service.markPullRequestMerged(session, pullRequestUrl);

		assert.deepStrictEqual({
			status: service.getPullRequestStatus(session),
			gitHubState: gitHubStates.at(-1),
		}, {
			status: undefined,
			gitHubState: {
				pullRequestState: 'merged',
				pullRequestStateUrl: pullRequestUrl,
			},
		});
	});

	test('does not downgrade a merged pull request from a retained loading snapshot', async () => {
		const { service, subscriptions, resources, session } = createHarness();
		subscriptions.addSubscription(session, `${session}/changes`);
		await waitForWatch(resources);
		service.markPullRequestMerged(session, pullRequestUrl);

		const retainedOpenSnapshot = snapshot(resources.subscribed[0]);
		resources.setSnapshot({
			...retainedOpenSnapshot,
			core: { ...retainedOpenSnapshot.core, status: 'loading', complete: false },
		});
		const whileLoading = service.getPullRequestStatus(session)?.state;
		resources.setSnapshot(retainedOpenSnapshot);

		assert.deepStrictEqual({
			whileLoading,
			afterRefresh: service.getPullRequestStatus(session)?.state,
		}, {
			whileLoading: 'merged',
			afterRefresh: 'open',
		});
	});

	test('waits for a fresh refresh before reconciling a recreated merged watch', async () => {
		const { service, subscriptions, resources, session } = createHarness();
		const channel = `${session}/changes`;
		subscriptions.addSubscription(session, channel);
		await waitForWatch(resources);
		service.markPullRequestMerged(session, pullRequestUrl);
		subscriptions.removeSubscription(session, channel);

		const refresh = new DeferredPromise<void>();
		resources.refreshHandler = () => refresh.p;
		subscriptions.addSubscription(session, channel);
		await waitForWatch(resources);
		const whileRefreshing = service.getPullRequestStatus(session);
		refresh.complete();
		await pump();

		assert.deepStrictEqual({
			whileRefreshing,
			afterRefresh: service.getPullRequestStatus(session)?.state,
		}, {
			whileRefreshing: undefined,
			afterRefresh: 'open',
		});
	});

	test('does not apply persisted merged state from another GitHub host', async () => {
		const { service, stateManager, subscriptions, resources, session } = createHarness();
		const retainedOpenSnapshot = snapshot({ ...account, owner: 'octo', repo: 'repo', number: 7 });
		resources.setNextSubscriptionSnapshot({
			...retainedOpenSnapshot,
			core: { ...retainedOpenSnapshot.core, status: 'loading', complete: false },
		});
		stateManager.setSessionMeta(session, withSessionGitHubState(
			stateManager.getSessionState(session)?._meta,
			REPOSITORY,
			{
				pullRequestUrls: [pullRequestUrl],
				pullRequestBranchName: 'feature',
				pullRequestState: 'merged',
				pullRequestStateUrl: 'https://github.example.com/octo/repo/pull/7',
			},
		));

		subscriptions.addSubscription(session, `${session}/changes`);
		await waitForWatch(resources);

		assert.strictEqual(service.getPullRequestStatus(session)?.state, 'open');
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

	test('retries a credential invalidated before its watch is installed', async () => {
		const { subscriptions, credentials, resources, session } = createHarness();
		subscriptions.addSubscription(session, `${session}/changes`);
		credentials.invalidate('account');
		await waitForWatch(resources);
		assert.deepStrictEqual({ lookups: credentials.lookups, subscribed: resources.subscribed.length, live: resources.liveSubscriptions }, {
			lookups: 2, subscribed: 1, live: 1,
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
