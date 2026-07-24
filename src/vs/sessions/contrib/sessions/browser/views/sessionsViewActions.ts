/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { KeyChord, KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { isMobile, isWeb } from '../../../../../base/common/platform.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { CLOSE_MOBILE_SIDEBAR_DRAWER_COMMAND_ID } from '../../../../browser/workbench.js';
import { EditorsVisibleContext, EditorAreaFocusContext, IsSessionsWindowContext } from '../../../../../workbench/common/contextkeys.js';
import { SessionsCategories } from '../../../../common/categories.js';
import { UNARCHIVE_SESSION_COMMAND_ID } from '../../../../common/sessionCommands.js';
import { SessionSupportsDeleteContext, SessionSupportsRenameContext, IsNewChatSessionContext, SessionIsArchivedContext, SessionIsCreatedContext, SessionIsReadContext } from '../../../../common/contextkeys.js';
import { SessionItemToolbarMenuId, SessionItemContextMenuId, SessionSectionToolbarMenuId, SessionGroupToolbarMenuId, SessionSectionTypeContext, SessionGroupHasVisibleSessionsContext, SessionGroupIsEmptyContext, IsSessionPinnedContext, SessionsGrouping, SessionsSorting, ISessionSection, ISessionGroupItem } from './sessionsList.js';
import { ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionGroupsService } from '../../../../services/sessions/browser/sessionGroupsService.js';
import { IsWorkspaceGroupCappedContext, SessionsViewFilterOptionsSubMenu, SessionsViewFilterSubMenu, SessionsViewGroupingContext, SessionsViewId, SessionsView, SessionsViewSortingContext, openSessionToTheSide } from './sessionsView.js';
import { Menus } from '../../../../browser/menus.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { AGENT_HOST_ENABLED_CONTEXT_KEY } from '../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { ISessionsPartService } from '../../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';

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
		const sessionsService = accessor.get(ISessionsService);
		sessionsService.openNewSession();
	}
});

KeybindingsRegistry.registerKeybindingRule({
	id: CLOSE_SESSION_COMMAND_ID,
	weight: KeybindingWeight.SessionsContrib,
	when: ContextKeyExpr.and(IsNewChatSessionContext.negate(), EditorsVisibleContext.negate()),
	primary: KeyMod.CtrlCmd | KeyCode.KeyW,
	win: { primary: KeyMod.CtrlCmd | KeyCode.F4, secondary: [KeyMod.CtrlCmd | KeyCode.KeyW] },
});

//  Open Session at Index (Ctrl/Cmd+1..9)

const OPEN_SESSION_AT_INDEX_COMMAND_ID = 'sessionsViewPane.openSessionAtIndex';

function digitToKeyCode(digit: number): KeyCode {
	switch (digit) {
		case 1: return KeyCode.Digit1;
		case 2: return KeyCode.Digit2;
		case 3: return KeyCode.Digit3;
		case 4: return KeyCode.Digit4;
		case 5: return KeyCode.Digit5;
		case 6: return KeyCode.Digit6;
		case 7: return KeyCode.Digit7;
		case 8: return KeyCode.Digit8;
		case 9: return KeyCode.Digit9;
		default: return KeyCode.Unknown;
	}
}

const openSessionAtIndex = (accessor: ServicesAccessor, sessionIndex: unknown): void => {
	if (typeof sessionIndex !== 'number') {
		return;
	}
	const viewsService = accessor.get(IViewsService);
	const sessionsService = accessor.get(ISessionsService);
	const view = viewsService.getViewWithId<SessionsView>(SessionsViewId);
	const visible = view?.sessionsControl?.getVisibleSessions() ?? [];
	if (visible.length === 0) {
		return;
	}
	// Index -1 means "last session"
	const target = sessionIndex === -1
		? visible[visible.length - 1]
		: visible[sessionIndex];
	if (!target) {
		return;
	}
	sessionsService.openSession(target.resource);
};

CommandsRegistry.registerCommand({
	id: OPEN_SESSION_AT_INDEX_COMMAND_ID,
	handler: openSessionAtIndex
});

