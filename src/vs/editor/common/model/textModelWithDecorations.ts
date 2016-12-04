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
import { LineMarker } from 'vs/editor/common/model/modelLine';
import { Position } from 'vs/editor/common/core/position';
import { INewMarker, TextModelWithMarkers } from 'vs/editor/common/model/textModelWithMarkers';

interface ITrackedRange {
	id: string;
	startMarkerId: string;
	endMarkerId: string;
}

interface ITrackedRangesMap {
	[key: string]: ITrackedRange;
}

class TrackedRange implements ITrackedRange {
	public readonly id: string;
	public readonly startMarkerId: string;
	public readonly endMarkerId: string;

	constructor(id: string, startMarkedId: string, endMarkerId: string) {
		this.id = id;
		this.startMarkerId = startMarkedId;
		this.endMarkerId = endMarkerId;
	}
}

export class DeferredEventsBuilder {

	public changedMarkers: { [markerId: string]: boolean; };

	public newOrChangedDecorations: { [decorationId: string]: boolean; };
	public removedDecorations: { [decorationId: string]: boolean; };

	constructor() {
		this.changedMarkers = {};
		this.newOrChangedDecorations = {};
		this.removedDecorations = {};
	}

	// --- Build decoration events

	public addNewDecoration(id: string): void {
		this.newOrChangedDecorations[id] = true;
	}

	public addRemovedDecoration(id: string): void {
		if (this.newOrChangedDecorations.hasOwnProperty(id)) {
			delete this.newOrChangedDecorations[id];
		}
		this.removedDecorations[id] = true;
	}

	public addMovedDecoration(id: string): void {
		this.newOrChangedDecorations[id] = true;
	}

	public addUpdatedDecoration(id: string): void {
		this.newOrChangedDecorations[id] = true;
	}
}

interface IInternalDecoration {
	id: string;
	ownerId: number;
	rangeId: string;
	options: ModelDecorationOptions;
}

interface IInternalDecorationsMap {
	[key: string]: IInternalDecoration;
}

interface IRangeIdToDecorationIdMap {
	[key: string]: string;
}

interface IOldDecoration {
	range: Range;
	options: ModelDecorationOptions;
	id: string;
}

var _INSTANCE_COUNT = 0;

export class TextModelWithDecorations extends TextModelWithMarkers implements editorCommon.ITextModelWithDecorations {

	private _currentDeferredEvents: DeferredEventsBuilder;
	private _decorationIdGenerator: IdGenerator;
	private decorations: IInternalDecorationsMap;
	private rangeIdToDecorationId: IRangeIdToDecorationIdMap;

	private _rangeIdGenerator: IdGenerator;
	private _ranges: ITrackedRangesMap;
	private _multiLineTrackedRanges: { [key: string]: boolean; };

	constructor(allowedEventTypes: string[], rawText: editorCommon.IRawText, languageId: string) {
		allowedEventTypes.push(editorCommon.EventType.ModelDecorationsChanged);
		super(allowedEventTypes, rawText, languageId);
		this._rangeIdGenerator = new IdGenerator((++_INSTANCE_COUNT) + ';');
		this._ranges = {};
		this._multiLineTrackedRanges = {};

		// Initialize decorations
		this._decorationIdGenerator = new IdGenerator((++_INSTANCE_COUNT) + ';');
		this.decorations = {};
		this.rangeIdToDecorationId = {};
		this._currentDeferredEvents = null;
	}

	public dispose(): void {
		this.decorations = null;
		this.rangeIdToDecorationId = null;
		this._ranges = null;
		this._multiLineTrackedRanges = null;
		super.dispose();
	}

	protected _resetValue(newValue: editorCommon.IRawText): void {
		super._resetValue(newValue);

		// Destroy all my tracked ranges
		this._ranges = {};
		this._multiLineTrackedRanges = {};

		// Destroy all my decorations
		this.decorations = {};
		this.rangeIdToDecorationId = {};
	}

	// --- BEGIN TrackedRanges

