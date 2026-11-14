/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
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
import { getSessionPresentationWorkspace, ISession } from '../../../../services/sessions/common/session.js';
import { INewSessionTarget } from '../parts/chatView.js';
import { SessionItemIsMultiSelectionContext } from '../../common/contextkeys.js';
import { ISessionSection, QUICK_CHATS_SECTION_ID, SessionItemContextMenuId, SessionSectionToolbarMenuId, SessionSectionTypeContext } from '../views/sessionsList.js';
import { registerSessionsListReadStateCommands } from '../views/sessionsListActions.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { AICustomizationManagementCommands } from '../../../chat/common/aiCustomizationWorkspaceService.js';
import { AGENT_HOST_ENABLED_CONTEXT_KEY } from '../../../../../platform/agentHost/common/agentHostEnablementService.js';

/** Whether the chat part of the editor window shows. */
export const AgentsChatPartVisibleContext = new RawContextKey<boolean>('agentsChatPartVisible', false, localize('agentsChatPartVisible', "Whether the chat part beside the editor area shows."));

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
				menu: [{ id: Menus.SidebarSessionsHeader, group: 'navigation', order: 0, when: ChatContextKeys.enabled }],
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
				title: localize2('agentsView.focusChatPart', "Focus Chat Part"),
				category: CHAT_CATEGORY,
				f1: true,
				precondition: ContextKeyExpr.and(ChatContextKeys.enabled, AgentsChatPartVisibleContext),
			});
		}
		run(accessor: ServicesAccessor): void {
			accessor.get(IAgentsChatPartService).focus();
		}
	}));

	store.add(registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.agentsView.closeChatPart',
				title: localize2('agentsView.closeChatPart', "Close Chat Part"),
				category: CHAT_CATEGORY,
				f1: true,
				precondition: AgentsChatPartVisibleContext,
				// Last in the More Actions of the chat it shows, in a group of its own: of its session header, or of its group's
				// tabs while it shows them
				menu: [
					...SessionHeaderMenus.map(id => ({ id, group: 'secondary/z_close', order: 1, when: ContextKeyExpr.and(ChatContextKeys.enabled, AgentsChatPartVisibleContext) })),
					{ id: MenuId.EditorTitle, group: 'z_close', order: 1, when: ContextKeyExpr.and(ChatContextKeys.enabled, AgentsChatPartVisibleContext, InAgentsChatPartContext) },
				],
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
					...localize2('agentsView.toggleChatPart', "Toggle Chat Part Visibility"),
					mnemonicTitle: localize({ key: 'miAgentsViewChatPart', comment: ['&& denotes a mnemonic'] }, "C&&hat Part"),
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

	// The customizations of a session, as the Agents window offers them from its session list. Its editor opens as any editor
	// does: an editor opened while the chat part was the part last active goes to the editor area, as its chats hand it off
	store.add(registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.agentsView.openSessionCustomizations',
				title: localize2('agentsView.openSessionCustomizations', "Open Customizations"),
				icon: Codicon.extensions,
				precondition: ContextKeyExpr.and(ChatContextKeys.enabled, SessionItemIsMultiSelectionContext.negate()),
				menu: {
					id: SessionItemContextMenuId,
					group: 'navigation',
					order: 6,
					when: ChatContextKeys.enabled,
				},
			});
		}
		async run(accessor: ServicesAccessor, context?: ISession | ISession[]): Promise<void> {
			const sessions = context ? Array.isArray(context) ? context : [context] : [];
			if (sessions.length !== 1) {
				throw new Error(localize('agentsView.openSessionCustomizations.selectSingleSession', "Select a single session to open its customizations."));
			}
			await accessor.get(ICommandService).executeCommand(AICustomizationManagementCommands.OpenEditor, { sessionResource: sessions[0].resource });
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
