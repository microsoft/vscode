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
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from '../../platform/accessibility/common/accessibility.js';
import { TogglePanelAction } from '../../workbench/browser/parts/panel/panelActions.js';
import { LayoutDensityMenu } from '../../workbench/browser/actions/layoutDensityActions.js';
import { IsAuxiliaryWindowContext, IsWindowAlwaysOnTopContext, PanelVisibleContext, SideBarVisibleContext } from '../../workbench/common/contextkeys.js';
import { IWorkbenchLayoutService, Parts } from '../../workbench/services/layout/browser/layoutService.js';
import { SessionsWelcomeVisibleContext, CustomViewVisibleContext, IsPhoneLayoutContext } from '../common/contextkeys.js';

for (const menu of [Menus.TitleBarContext, MenuId.MenubarViewMenu]) {
	MenuRegistry.appendMenuItem(menu, {
		title: localize('layoutDensity', "Layout Density"),
		submenu: LayoutDensityMenu,
		group: '2_configuration',
		order: 8,
		when: IsPhoneLayoutContext.negate(),
	});
}

// Register Icons
const panelCloseIcon = registerIcon('agent-panel-close', Codicon.close, localize('agentPanelCloseIcon', "Icon to close the panel."));
const sidebarToggleClosedIcon = registerIcon('agent-sidebar-toggle-closed', Codicon.layoutSidebarLeftOff, localize('agentSidebarToggleClosedIcon', "Icon for the sessions sidebar when closed."));
const sidebarToggleOpenIcon = registerIcon('agent-sidebar-toggle-open', Codicon.layoutSidebarLeft, localize('agentSidebarToggleOpenIcon', "Icon for the sessions sidebar when open."));

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

registerAction2(ToggleSidebarVisibilityAction);

MenuRegistry.appendMenuItem(Menus.TitleBarAccessibility, {
	command: {
		id: 'editor.action.toggleScreenReaderAccessibilityMode',
		title: localize('screenReaderOptimizedBadge', "Screen Reader Optimized"),
		tooltip: localize('disableScreenReaderOptimizedMode', "Disable Screen Reader Optimized Mode"),
	},
	group: 'navigation',
	order: 0,
	when: ContextKeyExpr.and(CONTEXT_ACCESSIBILITY_MODE_ENABLED, IsPhoneLayoutContext.negate())
});

const titleBarPanelWhen = ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated(), IsPhoneLayoutContext.negate());

MenuRegistry.appendMenuItem(Menus.TitleBarSessionMenu, {
	command: {
		id: TogglePanelAction.ID,
		title: localize('showPanel', "Show Panel"),
		icon: Codicon.layoutPanelOff,
		precondition: CustomViewVisibleContext.negate()
	},
	group: 'navigation',
	order: 10,
	when: ContextKeyExpr.and(titleBarPanelWhen, PanelVisibleContext.toNegated())
});

MenuRegistry.appendMenuItem(Menus.TitleBarSessionMenu, {
	command: {
		id: TogglePanelAction.ID,
		title: localize('hidePanel', "Hide Panel"),
		icon: Codicon.layoutPanel,
		precondition: CustomViewVisibleContext.negate()
	},
	group: 'navigation',
	order: 10,
	when: ContextKeyExpr.and(titleBarPanelWhen, PanelVisibleContext)
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
