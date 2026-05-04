/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../nls.js';
import { Action2, MenuId, MenuRegistry } from '../../../platform/actions/common/actions.js';
import { Codicon } from '../../../base/common/codicons.js';
import { ContextKeyExpr } from '../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../platform/instantiation/common/instantiation.js';
import { ChatContextKeys } from '../../contrib/chat/common/actions/chatContextKeys.js';
import { ViewContainerLocation } from '../../common/views.js';
import { AgentSessionsViewerOrientation } from '../../contrib/chat/browser/agentSessions/agentSessions.js';
import { HideAgentSessionsSidebar } from '../../contrib/chat/browser/agentSessions/agentSessionsActions.js';
import { IWorkbenchLayoutService, Parts } from '../../services/layout/browser/layoutService.js';
import { IViewDescriptorService } from '../../common/views.js';
import { ChatViewId } from '../../contrib/chat/browser/chat.js';
import { registerIcon } from '../../../platform/theme/common/iconRegistry.js';

// Icons
const panelMaximizeActionIcon = registerIcon('agent-sessions-panel-maximize', Codicon.chevronUp, localize('agentSessionsPanelMaximizeIcon', 'Icon for maximizing agent sessions panel.'));
const panelRestoreActionIcon = registerIcon('agent-sessions-panel-restore', Codicon.chevronDown, localize('agentSessionsPanelRestoreIcon', 'Icon for restoring agent sessions panel.'));

// Panel Title Actions

// Hide Agent Sessions Sidebar
MenuRegistry.appendMenuItem(MenuId.PanelTitle, {
	command: {
		id: HideAgentSessionsSidebar.ID,
		title: localize('agentSessions.hideSidebar', 'Hide Agent Sessions Sidebar'),
		icon: Codicon.close
	},
	group: 'navigation',
	order: 3,
	when: ContextKeyExpr.and(
		ChatContextKeys.panelLocation.isEqualTo(ViewContainerLocation.Panel),
		ChatContextKeys.agentSessionsViewerOrientation.isEqualTo(AgentSessionsViewerOrientation.SideBySide)
	)
});

// Maximize Panel action for Agent Sessions
export class MaximizeAgentSessionsPanelAction extends Action2 {

	static readonly ActionId = 'agentSessions.maximizePanel';

	constructor() {
		super({
			id: MaximizeAgentSessionsPanelAction.ActionId,
			title: localize2('agentSessions.maximizePanel', 'Maximize Agent Sessions Panel'),
			icon: panelMaximizeActionIcon,
			precondition: ContextKeyExpr.and(
				ChatContextKeys.enabled,
				ChatContextKeys.panelLocation.isEqualTo(ViewContainerLocation.Panel)
			),
			f1: true
		});
	}

	async run(serviceAccessor: ServicesAccessor): Promise<void> {
		const workbenchLayoutService = serviceAccessor.get(IWorkbenchLayoutService);
		const viewDescService = serviceAccessor.get(IViewDescriptorService);

		// Verify chat view is in panel
		const chatViewLocation = viewDescService.getViewLocationById(ChatViewId);
		if (chatViewLocation !== ViewContainerLocation.Panel) {
			return;
		}

		// Show panel if hidden
		const isPanelVisible = workbenchLayoutService.isVisible(Parts.PANEL_PART);
		if (!isPanelVisible) {
			workbenchLayoutService.setPartHidden(false, Parts.PANEL_PART);
		}

		// Maximize the panel
		const isCurrentlyMaximized = workbenchLayoutService.isPanelMaximized();
		if (!isCurrentlyMaximized) {
			workbenchLayoutService.toggleMaximizedPanel();
		}
	}
}

// Restore Panel action for Agent Sessions
export class RestoreAgentSessionsPanelAction extends Action2 {

	static readonly ActionId = 'agentSessions.restorePanel';

	constructor() {
		super({
			id: RestoreAgentSessionsPanelAction.ActionId,
			title: localize2('agentSessions.restorePanel', 'Restore Agent Sessions Panel Size'),
			icon: panelRestoreActionIcon,
			precondition: ContextKeyExpr.and(
				ChatContextKeys.enabled,
				ChatContextKeys.panelLocation.isEqualTo(ViewContainerLocation.Panel)
			),
			f1: true
		});
	}

	async run(serviceAccessor: ServicesAccessor): Promise<void> {
		const workbenchLayoutService = serviceAccessor.get(IWorkbenchLayoutService);
		const viewDescService = serviceAccessor.get(IViewDescriptorService);

		// Verify chat view is in panel
		const chatViewLocation = viewDescService.getViewLocationById(ChatViewId);
		if (chatViewLocation !== ViewContainerLocation.Panel) {
			return;
		}

		// Restore the panel if maximized
		const isCurrentlyMaximized = workbenchLayoutService.isPanelMaximized();
		if (isCurrentlyMaximized) {
			workbenchLayoutService.toggleMaximizedPanel();
		}
	}
}

// Register menu items for maximize/restore

MenuRegistry.appendMenuItem(MenuId.PanelTitle, {
	command: {
		id: MaximizeAgentSessionsPanelAction.ActionId,
		title: localize('agentSessions.maximizePanelTitle', 'Maximize Panel Size'),
		icon: panelMaximizeActionIcon
	},
	group: 'navigation',
	order: 1,
	when: ContextKeyExpr.and(
		ChatContextKeys.panelLocation.isEqualTo(ViewContainerLocation.Panel),
		ContextKeyExpr.has('panelMaximized').negate()
	)
});

MenuRegistry.appendMenuItem(MenuId.PanelTitle, {
	command: {
		id: RestoreAgentSessionsPanelAction.ActionId,
		title: localize('agentSessions.restorePanelTitle', 'Restore Panel Size'),
		icon: panelRestoreActionIcon
	},
	group: 'navigation',
	order: 1,
	when: ContextKeyExpr.and(
		ChatContextKeys.panelLocation.isEqualTo(ViewContainerLocation.Panel),
		ContextKeyExpr.has('panelMaximized')
	)
});
