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
var AuxiliaryTitlebarPart_1;
import '../../../workbench/browser/parts/titlebar/media/titlebarpart.css';
import './media/titlebarpart.css';
import { MultiWindowParts, Part } from '../../../workbench/browser/part.js';
import { getZoomFactor, isWCOEnabled, getWCOTitlebarAreaRect, isFullscreen, onDidChangeFullscreen } from '../../../base/browser/browser.js';
import { hasCustomTitlebar, hasNativeTitlebar, DEFAULT_CUSTOM_TITLEBAR_HEIGHT, getTitleBarStyle, getWindowControlsStyle } from '../../../platform/window/common/window.js';
import { IContextMenuService } from '../../../platform/contextview/browser/contextView.js';
import { StandardMouseEvent } from '../../../base/browser/mouseEvent.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { WORKBENCH_BACKGROUND } from '../../../workbench/common/theme.js';
import { chatBarTitleBackground, chatBarTitleForeground } from '../../common/theme.js';
import { isMacintosh, isWeb, isNative, platformLocale } from '../../../base/common/platform.js';
import { Color } from '../../../base/common/color.js';
import { EventType, EventHelper, append, $, addDisposableListener, prepend, getWindow, getWindowId } from '../../../base/browser/dom.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { IStorageService } from '../../../platform/storage/common/storage.js';
import { IWorkbenchLayoutService } from '../../../workbench/services/layout/browser/layoutService.js';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { IHostService } from '../../../workbench/services/host/browser/host.js';
import { MenuWorkbenchToolBar } from '../../../platform/actions/browser/toolbar.js';
import { mainWindow } from '../../../base/browser/window.js';
import { safeIntl } from '../../../base/common/date.js';
import { Menus } from '../menus.js';
/**
 * Simplified agent sessions titlebar part.
 *
 * Three sections driven entirely by menus:
 * - **Left**: `Menus.TitleBarLeft` toolbar
 * - **Center**: `Menus.CommandCenter` toolbar (renders session picker via IActionViewItemService)
 * - **Right**: `Menus.TitleBarRight` toolbar (includes account submenu)
 *
 * No menubar, no editor actions, no layout controls, no WindowTitle dependency.
 */
