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
import { Menus, SessionActivityBarGroup } from './menus.js';
import { ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../platform/keybinding/common/keybindingsRegistry.js';
import { registerIcon } from '../../platform/theme/common/iconRegistry.js';
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from '../../platform/accessibility/common/accessibility.js';
import { TogglePanelAction } from '../../workbench/browser/parts/panel/panelActions.js';
import { LayoutDensityMenu } from '../../workbench/browser/actions/layoutDensityActions.js';
import { IsAuxiliaryWindowContext, IsWindowAlwaysOnTopContext, PanelVisibleContext, SideBarVisibleContext } from '../../workbench/common/contextkeys.js';
import { IWorkbenchLayoutService, Parts } from '../../workbench/services/layout/browser/layoutService.js';
import { SessionsWelcomeVisibleContext, CustomViewVisibleContext, DesktopLayoutContext, IsPhoneLayoutContext, SessionActivityBarLayoutActionsContext } from '../common/contextkeys.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING, SESSION_ACTIVITY_BAR_SETTING } from '../common/sessionConfig.js';

for (const menu of [Menus.TitleBarContext, MenuId.MenubarViewMenu]) {
	MenuRegistry.appendMenuItem(menu, {
		title: localize('layoutDensity', "Layout Density"),
		submenu: LayoutDensityMenu,
		group: '2_configuration',
		order: 8,
		when: IsPhoneLayoutContext.negate(),
	});
}

export const TOGGLE_SESSION_ACTIVITY_BAR_COMMAND_ID = 'workbench.action.agentSessions.toggleSessionActivityBar';

MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
	title: localize({ key: 'miAppearance', comment: ['&& denotes a mnemonic'] }, "&&Appearance"),
	submenu: Menus.ViewAppearance,
	group: '2_appearance',
	order: 1,
	when: DesktopLayoutContext,
});

registerAction2(class ToggleSessionActivityBarAction extends Action2 {
	constructor() {
		super({
			id: TOGGLE_SESSION_ACTIVITY_BAR_COMMAND_ID,
			title: localize2('toggleSessionActivityBar', "Toggle Session Activity Bar"),
			category: Categories.View,
			f1: true,
			precondition: DesktopLayoutContext,
		});
	}

	override run(accessor: ServicesAccessor): Promise<void> {
		const configurationService = accessor.get(IConfigurationService);
		return configurationService.updateValue(SESSION_ACTIVITY_BAR_SETTING, !configurationService.getValue<boolean>(SESSION_ACTIVITY_BAR_SETTING));
	}
});

MenuRegistry.appendMenuItem(Menus.ViewAppearance, {
	command: {
		id: TOGGLE_SESSION_ACTIVITY_BAR_COMMAND_ID,
		title: localize({ key: 'miSessionActivityBar', comment: ['&& denotes a mnemonic'] }, "Session &&Activity Bar"),
		toggled: ContextKeyExpr.equals(`config.${SESSION_ACTIVITY_BAR_SETTING}`, true),
	},
	group: '1_workbench_layout',
	order: 1,
	when: DesktopLayoutContext,
});

// The activity bar is only shown while enabled, so toggling from its own context menu hides it.
MenuRegistry.appendMenuItem(Menus.SessionActivityBarContext, {
	command: {
		id: TOGGLE_SESSION_ACTIVITY_BAR_COMMAND_ID,
		title: localize('hideSessionActivityBar', "Hide Session Activity Bar"),
	},
	group: 'navigation',
	order: 1,
});

export const TOGGLE_SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_COMMAND_ID = 'workbench.action.agentSessions.toggleSessionActivityBarLayoutActions';

registerAction2(class ToggleSessionActivityBarLayoutActionsAction extends Action2 {
	constructor() {
		super({
			id: TOGGLE_SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_COMMAND_ID,
			title: localize2('toggleSessionActivityBarLayoutActions', "Toggle Layout Actions in Session Activity Bar"),
			category: Categories.View,
			f1: true,
			precondition: ContextKeyExpr.and(DesktopLayoutContext, ContextKeyExpr.equals(`config.${SESSION_ACTIVITY_BAR_SETTING}`, true)),
			toggled: ContextKeyExpr.equals(`config.${SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING}`, true),
		});
	}

	override run(accessor: ServicesAccessor): Promise<void> {
		const configurationService = accessor.get(IConfigurationService);
		return configurationService.updateValue(SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING, !configurationService.getValue<boolean>(SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING));
	}
});

MenuRegistry.appendMenuItem(Menus.SessionActivityBarContext, {
	command: {
		id: TOGGLE_SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_COMMAND_ID,
		title: localize('showSessionActivityBarLayoutActions', "Show Layout Actions"),
		toggled: ContextKeyExpr.equals(`config.${SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING}`, true),
	},
	group: 'navigation',
	order: 0,
});

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

// The Session Activity Bar hosts these toggles in place of the title bar while it shows its layout actions.
const titleBarPanelWhen = ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated(), IsPhoneLayoutContext.negate(), SessionActivityBarLayoutActionsContext.negate());
const sessionActivityBarPanelWhen = ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionActivityBarLayoutActionsContext);

const showPanelCommand = {
	id: TogglePanelAction.ID,
	title: localize('showPanel', "Show Panel"),
	icon: Codicon.layoutPanelOff,
	precondition: CustomViewVisibleContext.negate()
};
const hidePanelCommand = {
	id: TogglePanelAction.ID,
	title: localize('hidePanel', "Hide Panel"),
	icon: Codicon.layoutPanel,
	precondition: CustomViewVisibleContext.negate()
};

MenuRegistry.appendMenuItem(Menus.TitleBarSessionMenu, {
	command: showPanelCommand,
	group: 'navigation',
	order: 10,
	when: ContextKeyExpr.and(titleBarPanelWhen, PanelVisibleContext.toNegated())
});

MenuRegistry.appendMenuItem(Menus.TitleBarSessionMenu, {
	command: hidePanelCommand,
	group: 'navigation',
	order: 10,
	when: ContextKeyExpr.and(titleBarPanelWhen, PanelVisibleContext)
});

MenuRegistry.appendMenuItem(Menus.SessionActivityBar, {
	command: showPanelCommand,
	group: SessionActivityBarGroup.Panel,
	order: 0,
	when: ContextKeyExpr.and(sessionActivityBarPanelWhen, PanelVisibleContext.toNegated())
});

MenuRegistry.appendMenuItem(Menus.SessionActivityBar, {
	command: hidePanelCommand,
	group: SessionActivityBarGroup.Panel,
	order: 0,
	when: ContextKeyExpr.and(sessionActivityBarPanelWhen, PanelVisibleContext)
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
