/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { Range, IRange } from 'vs/editor/common/core/range';
import { IMarker, MarkerSeverity, IRelatedInformation, IMarkerData } from 'vs/platform/markers/common/markers';
import { isFalsyOrEmpty, mergeSort } from 'vs/base/common/arrays';
import { values } from 'vs/base/common/map';
import { memoize } from 'vs/base/common/decorators';
import { Emitter, Event } from 'vs/base/common/event';
import { Hasher } from 'vs/base/common/hash';
import { withUndefinedAsNull } from 'vs/base/common/types';

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
	get name(): string { return basename(this.resource); }

	constructor(readonly id: string, readonly resource: URI, readonly markers: Marker[]) { }
}

export class Marker {

	get resource(): URI { return this.marker.resource; }
	get range(): IRange { return this.marker; }

	private _lines: string[];
	get lines(): string[] {
		if (!this._lines) {
			this._lines = this.marker.message.split(/\r\n|\r|\n/g);
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

export class RelatedInformation {

	constructor(
		readonly id: string,
		readonly marker: IMarker,
		readonly raw: IRelatedInformation
	) { }
}

export class MarkersModel {

	private cachedSortedResources: ResourceMarkers[] | undefined = undefined;

	private readonly _onDidChange = new Emitter<URI>();
	readonly onDidChange: Event<URI> = this._onDidChange.event;

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

	getResourceMarkers(resource: URI): ResourceMarkers | null {
		return withUndefinedAsNull(this.resourcesByUri.get(resource.toString()));
	}

	setResourceMarkers(resource: URI, rawMarkers: IMarker[]): void {
		if (isFalsyOrEmpty(rawMarkers)) {
			this.resourcesByUri.delete(resource.toString());
		} else {

			const resourceMarkersId = this.id(resource.toString());
			const markersCountByKey = new Map<string, number>();
			const markers = mergeSort(rawMarkers.map((rawMarker) => {
				const key = IMarkerData.makeKey(rawMarker);
				const index = markersCountByKey.get(key) || 0;
				markersCountByKey.set(key, index + 1);

				const markerId = this.id(resourceMarkersId, key, index);

				let relatedInformation: RelatedInformation[] | undefined = undefined;
				if (rawMarker.relatedInformation) {
					relatedInformation = rawMarker.relatedInformation.map((r, index) => new RelatedInformation(this.id(markerId, r.resource.toString(), r.startLineNumber, r.startColumn, r.endLineNumber, r.endColumn, index), rawMarker, r));
				}

				return new Marker(markerId, rawMarker, relatedInformation);
			}), compareMarkers);

			this.resourcesByUri.set(resource.toString(), new ResourceMarkers(resourceMarkersId, resource, markers));
		}

		this.cachedSortedResources = undefined;
		this._onDidChange.fire(resource);
	}

	private id(...values: (string | number)[]): string {
		const hasher = new Hasher();
		for (const value of values) {
			hasher.hash(value);
		}
		return `${hasher.value}`;
	}

	dispose(): void {
		this._onDidChange.dispose();
		this.resourcesByUri.clear();
	}
}
