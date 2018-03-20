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
import { groupBy, isFalsyOrEmpty } from 'vs/base/common/arrays';
import { values } from 'vs/base/common/map';

export abstract class NodeWithId {
	constructor(readonly id: string) { }
}

export class ResourceData<T> extends NodeWithId {

	private _name: string = null;
	private _path: string = null;

	count: number = 0;
	uriMatches: IMatch[] = [];

	constructor(
		id: string,
		readonly uri: URI,
		readonly data: T[]
	) {
		super(id);
		this.count = this.data.length;
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

export class ResourceMarkers extends ResourceData<Marker> {

	constructor(
		uri: URI,
		markers: Marker[]
	) {
		const sorted = markers.sort(Marker.compare);
		super(uri.toString(), uri, sorted);
	}

	static compare(a: ResourceMarkers, b: ResourceMarkers): number {
		let [firstMarkerOfA] = a.data;
		let [firstMarkerOfB] = b.data;
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
	resourceRelatedInformation: ResourceData<RelatedInformation>[] = [];

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
		return [
			`file: '${this.raw.resource}'`,
			`severity: '${MarkerSeverity.toString(this.raw.severity)}'`,
			`message: '${this.raw.message}'`,
			`at: '${this.raw.startLineNumber},${this.raw.startColumn}'`,
			`source: '${this.raw.source ? this.raw.source : ''}'`,
			`code: '${this.raw.code ? this.raw.code : ''}'`
		].join('\n');
	}

	static compare(a: Marker, b: Marker): number {
		return MarkerSeverity.compare(a.raw.severity, b.raw.severity)
			|| Range.compareRangesUsingStarts(a.raw, b.raw);
	}
}

export class RelatedInformation extends NodeWithId {
	constructor(
		id: string,
		readonly relatedInformation: IRelatedInformation,
		public matches: IMatch[]) {
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
		if (a.resource.toString() < b.resource.toString()) {
			return -1;
		} else if (a.resource.toString() > b.resource.toString()) {
			return 1;
		} else {
			return 0;
		}
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
			if (resource.count > 0) {
				callback(resource);
			}
		});
	}

	public hasFilteredResources(): boolean {
		let res = false;
		this._markersByResource.forEach(resource => {
			res = res || resource.count > 0;
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
			total += resource.data.length;
			filtered += resource.count;
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
				resource.count = resource.data.length;
				resource.uriMatches = [];

				for (const marker of resource.data) {
					marker.isSelected = true;
					marker.messageMatches = [];
					marker.sourceMatches = [];
					marker.resourceRelatedInformation.forEach(r => {
						r.uriMatches = [];
						r.data.forEach(d => d.matches = []);
					});
				}
			});
		} else {
			// update properly
			this._markersByResource.forEach(resource => {

				resource.uriMatches = this._filterOptions.hasFilters() ? FilterOptions._filter(this._filterOptions.filter, paths.basename(resource.uri.fsPath)) : [];
				resource.count = 0;

				for (const marker of resource.data) {
					marker.messageMatches = this._filterOptions.hasFilters() ? FilterOptions._fuzzyFilter(this._filterOptions.filter, marker.raw.message) : [];
					marker.sourceMatches = marker.raw.source && this._filterOptions.hasFilters() ? FilterOptions._filter(this._filterOptions.filter, marker.raw.source) : [];
					marker.isSelected = this.filterMarker(marker.raw);
					if (marker.isSelected) {
						resource.count += 1;
					}
					marker.resourceRelatedInformation.forEach(r => {
						r.uriMatches = this._filterOptions.hasFilters() ? FilterOptions._filter(this._filterOptions.filter, paths.basename(r.uri.fsPath)) : [];
						r.data.forEach(d => d.matches = this._filterOptions.hasFilters() ? FilterOptions._fuzzyFilter(this._filterOptions.filter, d.relatedInformation.message) : []);
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
		resource.count = filteredCount;
		resource.uriMatches = this._filterOptions.hasFilters() ? FilterOptions._filter(this._filterOptions.filter, paths.basename(uri.fsPath)) : [];

		return resource;
	}

	private createMarker(rawMarker: IMarker, index: number, uri: string): Marker {
		const marker = new Marker(uri + index, rawMarker);
		marker.messageMatches = this._filterOptions.hasFilters() ? FilterOptions._fuzzyFilter(this._filterOptions.filter, rawMarker.message) : [];
		marker.sourceMatches = rawMarker.source && this._filterOptions.hasFilters() ? FilterOptions._filter(this._filterOptions.filter, rawMarker.source) : [];
		marker.isSelected = this.filterMarker(rawMarker);
		if (rawMarker.relatedInformation) {
			marker.resourceRelatedInformation = groupBy(rawMarker.relatedInformation, MarkersModel._compareMarkersByUri)
				.map(group => {
					const id = uri + index + uri + index.toString();
					const r = new ResourceData<RelatedInformation>(
						id,
						group[0].resource,
						group.map((relatedInformation, index) =>
							new RelatedInformation(
								id + index,
								relatedInformation,
								this._filterOptions.hasFilters() ? FilterOptions._fuzzyFilter(this._filterOptions.filter, relatedInformation.message) : []
							)));
					r.uriMatches = this._filterOptions.hasFilters() ? FilterOptions._filter(this._filterOptions.filter, paths.basename(r.uri.fsPath)) : [];
					return r;
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
