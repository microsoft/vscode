/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, addStandardDisposableListener, EventType, isHTMLElement } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { toAction } from '../../../../base/common/actions.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { URI } from '../../../../base/common/uri.js';
import { Disposable, DisposableMap, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IReader, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { ChatQuestionContent } from '../../../../workbench/contrib/chat/browser/widget/chatContentParts/chatQuestionContent.js';
import { CHAT_CARD_LARGE_CLASS } from '../../../../workbench/contrib/chat/browser/widget/chatCard.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionsService } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IAuxiliaryWindow, IAuxiliaryWindowService } from '../../../../workbench/services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { IHostService } from '../../../../workbench/services/host/browser/host.js';
import { IChat, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { IProjectBoardAxis, IProjectBoardCard, IProjectBoardPlacement, ProjectBoardModel } from '../common/projectBoardModel.js';
import { ProjectBoardState } from './projectBoardState.js';
import { IProjectBoardDraft, ProjectBoardChatWindows } from './projectBoardNavigation.js';
import { ProjectBoardQuestionPreview, ProjectBoardQuestionPreviewState } from './projectBoardQuestions.js';
import { getProjectBoardSubmittedAt, IProjectBoardMetadata, ProjectBoardMetadata } from './projectBoardMetadata.js';
import './media/projectBoard.css';

const projectBoardDragDataType = 'application/vnd.code.project-board-card';
const maxQuestionPreviews = 8;
const maxMetadataPreviews = 16;

export const IProjectBoardService = createDecorator<IProjectBoardService>('projectBoardService');

export interface IProjectBoardService {
	readonly _serviceBrand: undefined;
	open(): Promise<void>;
}

class ProjectBoardView extends Disposable {

	private readonly model = new ProjectBoardModel();
	private readonly cardElements = new Map<string, HTMLElement>();
	private readonly controlElements = new Map<string, HTMLElement>();
	private readonly renderDisposables = this._register(new MutableDisposable<DisposableStore>());
	private readonly sessionObserver = this._register(new MutableDisposable());
	private creatingSession = false;
	private createSessionButton: Button | undefined;
	private drafts: readonly IProjectBoardDraft[] = [];
	private readonly questionPreviews = this._register(new DisposableMap<string, ProjectBoardQuestionPreview>());
	private readonly questionChats = new Map<string, IChat>();
	private readonly previewStates = new Map<string, ProjectBoardQuestionPreviewState>();
	private readonly notifiedPreviewErrors = new Map<string, string>();
	private readonly metadataPreviews = this._register(new DisposableMap<string, ProjectBoardMetadata>());
	private readonly metadataChats = new Map<string, IChat>();
	private readonly metadataStates = new Map<string, IProjectBoardMetadata>();
	private readonly notifiedMetadataErrors = new Map<string, string>();
	private readonly promptTimes = new Map<string, number>();
	private showArchived = false;
	private readonly visibleCounts = new Map<string, number>();
	private dragging = false;
	private rendering = false;
	private menuOpen = false;
	private menuGeneration = 0;
	private boardElement: HTMLElement | undefined;
	private readonly sessionsManagementService: ISessionsManagementService;
	private readonly notificationService: INotificationService;
	private readonly logService: ILogService;
	private readonly contextMenuService: IContextMenuService;
	private readonly instantiationService: IInstantiationService;

	constructor(
		private readonly container: HTMLElement,
		private readonly chatWindows: ProjectBoardChatWindows,
		private readonly boardState: ProjectBoardState,
		services: {
			sessionsManagementService: ISessionsManagementService;
			notificationService: INotificationService;
			logService: ILogService;
			contextMenuService: IContextMenuService;
			instantiationService: IInstantiationService;
		},
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IDialogService private readonly dialogService: IDialogService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IHoverService private readonly hoverService: IHoverService,
		@IChatService private readonly chatService: IChatService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
	) {
		super();
		this.sessionsManagementService = services.sessionsManagementService;
		this.notificationService = services.notificationService;
		this.logService = services.logService;
		this.contextMenuService = services.contextMenuService;
		this.instantiationService = services.instantiationService;
		this._register(this.sessionsManagementService.onDidChangeSessions(() => this.observeSessions()));
		this._register(addDisposableListener(this.container, EventType.FOCUS_OUT, () => {
			if (!this.rendering && this.model.isSortingDeferred) {
				queueMicrotask(() => {
					if (!this._store.isDisposed && !this.dragging && !this.menuOpen && !this.hasFocusedCard()) {
						this.model.setSortingDeferred(false);
						this.render();
					}
				});
			}
		}));
		this.observeSessions();
	}

	private hasFocusedCard(): boolean {
		const ownerDocument = this.container.ownerDocument;
		return ownerDocument.hasFocus() && [...this.cardElements.values()].some(element => element.contains(ownerDocument.activeElement));
	}

	private observeSessions(): void {
		this.sessionObserver.value = autorun(reader => {
			this.model.setSortingDeferred(this.dragging || this.menuOpen || this.hasFocusedCard());
			this.drafts = this.chatWindows.drafts.read(reader);
			this.model.updateConfiguration(this.boardState.configuration.read(reader));
			this.model.updateSessions(this.sessionsManagementService.getSessions(), reader);
			this.updateMetadata(reader);
			this.updateQuestionPreviews(reader);
			this.render();
		});
	}

	private updateMetadata(reader: IReader): void {
		const loadedModels = new Map([...this.chatService.chatModels.read(reader)].map(model => [model.sessionResource.toString(), model]));
		for (const card of this.model.cards) {
			const resource = this.chatSessionsService.getMaterializedSessionResource(card.chat.resource) ?? card.chat.resource;
			const model = loadedModels.get(resource.toString());
			if (model) {
				model.lastRequestObs.read(reader);
				observableSignalFromEvent(this, model.onDidChange).read(reader);
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
			}
		}
		this.metadataStates.clear();
		for (const card of visible) {
			if (this.metadataChats.get(card.id) !== card.chat) {
				this.metadataPreviews.set(card.id, this.instantiationService.createInstance(ProjectBoardMetadata, card.chat));
				this.metadataChats.set(card.id, card.chat);
			}
			const metadata = this.metadataPreviews.get(card.id)!.metadata.read(reader);
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
				this.questionPreviews.set(card.id, this.instantiationService.createInstance(ProjectBoardQuestionPreview, card.chat));
				this.questionChats.set(card.id, card.chat);
			}
			const state = this.questionPreviews.get(card.id)!.preview.read(reader);
			this.previewStates.set(card.id, state);
			if (state.kind === 'error' && this.notifiedPreviewErrors.get(card.id) !== state.error) {
				this.notifiedPreviewErrors.set(card.id, state.error);
				this.notificationService.error(state.message);
			}
		}
	}

	private cellKey(placement: IProjectBoardPlacement): string {
		return JSON.stringify([placement.rowId, placement.columnId]);
	}

	private getDisplayedCards(): readonly IProjectBoardCard[] {
		return [
			...this.model.getUnassignedCards(this.showArchived),
			...this.model.rows.flatMap(row => this.model.columns.flatMap(column => {
				const placement = { rowId: row.id, columnId: column.id };
				return this.model.getCards(row.id, column.id, this.showArchived).slice(0, this.visibleCounts.get(this.cellKey(placement)) ?? 3);
			})),
		];
	}

	private render(): void {
		if (this.dragging || this.menuOpen) {
			return;
		}
		this.rendering = true;
		const ownerDocument = this.container.ownerDocument;
		// A background document retains activeElement but must not reclaim window focus.
		const activeElement = ownerDocument.hasFocus() ? ownerDocument.activeElement : null;
		const focusedCreate = activeElement === this.createSessionButton?.element;
		const focusedControl = activeElement?.getAttribute('data-board-control');
		const focusedCard = [...this.cardElements].find(([, element]) => activeElement && element.contains(activeElement));
		const store = new DisposableStore();
		this.renderDisposables.value = store;
		this.cardElements.clear();
		this.controlElements.clear();
		// Context-view hosts share the auxiliary container and must survive board rerenders.
		this.boardElement?.remove();

		const document = mainWindow.document;
		const board = document.createElement('main');
		board.className = 'project-board';

		const header = document.createElement('header');
		header.className = 'project-board-header';
		const heading = document.createElement('div');
		const title = document.createElement('h1');
		title.textContent = localize('projectBoard.title', "Agent project board");
		heading.appendChild(title);
		const description = document.createElement('p');
		description.textContent = localize('projectBoard.description', "Arrange live chats by area and priority. Double-click a card to open its chat.");
		heading.appendChild(description);
		header.appendChild(heading);
		const tools = document.createElement('div');
		tools.className = 'project-board-tools';
		for (const kind of ['row', 'column'] as const) {
			const add = this.createControl(tools, kind === 'row' ? localize('projectBoard.addRow', "Add Row") : localize('projectBoard.addColumn', "Add Column"), `add-${kind}`, store);
			store.add(add.onDidClick(() => { void this.editAxis(kind); }));
		}
		header.appendChild(tools);
		const archivedButton = store.add(new Button(tools, { ...defaultButtonStyles, secondary: true }));
		archivedButton.element.dataset.boardControl = 'show-archived';
		this.controlElements.set('show-archived', archivedButton.element);
		archivedButton.label = localize('projectBoard.showArchived', "Show Archived");
		archivedButton.element.setAttribute('aria-pressed', String(this.showArchived));
		store.add(archivedButton.onDidClick(() => {
			this.showArchived = !this.showArchived;
			this.observeSessions();
		}));
		const createButton = store.add(new Button(header, { ...defaultButtonStyles }));
		createButton.element.dataset.boardControl = 'new-session';
		this.controlElements.set('new-session', createButton.element);
		this.createSessionButton = createButton;
		createButton.label = localize('projectBoard.createSession', "New Session");
		createButton.enabled = !this.creatingSession;
		store.add(createButton.onDidClick(async () => {
			this.creatingSession = true;
			createButton.enabled = false;
			try {
				await this.chatWindows.createNewSession();
			} catch (error) {
				this.logService.error('[ProjectBoard] Failed to create session', error);
				this.notificationService.error(localize('projectBoard.createFailed', "The new session could not be opened."));
			} finally {
				this.creatingSession = false;
				if (this.createSessionButton) {
					this.createSessionButton.enabled = true;
				}
			}
		}));
		board.appendChild(header);
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
		grid.style.gridTemplateColumns = `minmax(90px, auto) repeat(${this.model.columns.length}, minmax(180px, 1fr))`;
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
		this.container.appendChild(board);
		this.boardElement = board;
		this.rendering = false;
		if (ownerDocument.hasFocus()) {
			if (focusedControl) {
				const fallback = focusedControl.startsWith('more:') ? focusedControl.replace('more:', 'less:') : focusedControl.replace('less:', 'more:');
				(this.controlElements.get(focusedControl) ?? this.controlElements.get(fallback))?.focus({ preventScroll: true });
			} else if (focusedCard) {
				this.cardElements.get(focusedCard[0])?.focus({ preventScroll: true });
			} else if (focusedCreate) {
				this.createSessionButton?.element.focus({ preventScroll: true });
			}
		}
	}

	private createControl(container: HTMLElement, label: string, key: string, store: DisposableStore): Button {
		const button = store.add(new Button(container, { ...defaultButtonStyles, secondary: true }));
		button.label = label;
		button.element.dataset.boardControl = key;
		if (key.startsWith('axis:') || key.startsWith('add-') || key.startsWith('remove:')) {
			button.enabled = this.boardState.canEdit;
		}
		this.controlElements.set(key, button.element);
		return button;
	}

	private renderAxis(container: HTMLElement, axis: IProjectBoardAxis, kind: 'row' | 'column', store: DisposableStore): void {
		const button = this.createControl(container, axis.label, `axis:${kind}:${axis.id}`, store);
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

	private async editAxis(kind: 'row' | 'column', axis?: IProjectBoardAxis): Promise<void> {
		const label = await this.quickInputService.input({
			title: axis ? localize('projectBoard.renameAxis', "Rename Board Axis") : kind === 'row' ? localize('projectBoard.addRow', "Add Row") : localize('projectBoard.addColumn', "Add Column"),
			value: axis?.label,
			ignoreFocusLost: true,
			prompt: localize('projectBoard.axisLabel', "Enter a nonempty label."),
			validateInput: async value => value.trim() ? undefined : localize('projectBoard.emptyAxis', "The label must not be empty."),
		});
		if (label === undefined) {
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

	private refreshAfterMenu(): void {
		queueMicrotask(() => {
			if (!this._store.isDisposed && !this.menuOpen) {
				this.observeSessions();
			}
		});
	}

	private async resetBoard(): Promise<void> {
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
		group.setAttribute('aria-label', label);
		group.tabIndex = 0;

		const heading = document.createElement('h3');
		heading.textContent = label;
		group.appendChild(heading);
		const needsInput = cards.filter(card => card.status === SessionStatus.NeedsInput).length;
		if (needsInput) {
			const attention = document.createElement('span');
			attention.className = 'project-board-attention';
			attention.textContent = localize('projectBoard.attention', "{0} Needs Input", needsInput);
			group.appendChild(attention);
		}

		const list = document.createElement('div');
		list.className = 'project-board-card-list';
		const missing = placement ? this.boardState.configuration.get().placements.filter(item => item.rowId === placement.rowId && item.columnId === placement.columnId && !this.model.hasChat(item.cardId)) : [];
		const totalCount = cards.length + missing.length;
		if (!placement) {
			for (const draft of this.drafts) {
				list.appendChild(this.createDraftCard(document, draft, store));
			}
		}
		const limit = placement ? this.visibleCounts.get(this.cellKey(placement)) ?? 3 : cards.length;
		for (const card of cards.slice(0, limit)) {
			list.appendChild(this.createCard(document, card, store));
		}
		const unknownHidden = cards.slice(limit).filter(card => !this.promptTimes.has(card.id)).length;
		if (unknownHidden) {
			const recency = document.createElement('p');
			recency.className = 'project-board-recency-warning';
			recency.textContent = localize('projectBoard.hiddenRecency', "Recency unavailable for {0} hidden chats. Expand to load their metadata.", unknownHidden);
			group.appendChild(recency);
		}
		for (const placement of missing.slice(0, Math.max(0, limit - cards.length))) {
			const unavailable = document.createElement('article');
			unavailable.className = 'project-board-card project-board-card-unavailable';
			const title = document.createElement('h4');
			title.textContent = localize('projectBoard.unavailableChat', "Unavailable Chat");
			const message = document.createElement('p');
			message.textContent = localize('projectBoard.retainedPlacement', "The chat is not currently available. Its placement is retained.");
			unavailable.append(title, message);
			const remove = this.createControl(unavailable, localize('projectBoard.removePlacement', "Remove Placement"), `remove:${placement.cardId}`, store);
			store.add(remove.onDidClick(() => this.changeBoard(() => this.boardState.moveCard(placement.cardId, undefined))));
			list.appendChild(unavailable);
		}
		if (totalCount === 0 && (placement || this.drafts.length === 0)) {
			const empty = document.createElement('span');
			empty.className = 'project-board-empty';
			empty.textContent = localize('projectBoard.empty', "Drop a chat here");
			list.appendChild(empty);
		}
		group.appendChild(list);
		if (placement && totalCount > 3) {
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

		store.add(addDisposableListener(group, EventType.DRAG_OVER, event => {
			if (event.dataTransfer?.types.includes(projectBoardDragDataType)) {
				event.preventDefault();
				event.dataTransfer.dropEffect = 'move';
			}
		}));
		store.add(addDisposableListener(group, EventType.DROP, event => {
			const cardId = event.dataTransfer?.getData(projectBoardDragDataType);
			if (!cardId) {
				return;
			}
			event.preventDefault();
			this.dragging = false;
			this.model.setSortingDeferred(false);
			this.moveCard(cardId, placement);
		}));

		return group;
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
			} catch (error) {
				this.logService.error('[ProjectBoard] Failed to open draft', error);
				this.notificationService.error(localize('projectBoard.openDraftFailed', "The session draft could not be opened."));
			}
		};
		this.cardElements.set(`draft:${draft.id}`, element);
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
		element.draggable = this.boardState.canEdit;
		element.setAttribute('aria-label', localize('projectBoard.cardLabel', "{0}, {1}, {2}", card.title, card.sessionTitle, this.getStatusLabel(card)));

		const title = document.createElement('h4');
		title.textContent = card.title;
		store.add(this.hoverService.setupDelayedHover(title, { content: card.title }));
		element.appendChild(title);

		const session = document.createElement('div');
		session.className = 'project-board-card-session';
		session.textContent = localize('projectBoard.session', "Session: {0}", card.sessionTitle);
		element.appendChild(session);
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

		element.appendChild(this.createStatus(document, this.getStatusLabel(card), this.getStatusGlyph(card), card.status === SessionStatus.InProgress));
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
		const metadata = this.metadataStates.get(card.id);
		const prompt = document.createElement('div');
		prompt.className = 'project-board-card-prompt';
		describe(prompt);
		prompt.textContent = metadata?.kind === 'ready' && metadata.prompt !== undefined
			? metadata.prompt
			: metadata?.kind === 'loading'
				? localize('projectBoard.loadingPrompt', "Loading last prompt…")
				: localize('projectBoard.promptUnavailable', "Prompt unavailable");
		store.add(this.hoverService.setupDelayedHover(prompt, { content: prompt.textContent }));
		element.appendChild(prompt);
		const time = this.promptTimes.get(card.id);
		const recency = document.createElement('div');
		recency.className = 'project-board-card-recency';
		describe(recency);
		recency.textContent = time === undefined
			? localize('projectBoard.recencyUnavailable', "Recency unavailable")
			: localize('projectBoard.lastPrompt', "Last prompt: {0}", new Date(time).toLocaleString());
		if (time !== undefined) {
			recency.dataset.submittedAt = String(time);
		}
		element.appendChild(recency);
		if (metadata && metadata.kind !== 'loading' && metadata.message) {
			const capability = document.createElement('div');
			capability.className = 'project-board-card-warning';
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
		const preview = this.previewStates.get(card.id);
		if (preview && preview.kind !== 'inactive') {
			const previewElement = this.createQuestionPreview(document, preview, store);
			previewElement.id = `project-board-input-${generateUuid()}`;
			descriptions.push(previewElement.id);
			element.appendChild(previewElement);
		}
		element.setAttribute('aria-describedby', descriptions.join(' '));

		store.add(addDisposableListener(element, EventType.DRAG_START, event => {
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
		this.registerCardInteractions(element, () => this.openCard(card), store, () => this.showMoveMenu(card, element));

		return element;
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

	private createQuestionPreview(document: Document, preview: ProjectBoardQuestionPreviewState, store: DisposableStore): HTMLElement {
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
			for (const question of preview.questions) {
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
			text(localize('projectBoard.respondInChat', "Open the chat to respond."));
		}
		return container;
	}

	private registerCardInteractions(element: HTMLElement, open: () => Promise<void>, store: DisposableStore, showMoveMenu?: () => void): void {
		element.tabIndex = 0;
		element.setAttribute('role', 'button');
		element.setAttribute('aria-description', showMoveMenu
			? localize('projectBoard.cardInstructions', "Double-click or press Enter or Space to open this chat. Drag to move, or use the context menu with Shift+F10.")
			: localize('projectBoard.draftInstructions', "Double-click or press Enter or Space to open this session draft."));
		store.add(addDisposableListener(element, EventType.DBLCLICK, event => {
			if (event.composedPath().some(target => target !== element && isHTMLElement(target) && target.matches('a, button, input, select, textarea, summary, [role="button"]'))) {
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
			} else if (showMoveMenu && (event.equals(KeyMod.Shift | KeyCode.F10) || event.equals(KeyCode.ContextMenu))) {
				event.preventDefault();
				event.stopPropagation();
				showMoveMenu();
			}
		}));
		if (showMoveMenu) {
			store.add(addDisposableListener(element, EventType.CONTEXT_MENU, event => {
				event.preventDefault();
				event.stopPropagation();
				element.focus();
				showMoveMenu();
			}));
		}
	}

	private showMoveMenu(card: IProjectBoardCard, element: HTMLElement): void {
		const placement = this.model.getPlacement(card.id);
		this.menuOpen = true;
		const generation = ++this.menuGeneration;
		this.contextMenuService.showContextMenu({
			domForShadowRoot: this.container,
			getAnchor: () => element,
			getActions: () => [
				toAction({
					id: 'projectBoard.move.unassigned',
					label: localize('projectBoard.moveUnassigned', "Move to Unassigned"),
					checked: !placement,
					enabled: this.boardState.canEdit,
					run: () => this.moveCard(card.id, undefined),
				}),
				...this.model.rows.flatMap(row => this.model.columns.map(column => toAction({
					id: `projectBoard.move.${row.id}.${column.id}`,
					label: localize('projectBoard.moveToCell', "Move to {0}, {1}", row.label, column.label),
					checked: placement?.rowId === row.id && placement.columnId === column.id,
					enabled: this.boardState.canEdit,
					run: () => this.moveCard(card.id, { rowId: row.id, columnId: column.id }),
				}))),
			],
			onHide: () => {
				if (generation !== this.menuGeneration) {
					return;
				}
				this.menuOpen = false;
				this.refreshAfterMenu();
				if (this.container.ownerDocument.hasFocus()) {
					this.cardElements.get(card.id)?.focus({ preventScroll: true });
				}
			},
		});
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

	private getStatusGlyph(card: IProjectBoardCard): string {
		switch (card.status) {
			case SessionStatus.InProgress:
				return '\u{1F3C3}';
			case SessionStatus.NeedsInput:
				return '\u{1F64B}';
			case SessionStatus.Error:
				return '\u26A0\uFE0F';
			default:
				return '\u{1F9CD}';
		}
	}

	private moveCard(cardId: string, placement: IProjectBoardPlacement | undefined): void {
		try {
			this.boardState.moveCard(cardId, placement);
		} catch (error) {
			this.logService.error('[ProjectBoard] Failed to move chat', error);
			this.notificationService.error(localize('projectBoard.moveFailed', "The chat could not be moved on the project board."));
		}
	}

	private async openCard(card: IProjectBoardCard): Promise<void> {
		try {
			await this.chatWindows.open(card);
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

	private getStatusLabel(card: IProjectBoardCard): string {
		switch (card.status) {
			case SessionStatus.InProgress:
				return localize('projectBoard.busy', "Busy");
			case SessionStatus.NeedsInput:
				return localize('projectBoard.needsInput', "Needs Input");
			case SessionStatus.Error:
				return localize('projectBoard.error', "Error");
			default:
				return card.isRead
					? localize('projectBoard.idleVisited', "Idle, visited")
					: localize('projectBoard.idleUnvisited', "Idle, unvisited");
		}
	}
}

export class ProjectBoardService extends Disposable implements IProjectBoardService {

	declare readonly _serviceBrand: undefined;

	private boardWindow: IAuxiliaryWindow | undefined;
	private opening: Promise<void> | undefined;
	private readonly boardDisposables = this._register(new MutableDisposable<DisposableStore>());
	private readonly chatWindows: ProjectBoardChatWindows;
	private readonly boardState: ProjectBoardState;

	constructor(
		@IAuxiliaryWindowService private readonly auxiliaryWindowService: IAuxiliaryWindowService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@INotificationService private readonly notificationService: INotificationService,
		@ILogService private readonly logService: ILogService,
		@IHostService private readonly hostService: IHostService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
	) {
		super();
		this.chatWindows = this._register(instantiationService.createInstance(ProjectBoardChatWindows));
		this.boardState = this._register(instantiationService.createInstance(ProjectBoardState));
		this._register(addDisposableListener(mainWindow, EventType.UNLOAD, () => this.dispose()));
	}

	async open(): Promise<void> {
		if (this.boardWindow) {
			await this.focusBoardWindow();
			return;
		}
		if (!this.opening) {
			this.opening = this.openWindow().finally(() => this.opening = undefined);
		}
		await this.opening;
		await this.focusBoardWindow();
	}

	private async focusBoardWindow(): Promise<void> {
		if (this.boardWindow) {
			await this.hostService.focus(this.boardWindow.window);
		}
	}

	private async openWindow(): Promise<void> {
		try {
			const boardWindow = await this.auxiliaryWindowService.open({ nativeTitlebar: true });
			if (this._store.isDisposed) {
				boardWindow.dispose();
				return;
			}
			this.boardWindow = boardWindow;
			const store = new DisposableStore();
			this.boardDisposables.value = store;
			store.add(boardWindow);
			store.add(boardWindow.onUnload(() => {
				this.boardWindow = undefined;
				queueMicrotask(() => {
					if (this.boardDisposables.value === store) {
						this.boardDisposables.clear();
					}
				});
			}));
			await boardWindow.whenStylesHaveLoaded;
			if (store.isDisposed) {
				return;
			}
			boardWindow.window.document.title = localize('projectBoard.windowTitle', "Agent Project Board");
			boardWindow.container.classList.add('project-board-window');
			store.add(this.instantiationService.createInstance(ProjectBoardView, boardWindow.container, this.chatWindows, this.boardState, {
				sessionsManagementService: this.sessionsManagementService, notificationService: this.notificationService,
				logService: this.logService, contextMenuService: this.contextMenuService, instantiationService: this.instantiationService,
			}));
		} catch (error) {
			this.boardWindow = undefined;
			this.boardDisposables.clear();
			this.logService.error('[ProjectBoard] Failed to open window', error);
			this.notificationService.error(localize('projectBoard.openWindowFailed', "The Agent Project Board could not be opened."));
		}
	}
}

registerSingleton(IProjectBoardService, ProjectBoardService, InstantiationType.Delayed);
