/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import './style.js';
import { runWhenWindowIdle } from '../../base/browser/dom.js';
import { Event, Emitter, setGlobalLeakWarningThreshold } from '../../base/common/event.js';
import { RunOnceScheduler, timeout } from '../../base/common/async.js';
import { isFirefox, isSafari, isChrome } from '../../base/browser/browser.js';
import { mark } from '../../base/common/performance.js';
import { onUnexpectedError, setUnexpectedErrorHandler } from '../../base/common/errors.js';
import { Registry } from '../../platform/registry/common/platform.js';
import { isWindows, isLinux, isWeb, isNative, isMacintosh } from '../../base/common/platform.js';
import { Extensions as WorkbenchExtensions } from '../common/contributions.js';
import { EditorExtensions } from '../common/editor.js';
import { getSingletonServiceDescriptors } from '../../platform/instantiation/common/extensions.js';
import { IWorkbenchLayoutService, positionToString } from '../services/layout/browser/layoutService.js';
import { IStorageService, WillSaveStateReason } from '../../platform/storage/common/storage.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { ILifecycleService } from '../services/lifecycle/common/lifecycle.js';
import { INotificationService } from '../../platform/notification/common/notification.js';
import { NotificationsCenter } from './parts/notifications/notificationsCenter.js';
import { NotificationsAlerts } from './parts/notifications/notificationsAlerts.js';
import { NotificationsStatus } from './parts/notifications/notificationsStatus.js';
import { registerNotificationCommands } from './parts/notifications/notificationsCommands.js';
import { NotificationsToasts } from './parts/notifications/notificationsToasts.js';
import { setARIAContainer } from '../../base/browser/ui/aria/aria.js';
import { FontMeasurements } from '../../editor/browser/config/fontMeasurements.js';
import { createBareFontInfoFromRawSettings } from '../../editor/common/config/fontInfoFromSettings.js';
import { toErrorMessage } from '../../base/common/errorMessage.js';
import { WorkbenchContextKeysHandler } from './contextkeys.js';
import { coalesce } from '../../base/common/arrays.js';
import { InstantiationService } from '../../platform/instantiation/common/instantiationService.js';
import { Layout } from './layout.js';
import { IHostService } from '../services/host/browser/host.js';
import { IDialogService } from '../../platform/dialogs/common/dialogs.js';
import { mainWindow } from '../../base/browser/window.js';
import { PixelRatio } from '../../base/browser/pixelRatio.js';
import { IHoverService, WorkbenchHoverDelegate } from '../../platform/hover/browser/hover.js';
import { setHoverDelegateFactory } from '../../base/browser/ui/hover/hoverDelegateFactory.js';
import { setBaseLayerHoverDelegate } from '../../base/browser/ui/hover/hoverDelegate2.js';
import { AccessibilityProgressSignalScheduler } from '../../platform/accessibilitySignal/browser/progressAccessibilitySignalScheduler.js';
import { setProgressAccessibilitySignalScheduler } from '../../base/browser/ui/progressbar/progressAccessibilitySignal.js';
import { AccessibleViewRegistry } from '../../platform/accessibility/browser/accessibleViewRegistry.js';
import { NotificationAccessibleView } from './parts/notifications/notificationAccessibleView.js';
import { IMarkdownRendererService } from '../../platform/markdown/browser/markdownRenderer.js';
import { EditorMarkdownCodeBlockRenderer } from '../../editor/browser/widget/markdownRenderer/browser/editorMarkdownCodeBlockRenderer.js';
export class Workbench extends Layout {
    constructor(parent, options, serviceCollection, logService) {
        super(parent, { resetLayout: Boolean(options?.resetLayout) });
        this.options = options;
        this.serviceCollection = serviceCollection;
        this._onWillShutdown = this._register(new Emitter());
        this.onWillShutdown = this._onWillShutdown.event;
        this._onDidShutdown = this._register(new Emitter());
        this.onDidShutdown = this._onDidShutdown.event;
        this.previousUnexpectedError = { message: undefined, time: 0 };
        // Perf: measure workbench startup time
        mark('code/willStartWorkbench');
        this.registerErrorHandler(logService);
    }
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
                // as these possibly will use the default hover delegate
                setHoverDelegateFactory((placement, enableInstantHover) => instantiationService.createInstance(WorkbenchHoverDelegate, placement, { instantHover: enableInstantHover }, {}));
                setBaseLayerHoverDelegate(hoverService);
                // Layout
                this.initLayout(accessor);
                // Registries
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
        // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
        //
        // NOTE: Please do NOT register services here. Use `registerSingleton()`
        //       from `workbench.common.main.ts` if the service is shared between
        //       desktop and web or `workbench.desktop.main.ts` if the service
        //       is desktop only.
        //
        // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
        // All Contributed Services
        const contributedServices = getSingletonServiceDescriptors();
        for (const [id, descriptor] of contributedServices) {
            serviceCollection.set(id, descriptor);
        }
        const instantiationService = new InstantiationService(serviceCollection, true);
        // Wrap up
        instantiationService.invokeFunction(accessor => {
            const lifecycleService = accessor.get(ILifecycleService);
            // TODO@Sandeep debt around cyclic dependencies
            const configurationService = accessor.get(IConfigurationService);
            if (configurationService && 'acquireInstantiationService' in configurationService) {
                configurationService.acquireInstantiationService(instantiationService);
            }
            // Signal to lifecycle that services are set
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
        // In some environments we do not get enough time to persist state on shutdown.
        // In other cases, VSCode might crash, so we periodically save state to reduce
        // the chance of loosing any state.
        // The window loosing focus is a good indication that the user has stopped working
        // in that window so we pick that at a time to collect state.
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
    renderWorkbench(instantiationService, notificationService, storageService, configurationService) {
        // ARIA & Signals
        setARIAContainer(this.mainContainer);
        setProgressAccessibilitySignalScheduler((msDelayTime, msLoopTime) => instantiationService.createInstance(AccessibilityProgressSignalScheduler, msDelayTime, msLoopTime));
        // State specific classes
        const platformClass = isWindows ? 'windows' : isLinux ? 'linux' : 'mac';
        const workbenchClasses = coalesce([
            'monaco-workbench',
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
        // Create Parts
        for (const { id, role, classes, options } of [
            { id: "workbench.parts.titlebar" /* Parts.TITLEBAR_PART */, role: 'none', classes: ['titlebar'] },
            { id: "workbench.parts.banner" /* Parts.BANNER_PART */, role: 'banner', classes: ['banner'] },
            { id: "workbench.parts.activitybar" /* Parts.ACTIVITYBAR_PART */, role: 'none', classes: ['activitybar', this.getSideBarPosition() === 0 /* Position.LEFT */ ? 'left' : 'right'] }, // Use role 'none' for some parts to make screen readers less chatty #114892
            { id: "workbench.parts.sidebar" /* Parts.SIDEBAR_PART */, role: 'none', classes: ['sidebar', this.getSideBarPosition() === 0 /* Position.LEFT */ ? 'left' : 'right'] },
            { id: "workbench.parts.editor" /* Parts.EDITOR_PART */, role: 'main', classes: ['editor'], options: { restorePreviousState: this.willRestoreEditors() } },
            { id: "workbench.parts.panel" /* Parts.PANEL_PART */, role: 'none', classes: ['panel', 'basepanel', positionToString(this.getPanelPosition())] },
            { id: "workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */, role: 'none', classes: ['auxiliarybar', 'basepanel', this.getSideBarPosition() === 0 /* Position.LEFT */ ? 'right' : 'left'] },
            { id: "workbench.parts.statusbar" /* Parts.STATUSBAR_PART */, role: 'status', classes: ['statusbar'] }
        ]) {
            const partContainer = this.createPart(id, role, classes);
            mark(`code/willCreatePart/${id}`);
            this.getPart(id).create(partContainer, options);
            mark(`code/didCreatePart/${id}`);
        }
        // Notification Handlers
        this.createNotificationsHandlers(instantiationService, notificationService);
        // Add Workbench to DOM
        this.parent.appendChild(this.mainContainer);
    }
    createPart(id, role, classes) {
        const part = document.createElement(role === 'status' ? 'footer' /* Use footer element for status bar #98376 */ : 'div');
        part.classList.add('part', ...classes);
        part.id = id;
        part.setAttribute('role', role);
        if (role === 'status') {
            part.setAttribute('aria-live', 'off');
        }
        return part;
    }
    createNotificationsHandlers(instantiationService, notificationService) {
        // Instantiate Notification components
        const notificationsCenter = this._register(instantiationService.createInstance(NotificationsCenter, this.mainContainer, notificationService.model));
        const notificationsToasts = this._register(instantiationService.createInstance(NotificationsToasts, this.mainContainer, notificationService.model));
        this._register(instantiationService.createInstance(NotificationsAlerts, notificationService.model));
        const notificationsStatus = instantiationService.createInstance(NotificationsStatus, notificationService.model);
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
    restore(lifecycleService) {
        // Ask each part to restore
        try {
            this.restoreParts();
        }
        catch (error) {
            onUnexpectedError(error);
        }
        // Transition into restored phase after layout has restored
        // but do not wait indefinitely on this to account for slow
        // editors restoring. Since the workbench is fully functional
        // even when the visible editors have not resolved, we still
        // want contributions on the `Restored` phase to work before
        // slow editors have resolved. But we also do not want fast
        // editors to resolve slow when too many contributions get
        // instantiated, so we find a middle ground solution via
        // `Promise.race`
        this.whenReady.finally(() => Promise.race([
            this.whenRestored,
            timeout(2000)
        ]).finally(() => {
            // Update perf marks only when the layout is fully
            // restored. We want the time it takes to restore
            // editors to be included in these numbers
            function markDidStartWorkbench() {
                mark('code/didStartWorkbench');
                performance.measure('perf: workbench create & restore', 'code/didLoadWorkbenchMain', 'code/didStartWorkbench');
            }
            if (this.isRestored()) {
                markDidStartWorkbench();
            }
            else {
                this.whenRestored.finally(() => markDidStartWorkbench());
            }
            // Set lifecycle phase to `Restored`
            lifecycleService.phase = 3 /* LifecyclePhase.Restored */;
            // Set lifecycle phase to `Eventually` after a short delay and when idle (min 2.5sec, max 5sec)
            const eventuallyPhaseScheduler = this._register(new RunOnceScheduler(() => {
                this._register(runWhenWindowIdle(mainWindow, () => lifecycleService.phase = 4 /* LifecyclePhase.Eventually */, 2500));
            }, 2500));
            eventuallyPhaseScheduler.schedule();
        }));
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya2JlbmNoLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2Jyb3dzZXIvd29ya2JlbmNoLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sWUFBWSxDQUFDO0FBQ3BCLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQzlELE9BQU8sRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDM0YsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE9BQU8sRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQzlFLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN4RCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUseUJBQXlCLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUMzRixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDdEUsT0FBTyxFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxXQUFXLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUNqRyxPQUFPLEVBQW1DLFVBQVUsSUFBSSxtQkFBbUIsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQ2hILE9BQU8sRUFBMEIsZ0JBQWdCLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUMvRSxPQUFPLEVBQUUsOEJBQThCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNuRyxPQUFPLEVBQW1CLHVCQUF1QixFQUFFLGdCQUFnQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDekgsT0FBTyxFQUFFLGVBQWUsRUFBRSxtQkFBbUIsRUFBK0IsTUFBTSww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