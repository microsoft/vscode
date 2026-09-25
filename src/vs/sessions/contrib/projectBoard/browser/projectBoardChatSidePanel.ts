/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/projectBoardChatSidePanel.css';
import { $, append, isAncestorOfActiveElement, size } from '../../../../base/browser/dom.js';
import { raceCancellationError, Sequencer } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { LRUCache } from '../../../../base/common/map.js';
import { autorun, disposableObservableValue } from '../../../../base/common/observable.js';
import { getComparisonKey, isEqual } from '../../../../base/common/resources.js';
import { localize } from '../../../../nls.js';
import { Action } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { WorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ViewPane } from '../../../../workbench/browser/parts/views/viewPane.js';
import { ViewContainerLocation } from '../../../../workbench/common/views.js';
import { EDITOR_DRAG_AND_DROP_BACKGROUND, SIDE_BAR_BACKGROUND, SIDE_BAR_FOREGROUND } from '../../../../workbench/common/theme.js';
import { CHAT_WIDGET_VIEW_STATE_CACHE_LIMIT, IChatWidgetViewState, setModelPreservingInputTypedWhileLoading } from '../../../../workbench/contrib/chat/browser/chat.js';
import { ChatWidget } from '../../../../workbench/contrib/chat/browser/widget/chatWidget.js';
import { IChatModelReference, IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionsService, localChatSessionType } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ChatAgentLocation, ChatModeKind } from '../../../../workbench/contrib/chat/common/constants.js';
import { IChatModelInputState } from '../../../../workbench/contrib/chat/common/model/chatModel.js';
import { getChatSessionType } from '../../../../workbench/contrib/chat/common/model/chatUri.js';
import { IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IWorkbenchLayoutService, Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { IPaneCompositePartService } from '../../../../workbench/services/panecomposite/browser/panecomposite.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { KANBAN_CUSTOM_VIEW_ID } from '../../../common/projectBoard.js';
import { ICustomViewDescriptor } from '../../../services/customView/browser/customView.js';
import { ICustomViewService } from '../../../services/customView/browser/customViewService.js';
import { ISessionContext, SessionContext } from '../../../services/sessions/browser/sessionContext.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { VisibleSession } from '../../../services/sessions/browser/visibleSessions.js';
import { setActiveSessionContextKeys } from '../../../services/sessions/common/sessionContextKeys.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ChatInteractivity, ISession } from '../../../services/sessions/common/session.js';
import { IProjectBoardCard } from '../common/projectBoardModel.js';

export const PROJECT_BOARD_CHAT_CONTAINER_ID = 'workbench.sessions.auxiliaryBar.kanbanChat';
export const PROJECT_BOARD_CHAT_VIEW_ID = 'sessions.kanban.chat';
export const ProjectBoardChatAvailableContext = new RawContextKey<boolean>('kanbanChatAvailable', false);
export const ProjectBoardChatFocusContext = new RawContextKey<boolean>('kanbanChatFocus', false);

type ProjectBoardChat = Pick<IProjectBoardCard, 'session' | 'chat'>;

/** Owns a borrowed auxiliary pane without changing the window's active session or chat. */
export class ProjectBoardChatSidePanel extends Disposable {
	private readonly request = this._register(new MutableDisposable<CancellationTokenSource>());
	private readonly paneOperations = new Sequencer();
	private pane: ProjectBoardChatViewPane | undefined;
	private previousComposite: { id: string | undefined; customView: ICustomViewDescriptor } | undefined;
	private onClose: (() => void) | undefined;
	private disposed = false;
	private readonly available;

	constructor(
		@ICustomViewService private readonly customViewService: ICustomViewService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@IPaneCompositePartService private readonly paneCompositeService: IPaneCompositePartService,
		@IViewsService private readonly viewsService: IViewsService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatEntitlementService private readonly entitlementService: IChatEntitlementService,
		@ILogService private readonly logService: ILogService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		this.available = ProjectBoardChatAvailableContext.bindTo(contextKeyService);
		this._register(autorun(reader => {
			const customView = this.customViewService.activeCustomView.read(reader);
			if (customView?.id !== KANBAN_CUSTOM_VIEW_ID) {
				this.close();
			}
		}));
		this._register(this.entitlementService.onDidChangeSentiment(() => {
			if (this.entitlementService.sentiment.hidden) {
				this.close();
			}
		}));
	}

	async open(card: ProjectBoardChat, onClose: () => void): Promise<void> {
		const customView = this.customViewService.activeCustomView.get();
		if (this.disposed || customView?.id !== KANBAN_CUSTOM_VIEW_ID || this.entitlementService.sentiment.hidden) {
			throw new Error(localize('kanban.chatUnavailable', "Chat can only be opened beside the embedded Agents Hub view while AI features are enabled."));
		}

		this.request.value?.cancel();
		this.pane?.clear();
		const request = new CancellationTokenSource();
		this.request.value = request;
		const token = request.token;
		try {
			if (!await raceCancellationError(this.sessionsService.canOpenSession(card.session), token)) {
				this.close();
				return;
			}
			await this.paneOperations.queue(async () => {
				if (token.isCancellationRequested || this.customViewService.activeCustomView.get() !== customView) {
					return;
				}
				if (!this.previousComposite) {
					this.previousComposite = {
						id: this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.AuxiliaryBar)?.getId()
							?? this.paneCompositeService.getLastActivePaneCompositeId(ViewContainerLocation.AuxiliaryBar),
						customView,
					};
				}
				this.onClose = onClose;
				this.available.set(true);
				const pane = await this.viewsService.openView<ProjectBoardChatViewPane>(PROJECT_BOARD_CHAT_VIEW_ID, false);
				if (token.isCancellationRequested) {
					return;
				}
				if (!pane) {
					throw new Error(localize('kanban.chatPaneUnavailable', "The Agents Hub chat side panel could not be opened."));
				}
				this.pane = pane;
				this.customViewService.setAuxiliaryBarVisible(true);
			});
			if (token.isCancellationRequested || !this.pane) {
				return;
			}
			const pane = this.pane;
			await raceCancellationError(pane.open(card, token, () => this.close()), token);
			if (token.isCancellationRequested || this.pane !== pane || !pane.isBodyVisible()) {
				return;
			}
			pane.focus();
			try {
				await this.sessionsManagementService.markRead(card.session);
			} catch (error) {
				this.logService.error('[ProjectBoard] Failed to mark side-panel chat read', error);
				this.notificationService.error(localize('kanban.chatMarkReadFailed', "The chat opened, but its read state could not be updated."));
			}
		} catch (error) {
			if (!token.isCancellationRequested && !isCancellationError(error)) {
				this.close();
				throw error;
			}
		}
	}

	close(): void {
		this.request.value?.cancel();
		this.request.clear();
		const pane = this.pane;
		const hadChatFocus = pane?.hasChatFocus() ?? false;
		this.pane = undefined;
		pane?.clear();
		const onClose = this.onClose;
		this.onClose = undefined;
		const previous = this.previousComposite;
		this.previousComposite = undefined;
		if (previous) {
			void this.paneOperations.queue(async () => {
				const active = this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.AuxiliaryBar);
				const currentCustomView = this.customViewService.activeCustomView.get();
				const ownsAuxiliaryPane = active?.getId() === PROJECT_BOARD_CHAT_CONTAINER_ID;
				const canRestoreComposite = ownsAuxiliaryPane && (
					currentCustomView === previous.customView ||
					!currentCustomView && this.layoutService.isVisible(Parts.AUXILIARYBAR_PART)
				);
				try {
					if (canRestoreComposite) {
						if (previous.id && previous.id !== PROJECT_BOARD_CHAT_CONTAINER_ID) {
							if (!this.paneCompositeService.getPaneComposite(previous.id, ViewContainerLocation.AuxiliaryBar)) {
								throw new Error(localize('kanban.previousPaneUnavailable', "The previous side panel is no longer available."));
							}
							await this.paneCompositeService.openPaneComposite(previous.id, ViewContainerLocation.AuxiliaryBar, false);
						} else if (currentCustomView === previous.customView) {
							this.paneCompositeService.hideActivePaneComposite(ViewContainerLocation.AuxiliaryBar);
						}
					}
				} finally {
					if (!this.previousComposite) {
						// Opening a covered composite can show the transient auxiliary bar again.
						if (ownsAuxiliaryPane && this.customViewService.activeCustomView.get() === previous.customView) {
							this.customViewService.setAuxiliaryBarVisible(false);
						}
						// Deactivate before removing the view so the composite bar cannot reopen a fallback.
						if (this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.AuxiliaryBar)?.getId() === PROJECT_BOARD_CHAT_CONTAINER_ID && !this.layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
							this.paneCompositeService.hideActivePaneComposite(ViewContainerLocation.AuxiliaryBar);
						}
						this.available.reset();
					}
				}
			}).catch(error => {
				this.logService.error('[ProjectBoard] Failed to restore auxiliary pane', error);
				this.notificationService.error(localize('kanban.chatRestoreFailed', "The previous side panel could not be restored."));
			});
		}
		if (hadChatFocus && !this.disposed && this.customViewService.activeCustomView.get()?.id === KANBAN_CUSTOM_VIEW_ID) {
			onClose?.();
		}
	}

	override dispose(): void {
		if (!this.disposed) {
			this.disposed = true;
			this.close();
			super.dispose();
		}
	}
}

