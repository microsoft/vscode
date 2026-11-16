/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './experiments/agentSessionsExperiments.contribution.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { localize2 } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { registerSingleton, InstantiationType } from '../../../../../platform/instantiation/common/extensions.js';
import { IAgentSessionsService, AgentSessionsService } from './agentSessionsService.js';
import { LocalAgentsSessionsController } from './localAgentSessionsController.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { ISubmenuItem, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { OpenAgentSessionInEditorGroupAction, OpenAgentSessionInNewEditorGroupAction, OpenAgentSessionInNewWindowAction, OpenAgentSessionCustomizationsAction, ShowAgentSessionsSidebar, HideAgentSessionsSidebar, ToggleAgentSessionsSidebar, registerAgentSessionsSidebarToggleMenus, RefreshAgentSessionsViewerAction, FindAgentSessionInViewerAction, MarkAgentSessionUnreadAction, MarkAgentSessionReadAction, FocusAgentSessionsAction, SetAgentSessionsOrientationStackedAction, SetAgentSessionsOrientationSideBySideAction, MarkAllAgentSessionsReadAction, RenameAgentSessionAction, DeleteAgentSessionAction, DeleteAllLocalSessionsAction, MarkAgentSessionSectionReadAction, ToggleShowAgentSessionsAction, PinAgentSessionAction, UnpinAgentSessionAction, CollapseAllAgentSessionSectionsAction, getAgentSessionArchiveActionConstructors } from './agentSessionsActions.js';
import { AgentHostPermissionUiContribution } from './agentHost/agentHostPermissionUiContribution.js';
import { registerExternalSessionsFilterMenu } from './externalSessionsFilterMenu.js';
import './agentHost/agentHostChatInputPicker.contribution.js';
import './agentHost/agentHostModeSynchronizer.js';
import { ChatSessionArchiveActionWordingSettingId, getChatSessionArchiveActionWording } from '../../../../../platform/chat/common/sessionArchiveActions.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';

//#region Actions and Menus

registerAction2(FocusAgentSessionsAction);
registerAction2(MarkAllAgentSessionsReadAction);
registerAction2(MarkAgentSessionSectionReadAction);
registerAction2(CollapseAllAgentSessionSectionsAction);
registerAction2(PinAgentSessionAction);
registerAction2(UnpinAgentSessionAction);
registerAction2(RenameAgentSessionAction);
registerAction2(DeleteAgentSessionAction);
registerAction2(DeleteAllLocalSessionsAction);
registerAction2(OpenAgentSessionInNewWindowAction);
registerAction2(OpenAgentSessionInEditorGroupAction);
registerAction2(OpenAgentSessionInNewEditorGroupAction);
registerAction2(OpenAgentSessionCustomizationsAction);
registerAction2(RefreshAgentSessionsViewerAction);
registerAction2(FindAgentSessionInViewerAction);
registerExternalSessionsFilterMenu(MenuId.AgentSessionsViewerFilterSubMenu, MenuId.AgentSessionsExternalFilterSubMenu, '2_external');
registerAction2(ShowAgentSessionsSidebar);
registerAction2(HideAgentSessionsSidebar);

class AgentSessionReadActionsContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.agentSessionReadActions';

	constructor(
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
	) {
		super();
		if (!environmentService.isSessionsWindow) {
			this._register(registerAction2(MarkAgentSessionUnreadAction));
			this._register(registerAction2(MarkAgentSessionReadAction));
		}
	}
}

registerWorkbenchContribution2(AgentSessionReadActionsContribution.ID, AgentSessionReadActionsContribution, WorkbenchPhase.BlockStartup);

class AgentSessionArchiveActionsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentSessionArchiveActions';

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
		for (const action of getAgentSessionArchiveActionConstructors(wording)) {
			this.actionRegistrations.add(registerAction2(action));
		}
	}
}

registerWorkbenchContribution2(AgentSessionArchiveActionsContribution.ID, AgentSessionArchiveActionsContribution, WorkbenchPhase.BlockStartup);
registerAction2(ToggleAgentSessionsSidebar);
registerAction2(ToggleShowAgentSessionsAction);
registerAction2(SetAgentSessionsOrientationStackedAction);
registerAction2(SetAgentSessionsOrientationSideBySideAction);

// --- Agent Sessions Toolbar

MenuRegistry.appendMenuItem(MenuId.AgentSessionsToolbar, {
	submenu: MenuId.AgentSessionsViewerFilterSubMenu,
	title: localize2('filterAgentSessions', "Filter Agent Sessions"),
	group: 'navigation',
	order: 3,
	icon: Codicon.filter,
} satisfies ISubmenuItem);

registerAgentSessionsSidebarToggleMenus();

//#endregion

//#region Workbench Contributions

registerWorkbenchContribution2(LocalAgentsSessionsController.ID, LocalAgentsSessionsController, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(AgentHostPermissionUiContribution.ID, AgentHostPermissionUiContribution, WorkbenchPhase.BlockRestore);

registerSingleton(IAgentSessionsService, AgentSessionsService, InstantiationType.Delayed);

//#endregion
