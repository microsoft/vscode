/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMarkerService, IMarker, MarkerSeverity, MarkerTag } from 'vs/platform/markers/common/markers';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IModelDeltaDecoration, ITextModel, IModelDecorationOptions, TrackedRangeStickiness, OverviewRulerLane, IModelDecoration, MinimapPosition, IModelDecorationMinimapOptions } from 'vs/editor/common/model';
import { ClassName } from 'vs/editor/common/model/intervalTree';
import { themeColorFromId } from 'vs/platform/theme/common/themeService';
import { ThemeColor } from 'vs/base/common/themables';
import { overviewRulerWarning, overviewRulerInfo, overviewRulerError } from 'vs/editor/common/core/editorColorRegistry';
import { IModelService } from 'vs/editor/common/services/model';
import { Range } from 'vs/editor/common/core/range';
import { IMarkerDecorationsService } from 'vs/editor/common/services/markerDecorations';
import { Schemas } from 'vs/base/common/network';
import { Emitter, Event } from 'vs/base/common/event';
import { minimapWarning, minimapError } from 'vs/platform/theme/common/colorRegistry';
import { BidirectionalMap, ResourceMap } from 'vs/base/common/map';
import { diffSets } from 'vs/base/common/collections';

export class MarkerDecorationsService extends Disposable implements IMarkerDecorationsService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeMarker = this._register(new Emitter<ITextModel>());
	readonly onDidChangeMarker: Event<ITextModel> = this._onDidChangeMarker.event;

	private readonly _markerDecorations = new ResourceMap<MarkerDecorations>();

	constructor(
		@IModelService modelService: IModelService,
		@IMarkerService private readonly _markerService: IMarkerService
	) {
		super();
		modelService.getModels().forEach(model => this._onModelAdded(model));
		this._register(modelService.onModelAdded(this._onModelAdded, this));
		this._register(modelService.onModelRemoved(this._onModelRemoved, this));
		this._register(this._markerService.onMarkerChanged(this._handleMarkerChange, this));
	}

	override dispose() {
		super.dispose();
		this._markerDecorations.forEach(value => value.dispose());
		this._markerDecorations.clear();
	}

	getMarker(uri: URI, decoration: IModelDecoration): IMarker | null {
		const markerDecorations = this._markerDecorations.get(uri);
		return markerDecorations ? (markerDecorations.getMarker(decoration) || null) : null;
	}

	getLiveMarkers(uri: URI): [Range, IMarker][] {
		const markerDecorations = this._markerDecorations.get(uri);
		return markerDecorations ? markerDecorations.getMarkers() : [];
	}

	private _handleMarkerChange(changedResources: readonly URI[]): void {
		changedResources.forEach((resource) => {
			const markerDecorations = this._markerDecorations.get(resource);
			if (markerDecorations) {
				this._updateDecorations(markerDecorations);
			}
		});
	}

	private _onModelAdded(model: ITextModel): void {
		const markerDecorations = new MarkerDecorations(model);
		this._markerDecorations.set(model.uri, markerDecorations);
		this._updateDecorations(markerDecorations);
	}

	private _onModelRemoved(model: ITextModel): void {
		const markerDecorations = this._markerDecorations.get(model.uri);
		if (markerDecorations) {
			markerDecorations.dispose();
			this._markerDecorations.delete(model.uri);
		}

		// clean up markers for internal, transient models
		if (model.uri.scheme === Schemas.inMemory
			|| model.uri.scheme === Schemas.internal
			|| model.uri.scheme === Schemas.vscode) {
			this._markerService?.read({ resource: model.uri }).map(marker => marker.owner).forEach(owner => this._markerService.remove(owner, [model.uri]));
		}
	}

	private _updateDecorations(markerDecorations: MarkerDecorations): void {
		// Limit to the first 500 errors/warnings
		const markers = this._markerService.read({ resource: markerDecorations.model.uri, take: 500 });
		if (markerDecorations.update(markers)) {
			this._onDidChangeMarker.fire(markerDecorations.model);
		}
	}
}

class MarkerDecorations extends Disposable {

	private readonly _map = new BidirectionalMap<IMarker, /*decoration id*/string>();

	constructor(
		readonly model: ITextModel
	) {
		super();
		this._register(toDisposable(() => {
			this.model.deltaDecorations([...this._map.values()], []);
			this._map.clear();
		}));
	}

