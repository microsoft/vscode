/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorGroup } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { EditorInput } from '../../../../workbench/common/editor/editorInput.js';
import { DEFAULT_EDITOR_ASSOCIATION } from '../../../../workbench/common/editor.js';
import { IActiveSession } from '../../sessions/common/sessionsManagement.js';

export const IChatWindowService = createDecorator<IChatWindowService>('chatWindowService');

/** How a chat window shows its chat and its editor. */
export const enum ChatWindowLayout {
	/** The editor above the chat. In a window of its own, the chat can be dragged up to show its conversation. */
	EditorAboveChat = 'editorAboveChat',
	/** The chat, with its conversation, to the left of the editor. Not available docked. */
	SideBySide = 'sideBySide',
	/** Only the editor. */
	EditorOnly = 'editorOnly',
	/** Only the chat, with its conversation. The only layout of a chat window without an editor. */
	ChatOnly = 'chatOnly',
}

/** The layouts in which a chat window shows its chat and its editor together. */
export type ChatWindowSplitLayout = ChatWindowLayout.EditorAboveChat | ChatWindowLayout.SideBySide;

/**
 * A kind of chat window, such as the Chatpad's. Chat windows of a kind share their title and their defaults: the
 * layout, docking and docked size a new one of the kind opens with are those last used in one of the kind.
 */
export interface IChatWindowKind {
	/** Identifies the kind: the value of {@link ChatWindowContext} in its chat windows, and the key of its defaults. */
	readonly id: string;
	/** The title of its chat windows: their window title, or the header title when docked. */
	readonly title: string;
	/** The placeholder of the chat input. */
	readonly inputPlaceholder?: string;
	/** The fewest lines the chat input shows; as in the main window by default. */
	readonly inputMinLines?: number;
	/** Whether the session header shows above the chat, as in the main window; `true` by default. */
	readonly showSessionHeader?: boolean;
	/** Whether the status pills of the session show above the chat input, as in the main window; `true` by default. */
	readonly showPills?: boolean;
	/** Whether the session of a chat window becomes the active session while the chat window is focused; `true` by default. */
	readonly activatesSession?: boolean;
	/** Whether its chat windows can dock in the corner of the main window. Defaults to `false`. */
	readonly dockable?: boolean;
	/** Whether its chat windows open docked until the user chooses otherwise, when they can dock. Defaults to `false`. */
	readonly dockedByDefault?: boolean;
	/** The size of its chat windows when they open in a window of their own. */
	readonly windowSize?: { readonly width: number; readonly height: number };
	/** The layout its chat windows with an editor open with until the user chooses one. Defaults to the first available. */
	readonly defaultLayout?: ChatWindowLayout;
	/** The least size its chat windows can be resized to when docked. */
	readonly dockedMinimumSize?: { readonly width: number; readonly height: number };
}

/** An editor a chat window shows beside its chat. */
export interface IChatWindowEditor {
	readonly resource: URI;
	/**
	 * The editor to show the resource with: a custom editor, when it is available, which cannot be closed on its own while
	 * it is in the chat window, or the text editor for {@link CHAT_WINDOW_TEXT_EDITOR}. Otherwise the resource opens in
	 * its default editor.
	 */
	readonly viewType?: string;
}

/** The {@link IChatWindowEditor.viewType} of the text editor. */
export const CHAT_WINDOW_TEXT_EDITOR = DEFAULT_EDITOR_ASSOCIATION.id;

/**
 * An editor area a chat window shows beside its chat: a group that editors opened from the chat window open in, as the
 * chat opens files or shows its changes, which starts with the editors it takes over.
 */
export interface IChatWindowEditorArea {
	/** Groups whose editors move to the editor area as the chat window opens, such as the main window's for its session. */
	readonly moveEditorsFrom?: readonly IEditorGroup[];
	/** Editors that open in the editor area as the chat window opens, such as those it showed when the window last closed. */
	readonly editors?: readonly EditorInput[];
	/** The one of {@link editors} that is active; by default the last one. */
	readonly activeEditor?: EditorInput;
}

/** What a chat window shows: the main chat of a session, and optionally an editor, or an editor area, beside it. */
export interface IChatWindowContent {
	/** The session, by its resource. */
	readonly session: URI;
	/** The chat of the session the chat window shows: by default, the chat the main window shows of it, or its main chat. */
	readonly chat?: URI;
	/** The title of the chat window, in place of the title of its kind, such as the session's title. */
	readonly title?: IObservable<string>;
	/** One editor, which cannot be closed on its own. */
	readonly editor?: IChatWindowEditor;
	/** An editor area. Not together with {@link editor}. */
	readonly editorArea?: IChatWindowEditorArea;
}

/** Options for opening a chat window. */
export interface IChatWindowOpenOptions {
	/** Whether to dock it in the main window; otherwise it opens as the kind last did. */
	readonly docked?: boolean;
	/** Whether to open it without focusing it, and so without its session becoming the active session, such as when restoring it. */
	readonly preserveFocus?: boolean;
}

/** An open chat window: in a window of its own, or docked in the bottom right corner of the main window. */
export interface IChatWindow {
	readonly kind: IChatWindowKind;
	readonly docked: boolean;
	/** What it shows. */
	readonly content: IObservable<IChatWindowContent>;
	/** The session it shows, outside the main window's grid; see `ISessionsService.showSessionInWindow`. */
	readonly session: IObservable<IActiveSession | undefined>;
	/** How it shows its chat and its editor. */
	readonly layout: IObservable<ChatWindowLayout>;
	/** How its chat and its editor are arranged while both show, or as they last showed together. */
	readonly splitLayout: IObservable<ChatWindowSplitLayout>;
	/** The layouts it can show: none but {@link ChatWindowLayout.ChatOnly} without an editor, and no side by side docked. */
	readonly layouts: readonly ChatWindowLayout[];
	/** The group of its editor or editor area, where what its chat opens shows; undefined when it shows only its chat. */
	readonly editorGroup: IEditorGroup | undefined;
	readonly onDidClose: Event<void>;

