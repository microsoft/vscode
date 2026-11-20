/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { derived, IObservable, IReader } from '../../../../base/common/observable.js';
import { IChat, ISession } from '../common/session.js';
import { IPaneViewState, ISessionPaneTabs } from '../common/sessionPane.js';

export const enum SessionGridPaneKind {
	/** A session's own slot, with its tab strip; or the new-session slot, without a session. */
	Slot = 'slot',
	/** A pane of the grid that shows one chat of its session apart from the session's slot. */
	Detached = 'detached',
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

/** The state of `pane` that the views and context keys of its host show: its pin, its tab strip, and whether it is detached. */
export function paneViewStateOf(pane: ISessionGridPane): IPaneViewState {
	return { sticky: pane.sticky, tabs: pane.tabs, isDetached: pane.kind === SessionGridPaneKind.Detached };
}

/**
 * The chat and state of `pane` while it shows `session`, as a view that binds that session shows them: they follow the pane
 * until it shows another session, such as one opened over it, and then keep what they last were. A view of the pane keeps
 * showing `session` until it binds the next one, instead of briefly showing `session` with the next session's tabs.
 */
export function paneShownOfSession(pane: ISessionGridPane, session: ISession): { readonly chat: IObservable<IChat | undefined>; readonly state: IPaneViewState } {
	const shows = (reader: IReader | undefined) => (reader ? pane.session.read(reader) : pane.session.get()) === session;
	const whileShown = <T>(source: IObservable<T>): IObservable<T> => {
		let last: { readonly value: T } | undefined;
		return derived(pane, reader => {
			if (!last || shows(reader)) {
				last = { value: source.read(reader) };
			}
			return last.value;
		});
	};
	const tabs = pane.tabs;
	return {
		chat: whileShown(pane.chat),
		state: {
			sticky: whileShown(pane.sticky),
			isDetached: pane.kind === SessionGridPaneKind.Detached,
			tabs: {
				openChats: whileShown(tabs.openChats),
				closedChats: whileShown(tabs.closedChats),
				get lastClosedChat() { return shows(undefined) ? tabs.lastClosedChat : undefined; },
				visibleChatTabs: whileShown(tabs.visibleChatTabs),
				shouldShowChatTabs: whileShown(tabs.shouldShowChatTabs),
			},
		},
	};
}

/** The sessions `panes` show, in order, without the new-session slot; read with `reader`, also each pane's session. */
export function readPaneSessions(panes: IObservable<readonly ISessionGridPane[]>, reader: IReader | undefined): readonly ISession[] {
	const sessions: ISession[] = [];
	for (const pane of panes.read(reader)) {
		const session = pane.session.read(reader);
		if (session) {
			sessions.push(session);
		}
	}
	return sessions;
}
