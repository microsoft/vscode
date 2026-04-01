/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { EditorsVisibleContext, IsAuxiliaryWindowContext, IsSessionsWindowContext } from '../../../../../workbench/common/contextkeys.js';
import { IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { AUX_WINDOW_GROUP } from '../../../../../workbench/services/editor/common/editorService.js';
import { SessionsCategories } from '../../../../common/categories.js';
import { ChatSessionProviderIdContext, IsNewChatSessionContext, SessionsWelcomeVisibleContext } from '../../../../common/contextkeys.js';
import { SessionItemToolbarMenuId, SessionItemContextMenuId, SessionSectionToolbarMenuId, SessionSectionTypeContext, IsSessionPinnedContext, IsSessionArchivedContext, IsSessionReadContext, SessionsGrouping, SessionsSorting, ISessionSection } from './sessionsList.js';
import { ISessionsManagementService } from '../sessionsManagementService.js';
import { ISession, SessionStatus } from '../../common/sessionData.js';
import { IsWorkspaceGroupCappedContext, SessionsViewFilterOptionsSubMenu, SessionsViewFilterSubMenu, SessionsViewGroupingContext, SessionsViewId, SessionsView, SessionsViewSortingContext } from './sessionsView.js';
import { SessionsViewId as NewChatViewId, NewChatViewPane } from '../../../chat/browser/newChatViewPane.js';
import { Menus } from '../../../../browser/menus.js';

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

registerAction2(class GroupByWorkspaceAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsViewPane.groupByWorkspace',
			title: localize2('groupByWorkspace', "Group by Workspace"),
			category: SessionsCategories.Sessions,
			toggled: ContextKeyExpr.equals(SessionsViewGroupingContext.key, SessionsGrouping.Workspace),
			menu: [{ id: SessionsViewFilterSubMenu, group: '2_group', order: 0 }]
		});
	}
	override run(accessor: ServicesAccessor) {
		const viewsService = accessor.get(IViewsService);
		const view = viewsService.getViewWithId<SessionsView>(SessionsViewId);
		view?.setGrouping(SessionsGrouping.Workspace);
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

//  Workspace Group Capping

registerAction2(class ShowRecentWorkspaceSessionsAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsViewPane.showRecentSessions',
			title: localize2('showRecentSessions', "Show Recent Sessions"),
			category: SessionsCategories.Sessions,
			toggled: IsWorkspaceGroupCappedContext,
			menu: [{
				id: SessionsViewFilterSubMenu,
				group: '3_cap',
				order: 0,
				when: ContextKeyExpr.equals(SessionsViewGroupingContext.key, SessionsGrouping.Workspace),
			}]
		});
	}
	override run(accessor: ServicesAccessor) {
		const viewsService = accessor.get(IViewsService);
		const view = viewsService.getViewWithId<SessionsView>(SessionsViewId);
		view?.sessionsControl?.setWorkspaceGroupCapped(true);
		IsWorkspaceGroupCappedContext.bindTo(accessor.get(IContextKeyService)).set(true);
	}
});

registerAction2(class ShowAllWorkspaceSessionsAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsViewPane.showAllSessions',
			title: localize2('showAllSessions', "Show All Sessions"),
			category: SessionsCategories.Sessions,
			toggled: IsWorkspaceGroupCappedContext.negate(),
			menu: [{
				id: SessionsViewFilterSubMenu,
				group: '3_cap',
				order: 1,
				when: ContextKeyExpr.equals(SessionsViewGroupingContext.key, SessionsGrouping.Workspace),
			}]
		});
	}
	override run(accessor: ServicesAccessor) {
		const viewsService = accessor.get(IViewsService);
		const view = viewsService.getViewWithId<SessionsView>(SessionsViewId);
		view?.sessionsControl?.setWorkspaceGroupCapped(false);
		IsWorkspaceGroupCappedContext.bindTo(accessor.get(IContextKeyService)).set(false);
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

registerAction2(class NewSessionForWorkspaceAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsView.sectionNewSession',
			title: localize2('newSessionForWorkspace', "New Session"),
			icon: Codicon.plus,
			menu: [{
				id: SessionSectionToolbarMenuId,
				group: 'navigation',
				order: 0,
				when: ContextKeyExpr.equals(SessionSectionTypeContext.key, 'workspace'),
			}]
		});
	}
	async run(accessor: ServicesAccessor, context?: ISessionSection): Promise<void> {
		if (!context || !context.sessions || context.sessions.length === 0) {
			return;
		}
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		const viewsService = accessor.get(IViewsService);
		sessionsManagementService.openNewSessionView();
		const view = await viewsService.openView<NewChatViewPane>(NewChatViewId, true);
		const workspace = context.sessions[0].workspace.get();
		if (view && workspace) {
			view.selectWorkspace({ providerId: context.sessions[0].providerId, workspace });
		}
	}
});

