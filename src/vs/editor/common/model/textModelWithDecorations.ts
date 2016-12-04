/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { onUnexpectedError } from 'vs/base/common/errors';
import { MarkedString, markedStringsEquals } from 'vs/base/common/htmlContent';
import * as strings from 'vs/base/common/strings';
import { IdGenerator } from 'vs/base/common/idGenerator';
import { Range } from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { ChangedMarkers } from 'vs/editor/common/model/modelLine';
import { Position } from 'vs/editor/common/core/position';
import { INewMarker, TextModelWithMarkers } from 'vs/editor/common/model/textModelWithMarkers';

export class DeferredEventsBuilder {

	public changedMarkers: ChangedMarkers;

	public newOrChangedDecorations: { [decorationId: string]: ExternalDecoration; };
	public removedDecorations: { [decorationId: string]: boolean; };

	constructor() {
		this.changedMarkers = new ChangedMarkers();
		this.newOrChangedDecorations = {};
		this.removedDecorations = {};
	}

	// --- Build decoration events

	public addNewDecoration(decoration: ExternalDecoration): void {
		this.newOrChangedDecorations[decoration.id] = decoration;
	}

	public addRemovedDecoration(id: string): void {
		if (this.newOrChangedDecorations.hasOwnProperty(id)) {
			delete this.newOrChangedDecorations[id];
		}
		this.removedDecorations[id] = true;
	}

	public addMovedDecoration(decoration: ExternalDecoration): void {
		this.newOrChangedDecorations[decoration.id] = decoration;
	}

	public addUpdatedDecoration(decoration: ExternalDecoration): void {
		this.newOrChangedDecorations[decoration.id] = decoration;
	}
}

export class InternalDecoration {
	_internalDecorationBrand: void;

	public readonly id: string;
	public readonly ownerId: number;
	public readonly startMarkerId: string;
	public readonly endMarkerId: string;
	public options: ModelDecorationOptions;
	public isForValidation: boolean;

	constructor(id: string, ownerId: number, startMarkerId: string, endMarkerId: string, options: ModelDecorationOptions) {
		this.id = id;
		this.ownerId = ownerId;
		this.startMarkerId = startMarkerId;
		this.endMarkerId = endMarkerId;
		this.setOptions(options);
	}

	public setOptions(options: ModelDecorationOptions) {
		this.options = options;
		this.isForValidation = (
			this.options.className === editorCommon.ClassName.EditorErrorDecoration
			|| this.options.className === editorCommon.ClassName.EditorWarningDecoration
		);
	}

	public toExternalDecoration(range: Range): ExternalDecoration {
		return new ExternalDecoration(this, range);
	}
}

export class ExternalDecoration implements editorCommon.IModelDecoration {
	_externalDecorationBrand: void;

	public readonly id: string;
	public readonly ownerId: number;
	public readonly range: Range;
	public readonly options: ModelDecorationOptions;
	public readonly isForValidation: boolean;

	constructor(source: InternalDecoration, range: Range) {
		this.id = source.id;
		this.ownerId = source.ownerId;
		this.range = range;
		this.options = source.options;
		this.isForValidation = source.isForValidation;
	}
}

interface IOldDecoration {
	range: Range;
	options: ModelDecorationOptions;
	id: string;
}

let _INSTANCE_COUNT = 0;

export class TextModelWithDecorations extends TextModelWithMarkers implements editorCommon.ITextModelWithDecorations {

	private _currentDeferredEvents: DeferredEventsBuilder;
	private _decorationIdGenerator: IdGenerator;
	private _decorations: { [decorationId: string]: InternalDecoration; };
	private _multiLineDecorationsMap: { [key: string]: InternalDecoration; };

	constructor(allowedEventTypes: string[], rawText: editorCommon.IRawText, languageId: string) {
		allowedEventTypes.push(editorCommon.EventType.ModelDecorationsChanged);
		super(allowedEventTypes, rawText, languageId);

		// Initialize decorations
		this._currentDeferredEvents = null;
		this._decorationIdGenerator = new IdGenerator((++_INSTANCE_COUNT) + ';');
		this._decorations = {};
		this._multiLineDecorationsMap = {};
	}