	private _setRangeIsMultiLine(rangeId: string, rangeIsMultiLine: boolean): void {
		var rangeWasMultiLine = this._multiLineTrackedRanges.hasOwnProperty(rangeId);
		if (!rangeWasMultiLine && rangeIsMultiLine) {
			this._multiLineTrackedRanges[rangeId] = true;
		} else if (rangeWasMultiLine && !rangeIsMultiLine) {
			delete this._multiLineTrackedRanges[rangeId];
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
		return Object.keys(this._ranges).length;
	}

	private _newEditorRange(startPosition: Position, endPosition: Position): Range {
		if (endPosition.isBefore(startPosition)) {
			// This tracked range has turned in on itself (end marker before start marker)
			// This can happen in extreme editing conditions where lots of text is removed and lots is added

			// Treat it as a collapsed range
			return new Range(startPosition.lineNumber, startPosition.column, startPosition.lineNumber, startPosition.column);
		}
		return new Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column);
	}

	private _getTrackedRange(rangeId: string): Range {
		var range = this._ranges[rangeId];
		var startMarker = this._getMarker(range.startMarkerId);
		var endMarker = this._getMarker(range.endMarkerId);

		return this._newEditorRange(startMarker, endMarker);
	}

	// --- END TrackedRanges

	public changeDecorations(callback: (changeAccessor: editorCommon.IModelDecorationsChangeAccessor) => any, ownerId: number = 0): any {
		this._assertNotDisposed();
		return this._withDeferredEvents((deferredEventsBuilder: DeferredEventsBuilder) => {
			var changeAccessor: editorCommon.IModelDecorationsChangeAccessor = {
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
			var result: any = null;
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

		let keys = Object.keys(this.decorations);
		for (let i = 0, len = keys.length; i < len; i++) {
			let decorationId = keys[i];
			let decoration = this.decorations[decorationId];

			if (decoration.ownerId === ownerId) {
				toRemove.push(decoration.id);
			}
		}

		this._removeDecorationsImpl(null, toRemove);
	}

	public getDecorationOptions(decorationId: string): editorCommon.IModelDecorationOptions {
		if (this.decorations.hasOwnProperty(decorationId)) {
			return this.decorations[decorationId].options;
		}
		return null;
	}

	public getDecorationRange(decorationId: string): Range {
		if (this.decorations.hasOwnProperty(decorationId)) {
			var decoration = this.decorations[decorationId];
			return this._getTrackedRange(decoration.rangeId);
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
	 * Fetch only multi-line ranges that intersect with the given line number range
	 */
	private _getMultiLineTrackedRanges(filterStartLineNumber: number, filterEndLineNumber: number): editorCommon.IModelTrackedRange[] {
		let result: editorCommon.IModelTrackedRange[] = [];

		let keys = Object.keys(this._multiLineTrackedRanges);
		for (let i = 0, len = keys.length; i < len; i++) {
			let rangeId = keys[i];
			let range = this._ranges[rangeId];

			let startMarker = this._getMarker(range.startMarkerId);
			if (startMarker.lineNumber > filterEndLineNumber) {
				continue;
			}

			let endMarker = this._getMarker(range.endMarkerId);
			if (endMarker.lineNumber < filterStartLineNumber) {
				continue;
			}

			result.push({
				id: range.id,
				range: this._newEditorRange(startMarker, endMarker)
			});
		}

		return result;
	}

	private _getLinesTrackedRanges(startLineNumber: number, endLineNumber: number): editorCommon.IModelTrackedRange[] {
		let result = this._getMultiLineTrackedRanges(startLineNumber, endLineNumber);
		let resultMap: { [rangeId: string]: boolean; } = {};

		for (let i = 0, len = result.length; i < len; i++) {
			resultMap[result[i].id] = true;
		}

		for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
			let lineMarkers = this._getLineMarkers(lineNumber);
			for (let i = 0, len = lineMarkers.length; i < len; i++) {
				let lineMarker = lineMarkers[i];

				if (lineMarker.rangeId !== null) {
					let rangeId = lineMarker.rangeId;
					if (!resultMap.hasOwnProperty(rangeId)) {
						let startMarker = this._getMarker(this._ranges[rangeId].startMarkerId);
						let endMarker = this._getMarker(this._ranges[rangeId].endMarkerId);

						result.push({
							id: rangeId,
							range: this._newEditorRange(startMarker, endMarker)
						});
						resultMap[rangeId] = true;
					}
				}
			}
		}

		return result;
	}

	private _getDecorationsInRange(startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number, ownerId: number, filterOutValidation: boolean): editorCommon.IModelDecoration[] {
		var result: editorCommon.IModelDecoration[] = [],
			decoration: IInternalDecoration,
			lineRanges = this._getLinesTrackedRanges(startLineNumber, endLineNumber),
			i: number,
			lineRange: editorCommon.IModelTrackedRange,
			len: number;

		for (i = 0, len = lineRanges.length; i < len; i++) {
			lineRange = lineRanges[i];

			// Look at line range only if there is a corresponding decoration for it
			if (this.rangeIdToDecorationId.hasOwnProperty(lineRange.id)) {
				decoration = this.decorations[this.rangeIdToDecorationId[lineRange.id]];

				if (ownerId && decoration.ownerId && decoration.ownerId !== ownerId) {
					continue;
				}

				if (filterOutValidation) {
					if (decoration.options.className === editorCommon.ClassName.EditorErrorDecoration || decoration.options.className === editorCommon.ClassName.EditorWarningDecoration) {
						continue;
					}
				}

				if (lineRange.range.startLineNumber === startLineNumber && lineRange.range.endColumn < startColumn) {
					continue;
				}

				if (lineRange.range.endLineNumber === endLineNumber && lineRange.range.startColumn > endColumn) {
					continue;
				}

				result.push({
					id: decoration.id,
					ownerId: decoration.ownerId,
					range: lineRange.range,
					options: decoration.options
				});
			}
		}

		return result;
	}

	public getLinesDecorations(startLineNumber: number, endLineNumber: number, ownerId: number = 0, filterOutValidation: boolean = false): editorCommon.IModelDecoration[] {
		var lineCount = this.getLineCount();
		startLineNumber = Math.min(lineCount, Math.max(1, startLineNumber));
		endLineNumber = Math.min(lineCount, Math.max(1, endLineNumber));
		return this._getDecorationsInRange(startLineNumber, 1, endLineNumber, Number.MAX_VALUE, ownerId, filterOutValidation);
	}

	public getDecorationsInRange(range: editorCommon.IRange, ownerId?: number, filterOutValidation?: boolean): editorCommon.IModelDecoration[] {
		var validatedRange = this.validateRange(range);
		return this._getDecorationsInRange(validatedRange.startLineNumber, validatedRange.startColumn, validatedRange.endLineNumber, validatedRange.endColumn, ownerId, filterOutValidation);
	}

	public getAllDecorations(ownerId: number = 0, filterOutValidation: boolean = false): editorCommon.IModelDecoration[] {
		let result: editorCommon.IModelDecoration[] = [];

		let keys = Object.keys(this.decorations);
		for (let i = 0, len = keys.length; i < len; i++) {
			let decorationId = keys[i];
			let decoration = this.decorations[decorationId];

			if (ownerId && decoration.ownerId && decoration.ownerId !== ownerId) {
				continue;
			}

			if (filterOutValidation) {
				if (decoration.options.className === editorCommon.ClassName.EditorErrorDecoration || decoration.options.className === editorCommon.ClassName.EditorWarningDecoration) {
					continue;
				}
			}

			result.push({
				id: decoration.id,
				ownerId: decoration.ownerId,
				range: this._getTrackedRange(decoration.rangeId),
				options: decoration.options
			});
		}

		return result;
	}

	protected _withDeferredEvents(callback: (deferredEventsBuilder: DeferredEventsBuilder) => any): any {
		return this.deferredEmit(() => {
			var createDeferredEvents = this._currentDeferredEvents ? false : true;
			if (createDeferredEvents) {
				this._currentDeferredEvents = new DeferredEventsBuilder();
			}

			try {
				var result = callback(this._currentDeferredEvents);
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

	private _onChangedMarkers(changedMarkers: LineMarker[]): string[] {
		// Collect changed ranges (might contain duplicates)
		let changedRanges: string[] = [], changedRangesLen = 0;
		for (let i = 0, len = changedMarkers.length; i < len; i++) {
			let marker = changedMarkers[i];

			if (marker.rangeId !== null) {
				let rangeId = marker.rangeId;

				changedRanges[changedRangesLen++] = rangeId;
			}
		}

		// Eliminate duplicates
		changedRanges.sort();

		let uniqueChangedRanges: string[] = [], uniqueChangedRangesLen = 0;
		let prevChangedRange: string = null;
		for (let i = 0, len = changedRanges.length; i < len; i++) {
			let changedRangeId = changedRanges[i];

			if (changedRangeId !== prevChangedRange) {
				uniqueChangedRanges[uniqueChangedRangesLen++] = changedRangeId;
			}

			prevChangedRange = changedRangeId;
		}

		// update multiline flags
		for (let i = 0, len = uniqueChangedRanges.length; i < len; i++) {
			let changedRangeId = uniqueChangedRanges[i];
			let range = this._ranges[changedRangeId];
			this._setRangeIsMultiLine(range.id, (this._getMarker(range.startMarkerId).lineNumber !== this._getMarker(range.endMarkerId).lineNumber));
		}

		return uniqueChangedRanges;
	}

	private _handleCollectedEvents(b: DeferredEventsBuilder): void {
		// Normalize changed markers into an array
		let changedMarkers = this._getMarkersInMap(b.changedMarkers);

		// Collect changed tracked ranges
		let changedRanges = this._onChangedMarkers(changedMarkers);

		// Collect decoration change events with the deferred event builder
		for (let i = 0, len = changedRanges.length; i < len; i++) {
			let rangeId = changedRanges[i];
			if (this.rangeIdToDecorationId.hasOwnProperty(rangeId)) {
				let decorationId = this.rangeIdToDecorationId[rangeId];

				b.addMovedDecoration(decorationId);
			}
		}

		// Emit a single decorations changed event
		this._handleCollectedDecorationsEvents(b);
	}

	private _handleCollectedDecorationsEvents(b: DeferredEventsBuilder): void {
		var addedOrChangedDecorations: editorCommon.IModelDecorationsChangedEventDecorationData[] = [],
			removedDecorations: string[] = [],
			decorationIds: string[] = [];

		let keys = Object.keys(b.newOrChangedDecorations);
		for (let i = 0, len = keys.length; i < len; i++) {
			let decorationId = keys[i];

			decorationIds.push(decorationId);
			let decorationData = this._getDecorationData(decorationId);
			addedOrChangedDecorations.push(decorationData);
		}

		keys = Object.keys(b.removedDecorations);
		for (let i = 0, len = keys.length; i < len; i++) {
			let decorationId = keys[i];
			decorationIds.push(decorationId);
			removedDecorations.push(decorationId);
		}

		if (decorationIds.length > 0) {
			var e: editorCommon.IModelDecorationsChangedEvent = {
				ids: decorationIds,
				addedOrChangedDecorations: addedOrChangedDecorations,
				removedDecorations: removedDecorations
			};
			this.emitModelDecorationsChangedEvent(e);
		}
	}

	private _getDecorationData(decorationId: string): editorCommon.IModelDecorationsChangedEventDecorationData {
		var decoration = this.decorations[decorationId];
		return {
			id: decoration.id,
			ownerId: decoration.ownerId,
			range: this._getTrackedRange(decoration.rangeId),
			isForValidation: (decoration.options.className === editorCommon.ClassName.EditorErrorDecoration || decoration.options.className === editorCommon.ClassName.EditorWarningDecoration),
			options: decoration.options
		};
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

	private _addTrackedRange(_textRange: editorCommon.IRange, stickiness: editorCommon.TrackedRangeStickiness): string {
		let textRange = this.validateRange(_textRange);

		let startMarkerSticksToPreviousCharacter = TextModelWithDecorations._shouldStartMarkerSticksToPreviousCharacter(stickiness);
		let endMarkerSticksToPreviousCharacter = TextModelWithDecorations._shouldEndMarkerSticksToPreviousCharacter(stickiness);

		let rangeId = this._rangeIdGenerator.nextId();

		let startMarkerId = this._addMarker(rangeId, textRange.startLineNumber, textRange.startColumn, startMarkerSticksToPreviousCharacter);
		let endMarkerId = this._addMarker(rangeId, textRange.endLineNumber, textRange.endColumn, endMarkerSticksToPreviousCharacter);

		let range = new TrackedRange(rangeId, startMarkerId, endMarkerId);
		this._ranges[range.id] = range;

		this._setRangeIsMultiLine(range.id, (textRange.startLineNumber !== textRange.endLineNumber));

		return range.id;
	}

	private _addDecorationImpl(eventBuilder: DeferredEventsBuilder, ownerId: number, range: Range, options: ModelDecorationOptions): string {
		var rangeId = this._addTrackedRange(range, options.stickiness);

		var decoration = new ModelInternalDecoration(this._decorationIdGenerator.nextId(), ownerId, rangeId, options);

		this.decorations[decoration.id] = decoration;
		this.rangeIdToDecorationId[rangeId] = decoration.id;

		eventBuilder.addNewDecoration(decoration.id);

		return decoration.id;
	}

	private _addTrackedRanges(textRanges: editorCommon.IRange[], stickinessArr: editorCommon.TrackedRangeStickiness[]): string[] {
		let addMarkers: INewMarker[] = [];
		let addRangeId: string[] = [];
		for (let i = 0, len = textRanges.length; i < len; i++) {
			let textRange = textRanges[i];
			let stickiness = stickinessArr[i];

			let rangeId = this._rangeIdGenerator.nextId();

			addMarkers.push({
				rangeId: rangeId,
				lineNumber: textRange.startLineNumber,
				column: textRange.startColumn,
				stickToPreviousCharacter: TextModelWithDecorations._shouldStartMarkerSticksToPreviousCharacter(stickiness)
			});
			addMarkers.push({
				rangeId: rangeId,
				lineNumber: textRange.endLineNumber,
				column: textRange.endColumn,
				stickToPreviousCharacter: TextModelWithDecorations._shouldEndMarkerSticksToPreviousCharacter(stickiness)
			});
			addRangeId.push(rangeId);
		}

		let markerIds = this._addMarkers(addMarkers);

		let result: string[] = [];
		for (let i = 0, len = textRanges.length; i < len; i++) {
			let textRange = textRanges[i];
			let startMarkerId = markerIds[2 * i];
			let endMarkerId = markerIds[2 * i + 1];

			let range = new TrackedRange(addRangeId[i], startMarkerId, endMarkerId);
			this._ranges[range.id] = range;

			this._setRangeIsMultiLine(range.id, (textRange.startLineNumber !== textRange.endLineNumber));

			result.push(range.id);
		}

		return result;
	}

	private _addDecorationsImpl(eventBuilder: DeferredEventsBuilder, ownerId: number, newDecorations: ModelDeltaDecoration[]): string[] {
		var rangeIds = this._addTrackedRanges(newDecorations.map(d => d.range), newDecorations.map(d => d.options.stickiness));
		var result: string[] = [];

		for (let i = 0, len = newDecorations.length; i < len; i++) {
			let rangeId = rangeIds[i];

			var decoration = new ModelInternalDecoration(this._decorationIdGenerator.nextId(), ownerId, rangeId, newDecorations[i].options);

			this.decorations[decoration.id] = decoration;
			this.rangeIdToDecorationId[rangeId] = decoration.id;

			eventBuilder.addNewDecoration(decoration.id);

			result.push(decoration.id);
		}

		return result;
	}

	private _changeTrackedRange(rangeId: string, newTextRange: editorCommon.IRange): void {
		if (this._ranges.hasOwnProperty(rangeId)) {
			newTextRange = this.validateRange(newTextRange);

			var range = this._ranges[rangeId];
			this._changeMarker(range.startMarkerId, newTextRange.startLineNumber, newTextRange.startColumn);
			this._changeMarker(range.endMarkerId, newTextRange.endLineNumber, newTextRange.endColumn);

			this._setRangeIsMultiLine(range.id, (newTextRange.startLineNumber !== newTextRange.endLineNumber));
		}
	}

	private _changeDecorationImpl(eventBuilder: DeferredEventsBuilder, id: string, newRange: Range): void {
		if (this.decorations.hasOwnProperty(id)) {
			let decoration = this.decorations[id];
			this._changeTrackedRange(decoration.rangeId, newRange);
			eventBuilder.addMovedDecoration(id);
		}
	}

	private _changeTrackedRangeStickiness(rangeId: string, newStickiness: editorCommon.TrackedRangeStickiness): void {
		if (this._ranges.hasOwnProperty(rangeId)) {
			var range = this._ranges[rangeId];
			this._changeMarkerStickiness(range.startMarkerId, TextModelWithDecorations._shouldStartMarkerSticksToPreviousCharacter(newStickiness));
			this._changeMarkerStickiness(range.endMarkerId, TextModelWithDecorations._shouldEndMarkerSticksToPreviousCharacter(newStickiness));
		}
	}

	private _changeDecorationOptionsImpl(eventBuilder: DeferredEventsBuilder, id: string, options: ModelDecorationOptions): void {
		if (this.decorations.hasOwnProperty(id)) {
			let decoration = this.decorations[id];
			let oldOptions = decoration.options;

			if (oldOptions.stickiness !== options.stickiness) {
				this._changeTrackedRangeStickiness(decoration.rangeId, options.stickiness);
			}

			decoration.options = options;

			eventBuilder.addUpdatedDecoration(id);
		}
	}

	private _removeTrackedRange(rangeId: string): void {
		if (this._ranges.hasOwnProperty(rangeId)) {
			var range = this._ranges[rangeId];

			this._removeMarker(range.startMarkerId);
			this._removeMarker(range.endMarkerId);

			this._setRangeIsMultiLine(range.id, false);
			delete this._ranges[range.id];
		}
	}

	private _removeDecorationImpl(eventBuilder: DeferredEventsBuilder, id: string): void {
		if (this.decorations.hasOwnProperty(id)) {
			let decoration = this.decorations[id];

			this._removeTrackedRange(decoration.rangeId);
			delete this.rangeIdToDecorationId[decoration.rangeId];
			delete this.decorations[id];

			if (eventBuilder) {
				eventBuilder.addRemovedDecoration(id);
			}
		}
	}

	private _removeTrackedRanges(ids: string[]): void {
		let removeMarkers: string[] = [];

		for (let i = 0, len = ids.length; i < len; i++) {
			let rangeId = ids[i];

			if (!this._ranges.hasOwnProperty(rangeId)) {
				continue;
			}

			let range = this._ranges[rangeId];

			removeMarkers.push(range.startMarkerId);
			removeMarkers.push(range.endMarkerId);

			this._setRangeIsMultiLine(range.id, false);
			delete this._ranges[range.id];
		}

		if (removeMarkers.length > 0) {
			this._removeMarkers(removeMarkers);
		}
	}

	private _removeDecorationsImpl(eventBuilder: DeferredEventsBuilder, ids: string[]): void {
		var removeTrackedRanges: string[] = [];

		for (let i = 0, len = ids.length; i < len; i++) {
			let id = ids[i];

			if (!this.decorations.hasOwnProperty(id)) {
				continue;
			}

			let decoration = this.decorations[id];

			if (eventBuilder) {
				eventBuilder.addRemovedDecoration(id);
			}

			removeTrackedRanges.push(decoration.rangeId);
			delete this.rangeIdToDecorationId[decoration.rangeId];
			delete this.decorations[id];
		}

		if (removeTrackedRanges.length > 0) {
			this._removeTrackedRanges(removeTrackedRanges);
		}
	}

	private _resolveOldDecorations(oldDecorations: string[]): IOldDecoration[] {
		let result: IOldDecoration[] = [];
		for (let i = 0, len = oldDecorations.length; i < len; i++) {
			let id = oldDecorations[i];
			if (!this.decorations.hasOwnProperty(id)) {
				continue;
			}

			let decoration = this.decorations[id];

			result.push({
				id: id,
				range: this._getTrackedRange(decoration.rangeId),
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

class ModelInternalDecoration implements IInternalDecoration {
	id: string;
	ownerId: number;
	rangeId: string;
	options: ModelDecorationOptions;

	constructor(id: string, ownerId: number, rangeId: string, options: ModelDecorationOptions) {
		this.id = id;
		this.ownerId = ownerId;
		this.rangeId = rangeId;
		this.options = options;
	}
}

class ModelDecorationOptions implements editorCommon.IModelDecorationOptions {

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