	public update(markers: IMarker[]): boolean {

		// We use the fact that marker instances are not recreated when different owners
		// update. So we can compare references to find out what changed since the last update.

		const { added, removed } = diffSets(new Set(this._map.keys()), new Set(markers));

		if (added.length === 0 && removed.length === 0) {
			return false;
		}

		const oldIds: string[] = removed.map(marker => this._map.get(marker)!);
		const newDecorations: IModelDeltaDecoration[] = added.map(marker => {
			return {
				range: this._createDecorationRange(this.model, marker),
				options: this._createDecorationOption(marker)
			};
		});

		const ids = this.model.deltaDecorations(oldIds, newDecorations);
		for (const removedMarker of removed) {
			this._map.delete(removedMarker);
		}
		for (let index = 0; index < ids.length; index++) {
			this._map.set(added[index], ids[index]);
		}
		return true;
	}

	getMarker(decoration: IModelDecoration): IMarker | undefined {
		return this._map.getKey(decoration.id);
	}

	getMarkers(): [Range, IMarker][] {
		const res: [Range, IMarker][] = [];
		this._map.forEach((id, marker) => {
			const range = this.model.getDecorationRange(id);
			if (range) {
				res.push([range, marker]);
			}
		});
		return res;
	}

	private _createDecorationRange(model: ITextModel, rawMarker: IMarker): Range {

		let ret = Range.lift(rawMarker);

		if (rawMarker.severity === MarkerSeverity.Hint && !this._hasMarkerTag(rawMarker, MarkerTag.Unnecessary) && !this._hasMarkerTag(rawMarker, MarkerTag.Deprecated)) {
			// * never render hints on multiple lines
			// * make enough space for three dots
			ret = ret.setEndPosition(ret.startLineNumber, ret.startColumn + 2);
		}

		ret = model.validateRange(ret);

		if (ret.isEmpty()) {
			const maxColumn = model.getLineLastNonWhitespaceColumn(ret.startLineNumber) ||
				model.getLineMaxColumn(ret.startLineNumber);

			if (maxColumn === 1 || ret.endColumn >= maxColumn) {
				// empty line or behind eol
				// keep the range as is, it will be rendered 1ch wide
				return ret;
			}

			const word = model.getWordAtPosition(ret.getStartPosition());
			if (word) {
				ret = new Range(ret.startLineNumber, word.startColumn, ret.endLineNumber, word.endColumn);
			}
		} else if (rawMarker.endColumn === Number.MAX_VALUE && rawMarker.startColumn === 1 && ret.startLineNumber === ret.endLineNumber) {
			const minColumn = model.getLineFirstNonWhitespaceColumn(rawMarker.startLineNumber);
			if (minColumn < ret.endColumn) {
				ret = new Range(ret.startLineNumber, minColumn, ret.endLineNumber, ret.endColumn);
				rawMarker.startColumn = minColumn;
			}
		}
		return ret;
	}

	private _createDecorationOption(marker: IMarker): IModelDecorationOptions {

		let className: string | undefined;
		let color: ThemeColor | undefined = undefined;
		let zIndex: number;
		let inlineClassName: string | undefined = undefined;
		let minimap: IModelDecorationMinimapOptions | undefined;

		switch (marker.severity) {
			case MarkerSeverity.Hint:
				if (this._hasMarkerTag(marker, MarkerTag.Deprecated)) {
					className = undefined;
				} else if (this._hasMarkerTag(marker, MarkerTag.Unnecessary)) {
					className = ClassName.EditorUnnecessaryDecoration;
				} else {
					className = ClassName.EditorHintDecoration;
				}
				zIndex = 0;
				break;
			case MarkerSeverity.Warning:
				className = ClassName.EditorWarningDecoration;
				color = themeColorFromId(overviewRulerWarning);
				zIndex = 20;
				minimap = {
					color: themeColorFromId(minimapWarning),
					position: MinimapPosition.Inline
				};
				break;
			case MarkerSeverity.Info:
				className = ClassName.EditorInfoDecoration;
				color = themeColorFromId(overviewRulerInfo);
				zIndex = 10;
				break;
			case MarkerSeverity.Error:
			default:
				className = ClassName.EditorErrorDecoration;
				color = themeColorFromId(overviewRulerError);
				zIndex = 30;
				minimap = {
					color: themeColorFromId(minimapError),
					position: MinimapPosition.Inline
				};
				break;
		}

		if (marker.tags) {
			if (marker.tags.indexOf(MarkerTag.Unnecessary) !== -1) {
				inlineClassName = ClassName.EditorUnnecessaryInlineDecoration;
			}
			if (marker.tags.indexOf(MarkerTag.Deprecated) !== -1) {
				inlineClassName = ClassName.EditorDeprecatedInlineDecoration;
			}
		}

		return {
			description: 'marker-decoration',
			stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
			className,
			showIfCollapsed: true,
			overviewRuler: {
				color,
				position: OverviewRulerLane.Right
			},
			minimap,
			zIndex,
			inlineClassName,
		};
	}

	private _hasMarkerTag(marker: IMarker, tag: MarkerTag): boolean {
		if (marker.tags) {
			return marker.tags.indexOf(tag) >= 0;
		}
		return false;
	}
}
