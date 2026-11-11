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
import { InAgentsChatPartContext } from './agentsView.js';
import { getAgentsChatPartComposerTarget, IAgentsChatPartService } from './agentsChatPart.js';
import { URI } from '../../../../../base/common/uri.js';
import { getSessionPresentationWorkspace, ISession } from '../../../../services/sessions/common/session.js';
import { INewSessionTarget } from '../parts/chatView.js';
import { getWorktreeSectionFolder, ISessionSection, SessionItemContextMenuId, SessionSectionToolbarMenuId, SessionSectionTypeContext } from '../views/sessionsList.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';

/** Whether the chat part of the editor window shows. */
export const AgentsChatPartVisibleContext = new RawContextKey<boolean>('agentsChatPartVisible', false, localize('agentsChatPartVisible', "Whether the chat part beside the editor area shows."));

/**
 * Registers the actions of the chat part of an editor window with the Sessions view, until the returned disposable is
 * disposed: a new session in a tab of its own, and focusing, toggling and closing the chat part.
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
			await chatPart.openComposer(getAgentsChatPartComposerTarget(accessor.get(IWorkspaceContextService), accessor.get(IEditorService)));
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
				await chatPart.show(getAgentsChatPartComposerTarget(accessor.get(IWorkspaceContextService), accessor.get(IEditorService)));
			}
		}
	}));

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
			const folderUri = section && getWorktreeSectionFolder(section.id);
			if (!folderUri) {
				return;
			}
			// As its latest session, such as with the same agent
			const latest = [...section.sessions].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).at(0);
			await accessor.get(IAgentsChatPartService).openComposer(getNewSessionTarget(folderUri, latest), { newComposer: true });
		}
	}));

	// A new session in the folder or worktree of a session
	store.add(registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.agentsView.newSessionInSameFolder',
				title: localize2('agentsView.newSessionInSameFolder', "New Session in Same Folder"),
				precondition: ChatContextKeys.enabled,
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
