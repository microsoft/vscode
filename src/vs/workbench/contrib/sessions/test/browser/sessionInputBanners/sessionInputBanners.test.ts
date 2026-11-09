/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { buildTestSession } from '../../common/testSessionBuilder.js';
import { SESSIONS_LIST_INLINE_ACTIONS_SETTING } from '../../../common/sessionConfig.js';
import { SessionInlineActions } from '../../../browser/views/sessionInlineActions.js';
import { ISessionsManagementService } from '../../../common/sessionsManagement.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { ContextKeyService } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import assert from 'assert';
import { IManagedHover } from '../../../../../../base/browser/ui/hover/hover.js';
import { IAction } from '../../../../../../base/common/actions.js';
import { timeout, DeferredPromise } from '../../../../../../base/common/async.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Event, Emitter } from '../../../../../../base/common/event.js';
import { Disposable, ImmortalReference, IDisposable, IReference } from '../../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { hasKey } from '../../../../../../base/common/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { AgentMergeSessionState } from '../../../../../../platform/agentHost/common/agentMerge.js';
import { ArtifactIntegrationsSettingId } from '../../../../../../platform/artifactIntegrations/common/artifactIntegration.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IStorageService, StorageScope } from '../../../../../../platform/storage/common/storage.js';
import { IChatWidget, IChatWidgetService } from '../../../../chat/browser/chat.js';
import type { IChatResponseModel } from '../../../../chat/common/model/chatModel.js';
import { TestStorageService } from '../../../../../test/common/workbenchTestServices.js';
import { IAgentHostSessionsProvider, LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../common/agentHostSessionsProvider.js';
import { IChat, IGitHubPullRequestRef, ISessionWorkspace, SessionStatus } from '../../../../../services/sessions/common/session.js';
import { ISessionsProvider } from '../../../common/sessionsProvider.js';
import { ISessionsProvidersService } from '../../../browser/sessionsProvidersService.js';
import { ISessionHost, SessionHost, SessionHostKind } from '../../../../../services/sessions/browser/sessionHost.js';
import { ITestSessionWithChat, stubSessionHosts } from '../sessionHostTestUtils.js';
import { ISessionsService } from '../../../browser/sessionsService.js';
import { IAgentFeedbackService, ISubmitFeedbackOptions } from '../../../browser/agentFeedback.js';
import { AgentFeedbackKind, AgentFeedbackState, IAgentFeedback } from '../../../browser/agentFeedbackModel.js';
import { IGitHubService } from '../../../browser/github/githubService.js';
import { GitHubPullRequestCIModel } from '../../../browser/github/models/githubPullRequestCIModel.js';
import { GitHubPullRequestModel } from '../../../browser/github/models/githubPullRequestModel.js';
import { GitHubPullRequestState, IGitHubPullRequest, OPEN_PULL_REQUEST_ACTION_ID } from '../../../common/github/types.js';
import { PullRequestCheck } from '../../../../../../platform/github/common/githubPullRequestService.js';
import { classifyRequiredPullRequestChecks } from '../../../../../../platform/github/common/pullRequestRequiredChecks.js';
import { SessionInputBanners } from '../../../browser/sessionInputBanners/sessionInputBanners.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';

suite('SessionInputBanners', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const isDraft of [false, true]) {
		test(`groups actionable ${isDraft ? 'draft' : 'ready'} PRs, hides merged PR comments, scopes the combined request, and dismisses one carousel item`, () => testActionablePullRequests(isDraft));
	}

	test('inline actions prefer combined requests, target a peer in the background, and preserve pending state across recycling', async () => {
		const built = buildTestSession({ id: 'inline', title: 'Main', chats: [{ id: 'peer', title: 'Peer' }] });
		const mainChat = { ...built.mainChat.chat, workspace: constObservable(workspaceWithPullRequests('/main', [pullRequest(42), pullRequest(41)])) };
		const peer = { ...built.chats.get('peer')!.chat, workspace: constObservable(workspaceWithPullRequests('/peer', [pullRequest(43)])) };
		const session = { ...built.session, mainChat: constObservable(mainChat), chats: observableValue('chats', [mainChat, peer]) };
		const feedback = observableValue<readonly IAgentFeedback[]>('feedback', [prFeedback('combined', session.resource, 41)]);
		const ci = ciModel([failedCheck(1)]);
		const calls: string[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		const configuration = new TestConfigurationService({ [SESSIONS_LIST_INLINE_ACTIONS_SETTING]: true });
		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configuration);
		instantiationService.stub(IContextKeyService, store.add(new ContextKeyService(configuration)));
		instantiationService.stub(ISessionHost, new class extends mock<ISessionHost>() { }());
		instantiationService.stub(ISessionsProvidersService, { onDidChangeProviders: Event.None, getProvider: () => undefined });
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() { }());
		instantiationService.stub(IStorageService, store.add(new TestStorageService()));
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IChatWidgetService, { getWidgetBySessionResource: () => { throw new Error('Must not open or use a widget'); } });
		instantiationService.stub(IGitHubService, {
			createPullRequestModelReference: (_owner: string, _repo: string, number: number) => new ImmortalReference(pullRequestModel(number, 'PR', false)),
			createPullRequestCIModelReference: () => new ImmortalReference(ci),
		});
		instantiationService.stub(IAgentFeedbackService, {
			onDidChangeFeedback: Event.None,
			getFeedbackObservable: () => feedback,
		});
		let reject = false;
		const accepted = new DeferredPromise<void>();
		instantiationService.stub(ISessionsManagementService, {
			getSession: () => session,
			sendRequestInBackground: async (_session, chat) => {
				calls.push(chat.resource.toString());
				if (reject) {
					throw new Error('Rejected');
				}
				await accepted.p;
			},
		});
		const errors: string[] = [];
		instantiationService.stub(INotificationService, { error: error => errors.push(String(error)) });
		instantiationService.stub(IChatEntitlementService, { onDidChangeSentiment: Event.None, sentiment: {} });
		const visible = observableValue('visible', true);
		const host = mainWindow.document.createElement('div');
		const mainBefore = host.appendChild(mainWindow.document.createElement('div'));
		const peerBefore = host.appendChild(mainWindow.document.createElement('div'));
		const main = store.add(instantiationService.createInstance(SessionInlineActions, session, undefined, mainBefore, visible, () => { }, () => { }));
		const row = store.add(instantiationService.createInstance(SessionInlineActions, session, peer, peerBefore, visible, () => { }, () => { }));
		const buttons = () => [...host.querySelectorAll<HTMLElement>('.session-inline-actions:not([hidden]) .monaco-button')];
		assert.deepStrictEqual({ labels: buttons().map(button => button.textContent), dropdowns: host.querySelectorAll('.monaco-button-dropdown').length }, {
			labels: ['Fix Checks & Address Comments', 'Fix Checks'], dropdowns: 0,
		});
		buttons()[1].click();
		buttons()[1].click();
		await timeout(0);
		row.dispose();
		store.add(instantiationService.createInstance(SessionInlineActions, session, peer, peerBefore, visible, () => { }, () => { }));
		buttons()[1].click();
		assert.deepStrictEqual({ calls, label: buttons()[1].textContent?.trim(), disabled: buttons()[1].getAttribute('aria-disabled') }, {
			calls: [peer.resource.toString()], label: 'Sending...', disabled: 'true',
		});
		await accepted.complete();
		await timeout(0);
		assert.deepStrictEqual({ peerHidden: host.querySelectorAll<HTMLElement>('.session-inline-actions')[1].hidden, errors }, {
			peerHidden: true, errors: [],
		});
		ci.fixRequested.set(false, undefined);
		reject = true;
		buttons()[1].click();
		await timeout(0);
		assert.deepStrictEqual({ disabled: buttons()[1].getAttribute('aria-disabled'), errors }, { disabled: 'false', errors: ['Error: Rejected'] });
		session.chats.set([mainChat], undefined);
		buttons()[1].click();
		await timeout(0);
		assert.deepStrictEqual({ calls: calls.length, lastError: errors.at(-1) }, {
			calls: 2, lastError: 'Error: This action is no longer available for this chat.',
		});
		visible.set(false, undefined);
		assert.strictEqual(host.querySelectorAll('.session-inline-actions').length, 0);
		main.dispose();
	});

	test('shows the pull requests of the session of its window, not of the globally active session', () => {
		// One failing check per pull request: each session's pull request has its own number of failing checks.
		const sessionOf = (id: string, prNumber: number) => {
			const chat = upcastPartial<IChat>({
				resource: URI.parse(`local-agent-host-chat:/${id}/main`),
				workspace: observableValue<ISessionWorkspace | undefined>('workspace', workspaceWithPullRequests(`/${id}`, [pullRequest(prNumber)])),
			});
			return new class extends mock<ITestSessionWithChat>() {
				override readonly sessionId = id;
				override readonly resource = URI.parse(`local-agent-host:/${id}`);
				override readonly providerId = LOCAL_AGENT_HOST_PROVIDER_ID;
				override readonly status = observableValue('status', SessionStatus.Completed);
				override readonly mainChat = observableValue<IChat>('mainChat', chat);
				override readonly activeChat = observableValue<IChat>('activeChat', chat);
				override readonly isCreated = constObservable(true);
			}();
		};
		const windowA = sessionOf('window-a', 1);
		const windowB = sessionOf('window-b', 2);
		const main = sessionOf('main', 3);
		const ciModels = new Map([
			[1, ciModel([failedCheck(1)])],
			[2, ciModel([failedCheck(1), failedCheck(2)])],
			[3, ciModel([failedCheck(1), failedCheck(2), failedCheck(3)])],
		]);

		const instantiationService = store.add(new TestInstantiationService());
		// The chat window of session A has focus: it is the globally active session.
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			readonly activeSession = observableValue<ITestSessionWithChat | undefined>('activeSession', windowA);
			readonly mainWindowActiveSession = observableValue<ITestSessionWithChat | undefined>('mainWindowActiveSession', main);
		}());
		const agentHostProvider = new class extends mock<IAgentHostSessionsProvider>() {
			override readonly id = LOCAL_AGENT_HOST_PROVIDER_ID;
			override readonly onDidChangeSessions = Event.None;
			override readonly onDidChangeSessionConfig = Event.None;
			override getAgentMergeClientStateObservable() { return observableValue<AgentMergeSessionState>('agentMergeState', { enabled: false }); }
		}();
		instantiationService.stub(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
			override readonly onDidChangeProviders = Event.None;
			override getProvider<T extends ISessionsProvider>(): T | undefined {
				return agentHostProvider as unknown as T;
			}
		}());
		const configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configuration);
		instantiationService.stub(IGitHubService, new class extends mock<IGitHubService>() {
			override createPullRequestModelReference(_owner: string, _repo: string, prNumber: number): IReference<GitHubPullRequestModel> {
				return new ImmortalReference(pullRequestModel(prNumber, `Pull request ${prNumber}`, false));
			}
			override createPullRequestCIModelReference(_owner: string, _repo: string, prNumber: number): IReference<GitHubPullRequestCIModel> {
				return new ImmortalReference(ciModels.get(prNumber)!);
			}
		}());
		instantiationService.stub(IAgentFeedbackService, new class extends mock<IAgentFeedbackService>() {
			override readonly onDidChangeFeedback = Event.None;
			override getFeedback(): readonly IAgentFeedback[] { return []; }
		}());
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() { }());
		instantiationService.stub(IStorageService, store.add(new TestStorageService()));
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IChatWidgetService, new class extends mock<IChatWidgetService>() {
			override readonly onDidAddWidget = Event.None;
		}());
		instantiationService.stub(IHoverService, upcastPartial<IHoverService>({
			setupManagedHover: () => upcastPartial<IManagedHover>({ dispose() { } }),
		}));
		instantiationService.stub(IContextMenuService, upcastPartial<IContextMenuService>({ showContextMenu() { } }));

		// Each chat window scopes its views to its own session; the main window to the session it shows.
		const contextKeyService = upcastPartial<IContextKeyService>({});
		const hostOf = (kind: SessionHostKind, session: ITestSessionWithChat) => new SessionHost({ kind, parent: undefined, session: constObservable<ITestSessionWithChat | undefined>(session), chat: constObservable(session?.activeChat?.get()), contextKeyService });
		const bannersIn = (host: ISessionHost) => {
			const banners = store.add(instantiationService.createChild(new ServiceCollection([ISessionHost, host])).createInstance(SessionInputBanners));
			// Every chat window's session view is active, as is the main window's.
			banners.setActive(true);
			return currentBanner(banners).text;
		};
		assert.deepStrictEqual({
			windowA: bannersIn(hostOf(SessionHostKind.ChatWindow, windowA)),
			windowB: bannersIn(hostOf(SessionHostKind.ChatWindow, windowB)),
			// A pane of the main window shows the banners of the main window's session.
			main: bannersIn(new SessionHost({ kind: SessionHostKind.Pane, parent: hostOf(SessionHostKind.MainWindow, main), session: constObservable<ITestSessionWithChat | undefined>(windowA), chat: constObservable(windowA?.activeChat?.get()), contextKeyService })),
		}, {
			windowA: '1 check failed',
			windowB: '2 out of 2 checks failed',
			main: '3 out of 3 checks failed',
		});
	});

	async function testActionablePullRequests(isDraft: boolean): Promise<void> {
		const sessionResource = URI.parse('local-agent-host:/session-1');
		const pullRequests = [pullRequest(42), pullRequest(41), pullRequest(40), pullRequest(39), { ...pullRequest(37), liveState: 'merged' as const }];
		const sessionWorkspace = observableValue<ISessionWorkspace | undefined>('workspace', workspaceWithPullRequests('/workspace', pullRequests));
		const mainChat = upcastPartial<IChat>({
			resource: URI.parse('local-agent-host-chat:/session-1/main'),
			workspace: sessionWorkspace,
		});
		const secondaryPullRequest = pullRequest(38);
		const secondaryChat = upcastPartial<IChat>({
			resource: URI.parse('local-agent-host-chat:/session-1/secondary'),
			workspace: observableValue<ISessionWorkspace | undefined>('secondaryWorkspace', workspaceWithPullRequests('/workspace-secondary', [secondaryPullRequest])),
		});
		const activeChat = observableValue<IChat>('activeChat', mainChat);
		const session = new class extends mock<ITestSessionWithChat>() {
			override readonly sessionId = 'session-1';
			override readonly resource = sessionResource;
			override readonly providerId = LOCAL_AGENT_HOST_PROVIDER_ID;
			override readonly status = observableValue('status', SessionStatus.Completed);
			override readonly workspace = sessionWorkspace;
			override readonly mainChat = observableValue<IChat>('mainChat', mainChat);
			override readonly activeChat = activeChat;
			override readonly isCreated = constObservable(true);
		}();
		const sessionsService = new class extends mock<ISessionsService>() {
			readonly activeSession = observableValue<ITestSessionWithChat | undefined>('activeSession', session);
		}();
		const agentMergeState = observableValue<AgentMergeSessionState>('agentMergeState', { enabled: false });
		const agentHostProvider = new class extends mock<IAgentHostSessionsProvider>() {
			override readonly id = LOCAL_AGENT_HOST_PROVIDER_ID;
			override readonly onDidChangeSessions = Event.None;
			override readonly onDidChangeSessionConfig = Event.None;
			override getAgentMergeClientStateObservable() { return agentMergeState; }
		}();
		const sessionsProvidersService = new class extends mock<ISessionsProvidersService>() {
			override readonly onDidChangeProviders = Event.None;
			override getProvider<T extends ISessionsProvider>(): T | undefined {
				return agentHostProvider as unknown as T;
			}
		}();

		const pullRequest41Model = pullRequestModel(41, 'Older pull request', isDraft);
		const prModels = new Map<number, GitHubPullRequestModel>([
			[42, pullRequestModel(42, 'Newest pull request', isDraft)],
			[41, pullRequest41Model],
			[40, pullRequestModel(40, 'Closed pull request', isDraft, GitHubPullRequestState.Closed)],
			[39, pullRequestModel(39, 'Merged pull request', false, GitHubPullRequestState.Merged)],
			[38, pullRequestModel(38, 'Secondary chat pull request', isDraft)],
			[37, unresolvedPullRequestModel()],
		]);
		const ciModels = new Map([
			[42, ciModel([failedCheck(1), failedCheck(2)])],
			[41, ciModel([])],
			[40, ciModel([failedCheck(3)])],
			[39, ciModel([failedCheck(4)])],
			[38, ciModel([failedCheck(5)])],
		]);
		const gitHubService = new class extends mock<IGitHubService>() {
			override createPullRequestModelReference(_owner: string, _repo: string, prNumber: number): IReference<GitHubPullRequestModel> {
				return new ImmortalReference(prModels.get(prNumber)!);
			}
			override createPullRequestCIModelReference(_owner: string, _repo: string, prNumber: number): IReference<GitHubPullRequestCIModel> {
				return new ImmortalReference(ciModels.get(prNumber)!);
			}
		}();

		let feedbackItems: IAgentFeedback[] = [
			prFeedback('pr-42-a', sessionResource, 42),
			prFeedback('pr-42-b', sessionResource, 42),
			prFeedback('pr-41', sessionResource, 41),
			prFeedback('pr-39', sessionResource, 39),
			prFeedback('pr-37', sessionResource, 37),
			agentFeedback('agent', sessionResource),
		];
		const onDidChangeFeedback = store.add(new Emitter<{ sessionResource: URI; feedbackItems: readonly IAgentFeedback[] }>());
		let submitted: ISubmitFeedbackOptions | undefined;
		let submittedResource: URI | undefined;
		let revealedFeedback: { sessionResource: URI; feedbackId: string } | undefined;
		const feedbackService = new class extends mock<IAgentFeedbackService>() {
			override readonly onDidChangeFeedback = onDidChangeFeedback.event;
			override getFeedback(): readonly IAgentFeedback[] { return feedbackItems; }
			override acceptFeedback(_sessionResource: URI, feedbackId: string): void {
				feedbackItems = feedbackItems.map(item => item.id === feedbackId ? { ...item, state: AgentFeedbackState.Accepted } : item);
				onDidChangeFeedback.fire({ sessionResource, feedbackItems });
			}
			override async submitFeedback(sessionResource: URI, options?: ISubmitFeedbackOptions): Promise<boolean> {
				submittedResource = sessionResource;
				submitted = options;
				options?.onRequestAccepted?.();
				return true;
			}
			override async revealFeedback(sessionResource: URI, feedbackId: string): Promise<void> {
				revealedFeedback = { sessionResource, feedbackId };
			}
		}();

		const chatWidget = upcastPartial<IChatWidget>({
			acceptInput: async () => upcastPartial<IChatResponseModel>({}),
		});
		const widgetLookups: URI[] = [];
		const chatWidgetService = new class extends mock<IChatWidgetService>() {
			override readonly onDidAddWidget = Event.None;
			override getWidgetBySessionResource(resource: URI): IChatWidget {
				widgetLookups.push(resource);
				return chatWidget;
			}
		}();
		const storageService = store.add(new TestStorageService());
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IHoverService, upcastPartial<IHoverService>({
			setupManagedHover: () => upcastPartial<IManagedHover>({ dispose() { } }),
		}));
		let dropdownActions: readonly IAction[] = [];
		instantiationService.stub(IContextMenuService, upcastPartial<IContextMenuService>({
			showContextMenu(delegate) {
				dropdownActions = delegate.getActions?.() ?? [];
			},
		}));
		let revealedPullRequest: { commandId: string; args: readonly unknown[] } | undefined;
		const commandService = new class extends mock<ICommandService>() {
			override async executeCommand<T>(commandId: string, ...args: unknown[]): Promise<T | undefined> {
				const [options] = args;
				assert.ok(options !== null && typeof options === 'object' && hasKey(options, { pullRequest: true }), 'Expected the reveal command argument to contain a pullRequest');
				revealedPullRequest = { commandId, args };
				return undefined;
			}
		}();

		const configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		const banners = store.add(new SessionInputBanners(
			stubSessionHosts(instantiationService, store, { session: sessionsService.activeSession }).mainHost,
			sessionsProvidersService,
			configuration,
			gitHubService,
			feedbackService,
			commandService,
			storageService,
			instantiationService,
			new NullLogService(),
			chatWidgetService,
		));
		banners.setActive(true);

		assert.deepStrictEqual({
			current: currentBanner(banners),
			ciPolling: [...ciModels].map(([number, model]) => ({
				number,
				refreshCalls: model.refreshCalls,
				startPollingCalls: model.startPollingCalls,
			})),
		}, {
			current: {
				position: '1/3',
				reference: '#42',
				text: '2 Checks Failing | 2 PR Comments',
				splitButtons: 1,
				actions: ['Fix Checks & Address Comments'],
			},
			ciPolling: [
				{ number: 42, refreshCalls: 1, startPollingCalls: 1 },
				{ number: 41, refreshCalls: 1, startPollingCalls: 1 },
				{ number: 40, refreshCalls: 0, startPollingCalls: 0 },
				{ number: 39, refreshCalls: 0, startPollingCalls: 0 },
				{ number: 38, refreshCalls: 0, startPollingCalls: 0 },
			],
		});

		const dropdownButton = banners.domNode.querySelector<HTMLElement>('.monaco-dropdown-button');
		assert.ok(dropdownButton, 'Expected the combined banner to have a dropdown button');
		dropdownButton.click();
		const revealCIAction = dropdownActions.find(action => action.id === 'revealCI');
		const revealCommentsAction = dropdownActions.find(action => action.id === 'revealComments');
		assert.ok(revealCIAction, 'Expected a Reveal Checks dropdown action');
		assert.ok(revealCommentsAction, 'Expected a Reveal Comments dropdown action');
		await revealCIAction.run();
		await revealCommentsAction.run();
		assert.deepStrictEqual({
			dropdownLabels: dropdownActions.map(action => action.label),
			revealedPullRequest,
			revealedFeedback,
			submitted,
			fixRequested: ciModels.get(42)?.fixRequested.get(),
		}, {
			dropdownLabels: ['Fix Checks', 'Address Comments', 'Reveal Checks', 'Reveal Comments'],
			revealedPullRequest: { commandId: OPEN_PULL_REQUEST_ACTION_ID, args: [{ pullRequest: pullRequests[0] }] },
			revealedFeedback: { sessionResource, feedbackId: 'pr-42-a' },
			submitted: undefined,
			fixRequested: false,
		});

		activeChat.set(secondaryChat, undefined);
		assert.deepStrictEqual({
			current: currentBanner(banners),
			secondaryCIPolling: {
				refreshCalls: ciModels.get(38)?.refreshCalls,
				startPollingCalls: ciModels.get(38)?.startPollingCalls,
			},
		}, {
			current: {
				position: '1/2',
				reference: undefined,
				text: '1 Check Failing',
				splitButtons: 0,
				actions: ['Fix Checks', 'Reveal'],
			},
			secondaryCIPolling: {
				refreshCalls: 1,
				startPollingCalls: 1,
			},
		});
		banners.domNode.querySelector<HTMLElement>('.session-input-banner-action')?.click();
		await timeout(0);
		assert.deepStrictEqual({
			fixTarget: widgetLookups.at(-1)?.toString(),
			fixRequested: ciModels.get(38)?.fixRequested.get(),
		}, {
			fixTarget: secondaryChat.resource.toString(),
			fixRequested: true,
		});
		activeChat.set(mainChat, undefined);

		agentMergeState.set({ enabled: true }, undefined);
		assert.deepStrictEqual(currentBanner(banners), {
			position: undefined,
			reference: undefined,
			text: '1 Agent Comment',
			splitButtons: 0,
			actions: ['Address Comments', 'Reveal'],
		});
		agentMergeState.set({ enabled: true, overrides: { fixCI: false } }, undefined);
		banners.domNode.querySelector<HTMLElement>('.session-input-banner-navigation-button.previous')?.click();
		assert.deepStrictEqual(currentBanner(banners), {
			position: '1/2',
			reference: '#42',
			text: '2 Checks Failing',
			splitButtons: 0,
			actions: ['Fix Checks', 'Reveal'],
		});
		agentMergeState.set({ enabled: false }, undefined);

		assert.deepStrictEqual(currentBanner(banners), {
			position: '1/3',
			reference: '#42',
			text: '2 Checks Failing | 2 PR Comments',
			splitButtons: 1,
			actions: ['Fix Checks & Address Comments'],
		});
		banners.domNode.querySelector<HTMLElement>('.session-input-banner-navigation-button.next')?.click();
		assert.deepStrictEqual(currentBanner(banners), {
			position: '2/3',
			reference: '#41',
			text: '1 PR Comment',
			splitButtons: 0,
			actions: ['Address Comments', 'Reveal'],
		});
		pullRequest41Model.setState(GitHubPullRequestState.Merged);
		assert.deepStrictEqual(currentBanner(banners), {
			position: '2/2',
			reference: 'Agent Review',
			text: '1 Agent Comment',
			splitButtons: 0,
			actions: ['Address Comments', 'Reveal'],
		});
		pullRequest41Model.setState(GitHubPullRequestState.Open);
		assert.deepStrictEqual(currentBanner(banners), {
			position: '3/3',
			reference: 'Agent Review',
			text: '1 Agent Comment',
			splitButtons: 0,
			actions: ['Address Comments', 'Reveal'],
		});
		const artifactIntegrationBanners: ReturnType<typeof currentBanner>[] = [];
		for (const enabled of [true, false]) {
			await configuration.setUserConfiguration(ArtifactIntegrationsSettingId, enabled);
			configuration.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: setting => setting === ArtifactIntegrationsSettingId }));
			artifactIntegrationBanners.push(currentBanner(banners));
		}
		assert.deepStrictEqual(artifactIntegrationBanners, [{
			position: undefined,
			reference: undefined,
			text: '1 Agent Comment',
			splitButtons: 0,
			actions: ['Address Comments', 'Reveal'],
		}, {
			position: '3/3',
			reference: 'Agent Review',
			text: '1 Agent Comment',
			splitButtons: 0,
			actions: ['Address Comments', 'Reveal'],
		}]);
		banners.domNode.querySelector<HTMLElement>('.session-input-banner-navigation-button.next')?.click();

		banners.domNode.querySelector<HTMLElement>('.session-input-banner-action.monaco-button-dropdown > .monaco-button')?.click();
		await timeout(0);

		assert.deepStrictEqual({
			submittedResource: submittedResource?.toString(),
			targetChat: submitted?.targetChat?.toString(),
			query: submitted?.query?.split('\n')[0],
			feedbackIds: submitted?.feedbackIds,
			fixRequested: ciModels.get(42)?.fixRequested.get(),
			current: currentBanner(banners),
		}, {
			// The feedback belongs to the session; the request goes to the chat showing the pull request.
			submittedResource: sessionResource.toString(),
			targetChat: mainChat.resource.toString(),
			query: '/fix-ci and /act-on-feedback for #42',
			feedbackIds: ['pr-42-a', 'pr-42-b'],
			fixRequested: true,
			current: {
				position: '1/2',
				reference: '#41',
				text: '1 PR Comment',
				splitButtons: 0,
				actions: ['Address Comments', 'Reveal'],
			},
		});

		banners.domNode.querySelector<HTMLElement>('.session-input-banner-dismiss')?.click();
		assert.deepStrictEqual({
			current: currentBanner(banners),
			dismissed: JSON.parse(storageService.get('sessions.inputBanners.dismissedItems', StorageScope.PROFILE) ?? '[]'),
		}, {
			current: {
				position: undefined,
				reference: undefined,
				text: '1 Agent Comment',
				splitButtons: 0,
				actions: ['Address Comments', 'Reveal'],
			},
			dismissed: ['session-1:pullRequest:owner/repo#41'],
		});
	}
});

