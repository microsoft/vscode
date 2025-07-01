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
import { IModelService } from '../../../editor/common/services/model.js';

@extHostNamedCustomer(MainContext.MainThreadDiagnostics)
export class MainThreadDiagnostics implements MainThreadDiagnosticsShape {

	private readonly _extHostMarkers = new Map<string, Set<string>>();

	private readonly _proxy: ExtHostDiagnosticsShape;
	private readonly _markerListener: IDisposable;

	constructor(
		extHostContext: IExtHostContext,
		@IMarkerService private readonly _markerService: IMarkerService,
		@IUriIdentityService private readonly _uriIdentService: IUriIdentityService,
		@IModelService private readonly _modelService: IModelService
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostDiagnostics);

		this._markerListener = this._markerService.onMarkerChanged(this._forwardMarkers, this);

		this._modelService.onModelRemoved((model) => {
			const uriStr = model.uri.toString();
			for (const [owner, resources] of this._extHostMarkers.entries()) {
				if (resources.has(uriStr)) {
					resources.delete(uriStr);
					if (resources.size === 0) {
						this._extHostMarkers.delete(owner);
					}
				}
			}
		});
	}

	dispose(): void {
		this._markerListener.dispose();
		for (const [owner, resources] of this._extHostMarkers.entries()) {
			for (const resource of resources) {
				this._markerService.changeOne(owner, URI.parse(resource), []);
			}
		}
		this._extHostMarkers.clear();
	}

	private _forwardMarkers(resources: readonly URI[]): void {
		const data: [UriComponents, IMarkerData[]][] = [];
		for (const resource of resources) {
			const allMarkerData = this._markerService.read({ resource, ignoreResourceFilters: true });
			if (allMarkerData.length === 0) {
				data.push([resource, []]);
			} else {
				const foreignMarkerData: IMarker[] = [];
				for (const marker of allMarkerData) {
					const extResources = this._extHostMarkers.get(marker.owner);
					if (extResources === undefined || !extResources.has(resource.toString())) {
						foreignMarkerData.push(marker);
					}
				}
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
		let resources = this._extHostMarkers.get(owner);
		if (resources === undefined) {
			resources = new Set<string>();
			this._extHostMarkers.set(owner, resources);
		}
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
			const canonicalUri = this._uriIdentService.asCanonicalUri(URI.revive(uri));
			this._markerService.changeOne(owner, canonicalUri, markers);
			resources.add(canonicalUri.toString());
		}
	}

	$clear(owner: string): void {
		this._markerService.changeAll(owner, []);
		this._extHostMarkers.delete(owner);
	}
}