	public dispose(): void {
		this._decorations = null;
		this._multiLineDecorationsMap = null;
		super.dispose();
	}

	protected _resetValue(newValue: editorCommon.IRawText): void {
		super._resetValue(newValue);

		// Destroy all my decorations
		this._decorations = {};
		this._multiLineDecorationsMap = {};
	}

	private _setDecorationIsMultiLine(decoration: InternalDecoration, isMultiLine: boolean): void {
		let rangeWasMultiLine = this._multiLineDecorationsMap.hasOwnProperty(decoration.id);
		if (!rangeWasMultiLine && isMultiLine) {
			this._multiLineDecorationsMap[decoration.id] = decoration;
		} else if (rangeWasMultiLine && !isMultiLine) {
			delete this._multiLineDecorationsMap[decoration.id];
		}
	}

	private static _shouldStartMarkerSticksToPreviousCharacter(stickiness: editorCommon.TrackedRangeStickiness): boolean {
		if (stickiness === editorCommon.TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges || stickiness === editorCommon.TrackedRangeStickiness.GrowsOnlyWhenTypingBefore) {
			return true;
		}
		return false;
	}

	private static _shouldEndMarkerSticksToPreviousCharacter(stickiness: editorCommon.TrackedRangeStickiness): boolean {
		if (stickiness === editorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges || stickiness === editorCommon.TrackedRangeStickiness.GrowsOnlyWhenTypingBefore) {
			return true;
		}
		return false;
	}

	_getTrackedRangesCount(): number {
		return Object.keys(this._decorations).length;
	}