// Open Nth session from the list. Windows/Linux: Alt+1..9 (Ctrl+1..9 is reserved
// for focusing sessions in the grid). macOS: Ctrl+1..9 (WinCtrl) — the grid uses
// Cmd+1..9 there, so Ctrl is free and avoids Option+digit typing symbols.
// 1..8 open that session; 9 opens the last session.
for (let visibleIndex = 1; visibleIndex <= 9; visibleIndex++) {
	const sessionIndex = visibleIndex === 9 ? -1 : visibleIndex - 1;
	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: OPEN_SESSION_AT_INDEX_COMMAND_ID + visibleIndex,
		weight: KeybindingWeight.SessionsContrib,
		when: IsSessionsWindowContext,
		primary: KeyMod.Alt | digitToKeyCode(visibleIndex),
		mac: { primary: KeyMod.WinCtrl | digitToKeyCode(visibleIndex) },
		handler: accessor => openSessionAtIndex(accessor, sessionIndex)
	});
}

//  Navigate Previous / Next Session (list order)

const navigateSessionInList = async (accessor: ServicesAccessor, direction: 'previous' | 'next'): Promise<void> => {
	const viewsService = accessor.get(IViewsService);
	const sessionsService = accessor.get(ISessionsService);
	const view = viewsService.getViewWithId<SessionsView>(SessionsViewId);
	const visible = view?.sessionsControl?.getVisibleSessions() ?? [];
	if (visible.length === 0) {
		return;
	}

	// Locate the active session within the visible list so navigation follows
	// what the user sees (respecting grouping, filtering, and collapsed sections).
	const activeResource = sessionsService.activeSession.get()?.resource.toString();
	const currentIndex = activeResource === undefined
		? -1
		: visible.findIndex(session => session.resource.toString() === activeResource);

	let targetIndex: number;
	if (currentIndex === -1) {
		// No active session in the visible list: start from the nearest edge.
		targetIndex = direction === 'next' ? 0 : visible.length - 1;
	} else {
		targetIndex = direction === 'next'
			? Math.min(currentIndex + 1, visible.length - 1)
			: Math.max(currentIndex - 1, 0);
	}

	// At the list edges the target clamps to the active session; don't re-open it.
	if (targetIndex === currentIndex) {
		return;
	}

	const target = visible[targetIndex];
	if (target) {
		await sessionsService.openSession(target.resource);
	}
};

registerAction2(class NavigatePreviousSessionAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsViewPane.navigatePreviousSession',
			title: {
				value: localize('navigatePreviousSession', "Go to Previous Session"),
				original: 'Go to Previous Session',
				mnemonicTitle: localize('navigatePreviousSession.mnemonic', "&&Previous Session"),
			},
			f1: true,
			category: SessionsCategories.Sessions,
			keybinding: {
				// Mirror core "Previous Editor"; keep Alt+Up as a sessions-only alternate outside the editor area.
				weight: KeybindingWeight.SessionsContrib,
				when: ContextKeyExpr.and(IsSessionsWindowContext, EditorAreaFocusContext.toNegated()),
				primary: KeyMod.CtrlCmd | KeyCode.PageUp,
				secondary: [KeyMod.Alt | KeyCode.UpArrow],
				mac: {
					primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.LeftArrow,
					secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.BracketLeft, KeyMod.Alt | KeyCode.UpArrow],
				},
			},
			menu: [{
				id: Menus.GoMenu,
				group: '2_list_nav',
				order: 1,
			}]
		});
	}
	override run(accessor: ServicesAccessor): Promise<void> {
		return navigateSessionInList(accessor, 'previous');
	}
});

registerAction2(class NavigateNextSessionAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsViewPane.navigateNextSession',
			title: {
				value: localize('navigateNextSession', "Go to Next Session"),
				original: 'Go to Next Session',
				mnemonicTitle: localize('navigateNextSession.mnemonic', "&&Next Session"),
			},
			f1: true,
			category: SessionsCategories.Sessions,
			keybinding: {
				// Mirror core "Next Editor"; keep Alt+Down as a sessions-only alternate outside the editor area.
				weight: KeybindingWeight.SessionsContrib,
				when: ContextKeyExpr.and(IsSessionsWindowContext, EditorAreaFocusContext.toNegated()),
				primary: KeyMod.CtrlCmd | KeyCode.PageDown,
				secondary: [KeyMod.Alt | KeyCode.DownArrow],
				mac: {
					primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.RightArrow,
					secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.BracketRight, KeyMod.Alt | KeyCode.DownArrow],
				},
			},
			menu: [{
				id: Menus.GoMenu,
				group: '2_list_nav',
				order: 2,
			}]
		});
	}
	override run(accessor: ServicesAccessor): Promise<void> {
		return navigateSessionInList(accessor, 'next');
	}
});