let TitlebarPart = class TitlebarPart extends Part {
    get minimumHeight() {
        const wcoEnabled = isWeb && isWCOEnabled();
        let value = DEFAULT_CUSTOM_TITLEBAR_HEIGHT;
        if (wcoEnabled) {
            value = Math.max(value, getWCOTitlebarAreaRect(getWindow(this.element))?.height ?? 0);
        }
        return value / (this.preventZoom ? getZoomFactor(getWindow(this.element)) : 1);
    }
    get maximumHeight() { return this.minimumHeight; }
    get leftContainer() { return this.leftContent; }
    get rightContainer() { return this.rightContent; }
    get rightWindowControlsContainer() { return this.windowControlsContainer; }
    constructor(id, targetWindow, contextMenuService, configurationService, instantiationService, themeService, storageService, layoutService, contextKeyService, hostService) {
        super(id, { hasTitle: false }, themeService, storageService, layoutService);
        this.contextMenuService = contextMenuService;
        this.configurationService = configurationService;
        this.instantiationService = instantiationService;
        this.contextKeyService = contextKeyService;
        this.hostService = hostService;
        //#region IView
        this.minimumWidth = 0;
        this.maximumWidth = Number.POSITIVE_INFINITY;
        //#endregion
        //#region Events
        this._onMenubarVisibilityChange = this._register(new Emitter());
        this.onMenubarVisibilityChange = this._onMenubarVisibilityChange.event;
        this._onWillDispose = this._register(new Emitter());
        this.onWillDispose = this._onWillDispose.event;
        this.isInactive = false;
        this.titleBarStyle = getTitleBarStyle(this.configurationService);
        this.registerListeners(getWindowId(targetWindow));
    }
    registerListeners(targetWindowId) {
        this._register(this.hostService.onDidChangeFocus(focused => focused ? this.onFocus() : this.onBlur()));
        this._register(this.hostService.onDidChangeActiveWindow(windowId => windowId === targetWindowId ? this.onFocus() : this.onBlur()));
    }
    onBlur() {
        this.isInactive = true;
        this.updateStyles();
    }
    onFocus() {
        this.isInactive = false;
        this.updateStyles();
    }
    updateProperties(_properties) {
        // No window title to update in simplified titlebar
    }
    registerVariables(_variables) {
        // No window title variables in simplified titlebar
    }
    updateOptions(_options) {
        // No compact mode support in agent sessions titlebar
    }
    createContentArea(parent) {
        this.element = parent;
        this.rootContainer = append(parent, $('.titlebar-container.sessions-titlebar-container.has-center'));
        // Draggable region
        prepend(this.rootContainer, $('div.titlebar-drag-region'));
        this.leftContent = append(this.rootContainer, $('.titlebar-left'));
        this.centerContent = append(this.rootContainer, $('.titlebar-center'));
        this.rightContent = append(this.rootContainer, $('.titlebar-right'));
        // Window Controls Container (must be before left toolbar for correct ordering)
        if (!hasNativeTitlebar(this.configurationService, this.titleBarStyle)) {
            let primaryWindowControlsLocation = isMacintosh ? 'left' : 'right';
            if (isMacintosh && isNative) {
                const localeInfo = safeIntl.Locale(platformLocale).value;
                const textInfo = localeInfo.textInfo;
                if (textInfo?.direction === 'rtl') {
                    primaryWindowControlsLocation = 'right';
                }
            }
            if (isMacintosh && isNative && primaryWindowControlsLocation === 'left') {
                // macOS native: traffic lights are rendered by the OS at the top-left corner.
                // Add a fixed-width spacer to push content past the traffic lights.
                const spacer = append(this.leftContent, $('div.window-controls-container'));
                spacer.style.width = '70px';
                spacer.style.flexShrink = '0';
                // Hide spacer in fullscreen (traffic lights are not shown)
                const updateSpacerVisibility = () => {
                    spacer.style.display = isFullscreen(mainWindow) ? 'none' : '';
                };
                updateSpacerVisibility();
                this._register(onDidChangeFullscreen(windowId => {
                    if (windowId === getWindowId(mainWindow)) {
                        updateSpacerVisibility();
                    }
                }));
            }
            else if (getWindowControlsStyle(this.configurationService) === "hidden" /* WindowControlsStyle.HIDDEN */) {
                // controls explicitly disabled
            }
            else {
                this.windowControlsContainer = append(primaryWindowControlsLocation === 'left' ? this.leftContent : this.rightContent, $('div.window-controls-container'));
                if (isWeb) {
                    append(primaryWindowControlsLocation === 'left' ? this.rightContent : this.leftContent, $('div.window-controls-container'));
                }
                if (isWCOEnabled()) {
                    this.windowControlsContainer.classList.add('wco-enabled');
                }
            }
        }
        // Left toolbar (driven by Menus.TitleBarLeft, rendered after window controls via CSS order)
        const leftToolbarContainer = append(this.leftContent, $('div.left-toolbar-container'));
        this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, leftToolbarContainer, Menus.TitleBarLeftLayout, {
            contextMenu: Menus.TitleBarContext,
            telemetrySource: 'titlePart.left',
            hiddenItemStrategy: -1 /* HiddenItemStrategy.NoHide */,
            toolbarOptions: { primaryGroup: () => true },
        }));
        // Center toolbar - command center (renders session picker via IActionViewItemService)
        // Uses .window-title > .command-center nesting to match default workbench CSS selectors
        const windowTitle = append(this.centerContent, $('div.window-title'));
        const centerToolbarContainer = append(windowTitle, $('div.command-center'));
        this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, centerToolbarContainer, Menus.CommandCenter, {
            contextMenu: Menus.TitleBarContext,
            hiddenItemStrategy: -1 /* HiddenItemStrategy.NoHide */,
            telemetrySource: 'commandCenter',
            toolbarOptions: { primaryGroup: () => true },
        }));
        // Right toolbar (driven by Menus.TitleBarRightLayout - includes layout actions)
        const rightToolbarContainer = prepend(this.rightContent, $('div.titlebar-actions-container.titlebar-right-layout-container'));
        this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, rightToolbarContainer, Menus.TitleBarRightLayout, {
            contextMenu: Menus.TitleBarContext,
            hiddenItemStrategy: -1 /* HiddenItemStrategy.NoHide */,
            telemetrySource: 'titlePart.right',
            toolbarOptions: { primaryGroup: () => true },
        }));
        // Session title actions toolbar (before right toolbar)
        const sessionActionsContainer = prepend(this.rightContent, $('div.titlebar-actions-container.titlebar-session-actions-container'));
        this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, sessionActionsContainer, Menus.TitleBarSessionMenu, {
            contextMenu: Menus.TitleBarContext,
            hiddenItemStrategy: -1 /* HiddenItemStrategy.NoHide */,
            telemetrySource: 'titlePart.sessionActions',
            toolbarOptions: { primaryGroup: () => true },
        }));
        // Context menu on the titlebar
        this._register(addDisposableListener(this.rootContainer, EventType.CONTEXT_MENU, e => {
            EventHelper.stop(e);
            this.onContextMenu(e);
        }));
        this.updateStyles();
        return this.element;
    }
    updateStyles() {
        super.updateStyles();
        if (this.element) {
            this.element.classList.toggle('inactive', this.isInactive);
            const titleBackground = this.getColor(chatBarTitleBackground, (color, theme) => {
                return color.isOpaque() ? color : color.makeOpaque(WORKBENCH_BACKGROUND(theme));
            }) || '';
            this.element.style.backgroundColor = titleBackground;
            if (titleBackground && Color.fromHex(titleBackground).isLighter()) {
                this.element.classList.add('light');
            }
            else {
                this.element.classList.remove('light');
            }
            const titleForeground = this.getColor(chatBarTitleForeground);
            this.element.style.color = titleForeground || '';
        }
    }
    onContextMenu(e) {
        const event = new StandardMouseEvent(getWindow(this.element), e);
        this.contextMenuService.showContextMenu({
            getAnchor: () => event,
            menuId: Menus.TitleBarContext,
            contextKeyService: this.contextKeyService,
            domForShadowRoot: isMacintosh && isNative ? event.target : undefined
        });
    }
    get hasZoomableElements() {
        return true; // sessions titlebar always has command center and toolbar actions
    }
    get preventZoom() {
        // Prevent zooming behavior if any of the following conditions are met:
        // 1. Shrinking below the window control size (zoom < 1)
        // 2. No custom items are present in the title bar
        return getZoomFactor(getWindow(this.element)) < 1 || !this.hasZoomableElements;
    }
    layout(width, height) {
        this.updateLayout();
        super.layoutContents(width, height);
    }
    updateLayout() {
        if (!hasCustomTitlebar(this.configurationService, this.titleBarStyle)) {
            return;
        }
        const zoomFactor = getZoomFactor(getWindow(this.element));
        this.element.style.setProperty('--zoom-factor', zoomFactor.toString());
        this.rootContainer.classList.toggle('counter-zoom', this.preventZoom);
    }
    focus() {
        // eslint-disable-next-line no-restricted-syntax
        this.element.querySelector('[tabindex]:not([tabindex="-1"])')?.focus();
    }
    toJSON() {
        return { type: "workbench.parts.titlebar" /* Parts.TITLEBAR_PART */ };
    }
    dispose() {
        this._onWillDispose.fire();
        super.dispose();
    }
};
TitlebarPart = __decorate([
    __param(2, IContextMenuService),
    __param(3, IConfigurationService),
    __param(4, IInstantiationService),
    __param(5, IThemeService),
    __param(6, IStorageService),
    __param(7, IWorkbenchLayoutService),
    __param(8, IContextKeyService),
    __param(9, IHostService)
], TitlebarPart);
export { TitlebarPart };
/**
 * Main agent sessions titlebar part (for the main window).
 */
