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
import * as dom from '../../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { PixelRatio } from '../../../../base/browser/pixelRatio.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Action } from '../../../../base/common/actions.js';
import * as arrays from '../../../../base/common/arrays.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import * as errors from '../../../../base/common/errors.js';
import { DisposableStore, markAsSingleton, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { platform } from '../../../../base/common/platform.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { DropdownWithPrimaryActionViewItem } from '../../../../platform/actions/browser/dropdownWithPrimaryActionViewItem.js';
import { createActionViewItem, getFlatActionBarActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuService, MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { widgetBorder } from '../../../../platform/theme/common/colorRegistry.js';
import { IThemeService, Themable } from '../../../../platform/theme/common/themeService.js';
import { getTitleBarStyle } from '../../../../platform/window/common/window.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { CONTEXT_DEBUG_STATE, CONTEXT_FOCUSED_SESSION_IS_ATTACH, CONTEXT_FOCUSED_SESSION_IS_NO_DEBUG, CONTEXT_IN_DEBUG_MODE, CONTEXT_MULTI_SESSION_DEBUG, CONTEXT_STEP_BACK_SUPPORTED, CONTEXT_SUSPEND_DEBUGGEE_SUPPORTED, CONTEXT_TERMINATE_DEBUGGEE_SUPPORTED, IDebugService, VIEWLET_ID } from '../common/debug.js';
import { FocusSessionActionViewItem } from './debugActionViewItems.js';
import { debugToolBarBackground, debugToolBarBorder } from './debugColors.js';
import { CONTINUE_ID, CONTINUE_LABEL, DISCONNECT_AND_SUSPEND_ID, DISCONNECT_AND_SUSPEND_LABEL, DISCONNECT_ID, DISCONNECT_LABEL, FOCUS_SESSION_ID, FOCUS_SESSION_LABEL, PAUSE_ID, PAUSE_LABEL, RESTART_LABEL, RESTART_SESSION_ID, REVERSE_CONTINUE_ID, STEP_BACK_ID, STEP_INTO_ID, STEP_INTO_LABEL, STEP_OUT_ID, STEP_OUT_LABEL, STEP_OVER_ID, STEP_OVER_LABEL, STOP_ID, STOP_LABEL } from './debugCommands.js';
import * as icons from './debugIcons.js';
import './media/debugToolBar.css';
const DEBUG_TOOLBAR_POSITION_KEY = 'debug.actionswidgetposition';
const DEBUG_TOOLBAR_Y_KEY = 'debug.actionswidgety';
let DebugToolBar = class DebugToolBar extends Themable {
    constructor(notificationService, telemetryService, debugService, layoutService, storageService, configurationService, themeService, instantiationService, menuService, contextKeyService) {
        super(themeService);
        this.notificationService = notificationService;
        this.telemetryService = telemetryService;
        this.debugService = debugService;
        this.layoutService = layoutService;
        this.storageService = storageService;
        this.configurationService = configurationService;
        this.instantiationService = instantiationService;
        this.isVisible = false;
        this.isBuilt = false;
        this.stopActionViewItemDisposables = this._register(new DisposableStore());
        /** coordinate of the debug toolbar per aux window */
        this.auxWindowCoordinates = new WeakMap();
        this.trackPixelRatioListener = this._register(new MutableDisposable());
        this.$el = dom.$('div.debug-toolbar');
        // Note: changes to this setting require a restart, so no need to listen to it.
        const controlsOnTitlebar = getTitleBarStyle(this.configurationService) === "custom" /* TitlebarStyle.CUSTOM */;
        // Do not allow the widget to overflow or underflow window controls.
        // Use CSS calculations to avoid having to force layout with `.clientWidth`
        const controlsOnLeft = controlsOnTitlebar && platform === 1 /* Platform.Mac */;
        const controlsOnRight = controlsOnTitlebar && (platform === 3 /* Platform.Windows */ || platform === 2 /* Platform.Linux */);
        this.$el.style.transform = `translate(
			min(
				max(${controlsOnLeft ? '60px' : '0px'}, calc(-50% + (100vw * var(--x-position)))),
				calc(100vw - 100% - ${controlsOnRight ? '100px' : '0px'})
			),
			var(--y-position)
		)`;
        this.dragArea = dom.append(this.$el, dom.$('div.drag-area' + ThemeIcon.asCSSSelector(icons.debugGripper)));
        const actionBarContainer = dom.append(this.$el, dom.$('div.action-bar-container'));
        this.debugToolBarMenu = menuService.createMenu(MenuId.DebugToolBar, contextKeyService);
        this._register(this.debugToolBarMenu);
        this.activeActions = [];
        this.actionBar = this._register(new ActionBar(actionBarContainer, {
            orientation: 0 /* ActionsOrientation.HORIZONTAL */,
            actionViewItemProvider: (action, options) => {
                if (action.id === FOCUS_SESSION_ID) {
                    return this.instantiationService.createInstance(FocusSessionActionViewItem, action, undefined);
                }
                else if (action.id === STOP_ID || action.id === DISCONNECT_ID) {
                    this.stopActionViewItemDisposables.clear();
                    const item = this.instantiationService.invokeFunction(accessor => createDisconnectMenuItemAction(action, this.stopActionViewItemDisposables, accessor, { hoverDelegate: options.hoverDelegate }));
                    if (item) {
                        return item;
                    }
                }
                return createActionViewItem(this.instantiationService, action, options);
            }
        }));
        this.updateScheduler = this._register(new RunOnceScheduler(() => {
            const state = this.debugService.state;
            const toolBarLocation = this.configurationService.getValue('debug').toolBarLocation;
            if (state === 0 /* State.Inactive */ ||
                toolBarLocation !== 'floating' ||
                this.debugService.getModel().getSessions().every(s => s.suppressDebugToolbar) ||
                (state === 1 /* State.Initializing */ && this.debugService.initializingOptions?.suppressDebugToolbar)) {
                return this.hide();
            }
            const actions = getFlatActionBarActions(this.debugToolBarMenu.getActions({ shouldForwardArgs: true }));
            if (!arrays.equals(actions, this.activeActions, (first, second) => first.id === second.id && first.enabled === second.enabled)) {
                this.actionBar.clear();
                this.actionBar.push(actions, { icon: true, label: false });
                this.activeActions = actions;
            }
            this.show();
        }, 20));
        this.updateStyles();
        this.registerListeners();
        this.hide();
    }
    registerListeners() {
        this._register(this.debugService.onDidChangeState(() => this.updateScheduler.schedule()));
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('debug.toolBarLocation')) {
                this.updateScheduler.schedule();
            }
            if (e.affectsConfiguration("workbench.editor.showTabs" /* LayoutSettings.EDITOR_TABS_MODE */) || e.affectsConfiguration("window.commandCenter" /* LayoutSettings.COMMAND_CENTER */)) {
                this._yRange = undefined;
                this.setCoordinates();
            }
        }));
        this._register(this.debugToolBarMenu.onDidChange(() => this.updateScheduler.schedule()));
        this._register(this.actionBar.actionRunner.onDidRun((e) => {
            // check for error
            if (e.error && !errors.isCancellationError(e.error)) {
                this.notificationService.warn(e.error);
            }
            // log in telemetry
            this.telemetryService.publicLog2('workbenchActionExecuted', { id: e.action.id, from: 'debugActionsWidget' });
        }));
        this._register(dom.addDisposableGenericMouseUpListener(this.dragArea, (event) => {
            const mouseClickEvent = new StandardMouseEvent(dom.getWindow(this.dragArea), event);
            if (mouseClickEvent.detail === 2) {
                // double click on debug bar centers it again #8250
                this.setCoordinates(0.5, this.yDefault);
                this.storePosition();
            }
        }));
        this._register(dom.addDisposableGenericMouseDownListener(this.dragArea, (e) => {
            this.dragArea.classList.add('dragged');
            const activeWindow = dom.getWindow(this.layoutService.activeContainer);
            const originEvent = new StandardMouseEvent(activeWindow, e);
            const originX = this.computeCurrentXPercent();
            const originY = this.getCurrentYPosition();
            const mouseMoveListener = dom.addDisposableGenericMouseMoveListener(activeWindow, (e) => {
                const mouseMoveEvent = new StandardMouseEvent(activeWindow, e);
                // Prevent default to stop editor selecting text #8524
                mouseMoveEvent.preventDefault();
                this.setCoordinates(originX + (mouseMoveEvent.posx - originEvent.posx) / activeWindow.innerWidth, originY + mouseMoveEvent.posy - originEvent.posy);
            });
            const mouseUpListener = dom.addDisposableGenericMouseUpListener(activeWindow, (e) => {
                this.storePosition();
                this.dragArea.classList.remove('dragged');
                mouseMoveListener.dispose();
                mouseUpListener.dispose();
            });
        }));
        this._register(this.layoutService.onDidChangePartVisibility(() => this.setCoordinates()));
        this._register(this.layoutService.onDidChangeActiveContainer(async () => {
            this._yRange = undefined;
            // note: we intentionally don't keep the activeContainer before the
            // `await` clause to avoid any races due to quickly switching windows.
            await this.layoutService.whenContainerStylesLoaded(dom.getWindow(this.layoutService.activeContainer));
            if (this.isBuilt) {
                this.doShowInActiveContainer();
                this.setCoordinates();
            }
        }));
    }
    /**
     * Computes the x percent position at which the toolbar is currently displayed.
     */
    computeCurrentXPercent() {
        const { left, width } = this.$el.getBoundingClientRect();
        return (left + width / 2) / dom.getWindow(this.$el).innerWidth;
    }
    /**
     * Gets the x position set in the style of the toolbar. This may not be its
     * actual position on screen depending on toolbar locations.
     */
    getCurrentXPercent() {
        return Number(this.$el.style.getPropertyValue('--x-position'));
    }
    /** Gets the y position set in the style of the toolbar */
    getCurrentYPosition() {
        return parseInt(this.$el.style.getPropertyValue('--y-position'));
    }
    storePosition() {
        const activeWindow = dom.getWindow(this.layoutService.activeContainer);
        const isMainWindow = this.layoutService.activeContainer === this.layoutService.mainContainer;
        const x = this.getCurrentXPercent();
        const y = this.getCurrentYPosition();
        if (isMainWindow) {
            this.storageService.store(DEBUG_TOOLBAR_POSITION_KEY, x, 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
            this.storageService.store(DEBUG_TOOLBAR_Y_KEY, y, 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        }
        else {
            this.auxWindowCoordinates.set(activeWindow, { x, y });
        }
    }
    updateStyles() {
        super.updateStyles();
        if (this.$el) {
            this.$el.style.backgroundColor = this.getColor(debugToolBarBackground) || '';
            const contrastBorderColor = this.getColor(widgetBorder);
            const borderColor = this.getColor(debugToolBarBorder);
            if (contrastBorderColor) {
                this.$el.style.border = `1px solid ${contrastBorderColor}`;
            }
            else {
                this.$el.style.border = borderColor ? `solid ${borderColor}` : 'none';
                this.$el.style.border = '1px 0';
            }
        }
    }
    /** Gets the stored X position of the middle of the toolbar based on the current window width */
    getStoredXPosition() {
        const currentWindow = dom.getWindow(this.layoutService.activeContainer);
        const isMainWindow = currentWindow === mainWindow;
        const storedPercentage = isMainWindow
            ? Number(this.storageService.get(DEBUG_TOOLBAR_POSITION_KEY, 0 /* StorageScope.PROFILE */))
            : this.auxWindowCoordinates.get(currentWindow)?.x;
        return storedPercentage !== undefined && !isNaN(storedPercentage) ? storedPercentage : 0.5;
    }
    getStoredYPosition() {
        const currentWindow = dom.getWindow(this.layoutService.activeContainer);
        const isMainWindow = currentWindow === mainWindow;
        const storedY = isMainWindow
            ? this.storageService.getNumber(DEBUG_TOOLBAR_Y_KEY, 0 /* StorageScope.PROFILE */)
            : this.auxWindowCoordinates.get(currentWindow)?.y;
        return storedY ?? this.yDefault;
    }
    setCoordinates(x, y) {
        if (!this.isVisible) {
            return;
        }
        x ??= this.getStoredXPosition();
        y ??= this.getStoredYPosition();
        const [yMin, yMax] = this.yRange;
        y = Math.max(yMin, Math.min(y, yMax));
        this.$el.style.setProperty('--x-position', `${x}`);
        this.$el.style.setProperty('--y-position', `${y}px`);
    }
    get yDefault() {
        return this.layoutService.mainContainerOffset.top;
    }
    get yRange() {
        if (!this._yRange) {
            const isTitleBarVisible = this.layoutService.isVisible("workbench.parts.titlebar" /* Parts.TITLEBAR_PART */, dom.getWindow(this.layoutService.activeContainer));
            const yMin = isTitleBarVisible ? 0 : this.layoutService.mainContainerOffset.top;
            let yMax = 0;
            if (isTitleBarVisible) {
                if (this.configurationService.getValue("window.commandCenter" /* LayoutSettings.COMMAND_CENTER */) === true) {
                    yMax += 35;
                }
                else {
                    yMax += 28;
                }
            }
            if (this.configurationService.getValue("workbench.editor.showTabs" /* LayoutSettings.EDITOR_TABS_MODE */) !== "none" /* EditorTabsMode.NONE */) {
                yMax += 35;
            }
            this._yRange = [yMin, yMax];
        }
        return this._yRange;
    }
    show() {
        if (this.isVisible) {
            this.setCoordinates();
            return;
        }
        if (!this.isBuilt) {
            this.isBuilt = true;
            this.doShowInActiveContainer();
        }
        this.isVisible = true;
        dom.show(this.$el);
        this.setCoordinates();
    }
    doShowInActiveContainer() {
        this.layoutService.activeContainer.appendChild(this.$el);
        this.trackPixelRatioListener.value = PixelRatio.getInstance(dom.getWindow(this.$el)).onDidChange(() => this.setCoordinates());
    }
    hide() {
        this.isVisible = false;
        dom.hide(this.$el);
    }
    dispose() {
        super.dispose();
        this.$el?.remove();
    }
};
DebugToolBar = __decorate([
    __param(0, INotificationService),
    __param(1, ITelemetryService),
    __param(2, IDebugService),
    __param(3, IWorkbenchLayoutService),
    __param(4, IStorageService),
    __param(5, IConfigurationService),
    __param(6, IThemeService),
    __param(7, IInstantiationService),
    __param(8, IMenuService),
    __param(9, IContextKeyService)
], DebugToolBar);
export { DebugToolBar };
export function createDisconnectMenuItemAction(action, disposables, accessor, options) {
    const menuService = accessor.get(IMenuService);
    const contextKeyService = accessor.get(IContextKeyService);
    const instantiationService = accessor.get(IInstantiationService);
    const menu = menuService.getMenuActions(MenuId.DebugToolBarStop, contextKeyService, { shouldForwardArgs: true });
    const secondary = getFlatActionBarActions(menu);
    if (!secondary.length) {
        return undefined;
    }
    const dropdownAction = disposables.add(new Action('notebook.moreRunActions', localize('notebook.moreRunActionsLabel', "More..."), 'codicon-chevron-down', true));
    const item = instantiationService.createInstance(DropdownWithPrimaryActionViewItem, action, dropdownAction, secondary, 'debug-stop-actions', options);
    return item;
}
// Debug toolbar
const debugViewTitleItems = new DisposableStore();
const registerDebugToolBarItem = (id, title, order, icon, when, precondition, alt) => {
    MenuRegistry.appendMenuItem(MenuId.DebugToolBar, {
        group: 'navigation',
        when,
        order,
        command: {
            id,
            title,
            icon,
            precondition
        },
        alt
    });
    // Register actions in debug viewlet when toolbar is docked
    debugViewTitleItems.add(MenuRegistry.appendMenuItem(MenuId.ViewContainerTitle, {
        group: 'navigation',
        when: ContextKeyExpr.and(when, ContextKeyExpr.equals('viewContainer', VIEWLET_ID), CONTEXT_DEBUG_STATE.notEqualsTo('inactive'), ContextKeyExpr.equals('config.debug.toolBarLocation', 'docked')),
        order,
        command: {
            id,
            title,
            icon,
            precondition
        }
    }));
};
markAsSingleton(MenuRegistry.onDidChangeMenu(e => {
    // In case the debug toolbar is docked we need to make sure that the docked toolbar has the up to date commands registered #115945
    if (e.has(MenuId.DebugToolBar)) {
        debugViewTitleItems.clear();
        const items = MenuRegistry.getMenuItems(MenuId.DebugToolBar);
        for (const i of items) {
            debugViewTitleItems.add(MenuRegistry.appendMenuItem(MenuId.ViewContainerTitle, {
                ...i,
                when: ContextKeyExpr.and(i.when, ContextKeyExpr.equals('viewContainer', VIEWLET_ID), CONTEXT_DEBUG_STATE.notEqualsTo('inactive'), ContextKeyExpr.equals('config.debug.toolBarLocation', 'docked'))
            }));
        }
    }
}));
const CONTEXT_TOOLBAR_COMMAND_CENTER = ContextKeyExpr.equals('config.debug.toolBarLocation', 'commandCenter');
MenuRegistry.appendMenuItem(MenuId.CommandCenterCenter, {
    submenu: MenuId.DebugToolBar,
    title: 'Debug',
    icon: Codicon.debug,
    order: 1,
    when: ContextKeyExpr.and(CONTEXT_IN_DEBUG_MODE, CONTEXT_TOOLBAR_COMMAND_CENTER)
});
registerDebugToolBarItem(CONTINUE_ID, CONTINUE_LABEL, 10, icons.debugContinue, CONTEXT_DEBUG_STATE.isEqualTo('stopped'));
registerDebugToolBarItem(PAUSE_ID, PAUSE_LABEL, 10, icons.debugPause, CONTEXT_DEBUG_STATE.notEqualsTo('stopped'), ContextKeyExpr.and(CONTEXT_DEBUG_STATE.isEqualTo('running'), CONTEXT_FOCUSED_SESSION_IS_NO_DEBUG.toNegated()));
registerDebugToolBarItem(STOP_ID, STOP_LABEL, 70, icons.debugStop, CONTEXT_FOCUSED_SESSION_IS_ATTACH.toNegated(), undefined, { id: DISCONNECT_ID, title: DISCONNECT_LABEL, icon: icons.debugDisconnect, precondition: ContextKeyExpr.and(CONTEXT_FOCUSED_SESSION_IS_ATTACH.toNegated(), CONTEXT_TERMINATE_DEBUGGEE_SUPPORTED), });
registerDebugToolBarItem(DISCONNECT_ID, DISCONNECT_LABEL, 70, icons.debugDisconnect, CONTEXT_FOCUSED_SESSION_IS_ATTACH, undefined, { id: STOP_ID, title: STOP_LABEL, icon: icons.debugStop, precondition: ContextKeyExpr.and(CONTEXT_FOCUSED_SESSION_IS_ATTACH, CONTEXT_TERMINATE_DEBUGGEE_SUPPORTED), });
registerDebugToolBarItem(STEP_OVER_ID, STEP_OVER_LABEL, 20, icons.debugStepOver, undefined, CONTEXT_DEBUG_STATE.isEqualTo('stopped'));
registerDebugToolBarItem(STEP_INTO_ID, STEP_INTO_LABEL, 30, icons.debugStepInto, undefined, CONTEXT_DEBUG_STATE.isEqualTo('stopped'));
registerDebugToolBarItem(STEP_OUT_ID, STEP_OUT_LABEL, 40, icons.debugStepOut, undefined, CONTEXT_DEBUG_STATE.isEqualTo('stopped'));
registerDebugToolBarItem(RESTART_SESSION_ID, RESTART_LABEL, 60, icons.debugRestart);
registerDebugToolBarItem(STEP_BACK_ID, localize('stepBackDebug', "Step Back"), 50, icons.debugStepBack, CONTEXT_STEP_BACK_SUPPORTED, CONTEXT_DEBUG_STATE.isEqualTo('stopped'));
registerDebugToolBarItem(REVERSE_CONTINUE_ID, localize('reverseContinue', "Reverse"), 55, icons.debugReverseContinue, CONTEXT_STEP_BACK_SUPPORTED, CONTEXT_DEBUG_STATE.isEqualTo('stopped'));
registerDebugToolBarItem(FOCUS_SESSION_ID, FOCUS_SESSION_LABEL, 100, Codicon.listTree, ContextKeyExpr.and(CONTEXT_MULTI_SESSION_DEBUG, CONTEXT_TOOLBAR_COMMAND_CENTER.negate()));
MenuRegistry.appendMenuItem(MenuId.DebugToolBarStop, {
    group: 'navigation',
    when: ContextKeyExpr.and(CONTEXT_FOCUSED_SESSION_IS_ATTACH.toNegated(), CONTEXT_TERMINATE_DEBUGGEE_SUPPORTED),
    order: 0,
    command: {
        id: DISCONNECT_ID,
        title: DISCONNECT_LABEL,
        icon: icons.debugDisconnect
    }
});
MenuRegistry.appendMenuItem(MenuId.DebugToolBarStop, {
    group: 'navigation',
    when: ContextKeyExpr.and(CONTEXT_FOCUSED_SESSION_IS_ATTACH, CONTEXT_TERMINATE_DEBUGGEE_SUPPORTED),
    order: 0,
    command: {
        id: STOP_ID,
        title: STOP_LABEL,
        icon: icons.debugStop
    }
});
MenuRegistry.appendMenuItem(MenuId.DebugToolBarStop, {
    group: 'navigation',
    when: ContextKeyExpr.or(ContextKeyExpr.and(CONTEXT_FOCUSED_SESSION_IS_ATTACH.toNegated(), CONTEXT_SUSPEND_DEBUGGEE_SUPPORTED, CONTEXT_TERMINATE_DEBUGGEE_SUPPORTED), ContextKeyExpr.and(CONTEXT_FOCUSED_SESSION_IS_ATTACH, CONTEXT_SUSPEND_DEBUGGEE_SUPPORTED)),
    order: 0,
    command: {
        id: DISCONNECT_AND_SUSPEND_ID,
        title: DISCONNECT_AND_SUSPEND_LABEL,
        icon: icons.debugDisconnect
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWdUb29sQmFyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZGVidWcvYnJvd3Nlci9kZWJ1Z1Rvb2xCYXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxpQ0FBaUMsQ0FBQztBQUN2RCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUM1RSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDcEUsT0FBTyxFQUFFLFNBQVMsRUFBdUMsTUFBTSxvREFBb0QsQ0FBQztBQUVwSCxPQUFPLEVBQWMsVUFBVSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDNUUsT0FBTyxFQUFFLE1BQU0sRUFBMkYsTUFBTSxvQ0FBb0MsQ0FBQztBQUNySixPQUFPLEtBQUssTUFBTSxNQUFNLG1DQUFtQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEtBQUssTUFBTSxNQUFNLG1DQUFtQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxlQUFlLEVBQUUsZUFBZSxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDM0csT0FBTyxFQUFZLFFBQVEsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUdqRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFFOUMsT0FBTyxFQUFFLGlDQUFpQyxFQUE2QyxNQUFNLDJFQUEyRSxDQUFDO0FBQ3pLLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSx1QkFBdUIs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QUFDLGVBQWUsRUFBRSxpQ0FBaUMsRUFBRSxTQUFTLEVBQUUsRUFBRSxFQUFFLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxVQUFVLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxTQUFTLEVBQUUsWUFBWSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsaUNBQWlDLEVBQUUsb0NBQW9DLENBQUMsR0FBRyxDQUFDLENBQUM7QUFDMVMsd0JBQXdCLENBQUMsWUFBWSxFQUFFLGVBQWUsRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLGFBQWEsRUFBRSxTQUFTLEVBQUUsbUJBQW1CLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7QUFDdEksd0JBQXdCLENBQUMsWUFBWSxFQUFFLGVBQWUsRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLGFBQWEsRUFBRSxTQUFTLEVBQUUsbUJBQW1CLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7QUFDdEksd0JBQXdCLENBQUMsV0FBVyxFQUFFLGNBQWMsRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLFlBQVksRUFBRSxTQUFTLEVBQUUsbUJBQW1CLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7QUFDbkksd0JBQXdCLENBQUMsa0JBQWtCLEVBQUUsYUFBYSxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsWUFBWSxDQUFDLENBQUM7QUFDcEYsd0JBQXdCLENBQUMsWUFBWSxFQUFFLFFBQVEsQ0FBQyxlQUFlLEVBQUUsV0FBVyxDQUFDLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxhQUFhLEVBQUUsMkJBQTJCLEVBQUUsbUJBQW1CLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7QUFDL0ssd0JBQXdCLENBQUMsbUJBQW1CLEVBQUUsUUFBUSxDQUFDLGlCQUFpQixFQUFFLFNBQVMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsb0JBQW9CLEVBQUUsMkJBQTJCLEVBQUUsbUJBQW1CLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7QUFDN0wsd0JBQXdCLENBQUMsZ0JBQWdCLEVBQUUsbUJBQW1CLEVBQUUsR0FBRyxFQUFFLE9BQU8sQ0FBQyxRQUFRLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsRUFBRSw4QkFBOEIsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7QUFFakwsWUFBWSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLEVBQUU7SUFDcEQsS0FBSyxFQUFFLFlBQVk7SUFDbkIsSUFBSSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsaUNBQWlDLENBQUMsU0FBUyxFQUFFLEVBQUUsb0NBQW9DLENBQUM7SUFDN0csS0FBSyxFQUFFLENBQUM7SUFDUixPQUFPLEVBQUU7UUFDUixFQUFFLEVBQUUsYUFBYTtRQUNqQixLQUFLLEVBQUUsZ0JBQWdCO1FBQ3ZCLElBQUksRUFBRSxLQUFLLENBQUMsZUFBZTtLQUMzQjtDQUNELENBQUMsQ0FBQztBQUVILFlBQVksQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLGdCQUFnQixFQUFFO0lBQ3BELEtBQUssRUFBRSxZQUFZO0lBQ25CLElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLGlDQUFpQyxFQUFFLG9DQUFvQyxDQUFDO0lBQ2pHLEtBQUssRUFBRSxDQUFDO0lBQ1IsT0FBTyxFQUFFO1FBQ1IsRUFBRSxFQUFFLE9BQU87UUFDWCxLQUFLLEVBQUUsVUFBVTtRQUNqQixJQUFJLEVBQUUsS0FBSyxDQUFDLFNBQVM7S0FDckI7Q0FDRCxDQUFDLENBQUM7QUFFSCxZQUFZLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsRUFBRTtJQUNwRCxLQUFLLEVBQUUsWUFBWTtJQUNuQixJQUFJLEVBQUUsY0FBYyxDQUFDLEVBQUUsQ0FDdEIsY0FBYyxDQUFDLEdBQUcsQ0FBQyxpQ0FBaUMsQ0FBQyxTQUFTLEVBQUUsRUFBRSxrQ0FBa0MsRUFBRSxvQ0FBb0MsQ0FBQyxFQUMzSSxjQUFjLENBQUMsR0FBRyxDQUFDLGlDQUFpQyxFQUFFLGtDQUFrQyxDQUFDLENBQ3pGO0lBQ0QsS0FBSyxFQUFFLENBQUM7SUFDUixPQUFPLEVBQUU7UUFDUixFQUFFLEVBQUUseUJBQXlCO1FBQzdCLEtBQUssRUFBRSw0QkFBNEI7UUFDbkMsSUFBSSxFQUFFLEtBQUssQ0FBQyxlQUFlO0tBQzNCO0NBQ0QsQ0FBQyxDQUFDIn0=