//  View Title Menu

MenuRegistry.appendMenuItem(Menus.SidebarSessionsHeader, {
	submenu: SessionsViewFilterSubMenu,
	title: localize2('filterSessions', "Filter Sessions"),
	icon: Codicon.settings,
	group: 'navigation',
	order: 10,
});

MenuRegistry.appendMenuItem(Menus.SidebarSessionsHeader, {
	command: {
		id: 'sessionsViewPane.find',
		title: localize2('find', "Find Session"),
		icon: Codicon.search,
	},
	group: 'navigation',
	order: 20,
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

//  Collapse All Groups

registerAction2(class CollapseAllGroupsAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsViewPane.collapseAllGroups',
			title: localize2('collapseAllGroups', "Collapse All Groups"),
			category: SessionsCategories.Sessions,
			menu: [{ id: SessionsViewFilterSubMenu, group: '4_collapse', order: 0 }]
		});
	}
	override run(accessor: ServicesAccessor) {
		const viewsService = accessor.get(IViewsService);
		const view = viewsService.getViewWithId<SessionsView>(SessionsViewId);
		view?.sessionsControl?.collapseAllSections();
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
				order: 1,
				when: ContextKeyExpr.equals(SessionSectionTypeContext.key, 'workspace'),
			}]
		});
	}
	async run(accessor: ServicesAccessor, context?: ISessionSection): Promise<void> {
		if (!context || !context.sessions || context.sessions.length === 0) {
			return;
		}
		const sessionsService = accessor.get(ISessionsService);
		const sessionsPartService = accessor.get(ISessionsPartService);
		const commandService = accessor.get(ICommandService);

		sessionsService.openNewSession();

		const session = context.sessions[0];
		const workspace = session.workspace.get();
		const folderUri = workspace?.folders[0]?.root;
		const providerId = session.providerId;

		const newSession = sessionsService.activeSession.get();
		if (folderUri) {
			sessionsPartService.getSessionView(newSession?.sessionId)?.selectWorkspace(folderUri, providerId);
		}

		// On mobile web, the sidebar drawer covers the viewport; close it so
		// the new session view becomes visible after creation. Routes through
		// the drawer-close command to keep the mobile nav/history stack in sync.
		if (isWeb && isMobile) {
			commandService.executeCommand(CLOSE_MOBILE_SIDEBAR_DRAWER_COMMAND_ID);
		}

		sessionsPartService.focusSession(newSession);
	}
});

const NEW_QUICK_CHAT_COMMAND_ID = 'sessionsView.newQuickChat';

// Gate on AI features being enabled and the local agent host (which serves
// quick chats) being available.
const QuickChatEnabledContext = ContextKeyExpr.and(
	ChatContextKeys.enabled,
	AGENT_HOST_ENABLED_CONTEXT_KEY,
);

registerAction2(class NewQuickChatAction extends Action2 {
	constructor() {
		super({
			id: NEW_QUICK_CHAT_COMMAND_ID,
			title: localize2('newQuickChat', "New Quick Chat"),
			icon: Codicon.add,
			category: SessionsCategories.Sessions,
			f1: true,
			precondition: QuickChatEnabledContext,
			keybinding: {
				weight: KeybindingWeight.SessionsContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyN),
				when: ContextKeyExpr.and(QuickChatEnabledContext, IsSessionsWindowContext, EditorAreaFocusContext.negate()),
			},
			menu: [
				{
					// Sole create affordance for quick chats: the "+" on the
					// always-visible in-list "Chats" section header. Opens the
					// composer; the session type is chosen via its inline picker.
					id: SessionSectionToolbarMenuId,
					group: 'navigation',
					order: 0,
					when: ContextKeyExpr.and(QuickChatEnabledContext, ContextKeyExpr.equals(SessionSectionTypeContext.key, 'quickchats')),
				},
			]
		});
	}
	override run(accessor: ServicesAccessor): void {
		// Opens the composer with the default (last-used or first) quick-chat
		// session type; the user changes it via the inline composer picker.
		const sessionsService = accessor.get(ISessionsService);
		const activeQuickChat = sessionsService.openQuickChat();

		// On mobile web, the sidebar drawer covers the viewport; close it so the
		// new quick chat composer becomes visible after creation.
		if (isWeb && isMobile) {
			accessor.get(ICommandService).executeCommand(CLOSE_MOBILE_SIDEBAR_DRAWER_COMMAND_ID);
		}

		accessor.get(ISessionsPartService).focusSession(activeQuickChat);
	}
});

