/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IGridEdgeInsets } from '../../../browser/parts/partGrid/partGridGap.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { DeepPartial } from '../../../../base/common/types.js';
import { IEditorGroupViewOptions } from '../../../browser/parts/editor/editor.js';
import { IEditorPartOptions } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IContentPart, IEditorGroup, IEditorPart } from '../../../services/editor/common/editorGroupsService.js';
import { ChatWindowLayoutMode, ChatWindowSplitLayout, ChatWindowTerminalPosition } from '../common/chatWindowLayout.js';

export const IChatWindowService = createDecorator<IChatWindowService>('chatWindowService');

/** The editors a chat window's main part starts with. */
export interface IChatWindowEditors {
	/** Groups whose editors move into the main part as the window opens, such as the main window's for its chat. */
	readonly moveFrom?: readonly IEditorGroup[];
	/** Editors that open in the main part as the window opens, such as those it showed when it last closed. */
	readonly editors?: readonly EditorInput[];
	/** The one of {@link editors} that is active; by default the last one. */
	readonly activeEditor?: EditorInput;
}

/** Options for opening a chat window. */
export interface IChatWindowOpenOptions {
	/** Whether to open it without focusing it, such as when restoring it. */
	readonly preserveFocus?: boolean;
	/** The editors its main part starts with. */
	readonly editors?: IChatWindowEditors;
	/**
	 * Whether to show its terminals as it opens: the window creates the part that holds its terminals, which the feature
	 * that shows terminals fills (see {@link IChatWindow.getOrCreateTerminalsPart}). It hides while it has none.
	 */
	readonly showTerminals?: boolean;
}

/**
 * The content facet: what a chat window shows for a chat, resolved once per window by its provider. Disposed when the
 * window closes.
 */
export interface IChatWindowContent extends IDisposable {
	/**
	 * The chat the window shows. It changes when the provider replaces the chat, such as when its resource changes: the
	 * window then shows, restores and reveals as the replacement.
	 */
	readonly chat: IObservable<URI>;
	/** The editor that shows the chat in the window's chat part, such as a view editor. */
	readonly input: EditorInput;
	/** The title of the window. */
	readonly title: IObservable<string>;
	/** Services scoped to the window, created for it: what its chat, its parts and its chrome act on. */
	readonly services?: ServiceCollection;
	/** Fires when the chat is gone, such as deleted or archived: the window closes. */
	readonly onDidEnd: Event<void>;
	/**
	 * Called once the window's services exist, before its parts show anything: `instantiationService` has the window's
	 * services, those of its content and the window's context, such as to bind what the window shows on that context.
	 * Unbound with what it returns, as the window closes.
	 */
	bind?(window: IChatWindow, instantiationService: IInstantiationService): IDisposable;
	/** Called once the window shows the content, focused unless opened with {@link IChatWindowOpenOptions.preserveFocus}. */
	didShow?(window: IChatWindow, focused: boolean): void;
}

/** A row or column of chrome that a provider renders into a chat window, beside its parts. */
export interface IChatWindowChromeElement extends IDisposable {
	/** Whether it shows; it takes no room while it does not. */
	readonly visible: IObservable<boolean>;
	/** The room it takes while it shows: the height of a row, the width of a column. */
	readonly size: IObservable<number>;
	layout(width: number, height: number): void;
}

/**
 * The chrome facet: rows and columns that a provider renders into its chat windows, beside their parts. Each renders into
 * `container`, an element of the window that the window places, with `instantiationService`, which has the window's
 * services: those of its content and the window's context.
 */
export interface IChatWindowChrome {
	/**
	 * A row above the chat part while the main part is beside the chat (Side by Side), else across the window, such as the
	 * session's title row.
	 */
	createTitleRow?(window: IChatWindow, container: HTMLElement, instantiationService: IInstantiationService): IChatWindowChromeElement | undefined;
	/**
	 * A column at the right of the window while the chat is below the main part or hidden (Stacked, Editor Only), such as
	 * the session's activity bar, which shows beside the chat otherwise.
	 */
	createStrip?(window: IChatWindow, container: HTMLElement, instantiationService: IInstantiationService): IChatWindowChromeElement | undefined;
}

/** The look facet: how a provider's chat windows look. */
export interface IChatWindowLook {
	/** The gap between the parts of the window, in pixels. */
	readonly gap: IObservable<number>;
	/** The room the parts keep to the edges of the window, in pixels. */
	readonly outerInsets?: IObservable<IGridEdgeInsets>;
	/** A class name on the window's container, through which the provider styles it, such as the cards of its parts. */
	readonly className?: string;
	/** Paints a background behind the chat part's element, such as a wallpaper. */
	paintChatBackground?(element: HTMLElement): IDisposable;
	/**
	 * Options of the main part of the window, such as how its tabs show, that override the user's settings there; also of
	 * the part that holds its terminals.
	 */
	readonly mainPartOptions?: IObservable<DeepPartial<IEditorPartOptions>>;
	/** Options of the groups of the main part of the window, such as the menus of their title areas. */
	readonly mainPartGroupViewOptions?: IEditorGroupViewOptions;
}

