/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IViewDescriptor, IViewsRegistry, Extensions as ViewContainerExtensions, WindowVisibility, ViewContainer, IViewContainersRegistry, ViewContainerLocation } from '../../../../workbench/common/views.js';
import { localize, localize2 } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { ViewPaneContainer } from '../../../../workbench/browser/parts/views/viewPaneContainer.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { SessionsManagementService, ISessionsManagementService } from './sessionsManagementService.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { AgentSessionSection, IAgentSessionSection, isAgentSessionSection } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsModel.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { SessionsViewId as NewChatViewId } from '../../chat/browser/newChatViewPane.js';
import { SessionsViewPane, SessionsViewPaneId } from './views/sessionsViewPane.js';
import { SessionsTitleBarContribution } from './sessionsTitleBarWidget.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { SessionItemToolbarMenuId, SessionItemContextMenuId } from './sessionsListControl.js';
import { ISessionData } from '../common/sessionData.js';

const agentSessionsViewIcon = registerIcon('chat-sessions-icon', Codicon.commentDiscussionSparkle, localize('agentSessionsViewIcon', 'Icon for Agent Sessions View'));
const AGENT_SESSIONS_VIEW_TITLE = localize2('agentSessions.view.label', "Sessions");
const SessionsContainerId = 'agentic.workbench.view.sessionsContainer';

const agentSessionsViewContainer: ViewContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
	id: SessionsContainerId,
	title: AGENT_SESSIONS_VIEW_TITLE,
	icon: agentSessionsViewIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [SessionsContainerId, { mergeViewWithContainerWhenSingleView: true, }]),
	storageId: SessionsContainerId,
	hideIfEmpty: true,
	order: 6,
	windowVisibility: WindowVisibility.Sessions
}, ViewContainerLocation.Sidebar, { isDefault: true });

// Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry).registerViews([{
// 	id: SessionsViewId,
// 	containerIcon: agentSessionsViewIcon,
// 	containerTitle: AGENT_SESSIONS_VIEW_TITLE.value,
// 	singleViewPaneContainerTitle: AGENT_SESSIONS_VIEW_TITLE.value,
// 	name: AGENT_SESSIONS_VIEW_TITLE,
// 	canToggleVisibility: false,
// 	canMoveView: false,
// 	ctorDescriptor: new SyncDescriptor(AgenticSessionsViewPane),
// 	windowVisibility: WindowVisibility.Sessions
// }], agentSessionsViewContainer);

// -- New Sessions View Pane (sessions-data-model based) --

const sessionsViewPaneDescriptor: IViewDescriptor = {
	id: SessionsViewPaneId,
	containerIcon: agentSessionsViewIcon,
	containerTitle: AGENT_SESSIONS_VIEW_TITLE.value,
	singleViewPaneContainerTitle: AGENT_SESSIONS_VIEW_TITLE.value,
	name: AGENT_SESSIONS_VIEW_TITLE,
	canToggleVisibility: true,
	canMoveView: false,
	ctorDescriptor: new SyncDescriptor(SessionsViewPane),
	windowVisibility: WindowVisibility.Sessions
};

Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry).registerViews([sessionsViewPaneDescriptor], agentSessionsViewContainer);

registerSingleton(ISessionsManagementService, SessionsManagementService, InstantiationType.Delayed);

registerWorkbenchContribution2(SessionsTitleBarContribution.ID, SessionsTitleBarContribution, WorkbenchPhase.AfterRestored);

// -- Other Actions --

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

// -- Session Item Actions --

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
			}, {
				id: SessionItemContextMenuId,
				group: '1_edit',
				order: 2,
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

registerAction2(class DeleteSessionAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsViewPane.deleteSession',
			title: localize2('deleteSession', "Delete"),
			icon: Codicon.trash,
			menu: [{
				id: SessionItemContextMenuId,
				group: '2_delete',
				order: 0,
			}]
		});
	}
	async run(accessor: ServicesAccessor, context?: ISessionData): Promise<void> {
		if (!context) {
			return;
		}
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		await sessionsManagementService.deleteSession(context);
	}
});