let MainTitlebarPart = class MainTitlebarPart extends TitlebarPart {
    constructor(contextMenuService, configurationService, instantiationService, themeService, storageService, layoutService, contextKeyService, hostService) {
        super("workbench.parts.titlebar" /* Parts.TITLEBAR_PART */, mainWindow, contextMenuService, configurationService, instantiationService, themeService, storageService, layoutService, contextKeyService, hostService);
    }
};
MainTitlebarPart = __decorate([
    __param(0, IContextMenuService),
    __param(1, IConfigurationService),
    __param(2, IInstantiationService),
    __param(3, IThemeService),
    __param(4, IStorageService),
    __param(5, IWorkbenchLayoutService),
    __param(6, IContextKeyService),
    __param(7, IHostService)
], MainTitlebarPart);
export { MainTitlebarPart };
/**
 * Auxiliary agent sessions titlebar part (for auxiliary windows).
 */
let AuxiliaryTitlebarPart = class AuxiliaryTitlebarPart extends TitlebarPart {
    static { AuxiliaryTitlebarPart_1 = this; }
    static { this.COUNTER = 1; }
    get height() { return this.minimumHeight; }
    constructor(container, mainTitlebar, contextMenuService, configurationService, instantiationService, themeService, storageService, layoutService, contextKeyService, hostService) {
        const id = AuxiliaryTitlebarPart_1.COUNTER++;
        super(`workbench.parts.auxiliaryTitle.${id}`, getWindow(container), contextMenuService, configurationService, instantiationService, themeService, storageService, layoutService, contextKeyService, hostService);
        this.container = container;
        this.mainTitlebar = mainTitlebar;
    }
    get preventZoom() {
        // Prevent zooming behavior if any of the following conditions are met:
        // 1. Shrinking below the window control size (zoom < 1)
        // 2. No custom items are present in the main title bar
        // The auxiliary title bar never contains any zoomable items itself,
        // but we want to match the behavior of the main title bar.
        return getZoomFactor(getWindow(this.element)) < 1 || !this.mainTitlebar.hasZoomableElements;
    }
};
AuxiliaryTitlebarPart = AuxiliaryTitlebarPart_1 = __decorate([
    __param(2, IContextMenuService),
    __param(3, IConfigurationService),
    __param(4, IInstantiationService),
    __param(5, IThemeService),
    __param(6, IStorageService),
    __param(7, IWorkbenchLayoutService),
    __param(8, IContextKeyService),
    __param(9, IHostService)
], AuxiliaryTitlebarPart);
export { AuxiliaryTitlebarPart };
/**
 * Agent Sessions title service - manages the titlebar parts.
 */
