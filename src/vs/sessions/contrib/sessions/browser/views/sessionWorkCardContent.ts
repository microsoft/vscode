/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../media/sessionWorkCardContent.css';
import '../../../../../workbench/contrib/chat/browser/widget/media/chat.css';
import { $, AnimationFrameScheduler, DisposableResizeObserver, size } from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { equals } from '../../../../../base/common/arrays.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IReader, ObservablePromise, observableSignalFromEvent, observableValue, transaction } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { localize } from '../../../../../nls.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { scrollbarShadow } from '../../../../../platform/theme/common/colorRegistry.js';
import { ChatAccessibilityProvider } from '../../../../../workbench/contrib/chat/browser/accessibility/chatAccessibilityProvider.js';
import { ChatListWidget } from '../../../../../workbench/contrib/chat/browser/widget/chatListWidget.js';
import { getPendingChatResponseParts } from '../../../../../workbench/contrib/chat/browser/widget/chatListRenderer.js';
import { ChatContentMarkdownRenderer } from '../../../../../workbench/contrib/chat/browser/widget/chatContentMarkdownRenderer.js';
import { ChatErrorWidget } from '../../../../../workbench/contrib/chat/browser/widget/chatContentParts/chatErrorContentPart.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ChatErrorLevel, IChatModelReference, IChatService, ResponseModelState } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatAgentLocation, ChatModeKind } from '../../../../../workbench/contrib/chat/common/constants.js';
import { IChatModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { ChatPlanReviewData } from '../../../../../workbench/contrib/chat/common/model/chatProgressTypes/chatPlanReviewData.js';
import { ChatQuestionCarouselData } from '../../../../../workbench/contrib/chat/common/model/chatProgressTypes/chatQuestionCarouselData.js';
import { ChatViewModel, IChatRendererContent, isResponseVM } from '../../../../../workbench/contrib/chat/common/model/chatViewModel.js';
import { agentsPanelBackground, agentsPanelForeground } from '../../../../common/theme.js';
import { ISessionContext, SessionContext } from '../../../../services/sessions/browser/sessionContext.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { VisibleSession } from '../../../../services/sessions/browser/visibleSessions.js';
import { ChatInteractivity, IChat, ISession } from '../../../../services/sessions/common/session.js';
import { setActiveSessionContextKeys } from '../../../../services/sessions/common/sessionContextKeys.js';
import { SessionReviewSection } from '../../../../services/sessions/common/sessionReview.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';

export type SessionWorkCardContentMode = 'conversation' | 'pending';

interface IContentInput {
	readonly session: ISession;
	readonly chat: IChat;
	readonly mode: SessionWorkCardContentMode;
}

type LoadState = { readonly kind: 'idle' | 'loading' | 'ready' | 'unavailable' | 'untrusted' } | { readonly kind: 'error'; readonly message: string };

/** A lazy native transcript/input-request surface that never owns a composer or selects a session. */
export class SessionWorkCardContent extends Disposable {
	readonly element = $('.session-work-card-content.interactive-session');
	private readonly _onDidChangeHeight = this._register(new Emitter<number>());
	/** Desired content height before applying the viewport, or zero once pending input is resolved. */
	readonly onDidChangeHeight: Event<number> = this._onDidChangeHeight.event;
	private readonly heightChangeScheduler = this._register(new AnimationFrameScheduler(this.element, () => this._onDidChangeHeight.fire(this.desiredHeight)));

	private readonly input = observableValue<IContentInput | undefined>(this, undefined);
	private readonly model = observableValue<IChatModel | undefined>(this, undefined);
	private readonly loadState = observableValue<LoadState>(this, { kind: 'idle' });
	private readonly scopedSession = observableValue<IActiveSession | undefined>(this, undefined);
	private readonly sessionScope = this._register(new MutableDisposable<VisibleSession>());
	private readonly load = this._register(new MutableDisposable<DisposableStore>());
	private readonly modelReference = this._register(new MutableDisposable<IChatModelReference>());
	private readonly presentation = this._register(new DisposableStore());
	private readonly stateDisposables = this._register(new DisposableStore());
	private readonly scopedInstantiation: IInstantiationService;
	private readonly markdownRenderer: ChatContentMarkdownRenderer;
	private readonly accessibilityProvider: ChatAccessibilityProvider;
	private viewModel: ChatViewModel | undefined;
	private list: ChatListWidget | undefined;
	private stateElement: HTMLElement | undefined;
	private stateAction: Button | undefined;
	private width = 0;
	private height = 0;
	private desiredHeight = 0;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatService private readonly chatService: IChatService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ILogService private readonly logService: ILogService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		this.element.tabIndex = -1;
		this.element.setAttribute('role', 'region');
		const scopedContext = this._register(contextKeyService.createScoped(this.element));
		this.scopedInstantiation = this._register(instantiationService.createChild(new ServiceCollection(
			[IContextKeyService, scopedContext],
			[ISessionContext, new SessionContext(this.scopedSession)],
		)));
		this.markdownRenderer = this.scopedInstantiation.createInstance(ChatContentMarkdownRenderer);
		this.accessibilityProvider = this.scopedInstantiation.createInstance(ChatAccessibilityProvider);
		const readOnlyContext = ChatContextKeys.readOnly.bindTo(scopedContext);
		this._register(autorun(reader => setActiveSessionContextKeys(this.scopedSession.read(reader), scopedContext, reader)));
		this._register(autorun(reader => {
			const input = this.input.read(reader);
			this.element.setAttribute('aria-label', input?.mode === 'pending'
				? localize('sessionWorkCardContent.pendingLabel', "Input required for {0}", input.chat.title.read(reader))
				: localize('sessionWorkCardContent.conversationLabel', "Conversation: {0}", input?.chat.title.read(reader) ?? ''));
		}));
		this._register(autorun(reader => {
			const input = this.input.read(reader);
			const model = this.model.read(reader);
			const state = this.loadState.read(reader);
			const readOnly = !!input && (input.chat.interactivity.read(reader) !== ChatInteractivity.Full
				|| input.chat.isArchived.read(reader) || input.session.isArchived.read(reader) || !!model?.isReadOnly.read(reader));
			readOnlyContext.set(readOnly);
			this.presentation.clear();
			this.clearState();
			this.list = undefined;
			this.viewModel = undefined;
			this.element.replaceChildren();
			this.element.setAttribute('aria-busy', String(state.kind === 'loading'));
			if (!input) {
				this.setDesiredHeight(0);
				return;
			}
			if (state.kind === 'loading') {
				this.showState('loading', localize('sessionWorkCardContent.loading', "Loading conversation..."), input, false);
			} else if (state.kind === 'error') {
				this.showState('error', localize('sessionWorkCardContent.loadError', "Could not load this conversation: {0}", state.message), input, true);
			} else if (state.kind === 'untrusted') {
				this.showState('unavailable', localize('sessionWorkCardContent.untrusted', "Open this chat to review workspace trust before loading its conversation."), input, false);
			} else if (!model) {
				this.showState('unavailable', localize('sessionWorkCardContent.unavailable', "This conversation is not available here."), input, true);
			} else {
				try {
					this.renderModel(model, input, readOnly);
				} catch (error) {
					this.logService.error('[SessionWorkCardContent] Failed to render conversation', error);
					this.presentation.clear();
					this.list = undefined;
					this.viewModel = undefined;
					this.element.replaceChildren();
					this.showState('error', localize('sessionWorkCardContent.renderError', "Could not display this conversation: {0}", toErrorMessage(error)), input, true);
				}
			}
		}));
	}

	setInput(session: ISession, chat: IChat, mode: SessionWorkCardContentMode): void {
		if (this._store.isDisposed) {
			return;
		}
		const current = this.input.get();
		if (current?.session === session && current.chat === chat && current.mode === mode) {
			return;
		}
		const resourceChanged = !isEqual(current?.chat.resource, chat.resource);
		if (resourceChanged) {
			this.load.clear();
		}
		const input: IContentInput = { session, chat, mode };
		transaction(tx => {
			if (current?.session !== session || current.chat !== chat) {
				this.sessionScope.value = new VisibleSession(session, chat);
				this.scopedSession.set(this.sessionScope.value, tx);
			}
			if (resourceChanged) {
				this.model.set(undefined, tx);
				this.loadState.set({ kind: 'loading' }, tx);
			}
			this.input.set(input, tx);
		});
		if (resourceChanged) {
			this.modelReference.clear();
			this.startLoad(input);
		}
	}

	private startLoad(input: IContentInput): void {
		const store = new DisposableStore();
		this.load.value = store;
		const cancellation = new CancellationTokenSource();
		store.add(toDisposable(() => cancellation.dispose(true)));
		if (input.chat.interactivity.get() === ChatInteractivity.Hidden
			|| !input.session.chats.get().some(chat => isEqual(chat.resource, input.chat.resource))) {
			this.logService.warn('[SessionWorkCardContent] Refusing to load a hidden or unrelated chat');
			this.loadState.set({ kind: 'unavailable' }, undefined);
			return;
		}
		this.loadState.set({ kind: 'loading' }, undefined);
		void this.acquireModel(input, store, cancellation);
	}

	private async acquireModel(input: IContentInput, store: DisposableStore, cancellation: CancellationTokenSource): Promise<void> {
		try {
			const canOpen = await this.sessionsService.canOpenSession(input.session, { silent: true });
			if (store.isDisposed) {
				return;
			}
			if (!canOpen) {
				this.logService.trace('[SessionWorkCardContent] Waiting for an explicit workspace-trust decision', input.session.resource);
				transaction(tx => {
					this.model.set(undefined, tx);
					this.loadState.set({ kind: 'untrusted' }, tx);
				});
				this.modelReference.clear();
				return;
			}
			// The chat service shares concurrent provider resolutions and returns a reference per caller.
			const reference = await this.chatService.acquireOrLoadSession(input.chat.resource, ChatAgentLocation.Chat, cancellation.token, 'SessionWorkCardContent');
			if (store.isDisposed) {
				reference?.dispose();
				return;
			}
			if (!reference) {
				this.logService.warn('[SessionWorkCardContent] Chat model is unavailable', input.chat.resource);
				this.loadState.set({ kind: 'unavailable' }, undefined);
				return;
			}
			if (!isEqual(reference.object.sessionResource, input.chat.resource)) {
				reference.dispose();
				throw new Error(localize('sessionWorkCardContent.wrongModel', "The provider returned a different conversation."));
			}
			this.modelReference.value = reference;
			transaction(tx => {
				this.model.set(reference.object, tx);
				this.loadState.set({ kind: 'ready' }, tx);
			});
		} catch (error) {
			if (!store.isDisposed) {
				this.logService.error('[SessionWorkCardContent] Failed to load conversation', error);
				transaction(tx => {
					this.model.set(undefined, tx);
					this.loadState.set({ kind: 'error', message: toErrorMessage(error) }, tx);
				});
				this.modelReference.clear();
			}
		}
	}

	private renderModel(model: IChatModel, input: IContentInput, readOnly: boolean): void {
		const store = this.presentation;
		const viewModel = this.viewModel = store.add(this.scopedInstantiation.createInstance(ChatViewModel, model, undefined));
		const modelChanges = observableSignalFromEvent(this, viewModel.onDidChange);
		const answers = observableSignalFromEvent(this, this.chatService.onDidReceiveQuestionCarouselAnswer);
		const completions = new WeakMap<ChatQuestionCarouselData | ChatPlanReviewData, ObservablePromise<boolean>>();
		const listContainer = $('.interactive-list.session-work-card-content-list');
		this.element.appendChild(listContainer);
		const list = this.list = store.add(this.scopedInstantiation.createInstance(ChatListWidget, listContainer, {
			location: ChatAgentLocation.Chat,
			currentChatMode: () => ChatModeKind.Agent,
			rendererOptions: {
				noHeader: true,
				noFooter: true,
				editable: false,
				restorable: false,
				supportsFork: false,
				readOnly,
				renderInputControlsInline: true,
				renderPendingOnly: input.mode === 'pending',
				contentHorizontalPadding: 24,
				progressMessageAtBottomOfResponse: false,
			},
			filter: input.mode === 'pending' ? { filter: item => isResponseVM(item) && getPendingChatResponseParts(item).length > 0 } : undefined,
			styles: { listForeground: agentsPanelForeground, listBackground: agentsPanelBackground, listShadow: scrollbarShadow },
		}));
		list.setViewModel(viewModel);
		list.setVisible(true);
		list.setScrollLock(input.mode === 'conversation');
		if (input.mode === 'pending') {
			store.add(list.acquireAutoScrollHold());
		}
		store.add(list.onDidChangeContentHeight(() => this.measure()));
		store.add(Event.once(viewModel.onDidDisposeModel)(() => {
			if (!this._store.isDisposed) {
				transaction(tx => {
					this.model.set(undefined, tx);
					this.loadState.set({ kind: 'unavailable' }, tx);
				});
			}
		}));
		let hasRenderedPending = false;
		let lastRequestId: string | undefined;
		let previousPendingParts: IChatRendererContent[] = [];
		const update = (reader: IReader) => {
			modelChanges.read(reader);
			answers.read(reader);
			const lastRequest = model.lastRequestObs.read(reader);
			if (lastRequest?.id !== lastRequestId) {
				lastRequestId = lastRequest?.id;
				hasRenderedPending = false;
			}
			const pendingParts: IChatRendererContent[] = [];
			for (const item of viewModel.getItems()) {
				if (!isResponseVM(item)) {
					continue;
				}
				for (const content of item.response.value) {
					if (content instanceof ChatQuestionCarouselData || content instanceof ChatPlanReviewData) {
						let completion = completions.get(content);
						if (!completion) {
							completion = new ObservablePromise(content.completion.p.then(() => true));
							void completion.promise.catch(onUnexpectedError);
							completions.set(content, completion);
						}
						completion.promiseResult.read(reader);
					}
				}
				pendingParts.push(...getPendingChatResponseParts(item, reader));
			}
			const pendingCount = pendingParts.length;
			hasRenderedPending ||= pendingCount > 0;
			list.refresh();
			if (input.mode === 'pending' && !equals(previousPendingParts, pendingParts)) {
				list.rerender();
			}
			previousPendingParts = pendingParts;
			if (input.mode === 'pending' && pendingCount === 0) {
				listContainer.hidden = true;
				const response = lastRequest?.response;
				if (!hasRenderedPending && response?.state === ResponseModelState.NeedsInput) {
					if (!this.stateElement) {
						this.showState('unavailable', localize('sessionWorkCardContent.unsupportedInput', "Open this chat to respond to its input request."), input, false);
					}
				} else {
					this.clearState();
					this.element.dataset.state = 'empty';
					this.setDesiredHeight(0);
				}
			} else {
				this.clearState();
				listContainer.hidden = false;
				this.element.dataset.state = 'ready';
				this.layout(this.width, this.height);
			}
		};
		store.add(autorun(update));
	}

	private showState(state: 'loading' | 'error' | 'unavailable', message: string, input: IContentInput, retry: boolean): void {
		this.clearState();
		this.element.dataset.state = state;
		const container = this.stateElement = $('.session-work-card-content-state');
		this.element.appendChild(container);
		const notice = this.stateDisposables.add(new ChatErrorWidget(state === 'error' ? ChatErrorLevel.Error : ChatErrorLevel.Info, new MarkdownString().appendText(message), this.markdownRenderer));
		container.appendChild(notice.domNode);
		if (state !== 'loading') {
			const actions = $('.session-work-card-content-actions');
			container.appendChild(actions);
			if (retry) {
				const retryButton = this.stateDisposables.add(new Button(actions, { ...defaultButtonStyles, secondary: true }));
				retryButton.label = localize('sessionWorkCardContent.retry', "Retry");
				this.stateDisposables.add(retryButton.onDidClick(() => this.startLoad(this.input.get() ?? input)));
				this.stateAction = retryButton;
			}
			const openButton = this.stateDisposables.add(new Button(actions, { ...defaultButtonStyles, secondary: true }));
			openButton.label = localize('sessionWorkCardContent.open', "Open Chat");
			this.stateDisposables.add(openButton.onDidClick(() => {
				void this.sessionsService.openSessionReview(input.session, SessionReviewSection.Conversation, { chatResource: input.chat.resource })
					.catch(error => this.notificationService.error(error));
			}));
			this.stateAction ??= openButton;
		}
		const resizeObserver = this.stateDisposables.add(new DisposableResizeObserver('SessionWorkCardContent.state', () => this.measure()));
		this.stateDisposables.add(resizeObserver.observe(container));
		this.measure();
	}

	private clearState(): void {
		this.stateDisposables.clear();
		this.stateElement?.remove();
		this.stateElement = undefined;
		this.stateAction = undefined;
	}

	layout(width: number, height: number): void {
		this.width = Math.max(0, width);
		this.height = Math.max(0, height);
		size(this.element, this.width, this.height);
		this.list?.layout(this.height, this.width);
		this.measure();
	}

	private measure(): void {
		this.setDesiredHeight(this.stateElement ? Math.max(72, this.stateElement.scrollHeight)
			: this.element.dataset.state === 'empty' ? 0 : this.list ? Math.max(80, this.list.contentHeight) : 0);
	}

	private setDesiredHeight(height: number): void {
		const desiredHeight = Math.ceil(height);
		if (desiredHeight !== this.desiredHeight) {
			this.desiredHeight = desiredHeight;
			this.heightChangeScheduler.schedule();
		}
	}

	focus(): void {
		if (this.stateAction) {
			this.stateAction.focus();
		} else if (!this.list || this.element.dataset.state !== 'ready' || this.list.focusLastItem() < 0) {
			this.element.focus();
		}
	}

	/** Content for the enclosing overview's Accessible View, without acquiring any additional model. */
	getAccessibleContent(): string {
		if (this.stateElement || this.input.get()?.mode === 'pending') {
			return this.element.innerText;
		}
		return this.viewModel?.getItems().map(item => this.accessibilityProvider.getAriaLabel(item)).join('\n\n') ?? '';
	}

	override dispose(): void {
		this.load.clear();
		this.presentation.clear();
		this.clearState();
		this.viewModel = undefined;
		this.list = undefined;
		this.modelReference.clear();
		super.dispose();
		transaction(tx => {
			this.input.set(undefined, tx);
			this.model.set(undefined, tx);
			this.scopedSession.set(undefined, tx);
		});
		this.element.remove();
	}
}
