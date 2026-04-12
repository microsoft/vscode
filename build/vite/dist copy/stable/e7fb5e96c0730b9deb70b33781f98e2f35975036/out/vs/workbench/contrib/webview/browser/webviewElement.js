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
import { isFirefox } from '../../../../base/browser/browser.js';
import { addDisposableListener, EventType, getWindow, getWindowById } from '../../../../base/browser/dom.js';
import { parentOriginHash } from '../../../../base/browser/iframe.js';
import { promiseWithResolvers, ThrottledDelayer } from '../../../../base/common/async.js';
import { streamToBuffer } from '../../../../base/common/buffer.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { COI } from '../../../../base/common/network.js';
import { observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IRemoteAuthorityResolverService } from '../../../../platform/remote/common/remoteAuthorityResolver.js';
import { ITunnelService } from '../../../../platform/tunnel/common/tunnel.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { WebviewPortMappingManager } from '../../../../platform/webview/common/webviewPortMapping.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { decodeAuthority, webviewGenericCspSource, webviewRootResourceAuthority } from '../common/webview.js';
import { loadLocalResource, WebviewResourceResponse } from './resourceLoading.js';
import { areWebviewContentOptionsEqual } from './webview.js';
import { WebviewFindWidget } from './webviewFindWidget.js';
var WebviewState;
(function (WebviewState) {
    let Type;
    (function (Type) {
        Type[Type["Initializing"] = 0] = "Initializing";
        Type[Type["Ready"] = 1] = "Ready";
    })(Type = WebviewState.Type || (WebviewState.Type = {}));
    class Initializing {
        constructor(pendingMessages) {
            this.pendingMessages = pendingMessages;
            this.type = 0 /* Type.Initializing */;
        }
    }
    WebviewState.Initializing = Initializing;
    WebviewState.Ready = { type: 1 /* Type.Ready */ };
})(WebviewState || (WebviewState = {}));
const webviewIdContext = 'webviewId';
let WebviewElement = class WebviewElement extends Disposable {
    get window() { return typeof this._windowId === 'number' ? getWindowById(this._windowId)?.window : undefined; }
    get platform() { return 'browser'; }
    get element() { return this._element; }
    get isFocused() {
        if (!this._focused) {
            return false;
        }
        // code window is only available after the webview is mounted.
        if (!this.window) {
            return false;
        }
        if (this.window.document.activeElement && this.window.document.activeElement !== this.element) {
            // looks like https://github.com/microsoft/vscode/issues/132641
            // where the focus is actually not in the `<iframe>`
            return false;
        }
        return true;
    }
    constructor(initInfo, webviewThemeDataProvider, configurationService, contextMenuService, notificationService, _environmentService, _fileService, _logService, _remoteAuthorityResolverService, _tunnelService, instantiationService, _accessibilityService, _uriIdentityService) {
        super();
        this.webviewThemeDataProvider = webviewThemeDataProvider;
        this._environmentService = _environmentService;
        this._fileService = _fileService;
        this._logService = _logService;
        this._remoteAuthorityResolverService = _remoteAuthorityResolverService;
        this._tunnelService = _tunnelService;
        this._accessibilityService = _accessibilityService;
        this._uriIdentityService = _uriIdentityService;
        this.id = generateUuid();
        this._windowId = undefined;
        this._expectedServiceWorkerVersion = 4; // Keep this in sync with the version in service-worker.js
        this._state = new WebviewState.Initializing([]);
        this._resourceLoadingCts = this._register(new CancellationTokenSource());
        this._focusDelayer = this._register(new ThrottledDelayer(50));
        this._onDidHtmlChange = this._register(new Emitter());
        this.onDidHtmlChange = this._onDidHtmlChange.event;
        this._messageHandlers = new Map();
        this.checkImeCompletionState = true;
        this.intrinsicContentSize = observableValue('WebviewIntrinsicContentSize', undefined);
        this._disposed = false;
        this._onMissingCsp = this._register(new Emitter());
        this.onMissingCsp = this._onMissingCsp.event;
        this._onDidClickLink = this._register(new Emitter());
        this.onDidClickLink = this._onDidClickLink.event;
        this._onMessage = this._register(new Emitter());
        this.onMessage = this._onMessage.event;
        this._onDidScroll = this._register(new Emitter());
        this.onDidScroll = this._onDidScroll.event;
        this._onDidWheel = this._register(new Emitter());
        this.onDidWheel = this._onDidWheel.event;
        this._onDidUpdateState = this._register(new Emitter());
        this.onDidUpdateState = this._onDidUpdateState.event;
        this._onDidFocus = this._register(new Emitter());
        this.onDidFocus = this._onDidFocus.event;
        this._onDidBlur = this._register(new Emitter());
        this.onDidBlur = this._onDidBlur.event;
        this._onFatalError = this._register(new Emitter());
        this.onFatalError = this._onFatalError.event;
        this._onDidDispose = this._register(new Emitter());
        this.onDidDispose = this._onDidDispose.event;
        this._hasAlertedAboutMissingCsp = false;
        this._hasFindResult = this._register(new Emitter());
        this.hasFindResult = this._hasFindResult.event;
        this._onDidStopFind = this._register(new Emitter());
        this.onDidStopFind = this._onDidStopFind.event;
        this.providedViewType = initInfo.providedViewType;
        this.origin = initInfo.origin ?? this.id;
        this._options = initInfo.options;
        this.extension = initInfo.extension;
        this._content = {
            html: '',
            title: initInfo.title,
            options: initInfo.contentOptions,
            state: undefined
        };
        this._portMappingManager = this._register(new WebviewPortMappingManager(() => this.extension?.location, () => this._content.options.portMapping || [], this._tunnelService));
        this._element = this._createElement(initInfo.options, initInfo.contentOptions);
        this._register(this.on('no-csp-found', () => {
            this.handleNoCspFound();
        }));
        this._register(this.on('did-click-link', ({ uri }) => {
            this._onDidClickLink.fire(uri);
        }));
        this._register(this.on('onmessage', ({ message, transfer }) => {
            this._onMessage.fire({ message, transfer });
        }));
        this._register(this.on('did-scroll', ({ scrollYPercentage }) => {
            this._onDidScroll.fire({ scrollYPercentage });
        }));
        this._register(this.on('do-reload', () => {
            this.reload();
        }));
        this._register(this.on('do-update-state', (state) => {
            this.state = state;
            this._onDidUpdateState.fire(state);
        }));
        this._register(this.on('did-focus', () => {
            this.handleFocusChange(true);
        }));
        this._register(this.on('did-blur', () => {
            this.handleFocusChange(false);
        }));
        this._register(this.on('did-scroll-wheel', (event) => {
            this._onDidWheel.fire(event);
        }));
        this._register(this.on('did-find', ({ didFind }) => {
            this._hasFindResult.fire(didFind);
        }));
        this._register(this.on('fatal-error', (e) => {
            notificationService.error(localize('fatalErrorMessage', "Error loading webview: {0}", e.message));
            this._onFatalError.fire({ message: e.message });
        }));
        this._register(this.on('did-keydown', (data) => {
            // Electron: workaround for https://github.com/electron/electron/issues/14258
            // We have to detect keyboard events in the <webview> and dispatch them to our
            // keybinding service because these events do not bubble to the parent window anymore.
            this.handleKeyEvent('keydown', data);
        }));
        this._register(this.on('did-keyup', (data) => {
            this.handleKeyEvent('keyup', data);
        }));
        this._register(this.on('did-context-menu', (data) => {
            if (!this.element) {
                return;
            }
            if (!this._contextKeyService) {
                return;
            }
            const elementBox = this.element.getBoundingClientRect();
            const contextKeyService = this._contextKeyService.createOverlay([
                ...Object.entries(data.context),
                [webviewIdContext, this.providedViewType],
            ]);
            contextMenuService.showContextMenu({
                menuId: MenuId.WebviewContext,
                menuActionOptions: { shouldForwardArgs: true },
                contextKeyService,
                getActionsContext: () => ({ ...data.context, webview: this.providedViewType }),
                getAnchor: () => ({
                    x: elementBox.x + data.clientX,
                    y: elementBox.y + data.clientY
                })
            });
            this._send('set-context-menu-visible', { visible: true });
        }));
        this._register(this.on('load-resource', async (entry) => {
            try {
                // Restore the authority we previously encoded
                const authority = decodeAuthority(entry.authority);
                const uri = URI.from({
                    scheme: entry.scheme,
                    authority: authority,
                    path: decodeURIComponent(entry.path), // This gets re-encoded
                    query: entry.query ? decodeURIComponent(entry.query) : entry.query,
                });
                this.loadResource(entry.id, uri, entry.ifNoneMatch);
            }
            catch (e) {
                this._send('did-load-resource', {
                    id: entry.id,
                    status: 404,
                    path: entry.path,
                });
            }
        }));
        this._register(this.on('load-localhost', (entry) => {
            this.localLocalhost(entry.id, entry.origin);
        }));
        this._register(Event.runAndSubscribe(webviewThemeDataProvider.onThemeDataChanged, () => this.style()));
        this._register(_accessibilityService.onDidChangeReducedMotion(() => this.style()));
        this._register(_accessibilityService.onDidChangeScreenReaderOptimized(() => this.style()));
        this._register(contextMenuService.onDidHideContextMenu(() => this._send('set-context-menu-visible', { visible: false })));
        this._confirmBeforeClose = configurationService.getValue('window.confirmBeforeClose');
        this._register(configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('window.confirmBeforeClose')) {
                this._confirmBeforeClose = configurationService.getValue('window.confirmBeforeClose');
                this._send('set-confirm-before-close', this._confirmBeforeClose);
            }
        }));
        this._register(this.on('drag-start', () => {
            this._startBlockingIframeDragEvents();
        }));
        this._register(this.on('drag', (event) => {
            this.handleDragEvent('drag', event);
        }));
        this._register(this.on('updated-intrinsic-content-size', (event) => {
            this.intrinsicContentSize.set({ width: event.width, height: event.height }, undefined, undefined);
        }));
        if (initInfo.options.enableFindWidget) {
            this._webviewFindWidget = this._register(instantiationService.createInstance(WebviewFindWidget, this));
        }
    }
    dispose() {
        this._disposed = true;
        this.element?.remove();
        this._element = undefined;
        this._messagePort = undefined;
        if (this._state.type === 0 /* WebviewState.Type.Initializing */) {
            for (const message of this._state.pendingMessages) {
                message.resolve(false);
            }
            this._state.pendingMessages = [];
        }
        this._onDidDispose.fire();
        this._resourceLoadingCts.dispose(true);
        super.dispose();
    }
    setContextKeyService(contextKeyService) {
        this._contextKeyService = contextKeyService;
    }
    postMessage(message, transfer) {
        return this._send('message', { message, transfer });
    }
    async _send(channel, data, _createElement = []) {
        if (this._state.type === 0 /* WebviewState.Type.Initializing */) {
            const { promise, resolve } = promiseWithResolvers();
            this._state.pendingMessages.push({ channel, data, transferable: _createElement, resolve });
            return promise;
        }
        else {
            return this.doPostMessage(channel, data, _createElement);
        }
    }
    _createElement(options, _contentOptions) {
        // Do not start loading the webview yet.
        // Wait the end of the ctor when all listeners have been hooked up.
        const element = document.createElement('iframe');
        element.name = this.id;
        element.className = `webview ${options.customClasses || ''}`;
        element.sandbox.add('allow-scripts', 'allow-same-origin', 'allow-forms', 'allow-pointer-lock', 'allow-downloads');
        const allowRules = ['cross-origin-isolated', 'autoplay', 'local-network-access'];
        if (!isFirefox) {
            allowRules.push('clipboard-read', 'clipboard-write');
        }
        element.setAttribute('allow', allowRules.join('; '));
        element.style.border = 'none';
        element.style.width = '100%';
        element.style.height = '100%';
        element.focus = () => {
            this._doFocus();
        };
        return element;
    }
    _initElement(encodedWebviewOrigin, extension, options, targetWindow) {
        // The extensionId and purpose in the URL are used for filtering in js-debug:
        const params = {
            id: this.id,
            parentId: targetWindow.vscodeWindowId.toString(),
            origin: this.origin,
            swVersion: String(this._expectedServiceWorkerVersion),
            extensionId: extension?.id.value ?? '',
            platform: this.platform,
            'vscode-resource-base-authority': webviewRootResourceAuthority,
            parentOrigin: targetWindow.origin,
        };
        if (this._options.disableServiceWorker) {
            params.disableServiceWorker = 'true';
        }
        if (this._environmentService.remoteAuthority) {
            params.remoteAuthority = this._environmentService.remoteAuthority;
        }
        if (options.purpose) {
            params.purpose = options.purpose;
        }
        COI.addSearchParam(params, true, true);
        const queryString = new URLSearchParams(params).toString();
        this.perfMark('init/set-src');
        const fileName = 'index.html';
        this.element.setAttribute('src', `${this.webviewContentEndpoint(encodedWebviewOrigin)}/${fileName}?${queryString}`);
    }
    mountTo(element, targetWindow) {
        if (!this.element) {
            return;
        }
        this._windowId = targetWindow.vscodeWindowId;
        this._encodedWebviewOriginPromise = parentOriginHash(targetWindow.origin, this.origin).then(id => this._encodedWebviewOrigin = id);
        this._encodedWebviewOriginPromise.then(encodedWebviewOrigin => {
            if (!this._disposed) {
                this._initElement(encodedWebviewOrigin, this.extension, this._options, targetWindow);
            }
        });
        this._registerMessageHandler(targetWindow);
        if (this._webviewFindWidget) {
            element.appendChild(this._webviewFindWidget.getDomNode());
        }
        for (const eventName of [EventType.MOUSE_DOWN, EventType.MOUSE_MOVE, EventType.DROP]) {
            this._register(addDisposableListener(element, eventName, () => {
                this._stopBlockingIframeDragEvents();
            }));
        }
        for (const node of [element, targetWindow]) {
            this._register(addDisposableListener(node, EventType.DRAG_END, () => {
                this._stopBlockingIframeDragEvents();
            }));
        }
        element.id = this.id; // This is used by aria-flow for accessibility order
        this.perfMark('mounted');
        element.appendChild(this.element);
    }
    _registerMessageHandler(targetWindow) {
        const subscription = this._register(addDisposableListener(targetWindow, 'message', (e) => {
            if (!this._encodedWebviewOrigin || e?.data?.target !== this.id) {
                return;
            }
            if (e.origin !== this._webviewContentOrigin(this._encodedWebviewOrigin)) {
                console.log(`Skipped renderer receiving message due to mismatched origins: ${e.origin} ${this._webviewContentOrigin}`);
                return;
            }
            if (e.data.channel === 'webview-ready') {
                if (this._messagePort) {
                    return;
                }
                this.perfMark('webview-ready');
                this._logService.trace(`Webview(${this.id}): webview ready`);
                this._messagePort = e.ports[0];
                this._messagePort.onmessage = (e) => {
                    const handlers = this._messageHandlers.get(e.data.channel);
                    if (!handlers) {
                        console.log(`No handlers found for '${e.data.channel}'`);
                        return;
                    }
                    handlers?.forEach(handler => handler(e.data.data, e));
                };
                this.element?.classList.add('ready');
                if (this._state.type === 0 /* WebviewState.Type.Initializing */) {
                    this._state.pendingMessages.forEach(({ channel, data, resolve }) => resolve(this.doPostMessage(channel, data)));
                }
                this._state = WebviewState.Ready;
                subscription.dispose();
            }
        }));
    }
    perfMark(name) {
        performance.mark(`webview/webviewElement/${name}`, {
            detail: {
                id: this.id
            }
        });
    }
    _startBlockingIframeDragEvents() {
        if (this.element) {
            this.element.style.pointerEvents = 'none';
        }
    }
    _stopBlockingIframeDragEvents() {
        if (this.element) {
            this.element.style.pointerEvents = 'auto';
        }
    }
    webviewContentEndpoint(encodedWebviewOrigin) {
        const webviewExternalEndpoint = this._environmentService.webviewExternalEndpoint;
        if (!webviewExternalEndpoint) {
            throw new Error(`'webviewExternalEndpoint' has not been configured. Webviews will not work!`);
        }
        const endpoint = webviewExternalEndpoint.replace('{{uuid}}', encodedWebviewOrigin);
        if (endpoint[endpoint.length - 1] === '/') {
            return endpoint.slice(0, endpoint.length - 1);
        }
        return endpoint;
    }
    _webviewContentOrigin(encodedWebviewOrigin) {
        const uri = URI.parse(this.webviewContentEndpoint(encodedWebviewOrigin));
        return uri.scheme + '://' + uri.authority.toLowerCase();
    }
    doPostMessage(channel, data, transferable = []) {
        if (this.element && this._messagePort) {
            this._messagePort.postMessage({ channel, args: data }, transferable);
            return true;
        }
        return false;
    }
    on(channel, handler) {
        let handlers = this._messageHandlers.get(channel);
        if (!handlers) {
            handlers = new Set();
            this._messageHandlers.set(channel, handlers);
        }
        handlers.add(handler);
        return toDisposable(() => {
            this._messageHandlers.get(channel)?.delete(handler);
        });
    }
    handleNoCspFound() {
        if (this._hasAlertedAboutMissingCsp) {
            return;
        }
        this._hasAlertedAboutMissingCsp = true;
        if (this.extension?.id) {
            if (this._environmentService.isExtensionDevelopment) {
                this._onMissingCsp.fire(this.extension.id);
            }
        }
    }
    reload() {
        this.doUpdateContent(this._content);
    }
    reinitializeAfterDismount() {
        this._state = new WebviewState.Initializing([]);
        this._messagePort = undefined;
        this.mountTo(this.element.parentElement, getWindow(this.element));
        this.style();
        this.reload();
    }
    setHtml(html) {
        this.doUpdateContent({ ...this._content, html });
        this._onDidHtmlChange.fire(html);
    }
    setTitle(title) {
        this._content = { ...this._content, title };
        this._send('set-title', title);
    }
    set contentOptions(options) {
        this._logService.debug(`Webview(${this.id}): will update content options`);
        if (areWebviewContentOptionsEqual(options, this._content.options)) {
            this._logService.debug(`Webview(${this.id}): skipping content options update`);
            return;
        }
        this.doUpdateContent({ ...this._content, options });
    }
    set localResourcesRoot(resources) {
        this._content = {
            ...this._content,
            options: { ...this._content.options, localResourceRoots: resources }
        };
    }
    set state(state) {
        this._content = { ...this._content, state };
    }
    set initialScrollProgress(value) {
        this._send('initial-scroll-position', value);
    }
    doUpdateContent(newContent) {
        this._logService.debug(`Webview(${this.id}): will update content`);
        this._content = newContent;
        const allowScripts = !!this._content.options.allowScripts;
        this.perfMark('set-content');
        this._send('content', {
            contents: this._content.html,
            title: this._content.title,
            options: {
                allowMultipleAPIAcquire: !!this._content.options.allowMultipleAPIAcquire,
                allowScripts: allowScripts,
                allowForms: this._content.options.allowForms ?? allowScripts, // For back compat, we allow forms by default when scripts are enabled
            },
            state: this._content.state,
            cspSource: webviewGenericCspSource,
            confirmBeforeClose: this._confirmBeforeClose,
        });
    }
    style() {
        let { styles, activeTheme, themeLabel, themeId } = this.webviewThemeDataProvider.getWebviewThemeData();
        if (this._options.transformCssVariables) {
            styles = this._options.transformCssVariables(styles);
        }
        const reduceMotion = this._accessibilityService.isMotionReduced();
        const screenReader = this._accessibilityService.isScreenReaderOptimized();
        this._send('styles', { styles, activeTheme, themeId, themeLabel, reduceMotion, screenReader });
    }
    handleFocusChange(isFocused) {
        this._focused = isFocused;
        if (isFocused) {
            this._onDidFocus.fire();
        }
        else {
            this._onDidBlur.fire();
        }
    }
    handleKeyEvent(type, event) {
        // Create a fake KeyboardEvent from the data provided
        const emulatedKeyboardEvent = new KeyboardEvent(type, event);
        // Force override the target
        Object.defineProperty(emulatedKeyboardEvent, 'target', {
            get: () => this.element,
        });
        // And re-dispatch
        this.window?.dispatchEvent(emulatedKeyboardEvent);
    }
    handleDragEvent(type, event) {
        // Create a fake DragEvent from the data provided
        const emulatedDragEvent = new DragEvent(type, event);
        // Force override the target
        Object.defineProperty(emulatedDragEvent, 'target', {
            get: () => this.element,
        });
        // And re-dispatch
        this.window?.dispatchEvent(emulatedDragEvent);
    }
    windowDidDragStart() {
        // Webview break drag and dropping around the main window (no events are generated when you are over them)
        // Work around this by disabling pointer events during the drag.
        // https://github.com/electron/electron/issues/18226
        this._startBlockingIframeDragEvents();
    }
    windowDidDragEnd() {
        this._stopBlockingIframeDragEvents();
    }
    selectAll() {
        this.execCommand('selectAll');
    }
    copy() {
        this.execCommand('copy');
    }
    paste() {
        this.execCommand('paste');
    }
    cut() {
        this.execCommand('cut');
    }
    undo() {
        this.execCommand('undo');
    }
    redo() {
        this.execCommand('redo');
    }
    execCommand(command) {
        if (this.element) {
            this._send('execCommand', command);
        }
    }
    async loadResource(id, uri, ifNoneMatch) {
        try {
            const result = await loadLocalResource(uri, {
                ifNoneMatch,
                roots: this._content.options.localResourceRoots || [],
            }, this._uriIdentityService, this._fileService, this._logService, this._resourceLoadingCts.token);
            switch (result.type) {
                case WebviewResourceResponse.Type.Success: {
                    const buffer = await this.streamToBuffer(result.stream);
                    return this._send('did-load-resource', {
                        id,
                        status: 200,
                        path: uri.path,
                        mime: result.mimeType,
                        data: buffer,
                        etag: result.etag,
                        mtime: result.mtime
                    }, [buffer]);
                }
                case WebviewResourceResponse.Type.NotModified: {
                    return this._send('did-load-resource', {
                        id,
                        status: 304, // not modified
                        path: uri.path,
                        mime: result.mimeType,
                        mtime: result.mtime
                    });
                }
                case WebviewResourceResponse.Type.AccessDenied: {
                    return this._send('did-load-resource', {
                        id,
                        status: 401, // unauthorized
                        path: uri.path,
                    });
                }
            }
        }
        catch {
            // noop
        }
        return this._send('did-load-resource', {
            id,
            status: 404,
            path: uri.path,
        });
    }
    async streamToBuffer(stream) {
        const vsBuffer = await streamToBuffer(stream);
        return vsBuffer.buffer.buffer;
    }
    async localLocalhost(id, origin) {
        const authority = this._environmentService.remoteAuthority;
        const resolveAuthority = authority ? await this._remoteAuthorityResolverService.resolveAuthority(authority) : undefined;
        const redirect = resolveAuthority ? await this._portMappingManager.getRedirect(resolveAuthority.authority, origin) : undefined;
        return this._send('did-load-localhost', {
            id,
            origin,
            location: redirect
        });
    }
    focus() {
        this._doFocus();
        // Handle focus change programmatically (do not rely on event from <webview>)
        this.handleFocusChange(true);
    }
    _doFocus() {
        if (!this.element) {
            return;
        }
        try {
            this.element.contentWindow?.focus();
        }
        catch {
            // noop
        }
        // Workaround for https://github.com/microsoft/vscode/issues/75209
        // Focusing the inner webview is async so for a sequence of actions such as:
        //
        // 1. Open webview
        // 1. Show quick pick from command palette
        //
        // We end up focusing the webview after showing the quick pick, which causes
        // the quick pick to instantly dismiss.
        //
        // Workaround this by debouncing the focus and making sure we are not focused on an input
        // when we try to re-focus.
        this._focusDelayer.trigger(async () => {
            if (!this.isFocused || !this.element) {
                return;
            }
            if (this.window?.document.activeElement && this.window.document.activeElement !== this.element && this.window.document.activeElement?.tagName !== 'BODY') {
                return;
            }
            // It is possible for the webview to be contained in another window
            // that does not have focus. As such, also focus the body of the
            // webview's window to ensure it is properly receiving keyboard focus.
            this.window?.document.body?.focus();
            this._send('focus', undefined);
        });
    }
    /**
     * Webviews expose a stateful find API.
     * Successive calls to find will move forward or backward through onFindResults
     * depending on the supplied options.
     *
     * @param value The string to search for. Empty strings are ignored.
     */
    find(value, previous) {
        if (!this.element) {
            return;
        }
        this._send('find', { value, previous });
    }
    updateFind(value) {
        if (!value || !this.element) {
            return;
        }
        this._send('find', { value });
    }
    stopFind(keepSelection) {
        if (!this.element) {
            return;
        }
        this._send('find-stop', { clearSelection: !keepSelection });
        this._onDidStopFind.fire();
    }
    showFind(animated = true) {
        this._webviewFindWidget?.reveal(undefined, animated);
    }
    hideFind(animated = true) {
        this._webviewFindWidget?.hide(animated);
    }
    runFindAction(previous) {
        this._webviewFindWidget?.find(previous);
    }
};
WebviewElement = __decorate([
    __param(2, IConfigurationService),
    __param(3, IContextMenuService),
    __param(4, INotificationService),
    __param(5, IWorkbenchEnvironmentService),
    __param(6, IFileService),
    __param(7, ILogService),
    __param(8, IRemoteAuthorityResolverService),
    __param(9, ITunnelService),
    __param(10, IInstantiationService),
    __param(11, IAccessibilityService),
    __param(12, IUriIdentityService)
], WebviewElement);
export { WebviewElement };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2Vidmlld0VsZW1lbnQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi93ZWJ2aWV3L2Jyb3dzZXIvd2Vidmlld0VsZW1lbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLGFBQWEsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzdHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBR3RFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzFGLE9BQU8sRUFBRSxjQUFjLEVBQTBCLE1BQU0sbUNBQW1DLENBQUM7QUFDM0YsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDbEYsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsVUFBVSxFQUFlLFlBQVksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzdGLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUN6RCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDeEUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFF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