/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatWindowSessionDropTarget.css';
import { $, addDisposableListener, DragAndDropObserver, EventHelper, EventType, getWindow, getWindowId, isHTMLElement } from '../../../../base/browser/dom.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { LocalSelectionTransfer } from '../../../../platform/dnd/browser/dnd.js';
import { activeContrastBorder } from '../../../../platform/theme/common/colorRegistry.js';
import { IThemeService, Themable } from '../../../../platform/theme/common/themeService.js';
import { InputDropTargetHints, isInputDropTarget } from '../../../../workbench/browser/dnd.js';
import { EDITOR_DRAG_AND_DROP_BACKGROUND } from '../../../../workbench/common/theme.js';
import { IChatWindowService } from '../../../../workbench/contrib/chatWindow/browser/chatWindow.js';
import { DraggedSessionIdentifier, getSessionChatDragData, isSessionChatDrag, SessionsDataTransfers } from '../../../../workbench/contrib/sessions/browser/dnd.js';
import { ISessionsManagementService } from '../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { isChatWindowChatGone } from '../../../../workbench/contrib/sessions/browser/chatEditor/sessionChatOpening.js';

/**
 * Makes the chat of a chat window take the chats and sessions dragged onto it, such as a session of the sessions list or
 * the tab of a chat of the main window: it opens each in the chat window, as a tab beside the chat. While the drag is
 * over it, an overlay shows where it opens, and keeps the drag from scrolling what is under it. A chat that is archived or
 * gone is not taken. What is dropped on an input, such as to attach it as context, stays the input's.
 */
export class ChatWindowSessionDropTarget extends Themable {

	private readonly _overlayStore = this._register(new MutableDisposable<DisposableStore>());

	private readonly _sessionTransfer = LocalSelectionTransfer.getInstance<DraggedSessionIdentifier>();

	/**
	 * @param _element The chat's element, which positions the overlay.
	 * @param _getChat The chat the element shows, which the dropped chats open beside.
	 */
	constructor(
		private readonly _element: HTMLElement,
		private readonly _getChat: () => URI | undefined,
		@IThemeService themeService: IThemeService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@IChatWindowService private readonly _chatWindowService: IChatWindowService,
	) {
		super(themeService);

		this._register(addDisposableListener(this._element, EventType.DRAG_ENTER, e => this._onDragEnter(e)));
	}

	private _isSessionDrag(e: DragEvent): boolean {
		return this._sessionTransfer.hasData(DraggedSessionIdentifier.prototype) || !!e.dataTransfer?.types.includes(SessionsDataTransfers.SESSION);
	}

	/** Whether the drag, as far as it is known before it drops, carries a chat the window takes. */
	private _accepts(e: DragEvent): boolean {
		if (isSessionChatDrag(e)) {
			return true;
		}
		if (!this._isSessionDrag(e)) {
			return false;
		}
		const dragged = this._sessionTransfer.getData(DraggedSessionIdentifier.prototype);
		// Not known before it drops, when the drag is of another window's
		return !dragged || dragged.some(item => !!item.resource && !!this._resolveSessionChat(item.resource));
	}

	private _resolveSessionChat(resource: URI): URI | undefined {
		const session = this._sessionsManagementService.getSession(resource);
		if (!session) {
			return undefined;
		}
		const chat = session.mainChat.get().resource;
		return isChatWindowChatGone(session, chat, undefined) ? undefined : chat;
	}

	private _onDragEnter(e: DragEvent): void {
		// An input under the drag that takes it, such as a chat input that attaches the dragged chat, takes it here.
		if (isHTMLElement(e.target) && isInputDropTarget(e.target, e)) {
			this._hideOverlay();
			return;
		}
		if (!this._accepts(e)) {
			return;
		}
		if (!this._overlayStore.value) {
			this._showOverlay(e);
		}
	}

	private _showOverlay(e: DragEvent): void {
		const store = new DisposableStore();
		this._overlayStore.value = store;
		const overlay = $('.chat-window-session-drop-overlay');
		const bounds = this._element.getBoundingClientRect();
		overlay.style.left = `${bounds.left}px`;
		overlay.style.top = `${bounds.top}px`;
		overlay.style.width = `${bounds.width}px`;
		overlay.style.height = `${bounds.height}px`;
		const indicator = $('.chat-window-session-drop-overlay-indicator');
		indicator.style.backgroundColor = this.getColor(EDITOR_DRAG_AND_DROP_BACKGROUND) || '';
		const border = this.getColor(activeContrastBorder);
		if (border) {
			indicator.style.outline = `2px dashed ${border}`;
			indicator.style.outlineOffset = '-2px';
		}
		overlay.appendChild(indicator);
		this._element.appendChild(overlay);
		store.add(toDisposable(() => overlay.remove()));
		const inputHints = store.add(new InputDropTargetHints(this._element, overlay));
		inputHints.update(e);
		store.add(addDisposableListener(getWindow(this._element), EventType.DRAG_END, () => this._hideOverlay()));
		store.add(new DragAndDropObserver(overlay, {
			onDragOver: ev => {
				// An input that takes the drag takes it once the drag moves over it: the overlay, which covers the input
				// until then, goes away.
				if (isHTMLElement(ev.target) && isInputDropTarget(ev.target, ev, this._element)) {
					this._hideOverlay();
					return;
				}
				inputHints.update(ev);
				if (ev.dataTransfer) {
					ev.dataTransfer.dropEffect = 'move';
				}
			},
			onDragLeave: () => this._hideOverlay(),
			onDragEnd: () => this._hideOverlay(),
			onDrop: ev => {
				EventHelper.stop(ev, true);
				this._hideOverlay();
				this._handleDrop(ev);
			},
		}));
	}

	private _hideOverlay(): void {
		this._overlayStore.clear();
	}

	/** The session of a drag from another window, whose payload is only in the data transfer. */
	private _readSessionPayload(e: DragEvent): DraggedSessionIdentifier[] {
		try {
			const payload = JSON.parse(e.dataTransfer?.getData(SessionsDataTransfers.SESSION) || '{}');
			if (typeof payload.sessionId === 'string' && typeof payload.resource === 'string') {
				return [new DraggedSessionIdentifier(payload.sessionId, URI.parse(payload.resource))];
			}
		} catch {
			// Not a session payload
		}
		return [];
	}

	private _handleDrop(e: DragEvent): void {
		const chats: URI[] = [];
		const chat = getSessionChatDragData(e);
		if (chat) {
			const resource = URI.parse(chat.resource);
			const found = this._sessionsManagementService.getSessionForChatResource(resource);
			if (found && !isChatWindowChatGone(found.session, resource, undefined)) {
				chats.push(resource);
			}
		} else {
			const dragged = this._sessionTransfer.getData(DraggedSessionIdentifier.prototype) ?? this._readSessionPayload(e);
			this._sessionTransfer.clearData(DraggedSessionIdentifier.prototype);
			for (const item of dragged) {
				const resolved = item.resource && this._resolveSessionChat(item.resource);
				if (resolved) {
					chats.push(resolved);
				}
			}
		}
		const window = this._chatWindowService.getWindow(getWindowId(getWindow(this._element)));
		if (!window || !chats.length) {
			return;
		}
		void (async () => {
			let tabOf = this._getChat();
			for (const resource of chats) {
				await this._chatWindowService.open(resource, { window, exactChat: true, tabOf });
				tabOf = resource;
			}
		})().catch(onUnexpectedError);
	}
}