const ConfirmArchiveStorageKey = 'sessions.confirmArchive';

registerAction2(class ArchiveSectionAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsView.sectionArchive',
			title: localize2('archiveSection', "Archive All"),
			icon: Codicon.archive,
			menu: [{
				id: SessionSectionToolbarMenuId,
				group: 'navigation',
				order: 1,
				when: ContextKeyExpr.notEquals(SessionSectionTypeContext.key, 'archived'),
			}]
		});
	}
	async run(accessor: ServicesAccessor, context?: ISessionSection): Promise<void> {
		if (!context || !context.sessions || context.sessions.length === 0) {
			return;
		}

		const sessionsManagementService = accessor.get(ISessionsManagementService);
		const dialogService = accessor.get(IDialogService);
		const storageService = accessor.get(IStorageService);

		const skipConfirmation = storageService.getBoolean(ConfirmArchiveStorageKey, StorageScope.PROFILE, false);
		if (!skipConfirmation) {
			const confirmed = await dialogService.confirm({
				message: context.sessions.length === 1
					? localize('archiveSectionSessions.confirmSingle', "Are you sure you want to archive 1 session from '{0}'?", context.label)
					: localize('archiveSectionSessions.confirm', "Are you sure you want to archive {0} sessions from '{1}'?", context.sessions.length, context.label),
				detail: localize('archiveSectionSessions.detail', "You can unarchive sessions later if needed from the sessions view."),
				primaryButton: localize('archiveSectionSessions.archive', "Archive All"),
				checkbox: {
					label: localize('doNotAskAgain', "Do not ask me again")
				}
			});

			if (!confirmed.confirmed) {
				return;
			}

			if (confirmed.checkboxChecked) {
				storageService.store(ConfirmArchiveStorageKey, true, StorageScope.PROFILE, StorageTarget.USER);
			}
		}

		for (const session of context.sessions) {
			await sessionsManagementService.archiveSession(session);
		}
	}
});

registerAction2(class UnarchiveSectionAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsView.sectionUnarchive',
			title: localize2('unarchiveSection', "Unarchive All"),
			icon: Codicon.unarchive,
			menu: [{
				id: SessionSectionToolbarMenuId,
				group: 'navigation',
				order: 1,
				when: ContextKeyExpr.equals(SessionSectionTypeContext.key, 'archived'),
			}]
		});
	}
	async run(accessor: ServicesAccessor, context?: ISessionSection): Promise<void> {
		if (!context || !context.sessions || context.sessions.length === 0) {
			return;
		}

		const sessionsManagementService = accessor.get(ISessionsManagementService);
		const dialogService = accessor.get(IDialogService);
		const storageService = accessor.get(IStorageService);

		if (context.sessions.length > 1) {
			const skipConfirmation = storageService.getBoolean(ConfirmArchiveStorageKey, StorageScope.PROFILE, false);
			if (!skipConfirmation) {
				const confirmed = await dialogService.confirm({
					message: localize('unarchiveSectionSessions.confirm', "Are you sure you want to unarchive {0} sessions?", context.sessions.length),
					primaryButton: localize('unarchiveSectionSessions.unarchive', "Unarchive All"),
					checkbox: {
						label: localize('doNotAskAgain2', "Do not ask me again")
					}
				});

				if (!confirmed.confirmed) {
					return;
				}

				if (confirmed.checkboxChecked) {
					storageService.store(ConfirmArchiveStorageKey, true, StorageScope.PROFILE, StorageTarget.USER);
				}
			}
		}

		for (const session of context.sessions) {
			await sessionsManagementService.unarchiveSession(session);
		}
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
				order: 2,
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals(IsSessionPinnedContext.key, false),
					ContextKeyExpr.equals(IsSessionArchivedContext.key, false),
				),
			}, {
				id: SessionItemContextMenuId,
				group: '0_pin',
				order: 0,
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals(IsSessionPinnedContext.key, false),
					ContextKeyExpr.equals(IsSessionArchivedContext.key, false),
				),
			}]
		});
	}
	run(accessor: ServicesAccessor, context?: ISession | ISession[]): void {
		if (!context) {
			return;
		}
		const sessions = Array.isArray(context) ? context : [context];
		const viewsService = accessor.get(IViewsService);
		const view = viewsService.getViewWithId<SessionsView>(SessionsViewId);
		for (const session of sessions) {
			view?.sessionsControl?.pinSession(session);
		}
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
				order: 2,
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals(IsSessionPinnedContext.key, true),
					ContextKeyExpr.equals(IsSessionArchivedContext.key, false),
				),
			}, {
				id: SessionItemContextMenuId,
				group: '0_pin',
				order: 0,
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals(IsSessionPinnedContext.key, true),
					ContextKeyExpr.equals(IsSessionArchivedContext.key, false),
				),
			}]
		});
	}
	run(accessor: ServicesAccessor, context?: ISession | ISession[]): void {
		if (!context) {
			return;
		}
		const sessions = Array.isArray(context) ? context : [context];
		const viewsService = accessor.get(IViewsService);
		const view = viewsService.getViewWithId<SessionsView>(SessionsViewId);
		for (const session of sessions) {
			view?.sessionsControl?.unpinSession(session);
		}
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
	async run(accessor: ServicesAccessor, context?: ISession | ISession[]): Promise<void> {
		if (!context) {
			return;
		}
		const sessions = Array.isArray(context) ? context : [context];
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		for (const session of sessions) {
			await sessionsManagementService.archiveSession(session);
		}
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
	async run(accessor: ServicesAccessor, context?: ISession | ISession[]): Promise<void> {
		if (!context) {
			return;
		}
		const sessions = Array.isArray(context) ? context : [context];
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		for (const session of sessions) {
			await sessionsManagementService.unarchiveSession(session);
		}
	}
});