	/** Shows `layout`, which becomes the default of the kind. */
	setLayout(layout: ChatWindowLayout): void;
	/**
	 * In {@link ChatWindowLayout.EditorAboveChat} in a window of its own: collapses the chat to its input, or expands it to
	 * show its conversation too, as dragging the split down or up does.
	 */
	toggleConversation(): void;
	/** Shows its editor, as last arranged with the chat, when only the chat shows. */
	showEditor(): void;
	/** Shows the resource of its one editor with another editor, such as as text; see {@link IChatWindowEditor.viewType}. */
	setEditor(editor: IChatWindowEditor): Promise<void>;
	/**
	 * Shows `content` in place of what it shows, keeping the window and its layout. What shows beside the chat keeps its
	 * form: one editor, an editor area, or nothing. Given a promise, the window stays open while it is pending, even when
	 * its session goes, such as when the content replaces a deleted session; it closes when the promise resolves to
	 * nothing after its session went.
	 */
	replace(content: IChatWindowContent | Promise<IChatWindowContent | undefined>): Promise<void>;
	focus(): void;
	/** Closes it, moving editors that need confirmation to close, such as unsaved ones, to the main window. */
	close(): boolean;
}

/**
 * Shows chats of the Agents window in chat windows: windows of their own, or docked in the bottom right corner of the
 * main window, which show a chat, optionally beside an editor, in one of the {@link ChatWindowLayout}s.
 */
export interface IChatWindowService {

	readonly _serviceBrand: undefined;

	/** The open chat windows. */
	readonly windows: IObservable<readonly IChatWindow[]>;

	/**
	 * Opens a chat window of `kind` that shows `content`. Reveals the chat window that shows the session instead when
	 * there is one. Opening docked while another chat window is docked opens it in a window of its own. Resolves to
	 * `undefined` when the session is unknown.
	 */
	open(kind: IChatWindowKind, content: IChatWindowContent, options?: IChatWindowOpenOptions): Promise<IChatWindow | undefined>;

	/**
	 * The chat window that actions run in: the one in a window of its own when that window is active, or else the one
	 * that has focus, or else the one docked in the active window, or else the only one open.
	 */
	getActiveWindow(): IChatWindow | undefined;

	/**
	 * Shows `window` docked in the main window, or in a window of its own, which its kind then opens as by default.
	 * Docking it moves a chat window docked already to a window of its own. Resolves to the chat window that shows it, as
	 * it closes and opens again.
	 */
	setDocked(window: IChatWindow, docked: boolean): Promise<IChatWindow | undefined>;

	/** Closes `window`, and shows its chat in the main window again, with the editors of its editor area. */
	moveToMainWindow(window: IChatWindow): Promise<void>;
}

/** The kind of the chat window, by its {@link IChatWindowKind.id}, or empty outside chat windows. */
export const ChatWindowContext = new RawContextKey<string>('sessions.chatWindow', '', localize('chatWindow', "The kind of the chat window, such as chatpad, or empty outside chat windows."));

/** Whether the chat window is docked in the main window, rather than in a window of its own. */
export const ChatWindowDockableContext = new RawContextKey<boolean>('sessions.chatWindowDockable', false, localize('chatWindowDockable', "Whether the chat window can dock in the main window."));

export const ChatWindowDockedContext = new RawContextKey<boolean>('sessions.chatWindowDocked', false, localize('chatWindowDocked', "Whether the chat window is docked in the main window."));

/** The {@link ChatWindowLayout} of the chat window. */
export const ChatWindowLayoutContext = new RawContextKey<string>('sessions.chatWindowLayout', ChatWindowLayout.ChatOnly, localize('chatWindowLayout', "How the chat window shows its chat and its editor: editorAboveChat, sideBySide, editorOnly or chatOnly."));

/** The {@link ChatWindowSplitLayout} of the chat window: how its chat and its editor show together, or last showed. */
export const ChatWindowSplitLayoutContext = new RawContextKey<string>('sessions.chatWindowSplitLayout', ChatWindowLayout.EditorAboveChat, localize('chatWindowSplitLayout', "How the chat window arranges its chat and its editor while both show, or as they last showed together: editorAboveChat or sideBySide."));

/** The editor that the one editor of the chat window shows its resource with; see {@link IChatWindowEditor.viewType}. */
export const ChatWindowEditorViewTypeContext = new RawContextKey<string>('sessions.chatWindowEditorViewType', '', localize('chatWindowEditorViewType', "The editor the one editor of the chat window shows its resource with, such as the text editor or a custom editor."));

/** Whether the chat window shows an editor, or an editor area, beside its chat. */
export const ChatWindowHasEditorContext = new RawContextKey<boolean>('sessions.chatWindowHasEditor', false, localize('chatWindowHasEditor', "Whether the chat window shows an editor beside its chat."));

/** Whether a chat window is docked in the main window, where it covers its bottom right corner. Set in the main window. */
export const ChatWindowDockedOpenContext = new RawContextKey<boolean>('sessions.chatWindowDockedOpen', false, localize('chatWindowDockedOpen', "Whether a chat window is docked in the main window."));
