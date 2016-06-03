/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as strings from 'vs/base/common/strings';
import * as paths from 'vs/base/common/paths';
import * as Map from 'vs/base/common/map';
import Severity from 'vs/base/common/severity';
import URI from 'vs/base/common/uri';
import { Range } from 'vs/editor/common/core/range';
import { IMarker, MarkerStatistics } from 'vs/platform/markers/common/markers';
import {IFilter, or, matchesContiguousSubString, matchesPrefix} from 'vs/base/common/filters';
import Messages from 'vs/workbench/parts/markers/common/messages';

export class Resource {
	public name: string;
	public path: string;
	constructor(public uri: URI, public markers: Marker[], public statistics: MarkerStatistics){
		this.path= uri.fsPath;
		this.name= paths.basename(uri.fsPath);
	}
}

export class Marker {
	static _filter: IFilter = or(matchesPrefix, matchesContiguousSubString);
	constructor(public id:string, public marker: IMarker){}
}

export class FilterOptions {
	public filterErrors: boolean= false;
	public filterWarnings: boolean= false;
	public filterInfos: boolean= false;
	public filterValue: string= '';
	public completeValue: string= '';

	public hasActiveFilters():boolean {
		return this.filterErrors || this.filterWarnings || this.filterInfos || !!this.filterValue;
	}
}

export class MarkersModel {

	private markersByResource: Map.SimpleMap<URI, IMarker[]>;

	private _filteredResources:Resource[];
	private _nonFilteredResources:Resource[];
	private _filterOptions:FilterOptions;

	constructor(markers: IMarker[]= []) {
		this.markersByResource= new Map.SimpleMap<URI, IMarker[]>();
		this._filterOptions= new FilterOptions();
		this.update(markers);
	}

	public get filterOptions(): FilterOptions {
		return this._filterOptions;
	}

	public get filteredResources(): Resource[] {
		return this._filteredResources;
	}

	public hasFilteredResources(): boolean {
		return this.filteredResources.length > 0;
	}

	public hasResources(): boolean {
		return this.markersByResource.size > 0;
	}

	public hasResource(resource:URI): boolean {
		return this.markersByResource.has(resource);
	}

	public get nonFilteredResources(): Resource[] {
		return this._nonFilteredResources;
	}

	public update(filterOptions: FilterOptions);
	public update(resourceUri: URI, markers: IMarker[]);
	public update(markers: IMarker[]);
	public update(arg1?: any, arg2?: any) {
		if (arg1 instanceof FilterOptions) {
			this._filterOptions= arg1;
		}

		if (arg1 instanceof URI) {
			this.updateResource(arg1, arg2);
		}

		if (arg1 instanceof Array) {
			this.updateMarkers(arg1);
		}

		this.refresh();
	}

	private refresh(): void {
		this.refreshResources();
	}

	private refreshResources(): void {
		var resources= <Resource[]>this.markersByResource.entries().map(this.toFilteredResource.bind(this));
		this._nonFilteredResources= resources.filter((resource) => {return resource.markers.length === 0;});
		this._filteredResources= resources.filter((resource) => {return resource.markers.length > 0;});
		this._filteredResources.sort((a: Resource, b: Resource) => {
			if (a.statistics.errors === 0 && b.statistics.errors > 0) {
				return 1;
			}
			if (b.statistics.errors === 0 && a.statistics.errors > 0) {
				return -1;
			}
			return strings.localeCompare(a.path, b.path) || strings.localeCompare(a.name, b.name);
		});
	}

	private updateResource(resourceUri: URI, markers: IMarker[]) {
		if (this.markersByResource.has(resourceUri)) {
			this.markersByResource.delete(resourceUri);
		}
		if (markers.length > 0) {
			this.markersByResource.set(resourceUri, markers);
		}
	}

	private updateMarkers(markers: IMarker[]) {
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

	private toFilteredResource(entry: Map.Entry<URI, IMarker[]>) {
		let markers:Marker[]= entry.value.filter(this.filterMarker.bind(this)).map(this.toMarker);
		markers.sort(this.compareMarkers.bind(this));
		return new Resource(entry.key, markers, this.getStatistics(entry.value));
	}

	private toMarker(marker: IMarker, index: number):Marker {
		return new Marker(marker.resource.toString() + index, marker);
	}

	private filterMarker(marker: IMarker):boolean {
		if (this._filterOptions.filterErrors && Severity.Error !== marker.severity) {
			return false;
		}
		if (this._filterOptions.filterWarnings && Severity.Warning !== marker.severity) {
			return false;
		}
		if (this._filterOptions.filterInfos && Severity.Info !== marker.severity) {
			return false;
		}
		if (this._filterOptions.filterValue) {
			const labelHighlights = Marker._filter(this._filterOptions.filterValue, marker.message);
			const descHighlights = Marker._filter(this._filterOptions.filterValue, marker.resource.toString());
			return !!labelHighlights || !!descHighlights;
		}
		return true;
	}

	private compareMarkers(a: Marker, b:Marker): number {
		return Range.compareRangesUsingStarts({
			startLineNumber: a.marker.startLineNumber,
			startColumn: a.marker.startColumn,
			endLineNumber: a.marker.endLineNumber,
			endColumn: a.marker.endColumn
		}, {
			startLineNumber: b.marker.startLineNumber,
			startColumn: b.marker.startColumn,
			endLineNumber: b.marker.endLineNumber,
			endColumn: b.marker.endColumn
		});
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
		return title ? title : Messages.MARKERS_PANEL_TITLE_NO_PROBLEMS;
	}

	public getMessage():string {
		if (this.hasFilteredResources()) {
			return '';
		}
		if (this.hasResources()) {
			if (this._filterOptions.hasActiveFilters()) {
				return Messages.MARKERS_PANEL_NO_PROBLEMS_FILTERS;
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