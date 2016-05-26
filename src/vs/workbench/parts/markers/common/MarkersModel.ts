/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as Map from 'vs/base/common/map';
import URI from 'vs/base/common/uri';
import { IMarker } from 'vs/platform/markers/common/markers';

export class Resource {
	constructor(public uri: URI, public markers: Marker[]){};
}

export class Marker {
	constructor(public id:string, public marker: IMarker){};
}

export class MarkersModel {

	private markersByResource: Map.SimpleMap<URI, IMarker[]>;

	constructor(private markers: IMarker[]= []) {
		this.markersByResource= new Map.SimpleMap<URI, IMarker[]>();
		this.process(markers);
	}

	public getResources():Resource[] {
		return this.markersByResource.entries().map((entry) => {
			return new Resource(entry.key, entry.value.map(this.toMarker));
		});
	}

	private process(markers: IMarker[]) {
		markers.forEach((marker:IMarker) => {
			let uri:URI= marker.resource;
			let markers:IMarker[]= this.markersByResource.get(uri);
			if (!markers) {
				markers= [];
				this.markersByResource.set(uri, markers);
			}
			markers.push(marker);
		});
	}

	private toMarker(marker: IMarker, index: number):Marker {
		return new Marker(marker.resource.toString() + index, marker);
	}
}