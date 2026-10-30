/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { match, spy, stub } from 'sinon';
import { timeout } from '../../../../../base/common/async.js';
import { DomScrollableElement } from '../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IObservable, constObservable, observableValue } from '../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { IChatSessionHistoryStatus } from '../../../../../platform/chat/common/chatSessionHistory.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IStorageService, InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { ChatSendResult, IChatQuestionAnswerValue, IChatService, IChatToolInvocation, ToolConfirmKind } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatModel, IChatRequestModel, IChatResponseModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { ChatViewModel, IChatViewModelChangeEvent } from '../../../../../workbench/contrib/chat/common/model/chatViewModel.js';
import { ChatListWidget } from '../../../../../workbench/contrib/chat/browser/widget/chatListWidget.js';
import { ChatQuestionCarouselData } from '../../../../../workbench/contrib/chat/common/model/chatProgressTypes/chatQuestionCarouselData.js';
import { ChatQuestionCarouselPart } from '../../../../../workbench/contrib/chat/browser/widget/chatContentParts/chatQuestionCarouselPart.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { URI } from '../../../../../base/common/uri.js';
import { IOnboardingScenarioService } from '../../../../../workbench/contrib/onboarding/common/onboardingScenarioService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { IChatViewFactory } from '../../../../services/chatView/browser/chatViewFactory.js';
import { AbstractChatView, IChatViewOptions } from '../../../../browser/parts/chatView.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { IChat, ISession, ISessionArtifact, ISessionCapabilities, ISessionChangeset, ISessionChangesetOperation, ISessionFolder, ISessionGitRepository, ISessionWorkspace, SessionArtifactKind, SessionChangesetOperationScope, SessionChangesetOperationStatus } from '../../../../services/sessions/common/session.js';
import { InboxNotificationsView } from '../../browser/inboxNotificationsView.js';
import { InboxEvidenceWidget } from '../../browser/inboxEvidenceWidget.js';
import { InboxCanvases } from '../../browser/inboxCanvases.js';
import { IInboxDetailSummary, IInboxNotificationItem, IInboxNotificationsService, IInboxNotificationToolConfirmationPart, InboxNotificationActionKind, InboxNotificationKind, InboxNotificationPriority, InboxNotificationsSortMode } from '../../common/inboxNotificationsService.js';
import { IGitHubService } from '../../../github/browser/githubService.js';
import { AgentFeedbackKind, AgentFeedbackState, IAgentFeedback, IAgentFeedbackChangeEvent, IAgentFeedbackService, ISubmitFeedbackOptions } from '../../../agentFeedback/browser/agentFeedbackService.js';
import { ConfirmationOptionKind } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { GitHubPullRequestCIModel } from '../../../github/browser/models/githubPullRequestCIModel.js';
import { GitHubPullRequestModel } from '../../../github/browser/models/githubPullRequestModel.js';
import { PullRequestCheck } from '../../../../../platform/github/common/githubPullRequestService.js';

