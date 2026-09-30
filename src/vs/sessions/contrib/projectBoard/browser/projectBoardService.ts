/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, addStandardDisposableListener, DisposableResizeObserver, disposableWindowInterval, EventType, getWindow, isHTMLElement } from '../../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { Checkbox } from '../../../../base/browser/ui/toggle/toggle.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { fromNow } from '../../../../base/common/date.js';
import { IAction, SubmenuAction, toAction } from '../../../../base/common/actions.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { URI } from '../../../../base/common/uri.js';
import { isEqual } from '../../../../base/common/resources.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { equals } from '../../../../base/common/objects.js';
import { autorun, autorunHandleChanges, derived, derivedOpts, IObservable, IReader, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { defaultButtonStyles, defaultCheckboxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { ChatQuestionContent } from '../../../../workbench/contrib/chat/browser/widget/chatContentParts/chatQuestionContent.js';
import { CHAT_CARD_LARGE_CLASS } from '../../../../workbench/contrib/chat/browser/widget/chatCard.js';
import { formatCopilotCreditsLabel, IChatQuestionCarousel, IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatQuestionCarouselPart } from '../../../../workbench/contrib/chat/browser/widget/chatContentParts/chatQuestionCarouselPart.js';
import { IChatSessionsService } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IAuxiliaryWindow, IAuxiliaryWindowService } from '../../../../workbench/services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { IHostService } from '../../../../workbench/services/host/browser/host.js';
import { ChatInteractivity, getChatCapabilities, IChat, ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { getProjectBoardCardId, getProjectBoardSessionKey, IProjectBoardAxis, IProjectBoardCard, IProjectBoardPlacement, ProjectBoardModel } from '../common/projectBoardModel.js';
import { ProjectBoardState } from './projectBoardState.js';
import { ProjectBoardStateDurations } from '../common/projectBoardStateDurations.js';
import { ProjectBoardChatActions } from './projectBoardChatActions.js';
import { getProjectBoardConfigurationDetails, IProjectBoardConfigurationDetails } from './projectBoardConfigurationDetails.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { isAgentHostProvider } from '../../../common/agentHostSessionsProvider.js';
import { IProjectBoardDraft, ProjectBoardChatWindows } from './projectBoardNavigation.js';
import { ProjectBoardNewSessionDialog } from './projectBoardNewSessionDialog.js';
import { IProjectBoardPendingQuestion, ProjectBoardQuestionPreviewState } from './projectBoardQuestions.js';
import { getProjectBoardSubmittedAt, IProjectBoardMetadata } from './projectBoardMetadata.js';
import { KanbanAutoIncludeSessionsContext, KanbanBoardEditableContext, KanbanOpenChatInSidePanelContext, KanbanShowArchivedContext, KanbanShowCreditsContext, KanbanShowLastPromptContext, KanbanShowModelDetailsContext, KanbanShowPermissionDetailsContext, KanbanShowSessionListContext, KanbanShowStateDurationContext } from '../../../common/contextkeys.js';
import { IProjectBoardCardIdentity, IProjectBoardDisplayOptions, IProjectBoardSavedPlacement, projectBoardIdentityLabelLimit } from '../common/projectBoardConfiguration.js';
import { ProjectBoardWindow } from './projectBoardWindow.js';
import { ProjectBoardChatSidePanel } from './projectBoardChatSidePanel.js';
import { getSessionDragData, SessionsDataTransfers } from '../../../browser/dnd.js';
import { SessionsFlatList } from '../../sessions/browser/views/sessionsList.js';
import { AgentSessionApprovalModel } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionApprovalModel.js';
import { IProjectBoardCatalogService } from '../common/projectBoardCatalog.js';
import { ICustomViewService } from '../../../services/customView/browser/customViewService.js';
import { KANBAN_CUSTOM_VIEW_ID } from '../../../common/projectBoard.js';
import { ProjectBoardPreviewPool, IProjectBoardMetadataLease, IProjectBoardQuestionLease } from './projectBoardPreviewPool.js';
import './projectBoardCatalog.js';
import './media/projectBoard.css';

const projectBoardDragDataType = 'application/vnd.code.project-board-card';
const maxQuestionPreviews = 8;
const maxMetadataPreviews = 16;

interface IProjectBoardSessionList extends IDisposable {
	readonly container: HTMLElement;
	readonly list: SessionsFlatList;
	readonly placement: IProjectBoardPlacement | undefined;
	sessions: readonly ISession[];
}

export const IProjectBoardService = createDecorator<IProjectBoardService>('projectBoardService');

export interface IProjectBoardService {
	readonly _serviceBrand: undefined;
	open(boardId?: string): Promise<void>;
	createBoard(): Promise<void>;
	renameBoard(boardId?: string): Promise<void>;
	deleteBoard(boardId?: string): Promise<void>;
	createView(container: HTMLElement): IProjectBoardView;
	getAccessibleContent(): string;
	closeSession(windowId: number): Promise<void>;
	addAxis(kind: 'row' | 'column'): Promise<void>;
	toggleArchived(): void;
	createSession(): Promise<void>;
	toggleAutoIncludeSessions(): void;
	toggleOpenChatInSidePanel(): void;
	toggleDisplayOption(key: keyof IProjectBoardDisplayOptions): void;
}

export interface IProjectBoardView extends IDisposable {
	focus(): void;
	layout(width: number, height: number): void;
	/**
	 * Fired after the board's own content height changes outside of a
	 * `layout()` call (for example, expanding a "+more" group), so the host's
	 * scroll container can rescan immediately instead of waiting on its
	 * passive resize observer to catch up.
	 */
	readonly onDidChangeContentSize: Event<void>;
}

class ProjectBoardView extends Disposable implements IProjectBoardView {
	private readonly _onDidChangeContentSize = this._register(new Emitter<void>());
	readonly onDidChangeContentSize: Event<void> = this._onDidChangeContentSize.event;

	private readonly actionWidgets = this._register(new DisposableMap<string, ProjectBoardChatActions>());
	private readonly actionErrors = new Set<string>();
	private readonly configurationDetails = new Map<string, IProjectBoardConfigurationDetails>();
	private readonly configurationErrors = new Set<string>();

	private readonly model = new ProjectBoardModel();
	private readonly cardElements = new Map<string, HTMLElement>();
	private readonly activeChatLabels = new Map<string, HTMLElement>();
	private readonly monitoredChildLabels = new Map<string, { element: HTMLElement; children: readonly IProjectBoardCard[] }>();
	private readonly collapsedChats = new Set<string>();
	private readonly selectedCards = new Set<string>();
	private readonly cardCheckboxes = new Map<string, Checkbox>();
	private markingDone = false;
	private selectionCount: HTMLElement | undefined;
	private markDoneButton: Button | undefined;
	private clearSelectionButton: Button | undefined;
	private readonly sessionLists = this._register(new DisposableMap<string, IProjectBoardSessionList>());
	private readonly renderedSessionLists = new Set<string>();
	private readonly approvalModel = this._register(new MutableDisposable<AgentSessionApprovalModel>());
	private readonly controlElements = new Map<string, HTMLElement>();
	private readonly durationElements = new Map<string, HTMLElement>();
	private readonly recencyElements = new Map<HTMLElement, number>();
	private readonly stateDurations = new ProjectBoardStateDurations();
	private readonly creditValues = new Map<string, number | undefined>();
	private readonly notifiedCreditErrors = new Map<string, string>();
	private readonly renderDisposables = this._register(new MutableDisposable<DisposableStore>());
	private readonly previewRender = this._register(new RunOnceScheduler(() => this.render(), 0));
	private readonly deferredRenderSources = new Set<IObservable<unknown>>();
	private waitingForPreview = false;
	private readonly sessionObserver = this._register(new MutableDisposable());
	private readonly suspendedPreviews = this._register(new MutableDisposable());
	private readonly movePicker = this._register(new MutableDisposable<DisposableStore>());
	private creatingSession = false;
	private createSessionButton: Button | undefined;
	private drafts: readonly IProjectBoardDraft[] = [];
	private readonly questionPreviews = this._register(new DisposableMap<string, IProjectBoardQuestionLease>());
	private readonly questionChats = new Map<string, IChat>();
	private readonly questionWidgets = this._register(new DisposableMap<IChatQuestionCarousel, {
		readonly cardId: string;
		readonly owner: IProjectBoardQuestionLease;
		readonly element: HTMLElement;
		readonly part: ChatQuestionCarouselPart;
		dispose(): void;
	}>());
	private readonly previewStates = new Map<string, ProjectBoardQuestionPreviewState>();
	private readonly notifiedPreviewErrors = new Map<string, string>();
	private readonly metadataPreviews = this._register(new DisposableMap<string, IProjectBoardMetadataLease>());
	private readonly metadataChats = new Map<string, IChat>();
	private readonly metadataStates = new Map<string, IProjectBoardMetadata>();
	private readonly notifiedMetadataErrors = new Map<string, string>();
	private readonly promptTimes = new Map<string, number>();
	private showArchived = false;
	private readonly visibleCounts = new Map<string, number>();
	private readonly collapsedRows = new Set<string>();
	private readonly collapsedColumns = new Set<string>();
	private unassignedCollapsed = false;
	private readonly viewId = generateUuid();
	private dragging = false;
	private rendering = false;
	private menuOpen = false;
	private menuGeneration = 0;
	private active = true;
	private readonly boardElement = mainWindow.document.createElement('main');
	private readonly scrollable: DomScrollableElement | undefined;
	private readonly scrollObserver: DisposableResizeObserver | undefined;
	private readonly boardTitle = derived(reader => {
		const name = this.catalog.boards.read(reader).find(board => board.id === this.boardId)?.name;
		return name ? localize('projectBoard.namedTitle', "Agents Hub — {0}", name) : localize('projectBoard.hubTitle', "Agents Hub");
	});
	private readonly sessionsManagementService: ISessionsManagementService;
	private readonly notificationService: INotificationService;
	private readonly logService: ILogService;
	private readonly contextMenuService: IContextMenuService;
	private readonly instantiationService: IInstantiationService;
	private readonly chatSidePanel: ProjectBoardChatSidePanel;
	private readonly customViewContexts: {
		readonly editable: IContextKey<boolean>;
		readonly autoIncludeSessions: IContextKey<boolean>;
		readonly openChatInSidePanel: IContextKey<boolean>;
		readonly showArchived: IContextKey<boolean>;
		readonly showStateDuration: IContextKey<boolean>;
		readonly showSessionList: IContextKey<boolean>;
		readonly showCredits: IContextKey<boolean>;
		readonly showLastPrompt: IContextKey<boolean>;
		readonly showModelDetails: IContextKey<boolean>;
		readonly showPermissionDetails: IContextKey<boolean>;
	} | undefined;

	constructor(
		private readonly container: HTMLElement,
		private readonly chatWindows: ProjectBoardChatWindows,
		private readonly boardState: ProjectBoardState,
		private readonly showHeader: boolean,
		services: {
			sessionsManagementService: ISessionsManagementService;
			notificationService: INotificationService;
			logService: ILogService;
			contextMenuService: IContextMenuService;
			instantiationService: IInstantiationService;
			chatSidePanel: ProjectBoardChatSidePanel;
			previewPool: ProjectBoardPreviewPool;
			markSessionDone: (session: ISession) => Promise<void>;
			onOpenChat: (resource: URI) => void;
			renameBoard: () => Promise<void>;
			deleteBoard: () => Promise<void>;
			recoverHub: () => Promise<void>;
		},
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IDialogService private readonly dialogService: IDialogService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IHoverService private readonly hoverService: IHoverService,
		@IChatService private readonly chatService: IChatService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@IProjectBoardCatalogService private readonly catalog: IProjectBoardCatalogService,
	) {
		super();
		this.sessionsManagementService = services.sessionsManagementService;
		this.notificationService = services.notificationService;
		this.logService = services.logService;
		this.contextMenuService = services.contextMenuService;
		this.instantiationService = services.instantiationService;
		this.chatSidePanel = services.chatSidePanel;
		this.previewPool = services.previewPool;
		this.markSessionDone = services.markSessionDone;
		this.onOpenChat = services.onOpenChat;
		this.renameBoard = services.renameBoard;
		this.deleteBoard = services.deleteBoard;
		this.recoverHub = services.recoverHub;
		this.boardElement.className = 'project-board';
		this.boardElement.dataset.boardId = this.boardId;
		if (showHeader) {
			const scrollable = this.scrollable = this._register(new DomScrollableElement(this.boardElement, {
				horizontal: ScrollbarVisibility.Auto,
				vertical: ScrollbarVisibility.Auto,
				useShadows: false,
			}));
			scrollable.getDomNode().classList.add('project-board-scrollable');
			this.container.appendChild(scrollable.getDomNode());
			this._register(toDisposable(() => scrollable.getDomNode().remove()));
			this._register(addDisposableListener(this.boardElement, EventType.SCROLL, () => {
				scrollable.scanDomNode();
			}));
			this.scrollObserver = this._register(new DisposableResizeObserver('ProjectBoardView.scrollable', () => scrollable.scanDomNode(), getWindow(this.container)));
			this._register(this.scrollObserver.observe(this.boardElement));
		} else {
			this.container.appendChild(this.boardElement);
			this._register(toDisposable(() => this.boardElement.remove()));
		}
		if (!showHeader) {
			this.customViewContexts = {
				editable: KanbanBoardEditableContext.bindTo(contextKeyService),
				autoIncludeSessions: KanbanAutoIncludeSessionsContext.bindTo(contextKeyService),
				openChatInSidePanel: KanbanOpenChatInSidePanelContext.bindTo(contextKeyService),
				showArchived: KanbanShowArchivedContext.bindTo(contextKeyService),
				showStateDuration: KanbanShowStateDurationContext.bindTo(contextKeyService),
				showSessionList: KanbanShowSessionListContext.bindTo(contextKeyService),
				showCredits: KanbanShowCreditsContext.bindTo(contextKeyService),
				showLastPrompt: KanbanShowLastPromptContext.bindTo(contextKeyService),
				showModelDetails: KanbanShowModelDetailsContext.bindTo(contextKeyService),
				showPermissionDetails: KanbanShowPermissionDetailsContext.bindTo(contextKeyService),
			};
			this._register(toDisposable(() => {
				if (this.active) {
					for (const context of Object.values(this.customViewContexts!)) {
						context.reset();
					}
				}
			}));
		}
		this._register(this.sessionsManagementService.onDidChangeSessions(() => this.observeSessions()));
		this._register(this.sessionsProvidersService.onDidChangeProviders(() => this.observeSessions()));
		this._register(autorun(reader => this.updateActiveCard(this.chatSidePanel.activeCardId.read(reader))));
		this._register(addDisposableListener(this.container, EventType.FOCUS_OUT, event => {
			// Native blur can flush microtasks before relatedTarget receives focus.
			const movingWithinBoard = isHTMLElement(event.relatedTarget) && this.container.contains(event.relatedTarget);
			if (!this.rendering && this.model.isSortingDeferred && !movingWithinBoard) {
				queueMicrotask(() => {
					if (this.active && !this._store.isDisposed && !this.dragging && !this.menuOpen && !this.hasFocusedCard()) {
						this.model.setSortingDeferred(false);
						this.render();
					}
				});
			}
		}));
		this.observeSessions();
	}

	private readonly previewPool: ProjectBoardPreviewPool;
	private readonly markSessionDone: (session: ISession) => Promise<void>;
	private readonly onOpenChat: (resource: URI) => void;
	private readonly renameBoard: () => Promise<void>;
	private readonly deleteBoard: () => Promise<void>;
	private readonly recoverHub: () => Promise<void>;

	get boardId(): string {
		return this.boardState.boardId;
	}

	setActive(active: boolean): void {
		if (this.active === active) {
			return;
		}
		this.active = active;
		this.updateActiveCard();
		this.suspendedPreviews.clear();
		if (active) {
			this.observeSessions();
		} else {
			this.previewRender.cancel();
			this.dragging = false;
			this.model.setSortingDeferred(false);
			this.movePicker.clear();
			this.menuOpen = false;
			this.menuGeneration++;
			this.sessionObserver.clear();
			for (const id of this.metadataPreviews.keys()) {
				if (!this.actionWidgets.has(id)) {
					this.metadataPreviews.deleteAndDispose(id);
					this.metadataChats.delete(id);
				} else {
					this.metadataPreviews.get(id)?.setIncludeCredits(false);
					this.metadataPreviews.get(id)?.setIncludeConfiguration(false);
				}
			}
			for (const id of this.questionPreviews.keys()) {
				if (![...this.questionWidgets.values()].some(widget => widget.cardId === id)) {
					this.questionPreviews.deleteAndDispose(id);
					this.questionChats.delete(id);
				}
			}
			this.suspendedPreviews.value = autorun(reader => {
				for (const [id, preview] of this.questionPreviews) {
					if (!preview.questionCarousels.read(reader).length) {
						for (const [carousel, widget] of this.questionWidgets) {
							if (widget.cardId === id) {
								this.questionWidgets.deleteAndDispose(carousel);
							}
						}
						this.questionPreviews.deleteAndDispose(id);
						this.questionChats.delete(id);
					}
				}
				for (const [id, preview] of this.metadataPreviews) {
					if (!preview.actions.read(reader)) {
						this.actionWidgets.deleteAndDispose(id);
						this.metadataPreviews.deleteAndDispose(id);
						this.metadataChats.delete(id);
					}
				}
			});
			if (this.customViewContexts) {
				for (const context of Object.values(this.customViewContexts)) {
					context.reset();
				}
			}
		}
	}

	private get title(): string {
		return this.boardTitle.get();
	}

	private hasFocusedCard(target: Element | null = this.container.ownerDocument.activeElement): boolean {
		const ownerDocument = this.container.ownerDocument;
		return ownerDocument.hasFocus() && (
			[...this.cardElements.values()].some(element => element.contains(target))
			|| [...this.sessionLists.values()].some(entry => entry.container.contains(target)));
	}

	private get showSessionList(): boolean {
		return !!this.boardState.configuration.get().display?.showSessionList;
	}

	focusChat(resource: URI): void {
		this.previewRender.flush();
		const draft = this.drafts.find(draft => draft.id === resource.toString() || isEqual(draft.resource, resource));
		const id = this.model.cards.find(card => isEqual(card.chat.resource, resource))?.id
			?? (draft && `draft:${draft.id}`);
		if (id) {
			const placement = draft ? undefined : this.model.getPlacement(id);
			let changed = this.expandPlacement(placement);
			if (!this.showSessionList && !draft) {
				let rootId = id;
				let parent = this.model.getParentCard(rootId, this.showArchived);
				while (parent) {
					changed = this.collapsedChats.delete(parent.id) || changed;
					rootId = parent.id;
					parent = this.model.getParentCard(rootId, this.showArchived);
				}
				if (placement) {
					const cards = this.model.getCards(placement.rowId, placement.columnId, this.showArchived);
					const index = cards.findIndex(card => card.id === rootId);
					const key = this.cellKey(placement);
					if (index >= (this.visibleCounts.get(key) ?? 3)) {
						this.visibleCounts.set(key, index + 1);
						changed = true;
					}
				}
			}
			if (changed) {
				this.observeSessions();
			}
		}
		if (this.showSessionList && id && !draft) {
			const entry = this.sessionLists.get(this.groupId(this.model.getPlacement(id)));
			entry?.list.focusChat(resource);
			entry?.container.scrollIntoView({ block: 'nearest', inline: 'nearest' });
			return;
		}
		const element = (id && this.cardElements.get(id)) || this.createSessionButton?.element;
		element?.focus({ preventScroll: true });
		element?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	}

	focus(): void {
		this.previewRender.flush();
		const entry = [...this.sessionLists.values()].find(entry => !this.isCollapsed(entry.placement) && entry.sessions.length);
		if (entry) {
			entry.list.focusSession(entry.sessions[0]);
			return;
		}
		(this.createSessionButton?.element
			?? this.visibleCardElements()[0]
			?? [...this.controlElements.values()].find(element => element.tabIndex >= 0 && !element.closest('.project-board-card-list[hidden]'))
			?? this.boardElement)?.focus({ preventScroll: true });
	}
	layout(_width: number, height: number): void {
		if (this.showHeader) {
			this.boardElement.style.height = `${height}px`;
		} else {
			this.boardElement.style.minHeight = `${height}px`;
		}
		this.layoutSessionLists();
		this.scrollable?.scanDomNode();
	}

	async addAxis(kind: 'row' | 'column'): Promise<void> {
		await this.editAxis(kind);
	}

	toggleArchived(): void {
		this.showArchived = !this.showArchived;
		this.observeSessions();
	}

	async createSession(initialPlacement?: IProjectBoardPlacement): Promise<void> {
		if (this.creatingSession) {
			return;
		}
		this.creatingSession = true;
		if (this.createSessionButton) {
			this.createSessionButton.enabled = false;
		}
		try {
			const dialog = this._register(this.instantiationService.createInstance(ProjectBoardNewSessionDialog));
			let createdCardId: string | undefined;
			const session = await dialog.show({
				container: this.boardElement.closest<HTMLElement>('.monaco-workbench') ?? this.boardElement,
				boardState: this.boardState,
				initialPlacement,
				onDidCreate: (session, placement) => {
					const chat = session.mainChat.get();
					createdCardId = getProjectBoardCardId(session, chat);
					this.onOpenChat(chat.resource);
					try {
						this.boardState.moveCard(createdCardId, placement, getLastKnownIdentity(session, chat));
						if (!this._store.isDisposed && this.expandPlacement(placement)) {
							this.render();
						}
					} catch (error) {
						this.logService.error('[ProjectBoard] Failed to place created session', error);
						this.notificationService.error(localize('projectBoard.createdPlacementFailed', "The session was created, but could not be placed on its original board. It is available in the sessions list."));
					}
				},
				onDidResolve: (from, to) => {
					this.catalog.replaceCardPlacements(createdCardId ?? getProjectBoardCardId(from, from.mainChat.get()), getProjectBoardCardId(to, to.mainChat.get()));
					this.onOpenChat(to.mainChat.get().resource);
				},
			}).finally(() => this._store.delete(dialog));
			if (session && this.active && !this._store.isDisposed) {
				const chat = session.mainChat.get();
				if (this.showHeader) {
					await this.chatWindows.open({ id: getProjectBoardCardId(session, chat), session, chat, title: chat.title.get() });
				} else {
					await this.chatSidePanel.open({ session, chat }, () => {
						if (this.active && !this._store.isDisposed) {
							this.focusChat(chat.resource);
						}
					});
				}
			}
		} catch (error) {
			this.logService.error('[ProjectBoard] Failed to create session', error);
			this.notificationService.error(localize('projectBoard.createFailed', "The new session could not be opened."));
		} finally {
			this.creatingSession = false;
			if (this.createSessionButton) {
				this.createSessionButton.enabled = true;
			}
		}
	}

	toggleAutoIncludeSessions(): void {
		const configuration = this.boardState.configuration.get();
		this.changeBoard(() => this.boardState.setAutoIncludeSessions(!configuration.autoIncludeSessions));
	}

	toggleOpenChatInSidePanel(): void {
		this.changeBoard(() => this.boardState.setOpenChatInSidePanel(!this.boardState.configuration.get().openChatInSidePanel));
	}

	toggleDisplayOption(key: keyof IProjectBoardDisplayOptions): void {
		const display = this.boardState.configuration.get().display;
		const enabled = key === 'showLastPrompt' ? display?.showLastPrompt === false : !display?.[key];
		this.changeBoard(() => this.boardState.setDisplayOption(key, enabled));
	}

	getAccessibleContent(): string {
		const lines = [this.title];
		const appendCurrentChat = (card: IProjectBoardCard) => {
			if (this.active && !this.showHeader && card.id === this.chatSidePanel.activeCardId.get()) {
				lines.push(localize('projectBoard.accessibleCurrentChat', "  Open in Side Panel"));
			}
		};
		if (!this.showSessionList) {
			lines.push(localize('projectBoard.selectionHelp', "Use each conversation's checkbox to select it, then Mark as Done to archive the selected conversations' sessions, including their other chats. No conversations are deleted."));
			lines.push(this.selectionLabel);
		}
		const appendGroup = (label: string, cards: readonly IProjectBoardCard[], collapsed: boolean, placement?: IProjectBoardPlacement) => {
			lines.push('', collapsed ? localize('projectBoard.collapsedGroup', "{0} (collapsed)", label) : label);
			const missing = this.getUnavailablePlacements(placement);
			const drafts = !placement && this.boardState.configuration.get().autoIncludeSessions ? this.drafts : [];
			if (collapsed) {
				lines.push(this.groupSummary(this.withChildCards(cards), missing.length, drafts));
			}
			for (const item of missing) {
				const details = this.getUnavailableDetails(item);
				lines.push(details.title, ...details.description);
			}
			if (!cards.length && !missing.length && !drafts.length) {
				lines.push(localize('projectBoard.accessibleEmpty', "No chats"));
				return;
			}
			for (const card of cards) {
				if (this.showSessionList) {
					lines.push(localize('projectBoard.accessibleSession', "{0}, {1}", card.sessionTitle, this.getStatusLabel(card, true)));
					for (const sibling of this.model.cards.filter(sibling => sibling.session === card.session && (this.showArchived || !sibling.archived))) {
						lines.push(localize('projectBoard.accessibleChildChat', "  {0}, {1}", sibling.title, this.getStatusLabel(sibling)));
						appendCurrentChat(sibling);
					}
				} else {
					lines.push(localize('projectBoard.accessibleCard', "{0}, {1}, {2}", card.title, card.sessionTitle, this.getStatusLabel(card)));
					appendCurrentChat(card);
					if (this.selectedCards.has(card.id)) {
						lines.push(localize('projectBoard.accessibleSelected', "  Selected"));
					}
					const children = this.withChildCards(this.model.getChildCards(card.id, this.showArchived));
					if (children.length) {
						const summary = this.childChatSummary(children);
						lines.push(this.collapsedChats.has(card.id) ? localize('projectBoard.collapsedGroup', "{0} (collapsed)", summary) : summary);
						for (const child of children) {
							lines.push(localize('projectBoard.accessibleChildChat', "  {0}, {1}", child.title, this.getStatusLabel(child)));
							appendCurrentChat(child);
						}
					}
				}
			}
		};
		appendGroup(localize('projectBoard.unassigned', "Unassigned"), this.model.getUnassignedCards(this.showArchived), this.unassignedCollapsed);
		for (const row of this.model.rows) {
			for (const column of this.model.columns) {
				const placement = { rowId: row.id, columnId: column.id };
				appendGroup(localize('projectBoard.cell', "{0}, {1}", row.label, column.label), this.model.getCards(row.id, column.id, this.showArchived), this.isCollapsed(placement), placement);
			}
		}
		return lines.join('\n');
	}

	private observeSessions(): void {
		if (!this.active) {
			return;
		}
		this.sessionObserver.clear();
		this.sessionObserver.value = autorunHandleChanges({
			changeTracker: {
				createChangeSummary: () => ({ previewOnly: true }),
				handleChange: (context, summary) => {
					if (!this.deferredRenderSources.has(context.changedObservable)) {
						summary.previewOnly = false;
					}
					return true;
				},
			},
		}, (reader, summary) => {
			this.deferredRenderSources.clear();
			this.waitingForPreview = false;
			if (!this.boardState.isAvailable.read(reader)) {
				return;
			}
			this.boardTitle.read(reader);
			this.model.setSortingDeferred(this.dragging || this.menuOpen || this.hasFocusedCard());
			this.drafts = this.chatWindows.drafts.read(reader);
			this.model.updateConfiguration(this.boardState.configuration.read(reader));
			const newSession = this.sessionsManagementService.newSession.read(reader);
			const sessions = this.sessionsManagementService.getSessions().filter(session => !newSession || session.providerId !== newSession.providerId || !isEqual(session.resource, newSession.resource));
			const sessionKeys = new Set(sessions.map(getProjectBoardSessionKey));
			for (const draft of this.sessionsManagementService.sessionDrafts.read(reader)) {
				const status = draft.status.read(reader);
				if (status !== SessionStatus.Untitled && status !== SessionStatus.Error && !sessionKeys.has(getProjectBoardSessionKey(draft))) {
					sessions.push(draft);
					sessionKeys.add(getProjectBoardSessionKey(draft));
				}
			}
			this.model.updateSessions(sessions, reader);
			this.pruneSelection();
			for (const card of this.model.cards) {
				getChatCapabilities(card.chat, undefined, reader);
				if (this.showSessionList) {
					card.session.status.read(reader);
				}
			}
			this.stateDurations.update(this.model.cards);
			this.updateMetadata(reader);
			this.updateConfigurationDetails(reader);
			this.updateChatActions(reader);
			this.updateQuestionPreviews(reader);
			if (this.waitingForPreview) {
				this.readPreview(observableSignalFromEvent(this, this.previewPool.onDidChangeAvailability), reader);
			}
			if (summary.previewOnly || this.creatingSession) {
				this.previewRender.schedule();
			} else {
				this.render();
			}
		});
		this.previewRender.flush();
	}

	private readPreview<T>(observable: IObservable<T>, reader: IReader): T {
		this.deferredRenderSources.add(observable);
		return observable.read(reader);
	}

	private updateConfigurationDetails(reader: IReader): void {
		this.configurationDetails.clear();
		const display = this.boardState.configuration.read(reader).display;
		const enabled = !!(display?.showModelDetails || display?.showPermissionDetails);
		for (const helper of this.metadataPreviews.values()) {
			helper.setIncludeConfiguration(enabled);
		}
		if (!enabled) {
			this.configurationErrors.clear();
			return;
		}
		observableSignalFromEvent(this, this.sessionsProvidersService.onDidChangeProviders).read(reader);
		const cards = this.getDisplayedCards();
		for (const id of this.configurationErrors) {
			if (!cards.some(card => card.id === id)) {
				this.configurationErrors.delete(id);
			}
		}
		for (const card of cards) {
			const helper = this.metadataPreviews.get(card.id);
			if (!helper) {
				const field = { label: localize('projectBoard.configuration', "Configuration"), value: localize('projectBoard.configurationLimit', "Preview limit reached. Open the chat for configuration.") };
				this.configurationDetails.set(card.id, { model: [field], permissions: [field] });
				continue;
			}
			try {
				const provider = this.sessionsProvidersService.getProvider(card.session.providerId);
				if (provider) {
					observableSignalFromEvent(this, provider.onDidChangeModels).read(reader);
					if (isAgentHostProvider(provider)) {
						observableSignalFromEvent(this, provider.onDidChangeSessionConfig).read(reader);
					}
				}
				const input = helper.configuration.read(reader);
				this.configurationDetails.set(card.id, getProjectBoardConfigurationDetails(card, input, provider, reader));
				this.configurationErrors.delete(card.id);
			} catch (error) {
				const message = localize('projectBoard.configurationFailed', "Configuration unavailable for \"{0}\".", card.title);
				const field = { label: localize('projectBoard.configuration', "Configuration"), value: message };
				this.configurationDetails.set(card.id, { model: [field], permissions: [field] });
				if (!this.configurationErrors.has(card.id)) {
					this.configurationErrors.add(card.id);
					this.logService.error('[ProjectBoard] Failed to read configuration', error);
					this.notificationService.error(message);
				}
			}
		}
	}

	private updateChatActions(reader: IReader): void {
		const active = new Set<string>();
		for (const card of this.getDisplayedCards()) {
			const pending = this.metadataPreviews.get(card.id)?.actions.read(reader);
			if (!pending || card.archived || card.readOnly || card.connection) {
				continue;
			}
			active.add(card.id);
			try {
				let widget = this.actionWidgets.get(card.id);
				if (!widget || widget.source.model !== pending.model || widget.source.request !== pending.request || widget.source.response !== pending.response) {
					this.actionWidgets.deleteAndDispose(card.id);
					widget = this.instantiationService.createInstance(ProjectBoardChatActions, pending, () => {
						const current = this.model.cards.find(current => current.id === card.id);
						return this.active && !!current && !current.archived && !current.readOnly && !current.connection;
					});
					this.actionWidgets.set(card.id, widget);
				} else {
					widget.update(pending);
				}
				this.actionErrors.delete(card.id);
			} catch (error) {
				this.actionWidgets.deleteAndDispose(card.id);
				if (!this.actionErrors.has(card.id)) {
					this.actionErrors.add(card.id);
					this.logService.error('[ProjectBoard] Failed to render pending chat actions', error);
					this.notificationService.error(localize('projectBoard.chatActionsUnavailable', "Pending actions could not be displayed. Open the chat to continue."));
				}
			}
		}
		for (const id of this.actionWidgets.keys()) {
			if (!active.has(id)) {
				this.actionWidgets.deleteAndDispose(id);
			}
		}
		for (const id of this.actionErrors) {
			if (!active.has(id)) {
				this.actionErrors.delete(id);
			}
		}
	}

	private updateMetadata(reader: IReader): void {
		const loadedModels = new Map([...this.readPreview(this.chatService.chatModels, reader)].map(model => [model.sessionResource.toString(), model]));
		for (const card of this.model.cards) {
			const resource = this.chatSessionsService.getMaterializedSessionResource(card.chat.resource) ?? card.chat.resource;
			const model = loadedModels.get(resource.toString());
			if (model) {
				this.readPreview(model.lastRequestObs, reader);
				this.readPreview(observableSignalFromEvent(this, model.onDidChange), reader);
				this.rememberPromptTime(card.id, getProjectBoardSubmittedAt(model));
			}
		}
		const visible = this.getDisplayedCards().slice(0, maxMetadataPreviews);
		const observed = new Set(visible.map(card => card.id));
		for (const id of this.metadataPreviews.keys()) {
			if (!observed.has(id)) {
				this.metadataPreviews.deleteAndDispose(id);
				this.metadataChats.delete(id);
				this.notifiedMetadataErrors.delete(id);
				this.notifiedCreditErrors.delete(id);
			}
		}
		this.metadataStates.clear();
		this.creditValues.clear();
		for (const card of visible) {
			if (this.metadataChats.get(card.id) !== card.chat) {
				const lease = this.previewPool.acquireMetadata(card.chat);
				if (!lease) {
					this.waitingForPreview = true;
					continue;
				}
				this.metadataPreviews.set(card.id, lease);
				this.metadataChats.set(card.id, card.chat);
			}
			const helper = this.metadataPreviews.get(card.id)!;
			const showCredits = !!this.boardState.configuration.read(reader).display?.showCredits;
			helper.setIncludeCredits(showCredits);
			const metadata = this.readPreview(helper.metadata, reader);
			if (showCredits) {
				this.creditValues.set(card.id, helper.credits.read(reader));
				const error = helper.creditsError.read(reader);
				if (error && this.notifiedCreditErrors.get(card.id) !== error) {
					this.notifiedCreditErrors.set(card.id, error);
					this.notificationService.error(localize('projectBoard.creditsFailed', "Could not read AI credit usage for \"{0}\".", card.title));
				} else if (!error) {
					this.notifiedCreditErrors.delete(card.id);
				}
			}
			this.metadataStates.set(card.id, metadata);
			if (metadata.kind === 'ready') {
				this.rememberPromptTime(card.id, metadata.submittedAt);
			}
			if (metadata.kind === 'error' && this.notifiedMetadataErrors.get(card.id) !== metadata.error) {
				this.notifiedMetadataErrors.set(card.id, metadata.error);
				this.notificationService.error(metadata.message);
			}
		}
	}

	private rememberPromptTime(cardId: string, submittedAt: number | undefined): void {
		this.model.setPromptRecency(cardId, submittedAt);
		if (submittedAt === undefined) {
			this.promptTimes.delete(cardId);
		} else {
			this.promptTimes.set(cardId, submittedAt);
		}
	}

	private updateQuestionPreviews(reader: IReader): void {
		const visible = this.getDisplayedCards();
		const observed = new Set(visible.filter(card => card.status === SessionStatus.NeedsInput).slice(0, maxQuestionPreviews).map(card => card.id));
		for (const id of this.questionPreviews.keys()) {
			if (!observed.has(id)) {
				this.questionPreviews.deleteAndDispose(id);
				this.questionChats.delete(id);
				this.notifiedPreviewErrors.delete(id);
			}
		}
		this.previewStates.clear();
		const activeQuestions = new Set<IChatQuestionCarousel>();
		for (const card of this.model.cards) {
			if (card.status !== SessionStatus.NeedsInput) {
				continue;
			}
			if (!observed.has(card.id)) {
				this.previewStates.set(card.id, {
					kind: 'unavailable', reason: 'previewLimit',
					message: localize('projectBoard.questionLimit', "Open this chat to view its pending questions."),
				});
				continue;
			}
			if (this.questionChats.get(card.id) !== card.chat) {
				const lease = this.previewPool.acquireQuestions(card.chat);
				if (!lease) {
					this.waitingForPreview = true;
					this.previewStates.set(card.id, { kind: 'unavailable', reason: 'previewLimit', message: localize('projectBoard.questionLimit', "Open this chat to view its pending questions.") });
					continue;
				}
				this.questionPreviews.set(card.id, lease);
				this.questionChats.set(card.id, card.chat);
			}
			const state = this.questionPreviews.get(card.id)!.preview.read(reader);
			const owner = this.questionPreviews.get(card.id)!;
			const questions = owner.questionCarousels.read(reader);
			if (!card.archived && !card.readOnly) {
				for (const question of questions) {
					activeQuestions.add(question.carousel);
					if (this.questionWidgets.get(question.carousel)?.owner !== owner) {
						this.createQuestionWidget(card.id, owner, question);
					}
				}
			}
			this.previewStates.set(card.id, state);
			if (state.kind === 'error' && this.notifiedPreviewErrors.get(card.id) !== state.error) {
				this.notifiedPreviewErrors.set(card.id, state.error);
				this.notificationService.error(state.message);
			}
		}
		for (const carousel of this.questionWidgets.keys()) {
			if (!activeQuestions.has(carousel)) {
				this.questionWidgets.deleteAndDispose(carousel);
			}
		}
	}

	private createQuestionWidget(cardId: string, owner: IProjectBoardQuestionLease, question: IProjectBoardPendingQuestion): void {
		const store = new DisposableStore();
		const element = mainWindow.document.createElement('div');
		element.className = 'project-board-live-question interactive-input-part';
		const container = mainWindow.document.createElement('div');
		container.className = 'chat-question-carousel-widget-container';
		element.appendChild(container);
		const scope = store.add(this.contextKeyService.createScoped(element));
		const instantiation = store.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, scope])));
		const part = store.add(instantiation.createInstance(ChatQuestionCarouselPart, question.carousel, undefined, {
			shouldAutoFocus: false,
			onSubmit: answers => {
				const current = this.model.cards.find(card => card.id === cardId);
				if (!current || current.archived || current.readOnly || !owner.submit(question, answers)) {
					if (owner.preview.get().kind !== 'error') {
						this.notificationService.warn(localize('projectBoard.staleQuestion', "This question can no longer be answered here. Open the chat to check its current state."));
					}
					return false;
				}
				return true;
			},
		}));
		container.appendChild(part.domNode);
		this.questionWidgets.set(question.carousel, { cardId, owner, element, part, dispose: () => store.dispose() });
	}

	private cellKey(placement: IProjectBoardPlacement): string {
		return JSON.stringify([placement.rowId, placement.columnId]);
	}

	private getDisplayedCards(): readonly IProjectBoardCard[] {
		if (this.showSessionList) {
			return [];
		}
		// Collapsing hides the retained cards rather than discarding entered answers or pending controls.
		return this.withChildCards([
			...this.model.getUnassignedCards(this.showArchived),
			...this.model.rows.flatMap(row => this.model.columns.flatMap(column => {
				const placement = { rowId: row.id, columnId: column.id };
				return this.model.getCards(row.id, column.id, this.showArchived).slice(0, this.visibleCounts.get(this.cellKey(placement)) ?? 3);
			})),
		]);
	}

	private withChildCards(cards: readonly IProjectBoardCard[]): readonly IProjectBoardCard[] {
		return this.showSessionList ? cards : cards.flatMap(card => [card, ...this.withChildCards(this.model.getChildCards(card.id, this.showArchived))]);
	}

	private render(): void {
		this.previewRender.cancel();
		if (!this.active || this.dragging || this.menuOpen) {
			return;
		}
		this.rendering = true;
		for (const id of this.collapsedRows) {
			if (!this.model.rows.some(row => row.id === id)) {
				this.collapsedRows.delete(id);
			}
		}
		for (const id of this.collapsedColumns) {
			if (!this.model.columns.some(column => column.id === id)) {
				this.collapsedColumns.delete(id);
			}
		}
		const scrollTop = this.boardElement.scrollTop;
		const scrollLeft = this.boardElement.scrollLeft;
		const ownerDocument = this.container.ownerDocument;
		// A background document retains activeElement but must not reclaim window focus.
		const activeElement = ownerDocument.hasFocus() ? ownerDocument.activeElement : null;
		const focusedCreate = activeElement === this.createSessionButton?.element;
		const focusedControl = activeElement?.getAttribute('data-board-control');
		const focusedQuestion = activeElement && [...this.questionWidgets.values()].some(widget => widget.element.contains(activeElement)) ? activeElement : undefined;
		const focusedAction = activeElement && [...this.actionWidgets.values()].some(widget => widget.element.contains(activeElement)) ? activeElement : undefined;
		const focusedCard = [...this.cardElements].find(([, element]) => activeElement && element.contains(activeElement));
		const focusedList = [...this.sessionLists.values()].find(entry => activeElement && entry.container.contains(activeElement));
		const focusedListChat = focusedList?.list.getFocusedChat();
		const focusedListSession = focusedList?.list.getFocusedSession();
		this.renderedSessionLists.clear();
		for (const entry of this.sessionLists.values()) {
			entry.container.remove();
		}
		const store = new DisposableStore();
		this.renderDisposables.value = store;
		this.cardElements.clear();
		this.activeChatLabels.clear();
		this.monitoredChildLabels.clear();
		this.cardCheckboxes.clear();
		this.controlElements.clear();
		this.selectionCount = undefined;
		this.markDoneButton = undefined;
		this.clearSelectionButton = undefined;
		this.durationElements.clear();
		this.recencyElements.clear();
		// Keep the scroll viewport and context-view hosts intact while rebuilding card content.
		this.boardElement.replaceChildren();

		const document = mainWindow.document;
		const board = this.boardElement;
		board.classList.toggle('project-board-session-list-mode', this.showSessionList);

		if (this.showHeader) {
			const header = document.createElement('header');
			header.className = 'project-board-header';
			const heading = document.createElement('div');
			const title = document.createElement('h1');
			title.textContent = this.title;
			heading.appendChild(title);
			const description = document.createElement('p');
			description.textContent = localize('projectBoard.description', "Arrange live chats by area and priority. Use arrow keys to navigate cards, Enter to open, and Escape to close the chat window.");
			heading.appendChild(description);
			header.appendChild(heading);

			const tools = document.createElement('div');
			tools.className = 'project-board-tools';
			for (const kind of ['row', 'column'] as const) {
				const add = this.createControl(tools, kind === 'row' ? localize('projectBoard.addRow', "Add Row") : localize('projectBoard.addColumn', "Add Column"), `add-${kind}`, store);
				store.add(add.onDidClick(() => { void this.addAxis(kind); }));
			}
			header.appendChild(tools);
			const archivedButton = store.add(new Button(tools, { ...defaultButtonStyles, secondary: true }));
			archivedButton.element.dataset.boardControl = 'show-archived';
			this.controlElements.set('show-archived', archivedButton.element);
			archivedButton.label = localize('projectBoard.showArchived', "Show Archived");
			archivedButton.element.setAttribute('aria-pressed', String(this.showArchived));
			store.add(archivedButton.onDidClick(() => this.toggleArchived()));
			const createButton = store.add(new Button(header, { ...defaultButtonStyles }));
			createButton.element.dataset.boardControl = 'new-session';
			this.controlElements.set('new-session', createButton.element);
			this.createSessionButton = createButton;
			createButton.label = localize('projectBoard.createSession', "New Session");
			createButton.enabled = !this.creatingSession;
			store.add(createButton.onDidClick(() => { void this.createSession(); }));
			const settings = this.createControl(header, localize('projectBoard.settings', "Settings"), 'settings', store);
			settings.label = '';
			settings.icon = Codicon.settingsGear;
			settings.element.classList.add('project-board-settings');
			settings.element.setAttribute('aria-haspopup', 'menu');
			settings.element.setAttribute('aria-label', localize('projectBoard.boardSettings', "Board settings"));
			store.add(this.hoverService.setupDelayedHover(settings.element, { content: localize('projectBoard.boardSettings', "Board settings") }));
			settings.enabled = this.boardState.canEdit;
			store.add(settings.onDidClick(() => this.showSettings(settings.element)));
			board.appendChild(header);
		}
		if (!this.showSessionList) {
			const selectionTools = document.createElement('div');
			selectionTools.className = 'project-board-selection-tools';
			selectionTools.setAttribute('role', 'group');
			selectionTools.setAttribute('aria-label', localize('projectBoard.selectionActions', "Conversation selection"));
			this.selectionCount = document.createElement('span');
			this.selectionCount.className = 'project-board-selection-count';
			this.selectionCount.setAttribute('role', 'status');
			this.selectionCount.setAttribute('aria-atomic', 'true');
			selectionTools.appendChild(this.selectionCount);
			this.markDoneButton = this.createControl(selectionTools, localize('projectBoard.markDone', "Mark as Done"), 'mark-done', store);
			store.add(this.markDoneButton.onDidClick(() => { void this.markCardsDone([...this.selectedCards]); }));
			this.clearSelectionButton = this.createControl(selectionTools, localize('projectBoard.clearSelection', "Clear Selection"), 'clear-selection', store);
			store.add(this.clearSelectionButton.onDidClick(() => {
				if (!this.markingDone) {
					this.selectedCards.clear();
					this.updateSelectionControls();
				}
			}));
			const description = document.createElement('span');
			description.className = 'project-board-selection-description';
			description.id = `project-board-selection-description-${this.viewId}`;
			description.textContent = localize('projectBoard.archiveScope', "Archives the selected conversations' sessions, including their other chats. No conversations are deleted.");
			this.markDoneButton.element.setAttribute('aria-describedby', description.id);
			selectionTools.appendChild(description);
			board.appendChild(selectionTools);
		}
		this.updateCustomViewContexts();
		if (!this.boardState.canEdit) {
			const warning = document.createElement('section');
			warning.className = 'project-board-storage-error';
			warning.setAttribute('role', 'alert');
			const text = document.createElement('p');
			text.textContent = localize('projectBoard.storageLocked', "Saved board data could not be read. Editing is disabled to preserve it. Restore the saved data or reset the board.");
			warning.appendChild(text);
			const reset = this.createControl(warning, localize('projectBoard.reset', "Reset Board"), 'reset', store);
			store.add(reset.onDidClick(() => { void this.resetBoard(); }));
			board.appendChild(warning);
		}

		const unassigned = this.createCardGroup(
			document,
			localize('projectBoard.unassigned', "Unassigned"),
			this.model.getUnassignedCards(this.showArchived),
			undefined,
			store,
		);
		unassigned.classList.add('project-board-unassigned');
		board.appendChild(unassigned);

		const grid = document.createElement('section');
		grid.className = 'project-board-grid';
		grid.style.gridTemplateColumns = `minmax(90px, auto) ${this.model.columns.map(column => this.collapsedColumns.has(column.id) ? 'minmax(72px, 90px)' : `minmax(${this.showSessionList ? 260 : 180}px, 1fr)`).join(' ')}`;
		grid.setAttribute('aria-label', localize('projectBoard.grid', "Project board"));

		const corner = document.createElement('div');
		corner.className = 'project-board-axis-corner';
		grid.appendChild(corner);
		for (const column of this.model.columns) {
			const heading = document.createElement('h2');
			heading.className = 'project-board-column-heading';
			this.renderAxis(heading, column, 'column', store);
			grid.appendChild(heading);
		}

		for (const row of this.model.rows) {
			const rowHeading = document.createElement('h2');
			rowHeading.className = 'project-board-row-heading';
			this.renderAxis(rowHeading, row, 'row', store);
			grid.appendChild(rowHeading);
			for (const column of this.model.columns) {
				grid.appendChild(this.createCardGroup(
					document,
					localize('projectBoard.cell', "{0}, {1}", row.label, column.label),
					this.model.getCards(row.id, column.id, this.showArchived),
					{ rowId: row.id, columnId: column.id },
					store,
				));
			}
		}

		board.appendChild(grid);
		for (const key of this.sessionLists.keys()) {
			if (!this.renderedSessionLists.has(key)) {
				this.sessionLists.deleteAndDispose(key);
			}
		}
		if (!this.showSessionList) {
			this.approvalModel.clear();
		}
		this.updateSelectionControls();
		this.updateActiveCard();
		this.layoutSessionLists();
		board.scrollTop = scrollTop;
		board.scrollLeft = scrollLeft;
		this.scrollable?.scanDomNode();
		if (this.scrollObserver) {
			for (const child of board.children) {
				store.add(this.scrollObserver.observe(child, { box: 'border-box' }));
			}
		}
		this.updateCardTimes();
		if (this.durationElements.size || this.recencyElements.size) {
			store.add(disposableWindowInterval(getWindow(this.container), () => this.updateCardTimes(), 1000));
		}
		this.rendering = false;
		if (ownerDocument.hasFocus()) {
			if (focusedAction?.isConnected && isHTMLElement(focusedAction)) {
				focusedAction.focus({ preventScroll: true });
			} else if (focusedQuestion?.isConnected && isHTMLElement(focusedQuestion)) {
				focusedQuestion.focus({ preventScroll: true });
			} else if (focusedControl) {
				const fallback = focusedControl.startsWith('more:') ? focusedControl.replace('more:', 'less:') : focusedControl.replace('less:', 'more:');
				(this.controlElements.get(focusedControl) ?? this.controlElements.get(fallback) ?? this.markDoneButton?.element)?.focus({ preventScroll: true });
			} else if (focusedCard) {
				const card = this.model.cards.find(card => card.id === focusedCard[0]);
				if (card && this.showSessionList) {
					this.focusChat(card.chat.resource);
				} else {
					this.cardElements.get(focusedCard[0])?.focus({ preventScroll: true });
				}
			} else if (focusedListSession) {
				this.focusChat(focusedListChat?.resource ?? focusedListSession.mainChat.get().resource);
			} else if (focusedCreate) {
				this.createSessionButton?.element.focus({ preventScroll: true });
			}
		}
		// The host's scroll container measures the board asynchronously (via a
		// resize observer), which can lag behind interactions like "+more" that
		// grow content well after the observer last fired. Notify explicitly so
		// the host can rescan right away and content stays reachable.
		this._onDidChangeContentSize.fire();
	}

	private updateActiveCard(activeCardId = this.chatSidePanel.activeCardId.get()): void {
		let changed = false;
		for (const [id, element] of this.cardElements) {
			const active = this.active && !this.showHeader && id === activeCardId;
			if (element.classList.contains('project-board-card-active-chat') === active) {
				continue;
			}
			changed = true;
			element.classList.toggle('project-board-card-active-chat', active);
			if (active) {
				element.setAttribute('aria-current', 'true');
			} else {
				element.removeAttribute('aria-current');
			}
			const indicator = this.activeChatLabels.get(id);
			if (indicator) {
				const descriptions = (element.getAttribute('aria-describedby') ?? '').split(' ').filter(id => id && id !== indicator.id);
				if (active) {
					descriptions.push(indicator.id);
				}
				element.setAttribute('aria-describedby', descriptions.join(' '));
			}
		}
		for (const [parentId, { element, children }] of this.monitoredChildLabels) {
			const child = this.active && !this.showHeader && this.collapsedChats.has(parentId)
				? children.find(child => child.id === activeCardId) : undefined;
			const label = child ? localize('projectBoard.monitoredChild', "Open in Side Panel: {0}", child.title) : '';
			if (element.hidden === !child && element.textContent === label) {
				continue;
			}
			changed = true;
			element.hidden = !child;
			element.textContent = label;
			const disclosure = this.controlElements.get(`collapse:children:${parentId}`);
			if (child) {
				disclosure?.setAttribute('aria-describedby', element.id);
			} else {
				disclosure?.removeAttribute('aria-describedby');
			}
		}
		if (changed && !this.rendering) {
			this._onDidChangeContentSize.fire();
		}
	}

	private createControl(container: HTMLElement, label: string, key: string, store: DisposableStore): Button {
		const frameless = key.startsWith('axis:') || key.startsWith('collapse:');
		const button = store.add(new Button(container, {
			...defaultButtonStyles, secondary: true,
			...(frameless ? {
				buttonSecondaryBorder: undefined,
				buttonSecondaryBackground: 'transparent',
				buttonSecondaryHoverBackground: 'var(--vscode-toolbar-hoverBackground)',
				buttonSecondaryForeground: 'var(--vscode-foreground)',
			} : {}),
		}));
		button.label = label;
		button.element.dataset.boardControl = key;
		if (key.startsWith('axis:') || key.startsWith('add-') || key.startsWith('remove:')) {
			button.enabled = this.boardState.canEdit;
		}
		this.controlElements.set(key, button.element);
		return button;
	}

	private canMarkDone(card: IProjectBoardCard): boolean {
		return !this.showSessionList && (this.boardState.configuration.get().autoIncludeSessions || !!this.model.getPlacement(card.id))
			&& !card.archived && card.status !== SessionStatus.Untitled && !card.connection
			&& !!this.sessionsProvidersService.getProvider(card.session.providerId);
	}

	private pruneSelection(): void {
		const eligible = new Set(this.model.cards.filter(card => this.canMarkDone(card)).map(card => card.id));
		for (const id of this.selectedCards) {
			if (!eligible.has(id)) {
				this.selectedCards.delete(id);
			}
		}
	}

	private get selectionLabel(): string {
		return this.selectedCards.size === 1
			? localize('projectBoard.oneSelected', "1 conversation selected")
			: localize('projectBoard.selectedCount', "{0} conversations selected", this.selectedCards.size);
	}

	private updateSelectionControls(): void {
		if (this.selectionCount) {
			this.selectionCount.textContent = this.markingDone
				? localize('projectBoard.markingDone', "Marking conversations as done…")
				: this.selectionLabel;
		}
		if (this.markDoneButton) {
			this.markDoneButton.enabled = this.selectedCards.size > 0 && !this.markingDone;
		}
		if (this.clearSelectionButton) {
			this.clearSelectionButton.enabled = this.selectedCards.size > 0 && !this.markingDone;
		}
		for (const [id, checkbox] of this.cardCheckboxes) {
			checkbox.checked = this.selectedCards.has(id);
			this.cardElements.get(id)?.classList.toggle('project-board-card-selected', checkbox.checked);
			if (this.markingDone) {
				checkbox.disable();
			} else {
				checkbox.enable();
			}
		}
	}

	private async markCardsDone(ids: readonly string[]): Promise<void> {
		if (this.markingDone || this._store.isDisposed || !this.active) {
			return;
		}
		this.pruneSelection();
		const targets = new Map<string, IProjectBoardCard[]>();
		for (const card of this.model.cards) {
			if (ids.includes(card.id) && this.canMarkDone(card)) {
				const key = getProjectBoardSessionKey(card.session);
				const cards = targets.get(key) ?? [];
				cards.push(card);
				targets.set(key, cards);
				this.selectedCards.add(card.id);
			}
		}
		if (!targets.size) {
			this.updateSelectionControls();
			return;
		}
		this.markingDone = true;
		this.updateSelectionControls();
		let failures = 0;
		let completed = 0;
		try {
			for (const [key, cards] of targets) {
				if (this._store.isDisposed) {
					break;
				}
				try {
					const session = this.sessionsManagementService.getSessions().find(session => getProjectBoardSessionKey(session) === key);
					const connection = session?.remoteConnectionStatus?.get();
					if (!session || !this.sessionsProvidersService.getProvider(session.providerId)
						|| (connection && connection.kind !== 'connected')
						|| (!session.isArchived.get() && !cards.some(card => session.chats.get().some(chat => isEqual(chat.resource, card.chat.resource)
							&& !chat.isArchived.get() && chat.status.get() !== SessionStatus.Untitled && chat.interactivity.get() !== ChatInteractivity.Hidden)))) {
						throw new Error('The selected session is no longer available');
					}
					// Mark as Done is session-scoped, even when several selected cards are siblings.
					if (!session.isArchived.get()) {
						await this.markSessionDone(session);
					}
					for (const card of cards) {
						this.selectedCards.delete(card.id);
					}
					completed++;
				} catch (error) {
					failures++;
					for (const card of this.model.cards) {
						if (cards.some(target => target.id === card.id) && this.canMarkDone(card)) {
							this.selectedCards.add(card.id);
						}
					}
					this.logService.error('[ProjectBoard] Failed to mark session as done', error);
				}
			}
		} finally {
			this.markingDone = false;
			if (!this._store.isDisposed) {
				this.pruneSelection();
				this.updateSelectionControls();
			}
		}
		if (failures) {
			this.notificationService.error(localize('projectBoard.markDoneFailed', "{0} of {1} sessions could not be marked as done. The remaining selected conversations can be retried.", failures, targets.size));
		}
		if (completed) {
			status(completed === 1
				? localize('projectBoard.oneMarkedDone', "1 session marked as done.")
				: localize('projectBoard.markDoneComplete', "{0} sessions marked as done.", completed));
		}
	}

	private showSettings(anchor: HTMLElement): void {
		this.menuOpen = true;
		const generation = ++this.menuGeneration;
		anchor.setAttribute('aria-expanded', 'true');
		const display = this.boardState.configuration.get().display;
		this.contextMenuService.showContextMenu({
			domForShadowRoot: this.container,
			getAnchor: () => anchor,
			getActions: () => [
				toAction({
					id: 'projectBoard.settings.sessionList',
					label: localize('projectBoard.toggleSessionList', "Toggle Session List"),
					checked: this.showSessionList,
					run: () => this.toggleDisplayOption('showSessionList'),
				}),
				toAction({
					id: 'projectBoard.settings.autoIncludeSessions',
					label: localize('projectBoard.autoIncludeSessions', "Auto-include Sessions"),
					checked: this.boardState.configuration.get().autoIncludeSessions,
					run: () => this.toggleAutoIncludeSessions(),
				}),
				...(this.showSessionList ? [] : [toAction({
					id: 'projectBoard.settings.stateDuration',
					label: localize('projectBoard.showStateDuration', "Show Time in State"),
					checked: !!display?.showStateDuration,
					run: () => this.toggleDisplayOption('showStateDuration'),
				}),
				toAction({
					id: 'projectBoard.settings.credits',
					label: localize('projectBoard.showCredits', "Show AI Credits"),
					checked: !!display?.showCredits,
					run: () => this.toggleDisplayOption('showCredits'),
				}),
				toAction({
					id: 'projectBoard.settings.lastPrompt',
					label: localize('projectBoard.showLastPrompt', "Show Last Prompt"),
					checked: display?.showLastPrompt !== false,
					run: () => this.toggleDisplayOption('showLastPrompt'),
				}),
				toAction({
					id: 'projectBoard.settings.modelDetails',
					label: localize('projectBoard.showModelDetails', "Show Model Details"),
					checked: !!display?.showModelDetails,
					run: () => this.toggleDisplayOption('showModelDetails'),
				}),
				toAction({
					id: 'projectBoard.settings.permissionDetails',
					label: localize('projectBoard.showPermissionDetails', "Show Agent & Permissions"),
					checked: !!display?.showPermissionDetails,
					run: () => this.toggleDisplayOption('showPermissionDetails'),
				})]),
				toAction({ id: 'projectBoard.renameBoard', label: localize('projectBoard.renameBoard', "Rename Board"), run: () => this.renameBoard() }),
				toAction({ id: 'projectBoard.deleteBoard', label: localize('projectBoard.deleteBoard', "Delete Board"), run: () => this.deleteBoard() }),
			],
			onHide: () => {
				if (generation !== this.menuGeneration) {
					return;
				}
				anchor.setAttribute('aria-expanded', 'false');
				this.menuOpen = false;
				this.refreshAfterMenu();
				if (anchor.ownerDocument.hasFocus()) {
					this.controlElements.get('settings')?.focus({ preventScroll: true });
				}
			},
		});
	}

	private updateCustomViewContexts(): void {
		if (!this.customViewContexts) {
			return;
		}
		const display = this.boardState.configuration.get().display;
		this.customViewContexts.editable.set(this.boardState.canEdit);
		this.customViewContexts.autoIncludeSessions.set(this.boardState.configuration.get().autoIncludeSessions);
		this.customViewContexts.openChatInSidePanel.set(!!this.boardState.configuration.get().openChatInSidePanel);
		this.customViewContexts.showArchived.set(this.showArchived);
		this.customViewContexts.showStateDuration.set(!!display?.showStateDuration);
		this.customViewContexts.showSessionList.set(!!display?.showSessionList);
		this.customViewContexts.showCredits.set(!!display?.showCredits);
		this.customViewContexts.showLastPrompt.set(display?.showLastPrompt !== false);
		this.customViewContexts.showModelDetails.set(!!display?.showModelDetails);
		this.customViewContexts.showPermissionDetails.set(!!display?.showPermissionDetails);
	}

	private renderAxis(container: HTMLElement, axis: IProjectBoardAxis, kind: 'row' | 'column', store: DisposableStore): void {
		const collapsed = (kind === 'row' ? this.collapsedRows : this.collapsedColumns).has(axis.id);
		const controls = mainWindow.document.createElement('div');
		controls.className = 'project-board-axis-controls';
		container.appendChild(controls);
		const axisName = kind === 'row' ? localize('projectBoard.row', "row") : localize('projectBoard.column', "column");
		const placementIds = kind === 'row'
			? this.model.columns.map(column => `${this.groupId({ rowId: axis.id, columnId: column.id })}-cards`)
			: this.model.rows.map(row => `${this.groupId({ rowId: row.id, columnId: axis.id })}-cards`);
		const button = this.createControl(controls, axis.label, `axis:${kind}:${axis.id}`, store);
		this.createCollapseControl(controls, `collapse:${kind}:${axis.id}`, localize('projectBoard.axisName', "{0}: {1}", axisName, axis.label), collapsed, placementIds, () => {
			const ids = kind === 'row' ? this.collapsedRows : this.collapsedColumns;
			if (ids.has(axis.id)) {
				ids.delete(axis.id);
			} else {
				ids.add(axis.id);
			}
		}, store);
		if (collapsed) {
			const cards = this.withChildCards(kind === 'row'
				? this.model.columns.flatMap(column => this.model.getCards(axis.id, column.id, this.showArchived))
				: this.model.rows.flatMap(row => this.model.getCards(row.id, axis.id, this.showArchived)));
			const missing = this.boardState.configuration.get().placements.filter(placement => (kind === 'row' ? placement.rowId : placement.columnId) === axis.id && !this.model.hasChat(placement.cardId)).length;
			const summary = mainWindow.document.createElement('span');
			summary.className = 'project-board-collapsed-summary';
			summary.textContent = this.sessionCountLabel(cards.length + missing);
			this.appendStateCounts(summary, cards, missing);
			container.appendChild(summary);
		}
		button.element.setAttribute('aria-label', localize('projectBoard.editAxis', "Edit {0}: {1}", kind === 'row' ? localize('projectBoard.row', "row") : localize('projectBoard.column', "column"), axis.label));
		store.add(button.onDidClick(() => {
			this.menuOpen = true;
			const generation = ++this.menuGeneration;
			const axes = kind === 'row' ? this.model.rows : this.model.columns;
			const index = axes.findIndex(item => item.id === axis.id);
			this.contextMenuService.showContextMenu({
				domForShadowRoot: this.container,
				getAnchor: () => button.element,
				getActions: () => [
					toAction({ id: 'projectBoard.axis.rename', label: localize('projectBoard.rename', "Rename"), run: () => this.editAxis(kind, axis) }),
					toAction({ id: 'projectBoard.axis.previous', label: kind === 'row' ? localize('projectBoard.moveUp', "Move Up") : localize('projectBoard.moveLeft', "Move Left"), enabled: index > 0, run: () => this.changeBoard(() => this.boardState.reorderAxis(kind, axis.id, index - 1)) }),
					toAction({ id: 'projectBoard.axis.next', label: kind === 'row' ? localize('projectBoard.moveDown', "Move Down") : localize('projectBoard.moveRight', "Move Right"), enabled: index < axes.length - 1, run: () => this.changeBoard(() => this.boardState.reorderAxis(kind, axis.id, index + 1)) }),
					toAction({ id: 'projectBoard.axis.delete', label: localize('projectBoard.deleteAxis', "Delete"), enabled: axes.length > 1, run: () => this.deleteAxis(kind, axis) }),
				],
				onHide: () => {
					if (generation !== this.menuGeneration) {
						return;
					}
					this.menuOpen = false;
					this.refreshAfterMenu();
					if (container.ownerDocument.hasFocus()) {
						this.controlElements.get(`axis:${kind}:${axis.id}`)?.focus({ preventScroll: true });
					}
				},
			});
		}));
	}

	private groupId(placement: IProjectBoardPlacement | undefined): string {
		return `${this.viewId}-${placement ? encodeURIComponent(this.cellKey(placement)) : 'unassigned'}`;
	}

	private sessionCountLabel(count: number): string {
		return count === 1 ? localize('projectBoard.collapsedSingleSession', "1 session") : localize('projectBoard.collapsedSessionCount', "{0} sessions", count);
	}

	private groupSummary(cards: readonly IProjectBoardCard[], unavailable = 0, drafts: readonly IProjectBoardDraft[] = []): string {
		return [this.sessionCountLabel(cards.length + unavailable + drafts.length), ...this.stateCounts(cards, unavailable, drafts).map(state => state.label)].join(' · ');
	}

	private appendStateCounts(summary: HTMLElement, cards: readonly IProjectBoardCard[], unavailable = 0, drafts: readonly IProjectBoardDraft[] = []): void {
		for (const { label, glyph } of this.stateCounts(cards, unavailable, drafts)) {
			const state = summary.ownerDocument.createElement('span');
			state.className = 'project-board-state-count';
			const icon = summary.ownerDocument.createElement('span');
			icon.className = 'project-board-state-count-icon';
			icon.setAttribute('aria-hidden', 'true');
			icon.textContent = glyph;
			state.append(icon, ` ${label}`);
			summary.append(' · ', state);
		}
	}

	private stateCounts(cards: readonly IProjectBoardCard[], unavailable = 0, drafts: readonly IProjectBoardDraft[] = []): { label: string; glyph: string }[] {
		const counts = new Map<SessionStatus, number>();
		for (const card of cards) {
			const state = this.getPresentationStatus(card);
			counts.set(state, (counts.get(state) ?? 0) + 1);
		}
		const startingDrafts = drafts.filter(draft => draft.submitted).length;
		const states: readonly [number, string, string][] = [
			[counts.get(SessionStatus.InProgress) ?? 0, localize('projectBoard.busy', "Busy"), this.getStatusGlyph(SessionStatus.InProgress)],
			[counts.get(SessionStatus.NeedsInput) ?? 0, localize('projectBoard.needsInput', "Needs Input"), this.getStatusGlyph(SessionStatus.NeedsInput)],
			[counts.get(SessionStatus.Error) ?? 0, localize('projectBoard.error', "Error"), this.getStatusGlyph(SessionStatus.Error)],
			[counts.get(SessionStatus.Completed) ?? 0, localize('projectBoard.idle', "Idle"), this.getStatusGlyph(SessionStatus.Completed)],
			[(counts.get(SessionStatus.Untitled) ?? 0) + startingDrafts, localize('projectBoard.startingState', "Starting"), '\u23F3'],
			[drafts.length - startingDrafts, localize('projectBoard.draftState', "Draft"), '\u270F\uFE0F'],
			[unavailable, localize('projectBoard.unavailableState', "Unavailable"), '\u{1F6AB}'],
		];
		return states.filter(([count]) => count > 0).map(([count, label, glyph]) => ({ label: localize('projectBoard.stateCount', "{0} {1}", count, label), glyph }));
	}

	private isCollapsed(placement: IProjectBoardPlacement | undefined): boolean {
		return placement ? this.collapsedRows.has(placement.rowId) || this.collapsedColumns.has(placement.columnId) : this.unassignedCollapsed;
	}

	private expandPlacement(placement: IProjectBoardPlacement | undefined): boolean {
		if (!placement) {
			const changed = this.unassignedCollapsed;
			this.unassignedCollapsed = false;
			return changed;
		}
		const rowChanged = this.collapsedRows.delete(placement.rowId);
		const columnChanged = this.collapsedColumns.delete(placement.columnId);
		return rowChanged || columnChanged;
	}

	private visibleCardElements(): HTMLElement[] {
		return [...this.cardElements.values()].filter(element => !element.closest('.project-board-card-list[hidden], .project-board-child-cards[hidden]'));
	}

	private createCollapseControl(container: HTMLElement, key: string, name: string, collapsed: boolean, controlledIds: string[], toggle: () => void, store: DisposableStore): void {
		const button = this.createControl(container, '', key, store);
		button.icon = collapsed ? Codicon.chevronRight : Codicon.chevronDown;
		button.element.classList.add('project-board-collapse');
		const label = collapsed ? localize('projectBoard.expandGroup', "Expand {0}", name) : localize('projectBoard.collapseGroup', "Collapse {0}", name);
		button.element.setAttribute('aria-label', label);
		button.element.setAttribute('aria-expanded', String(!collapsed));
		button.element.setAttribute('aria-controls', controlledIds.join(' '));
		store.add(this.hoverService.setupDelayedHover(button.element, { content: label }));
		store.add(button.onDidClick(() => {
			toggle();
			this.render();
			if (container.ownerDocument.hasFocus()) {
				this.controlElements.get(key)?.focus({ preventScroll: true });
			}
		}));
	}

	private async editAxis(kind: 'row' | 'column', axis?: IProjectBoardAxis): Promise<void> {
		const label = await this.quickInputService.input({
			title: axis ? localize('projectBoard.renameAxis', "Rename Board Axis") : kind === 'row' ? localize('projectBoard.addRow', "Add Row") : localize('projectBoard.addColumn', "Add Column"),
			value: axis?.label,
			ignoreFocusLost: true,
			prompt: localize('projectBoard.axisLabel', "Enter a nonempty label."),
			validateInput: async value => value.trim() ? undefined : localize('projectBoard.emptyAxis', "The label must not be empty."),
		});
		if (label === undefined || !this.active) {
			return;
		}
		this.changeBoard(() => {
			if (axis) {
				this.boardState.renameAxis(kind, axis.id, label);
			} else {
				this.boardState.addAxis(kind, label);
			}
		});
	}

	private async deleteAxis(kind: 'row' | 'column', axis: IProjectBoardAxis): Promise<void> {
		const count = this.boardState.getAffectedCardCount(kind, axis.id);
		if (count) {
			const result = await this.dialogService.confirm({
				message: localize('projectBoard.confirmDeleteAxis', "Delete \"{0}\"?", axis.label),
				detail: localize('projectBoard.deleteAxisDetail', "{0} chat placements, including archived or unavailable chats, will return to Unassigned. No chats will be deleted.", count),
				primaryButton: localize('projectBoard.deleteAxis', "Delete"),
			});
			if (!result.confirmed) {
				return;
			}
			if (this.boardState.getAffectedCardCount(kind, axis.id) !== count) {
				return this.deleteAxis(kind, axis);
			}
		}
		this.changeBoard(() => this.boardState.deleteAxis(kind, axis.id));
	}

	private changeBoard(change: () => void): void {
		try {
			change();
		} catch (error) {
			this.logService.error('[ProjectBoard] Board configuration change failed', error);
		}
	}

	private refreshAfterMenu(focusChat?: URI): void {
		queueMicrotask(() => {
			if (this.active && !this._store.isDisposed && !this.menuOpen) {
				this.observeSessions();
				if (focusChat && this.container.ownerDocument.hasFocus()) {
					this.focusChat(focusChat);
				}
			}
		});
	}

	private async resetBoard(): Promise<void> {
		if (!this.catalog.canEdit) {
			await this.recoverHub();
			return;
		}
		const result = await this.dialogService.confirm({
			message: localize('projectBoard.confirmReset', "Reset the saved board?"),
			detail: localize('projectBoard.resetDetail', "This replaces saved labels and placements with the default board. Chats and their conversations will not be deleted."),
			primaryButton: localize('projectBoard.reset', "Reset Board"),
		});
		if (result.confirmed) {
			this.changeBoard(() => this.boardState.reset());
		}
	}

	private createCardGroup(
		document: Document,
		label: string,
		cards: readonly IProjectBoardCard[],
		placement: IProjectBoardPlacement | undefined,
		store: DisposableStore,
	): HTMLElement {
		const group = document.createElement('section');
		group.className = 'project-board-card-group';
		group.id = this.groupId(placement);
		const collapsed = this.isCollapsed(placement);
		group.classList.toggle('project-board-card-group-collapsed', collapsed);
		group.setAttribute('aria-label', label);
		group.tabIndex = 0;

		const heading = document.createElement('h3');
		heading.textContent = label;
		if (!placement) {
			heading.className = 'project-board-tray-heading';
			heading.textContent = '';
			const name = document.createElement('span');
			name.textContent = label;
			heading.appendChild(name);
			this.createCollapseControl(heading, 'collapse:unassigned', label, collapsed, [`${group.id}-cards`], () => {
				this.unassignedCollapsed = !this.unassignedCollapsed;
			}, store);
		}
		group.appendChild(heading);
		const allCards = this.withChildCards(cards);
		const needsInput = allCards.filter(card => this.getPresentationStatus(card) === SessionStatus.NeedsInput).length;
		if (needsInput && !collapsed) {
			const attention = document.createElement('span');
			attention.className = 'project-board-attention';
			attention.textContent = localize('projectBoard.attention', "{0} Needs Input", needsInput);
			group.appendChild(attention);
		}

		const list = document.createElement('div');
		list.className = 'project-board-card-list';
		const autoIncludeSessions = this.boardState.configuration.get().autoIncludeSessions;
		list.id = `${group.id}-cards`;
		list.hidden = collapsed;
		const missing = this.getUnavailablePlacements(placement);
		const totalCount = cards.length + missing.length;
		if (collapsed) {
			const summary = document.createElement('span');
			summary.className = 'project-board-collapsed-summary';
			const drafts = placement || !autoIncludeSessions ? [] : this.drafts;
			summary.textContent = this.sessionCountLabel(allCards.length + missing.length + drafts.length);
			this.appendStateCounts(summary, allCards, missing.length, drafts);
			group.appendChild(summary);
		}
		if (!placement && autoIncludeSessions) {
			for (const draft of this.drafts) {
				list.appendChild(this.createDraftCard(document, draft, store));
			}
		}
		const limit = placement && !this.showSessionList ? this.visibleCounts.get(this.cellKey(placement)) ?? 3 : cards.length;
		if (this.showSessionList && cards.length) {
			list.appendChild(this.getSessionList(cards.map(card => card.session), placement).container);
		} else {
			for (const card of cards.slice(0, limit)) {
				list.appendChild(this.createCardFamily(document, card, store));
			}
		}
		const unknownHidden = this.withChildCards(cards.slice(limit)).filter(card => !this.promptTimes.has(card.id)).length;
		if (unknownHidden && !collapsed) {
			const recency = document.createElement('p');
			recency.className = 'project-board-recency-warning';
			recency.textContent = localize('projectBoard.hiddenRecency', "Recency unavailable for {0} hidden chats. Expand to load their metadata.", unknownHidden);
			group.appendChild(recency);
		}
		for (const placement of missing.slice(0, this.showSessionList ? missing.length : Math.max(0, limit - cards.length))) {
			const details = this.getUnavailableDetails(placement);
			const unavailable = document.createElement('article');
			unavailable.className = 'project-board-card project-board-card-unavailable';
			const title = document.createElement('h4');
			title.textContent = details.title;
			unavailable.appendChild(title);
			for (const text of details.description) {
				const message = document.createElement('p');
				message.textContent = text;
				unavailable.appendChild(message);
			}
			const remove = this.createControl(unavailable, localize('projectBoard.removePlacement', "Remove Placement"), `remove:${placement.cardId}`, store);
			store.add(remove.onDidClick(() => this.changeBoard(() => this.boardState.moveCard(placement.cardId, undefined))));
			list.appendChild(unavailable);
		}
		if (totalCount === 0 && (placement || !autoIncludeSessions || this.drafts.length === 0)) {
			const empty = document.createElement('span');
			empty.className = 'project-board-empty';
			empty.textContent = this.showSessionList ? localize('projectBoard.emptySessionList', "Drop a session here") : localize('projectBoard.empty', "Drop a chat here");
			list.appendChild(empty);
		}
		group.appendChild(list);
		if (placement && totalCount > 3 && !collapsed && !this.showSessionList) {
			const key = this.cellKey(placement);
			const hidden = Math.max(0, totalCount - limit);
			if (hidden) {
				const more = store.add(new Button(group, { ...defaultButtonStyles, secondary: true }));
				more.element.classList.add('project-board-more');
				more.element.dataset.boardControl = `more:${key}`;
				this.controlElements.set(`more:${key}`, more.element);
				more.label = localize('projectBoard.more', "+{0} more", hidden);
				store.add(more.onDidClick(() => {
					this.visibleCounts.set(key, limit + 3);
					this.observeSessions();
				}));
			}
			if (limit > 3) {
				const less = store.add(new Button(group, { ...defaultButtonStyles, secondary: true }));
				less.element.classList.add('project-board-less');
				less.element.dataset.boardControl = `less:${key}`;
				this.controlElements.set(`less:${key}`, less.element);
				less.label = localize('projectBoard.less', "Show Less");
				store.add(less.onDidClick(() => {
					this.visibleCounts.delete(key);
					this.observeSessions();
				}));
			}
		}

		store.add(addDisposableListener(group, EventType.DRAG_OVER, event => this.onDragOver(event, placement)));
		store.add(addDisposableListener(group, EventType.DROP, event => this.onDrop(event, placement)));
		if (placement && !collapsed) {
			group.setAttribute('aria-description', localize('projectBoard.cellCreation', "Double-click empty space to start a new session in this cell."));
			store.add(addDisposableListener(group, EventType.DBLCLICK, event => {
				if (this.boardState.canEdit && (event.target === group || event.target === heading || event.target === list
					|| isHTMLElement(event.target) && event.target.classList.contains('project-board-empty'))) {
					event.preventDefault();
					void this.createSession(placement);
				}
			}));
		}

		return group;
	}

	private getUnavailablePlacements(placement: IProjectBoardPlacement | undefined): readonly IProjectBoardSavedPlacement[] {
		return placement ? this.boardState.configuration.get().placements.filter(item =>
			item.rowId === placement.rowId && item.columnId === placement.columnId && !this.model.hasChat(item.cardId)) : [];
	}

	private getUnavailableDetails(placement: IProjectBoardSavedPlacement): { title: string; description: string[] } {
		const identity = placement.lastKnown;
		const [provider, session, chat] = placement.cardId.split('\0');
		return {
			title: identity?.title || localize('projectBoard.unavailableChat', "Unavailable Chat"),
			description: [
				identity ? localize('projectBoard.lastKnownChat', "Unavailable - last known details")
					: localize('projectBoard.noSavedChatTitle', "Unavailable - no saved title"),
				...(identity?.sessionTitle ? [localize('projectBoard.lastKnownSession', "Session: {0}", identity.sessionTitle)] : []),
				...(identity?.workspace ? [localize('projectBoard.lastKnownWorkspace', "Workspace: {0}", identity.workspace)] : []),
				...(session && chat ? [localize('projectBoard.lastKnownProvider', "Provider: {0}", provider)] : []),
				...(!identity?.title ? [localize('projectBoard.unavailableChatId', "Chat: {0}", chat ?? placement.cardId)] : []),
				localize('projectBoard.retainedPlacement', "This chat is not currently listed by its provider. It may be temporarily unavailable or deleted. Its board placement is retained."),
			],
		};
	}

	private childChatCountLabel(count: number): string {
		return count === 1
			? localize('projectBoard.oneChildChat', "1 child chat")
			: localize('projectBoard.childChats', "{0} child chats", count);
	}

	private childChatSummary(children: readonly IProjectBoardCard[]): string {
		return [this.childChatCountLabel(children.length), ...this.stateCounts(children).map(state => state.label)].join(' · ');
	}

	private createCardFamily(document: Document, card: IProjectBoardCard, store: DisposableStore): HTMLElement {
		const parent = this.createCard(document, card, store);
		const children = this.model.getChildCards(card.id, this.showArchived);
		if (!children.length) {
			return parent;
		}
		const family = document.createElement('div');
		family.className = 'project-board-card-family';
		const childCards = document.createElement('div');
		childCards.className = 'project-board-child-cards';
		childCards.id = `project-board-children-${generateUuid()}`;
		childCards.hidden = this.collapsedChats.has(card.id);
		childCards.setAttribute('role', 'group');
		const name = localize('projectBoard.childrenOf', "Child chats of {0}", card.title);
		childCards.setAttribute('aria-label', name);
		const heading = document.createElement('div');
		heading.className = 'project-board-child-heading';
		const summary = document.createElement('span');
		summary.className = 'project-board-child-summary';
		const descendants = this.withChildCards(children);
		summary.textContent = this.childChatCountLabel(descendants.length);
		this.appendStateCounts(summary, descendants);
		const monitoredChild = document.createElement('span');
		monitoredChild.className = 'project-board-monitored-child-label';
		monitoredChild.id = `project-board-monitored-child-${generateUuid()}`;
		monitoredChild.hidden = true;
		summary.appendChild(monitoredChild);
		this.monitoredChildLabels.set(card.id, { element: monitoredChild, children: descendants });
		heading.appendChild(summary);
		this.createCollapseControl(heading, `collapse:children:${card.id}`, name, childCards.hidden, [childCards.id], () => {
			if (!this.collapsedChats.delete(card.id)) {
				this.collapsedChats.add(card.id);
			}
		}, store);
		for (const child of children) {
			childCards.appendChild(this.createCardFamily(document, child, store));
		}
		family.append(parent, heading, childCards);
		return family;
	}

	private getPresentationStatus(card: IProjectBoardCard): SessionStatus {
		return this.showSessionList ? card.session.status.get() : card.status;
	}

	private getSessionList(sessions: readonly ISession[], placement: IProjectBoardPlacement | undefined): IProjectBoardSessionList {
		const key = this.groupId(placement);
		this.renderedSessionLists.add(key);
		let entry = this.sessionLists.get(key);
		if (!entry) {
			const disposables = new DisposableStore();
			const container = mainWindow.document.createElement('div');
			container.className = 'project-board-session-list';
			if (!this.approvalModel.value) {
				this.approvalModel.value = this.instantiationService.createInstance(AgentSessionApprovalModel);
			}
			const list = disposables.add(this.instantiationService.createInstance(SessionsFlatList, container, {
				showSessionHover: false,
				alwaysConsumeMouseWheel: false,
				useCompactQuickChatRows: false,
				showChatChildren: true,
				markSessionReadOnOpen: false,
				approvalModel: this.approvalModel.value,
				onSessionOpen: resource => {
					const session = this.sessionsManagementService.getSessions().find(session => isEqual(session.resource, resource));
					if (session) {
						void this.openSessionChat(session, session.mainChat.get());
					} else {
						this.notificationService.warn(localize('projectBoard.sessionGone', "This session is no longer available."));
					}
				},
				onChatOpen: (session, chat) => { void this.openSessionChat(session, chat); },
				onSessionDragStart: (session, event) => {
					if (!this.boardState.canEdit) {
						event.preventDefault();
						return;
					}
					this.dragging = true;
					this.model.setSortingDeferred(true);
					event.dataTransfer?.setData(SessionsDataTransfers.SESSION, JSON.stringify({ sessionId: session.sessionId, resource: session.resource.toString() }));
					if (event.dataTransfer) {
						event.dataTransfer.effectAllowed = 'move';
					}
				},
				onSessionDragEnd: () => {
					this.dragging = false;
					this.model.setSortingDeferred(false);
					this.observeSessions();
				},
				onSessionDragOver: event => this.onDragOver(event, placement),
				onSessionDrop: event => this.onDrop(event, placement),
			}));
			disposables.add(list.onDidChangeContentHeight(() => {
				if (!this.rendering) {
					this.layoutSessionLists();
					this._onDidChangeContentSize.fire();
				}
			}));
			disposables.add(addStandardDisposableListener(container, EventType.KEY_DOWN, event => {
				if (!event.browserEvent.repeat && event.equals(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyM)) {
					const session = list.getFocusedSession();
					const card = this.model.cards.find(card => card.session === session);
					if (card) {
						event.preventDefault();
						event.stopPropagation();
						void this.pickPlacement(card);
					}
				}
			}));
			entry = { container, list, placement, sessions: [], dispose: () => { disposables.dispose(); container.remove(); } };
			this.sessionLists.set(key, entry);
		}
		if (entry.sessions.length !== sessions.length || entry.sessions.some((session, index) => session !== sessions[index])) {
			entry.sessions = sessions;
			entry.list.setSessions(sessions);
		}
		return entry;
	}

	private layoutSessionLists(): void {
		for (const entry of this.sessionLists.values()) {
			if (entry.container.isConnected && !this.isCollapsed(entry.placement)) {
				const height = entry.list.getContentHeight();
				entry.container.style.height = `${height}px`;
				entry.list.layout(height, entry.container.clientWidth);
			}
		}
	}

	private async openSessionChat(session: ISession, chat: IChat): Promise<void> {
		const card = this.model.cards.find(card => card.session === session && isEqual(card.chat.resource, chat.resource));
		if (!card) {
			this.notificationService.warn(localize('projectBoard.chatGone', "This chat is no longer available."));
			return;
		}
		await this.openCard(card);
	}

	private onDragOver(event: DragEvent, placement: IProjectBoardPlacement | undefined): boolean {
		if (this.boardState.canEdit && (event.dataTransfer?.types.includes(projectBoardDragDataType)
			|| ((placement || this.showSessionList) && event.dataTransfer?.types.includes(SessionsDataTransfers.SESSION)))) {
			event.preventDefault();
			event.dataTransfer!.dropEffect = 'move';
			return true;
		}
		return false;
	}

	private onDrop(event: DragEvent, placement: IProjectBoardPlacement | undefined): void {
		if (!this.boardState.canEdit) {
			return;
		}
		const cardId = event.dataTransfer?.getData(projectBoardDragDataType);
		const session = (placement || this.showSessionList) && getSessionDragData(event);
		if (!cardId && !session) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		this.dragging = false;
		this.model.setSortingDeferred(false);
		if (cardId) {
			this.moveCard(cardId, placement);
			return;
		}
		if (session) {
			const resource = URI.parse(session.resource);
			const cardIds = this.model.cards
				.filter(card => card.session.sessionId === session.sessionId && isEqual(card.session.resource, resource))
				.map(card => card.id);
			if (!cardIds.length) {
				this.notificationService.warn(localize('projectBoard.sessionHasNoChats', "This session has no chats that can be added to the board."));
				return;
			}
			this.moveCards(cardIds, placement);
		}
	}

	private createDraftCard(document: Document, draft: IProjectBoardDraft, store: DisposableStore): HTMLElement {
		const element = document.createElement('article');
		element.className = 'project-board-card project-board-card-draft';
		element.dataset.draftId = draft.id;
		const title = document.createElement('h4');
		title.textContent = localize('projectBoard.newSession', "New Session");
		element.appendChild(title);
		const statusLabel = draft.submitted
			? localize('projectBoard.startingSession', "Starting…")
			: localize('projectBoard.sessionDraft', "Draft");
		element.setAttribute('aria-label', localize('projectBoard.draftLabel', "{0}, {1}", title.textContent, statusLabel));
		element.appendChild(this.createStatus(document, statusLabel, draft.submitted ? '\u{1F3C3}' : '\u270F\uFE0F', draft.submitted));
		const detail = document.createElement('p');
		detail.textContent = draft.submitted
			? localize('projectBoard.waitingForSession', "Waiting for the session to appear.")
			: draft.hasContent
				? localize('projectBoard.unsentDraft', "Unsent draft")
				: localize('projectBoard.enterPrompt', "Enter a prompt to start this session.");
		element.appendChild(detail);
		const openDraft = async () => {
			try {
				await this.chatWindows.openDraft(draft.id);
				this.onOpenChat(URI.parse(draft.id));
			} catch (error) {
				this.logService.error('[ProjectBoard] Failed to open draft', error);
				this.notificationService.error(localize('projectBoard.openDraftFailed', "The session draft could not be opened."));
			}
		};
		this.cardElements.set(`draft:${draft.id}`, element);
		this.createDeleteButton(document, element, localize('projectBoard.deleteDraft', "Delete Session Draft"), async () => {
			const confirmed = await this.dialogService.confirm({
				message: localize('projectBoard.deleteDraftConfirm', "Are you sure you want to delete this session draft?"),
				detail: localize('projectBoard.deleteDraftDetail', "This action cannot be undone."),
				primaryButton: localize('projectBoard.delete', "Delete"),
			});
			if (!confirmed.confirmed) {
				return;
			}
			if (await this.chatWindows.deleteDraft(draft.id)) {
				status(localize('projectBoard.draftDeleted', "Session draft deleted."));
			}
		}, store);
		this.registerCardInteractions(element, openDraft, store);
		return element;
	}

	private createCard(document: Document, card: IProjectBoardCard, store: DisposableStore): HTMLElement {
		const element = document.createElement('article');
		const descriptions: string[] = [];
		const describe = (content: HTMLElement) => {
			content.id = `project-board-detail-${generateUuid()}`;
			descriptions.push(content.id);
		};
		element.className = `project-board-card project-board-card-${this.getStatusClass(card)}`;
		element.dataset.chatResource = card.chat.resource.toString();
		element.draggable = this.boardState.canEdit;
		element.setAttribute('aria-label', localize('projectBoard.cardLabel', "{0}, {1}, {2}", card.title, card.sessionTitle, this.getStatusLabel(card)));

		const title = document.createElement('h4');
		title.textContent = card.title;
		store.add(this.hoverService.setupDelayedHover(title, { content: card.title }));
		const heading = document.createElement('div');
		heading.className = 'project-board-card-heading';
		if (this.canMarkDone(card)) {
			const checkbox = store.add(new Checkbox(localize('projectBoard.selectConversation', "Select {0}", card.title), this.selectedCards.has(card.id), defaultCheckboxStyles));
			checkbox.domNode.classList.add('project-board-card-select');
			const controlId = `select:${card.id}`;
			checkbox.domNode.dataset.boardControl = controlId;
			this.controlElements.set(controlId, checkbox.domNode);
			this.cardCheckboxes.set(card.id, checkbox);
			store.add(addDisposableListener(checkbox.domNode, EventType.KEY_DOWN, event => {
				if (event.repeat && (event.key === ' ' || event.key === 'Enter')) {
					event.preventDefault();
					event.stopImmediatePropagation();
				}
			}, true));
			store.add(checkbox.onChange(() => {
				if (!this.markingDone) {
					if (checkbox.checked) {
						this.selectedCards.add(card.id);
					} else {
						this.selectedCards.delete(card.id);
					}
					this.updateSelectionControls();
				}
			}));
			heading.appendChild(checkbox.domNode);
		}
		heading.appendChild(title);
		element.appendChild(heading);
		const activeChatLabel = document.createElement('div');
		activeChatLabel.className = 'project-board-card-active-chat-label';
		activeChatLabel.textContent = localize('projectBoard.activeSidePanelChat', "Open in Side Panel");
		activeChatLabel.hidden = true;
		activeChatLabel.id = `project-board-active-chat-${generateUuid()}`;
		this.activeChatLabels.set(card.id, activeChatLabel);
		element.appendChild(activeChatLabel);

		if (card.session.capabilities.get().supportsDelete) {
			this.createDeleteButton(document, element, localize('projectBoard.deleteSession', "Delete Session"), async () => {
				const confirmed = await this.dialogService.confirm({
					message: localize('projectBoard.deleteSessionConfirm', "Are you sure you want to delete this session?"),
					detail: localize('projectBoard.deleteSessionEverywhere', "This deletes the session and its chats from every board. This action cannot be undone."),
					primaryButton: localize('projectBoard.delete', "Delete"),
				});
				if (!confirmed.confirmed) {
					return;
				}
				const prefix = `${getProjectBoardSessionKey(card.session)}\0`;
				const cardIds = this.catalog.boards.get().flatMap(board => board.configuration.placements)
					.filter(placement => placement.cardId.startsWith(prefix)).map(placement => placement.cardId);
				try {
					await this.sessionsManagementService.deleteSession(card.session);
				} catch (error) {
					this.logService.error('[ProjectBoard] Failed to delete session', error);
					this.notificationService.error(localize('projectBoard.deleteSessionFailed', "The session could not be deleted."));
					return;
				}
				if (cardIds.length) {
					this.changeBoard(() => this.catalog.removeCardPlacements(cardIds));
				}
				status(localize('projectBoard.sessionDeleted', "Session deleted."));
			}, store);
		}

		if (card.workspace) {
			const workspace = document.createElement('div');
			workspace.className = 'project-board-card-workspace';
			workspace.textContent = card.workspace;
			describe(workspace);
			store.add(this.hoverService.setupDelayedHover(workspace, { content: card.workspace }));
			element.appendChild(workspace);
		}
		if (card.archived || card.readOnly) {
			const lifecycle = document.createElement('div');
			lifecycle.className = 'project-board-card-lifecycle';
			lifecycle.textContent = card.archived ? localize('projectBoard.archived', "Archived") : localize('projectBoard.readOnly', "Read-only");
			element.appendChild(lifecycle);
		}

		element.appendChild(this.createStatus(document, this.getStatusLabel(card), this.getStatusGlyph(card.status, card.isRead), card.status === SessionStatus.InProgress));
		const display = this.boardState.configuration.get().display;
		const metrics = document.createElement('div');
		metrics.className = 'project-board-card-metrics';
		if (display?.showStateDuration && !card.archived) {
			const duration = document.createElement('div');
			duration.className = 'project-board-card-duration';
			duration.setAttribute('role', 'img');
			const icon = renderIcon(Codicon.clock);
			icon.setAttribute('aria-hidden', 'true');
			const value = document.createElement('span');
			duration.append(icon, value);
			describe(duration);
			store.add(this.hoverService.setupDelayedHover(duration, () => ({
				content: localize('projectBoard.stateDurationHelp', "{0}\n\nTime in this chat's current state, measured while the board is open. \"At least\" (>=) means its initial state start is unknown. Output, reading and moving the card do not reset the timer. Busy timers turn orange after 30 minutes and red after 2 hours.", this.stateDurations.getLabel(card.id)),
			})));
			this.durationElements.set(card.id, value);
			metrics.appendChild(duration);
		}
		if (display?.showCredits) {
			const credits = document.createElement('div');
			credits.className = 'project-board-card-credits';
			credits.setAttribute('role', 'img');
			const value = this.creditValues.get(card.id);
			const formattedAmount = value === undefined ? localize('projectBoard.creditUnavailableCompact', "Unavailable") : formatCopilotCreditsLabel(value);
			const label = value === undefined
				? localize('projectBoard.creditsUnavailable', "AI credits: unavailable")
				: localize('projectBoard.creditsUsed', "AI credits: {0}", formattedAmount);
			credits.setAttribute('aria-label', label);
			const icon = document.createElement('span');
			icon.className = `project-board-credit-icon ${ThemeIcon.asClassName(Codicon.creditCard)}`;
			icon.setAttribute('aria-hidden', 'true');
			const amount = document.createElement('span');
			amount.textContent = formattedAmount;
			credits.append(icon, amount);
			describe(credits);
			store.add(this.hoverService.setupDelayedHover(credits, {
				content: localize('projectBoard.creditsHelpReported', "{0}\n\nLatest reported cumulative usage for this chat, including subagents when reported by its provider. Updates when usage is reported, often after each model call or when a turn ends; not a continuously estimated total. Displayed to one decimal place in AI credits, not currency or an account balance. Unavailable means no credit data is reported or the metadata preview limit was reached.", label),
			}));
			metrics.appendChild(credits);
		}
		if (card.connection) {
			const connection = document.createElement('div');
			connection.className = 'project-board-card-warning';
			connection.textContent = localize('projectBoard.connection', "Provider unavailable ({0}); state may be stale.", card.connection);
			element.appendChild(connection);
		}

		if (card.description) {
			const description = document.createElement('div');
			description.className = 'project-board-card-description';
			description.textContent = card.description;
			describe(description);
			store.add(this.hoverService.setupDelayedHover(description, { content: card.description }));
			element.appendChild(description);
		}
		const configuration = this.configurationDetails.get(card.id);
		if (configuration) {
			for (const [kind, enabled, values] of [
				['model', display?.showModelDetails, configuration.model],
				['permissions', display?.showPermissionDetails, configuration.permissions],
			] as const) {
				if (!enabled) {
					continue;
				}
				const row = document.createElement('div');
				row.className = `project-board-card-configuration project-board-card-${kind}`;
				row.setAttribute('aria-label', kind === 'model' ? localize('projectBoard.modelDetails', "Model details") : localize('projectBoard.permissionDetails', "Agent and permissions"));
				describe(row);
				for (const value of values) {
					const item = document.createElement('span');
					item.textContent = value.value;
					item.setAttribute('aria-label', localize('projectBoard.configurationValue', "{0}: {1}", value.label, value.value));
					row.appendChild(item);
				}
				store.add(this.hoverService.setupDelayedHover(row, { content: values.map(value => localize('projectBoard.configurationValue', "{0}: {1}", value.label, value.value)).join('\n') }));
				element.appendChild(row);
			}
		}
		const metadata = this.metadataStates.get(card.id);
		const prompt = document.createElement('div');
		prompt.className = 'project-board-card-prompt';
		prompt.textContent = metadata?.kind === 'ready' && metadata.prompt !== undefined
			? metadata.prompt
			: metadata?.kind === 'ready'
				? localize('projectBoard.noPromptText', "No prompt text")
				: metadata?.kind === 'loading'
					? localize('projectBoard.loadingPrompt', "Loading last prompt…")
					: localize('projectBoard.promptUnavailable', "Prompt unavailable");
		if (display?.showLastPrompt !== false) {
			describe(prompt);
			store.add(this.hoverService.setupDelayedHover(prompt, { content: prompt.textContent }));
			element.appendChild(prompt);
		}
		const time = this.promptTimes.get(card.id);
		const recency = document.createElement('div');
		recency.className = 'project-board-card-recency';
		describe(recency);
		if (time === undefined) {
			recency.textContent = localize('projectBoard.recencyUnavailable', "Recency unavailable");
		} else {
			recency.dataset.submittedAt = String(time);
			const fullTimestamp = localize('projectBoard.lastPrompt', "Last prompt: {0}", new Date(time).toLocaleString());
			recency.setAttribute('aria-label', fullTimestamp);
			store.add(this.hoverService.setupDelayedHover(recency, { content: fullTimestamp }));
			this.recencyElements.set(recency, time);
		}
		if (metadata && metadata.kind !== 'loading' && metadata.message) {
			const capability = document.createElement('div');
			capability.className = metadata.kind === 'ready' ? 'project-board-card-metadata-note' : 'project-board-card-warning';
			capability.textContent = metadata.message;
			element.appendChild(capability);
		} else if (!metadata) {
			const capability = document.createElement('div');
			capability.className = 'project-board-card-warning';
			capability.textContent = localize('projectBoard.metadataLimit', "Metadata preview limit reached. Open the chat for details.");
			element.appendChild(capability);
		}
		if (metadata?.kind === 'ready' && metadata.context.length) {
			const context = document.createElement('section');
			context.className = 'project-board-card-context';
			const label = document.createElement('div');
			label.textContent = localize('projectBoard.promptContext', "Last prompt context");
			context.appendChild(label);
			for (const item of metadata.context) {
				this.createContextLink(context, item.label, item.uri, `${card.id}:prompt:${item.uri}`, store);
			}
			element.appendChild(context);
		}
		if (card.sharedContext.length) {
			const context = document.createElement('section');
			context.className = 'project-board-card-context';
			context.setAttribute('aria-label', localize('projectBoard.sharedContext', "Shared session context"));
			const label = document.createElement('div');
			label.textContent = localize('projectBoard.sharedContext', "Shared session context");
			context.appendChild(label);
			for (const link of card.sharedContext.slice(0, 2)) {
				this.createContextLink(context, link.label, link.uri, `${card.id}:${link.uri}`, store);
			}
			if (card.sharedContext.length > 2) {
				const details = document.createElement('details');
				const summary = document.createElement('summary');
				summary.textContent = localize('projectBoard.moreContext', "+{0} context links", card.sharedContext.length - 2);
				details.appendChild(summary);
				for (const link of card.sharedContext.slice(2)) {
					this.createContextLink(details, link.label, link.uri, `${card.id}:${link.uri}`, store);
				}
				context.appendChild(details);
			}
			element.appendChild(context);
		}

		this.cardElements.set(card.id, element);
		const actionWidget = this.actionWidgets.get(card.id);
		const hasInteractiveQuestions = [...this.questionWidgets.values()].some(widget => widget.cardId === card.id);
		const rawPreview = this.previewStates.get(card.id);
		const preview = rawPreview?.kind === 'ready' && actionWidget?.rendersTools ? {
			...rawPreview, permissions: rawPreview.permissions.filter(permission => permission.kind !== 'tool'),
			unsupported: rawPreview.unsupported.filter(unsupported => unsupported.kind !== 'toolPostApproval'),
		} : rawPreview;
		if (preview && preview.kind !== 'inactive') {
			if (!actionWidget?.rendersTools || hasInteractiveQuestions || preview.kind !== 'ready' || preview.questions.length || preview.permissions.length || preview.unsupported.length || preview.truncated) {
				const previewElement = this.createQuestionPreview(document, preview, store, card.id);
				previewElement.id = `project-board-input-${generateUuid()}`;
				descriptions.push(previewElement.id);
				element.appendChild(previewElement);
			}
		}
		if (actionWidget) {
			element.appendChild(actionWidget.element);
		} else if (this.actionErrors.has(card.id)) {
			const warning = document.createElement('p');
			warning.className = 'project-board-card-warning';
			warning.textContent = localize('projectBoard.chatActionsUnavailable', "Pending actions could not be displayed. Open the chat to continue.");
			element.appendChild(warning);
		}
		const statusBar = document.createElement('footer');
		statusBar.className = 'project-board-card-status-bar';
		statusBar.appendChild(recency);
		if (metrics.childElementCount) {
			statusBar.appendChild(metrics);
		}
		element.appendChild(statusBar);
		element.setAttribute('aria-describedby', descriptions.join(' '));

		store.add(addDisposableListener(element, EventType.DRAG_START, event => {
			if (this.isCardControlEvent(element, event)) {
				event.preventDefault();
				return;
			}
			this.dragging = true;
			this.model.setSortingDeferred(true);
			event.dataTransfer?.setData(projectBoardDragDataType, card.id);
			if (event.dataTransfer) {
				event.dataTransfer.effectAllowed = 'move';
			}
		}));
		store.add(addDisposableListener(element, EventType.DRAG_END, () => {
			this.dragging = false;
			this.model.setSortingDeferred(false);
			this.observeSessions();
		}));
		const rename = card.status !== SessionStatus.Untitled && getChatCapabilities(card.chat, undefined, undefined).canRename ? () => this.renameChat(card) : undefined;
		this.registerCardInteractions(element, () => this.openCard(card), store, () => { void this.pickPlacement(card); }, rename, card);
		if (actionWidget || hasInteractiveQuestions || this.cardCheckboxes.has(card.id)) {
			element.setAttribute('role', 'group');
		}

		return element;
	}

	private createDeleteButton(document: Document, card: HTMLElement, label: string, run: () => Promise<void>, store: DisposableStore): void {
		const actions = document.createElement('div');
		actions.className = 'project-board-card-actions';
		const button = store.add(new Button(actions, {
			...defaultButtonStyles,
			ariaLabel: label,
			title: label,
			secondary: true,
		}));
		button.icon = Codicon.trash;
		store.add(button.onDidClick(event => {
			event.preventDefault();
			event.stopPropagation();
			void run();
		}));
		card.appendChild(actions);
	}

	private createContextLink(container: HTMLElement, label: string, uri: URI, key: string, store: DisposableStore): void {
		const link = mainWindow.document.createElement('a');
		link.textContent = label;
		link.href = uri.toString();
		link.dataset.boardControl = key;
		this.controlElements.set(key, link);
		store.add(addDisposableListener(link, EventType.CLICK, event => {
			event.preventDefault();
			event.stopPropagation();
			void this.openContext(uri);
		}));
		container.appendChild(link);
	}

	private async openContext(uri: URI): Promise<void> {
		try {
			if (!await this.openerService.open(uri, { fromUserGesture: true, allowCommands: false })) {
				throw new Error(`No opener for ${uri.scheme}`);
			}
		} catch (error) {
			this.logService.error('[ProjectBoard] Context link could not be opened', error);
			this.notificationService.error(localize('projectBoard.contextOpenFailed', "The context link could not be opened."));
		}
	}

	private createQuestionPreview(document: Document, preview: ProjectBoardQuestionPreviewState, store: DisposableStore, cardId: string): HTMLElement {
		const container = document.createElement('section');
		container.className = 'project-board-card-input interactive-session';
		container.setAttribute('aria-label', localize('projectBoard.pendingInput', "Pending input"));
		const text = (value: string, tag = 'p') => {
			const element = document.createElement(tag);
			element.textContent = value;
			container.appendChild(element);
		};
		const options = (labels: readonly string[]) => {
			if (!labels.length) {
				return;
			}
			const list = document.createElement('ul');
			for (const label of labels) {
				const item = document.createElement('li');
				item.textContent = label;
				list.appendChild(item);
			}
			container.appendChild(list);
		};
		if (preview.kind === 'loading') {
			text(localize('projectBoard.loadingQuestions', "Loading pending questions…"));
		} else if (preview.kind === 'unavailable' || preview.kind === 'error') {
			text(preview.message);
		} else if (preview.kind === 'ready') {
			const interactive = [...this.questionWidgets.values()].filter(widget => widget.cardId === cardId);
			for (const widget of interactive) {
				container.appendChild(widget.element);
			}
			for (const question of preview.questions) {
				if (interactive.some(widget => widget.part.carousel.questions.some(item => item.id === question.id))) {
					continue;
				}
				const questionCard = document.createElement('div');
				questionCard.className = `chat-question-carousel-container chat-question-carousel-preview ${CHAT_CARD_LARGE_CLASS}`;
				const content = document.createElement('div');
				questionCard.appendChild(content);
				container.appendChild(questionCard);
				store.add(this.instantiationService.createInstance(ChatQuestionContent, content, {
					id: question.id, type: question.type, title: question.title, message: question.text,
					description: question.description, detailedMessage: question.detailedMessage, required: question.required,
					options: question.options.map(option => ({ ...option, value: option.id })),
				}, { readOnly: true, message: question.carouselMessage }));
			}
			for (const permission of preview.permissions) {
				if (permission.title) {
					text(permission.title, 'h5');
				}
				if (permission.text) {
					text(permission.text);
				}
				options(permission.options ?? []);
			}
			for (const unsupported of preview.unsupported) {
				text(unsupported.message);
			}
			if (preview.truncated) {
				text(localize('projectBoard.moreInputDetails', "More details are available in the chat."));
			}
			if (!interactive.length && preview.questions.length) {
				text(localize('projectBoard.inlineAnswerUnavailable', "Inline answering is unavailable for this question. Open the chat to respond."));
			} else if (!interactive.length || preview.permissions.length || preview.unsupported.length || preview.truncated) {
				text(localize('projectBoard.respondInChat', "Open the chat to respond."));
			}
		}
		return container;
	}

	private isCardControlEvent(element: HTMLElement, event: MouseEvent): boolean {
		return event.composedPath().some(target => target !== element && isHTMLElement(target)
			&& target.matches('a, button, input, select, textarea, summary, [role="button"], [role="checkbox"], [contenteditable="true"], .project-board-live-question, .project-board-live-actions'));
	}

	private registerCardInteractions(element: HTMLElement, open: () => Promise<void>, store: DisposableStore, move?: () => void, rename?: () => Promise<void>, card?: IProjectBoardCard): void {
		element.tabIndex = 0;
		element.setAttribute('role', 'button');
		element.setAttribute('aria-description', !move
			? localize('projectBoard.draftInstructions', "Double-click or press Enter or Space to open this session draft.")
			: rename
				? localize('projectBoard.cardInstructionsRenamable', "Use arrow keys to navigate cards, Home or End to reach the first or last card, Enter or Space to open this chat, and F2 or the context menu to rename it. Drag to move, or press {0} to choose a destination.", isMacintosh ? 'Command+Shift+M' : 'Ctrl+Shift+M')
				: localize('projectBoard.cardInstructions', "Use arrow keys to navigate cards, Home or End to reach the first or last card, and Enter or Space to open this chat. Drag to move, or press {0} to choose a destination.", isMacintosh ? 'Command+Shift+M' : 'Ctrl+Shift+M'));
		if (card && this.canMarkDone(card)) {
			element.setAttribute('aria-description', localize('projectBoard.selectableCardInstructions', "{0} Tab to the conversation checkbox to select it for Mark as Done. Mark as Done archives its session, including other chats.", element.getAttribute('aria-description')));
		}
		if (move) {
			element.setAttribute('aria-keyshortcuts', rename ? `${isMacintosh ? 'Meta+Shift+M' : 'Control+Shift+M'} F2` : (isMacintosh ? 'Meta+Shift+M' : 'Control+Shift+M'));
		}
		store.add(addDisposableListener(element, EventType.DBLCLICK, event => {
			if (this.isCardControlEvent(element, event)) {
				return;
			}
			void open();
		}));
		store.add(addStandardDisposableListener(element, EventType.KEY_DOWN, event => {
			if (event.target !== element || event.browserEvent.repeat) {
				return;
			}
			if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				event.preventDefault();
				event.stopPropagation();
				void open();
			} else if (move && event.equals(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyM)) {
				event.preventDefault();
				event.stopPropagation();
				move();
			} else if (rename && event.equals(KeyCode.F2)) {
				event.preventDefault();
				event.stopPropagation();
				void rename();
			} else if ([KeyCode.LeftArrow, KeyCode.RightArrow, KeyCode.UpArrow, KeyCode.DownArrow, KeyCode.Home, KeyCode.End].some(key => event.equals(key))) {
				event.preventDefault();
				event.stopPropagation();
				this.navigateCard(element, event.keyCode);
			}
		}));
		if (rename || card) {
			store.add(addDisposableListener(element, EventType.CONTEXT_MENU, event => {
				if (this.isCardControlEvent(element, event)) {
					return;
				}
				event.preventDefault();
				event.stopPropagation();
				this.showCardContextMenu(element, event, rename, card);
			}));
		}
	}

	private getCardMoveActions(card: IProjectBoardCard): IAction[] {
		const placement = this.model.getPlacement(card.id);
		return (['row', 'column'] as const).map(kind => {
			const id = `projectBoard.card.move.${kind}`;
			const label = kind === 'row' ? localize('projectBoard.moveToRow', "Move to row") : localize('projectBoard.moveToColumn', "Move to column");
			const axes = kind === 'row' ? this.model.rows : this.model.columns;
			const current = kind === 'row' ? placement?.rowId : placement?.columnId;
			const actions = axes.filter(axis => axis.id !== current).map(axis => toAction({
				id: `${id}.${axis.id}`,
				label: axis.label,
				run: () => {
					if (!this.active || this._store.isDisposed) {
						return;
					}
					if (!this.boardState.canEdit) {
						this.notificationService.warn(localize('projectBoard.moveUnavailable', "Board editing is unavailable until the saved board data is recovered."));
						return;
					}
					if (!this.model.cards.some(candidate => candidate.id === card.id)) {
						this.notificationService.warn(localize('projectBoard.chatGone', "This chat is no longer available."));
						return;
					}
					const latest = this.model.getPlacement(card.id);
					this.moveCard(card.id, {
						rowId: kind === 'row' ? axis.id : latest?.rowId ?? this.model.rows[0].id,
						columnId: kind === 'column' ? axis.id : latest?.columnId ?? this.model.columns[0].id,
					});
					this.refreshAfterMenu(card.chat.resource);
				},
			}));
			return this.boardState.canEdit && actions.length
				? new SubmenuAction(id, label, actions)
				: toAction({ id, label, enabled: false, run: () => { } });
		});
	}

	private showCardContextMenu(element: HTMLElement, event: MouseEvent, rename: (() => Promise<void>) | undefined, card: IProjectBoardCard | undefined): void {
		const selected = card && this.selectedCards.has(card.id) ? [...this.selectedCards] : card ? [card.id] : [];
		const anchor = new StandardMouseEvent(getWindow(element), event);
		this.menuOpen = true;
		const generation = ++this.menuGeneration;
		this.contextMenuService.showContextMenu({
			domForShadowRoot: this.container,
			getAnchor: () => anchor,
			getActions: () => [
				...(rename ? [toAction({
					id: 'projectBoard.card.rename',
					label: localize('projectBoard.renameChat', "Rename..."),
					run: () => rename(),
				})] : []),
				...(card && this.canMarkDone(card) ? [toAction({
					id: 'projectBoard.card.markDone',
					label: selected.length > 1
						? localize('projectBoard.markSelectedDone', "Mark {0} Selected as Done", selected.length)
						: localize('projectBoard.markDone', "Mark as Done"),
					enabled: !this.markingDone,
					run: () => this.markCardsDone(selected),
				})] : []),
				...(card ? this.getCardMoveActions(card) : []),
			],
			onHide: () => {
				if (generation !== this.menuGeneration) {
					return;
				}
				this.menuOpen = false;
				this.refreshAfterMenu(card?.chat.resource);
				if (element.ownerDocument.hasFocus()) {
					element.focus({ preventScroll: true });
				}
			},
		});
	}

	private navigateCard(element: HTMLElement, key: KeyCode): void {
		const elements = this.visibleCardElements();
		let target: HTMLElement | undefined;
		if (key === KeyCode.Home || key === KeyCode.End) {
			target = key === KeyCode.Home ? elements[0] : elements.at(-1);
		} else {
			const origin = element.getBoundingClientRect();
			const horizontal = key === KeyCode.LeftArrow || key === KeyCode.RightArrow;
			const direction = key === KeyCode.LeftArrow || key === KeyCode.UpArrow ? -1 : 1;
			const candidates = elements.filter(candidate => candidate !== element).map(candidate => {
				const rect = candidate.getBoundingClientRect();
				const dx = (rect.left + rect.right - origin.left - origin.right) / 2;
				const dy = (rect.top + rect.bottom - origin.top - origin.bottom) / 2;
				const aligned = horizontal
					? rect.top < origin.bottom && rect.bottom > origin.top
					: rect.left < origin.right && rect.right > origin.left;
				return { candidate, forward: (horizontal ? dx : dy) * direction, aligned, distance: Math.hypot(dx, dy) };
			}).filter(candidate => candidate.forward > 1);
			candidates.sort((a, b) => Number(b.aligned) - Number(a.aligned) || a.distance - b.distance);
			target = candidates[0]?.candidate;
		}
		target?.focus({ preventScroll: true });
		target?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	}

	private async pickPlacement(card: IProjectBoardCard): Promise<void> {
		if (!this.boardState.canEdit) {
			this.notificationService.warn(localize('projectBoard.moveUnavailable', "Board editing is unavailable until the saved board data is recovered."));
			return;
		}
		const lifetime = new DisposableStore();
		this.movePicker.value = lifetime;
		const cancellation = new CancellationTokenSource();
		lifetime.add(toDisposable(() => cancellation.dispose(true)));
		const placement = this.model.getPlacement(card.id);
		const inherited = !this.showSessionList ? this.model.getInheritedPlacement(card.id) : undefined;
		const items: { label: string; placement: IProjectBoardPlacement | undefined }[] = [
			{ label: inherited ? localize('projectBoard.followParent', "Follow Parent") : localize('projectBoard.unassigned', "Unassigned"), placement: undefined },
			...this.model.rows.flatMap(row => this.model.columns.map(column => ({
				label: localize('projectBoard.cell', "{0}, {1}", row.label, column.label),
				placement: { rowId: row.id, columnId: column.id },
			}))),
		];
		this.menuOpen = true;
		const generation = ++this.menuGeneration;
		try {
			const selected = await this.quickInputService.pick(items, {
				placeHolder: this.showSessionList ? localize('projectBoard.pickSessionDestination', "Move session to…") : localize('projectBoard.pickDestination', "Move chat to…"),
				ignoreFocusLost: true,
				activeItem: items.find(item => item.placement?.rowId === placement?.rowId && item.placement?.columnId === placement?.columnId),
			}, cancellation.token);
			if (!selected || cancellation.token.isCancellationRequested || this._store.isDisposed || !this.active) {
				return;
			}
			if (!this.model.cards.some(candidate => candidate.id === card.id)) {
				throw new Error(localize('projectBoard.chatGone', "This chat is no longer available."));
			}
			this.moveCard(card.id, selected.placement);
		} catch (error) {
			this.logService.error('[ProjectBoard] Failed to choose a destination', error);
			this.notificationService.error(localize('projectBoard.moveFailed', "The chat could not be moved in Agents Hub."));
		} finally {
			if (this.movePicker.value === lifetime) {
				this.movePicker.clear();
			}
			if (generation === this.menuGeneration && !this._store.isDisposed) {
				this.menuOpen = false;
				this.refreshAfterMenu(card.chat.resource);
			}
		}
	}

	private async renameChat(card: IProjectBoardCard): Promise<void> {
		this.menuOpen = true;
		const generation = ++this.menuGeneration;
		try {
			const newTitle = await this.quickInputService.input({
				value: card.chat.title.get(),
				prompt: localize('projectBoard.renameChatPrompt', "New chat title"),
				validateInput: async value => {
					if (!value.trim()) {
						return localize('projectBoard.renameChatEmpty', "Title cannot be empty");
					}
					return undefined;
				}
			});
			if (newTitle === undefined || this._store.isDisposed || !this.active) {
				return;
			}
			const trimmedTitle = newTitle.trim();
			if (trimmedTitle && trimmedTitle !== card.chat.title.get().trim()) {
				if (!getChatCapabilities(card.chat, undefined, undefined).canRename) {
					throw new Error('The chat no longer supports renaming.');
				}
				await this.sessionsManagementService.renameChat(card.session, card.chat.resource, trimmedTitle);
			}
		} catch (error) {
			this.logService.error('[ProjectBoard] Failed to rename chat', error);
			this.notificationService.error(localize('projectBoard.renameChatFailed', "The chat could not be renamed."));
		} finally {
			if (generation === this.menuGeneration && !this._store.isDisposed) {
				this.menuOpen = false;
				this.refreshAfterMenu();
				if (this.container.ownerDocument.hasFocus()) {
					this.cardElements.get(card.id)?.focus({ preventScroll: true });
				}
			}
		}
	}

	private createStatus(document: Document, label: string, glyph: string, running: boolean): HTMLElement {
		const status = document.createElement('div');
		status.className = 'project-board-card-status';
		const icon = document.createElement('span');
		icon.className = 'project-board-card-status-icon';
		icon.classList.toggle('project-board-card-status-running', running);
		icon.setAttribute('aria-hidden', 'true');
		icon.textContent = glyph;
		const text = document.createElement('span');
		text.className = 'project-board-card-status-label';
		text.textContent = label;
		status.append(icon, text);
		return status;
	}

	private getStatusGlyph(status: SessionStatus, isRead = true): string {
		switch (status) {
			case SessionStatus.InProgress:
				return '\u{1F3C3}';
			case SessionStatus.NeedsInput:
				return '\u{1F64B}';
			case SessionStatus.Error:
				return '\u26A0\uFE0F';
			default:
				return isRead ? '\u{1F634}' : '\u{1F440}';
		}
	}

	private updateCardTimes(): void {
		const now = Date.now();
		for (const [id, value] of this.durationElements) {
			const label = this.stateDurations.getLabel(id, now, true);
			if (value.textContent !== label) {
				value.textContent = label;
			}
			const duration = value.parentElement!;
			duration.setAttribute('aria-label', this.stateDurations.getLabel(id, now));
			const severity = this.stateDurations.getSeverity(id, now);
			duration.classList.toggle('project-board-card-duration-warning', severity === 'warning');
			duration.classList.toggle('project-board-card-duration-error', severity === 'error');
		}
		for (const [element, time] of this.recencyElements) {
			const label = fromNow(time, true, true);
			if (element.textContent !== label) {
				element.textContent = label;
			}
		}
	}

	private moveCard(cardId: string, placement: IProjectBoardPlacement | undefined): void {
		const session = this.showSessionList ? this.model.cards.find(card => card.id === cardId)?.session : undefined;
		this.moveCards(session ? this.model.cards.filter(card => card.session === session).map(card => card.id) : [cardId], placement);
	}

	private moveCards(cardIds: readonly string[], placement: IProjectBoardPlacement | undefined): void {
		try {
			this.boardState.moveCards(cardIds, placement);
			if (this.expandPlacement(placement)) {
				this.render();
			}
		} catch (error) {
			this.logService.error('[ProjectBoard] Failed to move chat', error);
			this.notificationService.error(localize('projectBoard.moveFailed', "The chat could not be moved in Agents Hub."));
		}
	}

	private async openCard(card: IProjectBoardCard): Promise<void> {
		try {
			if (!this.showHeader && this.boardState.configuration.get().openChatInSidePanel) {
				await this.chatSidePanel.open(card, () => {
					if (this.active && !this._store.isDisposed) {
						this.focusChat(card.chat.resource);
					}
				});
			} else {
				await this.chatWindows.open(card);
				this.onOpenChat(card.chat.resource);
			}
		} catch (error) {
			this.logService.error('[ProjectBoard] Failed to open chat', error);
			this.notificationService.error(localize('projectBoard.openFailed', "The chat could not be opened."));
		}
	}

	private getStatusClass(card: IProjectBoardCard): string {
		switch (card.status) {
			case SessionStatus.InProgress:
				return 'busy';
			case SessionStatus.NeedsInput:
				return 'needs-input';
			case SessionStatus.Error:
				return 'error';
			default:
				return card.isRead ? 'idle' : 'unvisited';
		}
	}

	private getStatusLabel(card: IProjectBoardCard, session = false): string {
		switch (session ? card.session.status.get() : card.status) {
			case SessionStatus.InProgress:
				return localize('projectBoard.busy', "Busy");
			case SessionStatus.NeedsInput:
				return localize('projectBoard.needsInput', "Needs Input");
			case SessionStatus.Error:
				return localize('projectBoard.error', "Error");
			default:
				return (session ? card.session.isRead.get() : card.isRead)
					? localize('projectBoard.idleVisited', "Idle, visited")
					: localize('projectBoard.idleUnvisited', "Idle, unvisited");
		}
	}
}

