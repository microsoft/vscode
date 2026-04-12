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
import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { Emitter } from '../../../base/common/event.js';
import { IViewDescriptorService } from '../../common/views.js';
/**
 * Tracks the number of visible view containers at a given location.
 * A view container is considered visible if it has active views (activeViewDescriptors.length > 0).
 * Fires an event when the number of visible containers changes.
 */
let VisibleViewContainersTracker = class VisibleViewContainersTracker extends Disposable {
    constructor(location, viewDescriptorService) {
        super();
        this.location = location;
        this.viewDescriptorService = viewDescriptorService;
        this.viewContainerModelListeners = this._register(new DisposableMap());
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this._visibleCount = 0;
        this.registerListeners();
        this.initializeViewContainerListeners();
        this.updateVisibleCount();
    }
    /**
     * Returns the current number of visible view containers at this location.
     */
    get visibleCount() {
        return this._visibleCount;
    }
    registerListeners() {
        // Track view container additions/removals
        this._register(this.viewDescriptorService.onDidChangeViewContainers(({ added, removed }) => {
            // Add listeners for new view containers
            for (const { container, location } of added) {
                if (location === this.location) {
                    this.addViewContainerModelListener(container.id);
                }
            }
            // Remove listeners for removed view containers
            for (const { container, location } of removed) {
                if (location === this.location) {
                    this.viewContainerModelListeners.deleteAndDispose(container.id);
                }
            }
            const relevantChange = [...added, ...removed].some(({ location }) => location === this.location);
            if (relevantChange) {
                this.updateVisibleCount();
            }
        }));
        // Track container location changes
        this._register(this.viewDescriptorService.onDidChangeContainerLocation(({ viewContainer, from, to }) => {
            // Update listeners when container moves
            if (from === this.location) {
                this.viewContainerModelListeners.deleteAndDispose(viewContainer.id);
            }
            if (to === this.location) {
                this.addViewContainerModelListener(viewContainer.id);
            }
            if (from === this.location || to === this.location) {
                this.updateVisibleCount();
            }
        }));
    }
    initializeViewContainerListeners() {
        // Initialize listeners for existing view containers
        for (const container of this.viewDescriptorService.getViewContainersByLocation(this.location)) {
            this.addViewContainerModelListener(container.id);
        }
    }
    addViewContainerModelListener(containerId) {
        const container = this.viewDescriptorService.getViewContainerById(containerId);
        if (container) {
            const model = this.viewDescriptorService.getViewContainerModel(container);
            const listener = model.onDidChangeActiveViewDescriptors(() => this.updateVisibleCount());
            this.viewContainerModelListeners.set(containerId, listener);
        }
    }
    updateVisibleCount() {
        const viewContainers = this.viewDescriptorService.getViewContainersByLocation(this.location);
        const visibleViewContainers = viewContainers.filter(container => this.viewDescriptorService.getViewContainerModel(container).activeViewDescriptors.length > 0);
        const newCount = visibleViewContainers.length;
        if (this._visibleCount !== newCount) {
            const before = this._visibleCount;
            this._visibleCount = newCount;
            this._onDidChange.fire({ before, after: newCount });
        }
    }
};
VisibleViewContainersTracker = __decorate([
    __param(1, IViewDescriptorService)
], VisibleViewContainersTracker);
export { VisibleViewContainersTracker };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlzaWJsZVZpZXdDb250YWluZXJzVHJhY2tlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL3Zpc2libGVWaWV3Q29udGFpbmVyc1RyYWNrZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxhQUFhLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sK0JBQStCLENBQUM7QUFDL0QsT0FBTyxFQUFFLHNCQUFzQixFQUF5QixNQUFNLHVCQUF1QixDQUFDO0FBRXRGOzs7O0dBSUc7QUFDSSxJQUFNLDRCQUE0QixHQUFsQyxNQUFNLDRCQUE2QixTQUFRLFVBQVU7SUFTM0QsWUFDa0IsUUFBK0IsRUFDeEIscUJBQThEO1FBRXRGLEtBQUssRUFBRSxDQUFDO1FBSFMsYUFBUSxHQUFSLFFBQVEsQ0FBdUI7UUFDUCwwQkFBcUIsR0FBckIscUJBQXFCLENBQXdCO1FBVHRFLGdDQUEyQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxhQUFhLEVBQVUsQ0FBQyxDQUFDO1FBRTFFLGlCQUFZLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBcUMsQ0FBQyxDQUFDO1FBQ3hGLGdCQUFXLEdBQTZDLElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDO1FBRWpGLGtCQUFhLEdBQVcsQ0FBQyxDQUFDO1FBUWpDLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1FBQ3pCLElBQUksQ0FBQyxnQ0FBZ0MsRUFBRSxDQUFDO1FBQ3hDLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO0lBQzNCLENBQUM7SUFFRDs7T0FFRztJQUNILElBQUksWUFBWTtRQUNmLE9BQU8sSUFBSSxDQUFDLGFBQWEs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