function pullRequest(number: number): IGitHubPullRequestRef {
	return {
		owner: 'owner',
		repo: 'repo',
		number,
		uri: URI.parse(`https://github.com/owner/repo/pull/${number}`),
	};
}

function workspaceWithPullRequests(path: string, pullRequests: readonly IGitHubPullRequestRef[]): ISessionWorkspace {
	const uri = URI.file(path);
	return {
		uri,
		label: path,
		icon: Codicon.folder,
		folders: [{
			root: uri,
			workingDirectory: uri,
			name: path,
			description: undefined,
			gitRepository: {
				uri,
				workTreeUri: undefined,
				baseBranchName: undefined,
				gitHubInfo: observableValue('gitHubInfo', {
					owner: 'owner',
					repo: 'repo',
					pullRequests,
					pullRequest: pullRequests[0],
				}),
			},
		}],
		requiresWorkspaceTrust: false,
		isVirtualWorkspace: false,
	};
}

function pullRequestModel(number: number, title: string, isDraft: boolean, state = GitHubPullRequestState.Open): GitHubPullRequestModel & { setState(state: GitHubPullRequestState): void } {
	const pullRequest = observableValue<IGitHubPullRequest | undefined>('pullRequest', upcastPartial<IGitHubPullRequest>({
		number,
		title,
		state,
		isDraft,
		headSha: `sha-${number}`,
	}));
	return new class extends mock<GitHubPullRequestModel>() {
		override readonly pullRequest = pullRequest;
		setState(state: GitHubPullRequestState): void {
			pullRequest.set({ ...pullRequest.get()!, state }, undefined);
		}
		override refresh(): Promise<void> { return Promise.resolve(); }
		override startPolling(): IDisposable { return Disposable.None; }
	}();
}

