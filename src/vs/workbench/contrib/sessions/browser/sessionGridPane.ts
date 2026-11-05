/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../base/common/observable.js';
import { IChat, ISession } from '../common/session.js';

export const enum SessionGridPaneKind {
	/** A session's own slot, with its tab strip; or the new-session slot, without a session. */
	Slot = 'slot',
	/** A pane of the grid that shows one chat of its session apart from the session's slot. */
	Detached = 'detached',
}

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

/**
 * A pane of the main window's grid: a slot or a detached pane. The grid owns it; it lives as long as its grid slot, also when
 * the session it shows is replaced, such as when a draft graduates. Its session is the provider's session, which it does not
 * own.
 */
export interface ISessionGridPane {
	/** The id of its grid slot: stable for the life of the pane, and the binding id persisted for it. */
	readonly id: string;
	readonly kind: SessionGridPaneKind;
	/** The session it shows; `undefined` for the new-session slot. Changes with {@link chat} in one transaction. */
	readonly session: IObservable<ISession | undefined>;
	/** The chat it shows: a slot's active tab, a detached pane's chat. */
	readonly chat: IObservable<IChat | undefined>;
	/** Whether it is pinned in the grid. Always `false` for detached panes and the new-session slot. */
	readonly sticky: IObservable<boolean>;
	readonly tabs: ISessionPaneTabs;
}
