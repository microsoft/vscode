/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { localize2 } from '../../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { EditorsVisibleContext, IsAuxiliaryWindowContext } from '../../../../../workbench/common/contextkeys.js';
import { AgentSessionSection, IAgentSessionSection, isAgentSessionSection } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsModel.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { AUX_WINDOW_GROUP } from '../../../../../workbench/services/editor/common/editorService.js';
import { SessionsCategories } from '../../../../common/categories.js';
import { SessionItemToolbarMenuId, SessionItemContextMenuId, IsSessionPinnedContext, IsSessionArchivedContext, IsSessionReadContext, SessionsGrouping, SessionsSorting } from './sessionsList.js';
import { ISessionsManagementService, IsNewChatSessionContext } from '../sessionsManagementService.js';
import { ISessionData, SessionStatus } from '../../common/sessionData.js';
import { IsRepositoryGroupCappedContext, SessionsViewFilterOptionsSubMenu, SessionsViewFilterSubMenu, SessionsViewGroupingContext, SessionsViewId, SessionsView, SessionsViewSortingContext } from './sessionsView.js';
import { SessionsViewId as NewChatViewId } from '../../../chat/browser/newChatViewPane.js';
import { Menus } from '../../../../browser/menus.js';
import { SessionsWelcomeVisibleContext } from '../../../../common/contextkeys.js';

//  Constants

const ACTION_ID_NEW_SESSION = 'workbench.action.chat.newChat';
//  Keybindings

KeybindingsRegistry.registerKeybindingRule({
	id: ACTION_ID_NEW_SESSION,
	weight: KeybindingWeight.WorkbenchContrib + 1,
	primary: KeyMod.CtrlCmd | KeyCode.KeyN,
});

const CLOSE_SESSION_COMMAND_ID = 'sessionsViewPane.closeSession';
registerAction2(class CloseSessionAction extends Action2 {
	constructor() {
		super({
			id: CLOSE_SESSION_COMMAND_ID,
			title: localize2('closeSession', "Close Session"),
			f1: true,
			precondition: ContextKeyExpr.and(IsNewChatSessionContext.negate(), EditorsVisibleContext.negate()),
			category: SessionsCategories.Sessions,
		});
	}
	override async run(accessor: ServicesAccessor) {
		const sessionsService = accessor.get(ISessionsManagementService);
		sessionsService.openNewSessionView();
	}
});

KeybindingsRegistry.registerKeybindingRule({
	id: CLOSE_SESSION_COMMAND_ID,
	weight: KeybindingWeight.WorkbenchContrib + 1,
	when: ContextKeyExpr.and(IsNewChatSessionContext.negate(), EditorsVisibleContext.negate()),
	primary: KeyMod.CtrlCmd | KeyCode.KeyW,
	win: { primary: KeyMod.CtrlCmd | KeyCode.F4, secondary: [KeyMod.CtrlCmd | KeyCode.KeyW] },
});

//  View Title Menu

MenuRegistry.appendMenuItem(MenuId.ViewTitle, {
	submenu: SessionsViewFilterSubMenu,
	title: localize2('filterSessions', "Filter Sessions"),
	group: 'navigation',
	order: 3,
	icon: Codicon.settings,
	when: ContextKeyExpr.equals('view', SessionsViewId)
});

MenuRegistry.appendMenuItem(SessionsViewFilterSubMenu, {
	submenu: SessionsViewFilterOptionsSubMenu,
	title: localize2('filter', "Filter"),
	group: '0_filter',
	order: 0,
});

//  Sort / Group Actions

registerAction2(class SortByCreatedAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsViewPane.sortByCreated',
			title: localize2('sortByCreated', "Sort by Created"),
			category: SessionsCategories.Sessions,
			toggled: ContextKeyExpr.equals(SessionsViewSortingContext.key, SessionsSorting.Created),
			menu: [{ id: SessionsViewFilterSubMenu, group: '1_sort', order: 0 }]
		});
	}
	override run(accessor: ServicesAccessor) {
		const viewsService = accessor.get(IViewsService);
		const view = viewsService.getViewWithId<SessionsView>(SessionsViewId);
		view?.setSorting(SessionsSorting.Created);
	}
});