/** Shows chats in chat windows: the content, chrome and look of the windows, and where their chats go back to. */
export interface IChatWindowProvider {
	/** Resolves what a chat window shows for `chat`; undefined when the chat is unknown. */
	resolveContent(chat: URI): Promise<IChatWindowContent | undefined>;
	readonly chrome?: IChatWindowChrome;
	readonly look: IChatWindowLook;
	/** Shows `chat` in the main window again, with `editors`, once its chat window closed. */
	moveToMainWindow(chat: URI, editors: IChatWindowEditors): Promise<void>;
	/**
	 * Whether a chat window of `chat` that was open when the window last closed opens again, waiting as long as it needs
	 * to know, such as for the chat to load. A chat that is gone does not.
	 */
	canRestore(chat: URI): Promise<boolean>;
	/** Whether chat windows are restored now; while not, the stored ones are kept for later. */
	readonly restoreEnabled: IObservable<boolean>;
	/** Fires with chats that are gone, so that their stored windows are forgotten before the next save. */
	readonly onDidRemoveChats: Event<readonly URI[]>;
}

/** An open chat window: a window of its own that shows a chat in its chat part, beside its main part. */
export interface IChatWindow {
	/** The id of the window it shows in. */
	readonly windowId: number;
	/** The chat it shows. */
	readonly chat: IObservable<URI>;
	readonly title: IObservable<string>;
	/** How it shows its chat part and its main part. */
	readonly layoutMode: IObservable<ChatWindowLayoutMode>;
	/** How its chat part and its main part are arranged while both show, or will next show. */
	readonly splitLayout: IObservable<ChatWindowSplitLayout>;
	/** In {@link ChatWindowLayoutMode.Stacked}: whether the chat shows only its input. */
	readonly inputOnly: IObservable<boolean>;
	/** The window's main part, where what it opens goes by default. */
	readonly mainPart: IContentPart;
	/** The part that shows the chat. */
	readonly chatPart: IEditorPart;
	/**
	 * The part that holds its terminals, once created (see {@link getOrCreateTerminalsPart}), until the window closes. It is
	 * a part like the others: what it shows is what the feature that shows terminals opens in it.
	 */
	readonly terminalsPart: IObservable<IContentPart | undefined>;
	/** Whether the part that holds its terminals shows: it exists and has editors. */
	readonly terminalsVisible: IObservable<boolean>;
	/**
	 * Where the part that holds its terminals sits: below the chat, below the main part, or across the bottom of the window.
	 * While {@link ChatWindowLayoutMode.Stacked}, the part is across the bottom of the chat and the main part, whatever the
	 * position, which applies again side by side.
	 */
	readonly terminalPosition: IObservable<ChatWindowTerminalPosition>;
	/** Fires as it closes, before its parts close: what shows in them, such as terminals, can leave the window first. */
	readonly onWillClose: Event<void>;
	readonly onDidClose: Event<void>;

	setLayoutMode(mode: ChatWindowLayoutMode): void;
	/** Arranges its chat part and its main part as `splitLayout`: at once while both show, else the next time both show. */
	setSplitLayout(splitLayout: ChatWindowSplitLayout): void;
	/** In {@link ChatWindowLayoutMode.Stacked}: collapses the chat to its input, or expands it to show its conversation too. */
	toggleConversation(): void;
	/**
	 * The part that holds its terminals, created at its {@link terminalPosition} the first time. Like every part of the
	 * window, it hides while it has no editors.
	 */
	getOrCreateTerminalsPart(): IContentPart;
	/** Moves the part that holds its terminals to `position`, which becomes the default of chat windows. */
	setTerminalPosition(position: ChatWindowTerminalPosition): void;
	/** Shows its main part, as last arranged with the chat, when only the chat shows. */
	showEditor(): void;
	/** Focuses the chat while it shows, else the main part. */
	focus(): void;
	/** Closes it, moving editors that need confirmation to close, such as unsaved ones, to the main window. */
	close(): boolean;
}

/** Shows chats in chat windows: windows of their own with a chat part beside a main part. */
export interface IChatWindowService {

	readonly _serviceBrand: undefined;

	/** The open chat windows. */
	readonly windows: IObservable<readonly IChatWindow[]>;

	/** Whether a provider is registered: without one, nothing opens a chat window. */
	readonly hasProvider: IObservable<boolean>;

	/** Registers the provider of chat windows. There is one at a time. */
	registerProvider(provider: IChatWindowProvider): IDisposable;

	/**
	 * Opens a chat window that shows `chat`, or reveals the one that does. Resolves to `undefined` without a provider or
	 * when the provider does not know the chat.
	 */
	open(chat: URI, options?: IChatWindowOpenOptions): Promise<IChatWindow | undefined>;

	/** The chat window that shows in the window `windowId`. */
	getWindow(windowId: number): IChatWindow | undefined;

	/** The chat window whose window has focus, which commands act on; undefined while another window has focus. */
	readonly activeWindow: IChatWindow | undefined;

	/** Closes `window`, and shows its chat in the main window again, with the editors of its main part. */
	moveToMainWindow(window: IChatWindow): Promise<void>;
}
