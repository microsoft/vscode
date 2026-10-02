/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { KeyChord, KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { isMobile, isWeb } from '../../../../../base/common/platform.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Categories } from '../../../../../platform/action/common/actionCommonCategories.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IsDevelopmentContext } from '../../../../../platform/contextkey/common/contextkeys.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { WorkbenchListFocusContextKey } from '../../../../../platform/list/browser/listService.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { CLOSE_MOBILE_SIDEBAR_DRAWER_COMMAND_ID } from '../../../../browser/workbench.js';
import { EditorsVisibleContext, EditorAreaFocusContext, FocusedViewContext, IsSessionsWindowContext } from '../../../../../workbench/common/contextkeys.js';
import { SessionsCategories } from '../../../../common/categories.js';
import { SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING } from '../../../../common/sessionConfig.js';
import { ARCHIVE_CHAT_COMMAND_ID, ARCHIVE_SESSION_COMMAND_ID, MARK_SESSION_READ_COMMAND_ID, MARK_SESSION_UNREAD_COMMAND_ID, RENAME_SESSION_COMMAND_ID, UNARCHIVE_CHAT_COMMAND_ID, UNARCHIVE_SESSION_COMMAND_ID } from '../../../../common/sessionCommands.js';
import { IsPhoneLayoutContext, SessionSupportsDeleteContext, SessionSupportsRenameContext, IsNewChatSessionContext, SessionIsArchivedContext, SessionIsCreatedContext, SessionIsReadContext, SessionItemIsMultiSelectionContext, SessionsListPromoteNewChatActionContext } from '../../../../common/contextkeys.js';
import { SessionItemCanImportContext, SessionItemContextMenuId, SessionSectionToolbarMenuId, SessionGroupToolbarMenuId, SessionSectionTypeContext, SessionSectionHasNonCloudRepositoryContext, SessionGroupHasVisibleSessionsContext, SessionGroupIsEmptyContext, SessionGroupIsComparisonContext, IsSessionPinnedContext, SessionsGrouping, SessionsSorting, ISessionSection, ISessionGroupItem, NEW_SESSION_FOR_WORKSPACE_ACTION_ID, ISessionChatItem, SessionChatItemCanArchiveContext, SessionChatItemIsArchivedContext } from './sessionsList.js';
import { getChatCapabilities, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionGroupsService } from '../../../../services/sessions/browser/sessionGroupsService.js';
import { IsWorkspaceGroupCappedContext, SessionsViewCompactContext, SessionsViewGroupingContext, SessionsViewId, SessionsView, SessionsViewSortingContext } from './sessionsView.js';
import { Menus } from '../../../../browser/menus.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ChatSessionArchiveActionWording, ChatSessionArchiveActionWordingSettingId, getChatSessionArchiveActionPresentation, getChatSessionArchiveActionWording } from '../../../../../platform/chat/common/sessionArchiveActions.js';
import { AGENT_HOST_ENABLED_CONTEXT_KEY } from '../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { ISessionsPartService } from '../../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { registerExternalSessionsFilterMenu } from '../../../../../workbench/contrib/chat/browser/agentSessions/externalSessionsFilterMenu.js';
import { ICustomViewService } from '../../../../services/customView/browser/customViewService.js';
import { IAutomationService } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { ChatAutomationsEnabledContext } from '../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { AUTOMATIONS_CUSTOM_VIEW_ID } from '../automationsConstants.js';
import { UNIFIED_WORKSPACE_PICKER_SETTING } from '../../../chat/common/constants.js';
import { INewSessionComposerService } from '../../../chat/browser/newSessionComposerService.js';
import { WorkspaceSelectionOrigin } from '../../../../common/workspaceSelection.js';
import { AccessibleViewType } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { SessionsListNotificationFocused } from './sessionsListNotification.js';

AccessibleViewRegistry.register({
	name: 'sessions-list-notification',
	type: AccessibleViewType.Help,
	priority: 110,
	when: SessionsListNotificationFocused,
	getProvider: accessor => accessor.get(IViewsService).getViewWithId<SessionsView>(SessionsViewId)?.archiveNotification?.getAccessibilityHelp(),
});

async function archiveSessionsWithUndo(
	sessions: readonly ISession[],
	wording: ChatSessionArchiveActionWording,
	sessionsManagementService: ISessionsManagementService,
	groupsService: ISessionGroupsService,
	viewsService: IViewsService,
): Promise<void> {
	const archived: { session: ISession; groupId: string | undefined }[] = [];
	const candidates = sessions.filter(session => !session.isArchived.get()).map(session => ({
		session,
		groupId: groupsService.getGroupOfSession(session.sessionId),
	}));
	try {
		for (const entry of candidates) {
			await sessionsManagementService.archiveSession(entry.session);
			archived.push(entry);
		}
	} finally {
		// A partially completed batch must remain undoable even when a later archive fails.
		if (archived.length > 0) {
			const message = wording === ChatSessionArchiveActionWording.MarkAsDone
				? localize('sessionsMarkedDone', "{0} marked done", archived.length)
				: localize('sessionsArchived', "{0} archived", archived.length);
			viewsService.getViewWithId<SessionsView>(SessionsViewId)?.archiveNotification?.show(message, async () => {
				while (archived.length > 0) {
					const { session, groupId } = archived[0];
					const current = sessionsManagementService.getSession(session.resource);
					if (current?.isArchived.get()) {
						await sessionsManagementService.unarchiveSession(current);
						if (groupId && groupsService.getGroup(groupId) && !groupsService.getGroupOfSession(current.sessionId)) {
							groupsService.addToGroup(current.sessionId, groupId);
						}
					}
					archived.shift();
				}
				status(localize('sessionsRestored', "Sessions restored."));
			});
		}
	}
}

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
		accessor.get(INewSessionComposerService).notifyUserNavigation();
		const sessionsService = accessor.get(ISessionsService);
		sessionsService.openNewSession();
	}
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

