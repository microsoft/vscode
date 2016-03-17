/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {onUnexpectedError} from 'vs/base/common/errors';
import {IHTMLContentElement, htmlContentElementArrEquals} from 'vs/base/common/htmlContent';
import * as strings from 'vs/base/common/strings';
import {TPromise} from 'vs/base/common/winjs.base';
import {IdGenerator} from 'vs/editor/common/core/idGenerator';
import {Range} from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {TextModelWithTrackedRanges} from 'vs/editor/common/model/textModelWithTrackedRanges';
import {IMode} from 'vs/editor/common/modes';

export class DeferredEventsBuilder {

	public changedMarkers:{[markerId:string]:boolean;};

	public oldDecorationRange:{[decorationId:string]:editorCommon.IRange;};
	public oldDecorationOptions:{[decorationId:string]:editorCommon.IModelDecorationOptions;};

	public newOrChangedDecorations:{[decorationId:string]:boolean;};
	public removedDecorations:{[decorationId:string]:boolean;};

	constructor() {
		this.changedMarkers = {};
		this.oldDecorationRange = {};
		this.oldDecorationOptions = {};
		this.newOrChangedDecorations = {};
		this.removedDecorations = {};
	}

	// --- Build decoration events

	public addNewDecoration(id:string): void {
		this.newOrChangedDecorations[id] = true;
	}

	public addRemovedDecoration(id:string, ownerId:number, range:editorCommon.IRange, options:editorCommon.IModelDecorationOptions): void {
		if (this.newOrChangedDecorations.hasOwnProperty(id)) {
			delete this.newOrChangedDecorations[id];
		}
		if (!this.oldDecorationRange.hasOwnProperty(id)) {
			this.oldDecorationRange[id] = range;
		}
		if (!this.oldDecorationOptions.hasOwnProperty(id)) {
			this.oldDecorationOptions[id] = options;
		}
		this.removedDecorations[id] = true;
	}

	public addMovedDecoration(id:string, oldRange:editorCommon.IRange): void {
		if (!this.oldDecorationRange.hasOwnProperty(id)) {
			this.oldDecorationRange[id] = oldRange;
		}
		this.newOrChangedDecorations[id] = true;
	}

	public addUpdatedDecoration(id:string, oldOptions:editorCommon.IModelDecorationOptions): void {
		if (!this.oldDecorationOptions.hasOwnProperty(id)) {
			this.oldDecorationOptions[id] = oldOptions;
		}
		this.newOrChangedDecorations[id] = true;
	}
}

interface IInternalDecoration {
	id:string;
	ownerId:number;
	rangeId:string;
	options:ModelDecorationOptions;
}

interface IInternalDecorationsMap {
	[key:string]:IInternalDecoration;
}

interface IRangeIdToDecorationIdMap {
	[key:string]:string;
}

interface IOldDecoration {
	range: editorCommon.IEditorRange;
	options: ModelDecorationOptions;
	id: string;
}

var _INSTANCE_COUNT = 0;

export class TextModelWithDecorations extends TextModelWithTrackedRanges implements editorCommon.ITextModelWithDecorations {

	private _currentDeferredEvents:DeferredEventsBuilder;
	private _decorationIdGenerator: IdGenerator;
	private decorations:IInternalDecorationsMap;
	private rangeIdToDecorationId:IRangeIdToDecorationIdMap;

	constructor(allowedEventTypes:string[], rawText:editorCommon.IRawText, modeOrPromise:IMode|TPromise<IMode>) {
		allowedEventTypes.push(editorCommon.EventType.ModelDecorationsChanged);
		super(allowedEventTypes, rawText, modeOrPromise);

		// Initialize decorations
		this._decorationIdGenerator = new IdGenerator((++_INSTANCE_COUNT) + ';');
		this.decorations = {};
		this.rangeIdToDecorationId = {};
		this._currentDeferredEvents = null;
	}

