/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as arrays from 'vs/base/common/arrays';
import * as network from 'vs/base/common/network';
// import * as collections from 'vs/base/common/collections';
import {isEmptyObject} from 'vs/base/common/types';
import URI from 'vs/base/common/uri';
import Event, {Emitter, debounceEvent} from 'vs/base/common/event';
import Severity from 'vs/base/common/severity';
import {IMarkerService, IMarkerData, IResourceMarker, IMarker, MarkerStatistics} from './markers';

interface MapMap<V> {
	[key: string]: { [key: string]: V };
}

namespace MapMap {

	export function get<V>(map: MapMap<V>, key1: string, key2: string): V {
		if (map[key1]) {
			return map[key1][key2];
		}
	}

	export function set<V>(map: MapMap<V>, key1: string, key2: string, value: V): void {
		if (!map[key1]) {
			map[key1] = Object.create(null);
		}
		map[key1][key2] = value;
	}

	export function remove(map: MapMap<any>, key1: string, key2: string): boolean {
		if (map[key1]) {
			const result = delete map[key1][key2];
			if (isEmptyObject(map[key1])) {
				delete map[key1];
			}
			return result;
		}
	}
}

export class MarkerService implements IMarkerService {

	_serviceBrand: any;

	private _onMarkerChanged = new Emitter<URI[]>();
	private _onMarkerChangedEvent: Event<URI[]> = debounceEvent(this._onMarkerChanged.event, MarkerService._debouncer, 0);
	private _byResource: MapMap<IMarker[]> = Object.create(null);
	private _byOwner: MapMap<IMarker[]> = Object.create(null);
	private _stats: MarkerStatistics;

	constructor() {
		this._onMarkerChangedEvent(() => this._stats = undefined);
	}

	get onMarkerChanged(): Event<URI[]> {
		return this._onMarkerChangedEvent;
	}

	getStatistics(): MarkerStatistics {
		if (!this._stats) {
			this._stats = { errors: 0, infos: 0, warnings: 0, unknowns: 0 };
			for (const {severity, resource} of this.read()) {
				// TODO this is a hack
				if (resource.scheme === network.Schemas.inMemory) {
					continue;
				}
				if (severity === Severity.Error) {
					this._stats.errors += 1;
				} else if (severity === Severity.Warning) {
					this._stats.warnings += 1;
				} else if (severity === Severity.Info) {
					this._stats.infos += 1;
				} else {
					this._stats.unknowns += 1;
				}
			}
		}
		return this._stats;
	}

	remove(owner: string, resources: URI[]): void {
		if (!arrays.isFalsyOrEmpty(resources)) {
			for (const resource of resources) {
				this.changeOne(owner, resource, undefined);
			}
		}
	}

	changeOne(owner: string, resource: URI, markerData: IMarkerData[]): void {

		if (arrays.isFalsyOrEmpty(markerData)) {
			// remove marker for this (owner,resource)-tuple
			const a = MapMap.remove(this._byResource, resource.toString(), owner);
			const b = MapMap.remove(this._byOwner, owner, resource.toString());
			if (a !== b) {
				throw new Error('invalid marker service state');
			}
			if (a && b) {
				this._onMarkerChanged.fire([resource]);
			}

		} else {
			// insert marker for this (owner,resource)-tuple
			const markers: IMarker[] = [];
			for (const data of markerData) {
				const marker = MarkerService._toMarker(owner, resource, data);
				if (marker) {
					markers.push(marker);
				}
			}
			MapMap.set(this._byResource, resource.toString(), owner, markers);
			MapMap.set(this._byOwner, owner, resource.toString(), markers);
			this._onMarkerChanged.fire([resource]);
		}
	}

	private static _toMarker(owner: string, resource: URI, data: IMarkerData): IMarker {
		let {code, severity, message, source, startLineNumber, startColumn, endLineNumber, endColumn} = data;

		if (!message) {
			return;
		}

		// santize data
		code = code || null;
		startLineNumber = startLineNumber > 0 ? startLineNumber : 1;
		startColumn = startColumn > 0 ? startColumn : 1;
		endLineNumber = endLineNumber >= startLineNumber ? endLineNumber : startLineNumber;
		endColumn = endColumn > 0 ? endColumn : startColumn;

		return {
			resource,
			owner,
			code,
			severity,
			message,
			source,
			startLineNumber,
			startColumn,
			endLineNumber,
			endColumn
		};
	}

	changeAll(owner: string, data: IResourceMarker[]): void {
		const changes: URI[] = [];
		const map = this._byOwner[owner];

		// remove old marker
		if (map) {
			delete this._byOwner[owner];
			for (const resource in map) {
				// remeber what we remove
				const [first] = this._byResource[resource][owner];
				if (first) {
					changes.push(first.resource);
				}
				// actual remove
				delete this._byResource[resource];
			}
		}

		// add new markers
		if (!arrays.isFalsyOrEmpty(data)) {

			// group by resource
			const groups: { [resource: string]: IMarker[] } = Object.create(null);
			for (const {resource, marker: markerData} of data) {
				const marker = MarkerService._toMarker(owner, resource, markerData);
				if (!marker) {
					// filter bad markers
					continue;
				}
				const array = groups[resource.toString()];
				if (!array) {
					groups[resource.toString()] = [marker];
					changes.push(resource);
				} else {
					array.push(marker);
				}
			}

			// insert all
			for (const resource in groups) {
				MapMap.set(this._byResource, resource, owner, groups[resource]);
				MapMap.set(this._byOwner, owner, resource, groups[resource]);
			}
		}

		if (changes.length > 0) {
			this._onMarkerChanged.fire(changes);
		}
	}

	read(filter: { owner?: string; resource?: URI; take?: number; } = Object.create(null)): IMarker[] {

		let {owner, resource, take} = filter;

		if (!take || take < 0) {
			take = -1;
		}

		if (owner && resource) {
			// exactly one owner AND resource
			const result = MapMap.get(this._byResource, resource.toString(), owner);
			if (!result) {
				return [];
			} else {
				return result.slice(0, take > 0 ? take : undefined);
			}

		} else if (!owner && !resource) {
			// all
			const result: IMarker[] = [];
			for (const key1 in this._byResource) {
				for (const key2 in this._byResource[key1]) {
					for (const data of this._byResource[key1][key2]) {
						const newLen = result.push(data);

						if (take > 0 && newLen === take) {
							return result;
						}
					}
				}
			}
			return result;

		} else {
			// of one resource OR owner
			const map: { [key: string]: IMarker[] } = owner
				? this._byOwner[owner]
				: this._byResource[resource.toString()];

			if (!map) {
				return [];
			}

			const result: IMarker[] = [];
			for (const key in map) {
				for (const data of map[key]) {
					const newLen = result.push(data);

					if (take > 0 && newLen === take) {
						return result;
					}
				}
			}
			return result;
		}
	}

	// --- event debounce logic

	private static _dedupeMap: { [uri: string]: boolean };

	private static _debouncer(last: URI[], event: URI[]): URI[] {
		if (!last) {
			MarkerService._dedupeMap = Object.create(null);
			last = [];
		}
		for (const uri of event) {
			if (MarkerService._dedupeMap[uri.toString()] === void 0) {
				MarkerService._dedupeMap[uri.toString()] = true;
				last.push(uri);
			}
		}
		return last;
	}
}
