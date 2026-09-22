/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { type IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { DisposableStore, IReference, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IGitHubService } from '../../../github/browser/githubService.js';
import { GitHubCIOverallStatus, GitHubCheckConclusion, GitHubCheckStatus, GitHubPullRequestState, IGitHubCICheck, IGitHubPullRequest, IGitHubPullRequestReviewThread } from '../../../github/common/types.js';
import { IAgentHostSessionsProvider, IAgentMergeClientState } from '../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersChangeEvent, ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { SessionStatus, type IGitHubInfo, type ISession, type ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { InboxNotificationsService } from '../../browser/inboxNotificationsService.js';
import { InboxNotificationActionKind, InboxNotificationKind, InboxNotificationPriority } from '../../common/inboxNotificationsService.js';
import { GitHubPullRequestModel } from '../../../github/browser/models/githubPullRequestModel.js';
import { GitHubPullRequestCIModel } from '../../../github/browser/models/githubPullRequestCIModel.js';
import { GitHubPullRequestReviewThreadsModel } from '../../../github/browser/models/githubPullRequestReviewThreadsModel.js';

suite('InboxNotificationsService', () => {
	const dismissedStorageKey = 'sessions.inboxNotifications.dismissedIds';
	const disposables = new DisposableStore();

	teardown(() => {
		disposables.clear();
	});
	ensureNoDisposablesAreLeakedInTestSuite();

	function createSession(options: {
		readonly id: string;
		readonly providerId?: string;
		readonly status: SessionStatus;
		readonly updatedAt: number;
		readonly title?: string;
		readonly description?: string;
		readonly isRead?: boolean;
		readonly isArchived?: boolean;
		readonly pullRequest?: {
			readonly owner: string;
			readonly repo: string;
			readonly number: number;
		};
	}): ISession {
		const key = `inboxNotificationsService/${options.id}`;
		const gitHubInfo: IGitHubInfo | undefined = options.pullRequest ? {
			owner: options.pullRequest.owner,
			repo: options.pullRequest.repo,
			pullRequest: {
				number: options.pullRequest.number,
				uri: URI.parse(`https://github.com/${options.pullRequest.owner}/${options.pullRequest.repo}/pull/${options.pullRequest.number}`),
				state: 'open',
			},
		} : undefined;
		const workspace: ISessionWorkspace | undefined = gitHubInfo ? {
			uri: URI.parse(`test:///workspace/${options.id}`),
			label: options.id,
			icon: Codicon.folder,
			folders: [{
				root: URI.parse(`test:///workspace/${options.id}/root`),
				workingDirectory: URI.parse(`test:///workspace/${options.id}/root`),
				name: options.id,
				description: undefined,
				gitRepository: {
					uri: URI.parse(`test:///workspace/${options.id}/root`),
					workTreeUri: URI.parse(`test:///workspace/${options.id}/root`),
					baseBranchName: undefined,
					gitHubInfo: observableValue<IGitHubInfo | undefined>(`${key}/gitHubInfo`, gitHubInfo),
				},
			}],
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: false,
		} : undefined;
		return upcastPartial<ISession>({
			providerId: options.providerId ?? 'local-agent-host',
			sessionId: options.id,
			resource: URI.parse(`test:///session/${options.id}`),
			status: observableValue(`${key}/status`, options.status),
			title: observableValue(`${key}/title`, options.title ?? options.id),
			updatedAt: observableValue(`${key}/updatedAt`, new Date(options.updatedAt)),
			description: observableValue<IMarkdownString | undefined>(`${key}/description`, options.description ? { value: options.description } : undefined),
			isRead: observableValue(`${key}/isRead`, options.isRead ?? true),
			isArchived: observableValue(`${key}/isArchived`, options.isArchived ?? false),
			workspace: observableValue<ISessionWorkspace | undefined>(`${key}/workspace`, workspace),
		});
	}

	function createFixture(
		initialSessions: readonly ISession[],
		storageService?: InMemoryStorageService,
		gitHubService?: TestGitHubService,
		agentHostProvider?: TestAgentHostProvider,
		withAgentHostProvider = true,
	): {
		readonly service: InboxNotificationsService;
		readonly storageService: InMemoryStorageService;
		readonly gitHubService: TestGitHubService;
		readonly agentHostProvider: TestAgentHostProvider;
		setSessions(sessions: readonly ISession[]): void;
		setAgentHostProviderRegistered(registered: boolean): void;
	} {
		const store = disposables.add(new DisposableStore());
		const sessionsChangeEmitter = store.add(new Emitter<ISessionsChangeEvent>());
		const providerChangeEmitter = store.add(new Emitter<ISessionsProvidersChangeEvent>());
		let sessions = [...initialSessions];
		const managementService = upcastPartial<ISessionsManagementService>({
			onDidChangeSessions: sessionsChangeEmitter.event,
			getSessions: () => sessions,
		});
		const effectiveStorageService = storageService ?? store.add(new InMemoryStorageService());
		const effectiveGitHubService = gitHubService ?? new TestGitHubService();
		const effectiveAgentHostProvider = agentHostProvider ?? new TestAgentHostProvider();
		const provider = upcastPartial<IAgentHostSessionsProvider>({
			id: effectiveAgentHostProvider.id,
			getAgentMergeClientStateObservable: (sessionId: string) => effectiveAgentHostProvider.getAgentMergeClientStateObservable(sessionId),
		});
		const providerMap = new Map<string, ISessionsProvider>(withAgentHostProvider ? [[provider.id, provider]] : []);
		const sessionsProvidersService = upcastPartial<ISessionsProvidersService>({
			onDidChangeProviders: providerChangeEmitter.event,
			getProvider<T extends ISessionsProvider>(providerId: string): T | undefined {
				return providerMap.get(providerId) as T | undefined;
			},
		});
		const service = store.add(new InboxNotificationsService(
			managementService,
			sessionsProvidersService,
			upcastPartial<IGitHubService>(effectiveGitHubService),
			effectiveStorageService,
		));
		return {
			service,
			storageService: effectiveStorageService,
			gitHubService: effectiveGitHubService,
			agentHostProvider: effectiveAgentHostProvider,
			setSessions(nextSessions: readonly ISession[]) {
				sessions = [...nextSessions];
				sessionsChangeEmitter.fire({ added: [], removed: [], changed: sessions });
			},
			setAgentHostProviderRegistered(registered: boolean) {
				if (registered) {
					if (!providerMap.has(provider.id)) {
						providerMap.set(provider.id, provider);
						providerChangeEmitter.fire({ added: [provider], removed: [] });
					}
				} else if (providerMap.delete(provider.id)) {
					providerChangeEmitter.fire({ added: [], removed: [provider] });
				}
			},
		};
	}

	test('derives prioritized notifications with expected actions', () => {
		const fixture = createFixture([
			createSession({ id: 'input', status: SessionStatus.NeedsInput, updatedAt: 200, description: 'waiting for user answer' }),
			createSession({ id: 'completed', status: SessionStatus.Completed, updatedAt: 300, isRead: false }),
			createSession({ id: 'ignored', status: SessionStatus.Completed, updatedAt: 400, isRead: true }),
			createSession({ id: 'archived', status: SessionStatus.NeedsInput, updatedAt: 500, isArchived: true }),
		]);

		assert.deepStrictEqual(fixture.service.notifications.get().map(item => ({
			kind: item.kind,
			priority: item.priority,
			actionKinds: item.actions.map(action => action.kind),
		})), [
			{
				kind: InboxNotificationKind.NeedsInput,
				priority: InboxNotificationPriority.High,
				actionKinds: [InboxNotificationActionKind.OpenSession, InboxNotificationActionKind.MarkDone],
			},
			{
				kind: InboxNotificationKind.Completed,
				priority: InboxNotificationPriority.Low,
				actionKinds: [InboxNotificationActionKind.OpenSession, InboxNotificationActionKind.MarkDone],
			},
		]);
	});

	test('surfaces failing and passing CI notifications for session pull requests', () => {
		const gitHubService = new TestGitHubService();
		const fixture = createFixture([createSession({
			id: 'ci',
			status: SessionStatus.Completed,
			updatedAt: 100,
			isRead: true,
			pullRequest: { owner: 'owner', repo: 'repo', number: 42 },
		})], undefined, gitHubService);

		gitHubService.setPullRequest('owner', 'repo', 42, openPullRequest(42, 'sha42'));
		gitHubService.setCIStatus('owner', 'repo', 42, 'sha42', GitHubCIOverallStatus.Failure, [{
			id: 1,
			name: 'CI',
			status: GitHubCheckStatus.Completed,
			conclusion: GitHubCheckConclusion.Failure,
			startedAt: '2026-09-21T16:00:00Z',
			completedAt: '2026-09-21T16:01:00Z',
			detailsUrl: undefined,
		}]);
		assert.deepStrictEqual(fixture.service.notifications.get().map(item => ({
			kind: item.kind,
			actions: item.actions.map(action => action.kind),
		})), [{
			kind: InboxNotificationKind.FailingCI,
			actions: [InboxNotificationActionKind.OpenSession, InboxNotificationActionKind.AgentMergeFixCI, InboxNotificationActionKind.MarkDone],
		}]);

		gitHubService.setCIStatus('owner', 'repo', 42, 'sha42', GitHubCIOverallStatus.Success, [{
			id: 2,
			name: 'CI',
			status: GitHubCheckStatus.Completed,
			conclusion: GitHubCheckConclusion.Success,
			startedAt: '2026-09-21T16:02:00Z',
			completedAt: '2026-09-21T16:03:00Z',
			detailsUrl: undefined,
		}]);
		assert.deepStrictEqual(fixture.service.notifications.get().map(item => ({
			kind: item.kind,
			actions: item.actions.map(action => action.kind),
		})), [{
			kind: InboxNotificationKind.PassingCI,
			actions: [InboxNotificationActionKind.OpenSession, InboxNotificationActionKind.AgentMergeMergePullRequest, InboxNotificationActionKind.MarkDone],
		}]);
	});

	test('surfaces unresolved Copilot review comments only', () => {
		const gitHubService = new TestGitHubService();
		const fixture = createFixture([createSession({
			id: 'comments',
			status: SessionStatus.Completed,
			updatedAt: 100,
			isRead: true,
			pullRequest: { owner: 'owner', repo: 'repo', number: 43 },
		})], undefined, gitHubService);

		gitHubService.setPullRequest('owner', 'repo', 43, openPullRequest(43, 'sha43'));
		gitHubService.setReviewThreads('owner', 'repo', 43, [{
			id: 'thread-human',
			isResolved: false,
			path: 'src/test.ts',
			startLine: 10,
			line: 10,
			comments: [{
				id: 1,
				body: 'Please adjust this.',
				author: { login: 'reviewer', avatarUrl: '' },
				createdAt: '2026-09-21T16:00:00Z',
				updatedAt: '2026-09-21T16:00:00Z',
				path: 'src/test.ts',
				line: 10,
				threadId: 'thread-human',
				inReplyToId: undefined,
			}],
		}, {
			id: 'thread-copilot',
			isResolved: false,
			path: 'src/test.ts',
			startLine: 20,
			line: 20,
			comments: [{
				id: 2,
				body: 'Copilot suggestion',
				author: { login: 'copilot[bot]', avatarUrl: '' },
				createdAt: '2026-09-21T16:05:00Z',
				updatedAt: '2026-09-21T16:05:00Z',
				path: 'src/test.ts',
				line: 20,
				threadId: 'thread-copilot',
				inReplyToId: undefined,
			}],
		}]);

		assert.deepStrictEqual(fixture.service.notifications.get().map(item => ({
			kind: item.kind,
			actions: item.actions.map(action => action.kind),
		})), [{
			kind: InboxNotificationKind.ReviewComments,
			actions: [InboxNotificationActionKind.OpenSession, InboxNotificationActionKind.AgentMergeAddressReviews, InboxNotificationActionKind.MarkDone],
		}]);
	});

	test('shows merge action for agent-host sessions before provider registration', () => {
		const gitHubService = new TestGitHubService();
		const fixture = createFixture([createSession({
			id: 'late-provider',
			status: SessionStatus.Completed,
			updatedAt: 100,
			isRead: true,
			pullRequest: { owner: 'owner', repo: 'repo', number: 44 },
		})], undefined, gitHubService, undefined, false);

		gitHubService.setPullRequest('owner', 'repo', 44, openPullRequest(44, 'sha44'));
		gitHubService.setCIStatus('owner', 'repo', 44, 'sha44', GitHubCIOverallStatus.Success, [{
			id: 2,
			name: 'CI',
			status: GitHubCheckStatus.Completed,
			conclusion: GitHubCheckConclusion.Success,
			startedAt: '2026-09-21T16:02:00Z',
			completedAt: '2026-09-21T16:03:00Z',
			detailsUrl: undefined,
		}]);

		assert.deepStrictEqual(fixture.service.notifications.get().map(item => item.actions.map(action => action.kind)), [[
			InboxNotificationActionKind.OpenSession,
			InboxNotificationActionKind.AgentMergeMergePullRequest,
			InboxNotificationActionKind.MarkDone,
		]]);
	});

	test('shows merge action for non-agent-host sessions', () => {
		const gitHubService = new TestGitHubService();
		const fixture = createFixture([createSession({
			id: 'non-agent-host',
			providerId: 'copilot-chat-sessions',
			status: SessionStatus.Completed,
			updatedAt: 100,
			isRead: true,
			pullRequest: { owner: 'owner', repo: 'repo', number: 45 },
		})], undefined, gitHubService);

		gitHubService.setPullRequest('owner', 'repo', 45, openPullRequest(45, 'sha45'));
		gitHubService.setCIStatus('owner', 'repo', 45, 'sha45', GitHubCIOverallStatus.Success, [{
			id: 2,
			name: 'CI',
			status: GitHubCheckStatus.Completed,
			conclusion: GitHubCheckConclusion.Success,
			startedAt: '2026-09-21T16:02:00Z',
			completedAt: '2026-09-21T16:03:00Z',
			detailsUrl: undefined,
		}]);

		assert.deepStrictEqual(fixture.service.notifications.get().map(item => item.actions.map(action => action.kind)), [[
			InboxNotificationActionKind.OpenSession,
			InboxNotificationActionKind.AgentMergeMergePullRequest,
			InboxNotificationActionKind.MarkDone,
		]]);
	});

	test('persists dismissed notifications across instances', () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const sessions = [createSession({ id: 'completed', status: SessionStatus.Completed, updatedAt: 100, isRead: false })];
		const first = createFixture(sessions, storageService);

		const dismissedId = first.service.notifications.get()[0].id;
		first.service.dismissNotification(dismissedId);
		assert.deepStrictEqual(first.service.notifications.get().map(item => item.id), []);

		const second = createFixture(sessions, storageService);
		assert.deepStrictEqual(second.service.notifications.get().map(item => item.id), []);

		second.service.clearDismissedNotifications();
		assert.deepStrictEqual(second.service.notifications.get().map(item => item.kind), [InboxNotificationKind.Completed]);
	});

	test('updates external notifications by id', () => {
		const fixture = createFixture([]);
		fixture.service.publishExternalNotification({
			id: 'external-1',
			kind: InboxNotificationKind.FailingCI,
			title: 'Initial',
			description: 'Initial description',
		});
		fixture.service.publishExternalNotification({
			id: 'external-1',
			kind: InboxNotificationKind.ReviewComments,
			title: 'Updated',
			description: 'Updated description',
			priority: InboxNotificationPriority.Critical,
		});

		assert.deepStrictEqual(fixture.service.notifications.get().map(item => ({
			id: item.id,
			kind: item.kind,
			title: item.title,
			priority: item.priority,
			actionKinds: item.actions.map(action => action.kind),
		})), [{
			id: 'external-1',
			kind: InboxNotificationKind.ReviewComments,
			title: 'Updated',
			priority: InboxNotificationPriority.Critical,
			actionKinds: [InboxNotificationActionKind.MarkDone],
		}]);
	});

	test('removes external notifications by id', () => {
		const fixture = createFixture([]);
		fixture.service.publishExternalNotification({
			id: 'external-1',
			title: 'Needs follow-up',
			description: 'External condition is active',
		});

		assert.strictEqual(fixture.service.notifications.get().length, 1);
		fixture.service.removeExternalNotification('external-1');
		assert.strictEqual(fixture.service.notifications.get().length, 0);
	});

	test('reloads dismissals when application storage changes externally', () => {
		class TestStorageService extends InMemoryStorageService {
			emitExternalApplicationChange(key: string): void {
				this.emitDidChangeValue(StorageScope.APPLICATION, { key, external: true });
			}
		}

		const storageService = disposables.add(new TestStorageService());
		const fixture = createFixture([createSession({ id: 'completed', status: SessionStatus.Completed, updatedAt: 100, isRead: false })], storageService);
		const notificationId = fixture.service.notifications.get()[0].id;

		storageService.store(dismissedStorageKey, JSON.stringify([notificationId]), StorageScope.APPLICATION, StorageTarget.USER);
		storageService.emitExternalApplicationChange(dismissedStorageKey);
		assert.deepStrictEqual(fixture.service.notifications.get().map(item => item.id), []);

		storageService.remove(dismissedStorageKey, StorageScope.APPLICATION);
		storageService.emitExternalApplicationChange(dismissedStorageKey);
		assert.deepStrictEqual(fixture.service.notifications.get().map(item => item.kind), [InboxNotificationKind.Completed]);
	});
});

