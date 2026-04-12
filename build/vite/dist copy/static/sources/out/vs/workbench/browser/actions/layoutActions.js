/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize, localize2 } from '../../../nls.js';
import { MenuId, MenuRegistry, registerAction2, Action2 } from '../../../platform/actions/common/actions.js';
import { Categories } from '../../../platform/action/common/actionCommonCategories.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { alert } from '../../../base/browser/ui/aria/aria.js';
import { IWorkbenchLayoutService, positionToString } from '../../services/layout/browser/layoutService.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { KeyChord } from '../../../base/common/keyCodes.js';
import { isWindows, isLinux, isWeb, isMacintosh, isNative } from '../../../base/common/platform.js';
import { IsMacNativeContext } from '../../../platform/contextkey/common/contextkeys.js';
import { KeybindingsRegistry } from '../../../platform/keybinding/common/keybindingsRegistry.js';
import { ContextKeyExpr, IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { IViewDescriptorService, ViewContainerLocationToString } from '../../common/views.js';
import { IViewsService } from '../../services/views/common/viewsService.js';
import { IQuickInputService } from '../../../platform/quickinput/common/quickInput.js';
import { IDialogService } from '../../../platform/dialogs/common/dialogs.js';
import { IPaneCompositePartService } from '../../services/panecomposite/browser/panecomposite.js';
import { ToggleAuxiliaryBarAction } from '../parts/auxiliarybar/auxiliaryBarActions.js';
import { TogglePanelAction } from '../parts/panel/panelActions.js';
import { ICommandService } from '../../../platform/commands/common/commands.js';
import { AuxiliaryBarVisibleContext, PanelAlignmentContext, PanelVisibleContext, SideBarVisibleContext, FocusedViewContext, InEditorZenModeContext, IsMainEditorCenteredLayoutContext, MainEditorAreaVisibleContext, IsMainWindowFullscreenContext, PanelPositionContext, IsAuxiliaryWindowFocusedContext, IsSessionsWindowContext, TitleBarStyleContext, IsAuxiliaryWindowContext } from '../../common/contextkeys.js';
import { Codicon } from '../../../base/common/codicons.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { registerIcon } from '../../../platform/theme/common/iconRegistry.js';
import { mainWindow } from '../../../base/browser/window.js';
import { IKeybindingService } from '../../../platform/keybinding/common/keybinding.js';
import { IPreferencesService } from '../../services/preferences/common/preferences.js';
import { QuickInputAlignmentContextKey } from '../../../platform/quickinput/browser/quickInput.js';
import { IEditorGroupsService } from '../../services/editor/common/editorGroupsService.js';
// Register Icons
const menubarIcon = registerIcon('menuBar', Codicon.layoutMenubar, localize('menuBarIcon', "Represents the menu bar"));
const activityBarLeftIcon = registerIcon('activity-bar-left', Codicon.layoutActivitybarLeft, localize('activityBarLeft', "Represents the activity bar in the left position"));
const activityBarRightIcon = registerIcon('activity-bar-right', Codicon.layoutActivitybarRight, localize('activityBarRight', "Represents the activity bar in the right position"));
const panelLeftIcon = registerIcon('panel-left', Codicon.layoutSidebarLeft, localize('panelLeft', "Represents a side bar in the left position"));
const panelLeftOffIcon = registerIcon('panel-left-off', Codicon.layoutSidebarLeftOff, localize('panelLeftOff', "Represents a side bar in the left position toggled off"));
const panelRightIcon = registerIcon('panel-right', Codicon.layoutSidebarRight, localize('panelRight', "Represents side bar in the right position"));
const panelRightOffIcon = registerIcon('panel-right-off', Codicon.layoutSidebarRightOff, localize('panelRightOff', "Represents side bar in the right position toggled off"));
const panelIcon = registerIcon('panel-bottom', Codicon.layoutPanel, localize('panelBottom', "Represents the bottom panel"));
const statusBarIcon = registerIcon('statusBar', Codicon.layoutStatusbar, localize('statusBarIcon', "Represents the status bar"));
const panelAlignmentLeftIcon = registerIcon('panel-align-left', Codicon.layoutPanelLeft, localize('panelBottomLeft', "Represents the bottom panel alignment set to the left"));
const panelAlignmentRightIcon = registerIcon('panel-align-right', Codicon.layoutPanelRight, localize('panelBottomRight', "Represents the bottom panel alignment set to the right"));
const panelAlignmentCenterIcon = registerIcon('panel-align-center', Codicon.layoutPanelCenter, localize('panelBottomCenter', "Represents the bottom panel alignment set to the center"));
const panelAlignmentJustifyIcon = registerIcon('panel-align-justify', Codicon.layoutPanelJustify, localize('panelBottomJustify', "Represents the bottom panel alignment set to justified"));
const quickInputAlignmentTopIcon = registerIcon('quickInputAlignmentTop', Codicon.arrowUp, localize('quickInputAlignmentTop', "Represents quick input alignment set to the top"));
const quickInputAlignmentCenterIcon = registerIcon('quickInputAlignmentCenter', Codicon.circle, localize('quickInputAlignmentCenter', "Represents quick input alignment set to the center"));
const fullscreenIcon = registerIcon('fullscreen', Codicon.screenFull, localize('fullScreenIcon', "Represents full screen"));
const centerLayoutIcon = registerIcon('centerLayoutIcon', Codicon.layoutCentered, localize('centerLayoutIcon', "Represents centered layout mode"));
const zenModeIcon = registerIcon('zenMode', Codicon.target, localize('zenModeIcon', "Represents zen mode"));
export const ToggleActivityBarVisibilityActionId = 'workbench.action.toggleActivityBarVisibility';
// --- Toggle Centered Layout
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.toggleCenteredLayout',
            title: {
                ...localize2('toggleCenteredLayout', "Toggle Centered Layout"),
                mnemonicTitle: localize({ key: 'miToggleCenteredLayout', comment: ['&& denotes a mnemonic'] }, "&&Centered Layout"),
            },
            precondition: IsAuxiliaryWindowFocusedContext.toNegated(),
            category: Categories.View,
            f1: true,
            toggled: IsMainEditorCenteredLayoutContext,
            menu: [{
                    id: MenuId.MenubarAppearanceMenu,
                    group: '1_toggle_view',
                    order: 3
                }]
        });
    }
    run(accessor) {
        const layoutService = accessor.get(IWorkbenchLayoutService);
        const editorGroupService = accessor.get(IEditorGroupsService);
        layoutService.centerMainEditorLayout(!layoutService.isMainEditorLayoutCentered());
        editorGroupService.activeGroup.focus();
    }
});
// --- Set Sidebar Position
const sidebarPositionConfigurationKey = 'workbench.sideBar.location';
class MoveSidebarPositionAction extends Action2 {
    constructor(id, title, position) {
        super({
            id,
            title,
            f1: false
        });
        this.position = position;
    }
    async run(accessor) {
        const layoutService = accessor.get(IWorkbenchLayoutService);
        const configurationService = accessor.get(IConfigurationService);
        const position = layoutService.getSideBarPosition();
        if (position !== this.position) {
            return configurationService.updateValue(sidebarPositionConfigurationKey, positionToString(this.position));
        }
    }
}
class MoveSidebarRightAction extends MoveSidebarPositionAction {
    static { this.ID = 'workbench.action.moveSideBarRight'; }
    constructor() {
        super(MoveSidebarRightAction.ID, localize2('moveSidebarRight', "Move Primary Side Bar Right"), 1 /* Position.RIGHT */);
    }
}
class MoveSidebarLeftAction extends MoveSidebarPositionAction {
    static { this.ID = 'workbench.action.moveSideBarLeft'; }
    constructor() {
        super(MoveSidebarLeftAction.ID, localize2('moveSidebarLeft', "Move Primary Side Bar Left"), 0 /* Position.LEFT */);
    }
}
registerAction2(MoveSidebarRightAction);
registerAction2(MoveSidebarLeftAction);
// --- Toggle Sidebar Position
export class ToggleSidebarPositionAction extends Action2 {
    static { this.ID = 'workbench.action.toggleSidebarPosition'; }
    static { this.LABEL = localize('toggleSidebarPosition', "Toggle Primary Side Bar Position"); }
    static getLabel(layoutService) {
        return layoutService.getSideBarPosition() === 0 /* Position.LEFT */ ? localize('moveSidebarRight', "Move Primary Side Bar Right") : localize('moveSidebarLeft', "Move Primary Side Bar Left");
    }
    constructor() {
        super({
            id: ToggleSidebarPositionAction.ID,
            title: localize2('toggleSidebarPosition', "Toggle Primary Side Bar Position"),
            category: Categories.View,
            f1: true,
            precondition: IsSessionsWindowContext.negate()
        });
    }
    run(accessor) {
        const layoutService = accessor.get(IWorkbenchLayoutService);
        const configurationService = accessor.get(IConfigurationService);
        const position = layoutService.getSideBarPosition();
        const newPositionValue = (position === 0 /* Position.LEFT */) ? 'right' : 'left';
        return configurationService.updateValue(sidebarPositionConfigurationKey, newPositionValue);
    }
}
registerAction2(ToggleSidebarPositionAction);
const configureLayoutIcon = registerIcon('configure-layout-icon', Codicon.layout, localize('cofigureLayoutIcon', 'Icon represents workbench layout configuration.'));
MenuRegistry.appendMenuItem(MenuId.LayoutControlMenu, {
    submenu: MenuId.LayoutControlMenuSubmenu,
    title: localize('configureLayout', "Configure Layout"),
    icon: configureLayoutIcon,
    group: '1_workbench_layout',
    when: ContextKeyExpr.and(IsAuxiliaryWindowContext.negate(), ContextKeyExpr.equals('config.workbench.layoutControl.type', 'menu'))
});
MenuRegistry.appendMenuItems([{
        id: MenuId.ViewContainerTitleContext,
        item: {
            group: '3_workbench_layout_move',
            command: {
                id: ToggleSidebarPositionAction.ID,
                title: localize('move side bar right', "Move Primary Side Bar Right")
            },
            when: ContextKeyExpr.and(ContextKeyExpr.notEquals('config.workbench.sideBar.location', 'right'), ContextKeyExpr.equals('viewContainerLocation', ViewContainerLocationToString(0 /* ViewContainerLocation.Sidebar */))),
            order: 1
        }
    }, {
        id: MenuId.ViewContainerTitleContext,
        item: {
            group: '3_workbench_layout_move',
            command: {
                id: ToggleSidebarPositionAction.ID,
                title: localize('move sidebar left', "Move Primary Side Bar Left")
            },
            when: ContextKeyExpr.and(ContextKeyExpr.equals('config.workbench.sideBar.location', 'right'), ContextKeyExpr.equals('viewContainerLocation', ViewContainerLocationToString(0 /* ViewContainerLocation.Sidebar */))),
            order: 1
        }
    }, {
        id: MenuId.ViewContainerTitleContext,
        item: {
            group: '3_workbench_layout_move',
            command: {
                id: ToggleSidebarPositionAction.ID,
                title: localize('move second sidebar left', "Move Secondary Side Bar Left")
            },
            when: ContextKeyExpr.and(ContextKeyExpr.notEquals('config.workbench.sideBar.location', 'right'), ContextKeyExpr.equals('viewContainerLocation', ViewContainerLocationToString(2 /* ViewContainerLocation.AuxiliaryBar */))),
            order: 1
        }
    }, {
        id: MenuId.ViewContainerTitleContext,
        item: {
            group: '3_workbench_layout_move',
            command: {
                id: ToggleSidebarPositionAction.ID,
                title: localize('move second sidebar right', "Move Secondary Side Bar Right")
            },
            when: ContextKeyExpr.and(ContextKeyExpr.equals('config.workbench.sideBar.location', 'right'), ContextKeyExpr.equals('viewContainerLocation', ViewContainerLocationToString(2 /* ViewContainerLocation.AuxiliaryBar */))),
            order: 1
        }
    }]);
MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
    group: '3_workbench_layout_move',
    command: {
        id: ToggleSidebarPositionAction.ID,
        title: localize({ key: 'miMoveSidebarRight', comment: ['&& denotes a mnemonic'] }, "&&Move Primary Side Bar Right")
    },
    when: ContextKeyExpr.and(ContextKeyExpr.notEquals('config.workbench.sideBar.location', 'right'), IsSessionsWindowContext.negate()),
    order: 2
});
MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
    group: '3_workbench_layout_move',
    command: {
        id: ToggleSidebarPositionAction.ID,
        title: localize({ key: 'miMoveSidebarLeft', comment: ['&& denotes a mnemonic'] }, "&&Move Primary Side Bar Left")
    },
    when: ContextKeyExpr.and(ContextKeyExpr.equals('config.workbench.sideBar.location', 'right'), IsSessionsWindowContext.negate()),
    order: 2
});
// --- Toggle Editor Visibility
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.toggleEditorVisibility',
            title: {
                ...localize2('toggleEditor', "Toggle Editor Area Visibility"),
                mnemonicTitle: localize({ key: 'miShowEditorArea', comment: ['&& denotes a mnemonic'] }, "Show &&Editor Area"),
            },
            category: Categories.View,
            f1: true,
            toggled: MainEditorAreaVisibleContext,
            // the workbench grid currently prevents us from supporting panel maximization with non-center panel alignment
            precondition: ContextKeyExpr.and(IsAuxiliaryWindowFocusedContext.toNegated(), ContextKeyExpr.or(PanelAlignmentContext.isEqualTo('center'), PanelPositionContext.notEqualsTo('bottom')))
        });
    }
    run(accessor) {
        accessor.get(IWorkbenchLayoutService).toggleMaximizedPanel();
    }
});
MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
    group: '2_appearance',
    title: localize({ key: 'miAppearance', comment: ['&& denotes a mnemonic'] }, "&&Appearance"),
    submenu: MenuId.MenubarAppearanceMenu,
    order: 1
});
// Toggle Sidebar Visibility
export class ToggleSidebarVisibilityAction extends Action2 {
    static { this.ID = 'workbench.action.toggleSidebarVisibility'; }
    static { this.LABEL = localize('compositePart.hideSideBarLabel', "Hide Primary Side Bar"); }
    constructor() {
        super({
            id: ToggleSidebarVisibilityAction.ID,
            title: localize2('toggleSidebar', 'Toggle Primary Side Bar Visibility'),
            toggled: {
                condition: SideBarVisibleContext,
                title: localize('primary sidebar', "Primary Side Bar"),
                mnemonicTitle: localize({ key: 'primary sidebar mnemonic', comment: ['&& denotes a mnemonic'] }, "&&Primary Side Bar"),
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
                    id: MenuId.LayoutControlMenuSubmenu,
                    group: '0_workbench_layout',
                    order: 0
                },
                {
                    id: MenuId.MenubarAppearanceMenu,
                    group: '2_workbench_layout',
                    order: 1
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
registerAction2(ToggleSidebarVisibilityAction);
MenuRegistry.appendMenuItems([
    {
        id: MenuId.ViewContainerTitleContext,
        item: {
            group: '3_workbench_layout_move',
            command: {
                id: ToggleSidebarVisibilityAction.ID,
                title: localize('compositePart.hideSideBarLabel', "Hide Primary Side Bar"),
            },
            when: ContextKeyExpr.and(SideBarVisibleContext, ContextKeyExpr.equals('viewContainerLocation', ViewContainerLocationToString(0 /* ViewContainerLocation.Sidebar */))),
            order: 2
        }
    }, {
        id: MenuId.LayoutControlMenu,
        item: {
            group: '2_pane_toggles',
            command: {
                id: ToggleSidebarVisibilityAction.ID,
                title: localize('toggleSideBar', "Toggle Primary Side Bar"),
                icon: panelLeftOffIcon,
                toggled: { condition: SideBarVisibleContext, icon: panelLeftIcon }
            },
            when: ContextKeyExpr.and(IsAuxiliaryWindowContext.negate(), ContextKeyExpr.or(ContextKeyExpr.equals('config.workbench.layoutControl.type', 'toggles'), ContextKeyExpr.equals('config.workbench.layoutControl.type', 'both')), ContextKeyExpr.equals('config.workbench.sideBar.location', 'left')),
            order: 0
        }
    }, {
        id: MenuId.LayoutControlMenu,
        item: {
            group: '2_pane_toggles',
            command: {
                id: ToggleSidebarVisibilityAction.ID,
                title: localize('toggleSideBar', "Toggle Primary Side Bar"),
                icon: panelRightOffIcon,
                toggled: { condition: SideBarVisibleContext, icon: panelRightIcon }
            },
            when: ContextKeyExpr.and(IsAuxiliaryWindowContext.negate(), ContextKeyExpr.or(ContextKeyExpr.equals('config.workbench.layoutControl.type', 'toggles'), ContextKeyExpr.equals('config.workbench.layoutControl.type', 'both')), ContextKeyExpr.equals('config.workbench.sideBar.location', 'right')),
            order: 2
        }
    }
]);
// --- Toggle Statusbar Visibility
export class ToggleStatusbarVisibilityAction extends Action2 {
    static { this.ID = 'workbench.action.toggleStatusbarVisibility'; }
    static { this.statusbarVisibleKey = 'workbench.statusBar.visible'; }
    constructor() {
        super({
            id: ToggleStatusbarVisibilityAction.ID,
            title: {
                ...localize2('toggleStatusbar', "Toggle Status Bar Visibility"),
                mnemonicTitle: localize({ key: 'miStatusbar', comment: ['&& denotes a mnemonic'] }, "S&&tatus Bar"),
            },
            category: Categories.View,
            f1: true,
            precondition: IsSessionsWindowContext.negate(),
            toggled: ContextKeyExpr.equals('config.workbench.statusBar.visible', true),
            menu: [{
                    id: MenuId.MenubarAppearanceMenu,
                    group: '2_workbench_layout',
                    order: 3,
                    when: IsSessionsWindowContext.negate()
                }]
        });
    }
    run(accessor) {
        const layoutService = accessor.get(IWorkbenchLayoutService);
        const configurationService = accessor.get(IConfigurationService);
        const visibility = layoutService.isVisible("workbench.parts.statusbar" /* Parts.STATUSBAR_PART */, mainWindow);
        const newVisibilityValue = !visibility;
        return configurationService.updateValue(ToggleStatusbarVisibilityAction.statusbarVisibleKey, newVisibilityValue);
    }
}
registerAction2(ToggleStatusbarVisibilityAction);
// ------------------- Editor Tabs Layout --------------------------------
class AbstractSetShowTabsAction extends Action2 {
    constructor(settingName, value, title, id, precondition, description) {
        super({
            id,
            title,
            category: Categories.View,
            precondition: ContextKeyExpr.and(precondition, IsSessionsWindowContext.negate()),
            metadata: description ? { description } : undefined,
            f1: true
        });
        this.settingName = settingName;
        this.value = value;
    }
    run(accessor) {
        const configurationService = accessor.get(IConfigurationService);
        return configurationService.updateValue(this.settingName, this.value);
    }
}
// --- Hide Editor Tabs
export class HideEditorTabsAction extends AbstractSetShowTabsAction {
    static { this.ID = 'workbench.action.hideEditorTabs'; }
    constructor() {
        const precondition = ContextKeyExpr.and(ContextKeyExpr.equals(`config.${"workbench.editor.showTabs" /* LayoutSettings.EDITOR_TABS_MODE */}`, "none" /* EditorTabsMode.NONE */).negate(), InEditorZenModeContext.negate());
        const title = localize2('hideEditorTabs', 'Hide Editor Tabs');
        super("workbench.editor.showTabs" /* LayoutSettings.EDITOR_TABS_MODE */, "none" /* EditorTabsMode.NONE */, title, HideEditorTabsAction.ID, precondition, localize2('hideEditorTabsDescription', "Hide Tab Bar"));
    }
}
export class ZenHideEditorTabsAction extends AbstractSetShowTabsAction {
    static { this.ID = 'workbench.action.zenHideEditorTabs'; }
    constructor() {
        const precondition = ContextKeyExpr.and(ContextKeyExpr.equals(`config.${"zenMode.showTabs" /* ZenModeSettings.SHOW_TABS */}`, "none" /* EditorTabsMode.NONE */).negate(), InEditorZenModeContext);
        const title = localize2('hideEditorTabsZenMode', 'Hide Editor Tabs in Zen Mode');
        super("zenMode.showTabs" /* ZenModeSettings.SHOW_TABS */, "none" /* EditorTabsMode.NONE */, title, ZenHideEditorTabsAction.ID, precondition, localize2('hideEditorTabsZenModeDescription', "Hide Tab Bar in Zen Mode"));
    }
}
// --- Show Multiple Editor Tabs
export class ShowMultipleEditorTabsAction extends AbstractSetShowTabsAction {
    static { this.ID = 'workbench.action.showMultipleEditorTabs'; }
    constructor() {
        const precondition = ContextKeyExpr.and(ContextKeyExpr.equals(`config.${"workbench.editor.showTabs" /* LayoutSettings.EDITOR_TABS_MODE */}`, "multiple" /* EditorTabsMode.MULTIPLE */).negate(), InEditorZenModeContext.negate());
        const title = localize2('showMultipleEditorTabs', 'Show Multiple Editor Tabs');
        super("workbench.editor.showTabs" /* LayoutSettings.EDITOR_TABS_MODE */, "multiple" /* EditorTabsMode.MULTIPLE */, title, ShowMultipleEditorTabsAction.ID, precondition, localize2('showMultipleEditorTabsDescription', "Show Tab Bar with multiple tabs"));
    }
}
export class ZenShowMultipleEditorTabsAction extends AbstractSetShowTabsAction {
    static { this.ID = 'workbench.action.zenShowMultipleEditorTabs'; }
    constructor() {
        const precondition = ContextKeyExpr.and(ContextKeyExpr.equals(`config.${"zenMode.showTabs" /* ZenModeSettings.SHOW_TABS */}`, "multiple" /* EditorTabsMode.MULTIPLE */).negate(), InEditorZenModeContext);
        const title = localize2('showMultipleEditorTabsZenMode', 'Show Multiple Editor Tabs in Zen Mode');
        super("zenMode.showTabs" /* ZenModeSettings.SHOW_TABS */, "multiple" /* EditorTabsMode.MULTIPLE */, title, ZenShowMultipleEditorTabsAction.ID, precondition, localize2('showMultipleEditorTabsZenModeDescription', "Show Tab Bar in Zen Mode"));
    }
}
// --- Show Single Editor Tab
export class ShowSingleEditorTabAction extends AbstractSetShowTabsAction {
    static { this.ID = 'workbench.action.showEditorTab'; }
    constructor() {
        const precondition = ContextKeyExpr.and(ContextKeyExpr.equals(`config.${"workbench.editor.showTabs" /* LayoutSettings.EDITOR_TABS_MODE */}`, "single" /* EditorTabsMode.SINGLE */).negate(), InEditorZenModeContext.negate());
        const title = localize2('showSingleEditorTab', 'Show Single Editor Tab');
        super("workbench.editor.showTabs" /* LayoutSettings.EDITOR_TABS_MODE */, "single" /* EditorTabsMode.SINGLE */, title, ShowSingleEditorTabAction.ID, precondition, localize2('showSingleEditorTabDescription', "Show Tab Bar with one Tab"));
    }
}
export class ZenShowSingleEditorTabAction extends AbstractSetShowTabsAction {
    static { this.ID = 'workbench.action.zenShowEditorTab'; }
    constructor() {
        const precondition = ContextKeyExpr.and(ContextKeyExpr.equals(`config.${"zenMode.showTabs" /* ZenModeSettings.SHOW_TABS */}`, "single" /* EditorTabsMode.SINGLE */).negate(), InEditorZenModeContext);
        const title = localize2('showSingleEditorTabZenMode', 'Show Single Editor Tab in Zen Mode');
        super("zenMode.showTabs" /* ZenModeSettings.SHOW_TABS */, "single" /* EditorTabsMode.SINGLE */, title, ZenShowSingleEditorTabAction.ID, precondition, localize2('showSingleEditorTabZenModeDescription', "Show Tab Bar in Zen Mode with one Tab"));
    }
}
registerAction2(HideEditorTabsAction);
registerAction2(ZenHideEditorTabsAction);
registerAction2(ShowMultipleEditorTabsAction);
registerAction2(ZenShowMultipleEditorTabsAction);
registerAction2(ShowSingleEditorTabAction);
registerAction2(ZenShowSingleEditorTabAction);
// --- Tab Bar Submenu in View Appearance Menu
MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
    submenu: MenuId.EditorTabsBarShowTabsSubmenu,
    title: localize('tabBar', "Tab Bar"),
    group: '3_workbench_layout_move',
    order: 10,
    when: ContextKeyExpr.and(InEditorZenModeContext.negate(), IsSessionsWindowContext.negate())
});
MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
    submenu: MenuId.EditorTabsBarShowTabsZenModeSubmenu,
    title: localize('tabBar', "Tab Bar"),
    group: '3_workbench_layout_move',
    order: 10,
    when: ContextKeyExpr.and(InEditorZenModeContext, IsSessionsWindowContext.negate())
});
// --- Show Editor Actions in Title Bar
export class EditorActionsTitleBarAction extends Action2 {
    static { this.ID = 'workbench.action.editorActionsTitleBar'; }
    constructor() {
        super({
            id: EditorActionsTitleBarAction.ID,
            title: localize2('moveEditorActionsToTitleBar', "Move Editor Actions to Title Bar"),
            category: Categories.View,
            precondition: ContextKeyExpr.and(ContextKeyExpr.equals(`config.${"workbench.editor.editorActionsLocation" /* LayoutSettings.EDITOR_ACTIONS_LOCATION */}`, "titleBar" /* EditorActionsLocation.TITLEBAR */).negate(), IsSessionsWindowContext.negate()),
            metadata: { description: localize2('moveEditorActionsToTitleBarDescription', "Move Editor Actions from the tab bar to the title bar") },
            f1: true
        });
    }
    run(accessor) {
        const configurationService = accessor.get(IConfigurationService);
        return configurationService.updateValue("workbench.editor.editorActionsLocation" /* LayoutSettings.EDITOR_ACTIONS_LOCATION */, "titleBar" /* EditorActionsLocation.TITLEBAR */);
    }
}
registerAction2(EditorActionsTitleBarAction);
// --- Editor Actions Default Position
export class EditorActionsDefaultAction extends Action2 {
    static { this.ID = 'workbench.action.editorActionsDefault'; }
    constructor() {
        super({
            id: EditorActionsDefaultAction.ID,
            title: localize2('moveEditorActionsToTabBar', "Move Editor Actions to Tab Bar"),
            category: Categories.View,
            precondition: ContextKeyExpr.and(ContextKeyExpr.equals(`config.${"workbench.editor.editorActionsLocation" /* LayoutSettings.EDITOR_ACTIONS_LOCATION */}`, "default" /* EditorActionsLocation.DEFAULT */).negate(), ContextKeyExpr.equals(`config.${"workbench.editor.showTabs" /* LayoutSettings.EDITOR_TABS_MODE */}`, "none" /* EditorTabsMode.NONE */).negate(), IsSessionsWindowContext.negate()),
            metadata: { description: localize2('moveEditorActionsToTabBarDescription', "Move Editor Actions from the title bar to the tab bar") },
            f1: true
        });
    }
    run(accessor) {
        const configurationService = accessor.get(IConfigurationService);
        return configurationService.updateValue("workbench.editor.editorActionsLocation" /* LayoutSettings.EDITOR_ACTIONS_LOCATION */, "default" /* EditorActionsLocation.DEFAULT */);
    }
}
registerAction2(EditorActionsDefaultAction);
// --- Hide Editor Actions
export class HideEditorActionsAction extends Action2 {
    static { this.ID = 'workbench.action.hideEditorActions'; }
    constructor() {
        super({
            id: HideEditorActionsAction.ID,
            title: localize2('hideEditorActons', "Hide Editor Actions"),
            category: Categories.View,
            precondition: ContextKeyExpr.and(ContextKeyExpr.equals(`config.${"workbench.editor.editorActionsLocation" /* LayoutSettings.EDITOR_ACTIONS_LOCATION */}`, "hidden" /* EditorActionsLocation.HIDDEN */).negate(), IsSessionsWindowContext.negate()),
            metadata: { description: localize2('hideEditorActonsDescription', "Hide Editor Actions in the tab and title bar") },
            f1: true
        });
    }
    run(accessor) {
        const configurationService = accessor.get(IConfigurationService);
        return configurationService.updateValue("workbench.editor.editorActionsLocation" /* LayoutSettings.EDITOR_ACTIONS_LOCATION */, "hidden" /* EditorActionsLocation.HIDDEN */);
    }
}
registerAction2(HideEditorActionsAction);
// --- Hide Editor Actions
export class ShowEditorActionsAction extends Action2 {
    static { this.ID = 'workbench.action.showEditorActions'; }
    constructor() {
        super({
            id: ShowEditorActionsAction.ID,
            title: localize2('showEditorActons', "Show Editor Actions"),
            category: Categories.View,
            precondition: ContextKeyExpr.and(ContextKeyExpr.equals(`config.${"workbench.editor.editorActionsLocation" /* LayoutSettings.EDITOR_ACTIONS_LOCATION */}`, "hidden" /* EditorActionsLocation.HIDDEN */), IsSessionsWindowContext.negate()),
            metadata: { description: localize2('showEditorActonsDescription', "Make Editor Actions visible.") },
            f1: true
        });
    }
    run(accessor) {
        const configurationService = accessor.get(IConfigurationService);
        return configurationService.updateValue("workbench.editor.editorActionsLocation" /* LayoutSettings.EDITOR_ACTIONS_LOCATION */, "default" /* EditorActionsLocation.DEFAULT */);
    }
}
registerAction2(ShowEditorActionsAction);
// --- Editor Actions Position Submenu in View Appearance Menu
MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
    submenu: MenuId.EditorActionsPositionSubmenu,
    title: localize('editorActionsPosition', "Editor Actions Position"),
    group: '3_workbench_layout_move',
    order: 11,
    when: IsSessionsWindowContext.negate()
});
// --- Configure Tabs Layout
export class ConfigureEditorTabsAction extends Action2 {
    static { this.ID = 'workbench.action.configureEditorTabs'; }
    constructor() {
        super({
            id: ConfigureEditorTabsAction.ID,
            title: localize2('configureTabs', "Configure Tabs"),
            category: Categories.View,
        });
    }
    run(accessor) {
        const preferencesService = accessor.get(IPreferencesService);
        preferencesService.openSettings({ jsonEditor: false, query: 'workbench.editor tab' });
    }
}
registerAction2(ConfigureEditorTabsAction);
// --- Configure Editor
export class ConfigureEditorAction extends Action2 {
    static { this.ID = 'workbench.action.configureEditor'; }
    constructor() {
        super({
            id: ConfigureEditorAction.ID,
            title: localize2('configureEditors', "Configure Editors"),
            category: Categories.View,
        });
    }
    run(accessor) {
        const preferencesService = accessor.get(IPreferencesService);
        preferencesService.openSettings({ jsonEditor: false, query: 'workbench.editor' });
    }
}
registerAction2(ConfigureEditorAction);
// --- Toggle Pinned Tabs On Separate Row
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.toggleSeparatePinnedEditorTabs',
            title: localize2('toggleSeparatePinnedEditorTabs', "Separate Pinned Editor Tabs"),
            category: Categories.View,
            precondition: ContextKeyExpr.equals(`config.${"workbench.editor.showTabs" /* LayoutSettings.EDITOR_TABS_MODE */}`, "multiple" /* EditorTabsMode.MULTIPLE */),
            metadata: { description: localize2('toggleSeparatePinnedEditorTabsDescription', "Toggle whether pinned editor tabs are shown on a separate row above unpinned tabs.") },
            f1: true
        });
    }
    run(accessor) {
        const configurationService = accessor.get(IConfigurationService);
        const oldettingValue = configurationService.getValue('workbench.editor.pinnedTabsOnSeparateRow');
        const newSettingValue = !oldettingValue;
        return configurationService.updateValue('workbench.editor.pinnedTabsOnSeparateRow', newSettingValue);
    }
});
// --- Toggle Zen Mode
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.toggleZenMode',
            title: {
                ...localize2('toggleZenMode', "Toggle Zen Mode"),
                mnemonicTitle: localize({ key: 'miToggleZenMode', comment: ['&& denotes a mnemonic'] }, "Zen Mode"),
            },
            precondition: ContextKeyExpr.and(IsAuxiliaryWindowFocusedContext.toNegated(), IsSessionsWindowContext.negate()),
            category: Categories.View,
            f1: true,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 56 /* KeyCode.KeyZ */)
            },
            toggled: InEditorZenModeContext,
            menu: [{
                    id: MenuId.MenubarAppearanceMenu,
                    group: '1_toggle_view',
                    order: 2,
                    when: IsSessionsWindowContext.negate()
                }]
        });
    }
    run(accessor) {
        return accessor.get(IWorkbenchLayoutService).toggleZenMode();
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'workbench.action.exitZenMode',
    weight: 100 /* KeybindingWeight.EditorContrib */ - 1000,
    handler(accessor) {
        const layoutService = accessor.get(IWorkbenchLayoutService);
        const contextKeyService = accessor.get(IContextKeyService);
        if (InEditorZenModeContext.getValue(contextKeyService)) {
            layoutService.toggleZenMode();
        }
    },
    when: InEditorZenModeContext,
    primary: KeyChord(9 /* KeyCode.Escape */, 9 /* KeyCode.Escape */)
});
// --- Toggle Menu Bar
if (isWindows || isLinux || isWeb) {
    registerAction2(class ToggleMenubarAction extends Action2 {
        constructor() {
            super({
                id: 'workbench.action.toggleMenuBar',
                title: {
                    ...localize2('toggleMenuBar', "Toggle Menu Bar"),
                    mnemonicTitle: localize({ key: 'miMenuBar', comment: ['&& denotes a mnemonic'] }, "Menu &&Bar"),
                },
                category: Categories.View,
                f1: true,
                toggled: ContextKeyExpr.and(IsMacNativeContext.toNegated(), ContextKeyExpr.notEquals(`config.${"window.menuBarVisibility" /* MenuSettings.MenuBarVisibility */}`, 'hidden'), ContextKeyExpr.notEquals(`config.${"window.menuBarVisibility" /* MenuSettings.MenuBarVisibility */}`, 'toggle'), ContextKeyExpr.notEquals(`config.${"window.menuBarVisibility" /* MenuSettings.MenuBarVisibility */}`, 'compact')),
                menu: [{
                        id: MenuId.MenubarAppearanceMenu,
                        group: '2_workbench_layout',
                        order: 0
                    }]
            });
        }
        run(accessor) {
            return accessor.get(IWorkbenchLayoutService).toggleMenuBar();
        }
    });
    // Add separately to title bar context menu so we can use a different title
    for (const menuId of [MenuId.TitleBarContext, MenuId.TitleBarTitleContext]) {
        MenuRegistry.appendMenuItem(menuId, {
            command: {
                id: 'workbench.action.toggleMenuBar',
                title: localize('miMenuBarNoMnemonic', "Menu Bar"),
                toggled: ContextKeyExpr.and(IsMacNativeContext.toNegated(), ContextKeyExpr.notEquals(`config.${"window.menuBarVisibility" /* MenuSettings.MenuBarVisibility */}`, 'hidden'), ContextKeyExpr.notEquals(`config.${"window.menuBarVisibility" /* MenuSettings.MenuBarVisibility */}`, 'toggle'), ContextKeyExpr.notEquals(`config.${"window.menuBarVisibility" /* MenuSettings.MenuBarVisibility */}`, 'compact'))
            },
            when: ContextKeyExpr.and(IsAuxiliaryWindowFocusedContext.toNegated(), ContextKeyExpr.notEquals(TitleBarStyleContext.key, "native" /* TitlebarStyle.NATIVE */), IsMainWindowFullscreenContext.negate()),
            group: '2_config',
            order: 0
        });
    }
}
// --- Reset View Locations
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.resetViewLocations',
            title: localize2('resetViewLocations', "Reset View Locations"),
            category: Categories.View,
            f1: true
        });
    }
    run(accessor) {
        return accessor.get(IViewDescriptorService).reset();
    }
});
// --- Move View
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.moveView',
            title: localize2('moveView', "Move View"),
            category: Categories.View,
            f1: true
        });
    }
    async run(accessor) {
        const viewDescriptorService = accessor.get(IViewDescriptorService);
        const instantiationService = accessor.get(IInstantiationService);
        const quickInputService = accessor.get(IQuickInputService);
        const contextKeyService = accessor.get(IContextKeyService);
        const paneCompositePartService = accessor.get(IPaneCompositePartService);
        const focusedViewId = FocusedViewContext.getValue(contextKeyService);
        let viewId;
        if (focusedViewId && viewDescriptorService.getViewDescriptorById(focusedViewId)?.canMoveView) {
            viewId = focusedViewId;
        }
        try {
            viewId = await this.getView(quickInputService, viewDescriptorService, paneCompositePartService, viewId);
            if (!viewId) {
                return;
            }
            const moveFocusedViewAction = new MoveFocusedViewAction();
            instantiationService.invokeFunction(accessor => moveFocusedViewAction.run(accessor, viewId));
        }
        catch { }
    }
    getViewItems(viewDescriptorService, paneCompositePartService) {
        const results = [];
        const viewlets = paneCompositePartService.getVisiblePaneCompositeIds(0 /* ViewContainerLocation.Sidebar */);
        viewlets.forEach(viewletId => {
            const container = viewDescriptorService.getViewContainerById(viewletId);
            const containerModel = viewDescriptorService.getViewContainerModel(container);
            let hasAddedView = false;
            containerModel.visibleViewDescriptors.forEach(viewDescriptor => {
                if (viewDescriptor.canMoveView) {
                    if (!hasAddedView) {
                        results.push({
                            type: 'separator',
                            label: localize('sidebarContainer', "Side Bar / {0}", containerModel.title)
                        });
                        hasAddedView = true;
                    }
                    results.push({
                        id: viewDescriptor.id,
                        label: viewDescriptor.name.value
                    });
                }
            });
        });
        const panels = paneCompositePartService.getPinnedPaneCompositeIds(1 /* ViewContainerLocation.Panel */);
        panels.forEach(panel => {
            const container = viewDescriptorService.getViewContainerById(panel);
            const containerModel = viewDescriptorService.getViewContainerModel(container);
            let hasAddedView = false;
            containerModel.visibleViewDescriptors.forEach(viewDescriptor => {
                if (viewDescriptor.canMoveView) {
                    if (!hasAddedView) {
                        results.push({
                            type: 'separator',
                            label: localize('panelContainer', "Panel / {0}", containerModel.title)
                        });
                        hasAddedView = true;
                    }
                    results.push({
                        id: viewDescriptor.id,
                        label: viewDescriptor.name.value
                    });
                }
            });
        });
        const sidePanels = paneCompositePartService.getPinnedPaneCompositeIds(2 /* ViewContainerLocation.AuxiliaryBar */);
        sidePanels.forEach(panel => {
            const container = viewDescriptorService.getViewContainerById(panel);
            const containerModel = viewDescriptorService.getViewContainerModel(container);
            let hasAddedView = false;
            containerModel.visibleViewDescriptors.forEach(viewDescriptor => {
                if (viewDescriptor.canMoveView) {
                    if (!hasAddedView) {
                        results.push({
                            type: 'separator',
                            label: localize('secondarySideBarContainer', "Secondary Side Bar / {0}", containerModel.title)
                        });
                        hasAddedView = true;
                    }
                    results.push({
                        id: viewDescriptor.id,
                        label: viewDescriptor.name.value
                    });
                }
            });
        });
        return results;
    }
    async getView(quickInputService, viewDescriptorService, paneCompositePartService, viewId) {
        const disposables = new DisposableStore();
        const quickPick = disposables.add(quickInputService.createQuickPick({ useSeparators: true }));
        quickPick.placeholder = localize('moveFocusedView.selectView', "Select a View to Move");
        quickPick.items = this.getViewItems(viewDescriptorService, paneCompositePartService);
        quickPick.selectedItems = quickPick.items.filter(item => item.id === viewId);
        return new Promise((resolve, reject) => {
            disposables.add(quickPick.onDidAccept(() => {
                const viewId = quickPick.selectedItems[0];
                if (viewId.id) {
                    resolve(viewId.id);
                }
                else {
                    reject();
                }
                quickPick.hide();
            }));
            disposables.add(quickPick.onDidHide(() => {
                disposables.dispose();
                reject();
            }));
            quickPick.show();
        });
    }
});
// --- Move Focused View
class MoveFocusedViewAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.moveFocusedView',
            title: localize2('moveFocusedView', "Move Focused View"),
            category: Categories.View,
            precondition: FocusedViewContext.notEqualsTo(''),
            f1: true
        });
    }
    run(accessor, viewId) {
        const viewDescriptorService = accessor.get(IViewDescriptorService);
        const viewsService = accessor.get(IViewsService);
        const quickInputService = accessor.get(IQuickInputService);
        const contextKeyService = accessor.get(IContextKeyService);
        const dialogService = accessor.get(IDialogService);
        const paneCompositePartService = accessor.get(IPaneCompositePartService);
        const focusedViewId = viewId || FocusedViewContext.getValue(contextKeyService);
        if (focusedViewId === undefined || focusedViewId.trim() === '') {
            dialogService.error(localize('moveFocusedView.error.noFocusedView', "There is no view currently focused."));
            return;
        }
        const viewDescriptor = viewDescriptorService.getViewDescriptorById(focusedViewId);
        if (!viewDescriptor?.canMoveView) {
            dialogService.error(localize('moveFocusedView.error.nonMovableView', "The currently focused view is not movable."));
            return;
        }
        const disposables = new DisposableStore();
        const quickPick = disposables.add(quickInputService.createQuickPick({ useSeparators: true }));
        quickPick.placeholder = localize('moveFocusedView.selectDestination', "Select a Destination for the View");
        quickPick.title = localize({ key: 'moveFocusedView.title', comment: ['{0} indicates the title of the view the user has selected to move.'] }, "View: Move {0}", viewDescriptor.name.value);
        const items = [];
        const currentContainer = viewDescriptorService.getViewContainerByViewId(focusedViewId);
        const currentLocation = viewDescriptorService.getViewLocationById(focusedViewId);
        const isViewSolo = viewDescriptorService.getViewContainerModel(currentContainer).allViewDescriptors.length === 1;
        if (!(isViewSolo && currentLocation === 1 /* ViewContainerLocation.Panel */)) {
            items.push({
                id: '_.panel.newcontainer',
                label: localize({ key: 'moveFocusedView.newContainerInPanel', comment: ['Creates a new top-level tab in the panel.'] }, "New Panel Entry"),
            });
        }
        if (!(isViewSolo && currentLocation === 0 /* ViewContainerLocation.Sidebar */)) {
            items.push({
                id: '_.sidebar.newcontainer',
                label: localize('moveFocusedView.newContainerInSidebar', "New Side Bar Entry")
            });
        }
        if (!(isViewSolo && currentLocation === 2 /* ViewContainerLocation.AuxiliaryBar */)) {
            items.push({
                id: '_.auxiliarybar.newcontainer',
                label: localize('moveFocusedView.newContainerInSidePanel', "New Secondary Side Bar Entry")
            });
        }
        items.push({
            type: 'separator',
            label: localize('sidebar', "Side Bar")
        });
        const pinnedViewlets = paneCompositePartService.getVisiblePaneCompositeIds(0 /* ViewContainerLocation.Sidebar */);
        items.push(...pinnedViewlets
            .filter(viewletId => {
            if (viewletId === viewDescriptorService.getViewContainerByViewId(focusedViewId).id) {
                return false;
            }
            return !viewDescriptorService.getViewContainerById(viewletId).rejectAddedViews;
        })
            .map(viewletId => {
            return {
                id: viewletId,
                label: viewDescriptorService.getViewContainerModel(viewDescriptorService.getViewContainerById(viewletId)).title
            };
        }));
        items.push({
            type: 'separator',
            label: localize('panel', "Panel")
        });
        const pinnedPanels = paneCompositePartService.getPinnedPaneCompositeIds(1 /* ViewContainerLocation.Panel */);
        items.push(...pinnedPanels
            .filter(panel => {
            if (panel === viewDescriptorService.getViewContainerByViewId(focusedViewId).id) {
                return false;
            }
            return !viewDescriptorService.getViewContainerById(panel).rejectAddedViews;
        })
            .map(panel => {
            return {
                id: panel,
                label: viewDescriptorService.getViewContainerModel(viewDescriptorService.getViewContainerById(panel)).title
            };
        }));
        items.push({
            type: 'separator',
            label: localize('secondarySideBar', "Secondary Side Bar")
        });
        const pinnedAuxPanels = paneCompositePartService.getPinnedPaneCompositeIds(2 /* ViewContainerLocation.AuxiliaryBar */);
        items.push(...pinnedAuxPanels
            .filter(panel => {
            if (panel === viewDescriptorService.getViewContainerByViewId(focusedViewId).id) {
                return false;
            }
            return !viewDescriptorService.getViewContainerById(panel).rejectAddedViews;
        })
            .map(panel => {
            return {
                id: panel,
                label: viewDescriptorService.getViewContainerModel(viewDescriptorService.getViewContainerById(panel)).title
            };
        }));
        quickPick.items = items;
        disposables.add(quickPick.onDidAccept(() => {
            const destination = quickPick.selectedItems[0];
            if (destination.id === '_.panel.newcontainer') {
                viewDescriptorService.moveViewToLocation(viewDescriptor, 1 /* ViewContainerLocation.Panel */, this.desc.id);
                viewsService.openView(focusedViewId, true);
            }
            else if (destination.id === '_.sidebar.newcontainer') {
                viewDescriptorService.moveViewToLocation(viewDescriptor, 0 /* ViewContainerLocation.Sidebar */, this.desc.id);
                viewsService.openView(focusedViewId, true);
            }
            else if (destination.id === '_.auxiliarybar.newcontainer') {
                viewDescriptorService.moveViewToLocation(viewDescriptor, 2 /* ViewContainerLocation.AuxiliaryBar */, this.desc.id);
                viewsService.openView(focusedViewId, true);
            }
            else if (destination.id) {
                viewDescriptorService.moveViewsToContainer([viewDescriptor], viewDescriptorService.getViewContainerById(destination.id), undefined, this.desc.id);
                viewsService.openView(focusedViewId, true);
            }
            quickPick.hide();
        }));
        disposables.add(quickPick.onDidHide(() => disposables.dispose()));
        quickPick.show();
    }
}
registerAction2(MoveFocusedViewAction);
// --- Reset Focused View Location
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.resetFocusedViewLocation',
            title: localize2('resetFocusedViewLocation', "Reset Focused View Location"),
            category: Categories.View,
            f1: true,
            precondition: FocusedViewContext.notEqualsTo('')
        });
    }
    run(accessor) {
        const viewDescriptorService = accessor.get(IViewDescriptorService);
        const contextKeyService = accessor.get(IContextKeyService);
        const dialogService = accessor.get(IDialogService);
        const viewsService = accessor.get(IViewsService);
        const focusedViewId = FocusedViewContext.getValue(contextKeyService);
        let viewDescriptor = null;
        if (focusedViewId !== undefined && focusedViewId.trim() !== '') {
            viewDescriptor = viewDescriptorService.getViewDescriptorById(focusedViewId);
        }
        if (!viewDescriptor) {
            dialogService.error(localize('resetFocusedView.error.noFocusedView', "There is no view currently focused."));
            return;
        }
        const defaultContainer = viewDescriptorService.getDefaultContainerById(viewDescriptor.id);
        if (!defaultContainer || defaultContainer === viewDescriptorService.getViewContainerByViewId(viewDescriptor.id)) {
            return;
        }
        viewDescriptorService.moveViewsToContainer([viewDescriptor], defaultContainer, undefined, this.desc.id);
        viewsService.openView(viewDescriptor.id, true);
    }
});
// --- Resize View
class BaseResizeViewAction extends Action2 {
    static { this.RESIZE_INCREMENT = 60; } // This is a css pixel size
    resizePart(widthChange, heightChange, layoutService, partToResize) {
        if (layoutService.activeContainer !== layoutService.mainContainer) {
            return; // we do not support resizing in auxiliary windows
        }
        let part;
        if (partToResize === undefined) {
            const isEditorFocus = layoutService.hasFocus("workbench.parts.editor" /* Parts.EDITOR_PART */);
            const isSidebarFocus = layoutService.hasFocus("workbench.parts.sidebar" /* Parts.SIDEBAR_PART */);
            const isPanelFocus = layoutService.hasFocus("workbench.parts.panel" /* Parts.PANEL_PART */);
            const isAuxiliaryBarFocus = layoutService.hasFocus("workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */);
            if (isSidebarFocus) {
                part = "workbench.parts.sidebar" /* Parts.SIDEBAR_PART */;
            }
            else if (isPanelFocus) {
                part = "workbench.parts.panel" /* Parts.PANEL_PART */;
            }
            else if (isEditorFocus) {
                part = "workbench.parts.editor" /* Parts.EDITOR_PART */;
            }
            else if (isAuxiliaryBarFocus) {
                part = "workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */;
            }
        }
        else {
            part = partToResize;
        }
        if (part) {
            layoutService.resizePart(part, widthChange, heightChange);
        }
    }
}
class IncreaseViewSizeAction extends BaseResizeViewAction {
    constructor() {
        super({
            id: 'workbench.action.increaseViewSize',
            title: localize2('increaseViewSize', 'Increase Current View Size'),
            f1: true,
            precondition: IsAuxiliaryWindowFocusedContext.toNegated()
        });
    }
    run(accessor) {
        this.resizePart(BaseResizeViewAction.RESIZE_INCREMENT, BaseResizeViewAction.RESIZE_INCREMENT, accessor.get(IWorkbenchLayoutService));
    }
}
class IncreaseViewWidthAction extends BaseResizeViewAction {
    constructor() {
        super({
            id: 'workbench.action.increaseViewWidth',
            title: localize2('increaseEditorWidth', 'Increase Editor Width'),
            f1: true,
            precondition: IsAuxiliaryWindowFocusedContext.toNegated()
        });
    }
    run(accessor) {
        this.resizePart(BaseResizeViewAction.RESIZE_INCREMENT, 0, accessor.get(IWorkbenchLayoutService), "workbench.parts.editor" /* Parts.EDITOR_PART */);
    }
}
class IncreaseViewHeightAction extends BaseResizeViewAction {
    constructor() {
        super({
            id: 'workbench.action.increaseViewHeight',
            title: localize2('increaseEditorHeight', 'Increase Editor Height'),
            f1: true,
            precondition: IsAuxiliaryWindowFocusedContext.toNegated()
        });
    }
    run(accessor) {
        this.resizePart(0, BaseResizeViewAction.RESIZE_INCREMENT, accessor.get(IWorkbenchLayoutService), "workbench.parts.editor" /* Parts.EDITOR_PART */);
    }
}
class DecreaseViewSizeAction extends BaseResizeViewAction {
    constructor() {
        super({
            id: 'workbench.action.decreaseViewSize',
            title: localize2('decreaseViewSize', 'Decrease Current View Size'),
            f1: true,
            precondition: IsAuxiliaryWindowFocusedContext.toNegated()
        });
    }
    run(accessor) {
        this.resizePart(-BaseResizeViewAction.RESIZE_INCREMENT, -BaseResizeViewAction.RESIZE_INCREMENT, accessor.get(IWorkbenchLayoutService));
    }
}
class DecreaseViewWidthAction extends BaseResizeViewAction {
    constructor() {
        super({
            id: 'workbench.action.decreaseViewWidth',
            title: localize2('decreaseEditorWidth', 'Decrease Editor Width'),
            f1: true,
            precondition: IsAuxiliaryWindowFocusedContext.toNegated()
        });
    }
    run(accessor) {
        this.resizePart(-BaseResizeViewAction.RESIZE_INCREMENT, 0, accessor.get(IWorkbenchLayoutService), "workbench.parts.editor" /* Parts.EDITOR_PART */);
    }
}
class DecreaseViewHeightAction extends BaseResizeViewAction {
    constructor() {
        super({
            id: 'workbench.action.decreaseViewHeight',
            title: localize2('decreaseEditorHeight', 'Decrease Editor Height'),
            f1: true,
            precondition: IsAuxiliaryWindowFocusedContext.toNegated()
        });
    }
    run(accessor) {
        this.resizePart(0, -BaseResizeViewAction.RESIZE_INCREMENT, accessor.get(IWorkbenchLayoutService), "workbench.parts.editor" /* Parts.EDITOR_PART */);
    }
}
registerAction2(IncreaseViewSizeAction);
registerAction2(IncreaseViewWidthAction);
registerAction2(IncreaseViewHeightAction);
registerAction2(DecreaseViewSizeAction);
registerAction2(DecreaseViewWidthAction);
registerAction2(DecreaseViewHeightAction);
//#region Quick Input Alignment Actions
registerAction2(class AlignQuickInputTopAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.alignQuickInputTop',
            title: localize2('alignQuickInputTop', 'Align Quick Input Top'),
            f1: false
        });
    }
    run(accessor) {
        const quickInputService = accessor.get(IQuickInputService);
        quickInputService.setAlignment('top');
    }
});
registerAction2(class AlignQuickInputCenterAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.alignQuickInputCenter',
            title: localize2('alignQuickInputCenter', 'Align Quick Input Center'),
            f1: false
        });
    }
    run(accessor) {
        const quickInputService = accessor.get(IQuickInputService);
        quickInputService.setAlignment('center');
    }
});
function isContextualLayoutVisualIcon(icon) {
    return icon.iconA !== undefined;
}
const CreateToggleLayoutItem = (id, active, label, visualIcon) => {
    return {
        id,
        active,
        label,
        visualIcon,
        activeIcon: Codicon.eye,
        inactiveIcon: Codicon.eyeClosed,
        activeAriaLabel: localize('selectToHide', "Select to Hide"),
        inactiveAriaLabel: localize('selectToShow', "Select to Show"),
        useButtons: true,
    };
};
const CreateOptionLayoutItem = (id, active, label, visualIcon) => {
    return {
        id,
        active,
        label,
        visualIcon,
        activeIcon: Codicon.check,
        activeAriaLabel: localize('active', "Active"),
        useButtons: false
    };
};
const MenuBarToggledContext = ContextKeyExpr.and(IsMacNativeContext.toNegated(), ContextKeyExpr.notEquals(`config.${"window.menuBarVisibility" /* MenuSettings.MenuBarVisibility */}`, 'hidden'), ContextKeyExpr.notEquals(`config.${"window.menuBarVisibility" /* MenuSettings.MenuBarVisibility */}`, 'toggle'), ContextKeyExpr.notEquals(`config.${"window.menuBarVisibility" /* MenuSettings.MenuBarVisibility */}`, 'compact'));
const ToggleVisibilityActions = [];
if (!isMacintosh || !isNative) {
    ToggleVisibilityActions.push(CreateToggleLayoutItem('workbench.action.toggleMenuBar', MenuBarToggledContext, localize('menuBar', "Menu Bar"), menubarIcon));
}
ToggleVisibilityActions.push(...[
    CreateToggleLayoutItem(ToggleActivityBarVisibilityActionId, ContextKeyExpr.notEquals('config.workbench.activityBar.location', 'hidden'), localize('activityBar', "Activity Bar"), { whenA: ContextKeyExpr.equals('config.workbench.sideBar.location', 'left'), iconA: activityBarLeftIcon, iconB: activityBarRightIcon }),
    CreateToggleLayoutItem(ToggleSidebarVisibilityAction.ID, SideBarVisibleContext, localize('sideBar', "Primary Side Bar"), { whenA: ContextKeyExpr.equals('config.workbench.sideBar.location', 'left'), iconA: panelLeftIcon, iconB: panelRightIcon }),
    CreateToggleLayoutItem(ToggleAuxiliaryBarAction.ID, AuxiliaryBarVisibleContext, localize('secondarySideBar', "Secondary Side Bar"), { whenA: ContextKeyExpr.equals('config.workbench.sideBar.location', 'left'), iconA: panelRightIcon, iconB: panelLeftIcon }),
    CreateToggleLayoutItem(TogglePanelAction.ID, PanelVisibleContext, localize('panel', "Panel"), panelIcon),
    CreateToggleLayoutItem(ToggleStatusbarVisibilityAction.ID, ContextKeyExpr.equals('config.workbench.statusBar.visible', true), localize('statusBar', "Status Bar"), statusBarIcon),
]);
const MoveSideBarActions = [
    CreateOptionLayoutItem(MoveSidebarLeftAction.ID, ContextKeyExpr.equals('config.workbench.sideBar.location', 'left'), localize('leftSideBar', "Left"), panelLeftIcon),
    CreateOptionLayoutItem(MoveSidebarRightAction.ID, ContextKeyExpr.equals('config.workbench.sideBar.location', 'right'), localize('rightSideBar', "Right"), panelRightIcon),
];
const AlignPanelActions = [
    CreateOptionLayoutItem('workbench.action.alignPanelLeft', PanelAlignmentContext.isEqualTo('left'), localize('leftPanel', "Left"), panelAlignmentLeftIcon),
    CreateOptionLayoutItem('workbench.action.alignPanelRight', PanelAlignmentContext.isEqualTo('right'), localize('rightPanel', "Right"), panelAlignmentRightIcon),
    CreateOptionLayoutItem('workbench.action.alignPanelCenter', PanelAlignmentContext.isEqualTo('center'), localize('centerPanel', "Center"), panelAlignmentCenterIcon),
    CreateOptionLayoutItem('workbench.action.alignPanelJustify', PanelAlignmentContext.isEqualTo('justify'), localize('justifyPanel', "Justify"), panelAlignmentJustifyIcon),
];
const QuickInputActions = [
    CreateOptionLayoutItem('workbench.action.alignQuickInputTop', QuickInputAlignmentContextKey.isEqualTo('top'), localize('top', "Top"), quickInputAlignmentTopIcon),
    CreateOptionLayoutItem('workbench.action.alignQuickInputCenter', QuickInputAlignmentContextKey.isEqualTo('center'), localize('center', "Center"), quickInputAlignmentCenterIcon),
];
const MiscLayoutOptions = [
    CreateOptionLayoutItem('workbench.action.toggleFullScreen', IsMainWindowFullscreenContext, localize('fullscreen', "Full Screen"), fullscreenIcon),
    CreateOptionLayoutItem('workbench.action.toggleZenMode', InEditorZenModeContext, localize('zenMode', "Zen Mode"), zenModeIcon),
    CreateOptionLayoutItem('workbench.action.toggleCenteredLayout', IsMainEditorCenteredLayoutContext, localize('centeredLayout', "Centered Layout"), centerLayoutIcon),
];
const LayoutContextKeySet = new Set();
for (const { active } of [...ToggleVisibilityActions, ...MoveSideBarActions, ...AlignPanelActions, ...QuickInputActions, ...MiscLayoutOptions]) {
    for (const key of active.keys()) {
        LayoutContextKeySet.add(key);
    }
}
registerAction2(class CustomizeLayoutAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.customizeLayout',
            title: localize2('customizeLayout', "Customize Layout..."),
            f1: true,
            icon: configureLayoutIcon,
            menu: [
                {
                    id: MenuId.LayoutControlMenuSubmenu,
                    group: 'z_end',
                },
                {
                    id: MenuId.LayoutControlMenu,
                    when: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), ContextKeyExpr.equals('config.workbench.layoutControl.type', 'both')),
                    group: '1_layout'
                }
            ]
        });
    }
    getItems(contextKeyService, keybindingService) {
        const toQuickPickItem = (item) => {
            const toggled = item.active.evaluate(contextKeyService.getContext(null));
            let label = item.useButtons ?
                item.label :
                item.label + (toggled && item.activeIcon ? ` $(${item.activeIcon.id})` : (!toggled && item.inactiveIcon ? ` $(${item.inactiveIcon.id})` : ''));
            const ariaLabel = item.label + (toggled && item.activeAriaLabel ? ` (${item.activeAriaLabel})` : (!toggled && item.inactiveAriaLabel ? ` (${item.inactiveAriaLabel})` : ''));
            if (item.visualIcon) {
                let icon = item.visualIcon;
                if (isContextualLayoutVisualIcon(icon)) {
                    const useIconA = icon.whenA.evaluate(contextKeyService.getContext(null));
                    icon = useIconA ? icon.iconA : icon.iconB;
                }
                label = `$(${icon.id}) ${label}`;
            }
            const icon = toggled ? item.activeIcon : item.inactiveIcon;
            return {
                type: 'item',
                id: item.id,
                label,
                ariaLabel,
                keybinding: keybindingService.lookupKeybinding(item.id, contextKeyService),
                buttons: !item.useButtons ? undefined : [
                    {
                        alwaysVisible: false,
                        tooltip: ariaLabel,
                        iconClass: icon ? ThemeIcon.asClassName(icon) : undefined
                    }
                ]
            };
        };
        return [
            {
                type: 'separator',
                label: localize('toggleVisibility', "Visibility")
            },
            ...ToggleVisibilityActions.map(toQuickPickItem),
            {
                type: 'separator',
                label: localize('sideBarPosition', "Primary Side Bar Position")
            },
            ...MoveSideBarActions.map(toQuickPickItem),
            {
                type: 'separator',
                label: localize('panelAlignment', "Panel Alignment")
            },
            ...AlignPanelActions.map(toQuickPickItem),
            {
                type: 'separator',
                label: localize('quickOpen', "Quick Input Position")
            },
            ...QuickInputActions.map(toQuickPickItem),
            {
                type: 'separator',
                label: localize('layoutModes', "Modes"),
            },
            ...MiscLayoutOptions.map(toQuickPickItem),
        ];
    }
    run(accessor) {
        if (this._currentQuickPick) {
            this._currentQuickPick.hide();
            return;
        }
        const configurationService = accessor.get(IConfigurationService);
        const contextKeyService = accessor.get(IContextKeyService);
        const commandService = accessor.get(ICommandService);
        const quickInputService = accessor.get(IQuickInputService);
        const keybindingService = accessor.get(IKeybindingService);
        const disposables = new DisposableStore();
        const quickPick = disposables.add(quickInputService.createQuickPick({ useSeparators: true }));
        this._currentQuickPick = quickPick;
        quickPick.items = this.getItems(contextKeyService, keybindingService);
        quickPick.ignoreFocusOut = true;
        quickPick.hideInput = true;
        quickPick.title = localize('customizeLayoutQuickPickTitle', "Customize Layout");
        const closeButton = {
            alwaysVisible: true,
            iconClass: ThemeIcon.asClassName(Codicon.close),
            tooltip: localize('close', "Close")
        };
        const resetButton = {
            alwaysVisible: true,
            iconClass: ThemeIcon.asClassName(Codicon.discard),
            tooltip: localize('restore defaults', "Restore Defaults")
        };
        quickPick.buttons = [
            resetButton,
            closeButton
        ];
        let selectedItem = undefined;
        disposables.add(contextKeyService.onDidChangeContext(changeEvent => {
            if (changeEvent.affectsSome(LayoutContextKeySet)) {
                quickPick.items = this.getItems(contextKeyService, keybindingService);
                if (selectedItem) {
                    quickPick.activeItems = quickPick.items.filter(item => item.id === selectedItem?.id);
                }
                setTimeout(() => quickInputService.focus(), 0);
            }
        }));
        disposables.add(quickPick.onDidAccept(event => {
            if (quickPick.selectedItems.length) {
                selectedItem = quickPick.selectedItems[0];
                commandService.executeCommand(selectedItem.id);
            }
        }));
        disposables.add(quickPick.onDidTriggerItemButton(event => {
            if (event.item) {
                selectedItem = event.item;
                commandService.executeCommand(selectedItem.id);
            }
        }));
        disposables.add(quickPick.onDidTriggerButton((button) => {
            if (button === closeButton) {
                quickPick.hide();
            }
            else if (button === resetButton) {
                const resetSetting = (id) => {
                    const config = configurationService.inspect(id);
                    configurationService.updateValue(id, config.defaultValue);
                };
                // Reset all layout options
                resetSetting('workbench.activityBar.location');
                resetSetting('workbench.sideBar.location');
                resetSetting('workbench.statusBar.visible');
                resetSetting('workbench.panel.defaultLocation');
                if (!isMacintosh || !isNative) {
                    resetSetting('window.menuBarVisibility');
                }
                commandService.executeCommand('workbench.action.alignPanelCenter');
                commandService.executeCommand('workbench.action.alignQuickInputTop');
            }
        }));
        disposables.add(quickPick.onDidHide(() => {
            quickPick.dispose();
        }));
        disposables.add(quickPick.onDispose(() => {
            this._currentQuickPick = undefined;
            disposables.dispose();
        }));
        quickPick.show();
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGF5b3V0QWN0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9icm93c2VyL2FjdGlvbnMvbGF5b3V0QWN0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQW9CLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUN4RSxPQUFPLEVBQUUsTUFBTSxFQUFFLFlBQVksRUFBRSxlQUFlLEVBQUUsT0FBTyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDN0csT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUM5RCxPQUFPLEVBQXlDLHVCQUF1QixFQUFvRCxnQkFBZ0IsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3BNLE9BQU8sRUFBb0IscUJBQXFCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUNsSCxPQUFPLEVBQW1CLFFBQVEsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxXQUFXLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDcEcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDeEYsT0FBTyxFQUFFLG1CQUFtQixFQUFvQixNQUFNLDREQUE0RCxDQUFDO0FBQ25ILE9BQU8sRUFBRSxjQUFjLEVBQXdCLGtCQUFrQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDN0gsT0FBTyxFQUFFLHNCQUFzQixFQUEwQyw2QkFBNkIsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ3RJLE9BQU8sRUFB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