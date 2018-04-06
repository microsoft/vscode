/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IMarkerService, IMarkerData } from 'vs/platform/markers/common/markers';
import URI, { UriComponents } from 'vs/base/common/uri';
import { MainThreadDiagnosticsShape, MainContext, IExtHostContext } from '../node/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';

@extHostNamedCustomer(MainContext.MainThreadDiagnostics)
export class MainThreadDiagnostics implements MainThreadDiagnosticsShape {

	private readonly _activeOwners = new Set<string>();
	private readonly _markerService: IMarkerService;

	constructor(
		extHostContext: IExtHostContext,
		@IMarkerService markerService: IMarkerService
	) {
		this._markerService = markerService;
	}

	dispose(): void {
		this._activeOwners.forEach(owner => this._markerService.changeAll(owner, undefined));
	}

	$changeMany(owner: string, entries: [UriComponents, IMarkerData[]][]): void {
		for (let entry of entries) {
			let [uri, markers] = entry;
			if (markers) {
				for (const marker of markers) {
					if (marker.relatedInformation) {
						for (const relatedInformation of marker.relatedInformation) {
							relatedInformation.resource = URI.revive(relatedInformation.resource);
						}
					}
				}
			}
			this._markerService.changeOne(owner, URI.revive(uri), markers);
		}
		this._activeOwners.add(owner);
	}

	$clear(owner: string): void {
		this._markerService.changeAll(owner, undefined);
		this._activeOwners.delete(owner);
	}
}
