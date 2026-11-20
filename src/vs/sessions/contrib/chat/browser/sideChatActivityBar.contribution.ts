/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IReader } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IsAuxiliaryWindowContext, IsSessionsWindowContext, MainEditorAreaVisibleContext } from '../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { Menus, SessionActivityBarGroup } from '../../../../workbench/contrib/sessions/browser/menus.js';
import { ISessionsService } from '../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { isSideChat, ISideChatPlacementService } from '../../../../workbench/contrib/sessions/browser/sideChatPlacement.js';
import { ChatInteractivity, IChat, ISession, SessionStatus } from '../../../../workbench/services/sessions/common/session.js';
import { AgentsWindowMenus } from '../../../browser/agentsWindowMenus.js';
import { ActiveSideChatTabContext } from '../../../common/agentsWindowContextKeys.js';

/** The side chats that come from `chat` of `session`, also those of its side chats, in the session's order, that are not archived, hidden or untitled. */
function getSideChatsOf(session: ISession, chat: IChat, reader: IReader): readonly IChat[] {
	const chats = session.chats.read(reader);
	const from = new Set([chat.resource.toString()]);
	let added = true;
	while (added) {
		added = false;
		for (const candidate of chats) {
			const parent = candidate.origin?.parentChat;
			if (isSideChat(candidate) && parent && from.has(parent.toString()) && !from.has(candidate.resource.toString())) {
				from.add(candidate.resource.toString());
				added = true;
			}
		}
	}
	return chats.filter(candidate => isSideChat(candidate) && candidate !== chat && from.has(candidate.resource.toString())
		&& !candidate.isArchived.read(reader)
		&& candidate.interactivity.read(reader) !== ChatInteractivity.Hidden
		&& candidate.status.read(reader) !== SessionStatus.Untitled);
}

const sideChatsActivityBarWhen = ContextKeyExpr.and(ChatContextKeys.enabled, IsSessionsWindowContext, IsAuxiliaryWindowContext.toNegated(), ChatContextKeys.sideChatsInSidePane);
const OPEN_SIDE_CHAT_FROM_ACTIVITY_BAR_COMMAND_ID = 'workbench.action.agentSessions.openSideChatFromActivityBar';

/**
 * Lists the side chats of the grid's active chat in the Session Activity Bar while side chats show in the side pane: one
 * entry that opens its only side chat, or a submenu of them. The entry is absent while the chat has none.
 */
export class SideChatActivityBarContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.sideChatActivityBar';

	constructor(
		@ISessionsService sessionsService: ISessionsService,
		@ISideChatPlacementService placementService: ISideChatPlacementService,
	) {
		super();

		const sideChats = derived(this, reader => {
			const session = sessionsService.gridHost.session.read(reader);
			const chat = sessionsService.gridHost.chat.read(reader);
			return placementService.inSidePane.read(reader) && session && chat ? getSideChatsOf(session, chat, reader) : [];
		});
		const open = (chat: URI) => {
			const session = sessionsService.gridHost.session.get();
			if (session) {
				sessionsService.openChat(session, chat).catch(onUnexpectedError);
			}
		};

		// The entry has the ID of the submenu, so that hiding it from the activity bar holds for one side chat and for several.
		this._register(CommandsRegistry.registerCommand(AgentsWindowMenus.SessionActivityBarSideChats.id, () => {
			const chats = sideChats.get();
			if (chats.length === 1) {
				open(chats[0].resource);
			}
		}));

		const entry = this._register(new MutableDisposable());
		const items = this._register(new MutableDisposable<DisposableStore>());
		let entryKey: string | undefined;
		let itemsKey: string | undefined;
		this._register(autorun(reader => {
			const chats = sideChats.read(reader);
			const titles = chats.map(chat => chat.title.read(reader) || localize('sideChatPane.untitled', "Side Chat"));

			const nextItemsKey = chats.length > 1 ? chats.map((chat, index) => `${chat.resource.toString()}\n${titles[index]}`).join('\n') : undefined;
			if (nextItemsKey !== itemsKey) {
				itemsKey = nextItemsKey;
				const store = new DisposableStore();
				if (chats.length > 1) {
					chats.forEach((chat, index) => {
						const id = `${OPEN_SIDE_CHAT_FROM_ACTIVITY_BAR_COMMAND_ID}.${index}`;
						const resource = chat.resource;
						store.add(CommandsRegistry.registerCommand(id, () => open(resource)));
						store.add(MenuRegistry.appendMenuItem(AgentsWindowMenus.SessionActivityBarSideChats, {
							command: { id, title: titles[index], icon: Codicon.commentDiscussion, toggled: ContextKeyExpr.and(MainEditorAreaVisibleContext, ContextKeyExpr.equals(ActiveSideChatTabContext.key, resource.toString())) },
							group: 'navigation',
							order: index,
						}));
					});
				}
				items.value = store;
			}

			const resources = chats.map(chat => chat.resource.toString());
			const nextEntryKey = chats.length === 1 ? `single:${resources[0]}\n${titles[0]}` : chats.length > 1 ? `multiple:${resources.join('\n')}` : undefined;
			if (nextEntryKey !== entryKey) {
				entryKey = nextEntryKey;
				const toggled = ContextKeyExpr.and(MainEditorAreaVisibleContext, ContextKeyExpr.or(...resources.map(resource => ContextKeyExpr.equals(ActiveSideChatTabContext.key, resource))));
				entry.value = chats.length === 1
					? MenuRegistry.appendMenuItem(Menus.SessionActivityBar, {
						command: { id: AgentsWindowMenus.SessionActivityBarSideChats.id, title: localize('sideChatActivityBar.single', "Side Chat: {0}", titles[0]), icon: Codicon.commentDiscussion, toggled },
						group: SessionActivityBarGroup.SidePanel,
						order: 5,
						when: sideChatsActivityBarWhen,
					})
					: chats.length > 1
						? MenuRegistry.appendMenuItem(Menus.SessionActivityBar, {
							submenu: AgentsWindowMenus.SessionActivityBarSideChats,
							title: localize('sideChatActivityBar.multiple', "Side Chats"),
							icon: Codicon.commentDiscussion,
							group: SessionActivityBarGroup.SidePanel,
							order: 5,
							when: sideChatsActivityBarWhen,
							toggled,
						})
						: undefined;
			}
		}));
	}
}

registerWorkbenchContribution2(SideChatActivityBarContribution.ID, SideChatActivityBarContribution, WorkbenchPhase.BlockRestore);
