/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import '../../workbench/browser/style.js';
import './media/style.css';
import { Disposable, toDisposable } from '../../base/common/lifecycle.js';
import { Emitter, Event, setGlobalLeakWarningThreshold } from '../../base/common/event.js';
import { getActiveDocument, getActiveElement, getClientArea, getWindowId, getWindows, isAncestorUsingFlowTo, size, Dimension, runWhenWindowIdle } from '../../base/browser/dom.js';
import { DeferredPromise, RunOnceScheduler } from '../../base/common/async.js';
import { isFullscreen, onDidChangeFullscreen, isChrome, isFirefox, isSafari } from '../../base/browser/browser.js';
import { mark } from '../../base/common/performance.js';
import { onUnexpectedError, setUnexpectedErrorHandler } from '../../base/common/errors.js';
import { isWindows, isLinux, isWeb, isNative, isMacintosh } from '../../base/common/platform.js';
import { IWorkbenchLayoutService, positionToString } from '../../workbench/services/layout/browser/layoutService.js';
import { Part } from '../../workbench/browser/part.js';
import { SerializableGrid } from '../../base/browser/ui/grid/grid.js';
import { IEditorGroupsService } from '../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../workbench/services/editor/common/editorService.js';
import { IPaneCompositePartService } from '../../workbench/services/panecomposite/browser/panecomposite.js';
import { IViewDescriptorService } from '../../workbench/common/views.js';
import { ITitleService } from '../../workbench/services/title/browser/titleService.js';
import { mainWindow } from '../../base/browser/window.js';
import { coalesce } from '../../base/common/arrays.js';
import { InstantiationService } from '../../platform/instantiation/common/instantiationService.js';
import { getSingletonServiceDescriptors } from '../../platform/instantiation/common/extensions.js';
import { ILifecycleService } from '../../workbench/services/lifecycle/common/lifecycle.js';
import { IStorageService, WillSaveStateReason } from '../../platform/storage/common/storage.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { IHostService } from '../../workbench/services/host/browser/host.js';
import { IDialogService } from '../../platform/dialogs/common/dialogs.js';
import { INotificationService } from '../../platform/notification/common/notification.js';
import { IHoverService, WorkbenchHoverDelegate } from '../../platform/hover/browser/hover.js';
import { setHoverDelegateFactory } from '../../base/browser/ui/hover/hoverDelegateFactory.js';
import { setBaseLayerHoverDelegate } from '../../base/browser/ui/hover/hoverDelegate2.js';
import { Registry } from '../../platform/registry/common/platform.js';
import { Extensions as WorkbenchExtensions } from '../../workbench/common/contributions.js';
import { EditorExtensions } from '../../workbench/common/editor.js';
import { setARIAContainer } from '../../base/browser/ui/aria/aria.js';
import { FontMeasurements } from '../../editor/browser/config/fontMeasurements.js';
import { createBareFontInfoFromRawSettings } from '../../editor/common/config/fontInfoFromSettings.js';
import { toErrorMessage } from '../../base/common/errorMessage.js';
import { WorkbenchContextKeysHandler } from '../../workbench/browser/contextkeys.js';
import { PixelRatio } from '../../base/browser/pixelRatio.js';
import { AccessibilityProgressSignalScheduler } from '../../platform/accessibilitySignal/browser/progressAccessibilitySignalScheduler.js';
import { setProgressAccessibilitySignalScheduler } from '../../base/browser/ui/progressbar/progressAccessibilitySignal.js';
import { AccessibleViewRegistry } from '../../platform/accessibility/browser/accessibleViewRegistry.js';
import { NotificationAccessibleView } from '../../workbench/browser/parts/notifications/notificationAccessibleView.js';
import { NotificationsCenter } from '../../workbench/browser/parts/notifications/notificationsCenter.js';
import { NotificationsAlerts } from '../../workbench/browser/parts/notifications/notificationsAlerts.js';
import { NotificationsStatus } from '../../workbench/browser/parts/notifications/notificationsStatus.js';
import { registerNotificationCommands } from '../../workbench/browser/parts/notifications/notificationsCommands.js';
import { NotificationsToasts } from '../../workbench/browser/parts/notifications/notificationsToasts.js';
import { IMarkdownRendererService } from '../../platform/markdown/browser/markdownRenderer.js';
import { EditorMarkdownCodeBlockRenderer } from '../../editor/browser/widget/markdownRenderer/browser/editorMarkdownCodeBlockRenderer.js';
import { SyncDescriptor } from '../../platform/instantiation/common/descriptors.js';
import { TitleService } from './parts/titlebarPart.js';
//#endregion
//#region Layout Classes
var LayoutClasses;
(function (LayoutClasses) {
    LayoutClasses["SIDEBAR_HIDDEN"] = "nosidebar";
    LayoutClasses["MAIN_EDITOR_AREA_HIDDEN"] = "nomaineditorarea";
    LayoutClasses["PANEL_HIDDEN"] = "nopanel";
    LayoutClasses["AUXILIARYBAR_HIDDEN"] = "noauxiliarybar";
    LayoutClasses["CHATBAR_HIDDEN"] = "nochatbar";
    LayoutClasses["STATUSBAR_HIDDEN"] = "nostatusbar";
    LayoutClasses["FULLSCREEN"] = "fullscreen";
    LayoutClasses["MAXIMIZED"] = "maximized";
})(LayoutClasses || (LayoutClasses = {}));
//#endregion
export class Workbench extends Disposable {
    get activeContainer() {
        return this.getContainerFromDocument(getActiveDocument());
    }
    get containers() {
        const containers = [];
        for (const { window } of getWindows()) {
            containers.push(this.getContainerFromDocument(window.document));
        }
        return containers;
    }
    getContainerFromDocument(targetDocument) {
        if (targetDocument === this.mainContainer.ownerDocument) {
            return this.mainContainer;
        }
        else {
            // eslint-disable-next-line no-restricted-syntax
            return targetDocument.body.getElementsByClassName('monaco-workbench')[0];
        }
    }
    get mainContainerDimension() { return this._mainContainerDimension; }
    get activeContainerDimension() {
        return this.getContainerDimension(this.activeContainer);
    }
    getContainerDimension(container) {
        if (container === this.mainContainer) {
            return this.mainContainerDimension;
        }
        else {
            return getClientArea(container);
        }
    }
    get mainContainerOffset() {
        return this.computeContainerOffset();
    }
    get activeContainerOffset() {
        return this.computeContainerOffset();
    }
    computeContainerOffset() {
        let top = 0;
        let quickPickTop = 0;
        if (this.isVisible("workbench.parts.titlebar" /* Parts.TITLEBAR_PART */, mainWindow)) {
            top = this.getPart("workbench.parts.titlebar" /* Parts.TITLEBAR_PART */).maximumHeight;
            quickPickTop = top;
        }
        return { top, quickPickTop };
    }
    //#endregion
    constructor(parent, options, serviceCollection, logService) {
        super();
        this.parent = parent;
        this.options = options;
        this.serviceCollection = serviceCollection;
        this.logService = logService;
        //#region Lifecycle Events
        this._onWillShutdown = this._register(new Emitter());
        this.onWillShutdown = this._onWillShutdown.event;
        this._onDidShutdown = this._register(new Emitter());
        this.onDidShutdown = this._onDidShutdown.event;
        //#endregion
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
        //#endregion
        //#region State
        this.parts = new Map();
        this.partVisibility = {
            sidebar: true,
            auxiliaryBar: false,
            editor: false,
            panel: false,
            chatBar: true
        };
        this.mainWindowFullscreen = false;
        this.maximized = new Set();
        this.restoredPromise = new DeferredPromise();
        this.whenRestored = this.restoredPromise.p;
        this.restored = false;
        this.openedDefaultEditors = false;
        this.previousUnexpectedError = { message: undefined, time: 0 };
        // Perf: measure workbench startup time
        mark('code/willStartWorkbench');
        this.registerErrorHandler(logService);
    }
    //#region Error Handling
    registerErrorHandler(logService) {
        // Increase stack trace limit for better errors stacks
        if (!isFirefox) {
            Error.stackTraceLimit = 100;
        }
        // Listen on unhandled rejection events
        // Note: intentionally not registered as disposable to handle
        //       errors that can occur during shutdown phase.
        mainWindow.addEventListener('unhandledrejection', (event) => {
            // See https://developer.mozilla.org/en-US/docs/Web/API/PromiseRejectionEvent
            onUnexpectedError(event.reason);
            // Prevent the printing of this event to the console
            event.preventDefault();
        });
        // Install handler for unexpected errors
        setUnexpectedErrorHandler(error => this.handleUnexpectedError(error, logService));
    }
    handleUnexpectedError(error, logService) {
        const message = toErrorMessage(error, true);
        if (!message) {
            return;
        }
        const now = Date.now();
        if (message === this.previousUnexpectedError.message && now - this.previousUnexpectedError.time <= 1000) {
            return; // Return if error message identical to previous and shorter than 1 second
        }
        this.previousUnexpectedError.time = now;
        this.previousUnexpectedError.message = message;
        // Log it
        logService.error(message);
    }
    //#endregion
    //#region Startup
    startup() {
        try {
            // Configure emitter leak warning threshold
            this._register(setGlobalLeakWarningThreshold(175));
            // Services
            const instantiationService = this.initServices(this.serviceCollection);
            instantiationService.invokeFunction(accessor => {
                const lifecycleService = accessor.get(ILifecycleService);
                const storageService = accessor.get(IStorageService);
                const configurationService = accessor.get(IConfigurationService);
                const hostService = accessor.get(IHostService);
                const hoverService = accessor.get(IHoverService);
                const dialogService = accessor.get(IDialogService);
                const notificationService = accessor.get(INotificationService);
                const markdownRendererService = accessor.get(IMarkdownRendererService);
                // Set code block renderer for markdown rendering
                markdownRendererService.setDefaultCodeBlockRenderer(instantiationService.createInstance(EditorMarkdownCodeBlockRenderer));
                // Default Hover Delegate must be registered before creating any workbench/layout components
                setHoverDelegateFactory((placement, enableInstantHover) => instantiationService.createInstance(WorkbenchHoverDelegate, placement, { instantHover: enableInstantHover }, {}));
                setBaseLayerHoverDelegate(hoverService);
                // Layout
                this.initLayout(accessor);
                // Registries - this creates and registers all parts
                Registry.as(WorkbenchExtensions.Workbench).start(accessor);
                Registry.as(EditorExtensions.EditorFactory).start(accessor);
                // Context Keys
                this._register(instantiationService.createInstance(WorkbenchContextKeysHandler));
                // Register Listeners
                this.registerListeners(lifecycleService, storageService, configurationService, hostService, dialogService);
                // Render Workbench
                this.renderWorkbench(instantiationService, notificationService, storageService, configurationService);
                // Workbench Layout
                this.createWorkbenchLayout();
                // Workbench Management
                this.createWorkbenchManagement(instantiationService);
                // Layout
                this.layout();
                // Restore
                this.restore(lifecycleService);
            });
            return instantiationService;
        }
        catch (error) {
            onUnexpectedError(error);
            throw error; // rethrow because this is a critical issue we cannot handle properly here
        }
    }
    initServices(serviceCollection) {
        // Layout Service
        serviceCollection.set(IWorkbenchLayoutService, this);
        // Title Service - agent sessions titlebar with dedicated part overrides
        serviceCollection.set(ITitleService, new SyncDescriptor(TitleService, []));
        // All Contributed Services
        const contributedServices = getSingletonServiceDescriptors();
        for (const [id, descriptor] of contributedServices) {
            serviceCollection.set(id, descriptor);
        }
        const instantiationService = new InstantiationService(serviceCollection, true);
        // Wrap up
        instantiationService.invokeFunction(accessor => {
            const lifecycleService = accessor.get(ILifecycleService);
            lifecycleService.phase = 2 /* LifecyclePhase.Ready */;
        });
        return instantiationService;
    }
    registerListeners(lifecycleService, storageService, configurationService, hostService, dialogService) {
        // Configuration changes
        this._register(configurationService.onDidChangeConfiguration(e => this.updateFontAliasing(e, configurationService)));
        // Font Info
        if (isNative) {
            this._register(storageService.onWillSaveState(e => {
                if (e.reason === WillSaveStateReason.SHUTDOWN) {
                    this.storeFontInfo(storageService);
                }
            }));
        }
        else {
            this._register(lifecycleService.onWillShutdown(() => this.storeFontInfo(storageService)));
        }
        // Lifecycle
        this._register(lifecycleService.onWillShutdown(event => this._onWillShutdown.fire(event)));
        this._register(lifecycleService.onDidShutdown(() => {
            this._onDidShutdown.fire();
            this.dispose();
        }));
        // Flush storage on window focus loss
        this._register(hostService.onDidChangeFocus(focus => {
            if (!focus) {
                storageService.flush();
            }
        }));
        // Dialogs showing/hiding
        this._register(dialogService.onWillShowDialog(() => this.mainContainer.classList.add('modal-dialog-visible')));
        this._register(dialogService.onDidShowDialog(() => this.mainContainer.classList.remove('modal-dialog-visible')));
    }
    updateFontAliasing(e, configurationService) {
        if (!isMacintosh) {
            return; // macOS only
        }
        if (e && !e.affectsConfiguration('workbench.fontAliasing')) {
            return;
        }
        const aliasing = configurationService.getValue('workbench.fontAliasing');
        if (this.fontAliasing === aliasing) {
            return;
        }
        this.fontAliasing = aliasing;
        // Remove all
        const fontAliasingValues = ['antialiased', 'none', 'auto'];
        this.mainContainer.classList.remove(...fontAliasingValues.map(value => `monaco-font-aliasing-${value}`));
        // Add specific
        if (fontAliasingValues.some(option => option === aliasing)) {
            this.mainContainer.classList.add(`monaco-font-aliasing-${aliasing}`);
        }
    }
    restoreFontInfo(storageService, configurationService) {
        const storedFontInfoRaw = storageService.get('editorFontInfo', -1 /* StorageScope.APPLICATION */);
        if (storedFontInfoRaw) {
            try {
                const storedFontInfo = JSON.parse(storedFontInfoRaw);
                if (Array.isArray(storedFontInfo)) {
                    FontMeasurements.restoreFontInfo(mainWindow, storedFontInfo);
                }
            }
            catch (err) {
                /* ignore */
            }
        }
        FontMeasurements.readFontInfo(mainWindow, createBareFontInfoFromRawSettings(configurationService.getValue('editor'), PixelRatio.getInstance(mainWindow).value));
    }
    storeFontInfo(storageService) {
        const serializedFontInfo = FontMeasurements.serializeFontInfo(mainWindow);
        if (serializedFontInfo) {
            storageService.store('editorFontInfo', JSON.stringify(serializedFontInfo), -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
        }
    }
    //#endregion
    renderWorkbench(instantiationService, notificationService, storageService, configurationService) {
        // ARIA & Signals
        setARIAContainer(this.mainContainer);
        setProgressAccessibilitySignalScheduler((msDelayTime, msLoopTime) => instantiationService.createInstance(AccessibilityProgressSignalScheduler, msDelayTime, msLoopTime));
        // State specific classes
        const platformClass = isWindows ? 'windows' : isLinux ? 'linux' : 'mac';
        const workbenchClasses = coalesce([
            'monaco-workbench',
            'agent-sessions-workbench',
            platformClass,
            isWeb ? 'web' : undefined,
            isChrome ? 'chromium' : isFirefox ? 'firefox' : isSafari ? 'safari' : undefined,
            ...this.getLayoutClasses(),
            ...(this.options?.extraClasses ? this.options.extraClasses : [])
        ]);
        this.mainContainer.classList.add(...workbenchClasses);
        // Apply font aliasing
        this.updateFontAliasing(undefined, configurationService);
        // Warm up font cache information before building up too many dom elements
        this.restoreFontInfo(storageService, configurationService);
        // Create Parts (excluding editor - it will be in a modal)
        for (const { id, role, classes } of [
            { id: "workbench.parts.titlebar" /* Parts.TITLEBAR_PART */, role: 'none', classes: ['titlebar'] },
            { id: "workbench.parts.sidebar" /* Parts.SIDEBAR_PART */, role: 'none', classes: ['sidebar', 'left'] },
            { id: "workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */, role: 'none', classes: ['auxiliarybar', 'basepanel', 'right'] },
            { id: "workbench.parts.chatbar" /* Parts.CHATBAR_PART */, role: 'main', classes: ['chatbar', 'basepanel', 'right'] },
            { id: "workbench.parts.panel" /* Parts.PANEL_PART */, role: 'none', classes: ['panel', 'basepanel', positionToString(this.getPanelPosition())] },
        ]) {
            const partContainer = this.createPartContainer(id, role, classes);
            mark(`code/willCreatePart/${id}`);
            this.getPart(id).create(partContainer);
            mark(`code/didCreatePart/${id}`);
        }
        // Create Editor Part (hidden — all editors open via MODAL_GROUP)
        this.createHiddenEditorPart();
        // Notification Handlers
        this.createNotificationsHandlers(instantiationService, notificationService);
        // Add Workbench to DOM
        this.parent.appendChild(this.mainContainer);
    }
    createNotificationsHandlers(instantiationService, notificationService) {
        // Instantiate Notification components
        const notificationsCenter = this._register(instantiationService.createInstance(NotificationsCenter, this.mainContainer, notificationService.model));
        const notificationsToasts = this._register(instantiationService.createInstance(NotificationsToasts, this.mainContainer, notificationService.model));
        this._register(instantiationService.createInstance(NotificationsAlerts, notificationService.model));
        const notificationsStatus = this._register(instantiationService.createInstance(NotificationsStatus, notificationService.model));
        // Visibility
        this._register(notificationsCenter.onDidChangeVisibility(() => {
            notificationsStatus.update(notificationsCenter.isVisible, notificationsToasts.isVisible);
            notificationsToasts.update(notificationsCenter.isVisible);
        }));
        this._register(notificationsToasts.onDidChangeVisibility(() => {
            notificationsStatus.update(notificationsCenter.isVisible, notificationsToasts.isVisible);
        }));
        // Register Commands
        registerNotificationCommands(notificationsCenter, notificationsToasts, notificationService.model);
        // Register notification accessible view
        AccessibleViewRegistry.register(new NotificationAccessibleView());
        // Register with Layout
        this.registerNotifications({
            onDidChangeNotificationsVisibility: Event.map(Event.any(notificationsToasts.onDidChangeVisibility, notificationsCenter.onDidChangeVisibility), () => notificationsToasts.isVisible || notificationsCenter.isVisible)
        });
    }
    createPartContainer(id, role, classes) {
        const part = document.createElement('div');
        part.classList.add('part', ...classes);
        part.id = id;
        part.setAttribute('role', role);
        return part;
    }
    createHiddenEditorPart() {
        const editorPartContainer = document.createElement('div');
        editorPartContainer.classList.add('part', 'editor');
        editorPartContainer.id = "workbench.parts.editor" /* Parts.EDITOR_PART */;
        editorPartContainer.setAttribute('role', 'main');
        editorPartContainer.style.display = 'none';
        mark('code/willCreatePart/workbench.parts.editor');
        this.getPart("workbench.parts.editor" /* Parts.EDITOR_PART */).create(editorPartContainer, { restorePreviousState: false });
        mark('code/didCreatePart/workbench.parts.editor');
        this.getPart("workbench.parts.editor" /* Parts.EDITOR_PART */).layout(0, 0, 0, 0); // needed to make some view methods work
        this.mainContainer.appendChild(editorPartContainer);
    }
    restore(lifecycleService) {
        // Update perf marks
        mark('code/didStartWorkbench');
        performance.measure('perf: workbench create & restore', 'code/didLoadWorkbenchMain', 'code/didStartWorkbench');
        // Restore parts (open default view containers)
        this.restoreParts();
        // Set lifecycle phase to `Restored`
        lifecycleService.phase = 3 /* LifecyclePhase.Restored */;
        // Mark as restored
        this.setRestored();
        // Set lifecycle phase to `Eventually` after a short delay and when idle (min 2.5sec, max 5sec)
        const eventuallyPhaseScheduler = this._register(new RunOnceScheduler(() => {
            this._register(runWhenWindowIdle(mainWindow, () => lifecycleService.phase = 4 /* LifecyclePhase.Eventually */, 2500));
        }, 2500));
        eventuallyPhaseScheduler.schedule();
    }
    restoreParts() {
        // Open default view containers for each visible part
        const partsToRestore = [
            { location: 0 /* ViewContainerLocation.Sidebar */, visible: this.partVisibility.sidebar },
            { location: 1 /* ViewContainerLocation.Panel */, visible: this.partVisibility.panel },
            { location: 2 /* ViewContainerLocation.AuxiliaryBar */, visible: this.partVisibility.auxiliaryBar },
            { location: 3 /* ViewContainerLocation.ChatBar */, visible: this.partVisibility.chatBar },
        ];
        for (const { location, visible } of partsToRestore) {
            if (visible) {
                const defaultViewContainer = this.viewDescriptorService.getDefaultViewContainer(location);
                if (defaultViewContainer) {
                    this.paneCompositeService.openPaneComposite(defaultViewContainer.id, location);
                }
            }
        }
    }
    //#endregion
    //#region Initialization
    initLayout(accessor) {
        // Services - accessing these triggers their instantiation
        // which creates and registers the parts
        this.editorGroupService = accessor.get(IEditorGroupsService);
        this.editorService = accessor.get(IEditorService);
        this.paneCompositeService = accessor.get(IPaneCompositePartService);
        this.viewDescriptorService = accessor.get(IViewDescriptorService);
        accessor.get(ITitleService);
        // Register layout listeners
        this.registerLayoutListeners();
        // Show editor part when an editor opens
        this._register(this.editorService.onWillOpenEditor(() => {
            if (!this.partVisibility.editor) {
                this.setEditorHidden(false);
            }
        }));
        // Hide editor part when last editor closes
        this._register(this.editorService.onDidCloseEditor(() => {
            if (this.partVisibility.editor && this.areAllGroupsEmpty()) {
                this.setEditorHidden(true);
            }
        }));
        // Initialize layout state (must be done before createWorkbenchLayout)
        this._mainContainerDimension = getClientArea(this.parent, new Dimension(800, 600));
    }
    areAllGroupsEmpty() {
        for (const group of this.editorGroupService.groups) {
            if (!group.isEmpty) {
                return false;
            }
        }
        return true;
    }
    registerLayoutListeners() {
        // Fullscreen changes
        this._register(onDidChangeFullscreen(windowId => {
            if (windowId === getWindowId(mainWindow)) {
                this.mainWindowFullscreen = isFullscreen(mainWindow);
                this.updateFullscreenClass();
                this.layout();
            }
        }));
    }
    updateFullscreenClass() {
        if (this.mainWindowFullscreen) {
            this.mainContainer.classList.add(LayoutClasses.FULLSCREEN);
        }
        else {
            this.mainContainer.classList.remove(LayoutClasses.FULLSCREEN);
        }
    }
    //#endregion
    //#region Workbench Layout Creation
    createWorkbenchLayout() {
        const titleBar = this.getPart("workbench.parts.titlebar" /* Parts.TITLEBAR_PART */);
        const editorPart = this.getPart("workbench.parts.editor" /* Parts.EDITOR_PART */);
        const panelPart = this.getPart("workbench.parts.panel" /* Parts.PANEL_PART */);
        const auxiliaryBarPart = this.getPart("workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */);
        const sideBar = this.getPart("workbench.parts.sidebar" /* Parts.SIDEBAR_PART */);
        const chatBarPart = this.getPart("workbench.parts.chatbar" /* Parts.CHATBAR_PART */);
        // View references for parts in the grid (editor is NOT in grid)
        this.titleBarPartView = titleBar;
        this.sideBarPartView = sideBar;
        this.panelPartView = panelPart;
        this.auxiliaryBarPartView = auxiliaryBarPart;
        this.chatBarPartView = chatBarPart;
        const viewMap = {
            ["workbench.parts.titlebar" /* Parts.TITLEBAR_PART */]: this.titleBarPartView,
            ["workbench.parts.panel" /* Parts.PANEL_PART */]: this.panelPartView,
            ["workbench.parts.sidebar" /* Parts.SIDEBAR_PART */]: this.sideBarPartView,
            ["workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */]: this.auxiliaryBarPartView,
            ["workbench.parts.chatbar" /* Parts.CHATBAR_PART */]: this.chatBarPartView
        };
        const fromJSON = ({ type }) => viewMap[type];
        const workbenchGrid = SerializableGrid.deserialize(this.createGridDescriptor(), { fromJSON }, { proportionalLayout: false });
        this.mainContainer.prepend(workbenchGrid.element);
        this.mainContainer.setAttribute('role', 'application');
        this.workbenchGrid = workbenchGrid;
        this.workbenchGrid.edgeSnapping = this.mainWindowFullscreen;
        // Listen for part visibility changes (for parts in grid)
        for (const part of [titleBar, panelPart, sideBar, auxiliaryBarPart, chatBarPart]) {
            this._register(part.onDidVisibilityChange(visible => {
                if (part === sideBar) {
                    this.setSideBarHidden(!visible);
                }
                else if (part === panelPart) {
                    this.setPanelHidden(!visible);
                }
                else if (part === auxiliaryBarPart) {
                    this.setAuxiliaryBarHidden(!visible);
                }
                else if (part === chatBarPart) {
                    this.setChatBarHidden(!visible);
                }
                this._onDidChangePartVisibility.fire({ partId: part.getId(), visible });
                this.handleContainerDidLayout(this.mainContainer, this._mainContainerDimension);
            }));
        }
        // Listen for editor part visibility changes (modal)
        this._register(editorPart.onDidVisibilityChange(visible => {
            this.setEditorHidden(!visible);
            this._onDidChangePartVisibility.fire({ partId: editorPart.getId(), visible });
            this.handleContainerDidLayout(this.mainContainer, this._mainContainerDimension);
        }));
    }
    createWorkbenchManagement(_instantiationService) {
        // No floating toolbars in this layout
    }
    /**
     * Creates the grid descriptor for the Agent Sessions layout.
     * Editor is NOT included - it's rendered as a modal overlay.
     *
     * Structure (horizontal orientation):
     * - Sidebar (left, spans full height from top to bottom)
     * - Right section (vertical):
     *   - Titlebar (top of right section)
     *   - Top right (horizontal): Chat Bar | Auxiliary Bar
     *   - Panel (below chat and auxiliary bar only)
     */
    createGridDescriptor() {
        const { width, height } = this._mainContainerDimension;
        // Default sizes
        const sideBarSize = 300;
        const auxiliaryBarSize = 380;
        const panelSize = 300;
        const titleBarHeight = this.titleBarPartView?.minimumHeight ?? 30;
        // Calculate right section width and chat bar width
        const rightSectionWidth = Math.max(0, width - sideBarSize);
        const chatBarWidth = Math.max(0, rightSectionWidth - auxiliaryBarSize);
        const contentHeight = height - titleBarHeight;
        const topRightHeight = contentHeight - panelSize;
        const titleBarNode = {
            type: 'leaf',
            data: { type: "workbench.parts.titlebar" /* Parts.TITLEBAR_PART */ },
            size: titleBarHeight,
            visible: true
        };
        const sideBarNode = {
            type: 'leaf',
            data: { type: "workbench.parts.sidebar" /* Parts.SIDEBAR_PART */ },
            size: sideBarSize,
            visible: this.partVisibility.sidebar
        };
        const auxiliaryBarNode = {
            type: 'leaf',
            data: { type: "workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */ },
            size: auxiliaryBarSize,
            visible: this.partVisibility.auxiliaryBar
        };
        const chatBarNode = {
            type: 'leaf',
            data: { type: "workbench.parts.chatbar" /* Parts.CHATBAR_PART */ },
            size: chatBarWidth,
            visible: this.partVisibility.chatBar
        };
        const panelNode = {
            type: 'leaf',
            data: { type: "workbench.parts.panel" /* Parts.PANEL_PART */ },
            size: panelSize,
            visible: this.partVisibility.panel
        };
        // Top right section: Chat Bar | Auxiliary Bar (horizontal)
        const topRightSection = {
            type: 'branch',
            data: [chatBarNode, auxiliaryBarNode],
            size: topRightHeight
        };
        // Right section: Titlebar | Top Right | Panel (vertical)
        const rightSection = {
            type: 'branch',
            data: [titleBarNode, topRightSection, panelNode],
            size: rightSectionWidth
        };
        const result = {
            root: {
                type: 'branch',
                size: height,
                data: [
                    sideBarNode,
                    rightSection
                ]
            },
            orientation: 1 /* Orientation.HORIZONTAL */,
            width,
            height
        };
        return result;
    }
    //#endregion
    //#region Layout Methods
    layout() {
        this._mainContainerDimension = getClientArea(this.mainWindowFullscreen ? mainWindow.document.body : this.parent);
        this.logService.trace(`Workbench#layout, height: ${this._mainContainerDimension.height}, width: ${this._mainContainerDimension.width}`);
        size(this.mainContainer, this._mainContainerDimension.width, this._mainContainerDimension.height);
        // Layout the grid widget
        this.workbenchGrid.layout(this._mainContainerDimension.width, this._mainContainerDimension.height);
        // Emit as event
        this.handleContainerDidLayout(this.mainContainer, this._mainContainerDimension);
    }
    handleContainerDidLayout(container, dimension) {
        this._onDidLayoutContainer.fire({ container, dimension });
        if (container === this.mainContainer) {
            this._onDidLayoutMainContainer.fire(dimension);
        }
        if (container === this.activeContainer) {
            this._onDidLayoutActiveContainer.fire(dimension);
        }
    }
    getLayoutClasses() {
        return coalesce([
            !this.partVisibility.sidebar ? LayoutClasses.SIDEBAR_HIDDEN : undefined,
            !this.partVisibility.editor ? LayoutClasses.MAIN_EDITOR_AREA_HIDDEN : undefined,
            !this.partVisibility.panel ? LayoutClasses.PANEL_HIDDEN : undefined,
            !this.partVisibility.auxiliaryBar ? LayoutClasses.AUXILIARYBAR_HIDDEN : undefined,
            !this.partVisibility.chatBar ? LayoutClasses.CHATBAR_HIDDEN : undefined,
            LayoutClasses.STATUSBAR_HIDDEN, // agents window never has a status bar
            this.mainWindowFullscreen ? LayoutClasses.FULLSCREEN : undefined
        ]);
    }
    //#endregion
    //#region Part Management
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
    hasFocus(part) {
        const container = this.getContainer(mainWindow, part);
        if (!container) {
            return false;
        }
        const activeElement = getActiveElement();
        if (!activeElement) {
            return false;
        }
        return isAncestorUsingFlowTo(activeElement, container);
    }
    focusPart(part, targetWindow = mainWindow) {
        switch (part) {
            case "workbench.parts.editor" /* Parts.EDITOR_PART */:
                this.editorGroupService.activeGroup.focus();
                break;
            case "workbench.parts.panel" /* Parts.PANEL_PART */:
                this.paneCompositeService.getActivePaneComposite(1 /* ViewContainerLocation.Panel */)?.focus();
                break;
            case "workbench.parts.sidebar" /* Parts.SIDEBAR_PART */:
                this.paneCompositeService.getActivePaneComposite(0 /* ViewContainerLocation.Sidebar */)?.focus();
                break;
            case "workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */:
                this.paneCompositeService.getActivePaneComposite(2 /* ViewContainerLocation.AuxiliaryBar */)?.focus();
                break;
            case "workbench.parts.chatbar" /* Parts.CHATBAR_PART */:
                this.paneCompositeService.getActivePaneComposite(3 /* ViewContainerLocation.ChatBar */)?.focus();
                break;
            default: {
                const container = this.getContainer(targetWindow, part);
                container?.focus();
            }
        }
    }
    focus() {
        this.focusPart("workbench.parts.chatbar" /* Parts.CHATBAR_PART */);
    }
    getContainer(targetWindow, part) {
        if (typeof part === 'undefined') {
            return this.getContainerFromDocument(targetWindow.document);
        }
        if (targetWindow === mainWindow) {
            return this.parts.get(part)?.getContainer();
        }
        // For auxiliary windows, only editor part is supported
        if (part === "workbench.parts.editor" /* Parts.EDITOR_PART */) {
            const container = this.getContainerFromDocument(targetWindow.document);
            const partCandidate = this.editorGroupService.getPart(container);
            if (partCandidate instanceof Part) {
                return partCandidate.getContainer();
            }
        }
        return undefined;
    }
    whenContainerStylesLoaded(_window) {
        return undefined;
    }
    //#endregion
    //#region Part Visibility
    isActivityBarHidden() {
        return true; // No activity bar in this layout
    }
    isVisible(part, targetWindow) {
        switch (part) {
            case "workbench.parts.titlebar" /* Parts.TITLEBAR_PART */:
                return true; // Always visible
            case "workbench.parts.sidebar" /* Parts.SIDEBAR_PART */:
                return this.partVisibility.sidebar;
            case "workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */:
                return this.partVisibility.auxiliaryBar;
            case "workbench.parts.editor" /* Parts.EDITOR_PART */:
                return this.partVisibility.editor;
            case "workbench.parts.panel" /* Parts.PANEL_PART */:
                return this.partVisibility.panel;
            case "workbench.parts.chatbar" /* Parts.CHATBAR_PART */:
                return this.partVisibility.chatBar;
            case "workbench.parts.activitybar" /* Parts.ACTIVITYBAR_PART */:
            case "workbench.parts.statusbar" /* Parts.STATUSBAR_PART */:
            case "workbench.parts.banner" /* Parts.BANNER_PART */:
            default:
                return false;
        }
    }
    setPartHidden(hidden, part) {
        switch (part) {
            case "workbench.parts.sidebar" /* Parts.SIDEBAR_PART */:
                this.setSideBarHidden(hidden);
                break;
            case "workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */:
                this.setAuxiliaryBarHidden(hidden);
                break;
            case "workbench.parts.editor" /* Parts.EDITOR_PART */:
                this.setEditorHidden(hidden);
                break;
            case "workbench.parts.panel" /* Parts.PANEL_PART */:
                this.setPanelHidden(hidden);
                break;
            case "workbench.parts.chatbar" /* Parts.CHATBAR_PART */:
                this.setChatBarHidden(hidden);
                break;
        }
    }
    setSideBarHidden(hidden) {
        if (this.partVisibility.sidebar === !hidden) {
            return;
        }
        this.partVisibility.sidebar = !hidden;
        this.mainContainer.classList.toggle(LayoutClasses.SIDEBAR_HIDDEN, hidden);
        // Propagate to grid
        this.workbenchGrid.setViewVisible(this.sideBarPartView, !hidden);
        // If sidebar becomes hidden, also hide the current active pane composite
        if (hidden && this.paneCompositeService.getActivePaneComposite(0 /* ViewContainerLocation.Sidebar */)) {
            this.paneCompositeService.hideActivePaneComposite(0 /* ViewContainerLocation.Sidebar */);
        }
        // If sidebar becomes visible, show last active Viewlet or default viewlet
        if (!hidden && !this.paneCompositeService.getActivePaneComposite(0 /* ViewContainerLocation.Sidebar */)) {
            const viewletToOpen = this.paneCompositeService.getLastActivePaneCompositeId(0 /* ViewContainerLocation.Sidebar */) ??
                this.viewDescriptorService.getDefaultViewContainer(0 /* ViewContainerLocation.Sidebar */)?.id;
            if (viewletToOpen) {
                this.paneCompositeService.openPaneComposite(viewletToOpen, 0 /* ViewContainerLocation.Sidebar */);
            }
        }
    }
    setAuxiliaryBarHidden(hidden) {
        if (this.partVisibility.auxiliaryBar === !hidden) {
            return;
        }
        this.partVisibility.auxiliaryBar = !hidden;
        this.mainContainer.classList.toggle(LayoutClasses.AUXILIARYBAR_HIDDEN, hidden);
        // Propagate to grid
        this.workbenchGrid.setViewVisible(this.auxiliaryBarPartView, !hidden);
        // If auxiliary bar becomes hidden, also hide the current active pane composite
        if (hidden && this.paneCompositeService.getActivePaneComposite(2 /* ViewContainerLocation.AuxiliaryBar */)) {
            this.paneCompositeService.hideActivePaneComposite(2 /* ViewContainerLocation.AuxiliaryBar */);
        }
        // If auxiliary bar becomes visible, show last active pane composite or default
        if (!hidden && !this.paneCompositeService.getActivePaneComposite(2 /* ViewContainerLocation.AuxiliaryBar */)) {
            const paneCompositeToOpen = this.paneCompositeService.getLastActivePaneCompositeId(2 /* ViewContainerLocation.AuxiliaryBar */) ??
                this.viewDescriptorService.getDefaultViewContainer(2 /* ViewContainerLocation.AuxiliaryBar */)?.id;
            if (paneCompositeToOpen) {
                this.paneCompositeService.openPaneComposite(paneCompositeToOpen, 2 /* ViewContainerLocation.AuxiliaryBar */);
            }
        }
    }
    setEditorHidden(hidden) {
        if (this.partVisibility.editor === !hidden) {
            return;
        }
        this.partVisibility.editor = !hidden;
        this.mainContainer.classList.toggle(LayoutClasses.MAIN_EDITOR_AREA_HIDDEN, hidden);
    }
    setPanelHidden(hidden) {
        if (this.partVisibility.panel === !hidden) {
            return;
        }
        // If hiding and the panel is maximized, exit maximized state first
        if (hidden && this.workbenchGrid.hasMaximizedView()) {
            this.workbenchGrid.exitMaximizedView();
        }
        const panelHadFocus = !hidden || this.hasFocus("workbench.parts.panel" /* Parts.PANEL_PART */);
        this.partVisibility.panel = !hidden;
        this.mainContainer.classList.toggle(LayoutClasses.PANEL_HIDDEN, hidden);
        // Propagate to grid
        this.workbenchGrid.setViewVisible(this.panelPartView, !hidden);
        // If panel becomes hidden, also hide the current active pane composite
        if (hidden && this.paneCompositeService.getActivePaneComposite(1 /* ViewContainerLocation.Panel */)) {
            this.paneCompositeService.hideActivePaneComposite(1 /* ViewContainerLocation.Panel */);
            // Focus the chat bar when hiding the panel if it had focus
            if (panelHadFocus) {
                this.focusPart("workbench.parts.chatbar" /* Parts.CHATBAR_PART */);
            }
        }
        // If panel becomes visible, show last active panel or default and focus it
        if (!hidden) {
            if (!this.paneCompositeService.getActivePaneComposite(1 /* ViewContainerLocation.Panel */)) {
                const panelToOpen = this.paneCompositeService.getLastActivePaneCompositeId(1 /* ViewContainerLocation.Panel */) ??
                    this.viewDescriptorService.getDefaultViewContainer(1 /* ViewContainerLocation.Panel */)?.id;
                if (panelToOpen) {
                    this.paneCompositeService.openPaneComposite(panelToOpen, 1 /* ViewContainerLocation.Panel */);
                }
            }
            this.focusPart("workbench.parts.panel" /* Parts.PANEL_PART */);
        }
    }
    setChatBarHidden(hidden) {
        if (this.partVisibility.chatBar === !hidden) {
            return;
        }
        this.partVisibility.chatBar = !hidden;
        this.mainContainer.classList.toggle(LayoutClasses.CHATBAR_HIDDEN, hidden);
        // Propagate to grid
        this.workbenchGrid.setViewVisible(this.chatBarPartView, !hidden);
        // If chat bar becomes hidden, also hide the current active pane composite
        if (hidden && this.paneCompositeService.getActivePaneComposite(3 /* ViewContainerLocation.ChatBar */)) {
            this.paneCompositeService.hideActivePaneComposite(3 /* ViewContainerLocation.ChatBar */);
        }
        // If chat bar becomes visible, show last active pane composite or default
        if (!hidden && !this.paneCompositeService.getActivePaneComposite(3 /* ViewContainerLocation.ChatBar */)) {
            const paneCompositeToOpen = this.paneCompositeService.getLastActivePaneCompositeId(3 /* ViewContainerLocation.ChatBar */) ??
                this.viewDescriptorService.getDefaultViewContainer(3 /* ViewContainerLocation.ChatBar */)?.id;
            if (paneCompositeToOpen) {
                this.paneCompositeService.openPaneComposite(paneCompositeToOpen, 3 /* ViewContainerLocation.ChatBar */);
            }
        }
    }
    //#endregion
    //#region Position Methods (Fixed - Not Configurable)
    getSideBarPosition() {
        return 0 /* Position.LEFT */; // Always left in this layout
    }
    getPanelPosition() {
        return 2 /* Position.BOTTOM */; // Always bottom in this layout
    }
    setPanelPosition(_position) {
        // No-op: Panel position is fixed in this layout
    }
    getPanelAlignment() {
        return 'justify'; // Full width panel
    }
    setPanelAlignment(_alignment) {
        // No-op: Panel alignment is fixed in this layout
    }
    //#endregion
    //#region Size Methods
    getSize(part) {
        const view = this.getPartView(part);
        if (!view) {
            return { width: 0, height: 0 };
        }
        return this.workbenchGrid.getViewSize(view);
    }
    setSize(part, size) {
        const view = this.getPartView(part);
        if (view) {
            this.workbenchGrid.resizeView(view, size);
        }
    }
    resizePart(part, sizeChangeWidth, sizeChangeHeight) {
        const view = this.getPartView(part);
        if (!view) {
            return;
        }
        const currentSize = this.workbenchGrid.getViewSize(view);
        this.workbenchGrid.resizeView(view, {
            width: currentSize.width + sizeChangeWidth,
            height: currentSize.height + sizeChangeHeight
        });
    }
    getPartView(part) {
        switch (part) {
            case "workbench.parts.titlebar" /* Parts.TITLEBAR_PART */:
                return this.titleBarPartView;
            case "workbench.parts.sidebar" /* Parts.SIDEBAR_PART */:
                return this.sideBarPartView;
            case "workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */:
                return this.auxiliaryBarPartView;
            case "workbench.parts.editor" /* Parts.EDITOR_PART */:
                return undefined; // Editor is not in the grid, it's a modal
            case "workbench.parts.panel" /* Parts.PANEL_PART */:
                return this.panelPartView;
            case "workbench.parts.chatbar" /* Parts.CHATBAR_PART */:
                return this.chatBarPartView;
            default:
                return undefined;
        }
    }
    getMaximumEditorDimensions(_container) {
        // Return the available space for editor (excluding other parts)
        const sidebarWidth = this.partVisibility.sidebar ? this.workbenchGrid.getViewSize(this.sideBarPartView).width : 0;
        const auxiliaryBarWidth = this.partVisibility.auxiliaryBar ? this.workbenchGrid.getViewSize(this.auxiliaryBarPartView).width : 0;
        const panelHeight = this.partVisibility.panel ? this.workbenchGrid.getViewSize(this.panelPartView).height : 0;
        const titleBarHeight = this.workbenchGrid.getViewSize(this.titleBarPartView).height;
        return new Dimension(this._mainContainerDimension.width - sidebarWidth - auxiliaryBarWidth, this._mainContainerDimension.height - titleBarHeight - panelHeight);
    }
    //#endregion
    //#region Unsupported Features (No-ops)
    toggleMaximizedPanel() {
        if (!this.workbenchGrid) {
            return;
        }
        if (this.isPanelMaximized()) {
            this.workbenchGrid.exitMaximizedView();
        }
        else {
            this.workbenchGrid.maximizeView(this.panelPartView, [this.titleBarPartView, this.sideBarPartView]);
        }
    }
    isPanelMaximized() {
        if (!this.workbenchGrid) {
            return false;
        }
        return this.workbenchGrid.isViewMaximized(this.panelPartView);
    }
    toggleMaximizedAuxiliaryBar() {
        // No-op: Maximize not supported in this layout
    }
    setAuxiliaryBarMaximized(_maximized) {
        return false; // Maximize not supported
    }
    isAuxiliaryBarMaximized() {
        return false; // Maximize not supported
    }
    toggleZenMode() {
        // No-op: Zen mode not supported in this layout
    }
    toggleMenuBar() {
        // No-op: Menu bar toggle not supported in this layout
    }
    isMainEditorLayoutCentered() {
        return false; // Centered layout not supported
    }
    centerMainEditorLayout(_active) {
        // No-op: Centered layout not supported in this layout
    }
    hasMainWindowBorder() {
        return false;
    }
    getMainWindowBorderRadius() {
        return undefined;
    }
    //#endregion
    //#region Window Maximized State
    isWindowMaximized(targetWindow) {
        return this.maximized.has(getWindowId(targetWindow));
    }
    updateWindowMaximizedState(targetWindow, maximized) {
        const windowId = getWindowId(targetWindow);
        if (maximized) {
            this.maximized.add(windowId);
            if (targetWindow === mainWindow) {
                this.mainContainer.classList.add(LayoutClasses.MAXIMIZED);
            }
        }
        else {
            this.maximized.delete(windowId);
            if (targetWindow === mainWindow) {
                this.mainContainer.classList.remove(LayoutClasses.MAXIMIZED);
            }
        }
        this._onDidChangeWindowMaximized.fire({ windowId, maximized });
    }
    //#endregion
    //#region Neighbor Parts
    getVisibleNeighborPart(part, direction) {
        if (!this.workbenchGrid) {
            return undefined;
        }
        const view = this.getPartView(part);
        if (!view) {
            return undefined;
        }
        const neighbor = this.workbenchGrid.getNeighborViews(view, direction, false);
        if (neighbor.length === 0) {
            return undefined;
        }
        const neighborView = neighbor[0];
        if (neighborView === this.titleBarPartView) {
            return "workbench.parts.titlebar" /* Parts.TITLEBAR_PART */;
        }
        if (neighborView === this.sideBarPartView) {
            return "workbench.parts.sidebar" /* Parts.SIDEBAR_PART */;
        }
        if (neighborView === this.auxiliaryBarPartView) {
            return "workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */;
        }
        // Editor is not in the grid - it's rendered as a modal
        if (neighborView === this.panelPartView) {
            return "workbench.parts.panel" /* Parts.PANEL_PART */;
        }
        if (neighborView === this.chatBarPartView) {
            return "workbench.parts.chatbar" /* Parts.CHATBAR_PART */;
        }
        return undefined;
    }
    //#endregion
    //#region Restore
    isRestored() {
        return this.restored;
    }
    setRestored() {
        this.restored = true;
        this.restoredPromise.complete();
    }
    //#endregion
    //#region Notifications Registration
    registerNotifications(delegate) {
        this._register(delegate.onDidChangeNotificationsVisibility(visible => this._onDidChangeNotificationsVisibility.fire(visible)));
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya2JlbmNoLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2Vzc2lvbnMvYnJvd3Nlci93b3JrYmVuY2gudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxrQ0FBa0MsQ0FBQztBQUMxQyxPQUFPLG1CQUFtQixDQUFDO0FBQzNCLE9BQU8sRUFBRSxVQUFVLEVBQWdDLFlBQVksRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3hHLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDM0YsT0FBTyxFQUFFLGlCQUFpQixFQUFFLGdCQUFnQixFQUFFLGFBQWEsRUFBRSxXQUFXLEVBQUUsVUFBVSxFQUFjLHFCQUFxQixFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUMvTCxPQUFPLEVBQUUsZUFBZSxFQUFFLGdCQUFnQixFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDL0UsT0FBTyxFQUFFLFlBQVksRUFBRSxxQkFBcUIsRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLFFBQVEsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ25ILE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN4RCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUseUJBQXlCLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUMzRixPQUFPLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLFdBQVcsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ2pHLE9BQU8sRUFBbUMsdUJBQXVCLEVBQXVFLGdCQUFnQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFFM04sT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZE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