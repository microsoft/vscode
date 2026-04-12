/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from '../../../../base/common/lifecycle.js';
import { MicrotaskEmitter } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { getDomNodePagePosition } from '../../../../base/browser/dom.js';
export var BrowserOverlayType;
(function (BrowserOverlayType) {
    BrowserOverlayType["Menu"] = "menu";
    BrowserOverlayType["QuickInput"] = "quickInput";
    BrowserOverlayType["Hover"] = "hover";
    BrowserOverlayType["Dialog"] = "dialog";
    BrowserOverlayType["Notification"] = "notification";
    BrowserOverlayType["Unknown"] = "unknown";
})(BrowserOverlayType || (BrowserOverlayType = {}));
const OVERLAY_DEFINITIONS = [
    { className: 'monaco-menu-container', type: BrowserOverlayType.Menu },
    { className: 'quick-input-widget', type: BrowserOverlayType.QuickInput },
    { className: 'monaco-hover', type: BrowserOverlayType.Hover },
    { className: 'editor-widget', type: BrowserOverlayType.Hover },
    { className: 'suggest-details-container', type: BrowserOverlayType.Hover },
    { className: 'monaco-dialog-modal-block', type: BrowserOverlayType.Dialog },
    { className: 'monaco-modal-editor-block', type: BrowserOverlayType.Dialog },
    { className: 'notifications-center', type: BrowserOverlayType.Notification },
    { className: 'notification-toast-container', type: BrowserOverlayType.Notification },
    // Context view is very generic, so treat the content as unknown
    { className: 'context-view', type: BrowserOverlayType.Unknown }
];
export const IBrowserOverlayManager = createDecorator('browserOverlayManager');
export class BrowserOverlayManager extends Disposable {
    constructor(targetWindow) {
        super();
        this.targetWindow = targetWindow;
        this._onDidChangeOverlayState = this._register(new MicrotaskEmitter({
            onWillAddFirstListener: () => {
                // Start observing the document for structural changes
                this._observerIsConnected = true;
                this._structuralObserver.observe(this.targetWindow.document.body, {
                    childList: true,
                    subtree: true
                });
                this.updateTrackedElements();
            },
            onDidRemoveLastListener: () => {
                // Stop observing when no listeners are present
                this._observerIsConnected = false;
                this._structuralObserver.disconnect();
                this.stopTrackingElements();
            },
            // Must be passed to prevent duplicate emits
            merge: () => { }
        }));
        this.onDidChangeOverlayState = this._onDidChangeOverlayState.event;
        this._overlayCollections = new Map();
        this._overlayRectangles = new WeakMap();
        this._elementObservers = new WeakMap();
        this._observerIsConnected = false;
        this._shadowRootObservers = new WeakMap();
        this._shadowRootOverlayCache = new WeakMap();
        // Initialize live collections for each overlay selector in main document
        for (const overlayDefinition of OVERLAY_DEFINITIONS) {
            this._overlayCollections.set(overlayDefinition.className, {
                type: overlayDefinition.type,
                // We need dynamic collections for overlay detection, using getElementsByClassName is intentional here
                // eslint-disable-next-line no-restricted-syntax
                collection: this.targetWindow.document.getElementsByClassName(overlayDefinition.className)
            });
        }
        // Initialize live collection for shadow root hosts
        // We need dynamic collections for overlay detection, using getElementsByClassName is intentional here
        // eslint-disable-next-line no-restricted-syntax
        this._shadowRootHostCollection = this.targetWindow.document.getElementsByClassName('shadow-root-host');
        // Setup structural observer to watch for element additions/removals
        this._structuralObserver = new targetWindow.MutationObserver((mutations) => {
            let didRemove = false;
            for (const mutation of mutations) {
                for (const node of mutation.removedNodes) {
                    // Clean up element observers
                    if (this._elementObservers.has(node)) {
                        const observer = this._elementObservers.get(node);
                        observer?.disconnect();
                        this._elementObservers.delete(node);
                        didRemove = true;
                    }
                    if (this._overlayRectangles.delete(node)) {
                        didRemove = true;
                    }
                    // Clean up shadow root observers when shadow-root-host elements are removed
                    const hostElement = node;
                    if (hostElement.shadowRoot) {
                        const shadowRoot = hostElement.shadowRoot;
                        const observer = this._shadowRootObservers.get(shadowRoot);
                        if (observer) {
                            observer.disconnect();
                            this._shadowRootObservers.delete(shadowRoot);
                            this._shadowRootOverlayCache.delete(shadowRoot);
                            didRemove = true;
                        }
                    }
                }
            }
            this.updateTrackedElements(didRemove);
        });
    }
    *overlays() {
        // Yield overlays from main document live collections
        for (const entry of this._overlayCollections.values()) {
            for (const element of entry.collection) {
                yield { element: element, type: entry.type };
            }
        }
        // Yield overlays from shadow roots
        for (const hostElement of this._shadowRootHostCollection) {
            const shadowRoot = hostElement.shadowRoot;
            if (shadowRoot) {
                let cache = this._shadowRootOverlayCache.get(shadowRoot);
                if (!cache) {
                    // Rebuild cache
                    cache = [];
                    for (const overlayDefinition of OVERLAY_DEFINITIONS) {
                        // We need to query shadow roots for overlay detection, using querySelectorAll is intentional here
                        // eslint-disable-next-line no-restricted-syntax
                        const elements = shadowRoot.querySelectorAll(`.${overlayDefinition.className}`);
                        for (const element of elements) {
                            cache.push({ element: element, type: overlayDefinition.type });
                        }
                    }
                    this._shadowRootOverlayCache.set(shadowRoot, cache);
                }
                yield* cache;
            }
        }
    }
    updateTrackedElements(shouldEmit = false) {
        // Track shadow roots using live collection
        for (const host of this._shadowRootHostCollection) {
            const hostElement = host;
            const shadowRoot = hostElement.shadowRoot;
            if (shadowRoot && !this._shadowRootObservers.has(shadowRoot)) {
                // Create observer for this shadow root
                const observer = new this.targetWindow.MutationObserver(() => {
                    // Clear element cache when shadow root structure changes
                    this._shadowRootOverlayCache.delete(shadowRoot);
                    this._onDidChangeOverlayState.fire();
                });
                observer.observe(shadowRoot, {
                    childList: true,
                    subtree: true
                });
                this._shadowRootObservers.set(shadowRoot, observer);
                shouldEmit = true;
            }
        }
        // Scan all overlay collections for elements and ensure they have observers
        for (const overlay of this.overlays()) {
            // Create a new observer for this specific element if we don't already have one
            if (!this._elementObservers.has(overlay.element)) {
                const observer = new this.targetWindow.MutationObserver(() => {
                    this._overlayRectangles.delete(overlay.element);
                    this._onDidChangeOverlayState.fire();
                });
                // Store the observer in the WeakMap
                this._elementObservers.set(overlay.element, observer);
                // Start observing this element
                observer.observe(overlay.element, {
                    attributes: true,
                    attributeFilter: ['style', 'class'],
                    childList: true,
                    subtree: true
                });
                shouldEmit = true;
            }
        }
        if (shouldEmit) {
            this._onDidChangeOverlayState.fire();
        }
    }
    getRect(element) {
        if (!this._overlayRectangles.has(element)) {
            const rect = getDomNodePagePosition(element);
            // If the observer is not connected (no listeners), do not cache rectangles as we won't know when they change.
            if (!this._observerIsConnected) {
                return rect;
            }
            this._overlayRectangles.set(element, rect);
        }
        return this._overlayRectangles.get(element);
    }
    getOverlappingOverlays(element) {
        const elementRect = getDomNodePagePosition(element);
        const overlappingOverlays = [];
        // Check against all precomputed overlay rectangles
        for (const overlay of this.overlays()) {
            // Skip overlays that are ancestors of the target element,
            // e.g., the modal editor backdrop when the browser is inside the modal
            if (overlay.element.contains(element)) {
                continue;
            }
            const overlayRect = this.getRect(overlay.element);
            if (overlayRect && this.isRectanglesOverlapping(elementRect, overlayRect)) {
                overlappingOverlays.push({
                    type: overlay.type,
                    rect: overlayRect
                });
            }
        }
        return overlappingOverlays;
    }
    isRectanglesOverlapping(rect1, rect2) {
        // If elements are offscreen or set to zero size, consider them non-overlapping
        if (rect1.width === 0 || rect1.height === 0 || rect2.width === 0 || rect2.height === 0) {
            return false;
        }
        return !(rect1.left + rect1.width <= rect2.left ||
            rect2.left + rect2.width <= rect1.left ||
            rect1.top + rect1.height <= rect2.top ||
            rect2.top + rect2.height <= rect1.top);
    }
    stopTrackingElements() {
        // Disconnect all element observers
        for (const overlay of this.overlays()) {
            const observer = this._elementObservers.get(overlay.element);
            observer?.disconnect();
        }
        // Disconnect all shadow root observers
        for (const hostElement of this._shadowRootHostCollection) {
            const shadowRoot = hostElement.shadowRoot;
            const shadowObserver = this._shadowRootObservers.get(shadowRoot);
            shadowObserver?.disconnect();
        }
        this._shadowRootObservers = new WeakMap();
        this._shadowRootOverlayCache = new WeakMap();
        this._overlayRectangles = new WeakMap();
        this._elementObservers = new WeakMap();
    }
    dispose() {
        this._observerIsConnected = false;
        this._structuralObserver.disconnect();
        this.stopTrackingElements();
        super.dispose();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3ZlcmxheU1hbmFnZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9icm93c2VyVmlldy9lbGVjdHJvbi1icm93c2VyL292ZXJsYXlNYW5hZ2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQVMsZ0JBQWdCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMzRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDN0YsT0FBTyxFQUFFLHNCQUFzQixFQUF3QixNQUFNLGlDQUFpQyxDQUFDO0FBRy9GLE1BQU0sQ0FBTixJQUFZLGtCQU9YO0FBUEQsV0FBWSxrQkFBa0I7SUFDN0IsbUNBQWEsQ0FBQTtJQUNiLCtDQUF5QixDQUFBO0lBQ3pCLHFDQUFlLENBQUE7SUFDZix1Q0FBaUIsQ0FBQTtJQUNqQixtREFBNkIsQ0FBQTtJQUM3Qix5Q0FBbUIsQ0FBQTtBQUNwQixDQUFDLEVBUFcsa0JBQWtCLEtBQWxCLGtCQUFrQixRQU83QjtBQUVELE1BQU0sbUJBQW1CLEdBQW1FO0lBQzNGLEVBQUUsU0FBUyxFQUFFLHVCQUF1QixFQUFFLElBQUksRUFBRSxrQkFBa0IsQ0FBQyxJQUFJLEVBQUU7SUFDckUsRUFBRSxTQUFTLEVBQUUsb0JBQW9CLEVBQUUsSUFBSSxFQUFFLGtCQUFrQixDQUFDLFVBQVUsRUFBRTtJQUN4RSxFQUFFLFNBQVMsRUFBRSxjQUFjLEVBQUUsSUFBSSxFQUFFLGtCQUFrQixDQUFDLEtBQUssRUFBRTtJQUM3RCxFQUFFLFNBQVMsRUFBRSxlQUFlLEVBQUUsSUFBSSxFQUFFLGtCQUFrQixDQUFDLEtBQUssRUFBRTtJQUM5RCxFQUFFLFNBQVMsRUFBRSwyQkFBMkIsRUFBRSxJQUFJLEVB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