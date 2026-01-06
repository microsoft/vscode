/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../../nls.js';
import { AgentSessionSection, IAgentSession, IAgentSessionSection, IMarshalledAgentSessionContext, isAgentSessionSection, isLocalAgentSessionItem, isMarshalledAgentSessionContext } from './agentSessionsModel.js';
import { Action2, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { AGENT_SESSION_DELETE_ACTION_ID, AGENT_SESSION_RENAME_ACTION_ID, AgentSessionProviders, AgentSessionsViewerOrientation, IAgentSessionsControl } from './agentSessions.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IChatEditorOptions } from '../widgetHosts/editor/chatEditor.js';
import { ChatViewId, IChatWidgetService } from '../chat.js';
import { ACTIVE_GROUP, AUX_WINDOW_GROUP, PreferredGroup, SIDE_GROUP } from '../../../../services/editor/common/editorService.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../../common/views.js';
import { getPartByLocation } from '../../../../services/views/browser/viewsService.js';
import { IWorkbenchLayoutService, Position } from '../../../../services/layout/browser/layoutService.js';
import { IAgentSessionsService } from './agentSessionsService.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ChatEditorInput, showClearEditingSessionConfirmation } from '../widgetHosts/editor/chatEditorInput.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ChatConfiguration } from '../../common/constants.js';
import { ACTION_ID_NEW_CHAT, CHAT_CATEGORY } from '../actions/chatActions.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { ChatViewPane } from '../widgetHosts/viewPane/chatViewPane.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { AgentSessionsPicker } from './agentSessionsPicker.js';
import { ActiveEditorContext } from '../../../../common/contextkeys.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';

//#region Chat View

export class ToggleChatViewSessionsAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.chat.toggleChatViewSessions',
			title: localize2('chat.toggleChatViewSessions.label', "Show Sessions"),
			toggled: ContextKeyExpr.equals(`config.${ChatConfiguration.ChatViewSessionsEnabled}`, true),
			menu: {
				id: MenuId.ChatWelcomeContext,
				group: '0_sessions',
				order: 1,
				when: ChatContextKeys.inChatEditor.negate()
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const configurationService = accessor.get(IConfigurationService);

		const chatViewSessionsEnabled = configurationService.getValue<boolean>(ChatConfiguration.ChatViewSessionsEnabled);
		await configurationService.updateValue(ChatConfiguration.ChatViewSessionsEnabled, !chatViewSessionsEnabled);
	}
}

const agentSessionsOrientationSubmenu = new MenuId('chatAgentSessionsOrientationSubmenu');
MenuRegistry.appendMenuItem(MenuId.ChatWelcomeContext, {
	submenu: agentSessionsOrientationSubmenu,
	title: localize2('chat.sessionsOrientation', "Sessions Orientation"),
	group: '0_sessions',
	order: 2,
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

	async run(accessor: ServicesAccessor): Promise<void> {
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
				order: 3
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
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
					when: ContextKeyExpr.and(
						ContextKeyExpr.equals('view', ChatViewId),
						ContextKeyExpr.equals(`config.${ChatConfiguration.ChatViewSessionsEnabled}`, false)
					),
					group: 'navigation',
					order: 2
				},
				{
					id: MenuId.ViewTitle,
					when: ContextKeyExpr.and(
						ContextKeyExpr.equals('view', ChatViewId),
						ContextKeyExpr.equals(`config.${ChatConfiguration.ChatViewSessionsEnabled}`, true)
					),
					group: '2_history',
					order: 1
				},
				{
					id: MenuId.EditorTitle,
					when: ActiveEditorContext.isEqualTo(ChatEditorInput.EditorID),
				}
			],
			category: CHAT_CATEGORY,
			icon: Codicon.history,
			f1: true,
			precondition: ChatContextKeys.enabled
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const instantiationService = accessor.get(IInstantiationService);

		const agentSessionsPicker = instantiationService.createInstance(AgentSessionsPicker);
		await agentSessionsPicker.pickAgentSession();
	}
}

export class ArchiveAllAgentSessionsAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.chat.archiveAllAgentSessions',
			title: localize2('archiveAll.label', "Archive All Workspace Agent Sessions"),
			precondition: ChatContextKeys.enabled,
			category: CHAT_CATEGORY,
			f1: true,
		});
	}
	async run(accessor: ServicesAccessor) {
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
			detail: localize('archiveAllSessions.detail', "You can unarchive sessions later if needed from the Chat view."),
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

export class ArchiveAgentSessionSectionAction extends Action2 {

	constructor() {
		super({
			id: 'agentSessionSection.archive',
			title: localize2('archiveSection', "Archive All"),
			icon: Codicon.archive,
			menu: {
				id: MenuId.AgentSessionSectionToolbar,
				group: 'navigation',
				order: 1,
				when: ChatContextKeys.agentSessionSection.notEqualsTo(AgentSessionSection.Archived),
			}
		});
	}

	async run(accessor: ServicesAccessor, context?: IAgentSessionSection): Promise<void> {
		if (!context || !isAgentSessionSection(context)) {
			return;
		}

		const dialogService = accessor.get(IDialogService);

		const confirmed = await dialogService.confirm({
			message: context.sessions.length === 1
				? localize('archiveSectionSessions.confirmSingle', "Are you sure you want to archive 1 agent session from '{0}'?", context.label)
				: localize('archiveSectionSessions.confirm', "Are you sure you want to archive {0} agent sessions from '{1}'?", context.sessions.length, context.label),
			detail: localize('archiveSectionSessions.detail', "You can unarchive sessions later if needed from the sessions view."),
			primaryButton: localize('archiveSectionSessions.archive', "Archive All")
		});

		if (!confirmed.confirmed) {
			return;
		}

		for (const session of context.sessions) {
			session.setArchived(true);
		}
	}
}

//#endregion

//#region Session Actions

abstract class BaseAgentSessionAction extends Action2 {

	async run(accessor: ServicesAccessor, context?: IAgentSession | IMarshalledAgentSessionContext): Promise<void> {
		const agentSessionsService = accessor.get(IAgentSessionsService);
		const viewsService = accessor.get(IViewsService);

		let session: IAgentSession | undefined;
		if (isMarshalledAgentSessionContext(context)) {
			session = agentSessionsService.getSession(context.session.resource);
		} else {
			session = context;
		}

		if (!session) {
			const chatView = viewsService.getActiveViewWithId<ChatViewPane>(ChatViewId);
			session = chatView?.getFocusedSessions().at(0);
		}

		if (session) {
			await this.runWithSession(session, accessor);
		}
	}

	abstract runWithSession(session: IAgentSession, accessor: ServicesAccessor): Promise<void> | void;
}

export class MarkAgentSessionUnreadAction extends BaseAgentSessionAction {

	constructor() {
		super({
			id: 'agentSession.markUnread',
			title: localize2('markUnread', "Mark as Unread"),
			menu: {
				id: MenuId.AgentSessionsContext,
				group: '1_edit',
				order: 1,
				when: ContextKeyExpr.and(
					ChatContextKeys.isReadAgentSession,
					ChatContextKeys.isArchivedAgentSession.negate() // no read state for archived sessions
				),
			}
		});
	}

	runWithSession(session: IAgentSession): void {
		session.setRead(false);
	}
}

export class MarkAgentSessionReadAction extends BaseAgentSessionAction {

	constructor() {
		super({
			id: 'agentSession.markRead',
			title: localize2('markRead', "Mark as Read"),
			menu: {
				id: MenuId.AgentSessionsContext,
				group: '1_edit',
				order: 1,
				when: ContextKeyExpr.and(
					ChatContextKeys.isReadAgentSession.negate(),
					ChatContextKeys.isArchivedAgentSession.negate() // no read state for archived sessions
				),
			}
		});
	}

	runWithSession(session: IAgentSession): void {
		session.setRead(true);
	}
}

export class ArchiveAgentSessionAction extends BaseAgentSessionAction {

	constructor() {
		super({
			id: 'agentSession.archive',
			title: localize2('archive', "Archive"),
			icon: Codicon.archive,
			keybinding: {
				primary: KeyCode.Delete,
				mac: { primary: KeyMod.CtrlCmd | KeyCode.Backspace },
				weight: KeybindingWeight.WorkbenchContrib + 1,
				when: ContextKeyExpr.and(
					ChatContextKeys.agentSessionsViewerFocused,
					ChatContextKeys.isArchivedAgentSession.negate()
				)
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

	async runWithSession(session: IAgentSession, accessor: ServicesAccessor): Promise<void> {
		const chatService = accessor.get(IChatService);
		const chatModel = chatService.getSession(session.resource);
		const dialogService = accessor.get(IDialogService);

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

export class UnarchiveAgentSessionAction extends BaseAgentSessionAction {

	constructor() {
		super({
			id: 'agentSession.unarchive',
			title: localize2('unarchive', "Unarchive"),
			icon: Codicon.unarchive,
			keybinding: {
				primary: KeyMod.Shift | KeyCode.Delete,
				mac: {
					primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Backspace,
				},
				weight: KeybindingWeight.WorkbenchContrib + 1,
				when: ContextKeyExpr.and(
					ChatContextKeys.agentSessionsViewerFocused,
					ChatContextKeys.isArchivedAgentSession
				)
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

	runWithSession(session: IAgentSession): void {
		session.setArchived(false);
	}
}

export class RenameAgentSessionAction extends BaseAgentSessionAction {

	constructor() {
		super({
			id: AGENT_SESSION_RENAME_ACTION_ID,
			title: localize2('rename', "Rename..."),
			keybinding: {
				primary: KeyCode.F2,
				mac: {
					primary: KeyCode.Enter
				},
				weight: KeybindingWeight.WorkbenchContrib + 1,
				when: ContextKeyExpr.and(
					ChatContextKeys.agentSessionsViewerFocused,
					ChatContextKeys.agentSessionType.isEqualTo(AgentSessionProviders.Local)
				),
			},
			menu: {
				id: MenuId.AgentSessionsContext,
				group: '1_edit',
				order: 3,
				when: ChatContextKeys.agentSessionType.isEqualTo(AgentSessionProviders.Local)
			}
		});
	}

	async runWithSession(session: IAgentSession, accessor: ServicesAccessor): Promise<void> {
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

	async runWithSession(session: IAgentSession, accessor: ServicesAccessor): Promise<void> {
		const chatService = accessor.get(IChatService);
		const dialogService = accessor.get(IDialogService);
		const widgetService = accessor.get(IChatWidgetService);

		const confirmed = await dialogService.confirm({
			message: localize('deleteSession.confirm', "Are you sure you want to delete this chat session?"),
			detail: localize('deleteSession.detail', "This action cannot be undone."),
			primaryButton: localize('deleteSession.delete', "Delete")
		});

		if (!confirmed.confirmed) {
			return;
		}

		// Clear chat widget
		await widgetService.getWidgetBySessionResource(session.resource)?.clear();

		// Remove from storage
		await chatService.removeHistoryEntry(session.resource);
	}
}

export class DeleteAllLocalSessionsAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.chat.clearHistory',
			title: localize2('agentSessions.deleteAll', "Delete All Local Workspace Chat Sessions"),
			precondition: ChatContextKeys.enabled,
			category: CHAT_CATEGORY,
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor, ...args: unknown[]) {
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

abstract class BaseOpenAgentSessionAction extends BaseAgentSessionAction {

	async runWithSession(session: IAgentSession, accessor: ServicesAccessor): Promise<void> {
		const chatWidgetService = accessor.get(IChatWidgetService);

		const uri = session.resource;

		await chatWidgetService.openSession(uri, this.getTargetGroup(), {
			...this.getOptions(),
			pinned: true
		});
	}

	protected abstract getTargetGroup(): PreferredGroup;

	protected abstract getOptions(): IChatEditorOptions;
}

export class OpenAgentSessionInEditorGroupAction extends BaseOpenAgentSessionAction {

	static readonly id = 'workbench.action.chat.openSessionInEditorGroup';

	constructor() {
		super({
			id: OpenAgentSessionInEditorGroupAction.id,
			title: localize2('chat.openSessionInEditorGroup.label', "Open as Editor"),
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyCode.Enter,
				mac: {
					primary: KeyMod.WinCtrl | KeyCode.Enter
				},
				weight: KeybindingWeight.WorkbenchContrib + 1,
				when: ChatContextKeys.agentSessionsViewerFocused,
			},
			menu: {
				id: MenuId.AgentSessionsContext,
				order: 1,
				group: 'navigation'
			}
		});
	}

	protected getTargetGroup(): PreferredGroup {
		return ACTIVE_GROUP;
	}

	protected getOptions(): IChatEditorOptions {
		return {};
	}
}

export class OpenAgentSessionInNewEditorGroupAction extends BaseOpenAgentSessionAction {

	static readonly id = 'workbench.action.chat.openSessionInNewEditorGroup';

	constructor() {
		super({
			id: OpenAgentSessionInNewEditorGroupAction.id,
			title: localize2('chat.openSessionInNewEditorGroup.label', "Open to the Side"),
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Enter,
				mac: {
					primary: KeyMod.WinCtrl | KeyMod.Alt | KeyCode.Enter
				},
				weight: KeybindingWeight.WorkbenchContrib + 1,
				when: ChatContextKeys.agentSessionsViewerFocused,
			},
			menu: {
				id: MenuId.AgentSessionsContext,
				order: 2,
				group: 'navigation'
			}
		});
	}

	protected getTargetGroup(): PreferredGroup {
		return SIDE_GROUP;
	}

	protected getOptions(): IChatEditorOptions {
		return {};
	}
}

export class OpenAgentSessionInNewWindowAction extends BaseOpenAgentSessionAction {

	static readonly id = 'workbench.action.chat.openSessionInNewWindow';

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

	protected getTargetGroup(): PreferredGroup {
		return AUX_WINDOW_GROUP;
	}

	protected getOptions(): IChatEditorOptions {
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
				when: ChatContextKeys.agentSessionsViewerLimited.negate()
			},
		});
	}

	override run(accessor: ServicesAccessor, agentSessionsControl: IAgentSessionsControl) {
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
				when: ChatContextKeys.agentSessionsViewerLimited.negate()
			}
		});
	}

	override run(accessor: ServicesAccessor, agentSessionsControl: IAgentSessionsControl) {
		return agentSessionsControl.openFind();
	}
}

abstract class UpdateChatViewWidthAction extends Action2 {

	async run(accessor: ServicesAccessor): Promise<void> {
		const layoutService = accessor.get(IWorkbenchLayoutService);
		const viewDescriptorService = accessor.get(IViewDescriptorService);
		const configurationService = accessor.get(IConfigurationService);
		const viewsService = accessor.get(IViewsService);

		const chatLocation = viewDescriptorService.getViewLocationById(ChatViewId);
		if (typeof chatLocation !== 'number') {
			return; // we need a view location
		}

		// Determine if we can resize the view: this is not possible
		// for when the chat view is in the panel at the top or bottom
		const panelPosition = layoutService.getPanelPosition();
		const canResizeView = chatLocation !== ViewContainerLocation.Panel || (panelPosition === Position.LEFT || panelPosition === Position.RIGHT);

		// Update configuration if needed
		const chatViewSessionsEnabled = configurationService.getValue<boolean>(ChatConfiguration.ChatViewSessionsEnabled);
		if (!chatViewSessionsEnabled) {
			await configurationService.updateValue(ChatConfiguration.ChatViewSessionsEnabled, true);
		}

		let chatView = viewsService.getActiveViewWithId<ChatViewPane>(ChatViewId);
		if (!chatView) {
			chatView = await viewsService.openView<ChatViewPane>(ChatViewId, false);
		}
		if (!chatView) {
			return; // we need the chat view
		}

		const configuredOrientation = configurationService.getValue<'stacked' | 'sideBySide' | unknown>(ChatConfiguration.ChatViewSessionsOrientation);
		let validatedConfiguredOrientation: 'stacked' | 'sideBySide';
		if (configuredOrientation === 'stacked' || configuredOrientation === 'sideBySide') {
			validatedConfiguredOrientation = configuredOrientation;
		} else {
			validatedConfiguredOrientation = 'sideBySide'; // default
		}

		const newOrientation = this.getOrientation();

		if ((!canResizeView || validatedConfiguredOrientation === 'sideBySide') && newOrientation === AgentSessionsViewerOrientation.Stacked) {
			chatView.updateConfiguredSessionsViewerOrientation('stacked');
		} else if ((!canResizeView || validatedConfiguredOrientation === 'stacked') && newOrientation === AgentSessionsViewerOrientation.SideBySide) {
			chatView.updateConfiguredSessionsViewerOrientation('sideBySide');
		}

		const part = getPartByLocation(chatLocation);
		let currentSize = layoutService.getSize(part);

		const sideBySideMinWidth = 600 + 1;	// account for possible theme border
		const stackedMaxWidth = sideBySideMinWidth - 1;

		if (
			(newOrientation === AgentSessionsViewerOrientation.SideBySide && currentSize.width >= sideBySideMinWidth) ||	// already wide enough to show side by side
			newOrientation === AgentSessionsViewerOrientation.Stacked														// always wide enough to show stacked
		) {
			return; // size suffices
		}

		if (!canResizeView) {
			return; // location does not allow for resize (panel top or bottom)
		}

		if (chatLocation === ViewContainerLocation.AuxiliaryBar) {
			layoutService.setAuxiliaryBarMaximized(false); // Leave maximized state if applicable
			currentSize = layoutService.getSize(part);
		}

		const lastWidthForOrientation = chatView?.getLastDimensions(newOrientation)?.width;

		let newWidth: number;
		if (newOrientation === AgentSessionsViewerOrientation.SideBySide) {
			newWidth = Math.max(sideBySideMinWidth, lastWidthForOrientation || Math.round(layoutService.mainContainerDimension.width / 2));
		} else {
			newWidth = Math.min(stackedMaxWidth, lastWidthForOrientation || stackedMaxWidth);
		}

		layoutService.setSize(part, {
			width: newWidth,
			height: currentSize.height
		});
	}

	abstract getOrientation(): AgentSessionsViewerOrientation;
}

export class ShowAgentSessionsSidebar extends UpdateChatViewWidthAction {

	static readonly ID = 'agentSessions.showAgentSessionsSidebar';
	static readonly TITLE = localize2('showAgentSessionsSidebar', "Show Agent Sessions Sidebar");

	constructor() {
		super({
			id: ShowAgentSessionsSidebar.ID,
			title: ShowAgentSessionsSidebar.TITLE,
			precondition: ContextKeyExpr.and(
				ChatContextKeys.enabled,
				ChatContextKeys.agentSessionsViewerOrientation.isEqualTo(AgentSessionsViewerOrientation.Stacked),
			),
			f1: true,
			category: CHAT_CATEGORY,
		});
	}

	override getOrientation(): AgentSessionsViewerOrientation {
		return AgentSessionsViewerOrientation.SideBySide;
	}
}

export class HideAgentSessionsSidebar extends UpdateChatViewWidthAction {

	static readonly ID = 'agentSessions.hideAgentSessionsSidebar';
	static readonly TITLE = localize2('hideAgentSessionsSidebar', "Hide Agent Sessions Sidebar");

	constructor() {
		super({
			id: HideAgentSessionsSidebar.ID,
			title: HideAgentSessionsSidebar.TITLE,
			precondition: ContextKeyExpr.and(
				ChatContextKeys.enabled,
				ChatContextKeys.agentSessionsViewerOrientation.isEqualTo(AgentSessionsViewerOrientation.SideBySide),
			),
			f1: true,
			category: CHAT_CATEGORY,
		});
	}

	override getOrientation(): AgentSessionsViewerOrientation {
		return AgentSessionsViewerOrientation.Stacked;
	}
}

export class ToggleAgentSessionsSidebar extends Action2 {

	static readonly ID = 'agentSessions.toggleAgentSessionsSidebar';
	static readonly TITLE = localize2('toggleAgentSessionsSidebar', "Toggle Agent Sessions Sidebar");

	constructor() {
		super({
			id: ToggleAgentSessionsSidebar.ID,
			title: ToggleAgentSessionsSidebar.TITLE,
			precondition: ChatContextKeys.enabled,
			f1: true,
			category: CHAT_CATEGORY,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const commandService = accessor.get(ICommandService);
		const viewsService = accessor.get(IViewsService);

		const chatView = viewsService.getActiveViewWithId<ChatViewPane>(ChatViewId);
		const currentOrientation = chatView?.getSessionsViewerOrientation();

		if (currentOrientation === AgentSessionsViewerOrientation.SideBySide) {
			await commandService.executeCommand(HideAgentSessionsSidebar.ID);
		} else {
			await commandService.executeCommand(ShowAgentSessionsSidebar.ID);
		}
	}
}

export class FocusAgentSessionsAction extends Action2 {

	static readonly id = 'workbench.action.chat.focusAgentSessionsViewer';

	constructor() {
		super({
			id: FocusAgentSessionsAction.id,
			title: localize2('chat.focusAgentSessionsViewer.label', "Focus Agent Sessions"),
			precondition: ContextKeyExpr.and(
				ChatContextKeys.enabled,
				ContextKeyExpr.equals(`config.${ChatConfiguration.ChatViewSessionsEnabled}`, true)
			),
			category: CHAT_CATEGORY,
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		const configurationService = accessor.get(IConfigurationService);
		const commandService = accessor.get(ICommandService);

		const chatView = await viewsService.openView<ChatViewPane>(ChatViewId, true);
		const focused = chatView?.focusSessions();
		if (focused) {
			return;
		}

		const configuredSessionsViewerOrientation = configurationService.getValue<'stacked' | 'sideBySide' | unknown>(ChatConfiguration.ChatViewSessionsOrientation);
		if (configuredSessionsViewerOrientation === 'stacked') {
			await commandService.executeCommand(ACTION_ID_NEW_CHAT);
		} else {
			await commandService.executeCommand(ShowAgentSessionsSidebar.ID);
		}

		chatView?.focusSessions();
	}
}

//#endregion
