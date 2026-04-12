/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize, localize2 } from '../../../../../nls.js';
import { isAgentSessionSection, isLocalAgentSessionItem, isMarshalledAgentSessionContext } from './agentSessionsModel.js';
import { Action2, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { AGENT_SESSION_DELETE_ACTION_ID, AGENT_SESSION_RENAME_ACTION_ID, AgentSessionProviders, AgentSessionsViewerOrientation } from './agentSessions.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ChatViewId, IChatWidgetService } from '../chat.js';
import { ACTIVE_GROUP, AUX_WINDOW_GROUP, SIDE_GROUP } from '../../../../services/editor/common/editorService.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { IAgentSessionsService } from './agentSessionsService.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ChatEditorInput, showClearEditingSessionConfirmation } from '../widgetHosts/editor/chatEditorInput.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ChatConfiguration } from '../../common/constants.js';
import { ACTION_ID_NEW_CHAT } from '../actions/chatActions.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { AgentSessionsPicker } from './agentSessionsPicker.js';
import { ActiveEditorContext, IsSessionsWindowContext } from '../../../../common/contextkeys.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { coalesce } from '../../../../../base/common/arrays.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IPaneCompositePartService } from '../../../../services/panecomposite/browser/panecomposite.js';
const AGENT_SESSIONS_CATEGORY = localize2('chatSessions', "Chat Agent Sessions");
//#region Chat View
export class ToggleShowAgentSessionsAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.chat.toggleShowAgentSessions',
            title: localize2('chat.showSessions', "Show Sessions"),
            toggled: ContextKeyExpr.equals(`config.${ChatConfiguration.ChatViewSessionsEnabled}`, true),
            menu: {
                id: MenuId.ChatWelcomeContext,
                group: '0_sessions',
                order: 2,
                when: ChatContextKeys.inChatEditor.negate()
            }
        });
    }
    async run(accessor) {
        const configurationService = accessor.get(IConfigurationService);
        const currentValue = configurationService.getValue(ChatConfiguration.ChatViewSessionsEnabled);
        await configurationService.updateValue(ChatConfiguration.ChatViewSessionsEnabled, !currentValue);
    }
}
const agentSessionsOrientationSubmenu = new MenuId('chatAgentSessionsOrientationSubmenu');
MenuRegistry.appendMenuItem(MenuId.ChatWelcomeContext, {
    submenu: agentSessionsOrientationSubmenu,
    title: localize2('chat.sessionsOrientation', "Sessions Orientation"),
    group: '0_sessions',
    order: 1,
    when: ChatContextKeys.inChatEditor.negate()
});
export class SetAgentSessionsOrientationStackedAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.chat.setAgentSessionsOrientationStacked',
            title: localize2('chat.sessionsOrientation.stacked', "Stacked"),
            toggled: ContextKeyExpr.equals(`config.${ChatConfiguration.ChatViewSessionsOrientation}`, 'stacked'),
            precondition: ContextKeyExpr.equals(`config.${ChatConfiguration.ChatViewSessionsEnabled}`, true),
            menu: {
                id: agentSessionsOrientationSubmenu,
                group: 'navigation',
                order: 2
            }
        });
    }
    async run(accessor) {
        const commandService = accessor.get(ICommandService);
        await commandService.executeCommand(HideAgentSessionsSidebar.ID);
    }
}
export class SetAgentSessionsOrientationSideBySideAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.chat.setAgentSessionsOrientationSideBySide',
            title: localize2('chat.sessionsOrientation.sideBySide', "Side by Side"),
            toggled: ContextKeyExpr.notEquals(`config.${ChatConfiguration.ChatViewSessionsOrientation}`, 'stacked'),
            precondition: ContextKeyExpr.equals(`config.${ChatConfiguration.ChatViewSessionsEnabled}`, true),
            menu: {
                id: agentSessionsOrientationSubmenu,
                group: 'navigation',
                order: 1
            }
        });
    }
    async run(accessor) {
        const commandService = accessor.get(ICommandService);
        await commandService.executeCommand(ShowAgentSessionsSidebar.ID);
    }
}
export class PickAgentSessionAction extends Action2 {
    constructor() {
        super({
            id: `workbench.action.chat.history`,
            title: localize2('agentSessions.open', "Open Agent Session..."),
            menu: [
                {
                    id: MenuId.ViewTitle,
                    when: ContextKeyExpr.and(ContextKeyExpr.equals('view', ChatViewId), ContextKeyExpr.equals(`config.${ChatConfiguration.ChatViewSessionsEnabled}`, false)),
                    group: 'navigation',
                    order: 2
                },
                {
                    id: MenuId.EditorTitle,
                    when: ActiveEditorContext.isEqualTo(ChatEditorInput.EditorID),
                }
            ],
            category: AGENT_SESSIONS_CATEGORY,
            icon: Codicon.history,
            f1: true,
            precondition: ChatContextKeys.enabled
        });
    }
    async run(accessor) {
        const instantiationService = accessor.get(IInstantiationService);
        const agentSessionsPicker = instantiationService.createInstance(AgentSessionsPicker, undefined, undefined);
        await agentSessionsPicker.pickAgentSession();
    }
}
export class ArchiveAllAgentSessionsAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.chat.archiveAllAgentSessions',
            title: localize2('archiveAll.label', "Archive All Workspace Agent Sessions"),
            precondition: ChatContextKeys.enabled,
            category: AGENT_SESSIONS_CATEGORY,
            f1: true,
        });
    }
    async run(accessor) {
        const agentSessionsService = accessor.get(IAgentSessionsService);
        const dialogService = accessor.get(IDialogService);
        const sessionsToArchive = agentSessionsService.model.sessions.filter(session => !session.isArchived());
        if (sessionsToArchive.length === 0) {
            return;
        }
        const confirmed = await dialogService.confirm({
            message: sessionsToArchive.length === 1
                ? localize('archiveAllSessions.confirmSingle', "Are you sure you want to archive 1 agent session?")
                : localize('archiveAllSessions.confirm', "Are you sure you want to archive {0} agent sessions?", sessionsToArchive.length),
            detail: localize('archiveAllSessions.detail', "You can unarchive sessions later if needed from the sessions view."),
            primaryButton: localize('archiveAllSessions.archive', "Archive")
        });
        if (!confirmed.confirmed) {
            return;
        }
        for (const session of sessionsToArchive) {
            session.setArchived(true);
        }
    }
}
export class MarkAllAgentSessionsReadAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.chat.markAllAgentSessionsRead',
            title: localize2('markAllRead.label', "Mark All as Read"),
            precondition: ChatContextKeys.enabled,
            category: AGENT_SESSIONS_CATEGORY,
            f1: true,
            menu: {
                id: MenuId.AgentSessionsContext,
                group: '0_read',
                order: 2,
                when: ChatContextKeys.isArchivedAgentSession.negate() // no read state for archived sessions
            }
        });
    }
    async run(accessor) {
        const agentSessionsService = accessor.get(IAgentSessionsService);
        const sessionsToMarkRead = agentSessionsService.model.sessions.filter(session => !session.isArchived() && !session.isRead());
        if (sessionsToMarkRead.length === 0) {
            return;
        }
        for (const session of sessionsToMarkRead) {
            session.setRead(true);
        }
    }
}
const ConfirmArchiveStorageKey = 'chat.sessions.confirmArchive';
export class ArchiveAgentSessionSectionAction extends Action2 {
    constructor() {
        super({
            id: 'agentSessionSection.archive',
            title: localize2('archiveSection', "Archive All"),
            icon: Codicon.archive,
            menu: [{
                    id: MenuId.AgentSessionSectionToolbar,
                    group: 'navigation',
                    order: 1,
                    when: ChatContextKeys.agentSessionSection.notEqualsTo("archived" /* AgentSessionSection.Archived */),
                }, {
                    id: MenuId.AgentSessionSectionContext,
                    group: '1_edit',
                    order: 2,
                    when: ChatContextKeys.agentSessionSection.notEqualsTo("archived" /* AgentSessionSection.Archived */),
                }]
        });
    }
    async run(accessor, context) {
        if (!context || !isAgentSessionSection(context)) {
            return;
        }
        const dialogService = accessor.get(IDialogService);
        const storageService = accessor.get(IStorageService);
        const skipConfirmation = storageService.getBoolean(ConfirmArchiveStorageKey, 0 /* StorageScope.PROFILE */, false);
        if (!skipConfirmation) {
            const confirmed = await dialogService.confirm({
                message: context.sessions.length === 1
                    ? localize('archiveSectionSessions.confirmSingle', "Are you sure you want to archive 1 agent session from '{0}'?", context.label)
                    : localize('archiveSectionSessions.confirm', "Are you sure you want to archive {0} agent sessions from '{1}'?", context.sessions.length, context.label),
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
                storageService.store(ConfirmArchiveStorageKey, true, 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
            }
        }
        for (const session of context.sessions) {
            session.setArchived(true);
        }
    }
}
export class UnarchiveAgentSessionSectionAction extends Action2 {
    constructor() {
        super({
            id: 'agentSessionSection.unarchive',
            title: localize2('unarchiveSection', "Unarchive All"),
            icon: Codicon.unarchive,
            menu: [{
                    id: MenuId.AgentSessionSectionToolbar,
                    group: 'navigation',
                    order: 1,
                    when: ChatContextKeys.agentSessionSection.isEqualTo("archived" /* AgentSessionSection.Archived */),
                }, {
                    id: MenuId.AgentSessionSectionContext,
                    group: '1_edit',
                    order: 2,
                    when: ChatContextKeys.agentSessionSection.isEqualTo("archived" /* AgentSessionSection.Archived */),
                }]
        });
    }
    async run(accessor, context) {
        if (!context || !isAgentSessionSection(context)) {
            return;
        }
        const dialogService = accessor.get(IDialogService);
        const storageService = accessor.get(IStorageService);
        if (context.sessions.length > 1) {
            const skipConfirmation = storageService.getBoolean(ConfirmArchiveStorageKey, 0 /* StorageScope.PROFILE */, false);
            if (!skipConfirmation) {
                const confirmed = await dialogService.confirm({
                    message: localize('unarchiveSectionSessions.confirm', "Are you sure you want to unarchive {0} agent sessions?", context.sessions.length),
                    primaryButton: localize('unarchiveSectionSessions.unarchive', "Unarchive All"),
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
        }
        for (const session of context.sessions) {
            session.setArchived(false);
        }
    }
}
export class MarkAgentSessionSectionReadAction extends Action2 {
    constructor() {
        super({
            id: 'agentSessionSection.markRead',
            title: localize2('markSectionRead', "Mark All as Read"),
            menu: [{
                    id: MenuId.AgentSessionSectionContext,
                    group: '1_edit',
                    order: 1,
                    when: ChatContextKeys.agentSessionSection.notEqualsTo("archived" /* AgentSessionSection.Archived */),
                }]
        });
    }
    async run(accessor, context) {
        if (!context || !isAgentSessionSection(context)) {
            return;
        }
        for (const session of context.sessions) {
            session.setRead(true);
        }
    }
}
export class CollapseAllAgentSessionSectionsAction extends Action2 {
    constructor() {
        super({
            id: 'agentSessionSection.collapseAll',
            title: localize2('collapseAll', "Collapse All"),
            menu: [{
                    id: MenuId.AgentSessionSectionContext,
                    group: '2_collapse',
                    order: 1,
                }]
        });
    }
    async run(accessor, _section, control) {
        control?.collapseAllSections();
    }
}
//#endregion
//#region Session Actions
class BaseAgentSessionAction extends Action2 {
    async run(accessor, context) {
        const agentSessionsService = accessor.get(IAgentSessionsService);
        const viewsService = accessor.get(IViewsService);
        let sessions = [];
        if (isMarshalledAgentSessionContext(context)) {
            sessions = coalesce((context.sessions ?? [context.session]).map(session => agentSessionsService.getSession(session.resource)));
        }
        else if (context) {
            sessions = [context];
        }
        if (sessions.length === 0) {
            const chatView = viewsService.getActiveViewWithId(ChatViewId);
            const focused = chatView?.getFocusedSessions().at(0);
            if (focused) {
                sessions = [focused];
            }
        }
        if (sessions.length > 0) {
            await this.runWithSessions(sessions, accessor);
        }
    }
}
export class MarkAgentSessionUnreadAction extends BaseAgentSessionAction {
    constructor() {
        super({
            id: 'agentSession.markUnread',
            title: localize2('markUnread', "Mark as Unread"),
            menu: {
                id: MenuId.AgentSessionsContext,
                group: '0_read',
                order: 1,
                when: ContextKeyExpr.and(ChatContextKeys.isReadAgentSession, ChatContextKeys.isArchivedAgentSession.negate() // no read state for archived sessions
                ),
            }
        });
    }
    runWithSessions(sessions) {
        for (const session of sessions) {
            session.setRead(false);
        }
    }
}
export class MarkAgentSessionReadAction extends BaseAgentSessionAction {
    constructor() {
        super({
            id: 'agentSession.markRead',
            title: localize2('markRead', "Mark as Read"),
            menu: {
                id: MenuId.AgentSessionsContext,
                group: '0_read',
                order: 1,
                when: ContextKeyExpr.and(ChatContextKeys.isReadAgentSession.negate(), ChatContextKeys.isArchivedAgentSession.negate() // no read state for archived sessions
                ),
            }
        });
    }
    runWithSessions(sessions) {
        for (const session of sessions) {
            session.setRead(true);
        }
    }
}
export class ArchiveAgentSessionAction extends BaseAgentSessionAction {
    constructor() {
        super({
            id: 'agentSession.archive',
            title: localize2('archive', "Archive"),
            icon: Codicon.archive,
            keybinding: {
                primary: 20 /* KeyCode.Delete */,
                mac: { primary: 2048 /* KeyMod.CtrlCmd */ | 1 /* KeyCode.Backspace */ },
                weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 1,
                when: ContextKeyExpr.and(ChatContextKeys.agentSessionsViewerFocused, ChatContextKeys.isArchivedAgentSession.negate())
            },
            menu: [{
                    id: MenuId.AgentSessionItemToolbar,
                    group: 'navigation',
                    order: 1,
                    when: ChatContextKeys.isArchivedAgentSession.negate(),
                }, {
                    id: MenuId.AgentSessionsContext,
                    group: '1_edit',
                    order: 2,
                    when: ChatContextKeys.isArchivedAgentSession.negate()
                }]
        });
    }
    async runWithSessions(sessions, accessor) {
        const chatService = accessor.get(IChatService);
        const dialogService = accessor.get(IDialogService);
        // Archive all sessions
        for (const session of sessions) {
            const chatModel = chatService.getSession(session.resource);
            if (chatModel && !await showClearEditingSessionConfirmation(chatModel, dialogService, {
                isArchiveAction: true,
                titleOverride: localize('archiveSession', "Archive chat with pending edits?"),
                messageOverride: localize('archiveSessionDescription', "You have pending changes in this chat session.")
            })) {
                return;
            }
            session.setArchived(true);
        }
    }
}
export class UnarchiveAgentSessionAction extends BaseAgentSessionAction {
    constructor() {
        super({
            id: 'agentSession.unarchive',
            title: localize2('unarchive', "Unarchive"),
            icon: Codicon.unarchive,
            keybinding: {
                primary: 1024 /* KeyMod.Shift */ | 20 /* KeyCode.Delete */,
                mac: {
                    primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 1 /* KeyCode.Backspace */,
                },
                weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 1,
                when: ContextKeyExpr.and(ChatContextKeys.agentSessionsViewerFocused, ChatContextKeys.isArchivedAgentSession)
            },
            menu: [{
                    id: MenuId.AgentSessionItemToolbar,
                    group: 'navigation',
                    order: 1,
                    when: ChatContextKeys.isArchivedAgentSession,
                }, {
                    id: MenuId.AgentSessionsContext,
                    group: '1_edit',
                    order: 2,
                    when: ChatContextKeys.isArchivedAgentSession,
                }]
        });
    }
    runWithSessions(sessions) {
        for (const session of sessions) {
            session.setArchived(false);
        }
    }
}
export class PinAgentSessionAction extends BaseAgentSessionAction {
    constructor() {
        super({
            id: 'agentSession.pin',
            title: localize2('pin', "Pin"),
            icon: Codicon.pin,
            menu: [{
                    id: MenuId.AgentSessionItemToolbar,
                    group: 'navigation',
                    order: 0,
                    when: ContextKeyExpr.and(ChatContextKeys.isPinnedAgentSession.negate(), ChatContextKeys.isArchivedAgentSession.negate()),
                }, {
                    id: MenuId.AgentSessionsContext,
                    group: '0_pin',
                    order: 1,
                    when: ContextKeyExpr.and(ChatContextKeys.isPinnedAgentSession.negate(), ChatContextKeys.isArchivedAgentSession.negate()),
                }]
        });
    }
    runWithSessions(sessions) {
        for (const session of sessions) {
            session.setPinned(true);
        }
    }
}
export class UnpinAgentSessionAction extends BaseAgentSessionAction {
    constructor() {
        super({
            id: 'agentSession.unpin',
            title: localize2('unpin', "Unpin"),
            icon: Codicon.pinned,
            menu: [{
                    id: MenuId.AgentSessionItemToolbar,
                    group: 'navigation',
                    order: 0,
                    when: ContextKeyExpr.and(ChatContextKeys.isPinnedAgentSession, ChatContextKeys.isArchivedAgentSession.negate()),
                }, {
                    id: MenuId.AgentSessionsContext,
                    group: '0_pin',
                    order: 1,
                    when: ContextKeyExpr.and(ChatContextKeys.isPinnedAgentSession, ChatContextKeys.isArchivedAgentSession.negate()),
                }]
        });
    }
    runWithSessions(sessions) {
        for (const session of sessions) {
            session.setPinned(false);
        }
    }
}
export class RenameAgentSessionAction extends BaseAgentSessionAction {
    constructor() {
        super({
            id: AGENT_SESSION_RENAME_ACTION_ID,
            title: localize2('rename', "Rename..."),
            precondition: ChatContextKeys.hasMultipleAgentSessionsSelected.negate(),
            keybinding: {
                primary: 60 /* KeyCode.F2 */,
                mac: {
                    primary: 3 /* KeyCode.Enter */
                },
                weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 1,
                when: ContextKeyExpr.and(ChatContextKeys.agentSessionsViewerFocused, ChatContextKeys.agentSessionType.isEqualTo(AgentSessionProviders.Local)),
            },
            menu: {
                id: MenuId.AgentSessionsContext,
                group: '1_edit',
                order: 3,
                when: ChatContextKeys.agentSessionType.isEqualTo(AgentSessionProviders.Local)
            }
        });
    }
    async runWithSessions(sessions, accessor) {
        const session = sessions.at(0);
        if (!session) {
            return;
        }
        const quickInputService = accessor.get(IQuickInputService);
        const chatService = accessor.get(IChatService);
        const title = await quickInputService.input({ prompt: localize('newChatTitle', "New agent session title"), value: session.label });
        if (title) {
            chatService.setChatSessionTitle(session.resource, title);
        }
    }
}
export class DeleteAgentSessionAction extends BaseAgentSessionAction {
    constructor() {
        super({
            id: AGENT_SESSION_DELETE_ACTION_ID,
            title: localize2('delete', "Delete..."),
            menu: {
                id: MenuId.AgentSessionsContext,
                group: '1_edit',
                order: 4,
                when: ChatContextKeys.agentSessionType.isEqualTo(AgentSessionProviders.Local)
            }
        });
    }
    async runWithSessions(sessions, accessor) {
        if (sessions.length === 0) {
            return;
        }
        const chatService = accessor.get(IChatService);
        const dialogService = accessor.get(IDialogService);
        const widgetService = accessor.get(IChatWidgetService);
        const confirmed = await dialogService.confirm({
            message: sessions.length === 1
                ? localize('deleteSession.confirm', "Are you sure you want to delete this chat session?")
                : localize('deleteSessions.confirm', "Are you sure you want to delete {0} chat sessions?", sessions.length),
            detail: localize('deleteSession.detail', "This action cannot be undone."),
            primaryButton: localize('deleteSession.delete', "Delete")
        });
        if (!confirmed.confirmed) {
            return;
        }
        for (const session of sessions) {
            // Clear chat widget
            await widgetService.getWidgetBySessionResource(session.resource)?.clear();
            // Remove from storage
            await chatService.removeHistoryEntry(session.resource);
        }
    }
}
export class DeleteAllLocalSessionsAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.chat.clearHistory',
            title: localize2('agentSessions.deleteAll', "Delete All Local Workspace Chat Sessions"),
            precondition: ChatContextKeys.enabled,
            category: AGENT_SESSIONS_CATEGORY,
            f1: true,
        });
    }
    async run(accessor, ...args) {
        const chatService = accessor.get(IChatService);
        const widgetService = accessor.get(IChatWidgetService);
        const dialogService = accessor.get(IDialogService);
        const agentSessionsService = accessor.get(IAgentSessionsService);
        const localSessionsCount = agentSessionsService.model.sessions.filter(session => isLocalAgentSessionItem(session)).length;
        if (localSessionsCount === 0) {
            return;
        }
        const confirmed = await dialogService.confirm({
            message: localSessionsCount === 1
                ? localize('deleteAllChats.confirmSingle', "Are you sure you want to delete 1 local workspace chat session?")
                : localize('deleteAllChats.confirm', "Are you sure you want to delete {0} local workspace chat sessions?", localSessionsCount),
            detail: localize('deleteAllChats.detail', "This action cannot be undone."),
            primaryButton: localize('deleteAllChats.button', "Delete All")
        });
        if (!confirmed.confirmed) {
            return;
        }
        // Clear all chat widgets
        await Promise.all(widgetService.getAllWidgets().map(widget => widget.clear()));
        // Remove from storage
        await chatService.clearAllHistoryEntries();
    }
}
class BaseOpenAgentSessionAction extends BaseAgentSessionAction {
    async runWithSessions(sessions, accessor) {
        const chatWidgetService = accessor.get(IChatWidgetService);
        const targetGroup = this.getTargetGroup();
        for (const session of sessions) {
            const uri = session.resource;
            await chatWidgetService.openSession(uri, targetGroup, {
                ...this.getOptions(),
                pinned: true
            });
        }
    }
}
export class OpenAgentSessionInEditorGroupAction extends BaseOpenAgentSessionAction {
    static { this.id = 'workbench.action.chat.openSessionInEditorGroup'; }
    constructor() {
        super({
            id: OpenAgentSessionInEditorGroupAction.id,
            title: localize2('chat.openSessionInEditorGroup.label', "Open as Editor"),
            keybinding: {
                primary: 2048 /* KeyMod.CtrlCmd */ | 3 /* KeyCode.Enter */,
                mac: {
                    primary: 256 /* KeyMod.WinCtrl */ | 3 /* KeyCode.Enter */
                },
                weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 1,
                when: ContextKeyExpr.and(ChatContextKeys.agentSessionsViewerFocused, IsSessionsWindowContext.negate()),
            },
            menu: {
                id: MenuId.AgentSessionsContext,
                when: IsSessionsWindowContext.negate(),
                order: 1,
                group: 'navigation'
            }
        });
    }
    getTargetGroup() {
        return ACTIVE_GROUP;
    }
    getOptions() {
        return {};
    }
}
export class OpenAgentSessionInNewEditorGroupAction extends BaseOpenAgentSessionAction {
    static { this.id = 'workbench.action.chat.openSessionInNewEditorGroup'; }
    constructor() {
        super({
            id: OpenAgentSessionInNewEditorGroupAction.id,
            title: localize2('chat.openSessionInNewEditorGroup.label', "Open to the Side"),
            keybinding: {
                primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 3 /* KeyCode.Enter */,
                mac: {
                    primary: 256 /* KeyMod.WinCtrl */ | 512 /* KeyMod.Alt */ | 3 /* KeyCode.Enter */
                },
                weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 1,
                when: ContextKeyExpr.and(ChatContextKeys.agentSessionsViewerFocused, IsSessionsWindowContext.negate()),
            },
            menu: {
                id: MenuId.AgentSessionsContext,
                when: IsSessionsWindowContext.negate(),
                order: 2,
                group: 'navigation'
            }
        });
    }
    getTargetGroup() {
        return SIDE_GROUP;
    }
    getOptions() {
        return {};
    }
}
export class OpenAgentSessionInNewWindowAction extends BaseOpenAgentSessionAction {
    static { this.id = 'workbench.action.chat.openSessionInNewWindow'; }
    constructor() {
        super({
            id: OpenAgentSessionInNewWindowAction.id,
            title: localize2('chat.openSessionInNewWindow.label', "Open in New Window"),
            menu: {
                id: MenuId.AgentSessionsContext,
                order: 3,
                group: 'navigation'
            }
        });
    }
    getTargetGroup() {
        return AUX_WINDOW_GROUP;
    }
    getOptions() {
        return {
            auxiliary: { compact: true, bounds: { width: 800, height: 640 } }
        };
    }
}
//#endregion
//#region Agent Sessions Sidebar
export class RefreshAgentSessionsViewerAction extends Action2 {
    constructor() {
        super({
            id: 'agentSessionsViewer.refresh',
            title: localize2('refresh', "Refresh Agent Sessions"),
            icon: Codicon.refresh,
            menu: {
                id: MenuId.AgentSessionsToolbar,
                group: 'navigation',
                order: 1,
            },
        });
    }
    run(accessor, agentSessionsControl) {
        agentSessionsControl.refresh();
    }
}
export class FindAgentSessionInViewerAction extends Action2 {
    constructor() {
        super({
            id: 'agentSessionsViewer.find',
            title: localize2('find', "Find Agent Session"),
            icon: Codicon.search,
            menu: {
                id: MenuId.AgentSessionsToolbar,
                group: 'navigation',
                order: 2,
            }
        });
    }
    run(accessor, agentSessionsControl) {
        return agentSessionsControl.openFind();
    }
}
class UpdateChatViewWidthAction extends Action2 {
    async run(accessor) {
        const layoutService = accessor.get(IWorkbenchLayoutService);
        const viewDescriptorService = accessor.get(IViewDescriptorService);
        const configurationService = accessor.get(IConfigurationService);
        const viewsService = accessor.get(IViewsService);
        const paneCompositeService = accessor.get(IPaneCompositePartService);
        const chatLocation = viewDescriptorService.getViewLocationById(ChatViewId);
        if (typeof chatLocation !== 'number') {
            return; // we need a view location
        }
        // Determine if we can resize the view: this is not possible
        // for when the chat view is in the panel at the top or bottom
        const panelPosition = layoutService.getPanelPosition();
        const canResizeView = chatLocation !== 1 /* ViewContainerLocation.Panel */ || (panelPosition === 0 /* Position.LEFT */ || panelPosition === 1 /* Position.RIGHT */);
        // Update configuration if needed
        const chatViewSessionsEnabled = configurationService.getValue(ChatConfiguration.ChatViewSessionsEnabled);
        if (!chatViewSessionsEnabled) {
            await configurationService.updateValue(ChatConfiguration.ChatViewSessionsEnabled, true);
        }
        let chatView = viewsService.getActiveViewWithId(ChatViewId);
        if (!chatView) {
            chatView = await viewsService.openView(ChatViewId, false);
        }
        if (!chatView) {
            return; // we need the chat view
        }
        const configuredOrientation = configurationService.getValue(ChatConfiguration.ChatViewSessionsOrientation);
        let validatedConfiguredOrientation;
        if (configuredOrientation === 'stacked' || configuredOrientation === 'sideBySide') {
            validatedConfiguredOrientation = configuredOrientation;
        }
        else {
            validatedConfiguredOrientation = 'sideBySide'; // default
        }
        const newOrientation = this.getOrientation();
        const lastWidthForOrientation = chatView?.getLastDimensions(newOrientation)?.width;
        if ((!canResizeView || validatedConfiguredOrientation === 'sideBySide') && newOrientation === AgentSessionsViewerOrientation.Stacked) {
            chatView.updateConfiguredSessionsViewerOrientation('stacked');
        }
        else if ((!canResizeView || validatedConfiguredOrientation === 'stacked') && newOrientation === AgentSessionsViewerOrientation.SideBySide) {
            chatView.updateConfiguredSessionsViewerOrientation('sideBySide');
        }
        if (!canResizeView) {
            return; // location does not allow for resize (panel top or bottom)
        }
        const part = paneCompositeService.getPartId(chatLocation);
        let currentSize = layoutService.getSize(part);
        const chatViewDefaultWidth = 300;
        const sessionsViewDefaultWidth = chatViewDefaultWidth;
        const sideBySideMinWidth = chatViewDefaultWidth + sessionsViewDefaultWidth + 1; // account for possible theme border
        if ((newOrientation === AgentSessionsViewerOrientation.SideBySide && currentSize.width >= sideBySideMinWidth) || // already wide enough to show side by side
            (newOrientation === AgentSessionsViewerOrientation.Stacked && chatLocation === 2 /* ViewContainerLocation.AuxiliaryBar */ && layoutService.isAuxiliaryBarMaximized()) // try to not leave maximized state if maximized
        ) {
            return;
        }
        // Leave maximized state if applicable
        if (chatLocation === 2 /* ViewContainerLocation.AuxiliaryBar */) {
            layoutService.setAuxiliaryBarMaximized(false);
            currentSize = layoutService.getSize(part);
        }
        // Figure out the right new width
        let newWidth;
        if (newOrientation === AgentSessionsViewerOrientation.SideBySide) {
            newWidth = Math.max(sideBySideMinWidth, lastWidthForOrientation || Math.round(layoutService.mainContainerDimension.width / 2));
        }
        else {
            newWidth = lastWidthForOrientation || Math.max(chatViewDefaultWidth, currentSize.width - sessionsViewDefaultWidth);
        }
        // Apply the new width
        layoutService.setSize(part, { width: newWidth, height: currentSize.height });
        // If we figure out that the width was not applied due to constraints (such as window dimensions),
        // we maximize the auxiliary bar to ensure the side by side experience is optimal
        const actualSize = layoutService.getSize(part);
        if (chatLocation === 2 /* ViewContainerLocation.AuxiliaryBar */ && // only applicable for auxiliary bar
            newOrientation === AgentSessionsViewerOrientation.SideBySide && // only applicable when going to side by side
            actualSize.width < sideBySideMinWidth // width is still not enough for side by side
        ) {
            layoutService.setAuxiliaryBarMaximized(true);
        }
    }
}
export class ShowAgentSessionsSidebar extends UpdateChatViewWidthAction {
    static { this.ID = 'agentSessions.showAgentSessionsSidebar'; }
    static { this.TITLE = localize2('showAgentSessionsSidebar', "Show Agent Sessions Sidebar"); }
    constructor() {
        super({
            id: ShowAgentSessionsSidebar.ID,
            title: ShowAgentSessionsSidebar.TITLE,
            precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.agentSessionsViewerOrientation.isEqualTo(AgentSessionsViewerOrientation.Stacked)),
            f1: true,
            category: AGENT_SESSIONS_CATEGORY,
        });
    }
    getOrientation() {
        return AgentSessionsViewerOrientation.SideBySide;
    }
}
export class HideAgentSessionsSidebar extends UpdateChatViewWidthAction {
    static { this.ID = 'agentSessions.hideAgentSessionsSidebar'; }
    static { this.TITLE = localize2('hideAgentSessionsSidebar', "Hide Agent Sessions Sidebar"); }
    constructor() {
        super({
            id: HideAgentSessionsSidebar.ID,
            title: HideAgentSessionsSidebar.TITLE,
            precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.agentSessionsViewerOrientation.isEqualTo(AgentSessionsViewerOrientation.SideBySide)),
            f1: true,
            category: AGENT_SESSIONS_CATEGORY,
        });
    }
    getOrientation() {
        return AgentSessionsViewerOrientation.Stacked;
    }
}
export class ToggleAgentSessionsSidebar extends Action2 {
    static { this.ID = 'agentSessions.toggleAgentSessionsSidebar'; }
    static { this.TITLE = localize2('toggleAgentSessionsSidebar', "Toggle Agent Sessions Sidebar"); }
    constructor() {
        super({
            id: ToggleAgentSessionsSidebar.ID,
            title: ToggleAgentSessionsSidebar.TITLE,
            precondition: ChatContextKeys.enabled,
            f1: true,
            category: AGENT_SESSIONS_CATEGORY,
        });
    }
    async run(accessor) {
        const commandService = accessor.get(ICommandService);
        const viewsService = accessor.get(IViewsService);
        const chatView = viewsService.getActiveViewWithId(ChatViewId);
        const currentOrientation = chatView?.getSessionsViewerOrientation();
        if (currentOrientation === AgentSessionsViewerOrientation.SideBySide) {
            await commandService.executeCommand(HideAgentSessionsSidebar.ID);
        }
        else {
            await commandService.executeCommand(ShowAgentSessionsSidebar.ID);
        }
    }
}
export class FocusAgentSessionsAction extends Action2 {
    static { this.id = 'workbench.action.chat.focusAgentSessionsViewer'; }
    constructor() {
        super({
            id: FocusAgentSessionsAction.id,
            title: localize2('chat.focusAgentSessionsViewer.label', "Focus Agent Sessions"),
            precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals(`config.${ChatConfiguration.ChatViewSessionsEnabled}`, true)),
            category: AGENT_SESSIONS_CATEGORY,
            f1: true,
        });
    }
    async run(accessor) {
        const viewsService = accessor.get(IViewsService);
        const configurationService = accessor.get(IConfigurationService);
        const commandService = accessor.get(ICommandService);
        const chatView = await viewsService.openView(ChatViewId, true);
        const focused = chatView?.focusSessions();
        if (focused) {
            return;
        }
        const configuredSessionsViewerOrientation = configurationService.getValue(ChatConfiguration.ChatViewSessionsOrientation);
        if (configuredSessionsViewerOrientation === 'stacked') {
            await commandService.executeCommand(ACTION_ID_NEW_CHAT);
        }
        else {
            await commandService.executeCommand(ShowAgentSessionsSidebar.ID);
        }
        chatView?.focusSessions();
    }
}
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRTZXNzaW9uc0FjdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zQWN0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQzVELE9BQU8sRUFBNEYscUJBQXFCLEVBQUUsdUJBQXVCLEVBQUUsK0JBQStCLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUNwTixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxZQUFZLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNsRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFFakUsT0FBTyxFQUFFLDhCQUE4QixFQUFFLDhCQUE4QixFQUFFLHFCQUFxQixFQUFFLDhCQUE4QixFQUF5QixNQUFNLG9CQUFvQixDQUFDO0FBQ2xMLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN2RSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFFMUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxrQkFBa0IsRUFBRSxNQUFNLFlBQVksQ0FBQztBQUM1RCxPQUFPLEVBQUUsWUFBWSxFQUFFLGdCQUFnQixFQUFrQixVQUFVLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUNqSSxPQUFPLEVBQUUsc0JBQXNCLEVBQXlCLE1BQU0sNkJBQTZCLENBQUM7QUFDNUYsT0FBTyxFQUFFLHVCQUF1QixFQUFZLE1BQU0sc0RBQXNELENBQUM7QUFDekcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDbEUsT0FBTyxFQUFFLGNBQWMsRUFB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