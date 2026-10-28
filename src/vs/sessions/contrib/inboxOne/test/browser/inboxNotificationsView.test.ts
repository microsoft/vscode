/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spy, stub } from 'sinon';
import { DomScrollableElement } from '../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Event } from '../../../../../base/common/event.js';
import { IObservable, constObservable, observableValue } from '../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
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
import { IStorageService, InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IChatQuestionAnswerValue, IChatService, IChatToolInvocation, ToolConfirmKind } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatModel, IChatRequestModel, IChatResponseModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { ChatQuestionCarouselData } from '../../../../../workbench/contrib/chat/common/model/chatProgressTypes/chatQuestionCarouselData.js';
import { ChatQuestionCarouselPart } from '../../../../../workbench/contrib/chat/browser/widget/chatContentParts/chatQuestionCarouselPart.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { URI } from '../../../../../base/common/uri.js';
import { IOnboardingScenarioService } from '../../../../../workbench/contrib/onboarding/common/onboardingScenarioService.js';
import { IAgentsActivityService } from '../../../../services/activity/browser/agentsActivityService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { IChat, ISession, ISessionArtifact, ISessionCapabilities, ISessionChangeset, ISessionChangesetOperation, SessionArtifactKind, SessionChangesetOperationScope, SessionChangesetOperationStatus } from '../../../../services/sessions/common/session.js';
import { InboxNotificationsView } from '../../browser/inboxNotificationsView.js';
import { IInboxDetailSummary, IInboxNotificationItem, IInboxNotificationsService, IInboxNotificationToolConfirmationPart, InboxNotificationActionKind, InboxNotificationKind, InboxNotificationPriority, InboxNotificationsSortMode } from '../../common/inboxNotificationsService.js';
import { IGitHubService } from '../../../github/browser/githubService.js';
import { AgentFeedbackKind, AgentFeedbackState, IAgentFeedback, IAgentFeedbackService, ISubmitFeedbackOptions } from '../../../agentFeedback/browser/agentFeedbackService.js';
import { ConfirmationOptionKind } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { GitHubPullRequestCIModel } from '../../../github/browser/models/githubPullRequestCIModel.js';
import { GitHubPullRequestModel } from '../../../github/browser/models/githubPullRequestModel.js';
import { PullRequestCheck } from '../../../../../platform/github/common/githubPullRequestService.js';