interface IProjectBoardOrigin {
	readonly boardId: string;
	readonly view: ProjectBoardView;
	readonly window: Window;
	readonly isAlive: () => boolean;
	readonly activate: () => void;
}

export class ProjectBoardService extends Disposable implements IProjectBoardService {

	declare readonly _serviceBrand: undefined;

	private readonly windows = new Map<string, { window: IAuxiliaryWindow; view?: ProjectBoardView; origin?: IProjectBoardOrigin }>();
	private readonly archivingSessions = new Map<string, Promise<void>>();
	private readonly opening = new Map<string, Promise<void>>();
	private readonly windowStores = this._register(new DisposableMap<string, DisposableStore>());
	private readonly embeddedStore = this._register(new MutableDisposable<DisposableStore>());
	private customView: ProjectBoardView | undefined;
	private focusedView: IProjectBoardOrigin | undefined;
	private readonly viewOrigins = new WeakMap<ProjectBoardView, IProjectBoardOrigin>();
	private readonly chatOrigins = new Map<string, IProjectBoardOrigin | undefined>();
	private readonly chatWindows: ProjectBoardChatWindows;
	private readonly chatSidePanel: ProjectBoardChatSidePanel;
	private readonly previewPool: ProjectBoardPreviewPool;

	constructor(
		@IAuxiliaryWindowService private readonly auxiliaryWindowService: IAuxiliaryWindowService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@INotificationService private readonly notificationService: INotificationService,
		@ILogService private readonly logService: ILogService,
		@IHostService private readonly hostService: IHostService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IProjectBoardCatalogService private readonly catalog: IProjectBoardCatalogService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IDialogService private readonly dialogService: IDialogService,
		@ICustomViewService private readonly customViewService: ICustomViewService,
	) {
		super();
		this.chatWindows = this._register(instantiationService.createInstance(ProjectBoardChatWindows));
		this.chatSidePanel = this._register(instantiationService.createInstance(ProjectBoardChatSidePanel));
		this.previewPool = this._register(instantiationService.createInstance(ProjectBoardPreviewPool));
		this.trackCardIdentities();
		this._register(this.sessionsManagementService.onDidReplaceSession(({ from, to }) => {
			try {
				this.catalog.replaceCardPlacements(getProjectBoardCardId(from, from.mainChat.get()), getProjectBoardCardId(to, to.mainChat.get()));
			} catch (error) {
				// The catalog reports persistence failures; provider publication must continue.
				this.logService.error('[ProjectBoard] Failed to reconcile session placement', error);
			}
		}));
		// Creation always uses the panel; unrelated catalog edits must not close it.
		const openChatInSidePanel = derived(reader => this.catalog.boards.read(reader)
			.find(board => board.id === this.catalog.selectedBoardId.read(reader))?.configuration.openChatInSidePanel === true);
		this._register(autorun(reader => {
			if (!openChatInSidePanel.read(reader)) {
				this.chatSidePanel.close();
			}
		}));
		this._register(autorun(reader => {
			const boards = this.catalog.boards.read(reader);
			for (const boardId of this.windows.keys()) {
				if (!boards.some(board => board.id === boardId)) {
					this.windowStores.deleteAndDispose(boardId);
				}
			}
		}));
		this._register(addDisposableListener(mainWindow, EventType.UNLOAD, () => this.dispose()));
	}

