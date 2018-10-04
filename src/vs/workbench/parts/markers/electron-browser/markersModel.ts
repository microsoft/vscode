/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as paths from 'vs/base/common/paths';
import { URI } from 'vs/base/common/uri';
import { Range, IRange } from 'vs/editor/common/core/range';
import { IMarker, MarkerSeverity, IRelatedInformation } from 'vs/platform/markers/common/markers';
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

	markers: Marker[] = [];

	constructor(readonly uri: URI) {
		super(uri.toString());
	}

	get path(): string {
		if (this._path === null) {
			this._path = this.uri.fsPath;
		}
		return this._path;
	}

	get name(): string {
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

	resourceRelatedInformation: RelatedInformation[] = [];

	constructor(
		id: string,
		readonly raw: IMarker,
		readonly resourceMarkers: ResourceMarkers
	) {
		super(id);
	}

	get resource(): URI {
		return this.raw.resource;
	}

	get range(): IRange {
		return this.raw;
	}

	toString(): string {
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

	constructor(id: string, readonly raw: IRelatedInformation) {
		super(id);
	}
}

// TODO@joao
// export class FilterOptions {

// 	static readonly _filter: IFilter = or(matchesPrefix, matchesContiguousSubString);
// 	static readonly _fuzzyFilter: IFilter = or(matchesPrefix, matchesContiguousSubString, matchesFuzzy);

// 	readonly filterErrors: boolean = false;
// 	readonly filterWarnings: boolean = false;
// 	readonly filterInfos: boolean = false;
// 	readonly excludePattern: glob.ParsedExpression = null;
// 	readonly includePattern: glob.ParsedExpression = null;
// 	readonly textFilter: string = '';

// 	constructor(readonly filter: string = '', excludePatterns: glob.IExpression = {}) {
// 		filter = filter.trim();
// 		for (const key of Object.keys(excludePatterns)) {
// 			if (excludePatterns[key]) {
// 				this.setPattern(excludePatterns, key);
// 			}
// 			delete excludePatterns[key];
// 		}
// 		const includePatterns: glob.IExpression = glob.getEmptyExpression();
// 		if (filter) {
// 			const filters = glob.splitGlobAware(filter, ',').map(s => s.trim()).filter(s => !!s.length);
// 			for (const f of filters) {
// 				this.filterErrors = this.filterErrors || this.matches(f, Messages.MARKERS_PANEL_FILTER_ERRORS);
// 				this.filterWarnings = this.filterWarnings || this.matches(f, Messages.MARKERS_PANEL_FILTER_WARNINGS);
// 				this.filterInfos = this.filterInfos || this.matches(f, Messages.MARKERS_PANEL_FILTER_INFOS);
// 				if (strings.startsWith(f, '!')) {
// 					this.setPattern(excludePatterns, strings.ltrim(f, '!'));
// 				} else {
// 					this.setPattern(includePatterns, f);
// 					this.textFilter += ` ${f}`;
// 				}
// 			}
// 		}
// 		if (Object.keys(excludePatterns).length) {
// 			this.excludePattern = glob.parse(excludePatterns);
// 		}
// 		if (Object.keys(includePatterns).length) {
// 			this.includePattern = glob.parse(includePatterns);
// 		}
// 		this.textFilter = this.textFilter.trim();
// 	}

// 	private setPattern(expression: glob.IExpression, pattern: string) {
// 		if (pattern[0] === '.') {
// 			pattern = '*' + pattern; // convert ".js" to "*.js"
// 		}
// 		expression[`**/${pattern}/**`] = true;
// 		expression[`**/${pattern}`] = true;
// 	}

// 	private matches(prefix: string, word: string): boolean {
// 		let result = matchesPrefix(prefix, word);
// 		return result && result.length > 0;
// 	}
// }

export class MarkersModel {

	private _cachedSortedResources: ResourceMarkers[];
	private _markersByResource: Map<string, ResourceMarkers>;

	constructor(markers: IMarker[] = []) {
		this._markersByResource = new Map<string, ResourceMarkers>();

		for (const group of groupBy(markers, MarkersModel._compareMarkersByUri)) {
			const resource = this.createResource(group[0].resource, group);
			this._markersByResource.set(resource.uri.toString(), resource);
		}
	}

	private static _compareMarkersByUri(a: IMarker, b: IMarker) {
		return compareUris(a.resource, b.resource);
	}

	get resources(): ResourceMarkers[] {
		if (!this._cachedSortedResources) {
			this._cachedSortedResources = values(this._markersByResource).sort(ResourceMarkers.compare);
		}
		return this._cachedSortedResources;
	}

	// TODO@joao
	// forEachFilteredResource(callback: (resource: ResourceMarkers) => any) {
	// 	this._markersByResource.forEach(resource => {
	// 		if (resource.filteredCount > 0) {
	// 			callback(resource);
	// 		}
	// 	});
	// }

	// TODO@joao
	// hasFilteredResources(): boolean {
	// 	let res = false;
	// 	this._markersByResource.forEach(resource => {
	// 		res = res || resource.filteredCount > 0;
	// 	});
	// 	return res;
	// }

	hasResources(): boolean {
		return this._markersByResource.size > 0;
	}

	hasResource(resource: URI): boolean {
		return this._markersByResource.has(resource.toString());
	}

	stats(): { total: number, filtered: number } {
		let total = 0;
		// let filtered = 0;
		this._markersByResource.forEach(resource => {
			total += resource.markers.length;
			// filtered += resource.filteredCount; // TODO@joao
		});
		console.warn('stats not implemented'); // TODO@joao
		return { total, filtered: total };
	}

	updateMarkers(callback: (updater: (resource: URI, markers: IMarker[]) => any) => void): void {
		callback((resource, markers) => {
			if (isFalsyOrEmpty(markers)) {
				this._markersByResource.delete(resource.toString());
			} else {
				this._markersByResource.set(resource.toString(), this.createResource(resource, markers));
			}
		});
		this._cachedSortedResources = undefined;
	}

	private createResource(uri: URI, rawMarkers: IMarker[]): ResourceMarkers {
		const markers: Marker[] = [];
		const resource = new ResourceMarkers(uri);

		rawMarkers.forEach((rawMarker, index) => {
			const marker = new Marker(uri.toString() + index, rawMarker, resource);
			if (rawMarker.relatedInformation) {
				const groupedByResource = groupBy(rawMarker.relatedInformation, MarkersModel._compareMarkersByUri);
				groupedByResource.sort((a, b) => compareUris(a[0].resource, b[0].resource));
				marker.resourceRelatedInformation = flatten(groupedByResource).map((r, index) => new RelatedInformation(marker.id + index, r));
			}
			markers.push(marker);
		});
		resource.markers = markers.sort(Marker.compare);

		return resource;
	}

	getMarkers(resource: URI): ResourceMarkers | null {
		return this._markersByResource.get(resource.toString()) || null;
	}

	dispose(): void {
		this._markersByResource.clear();
	}
}