function unresolvedPullRequestModel(): GitHubPullRequestModel {
	return new class extends mock<GitHubPullRequestModel>() {
		override readonly pullRequest = observableValue<IGitHubPullRequest | undefined>('pullRequest', undefined);
		override refresh(): Promise<void> { return Promise.resolve(); }
		override startPolling(): IDisposable { return Disposable.None; }
	}();
}

function ciModel(checks: readonly PullRequestCheck[]) {
	return new class extends mock<GitHubPullRequestCIModel>() {
		refreshCalls = 0;
		startPollingCalls = 0;
		override readonly requiredChecks = constObservable(classifyRequiredPullRequestChecks({ headSha: 'head', checks, requirednessComplete: true, expectedSuites: [], expectedSuitesComplete: true }));
		override readonly fixRequested = observableValue('fixRequested', false);
		override refresh(): Promise<void> {
			this.refreshCalls++;
			return Promise.resolve();
		}
		override startPolling(): IDisposable {
			this.startPollingCalls++;
			return Disposable.None;
		}
		override getCheckRunAnnotations(): Promise<string> { return Promise.resolve('failure details'); }
		override markFixRequested(): void { this.fixRequested.set(true, undefined); }
	}();
}

function failedCheck(id: number): PullRequestCheck {
	return { id: String(id), type: 'checkRun', name: `Check ${id}`, status: 'COMPLETED', conclusion: 'FAILURE' };
}