let TitleService = class TitleService extends MultiWindowParts {
    constructor(instantiationService, storageService, themeService) {
        super('workbench.agentSessionsTitleService', themeService, storageService);
        this.instantiationService = instantiationService;
        this.mainPart = this._register(this.createMainTitlebarPart());
        this.onMenubarVisibilityChange = this.mainPart.onMenubarVisibilityChange;
        this._register(this.registerPart(this.mainPart));
    }
    createMainTitlebarPart() {
        return this.instantiationService.createInstance(MainTitlebarPart);
    }
    //#region Auxiliary Titlebar Parts
    createAuxiliaryTitlebarPart(container, editorGroupsContainer, instantiationService) {
        const titlebarPartContainer = $('.part.titlebar', { role: 'none' });
        titlebarPartContainer.style.position = 'relative';
        container.insertBefore(titlebarPartContainer, container.firstChild);
        const disposables = new DisposableStore();
        const titlebarPart = this.doCreateAuxiliaryTitlebarPart(titlebarPartContainer, editorGroupsContainer, instantiationService);
        disposables.add(this.registerPart(titlebarPart));
        disposables.add(Event.runAndSubscribe(titlebarPart.onDidChange, () => titlebarPartContainer.style.height = `${titlebarPart.height}px`));
        titlebarPart.create(titlebarPartContainer);
        Event.once(titlebarPart.onWillDispose)(() => disposables.dispose());
        return titlebarPart;
    }
    doCreateAuxiliaryTitlebarPart(container, _editorGroupsContainer, instantiationService) {
        return instantiationService.createInstance(AuxiliaryTitlebarPart, container, this.mainPart);
    }
    updateProperties(properties) {
        for (const part of this.parts) {
            part.updateProperties(properties);
        }
    }
    registerVariables(variables) {
        for (const part of this.parts) {
            part.registerVariables(variables);
        }
    }
};
TitleService = __decorate([
    __param(0, IInstantiationService),
    __param(1, IStorageService),
    __param(2, IThemeService)
], TitleService);
export { TitleService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGl0bGViYXJQYXJ0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2Vzc2lvbnMvYnJvd3Nlci9wYXJ0cy90aXRsZWJhclBhcnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sa0VBQWtFLENBQUM7QUFDMUUsT0FBTywwQkFBMEIsQ0FBQztBQUNsQyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsSUFBSSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFFNUUsT0FBTyxFQUFFLGFBQWEsRUFBRSxZQUFZLEVBQUUsc0JBQXNCLEVBQUUsWUFBWSxFQUFFLHFCQUFxQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDNUksT0FBTyxFQUFFLGlCQUFpQixFQUFFLGlCQUFpQixFQUFFLDhCQUE4QixFQUFpQixnQkFBZ0IsRUFBRSxzQkFBc0IsRUFBdUIsTUFBTSwyQ0FBMkMsQ0FBQztBQUMvTSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMzRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUN6RSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUNoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDcEUsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQy9FLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxzQkFBc0IsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxXQUFXLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxjQUFjLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNoRyxPQUFPLEVBQUUsS0FBSyxFQUFF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