/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as Map from 'vs/base/common/map';
import Severity from 'vs/base/common/severity';
import URI from 'vs/base/common/uri';
import { IMarker, MarkerStatistics } from 'vs/platform/markers/common/markers';

export class Resource {
	constructor(public uri: URI, public markers: Marker[], public statistics: MarkerStatistics){};
}

export class Marker {
	constructor(public id:string, public marker: IMarker){};
}

export class MarkersModel {

	private markersByResource: Map.SimpleMap<URI, IMarker[]>;

	constructor(markers: IMarker[]= []) {
		this.markersByResource= new Map.SimpleMap<URI, IMarker[]>();
		this.updateMarkers(markers);
	}

	public getResources():Resource[] {
		var resources= <Resource[]>this.markersByResource.entries().map(this.toResource.bind(this));
		resources.sort((a: Resource, b: Resource) => {
			let compare= this.compare(a.statistics, b.statistics);
			if (compare !== 0) {
				return compare;
			}
			return a.uri.toString().localeCompare(b.uri.toString());
		});
		return resources;
	}

	public updateResource(resourceUri: URI, markers: IMarker[]) {
		if (this.markersByResource.has(resourceUri)) {
			this.markersByResource.delete(resourceUri);
		}
		if (markers.length > 0) {
			this.markersByResource.set(resourceUri, markers);
		}
	}

	public updateMarkers(markers: IMarker[]) {
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

	private toResource(entry: Map.Entry<URI, IMarker[]>) {
		let markers= entry.value.map(this.toMarker);
		let resource= new Resource(entry.key, markers, this.getStatistics(entry.value));
		return resource;
	}

	private toMarker(marker: IMarker, index: number):Marker {
		return new Marker(marker.resource.toString() + index, marker);
	}

	private compare(stat1: MarkerStatistics, stat2: MarkerStatistics): number {
		if (stat1.errors > stat2.errors) {
			return -1;
		}
		if (stat2.errors > stat1.errors) {
			return 1;
		}
		if (stat1.warnings > stat2.warnings) {
			return -1;
		}
		if (stat2.warnings > stat1.warnings) {
			return 1;
		}
		if (stat1.infos > stat2.infos) {
			return -1;
		}
		if (stat2.infos > stat1.infos) {
			return 1;
		}
		if (stat1.unknwons > stat2.unknwons) {
			return -1;
		}
		if (stat2.unknwons > stat1.unknwons) {
			return 1;
		}
		return 0;
	}

	private getStatistics(markers: IMarker[]): MarkerStatistics {
		let errors= 0, warnings= 0, infos= 0, unknowns = 0;
		markers.forEach((marker) => {
			switch (marker.severity) {
				case Severity.Error:
					errors++;
					return;
				case Severity.Warning:
					warnings++;
					return;
				case Severity.Info:
					infos++;
					return;
				default:
					unknowns++;
					return;
			}
		});
		return {errors: errors, warnings: warnings, infos: infos, unknwons: unknowns};
	}
}