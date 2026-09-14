/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, addStandardDisposableListener, clearNode, EventType, isHTMLElement } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { toAction } from '../../../../base/common/actions.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { Disposable, DisposableMap, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IReader } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { ChatQuestionContent } from '../../../../workbench/contrib/chat/browser/widget/chatContentParts/chatQuestionContent.js';
import { CHAT_CARD_LARGE_CLASS } from '../../../../workbench/contrib/chat/browser/widget/chatCard.js';
import { IAuxiliaryWindow, IAuxiliaryWindowService } from '../../../../workbench/services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { IHostService } from '../../../../workbench/services/host/browser/host.js';
import { IChat, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { IProjectBoardCard, IProjectBoardPlacement, ProjectBoardModel, projectBoardColumns, projectBoardRows } from '../common/projectBoardModel.js';
import { IProjectBoardDraft, ProjectBoardChatWindows } from './projectBoardNavigation.js';
import { ProjectBoardQuestionPreview, ProjectBoardQuestionPreviewState } from './projectBoardQuestions.js';
import './media/projectBoard.css';

const projectBoardDragDataType = 'application/vnd.code.project-board-card';
const maxQuestionPreviews = 8;

export const IProjectBoardService = createDecorator<IProjectBoardService>('projectBoardService');

export interface IProjectBoardService {
	readonly _serviceBrand: undefined;
	open(): Promise<void>;
}

class ProjectBoardView extends Disposable {

	private readonly model = new ProjectBoardModel();
	private readonly cardElements = new Map<string, HTMLElement>();
	private readonly renderDisposables = this._register(new MutableDisposable<DisposableStore>());
	private readonly sessionObserver = this._register(new MutableDisposable());
	private creatingSession = false;
	private createSessionButton: Button | undefined;
	private drafts: readonly IProjectBoardDraft[] = [];
	private readonly questionPreviews = this._register(new DisposableMap<string, ProjectBoardQuestionPreview>());
	private readonly questionChats = new Map<string, IChat>();
	private readonly previewStates = new Map<string, ProjectBoardQuestionPreviewState>();
	private readonly notifiedPreviewErrors = new Map<string, string>();

	constructor(
		private readonly container: HTMLElement,
		private readonly sessionsManagementService: ISessionsManagementService,
		private readonly chatWindows: ProjectBoardChatWindows,
		private readonly notificationService: INotificationService,
		private readonly logService: ILogService,
		private readonly contextMenuService: IContextMenuService,
		private readonly instantiationService: IInstantiationService,
	) {
		super();
		this._register(this.sessionsManagementService.onDidChangeSessions(() => this.observeSessions()));
		this.observeSessions();
	}

	private observeSessions(): void {
		this.sessionObserver.value = autorun(reader => {
			this.drafts = this.chatWindows.drafts.read(reader);
			this.model.updateSessions(this.sessionsManagementService.getSessions(), reader);
			this.updateQuestionPreviews(reader);
			this.render();
		});
	}

	private updateQuestionPreviews(reader: IReader): void {
		const observed = new Set(this.model.cards.filter(card => card.status === SessionStatus.NeedsInput).slice(0, maxQuestionPreviews).map(card => card.id));
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

	private render(): void {
		const ownerDocument = this.container.ownerDocument;
		// A background document retains activeElement but must not reclaim window focus.
		const activeElement = ownerDocument.hasFocus() ? ownerDocument.activeElement : null;
		const focusedCreate = activeElement === this.createSessionButton?.element;
		const focusedCard = [...this.cardElements].find(([, element]) => activeElement && element.contains(activeElement));
		const store = new DisposableStore();
		this.renderDisposables.value = store;
		this.cardElements.clear();
		clearNode(this.container);

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
		const createButton = store.add(new Button(header, { ...defaultButtonStyles }));
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

		const unassigned = this.createCardGroup(
			document,
			localize('projectBoard.unassigned', "Unassigned"),
			this.model.getUnassignedCards(),
			undefined,
			store,
		);
		unassigned.classList.add('project-board-unassigned');
		board.appendChild(unassigned);

		const grid = document.createElement('section');
		grid.className = 'project-board-grid';
		grid.setAttribute('aria-label', localize('projectBoard.grid', "Project board"));

		const corner = document.createElement('div');
		corner.className = 'project-board-axis-corner';
		grid.appendChild(corner);
		for (const column of projectBoardColumns) {
			const heading = document.createElement('h2');
			heading.className = 'project-board-column-heading';
			heading.textContent = column.label;
			grid.appendChild(heading);
		}

		for (const row of projectBoardRows) {
			const rowHeading = document.createElement('h2');
			rowHeading.className = 'project-board-row-heading';
			rowHeading.textContent = row.label;
			grid.appendChild(rowHeading);
			for (const column of projectBoardColumns) {
				grid.appendChild(this.createCardGroup(
					document,
					localize('projectBoard.cell', "{0}, {1}", row.label, column.label),
					this.model.getCards(row.id, column.id),
					{ rowId: row.id, columnId: column.id },
					store,
				));
			}
		}

		board.appendChild(grid);
		this.container.appendChild(board);
		if (ownerDocument.hasFocus()) {
			if (focusedCard) {
				this.cardElements.get(focusedCard[0])?.focus({ preventScroll: true });
			} else if (focusedCreate) {
				this.createSessionButton?.element.focus({ preventScroll: true });
			}
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

		const list = document.createElement('div');
		list.className = 'project-board-card-list';
		if (!placement) {
			for (const draft of this.drafts) {
				list.appendChild(this.createDraftCard(document, draft, store));
			}
		}
		for (const card of cards) {
			list.appendChild(this.createCard(document, card, store));
		}
		if (cards.length === 0 && (placement || this.drafts.length === 0)) {
			const empty = document.createElement('span');
			empty.className = 'project-board-empty';
			empty.textContent = localize('projectBoard.empty', "Drop a chat here");
			list.appendChild(empty);
		}
		group.appendChild(list);

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
		element.className = `project-board-card project-board-card-${this.getStatusClass(card)}`;
		element.draggable = true;
		element.setAttribute('aria-label', localize('projectBoard.cardLabel', "{0}, {1}, {2}", card.title, card.sessionTitle, this.getStatusLabel(card)));

		const title = document.createElement('h4');
		title.textContent = card.title;
		element.appendChild(title);

		const session = document.createElement('div');
		session.className = 'project-board-card-session';
		session.textContent = localize('projectBoard.session', "Session: {0}", card.sessionTitle);
		element.appendChild(session);

		element.appendChild(this.createStatus(document, this.getStatusLabel(card), this.getStatusGlyph(card), card.status === SessionStatus.InProgress));

		if (card.description) {
			const description = document.createElement('div');
			description.className = 'project-board-card-description';
			description.textContent = card.description;
			element.appendChild(description);
		}

		this.cardElements.set(card.id, element);
		const preview = this.previewStates.get(card.id);
		if (preview && preview.kind !== 'inactive') {
			const previewElement = this.createQuestionPreview(document, preview, store);
			previewElement.id = `project-board-input-${generateUuid()}`;
			element.setAttribute('aria-describedby', previewElement.id);
			element.appendChild(previewElement);
		}

		store.add(addDisposableListener(element, EventType.DRAG_START, event => {
			event.dataTransfer?.setData(projectBoardDragDataType, card.id);
			if (event.dataTransfer) {
				event.dataTransfer.effectAllowed = 'move';
			}
		}));
		this.registerCardInteractions(element, () => this.openCard(card), store, () => this.showMoveMenu(card, element));

		return element;
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
			if (event.composedPath().some(target => target !== element && isHTMLElement(target) && target.matches('a, button, input, select, textarea, [role="button"]'))) {
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
		this.contextMenuService.showContextMenu({
			getAnchor: () => element,
			getActions: () => [
				toAction({
					id: 'projectBoard.move.unassigned',
					label: localize('projectBoard.moveUnassigned', "Move to Unassigned"),
					checked: !placement,
					run: () => this.moveCard(card.id, undefined),
				}),
				...projectBoardRows.flatMap(row => projectBoardColumns.map(column => toAction({
					id: `projectBoard.move.${row.id}.${column.id}`,
					label: localize('projectBoard.moveToCell', "Move to {0}, {1}", row.label, column.label),
					checked: placement?.rowId === row.id && placement.columnId === column.id,
					run: () => this.moveCard(card.id, { rowId: row.id, columnId: column.id }),
				}))),
			],
			onHide: () => {
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
			this.model.moveCard(cardId, placement);
			this.render();
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
			store.add(new ProjectBoardView(boardWindow.container, this.sessionsManagementService, this.chatWindows, this.notificationService, this.logService, this.contextMenuService, this.instantiationService));
		} catch (error) {
			this.boardWindow = undefined;
			this.boardDisposables.clear();
			this.logService.error('[ProjectBoard] Failed to open window', error);
			this.notificationService.error(localize('projectBoard.openWindowFailed', "The Agent Project Board could not be opened."));
		}
	}
}

registerSingleton(IProjectBoardService, ProjectBoardService, InstantiationType.Delayed);