suite('InboxNotificationsView', () => {
	const disposables = new DisposableStore();
	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	class TestChatView extends AbstractChatView {
		readonly kind = 'chat';
		readonly bindings: { chat: IChat; historyKey?: string; session?: ISession }[] = [];
		disposed = false;
		readonly input = document.createElement('textarea');
		readonly layouts: { width: number; height: number }[] = [];
		readonly submitted = this._register(new Emitter<URI>());
		override readonly onDidSubmitRequest = this.submitted.event;
		override readonly isLoadingTranscript = observableValue(this, false);
		override readonly historyStatus = observableValue<IChatSessionHistoryStatus | undefined>(this, undefined);

		constructor() {
			super();
			this.element.appendChild(this.input);
		}

		override setChat(chat: IChat, historyKey?: string, session?: ISession): void {
			this.bindings.push({ chat, historyKey, session });
		}

		protected override doLayout(width: number, height: number): void {
			this.layouts.push({ width, height });
		}

		override toJSON(): object { return {}; }
		override focus(): void { this.input.focus(); }

		override dispose(): void {
			this.disposed = true;
			super.dispose();
		}
	}

	function accessView(view: InboxNotificationsView) {
		return view as unknown as {
			carouselModels: ReadonlyMap<string, ChatQuestionCarouselData>;
			scrollableElement: DomScrollableElement;
			detailScrollableElement: DomScrollableElement;
			submitToolConfirmationPart(item: IInboxNotificationItem, part: IInboxNotificationToolConfirmationPart, buttonIndex: number): Promise<void>;
			classifyCarouselAnswers(answers: Map<string, IChatQuestionAnswerValue>): { answerKind: string; answerCharCount: number };
			runMergedSessionCleanupAction(item: IInboxNotificationItem, kind: InboxNotificationActionKind.ArchiveSession | InboxNotificationActionKind.DeleteSession, enableAlways: boolean): Promise<string>;
			getSessionChatModel(item: IInboxNotificationItem): IChatModel | undefined;
			runInboxPullRequestAction(item: IInboxNotificationItem, kind: InboxNotificationActionKind.AgentMergeFixCI | InboxNotificationActionKind.AgentMergeAddressReviews | InboxNotificationActionKind.AgentMergeMergePullRequest): Promise<string>;
		};
	}

	function createView(
		items: IObservable<readonly IInboxNotificationItem[]>,
		options: {
			intersectionObserver?: typeof IntersectionObserver;
			resizeObserver?: typeof ResizeObserver;
			previewRequests?: string[];
			events?: string[];
			telemetry?: { event: string; data: { actionId?: string; interaction?: string; answerKind?: string; answerCharCount?: number } }[];
			contextKeyService?: IContextKeyService;
			dismissed?: IObservable<readonly IInboxNotificationItem[]>;
			previews?: IObservable<ReadonlyMap<string, string>>;
			detailSummaries?: IObservable<ReadonlyMap<string, IInboxDetailSummary>>;
			completedVisible?: boolean;
			chatService?: Partial<IChatService>;
		} = {},
	) {
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IInboxNotificationsService, {
			notifications: items,
			dismissedNotifications: options.dismissed ?? constObservable([]),
			previews: options.previews ?? constObservable(new Map()),
			sortMode: constObservable(InboxNotificationsSortMode.Priority),
			isLoading: constObservable(false),
			detailSummaries: options.detailSummaries ?? constObservable(new Map()),
			requestPreview: item => { options.previewRequests?.push(item.id); },
			getInteractionTelemetryContext: () => ({ agentSessionId: 'none', providerId: 'none' }),
			requestDetailSummary: () => { },
		});
		instantiationService.stub(IChatService, { getSession: () => undefined, onDidCreateModel: Event.None, ...options.chatService });
		instantiationService.stub(ISessionsService, {});
		instantiationService.stub(ISessionsManagementService, { getSession: () => undefined });
		instantiationService.stubInstance(InboxEvidenceWidget, { element: document.createElement('div'), getAccessibleContent: () => '', dispose: () => { } });
		instantiationService.stubInstance(InboxCanvases, { element: document.createElement('div'), layout: () => { }, setVisible: () => { }, createAccessibleProvider: () => undefined, dispose: () => { } });
		const chatViews: TestChatView[] = [];
		const chatOptions: (IChatViewOptions | undefined)[] = [];
		const newChatViews: TestChatView[] = [];
		const newChatOptions: IChatViewOptions[] = [];
		instantiationService.stub(IChatViewFactory, {
			createNewChatView: (nested, options) => {
				assert.strictEqual(nested, false);
				newChatOptions.push(options);
				const view = new TestChatView();
				newChatViews.push(view);
				return view;
			}, createChatView: (_instantiationService, options) => {
				chatOptions.push(options);
				const view = new TestChatView();
				chatViews.push(view);
				return view;
			}
		});
		const hovers: { target: HTMLElement; options: Parameters<IHoverService['setupDelayedHover']>[1]; disposed: boolean }[] = [];
		instantiationService.stub(IHoverService, {
			setupDelayedHover: (target, options) => {
				const hover = { target, options, disposed: false };
				hovers.push(hover);
				return { dispose: () => { hover.disposed = true; } };
			}
		});
		instantiationService.stub(ILabelService, {});
		instantiationService.stub(ISessionsProvidersService, {});
		instantiationService.stub(IContextKeyService, options.contextKeyService ?? new MockContextKeyService());
		instantiationService.stub(IContextMenuService, {});
		instantiationService.stub(IDialogService, {});
		instantiationService.stub(IMarkdownRendererService, {});
		instantiationService.stub(IGitHubService, {});
		instantiationService.stub(IAgentFeedbackService, {});
		instantiationService.stub(IOnboardingScenarioService, {});
		instantiationService.stub(INotificationService, {});
		instantiationService.stub(ICommandService, {});
		const configurationService = new TestConfigurationService();
		disposables.add(configurationService.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IAccessibilityService, {});
		instantiationService.stub(IOpenerService, {});
		const storageService = disposables.add(new InMemoryStorageService());
		if (options.completedVisible) {
			storageService.store('sessions.inboxNotifications.visibleCategories', JSON.stringify(['now', 'next', 'later', 'completed']), StorageScope.APPLICATION, StorageTarget.USER);
		}
		instantiationService.stub(IStorageService, storageService);
		instantiationService.stub(ITelemetryService, {}, 'publicLog2', (event: string, data: NonNullable<typeof options.telemetry>[number]['data'] = {}) => {
			options.events?.push(event);
			options.telemetry?.push({ event, data });
		});
		const view = disposables.add(instantiationService.createInstance(InboxNotificationsView, options.intersectionObserver, options.resizeObserver));
		const container = document.createElement('div');
		container.style.cssText = 'width: 900px; height: 400px';
		document.body.appendChild(container);
		disposables.add({ dispose: () => container.remove() });
		return { view, container, instantiationService, chatViews, chatOptions, newChatViews, newChatOptions, hovers };
	}

	test('New Session toggles a pet-free composer above the notifications and preserves its draft', async () => {
		const { view, container, instantiationService, newChatViews, newChatOptions } = createView(constObservable([]));
		const openNewSession = stub().resolves({ session: undefined, trustDeclined: false });
		instantiationService.stub(ISessionsService, 'openNewSession', openNewSession);
		view.render(container);
		const before = newChatViews.length;
		await view.openNewSession();
		const input = newChatViews[0].input;
		input.value = 'My new session draft';
		view.setVisible(false);
		view.setVisible(true);
		input.blur();
		await view.openNewSession();
		const hidden = !container.querySelector('.inbox-notifications-new-session.visible');
		await view.openNewSession();
		view.layout(900, 400);
		const composer = container.querySelector<HTMLElement>('.inbox-notifications-new-session')!;
		const notifications = container.querySelector<HTMLElement>('.inbox-notifications-content')!;
		const result = {
			before, hidden, created: newChatViews.length, options: newChatOptions,
			requests: openNewSession.args, draft: input.value, focused: mainWindow.document.activeElement === input,
			aboveNotifications: composer.nextElementSibling === notifications,
			inputAtTop: input.getBoundingClientRect().top - composer.getBoundingClientRect().top < 40,
		};
		view.dispose();
		assert.deepStrictEqual({ ...result, disposed: newChatViews[0].disposed }, {
			before: 0, hidden: true, created: 1, options: [{ preserveCustomView: true, renderChatPet: false }],
			requests: [[{ preserveCustomView: true, cancelRestore: true }]],
			draft: 'My new session draft', focused: true, aboveNotifications: true, inputAtTop: true, disposed: true,
		});
	});

	test('hidden canvas pauses notification rendering and resumes when revealed', () => {
		const items = observableValue<readonly IInboxNotificationItem[]>('items', []);
		const { view, container } = createView(items);
		view.render(container);
		view.setVisible(false);
		items.set([{
			id: 'new', kind: InboxNotificationKind.NeedsInput, priority: InboxNotificationPriority.Now,
			title: 'New notification', description: 'Completed', timestamp: Date.now(), actions: [],
		}], undefined);
		const hiddenCount = container.querySelectorAll('.inbox-notifications-item').length;
		view.setVisible(true);
		assert.deepStrictEqual({ hiddenCount, visibleCount: container.querySelectorAll('.inbox-notifications-item').length }, { hiddenCount: 0, visibleCount: 1 });
	});

	test('reuses Sessions chat, retains the conversation when its notification leaves, and disposes with Inbox', () => {
		const chat = upcastPartial<IChat>({ resource: URI.parse('test:///chat') });
		const session = upcastPartial<ISession>({ sessionId: 'session', mainChat: constObservable(chat), chats: constObservable([chat]) });
		const item: IInboxNotificationItem = {
			id: 'item', kind: InboxNotificationKind.Completed, priority: InboxNotificationPriority.Later,
			title: 'Finished', description: 'Summary', timestamp: 1, actions: [], sessionResource: URI.parse('test:///session'),
		};
		const items = observableValue<readonly IInboxNotificationItem[]>('items', [item]);
		const { view, container, instantiationService, chatViews } = createView(items);
		instantiationService.stub(ISessionsManagementService, 'getSession', () => session);
		view.render(container);
		container.querySelector<HTMLElement>('.inbox-notifications-item')!.click();
		const chatView = chatViews[0];
		view.layout(900, 400);
		assert.ok(chatView.layouts.some(size => size.width > 0 && size.height > 0 && size.height < 400));
		chatView.input.value = 'Follow-up draft';
		chatView.input.focus();
		items.set([{ ...item, description: 'Updated summary' }], undefined);
		items.set([], undefined);
		assert.deepStrictEqual({
			created: chatViews.length, bindings: chatView.bindings,
			connected: chatView.input.isConnected, focused: document.activeElement === chatView.input,
			input: chatView.input.value, hasSplit: !container.querySelector('.inbox-notifications-content')?.classList.contains('no-detail'),
			summaryPresent: !!container.querySelector('.inbox-notifications-detail-evidence'),
		}, {
			created: 1, bindings: [{ chat, historyKey: 'session', session }], connected: true, focused: true,
			input: 'Follow-up draft', hasSplit: true, summaryPresent: true,
		});
		view.dispose();
		assert.strictEqual(chatView.disposed, true);
	});

	test('long titles and header actions never overlap at narrow widths', () => {
		const { view, container } = createView(constObservable([{
			id: 'item', kind: InboxNotificationKind.Completed, priority: InboxNotificationPriority.Later,
			title: 'Improve keyboard navigation and accessibility across all workspace search results',
			description: 'Summary', timestamp: 1,
			actions: [
				{ id: 'open', label: 'Open Session', kind: InboxNotificationActionKind.OpenSession },
				{ id: 'done', label: '$(check)', kind: InboxNotificationActionKind.MarkDone },
			],
		}]));
		view.render(container);
		const layouts = [360, 500, 900].map(width => {
			container.style.width = `${width}px`;
			view.layout(width, 400);
			const header = container.querySelector<HTMLElement>('.inbox-notifications-item-header')!.getBoundingClientRect();
			const title = container.querySelector<HTMLElement>('.inbox-notifications-item-title')!.getBoundingClientRect();
			const buttons = [...container.querySelectorAll<HTMLElement>('.inbox-notifications-item-header-actions .monaco-button')];
			return {
				noOverlap: buttons.every(button => title.right <= button.getBoundingClientRect().left),
				withinHeader: buttons.every(button => button.getBoundingClientRect().right <= header.right + 1),
			};
		});
		assert.deepStrictEqual(layouts, Array.from({ length: 3 }, () => ({ noOverlap: true, withinHeader: true })));
	});

	test('the header session button keeps its bounded preview without duplicating evidence actions or dates', () => {
		const chat = upcastPartial<IChat>({ resource: URI.parse('test:///chat') });
		const session = upcastPartial<ISession>({
			sessionId: 'session', mainChat: constObservable(chat), chats: constObservable([chat]),
			title: constObservable('Session preview'), workspace: constObservable(undefined),
		});
		const { view, container, instantiationService, hovers, chatViews } = createView(constObservable([{
			id: 'item', kind: InboxNotificationKind.Completed, priority: InboxNotificationPriority.Later,
			title: 'Finished', description: 'Summary', timestamp: 1,
			actions: [
				{ id: 'open', label: 'Open Session', kind: InboxNotificationActionKind.OpenSession },
				{ id: 'done', label: 'Done', kind: InboxNotificationActionKind.MarkDone },
				{ id: 'fix', label: 'Fix CI', kind: InboxNotificationActionKind.AgentMergeFixCI },
			],
			sessionResource: URI.parse('test:///session'),
		}]));
		instantiationService.stub(ISessionsManagementService, 'getSession', () => session);
		instantiationService.stub(ISessionsProvidersService, 'getProvider', () => undefined);
		instantiationService.stub(IChatService, 'getSession', () => upcastPartial<IChatModel>({
			getRequests: () => [upcastPartial<IChatRequestModel>({
				response: upcastPartial<IChatResponseModel>({
					response: upcastPartial<IChatResponseModel['response']>({ value: [{ kind: 'markdownContent', content: { value: 'R'.repeat(1000) } }] }),
				}),
			})],
		}));
		view.render(container);
		container.querySelector<HTMLElement>('.inbox-notifications-item')!.click();
		const headerLayouts = [900, 500, 360].map(width => {
			container.style.width = `${width}px`;
			container.style.height = '600px';
			view.layout(width, 600);
			const header = container.querySelector<HTMLElement>('.inbox-notifications-item-header')!.getBoundingClientRect();
			const actions = container.querySelector<HTMLElement>('.inbox-notifications-item-header-actions')!.getBoundingClientRect();
			const date = container.querySelector<HTMLElement>('.inbox-notifications-item-time')!.getBoundingClientRect();
			return {
				atTop: Math.abs(actions.top - header.top) < 1,
				atRight: Math.abs(actions.right - header.right) < 1,
				dateDoesNotOverlapActions: date.right <= actions.left,
			};
		});
		const previews = hovers.map(hover => {
			const options = typeof hover.options === 'function' ? hover.options() : hover.options;
			assert.ok(options.content instanceof HTMLElement);
			return {
				button: hover.target.textContent, title: options.content.textContent?.includes('Session preview'),
				response: options.content.querySelector('.inbox-notifications-session-preview-response')?.textContent,
				pointer: options.appearance?.showPointer, nativeTitle: hover.target.hasAttribute('title'),
			};
		});
		assert.deepStrictEqual({
			previews, createdChats: chatViews.length, headerLayouts,
			title: container.querySelector('.inbox-notifications-item-title-group .inbox-notifications-item-title')?.textContent,
			headerDates: container.querySelectorAll('.inbox-notifications-item-title-group .inbox-notifications-item-time').length,
			headerActions: container.querySelector('.inbox-notifications-item-header-actions')?.textContent,
			footerActions: container.querySelector('.inbox-notifications-item-footer-actions')?.textContent,
			detailDates: container.querySelectorAll('.inbox-notifications-detail-time').length,
			detailButtons: container.querySelectorAll('.inbox-notifications-detail-header .monaco-button').length,
			keyboardHint: container.querySelector('.inbox-notifications-detail-keyboard-hint'),
			disclosure: container.querySelector('.inbox-notifications-latest-exchange > summary')?.textContent,
		}, {
			previews: ['Open Session'].map(button => ({
				button, title: true, response: `${'R'.repeat(600)}…`, pointer: true, nativeTitle: false,
			})), createdChats: 1, headerLayouts: Array.from({ length: 3 }, () => ({ atTop: true, atRight: true, dateDoesNotOverlapActions: true })),
			title: 'Finished', headerDates: 1,
			headerActions: 'Fix CIOpen SessionDone', footerActions: undefined, detailDates: 0, detailButtons: 0,
			keyboardHint: null, disclosure: 'Show chat response',
		});
		view.dispose();
		assert.ok(hovers.every(hover => hover.disposed));
	});

	test('shows actual conversation loading and failure status without opening the transcript', () => {
		const chat = upcastPartial<IChat>({ resource: URI.parse('test:///chat') });
		const session = upcastPartial<ISession>({ sessionId: 'session', mainChat: constObservable(chat), chats: constObservable([chat]) });
		const { view, container, instantiationService, chatViews } = createView(constObservable([{
			id: 'item', kind: InboxNotificationKind.Completed, priority: InboxNotificationPriority.Later,
			title: 'Finished', description: 'Summary', timestamp: 1, actions: [], sessionResource: URI.parse('test:///session'),
		}]));
		instantiationService.stub(ISessionsManagementService, 'getSession', () => session);
		view.render(container);
		container.querySelector<HTMLElement>('.inbox-notifications-item')!.click();
		const message = container.querySelector<HTMLElement>('.inbox-notifications-detail-body > [role="status"]')!;
		const details = container.querySelector<HTMLDetailsElement>('.inbox-notifications-latest-exchange')!;
		const snapshot = () => ({ text: message.textContent, hidden: message.hidden, expanded: details.open });
		chatViews[0].isLoadingTranscript.set(true, undefined);
		const loading = snapshot();
		const accessible = view.getDetailAccessibleContent()?.includes('Loading conversation...');
		chatViews[0].isLoadingTranscript.set(false, undefined);
		chatViews[0].historyStatus.set({ kind: 'history', message: 'History unavailable' }, undefined);
		const failed = snapshot();
		chatViews[0].historyStatus.set(undefined, undefined);
		assert.deepStrictEqual({ loading, accessible, failed, ready: snapshot() }, {
			loading: { text: 'Loading conversation...', hidden: false, expanded: false },
			accessible: true,
			failed: { text: 'History unavailable', hidden: false, expanded: false },
			ready: { text: '', hidden: true, expanded: false },
		});
	});

	test('latest exchange starts collapsed, follows the exact chat live, and releases its preview on collapse or selection', async () => {
		const main = upcastPartial<IChat>({ resource: URI.parse('test:///main') });
		const secondary = upcastPartial<IChat>({ resource: URI.parse('test:///secondary') });
		const session = upcastPartial<ISession>({ sessionId: 'session', mainChat: constObservable(main), chats: constObservable([main, secondary]) });
		const first: IInboxNotificationItem = {
			id: 'first', kind: InboxNotificationKind.Completed, priority: InboxNotificationPriority.Later,
			title: 'Finished', description: 'Summary', timestamp: 1, actions: [],
			sessionResource: URI.parse('test:///session'),
			needsInputPart: { kind: 'questionCarousel', chatResource: secondary.resource, requestId: 'request', resolveId: 'resolve', questions: [], allowSkip: true },
		};
		const second = { ...first, id: 'second' };
		const items = observableValue<readonly IInboxNotificationItem[]>('items', [first, second]);
		const created = disposables.add(new Emitter<IChatModel>());
		const changed = disposables.add(new Emitter<IChatViewModelChangeEvent>());
		const model = upcastPartial<IChatModel>({ sessionResource: secondary.resource, getRequests: () => [] });
		let modelLoaded = false;
		const lookups: string[] = [];
		const { view, container, instantiationService, chatViews } = createView(items, {
			chatService: { onDidCreateModel: created.event, getSession: resource => { lookups.push(resource.toString()); return modelLoaded ? model : undefined; } },
		});
		let previews = 0;
		let refreshes = 0;
		let scrollsToEnd = 0;
		let disposedPreviews = 0;
		instantiationService.get(ISessionsManagementService).getSession = () => session;
		instantiationService.stubInstance(ChatViewModel, { onDidChange: changed.event, getItems: () => [], dispose: () => { } });
		instantiationService.stubInstance(ChatQuestionCarouselPart, { domNode: document.createElement('div'), onDidChangeHeight: Event.None, dispose: () => { } });
		instantiationService.stubInstance(ChatListWidget, {
			setViewModel: () => { previews++; }, setScrollLock: () => { }, layout: () => { },
			scrollToEnd: () => { scrollsToEnd++; },
			refresh: () => { refreshes++; }, dispose: () => { disposedPreviews++; },
		});
		view.render(container);
		container.querySelector<HTMLElement>('[data-notification-id="first"]')!.click();
		let details = container.querySelector<HTMLDetailsElement>('.inbox-notifications-latest-exchange')!;
		const initial = { open: details.open, previews };
		details.open = true;
		details.dispatchEvent(new mainWindow.Event('toggle'));
		const waiting = { previews, unavailable: details.textContent?.includes('not available yet') };
		const previewContent = details.querySelector<HTMLElement>('.inbox-notifications-latest-exchange-content')!;
		stub(previewContent, 'clientWidth').get(() => 400);
		stub(previewContent, 'clientHeight').get(() => 240);
		modelLoaded = true;
		created.fire(model);
		const input = chatViews[0].input;
		input.value = 'Unsent draft';
		input.focus();
		changed.fire(null);
		await timeout(550);
		const streaming = { previews, refreshes, scrollsToEnd, focused: document.activeElement === input };
		items.set([{ ...first, description: 'Updated summary' }, second], undefined);
		details = container.querySelector<HTMLDetailsElement>('.inbox-notifications-latest-exchange')!;
		const updated = { open: details.open, previews, disposedPreviews, draft: input.value, focused: document.activeElement === input };
		details.open = false;
		details.dispatchEvent(new mainWindow.Event('toggle'));
		const refreshesAtCollapse = refreshes;
		changed.fire(null);
		created.fire(model);
		await timeout(550);
		const collapsed = { disposedPreviews, refreshed: refreshes !== refreshesAtCollapse, hasList: !!details.querySelector('.interactive-list') };
		details.open = true;
		details.dispatchEvent(new mainWindow.Event('toggle'));
		container.querySelector<HTMLElement>('[data-notification-id="second"]')!.click();
		assert.deepStrictEqual({
			initial, waiting, streaming, updated, collapsed,
			selected: { open: container.querySelector<HTMLDetailsElement>('.inbox-notifications-latest-exchange')!.open, previews, disposedPreviews },
			chatResources: [...new Set(lookups)], createdChats: chatViews.length,
		}, {
			initial: { open: false, previews: 0 },
			waiting: { previews: 0, unavailable: true },
			streaming: { previews: 1, refreshes: 2, scrollsToEnd: 1, focused: true },
			updated: { open: true, previews: 2, disposedPreviews: 1, draft: 'Unsent draft', focused: true },
			collapsed: { disposedPreviews: 2, refreshed: false, hasList: false },
			selected: { open: false, previews: 3, disposedPreviews: 3 },
			chatResources: [secondary.resource.toString()], createdChats: 1,
		});
	});

	test('binds secondary notifications to their exact chat, and releases the chat for external notifications', () => {
		const main = upcastPartial<IChat>({ resource: URI.parse('test:///main') });
		const secondary = upcastPartial<IChat>({ resource: URI.parse('test:///secondary') });
		const session = upcastPartial<ISession>({ sessionId: 'session', mainChat: constObservable(main), chats: constObservable([main, secondary]) });
		const item: IInboxNotificationItem = {
			id: 'main', kind: InboxNotificationKind.Completed, priority: InboxNotificationPriority.Later,
			title: 'Finished', description: 'Summary', timestamp: 1, actions: [], sessionResource: URI.parse('test:///session'),
		};
		const items = observableValue<readonly IInboxNotificationItem[]>('items', [item, {
			...item, id: 'secondary',
			needsInputPart: { kind: 'questionCarousel', chatResource: secondary.resource, requestId: 'request', resolveId: 'resolve', questions: [], allowSkip: true },
		}, { ...item, id: 'external', sessionResource: undefined }]);
		const { view, container, instantiationService, chatViews } = createView(items);
		instantiationService.stub(ISessionsManagementService, 'getSession', () => session);
		instantiationService.stubInstance(ChatQuestionCarouselPart, { domNode: document.createElement('div'), onDidChangeHeight: Event.None, dispose: () => { } });
		view.render(container);
		for (const id of ['main', 'secondary']) {
			container.querySelector<HTMLElement>(`[data-notification-id="${id}"]`)!.click();
		}
		const chatView = chatViews[0];
		assert.deepStrictEqual({ created: chatViews.length, chats: chatView.bindings.map(binding => binding.chat) }, { created: 1, chats: [main, secondary] });
		container.querySelector<HTMLElement>('[data-notification-id="external"]')!.click();
		assert.deepStrictEqual({
			disposed: chatView.disposed, visible: container.querySelector('.inbox-notifications-detail-pane')?.classList.contains('has-chat'),
			children: container.querySelector('.inbox-notifications-detail-chat')?.childElementCount,
		}, { disposed: true, visible: false, children: 0 });
	});

	test('shows only the embedded input, without hiding transcripts in other chat surfaces', () => {
		const chat = upcastPartial<IChat>({ resource: URI.parse('test:///chat') });
		const session = upcastPartial<ISession>({ sessionId: 'session', mainChat: constObservable(chat), chats: constObservable([chat]) });
		const { view, container, instantiationService, chatViews, chatOptions } = createView(constObservable([{
			id: 'item', kind: InboxNotificationKind.Completed, priority: InboxNotificationPriority.Later,
			title: 'Finished', description: 'Summary', timestamp: 1, actions: [], sessionResource: URI.parse('test:///session'),
		}]));
		instantiationService.stub(ISessionsManagementService, 'getSession', () => session);
		view.render(container);
		container.querySelector<HTMLElement>('.inbox-notifications-item')!.click();
		const displays = ['interactive-list', 'chat-welcome-view-container', 'prompt-timeline-rail'].map(className => {
			const element = chatViews[0].element.appendChild(document.createElement('div'));
			element.className = className;
			element.textContent = 'Conversation content';
			return mainWindow.getComputedStyle(element).display;
		});
		const outsideTranscript = container.appendChild(document.createElement('div'));
		outsideTranscript.className = 'interactive-list';
		assert.deepStrictEqual({
			chatOptions,
			displays, inputVisible: mainWindow.getComputedStyle(chatViews[0].input).display !== 'none',
			outsideVisible: mainWindow.getComputedStyle(outsideTranscript).display !== 'none',
		}, { chatOptions: [{ inputOnly: true, renderChatPet: false }], displays: ['none', 'none', 'none'], inputVisible: true, outsideVisible: true });
	});

	test('keeps the reply directly after the details in one scrollable column at wide, narrow, and short sizes', () => {
		const chat = upcastPartial<IChat>({ resource: URI.parse('test:///chat') });
		const session = upcastPartial<ISession>({ sessionId: 'session', mainChat: constObservable(chat), chats: constObservable([chat]) });
		const { view, container, instantiationService, chatViews } = createView(constObservable([{
			id: 'item', kind: InboxNotificationKind.Completed, priority: InboxNotificationPriority.Later,
			title: 'Finished', description: 'Summary', timestamp: 1, actions: [], sessionResource: URI.parse('test:///session'),
		}]));
		instantiationService.stub(ISessionsManagementService, 'getSession', () => session);
		view.render(container);
		container.querySelector<HTMLElement>('.inbox-notifications-item')!.click();
		const viewport = container.querySelector<HTMLElement>('.inbox-notifications-detail-content')!;
		const info = container.querySelector<HTMLElement>('.inbox-notifications-detail-info')!;
		const composer = container.querySelector<HTMLElement>('.inbox-notifications-detail-chat')!;
		const results = [];
		for (const [width, height] of [[900, 600], [500, 600], [900, 240]]) {
			container.style.width = `${width}px`;
			container.style.height = `${height}px`;
			view.layout(width, height);
			viewport.scrollTop = 0;
			const followsContent = Math.abs(composer.getBoundingClientRect().top - info.getBoundingClientRect().bottom) < 1;
			const longContent = info.appendChild(document.createElement('div'));
			longContent.style.height = '900px';
			const overflows = viewport.scrollHeight > viewport.clientHeight;
			viewport.scrollTop = viewport.scrollHeight;
			const inputBounds = chatViews[0].input.getBoundingClientRect();
			const viewportBounds = viewport.getBoundingClientRect();
			results.push({
				followsContent, overflows, sharedViewport: composer.parentElement === viewport,
				inputReachable: inputBounds.top >= viewportBounds.top && inputBounds.bottom <= viewportBounds.bottom,
			});
			longContent.remove();
		}
		assert.deepStrictEqual(results, Array.from({ length: 3 }, () => ({
			followsContent: true, overflows: true, sharedViewport: true, inputReachable: true,
		})));
	});

	test('an accepted request marks only its originating notification done without navigating or archiving', async () => {
		const chats = ['first', 'second'].map(id => upcastPartial<IChat>({ resource: URI.parse(`test:///chat/${id}`) }));
		const sessions = chats.map((chat, index) => upcastPartial<ISession>({
			sessionId: `session${index}`, resource: URI.parse(`test:///session/${index}`), mainChat: constObservable(chat), chats: constObservable([chat]),
		}));
		const items = sessions.map((session, index): IInboxNotificationItem => ({
			id: `item${index}`, kind: InboxNotificationKind.Completed, priority: InboxNotificationPriority.Later,
			title: 'Finished', description: 'Summary', timestamp: 1, actions: [], sessionResource: session.resource,
		}));
		const active = observableValue<readonly IInboxNotificationItem[]>('active', items);
		const { view, container, instantiationService, chatViews } = createView(active);
		const markRead = stub().callsFake(async () => active.set(items.slice(1), undefined));
		const dismiss = spy();
		const openSession = spy();
		const archiveSession = spy();
		instantiationService.stub(ISessionsManagementService, 'getSession', (resource: URI) => sessions.find(session => session.resource.toString() === resource.toString()));
		instantiationService.stub(ISessionsManagementService, 'setSessionReadState', markRead);
		instantiationService.stub(ISessionsService, 'openSession', openSession);
		instantiationService.stub(ISessionsManagementService, 'archiveSession', archiveSession);
		instantiationService.stub(IInboxNotificationsService, 'dismissNotification', dismiss);
		view.render(container);
		container.querySelector<HTMLElement>('[data-notification-id="item0"]')!.click();
		assert.strictEqual(dismiss.callCount, 0);
		container.querySelector<HTMLElement>('[data-notification-id="item1"]')!.click();
		chatViews[0].submitted.fire(chats[0].resource);
		await Promise.resolve();
		assert.deepStrictEqual({
			read: markRead.args, dismiss: dismiss.args, opened: openSession.callCount, archived: archiveSession.callCount,
			inputStillOpen: chatViews[0].input.isConnected, dismissedBeforeRead: dismiss.calledBefore(markRead),
		}, { read: [[sessions[0], true]], dismiss: [['item0', items[0]]], opened: 0, archived: 0, inputStillOpen: true, dismissedBeforeRead: true });
		view.dispose();
		assert.deepStrictEqual(dismiss.args, [['item0', items[0]]]);
	});

	test('waits for the exact secondary chat instead of falling back to main, and observes chat replacements', () => {
		const main = upcastPartial<IChat>({ resource: URI.parse('test:///main') });
		const secondary = upcastPartial<IChat>({ resource: URI.parse('test:///secondary') });
		const chats = observableValue<readonly IChat[]>('chats', [main]);
		const session = upcastPartial<ISession>({ sessionId: 'session', mainChat: constObservable(main), chats });
		const items = observableValue<readonly IInboxNotificationItem[]>('items', [{
			id: 'item', kind: InboxNotificationKind.NeedsInput, priority: InboxNotificationPriority.Now,
			title: 'Question', description: 'Summary', timestamp: 1, actions: [], sessionResource: URI.parse('test:///session'),
			needsInputPart: { kind: 'questionCarousel', chatResource: secondary.resource, requestId: 'request', resolveId: 'resolve', questions: [], allowSkip: true },
		}]);
		const { view, container, instantiationService, chatViews } = createView(items);
		instantiationService.stub(ISessionsManagementService, 'getSession', () => session);
		instantiationService.stubInstance(ChatQuestionCarouselPart, { domNode: document.createElement('div'), onDidChangeHeight: Event.None, dispose: () => { } });
		view.render(container);
		container.querySelector<HTMLElement>('.inbox-notifications-item')!.click();
		assert.deepStrictEqual({
			created: chatViews.length, unavailable: !!container.querySelector('.inbox-notifications-detail-chat-unavailable'),
		}, { created: 0, unavailable: true });
		chats.set([main, secondary], undefined);
		const replacement = upcastPartial<IChat>({ resource: secondary.resource });
		chats.set([main, replacement], undefined);
		assert.deepStrictEqual({
			created: chatViews.length, bindings: chatViews[0].bindings.map(binding => binding.chat),
			unavailable: !!container.querySelector('.inbox-notifications-detail-chat-unavailable'),
		}, { created: 1, bindings: [secondary, replacement], unavailable: false });
		const button = chatViews[0].element.appendChild(document.createElement('button'));
		button.focus();
		const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
		button.dispatchEvent(escape);
		assert.deepStrictEqual({ focused: document.activeElement === button, prevented: escape.defaultPrevented }, { focused: true, prevented: false });
		items.set([{ ...items.get()[0], chatResource: secondary.resource, needsInputPart: undefined }], undefined);
		assert.strictEqual(chatViews.at(-1)?.bindings.at(-1)?.chat, replacement);
		chats.set([main], undefined);
		assert.deepStrictEqual({
			unavailable: !!container.querySelector('.inbox-notifications-detail-chat-unavailable'),
			boundMain: chatViews.some(view => view.bindings.some(binding => binding.chat === main)),
		}, { unavailable: true, boundMain: false });
	});

	test('records impressions for intersecting cards without generating previews until selection', () => {
		let observer: TestIntersectionObserver | undefined;
		class TestIntersectionObserver implements IntersectionObserver {
			readonly root = null;
			readonly rootMargin = '';
			readonly scrollMargin = '';
			readonly thresholds = [0];
			readonly targets = new Set<Element>();

			constructor(private readonly callback: IntersectionObserverCallback) {
				observer = this;
			}

			disconnect(): void { this.targets.clear(); }
			observe(target: Element): void { this.targets.add(target); }
			unobserve(target: Element): void { this.targets.delete(target); }
			takeRecords(): IntersectionObserverEntry[] { return []; }
			setIntersecting(target: Element, isIntersecting: boolean): void {
				this.callback([upcastPartial<IntersectionObserverEntry>({ target, isIntersecting })], this);
			}
		}

		const items: IInboxNotificationItem[] = ['visible', 'offscreen'].map(id => ({
			id, kind: InboxNotificationKind.External, priority: InboxNotificationPriority.Next,
			title: id, description: id, timestamp: 1, actions: [], previewSignature: id, previewInputText: id,
		}));
		const previewRequests: string[] = [];
		const events: string[] = [];
		const { view, container } = createView(constObservable(items), { intersectionObserver: TestIntersectionObserver, previewRequests, events });
		view.render(container);
		assert.ok(observer);
		const [visible, offscreen] = Array.from(observer.targets);
		observer.setIntersecting(offscreen, false);
		assert.deepStrictEqual({ previewRequests, impressions: events.filter(event => event === 'agents/inboxImpression') }, { previewRequests: [], impressions: [] });
		observer.setIntersecting(visible, true);
		assert.deepStrictEqual({ previewRequests, impressions: events.filter(event => event === 'agents/inboxImpression') }, {
			previewRequests: [], impressions: ['agents/inboxImpression'],
		});

		observer.setIntersecting(visible, false);
		observer.setIntersecting(visible, true);
		assert.deepStrictEqual(events.filter(event => event === 'agents/inboxImpression'), ['agents/inboxImpression']);
		(visible as HTMLElement).click();
		assert.deepStrictEqual(previewRequests, ['visible']);
		view.dispose();
		assert.strictEqual(observer.targets.size, 0);
	});

	test('preserves a focused inline draft on same-id refreshes and defers new notifications', () => {
		const item: IInboxNotificationItem = {
			id: 'question', kind: InboxNotificationKind.NeedsInput, priority: InboxNotificationPriority.Now,
			title: 'Question', description: 'Answer', timestamp: 1, actions: [],
			needsInputPart: {
				kind: 'questionCarousel', chatResource: URI.parse('test:///chat'), requestId: 'request',
				resolveId: 'question', allowSkip: true, questions: [],
			},
		};
		const items = observableValue<readonly IInboxNotificationItem[]>('test.items', [item]);
		const { view, container, instantiationService } = createView(items);
		const input = document.createElement('textarea');
		input.classList.add('chat-question-freeform-textarea');
		instantiationService.stubInstance(ChatQuestionCarouselPart, {
			domNode: input, onDidChangeHeight: Event.None, dispose: () => { },
		});
		view.render(container);
		input.value = 'INBOX-DRAFT-REPRO';
		input.focus();
		items.set([{ ...item, description: 'Refreshed' }], undefined);
		assert.deepStrictEqual({
			draft: input.value, connected: input.isConnected, focused: document.activeElement === input,
		}, { draft: 'INBOX-DRAFT-REPRO', connected: true, focused: true });

		items.set([item, { ...item, id: 'new', needsInputPart: undefined }], undefined);
		assert.deepStrictEqual({
			draft: input.value, focused: document.activeElement === input,
			cards: container.querySelectorAll('.inbox-notifications-item').length,
			bannerHidden: container.querySelector('.inbox-notifications-deferred-updates')?.classList.contains('hidden'),
		}, { draft: 'INBOX-DRAFT-REPRO', focused: true, cards: 1, bannerHidden: false });

		items.set([], undefined);
		assert.strictEqual(container.querySelectorAll('.inbox-notifications-item').length, 0);
	});

	test('updates scroll dimensions when asynchronous content changes size', () => {
		let observer: TestResizeObserver | undefined;
		class TestResizeObserver implements ResizeObserver {
			readonly targets = new Set<Element>();
			constructor(readonly callback: ResizeObserverCallback) { observer = this; }
			observe(target: Element): void { this.targets.add(target); }
			unobserve(target: Element): void { this.targets.delete(target); }
			disconnect(): void { this.targets.clear(); }
		}
		const { view, container } = createView(constObservable([]), { resizeObserver: TestResizeObserver });
		view.render(container);
		assert.ok(observer);
		const content = container.querySelector<HTMLElement>('.inbox-notifications-list-scrollable')!;
		const list = content.querySelector<HTMLElement>('.inbox-notifications-list')!;
		content.style.cssText = 'height: 100px; overflow: hidden';
		list.style.height = '600px';
		const scan = spy(DomScrollableElement.prototype, 'scanDomNode');
		disposables.add({ dispose: () => scan.restore() });
		observer.callback([], observer);
		const scrollable: DomScrollableElement = scan.firstCall.thisValue;
		scrollable.setScrollPosition({ scrollTop: 50 });
		assert.deepStrictEqual({
			observesList: observer.targets.has(list),
			observesViewport: observer.targets.has(content),
			scrollHeight: scrollable.getScrollDimensions().scrollHeight,
			scrollTop: scrollable.getScrollPosition().scrollTop,
		}, { observesList: true, observesViewport: true, scrollHeight: 600, scrollTop: 50 });
		view.dispose();
		assert.strictEqual(observer.targets.size, 0);
	});

	test('question cards isolate their context keys from the window and other cards', () => {
		const scopes: IContextKeyService[] = [];
		class RecordingContextKeyService extends ContextKeyService {
			override createScoped(domNode: HTMLElement) {
				const scoped = super.createScoped(domNode);
				scopes.push(scoped);
				return scoped;
			}
		}
		const contextKeyService = disposables.add(new RecordingContextKeyService(new TestConfigurationService()));
		const items: IInboxNotificationItem[] = ['first', 'second'].map(id => ({
			id, kind: InboxNotificationKind.NeedsInput, priority: InboxNotificationPriority.Now,
			title: id, description: id, timestamp: 1, actions: [],
			needsInputPart: {
				kind: 'questionCarousel', chatResource: URI.parse(`test:///chat/${id}`), requestId: id,
				resolveId: id, allowSkip: true, questions: [],
			},
		}));
		const { view, container, instantiationService } = createView(constObservable(items), { contextKeyService });
		instantiationService.stubInstance(ChatQuestionCarouselPart, {
			domNode: document.createElement('div'), onDidChangeHeight: Event.None, dispose: () => { },
		});
		const createInstance = spy(TestInstantiationService.prototype, 'createInstance');
		disposables.add({ dispose: () => createInstance.restore() });
		view.render(container);
		const [first, second] = scopes.slice(-2);
		ChatContextKeys.inChatQuestionCarousel.bindTo(first).set(true);
		ChatContextKeys.chatQuestionCarouselHasTerminal.bindTo(first).set(true);
		ChatContextKeys.inChatQuestionCarousel.bindTo(second).reset();
		assert.deepStrictEqual({
			scopedDeduplication: createInstance.getCalls().some(call => call.args[0] === ChatQuestionCarouselPart && match({ hideDuplicateDetailedMessage: true }).test(call.args[3])),
			windowQuestion: contextKeyService.getContextKeyValue(ChatContextKeys.inChatQuestionCarousel.key),
			windowTerminal: contextKeyService.getContextKeyValue(ChatContextKeys.chatQuestionCarouselHasTerminal.key),
			firstQuestion: first.getContextKeyValue(ChatContextKeys.inChatQuestionCarousel.key),
			firstTerminal: first.getContextKeyValue(ChatContextKeys.chatQuestionCarouselHasTerminal.key),
			secondQuestion: second.getContextKeyValue(ChatContextKeys.inChatQuestionCarousel.key),
		}, {
			scopedDeduplication: true,
			windowQuestion: undefined, windowTerminal: undefined,
			firstQuestion: true, firstTerminal: true, secondQuestion: false,
		});
	});

	test('Done explains that only the notification is dismissed', () => {
		const { view, container } = createView(constObservable([{
			id: 'done', kind: InboxNotificationKind.Completed, priority: InboxNotificationPriority.Later,
			title: 'Finished', description: 'Finished', timestamp: 1,
			actions: [{ id: 'done', label: '$(check)', ariaLabel: 'Mark Notification as Done', kind: InboxNotificationActionKind.MarkDone }],
		}]));
		view.render(container);
		const button = container.querySelector<HTMLElement>('.inbox-notifications-item-action-done')!;
		assert.deepStrictEqual({
			label: button.getAttribute('aria-label'),
			nativeTitle: button.getAttribute('title'),
		}, { label: 'Mark Notification as Done for Finished', nativeTitle: null });
	});

	test('captures click correlation before handlers and does not select action targets', () => {
		const telemetry: { event: string; data: { actionId?: string; interaction?: string } }[] = [];
		const { view, container, instantiationService } = createView(constObservable([{
			id: 'item', kind: InboxNotificationKind.Completed, priority: InboxNotificationPriority.Later,
			title: 'Finished', description: 'Finished', timestamp: 1,
			actions: [{ id: 'open', label: 'Open Session', kind: InboxNotificationActionKind.OpenSession }],
		}]), { telemetry });
		const requestSummary = spy();
		instantiationService.stub(IInboxNotificationsService, 'requestDetailSummary', requestSummary);
		view.render(container);
		container.querySelector<HTMLElement>('.inbox-notifications-item .monaco-button')!.click();
		const click = telemetry.find(entry => entry.event === 'agents/inboxClick');
		const interaction = telemetry.find(entry => entry.data.interaction === 'runAction');
		assert.deepStrictEqual({
			clickBeforeAction: telemetry.indexOf(click!) < telemetry.indexOf(interaction!),
			correlated: click?.data.actionId === interaction?.data.actionId,
			selections: telemetry.filter(entry => entry.data.interaction === 'item.select').length,
			summaries: requestSummary.callCount,
		}, { clickBeforeAction: true, correlated: true, selections: 0, summaries: 0 });
	});

	test('Completed updates respect inline-widget focus and disposal cancels deferred focusout', async () => {
		const item: IInboxNotificationItem = {
			id: 'question', kind: InboxNotificationKind.NeedsInput, priority: InboxNotificationPriority.Now,
			title: 'Question', description: 'Answer', timestamp: 1, actions: [],
			needsInputPart: { kind: 'questionCarousel', chatResource: URI.parse('test:///chat'), requestId: 'request', resolveId: 'question', allowSkip: true, questions: [] },
		};
		const items = observableValue<readonly IInboxNotificationItem[]>('items', [item]);
		const dismissed = observableValue<readonly IInboxNotificationItem[]>('dismissed', []);
		const events: string[] = [];
		const { view, container, instantiationService } = createView(items, { dismissed, completedVisible: true, events });
		const option = document.createElement('button');
		instantiationService.stubInstance(ChatQuestionCarouselPart, { domNode: option, onDidChangeHeight: Event.None, dispose: () => { } });
		view.render(container);
		option.focus();
		items.set([{ ...item, description: 'Updated' }], undefined);
		dismissed.set([{ ...item, id: 'completed', needsInputPart: undefined }], undefined);
		assert.deepStrictEqual({ focused: document.activeElement === option, cards: container.querySelectorAll('.inbox-notifications-item').length }, { focused: true, cards: 1 });
		option.blur();
		view.dispose();
		const eventCount = events.length;
		await new Promise<void>(resolve => setTimeout(resolve, 0));
		assert.strictEqual(events.length, eventCount);
	});

	test('reuses unchanged card controls and preserves action and tier-header focus', () => {
		const item: IInboxNotificationItem = {
			id: 'item', kind: InboxNotificationKind.External, priority: InboxNotificationPriority.Next,
			title: 'Task', description: 'Description', timestamp: 1,
			actions: [{ id: 'open', label: 'Open Session', kind: InboxNotificationActionKind.OpenSession }],
		};
		const items = observableValue<readonly IInboxNotificationItem[]>('items', [item]);
		const { view, container } = createView(items);
		view.render(container);
		const action = container.querySelector<HTMLElement>('.inbox-notifications-item .monaco-button')!;
		action.focus();
		items.set([{ ...item }], undefined);
		assert.strictEqual(document.activeElement, action);
		const header = container.querySelector<HTMLElement>('.inbox-notifications-section-header')!;
		header.focus();
		items.set([{ ...item }], undefined);
		assert.strictEqual(document.activeElement?.id, header.id);
	});

	test('updates other cards without detaching an unchanged card or its tier header', () => {
		const item: IInboxNotificationItem = {
			id: 'stable', kind: InboxNotificationKind.External, priority: InboxNotificationPriority.Next,
			title: 'Task', description: 'Description', timestamp: 1,
			actions: [{ id: 'open', label: 'Open Session', kind: InboxNotificationActionKind.OpenSession }],
		};
		const items = observableValue<readonly IInboxNotificationItem[]>('items', [item, { ...item, id: 'changing' }]);
		const { view, container } = createView(items);
		view.render(container);
		const card = container.querySelector<HTMLElement>('[data-notification-id="stable"]')!;
		const header = container.querySelector<HTMLElement>('.inbox-notifications-section-header')!;
		const observer = new mainWindow.MutationObserver(() => { });
		disposables.add({ dispose: () => observer.disconnect() });
		observer.observe(container, { childList: true, subtree: true });
		card.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		items.set([{ ...item }, { ...item, id: 'changing', title: 'Updated' }], undefined);
		const detached = observer.takeRecords().flatMap(record => Array.from(record.removedNodes))
			.some(node => node === card || node.contains(card) || node === header || node.contains(header));
		card.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
		assert.deepStrictEqual({ detached, sameHeader: container.querySelector('.inbox-notifications-section-header') === header }, {
			detached: false, sameHeader: true,
		});
	});

	test('reexpanded cached cards synchronize selection and singular tier labels', () => {
		const items: IInboxNotificationItem[] = [InboxNotificationPriority.Now, InboxNotificationPriority.Next].map((priority, index) => ({
			id: `item-${index}`, kind: InboxNotificationKind.External, priority, title: 'Task', description: '', timestamp: 1, actions: [],
		}));
		const { view, container } = createView(constObservable(items));
		view.render(container);
		container.querySelector<HTMLElement>('[data-notification-id="item-1"]')!.click();
		const header = container.querySelector<HTMLElement>('#inbox-notifications-section-next')!;
		header.click();
		container.querySelector<HTMLElement>('[data-notification-id="item-0"]')!.click();
		header.click();
		assert.deepStrictEqual({
			selected: Array.from(container.querySelectorAll<HTMLElement>('.inbox-notifications-item.selected')).map(card => card.dataset.notificationId),
			label: header.getAttribute('aria-label'),
		}, { selected: ['item-0'], label: 'Next, 1 notification' });
	});

	test('toolbar accessible names include their visible labels', () => {
		const { view, container } = createView(constObservable([]));
		view.render(container);
		for (const label of ['Recent', 'Inbox Was Useful']) {
			const button = Array.from(container.querySelectorAll<HTMLElement>('.monaco-button')).find(button => button.textContent === label);
			assert.ok(button?.getAttribute('aria-label')?.startsWith(label), label);
		}
	});

	test('native focus scrolling synchronizes both scrollable panes before a list refresh', () => {
		const items = observableValue<readonly IInboxNotificationItem[]>('items', [{
			id: 'scroll', kind: InboxNotificationKind.External, priority: InboxNotificationPriority.Now,
			title: 'Task', description: '', timestamp: 1, actions: [],
		}]);
		const { view, container } = createView(items);
		view.render(container);
		const scrollables = [accessView(view).scrollableElement, accessView(view).detailScrollableElement];
		const results = ['.inbox-notifications-list-scrollable', '.inbox-notifications-detail-content'].map((selector, index) => {
			const content = container.querySelector<HTMLElement>(selector)!;
			content.style.height = '100px';
			content.firstElementChild!.setAttribute('style', 'height: 600px');
			scrollables[index].scanDomNode();
			content.scrollTop = 100;
			content.dispatchEvent(new UIEvent('scroll'));
			return scrollables[index].getScrollPosition().scrollTop;
		});
		items.set([...items.get()], undefined);
		assert.deepStrictEqual({ results, afterRefresh: scrollables.map(scrollable => scrollable.getScrollPosition().scrollTop) }, {
			results: [100, 100], afterRefresh: [100, 100],
		});
	});

	test('generated previews appear in a non-collapsible interpretation at the top of the detail pane and accessible view', () => {
		const previews = observableValue<ReadonlyMap<string, string>>('previews', new Map());
		const summaries = observableValue<ReadonlyMap<string, IInboxDetailSummary>>('summaries', new Map());
		const { view, container } = createView(constObservable([{
			id: 'item', kind: InboxNotificationKind.External, priority: InboxNotificationPriority.Next,
			title: 'Task', description: 'Original', timestamp: 1, actions: [], previewSignature: 'preview',
		}]), { previews, detailSummaries: summaries });
		view.render(container);
		const card = container.querySelector<HTMLElement>('.inbox-notifications-item')!;
		card.click();
		const details = container.querySelector<HTMLElement>('.inbox-notifications-detail-evidence')!;
		previews.set(new Map([['preview', 'Original']]), undefined);
		const fallbackHidden = details.hidden;
		previews.set(new Map([['preview', 'Generated preview']]), undefined);
		assert.deepStrictEqual({
			fallbackHidden, hidden: details.hidden,
			first: details.parentElement?.firstElementChild === details,
			disclosure: details.matches('details') || !!details.querySelector('summary'),
			heading: details.querySelector('h3')?.textContent,
			onCard: card.textContent?.includes('Generated preview'),
			cardLabel: card.getAttribute('aria-label')?.includes('Generated preview'),
			inDetail: details.textContent?.includes('Generated preview'),
			accessible: view.getDetailAccessibleContent()?.includes('Generated preview'),
			disclaimer: /Generated from the conversation|Claims are not independent verification/.test(`${details.textContent}\n${view.getDetailAccessibleContent()}`),
		}, { fallbackHidden: true, hidden: false, first: true, disclosure: false, heading: 'Agent interpretation', onCard: false, cardLabel: false, inDetail: true, accessible: true, disclaimer: false });
		summaries.set(new Map([['item', { status: 'Richer interpretation', decisions: [], evidence: [] }]]), undefined);
		assert.deepStrictEqual({
			hidden: details.hidden, replaced: details.textContent?.includes('Richer interpretation'),
			duplicated: details.textContent?.includes('Generated preview'),
		}, { hidden: false, replaced: true, duplicated: false });
	});

	test('card set membership is computed within each priority list', () => {
		const { view, container } = createView(constObservable([
			{ id: 'now', kind: InboxNotificationKind.External, priority: InboxNotificationPriority.Now, title: 'Now', description: '', timestamp: 1, actions: [] },
			{ id: 'next', kind: InboxNotificationKind.External, priority: InboxNotificationPriority.Next, title: 'Next', description: '', timestamp: 1, actions: [] },
		]));
		view.render(container);
		assert.deepStrictEqual(Array.from(container.querySelectorAll('.inbox-notifications-item')).map(card => [
			card.getAttribute('aria-posinset'), card.getAttribute('aria-setsize'),
		]), [['1', '1'], ['1', '1']]);
	});

	test('reuses the live carousel model so drafts survive a changed card rendering', () => {
		const carousel = new ChatQuestionCarouselData([], true, 'resolve');
		const chatResource = URI.parse('test:///chat');
		const item: IInboxNotificationItem = {
			id: 'item', kind: InboxNotificationKind.NeedsInput, priority: InboxNotificationPriority.Now,
			title: 'Question', description: 'Answer', timestamp: 1, actions: [],
			needsInputPart: { kind: 'questionCarousel', chatResource, requestId: 'request', resolveId: 'resolve', allowSkip: true, questions: [] },
		};
		const items = observableValue<readonly IInboxNotificationItem[]>('items', [item]);
		const { view, container, instantiationService } = createView(items);
		instantiationService.stub(IChatService, 'getSession', () => upcastPartial<IChatModel>({
			getRequests: () => [upcastPartial<IChatRequestModel>({
				response: upcastPartial<IChatResponseModel>({
					requestId: 'request',
					response: upcastPartial<IChatResponseModel['response']>({ value: [carousel] }),
				}),
			})],
		}));
		instantiationService.stubInstance(ChatQuestionCarouselPart, { domNode: document.createElement('div'), onDidChangeHeight: Event.None, dispose: () => { } });
		view.render(container);
		carousel.draftAnswers = { q1: 'Draft' };
		carousel.draftCurrentIndex = 1;
		items.set([{ ...item, description: 'Changed card' }], undefined);
		assert.deepStrictEqual({ live: accessView(view).carouselModels.get(item.id) === carousel, answers: carousel.draftAnswers, index: carousel.draftCurrentIndex }, {
			live: true, answers: { q1: 'Draft' }, index: 1,
		});
	});

	test('tool confirmations mirror default, custom deny, and skip chat reasons', async () => {
		const { view, instantiationService } = createView(constObservable([]));
		const confirm = stub(IChatToolInvocation, 'confirmWith').returns(true);
		disposables.add({ dispose: () => confirm.restore() });
		const state = observableValue('approvalState', upcastPartial<IChatToolInvocation.State>({ type: IChatToolInvocation.StateKind.WaitingForConfirmation }));
		const invocation = upcastPartial<IChatToolInvocation>({
			kind: 'toolInvocation', toolCallId: 'tool',
			state,
		});
		instantiationService.stub(IChatService, 'getSession', () => upcastPartial<IChatModel>({
			getRequests: () => [upcastPartial<IChatRequestModel>({
				response: upcastPartial<IChatResponseModel>({
					requestId: 'request',
					response: upcastPartial<IChatResponseModel['response']>({ value: [invocation] }),
				}),
			})],
		}));
		instantiationService.stub(IInboxNotificationsService, 'dismissNotification', () => { });
		const item: IInboxNotificationItem = { id: 'tool', kind: InboxNotificationKind.NeedsInput, priority: InboxNotificationPriority.Now, title: 'Tool', description: '', timestamp: 1, actions: [] };
		const part: IInboxNotificationToolConfirmationPart = {
			kind: 'toolConfirmation', chatResource: URI.parse('test:///chat'), requestId: 'request', toolCallId: 'tool', confirmationKind: 'execution', title: 'Tool', message: '',
			buttons: [
				{ label: 'Allow Once', kind: 'approve', useUserActionReason: true },
				{ label: 'Cancel', id: 'cancel', kind: 'deny', useUserActionReason: true },
				{ label: 'Skip', kind: 'deny' },
			],
		};
		for (let index = 0; index < part.buttons.length; index++) {
			await accessView(view).submitToolConfirmationPart(item, part, index);
		}
		const notifyError = spy();
		instantiationService.stub(INotificationService, 'error', notifyError);
		state.set(upcastPartial<IChatToolInvocation.State>({ type: IChatToolInvocation.StateKind.WaitingForPostApproval }), undefined);
		await accessView(view).submitToolConfirmationPart(item, part, 0);
		await accessView(view).submitToolConfirmationPart(item, { ...part, confirmationKind: 'result' }, 0);
		assert.deepStrictEqual(confirm.getCalls().map(call => call.args[1]), [
			{ type: ToolConfirmKind.UserAction },
			{ type: ToolConfirmKind.UserAction, selectedButton: 'cancel', selectedButtonKind: ConfirmationOptionKind.Deny },
			{ type: ToolConfirmKind.Skipped, source: 'user' },
		]);
		assert.strictEqual(notifyError.callCount, 2);
	});

	test('tool cards show command and disclaimer and omit post-approval buttons', () => {
		const part: IInboxNotificationToolConfirmationPart = {
			kind: 'toolConfirmation', chatResource: URI.parse('test:///chat'), requestId: 'request', toolCallId: 'tool',
			confirmationKind: 'execution', title: 'Run in terminal?', message: 'Check the regression',
			commandLine: 'npm test -- --run regression', disclaimer: 'Runs outside the sandbox', originMessage: 'Shell tool',
			buttons: [{ label: 'Allow Once', kind: 'approve', useUserActionReason: true }],
		};
		const item: IInboxNotificationItem = { id: 'tool', kind: InboxNotificationKind.NeedsInput, priority: InboxNotificationPriority.Now, title: 'Task', description: '', timestamp: 1, actions: [], needsInputPart: part };
		const items = observableValue<readonly IInboxNotificationItem[]>('items', [item]);
		const { view, container, instantiationService } = createView(items);
		instantiationService.stub(IMarkdownRendererService, 'render', (markdown: IMarkdownString) => {
			const element = mainWindow.document.createElement('span');
			element.textContent = markdown.value;
			return { element, dispose: () => { } };
		});
		view.render(container);
		const terminal = container.querySelector<HTMLElement>('.inbox-notifications-chat-part-host')!;
		const displayed = [part.commandLine, part.disclaimer, part.originMessage].every(text => terminal.textContent?.includes(String(text)));
		items.set([{ ...item, needsInputPart: { ...part, confirmationKind: 'result', buttons: [] } }], undefined);
		assert.deepStrictEqual({
			displayed,
			buttons: container.querySelectorAll('.inbox-notifications-chat-part-host .monaco-button').length,
			guidance: container.textContent?.includes('Open the session to review the full request and respond.'),
		}, { displayed: true, buttons: 0, guidance: true });
	});

	test('counts custom select answers as free text without logging their content', () => {
		const { view } = createView(constObservable([]));
		assert.deepStrictEqual(accessView(view).classifyCarouselAnswers(new Map<string, IChatQuestionAnswerValue>([
			['single', { selectedValue: undefined, freeformValue: 'custom' }],
			['multi', { selectedValues: ['option'], freeformValue: 'other' }],
			['text', 'typed'],
		])), { answerKind: 'freeText', answerCharCount: 16 });
	});

	test('deletion requires provider support and confirmation, and Always applies the current action', async () => {
		const { view, instantiationService } = createView(constObservable([]));
		const capabilities = observableValue<ISessionCapabilities>('capabilities', upcastPartial<ISessionCapabilities>({ supportsDelete: false }));
		const session = upcastPartial<ISession>({ resource: URI.parse('test:///session'), providerId: 'local-agent-host', capabilities });
		const item: IInboxNotificationItem = {
			id: 'item', kind: InboxNotificationKind.PullRequestMerged, priority: InboxNotificationPriority.Later,
			title: 'Merged', description: '', timestamp: 1, actions: [], sessionResource: session.resource,
		};
		const deleteSession = spy(async () => { });
		const confirm = spy(async () => ({ confirmed: false }));
		instantiationService.stub(ISessionsManagementService, 'getSession', () => session);
		instantiationService.stub(ISessionsManagementService, 'deleteSession', deleteSession);
		instantiationService.stub(IDialogService, 'confirm', confirm);
		const unsupported = await accessView(view).runMergedSessionCleanupAction(item, InboxNotificationActionKind.DeleteSession, false);
		capabilities.set(upcastPartial<ISessionCapabilities>({ supportsDelete: true }), undefined);
		const cancelled = await accessView(view).runMergedSessionCleanupAction(item, InboxNotificationActionKind.DeleteSession, false);
		assert.deepStrictEqual({ unsupported, cancelled, confirmations: confirm.callCount, deletions: deleteSession.callCount }, {
			unsupported: 'skipped', cancelled: 'skipped', confirmations: 1, deletions: 0,
		});
		instantiationService.stub(IDialogService, 'confirm', async () => ({ confirmed: true }));
		instantiationService.stub(INotificationService, 'notify', () => upcastPartial<ReturnType<INotificationService['notify']>>({}));
		const result = await accessView(view).runMergedSessionCleanupAction(item, InboxNotificationActionKind.DeleteSession, true);
		assert.deepStrictEqual({ result, deletions: deleteSession.callCount }, { result: 'success', deletions: 1 });
	});

	test('quietly retries an invalidated interpretation and shows it only when content arrives', () => {
		const item: IInboxNotificationItem = {
			id: 'item', kind: InboxNotificationKind.Completed, priority: InboxNotificationPriority.Later,
			title: 'Completed', description: 'Provider summary', timestamp: 1, actions: [],
			sessionResource: URI.parse('test:///session'),
		};
		const summaries = observableValue<ReadonlyMap<string, IInboxDetailSummary>>('summaries', new Map());
		const { view, container, instantiationService } = createView(constObservable([item]), { detailSummaries: summaries });
		const requestSummary = spy();
		instantiationService.stub(IInboxNotificationsService, 'requestDetailSummary', requestSummary);
		view.render(container);
		container.querySelector<HTMLElement>('.inbox-notifications-item')!.click();
		const details = container.querySelector<HTMLElement>('.inbox-notifications-detail-evidence')!;
		const snapshot = () => ({
			requests: requestSummary.callCount,
			loading: !!container.querySelector('.inbox-notifications-detail-loading'),
			text: container.querySelector('.inbox-notifications-interpretation-content > div')?.textContent,
			hidden: details.hidden,
		});
		const initial = snapshot();
		summaries.set(new Map([['item', { status: '', decisions: [], evidence: [] }]]), undefined);
		const unavailable = snapshot();
		summaries.set(new Map(), undefined);
		const retrying = snapshot();
		summaries.set(new Map([['item', { status: 'Generated summary', decisions: [], evidence: [] }]]), undefined);
		assert.deepStrictEqual({ initial, unavailable, retrying, complete: snapshot() }, {
			initial: { requests: 1, loading: false, text: '', hidden: true },
			unavailable: { requests: 1, loading: false, text: '', hidden: true },
			retrying: { requests: 2, loading: false, text: '', hidden: true },
			complete: { requests: 2, loading: false, text: 'Generated summary', hidden: false },
		});
		summaries.set(new Map([['item', { status: 'Updated summary', decisions: [], evidence: [] }]]), undefined);
		assert.deepStrictEqual(snapshot(), { requests: 2, loading: false, text: 'Updated summary', hidden: false });
	});

	test('can publish a cached detail summary synchronously without leaving a loading state', () => {
		const item: IInboxNotificationItem = {
			id: 'item', kind: InboxNotificationKind.Completed, priority: InboxNotificationPriority.Later,
			title: 'Completed', description: 'Provider summary', timestamp: 1, actions: [],
			sessionResource: URI.parse('test:///session'),
		};
		const summaries = observableValue<ReadonlyMap<string, IInboxDetailSummary>>('summaries', new Map());
		const { view, container, instantiationService } = createView(constObservable([item]), { detailSummaries: summaries });
		const requestSummary = spy(() => summaries.set(new Map([['item', { status: 'Cached summary', decisions: [], evidence: [] }]]), undefined));
		instantiationService.stub(IInboxNotificationsService, 'requestDetailSummary', requestSummary);
		view.render(container);
		container.querySelector<HTMLElement>('.inbox-notifications-item')!.click();
		const details = container.querySelector<HTMLElement>('.inbox-notifications-detail-evidence')!;
		assert.deepStrictEqual({
			requests: requestSummary.callCount,
			loading: !!container.querySelector('.inbox-notifications-detail-loading'),
			text: container.querySelector('.inbox-notifications-interpretation-content > div')?.textContent,
			hidden: details.hidden,
		}, { requests: 1, loading: false, text: 'Cached summary', hidden: false });
	});

	test('does not repeat notification text when there is no session to summarize', () => {
		const item: IInboxNotificationItem = {
			id: 'item', kind: InboxNotificationKind.Completed, priority: InboxNotificationPriority.Later,
			title: 'Completed', description: 'Notification summary', timestamp: 1, actions: [],
		};
		const { view, container, instantiationService } = createView(constObservable([item]));
		const requestSummary = spy();
		instantiationService.stub(IInboxNotificationsService, 'requestDetailSummary', requestSummary);
		view.render(container);
		container.querySelector<HTMLElement>('.inbox-notifications-item')!.click();
		assert.deepStrictEqual({
			requests: requestSummary.callCount,
			loading: !!container.querySelector('.inbox-notifications-detail-loading'),
			text: container.querySelector('.inbox-notifications-interpretation-content > div')?.textContent,
			repeatedTitle: container.querySelector('.inbox-notifications-detail-title'),
			hidden: container.querySelector<HTMLElement>('.inbox-notifications-detail-evidence')?.hidden,
		}, { requests: 0, loading: false, text: '', repeatedTitle: null, hidden: true });
	});

	test('renders evidence-only summaries and opens their artifact links', () => {
		const item: IInboxNotificationItem = {
			id: 'item', kind: InboxNotificationKind.Completed, priority: InboxNotificationPriority.Later,
			title: 'Completed', description: 'Fallback', timestamp: 1, actions: [],
		};
		const uri = URI.file('/workspace/test.ts');
		const { view, container, instantiationService } = createView(constObservable([item]), {
			detailSummaries: constObservable(new Map([['item', {
				status: '', decisions: [], evidence: [{ text: 'Tests passed.', artifact: { kind: 'file', label: 'Test source', uri } }],
			}]])),
		});
		const open = spy(async (_resource: URI) => true);
		instantiationService.stub(IOpenerService, 'open', open);
		view.render(container);
		container.querySelector<HTMLElement>('.inbox-notifications-item')!.click();
		const link = container.querySelector<HTMLElement>('.inbox-notifications-evidence-link')!;
		link.click();
		assert.deepStrictEqual({
			evidence: container.textContent?.includes('Tests passed.'),
			target: open.firstCall.args[0],
			hidden: container.querySelector<HTMLElement>('.inbox-notifications-detail-evidence')?.hidden,
		}, { evidence: true, target: uri, hidden: false });
	});

	for (const kind of ['questionCarousel', 'toolConfirmation'] as const) {
		test(`keeps a simple ${kind} quiet until interpretation arrives, then shows it only in the detail pane`, () => {
			const chatResource = URI.parse('test:///chat');
			const item: IInboxNotificationItem = {
				id: 'pending', kind: InboxNotificationKind.NeedsInput, priority: InboxNotificationPriority.Now,
				title: 'Pending request', description: '', timestamp: 1, actions: [], previewSignature: 'preview',
				needsInputPart: kind === 'questionCarousel'
					? { kind, chatResource, requestId: 'request', allowSkip: true, questions: [{ id: 'choice', type: 'text', title: 'Choose a direction' }] }
					: { kind, chatResource, requestId: 'request', toolCallId: 'tool', confirmationKind: 'execution', title: 'Allow check?', message: 'Inspect the workspace.', buttons: [{ label: 'Allow', kind: 'approve', useUserActionReason: true }] },
			};
			const summaries = observableValue<ReadonlyMap<string, IInboxDetailSummary>>('summaries', new Map());
			const previews = observableValue<ReadonlyMap<string, string>>('previews', new Map());
			const { view, container, instantiationService } = createView(constObservable([item]), { detailSummaries: summaries, previews });
			instantiationService.stub(IMarkdownRendererService, 'render', (markdown: IMarkdownString) => {
				const element = mainWindow.document.createElement('span');
				element.textContent = markdown.value;
				return { element, dispose: () => { } };
			});
			view.render(container);
			container.querySelector<HTMLElement>('.inbox-notifications-item')!.click();
			const details = container.querySelector<HTMLElement>('.inbox-notifications-detail-evidence')!;
			const hiddenBefore = details.hidden;
			summaries.set(new Map([['pending', { status: '', decisions: [], evidence: [] }]]), undefined);
			assert.deepStrictEqual({
				hiddenBefore,
				hiddenAfter: details.hidden,
				loading: !!container.querySelector('.inbox-notifications-detail-loading'),
				content: details.querySelector('.inbox-notifications-interpretation-content > div')?.textContent,
			}, { hiddenBefore: true, hiddenAfter: true, loading: false, content: '' });
			previews.set(new Map([['preview', 'Generated decision context']]), undefined);
			assert.deepStrictEqual({
				visible: !details.hidden,
				card: container.querySelector('.inbox-notifications-item')?.textContent?.includes('Generated decision context'),
				detail: details.textContent?.includes('Generated decision context'),
				accessible: view.getDetailAccessibleContent()?.includes('Generated decision context'),
			}, { visible: true, card: false, detail: true, accessible: true });
		});
	}

	for (const dismissed of [false, true]) {
		test(`conversation fallback retains the originating chat after dismissal: ${dismissed}`, () => {
			const { view, instantiationService } = createView(constObservable([]));
			const mainResource = URI.parse('test:///main');
			const pendingResource = URI.parse('test:///secondary');
			const getSession = spy((_resource: URI) => undefined);
			instantiationService.stub(IChatService, 'getSession', getSession);
			instantiationService.stub(ISessionsManagementService, 'getSession', () => upcastPartial<ISession>({
				mainChat: constObservable(upcastPartial<IChat>({ resource: mainResource })),
			}));
			accessView(view).getSessionChatModel({
				id: 'pending', kind: InboxNotificationKind.NeedsInput, priority: InboxNotificationPriority.Now,
				title: 'Question', description: '', timestamp: 1, actions: [], sessionResource: URI.parse('test:///session'),
				chatResource: dismissed ? pendingResource : undefined,
				needsInputPart: dismissed ? undefined : { kind: 'questionCarousel', chatResource: pendingResource, requestId: 'request', allowSkip: true, questions: [] },
			});
			assert.strictEqual(getSession.firstCall.args[0], pendingResource);
		});
	}

	for (const workspaceLinked of [false, true]) {
		test(`CI and reviews submit check details and accepted feedback for workspace-linked PRs: ${workspaceLinked}`, async () => {
			const resource = URI.parse('test:///session');
			const chatResource = URI.parse('test:///chat');
			const item: IInboxNotificationItem = {
				id: 'item', kind: InboxNotificationKind.FailingCI, priority: InboxNotificationPriority.Now,
				title: 'CI', description: '', timestamp: 1, actions: [], sessionResource: resource,
			};
			const notifications = observableValue<readonly IInboxNotificationItem[]>('repairNotifications', [item]);
			const { view, instantiationService } = createView(notifications);
			const session = upcastPartial<ISession>({
				resource,
				mainChat: constObservable(upcastPartial<IChat>({ resource: chatResource })),
				workspace: constObservable(workspaceLinked ? upcastPartial<ISessionWorkspace>({
					folders: [upcastPartial<ISessionFolder>({
						gitRepository: upcastPartial<ISessionGitRepository>({
							gitHubInfo: constObservable({
								owner: 'owner', repo: 'repo',
								pullRequests: [1, 2].map(number => ({ owner: 'owner', repo: 'repo', number, uri: URI.parse(`https://github.com/owner/repo/pull/${number}`), createdByThisSession: false })),
							}),
						}),
					})],
				}) : undefined),
				artifacts: constObservable((workspaceLinked ? [] : [1, 2]).map(number => upcastPartial<ISessionArtifact>({
					id: `pr-${number}`, kind: SessionArtifactKind.PullRequest, isArtifact: true, isGitHub: true,
					link: URI.parse(`https://github.com/owner/repo/pull/${number}`),
				}))),
			});
			const markFixRequested = spy();
			const check = upcastPartial<PullRequestCheck>({ type: 'checkRun', id: '42', name: 'Unit Tests', status: 'completed', conclusion: 'failure' });
			const ciModel = upcastPartial<GitHubPullRequestCIModel>({
				owner: 'owner', repo: 'repo', prNumber: 1,
				requiredChecks: constObservable({ everyCheck: true, checks: [check], failed: [check], missing: [], pending: false }),
				getCheckRunAnnotations: async () => 'Failure details',
				markFixRequested,
			});
			instantiationService.stub(ISessionsManagementService, 'getSession', () => session);
			instantiationService.stub(ISessionsService, 'openSession', async () => { });
			instantiationService.stub(IGitHubService, 'createPullRequestModelReference', () => ({
				object: upcastPartial<GitHubPullRequestModel>({ pullRequest: constObservable(upcastPartial<NonNullable<ReturnType<GitHubPullRequestModel['pullRequest']['get']>>>({ headSha: 'head' })) }),
				dispose: () => { },
			}));
			const createCI = spy((_owner: string, _repo: string, _number: number, _sha: string) => ({ object: ciModel, dispose: () => { } }));
			instantiationService.stub(IGitHubService, 'createPullRequestCIModelReference', createCI);
			instantiationService.stub(IAgentFeedbackService, 'getFeedback', () => [upcastPartial<IAgentFeedback>({
				id: 'review', kind: AgentFeedbackKind.PRReview, state: AgentFeedbackState.Created,
				sourcePullRequest: { owner: 'owner', repo: 'repo', number: 1 },
			})]);
			instantiationService.stub(IAgentFeedbackService, 'isAgentHostSession', () => true);
			instantiationService.stub(IAgentFeedbackService, 'hasLoadedFeedback', () => true);
			instantiationService.stub(IAgentFeedbackService, 'onDidChangeFeedback', Event.None);
			const accept = spy();
			instantiationService.stub(IAgentFeedbackService, 'acceptFeedback', accept);
			const submit = spy(async (_resource: URI, options?: ISubmitFeedbackOptions) => {
				options?.onRequestAccepted?.();
				return true;
			});
			instantiationService.stub(IAgentFeedbackService, 'submitFeedback', submit);
			const result = await accessView(view).runInboxPullRequestAction(item, InboxNotificationActionKind.AgentMergeAddressReviews);
			const options = submit.firstCall.args[1]!;
			assert.deepStrictEqual({
				result, accepted: accept.firstCall.args, submitted: submit.callCount, feedbackIds: options.feedbackIds,
				chat: options.targetChat, hasCheck: options.query?.includes('Unit Tests'), hasAnnotations: options.query?.includes('Failure details'),
				scopedPRs: options.query?.includes('/fix-ci for #1') && options.query.includes('/fix-ci for #2'),
				reviews: options.query?.includes('/act-on-feedback'), marked: markFixRequested.callCount,
			}, {
				result: 'success', accepted: [resource, 'review'], submitted: 1, feedbackIds: ['review'],
				chat: chatResource, hasCheck: true, hasAnnotations: true, scopedPRs: true, reviews: true, marked: 2,
			});
			instantiationService.stub(IChatService, 'acquireOrLoadSession', async () => ({
				object: upcastPartial<IChatModel>({ sessionResource: chatResource }), dispose: () => { },
			}));
			const send = spy(async (_resource: URI, _query: string) => upcastPartial<ChatSendResult>({ kind: 'sent' }));
			instantiationService.stub(IChatService, 'sendRequest', send);
			const backgroundResult = await accessView(view).runInboxPullRequestAction(item, InboxNotificationActionKind.AgentMergeFixCI);
			assert.deepStrictEqual({
				result: backgroundResult, chat: send.firstCall?.args[0],
				query: send.firstCall?.args[1], feedbackRequests: submit.callCount, marked: markFixRequested.callCount,
			}, {
				result: 'success', chat: chatResource, query: options.query?.replace('\n\n/act-on-feedback', ''),
				feedbackRequests: 1, marked: 4,
			});
			const scopedItem: IInboxNotificationItem = {
				...item,
				pullRequestStates: [{
					label: '#2', repositoryLabel: 'owner/repo',
					pullRequestUri: URI.parse('https://github.com/owner/repo/pull/2'), icon: { id: 'git-pull-request' }, statusLabel: 'CI failed',
				}],
			};
			const scopedResult = await accessView(view).runInboxPullRequestAction(scopedItem, InboxNotificationActionKind.AgentMergeFixCI);
			assert.deepStrictEqual({
				result: scopedResult, requests: createCI.callCount, lastTarget: createCI.lastCall.args, marked: markFixRequested.callCount,
			}, { result: 'success', requests: 5, lastTarget: ['owner', 'repo', 2, 'head'], marked: 5 });
			notifications.set([item, { ...item, id: 'reviews', kind: InboxNotificationKind.ReviewComments }], undefined);
			instantiationService.stub(IAgentFeedbackService, 'getFeedback', () => []);
			const open = spy(async () => { });
			instantiationService.stub(ISessionsService, 'openSession', open);
			const ciWithoutReviews = await accessView(view).runInboxPullRequestAction(item, InboxNotificationActionKind.AgentMergeFixCI);
			assert.deepStrictEqual({
				result: ciWithoutReviews, opened: open.callCount, marked: markFixRequested.callCount,
				containsCI: send.lastCall.args[1].includes('Unit Tests'), containsReviews: send.lastCall.args[1].includes('/act-on-feedback'),
			}, { result: 'success', opened: 0, marked: 7, containsCI: true, containsReviews: false });
		});
	}

	test('never submits the local merge skill for pull request merge actions', async () => {
		const { view, instantiationService } = createView(constObservable([]));
		const send = spy();
		instantiationService.stub(IChatService, 'sendRequest', send);
		instantiationService.stub(ISessionsManagementService, 'getSession', () => undefined);
		const result = await accessView(view).runInboxPullRequestAction({
			id: 'merge', kind: InboxNotificationKind.PassingCI, priority: InboxNotificationPriority.Next,
			title: 'PR', description: '', timestamp: 1, actions: [], sessionResource: URI.parse('test:///session'),
		}, InboxNotificationActionKind.AgentMergeMergePullRequest);
		assert.deepStrictEqual({ result, submissions: send.callCount }, { result: 'skipped', submissions: 0 });
	});

	for (const outcome of ['loaded', 'empty', 'unsupported'] as const) {
		test(`review submission handles asynchronously loaded feedback: ${outcome}`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const resource = URI.parse('test:///review-session');
			const item: IInboxNotificationItem = {
				id: 'review', kind: InboxNotificationKind.ReviewComments, priority: InboxNotificationPriority.Now,
				title: 'Comments', description: '', timestamp: 1, actions: [], sessionResource: resource,
			};
			const { view, instantiationService } = createView(constObservable([item]));
			const session = upcastPartial<ISession>({
				resource, mainChat: constObservable(upcastPartial<IChat>({ resource: URI.parse('test:///review-chat') })),
				workspace: constObservable(undefined),
				artifacts: constObservable([upcastPartial<ISessionArtifact>({
					id: 'pr', kind: SessionArtifactKind.PullRequest, isArtifact: true, isGitHub: true,
					link: URI.parse('https://github.com/owner/repo/pull/1'),
				})]),
			});
			const changed = disposables.add(new Emitter<IAgentFeedbackChangeEvent>());
			let loaded = false;
			let feedback: IAgentFeedback[] = [];
			const submit = spy(async () => true);
			const open = spy(async () => { });
			const notify = spy();
			instantiationService.stub(ISessionsManagementService, 'getSession', () => session);
			instantiationService.stub(ISessionsService, 'openSession', open);
			instantiationService.stub(IAgentFeedbackService, 'isAgentHostSession', () => outcome !== 'unsupported');
			instantiationService.stub(IAgentFeedbackService, 'hasLoadedFeedback', () => loaded);
			instantiationService.stub(IAgentFeedbackService, 'getFeedback', () => feedback);
			instantiationService.stub(IAgentFeedbackService, 'onDidChangeFeedback', changed.event);
			instantiationService.stub(IAgentFeedbackService, 'acceptFeedback', () => { });
			instantiationService.stub(IAgentFeedbackService, 'submitFeedback', submit);
			instantiationService.stub(INotificationService, 'info', notify);
			const pending = accessView(view).runInboxPullRequestAction(item, InboxNotificationActionKind.AgentMergeAddressReviews);
			await timeout(0);
			const beforeReady = submit.callCount;
			if (outcome === 'loaded') {
				loaded = true;
				changed.fire({ sessionResource: resource, feedbackItems: [] });
				feedback = [upcastPartial<IAgentFeedback>({ id: 'comment', kind: AgentFeedbackKind.PRReview, state: AgentFeedbackState.Created })];
				changed.fire({ sessionResource: resource, feedbackItems: feedback });
			}
			const result = await pending;
			assert.deepStrictEqual({ result, beforeReady, submitted: submit.callCount, opened: open.callCount, notified: notify.callCount }, {
				result: outcome === 'loaded' ? 'success' : 'skipped', beforeReady: 0,
				submitted: outcome === 'loaded' ? 1 : 0, opened: outcome === 'unsupported' ? 0 : 1,
				notified: outcome === 'loaded' ? 0 : 1,
			});
		}));
	}

	test('delegates merge confirmation to the changeset and rejects disabled operations', async () => {
		const { view, instantiationService } = createView(constObservable([]));
		const operation: ISessionChangesetOperation = {
			id: 'pr-merge', label: 'Merge Pull Request', scopes: [SessionChangesetOperationScope.Changeset],
			status: SessionChangesetOperationStatus.Idle, confirmation: 'Merge this pull request?',
		};
		const operations = observableValue<readonly ISessionChangesetOperation[]>('operations', [operation]);
		const invoke = spy(async (_operationId: string) => { });
		const changeset = upcastPartial<ISessionChangeset>({ id: 'changes', isEnabled: constObservable(true), operations, invokeOperation: invoke });
		const session = upcastPartial<ISession>({
			resource: URI.parse('test:///session'), workspace: constObservable(undefined),
			mainChat: constObservable(upcastPartial<IChat>({ resource: URI.parse('test:///chat'), changesets: constObservable([changeset]) })),
			artifacts: constObservable([upcastPartial<ISessionArtifact>({
				id: 'pr', kind: SessionArtifactKind.PullRequest, isArtifact: true, isGitHub: true,
				link: URI.parse('https://github.com/owner/repo/pull/1'),
			})]),
		});
		const item: IInboxNotificationItem = {
			id: 'merge', kind: InboxNotificationKind.PassingCI, priority: InboxNotificationPriority.Next,
			title: 'PR', description: '', timestamp: 1, actions: [], sessionResource: session.resource,
		};
		instantiationService.stub(ISessionsManagementService, 'getSession', () => session);
		const confirm = spy(async () => ({ confirmed: true }));
		instantiationService.stub(IDialogService, 'confirm', confirm);
		const merged = await accessView(view).runInboxPullRequestAction(item, InboxNotificationActionKind.AgentMergeMergePullRequest);
		operations.set([{ ...operation, status: SessionChangesetOperationStatus.Disabled }], undefined);
		const disabled = await accessView(view).runInboxPullRequestAction(item, InboxNotificationActionKind.AgentMergeMergePullRequest);
		assert.deepStrictEqual({ merged, disabled, confirmations: confirm.callCount, invocations: invoke.getCalls().map(call => call.args) }, {
			merged: 'success', disabled: 'skipped', confirmations: 0, invocations: [['pr-merge']],
		});
	});
});
