/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ContextKeyExpr, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IsAuxiliaryWindowContext } from '../../../../workbench/common/contextkeys.js';
import { EditorInput } from '../../../../workbench/common/editor/editorInput.js';
import { IEditorGroup, IEditorPart } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { SessionLayoutMode, SessionTerminalPosition } from '../../../common/sessionGridLayout/sessionGridLayout.js';
import { IActiveSession } from '../../sessions/common/sessionsManagement.js';

export const IChatWindowService = createDecorator<IChatWindowService>('chatWindowService');

/** The layout modes in which a window shows its chat and its editor together. */
export type SessionSplitLayout = SessionLayoutMode.Stacked | SessionLayoutMode.SideBySide;

/**
 * A kind of chat window. Chat windows of a kind share their title and their defaults: the layout and terminal position a
 * new one of the kind opens with are those last used in one of the kind.
 */
export interface IChatWindowKind {
	/** Identifies the kind: the value of {@link ChatWindowContext} in its chat windows, and the key of its defaults. */
	readonly id: string;
	/** The title of its chat windows while their content has none. */
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
	/** Whether its chat windows show the Session Activity Bar, as the main window does, following its settings; `false` by default. */
	readonly showActivityBar?: boolean;
	/** The size of its chat windows when they open. */
	readonly windowSize?: { readonly width: number; readonly height: number };
	/** The layout its chat windows open with until the user chooses one. Defaults to the first available. */
	readonly defaultLayout?: SessionLayoutMode;
}

/**
 * The editor area of a chat window, beside its chat: where what the chat opens shows, such as files and its changes. It
 * starts with the editors it takes over.
 */
export interface IChatWindowEditorArea {
	/** Groups whose editors move to the editor area as the chat window opens, such as the main window's for its chat. */
	readonly moveEditorsFrom?: readonly IEditorGroup[];
	/** Editors that open in the editor area as the chat window opens, such as those it showed when the window last closed. */
	readonly editors?: readonly EditorInput[];
	/** The one of {@link editors} that is active; by default the last one. */
	readonly activeEditor?: EditorInput;
}

/** What a chat window shows: a chat of a session, and optionally an editor area beside it. */
export interface IChatWindowContent {
	/** The session, by its resource. */
	readonly session: URI;
	/** The chat of the session the chat window shows: by default, the chat the main window shows of it, or its main chat. */
	readonly chat?: URI;
	/** The title of the chat window, in place of the title of its kind, such as the chat's title. */
	readonly title?: IObservable<string>;
	/** An editor area beside the chat. */
	readonly editorArea?: IChatWindowEditorArea;
}

/** Options for opening a chat window. */
export interface IChatWindowOpenOptions {
	/** Whether to open it without focusing it, and so without its session becoming the active session, such as when restoring it. */
	readonly preserveFocus?: boolean;
	/** With an editor area: whether to show its terminals; see {@link IChatWindow.terminalShown}. */
	readonly showTerminal?: boolean;
}

/**
 * Identifies a chat window to the actions that run in it, such as from its title bar or its Session Activity Bar: they act
 * on that window, not on the one that happens to be active.
 */
export interface IChatWindowHandle {
	/** The id of the window the chat window shows in. */
	readonly chatWindowId: number;
}

export function isChatWindowHandle(value: unknown): value is IChatWindowHandle {
	return typeof (value as Partial<IChatWindowHandle> | undefined)?.chatWindowId === 'number';
}

/** An open chat window: a window of its own that shows a chat, and an editor area and terminals beside it. */
export interface IChatWindow {
	readonly kind: IChatWindowKind;
	/** The id of the window it shows in. */
	readonly windowId: number;
	/** Identifies it to the actions that run in it. */
	readonly handle: IChatWindowHandle;
	/** What it shows. */
	readonly content: IObservable<IChatWindowContent>;
	/** The session it shows, outside the main window's grid; see `ISessionsService.showSessionInWindow`. */
	readonly session: IObservable<IActiveSession | undefined>;
	/** How it shows its chat and its editor area. */
	readonly layout: IObservable<SessionLayoutMode>;
	/** How its chat and its editor area are arranged while both show, or as they last showed together. */
	readonly splitLayout: IObservable<SessionSplitLayout>;
	/** The layouts it can show: none but {@link SessionLayoutMode.ChatOnly} without an editor area. */
	readonly layouts: readonly SessionLayoutMode[];
	/** In {@link SessionLayoutMode.Stacked}: whether the chat shows only its input. */
	readonly inputOnly: IObservable<boolean>;
	/** The editor part of its editor area, where what its chat opens shows; undefined without an editor area. */
	readonly editorArea: IEditorPart | undefined;
	/** The active group of its editor area; undefined without an editor area. */
	readonly editorGroup: IEditorGroup | undefined;
	/** Whether its terminals show. */
	readonly terminalShown: IObservable<boolean>;
	/** Where its terminals show, which becomes the default of its kind. */
	readonly terminalPosition: IObservable<SessionTerminalPosition>;
	readonly onDidClose: Event<void>;

