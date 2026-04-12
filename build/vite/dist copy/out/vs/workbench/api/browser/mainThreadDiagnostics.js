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
var MainThreadDiagnostics_1;
import { IMarkerService } from '../../../platform/markers/common/markers.js';
import { URI } from '../../../base/common/uri.js';
import { MainContext, ExtHostContext } from '../common/extHost.protocol.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { IUriIdentityService } from '../../../platform/uriIdentity/common/uriIdentity.js';
import { ResourceMap } from '../../../base/common/map.js';
let MainThreadDiagnostics = class MainThreadDiagnostics {
    static { MainThreadDiagnostics_1 = this; }
    static { this.ExtHostCounter = 1; }
    constructor(extHostContext, _markerService, _uriIdentService) {
        this._markerService = _markerService;
        this._uriIdentService = _uriIdentService;
        this._activeOwners = new Set();
        this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostDiagnostics);
        this._markerListener = this._markerService.onMarkerChanged(this._forwardMarkers, this);
        this.extHostId = `extHost${MainThreadDiagnostics_1.ExtHostCounter++}`;
    }
    dispose() {
        this._markerListener.dispose();
        for (const owner of this._activeOwners) {
            const markersData = new ResourceMap();
            for (const marker of this._markerService.read({ owner })) {
                let data = markersData.get(marker.resource);
                if (data === undefined) {
                    data = [];
                    markersData.set(marker.resource, data);
                }
                if (marker.origin !== this.extHostId) {
                    data.push(marker);
                }
            }
            for (const [resource, local] of markersData.entries()) {
                this._markerService.changeOne(owner, resource, local);
            }
        }
        this._activeOwners.clear();
    }
    _forwardMarkers(resources) {
        const data = [];
        for (const resource of resources) {
            const allMarkerData = this._markerService.read({ resource, ignoreResourceFilters: true });
            if (allMarkerData.length === 0) {
                data.push([resource, []]);
            }
            else {
                const foreignMarkerData = allMarkerData.filter(marker => marker?.origin !== this.extHostId);
                if (foreignMarkerData.length > 0) {
                    data.push([resource, foreignMarkerData]);
                }
            }
        }
        if (data.length > 0) {
            this._proxy.$acceptMarkersChange(data);
        }
    }
    $changeMany(owner, entries) {
        for (const entry of entries) {
            const [uri, markers] = entry;
            if (markers) {
                for (const marker of markers) {
                    if (marker.relatedInformation) {
                        for (const relatedInformation of marker.relatedInformation) {
                            relatedInformation.resource = URI.revive(relatedInformation.resource);
                        }
                    }
                    if (marker.code && typeof marker.code !== 'string') {
                        marker.code.target = URI.revive(marker.code.target);
                    }
                    if (marker.origin === undefined) {
                        marker.origin = this.extHostId;
                    }
                }
            }
            this._markerService.changeOne(owner, this._uriIdentService.asCanonicalUri(URI.revive(uri)), markers);
        }
        this._activeOwners.add(owner);
    }
    $clear(owner) {
        this._markerService.changeAll(owner, []);
        this._activeOwners.delete(owner);
    }
};
MainThreadDiagnostics = MainThreadDiagnostics_1 = __decorate([
    extHostNamedCustomer(MainContext.MainThreadDiagnostics),
    __param(1, IMarkerService),
    __param(2, IUriIdentityService)
], MainThreadDiagnostics);
export { MainThreadDiagnostics };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZERpYWdub3N0aWNzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9icm93c2VyL21haW5UaHJlYWREaWFnbm9zdGljcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGNBQWMsRUFBNkIsTUFBTSw2Q0FBNkMsQ0FBQztBQUN4RyxPQUFPLEVBQUUsR0FBRyxFQUFpQixNQUFNLDZCQUE2QixDQUFDO0FBQ2pFLE9BQU8sRUFBOEIsV0FBVyxFQUEyQixjQUFjLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUNqSSxPQUFPLEVBQUUsb0JBQW9CLEVBQW1CLE1BQU0sc0RBQXNELENBQUM7QUFFN0csT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFDMUYsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBR25ELElBQU0scUJBQXFCLEdBQTNCLE1BQU0scUJBQXFCOzthQU9sQixtQkFBYyxHQUFXLENBQUMsQUFBWixDQUFhO0lBRzFDLFlBQ0MsY0FBK0IsRUFDZixjQUErQyxFQUMxQyxnQkFBc0Q7UUFEMUMsbUJBQWMsR0FBZCxjQUFjLENBQWdCO1FBQ3pCLHFCQUFnQixHQUFoQixnQkFBZ0IsQ0FBcUI7UUFYM0Qsa0JBQWEsR0FBRyxJQUFJLEdBQUcsRUFBVSxDQUFDO1FBYWxELElBQUksQ0FBQyxNQUFNLEdBQUcsY0FBYyxDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsa0JBQWtCLENBQUMsQ0FBQztRQUV6RSxJQUFJLENBQUMsZUFBZSxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxlQUFlLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDdkYsSUFBSSxDQUFDLFNBQVMsR0FBRyxVQUFVLHVCQUFxQixD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