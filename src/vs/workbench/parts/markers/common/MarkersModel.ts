/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as Map from 'vs/base/common/map';
import Severity from 'vs/base/common/severity';
import URI from 'vs/base/common/uri';
import { IMarker, MarkerStatistics } from 'vs/platform/markers/common/markers';
import Messages from 'vs/workbench/parts/markers/common/Messages';

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

	public static getStatisticsLabel(marketStatistics: MarkerStatistics):string {
		let label= this.getLabel('',  marketStatistics.errors, 'markers.panel.single.error.label', 'markers.panel.multiple.errors.label');
		label= this.getLabel(label,  marketStatistics.warnings, 'markers.panel.single.warning.label', 'markers.panel.multiple.warnings.label');
		label= this.getLabel(label,  marketStatistics.infos, 'markers.panel.single.info.label', 'markers.panel.multiple.infos.label');
		label= this.getLabel(label,  marketStatistics.unknwons, 'markers.panel.single.unknown.label', 'markers.panel.multiple.unknowns.label');
		return label;
	}

	private static getLabel(title: string, markersCount: number, singleMarkerKey: string, multipleMarkerKey: string): string {
		if (markersCount <= 0) {
			return title;
		}
		title= title ? title + ', ' : '';
		title += Messages.getString(markersCount === 1 ? singleMarkerKey : multipleMarkerKey, ''+markersCount);
		return title;
	}

	private toResource(entry: Map.Entry<URI, IMarker[]>) {
		let markers= entry.value.map(this.toMarker);
		let resource= new Resource(entry.key, markers, this.getStatistics(entry.value));
		return resource;
	}

	private toMarker(marker: IMarker, index: number):Marker {
		return new Marker(marker.resource.toString() + index, marker);
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