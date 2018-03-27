/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as paths from 'vs/base/common/paths';
import URI from 'vs/base/common/uri';
import { Range, IRange } from 'vs/editor/common/core/range';
import { IMarker, MarkerSeverity, IRelatedInformation } from 'vs/platform/markers/common/markers';
import { IFilter, IMatch, or, matchesContiguousSubString, matchesPrefix, matchesFuzzy } from 'vs/base/common/filters';
import Messages from 'vs/workbench/parts/markers/electron-browser/messages';
import { Schemas } from 'vs/base/common/network';
import { groupBy, isFalsyOrEmpty, flatten } from 'vs/base/common/arrays';
import { values } from 'vs/base/common/map';

function compareUris(a: URI, b: URI) {
	if (a.toString() < b.toString()) {
		return -1;
	} else if (a.toString() > b.toString()) {
		return 1;
	} else {
		return 0;
	}
}

export abstract class NodeWithId {
	constructor(readonly id: string) { }
}

export class ResourceMarkers extends NodeWithId {

	private _name: string = null;
	private _path: string = null;

	readonly markers: Marker[];
	filteredCount: number = 0;
	uriMatches: IMatch[] = [];

	constructor(
		readonly uri: URI,
		markers: Marker[]
	) {
		super(uri.toString());
		this.markers = markers.sort(Marker.compare);
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

	static compare(a: ResourceMarkers, b: ResourceMarkers): number {
		let [firstMarkerOfA] = a.markers;
		let [firstMarkerOfB] = b.markers;
		let res = 0;
		if (firstMarkerOfA && firstMarkerOfB) {
			res = MarkerSeverity.compare(firstMarkerOfA.raw.severity, firstMarkerOfB.raw.severity);
		}
		if (res === 0) {
			res = a.path.localeCompare(b.path) || a.name.localeCompare(b.name);
		}
		return res;
	}
}

export class Marker extends NodeWithId {

	isSelected: boolean = false;
	messageMatches: IMatch[] = [];
	sourceMatches: IMatch[] = [];
	resourceRelatedInformation: RelatedInformation[] = [];

	constructor(
		id: string,
		readonly raw: IMarker,
	) {
		super(id);
	}

	public get resource(): URI {
		return this.raw.resource;
	}

	public get range(): IRange {
		return this.raw;
	}

	public toString(): string {
		return JSON.stringify({
			...this.raw,
			resource: this.raw.resource.path,
			relatedInformation: this.resourceRelatedInformation.length ? this.resourceRelatedInformation.map(r => ({ ...r.raw, resource: r.raw.resource.path })) : void 0
		}, null, '\t');
	}

	static compare(a: Marker, b: Marker): number {
		return MarkerSeverity.compare(a.raw.severity, b.raw.severity)
			|| Range.compareRangesUsingStarts(a.raw, b.raw);
	}
}

export class RelatedInformation extends NodeWithId {

	messageMatches: IMatch[];
	uriMatches: IMatch[];

	constructor(id: string, readonly raw: IRelatedInformation) {
		super(id);
	}
}

export class FilterOptions {

	static readonly _filter: IFilter = or(matchesPrefix, matchesContiguousSubString);
	static readonly _fuzzyFilter: IFilter = or(matchesPrefix, matchesContiguousSubString, matchesFuzzy);

	readonly filterErrors: boolean = false;
	readonly filterWarnings: boolean = false;
	readonly filterInfos: boolean = false;
	readonly filter: string = '';
	readonly completeFilter: string = '';

	constructor(filter: string = '') {
		if (filter) {
			this.completeFilter = filter;
			this.filter = filter.trim();
			this.filterErrors = this.matches(this.filter, Messages.MARKERS_PANEL_FILTER_ERRORS);
			this.filterWarnings = this.matches(this.filter, Messages.MARKERS_PANEL_FILTER_WARNINGS);
			this.filterInfos = this.matches(this.filter, Messages.MARKERS_PANEL_FILTER_INFOS);
		}
	}

	public hasFilters(): boolean {
		return !!this.filter;
	}

	private matches(prefix: string, word: string): boolean {
		let result = matchesPrefix(prefix, word);
		return result && result.length > 0;
	}
}

export class MarkersModel {

	private _cachedSortedResources: ResourceMarkers[];
	private _markersByResource: Map<string, ResourceMarkers>;
	private _filterOptions: FilterOptions;

	constructor(markers: IMarker[] = []) {
		this._markersByResource = new Map<string, ResourceMarkers>();
		this._filterOptions = new FilterOptions();

		for (const group of groupBy(markers, MarkersModel._compareMarkersByUri)) {
			const resource = this.createResource(group[0].resource, group);
			this._markersByResource.set(resource.uri.toString(), resource);
		}
	}

	private static _compareMarkersByUri(a: IMarker, b: IMarker) {
		return compareUris(a.resource, b.resource);
	}

	public get filterOptions(): FilterOptions {
		return this._filterOptions;
	}

	public get resources(): ResourceMarkers[] {
		if (!this._cachedSortedResources) {
			this._cachedSortedResources = values(this._markersByResource).sort(ResourceMarkers.compare);
		}
		return this._cachedSortedResources;
	}

	public forEachFilteredResource(callback: (resource: ResourceMarkers) => any) {
		this._markersByResource.forEach(resource => {
			if (resource.filteredCount > 0) {
				callback(resource);
			}
		});
	}

	public hasFilteredResources(): boolean {
		let res = false;
		this._markersByResource.forEach(resource => {
			res = res || resource.filteredCount > 0;
		});
		return res;
	}

