/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as paths from 'vs/base/common/paths';
import * as types from 'vs/base/common/types';
import Severity from 'vs/base/common/severity';
import URI from 'vs/base/common/uri';
import { Range, IRange } from 'vs/editor/common/core/range';
import { IMarker } from 'vs/platform/markers/common/markers';
import { IFilter, IMatch, or, matchesContiguousSubString, matchesPrefix, matchesFuzzy } from 'vs/base/common/filters';
import Messages from 'vs/workbench/parts/markers/common/messages';
import { Schemas } from 'vs/base/common/network';

export interface BulkUpdater {
	add(resource: URI, markers: IMarker[]): void;
	done(): void;
}

export class Resource {

	private _name: string = null;
	private _path: string = null;

	constructor(
		readonly uri: URI,
		readonly uriMatches: IMatch[] = [],
		readonly markers: Marker[],
	) {
		markers.sort(Marker.compare);
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

	static compare(a: Resource, b: Resource): number {
		let [firstMarkerOfA] = a.markers;
		let [firstMarkerOfB] = b.markers;
		let res = 0;
		if (firstMarkerOfA && firstMarkerOfB) {
			res = Severity.compare(firstMarkerOfA.marker.severity, firstMarkerOfB.marker.severity);
		}
		if (res === 0) {
			res = a.path.localeCompare(b.path) || a.name.localeCompare(b.name);
		}
		return res;
	}
}

export class Marker {

	constructor(
		readonly id: string,
		readonly marker: IMarker,
		readonly labelMatches: IMatch[] = [],
		readonly sourceMatches: IMatch[] = []
	) { }

	public get resource(): URI {
		return this.marker.resource;
	}

	public get range(): IRange {
		return this.marker;
	}

	public toString(): string {
		return [
			`file: '${this.marker.resource}'`,
			`severity: '${Severity.toString(this.marker.severity)}'`,
			`message: '${this.marker.message}'`,
			`at: '${this.marker.startLineNumber},${this.marker.startColumn}'`,
			`source: '${this.marker.source ? this.marker.source : ''}'`,
			`code: '${this.marker.code ? this.marker.code : ''}'`
		].join('\n');
	}

	static compare(a: Marker, b: Marker): number {
		return Severity.compare(a.marker.severity, b.marker.severity)
			|| Range.compareRangesUsingStarts(a.marker, b.marker);
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

	private markersByResource: Map<string, IMarker[]>;

	private _filteredResources: Resource[];
	private _nonFilteredResources: Resource[];
	private _filterOptions: FilterOptions;

	constructor(markers: IMarker[] = []) {
		this.markersByResource = new Map<string, IMarker[]>();
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
		return this.markersByResource.has(resource.toString());
	}

	public total(): number {
		let total = 0;
		this.markersByResource.forEach(markers => total = total + markers.length);
		return total;
	}

	public count(): number {
		let count = 0;
		this.filteredResources.forEach(resource => count = count + resource.markers.length);
		return count;
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

	public update(filterOptions: FilterOptions): void;
	public update(resourceUri: URI, markers: IMarker[]): void;
	public update(markers: IMarker[]): void;
	public update(arg1?: FilterOptions | URI | IMarker[], arg2?: IMarker[]) {
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
		this.markersByResource.forEach((values, uri) => {
			const filteredResource = this.toFilteredResource(URI.parse(uri), values);
			if (filteredResource.markers.length) {
				this._filteredResources.push(filteredResource);
			} else {
				this._nonFilteredResources.push(filteredResource);
			}
		});
	}

	private updateResource(resourceUri: URI, markers: IMarker[]) {
		if (this.markersByResource.has(resourceUri.toString())) {
			this.markersByResource.delete(resourceUri.toString());
		}
		if (markers.length > 0) {
			this.markersByResource.set(resourceUri.toString(), markers);
		}
	}

	private updateMarkers(markers: IMarker[]) {
		markers.forEach((marker: IMarker) => {
			let uri: URI = marker.resource;
			let markers: IMarker[] = this.markersByResource.get(uri.toString());
			if (!markers) {
				markers = [];
				this.markersByResource.set(uri.toString(), markers);
			}
			markers.push(marker);
		});
	}

	private toFilteredResource(uri: URI, values: IMarker[]) {
		let markers: Marker[] = [];
		for (let i = 0; i < values.length; i++) {
			const m = values[i];
			if (uri.scheme !== Schemas.walkThrough && uri.scheme !== Schemas.walkThroughSnippet && (!this._filterOptions.hasFilters() || this.filterMarker(m))) {
				markers.push(this.toMarker(m, i, uri.toString()));
			}
		}
		const matches = this._filterOptions.hasFilters() ? FilterOptions._filter(this._filterOptions.filter, paths.basename(uri.fsPath)) : [];
		return new Resource(uri, matches || [], markers);
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

	public dispose(): void {
		this.markersByResource.clear();
		this._filteredResources = [];
		this._nonFilteredResources = [];
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

	public static compare(a: any, b: any): number {
		if (a instanceof Resource && b instanceof Resource) {
			return Resource.compare(a, b);
		}
		if (a instanceof Marker && b instanceof Marker) {
			return Marker.compare(a, b);
		}
		return 0;
	}
}