	private trackCardIdentities(): void {
		const discovery = observableSignalFromEvent(this, this.sessionsManagementService.onDidChangeSessions);
		// Ignore metadata-only catalog writes, including other windows' snapshots.
		const observed = derivedOpts<readonly { cardId: string; lastKnown: IProjectBoardCardIdentity }[]>({ owner: this, equalsFn: equals }, reader => {
			discovery.read(reader);
			const placements = this.catalog.boards.read(reader).flatMap(board => board.configuration.placements);
			if (!placements.length || !this.catalog.canEdit) {
				return [];
			}
			const placedIds = new Set(placements.map(placement => placement.cardId));
			const identities = new Map<string, IProjectBoardCardIdentity>();
			const sessions = new Set([...this.sessionsManagementService.getSessions(), ...this.sessionsManagementService.sessionDrafts.read(reader)]);
			for (const session of sessions) {
				for (const chat of session.chats.read(reader)) {
					const id = getProjectBoardCardId(session, chat);
					if (!placedIds.has(id) || chat.interactivity.read(reader) === ChatInteractivity.Hidden) {
						continue;
					}
					identities.set(id, getLastKnownIdentity(session, chat, reader));
				}
			}
			return placements.flatMap(placement => {
				const lastKnown = identities.get(placement.cardId);
				return lastKnown ? [{ cardId: placement.cardId, lastKnown }] : [];
			});
		});
		this._register(autorun(reader => {
			const identities = new Map(observed.read(reader).map(item => [item.cardId, item.lastKnown]));
			const placements = this.catalog.boards.read(undefined).flatMap(board => board.configuration.placements);
			if (this.catalog.canEdit && placements.some(placement => identities.has(placement.cardId) && !equals(placement.lastKnown, identities.get(placement.cardId)))) {
				try {
					this.catalog.updateCardIdentities(identities);
				} catch (error) {
					// The catalog reports persistence failures; discovery must still render live chats.
					this.logService.error('[ProjectBoard] Failed to retain chat identity', error);
				}
			}
		}));
	}

