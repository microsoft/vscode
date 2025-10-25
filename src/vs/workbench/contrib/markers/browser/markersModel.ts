/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isNonEmptyArray } from '../../../../base/common/arrays.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IMatch } from '../../../../base/common/filters.js';
import { hash } from '../../../../base/common/hash.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { basename, extUri } from '../../../../base/common/resources.js';
import { splitLines } from '../../../../base/common/strings.js';
import { URI } from '../../../../base/common/uri.js';
import { IRange, Range } from '../../../../editor/common/core/range.js';
import { IMarker, IMarkerData, IRelatedInformation, MarkerSeverity } from '../../../../platform/markers/common/markers.js';
import { unsupportedSchemas } from '../../../../platform/markers/common/markerService.js';

export type MarkerElement = ResourceMarkers | Marker | RelatedInformation;

export function compareMarkersByUri(a: IMarker, b: IMarker) {
	return extUri.compare(a.resource, b.resource);
}

function compareResourceMarkers(a: ResourceMarkers, b: ResourceMarkers): number {
	const [firstMarkerOfA] = a.markers;
	const [firstMarkerOfB] = b.markers;
	let res = 0;
	if (firstMarkerOfA && firstMarkerOfB) {
		res = MarkerSeverity.compare(firstMarkerOfA.marker.severity, firstMarkerOfB.marker.severity);
	}
	if (res === 0) {
		res = a.path.localeCompare(b.path) || a.name.localeCompare(b.name);
	}
	return res;
}


export class ResourceMarkers {

	readonly path: string;

	readonly name: string;

	private _markersMap = new ResourceMap<Marker[]>();
	private _cachedMarkers: Marker[] | undefined;
	private _total: number = 0;

	constructor(readonly id: string, readonly resource: URI) {
		this.path = this.resource.fsPath;
		this.name = basename(this.resource);
	}

	get markers(): readonly Marker[] {
		if (!this._cachedMarkers) {
			this._cachedMarkers = [...this._markersMap.values()].flat().sort(ResourceMarkers._compareMarkers);
		}
		return this._cachedMarkers;
	}

	has(uri: URI) {
		return this._markersMap.has(uri);
	}

	set(uri: URI, marker: Marker[]) {
		this.delete(uri);
		if (isNonEmptyArray(marker)) {
			this._markersMap.set(uri, marker);
			this._total += marker.length;
			this._cachedMarkers = undefined;
		}
	}

	delete(uri: URI) {
		const array = this._markersMap.get(uri);
		if (array) {
			this._total -= array.length;
			this._cachedMarkers = undefined;
			this._markersMap.delete(uri);
		}
	}

	get total() {
		return this._total;
	}

	private static _compareMarkers(a: Marker, b: Marker): number {
		return MarkerSeverity.compare(a.marker.severity, b.marker.severity)
			|| extUri.compare(a.resource, b.resource)
			|| Range.compareRangesUsingStarts(a.marker, b.marker);
	}
}

export class Marker {

	get resource(): URI { return this.marker.resource; }
	get range(): IRange { return this.marker; }

	private _lines: string[] | undefined;
	get lines(): string[] {
		if (!this._lines) {
			this._lines = splitLines(this.marker.message);
		}
		return this._lines;
	}

	constructor(
		readonly id: string,
		readonly marker: IMarker,
		readonly relatedInformation: RelatedInformation[] = []
	) { }

	toString(): string {
		return JSON.stringify({
			...this.marker,
			resource: this.marker.resource.path,
			relatedInformation: this.relatedInformation.length ? this.relatedInformation.map(r => ({ ...r.raw, resource: r.raw.resource.path })) : undefined
		}, null, '\t');
	}
}

export class MarkerTableItem extends Marker {
	constructor(
		marker: Marker,
		readonly sourceMatches?: IMatch[],
		readonly codeMatches?: IMatch[],
		readonly messageMatches?: IMatch[],
		readonly fileMatches?: IMatch[]
	) {
		super(marker.id, marker.marker, marker.relatedInformation);
	}
}

export class RelatedInformation {

	constructor(
		readonly id: string,
		readonly marker: IMarker,
		readonly raw: IRelatedInformation
	) { }
}