registerAction2(class SortByUpdatedAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsViewPane.sortByUpdated',
			title: localize2('sortByUpdated', "Sort by Updated"),
			category: SessionsCategories.Sessions,
			toggled: ContextKeyExpr.equals(SessionsViewSortingContext.key, SessionsSorting.Updated),
			menu: [{ id: SessionsViewFilterSubMenu, group: '1_sort', order: 1 }]
		});
	}
	override run(accessor: ServicesAccessor) {
		const viewsService = accessor.get(IViewsService);
		const view = viewsService.getViewWithId<SessionsView>(SessionsViewId);
		view?.setSorting(SessionsSorting.Updated);
	}
});

registerAction2(class GroupByProjectAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsViewPane.groupByProject',
			title: localize2('groupByProject', "Group by Project"),
			category: SessionsCategories.Sessions,
			toggled: ContextKeyExpr.equals(SessionsViewGroupingContext.key, SessionsGrouping.Repository),
			menu: [{ id: SessionsViewFilterSubMenu, group: '2_group', order: 0 }]
		});
	}
	override run(accessor: ServicesAccessor) {
		const viewsService = accessor.get(IViewsService);
		const view = viewsService.getViewWithId<SessionsView>(SessionsViewId);
		view?.setGrouping(SessionsGrouping.Repository);
	}
});

registerAction2(class GroupByTimeAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsViewPane.groupByTime',
			title: localize2('groupByTime', "Group by Time"),
			category: SessionsCategories.Sessions,
			toggled: ContextKeyExpr.equals(SessionsViewGroupingContext.key, SessionsGrouping.Date),
			menu: [{ id: SessionsViewFilterSubMenu, group: '2_group', order: 1 }]
		});
	}
	override run(accessor: ServicesAccessor) {
		const viewsService = accessor.get(IViewsService);
		const view = viewsService.getViewWithId<SessionsView>(SessionsViewId);
		view?.setGrouping(SessionsGrouping.Date);
	}
});

//  Repository Group Capping

registerAction2(class ShowRecentSessionsAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsViewPane.showRecentSessions',
			title: localize2('showRecentSessions', "Show Recent Sessions"),
			category: SessionsCategories.Sessions,
			toggled: IsRepositoryGroupCappedContext,
			menu: [{
				id: SessionsViewFilterSubMenu,
				group: '3_cap',
				order: 0,
				when: ContextKeyExpr.equals(SessionsViewGroupingContext.key, SessionsGrouping.Repository),
			}]
		});
	}
	override run(accessor: ServicesAccessor) {
		const viewsService = accessor.get(IViewsService);
		const view = viewsService.getViewWithId<SessionsView>(SessionsViewId);
		view?.sessionsControl?.setRepositoryGroupCapped(true);
		IsRepositoryGroupCappedContext.bindTo(accessor.get(IContextKeyService)).set(true);
	}
});

registerAction2(class ShowAllSessionsAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsViewPane.showAllSessions',
			title: localize2('showAllSessions', "Show All Sessions"),
			category: SessionsCategories.Sessions,
			toggled: IsRepositoryGroupCappedContext.negate(),
			menu: [{
				id: SessionsViewFilterSubMenu,
				group: '3_cap',
				order: 1,
				when: ContextKeyExpr.equals(SessionsViewGroupingContext.key, SessionsGrouping.Repository),
			}]
		});
	}
	override run(accessor: ServicesAccessor) {
		const viewsService = accessor.get(IViewsService);
		const view = viewsService.getViewWithId<SessionsView>(SessionsViewId);
		view?.sessionsControl?.setRepositoryGroupCapped(false);
		IsRepositoryGroupCappedContext.bindTo(accessor.get(IContextKeyService)).set(false);
	}
});

//  View Toolbar Actions

