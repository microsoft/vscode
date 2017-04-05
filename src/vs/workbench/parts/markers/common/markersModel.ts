/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as paths from 'vs/base/common/paths';
import * as types from 'vs/base/common/types';
import * as Map from 'vs/base/common/map';
import Severity from 'vs/base/common/severity';
import URI from 'vs/base/common/uri';
import { IRange } from 'vs/editor/common/editorCommon';
import { Range } from 'vs/editor/common/core/range';
import { IMarker, MarkerStatistics } from 'vs/platform/markers/common/markers';
import { IFilter, IMatch, or, matchesContiguousSubString, matchesPrefix, matchesFuzzy } from 'vs/base/common/filters';
import Messages from 'vs/workbench/parts/markers/common/messages';
import { Schemas } from 'vs/base/common/network';

export interface BulkUpdater {
	add(resource: URI, markers: IMarker[]);
	done();
}

export class Resource {

	private _name: string = null;
	private _path: string = null;

	constructor(public uri: URI, public markers: Marker[],
		public statistics: MarkerStatistics,
		public matches: IMatch[] = []) {
	}

	public get path(): string {
		if (this._path === null) {
			this._path = this.uri.fsPath;
		}
		return this._path;
	}

	public get name(): string {
		if (this._name === null) {
			this._name = paths.basename(this.uri.fsPath);
		}
		return this._name;
	}
}

export class Marker {
	constructor(public id: string, public marker: IMarker,
		public labelMatches: IMatch[] = [],
		public sourceMatches: IMatch[] = []) { }

	public get resource(): URI {
		return this.marker.resource;
	}

	public get range(): IRange {
		return this.marker;
	}

	public toString(): string {
		return [`file: '${this.marker.resource}'`,
		`severity: '${Severity.toString(this.marker.severity)}'`,
		`message: '${this.marker.message}'`,
		`at: '${this.marker.startLineNumber},${this.marker.startColumn}'`,
		`source: '${this.marker.source ? this.marker.source : ''}'`].join('\n');
	}

}

export class FilterOptions {

	static _filter: IFilter = or(matchesPrefix, matchesContiguousSubString);
	static _fuzzyFilter: IFilter = or(matchesPrefix, matchesContiguousSubString, matchesFuzzy);

	private _filterErrors: boolean = false;
	private _filterWarnings: boolean = false;
	private _filterInfos: boolean = false;
	private _filter: string = '';
	private _completeFilter: string = '';

	constructor(filter: string = '') {
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

	public hasFilters(): boolean {
		return !!this._filter;
	}

	private parse(filter: string) {
		this._completeFilter = filter;
		this._filter = filter.trim();
		this._filterErrors = this.matches(this._filter, Messages.MARKERS_PANEL_FILTER_ERRORS);
		this._filterWarnings = this.matches(this._filter, Messages.MARKERS_PANEL_FILTER_WARNINGS);
		this._filterInfos = this.matches(this._filter, Messages.MARKERS_PANEL_FILTER_INFOS);
	}

	private matches(prefix: string, word: string): boolean {
		let result = matchesPrefix(prefix, word);
		return result && result.length > 0;
	}
}

export class MarkersModel {

	private markersByResource: Map.LinkedMap<URI, IMarker[]>;

	private _filteredResources: Resource[];
	private _nonFilteredResources: Resource[];
	private _filterOptions: FilterOptions;