const openSessionAtIndex = async (accessor: ServicesAccessor, sessionIndex: unknown): Promise<void> => {
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
	if (await sessionsService.canOpenSession(target)) {
		await sessionsService.openChat(target, target.mainChat.get().resource, { source: 'sessionsList' });
	}
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
		if (await sessionsService.canOpenSession(target)) {
			await sessionsService.openChat(target, target.mainChat.get().resource, { source: 'navigation' });
		}
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
					secondary: [KeyMod.Alt | KeyCode.UpArrow],
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
					secondary: [KeyMod.Alt | KeyCode.DownArrow],
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
	submenu: Menus.SessionsViewFilter,
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

for (const option of [
	{ value: SessionsSorting.Created, label: localize('created', "Created") },
	{ value: SessionsSorting.Updated, label: localize('updated', "Updated") },
]) {
	MenuRegistry.appendMenuItem(Menus.SessionsViewFilter, {
		submenu: Menus.SessionsViewOrdering,
		title: localize2('ordering', "Ordering ({0})", option.label),
		when: SessionsViewSortingContext.isEqualTo(option.value),
		group: '1_presentation',
		order: 0,
	});
}

for (const option of [
	{ value: SessionsGrouping.Date, label: localize('time', "Time") },
	{ value: SessionsGrouping.Workspace, label: localize('workspace', "Workspace") },
]) {
	MenuRegistry.appendMenuItem(Menus.SessionsViewFilter, {
		submenu: Menus.SessionsViewGrouping,
		title: localize2('grouping', "Grouping ({0})", option.label),
		when: SessionsViewGroupingContext.isEqualTo(option.value),
		group: '1_presentation',
		order: 1,
	});
}

for (const option of [
	{ capped: true, label: localize('recent', "Recent") },
	{ capped: false, label: localize('all', "All") },
]) {
	MenuRegistry.appendMenuItem(Menus.SessionsViewFilter, {
		submenu: Menus.SessionsViewShow,
		title: localize2('showSessions', "Show ({0})", option.label),
		when: ContextKeyExpr.and(
			SessionsViewGroupingContext.isEqualTo(SessionsGrouping.Workspace),
			IsWorkspaceGroupCappedContext.isEqualTo(option.capped),
		),
		group: '1_presentation',
		order: 2,
	});
}

for (const [index, item] of [
	{ submenu: Menus.SessionsViewSource, title: localize2('createdIn', "Created In") },
	{ submenu: Menus.SessionsViewHarness, title: localize2('harness', "Harness") },
].entries()) {
	MenuRegistry.appendMenuItem(Menus.SessionsViewFilter, {
		...item,
		group: '2_filters',
		order: index + 1,
	});
}

registerExternalSessionsFilterMenu(Menus.SessionsViewFilter, Menus.SessionsViewExternalFilter, '3_visibility', true, localize2('createdExternally', "Created Externally"));

registerAction2(class ToggleExternalSessionsSectionAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsViewPane.toggleExternalSessionsSection',
			title: localize2('showInExternalSection', "Show in External Section"),
			toggled: ContextKeyExpr.equals(`config.${SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING}`, true),
			menu: {
				id: Menus.SessionsViewExternalFilter,
				group: '2_grouping',
				order: 0,
				when: ChatContextKeys.enabled,
			},
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const configurationService = accessor.get(IConfigurationService);
		await configurationService.updateValue(
			SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING,
			!configurationService.getValue<boolean>(SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING),
			ConfigurationTarget.USER,
		);
	}
});

MenuRegistry.appendMenuItem(SessionSectionToolbarMenuId, {
	submenu: Menus.SessionsViewExternalFilter,
	title: localize2('configureExternalSessions', "Configure External Sessions"),
	icon: Codicon.filter,
	group: 'navigation',
	order: 0,
	when: ContextKeyExpr.equals(SessionSectionTypeContext.key, 'external'),
});

//  Sort / Group Actions

