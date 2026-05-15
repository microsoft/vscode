/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isFalsyOrEmpty, isNonEmptyArray } from '../../../base/common/arrays.js';
import { MicrotaskEmitter } from '../../../base/common/event.js';
import { Iterable } from '../../../base/common/iterator.js';
import { IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../base/common/map.js';
import { Schemas } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { IMarker, IMarkerData, IMarkerReadOptions, IMarkerService, IResourceMarker, MarkerSeverity, MarkerStatistics } from './markers.js';

export const unsupportedSchemas = new Set([
	Schemas.inMemory,
	Schemas.vscodeSourceControl,
	Schemas.walkThrough,
	Schemas.walkThroughSnippet,
	Schemas.vscodeChatCodeBlock,
	Schemas.vscodeTerminal
]);

class DoubleResourceMap<V> {

	private _byResource = new ResourceMap<Map<string, V>>();
	private _byOwner = new Map<string, ResourceMap<V>>();

	set(resource: URI, owner: string, value: V) {
		let ownerMap = this._byResource.get(resource);
		if (!ownerMap) {
			ownerMap = new Map();
			this._byResource.set(resource, ownerMap);
		}
		ownerMap.set(owner, value);

		let resourceMap = this._byOwner.get(owner);
		if (!resourceMap) {
			resourceMap = new ResourceMap();
			this._byOwner.set(owner, resourceMap);
		}
		resourceMap.set(resource, value);
	}

	get(resource: URI, owner: string): V | undefined {
		const ownerMap = this._byResource.get(resource);
		return ownerMap?.get(owner);
	}

	delete(resource: URI, owner: string): boolean {
		let removedA = false;
		let removedB = false;
		const ownerMap = this._byResource.get(resource);
		if (ownerMap) {
			removedA = ownerMap.delete(owner);
		}
		const resourceMap = this._byOwner.get(owner);
		if (resourceMap) {
			removedB = resourceMap.delete(resource);
		}
		if (removedA !== removedB) {
			throw new Error('illegal state');
		}
		return removedA && removedB;
	}

	values(key?: URI | string): Iterable<V> {
		if (typeof key === 'string') {
			return this._byOwner.get(key)?.values() ?? Iterable.empty();
		}
		if (URI.isUri(key)) {
			return this._byResource.get(key)?.values() ?? Iterable.empty();
		}

		return Iterable.map(Iterable.concat(...this._byOwner.values()), map => map[1]);
	}
}

class MarkerStats implements MarkerStatistics {

	errors: number = 0;
	infos: number = 0;
	warnings: number = 0;
	unknowns: number = 0;

	private readonly _data = new ResourceMap<MarkerStatistics>();
	private readonly _service: IMarkerService;
	private readonly _subscription: IDisposable;

	constructor(service: IMarkerService) {
		this._service = service;
		this._subscription = service.onMarkerChanged(this._update, this);
	}

	dispose(): void {
		this._subscription.dispose();
	}

	private _update(resources: readonly URI[]): void {
		for (const resource of resources) {
			const oldStats = this._data.get(resource);
			if (oldStats) {
				this._substract(oldStats);
			}
			const newStats = this._resourceStats(resource);
			this._add(newStats);
			this._data.set(resource, newStats);
		}
	}

	private _resourceStats(resource: URI): MarkerStatistics {
		const result: MarkerStatistics = { errors: 0, warnings: 0, infos: 0, unknowns: 0 };

		// TODO this is a hack
		if (unsupportedSchemas.has(resource.scheme)) {
			return result;
		}

		for (const { severity } of this._service.read({ resource })) {
			if (severity === MarkerSeverity.Error) {
				result.errors += 1;
			} else if (severity === MarkerSeverity.Warning) {
				result.warnings += 1;
			} else if (severity === MarkerSeverity.Info) {
				result.infos += 1;
			} else {
				result.unknowns += 1;
			}
		}

		return result;
	}

	private _substract(op: MarkerStatistics) {
		this.errors -= op.errors;
		this.warnings -= op.warnings;
		this.infos -= op.infos;
		this.unknowns -= op.unknowns;
	}

	private _add(op: MarkerStatistics) {
		this.errors += op.errors;
		this.warnings += op.warnings;
		this.infos += op.infos;
		this.unknowns += op.unknowns;
	}
}

export class MarkerService implements IMarkerService {

	declare readonly _serviceBrand: undefined;

	private readonly _onMarkerChanged = new MicrotaskEmitter<readonly URI[]>({
		merge: MarkerService._merge
	});

	readonly onMarkerChanged = this._onMarkerChanged.event;

	private readonly _data = new DoubleResourceMap<IMarker[]>();
	private readonly _stats = new MarkerStats(this);
	private readonly _filteredResources = new ResourceMap<string[]>();

	dispose(): void {
		this._stats.dispose();
		this._onMarkerChanged.dispose();
	}

	getStatistics(): MarkerStatistics {
		return this._stats;
	}

	remove(owner: string, resources: URI[]): void {
		for (const resource of resources || []) {
			this.changeOne(owner, resource, []);
		}
	}

	changeOne(owner: string, resource: URI, markerData: IMarkerData[]): void {

		if (isFalsyOrEmpty(markerData)) {
			// remove marker for this (owner,resource)-tuple
			const removed = this._data.delete(resource, owner);
			if (removed) {
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
			this._data.set(resource, owner, markers);
			this._onMarkerChanged.fire([resource]);
		}
	}

	installResourceFilter(resource: URI, reason: string): IDisposable {
		let reasons = this._filteredResources.get(resource);

		if (!reasons) {
			reasons = [];
			this._filteredResources.set(resource, reasons);
		}
		reasons.push(reason);
		this._onMarkerChanged.fire([resource]);

		return toDisposable(() => {
			const reasons = this._filteredResources.get(resource);
			if (!reasons) {
				return;
			}
			const reasonIndex = reasons.indexOf(reason);
			if (reasonIndex !== -1) {
				reasons.splice(reasonIndex, 1);
				if (reasons.length === 0) {
					this._filteredResources.delete(resource);
				}
				this._onMarkerChanged.fire([resource]);
			}
		});
	}

	private static _toMarker(owner: string, resource: URI, data: IMarkerData): IMarker | undefined {
		let {
			code, severity,
			message, source,
			startLineNumber, startColumn, endLineNumber, endColumn,
			relatedInformation,
			modelVersionId,
			tags, origin
		} = data;

		if (!message) {
			return undefined;
		}

		// santize data
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
			endColumn,
			relatedInformation,
			modelVersionId,
			tags,
			origin
		};
	}

	changeAll(owner: string, data: IResourceMarker[]): void {
		const changes: URI[] = [];

		// remove old marker
		const existing = this._data.values(owner);
		if (existing) {
			for (const data of existing) {
				const first = Iterable.first(data);
				if (first) {
					changes.push(first.resource);
					this._data.delete(first.resource, owner);
				}
			}
		}

		// add new markers
		if (isNonEmptyArray(data)) {

			// group by resource
			const groups = new ResourceMap<IMarker[]>();
			for (const { resource, marker: markerData } of data) {
				const marker = MarkerService._toMarker(owner, resource, markerData);
				if (!marker) {
					// filter bad markers
					continue;
				}
				const array = groups.get(resource);
				if (!array) {
					groups.set(resource, [marker]);
					changes.push(resource);
				} else {
					array.push(marker);
				}
			}

			// insert all
			for (const [resource, value] of groups) {
				this._data.set(resource, owner, value);
			}
		}

		if (changes.length > 0) {
			this._onMarkerChanged.fire(changes);
		}
	}

	/**
	 * Creates an information marker for filtered resources
	 */
	private _createFilteredMarker(resource: URI, reasons: string[]): IMarker {
		const message = reasons.length === 1
			? localize('filtered', "Problems are paused because: \"{0}\"", reasons[0])
			: localize('filtered.network', "Problems are paused because: \"{0}\" and {1} more", reasons[0], reasons.length - 1);

		return {
			owner: 'markersFilter',
			resource,
			severity: MarkerSeverity.Info,
			message,
			startLineNumber: 1,
			startColumn: 1,
			endLineNumber: 1,
			endColumn: 1,
		};
	}

	read(filter: IMarkerReadOptions = Object.create(null)): IMarker[] {

		let { owner, resource, severities, take } = filter;

		if (!take || take < 0) {
			take = -1;
		}

		if (owner && resource) {
			// exactly one owner AND resource
			const reasons = !filter.ignoreResourceFilters ? this._filteredResources.get(resource) : undefined;
			if (reasons?.length) {
				const infoMarker = this._createFilteredMarker(resource, reasons);
				return [infoMarker];
			}

			const data = this._data.get(resource, owner);
			if (!data) {
				return [];
			}

			const result: IMarker[] = [];
			for (const marker of data) {
				if (take > 0 && result.length === take) {
					break;
				}
				const reasons = !filter.ignoreResourceFilters ? this._filteredResources.get(resource) : undefined;
				if (reasons?.length) {
					result.push(this._createFilteredMarker(resource, reasons));

				} else if (MarkerService._accept(marker, severities)) {
					result.push(marker);
				}
			}
			return result;

		} else {
			// of one resource OR owner
			const iterable = !owner && !resource
				? this._data.values()
				: this._data.values(resource ?? owner!);

			const result: IMarker[] = [];
			const filtered = new ResourceSet();

			for (const markers of iterable) {
				for (const data of markers) {
					if (filtered.has(data.resource)) {
						continue;
					}
					if (take > 0 && result.length === take) {
						break;
					}
					const reasons = !filter.ignoreResourceFilters ? this._filteredResources.get(data.resource) : undefined;
					if (reasons?.length) {
						result.push(this._createFilteredMarker(data.resource, reasons));
						filtered.add(data.resource);

					} else if (MarkerService._accept(data, severities)) {
						result.push(data);
					}
				}
			}
			return result;
		}
	}

	private static _accept(marker: IMarker, severities?: number): boolean {
		return severities === undefined || (severities & marker.severity) === marker.severity;
	}

	// --- event debounce logic

	private static _merge(all: (readonly URI[])[]): URI[] {
		const set = new ResourceMap<boolean>();
		for (const array of all) {
			for (const item of array) {
				set.set(item, true);
			}
		}
		return Array.from(set.keys());
	}
}
