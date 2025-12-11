/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../../nls.js';
import { IAgentSession } from './agentSessionsModel.js';
import { Action2, MenuId } from '../../../../../platform/actions/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { AgentSessionsViewerOrientation, IAgentSessionsControl, IMarshalledChatSessionContext, isMarshalledChatSessionContext } from './agentSessions.js';
import { IChatService } from '../../common/chatService.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { IChatEditorOptions } from '../chatEditor.js';
import { ChatViewId, IChatWidgetService } from '../chat.js';
import { ACTIVE_GROUP, AUX_WINDOW_GROUP, PreferredGroup, SIDE_GROUP } from '../../../../services/editor/common/editorService.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../../common/views.js';
import { getPartByLocation } from '../../../../services/views/browser/viewsService.js';
import { IWorkbenchLayoutService, Position } from '../../../../services/layout/browser/layoutService.js';
import { IAgentSessionsService } from './agentSessionsService.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { showClearEditingSessionConfirmation } from '../chatEditorInput.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ChatConfiguration } from '../../common/constants.js';
import { ACTION_ID_NEW_CHAT, ACTION_ID_PICK_AGENT_SESSION, CHAT_CATEGORY } from '../actions/chatActions.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { ChatViewPane } from '../chatViewPane.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ViewAction } from '../../../../browser/parts/views/viewPane.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { AgentSessionsPicker } from './agentSessionsPicker.js';

export class FocusAgentSessionsAction extends Action2 {

	static readonly id = 'workbench.action.chat.focusAgentSessionsViewer';