registerAction2(class RefreshSessionsAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsViewPane.refresh',
			title: localize2('refresh', "Refresh Sessions"),
			icon: Codicon.refresh,
			f1: true,
			category: SessionsCategories.Sessions,
		});
	}
	override run(accessor: ServicesAccessor) {
		const viewsService = accessor.get(IViewsService);
		const view = viewsService.getViewWithId<SessionsView>(SessionsViewId);
		return view?.sessionsControl?.refresh();
	}
});

registerAction2(class FindSessionAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsViewPane.find',
			title: localize2('find', "Find Session"),
			icon: Codicon.search,
			category: SessionsCategories.Sessions,
			menu: [{
				id: MenuId.ViewTitle,
				group: 'navigation',
				order: 2,
				when: ContextKeyExpr.equals('view', SessionsViewId),
			}]
		});
	}
	override run(accessor: ServicesAccessor) {
		const viewsService = accessor.get(IViewsService);
		const view = viewsService.getViewWithId<SessionsView>(SessionsViewId);
		return view?.openFind();
	}
});

//  Section Actions

registerAction2(class NewSessionForRepositoryAction extends Action2 {
	constructor() {
		super({
			id: 'agentSessionSection.newSession',
			title: localize2('newSessionForRepo', "New Session"),
			icon: Codicon.newSession,
			menu: [{
				id: MenuId.AgentSessionSectionToolbar,
				group: 'navigation',
				order: 0,
				when: ChatContextKeys.agentSessionSection.isEqualTo(AgentSessionSection.Repository),
			}]
		});
	}
	async run(accessor: ServicesAccessor, context?: IAgentSessionSection): Promise<void> {
		if (!context || !isAgentSessionSection(context) || context.sessions.length === 0) {
			return;
		}
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		const viewsService = accessor.get(IViewsService);
		sessionsManagementService.openNewSessionView();
		await viewsService.openView(NewChatViewId, true);
	}
});

//  Session Item Actions

registerAction2(class PinSessionAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsViewPane.pinSession',
			title: localize2('pinSession', "Pin"),
			icon: Codicon.pin,
			menu: [{
				id: SessionItemToolbarMenuId,
				group: 'navigation',
				order: 0,
				when: ContextKeyExpr.equals(IsSessionPinnedContext.key, false),
			}, {
				id: SessionItemContextMenuId,
				group: '0_pin',
				order: 0,
				when: ContextKeyExpr.equals(IsSessionPinnedContext.key, false),
			}]
		});
	}
	run(accessor: ServicesAccessor, context?: ISessionData): void {
		if (!context) {
			return;
		}
		const viewsService = accessor.get(IViewsService);
		const view = viewsService.getViewWithId<SessionsView>(SessionsViewId);
		view?.sessionsControl?.pinSession(context);
	}
});

registerAction2(class UnpinSessionAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsViewPane.unpinSession',
			title: localize2('unpinSession', "Unpin"),
			icon: Codicon.pinned,
			menu: [{
				id: SessionItemToolbarMenuId,
				group: 'navigation',
				order: 0,
				when: ContextKeyExpr.equals(IsSessionPinnedContext.key, true),
			}, {
				id: SessionItemContextMenuId,
				group: '0_pin',
				order: 0,
				when: ContextKeyExpr.equals(IsSessionPinnedContext.key, true),
			}]
		});
	}
	run(accessor: ServicesAccessor, context?: ISessionData): void {
		if (!context) {
			return;
		}
		const viewsService = accessor.get(IViewsService);
		const view = viewsService.getViewWithId<SessionsView>(SessionsViewId);
		view?.sessionsControl?.unpinSession(context);
	}
});

registerAction2(class ArchiveSessionAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsViewPane.archiveSession',
			title: localize2('archiveSession', "Archive"),
			icon: Codicon.archive,
			menu: [{
				id: SessionItemToolbarMenuId,
				group: 'navigation',
				order: 1,
				when: ContextKeyExpr.equals(IsSessionArchivedContext.key, false),
			}, {
				id: SessionItemContextMenuId,
				group: '1_edit',
				order: 2,
				when: ContextKeyExpr.equals(IsSessionArchivedContext.key, false),
			}]
		});
	}
	async run(accessor: ServicesAccessor, context?: ISessionData): Promise<void> {
		if (!context) {
			return;
		}
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		await sessionsManagementService.archiveSession(context);
	}
});

