/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../base/common/lifecycle.js';
import { Event, Emitter } from '../../base/common/event.js';
import { EventType, addDisposableListener, getClientArea, size, isAncestorUsingFlowTo, computeScreenAwareSize, getActiveDocument, getWindows, getActiveWindow, isActiveDocument, getWindow, getWindowId, getActiveElement, Dimension } from '../../base/browser/dom.js';
import { onDidChangeFullscreen, isFullscreen, isWCOEnabled } from '../../base/browser/browser.js';
import { isWindows, isLinux, isMacintosh, isWeb, isIOS } from '../../base/common/platform.js';
import { isResourceEditorInput, pathsToEditors } from '../common/editor.js';
import { SidebarPart } from './parts/sidebar/sidebarPart.js';
import { PanelPart } from './parts/panel/panelPart.js';
import { positionFromString, positionToString, partOpensMaximizedFromString, shouldShowCustomTitleBar, isHorizontal, isMultiWindowPart } from '../services/layout/browser/layoutService.js';
import { isTemporaryWorkspace, IWorkspaceContextService } from '../../platform/workspace/common/workspace.js';
import { IStorageService } from '../../platform/storage/common/storage.js';
import { IConfigurationService, isConfigured } from '../../platform/configuration/common/configuration.js';
import { ITitleService } from '../services/title/browser/titleService.js';
import { ILifecycleService } from '../services/lifecycle/common/lifecycle.js';
import { getMenuBarVisibility, hasNativeTitlebar, hasCustomTitlebar, useWindowControlsOverlay, DEFAULT_EMPTY_WINDOW_SIZE, DEFAULT_WORKSPACE_WINDOW_SIZE, hasNativeMenu } from '../../platform/window/common/window.js';
import { IHostService } from '../services/host/browser/host.js';
import { IBrowserWorkbenchEnvironmentService } from '../services/environment/browser/environmentService.js';
import { IEditorService } from '../services/editor/common/editorService.js';
import { IEditorGroupsService } from '../services/editor/common/editorGroupsService.js';
import { SerializableGrid, Sizing } from '../../base/browser/ui/grid/grid.js';
import { Part } from './part.js';
import { IStatusbarService } from '../services/statusbar/browser/statusbar.js';
import { IFileService } from '../../platform/files/common/files.js';
import { isCodeEditor } from '../../editor/browser/editorBrowser.js';
import { coalesce } from '../../base/common/arrays.js';
import { assertReturnsDefined } from '../../base/common/types.js';
import { INotificationService, NotificationsFilter } from '../../platform/notification/common/notification.js';
import { IThemeService } from '../../platform/theme/common/themeService.js';
import { WINDOW_ACTIVE_BORDER, WINDOW_INACTIVE_BORDER } from '../common/theme.js';
import { URI } from '../../base/common/uri.js';
import { IViewDescriptorService } from '../common/views.js';
import { DiffEditorInput } from '../common/editor/diffEditorInput.js';
import { mark } from '../../base/common/performance.js';
import { IExtensionService } from '../services/extensions/common/extensions.js';
import { ILogService } from '../../platform/log/common/log.js';
import { DeferredPromise, Promises } from '../../base/common/async.js';
import { IBannerService } from '../services/banner/browser/bannerService.js';
import { IPaneCompositePartService } from '../services/panecomposite/browser/panecomposite.js';
import { AuxiliaryBarPart } from './parts/auxiliarybar/auxiliaryBarPart.js';
import { ITelemetryService } from '../../platform/telemetry/common/telemetry.js';
import { IAuxiliaryWindowService } from '../services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { mainWindow } from '../../base/browser/window.js';
var LayoutClasses;
(function (LayoutClasses) {
    LayoutClasses["SIDEBAR_HIDDEN"] = "nosidebar";
    LayoutClasses["MAIN_EDITOR_AREA_HIDDEN"] = "nomaineditorarea";
    LayoutClasses["PANEL_HIDDEN"] = "nopanel";
    LayoutClasses["AUXILIARYBAR_HIDDEN"] = "noauxiliarybar";
    LayoutClasses["STATUSBAR_HIDDEN"] = "nostatusbar";
    LayoutClasses["FULLSCREEN"] = "fullscreen";
    LayoutClasses["MAXIMIZED"] = "maximized";
    LayoutClasses["WINDOW_BORDER"] = "border";
    LayoutClasses["NO_SHADOWS"] = "no-shadows";
})(LayoutClasses || (LayoutClasses = {}));
const COMMAND_CENTER_SETTINGS = [
    'chat.agentsControl.enabled',
    'chat.unifiedAgentsBar.enabled',
    'workbench.navigationControl.enabled',
    'workbench.experimental.share.enabled',
];
export const TITLE_BAR_SETTINGS = [
    "workbench.activityBar.location" /* LayoutSettings.ACTIVITY_BAR_LOCATION */,
    "window.commandCenter" /* LayoutSettings.COMMAND_CENTER */,
    ...COMMAND_CENTER_SETTINGS,
    "workbench.editor.editorActionsLocation" /* LayoutSettings.EDITOR_ACTIONS_LOCATION */,
    "workbench.layoutControl.enabled" /* LayoutSettings.LAYOUT_ACTIONS */,
    "window.menuBarVisibility" /* MenuSettings.MenuBarVisibility */,
    "window.titleBarStyle" /* TitleBarSetting.TITLE_BAR_STYLE */,
    "window.customTitleBarVisibility" /* TitleBarSetting.CUSTOM_TITLE_BAR_VISIBILITY */,
];
const DEFAULT_EMPTY_WINDOW_DIMENSIONS = new Dimension(DEFAULT_EMPTY_WINDOW_SIZE.width, DEFAULT_EMPTY_WINDOW_SIZE.height);
const DEFAULT_WORKSPACE_WINDOW_DIMENSIONS = new Dimension(DEFAULT_WORKSPACE_WINDOW_SIZE.width, DEFAULT_WORKSPACE_WINDOW_SIZE.height);
export class Layout extends Disposable {
    get activeContainer() { return this.getContainerFromDocument(getActiveDocument()); }
    get containers() {
        const containers = [];
        for (const { window } of getWindows()) {
            containers.push(this.getContainerFromDocument(window.document));
        }
        return containers;
    }
    getContainerFromDocument(targetDocument) {
        if (targetDocument === this.mainContainer.ownerDocument) {
            return this.mainContainer; // main window
        }
        else {
            // eslint-disable-next-line no-restricted-syntax
            return targetDocument.body.getElementsByClassName('monaco-workbench')[0]; // auxiliary window
        }
    }
    whenContainerStylesLoaded(window) {
        return this.containerStylesLoaded.get(window.vscodeWindowId);
    }
    get mainContainerDimension() { return this._mainContainerDimension; }
    get activeContainerDimension() {
        return this.getContainerDimension(this.activeContainer);
    }
    getContainerDimension(container) {
        if (container === this.mainContainer) {
            return this.mainContainerDimension; // main window
        }
        else {
            return getClientArea(container); // auxiliary window
        }
    }
    get mainContainerOffset() {
        return this.computeContainerOffset(mainWindow);
    }
    get activeContainerOffset() {
        return this.computeContainerOffset(getWindow(this.activeContainer));
    }
    computeContainerOffset(targetWindow) {
        let top = 0;
        let quickPickTop = 0;
        if (this.isVisible("workbench.parts.banner" /* Parts.BANNER_PART */)) {
            top = this.getPart("workbench.parts.banner" /* Parts.BANNER_PART */).maximumHeight;
            quickPickTop = top;
        }
        const titlebarVisible = this.isVisible("workbench.parts.titlebar" /* Parts.TITLEBAR_PART */, targetWindow);
        if (titlebarVisible) {
            top += this.getPart("workbench.parts.titlebar" /* Parts.TITLEBAR_PART */).maximumHeight;
            quickPickTop = top;
        }
        const isCommandCenterVisible = titlebarVisible && this.configurationService.getValue("window.commandCenter" /* LayoutSettings.COMMAND_CENTER */) !== false;
        if (isCommandCenterVisible) {
            // If the command center is visible then the quickinput
            // should go over the title bar and the banner
            quickPickTop = 6;
        }
        return { top, quickPickTop };
    }
    constructor(parent, layoutOptions) {
        super();
        this.parent = parent;
        this.layoutOptions = layoutOptions;
        //#region Events
        this._onDidChangeZenMode = this._register(new Emitter());
        this.onDidChangeZenMode = this._onDidChangeZenMode.event;
        this._onDidChangeMainEditorCenteredLayout = this._register(new Emitter());
        this.onDidChangeMainEditorCenteredLayout = this._onDidChangeMainEditorCenteredLayout.event;
        this._onDidChangePanelAlignment = this._register(new Emitter());
        this.onDidChangePanelAlignment = this._onDidChangePanelAlignment.event;
        this._onDidChangeWindowMaximized = this._register(new Emitter());
        this.onDidChangeWindowMaximized = this._onDidChangeWindowMaximized.event;
        this._onDidChangePanelPosition = this._register(new Emitter());
        this.onDidChangePanelPosition = this._onDidChangePanelPosition.event;
        this._onDidChangePartVisibility = this._register(new Emitter());
        this.onDidChangePartVisibility = this._onDidChangePartVisibility.event;
        this._onDidChangeNotificationsVisibility = this._register(new Emitter());
        this.onDidChangeNotificationsVisibility = this._onDidChangeNotificationsVisibility.event;
        this._onDidChangeAuxiliaryBarMaximized = this._register(new Emitter());
        this.onDidChangeAuxiliaryBarMaximized = this._onDidChangeAuxiliaryBarMaximized.event;
        this._onDidLayoutMainContainer = this._register(new Emitter());
        this.onDidLayoutMainContainer = this._onDidLayoutMainContainer.event;
        this._onDidLayoutActiveContainer = this._register(new Emitter());
        this.onDidLayoutActiveContainer = this._onDidLayoutActiveContainer.event;
        this._onDidLayoutContainer = this._register(new Emitter());
        this.onDidLayoutContainer = this._onDidLayoutContainer.event;
        this._onDidAddContainer = this._register(new Emitter());
        this.onDidAddContainer = this._onDidAddContainer.event;
        this._onDidChangeActiveContainer = this._register(new Emitter());
        this.onDidChangeActiveContainer = this._onDidChangeActiveContainer.event;
        //#endregion
        //#region Properties
        this.mainContainer = document.createElement('div');
        this.containerStylesLoaded = new Map();
        //#endregion
        this.parts = new Map();
        this.initialized = false;
        this.disposed = false;
        this._openedDefaultEditors = false;
        this.whenReadyPromise = new DeferredPromise();
        this.whenReady = this.whenReadyPromise.p;
        this.whenRestoredPromise = new DeferredPromise();
        this.whenRestored = this.whenRestoredPromise.p;
        this.restored = false;
        this.inMaximizedAuxiliaryBarTransition = false;
    }
    initLayout(accessor) {
        // Services
        this.environmentService = accessor.get(IBrowserWorkbenchEnvironmentService);
        this.configurationService = accessor.get(IConfigurationService);
        this.hostService = accessor.get(IHostService);
        this.contextService = accessor.get(IWorkspaceContextService);
        this.storageService = accessor.get(IStorageService);
        this.themeService = accessor.get(IThemeService);
        this.extensionService = accessor.get(IExtensionService);
        this.logService = accessor.get(ILogService);
        this.telemetryService = accessor.get(ITelemetryService);
        this.auxiliaryWindowService = accessor.get(IAuxiliaryWindowService);
        // Parts
        this.editorService = accessor.get(IEditorService);
        this.editorGroupService = accessor.get(IEditorGroupsService);
        this.mainPartEditorService = this.editorService.createScoped(this.editorGroupService.mainPart, this._store);
        this.paneCompositeService = accessor.get(IPaneCompositePartService);
        this.viewDescriptorService = accessor.get(IViewDescriptorService);
        this.titleService = accessor.get(ITitleService);
        this.notificationService = accessor.get(INotificationService);
        this.statusBarService = accessor.get(IStatusbarService);
        accessor.get(IBannerService);
        // Listeners
        this.registerLayoutListeners();
        // State
        this.initLayoutState(accessor.get(ILifecycleService), accessor.get(IFileService));
    }
    registerLayoutListeners() {
        // Restore editor if hidden and an editor is to show
        const showEditorIfHidden = () => {
            if (this.isVisible("workbench.parts.editor" /* Parts.EDITOR_PART */, mainWindow) || // already visible
                this.mainPartEditorService.visibleEditors.length === 0 // no editor to show
            ) {
                return;
            }
            if (this.isAuxiliaryBarMaximized()) {
                this.toggleMaximizedAuxiliaryBar();
            }
            else {
                this.toggleMaximizedPanel();
            }
        };
        // Maybe maximize auxiliary bar when no editors are visible
        const maybeMaximizeAuxiliaryBar = () => {
            if (this.mainPartEditorService.visibleEditors.length === 0 &&
                this.configurationService.getValue(WorkbenchLayoutSettings.AUXILIARYBAR_FORCE_MAXIMIZED) === true) {
                this.setAuxiliaryBarMaximized(true);
                return true;
            }
            return false;
        };
        // Wait to register these listeners after the editor group service
        // is ready to avoid conflicts on startup
        this.editorGroupService.whenRestored.then(() => {
            // Handle visible editors changing for parts visibility
            this._register(this.mainPartEditorService.onDidVisibleEditorsChange(() => {
                const handled = maybeMaximizeAuxiliaryBar();
                if (!handled) {
                    showEditorIfHidden();
                }
            }));
            this._register(this.editorGroupService.mainPart.onDidActivateGroup(e => {
                if (e.reason !== 1 /* GroupActivationReason.PART_CLOSE */) {
                    showEditorIfHidden(); // only show unless a modal/auxiliary part closes
                }
            }));
            // Revalidate center layout when active editor changes: diff editor quits centered mode
            this._register(this.mainPartEditorService.onDidActiveEditorChange(() => this.centerMainEditorLayout(this.stateModel.getRuntimeValue(LayoutStateKeys.MAIN_EDITOR_CENTERED))));
        });
        // Configuration changes
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            // Layout related
            if ([
                ...TITLE_BAR_SETTINGS,
                LegacyWorkbenchLayoutSettings.SIDEBAR_POSITION,
                LegacyWorkbenchLayoutSettings.STATUSBAR_VISIBLE,
            ].some(setting => e.affectsConfiguration(setting))) {
                // Show Command Center if command center actions enabled
                const enabledCommandCenterAction = COMMAND_CENTER_SETTINGS.some(setting => e.affectsConfiguration(setting) && this.configurationService.getValue(setting) === true);
                if (enabledCommandCenterAction) {
                    if (this.configurationService.getValue("window.commandCenter" /* LayoutSettings.COMMAND_CENTER */) === false) {
                        this.configurationService.updateValue("window.commandCenter" /* LayoutSettings.COMMAND_CENTER */, true);
                        return; // onDidChangeConfiguration will be triggered again
                    }
                }
                // Show Custom TitleBar if actions enabled in (or moved to) the titlebar
                const editorActionsMovedToTitlebar = e.affectsConfiguration("workbench.editor.editorActionsLocation" /* LayoutSettings.EDITOR_ACTIONS_LOCATION */) && this.configurationService.getValue("workbench.editor.editorActionsLocation" /* LayoutSettings.EDITOR_ACTIONS_LOCATION */) === "titleBar" /* EditorActionsLocation.TITLEBAR */;
                const commandCenterEnabled = e.affectsConfiguration("window.commandCenter" /* LayoutSettings.COMMAND_CENTER */) && this.configurationService.getValue("window.commandCenter" /* LayoutSettings.COMMAND_CENTER */);
                const layoutControlsEnabled = e.affectsConfiguration("workbench.layoutControl.enabled" /* LayoutSettings.LAYOUT_ACTIONS */) && this.configurationService.getValue("workbench.layoutControl.enabled" /* LayoutSettings.LAYOUT_ACTIONS */);
                const activityBarMovedToTopOrBottom = e.affectsConfiguration("workbench.activityBar.location" /* LayoutSettings.ACTIVITY_BAR_LOCATION */) && ["top" /* ActivityBarPosition.TOP */, "bottom" /* ActivityBarPosition.BOTTOM */].includes(this.configurationService.getValue("workbench.activityBar.location" /* LayoutSettings.ACTIVITY_BAR_LOCATION */));
                if (activityBarMovedToTopOrBottom || editorActionsMovedToTitlebar || commandCenterEnabled || layoutControlsEnabled) {
                    if (this.configurationService.getValue("window.customTitleBarVisibility" /* TitleBarSetting.CUSTOM_TITLE_BAR_VISIBILITY */) === "never" /* CustomTitleBarVisibility.NEVER */) {
                        this.configurationService.updateValue("window.customTitleBarVisibility" /* TitleBarSetting.CUSTOM_TITLE_BAR_VISIBILITY */, "auto" /* CustomTitleBarVisibility.AUTO */);
                        return; // onDidChangeConfiguration will be triggered again
                    }
                }
                this.doUpdateLayoutConfiguration();
            }
            // Shadows
            if (e.affectsConfiguration("workbench.shadows" /* LayoutSettings.SHADOWS */)) {
                this.updateShadows();
            }
            // Auxiliary Sidebar
            if (e.affectsConfiguration(WorkbenchLayoutSettings.AUXILIARYBAR_FORCE_MAXIMIZED)) {
                const forceMaximized = this.configurationService.getValue(WorkbenchLayoutSettings.AUXILIARYBAR_FORCE_MAXIMIZED);
                if (forceMaximized === true && this.mainPartEditorService.visibleEditors.length === 0) {
                    this.setAuxiliaryBarMaximized(true);
                }
                else if (forceMaximized === false && this.isAuxiliaryBarMaximized()) {
                    this.setAuxiliaryBarMaximized(false);
                }
            }
        }));
        // Fullscreen changes
        this._register(onDidChangeFullscreen(windowId => this.onFullscreenChanged(windowId)));
        // Group changes
        this._register(this.editorGroupService.mainPart.onDidAddGroup(() => this.centerMainEditorLayout(this.stateModel.getRuntimeValue(LayoutStateKeys.MAIN_EDITOR_CENTERED))));
        this._register(this.editorGroupService.mainPart.onDidRemoveGroup(() => this.centerMainEditorLayout(this.stateModel.getRuntimeValue(LayoutStateKeys.MAIN_EDITOR_CENTERED))));
        this._register(this.editorGroupService.mainPart.onDidChangeGroupMaximized(() => this.centerMainEditorLayout(this.stateModel.getRuntimeValue(LayoutStateKeys.MAIN_EDITOR_CENTERED))));
        // Prevent workbench from scrolling #55456
        this._register(addDisposableListener(this.mainContainer, EventType.SCROLL, () => this.mainContainer.scrollTop = 0));
        // Menubar visibility changes
        const showingCustomMenu = (isWindows || isLinux || isWeb) && !hasNativeTitlebar(this.configurationService);
        if (showingCustomMenu) {
            this._register(this.titleService.onMenubarVisibilityChange(visible => this.onMenubarToggled(visible)));
        }
        // Theme changes
        this._register(this.themeService.onDidColorThemeChange(() => this.updateWindowBorder()));
        // Window active / focus changes
        this._register(this.hostService.onDidChangeFocus(focused => this.onWindowFocusChanged(focused)));
        this._register(this.hostService.onDidChangeActiveWindow(() => this.onActiveWindowChanged()));
        // WCO changes
        if (isWeb && typeof navigator.windowControlsOverlay === 'object') {
            this._register(addDisposableListener(navigator.windowControlsOverlay, 'geometrychange', () => this.onDidChangeWCO()));
        }
        // Auxiliary windows
        this._register(this.auxiliaryWindowService.onDidOpenAuxiliaryWindow(({ window, disposables }) => {
            const windowId = window.window.vscodeWindowId;
            this.containerStylesLoaded.set(windowId, window.whenStylesHaveLoaded);
            window.whenStylesHaveLoaded.then(() => this.containerStylesLoaded.delete(windowId));
            disposables.add(toDisposable(() => this.containerStylesLoaded.delete(windowId)));
            const eventDisposables = disposables.add(new DisposableStore());
            this._onDidAddContainer.fire({ container: window.container, disposables: eventDisposables });
            disposables.add(window.onDidLayout(dimension => this.handleContainerDidLayout(window.container, dimension)));
        }));
    }
    onMenubarToggled(visible) {
        if (visible !== this.state.runtime.menuBar.toggled) {
            this.state.runtime.menuBar.toggled = visible;
            const menuBarVisibility = getMenuBarVisibility(this.configurationService);
            // The menu bar toggles the title bar in web because it does not need to be shown for window controls only
            if (isWeb && menuBarVisibility === 'toggle') {
                this.workbenchGrid.setViewVisible(this.titleBarPartView, shouldShowCustomTitleBar(this.configurationService, mainWindow, this.state.runtime.menuBar.toggled));
            }
            // The menu bar toggles the title bar in full screen for toggle and classic settings
            else if (this.state.runtime.mainWindowFullscreen && (menuBarVisibility === 'toggle' || menuBarVisibility === 'classic')) {
                this.workbenchGrid.setViewVisible(this.titleBarPartView, shouldShowCustomTitleBar(this.configurationService, mainWindow, this.state.runtime.menuBar.toggled));
            }
            // Move layout call to any time the menubar
            // is toggled to update consumers of offset
            // see issue #115267
            this.handleContainerDidLayout(this.mainContainer, this._mainContainerDimension);
        }
    }
    handleContainerDidLayout(container, dimension) {
        if (container === this.mainContainer) {
            this._onDidLayoutMainContainer.fire(dimension);
        }
        if (isActiveDocument(container)) {
            this._onDidLayoutActiveContainer.fire(dimension);
        }
        this._onDidLayoutContainer.fire({ container, dimension });
    }
    onFullscreenChanged(windowId) {
        if (windowId !== mainWindow.vscodeWindowId) {
            return; // ignore all but main window
        }
        this.state.runtime.mainWindowFullscreen = isFullscreen(mainWindow);
        // Apply as CSS class
        if (this.state.runtime.mainWindowFullscreen) {
            this.mainContainer.classList.add(LayoutClasses.FULLSCREEN);
        }
        else {
            this.mainContainer.classList.remove(LayoutClasses.FULLSCREEN);
            const zenModeExitInfo = this.stateModel.getRuntimeValue(LayoutStateKeys.ZEN_MODE_EXIT_INFO);
            if (zenModeExitInfo.transitionedToFullScreen && this.isZenModeActive()) {
                this.toggleZenMode();
            }
        }
        // Change edge snapping accordingly
        this.workbenchGrid.edgeSnapping = this.state.runtime.mainWindowFullscreen;
        // Changing fullscreen state of the main window has an impact
        // on custom title bar visibility, so we need to update
        if (hasCustomTitlebar(this.configurationService)) {
            // Propagate to grid
            this.workbenchGrid.setViewVisible(this.titleBarPartView, shouldShowCustomTitleBar(this.configurationService, mainWindow, this.state.runtime.menuBar.toggled));
            // Indicate active window border
            this.updateWindowBorder(true);
        }
    }
    onActiveWindowChanged() {
        const activeContainerId = this.getActiveContainerId();
        if (this.state.runtime.activeContainerId !== activeContainerId) {
            this.state.runtime.activeContainerId = activeContainerId;
            // Indicate active window border
            this.updateWindowBorder();
            this._onDidChangeActiveContainer.fire();
        }
    }
    onWindowFocusChanged(hasFocus) {
        if (this.state.runtime.hasFocus !== hasFocus) {
            this.state.runtime.hasFocus = hasFocus;
            // Indicate active window border
            this.updateWindowBorder();
        }
    }
    getActiveContainerId() {
        const activeContainer = this.activeContainer;
        return getWindow(activeContainer).vscodeWindowId;
    }
    doUpdateLayoutConfiguration(skipLayout) {
        // Custom Titlebar visibility with native titlebar
        this.updateCustomTitleBarVisibility();
        // Menubar visibility
        this.updateMenubarVisibility(!!skipLayout);
        // Centered Layout
        this.editorGroupService.whenRestored.then(() => this.centerMainEditorLayout(this.stateModel.getRuntimeValue(LayoutStateKeys.MAIN_EDITOR_CENTERED), skipLayout));
    }
    isShadowsDisabled() {
        return this.configurationService.getValue("workbench.shadows" /* LayoutSettings.SHADOWS */) === false;
    }
    updateShadows() {
        const noShadows = this.isShadowsDisabled();
        for (const container of Array.from(this.containers)) {
            container.classList.toggle(LayoutClasses.NO_SHADOWS, noShadows);
        }
    }
    setSideBarPosition(position) {
        const activityBar = this.getPart("workbench.parts.activitybar" /* Parts.ACTIVITYBAR_PART */);
        const sideBar = this.getPart("workbench.parts.sidebar" /* Parts.SIDEBAR_PART */);
        const auxiliaryBar = this.getPart("workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */);
        const newPositionValue = (position === 0 /* Position.LEFT */) ? 'left' : 'right';
        const oldPositionValue = (position === 1 /* Position.RIGHT */) ? 'left' : 'right';
        const panelAlignment = this.getPanelAlignment();
        const panelPosition = this.getPanelPosition();
        this.stateModel.setRuntimeValue(LayoutStateKeys.SIDEBAR_POSITON, position);
        // Adjust CSS
        const activityBarContainer = assertReturnsDefined(activityBar.getContainer());
        const sideBarContainer = assertReturnsDefined(sideBar.getContainer());
        const auxiliaryBarContainer = assertReturnsDefined(auxiliaryBar.getContainer());
        activityBarContainer.classList.remove(oldPositionValue);
        sideBarContainer.classList.remove(oldPositionValue);
        activityBarContainer.classList.add(newPositionValue);
        sideBarContainer.classList.add(newPositionValue);
        // Auxiliary Bar has opposite values
        auxiliaryBarContainer.classList.remove(newPositionValue);
        auxiliaryBarContainer.classList.add(oldPositionValue);
        // Update Styles
        activityBar.updateStyles();
        sideBar.updateStyles();
        auxiliaryBar.updateStyles();
        // Move activity bar and side bars
        this.adjustPartPositions(position, panelAlignment, panelPosition);
    }
    updateWindowBorder(skipLayout = false) {
        if (isWeb ||
            isWindows || // not working well with zooming (border often not visible)
            ((isWindows || isLinux) &&
                useWindowControlsOverlay(this.configurationService) // Windows/Linux: not working with WCO (border cannot draw over the overlay)
            ) ||
            hasNativeTitlebar(this.configurationService)) {
            return;
        }
        const theme = this.themeService.getColorTheme();
        const activeBorder = theme.getColor(WINDOW_ACTIVE_BORDER);
        const inactiveBorder = theme.getColor(WINDOW_INACTIVE_BORDER);
        const didHaveMainWindowBorder = this.hasMainWindowBorder();
        for (const container of this.containers) {
            const isMainContainer = container === this.mainContainer;
            const isActiveContainer = this.activeContainer === container;
            let windowBorder = false;
            if (!this.state.runtime.mainWindowFullscreen && (activeBorder || inactiveBorder)) {
                windowBorder = true;
                // If the inactive color is missing, fallback to the active one
                const borderColor = isActiveContainer && this.state.runtime.hasFocus ? activeBorder : inactiveBorder ?? activeBorder;
                container.style.setProperty('--window-border-color', borderColor?.toString() ?? 'transparent');
            }
            if (isMainContainer) {
                this.state.runtime.mainWindowBorder = windowBorder;
            }
            container.classList.toggle(LayoutClasses.WINDOW_BORDER, windowBorder);
        }
        if (!skipLayout && didHaveMainWindowBorder !== this.hasMainWindowBorder()) {
            this.layout();
        }
    }
    initLayoutState(lifecycleService, fileService) {
        this._mainContainerDimension = getClientArea(this.parent, this.contextService.getWorkbenchState() === 1 /* WorkbenchState.EMPTY */ ? DEFAULT_EMPTY_WINDOW_DIMENSIONS : DEFAULT_WORKSPACE_WINDOW_DIMENSIONS); // running with fallback to ensure no error is thrown (https://github.com/microsoft/vscode/issues/240242)
        this.stateModel = new LayoutStateModel(this.storageService, this.configurationService, this.contextService, this.environmentService);
        this.stateModel.load({
            mainContainerDimension: this._mainContainerDimension,
            resetLayout: Boolean(this.layoutOptions?.resetLayout)
        });
        this._register(this.stateModel.onDidChangeState(change => {
            if (change.key === LayoutStateKeys.ACTIVITYBAR_HIDDEN) {
                this.setActivityBarHidden(change.value);
            }
            if (change.key === LayoutStateKeys.STATUSBAR_HIDDEN) {
                this.setStatusBarHidden(change.value);
            }
            if (change.key === LayoutStateKeys.SIDEBAR_POSITON) {
                this.setSideBarPosition(change.value);
            }
            if (change.key === LayoutStateKeys.PANEL_POSITION) {
                this.setPanelPosition(change.value);
            }
            if (change.key === LayoutStateKeys.PANEL_ALIGNMENT) {
                this.setPanelAlignment(change.value);
            }
            this.doUpdateLayoutConfiguration();
        }));
        // Layout Initialization State
        const initialEditorsState = this.getInitialEditorsState();
        if (initialEditorsState) {
            this.logService.trace('Initial editor state', initialEditorsState);
        }
        const initialLayoutState = {
            layout: {
                editors: initialEditorsState?.layout
            },
            editor: {
                restoreEditors: this.shouldRestoreEditors(this.contextService, initialEditorsState),
                editorsToOpen: this.resolveEditorsToOpen(fileService, initialEditorsState),
            },
            views: {
                defaults: this.getDefaultLayoutViews(this.environmentService, this.storageService),
                containerToRestore: {}
            }
        };
        // Layout Runtime State
        const layoutRuntimeState = {
            activeContainerId: this.getActiveContainerId(),
            mainWindowFullscreen: isFullscreen(mainWindow),
            hasFocus: this.hostService.hasFocus,
            maximized: new Set(),
            mainWindowBorder: false,
            menuBar: {
                toggled: false,
            },
            zenMode: {
                transitionDisposables: new DisposableMap(),
            }
        };
        this.state = {
            initialization: initialLayoutState,
            runtime: layoutRuntimeState,
        };
        // Sidebar View Container To Restore
        if (this.isVisible("workbench.parts.sidebar" /* Parts.SIDEBAR_PART */)) {
            let viewContainerToRestore = this.storageService.get(SidebarPart.activeViewletSettingsKey, 1 /* StorageScope.WORKSPACE */, this.viewDescriptorService.getDefaultViewContainer(0 /* ViewContainerLocation.Sidebar */)?.id);
            if (!this.environmentService.isBuilt ||
                lifecycleService.startupKind === 3 /* StartupKind.ReloadedWindow */ ||
                this.environmentService.isExtensionDevelopment && !this.environmentService.extensionTestsLocationURI) {
                // allow to restore a non-default viewlet in development mode or when window reloads
            }
            else if (viewContainerToRestore !== this.viewDescriptorService.getDefaultViewContainer(0 /* ViewContainerLocation.Sidebar */)?.id &&
                viewContainerToRestore !== this.viewDescriptorService.getDefaultViewContainer(2 /* ViewContainerLocation.AuxiliaryBar */)?.id) {
                // fallback to default viewlet otherwise if the viewlet is not a default viewlet
                viewContainerToRestore = this.viewDescriptorService.getDefaultViewContainer(0 /* ViewContainerLocation.Sidebar */)?.id;
            }
            if (viewContainerToRestore) {
                this.state.initialization.views.containerToRestore.sideBar = viewContainerToRestore;
            }
            else {
                this.stateModel.setRuntimeValue(LayoutStateKeys.SIDEBAR_HIDDEN, true);
            }
        }
        // Panel View Container To Restore
        if (this.isVisible("workbench.parts.panel" /* Parts.PANEL_PART */)) {
            const viewContainerToRestore = this.storageService.get(PanelPart.activePanelSettingsKey, 1 /* StorageScope.WORKSPACE */, this.viewDescriptorService.getDefaultViewContainer(1 /* ViewContainerLocation.Panel */)?.id);
            if (viewContainerToRestore) {
                this.state.initialization.views.containerToRestore.panel = viewContainerToRestore;
            }
            else {
                this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_HIDDEN, true);
            }
        }
        // Auxiliary View to restore
        if (this.isVisible("workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */)) {
            const viewContainerToRestore = this.storageService.get(AuxiliaryBarPart.activeViewSettingsKey, 1 /* StorageScope.WORKSPACE */, this.viewDescriptorService.getDefaultViewContainer(2 /* ViewContainerLocation.AuxiliaryBar */)?.id);
            if (viewContainerToRestore) {
                this.state.initialization.views.containerToRestore.auxiliaryBar = viewContainerToRestore;
            }
            else {
                this.stateModel.setRuntimeValue(LayoutStateKeys.AUXILIARYBAR_HIDDEN, true);
            }
        }
        // Window border
        this.updateWindowBorder(true);
    }
    getDefaultLayoutViews(environmentService, storageService) {
        const defaultLayout = environmentService.options?.defaultLayout;
        if (!defaultLayout) {
            return undefined;
        }
        if (!defaultLayout.force && !storageService.isNew(1 /* StorageScope.WORKSPACE */)) {
            return undefined;
        }
        const { views } = defaultLayout;
        if (views?.length) {
            return views.map(view => view.id);
        }
        return undefined;
    }
    shouldRestoreEditors(contextService, initialEditorsState) {
        // Restore editors based on a set of rules:
        // - never when running on temporary workspace
        // - never when `workbench.editor.restoreEditors` is disabled
        // - not when we have files to open, unless:
        // - always when `window.restoreWindows: preserve`
        if (isTemporaryWorkspace(contextService.getWorkspace())) {
            return false;
        }
        if (this.configurationService.getValue(WorkbenchLayoutSettings.EDITOR_RESTORE_EDITORS) === false) {
            return false;
        }
        const forceRestoreEditors = this.configurationService.getValue('window.restoreWindows') === 'preserve';
        return !!forceRestoreEditors || initialEditorsState === undefined;
    }
    willRestoreEditors() {
        return this.state.initialization.editor.restoreEditors;
    }
    async resolveEditorsToOpen(fileService, initialEditorsState) {
        if (initialEditorsState) {
            // Merge editor (single)
            const filesToMerge = coalesce(await pathsToEditors(initialEditorsState.filesToMerge, fileService, this.logService));
            if (filesToMerge.length === 4 && isResourceEditorInput(filesToMerge[0]) && isResourceEditorInput(filesToMerge[1]) && isResourceEditorInput(filesToMerge[2]) && isResourceEditorInput(filesToMerge[3])) {
                return [{
                        editor: {
                            input1: { resource: filesToMerge[0].resource },
                            input2: { resource: filesToMerge[1].resource },
                            base: { resource: filesToMerge[2].resource },
                            result: { resource: filesToMerge[3].resource },
                            options: { pinned: true }
                        }
                    }];
            }
            // Diff editor (single)
            const filesToDiff = coalesce(await pathsToEditors(initialEditorsState.filesToDiff, fileService, this.logService));
            if (filesToDiff.length === 2) {
                return [{
                        editor: {
                            original: { resource: filesToDiff[0].resource },
                            modified: { resource: filesToDiff[1].resource },
                            options: { pinned: true }
                        }
                    }];
            }
            // Normal editor (multiple)
            const filesToOpenOrCreate = [];
            const resolvedFilesToOpenOrCreate = await pathsToEditors(initialEditorsState.filesToOpenOrCreate, fileService, this.logService);
            for (let i = 0; i < resolvedFilesToOpenOrCreate.length; i++) {
                const resolvedFileToOpenOrCreate = resolvedFilesToOpenOrCreate[i];
                if (resolvedFileToOpenOrCreate) {
                    filesToOpenOrCreate.push({
                        editor: resolvedFileToOpenOrCreate,
                        viewColumn: initialEditorsState.filesToOpenOrCreate?.[i].viewColumn // take over `viewColumn` from initial state
                    });
                }
            }
            return filesToOpenOrCreate;
        }
        // Empty workbench configured to open untitled file if empty
        else if (this.contextService.getWorkbenchState() === 1 /* WorkbenchState.EMPTY */ && this.configurationService.getValue('workbench.startupEditor') === 'newUntitledFile') {
            if (this.editorGroupService.hasRestorableState) {
                return []; // do not open any empty untitled file if we restored groups/editors from previous session
            }
            return [{
                    editor: { resource: undefined } // open empty untitled file
                }];
        }
        return [];
    }
    get openedDefaultEditors() { return this._openedDefaultEditors; }
    getInitialEditorsState() {
        // Check for editors / editor layout from `defaultLayout` options first
        const defaultLayout = this.environmentService.options?.defaultLayout;
        if ((defaultLayout?.editors?.length || defaultLayout?.layout?.editors) && (defaultLayout.force || this.storageService.isNew(1 /* StorageScope.WORKSPACE */))) {
            this._openedDefaultEditors = true;
            return {
                layout: defaultLayout.layout?.editors,
                filesToOpenOrCreate: defaultLayout?.editors?.map(editor => {
                    return {
                        viewColumn: editor.viewColumn,
                        fileUri: URI.revive(editor.uri),
                        openOnlyIfExists: editor.openOnlyIfExists,
                        options: editor.options
                    };
                })
            };
        }
        // Then check for files to open, create or diff/merge from main side
        const { filesToOpenOrCreate, filesToDiff, filesToMerge } = this.environmentService;
        if (filesToOpenOrCreate || filesToDiff || filesToMerge) {
            return { filesToOpenOrCreate, filesToDiff, filesToMerge };
        }
        return undefined;
    }
    isRestored() {
        return this.restored;
    }
    restoreParts() {
        // distinguish long running restore operations that
        // are required for the layout to be ready from those
        // that are needed to signal restoring is done
        const layoutReadyPromises = [];
        const layoutRestoredPromises = [];
        // Restore editors
        layoutReadyPromises.push((async () => {
            mark('code/willRestoreEditors');
            // first ensure the editor part is ready
            await this.editorGroupService.whenReady;
            mark('code/restoreEditors/editorGroupsReady');
            // apply editor layout if any
            if (this.state.initialization.layout?.editors) {
                this.editorGroupService.mainPart.applyLayout(this.state.initialization.layout.editors);
            }
            // then see for editors to open as instructed
            // it is important that we trigger this from
            // the overall restore flow to reduce possible
            // flicker on startup: we want any editor to
            // open to get a chance to open first before
            // signaling that layout is restored, but we do
            // not need to await the editors from having
            // fully loaded.
            const editors = await this.state.initialization.editor.editorsToOpen;
            mark('code/restoreEditors/editorsToOpenResolved');
            let openEditorsPromise = undefined;
            if (editors.length) {
                // we have to map editors to their groups as instructed
                // by the input. this is important to ensure that we open
                // the editors in the groups they belong to.
                const editorGroupsInVisualOrder = this.editorGroupService.mainPart.getGroups(2 /* GroupsOrder.GRID_APPEARANCE */);
                const mapEditorsToGroup = new Map();
                for (const editor of editors) {
                    const group = editorGroupsInVisualOrder[(editor.viewColumn ?? 1) - 1]; // viewColumn is index+1 based
                    let editorsByGroup = mapEditorsToGroup.get(group.id);
                    if (!editorsByGroup) {
                        editorsByGroup = new Set();
                        mapEditorsToGroup.set(group.id, editorsByGroup);
                    }
                    editorsByGroup.add(editor.editor);
                }
                openEditorsPromise = Promise.all(Array.from(mapEditorsToGroup).map(async ([groupId, editors]) => {
                    try {
                        await this.editorService.openEditors(Array.from(editors), groupId, { validateTrust: true });
                    }
                    catch (error) {
                        this.logService.error(error);
                    }
                }));
            }
            // do not block the overall layout ready flow from potentially
            // slow editors to resolve on startup
            layoutRestoredPromises.push(Promise.all([
                openEditorsPromise?.finally(() => mark('code/restoreEditors/editorsOpened')),
                this.editorGroupService.whenRestored.finally(() => mark('code/restoreEditors/editorGroupsRestored'))
            ]).finally(() => {
                // the `code/didRestoreEditors` perf mark is specifically
                // for when visible editors have resolved, so we only mark
                // if when editor group service has restored.
                mark('code/didRestoreEditors');
            }));
        })());
        // Restore default views (only when `IDefaultLayout` is provided)
        const restoreDefaultViewsPromise = (async () => {
            if (this.state.initialization.views.defaults?.length) {
                mark('code/willOpenDefaultViews');
                const locationsRestored = [];
                const tryOpenView = (view) => {
                    const location = this.viewDescriptorService.getViewLocationById(view.id);
                    if (location !== null) {
                        const container = this.viewDescriptorService.getViewContainerByViewId(view.id);
                        if (container) {
                            if (view.order >= (locationsRestored?.[location]?.order ?? 0)) {
                                locationsRestored[location] = { id: container.id, order: view.order };
                            }
                            const containerModel = this.viewDescriptorService.getViewContainerModel(container);
                            containerModel.setCollapsed(view.id, false);
                            containerModel.setVisible(view.id, true);
                            return true;
                        }
                    }
                    return false;
                };
                const defaultViews = [...this.state.initialization.views.defaults].reverse().map((v, index) => ({ id: v, order: index }));
                let i = defaultViews.length;
                while (i) {
                    i--;
                    if (tryOpenView(defaultViews[i])) {
                        defaultViews.splice(i, 1);
                    }
                }
                // If we still have views left over, wait until all extensions have been registered and try again
                if (defaultViews.length) {
                    await this.extensionService.whenInstalledExtensionsRegistered();
                    let i = defaultViews.length;
                    while (i) {
                        i--;
                        if (tryOpenView(defaultViews[i])) {
                            defaultViews.splice(i, 1);
                        }
                    }
                }
                // If we opened a view in the sidebar, stop any restore there
                if (locationsRestored[0 /* ViewContainerLocation.Sidebar */]) {
                    this.state.initialization.views.containerToRestore.sideBar = locationsRestored[0 /* ViewContainerLocation.Sidebar */].id;
                }
                // If we opened a view in the panel, stop any restore there
                if (locationsRestored[1 /* ViewContainerLocation.Panel */]) {
                    this.state.initialization.views.containerToRestore.panel = locationsRestored[1 /* ViewContainerLocation.Panel */].id;
                }
                // If we opened a view in the auxiliary bar, stop any restore there
                if (locationsRestored[2 /* ViewContainerLocation.AuxiliaryBar */]) {
                    this.state.initialization.views.containerToRestore.auxiliaryBar = locationsRestored[2 /* ViewContainerLocation.AuxiliaryBar */].id;
                }
                mark('code/didOpenDefaultViews');
            }
        })();
        layoutReadyPromises.push(restoreDefaultViewsPromise);
        // Restore Sidebar
        layoutReadyPromises.push((async () => {
            // Restoring views could mean that sidebar already
            // restored, as such we need to test again
            await restoreDefaultViewsPromise;
            if (!this.state.initialization.views.containerToRestore.sideBar) {
                return;
            }
            mark('code/willRestoreViewlet');
            await this.openViewContainer(0 /* ViewContainerLocation.Sidebar */, this.state.initialization.views.containerToRestore.sideBar);
            mark('code/didRestoreViewlet');
        })());
        // Restore Panel
        layoutReadyPromises.push((async () => {
            // Restoring views could mean that panel already
            // restored, as such we need to test again
            await restoreDefaultViewsPromise;
            if (!this.state.initialization.views.containerToRestore.panel) {
                return;
            }
            mark('code/willRestorePanel');
            await this.openViewContainer(1 /* ViewContainerLocation.Panel */, this.state.initialization.views.containerToRestore.panel);
            mark('code/didRestorePanel');
        })());
        // Restore Auxiliary Bar
        layoutReadyPromises.push((async () => {
            // Restoring views could mean that auxbar already
            // restored, as such we need to test again
            await restoreDefaultViewsPromise;
            if (!this.state.initialization.views.containerToRestore.auxiliaryBar) {
                return;
            }
            mark('code/willRestoreAuxiliaryBar');
            await this.openViewContainer(2 /* ViewContainerLocation.AuxiliaryBar */, this.state.initialization.views.containerToRestore.auxiliaryBar);
            mark('code/didRestoreAuxiliaryBar');
        })());
        // Restore Zen Mode
        const zenModeWasActive = this.isZenModeActive();
        const restoreZenMode = getZenModeConfiguration(this.configurationService).restore;
        if (zenModeWasActive) {
            this.setZenModeActive(!restoreZenMode);
            this.toggleZenMode(false, true);
        }
        // Restore Main Editor Center Mode
        if (this.stateModel.getRuntimeValue(LayoutStateKeys.MAIN_EDITOR_CENTERED)) {
            this.centerMainEditorLayout(true, true);
        }
        // Await for promises that we recorded to update
        // our ready and restored states properly.
        Promises.settled(layoutReadyPromises).finally(() => {
            // Focus the active maximized part in case we have
            // not yet focused a specific element and panel
            // or auxiliary bar are maximized.
            if (getActiveElement() === mainWindow.document.body && (this.isPanelMaximized() || this.isAuxiliaryBarMaximized())) {
                this.focus();
            }
            this.whenReadyPromise.complete();
            Promises.settled(layoutRestoredPromises).finally(() => {
                if (this.editorService.editors.length === 0 && // no editors opened or restored
                    this.isVisible("workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */) && // auxiliary bar is visible
                    !this.hasFocus("workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */) && // auxiliary bar does not have focus yet
                    !this.environmentService.enableSmokeTestDriver // not in smoke test mode (where focus is sensitive)
                ) {
                    this.focusPart("workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */);
                }
                this.restored = true;
                this.whenRestoredPromise.complete();
            });
        });
    }
    async openViewContainer(location, id, focus) {
        let viewContainer = await this.paneCompositeService.openPaneComposite(id, location, focus);
        if (viewContainer) {
            return;
        }
        // fallback to default view container
        viewContainer = await this.paneCompositeService.openPaneComposite(this.viewDescriptorService.getDefaultViewContainer(location)?.id, location, focus);
        if (viewContainer) {
            return;
        }
        // finally try to just open the first visible view container
        await this.paneCompositeService.openPaneComposite(this.paneCompositeService.getVisiblePaneCompositeIds(location).at(0), location, focus);
    }
    registerPart(part) {
        const id = part.getId();
        this.parts.set(id, part);
        return toDisposable(() => this.parts.delete(id));
    }
    getPart(key) {
        const part = this.parts.get(key);
        if (!part) {
            throw new Error(`Unknown part ${key}`);
        }
        return part;
    }
    registerNotifications(delegate) {
        this._register(delegate.onDidChangeNotificationsVisibility(visible => this._onDidChangeNotificationsVisibility.fire(visible)));
    }
    hasFocus(part) {
        const container = this.getContainer(getActiveWindow(), part);
        if (!container) {
            return false;
        }
        const activeElement = getActiveElement();
        if (!activeElement) {
            return false;
        }
        return isAncestorUsingFlowTo(activeElement, container);
    }
    _getFocusedPart() {
        for (const part of this.parts.keys()) {
            if (this.hasFocus(part)) {
                return part;
            }
        }
        return undefined;
    }
    focusPart(part, targetWindow = mainWindow) {
        const container = this.getContainer(targetWindow, part) ?? this.mainContainer;
        switch (part) {
            case "workbench.parts.editor" /* Parts.EDITOR_PART */:
                this.editorGroupService.getPart(container).activeGroup.focus();
                break;
            case "workbench.parts.panel" /* Parts.PANEL_PART */: {
                this.paneCompositeService.getActivePaneComposite(1 /* ViewContainerLocation.Panel */)?.focus();
                break;
            }
            case "workbench.parts.sidebar" /* Parts.SIDEBAR_PART */: {
                this.paneCompositeService.getActivePaneComposite(0 /* ViewContainerLocation.Sidebar */)?.focus();
                break;
            }
            case "workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */: {
                this.paneCompositeService.getActivePaneComposite(2 /* ViewContainerLocation.AuxiliaryBar */)?.focus();
                break;
            }
            case "workbench.parts.activitybar" /* Parts.ACTIVITYBAR_PART */:
                this.getPart("workbench.parts.sidebar" /* Parts.SIDEBAR_PART */).focusActivityBar();
                break;
            case "workbench.parts.statusbar" /* Parts.STATUSBAR_PART */:
                this.statusBarService.getPart(container).focus();
                break;
            default: {
                container?.focus();
            }
        }
    }
    getContainer(targetWindow, part) {
        if (typeof part === 'undefined') {
            return this.getContainerFromDocument(targetWindow.document);
        }
        if (targetWindow === mainWindow) {
            return this.getPart(part).getContainer();
        }
        // Only some parts are supported for auxiliary windows
        let partCandidate;
        if (part === "workbench.parts.editor" /* Parts.EDITOR_PART */) {
            partCandidate = this.editorGroupService.getPart(this.getContainerFromDocument(targetWindow.document));
        }
        else if (part === "workbench.parts.statusbar" /* Parts.STATUSBAR_PART */) {
            partCandidate = this.statusBarService.getPart(this.getContainerFromDocument(targetWindow.document));
        }
        else if (part === "workbench.parts.titlebar" /* Parts.TITLEBAR_PART */) {
            partCandidate = this.titleService.getPart(this.getContainerFromDocument(targetWindow.document));
        }
        if (partCandidate instanceof Part) {
            return partCandidate.getContainer();
        }
        return undefined;
    }
    isVisible(part, targetWindow = mainWindow) {
        if (targetWindow !== mainWindow && part === "workbench.parts.editor" /* Parts.EDITOR_PART */) {
            return true; // cannot hide editor part in auxiliary windows
        }
        switch (part) {
            case "workbench.parts.titlebar" /* Parts.TITLEBAR_PART */:
                return this.initialized ?
                    this.workbenchGrid.isViewVisible(this.titleBarPartView) :
                    shouldShowCustomTitleBar(this.configurationService, mainWindow, this.state.runtime.menuBar.toggled);
            case "workbench.parts.sidebar" /* Parts.SIDEBAR_PART */:
                return !this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_HIDDEN);
            case "workbench.parts.panel" /* Parts.PANEL_PART */:
                return !this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_HIDDEN);
            case "workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */:
                return !this.stateModel.getRuntimeValue(LayoutStateKeys.AUXILIARYBAR_HIDDEN);
            case "workbench.parts.statusbar" /* Parts.STATUSBAR_PART */:
                return !this.stateModel.getRuntimeValue(LayoutStateKeys.STATUSBAR_HIDDEN);
            case "workbench.parts.activitybar" /* Parts.ACTIVITYBAR_PART */:
                return !this.stateModel.getRuntimeValue(LayoutStateKeys.ACTIVITYBAR_HIDDEN);
            case "workbench.parts.editor" /* Parts.EDITOR_PART */:
                return !this.stateModel.getRuntimeValue(LayoutStateKeys.EDITOR_HIDDEN);
            case "workbench.parts.banner" /* Parts.BANNER_PART */:
                return this.initialized ? this.workbenchGrid.isViewVisible(this.bannerPartView) : false;
            default:
                return false; // any other part cannot be hidden
        }
    }
    shouldShowBannerFirst() {
        return isWeb && !isWCOEnabled();
    }
    focus() {
        if (this.isPanelMaximized() && this.mainContainer === this.activeContainer) {
            this.focusPart("workbench.parts.panel" /* Parts.PANEL_PART */);
        }
        else if (this.isAuxiliaryBarMaximized() && this.mainContainer === this.activeContainer) {
            this.focusPart("workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */);
        }
        else {
            this.focusPart("workbench.parts.editor" /* Parts.EDITOR_PART */, getWindow(this.activeContainer));
        }
    }
    focusPanelOrEditor() {
        const activePanel = this.paneCompositeService.getActivePaneComposite(1 /* ViewContainerLocation.Panel */);
        if ((this.hasFocus("workbench.parts.panel" /* Parts.PANEL_PART */) || !this.isVisible("workbench.parts.editor" /* Parts.EDITOR_PART */)) && activePanel) {
            activePanel.focus(); // prefer panel if it has focus or editor is hidden
        }
        else {
            this.focus(); // otherwise focus editor
        }
    }
    getMaximumEditorDimensions(container) {
        const targetWindow = getWindow(container);
        const containerDimension = this.getContainerDimension(container);
        if (container === this.mainContainer) {
            const isPanelHorizontal = isHorizontal(this.getPanelPosition());
            const takenWidth = (this.isVisible("workbench.parts.activitybar" /* Parts.ACTIVITYBAR_PART */) ? this.activityBarPartView.minimumWidth : 0) +
                (this.isVisible("workbench.parts.sidebar" /* Parts.SIDEBAR_PART */) ? this.sideBarPartView.minimumWidth : 0) +
                (this.isVisible("workbench.parts.panel" /* Parts.PANEL_PART */) && !isPanelHorizontal ? this.panelPartView.minimumWidth : 0) +
                (this.isVisible("workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */) ? this.auxiliaryBarPartView.minimumWidth : 0);
            const takenHeight = (this.isVisible("workbench.parts.titlebar" /* Parts.TITLEBAR_PART */, targetWindow) ? this.titleBarPartView.minimumHeight : 0) +
                (this.isVisible("workbench.parts.statusbar" /* Parts.STATUSBAR_PART */, targetWindow) ? this.statusBarPartView.minimumHeight : 0) +
                (this.isVisible("workbench.parts.panel" /* Parts.PANEL_PART */) && isPanelHorizontal ? this.panelPartView.minimumHeight : 0);
            const availableWidth = containerDimension.width - takenWidth;
            const availableHeight = containerDimension.height - takenHeight;
            return { width: availableWidth, height: availableHeight };
        }
        else {
            const takenHeight = (this.isVisible("workbench.parts.titlebar" /* Parts.TITLEBAR_PART */, targetWindow) ? this.titleBarPartView.minimumHeight : 0) +
                (this.isVisible("workbench.parts.statusbar" /* Parts.STATUSBAR_PART */, targetWindow) ? this.statusBarPartView.minimumHeight : 0);
            return { width: containerDimension.width, height: containerDimension.height - takenHeight };
        }
    }
    isZenModeActive() {
        return this.stateModel.getRuntimeValue(LayoutStateKeys.ZEN_MODE_ACTIVE);
    }
    setZenModeActive(active) {
        this.stateModel.setRuntimeValue(LayoutStateKeys.ZEN_MODE_ACTIVE, active);
    }
    toggleZenMode(skipLayout, restoring = false) {
        const focusedPartPreTransition = this._getFocusedPart();
        this.setZenModeActive(!this.isZenModeActive());
        this.state.runtime.zenMode.transitionDisposables.clearAndDisposeAll();
        const setLineNumbers = (lineNumbers) => {
            for (const editor of this.mainPartEditorService.visibleTextEditorControls) {
                // To properly reset line numbers we need to read the configuration for each editor respecting it's uri.
                if (!lineNumbers && isCodeEditor(editor) && editor.hasModel()) {
                    const model = editor.getModel();
                    lineNumbers = this.configurationService.getValue('editor.lineNumbers', { resource: model.uri, overrideIdentifier: model.getLanguageId() });
                }
                if (!lineNumbers) {
                    lineNumbers = this.configurationService.getValue('editor.lineNumbers');
                }
                editor.updateOptions({ lineNumbers });
            }
        };
        // Check if zen mode transitioned to full screen and if now we are out of zen mode
        // -> we need to go out of full screen (same goes for the centered editor layout)
        let toggleMainWindowFullScreen = false;
        const config = getZenModeConfiguration(this.configurationService);
        const zenModeExitInfo = this.stateModel.getRuntimeValue(LayoutStateKeys.ZEN_MODE_EXIT_INFO);
        // Zen Mode Active
        if (this.isZenModeActive()) {
            toggleMainWindowFullScreen = !this.state.runtime.mainWindowFullscreen && config.fullScreen && !isIOS;
            if (!restoring) {
                zenModeExitInfo.transitionedToFullScreen = toggleMainWindowFullScreen;
                zenModeExitInfo.transitionedToCenteredEditorLayout = !this.isMainEditorLayoutCentered() && config.centerLayout;
                zenModeExitInfo.handleNotificationsDoNotDisturbMode = this.notificationService.getFilter() === NotificationsFilter.OFF;
                zenModeExitInfo.wasVisible.sideBar = this.isVisible("workbench.parts.sidebar" /* Parts.SIDEBAR_PART */);
                zenModeExitInfo.wasVisible.panel = this.isVisible("workbench.parts.panel" /* Parts.PANEL_PART */);
                zenModeExitInfo.wasVisible.auxiliaryBar = this.isVisible("workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */);
                this.stateModel.setRuntimeValue(LayoutStateKeys.ZEN_MODE_EXIT_INFO, zenModeExitInfo);
            }
            this.setPanelHidden(true, true);
            this.setAuxiliaryBarHidden(true, true);
            this.setSideBarHidden(true);
            if (config.hideActivityBar) {
                this.setActivityBarHidden(true);
            }
            if (config.hideStatusBar) {
                this.setStatusBarHidden(true);
            }
            if (config.hideLineNumbers) {
                setLineNumbers('off');
                this.state.runtime.zenMode.transitionDisposables.set("zenMode.hideLineNumbers" /* ZenModeSettings.HIDE_LINENUMBERS */, this.mainPartEditorService.onDidVisibleEditorsChange(() => setLineNumbers('off')));
            }
            if (config.showTabs !== this.editorGroupService.partOptions.showTabs) {
                this.state.runtime.zenMode.transitionDisposables.set("zenMode.showTabs" /* ZenModeSettings.SHOW_TABS */, this.editorGroupService.mainPart.enforcePartOptions({ showTabs: config.showTabs }));
            }
            if (config.silentNotifications && zenModeExitInfo.handleNotificationsDoNotDisturbMode) {
                this.notificationService.setFilter(NotificationsFilter.ERROR);
            }
            if (config.centerLayout) {
                this.centerMainEditorLayout(true, true);
            }
            // Zen Mode Configuration Changes
            this.state.runtime.zenMode.transitionDisposables.set('configurationChange', this.configurationService.onDidChangeConfiguration(e => {
                // Activity Bar
                if (e.affectsConfiguration("zenMode.hideActivityBar" /* ZenModeSettings.HIDE_ACTIVITYBAR */) || e.affectsConfiguration("workbench.activityBar.location" /* LayoutSettings.ACTIVITY_BAR_LOCATION */)) {
                    const zenModeHideActivityBar = this.configurationService.getValue("zenMode.hideActivityBar" /* ZenModeSettings.HIDE_ACTIVITYBAR */);
                    const activityBarLocation = this.configurationService.getValue("workbench.activityBar.location" /* LayoutSettings.ACTIVITY_BAR_LOCATION */);
                    this.setActivityBarHidden(zenModeHideActivityBar ? true : (activityBarLocation === "top" /* ActivityBarPosition.TOP */ || activityBarLocation === "bottom" /* ActivityBarPosition.BOTTOM */));
                }
                // Status Bar
                if (e.affectsConfiguration("zenMode.hideStatusBar" /* ZenModeSettings.HIDE_STATUSBAR */)) {
                    const zenModeHideStatusBar = this.configurationService.getValue("zenMode.hideStatusBar" /* ZenModeSettings.HIDE_STATUSBAR */);
                    this.setStatusBarHidden(zenModeHideStatusBar);
                }
                // Center Layout
                if (e.affectsConfiguration("zenMode.centerLayout" /* ZenModeSettings.CENTER_LAYOUT */)) {
                    const zenModeCenterLayout = this.configurationService.getValue("zenMode.centerLayout" /* ZenModeSettings.CENTER_LAYOUT */);
                    this.centerMainEditorLayout(zenModeCenterLayout, true);
                }
                // Show Tabs
                if (e.affectsConfiguration("zenMode.showTabs" /* ZenModeSettings.SHOW_TABS */)) {
                    const zenModeShowTabs = this.configurationService.getValue("zenMode.showTabs" /* ZenModeSettings.SHOW_TABS */) ?? 'multiple';
                    this.state.runtime.zenMode.transitionDisposables.set("zenMode.showTabs" /* ZenModeSettings.SHOW_TABS */, this.editorGroupService.mainPart.enforcePartOptions({ showTabs: zenModeShowTabs }));
                }
                // Notifications
                if (e.affectsConfiguration("zenMode.silentNotifications" /* ZenModeSettings.SILENT_NOTIFICATIONS */)) {
                    const zenModeSilentNotifications = !!this.configurationService.getValue("zenMode.silentNotifications" /* ZenModeSettings.SILENT_NOTIFICATIONS */);
                    if (zenModeExitInfo.handleNotificationsDoNotDisturbMode) {
                        this.notificationService.setFilter(zenModeSilentNotifications ? NotificationsFilter.ERROR : NotificationsFilter.OFF);
                    }
                }
                // Center Layout
                if (e.affectsConfiguration("zenMode.hideLineNumbers" /* ZenModeSettings.HIDE_LINENUMBERS */)) {
                    const lineNumbersType = this.configurationService.getValue("zenMode.hideLineNumbers" /* ZenModeSettings.HIDE_LINENUMBERS */) ? 'off' : undefined;
                    setLineNumbers(lineNumbersType);
                    this.state.runtime.zenMode.transitionDisposables.set("zenMode.hideLineNumbers" /* ZenModeSettings.HIDE_LINENUMBERS */, this.mainPartEditorService.onDidVisibleEditorsChange(() => setLineNumbers(lineNumbersType)));
                }
            }));
        }
        // Zen Mode Inactive
        else {
            if (zenModeExitInfo.wasVisible.panel) {
                this.setPanelHidden(false, true);
            }
            if (zenModeExitInfo.wasVisible.auxiliaryBar) {
                this.setAuxiliaryBarHidden(false, true);
            }
            if (zenModeExitInfo.wasVisible.sideBar) {
                this.setSideBarHidden(false);
            }
            if (!this.stateModel.getRuntimeValue(LayoutStateKeys.ACTIVITYBAR_HIDDEN, true)) {
                this.setActivityBarHidden(false);
            }
            if (!this.stateModel.getRuntimeValue(LayoutStateKeys.STATUSBAR_HIDDEN, true)) {
                this.setStatusBarHidden(false);
            }
            if (zenModeExitInfo.transitionedToCenteredEditorLayout) {
                this.centerMainEditorLayout(false, true);
            }
            if (zenModeExitInfo.handleNotificationsDoNotDisturbMode) {
                this.notificationService.setFilter(NotificationsFilter.OFF);
            }
            setLineNumbers();
            toggleMainWindowFullScreen = zenModeExitInfo.transitionedToFullScreen && this.state.runtime.mainWindowFullscreen;
        }
        if (!skipLayout) {
            this.layout();
        }
        if (toggleMainWindowFullScreen) {
            this.hostService.toggleFullScreen(mainWindow);
        }
        // restore focus if part is still visible, otherwise fallback to editor
        if (focusedPartPreTransition && this.isVisible(focusedPartPreTransition, getWindow(this.activeContainer))) {
            if (isMultiWindowPart(focusedPartPreTransition)) {
                this.focusPart(focusedPartPreTransition, getWindow(this.activeContainer));
            }
            else {
                this.focusPart(focusedPartPreTransition);
            }
        }
        else {
            this.focus();
        }
        // Event
        this._onDidChangeZenMode.fire(this.isZenModeActive());
    }
    setStatusBarHidden(hidden) {
        this.stateModel.setRuntimeValue(LayoutStateKeys.STATUSBAR_HIDDEN, hidden);
        // Adjust CSS
        if (hidden) {
            this.mainContainer.classList.add(LayoutClasses.STATUSBAR_HIDDEN);
        }
        else {
            this.mainContainer.classList.remove(LayoutClasses.STATUSBAR_HIDDEN);
        }
        // Propagate to grid
        this.workbenchGrid.setViewVisible(this.statusBarPartView, !hidden);
    }
    createWorkbenchLayout() {
        const titleBar = this.getPart("workbench.parts.titlebar" /* Parts.TITLEBAR_PART */);
        const bannerPart = this.getPart("workbench.parts.banner" /* Parts.BANNER_PART */);
        const editorPart = this.getPart("workbench.parts.editor" /* Parts.EDITOR_PART */);
        const activityBar = this.getPart("workbench.parts.activitybar" /* Parts.ACTIVITYBAR_PART */);
        const panelPart = this.getPart("workbench.parts.panel" /* Parts.PANEL_PART */);
        const auxiliaryBarPart = this.getPart("workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */);
        const sideBar = this.getPart("workbench.parts.sidebar" /* Parts.SIDEBAR_PART */);
        const statusBar = this.getPart("workbench.parts.statusbar" /* Parts.STATUSBAR_PART */);
        // View references for all parts
        this.titleBarPartView = titleBar;
        this.bannerPartView = bannerPart;
        this.sideBarPartView = sideBar;
        this.activityBarPartView = activityBar;
        this.editorPartView = editorPart;
        this.panelPartView = panelPart;
        this.auxiliaryBarPartView = auxiliaryBarPart;
        this.statusBarPartView = statusBar;
        const viewMap = {
            ["workbench.parts.activitybar" /* Parts.ACTIVITYBAR_PART */]: this.activityBarPartView,
            ["workbench.parts.banner" /* Parts.BANNER_PART */]: this.bannerPartView,
            ["workbench.parts.titlebar" /* Parts.TITLEBAR_PART */]: this.titleBarPartView,
            ["workbench.parts.editor" /* Parts.EDITOR_PART */]: this.editorPartView,
            ["workbench.parts.panel" /* Parts.PANEL_PART */]: this.panelPartView,
            ["workbench.parts.sidebar" /* Parts.SIDEBAR_PART */]: this.sideBarPartView,
            ["workbench.parts.statusbar" /* Parts.STATUSBAR_PART */]: this.statusBarPartView,
            ["workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */]: this.auxiliaryBarPartView
        };
        const fromJSON = ({ type }) => viewMap[type];
        const workbenchGrid = SerializableGrid.deserialize(this.createGridDescriptor(), { fromJSON }, { proportionalLayout: false });
        this.mainContainer.prepend(workbenchGrid.element);
        this.mainContainer.setAttribute('role', 'application');
        this.workbenchGrid = workbenchGrid;
        this.workbenchGrid.edgeSnapping = this.state.runtime.mainWindowFullscreen;
        for (const part of [titleBar, editorPart, activityBar, panelPart, sideBar, statusBar, auxiliaryBarPart, bannerPart]) {
            this._register(part.onDidVisibilityChange(visible => {
                if (!this.inMaximizedAuxiliaryBarTransition) {
                    // skip reacting when we are transitioning
                    // in or out of maximised auxiliary bar to prevent
                    // stepping on each other toes because this
                    // transition is already dealing with all parts
                    // visibility efficiently.
                    if (part === sideBar) {
                        this.setSideBarHidden(!visible);
                    }
                    else if (part === panelPart && this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_HIDDEN) === visible) {
                        this.setPanelHidden(!visible, true);
                    }
                    else if (part === auxiliaryBarPart) {
                        this.setAuxiliaryBarHidden(!visible, true);
                    }
                    else if (part === editorPart) {
                        this.setEditorHidden(!visible);
                    }
                }
                this._onDidChangePartVisibility.fire({ partId: part.getId(), visible });
                this.handleContainerDidLayout(this.mainContainer, this._mainContainerDimension);
            }));
        }
        this._register(this.storageService.onWillSaveState(() => {
            // Side Bar Size
            const sideBarSize = this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_HIDDEN)
                ? this.workbenchGrid.getViewCachedVisibleSize(this.sideBarPartView)
                : this.workbenchGrid.getViewSize(this.sideBarPartView).width;
            this.stateModel.setInitializationValue(LayoutStateKeys.SIDEBAR_SIZE, sideBarSize);
            // Panel Size
            const panelSize = this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_HIDDEN)
                ? this.workbenchGrid.getViewCachedVisibleSize(this.panelPartView)
                : isHorizontal(this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_POSITION))
                    ? this.workbenchGrid.getViewSize(this.panelPartView).height
                    : this.workbenchGrid.getViewSize(this.panelPartView).width;
            this.stateModel.setInitializationValue(LayoutStateKeys.PANEL_SIZE, panelSize);
            // Auxiliary Bar Size
            const auxiliaryBarSize = this.stateModel.getRuntimeValue(LayoutStateKeys.AUXILIARYBAR_HIDDEN)
                ? this.workbenchGrid.getViewCachedVisibleSize(this.auxiliaryBarPartView)
                : this.workbenchGrid.getViewSize(this.auxiliaryBarPartView).width;
            this.stateModel.setInitializationValue(LayoutStateKeys.AUXILIARYBAR_SIZE, auxiliaryBarSize);
            this.stateModel.save(true, true);
        }));
        this._register(Event.any(this.paneCompositeService.onDidPaneCompositeOpen, this.paneCompositeService.onDidPaneCompositeClose)(() => {
            // Auxiliary Bar State
            this.stateModel.setInitializationValue(LayoutStateKeys.AUXILIARYBAR_EMPTY, this.paneCompositeService.getPaneCompositeIds(2 /* ViewContainerLocation.AuxiliaryBar */).length === 0);
        }));
    }
    layout() {
        if (!this.disposed) {
            this._mainContainerDimension = getClientArea(this.state.runtime.mainWindowFullscreen ?
                mainWindow.document.body : // in fullscreen mode, make sure to use <body> element because
                this.parent, // in that case the workbench will span the entire site
            this.contextService.getWorkbenchState() === 1 /* WorkbenchState.EMPTY */ ? DEFAULT_EMPTY_WINDOW_DIMENSIONS : DEFAULT_WORKSPACE_WINDOW_DIMENSIONS // running with fallback to ensure no error is thrown (https://github.com/microsoft/vscode/issues/240242)
            );
            this.logService.trace(`Layout#layout, height: ${this._mainContainerDimension.height}, width: ${this._mainContainerDimension.width}`);
            size(this.mainContainer, this._mainContainerDimension.width, this._mainContainerDimension.height);
            // Layout the grid widget
            this.workbenchGrid.layout(this._mainContainerDimension.width, this._mainContainerDimension.height);
            this.initialized = true;
            // Emit as event
            this.handleContainerDidLayout(this.mainContainer, this._mainContainerDimension);
        }
    }
    isMainEditorLayoutCentered() {
        return this.stateModel.getRuntimeValue(LayoutStateKeys.MAIN_EDITOR_CENTERED);
    }
    centerMainEditorLayout(active, skipLayout) {
        this.stateModel.setRuntimeValue(LayoutStateKeys.MAIN_EDITOR_CENTERED, active);
        const mainVisibleEditors = coalesce(this.editorGroupService.mainPart.groups.map(group => group.activeEditor));
        const isEditorComplex = mainVisibleEditors.some(editor => {
            if (editor instanceof DiffEditorInput) {
                return this.configurationService.getValue('diffEditor.renderSideBySide');
            }
            if (editor?.hasCapability(256 /* EditorInputCapabilities.MultipleEditors */)) {
                return true;
            }
            return false;
        });
        const layout = this.editorGroupService.getLayout();
        let hasMoreThanOneColumn = false;
        if (layout.orientation === 0 /* GroupOrientation.HORIZONTAL */) {
            hasMoreThanOneColumn = layout.groups.length > 1;
        }
        else {
            hasMoreThanOneColumn = layout.groups.some(group => group.groups && group.groups.length > 1);
        }
        const isCenteredLayoutAutoResizing = this.configurationService.getValue('workbench.editor.centeredLayoutAutoResize');
        if (isCenteredLayoutAutoResizing &&
            ((hasMoreThanOneColumn && !this.editorGroupService.mainPart.hasMaximizedGroup()) || isEditorComplex)) {
            active = false; // disable centered layout for complex editors or when there is more than one group
        }
        if (this.editorGroupService.mainPart.isLayoutCentered() !== active) {
            this.editorGroupService.mainPart.centerLayout(active);
            if (!skipLayout) {
                this.layout();
            }
        }
        this._onDidChangeMainEditorCenteredLayout.fire(this.stateModel.getRuntimeValue(LayoutStateKeys.MAIN_EDITOR_CENTERED));
    }
    getSize(part) {
        return this.workbenchGrid.getViewSize(this.getPart(part));
    }
    setSize(part, size) {
        this.workbenchGrid.resizeView(this.getPart(part), size);
    }
    resizePart(part, sizeChangeWidth, sizeChangeHeight) {
        const sizeChangePxWidth = Math.sign(sizeChangeWidth) * computeScreenAwareSize(getActiveWindow(), Math.abs(sizeChangeWidth));
        const sizeChangePxHeight = Math.sign(sizeChangeHeight) * computeScreenAwareSize(getActiveWindow(), Math.abs(sizeChangeHeight));
        let viewSize;
        switch (part) {
            case "workbench.parts.sidebar" /* Parts.SIDEBAR_PART */:
                viewSize = this.workbenchGrid.getViewSize(this.sideBarPartView);
                this.workbenchGrid.resizeView(this.sideBarPartView, {
                    width: viewSize.width + sizeChangePxWidth,
                    height: viewSize.height
                });
                break;
            case "workbench.parts.panel" /* Parts.PANEL_PART */:
                viewSize = this.workbenchGrid.getViewSize(this.panelPartView);
                this.workbenchGrid.resizeView(this.panelPartView, {
                    width: viewSize.width + (isHorizontal(this.getPanelPosition()) ? 0 : sizeChangePxWidth),
                    height: viewSize.height + (isHorizontal(this.getPanelPosition()) ? sizeChangePxHeight : 0)
                });
                break;
            case "workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */:
                viewSize = this.workbenchGrid.getViewSize(this.auxiliaryBarPartView);
                this.workbenchGrid.resizeView(this.auxiliaryBarPartView, {
                    width: viewSize.width + sizeChangePxWidth,
                    height: viewSize.height
                });
                break;
            case "workbench.parts.editor" /* Parts.EDITOR_PART */:
                viewSize = this.workbenchGrid.getViewSize(this.editorPartView);
                // Single Editor Group
                if (this.editorGroupService.mainPart.count === 1) {
                    this.workbenchGrid.resizeView(this.editorPartView, {
                        width: viewSize.width + sizeChangePxWidth,
                        height: viewSize.height + sizeChangePxHeight
                    });
                }
                else {
                    const activeGroup = this.editorGroupService.mainPart.activeGroup;
                    const { width, height } = this.editorGroupService.mainPart.getSize(activeGroup);
                    this.editorGroupService.mainPart.setSize(activeGroup, { width: width + sizeChangePxWidth, height: height + sizeChangePxHeight });
                    // After resizing the editor group
                    // if it does not change in either direction
                    // try resizing the full editor part
                    const { width: newWidth, height: newHeight } = this.editorGroupService.mainPart.getSize(activeGroup);
                    if ((sizeChangePxHeight && height === newHeight) || (sizeChangePxWidth && width === newWidth)) {
                        this.workbenchGrid.resizeView(this.editorPartView, {
                            width: viewSize.width + (sizeChangePxWidth && width === newWidth ? sizeChangePxWidth : 0),
                            height: viewSize.height + (sizeChangePxHeight && height === newHeight ? sizeChangePxHeight : 0)
                        });
                    }
                }
                break;
            default:
                return; // Cannot resize other parts
        }
    }
    setActivityBarHidden(hidden) {
        this.stateModel.setRuntimeValue(LayoutStateKeys.ACTIVITYBAR_HIDDEN, hidden);
        this.workbenchGrid.setViewVisible(this.activityBarPartView, !hidden);
    }
    setBannerHidden(hidden) {
        this.workbenchGrid.setViewVisible(this.bannerPartView, !hidden);
    }
    setEditorHidden(hidden) {
        if (!hidden && this.setAuxiliaryBarMaximized(false) && this.isVisible("workbench.parts.editor" /* Parts.EDITOR_PART */)) {
            return; // return: leaving maximised auxiliary bar made this part visible
        }
        this.stateModel.setRuntimeValue(LayoutStateKeys.EDITOR_HIDDEN, hidden);
        // Adjust CSS
        if (hidden) {
            this.mainContainer.classList.add(LayoutClasses.MAIN_EDITOR_AREA_HIDDEN);
        }
        else {
            this.mainContainer.classList.remove(LayoutClasses.MAIN_EDITOR_AREA_HIDDEN);
        }
        // Propagate to grid
        this.workbenchGrid.setViewVisible(this.editorPartView, !hidden);
        // The editor and panel cannot be hidden at the same time
        // unless we have a maximized auxiliary bar
        if (hidden && !this.isVisible("workbench.parts.panel" /* Parts.PANEL_PART */) && !this.isAuxiliaryBarMaximized()) {
            this.setPanelHidden(false, true);
        }
    }
    getLayoutClasses() {
        return coalesce([
            !this.isVisible("workbench.parts.sidebar" /* Parts.SIDEBAR_PART */) ? LayoutClasses.SIDEBAR_HIDDEN : undefined,
            !this.isVisible("workbench.parts.editor" /* Parts.EDITOR_PART */, mainWindow) ? LayoutClasses.MAIN_EDITOR_AREA_HIDDEN : undefined,
            !this.isVisible("workbench.parts.panel" /* Parts.PANEL_PART */) ? LayoutClasses.PANEL_HIDDEN : undefined,
            !this.isVisible("workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */) ? LayoutClasses.AUXILIARYBAR_HIDDEN : undefined,
            !this.isVisible("workbench.parts.statusbar" /* Parts.STATUSBAR_PART */) ? LayoutClasses.STATUSBAR_HIDDEN : undefined,
            this.state.runtime.mainWindowFullscreen ? LayoutClasses.FULLSCREEN : undefined,
            this.isShadowsDisabled() ? LayoutClasses.NO_SHADOWS : undefined
        ]);
    }
    setSideBarHidden(hidden) {
        if (!hidden && this.setAuxiliaryBarMaximized(false) && this.isVisible("workbench.parts.sidebar" /* Parts.SIDEBAR_PART */)) {
            return; // return: leaving maximised auxiliary bar made this part visible
        }
        this.stateModel.setRuntimeValue(LayoutStateKeys.SIDEBAR_HIDDEN, hidden);
        // Adjust CSS
        if (hidden) {
            this.mainContainer.classList.add(LayoutClasses.SIDEBAR_HIDDEN);
        }
        else {
            this.mainContainer.classList.remove(LayoutClasses.SIDEBAR_HIDDEN);
        }
        // Propagate to grid
        this.workbenchGrid.setViewVisible(this.sideBarPartView, !hidden);
        // If sidebar becomes hidden, also hide the current active Viewlet if any
        if (hidden && this.paneCompositeService.getActivePaneComposite(0 /* ViewContainerLocation.Sidebar */)) {
            this.paneCompositeService.hideActivePaneComposite(0 /* ViewContainerLocation.Sidebar */);
            if (!this.isAuxiliaryBarMaximized()) {
                this.focusPanelOrEditor(); // do not auto focus when auxiliary bar is maximized
            }
        }
        // If sidebar becomes visible, show last active Viewlet or default viewlet
        else if (!hidden && !this.paneCompositeService.getActivePaneComposite(0 /* ViewContainerLocation.Sidebar */)) {
            const viewletToOpen = this.paneCompositeService.getLastActivePaneCompositeId(0 /* ViewContainerLocation.Sidebar */);
            if (viewletToOpen) {
                this.openViewContainer(0 /* ViewContainerLocation.Sidebar */, viewletToOpen);
            }
        }
    }
    hasViews(id) {
        const viewContainer = this.viewDescriptorService.getViewContainerById(id);
        if (!viewContainer) {
            return false;
        }
        const viewContainerModel = this.viewDescriptorService.getViewContainerModel(viewContainer);
        if (!viewContainerModel) {
            return false;
        }
        return viewContainerModel.activeViewDescriptors.length >= 1;
    }
    adjustPartPositions(sideBarPosition, panelAlignment, panelPosition) {
        // Move activity bar and side bars
        const isPanelVertical = !isHorizontal(panelPosition);
        const sideBarSiblingToEditor = isPanelVertical || !(panelAlignment === 'center' || (sideBarPosition === 0 /* Position.LEFT */ && panelAlignment === 'right') || (sideBarPosition === 1 /* Position.RIGHT */ && panelAlignment === 'left'));
        const auxiliaryBarSiblingToEditor = isPanelVertical || !(panelAlignment === 'center' || (sideBarPosition === 1 /* Position.RIGHT */ && panelAlignment === 'right') || (sideBarPosition === 0 /* Position.LEFT */ && panelAlignment === 'left'));
        const preMovePanelWidth = !this.isVisible("workbench.parts.panel" /* Parts.PANEL_PART */) ? Sizing.Invisible(this.workbenchGrid.getViewCachedVisibleSize(this.panelPartView) ?? this.panelPartView.minimumWidth) : this.workbenchGrid.getViewSize(this.panelPartView).width;
        const preMovePanelHeight = !this.isVisible("workbench.parts.panel" /* Parts.PANEL_PART */) ? Sizing.Invisible(this.workbenchGrid.getViewCachedVisibleSize(this.panelPartView) ?? this.panelPartView.minimumHeight) : this.workbenchGrid.getViewSize(this.panelPartView).height;
        const preMoveSideBarSize = !this.isVisible("workbench.parts.sidebar" /* Parts.SIDEBAR_PART */) ? Sizing.Invisible(this.workbenchGrid.getViewCachedVisibleSize(this.sideBarPartView) ?? this.sideBarPartView.minimumWidth) : this.workbenchGrid.getViewSize(this.sideBarPartView).width;
        const preMoveAuxiliaryBarSize = !this.isVisible("workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */) ? Sizing.Invisible(this.workbenchGrid.getViewCachedVisibleSize(this.auxiliaryBarPartView) ?? this.auxiliaryBarPartView.minimumWidth) : this.workbenchGrid.getViewSize(this.auxiliaryBarPartView).width;
        const focusedPart = ["workbench.parts.panel" /* Parts.PANEL_PART */, "workbench.parts.sidebar" /* Parts.SIDEBAR_PART */, "workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */].find(part => this.hasFocus(part));
        if (sideBarPosition === 0 /* Position.LEFT */) {
            this.workbenchGrid.moveViewTo(this.activityBarPartView, [2, 0]);
            this.workbenchGrid.moveView(this.sideBarPartView, preMoveSideBarSize, sideBarSiblingToEditor ? this.editorPartView : this.activityBarPartView, sideBarSiblingToEditor ? 2 /* Direction.Left */ : 3 /* Direction.Right */);
            if (auxiliaryBarSiblingToEditor) {
                this.workbenchGrid.moveView(this.auxiliaryBarPartView, preMoveAuxiliaryBarSize, this.editorPartView, 3 /* Direction.Right */);
            }
            else {
                this.workbenchGrid.moveViewTo(this.auxiliaryBarPartView, [2, -1]);
            }
        }
        else {
            this.workbenchGrid.moveViewTo(this.activityBarPartView, [2, -1]);
            this.workbenchGrid.moveView(this.sideBarPartView, preMoveSideBarSize, sideBarSiblingToEditor ? this.editorPartView : this.activityBarPartView, sideBarSiblingToEditor ? 3 /* Direction.Right */ : 2 /* Direction.Left */);
            if (auxiliaryBarSiblingToEditor) {
                this.workbenchGrid.moveView(this.auxiliaryBarPartView, preMoveAuxiliaryBarSize, this.editorPartView, 2 /* Direction.Left */);
            }
            else {
                this.workbenchGrid.moveViewTo(this.auxiliaryBarPartView, [2, 0]);
            }
        }
        // Maintain focus after moving parts
        if (focusedPart) {
            this.focusPart(focusedPart);
        }
        // We moved all the side parts based on the editor and ignored the panel
        // Now, we need to put the panel back in the right position when it is next to the editor
        if (isPanelVertical) {
            this.workbenchGrid.moveView(this.panelPartView, preMovePanelWidth, this.editorPartView, panelPosition === 0 /* Position.LEFT */ ? 2 /* Direction.Left */ : 3 /* Direction.Right */);
            this.workbenchGrid.resizeView(this.panelPartView, {
                height: preMovePanelHeight,
                width: preMovePanelWidth
            });
        }
        // Moving views in the grid can cause them to re-distribute sizing unnecessarily
        // Resize visible parts to the width they were before the operation
        if (this.isVisible("workbench.parts.sidebar" /* Parts.SIDEBAR_PART */)) {
            this.workbenchGrid.resizeView(this.sideBarPartView, {
                height: this.workbenchGrid.getViewSize(this.sideBarPartView).height,
                width: preMoveSideBarSize
            });
        }
        if (this.isVisible("workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */)) {
            this.workbenchGrid.resizeView(this.auxiliaryBarPartView, {
                height: this.workbenchGrid.getViewSize(this.auxiliaryBarPartView).height,
                width: preMoveAuxiliaryBarSize
            });
        }
    }
    setPanelAlignment(alignment) {
        // Panel alignment only applies to a panel in the top/bottom position
        if (!isHorizontal(this.getPanelPosition())) {
            this.setPanelPosition(2 /* Position.BOTTOM */);
        }
        // the workbench grid currently prevents us from supporting panel maximization with non-center panel alignment
        if (alignment !== 'center' && this.isPanelMaximized()) {
            this.toggleMaximizedPanel();
        }
        // Leave auxiliary bar maximized state because changing
        // panel alignment requires the editor part to be visible
        this.setAuxiliaryBarMaximized(false);
        this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_ALIGNMENT, alignment);
        this.adjustPartPositions(this.getSideBarPosition(), alignment, this.getPanelPosition());
        this._onDidChangePanelAlignment.fire(alignment);
    }
    setPanelHidden(hidden, skipLayout) {
        if (!this.workbenchGrid) {
            return; // Return if not initialized fully (https://github.com/microsoft/vscode/issues/105480)
        }
        if (!hidden && this.setAuxiliaryBarMaximized(false) && this.isVisible("workbench.parts.panel" /* Parts.PANEL_PART */)) {
            return; // return: leaving maximised auxiliary bar made this part visible
        }
        const wasHidden = !this.isVisible("workbench.parts.panel" /* Parts.PANEL_PART */);
        const isPanelMaximized = this.isPanelMaximized();
        this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_HIDDEN, hidden);
        const panelOpensMaximized = this.panelOpensMaximized();
        // Adjust CSS
        if (hidden) {
            this.mainContainer.classList.add(LayoutClasses.PANEL_HIDDEN);
        }
        else {
            this.mainContainer.classList.remove(LayoutClasses.PANEL_HIDDEN);
        }
        // If maximized and in process of hiding, unmaximize FIRST before
        // changing visibility to prevent conflict with setEditorHidden
        // which would force panel visible again (fixes #281772)
        if (hidden && isPanelMaximized) {
            this.toggleMaximizedPanel();
        }
        // Propagate layout changes to grid
        this.workbenchGrid.setViewVisible(this.panelPartView, !hidden);
        // If panel part becomes hidden, also hide the current active panel if any
        let focusEditor = false;
        if (hidden && this.paneCompositeService.getActivePaneComposite(1 /* ViewContainerLocation.Panel */)) {
            this.paneCompositeService.hideActivePaneComposite(1 /* ViewContainerLocation.Panel */);
            if (!isIOS && // do not auto focus on iOS (https://github.com/microsoft/vscode/issues/127832)
                !this.isAuxiliaryBarMaximized() // do not auto focus when auxiliary bar is maximized
            ) {
                focusEditor = true;
            }
        }
        // If panel part becomes visible, show last active panel or default panel
        else if (!hidden && !this.paneCompositeService.getActivePaneComposite(1 /* ViewContainerLocation.Panel */)) {
            let panelToOpen = this.paneCompositeService.getLastActivePaneCompositeId(1 /* ViewContainerLocation.Panel */);
            // verify that the panel we try to open has views before we default to it
            // otherwise fall back to any view that has views still refs #111463
            if (!panelToOpen || !this.hasViews(panelToOpen)) {
                panelToOpen = this.viewDescriptorService
                    .getViewContainersByLocation(1 /* ViewContainerLocation.Panel */)
                    .find(viewContainer => this.hasViews(viewContainer.id))?.id;
            }
            if (panelToOpen) {
                this.openViewContainer(1 /* ViewContainerLocation.Panel */, panelToOpen, !skipLayout);
            }
        }
        // Don't proceed if we have already done this before
        if (wasHidden === hidden) {
            return;
        }
        // If in process of showing, toggle whether or not panel is maximized
        if (!hidden) {
            if (!skipLayout && isPanelMaximized !== panelOpensMaximized) {
                this.toggleMaximizedPanel();
            }
        }
        else {
            // If in process of hiding, remember whether the panel is maximized or not
            this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_WAS_LAST_MAXIMIZED, isPanelMaximized);
        }
        if (focusEditor) {
            this.editorGroupService.mainPart.activeGroup.focus(); // Pass focus to editor group if panel part is now hidden
        }
    }
    isAuxiliaryBarMaximized() {
        return this.stateModel.getRuntimeValue(LayoutStateKeys.AUXILIARYBAR_WAS_LAST_MAXIMIZED);
    }
    toggleMaximizedAuxiliaryBar() {
        this.setAuxiliaryBarMaximized(!this.isAuxiliaryBarMaximized());
    }
    setAuxiliaryBarMaximized(maximized) {
        if (this.inMaximizedAuxiliaryBarTransition || // prevent re-entrance
            (maximized === this.isAuxiliaryBarMaximized()) // return early if state is already present
        ) {
            return false;
        }
        if (maximized) {
            const state = {
                sideBarVisible: this.isVisible("workbench.parts.sidebar" /* Parts.SIDEBAR_PART */),
                editorVisible: this.isVisible("workbench.parts.editor" /* Parts.EDITOR_PART */),
                panelVisible: this.isVisible("workbench.parts.panel" /* Parts.PANEL_PART */),
                auxiliaryBarVisible: this.isVisible("workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */)
            };
            this.stateModel.setRuntimeValue(LayoutStateKeys.AUXILIARYBAR_WAS_LAST_MAXIMIZED, true);
            this.inMaximizedAuxiliaryBarTransition = true;
            try {
                if (!state.auxiliaryBarVisible) {
                    this.setAuxiliaryBarHidden(false);
                }
                const size = this.workbenchGrid.getViewSize(this.auxiliaryBarPartView).width;
                this.stateModel.setRuntimeValue(LayoutStateKeys.AUXILIARYBAR_LAST_NON_MAXIMIZED_SIZE, size);
                if (state.sideBarVisible) {
                    this.setSideBarHidden(true);
                }
                if (state.panelVisible) {
                    this.setPanelHidden(true);
                }
                if (state.editorVisible) {
                    this.setEditorHidden(true);
                }
                this.stateModel.setRuntimeValue(LayoutStateKeys.AUXILIARYBAR_LAST_NON_MAXIMIZED_VISIBILITY, state);
            }
            finally {
                this.inMaximizedAuxiliaryBarTransition = false;
            }
        }
        else {
            const state = assertReturnsDefined(this.stateModel.getRuntimeValue(LayoutStateKeys.AUXILIARYBAR_LAST_NON_MAXIMIZED_VISIBILITY));
            this.stateModel.setRuntimeValue(LayoutStateKeys.AUXILIARYBAR_WAS_LAST_MAXIMIZED, false);
            this.inMaximizedAuxiliaryBarTransition = true;
            try {
                this.setEditorHidden(!state?.editorVisible); // this order of updating view visibility
                this.setPanelHidden(!state?.panelVisible); // helps in restoring the previous view
                this.setSideBarHidden(!state?.sideBarVisible); // sizes we had
                const size = this.workbenchGrid.getViewSize(this.auxiliaryBarPartView);
                this.workbenchGrid.resizeView(this.auxiliaryBarPartView, {
                    width: this.stateModel.getRuntimeValue(LayoutStateKeys.AUXILIARYBAR_LAST_NON_MAXIMIZED_SIZE),
                    height: size.height
                });
            }
            finally {
                this.inMaximizedAuxiliaryBarTransition = false;
            }
        }
        this.focusPart("workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */);
        this._onDidChangeAuxiliaryBarMaximized.fire();
        return true;
    }
    isPanelMaximized() {
        return (this.getPanelAlignment() === 'center' || // the workbench grid currently prevents us from supporting panel
            !isHorizontal(this.getPanelPosition()) // maximization with non-center panel alignment
        ) && !this.isVisible("workbench.parts.editor" /* Parts.EDITOR_PART */, mainWindow) && !this.isAuxiliaryBarMaximized();
    }
    toggleMaximizedPanel() {
        const size = this.workbenchGrid.getViewSize(this.panelPartView);
        const panelPosition = this.getPanelPosition();
        const maximize = !this.isPanelMaximized();
        if (maximize) {
            if (this.isVisible("workbench.parts.panel" /* Parts.PANEL_PART */)) {
                if (isHorizontal(panelPosition)) {
                    this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_LAST_NON_MAXIMIZED_HEIGHT, size.height);
                }
                else {
                    this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_LAST_NON_MAXIMIZED_WIDTH, size.width);
                }
            }
            this.setEditorHidden(true);
        }
        else {
            this.setEditorHidden(false);
            this.workbenchGrid.resizeView(this.panelPartView, {
                width: isHorizontal(panelPosition) ? size.width : this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_LAST_NON_MAXIMIZED_WIDTH),
                height: isHorizontal(panelPosition) ? this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_LAST_NON_MAXIMIZED_HEIGHT) : size.height
            });
        }
        this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_WAS_LAST_MAXIMIZED, maximize);
    }
    panelOpensMaximized() {
        if (this.getPanelAlignment() !== 'center' && isHorizontal(this.getPanelPosition())) {
            return false; // The workbench grid currently prevents us from supporting panel maximization with non-center panel alignment
        }
        const panelOpensMaximized = partOpensMaximizedFromString(this.configurationService.getValue(WorkbenchLayoutSettings.PANEL_OPENS_MAXIMIZED));
        const panelLastIsMaximized = this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_WAS_LAST_MAXIMIZED);
        return panelOpensMaximized === 0 /* PartOpensMaximizedOptions.ALWAYS */ || (panelOpensMaximized === 2 /* PartOpensMaximizedOptions.REMEMBER_LAST */ && panelLastIsMaximized);
    }
    setAuxiliaryBarHidden(hidden, skipLayout) {
        if (hidden && this.setAuxiliaryBarMaximized(false) && !this.isVisible("workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */)) {
            return; // return: leaving maximised auxiliary bar made this part hidden
        }
        this.stateModel.setRuntimeValue(LayoutStateKeys.AUXILIARYBAR_HIDDEN, hidden);
        // Adjust CSS
        if (hidden) {
            this.mainContainer.classList.add(LayoutClasses.AUXILIARYBAR_HIDDEN);
        }
        else {
            this.mainContainer.classList.remove(LayoutClasses.AUXILIARYBAR_HIDDEN);
        }
        // Propagate to grid
        this.workbenchGrid.setViewVisible(this.auxiliaryBarPartView, !hidden);
        // If auxiliary bar becomes hidden, also hide the current active pane composite if any
        if (hidden && this.paneCompositeService.getActivePaneComposite(2 /* ViewContainerLocation.AuxiliaryBar */)) {
            this.paneCompositeService.hideActivePaneComposite(2 /* ViewContainerLocation.AuxiliaryBar */);
            this.focusPanelOrEditor();
        }
        // If auxiliary bar becomes visible, show last active pane composite or default pane composite
        else if (!hidden && !this.paneCompositeService.getActivePaneComposite(2 /* ViewContainerLocation.AuxiliaryBar */)) {
            let viewletToOpen = this.paneCompositeService.getLastActivePaneCompositeId(2 /* ViewContainerLocation.AuxiliaryBar */);
            // verify that the viewlet we try to open has views before we default to it
            // otherwise fall back to any view that has views still refs #111463
            if (!viewletToOpen || !this.hasViews(viewletToOpen)) {
                viewletToOpen = this.viewDescriptorService
                    .getViewContainersByLocation(2 /* ViewContainerLocation.AuxiliaryBar */)
                    .find(viewContainer => this.hasViews(viewContainer.id))?.id;
            }
            if (viewletToOpen) {
                this.openViewContainer(2 /* ViewContainerLocation.AuxiliaryBar */, viewletToOpen, !skipLayout);
            }
        }
    }
    setPartHidden(hidden, part) {
        switch (part) {
            case "workbench.parts.activitybar" /* Parts.ACTIVITYBAR_PART */:
                return this.setActivityBarHidden(hidden);
            case "workbench.parts.sidebar" /* Parts.SIDEBAR_PART */:
                return this.setSideBarHidden(hidden);
            case "workbench.parts.editor" /* Parts.EDITOR_PART */:
                return this.setEditorHidden(hidden);
            case "workbench.parts.banner" /* Parts.BANNER_PART */:
                return this.setBannerHidden(hidden);
            case "workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */:
                return this.setAuxiliaryBarHidden(hidden);
            case "workbench.parts.panel" /* Parts.PANEL_PART */:
                return this.setPanelHidden(hidden);
        }
    }
    hasMainWindowBorder() {
        return this.state.runtime.mainWindowBorder;
    }
    getMainWindowBorderRadius() {
        return this.state.runtime.mainWindowBorder && isMacintosh ? '10px' : undefined;
    }
    getSideBarPosition() {
        return this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_POSITON);
    }
    getPanelAlignment() {
        return this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_ALIGNMENT);
    }
    updateMenubarVisibility(skipLayout) {
        const shouldShowTitleBar = shouldShowCustomTitleBar(this.configurationService, mainWindow, this.state.runtime.menuBar.toggled);
        if (!skipLayout && this.workbenchGrid && shouldShowTitleBar !== this.isVisible("workbench.parts.titlebar" /* Parts.TITLEBAR_PART */, mainWindow)) {
            this.workbenchGrid.setViewVisible(this.titleBarPartView, shouldShowTitleBar);
        }
    }
    updateCustomTitleBarVisibility() {
        const shouldShowTitleBar = shouldShowCustomTitleBar(this.configurationService, mainWindow, this.state.runtime.menuBar.toggled);
        const titlebarVisible = this.isVisible("workbench.parts.titlebar" /* Parts.TITLEBAR_PART */);
        if (shouldShowTitleBar !== titlebarVisible) {
            this.workbenchGrid.setViewVisible(this.titleBarPartView, shouldShowTitleBar);
        }
    }
    toggleMenuBar() {
        let currentVisibilityValue = getMenuBarVisibility(this.configurationService);
        if (typeof currentVisibilityValue !== 'string') {
            currentVisibilityValue = 'classic';
        }
        let newVisibilityValue;
        if (currentVisibilityValue === 'visible' || currentVisibilityValue === 'classic') {
            newVisibilityValue = hasNativeMenu(this.configurationService) ? 'toggle' : 'compact';
        }
        else {
            newVisibilityValue = 'classic';
        }
        this.configurationService.updateValue("window.menuBarVisibility" /* MenuSettings.MenuBarVisibility */, newVisibilityValue);
    }
    getPanelPosition() {
        return this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_POSITION);
    }
    setPanelPosition(position) {
        if (!this.isVisible("workbench.parts.panel" /* Parts.PANEL_PART */)) {
            this.setPanelHidden(false);
        }
        const panelPart = this.getPart("workbench.parts.panel" /* Parts.PANEL_PART */);
        const oldPositionValue = positionToString(this.getPanelPosition());
        const newPositionValue = positionToString(position);
        // Adjust CSS
        const panelContainer = assertReturnsDefined(panelPart.getContainer());
        panelContainer.classList.remove(oldPositionValue);
        panelContainer.classList.add(newPositionValue);
        // Update Styles
        panelPart.updateStyles();
        // Layout
        const size = this.workbenchGrid.getViewSize(this.panelPartView);
        const sideBarSize = this.workbenchGrid.getViewSize(this.sideBarPartView);
        const auxiliaryBarSize = this.workbenchGrid.getViewSize(this.auxiliaryBarPartView);
        let editorHidden = !this.isVisible("workbench.parts.editor" /* Parts.EDITOR_PART */, mainWindow);
        // Save last non-maximized size for panel before move
        if (newPositionValue !== oldPositionValue && !editorHidden) {
            // Save the current size of the panel for the new orthogonal direction
            // If moving down, save the width of the panel
            // Otherwise, save the height of the panel
            if (isHorizontal(position)) {
                this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_LAST_NON_MAXIMIZED_WIDTH, size.width);
            }
            else if (isHorizontal(positionFromString(oldPositionValue))) {
                this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_LAST_NON_MAXIMIZED_HEIGHT, size.height);
            }
        }
        if (isHorizontal(position) && this.getPanelAlignment() !== 'center' && editorHidden) {
            this.toggleMaximizedPanel();
            editorHidden = false;
        }
        this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_POSITION, position);
        const sideBarVisible = this.isVisible("workbench.parts.sidebar" /* Parts.SIDEBAR_PART */);
        const auxiliaryBarVisible = this.isVisible("workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */);
        const hadFocus = this.hasFocus("workbench.parts.panel" /* Parts.PANEL_PART */);
        if (position === 2 /* Position.BOTTOM */) {
            this.workbenchGrid.moveView(this.panelPartView, editorHidden ? size.height : this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_LAST_NON_MAXIMIZED_HEIGHT), this.editorPartView, 1 /* Direction.Down */);
        }
        else if (position === 3 /* Position.TOP */) {
            this.workbenchGrid.moveView(this.panelPartView, editorHidden ? size.height : this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_LAST_NON_MAXIMIZED_HEIGHT), this.editorPartView, 0 /* Direction.Up */);
        }
        else if (position === 1 /* Position.RIGHT */) {
            this.workbenchGrid.moveView(this.panelPartView, editorHidden ? size.width : this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_LAST_NON_MAXIMIZED_WIDTH), this.editorPartView, 3 /* Direction.Right */);
        }
        else {
            this.workbenchGrid.moveView(this.panelPartView, editorHidden ? size.width : this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_LAST_NON_MAXIMIZED_WIDTH), this.editorPartView, 2 /* Direction.Left */);
        }
        if (hadFocus) {
            this.focusPart("workbench.parts.panel" /* Parts.PANEL_PART */);
        }
        // Reset sidebar to original size before shifting the panel
        this.workbenchGrid.resizeView(this.sideBarPartView, sideBarSize);
        if (!sideBarVisible) {
            this.setSideBarHidden(true);
        }
        this.workbenchGrid.resizeView(this.auxiliaryBarPartView, auxiliaryBarSize);
        if (!auxiliaryBarVisible) {
            this.setAuxiliaryBarHidden(true);
        }
        if (isHorizontal(position)) {
            this.adjustPartPositions(this.getSideBarPosition(), this.getPanelAlignment(), position);
        }
        this._onDidChangePanelPosition.fire(newPositionValue);
    }
    isWindowMaximized(targetWindow) {
        return this.state.runtime.maximized.has(getWindowId(targetWindow));
    }
    updateWindowMaximizedState(targetWindow, maximized) {
        this.mainContainer.classList.toggle(LayoutClasses.MAXIMIZED, maximized);
        const targetWindowId = getWindowId(targetWindow);
        if (maximized === this.state.runtime.maximized.has(targetWindowId)) {
            return;
        }
        if (maximized) {
            this.state.runtime.maximized.add(targetWindowId);
        }
        else {
            this.state.runtime.maximized.delete(targetWindowId);
        }
        this.updateWindowBorder();
        this._onDidChangeWindowMaximized.fire({ windowId: targetWindowId, maximized });
    }
    getVisibleNeighborPart(part, direction) {
        if (!this.workbenchGrid) {
            return undefined;
        }
        if (!this.isVisible(part, mainWindow)) {
            return undefined;
        }
        const neighborViews = this.workbenchGrid.getNeighborViews(this.getPart(part), direction, false);
        if (!neighborViews) {
            return undefined;
        }
        for (const neighborView of neighborViews) {
            const neighborPart = ["workbench.parts.activitybar" /* Parts.ACTIVITYBAR_PART */, "workbench.parts.editor" /* Parts.EDITOR_PART */, "workbench.parts.panel" /* Parts.PANEL_PART */, "workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */, "workbench.parts.sidebar" /* Parts.SIDEBAR_PART */, "workbench.parts.statusbar" /* Parts.STATUSBAR_PART */, "workbench.parts.titlebar" /* Parts.TITLEBAR_PART */]
                .find(partId => this.getPart(partId) === neighborView && this.isVisible(partId, mainWindow));
            if (neighborPart !== undefined) {
                return neighborPart;
            }
        }
        return undefined;
    }
    onDidChangeWCO() {
        const bannerFirst = this.workbenchGrid.getNeighborViews(this.titleBarPartView, 0 /* Direction.Up */, false).length > 0;
        const shouldBannerBeFirst = this.shouldShowBannerFirst();
        if (bannerFirst !== shouldBannerBeFirst) {
            this.workbenchGrid.moveView(this.bannerPartView, Sizing.Distribute, this.titleBarPartView, shouldBannerBeFirst ? 0 /* Direction.Up */ : 1 /* Direction.Down */);
        }
        this.workbenchGrid.setViewVisible(this.titleBarPartView, shouldShowCustomTitleBar(this.configurationService, mainWindow, this.state.runtime.menuBar.toggled));
    }
    arrangeEditorNodes(nodes, availableHeight, availableWidth) {
        if (!nodes.sideBar && !nodes.auxiliaryBar) {
            nodes.editor.size = availableHeight;
            return nodes.editor;
        }
        const result = [nodes.editor];
        nodes.editor.size = availableWidth;
        if (nodes.sideBar) {
            if (this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_POSITON) === 0 /* Position.LEFT */) {
                result.splice(0, 0, nodes.sideBar);
            }
            else {
                result.push(nodes.sideBar);
            }
            nodes.editor.size -= this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_HIDDEN) ? 0 : nodes.sideBar.size;
        }
        if (nodes.auxiliaryBar) {
            if (this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_POSITON) === 1 /* Position.RIGHT */) {
                result.splice(0, 0, nodes.auxiliaryBar);
            }
            else {
                result.push(nodes.auxiliaryBar);
            }
            nodes.editor.size -= this.stateModel.getRuntimeValue(LayoutStateKeys.AUXILIARYBAR_HIDDEN) ? 0 : nodes.auxiliaryBar.size;
        }
        return {
            type: 'branch',
            data: result,
            size: availableHeight,
            visible: result.some(node => node.visible)
        };
    }
    arrangeMiddleSectionNodes(nodes, availableWidth, availableHeight) {
        const activityBarSize = this.stateModel.getRuntimeValue(LayoutStateKeys.ACTIVITYBAR_HIDDEN) ? 0 : nodes.activityBar.size;
        const sideBarSize = this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_HIDDEN) ? 0 : nodes.sideBar.size;
        const auxiliaryBarSize = this.stateModel.getRuntimeValue(LayoutStateKeys.AUXILIARYBAR_HIDDEN) ? 0 : nodes.auxiliaryBar.size;
        const panelSize = this.stateModel.getInitializationValue(LayoutStateKeys.PANEL_SIZE) ? 0 : nodes.panel.size;
        const panelPostion = this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_POSITION);
        const sideBarPosition = this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_POSITON);
        const result = [];
        if (!isHorizontal(panelPostion)) {
            result.push(nodes.editor);
            nodes.editor.size = availableWidth - activityBarSize - sideBarSize - panelSize - auxiliaryBarSize;
            if (panelPostion === 1 /* Position.RIGHT */) {
                result.push(nodes.panel);
            }
            else {
                result.splice(0, 0, nodes.panel);
            }
            if (sideBarPosition === 0 /* Position.LEFT */) {
                result.push(nodes.auxiliaryBar);
                result.splice(0, 0, nodes.sideBar);
                result.splice(0, 0, nodes.activityBar);
            }
            else {
                result.splice(0, 0, nodes.auxiliaryBar);
                result.push(nodes.sideBar);
                result.push(nodes.activityBar);
            }
        }
        else {
            const panelAlignment = this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_ALIGNMENT);
            const sideBarNextToEditor = !(panelAlignment === 'center' || (sideBarPosition === 0 /* Position.LEFT */ && panelAlignment === 'right') || (sideBarPosition === 1 /* Position.RIGHT */ && panelAlignment === 'left'));
            const auxiliaryBarNextToEditor = !(panelAlignment === 'center' || (sideBarPosition === 1 /* Position.RIGHT */ && panelAlignment === 'right') || (sideBarPosition === 0 /* Position.LEFT */ && panelAlignment === 'left'));
            const editorSectionWidth = availableWidth - activityBarSize - (sideBarNextToEditor ? 0 : sideBarSize) - (auxiliaryBarNextToEditor ? 0 : auxiliaryBarSize);
            const editorNodes = this.arrangeEditorNodes({
                editor: nodes.editor,
                sideBar: sideBarNextToEditor ? nodes.sideBar : undefined,
                auxiliaryBar: auxiliaryBarNextToEditor ? nodes.auxiliaryBar : undefined
            }, availableHeight - panelSize, editorSectionWidth);
            const data = panelPostion === 2 /* Position.BOTTOM */ ? [editorNodes, nodes.panel] : [nodes.panel, editorNodes];
            result.push({
                type: 'branch',
                data,
                size: editorSectionWidth,
                visible: data.some(node => node.visible)
            });
            if (!sideBarNextToEditor) {
                if (sideBarPosition === 0 /* Position.LEFT */) {
                    result.splice(0, 0, nodes.sideBar);
                }
                else {
                    result.push(nodes.sideBar);
                }
            }
            if (!auxiliaryBarNextToEditor) {
                if (sideBarPosition === 1 /* Position.RIGHT */) {
                    result.splice(0, 0, nodes.auxiliaryBar);
                }
                else {
                    result.push(nodes.auxiliaryBar);
                }
            }
            if (sideBarPosition === 0 /* Position.LEFT */) {
                result.splice(0, 0, nodes.activityBar);
            }
            else {
                result.push(nodes.activityBar);
            }
        }
        return result;
    }
    createGridDescriptor() {
        const { width, height } = this._mainContainerDimension;
        const sideBarSize = this.stateModel.getInitializationValue(LayoutStateKeys.SIDEBAR_SIZE);
        const auxiliaryBarSize = this.stateModel.getInitializationValue(LayoutStateKeys.AUXILIARYBAR_SIZE);
        const panelSize = this.stateModel.getInitializationValue(LayoutStateKeys.PANEL_SIZE);
        const titleBarHeight = this.titleBarPartView.minimumHeight;
        const bannerHeight = this.bannerPartView.minimumHeight;
        const statusBarHeight = this.statusBarPartView.minimumHeight;
        const activityBarWidth = this.activityBarPartView.minimumWidth;
        const middleSectionHeight = height - titleBarHeight - statusBarHeight;
        const titleAndBanner = [
            {
                type: 'leaf',
                data: { type: "workbench.parts.titlebar" /* Parts.TITLEBAR_PART */ },
                size: titleBarHeight,
                visible: this.isVisible("workbench.parts.titlebar" /* Parts.TITLEBAR_PART */, mainWindow)
            },
            {
                type: 'leaf',
                data: { type: "workbench.parts.banner" /* Parts.BANNER_PART */ },
                size: bannerHeight,
                visible: false
            }
        ];
        const activityBarNode = {
            type: 'leaf',
            data: { type: "workbench.parts.activitybar" /* Parts.ACTIVITYBAR_PART */ },
            size: activityBarWidth,
            visible: !this.stateModel.getRuntimeValue(LayoutStateKeys.ACTIVITYBAR_HIDDEN)
        };
        const sideBarNode = {
            type: 'leaf',
            data: { type: "workbench.parts.sidebar" /* Parts.SIDEBAR_PART */ },
            size: sideBarSize,
            visible: !this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_HIDDEN)
        };
        const auxiliaryBarNode = {
            type: 'leaf',
            data: { type: "workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */ },
            size: auxiliaryBarSize,
            visible: this.isVisible("workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */)
        };
        const editorNode = {
            type: 'leaf',
            data: { type: "workbench.parts.editor" /* Parts.EDITOR_PART */ },
            size: 0, // Update based on sibling sizes
            visible: !this.stateModel.getRuntimeValue(LayoutStateKeys.EDITOR_HIDDEN)
        };
        const panelNode = {
            type: 'leaf',
            data: { type: "workbench.parts.panel" /* Parts.PANEL_PART */ },
            size: panelSize,
            visible: !this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_HIDDEN)
        };
        const middleSection = this.arrangeMiddleSectionNodes({
            activityBar: activityBarNode,
            auxiliaryBar: auxiliaryBarNode,
            editor: editorNode,
            panel: panelNode,
            sideBar: sideBarNode
        }, width, middleSectionHeight);
        const result = {
            root: {
                type: 'branch',
                size: width,
                data: [
                    ...(this.shouldShowBannerFirst() ? titleAndBanner.reverse() : titleAndBanner),
                    {
                        type: 'branch',
                        data: middleSection,
                        size: middleSectionHeight
                    },
                    {
                        type: 'leaf',
                        data: { type: "workbench.parts.statusbar" /* Parts.STATUSBAR_PART */ },
                        size: statusBarHeight,
                        visible: !this.stateModel.getRuntimeValue(LayoutStateKeys.STATUSBAR_HIDDEN)
                    }
                ]
            },
            orientation: 0 /* Orientation.VERTICAL */,
            width,
            height
        };
        const layoutDescriptor = {
            activityBarVisible: !this.stateModel.getRuntimeValue(LayoutStateKeys.ACTIVITYBAR_HIDDEN),
            sideBarVisible: !this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_HIDDEN),
            auxiliaryBarVisible: !this.stateModel.getRuntimeValue(LayoutStateKeys.AUXILIARYBAR_HIDDEN),
            panelVisible: !this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_HIDDEN),
            statusbarVisible: !this.stateModel.getRuntimeValue(LayoutStateKeys.STATUSBAR_HIDDEN),
            sideBarPosition: positionToString(this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_POSITON)),
            panelPosition: positionToString(this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_POSITION)),
        };
        // WARNING: Do not remove this event, it's used to track build rollout progress
        // Talk to @joaomoreno, @lszomoru or @jruales before doing so
        this.telemetryService.publicLog2('startupLayout', layoutDescriptor);
        return result;
    }
    dispose() {
        super.dispose();
        this.disposed = true;
    }
}
function getZenModeConfiguration(configurationService) {
    return configurationService.getValue(WorkbenchLayoutSettings.ZEN_MODE_CONFIG);
}
class WorkbenchLayoutStateKey {
    constructor(name, scope, target, defaultValue) {
        this.name = name;
        this.scope = scope;
        this.target = target;
        this.defaultValue = defaultValue;
    }
}
class RuntimeStateKey extends WorkbenchLayoutStateKey {
    constructor(name, scope, target, defaultValue, zenModeIgnore) {
        super(name, scope, target, defaultValue);
        this.zenModeIgnore = zenModeIgnore;
        this.runtime = true;
    }
}
class InitializationStateKey extends WorkbenchLayoutStateKey {
    constructor() {
        super(...arguments);
        this.runtime = false;
    }
}
const LayoutStateKeys = {
    // Editor
    MAIN_EDITOR_CENTERED: new RuntimeStateKey('editor.centered', 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */, false),
    // Zen Mode
    ZEN_MODE_ACTIVE: new RuntimeStateKey('zenMode.active', 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */, false),
    ZEN_MODE_EXIT_INFO: new RuntimeStateKey('zenMode.exitInfo', 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */, {
        transitionedToCenteredEditorLayout: false,
        transitionedToFullScreen: false,
        handleNotificationsDoNotDisturbMode: false,
        wasVisible: {
            auxiliaryBar: false,
            panel: false,
            sideBar: false,
        },
    }),
    // Part Sizing
    SIDEBAR_SIZE: new InitializationStateKey('sideBar.size', 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */, 300),
    AUXILIARYBAR_SIZE: new InitializationStateKey('auxiliaryBar.size', 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */, 300),
    PANEL_SIZE: new InitializationStateKey('panel.size', 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */, 300),
    // Part State
    PANEL_LAST_NON_MAXIMIZED_HEIGHT: new RuntimeStateKey('panel.lastNonMaximizedHeight', 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */, 300),
    PANEL_LAST_NON_MAXIMIZED_WIDTH: new RuntimeStateKey('panel.lastNonMaximizedWidth', 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */, 300),
    PANEL_WAS_LAST_MAXIMIZED: new RuntimeStateKey('panel.wasLastMaximized', 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */, false),
    AUXILIARYBAR_WAS_LAST_MAXIMIZED: new RuntimeStateKey('auxiliaryBar.wasLastMaximized', 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */, false),
    AUXILIARYBAR_LAST_NON_MAXIMIZED_SIZE: new RuntimeStateKey('auxiliaryBar.lastNonMaximizedSize', 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */, 300),
    AUXILIARYBAR_LAST_NON_MAXIMIZED_VISIBILITY: new RuntimeStateKey('auxiliaryBar.lastNonMaximizedVisibility', 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */, {
        sideBarVisible: false,
        editorVisible: false,
        panelVisible: false,
        auxiliaryBarVisible: false
    }),
    AUXILIARYBAR_EMPTY: new InitializationStateKey('auxiliaryBar.empty', 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */, false),
    // Part Positions
    SIDEBAR_POSITON: new RuntimeStateKey('sideBar.position', 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */, 0 /* Position.LEFT */),
    PANEL_POSITION: new RuntimeStateKey('panel.position', 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */, 2 /* Position.BOTTOM */),
    PANEL_ALIGNMENT: new RuntimeStateKey('panel.alignment', 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */, 'center'),
    // Part Visibility
    ACTIVITYBAR_HIDDEN: new RuntimeStateKey('activityBar.hidden', 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */, false, true),
    SIDEBAR_HIDDEN: new RuntimeStateKey('sideBar.hidden', 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */, false),
    EDITOR_HIDDEN: new RuntimeStateKey('editor.hidden', 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */, false),
    PANEL_HIDDEN: new RuntimeStateKey('panel.hidden', 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */, true),
    AUXILIARYBAR_HIDDEN: new RuntimeStateKey('auxiliaryBar.hidden', 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */, true),
    STATUSBAR_HIDDEN: new RuntimeStateKey('statusBar.hidden', 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */, false, true)
};
var WorkbenchLayoutSettings;
(function (WorkbenchLayoutSettings) {
    WorkbenchLayoutSettings["AUXILIARYBAR_DEFAULT_VISIBILITY"] = "workbench.secondarySideBar.defaultVisibility";
    WorkbenchLayoutSettings["AUXILIARYBAR_FORCE_MAXIMIZED"] = "workbench.secondarySideBar.forceMaximized";
    WorkbenchLayoutSettings["ACTIVITY_BAR_VISIBLE"] = "workbench.activityBar.visible";
    WorkbenchLayoutSettings["PANEL_POSITION"] = "workbench.panel.defaultLocation";
    WorkbenchLayoutSettings["PANEL_OPENS_MAXIMIZED"] = "workbench.panel.opensMaximized";
    WorkbenchLayoutSettings["ZEN_MODE_CONFIG"] = "zenMode";
    WorkbenchLayoutSettings["EDITOR_CENTERED_LAYOUT_AUTO_RESIZE"] = "workbench.editor.centeredLayoutAutoResize";
    WorkbenchLayoutSettings["EDITOR_RESTORE_EDITORS"] = "workbench.editor.restoreEditors";
})(WorkbenchLayoutSettings || (WorkbenchLayoutSettings = {}));
var LegacyWorkbenchLayoutSettings;
(function (LegacyWorkbenchLayoutSettings) {
    LegacyWorkbenchLayoutSettings["STATUSBAR_VISIBLE"] = "workbench.statusBar.visible";
    LegacyWorkbenchLayoutSettings["SIDEBAR_POSITION"] = "workbench.sideBar.location";
})(LegacyWorkbenchLayoutSettings || (LegacyWorkbenchLayoutSettings = {}));
class LayoutStateModel extends Disposable {
    static { this.STORAGE_PREFIX = 'workbench.'; }
    constructor(storageService, configurationService, contextService, environmentService) {
        super();
        this.storageService = storageService;
        this.configurationService = configurationService;
        this.contextService = contextService;
        this.environmentService = environmentService;
        this._onDidChangeState = this._register(new Emitter());
        this.onDidChangeState = this._onDidChangeState.event;
        this.stateCache = new Map();
        this.isNew = {
            [1 /* StorageScope.WORKSPACE */]: this.storageService.isNew(1 /* StorageScope.WORKSPACE */),
            [0 /* StorageScope.PROFILE */]: this.storageService.isNew(0 /* StorageScope.PROFILE */),
            [-1 /* StorageScope.APPLICATION */]: this.storageService.isNew(-1 /* StorageScope.APPLICATION */)
        };
        this._register(this.configurationService.onDidChangeConfiguration(configurationChange => this.updateStateFromLegacySettings(configurationChange)));
    }
    updateStateFromLegacySettings(configurationChangeEvent) {
        if (configurationChangeEvent.affectsConfiguration("workbench.activityBar.location" /* LayoutSettings.ACTIVITY_BAR_LOCATION */)) {
            this.setRuntimeValueAndFire(LayoutStateKeys.ACTIVITYBAR_HIDDEN, this.isActivityBarHidden());
        }
        if (configurationChangeEvent.affectsConfiguration(LegacyWorkbenchLayoutSettings.STATUSBAR_VISIBLE)) {
            this.setRuntimeValueAndFire(LayoutStateKeys.STATUSBAR_HIDDEN, !this.configurationService.getValue(LegacyWorkbenchLayoutSettings.STATUSBAR_VISIBLE));
        }
        if (configurationChangeEvent.affectsConfiguration(LegacyWorkbenchLayoutSettings.SIDEBAR_POSITION)) {
            this.setRuntimeValueAndFire(LayoutStateKeys.SIDEBAR_POSITON, positionFromString(this.configurationService.getValue(LegacyWorkbenchLayoutSettings.SIDEBAR_POSITION) ?? 'left'));
        }
    }
    updateLegacySettingsFromState(key, value) {
        const isZenMode = this.getRuntimeValue(LayoutStateKeys.ZEN_MODE_ACTIVE);
        if (key.zenModeIgnore && isZenMode) {
            return;
        }
        if (key === LayoutStateKeys.ACTIVITYBAR_HIDDEN) {
            this.configurationService.updateValue("workbench.activityBar.location" /* LayoutSettings.ACTIVITY_BAR_LOCATION */, value ? "hidden" /* ActivityBarPosition.HIDDEN */ : undefined);
        }
        else if (key === LayoutStateKeys.STATUSBAR_HIDDEN) {
            this.configurationService.updateValue(LegacyWorkbenchLayoutSettings.STATUSBAR_VISIBLE, !value);
        }
        else if (key === LayoutStateKeys.SIDEBAR_POSITON) {
            this.configurationService.updateValue(LegacyWorkbenchLayoutSettings.SIDEBAR_POSITION, positionToString(value));
        }
    }
    load(configuration) {
        let key;
        // Load stored values for all keys unless we explicitly set to reset
        if (!configuration.resetLayout) {
            for (key in LayoutStateKeys) {
                const stateKey = LayoutStateKeys[key];
                const value = this.loadKeyFromStorage(stateKey);
                if (value !== undefined) {
                    this.stateCache.set(stateKey.name, value);
                }
            }
        }
        // Apply legacy settings
        this.stateCache.set(LayoutStateKeys.ACTIVITYBAR_HIDDEN.name, this.isActivityBarHidden());
        this.stateCache.set(LayoutStateKeys.STATUSBAR_HIDDEN.name, !this.configurationService.getValue(LegacyWorkbenchLayoutSettings.STATUSBAR_VISIBLE));
        this.stateCache.set(LayoutStateKeys.SIDEBAR_POSITON.name, positionFromString(this.configurationService.getValue(LegacyWorkbenchLayoutSettings.SIDEBAR_POSITION) ?? 'left'));
        // Set dynamic defaults: part sizing and side bar visibility
        const auxiliaryBarForceMaximized = this.configurationService.getValue(WorkbenchLayoutSettings.AUXILIARYBAR_FORCE_MAXIMIZED);
        const workbenchState = this.contextService.getWorkbenchState();
        const mainContainerDimension = configuration.mainContainerDimension;
        LayoutStateKeys.SIDEBAR_SIZE.defaultValue = Math.min(300, mainContainerDimension.width / 4);
        LayoutStateKeys.SIDEBAR_HIDDEN.defaultValue = workbenchState === 1 /* WorkbenchState.EMPTY */ || auxiliaryBarForceMaximized === true;
        LayoutStateKeys.AUXILIARYBAR_SIZE.defaultValue = auxiliaryBarForceMaximized ? Math.max(300, mainContainerDimension.width / 2) : Math.min(300, mainContainerDimension.width / 4);
        LayoutStateKeys.AUXILIARYBAR_HIDDEN.defaultValue = (() => {
            if (isWeb && !this.environmentService.remoteAuthority) {
                return true; // not required in web if unsupported
            }
            if (auxiliaryBarForceMaximized === true) {
                return false; // forced to be visible
            }
            // Unless auxiliary bar visibility is explicitly configured, make
            // sure to not force open it in case we know it was empty before.
            const configuration = this.configurationService.inspect(WorkbenchLayoutSettings.AUXILIARYBAR_DEFAULT_VISIBILITY);
            if (configuration.defaultValue !== 'hidden' && !isConfigured(configuration) && this.stateCache.get(LayoutStateKeys.AUXILIARYBAR_EMPTY.name)) {
                return true;
            }
            // New users: Show auxiliary bar even in empty workspaces
            // but not if the user explicitly hides it
            if (this.isNew[-1 /* StorageScope.APPLICATION */] &&
                configuration.value !== 'hidden') {
                return false;
            }
            // Existing users: respect visibility setting
            switch (configuration.value) {
                case 'hidden':
                    return true;
                case 'visibleInWorkspace':
                case 'maximizedInWorkspace':
                    return workbenchState === 1 /* WorkbenchState.EMPTY */;
                default:
                    return false;
            }
        })();
        LayoutStateKeys.PANEL_SIZE.defaultValue = (this.stateCache.get(LayoutStateKeys.PANEL_POSITION.name) ?? isHorizontal(LayoutStateKeys.PANEL_POSITION.defaultValue)) ? mainContainerDimension.height / 3 : mainContainerDimension.width / 4;
        LayoutStateKeys.PANEL_POSITION.defaultValue = positionFromString(this.configurationService.getValue(WorkbenchLayoutSettings.PANEL_POSITION) ?? 'bottom');
        // Apply all defaults
        for (key in LayoutStateKeys) {
            const stateKey = LayoutStateKeys[key];
            if (this.stateCache.get(stateKey.name) === undefined) {
                this.stateCache.set(stateKey.name, stateKey.defaultValue);
            }
        }
        // Apply all overrides
        this.applyOverrides(configuration);
        // Register for runtime key changes
        this._register(this.storageService.onDidChangeValue(0 /* StorageScope.PROFILE */, undefined, this._store)(storageChangeEvent => {
            let key;
            for (key in LayoutStateKeys) {
                const stateKey = LayoutStateKeys[key];
                if (stateKey instanceof RuntimeStateKey && stateKey.scope === 0 /* StorageScope.PROFILE */ && stateKey.target === 0 /* StorageTarget.USER */) {
                    if (`${LayoutStateModel.STORAGE_PREFIX}${stateKey.name}` === storageChangeEvent.key) {
                        const value = this.loadKeyFromStorage(stateKey) ?? stateKey.defaultValue;
                        if (this.stateCache.get(stateKey.name) !== value) {
                            this.stateCache.set(stateKey.name, value);
                            this._onDidChangeState.fire({ key: stateKey, value });
                        }
                    }
                }
            }
        }));
    }
    applyOverrides(configuration) {
        // Auxiliary bar: Maximized settings
        if (this.isNew[1 /* StorageScope.WORKSPACE */]) {
            const defaultAuxiliaryBarVisibility = this.configurationService.getValue(WorkbenchLayoutSettings.AUXILIARYBAR_DEFAULT_VISIBILITY);
            const startupEditor = this.configurationService.getValue('workbench.startupEditor');
            if (startupEditor === 'agentSessionsWelcomePage') {
                this.applyAuxiliaryBarHiddenOverride(true);
            }
            else if (defaultAuxiliaryBarVisibility === 'maximized' ||
                (defaultAuxiliaryBarVisibility === 'maximizedInWorkspace' && this.contextService.getWorkbenchState() !== 1 /* WorkbenchState.EMPTY */)) {
                this.applyAuxiliaryBarMaximizedOverride();
            }
        }
        // Both editor and panel should not be hidden on startup unless auxiliary bar is maximized
        if (this.getRuntimeValue(LayoutStateKeys.PANEL_HIDDEN) &&
            this.getRuntimeValue(LayoutStateKeys.EDITOR_HIDDEN) &&
            !this.getRuntimeValue(LayoutStateKeys.AUXILIARYBAR_WAS_LAST_MAXIMIZED)) {
            this.setRuntimeValue(LayoutStateKeys.EDITOR_HIDDEN, false);
        }
        // Restrict auxiliary bar size in case of small window dimensions
        if (this.isNew[1 /* StorageScope.WORKSPACE */] && configuration.mainContainerDimension.width <= DEFAULT_WORKSPACE_WINDOW_DIMENSIONS.width) {
            this.setInitializationValue(LayoutStateKeys.SIDEBAR_SIZE, Math.min(300, configuration.mainContainerDimension.width / 4));
            this.setInitializationValue(LayoutStateKeys.AUXILIARYBAR_SIZE, Math.min(300, configuration.mainContainerDimension.width / 4));
        }
    }
    applyAuxiliaryBarMaximizedOverride() {
        this.setRuntimeValue(LayoutStateKeys.AUXILIARYBAR_LAST_NON_MAXIMIZED_VISIBILITY, {
            sideBarVisible: !this.getRuntimeValue(LayoutStateKeys.SIDEBAR_HIDDEN),
            panelVisible: !this.getRuntimeValue(LayoutStateKeys.PANEL_HIDDEN),
            editorVisible: !this.getRuntimeValue(LayoutStateKeys.EDITOR_HIDDEN),
            auxiliaryBarVisible: !this.getRuntimeValue(LayoutStateKeys.AUXILIARYBAR_HIDDEN)
        });
        this.setRuntimeValue(LayoutStateKeys.SIDEBAR_HIDDEN, true);
        this.setRuntimeValue(LayoutStateKeys.PANEL_HIDDEN, true);
        this.setRuntimeValue(LayoutStateKeys.EDITOR_HIDDEN, true);
        this.setRuntimeValue(LayoutStateKeys.AUXILIARYBAR_HIDDEN, false);
        this.setRuntimeValue(LayoutStateKeys.AUXILIARYBAR_LAST_NON_MAXIMIZED_SIZE, this.getInitializationValue(LayoutStateKeys.AUXILIARYBAR_SIZE));
        this.setRuntimeValue(LayoutStateKeys.AUXILIARYBAR_WAS_LAST_MAXIMIZED, true);
    }
    applyAuxiliaryBarHiddenOverride(value) {
        this.setRuntimeValue(LayoutStateKeys.AUXILIARYBAR_HIDDEN, value);
    }
    save(workspace, global) {
        let key;
        const isZenMode = this.getRuntimeValue(LayoutStateKeys.ZEN_MODE_ACTIVE);
        for (key in LayoutStateKeys) {
            const stateKey = LayoutStateKeys[key];
            if ((workspace && stateKey.scope === 1 /* StorageScope.WORKSPACE */) ||
                (global && stateKey.scope === 0 /* StorageScope.PROFILE */)) {
                if (isZenMode && stateKey instanceof RuntimeStateKey && stateKey.zenModeIgnore) {
                    continue; // Don't write out specific keys while in zen mode
                }
                this.saveKeyToStorage(stateKey);
            }
        }
    }
    getInitializationValue(key) {
        return this.stateCache.get(key.name);
    }
    setInitializationValue(key, value) {
        this.stateCache.set(key.name, value);
    }
    getRuntimeValue(key, fallbackToSetting) {
        if (fallbackToSetting) {
            switch (key) {
                case LayoutStateKeys.ACTIVITYBAR_HIDDEN:
                    this.stateCache.set(key.name, this.isActivityBarHidden());
                    break;
                case LayoutStateKeys.STATUSBAR_HIDDEN:
                    this.stateCache.set(key.name, !this.configurationService.getValue(LegacyWorkbenchLayoutSettings.STATUSBAR_VISIBLE));
                    break;
                case LayoutStateKeys.SIDEBAR_POSITON:
                    this.stateCache.set(key.name, this.configurationService.getValue(LegacyWorkbenchLayoutSettings.SIDEBAR_POSITION) ?? 'left');
                    break;
            }
        }
        return this.stateCache.get(key.name);
    }
    setRuntimeValue(key, value) {
        this.stateCache.set(key.name, value);
        const isZenMode = this.getRuntimeValue(LayoutStateKeys.ZEN_MODE_ACTIVE);
        if (key.scope === 0 /* StorageScope.PROFILE */) {
            if (!isZenMode || !key.zenModeIgnore) {
                this.saveKeyToStorage(key);
                this.updateLegacySettingsFromState(key, value);
            }
        }
    }
    isActivityBarHidden() {
        const oldValue = this.configurationService.getValue(WorkbenchLayoutSettings.ACTIVITY_BAR_VISIBLE);
        if (oldValue !== undefined) {
            return !oldValue;
        }
        return this.configurationService.getValue("workbench.activityBar.location" /* LayoutSettings.ACTIVITY_BAR_LOCATION */) !== "default" /* ActivityBarPosition.DEFAULT */;
    }
    setRuntimeValueAndFire(key, value) {
        const previousValue = this.stateCache.get(key.name);
        if (previousValue === value) {
            return;
        }
        this.setRuntimeValue(key, value);
        this._onDidChangeState.fire({ key, value });
    }
    saveKeyToStorage(key) {
        const value = this.stateCache.get(key.name);
        this.storageService.store(`${LayoutStateModel.STORAGE_PREFIX}${key.name}`, typeof value === 'object' ? JSON.stringify(value) : value, key.scope, key.target);
    }
    loadKeyFromStorage(key) {
        const value = this.storageService.get(`${LayoutStateModel.STORAGE_PREFIX}${key.name}`, key.scope);
        if (value !== undefined) {
            this.isNew[key.scope] = false; // remember that we had previous state for this scope
            switch (typeof key.defaultValue) {
                case 'boolean': return (value === 'true');
                case 'number': return parseInt(value);
                case 'object': return JSON.parse(value);
            }
        }
        return value;
    }
}
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGF5b3V0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2Jyb3dzZXIvbGF5b3V0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsYUFBYSxFQUFFLGVBQWUsRUFBZSxZQUFZLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUN2SCxPQUFPLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQzVELE9BQU8sRUFBRSxTQUFTLEVBQUUscUJBQXFCLEVBQUUsYUFBYSxFQUFFLElBQUksRUFBYyxxQkFBcUIsRUFBRSxzQkFBc0IsRUFBRSxpQkFBaUIsRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLGdCQUFnQixFQUFFLFNBQVMsRUFBRSxXQUFXLEVBQUUsZ0JBQWdCLEVBQUUsU0FBUyxFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDcFIsT0FBTyxFQUFFLHFCQUFxQixFQUFFLFlBQVksRUFBRSxZQUFZLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUNsRyxPQUFPLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxXQUFXLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQzlGLE9BQU8sRUFBNEMscUJBQXFCLEVBQXVCLGNBQWMsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBQzNJLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDdkQsT0FBTyxFQUF1RSxrQkFBa0IsRUFBRSxnQkFBZ0IsRUFBRSw0QkFBNEIsRUFBd0osd0JBQXdCLEVBQUUsWUFBWSxFQUFFLGlCQUFpQixFQUE4QixNQUFNLDZDQUE2QyxDQUFDO0FBQ25iLE9BQU8sRUFBRSxvQkFBb0Is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