const ConfirmArchiveStorageKey = 'sessions.confirmArchive';

function getArchiveSectionConfirmationMessage(context: ISessionSection): string {
	if (context.id === 'pinned') {
		if (context.sessions.length === 1) {
			return localize('archivePinnedSectionSessions.confirmSingle', "Are you sure you want to mark 1 pinned session as done?");
		}

		return localize('archivePinnedSectionSessions.confirm', "Are you sure you want to mark {0} pinned sessions as done?", context.sessions.length);
	}

	if (context.sessions.length === 1) {
		return localize('archiveSectionSessions.confirmSingle', "Are you sure you want to mark 1 session from '{0}' as done?", context.label);
	}

	return localize('archiveSectionSessions.confirm', "Are you sure you want to mark {0} sessions from '{1}' as done?", context.sessions.length, context.label);
}

registerAction2(class ArchiveSectionAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsView.sectionArchive',
			title: localize2('archiveSection', "Mark All as Done"),
			icon: Codicon.checkAll,
			menu: [{
				id: SessionSectionToolbarMenuId,
				group: 'navigation',
				order: 0,
				// Not on Done itself, and not on the "Chats" (quick chats) section —
				// quick chats have no archive/Done action.
				when: ContextKeyExpr.and(
					ContextKeyExpr.notEquals(SessionSectionTypeContext.key, 'archived'),
					ContextKeyExpr.notEquals(SessionSectionTypeContext.key, 'quickchats'),
				),
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
				message: getArchiveSectionConfirmationMessage(context),
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
				storageService.store(ConfirmArchiveStorageKey, true, StorageScope.PROFILE, StorageTarget.USER);
			}
		}

		for (const session of context.sessions) {
			await sessionsManagementService.archiveSession(session);
		}
	}
});

//  Group Header Actions

function getArchiveGroupConfirmationMessage(context: ISessionGroupItem): string {
	if (context.sessions.length === 1) {
		return localize('archiveGroupSessions.confirmSingle', "Are you sure you want to mark 1 session from '{0}' as done?", context.group.name);
	}

	return localize('archiveGroupSessions.confirm', "Are you sure you want to mark {0} sessions from '{1}' as done?", context.sessions.length, context.group.name);
}

registerAction2(class MarkAllSessionsInGroupAsDoneAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsView.markAllInGroupAsDone',
			title: localize2('markAllInGroupAsDone', "Mark All as Done"),
			icon: Codicon.checkAll,
			menu: [{
				id: SessionGroupToolbarMenuId,
				group: 'navigation',
				order: 0,
				when: SessionGroupHasVisibleSessionsContext,
			}]
		});
	}
	async run(accessor: ServicesAccessor, context?: ISessionGroupItem): Promise<void> {
		if (!context || !context.sessions || context.sessions.length === 0) {
			return;
		}

		const sessionsManagementService = accessor.get(ISessionsManagementService);
		const dialogService = accessor.get(IDialogService);
		const storageService = accessor.get(IStorageService);

		const skipConfirmation = storageService.getBoolean(ConfirmArchiveStorageKey, StorageScope.PROFILE, false);
		if (!skipConfirmation) {
			const confirmed = await dialogService.confirm({
				message: getArchiveGroupConfirmationMessage(context),
				detail: localize('archiveGroupSessions.detail', "You can restore sessions later if needed from the sessions view."),
				primaryButton: localize('archiveGroupSessions.archive', "Mark All as Done"),
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

registerAction2(class DeleteEmptySessionGroupAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsView.deleteEmptyGroup',
			title: localize2('deleteEmptyGroup', "Delete Group"),
			icon: Codicon.trash,
			menu: [{
				id: SessionGroupToolbarMenuId,
				group: 'navigation',
				order: 0,
				when: SessionGroupIsEmptyContext,
			}]
		});
	}
	run(accessor: ServicesAccessor, context?: ISessionGroupItem): void {
		if (!context) {
			return;
		}
		const sessionGroupsService = accessor.get(ISessionGroupsService);
		if (sessionGroupsService.getSessionIdsInGroup(context.group.id).length === 0) {
			sessionGroupsService.deleteGroup(context.group.id);
		}
	}
});

