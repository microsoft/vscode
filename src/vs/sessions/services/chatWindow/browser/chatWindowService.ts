/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorGroup } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { EditorInput } from '../../../../workbench/common/editor/editorInput.js';
import { DEFAULT_EDITOR_ASSOCIATION } from '../../../../workbench/common/editor.js';
import { SessionLayoutMode, SessionSplitLayout } from '../../../common/sessionLayoutMode.js';
import { IActiveSession } from '../../sessions/common/sessionsManagement.js';

export const IChatWindowService = createDecorator<IChatWindowService>('chatWindowService');

/** Where the terminal row of a chat window shows. */
export const enum ChatWindowTerminalPosition {
	/** Across the bottom of the window, below the chat and the editor area. */
	FullWidth = 'fullWidth',
	/** Below the editor area only. Stacked, between the editor area and the chat. */
	UnderEditor = 'underEditor',
	/** Below the chat only. Stacked, across the bottom, as the chat is the bottom of the window. */
	UnderChat = 'underChat',
}

/**
 * A kind of chat window. Chat windows of a kind share their title and their defaults: the
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
	/**
	 * Whether its chat windows with an editor area show the Session Activity Bar beside their chat, as the main window
	 * does, following its settings; `false` by default.
	 */
	readonly showActivityBar?: boolean;
	/** Whether its chat windows can dock in the corner of the main window. Defaults to `false`. */
	readonly dockable?: boolean;
	/** Whether its chat windows open docked until the user chooses otherwise, when they can dock. Defaults to `false`. */
	readonly dockedByDefault?: boolean;
	/** The size of its chat windows when they open in a window of their own. */
	readonly windowSize?: { readonly width: number; readonly height: number };
	/** The layout its chat windows with an editor open with until the user chooses one. Defaults to the first available. */
	readonly defaultLayout?: SessionLayoutMode;
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
	/** With an editor area: whether to show the terminal row across the bottom of the window; see {@link IChatWindow.terminalShown}. */
	readonly showTerminal?: boolean;
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
	readonly layout: IObservable<SessionLayoutMode>;
	/** How its chat and its editor are arranged while both show, or as they last showed together. */
	readonly splitLayout: IObservable<SessionSplitLayout>;
	/** The layouts it can show: none but {@link SessionLayoutMode.ChatOnly} without an editor, and no side by side docked. */
	readonly layouts: readonly SessionLayoutMode[];
	/** The group of its editor or editor area, where what its chat opens shows; undefined when it shows only its chat. */
	readonly editorGroup: IEditorGroup | undefined;
	readonly onDidClose: Event<void>;

	/** Shows `layout`, which becomes the default of the kind. */
	setLayout(layout: SessionLayoutMode): void;
	/** Arranges its chat and its editor as `splitLayout`: at once while both show, else the next time both show. */
	setSplitLayout(splitLayout: SessionSplitLayout): void;
	/**
	 * In {@link SessionLayoutMode.Stacked} in a window of its own: collapses the chat to its input, or expands it to
	 * show its conversation too, as dragging the split down or up does.
	 */
	toggleConversation(): void;
	/** Shows its editor, as last arranged with the chat, when only the chat shows. */
	showEditor(): void;
	/** Docked: resizes it to its default size, which its kind then opens with too. */
	resetSize(): void;
	/**
	 * With an editor area: whether a terminal of its session shows in a row across the bottom of the window, below the
	 * chat and the editor area, as the panel shows it in the main window.
	 */
	readonly terminalShown: IObservable<boolean>;
	/** The group of the terminal row, while it shows. */
	readonly terminalGroup: IObservable<IEditorGroup | undefined>;
	/** Where the terminal row shows, which becomes the default of the kind. */
	readonly terminalPosition: IObservable<ChatWindowTerminalPosition>;
	setTerminalPosition(position: ChatWindowTerminalPosition): void;
	/** Shows or hides the terminal row. Hiding it keeps its terminal running, to show again. */
	setTerminalShown(shown: boolean, options?: { readonly focus?: boolean }): Promise<void>;
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
 * main window, which show a chat, optionally beside an editor, in one of the {@link SessionLayoutMode}s.
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

	/** Registers what shows terminals in the terminal rows of chat windows; see {@link IChatWindow.terminalShown}. */
	registerTerminalHost(host: IChatWindowTerminalHost): IDisposable;
}

/**
 * Shows terminals of the sessions of chat windows in their terminal rows, and keeps them running while the rows are
 * hidden or the windows close.
 */
export interface IChatWindowTerminalHost {
	/** Shows a terminal of the session of `window` in `group`, the terminal row. */
	show(window: IChatWindow, group: IEditorGroup, focus: boolean): Promise<void>;
	/** Takes the terminal of `window` out of its terminal row, which is about to go, keeping it running to show again. */
	hide(window: IChatWindow): void;
	/** Takes the terminal of `window` out of it, which closes or moves its chat: the terminal is its session's again. */
	release(window: IChatWindow): void;
}

