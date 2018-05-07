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
import * as glob from 'vs/base/common/glob';
import * as strings from 'vs/base/common/strings';

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
	isExcluded: boolean = false;
	isIncluded: boolean = false;
	filteredCount: number;
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
	readonly excludePattern: glob.ParsedExpression = null;
	readonly includePattern: glob.ParsedExpression = null;
	readonly textFilter: string = '';

	constructor(readonly filter: string = '', excludePatterns: glob.IExpression = {}) {
		filter = filter.trim();
		for (const key of Object.keys(excludePatterns)) {
			if (excludePatterns[key]) {
				this.setPattern(excludePatterns, key);
			}
			delete excludePatterns[key];
		}
		const includePatterns: glob.IExpression = glob.getEmptyExpression();
		if (filter) {
			const filters = glob.splitGlobAware(filter, ',').map(s => s.trim()).filter(s => !!s.length);
			for (const f of filters) {
				this.filterErrors = this.filterErrors || this.matches(f, Messages.MARKERS_PANEL_FILTER_ERRORS);
				this.filterWarnings = this.filterWarnings || this.matches(f, Messages.MARKERS_PANEL_FILTER_WARNINGS);
				this.filterInfos = this.filterInfos || this.matches(f, Messages.MARKERS_PANEL_FILTER_INFOS);
				if (strings.startsWith(f, '!')) {
					this.setPattern(excludePatterns, strings.ltrim(f, '!'));
				} else {
					this.setPattern(includePatterns, f);
					this.textFilter += ` ${f}`;
				}
			}
		}
		if (Object.keys(excludePatterns).length) {
			this.excludePattern = glob.parse(excludePatterns);
		}
		if (Object.keys(includePatterns).length) {
			this.includePattern = glob.parse(includePatterns);
		}
		this.textFilter = this.textFilter.trim();
	}

	private setPattern(expression: glob.IExpression, pattern: string) {
		if (pattern[0] === '.') {
			pattern = '*' + pattern; // convert ".js" to "*.js"
		}
		expression[`**/${pattern}/**`] = true;
		expression[`**/${pattern}`] = true;
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
		this._markersByResource.forEach(resource => {
			this.updateResource(resource);
			for (const marker of resource.markers) {
				this.updateMarker(marker, resource);
			}
			this.updateFilteredCount(resource);
		});
	}

	private createResource(uri: URI, rawMarkers: IMarker[]): ResourceMarkers {

		let markers: Marker[] = [];
		const resource = new ResourceMarkers(uri, markers);
		this.updateResource(resource);

		rawMarkers.forEach((rawMarker, index) => {
			const marker = new Marker(uri.toString() + index, rawMarker);
			if (rawMarker.relatedInformation) {
				const groupedByResource = groupBy(rawMarker.relatedInformation, MarkersModel._compareMarkersByUri);
				groupedByResource.sort((a, b) => compareUris(a[0].resource, b[0].resource));
				marker.resourceRelatedInformation = flatten(groupedByResource).map((r, index) => new RelatedInformation(marker.id + index, r));
			}
			this.updateMarker(marker, resource);
			markers.push(marker);
		});

		this.updateFilteredCount(resource);

		return resource;
	}

	private updateResource(resource: ResourceMarkers): void {
		resource.isExcluded = this.isResourceExcluded(resource);
		resource.isIncluded = this.isResourceIncluded(resource);
		resource.uriMatches = this._filterOptions.textFilter ? FilterOptions._filter(this._filterOptions.textFilter, paths.basename(resource.uri.fsPath)) : [];
	}

	private updateFilteredCount(resource: ResourceMarkers): void {
		if (resource.isExcluded) {
			resource.filteredCount = 0;
		} else if (resource.isIncluded) {
			resource.filteredCount = resource.markers.length;
		} else {
			resource.filteredCount = resource.markers.filter(m => m.isSelected).length;
		}
	}

	private updateMarker(marker: Marker, resource: ResourceMarkers): void {
		marker.messageMatches = !resource.isExcluded && this._filterOptions.textFilter ? FilterOptions._fuzzyFilter(this._filterOptions.textFilter, marker.raw.message) : [];
		marker.sourceMatches = !resource.isExcluded && marker.raw.source && this._filterOptions.textFilter ? FilterOptions._filter(this._filterOptions.textFilter, marker.raw.source) : [];
		marker.resourceRelatedInformation.forEach(r => {
			r.uriMatches = !resource.isExcluded && this._filterOptions.textFilter ? FilterOptions._filter(this._filterOptions.textFilter, paths.basename(r.raw.resource.fsPath)) : [];
			r.messageMatches = !resource.isExcluded && this._filterOptions.textFilter ? FilterOptions._fuzzyFilter(this._filterOptions.textFilter, r.raw.message) : [];
		});
		marker.isSelected = this.isMarkerSelected(marker.raw, resource);
	}

	private isResourceExcluded(resource: ResourceMarkers): boolean {
		if (resource.uri.scheme === Schemas.walkThrough || resource.uri.scheme === Schemas.walkThroughSnippet) {
			return true;
		}
		if (this.filterOptions.excludePattern && !!this.filterOptions.excludePattern(resource.uri.fsPath)) {
			return true;
		}
		return false;
	}

	private isResourceIncluded(resource: ResourceMarkers): boolean {
		if (this.filterOptions.includePattern && this.filterOptions.includePattern(resource.uri.fsPath)) {
			return true;
		}
		if (this._filterOptions.textFilter && !!FilterOptions._filter(this._filterOptions.textFilter, paths.basename(resource.uri.fsPath))) {
			return true;
		}
		return false;
	}

	private isMarkerSelected(marker: IMarker, resource: ResourceMarkers): boolean {
		if (resource.isExcluded) {
			return false;
		}
		if (resource.isIncluded) {
			return true;
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
		if (!this._filterOptions.textFilter) {
			return true;
		}
		if (!!FilterOptions._fuzzyFilter(this._filterOptions.textFilter, marker.message)) {
			return true;
		}
		if (!!marker.source && !!FilterOptions._filter(this._filterOptions.textFilter, marker.source)) {
			return true;
		}
		if (!!marker.relatedInformation && marker.relatedInformation.some(r =>
			!!FilterOptions._filter(this._filterOptions.textFilter, paths.basename(r.resource.fsPath)) || !
			!FilterOptions._filter(this._filterOptions.textFilter, r.message))) {
			return true;
		}
		return false;
	}

	public dispose(): void {
		this._markersByResource.clear();
	}
}
