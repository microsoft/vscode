/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, getActiveWindow } from '../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { EditorCloseContext } from '../../../common/editor.js';
import { IAuxiliaryWindowService } from '../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { bindEditorPartsToWindow } from '../../../services/editor/browser/editorPartWindowBinding.js';
import { IContentPart, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { ChatWindowLayoutCell, ChatWindowLayoutMode, ChatWindowSplitLayout } from '../common/chatWindowLayout.js';
import { ChatWindowChatLayouts, ChatWindowDefaults, ChatWindowState } from '../common/chatWindowState.js';
import { IChatWindow, IChatWindowContent, IChatWindowEditors, IChatWindowOpenOptions, IChatWindowProvider, IChatWindowService } from './chatWindow.js';
import { bindWindowLayoutContext } from './chatWindowContextKeys.js';
import { deserializeChatWindowEditors, serializeChatWindowEditors } from './chatWindowEditors.js';
import { InFlightOperations, openCleaningUpOnFailure } from './chatWindowOpening.js';
import { bindMainPartVisible, moveEditorsToChatWindow, showChatInsteadOfEmptyMainPart, trackMainPartEditors } from './chatWindowParts.js';
import { ChatWindowPartsLayout } from './chatWindowPartsLayout.js';
import { ChatWindowsRestoration } from './chatWindowsRestoration.js';

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
}

/**
 * An open chat window: its chat part, which shows the chat's editor, its main part, and the state that lays them out.
 *
 * - its main part shows when an editor opens in it, and the window shows only its chat once its last editor closes;
 * - closing the chat's editor, such as with Close Editor, closes the window, as do the end of its chat and closing it;
 * - closing it closes its parts, which moves the editors that need confirmation to close to the main window.
 */
export class ChatWindow extends Disposable implements IChatWindow {

	private readonly _onDidClose = this._register(new Emitter<void>());
	readonly onDidClose: Event<void> = this._onDidClose.event;

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

		// The chat's editor is the chat window: closing it closes the window.
		this._register(Event.any(...chatPart.groups.map(group => Event.filter(group.onDidCloseEditor, e => e.editor === content.input && e.context !== EditorCloseContext.MOVE)))(() => {
			if (!this._closing && !this._host.isUnloading()) {
				this.close();
			}
		}));

		this._register(content.onDidEnd(() => this.close()));
	}

	get chat(): IObservable<URI> { return this.content.chat; }
	get title(): IObservable<string> { return this.content.title; }
	get layoutMode(): IObservable<ChatWindowLayoutMode> { return this.state.layoutMode; }
	get splitLayout(): IObservable<ChatWindowSplitLayout> { return this.state.splitLayout; }
	get inputOnly(): IObservable<boolean> { return this.state.inputOnly; }

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
		this._closed = true;
		this._host.closeWindow();
		this._onDidClose.fire();
		return true;
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

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IStorageService private readonly _storageService: IStorageService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IAuxiliaryWindowService private readonly _auxiliaryWindowService: IAuxiliaryWindowService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IHostService private readonly _hostService: IHostService,
	) {
		super();
		this.hasProvider = this._provider.map(provider => !!provider);
		this._chatLayouts = new ChatWindowChatLayouts(_storageService);
		this._register(this._instantiationService.createInstance(ChatWindowsRestoration, {
			provider: this._provider,
			windows: this._windows,
			open: (chat: URI, options: IChatWindowOpenOptions) => this.open(chat, options),
			terminalsShown: () => false,
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
		container.classList.add('chat-window');

		// The window's own context, scoped to the body of its document: keys pressed while no element of the window has
		// focus resolve in it, and never in the main window's.
		const windowContextKeyService = disposables.add(this._contextKeyService.createScoped(auxiliaryWindow.window.document.body));
		disposables.add(bindWindowLayoutContext(windowContextKeyService, state));

		// The content's services are the window's own: its parts take the window's context too.
		const services = content.services ?? new ServiceCollection();
		services.set(IContextKeyService, windowContextKeyService);

		// The main part first: it is the window's main part, where what the window opens goes by default.
		const host = append(container, $('.chat-window-parts'));
		const mainPartElement = append(host, $('.chat-window-main-part'));
		const chatPartElement = append(host, $('.chat-window-chat-part'));
		const mainPart = this._editorGroupsService.createEditorPart({ container: mainPartElement, label: localize('chatWindow.mainPart', "Editor"), services });
		const chatPart = this._editorGroupsService.createEditorPart({ container: chatPartElement, label: localize('chatWindow.chatPart', "Chat"), services });
		chatPartElement.setAttribute('role', 'main');
		disposables.add(bindMainPartVisible(windowContextKeyService, state.layoutMode));
		let unloading = false;
		disposables.add(auxiliaryWindow.onUnload(() => unloading = true));
		// Closes the parts as the window unloads, unless the chat window closed them first.
		const partsBinding = disposables.add(bindEditorPartsToWindow(auxiliaryWindow, [chatPart, mainPart], this._editorGroupsService));

		const look = provider.look;
		const partsLayout = disposables.add(new ChatWindowPartsLayout(new Map([
			[ChatWindowLayoutCell.SidePane, { element: mainPartElement, layout: (width, height, top, left) => mainPart.layout(width, height, top, left) }],
			[ChatWindowLayoutCell.Chat, { element: chatPartElement, layout: (width, height, top, left) => chatPart.layout(width, height, top, left) }],
		]), state.layoutMode, look.gap));
		if (look.paintChatBackground) {
			disposables.add(look.paintChatBackground(chatPartElement));
		}
		disposables.add(auxiliaryWindow.onWillLayout(dimension => partsLayout.layout(dimension.width, dimension.height)));

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
		}));

		disposables.add(autorun(reader => {
			auxiliaryWindow.window.document.title = content.title.read(reader);
		}));

		await chatPart.activeGroup.openEditor(content.input, { pinned: true, preserveFocus: options?.preserveFocus });
		moveEditorsToChatWindow(options?.editors?.moveFrom ?? [], mainPart.activeGroup);
		await this._openEditors(options?.editors, mainPart);
		showChatInsteadOfEmptyMainPart(mainPart, window);

		this._windows.set([...this._windows.get(), window], undefined);
		disposables.add(toDisposable(() => this._remove(window)));
		disposables.add(window.onDidClose(() => this._remove(window)));
		disposables.add(Event.once(auxiliaryWindow.onUnload)(() => {
			window.didClose();
			disposables.dispose();
		}));

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