function openPullRequest(number: number, headSha: string): IGitHubPullRequest {
	return upcastPartial<IGitHubPullRequest>({
		number,
		headSha,
		isDraft: false,
		state: GitHubPullRequestState.Open,
	});
}

class TestAgentHostProvider {
	readonly id = 'local-agent-host';
	private readonly _agentMergeStates = new Map<string, ReturnType<typeof observableValue<IAgentMergeClientState | undefined>>>();

	getAgentMergeClientStateObservable(sessionId: string): IObservable<IAgentMergeClientState | undefined> {
		return this._stateForSession(sessionId);
	}

	private _stateForSession(sessionId: string) {
		let state = this._agentMergeStates.get(sessionId);
		if (!state) {
			state = observableValue<IAgentMergeClientState | undefined>(`test.agentMerge.${sessionId}`, { enabled: false });
			this._agentMergeStates.set(sessionId, state);
		}
		return state;
	}
}

class TestGitHubService {
	private readonly _prModels = new Map<string, TestPullRequestModel>();
	private readonly _ciModels = new Map<string, TestCIModel>();
	private readonly _reviewThreadModels = new Map<string, TestReviewThreadsModel>();

	createPullRequestModelReference(owner: string, repo: string, prNumber: number): IReference<GitHubPullRequestModel> {
		return { object: upcastPartial<GitHubPullRequestModel>(this._prModel(owner, repo, prNumber)), dispose: () => { } };
	}