	private static _createRangeFromMarkers(startPosition: Position, endPosition: Position): Range {
		if (endPosition.isBefore(startPosition)) {
			// This tracked range has turned in on itself (end marker before start marker)
			// This can happen in extreme editing conditions where lots of text is removed and lots is added

			// Treat it as a collapsed range
			return new Range(startPosition.lineNumber, startPosition.column, startPosition.lineNumber, startPosition.column);
		}
		return new Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column);
	}

	// --- END TrackedRanges

	public changeDecorations<T>(callback: (changeAccessor: editorCommon.IModelDecorationsChangeAccessor) => T, ownerId: number = 0): T {
		this._assertNotDisposed();
		return this._withDeferredEvents((deferredEventsBuilder: DeferredEventsBuilder) => {
			let changeAccessor: editorCommon.IModelDecorationsChangeAccessor = {
				addDecoration: (range: editorCommon.IRange, options: editorCommon.IModelDecorationOptions): string => {
					return this._addDecorationImpl(deferredEventsBuilder, ownerId, this.validateRange(range), _normalizeOptions(options));
				},
				changeDecoration: (id: string, newRange: editorCommon.IRange): void => {
					this._changeDecorationImpl(deferredEventsBuilder, id, this.validateRange(newRange));
				},
				changeDecorationOptions: (id: string, options: editorCommon.IModelDecorationOptions) => {
					this._changeDecorationOptionsImpl(deferredEventsBuilder, id, _normalizeOptions(options));
				},
				removeDecoration: (id: string): void => {
					this._removeDecorationImpl(deferredEventsBuilder, id);
				},
				deltaDecorations: (oldDecorations: string[], newDecorations: editorCommon.IModelDeltaDecoration[]): string[] => {
					return this._deltaDecorationsImpl(deferredEventsBuilder, ownerId, oldDecorations, this._normalizeDeltaDecorations(newDecorations));
				}
			};
			let result: T = null;
			try {
				result = callback(changeAccessor);
			} catch (e) {
				onUnexpectedError(e);
			}
			// Invalidate change accessor
			changeAccessor.addDecoration = null;
			changeAccessor.changeDecoration = null;
			changeAccessor.removeDecoration = null;
			changeAccessor.deltaDecorations = null;
			return result;
		});
	}

	public deltaDecorations(oldDecorations: string[], newDecorations: editorCommon.IModelDeltaDecoration[], ownerId: number = 0): string[] {
		this._assertNotDisposed();
		if (!oldDecorations) {
			oldDecorations = [];
		}
		return this.changeDecorations((changeAccessor) => {
			return changeAccessor.deltaDecorations(oldDecorations, newDecorations);
		}, ownerId);
	}

	public removeAllDecorationsWithOwnerId(ownerId: number): void {
		let toRemove: string[] = [];

		let keys = Object.keys(this._decorations);
		for (let i = 0, len = keys.length; i < len; i++) {
			let decorationId = keys[i];
			let decoration = this._decorations[decorationId];

			if (decoration.ownerId === ownerId) {
				toRemove.push(decoration.id);
			}
		}

		this._removeDecorationsImpl(null, toRemove);
	}

	public getDecorationOptions(decorationId: string): editorCommon.IModelDecorationOptions {
		if (this._decorations.hasOwnProperty(decorationId)) {
			return this._decorations[decorationId].options;
		}
		return null;
	}

	private _getDecorationRange(decoration: InternalDecoration): Range {
		let startMarker = this._getMarker(decoration.startMarkerId);
		let endMarker = this._getMarker(decoration.endMarkerId);

		return TextModelWithDecorations._createRangeFromMarkers(startMarker, endMarker);
	}

	public getDecorationRange(decorationId: string): Range {
		if (this._decorations.hasOwnProperty(decorationId)) {
			return this._getDecorationRange(this._decorations[decorationId]);
		}
		return null;
	}

	public getLineDecorations(lineNumber: number, ownerId: number = 0, filterOutValidation: boolean = false): editorCommon.IModelDecoration[] {
		if (lineNumber < 1 || lineNumber > this.getLineCount()) {
			return [];
		}

		return this.getLinesDecorations(lineNumber, lineNumber, ownerId, filterOutValidation);
	}

	/**
	 * Fetch only multi-line decorations that intersect with the given line number range
	 */
	private _getMultiLineDecorations(filterRange: Range, filterOwnerId: number, filterOutValidation: boolean): ExternalDecoration[] {
		const filterStartLineNumber = filterRange.startLineNumber;
		const filterStartColumn = filterRange.startColumn;
		const filterEndLineNumber = filterRange.endLineNumber;
		const filterEndColumn = filterRange.endColumn;

		let result: ExternalDecoration[] = [];

		let multiLineDecorations = Object.keys(this._multiLineDecorationsMap);
		for (let i = 0, len = multiLineDecorations.length; i < len; i++) {
			let decorationId = multiLineDecorations[i];
			let decoration = this._multiLineDecorationsMap[decorationId];

			if (filterOwnerId && decoration.ownerId && decoration.ownerId !== filterOwnerId) {
				continue;
			}

			if (filterOutValidation && decoration.isForValidation) {
				continue;
			}

			let startMarker = this._getMarker(decoration.startMarkerId);
			if (startMarker.lineNumber > filterEndLineNumber) {
				continue;
			}
			if (startMarker.lineNumber === filterStartLineNumber && startMarker.column < filterStartColumn) {
				continue;
			}

			let endMarker = this._getMarker(decoration.endMarkerId);
			if (endMarker.lineNumber < filterStartLineNumber) {
				continue;
			}
			if (endMarker.lineNumber === filterEndLineNumber && endMarker.column > filterEndColumn) {
				continue;
			}

			let range = TextModelWithDecorations._createRangeFromMarkers(startMarker, endMarker);
			result.push(decoration.toExternalDecoration(range));
		}

		return result;
	}

	private _getDecorationsInRange(filterRange: Range, filterOwnerId: number, filterOutValidation: boolean): ExternalDecoration[] {
		const filterStartLineNumber = filterRange.startLineNumber;
		const filterStartColumn = filterRange.startColumn;
		const filterEndLineNumber = filterRange.endLineNumber;
		const filterEndColumn = filterRange.endColumn;

		let result = this._getMultiLineDecorations(filterRange, filterOwnerId, filterOutValidation);
		let resultMap: { [decorationId: string]: boolean; } = {};

		for (let i = 0, len = result.length; i < len; i++) {
			resultMap[result[i].id] = true;
		}

		for (let lineNumber = filterStartLineNumber; lineNumber <= filterEndLineNumber; lineNumber++) {
			let lineMarkers = this._getLineMarkers(lineNumber);
			for (let i = 0, len = lineMarkers.length; i < len; i++) {
				let lineMarker = lineMarkers[i];
				let decorationId = lineMarker.decorationId;

				if (!decorationId) {
					// marker does not belong to any decoration
					continue;
				}

				if (resultMap.hasOwnProperty(decorationId)) {
					// decoration already in result
					continue;
				}

				let decoration = this._decorations[decorationId];

				if (filterOwnerId && decoration.ownerId && decoration.ownerId !== filterOwnerId) {
					continue;
				}

				if (filterOutValidation && decoration.isForValidation) {
					continue;
				}

				let startMarker = (lineMarker.id === decoration.startMarkerId ? lineMarker.getPosition() : this._getMarker(decoration.startMarkerId));
				if (startMarker.lineNumber > filterEndLineNumber) {
					continue;
				}
				if (startMarker.lineNumber === filterStartLineNumber && startMarker.column < filterStartColumn) {
					continue;
				}

				let endMarker = (lineMarker.id === decoration.endMarkerId ? lineMarker.getPosition() : this._getMarker(decoration.endMarkerId));
				if (endMarker.lineNumber < filterStartLineNumber) {
					continue;
				}
				if (endMarker.lineNumber === filterEndLineNumber && endMarker.column > filterEndColumn) {
					continue;
				}

				let range = TextModelWithDecorations._createRangeFromMarkers(startMarker, endMarker);
				result.push(decoration.toExternalDecoration(range));
				resultMap[decoration.id] = true;
			}
		}

		return result;
	}

	public getLinesDecorations(_startLineNumber: number, _endLineNumber: number, ownerId: number = 0, filterOutValidation: boolean = false): editorCommon.IModelDecoration[] {
		let lineCount = this.getLineCount();
		let startLineNumber = Math.min(lineCount, Math.max(1, _startLineNumber));
		let endLineNumber = Math.min(lineCount, Math.max(1, _endLineNumber));
		let endColumn = this.getLineMaxColumn(endLineNumber);
		return this._getDecorationsInRange(new Range(startLineNumber, 1, endLineNumber, endColumn), ownerId, filterOutValidation);
	}

	public getDecorationsInRange(range: editorCommon.IRange, ownerId?: number, filterOutValidation?: boolean): editorCommon.IModelDecoration[] {
		let validatedRange = this.validateRange(range);
		return this._getDecorationsInRange(validatedRange, ownerId, filterOutValidation);
	}

	public getAllDecorations(ownerId: number = 0, filterOutValidation: boolean = false): editorCommon.IModelDecoration[] {
		let result: ExternalDecoration[] = [];

		let decorationIds = Object.keys(this._decorations);
		for (let i = 0, len = decorationIds.length; i < len; i++) {
			let decorationId = decorationIds[i];
			let decoration = this._decorations[decorationId];

			if (ownerId && decoration.ownerId && decoration.ownerId !== ownerId) {
				continue;
			}

			if (filterOutValidation && decoration.isForValidation) {
				continue;
			}

			let range = this._getDecorationRange(decoration);
			result.push(decoration.toExternalDecoration(range));
		}

		return result;
	}

	protected _withDeferredEvents<T>(callback: (deferredEventsBuilder: DeferredEventsBuilder) => T): T {
		return this.deferredEmit(() => {
			let createDeferredEvents = this._currentDeferredEvents ? false : true;
			if (createDeferredEvents) {
				this._currentDeferredEvents = new DeferredEventsBuilder();
			}

			let result: T;
			try {
				result = callback(this._currentDeferredEvents);
				if (createDeferredEvents) {
					this._handleCollectedEvents(this._currentDeferredEvents);
				}
			} finally {
				if (createDeferredEvents) {
					this._currentDeferredEvents = null;
				}
			}

			return result;
		});
	}

	private _handleCollectedEvents(b: DeferredEventsBuilder): void {
		let changedDecorationIds = b.changedMarkers.getDecorationIds();

		for (let i = 0, len = changedDecorationIds.length; i < len; i++) {
			let decorationId = changedDecorationIds[i];
			if (!this._decorations.hasOwnProperty(decorationId)) {
				// perhaps the decoration was removed in the meantime
				continue;
			}

			let decoration = this._decorations[decorationId];
			let startMarker = this._getMarker(decoration.startMarkerId);
			let endMarker = this._getMarker(decoration.endMarkerId);

			this._setDecorationIsMultiLine(
				decoration,
				(startMarker.lineNumber !== endMarker.lineNumber)
			);

			let range = TextModelWithDecorations._createRangeFromMarkers(startMarker, endMarker);
			b.addMovedDecoration(decoration.toExternalDecoration(range));
		}

		let addedOrChangedDecorationIds = Object.keys(b.newOrChangedDecorations);
		let addedOrChangedDecorations: ExternalDecoration[] = [];
		for (let i = 0, len = addedOrChangedDecorationIds.length; i < len; i++) {
			let decorationId = addedOrChangedDecorationIds[i];
			addedOrChangedDecorations[i] = b.newOrChangedDecorations[decorationId];
		}

		let removedDecorations = Object.keys(b.removedDecorations);

		let allDecorationIds = addedOrChangedDecorationIds.concat(removedDecorations);
		if (allDecorationIds.length > 0) {
			var e: editorCommon.IModelDecorationsChangedEvent = {
				ids: allDecorationIds,
				addedOrChangedDecorations: addedOrChangedDecorations,
				removedDecorations: removedDecorations
			};
			this.emitModelDecorationsChangedEvent(e);
		}
	}

	private emitModelDecorationsChangedEvent(e: editorCommon.IModelDecorationsChangedEvent): void {
		if (!this._isDisposing) {
			this.emit(editorCommon.EventType.ModelDecorationsChanged, e);
		}
	}

	private _normalizeDeltaDecorations(deltaDecorations: editorCommon.IModelDeltaDecoration[]): ModelDeltaDecoration[] {
		let result: ModelDeltaDecoration[] = [];
		for (let i = 0, len = deltaDecorations.length; i < len; i++) {
			let deltaDecoration = deltaDecorations[i];
			result.push(new ModelDeltaDecoration(i, this.validateRange(deltaDecoration.range), _normalizeOptions(deltaDecoration.options)));
		}
		return result;
	}

	private _addDecorationImpl(eventBuilder: DeferredEventsBuilder, ownerId: number, _range: Range, options: ModelDecorationOptions): string {
		let range = this.validateRange(_range);

		let decorationId = this._decorationIdGenerator.nextId();

		let startMarkerSticksToPreviousCharacter = TextModelWithDecorations._shouldStartMarkerSticksToPreviousCharacter(options.stickiness);
		let startMarkerId = this._addMarker(decorationId, range.startLineNumber, range.startColumn, startMarkerSticksToPreviousCharacter);

		let endMarkerSticksToPreviousCharacter = TextModelWithDecorations._shouldEndMarkerSticksToPreviousCharacter(options.stickiness);
		let endMarkerId = this._addMarker(decorationId, range.endLineNumber, range.endColumn, endMarkerSticksToPreviousCharacter);

		let decoration = new InternalDecoration(decorationId, ownerId, startMarkerId, endMarkerId, options);
		this._decorations[decorationId] = decoration;

		this._setDecorationIsMultiLine(decoration, (range.startLineNumber !== range.endLineNumber));

		eventBuilder.addNewDecoration(decoration.toExternalDecoration(range));

		return decorationId;
	}

	private _addDecorationsImpl(eventBuilder: DeferredEventsBuilder, ownerId: number, newDecorations: ModelDeltaDecoration[]): string[] {
		let decorationIds: string[] = [];
		let newMarkers: INewMarker[] = [];

		for (let i = 0, len = newDecorations.length; i < len; i++) {
			let newDecoration = newDecorations[i];
			let range = newDecoration.range;
			let stickiness = newDecoration.options.stickiness;

			let decorationId = this._decorationIdGenerator.nextId();

			decorationIds[i] = decorationId;

			newMarkers[2 * i] = {
				decorationId: decorationId,
				lineNumber: range.startLineNumber,
				column: range.startColumn,
				stickToPreviousCharacter: TextModelWithDecorations._shouldStartMarkerSticksToPreviousCharacter(stickiness)
			};

			newMarkers[2 * i + 1] = {
				decorationId: decorationId,
				lineNumber: range.endLineNumber,
				column: range.endColumn,
				stickToPreviousCharacter: TextModelWithDecorations._shouldEndMarkerSticksToPreviousCharacter(stickiness)
			};
		}

		let markerIds = this._addMarkers(newMarkers);

		for (let i = 0, len = newDecorations.length; i < len; i++) {
			let newDecoration = newDecorations[i];
			let range = newDecoration.range;
			let decorationId = decorationIds[i];
			let startMarkerId = markerIds[2 * i];
			let endMarkerId = markerIds[2 * i + 1];

			let decoration = new InternalDecoration(decorationId, ownerId, startMarkerId, endMarkerId, newDecoration.options);
			this._decorations[decorationId] = decoration;

			this._setDecorationIsMultiLine(decoration, (range.startLineNumber !== range.endLineNumber));

			eventBuilder.addNewDecoration(decoration.toExternalDecoration(range));
		}

		return decorationIds;
	}

	private _changeDecorationImpl(eventBuilder: DeferredEventsBuilder, id: string, newRange: Range): void {
		if (!this._decorations.hasOwnProperty(id)) {
			return;
		}

		let decoration = this._decorations[id];

		this._changeMarker(decoration.startMarkerId, newRange.startLineNumber, newRange.startColumn);
		this._changeMarker(decoration.endMarkerId, newRange.endLineNumber, newRange.endColumn);

		this._setDecorationIsMultiLine(decoration, (newRange.startLineNumber !== newRange.endLineNumber));

		eventBuilder.addMovedDecoration(decoration.toExternalDecoration(newRange));
	}

	private _changeDecorationOptionsImpl(eventBuilder: DeferredEventsBuilder, id: string, options: ModelDecorationOptions): void {
		if (!this._decorations.hasOwnProperty(id)) {
			return;
		}

		let decoration = this._decorations[id];

		if (decoration.options.stickiness !== options.stickiness) {
			this._changeMarkerStickiness(decoration.startMarkerId, TextModelWithDecorations._shouldStartMarkerSticksToPreviousCharacter(options.stickiness));
			this._changeMarkerStickiness(decoration.endMarkerId, TextModelWithDecorations._shouldEndMarkerSticksToPreviousCharacter(options.stickiness));
		}

		decoration.setOptions(options);

		eventBuilder.addUpdatedDecoration(decoration.toExternalDecoration(this._getDecorationRange(decoration)));
	}

	private _removeDecorationImpl(eventBuilder: DeferredEventsBuilder, id: string): void {
		if (!this._decorations.hasOwnProperty(id)) {
			return;
		}
		let decoration = this._decorations[id];

		this._removeMarker(decoration.startMarkerId);
		this._removeMarker(decoration.endMarkerId);

		this._setDecorationIsMultiLine(decoration, false);
		delete this._decorations[id];

		if (eventBuilder) {
			eventBuilder.addRemovedDecoration(id);
		}
	}

	private _removeDecorationsImpl(eventBuilder: DeferredEventsBuilder, ids: string[]): void {
		let removeMarkers: string[] = [], removeMarkersLen = 0;

		for (let i = 0, len = ids.length; i < len; i++) {
			let id = ids[i];

			if (!this._decorations.hasOwnProperty(id)) {
				continue;
			}

			let decoration = this._decorations[id];

			if (eventBuilder) {
				eventBuilder.addRemovedDecoration(id);
			}

			removeMarkers[removeMarkersLen++] = decoration.startMarkerId;
			removeMarkers[removeMarkersLen++] = decoration.endMarkerId;
			this._setDecorationIsMultiLine(decoration, false);
			delete this._decorations[id];
		}

		if (removeMarkers.length > 0) {
			this._removeMarkers(removeMarkers);
		}
	}

	private _resolveOldDecorations(oldDecorations: string[]): IOldDecoration[] {
		let result: IOldDecoration[] = [];
		for (let i = 0, len = oldDecorations.length; i < len; i++) {
			let id = oldDecorations[i];
			if (!this._decorations.hasOwnProperty(id)) {
				continue;
			}

			let decoration = this._decorations[id];

			result.push({
				id: id,
				range: this._getDecorationRange(decoration),
				options: decoration.options
			});
		}
		return result;
	}

	private _deltaDecorationsImpl(eventBuilder: DeferredEventsBuilder, ownerId: number, oldDecorationsIds: string[], newDecorations: ModelDeltaDecoration[]): string[] {

		if (oldDecorationsIds.length === 0) {
			// Nothing to remove
			return this._addDecorationsImpl(eventBuilder, ownerId, newDecorations);
		}

		if (newDecorations.length === 0) {
			// Nothing to add
			this._removeDecorationsImpl(eventBuilder, oldDecorationsIds);
			return [];
		}

		let oldDecorations = this._resolveOldDecorations(oldDecorationsIds);

		oldDecorations.sort((a, b) => Range.compareRangesUsingStarts(a.range, b.range));
		newDecorations.sort((a, b) => Range.compareRangesUsingStarts(a.range, b.range));

		let result: string[] = [],
			oldDecorationsIndex = 0,
			oldDecorationsLength = oldDecorations.length,
			newDecorationsIndex = 0,
			newDecorationsLength = newDecorations.length,
			decorationsToAdd: ModelDeltaDecoration[] = [],
			decorationsToRemove: string[] = [];

		while (oldDecorationsIndex < oldDecorationsLength && newDecorationsIndex < newDecorationsLength) {
			let oldDecoration = oldDecorations[oldDecorationsIndex];
			let newDecoration = newDecorations[newDecorationsIndex];
			let comparison = Range.compareRangesUsingStarts(oldDecoration.range, newDecoration.range);

			if (comparison < 0) {
				// `oldDecoration` is before `newDecoration` => remove `oldDecoration`
				decorationsToRemove.push(oldDecoration.id);
				oldDecorationsIndex++;
				continue;
			}

			if (comparison > 0) {
				// `newDecoration` is before `oldDecoration` => add `newDecoration`
				decorationsToAdd.push(newDecoration);
				newDecorationsIndex++;
				continue;
			}

			// The ranges of `oldDecoration` and `newDecoration` are equal

			if (!oldDecoration.options.equals(newDecoration.options)) {
				// The options do not match => remove `oldDecoration`
				decorationsToRemove.push(oldDecoration.id);
				oldDecorationsIndex++;
				continue;
			}

			// Bingo! We can reuse `oldDecoration` for `newDecoration`
			result[newDecoration.index] = oldDecoration.id;
			oldDecorationsIndex++;
			newDecorationsIndex++;
		}

		while (oldDecorationsIndex < oldDecorationsLength) {
			// No more new decorations => remove decoration at `oldDecorationsIndex`
			decorationsToRemove.push(oldDecorations[oldDecorationsIndex].id);
			oldDecorationsIndex++;
		}

		while (newDecorationsIndex < newDecorationsLength) {
			// No more old decorations => add decoration at `newDecorationsIndex`
			decorationsToAdd.push(newDecorations[newDecorationsIndex]);
			newDecorationsIndex++;
		}

		// Remove `decorationsToRemove`
		if (decorationsToRemove.length > 0) {
			this._removeDecorationsImpl(eventBuilder, decorationsToRemove);
		}

		// Add `decorationsToAdd`
		if (decorationsToAdd.length > 0) {
			let newIds = this._addDecorationsImpl(eventBuilder, ownerId, decorationsToAdd);
			for (let i = 0, len = decorationsToAdd.length; i < len; i++) {
				result[decorationsToAdd[i].index] = newIds[i];
			}
		}

		return result;
	}
}

