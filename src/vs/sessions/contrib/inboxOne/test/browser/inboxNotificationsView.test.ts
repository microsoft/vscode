/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { match, spy, stub } from 'sinon';
import { IAction } from '../../../../../base/common/actions.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { $ } from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { DomScrollableElement } from '../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { errorHandler, setUnexpectedErrorHandler } from '../../../../../base/common/errors.js';
import { IObservable, autorun, constObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { IChatSessionHistoryStatus } from '../../../../../platform/chat/common/chatSessionHistory.js';
import { SESSIONS_MARK_AS_DONE_CONFETTI_SETTING } from '../../../../../platform/chat/common/sessionArchiveActions.js';
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
import { ChatSendResult, IChatConfirmation, IChatQuestionAnswerValue, IChatService, IChatToolInvocation, ToolConfirmKind } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatModel, IChatRequestModel, IChatResponseModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { IChatSideChatService } from '../../../../../workbench/contrib/chat/common/chatSideChatService.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { ChatViewModel, IChatViewModelChangeEvent } from '../../../../../workbench/contrib/chat/common/model/chatViewModel.js';
import { ChatListWidget } from '../../../../../workbench/contrib/chat/browser/widget/chatListWidget.js';
import { ChatQuestionCarouselData } from '../../../../../workbench/contrib/chat/common/model/chatProgressTypes/chatQuestionCarouselData.js';
import { ChatQuestionCarouselPart } from '../../../../../workbench/contrib/chat/browser/widget/chatContentParts/chatQuestionCarouselPart.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { URI } from '../../../../../base/common/uri.js';
import { IOnboardingScenarioService } from '../../../../../workbench/contrib/onboarding/common/onboardingScenarioService.js';
import { ISessionNavigationRequest, ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { IChatViewFactory } from '../../../../services/chatView/browser/chatViewFactory.js';
import { AbstractChatView, IChatViewOptions } from '../../../../browser/parts/chatView.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { IChat, ISession, ISessionArtifact, ISessionCapabilities, ISessionChangeset, ISessionChangesetOperation, ISessionFolder, ISessionGitRepository, ISessionWorkspace, SessionArtifactKind, SessionChangesetOperationScope, SessionChangesetOperationStatus } from '../../../../services/sessions/common/session.js';
import { InboxNotificationsView } from '../../browser/inboxNotificationsView.js';
import { InboxEvidenceWidget } from '../../browser/inboxEvidenceWidget.js';
import { InboxCanvases } from '../../browser/inboxCanvases.js';
import { IInboxDetailSummary, IInboxNotificationConfirmationPart, IInboxNotificationItem, IInboxNotificationQuestionCarouselPart, IInboxNotificationsService, IInboxNotificationToolConfirmationPart, IInboxSessionRow, InboxNotificationActionKind, InboxNotificationKind, InboxNotificationPriority, InboxNotificationsSortMode, InboxTab } from '../../common/inboxNotificationsService.js';
import { IGitHubService } from '../../../github/browser/githubService.js';
import { AgentFeedbackKind, AgentFeedbackState, IAgentFeedback, IAgentFeedbackChangeEvent, IAgentFeedbackService, ISubmitFeedbackOptions } from '../../../agentFeedback/browser/agentFeedbackService.js';
import { ConfirmationOptionKind } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { GitHubPullRequestCIModel } from '../../../github/browser/models/githubPullRequestCIModel.js';
import { GitHubPullRequestModel } from '../../../github/browser/models/githubPullRequestModel.js';
import { PullRequestCheck } from '../../../../../platform/github/common/githubPullRequestService.js';
import '../../../chat/browser/media/chatWidget.css';
import '../../../chat/browser/media/chatInput.css';

suite('InboxNotificationsView', () => {
	const disposables = new DisposableStore();
	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	class TestChatView extends AbstractChatView {
		readonly kind = 'chat';
		readonly bindings: { chat: IChat; historyKey?: string; session?: ISession }[] = [];
		disposed = false;
		visible = false;
		active = false;
		readonly input = document.createElement('textarea');
		private _inputContentElement: HTMLElement = this.input;
		override get inputContentElement(): HTMLElement { return this._inputContentElement; }
		setInputContentElement(element: HTMLElement): void { this._inputContentElement = element; }
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
		override setVisible(visible: boolean): void { this.visible = visible; }
		override setActive(active: boolean): void { this.active = active; }

		override dispose(): void {
			this.disposed = true;
			super.dispose();
		}
	}

	function createResizeObserver() {
		let instance: TestResizeObserver | undefined;
		class TestResizeObserver implements ResizeObserver {
			readonly targets = new Set<Element>();
			constructor(readonly callback: ResizeObserverCallback) { instance = this; }
			observe(target: Element): void { this.targets.add(target); }
			unobserve(target: Element): void { this.targets.delete(target); }
			disconnect(): void { this.targets.clear(); }
		}
		return {
			ctor: TestResizeObserver,
			get instance() {
				assert.ok(instance);
				return instance;
			},
		};
	}

	function accessView(view: InboxNotificationsView) {
		return view as unknown as {
			carouselModels: ReadonlyMap<string, ChatQuestionCarouselData>;
			scrollableElement: DomScrollableElement;
			detailScrollableElement: DomScrollableElement;
			submitToolConfirmationPart(item: IInboxNotificationItem, part: IInboxNotificationToolConfirmationPart, buttonIndex: number): Promise<void>;
			submitConfirmationPart(item: IInboxNotificationItem, part: IInboxNotificationConfirmationPart, buttonLabel: string, buttonIndex: number): Promise<void>;
			submitQuestionCarouselPart(item: IInboxNotificationItem, part: IInboxNotificationQuestionCarouselPart, answers: Map<string, IChatQuestionAnswerValue> | undefined): Promise<void>;
			classifyCarouselAnswers(answers: Map<string, IChatQuestionAnswerValue>): { answerKind: string; answerCharCount: number };
			runMergedSessionCleanupAction(item: IInboxNotificationItem, kind: InboxNotificationActionKind.ArchiveSession | InboxNotificationActionKind.DeleteSession, enableAlways: boolean): Promise<string>;
			runAction(item: IInboxNotificationItem, action: IInboxNotificationItem['actions'][number], sourceElement?: HTMLElement, enableAlways?: boolean): Promise<void>;
			getSessionChatModel(item: IInboxNotificationItem): IChatModel | undefined;
			setCategoryVisible(category: 'now' | 'next' | 'later', visible: boolean): void;
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
			storedCategories?: readonly string[];
			chatService?: Partial<IChatService>;
			confettiEnabled?: boolean;
			reducedMotion?: boolean;
			rows?: IObservable<readonly IInboxSessionRow[]>;
		} = {},
	) {
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IInboxNotificationsService, {
			notifications: items,
			sessionRows: options.rows ?? items.map(items => items.map(item => ({
				...item, tab: InboxTab.ReadyForYou, sessionTitle: item.title, occurrence: item.id, notifications: [item], hasImages: false,
			}))),
			setSessionOnHold: () => { },
			markSessionDone: () => { },
			dismissedNotifications: options.dismissed ?? constObservable([]),
			previews: options.previews ?? constObservable(new Map()),
			sortMode: constObservable(InboxNotificationsSortMode.Priority),
			isLoading: constObservable(false),
			detailSummaries: options.detailSummaries ?? constObservable(new Map()),
			requestPreview: item => { options.previewRequests?.push(item.id); },
			getInteractionTelemetryContext: () => ({ agentSessionId: 'none', providerId: 'none' }),
			requestDetailSummary: () => { },
			dismissNotification: () => { },
		});
		instantiationService.stub(IChatService, { getSession: () => undefined, onDidCreateModel: Event.None, ...options.chatService });
		instantiationService.stub(IChatSideChatService, { canAskInSideChat: () => false });
		const navigationRequest = observableValue<ISessionNavigationRequest | undefined>('navigation', undefined);
		instantiationService.stub(ISessionsService, { navigationRequest, openNewSession: async () => ({ session: undefined, trustDeclined: false }) });
		let sessionsVisible = true;
		instantiationService.stub(IAgentWorkbenchLayoutService, {
			isVisible: part => part === Parts.SESSIONS_PART && sessionsVisible,
			setPartHidden: (hidden, part) => {
				assert.strictEqual(part, Parts.SESSIONS_PART);
				sessionsVisible = !hidden;
			},
		});
		instantiationService.stub(ISessionsManagementService, { getSession: () => undefined, setSessionReadState: async () => { } });
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
		instantiationService.stub(ISessionsProvidersService, { getProvider: () => undefined });
		instantiationService.stub(IContextKeyService, options.contextKeyService ?? new MockContextKeyService());
		instantiationService.stub(IContextMenuService, {});
		instantiationService.stub(IDialogService, {});
		instantiationService.stub(IMarkdownRendererService, {});
		instantiationService.stub(IGitHubService, {});
		instantiationService.stub(IAgentFeedbackService, {});
		instantiationService.stub(IOnboardingScenarioService, {});
		instantiationService.stub(INotificationService, {});
		instantiationService.stub(ICommandService, {});
		const configurationService = new TestConfigurationService({ [SESSIONS_MARK_AS_DONE_CONFETTI_SETTING]: options.confettiEnabled ?? false });
		disposables.add(configurationService.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IAccessibilityService, { isMotionReduced: () => options.reducedMotion ?? true });
		instantiationService.stub(IOpenerService, {});
		const storageService = disposables.add(new InMemoryStorageService());
		const storedCategories = options.storedCategories ?? (options.completedVisible ? ['now', 'next', 'later', 'completed'] : undefined);
		if (storedCategories) {
			storageService.store('sessions.inboxNotifications.visibleCategories', JSON.stringify(storedCategories), StorageScope.APPLICATION, StorageTarget.USER);
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
		return { view, container, instantiationService, chatViews, chatOptions, newChatViews, newChatOptions, hovers, navigationRequest, sessionsVisible: () => sessionsVisible };
	}

	for (const { categories, expected } of [
		{ categories: ['completed'], expected: ['now', 'next', 'later'] },
		{ categories: ['completed', 'unsupported'], expected: ['now', 'next', 'later'] },
		{ categories: [], expected: [] },
		{ categories: ['completed', 'next'], expected: ['next'] },
	]) {
		test(`restores supported priorities from the stored filter ${JSON.stringify(categories)}`, () => {
			const { view, container } = createView(constObservable([
				{ priority: InboxNotificationPriority.Now, id: 'now' },
				{ priority: InboxNotificationPriority.Next, id: 'next' },
				{ priority: InboxNotificationPriority.Later, id: 'later' },
			].map(({ priority, id }) => ({
				id, kind: InboxNotificationKind.Completed, priority,
				title: id, description: '', timestamp: 1, actions: [],
			}))), { storedCategories: categories });
			view.render(container);
			assert.deepStrictEqual(
				Array.from(container.querySelectorAll<HTMLElement>('.inbox-notifications-item'), card => card.dataset.notificationId),
				expected,
			);
		});
	}

	test('New Session keeps a pet-free composer anchored below notifications and preserves its draft', async () => {
		const { view, container, instantiationService, newChatViews, newChatOptions } = createView(constObservable([]));
		const openNewSession = stub().resolves({ session: undefined, trustDeclined: false });
		instantiationService.stub(ISessionsService, 'openNewSession', openNewSession);
		container.remove();
		view.render(container);
		document.body.appendChild(container);
		const before = newChatViews.length;
		const automaticNavigation = openNewSession.callCount;
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
			before, automaticNavigation, hidden, created: newChatViews.length,
			options: newChatOptions.map(({ hostVisible, ...options }) => ({ ...options, hostVisible: hostVisible?.get() })),
			requests: openNewSession.args, draft: input.value, focused: mainWindow.document.activeElement === input,
			belowNotifications: composer.parentElement?.previousElementSibling === notifications,
			inputAtTop: input.getBoundingClientRect().top - composer.getBoundingClientRect().top < 40,
		};
		view.dispose();
		assert.deepStrictEqual({ ...result, disposed: newChatViews[0].disposed }, {
			before: 1, automaticNavigation: 0, hidden: false, created: 1, options: [{ preserveCustomView: true, backgroundSend: true, renderChatPet: false, hostVisible: true }],
			requests: Array.from({ length: 3 }, () => [{ preserveCustomView: true, cancelRestore: true }]),
			draft: 'My new session draft', focused: true, belowNotifications: true, inputAtTop: true, disposed: true,
		});
	});

	test('an Inbox composer created while hidden stays inactive and follows host visibility', () => {
		const { view, container, newChatViews, newChatOptions } = createView(constObservable([]));
		view.setVisible(false);
		view.render(container);
		const hostVisibility: (boolean | undefined)[] = [];
		disposables.add(autorun(reader => hostVisibility.push(newChatOptions[0].hostVisible?.read(reader))));
		const hidden = { visible: newChatViews[0].visible, active: newChatViews[0].active };
		view.setVisible(true);
		view.setVisible(false);
		assert.deepStrictEqual({ hidden, hostVisibility }, {
			hidden: { visible: false, active: false }, hostVisibility: [false, true, false],
		});
	});

	for (const width of [900, 540]) {
		test(`new-session and reply input edges stay bottom anchored across selection at width ${width}`, () => {
			const resizeObserver = createResizeObserver();
			const chat = upcastPartial<IChat>({ resource: URI.parse('test:///chat') });
			const session = upcastPartial<ISession>({ sessionId: 'session', mainChat: constObservable(chat), chats: constObservable([chat]) });
			const { view, container, instantiationService, newChatViews, chatViews } = createView(constObservable([{
				id: 'item', kind: InboxNotificationKind.Completed, priority: InboxNotificationPriority.Later,
				title: 'Review changes', description: 'Completed work', timestamp: 1, actions: [], sessionResource: URI.parse('test:///session'),
			}]), { resizeObserver: resizeObserver.ctor });
			instantiationService.stub(ISessionsManagementService, 'getSession', () => session);
			container.style.width = `${width}px`;
			container.style.height = '600px';
			container.style.setProperty('--vscode-spacing-size120', '12px');
			container.style.setProperty('--vscode-spacing-size40', '4px');
			view.render(container);
			const mountInput = (chatView: TestChatView, newSession: boolean) => {
				let host = chatView.element;
				if (newSession) {
					host.classList.add('sessions-chat-widget');
					host = host.appendChild($('.new-chat-widget-container.revealed')).appendChild($('.new-chat-widget-content'));
					chatView.setInputContentElement(host);
					host.style.top = '-18px';
					const picker = host.appendChild($('.new-session-workspace-picker-container'));
					picker.style.height = '32px';
					host = host.appendChild($('.new-chat-input-container'));
				}
				const inputPart = host.appendChild($('.interactive-session')).appendChild($('.interactive-input-part'));
				inputPart.appendChild(chatView.input);
				if (!newSession) {
					chatView.setInputContentElement(inputPart);
				}
				chatView.input.style.cssText = 'display: block; box-sizing: border-box; width: 100%; height: 80px; margin: 0';
			};
			mountInput(newChatViews[0], true);
			view.layout(width, 600);
			const newContent = newChatViews[0].element.querySelector<HTMLElement>('.new-chat-widget-content')!;
			assert.ok(resizeObserver.instance.targets.has(newContent));
			const composer = container.querySelector<HTMLElement>('.inbox-notifications-composer')!;
			const label = container.querySelector<HTMLElement>('.inbox-notifications-composer-label')!;
			const notifications = container.querySelector<HTMLElement>('.inbox-notifications-content')!;
			const initial = newChatViews[0].input.getBoundingClientRect();
			const measure = (chatView: TestChatView, newSession: boolean) => {
				const input = chatView.input.getBoundingClientRect();
				const content = chatView.element.querySelector<HTMLElement>(newSession ? '.new-chat-widget-content' : '.interactive-input-part')!.getBoundingClientRect();
				return {
					leftShift: Math.round(Math.abs(input.left - initial.left)),
					rightShift: Math.round(Math.abs(input.right - initial.right)),
					bottomAnchored: Math.abs(input.bottom - initial.bottom) <= 1,
					bottomGap: Math.abs(composer.getBoundingClientRect().bottom - input.bottom) <= 1,
					labelGap: Math.round(content.top - label.getBoundingClientRect().bottom),
					listGap: Math.round(label.getBoundingClientRect().top - notifications.getBoundingClientRect().bottom),
				};
			};
			const bounds = [measure(newChatViews[0], true)];
			container.querySelector<HTMLElement>('.inbox-notifications-item')!.click();
			mountInput(chatViews[0], false);
			view.layout(width, 600);
			bounds.push(measure(chatViews[0], false));
			assert.ok(!resizeObserver.instance.targets.has(newContent));
			container.querySelector<HTMLElement>('.inbox-notifications-item')!.click();
			view.layout(width, 600);
			bounds.push(measure(newChatViews[0], true));
			newChatViews[0].input.style.height = '104px';
			resizeObserver.instance.callback([], resizeObserver.instance);
			bounds.push(measure(newChatViews[0], true));
			newChatViews[0].input.style.height = '80px';
			resizeObserver.instance.callback([], resizeObserver.instance);
			bounds.push(measure(newChatViews[0], true));
			assert.deepStrictEqual(bounds, Array.from({ length: 5 }, () => ({
				leftShift: 0, rightShift: 0, bottomAnchored: true, bottomGap: true, labelGap: 4, listGap: 12,
			})));
		});
	}

	test('notification state sits before the right-aligned date and not in evidence', () => {
		const { view, container } = createView(constObservable([{
			id: 'item', kind: InboxNotificationKind.Completed, priority: InboxNotificationPriority.Later,
			title: 'Review changes', description: '', timestamp: Date.now(), actions: [],
		}]));
		container.style.setProperty('--vscode-spacing-size100', '10px');
		container.style.setProperty('--vscode-spacing-size80', '8px');
		view.render(container);
		const card = container.querySelector<HTMLElement>('.inbox-notifications-item')!;
		card.click();
		view.layout(900, 600);
		const state = card.querySelector<HTMLElement>('.inbox-notifications-item-kind-label')!;
		const date = card.querySelector<HTMLElement>('.inbox-notifications-item-time')!;
		const beforeHover = state.getBoundingClientRect();
		card.classList.add('hovered');
		assert.deepStrictEqual({
			text: state.textContent,
			beforeDate: state.nextElementSibling === date.parentElement,
			onSameLine: Math.abs(beforeHover.top - date.getBoundingClientRect().top) <= 1,
			rightAligned: card.getBoundingClientRect().right - date.getBoundingClientRect().right <= 10,
			stableOnHover: state.getBoundingClientRect().left === beforeHover.left,
			accessible: card.getAttribute('aria-label')?.includes('Completed'),
			evidenceStates: container.querySelectorAll('.inbox-notifications-detail-pane .inbox-notifications-item-kind-label').length,
		}, { text: 'Completed', beforeDate: true, onSameLine: true, rightAligned: true, stableOnHover: true, accessible: true, evidenceStates: 0 });
	});

	test('Inbox only hides the Sessions pane after focus, until explicit navigation, tab hiding, or disposal', () => {
		const { view, container, navigationRequest, sessionsVisible } = createView(constObservable([]));
		view.render(container);
		const previousFocus = mainWindow.document.activeElement;
		view.setVisible(true);
		const opened = sessionsVisible();
		const preservedFocus = mainWindow.document.activeElement === previousFocus;
		container.dispatchEvent(new FocusEvent('focus'));
		const focused = sessionsVisible();
		navigationRequest.set({ token: CancellationToken.None }, undefined);
		const navigated = sessionsVisible();
		view.focus();
		const refocused = sessionsVisible();
		view.setVisible(false);
		const hidden = sessionsVisible();
		view.setVisible(true);
		const restored = sessionsVisible();
		view.focus();
		view.dispose();
		assert.deepStrictEqual({ opened, preservedFocus, focused, navigated, refocused, hidden, restored, disposed: sessionsVisible() }, {
			opened: true, preservedFocus: true, focused: false, navigated: true, refocused: false, hidden: true, restored: true, disposed: true,
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

	test('retains the session draft but resets the composer when its row leaves', () => {
		const chat = upcastPartial<IChat>({ resource: URI.parse('test:///chat') });
		const session = upcastPartial<ISession>({ sessionId: 'session', mainChat: constObservable(chat), chats: constObservable([chat]) });
		const item: IInboxNotificationItem = {
			id: 'item', kind: InboxNotificationKind.Completed, priority: InboxNotificationPriority.Later,
			title: 'Finished', description: 'Summary', timestamp: 1, actions: [], sessionResource: URI.parse('test:///session'),
		};
		const items = observableValue<readonly IInboxNotificationItem[]>('items', [item]);
		const { view, container, instantiationService, chatViews, newChatViews } = createView(items);
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
			connected: chatView.input.isConnected, focused: document.activeElement === newChatViews[0].input,
			input: chatView.input.value, hasSplit: !container.querySelector('.inbox-notifications-content')?.classList.contains('no-detail'),
			summaryPresent: !!container.querySelector('.inbox-notifications-detail-evidence'),
		}, {
			created: 1, bindings: [{ chat, historyKey: 'session', session }], connected: true, focused: true,
			input: 'Follow-up draft', hasSplit: false, summaryPresent: false,
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
			container.querySelector<HTMLElement>('.inbox-notifications-item-time')!.style.fontSize = '20px';
			view.layout(width, 400);
			const header = container.querySelector<HTMLElement>('.inbox-notifications-item')!.getBoundingClientRect();
			const title = container.querySelector<HTMLElement>('.inbox-notifications-item-title')!.getBoundingClientRect();
			const buttons = [...container.querySelectorAll<HTMLElement>('.inbox-notifications-row-actions .monaco-button')];
			return {
				noOverlap: buttons.every(button => title.right <= button.getBoundingClientRect().left),
				withinHeader: buttons.every(button => button.getBoundingClientRect().right <= header.right + 1),
			};
		});
		assert.deepStrictEqual(layouts, Array.from({ length: 3 }, () => ({ noOverlap: true, withinHeader: true })));
	});

	for (const count of [1, 2, 3, 4, 7]) {
		test(`${count} pull requests use a list with disclosure only above three`, () => {
			const item: IInboxNotificationItem = {
				id: 'pull-requests', kind: InboxNotificationKind.PullRequestMerged, priority: InboxNotificationPriority.Later,
				title: 'Merged pull requests', description: 'Ready to archive', timestamp: 1, actions: [],
				pullRequestStates: Array.from({ length: count }, (_, index) => ({
					label: `owner/${'repository'.repeat(10)}#${index + 1}`, repositoryLabel: 'owner/repository', statusLabel: 'Merged', icon: { id: 'git-pull-request-done' },
					pullRequestUri: URI.parse(`https://github.com/owner/repository/pull/${index + 1}`),
				})),
			};
			const { view, container, instantiationService } = createView(constObservable([item]));
			const opened: string[] = [];
			instantiationService.stub(IOpenerService, 'open', async (uri: URI | string) => { opened.push(uri.toString()); return true; });
			view.render(container);
			container.querySelector<HTMLElement>('.inbox-notifications-item')!.click();
			container.style.width = '320px';
			view.layout(320, 400);
			const list = container.querySelector<HTMLElement>('.inbox-notifications-item-pr-states')!;
			const toggle = container.querySelector<HTMLElement>('.inbox-notifications-item-pr-toggle');
			const collapsed = { hidden: list.hidden, expanded: toggle?.getAttribute('aria-expanded'), controls: !toggle || toggle.getAttribute('aria-controls') === list.id };
			toggle?.click();
			const expanded = { hidden: list.hidden, expanded: toggle?.getAttribute('aria-expanded') };
			const linksFit = count === 1 || [...list.querySelectorAll<HTMLElement>('.inbox-notifications-item-pr-state-link')].every(link =>
				link.getBoundingClientRect().right <= list.getBoundingClientRect().right + 1);
			list.querySelector<HTMLElement>('.inbox-notifications-item-pr-state-link')!.click();
			toggle?.click();
			assert.deepStrictEqual({
				isList: list.classList.contains('inbox-notifications-item-pr-list'), links: list.children.length,
				collapsed, expanded, collapsedAgain: list.hidden, linksFit, opened,
				cardSelected: !!container.querySelector('.inbox-notifications-item.selected'),
			}, {
				isList: count > 1, links: count,
				collapsed: { hidden: count > 3, expanded: count > 3 ? 'false' : undefined, controls: true },
				expanded: { hidden: false, expanded: count > 3 ? 'true' : undefined },
				collapsedAgain: count > 3, linksFit: true, opened: ['https://github.com/owner/repository/pull/1'], cardSelected: true,
			});
		});
	}

	test('merged session cleanup actions wrap below the content without overflowing or competing with the title', () => {
		const session = upcastPartial<ISession>({ providerId: 'local-agent-host', mainChat: constObservable(upcastPartial<IChat>({ resource: URI.parse('test:///chat') })), chats: constObservable([]) });
		const { view, container, instantiationService } = createView(constObservable([{
			id: 'merged', kind: InboxNotificationKind.PullRequestMerged, priority: InboxNotificationPriority.Later,
			title: '7 Pull Requests Merged', description: 'Archive or delete this session when you are done.', timestamp: 1,
			sessionResource: URI.parse('test:///session'),
			actions: [
				{ id: 'archive', label: 'Archive Session', kind: InboxNotificationActionKind.ArchiveSession },
				{ id: 'delete', label: 'Delete Session', kind: InboxNotificationActionKind.DeleteSession },
				{ id: 'open', label: 'Open Session', kind: InboxNotificationActionKind.OpenSession },
				{ id: 'done', label: '$(check)', kind: InboxNotificationActionKind.MarkDone },
			],
		}]));
		instantiationService.stub(ISessionsManagementService, 'getSession', () => session);
		view.render(container);
		container.querySelector<HTMLElement>('.inbox-notifications-item')!.click();
		const layouts = [320, 420, 560, 900].map(width => {
			container.style.width = `${width}px`;
			view.layout(width, 400);
			const card = container.querySelector<HTMLElement>('.inbox-notifications-notification')!;
			const footer = card.querySelector<HTMLElement>('.inbox-notifications-item-footer-actions')!;
			const bounds = footer.getBoundingClientRect();
			const description = card.querySelector<HTMLElement>('.inbox-notifications-item-description')!.getBoundingClientRect();
			return {
				belowContent: bounds.top >= description.bottom,
				last: card.lastElementChild === footer,
				headerActions: card.querySelector('.inbox-notifications-item-header-actions'),
				noOverflow: [...footer.querySelectorAll<HTMLElement>('.monaco-button')].every(button => {
					const rect = button.getBoundingClientRect();
					return rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1 && rect.bottom <= bounds.bottom + 1;
				}),
				dropdowns: footer.querySelectorAll('.monaco-button-dropdown').length,
			};
		});
		assert.deepStrictEqual(layouts, Array.from({ length: 4 }, () => ({
			belowContent: true, last: true, headerActions: null, noOverflow: true, dropdowns: 2,
		})));
	});

	test('compact rows identify the notification event instead of showing session status dots', () => {
		const events = [
			{ kind: InboxNotificationKind.ConfirmationRequested, icon: 'shield', label: 'Confirmation' },
			{ kind: InboxNotificationKind.NeedsInput, icon: 'question', label: 'Needs Input' },
			{ kind: InboxNotificationKind.FailingCI, icon: 'error', label: 'CI' },
			{ kind: InboxNotificationKind.PassingCI, icon: 'pass', label: 'Merge Ready' },
			{ kind: InboxNotificationKind.PullRequestMerged, icon: 'git-merge', label: 'Merged' },
			{ kind: InboxNotificationKind.ReviewComments, icon: 'comment-discussion', label: 'Comments' },
			{ kind: InboxNotificationKind.Completed, icon: 'check', label: 'Completed' },
			{ kind: InboxNotificationKind.External, icon: 'bell', label: 'Event' },
		];
		const items = events.map(({ kind }, index): IInboxNotificationItem => ({
			id: String(index), kind, priority: InboxNotificationPriority.Now,
			title: String(index), description: '', timestamp: 100 - index, actions: [],
		}));
		const { view, container, hovers } = createView(constObservable(items));
		view.render(container);
		assert.deepStrictEqual([...container.querySelectorAll<HTMLElement>('.inbox-notifications-item')].map((row, index) => {
			const icon = row.querySelector<HTMLElement>(':scope > .codicon')!;
			const hover = hovers.find(hover => hover.target === icon)?.options;
			return {
				icon: icon.classList.contains(`codicon-${events[index].icon}`),
				decorative: icon.getAttribute('aria-hidden'),
				label: row.getAttribute('aria-label')?.includes(events[index].label),
				hover: (typeof hover === 'function' ? hover() : hover)?.content,
			};
		}), events.map(event => ({ icon: true, decorative: 'true', label: true, hover: event.label })));
	});

	test('compact rows omit provider labels and retain timestamps while evidence has one title and a bounded session preview', () => {
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
			sessionResource: URI.parse('test:///session'), repositoryLabel: 'owner/repo',
		}]));
		instantiationService.stub(ISessionsManagementService, 'getSession', () => session);
		const getProvider = spy(() => undefined);
		instantiationService.stub(ISessionsProvidersService, 'getProvider', getProvider);
		instantiationService.stub(IChatService, 'getSession', () => upcastPartial<IChatModel>({
			getRequests: () => [upcastPartial<IChatRequestModel>({
				response: upcastPartial<IChatResponseModel>({
					response: upcastPartial<IChatResponseModel['response']>({ value: [{ kind: 'markdownContent', content: { value: 'R'.repeat(1000) } }] }),
				}),
			})],
		}));
		view.render(container);
		const providerRequestedForRow = getProvider.called;
		container.querySelector<HTMLElement>('.inbox-notifications-item')!.click();
		const headerLayouts = [900, 500, 360].map(width => {
			container.style.width = `${width}px`;
			container.querySelector<HTMLElement>('.inbox-notifications-item-time')!.style.fontSize = '20px';
			container.style.height = '600px';
			view.layout(width, 600);
			const header = container.querySelector<HTMLElement>('.inbox-notifications-item')!.getBoundingClientRect();
			const actions = container.querySelector<HTMLElement>('.inbox-notifications-row-actions')!.getBoundingClientRect();
			const date = container.querySelector<HTMLElement>('.inbox-notifications-item-time')!.getBoundingClientRect();
			return {
				actionsFit: actions.right <= header.right,
				dateAtRight: date.right <= header.right && date.right > header.left,
			};
		});
		const previews = hovers.filter(hover => hover.target.textContent === 'Open Session').map(hover => {
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
			providerRequestedForRow, metadata: container.querySelector('.inbox-notifications-row-metadata')?.textContent,
			evidenceTitles: [...container.querySelectorAll('.inbox-notifications-evidence-header h3, .inbox-notifications-notification .inbox-notifications-item-title')].map(element => element.textContent),
			title: container.querySelector('.inbox-notifications-item-title')?.textContent,
			rowDates: container.querySelectorAll('.inbox-notifications-item .inbox-notifications-item-time').length,
			collapsedControls: container.querySelector('.inbox-notifications-item .inbox-notifications-chat-part-host'),
			disclosure: container.querySelector('.inbox-notifications-latest-exchange > summary')?.textContent,
		}, {
			previews: ['Open Session'].map(button => ({
				button, title: true, response: `${'R'.repeat(600)}…`, pointer: true, nativeTitle: false,
			})), createdChats: 1, headerLayouts: Array.from({ length: 3 }, () => ({ actionsFit: true, dateAtRight: true })),
			providerRequestedForRow: false, metadata: 'owner/repo', evidenceTitles: ['Finished'],
			title: 'Finished', rowDates: 1, collapsedControls: null, disclosure: 'Show chat response',
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

	test('Working opens the latest response without an extra disclosure action', () => {
		const chat = upcastPartial<IChat>({ resource: URI.parse('test:///working') });
		const session = upcastPartial<ISession>({ sessionId: 'working', mainChat: constObservable(chat), chats: constObservable([chat]) });
		const row: IInboxSessionRow = {
			id: 'working', tab: InboxTab.Working, sessionTitle: 'Working session', occurrence: 'turn1', notifications: [], hasImages: false,
			title: 'Implementing search', description: '', kind: InboxNotificationKind.Completed, priority: InboxNotificationPriority.Later,
			sessionResource: URI.parse('test:///session'), timestamp: 1, actions: [],
		};
		const { view, container, instantiationService, chatViews, hovers } = createView(constObservable([]), { rows: constObservable([row]) });
		instantiationService.stub(ISessionsManagementService, 'getSession', () => session);
		view.render(container);
		container.querySelectorAll<HTMLElement>('[role="tab"]')[1].click();
		container.querySelector<HTMLElement>('.inbox-notifications-item')!.click();
		assert.deepStrictEqual({
			expanded: container.querySelector<HTMLDetailsElement>('.inbox-notifications-latest-exchange')?.open,
			targets: chatViews[0].bindings.map(binding => binding.chat.resource.toString()),
			evidenceComposers: container.querySelectorAll('.inbox-notifications-detail-pane textarea').length,
			announcesCompleted: container.querySelector('.inbox-notifications-item')?.getAttribute('aria-label')?.includes('Completed'),
			iconLabel: hovers.find(hover => hover.target.classList.contains('inbox-notifications-row-icon'))?.options,
			rowState: container.querySelector('.inbox-notifications-item-kind-label')?.textContent,
			evidenceLabel: container.querySelector('.inbox-notifications-detail-pane .inbox-notifications-item-kind-label')?.textContent,
		}, {
			expanded: true, targets: [chat.resource.toString()], evidenceComposers: 0, announcesCompleted: false,
			iconLabel: { content: 'Working', appearance: { showPointer: true } }, rowState: 'Working', evidenceLabel: undefined,
		});
	});

	for (const filter of ['search', 'priority'] as const) {
		test(`Escape closes evidence when ${filter} hides the selected row and restores composer focus`, () => {
			const chat = upcastPartial<IChat>({ resource: URI.parse('test:///chat') });
			const session = upcastPartial<ISession>({ sessionId: 'session', mainChat: constObservable(chat), chats: constObservable([chat]) });
			const item: IInboxNotificationItem = {
				id: 'item', kind: InboxNotificationKind.Completed, priority: InboxNotificationPriority.Later,
				title: 'Review changes', description: 'Completed work', timestamp: 1, actions: [],
				sessionResource: URI.parse('test:///session'),
			};
			const { view, container, newChatViews, instantiationService } = createView(constObservable([item]));
			instantiationService.stub(ISessionsManagementService, 'getSession', () => session);
			view.render(container);
			container.querySelector<HTMLElement>('.inbox-notifications-item')!.click();
			if (filter === 'search') {
				const search = container.querySelector<HTMLInputElement>('.inbox-notifications-search input')!;
				search.value = 'no matching session';
				search.dispatchEvent(new mainWindow.Event('input', { bubbles: true }));
			} else {
				accessView(view).setCategoryVisible('later', false);
			}
			const hidden = container.querySelectorAll('.inbox-notifications-item').length === 0;
			const evidence = container.querySelector<HTMLElement>('.inbox-notifications-detail-content')!;
			evidence.focus();
			const evidenceFocused = document.activeElement === evidence;
			const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
			evidence.dispatchEvent(escape);
			assert.deepStrictEqual({
				hidden, evidenceFocused, prevented: escape.defaultPrevented, content: view.getDetailAccessibleContent(),
				composerFocused: document.activeElement === newChatViews[0].input,
			}, { hidden: true, evidenceFocused: true, prevented: true, content: undefined, composerFocused: true });
		});
	}

	test('binds secondary notifications to their exact chat, and retains drafts for external notifications', () => {
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
		}, { disposed: false, visible: false, children: 1 });
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

	test('keeps the reply outside evidence scrolling at wide, narrow, and short sizes', () => {
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
			const beforeScroll = composer.getBoundingClientRect().top;
			const longContent = info.appendChild(document.createElement('div'));
			longContent.style.height = '900px';
			const overflows = viewport.scrollHeight > viewport.clientHeight;
			viewport.scrollTop = viewport.scrollHeight;
			const inputBounds = chatViews[0].input.getBoundingClientRect();
			const viewportBounds = container.getBoundingClientRect();
			results.push({
				stable: beforeScroll === composer.getBoundingClientRect().top, overflows, sharedViewport: composer.parentElement === viewport,
				inputReachable: inputBounds.top >= viewportBounds.top && inputBounds.bottom <= viewportBounds.bottom,
			});
			longContent.remove();
		}
		assert.deepStrictEqual(results, Array.from({ length: 3 }, () => ({
			stable: true, overflows: true, sharedViewport: false, inputReachable: true,
		})));
	});

	for (const selectsAnotherItem of [false, true]) {
		test(`an accepted request completes its originating item without clearing another selection: ${selectsAnotherItem}`, async () => {
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
			if (selectsAnotherItem) {
				container.querySelector<HTMLElement>('[data-notification-id="item1"]')!.click();
			}
			chatViews[0].submitted.fire(chats[0].resource);
			await Promise.resolve();
			assert.deepStrictEqual({
				read: markRead.args, dismiss: dismiss.args, opened: openSession.callCount, archived: archiveSession.callCount,
				inputStillOpen: chatViews[0].input.isConnected, dismissedBeforeRead: dismiss.calledBefore(markRead),
			}, { read: [[sessions[0], true]], dismiss: [['item0', items[0]]], opened: 0, archived: 0, inputStillOpen: true, dismissedBeforeRead: true });
			view.dispose();
			assert.deepStrictEqual(dismiss.args, [['item0', items[0]]]);
		});
	}

	test('selected conversation and evidence stay stable when another notification leads the row', () => {
		const main = upcastPartial<IChat>({ resource: URI.parse('test:///main') });
		const secondary = upcastPartial<IChat>({ resource: URI.parse('test:///secondary') });
		const chats = observableValue<readonly IChat[]>('chats', [main, secondary]);
		const session = upcastPartial<ISession>({ sessionId: 'session', mainChat: constObservable(main), chats });
		const item: IInboxNotificationItem = {
			id: 'session-row', kind: InboxNotificationKind.NeedsInput, priority: InboxNotificationPriority.Now,
			title: 'Question', description: 'Answer the question', timestamp: 1, actions: [],
			sessionResource: URI.parse('test:///session'), chatResource: secondary.resource,
		};
		const items = observableValue<readonly IInboxNotificationItem[]>('items', [item]);
		const secondaryModel = upcastPartial<IChatModel>({ getRequests: () => [] });
		const { view, container, instantiationService, chatViews } = createView(items, {
			chatService: { getSession: resource => resource.toString() === secondary.resource.toString() ? secondaryModel : undefined },
		});
		instantiationService.stub(ISessionsManagementService, 'getSession', () => session);
		view.render(container);
		container.querySelector<HTMLElement>('.inbox-notifications-item')!.click();
		chatViews[0].input.value = 'Reply to the secondary chat';
		items.set([{ ...item, kind: InboxNotificationKind.FailingCI, chatResource: main.resource }], undefined);
		const reordered = {
			bindings: chatViews[0].bindings.map(binding => binding.chat.resource),
			draft: chatViews[0].input.value,
			evidenceModel: accessView(view).getSessionChatModel(items.get()[0]) === secondaryModel,
		};
		chats.set([main], undefined);
		const unavailable = !!container.querySelector('.inbox-notifications-detail-chat-unavailable');
		items.set([{ ...item, kind: InboxNotificationKind.ReviewComments, chatResource: main.resource }], undefined);
		const noFallback = chatViews[0].bindings.every(binding => binding.chat !== main);
		container.querySelector<HTMLElement>('.inbox-notifications-item')!.click();
		container.querySelector<HTMLElement>('.inbox-notifications-item')!.click();
		assert.deepStrictEqual({ reordered, unavailable, noFallback, reselected: chatViews[0].bindings.at(-1)?.chat.resource }, {
			reordered: { bindings: [secondary.resource], draft: 'Reply to the secondary chat', evidenceModel: true },
			unavailable: true, noFallback: true, reselected: main.resource,
		});
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

	test('generates action titles for visible rows while recording each impression once', () => {
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
			previewRequests: ['visible'], impressions: ['agents/inboxImpression'],
		});

		observer.setIntersecting(visible, false);
		observer.setIntersecting(visible, true);
		assert.deepStrictEqual(events.filter(event => event === 'agents/inboxImpression'), ['agents/inboxImpression']);
		(visible as HTMLElement).click();
		assert.ok(previewRequests.length > 0 && previewRequests.every(id => id === 'visible'));
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
		container.querySelector<HTMLElement>('.inbox-notifications-item')!.click();
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
		const resizeObserver = createResizeObserver();
		const { view, container } = createView(constObservable([]), { resizeObserver: resizeObserver.ctor });
		view.render(container);
		const observer = resizeObserver.instance;
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
		container.querySelector<HTMLElement>('[data-notification-id="first"]')!.click();
		const first = scopes.at(-1)!;
		ChatContextKeys.inChatQuestionCarousel.bindTo(first).set(true);
		ChatContextKeys.chatQuestionCarouselHasTerminal.bindTo(first).set(true);
		const firstQuestion = first.getContextKeyValue(ChatContextKeys.inChatQuestionCarousel.key);
		const firstTerminal = first.getContextKeyValue(ChatContextKeys.chatQuestionCarouselHasTerminal.key);
		container.querySelector<HTMLElement>('[data-notification-id="second"]')!.click();
		const second = scopes.at(-1)!;
		ChatContextKeys.inChatQuestionCarousel.bindTo(second).reset();
		assert.deepStrictEqual({
			scopedDeduplication: createInstance.getCalls().some(call => call.args[0] === ChatQuestionCarouselPart && match({ hideDuplicateDetailedMessage: true }).test(call.args[3])),
			windowQuestion: contextKeyService.getContextKeyValue(ChatContextKeys.inChatQuestionCarousel.key),
			windowTerminal: contextKeyService.getContextKeyValue(ChatContextKeys.chatQuestionCarouselHasTerminal.key),
			firstQuestion,
			firstTerminal,
			secondQuestion: second.getContextKeyValue(ChatContextKeys.inChatQuestionCarousel.key),
		}, {
			scopedDeduplication: true,
			windowQuestion: undefined, windowTerminal: undefined,
			firstQuestion: true, firstTerminal: true, secondQuestion: false,
		});
	});

	test('the trailing Done action names the whole session', () => {
		const { view, container } = createView(constObservable([{
			id: 'done', kind: InboxNotificationKind.Completed, priority: InboxNotificationPriority.Later,
			title: 'Finished', description: 'Finished', timestamp: 1,
			actions: [{ id: 'done', label: '$(check)', ariaLabel: 'Mark Session as Done', kind: InboxNotificationActionKind.MarkDone }],
		}]));
		view.render(container);
		const button = container.querySelector<HTMLElement>('.inbox-notifications-row-actions .monaco-button:last-child')!;
		assert.deepStrictEqual({
			label: button.getAttribute('aria-label'),
			nativeTitle: button.getAttribute('title'),
		}, { label: 'Mark Session as Done for Finished', nativeTitle: null });
	});

	test('evidence offers session Done and a labeled close button without notification dismissal', async () => {
		const item: IInboxNotificationItem = {
			id: 'notification', kind: InboxNotificationKind.Completed, priority: InboxNotificationPriority.Later,
			title: 'Review changes', description: '', timestamp: 1,
			actions: [{ id: 'dismiss', label: 'Dismiss Notification', kind: InboxNotificationActionKind.Dismiss }],
		};
		const row: IInboxSessionRow = {
			...item, id: 'session', tab: InboxTab.ReadyForYou, sessionTitle: 'Search', occurrence: 'turn1', notifications: [item], hasImages: false,
		};
		const rows = observableValue<readonly IInboxSessionRow[]>('rows', [row]);
		const { view, container, instantiationService } = createView(constObservable([item]), { rows });
		const done = spy();
		const dismiss = spy();
		const titles = spy(Button.prototype, 'setTitle');
		disposables.add(toDisposable(() => titles.restore()));
		instantiationService.stub(IInboxNotificationsService, 'markSessionDone', done);
		instantiationService.stub(IInboxNotificationsService, 'dismissNotification', dismiss);
		view.render(container);
		container.querySelector<HTMLElement>('.inbox-notifications-item')!.click();
		const action = Array.from(container.querySelectorAll<HTMLElement>('.inbox-notifications-evidence-header .monaco-button'))
			.find(button => button.textContent === 'Mark Session as Done')!;
		const close = container.querySelector<HTMLElement>('.inbox-notifications-evidence-header [aria-label="Close Evidence"]')!;
		action.focus();
		action.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		await Promise.resolve();
		const result = {
			done: done.args, dismiss: dismiss.args,
			emptyDescriptionHidden: container.querySelector<HTMLElement>('.inbox-notifications-item-description')?.hidden,
			hasDismiss: container.querySelector('.inbox-notifications-detail-pane')?.textContent?.includes('Dismiss Notification'),
			closeTooltip: titles.getCalls().some(call => call.thisValue.element === close && call.args[0] === 'Close Evidence'),
			nativeTitle: close.getAttribute('title'),
		};
		rows.set([{ ...row, tab: InboxTab.Done }], undefined);
		container.querySelectorAll<HTMLElement>('[role="tab"]')[4].click();
		container.querySelector<HTMLElement>('.inbox-notifications-item')!.click();
		assert.deepStrictEqual({
			...result,
			offersDoneAgain: Array.from(container.querySelectorAll('.inbox-notifications-evidence-header .monaco-button'))
				.some(button => button.textContent === 'Mark Session as Done'),
		}, { done: [[row]], dismiss: [], emptyDescriptionHidden: true, hasDismiss: false, closeTooltip: true, nativeTitle: null, offersDoneAgain: false });
	});

	for (const reveal of ['hover', 'focus'] as const) {
		test(`Done receives pointer clicks instead of the hidden timestamp when revealed by ${reveal}`, () => {
			const item: IInboxNotificationItem = {
				id: 'done', kind: InboxNotificationKind.Completed, priority: InboxNotificationPriority.Later,
				title: 'Finished', description: '', timestamp: Date.now(), actions: [],
			};
			const { view, container, instantiationService } = createView(constObservable([item]));
			const done = spy();
			instantiationService.stub(IInboxNotificationsService, 'markSessionDone', done);
			container.style.width = '600px';
			view.render(container);
			view.layout(600, 400);
			const row = container.querySelector<HTMLElement>('.inbox-notifications-item')!;
			if (reveal === 'hover') {
				row.classList.add('hovered');
			} else {
				row.focus();
			}
			const button = row.querySelector<HTMLElement>('.inbox-notifications-row-actions .monaco-button:last-child')!;
			const bounds = button.getBoundingClientRect();
			const target = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
			target?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			assert.deepStrictEqual({
				hitButton: button.contains(target),
				completed: done.getCalls().map(call => call.args[0].id),
				selected: row.classList.contains('selected'),
			}, { hitButton: true, completed: ['done'], selected: false });
		});
	}

	test('Done clears the selected interpretation even when the notification moves to Completed', async () => {
		const item: IInboxNotificationItem = {
			id: 'item', kind: InboxNotificationKind.Completed, priority: InboxNotificationPriority.Later,
			title: 'Finished', description: 'Finished', timestamp: 1,
			actions: [{ id: 'done', label: 'Done', kind: InboxNotificationActionKind.MarkDone }],
		};
		const active = observableValue<readonly IInboxNotificationItem[]>('active', [item]);
		const dismissed = observableValue<readonly IInboxNotificationItem[]>('dismissed', []);
		const summaries = observableValue<ReadonlyMap<string, IInboxDetailSummary>>('summaries', new Map([
			[item.id, { status: 'Old interpretation', decisions: [], evidence: [] }],
		]));
		const { view, container, instantiationService } = createView(active, { dismissed, detailSummaries: summaries });
		instantiationService.stub(IInboxNotificationsService, 'markSessionDone', () => {
			transaction(tx => {
				active.set([], tx);
				dismissed.set([item], tx);
			});
		});
		view.render(container);
		container.querySelector<HTMLElement>('.inbox-notifications-item')!.click();
		const before = view.getDetailAccessibleContent()?.includes('Old interpretation');
		container.querySelector<HTMLElement>('.inbox-notifications-row-actions .monaco-button:last-child')!.click();
		await Promise.resolve();
		summaries.set(new Map([[item.id, { status: 'Late interpretation', decisions: [], evidence: [] }]]), undefined);
		assert.deepStrictEqual({
			before,
			interpretation: container.querySelector('.inbox-notifications-detail-evidence'),
			accessible: view.getDetailAccessibleContent(),
			completed: dismissed.get().map(item => item.id),
		}, { before: true, interpretation: null, accessible: undefined, completed: ['item'] });
	});

	for (const kind of [
		InboxNotificationActionKind.OpenSession, InboxNotificationActionKind.MarkDone, InboxNotificationActionKind.Dismiss,
		InboxNotificationActionKind.AgentMergeFixCI, InboxNotificationActionKind.AgentMergeAddressReviews, InboxNotificationActionKind.AgentMergeMergePullRequest,
		InboxNotificationActionKind.ArchiveSession, InboxNotificationActionKind.DeleteSession, InboxNotificationActionKind.Command,
	]) {
		test(`successful ${kind} dismisses only the addressed notification without resetting an unchanged row`, async () => {
			const chat = upcastPartial<IChat>({ resource: URI.parse('test:///chat') });
			const session = upcastPartial<ISession>({ sessionId: 'session', providerId: 'provider', resource: URI.parse('test:///session'), mainChat: constObservable(chat), chats: constObservable([chat]) });
			const action = { id: kind, kind, label: kind, commandId: 'test.command' };
			const item: IInboxNotificationItem = {
				id: 'item', kind: InboxNotificationKind.Completed, priority: InboxNotificationPriority.Later,
				title: 'Finished', description: 'Summary', timestamp: 1, actions: [action], sessionResource: session.resource,
			};
			const { view, container, instantiationService, chatViews } = createView(constObservable([item]));
			instantiationService.stub(ISessionsManagementService, 'getSession', () => session);
			instantiationService.stub(ISessionsService, 'openSession', async () => { });
			instantiationService.stub(ICommandService, 'executeCommand', async () => undefined);
			stub(accessView(view), 'runInboxPullRequestAction').resolves('success');
			stub(accessView(view), 'runMergedSessionCleanupAction').resolves('success');
			const dismiss = spy();
			const done = spy();
			const markRead = spy(async () => { });
			instantiationService.stub(IInboxNotificationsService, 'dismissNotification', dismiss);
			instantiationService.stub(IInboxNotificationsService, 'markSessionDone', done);
			instantiationService.stub(ISessionsManagementService, 'setSessionReadState', markRead);
			view.render(container);
			container.querySelector<HTMLElement>('.inbox-notifications-item')!.click();
			await accessView(view).runAction(item, action);
			const dismisses = kind !== InboxNotificationActionKind.OpenSession && kind !== InboxNotificationActionKind.MarkDone;
			assert.deepStrictEqual({
				dismissed: dismiss.args, read: markRead.args, replyDisposed: chatViews[0].disposed,
				selected: !!container.querySelector('.inbox-notifications-item.selected'), done: done.callCount,
			}, {
				dismissed: dismisses ? [[item.id, item]] : [], read: dismisses && kind !== InboxNotificationActionKind.Dismiss ? [[session, true]] : [], replyDisposed: false, selected: true,
				done: kind === InboxNotificationActionKind.MarkDone ? 1 : 0
			});
		});
	}

	for (const result of ['failure', 'skipped'] as const) {
		test(`unsuccessful actions keep the item and selected evidence pending: ${result}`, async () => {
			const action = { id: 'fix', kind: InboxNotificationActionKind.AgentMergeFixCI, label: 'Fix CI' };
			const item: IInboxNotificationItem = {
				id: 'item', kind: InboxNotificationKind.Completed, priority: InboxNotificationPriority.Later,
				title: 'Finished', description: 'Summary', timestamp: 1, actions: [action],
			};
			const { view, container, instantiationService } = createView(constObservable([item]));
			stub(accessView(view), 'runInboxPullRequestAction').resolves(result);
			instantiationService.stub(INotificationService, 'error', () => { });
			const dismiss = spy();
			instantiationService.stub(IInboxNotificationsService, 'dismissNotification', dismiss);
			view.render(container);
			container.querySelector<HTMLElement>('.inbox-notifications-item')!.click();
			const before = view.getDetailAccessibleContent();
			await accessView(view).runAction(item, action);
			assert.deepStrictEqual({ dismissed: dismiss.callCount, evidence: view.getDetailAccessibleContent() }, { dismissed: 0, evidence: before });
		});
	}

	test('a completed background action does not clear a newer selection', async () => {
		const action = { id: 'run', kind: InboxNotificationActionKind.Command, label: 'Run', commandId: 'test.command' };
		const items: IInboxNotificationItem[] = ['first', 'second'].map(id => ({
			id, kind: InboxNotificationKind.Completed, priority: InboxNotificationPriority.Later,
			title: id, description: id, timestamp: 1, actions: [action],
		}));
		const { view, container, instantiationService } = createView(constObservable(items));
		const completion = new DeferredPromise<void>();
		instantiationService.stub(ICommandService, 'executeCommand', () => completion.p);
		const dismiss = spy();
		instantiationService.stub(IInboxNotificationsService, 'dismissNotification', dismiss);
		view.render(container);
		container.querySelector<HTMLElement>('[data-notification-id="first"]')!.click();
		const running = accessView(view).runAction(items[0], action);
		container.querySelector<HTMLElement>('[data-notification-id="second"]')!.click();
		const selected = view.getDetailAccessibleContent();
		await completion.complete();
		await running;
		assert.deepStrictEqual({ dismissed: dismiss.args, evidence: view.getDetailAccessibleContent() }, { dismissed: [['first', items[0]]], evidence: selected });
	});

	for (const kind of ['questionCarousel', 'confirmation', 'toolConfirmation'] as const) {
		for (const succeeds of [true, false]) {
			test(`inline ${kind} completes only on success and clears stale evidence: ${succeeds}`, async () => {
				const chatResource = URI.parse('test:///chat');
				const item: IInboxNotificationItem = {
					id: 'item', kind: InboxNotificationKind.Completed, priority: InboxNotificationPriority.Later,
					title: 'Pending input', description: 'Summary', timestamp: 1, actions: [],
				};
				const carousel = new ChatQuestionCarouselData([], true, 'resolve');
				const confirmation = upcastPartial<IChatConfirmation>({ kind: 'confirmation', data: {}, isUsed: false });
				const tool = upcastPartial<IChatToolInvocation>({
					kind: 'toolInvocation', toolCallId: 'tool',
					state: constObservable(upcastPartial<IChatToolInvocation.State>({ type: IChatToolInvocation.StateKind.WaitingForConfirmation })),
				});
				const confirm = stub(IChatToolInvocation, 'confirmWith').returns(succeeds);
				disposables.add(toDisposable(() => confirm.restore()));
				const model = upcastPartial<IChatModel>({
					getRequests: () => [upcastPartial<IChatRequestModel>({
						response: upcastPartial<IChatResponseModel>({
							requestId: 'request', response: upcastPartial<IChatResponseModel['response']>({ value: [carousel, confirmation, tool] }),
						}),
					})],
				});
				const summaries = observableValue<ReadonlyMap<string, IInboxDetailSummary>>('summaries', new Map([[item.id, { status: 'Old interpretation', decisions: [], evidence: [] }]]));
				const { view, container, instantiationService } = createView(constObservable([item]), {
					detailSummaries: summaries, chatService: {
						getSession: () => kind === 'questionCarousel' && !succeeds ? undefined : model,
						sendRequest: async () => succeeds ? upcastPartial<ChatSendResult>({ kind: 'sent' }) : { kind: 'rejected', reason: 'Failed dispatch' },
						notifyQuestionCarouselAnswer: () => { },
					},
				});
				const dismiss = spy();
				instantiationService.stub(IInboxNotificationsService, 'dismissNotification', dismiss);
				instantiationService.stub(INotificationService, 'error', () => { });
				view.render(container);
				container.querySelector<HTMLElement>('.inbox-notifications-item')!.click();
				if (kind === 'questionCarousel') {
					await accessView(view).submitQuestionCarouselPart(item, { kind, chatResource, requestId: 'request', resolveId: 'resolve', questions: [], allowSkip: true }, new Map());
				} else if (kind === 'confirmation') {
					await accessView(view).submitConfirmationPart(item, { kind, chatResource, requestId: 'request', data: confirmation.data, title: 'Continue?', message: '' }, 'Yes', 0);
				} else {
					await accessView(view).submitToolConfirmationPart(item, {
						kind, chatResource, requestId: 'request', toolCallId: 'tool', confirmationKind: 'execution', title: 'Run?', message: '',
						buttons: [{ label: 'Allow', kind: 'approve', useUserActionReason: true }],
					}, 0);
				}
				summaries.set(new Map([[item.id, { status: 'Late interpretation', decisions: [], evidence: [] }]]), undefined);
				assert.deepStrictEqual({
					dismissed: dismiss.args, evidence: view.getDetailAccessibleContent()?.includes('Late interpretation'),
				}, { dismissed: succeeds ? [[item.id, item]] : [], evidence: true });
			});
		}
	}

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
		container.querySelector<HTMLElement>('.inbox-notifications-row-actions .monaco-button:last-child')!.click();
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
		container.querySelector<HTMLElement>('.inbox-notifications-item')!.click();
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

	test('reuses unchanged row controls and preserves action and tab focus', () => {
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
		const header = container.querySelector<HTMLElement>('[role="tab"]')!;
		header.focus();
		items.set([{ ...item }], undefined);
		assert.strictEqual(document.activeElement?.id, header.id);
	});

	test('updates other rows without detaching an unchanged row or the tabs', () => {
		const item: IInboxNotificationItem = {
			id: 'stable', kind: InboxNotificationKind.External, priority: InboxNotificationPriority.Next,
			title: 'Task', description: 'Description', timestamp: 1,
			actions: [{ id: 'open', label: 'Open Session', kind: InboxNotificationActionKind.OpenSession }],
		};
		const items = observableValue<readonly IInboxNotificationItem[]>('items', [item, { ...item, id: 'changing' }]);
		const { view, container } = createView(items);
		view.render(container);
		const card = container.querySelector<HTMLElement>('[data-notification-id="stable"]')!;
		const header = container.querySelector<HTMLElement>('[role="tablist"]')!;
		const observer = new mainWindow.MutationObserver(() => { });
		disposables.add({ dispose: () => observer.disconnect() });
		observer.observe(container, { childList: true, subtree: true });
		card.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		items.set([{ ...item }, { ...item, id: 'changing', title: 'Updated' }], undefined);
		const detached = observer.takeRecords().flatMap(record => Array.from(record.removedNodes))
			.some(node => node === card || node.contains(card) || node === header || node.contains(header));
		card.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
		assert.deepStrictEqual({ detached, sameHeader: container.querySelector('[role="tablist"]') === header }, {
			detached: false, sameHeader: true,
		});
	});

	test('workflow tabs expose exclusive counts, keyboard navigation, and reset selection', async () => {
		const items: IInboxNotificationItem[] = [InboxNotificationPriority.Now, InboxNotificationPriority.Next].map((priority, index) => ({
			id: `item-${index}`, kind: InboxNotificationKind.External, priority, title: 'Task', description: '', timestamp: 1, actions: [],
		}));
		const rows = items.map((item, index): IInboxSessionRow => ({
			...item, sessionTitle: item.title, occurrence: item.id, notifications: [item], hasImages: index === 0,
			tab: index === 0 ? InboxTab.ReadyForYou : InboxTab.Working,
		}));
		const { view, container, newChatViews } = createView(constObservable(items), { rows: constObservable(rows) });
		view.render(container);
		await view.openNewSession();
		container.querySelector<HTMLElement>('[data-notification-id="item-0"]')!.click();
		const tabs = [...container.querySelectorAll<HTMLElement>('[role="tab"]')];
		const visual = container.querySelector('.inbox-notifications-visual')?.textContent;
		tabs[0].focus();
		tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
		const working = [...container.querySelectorAll<HTMLElement>('.inbox-notifications-item')].map(row => row.dataset.notificationId);
		tabs[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
		const done = container.querySelectorAll('.inbox-notifications-item').length;
		tabs[4].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
		assert.deepStrictEqual({
			labels: tabs.map(tab => tab.textContent),
			visual, working, done, focused: document.activeElement === tabs[0],
			selected: Array.from(container.querySelectorAll<HTMLElement>('.inbox-notifications-item.selected')).map(card => card.dataset.notificationId),
			composers: newChatViews.length,
		}, {
			labels: ['Ready for you 1', 'Working 1', 'Ready to merge 0', 'On hold 0', 'Done 0'],
			visual: 'Visual', working: ['item-1'], done: 0, focused: true, selected: [], composers: 1
		});
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
		container.querySelector<HTMLElement>('.inbox-notifications-item')!.click();
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

	for (const count of [1, 3, 4, 7]) {
		test(`pull request evidence collapses past three entries (${count}) with interpretation above it`, () => {
			const summaries = observableValue<ReadonlyMap<string, IInboxDetailSummary>>('summaries', new Map());
			const item: IInboxNotificationItem = {
				id: 'merged', kind: InboxNotificationKind.PullRequestMerged, priority: InboxNotificationPriority.Next,
				title: `${count} Pull Requests Merged`, description: 'Merged', timestamp: 1, actions: [],
				sessionResource: URI.parse('test:///session'),
				pullRequestStates: Array.from({ length: count }, (_, index) => ({
					label: `${'Long pull request title '.repeat(8)}#${index + 1}`,
					repositoryLabel: 'owner/repo', statusLabel: 'Merged', icon: Codicon.gitMerge,
					pullRequestUri: URI.parse(`https://github.com/owner/repo/pull/${index + 1}`),
				})),
			};
			const { view, container, instantiationService } = createView(constObservable([item]), { detailSummaries: summaries });
			const requested: string[] = [];
			const opened: URI[] = [];
			instantiationService.stub(IInboxNotificationsService, 'requestDetailSummary', (item: IInboxNotificationItem) => requested.push(item.id));
			instantiationService.stub(IOpenerService, 'open', async (uri: URI | string) => { opened.push(typeof uri === 'string' ? URI.parse(uri) : uri); return true; });
			container.style.width = '560px';
			view.render(container);
			view.layout(560, 400);
			container.querySelector<HTMLElement>('.inbox-notifications-item')!.click();
			const detail = container.querySelector<HTMLElement>('.inbox-notifications-detail-body')!;
			const disclosure = detail.querySelector<HTMLDetailsElement>('details.inbox-evidence-disclosure');
			const initiallyCollapsed = disclosure ? !disclosure.open : false;
			summaries.set(new Map([[item.id, { status: 'Registered existing PRs as test artifacts without merging them.', decisions: [], evidence: [] }]]), undefined);
			disclosure?.querySelector('summary')!.click();
			const links = [...detail.querySelectorAll<HTMLElement>('.inbox-notifications-detail-pr .monaco-button')];
			links[0].click();
			assert.deepStrictEqual({
				initiallyCollapsed, expanded: disclosure?.open, count: links.length, requested,
				first: detail.firstElementChild?.classList.contains('inbox-notifications-evidence-header'),
				interpretationVisible: detail.querySelector<HTMLElement>('.inbox-notifications-detail-evidence')?.hidden,
				allFit: links.every(link => link.getBoundingClientRect().right <= detail.getBoundingClientRect().right + 1),
				opened: opened.map(uri => uri.path),
				accessible: item.pullRequestStates!.every(state => view.getDetailAccessibleContent()?.includes(state.pullRequestUri!.toString(true))),
			}, {
				initiallyCollapsed: count > 3, expanded: count > 3 ? true : undefined, count, requested: ['merged'],
				first: true, interpretationVisible: false, allFit: true, opened: ['/owner/repo/pull/1'], accessible: true,
			});
		});
	}

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
			afterHeader: !!details.parentElement?.querySelector('.inbox-notifications-evidence-header'),
			disclosure: details.matches('details') || !!details.querySelector('summary'),
			heading: details.querySelector('h3')?.textContent,
			accessibleLabel: details.getAttribute('aria-label'),
			onCard: card.textContent?.includes('Generated preview'),
			cardLabel: card.getAttribute('aria-label')?.includes('Generated preview'),
			inDetail: details.textContent?.includes('Generated preview'),
			accessible: view.getDetailAccessibleContent()?.includes('Generated preview'),
			disclaimer: /Generated from the conversation|Claims are not independent verification/.test(`${details.textContent}\n${view.getDetailAccessibleContent()}`),
		}, { fallbackHidden: true, hidden: false, afterHeader: true, disclosure: false, heading: undefined, accessibleLabel: 'Agent interpretation', onCard: true, cardLabel: true, inDetail: true, accessible: true, disclaimer: false });
		summaries.set(new Map([['item', { status: 'Richer interpretation', decisions: [], evidence: [] }]]), undefined);
		assert.deepStrictEqual({
			hidden: details.hidden, replaced: details.textContent?.includes('Richer interpretation'),
			duplicated: details.textContent?.includes('Generated preview'),
		}, { hidden: false, replaced: true, duplicated: false });
	});

	test('row set membership is computed within the selected workflow tab', () => {
		const { view, container } = createView(constObservable([
			{ id: 'now', kind: InboxNotificationKind.External, priority: InboxNotificationPriority.Now, title: 'Now', description: '', timestamp: 1, actions: [] },
			{ id: 'next', kind: InboxNotificationKind.External, priority: InboxNotificationPriority.Next, title: 'Next', description: '', timestamp: 1, actions: [] },
		]));
		view.render(container);
		assert.deepStrictEqual(Array.from(container.querySelectorAll('.inbox-notifications-item')).map(card => [
			card.getAttribute('aria-posinset'), card.getAttribute('aria-setsize'),
		]), [['1', '2'], ['2', '2']]);
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
		container.querySelector<HTMLElement>('.inbox-notifications-item')!.click();
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

	test('question cards retain native chrome and keep the prompt inside the card', () => {
		const message = 'What kind of weather do you enjoy most?';
		const carousel = new ChatQuestionCarouselData([
			{ id: 'weather', type: 'text', title: 'Your favorite weather', detailedMessage: 'For example, sunny and warm, cool and breezy, or snowy.' },
		], true, 'weather', undefined, false, message);
		const item: IInboxNotificationItem = {
			id: 'weather', kind: InboxNotificationKind.NeedsInput, priority: InboxNotificationPriority.Now,
			title: 'Choose your favorite weather', description: message, timestamp: 1, actions: [],
			needsInputPart: { ...carousel, chatResource: URI.parse('test:///chat'), requestId: 'request' },
		};
		const { view, container, instantiationService } = createView(constObservable([item]));
		const chatInstantiationService = workbenchInstantiationService(undefined, disposables);
		const widget = disposables.add(chatInstantiationService.createInstance(ChatQuestionCarouselPart, carousel, undefined, { onSubmit: () => { }, shouldAutoFocus: false }));
		instantiationService.stubInstance(ChatQuestionCarouselPart, widget);
		container.style.setProperty('--vscode-cornerRadius-large', '8px');
		container.style.setProperty('--vscode-strokeThickness', '1px');
		container.style.setProperty('--vscode-chat-requestBorder', 'red');
		container.style.setProperty('--vscode-spacing-size80', '8px');
		container.style.setProperty('--vscode-spacing-size160', '16px');
		view.render(container);
		container.querySelector<HTMLElement>('.inbox-notifications-item')!.click();
		const host = container.querySelector<HTMLElement>('.inbox-notifications-chat-part-host')!;
		const cardStyle = mainWindow.getComputedStyle(widget.domNode);
		const headerStyle = mainWindow.getComputedStyle(widget.domNode.querySelector('.chat-card-header')!);
		assert.deepStrictEqual({
			messageCount: container.textContent?.split(message).length,
			promptInCard: widget.domNode.textContent?.includes(message),
			radius: cardStyle.borderRadius,
			border: cardStyle.borderTopStyle,
			headerPadding: headerStyle.paddingLeft,
			headerBorder: headerStyle.borderBottomStyle,
			fits: widget.domNode.getBoundingClientRect().right <= host.getBoundingClientRect().right + 1,
		}, { messageCount: 2, promptInCard: true, radius: '8px', border: 'solid', headerPadding: '16px', headerBorder: 'solid', fits: true });
	});

	test('tool cards group approval scopes in the native dropdown and keep Explain non-approving', async () => {
		const part: IInboxNotificationToolConfirmationPart = {
			kind: 'toolConfirmation', chatResource: URI.parse('test:///secondary-chat'), requestId: 'request', toolCallId: 'tool',
			confirmationKind: 'execution', title: 'Run in terminal: Print numbers 1 through 30', message: 'Print numbers 1 through 30',
			commandLine: 'seq 1 30', commandLanguage: 'sh',
			buttons: [
				{ id: 'once', label: 'Allow Once', kind: 'approve', useUserActionReason: true },
				{ id: 'skip', label: 'Skip', kind: 'deny', useUserActionReason: true },
				{ id: 'session', label: 'Allow in Session', kind: 'approve', group: 0, useUserActionReason: true },
				{ id: 'always', label: 'Always Allow', kind: 'approve', group: 1, useUserActionReason: true },
			],
		};
		const item: IInboxNotificationItem = { id: 'tool', kind: InboxNotificationKind.NeedsInput, priority: InboxNotificationPriority.Now, title: 'Task', description: '', timestamp: 1, actions: [], needsInputPart: part };
		const { view, container, instantiationService } = createView(constObservable([item]));
		const submit = stub(accessView(view), 'submitToolConfirmationPart').resolves();
		disposables.add(toDisposable(() => submit.restore()));
		const explain = spy(async () => { });
		instantiationService.stub(IChatSideChatService, { canAskInSideChat: () => true, askInSideChat: explain });
		let menuActions: readonly IAction[] = [];
		instantiationService.stub(IContextMenuService, {
			showContextMenu: delegate => {
				assert.ok(delegate.getActions);
				menuActions = delegate.getActions();
			},
		});
		instantiationService.stub(IMarkdownRendererService, 'render', (markdown: IMarkdownString) => {
			const element = mainWindow.document.createElement('span');
			element.textContent = markdown.value;
			return { element, dispose: () => { } };
		});
		container.style.setProperty('--vscode-cornerRadius-medium', '6px');
		container.style.setProperty('--vscode-chat-requestBorder', 'red');
		view.render(container);
		container.querySelector<HTMLElement>('.inbox-notifications-item')!.click();
		const host = container.querySelector<HTMLElement>('.inbox-notifications-chat-part-host')!;
		const buttons = [...host.querySelectorAll<HTMLElement>('.monaco-button')];
		const explainButton = buttons.find(button => button.textContent === 'Explain')!;
		explainButton.click();
		await timeout(0);
		const submissionsAfterExplain = submit.callCount;
		host.querySelector<HTMLElement>('.monaco-dropdown-button')!.click();
		await menuActions.find(action => action.label === 'Allow in Session')!.run();
		await timeout(0);
		const cardStyle = mainWindow.getComputedStyle(host.querySelector('.chat-confirmation-widget2')!);
		assert.deepStrictEqual({
			labels: buttons.map(button => button.textContent).filter(Boolean),
			menu: menuActions.map(action => action.label),
			submissionsAfterExplain,
			submittedIndex: submit.firstCall.args[2],
			submittedId: part.buttons[submit.firstCall.args[2]].id,
			explanation: explain.firstCall.args,
			titleCount: host.textContent?.split(part.message as string).length,
			codeLanguage: host.textContent?.includes('```sh\nseq 1 30'),
			radius: cardStyle.borderRadius,
			border: cardStyle.borderTopStyle,
		}, {
			labels: ['Allow Once', 'Skip', 'Explain'],
			menu: ['', 'Allow in Session', '', 'Always Allow'],
			submissionsAfterExplain: 0, submittedIndex: 2, submittedId: 'session',
			explanation: [part.chatResource, 'Explain what this terminal command will do.', { text: part.commandLine }, { sourceTurnId: part.requestId }],
			titleCount: 2, codeLanguage: true, radius: '6px', border: 'solid',
		});
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
		container.querySelector<HTMLElement>('.inbox-notifications-item')!.click();
		const terminal = container.querySelector<HTMLElement>('.inbox-notifications-chat-part-host')!;
		const displayed = [part.commandLine, part.disclaimer, part.originMessage].every(text => terminal.textContent?.includes(String(text)));
		items.set([{ ...item, needsInputPart: { ...part, confirmationKind: 'result', buttons: [] } }], undefined);
		assert.deepStrictEqual({
			displayed,
			buttons: container.querySelectorAll('.inbox-notifications-chat-part-host .monaco-button').length,
			guidance: container.textContent?.includes('Open the session to review the full request and respond.'),
		}, { displayed: true, buttons: 0, guidance: true });
	});

	test('read-only tool approvals display the full input, avoid duplicate headings, and identify approvals', () => {
		const toolInput = JSON.stringify({ input: 'echo test' }, null, 1);
		const part: IInboxNotificationToolConfirmationPart = {
			kind: 'toolConfirmation', chatResource: URI.parse('test:///chat'), requestId: 'request', toolCallId: 'tool',
			confirmationKind: 'execution', title: 'Run a test command', message: 'Run a test command', toolInput,
			buttons: [{ label: 'Allow Once', kind: 'approve', useUserActionReason: true }, { label: 'Skip', kind: 'deny' }],
		};
		const item: IInboxNotificationItem = {
			id: 'tool', kind: InboxNotificationKind.NeedsInput, priority: InboxNotificationPriority.Now,
			title: 'Task', description: '', timestamp: 1, actions: [], needsInputPart: part,
		};
		const { view, container, instantiationService } = createView(constObservable([item]));
		instantiationService.stub(IMarkdownRendererService, 'render', (markdown: IMarkdownString) => {
			const element = mainWindow.document.createElement('span');
			element.textContent = markdown.value;
			return { element, dispose: () => { } };
		});
		view.render(container);
		container.querySelector<HTMLElement>('.inbox-notifications-item')!.click();
		const host = container.querySelector<HTMLElement>('.inbox-notifications-chat-part-host')!;
		assert.deepStrictEqual({
			titleCount: host.textContent?.split('Run a test command').length,
			input: host.textContent?.includes(toolInput),
			buttons: [...host.querySelectorAll('.monaco-button')].map(button => button.textContent),
			accessibleInput: view.getDetailAccessibleContent()?.includes(toolInput),
			approvalIcon: !!container.querySelector('.inbox-notifications-item > .codicon-shield'),
		}, { titleCount: 2, input: true, buttons: ['Allow Once', 'Skip'], accessibleInput: true, approvalIcon: true });
	});

	test('read-only tool approval rejects changed input and undisplayed parameters', async () => {
		const { view, instantiationService } = createView(constObservable([]));
		const confirm = stub(IChatToolInvocation, 'confirmWith').returns(true);
		disposables.add({ dispose: () => confirm.restore() });
		const notifyError = spy();
		instantiationService.stub(INotificationService, 'error', notifyError);
		const toolSpecificData = { kind: 'input' as const, rawInput: { input: 'echo test' }, editable: false };
		const state = observableValue('approvalState', upcastPartial<IChatToolInvocation.State>({ type: IChatToolInvocation.StateKind.WaitingForConfirmation }));
		const invocation = upcastPartial<IChatToolInvocation>({ kind: 'toolInvocation', toolCallId: 'tool', toolSpecificData, state });
		instantiationService.stub(IChatService, 'getSession', () => upcastPartial<IChatModel>({
			getRequests: () => [upcastPartial<IChatRequestModel>({
				response: upcastPartial<IChatResponseModel>({
					requestId: 'request',
					response: upcastPartial<IChatResponseModel['response']>({ value: [invocation] }),
				}),
			})],
		}));
		const item: IInboxNotificationItem = { id: 'tool', kind: InboxNotificationKind.NeedsInput, priority: InboxNotificationPriority.Now, title: 'Tool', description: '', timestamp: 1, actions: [] };
		const part: IInboxNotificationToolConfirmationPart = {
			kind: 'toolConfirmation', chatResource: URI.parse('test:///chat'), requestId: 'request', toolCallId: 'tool',
			confirmationKind: 'execution', title: 'Run a test command', message: '', toolInput: JSON.stringify(toolSpecificData.rawInput, null, 1),
			buttons: [{ label: 'Allow Once', kind: 'approve', useUserActionReason: true }],
		};
		await accessView(view).submitToolConfirmationPart(item, part, 0);
		toolSpecificData.rawInput.input = 'echo changed';
		await accessView(view).submitToolConfirmationPart(item, part, 0);
		state.set(upcastPartial<IChatToolInvocation.State>({
			type: IChatToolInvocation.StateKind.WaitingForConfirmation, parameters: { input: 'undisplayed command' },
		}), undefined);
		await accessView(view).submitToolConfirmationPart(item, { ...part, toolInput: JSON.stringify(toolSpecificData.rawInput, null, 1) }, 0);
		assert.deepStrictEqual({
			reasons: confirm.getCalls().map(call => call.args[1]),
			errors: notifyError.callCount,
		}, { reasons: [{ type: ToolConfirmKind.UserAction }], errors: 2 });
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

	for (const kind of [InboxNotificationActionKind.ArchiveSession, InboxNotificationActionKind.DeleteSession] as const) {
		for (const outcome of ['success', 'always', 'cancelled', 'failed', 'disabled', 'reducedMotion', 'hidden', 'disposed'] as const) {
			test(`Inbox cleanup confetti follows successful completion and original geometry: ${kind}, ${outcome}`, async () => {
				const session = upcastPartial<ISession>({
					resource: URI.parse('test:///session'), providerId: 'local-agent-host',
					mainChat: constObservable(upcastPartial<IChat>({ resource: URI.parse('test:///chat') })), chats: constObservable([]),
					capabilities: constObservable(upcastPartial<ISessionCapabilities>({ supportsDelete: true })),
				});
				const action = { id: kind, kind, label: kind };
				const item: IInboxNotificationItem = {
					id: 'merged', kind: InboxNotificationKind.PullRequestMerged, priority: InboxNotificationPriority.Next,
					title: 'Merged', description: '', timestamp: 1, actions: [action], sessionResource: session.resource,
				};
				const items = observableValue<readonly IInboxNotificationItem[]>('items', [item]);
				const { view, container, instantiationService } = createView(items, {
					confettiEnabled: outcome !== 'disabled', reducedMotion: outcome === 'reducedMotion',
				});
				container.classList.add('monaco-workbench');
				const completion = new DeferredPromise<void>();
				const cleanupStarted = new DeferredPromise<void>();
				const cleanup = async () => { items.set([], undefined); await cleanupStarted.complete(); await completion.p; };
				instantiationService.stub(ISessionsManagementService, 'getSession', () => session);
				instantiationService.stub(ISessionsManagementService, 'archiveSession', cleanup);
				instantiationService.stub(ISessionsManagementService, 'deleteSession', cleanup);
				instantiationService.stub(IDialogService, 'confirm', async () => ({ confirmed: outcome !== 'cancelled' }));
				instantiationService.stub(INotificationService, 'notify', () => upcastPartial<ReturnType<INotificationService['notify']>>({}));
				const notifications = spy();
				instantiationService.stub(INotificationService, 'error', notifications);
				const dismiss = spy();
				instantiationService.stub(IInboxNotificationsService, 'dismissNotification', dismiss);
				view.render(container);
				container.querySelector<HTMLElement>('.inbox-notifications-item')!.click();
				const button = container.querySelector<HTMLElement>('.inbox-notifications-item-footer-actions .monaco-button')!;
				button.style.cssText = 'position: fixed; left: 120px; top: 80px; width: 48px; height: 24px; box-sizing: border-box;';
				const previousHandler = errorHandler.getUnexpectedErrorHandler();
				const errors: Error[] = [];
				setUnexpectedErrorHandler(error => errors.push(error));
				try {
					const result = accessView(view).runAction(item, action, button, outcome === 'always' || outcome === 'cancelled');
					const before = container.querySelector('.animation-overlay');
					if (outcome !== 'cancelled') {
						await cleanupStarted.p;
					}
					if (outcome === 'hidden') {
						view.setVisible(false);
					} else if (outcome === 'disposed') {
						view.dispose();
					}
					if (outcome === 'failed') {
						await completion.error(new Error('Cleanup failed'));
					} else {
						await completion.complete();
					}
					await result;
					const overlay = container.querySelector<HTMLElement>('.animation-overlay');
					disposables.add(toDisposable(() => overlay?.remove()));
					const celebrated = outcome === 'success' || outcome === 'always';
					assert.deepStrictEqual({
						before,
						bounds: overlay && [overlay.style.left, overlay.style.top, overlay.style.width, overlay.style.height],
						particles: overlay?.querySelectorAll('.animation-confetti-particle').length ?? 0,
						buttonConnected: button.isConnected,
						errors: errors.map(error => error.message),
						notifications: notifications.callCount,
						dismissed: dismiss.args,
					}, {
						before: null, bounds: celebrated ? ['120px', '80px', '48px', '24px'] : null,
						particles: celebrated ? 24 : 0, buttonConnected: outcome === 'cancelled',
						errors: outcome === 'failed' ? ['Cleanup failed'] : [], notifications: outcome === 'failed' ? 1 : 0,
						dismissed: outcome === 'cancelled' || outcome === 'failed' ? [] : [[item.id, item]],
					});
				} finally {
					setUnexpectedErrorHandler(previousHandler);
				}
			});
		}
	}

	test('Always cleanup preserves the triggering button as the confetti origin', async () => {
		const session = upcastPartial<ISession>({
			resource: URI.parse('test:///session'), providerId: 'local-agent-host',
			mainChat: constObservable(upcastPartial<IChat>({ resource: URI.parse('test:///chat') })), chats: constObservable([]),
			capabilities: constObservable(upcastPartial<ISessionCapabilities>({ supportsDelete: true })),
		});
		const item: IInboxNotificationItem = {
			id: 'merged', kind: InboxNotificationKind.PullRequestMerged, priority: InboxNotificationPriority.Next,
			title: 'Merged', description: '', timestamp: 1, sessionResource: session.resource,
			actions: [{ id: 'archive', kind: InboxNotificationActionKind.ArchiveSession, label: 'Archive Session' }],
		};
		const { view, container, instantiationService } = createView(constObservable([item]), { confettiEnabled: true, reducedMotion: false });
		container.classList.add('monaco-workbench');
		instantiationService.stub(ISessionsManagementService, 'getSession', () => session);
		instantiationService.stub(ISessionsManagementService, 'archiveSession', async () => { });
		instantiationService.stub(IDialogService, 'confirm', async () => ({ confirmed: true }));
		instantiationService.stub(INotificationService, 'notify', () => upcastPartial<ReturnType<INotificationService['notify']>>({}));
		let menuAction: IAction | undefined;
		instantiationService.stub(IContextMenuService, 'showContextMenu', (delegate: Parameters<IContextMenuService['showContextMenu']>[0]) => { menuAction = delegate.getActions?.()[0]; });
		view.render(container);
		container.querySelector<HTMLElement>('.inbox-notifications-item')!.click();
		container.querySelector<HTMLElement>('.inbox-notifications-item-footer-actions .monaco-dropdown-button')!.click();
		assert.ok(menuAction);
		await menuAction.run();
		const overlay = container.querySelector('.animation-overlay');
		disposables.add(toDisposable(() => overlay?.remove()));
		assert.strictEqual(!!overlay, true);
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

	test('renders evidence claims without redundant session citations and preserves artifact links', () => {
		const item: IInboxNotificationItem = {
			id: 'item', kind: InboxNotificationKind.Completed, priority: InboxNotificationPriority.Later,
			title: 'Completed', description: 'Fallback', timestamp: 1, actions: [],
		};
		const uri = URI.file('/workspace/test.ts');
		const { view, container, instantiationService } = createView(constObservable([item]), {
			detailSummaries: constObservable(new Map([['item', {
				status: '', decisions: [], evidence: [
					{ text: 'Tests passed.', artifact: { kind: 'file', label: 'Test source', uri } },
					{ text: 'Reviewed the keyboard behavior.', artifact: { kind: 'session', label: 'Review changes and choose next steps' } },
					{ text: 'Updated focus handling.', artifact: { kind: 'session', label: 'Review changes and choose next steps' } },
				],
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
			claims: [...container.querySelectorAll('.inbox-notifications-interpretation-content li')].map(element => element.textContent),
			repeatedCitation: view.getDetailAccessibleContent()?.includes('Review changes and choose next steps'),
			target: open.firstCall.args[0],
			hidden: container.querySelector<HTMLElement>('.inbox-notifications-detail-evidence')?.hidden,
		}, { evidence: true, claims: ['Tests passed.Test source', 'Reviewed the keyboard behavior.', 'Updated focus handling.'], repeatedCitation: false, target: uri, hidden: false });
	});

	for (const kind of ['questionCarousel', 'toolConfirmation'] as const) {
		test(`updates a simple ${kind} action title and its evidence when interpretation arrives`, () => {
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
			}, { visible: true, card: true, detail: true, accessible: true });
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