registerAction2(class SortByCreatedAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsViewPane.sortByCreated',
			title: localize2('created', "Created"),
			category: SessionsCategories.Sessions,
			toggled: ContextKeyExpr.equals(SessionsViewSortingContext.key, SessionsSorting.Created),
			menu: [{ id: Menus.SessionsViewOrdering, group: '1_sort', order: 0 }]
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
			title: localize2('updated', "Updated"),
			category: SessionsCategories.Sessions,
			toggled: ContextKeyExpr.equals(SessionsViewSortingContext.key, SessionsSorting.Updated),
			menu: [{ id: Menus.SessionsViewOrdering, group: '1_sort', order: 1 }]
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
			title: localize2('workspace', "Workspace"),
			category: SessionsCategories.Sessions,
			toggled: ContextKeyExpr.equals(SessionsViewGroupingContext.key, SessionsGrouping.Workspace),
			menu: [{ id: Menus.SessionsViewGrouping, group: '1_group', order: 1 }]
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
			title: localize2('time', "Time"),
			category: SessionsCategories.Sessions,
			toggled: ContextKeyExpr.equals(SessionsViewGroupingContext.key, SessionsGrouping.Date),
			menu: [{ id: Menus.SessionsViewGrouping, group: '1_group', order: 0 }]
		});
	}
	override run(accessor: ServicesAccessor) {
		const viewsService = accessor.get(IViewsService);
		const view = viewsService.getViewWithId<SessionsView>(SessionsViewId);
		view?.setGrouping(SessionsGrouping.Date);
	}
});

registerAction2(class ToggleCompactSessionsViewAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsViewPane.toggleCompact',
			title: localize2('toggleCompactSessionsView', "Compact View"),
			category: SessionsCategories.Sessions,
			toggled: SessionsViewCompactContext,
			menu: [{
				id: Menus.SessionsViewFilter,
				group: '4_view',
				order: 0,
				when: IsPhoneLayoutContext.negate(),
			}]
		});
	}
	override run(accessor: ServicesAccessor) {
		const viewsService = accessor.get(IViewsService);
		const view = viewsService.getViewWithId<SessionsView>(SessionsViewId);
		view?.toggleCompact();
	}
});

//  Workspace Group Capping

