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
import { Emitter } from '../../base/common/event.js';
import { assertReturnsDefined } from '../../base/common/types.js';
import { IInstantiationService } from '../../platform/instantiation/common/instantiation.js';
import { IPaneCompositePartService } from '../../workbench/services/panecomposite/browser/panecomposite.js';
import { Disposable } from '../../base/common/lifecycle.js';
import { PanelPart } from './parts/panelPart.js';
import { SidebarPart } from './parts/sidebarPart.js';
import { AuxiliaryBarPart } from './parts/auxiliaryBarPart.js';
import { ChatBarPart } from './parts/chatBarPart.js';
import { registerSingleton } from '../../platform/instantiation/common/extensions.js';
let AgenticPaneCompositePartService = class AgenticPaneCompositePartService extends Disposable {
    constructor(instantiationService) {
        super();
        this._onDidPaneCompositeOpen = this._register(new Emitter());
        this.onDidPaneCompositeOpen = this._onDidPaneCompositeOpen.event;
        this._onDidPaneCompositeClose = this._register(new Emitter());
        this.onDidPaneCompositeClose = this._onDidPaneCompositeClose.event;
        this.paneCompositeParts = new Map();
        this.registerPart(1 /* ViewContainerLocation.Panel */, instantiationService.createInstance(PanelPart));
        this.registerPart(0 /* ViewContainerLocation.Sidebar */, instantiationService.createInstance(SidebarPart));
        this.registerPart(2 /* ViewContainerLocation.AuxiliaryBar */, instantiationService.createInstance(AuxiliaryBarPart));
        this.registerPart(3 /* ViewContainerLocation.ChatBar */, instantiationService.createInstance(ChatBarPart));
    }
    registerPart(location, part) {
        this.paneCompositeParts.set(location, part);
        this._register(part.onDidPaneCompositeOpen(composite => this._onDidPaneCompositeOpen.fire({ composite, viewContainerLocation: location })));
        this._register(part.onDidPaneCompositeClose(composite => this._onDidPaneCompositeClose.fire({ composite, viewContainerLocation: location })));
    }
    getRegistryId(viewContainerLocation) {
        return this.getPartByLocation(viewContainerLocation).registryId;
    }
    getPartId(viewContainerLocation) {
        return this.getPartByLocation(viewContainerLocation).partId;
    }
    openPaneComposite(id, viewContainerLocation, focus) {
        return this.getPartByLocation(viewContainerLocation).openPaneComposite(id, focus);
    }
    getActivePaneComposite(viewContainerLocation) {
        return this.getPartByLocation(viewContainerLocation).getActivePaneComposite();
    }
    getPaneComposite(id, viewContainerLocation) {
        return this.getPartByLocation(viewContainerLocation).getPaneComposite(id);
    }
    getPaneComposites(viewContainerLocation) {
        return this.getPartByLocation(viewContainerLocation).getPaneComposites();
    }
    getPinnedPaneCompositeIds(viewContainerLocation) {
        return this.getPartByLocation(viewContainerLocation).getPinnedPaneCompositeIds();
    }
    getVisiblePaneCompositeIds(viewContainerLocation) {
        return this.getPartByLocation(viewContainerLocation).getVisiblePaneCompositeIds();
    }
    getPaneCompositeIds(viewContainerLocation) {
        return this.getPartByLocation(viewContainerLocation).getPaneCompositeIds();
    }
    getProgressIndicator(id, viewContainerLocation) {
        return this.getPartByLocation(viewContainerLocation).getProgressIndicator(id);
    }
    hideActivePaneComposite(viewContainerLocation) {
        this.getPartByLocation(viewContainerLocation).hideActivePaneComposite();
    }
    getLastActivePaneCompositeId(viewContainerLocation) {
        return this.getPartByLocation(viewContainerLocation).getLastActivePaneCompositeId();
    }
    getPartByLocation(viewContainerLocation) {
        return assertReturnsDefined(this.paneCompositeParts.get(viewContainerLocation));
    }
};
AgenticPaneCompositePartService = __decorate([
    __param(0, IInstantiationService)
], AgenticPaneCompositePartService);
export { AgenticPaneCompositePartService };
registerSingleton(IPaneCompositePartService, AgenticPaneCompositePartService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2Vzc2lvbnMvYnJvd3Nlci9wYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQ3JELE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQ2xFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBSTdGLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLGlFQUFpRSxDQUFDO0FBQzVHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUk1RCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFDakQsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQ3JELE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQy9ELE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUNyRCxPQUFPLEVBQXFCLGlCQUFpQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFFbEcsSUFBTSwrQkFBK0IsR0FBckMsTUFBTSwrQkFBZ0MsU0FBUSxVQUFVO0lBWTlELFlBQ3dCLG9CQUEyQztRQUVsRSxLQUFLLEVBQUUsQ0FBQztRQVhRLDRCQUF1QixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQStFLENBQUMsQ0FBQztRQUM3SSwyQkFBc0IsR0FBRyxJQUFJLENBQUMsdUJBQXVCLENBQUMsS0FBSyxDQUFDO1FBRXBELDZCQUF3QixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFP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