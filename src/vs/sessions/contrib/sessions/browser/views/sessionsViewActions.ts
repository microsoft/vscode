/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyChord, KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { isMobile, isWeb } from '../../../../../base/common/platform.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { CLOSE_MOBILE_SIDEBAR_DRAWER_COMMAND_ID } from '../../../../browser/workbench.js';
import { EditorsVisibleContext, EditorAreaFocusContext, IsSessionsWindowContext } from '../../../../../workbench/common/contextkeys.js';
import { SessionsCategories } from '../../../../../workbench/contrib/sessions/common/categories.js';
import { IsNewChatSessionContext, SessionItemIsMultiSelectionContext } from '../../../../../workbench/contrib/sessions/common/contextkeys.js';
import { canStartNewSessionLike, getNewSessionSources, SessionSectionToolbarMenuId, SessionGroupToolbarMenuId, SessionSectionTypeContext, SessionSectionHasNonCloudRepositoryContext, SessionGroupIsComparisonContext, ISessionSection, ISessionGroupItem, NEW_SESSION_FOR_WORKSPACE_ACTION_ID, NEW_SESSION_IN_ENVIRONMENT_ACTION_ID } from '../../../../../workbench/contrib/sessions/browser/views/sessionsList.js';
import { ISession } from '../../../../../workbench/services/sessions/common/session.js';
import { ISessionGroupsService } from '../../../../../workbench/contrib/sessions/browser/sessionGroupsService.js';
import { ISessionsProvidersService } from '../../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { SessionsViewId, SessionsView } from '../../../../../workbench/contrib/sessions/browser/views/sessionsView.js';
import { Menus } from '../../../../../workbench/contrib/sessions/browser/menus.js';
import { AgentsWindowMenus } from '../../../../browser/agentsWindowMenus.js';
import { inheritableSessionTarget, ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { AGENT_HOST_ENABLED_CONTEXT_KEY } from '../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { ISessionsPartService } from '../../../../../workbench/services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { getMainWindowHost, ISessionHostService } from '../../../../../workbench/services/sessions/browser/sessionHost.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { ICustomViewService } from '../../../../../workbench/contrib/sessions/browser/customView.js';
import { IAutomationService } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { AUTOMATIONS_CUSTOM_VIEW_ID } from '../../../../../workbench/contrib/sessions/browser/automationsConstants.js';
import { INewSessionComposerService } from '../../../../../workbench/contrib/sessions/browser/newSessionComposerService.js';
import { WorkspaceSelectionOrigin } from '../../../../../workbench/services/sessions/common/workspaceSelection.js';
import { AICustomizationManagementCommands } from '../../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';

import { SessionsArchiveActionsContribution, registerSessionsListActions } from '../../../../../workbench/contrib/sessions/browser/views/sessionsListActions.js';

registerSessionsListActions();

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
	const sessionHostService = accessor.get(ISessionHostService);
	const view = viewsService.getViewWithId<SessionsView>(SessionsViewId);
	const visible = view?.sessionsControl?.getVisibleSessions() ?? [];
	if (visible.length === 0) {
		return;
	}

	// Locate the active session within the visible list so navigation follows
	// what the user sees (respecting grouping, filtering, and collapsed sections).
	// The sessions list is the main window's: navigation starts from the session the main window shows.
	const activeResource = getMainWindowHost(sessionHostService).session.get()?.resource.toString();
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
				id: AgentsWindowMenus.GoMenu,
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
				id: AgentsWindowMenus.GoMenu,
				group: '2_list_nav',
				order: 2,
			}]
		});
	}
	override run(accessor: ServicesAccessor): Promise<void> {
		return navigateSessionInList(accessor, 'next');
	}
});

const SessionGroupingSectionContext = ContextKeyExpr.or(
	ContextKeyExpr.equals(SessionSectionTypeContext.key, 'workspace'),
	ContextKeyExpr.equals(SessionSectionTypeContext.key, 'repository'),
	ContextKeyExpr.equals(SessionSectionTypeContext.key, 'environment'),
);

/**
 * Opens a new session that starts in the workspace and environment of `session`, or in the
 * composer's own choice of workspace without one.
 */
async function openNewSessionLike(accessor: ServicesAccessor, session: ISession | undefined): Promise<void> {
	const sessionsService = accessor.get(ISessionsService);
	const sessionsManagementService = accessor.get(ISessionsManagementService);
	const sessionsPartService = accessor.get(ISessionsPartService);
	const commandService = accessor.get(ICommandService);

	const mainWindowHost = getMainWindowHost(accessor.get(ISessionHostService));

	accessor.get(INewSessionComposerService).notifyUserWorkspaceSelection();
	await sessionsService.openNewSession();

	const folderUri = session?.workspace.get()?.folders[0]?.root;
	if (session && folderUri) {
		const target = inheritableSessionTarget(sessionsManagementService, session, folderUri);
		sessionsPartService.getSessionView(mainWindowHost.session.get()?.sessionId)?.selectWorkspace(target.folderUri ?? folderUri, { providerId: target.providerId, selectionOrigin: WorkspaceSelectionOrigin.User });
	}

	// On mobile web, the sidebar drawer covers the viewport; close it so
	// the new session view becomes visible after creation. Routes through
	// the drawer-close command to keep the mobile nav/history stack in sync.
	if (isWeb && isMobile) {
		commandService.executeCommand(CLOSE_MOBILE_SIDEBAR_DRAWER_COMMAND_ID);
	}

	sessionsService.focusActiveSession();
}