/** The header is inside the body because single-pane layout hides auxiliary composite chrome. */
export class ProjectBoardChatViewPane extends ViewPane {
	private readonly content = this._register(new MutableDisposable<ProjectBoardChatContent>());
	private readonly viewStates = new LRUCache<string, IChatWidgetViewState>(CHAT_WIDGET_VIEW_STATE_CACHE_LIMIT);
	private readonly pendingInputs = new LRUCache<string, IChatModelInputState>(CHAT_WIDGET_VIEW_STATE_CACHE_LIMIT);
	private chatContainer: HTMLElement | undefined;
	private dimensions: { height: number; width: number } | undefined;

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		this.chatContainer = append(container, $('.project-board-chat-pane'));
		this._register(this.onDidChangeBodyVisibility(visible => {
			this.content.value?.setVisible(visible);
			if (!visible) {
				this.content.value?.onClose();
			}
		}));
	}

	async open(card: ProjectBoardChat, token: CancellationToken, onClose: () => void): Promise<void> {
		if (!this.chatContainer) {
			throw new Error(localize('kanban.chatNotRendered', "The Agents Hub chat side panel has not been rendered."));
		}
		this.clear();
		const content = this.instantiationService.createInstance(ProjectBoardChatContent, card, this.viewStates, this.pendingInputs, onClose);
		this.content.value = content;
		this.chatContainer.appendChild(content.element);
		if (this.dimensions) {
			content.layout(this.dimensions.height, this.dimensions.width);
		}
		content.setVisible(this.isBodyVisible());
		await content.load(token);
	}

	clear(): void {
		this.content.clear();
	}

	hasChatFocus(): boolean {
		return !!this.content.value && isAncestorOfActiveElement(this.content.value.element);
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this.dimensions = { height, width };
		if (this.chatContainer) {
			size(this.chatContainer, width, height);
		}
		this.content.value?.layout(height, width);
	}

	override focus(): void {
		this.content.value?.focus();
	}
}

