/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ChatViewId } from '../../../chat/browser/chat.js';
import { ContextKeyExpr, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchLayoutService, Parts } from '../../../../services/layout/browser/layoutService.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { CHAT_CATEGORY } from '../../../chat/browser/actions/chatActions.js';
import { Menus, SessionHeaderMenus } from '../menus.js';
import { InAgentsChatPartContext } from './agentsChatPartContext.js';
import { IAgentsChatPartService } from './agentsChatPart.js';
import { getEditorWindowComposerTarget } from '../editorWindow/editorWindowSessionsPresenter.js';
import { URI } from '../../../../../base/common/uri.js';
import { getSessionPresentationWorkspace, IChat, ISession } from '../../../../services/sessions/common/session.js';
import { INewSessionTarget } from '../parts/chatView.js';
import { SessionIsArchivedContext, SessionIsCreatedContext, SessionItemIsMultiSelectionContext, SessionSupportsRenameContext } from '../../common/contextkeys.js';
import { ISessionSection, QUICK_CHATS_SECTION_ID, SessionItemContextMenuId, SessionSectionToolbarMenuId, SessionSectionTypeContext } from '../views/sessionsList.js';
import { registerSessionsListReadStateCommands } from '../views/sessionsListActions.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { AGENT_HOST_ENABLED_CONTEXT_KEY } from '../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { RENAME_SESSION_COMMAND_ID } from '../../common/sessionCommands.js';
import { SESSIONS_CHAT_TABS_SETTING, SessionsChatTabsMode } from '../../common/sessionConfig.js';

/** Closes the chat of a header of the chat part (see `registerAgentsChatPartActions`). */
export const AGENTS_CHAT_PART_CLOSE_CHAT_COMMAND_ID = 'workbench.action.agentsView.closeChat';

/** Closes all the chats of the chat part, which closes it (see `registerAgentsChatPartActions`). */
export const AGENTS_CHAT_PART_CLOSE_ALL_CHATS_COMMAND_ID = 'workbench.action.agentsView.closeAllChats';

/** Whether the chat part of the editor window shows. */
export const AgentsChatPartVisibleContext = new RawContextKey<boolean>('agentsChatPartVisible', false, localize('agentsChatPartVisible', "Whether the chat area beside the editor area shows."));

/**
 * Registers the actions of the chat part of an editor window with the Sessions view, until the returned disposable is
 * disposed: a new session or a new chat without a workspace in a tab of its own, and focusing, toggling and closing the
 * chat part.
 */
