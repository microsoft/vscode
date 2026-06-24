/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action, IAction, Separator } from '../../../base/common/actions.js';
import { Codicon } from '../../../base/common/codicons.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { IObservable } from '../../../base/common/observable.js';
import { localize } from '../../../nls.js';
import { MenuItemAction } from '../../../platform/actions/common/actions.js';
import { DropdownMenuActionViewItem } from '../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import { IContextMenuService } from '../../../platform/contextview/browser/contextView.js';
import { ISessionsService } from '../../services/sessions/browser/sessionsService.js';
import { ISessionsPartService } from '../../services/sessions/browser/sessionsPartService.js';
import { IActiveSession } from '../../services/sessions/common/sessionsManagement.js';

/**
 * Renders the chats toolbar button as a dropdown. The dropdown opens with a
 * "New Chat" entry, a separator, then every chat in the session with a checkbox:
 * checked chats are shown as tabs, unchecked chats are closed (hidden from the
 * tab strip). Toggling an entry closes or reopens the corresponding chat.
 *
 * The main chat is always shown and cannot be closed, so its entry is checked and
 * disabled.
 */
export class ConversationsDropdownActionViewItem extends DropdownMenuActionViewItem {

	private readonly _actionsDisposables = this._register(new DisposableStore());

	constructor(
		action: MenuItemAction,
		private readonly _sessionObs: IObservable<IActiveSession | undefined>,
		@IContextMenuService contextMenuService: IContextMenuService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@ISessionsPartService private readonly _sessionsPartService: ISessionsPartService,
	) {
		super(
			action,
			{ getActions: () => this._buildActions() },
			contextMenuService,
			{
				classNames: action.class,
				menuAsChild: true,
			},
		);
	}

	private _buildActions(): IAction[] {
		this._actionsDisposables.clear();

		const session = this._sessionObs.get();
		if (!session) {
			return [];
		}

		const newChatAction = this._actionsDisposables.add(new Action(
			'sessions.newChat',
			localize('newChat', "New Chat"),
			ThemeIcon.asClassName(Codicon.add),
			true,
			async () => {
				await this._sessionsService.openNewChatInSession(session);
				this._sessionsPartService.focusSession(this._sessionsService.activeSession.get());
			},
		));

		const allChats = session.chats.get();
		const mainChat = session.mainChat.get();
		const openUris = new Set(session.openChats.get().map(chat => chat.resource.toString()));
		const mainUri = mainChat.resource.toString();

		const chatActions = allChats
			.map(chat => {
				const chatUri = chat.resource.toString();
				const isOpen = openUris.has(chatUri);
				const isMain = chatUri === mainUri;
				const action = this._actionsDisposables.add(new Action(
					`sessions.toggleChat.${chatUri}`,
					chat.title.get() || localize('untitledChat', "Untitled Chat"),
					undefined,
					!isMain,
					async () => {
						if (isOpen) {
							await this._sessionsService.closeChat(session, chat);
						} else {
							await this._sessionsService.reopenChat(session, chat);
							await this._sessionsService.openChat(session, chat.resource);
						}
					},
				));
				action.checked = isOpen;
				return action;
			});

		return [newChatAction, new Separator(), ...chatActions];
	}
}
