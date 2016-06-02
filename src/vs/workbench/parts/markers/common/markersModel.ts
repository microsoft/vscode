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
import Messages from 'vs/workbench/parts/markers/common/messages';

export class Resource {
	constructor(public uri: URI, public markers: Marker[], public statistics: MarkerStatistics){};
}

export class Marker {
	static _filter: IFilter = or(matchesPrefix, matchesContiguousSubString);
	constructor(public id:string, public marker: IMarker){};
}

export class MarkersModel {
	private markersByResource: Map.SimpleMap<URI, IMarker[]>;
	public filterErrors:boolean= false;
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
		let markers:Marker[]= entry.value.filter(this.filterMarker.bind(this)).map(this.toMarker);
		markers.sort(this.compareMarkers.bind(this));
		return markers.length > 0 ? new Resource(entry.key, markers, this.getStatistics(entry.value)) : null;
	}

	private toMarker(marker: IMarker, index: number):Marker {
		return new Marker(marker.resource.toString() + index, marker);
	}

	private compareMarkers(a: Marker, b:Marker): number {
		let result= this.compare(a.marker.startLineNumber, b.marker.startLineNumber);
		if (result !== 0) {
			return result;
		}

		result= this.compare(a.marker.startColumn, b.marker.startColumn);
		if (result !== 0) {
			return result;
		}

		result= this.compare(a.marker.endLineNumber, b.marker.endLineNumber);
		if (result !== 0) {
			return result;
		}

		result= this.compare(a.marker.endColumn, b.marker.endColumn);
		if (result !== 0) {
			return result;
		}

		return a.marker.message.localeCompare(b.marker.message);
	}

	private compare(a: number, b: number): number {
		return a < b ? -1
					: a > b ? 1
					: 0;
	}

	private filterMarker(marker: IMarker):boolean {
		if (this.filterErrors && Severity.Error !== marker.severity) {
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
		if (!title) {
			return Messages.MARKERS_PANEL_TITLE_NO_PROBLEMS;
		}
		if (this.filter) {
			return title + ' ' + Messages.MARKERS_PANEL_TITLE_SHOWING_FILTERED;
		}
		if (this.filterErrors) {
			return title + ' ' + Messages.MARKERS_PANEL_TITLE_SHOWING_ONLY_ERRORS;
		}
		return title;
	}

	public getMessage():string {
		if (this.hasFilteredResources()) {
			return '';
		}
		if (this.hasResources()) {
			if (this.filter) {
				return Messages.MARKERS_PANEL_NO_PROBLEMS_FILTERS;
			}
			if (this.filterErrors) {
				return Messages.MARKERS_PANEL_NO_ERRORS;
			}
		}
		return Messages.MARKERS_PANEL_NO_PROBLEMS_BUILT;
	}

	public static getStatisticsLabel(markerStatistics: MarkerStatistics, onlyErrors:boolean=false):string {
		let label= this.getLabel('',  markerStatistics.errors, Messages.MARKERS_PANEL_SINGLE_ERROR_LABEL, Messages.MARKERS_PANEL_MULTIPLE_ERRORS_LABEL);
		if (!onlyErrors) {
			label= this.getLabel(label,  markerStatistics.warnings, Messages.MARKERS_PANEL_SINGLE_WARNING_LABEL, Messages.MARKERS_PANEL_MULTIPLE_WARNINGS_LABEL);
			label= this.getLabel(label,  markerStatistics.infos, Messages.MARKERS_PANEL_SINGLE_INFO_LABEL, Messages.MARKERS_PANEL_MULTIPLE_INFOS_LABEL);
			label= this.getLabel(label,  markerStatistics.unknwons, Messages.MARKERS_PANEL_SINGLE_UNKNOWN_LABEL, Messages.MARKERS_PANEL_MULTIPLE_UNKNOWNS_LABEL);
		}
		return label;
	}

	private static getLabel(title: string, markersCount: number, singleMarkerString: string, multipleMarkersFunction: (markersCount:number)=>string): string {
		if (markersCount <= 0) {
			return title;
		}
		title= title ? title + ', ' : '';
		title += markersCount === 1 ? singleMarkerString : multipleMarkersFunction(markersCount);
		return title;
	}
}