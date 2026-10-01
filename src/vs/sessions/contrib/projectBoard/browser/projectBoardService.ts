/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, addStandardDisposableListener, DisposableResizeObserver, disposableWindowInterval, EventType, getActiveWindow, getWindow, isHTMLElement } from '../../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
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
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { defaultButtonStyles, defaultInputBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { ChatQuestionContent } from '../../../../workbench/contrib/chat/browser/widget/chatContentParts/chatQuestionContent.js';
import { IChatPetService } from '../../../../workbench/contrib/chat/browser/chatPetService.js';
import { ChatPetState, getChatPetSpriteSources } from '../../../../workbench/contrib/chat/browser/widget/chatPetWidget.js';
import { ChatPetAccessoryIds, getChatPetAccessory } from '../../../../workbench/contrib/chat/browser/chatPetAchievements.js';
import { drawChatPetComposite, getChatPetAccessoryImageSource } from '../../../../workbench/contrib/chat/browser/widget/chatPetAccessoryRenderer.js';
import { CHAT_CARD_LARGE_CLASS } from '../../../../workbench/contrib/chat/browser/widget/chatCard.js';
import { formatCopilotCreditsLabel, IChatQuestionCarousel, IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatQuestionCarouselPart } from '../../../../workbench/contrib/chat/browser/widget/chatContentParts/chatQuestionCarouselPart.js';
import { IChatSessionsService } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IAuxiliaryWindow, IAuxiliaryWindowService } from '../../../../workbench/services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { IHostService } from '../../../../workbench/services/host/browser/host.js';
import { ChatInteractivity, getChatCapabilities, IChat, ISession, ISessionGitRepository, SessionStatus } from '../../../services/sessions/common/session.js';
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
import { COPY_AGENT_HOST_CHAT_LINK_COMMAND_ID } from '../../../common/sessionCommands.js';
import { ProjectBoardPreviewPool, IProjectBoardMetadataLease, IProjectBoardQuestionLease } from './projectBoardPreviewPool.js';
import { getProjectBoardContext, getProjectBoardPullRequestLabel, ProjectBoardContextPills } from './projectBoardContextPills.js';
import { matchesProjectBoardFilter } from '../common/projectBoardFilter.js';
import { ProjectBoardSupervisor } from './projectBoardSupervisor.js';
import './projectBoardCatalog.js';
import './media/projectBoard.css';

