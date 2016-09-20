/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import arrays = require('vs/base/common/arrays');
import network = require('vs/base/common/network');
import collections = require('vs/base/common/collections');
import URI from 'vs/base/common/uri';
import Event, {Emitter, debounceEvent} from 'vs/base/common/event';
import Severity from 'vs/base/common/severity';
import {IMarkerService, IMarkerData, IResourceMarker, IMarker, MarkerStatistics} from './markers';

interface Key {
	owner: string;
	resource: URI;
}

namespace Key {

	export function fromValue(value: string): Key {
		const idx = value.indexOf('→');
		const owner = value.substring(0, idx);
		const resource = URI.parse(value.substring(idx + 1));
		return { owner, resource };
	}

	export function selector(owner?: string, resource?: URI): (input: string)=> boolean {

		if (!owner && !resource) {
			// anything
			return input => true;

		} else if (!owner) {
			// ends with
			const suffix = '→' + resource.toString();
			return input => input.lastIndexOf(suffix) === input.length - suffix.length;

		} else if (!resource) {
			// starts with
			const prefix = owner + `→`;
			return input => input.indexOf(prefix) === 0;

		} else {
			// exact match
			const match = owner + '→' + resource.toString();
			return input => input === match;
		}
	}

	export function raw(owner: string, resource: URI): string {
		return owner + '→' + resource;
	}
}

export interface MarkerData {
	[k: string]: IMarkerData[];
}


export class MarkerService implements IMarkerService {

	public _serviceBrand: any;

	private _data: { [k: string]: IMarkerData[] };

	private _stats: MarkerStatistics;

	private _onMarkerChanged = new Emitter<URI[]>();

	private _onMarkerChangedEvent: Event<URI[]> = debounceEvent(this._onMarkerChanged.event, MarkerService._debouncer, 0);


	constructor() {
		this._data = Object.create(null);
		this._stats = this._emptyStats();
	}

	public getStatistics(): MarkerStatistics {
		return this._stats;
	}

	// ---- IMarkerService ------------------------------------------

	public get onMarkerChanged(): Event<URI[]> {
		return this._onMarkerChangedEvent;
	}

	public changeOne(owner: string, resource: URI, markers: IMarkerData[]): void {
		if (this._doChangeOne(owner, resource, markers)) {
			this._onMarkerChanged.fire([resource]);
		}
	}

	public remove(owner: string, resources: URI[]): void {
		if (arrays.isFalsyOrEmpty(resources)) {
			return;
		}
		let changedResources: URI[];
		for (let resource of resources) {
			if (this._doChangeOne(owner, resource, undefined)) {
				if (!changedResources) {
					changedResources = [];
				}
				changedResources.push(resource);
			}
		}
		if (changedResources) {
			this._onMarkerChanged.fire(changedResources);
		}
	}

	private _doChangeOne(owner: string, resource: URI, markers: IMarkerData[]): boolean {

		let key = Key.raw(owner, resource),
			oldMarkers = this._data[key],
			hasOldMarkers = !arrays.isFalsyOrEmpty(oldMarkers),
			getsNewMarkers = !arrays.isFalsyOrEmpty(markers),
			oldStats = this._computeStats(oldMarkers),
			newStats = this._computeStats(markers);

		if (!hasOldMarkers && !getsNewMarkers) {
			return;
		}
		if (getsNewMarkers) {
			this._data[key] = markers;
		} else if (hasOldMarkers) {
			delete this._data[key];
		}
		if (this._isStatRelevant(resource)) {
			this._updateStatsMinus(oldStats);
			this._updateStatsPlus(newStats);
		}
		return true;
	}

	public changeAll(owner: string, data: IResourceMarker[]): void {
		let changedResources: { [n: string]: URI } = Object.create(null);

		// remove and record old markers
		let oldStats = this._emptyStats();
		this._forEach(owner, undefined, -1, (e, r) => {
			let resource = Key.fromValue(e.key).resource;
			if (this._isStatRelevant(resource)) {
				this._updateStatsPlus(oldStats, this._computeStats(e.value));
			}
			changedResources[resource.toString()] = resource;
			r();
		});
		this._updateStatsMinus(oldStats);

		// add and record new markers
		if (!arrays.isFalsyOrEmpty(data)) {
			let newStats = this._emptyStats();
			data.forEach(d => {
				changedResources[d.resource.toString()] = d.resource;
				collections.lookupOrInsert(this._data, Key.raw(owner, d.resource), []).push(d.marker);
				if (this._isStatRelevant(d.resource)) {
					this._updateStatsMarker(newStats, d.marker);
				}
			});
			this._updateStatsPlus(newStats);
		}
		this._onMarkerChanged.fire(collections.values(changedResources));
	}

