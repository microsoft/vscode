/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, append, EventType, getActiveWindow } from '../../../../base/browser/dom.js';
import { Direction } from '../../../../base/browser/ui/grid/grid.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { combinedDisposable, Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableSignal, observableValue, transaction } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IEditorGroupView, IEditorGroupViewOptions } from '../../../browser/parts/editor/editor.js';
import { IsAuxiliaryWindowContext } from '../../../common/contextkeys.js';
import { EditorCloseContext, EditorsOrder, GroupIdentifier, GroupModelChangeKind } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IAuxiliaryWindowService } from '../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { bindEditorPartsToWindow } from '../../../services/editor/browser/editorPartWindowBinding.js';
import { GroupDirection, GroupsOrder, IContentPart, IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { ChatWindowLayoutMode, ChatWindowSplitLayout, ChatWindowTerminalPosition } from '../common/chatWindowLayout.js';
import { ChatWindowChatLayouts, ChatWindowChatSizes, ChatWindowDefaults, ChatWindowState } from '../common/chatWindowState.js';
import { IChatWindow, IChatWindowChat, IChatWindowChatPart, IChatWindowContent, IChatWindowEditors, IChatWindowOpenOptions, IChatWindowProvider, IChatWindowService } from './chatWindow.js';
import { bindWindowLayoutContext, bindWindowTerminalsContext } from './chatWindowContextKeys.js';
import { captureChatPart, deserializeChatWindowEditors, getRestoredChatGroup, reopenChatWindow, serializeChatWindowEditorsBesideChat } from './chatWindowEditors.js';
import { InFlightOperations, openCleaningUpOnFailure } from './chatWindowOpening.js';
import { bindChatWindowPartsVisible, moveEditorsToChatWindow, showChatInsteadOfEmptyMainPart, trackMainPartEditors } from './chatWindowParts.js';
import { ChatWindowGrid, TERMINAL_EDITOR_TYPE_ID } from './chatWindowGrid.js';
import { ChatWindowPartFactory } from './chatWindowPartFactory.js';
import { ChatWindowsRestoration } from './chatWindowsRestoration.js';

/**
 * The options of the groups of the part that holds a chat window's terminals: their tabs show as terminal tabs do, and an
 * editor beside the terminals, such as one dropped there, shows the header of the groups of the main part, with its menus,
 * while terminals show none.
 */
export function getTerminalsPartGroupViewOptions(mainPartGroupViewOptions: IEditorGroupViewOptions | undefined): IEditorGroupViewOptions {
	const menuIds = mainPartGroupViewOptions?.menuIds;
	return {
		hideLockActions: true,
		menuIds: menuIds && { headerPrimary: menuIds.headerPrimary, headerSecondary: menuIds.headerSecondary, headerLayout: menuIds.headerLayout },
		showHeader: mainPartGroupViewOptions?.showHeader,
		showHeaderFor: editor => editor?.typeId !== TERMINAL_EDITOR_TYPE_ID,
	};
}

/**
 * The options of the groups of a chat window's chat part: those of its main part, but for the header of the group of a
 * chat while the chat shows, as the chat shows its own; such as with another editor beside it, as a tab.
 */
export function getChatPartGroupViewOptions(mainPartGroupViewOptions: IEditorGroupViewOptions | undefined, isChat: (editor: EditorInput) => boolean): IEditorGroupViewOptions | undefined {
	if (!mainPartGroupViewOptions) {
		return undefined;
	}
	const showHeaderFor = mainPartGroupViewOptions.showHeaderFor;
	return { ...mainPartGroupViewOptions, showHeaderFor: editor => !(editor && isChat(editor)) && (showHeaderFor?.(editor) ?? true) };
}

/** The size of a chat window when it opens. */
const CHAT_WINDOW_SIZE = { width: 1200, height: 800 };

/** What a {@link ChatWindow} needs of the window it shows in. */
export interface IChatWindowHost {
	/** Focuses the window, unless it has focus already. */
	focusWindow(): void;
	/** Closes the window, once its parts closed. */
	closeWindow(): void;
	/** Whether the window unloads: its parts close with it, which must not close it again or change its layout. */
	isUnloading(): boolean;
	/** The window starts closing, or stays open after all: what arranges its parts waits meanwhile. */
	setClosing?(closing: boolean): void;
	/** The group of the main window that the editors of the window move to as it closes. */
	mainWindowGroup?(): GroupIdentifier;
	/** Creates the part that holds the window's terminals, in the window's grid. */
	createTerminalsPart(): IContentPart;
	/** Whether the part that holds the window's terminals shows in the window's grid. */
	readonly terminalsVisible: IObservable<boolean>;
	/** Whether the chat part leads the window's grid: it shows, with no part before it, to its left or above it. */
	readonly chatPartLeads: IObservable<boolean>;
	/** Whether the user resizes the parts of the window's grid, dragging a sash between them. */
	readonly resizing: IObservable<boolean>;
	/** The editor of the window's last chat moved out of the window, such as into the main window or into an editor window. */
	didMoveChatOut(): void;
	/**
	 * The editor of `chat`, one of several chats of the window, moved out of the window, which keeps its other chats: it
	 * left the window, and shows where its editor went.
	 */
	didMoveOneChatOut?(chat: URI, input: EditorInput): void;
	/** The group of any window that shows `editor`, if one does. */
	findGroup(editor: EditorInput): IEditorGroup | undefined;
	/** Tells why the chat cannot move out of the window, such as for an editor of it that cannot move to the main window. */
	showMoveVeto?(message: string): void;
	/** Forgets the layout and sizes remembered for the window's chat, and arranges its parts again as in a new window. */
	resetLayout(): void;
	/**
	 * The groups of every part of the window, such as of the parts created for editors dropped on its edges, where the
	 * chat's editor can move and stay in the window. Without it, those of the chat part and the main part.
	 */
	readonly windowGroups?: IChatWindowGroups;
}

/** The groups of the parts of a window. */
export interface IChatWindowGroups {
	readonly groups: readonly IEditorGroup[];
	readonly onDidAddGroup: Event<IEditorGroup>;
	readonly onDidRemoveGroup: Event<IEditorGroup>;
	/** Fires as a group of the window becomes active or gets focus, also one that was already the active group of its part. */
	readonly onDidActivateGroup?: Event<IEditorGroup>;
}

/** The class of a chat window's element while something is dragged in one of `windows`. */
const CHAT_WINDOW_DRAGGING_CLASS = 'dragging-editor';

function bindDraggingClass(element: HTMLElement, windows: readonly Window[]): IDisposable {
	const store = new DisposableStore();
	for (const targetWindow of windows) {
		store.add(addDisposableListener(targetWindow, EventType.DRAG_START, () => element.classList.add(CHAT_WINDOW_DRAGGING_CLASS), true));
		for (const type of [EventType.DRAG_END, EventType.DROP]) {
			store.add(addDisposableListener(targetWindow, type, () => element.classList.remove(CHAT_WINDOW_DRAGGING_CLASS), true));
		}
	}
	return store;
}

/**
 * The group of `groups` that shows `editor` itself, not merely an editor that matches it, such as another view of the same
 * chat, which must not count as the chat still being open.
 */
export function findGroupShowing(groups: readonly IEditorGroup[], editor: EditorInput): IEditorGroup | undefined {
	return groups.find(candidate => candidate.contains(editor, { strictEquals: true }));
}

/**
 * An open chat window: its chat part, which shows the editors of its chats, its main part, and the state that lays them
 * out.
 *
 * - its main part shows when an editor opens in it, and the window shows only its chats once its last editor closes;
 * - closing the editor of a chat, such as with Close Editor, or the end of a chat, removes the chat; the window closes
 *   once its last chat leaves, and as it closes;
 * - moving the editor of one of several chats out of the window takes only that chat out of it;
 * - closing it closes its parts, which moves the editors that need confirmation to close to the main window.
 */
export class ChatWindow extends Disposable implements IChatWindow {

	private readonly _onWillClose = this._register(new Emitter<void>());
	readonly onWillClose: Event<void> = this._onWillClose.event;
	private readonly _onWillCloseParts = this._register(new Emitter<void>());
	readonly onWillCloseParts: Event<void> = this._onWillCloseParts.event;

	private readonly _onDidClose = this._register(new Emitter<void>());
	readonly onDidClose: Event<void> = this._onDidClose.event;

	private readonly _terminalsPart = observableValue<IContentPart | undefined>(this, undefined);
	readonly terminalsPart: IObservable<IContentPart | undefined> = this._terminalsPart;

	readonly chatLeads: IObservable<boolean>;

	private readonly _chats: ReturnType<typeof observableValue<readonly IChatWindowChat[]>>;
	private readonly _activeChat: ReturnType<typeof observableValue<IChatWindowChat>>;
	private readonly _chatListeners = this._register(new DisposableMap<IChatWindowChat>());
	readonly chats: IObservable<readonly URI[]>;
	readonly chat: IObservable<URI>;
	readonly title: IObservable<string>;

	/** The groups of its chat part besides those of its chats, such as an editor split beside a chat, to show them again. */
	captureChatPart(): IChatWindowChatPart | undefined {
		// While the chats are there, else as the chat part was as the last chat left it, such as for another window: its
		// group, with the tabs that were beside it, or the groups split beside it, also when its group went with it, take it back
		return captureChatPart(this.chatPart, this.chatInputs) ?? (this._findChatGroup() ? undefined : this._chatPartAsChatLeft);
	}

	/** The editors of its chats, in their order. */
	get chatInputs(): readonly EditorInput[] {
		return this._chats.get().map(chat => chat.input);
	}

	/** Its chats as the provider resolved them, in their order. */
	get chatsOfWindow(): readonly IChatWindowChat[] {
		return this._chats.get();
	}

	isChatEditor(editor: EditorInput): boolean {
		return this._chats.get().some(chat => chat.input === editor);
	}

	private _chatOf(editor: EditorInput | null | undefined): IChatWindowChat | undefined {
		return editor ? this._chats.get().find(chat => chat.input === editor) : undefined;
	}

	/** Adds `chat` to the chats it shows; its editor opens in its chat part separately. */
	addChat(chat: IChatWindowChat): void {
		if (this._chats.get().includes(chat)) {
			return;
		}
		this._chats.set([...this._chats.get(), chat], undefined);
		this._trackChat(chat);
	}

	private _trackChat(chat: IChatWindowChat): void {
		// A chat that ends leaves the window, which closes with its last chat
		this._chatListeners.set(chat, chat.onDidEnd(() => {
			if (this._chats.get().length === 1) {
				this.close();
			} else {
				const group = this._windowGroups.groups.find(candidate => candidate.contains(chat.input));
				if (group) {
					void group.closeEditor(chat.input);
				} else {
					this._removeChat(chat);
				}
			}
		}));
	}

	/** Takes `chat`, one of several, out of the window: its editor left it. */
	private _removeChat(chat: IChatWindowChat): void {
		const remaining = this._chats.get().filter(candidate => candidate !== chat);
		if (remaining.length === this._chats.get().length) {
			return;
		}
		transaction(tx => {
			this._chats.set(remaining, tx);
			if (this._activeChat.get() === chat) {
				this._activeChat.set(this._chatOf(this.chatPart.activeGroup.activeEditor) ?? remaining[0], tx);
			}
		});
		this._chatListeners.deleteAndDispose(chat);
		chat.dispose();
	}

	/** The groups of the chat part as the chat last left its group in it, captured as it was about to. */
	private _chatPartAsChatLeft: IChatWindowChatPart | undefined;
	/** Set while editors move out of the chat's group at once, such as with the group, once the chat part was captured. */
	private _capturingChatPart = false;

	/**
	 * Captures the chat part before an editor leaves `group`, the chat's group of the chat part: editors leave a group
	 * before the group says so, and several leave one by one as their group merges into another. Only the first of
	 * them captures, with all of them still there.
	 */
	private _captureChatPartAsChatLeaves(group: IEditorGroup): void {
		if (this._closing || this._capturingChatPart || !this.chatPart.groups.includes(group)) {
			return;
		}
		this._chatPartAsChatLeft = captureChatPart(this.chatPart, this.chatInputs);
		this._capturingChatPart = true;
		queueMicrotask(() => this._capturingChatPart = false);
	}

	private _willClose = false;

	private _closed = false;
	/** Set while it closes, so that editors closing with it do not change its layout or close it again. */
	private _closing = false;
	/** The groups of every part of the window, where the chat's editor can be. */
	private readonly _windowGroups: IChatWindowGroups;

	constructor(
		readonly windowId: number,
		readonly content: IChatWindowContent,
		firstChat: IChatWindowChat,
		readonly state: ChatWindowState,
		readonly mainPart: IContentPart,
		readonly chatPart: IContentPart,
		private readonly _host: IChatWindowHost,
	) {
		super();

		this._chats = observableValue<readonly IChatWindowChat[]>(this, [firstChat]);
		this._activeChat = observableValue<IChatWindowChat>(this, firstChat);
		this.chats = derived(this, reader => this._chats.read(reader).map(chat => chat.chat.read(reader)));
		this.chat = derived(this, reader => this._activeChat.read(reader).chat.read(reader));
		this.title = derived(this, reader => this._activeChat.read(reader).title.read(reader));
		// The chats it still shows as it goes away leave with it
		this._register(toDisposable(() => this._chats.get().forEach(chat => chat.dispose())));

		const isChatIn = (groups: readonly IEditorGroup[]) => groups.some(group => this.chatInputs.some(input => group.contains(input)));
		this._register(trackMainPartEditors(mainPart, {
			onDidOpenEditor: () => this._showMainPart(),
			// Only the chat part can show the chat: with the chat moved to another part, the window keeps its layout
			onDidCloseLastEditor: () => {
				if (isChatIn(this.chatPart.groups)) {
					this.state.showChatOnly();
				}
			},
			isClosing: () => this._closing || this._host.isUnloading(),
		}));

		// The chat's editor is the chat window: closing it closes the window, and moving it out of the window takes the
		// chat out of it. It may move between the groups of the parts of the window, such as when the chat part splits, or
		// the chat part merges or the chat is dragged into another part.
		const windowGroups: IChatWindowGroups = this._windowGroups = _host.windowGroups ?? {
			get groups() { return [...chatPart.groups, ...mainPart.groups]; },
			onDidAddGroup: Event.any(chatPart.onDidAddGroup, mainPart.onDidAddGroup),
			onDidRemoveGroup: Event.any(chatPart.onDidRemoveGroup, mainPart.onDidRemoveGroup),
		};
		const chatGroupListeners = this._register(new DisposableMap<IEditorGroup>());
		const chatMoved = observableSignal(this);
		// The chat leads the window from the first group of the chat part, at its top left, such as not after a group
		// split off to its left, while it is alone there: with other editors beside it, as tabs, the group shows its tab row,
		// below the title row of the window, which shows meanwhile
		this._register(Event.any(chatPart.onDidAddGroup, chatPart.onDidRemoveGroup, chatPart.onDidMoveGroup)(() => chatMoved.trigger(undefined)));
		this.chatLeads = derived(this, reader => {
			chatMoved.read(reader);
			this._chats.read(reader);
			const first = chatPart.getGroups(GroupsOrder.GRID_APPEARANCE)[0];
			return _host.chatPartLeads.read(reader) && first?.count === 1 && !!this._chatOf(first.activeEditor);
		});
		// The active chat: that of the active editor of the group of the window last activated or focused, in any of its
		// parts, as that group shows another editor or another group becomes active. A group that is not the active one,
		// such as one a chat opens in without focus, does not change it.
		let activeGroup: IEditorGroup = chatPart.activeGroup;
		const activate = (editor: EditorInput | null) => {
			const chat = this._chatOf(editor);
			if (chat) {
				this._activeChat.set(chat, undefined);
			}
		};
		const activateGroup = (group: IEditorGroup) => {
			activeGroup = group;
			activate(group.activeEditor);
		};
		this._register(chatPart.onDidChangeActiveGroup(activateGroup));
		// Any editor that opens or closes in a group of the window, beside the chat or not
		const trackChatGroup = (group: IEditorGroup) => chatGroupListeners.set(group, combinedDisposable(group.onDidActiveEditorChange(() => {
			chatMoved.trigger(undefined);
			if (group === activeGroup) {
				activate(group.activeEditor);
			}
		}), group.onDidModelChange(e => {
			if (e.kind === GroupModelChangeKind.EDITOR_OPEN || (e.editor && this.isChatEditor(e.editor))) {
				chatMoved.trigger(undefined);
			}
		}), group.onDidCloseEditor(e => {
			chatMoved.trigger(undefined);
			const chat = this._chatOf(e.editor);
			if (!chat || this._closing || this._host.isUnloading()) {
				return;
			}
			const input = chat.input;
			// Still open in a group, such as one of another window its group moved to, which closes the editor in the group it
			// leaves rather than moving it: the chat moved, as it does for a move
			const open = e.context === EditorCloseContext.MOVE || !!this._host.findGroup(input);
			const last = this._chats.get().length === 1;
			if (!open) {
				if (last) {
					// Once the editor closed: closing the window closes the part whose group still closes the editor.
					disposableTimeout(() => this.close(), 0, this._store);
				} else {
					this._removeChat(chat);
				}
			} else if (!this._windowGroups.groups.some(candidate => candidate.contains(input))) {
				if (!last) {
					// One of several chats moved out: it leaves, the window keeps the others
					const resource = chat.chat.get();
					this._removeChat(chat);
					this._host.didMoveOneChatOut?.(resource, input);
					return;
				}
				const veto = this._editorsLeaveVeto();
				if (veto === undefined) {
					this._host.didMoveChatOut();
				} else {
					// The window cannot close, such as for an editor that cannot move to the main window: once the move is
					// done, the chat goes back where it was, rather than out of a window that stays
					this._host.showMoveVeto?.(veto);
					disposableTimeout(() => this._host.findGroup(input)?.moveEditor(input, this.chatPart.groups.includes(group) ? group : this.chatPart.activeGroup), 0, this._store);
				}
			}
		}), group.onWillMoveEditor(() => {
			// Before an editor moves out of the group of the last chat, such as the chat, or the tabs beside it ahead of the
			// chat as the group merges into another, one by one: the chat part as it is then is what the chat goes back to
			if (this._chats.get().length === 1 && this.chatInputs.some(input => group.contains(input))) {
				this._captureChatPartAsChatLeaves(group);
			}
		})));
		// The group of the last chat moving to another part, as a copy there, after which its editors close here: none moves
		this._register(chatPart.onWillMoveGroupOut(group => {
			if (this._chats.get().length === 1 && this.chatInputs.some(input => group.contains(input))) {
				this._captureChatPartAsChatLeaves(group);
			}
		}));
		windowGroups.groups.forEach(trackChatGroup);
		if (windowGroups.onDidActivateGroup) {
			this._register(windowGroups.onDidActivateGroup(activateGroup));
		}
		this._register(windowGroups.onDidAddGroup(trackChatGroup));
		this._register(windowGroups.onDidRemoveGroup(group => chatGroupListeners.deleteAndDispose(group)));

		this._trackChat(firstChat);
	}

	get chatEditor(): EditorInput { return this._activeChat.get().input; }
	get layoutMode(): IObservable<ChatWindowLayoutMode> { return this.state.layoutMode; }
	get splitLayout(): IObservable<ChatWindowSplitLayout> { return this.state.splitLayout; }
	get inputOnly(): IObservable<boolean> { return this.state.inputOnly; }
	get terminalPosition(): IObservable<ChatWindowTerminalPosition> { return this.state.terminalPosition; }
	get terminalsVisible(): IObservable<boolean> { return this._host.terminalsVisible; }
	get resizing(): IObservable<boolean> { return this._host.resizing; }

	getOrCreateTerminalsPart(): IContentPart {
		let part = this._terminalsPart.get();
		if (!part) {
			part = this._host.createTerminalsPart();
			this._terminalsPart.set(part, undefined);
			const created = part;
			Event.once(part.onWillClose)(() => {
				if (this._terminalsPart.get() === created) {
					this._terminalsPart.set(undefined, undefined);
				}
			});
		}
		return part;
	}

	setTerminalPosition(position: ChatWindowTerminalPosition): void {
		this.state.setTerminalPosition(position);
	}

	/** Whether the chat shows: not while only the main part does. */
	get chatVisible(): boolean {
		return this.state.layoutMode.get() !== ChatWindowLayoutMode.EditorOnly;
	}

	setLayoutMode(mode: ChatWindowLayoutMode): void {
		this._returnChat();
		if (mode !== ChatWindowLayoutMode.EditorOnly) {
			this._revealChat();
		}
		this.state.setLayoutMode(mode);
	}

	setSplitLayout(splitLayout: ChatWindowSplitLayout): void {
		this._returnChat();
		this.state.setSplitLayout(splitLayout);
	}

	showChatOnly(): void {
		this._returnChat();
		this._revealChat();
		this.state.showChatOnly();
	}

	toggleConversation(): void {
		this._returnChat();
		this._revealChat();
		if (this.state.layoutMode.get() === ChatWindowLayoutMode.Stacked) {
			this.state.setInputOnly(!this.state.inputOnly.get());
		}
	}

	resetLayout(): void {
		this._returnChat();
		this._host.resetLayout();
		this.state.reset();
		showChatInsteadOfEmptyMainPart(this.mainPart, this, true);
	}

	showEditor(): void {
		this._returnChat();
		this._showMainPart();
	}

	/** Shows the main part beside the chat, as the window shows it once an editor opens in it. */
	private _showMainPart(): void {
		if (this.state.layoutMode.get() === ChatWindowLayoutMode.ChatOnly) {
			this.state.showBoth();
		}
	}

	/**
	 * Moves the editors of its chats back into the chat part, before the window shows as a layout says: a layout shows the
	 * window's parts as the chat part showing the chats, so that a chat never hides with the part it was dropped into.
	 */
	private _returnChat(): void {
		for (const input of this.chatInputs) {
			const group = this._windowGroups.groups.find(candidate => candidate.contains(input));
			if (group && !this.chatPart.groups.includes(group)) {
				group.moveEditor(input, this.chatPart.activeGroup, { preserveFocus: true });
			}
		}
	}

	/** Shows the active chat where another editor beside it, as a tab of its group, shows: a layout that shows the chat shows it. */
	private _revealChat(): void {
		const group = this._findChatGroup();
		if (group && group.activeEditor !== this.chatEditor) {
			void group.openEditor(this.chatEditor, { preserveFocus: true });
		}
	}

	/** The group of the window that holds the editor of the active chat, in whichever of its parts it is. */
	private _findChatGroup(): IEditorGroup | undefined {
		return this._windowGroups.groups.find(group => group.contains(this.chatEditor));
	}

	/** Focuses the chat while it shows, else the main part, so that focusing a window that shows only its main part keeps it so. */
	focus(): void {
		this._host.focusWindow();
		if (this.chatVisible) {
			// The chat, also where another editor beside it, as a tab, shows: opening its editor there shows and focuses it
			const group = this._findChatGroup() ?? this.chatPart.activeGroup;
			if (group.activeEditor !== this.chatEditor && group.contains(this.chatEditor)) {
				void group.openEditor(this.chatEditor);
			} else {
				group.focus();
			}
		} else {
			this.mainPart.activeGroup.focus();
		}
	}

	/** Makes `chat`, one of its chats, its active chat, showing its editor in its group, without focusing it. */
	activateChat(chat: URI): void {
		const shown = this._chats.get().find(candidate => isEqual(candidate.chat.get(), chat));
		if (!shown) {
			return;
		}
		this._activeChat.set(shown, undefined);
		const group = this._windowGroups.groups.find(candidate => candidate.contains(shown.input));
		if (group && group.activeEditor !== shown.input) {
			void group.openEditor(shown.input, { preserveFocus: true });
		}
	}

	/** Focuses the window and shows `chat`, one of its chats, as its active chat. */
	revealChat(chat: URI): void {
		this.activateChat(chat);
		this.focus();
	}

	close(): boolean {
		if (this._closed) {
			return true;
		}
		// All or nothing, from the start: while an editor cannot move to the main window, nothing moves or closes, also not
		// the editors that would close without asking as their part closes.
		const veto = this._editorsLeaveVeto();
		if (veto !== undefined) {
			// Says why, as the chat moving out of the window does
			this._host.showMoveVeto?.(veto);
			return false;
		}
		this._closing = true;
		this._host.setClosing?.(true);
		// All or nothing: what the chat part shows beside the chat, such as an editor dropped beside it, moves into the main
		// part first, so that the chat part, then holding only the chat, which closes without asking, closes once the main
		// part did. The main part closes first: when an editor cannot move to the main window, the window stays as it was,
		// its chat too, and the editors that moved go back beside the chat.
		const moved = this._moveEditorsBesideChatToMainPart();
		const chatPartHoldsOnlyChat = this._chatPartHoldsOnlyChat();
		if (chatPartHoldsOnlyChat) {
			// What leaves the window rather than closing with its parts, such as terminals beside the chat, leaves it now
			this._onWillCloseParts.fire();
		}
		if (!chatPartHoldsOnlyChat || !this.mainPart.close()) {
			moved.moveBack();
			this._closing = false;
			this._host.setClosing?.(false);
			return false;
		}
		if (!this.chatPart.close()) {
			this._closing = false;
			this._host.setClosing?.(false);
			return false;
		}
		this.willUnload();
		this._closed = true;
		this._host.closeWindow();
		this._onDidClose.fire();
		return true;
	}

	/** Why an editor of the window, but the chat and its terminals, cannot move to the main window, if one cannot; shows the first that cannot. */
	private _editorsLeaveVeto(): string | undefined {
		const target = this._host.mainWindowGroup?.();
		if (target === undefined) {
			return undefined;
		}
		// All groups of the window, such as of parts it created for dropped editors and of the part that holds its terminals,
		// but not its terminals, which go to the panel as it closes
		for (const group of this._windowGroups.groups) {
			for (const editor of group.getEditors(EditorsOrder.SEQUENTIAL)) {
				const veto = !this.isChatEditor(editor) && editor.typeId !== TERMINAL_EDITOR_TYPE_ID ? editor.canMove(group.id, target) : true;
				if (typeof veto === 'string') {
					void group.openEditor(editor);
					return veto;
				}
			}
		}
		return undefined;
	}

	/** Moves the editors of the chat part other than the chat into the main part, those that can move. */
	private _moveEditorsBesideChatToMainPart(): { moveBack(): void } {
		const moved: { readonly editor: EditorInput; readonly from: IEditorGroup }[] = [];
		for (const group of this.chatPart.groups) {
			for (const editor of group.getEditors(EditorsOrder.SEQUENTIAL).filter(editor => !this.isChatEditor(editor))) {
				if (group.moveEditor(editor, this.mainPart.activeGroup, { preserveFocus: true, inactive: true })) {
					moved.push({ editor, from: group });
				}
			}
		}
		return {
			moveBack: () => {
				for (const { editor, from } of moved) {
					const group = this.mainPart.groups.find(candidate => candidate.contains(editor, { strictEquals: true }));
					if (group && this.chatPart.groups.includes(from)) {
						group.moveEditor(editor, from, { preserveFocus: true, inactive: true });
					}
				}
			},
		};
	}

	/** Whether the chat part holds only its chats: not while an editor that cannot move stays beside them. */
	private _chatPartHoldsOnlyChat(): boolean {
		return this.chatPart.groups.every(group => group.getEditors(EditorsOrder.SEQUENTIAL).every(editor => this.isChatEditor(editor)));
	}

	/**
	 * Lets what shows in its other parts, such as terminals, leave the window as it goes away, then closes those parts:
	 * once, as it closes or as its window unloads, before the parts close with it.
	 */
	willUnload(): void {
		if (this._willClose) {
			return;
		}
		this._willClose = true;
		this._onWillClose.fire();
		this._terminalsPart.get()?.close();
	}

	/** Ends the chat window without closing its parts again: its window went away. */
	didClose(): void {
		if (this._closed) {
			return;
		}
		this._closed = true;
		this._closing = true;
		this._onDidClose.fire();
	}
}

export class ChatWindowService extends Disposable implements IChatWindowService {

	declare readonly _serviceBrand: undefined;

	private readonly _windows = observableValue<readonly ChatWindow[]>(this, []);
	readonly windows: IObservable<readonly IChatWindow[]> = this._windows;

	private readonly _provider = observableValue<IChatWindowProvider | undefined>(this, undefined);
	readonly hasProvider: IObservable<boolean>;

	private readonly _opening = new InFlightOperations<IChatWindow | undefined>();
	private readonly _chatLayouts: ChatWindowChatLayouts;
	private readonly _chatSizes: ChatWindowChatSizes;
	/** The grid of each open window, which arranges its parts. */
	private readonly _grids = new Map<IChatWindow, ChatWindowGrid>();

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IStorageService private readonly _storageService: IStorageService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IAuxiliaryWindowService private readonly _auxiliaryWindowService: IAuxiliaryWindowService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IHostService private readonly _hostService: IHostService,
		@IDialogService private readonly _dialogService: IDialogService,
		@ILifecycleService private readonly _lifecycleService: ILifecycleService,
	) {
		super();
		this.hasProvider = this._provider.map(provider => !!provider);
		this._chatLayouts = new ChatWindowChatLayouts(_storageService);
		this._chatSizes = new ChatWindowChatSizes(_storageService);
		this._register(this._instantiationService.createInstance(ChatWindowsRestoration, {
			provider: this._provider,
			windows: this._windows,
			open: (chat: URI, options: IChatWindowOpenOptions) => this.open(chat, options),
			terminalsShown: window => window.terminalsVisible.get(),
			chatPart: window => this._windows.get().find(candidate => candidate === window)?.captureChatPart(),
			createdParts: window => this._grids.get(window)?.createdParts ?? [],
			activateChat: (window, chat) => this._windows.get().find(candidate => candidate === window)?.activateChat(chat),
		}));
	}

	registerProvider(provider: IChatWindowProvider): IDisposable {
		this._provider.set(provider, undefined);
		return toDisposable(() => {
			if (this._provider.get() === provider) {
				this._provider.set(undefined, undefined);
			}
		});
	}

	get activeWindow(): IChatWindow | undefined {
		return this.getWindow(getActiveWindow().vscodeWindowId);
	}

	getWindow(windowId: number): IChatWindow | undefined {
		return this._windows.get().find(window => window.windowId === windowId);
	}

	open(chat: URI, options?: IChatWindowOpenOptions): Promise<IChatWindow | undefined> {
		return this._opening.run(chat.toString(), () => this._openOrReveal(chat, options));
	}

	private _windowOfChat(chat: URI): ChatWindow | undefined {
		return this._windows.get().find(window => window.chats.get().some(candidate => isEqual(candidate, chat)));
	}

	private async _openOrReveal(chat: URI, options?: IChatWindowOpenOptions): Promise<IChatWindow | undefined> {
		const opened = this._windowOfChat(chat);
		if (opened) {
			if (options?.preserveFocus) {
				opened.activateChat(chat);
			} else {
				opened.revealChat(chat);
			}
			return opened;
		}
		const target = options?.window && this._windows.get().find(window => window === options.window);
		if (target) {
			return this._addChat(target, chat, options);
		}
		const provider = this._provider.get();
		if (!provider) {
			return undefined;
		}
		const content = await provider.resolveContent(chat);
		if (!content) {
			return undefined;
		}
		const firstChat = await content.resolveChat(chat);
		// The chat the provider resolved to may show already, such as the main chat of a session.
		const resolved = firstChat && this._windowOfChat(firstChat.chat.get());
		if (!firstChat || resolved) {
			// The window that shows the chat the provider resolved to shows it as its active chat
			const canonical = firstChat?.chat.get();
			firstChat?.dispose();
			content.dispose();
			if (resolved && canonical) {
				if (options?.preserveFocus) {
					resolved.activateChat(canonical);
				} else {
					resolved.revealChat(canonical);
				}
			}
			return resolved;
		}
		return openCleaningUpOnFailure(async opening => {
			opening.disposables.add(content);
			return this._openWindow(provider, content, firstChat, options, opening.disposables, close => opening.close = close);
		});
	}

	/** Shows `chat` in `window`, beside its other chats: in the group of the active chat, as a tab, unless a group is given. */
	private async _addChat(window: ChatWindow, chat: URI, options: IChatWindowOpenOptions | undefined, group?: IEditorGroup, opening = false): Promise<IChatWindow | undefined> {
		const added = await window.content.resolveChat(chat);
		if (!added) {
			return undefined;
		}
		// What the content resolved to may be a chat a window shows already, such as of another resource of its chat; then
		// the entry may be the one that window owns, which stays.
		const owned = this._windows.get().some(candidate => candidate.chatsOfWindow.includes(added));
		const canonical = added.chat.get();
		const shown = this._windowOfChat(canonical);
		if (shown) {
			if (!owned) {
				added.dispose();
			}
			if (options?.preserveFocus) {
				shown.activateChat(canonical);
			} else {
				shown.revealChat(canonical);
			}
			return shown;
		}
		if (!opening && !this._windows.get().includes(window)) {
			if (!owned) {
				added.dispose();
			}
			return undefined;
		}
		window.addChat(added);
		const target = group ?? this._besideGroup(window, options?.beside) ?? window.chatPart.groups.find(candidate => candidate.contains(window.chatEditor)) ?? window.chatPart.activeGroup;
		await target.openEditor(added.input, { pinned: true, preserveFocus: options?.preserveFocus, inactive: options?.preserveFocus });
		return window;
	}

	/** A new group to the right of the group of the window that shows `reference`, one of its chats. */
	private _besideGroup(window: ChatWindow, reference: URI | undefined): IEditorGroup | undefined {
		const input = reference && window.chatsOfWindow.find(chat => isEqual(chat.chat.get(), reference))?.input;
		const referenceGroup = input && this._editorGroupsService.groups.find(group => group.windowId === window.windowId && group.contains(input));
		return referenceGroup ? this._editorGroupsService.addGroup(referenceGroup, GroupDirection.RIGHT) : undefined;
	}

	private async _openWindow(provider: IChatWindowProvider, content: IChatWindowContent, firstChat: IChatWindowChat, options: IChatWindowOpenOptions | undefined, disposables: DisposableStore, setClose: (close: () => boolean) => void): Promise<ChatWindow> {
		// What the window remembers, its layout and the sizes of its parts, is that of the chat it opens for.
		const chat = firstChat.chat.get();
		const rememberedLayout = this._chatLayouts.get(chat);
		const state = new ChatWindowState(new ChatWindowDefaults(this._storageService), {
			initial: rememberedLayout,
			// For the chat the window opened for when the user chooses, which a replaced chat changes.
			set: layout => this._chatLayouts.set(firstChat.chat.get(), layout),
		});

		// The window owns its chats once it exists; until then, the chat it opens for goes away with what failed to open.
		let window: ChatWindow | undefined;
		disposables.add(toDisposable(() => {
			if (!window) {
				firstChat.dispose();
			}
		}));
		const auxiliaryWindow = disposables.add(await this._auxiliaryWindowService.open({ bounds: { ...CHAT_WINDOW_SIZE, ...options?.bounds } }));
		setClose(() => {
			auxiliaryWindow.window.close();
			return true;
		});
		const windowId = auxiliaryWindow.window.vscodeWindowId;
		const container = auxiliaryWindow.container;

		// The window's own context, scoped to the body of its document: keys pressed while no element of the window has
		// focus resolve in it, and never in the main window's.
		const windowContextKeyService = disposables.add(this._contextKeyService.createScoped(auxiliaryWindow.window.document.body));
		disposables.add(bindWindowLayoutContext(windowContextKeyService, state));
		// An auxiliary window: what applies to the main window only, such as its panel and side panel toggles, does not apply here.
		IsAuxiliaryWindowContext.bindTo(windowContextKeyService).set(true);

		// The content's services are the window's own: its parts take the window's context too.
		const services = content.services ?? new ServiceCollection();
		services.set(IContextKeyService, windowContextKeyService);

		// The main part first: it is the window's main part, where what the window opens goes by default.
		// The classes of the window go on its own element: those of the container follow the main window's.
		const host = append(container, $('.chat-window-parts.chat-window'));
		const mainPartElement = append(host, $('.chat-window-main-part'));
		const chatPartElement = append(host, $('.chat-window-chat-part'));
		const look = provider.look;
		const mainPart = this._editorGroupsService.createEditorPart({ container: mainPartElement, label: localize('chatWindow.mainPart', "Editor"), services, groupViewOptions: look.mainPartGroupViewOptions });
		// The groups of the chat part look as those of the main part, such as an editor split beside the chat: the chat's own
		// group shows no title area while it shows only the chat, whose view provides its title.
		const chatPart = this._editorGroupsService.createEditorPart({ container: chatPartElement, label: localize('chatWindow.chatPart', "Chat"), services, state: options?.chatPart?.state, groupViewOptions: getChatPartGroupViewOptions(look.mainPartGroupViewOptions, editor => !!window?.isChatEditor(editor) || editor === firstChat.input) });
		if (look.mainPartOptions) {
			const mainPartOptions = look.mainPartOptions;
			for (const part of [mainPart, chatPart]) {
				const enforced = disposables.add(new MutableDisposable());
				disposables.add(autorun(reader => enforced.value = part.enforcePartOptions(mainPartOptions.read(reader))));
			}
		}
		chatPartElement.setAttribute('role', 'main');
		const mainPartContextKeyService = this._editorGroupsService.getScopedInstantiationService(mainPart).invokeFunction(accessor => accessor.get(IContextKeyService));
		disposables.add(bindChatWindowPartsVisible(windowContextKeyService, mainPartContextKeyService, state.layoutMode));
		let unloading = false;
		disposables.add(auxiliaryWindow.onUnload(() => unloading = true));
		// What shows in its other parts, such as terminals, leaves the window as it unloads, before its parts close.
		disposables.add(Event.once(auxiliaryWindow.onUnload)(() => window?.willUnload()));
		// Closes the parts as the window unloads, unless the chat window closed them first.
		const partsBinding = disposables.add(bindEditorPartsToWindow(auxiliaryWindow, [chatPart, mainPart], this._editorGroupsService));
		const gridRef = observableValue<ChatWindowGrid | undefined>(this, undefined);

		const editorGroupsService = this._editorGroupsService;
		// A group of the window becoming active, in any of its parts, or getting focus, also the active group of its part
		const groupActivation = disposables.add(new Emitter<IEditorGroup>());
		disposables.add(Event.filter(this._editorGroupsService.onDidChangeActiveGroup, group => group.windowId === windowId)(group => groupActivation.fire(group)));
		const groupFocus = disposables.add(new DisposableMap<IEditorGroup>());
		const trackGroupFocus = (group: IEditorGroup) => {
			if (group.windowId === windowId) {
				groupFocus.set(group, (group as IEditorGroupView).onDidFocus(() => groupActivation.fire(group)));
			}
		};
		this._editorGroupsService.groups.forEach(trackGroupFocus);
		disposables.add(this._editorGroupsService.onDidAddGroup(trackGroupFocus));
		disposables.add(this._editorGroupsService.onDidRemoveGroup(group => groupFocus.deleteAndDispose(group)));
		const chatWindow: ChatWindow = window = disposables.add(new ChatWindow(windowId, content, firstChat, state, mainPart, chatPart, {
			focusWindow: () => {
				if (!auxiliaryWindow.window.document.hasFocus()) {
					void this._hostService.focus(auxiliaryWindow.window);
				}
			},
			closeWindow: () => {
				partsBinding.dispose();
				auxiliaryWindow.window.close();
			},
			isUnloading: () => unloading,
			setClosing: closing => gridRef.get()?.setClosing(closing),
			mainWindowGroup: () => this._editorGroupsService.mainPart.activeGroup.id,
			didMoveChatOut: () => void this._didMoveChatOut(chatWindow),
			didMoveOneChatOut: (movedChat, input) => void this._didMoveOneChatOut(movedChat, input),
			findGroup: editor => this._findGroup(editor),
			showMoveVeto: message => this._dialogService.error(message),
			resetLayout: () => {
				this._chatLayouts.delete(firstChat.chat.get());
				this._chatSizes.delete(firstChat.chat.get());
				gridRef.get()?.reset();
			},
			windowGroups: {
				get groups() { return editorGroupsService.groups.filter(group => group.windowId === windowId); },
				onDidAddGroup: Event.filter(this._editorGroupsService.onDidAddGroup, group => group.windowId === windowId),
				onDidRemoveGroup: Event.filter(this._editorGroupsService.onDidRemoveGroup, group => group.windowId === windowId),
				onDidActivateGroup: groupActivation.event,
			},
			createTerminalsPart: () => {
				// Its groups stay locked to its terminals, as terminal groups lock, so that other editors open elsewhere: like the
				// main window's panel, it offers no action to unlock them.
				const part = this._editorGroupsService.createEditorPart({ container: append(host, $('.chat-window-terminals-part')), label: localize('chatWindow.terminalsPart', "Terminals"), services, groupViewOptions: getTerminalsPartGroupViewOptions(look.mainPartGroupViewOptions) });
				const store = new DisposableStore();
				disposables.add(store);
				if (look.mainPartOptions) {
					const partOptions = look.mainPartOptions;
					const enforced = store.add(new MutableDisposable());
					store.add(autorun(reader => enforced.value = part.enforcePartOptions(partOptions.read(reader))));
				}
				Event.once(part.onWillClose)(() => store.dispose());
				return part;
			},
			terminalsVisible: derived(this, reader => gridRef.read(reader)?.terminalsVisible.read(reader) ?? false),
			chatPartLeads: derived(this, reader => gridRef.read(reader)?.chatLeads.read(reader) ?? false),
			resizing: derived(this, reader => gridRef.read(reader)?.resizing.read(reader) ?? false),
		}));
		disposables.add(bindWindowTerminalsContext(windowContextKeyService, { terminalsVisible: chatWindow.terminalsVisible, terminalPosition: state.terminalPosition }));

		// The provider's chrome, with the window's services: its title row first in the window, its strip last.
		const windowInstantiationService = disposables.add(this._instantiationService.createChild(services));
		// The main window's editors move in before the content binds to the window, which takes the chat's session out of
		// the main window, and with it the editors the main window shows for it.
		moveEditorsToChatWindow(options?.editors?.moveFrom ?? [], mainPart.activeGroup);
		if (content.bind) {
			disposables.add(content.bind(chatWindow, windowInstantiationService));
		}
		const titleRowElement = host.insertBefore($('.chat-window-title-row'), host.firstChild);
		const stripElement = append(host, $('.chat-window-strip'));
		const titleRow = provider.chrome?.createTitleRow?.(chatWindow, titleRowElement, windowInstantiationService);
		const strip = provider.chrome?.createStrip?.(chatWindow, stripElement, windowInstantiationService);
		for (const [chrome, element] of [[titleRow, titleRowElement], [strip, stripElement]] as const) {
			if (chrome) {
				disposables.add(chrome);
			} else {
				element.remove();
			}
		}

		if (look.className) {
			host.classList.add(look.className);
		}
		// While something is dragged, such as an editor from this window or the main window, the window says so, so that
		// regions that move the window, such as the empty space of a tab row at its top, take the drop instead.
		disposables.add(bindDraggingClass(host, [auxiliaryWindow.window, mainWindow]));
		// Parts for editors dropped on an edge of the window, like its main part
		const partFactory = disposables.add(this._instantiationService.createInstance(ChatWindowPartFactory, auxiliaryWindow, services, look));
		const grid = disposables.add(this._instantiationService.createInstance(ChatWindowGrid, host, {
			main: mainPart,
			chat: chatPart,
			titleRow: titleRow && { element: titleRowElement, visible: titleRow.visible, size: titleRow.size, layout: (width, height) => titleRow.layout(width, height) },
			strip: strip && { element: stripElement, visible: strip.visible, size: strip.size, layout: (width, height) => strip.layout(width, height) },
			terminals: chatWindow.terminalsPart,
			chatInputOnly: derived(reader => state.layoutMode.read(reader) === ChatWindowLayoutMode.Stacked && state.inputOnly.read(reader)),
		}, state.layoutMode, look.gap, this._chatSizes.get(chat), state.terminalPosition, partFactory));
		gridRef.set(grid, undefined);
		// As the window goes away, after its chat part and main part closed and before the part that holds its terminals does
		disposables.add(chatWindow.onWillClose(() => grid.willClose()));
		this._grids.set(chatWindow, grid);
		disposables.add(toDisposable(() => this._grids.delete(chatWindow)));
		// What the window shows is what it shows again for its chat: the sizes of its parts per arrangement.
		const saveSizes = () => this._chatSizes.set(firstChat.chat.get(), grid.exportSizes());
		disposables.add(this._storageService.onWillSaveState(saveSizes));
		disposables.add(auxiliaryWindow.onBeforeUnload(saveSizes));
		if (look.paintChatBackground) {
			disposables.add(look.paintChatBackground(chatPartElement));
		}
		const outerInsets = look.outerInsets;
		if (outerInsets) {
			disposables.add(autorun(reader => grid.setOuterInsets(outerInsets.read(reader))));
		}
		disposables.add(auxiliaryWindow.onWillLayout(dimension => grid.layout(dimension.width, dimension.height)));
		// Again once the styles of the window have loaded, which draw the frames of its cards: the parts are inside them.
		auxiliaryWindow.whenStylesHaveLoaded.then(() => {
			if (!disposables.isDisposed) {
				auxiliaryWindow.layout();
			}
		});

		disposables.add(autorun(reader => {
			auxiliaryWindow.window.document.title = chatWindow.title.read(reader);
		}));

		// Before what the window waits for as it opens: it may go away meanwhile.
		disposables.add(Event.once(auxiliaryWindow.onUnload)(() => {
			chatWindow.didClose();
			disposables.dispose();
		}));

		// With the groups of the chat part it showed before, the chat goes back into its own group among them
		const chatGroup = getRestoredChatGroup(chatPart, options?.chatPart);
		chatPart.activateGroup(chatGroup);
		// First in its group, before the editors beside it there, as tabs, if any
		await chatGroup.openEditor(firstChat.input, { pinned: true, preserveFocus: options?.preserveFocus, index: 0 });
		// Its other chats, in theirs, behind the one it opens for
		for (const [index, other] of (options?.chats ?? []).entries()) {
			await this._addChat(chatWindow, other, { preserveFocus: true }, getRestoredChatGroup(chatPart, options?.chatPart, index), true);
		}
		await this._openEditors(options?.editors, mainPart);
		await this._openCreatedParts(options?.createdParts, mainPart, grid);
		showChatInsteadOfEmptyMainPart(mainPart, chatWindow, !rememberedLayout);
		if (options?.showTerminals) {
			chatWindow.getOrCreateTerminalsPart();
		}

		// The window went away while it opened, such as when the user closed it: it is not one of the chat windows.
		if (disposables.isDisposed) {
			throw new CancellationError();
		}
		this._windows.set([...this._windows.get(), chatWindow], undefined);
		disposables.add(toDisposable(() => this._remove(chatWindow)));
		disposables.add(chatWindow.onDidClose(() => this._remove(chatWindow)));
		// The window closes with the workbench, such as as it reloads, as editor windows do; it opens again as it restores.
		disposables.add(Event.once(this._lifecycleService.onDidShutdown)(() => disposables.dispose()));

		auxiliaryWindow.layout();
		if (!options?.preserveFocus) {
			chatWindow.focus();
		}
		content.didShow?.(chatWindow, !options?.preserveFocus);
		return chatWindow;
	}

	/**
	 * Opens each part the window created before, with its editors, as such parts are created: its editors move into a new
	 * part at the edge of the window, where such parts go as the window's parts are arranged. Where the window creates no
	 * parts, its editors stay in its main part.
	 */
	private async _openCreatedParts(createdParts: readonly IChatWindowEditors[] | undefined, mainPart: IContentPart, grid: ChatWindowGrid): Promise<void> {
		for (const created of createdParts ?? []) {
			await this._openEditors(created, mainPart);
			const group = mainPart.activeGroup;
			const editors = (created.editors ?? []).filter(editor => group.contains(editor)).map(editor => ({ editor, groupId: group.id }));
			if (editors.length) {
				grid.partGrid?.moveEditorsIntoNewPart(editors, { edge: Direction.Right });
			}
		}
	}

	private async _openEditors(editors: IChatWindowEditors | undefined, part: IContentPart): Promise<void> {
		const inputs = editors?.editors ?? [];
		const active = editors?.activeEditor ?? inputs.at(-1);
		await part.activeGroup.openEditors(inputs.map(editor => ({ editor, options: { pinned: true, preserveFocus: true, inactive: editor !== active } })));
	}

	private _findGroup(editor: EditorInput): IEditorGroup | undefined {
		return findGroupShowing(this._editorGroupsService.parts.flatMap(part => part.groups), editor);
	}

	private _remove(window: ChatWindow): void {
		const windows = this._windows.get();
		if (windows.includes(window)) {
			this._windows.set(windows.filter(candidate => candidate !== window), undefined);
		}
	}

	/**
	 * The chat's editor of `window` moved out of it: into the main window, the chat moves to the main window, as Move to
	 * Main Window does; into another window, such as an editor window, the chat shows in a chat window of its own again,
	 * with the editors and terminals the window showed. Either way the editor that moved, a view of the chat, closes where
	 * it moved to.
	 */
	private async _didMoveChatOut(window: ChatWindow): Promise<void> {
		const input = window.chatEditor;
		const group = this._findGroup(input);
		if (group) {
			await group.closeEditor(input);
		}
		if (group?.windowId === mainWindow.vscodeWindowId) {
			await this.moveToMainWindow(window);
		} else {
			await reopenChatWindow(window, this._instantiationService, (chat, options) => this.open(chat, options), { chatPart: window.captureChatPart(), createdParts: this._grids.get(window)?.createdParts ?? [] });
		}
	}

	/**
	 * The editor of `chat`, one of several chats of a window, moved out of it, which keeps its other chats: the editor that
	 * moved, a view of the chat, closes where it moved to, and the chat shows there instead. Into the main window, the chat
	 * moves to the main window, without the window's editors; into another chat window, it shows there, beside that
	 * window's chats; anywhere else, such as an editor window, it shows in a chat window of its own.
	 */
	private async _didMoveOneChatOut(chat: URI, input: EditorInput): Promise<void> {
		const group = this._findGroup(input);
		if (group) {
			await group.closeEditor(input);
		}
		const provider = this._provider.get();
		const target = group && this._windows.get().find(window => window.windowId === group.windowId);
		if (group?.windowId === mainWindow.vscodeWindowId) {
			await provider?.moveToMainWindow([chat], {});
		} else if (target) {
			await this._addChat(target, chat, undefined, group);
		} else {
			await this.open(chat);
		}
	}

	async moveToMainWindow(window: IChatWindow): Promise<void> {
		const chatWindow = this._windows.get().find(candidate => candidate === window);
		const provider = this._provider.get();
		if (!chatWindow || !provider) {
			return;
		}
		// Its active chat first, as the one the main window then shows active
		const active = chatWindow.chat.get();
		const chats = [...chatWindow.chats.get()].sort((a, b) => Number(isEqual(b, active)) - Number(isEqual(a, active)));
		// Serialized, as closing the chat window disposes them, and opened again in the main window
		const serialized = serializeChatWindowEditorsBesideChat(chatWindow, this._grids.get(chatWindow)?.createdParts ?? []);
		if (!chatWindow.close()) {
			return;
		}
		await provider.moveToMainWindow(chats, deserializeChatWindowEditors(this._instantiationService, serialized));
	}
}