registerAction2(class ShowRecentWorkspaceSessionsAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsViewPane.showRecentSessions',
			title: localize2('recent', "Recent"),
			category: SessionsCategories.Sessions,
			toggled: IsWorkspaceGroupCappedContext,
			menu: [{
				id: Menus.SessionsViewShow,
				group: '1_show',
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
			title: localize2('all', "All"),
			category: SessionsCategories.Sessions,
			toggled: IsWorkspaceGroupCappedContext.negate(),
			menu: [{
				id: Menus.SessionsViewShow,
				group: '1_show',
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
			menu: [{ id: Menus.SessionsViewFilter, group: '4_view', order: 1 }]
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
			id: NEW_SESSION_FOR_WORKSPACE_ACTION_ID,
			title: localize2('newSessionForWorkspace', "New Session"),
			icon: Codicon.plus,
			menu: [
				{
					id: SessionSectionToolbarMenuId,
					group: 'navigation',
					order: 0,
					when: ContextKeyExpr.and(
						ChatContextKeys.enabled,
						SessionSectionHasNonCloudRepositoryContext,
						ContextKeyExpr.equals(SessionSectionTypeContext.key, 'workspace'))
				},
				{
					id: SessionSectionToolbarMenuId,
					group: 'navigation',
					order: 0,
					when: ContextKeyExpr.and(
						ContextKeyExpr.equals(SessionSectionTypeContext.key, 'workspace'),
						ContextKeyExpr.or(
							ChatContextKeys.enabled.negate(),
							SessionSectionHasNonCloudRepositoryContext.negate()),
					),
				},
			]
		});
	}
	async run(accessor: ServicesAccessor, context?: ISessionSection): Promise<void> {
		if (!context || !context.sessions || context.sessions.length === 0) {
			return;
		}
		const sessionsService = accessor.get(ISessionsService);
		const sessionsPartService = accessor.get(ISessionsPartService);
		const commandService = accessor.get(ICommandService);

		accessor.get(INewSessionComposerService).notifyUserWorkspaceSelection();
		await sessionsService.openNewSession();

		const session = context.sessions[0];
		const workspace = session.workspace.get();
		const folderUri = workspace?.folders[0]?.root;
		const providerId = session.providerId;

		const newSession = sessionsService.activeSession.get();
		if (folderUri) {
			sessionsPartService.getSessionView(newSession?.sessionId)?.selectWorkspace(folderUri, { providerId, selectionOrigin: WorkspaceSelectionOrigin.User });
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
		const sessionsService = accessor.get(ISessionsService);
		const sessionsPartService = accessor.get(ISessionsPartService);
		const composerService = accessor.get(INewSessionComposerService);
		composerService.notifyUserNavigation();
		let activeSession;
		if (accessor.get(IConfigurationService).getValue<boolean>(UNIFIED_WORKSPACE_PICKER_SETTING)) {
			if (accessor.get(ISessionsManagementService).isQuickChatTargetAvailable()) {
				sessionsService.unsetNewSession();
				sessionsPartService.getSessionView(undefined)?.selectNoWorkspace();
			}
			activeSession = sessionsService.activeSession.get();
		} else {
			composerService.notifyUserWorkspaceSelection();
			activeSession = sessionsService.openQuickChat();
		}

		// On mobile web, the sidebar drawer covers the viewport; close it so the
		// new session composer becomes visible after creation.
		if (isWeb && isMobile) {
			accessor.get(ICommandService).executeCommand(CLOSE_MOBILE_SIDEBAR_DRAWER_COMMAND_ID);
		}

		sessionsPartService.focusSession(activeSession);
	}
});

const ConfirmArchiveStorageKey = 'sessions.confirmArchive';

function getArchiveSectionConfirmationMessage(context: ISessionSection, wording: ChatSessionArchiveActionWording): string {
	if (context.id === 'pinned') {
		if (context.sessions.length === 1) {
			return wording === ChatSessionArchiveActionWording.MarkAsDone
				? localize('markPinnedSectionSessionDone.confirmSingle', "Are you sure you want to mark 1 pinned session as done?")
				: localize('archivePinnedSectionSession.confirmSingle', "Are you sure you want to archive 1 pinned session?");
		}

		return wording === ChatSessionArchiveActionWording.MarkAsDone
			? localize('markPinnedSectionSessionsDone.confirm', "Are you sure you want to mark {0} pinned sessions as done?", context.sessions.length)
			: localize('archivePinnedSectionSessions.confirm', "Are you sure you want to archive {0} pinned sessions?", context.sessions.length);
	}

	if (context.sessions.length === 1) {
		return wording === ChatSessionArchiveActionWording.MarkAsDone
			? localize('markSectionSessionDone.confirmSingle', "Are you sure you want to mark 1 session from '{0}' as done?", context.label)
			: localize('archiveSectionSession.confirmSingle', "Are you sure you want to archive 1 session from '{0}'?", context.label);
	}

	return wording === ChatSessionArchiveActionWording.MarkAsDone
		? localize('markSectionSessionsDone.confirm', "Are you sure you want to mark {0} sessions from '{1}' as done?", context.sessions.length, context.label)
		: localize('archiveSectionSessions.confirm', "Are you sure you want to archive {0} sessions from '{1}'?", context.sessions.length, context.label);
}

abstract class BaseArchiveSectionAction extends Action2 {
	constructor(private readonly wording: ChatSessionArchiveActionWording) {
		const action = getChatSessionArchiveActionPresentation(wording).archiveAll;
		super({
			id: 'sessionsView.sectionArchive',
			title: action.title,
			icon: action.icon,
			menu: [{
				id: SessionSectionToolbarMenuId,
				group: 'navigation',
				order: 1,
				// Not on Done itself, and not on the "Chats" (quick chats) section.
				// Also not on Automations.
				when: ContextKeyExpr.and(
					ContextKeyExpr.notEquals(SessionSectionTypeContext.key, 'archived'),
					ContextKeyExpr.notEquals(SessionSectionTypeContext.key, 'quickchats'),
					ContextKeyExpr.notEquals(SessionSectionTypeContext.key, 'automations'),
				),
			}]
		});
	}
	async run(accessor: ServicesAccessor, context?: ISessionSection): Promise<void> {
		if (!context || !context.sessions || context.sessions.length === 0) {
			return;
		}

		const dialogService = accessor.get(IDialogService);
		const storageService = accessor.get(IStorageService);
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		const groupsService = accessor.get(ISessionGroupsService);
		const viewsService = accessor.get(IViewsService);

		const skipConfirmation = storageService.getBoolean(ConfirmArchiveStorageKey, StorageScope.PROFILE, false);
		if (!skipConfirmation) {
			const confirmed = await dialogService.confirm({
				message: getArchiveSectionConfirmationMessage(context, this.wording),
				detail: this.wording === ChatSessionArchiveActionWording.MarkAsDone
					? localize('markSectionSessionsDone.detail', "You can restore sessions later if needed from the sessions view.")
					: localize('archiveSectionSessions.detail', "You can unarchive sessions later if needed from the sessions view."),
				primaryButton: getChatSessionArchiveActionPresentation(this.wording).archiveAll.title.value,
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

		await archiveSessionsWithUndo(context.sessions, this.wording, sessionsManagementService, groupsService, viewsService);
	}
}

class ArchiveSectionAction extends BaseArchiveSectionAction {
	constructor() {
		super(ChatSessionArchiveActionWording.Archive);
	}
}

class MarkSectionSessionsDoneAction extends BaseArchiveSectionAction {
	constructor() {
		super(ChatSessionArchiveActionWording.MarkAsDone);
	}
}

//  Group Header Actions

function getArchiveGroupConfirmationMessage(context: ISessionGroupItem, wording: ChatSessionArchiveActionWording): string {
	if (context.sessions.length === 1) {
		return wording === ChatSessionArchiveActionWording.MarkAsDone
			? localize('markGroupSessionDone.confirmSingle', "Are you sure you want to mark 1 session from '{0}' as done?", context.group.name)
			: localize('archiveGroupSession.confirmSingle', "Are you sure you want to archive 1 session from '{0}'?", context.group.name);
	}

	return wording === ChatSessionArchiveActionWording.MarkAsDone
		? localize('markGroupSessionsDone.confirm', "Are you sure you want to mark {0} sessions from '{1}' as done?", context.sessions.length, context.group.name)
		: localize('archiveGroupSessions.confirm', "Are you sure you want to archive {0} sessions from '{1}'?", context.sessions.length, context.group.name);
}

abstract class BaseArchiveSessionsInGroupAction extends Action2 {
	constructor(private readonly wording: ChatSessionArchiveActionWording) {
		const action = getChatSessionArchiveActionPresentation(wording).archiveAll;
		super({
			id: 'sessionsView.markAllInGroupAsDone',
			title: action.title,
			icon: action.icon,
			menu: [{
				id: SessionGroupToolbarMenuId,
				group: 'navigation',
				order: 2,
				when: ContextKeyExpr.and(SessionGroupHasVisibleSessionsContext, SessionGroupIsComparisonContext.negate()),
			}]
		});
	}
	async run(accessor: ServicesAccessor, context?: ISessionGroupItem): Promise<void> {
		if (!context || context.comparison || !context.sessions || context.sessions.length === 0) {
			return;
		}

		const dialogService = accessor.get(IDialogService);
		const storageService = accessor.get(IStorageService);
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		const groupsService = accessor.get(ISessionGroupsService);
		const viewsService = accessor.get(IViewsService);

		const skipConfirmation = storageService.getBoolean(ConfirmArchiveStorageKey, StorageScope.PROFILE, false);
		if (!skipConfirmation) {
			const confirmed = await dialogService.confirm({
				message: getArchiveGroupConfirmationMessage(context, this.wording),
				detail: this.wording === ChatSessionArchiveActionWording.MarkAsDone
					? localize('markGroupSessionsDone.detail', "You can restore sessions later if needed from the sessions view.")
					: localize('archiveGroupSessions.detail', "You can unarchive sessions later if needed from the sessions view."),
				primaryButton: getChatSessionArchiveActionPresentation(this.wording).archiveAll.title.value,
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

		await archiveSessionsWithUndo(context.sessions, this.wording, sessionsManagementService, groupsService, viewsService);
	}
}

class ArchiveSessionsInGroupAction extends BaseArchiveSessionsInGroupAction {
	constructor() {
		super(ChatSessionArchiveActionWording.Archive);
	}
}

class MarkAllSessionsInGroupAsDoneAction extends BaseArchiveSessionsInGroupAction {
	constructor() {
		super(ChatSessionArchiveActionWording.MarkAsDone);
	}
}

registerAction2(class DeleteEmptySessionGroupAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsView.deleteEmptyGroup',
			title: localize2('deleteEmptyGroup', "Delete Group"),
			icon: Codicon.trash,
			menu: [{
				id: SessionGroupToolbarMenuId,
				group: 'navigation',
				order: 2,
				when: ContextKeyExpr.and(SessionGroupIsEmptyContext, SessionGroupIsComparisonContext.negate()),
			}]
		});
	}
	run(accessor: ServicesAccessor, context?: ISessionGroupItem): void {
		if (!context || context.comparison) {
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
				when: SessionGroupIsComparisonContext.negate(),
			}]
		});
	}
	run(accessor: ServicesAccessor, context?: ISessionGroupItem): void {
		if (!context || context.comparison) {
			return;
		}
		const sessionsService = accessor.get(ISessionsService);
		const sessionsPartService = accessor.get(ISessionsPartService);
		const sessionGroupsService = accessor.get(ISessionGroupsService);
		const commandService = accessor.get(ICommandService);

		accessor.get(INewSessionComposerService).notifyUserNavigation();
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
				id: Menus.SessionItemToolbar,
				group: 'navigation',
				order: 1,
				when: ContextKeyExpr.and(
					SessionsListPromoteNewChatActionContext.negate(),
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
				id: Menus.SessionItemToolbar,
				group: 'navigation',
				order: 1,
				when: ContextKeyExpr.and(
					SessionsListPromoteNewChatActionContext.negate(),
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

function getSessionActionTargets(accessor: ServicesAccessor, context?: ISession | ISession[]): readonly ISession[] {
	if (context) {
		return Array.isArray(context) ? context : [context];
	}

	const focusedSessions = getFocusedSessionListTargets(accessor);
	if (focusedSessions) {
		return focusedSessions;
	}

	const activeSession = accessor.get(ISessionsService).activeSession.get();
	return activeSession ? [activeSession] : [];
}

function getFocusedSessionListTargets(accessor: ServicesAccessor): readonly ISession[] | undefined {
	return accessor.get(IViewsService).getViewWithId<SessionsView>(SessionsViewId)?.sessionsControl?.getFocusedSessions();
}

KeybindingsRegistry.registerKeybindingRule({
	id: ARCHIVE_SESSION_COMMAND_ID,
	weight: KeybindingWeight.SessionsContrib,
	when: ContextKeyExpr.and(
		IsSessionsWindowContext,
		FocusedViewContext.isEqualTo(SessionsViewId),
		WorkbenchListFocusContextKey,
	),
	primary: KeyCode.Delete,
	mac: { primary: KeyMod.CtrlCmd | KeyCode.Backspace },
});

registerAction2(class ImportSessionAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsViewPane.importSession',
			title: localize2('importSession', "Import"),
			icon: Codicon.chatImport,
			precondition: ChatContextKeys.enabled,
			menu: [Menus.SessionItemToolbar, SessionItemContextMenuId].map(id => ({
				id,
				group: id === Menus.SessionItemToolbar ? 'navigation' : '1_edit',
				order: 1.5,
				when: ContextKeyExpr.and(ChatContextKeys.enabled, SessionItemCanImportContext, SessionIsArchivedContext.negate()),
			})),
		});
	}

	async run(accessor: ServicesAccessor, context?: ISession | ISession[]): Promise<void> {
		const sessions = getSessionActionTargets(accessor, context).filter(session =>
			session.isExternal?.get() === true && session.capabilities.get().supportsImport && !session.isArchived.get());
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		for (const session of sessions) {
			await sessionsManagementService.importSession(session);
		}
		if (sessions.length > 0) {
			status(sessions.length === 1
				? localize('sessionImported', "Imported {0}.", sessions[0].title.get())
				: localize('sessionsImported', "Imported {0} sessions.", sessions.length));
		}
	}
});

abstract class BaseArchiveSessionAction extends Action2 {
	constructor(wording: ChatSessionArchiveActionWording) {
		const action = getChatSessionArchiveActionPresentation(wording).archive;
		super({
			id: ARCHIVE_SESSION_COMMAND_ID,
			title: action.title,
			icon: action.icon,
			menu: [{
				id: Menus.SessionItemToolbar,
				group: 'navigation',
				order: 2,
				when: ContextKeyExpr.equals(SessionIsArchivedContext.key, false),
			}, {
				id: Menus.AutomationsHistoryItem,
				group: 'navigation',
				order: 2,
				when: ContextKeyExpr.equals(SessionIsArchivedContext.key, false),
			}, {
				id: SessionItemContextMenuId,
				group: '1_edit',
				order: 2,
				when: ContextKeyExpr.equals(SessionIsArchivedContext.key, false),
			}, {
				id: Menus.SessionBarToolbar,
				group: 'secondary/1_session',
				order: 30,
				when: ContextKeyExpr.and(SessionIsCreatedContext, ContextKeyExpr.equals(SessionIsArchivedContext.key, false)),
			}]
		});
	}
	async run(accessor: ServicesAccessor, context?: ISession | ISession[]): Promise<void> {
		const targets = context
			? (Array.isArray(context) ? context : [context])
			: getFocusedSessionListTargets(accessor) ?? [];
		const sessions = targets.filter(session => !session.isArchived.get());
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		for (const session of sessions) {
			await sessionsManagementService.archiveSession(session);
		}
	}
}

export class ArchiveSessionAction extends BaseArchiveSessionAction {
	constructor() {
		super(ChatSessionArchiveActionWording.Archive);
	}
}

class MarkSessionAsDoneAction extends BaseArchiveSessionAction {
	constructor() {
		super(ChatSessionArchiveActionWording.MarkAsDone);
	}
}

abstract class BaseUnarchiveSessionAction extends Action2 {
	constructor(wording: ChatSessionArchiveActionWording) {
		const action = getChatSessionArchiveActionPresentation(wording).unarchive;
		super({
			id: UNARCHIVE_SESSION_COMMAND_ID,
			title: action.title,
			icon: action.icon,
			menu: [{
				id: Menus.SessionItemToolbar,
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
				group: 'secondary/1_session',
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
}

class UnarchiveSessionAction extends BaseUnarchiveSessionAction {
	constructor() {
		super(ChatSessionArchiveActionWording.Archive);
	}
}

class RestoreArchivedSessionAction extends BaseUnarchiveSessionAction {
	constructor() {
		super(ChatSessionArchiveActionWording.MarkAsDone);
	}
}

abstract class BaseArchiveChatAction extends Action2 {
	constructor(wording: ChatSessionArchiveActionWording) {
		const action = getChatSessionArchiveActionPresentation(wording).archive;
		const when = ContextKeyExpr.and(ChatContextKeys.enabled, SessionChatItemCanArchiveContext, SessionChatItemIsArchivedContext.negate());
		super({
			id: ARCHIVE_CHAT_COMMAND_ID,
			title: action.title,
			icon: action.icon,
			menu: [{
				id: Menus.SessionChatItemContext,
				group: '1_chat',
				order: 3,
				when,
			}, {
				id: Menus.SessionChatItemToolbar,
				group: 'navigation',
				order: 1,
				when,
			}],
		});
	}

	override async run(accessor: ServicesAccessor, context?: ISessionChatItem): Promise<void> {
		if (!context || context.chat.isArchived.get() || !getChatCapabilities(context.chat, context.session, undefined).canArchive) {
			return;
		}
		const sessionsService = accessor.get(ISessionsService);
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		await sessionsManagementService.archiveChat(context.session, context.chat);

		const activeSession = sessionsService.activeSession.get();
		if (activeSession?.sessionId === context.session.sessionId) {
			const openChat = activeSession.openChats.get().find(chat => isEqual(chat.resource, context.chat.resource));
			if (openChat) {
				await sessionsService.closeChat(activeSession, openChat);
			}
		}
	}
}

class ArchiveChatAction extends BaseArchiveChatAction {
	constructor() {
		super(ChatSessionArchiveActionWording.Archive);
	}
}

class MarkChatAsDoneAction extends BaseArchiveChatAction {
	constructor() {
		super(ChatSessionArchiveActionWording.MarkAsDone);
	}
}

abstract class BaseUnarchiveChatAction extends Action2 {
	constructor(wording: ChatSessionArchiveActionWording) {
		const action = getChatSessionArchiveActionPresentation(wording).unarchive;
		const when = ContextKeyExpr.and(ChatContextKeys.enabled, SessionChatItemCanArchiveContext, SessionChatItemIsArchivedContext);
		super({
			id: UNARCHIVE_CHAT_COMMAND_ID,
			title: action.title,
			icon: action.icon,
			menu: [{
				id: Menus.SessionChatItemContext,
				group: '1_chat',
				order: 3,
				when,
			}, {
				id: Menus.SessionChatItemToolbar,
				group: 'navigation',
				order: 1,
				when,
			}],
		});
	}

	override async run(accessor: ServicesAccessor, context?: ISessionChatItem): Promise<void> {
		if (!context || !context.chat.isArchived.get() || !getChatCapabilities(context.chat, context.session, undefined).canArchive) {
			return;
		}
		await accessor.get(ISessionsManagementService).unarchiveChat(context.session, context.chat);
	}
}

class UnarchiveChatAction extends BaseUnarchiveChatAction {
	constructor() {
		super(ChatSessionArchiveActionWording.Archive);
	}
}

class RestoreArchivedChatAction extends BaseUnarchiveChatAction {
	constructor() {
		super(ChatSessionArchiveActionWording.MarkAsDone);
	}
}

registerAction2(class RenameSessionAction extends Action2 {
	constructor() {
		super({
			id: RENAME_SESSION_COMMAND_ID,
			title: localize2('renameSession', "Rename..."),
			icon: Codicon.edit,
			precondition: SessionItemIsMultiSelectionContext.negate(),
			keybinding: {
				primary: KeyCode.F2,
				weight: KeybindingWeight.SessionsContrib,
				when: ContextKeyExpr.and(
					IsSessionsWindowContext,
					ContextKeyExpr.or(
						ContextKeyExpr.and(FocusedViewContext.isEqualTo(SessionsViewId), WorkbenchListFocusContextKey),
						ContextKeyExpr.and(ChatContextKeys.inChatSession, SessionSupportsRenameContext),
					),
				),
			},
			menu: [{
				id: SessionItemContextMenuId,
				group: '1_edit',
				order: 1,
				when: SessionSupportsRenameContext,
			}]
		});
	}
	async run(accessor: ServicesAccessor, context?: ISession | ISession[]): Promise<void> {
		const focusedSessions = context ? undefined : getFocusedSessionListTargets(accessor);
		const session = getSessionActionTargets(accessor, context)[0];
		if (!session || !session.capabilities.get().supportsRename) {
			return;
		}
		if (focusedSessions?.includes(session)) {
			const view = accessor.get(IViewsService).getViewWithId<SessionsView>(SessionsViewId);
			if (view?.sessionsControl?.beginRenameSession(session)) {
				return;
			}
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
			if (trimmedTitle && trimmedTitle !== session.title.get().trim()) {
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
			id: MARK_SESSION_READ_COMMAND_ID,
			title: localize2('markRead', "Mark as Read"),
			menu: [{
				id: SessionItemContextMenuId,
				group: '1_edit',
				order: 1.5,
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
			id: MARK_SESSION_UNREAD_COMMAND_ID,
			title: localize2('markUnread', "Mark as Unread"),
			menu: [{
				id: SessionItemContextMenuId,
				group: '1_edit',
				order: 1.5,
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
				group: '0_pin',
				order: 1,
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
		if (sessions.length === 1) {
			await sessionsService.openSessionToSide(sessions[0], { source: 'sessionsList', forceMainChat: true });
		} else {
			const reference = sessionsService.visibleSessions.get().at(-1);
			await sessionsService.openSessionsAt(sessions, reference?.sessionId, 'right', { source: 'sessionsList', activate: 'last', forceMainChat: true });
		}
	}
});

const openInGridWhen = ContextKeyExpr.and(IsSessionsWindowContext, ChatContextKeys.enabled, IsPhoneLayoutContext.negate());
MenuRegistry.appendMenuItem(SessionItemContextMenuId, {
	submenu: Menus.SessionGridOpen,
	title: localize('openInGrid', "Open in Grid"),
	group: '0_pin',
	order: 2,
	when: openInGridWhen,
});

for (const item of [
	{ direction: 'left', title: localize2('openSessionLeft', "Left of Active Session") },
	{ direction: 'right', title: localize2('openSessionRight', "Right of Active Session") },
	{ direction: 'up', title: localize2('openSessionAbove', "Above Active Session") },
	{ direction: 'down', title: localize2('openSessionBelow', "Below Active Session") },
] as const) {
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: `sessionsViewPane.openInGrid.${item.direction}`,
				title: item.title,
				precondition: openInGridWhen,
				menu: { id: Menus.SessionGridOpen },
			});
		}
		async run(accessor: ServicesAccessor, context?: ISession | ISession[]): Promise<void> {
			if (!context) {
				return;
			}
			const service = accessor.get(ISessionsService);
			await service.openSessionsAt(Array.isArray(context) ? context : [context], service.activeSession.get()?.sessionId, item.direction, { source: 'sessionsList', activate: 'last' });
		}
	});
}

registerAction2(class MarkAllSessionsReadAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsViewPane.markAllRead',
			title: localize2('markAllRead', "Mark All as Read"),
			menu: [{
				id: SessionItemContextMenuId,
				group: '0_read',
				order: 1,
				when: ContextKeyExpr.equals(SessionsViewGroupingContext.key, SessionsGrouping.Date),
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

abstract class BaseUnarchiveActiveSessionAction extends Action2 {

	constructor(wording: ChatSessionArchiveActionWording) {
		const action = getChatSessionArchiveActionPresentation(wording).unarchive;
		super({
			id: 'agentSession.restore',
			title: action.title,
			icon: action.icon,
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
}

class UnarchiveActiveSessionAction extends BaseUnarchiveActiveSessionAction {
	constructor() {
		super(ChatSessionArchiveActionWording.Archive);
	}
}

class RestoreActiveSessionAction extends BaseUnarchiveActiveSessionAction {
	constructor() {
		super(ChatSessionArchiveActionWording.MarkAsDone);
	}
}

/**
 * The archive actions for a wording. Both wordings share command ids, so only
 * one set can be registered at a time.
 */
export function getSessionsArchiveActionConstructors(wording: ChatSessionArchiveActionWording): readonly { new(): Action2 }[] {
	return wording === ChatSessionArchiveActionWording.MarkAsDone
		? [
			MarkSectionSessionsDoneAction,
			MarkAllSessionsInGroupAsDoneAction,
			MarkSessionAsDoneAction,
			MarkChatAsDoneAction,
			RestoreArchivedSessionAction,
			RestoreArchivedChatAction,
			RestoreActiveSessionAction,
		]
		: [
			ArchiveSectionAction,
			ArchiveSessionsInGroupAction,
			ArchiveSessionAction,
			ArchiveChatAction,
			UnarchiveSessionAction,
			UnarchiveChatAction,
			UnarchiveActiveSessionAction,
		];
}

export class SessionsArchiveActionsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsArchiveActions';

	private readonly actionRegistrations = this._register(new DisposableStore());

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
		this.registerActions();
		this._register(this.configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(ChatSessionArchiveActionWordingSettingId)) {
				this.registerActions();
			}
		}));
	}

	private registerActions(): void {
		this.actionRegistrations.clear();
		const wording = getChatSessionArchiveActionWording(this.configurationService);
		for (const action of getSessionsArchiveActionConstructors(wording)) {
			this.actionRegistrations.add(registerAction2(action));
		}
	}
}

registerWorkbenchContribution2(SessionsArchiveActionsContribution.ID, SessionsArchiveActionsContribution, WorkbenchPhase.BlockStartup);

registerAction2(class ManageAutomationsAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsView.manageAutomations',
			title: localize2('manageAutomations', "Manage Automations"),
			menu: []
		});
	}
	override run(accessor: ServicesAccessor): void {
		accessor.get(ICustomViewService).showCustomView(AUTOMATIONS_CUSTOM_VIEW_ID);
	}
});

registerAction2(class ResetAutomationsNewBadgeAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.developer.resetAutomationsNewBadge',
			title: localize2('resetAutomationsNewBadge', "Reset Automations New Badge"),
			category: Categories.Developer,
			f1: true,
			precondition: ContextKeyExpr.and(IsDevelopmentContext, IsSessionsWindowContext, ChatAutomationsEnabledContext),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const view = await accessor.get(IViewsService).openView<SessionsView>(SessionsViewId, false);
		await view?.sessionsControl?.resetAutomationsNewBadge();
	}
});

const MARK_ALL_AUTOMATION_RUNS_READ_COMMAND_ID = 'sessionsView.markAllAutomationRunsRead';

registerAction2(class MarkAllAutomationRunsReadAction extends Action2 {
	constructor() {
		super({
			id: MARK_ALL_AUTOMATION_RUNS_READ_COMMAND_ID,
			title: localize2('markAllAutomationRunsRead', "Mark All as Read"),
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const automationService = accessor.get(IAutomationService);
		const sessionsManagementService = accessor.get(ISessionsManagementService);

		const runs = automationService.runs.get();
		const sessions = new Map<string, ISession>();
		for (const run of runs) {
			if ((run.status === 'completed' || run.status === 'failed') && run.sessionResource) {
				const session = sessionsManagementService.getSession(run.sessionResource);
				if (session && !session.isRead.get()) {
					sessions.set(session.resource.toString(), session);
				}
			}
		}
		await sessionsManagementService.markAllRead([...sessions.values()]);
	}
});