	public hasResources(): boolean {
		return this._markersByResource.size > 0;
	}

	public hasResource(resource: URI): boolean {
		return this._markersByResource.has(resource.toString());
	}

	public stats(): { total: number, filtered: number } {
		let total = 0;
		let filtered = 0;
		this._markersByResource.forEach(resource => {
			total += resource.markers.length;
			filtered += resource.filteredCount;
		});
		return { total, filtered };

	}

	public updateMarkers(callback: (updater: (resource: URI, markers: IMarker[]) => any) => void): void {
		callback((resource, markers) => {
			if (isFalsyOrEmpty(markers)) {
				this._markersByResource.delete(resource.toString());
			} else {
				this._markersByResource.set(resource.toString(), this.createResource(resource, markers));
			}
		});
		this._cachedSortedResources = undefined;
	}

	public updateFilterOptions(filterOptions: FilterOptions): void {
		this._filterOptions = filterOptions;
		if (!this._filterOptions.hasFilters()) {
			// reset all filters/matches
			this._markersByResource.forEach(resource => {
				resource.filteredCount = resource.markers.length;
				resource.uriMatches = [];

				for (const marker of resource.markers) {
					marker.isSelected = true;
					marker.messageMatches = [];
					marker.sourceMatches = [];
					marker.resourceRelatedInformation.forEach(r => {
						r.uriMatches = [];
						r.messageMatches = [];
					});
				}
			});
		} else {
			// update properly
			this._markersByResource.forEach(resource => {

				resource.uriMatches = this._filterOptions.hasFilters() ? FilterOptions._filter(this._filterOptions.filter, paths.basename(resource.uri.fsPath)) : [];
				resource.filteredCount = 0;

				for (const marker of resource.markers) {
					marker.messageMatches = this._filterOptions.hasFilters() ? FilterOptions._fuzzyFilter(this._filterOptions.filter, marker.raw.message) : [];
					marker.sourceMatches = marker.raw.source && this._filterOptions.hasFilters() ? FilterOptions._filter(this._filterOptions.filter, marker.raw.source) : [];
					marker.isSelected = this.filterMarker(marker.raw);
					if (marker.isSelected) {
						resource.filteredCount += 1;
					}
					marker.resourceRelatedInformation.forEach(r => {
						r.uriMatches = this._filterOptions.hasFilters() ? FilterOptions._filter(this._filterOptions.filter, paths.basename(r.raw.resource.fsPath)) : [];
						r.messageMatches = this._filterOptions.hasFilters() ? FilterOptions._fuzzyFilter(this._filterOptions.filter, r.raw.message) : [];
					});
				}
			});
		}
	}

	private createResource(uri: URI, rawMarkers: IMarker[]): ResourceMarkers {

		let markers: Marker[] = [];
		let filteredCount = 0;
		for (let i = 0; i < rawMarkers.length; i++) {
			let marker = this.createMarker(rawMarkers[i], i, uri.toString());
			markers.push(marker);
			if (marker.isSelected) {
				filteredCount += 1;
			}
		}

		const resource = new ResourceMarkers(uri, markers);
		resource.filteredCount = filteredCount;
		resource.uriMatches = this._filterOptions.hasFilters() ? FilterOptions._filter(this._filterOptions.filter, paths.basename(uri.fsPath)) : [];

		return resource;
	}

	private createMarker(rawMarker: IMarker, index: number, uri: string): Marker {
		const marker = new Marker(uri + index, rawMarker);
		marker.messageMatches = this._filterOptions.hasFilters() ? FilterOptions._fuzzyFilter(this._filterOptions.filter, rawMarker.message) : [];
		marker.sourceMatches = rawMarker.source && this._filterOptions.hasFilters() ? FilterOptions._filter(this._filterOptions.filter, rawMarker.source) : [];
		marker.isSelected = this.filterMarker(rawMarker);
		if (rawMarker.relatedInformation) {
			const groupedByResource = groupBy(rawMarker.relatedInformation, MarkersModel._compareMarkersByUri);
			groupedByResource.sort((a, b) => compareUris(a[0].resource, b[0].resource));
			marker.resourceRelatedInformation = flatten(groupedByResource).map((r, index) => {
				const relatedInformation = new RelatedInformation(marker.id + index, r);
				relatedInformation.uriMatches = this._filterOptions.hasFilters() ? FilterOptions._filter(this._filterOptions.filter, paths.basename(r.resource.fsPath)) : [];
				relatedInformation.messageMatches = this._filterOptions.hasFilters() ? FilterOptions._fuzzyFilter(this._filterOptions.filter, r.message) : [];
				return relatedInformation;
			});
		}
		return marker;
	}

	private filterMarker(marker: IMarker): boolean {
		if (!this._filterOptions.hasFilters()) {
			return true;
		}
		if (marker.resource.scheme === Schemas.walkThrough || marker.resource.scheme === Schemas.walkThroughSnippet) {
			return false;
		}
		if (this._filterOptions.filterErrors && MarkerSeverity.Error === marker.severity) {
			return true;
		}
		if (this._filterOptions.filterWarnings && MarkerSeverity.Warning === marker.severity) {
			return true;
		}
		if (this._filterOptions.filterInfos && MarkerSeverity.Info === marker.severity) {
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
		if (!!marker.relatedInformation && marker.relatedInformation.some(r =>
			!!FilterOptions._filter(this._filterOptions.filter, paths.basename(r.resource.fsPath)) || !
			!FilterOptions._filter(this._filterOptions.filter, r.message))) {
			return true;
		}
		return false;
	}

	public dispose(): void {
		this._markersByResource.clear();
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
}
