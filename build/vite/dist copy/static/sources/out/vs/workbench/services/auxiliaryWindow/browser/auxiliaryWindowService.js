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
var BrowserAuxiliaryWindowService_1;
import { getZoomLevel } from '../../../../base/browser/browser.js';
import { $, Dimension, EventHelper, EventType, ModifierKeyEmitter, addDisposableListener, copyAttributes, createLinkElement, createMetaElement, getActiveWindow, getClientArea, getWindowId, isHTMLElement, position, registerWindow, sharedMutationObserver, trackAttributes } from '../../../../base/browser/dom.js';
import { cloneGlobalStylesheets, isGlobalStylesheet } from '../../../../base/browser/domStylesheets.js';
import { ensureCodeWindow, mainWindow } from '../../../../base/browser/window.js';
import { coalesce } from '../../../../base/common/arrays.js';
import { Barrier } from '../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { mark } from '../../../../base/common/performance.js';
import { isFirefox, isWeb } from '../../../../base/common/platform.js';
import Severity from '../../../../base/common/severity.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { DEFAULT_AUX_WINDOW_SIZE, WindowMinimumSize } from '../../../../platform/window/common/window.js';
import { BaseWindow } from '../../../browser/window.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { IHostService } from '../../host/browser/host.js';
import { IWorkbenchLayoutService } from '../../layout/browser/layoutService.js';
export const IAuxiliaryWindowService = createDecorator('auxiliaryWindowService');
export var AuxiliaryWindowMode;
(function (AuxiliaryWindowMode) {
    AuxiliaryWindowMode[AuxiliaryWindowMode["Maximized"] = 0] = "Maximized";
    AuxiliaryWindowMode[AuxiliaryWindowMode["Normal"] = 1] = "Normal";
    AuxiliaryWindowMode[AuxiliaryWindowMode["Fullscreen"] = 2] = "Fullscreen";
})(AuxiliaryWindowMode || (AuxiliaryWindowMode = {}));
const DEFAULT_AUX_WINDOW_DIMENSIONS = new Dimension(DEFAULT_AUX_WINDOW_SIZE.width, DEFAULT_AUX_WINDOW_SIZE.height);
let AuxiliaryWindow = class AuxiliaryWindow extends BaseWindow {
    constructor(window, container, stylesHaveLoaded, configurationService, hostService, environmentService, contextMenuService, layoutService) {
        super(window, undefined, hostService, environmentService, contextMenuService, layoutService);
        this.window = window;
        this.container = container;
        this.configurationService = configurationService;
        this._onWillLayout = this._register(new Emitter());
        this.onWillLayout = this._onWillLayout.event;
        this._onDidLayout = this._register(new Emitter());
        this.onDidLayout = this._onDidLayout.event;
        this._onBeforeUnload = this._register(new Emitter());
        this.onBeforeUnload = this._onBeforeUnload.event;
        this._onUnload = this._register(new Emitter());
        this.onUnload = this._onUnload.event;
        this._onWillDispose = this._register(new Emitter());
        this.onWillDispose = this._onWillDispose.event;
        this.compact = false;
        this.whenStylesHaveLoaded = stylesHaveLoaded.wait().then(() => undefined);
        this.registerListeners();
    }
    updateOptions(options) {
        this.compact = options.compact;
    }
    registerListeners() {
        this._register(addDisposableListener(this.window, EventType.BEFORE_UNLOAD, (e) => this.handleBeforeUnload(e)));
        this._register(addDisposableListener(this.window, EventType.UNLOAD, () => this.handleUnload()));
        this._register(addDisposableListener(this.window, 'unhandledrejection', e => {
            onUnexpectedError(e.reason);
            e.preventDefault();
        }));
        this._register(addDisposableListener(this.window, EventType.RESIZE, () => this.layout()));
        this._register(addDisposableListener(this.container, EventType.SCROLL, () => this.container.scrollTop = 0)); // Prevent container from scrolling (#55456)
        if (isWeb) {
            this._register(addDisposableListener(this.container, EventType.DROP, e => EventHelper.stop(e, true))); // Prevent default navigation on drop
            this._register(addDisposableListener(this.container, EventType.WHEEL, e => e.preventDefault(), { passive: false })); // Prevent the back/forward gestures in macOS
            this._register(addDisposableListener(this.container, EventType.CONTEXT_MENU, e => EventHelper.stop(e, true))); // Prevent native context menus in web
        }
        else {
            this._register(addDisposableListener(this.window.document.body, EventType.DRAG_OVER, (e) => EventHelper.stop(e))); // Prevent drag feedback on <body>
            this._register(addDisposableListener(this.window.document.body, EventType.DROP, (e) => EventHelper.stop(e))); // Prevent default navigation on drop
        }
    }
    handleBeforeUnload(e) {
        // Check for veto from a listening component
        let veto;
        this._onBeforeUnload.fire({
            veto(reason) {
                if (reason) {
                    veto = reason;
                }
            }
        });
        if (veto) {
            this.handleVetoBeforeClose(e, veto);
            return;
        }
        // Check for confirm before close setting
        const confirmBeforeCloseSetting = this.configurationService.getValue('window.confirmBeforeClose');
        const confirmBeforeClose = confirmBeforeCloseSetting === 'always' || (confirmBeforeCloseSetting === 'keyboardOnly' && ModifierKeyEmitter.getInstance().isModifierPressed);
        if (confirmBeforeClose) {
            this.confirmBeforeClose(e);
        }
    }
    handleVetoBeforeClose(e, reason) {
        this.preventUnload(e);
    }
    preventUnload(e) {
        e.preventDefault();
        e.returnValue = localize('lifecycleVeto', "Changes that you made may not be saved. Please check press 'Cancel' and try again.");
    }
    confirmBeforeClose(e) {
        this.preventUnload(e);
    }
    handleUnload() {
        // Event
        this._onUnload.fire();
    }
    layout() {
        // Split layout up into two events so that downstream components
        // have a chance to participate in the beginning or end of the
        // layout phase.
        // This helps to build the auxiliary window in another component
        // in the `onWillLayout` phase and then let other compoments
        // react when the overall layout has finished in `onDidLayout`.
        const dimension = getClientArea(this.window.document.body, DEFAULT_AUX_WINDOW_DIMENSIONS, this.container);
        this._onWillLayout.fire(dimension);
        this._onDidLayout.fire(dimension);
    }
    createState() {
        return {
            bounds: {
                x: this.window.screenX,
                y: this.window.screenY,
                width: this.window.outerWidth,
                height: this.window.outerHeight
            },
            zoomLevel: getZoomLevel(this.window),
            compact: this.compact
        };
    }
    dispose() {
        if (this._store.isDisposed) {
            return;
        }
        this._onWillDispose.fire();
        super.dispose();
    }
};
AuxiliaryWindow = __decorate([
    __param(3, IConfigurationService),
    __param(4, IHostService),
    __param(5, IWorkbenchEnvironmentService),
    __param(6, IContextMenuService),
    __param(7, IWorkbenchLayoutService)
], AuxiliaryWindow);
export { AuxiliaryWindow };
let BrowserAuxiliaryWindowService = class BrowserAuxiliaryWindowService extends Disposable {
    static { BrowserAuxiliaryWindowService_1 = this; }
    static { this.WINDOW_IDS = getWindowId(mainWindow) + 1; } // start from the main window ID + 1
    constructor(layoutService, dialogService, configurationService, telemetryService, hostService, environmentService, contextMenuService) {
        super();
        this.layoutService = layoutService;
        this.dialogService = dialogService;
        this.configurationService = configurationService;
        this.telemetryService = telemetryService;
        this.hostService = hostService;
        this.environmentService = environmentService;
        this.contextMenuService = contextMenuService;
        this._onDidOpenAuxiliaryWindow = this._register(new Emitter());
        this.onDidOpenAuxiliaryWindow = this._onDidOpenAuxiliaryWindow.event;
        this.windows = new Map();
    }
    async open(options) {
        mark('code/auxiliaryWindow/willOpen');
        const targetWindow = await this.openWindow(options);
        if (!targetWindow) {
            throw new Error(localize('unableToOpenWindowError', "Unable to open a new window."));
        }
        // Add a `vscodeWindowId` property to identify auxiliary windows
        const resolvedWindowId = await this.resolveWindowId(targetWindow);
        ensureCodeWindow(targetWindow, resolvedWindowId);
        const containerDisposables = new DisposableStore();
        const { container, stylesLoaded } = this.createContainer(targetWindow, containerDisposables, options);
        const auxiliaryWindow = this.createAuxiliaryWindow(targetWindow, container, stylesLoaded);
        auxiliaryWindow.updateOptions({ compact: options?.compact ?? false });
        const registryDisposables = new DisposableStore();
        this.windows.set(targetWindow.vscodeWindowId, auxiliaryWindow);
        registryDisposables.add(toDisposable(() => this.windows.delete(targetWindow.vscodeWindowId)));
        const eventDisposables = new DisposableStore();
        Event.once(auxiliaryWindow.onWillDispose)(() => {
            targetWindow.close();
            containerDisposables.dispose();
            registryDisposables.dispose();
            eventDisposables.dispose();
        });
        registryDisposables.add(registerWindow(targetWindow));
        this._onDidOpenAuxiliaryWindow.fire({ window: auxiliaryWindow, disposables: eventDisposables });
        mark('code/auxiliaryWindow/didOpen');
        this.telemetryService.publicLog2('auxiliaryWindowOpen', { bounds: !!options?.bounds });
        return auxiliaryWindow;
    }
    createAuxiliaryWindow(targetWindow, container, stylesLoaded) {
        return new AuxiliaryWindow(targetWindow, container, stylesLoaded, this.configurationService, this.hostService, this.environmentService, this.contextMenuService, this.layoutService);
    }
    async openWindow(options) {
        const activeWindow = getActiveWindow();
        const activeWindowBounds = {
            x: activeWindow.screenX,
            y: activeWindow.screenY,
            width: activeWindow.outerWidth,
            height: activeWindow.outerHeight
        };
        const defaultSize = DEFAULT_AUX_WINDOW_SIZE;
        const width = Math.max(options?.bounds?.width ?? defaultSize.width, WindowMinimumSize.WIDTH);
        const height = Math.max(options?.bounds?.height ?? defaultSize.height, WindowMinimumSize.HEIGHT);
        let newWindowBounds = {
            x: options?.bounds?.x ?? Math.max(activeWindowBounds.x + activeWindowBounds.width / 2 - width / 2, 0),
            y: options?.bounds?.y ?? Math.max(activeWindowBounds.y + activeWindowBounds.height / 2 - height / 2, 0),
            width,
            height
        };
        if (!options?.bounds && newWindowBounds.x === activeWindowBounds.x && newWindowBounds.y === activeWindowBounds.y) {
            // Offset the new window a bit so that it does not overlap
            // with the active window, unless bounds are provided
            newWindowBounds = {
                ...newWindowBounds,
                x: newWindowBounds.x + 30,
                y: newWindowBounds.y + 30
            };
        }
        const features = coalesce([
            'popup=yes',
            `left=${newWindowBounds.x}`,
            `top=${newWindowBounds.y}`,
            `width=${newWindowBounds.width}`,
            `height=${newWindowBounds.height}`,
            // non-standard properties
            options?.nativeTitlebar ? 'window-native-titlebar=yes' : undefined,
            options?.disableFullscreen ? 'window-disable-fullscreen=yes' : undefined,
            options?.alwaysOnTop ? 'window-always-on-top=yes' : undefined,
            options?.mode === AuxiliaryWindowMode.Maximized ? 'window-maximized=yes' : undefined,
            options?.mode === AuxiliaryWindowMode.Fullscreen ? 'window-fullscreen=yes' : undefined
        ]);
        const auxiliaryWindow = mainWindow.open(isFirefox ? '' /* FF immediately fires an unload event if using about:blank */ : 'about:blank', undefined, features.join(','));
        if (!auxiliaryWindow && isWeb) {
            return (await this.dialogService.prompt({
                type: Severity.Warning,
                message: localize('unableToOpenWindow', "The browser blocked opening a new window. Press 'Retry' to try again."),
                custom: {
                    markdownDetails: [{ markdown: new MarkdownString(localize('unableToOpenWindowDetail', "Please allow pop-ups for this website in your [browser settings]({0}).", 'https://aka.ms/allow-vscode-popup'), true) }]
                },
                buttons: [
                    {
                        label: localize({ key: 'retry', comment: ['&& denotes a mnemonic'] }, "&&Retry"),
                        run: () => this.openWindow(options)
                    }
                ],
                cancelButton: true
            })).result;
        }
        return auxiliaryWindow?.window;
    }
    async resolveWindowId(auxiliaryWindow) {
        return BrowserAuxiliaryWindowService_1.WINDOW_IDS++;
    }
    createContainer(auxiliaryWindow, disposables, options) {
        auxiliaryWindow.document.createElement = function () {
            // Disallow `createElement` because it would create
            // HTML Elements in the "wrong" context and break
            // code that does "instanceof HTMLElement" etc.
            throw new Error('Not allowed to create elements in child window JavaScript context. Always use the main window so that "xyz instanceof HTMLElement" continues to work.');
        };
        this.applyMeta(auxiliaryWindow);
        const { stylesLoaded } = this.applyCSS(auxiliaryWindow, disposables);
        const container = this.applyHTML(auxiliaryWindow, disposables);
        return { stylesLoaded, container };
    }
    applyMeta(auxiliaryWindow) {
        for (const metaTag of ['meta[charset="utf-8"]', 'meta[http-equiv="Content-Security-Policy"]', 'meta[name="viewport"]', 'meta[name="theme-color"]']) {
            // eslint-disable-next-line no-restricted-syntax
            const metaElement = mainWindow.document.querySelector(metaTag);
            if (metaElement) {
                const clonedMetaElement = createMetaElement(auxiliaryWindow.document.head);
                copyAttributes(metaElement, clonedMetaElement);
                if (metaTag === 'meta[http-equiv="Content-Security-Policy"]') {
                    const content = clonedMetaElement.getAttribute('content');
                    if (content) {
                        clonedMetaElement.setAttribute('content', content.replace(/(script-src[^\;]*)/, `script-src 'none'`));
                    }
                }
            }
        }
        // eslint-disable-next-line no-restricted-syntax
        const originalIconLinkTag = mainWindow.document.querySelector('link[rel="icon"]');
        if (originalIconLinkTag) {
            const icon = createLinkElement(auxiliaryWindow.document.head);
            copyAttributes(originalIconLinkTag, icon);
        }
    }
    applyCSS(auxiliaryWindow, disposables) {
        mark('code/auxiliaryWindow/willApplyCSS');
        const mapOriginalToClone = new Map();
        const stylesLoaded = new Barrier();
        stylesLoaded.wait().then(() => mark('code/auxiliaryWindow/didLoadCSSStyles'));
        const pendingLinksDisposables = disposables.add(new DisposableStore());
        let pendingLinksToSettle = 0;
        function onLinkSettled() {
            if (--pendingLinksToSettle === 0) {
                pendingLinksDisposables.dispose();
                stylesLoaded.open();
            }
        }
        function cloneNode(originalNode) {
            if (isGlobalStylesheet(originalNode)) {
                return; // global stylesheets are handled by `cloneGlobalStylesheets` below
            }
            const clonedNode = auxiliaryWindow.document.head.appendChild(originalNode.cloneNode(true));
            if (originalNode.tagName.toLowerCase() === 'link') {
                pendingLinksToSettle++;
                pendingLinksDisposables.add(addDisposableListener(clonedNode, 'load', onLinkSettled));
                pendingLinksDisposables.add(addDisposableListener(clonedNode, 'error', onLinkSettled));
            }
            mapOriginalToClone.set(originalNode, clonedNode);
        }
        // Clone all style elements and stylesheet links from the window to the child window
        // and keep track of <link> elements to settle to signal that styles have loaded
        // Increment pending links right from the beginning to ensure we only settle when
        // all style related nodes have been cloned.
        pendingLinksToSettle++;
        try {
            // eslint-disable-next-line no-restricted-syntax
            for (const originalNode of mainWindow.document.head.querySelectorAll('link[rel="stylesheet"], style')) {
                cloneNode(originalNode);
            }
        }
        finally {
            onLinkSettled();
        }
        // Global stylesheets in <head> are cloned in a special way because the mutation
        // observer is not firing for changes done via `style.sheet` API. Only text changes
        // can be observed.
        disposables.add(cloneGlobalStylesheets(auxiliaryWindow));
        // Listen to new stylesheets as they are being added or removed in the main window
        // and apply to child window (including changes to existing stylesheets elements)
        disposables.add(sharedMutationObserver.observe(mainWindow.document.head, disposables, { childList: true, subtree: true })(mutations => {
            for (const mutation of mutations) {
                if (mutation.type !== 'childList' || // only interested in added/removed nodes
                    mutation.target.nodeName.toLowerCase() === 'title' || // skip over title changes that happen frequently
                    mutation.target.nodeName.toLowerCase() === 'script' || // block <script> changes that are unsupported anyway
                    mutation.target.nodeName.toLowerCase() === 'meta' // do not observe <meta> elements for now
                ) {
                    continue;
                }
                for (const node of mutation.addedNodes) {
                    // <style>/<link> element was added
                    if (isHTMLElement(node) && (node.tagName.toLowerCase() === 'style' || node.tagName.toLowerCase() === 'link')) {
                        cloneNode(node);
                    }
                    // text-node was changed, try to apply to our clones
                    else if (node.nodeType === Node.TEXT_NODE && node.parentNode) {
                        const clonedNode = mapOriginalToClone.get(node.parentNode);
                        if (clonedNode) {
                            clonedNode.textContent = node.textContent;
                        }
                    }
                }
                for (const node of mutation.removedNodes) {
                    const clonedNode = mapOriginalToClone.get(node);
                    if (clonedNode) {
                        clonedNode.parentNode?.removeChild(clonedNode);
                        mapOriginalToClone.delete(node);
                    }
                }
            }
        }));
        mark('code/auxiliaryWindow/didApplyCSS');
        return { stylesLoaded };
    }
    applyHTML(auxiliaryWindow, disposables) {
        mark('code/auxiliaryWindow/willApplyHTML');
        // Create workbench container and apply classes
        const container = $('div', { role: 'application' });
        position(container, 0, 0, 0, 0, 'relative');
        container.style.display = 'flex';
        container.style.height = '100%';
        container.style.flexDirection = 'column';
        auxiliaryWindow.document.body.append(container);
        // Track attributes
        disposables.add(trackAttributes(mainWindow.document.documentElement, auxiliaryWindow.document.documentElement));
        disposables.add(trackAttributes(mainWindow.document.body, auxiliaryWindow.document.body));
        disposables.add(trackAttributes(this.layoutService.mainContainer, container, ['class'])); // only class attribute
        mark('code/auxiliaryWindow/didApplyHTML');
        return container;
    }
    getWindow(windowId) {
        return this.windows.get(windowId);
    }
};
BrowserAuxiliaryWindowService = BrowserAuxiliaryWindowService_1 = __decorate([
    __param(0, IWorkbenchLayoutService),
    __param(1, IDialogService),
    __param(2, IConfigurationService),
    __param(3, ITelemetryService),
    __param(4, IHostService),
    __param(5, IWorkbenchEnvironmentService),
    __param(6, IContextMenuService)
], BrowserAuxiliaryWindowService);
export { BrowserAuxiliaryWindowService };
registerSingleton(IAuxiliaryWindowService, BrowserAuxiliaryWindowService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV4aWxpYXJ5V2luZG93U2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9hdXhpbGlhcnlXaW5kb3cvYnJvd3Nlci9hdXhpbGlhcnlXaW5kb3dTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDbkUsT0FBTyxFQUFFLENBQUMsRUFBRSxTQUFTLEVBQUUsV0FBVyxFQUFFLFNBQVMsRUFBRSxrQkFBa0IsRUFBRSxxQkFBcUIsRUFBRSxjQUFjLEVBQUUsaUJBQWlCLEVBQUUsaUJBQWlCLEVBQUUsZUFBZSxFQUFFLGFBQWEsRUFBRSxXQUFXLEVBQUUsYUFBYSxFQUFFLFFBQVEsRUFBRSxjQUFjLEVBQUUsc0JBQXNCLEVBQUUsZUFBZSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDdlQsT0FBTyxFQUFFLHNCQUFzQixFQUFFLGtCQUFrQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDeEcsT0FBTyxFQUFjLGdCQUFnQixFQUFFLFVBQVUsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzlGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDM0QsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDdEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDeEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQWUsWUFBWSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDOUcs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