	async open(boardId = this.catalog.selectedBoardId.get()): Promise<void> {
		if (!boardId) {
			this.customViewService.showCustomView(KANBAN_CUSTOM_VIEW_ID);
			return;
		}
		if (!this.catalog.boards.get().some(board => board.id === boardId)) {
			this.notificationService.error(localize('projectBoard.missingBoard', "This board no longer exists."));
			return;
		}
		if (!this.windows.get(boardId)?.view) {
			let pending = this.opening.get(boardId);
			if (!pending) {
				pending = this.openWindow(boardId).finally(() => this.opening.delete(boardId));
				this.opening.set(boardId, pending);
			}
			await pending;
		}
		const entry = this.windows.get(boardId);
		if (entry?.origin) {
			this.focusedView = entry.origin;
			await this.hostService.focus(entry.window.window);
		}
	}

	createView(container: HTMLElement): IProjectBoardView {
		const store = new DisposableStore();
		this.embeddedStore.value = store;
		const changed = store.add(new Emitter<void>());
		const editable = this.instantiationService.invokeFunction(accessor => KanbanBoardEditableContext.bindTo(accessor.get(IContextKeyService)));
		store.add(toDisposable(() => editable.reset()));
		const cache = new Map<string, { view: ProjectBoardView; container: HTMLElement; store: DisposableStore; scrollTop: number; scrollLeft: number }>();
		const empty = mainWindow.document.createElement('div');
		empty.className = 'project-board-empty-hub';
		const message = mainWindow.document.createElement('p');
		empty.appendChild(message);
		const create = store.add(new Button(empty, defaultButtonStyles));
		create.label = localize('projectBoard.newBoard', "New Board");
		create.element.dataset.boardControl = 'new-board';
		store.add(create.onDidClick(() => { void this.createBoard(); }));
		const reset = store.add(new Button(empty, { ...defaultButtonStyles, secondary: true }));
		reset.label = localize('projectBoard.resetHub', "Reset Agents Hub");
		reset.element.dataset.boardControl = 'reset-hub';
		store.add(reset.onDidClick(() => { void this.resetHub(); }));
		container.appendChild(empty);
		let activeId: string | undefined;
		let dimensions: { width: number; height: number } | undefined;
		store.add(toDisposable(() => {
			this.customView?.setActive(false);
			this.customView = undefined;
			this.chatSidePanel.close();
			for (const entry of cache.values()) {
				entry.store.dispose();
			}
			cache.clear();
			empty.remove();
			this.clearIdlePreviewsIfUnused();
		}));
		store.add(autorun(reader => {
			const boards = this.catalog.boards.read(reader);
			const selected = this.catalog.selectedBoardId.read(reader);
			const scroller = container.closest<HTMLElement>('.custom-view-scroll-content');
			if (activeId !== selected) {
				const previous = activeId ? cache.get(activeId) : undefined;
				if (previous) {
					previous.scrollTop = scroller?.scrollTop ?? 0;
					previous.scrollLeft = scroller?.scrollLeft ?? 0;
					previous.view.setActive(false);
					previous.container.hidden = true;
				}
				this.customView = undefined;
				this.chatSidePanel.close();
				activeId = selected;
			}
			for (const [id, entry] of cache) {
				if (!boards.some(board => board.id === id)) {
					entry.store.dispose();
					cache.delete(id);
				}
			}
			const record = boards.find(board => board.id === selected);
			empty.hidden = !!record;
			message.textContent = this.catalog.canEdit
				? localize('projectBoard.noBoards', "Create a board to organize your conversations.")
				: localize('projectBoard.unreadableHub', "Agents Hub configuration could not be loaded. Your saved data has been preserved.");
			create.enabled = this.catalog.canEdit;
			reset.element.hidden = this.catalog.canEdit;
			if (!record) {
				editable.set(false);
				this.clearIdlePreviewsIfUnused();
				changed.fire();
				return;
			}
			let entry = cache.get(record.id);
			if (!entry) {
				const element = mainWindow.document.createElement('div');
				element.className = 'project-board-view-container';
				container.appendChild(element);
				const boardStore = new DisposableStore();
				boardStore.add(toDisposable(() => element.remove()));
				const view = this.createBoardView(element, record.id, false, getWindow(container), boardStore,
					() => this.catalog.selectBoard(record.id), () => !store.isDisposed && cache.has(record.id));
				entry = { view, container: element, store: boardStore, scrollTop: 0, scrollLeft: 0 };
				cache.set(record.id, entry);
				boardStore.add(view.onDidChangeContentSize(() => {
					if (this.customView === view) {
						changed.fire();
					}
				}));
			}
			const switching = this.customView !== entry.view;
			this.customView = entry.view;
			if (switching) {
				entry.container.hidden = false;
				entry.view.setActive(true);
				if (dimensions) {
					entry.view.layout(dimensions.width, dimensions.height);
				}
				changed.fire();
				if (scroller) {
					scroller.scrollTop = entry.scrollTop;
					scroller.scrollLeft = entry.scrollLeft;
				}
			}
		}));
		return {
			focus: () => {
				if (this.customView) {
					this.focusedView = this.viewOrigins.get(this.customView);
					this.customView.focus();
				} else {
					(this.catalog.canEdit ? create : reset).element.focus();
				}
			},
			layout: (width, height) => {
				dimensions = { width, height };
				this.customView?.layout(width, height);
			},
			onDidChangeContentSize: changed.event,
			dispose: () => {
				if (this.embeddedStore.value === store) {
					this.embeddedStore.clear();
				} else {
					store.dispose();
				}
			},
		};
	}

