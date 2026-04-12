/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var ActivitybarPart_1;
import './media/activitybarpart.css';
import './media/activityaction.css';
import { localize, localize2 } from '../../../../nls.js';
import { Part } from '../../part.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ToggleSidebarPositionAction, ToggleSidebarVisibilityAction } from '../../actions/layoutActions.js';
import { IThemeService, registerThemingParticipant } from '../../../../platform/theme/common/themeService.js';
import { ACTIVITY_BAR_BACKGROUND, ACTIVITY_BAR_BORDER, ACTIVITY_BAR_FOREGROUND, ACTIVITY_BAR_ACTIVE_BORDER, ACTIVITY_BAR_BADGE_BACKGROUND, ACTIVITY_BAR_BADGE_FOREGROUND, ACTIVITY_BAR_INACTIVE_FOREGROUND, ACTIVITY_BAR_ACTIVE_BACKGROUND, ACTIVITY_BAR_DRAG_AND_DROP_BORDER, ACTIVITY_BAR_ACTIVE_FOCUS_BORDER } from '../../../common/theme.js';
import { activeContrastBorder, contrastBorder, focusBorder } from '../../../../platform/theme/common/colorRegistry.js';
import { addDisposableListener, append, EventType, isAncestor, $, clearNode } from '../../../../base/browser/dom.js';
import { assertReturnsDefined } from '../../../../base/common/types.js';
import { CustomMenubarControl } from '../titlebar/menubarControl.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { getMenuBarVisibility } from '../../../../platform/window/common/window.js';
import { Separator, SubmenuAction, toAction } from '../../../../base/common/actions.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { PaneCompositeBar } from '../paneCompositeBar.js';
import { GlobalCompositeBar } from '../globalCompositeBar.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { Action2, IMenuService, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IsSessionsWindowContext } from '../../../common/contextkeys.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { getContextMenuActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IViewDescriptorService, ViewContainerLocationToString } from '../../../common/views.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { SwitchCompositeViewAction } from '../compositeBarActions.js';
let ActivitybarPart = class ActivitybarPart extends Part {
    static { ActivitybarPart_1 = this; }
    static { this.ACTION_HEIGHT = 48; }
    static { this.COMPACT_ACTION_HEIGHT = 32; }
    static { this.ACTIVITYBAR_WIDTH = 48; }
    static { this.COMPACT_ACTIVITYBAR_WIDTH = 36; }
    static { this.ICON_SIZE = 24; }
    static { this.COMPACT_ICON_SIZE = 16; }
    static { this.pinnedViewContainersKey = 'workbench.activity.pinnedViewlets2'; }
    static { this.placeholderViewContainersKey = 'workbench.activity.placeholderViewlets'; }
    static { this.viewContainersWorkspaceStateKey = 'workbench.activity.viewletsWorkspaceState'; }
    //#region IView
    get minimumWidth() { return this._isCompact ? ActivitybarPart_1.COMPACT_ACTIVITYBAR_WIDTH : ActivitybarPart_1.ACTIVITYBAR_WIDTH; }
    get maximumWidth() { return this._isCompact ? ActivitybarPart_1.COMPACT_ACTIVITYBAR_WIDTH : ActivitybarPart_1.ACTIVITYBAR_WIDTH; }
    constructor(location, paneCompositePart, instantiationService, layoutService, themeService, storageService, configurationService) {
        super("workbench.parts.activitybar" /* Parts.ACTIVITYBAR_PART */, { hasTitle: false }, themeService, storageService, layoutService);
        this.location = location;
        this.paneCompositePart = paneCompositePart;
        this.instantiationService = instantiationService;
        this.configurationService = configurationService;
        this.minimumHeight = 0;
        this.maximumHeight = Number.POSITIVE_INFINITY;
        //#endregion
        this.compositeBar = this._register(new MutableDisposable());
        this._isCompact = this.configurationService.getValue("workbench.activityBar.compact" /* LayoutSettings.ACTIVITY_BAR_COMPACT */) ?? false;
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration("workbench.activityBar.compact" /* LayoutSettings.ACTIVITY_BAR_COMPACT */)) {
                this._isCompact = this.configurationService.getValue("workbench.activityBar.compact" /* LayoutSettings.ACTIVITY_BAR_COMPACT */) ?? false;
                this.updateCompactStyle();
                this.recreateCompositeBar();
                this._onDidChange.fire(undefined); // Signal grid that size constraints changed
            }
        }));
    }
    updateCompactStyle() {
        if (this.element) {
            this.element.classList.toggle('compact', this._isCompact);
            this.element.style.setProperty('--activity-bar-width', `${this.minimumWidth}px`);
            this.element.style.setProperty('--activity-bar-action-height', `${this._isCompact ? ActivitybarPart_1.COMPACT_ACTION_HEIGHT : ActivitybarPart_1.ACTION_HEIGHT}px`);
            this.element.style.setProperty('--activity-bar-icon-size', `${this._isCompact ? ActivitybarPart_1.COMPACT_ICON_SIZE : ActivitybarPart_1.ICON_SIZE}px`);
        }
    }
    recreateCompositeBar() {
        if (!this.content || !this.compositeBar.value) {
            return;
        }
        this.compositeBar.clear();
        clearNode(this.content);
        this.compositeBar.value = this.createCompositeBar();
        this.compositeBar.value.create(this.content);
        if (this.dimension) {
            this.layout(this.dimension.width, this.dimension.height);
        }
    }
    createCompositeBar() {
        const actionHeight = this._isCompact ? ActivitybarPart_1.COMPACT_ACTION_HEIGHT : ActivitybarPart_1.ACTION_HEIGHT;
        const iconSize = this._isCompact ? ActivitybarPart_1.COMPACT_ICON_SIZE : ActivitybarPart_1.ICON_SIZE;
        return this.instantiationService.createInstance(ActivityBarCompositeBar, this.location, {
            partContainerClass: 'activitybar',
            pinnedViewContainersKey: ActivitybarPart_1.pinnedViewContainersKey,
            placeholderViewContainersKey: ActivitybarPart_1.placeholderViewContainersKey,
            viewContainersWorkspaceStateKey: ActivitybarPart_1.viewContainersWorkspaceStateKey,
            orientation: 1 /* ActionsOrientation.VERTICAL */,
            icon: true,
            iconSize,
            activityHoverOptions: {
                position: () => this.layoutService.getSideBarPosition() === 0 /* Position.LEFT */ ? 1 /* HoverPosition.RIGHT */ : 0 /* HoverPosition.LEFT */,
            },
            preventLoopNavigation: true,
            recomputeSizes: false,
            fillExtraContextMenuActions: (actions, e) => { },
            compositeSize: 52,
            colors: (theme) => ({
                activeForegroundColor: theme.getColor(ACTIVITY_BAR_FOREGROUND),
                inactiveForegroundColor: theme.getColor(ACTIVITY_BAR_INACTIVE_FOREGROUND),
                activeBorderColor: theme.getColor(ACTIVITY_BAR_ACTIVE_BORDER),
                activeBackground: theme.getColor(ACTIVITY_BAR_ACTIVE_BACKGROUND),
                badgeBackground: theme.getColor(ACTIVITY_BAR_BADGE_BACKGROUND),
                badgeForeground: theme.getColor(ACTIVITY_BAR_BADGE_FOREGROUND),
                dragAndDropBorder: theme.getColor(ACTIVITY_BAR_DRAG_AND_DROP_BORDER),
                activeBackgroundColor: undefined, inactiveBackgroundColor: undefined, activeBorderBottomColor: undefined,
            }),
            overflowActionSize: actionHeight,
        }, "workbench.parts.activitybar" /* Parts.ACTIVITYBAR_PART */, this.paneCompositePart, true);
    }
    createContentArea(parent) {
        this.element = parent;
        this.content = append(this.element, $('.content'));
        this.updateCompactStyle();
        if (this.layoutService.isVisible("workbench.parts.activitybar" /* Parts.ACTIVITYBAR_PART */)) {
            this.show();
        }
        return this.content;
    }
    getPinnedPaneCompositeIds() {
        return this.compositeBar.value?.getPinnedPaneCompositeIds() ?? [];
    }
    getVisiblePaneCompositeIds() {
        return this.compositeBar.value?.getVisiblePaneCompositeIds() ?? [];
    }
    getPaneCompositeIds() {
        return this.compositeBar.value?.getPaneCompositeIds() ?? [];
    }
    focus() {
        this.compositeBar.value?.focus();
    }
    updateStyles() {
        super.updateStyles();
        const container = assertReturnsDefined(this.getContainer());
        const background = this.getColor(ACTIVITY_BAR_BACKGROUND) || '';
        container.style.backgroundColor = background;
        const borderColor = this.getColor(ACTIVITY_BAR_BORDER) || this.getColor(contrastBorder) || '';
        container.classList.toggle('bordered', !!borderColor);
        container.style.borderColor = borderColor ? borderColor : '';
    }
    show(focus) {
        if (!this.content) {
            return;
        }
        if (!this.compositeBar.value) {
            this.compositeBar.value = this.createCompositeBar();
            this.compositeBar.value.create(this.content);
            if (this.dimension) {
                this.layout(this.dimension.width, this.dimension.height);
            }
        }
        if (focus) {
            this.focus();
        }
    }
    hide() {
        if (!this.compositeBar.value) {
            return;
        }
        this.compositeBar.clear();
        if (this.content) {
            clearNode(this.content);
        }
    }
    layout(width, height) {
        super.layout(width, height, 0, 0);
        if (!this.compositeBar.value) {
            return;
        }
        // Layout contents
        const contentAreaSize = super.layoutContents(width, height).contentSize;
        // Layout composite bar
        this.compositeBar.value.layout(width, contentAreaSize.height);
    }
    toJSON() {
        return {
            type: "workbench.parts.activitybar" /* Parts.ACTIVITYBAR_PART */
        };
    }
};
ActivitybarPart = ActivitybarPart_1 = __decorate([
    __param(2, IInstantiationService),
    __param(3, IWorkbenchLayoutService),
    __param(4, IThemeService),
    __param(5, IStorageService),
    __param(6, IConfigurationService)
], ActivitybarPart);
export { ActivitybarPart };
let ActivityBarCompositeBar = class ActivityBarCompositeBar extends PaneCompositeBar {
    constructor(location, options, part, paneCompositePart, showGlobalActivities, instantiationService, storageService, extensionService, viewDescriptorService, viewService, contextKeyService, environmentService, configurationService, menuService, layoutService) {
        super(location, {
            ...options,
            fillExtraContextMenuActions: (actions, e) => {
                options.fillExtraContextMenuActions(actions, e);
                this.fillContextMenuActions(actions, e);
            }
        }, part, paneCompositePart, instantiationService, storageService, extensionService, viewDescriptorService, viewService, contextKeyService, environmentService, layoutService);
        this.configurationService = configurationService;
        this.menuService = menuService;
        this.menuBar = this._register(new MutableDisposable());
        this.keyboardNavigationDisposables = this._register(new DisposableStore());
        if (showGlobalActivities) {
            this.globalCompositeBar = this._register(instantiationService.createInstance(GlobalCompositeBar, () => this.getContextMenuActions(), (theme) => this.options.colors(theme), this.options.activityHoverOptions));
        }
        // Register for configuration changes
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration("window.menuBarVisibility" /* MenuSettings.MenuBarVisibility */)) {
                if (getMenuBarVisibility(this.configurationService) === 'compact') {
                    this.installMenubar();
                }
                else {
                    this.uninstallMenubar();
                }
            }
        }));
    }
    fillContextMenuActions(actions, e) {
        // Menu
        const menuBarVisibility = getMenuBarVisibility(this.configurationService);
        if (menuBarVisibility === 'compact' || menuBarVisibility === 'hidden' || menuBarVisibility === 'toggle') {
            actions.unshift(...[toAction({ id: 'toggleMenuVisibility', label: localize('menu', "Menu"), checked: menuBarVisibility === 'compact', run: () => this.configurationService.updateValue("window.menuBarVisibility" /* MenuSettings.MenuBarVisibility */, menuBarVisibility === 'compact' ? 'toggle' : 'compact') }), new Separator()]);
        }
        if (menuBarVisibility === 'compact' && this.menuBarContainer && e?.target) {
            if (isAncestor(e.target, this.menuBarContainer)) {
                actions.unshift(...[toAction({ id: 'hideCompactMenu', label: localize('hideMenu', "Hide Menu"), run: () => this.configurationService.updateValue("window.menuBarVisibility" /* MenuSettings.MenuBarVisibility */, 'toggle') }), new Separator()]);
            }
        }
        // Global Composite Bar
        if (this.globalCompositeBar) {
            actions.push(new Separator());
            actions.push(...this.globalCompositeBar.getContextMenuActions());
        }
        actions.push(new Separator());
        actions.push(...this.getActivityBarContextMenuActions());
    }
    uninstallMenubar() {
        if (this.menuBar.value) {
            this.menuBar.value = undefined;
        }
        if (this.menuBarContainer) {
            this.menuBarContainer.remove();
            this.menuBarContainer = undefined;
        }
    }
    installMenubar() {
        if (this.menuBar.value) {
            return; // prevent menu bar from installing twice #110720
        }
        this.menuBarContainer = $('.menubar');
        const content = assertReturnsDefined(this.element);
        content.prepend(this.menuBarContainer);
        // Menubar: install a custom menu bar depending on configuration
        this.menuBar.value = this._register(this.instantiationService.createInstance(CustomMenubarControl));
        this.menuBar.value.create(this.menuBarContainer);
    }
    registerKeyboardNavigationListeners() {
        this.keyboardNavigationDisposables.clear();
        // Up/Down or Left/Right arrow on compact menu
        if (this.menuBarContainer) {
            this.keyboardNavigationDisposables.add(addDisposableListener(this.menuBarContainer, EventType.KEY_DOWN, e => {
                const kbEvent = new StandardKeyboardEvent(e);
                if (kbEvent.equals(18 /* KeyCode.DownArrow */) || kbEvent.equals(17 /* KeyCode.RightArrow */)) {
                    this.focus();
                }
            }));
        }
        // Up/Down on Activity Icons
        if (this.compositeBarContainer) {
            this.keyboardNavigationDisposables.add(addDisposableListener(this.compositeBarContainer, EventType.KEY_DOWN, e => {
                const kbEvent = new StandardKeyboardEvent(e);
                if (kbEvent.equals(18 /* KeyCode.DownArrow */) || kbEvent.equals(17 /* KeyCode.RightArrow */)) {
                    this.globalCompositeBar?.focus();
                }
                else if (kbEvent.equals(16 /* KeyCode.UpArrow */) || kbEvent.equals(15 /* KeyCode.LeftArrow */)) {
                    this.menuBar.value?.toggleFocus();
                }
            }));
        }
        // Up arrow on global icons
        if (this.globalCompositeBar) {
            this.keyboardNavigationDisposables.add(addDisposableListener(this.globalCompositeBar.element, EventType.KEY_DOWN, e => {
                const kbEvent = new StandardKeyboardEvent(e);
                if (kbEvent.equals(16 /* KeyCode.UpArrow */) || kbEvent.equals(15 /* KeyCode.LeftArrow */)) {
                    this.focus(this.getVisiblePaneCompositeIds().length - 1);
                }
            }));
        }
    }
    create(parent) {
        this.element = parent;
        // Install menubar if compact
        if (getMenuBarVisibility(this.configurationService) === 'compact') {
            this.installMenubar();
        }
        // View Containers action bar
        this.compositeBarContainer = super.create(this.element);
        // Global action bar
        if (this.globalCompositeBar) {
            this.globalCompositeBar.create(this.element);
        }
        // Keyboard Navigation
        this.registerKeyboardNavigationListeners();
        return this.compositeBarContainer;
    }
    layout(width, height) {
        if (this.menuBarContainer) {
            if (this.options.orientation === 1 /* ActionsOrientation.VERTICAL */) {
                height -= this.menuBarContainer.clientHeight;
            }
            else {
                width -= this.menuBarContainer.clientWidth;
            }
        }
        if (this.globalCompositeBar) {
            if (this.options.orientation === 1 /* ActionsOrientation.VERTICAL */) {
                height -= (this.globalCompositeBar.size() * this.options.overflowActionSize);
            }
            else {
                width -= this.globalCompositeBar.element.clientWidth;
            }
        }
        super.layout(width, height);
    }
    getActivityBarContextMenuActions() {
        const activityBarPositionMenu = this.menuService.getMenuActions(MenuId.ActivityBarPositionMenu, this.contextKeyService, { shouldForwardArgs: true, renderShortTitle: true });
        const positionActions = getContextMenuActions(activityBarPositionMenu).secondary;
        const actions = [
            new SubmenuAction('workbench.action.activityBar.position', localize('activity bar position', "Activity Bar Position"), positionActions),
        ];
        // Show size submenu only when activity bar is in default position
        const activityBarPosition = this.configurationService.getValue("workbench.activityBar.location" /* LayoutSettings.ACTIVITY_BAR_LOCATION */);
        if (activityBarPosition === "default" /* ActivityBarPosition.DEFAULT */) {
            const isCompact = this.configurationService.getValue("workbench.activityBar.compact" /* LayoutSettings.ACTIVITY_BAR_COMPACT */) ?? false;
            const sizeActions = [
                toAction({ id: 'workbench.action.activityBar.size.default', label: localize('activityBarSizeDefault', "Default"), checked: !isCompact, run: () => this.configurationService.updateValue("workbench.activityBar.compact" /* LayoutSettings.ACTIVITY_BAR_COMPACT */, false) }),
                toAction({ id: 'workbench.action.activityBar.size.compact', label: localize('activityBarSizeCompact', "Compact"), checked: isCompact, run: () => this.configurationService.updateValue("workbench.activityBar.compact" /* LayoutSettings.ACTIVITY_BAR_COMPACT */, true) }),
            ];
            actions.push(new SubmenuAction('workbench.action.activityBar.size', localize('activity bar size', "Activity Bar Size"), sizeActions));
        }
        actions.push(toAction({ id: ToggleSidebarPositionAction.ID, label: ToggleSidebarPositionAction.getLabel(this.layoutService), run: () => this.instantiationService.invokeFunction(accessor => new ToggleSidebarPositionAction().run(accessor)) }));
        if (this.part === "workbench.parts.sidebar" /* Parts.SIDEBAR_PART */) {
            actions.push(toAction({ id: ToggleSidebarVisibilityAction.ID, label: ToggleSidebarVisibilityAction.LABEL, run: () => this.instantiationService.invokeFunction(accessor => new ToggleSidebarVisibilityAction().run(accessor)) }));
        }
        return actions;
    }
};
ActivityBarCompositeBar = __decorate([
    __param(5, IInstantiationService),
    __param(6, IStorageService),
    __param(7, IExtensionService),
    __param(8, IViewDescriptorService),
    __param(9, IViewsService),
    __param(10, IContextKeyService),
    __param(11, IWorkbenchEnvironmentService),
    __param(12, IConfigurationService),
    __param(13, IMenuService),
    __param(14, IWorkbenchLayoutService)
], ActivityBarCompositeBar);
export { ActivityBarCompositeBar };
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.activityBarLocation.default',
            title: {
                ...localize2('positionActivityBarDefault', 'Move Activity Bar to Side'),
                mnemonicTitle: localize({ key: 'miDefaultActivityBar', comment: ['&& denotes a mnemonic'] }, "&&Default"),
            },
            shortTitle: localize('default', "Default"),
            category: Categories.View,
            toggled: ContextKeyExpr.equals(`config.${"workbench.activityBar.location" /* LayoutSettings.ACTIVITY_BAR_LOCATION */}`, "default" /* ActivityBarPosition.DEFAULT */),
            menu: [{
                    id: MenuId.ActivityBarPositionMenu,
                    order: 1
                }, {
                    id: MenuId.CommandPalette,
                    when: ContextKeyExpr.and(ContextKeyExpr.notEquals(`config.${"workbench.activityBar.location" /* LayoutSettings.ACTIVITY_BAR_LOCATION */}`, "default" /* ActivityBarPosition.DEFAULT */), IsSessionsWindowContext.negate()),
                }]
        });
    }
    run(accessor) {
        const configurationService = accessor.get(IConfigurationService);
        configurationService.updateValue("workbench.activityBar.location" /* LayoutSettings.ACTIVITY_BAR_LOCATION */, "default" /* ActivityBarPosition.DEFAULT */);
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.activityBarLocation.top',
            title: {
                ...localize2('positionActivityBarTop', 'Move Activity Bar to Top'),
                mnemonicTitle: localize({ key: 'miTopActivityBar', comment: ['&& denotes a mnemonic'] }, "&&Top"),
            },
            shortTitle: localize('top', "Top"),
            category: Categories.View,
            toggled: ContextKeyExpr.equals(`config.${"workbench.activityBar.location" /* LayoutSettings.ACTIVITY_BAR_LOCATION */}`, "top" /* ActivityBarPosition.TOP */),
            menu: [{
                    id: MenuId.ActivityBarPositionMenu,
                    order: 2
                }, {
                    id: MenuId.CommandPalette,
                    when: ContextKeyExpr.and(ContextKeyExpr.notEquals(`config.${"workbench.activityBar.location" /* LayoutSettings.ACTIVITY_BAR_LOCATION */}`, "top" /* ActivityBarPosition.TOP */), IsSessionsWindowContext.negate()),
                }]
        });
    }
    run(accessor) {
        const configurationService = accessor.get(IConfigurationService);
        configurationService.updateValue("workbench.activityBar.location" /* LayoutSettings.ACTIVITY_BAR_LOCATION */, "top" /* ActivityBarPosition.TOP */);
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.activityBarLocation.bottom',
            title: {
                ...localize2('positionActivityBarBottom', 'Move Activity Bar to Bottom'),
                mnemonicTitle: localize({ key: 'miBottomActivityBar', comment: ['&& denotes a mnemonic'] }, "&&Bottom"),
            },
            shortTitle: localize('bottom', "Bottom"),
            category: Categories.View,
            toggled: ContextKeyExpr.equals(`config.${"workbench.activityBar.location" /* LayoutSettings.ACTIVITY_BAR_LOCATION */}`, "bottom" /* ActivityBarPosition.BOTTOM */),
            menu: [{
                    id: MenuId.ActivityBarPositionMenu,
                    order: 3
                }, {
                    id: MenuId.CommandPalette,
                    when: ContextKeyExpr.and(ContextKeyExpr.notEquals(`config.${"workbench.activityBar.location" /* LayoutSettings.ACTIVITY_BAR_LOCATION */}`, "bottom" /* ActivityBarPosition.BOTTOM */), IsSessionsWindowContext.negate()),
                }]
        });
    }
    run(accessor) {
        const configurationService = accessor.get(IConfigurationService);
        configurationService.updateValue("workbench.activityBar.location" /* LayoutSettings.ACTIVITY_BAR_LOCATION */, "bottom" /* ActivityBarPosition.BOTTOM */);
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.activityBarLocation.hide',
            title: {
                ...localize2('hideActivityBar', 'Hide Activity Bar'),
                mnemonicTitle: localize({ key: 'miHideActivityBar', comment: ['&& denotes a mnemonic'] }, "&&Hidden"),
            },
            shortTitle: localize('hide', "Hidden"),
            category: Categories.View,
            toggled: ContextKeyExpr.equals(`config.${"workbench.activityBar.location" /* LayoutSettings.ACTIVITY_BAR_LOCATION */}`, "hidden" /* ActivityBarPosition.HIDDEN */),
            menu: [{
                    id: MenuId.ActivityBarPositionMenu,
                    order: 4
                }, {
                    id: MenuId.CommandPalette,
                    when: ContextKeyExpr.and(ContextKeyExpr.notEquals(`config.${"workbench.activityBar.location" /* LayoutSettings.ACTIVITY_BAR_LOCATION */}`, "hidden" /* ActivityBarPosition.HIDDEN */), IsSessionsWindowContext.negate()),
                }]
        });
    }
    run(accessor) {
        const configurationService = accessor.get(IConfigurationService);
        configurationService.updateValue("workbench.activityBar.location" /* LayoutSettings.ACTIVITY_BAR_LOCATION */, "hidden" /* ActivityBarPosition.HIDDEN */);
    }
});
MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
    submenu: MenuId.ActivityBarPositionMenu,
    title: localize('positionActivituBar', "Activity Bar Position"),
    group: '3_workbench_layout_move',
    order: 2,
    when: IsSessionsWindowContext.negate()
});
MenuRegistry.appendMenuItem(MenuId.ViewContainerTitleContext, {
    submenu: MenuId.ActivityBarPositionMenu,
    title: localize('positionActivituBar', "Activity Bar Position"),
    when: ContextKeyExpr.or(ContextKeyExpr.equals('viewContainerLocation', ViewContainerLocationToString(0 /* ViewContainerLocation.Sidebar */)), ContextKeyExpr.equals('viewContainerLocation', ViewContainerLocationToString(2 /* ViewContainerLocation.AuxiliaryBar */))),
    group: '3_workbench_layout_move',
    order: 1
});
registerAction2(class extends SwitchCompositeViewAction {
    constructor() {
        super({
            id: 'workbench.action.previousSideBarView',
            title: localize2('previousSideBarView', 'Previous Primary Side Bar View'),
            category: Categories.View,
            f1: true
        }, 0 /* ViewContainerLocation.Sidebar */, -1);
    }
});
registerAction2(class extends SwitchCompositeViewAction {
    constructor() {
        super({
            id: 'workbench.action.nextSideBarView',
            title: localize2('nextSideBarView', 'Next Primary Side Bar View'),
            category: Categories.View,
            f1: true
        }, 0 /* ViewContainerLocation.Sidebar */, 1);
    }
});
registerAction2(class FocusActivityBarAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.focusActivityBar',
            title: localize2('focusActivityBar', 'Focus Activity Bar'),
            category: Categories.View,
            f1: true
        });
    }
    async run(accessor) {
        const layoutService = accessor.get(IWorkbenchLayoutService);
        layoutService.focusPart("workbench.parts.activitybar" /* Parts.ACTIVITYBAR_PART */);
    }
});
registerThemingParticipant((theme, collector) => {
    const activityBarActiveBorderColor = theme.getColor(ACTIVITY_BAR_ACTIVE_BORDER);
    if (activityBarActiveBorderColor) {
        collector.addRule(`
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked .active-item-indicator:before {
				border-left-color: ${activityBarActiveBorderColor};
			}
		`);
    }
    const activityBarActiveFocusBorderColor = theme.getColor(ACTIVITY_BAR_ACTIVE_FOCUS_BORDER);
    if (activityBarActiveFocusBorderColor) {
        collector.addRule(`
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked:focus::before {
				visibility: hidden;
			}

			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked:focus .active-item-indicator:before {
				visibility: visible;
				border-left-color: ${activityBarActiveFocusBorderColor};
			}
		`);
    }
    const activityBarActiveBackgroundColor = theme.getColor(ACTIVITY_BAR_ACTIVE_BACKGROUND);
    if (activityBarActiveBackgroundColor) {
        collector.addRule(`
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked .active-item-indicator {
				z-index: 0;
				background-color: ${activityBarActiveBackgroundColor};
			}
		`);
    }
    // Styling with Outline color (e.g. high contrast theme)
    const outline = theme.getColor(activeContrastBorder);
    if (outline) {
        collector.addRule(`
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item .action-label::before{
				padding: 6px;
			}

			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.active .action-label::before,
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.active:hover .action-label::before,
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked .action-label::before,
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked:hover .action-label::before {
				outline: 1px solid ${outline};
			}

			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item:hover .action-label::before {
				outline: 1px dashed ${outline};
			}

			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item:focus .active-item-indicator:before {
				border-left-color: ${outline};
			}
		`);
    }
    // Styling without outline color
    else {
        const focusBorderColor = theme.getColor(focusBorder);
        if (focusBorderColor) {
            collector.addRule(`
				.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item:focus .active-item-indicator::before {
						border-left-color: ${focusBorderColor};
					}
				`);
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWN0aXZpdHliYXJQYXJ0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2Jyb3dzZXIvcGFydHMvYWN0aXZpdHliYXIvYWN0aXZpdHliYXJQYXJ0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLDZCQUE2QixDQUFDO0FBQ3JDLE9BQU8sNEJBQTRCLENBQUM7QUFDcEMsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUV6RCxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sZUFBZSxDQUFDO0FBQ3JDLE9BQU8sRUFBdUIsdUJBQXVCLEVBQW1DLE1BQU0sbURBQW1ELENBQUM7QUFDbEosT0FBTyxFQUFFLHFCQUFxQixFQUFvQixNQUFNLDREQUE0RCxDQUFDO0FBQ3JILE9BQU8sRUFBRSxlQUFlLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMxRixPQUFPLEVBQUUsMkJBQTJCLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUM1RyxPQUFPLEVBQUUsYUFBYSxFQUFlLDBCQUEwQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDM0gsT0FBTyxFQUFFLHVCQUF1QixFQUFFLG1CQUFtQixFQUFFLHVCQUF1QixFQUFFLDBCQUEwQixFQUFFLDZCQUE2QixFQUFFLDZCQUE2QixFQUFFLGdDQUFnQyxFQUFFLDhCQUE4QixFQUFFLGlDQUFpQyxFQUFFLGdDQUFnQyxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDbFYsT0FBTyxFQUFFLG9CQUFvQixFQUFFLGNBQWMsRUFBRSxXQUFXLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUN2SCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxVQUFVLEVBQUUsQ0FBQyxFQUFF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