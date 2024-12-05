/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { binarySearch } from '../../../../base/common/arrays.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { LinkedList } from '../../../../base/common/linkedList.js';
import { compare } from '../../../../base/common/strings.js';
import { URI } from '../../../../base/common/uri.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { ITextModel } from '../../../common/model.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IMarker, IMarkerService, MarkerSeverity } from '../../../../platform/markers/common/markers.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';

export class MarkerCoordinate {
	constructor(
		readonly marker: IMarker,
		readonly index: number,
		readonly total: number
	) { }
}

export class MarkerList {

	private readonly _onDidChange = new Emitter<void>();
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private readonly _resourceFilter?: (uri: URI) => boolean;
	private readonly _dispoables = new DisposableStore();

	private _markers: IMarker[] = [];
	private _nextIdx: number = -1;

	constructor(
		resourceFilter: URI | ((uri: URI) => boolean) | undefined,
		@IMarkerService private readonly _markerService: IMarkerService,
		@IConfigurationService private readonly _configService: IConfigurationService,
	) {
		if (URI.isUri(resourceFilter)) {
			this._resourceFilter = uri => uri.toString() === resourceFilter.toString();
		} else if (resourceFilter) {
			this._resourceFilter = resourceFilter;
		}

		const compareOrder = this._configService.getValue<string>('problems.sortOrder');
		const compareMarker = (a: IMarker, b: IMarker): number => {
			let res = compare(a.resource.toString(), b.resource.toString());
			if (res === 0) {
				if (compareOrder === 'position') {
					res = Range.compareRangesUsingStarts(a, b) || MarkerSeverity.compare(a.severity, b.severity);
				} else {
					res = MarkerSeverity.compare(a.severity, b.severity) || Range.compareRangesUsingStarts(a, b);
				}
			}
			return res;
		};

		const updateMarker = () => {
			this._markers = this._markerService.read({
				resource: URI.isUri(resourceFilter) ? resourceFilter : undefined,
				severities: MarkerSeverity.Error | MarkerSeverity.Warning | MarkerSeverity.Info
			});
			if (typeof resourceFilter === 'function') {
				this._markers = this._markers.filter(m => this._resourceFilter!(m.resource));
			}
			this._markers.sort(compareMarker);
		};

		updateMarker();

		this._dispoables.add(_markerService.onMarkerChanged(uris => {
			if (!this._resourceFilter || uris.some(uri => this._resourceFilter!(uri))) {
				updateMarker();
				this._nextIdx = -1;
				this._onDidChange.fire();
			}
		}));
	}

	dispose(): void {
		this._dispoables.dispose();
		this._onDidChange.dispose();
	}

	matches(uri: URI | undefined) {
		if (!this._resourceFilter && !uri) {
			return true;
		}
		if (!this._resourceFilter || !uri) {
			return false;
		}
		return this._resourceFilter(uri);
	}

	get selected(): MarkerCoordinate | undefined {
		const marker = this._markers[this._nextIdx];
		return marker && new MarkerCoordinate(marker, this._nextIdx + 1, this._markers.length);
	}

	private _initIdx(model: ITextModel, position: Position, fwd: boolean): void {
		let found = false;

		let idx = this._markers.findIndex(marker => marker.resource.toString() === model.uri.toString());
		if (idx < 0) {
			idx = binarySearch(this._markers, <any>{ resource: model.uri }, (a, b) => compare(a.resource.toString(), b.resource.toString()));
			if (idx < 0) {
				idx = ~idx;
			}
		}

		for (let i = idx; i < this._markers.length; i++) {
			let range = Range.lift(this._markers[i]);

			if (range.isEmpty()) {
				const word = model.getWordAtPosition(range.getStartPosition());
				if (word) {
					range = new Range(range.startLineNumber, word.startColumn, range.startLineNumber, word.endColumn);
				}
			}

			if (position && (range.containsPosition(position) || position.isBeforeOrEqual(range.getStartPosition()))) {
				this._nextIdx = i;
				found = true;
				break;
			}

			if (this._markers[i].resource.toString() !== model.uri.toString()) {
				break;
			}
		}

		if (!found) {
			// after the last change
			this._nextIdx = fwd ? 0 : this._markers.length - 1;
		}
		if (this._nextIdx < 0) {
			this._nextIdx = this._markers.length - 1;
		}
	}

	resetIndex() {
		this._nextIdx = -1;
	}

	move(fwd: boolean, model: ITextModel, position: Position): boolean {
		if (this._markers.length === 0) {
			return false;
		}

		const oldIdx = this._nextIdx;
		if (this._nextIdx === -1) {
			this._initIdx(model, position, fwd);
		} else if (fwd) {
			this._nextIdx = (this._nextIdx + 1) % this._markers.length;
		} else if (!fwd) {
			this._nextIdx = (this._nextIdx - 1 + this._markers.length) % this._markers.length;
		}

		if (oldIdx !== this._nextIdx) {
			return true;
		}
		return false;
	}

	find(uri: URI, position: Position): MarkerCoordinate | undefined {
		let idx = this._markers.findIndex(marker => marker.resource.toString() === uri.toString());
		if (idx < 0) {
			return undefined;
		}
		for (; idx < this._markers.length; idx++) {
			if (Range.containsPosition(this._markers[idx], position)) {
				return new MarkerCoordinate(this._markers[idx], idx + 1, this._markers.length);
			}
		}
		return undefined;
	}
}

export const IMarkerNavigationService = createDecorator<IMarkerNavigationService>('IMarkerNavigationService');

export interface IMarkerNavigationService {
	readonly _serviceBrand: undefined;
	registerProvider(provider: IMarkerListProvider): IDisposable;
	getMarkerList(resource: URI | undefined): MarkerList;
}

export interface IMarkerListProvider {
	getMarkerList(resource: URI | undefined): MarkerList | undefined;
}

class MarkerNavigationService implements IMarkerNavigationService, IMarkerListProvider {

	readonly _serviceBrand: undefined;

	private readonly _provider = new LinkedList<IMarkerListProvider>();

	constructor(
		@IMarkerService private readonly _markerService: IMarkerService,
		@IConfigurationService private readonly _configService: IConfigurationService,
	) { }

	registerProvider(provider: IMarkerListProvider): IDisposable {
		const remove = this._provider.unshift(provider);
		return toDisposable(() => remove());
	}

	getMarkerList(resource: URI | undefined): MarkerList {
		for (const provider of this._provider) {
			const result = provider.getMarkerList(resource);
			if (result) {
				return result;
			}
		}
		// default
		return new MarkerList(resource, this._markerService, this._configService);
	}
}

registerSingleton(IMarkerNavigationService, MarkerNavigationService, InstantiationType.Delayed);
