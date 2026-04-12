/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import * as dom from '../../../../../base/browser/dom.js';
import { DragAndDropObserver } from '../../../../../base/browser/dom.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IChatService } from '../../common/chatService/chatService.js';
const PENDING_REQUEST_ID_ATTR = 'data-pending-request-id';
const PENDING_KIND_ATTR = 'data-pending-kind';
const DRAGGING_CLASS = 'chat-pending-dragging';
/**
 * Manages drag-and-drop reordering for pending (steering/queued) chat messages.
 * Attaches drag handles to pending request rows and uses event delegation on
 * the list container to handle drop targets, keeping logic isolated from the
 * renderer itself.
 */
let ChatPendingDragController = class ChatPendingDragController extends Disposable {
    constructor(listContainer, _getViewModel, _chatService) {
        super();
        this._getViewModel = _getViewModel;
        this._chatService = _chatService;
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
    attachDragHandle(element, handleEl, rowContainer, disposables) {
        handleEl.setAttribute('draggable', 'true');
        disposables.add(dom.addDisposableListener(handleEl, dom.EventType.DRAG_START, (e) => {
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
    _onDragOver(e) {
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
    _onDrop(e) {
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
    _onDragEnd() {
        this._hideIndicator();
        this._dragState = undefined;
    }
    // --- indicator positioning ---
    _showIndicator(targetRow, before) {
        const rect = targetRow.getBoundingClientRect();
        const parentRect = this._insertIndicator.parentElement.getBoundingClientRect();
        this._insertIndicator.style.display = 'block';
        this._insertIndicator.style.left = `${rect.left - parentRect.left}px`;
        this._insertIndicator.style.width = `${rect.width}px`;
        this._insertIndicator.style.top = before
            ? `${rect.top - parentRect.top}px`
            : `${rect.bottom - parentRect.top}px`;
    }
    _hideIndicator() {
        this._insertIndicator.style.display = 'none';
    }
    // --- target resolution ---
    _findDropTarget(e) {
        if (!this._dragState) {
            return undefined;
        }
        const target = e.target?.closest?.(`[${PENDING_REQUEST_ID_ATTR}]`);
        if (!target) {
            return undefined;
        }
        const requestId = target.getAttribute(PENDING_REQUEST_ID_ATTR);
        const kind = target.getAttribute(PENDING_KIND_ATTR);
        // Only allow reorder within the same group
        if (kind !== this._dragState.pendingKind || requestId === this._dragState.element.id) {
            return undefined;
        }
        return { row: target, requestId };
    }
    // --- reorder logic ---
    _reorder(draggedElement, targetId, insertBefore) {
        const viewModel = this._getViewModel();
        if (!viewModel) {
            return;
        }
        const pendingRequests = viewModel.model.getPendingRequests();
        const draggedKind = draggedElement.pendingKind;
        // Split into the dragged kind's group and the rest (preserving order)
        const group = [];
        const rest = [];
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
        const reordered = (draggedKind === "steering" /* ChatRequestQueueKind.Steering */
            ? [...group, ...rest] // group is steering, rest is queued
            : [...rest, ...group] // rest is steering, group is queued
        ).map(p => ({ requestId: p.request.id, kind: p.kind }));
        this._chatService.setPendingRequests(viewModel.sessionResource, reordered);
    }
};
ChatPendingDragController = __decorate([
    __param(2, IChatService)
], ChatPendingDragController);
export { ChatPendingDragController };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFBlbmRpbmdEcmFnQW5kRHJvcC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdFBlbmRpbmdEcmFnQW5kRHJvcC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLG9DQUFvQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxVQUFVLEVBQW1CLFlBQVksRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3BHLE9BQU8sRUFBd0IsWUFBWSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFJN0YsTUFBTSx1QkFBdUIsR0FBRyx5QkFBeUIsQ0FBQztBQUMxRCxNQUFNLGlCQUFpQixHQUFHLG1CQUFtQixDQUFDO0FBQzlDLE1BQU0sY0FBYyxHQUFHLHVCQUF1QixDQUFDO0FBTy9DOzs7OztHQUtHO0FBQ0ksSUFBTSx5QkFBeUIsR0FBL0IsTUFBTSx5QkFBMEIsU0FBUSxVQUFVO0lBS3hELFlBQ0MsYUFBMEIsRUFDVCxhQUErQyxFQUNqQyxZQUEwQjtRQUV6RCxLQUFLLEVBQUUsQ0FBQztRQUhTLGtCQUFhLEdBQWIsYUFBYSxDQUFrQztRQUNqQyxpQkFBWSxHQUFaLFlBQVksQ0FBYztRQUl6RCxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQyxnQ0FBZ0MsQ0FBQyxDQUFDO1FBQ2hFLGFBQWEsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDNUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxZQUFZLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMs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