function cleanClassName(className: string): string {
	return className.replace(/[^a-z0-9\-]/gi, ' ');
}

export class ModelDecorationOptions implements editorCommon.IModelDecorationOptions {

	stickiness: editorCommon.TrackedRangeStickiness;
	className: string;
	glyphMarginHoverMessage: string;
	hoverMessage: MarkedString | MarkedString[];
	isWholeLine: boolean;
	showInOverviewRuler: string;
	overviewRuler: editorCommon.IModelDecorationOverviewRulerOptions;
	glyphMarginClassName: string;
	linesDecorationsClassName: string;
	marginClassName: string;
	inlineClassName: string;
	beforeContentClassName: string;
	afterContentClassName: string;

	constructor(options: editorCommon.IModelDecorationOptions) {
		this.stickiness = options.stickiness || editorCommon.TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges;
		this.className = cleanClassName(options.className || strings.empty);
		this.glyphMarginHoverMessage = options.glyphMarginHoverMessage || strings.empty;
		this.hoverMessage = options.hoverMessage || [];
		this.isWholeLine = options.isWholeLine || false;
		this.overviewRuler = _normalizeOverviewRulerOptions(options.overviewRuler, options.showInOverviewRuler);
		this.glyphMarginClassName = cleanClassName(options.glyphMarginClassName || strings.empty);
		this.linesDecorationsClassName = cleanClassName(options.linesDecorationsClassName || strings.empty);
		this.marginClassName = cleanClassName(options.marginClassName || strings.empty);
		this.inlineClassName = cleanClassName(options.inlineClassName || strings.empty);
		this.beforeContentClassName = cleanClassName(options.beforeContentClassName || strings.empty);
		this.afterContentClassName = cleanClassName(options.afterContentClassName || strings.empty);
	}

