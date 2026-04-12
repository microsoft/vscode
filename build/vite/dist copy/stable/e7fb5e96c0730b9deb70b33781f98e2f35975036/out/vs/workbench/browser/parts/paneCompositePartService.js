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
import { Event } from '../../../base/common/event.js';
import { assertReturnsDefined } from '../../../base/common/types.js';
import { registerSingleton } from '../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { AuxiliaryBarPart } from './auxiliarybar/auxiliaryBarPart.js';
import { PanelPart } from './panel/panelPart.js';
import { SidebarPart } from './sidebar/sidebarPart.js';
import { IPaneCompositePartService } from '../../services/panecomposite/browser/panecomposite.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
let PaneCompositePartService = class PaneCompositePartService extends Disposable {
    constructor(instantiationService) {
        super();
        this.paneCompositeParts = new Map();
        const panelPart = instantiationService.createInstance(PanelPart);
        const sideBarPart = instantiationService.createInstance(SidebarPart);
        const auxiliaryBarPart = instantiationService.createInstance(AuxiliaryBarPart);
        this.paneCompositeParts.set(1 /* ViewContainerLocation.Panel */, panelPart);
        this.paneCompositeParts.set(0 /* ViewContainerLocation.Sidebar */, sideBarPart);
        this.paneCompositeParts.set(2 /* ViewContainerLocation.AuxiliaryBar */, auxiliaryBarPart);
        const viewContainerLocations = [0 /* ViewContainerLocation.Sidebar */, 1 /* ViewContainerLocation.Panel */, 2 /* ViewContainerLocation.AuxiliaryBar */];
        const eventDisposables = this._register(new DisposableStore());
        this.onDidPaneCompositeOpen = Event.any(...viewContainerLocations.map(loc => Event.map(this.paneCompositeParts.get(loc).onDidPaneCompositeOpen, composite => { return { composite, viewContainerLocation: loc }; }, eventDisposables)));
        this.onDidPaneCompositeClose = Event.any(...viewContainerLocations.map(loc => Event.map(this.paneCompositeParts.get(loc).onDidPaneCompositeClose, composite => { return { composite, viewContainerLocation: loc }; }, eventDisposables)));
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
PaneCompositePartService = __decorate([
    __param(0, IInstantiationService)
], PaneCompositePartService);
export { PaneCompositePartService };
registerSingleton(IPaneCompositePartService, PaneCompositePartService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2Jyb3dzZXIvcGFydHMvcGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN0RCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUNyRSxPQUFPLEVBQXFCLGlCQUFpQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDNUcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFHaEcsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDdEUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBQ2pELE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUd2RCxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUNsRyxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBSXpFLElBQU0sd0JBQXdCLEdBQTlCLE1BQU0sd0JBQXlCLFNBQVEsVUFBVTtJQVN2RCxZQUN3QixvQkFBMkM7UUFFbEUsS0FBSyxFQUFFLENBQUM7UUFMUSx1QkFBa0IsR0FBRyxJQUFJLEdBQUcsRUFBNkMsQ0FBQztRQU8xRixNQUFNLFNBQVMsR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDakUsTUFBTSxXQUFXLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQ3JFLE1BQU0sZ0JBQWdCLEdBQUcsb0JBQW9CLENB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