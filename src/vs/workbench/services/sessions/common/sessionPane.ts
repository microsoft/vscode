/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { derived, IObservable } from '../../../../base/common/observable.js';
import { IChat, ISession } from './session.js';

/** The tab strip a pane of the grid shows. A detached pane shows its one chat. */
export interface ISessionPaneTabs {
	/** The chats shown as tabs, without closed ones. */
	readonly openChats: IObservable<readonly IChat[]>;
	/** The closed, still reopenable chats. */
	readonly closedChats: IObservable<readonly IChat[]>;
	/** The most recently closed chat, or `undefined` if none. */
	readonly lastClosedChat: IChat | undefined;
	/** The tabs of {@link openChats}, with subagent chats hidden until explicitly opened. */
	readonly visibleChatTabs: IObservable<readonly IChat[]>;
	/** Whether the tab strip shows. */
	readonly shouldShowChatTabs: IObservable<boolean>;
}

/** The state of a pane of the grid that its views and context keys show, apart from the session and chat it shows. */
export interface IPaneViewState {
	/** Whether the pane is pinned in the grid. */
	readonly sticky: IObservable<boolean>;
	/** The tab strip the pane shows. */
	readonly tabs: ISessionPaneTabs;
	/** Whether the pane shows one chat of its session apart from the session's slot. */
	readonly isDetached: boolean;
}

/**
 * What the views of a pane show, and how they close it: the provider's session, the chat the pane shows of it, and the
 * pane's state. A pane of the grid, or the pane of a chat window's editor.
 */
export interface ISessionPaneContent {
	readonly session: ISession;
	/** The chat the pane shows: a slot's active tab, a detached pane's chat, a chat editor's chat. */
	readonly chat: IObservable<IChat>;
	readonly state: IPaneViewState;
	/**
	 * Closes the pane: a detached pane returns its chat to its session's slot, a slot leaves the grid, keeping its session's
	 * detached panes, and the pane of another surface, such as a chat editor's, closes there.
	 */
	close(): void;
}

/** The chat a surface shows of `session`: `chat`, which the surface is given, else the session's main chat. */
export function shownChatOf(session: IObservable<ISession | undefined>, chat: IObservable<IChat | undefined> | undefined): IObservable<IChat | undefined> {
	return derived(reader => chat?.read(reader) ?? session.read(reader)?.mainChat.read(reader));
}

/** A chat a host shows, with its session. */
export interface IShownChat {
	readonly session: ISession;
	readonly chat: IChat;
}