	private static _overviewRulerEquals(a: editorCommon.IModelDecorationOverviewRulerOptions, b: editorCommon.IModelDecorationOverviewRulerOptions): boolean {
		return (
			a.color === b.color
			&& a.position === b.position
			&& a.darkColor === b.darkColor
		);
	}

	public equals(other: ModelDecorationOptions): boolean {
		return (
			this.stickiness === other.stickiness
			&& this.className === other.className
			&& this.glyphMarginHoverMessage === other.glyphMarginHoverMessage
			&& this.isWholeLine === other.isWholeLine
			&& this.showInOverviewRuler === other.showInOverviewRuler
			&& this.glyphMarginClassName === other.glyphMarginClassName
			&& this.linesDecorationsClassName === other.linesDecorationsClassName
			&& this.marginClassName === other.marginClassName
			&& this.inlineClassName === other.inlineClassName
			&& this.beforeContentClassName === other.beforeContentClassName
			&& this.afterContentClassName === other.afterContentClassName
			&& markedStringsEquals(this.hoverMessage, other.hoverMessage)
			&& ModelDecorationOptions._overviewRulerEquals(this.overviewRuler, other.overviewRuler)
		);
	}
}

class ModelDeltaDecoration implements editorCommon.IModelDeltaDecoration {

	index: number;
	range: Range;
	options: ModelDecorationOptions;