	public read(filter: { owner?: string; resource?: URI; take?: number; } = Object.create(null)): IMarker[] {
		let ret: IMarker[] = [];
		this._forEach(filter.owner, filter.resource, filter.take, entry => this._fromEntry(entry, ret));
		return ret;
	}

	private _isStatRelevant(resource: URI): boolean {
		//TODO@Dirk this is a hack
		return resource.scheme !== network.Schemas.inMemory;
	}

	private _forEach(owner: string, resource: URI, take: number, callback: (entry: { key: string; value: IMarkerData[]; }, remove: Function) => any): void {
		//TODO@Joh: be smart and use an index
		const selector = Key.selector(owner, resource);

		let took = 0;
		for (let key in this._data) {
			if (selector(key)) {
				callback({ key, value: this._data[key] }, () => delete this._data[key]);
				if (take > 0 && took++ >= take) {
					break;
				}
			}
		}
	}

	private _fromEntry(entry: { key: string; value: IMarkerData[]; }, bucket: IMarker[]): void {

		let key = Key.fromValue(entry.key);

		entry.value.forEach(data => {

			// before reading, we sanitize the data
			// skip entry if not sanitizable
			const ok = MarkerService._sanitize(data);
			if (!ok) {
				return;
			}

			bucket.push({
				owner: key.owner,
				resource: key.resource,
				code: data.code,
				message: data.message,
				source: data.source,
				severity: data.severity,
				startLineNumber: data.startLineNumber,
				startColumn: data.startColumn,
				endLineNumber: data.endLineNumber,
				endColumn: data.endColumn
			});
		});
	}

	private _computeStats(markers: IMarkerData[]): MarkerStatistics {
		let errors = 0, warnings = 0, infos = 0, unknwons = 0;
		if (markers) {
			for (let i = 0; i < markers.length; i++) {
				let marker = markers[i];
				if (marker.severity) {
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
							unknwons++;
							break;
					}
				} else {
					unknwons++;
				}
			}
		}
		return {
			errors: errors,
			warnings: warnings,
			infos: infos,
			unknowns: unknwons
		};
	}

	private _emptyStats(): MarkerStatistics {
		return { errors: 0, warnings: 0, infos: 0, unknowns: 0 };
	}

	private _updateStatsPlus(toAdd: MarkerStatistics): void;
	private _updateStatsPlus(toUpdate: MarkerStatistics, toAdd: MarkerStatistics): void;
	private _updateStatsPlus(toUpdate: MarkerStatistics, toAdd?: MarkerStatistics): void {
		if (!toAdd) {
			toAdd = toUpdate;
			toUpdate = this._stats;
		}
		toUpdate.errors += toAdd.errors;
		toUpdate.warnings += toAdd.warnings;
		toUpdate.infos += toAdd.infos;
		toUpdate.unknowns += toAdd.unknowns;
	}

	private _updateStatsMinus(toSubtract: MarkerStatistics): void;
	private _updateStatsMinus(toUpdate: MarkerStatistics, toSubtract: MarkerStatistics): void;
	private _updateStatsMinus(toUpdate: MarkerStatistics, toSubtract?: MarkerStatistics): void {
		if (!toSubtract) {
			toSubtract = toUpdate;
			toUpdate = this._stats;
		}
		toUpdate.errors -= toSubtract.errors;
		toUpdate.warnings -= toSubtract.warnings;
		toUpdate.infos -= toSubtract.infos;
		toUpdate.unknowns -= toSubtract.unknowns;
	}

	private _updateStatsMarker(toUpdate: MarkerStatistics, marker: IMarkerData): void {
		switch (marker.severity) {
			case Severity.Error:
				toUpdate.errors++;
				break;
			case Severity.Warning:
				toUpdate.warnings++;
				break;
			case Severity.Info:
				toUpdate.infos++;
				break;
			default:
				toUpdate.unknowns++;
				break;
		}
	}

	private static _sanitize(data: IMarkerData): boolean {
		if (!data.message) {
			return false;
		}

		data.code = data.code || null;
		data.startLineNumber = data.startLineNumber > 0 ? data.startLineNumber : 1;
		data.startColumn = data.startColumn > 0 ? data.startColumn : 1;
		data.endLineNumber = data.endLineNumber >= data.startLineNumber ? data.endLineNumber : data.startLineNumber;
		data.endColumn = data.endColumn > 0 ? data.endColumn : data.startColumn;
		return true;
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
