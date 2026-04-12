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
import { getWindowById, isHTMLElement } from '../../../../base/browser/dom.js';
import { FastDomNode } from '../../../../base/browser/fastDomNode.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, observableValue } from '../../../../base/common/observable.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IWebviewService, KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_ENABLED, KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_VISIBLE } from './webview.js';
/**
 * Webview that is absolutely positioned over another element and that can creates and destroys an underlying webview as needed.
 */
let OverlayWebview = class OverlayWebview extends Disposable {
    get window() { return getWindowById(this._windowId, true).window; }
    constructor(initInfo, _layoutService, _webviewService, _baseContextKeyService, _editorGroupsService) {
        super();
        this._layoutService = _layoutService;
        this._webviewService = _webviewService;
        this._baseContextKeyService = _baseContextKeyService;
        this._editorGroupsService = _editorGroupsService;
        this._isFirstLoad = true;
        this._firstLoadPendingMessages = new Set();
        this._webview = this._register(new MutableDisposable());
        this._webviewEvents = this._register(new DisposableStore());
        this._html = '';
        this._initialScrollProgress = 0;
        this._state = undefined;
        this._owner = undefined;
        this._windowId = undefined;
        this._scopedContextKeyService = this._register(new MutableDisposable());
        this._shouldShowFindWidgetOnRestore = false;
        this._isDisposed = false;
        this._onDidDispose = this._register(new Emitter());
        this.onDidDispose = this._onDidDispose.event;
        this._onDidFocus = this._register(new Emitter());
        this.onDidFocus = this._onDidFocus.event;
        this._onDidBlur = this._register(new Emitter());
        this.onDidBlur = this._onDidBlur.event;
        this._onDidClickLink = this._register(new Emitter());
        this.onDidClickLink = this._onDidClickLink.event;
        this._onDidScroll = this._register(new Emitter());
        this.onDidScroll = this._onDidScroll.event;
        this._onDidUpdateState = this._register(new Emitter());
        this.onDidUpdateState = this._onDidUpdateState.event;
        this._onMessage = this._register(new Emitter());
        this.onMessage = this._onMessage.event;
        this._onMissingCsp = this._register(new Emitter());
        this.onMissingCsp = this._onMissingCsp.event;
        this._onDidWheel = this._register(new Emitter());
        this.onDidWheel = this._onDidWheel.event;
        this._onFatalError = this._register(new Emitter());
        this.onFatalError = this._onFatalError.event;
        this.intrinsicContentSize = observableValue('WebviewIntrinsicContentSize', undefined);
        this.providedViewType = initInfo.providedViewType;
        this.origin = initInfo.origin ?? generateUuid();
        this._title = initInfo.title;
        this._extension = initInfo.extension;
        this._options = initInfo.options;
        this._contentOptions = initInfo.contentOptions;
    }
    get isFocused() {
        return !!this._webview.value?.isFocused;
    }
    dispose() {
        this._isDisposed = true;
        this._container?.domNode.remove();
        this._container = undefined;
        for (const msg of this._firstLoadPendingMessages) {
            msg.resolve(false);
        }
        this._firstLoadPendingMessages.clear();
        this._onDidDispose.fire();
        super.dispose();
    }
    get container() {
        if (this._isDisposed) {
            throw new Error(`OverlayWebview has been disposed`);
        }
        if (!this._container) {
            const node = document.createElement('div');
            node.style.position = 'absolute';
            node.style.overflow = 'hidden';
            this._container = new FastDomNode(node);
            this._container.setVisibility('hidden');
            // Webviews cannot be reparented in the dom as it will destroy their contents.
            // Mount them to a high level node to avoid this depending on the active container.
            const modalEditorContainer = this._editorGroupsService.activeModalEditorPart?.modalElement;
            let root;
            if (isHTMLElement(modalEditorContainer)) {
                root = modalEditorContainer;
            }
            else {
                root = this._layoutService.getContainer(this.window);
            }
            root.appendChild(node);
        }
        return this._container.domNode;
    }
    claim(owner, targetWindow, scopedContextKeyService) {
        if (this._isDisposed) {
            return;
        }
        const oldOwner = this._owner;
        if (this._windowId !== targetWindow.vscodeWindowId) {
            // moving to a new window
            this.release(oldOwner);
            // since we are moving to a new window, we need to dispose the webview and recreate
            this._webview.clear();
            this._webviewEvents.clear();
            this._container?.domNode.remove();
            this._container = undefined;
        }
        this._owner = owner;
        this._windowId = targetWindow.vscodeWindowId;
        this._show(targetWindow);
        if (oldOwner !== owner) {
            const contextKeyService = (scopedContextKeyService || this._baseContextKeyService);
            // Explicitly clear before creating the new context.
            // Otherwise we create the new context while the old one is still around
            this._scopedContextKeyService.clear();
            this._scopedContextKeyService.value = contextKeyService.createScoped(this.container);
            const wasFindVisible = this._findWidgetVisible?.get();
            this._findWidgetVisible?.reset();
            this._findWidgetVisible = KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_VISIBLE.bindTo(contextKeyService);
            this._findWidgetVisible.set(!!wasFindVisible);
            this._findWidgetEnabled?.reset();
            this._findWidgetEnabled = KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_ENABLED.bindTo(contextKeyService);
            this._findWidgetEnabled.set(!!this.options.enableFindWidget);
            this._webview.value?.setContextKeyService(this._scopedContextKeyService.value);
        }
    }
    release(owner) {
        if (this._owner !== owner) {
            return;
        }
        this._scopedContextKeyService.clear();
        this._owner = undefined;
        if (this._container) {
            this._container.setVisibility('hidden');
        }
        if (this._options.retainContextWhenHidden) {
            // https://github.com/microsoft/vscode/issues/157424
            // We need to record the current state when retaining context so we can try to showFind() when showing webview again
            this._shouldShowFindWidgetOnRestore = !!this._findWidgetVisible?.get();
            this.hideFind(false);
        }
        else {
            this._webview.clear();
            this._webviewEvents.clear();
        }
    }
    layoutWebviewOverElement(element, dimension, clippingContainer) {
        if (!this._container || !this._container.domNode.parentElement) {
            return;
        }
        const whenContainerStylesLoaded = this._layoutService.whenContainerStylesLoaded(this.window);
        if (whenContainerStylesLoaded) {
            // In floating windows, we need to ensure that the
            // container is ready for us to compute certain
            // layout related properties.
            whenContainerStylesLoaded.then(() => this.doLayoutWebviewOverElement(element, dimension, clippingContainer));
        }
        else {
            this.doLayoutWebviewOverElement(element, dimension, clippingContainer);
        }
    }
    doLayoutWebviewOverElement(element, dimension, clippingContainer) {
        if (!this._container || !this._container.domNode.parentElement) {
            return;
        }
        const frameRect = element.getBoundingClientRect();
        const containerRect = this._container.domNode.parentElement.getBoundingClientRect();
        const parentBorderTop = (containerRect.height - this._container.domNode.parentElement.clientHeight) / 2.0;
        const parentBorderLeft = (containerRect.width - this._container.domNode.parentElement.clientWidth) / 2.0;
        this._container.setTop(frameRect.top - containerRect.top - parentBorderTop);
        this._container.setLeft(frameRect.left - containerRect.left - parentBorderLeft);
        this._container.setWidth(dimension ? dimension.width : frameRect.width);
        this._container.setHeight(dimension ? dimension.height : frameRect.height);
        if (clippingContainer) {
            const { top, left, right, bottom } = computeClippingRect(frameRect, clippingContainer);
            this._container.domNode.style.clipPath = `polygon(${left}px ${top}px, ${right}px ${top}px, ${right}px ${bottom}px, ${left}px ${bottom}px)`;
        }
    }
    _show(targetWindow) {
        if (this._isDisposed) {
            throw new Error('OverlayWebview is disposed');
        }
        if (!this._webview.value) {
            const webview = this._webviewService.createWebviewElement({
                providedViewType: this.providedViewType,
                origin: this.origin,
                title: this._title,
                options: this._options,
                contentOptions: this._contentOptions,
                extension: this.extension,
            });
            this._webview.value = webview;
            webview.state = this._state;
            if (this._scopedContextKeyService.value) {
                this._webview.value.setContextKeyService(this._scopedContextKeyService.value);
            }
            if (this._html) {
                webview.setHtml(this._html);
            }
            if (this._options.tryRestoreScrollPosition) {
                webview.initialScrollProgress = this._initialScrollProgress;
            }
            this._findWidgetEnabled?.set(!!this.options.enableFindWidget);
            webview.mountTo(this.container, targetWindow);
            // Forward events from inner webview to outer listeners
            this._webviewEvents.clear();
            this._webviewEvents.add(webview.onDidFocus(() => { this._onDidFocus.fire(); }));
            this._webviewEvents.add(webview.onDidBlur(() => { this._onDidBlur.fire(); }));
            this._webviewEvents.add(webview.onDidClickLink(x => { this._onDidClickLink.fire(x); }));
            this._webviewEvents.add(webview.onMessage(x => { this._onMessage.fire(x); }));
            this._webviewEvents.add(webview.onMissingCsp(x => { this._onMissingCsp.fire(x); }));
            this._webviewEvents.add(webview.onDidWheel(x => { this._onDidWheel.fire(x); }));
            this._webviewEvents.add(webview.onFatalError(x => { this._onFatalError.fire(x); }));
            this._webviewEvents.add(autorun(reader => {
                this.intrinsicContentSize.set(reader.readObservable(webview.intrinsicContentSize), undefined, undefined);
            }));
            this._webviewEvents.add(webview.onDidScroll(x => {
                this._initialScrollProgress = x.scrollYPercentage;
                this._onDidScroll.fire(x);
            }));
            this._webviewEvents.add(webview.onDidUpdateState(state => {
                this._state = state;
                this._onDidUpdateState.fire(state);
            }));
            if (this._isFirstLoad) {
                this._firstLoadPendingMessages.forEach(async (msg) => {
                    msg.resolve(await webview.postMessage(msg.message, msg.transfer));
                });
            }
            this._isFirstLoad = false;
            this._firstLoadPendingMessages.clear();
        }
        // https://github.com/microsoft/vscode/issues/157424
        if (this.options.retainContextWhenHidden && this._shouldShowFindWidgetOnRestore) {
            this.showFind(false);
            // Reset
            this._shouldShowFindWidgetOnRestore = false;
        }
        this._container?.setVisibility('visible');
    }
    setHtml(html) {
        this._html = html;
        this._withWebview(webview => webview.setHtml(html));
    }
    setTitle(title) {
        this._title = title;
        this._withWebview(webview => webview.setTitle(title));
    }
    get initialScrollProgress() { return this._initialScrollProgress; }
    set initialScrollProgress(value) {
        this._initialScrollProgress = value;
        this._withWebview(webview => webview.initialScrollProgress = value);
    }
    get state() { return this._state; }
    set state(value) {
        this._state = value;
        this._withWebview(webview => webview.state = value);
    }
    get extension() { return this._extension; }
    set extension(value) {
        this._extension = value;
        this._withWebview(webview => webview.extension = value);
    }
    get options() { return this._options; }
    set options(value) { this._options = { customClasses: this._options.customClasses, ...value }; }
    get contentOptions() { return this._contentOptions; }
    set contentOptions(value) {
        this._contentOptions = value;
        this._withWebview(webview => webview.contentOptions = value);
    }
    set localResourcesRoot(resources) {
        this._withWebview(webview => webview.localResourcesRoot = resources);
    }
    async postMessage(message, transfer) {
        if (this._webview.value) {
            return this._webview.value.postMessage(message, transfer);
        }
        if (this._isFirstLoad) {
            let resolve;
            const p = new Promise(r => resolve = r);
            this._firstLoadPendingMessages.add({ message, transfer, resolve: resolve });
            return p;
        }
        return false;
    }
    focus() { this._webview.value?.focus(); }
    reload() { this._webview.value?.reload(); }
    selectAll() { this._webview.value?.selectAll(); }
    copy() { this._webview.value?.copy(); }
    paste() { this._webview.value?.paste(); }
    cut() { this._webview.value?.cut(); }
    undo() { this._webview.value?.undo(); }
    redo() { this._webview.value?.redo(); }
    showFind(animated = true) {
        if (this._webview.value) {
            this._webview.value.showFind(animated);
            this._findWidgetVisible?.set(true);
        }
    }
    hideFind(animated = true) {
        this._findWidgetVisible?.reset();
        this._webview.value?.hideFind(animated);
    }
    runFindAction(previous) { this._webview.value?.runFindAction(previous); }
    _withWebview(f) {
        if (this._webview.value) {
            f(this._webview.value);
        }
    }
    windowDidDragStart() {
        this._webview.value?.windowDidDragStart();
    }
    windowDidDragEnd() {
        this._webview.value?.windowDidDragEnd();
    }
    setContextKeyService(contextKeyService) {
        this._webview.value?.setContextKeyService(contextKeyService);
    }
};
OverlayWebview = __decorate([
    __param(1, IWorkbenchLayoutService),
    __param(2, IWebviewService),
    __param(3, IContextKeyService),
    __param(4, IEditorGroupsService)
], OverlayWebview);
export { OverlayWebview };
function computeClippingRect(frameRect, clipper) {
    const rootRect = clipper.getBoundingClientRect();
    const top = Math.max(rootRect.top - frameRect.top, 0);
    const right = Math.max(frameRect.width - (frameRect.right - rootRect.right), 0);
    const bottom = Math.max(frameRect.height - (frameRect.bottom - rootRect.bottom), 0);
    const left = Math.max(rootRect.left - frameRect.left, 0);
    return { top, right, bottom, left };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3ZlcmxheVdlYnZpZXcuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi93ZWJ2aWV3L2Jyb3dzZXIvb3ZlcmxheVdlYnZpZXcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFhLGFBQWEsRUFBRSxhQUFhLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMxRixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFHdEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDdEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUVqRixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDL0QsT0FBTyxFQUFlLGtCQUFrQixFQUE0QixNQUFNLHNEQUFzRCxDQUFDO0FBRWpJLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQzVGLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQzlGLE9BQU8sRUFBOEMsZUFBZSxFQUFFLDhDQUE4QyxFQUFFLDhDQUE4QyxFQUFvSCxNQUFNLGNBQWMsQ0FBQztBQUU3Uzs7R0FFRztBQUNJLElBQU0sY0FBYyxHQUFwQixNQUFNLGNBQWUsU0FBUSxVQUFVO0lBbUI3QyxJQUFZLE1BQU0sS0FBSyxPQUFPLGFBQWEsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7SUFhM0UsWUFDQyxRQUF5QixFQUNBLGNBQXdELEVBQ2hFLGVBQWlELEVB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