registerAction2(class NewSessionInGroupAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsView.newSessionInGroup',
			title: localize2('newSessionInGroup', "New Session"),
			icon: Codicon.plus,
			menu: [{
				id: SessionGroupToolbarMenuId,
				group: 'navigation',
				order: 1,
			}]
		});
	}
	run(accessor: ServicesAccessor, context?: ISessionGroupItem): void {
		if (!context) {
			return;
		}
		const sessionsService = accessor.get(ISessionsService);
		const sessionsPartService = accessor.get(ISessionsPartService);
		const sessionGroupsService = accessor.get(ISessionGroupsService);
		const commandService = accessor.get(ICommandService);

		sessionsService.openNewSession();
		sessionGroupsService.setPendingNewSessionGroup(context.group.id);

		// On mobile web, the sidebar drawer covers the viewport; close it so
		// the new session view becomes visible after creation.
		if (isWeb && isMobile) {
			commandService.executeCommand(CLOSE_MOBILE_SIDEBAR_DRAWER_COMMAND_ID);
		}

		sessionsPartService.focusSession(sessionsService.activeSession.get());
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
					ContextKeyExpr.equals(SessionIsArchivedContext.key, false),
				),
			}, {
				id: SessionItemContextMenuId,
				group: '0_pin',
				order: 0,
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals(IsSessionPinnedContext.key, false),
					ContextKeyExpr.equals(SessionIsArchivedContext.key, false),
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
					ContextKeyExpr.equals(SessionIsArchivedContext.key, false),
				),
			}, {
				id: SessionItemContextMenuId,
				group: '0_pin',
				order: 0,
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals(IsSessionPinnedContext.key, true),
					ContextKeyExpr.equals(SessionIsArchivedContext.key, false),
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
			title: localize2('archiveSession', "Mark as Done"),
			icon: Codicon.check,
			menu: [{
				id: SessionItemToolbarMenuId,
				group: 'navigation',
				order: 1,
				when: ContextKeyExpr.equals(SessionIsArchivedContext.key, false),
			}, {
				id: SessionItemContextMenuId,
				group: '1_edit',
				order: 2,
				when: ContextKeyExpr.equals(SessionIsArchivedContext.key, false),
			}, {
				id: Menus.SessionBarToolbar,
				group: '1_session',
				order: 5,
				when: ContextKeyExpr.and(SessionIsCreatedContext, ContextKeyExpr.equals(SessionIsArchivedContext.key, false)),
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
			id: UNARCHIVE_SESSION_COMMAND_ID,
			title: localize2('unarchiveSession', "Restore"),
			icon: Codicon.discard,
			menu: [{
				id: SessionItemToolbarMenuId,
				group: 'navigation',
				order: 1,
				when: ContextKeyExpr.equals(SessionIsArchivedContext.key, true),
			}, {
				id: SessionItemContextMenuId,
				group: '1_edit',
				order: 2,
				when: ContextKeyExpr.equals(SessionIsArchivedContext.key, true),
			}, {
				id: Menus.SessionBarToolbar,
				group: 'navigation',
				order: 5,
				when: ContextKeyExpr.equals(SessionIsArchivedContext.key, true),
			}]
		});
	}
	async run(accessor: ServicesAccessor, context?: ISession | ISession[]): Promise<void> {
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		const sessionsService = accessor.get(ISessionsService);
		if (!context) {
			const activeSession = sessionsService.activeSession.get();
			if (activeSession) {
				await sessionsManagementService.unarchiveSession(activeSession);
			}
			return;
		}
		const sessions = Array.isArray(context) ? context : [context];
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
				when: SessionSupportsRenameContext,
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
				await sessionsManagementService.renameSession(session, trimmedTitle);
			}
		}
	}
});