	createPullRequestCIModelReference(owner: string, repo: string, prNumber: number, headSha: string): IReference<GitHubPullRequestCIModel> {
		return { object: upcastPartial<GitHubPullRequestCIModel>(this._ciModel(owner, repo, prNumber, headSha)), dispose: () => { } };
	}

	createPullRequestReviewThreadsModelReference(owner: string, repo: string, prNumber: number): IReference<GitHubPullRequestReviewThreadsModel> {
		return { object: upcastPartial<GitHubPullRequestReviewThreadsModel>(this._reviewThreadModel(owner, repo, prNumber)), dispose: () => { } };
	}

	setPullRequest(owner: string, repo: string, prNumber: number, pullRequest: IGitHubPullRequest): void {
		this._prModel(owner, repo, prNumber).set(pullRequest);
	}

	setCIStatus(owner: string, repo: string, prNumber: number, headSha: string, status: GitHubCIOverallStatus, checks: readonly IGitHubCICheck[]): void {
		this._ciModel(owner, repo, prNumber, headSha).set(status, checks);
	}

	setReviewThreads(owner: string, repo: string, prNumber: number, threads: readonly IGitHubPullRequestReviewThread[]): void {
		this._reviewThreadModel(owner, repo, prNumber).set(threads);
	}

	private _prModel(owner: string, repo: string, prNumber: number): TestPullRequestModel {
		const key = `${owner}/${repo}/${prNumber}`;
		let model = this._prModels.get(key);
		if (!model) {
			model = new TestPullRequestModel();
			this._prModels.set(key, model);
		}
		return model;
	}

