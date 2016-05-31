/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as Map from 'vs/base/common/map';
import Severity from 'vs/base/common/severity';
import URI from 'vs/base/common/uri';
import { IMarker, MarkerStatistics } from 'vs/platform/markers/common/markers';
import {IFilter, or, matchesContiguousSubString, matchesPrefix} from 'vs/base/common/filters';
import Messages from 'vs/workbench/parts/markers/common/Messages';

export class Resource {
	constructor(public uri: URI, public markers: Marker[], public statistics: MarkerStatistics){};
}

export class Marker {
	static _filter: IFilter = or(matchesPrefix, matchesContiguousSubString);
	constructor(public id:string, public marker: IMarker){};
}

export class MarkersModel {

	private markersByResource: Map.SimpleMap<URI, IMarker[]>;
	public showOnlyErrors:boolean= false;
	public filter:string= '';

	constructor(markers: IMarker[]= []) {
		this.markersByResource= new Map.SimpleMap<URI, IMarker[]>();
		this.updateMarkers(markers);
	}

	public getFilteredResources():Resource[] {
		var resources= <Resource[]>this.markersByResource.entries().map(this.toResource.bind(this));
		resources= resources.filter((resource) => {return !!resource;});
		resources.sort((a: Resource, b: Resource) => {
			if (a.statistics.errors > 0 && b.statistics.errors > 0) {
				return a.uri.toString().localeCompare(b.uri.toString());
			}
			return a.statistics.errors > 0 ? -1 : 1;
		});
		return resources;
	}

	public hasFilteredResources(): boolean {
		return this.getFilteredResources().length > 0;
	}

	public hasResources(): boolean {
		return this.markersByResource.size > 0;
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
			let uri: URI = marker.resource;
			let markers: IMarker[] = this.markersByResource.get(uri);
			if (!markers) {
				markers = [];
				this.markersByResource.set(uri, markers);
			}
			markers.push(marker);
		});
	}

	private toResource(entry: Map.Entry<URI, IMarker[]>) {
		let markers= entry.value.filter(this.filterMarker.bind(this)).map(this.toMarker);
		return markers.length > 0 ? new Resource(entry.key, markers, this.getStatistics(entry.value)) : null;
	}

	private toMarker(marker: IMarker, index: number):Marker {
		return new Marker(marker.resource.toString() + index, marker);
	}

	private filterMarker(marker: IMarker):boolean {
		if (this.showOnlyErrors && Severity.Error !== marker.severity) {
			return false;
		}
		if (this.filter) {
			const labelHighlights = Marker._filter(this.filter, marker.message);
			const descHighlights = Marker._filter(this.filter, marker.resource.toString());
			return !!labelHighlights || !!descHighlights;
		}
		return true;
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

	public getTitle(markerStatistics: MarkerStatistics):string {
		let title= MarkersModel.getStatisticsLabel(markerStatistics);
		return title ? title : Messages.getString('markers.panel.no.problems');
	}

	public getMessage():string {
		if (this.hasFilteredResources()) {
			return '';
		}
		if (this.hasResources()) {
			if (this.filter) {
				return Messages.getString('markers.panel.no.problems.filters');
			}
			if (this.showOnlyErrors) {
				return Messages.getString('markers.panel.no.errors');
			}
		}
		return Messages.getString('markers.panel.no.problems.build');
	}

	public static getStatisticsLabel(markerStatistics: MarkerStatistics, onlyErrors:boolean=false):string {
		let label= this.getLabel('',  markerStatistics.errors, 'markers.panel.single.error.label', 'markers.panel.multiple.errors.label');
		if (!onlyErrors) {
			label= this.getLabel(label,  markerStatistics.warnings, 'markers.panel.single.warning.label', 'markers.panel.multiple.warnings.label');
			label= this.getLabel(label,  markerStatistics.infos, 'markers.panel.single.info.label', 'markers.panel.multiple.infos.label');
			label= this.getLabel(label,  markerStatistics.unknwons, 'markers.panel.single.unknown.label', 'markers.panel.multiple.unknowns.label');
		}
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
}