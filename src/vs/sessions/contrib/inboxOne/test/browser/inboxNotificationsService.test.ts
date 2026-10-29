/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { type IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { DisposableStore, IDisposable, IReference, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, ISettableObservable, autorun, observableValue, transaction, waitForState } from '../../../../../base/common/observable.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { errorHandler, setUnexpectedErrorHandler } from '../../../../../base/common/errors.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService, TelemetryLevel } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IGitHubService } from '../../../github/browser/githubService.js';
import { GitHubCIOverallStatus, GitHubCheckConclusion, GitHubCheckStatus, GitHubPullRequestState, IGitHubCICheck, IGitHubPullRequest, IGitHubPullRequestReviewThread } from '../../../github/common/types.js';
import { IAgentHostSessionsProvider, IAgentMergeClientState } from '../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersChangeEvent, ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { IChat, ISessionArtifact, ISessionChangeset, ISessionChangesetOperation, SessionArtifactKind, SessionChangesetOperationScope, SessionChangesetOperationStatus, SessionStatus, type IGitHubInfo, type ISession, type ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { cleanPreviewText, InboxNotificationsService, parseDetailSummary } from '../../browser/inboxNotificationsService.js';
import { getInboxPullRequestMergeOperation, InboxNotificationActionKind, InboxNotificationKind, InboxNotificationPriority, InboxNotificationsSortMode, type IInboxNotificationItem } from '../../common/inboxNotificationsService.js';
import { GitHubPullRequestModel } from '../../../github/browser/models/githubPullRequestModel.js';
import { GitHubPullRequestCIModel } from '../../../github/browser/models/githubPullRequestCIModel.js';
import { GitHubPullRequestReviewThreadsModel } from '../../../github/browser/models/githubPullRequestReviewThreadsModel.js';
import { IChatQuestionCarousel, IChatService, IChatToolInvocation } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionsService } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ChatAgentLocation } from '../../../../../workbench/contrib/chat/common/constants.js';
import { ILanguageModelsService } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { IChatUtilityModelRequest, IChatUtilityModelService } from '../../../../../workbench/contrib/chat/common/chatUtilityModelService.js';
import { IChatModel, IChatRequestModel, IChatResponseModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { IChatEntitlementService, IChatSentiment } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { CHAT_INBOX_ENABLED_SETTING } from '../../browser/inboxNotificationsConstants.js';

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
		readonly lastTurnEnd?: number;
		readonly supportsDelete?: boolean;
		readonly changesets?: readonly ISessionChangeset[];
		readonly pullRequest?: {
			readonly owner: string;
			readonly repo: string;
			readonly number: number;
		};
		readonly pullRequests?: readonly {
			readonly owner: string;
			readonly repo: string;
			readonly number: number;
			readonly createdByThisSession?: boolean;
		}[];
		readonly chatResource?: URI;
		readonly artifacts?: readonly ISessionArtifact[];
	}): ISession {
		const key = `inboxNotificationsService/${options.id}`;
		const chatResource = options.chatResource ?? URI.parse(`test:///chat/${options.id}`);
		const chat = upcastPartial<IChat>({ resource: chatResource, status: observableValue(`${key}/chatStatus`, options.status), changesets: observableValue<readonly ISessionChangeset[]>(`${key}/changesets`, options.changesets ?? []) });
		const gitHubInfo: IGitHubInfo | undefined = options.pullRequests?.length ? {
			owner: options.pullRequests[0].owner,
			repo: options.pullRequests[0].repo,
			pullRequests: options.pullRequests.map(pullRequest => ({
				owner: pullRequest.owner,
				repo: pullRequest.repo,
				number: pullRequest.number,
				uri: URI.parse(`https://github.com/${pullRequest.owner}/${pullRequest.repo}/pull/${pullRequest.number}`),
				state: 'open',
				createdByThisSession: pullRequest.createdByThisSession ?? true,
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
			lastTurnEnd: observableValue(`${key}/lastTurnEnd`, new Date(options.lastTurnEnd ?? options.updatedAt)),
			capabilities: observableValue(`${key}/capabilities`, { supportsMultipleChats: false, supportsDelete: options.supportsDelete ?? true }),
			description: observableValue<IMarkdownString | undefined>(`${key}/description`, options.description ? { value: options.description } : undefined),
			isRead: observableValue(`${key}/isRead`, options.isRead ?? false),
			isArchived: observableValue(`${key}/isArchived`, options.isArchived ?? false),
			chats: observableValue(`${key}/chats`, [chat]),
			mainChat: observableValue(`${key}/mainChat`, chat),
			workspace: observableValue<ISessionWorkspace | undefined>(`${key}/workspace`, workspace),
			artifacts: observableValue(`${key}/artifacts`, options.artifacts ?? []),
		});
	}

	function createFixture(
		initialSessions: readonly ISession[],
		storageService?: InMemoryStorageService,
		gitHubService?: TestGitHubService,
		chatService?: TestChatService,
		agentHostProvider?: TestAgentHostProvider,
		withAgentHostProvider = true,
		additionalProviders: readonly ISessionsProvider[] = [],
		inboxEnabled = true,
		options: {
			readonly utilityRequest?: (request: IChatUtilityModelRequest) => Promise<string | undefined>;
			readonly selectModels?: () => Promise<string[]>;
			readonly onDidChangeLanguageModels?: Event<string>;
			readonly onDidChangeContentProviderSchemes?: IChatSessionsService['onDidChangeContentProviderSchemes'];
			readonly telemetryLevel?: TelemetryLevel;
		} = {},
	): {
		readonly service: InboxNotificationsService;
		readonly storageService: InMemoryStorageService;
		readonly gitHubService: TestGitHubService;
		readonly chatService: TestChatService;
		readonly agentHostProvider: TestAgentHostProvider;
		readonly telemetryEvents: { readonly eventName: string; readonly data: Record<string, unknown> }[];
		readonly configurationService: TestConfigurationService;
		readonly sentiment: ISettableObservable<IChatSentiment>;
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
			getSession: (resource: URI) => sessions.find(candidate => candidate.resource.toString() === resource.toString()),
		});
		const effectiveStorageService = storageService ?? store.add(new InMemoryStorageService());
		const effectiveGitHubService = gitHubService ?? new TestGitHubService();
		const effectiveChatService = chatService ?? new TestChatService();
		const effectiveAgentHostProvider = agentHostProvider ?? new TestAgentHostProvider();
		const provider = upcastPartial<IAgentHostSessionsProvider>({
			id: effectiveAgentHostProvider.id,
			getAgentMergeClientStateObservable: (sessionId: string) => effectiveAgentHostProvider.getAgentMergeClientStateObservable(sessionId),
			getAgentMergeSessionState: (sessionId: string) => effectiveAgentHostProvider.getAgentMergeSessionState(sessionId),
			setAgentMergeEnabled: async (sessionId: string, enabled: boolean) => effectiveAgentHostProvider.setAgentMergeEnabled(sessionId, enabled),
			setAgentMergeOverrides: async (sessionId: string, overrides) => effectiveAgentHostProvider.setAgentMergeOverrides(sessionId, overrides),
		});
		const providerMap = new Map<string, ISessionsProvider>(additionalProviders.map(provider => [provider.id, provider]));
		if (withAgentHostProvider) {
			providerMap.set(provider.id, provider);
		}
		const sessionsProvidersService = upcastPartial<ISessionsProvidersService>({
			onDidChangeProviders: providerChangeEmitter.event,
			getProvider<T extends ISessionsProvider>(providerId: string): T | undefined {
				return providerMap.get(providerId) as T | undefined;
			},
			getProviders(): ISessionsProvider[] {
				return [...providerMap.values()];
			},
		});
		const telemetryEvents: { readonly eventName: string; readonly data: Record<string, unknown> }[] = [];
		const configurationService = new TestConfigurationService({ [CHAT_INBOX_ENABLED_SETTING]: inboxEnabled });
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const sentiment = observableValue<IChatSentiment>('test.chatSentiment', {});
		const service = store.add(new InboxNotificationsService(
			managementService,
			sessionsProvidersService,
			upcastPartial<IChatService>(effectiveChatService),
			upcastPartial<IGitHubService>(effectiveGitHubService),
			effectiveStorageService,
			upcastPartial<ILanguageModelsService>({
				selectLanguageModels: options.selectModels ?? (async () => options.utilityRequest ? ['utility-model'] : []),
				onDidChangeLanguageModels: options.onDidChangeLanguageModels ?? Event.None,
			}),
			upcastPartial<IChatUtilityModelService>({ sendRequest: async request => options.utilityRequest?.(request) }),
			upcastPartial<ITelemetryService>({ telemetryLevel: options.telemetryLevel ?? TelemetryLevel.USAGE, publicLog2: ((eventName: string, data?: Record<string, unknown>) => { telemetryEvents.push({ eventName, data: data ?? {} }); }) as ITelemetryService['publicLog2'] }),
			configurationService,
			upcastPartial<IChatEntitlementService>({ sentimentObs: sentiment }),
			upcastPartial<IChatSessionsService>({ onDidChangeContentProviderSchemes: options.onDidChangeContentProviderSchemes ?? Event.None }),
			store.add(new NullLogService()),
		));
		return {
			service,
			storageService: effectiveStorageService,
			gitHubService: effectiveGitHubService,
			chatService: effectiveChatService,
			agentHostProvider: effectiveAgentHostProvider,
			telemetryEvents,
			configurationService,
			sentiment,
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
			createSession({ id: 'completed-read', status: SessionStatus.Completed, updatedAt: 400, isRead: true }),
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
				priority: InboxNotificationPriority.Now,
				description: 'waiting for user answer',
				actionKinds: [InboxNotificationActionKind.OpenSession, InboxNotificationActionKind.MarkDone],
			},
			{
				kind: InboxNotificationKind.Completed,
				priority: InboxNotificationPriority.Later,
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
				'low-new',
			],
			recencyOrder: [
				'low-new',
				'high-old',
			],
			restoredOrder: [
				'high-old',
				'low-new',
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
			description: 'Attention needed',
		}]);
	});

	test('uses provider description for completed cards regardless of resident chat history', () => {
		const chatResource = URI.parse('test:///chat/completed-preview');
		const chatService = new TestChatService();
		chatService.setCompletedResponse(chatResource, {
			requestId: 'request-completed-preview',
			markdown: 'Implemented the fix for CI failures and updated the flaky test coverage.',
		});
		const fixture = createFixture([
			createSession({ id: 'completed-preview', status: SessionStatus.Completed, updatedAt: 200, isRead: false, chatResource, description: 'Provider summary' }),
		], undefined, undefined, chatService);

		assert.deepStrictEqual(fixture.service.notifications.get().map(item => ({
			kind: item.kind,
			description: item.description,
		})), [{
			kind: InboxNotificationKind.Completed,
			description: 'Provider summary',
		}]);
	});

	test('a re-completed session after dismissal surfaces as a fresh later-priority item', () => {
		const chatResource = URI.parse('test:///chat/recompleted');
		const chatService = new TestChatService();
		chatService.setCompletedResponse(chatResource, { requestId: 'turn-1', markdown: 'First result.' });
		const session = createSession({ id: 'recompleted', status: SessionStatus.Completed, updatedAt: 200, isRead: false, chatResource });
		const fixture = createFixture([session], undefined, undefined, chatService);

		const firstId = fixture.service.notifications.get()[0].id;
		assert.strictEqual(fixture.service.notifications.get()[0].kind, InboxNotificationKind.Completed);
		fixture.service.dismissNotification(firstId);
		assert.deepStrictEqual(fixture.service.notifications.get(), []);

		// The session is messaged again and finishes another turn without needing input.
		chatService.setCompletedResponse(chatResource, { requestId: 'turn-2', markdown: 'Second result.' });
		(session.lastTurnEnd as ISettableObservable<Date | undefined>).set(new Date(300), undefined);

		const active = fixture.service.notifications.get();
		assert.strictEqual(active.length, 1);
		assert.strictEqual(active[0].kind, InboxNotificationKind.Completed);
		assert.strictEqual(active[0].priority, InboxNotificationPriority.Later);
		assert.notStrictEqual(active[0].id, firstId);
	});

	test('completed ids survive chat-model residency and unrelated metadata changes, and read cards leave the inbox', () => {
		const session = createSession({ id: 'stable-completion', status: SessionStatus.Completed, updatedAt: 200, lastTurnEnd: 100 });
		const chatResource = session.mainChat.get().resource;
		const chatService = new TestChatService();
		const fixture = createFixture([session], undefined, undefined, chatService);
		const id = fixture.service.notifications.get()[0].id;
		chatService.setCompletedResponse(chatResource, { requestId: 'resident-request', markdown: 'Result' });
		(session.updatedAt as ISettableObservable<Date>).set(new Date(300), undefined);
		assert.strictEqual(fixture.service.notifications.get()[0].id, id);
		fixture.service.dismissNotification(id);
		chatService.removeSession(chatResource);
		assert.deepStrictEqual(fixture.service.notifications.get(), []);
		(session.lastTurnEnd as ISettableObservable<Date | undefined>).set(new Date(400), undefined);
		assert.strictEqual(fixture.service.notifications.get().length, 1);
		(session.isRead as ISettableObservable<boolean>).set(true, undefined);
		assert.deepStrictEqual(fixture.service.notifications.get(), []);
	});

	test('loads completed history only on detail request and releases the reference afterward', async () => {
		const session = createSession({ id: 'lazy-completion', status: SessionStatus.Completed, updatedAt: 200, description: 'Provider summary' });
		const chatService = new TestChatService();
		let loads = 0;
		let releases = 0;
		chatService.setAcquireOrLoadHandler(async resource => {
			loads++;
			chatService.setCompletedResponse(resource, { requestId: 'loaded', markdown: 'Final result' });
			return { object: chatService.getSession(resource)!, dispose: () => { releases++; chatService.removeSession(resource); } };
		});
		const fixture = createFixture([session], undefined, undefined, chatService);
		const item = fixture.service.notifications.get()[0];
		assert.deepStrictEqual({ loads, description: item.description }, { loads: 0, description: 'Provider summary' });
		fixture.service.requestDetailSummary(item);
		await waitForState(fixture.service.isLoading, loading => !loading);
		assert.deepStrictEqual({ loads, releases, id: fixture.service.notifications.get()[0].id }, { loads: 1, releases: 1, id: item.id });
	});

	test('keeps the transcript tail for detail without requesting content classification at any telemetry level', async () => {
		for (const telemetryLevel of [TelemetryLevel.NONE, TelemetryLevel.ERROR, TelemetryLevel.USAGE]) {
			const session = createSession({ id: `tail-${telemetryLevel}`, status: SessionStatus.Completed, updatedAt: 200 });
			const chatService = new TestChatService();
			chatService.setCompletedResponse(session.mainChat.get().resource, { requestId: 'long', markdown: `Old progress. ${'early '.repeat(1500)}Final result: fixed the regression.` });
			const requests: IChatUtilityModelRequest[] = [];
			const fixture = createFixture([session], undefined, undefined, chatService, undefined, true, [], true, {
				telemetryLevel,
				utilityRequest: async request => {
					requests.push(request);
					return '{"status":"Fixed","decisions":[],"evidence":[]}';
				},
			});
			fixture.service.requestDetailSummary(fixture.service.notifications.get()[0]);
			await waitForState(fixture.service.isLoading, loading => !loading);
			assert.deepStrictEqual(requests.map(request => request.purpose), ['inboxDetailSummary']);
			for (const request of requests) {
				const input = request.messages.flatMap(message => message.content).filter(part => part.type === 'text').map(part => part.value).join('\n');
				assert.ok(input.includes('Final result: fixed the regression.'));
				assert.ok(!input.includes('Old progress.'));
				assert.strictEqual(request.background, true);
			}
		}
	});

	test('bounds evidence-pack files to the most recent 30 unique sources and excludes canceled responses', async () => {
		const session = createSession({ id: 'bounded-files', status: SessionStatus.Completed, updatedAt: 200 });
		const chatService = new TestChatService();
		chatService.setCompletedResponse(session.mainChat.get().resource, {
			requestId: 'files', markdown: 'Updated these files.',
			parts: Array.from({ length: 40 }, (_, index) => ({ kind: 'inlineReference', inlineReference: URI.file(`/workspace/file-${index}.ts`) })),
		});
		const model = chatService.getSession(session.mainChat.get().resource)!;
		const requests = model.getRequests();
		model.getRequests = () => [...requests, upcastPartial<IChatRequestModel>({
			response: upcastPartial<IChatResponseModel>({
				isCanceled: true,
				response: upcastPartial<IChatResponseModel['response']>({
					value: [{ kind: 'inlineReference', inlineReference: URI.file('/workspace/canceled.ts') }],
				}),
			}),
		})];
		let input = '';
		const fixture = createFixture([session], undefined, undefined, chatService, undefined, true, [], true, {
			utilityRequest: async request => {
				input = request.messages.flatMap(message => message.content).filter(part => part.type === 'text').map(part => part.value).join('\n');
				return '{"status":"Updated","decisions":[],"evidence":[]}';
			},
		});
		fixture.service.requestDetailSummary(fixture.service.notifications.get()[0]);
		await waitForState(fixture.service.isLoading, loading => !loading);
		assert.deepStrictEqual({
			files: [...new Set(input.match(/file-\d+\.ts/g))], canceled: input.includes('canceled.ts'),
		}, { files: Array.from({ length: 30 }, (_, index) => `file-${39 - index}.ts`), canceled: false });
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

	test('surfaces a needs-input part that streams into an already-loaded model (window reload)', () => {
		const chatResource = URI.parse('test:///chat/reload-question');
		const chatService = new TestChatService();
		const fixture = createFixture([
			createSession({ id: 'reload-question', status: SessionStatus.NeedsInput, updatedAt: 200, chatResource }),
		], undefined, undefined, chatService);

		// The restored model is loaded but its active turn (holding the pending question) has
		// not streamed in yet, as happens right after a window reload.
		const streamQuestion = chatService.installDeferredQuestionModel(chatResource, disposables, {
			requestId: 'reload-request',
			resolveId: 'reload-resolve',
			allowSkip: true,
			message: 'Answer to continue.',
			questions: [{ id: 'q1', type: 'text', title: 'Question 1', required: true }],
		});

		// Observe notifications so the derivation stays live, mirroring the inbox view. A stale
		// derivation is what previously hid the pending part until the session was opened.
		const observed: (readonly IInboxNotificationItem[])[] = [];
		disposables.add(autorun(reader => {
			observed.push(fixture.service.notifications.read(reader));
		}));

		assert.strictEqual(observed.at(-1)?.[0].needsInputPart, undefined);

		// The active turn's question streams into the already-loaded model (no change to the set
		// of loaded models). The observed item must now carry the interactive part.
		streamQuestion();

		const latest = observed.at(-1);
		assert.strictEqual(latest?.length, 1);
		assert.strictEqual(latest?.[0].kind, InboxNotificationKind.NeedsInput);
		assert.strictEqual(latest?.[0].needsInputPart?.kind, 'questionCarousel');
		assert.strictEqual(latest?.[0].needsInputPart?.requestId, 'reload-request');
		assert.strictEqual(latest?.[0].description, 'Answer the pending questions below.');
		assert.deepStrictEqual(fixture.telemetryEvents, []);
	});

	test('preview input includes answered questions as context but never the pending question', () => {
		const chatResource = URI.parse('test:///chat/context-preview');
		const chatService = new TestChatService();
		const fixture = createFixture([
			createSession({ id: 'context-preview', status: SessionStatus.NeedsInput, updatedAt: 200, chatResource }),
		], undefined, undefined, chatService);

		// A question-driven session: the user has answered several questions (retained in history
		// as used carousels) and a new question is pending in the same turn.
		chatService.setConversationWithPendingQuestion(chatResource, {
			priorResponses: [{ requestId: 'turn-1', markdown: 'Kicking off 20 questions.' }],
			pending: {
				requestId: 'turn-2',
				prose: 'Am I right? Your favorite color is Sky Blue!',
				resolveId: 'q-shade',
				message: 'Which pale blue shade?',
				questionTitle: 'Which of these periwinkle-ish shades feels closest?',
				answered: [
					{ title: 'Favorite food?', answer: 'Tomato and Egg Stir-Fry' },
					{ title: 'Favorite color family?', answer: 'Blue' },
				],
			},
		});

		const input = fixture.service.notifications.get()[0].previewInputText ?? '';
		// The recently answered questions ARE first-class context and must appear...
		assert.ok(input.includes('Favorite color family?') && input.includes('Blue'), `expected answered Q&A in preview input, got: ${input}`);
		assert.ok(input.includes('Tomato and Egg Stir-Fry'), `expected earlier answer in preview input, got: ${input}`);
		// ...while the current pending question and the turn's ask prose must not, so the preview
		// summarizes the situation rather than restating the ask.
		assert.ok(!input.includes('periwinkle-ish shades'), `did not expect the pending question in preview input, got: ${input}`);
		assert.ok(!input.includes('Which pale blue shade?'), `did not expect the pending message in preview input, got: ${input}`);
		assert.ok(!input.includes('Am I right?'), `did not expect the pending turn prose in preview input, got: ${input}`);
	});

	test('preview input foregrounds the most recent answered exchange', () => {
		const chatResource = URI.parse('test:///chat/recent-exchange-preview');
		const chatService = new TestChatService();
		const fixture = createFixture([
			createSession({ id: 'recent-exchange-preview', status: SessionStatus.NeedsInput, updatedAt: 200, chatResource }),
		], undefined, undefined, chatService);
		chatService.setConversationWithPendingQuestion(chatResource, {
			priorResponses: [],
			pending: {
				requestId: 'turn-1',
				resolveId: 'q-next',
				message: 'Next question?',
				questionTitle: 'Next question',
				answered: [
					{ title: 'Favorite food?', answer: 'Tomato and Egg Stir-Fry' },
					{ title: 'Favorite color family?', answer: 'Blue' },
					{ title: 'Which specific blue?', answer: 'Sky Blue' },
				],
			},
		});

		const input = fixture.service.notifications.get()[0].previewInputText ?? '';
		const recentLine = input.split('\n').find(line => line.startsWith('Recent progress:')) ?? '';
		const earlierLine = input.split('\n').find(line => line.startsWith('Context so far:')) ?? '';
		// The newest answered exchange gets its own prominent line so the model foregrounds it...
		assert.ok(recentLine.includes('Which specific blue?') && recentLine.includes('Sky Blue'), `expected the newest exchange on the recent line, got: ${input}`);
		// ...while older answers are relegated to supporting context.
		assert.ok(earlierLine.includes('Favorite food?') && earlierLine.includes('Favorite color family?'), `expected earlier answers in the earlier context, got: ${input}`);
		assert.ok(!recentLine.includes('Favorite food?'), `did not expect older answers on the recent line, got: ${input}`);
	});

	test('preview input regenerates as new questions are answered', () => {
		const chatResource = URI.parse('test:///chat/regen-preview');
		const chatService = new TestChatService();
		const fixture = createFixture([
			createSession({ id: 'regen-preview', status: SessionStatus.NeedsInput, updatedAt: 200, chatResource }),
		], undefined, undefined, chatService);

		chatService.setConversationWithPendingQuestion(chatResource, {
			priorResponses: [],
			pending: {
				requestId: 'turn-1',
				resolveId: 'q-2',
				message: 'Q2?',
				questionTitle: 'Question two',
				answered: [{ title: 'Favorite food?', answer: 'Tomato and Egg Stir-Fry' }],
			},
		});
		const first = fixture.service.notifications.get()[0].previewInputText ?? '';

		// The user answers another question; the context (and therefore the preview signature) must
		// change so the preview regenerates rather than reusing the earlier summary.
		chatService.setConversationWithPendingQuestion(chatResource, {
			priorResponses: [],
			pending: {
				requestId: 'turn-1',
				resolveId: 'q-3',
				message: 'Q3?',
				questionTitle: 'Question three',
				answered: [
					{ title: 'Favorite food?', answer: 'Tomato and Egg Stir-Fry' },
					{ title: 'Favorite color?', answer: 'Sky Blue' },
				],
			},
		});
		const second = fixture.service.notifications.get()[0].previewInputText ?? '';

		assert.ok(second.includes('Favorite color?') && second.includes('Sky Blue'), `expected newly answered question in preview input, got: ${second}`);
		assert.notStrictEqual(first, second);
		const firstSignature = fixture.service.notifications.get()[0].previewSignature;
		assert.ok(firstSignature && firstSignature.length > 0);
	});

	test('resolves the preview pending state with a fallback when no model is available', async () => {
		// The fixture's language model mock returns no models, so generation cannot produce a
		// preview. The service must still resolve the pending state by publishing the item's own
		// description as a fallback, so a needs-input card never hangs on its loading message.
		const fixture = createFixture([
			createSession({ id: 'input', status: SessionStatus.NeedsInput, updatedAt: 200, description: 'waiting for user answer' }),
		]);
		const item = fixture.service.notifications.get()[0];
		assert.ok(item.previewSignature);
		fixture.service.requestPreview(item);

		const signature = item.previewSignature!;
		await waitForState(fixture.service.previews, previews => previews.has(signature));
		assert.strictEqual(fixture.service.previews.get().get(signature), item.description);
	});

	test('logs preview generation telemetry with a bounded outcome and no content', async () => {
		const fixture = createFixture([
			createSession({ id: 'input', status: SessionStatus.NeedsInput, updatedAt: 200, description: 'waiting for user answer' }),
		]);
		const item = fixture.service.notifications.get()[0];
		fixture.service.requestPreview(item);

		await waitForState(fixture.service.isLoading, isLoading => !isLoading);
		const event = fixture.telemetryEvents.find(entry => entry.eventName === 'agents/inboxPreviewGenerated');
		assert.ok(event, 'expected an agents/inboxPreviewGenerated event');
		// No model available -> empty outcome; bounded fields only, never the generated/description text.
		assert.strictEqual(event!.data.result, 'empty');
		assert.strictEqual(event!.data.notificationKind, item.kind);
		assert.strictEqual(event!.data.outputLength, 0);
		assert.ok(typeof event!.data.agentSessionId === 'string' && event!.data.agentSessionId !== 'none');
		assert.ok(!JSON.stringify(event!.data).includes('waiting for user answer'));
	});

	for (const generated of [true, false]) {
		test(`bounds published previews to 200 LRU entries, including fallbacks: generated=${generated}`, async () => {
			let requests = 0;
			const fixture = createFixture([createSession({ id: 'preview-cache', status: SessionStatus.Completed, updatedAt: 200 })],
				undefined, undefined, undefined, undefined, true, [], true, {
				utilityRequest: async () => { requests++; return generated ? 'Generated preview' : undefined; },
			});
			const base = fixture.service.notifications.get()[0];
			const items = Array.from({ length: 201 }, (_, index) => ({
				...base, previewSignature: `preview-${index}`, previewInputText: 'Recorded context',
			}));
			const request = async (item: IInboxNotificationItem) => {
				fixture.service.requestPreview(item);
				await waitForState(fixture.service.isLoading, loading => !loading);
			};
			for (const item of items.slice(0, 200)) {
				await request(item);
			}
			const initial = fixture.service.previews.get();
			await request(items[0]);
			await request(items[200]);
			const afterEviction = [...fixture.service.previews.get().keys()];
			await request(items[1]);
			assert.deepStrictEqual({
				initial: [...initial.keys()],
				afterEviction,
				retained: fixture.service.previews.get().size,
				regenerated: fixture.service.previews.get().has(items[1].previewSignature),
				requests,
			}, {
				initial: items.slice(0, 200).map(item => item.previewSignature),
				afterEviction: [...items.slice(2, 200), items[0], items[200]].map(item => item.previewSignature),
				retained: 200, regenerated: true, requests: 202,
			});
		});

		test(`bounds published summaries to 50 LRU entries, including retryable empty results: generated=${generated}`, async () => {
			let requests = 0;
			const session = createSession({ id: 'summary-cache', status: SessionStatus.Completed, updatedAt: 200 });
			const chatService = new TestChatService();
			chatService.setCompletedResponse(session.mainChat.get().resource, { requestId: 'recorded', markdown: 'Recorded result' });
			const fixture = createFixture([session], undefined, undefined, chatService, undefined, true, [], true, {
				telemetryLevel: TelemetryLevel.NONE,
				utilityRequest: async () => {
					requests++;
					return generated ? '{"status":"Generated summary","decisions":[],"evidence":[]}' : undefined;
				},
			});
			const base = fixture.service.notifications.get()[0];
			const items = Array.from({ length: 51 }, (_, index) => ({ ...base, id: `summary-${index}` }));
			const request = async (item: IInboxNotificationItem) => {
				fixture.service.requestDetailSummary(item);
				await waitForState(fixture.service.isLoading, loading => !loading);
			};
			for (const item of items.slice(0, 50)) {
				await request(item);
			}
			const initial = fixture.service.detailSummaries.get();
			await request(items[0]);
			await request(items[50]);
			const afterEviction = [...fixture.service.detailSummaries.get().keys()];
			await request(items[1]);
			assert.deepStrictEqual({
				initial: [...initial.keys()],
				afterEviction,
				retained: fixture.service.detailSummaries.get().size,
				regenerated: fixture.service.detailSummaries.get().has(items[1].id),
				requests,
			}, {
				initial: items.slice(0, 50).map(item => item.id),
				afterEviction: [...items.slice(2, 50), items[0], items[50]].map(item => item.id),
				retained: 50, regenerated: true, requests: generated ? 52 : 53,
			});
		});
	}

	test('invalidates cached fallbacks and empty summaries without resurrecting them on later publication', async () => {
		const modelsChanged = disposables.add(new Emitter<string>());
		const session = createSession({ id: 'retry-cache', status: SessionStatus.Completed, updatedAt: 200 });
		const chatService = new TestChatService();
		chatService.setCompletedResponse(session.mainChat.get().resource, { requestId: 'recorded', markdown: 'Recorded result' });
		let generated = false;
		const fixture = createFixture([session], undefined, undefined, chatService, undefined, true, [], true, {
			telemetryLevel: TelemetryLevel.NONE,
			onDidChangeLanguageModels: modelsChanged.event,
			utilityRequest: async request => !generated ? undefined : request.purpose === 'inboxPreview'
				? 'Generated preview' : '{"status":"Generated summary","decisions":[],"evidence":[]}',
		});
		const first = fixture.service.notifications.get()[0];
		const request = async (item: IInboxNotificationItem) => {
			fixture.service.requestPreview(item);
			fixture.service.requestDetailSummary(item);
			await waitForState(fixture.service.isLoading, loading => !loading);
		};
		await request(first);
		generated = true;
		modelsChanged.fire('utility-model');
		const invalidated = { previews: fixture.service.previews.get().size, summaries: fixture.service.detailSummaries.get().size };
		const second = { ...first, id: 'second', previewSignature: 'second-preview' };
		await request(second);
		const published = {
			previews: [...fixture.service.previews.get().keys()],
			summaries: [...fixture.service.detailSummaries.get().keys()],
		};
		await request(first);
		assert.deepStrictEqual({
			invalidated, published,
			preview: fixture.service.previews.get().get(first.previewSignature!),
			summary: fixture.service.detailSummaries.get().get(first.id)?.status,
		}, {
			invalidated: { previews: 0, summaries: 0 },
			published: { previews: [second.previewSignature], summaries: [second.id] },
			preview: 'Generated preview', summary: 'Generated summary',
		});
	});

	for (const stalledStage of ['discovery', 'request'] as const) {
		test(`settles previews after 10 seconds of stalled ${stalledStage} and ignores late results`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const discovery = new DeferredPromise<string[]>();
			const response = new DeferredPromise<string | undefined>();
			const previousHandler = errorHandler.getUnexpectedErrorHandler();
			const errors: Error[] = [];
			setUnexpectedErrorHandler(error => errors.push(error));
			try {
				let requests = 0;
				const fixture = createFixture([createSession({ id: 'timeout', status: SessionStatus.Completed, updatedAt: 200, description: 'Existing task context' })],
					undefined, undefined, undefined, undefined, true, [], true, {
					selectModels: () => stalledStage === 'discovery' ? discovery.p : Promise.resolve(['utility']),
					utilityRequest: () => { requests++; return response.p; },
				});
				const item = fixture.service.notifications.get()[0];
				const started = Date.now();
				fixture.service.requestPreview(item);
				await waitForState(fixture.service.isLoading, loading => !loading);
				await discovery.complete(['utility']);
				await response.complete('Late generated preview');
				fixture.service.requestPreview(item);
				assert.deepStrictEqual({
					elapsed: Date.now() - started,
					preview: fixture.service.previews.get().get(item.previewSignature!),
					requests,
					errors: errors.map(error => error.message),
				}, {
					elapsed: 10_000,
					preview: item.description,
					requests: stalledStage === 'discovery' ? 0 : 1,
					errors: [],
				});
			} finally {
				setUnexpectedErrorHandler(previousHandler);
			}
		}));
	}

	test('disposal settles loading during model discovery without starting a utility request', async () => {
		const discovery = new DeferredPromise<string[]>();
		let requests = 0;
		const fixture = createFixture([createSession({ id: 'dispose-preview', status: SessionStatus.Completed, updatedAt: 200 })],
			undefined, undefined, undefined, undefined, true, [], true, {
			selectModels: () => discovery.p,
			utilityRequest: async () => { requests++; return 'Must not run'; },
		});
		fixture.service.requestPreview(fixture.service.notifications.get()[0]);
		fixture.service.dispose();
		await waitForState(fixture.service.isLoading, loading => !loading);
		await discovery.complete(['utility']);
		assert.deepStrictEqual({ requests, previews: fixture.service.previews.get().size }, { requests: 0, previews: 0 });
	});

	test('grounds interpretation in bounded recorded commands even without assistant prose and accepts only supplied sources', async () => {
		const requests: IChatUtilityModelRequest[] = [];
		const session = createSession({ id: 'commands', title: 'Fix keyboard navigation', status: SessionStatus.Completed, updatedAt: 200 });
		const chatService = new TestChatService();
		const output = `Focus restoration failed. ${'stack trace '.repeat(200)}`;
		const uri = URI.parse('test:///terminal-output');
		chatService.setCompletedResponse(session.mainChat.get().resource, {
			requestId: 'command-only', markdown: '', parts: [{
				kind: 'toolInvocationSerialized', toolCallId: 'test', toolId: 'terminal', invocationMessage: 'Run tests',
				originMessage: undefined, pastTenseMessage: undefined, presentation: undefined, source: undefined,
				isConfirmed: true, isComplete: true,
				toolSpecificData: {
					kind: 'terminal', language: 'shell', commandLine: { original: 'npm test' },
					terminalCommandState: { exitCode: 1 }, terminalCommandOutput: { text: output }, terminalCommandUri: uri,
				},
			}]
		});
		const fixture = createFixture([session], undefined, undefined, chatService, undefined, true, [], true, {
			telemetryLevel: TelemetryLevel.NONE,
			utilityRequest: async request => {
				requests.push(request);
				return '{"status":"One test failed.","decisions":[],"evidence":[{"text":"Focus restoration failed.","artifact":"A1"},{"text":"Invented","artifact":"A99"}]}';
			},
		});
		const item = fixture.service.notifications.get()[0];
		fixture.service.requestDetailSummary(item);
		await waitForState(fixture.service.isLoading, loading => !loading);
		const input = requests[0].messages[1].content.filter(part => part.type === 'text').map(part => part.value).join('\n');
		assert.deepStrictEqual({
			purposes: requests.map(request => request.purpose),
			recorded: input.includes(JSON.stringify([{ artifact: 'A1', command: 'npm test', state: 'exited', exitCode: 1, output: output.slice(0, 1000), truncated: true }])),
			notification: input.includes(`Notification already shown: ${item.description}`),
			summary: fixture.service.detailSummaries.get().get(item.id),
		}, {
			purposes: ['inboxDetailSummary'], recorded: true, notification: true,
			summary: { status: 'One test failed.', decisions: [], evidence: [{ text: 'Focus restoration failed.', artifact: { kind: 'command', label: 'Terminal output: npm test', uri } }] },
		});
	});

	test('does not request interpretation while Inbox is disabled', async () => {
		let requests = 0;
		const fixture = createFixture([], undefined, undefined, undefined, undefined, true, [], false, {
			utilityRequest: async () => { requests++; return '{"status":"Unexpected","decisions":[],"evidence":[]}'; },
		});
		fixture.service.requestDetailSummary(upcastPartial<IInboxNotificationItem>({ id: 'disabled', kind: InboxNotificationKind.Completed, sessionResource: URI.parse('test:///disabled') }));
		await Promise.resolve();
		assert.deepStrictEqual({ requests, summaries: fixture.service.detailSummaries.get().size }, { requests: 0, summaries: 0 });
	});

	test('publishes the description fallback after a failed shared utility request and does not retry each render', async () => {
		const expectedError = new Error('Rate limited');
		const previousHandler = errorHandler.getUnexpectedErrorHandler();
		const errors: Error[] = [];
		setUnexpectedErrorHandler(error => errors.push(error));
		try {
			let requests = 0;
			const fixture = createFixture([createSession({ id: 'preview-failure', status: SessionStatus.NeedsInput, updatedAt: 200, description: 'Approve the request' })],
				undefined, undefined, undefined, undefined, true, [], true, {
				utilityRequest: async request => {
					assert.strictEqual(request.purpose, 'inboxPreview');
					requests++;
					throw expectedError;
				},
			});
			const item = fixture.service.notifications.get()[0];
			fixture.service.requestPreview(item);
			await waitForState(fixture.service.isLoading, loading => !loading);
			fixture.service.requestPreview(item);
			assert.deepStrictEqual({ preview: fixture.service.previews.get().get(item.previewSignature!), requests, errors }, { preview: item.description, requests: 1, errors: [] });
		} finally {
			setUnexpectedErrorHandler(previousHandler);
		}
	});

	test('seeds existing lifecycle state silently and logs arrivals and dismissals without routing telemetry', () => {
		const fixture = createFixture([
			createSession({ id: 'input', status: SessionStatus.NeedsInput, updatedAt: 200, description: 'waiting for user answer' }),
		]);
		assert.deepStrictEqual([...fixture.telemetryEvents], []);
		fixture.service.publishExternalNotification({ id: 'new', title: 'Update', description: 'New notification' });
		const item = fixture.service.notifications.get().find(item => item.kind === InboxNotificationKind.External)!;
		assert.ok(item);

		const lifecycle = fixture.telemetryEvents.find(entry => entry.eventName === 'agents/inboxItemLifecycle');
		assert.ok(lifecycle, 'expected an agents/inboxItemLifecycle event');
		assert.strictEqual(lifecycle!.data.outcome, 'entered');
		assert.strictEqual(lifecycle!.data.notificationKind, item.kind);
		assert.strictEqual(lifecycle!.data.msInInbox, 0);
		fixture.service.dismissNotification(item.id);
		assert.deepStrictEqual(fixture.telemetryEvents.map(entry => [entry.eventName, entry.data.outcome]), [
			['agents/inboxItemLifecycle', 'entered'],
			['agents/inboxItemLifecycle', 'dismissed'],
		]);
	});

	test('refines restored completed cards silently when pull-request data arrives', () => {
		const gitHubService = new TestGitHubService();
		const fixture = createFixture([createSession({
			id: 'late-pr-data', status: SessionStatus.Completed, updatedAt: 200,
			pullRequest: { owner: 'owner', repo: 'repo', number: 42 },
		})], undefined, gitHubService);
		assert.strictEqual(fixture.service.notifications.get()[0].kind, InboxNotificationKind.Completed);
		gitHubService.setPullRequest('owner', 'repo', 42, openPullRequest(42, 'sha42'));
		gitHubService.setCIStatus('owner', 'repo', 42, 'sha42', GitHubCIOverallStatus.Failure, []);
		assert.strictEqual(fixture.service.notifications.get()[0].kind, InboxNotificationKind.FailingCI);
		assert.deepStrictEqual(fixture.telemetryEvents, []);
	});

	test('keeps a new question from the same session active after dismissing a prior one', () => {
		const chatResource = URI.parse('test:///chat/repeat-question');
		const chatService = new TestChatService();
		const fixture = createFixture([
			createSession({ id: 'repeat-question', status: SessionStatus.NeedsInput, updatedAt: 200, chatResource }),
		], undefined, undefined, chatService);
		chatService.setPendingQuestionCarousel(chatResource, {
			requestId: 'req-1',
			resolveId: 'resolve-1',
			allowSkip: true,
			message: 'First question',
			questions: [{ id: 'q1', type: 'text', title: 'Question 1', required: true }],
		});

		const firstId = fixture.service.notifications.get()[0].id;
		fixture.service.dismissNotification(firstId);
		assert.deepStrictEqual(fixture.service.notifications.get(), []);

		// The agent asks a different question within the same turn (same updatedAt). It must
		// surface as an active Now item, not inherit the prior question's dismissal.
		chatService.setPendingQuestionCarousel(chatResource, {
			requestId: 'req-2',
			resolveId: 'resolve-2',
			allowSkip: true,
			message: 'Second question',
			questions: [{ id: 'q2', type: 'text', title: 'Question 2', required: true }],
		});

		const active = fixture.service.notifications.get();
		assert.strictEqual(active.length, 1);
		assert.strictEqual(active[0].kind, InboxNotificationKind.NeedsInput);
		assert.notStrictEqual(active[0].id, firstId);
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

	test('tracks loading while acquiring a missing chat model', async () => {
		const chatResource = URI.parse('test:///chat/loading-chat-model');
		const chatService = new TestChatService();
		let resolveAcquire: (() => void) | undefined;
		chatService.setAcquireOrLoadHandler(() => new Promise(resolve => {
			resolveAcquire = () => {
				chatService.setPendingConfirmation(chatResource, {
					requestId: 'request-loading-chat-model',
					title: 'Confirm update',
					message: 'Proceed?',
					data: { confirm: true },
					buttons: ['Approve'],
				});
				resolve({ object: chatService.getSession(chatResource)!, dispose: () => { } });
			};
		}));
		const fixture = createFixture([
			createSession({ id: 'loading-chat-model', status: SessionStatus.NeedsInput, updatedAt: 200, chatResource }),
		], undefined, undefined, chatService);

		assert.strictEqual(fixture.service.isLoading.get(), true);
		assert.ok(resolveAcquire);
		resolveAcquire();
		await waitForState(fixture.service.isLoading, isLoading => !isLoading);
		assert.strictEqual(fixture.service.isLoading.get(), false);
	});

	test('loads and scans only waiting chats, falling back when no chat reports needs input', async () => {
		const session = createSession({ id: 'peers', status: SessionStatus.NeedsInput, updatedAt: 100 });
		const main = session.mainChat.get();
		(main.status as ISettableObservable<SessionStatus>).set(SessionStatus.Completed, undefined);
		const waitingStatus = observableValue('waitingStatus', SessionStatus.NeedsInput);
		const waiting = upcastPartial<IChat>({ resource: URI.parse('test:///waiting-peer'), status: waitingStatus });
		(session.chats as ISettableObservable<readonly IChat[]>).set([main, waiting], undefined);
		const chatService = new TestChatService();
		const loads: string[] = [];
		chatService.setAcquireOrLoadHandler(async resource => {
			loads.push(resource.toString());
			chatService.setPendingConfirmation(resource, {
				requestId: resource.path, title: 'Review', message: 'Review this request', data: {}, buttons: ['Accept'],
			});
			return { object: chatService.getSession(resource)!, dispose: () => { } };
		});
		const fixture = createFixture([session], undefined, undefined, chatService);
		await waitForState(fixture.service.isLoading, loading => !loading);
		const waitingOnly = { loads: [...loads], chat: fixture.service.notifications.get()[0].needsInputPart?.chatResource.toString() };
		waitingStatus.set(SessionStatus.Completed, undefined);
		await waitForState(fixture.service.isLoading, loading => !loading);
		assert.deepStrictEqual({ waitingOnly, fallbackLoads: loads }, {
			waitingOnly: { loads: [waiting.resource.toString()], chat: waiting.resource.toString() },
			fallbackLoads: [waiting.resource.toString(), main.resource.toString()],
		});
	});

	test('does not retain a chat model loaded after its session is removed or the service is disposed', async () => {
		for (const disposeService of [false, true]) {
			const chatService = new TestChatService();
			let resolveAcquire!: (reference: IReference<IChatModel>) => void;
			chatService.setAcquireOrLoadHandler(() => new Promise(resolve => { resolveAcquire = resolve; }));
			const fixture = createFixture([
				createSession({ id: 'removed-during-load', status: SessionStatus.NeedsInput, updatedAt: 200 }),
			], undefined, undefined, chatService);
			if (disposeService) {
				fixture.service.dispose();
			} else {
				fixture.setSessions([]);
			}
			let disposed = false;
			resolveAcquire({ object: upcastPartial<IChatModel>({}), dispose: () => { disposed = true; } });
			await waitForState(fixture.service.isLoading, isLoading => !isLoading);
			assert.strictEqual(disposed, true);
		}
	});

	test('releases Inbox references on provider removal and waits for old model eviction before reacquiring', async () => {
		const changed = disposables.add(new Emitter<{ added: string[]; removed: string[] }>());
		const provider = 'agent-host-copilotcli';
		const resource = URI.parse(`${provider}:/reconnect`);
		const chatService = new TestChatService();
		let loads = 0;
		let releases = 0;
		chatService.setAcquireOrLoadHandler(async () => {
			loads++;
			chatService.setCompletedResponse(resource, { requestId: `request-${loads}`, markdown: 'Ready' });
			return { object: chatService.getSession(resource)!, dispose: () => { releases++; } };
		});
		const fixture = createFixture([createSession({ id: 'reconnect', status: SessionStatus.NeedsInput, updatedAt: 200, chatResource: resource })],
			undefined, undefined, chatService, undefined, true, [], true, { onDidChangeContentProviderSchemes: changed.event });
		await waitForState(fixture.service.isLoading, loading => !loading);
		changed.fire({ removed: ['other-provider'], added: [] });
		const unrelated = { loads, releases };
		changed.fire({ removed: [provider], added: [] });
		changed.fire({ removed: [], added: [provider] });
		const awaitingOtherOwners = { loads, releases };
		chatService.removeSession(resource);
		await waitForState(fixture.service.isLoading, loading => !loading);
		const replaced = { loads, releases };
		fixture.service.dispose();
		assert.deepStrictEqual({ unrelated, awaitingOtherOwners, replaced, releasedOnDispose: releases }, {
			unrelated: { loads: 1, releases: 0 },
			awaitingOtherOwners: { loads: 1, releases: 1 },
			replaced: { loads: 2, releases: 1 },
			releasedOnDispose: 2,
		});
	});

	for (const registeredBeforeRelease of [true, false]) {
		test(`discards in-flight models from a removed provider and retries its replacement: ${registeredBeforeRelease}`, async () => {
			const changed = disposables.add(new Emitter<{ added: string[]; removed: string[] }>());
			const provider = 'agent-host-copilotcli';
			const resource = URI.parse(`${provider}:/late-provider`);
			const pending = new DeferredPromise<IReference<IChatModel>>();
			const chatService = new TestChatService();
			let loads = 0;
			let staleReleases = 0;
			let loadToken = CancellationToken.None;
			chatService.setAcquireOrLoadHandler(async (_resource, token) => {
				if (++loads === 1) {
					loadToken = token;
					return pending.p;
				}
				chatService.setCompletedResponse(resource, { requestId: 'fresh', markdown: 'Fresh provider' });
				return { object: chatService.getSession(resource)!, dispose: () => { } };
			});
			const fixture = createFixture([createSession({ id: 'late-provider', status: SessionStatus.NeedsInput, updatedAt: 200, chatResource: resource })],
				undefined, undefined, chatService, undefined, true, [], true, { onDidChangeContentProviderSchemes: changed.event });
			changed.fire({ removed: [provider], added: [] });
			if (registeredBeforeRelease) {
				changed.fire({ removed: [], added: [provider] });
			}
			await pending.complete({
				object: upcastPartial<IChatModel>({ sessionResource: resource }),
				dispose: () => { staleReleases++; },
			});
			await waitForState(fixture.service.isLoading, loading => !loading);
			changed.fire({ removed: [], added: [provider] });
			await waitForState(fixture.service.isLoading, loading => !loading);
			assert.deepStrictEqual({ cancelled: loadToken.isCancellationRequested, loads, staleReleases }, {
				cancelled: true, loads: 2, staleReleases: 1,
			});
		});
	}

	test('does no background work while disabled and responds to enablement and AI visibility changes', async () => {
		const changed = disposables.add(new Emitter<{ added: string[]; removed: string[] }>());
		const provider = 'agent-host-copilotcli';
		const gitHubService = new TestGitHubService();
		const chatService = new TestChatService();
		let chatLoads = 0;
		chatService.setAcquireOrLoadHandler(async () => {
			chatLoads++;
			return undefined;
		});
		gitHubService.setPullRequest('owner', 'repo', 42, openPullRequest(42, 'sha42'));
		const fixture = createFixture([
			createSession({ id: 'disabled', status: SessionStatus.NeedsInput, updatedAt: 100, chatResource: URI.parse(`${provider}:/disabled`), pullRequest: { owner: 'owner', repo: 'repo', number: 42 } }),
		], undefined, gitHubService, chatService, undefined, true, [], false, { onDidChangeContentProviderSchemes: changed.event });
		const state = () => ({
			notifications: fixture.service.notifications.get().length,
			polling: gitHubService.pollingCount,
			chatLoads,
			events: fixture.telemetryEvents.length,
		});
		changed.fire({ removed: [provider], added: [] });
		changed.fire({ removed: [], added: [provider] });
		assert.deepStrictEqual(state(), { notifications: 0, polling: 0, chatLoads: 0, events: 0 });
		await fixture.configurationService.setUserConfiguration(CHAT_INBOX_ENABLED_SETTING, true);
		fixture.configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
			affectsConfiguration: key => key === CHAT_INBOX_ENABLED_SETTING,
		}));
		assert.deepStrictEqual({ notifications: state().notifications, polling: state().polling, chatLoads }, { notifications: 1, polling: 3, chatLoads: 1 });
		fixture.sentiment.set({ hidden: true }, undefined);
		changed.fire({ removed: [provider], added: [] });
		changed.fire({ removed: [], added: [provider] });
		assert.deepStrictEqual({ notifications: state().notifications, polling: state().polling, chatLoads }, { notifications: 0, polling: 0, chatLoads: 1 });
		fixture.sentiment.set({}, undefined);
		assert.deepStrictEqual({ notifications: state().notifications, polling: state().polling }, { notifications: 1, polling: 3 });
		assert.deepStrictEqual(fixture.telemetryEvents, []);
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

	test('result approval has a distinct identity after execution approval is dismissed', () => {
		const chatResource = URI.parse('test:///chat/review-results');
		const chatService = new TestChatService();
		const fixture = createFixture([createSession({ id: 'review-results', status: SessionStatus.NeedsInput, updatedAt: 100, chatResource })],
			undefined, undefined, chatService);
		const setApproval = (type: IChatToolInvocation.StateKind.WaitingForConfirmation | IChatToolInvocation.StateKind.WaitingForPostApproval) => {
			chatService.setPendingParts(chatResource, {
				requestId: 'same-request', startedWaitingAt: 10,
				parts: [upcastPartial<IChatToolInvocation>({
					kind: 'toolInvocation', toolCallId: 'same-tool',
					state: observableValue('approval', upcastPartial<IChatToolInvocation.State>({ type })),
				})],
			});
		};
		setApproval(IChatToolInvocation.StateKind.WaitingForConfirmation);
		const execution = fixture.service.notifications.get()[0];
		fixture.service.dismissNotification(execution.id);
		setApproval(IChatToolInvocation.StateKind.WaitingForPostApproval);
		const result = fixture.service.notifications.get()[0];
		assert.deepStrictEqual({
			distinct: result.id !== execution.id,
			stage: result.needsInputPart?.kind === 'toolConfirmation' ? result.needsInputPart.confirmationKind : undefined,
			buttons: result.needsInputPart?.kind === 'toolConfirmation' ? result.needsInputPart.buttons : undefined,
			dismissed: fixture.service.dismissedNotifications.get().map(item => item.id),
		}, { distinct: true, stage: 'result', buttons: [], dismissed: [execution.id] });
	});

	test('terminal approvals retain the actual command, origin and disclaimer while complex tools require the session', () => {
		const session = createSession({ id: 'approval-details', status: SessionStatus.NeedsInput, updatedAt: 100 });
		const chatService = new TestChatService();
		const fixture = createFixture([session], undefined, undefined, chatService);
		const data: NonNullable<IChatToolInvocation['toolSpecificData']>[] = [
			{ kind: 'terminal', commandLine: { original: 'npm test', toolEdited: 'npm test -- --run regression', forDisplay: 'A harmless description' }, language: 'sh' },
			...(['input', 'modifiedFilesConfirmation', 'agentFeedbackReviewConfirmation', 'extensions'] as const).map(kind =>
				upcastPartial<NonNullable<IChatToolInvocation['toolSpecificData']>>({ kind })),
		];
		const results = data.map(toolSpecificData => {
			chatService.setPendingParts(session.mainChat.get().resource, {
				requestId: 'request', startedWaitingAt: 1,
				parts: [upcastPartial<IChatToolInvocation>({
					kind: 'toolInvocation', toolCallId: 'tool', toolSpecificData, originMessage: 'Shell tool',
					state: observableValue('tool', upcastPartial<IChatToolInvocation.State>({
						type: IChatToolInvocation.StateKind.WaitingForConfirmation,
						confirmationMessages: { title: 'Run in terminal?', message: 'Check the regression', disclaimer: 'Runs outside the sandbox' },
					})),
				})],
			});
			const part = fixture.service.notifications.get()[0].needsInputPart;
			assert.ok(part?.kind === 'toolConfirmation');
			return { kind: toolSpecificData.kind, command: part.commandLine, disclaimer: part.disclaimer, origin: part.originMessage, buttons: part.buttons.length };
		});
		assert.deepStrictEqual(results, data.map(toolSpecificData => ({
			kind: toolSpecificData.kind,
			command: toolSpecificData.kind === 'terminal' ? 'npm test -- --run regression' : undefined,
			disclaimer: 'Runs outside the sandbox', origin: 'Shell tool', buttons: toolSpecificData.kind === 'terminal' ? 2 : 0,
		})));
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
			actions: [InboxNotificationActionKind.OpenSession, InboxNotificationActionKind.MarkDone],
		}]);
	});

	test('surfaces failing CI on a draft pull request but not merge-ready passing CI', () => {
		const gitHubService = new TestGitHubService();
		const fixture = createFixture([createSession({
			id: 'draft-ci',
			status: SessionStatus.Completed,
			updatedAt: 100,
			isRead: true,
			pullRequest: { owner: 'owner', repo: 'repo', number: 77 },
		})], undefined, gitHubService);

		gitHubService.setPullRequest('owner', 'repo', 77, openPullRequest(77, 'sha77', { isDraft: true }));
		assert.strictEqual(gitHubService.pollingCount, 3, 'draft PR, CI, and review models must all be polled');
		gitHubService.setCIStatus('owner', 'repo', 77, 'sha77', GitHubCIOverallStatus.Failure, [{
			id: 1,
			name: 'CI',
			status: GitHubCheckStatus.Completed,
			conclusion: GitHubCheckConclusion.Failure,
			startedAt: '2026-09-21T16:00:00Z',
			completedAt: '2026-09-21T16:01:00Z',
			detailsUrl: undefined,
		}]);
		// Failing CI on a draft is actionable (Fix CI Failures) and surfaces.
		assert.deepStrictEqual(fixture.service.notifications.get().map(item => ({
			kind: item.kind,
			actions: item.actions.map(action => action.kind),
		})), [{
			kind: InboxNotificationKind.FailingCI,
			actions: [InboxNotificationActionKind.OpenSession, InboxNotificationActionKind.AgentMergeFixCI, InboxNotificationActionKind.MarkDone],
		}]);

		// Passing CI on a draft offers no merge-ready action, so it does not surface
		// a merge notification (the completed session may still surface on its own).
		gitHubService.setCIStatus('owner', 'repo', 77, 'sha77', GitHubCIOverallStatus.Success, [{
			id: 2,
			name: 'CI',
			status: GitHubCheckStatus.Completed,
			conclusion: GitHubCheckConclusion.Success,
			startedAt: '2026-09-21T16:02:00Z',
			completedAt: '2026-09-21T16:03:00Z',
			detailsUrl: undefined,
		}]);
		assert.deepStrictEqual(
			fixture.service.notifications.get()
				.map(item => item.kind)
				.filter(kind => kind === InboxNotificationKind.PassingCI || kind === InboxNotificationKind.FailingCI),
			[],
		);
	});

	test('surfaces CI and review notifications for recorded PR artifacts without workspace associations', () => {
		const gitHubService = new TestGitHubService();
		const fixture = createFixture([createSession({
			id: 'recorded-pr', status: SessionStatus.Completed, updatedAt: 100,
			artifacts: [{
				id: 'pr-artifact', kind: SessionArtifactKind.PullRequest, isArtifact: true, isGitHub: true,
				label: 'Linked draft', link: URI.parse('https://github.com/owner/repo/pull/77'),
			}],
		})], undefined, gitHubService);
		gitHubService.setPullRequest('owner', 'repo', 77, openPullRequest(77, 'sha77', { isDraft: true }));
		gitHubService.setCIStatus('owner', 'repo', 77, 'sha77', GitHubCIOverallStatus.Failure, []);
		gitHubService.setReviewThreads('owner', 'repo', 77, [{
			id: 'thread', isResolved: false, path: 'src/test.ts', startLine: 1, line: 1, comments: [{
				id: 1, body: 'Fix this', author: { login: 'copilot-pull-request-reviewer[bot]', avatarUrl: '' },
				createdAt: '2026-09-21T16:01:00Z', updatedAt: '2026-09-21T16:01:00Z',
				path: 'src/test.ts', line: 1, threadId: 'thread', inReplyToId: undefined,
			}],
		}]);
		assert.deepStrictEqual(fixture.service.notifications.get().map(item => ({
			kind: item.kind, pullRequests: item.pullRequestStates?.map(state => state.label),
		})), [
			{ kind: InboxNotificationKind.ReviewComments, pullRequests: ['#77'] },
			{ kind: InboxNotificationKind.FailingCI, pullRequests: ['#77'] },
		]);
	});

	test('surfaces fixes for workspace-linked PR references but not unrelated reference-only links', () => {
		const gitHubService = new TestGitHubService();
		const fixture = createFixture([createSession({
			id: 'inherited-pr', status: SessionStatus.Completed, updatedAt: 100,
			pullRequests: [{ owner: 'owner', repo: 'repo', number: 77, createdByThisSession: false }],
			artifacts: [{
				id: 'pr-reference', kind: SessionArtifactKind.PullRequest, isArtifact: false, isGitHub: true,
				label: 'Reference', link: URI.parse('https://github.com/owner/repo/pull/78'),
			}],
		})], undefined, gitHubService);
		gitHubService.setPullRequest('owner', 'repo', 77, openPullRequest(77, 'sha77'));
		gitHubService.setCIStatus('owner', 'repo', 77, 'sha77', GitHubCIOverallStatus.Failure, []);
		gitHubService.setPullRequest('owner', 'repo', 78, openPullRequest(78, 'sha78'));
		gitHubService.setCIStatus('owner', 'repo', 78, 'sha78', GitHubCIOverallStatus.Failure, []);
		assert.deepStrictEqual(fixture.service.notifications.get().map(item => ({
			kind: item.kind,
			pullRequests: item.pullRequestStates?.map(state => state.label),
			actions: item.actions.map(action => action.kind),
		})), [{
			kind: InboxNotificationKind.FailingCI,
			pullRequests: ['#77'],
			actions: [InboxNotificationActionKind.OpenSession, InboxNotificationActionKind.AgentMergeFixCI, InboxNotificationActionKind.MarkDone],
		}]);
	});

	test('does not offer merge or session cleanup for workspace-linked PR references', () => {
		const gitHubService = new TestGitHubService();
		const fixture = createFixture([createSession({
			id: 'referenced-pr', status: SessionStatus.Completed, updatedAt: 100,
			pullRequests: [{ owner: 'owner', repo: 'repo', number: 77, createdByThisSession: false }],
		})], undefined, gitHubService);
		gitHubService.setPullRequest('owner', 'repo', 77, openPullRequest(77, 'sha77'));
		gitHubService.setCIStatus('owner', 'repo', 77, 'sha77', GitHubCIOverallStatus.Success, []);
		assert.deepStrictEqual(fixture.service.notifications.get().map(item => item.kind), [InboxNotificationKind.Completed]);

		gitHubService.setPullRequest('owner', 'repo', 77, openPullRequest(77, 'sha77', { state: GitHubPullRequestState.Merged }));
		assert.deepStrictEqual(fixture.service.notifications.get().map(item => item.kind), [InboxNotificationKind.Completed]);
	});

	test('deduplicates overlapping PR alerts, preferring the owning session and retaining distinct PRs', () => {
		const gitHubService = new TestGitHubService();
		const owner = createSession({
			id: 'owner-session', status: SessionStatus.Completed, updatedAt: 100,
			pullRequest: { owner: 'owner', repo: 'repo', number: 77 },
		});
		const reference = createSession({
			id: 'reference-session', status: SessionStatus.Completed, updatedAt: 200,
			pullRequests: [
				{ owner: 'owner', repo: 'repo', number: 77, createdByThisSession: false },
				{ owner: 'owner', repo: 'repo', number: 78 },
			],
		});
		const fixture = createFixture([reference, owner], undefined, gitHubService);
		for (const number of [77, 78]) {
			gitHubService.setPullRequest('owner', 'repo', number, openPullRequest(number, `sha${number}`));
			gitHubService.setCIStatus('owner', 'repo', number, `sha${number}`, GitHubCIOverallStatus.Failure, []);
		}
		gitHubService.setReviewThreads('owner', 'repo', 77, [{
			id: 'thread', isResolved: false, path: 'src/test.ts', startLine: 1, line: 1, comments: [{
				id: 1, body: 'Fix this', author: { login: 'copilot-pull-request-reviewer[bot]', avatarUrl: '' },
				createdAt: '2026-09-21T16:01:00Z', updatedAt: '2026-09-21T16:01:00Z',
				path: 'src/test.ts', line: 1, threadId: 'thread', inReplyToId: undefined,
			}],
		}]);
		const snapshot = () => fixture.service.notifications.get().filter(item => item.pullRequestStates).map(item => ({
			kind: item.kind, session: item.sessionResource?.path, prs: item.pullRequestStates?.map(pr => pr.label),
		})).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
		const before = snapshot();
		fixture.setSessions([owner, reference]);
		const reordered = snapshot();
		fixture.setSessions([reference]);
		const removed = snapshot();
		const expected = [
			{ kind: InboxNotificationKind.FailingCI, session: '/session/owner-session', prs: ['#77'] },
			{ kind: InboxNotificationKind.FailingCI, session: '/session/reference-session', prs: ['#78'] },
			{ kind: InboxNotificationKind.ReviewComments, session: '/session/owner-session', prs: ['#77'] },
		];
		assert.deepStrictEqual({ before, reordered, removed }, {
			before: expected, reordered: expected,
			removed: [
				{ kind: InboxNotificationKind.FailingCI, session: '/session/reference-session', prs: ['#77', '#78'] },
				{ kind: InboxNotificationKind.ReviewComments, session: '/session/reference-session', prs: ['#77'] },
			],
		});
	});

	test('deduplicates PR identities case-insensitively and ignores archived or busy owners', () => {
		const gitHubService = new TestGitHubService();
		const ownerOptions = {
			id: 'owner', status: SessionStatus.Completed, updatedAt: 100,
			pullRequest: { owner: 'Owner', repo: 'Repo', number: 77 },
		};
		const reference = createSession({
			id: 'reference', status: SessionStatus.Completed, updatedAt: 200,
			pullRequests: [{ owner: 'owner', repo: 'repo', number: 77, createdByThisSession: false }],
		});
		const fixture = createFixture([reference, createSession(ownerOptions)], undefined, gitHubService);
		for (const [owner, repo] of [['Owner', 'Repo'], ['owner', 'repo']]) {
			gitHubService.setPullRequest(owner, repo, 77, openPullRequest(77, 'sha77'));
			gitHubService.setCIStatus(owner, repo, 77, 'sha77', GitHubCIOverallStatus.Failure, []);
		}
		const targets = () => fixture.service.notifications.get().filter(item => item.kind === InboxNotificationKind.FailingCI).map(item => item.sessionResource?.path);
		const active = targets();
		fixture.setSessions([reference, createSession({ ...ownerOptions, isArchived: true })]);
		const archived = targets();
		fixture.setSessions([reference, createSession({ ...ownerOptions, status: SessionStatus.InProgress })]);
		assert.deepStrictEqual({ active, archived, busy: targets() }, {
			active: ['/session/owner'], archived: ['/session/reference'], busy: ['/session/reference'],
		});
	});

	test('deduplicates merge-ready PRs deterministically but retains per-session cleanup after merging', () => {
		const gitHubService = new TestGitHubService();
		const sessions = ['second', 'first'].map(id => createSession({
			id, status: SessionStatus.Completed, updatedAt: 100,
			pullRequest: { owner: 'owner', repo: 'repo', number: 77 },
		}));
		const fixture = createFixture(sessions, undefined, gitHubService);
		gitHubService.setPullRequest('owner', 'repo', 77, openPullRequest(77, 'sha77'));
		gitHubService.setCIStatus('owner', 'repo', 77, 'sha77', GitHubCIOverallStatus.Success, []);
		const passing = fixture.service.notifications.get().filter(item => item.kind === InboxNotificationKind.PassingCI).map(item => item.sessionResource?.path);
		gitHubService.setPullRequest('owner', 'repo', 77, openPullRequest(77, 'sha77', { state: GitHubPullRequestState.Merged }));
		const merged = fixture.service.notifications.get().filter(item => item.kind === InboxNotificationKind.PullRequestMerged).map(item => item.sessionResource?.path).sort();
		assert.deepStrictEqual({ passing, merged }, {
			passing: ['/session/first'], merged: ['/session/first', '/session/second'],
		});
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

	test('review identity follows reviewer threads rather than session activity or coding-agent replies', () => {
		const session = createSession({
			id: 'stable-review', status: SessionStatus.Completed, updatedAt: Date.now(), isRead: true,
			pullRequest: { owner: 'owner', repo: 'repo', number: 43 },
		});
		const gitHubService = new TestGitHubService();
		const fixture = createFixture([session], undefined, gitHubService);
		gitHubService.setPullRequest('owner', 'repo', 43, openPullRequest(43, 'sha43'));
		const comment = (id: number, login: string) => upcastPartial<IGitHubPullRequestReviewThread['comments'][number]>({
			id, author: { login, avatarUrl: '' }, createdAt: '2026-09-21T16:00:00Z', updatedAt: '2026-09-21T16:00:00Z',
		});
		const human = upcastPartial<IGitHubPullRequestReviewThread>({
			id: 'human', isResolved: false, comments: [comment(1, 'reviewer'), comment(2, 'copilot-swe-agent')],
		});
		gitHubService.setReviewThreads('owner', 'repo', 43, [human, {
			...human, id: 'lookalike', comments: [comment(3, 'not-copilot-reviewer')],
		}]);
		const ignored = fixture.service.notifications.get().length;
		const reviewer = { ...human, id: 'reviewer', comments: [comment(4, 'Copilot-Pull-Request-Reviewer')] };
		gitHubService.setReviewThreads('owner', 'repo', 43, [human, reviewer]);
		const item = fixture.service.notifications.get()[0];
		fixture.service.dismissNotification(item.id);
		(session.updatedAt as ISettableObservable<Date>).set(new Date(Date.now() + 1000), undefined);
		const afterTurn = fixture.service.notifications.get().length;
		gitHubService.setReviewThreads('owner', 'repo', 43, [{ ...reviewer, comments: [...reviewer.comments, comment(5, 'reviewer')] }]);
		assert.deepStrictEqual({ ignored, afterTurn, newComment: fixture.service.notifications.get()[0].id !== item.id }, {
			ignored: 0, afterTurn: 0, newComment: true,
		});
	});

	test('surfaces merged pull request notifications with session cleanup actions', () => {
		const gitHubService = new TestGitHubService();
		const fixture = createFixture([createSession({
			id: 'merged-pr',
			status: SessionStatus.Completed,
			updatedAt: 100,
			isRead: true,
			pullRequest: { owner: 'owner', repo: 'repo', number: 46 },
		})], undefined, gitHubService);

		gitHubService.setPullRequest('owner', 'repo', 46, openPullRequest(46, 'sha46', {
			state: GitHubPullRequestState.Merged,
			mergedAt: '2026-09-21T16:06:00Z',
		}));

		assert.deepStrictEqual(fixture.service.notifications.get().map(item => ({
			kind: item.kind,
			priority: item.priority,
			repositoryLabel: item.repositoryLabel,
			pullRequestStates: item.pullRequestStates?.map(state => ({ label: state.label, statusLabel: state.statusLabel })),
			actions: item.actions.map(action => action.kind),
		})), [{
			kind: InboxNotificationKind.PullRequestMerged,
			priority: InboxNotificationPriority.Next,
			repositoryLabel: 'owner/repo',
			pullRequestStates: [{ label: '#46', statusLabel: 'Merged' }],
			actions: [InboxNotificationActionKind.OpenSession, InboxNotificationActionKind.ArchiveSession, InboxNotificationActionKind.DeleteSession, InboxNotificationActionKind.MarkDone],
		}]);
	});

	test('offers deletion only when the merged session supports it and names the archive action explicitly', () => {
		const session = createSession({ id: 'non-deletable', status: SessionStatus.Completed, updatedAt: 100, supportsDelete: false, pullRequest: { owner: 'owner', repo: 'repo', number: 46 } });
		const gitHubService = new TestGitHubService();
		const fixture = createFixture([session], undefined, gitHubService);
		gitHubService.setPullRequest('owner', 'repo', 46, openPullRequest(46, 'sha46', { state: GitHubPullRequestState.Merged }));
		assert.deepStrictEqual(fixture.service.notifications.get()[0].actions.map(action => [action.kind, action.ariaLabel ?? action.label]), [
			[InboxNotificationActionKind.OpenSession, 'Open Session'],
			[InboxNotificationActionKind.ArchiveSession, 'Archive Session'],
			[InboxNotificationActionKind.MarkDone, 'Mark Notification as Done'],
		]);
	});

	test('drops stale CI and review notifications when a pull request merges', () => {
		for (const ciStatus of [GitHubCIOverallStatus.Success, GitHubCIOverallStatus.Failure]) {
			const gitHubService = new TestGitHubService();
			const fixture = createFixture([createSession({
				id: `merged-${ciStatus}`, status: SessionStatus.Completed, updatedAt: 100,
				pullRequest: { owner: 'owner', repo: 'repo', number: 46 },
			})], undefined, gitHubService);
			gitHubService.setPullRequest('owner', 'repo', 46, openPullRequest(46, 'sha46'));
			gitHubService.setCIStatus('owner', 'repo', 46, 'sha46', ciStatus, []);
			gitHubService.setReviewThreads('owner', 'repo', 46, [{
				id: 'copilot-thread', isResolved: false, path: 'test.ts', startLine: 1, line: 1,
				comments: [{
					id: 1, body: 'Review', author: { login: 'copilot[bot]', avatarUrl: '' },
					createdAt: '2026-09-21T16:00:00Z', updatedAt: '2026-09-21T16:00:00Z',
					path: 'test.ts', line: 1, threadId: 'copilot-thread', inReplyToId: undefined,
				}],
			}]);
			assert.strictEqual(fixture.service.notifications.get().length, 2);
			gitHubService.setPullRequest('owner', 'repo', 46, openPullRequest(46, 'sha46', {
				state: GitHubPullRequestState.Merged, mergedAt: '2026-09-21T16:06:00Z',
			}));
			assert.deepStrictEqual({
				kinds: fixture.service.notifications.get().map(item => item.kind),
				polling: gitHubService.pollingCount,
			}, { kinds: [InboxNotificationKind.PullRequestMerged], polling: 0 });
		}
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

	test('does not offer an unsafe slash-command merge for agent-host sessions', () => {
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
			InboxNotificationActionKind.MarkDone,
		]]);
	});

	test('offers real PR merge only while the main chat advertises an enabled changeset merge operation', () => {
		const operation: ISessionChangesetOperation = { id: 'pr-merge', label: 'Merge Pull Request', scopes: [SessionChangesetOperationScope.Changeset], status: SessionChangesetOperationStatus.Idle, confirmation: 'Merge this pull request?' };
		const operations = observableValue<readonly ISessionChangesetOperation[]>('merge.operations', []);
		const enabled = observableValue('merge.enabled', true);
		const changeset = upcastPartial<ISessionChangeset>({ id: 'branch', isEnabled: enabled, operations });
		const session = createSession({
			id: 'real-pr-merge', status: SessionStatus.Completed, updatedAt: 100,
			pullRequest: { owner: 'owner', repo: 'repo', number: 44 }, changesets: [changeset],
		});
		const gitHubService = new TestGitHubService();
		const fixture = createFixture([session], undefined, gitHubService);
		gitHubService.setPullRequest('owner', 'repo', 44, openPullRequest(44, 'sha44'));
		gitHubService.setCIStatus('owner', 'repo', 44, 'sha44', GitHubCIOverallStatus.Success, []);
		const hasMerge = () => fixture.service.notifications.get()[0].actions.some(action => action.kind === InboxNotificationActionKind.AgentMergeMergePullRequest);
		assert.strictEqual(hasMerge(), false);
		operations.set([operation], undefined);
		assert.strictEqual(hasMerge(), true);
		assert.deepStrictEqual(getInboxPullRequestMergeOperation(session), { changeset, operation });
		operations.set([{ ...operation, status: SessionChangesetOperationStatus.Running }], undefined);
		assert.strictEqual(hasMerge(), false);
		operations.set([operation], undefined);
		enabled.set(false, undefined);
		assert.strictEqual(hasMerge(), false);
	});

	test('rejects local merges, resource-only merges, disabled operations and ambiguous PR merge targets', () => {
		const merge: ISessionChangesetOperation = { id: 'pr-merge', label: 'Merge Pull Request', scopes: [SessionChangesetOperationScope.Changeset], status: SessionChangesetOperationStatus.Idle };
		const operations = observableValue<readonly ISessionChangesetOperation[]>('ambiguousMerge.operations', []);
		const changeset = upcastPartial<ISessionChangeset>({ id: 'branch', isEnabled: observableValue('ambiguousMerge.enabled', true), operations });
		const session = createSession({
			id: 'ambiguous-merge', status: SessionStatus.Completed, updatedAt: 100,
			pullRequest: { owner: 'owner', repo: 'repo', number: 44 }, changesets: [changeset],
		});
		for (const candidates of [
			[{ ...merge, id: 'merge' }],
			[{ ...merge, scopes: [SessionChangesetOperationScope.Resource] }],
			[{ ...merge, status: SessionChangesetOperationStatus.Disabled }],
			[merge, merge],
		]) {
			operations.set(candidates, undefined);
			assert.strictEqual(getInboxPullRequestMergeOperation(session), undefined);
		}
		operations.set([merge], undefined);
		const multiplePullRequests = createSession({
			id: 'multiple-prs', status: SessionStatus.Completed, updatedAt: 100, changesets: [changeset],
			pullRequests: [{ owner: 'owner', repo: 'repo', number: 44 }, { owner: 'owner', repo: 'repo', number: 45 }],
		});
		assert.strictEqual(getInboxPullRequestMergeOperation(multiplePullRequests), undefined);
	});

	test('does not offer an unsafe slash-command merge for cloud sessions', () => {
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
			InboxNotificationActionKind.MarkDone,
		]]);
	});

	test('offers CI fixes for cloud sessions without an unrelated Agent Merge provider', () => {
		const gitHubService = new TestGitHubService();
		const fixture = createFixture([createSession({
			id: 'non-agent-host-no-inline',
			providerId: 'copilot-chat-sessions',
			status: SessionStatus.Completed,
			updatedAt: 100,
			isRead: true,
			pullRequest: { owner: 'owner', repo: 'repo', number: 48 },
		})], undefined, gitHubService, undefined, undefined, false);

		gitHubService.setPullRequest('owner', 'repo', 48, openPullRequest(48, 'sha48'));
		gitHubService.setCIStatus('owner', 'repo', 48, 'sha48', GitHubCIOverallStatus.Failure, [{
			id: 6,
			name: 'CI',
			status: GitHubCheckStatus.Completed,
			conclusion: GitHubCheckConclusion.Failure,
			startedAt: '2026-09-21T16:02:00Z',
			completedAt: '2026-09-21T16:03:00Z',
			detailsUrl: undefined,
		}]);

		assert.deepStrictEqual(fixture.service.notifications.get().map(item => item.actions.map(action => action.kind)), [[
			InboxNotificationActionKind.OpenSession,
			InboxNotificationActionKind.AgentMergeFixCI,
			InboxNotificationActionKind.MarkDone,
		]]);
	});

	test('does not confuse Agent Merge configuration support with a real PR merge action', () => {
		const gitHubService = new TestGitHubService();
		const inlineAgentMergeProvider = upcastPartial<IAgentHostSessionsProvider>({
			id: 'preserve-provider',
			getAgentMergeClientStateObservable: () => observableValue<IAgentMergeClientState | undefined>('test.inlineAgentMergeClientState', { enabled: false }),
			getAgentMergeSessionState: () => ({ enabled: false }),
			setAgentMergeEnabled: async () => { },
			setAgentMergeOverrides: async () => { },
		});
		const fixture = createFixture([createSession({
			id: 'inline-agent-merge-provider',
			providerId: inlineAgentMergeProvider.id,
			status: SessionStatus.Completed,
			updatedAt: 100,
			isRead: true,
			pullRequest: { owner: 'owner', repo: 'repo', number: 47 },
		})], undefined, gitHubService, undefined, undefined, false, [inlineAgentMergeProvider]);

		gitHubService.setPullRequest('owner', 'repo', 47, openPullRequest(47, 'sha47'));
		gitHubService.setCIStatus('owner', 'repo', 47, 'sha47', GitHubCIOverallStatus.Success, [{
			id: 5,
			name: 'CI',
			status: GitHubCheckStatus.Completed,
			conclusion: GitHubCheckConclusion.Success,
			startedAt: '2026-09-21T16:02:00Z',
			completedAt: '2026-09-21T16:03:00Z',
			detailsUrl: undefined,
		}]);

		assert.deepStrictEqual(fixture.service.notifications.get().map(item => item.actions.map(action => action.kind)), [[
			InboxNotificationActionKind.OpenSession,
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

	});

	test('bounds persisted dismissals to the most recent entries', () => {
		const storageService = disposables.add(new InMemoryStorageService());
		storageService.store(dismissedStorageKey, JSON.stringify(Array.from({ length: 1005 }, (_, index) => `old-${index}`)), StorageScope.APPLICATION, StorageTarget.USER);
		const fixture = createFixture([], storageService);
		assert.strictEqual(JSON.parse(storageService.get(dismissedStorageKey, StorageScope.APPLICATION)!).length, 1000);
		fixture.service.dismissNotification('new');
		const stored = JSON.parse(storageService.get(dismissedStorageKey, StorageScope.APPLICATION)!);
		assert.deepStrictEqual({ count: stored.length, first: stored[0], last: stored.at(-1) }, { count: 1000, first: 'old-6', last: 'new' });
		const restored = createFixture([], fixture.storageService);
		restored.service.publishExternalNotification({ id: 'old-0', title: 'Pruned', description: 'Old dismissal no longer retained' });
		assert.deepStrictEqual(restored.service.notifications.get().map(item => item.id), ['old-0']);
	});

	test('keeps dismissed notifications visible when source notifications disappear', () => {
		const fixture = createFixture([
			createSession({ id: 'completed-disappear', status: SessionStatus.Completed, updatedAt: 100, isRead: false }),
		]);
		const dismissedId = fixture.service.notifications.get()[0].id;
		fixture.service.dismissNotification(dismissedId);

		fixture.setSessions([]);
		assert.deepStrictEqual(fixture.service.dismissedNotifications.get().map(item => item.id), [dismissedId]);
	});

	test('retains the supplied completed snapshot after marking read removes its source', () => {
		const options = { id: 'read-before-dismiss', status: SessionStatus.Completed, updatedAt: 100 };
		const fixture = createFixture([createSession(options)]);
		const item = fixture.service.notifications.get()[0];
		fixture.setSessions([createSession({ ...options, isRead: true })]);
		const active = fixture.service.notifications.get().length;
		fixture.service.dismissNotification(item.id, item);
		assert.deepStrictEqual({ active, completed: fixture.service.dismissedNotifications.get().map(snapshot => snapshot.id) }, {
			active: 0, completed: [item.id],
		});
	});

	test('dismissing before marking a completed session read reports dismissed rather than removed', () => {
		const session = createSession({ id: 'dismiss-before-read', status: SessionStatus.Completed, updatedAt: 100 });
		const fixture = createFixture([session]);
		const item = fixture.service.notifications.get()[0];
		fixture.service.dismissNotification(item.id, item);
		(session.isRead as ISettableObservable<boolean>).set(true, undefined);
		assert.deepStrictEqual({
			outcomes: fixture.telemetryEvents.filter(event => event.eventName === 'agents/inboxItemLifecycle').map(event => event.data.outcome),
			completed: fixture.service.dismissedNotifications.get().map(item => item.id),
		}, { outcomes: ['dismissed'], completed: [item.id] });
	});

	test('dismissed questions have no interactive input or stale actions, including snapshots', () => {
		const chatResource = URI.parse('test:///chat/dismissed-question');
		const chatService = new TestChatService();
		const fixture = createFixture([
			createSession({ id: 'dismissed-question', status: SessionStatus.NeedsInput, updatedAt: 100, chatResource }),
		], undefined, undefined, chatService);
		chatService.setPendingQuestionCarousel(chatResource, {
			requestId: 'request', resolveId: 'question', allowSkip: true,
			message: 'Pending question',
			questions: [{ id: 'q', type: 'text', title: 'Question', required: true }],
		});
		fixture.service.dismissNotification(fixture.service.notifications.get()[0].id);
		const snapshot = () => fixture.service.dismissedNotifications.get().map(item => ({
			needsInputPart: item.needsInputPart, chatResource: item.chatResource, actions: item.actions.map(action => action.kind),
		}));
		const live = snapshot();
		fixture.setSessions([]);
		assert.deepStrictEqual({ live, stored: snapshot() }, {
			live: [{ needsInputPart: undefined, chatResource, actions: [InboxNotificationActionKind.OpenSession] }],
			stored: [{ needsInputPart: undefined, chatResource, actions: [InboxNotificationActionKind.OpenSession] }],
		});
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
			priority: InboxNotificationPriority.Now,
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
			priority: InboxNotificationPriority.Now,
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

	test('derives a hashed session id and bounded provider for interaction telemetry', () => {
		const fixture = createFixture([
			createSession({ id: 'telemetry-session', providerId: 'local-agent-host', status: SessionStatus.NeedsInput, updatedAt: 200 }),
		]);
		const item = fixture.service.notifications.get()[0];
		const context = fixture.service.getInteractionTelemetryContext(item);
		// The raw session id is never emitted; a stable non-empty hash is used instead.
		assert.notStrictEqual(context.agentSessionId, 'telemetry-session');
		assert.ok(context.agentSessionId.length > 0 && context.agentSessionId !== 'none');
		assert.strictEqual(context.providerId, 'local-agent-host');
		// Deterministic for the same session.
		assert.strictEqual(fixture.service.getInteractionTelemetryContext(item).agentSessionId, context.agentSessionId);
	});

	test('reports a none telemetry identity for items without a resolvable session', () => {
		const fixture = createFixture([]);
		fixture.service.publishExternalNotification({ id: 'external-telemetry', title: 'External', description: 'No session' });
		const item = fixture.service.notifications.get()[0];
		const context = fixture.service.getInteractionTelemetryContext(item);
		assert.deepStrictEqual(context, { agentSessionId: 'none', providerId: 'none' });
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

	suite('cleanPreviewText', () => {
		test('strips quotes, labels and a trailing period', () => {
			assert.strictEqual(cleanPreviewText('"Approve running npm test."'), 'Approve running npm test');
			assert.strictEqual(cleanPreviewText('Preview: Pick auth provider'), 'Pick auth provider');
		});

		test('keeps only the first line and collapses whitespace', () => {
			assert.strictEqual(cleanPreviewText('Added users API pagination\nextra commentary'), 'Added users API pagination');
			assert.strictEqual(cleanPreviewText('  Fix   the login   bug  '), 'Fix the login bug');
		});

		test('suppresses refusals and empty output', () => {
			assert.strictEqual(cleanPreviewText('Sorry, I can\'t help with that.'), undefined);
			assert.strictEqual(cleanPreviewText('   '), undefined);
		});

		test('caps overly long output with an ellipsis', () => {
			const result = cleanPreviewText('a'.repeat(200));
			assert.ok(result);
			assert.ok(result!.length <= 75);
			assert.ok(result!.endsWith('…'));
		});
	});

	suite('parseDetailSummary', () => {
		const artifacts = [
			{ kind: 'session' as const, label: 'My session' },
			{ kind: 'file' as const, label: 'foo.ts', uri: URI.parse('file:///repo/foo.ts') },
		];

		test('parses status, decisions and grounded evidence', () => {
			const raw = JSON.stringify({
				status: 'Added pagination to the users API.',
				decisions: ['Used cursor pagination', 'Kept the old offset param'],
				evidence: [
					{ text: 'Edited the users controller', artifact: 'A1' },
					{ text: 'See the full run', artifact: 'A0' },
				],
			});
			const result = parseDetailSummary(raw, artifacts);
			assert.ok(result);
			assert.strictEqual(result!.status, 'Added pagination to the users API.');
			assert.deepStrictEqual(result!.decisions, ['Used cursor pagination', 'Kept the old offset param']);
			assert.strictEqual(result!.evidence.length, 2);
			assert.strictEqual(result!.evidence[0].artifact.label, 'foo.ts');
			assert.strictEqual(result!.evidence[1].artifact.kind, 'session');
		});

		test('drops evidence that cites an unknown or missing artifact', () => {
			const raw = JSON.stringify({
				status: 'Did the thing.',
				decisions: [],
				evidence: [
					{ text: 'grounded', artifact: 'A1' },
					{ text: 'ungrounded', artifact: 'A9' },
					{ text: 'no ref' },
				],
			});
			const result = parseDetailSummary(raw, artifacts);
			assert.ok(result);
			assert.strictEqual(result!.evidence.length, 1);
			assert.strictEqual(result!.evidence[0].text, 'grounded');
		});

		test('extracts JSON embedded in prose or code fences', () => {
			const raw = 'Sure! ```json\n{"status":"Done.","decisions":[],"evidence":[]}\n``` hope that helps';
			const result = parseDetailSummary(raw, artifacts);
			assert.ok(result);
			assert.strictEqual(result!.status, 'Done.');
		});

		test('returns undefined for malformed or empty output', () => {
			assert.strictEqual(parseDetailSummary('not json at all', artifacts), undefined);
			assert.strictEqual(parseDetailSummary(JSON.stringify({ status: '', decisions: [], evidence: [] }), artifacts), undefined);
		});

		test('keeps additional trade-offs without requiring a repeated status', () => {
			const summary = { status: '', decisions: ['The smaller images avoid horizontal scrolling.'], evidence: [] };
			assert.deepStrictEqual(parseDetailSummary(JSON.stringify(summary), artifacts), summary);
		});
	});

});

function openPullRequest(number: number, headSha: string, options?: {
	readonly state?: GitHubPullRequestState;
	readonly mergedAt?: string;
	readonly updatedAt?: string;
	readonly isDraft?: boolean;
}): IGitHubPullRequest {
	return upcastPartial<IGitHubPullRequest>({
		number,
		headSha,
		isDraft: options?.isDraft ?? false,
		state: options?.state ?? GitHubPullRequestState.Open,
		mergedAt: options?.mergedAt,
		updatedAt: options?.updatedAt ?? options?.mergedAt,
	});
}

class TestAgentHostProvider {
	readonly id = 'local-agent-host';
	private readonly _agentMergeStates = new Map<string, ReturnType<typeof observableValue<IAgentMergeClientState | undefined>>>();

	getAgentMergeClientStateObservable(sessionId: string): IObservable<IAgentMergeClientState | undefined> {
		return this._stateForSession(sessionId);
	}

	getAgentMergeSessionState(sessionId: string): { enabled: boolean; overrides?: IAgentMergeClientState['overrides'] } | undefined {
		const state = this._stateForSession(sessionId).get();
		if (!state) {
			return undefined;
		}
		return { enabled: state.enabled, overrides: state.overrides };
	}

	async setAgentMergeEnabled(sessionId: string, enabled: boolean): Promise<void> {
		const current = this._stateForSession(sessionId).get();
		this._stateForSession(sessionId).set({ enabled, overrides: current?.overrides }, undefined);
	}

	async setAgentMergeOverrides(sessionId: string, overrides: IAgentMergeClientState['overrides'] | undefined): Promise<void> {
		const current = this._stateForSession(sessionId).get();
		this._stateForSession(sessionId).set({ enabled: current?.enabled ?? false, overrides }, undefined);
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
	private _acquireOrLoadHandler: ((chatResource: URI, token: CancellationToken) => Promise<{ object: IChatModel; dispose(): void } | undefined>) | undefined;
	readonly chatModels = this._chatModelsObservable;

	getSession(chatResource: URI): IChatModel | undefined {
		return this._chatModels.get(chatResource.toString());
	}

	removeSession(chatResource: URI): void {
		this._chatModels.delete(chatResource.toString());
		this._chatModelsObservable.set([...this._chatModels.values()], undefined);
	}

	async acquireOrLoadSession(chatResource: URI, _location: ChatAgentLocation, token: CancellationToken): Promise<{ object: IChatModel; dispose(): void } | undefined> {
		if (this._acquireOrLoadHandler) {
			return this._acquireOrLoadHandler(chatResource, token);
		}
		const model = this.getSession(chatResource);
		return model ? { object: model, dispose: () => { } } : undefined;
	}

	setAcquireOrLoadHandler(handler: ((chatResource: URI, token: CancellationToken) => Promise<{ object: IChatModel; dispose(): void } | undefined>) | undefined): void {
		this._acquireOrLoadHandler = handler;
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
		readonly parts?: IChatResponseModel['response']['value'];
	}): void {
		this._chatModels.set(chatResource.toString(), this._createChatModel({
			requestId: options.requestId,
			parts: [{
				kind: 'markdownContent',
				content: { value: options.markdown },
			}, ...options.parts ?? []],
			isComplete: true,
		}));
		this._chatModelsObservable.set([...this._chatModels.values()], undefined);
	}

	/**
	 * Loads a model whose active turn has not streamed in yet (its requests are empty), then
	 * returns a callback that streams in a pending question carousel by mutating the model and
	 * firing the model's own `onDidChange` — without changing the set of loaded models. This
	 * mirrors a window reload, where an agent-host needs-input session is restored and its
	 * pending question arrives via progress streaming after the model is already loaded.
	 */
	installDeferredQuestionModel(chatResource: URI, store: DisposableStore, options: {
		readonly requestId: string;
		readonly resolveId: string;
		readonly allowSkip: boolean;
		readonly message: string;
		readonly questions: IChatQuestionCarousel['questions'];
	}): () => void {
		const onDidChange = store.add(new Emitter<void>());
		let requests: IChatRequestModel[] = [];
		const model = upcastPartial<IChatModel>({
			onDidChange: onDidChange.event as unknown as IChatModel['onDidChange'],
			getRequests: () => requests,
		});
		this._chatModels.set(chatResource.toString(), model);
		this._chatModelsObservable.set([...this._chatModels.values()], undefined);
		return () => {
			const response = upcastPartial<IChatResponseModel>({
				requestId: options.requestId,
				isCanceled: false,
				isComplete: false,
				response: {
					value: [{
						kind: 'questionCarousel',
						resolveId: options.resolveId,
						allowSkip: options.allowSkip,
						message: options.message,
						questions: options.questions,
						isUsed: false,
					}],
					getMarkdown: () => '',
					getFinalResponse: () => '',
					toString: () => '',
				},
				isPendingConfirmation: observableValue(`test.pendingConfirmation.${options.requestId}`, { startedWaitingAt: 10 }),
			});
			requests = [upcastPartial<IChatRequestModel>({
				id: `request.${options.requestId}`,
				response,
				isHiddenFromTranscript: false,
				shouldBeRemovedOnSend: undefined,
			})];
			onDidChange.fire();
		};
	}

	/**
	 * Loads a model with one or more prior completed turns followed by a pending question turn.
	 * `pending.prose` is the assistant markdown in the pending turn (which can stay constant while
	 * the carousel advances through different questions); it defaults to `pending.message`.
	 * `pending.answered` are already-answered questions in the pending turn (retained in history as
	 * used carousels with data), representing the recent Q&A leading up to the current question.
	 */
	setConversationWithPendingQuestion(chatResource: URI, options: {
		readonly priorResponses: readonly { readonly requestId: string; readonly markdown: string }[];
		readonly pending: { readonly requestId: string; readonly resolveId: string; readonly message: string; readonly questionTitle: string; readonly prose?: string; readonly answered?: readonly { readonly title: string; readonly answer: string }[] };
	}): void {
		const requests: IChatRequestModel[] = options.priorResponses.map(prior => this._buildRequest({
			requestId: prior.requestId,
			isComplete: true,
			parts: [{ kind: 'markdownContent', content: { value: prior.markdown } }],
		}));
		const answeredParts = (options.pending.answered ?? []).map((entry, index) => ({
			kind: 'questionCarousel' as const,
			resolveId: `answered-${index}`,
			allowSkip: true,
			message: '',
			questions: [{ id: `aq${index}`, type: 'text' as const, title: entry.title, required: true }],
			data: { [`aq${index}`]: entry.answer },
			isUsed: true,
		}));
		requests.push(this._buildRequest({
			requestId: options.pending.requestId,
			startedWaitingAt: 10,
			parts: [
				{ kind: 'markdownContent', content: { value: options.pending.prose ?? options.pending.message } },
				...answeredParts,
				{
					kind: 'questionCarousel',
					resolveId: options.pending.resolveId,
					allowSkip: true,
					message: options.pending.message,
					questions: [{ id: 'q1', type: 'text', title: options.pending.questionTitle, required: true }],
					isUsed: false,
				},
			],
		}));
		this._chatModels.set(chatResource.toString(), upcastPartial<IChatModel>({
			onDidChange: Event.None,
			getRequests: () => requests,
		}));
		this._chatModelsObservable.set([...this._chatModels.values()], undefined);
	}

	private _createChatModel(options: { readonly requestId: string; readonly parts: IChatResponseModel['response']['value']; readonly startedWaitingAt?: number; readonly isComplete?: boolean }): IChatModel {
		const request = this._buildRequest(options);
		return upcastPartial<IChatModel>({
			onDidChange: Event.None,
			getRequests: () => [request],
		});
	}

	private _buildRequest(options: { readonly requestId: string; readonly parts: IChatResponseModel['response']['value']; readonly startedWaitingAt?: number; readonly isComplete?: boolean }): IChatRequestModel {
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
		return upcastPartial<IChatRequestModel>({
			id: `request.${options.requestId}`,
			response,
			isHiddenFromTranscript: false,
			shouldBeRemovedOnSend: undefined,
		});
	}
}

class TestGitHubService {
	pollingCount = 0;
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
			model = new TestPullRequestModel(() => this.trackPolling());
			this._prModels.set(key, model);
		}
		return model;
	}

	private _ciModel(owner: string, repo: string, prNumber: number, headSha: string): TestCIModel {
		const key = `${owner}/${repo}/${prNumber}/${headSha}`;
		let model = this._ciModels.get(key);
		if (!model) {
			model = new TestCIModel(() => this.trackPolling());
			this._ciModels.set(key, model);
		}
		return model;
	}

	private _reviewThreadModel(owner: string, repo: string, prNumber: number): TestReviewThreadsModel {
		const key = `${owner}/${repo}/${prNumber}`;
		let model = this._reviewThreadModels.get(key);
		if (!model) {
			model = new TestReviewThreadsModel(() => this.trackPolling());
			this._reviewThreadModels.set(key, model);
		}
		return model;
	}

	private trackPolling() {
		this.pollingCount++;
		return toDisposable(() => { this.pollingCount--; });
	}
}

class TestPullRequestModel {
	constructor(private readonly poll: () => IDisposable) { }
	private readonly _pullRequest = observableValue<IGitHubPullRequest | undefined>('test.pullRequest', undefined);
	readonly pullRequest = this._pullRequest;

	set(pullRequest: IGitHubPullRequest): void {
		this._pullRequest.set(pullRequest, undefined);
	}

	refresh(): Promise<void> {
		return Promise.resolve();
	}

	startPolling() {
		return this.poll();
	}
}

class TestCIModel {
	constructor(private readonly poll: () => IDisposable) { }
	private readonly _overallStatus = observableValue<GitHubCIOverallStatus>('test.ciStatus', GitHubCIOverallStatus.Neutral);
	readonly overallStatus = this._overallStatus;
	private readonly _checks = observableValue<readonly IGitHubCICheck[]>('test.ciChecks', []);
	readonly checks = this._checks;

	set(status: GitHubCIOverallStatus, checks: readonly IGitHubCICheck[]): void {
		transaction(tx => {
			this._overallStatus.set(status, tx);
			this._checks.set(checks, tx);
		});
	}

	refresh(): Promise<void> {
		return Promise.resolve();
	}

	startPolling() {
		return this.poll();
	}
}

class TestReviewThreadsModel {
	constructor(private readonly poll: () => IDisposable) { }
	private readonly _reviewThreads = observableValue<readonly IGitHubPullRequestReviewThread[]>('test.reviewThreads', []);
	readonly reviewThreads = this._reviewThreads;

	set(threads: readonly IGitHubPullRequestReviewThread[]): void {
		this._reviewThreads.set(threads, undefined);
	}

	refresh(): Promise<void> {
		return Promise.resolve();
	}

	startPolling() {
		return this.poll();
	}
}
