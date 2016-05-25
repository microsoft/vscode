/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { IMarker } from 'vs/platform/markers/common/markers';

export class Resource {
	constructor(public uri:URI, public markers:Marker[]){};
}

export class Marker {
	constructor(public id:string, public marker: IMarker){};
}

export function toModel(markers: IMarker[]) {
	let markersByResource: { [uri: string]: IMarker[] }= Object.create(null);
	markers.forEach((marker:IMarker) => {
		let uri:string= marker.resource.path;
		let markers:IMarker[]= markersByResource[uri];
		if (!markers) {
			markers= [];
			markersByResource[uri]= markers;
		}
		markers.push(marker);
	});
	let resources:Resource[]= [];
	for (let uri in markersByResource) {
		let markers = markersByResource[uri].map((marker:IMarker, index:number) => {
			return new Marker(uri.toString() + index, marker);
		});
		let resource= new Resource(URI.file(uri), markers);
		resources.push(resource);
	}
	resources.sort((a: Resource, b: Resource):number => {
		return a.markers.length > b.markers.length ? -1 : 1;
	});
	return {resources: resources};
};