	public dispose(): void {
		this.decorations = null;
		this.rangeIdToDecorationId = null;
		super.dispose();
	}

	_resetValue(e:editorCommon.IModelContentChangedFlushEvent, newValue:editorCommon.IRawText): void {
		super._resetValue(e, newValue);

		// Destroy all my decorations
		this.decorations = {};
		this.rangeIdToDecorationId = {};
	}

	public changeDecorations(callback: (changeAccessor:editorCommon.IModelDecorationsChangeAccessor)=>any, ownerId:number=0): any {
		if (this._isDisposed) {
			throw new Error('TextModelWithDecorations.changeDecorations: Model is disposed');
		}

		return this._withDeferredEvents((deferredEventsBuilder:DeferredEventsBuilder) => {
			var changeAccessor:editorCommon.IModelDecorationsChangeAccessor = {
				addDecoration: (range:editorCommon.IRange, options:editorCommon.IModelDecorationOptions): string => {
					return this._addDecorationImpl(deferredEventsBuilder, ownerId, this.validateRange(range), _normalizeOptions(options));
				},
				changeDecoration: (id:string, newRange:editorCommon.IRange): void => {
					this._changeDecorationImpl(deferredEventsBuilder, id, this.validateRange(newRange));
				},
				changeDecorationOptions: (id: string, options:editorCommon.IModelDecorationOptions) => {
					this._changeDecorationOptionsImpl(deferredEventsBuilder, id, _normalizeOptions(options));
				},
				removeDecoration: (id:string): void => {
					this._removeDecorationImpl(deferredEventsBuilder, id);
				},
				deltaDecorations: (oldDecorations:string[], newDecorations:editorCommon.IModelDeltaDecoration[]): string[] => {
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

	public deltaDecorations(oldDecorations:string[], newDecorations:editorCommon.IModelDeltaDecoration[], ownerId:number=0): string[] {
		if (this._isDisposed) {
			throw new Error('TextModelWithDecorations.deltaDecorations: Model is disposed');
		}

		if (!oldDecorations) {
			oldDecorations = [];
		}
		return this.changeDecorations((changeAccessor) => {
			return changeAccessor.deltaDecorations(oldDecorations, newDecorations);
		}, ownerId);
	}

	public removeAllDecorationsWithOwnerId(ownerId:number): void {
		if (this._isDisposed) {
			throw new Error('TextModelWithDecorations.removeAllDecorationsWithOwnerId: Model is disposed');
		}

		var decorationId:string;
		var decoration:IInternalDecoration;
		var toRemove:string[] = [];

		for (decorationId in this.decorations) {
			if (this.decorations.hasOwnProperty(decorationId)) {
				decoration = this.decorations[decorationId];

				if (decoration.ownerId === ownerId) {
					toRemove.push(decoration.id);
				}
			}
		}

		this._removeDecorationsImpl(null, toRemove);
	}

	public getDecorationOptions(decorationId:string): editorCommon.IModelDecorationOptions {
		if (this._isDisposed) {
			throw new Error('TextModelWithDecorations.getDecorationOptions: Model is disposed');
		}

		if (this.decorations.hasOwnProperty(decorationId)) {
			return this.decorations[decorationId].options;
		}
		return null;
	}

	public getDecorationRange(decorationId:string): editorCommon.IEditorRange {
		if (this._isDisposed) {
			throw new Error('TextModelWithDecorations.getDecorationRange: Model is disposed');
		}

		if (this.decorations.hasOwnProperty(decorationId)) {
			var decoration = this.decorations[decorationId];
			return this.getTrackedRange(decoration.rangeId);
		}
		return null;
	}

	public getLineDecorations(lineNumber:number, ownerId:number=0, filterOutValidation:boolean=false): editorCommon.IModelDecoration[] {
		if (this._isDisposed) {
			throw new Error('TextModelWithDecorations.getLineDecorations: Model is disposed');
		}
		if (lineNumber < 1 || lineNumber > this.getLineCount()) {
			return [];
		}

		return this.getLinesDecorations(lineNumber, lineNumber, ownerId, filterOutValidation);
	}

	private _getDecorationsInRange(startLineNumber:number, startColumn:number, endLineNumber:number, endColumn:number, ownerId:number, filterOutValidation:boolean): editorCommon.IModelDecoration[] {
		var result:editorCommon.IModelDecoration[] = [],
			decoration:IInternalDecoration,
			lineRanges = this.getLinesTrackedRanges(startLineNumber, endLineNumber),
			i:number,
			lineRange: editorCommon.IModelTrackedRange,
			len:number;

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

	public getLinesDecorations(startLineNumber: number, endLineNumber: number, ownerId:number=0, filterOutValidation:boolean=false): editorCommon.IModelDecoration[] {
		if (this._isDisposed) {
			throw new Error('TextModelWithDecorations.getLinesDecorations: Model is disposed');
		}

		var lineCount = this.getLineCount();
		startLineNumber = Math.min(lineCount, Math.max(1, startLineNumber));
		endLineNumber = Math.min(lineCount, Math.max(1, endLineNumber));
		return this._getDecorationsInRange(startLineNumber, 1, endLineNumber, Number.MAX_VALUE, ownerId, filterOutValidation);
	}

	public getDecorationsInRange(range: editorCommon.IRange, ownerId?: number, filterOutValidation?: boolean): editorCommon.IModelDecoration[] {
		if (this._isDisposed) {
			throw new Error('TextModelWithDecorations.getDecorationsInRange: Model is disposed');
		}

		var validatedRange = this.validateRange(range);
		return this._getDecorationsInRange(validatedRange.startLineNumber, validatedRange.startColumn, validatedRange.endLineNumber, validatedRange.endColumn, ownerId, filterOutValidation);
	}

	public getAllDecorations(ownerId:number=0, filterOutValidation:boolean=false): editorCommon.IModelDecoration[] {
		if (this._isDisposed) {
			throw new Error('TextModelWithDecorations.getAllDecorations: Model is disposed');
		}

		var result:editorCommon.IModelDecoration[] = [];
		var decorationId:string;
		var decoration:IInternalDecoration;

		for (decorationId in this.decorations) {
			if (this.decorations.hasOwnProperty(decorationId)) {
				decoration = this.decorations[decorationId];

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
					range: this.getTrackedRange(decoration.rangeId),
					options: decoration.options
				});
			}
		}
		return result;
	}

	_withDeferredEvents(callback:(deferredEventsBuilder:DeferredEventsBuilder)=>any): any {
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

	private _handleCollectedEvents(b:DeferredEventsBuilder): void {
		// Normalize changed markers into an array
		var changedMarkers = this._getMarkersInMap(b.changedMarkers);

		// Collect changed tracked ranges
		var changedRanges = this._onChangedMarkers(changedMarkers);

		// Collect decoration change events with the deferred event builder
		this._onChangedRanges(b, changedRanges);

		// Emit a single decorations changed event
		this._handleCollectedDecorationsEvents(b);

		// Reset markers for next round of events
		for (var i = 0, len = changedMarkers.length; i < len; i++) {
			changedMarkers[i].oldLineNumber = 0;
			changedMarkers[i].oldColumn = 0;
		}
	}

	private _onChangedRanges(eventBuilder:DeferredEventsBuilder, changedRanges:editorCommon.IChangedTrackedRanges): void {
		var rangeId:string;
		var decorationId:string;

		for (rangeId in changedRanges) {
			if (changedRanges.hasOwnProperty(rangeId) && this.rangeIdToDecorationId.hasOwnProperty(rangeId)) {
				decorationId = this.rangeIdToDecorationId[rangeId];

				eventBuilder.addMovedDecoration(decorationId, changedRanges[rangeId]);
			}
		}
	}

	private _handleCollectedDecorationsEvents(b:DeferredEventsBuilder): void {
		var decorationId:string,
			addedOrChangedDecorations:editorCommon.IModelDecorationsChangedEventDecorationData[] = [],
			removedDecorations:string[] = [],
			decorationIds:string[] = [],
			decorationData:editorCommon.IModelDecorationsChangedEventDecorationData,
			oldRange:editorCommon.IRange;

		for (decorationId in b.newOrChangedDecorations) {
			if (b.newOrChangedDecorations.hasOwnProperty(decorationId)) {
				decorationIds.push(decorationId);
				decorationData = this._getDecorationData(decorationId);
				decorationData.isForValidation = (decorationData.options.className === editorCommon.ClassName.EditorErrorDecoration || decorationData.options.className === editorCommon.ClassName.EditorWarningDecoration);
				addedOrChangedDecorations.push(decorationData);
				if (b.oldDecorationRange.hasOwnProperty(decorationId)) {
					oldRange = b.oldDecorationRange[decorationId];
					oldRange.startLineNumber = oldRange.startLineNumber || decorationData.range.startLineNumber;
					oldRange.startColumn = oldRange.startColumn || decorationData.range.startColumn;
					oldRange.endLineNumber = oldRange.endLineNumber || decorationData.range.endLineNumber;
					oldRange.endColumn = oldRange.endColumn || decorationData.range.endColumn;
				}
			}
		}

		for (decorationId in b.removedDecorations) {
			if (b.removedDecorations.hasOwnProperty(decorationId)) {
				decorationIds.push(decorationId);
				removedDecorations.push(decorationId);
			}
		}

		if (decorationIds.length > 0) {
			var e:editorCommon.IModelDecorationsChangedEvent = {
				ids: decorationIds,
				addedOrChangedDecorations: addedOrChangedDecorations,
				removedDecorations: removedDecorations,
				oldOptions: b.oldDecorationOptions,
				oldRanges: b.oldDecorationRange
			};
			this.emitModelDecorationsChangedEvent(e);
		}
	}

	private _getDecorationData(decorationId:string): editorCommon.IModelDecorationsChangedEventDecorationData {
		var decoration = this.decorations[decorationId];
		return {
			id: decoration.id,
			ownerId: decoration.ownerId,
			range: this.getTrackedRange(decoration.rangeId),
			isForValidation: false,
			options: decoration.options
		};
	}

	private emitModelDecorationsChangedEvent(e:editorCommon.IModelDecorationsChangedEvent): void {
		if (!this._isDisposing) {
			this.emit(editorCommon.EventType.ModelDecorationsChanged, e);
		}
	}

	private _normalizeDeltaDecorations(deltaDecorations:editorCommon.IModelDeltaDecoration[]): ModelDeltaDecoration[] {
		let result:ModelDeltaDecoration[] = [];
		for (let i = 0, len = deltaDecorations.length; i < len; i++) {
			let deltaDecoration = deltaDecorations[i];
			result.push(new ModelDeltaDecoration(i, this.validateRange(deltaDecoration.range), _normalizeOptions(deltaDecoration.options)));
		}
		return result;
	}

	private _addDecorationImpl(eventBuilder:DeferredEventsBuilder, ownerId:number, range:editorCommon.IEditorRange, options:ModelDecorationOptions): string {
		var rangeId = this.addTrackedRange(range, options.stickiness);

		var decoration = new ModelInternalDecoration(this._decorationIdGenerator.generate(), ownerId, rangeId, options);

		this.decorations[decoration.id] = decoration;
		this.rangeIdToDecorationId[rangeId] = decoration.id;

		eventBuilder.addNewDecoration(decoration.id);

		return decoration.id;
	}

	private _addDecorationsImpl(eventBuilder:DeferredEventsBuilder, ownerId:number, newDecorations: ModelDeltaDecoration[]): string[] {
		var rangeIds = this._addTrackedRanges(newDecorations.map(d => d.range), newDecorations.map(d => d.options.stickiness));
		var result: string[] = [];

		for (let i = 0, len = newDecorations.length; i < len; i++) {
			let rangeId = rangeIds[i];

			var decoration = new ModelInternalDecoration(this._decorationIdGenerator.generate(), ownerId, rangeId, newDecorations[i].options);

			this.decorations[decoration.id] = decoration;
			this.rangeIdToDecorationId[rangeId] = decoration.id;

			eventBuilder.addNewDecoration(decoration.id);

			result.push(decoration.id);
		}

		return result;
	}

	private _changeDecorationImpl(eventBuilder:DeferredEventsBuilder, id:string, newRange:editorCommon.IEditorRange): void {
		if (this.decorations.hasOwnProperty(id)) {
			var decoration = this.decorations[id];
			var oldRange = this.getTrackedRange(decoration.rangeId);

			this.changeTrackedRange(decoration.rangeId, newRange);

			eventBuilder.addMovedDecoration(id, oldRange);
		}
	}

	private _changeDecorationOptionsImpl(eventBuilder:DeferredEventsBuilder, id:string, options:ModelDecorationOptions): void {
		if (this.decorations.hasOwnProperty(id)) {
			var decoration = this.decorations[id];
			var oldOptions = decoration.options;

			if (oldOptions.stickiness !== options.stickiness) {
				this.changeTrackedRangeStickiness(decoration.rangeId, options.stickiness);
			}

			decoration.options = options;

			eventBuilder.addUpdatedDecoration(id, oldOptions);
		}
	}

	private _removeDecorationImpl(eventBuilder:DeferredEventsBuilder, id:string): void {
		if (this.decorations.hasOwnProperty(id)) {
			var decoration = this.decorations[id];
			var oldRange:editorCommon.IEditorRange = null;
			if (eventBuilder) {
				oldRange = this.getTrackedRange(decoration.rangeId);
			}

			this.removeTrackedRange(decoration.rangeId);
			delete this.rangeIdToDecorationId[decoration.rangeId];
			delete this.decorations[id];

			if (eventBuilder) {
				eventBuilder.addRemovedDecoration(id, decoration.ownerId, oldRange, decoration.options);
			}
		}
	}

	private _removeDecorationsImpl(eventBuilder:DeferredEventsBuilder, ids:string[]): void {
		var removeTrackedRanges: string[] = [];

		for (let i = 0, len = ids.length; i < len; i++) {
			let id = ids[i];

			if (!this.decorations.hasOwnProperty(id)) {
				continue;
			}

			let decoration = this.decorations[id];

			if (eventBuilder) {
				let oldRange = this.getTrackedRange(decoration.rangeId);
				eventBuilder.addRemovedDecoration(id, decoration.ownerId, oldRange, decoration.options);
			}

			removeTrackedRanges.push(decoration.rangeId);
			delete this.rangeIdToDecorationId[decoration.rangeId];
			delete this.decorations[id];
		}

		if (removeTrackedRanges.length > 0) {
			this.removeTrackedRanges(removeTrackedRanges);
		}
	}

	private _resolveOldDecorations(oldDecorations:string[]): IOldDecoration[] {
		let result:IOldDecoration[] = [];
		for (let i = 0, len = oldDecorations.length; i < len; i++) {
			let id = oldDecorations[i];
			if (!this.decorations.hasOwnProperty(id)) {
				continue;
			}

			let decoration = this.decorations[id];

			result.push({
				id: id,
				range: this.getTrackedRange(decoration.rangeId),
				options: decoration.options
			});
		}
		return result;
	}

	private _deltaDecorationsImpl(eventBuilder:DeferredEventsBuilder, ownerId:number, oldDecorationsIds:string[], newDecorations: ModelDeltaDecoration[]): string[] {

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

		let result:string[] = [],
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

function cleanClassName(className:string): string {
	return className.replace(/[^a-z0-9\-]/gi, ' ');
}

class ModelInternalDecoration implements IInternalDecoration {
	id:string;
	ownerId:number;
	rangeId:string;
	options:ModelDecorationOptions;

	constructor(id:string, ownerId:number, rangeId:string, options:ModelDecorationOptions) {
		this.id = id;
		this.ownerId = ownerId;
		this.rangeId = rangeId;
		this.options = options;
	}
}

class ModelDecorationOptions implements editorCommon.IModelDecorationOptions {

	stickiness:editorCommon.TrackedRangeStickiness;
	className:string;
	hoverMessage:string;
	htmlMessage:IHTMLContentElement[];
	isWholeLine:boolean;
	showInOverviewRuler:string;
	overviewRuler:editorCommon.IModelDecorationOverviewRulerOptions;
	glyphMarginClassName:string;
	linesDecorationsClassName:string;
	inlineClassName:string;

	constructor(options:editorCommon.IModelDecorationOptions) {
		this.stickiness = options.stickiness||editorCommon.TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges;
		this.className = cleanClassName(options.className||strings.empty);
		this.hoverMessage = options.hoverMessage||strings.empty;
		this.htmlMessage = options.htmlMessage||[];
		this.isWholeLine = options.isWholeLine||false;
		this.overviewRuler = _normalizeOverviewRulerOptions(options.overviewRuler, options.showInOverviewRuler);
		this.glyphMarginClassName = cleanClassName(options.glyphMarginClassName||strings.empty);
		this.linesDecorationsClassName = cleanClassName(options.linesDecorationsClassName||strings.empty);
		this.inlineClassName = cleanClassName(options.inlineClassName||strings.empty);
	}

	private static _overviewRulerEquals(a:editorCommon.IModelDecorationOverviewRulerOptions, b:editorCommon.IModelDecorationOverviewRulerOptions): boolean {
		return (
			a.color === b.color
			&& a.position === b.position
			&& a.darkColor === b.darkColor
		);
	}

	public equals(other:ModelDecorationOptions): boolean {
		return (
			this.stickiness === other.stickiness
			&& this.className === other.className
			&& this.hoverMessage === other.hoverMessage
			&& this.isWholeLine === other.isWholeLine
			&& this.showInOverviewRuler === other.showInOverviewRuler
			&& this.glyphMarginClassName === other.glyphMarginClassName
			&& this.linesDecorationsClassName === other.linesDecorationsClassName
			&& this.inlineClassName === other.inlineClassName
			&& htmlContentElementArrEquals(this.htmlMessage, other.htmlMessage)
			&& ModelDecorationOptions._overviewRulerEquals(this.overviewRuler, other.overviewRuler)
		);
	}
}

class ModelDeltaDecoration implements editorCommon.IModelDeltaDecoration {

	index: number;
	range: editorCommon.IEditorRange;
	options: ModelDecorationOptions;

	constructor(index: number, range: editorCommon.IEditorRange, options: ModelDecorationOptions) {
		this.index = index;
		this.range = range;
		this.options = options;
	}
}

function _normalizeOptions(options:editorCommon.IModelDecorationOptions): ModelDecorationOptions {
	return new ModelDecorationOptions(options);
}

class ModelDecorationOverviewRulerOptions implements editorCommon.IModelDecorationOverviewRulerOptions {
	color: string;
	darkColor: string;
	position: editorCommon.OverviewRulerLane;

	constructor(options:editorCommon.IModelDecorationOverviewRulerOptions, legacyShowInOverviewRuler:string) {
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

function _normalizeOverviewRulerOptions(options:editorCommon.IModelDecorationOverviewRulerOptions, legacyShowInOverviewRuler: string = null): editorCommon.IModelDecorationOverviewRulerOptions {
	return new ModelDecorationOverviewRulerOptions(options, legacyShowInOverviewRuler);
}