	private createBoardView(container: HTMLElement, boardId: string, standalone: boolean, window: Window, store: DisposableStore, activate: () => void, isAlive: () => boolean): ProjectBoardView {
		const state = store.add(this.instantiationService.createInstance(ProjectBoardState, boardId));
		const view = store.add(this.instantiationService.createInstance(ProjectBoardView, container, this.chatWindows, state, standalone, {
			sessionsManagementService: this.sessionsManagementService, notificationService: this.notificationService,
			logService: this.logService, contextMenuService: this.contextMenuService, instantiationService: this.instantiationService,
			chatSidePanel: this.chatSidePanel, previewPool: this.previewPool,
			markSessionDone: session => this.markSessionDone(session),
			onOpenChat: resource => { this.chatOrigins.set(resource.toString(), origin); },
			renameBoard: () => this.renameBoard(boardId), deleteBoard: () => this.deleteBoard(boardId),
			recoverHub: () => this.resetHub(),
		}));
		const origin: IProjectBoardOrigin = { boardId, view, window, activate, isAlive };
		this.viewOrigins.set(view, origin);
		if (standalone) {
			const entry = this.windows.get(boardId);
			if (entry) {
				entry.origin = origin;
			}
		}
		store.add(addDisposableListener(container, EventType.FOCUS_IN, () => { this.focusedView = origin; }));
		store.add(toDisposable(() => {
			if (this.focusedView === origin) {
				this.focusedView = undefined;
			}
			for (const [resource, candidate] of this.chatOrigins) {
				if (candidate === origin) {
					this.chatOrigins.set(resource, undefined);
				}
			}
		}));
		return view;
	}

