/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from '../../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { KeybindingsRegistry } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { EditorsVisibleContext, IsAuxiliaryWindowContext, IsSessionsWindowContext } from '../../../../../workbench/common/contextkeys.js';
import { IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { AUX_WINDOW_GROUP } from '../../../../../workbench/services/editor/common/editorService.js';
import { SessionsCategories } from '../../../../common/categories.js';
import { ChatSessionProviderIdContext, IsNewChatSessionContext, SessionsWelcomeVisibleContext } from '../../../../common/contextkeys.js';
import { SessionItemToolbarMenuId, SessionItemContextMenuId, SessionSectionToolbarMenuId, SessionSectionTypeContext, IsSessionPinnedContext, IsSessionArchivedContext, IsSessionReadContext, SessionsGrouping, SessionsSorting } from './sessionsList.js';
import { ISessionsManagementService, ActiveSessionSupportsMultiChatContext } from '../sessionsManagementService.js';
import { IsWorkspaceGroupCappedContext, SessionsViewFilterOptionsSubMenu, SessionsViewFilterSubMenu, SessionsViewGroupingContext, SessionsViewId, SessionsViewSortingContext } from './sessionsView.js';
import { SessionsViewId as NewChatViewId } from '../../../chat/browser/newChatViewPane.js';
import { Menus } from '../../../../browser/menus.js';
//  Constants
const ACTION_ID_NEW_SESSION = 'workbench.action.chat.newChat';
//  Keybindings
KeybindingsRegistry.registerKeybindingRule({
    id: ACTION_ID_NEW_SESSION,
    weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 1,
    primary: 2048 /* KeyMod.CtrlCmd */ | 44 /* KeyCode.KeyN */,
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
    async run(accessor) {
        const sessionsService = accessor.get(ISessionsManagementService);
        sessionsService.openNewSessionView();
    }
});
KeybindingsRegistry.registerKeybindingRule({
    id: CLOSE_SESSION_COMMAND_ID,
    weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 1,
    when: ContextKeyExpr.and(IsNewChatSessionContext.negate(), EditorsVisibleContext.negate()),
    primary: 2048 /* KeyMod.CtrlCmd */ | 53 /* KeyCode.KeyW */,
    win: { primary: 2048 /* KeyMod.CtrlCmd */ | 62 /* KeyCode.F4 */, secondary: [2048 /* KeyMod.CtrlCmd */ | 53 /* KeyCode.KeyW */] },
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
    run(accessor) {
        const viewsService = accessor.get(IViewsService);
        const view = viewsService.getViewWithId(SessionsViewId);
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
    run(accessor) {
        const viewsService = accessor.get(IViewsService);
        const view = viewsService.getViewWithId(SessionsViewId);
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
    run(accessor) {
        const viewsService = accessor.get(IViewsService);
        const view = viewsService.getViewWithId(SessionsViewId);
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
    run(accessor) {
        const viewsService = accessor.get(IViewsService);
        const view = viewsService.getViewWithId(SessionsViewId);
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
    run(accessor) {
        const viewsService = accessor.get(IViewsService);
        const view = viewsService.getViewWithId(SessionsViewId);
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
    run(accessor) {
        const viewsService = accessor.get(IViewsService);
        const view = viewsService.getViewWithId(SessionsViewId);
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
    run(accessor) {
        const viewsService = accessor.get(IViewsService);
        const view = viewsService.getViewWithId(SessionsViewId);
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
    run(accessor) {
        const viewsService = accessor.get(IViewsService);
        const view = viewsService.getViewWithId(SessionsViewId);
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
    async run(accessor, context) {
        if (!context || !context.sessions || context.sessions.length === 0) {
            return;
        }
        const sessionsManagementService = accessor.get(ISessionsManagementService);
        const viewsService = accessor.get(IViewsService);
        sessionsManagementService.openNewSessionView();
        const view = await viewsService.openView(NewChatViewId, true);
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
            title: localize2('archiveSection', "Mark All as Done"),
            icon: Codicon.check,
            menu: [{
                    id: SessionSectionToolbarMenuId,
                    group: 'navigation',
                    order: 1,
                    when: ContextKeyExpr.notEquals(SessionSectionTypeContext.key, 'archived'),
                }]
        });
    }
    async run(accessor, context) {
        if (!context || !context.sessions || context.sessions.length === 0) {
            return;
        }
        const sessionsManagementService = accessor.get(ISessionsManagementService);
        const dialogService = accessor.get(IDialogService);
        const storageService = accessor.get(IStorageService);
        const skipConfirmation = storageService.getBoolean(ConfirmArchiveStorageKey, 0 /* StorageScope.PROFILE */, false);
        if (!skipConfirmation) {
            const confirmed = await dialogService.confirm({
                message: context.sessions.length === 1
                    ? localize('archiveSectionSessions.confirmSingle', "Are you sure you want to mark 1 session from '{0}' as done?", context.label)
                    : localize('archiveSectionSessions.confirm', "Are you sure you want to mark {0} sessions from '{1}' as done?", context.sessions.length, context.label),
                detail: localize('archiveSectionSessions.detail', "You can restore sessions later if needed from the sessions view."),
                primaryButton: localize('archiveSectionSessions.archive', "Mark All as Done"),
                checkbox: {
                    label: localize('doNotAskAgain', "Do not ask me again")
                }
            });
            if (!confirmed.confirmed) {
                return;
            }
            if (confirmed.checkboxChecked) {
                storageService.store(ConfirmArchiveStorageKey, true, 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
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
            title: localize2('unarchiveSection', "Restore All"),
            icon: Codicon.discard,
            menu: [{
                    id: SessionSectionToolbarMenuId,
                    group: 'navigation',
                    order: 1,
                    when: ContextKeyExpr.equals(SessionSectionTypeContext.key, 'archived'),
                }]
        });
    }
    async run(accessor, context) {
        if (!context || !context.sessions || context.sessions.length === 0) {
            return;
        }
        const sessionsManagementService = accessor.get(ISessionsManagementService);
        const dialogService = accessor.get(IDialogService);
        const storageService = accessor.get(IStorageService);
        if (context.sessions.length > 1) {
            const skipConfirmation = storageService.getBoolean(ConfirmArchiveStorageKey, 0 /* StorageScope.PROFILE */, false);
            if (!skipConfirmation) {
                const confirmed = await dialogService.confirm({
                    message: localize('unarchiveSectionSessions.confirm', "Are you sure you want to restore {0} sessions?", context.sessions.length),
                    primaryButton: localize('unarchiveSectionSessions.unarchive', "Restore All"),
                    checkbox: {
                        label: localize('doNotAskAgain2', "Do not ask me again")
                    }
                });
                if (!confirmed.confirmed) {
                    return;
                }
                if (confirmed.checkboxChecked) {
                    storageService.store(ConfirmArchiveStorageKey, true, 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
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
                    when: ContextKeyExpr.and(ContextKeyExpr.equals(IsSessionPinnedContext.key, false), ContextKeyExpr.equals(IsSessionArchivedContext.key, false)),
                }, {
                    id: SessionItemContextMenuId,
                    group: '0_pin',
                    order: 0,
                    when: ContextKeyExpr.and(ContextKeyExpr.equals(IsSessionPinnedContext.key, false), ContextKeyExpr.equals(IsSessionArchivedContext.key, false)),
                }]
        });
    }
    run(accessor, context) {
        if (!context) {
            return;
        }
        const sessions = Array.isArray(context) ? context : [context];
        const viewsService = accessor.get(IViewsService);
        const view = viewsService.getViewWithId(SessionsViewId);
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
                    when: ContextKeyExpr.and(ContextKeyExpr.equals(IsSessionPinnedContext.key, true), ContextKeyExpr.equals(IsSessionArchivedContext.key, false)),
                }, {
                    id: SessionItemContextMenuId,
                    group: '0_pin',
                    order: 0,
                    when: ContextKeyExpr.and(ContextKeyExpr.equals(IsSessionPinnedContext.key, true), ContextKeyExpr.equals(IsSessionArchivedContext.key, false)),
                }]
        });
    }
    run(accessor, context) {
        if (!context) {
            return;
        }
        const sessions = Array.isArray(context) ? context : [context];
        const viewsService = accessor.get(IViewsService);
        const view = viewsService.getViewWithId(SessionsViewId);
        for (const session of sessions) {
            view?.sessionsControl?.unpinSession(session);
        }
    }
});
registerAction2(class ArchiveSessionAction extends Action2 {
    constructor() {
        super({
            id: 'sessionsViewPane.archiveSession',
            title: localize2('archiveSession', "Mark as Done"),
            icon: Codicon.check,
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
    async run(accessor, context) {
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
            title: localize2('unarchiveSession', "Restore"),
            icon: Codicon.discard,
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
    async run(accessor, context) {
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
    async run(accessor, context) {
        const session = Array.isArray(context) ? context[0] : context;
        if (!session) {
            return;
        }
        const quickInputService = accessor.get(IQuickInputService);
        const sessionsManagementService = accessor.get(ISessionsManagementService);
        const newTitle = await quickInputService.input({
            value: session.title.get(),
            prompt: localize('renameSession.prompt', "New agent session title"),
            validateInput: async (value) => {
                if (!value.trim()) {
                    return localize('renameSession.empty', "Title cannot be empty");
                }
                return undefined;
            }
        });
        if (newTitle) {
            const trimmedTitle = newTitle.trim();
            if (trimmedTitle) {
                await sessionsManagementService.renameChat(session, session.mainChat.resource, trimmedTitle);
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
                    when: ContextKeyExpr.and(ContextKeyExpr.equals(IsSessionReadContext.key, false), ContextKeyExpr.equals(IsSessionArchivedContext.key, false)),
                }]
        });
    }
    run(accessor, context) {
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
                    when: ContextKeyExpr.and(ContextKeyExpr.equals(IsSessionReadContext.key, true), ContextKeyExpr.equals(IsSessionArchivedContext.key, false)),
                }]
        });
    }
    run(accessor, context) {
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
    async run(accessor, context) {
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
    run(accessor) {
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
                    when: ContextKeyExpr.and(IsAuxiliaryWindowContext.negate(), SessionsWelcomeVisibleContext.negate(), IsNewChatSessionContext.negate())
                },
                {
                    id: MenuId.ChatEditingSessionChangesToolbar,
                    group: 'navigation',
                    order: 1,
                    when: ContextKeyExpr.and(IsSessionsWindowContext, ContextKeyExpr.or(ContextKeyExpr.and(ContextKeyExpr.equals('sessions.hasGitRepository', true), ContextKeyExpr.equals('sessions.hasPullRequest', false), ContextKeyExpr.equals('sessions.hasOutgoingChanges', false), ContextKeyExpr.equals('sessions.hasUncommittedChanges', false)), ContextKeyExpr.and(ContextKeyExpr.equals('sessions.hasGitRepository', true), ContextKeyExpr.equals('sessions.hasPullRequest', true), ContextKeyExpr.equals('sessions.hasOpenPullRequest', false))))
                }]
        });
    }
    async run(accessor) {
        const sessionsManagementService = accessor.get(ISessionsManagementService);
        const activeSession = sessionsManagementService.activeSession.get();
        if (!activeSession || activeSession.status.get() === 0 /* SessionStatus.Untitled */) {
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
                    when: ContextKeyExpr.and(IsAuxiliaryWindowContext.negate(), SessionsWelcomeVisibleContext.negate(), IsNewChatSessionContext.negate(), ActiveSessionSupportsMultiChatContext)
                }]
        });
    }
    async run(accessor) {
        const sessionsManagementService = accessor.get(ISessionsManagementService);
        const quickInputService = accessor.get(IQuickInputService);
        const activeSession = sessionsManagementService.activeSession.get();
        if (!activeSession || activeSession.status.get() === 0 /* SessionStatus.Untitled */) {
            return;
        }
        const query = await quickInputService.input({
            placeHolder: localize('addChat.placeholder', "Enter a prompt for the new chat"),
            prompt: localize('addChat.prompt', "Add a new chat to the active session"),
        });
        if (query) {
            await sessionsManagementService.sendAndCreateChat(activeSession, { query });
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvbnNWaWV3QWN0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3Nlc3Npb25zL2NvbnRyaWIvc2Vzc2lvbnMvYnJvd3Nlci92aWV3cy9zZXNzaW9uc1ZpZXdBY3Rpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUVqRSxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQzVELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLFlBQVksRUFBRSxlQUFlLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNuSCxPQUFPLEVBQUUsY0FBYyxFQUFFLGtCQUFrQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDN0csT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBRW5GLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxlQUFlLEVBQStCLE1BQU0sbURBQW1ELENBQUM7QUFDakgsT0FBTyxFQUFFLG1CQUFtQixFQUFvQixNQUFNLGtFQUFrRSxDQUFDO0FBQ3pILE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxnRUFBZ0UsQ0FBQztBQUMvRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsd0JBQXdCLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUMxSSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUMzRixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUNwRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN0RSxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsdUJBQXVC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