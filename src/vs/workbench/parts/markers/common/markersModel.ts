/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as strings from 'vs/base/common/strings';
import * as paths from 'vs/base/common/paths';
import * as types from 'vs/base/common/types';
import * as Map from 'vs/base/common/map';
import Severity from 'vs/base/common/severity';
import URI from 'vs/base/common/uri';
import { Range } from 'vs/editor/common/core/range';
import { IMarker, MarkerStatistics } from 'vs/platform/markers/common/markers';
import {IFilter, IMatch, or, matchesContiguousSubString, matchesPrefix, matchesFuzzy} from 'vs/base/common/filters';
import Messages from 'vs/workbench/parts/markers/common/messages';

export class Resource {
	public name: string;
	public path: string;
	constructor(public uri: URI, public markers: Marker[],
								public statistics: MarkerStatistics,
								public matches: IMatch[] = []){
		this.path= uri.fsPath;
		this.name= paths.basename(uri.fsPath);
	}
}

export class Marker {
	constructor(public id:string, public marker: IMarker,
								public labelMatches: IMatch[] = [],
								public sourceMatches: IMatch[] = []){}
}

export class FilterOptions {

	static _filter: IFilter = or(matchesPrefix, matchesContiguousSubString);
	static _fuzzyFilter: IFilter = or(matchesPrefix, matchesContiguousSubString, matchesFuzzy);

	private _filterErrors: boolean= false;
	private _filterWarnings: boolean= false;
	private _filterInfos: boolean= false;
	private _filter: string= '';
	private _completeFilter: string= '';

	constructor(filter:string='') {
		if (filter) {
			this.parse(filter);
		}
	}

	public get filterErrors(): boolean {
		return this._filterErrors;
	}

	public get filterWarnings(): boolean {
		return this._filterWarnings;
	}

	public get filterInfos(): boolean {
		return this._filterInfos;
	}

	public get filter(): string {
		return this._filter;
	}

	public get completeFilter(): string {
		return this._completeFilter;
	}

	public hasFilters():boolean {
		return !!this._filter;
	}

	private parse(filter: string) {
		this._completeFilter= filter;
		this._filter= filter.trim();
		this._filterErrors= this.matches(this._filter, Messages.MARKERS_PANEL_FILTER_ERRORS);
		this._filterWarnings= this.matches(this._filter, Messages.MARKERS_PANEL_FILTER_WARNINGS);
		this._filterInfos= this.matches(this._filter, Messages.MARKERS_PANEL_FILTER_INFOS);
	}

	private matches(prefix: string, word: string):boolean {
		let result= matchesPrefix(prefix, word);
		return result && result.length > 0;
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

		if (types.isArray(arg1)) {
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
		let markers:Marker[]= entry.value.filter(this.filterMarker.bind(this)).map((marker, index) => {
			return this.toMarker(marker, index);
		});
		markers.sort(this.compareMarkers.bind(this));
		const matches = FilterOptions._filter(this._filterOptions.filter, paths.basename(entry.key.fsPath));
		return new Resource(entry.key, markers, this.getStatistics(entry.value), matches || []);
	}

	private toMarker(marker: IMarker, index: number):Marker {
		const labelMatches = FilterOptions._fuzzyFilter(this._filterOptions.filter, marker.message);
		const sourceMatches = !!marker.source ? FilterOptions._filter(this._filterOptions.filter, marker.source) : [];
		return new Marker(marker.resource.toString() + index, marker, labelMatches || [], sourceMatches || []);
	}

	private filterMarker(marker: IMarker):boolean {
		if (this._filterOptions.filter) {
			if (this._filterOptions.filterErrors && Severity.Error === marker.severity) {
				return true;
			}
			if (this._filterOptions.filterWarnings && Severity.Warning === marker.severity) {
				return true;
			}
			if (this._filterOptions.filterInfos && Severity.Info === marker.severity) {
				return true;
			}
			if (!!FilterOptions._fuzzyFilter(this._filterOptions.filter, marker.message)) {
				return true;
			}
			if (!!FilterOptions._filter(this._filterOptions.filter, paths.basename(marker.resource.fsPath))) {
				return true;
			}
			if (!!marker.source && !!FilterOptions._filter(this._filterOptions.filter, marker.source)) {
				return true;
			}
			return false;
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

	public dispose() : void {
		this.markersByResource.clear();
		this._filteredResources= [];
		this._nonFilteredResources= [];
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
			if (this._filterOptions.hasFilters()) {
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

export interface IProblemsConfiguration {
	problems: {
		autoReveal: boolean
	};
}