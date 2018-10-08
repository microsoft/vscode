/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as paths from 'vs/base/common/paths';
import { URI } from 'vs/base/common/uri';
import { Range, IRange } from 'vs/editor/common/core/range';
import { IMarker, MarkerSeverity, IRelatedInformation } from 'vs/platform/markers/common/markers';
import { groupBy, flatten, isFalsyOrEmpty } from 'vs/base/common/arrays';
import { values } from 'vs/base/common/map';
import { memoize } from 'vs/base/common/decorators';

function compareUris(a: URI, b: URI) {
	const astr = a.toString();
	const bstr = b.toString();
	return astr === bstr ? 0 : (astr < bstr ? -1 : 1);
}

export function compareMarkersByUri(a: IMarker, b: IMarker) {
	return compareUris(a.resource, b.resource);
}

function compareResourceMarkers(a: ResourceMarkers, b: ResourceMarkers): number {
	let [firstMarkerOfA] = a.markers;
	let [firstMarkerOfB] = b.markers;
	let res = 0;
	if (firstMarkerOfA && firstMarkerOfB) {
		res = MarkerSeverity.compare(firstMarkerOfA.marker.severity, firstMarkerOfB.marker.severity);
	}
	if (res === 0) {
		res = a.path.localeCompare(b.path) || a.name.localeCompare(b.name);
	}
	return res;
}

function compareMarkers(a: Marker, b: Marker): number {
	return MarkerSeverity.compare(a.marker.severity, b.marker.severity)
		|| Range.compareRangesUsingStarts(a.marker, b.marker);
}

export class ResourceMarkers {

	@memoize
	get path(): string { return this.resource.fsPath; }

	@memoize
	get name(): string { return paths.basename(this.resource.fsPath); }

	constructor(readonly resource: URI, readonly markers: Marker[]) { }
}

export class Marker {

	get resource(): URI { return this.marker.resource; }
	get range(): IRange { return this.marker; }

	constructor(
		readonly marker: IMarker,
		readonly relatedInformation: RelatedInformation[] = []
	) { }

	toString(): string {
		return JSON.stringify({
			...this.marker,
			resource: this.marker.resource.path,
			relatedInformation: this.relatedInformation.length ? this.relatedInformation.map(r => ({ ...r.raw, resource: r.raw.resource.path })) : void 0
		}, null, '\t');
	}
}

export class RelatedInformation {

	constructor(readonly raw: IRelatedInformation) { }
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

	private cachedSortedResources: ResourceMarkers[] | undefined = undefined;

	get resourceMarkers(): ResourceMarkers[] {
		if (!this.cachedSortedResources) {
			this.cachedSortedResources = values(this.resourcesByUri).sort(compareResourceMarkers);
		}

		return this.cachedSortedResources;
	}

	private resourcesByUri: Map<string, ResourceMarkers>;

	constructor() {
		this.resourcesByUri = new Map<string, ResourceMarkers>();
	}

	// updateMarkers(callback: (updater: (resource: URI, markers: IMarker[]) => any) => void): void {
	// 	callback((resource, markers) => {
	// 		if (isFalsyOrEmpty(markers)) {
	// 			this.resourcesByUri.delete(resource.toString());
	// 		} else {
	// 			this.resourcesByUri.set(resource.toString(), this.createResource(resource, markers));
	// 		}
	// 	});
	// 	this.cachedSortedResources = undefined;
	// }

	getResourceMarkers(resource: URI): ResourceMarkers | null {
		return this.resourcesByUri.get(resource.toString()) || null;
	}

	setResourceMarkers(resource: URI, rawMarkers: IMarker[]): void {
		if (isFalsyOrEmpty(rawMarkers)) {
			this.resourcesByUri.delete(resource.toString());
		} else {
			const markers = rawMarkers.map(rawMarker => {
				let relatedInformation: RelatedInformation[] | undefined = undefined;

				if (rawMarker.relatedInformation) {
					const groupedByResource = groupBy(rawMarker.relatedInformation, compareMarkersByUri);
					groupedByResource.sort((a, b) => compareUris(a[0].resource, b[0].resource));
					relatedInformation = flatten(groupedByResource).map(r => new RelatedInformation(r));
				}

				return new Marker(rawMarker, relatedInformation);
			});

			markers.sort(compareMarkers);

			this.resourcesByUri.set(resource.toString(), new ResourceMarkers(resource, markers));
		}

		this.cachedSortedResources = undefined;
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

	stats(): { total: number, filtered: number } {
		let total = 0;
		// let filtered = 0;
		this.resourcesByUri.forEach(resource => {
			total += resource.markers.length;
			// filtered += resource.filteredCount; // TODO@joao
		});
		console.warn('stats not implemented'); // TODO@joao
		return { total, filtered: total };
	}

	dispose(): void {
		this.resourcesByUri.clear();
	}
}
