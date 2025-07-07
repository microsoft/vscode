/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMarkerService, IMarkerData, type IMarker } from '../../../platform/markers/common/markers.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { MainThreadDiagnosticsShape, MainContext, ExtHostDiagnosticsShape, ExtHostContext } from '../common/extHost.protocol.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { IUriIdentityService } from '../../../platform/uriIdentity/common/uriIdentity.js';
import { ResourceMap } from '../../../base/common/map.js';

@extHostNamedCustomer(MainContext.MainThreadDiagnostics)
export class MainThreadDiagnostics implements MainThreadDiagnosticsShape {

	private readonly _activeOwners = new Set<string>();

	private readonly _proxy: ExtHostDiagnosticsShape;
	private readonly _markerListener: IDisposable;

	private static ExtHostCounter: number = 1;
	private readonly extHostId: string;

	constructor(
		extHostContext: IExtHostContext,
		@IMarkerService private readonly _markerService: IMarkerService,
		@IUriIdentityService private readonly _uriIdentService: IUriIdentityService,
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostDiagnostics);

		this._markerListener = this._markerService.onMarkerChanged(this._forwardMarkers, this);
		this.extHostId = `extHost${MainThreadDiagnostics.ExtHostCounter++}`;
	}

	dispose(): void {
		this._markerListener.dispose();
		for (const owner of this._activeOwners) {
			const markersData: ResourceMap<IMarker[]> = new ResourceMap<IMarker[]>();
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

	private _forwardMarkers(resources: readonly URI[]): void {
		const data: [UriComponents, IMarkerData[]][] = [];
		for (const resource of resources) {
			const allMarkerData = this._markerService.read({ resource, ignoreResourceFilters: true });
			if (allMarkerData.length === 0) {
				data.push([resource, []]);
			} else {
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

	$changeMany(owner: string, entries: [UriComponents, IMarkerData[]][]): void {
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

	$clear(owner: string): void {
		this._markerService.changeAll(owner, []);
		this._activeOwners.delete(owner);
	}
}