	private async markSessionDone(session: ISession): Promise<void> {
		const key = getProjectBoardSessionKey(session);
		const existing = this.archivingSessions.get(key);
		if (existing) {
			return existing;
		}
		const pending = this.sessionsManagementService.archiveSession(session);
		this.archivingSessions.set(key, pending);
		try {
			await pending;
		} finally {
			this.archivingSessions.delete(key);
		}
	}

	private clearIdlePreviewsIfUnused(): void {
		if (!this.customView && !this.windows.size) {
			this.previewPool.clearIdleMetadata();
		}
	}

	async createBoard(): Promise<void> {
		try {
			const name = await this.quickInputService.input({
				title: localize('projectBoard.newBoard', "New Board"),
				prompt: localize('projectBoard.boardNamePrompt', "Enter a board name."),
				validateInput: async value => value.trim() ? undefined : localize('projectBoard.boardNameEmpty', "Board name cannot be empty."),
			});
			if (name === undefined || this._store.isDisposed) {
				return;
			}
			const id = this.catalog.createBoard(name);
			this.catalog.selectBoard(id);
			this.customViewService.showCustomView(KANBAN_CUSTOM_VIEW_ID);
		} catch (error) {
			this.logService.error('[ProjectBoard] Failed to create board', error);
			this.notificationService.error(localize('projectBoard.createBoardFailed', "The board could not be created."));
		}
	}

