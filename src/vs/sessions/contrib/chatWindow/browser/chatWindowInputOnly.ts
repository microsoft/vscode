/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AbstractChatView } from '../../../browser/parts/chatView.js';
import { addDisposableListener, EventType, getWindow, isHTMLElement } from '../../../../base/browser/dom.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableValue } from '../../../../base/common/observable.js';
import { SessionView } from '../../../browser/parts/sessionView.js';
import { ISessionGridLayout, SessionGridCell, SessionLayoutMode } from '../../../common/sessionGridLayout/sessionGridLayout.js';
import { ChatWindowCellView, ChatWindowGridHost, IChatWindowCellConstraints } from './chatWindowGridHost.js';
import { ChatWindowState } from './chatWindowState.js';
import { clampStackedChatOnResize, decideStackedChatInputOnly, shouldRestoreStackedChatConversation, stackedChatConversationFits, stackedChatForcedByWindow, stackedChatPersistedInputOnly } from './stackedChatInputOnly.js';

/** The least height of the conversation above the chat input, below the editor area. */
export const CHAT_WINDOW_CONVERSATION_MIN_HEIGHT = 120;

/** The most height the chat input, with what shows above it, grows to while the chat shows only its input. */
const CHAT_WINDOW_INPUT_ONLY_MAX_HEIGHT = 320;

/**
 * Lets the chat of a chat window show only its input below the editor area (Stacked): dragging the split below the snap
 * point shows only the input, and above it the conversation, with the rules the main window uses
 * (`decideStackedChatInputOnly`). Only a press on a sash decides: a window resize keeps what shows, and keeps the input
 * alone at its height, except that a window too short for the conversation, with the editor area at its least height,
 * shows only the input until it grows again (see `stackedChatForcedByWindow`). What the chat shows in the end is what its
 * view shows, which shows the conversation when it needs it, such as for a confirmation its input cannot show: the cell
 * and the session header, which hides while only the input shows, follow the view.
 */
export class ChatWindowInputOnlyController extends Disposable {

	private readonly _dragging = observableValue<boolean>(this, false);
	private readonly _settle = this._register(new RunOnceScheduler(() => this._settleHeight(), 0));
	/** Set while the chat shows only its input because the window is too short; not the user's choice, so not kept. */
	private _forcedByWindow = false;
	/** Whether the settle that is scheduled follows a resize of the window, the only change that forces or restores. */
	private _resized = false;
	private readonly _view: IObservable<AbstractChatView | undefined>;

	/** The height of the chat cell when it shows only its input, or 0 while that is not known. */
	readonly collapsedHeight: IObservable<number>;

	/** Whether the chat shows only its input, below the editor area. */
	readonly shownInputOnly: IObservable<boolean>;

	constructor(
		sessionView: SessionView,
		private readonly _state: ChatWindowState,
		private readonly _gridHost: ChatWindowGridHost,
		chatCell: ChatWindowCellView,
		hostElement: HTMLElement,
		layout: IObservable<ISessionGridLayout>,
		defaultConstraints: IChatWindowCellConstraints,
		/** The least height of the editor area, which gives way to the conversation before it shows only the input. */
		private readonly _editorAreaMinimumHeight: number,
	) {
		super();

		const stacked = derived(this, reader => layout.read(reader).mode === SessionLayoutMode.Stacked);
		const view = this._view = sessionView.primaryChatView;
		const shownInputOnly = this.shownInputOnly = derived(this, reader => stacked.read(reader) && !!view.read(reader)?.inputOnly.read(reader));

		this._register(autorun(reader => {
			const chatView = view.read(reader);
			if (!chatView) {
				return;
			}
			if (stacked.read(reader)) {
				chatView.enableInputOnly({ maxHeight: CHAT_WINDOW_INPUT_ONLY_MAX_HEIGHT, inputOnly: _state.inputOnly.read(undefined) });
			} else {
				chatView.disableInputOnly();
			}
		}));
		this._register(autorun(reader => {
			const inputOnly = _state.inputOnly.read(reader);
			if (stacked.read(reader)) {
				view.read(reader)?.setInputOnly(inputOnly);
			}
		}));
		// What the chat shows, as the user chose it there, is what it shows next time; not what the window forced, nor the
		// conversation the view shows while its input cannot show what it needs.
		this._register(autorun(reader => {
			const chatView = view.read(reader);
			if (!stacked.read(reader) || !chatView?.canShowInputOnly.read(reader)) {
				return;
			}
			const inputOnly = chatView.inputOnly.read(reader);
			_state.setInputOnly(stackedChatPersistedInputOnly({ inputOnly, forcedByWindow: this._forcedByWindow, lastUserChoice: _state.inputOnly.read(undefined) }));
		}));
		// What the window forced holds only while the chat shows only its input: not once the layout is no longer
		// Stacked, nor once the chat shows its conversation, such as for a confirmation.
		this._register(autorun(reader => {
			if (!shownInputOnly.read(reader)) {
				this._forcedByWindow = false;
			}
		}));
		// The session header stays the top row of the window while the chat shows only its input, as in every layout.
		this._register(autorun(reader => {
			shownInputOnly.read(reader);
			if (stacked.read(reader)) {
				this._settle.schedule();
			}
		}));

		this.collapsedHeight = derived(this, reader => {
			const chatView = view.read(reader);
			const inputHeight = chatView?.inputOnlyHeight.read(reader) ?? 0;
			if (!inputHeight) {
				return 0;
			}
			return sessionView.primaryChatViewTop.read(reader) + inputHeight + chatCell.verticalInsets;
		});

		this._register(autorun(reader => {
			const collapsed = this.collapsedHeight.read(reader);
			if (!stacked.read(reader) || !collapsed) {
				chatCell.setConstraints(defaultConstraints);
				return;
			}
			// Down to its input while it is dragged; kept at it while it shows only its input.
			const keptToInput = shownInputOnly.read(reader) && !this._dragging.read(reader);
			chatCell.setConstraints({ ...defaultConstraints, minimumHeight: collapsed, maximumHeight: keptToInput ? collapsed : defaultConstraints.maximumHeight });
		}));

		// Only a press on a sash of this window's grid drags the split; what shows is decided once it lets go.
		const targetWindow = getWindow(hostElement);
		this._register(addDisposableListener(hostElement, EventType.POINTER_DOWN, e => {
			if (stacked.get() && isHTMLElement(e.target) && !!e.target.closest('.monaco-sash')) {
				this._dragging.set(true, undefined);
			}
		}, true));
		const release = () => {
			if (this._dragging.get()) {
				this._decide();
				this._dragging.set(false, undefined);
			}
		};
		for (const type of [EventType.POINTER_UP, 'pointercancel', EventType.DRAG_END]) {
			this._register(addDisposableListener(targetWindow, type, release, true));
		}
		this._register(addDisposableListener(targetWindow, EventType.BLUR, release));
		// A window resize keeps what shows: the input alone at its height, the conversation at least at its least height.
		this._register(_gridHost.onDidLayoutCells(() => {
			if (stacked.get() && !this._dragging.get()) {
				this._resized = true;
				this._settle.schedule();
			}
		}));
	}