	/** Shows `layout`, which becomes the default of the kind and is remembered for the chat. */
	setLayout(layout: SessionLayoutMode): void;
	/** Arranges its chat and its editor area as `splitLayout`: at once while both show, else the next time both show. */
	setSplitLayout(splitLayout: SessionSplitLayout): void;
	/** In {@link SessionLayoutMode.Stacked}: collapses the chat to its input, or expands it to show its conversation too. */
	toggleConversation(): void;
	/** Shows its editor area, as last arranged with the chat, when only the chat shows. */
	showEditor(): void;
	setTerminalPosition(position: SessionTerminalPosition): void;
	focus(): void;
	/** Closes it, moving editors that need confirmation to close, such as unsaved ones, to the main window. */
	close(): boolean;
}

/** Shows chats of the Agents window in chat windows: windows of their own that show a chat, beside an editor area. */
export interface IChatWindowService {

	readonly _serviceBrand: undefined;

	/** The open chat windows. */
	readonly windows: IObservable<readonly IChatWindow[]>;

	/**
	 * Opens a chat window of `kind` that shows `content`. Reveals the chat window that shows its chat instead when there is
	 * one. Resolves to `undefined` when the session is unknown.
	 */
	open(kind: IChatWindowKind, content: IChatWindowContent, options?: IChatWindowOpenOptions): Promise<IChatWindow | undefined>;

	/** The chat window that shows in the window `windowId`. */
	getWindow(windowId: number): IChatWindow | undefined;

	/**
	 * The chat window an action acts on: the one `context` identifies (see {@link IChatWindowHandle}), else the one whose
	 * window is active, such as for a keybinding or the Command Palette.
	 */
	resolveWindow(context: unknown): IChatWindow | undefined;

	/** Closes `window`, and shows its chat in the main window again, with the editors of its editor area. */
	moveToMainWindow(window: IChatWindow): Promise<void>;
}

/** Opens a chat of a session, given as `{ session, chat }`, in a chat window of its own. */
export const OPEN_CHAT_IN_WINDOW_COMMAND_ID = 'sessions.chatWindow.openChat';

/** The setting that enables opening chats in windows of their own, and restoring them. */
export const CHAT_WINDOWS_ENABLED_SETTING = 'sessions.chatWindows.enabled';

/** The kind of the chat window, by its {@link IChatWindowKind.id}, or empty outside chat windows. */
export const ChatWindowContext = new RawContextKey<string>('sessions.chatWindow', '', localize('chatWindow', "The kind of the chat window, or empty outside chat windows."));

/** Holds outside chat windows: what a chat window does not support, such as starting a chat, is gated on it. */
export const NotInChatWindowContext = ContextKeyExpr.has(ChatWindowContext.key).negate();

/** The id of the window of the chat window, or -1 outside chat windows; see {@link IChatWindowHandle}. */
export const ChatWindowIdContext = new RawContextKey<number>('sessions.chatWindowId', -1, localize('chatWindowId', "The id of the window of the chat window, or -1 outside chat windows."));

/** Whether the chat window shows a session header above its chat. */
export const ChatWindowHasSessionHeaderContext = new RawContextKey<boolean>('sessions.chatWindowHasSessionHeader', false, localize('chatWindowHasSessionHeader', "Whether the chat window shows a session header above its chat."));

/** The {@link SessionTerminalPosition} of the terminals of the chat window. */
export const ChatWindowTerminalPositionContext = new RawContextKey<string>('sessions.chatWindowTerminalPosition', SessionTerminalPosition.FullWidth, localize('chatWindowTerminalPosition', "Where the terminals of the chat window show: fullWidth, underEditor or underChat."));