	constructor() {
		super({
			id: FocusAgentSessionsAction.id,
			title: {
				value: localize('chat.focusAgentSessionsViewer.label', "Focus Agent Sessions"),
				original: 'Focus Agent Sessions'
			},
			precondition: ChatContextKeys.enabled,
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

		const configuredSessionsViewerOrientation = configurationService.getValue<'auto' | 'stacked' | 'sideBySide' | unknown>(ChatConfiguration.ChatViewSessionsOrientation);
		if (configuredSessionsViewerOrientation === 'auto' || configuredSessionsViewerOrientation === 'stacked') {
			await commandService.executeCommand(ACTION_ID_NEW_CHAT);
		} else {
			await commandService.executeCommand(ShowAgentSessionsSidebar.ID);
		}

		chatView?.focusSessions();
	}
}

abstract class BaseAgentSessionAction extends Action2 {

	run(accessor: ServicesAccessor, context: IAgentSession | IMarshalledChatSessionContext): void {
		const agentSessionsService = accessor.get(IAgentSessionsService);

		let session: IAgentSession | undefined;
		if (isMarshalledChatSessionContext(context)) {
			session = agentSessionsService.getSession(context.session.resource);
		} else {
			session = context;
		}

		if (session) {
			this.runWithSession(session, accessor);
		}
	}

	abstract runWithSession(session: IAgentSession, accessor: ServicesAccessor): void;
}

//#region Session Title Actions

export class ArchiveAgentSessionAction extends BaseAgentSessionAction {

	constructor() {
		super({
			id: 'agentSession.archive',
			title: localize2('archive', "Archive"),
			icon: Codicon.archive,
			menu: [{
				id: MenuId.AgentSessionItemToolbar,
				group: 'navigation',
				order: 1,
				when: ChatContextKeys.isArchivedAgentSession.negate(),
			}, {
				id: MenuId.AgentSessionsContext,
				group: 'edit',
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
			menu: [{
				id: MenuId.AgentSessionItemToolbar,
				group: 'navigation',
				order: 1,
				when: ChatContextKeys.isArchivedAgentSession,
			}, {
				id: MenuId.AgentSessionsContext,
				group: 'edit',
				order: 2,
				when: ChatContextKeys.isArchivedAgentSession,
			}]
		});
	}

	runWithSession(session: IAgentSession): void {
		session.setArchived(false);
	}
}

//#endregion

//#region Session Context Actions

abstract class BaseOpenAgentSessionAction extends Action2 {

	async run(accessor: ServicesAccessor, context?: IMarshalledChatSessionContext): Promise<void> {
		if (!context) {
			return;
		}

		const chatWidgetService = accessor.get(IChatWidgetService);
		const uri = context.session.resource;

		await chatWidgetService.openSession(uri, this.getTargetGroup(), {
			...this.getOptions(),
			ignoreInView: true,
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
			title: localize('chat.openSessionInEditorGroup.label', "Open as Editor"),
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
			title: localize('chat.openSessionInNewEditorGroup.label', "Open to the Side"),
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
			title: localize('chat.openSessionInNewWindow.label', "Open in New Window"),
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

export class MarkAgentSessionUnreadAction extends BaseAgentSessionAction {

	constructor() {
		super({
			id: 'agentSession.markUnread',
			title: localize2('markUnread', "Mark as Unread"),
			menu: {
				id: MenuId.AgentSessionsContext,
				group: 'edit',
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
				group: 'edit',
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

//#endregion

//#region View Actions

export class PickAgentSessionAction extends ViewAction<ChatViewPane> {
	constructor() {
		super({
			id: ACTION_ID_PICK_AGENT_SESSION,
			title: localize2('chat.pickAgentSession', "Pick Agent Session"),
			viewId: ChatViewId,
			f1: false,
			menu: [{
				id: MenuId.ChatViewSessionTitleToolbar,
				group: 'navigation',
				order: 2
			}]
		});
	}

	override async runInView(accessor: ServicesAccessor, view: ChatViewPane) {
		const instantiationService = accessor.get(IInstantiationService);
		const agentSessionsPicker = instantiationService.createInstance(AgentSessionsPicker, view.titleControlAgentPickerElement);
		await agentSessionsPicker.pickAgentSession();
	}
}

//#endregion

//#region Sessions Control Toolbar

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

		const orientation = this.getOrientation();

		const chatLocation = viewDescriptorService.getViewLocationById(ChatViewId);
		if (typeof chatLocation !== 'number') {
			return; // we need a view location
		}

		// Determine if we can resize the view: this is not possible
		// for when the chat view is in the panel at the top or bottom
		const panelPosition = layoutService.getPanelPosition();
		const canResizeView = chatLocation !== ViewContainerLocation.Panel || (panelPosition === Position.LEFT || panelPosition === Position.RIGHT);

		// Update configuration if needed
		const configuredSessionsViewerOrientation = configurationService.getValue<'auto' | 'stacked' | 'sideBySide' | unknown>(ChatConfiguration.ChatViewSessionsOrientation);
		if ((!canResizeView || configuredSessionsViewerOrientation === 'sideBySide') && orientation === AgentSessionsViewerOrientation.Stacked) {
			await configurationService.updateValue(ChatConfiguration.ChatViewSessionsOrientation, 'stacked');
		} else if ((!canResizeView || configuredSessionsViewerOrientation === 'stacked') && orientation === AgentSessionsViewerOrientation.SideBySide) {
			await configurationService.updateValue(ChatConfiguration.ChatViewSessionsOrientation, 'sideBySide');
		}

		const part = getPartByLocation(chatLocation);
		let currentSize = layoutService.getSize(part);

		const sideBySideMinWidth = 600 + 1;	// account for possible theme border
		const stackedMaxWidth = 300 + 1;	// account for possible theme border

		if (configuredSessionsViewerOrientation !== 'auto') {
			if (
				(orientation === AgentSessionsViewerOrientation.SideBySide && currentSize.width >= sideBySideMinWidth) ||	// already wide enough to show side by side
				orientation === AgentSessionsViewerOrientation.Stacked														// always wide enough to show stacked
			) {
				return; // if the orientation is not set to `auto`, we try to avoid resizing if not needed
			}
		}

		if (!canResizeView) {
			return; // location does not allow for resize (panel top or bottom)
		}

		if (chatLocation === ViewContainerLocation.AuxiliaryBar) {
			layoutService.setAuxiliaryBarMaximized(false); // Leave maximized state if applicable
			currentSize = layoutService.getSize(part);
		}

		let newWidth: number;
		if (orientation === AgentSessionsViewerOrientation.SideBySide) {
			newWidth = Math.max(sideBySideMinWidth, Math.round(layoutService.mainContainerDimension.width / 2));
		} else {
			newWidth = stackedMaxWidth;
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
			icon: Codicon.layoutSidebarRightOff,
		});
	}

	override getOrientation(): AgentSessionsViewerOrientation {
		return AgentSessionsViewerOrientation.Stacked;
	}
}

//#endregion