	async renameBoard(boardId = this.catalog.selectedBoardId.get()): Promise<void> {
		const board = this.catalog.boards.get().find(board => board.id === boardId);
		if (!board) {
			this.notificationService.error(localize('projectBoard.missingBoard', "This board no longer exists."));
			return;
		}
		try {
			const name = await this.quickInputService.input({
				title: localize('projectBoard.renameBoard', "Rename Board"), value: board.name,
				validateInput: async value => value.trim() ? undefined : localize('projectBoard.boardNameEmpty', "Board name cannot be empty."),
			});
			if (name !== undefined && !this._store.isDisposed) {
				this.catalog.renameBoard(board.id, name);
			}
		} catch (error) {
			this.logService.error('[ProjectBoard] Failed to rename board', error);
			this.notificationService.error(localize('projectBoard.renameBoardFailed', "The board could not be renamed."));
		}
	}

	async deleteBoard(boardId = this.catalog.selectedBoardId.get()): Promise<void> {
		const board = this.catalog.boards.get().find(board => board.id === boardId);
		if (!board) {
			this.notificationService.error(localize('projectBoard.missingBoard', "This board no longer exists."));
			return;
		}
		try {
			const confirmation = await this.dialogService.confirm({
				message: localize('projectBoard.confirmDeleteBoard', "Delete board \"{0}\"?", board.name),
				detail: localize('projectBoard.deleteBoardDetail', "Only this board's layout and settings will be deleted. Conversations and running agents will not be deleted or stopped."),
				primaryButton: localize('projectBoard.deleteBoard', "Delete Board"),
			});
			if (confirmation.confirmed && !this._store.isDisposed) {
				this.catalog.deleteBoard(board.id);
			}
		} catch (error) {
			this.logService.error('[ProjectBoard] Failed to delete board', error);
			this.notificationService.error(localize('projectBoard.deleteBoardFailed', "The board could not be deleted."));
		}
	}