registerAction2(class NewSessionForWorkspaceAction extends Action2 {
	constructor() {
		super({
			id: NEW_SESSION_FOR_WORKSPACE_ACTION_ID,
			title: localize2('newSessionForWorkspace', "New Session"),
			icon: Codicon.plus,
			menu: [SessionSectionToolbarMenuId, Menus.SessionSectionContext].flatMap(id => [
				{
					id,
					group: 'navigation',
					order: 0,
					when: ContextKeyExpr.and(
						ChatContextKeys.enabled,
						SessionSectionHasNonCloudRepositoryContext,
						SessionGroupingSectionContext)
				},
				{
					id,
					group: 'navigation',
					order: 0,
					when: ContextKeyExpr.and(
						SessionGroupingSectionContext,
						ContextKeyExpr.or(
							ChatContextKeys.enabled.negate(),
							SessionSectionHasNonCloudRepositoryContext.negate()),
					),
				},
			])
		});
	}
	async run(accessor: ServicesAccessor, context?: ISessionSection): Promise<void> {
		if (!context || !context.sessions || context.sessions.length === 0) {
			return;
		}
		// Sections spanning workspaces start like their most recently created available session.
		const source = context.repository || context.environment
			? getNewSessionSources(context.sessions, accessor.get(ISessionsProvidersService), accessor.get(ISessionsManagementService))
				.reduce<ISession | undefined>((latest, { session }) => !latest || session.createdAt.getTime() > latest.createdAt.getTime() ? session : latest, undefined)
			: undefined;
		return openNewSessionLike(accessor, source ?? context.sessions.find(session => canStartNewSessionLike(session, accessor.get(ISessionsManagementService))));
	}
});

CommandsRegistry.registerCommand(NEW_SESSION_IN_ENVIRONMENT_ACTION_ID, (accessor, section: ISessionSection, environment: string) => {
	const source = getNewSessionSources(section.sessions, accessor.get(ISessionsProvidersService), accessor.get(ISessionsManagementService)).find(source => source.environment.id === environment);
	return source ? openNewSessionLike(accessor, source.session) : undefined;
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
			menu: [SessionSectionToolbarMenuId, Menus.SessionSectionContext].map(id => ({
				// Sole create affordance for quick chats: the "+" on the
				// always-visible in-list "Chats" section header. Opens the
				// composer; the session type is chosen via its inline picker.
				id,
				group: 'navigation',
				order: 0,
				when: ContextKeyExpr.and(QuickChatEnabledContext, ContextKeyExpr.equals(SessionSectionTypeContext.key, 'quickchats')),
			}))
		});
	}
	override run(accessor: ServicesAccessor): void {
		const sessionsService = accessor.get(ISessionsService);
		const sessionsPartService = accessor.get(ISessionsPartService);
		const composerService = accessor.get(INewSessionComposerService);
		composerService.notifyUserNavigation();
		if (accessor.get(ISessionsManagementService).isQuickChatTargetAvailable()) {
			sessionsService.unsetNewSession();
			sessionsPartService.getSessionView(undefined)?.selectNoWorkspace();
		}
		// On mobile web, the sidebar drawer covers the viewport; close it so the
		// new session composer becomes visible after creation.
		if (isWeb && isMobile) {
			accessor.get(ICommandService).executeCommand(CLOSE_MOBILE_SIDEBAR_DRAWER_COMMAND_ID);
		}

		sessionsService.focusActiveSession();
	}
});

registerAction2(class NewSessionInGroupAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsView.newSessionInGroup',
			title: localize2('newSessionInGroup', "New Session"),
			icon: Codicon.plus,
			menu: [SessionGroupToolbarMenuId, Menus.SessionGroupContext].map(id => ({
				id,
				group: 'navigation',
				order: 1,
				when: SessionGroupIsComparisonContext.negate(),
			}))
		});
	}
	run(accessor: ServicesAccessor, context?: ISessionGroupItem): void {
		if (!context || context.comparison) {
			return;
		}
		const sessionsService = accessor.get(ISessionsService);
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

		sessionsService.focusActiveSession();
	}
});

//  Session Item Actions

registerAction2(class OpenSessionCustomizationsAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsViewPane.openCustomizations',
			title: localize2('openSessionCustomizations', "Open Customizations"),
			icon: Codicon.extensions,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, SessionItemIsMultiSelectionContext.negate()),
			menu: {
				id: Menus.SessionItemContextMenu,
				group: 'navigation',
				order: 6,
				when: ChatContextKeys.enabled,
			},
		});
	}

	async run(accessor: ServicesAccessor, context?: ISession | ISession[]): Promise<void> {
		const sessions = context ? Array.isArray(context) ? context : [context] : [];
		if (sessions.length !== 1) {
			throw new Error(localize('openSessionCustomizations.selectSingleSession', "Select a single session to open its customizations."));
		}
		await accessor.get(ICommandService).executeCommand(AICustomizationManagementCommands.OpenEditor, { sessionResource: sessions[0].resource });
	}
});

registerAction2(class OpenSessionToTheSideAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsViewPane.openToTheSide',
			title: localize2('splitView', "Split View"),
			menu: [{
				id: Menus.SessionItemOpenIn,
				group: 'navigation',
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
			const reference = sessionsService.slotPanes.get().at(-1)?.session.get();
			await sessionsService.openSessionsAt(sessions, reference?.sessionId, 'right', { source: 'sessionsList', activate: 'last', forceMainChat: true });
		}
	}
});

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