export class ProjectBoardChatContent extends Disposable {
	readonly element = $('.project-board-chat-content');
	private readonly header = append(this.element, $('.project-board-chat-header'));
	private readonly widgetContainer = append(this.element, $('.project-board-chat-widget'));
	private readonly widget: ChatWidget;
	private readonly model = this._register(new MutableDisposable<IChatModelReference>());
	private readonly loadCancellation = this._register(new CancellationTokenSource());
	private dimensions: { height: number; width: number } | undefined;
	private chatResourceChanged = false;

	constructor(
		private card: ProjectBoardChat,
		private readonly viewStates: LRUCache<string, IChatWidgetViewState>,
		private readonly pendingInputs: LRUCache<string, IChatModelInputState>,
		readonly onClose: () => void,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatService private readonly chatService: IChatService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IHoverService hoverService: IHoverService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@INotificationService notificationService: INotificationService,
	) {
		super();
		const currentSession = sessionsManagementService.getSession(card.session.resource);
		if (currentSession?.providerId === card.session.providerId) {
			this.card = this.replacementCard(currentSession);
		}
		this._register(toDisposable(() => this.element.remove()));
		const scopedContextKeyService = this._register(contextKeyService.createScoped(this.element));
		ProjectBoardChatFocusContext.bindTo(scopedContextKeyService).set(true);
		const session = this._register(disposableObservableValue(this, new VisibleSession(this.card.session, this.card.chat)));
		const scopedInstantiationService = this._register(instantiationService.createChild(new ServiceCollection(
			[IContextKeyService, scopedContextKeyService],
			[ISessionContext, new SessionContext(session)],
		)));
		this._register(autorun(reader => setActiveSessionContextKeys(session.read(reader), scopedContextKeyService, reader)));
		const title = append(this.header, $('h2.project-board-chat-title'));
		this._register(autorun(reader => {
			title.textContent = session.read(reader).activeChat.read(reader).title.read(reader);
			this.element.setAttribute('aria-label', localize('kanban.chatLabel', "Agents Hub chat: {0}", title.textContent));
			reader.store.add(hoverService.setupDelayedHover(title, { content: title.textContent }));
		}));
		this.element.setAttribute('role', 'region');
		const toolbar = this._register(scopedInstantiationService.createInstance(WorkbenchToolBar, append(this.header, $('.project-board-chat-actions')), { ariaLabel: localize('kanban.chatActions', "Chat actions") }));
		toolbar.setActions([this._register(new Action('sessions.kanban.closeChat', localize('kanban.closeChat', "Close Chat"), ThemeIcon.asClassName(Codicon.close), true, onClose))]);
		this.widget = this._register(scopedInstantiationService.createInstance(ChatWidget, ChatAgentLocation.Chat, undefined, {
			autoScroll: mode => mode !== ChatModeKind.Ask,
			renderFollowups: true,
			supportsFileReferences: true,
			enableImplicitContext: true,
			enableWorkingSet: 'implicit',
			supportsChangingModes: true,
			inputEditorMinLines: 2,
			isSessionsWindow: true,
			enableFind: true,
			rendererOptions: { referencesExpandedWhenEmptyResponse: false, progressMessageAtBottomOfResponse: mode => mode !== ChatModeKind.Ask },
		}, {
			listForeground: SIDE_BAR_FOREGROUND,
			listBackground: SIDE_BAR_BACKGROUND,
			inputEditorBackground: SIDE_BAR_BACKGROUND,
			resultEditorBackground: SIDE_BAR_BACKGROUND,
			overlayBackground: EDITOR_DRAG_AND_DROP_BACKGROUND,
		}));
		this.widget.render(this.widgetContainer);
		this._register(autorun(reader => {
			const chat = session.read(reader).activeChat.read(reader);
			this.widget.setReadOnly(this.chatResourceChanged || chat.interactivity.read(reader) !== ChatInteractivity.Full);
		}));
		this._register(sessionsManagementService.onDidReplaceSession(({ from, to }) => {
			if (this.chatResourceChanged || from.providerId !== this.card.session.providerId || from.sessionId !== this.card.session.sessionId) {
				return;
			}
			const previousChat = this.card.chat;
			this.card = this.replacementCard(to);
			this.chatResourceChanged = !isEqual(previousChat.resource, this.card.chat.resource);
			session.set(new VisibleSession(this.card.session, this.card.chat), undefined);
			if (this.chatResourceChanged) {
				const liveInput = this.widget.getInputState();
				const input = liveInput && (liveInput.inputText || liveInput.attachments.length)
					? liveInput : this.pendingInputs.get(getComparisonKey(previousChat.resource));
				if (input) {
					this.pendingInputs.set(getComparisonKey(this.card.chat.resource), input);
				}
				// Never leave the old model writable under a different session's context.
				this.loadCancellation.cancel();
				this.onClose();
				notificationService.info(localize('kanban.chatReplaced', "The chat's address changed. Open its Agents Hub card again to continue; your draft has been preserved."));
			}
		}));
	}

