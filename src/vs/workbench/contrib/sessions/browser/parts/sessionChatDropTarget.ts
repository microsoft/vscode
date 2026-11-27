/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionChatDropTarget.css';
import { $, addDisposableListener, DragAndDropObserver, EventHelper, EventType, getWindow, getWindowId, isHTMLElement } from '../../../../../base/browser/dom.js';
import { DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { LocalSelectionTransfer } from '../../../../../platform/dnd/browser/dnd.js';
import { activeContrastBorder } from '../../../../../platform/theme/common/colorRegistry.js';
import { IThemeService, Themable } from '../../../../../platform/theme/common/themeService.js';
import { DraggedEditorGroupIdentifier, DraggedEditorIdentifier, InputDropTargetHints, isInputDropTarget, isPassThroughToInputDrag, PASS_THROUGH_MODIFIER_LABEL, registerPassThroughDropTarget } from '../../../../browser/dnd.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { EDITOR_DRAG_AND_DROP_BACKGROUND } from '../../../../common/theme.js';
import { ISessionsManagementService } from '../../common/sessionsManagement.js';
import { IResolvedSessionChat, resolveSessionChat, waitForSessionChat } from '../chatEditor/sessionChatEditorHost.js';
import { isChatWindowChatGone } from '../chatEditor/sessionChatOpening.js';
import { DraggedSessionIdentifier, getSessionChatDragData, isSessionChatDrag, SessionsDataTransfers } from '../dnd.js';

/** Where the chats dropped on a {@link SessionChatDropTarget} open. */
export interface ISessionChatDropTargetDelegate {
	/** The chat that the target shows, which it does not take: a chat dropped on itself opens nothing. */
	chat(): URI | undefined;
	/** Opens `chats`, the chats dropped on the target that it takes, in the order they were dragged. */
	open(chats: readonly URI[]): void;
	/**
	 * Holds the sessions of the window, such as by keeping their providers, until the returned disposable is disposed: while a
	 * session is dragged over the target, and once it drops, until its session is known, such as a session dragged from another
	 * window while the providers here were released. Not needed where the window always knows its sessions.
	 */
	holdSessions?(): IDisposable;
}

/**
 * Makes a chat take the chats and sessions dragged onto it, such as a session of the sessions list or the tab of a chat, and
 * open them where its {@link ISessionChatDropTargetDelegate delegate} says, such as beside the chat or in its place. While the
 * drag is over it, an overlay shows where it opens, and keeps the drag from scrolling what is under it. A chat that is archived
 * or gone, or the chat itself, is not taken. What is dropped on an input, such as to attach it as context, stays the input's,
 * as does what is dropped on the chat around such an input while the key that lets drags through is held.
 */
export class SessionChatDropTarget extends Themable {

	private readonly _overlayStore = this._register(new MutableDisposable<DisposableStore>());
	/** What holds the sessions of drops that wait for their sessions to be known. */
	private readonly _pendingDrops = this._register(new DisposableStore());

	private readonly _sessionTransfer = LocalSelectionTransfer.getInstance<DraggedSessionIdentifier>();
	private readonly _editorTransfer = LocalSelectionTransfer.getInstance<DraggedEditorIdentifier>();
	private readonly _groupTransfer = LocalSelectionTransfer.getInstance<DraggedEditorGroupIdentifier>();

	/**
	 * @param _element The chat's element, which positions the overlay.
	 */
	constructor(
		private readonly _element: HTMLElement,
		private readonly _delegate: ISessionChatDropTargetDelegate,
		@IThemeService themeService: IThemeService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
	) {
		super(themeService);

		// While the key is held, the drags let through reach the chat under the overlay, which attaches them, as in a chat editor
		this._register(registerPassThroughDropTarget(this._element, e => isPassThroughToInputDrag(e, this._element)));
		this._register(addDisposableListener(this._element, EventType.DRAG_ENTER, e => this._onDragEnter(e)));
	}

	private _isSessionDrag(e: DragEvent): boolean {
		return this._sessionTransfer.hasData(DraggedSessionIdentifier.prototype) || !!e.dataTransfer?.types.includes(SessionsDataTransfers.SESSION);
	}

	/**
	 * Whether the drag moves an editor or an editor group of the chat's window, such as another chat by its header or tab: the
	 * editor part takes it, to move it or split a group with it. A chat that comes from another window, whose editor cannot
	 * move here, is the target's to open.
	 */
	private _movesEditorOfWindow(): boolean {
		const group = this._editorTransfer.getData(DraggedEditorIdentifier.prototype)?.[0]?.identifier.groupId
			?? this._groupTransfer.getData(DraggedEditorGroupIdentifier.prototype)?.[0]?.identifier;
		return group !== undefined && this._editorGroupsService.getGroup(group)?.windowId === getWindowId(getWindow(this._element));
	}

	/** Whether the drag, as far as it is known before it drops, carries a chat the target takes. */
	private _accepts(e: DragEvent): boolean {
		if (this._movesEditorOfWindow()) {
			return false;
		}
		if (isSessionChatDrag(e)) {
			return true;
		}
		if (!this._isSessionDrag(e)) {
			return false;
		}
		const dragged = this._sessionTransfer.getData(DraggedSessionIdentifier.prototype);
		// Not known before it drops, when the drag is of another window's
		return !dragged || dragged.some(item => !!item.resource && !!this._chatToOpen(resolveSessionChat(this._sessionsManagementService, item.resource)));
	}

	/** The chat that the target opens for a dropped session or chat: its session's main chat, or the chat; none that it does not take. */
	private _chatToOpen(resolved: IResolvedSessionChat | undefined): URI | undefined {
		if (!resolved) {
			return undefined;
		}
		const chat = resolved.chat ?? resolved.session.mainChat.get().resource;
		return isChatWindowChatGone(resolved.session, chat, undefined) || isEqual(chat, this._delegate.chat()) ? undefined : chat;
	}

	private _onDragEnter(e: DragEvent): void {
		// An input under the drag that takes it, such as a chat input that attaches the dragged chat, takes it here, and so
		// does the chat around such an input while the key that lets drags through is held.
		if ((isHTMLElement(e.target) && isInputDropTarget(e.target, e)) || isPassThroughToInputDrag(e, this._element)) {
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
		const overlay = $('.session-chat-drop-overlay');
		const bounds = this._element.getBoundingClientRect();
		overlay.style.left = `${bounds.left}px`;
		overlay.style.top = `${bounds.top}px`;
		overlay.style.width = `${bounds.width}px`;
		overlay.style.height = `${bounds.height}px`;
		const indicator = $('.session-chat-drop-overlay-indicator');
		indicator.style.backgroundColor = this.getColor(EDITOR_DRAG_AND_DROP_BACKGROUND) || '';
		const border = this.getColor(activeContrastBorder);
		if (border) {
			indicator.style.outline = `2px dashed ${border}`;
			indicator.style.outlineOffset = '-2px';
		}
		overlay.appendChild(indicator);
		// The sessions stay known while one is dragged over the chat, so that what drops is known as it drops
		const hold = this._delegate.holdSessions?.();
		if (hold) {
			store.add(hold);
		}
		// Shown in the window's workbench, not in the chat's element: the drag over the overlay is not over the chat, whose drop
		// area can hold the element, such as the Chat view's, and counts the drags that enter and leave it.
		const host = this._element.closest<HTMLElement>('.monaco-workbench') ?? this._element;
		host.appendChild(overlay);
		store.add(toDisposable(() => overlay.remove()));
		const inputHints = store.add(new InputDropTargetHints(this._element, overlay, PASS_THROUGH_MODIFIER_LABEL));
		inputHints.update(e);
		store.add(addDisposableListener(getWindow(this._element), EventType.DRAG_END, () => this._hideOverlay()));
		store.add(new DragAndDropObserver(overlay, {
			onDragOver: ev => {
				// An input that takes the drag takes it once the drag moves over it, and so does the chat around it while the
				// key that lets drags through is held: the overlay, which covers them until then, goes away.
				if ((isHTMLElement(ev.target) && isInputDropTarget(ev.target, ev, this._element)) || isPassThroughToInputDrag(ev, this._element)) {
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
				// Before the overlay goes, whose hold keeps the sessions known until the drop holds them itself
				this._handleDrop(ev);
				this._hideOverlay();
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

	/** The chat or the sessions that are dropped, as the drop has them while it lasts. */
	private _readDropped(e: DragEvent): URI[] {
		const chat = getSessionChatDragData(e);
		if (chat) {
			return [URI.parse(chat.resource)];
		}
		const dragged = this._sessionTransfer.getData(DraggedSessionIdentifier.prototype) ?? this._readSessionPayload(e);
		this._sessionTransfer.clearData(DraggedSessionIdentifier.prototype);
		return dragged.flatMap(item => item.resource ? [item.resource] : []);
	}

	private _handleDrop(e: DragEvent): void {
		const dropped = this._readDropped(e);
		const known = dropped.map(resource => resolveSessionChat(this._sessionsManagementService, resource));
		if (known.every(resolved => !!resolved)) {
			this._open(known);
			return;
		}
		// The window does not know every dropped session yet, such as one of another window while the providers here were
		// released: their chats open once their sessions are known, while the sessions are held.
		const hold = this._pendingDrops.add(this._delegate.holdSessions?.() ?? toDisposable(() => { }));
		void Promise.all(dropped.map((resource, index) => known[index] ?? waitForSessionChat(this._sessionsManagementService, resource))).then(resolved => {
			if (!this._store.isDisposed) {
				this._open(resolved);
			}
		}).finally(() => this._pendingDrops.delete(hold));
	}

	private _open(resolved: readonly (IResolvedSessionChat | undefined)[]): void {
		const chats: URI[] = [];
		for (const item of resolved) {
			const chat = this._chatToOpen(item);
			if (chat && !chats.some(candidate => isEqual(candidate, chat))) {
				chats.push(chat);
			}
		}
		if (chats.length) {
			this._delegate.open(chats);
		}
	}
}
