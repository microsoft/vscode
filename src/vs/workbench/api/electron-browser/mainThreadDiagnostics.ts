/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IMarkerService, IMarkerData } from 'vs/platform/markers/common/markers';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { MainThreadDiagnosticsShape } from '../node/extHost.protocol';

export class MainThreadDiagnostics extends MainThreadDiagnosticsShape {

	private _markerService: IMarkerService;

	constructor( @IMarkerService markerService: IMarkerService) {
		super();
		this._markerService = markerService;
	}

	$changeMany(owner: string, entries: [URI, IMarkerData[]][]): TPromise<any> {
		for (let entry of entries) {
			let [uri, markers] = entry;
			this._markerService.changeOne(owner, uri, markers);
		}
		return undefined;
	}

	$clear(owner: string): TPromise<any> {
		this._markerService.changeAll(owner, undefined);
		return undefined;
	}
}
