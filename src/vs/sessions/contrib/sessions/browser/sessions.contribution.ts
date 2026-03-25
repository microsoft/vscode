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
import { SessionsTitleBarContribution } from './sessionsTitleBarWidget.js';
import { AgenticSessionsViewPane, SessionsViewId } from './sessionsViewPane.js';
import { SessionsManagementService, ISessionsManagementService, IsNewChatSessionContext } from './sessionsManagementService.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { AgentSessionSection, IAgentSessionSection, isAgentSessionSection } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsModel.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IAgentSessionsService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { IsAuxiliaryWindowContext } from '../../../../workbench/common/contextkeys.js';
import { SessionsWelcomeVisibleContext } from '../../../common/contextkeys.js';
import { NewChatViewPane, SessionsViewId as NewChatViewId } from '../../chat/browser/newChatViewPane.js';
import { Menus } from '../../../browser/menus.js';

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

const agentSessionsViewDescriptor: IViewDescriptor = {
	id: SessionsViewId,
	containerIcon: agentSessionsViewIcon,
	containerTitle: AGENT_SESSIONS_VIEW_TITLE.value,
	singleViewPaneContainerTitle: AGENT_SESSIONS_VIEW_TITLE.value,
	name: AGENT_SESSIONS_VIEW_TITLE,
	canToggleVisibility: false,
	canMoveView: false,
	ctorDescriptor: new SyncDescriptor(AgenticSessionsViewPane),
	windowVisibility: WindowVisibility.Sessions
};

Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry).registerViews([agentSessionsViewDescriptor], agentSessionsViewContainer);

registerWorkbenchContribution2(SessionsTitleBarContribution.ID, SessionsTitleBarContribution, WorkbenchPhase.AfterRestored);

registerSingleton(ISessionsManagementService, SessionsManagementService, InstantiationType.Delayed);

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
		const agentSessionsService = accessor.get(IAgentSessionsService);

		const activeSession = sessionsManagementService.getActiveSession();
		if (!activeSession || activeSession.isUntitled) {
			return;
		}

		const agentSession = agentSessionsService.getSession(activeSession.resource);
		if (!agentSession || agentSession.isArchived()) {
			return;
		}

		agentSession.setArchived(true);
	}
});

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

		const repositoryUri = sessionsManagementService.getSessionRepositoryUri(context.sessions[0]);
		sessionsManagementService.openNewSessionView();

		const view = await viewsService.openView(NewChatViewId, true);
		if (view instanceof NewChatViewPane && repositoryUri) {
			view.setProject(repositoryUri);
		}
	}
});