	private replacementCard(session: ISession): ProjectBoardChat {
		const chat = session.chats.get().find(chat => isEqual(chat.resource, this.card.chat.resource))
			?? (isEqual(this.card.chat.resource, this.card.session.mainChat.get().resource) ? session.mainChat.get() : this.card.chat);
		return { session, chat };
	}

	async load(token: CancellationToken): Promise<void> {
		const cancellation = token.onCancellationRequested(() => this.loadCancellation.cancel());
		try {
			if (token.isCancellationRequested) {
				this.loadCancellation.cancel();
				return;
			}
			const loadToken = this.loadCancellation.token;
			this.widget.setLoading(true);
			this.element.setAttribute('aria-busy', 'true');
			const inputBeforeLoad = this.widget.getInput();
			const sessionType = getChatSessionType(this.card.chat.resource);
			if (sessionType !== localChatSessionType) {
				if (!await raceCancellationError(this.chatSessionsService.canResolveChatSession(sessionType), loadToken)) {
					throw new Error(localize('kanban.chatProviderUnavailable', "The provider for the selected chat is not available."));
				}
				const contribution = this.chatSessionsService.getChatSessionContribution(sessionType);
				if (contribution) {
					this.widget.lockToCodingAgent(contribution.name, contribution.displayName, sessionType, contribution.agentHostProviderId);
				}
			}
			const ref = await this.chatService.acquireOrLoadSession(this.card.chat.resource, ChatAgentLocation.Chat, loadToken, 'ProjectBoardChatSidePanel');
			if (loadToken.isCancellationRequested) {
				ref?.dispose();
				return;
			}
			if (!ref) {
				throw new Error(localize('kanban.chatLoadFailed', "The selected chat could not be loaded."));
			}
			if (!isEqual(ref.object.sessionResource, this.card.chat.resource)) {
				ref.dispose();
				throw new Error(localize('kanban.chatTargetChanged', "The selected chat changed while it was loading. Open its card again."));
			}
			this.model.value = ref;
			const pendingInput = this.pendingInputs.get(getComparisonKey(this.card.chat.resource));
			const persistedInput = ref.object.inputModel.state.get();
			if (pendingInput && !persistedInput?.inputText && !persistedInput?.attachments.length) {
				ref.object.inputModel.setState(pendingInput);
			}
			this.pendingInputs.delete(getComparisonKey(this.card.chat.resource));
			setModelPreservingInputTypedWhileLoading(this.widget, inputBeforeLoad, () => this.widget.setModel(ref.object));
			const state = this.viewStates.get(getComparisonKey(this.card.chat.resource));
			if (state) {
				this.widget.restoreViewState(state);
			}
			this.widget.setLoading(false);
			this.element.removeAttribute('aria-busy');
			this.element.dataset.boundChatResource = this.card.chat.resource.toString();
			if (this.dimensions) {
				this.layout(this.dimensions.height, this.dimensions.width);
			}
		} finally {
			cancellation.dispose();
		}
	}

	setVisible(visible: boolean): void {
		this.widget.setVisible(visible);
	}

	layout(height: number, width: number): void {
		this.dimensions = { height, width };
		size(this.element, width, height);
		this.widget.layout(Math.max(0, height - this.header.offsetHeight), width);
	}

	focus(): void {
		this.widget.focusInput();
	}

	override dispose(): void {
		if (this._store.isDisposed) {
			return;
		}
		this.loadCancellation.cancel();
		if (this.model.value) {
			this.viewStates.set(getComparisonKey(this.model.value.object.sessionResource), this.widget.getViewState());
			this.widget.setModel(undefined);
		} else {
			const input = this.widget.getInputState();
			if (input && (input.inputText || input.attachments.length)) {
				this.pendingInputs.set(getComparisonKey(this.card.chat.resource), input);
			}
		}
		this.widget.setVisible(false);
		super.dispose();
	}
}