/** The kind of the chat window, by its {@link IChatWindowKind.id}, or empty outside chat windows. */
/** The setting that enables opening chats in windows of their own, and restoring them. */
export const CHAT_WINDOWS_ENABLED_SETTING = 'sessions.chatWindows.enabled';

export const ChatWindowContext = new RawContextKey<string>('sessions.chatWindow', '', localize('chatWindow', "The kind of the chat window, or empty outside chat windows."));

/** Whether the chat window is docked in the main window, rather than in a window of its own. */
export const ChatWindowDockableContext = new RawContextKey<boolean>('sessions.chatWindowDockable', false, localize('chatWindowDockable', "Whether the chat window can dock in the main window."));

export const ChatWindowDockedContext = new RawContextKey<boolean>('sessions.chatWindowDocked', false, localize('chatWindowDocked', "Whether the chat window is docked in the main window."));

/** The {@link ChatWindowTerminalPosition} of the terminal row of the chat window. */
export const ChatWindowTerminalPositionContext = new RawContextKey<string>('sessions.chatWindowTerminalPosition', ChatWindowTerminalPosition.FullWidth, localize('chatWindowTerminalPosition', "Where the terminal row of the chat window shows: fullWidth, underEditor or underChat."));

/** The editor that the one editor of the chat window shows its resource with; see {@link IChatWindowEditor.viewType}. */
export const ChatWindowEditorViewTypeContext = new RawContextKey<string>('sessions.chatWindowEditorViewType', '', localize('chatWindowEditorViewType', "The editor the one editor of the chat window shows its resource with, such as the text editor or a custom editor."));

/** Whether the docked chat window was resized from its default size. */
export const ChatWindowDockedResizedContext = new RawContextKey<boolean>('sessions.chatWindowDockedResized', false, localize('chatWindowDockedResized', "Whether the docked chat window was resized from its default size."));

/**
 * Whether the chat window shows a Session Activity Bar beside its chat (its kind's {@link IChatWindowKind.showActivityBar}).
 * Only then can the strip take the window's Layout menu over from its title bar or header.
 */
export const ChatWindowHasSessionActivityBarContext = new RawContextKey<boolean>('sessions.chatWindowHasSessionActivityBar', false, localize('chatWindowHasSessionActivityBar', "Whether the chat window shows a Session Activity Bar beside its chat."));

/** Whether the chat window shows an editor area beside its chat, which takes the editors opened from it. */
export const ChatWindowHasEditorAreaContext = new RawContextKey<boolean>('sessions.chatWindowHasEditorArea', false, localize('chatWindowHasEditorArea', "Whether the chat window shows an editor area beside its chat."));

/** The identifier of the editor group of the chat window's editor area, or -1 outside chat windows with one. Scopes menu entries to one window. */
export const ChatWindowEditorGroupContext = new RawContextKey<number>('sessions.chatWindowEditorGroup', -1, localize('chatWindowEditorGroup', "The identifier of the editor group of the chat window's editor area."));

/** The identifier of the editor that the editor area of the chat window shows, or empty. */
export const ChatWindowEditorAreaEditorContext = new RawContextKey<string>('sessions.chatWindowEditorAreaEditor', '', localize('chatWindowEditorAreaEditor', "The identifier of the editor that the editor area of the chat window shows."));

/** Whether the session of the chat window has a workspace and is not a quick chat, so that it has changes and files. */
export const ChatWindowSessionHasWorkspaceContext = new RawContextKey<boolean>('sessions.chatWindowSessionHasWorkspace', false, localize('chatWindowSessionHasWorkspace', "Whether the session of the chat window has a workspace and is not a quick chat."));

/** Shows or hides the editor of the active chat window, or its editor area. */
export const CHAT_WINDOW_TOGGLE_EDITOR_COMMAND_ID = 'sessions.chatWindow.toggleEditor';

/** Shows or hides the terminal row of the active chat window; see {@link IChatWindow.terminalShown}. */
export const CHAT_WINDOW_TOGGLE_TERMINAL_COMMAND_ID = 'sessions.chatWindow.toggleTerminal';

/** Whether the chat window shows its terminal row. */
export const ChatWindowTerminalShownContext = new RawContextKey<boolean>('sessions.chatWindowTerminalShown', false, localize('chatWindowTerminalShown', "Whether the chat window shows a terminal across its bottom."));

/** Whether the editor group is the terminal row of a chat window. Set in the scope of that group. */
export const ChatWindowTerminalRowContext = new RawContextKey<boolean>('sessions.chatWindowTerminalRow', false, localize('chatWindowTerminalRow', "Whether the editor group is the terminal row of a chat window."));

/** Whether the chat window shows an editor, or an editor area, beside its chat. */
export const ChatWindowHasEditorContext = new RawContextKey<boolean>('sessions.chatWindowHasEditor', false, localize('chatWindowHasEditor', "Whether the chat window shows an editor beside its chat."));

/** Whether a chat window is docked in the main window, where it covers its bottom right corner. Set in the main window. */
export const ChatWindowDockedOpenContext = new RawContextKey<boolean>('sessions.chatWindowDockedOpen', false, localize('chatWindowDockedOpen', "Whether a chat window is docked in the main window."));