function prFeedback(id: string, sessionResource: URI, number: number): IAgentFeedback {
	return {
		id,
		text: id,
		resourceUri: URI.file(`/workspace/${id}.ts`),
		range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
		sessionResource,
		kind: AgentFeedbackKind.PRReview,
		sourcePRReviewCommentId: `thread-${id}`,
		sourcePullRequest: { owner: 'owner', repo: 'repo', number },
		state: AgentFeedbackState.Created,
	};
}

function agentFeedback(id: string, sessionResource: URI): IAgentFeedback {
	return {
		id,
		text: id,
		resourceUri: URI.file(`/workspace/${id}.ts`),
		range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
		sessionResource,
		kind: AgentFeedbackKind.AgentReview,
		state: AgentFeedbackState.Created,
	};
}

function currentBanner(banners: SessionInputBanners): { position: string | undefined; reference: string | undefined; text: string | undefined; splitButtons: number; actions: string[] } {
	return {
		position: banners.domNode.querySelector('.session-input-banner-position')?.textContent ?? undefined,
		reference: banners.domNode.querySelector('.session-input-banner-reference')?.textContent ?? undefined,
		text: banners.domNode.querySelector('.session-input-banner-text')?.textContent ?? undefined,
		splitButtons: banners.domNode.querySelectorAll('.monaco-button-dropdown').length,
		actions: [...banners.domNode.querySelectorAll<HTMLElement>('.session-input-banner-actions > .session-input-banner-action')].map(action => action.querySelector(':scope > .monaco-button:first-child')?.textContent ?? action.textContent ?? ''),
	};
}