registerAction2(class UnarchiveSessionAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsViewPane.unarchiveSession',
			title: localize2('unarchiveSession', "Unarchive"),
			icon: Codicon.unarchive,
			menu: [{
				id: SessionItemToolbarMenuId,
				group: 'navigation',
				order: 1,
				when: ContextKeyExpr.equals(IsSessionArchivedContext.key, true),
			}, {
				id: SessionItemContextMenuId,
				group: '1_edit',
				order: 2,
				when: ContextKeyExpr.equals(IsSessionArchivedContext.key, true),
			}]
		});
	}
	async run(accessor: ServicesAccessor, context?: ISessionData): Promise<void> {
		if (!context) {
			return;
		}
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		await sessionsManagementService.unarchiveSession(context);
	}
});

registerAction2(class MarkSessionReadAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsViewPane.markRead',
			title: localize2('markRead', "Mark as Read"),
			menu: [{
				id: SessionItemContextMenuId,
				group: '0_read',
				order: 0,
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals(IsSessionReadContext.key, false),
					ContextKeyExpr.equals(IsSessionArchivedContext.key, false),
				),
			}]
		});
	}
	run(accessor: ServicesAccessor, context?: ISessionData): void {
		if (!context) {
			return;
		}
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		sessionsManagementService.setRead(context, true);
	}
});

registerAction2(class MarkSessionUnreadAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsViewPane.markUnread',
			title: localize2('markUnread', "Mark as Unread"),
			menu: [{
				id: SessionItemContextMenuId,
				group: '0_read',
				order: 0,
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals(IsSessionReadContext.key, true),
					ContextKeyExpr.equals(IsSessionArchivedContext.key, false),
				),
			}]
		});
	}
	run(accessor: ServicesAccessor, context?: ISessionData): void {
		if (!context) {
			return;
		}
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		sessionsManagementService.setRead(context, false);
	}
});

registerAction2(class OpenSessionInNewWindowAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsViewPane.openInNewWindow',
			title: localize2('openInNewWindow', "Open in New Window"),
			menu: [{
				id: SessionItemContextMenuId,
				group: 'navigation',
				order: 0,
			}]
		});
	}
	async run(accessor: ServicesAccessor, context?: ISessionData): Promise<void> {
		if (!context) {
			return;
		}
		const chatWidgetService = accessor.get(IChatWidgetService);
		await chatWidgetService.openSession(context.resource, AUX_WINDOW_GROUP, {
			auxiliary: { compact: true, bounds: { width: 800, height: 640 } },
			pinned: true
		});
	}
});

registerAction2(class MarkAllSessionsReadAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsViewPane.markAllRead',
			title: localize2('markAllRead', "Mark All as Read"),
			menu: [{
				id: SessionItemContextMenuId,
				group: '0_read',
				order: 1,
			}]
		});
	}
	run(accessor: ServicesAccessor): void {
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		const sessions = sessionsManagementService.getSessions();
		for (const session of sessions) {
			if (!session.isArchived.get() && !session.isRead.get()) {
				sessionsManagementService.setRead(session, true);
			}
		}
	}
});

registerAction2(class MarkSessionAsDoneAction extends Action2 {

	constructor() {
		super({
			id: 'agentSession.markAsDone',
			title: localize2('markAsDone', "Mark as Done"),
			icon: Codicon.check,
			menu: [{
				id: Menus.CommandCenter,
				order: 102,
				when: ContextKeyExpr.and(
					IsAuxiliaryWindowContext.negate(),
					SessionsWelcomeVisibleContext.negate(),
					IsNewChatSessionContext.negate()
				)
			}]
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const sessionsManagementService = accessor.get(ISessionsManagementService);

		const activeSession = sessionsManagementService.activeSession.get();
		if (!activeSession || activeSession.status.get() === SessionStatus.Untitled) {
			return;
		}
		sessionsManagementService.archiveSession(activeSession);
	}
});