export function registerAgentsChatPartActions(): IDisposable {
	const store = new DisposableStore();

	store.add(registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.agentsView.newSession',
				title: localize2('agentsView.newSession', "New Session"),
				icon: Codicon.add,
				category: CHAT_CATEGORY,
				f1: true,
				precondition: ChatContextKeys.enabled,
				// Not in the header of the sessions list of the Chat view, whose title has New Chat already
				menu: [{ id: Menus.SidebarSessionsHeader, group: 'navigation', order: 0, when: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.notEquals('view', ChatViewId)) }],
			});
		}
		async run(accessor: ServicesAccessor): Promise<void> {
			const chatPart = accessor.get(IAgentsChatPartService);
			await chatPart.openComposer(getEditorWindowComposerTarget(accessor.get(IWorkspaceContextService), accessor.get(IEditorService)));
		}
	}));

	// A chat without a workspace, as the Agents window has it: from the Chats section of the Sessions list and the Command
	// Palette, without the Agents window's keybinding, which an editor window has for its editors
	const quickChatEnabled = ContextKeyExpr.and(ChatContextKeys.enabled, AGENT_HOST_ENABLED_CONTEXT_KEY);
	store.add(registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.agentsView.newQuickChat',
				title: localize2('agentsView.newQuickChat', "New Quick Chat"),
				icon: Codicon.add,
				category: CHAT_CATEGORY,
				f1: true,
				precondition: quickChatEnabled,
				menu: [SessionSectionToolbarMenuId, Menus.SessionSectionContext].map(id => ({
					id,
					group: 'navigation',
					order: 0,
					when: ContextKeyExpr.and(quickChatEnabled, ContextKeyExpr.equals(SessionSectionTypeContext.key, QUICK_CHATS_SECTION_ID)),
				})),
			});
		}
		async run(accessor: ServicesAccessor): Promise<void> {
			// A target without a folder is a chat without a workspace
			await accessor.get(IAgentsChatPartService).openComposer({}, { newComposer: true });
		}
	}));

	store.add(registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.agentsView.focusChatPart',
				title: localize2('agentsView.focusChatPart', "Focus Chat Area"),
				category: CHAT_CATEGORY,
				f1: true,
				precondition: ContextKeyExpr.and(ChatContextKeys.enabled, AgentsChatPartVisibleContext),
			});
		}
		run(accessor: ServicesAccessor): void {
			accessor.get(IAgentsChatPartService).focus();
		}
	}));

	// Closes the chat of a header of the chat part, first in its More Actions, as the Agents window closes the chat of a
	// session header: the tab of that chat. Its keybinding closes the active tab of the chat part, as closing an editor does.
	const inChatPart = ContextKeyExpr.and(ChatContextKeys.enabled, InAgentsChatPartContext);
	store.add(registerAction2(class extends Action2 {
		constructor() {
			super({
				id: AGENTS_CHAT_PART_CLOSE_CHAT_COMMAND_ID,
				title: localize2('agentsView.closeChat', "Close"),
				precondition: ChatContextKeys.enabled,
				keybinding: {
					weight: KeybindingWeight.WorkbenchContrib + 1,
					when: inChatPart,
					primary: KeyMod.CtrlCmd | KeyCode.KeyW,
					win: { primary: KeyMod.CtrlCmd | KeyCode.F4, secondary: [KeyMod.CtrlCmd | KeyCode.KeyW] },
				},
				menu: SessionHeaderMenus.map(id => ({ id, group: 'secondary/0_pane', order: 10, when: inChatPart })),
			});
		}
		async run(accessor: ServicesAccessor, session?: ISession, chat?: IChat): Promise<void> {
			// The header's chat: a peer chat, else the session's main chat
			const resource = chat?.resource ?? session?.mainChat.get().resource;
			if (resource) {
				await accessor.get(IAgentsChatPartService).closeChat(resource);
			} else {
				// From its keybinding: the active tab of the chat part, which has the focus
				const pane = accessor.get(IEditorService).activeEditorPane;
				if (pane?.input) {
					await pane.group.closeEditor(pane.input);
				}
			}
		}
	}));

	// Closes all the chats of the chat part, which closes it: right after Close in the More Actions of a header of a chat it shows,
	// while it shows them as tabs; in Single, it shows one at a time
	store.add(registerAction2(class extends Action2 {
		constructor() {
			super({
				id: AGENTS_CHAT_PART_CLOSE_ALL_CHATS_COMMAND_ID,
				title: localize2('agentsView.closeAllChats', "Close All"),
				precondition: ChatContextKeys.enabled,
				menu: SessionHeaderMenus.map(id => ({ id, group: 'secondary/0_pane', order: 20, when: ContextKeyExpr.and(inChatPart, ContextKeyExpr.equals(`config.${SESSIONS_CHAT_TABS_SETTING}`, SessionsChatTabsMode.Multiple)) })),
			});
		}
		async run(accessor: ServicesAccessor): Promise<void> {
			await accessor.get(IAgentsChatPartService).closeAllChats();
		}
	}));

	// Of the Agents window's More Actions of a session header, those an editor window has: renaming the session, which its
	// sessions list registers, and how chats show their progress
	for (const id of SessionHeaderMenus) {
		store.add(MenuRegistry.appendMenuItem(id, {
			command: { id: RENAME_SESSION_COMMAND_ID, title: localize2('agentsView.renameSession', "Rename...") },
			group: 'secondary/4_manage',
			order: 5,
			when: ContextKeyExpr.and(inChatPart, SessionIsCreatedContext, SessionSupportsRenameContext, SessionIsArchivedContext.negate()),
		}));
		store.add(MenuRegistry.appendMenuItem(id, {
			submenu: MenuId.ChatViewMode,
			title: localize2('agentsView.viewMode', "View Mode"),
			group: 'secondary/4_manage',
			order: 10,
			when: inChatPart,
		}));
	}

	store.add(registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.agentsView.closeChatPart',
				title: localize2('agentsView.closeChatPart', "Close Chat Area"),
				category: CHAT_CATEGORY,
				f1: true,
				precondition: AgentsChatPartVisibleContext,
				// Last in the More Actions of its group's tabs while it shows them, in a group of its own: the session header of a
				// chat it shows offers Close All instead
				menu: [{ id: MenuId.EditorTitle, group: 'z_close', order: 1, when: ContextKeyExpr.and(ChatContextKeys.enabled, AgentsChatPartVisibleContext, InAgentsChatPartContext) }],
			});
		}
		run(accessor: ServicesAccessor): void {
			accessor.get(IWorkbenchLayoutService).setPartHidden(true, Parts.CHAT_PART);
		}
	}));

	store.add(registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.agentsView.toggleChatPart',
				title: {
					...localize2('agentsView.toggleChatPart', "Toggle Chat Area Visibility"),
					mnemonicTitle: localize({ key: 'miAgentsViewChatPart', comment: ['&& denotes a mnemonic'] }, "C&&hat Area"),
				},
				category: CHAT_CATEGORY,
				f1: true,
				precondition: ContextKeyExpr.or(ChatContextKeys.enabled, AgentsChatPartVisibleContext),
				toggled: AgentsChatPartVisibleContext,
				menu: [{ id: MenuId.MenubarAppearanceMenu, group: '2_workbench_layout', order: 6, when: ChatContextKeys.enabled }],
			});
		}
		async run(accessor: ServicesAccessor): Promise<void> {
			const chatPart = accessor.get(IAgentsChatPartService);
			const layoutService = accessor.get(IWorkbenchLayoutService);
			if (layoutService.isVisible(Parts.CHAT_PART)) {
				layoutService.setPartHidden(true, Parts.CHAT_PART);
			} else {
				await chatPart.show(getEditorWindowComposerTarget(accessor.get(IWorkspaceContextService), accessor.get(IEditorService)));
			}
		}
	}));

	// What Mark as Read and Mark as Unread of a chat tab run in an editor window, whose agent sessions own their command ids
	store.add(registerSessionsListReadStateCommands());

	return store;
}