registerAction2(class RenameSessionAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsViewPane.renameSession',
			title: localize2('renameSession', "Rename..."),
			menu: [{
				id: SessionItemContextMenuId,
				group: '1_edit',
				order: 1,
				when: ContextKeyExpr.regex(ChatSessionProviderIdContext.key, /^agenthost-/),
			}]
		});
	}
	async run(accessor: ServicesAccessor, context?: ISession | ISession[]): Promise<void> {
		const session = Array.isArray(context) ? context[0] : context;
		if (!session) {
			return;
		}
		const quickInputService = accessor.get(IQuickInputService);
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		const newTitle = await quickInputService.input({
			value: session.title.get(),
			prompt: localize('renameSession.prompt', "New agent session title"),
			validateInput: async value => {
				if (!value.trim()) {
					return localize('renameSession.empty', "Title cannot be empty");
				}
				return undefined;
			}
		});
		if (newTitle) {
			const trimmedTitle = newTitle.trim();
			if (trimmedTitle) {
				await sessionsManagementService.renameChat(session.mainChat, trimmedTitle);
			}
		}
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
	run(accessor: ServicesAccessor, context?: ISession | ISession[]): void {
		if (!context) {
			return;
		}
		const sessions = Array.isArray(context) ? context : [context];
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		for (const session of sessions) {
			sessionsManagementService.setRead(session, true);
		}
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
	run(accessor: ServicesAccessor, context?: ISession | ISession[]): void {
		if (!context) {
			return;
		}
		const sessions = Array.isArray(context) ? context : [context];
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		for (const session of sessions) {
			sessionsManagementService.setRead(session, false);
		}
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
	async run(accessor: ServicesAccessor, context?: ISession | ISession[]): Promise<void> {
		if (!context) {
			return;
		}
		const sessions = Array.isArray(context) ? context : [context];
		const chatWidgetService = accessor.get(IChatWidgetService);
		const sessionsManagementService = accessor.get(ISessionsManagementService);

		sessionsManagementService.openNewSessionView(); // running this first to address focus issues

		for (const session of sessions) {
			await chatWidgetService.openSession(session.resource, AUX_WINDOW_GROUP, {
				auxiliary: { compact: true, bounds: { width: 800, height: 640 } },
				pinned: true
			});
		}
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
				order: 103,
				when: ContextKeyExpr.and(
					IsAuxiliaryWindowContext.negate(),
					SessionsWelcomeVisibleContext.negate(),
					IsNewChatSessionContext.negate()
				)
			},
			{
				id: MenuId.ChatEditingSessionChangesToolbar,
				group: 'navigation',
				order: 1,
				when: ContextKeyExpr.and(
					IsSessionsWindowContext,
					ContextKeyExpr.equals('sessions.hasPullRequest', true),
					ContextKeyExpr.equals('sessions.hasOpenPullRequest', false),
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

registerAction2(class AddChatAction extends Action2 {

	constructor() {
		super({
			id: 'agentSession.addChat',
			title: localize2('addChat', "Add Chat"),
			icon: Codicon.plus,
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
		const quickInputService = accessor.get(IQuickInputService);

		const activeSession = sessionsManagementService.activeSession.get();
		if (!activeSession || activeSession.status.get() === SessionStatus.Untitled) {
			return;
		}

		const query = await quickInputService.input({
			placeHolder: localize('addChat.placeholder', "Enter a prompt for the new chat"),
			prompt: localize('addChat.prompt', "Add a new chat to the active session"),
		});

		if (query) {
			await sessionsManagementService.sendAndCreateChat({ query }, activeSession);
		}
	}
});
