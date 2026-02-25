/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { DragAndDropObserver } from '../../../../../base/browser/dom.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ChatRequestQueueKind, IChatService } from '../../common/chatService/chatService.js';
import { IChatPendingRequest } from '../../common/model/chatModel.js';
import { IChatRequestViewModel, IChatViewModel } from '../../common/model/chatViewModel.js';

const PENDING_REQUEST_ID_ATTR = 'data-pending-request-id';
const PENDING_KIND_ATTR = 'data-pending-kind';
const DRAGGING_CLASS = 'chat-pending-dragging';

interface IDragState {
	readonly element: IChatRequestViewModel;
	readonly pendingKind: ChatRequestQueueKind;
}

/**
 * Manages drag-and-drop reordering for pending (steering/queued) chat messages.
 * Attaches drag handles to pending request rows and uses event delegation on
 * the list container to handle drop targets, keeping logic isolated from the
 * renderer itself.
 */
export class ChatPendingDragController extends Disposable {

	private _dragState: IDragState | undefined;
	private readonly _insertIndicator: HTMLElement;

	constructor(
		listContainer: HTMLElement,
		private readonly _getViewModel: () => IChatViewModel | undefined,
		@IChatService private readonly _chatService: IChatService,
	) {
		super();

		this._insertIndicator = dom.$('.chat-pending-insert-indicator');
		listContainer.append(this._insertIndicator);
		this._register(toDisposable(() => this._insertIndicator.remove()));

		this._register(new DragAndDropObserver(listContainer, {
			onDragOver: (e) => this._onDragOver(e),
			onDragLeave: () => this._hideIndicator(),
			onDragEnd: () => this._onDragEnd(),
			onDrop: (e) => this._onDrop(e),
		}));
	}

	/**
	 * Called by the renderer to wire up a drag handle for a pending request row.
	 */
	attachDragHandle(
		element: IChatRequestViewModel,
		handleEl: HTMLElement,
		rowContainer: HTMLElement,
		disposables: DisposableStore,
	): void {
		handleEl.setAttribute('draggable', 'true');

		disposables.add(dom.addDisposableListener(handleEl, dom.EventType.DRAG_START, (e: DragEvent) => {
			if (!e.dataTransfer || !element.pendingKind) {
				return;
			}

			this._dragState = { element, pendingKind: element.pendingKind };
			rowContainer.classList.add(DRAGGING_CLASS);

			// Use the row as the drag image
			e.dataTransfer.setDragImage(rowContainer, 0, 0);
			e.dataTransfer.effectAllowed = 'move';
		}));

		disposables.add(dom.addDisposableListener(handleEl, dom.EventType.DRAG_END, () => {
			rowContainer.classList.remove(DRAGGING_CLASS);
			this._onDragEnd();
		}));
	}

	// --- drag event handlers (delegated on the container) ---

	private _onDragOver(e: DragEvent): void {
		if (!this._dragState) {
			return;
		}

		const target = this._findDropTarget(e);
		if (!target) {
			this._hideIndicator();
			return;
		}

		e.preventDefault();
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = 'move';
		}

		const rect = target.row.getBoundingClientRect();
		const midY = rect.top + rect.height / 2;
		const before = e.clientY < midY;

		this._showIndicator(target.row, before);
	}

	private _onDrop(e: DragEvent): void {
		this._hideIndicator();
		if (!this._dragState) {
			return;
		}

		const target = this._findDropTarget(e);
		if (!target) {
			return;
		}

		e.preventDefault();

		const rect = target.row.getBoundingClientRect();
		const midY = rect.top + rect.height / 2;
		const insertBefore = e.clientY < midY;

		this._reorder(this._dragState.element, target.requestId, insertBefore);
		this._dragState = undefined;
	}

	private _onDragEnd(): void {
		this._hideIndicator();
		this._dragState = undefined;
	}

	// --- indicator positioning ---

	private _showIndicator(targetRow: HTMLElement, before: boolean): void {
		const rect = targetRow.getBoundingClientRect();
		const parentRect = this._insertIndicator.parentElement!.getBoundingClientRect();
		this._insertIndicator.style.display = 'block';
		this._insertIndicator.style.left = `${rect.left - parentRect.left}px`;
		this._insertIndicator.style.width = `${rect.width}px`;
		this._insertIndicator.style.top = before
			? `${rect.top - parentRect.top}px`
			: `${rect.bottom - parentRect.top}px`;
	}

	private _hideIndicator(): void {
		this._insertIndicator.style.display = 'none';
	}

	// --- target resolution ---

	private _findDropTarget(e: DragEvent): { row: HTMLElement; requestId: string } | undefined {
		if (!this._dragState) {
			return undefined;
		}

		const target = (e.target as HTMLElement)?.closest?.<HTMLElement>(`[${PENDING_REQUEST_ID_ATTR}]`);
		if (!target) {
			return undefined;
		}

		const requestId = target.getAttribute(PENDING_REQUEST_ID_ATTR)!;
		const kind = target.getAttribute(PENDING_KIND_ATTR);

		// Only allow reorder within the same group
		if (kind !== this._dragState.pendingKind || requestId === this._dragState.element.id) {
			return undefined;
		}

		return { row: target, requestId };
	}

	// --- reorder logic ---

	private _reorder(draggedElement: IChatRequestViewModel, targetId: string, insertBefore: boolean): void {
		const viewModel = this._getViewModel();
		if (!viewModel) {
			return;
		}

		const pendingRequests = viewModel.model.getPendingRequests();
		const draggedKind = draggedElement.pendingKind!;

		// Split into the dragged kind's group and the rest (preserving order)
		const group: IChatPendingRequest[] = [];
		const rest: IChatPendingRequest[] = [];
		for (const p of pendingRequests) {
			(p.kind === draggedKind ? group : rest).push(p);
		}

		// Remove dragged from group
		const draggedIdx = group.findIndex(p => p.request.id === draggedElement.id);
		if (draggedIdx === -1) {
			return;
		}
		const [dragged] = group.splice(draggedIdx, 1);

		// Find target position and insert
		let targetIdx = group.findIndex(p => p.request.id === targetId);
		if (targetIdx === -1) {
			return;
		}
		if (!insertBefore) {
			targetIdx++;
		}
		group.splice(targetIdx, 0, dragged);

		// Rebuild full list: steering first, then queued (matching addPendingRequest ordering)
		const reordered = (draggedKind === ChatRequestQueueKind.Steering
			? [...group, ...rest]   // group is steering, rest is queued
			: [...rest, ...group]   // rest is steering, group is queued
		).map(p => ({ requestId: p.request.id, kind: p.kind }));

		this._chatService.setPendingRequests(viewModel.sessionResource, reordered);
	}
}