/**
 * Registers the actions of the Sessions list of an editor window that start a new session in the chat part, until the
 * returned disposable is disposed: in the worktree of a section of the Worktree grouping, and in the folder of a session.
 */
export function registerAgentsViewNewSessionActions(): IDisposable {
	const store = new DisposableStore();

	// A new session in the folder or worktree of a section of the Worktree grouping: not of its Other section
	store.add(registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.agentsView.newSessionInWorktree',
				title: localize2('agentsView.newSessionInWorktree', "New Session"),
				icon: Codicon.plus,
				precondition: ChatContextKeys.enabled,
				menu: [SessionSectionToolbarMenuId, Menus.SessionSectionContext].map(id => ({
					id,
					group: 'navigation',
					order: 0,
					when: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals(SessionSectionTypeContext.key, 'worktree')),
				})),
			});
		}
		async run(accessor: ServicesAccessor, section?: ISessionSection): Promise<void> {
			// Not in its Other section, of the sessions without a local checkout or worktree
			if (!section?.id.startsWith('worktree:') || section.id === 'worktree:other') {
				return;
			}
			// In the section's checkout or worktree, which its sessions work in, as its latest session, such as with the same agent
			const latest = [...section.sessions].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).at(0);
			const folderUri = latest && getSessionFolder(latest);
			if (!folderUri) {
				return;
			}
			await accessor.get(IAgentsChatPartService).openComposer(getNewSessionTarget(folderUri, latest), { newComposer: true });
		}
	}));

	// A new session in the folder or worktree of a session
	store.add(registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.agentsView.newSessionInSameFolder',
				title: localize2('agentsView.newSessionInSameFolder', "New Session in Same Folder"),
				// For one session: its folder
				precondition: ContextKeyExpr.and(ChatContextKeys.enabled, SessionItemIsMultiSelectionContext.negate()),
				// Shown, disabled, while several sessions are selected, as the other session actions are
				menu: [{ id: SessionItemContextMenuId, group: '0_new', order: 0, when: ChatContextKeys.enabled }],
			});
		}
		async run(accessor: ServicesAccessor, context?: ISession | ISession[]): Promise<void> {
			const session = Array.isArray(context) ? (context.length === 1 ? context[0] : undefined) : context;
			const folderUri = session && getSessionFolder(session);
			if (session && folderUri) {
				await accessor.get(IAgentsChatPartService).openComposer(getNewSessionTarget(folderUri, session), { newComposer: true });
			}
		}
	}));

	return store;
}

/** The folder a session works in: its worktree or its folder. */
function getSessionFolder(session: ISession): URI | undefined {
	const folder = getSessionPresentationWorkspace(session, undefined)?.folders[0];
	return folder?.workingDirectory ?? folder?.root;
}

/** A new session in `folderUri`, with the agent of `like`, such as the session it starts from. */
function getNewSessionTarget(folderUri: URI, like: ISession | undefined): INewSessionTarget {
	return like ? { folderUri, providerId: like.providerId, sessionTypeId: like.sessionType } : { folderUri };
}
