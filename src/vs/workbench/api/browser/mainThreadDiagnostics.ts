/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMarkerService, IMarkerData } from 'vs/platform/markers/common/markers';
import { URI, UriComponents } from 'vs/base/common/uri';
import { MainThreadDiagnosticsShape, MainContext, ExtHostDiagnosticsShape, ExtHostContext } from '../common/extHost.protocol';
import { extHostNamedCustomer, IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';

@extHostNamedCustomer(MainContext.MainThreadDiagnostics)
export class MainThreadDiagnostics implements MainThreadDiagnosticsShape {

	private readonly _activeOwners = new Set<string>();

	private readonly _proxy: ExtHostDiagnosticsShape;
	private readonly _markerListener: IDisposable;

	constructor(
		extHostContext: IExtHostContext,
		@IMarkerService private readonly _markerService: IMarkerService,
		@IUriIdentityService private readonly _uriIdentService: IUriIdentityService,
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostDiagnostics);

		this._markerListener = this._markerService.onMarkerChanged(this._forwardMarkers, this);
	}

	dispose(): void {
		this._markerListener.dispose();
		this._activeOwners.forEach(owner => this._markerService.changeAll(owner, []));
		this._activeOwners.clear();
	}

	private _forwardMarkers(resources: readonly URI[]): void {
		const data: [UriComponents, IMarkerData[]][] = [];
		for (const resource of resources) {
			const allMarkerData = this._markerService.read({ resource });
			if (allMarkerData.length === 0) {
				data.push([resource, []]);
			} else {
				const forgeinMarkerData = allMarkerData.filter(marker => !this._activeOwners.has(marker.owner));
				if (forgeinMarkerData.length > 0) {
					data.push([resource, forgeinMarkerData]);
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
