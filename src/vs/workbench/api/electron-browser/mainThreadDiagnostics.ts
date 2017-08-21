/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IMarkerService, IMarkerData } from 'vs/platform/markers/common/markers';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
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

	$changeMany(owner: string, entries: [URI, IMarkerData[]][]): TPromise<any> {
		for (let entry of entries) {
			let [uri, markers] = entry;
			this._markerService.changeOne(owner, uri, markers);
		}
		this._activeOwners.add(owner);
		return undefined;
	}

	$clear(owner: string): TPromise<any> {
		this._markerService.changeAll(owner, undefined);
		this._activeOwners.delete(owner);
		return undefined;
	}
}
