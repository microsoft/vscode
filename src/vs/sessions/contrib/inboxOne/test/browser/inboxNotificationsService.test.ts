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
import { IChat, SessionStatus, type IGitHubInfo, type ISession, type ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { InboxNotificationsService } from '../../browser/inboxNotificationsService.js';
import { InboxNotificationActionKind, InboxNotificationKind, InboxNotificationPriority, InboxNotificationsSortMode } from '../../common/inboxNotificationsService.js';
import { GitHubPullRequestModel } from '../../../github/browser/models/githubPullRequestModel.js';
import { GitHubPullRequestCIModel } from '../../../github/browser/models/githubPullRequestCIModel.js';
import { GitHubPullRequestReviewThreadsModel } from '../../../github/browser/models/githubPullRequestReviewThreadsModel.js';
import { IChatQuestionCarousel, IChatService, IChatToolInvocation } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatModel, IChatRequestModel, IChatResponseModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';

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
		readonly pullRequests?: readonly {
			readonly owner: string;
			readonly repo: string;
			readonly number: number;
		}[];
		readonly chatResource?: URI;
	}): ISession {
		const key = `inboxNotificationsService/${options.id}`;
		const chatResource = options.chatResource ?? URI.parse(`test:///chat/${options.id}`);
		const chat = upcastPartial<IChat>({ resource: chatResource });
		const gitHubInfo: IGitHubInfo | undefined = options.pullRequests?.length ? {
			owner: options.pullRequests[0].owner,
			repo: options.pullRequests[0].repo,
			pullRequests: options.pullRequests.map(pullRequest => ({
				owner: pullRequest.owner,
				repo: pullRequest.repo,
				number: pullRequest.number,
				uri: URI.parse(`https://github.com/${pullRequest.owner}/${pullRequest.repo}/pull/${pullRequest.number}`),
				state: 'open',
				createdByThisSession: true,
			})),
		} : options.pullRequest ? {
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
			chats: observableValue(`${key}/chats`, [chat]),
			mainChat: observableValue(`${key}/mainChat`, chat),
			workspace: observableValue<ISessionWorkspace | undefined>(`${key}/workspace`, workspace),
		});
	}

	function createFixture(
		initialSessions: readonly ISession[],
		storageService?: InMemoryStorageService,
		gitHubService?: TestGitHubService,
		chatService?: TestChatService,
		agentHostProvider?: TestAgentHostProvider,
		withAgentHostProvider = true,
	): {
		readonly service: InboxNotificationsService;
		readonly storageService: InMemoryStorageService;
		readonly gitHubService: TestGitHubService;
		readonly chatService: TestChatService;
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
		const effectiveChatService = chatService ?? new TestChatService();
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
			upcastPartial<IChatService>(effectiveChatService),
			upcastPartial<IGitHubService>(effectiveGitHubService),
			effectiveStorageService,
		));
		return {
			service,
			storageService: effectiveStorageService,
			gitHubService: effectiveGitHubService,
			chatService: effectiveChatService,
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
			description: item.description,
			actionKinds: item.actions.map(action => action.kind),
		})), [
			{
				kind: InboxNotificationKind.NeedsInput,
				priority: InboxNotificationPriority.High,
				description: 'waiting for user answer',
				actionKinds: [InboxNotificationActionKind.OpenSession, InboxNotificationActionKind.MarkDone],
			},
			{
				kind: InboxNotificationKind.Completed,
				priority: InboxNotificationPriority.Low,
				description: 'Review this completed session or mark it done.',
				actionKinds: [InboxNotificationActionKind.OpenSession, InboxNotificationActionKind.MarkDone],
			},
		]);
	});

	test('switches between priority and recency sorting', () => {
		const fixture = createFixture([
			createSession({ id: 'high-old', status: SessionStatus.NeedsInput, updatedAt: 100 }),
			createSession({ id: 'low-new', status: SessionStatus.Completed, updatedAt: 300, isRead: false }),
		]);

		const priorityOrder = fixture.service.notifications.get().map(item => item.title);
		fixture.service.setSortMode(InboxNotificationsSortMode.Recency);
		const recencyOrder = fixture.service.notifications.get().map(item => item.title);
		fixture.service.setSortMode(InboxNotificationsSortMode.Priority);
		const restoredOrder = fixture.service.notifications.get().map(item => item.title);

		assert.deepStrictEqual({ priorityOrder, recencyOrder, restoredOrder }, {
			priorityOrder: [
				'high-old',
				'Completed: low-new',
			],
			recencyOrder: [
				'Completed: low-new',
				'high-old',
			],
			restoredOrder: [
				'high-old',
				'Completed: low-new',
			],
		});
	});

	test('uses fallback text for needs-input notifications when no session detail is available', () => {
		const fixture = createFixture([
			createSession({ id: 'input', status: SessionStatus.NeedsInput, updatedAt: 200 }),
		]);

		assert.deepStrictEqual(fixture.service.notifications.get().map(item => ({
			kind: item.kind,
			description: item.description,
		})), [{
			kind: InboxNotificationKind.NeedsInput,
			description: 'Input needed',
		}]);
	});

	test('uses latest response preview for completed session notifications', () => {
		const chatResource = URI.parse('test:///chat/completed-preview');
		const chatService = new TestChatService();
		chatService.setCompletedResponse(chatResource, {
			requestId: 'request-completed-preview',
			markdown: 'Implemented the fix for CI failures and updated the flaky test coverage.',
		});
		const fixture = createFixture([
			createSession({ id: 'completed-preview', status: SessionStatus.Completed, updatedAt: 200, isRead: false, chatResource }),
		], undefined, undefined, chatService);

		assert.deepStrictEqual(fixture.service.notifications.get().map(item => ({
			kind: item.kind,
			description: item.description,
		})), [{
			kind: InboxNotificationKind.Completed,
			description: 'Implemented the fix for CI failures and updated the flaky test coverage.',
		}]);
	});

	test('includes pending question carousel data for needs-input notifications', () => {
		const chatResource = URI.parse('test:///chat/pending-question');
		const chatService = new TestChatService();
		const fixture = createFixture([
			createSession({ id: 'pending-question', status: SessionStatus.NeedsInput, updatedAt: 200, chatResource }),
		], undefined, undefined, chatService);
		chatService.setPendingQuestionCarousel(chatResource, {
			requestId: 'request-question',
			resolveId: 'resolve-question',
			allowSkip: true,
			message: 'Please answer the following.',
			questions: [{
				id: 'q1',
				type: 'text',
				title: 'Question 1',
				required: true,
			}],
		});

		assert.deepStrictEqual(fixture.service.notifications.get().map(item => ({
			kind: item.kind,
			description: item.description,
			needsInputPart: item.needsInputPart ? {
				kind: item.needsInputPart.kind,
				requestId: item.needsInputPart.requestId,
				resolveId: item.needsInputPart.kind === 'questionCarousel' ? item.needsInputPart.resolveId : undefined,
				questionCount: item.needsInputPart.kind === 'questionCarousel' ? item.needsInputPart.questions.length : 0,
			} : undefined,
		})), [{
			kind: InboxNotificationKind.NeedsInput,
			description: 'Answer the pending questions below.',
			needsInputPart: {
				kind: 'questionCarousel',
				requestId: 'request-question',
				resolveId: 'resolve-question',
				questionCount: 1,
			},
		}]);
	});

	test('includes pending confirmation data for needs-input notifications', () => {
		const chatResource = URI.parse('test:///chat/pending-confirmation');
		const chatService = new TestChatService();
		const fixture = createFixture([
			createSession({ id: 'pending-confirmation', status: SessionStatus.NeedsInput, updatedAt: 200, chatResource }),
		], undefined, undefined, chatService);
		chatService.setPendingConfirmation(chatResource, {
			requestId: 'request-confirmation',
			title: 'Confirm deployment',
			message: 'Proceed with deployment?',
			data: { action: 'deploy' },
			buttons: ['Approve', 'Cancel'],
		});

		assert.deepStrictEqual(fixture.service.notifications.get().map(item => ({
			kind: item.kind,
			description: item.description,
			needsInputPart: item.needsInputPart ? {
				kind: item.needsInputPart.kind,
				requestId: item.needsInputPart.requestId,
				title: item.needsInputPart.kind === 'confirmation' ? item.needsInputPart.title : undefined,
				buttons: item.needsInputPart.kind === 'confirmation' ? item.needsInputPart.buttons : undefined,
			} : undefined,
		})), [{
			kind: InboxNotificationKind.NeedsInput,
			description: 'Review the confirmation request below.',
			needsInputPart: {
				kind: 'confirmation',
				requestId: 'request-confirmation',
				title: 'Confirm deployment',
				buttons: ['Approve', 'Cancel'],
			},
		}]);
	});

	test('prefers pending confirmation when a pending question carousel has no questions', () => {
		const chatResource = URI.parse('test:///chat/pending-empty-question-carousel');
		const chatService = new TestChatService();
		const fixture = createFixture([
			createSession({ id: 'pending-empty-question-carousel', status: SessionStatus.NeedsInput, updatedAt: 200, chatResource }),
		], undefined, undefined, chatService);

		chatService.setPendingParts(chatResource, {
			requestId: 'request-empty-question-carousel',
			startedWaitingAt: 10,
			parts: [
				{
					kind: 'questionCarousel',
					resolveId: 'resolve-empty-question-carousel',
					allowSkip: true,
					message: 'No questions yet.',
					questions: [],
					isUsed: false,
				},
				{
					kind: 'confirmation',
					title: 'Confirm run rm command',
					message: 'Proceed with the command?',
					data: { command: 'rm -rf /tmp/test' },
					buttons: ['Approve', 'Cancel'],
					isUsed: false,
				},
			],
		});

		assert.deepStrictEqual(fixture.service.notifications.get().map(item => ({
			kind: item.kind,
			needsInputPartKind: item.needsInputPart?.kind,
			description: item.description,
		})), [{
			kind: InboxNotificationKind.NeedsInput,
			needsInputPartKind: 'confirmation',
			description: 'Review the confirmation request below.',
		}]);
	});

	test('includes pending tool confirmation data for needs-input notifications', () => {
		const chatResource = URI.parse('test:///chat/pending-tool-confirmation');
		const chatService = new TestChatService();
		const fixture = createFixture([
			createSession({ id: 'pending-tool-confirmation', status: SessionStatus.NeedsInput, updatedAt: 200, chatResource }),
		], undefined, undefined, chatService);

		chatService.setPendingParts(chatResource, {
			requestId: 'request-tool-confirmation',
			startedWaitingAt: 10,
			parts: [
				upcastPartial({
					kind: 'toolInvocation',
					toolCallId: 'tool-call-1',
					state: observableValue('test.toolInvocationState', {
						type: IChatToolInvocation.StateKind.WaitingForConfirmation,
						confirmationMessages: {
							title: 'List directory contents',
							message: 'Allow listing this directory?',
						},
					}),
				}),
			] as unknown as IChatResponseModel['response']['value'],
		});

		assert.deepStrictEqual(fixture.service.notifications.get().map(item => ({
			kind: item.kind,
			description: item.description,
			needsInputPart: item.needsInputPart ? {
				kind: item.needsInputPart.kind,
				requestId: item.needsInputPart.requestId,
				toolCallId: item.needsInputPart.kind === 'toolConfirmation' ? item.needsInputPart.toolCallId : undefined,
				title: item.needsInputPart.kind === 'toolConfirmation'
					? (typeof item.needsInputPart.title === 'string' ? item.needsInputPart.title : item.needsInputPart.title.value)
					: undefined,
				buttonLabels: item.needsInputPart.kind === 'toolConfirmation' ? item.needsInputPart.buttons.map(button => button.label) : undefined,
			} : undefined,
		})), [{
			kind: InboxNotificationKind.NeedsInput,
			description: 'Review and approve the pending tool request below.',
			needsInputPart: {
				kind: 'toolConfirmation',
				requestId: 'request-tool-confirmation',
				toolCallId: 'tool-call-1',
				title: 'List directory contents',
				buttonLabels: ['Allow Once', 'Skip'],
			},
		}]);
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
			repositoryLabel: item.repositoryLabel,
			pullRequestStates: item.pullRequestStates?.map(state => ({ label: state.label, statusLabel: state.statusLabel, iconId: state.icon.id, pullRequestUri: state.pullRequestUri?.toString() })),
			actions: item.actions.map(action => action.kind),
		})), [{
			kind: InboxNotificationKind.FailingCI,
			repositoryLabel: 'owner/repo',
			pullRequestStates: [{ label: '#42', statusLabel: 'Checks failed', iconId: Codicon.gitPullRequestError.id, pullRequestUri: 'https://github.com/owner/repo/pull/42' }],
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
			repositoryLabel: item.repositoryLabel,
			pullRequestStates: item.pullRequestStates?.map(state => ({ label: state.label, statusLabel: state.statusLabel, iconId: state.icon.id })),
			actions: item.actions.map(action => action.kind),
		})), [{
			kind: InboxNotificationKind.PassingCI,
			repositoryLabel: 'owner/repo',
			pullRequestStates: [{ label: '#42', statusLabel: 'Open', iconId: Codicon.gitPullRequest.id }],
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
			repositoryLabel: item.repositoryLabel,
			pullRequestStates: item.pullRequestStates?.map(state => ({ label: state.label, statusLabel: state.statusLabel, iconId: state.icon.id })),
			actions: item.actions.map(action => action.kind),
		})), [{
			kind: InboxNotificationKind.ReviewComments,
			repositoryLabel: 'owner/repo',
			pullRequestStates: [{ label: '#43', statusLabel: 'Unresolved comments', iconId: Codicon.gitPullRequestComment.id }],
			actions: [InboxNotificationActionKind.OpenSession, InboxNotificationActionKind.AgentMergeAddressReviews, InboxNotificationActionKind.MarkDone],
		}]);
	});

	test('aggregates pull request notifications by kind and lists pull request states', () => {
		const gitHubService = new TestGitHubService();
		const fixture = createFixture([createSession({
			id: 'multi-pr',
			status: SessionStatus.Completed,
			updatedAt: 100,
			isRead: true,
			pullRequests: [
				{ owner: 'owner', repo: 'repo', number: 50 },
				{ owner: 'owner', repo: 'repo', number: 51 },
			],
		})], undefined, gitHubService);

		gitHubService.setPullRequest('owner', 'repo', 50, openPullRequest(50, 'sha50'));
		gitHubService.setPullRequest('owner', 'repo', 51, openPullRequest(51, 'sha51'));
		gitHubService.setCIStatus('owner', 'repo', 50, 'sha50', GitHubCIOverallStatus.Failure, [{
			id: 3,
			name: 'CI 50',
			status: GitHubCheckStatus.Completed,
			conclusion: GitHubCheckConclusion.Failure,
			startedAt: '2026-09-21T16:02:00Z',
			completedAt: '2026-09-21T16:03:00Z',
			detailsUrl: undefined,
		}]);
		gitHubService.setCIStatus('owner', 'repo', 51, 'sha51', GitHubCIOverallStatus.Failure, [{
			id: 4,
			name: 'CI 51',
			status: GitHubCheckStatus.Completed,
			conclusion: GitHubCheckConclusion.Failure,
			startedAt: '2026-09-21T16:04:00Z',
			completedAt: '2026-09-21T16:05:00Z',
			detailsUrl: undefined,
		}]);

		assert.deepStrictEqual(fixture.service.notifications.get().map(item => ({
			kind: item.kind,
			title: item.title,
			pullRequestStates: item.pullRequestStates?.map(state => ({ label: state.label, statusLabel: state.statusLabel, iconId: state.icon.id })),
		})), [{
			kind: InboxNotificationKind.FailingCI,
			title: 'CI Failing on 2 Pull Requests',
			pullRequestStates: [
				{ label: '#50', statusLabel: 'Checks failed', iconId: Codicon.gitPullRequestError.id },
				{ label: '#51', statusLabel: 'Checks failed', iconId: Codicon.gitPullRequestError.id },
			],
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
		})], undefined, gitHubService, undefined, undefined, false);

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

class TestChatService {
	private readonly _chatModels = new Map<string, IChatModel>();
	private readonly _chatModelsObservable = observableValue<readonly IChatModel[]>('test.chatModels', []);
	readonly chatModels = this._chatModelsObservable;

	getSession(chatResource: URI): IChatModel | undefined {
		return this._chatModels.get(chatResource.toString());
	}

	async acquireOrLoadSession(chatResource: URI): Promise<{ object: IChatModel; dispose(): void } | undefined> {
		const model = this.getSession(chatResource);
		return model ? { object: model, dispose: () => { } } : undefined;
	}

	setPendingQuestionCarousel(chatResource: URI, options: {
		readonly requestId: string;
		readonly resolveId: string;
		readonly allowSkip: boolean;
		readonly message: string;
		readonly questions: IChatQuestionCarousel['questions'];
	}): void {
		this._chatModels.set(chatResource.toString(), this._createChatModel({
			requestId: options.requestId,
			startedWaitingAt: 10,
			parts: [{
				kind: 'questionCarousel',
				resolveId: options.resolveId,
				allowSkip: options.allowSkip,
				message: options.message,
				questions: options.questions,
				isUsed: false,
			}],
		}));
		this._chatModelsObservable.set([...this._chatModels.values()], undefined);
	}

	setPendingConfirmation(chatResource: URI, options: {
		readonly requestId: string;
		readonly title: string;
		readonly message: string;
		readonly data: unknown;
		readonly buttons?: readonly string[];
	}): void {
		this._chatModels.set(chatResource.toString(), this._createChatModel({
			requestId: options.requestId,
			startedWaitingAt: 10,
			parts: [{
				kind: 'confirmation',
				title: options.title,
				message: options.message,
				data: options.data,
				buttons: options.buttons ? [...options.buttons] : undefined,
				isUsed: false,
			}],
		}));
		this._chatModelsObservable.set([...this._chatModels.values()], undefined);
	}

	setPendingParts(chatResource: URI, options: {
		readonly requestId: string;
		readonly startedWaitingAt: number;
		readonly parts: IChatResponseModel['response']['value'];
	}): void {
		this._chatModels.set(chatResource.toString(), this._createChatModel(options));
		this._chatModelsObservable.set([...this._chatModels.values()], undefined);
	}

	setCompletedResponse(chatResource: URI, options: {
		readonly requestId: string;
		readonly markdown: string;
	}): void {
		this._chatModels.set(chatResource.toString(), this._createChatModel({
			requestId: options.requestId,
			parts: [{
				kind: 'markdownContent',
				content: { value: options.markdown },
			}],
			isComplete: true,
		}));
		this._chatModelsObservable.set([...this._chatModels.values()], undefined);
	}

	private _createChatModel(options: { readonly requestId: string; readonly parts: IChatResponseModel['response']['value']; readonly startedWaitingAt?: number; readonly isComplete?: boolean }): IChatModel {
		const response = upcastPartial<IChatResponseModel>({
			requestId: options.requestId,
			isCanceled: false,
			isComplete: options.isComplete ?? false,
			response: {
				value: options.parts,
				getMarkdown: () => '',
				getFinalResponse: () => '',
				toString: () => '',
			},
			isPendingConfirmation: observableValue(`test.pendingConfirmation.${options.requestId}`, options.startedWaitingAt === undefined ? undefined : { startedWaitingAt: options.startedWaitingAt }),
		});
		const request = upcastPartial<IChatRequestModel>({
			id: `request.${options.requestId}`,
			response,
			isHiddenFromTranscript: false,
			shouldBeRemovedOnSend: undefined,
		});
		return upcastPartial<IChatModel>({
			getRequests: () => [request],
		});
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
