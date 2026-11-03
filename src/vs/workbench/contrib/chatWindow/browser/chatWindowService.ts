/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, getActiveWindow } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IEditorGroupViewOptions } from '../../../browser/parts/editor/editor.js';
import { IsAuxiliaryWindowContext } from '../../../common/contextkeys.js';
import { EditorCloseContext } from '../../../common/editor.js';
import { IAuxiliaryWindowService } from '../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { bindEditorPartsToWindow } from '../../../services/editor/browser/editorPartWindowBinding.js';
import { IContentPart, IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { ChatWindowLayoutMode, ChatWindowSplitLayout, ChatWindowTerminalPosition } from '../common/chatWindowLayout.js';
import { ChatWindowChatLayouts, ChatWindowChatSizes, ChatWindowDefaults, ChatWindowState } from '../common/chatWindowState.js';
import { IChatWindow, IChatWindowContent, IChatWindowEditors, IChatWindowOpenOptions, IChatWindowProvider, IChatWindowService } from './chatWindow.js';
import { bindWindowLayoutContext, bindWindowTerminalsContext } from './chatWindowContextKeys.js';
import { deserializeChatWindowEditors, reopenChatWindow, serializeChatWindowEditors } from './chatWindowEditors.js';
import { InFlightOperations, openCleaningUpOnFailure } from './chatWindowOpening.js';
import { bindMainPartVisible, moveEditorsToChatWindow, showChatInsteadOfEmptyMainPart, trackMainPartEditors } from './chatWindowParts.js';
import { ChatWindowGrid } from './chatWindowGrid.js';
import { ChatWindowsRestoration } from './chatWindowsRestoration.js';

/** The options of the groups of the part that holds a chat window's terminals. */
const TERMINALS_PART_GROUP_VIEW_OPTIONS: IEditorGroupViewOptions = { hideLockActions: true };

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
	/** Creates the part that holds the window's terminals, in the window's grid. */
	createTerminalsPart(): IContentPart;
	/** Whether the part that holds the window's terminals shows in the window's grid. */
	readonly terminalsVisible: IObservable<boolean>;
	/** The chat's editor moved out of the window, such as into the main window or into an editor window. */
	didMoveChatOut(): void;
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

	private _willClose = false;

	private _closed = false;
	/** Set while it closes, so that editors closing with it do not change its layout or close it again. */
	private _closing = false;

	constructor(
		readonly windowId: number,
		readonly content: IChatWindowContent,
		readonly state: ChatWindowState,
		readonly mainPart: IContentPart,
		readonly chatPart: IContentPart,
		private readonly _host: IChatWindowHost,
	) {
		super();

		this._register(trackMainPartEditors(mainPart, {
			onDidOpenEditor: () => this.showEditor(),
			onDidCloseLastEditor: () => this.state.showChatOnly(),
			isClosing: () => this._closing || this._host.isUnloading(),
		}));

		// The chat's editor is the chat window: closing it closes the window, and moving it out of the window takes the
		// chat out of it. It may move between the groups of the chat part, such as when the chat part splits.
		const chatGroupListeners = this._register(new DisposableMap<IEditorGroup>());
		const trackChatGroup = (group: IEditorGroup) => chatGroupListeners.set(group, group.onDidCloseEditor(e => {
			if (e.editor !== content.input || this._closing || this._host.isUnloading()) {
				return;
			}
			if (e.context !== EditorCloseContext.MOVE) {
				// Once the editor closed: closing the window closes the part whose group still closes the editor.
				disposableTimeout(() => this.close(), 0, this._store);
			} else if (!this.chatPart.groups.some(candidate => candidate.contains(content.input)) && !this.mainPart.groups.some(candidate => candidate.contains(content.input))) {
				this._host.didMoveChatOut();
			}
		}));
		chatPart.groups.forEach(trackChatGroup);
		this._register(chatPart.onDidAddGroup(trackChatGroup));
		this._register(chatPart.onDidRemoveGroup(group => chatGroupListeners.deleteAndDispose(group)));

		this._register(content.onDidEnd(() => this.close()));
	}

	get chat(): IObservable<URI> { return this.content.chat; }
	get title(): IObservable<string> { return this.content.title; }
	get layoutMode(): IObservable<ChatWindowLayoutMode> { return this.state.layoutMode; }
	get splitLayout(): IObservable<ChatWindowSplitLayout> { return this.state.splitLayout; }
	get inputOnly(): IObservable<boolean> { return this.state.inputOnly; }
	get terminalPosition(): IObservable<ChatWindowTerminalPosition> { return this.state.terminalPosition; }
	get terminalsVisible(): IObservable<boolean> { return this._host.terminalsVisible; }

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
		this.state.setLayoutMode(mode);
	}

	setSplitLayout(splitLayout: ChatWindowSplitLayout): void {
		this.state.setSplitLayout(splitLayout);
	}

	showChatOnly(): void {
		this.state.showChatOnly();
	}

	toggleConversation(): void {
		if (this.state.layoutMode.get() === ChatWindowLayoutMode.Stacked) {
			this.state.setInputOnly(!this.state.inputOnly.get());
		}
	}

	showEditor(): void {
		if (this.state.layoutMode.get() === ChatWindowLayoutMode.ChatOnly) {
			this.state.showBoth();
		}
	}

	/** Focuses the chat while it shows, else the main part, so that focusing a window that shows only its main part keeps it so. */
	focus(): void {
		this._host.focusWindow();
		if (this.chatVisible) {
			this.chatPart.activeGroup.focus();
		} else {
			this.mainPart.activeGroup.focus();
		}
	}

	close(): boolean {
		if (this._closed) {
			return true;
		}
		this._closing = true;
		// The chat part first: its editor closes, and does not move to the main window.
		if (!this.chatPart.close() || !this.mainPart.close()) {
			this._closing = false;
			return false;
		}
		this.willUnload();
		this._closed = true;
		this._host.closeWindow();
		this._onDidClose.fire();
		return true;
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
		const state = new ChatWindowState(new ChatWindowDefaults(this._storageService), {
			initial: this._chatLayouts.get(chat),
			// For the chat the window shows when the user chooses, which a replaced chat changes.
			set: layout => this._chatLayouts.set(content.chat.get(), layout),
		});

		const auxiliaryWindow = disposables.add(await this._auxiliaryWindowService.open({ bounds: CHAT_WINDOW_SIZE }));
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
		if (look.mainPartOptions) {
			const mainPartOptions = look.mainPartOptions;
			const enforced = disposables.add(new MutableDisposable());
			disposables.add(autorun(reader => enforced.value = mainPart.enforcePartOptions(mainPartOptions.read(reader))));
		}
		const chatPart = this._editorGroupsService.createEditorPart({ container: chatPartElement, label: localize('chatWindow.chatPart', "Chat"), services });
		chatPartElement.setAttribute('role', 'main');
		disposables.add(bindMainPartVisible(windowContextKeyService, state.layoutMode));
		let unloading = false;
		disposables.add(auxiliaryWindow.onUnload(() => unloading = true));
		// What shows in its other parts, such as terminals, leaves the window as it unloads, before its parts close.
		disposables.add(Event.once(auxiliaryWindow.onUnload)(() => window.willUnload()));
		// Closes the parts as the window unloads, unless the chat window closed them first.
		const partsBinding = disposables.add(bindEditorPartsToWindow(auxiliaryWindow, [chatPart, mainPart], this._editorGroupsService));
		const gridRef = observableValue<ChatWindowGrid | undefined>(this, undefined);

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
			didMoveChatOut: () => void this._didMoveChatOut(window),
			createTerminalsPart: () => {
				// Its groups stay locked to its terminals, as terminal groups lock, so that other editors open elsewhere: like the
				// main window's panel, it offers no action to unlock them.
				const part = this._editorGroupsService.createEditorPart({ container: append(host, $('.chat-window-terminals-part')), label: localize('chatWindow.terminalsPart', "Terminals"), services, groupViewOptions: TERMINALS_PART_GROUP_VIEW_OPTIONS });
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
		const grid = disposables.add(new ChatWindowGrid(host, {
			main: mainPart,
			chat: chatPart,
			titleRow: titleRow && { element: titleRowElement, visible: titleRow.visible, size: titleRow.size, layout: (width, height) => titleRow.layout(width, height) },
			strip: strip && { element: stripElement, visible: strip.visible, size: strip.size, layout: (width, height) => strip.layout(width, height) },
			terminals: window.terminalsPart,
		}, state.layoutMode, look.gap, this._chatSizes.get(chat), state.terminalPosition));
		gridRef.set(grid, undefined);
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

		await chatPart.activeGroup.openEditor(content.input, { pinned: true, preserveFocus: options?.preserveFocus });
		await this._openEditors(options?.editors, mainPart);
		showChatInsteadOfEmptyMainPart(mainPart, window);
		if (options?.showTerminals) {
			window.getOrCreateTerminalsPart();
		}

		this._windows.set([...this._windows.get(), window], undefined);
		disposables.add(toDisposable(() => this._remove(window)));
		disposables.add(window.onDidClose(() => this._remove(window)));
		disposables.add(Event.once(auxiliaryWindow.onUnload)(() => {
			window.didClose();
			disposables.dispose();
		}));
		// The window closes with the workbench, such as as it reloads, as editor windows do; it opens again as it restores.
		disposables.add(Event.once(this._lifecycleService.onDidShutdown)(() => disposables.dispose()));

		auxiliaryWindow.layout();
		if (!options?.preserveFocus) {
			window.focus();
		}
		content.didShow?.(window, !options?.preserveFocus);
		return window;
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
			await reopenChatWindow(window, this._instantiationService, (chat, options) => this.open(chat, options));
		}
	}

	async moveToMainWindow(window: IChatWindow): Promise<void> {
		const chatWindow = this._windows.get().find(candidate => candidate === window);
		const provider = this._provider.get();
		if (!chatWindow || !provider) {
			return;
		}
		const chat = chatWindow.chat.get();
		// Serialized, as closing the chat window disposes them, and opened again in the main window.
		const serialized = chatWindow.mainPart.groups.flatMap(group => serializeChatWindowEditors(group));
		if (!chatWindow.close()) {
			return;
		}
		await provider.moveToMainWindow(chat, deserializeChatWindowEditors(this._instantiationService, serialized));
	}
}