const projectBoardDragDataType = 'application/vnd.code.project-board-card';
const maxQuestionPreviews = 8;
type ProjectBoardStateFilter = 'busy' | 'needsInput' | 'error' | 'unread' | 'read' | 'starting' | 'draft' | 'unavailable';

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
	createView(container: HTMLElement, headerContainer?: HTMLElement): IProjectBoardView;
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
	private readonly expandedChats = new Set<string>();
	private readonly collapsedCards = new Set<string>();
	private readonly selectedCards = new Set<string>();
	private readonly cardSelectionLabels = new Map<string, HTMLElement>();
	private selectionAnchor: string | undefined;
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
	private readonly petSpriteImages = new Map<string, { image: HTMLImageElement; valid: boolean }>();
	private readonly workingPetSprites = new Map<string, string | undefined>();
	private readonly petSpriteLoads = this._register(new DisposableMap<string, DisposableStore>());
	private readonly previewRender = this._register(new RunOnceScheduler(() => this.render(), 0));
	private readonly gitHubResolution = this._register(new RunOnceScheduler(() => this.resolveGitHubInfo(), 0));
	private readonly deferredRenderSources = new Set<IObservable<unknown>>();
	private waitingForPreview = false;
	private readonly sessionObserver = this._register(new MutableDisposable());
	private readonly suspendedPreviews = this._register(new MutableDisposable());
	private readonly movePicker = this._register(new MutableDisposable<DisposableStore>());
	private creatingSession = false;
	readonly filterElement = mainWindow.document.createElement('div');
	private readonly searchInput: InputBox;
	private readonly searchSummary = mainWindow.document.createElement('span');
	private readonly filterChanged = this._register(new RunOnceScheduler(() => this.applyFilter(), 100));
	private externalHeader = false;
	private query = '';
	private stateFilter: ProjectBoardStateFilter | undefined;
	private stateCountsSummary: HTMLElement | undefined;
	private topicCardIds: ReadonlySet<string> | undefined;
	private selectedTopic: string | undefined;
	private supervisor: ProjectBoardSupervisor | undefined;
	private readonly topicElement = mainWindow.document.createElement('div');
	private readonly topicControls = this._register(new MutableDisposable<DisposableStore>());
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
	private readonly contextPills = this._register(new DisposableMap<string, ProjectBoardContextPills>());
	private readonly notifiedMetadataErrors = new Map<string, string>();
	private readonly resolvedGitHubRepositories = new WeakSet<ISessionGitRepository>();
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
	private readonly unassignedList = mainWindow.document.createElement('div');
	private readonly unassignedScrollable: DomScrollableElement;
	private readonly pinnedObserver: DisposableResizeObserver;
	private readonly pinnedLayout = this._register(new RunOnceScheduler(() => this.layoutPinned(), 0));
	private unassignedScrollTop = 0;
	private pinnedElement: HTMLElement | undefined;
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
		@IChatPetService private readonly chatPetService: IChatPetService,
		@ICommandService private readonly commandService: ICommandService,
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
		this.filterElement.className = 'project-board-filter';
		this.searchInput = this._register(new InputBox(this.filterElement, undefined, {
			inputBoxStyles: defaultInputBoxStyles,
			placeholder: localize('projectBoard.searchPlaceholder', "Filter chats…"),
			ariaLabel: localize('projectBoard.searchLabel', "Filter chats by title, workspace, status or description"),
		}));
		this.searchInput.inputElement.type = 'search';
		this.searchInput.inputElement.dataset.boardControl = 'search';
		this.searchSummary.className = 'project-board-filter-summary';
		this.searchSummary.setAttribute('role', 'status');
		this.topicElement.className = 'project-board-topics';
		this.topicElement.setAttribute('role', 'group');
		this.topicElement.setAttribute('aria-label', localize('projectBoard.topicFilters', "Supervisor topic filters"));
		this.filterElement.append(this.topicElement, this.searchSummary);
		this.renderTopics();
		this._register(this.searchInput.onDidChange(() => this.filterChanged.schedule()));
		this._register(addStandardDisposableListener(this.searchInput.inputElement, EventType.KEY_DOWN, event => {
			if (event.equals(KeyCode.Escape) && (this.searchInput.value || this.topicCardIds || this.stateFilter)) {
				event.preventDefault();
				event.stopPropagation();
				this.searchInput.value = '';
				this.topicCardIds = undefined;
				this.selectedTopic = undefined;
				this.stateFilter = undefined;
				this.renderTopics();
				this.applyFilter();
			} else if (event.equals(KeyCode.DownArrow) || event.equals(KeyCode.Enter)) {
				event.preventDefault();
				this.filterChanged.flush();
				this.visibleCardElements()[0]?.focus();
			}
		}));
		this._register(toDisposable(() => this.filterElement.remove()));
		this.boardElement.className = 'project-board';
		this.boardElement.dataset.boardId = this.boardId;
		this.unassignedScrollable = this._register(new DomScrollableElement(this.unassignedList, {
			horizontal: ScrollbarVisibility.Hidden, vertical: ScrollbarVisibility.Auto, useShadows: false,
		}));
		this.unassignedScrollable.getDomNode().classList.add('project-board-unassigned-scrollable');
		this._register(addDisposableListener(this.unassignedList, EventType.SCROLL, () => this.unassignedScrollable.scanDomNode()));
		this.pinnedObserver = this._register(new DisposableResizeObserver('ProjectBoardView.pinned', () => this.pinnedLayout.schedule(), getWindow(this.container)));
		this._register(this.pinnedObserver.observe(this.container));
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
		this.supervisor?.setActive(active);
		this.updateActiveCard();
		this.suspendedPreviews.clear();
		if (active) {
			this.observeSessions();
		} else {
			this.previewRender.cancel();
			this.gitHubResolution.cancel();
			this.contextPills.clearAndDisposeAll();
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

	attachHeader(container: HTMLElement): void {
		this.externalHeader = true;
		container.replaceChildren(this.filterElement);
	}

	private get filtering(): boolean {
		return !!this.query || !!this.topicCardIds || !!this.stateFilter;
	}

	private matchesCard(card: IProjectBoardCard, ignoreState = false): boolean {
		return (ignoreState || !this.stateFilter || this.getCardState(card) === this.stateFilter)
			&& (!this.topicCardIds || this.topicCardIds.has(card.id)) && matchesProjectBoardFilter(this.query, [
			card.title, card.sessionTitle, card.workspace ?? '', card.description ?? '',
			this.getStatusLabel(card), card.session.providerId,
			...card.pullRequests.map(pr => getProjectBoardPullRequestLabel(pr)),
		]);
	}

	private applyFilter(): void {
		this.filterChanged.cancel();
		this.query = this.searchInput.value.trim();
		this.model.setFilter(this.filtering ? card => this.matchesCard(card) : undefined);
		this.selectedCards.clear();
		this.selectionAnchor = undefined;
		this.observeSessions();
	}

	private updateSupervisor(): void {
		this.supervisor?.update(this.model.cards.filter(card => (this.showArchived || !card.archived)
			&& (this.boardState.configuration.get().autoIncludeSessions || this.model.getPlacement(card.id)))
			.sort((a, b) => (this.promptTimes.get(b.id) ?? 0) - (this.promptTimes.get(a.id) ?? 0) || a.id.localeCompare(b.id))
			.map(card => {
				const metadata = this.metadataStates.get(card.id);
				return {
					id: card.id, title: card.title, description: card.description ?? '', workspace: card.workspace ?? '',
					status: this.getStatusLabel(card), prompt: metadata?.kind === 'ready' ? metadata.prompt ?? '' : undefined,
				};
			}));
		this.renderTopics();
	}

	private async toggleSupervisor(): Promise<void> {
		if (this.supervisor?.enabled) {
			this.supervisor.setEnabled(false);
			return;
		}
		const result = await this.dialogService.confirm({
			message: localize('projectBoard.enableTopics', "Enable the board supervisor?"),
			detail: localize('projectBoard.enableTopicsDetail', "Send titles, descriptions, workspace labels, states and already-loaded prompt previews for up to 60 chats to Copilot's summary model. Changed snapshots are analyzed at most once every two minutes while this view is active. This may consume model usage. The supervisor cannot use tools, read files, or send messages to your agents. A local chat transcript records its analyses; monitoring stops when this view closes."),
			primaryButton: localize('projectBoard.enableTopicsButton', "Enable Topics"),
		});
		if (!result.confirmed || this._store.isDisposed || !this.active) {
			return;
		}
		if (!this.supervisor) {
			this.supervisor = this._register(this.instantiationService.createInstance(ProjectBoardSupervisor, this.title));
			this._register(this.supervisor.onDidChange(() => {
				if (this.selectedTopic) {
					const cardIds = this.supervisor?.topics.find(topic => topic.label === this.selectedTopic)?.cardIds;
					if (cardIds !== this.topicCardIds) {
						this.topicCardIds = cardIds;
						if (!cardIds) {
							this.selectedTopic = undefined;
						}
						this.applyFilter();
					}
				}
				this.renderTopics();
			}));
		}
		this.updateSupervisor();
		this.supervisor.setEnabled(true);
	}

	private topicsRenderKey: string | undefined;

	private renderTopics(): void {
		const topics = this.supervisor?.topics.map(topic => ({
			topic,
			count: this.model.cards.filter(card => topic.cardIds.has(card.id) && (this.showArchived || !card.archived)
				&& (this.boardState.configuration.get().autoIncludeSessions || this.model.getPlacement(card.id))).length,
		})).filter(topic => topic.count) ?? [];
		const key = JSON.stringify([this.supervisor?.enabled, this.supervisor?.busy, this.supervisor?.error,
			this.supervisor?.omitted, this.supervisor?.hasTranscript, this.supervisor?.stale, this.selectedTopic,
			topics.map(({ topic, count }) => [topic.label, [...topic.cardIds], count])]);
		if (key === this.topicsRenderKey) {
			return;
		}
		this.topicsRenderKey = key;
		const focused = this.topicElement.ownerDocument.activeElement?.getAttribute('data-topic-control');
		const restoreFocus = this.topicElement.ownerDocument.hasFocus();
		const store = new DisposableStore();
		this.topicControls.value = store;
		this.topicElement.replaceChildren();
		const add = (id: string, label: string, run: () => void, enabled = true) => {
			const button = store.add(new Button(this.topicElement, { ...defaultButtonStyles, secondary: true }));
			button.label = label;
			button.enabled = enabled;
			button.element.dataset.topicControl = id;
			store.add(button.onDidClick(run));
			if (id === focused && restoreFocus) {
				button.element.focus({ preventScroll: true });
			}
			return button;
		};
		add('toggle', this.supervisor?.enabled ? localize('projectBoard.stopTopics', "Stop Topics") : localize('projectBoard.startTopics', "Enable Topics"), () => { void this.toggleSupervisor(); });
		if (this.supervisor) {
			const supervisor = this.supervisor;
			add('refresh', supervisor.busy ? localize('projectBoard.analyzingTopics', "Analyzing…") : localize('projectBoard.refreshTopics', "Refresh Topics"),
				() => { void supervisor.refresh(); }, supervisor.enabled && !supervisor.busy);
			if (supervisor.hasTranscript) {
				add('transcript', localize('projectBoard.supervisorChat', "Supervisor Chat"), () => { void supervisor.openTranscript(); });
			}
			for (const [index, { topic, count }] of topics.entries()) {
				const button = add(`topic-${index}`, localize('projectBoard.topicCount', "{0} ({1})", topic.label, count), () => {
					const selected = this.selectedTopic !== topic.label;
					this.selectedTopic = selected ? topic.label : undefined;
					this.topicCardIds = selected ? topic.cardIds : undefined;
					this.applyFilter();
					this.renderTopics();
				});
				button.element.setAttribute('aria-pressed', String(this.selectedTopic === topic.label));
			}
			const message = mainWindow.document.createElement('span');
			message.className = 'project-board-topic-status';
			message.setAttribute('role', 'status');
			message.textContent = [
				supervisor.error ? localize('projectBoard.topicsError', "Topic analysis unavailable. {0}", supervisor.error) : '',
				!supervisor.enabled ? localize('projectBoard.topicsStopped', "Monitoring stopped.") : '',
				supervisor.stale && supervisor.hasTranscript ? localize('projectBoard.topicsStale', "Topics reflect an earlier snapshot.") : '',
				supervisor.omitted ? localize('projectBoard.topicLimit', "Snapshot limited to 60 chats; {0} omitted.", supervisor.omitted) : '',
				!supervisor.busy && !supervisor.error && supervisor.hasTranscript && !supervisor.topics.length ? localize('projectBoard.noTopics', "No topics found.") : '',
			].filter(Boolean).join(' ');
			this.topicElement.appendChild(message);
		}
		this._onDidChangeContentSize.fire();
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
		if (this.filtering) {
			this.searchInput.value = '';
			this.topicCardIds = undefined;
			this.selectedTopic = undefined;
			this.stateFilter = undefined;
			this.applyFilter();
			this.renderTopics();
		}
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
					if (!this.expandedChats.has(parent.id)) {
						this.expandedChats.add(parent.id);
						changed = true;
					}
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
		const element = (id && this.cardElements.get(id)) || this.searchInput.inputElement;
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
		(this.visibleCardElements()[0]
			?? [...this.controlElements.values()].find(element => element.tabIndex >= 0 && !element.closest('.project-board-card-list[hidden]'))
			?? this.searchInput.inputElement)?.focus({ preventScroll: true });
	}
	layout(_width: number, height: number): void {
		if (this.showHeader) {
			this.boardElement.style.height = `${height}px`;
		} else {
			this.boardElement.style.minHeight = `${height}px`;
		}
		this.layoutSessionLists();
		this.layoutPinned();
		this.scrollable?.scanDomNode();
	}

	private layoutPinned(): void {
		const pinned = this.pinnedElement;
		if (!pinned?.isConnected || !this.active) {
			return;
		}
		const viewport = this.showHeader ? this.boardElement : this.container.closest<HTMLElement>('.custom-view-scroll-content') ?? this.container;
		if (!viewport.clientHeight) {
			return;
		}
		this.boardElement.style.setProperty('--project-board-pinned-max-height', `${viewport.clientHeight / 2}px`);
		if (!this.unassignedList.hidden) {
			const scrollTop = this.rendering ? this.unassignedScrollTop : this.unassignedList.scrollTop;
			for (const entry of this.sessionLists.values()) {
				if (!entry.placement && entry.container.isConnected) {
					entry.container.style.height = `${entry.list.getContentHeight()}px`;
				}
			}
			this.unassignedList.style.height = 'auto';
			this.unassignedList.style.height = `${Math.min(this.unassignedList.scrollHeight, this.unassignedScrollable.getDomNode().clientHeight)}px`;
			this.layoutSessionLists();
			this.unassignedList.scrollTop = scrollTop;
		}
		this.unassignedScrollable.scanDomNode();
		this.boardElement.style.setProperty('--project-board-pinned-height', `${pinned.offsetHeight + parseFloat(getWindow(viewport).getComputedStyle(viewport).paddingTop)}px`);
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
		const appendCardDetails = (card: IProjectBoardCard) => {
			if (!this.showSessionList && this.collapsedCards.has(card.id)) {
				lines.push(localize('projectBoard.accessibleCollapsedDetails', "  Details collapsed"));
			}
			if (this.active && !this.showHeader && card.id === this.chatSidePanel.activeCardId.get()) {
				lines.push(localize('projectBoard.accessibleCurrentChat', "  Open in Side Panel"));
			}
			if (card.pullRequests.length) {
				lines.push(localize('projectBoard.pullRequests', "Pull Requests"));
			}
			for (const pullRequest of card.pullRequests) {
				lines.push(getProjectBoardPullRequestLabel(pullRequest), pullRequest.uri.toString(true));
			}
			const context = getProjectBoardContext(card, this.metadataStates.get(card.id));
			if (context.artifacts.length) {
				lines.push(localize('projectBoard.artifacts', "Artifacts"));
				for (const item of context.artifacts) {
					lines.push(item.label, (item.link ?? item.uri)?.toString(true) ?? '');
				}
			}
			if (context.references.length || context.promptContext.length) {
				lines.push(localize('projectBoard.references', "References"));
				for (const item of [...context.references, ...context.promptContext]) {
					lines.push(item.label, item.uri.toString(true));
				}
			}
		};
		const totals = this.getBoardEntries(true);
		lines.push(localize('projectBoard.boardSummary', "Board totals: {0}", this.groupSummary(totals.cards, totals.unavailable, totals.drafts)));
		if (this.stateFilter) {
			const state = this.stateCounts(totals.cards, totals.unavailable, totals.drafts, this.stateFilter).find(state => state.filter === this.stateFilter)!;
			lines.push(localize('projectBoard.activeStateFilter', "State filter: {0}. Activate the same count or the total to clear it.", state.label));
		}
		if (!this.showSessionList) {
			lines.push(localize('projectBoard.selectionHelp', "Click a chat to select it. Use Control or Command click to toggle selection, Shift click to select a range, or Control or Command Shift Enter on a focused card to toggle it. Mark as Done archives the selected chats' sessions, including their other chats. No chats are deleted."));
			lines.push(this.selectionLabel);
		}
		const appendGroup = (label: string, cards: readonly IProjectBoardCard[], collapsed: boolean, placement?: IProjectBoardPlacement) => {
			lines.push('', collapsed ? localize('projectBoard.collapsedGroup', "{0} (collapsed)", label) : label);
			const missing = this.getUnavailablePlacements(placement);
			const drafts = !placement && this.boardState.configuration.get().autoIncludeSessions ? this.getFilteredDrafts() : [];
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
						appendCardDetails(sibling);
					}
				} else {
					lines.push(localize('projectBoard.accessibleCard', "{0}, {1}, {2}", card.title, card.sessionTitle, this.getStatusLabel(card)));
					appendCardDetails(card);
					if (this.selectedCards.has(card.id)) {
						lines.push(localize('projectBoard.accessibleSelected', "  Selected"));
					}
					const children = this.withChildCards(this.model.getChildCards(card.id, this.showArchived));
					if (children.length) {
						const summary = this.childChatSummary(children);
						lines.push(this.filtering || this.expandedChats.has(card.id) ? summary : localize('projectBoard.collapsedGroup', "{0} (collapsed)", summary));
						for (const child of children) {
							lines.push(localize('projectBoard.accessibleChildChat', "  {0}, {1}", child.title, this.getStatusLabel(child)));
							appendCardDetails(child);
						}
					}
				}
			}
		};
		appendGroup(localize('projectBoard.unassigned', "Unassigned"), this.model.getUnassignedCards(this.showArchived), this.isCollapsed(undefined));
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
			this.chatPetService.variant.read(reader);
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
					card.session.isRead.read(reader);
				}
			}
			this.stateDurations.update(this.model.cards);
			this.gitHubResolution.schedule();
			this.updateMetadata(reader);
			this.updateConfigurationDetails(reader);
			this.updateChatActions(reader);
			this.updateQuestionPreviews(reader);
			this.updateSupervisor();
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
		const visible = this.getDisplayedCards();
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
			const previous = this.metadataPreviews.get(card.id);
			if (previous && this.readPreview(previous.isRevoked, reader)) {
				this.metadataPreviews.deleteAndDispose(card.id);
				this.metadataChats.delete(card.id);
			}
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
			this.readPreview(helper.isRevoked, reader);
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

	private refreshMetadata(cardId: string): void {
		if (!this.active || this._store.isDisposed) {
			return;
		}
		const card = this.getDisplayedCards().find(card => card.id === cardId);
		if (!card || card.connection || !this.sessionsProvidersService.getProvider(card.session.providerId)) {
			this.notificationService.warn(localize('projectBoard.refreshUnavailable', "This chat is no longer available for refresh."));
			return;
		}
		try {
			const lease = this.previewPool.acquireMetadata(card.chat, true);
			if (!lease) {
				this.notificationService.warn(localize('projectBoard.refreshBusy', "All preview slots have pending input or approvals. Finish an interaction or open the chat to see its details."));
				return;
			}
			this.metadataPreviews.set(card.id, lease);
			this.metadataChats.set(card.id, card.chat);
			this.observeSessions();
		} catch (error) {
			this.logService.error('[ProjectBoard] Failed to refresh chat metadata', error);
			this.notificationService.error(localize('projectBoard.refreshFailed', "Could not refresh the chat details."));
		}
	}

	private resolveGitHubInfo(): void {
		if (!this.active || this._store.isDisposed) {
			return;
		}
		for (const card of this.getDisplayedCards()) {
			const workspace = card.chat.workspace?.get() ?? card.session.workspace?.get();
			for (const folder of workspace?.folders ?? []) {
				const repository = folder.gitRepository;
				if (!repository?.resolveGitHubInfo || this.resolvedGitHubRepositories.has(repository)) {
					continue;
				}
				this.resolvedGitHubRepositories.add(repository);
				try {
					repository.resolveGitHubInfo();
				} catch (error) {
					this.logService.error('[ProjectBoard] Failed to resolve pull request information', error);
					this.notificationService.error(localize('projectBoard.pullRequestsFailed', "Could not load pull request information for \"{0}\".", folder.name));
				}
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
		const displayed = this.withChildCards([
			...this.model.getUnassignedCards(this.showArchived),
			...this.model.rows.flatMap(row => this.model.columns.flatMap(column => {
				const placement = { rowId: row.id, columnId: column.id };
				return this.model.getCards(row.id, column.id, this.showArchived).slice(0, this.visibleCounts.get(this.cellKey(placement)) ?? 3);
			})),
		]);
		const retained = new Set([
			...this.actionWidgets.keys(), ...[...this.questionWidgets.values()].map(widget => widget.cardId),
		]);
		return [...new Map([...displayed, ...this.model.cards.filter(card => retained.has(card.id) && !card.archived
			&& (this.boardState.configuration.get().autoIncludeSessions || this.model.getPlacement(card.id)))].map(card => [card.id, card])).values()];
	}

	private withChildCards(cards: readonly IProjectBoardCard[], filter?: (card: IProjectBoardCard) => boolean): readonly IProjectBoardCard[] {
		return this.showSessionList ? cards : cards.flatMap(card => [card, ...this.withChildCards(this.model.getChildCards(card.id, this.showArchived, filter), filter)]);
	}

	private getBoardEntries(ignoreState = false): { cards: readonly IProjectBoardCard[]; unavailable: number; drafts: readonly IProjectBoardDraft[] } {
		const cells = this.model.rows.flatMap(row => this.model.columns.map(column => ({ rowId: row.id, columnId: column.id })));
		const filter = ignoreState ? (card: IProjectBoardCard) => this.matchesCard(card, true) : undefined;
		return {
			cards: this.withChildCards([
				...this.model.getUnassignedCards(this.showArchived, filter),
				...cells.flatMap(cell => this.model.getCards(cell.rowId, cell.columnId, this.showArchived, filter)),
			], filter),
			unavailable: cells.reduce((count, cell) => count + this.getUnavailablePlacements(cell, ignoreState).length, 0),
			drafts: this.boardState.configuration.get().autoIncludeSessions ? this.getFilteredDrafts(ignoreState) : [],
		};
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
		const stateCountsScrollLeft = this.stateCountsSummary?.scrollLeft ?? 0;
		if (!this.unassignedList.hidden) {
			this.unassignedScrollTop = this.unassignedList.scrollTop;
		}
		const ownerDocument = this.container.ownerDocument;
		// A background document retains activeElement but must not reclaim window focus.
		const activeElement = ownerDocument.hasFocus() ? ownerDocument.activeElement : null;
		const focusedSearch = activeElement === this.searchInput.inputElement;
		const focusedControl = activeElement?.getAttribute('data-board-control');
		const focusedQuestion = activeElement && [...this.questionWidgets.values()].some(widget => widget.element.contains(activeElement)) ? activeElement : undefined;
		const focusedAction = activeElement && [...this.actionWidgets.values()].some(widget => widget.element.contains(activeElement)) ? activeElement : undefined;
		const focusedPill = activeElement && [...this.contextPills.values()].some(widget => widget.element.contains(activeElement)) ? activeElement : undefined;
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
		this.cardSelectionLabels.clear();
		this.controlElements.clear();
		this.selectionCount = undefined;
		this.markDoneButton = undefined;
		this.clearSelectionButton = undefined;
		this.durationElements.clear();
		this.recencyElements.clear();
		// Keep the scroll viewport and context-view hosts intact while rebuilding card content.
		this.boardElement.replaceChildren();
		this.unassignedList.replaceChildren();

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
			header.appendChild(heading);
			header.appendChild(this.filterElement);

			const tools = document.createElement('div');
			tools.className = 'project-board-tools';
			for (const kind of ['row', 'column'] as const) {
				const add = this.createControl(tools, kind === 'row' ? localize('projectBoard.addRow', "Add Row") : localize('projectBoard.addColumn', "Add Column"), `add-${kind}`, store);
				store.add(add.onDidClick(() => { void this.addAxis(kind); }));
			}
			header.appendChild(tools);
			const settings = this.createControl(header, localize('projectBoard.settings', "Settings"), 'settings', store);
			settings.label = '';
			settings.icon = Codicon.settingsGear;
			settings.element.classList.add('project-board-settings');
			settings.element.setAttribute('aria-haspopup', 'menu');
			settings.element.setAttribute('aria-label', localize('projectBoard.boardSettings', "Board settings"));
			store.add(this.hoverService.setupDelayedHover(settings.element, { content: localize('projectBoard.boardSettings', "Board settings") }));
			store.add(settings.onDidClick(() => this.showSettings(settings.element)));
			board.appendChild(header);
		} else if (!this.externalHeader) {
			board.appendChild(this.filterElement);
		}
		const matchingEntries = this.getBoardEntries();
		const matching = (this.showSessionList ? matchingEntries.cards : matchingEntries.cards.filter(card => this.matchesCard(card))).length
			+ matchingEntries.unavailable + matchingEntries.drafts.length;
		this.searchSummary.textContent = this.filtering
			? matching === 1 ? localize('projectBoard.filterSingleChat', "1 matching chat") : localize('projectBoard.filterCount', "{0} matching chats", matching)
			: '';
		const pinned = this.pinnedElement = document.createElement('div');
		pinned.className = 'project-board-pinned';
		const selectionTools = document.createElement('div');
		selectionTools.className = 'project-board-selection-tools';
		selectionTools.setAttribute('role', 'group');
		selectionTools.setAttribute('aria-label', localize('projectBoard.selectionActions', "Board summary and chat selection"));
		const overview = document.createElement('div');
		overview.className = 'project-board-selection-overview';
		const summary = document.createElement('span');
		summary.className = 'project-board-total-summary';
		this.stateCountsSummary = summary;
		summary.setAttribute('role', 'group');
		summary.setAttribute('aria-label', localize('projectBoard.boardTotals', "Board totals"));
		const totals = this.getBoardEntries(true);
		this.createStateFilterControl(summary, this.entryCountLabel(totals.cards.length + totals.unavailable + totals.drafts.length), undefined, store);
		this.appendStateCounts(summary, totals.cards, store, totals.unavailable, totals.drafts, true);
		overview.appendChild(summary);
		selectionTools.appendChild(overview);
		if (!this.showSessionList) {
			this.selectionCount = document.createElement('span');
			this.selectionCount.className = 'project-board-selection-count';
			this.selectionCount.setAttribute('role', 'status');
			this.selectionCount.setAttribute('aria-atomic', 'true');
			overview.appendChild(this.selectionCount);
			this.markDoneButton = this.createControl(selectionTools, localize('projectBoard.markDone', "Mark as Done"), 'mark-done', store);
			store.add(this.markDoneButton.onDidClick(() => { void this.markCardsDone([...this.selectedCards]); }));
			this.clearSelectionButton = this.createControl(selectionTools, localize('projectBoard.clearSelection', "Clear Selection"), 'clear-selection', store);
			store.add(this.clearSelectionButton.onDidClick(() => {
				if (!this.markingDone) {
					this.selectedCards.clear();
					this.selectionAnchor = undefined;
					this.updateSelectionControls();
				}
			}));
			const description = document.createElement('span');
			description.className = 'project-board-selection-description';
			description.id = `project-board-selection-description-${this.viewId}`;
			description.textContent = localize('projectBoard.archiveScope', "Archives the selected chats' sessions, including their other chats. No chats are deleted.");
			this.markDoneButton.element.setAttribute('aria-describedby', description.id);
			store.add(this.hoverService.setupDelayedHover(this.markDoneButton.element, { content: description.textContent }));
			selectionTools.appendChild(description);
		}
		pinned.appendChild(selectionTools);
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
		pinned.appendChild(unassigned);
		board.appendChild(pinned);
		store.add(this.pinnedObserver.observe(pinned));
		for (const child of this.unassignedList.children) {
			store.add(this.pinnedObserver.observe(child));
		}

		const grid = document.createElement('section');
		grid.className = 'project-board-grid';
		grid.style.gridTemplateColumns = this.model.columns.map(column => !this.filtering && this.collapsedColumns.has(column.id) ? 'minmax(72px, 90px)' : `minmax(${this.showSessionList ? 260 : 180}px, 1fr)`).join(' ');
		grid.setAttribute('aria-label', localize('projectBoard.grid', "Project board"));

		for (const column of this.model.columns) {
			const heading = document.createElement('h2');
			heading.className = 'project-board-column-heading';
			this.renderAxis(heading, column, 'column', store);
			grid.appendChild(heading);
		}

		for (const row of this.model.rows) {
			const rowHeading = document.createElement('h2');
			rowHeading.className = 'project-board-row-heading';
			rowHeading.style.gridColumn = '1 / -1';
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
		for (const [id, widget] of this.contextPills) {
			if (!this.cardElements.get(id)?.contains(widget.element)) {
				this.contextPills.deleteAndDispose(id);
			}
		}
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
		this.updateCardTimes();
		this.layoutSessionLists();
		this.layoutPinned();
		board.scrollTop = scrollTop;
		board.scrollLeft = scrollLeft;
		summary.scrollLeft = stateCountsScrollLeft;
		this.scrollable?.scanDomNode();
		if (this.scrollObserver) {
			for (const child of board.children) {
				store.add(this.scrollObserver.observe(child, { box: 'border-box' }));
			}
		}
		if (this.durationElements.size || this.recencyElements.size) {
			store.add(disposableWindowInterval(getWindow(this.container), () => this.updateCardTimes(), 1000));
		}
		this.rendering = false;
		if (ownerDocument.hasFocus()) {
			if (focusedSearch) {
				this.searchInput.focus();
			} else if (focusedPill?.isConnected && isHTMLElement(focusedPill)) {
				focusedPill.focus({ preventScroll: true });
			} else if (focusedAction?.isConnected && isHTMLElement(focusedAction)) {
				focusedAction.focus({ preventScroll: true });
			} else if (focusedQuestion?.isConnected && isHTMLElement(focusedQuestion)) {
				focusedQuestion.focus({ preventScroll: true });
			} else if (focusedControl) {
				const fallback = focusedControl.startsWith('more:') ? focusedControl.replace('more:', 'less:') : focusedControl.replace('less:', 'more:');
				const refreshedCard = focusedControl.startsWith('refresh:') ? this.cardElements.get(focusedControl.slice('refresh:'.length)) : undefined;
				(this.controlElements.get(focusedControl) ?? this.controlElements.get(fallback) ?? refreshedCard ?? this.markDoneButton?.element)?.focus({ preventScroll: true });
			} else if (focusedCard) {
				const card = this.model.cards.find(card => card.id === focusedCard[0]);
				if (card && this.showSessionList) {
					this.focusChat(card.chat.resource);
				} else {
					this.cardElements.get(focusedCard[0])?.focus({ preventScroll: true });
				}
			} else if (focusedListSession) {
				this.focusChat(focusedListChat?.resource ?? focusedListSession.mainChat.get().resource);
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
			const child = this.active && !this.showHeader && !this.expandedChats.has(parentId)
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
		const stateFilter = key.startsWith('state-filter:');
		const frameless = key.startsWith('axis:') || key.startsWith('collapse:') || stateFilter;
		const button = store.add(new Button(container, {
			...defaultButtonStyles, secondary: true,
			...(frameless ? {
				buttonSecondaryBorder: stateFilter ? 'var(--project-board-filter-border, transparent)' : undefined,
				buttonSecondaryBackground: stateFilter ? 'var(--project-board-filter-background, transparent)' : 'transparent',
				buttonSecondaryHoverBackground: stateFilter ? 'var(--project-board-filter-background, var(--vscode-toolbar-hoverBackground))' : 'var(--vscode-toolbar-hoverBackground)',
				buttonSecondaryForeground: stateFilter ? 'var(--project-board-filter-foreground, var(--vscode-descriptionForeground))' : 'var(--vscode-foreground)',
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
		const eligible = new Set(this.model.cards.filter(card => this.canMarkDone(card) && this.model.matchesFilter(card, this.showArchived)).map(card => card.id));
		for (const id of this.selectedCards) {
			if (!eligible.has(id)) {
				this.selectedCards.delete(id);
			}
		}
		if (this.selectionAnchor && !eligible.has(this.selectionAnchor)) {
			this.selectionAnchor = undefined;
		}
	}

	private get selectionLabel(): string {
		return this.selectedCards.size === 1
			? localize('projectBoard.oneSelected', "1 chat selected")
			: localize('projectBoard.selectedCount', "{0} chats selected", this.selectedCards.size);
	}

	private updateSelectionControls(): void {
		if (this.selectionCount) {
			this.selectionCount.textContent = this.markingDone
				? localize('projectBoard.markingDone', "Marking chats as done…")
				: this.selectionLabel;
		}
		if (this.markDoneButton) {
			this.markDoneButton.enabled = this.selectedCards.size > 0 && !this.markingDone;
		}
		if (this.clearSelectionButton) {
			this.clearSelectionButton.enabled = this.selectedCards.size > 0 && !this.markingDone;
		}
		for (const [id, label] of this.cardSelectionLabels) {
			const selected = this.selectedCards.has(id);
			this.cardElements.get(id)?.classList.toggle('project-board-card-selected', selected);
			label.textContent = selected ? localize('projectBoard.selected', "Selected") : localize('projectBoard.notSelected', "Not selected");
		}
	}

	private selectCard(card: IProjectBoardCard, toggle: boolean, range = false): void {
		if (this.markingDone || !this.canMarkDone(card)) {
			return;
		}
		const visible = this.visibleCardElements();
		const anchor = this.selectionAnchor && this.cardElements.get(this.selectionAnchor);
		const start = anchor ? visible.indexOf(anchor) : -1;
		const end = visible.indexOf(this.cardElements.get(card.id)!);
		if (!toggle) {
			this.selectedCards.clear();
		}
		if (range && start >= 0 && end >= 0) {
			const elements = new Set(visible.slice(Math.min(start, end), Math.max(start, end) + 1));
			for (const candidate of this.model.cards) {
				if (this.canMarkDone(candidate) && elements.has(this.cardElements.get(candidate.id)!)) {
					this.selectedCards.add(candidate.id);
				}
			}
		} else {
			if (!toggle || !this.selectedCards.delete(card.id)) {
				this.selectedCards.add(card.id);
			}
			this.selectionAnchor = card.id;
		}
		this.updateSelectionControls();
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
			this.notificationService.error(localize('projectBoard.markDoneFailed', "{0} of {1} sessions could not be marked as done. The remaining selected chats can be retried.", failures, targets.size));
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
					id: 'projectBoard.settings.archived',
					label: localize('projectBoard.showArchived', "Show Archived"),
					checked: this.showArchived,
					run: () => this.toggleArchived(),
				}),
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
			].filter(action => this.boardState.canEdit || action.id === 'projectBoard.settings.archived'),
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
		const collapsed = !this.filtering && (kind === 'row' ? this.collapsedRows : this.collapsedColumns).has(axis.id);
		const controls = mainWindow.document.createElement('div');
		controls.className = 'project-board-axis-controls';
		container.appendChild(controls);
		const axisName = kind === 'row' ? localize('projectBoard.row', "row") : localize('projectBoard.column', "column");
		const placementIds = kind === 'row'
			? this.model.columns.map(column => `${this.groupId({ rowId: axis.id, columnId: column.id })}-cards`)
			: this.model.rows.map(row => `${this.groupId({ rowId: row.id, columnId: axis.id })}-cards`);
		const button = this.createControl(controls, kind === 'row' ? '' : axis.label, `axis:${kind}:${axis.id}`, store);
		const disclosure = this.createCollapseControl(controls, `collapse:${kind}:${axis.id}`, localize('projectBoard.axisName', "{0}: {1}", axisName, axis.label), collapsed, placementIds, () => {
			const ids = kind === 'row' ? this.collapsedRows : this.collapsedColumns;
			if (ids.has(axis.id)) {
				ids.delete(axis.id);
			} else {
				ids.add(axis.id);
			}
		}, store, kind === 'row' ? axis.label : undefined);
		if (kind === 'row') {
			disclosure.element.classList.add('project-board-row-toggle');
			controls.prepend(disclosure.element);
			button.icon = Codicon.ellipsis;
			button.element.classList.add('project-board-axis-menu');
		}
		if (collapsed) {
			const cards = this.withChildCards(kind === 'row'
				? this.model.columns.flatMap(column => this.model.getCards(axis.id, column.id, this.showArchived))
				: this.model.rows.flatMap(row => this.model.getCards(row.id, axis.id, this.showArchived)));
			const missing = (kind === 'row'
				? this.model.columns.flatMap(column => this.getUnavailablePlacements({ rowId: axis.id, columnId: column.id }))
				: this.model.rows.flatMap(row => this.getUnavailablePlacements({ rowId: row.id, columnId: axis.id }))).length;
			const summary = mainWindow.document.createElement('span');
			summary.className = 'project-board-collapsed-summary';
			summary.textContent = this.entryCountLabel(cards.length + missing);
			this.appendStateCounts(summary, cards, store, missing);
			(kind === 'row' ? controls : container).appendChild(summary);
		}
		const menuLabel = localize('projectBoard.editAxis', "Edit {0}: {1}", axisName, axis.label);
		button.element.setAttribute('aria-label', menuLabel);
		button.element.setAttribute('aria-haspopup', 'menu');
		button.element.setAttribute('aria-expanded', 'false');
		store.add(this.hoverService.setupDelayedHover(button.element, { content: menuLabel }));
		store.add(button.onDidClick(() => {
			this.menuOpen = true;
			button.element.setAttribute('aria-expanded', 'true');
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
					button.element.setAttribute('aria-expanded', 'false');
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

	private entryCountLabel(count: number): string {
		return count === 1 ? localize('projectBoard.singleChat', "1 chat") : localize('projectBoard.chatCount', "{0} chats", count);
	}

	private groupSummary(cards: readonly IProjectBoardCard[], unavailable = 0, drafts: readonly IProjectBoardDraft[] = []): string {
		return [this.entryCountLabel(cards.length + unavailable + drafts.length), ...this.stateCounts(cards, unavailable, drafts).map(state => state.label)].join(' · ');
	}

	private createStateFilterControl(container: HTMLElement, label: string, filter: ProjectBoardStateFilter | undefined, store: DisposableStore): Button {
		const key = `state-filter:${filter ?? 'all'}`;
		const button = this.createControl(container, label, key, store);
		button.element.classList.add('project-board-state-filter');
		button.element.setAttribute('aria-pressed', String(this.stateFilter === filter));
		button.element.setAttribute('aria-label', filter
			? localize('projectBoard.filterState', "Filter chats: {0}", label)
			: localize('projectBoard.filterAllStates', "{0}, show all chat states", label));
		store.add(addDisposableListener(button.element, EventType.FOCUS, () => {
			const bounds = button.element.getBoundingClientRect();
			const viewport = container.getBoundingClientRect();
			container.scrollLeft += bounds.left < viewport.left ? bounds.left - viewport.left : Math.max(0, bounds.right - viewport.right);
		}));
		store.add(button.onDidClick(() => {
			this.stateFilter = this.stateFilter === filter ? undefined : filter;
			this.applyFilter();
			if (container.ownerDocument.hasFocus()) {
				this.controlElements.get(key)?.focus();
			}
		}));
		return button;
	}

	private appendStateCounts(summary: HTMLElement, cards: readonly IProjectBoardCard[], store: DisposableStore, unavailable = 0, drafts: readonly IProjectBoardDraft[] = [], filterable = false): void {
		for (const { label, glyph, petState, filter } of this.stateCounts(cards, unavailable, drafts, filterable ? this.stateFilter : undefined)) {
			summary.append(' · ');
			const state = filterable ? this.createStateFilterControl(summary, label, filter, store).element : summary.ownerDocument.createElement('span');
			state.classList.add('project-board-state-count');
			const icon = this.createStatusIcon(summary.ownerDocument, glyph, petState === 'typing', { state: petState, store }, 16);
			icon.classList.add('project-board-state-count-icon');
			const text = summary.ownerDocument.createElement('span');
			text.textContent = ` ${label}`;
			state.replaceChildren(icon, text);
			if (!filterable) {
				summary.appendChild(state);
			}
		}
		summary.title = summary.textContent ?? '';
	}

	private getCardState(card: IProjectBoardCard): ProjectBoardStateFilter {
		switch (this.getPresentationStatus(card)) {
			case SessionStatus.InProgress: return 'busy';
			case SessionStatus.NeedsInput: return 'needsInput';
			case SessionStatus.Error: return 'error';
			case SessionStatus.Untitled: return 'starting';
			default: return (this.showSessionList ? card.session.isRead.get() : card.isRead) ? 'read' : 'unread';
		}
	}

	private stateCounts(cards: readonly IProjectBoardCard[], unavailable = 0, drafts: readonly IProjectBoardDraft[] = [], includeEmpty?: ProjectBoardStateFilter): { label: string; glyph: string; petState: ChatPetState; filter: ProjectBoardStateFilter }[] {
		const counts = new Map<ProjectBoardStateFilter, number>();
		for (const card of cards) {
			const state = this.getCardState(card);
			counts.set(state, (counts.get(state) ?? 0) + 1);
		}
		const startingDrafts = drafts.filter(draft => draft.submitted).length;
		const states: readonly [ProjectBoardStateFilter, number, string, string, ChatPetState][] = [
			['busy', counts.get('busy') ?? 0, localize('projectBoard.busy', "Busy"), this.getStatusGlyph(SessionStatus.InProgress), this.getStatusPetState(SessionStatus.InProgress)],
			['needsInput', counts.get('needsInput') ?? 0, localize('projectBoard.needsInput', "Needs Input"), this.getStatusGlyph(SessionStatus.NeedsInput), this.getStatusPetState(SessionStatus.NeedsInput)],
			['error', counts.get('error') ?? 0, localize('projectBoard.error', "Error"), this.getStatusGlyph(SessionStatus.Error), this.getStatusPetState(SessionStatus.Error)],
			['unread', counts.get('unread') ?? 0, localize('projectBoard.idleUnread', "Idle, unread"), this.getStatusGlyph(SessionStatus.Completed, false), this.getStatusPetState(SessionStatus.Completed, false)],
			['read', counts.get('read') ?? 0, localize('projectBoard.idleRead', "Idle, read"), this.getStatusGlyph(SessionStatus.Completed), this.getStatusPetState(SessionStatus.Completed)],
			['starting', (counts.get('starting') ?? 0) + startingDrafts, localize('projectBoard.startingState', "Starting"), '\u23F3', this.getStatusPetState(SessionStatus.Untitled)],
			['draft', drafts.length - startingDrafts, localize('projectBoard.draftState', "Draft"), '\u270F\uFE0F', 'idle'],
			['unavailable', unavailable, localize('projectBoard.unavailableState', "Unavailable"), '\u{1F6AB}', 'dizzy'],
		];
		return states.filter(([filter, count]) => count > 0 || filter === includeEmpty).map(([filter, count, label, glyph, petState]) => ({ label: localize('projectBoard.stateCount', "{0} {1}", count, label), glyph, petState, filter }));
	}

	private isCollapsed(placement: IProjectBoardPlacement | undefined): boolean {
		return !this.filtering && (placement ? this.collapsedRows.has(placement.rowId) || this.collapsedColumns.has(placement.columnId) : this.unassignedCollapsed);
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

	private createCollapseControl(container: HTMLElement, key: string, name: string, collapsed: boolean, controlledIds: string[], toggle: () => void, store: DisposableStore, visibleLabel?: string): Button {
		const button = this.createControl(container, visibleLabel ?? '', key, store);
		button.enabled = !this.filtering;
		const icon = collapsed ? Codicon.chevronRight : Codicon.chevronDown;
		if (visibleLabel !== undefined) {
			const glyph = renderIcon(icon);
			glyph.setAttribute('aria-hidden', 'true');
			const text = mainWindow.document.createElement('span');
			text.className = 'project-board-axis-label';
			text.textContent = visibleLabel;
			button.element.replaceChildren(glyph, text);
		} else {
			button.icon = icon;
		}
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
		return button;
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
			detail: localize('projectBoard.resetDetail', "This replaces saved labels and placements with the default board. Chats and their history will not be deleted."),
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
			const toggle = this.createCollapseControl(heading, 'collapse:unassigned', label, collapsed, [`${group.id}-cards`], () => {
				this.unassignedCollapsed = !this.unassignedCollapsed;
			}, store, label);
			toggle.element.classList.add('project-board-tray-toggle');
		}
		if (!placement) {
			group.appendChild(heading);
		}
		const allCards = this.withChildCards(cards);
		const needsInput = allCards.filter(card => this.getPresentationStatus(card) === SessionStatus.NeedsInput).length;
		if (needsInput && !collapsed && placement) {
			const attention = document.createElement('span');
			attention.className = 'project-board-attention';
			attention.textContent = localize('projectBoard.attention', "{0} Needs Input", needsInput);
			group.appendChild(attention);
		}

		const list = placement ? document.createElement('div') : this.unassignedList;
		list.className = 'project-board-card-list';
		const autoIncludeSessions = this.boardState.configuration.get().autoIncludeSessions;
		list.id = `${group.id}-cards`;
		list.hidden = collapsed;
		const missing = this.getUnavailablePlacements(placement);
		const totalCount = cards.length + missing.length;
		if (collapsed || !placement) {
			const summary = document.createElement('span');
			summary.className = placement ? 'project-board-collapsed-summary' : 'project-board-collapsed-summary project-board-unassigned-summary';
			const drafts = placement || !autoIncludeSessions ? [] : this.getFilteredDrafts();
			summary.textContent = this.entryCountLabel(allCards.length + missing.length + drafts.length);
			this.appendStateCounts(summary, allCards, store, missing.length, drafts);
			(placement ? group : heading).appendChild(summary);
		}
		if (!placement && autoIncludeSessions) {
			for (const draft of this.getFilteredDrafts()) {
				list.appendChild(this.createDraftCard(document, draft, store));
			}
		}
		const limit = placement && !this.showSessionList ? this.visibleCounts.get(this.cellKey(placement)) ?? 3 : cards.length;
		if (this.showSessionList && cards.length) {
			list.appendChild(this.getSessionList(cards.map(card => card.session), placement).container);
		} else {
			for (const card of cards.slice(0, limit)) {
				list.appendChild(this.createCardFamily(document, card, store, !collapsed));
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
		if (totalCount === 0 && (placement || !autoIncludeSessions || this.getFilteredDrafts().length === 0)) {
			const empty = document.createElement('span');
			empty.className = 'project-board-empty';
			empty.textContent = this.filtering ? localize('projectBoard.noMatches', "No matching chats")
				: this.showSessionList ? localize('projectBoard.emptySessionList', "Drop a session here") : localize('projectBoard.empty', "Drop a chat here");
			list.appendChild(empty);
		}
		if (placement) {
			group.appendChild(list);
		} else {
			const scrollable = this.unassignedScrollable.getDomNode();
			scrollable.hidden = collapsed;
			group.appendChild(scrollable);
		}
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

	private getUnavailablePlacements(placement: IProjectBoardPlacement | undefined, ignoreState = false): readonly IProjectBoardSavedPlacement[] {
		return placement ? this.boardState.configuration.get().placements.filter(item =>
			item.rowId === placement.rowId && item.columnId === placement.columnId && !this.model.hasChat(item.cardId)
			&& (ignoreState || !this.stateFilter || this.stateFilter === 'unavailable')
			&& !this.topicCardIds && matchesProjectBoardFilter(this.query, [this.getUnavailableDetails(item).title, ...this.getUnavailableDetails(item).description])) : [];
	}

	private getFilteredDrafts(ignoreState = false): readonly IProjectBoardDraft[] {
		return !this.topicCardIds && matchesProjectBoardFilter(this.query, [localize('projectBoard.newSession', "New Session"), localize('projectBoard.draftState', "Draft")])
			? this.drafts.filter(draft => ignoreState || !this.stateFilter || this.stateFilter === (draft.submitted ? 'starting' : 'draft')) : [];
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

	private createCardFamily(document: Document, card: IProjectBoardCard, store: DisposableStore, visible: boolean): HTMLElement {
		const parent = this.createCard(document, card, store, visible);
		const children = this.model.getChildCards(card.id, this.showArchived);
		if (!children.length) {
			return parent;
		}
		const family = document.createElement('div');
		family.className = 'project-board-card-family';
		const childCards = document.createElement('div');
		childCards.className = 'project-board-child-cards';
		childCards.id = `project-board-children-${generateUuid()}`;
		childCards.hidden = !this.filtering && !this.expandedChats.has(card.id);
		childCards.setAttribute('role', 'group');
		const name = localize('projectBoard.childrenOf', "Child chats of {0}", card.title);
		childCards.setAttribute('aria-label', name);
		const heading = document.createElement('div');
		heading.className = 'project-board-child-heading';
		const summary = document.createElement('span');
		summary.className = 'project-board-child-summary';
		const descendants = this.withChildCards(children);
		summary.textContent = this.childChatCountLabel(descendants.length);
		this.appendStateCounts(summary, descendants, store);
		const monitoredChild = document.createElement('span');
		monitoredChild.className = 'project-board-monitored-child-label';
		monitoredChild.id = `project-board-monitored-child-${generateUuid()}`;
		monitoredChild.hidden = true;
		summary.appendChild(monitoredChild);
		this.monitoredChildLabels.set(card.id, { element: monitoredChild, children: descendants });
		heading.appendChild(summary);
		this.createCollapseControl(heading, `collapse:children:${card.id}`, name, childCards.hidden, [childCards.id], () => {
			if (!this.expandedChats.delete(card.id)) {
				this.expandedChats.add(card.id);
			}
		}, store);
		for (const child of children) {
			childCards.appendChild(this.createCardFamily(document, child, store, visible && !childCards.hidden));
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
				collapseChatChildrenByDefault: true,
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
		const style = getWindow(this.container).getComputedStyle(this.unassignedList);
		const trayHeight = Math.max(0, this.unassignedList.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom));
		for (const entry of this.sessionLists.values()) {
			if (entry.container.isConnected && !this.isCollapsed(entry.placement)) {
				const height = entry.placement ? entry.list.getContentHeight() : Math.min(entry.list.getContentHeight(), trayHeight);
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
		element.appendChild(this.createStatus(document, statusLabel, draft.submitted ? this.getStatusGlyph(SessionStatus.InProgress) : '\u270F\uFE0F', draft.submitted, { state: draft.submitted ? 'typing' : 'idle', store }));
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
		this.createCardActionButton(document, element, localize('projectBoard.deleteDraft', "Delete Session Draft"), Codicon.trash, async () => {
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

	private createCard(document: Document, card: IProjectBoardCard, store: DisposableStore, visible: boolean): HTMLElement {
		const element = document.createElement('article');
		const descriptions: string[] = [];
		const summaryDescriptions: string[] = [];
		const details = document.createElement('div');
		details.className = 'project-board-card-details';
		details.id = `project-board-card-details-${generateUuid()}`;
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
			element.classList.add('project-board-card-selectable');
			const selection = document.createElement('span');
			selection.className = 'project-board-card-selection-label';
			selection.hidden = true;
			selection.id = `project-board-selection-${generateUuid()}`;
			summaryDescriptions.push(selection.id);
			this.cardSelectionLabels.set(card.id, selection);
			element.appendChild(selection);
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

		const disclosure = this.createControl(heading, '', `collapse:card:${card.id}`, store);
		disclosure.element.classList.add('project-board-collapse', 'project-board-card-collapse');
		disclosure.element.setAttribute('aria-controls', details.id);
		const updateDetails = () => {
			const collapsed = this.collapsedCards.has(card.id);
			details.hidden = collapsed;
			this.contextPills.get(card.id)?.setVisible(!collapsed);
			element.classList.toggle('project-board-card-collapsed', collapsed);
			disclosure.icon = collapsed ? Codicon.chevronRight : Codicon.chevronDown;
			disclosure.element.setAttribute('aria-expanded', String(!collapsed));
			disclosure.element.setAttribute('aria-label', collapsed
				? localize('projectBoard.expandCardDetails', "Expand details for {0}", card.title)
				: localize('projectBoard.collapseCardDetails', "Collapse details for {0}", card.title));
			element.setAttribute('aria-describedby', [
				...summaryDescriptions, ...(collapsed ? [] : descriptions),
				...(element.classList.contains('project-board-card-active-chat') ? [activeChatLabel.id] : []),
			].join(' '));
		};
		store.add(this.hoverService.setupDelayedHover(disclosure.element, () => ({ content: disclosure.element.getAttribute('aria-label')! })));
		store.add(disclosure.onDidClick(event => {
			event.preventDefault();
			event.stopPropagation();
			if (!this.collapsedCards.delete(card.id)) {
				this.collapsedCards.add(card.id);
			}
			updateDetails();
			this.scrollable?.scanDomNode();
			this._onDidChangeContentSize.fire();
		}));

		if (card.workspace) {
			const workspace = document.createElement('div');
			workspace.className = 'project-board-card-workspace';
			workspace.textContent = card.workspace;
			describe(workspace);
			store.add(this.hoverService.setupDelayedHover(workspace, { content: card.workspace }));
			details.appendChild(workspace);
		}
		if (card.archived || card.readOnly) {
			const lifecycle = document.createElement('div');
			lifecycle.className = 'project-board-card-lifecycle';
			lifecycle.textContent = card.archived ? localize('projectBoard.archived', "Archived") : localize('projectBoard.readOnly', "Read-only");
			element.appendChild(lifecycle);
		}

		const petState = this.getStatusPetState(card.status, card.isRead);
		element.appendChild(this.createStatus(document, this.getStatusLabel(card), this.getStatusGlyph(card.status, card.isRead), card.status === SessionStatus.InProgress, { state: petState, store }));
		element.appendChild(details);
		const display = this.boardState.configuration.get().display;
		const metadata = this.metadataStates.get(card.id);
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
		if (display?.showCredits && metadata) {
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
			details.appendChild(description);
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
				details.appendChild(row);
			}
		}
		if (!metadata || metadata.kind === 'loading') {
			const button = this.createControl(details, metadata
				? localize('projectBoard.refreshing', "Refreshing…")
				: localize('projectBoard.pendingRefresh', "Pending refresh"), `refresh:${card.id}`, store);
			button.element.classList.add('project-board-card-refresh');
			button.element.setAttribute('aria-busy', String(!!metadata));
			button.enabled = !metadata && !card.connection && !!this.sessionsProvidersService.getProvider(card.session.providerId);
			store.add(this.hoverService.setupDelayedHover(button.element, { content: localize('projectBoard.refreshHelp', "Load this chat's existing history for card details without opening it, marking it read, or sending a prompt.") }));
			store.add(button.onDidClick(event => {
				event.preventDefault();
				event.stopPropagation();
				this.refreshMetadata(card.id);
			}));
		}
		const prompt = document.createElement('div');
		prompt.className = 'project-board-card-prompt';
		prompt.textContent = metadata?.kind === 'ready' && metadata.prompt !== undefined
			? metadata.prompt
			: metadata?.kind === 'ready'
				? localize('projectBoard.noPromptText', "No prompt text")
				: metadata?.kind === 'loading'
					? localize('projectBoard.loadingPrompt', "Loading last prompt…")
					: localize('projectBoard.promptUnavailable', "Prompt unavailable");
		if (display?.showLastPrompt !== false && metadata && metadata.kind !== 'loading') {
			describe(prompt);
			store.add(this.hoverService.setupDelayedHover(prompt, { content: prompt.textContent }));
			details.appendChild(prompt);
		}
		const time = this.promptTimes.get(card.id);
		const recency = document.createElement('div');
		recency.className = 'project-board-card-recency';
		recency.hidden = !metadata && time === undefined;
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
			details.appendChild(capability);
		}
		if (visible && (card.sharedContext.length || card.pullRequests.length || (metadata?.kind === 'ready' && metadata.context.length))) {
			let pills = this.contextPills.get(card.id);
			if (!pills) {
				pills = this.instantiationService.createInstance(ProjectBoardContextPills, this.container.ownerDocument, (uri, external) => this.openContext(uri, external));
				this.contextPills.set(card.id, pills);
			}
			pills.update(card, metadata);
			details.appendChild(pills.element);
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
				details.appendChild(previewElement);
			}
		}
		if (actionWidget) {
			details.appendChild(actionWidget.element);
		} else if (this.actionErrors.has(card.id)) {
			const warning = document.createElement('p');
			warning.className = 'project-board-card-warning';
			warning.textContent = localize('projectBoard.chatActionsUnavailable', "Pending actions could not be displayed. Open the chat to continue.");
			details.appendChild(warning);
		}
		const statusBar = document.createElement('footer');
		statusBar.className = 'project-board-card-status-bar';
		statusBar.appendChild(recency);
		if (metrics.childElementCount) {
			statusBar.appendChild(metrics);
		}
		details.appendChild(statusBar);
		updateDetails();

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
		element.setAttribute('role', 'group');

		return element;
	}

	private createCardActionButton(document: Document, card: HTMLElement, label: string, icon: ThemeIcon, run: () => Promise<void>, store: DisposableStore): Button {
		const actions = document.createElement('div');
		actions.className = 'project-board-card-actions';
		const button = store.add(new Button(actions, {
			...defaultButtonStyles,
			ariaLabel: label,
			title: label,
			secondary: true,
		}));
		button.icon = icon;
		store.add(button.onDidClick(event => {
			event.preventDefault();
			event.stopPropagation();
			void run();
		}));
		card.appendChild(actions);
		return button;
	}

	private async openContext(uri: URI, openExternal: boolean): Promise<void> {
		try {
			if (!await this.openerService.open(uri, { fromUserGesture: true, allowCommands: false, ...(openExternal ? { openExternal: true } : {}) })) {
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
			element.setAttribute('aria-description', localize('projectBoard.selectableCardInstructions', "{0} Click to select only this chat, {1}+click to toggle selection, Shift+click to select a range, or {1}+Shift+Enter to toggle the focused card. Mark as Done in the toolbar or context menu archives selected sessions, including their other chats.", element.getAttribute('aria-description'), isMacintosh ? 'Command' : 'Ctrl'));
		}
		if (move) {
			element.setAttribute('aria-keyshortcuts', [
				isMacintosh ? 'Meta+Shift+M' : 'Control+Shift+M',
				...(rename ? ['F2'] : []),
				...(card && this.canMarkDone(card) ? [isMacintosh ? 'Meta+Shift+Enter' : 'Control+Shift+Enter'] : []),
			].join(' '));
		}
		if (card) {
			store.add(addDisposableListener(element, EventType.CLICK, event => {
				if (event.button !== 0 || event.altKey || (isMacintosh ? event.ctrlKey : event.metaKey) || this.isCardControlEvent(element, event)) {
					return;
				}
				this.selectCard(card, isMacintosh ? event.metaKey : event.ctrlKey, event.shiftKey);
			}));
		}
		store.add(addDisposableListener(element, EventType.DBLCLICK, event => {
			if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || this.isCardControlEvent(element, event)) {
				return;
			}
			void open();
		}));
		store.add(addStandardDisposableListener(element, EventType.KEY_DOWN, event => {
			if (event.target !== element || event.browserEvent.repeat) {
				return;
			}
			if (card && this.canMarkDone(card) && event.equals(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Enter)) {
				event.preventDefault();
				event.stopPropagation();
				this.selectCard(card, true);
			} else if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
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
		const provider = card && this.sessionsProvidersService.getProvider(card.session.providerId);
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
				...(card && provider && isAgentHostProvider(provider) ? [toAction({
					id: COPY_AGENT_HOST_CHAT_LINK_COMMAND_ID,
					label: localize('projectBoard.copyChatLink', "Copy Chat Link"),
					run: async () => {
						try {
							await this.commandService.executeCommand(COPY_AGENT_HOST_CHAT_LINK_COMMAND_ID, { session: card.session, chat: card.chat });
						} catch (error) {
							this.logService.error('[ProjectBoard] Failed to copy chat link', error);
							this.notificationService.error(localize('projectBoard.copyChatLinkFailed', "The chat link could not be copied."));
						}
					},
				})] : []),
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

	private createStatus(document: Document, label: string, glyph: string, running: boolean, pet?: { state: ChatPetState; store: DisposableStore }): HTMLElement {
		const status = document.createElement('div');
		status.className = 'project-board-card-status';
		const icon = this.createStatusIcon(document, glyph, running, pet);
		icon.classList.add('project-board-card-status-icon');
		const text = document.createElement('span');
		text.className = 'project-board-card-status-label';
		text.textContent = label;
		status.append(icon, text);
		return status;
	}

	private createStatusIcon(document: Document, glyph: string, running: boolean, pet?: { state: ChatPetState; store: DisposableStore }, size = 24): HTMLElement {
		const icon = document.createElement('span');
		icon.className = 'project-board-status-icon';
		icon.classList.toggle('project-board-card-status-running', running);
		icon.setAttribute('aria-hidden', 'true');
		icon.textContent = glyph;
		if (pet) {
			const sources = getChatPetSpriteSources(this.chatPetService.variant.get())[pet.state];
			const source = running ? sources.animated : sources.reducedMotion;
			const frameWidth = source.frameWidth * size / (source.frameHeight ?? 96);
			icon.dataset.petState = pet.state;
			icon.style.setProperty('--project-board-pet-size', `${size}px`);
			icon.style.setProperty('--project-board-pet-width', `${frameWidth}px`);
			icon.style.setProperty('--project-board-pet-static', `url("${sources.reducedMotion.url}")`);
			icon.style.setProperty('--project-board-pet-image', `url("${source.url}")`);
			const duration = source.frameDurations.reduce((total, frame) => total + frame, 0);
			if (source.frameDurations.length > 1) {
				let elapsed = 0;
				const stops = source.frameDurations.flatMap((frame, index, frames) => {
					const position = index / (frames.length - 1);
					const start = elapsed / duration * 100;
					elapsed += frame;
					return [`${position} ${start}%`, `${position} ${elapsed / duration * 100}%`];
				});
				icon.style.setProperty('--project-board-pet-duration', `${duration}ms`);
				icon.style.setProperty('--project-board-pet-timing', `linear(${stops.join(', ')})`);
				icon.style.setProperty('--project-board-pet-last-frame', `${-frameWidth * (source.frameDurations.length - 1)}px`);
			}
			const assets = running ? [source, sources.reducedMotion] : [source];
			const images = assets.map(asset => this.getPetSpriteImage(asset.url, asset.frameWidth * Math.max(1, asset.frameDurations.length), asset.frameHeight ?? 96));
			const accessory = pet.state === 'typing' ? getChatPetAccessory(ChatPetAccessoryIds.ConstructionHardHat) : undefined;
			const accessorySource = accessory && getChatPetAccessoryImageSource(accessory);
			const accessoryImage = accessorySource && this.getPetSpriteImage(accessorySource.url, accessorySource.width, accessorySource.height);
			if (accessoryImage) {
				images.push(accessoryImage);
			}
			const showPet = () => {
				if (images.every(image => image.valid)) {
					if (accessory && accessoryImage) {
						const animated = this.getWorkingPetSprite(source, images[0].image, accessoryImage.image, !!accessory.coversAntennae);
						const reduced = this.getWorkingPetSprite(sources.reducedMotion, images[running ? 1 : 0].image, accessoryImage.image, !!accessory.coversAntennae);
						if (!animated || !reduced) {
							return;
						}
						icon.dataset.petAccessory = accessory.id;
						icon.style.setProperty('--project-board-pet-image', `url("${animated}")`);
						icon.style.setProperty('--project-board-pet-static', `url("${reduced}")`);
					}
					if (duration > 0) {
						// Rebuilt cards must rejoin the typing cycle instead of restarting at frame zero.
						icon.style.setProperty('--project-board-pet-delay', `${-(getWindow(this.container).performance.now() % duration)}ms`);
					}
					icon.classList.add('project-board-card-status-pet');
				}
			};
			for (const image of images) {
				if (!image.valid) {
					pet.store.add(addDisposableListener(image.image, EventType.LOAD, showPet));
				}
			}
			showPet();
		}
		return icon;
	}

	private getWorkingPetSprite(source: ReturnType<typeof getChatPetSpriteSources>['typing']['animated'], body: HTMLImageElement, hat: HTMLImageElement, coversAntennae: boolean): string | undefined {
		if (this.workingPetSprites.has(source.url)) {
			return this.workingPetSprites.get(source.url);
		}
		let result: string | undefined;
		try {
			const frames = Math.max(1, source.frameDurations.length);
			const height = source.frameHeight ?? 96;
			const canvas = mainWindow.document.createElement('canvas');
			canvas.width = source.frameWidth * frames;
			canvas.height = height;
			const context = canvas.getContext('2d');
			if (!context) {
				throw new Error('Canvas rendering is unavailable');
			}
			for (let frame = 0; frame < frames; frame++) {
				context.save();
				context.translate(frame * source.frameWidth, 0);
				context.beginPath();
				context.rect(0, 0, source.frameWidth, height);
				context.clip();
				drawChatPetComposite(context, body, hat, frame, source.accessoryRigFrame ?? frame, source.frameWidth, height, 'right', 'typing', source.fixedOrientationDecorations, false, true, coversAntennae);
				context.restore();
			}
			result = canvas.toDataURL();
		} catch (error) {
			this.logService.error('[Agents Hub] Could not compose working pet sprite', error);
		}
		this.workingPetSprites.set(source.url, result);
		return result;
	}

	private getPetSpriteImage(url: string, width: number, height: number): { image: HTMLImageElement; valid: boolean } {
		const cached = this.petSpriteImages.get(url);
		if (cached) {
			return cached;
		}
		const image = mainWindow.document.createElement('img');
		image.crossOrigin = 'anonymous';
		const result = { image, valid: false };
		this.petSpriteImages.set(url, result);
		const store = new DisposableStore();
		this.petSpriteLoads.set(url, store);
		store.add(addDisposableListener(image, EventType.LOAD, () => {
			result.valid = image.naturalWidth === width && image.naturalHeight === height;
			if (!result.valid) {
				this.logService.error('[Agents Hub] Invalid pet status sprite dimensions', url);
			}
			this.petSpriteLoads.deleteAndDispose(url);
		}));
		store.add(addDisposableListener(image, EventType.ERROR, () => {
			this.logService.error('[Agents Hub] Could not load pet status sprite', url);
			this.petSpriteLoads.deleteAndDispose(url);
		}));
		image.src = url;
		return result;
	}

	private getStatusPetState(status: SessionStatus, isRead = true): ChatPetState {
		switch (status) {
			case SessionStatus.InProgress: return 'typing';
			case SessionStatus.NeedsInput: return 'worry';
			case SessionStatus.Error: return 'speechless';
			case SessionStatus.Untitled: return 'rendering';
			default: return isRead ? 'sleep' : 'waking';
		}
	}

	private getStatusGlyph(status: SessionStatus, isRead = true): string {
		switch (status) {
			case SessionStatus.InProgress:
				return '\u2699\uFE0F';
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
				return card.isRead ? 'idle' : 'unread';
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
					? localize('projectBoard.idleRead', "Idle, read")
					: localize('projectBoard.idleUnread', "Idle, unread");
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

	createView(container: HTMLElement, headerContainer?: HTMLElement): IProjectBoardView {
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
				? localize('projectBoard.noBoards', "Create a board to organize your chats.")
				: localize('projectBoard.unreadableHub', "Agents Hub configuration could not be loaded. Your saved data has been preserved.");
			create.enabled = this.catalog.canEdit;
			reset.element.hidden = this.catalog.canEdit;
			if (!record) {
				headerContainer?.replaceChildren();
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
				if (headerContainer) {
					entry.view.attachHeader(headerContainer);
				}
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
				detail: localize('projectBoard.deleteBoardDetail', "Only this board's layout and settings will be deleted. Chats and running agents will not be deleted or stopped."),
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
				detail: localize('projectBoard.resetHubDetail', "This replaces the saved board collection with one Default board. Chats are not deleted."),
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
		const view = (this.focusedView?.window === getActiveWindow() && this.focusedView.isAlive() ? this.focusedView.view : undefined)
			?? this.customView ?? this.focusedView?.view;
		if (view) {
			this.focusedView = this.viewOrigins.get(view);
			await view.createSession();
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
