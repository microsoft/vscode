/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { alert } from '../../base/browser/ui/aria/aria.js';
import { Codicon } from '../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../base/common/keyCodes.js';
import { localize, localize2 } from '../../nls.js';
import { Categories } from '../../platform/action/common/actionCommonCategories.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../platform/contextkey/common/contextkey.js';
import { Menus } from './menus.js';
import { ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../platform/keybinding/common/keybindingsRegistry.js';
import { registerIcon } from '../../platform/theme/common/iconRegistry.js';
import { AuxiliaryBarVisibleContext, IsAuxiliaryWindowContext, IsSessionsWindowContext, IsTopRightEditorGroupContext, IsWindowAlwaysOnTopContext, MainEditorAreaVisibleContext, SideBarVisibleContext } from '../../workbench/common/contextkeys.js';
import { IWorkbenchLayoutService, Parts } from '../../workbench/services/layout/browser/layoutService.js';
import { IEditorGroupsService } from '../../workbench/services/editor/common/editorGroupsService.js';
import { SessionsWelcomeVisibleContext } from '../common/contextkeys.js';
import { logSidePanelToggle } from '../common/sessionsTelemetry.js';
import { ITelemetryService } from '../../platform/telemetry/common/telemetry.js';
import { mainWindow } from '../../base/browser/window.js';

// Register Icons
const panelCloseIcon = registerIcon('agent-panel-close', Codicon.close, localize('agentPanelCloseIcon', "Icon to close the panel."));
const sidebarToggleClosedIcon = registerIcon('agent-sidebar-toggle-closed', Codicon.layoutSidebarLeftOff, localize('agentSidebarToggleClosedIcon', "Icon for the sessions sidebar when closed."));
const sidebarToggleOpenIcon = registerIcon('agent-sidebar-toggle-open', Codicon.layoutSidebarLeft, localize('agentSidebarToggleOpenIcon', "Icon for the sessions sidebar when open."));
const secondarySidebarToggleClosedIcon = registerIcon('agent-secondary-sidebar-toggle-closed', Codicon.layoutSidebarRightOff, localize('agentSecondarySidebarToggleClosedIcon', "Icon for the sessions secondary sidebar when closed."));
const secondarySidebarToggleOpenIcon = registerIcon('agent-secondary-sidebar-toggle-open', Codicon.layoutSidebarRight, localize('agentSecondarySidebarToggleOpenIcon', "Icon for the sessions secondary sidebar when open."));

class ToggleSidebarVisibilityAction extends Action2 {

	static readonly ID = 'workbench.action.agentToggleSidebarVisibility';

	constructor() {
		super({
			id: ToggleSidebarVisibilityAction.ID,
			title: localize2('toggleSidebar', 'Toggle Side Bar'),
			icon: sidebarToggleClosedIcon,
			toggled: {
				condition: SideBarVisibleContext,
				icon: sidebarToggleOpenIcon,
			},
			metadata: {
				description: localize('openAndCloseSidebar', 'Open/Show and Close/Hide Sidebar'),
			},
			category: Categories.View,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.SessionsContrib,
				primary: KeyMod.CtrlCmd | KeyCode.KeyB
			},
			menu: [
				{
					id: Menus.TitleBarLeftLayout,
					group: 'navigation',
					order: 0,
					when: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated())
				}
			]
		});
	}

	run(accessor: ServicesAccessor): void {
		const layoutService = accessor.get(IWorkbenchLayoutService);
		const isCurrentlyVisible = layoutService.isVisible(Parts.SIDEBAR_PART);

		layoutService.setPartHidden(isCurrentlyVisible, Parts.SIDEBAR_PART);

		// Announce visibility change to screen readers
		const alertMessage = isCurrentlyVisible
			? localize('sidebarHidden', "Primary Side Bar hidden")
			: localize('sidebarVisible', "Primary Side Bar shown");
		alert(alertMessage);
	}
}

class ToggleSidePanelAction extends Action2 {

	static readonly ID = 'workbench.action.agentToggleSidePanel';

	// Remembers which parts were visible when the side panel was last hidden, so
	// re-opening restores the same parts instead of always showing both.
	private _lastVisibleParts: { readonly editor: boolean; readonly auxiliaryBar: boolean } | undefined;

