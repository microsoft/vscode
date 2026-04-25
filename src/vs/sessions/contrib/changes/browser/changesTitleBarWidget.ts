/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/changesTitleBarWidget.css';

import { mainWindow } from '../../../../base/browser/window.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { IsAuxiliaryWindowContext, AuxiliaryBarVisibleContext } from '../../../../workbench/common/contextkeys.js';
import { IWorkbenchLayoutService, Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { IPaneCompositePartService } from '../../../../workbench/services/panecomposite/browser/panecomposite.js';
import { IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { ViewContainerLocation } from '../../../../workbench/common/views.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { Menus } from '../../../browser/menus.js';
import { SessionsWelcomeVisibleContext } from '../../../common/contextkeys.js';
import { logChangesViewToggle } from '../../../common/sessionsTelemetry.js';
import { CHANGES_VIEW_CONTAINER_ID } from '../common/changes.js';

const TOGGLE_CHANGES_VIEW_ID = 'workbench.action.agentSessions.toggleChangesView';
const TOGGLE_SECONDARY_SIDEBAR_TOOLTIP = localize('toggleSecondarySidebarTooltip', "Toggle Secondary Side Bar Visibility");

const secondarySidebarToggleClosedIcon = registerIcon('agent-secondary-sidebar-toggle-closed', Codicon.layoutSidebarRightOff, localize('agentSecondarySidebarToggleClosedIcon', "Icon for the sessions secondary sidebar when closed."));
const secondarySidebarToggleOpenIcon = registerIcon('agent-secondary-sidebar-toggle-open', Codicon.layoutSidebarRight, localize('agentSecondarySidebarToggleOpenIcon', "Icon for the sessions secondary sidebar when open."));

/**
 * Registers the Changes view toggle action in the titlebar session toolbar.
 */
export class ChangesTitleBarContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.changesTitleBar';

	constructor() {
		super();

		// Register the toggle action in the session toolbar
		this._register(MenuRegistry.appendMenuItem(Menus.TitleBarSessionMenu, {
			command: {
				id: TOGGLE_CHANGES_VIEW_ID,
				title: localize2('showChanges', "Show Changes"),
				tooltip: TOGGLE_SECONDARY_SIDEBAR_TOOLTIP,
				icon: secondarySidebarToggleClosedIcon,
				toggled: {
					condition: AuxiliaryBarVisibleContext,
					icon: secondarySidebarToggleOpenIcon,
					title: localize('hideChanges', "Hide Changes"),
					tooltip: TOGGLE_SECONDARY_SIDEBAR_TOOLTIP,
				},
			},
			group: 'navigation',
			order: 11, // After Open in VS Code (7), Run Script (8), and Open Terminal (10)
			when: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated()),
		}));
	}
}

// Register the toggle action
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: TOGGLE_CHANGES_VIEW_ID,
			title: localize2('showChanges', "Show Changes"),
			tooltip: TOGGLE_SECONDARY_SIDEBAR_TOOLTIP,
			icon: secondarySidebarToggleClosedIcon,
			toggled: {
				condition: AuxiliaryBarVisibleContext,
				icon: secondarySidebarToggleOpenIcon,
				title: localize('hideChanges', "Hide Changes"),
				tooltip: TOGGLE_SECONDARY_SIDEBAR_TOOLTIP,
			},
			precondition: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated()),
		});
	}

	run(accessor: ServicesAccessor): void {
		const layoutService = accessor.get(IWorkbenchLayoutService);
		const paneCompositeService = accessor.get(IPaneCompositePartService);
		const editorGroupService = accessor.get(IEditorGroupsService);
		const telemetryService = accessor.get(ITelemetryService);

		const isVisible = !layoutService.isVisible(Parts.AUXILIARYBAR_PART);

		if (isVisible) {
			// Editor part
			const hasEditors = editorGroupService.groups.some(group => !group.isEmpty);
			if (hasEditors && !layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
				layoutService.setPartHidden(false, Parts.EDITOR_PART);
			}

			// Auxiliary bar part
			layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
			paneCompositeService.openPaneComposite(CHANGES_VIEW_CONTAINER_ID, ViewContainerLocation.AuxiliaryBar);
		} else {
			layoutService.setPartHidden(true, Parts.EDITOR_PART);
			layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
		}

		logChangesViewToggle(telemetryService, isVisible);
	}
});