	constructor(index: number, range: Range, options: ModelDecorationOptions) {
		this.index = index;
		this.range = range;
		this.options = options;
	}
}

function _normalizeOptions(options: editorCommon.IModelDecorationOptions): ModelDecorationOptions {
	return new ModelDecorationOptions(options);
}

class ModelDecorationOverviewRulerOptions implements editorCommon.IModelDecorationOverviewRulerOptions {
	color: string;
	darkColor: string;
	position: editorCommon.OverviewRulerLane;

	constructor(options: editorCommon.IModelDecorationOverviewRulerOptions, legacyShowInOverviewRuler: string) {
		this.color = strings.empty;
		this.darkColor = strings.empty;
		this.position = editorCommon.OverviewRulerLane.Center;

		if (legacyShowInOverviewRuler) {
			this.color = legacyShowInOverviewRuler;
		}
		if (options && options.color) {
			this.color = options.color;
		}
		if (options && options.darkColor) {
			this.darkColor = options.darkColor;
		}
		if (options && options.hasOwnProperty('position')) {
			this.position = options.position;
		}
	}
}

function _normalizeOverviewRulerOptions(options: editorCommon.IModelDecorationOverviewRulerOptions, legacyShowInOverviewRuler: string = null): editorCommon.IModelDecorationOverviewRulerOptions {
	return new ModelDecorationOverviewRulerOptions(options, legacyShowInOverviewRuler);
}