	constructor() {
		super({
			id: ToggleSidePanelAction.ID,
			title: localize2('toggleSecondarySidebar', 'Toggle Side Panel'),
			icon: secondarySidebarToggleClosedIcon,
			toggled: {
				condition: ContextKeyExpr.or(AuxiliaryBarVisibleContext, MainEditorAreaVisibleContext)!,
				icon: secondarySidebarToggleOpenIcon,
			},
			metadata: {
				description: localize('openAndCloseSidePanel', 'Open/Show and Close/Hide the Side Panel (editor area and auxiliary bar)'),
			},
			category: Categories.View,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.SessionsContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyB
			},
			menu: [
				{
					id: Menus.TitleBarSessionMenu,
					group: 'navigation',
					order: 11, // After Open in VS Code (7), Run Script (8), and Open Terminal (10)
					when: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated())
				}
			]
		});
	}

	run(accessor: ServicesAccessor): void {
		const layoutService = accessor.get(IWorkbenchLayoutService);
		const editorGroupService = accessor.get(IEditorGroupsService);
		const telemetryService = accessor.get(ITelemetryService);

		// The "side panel" is the editor area together with the auxiliary bar.
		// Treat it as visible when *either* part is visible so the toggle always
		// closes both, instead of just revealing the auxiliary bar on top of an
		// already-visible editor area.
		const editorVisible = layoutService.isVisible(Parts.EDITOR_PART, mainWindow);
		const auxiliaryBarVisible = layoutService.isVisible(Parts.AUXILIARYBAR_PART);
		const isCurrentlyVisible = editorVisible || auxiliaryBarVisible;

		// When hiding and unhiding editor part and auxiliary bar, hiding must be done
		// in the opposite order than showing for sizing to restore correct dimensions.
		if (isCurrentlyVisible) {
			// Remember what was visible so re-opening restores exactly these parts.
			this._lastVisibleParts = { editor: editorVisible, auxiliaryBar: auxiliaryBarVisible };
			layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
			layoutService.setPartHidden(true, Parts.EDITOR_PART);
		} else {
			// Restore only the parts that were visible before hiding (default to
			// both when there is no remembered state, e.g. after a reload).
			const restore = this._lastVisibleParts ?? { editor: true, auxiliaryBar: true };
			const hasEditors = editorGroupService.groups.some(group => !group.isEmpty);
			if (restore.editor && hasEditors) {
				layoutService.setPartHidden(false, Parts.EDITOR_PART);
			}
			if (restore.auxiliaryBar) {
				layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
			}
			// Ensure the toggle always has a visible effect (e.g. the remembered
			// state was editor-only but there are no editors to show now).
			if (!layoutService.isVisible(Parts.EDITOR_PART, mainWindow) && !layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
				layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
			}
		}

		logSidePanelToggle(telemetryService, !isCurrentlyVisible);

		// Announce visibility change to screen readers
		const alertMessage = isCurrentlyVisible
			? localize('sidePanelHidden', "Side Panel hidden")
			: localize('sidePanelVisible', "Side Panel shown");
		alert(alertMessage);
	}
}

registerAction2(ToggleSidebarVisibilityAction);
registerAction2(ToggleSidePanelAction);

// The editor-title secondary side bar toggle reuses the core `workbench.action.toggleAuxiliaryBar`
// command (registered by the workbench auxiliary bar part, which is also loaded in the agents
// window). Two mutually-exclusive menu items give the state-dependent icon without the
// checked/highlighted background that a single `toggled` menu item would render.
const editorTitleAuxiliaryBarWhen = ContextKeyExpr.and(
	IsSessionsWindowContext,
	IsAuxiliaryWindowContext.toNegated(),
	IsTopRightEditorGroupContext);

MenuRegistry.appendMenuItem(MenuId.EditorTitleLayout, {
	command: {
		id: 'workbench.action.toggleAuxiliaryBar',
		title: localize('hideSecondarySideBar', "Hide Secondary Side Bar"),
		icon: Codicon.rightPanelHide
	},
	group: 'navigation',
	order: 99.5,
	when: ContextKeyExpr.and(editorTitleAuxiliaryBarWhen, AuxiliaryBarVisibleContext)
});

MenuRegistry.appendMenuItem(MenuId.EditorTitleLayout, {
	command: {
		id: 'workbench.action.toggleAuxiliaryBar',
		title: localize('showSecondarySideBar', "Show Secondary Side Bar"),
		icon: Codicon.rightPanelShow
	},
	group: 'navigation',
	order: 99.5,
	when: ContextKeyExpr.and(editorTitleAuxiliaryBarWhen, AuxiliaryBarVisibleContext.toNegated())
});

MenuRegistry.appendMenuItem(Menus.PanelTitle, {
	command: {
		id: 'workbench.action.closePanel',
		title: localize('closePanel', "Hide Panel"),
		icon: panelCloseIcon
	},
	group: 'navigation',
	order: 2
});

// Floating window controls: always-on-top
MenuRegistry.appendMenuItem(Menus.TitleBarRightLayout, {
	command: {
		id: 'workbench.action.toggleWindowAlwaysOnTop',
		title: localize('toggleWindowAlwaysOnTop', "Toggle Always on Top"),
		icon: Codicon.pin,
		toggled: {
			condition: IsWindowAlwaysOnTopContext,
			icon: Codicon.pinned,
		},
	},
	when: IsAuxiliaryWindowContext,
	group: 'navigation',
	order: 0
});
