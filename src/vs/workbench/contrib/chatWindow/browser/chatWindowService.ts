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
import { autorun, derived, IObservable, observableSignal, observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IEditorGroupViewOptions } from '../../../browser/parts/editor/editor.js';
import { IsAuxiliaryWindowContext } from '../../../common/contextkeys.js';
import { EditorCloseContext, EditorsOrder, GroupIdentifier, GroupModelChangeKind } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IAuxiliaryWindowService } from '../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { bindEditorPartsToWindow } from '../../../services/editor/browser/editorPartWindowBinding.js';
import { GroupsOrder, IContentPart, IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { ChatWindowLayoutMode, ChatWindowSplitLayout, ChatWindowTerminalPosition } from '../common/chatWindowLayout.js';
import { ChatWindowChatLayouts, ChatWindowChatSizes, ChatWindowDefaults, ChatWindowState } from '../common/chatWindowState.js';
import { IChatWindow, IChatWindowChatPart, IChatWindowContent, IChatWindowEditors, IChatWindowOpenOptions, IChatWindowProvider, IChatWindowService } from './chatWindow.js';
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
 * The options of the groups of a chat window's chat part: those of its main part, but for the header of the group of the
 * chat while the chat shows, as the chat shows its own; such as with another editor beside it, as a tab.
 */
export function getChatPartGroupViewOptions(mainPartGroupViewOptions: IEditorGroupViewOptions | undefined, chat: EditorInput): IEditorGroupViewOptions | undefined {
	if (!mainPartGroupViewOptions) {
		return undefined;
	}
	const showHeaderFor = mainPartGroupViewOptions.showHeaderFor;
	return { ...mainPartGroupViewOptions, showHeaderFor: editor => editor !== chat && (showHeaderFor?.(editor) ?? true) };
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
	/** The chat's editor moved out of the window, such as into the main window or into an editor window. */
	didMoveChatOut(): void;
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
 * An open chat window: its chat part, which shows the chat's editor, its main part, and the state that lays them out.
 *
 * - its main part shows when an editor opens in it, and the window shows only its chat once its last editor closes;
 * - closing the chat's editor, such as with Close Editor, closes the window, as do the end of its chat and closing it;
 * - closing it closes its parts, which moves the editors that need confirmation to close to the main window.
 */
export class ChatWindow extends Disposable implements IChatWindow {

	private readonly _onWillClose = this._register(new Emitter<void>());
	readonly onWillClose: Event<void> = this._onWillClose.event;

	private readonly _onDidClose = this._register(new Emitter<void>());
	readonly onDidClose: Event<void> = this._onDidClose.event;

	private readonly _terminalsPart = observableValue<IContentPart | undefined>(this, undefined);
	readonly terminalsPart: IObservable<IContentPart | undefined> = this._terminalsPart;

	readonly chatLeads: IObservable<boolean>;

	/** The groups of its chat part besides the chat's own, such as an editor split beside the chat, to show them again. */
	captureChatPart(): IChatWindowChatPart | undefined {
		return captureChatPart(this.chatPart, this.content.input);
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
		readonly state: ChatWindowState,
		readonly mainPart: IContentPart,
		readonly chatPart: IContentPart,
		private readonly _host: IChatWindowHost,
	) {
		super();

		const isChatIn = (groups: readonly IEditorGroup[]) => groups.some(group => group.contains(content.input));
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
			const first = chatPart.getGroups(GroupsOrder.GRID_APPEARANCE)[0];
			return _host.chatPartLeads.read(reader) && first?.count === 1 && first.activeEditor === content.input;
		});
		// Any editor that opens or closes in a group of the window, beside the chat or not
		const trackChatGroup = (group: IEditorGroup) => chatGroupListeners.set(group, combinedDisposable(group.onDidActiveEditorChange(() => chatMoved.trigger(undefined)), group.onDidModelChange(e => {
			if (e.kind === GroupModelChangeKind.EDITOR_OPEN || e.editor === content.input) {
				chatMoved.trigger(undefined);
			}
		}), group.onDidCloseEditor(e => {
			chatMoved.trigger(undefined);
			if (e.editor !== content.input || this._closing || this._host.isUnloading()) {
				return;
			}
			if (e.context !== EditorCloseContext.MOVE) {
				// Once the editor closed: closing the window closes the part whose group still closes the editor.
				disposableTimeout(() => this.close(), 0, this._store);
			} else if (!this._findChatGroup()) {
				this._host.didMoveChatOut();
			}
		})));
		windowGroups.groups.forEach(trackChatGroup);
		this._register(windowGroups.onDidAddGroup(trackChatGroup));
		this._register(windowGroups.onDidRemoveGroup(group => chatGroupListeners.deleteAndDispose(group)));

		this._register(content.onDidEnd(() => this.close()));
	}

	get chat(): IObservable<URI> { return this.content.chat; }
	get chatEditor(): EditorInput { return this.content.input; }
	get title(): IObservable<string> { return this.content.title; }
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
	 * Moves the chat's editor back into the chat part, before the window shows as a layout says: a layout shows the
	 * window's parts as the chat part showing the chat, so that the chat never hides with the part it was dropped into.
	 */
	private _returnChat(): void {
		const group = this._findChatGroup();
		if (group && !this.chatPart.groups.includes(group)) {
			group.moveEditor(this.content.input, this.chatPart.activeGroup, { preserveFocus: true });
		}
	}

	/** Shows the chat where another editor beside it, as a tab of its group, shows: a layout that shows the chat shows it. */
	private _revealChat(): void {
		const group = this._findChatGroup();
		if (group && group.activeEditor !== this.content.input) {
			void group.openEditor(this.content.input, { preserveFocus: true });
		}
	}

	/** The group of the window that holds the chat's editor, in whichever of its parts it is. */
	private _findChatGroup(): IEditorGroup | undefined {
		return this._windowGroups.groups.find(group => group.contains(this.content.input));
	}

	/** Focuses the chat while it shows, else the main part, so that focusing a window that shows only its main part keeps it so. */
	focus(): void {
		this._host.focusWindow();
		if (this.chatVisible) {
			// The chat, also where another editor beside it, as a tab, shows: opening its editor there shows and focuses it
			const group = this._findChatGroup() ?? this.chatPart.activeGroup;
			if (group.activeEditor !== this.content.input && group.contains(this.content.input)) {
				void group.openEditor(this.content.input);
			} else {
				group.focus();
			}
		} else {
			this.mainPart.activeGroup.focus();
		}
	}

	close(): boolean {
		if (this._closed) {
			return true;
		}
		// All or nothing, from the start: while an editor cannot move to the main window, nothing moves or closes, also not
		// the editors that would close without asking as their part closes.
		if (!this._canEditorsLeave()) {
			return false;
		}
		this._closing = true;
		this._host.setClosing?.(true);
		// All or nothing: what the chat part shows beside the chat, such as an editor dropped beside it, moves into the main
		// part first, so that the chat part, then holding only the chat, which closes without asking, closes once the main
		// part did. The main part closes first: when an editor cannot move to the main window, the window stays as it was,
		// its chat too, and the editors that moved go back beside the chat.
		const moved = this._moveEditorsBesideChatToMainPart();
		if (!this._chatPartHoldsOnlyChat() || !this.mainPart.close()) {
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

	/** Whether every editor of the main part and the chat part, but the chat, can move to the main window; shows the first that cannot. */
	private _canEditorsLeave(): boolean {
		const target = this._host.mainWindowGroup?.();
		if (target === undefined) {
			return true;
		}
		for (const group of [...this.mainPart.groups, ...this.chatPart.groups]) {
			for (const editor of group.getEditors(EditorsOrder.SEQUENTIAL)) {
				if (editor !== this.content.input && typeof editor.canMove(group.id, target) === 'string') {
					void group.openEditor(editor);
					return false;
				}
			}
		}
		return true;
	}

	/** Moves the editors of the chat part other than the chat into the main part, those that can move. */
	private _moveEditorsBesideChatToMainPart(): { moveBack(): void } {
		const moved: { readonly editor: EditorInput; readonly from: IEditorGroup }[] = [];
		for (const group of this.chatPart.groups) {
			for (const editor of group.getEditors(EditorsOrder.SEQUENTIAL).filter(editor => editor !== this.content.input)) {
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

	/** Whether the chat part holds only the chat: not while an editor that cannot move stays beside it. */
	private _chatPartHoldsOnlyChat(): boolean {
		return this.chatPart.groups.every(group => group.getEditors(EditorsOrder.SEQUENTIAL).every(editor => editor === this.content.input));
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

	private async _openOrReveal(chat: URI, options?: IChatWindowOpenOptions): Promise<IChatWindow | undefined> {
		const opened = this._windows.get().find(window => isEqual(window.chat.get(), chat));
		if (opened) {
			if (!options?.preserveFocus) {
				opened.focus();
			}
			return opened;
		}
		const provider = this._provider.get();
		if (!provider) {
			return undefined;
		}
		const content = await provider.resolveContent(chat);
		if (!content) {
			return undefined;
		}
		// The chat the provider resolved to may show already, such as the main chat of a session.
		const resolved = this._windows.get().find(window => isEqual(window.chat.get(), content.chat.get()));
		if (resolved) {
			content.dispose();
			if (!options?.preserveFocus) {
				resolved.focus();
			}
			return resolved;
		}
		return openCleaningUpOnFailure(async opening => {
			opening.disposables.add(content);
			return this._openWindow(provider, content, options, opening.disposables, close => opening.close = close);
		});
	}

	private async _openWindow(provider: IChatWindowProvider, content: IChatWindowContent, options: IChatWindowOpenOptions | undefined, disposables: DisposableStore, setClose: (close: () => boolean) => void): Promise<ChatWindow> {
		const chat = content.chat.get();
		const rememberedLayout = this._chatLayouts.get(chat);
		const state = new ChatWindowState(new ChatWindowDefaults(this._storageService), {
			initial: rememberedLayout,
			// For the chat the window shows when the user chooses, which a replaced chat changes.
			set: layout => this._chatLayouts.set(content.chat.get(), layout),
		});

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
		const chatPart = this._editorGroupsService.createEditorPart({ container: chatPartElement, label: localize('chatWindow.chatPart', "Chat"), services, state: options?.chatPart?.state, groupViewOptions: getChatPartGroupViewOptions(look.mainPartGroupViewOptions, content.input) });
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
		disposables.add(Event.once(auxiliaryWindow.onUnload)(() => window.willUnload()));
		// Closes the parts as the window unloads, unless the chat window closed them first.
		const partsBinding = disposables.add(bindEditorPartsToWindow(auxiliaryWindow, [chatPart, mainPart], this._editorGroupsService));
		const gridRef = observableValue<ChatWindowGrid | undefined>(this, undefined);

		const editorGroupsService = this._editorGroupsService;
		const window: ChatWindow = disposables.add(new ChatWindow(windowId, content, state, mainPart, chatPart, {
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
			didMoveChatOut: () => void this._didMoveChatOut(window),
			resetLayout: () => {
				this._chatLayouts.delete(content.chat.get());
				this._chatSizes.delete(content.chat.get());
				gridRef.get()?.reset();
			},
			windowGroups: {
				get groups() { return editorGroupsService.groups.filter(group => group.windowId === windowId); },
				onDidAddGroup: Event.filter(this._editorGroupsService.onDidAddGroup, group => group.windowId === windowId),
				onDidRemoveGroup: Event.filter(this._editorGroupsService.onDidRemoveGroup, group => group.windowId === windowId),
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
		disposables.add(bindWindowTerminalsContext(windowContextKeyService, { terminalsVisible: window.terminalsVisible, terminalPosition: state.terminalPosition }));

		// The provider's chrome, with the window's services: its title row first in the window, its strip last.
		const windowInstantiationService = disposables.add(this._instantiationService.createChild(services));
		// The main window's editors move in before the content binds to the window, which takes the chat's session out of
		// the main window, and with it the editors the main window shows for it.
		moveEditorsToChatWindow(options?.editors?.moveFrom ?? [], mainPart.activeGroup);
		if (content.bind) {
			disposables.add(content.bind(window, windowInstantiationService));
		}
		const titleRowElement = host.insertBefore($('.chat-window-title-row'), host.firstChild);
		const stripElement = append(host, $('.chat-window-strip'));
		const titleRow = provider.chrome?.createTitleRow?.(window, titleRowElement, windowInstantiationService);
		const strip = provider.chrome?.createStrip?.(window, stripElement, windowInstantiationService);
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
			terminals: window.terminalsPart,
			chatInputOnly: derived(reader => state.layoutMode.read(reader) === ChatWindowLayoutMode.Stacked && state.inputOnly.read(reader)),
		}, state.layoutMode, look.gap, this._chatSizes.get(chat), state.terminalPosition, partFactory));
		gridRef.set(grid, undefined);
		// As the window goes away, after its chat part and main part closed and before the part that holds its terminals does
		disposables.add(window.onWillClose(() => grid.willClose()));
		this._grids.set(window, grid);
		disposables.add(toDisposable(() => this._grids.delete(window)));
		// What the window shows is what it shows again for its chat: the sizes of its parts per arrangement.
		const saveSizes = () => this._chatSizes.set(content.chat.get(), grid.exportSizes());
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
			auxiliaryWindow.window.document.title = content.title.read(reader);
		}));

		// Before what the window waits for as it opens: it may go away meanwhile.
		disposables.add(Event.once(auxiliaryWindow.onUnload)(() => {
			window.didClose();
			disposables.dispose();
		}));

		// With the groups of the chat part it showed before, the chat goes back into its own group among them
		const chatGroup = getRestoredChatGroup(chatPart, options?.chatPart);
		chatPart.activateGroup(chatGroup);
		// First in its group, before the editors beside it there, as tabs, if any
		await chatGroup.openEditor(content.input, { pinned: true, preserveFocus: options?.preserveFocus, index: 0 });
		await this._openEditors(options?.editors, mainPart);
		await this._openCreatedParts(options?.createdParts, mainPart, grid);
		showChatInsteadOfEmptyMainPart(mainPart, window, !rememberedLayout);
		if (options?.showTerminals) {
			window.getOrCreateTerminalsPart();
		}

		// The window went away while it opened, such as when the user closed it: it is not one of the chat windows.
		if (disposables.isDisposed) {
			throw new CancellationError();
		}
		this._windows.set([...this._windows.get(), window], undefined);
		disposables.add(toDisposable(() => this._remove(window)));
		disposables.add(window.onDidClose(() => this._remove(window)));
		// The window closes with the workbench, such as as it reloads, as editor windows do; it opens again as it restores.
		disposables.add(Event.once(this._lifecycleService.onDidShutdown)(() => disposables.dispose()));

		auxiliaryWindow.layout();
		if (!options?.preserveFocus) {
			window.focus();
		}
		content.didShow?.(window, !options?.preserveFocus);
		return window;
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
		const input = window.content.input;
		const group = this._editorGroupsService.parts.flatMap(part => part.groups).find(candidate => candidate.contains(input));
		if (group) {
			await group.closeEditor(input);
		}
		if (group?.windowId === mainWindow.vscodeWindowId) {
			await this.moveToMainWindow(window);
		} else {
			await reopenChatWindow(window, this._instantiationService, (chat, options) => this.open(chat, options), { chatPart: window.captureChatPart(), createdParts: this._grids.get(window)?.createdParts ?? [] });
		}
	}

	async moveToMainWindow(window: IChatWindow): Promise<void> {
		const chatWindow = this._windows.get().find(candidate => candidate === window);
		const provider = this._provider.get();
		if (!chatWindow || !provider) {
			return;
		}
		const chat = chatWindow.chat.get();
		// Serialized, as closing the chat window disposes them, and opened again in the main window
		const serialized = serializeChatWindowEditorsBesideChat(chatWindow, this._grids.get(chatWindow)?.createdParts ?? []);
		if (!chatWindow.close()) {
			return;
		}
		await provider.moveToMainWindow(chat, deserializeChatWindowEditors(this._instantiationService, serialized));
	}
}