suite('InboxNotificationsView', () => {
	const disposables = new DisposableStore();
	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	function accessView(view: InboxNotificationsView) {
		return view as unknown as {
			carouselModels: ReadonlyMap<string, ChatQuestionCarouselData>;
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
		instantiationService.stub(IChatService, { getSession: () => undefined });
		instantiationService.stub(ISessionsService, {});
		instantiationService.stub(ISessionsManagementService, {});
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
		instantiationService.stub(IAgentsActivityService, {
			reportActiveSurface: () => { },
			reportSurfaceBlurred: () => { },
		});
		const view = disposables.add(instantiationService.createInstance(InboxNotificationsView, options.intersectionObserver, options.resizeObserver));
		const container = document.createElement('div');
		container.style.cssText = 'width: 900px; height: 400px';
		document.body.appendChild(container);
		disposables.add({ dispose: () => container.remove() });
		return { view, container, instantiationService };
	}

	test('requests previews and records impressions only for intersecting cards', () => {
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
		view.render(container);
		const [first, second] = scopes.slice(-2);
		ChatContextKeys.inChatQuestionCarousel.bindTo(first).set(true);
		ChatContextKeys.chatQuestionCarouselHasTerminal.bindTo(first).set(true);
		ChatContextKeys.inChatQuestionCarousel.bindTo(second).reset();
		assert.deepStrictEqual({
			windowQuestion: contextKeyService.getContextKeyValue(ChatContextKeys.inChatQuestionCarousel.key),
			windowTerminal: contextKeyService.getContextKeyValue(ChatContextKeys.chatQuestionCarouselHasTerminal.key),
			firstQuestion: first.getContextKeyValue(ChatContextKeys.inChatQuestionCarousel.key),
			firstTerminal: first.getContextKeyValue(ChatContextKeys.chatQuestionCarouselHasTerminal.key),
			secondQuestion: second.getContextKeyValue(ChatContextKeys.inChatQuestionCarousel.key),
		}, {
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

	test('preview updates are reflected in card accessible names', () => {
		const previews = observableValue<ReadonlyMap<string, string>>('previews', new Map());
		const { view, container } = createView(constObservable([{
			id: 'item', kind: InboxNotificationKind.External, priority: InboxNotificationPriority.Next,
			title: 'Task', description: 'Original', timestamp: 1, actions: [], previewSignature: 'preview',
		}]), { previews });
		view.render(container);
		previews.set(new Map([['preview', 'Generated preview']]), undefined);
		assert.ok(container.querySelector('.inbox-notifications-item')!.getAttribute('aria-label')?.endsWith('Generated preview'));
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
		const invocation = upcastPartial<IChatToolInvocation>({ kind: 'toolInvocation', toolCallId: 'tool' });
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
			kind: 'toolConfirmation', chatResource: URI.parse('test:///chat'), requestId: 'request', toolCallId: 'tool', title: 'Tool', message: '',
			buttons: [
				{ label: 'Allow Once', kind: 'approve', useUserActionReason: true },
				{ label: 'Cancel', id: 'cancel', kind: 'deny', useUserActionReason: true },
				{ label: 'Skip', kind: 'deny' },
			],
		};
		for (let index = 0; index < part.buttons.length; index++) {
			await accessView(view).submitToolConfirmationPart(item, part, index);
		}
		assert.deepStrictEqual(confirm.getCalls().map(call => call.args[1]), [
			{ type: ToolConfirmKind.UserAction },
			{ type: ToolConfirmKind.UserAction, selectedButton: 'cancel', selectedButtonKind: ConfirmationOptionKind.Deny },
			{ type: ToolConfirmKind.Skipped, source: 'user' },
		]);
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
		assert.deepStrictEqual({ evidence: container.textContent?.includes('Tests passed.'), target: open.firstCall.args[0] }, { evidence: true, target: uri });
	});

	test('conversation fallback resolves the chat containing the pending input', () => {
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
			needsInputPart: { kind: 'questionCarousel', chatResource: pendingResource, requestId: 'request', allowSkip: true, questions: [] },
		});
		assert.strictEqual(getSession.firstCall.args[0], pendingResource);
	});

	test('CI and reviews submit check details and accepted feedback in one PR-scoped request', async () => {
		const resource = URI.parse('test:///session');
		const chatResource = URI.parse('test:///chat');
		const item: IInboxNotificationItem = {
			id: 'item', kind: InboxNotificationKind.FailingCI, priority: InboxNotificationPriority.Now,
			title: 'CI', description: '', timestamp: 1, actions: [], sessionResource: resource,
		};
		const { view, instantiationService } = createView(constObservable([item]));
		const session = upcastPartial<ISession>({
			resource,
			mainChat: constObservable(upcastPartial<IChat>({ resource: chatResource })),
			workspace: constObservable(undefined),
			artifacts: constObservable([1, 2].map(number => upcastPartial<ISessionArtifact>({
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
		instantiationService.stub(IGitHubService, 'createPullRequestCIModelReference', () => ({ object: ciModel, dispose: () => { } }));
		instantiationService.stub(IAgentFeedbackService, 'getFeedback', () => [upcastPartial<IAgentFeedback>({
			id: 'review', kind: AgentFeedbackKind.PRReview, state: AgentFeedbackState.Created,
			sourcePullRequest: { owner: 'owner', repo: 'repo', number: 1 },
		})]);
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
	});

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

	test('merges through the advertised PR operation only after confirmation and revalidation', async () => {
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
		instantiationService.stub(IDialogService, 'confirm', async () => ({ confirmed: false }));
		const cancelled = await accessView(view).runInboxPullRequestAction(item, InboxNotificationActionKind.AgentMergeMergePullRequest);
		instantiationService.stub(IDialogService, 'confirm', async () => {
			operations.set([{ ...operation, status: SessionChangesetOperationStatus.Disabled }], undefined);
			return { confirmed: true };
		});
		const stale = await accessView(view).runInboxPullRequestAction(item, InboxNotificationActionKind.AgentMergeMergePullRequest);
		operations.set([operation], undefined);
		instantiationService.stub(IDialogService, 'confirm', async () => ({ confirmed: true }));
		const merged = await accessView(view).runInboxPullRequestAction(item, InboxNotificationActionKind.AgentMergeMergePullRequest);
		assert.deepStrictEqual({ cancelled, stale, merged, invocations: invoke.getCalls().map(call => call.args) }, {
			cancelled: 'skipped', stale: 'skipped', merged: 'success', invocations: [['pr-merge']],
		});
	});
});