	private _ciModel(owner: string, repo: string, prNumber: number, headSha: string): TestCIModel {
		const key = `${owner}/${repo}/${prNumber}/${headSha}`;
		let model = this._ciModels.get(key);
		if (!model) {
			model = new TestCIModel();
			this._ciModels.set(key, model);
		}
		return model;
	}

	private _reviewThreadModel(owner: string, repo: string, prNumber: number): TestReviewThreadsModel {
		const key = `${owner}/${repo}/${prNumber}`;
		let model = this._reviewThreadModels.get(key);
		if (!model) {
			model = new TestReviewThreadsModel();
			this._reviewThreadModels.set(key, model);
		}
		return model;
	}
}

class TestPullRequestModel {
	private readonly _pullRequest = observableValue<IGitHubPullRequest | undefined>('test.pullRequest', undefined);
	readonly pullRequest = this._pullRequest;

	set(pullRequest: IGitHubPullRequest): void {
		this._pullRequest.set(pullRequest, undefined);
	}

	refresh(): Promise<void> {
		return Promise.resolve();
	}

	startPolling() {
		return toDisposable(() => { });
	}
}

class TestCIModel {
	private readonly _overallStatus = observableValue<GitHubCIOverallStatus>('test.ciStatus', GitHubCIOverallStatus.Neutral);
	readonly overallStatus = this._overallStatus;
	private readonly _checks = observableValue<readonly IGitHubCICheck[]>('test.ciChecks', []);
	readonly checks = this._checks;

	set(status: GitHubCIOverallStatus, checks: readonly IGitHubCICheck[]): void {
		this._overallStatus.set(status, undefined);
		this._checks.set(checks, undefined);
	}

	refresh(): Promise<void> {
		return Promise.resolve();
	}

	startPolling() {
		return toDisposable(() => { });
	}
}

class TestReviewThreadsModel {
	private readonly _reviewThreads = observableValue<readonly IGitHubPullRequestReviewThread[]>('test.reviewThreads', []);
	readonly reviewThreads = this._reviewThreads;

	set(threads: readonly IGitHubPullRequestReviewThread[]): void {
		this._reviewThreads.set(threads, undefined);
	}

	refresh(): Promise<void> {
		return Promise.resolve();
	}

	startPolling() {
		return toDisposable(() => { });
	}
}