	private async resetHub(): Promise<void> {
		try {
			const confirmation = await this.dialogService.confirm({
				message: localize('projectBoard.resetHubConfirm', "Reset all saved boards?"),
				detail: localize('projectBoard.resetHubDetail', "This replaces the saved board collection with one Default board. Conversations are not deleted."),
				primaryButton: localize('projectBoard.resetHub', "Reset Agents Hub"),
			});
			if (confirmation.confirmed && !this._store.isDisposed) {
				this.catalog.reset();
			}
		} catch (error) {
			this.logService.error('[ProjectBoard] Failed to reset Hub', error);
			this.notificationService.error(localize('projectBoard.resetHubFailed', "Agents Hub could not be reset."));
		}
	}

	async addAxis(kind: 'row' | 'column'): Promise<void> {
		await this.customView?.addAxis(kind);
	}

	toggleArchived(): void {
		this.customView?.toggleArchived();
	}

	toggleAutoIncludeSessions(): void {
		this.customView?.toggleAutoIncludeSessions();
	}

	toggleOpenChatInSidePanel(): void {
		this.customView?.toggleOpenChatInSidePanel();
	}

	async createSession(): Promise<void> {
		if (this.customView) {
			this.focusedView = this.viewOrigins.get(this.customView);
			await this.customView.createSession();
		}
	}

	toggleDisplayOption(key: keyof IProjectBoardDisplayOptions): void {
		this.customView?.toggleDisplayOption(key);
	}

	getAccessibleContent(): string {
		return (this.customView ?? this.focusedView?.view ?? this.windows.values().next().value?.view)?.getAccessibleContent()
			?? (this.embeddedStore.value
				? localize('projectBoard.accessibleNoBoards', "Agents Hub has no available boards. Use New Board, or Reset Agents Hub to recover an unreadable configuration.")
				: localize('projectBoard.accessibleUnavailable', "Agents Hub is not currently open."));
	}

	async closeSession(windowId: number): Promise<void> {
		try {
			const resource = await this.chatWindows.closeActiveSession(windowId);
			if (resource) {
				const key = resource.toString();
				const target = this.chatOrigins.has(key) ? this.chatOrigins.get(key) : this.focusedView;
				this.chatOrigins.delete(key);
				if (target?.isAlive() && this.catalog.boards.get().some(board => board.id === target.boardId)) {
					target.activate();
					await this.hostService.focus(target.window);
					target.view.focusChat(resource);
				} else {
					await this.hostService.focus(mainWindow);
				}
			}
		} catch (error) {
			this.logService.error('[ProjectBoard] Failed to close session view', error);
			this.notificationService.error(localize('projectBoard.closeFailed', "The session window could not be closed."));
		}
	}

	private async openWindow(boardId: string): Promise<void> {
		try {
			const boardWindow = await this.auxiliaryWindowService.open();
			if (this._store.isDisposed || !this.catalog.boards.get().some(board => board.id === boardId)) {
				boardWindow.dispose();
				return;
			}
			const store = new DisposableStore();
			const entry: { window: IAuxiliaryWindow; view?: ProjectBoardView; origin?: IProjectBoardOrigin } = { window: boardWindow };
			this.windows.set(boardId, entry);
			this.windowStores.set(boardId, store);
			store.add(toDisposable(() => {
				if (this.windows.get(boardId) === entry) {
					this.windows.delete(boardId);
				}
			}));
			store.add(boardWindow);
			store.add(boardWindow.onUnload(() => {
				if (this.windows.get(boardId) === entry) {
					this.windows.delete(boardId);
				}
				queueMicrotask(() => {
					if (this.windowStores.get(boardId) === store) {
						this.windowStores.deleteAndDispose(boardId);
					}
				});
			}));
			await boardWindow.whenStylesHaveLoaded;
			if (store.isDisposed) {
				return;
			}
			const record = this.catalog.boards.get().find(board => board.id === boardId)!;
			const window = store.add(this.instantiationService.createInstance(ProjectBoardWindow, boardWindow, localize('projectBoard.namedTitle', "Agents Hub — {0}", record.name)));
			entry.view = this.createBoardView(window.content, boardId, true, boardWindow.window, store, () => { }, () => this.windows.get(boardId) === entry);
			store.add(autorun(reader => {
				const name = this.catalog.boards.read(reader).find(board => board.id === boardId)?.name;
				if (name) {
					window.setTitle(localize('projectBoard.namedTitle', "Agents Hub — {0}", name));
				}
			}));
			store.add(toDisposable(() => this.clearIdlePreviewsIfUnused()));
		} catch (error) {
			this.windowStores.deleteAndDispose(boardId);
			this.logService.error('[ProjectBoard] Failed to open window', error);
			this.notificationService.error(localize('projectBoard.openWindowFailed', "Agents Hub could not be opened."));
		}
	}
}

function getLastKnownIdentity(session: ISession, chat: IChat, reader?: IReader): IProjectBoardCardIdentity {
	const workspace = session.workspace?.read(reader)?.label;
	return {
		title: chat.title.read(reader).slice(0, projectBoardIdentityLabelLimit),
		sessionTitle: session.title.read(reader).slice(0, projectBoardIdentityLabelLimit),
		...(workspace !== undefined ? { workspace: workspace.slice(0, projectBoardIdentityLabelLimit) } : {}),
	};
}

registerSingleton(IProjectBoardService, ProjectBoardService, InstantiationType.Delayed);
