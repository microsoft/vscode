/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { alert } from '../../base/browser/ui/aria/aria.js';
import { Codicon } from '../../base/common/codicons.js';
import { localize, localize2 } from '../../nls.js';
import { Categories } from '../../platform/action/common/actionCommonCategories.js';
import { Action2, MenuRegistry, registerAction2 } from '../../platform/actions/common/actions.js';
import { Menus } from './menus.js';
import { registerIcon } from '../../platform/theme/common/iconRegistry.js';
import { IsAuxiliaryWindowContext, IsWindowAlwaysOnTopContext, SideBarVisibleContext } from '../../workbench/common/contextkeys.js';
import { IWorkbenchLayoutService } from '../../workbench/services/layout/browser/layoutService.js';
// Register Icons
const panelCloseIcon = registerIcon('agent-panel-close', Codicon.close, localize('agentPanelCloseIcon', "Icon to close the panel."));
const sidebarToggleClosedIcon = registerIcon('agent-sidebar-toggle-closed', Codicon.layoutSidebarLeftOff, localize('agentSidebarToggleClosedIcon', "Icon for the sessions sidebar when closed."));
const sidebarToggleOpenIcon = registerIcon('agent-sidebar-toggle-open', Codicon.layoutSidebarLeft, localize('agentSidebarToggleOpenIcon', "Icon for the sessions sidebar when open."));
class ToggleSidebarVisibilityAction extends Action2 {
    static { this.ID = 'workbench.action.agentToggleSidebarVisibility'; }
    constructor() {
        super({
            id: ToggleSidebarVisibilityAction.ID,
            title: localize2('toggleSidebar', 'Toggle Primary Side Bar Visibility'),
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
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 2048 /* KeyMod.CtrlCmd */ | 32 /* KeyCode.KeyB */
            },
            menu: [
                {
                    id: Menus.TitleBarLeftLayout,
                    group: 'navigation',
                    order: 0,
                    when: IsAuxiliaryWindowContext.toNegated()
                },
                {
                    id: Menus.TitleBarContext,
                    group: 'navigation',
                    order: 0,
                    when: IsAuxiliaryWindowContext.toNegated()
                }
            ]
        });
    }
    run(accessor) {
        const layoutService = accessor.get(IWorkbenchLayoutService);
        const isCurrentlyVisible = layoutService.isVisible("workbench.parts.sidebar" /* Parts.SIDEBAR_PART */);
        layoutService.setPartHidden(isCurrentlyVisible, "workbench.parts.sidebar" /* Parts.SIDEBAR_PART */);
        // Announce visibility change to screen readers
        const alertMessage = isCurrentlyVisible
            ? localize('sidebarHidden', "Primary Side Bar hidden")
            : localize('sidebarVisible', "Primary Side Bar shown");
        alert(alertMessage);
    }
}
class ToggleSecondarySidebarVisibilityAction extends Action2 {
    static { this.ID = 'workbench.action.agentToggleSecondarySidebarVisibility'; }
    constructor() {
        super({
            id: ToggleSecondarySidebarVisibilityAction.ID,
            title: localize2('toggleSecondarySidebar', 'Toggle Secondary Side Bar Visibility'),
            icon: panelCloseIcon,
            metadata: {
                description: localize('openAndCloseSecondarySidebar', 'Open/Show and Close/Hide Secondary Side Bar'),
            },
            category: Categories.View,
            f1: true,
            menu: [
                {
                    id: Menus.TitleBarContext,
                    order: 1,
                    when: IsAuxiliaryWindowContext.toNegated()
                }
            ]
        });
    }
    run(accessor) {
        const layoutService = accessor.get(IWorkbenchLayoutService);
        const isCurrentlyVisible = layoutService.isVisible("workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */);
        layoutService.setPartHidden(isCurrentlyVisible, "workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */);
        // Announce visibility change to screen readers
        const alertMessage = isCurrentlyVisible
            ? localize('secondarySidebarHidden', "Secondary Side Bar hidden")
            : localize('secondarySidebarVisible', "Secondary Side Bar shown");
        alert(alertMessage);
    }
}
class TogglePanelVisibilityAction extends Action2 {
    static { this.ID = 'workbench.action.agentTogglePanelVisibility'; }
    constructor() {
        super({
            id: TogglePanelVisibilityAction.ID,
            title: localize2('togglePanel', 'Toggle Panel Visibility'),
            category: Categories.View,
            f1: true,
            icon: panelCloseIcon,
            menu: [
                {
                    id: Menus.PanelTitle,
                    group: 'navigation',
                    order: 2,
                    when: IsAuxiliaryWindowContext.toNegated()
                }
            ]
        });
    }
    run(accessor) {
        const layoutService = accessor.get(IWorkbenchLayoutService);
        layoutService.setPartHidden(layoutService.isVisible("workbench.parts.panel" /* Parts.PANEL_PART */), "workbench.parts.panel" /* Parts.PANEL_PART */);
    }
}
registerAction2(ToggleSidebarVisibilityAction);
registerAction2(ToggleSecondarySidebarVisibilityAction);
registerAction2(TogglePanelVisibilityAction);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGF5b3V0QWN0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3Nlc3Npb25zL2Jyb3dzZXIvbGF5b3V0QWN0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDM0QsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBRXhELE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sY0FBYyxDQUFDO0FBQ25ELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUNwRixPQUFPLEVBQUUsT0FBTyxFQUFFLFlBQVksRUFBRSxlQUFlLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNsRyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sWUFBWSxDQUFDO0FBR25DLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsMEJBQTBCLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNwSSxPQUFPLEVBQUUsdUJBQXVCLEVBQVMsTUFBTSwwREFBMEQsQ0FBQztBQUUxRyxpQkFBaUI7QUFDakIsTUFBTSxjQUFjLEdBQUcsWUFBWSxDQUFDLG1CQUFtQixFQUFFLE9BQU8sQ0FBQyxLQUFLLEVBQUUsUUFBUSxDQUFDLHFCQUFxQixFQUFFLDBCQUEwQixDQUFDLENBQUMsQ0FBQztBQUNySSxNQUFNLHVCQUF1QixHQUFHLFlBQVksQ0FBQyw2QkFBNkIsRUFBRSxPQUFPLENBQUMsb0JBQW9CLEVBQUUsUUFBUSxDQUFDLDhCQUE4QixFQUFFLDRDQUE0QyxDQUFDLENBQUMsQ0FBQztBQUNsTSxNQUFNLHFCQUFxQixHQUFHLFlBQVksQ0FBQywyQkFBMkIsRUFBRSxP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