export interface MarkerChangesEvent {
	readonly added: Set<ResourceMarkers>;
	readonly removed: Set<ResourceMarkers>;
	readonly updated: Set<ResourceMarkers>;
}

export class MarkersModel {

	private cachedSortedResources: ResourceMarkers[] | undefined = undefined;

	private readonly _onDidChange = new Emitter<MarkerChangesEvent>();
	readonly onDidChange: Event<MarkerChangesEvent> = this._onDidChange.event;

	get resourceMarkers(): ResourceMarkers[] {
		if (!this.cachedSortedResources) {
			this.cachedSortedResources = [...this.resourcesByUri.values()].sort(compareResourceMarkers);
		}
		return this.cachedSortedResources;
	}

	private resourcesByUri: Map<string, ResourceMarkers>;

	constructor() {
		this.resourcesByUri = new Map<string, ResourceMarkers>();
	}

	reset(): void {
		const removed = new Set<ResourceMarkers>();
		for (const resourceMarker of this.resourcesByUri.values()) {
			removed.add(resourceMarker);
		}
		this.resourcesByUri.clear();
		this._total = 0;
		this._onDidChange.fire({ removed, added: new Set<ResourceMarkers>(), updated: new Set<ResourceMarkers>() });
	}

	private _total: number = 0;
	get total(): number {
		return this._total;
	}

	getResourceMarkers(resource: URI): ResourceMarkers | null {
		return this.resourcesByUri.get(extUri.getComparisonKey(resource, true)) ?? null;
	}

	setResourceMarkers(resourcesMarkers: [URI, IMarker[]][]): void {
		const change: MarkerChangesEvent = { added: new Set(), removed: new Set(), updated: new Set() };
		for (const [resource, rawMarkers] of resourcesMarkers) {

			if (unsupportedSchemas.has(resource.scheme)) {
				continue;
			}

			const key = extUri.getComparisonKey(resource, true);
			let resourceMarkers = this.resourcesByUri.get(key);

			if (isNonEmptyArray(rawMarkers)) {
				// update, add
				if (!resourceMarkers) {
					const resourceMarkersId = this.id(resource.toString());
					resourceMarkers = new ResourceMarkers(resourceMarkersId, resource.with({ fragment: null }));
					this.resourcesByUri.set(key, resourceMarkers);
					change.added.add(resourceMarkers);
				} else {
					change.updated.add(resourceMarkers);
				}
				const markersCountByKey = new Map<string, number>();
				const markers = rawMarkers.map((rawMarker) => {
					const key = IMarkerData.makeKey(rawMarker);
					const index = markersCountByKey.get(key) || 0;
					markersCountByKey.set(key, index + 1);

					const markerId = this.id(resourceMarkers!.id, key, index, rawMarker.resource.toString());

					let relatedInformation: RelatedInformation[] | undefined = undefined;
					if (rawMarker.relatedInformation) {
						relatedInformation = rawMarker.relatedInformation.map((r, index) => new RelatedInformation(this.id(markerId, r.resource.toString(), r.startLineNumber, r.startColumn, r.endLineNumber, r.endColumn, index), rawMarker, r));
					}

					return new Marker(markerId, rawMarker, relatedInformation);
				});

				this._total -= resourceMarkers.total;
				resourceMarkers.set(resource, markers);
				this._total += resourceMarkers.total;

			} else if (resourceMarkers) {
				// clear
				this._total -= resourceMarkers.total;
				resourceMarkers.delete(resource);
				this._total += resourceMarkers.total;
				if (resourceMarkers.total === 0) {
					this.resourcesByUri.delete(key);
					change.removed.add(resourceMarkers);
				} else {
					change.updated.add(resourceMarkers);
				}
			}
		}

		this.cachedSortedResources = undefined;
		if (change.added.size || change.removed.size || change.updated.size) {
			this._onDidChange.fire(change);
		}
	}

	private id(...values: (string | number)[]): string {
		return `${hash(values)}`;
	}

	dispose(): void {
		this._onDidChange.dispose();
		this.resourcesByUri.clear();
	}
}