registerAction2(class DeleteSessionAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsViewPane.deleteSession',
			title: localize2('deleteSession', "Delete..."),
			menu: [{
				id: SessionItemContextMenuId,
				group: '1_edit',
				order: 4,
				when: SessionSupportsDeleteContext,
			}]
		});
	}
	async run(accessor: ServicesAccessor, context?: ISession | ISession[]): Promise<void> {
		if (!context) {
			return;
		}
		const sessions = (Array.isArray(context) ? context : [context]).filter(session => session.capabilities.get().supportsDelete);
		if (sessions.length === 0) {
			return;
		}

		const dialogService = accessor.get(IDialogService);
		const sessionsManagementService = accessor.get(ISessionsManagementService);

		const confirmed = await dialogService.confirm({
			message: sessions.length === 1
				? localize('deleteSession.confirm', "Are you sure you want to delete this session?")
				: localize('deleteSessions.confirm', "Are you sure you want to delete {0} sessions?", sessions.length),
			detail: localize('deleteSession.detail', "This action cannot be undone."),
			primaryButton: localize('deleteSession.delete', "Delete")
		});
		if (!confirmed.confirmed) {
			return;
		}

		try {
			await sessionsManagementService.deleteSessions(sessions);
		} catch (err) {
			dialogService.error(sessions.length === 1
				? localize('deleteSession.error', "Failed to delete the session: {0}", toErrorMessage(err))
				: localize('deleteSessions.error', "Failed to delete the sessions: {0}", toErrorMessage(err)));
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
					SessionIsReadContext.negate(),
					SessionIsArchivedContext.negate(),
				),
			}, {
				id: Menus.SessionHeaderContext,
				group: '3_read',
				order: 0,
				when: ContextKeyExpr.and(
					SessionIsReadContext.negate(),
					SessionIsArchivedContext.negate(),
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
		sessionsManagementService.markAllRead(sessions);
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
					SessionIsReadContext,
					SessionIsArchivedContext.negate(),
				),
			}, {
				id: Menus.SessionHeaderContext,
				group: '3_read',
				order: 0,
				when: ContextKeyExpr.and(
					SessionIsReadContext,
					SessionIsArchivedContext.negate(),
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
			sessionsManagementService.markUnread(session);
		}
	}
});

registerAction2(class OpenSessionToTheSideAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsViewPane.openToTheSide',
			title: localize2('openToTheSide', "Open to the Side"),
			menu: [{
				id: SessionItemContextMenuId,
				group: 'navigation',
				order: -1,
				when: IsSessionsWindowContext,
			}]
		});
	}
	async run(accessor: ServicesAccessor, context?: ISession | ISession[]): Promise<void> {
		if (!context) {
			return;
		}
		const sessions = Array.isArray(context) ? context : [context];
		const sessionsService = accessor.get(ISessionsService);
		const sessionsPartService = accessor.get(ISessionsPartService);

		for (let i = 0; i < sessions.length - 1; i++) {
			const session = sessions[i];
			const visible = sessionsService.visibleSessions.get();
			const lastVisible = visible[visible.length - 1];
			if (lastVisible && lastVisible.sessionId !== session.sessionId) {
				sessionsService.insertAt(session, lastVisible.sessionId, 'right');
			}
		}

		const lastRequested = sessions[sessions.length - 1];
		await openSessionToTheSide(sessionsService, lastRequested);

		const visibleAfterOpen = sessionsService.visibleSessions.get();
		const opened = visibleAfterOpen.find(s => s?.sessionId === lastRequested.sessionId);
		if (opened) {
			sessionsPartService.focusSession(opened);
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
		const sessions = sessionsManagementService.getSessions()
			.filter(s => !s.isArchived.get() && !s.isRead.get());
		sessionsManagementService.markAllRead(sessions);
	}
});

registerAction2(class RestoreSessionAction extends Action2 {

	constructor() {
		super({
			id: 'agentSession.restore',
			title: localize2('restore', "Restore"),
			icon: Codicon.discard,
			menu: [{
				id: MenuId.AgentsChangesToolbar,
				group: 'navigation',
				order: 1,
				when: ContextKeyExpr.and(
					IsSessionsWindowContext,
					SessionIsArchivedContext
				)
			}]
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		const sessionsService = accessor.get(ISessionsService);
		const activeSession = sessionsService.activeSession.get();
		if (!activeSession || activeSession.status.get() === SessionStatus.Untitled) {
			return;
		}

		await sessionsManagementService.unarchiveSession(activeSession);
	}
});
