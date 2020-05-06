/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMarkerService, MarkerSeverity, IMarker } from 'vs/platform/markers/common/markers';
import { URI } from 'vs/base/common/uri';
import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { compare } from 'vs/base/common/strings';
import { binarySearch } from 'vs/base/common/arrays';
import { ITextModel } from 'vs/editor/common/model';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

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

	private readonly _dispoables = new DisposableStore();

	private _markers: IMarker[] = [];
	private _nextIdx: number = -1;

	constructor(
		private readonly _scope: URI | undefined,
		@IMarkerService private readonly _markerService: IMarkerService,
	) {

		const filter = { resource: this._scope, severities: MarkerSeverity.Error | MarkerSeverity.Warning | MarkerSeverity.Info };
		this._markers = this._markerService.read(filter).sort(MarkerList._compareMarker);

		this._dispoables.add(_markerService.onMarkerChanged(e => {
			if (!this._scope || e.some(e => e.toString() === _scope?.toString())) {
				this._markers = this._markerService.read(filter).sort(MarkerList._compareMarker);
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
		if (this._scope === uri) {
			return true;
		}
		if (this._scope && uri && this._scope.toString() === uri.toString()) {
			return true;
		}
		return false;
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

		let oldIdx = this._nextIdx;
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

	private static _compareMarker(a: IMarker, b: IMarker): number {
		let res = compare(a.resource.toString(), b.resource.toString());
		if (res === 0) {
			res = MarkerSeverity.compare(a.severity, b.severity);
		}
		if (res === 0) {
			res = Range.compareRangesUsingStarts(a, b);
		}
		return res;
	}
}

export const IMarkerNavigationService = createDecorator<IMarkerNavigationService>('IMarkerNavigationService');

export interface IMarkerNavigationService {
	readonly _serviceBrand: undefined;
	getMarkerList(resource: URI | undefined): MarkerList;
}

class MarkerNavigationService implements IMarkerNavigationService {

	readonly _serviceBrand: undefined;

	constructor(@IMarkerService private readonly _markerService: IMarkerService) { }

	getMarkerList(resource: URI | undefined) {
		return new MarkerList(resource, this._markerService);
	}
}

registerSingleton(IMarkerNavigationService, MarkerNavigationService, true);