	/** Shows the conversation, or only the input, as the user asks: the user's choice, which clears what the window forced. */
	toggleConversation(): void {
		const inputOnly = !this.shownInputOnly.get();
		this._forcedByWindow = false;
		this._state.setInputOnly(inputOnly);
		this._view.get()?.setInputOnly(inputOnly);
	}

	private _chatHeight(): number | undefined {
		return this._gridHost.getSize(SessionGridCell.Chat)?.height;
	}

	private _decide(): void {
		const groupHeight = this._chatHeight();
		const collapsedHeight = this.collapsedHeight.get();
		if (groupHeight === undefined || !collapsedHeight) {
			return;
		}
		const decision = decideStackedChatInputOnly({ groupHeight, collapsedHeight, conversationMinHeight: CHAT_WINDOW_CONVERSATION_MIN_HEIGHT, dragging: false });
		// The user's choice, which clears what the window forced.
		this._forcedByWindow = stackedChatForcedByWindow({ wasForced: this._forcedByWindow, wasInputOnly: this.shownInputOnly.get(), inputOnly: decision.inputOnly, byUser: true });
		this._state.setInputOnly(decision.inputOnly);
		this._view.get()?.setInputOnly(decision.inputOnly);
		if (decision.settleHeight !== undefined) {
			this._gridHost.resizeCell(SessionGridCell.Chat, { height: decision.settleHeight });
		}
	}

	private _settleHeight(): void {
		const groupHeight = this._chatHeight();
		const collapsedHeight = this.collapsedHeight.get();
		if (groupHeight === undefined || !collapsedHeight || this._gridHost.layout?.mode !== SessionLayoutMode.Stacked) {
			return;
		}
		const chatView = this._view.get();
		const inputOnly = this.shownInputOnly.get();
		const editorHeight = this._gridHost.getSize(SessionGridCell.SidePane)?.height;
		const resized = this._resized;
		this._resized = false;
		if (resized && chatView && editorHeight !== undefined) {
			const room = { groupHeight, collapsedHeight, conversationMinHeight: CHAT_WINDOW_CONVERSATION_MIN_HEIGHT, editorHeight, editorMinimumHeight: this._editorAreaMinimumHeight };
			if (inputOnly && shouldRestoreStackedChatConversation({ ...room, forcedByWindow: this._forcedByWindow })) {
				// The window grew back: the conversation shows again, and is given its height as it shows.
				this._forcedByWindow = false;
				chatView.setInputOnly(false);
				return;
			}
			if (!inputOnly && chatView.canShowInputOnly.get() && !stackedChatConversationFits(room)) {
				// Too short for the conversation, even with the editor area at its least height: only the input shows.
				this._forcedByWindow = stackedChatForcedByWindow({ wasForced: this._forcedByWindow, wasInputOnly: false, inputOnly: true, byUser: false });
				chatView.setInputOnly(true);
				return;
			}
		}
		const height = clampStackedChatOnResize({ groupHeight, collapsedHeight, conversationMinHeight: CHAT_WINDOW_CONVERSATION_MIN_HEIGHT, inputOnly });
		if (height !== undefined) {
			this._gridHost.resizeCell(SessionGridCell.Chat, { height });
		}
	}
}