/** Whether the chat window shows a Session Activity Bar (its kind's {@link IChatWindowKind.showActivityBar}). */
export const ChatWindowHasSessionActivityBarContext = new RawContextKey<boolean>('sessions.chatWindowHasSessionActivityBar', false, localize('chatWindowHasSessionActivityBar', "Whether the chat window shows a Session Activity Bar beside its chat."));

/** Whether the chat window shows an editor area beside its chat, which takes the editors opened from it. */
export const ChatWindowHasEditorAreaContext = new RawContextKey<boolean>('sessions.chatWindowHasEditorArea', false, localize('chatWindowHasEditorArea', "Whether the chat window shows an editor area beside its chat."));

/** Whether the chat window shows an editor area beside its chat. */
export const ChatWindowHasEditorContext = new RawContextKey<boolean>('sessions.chatWindowHasEditor', false, localize('chatWindowHasEditor', "Whether the chat window shows an editor beside its chat."));

/** The identifier of the active editor group of the chat window's editor area, or -1 outside chat windows with one. */
export const ChatWindowEditorGroupContext = new RawContextKey<number>('sessions.chatWindowEditorGroup', -1, localize('chatWindowEditorGroup', "The identifier of the editor group of the chat window's editor area."));

/** The identifier of the editor that the editor area of the chat window shows, or empty. */
export const ChatWindowEditorAreaEditorContext = new RawContextKey<string>('sessions.chatWindowEditorAreaEditor', '', localize('chatWindowEditorAreaEditor', "The identifier of the editor that the editor area of the chat window shows."));

/** Whether the session of the chat window has a workspace and is not a quick chat, so that it has changes and files. */
export const ChatWindowSessionHasWorkspaceContext = new RawContextKey<boolean>('sessions.chatWindowSessionHasWorkspace', false, localize('chatWindowSessionHasWorkspace', "Whether the session of the chat window has a workspace and is not a quick chat."));

/** Where the session commands of the title bar show: in the main window, and in a chat window that shows a session with a workspace. */
export const SessionTitleBarActionsShownContext = ContextKeyExpr.or(IsAuxiliaryWindowContext.toNegated(), ChatWindowSessionHasWorkspaceContext)!;

/** Whether the chat window shows its terminals. */
export const ChatWindowTerminalShownContext = new RawContextKey<boolean>('sessions.chatWindowTerminalShown', false, localize('chatWindowTerminalShown', "Whether the chat window shows its terminals."));

/** Whether the editor group is in the terminals of a chat window. Set in the scope of the terminals. */
export const ChatWindowTerminalRowContext = new RawContextKey<boolean>('sessions.chatWindowTerminalRow', false, localize('chatWindowTerminalRow', "Whether the editor group is in the terminals of a chat window."));

/** The {@link SessionLayoutMode} of the chat window. Set in chat windows only. */
export const SessionLayoutModeContext = new RawContextKey<string>('sessions.layoutMode', SessionLayoutMode.ChatOnly, localize('sessionLayoutMode', "How the window shows its chat and its editor: stacked, sideBySide, editorOnly or chatOnly."));

/** The {@link SessionSplitLayout} of the chat window: how its chat and its editor show together, or last showed. Set in chat windows only. */
export const SessionSplitLayoutContext = new RawContextKey<string>('sessions.splitLayout', SessionLayoutMode.Stacked, localize('sessionSplitLayout', "How the window arranges its chat and its editor while both show, or as they last showed together: stacked or sideBySide."));

/** Shows or hides the editor area of the chat window. */
export const CHAT_WINDOW_TOGGLE_EDITOR_COMMAND_ID = 'sessions.chatWindow.toggleEditor';

/** Shows or hides the terminals of the chat window; see {@link IChatWindow.terminalShown}. */
export const CHAT_WINDOW_TOGGLE_TERMINAL_COMMAND_ID = 'sessions.chatWindow.toggleTerminal';

/**
 * The session that the chat window in the window `windowId` shows, for actions that run in the title bar of that window. Undefined
 * when that is not the window of a chat window, such as the main window, in which they act on its active session.
 */
export function getChatWindowSession(chatWindowService: IChatWindowService, windowId: number): IObservable<IActiveSession | undefined> | undefined {
	return chatWindowService.getWindow(windowId)?.session;
}