	constructor(markers: IMarker[] = []) {
		this.markersByResource = new Map.LinkedMap<URI, IMarker[]>();
		this._filterOptions = new FilterOptions();
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

	public hasResource(resource: URI): boolean {
		return this.markersByResource.has(resource);
	}

	public get nonFilteredResources(): Resource[] {
		return this._nonFilteredResources;
	}

	public getBulkUpdater(): BulkUpdater {
		return {
			add: (resourceUri: URI, markers: IMarker[]) => {
				this.updateResource(resourceUri, markers);
			},
			done: () => {
				this.refresh();
			}
		};
	}

	public update(filterOptions: FilterOptions);
	public update(resourceUri: URI, markers: IMarker[]);
	public update(markers: IMarker[]);
	public update(arg1?: any, arg2?: any) {
		if (arg1 instanceof FilterOptions) {
			this._filterOptions = arg1;
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
		this._nonFilteredResources = [];
		this._filteredResources = [];
		for (const entry of this.markersByResource.entries()) {
			const filteredResource = this.toFilteredResource(entry);
			if (filteredResource.markers.length) {
				this._filteredResources.push(filteredResource);
			} else {
				this._nonFilteredResources.push(filteredResource);
			}
		}
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
		markers.forEach((marker: IMarker) => {
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
		let markers: Marker[] = [];
		for (let i = 0; i < entry.value.length; i++) {
			const m = entry.value[i];
			const uri = entry.key.toString();
			if (entry.key.scheme !== Schemas.walkThrough && entry.key.scheme !== Schemas.walkThroughSnippet && (!this._filterOptions.hasFilters() || this.filterMarker(m))) {
				markers.push(this.toMarker(m, i, uri));
			}
		}
		const matches = this._filterOptions.hasFilters() ? FilterOptions._filter(this._filterOptions.filter, paths.basename(entry.key.fsPath)) : [];
		return new Resource(entry.key, markers, this.getStatistics(entry.value), matches || []);
	}

	private toMarker(marker: IMarker, index: number, uri: string): Marker {
		const labelMatches = this._filterOptions.hasFilters() ? FilterOptions._fuzzyFilter(this._filterOptions.filter, marker.message) : [];
		const sourceMatches = marker.source && this._filterOptions.hasFilters() ? FilterOptions._filter(this._filterOptions.filter, marker.source) : [];
		return new Marker(uri + index, marker, labelMatches || [], sourceMatches || []);
	}

	private filterMarker(marker: IMarker): boolean {
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

	private getStatistics(markers: IMarker[]): MarkerStatistics {
		let errors = 0, warnings = 0, infos = 0, unknowns = 0;
		for (const marker of markers) {
			switch (marker.severity) {
				case Severity.Error:
					errors++;
					break;
				case Severity.Warning:
					warnings++;
					break;
				case Severity.Info:
					infos++;
					break;
				default:
					unknowns++;
					break;
			}
		}
		return { errors, warnings, infos, unknowns };
	}

	public dispose(): void {
		this.markersByResource.clear();
		this._filteredResources = [];
		this._nonFilteredResources = [];
	}

	public getTitle(markerStatistics: MarkerStatistics): string {
		let title = MarkersModel.getStatisticsLabel(markerStatistics);
		return title ? title : Messages.MARKERS_PANEL_TITLE_PROBLEMS;
	}

	public getMessage(): string {
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

	public static getStatisticsLabel(markerStatistics: MarkerStatistics, onlyErrors: boolean = false): string {
		let label = this.getLabel('', markerStatistics.errors, Messages.MARKERS_PANEL_SINGLE_ERROR_LABEL, Messages.MARKERS_PANEL_MULTIPLE_ERRORS_LABEL);
		if (!onlyErrors) {
			label = this.getLabel(label, markerStatistics.warnings, Messages.MARKERS_PANEL_SINGLE_WARNING_LABEL, Messages.MARKERS_PANEL_MULTIPLE_WARNINGS_LABEL);
			label = this.getLabel(label, markerStatistics.infos, Messages.MARKERS_PANEL_SINGLE_INFO_LABEL, Messages.MARKERS_PANEL_MULTIPLE_INFOS_LABEL);
			label = this.getLabel(label, markerStatistics.unknowns, Messages.MARKERS_PANEL_SINGLE_UNKNOWN_LABEL, Messages.MARKERS_PANEL_MULTIPLE_UNKNOWNS_LABEL);
		}
		return label;
	}

	private static getLabel(title: string, markersCount: number, singleMarkerString: string, multipleMarkersFunction: (markersCount: number) => string): string {
		if (markersCount <= 0) {
			return title;
		}
		title = title ? title + ', ' : '';
		title += markersCount === 1 ? singleMarkerString : multipleMarkersFunction(markersCount);
		return title;
	}

	public static compare(a: any, b: any): number {
		if (a instanceof Resource && b instanceof Resource) {
			return MarkersModel.compareResources(a, b);
		}
		if (a instanceof Marker && b instanceof Marker) {
			return MarkersModel.compareMarkers(a, b);
		}
		return 0;
	}

	private static compareResources(a: Resource, b: Resource): number {
		if (a.statistics.errors === 0 && b.statistics.errors > 0) {
			return 1;
		}
		if (b.statistics.errors === 0 && a.statistics.errors > 0) {
			return -1;
		}
		return a.path.localeCompare(b.path) || a.name.localeCompare(b.name);
	}

	private static compareMarkers(a: Marker, b: Marker): number {
		if (a.marker.severity === b.marker.severity) {
			return Range.compareRangesUsingStarts(a.marker, b.marker);
		}
		return a.marker.severity > b.marker.severity ? -1 : 1;
	}
}

export interface IProblemsConfiguration {
	problems: {
		autoReveal: boolean
	};
}