/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IDisposable} from 'vs/base/common/lifecycle';
import {Range} from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {IDecorationsViewportData, InlineDecoration} from 'vs/editor/common/viewModel/viewModel';

export interface IModelRangeToViewRangeConverter {
	convertModelRangeToViewRange(modelRange:editorCommon.IRange, isWholeLine:boolean): Range;
}

interface IViewModelDecorationSource {
	id: string;
	ownerId: number;
	range: editorCommon.IRange;
	options: editorCommon.IModelDecorationOptions;
}

class ViewModelDecoration {
	id: string;
	ownerId: number;
	range: Range;
	options: editorCommon.IModelDecorationOptions;
	modelRange: editorCommon.IRange;

	constructor(source:IViewModelDecorationSource, range:Range) {
		this.id = source.id;
		this.options = source.options;
		this.ownerId = source.ownerId;
		this.modelRange = source.range;
		this.range = range;
	}
}

export class ViewModelDecorations implements IDisposable {

	private editorId:number;
	private configuration:editorCommon.IConfiguration;
	private converter:IModelRangeToViewRangeConverter;
	private decorations:ViewModelDecoration[];

	private _cachedModelDecorationsResolver:IDecorationsViewportData;
	private _cachedModelDecorationsResolverStartLineNumber:number;
	private _cachedModelDecorationsResolverEndLineNumber:number;

	constructor(editorId:number, configuration:editorCommon.IConfiguration, converter:IModelRangeToViewRangeConverter) {
		this.editorId = editorId;
		this.configuration = configuration;
		this.converter = converter;
		this.decorations = [];

		this._clearCachedModelDecorationsResolver();
	}

	private _clearCachedModelDecorationsResolver(): void {
		this._cachedModelDecorationsResolver = null;
		this._cachedModelDecorationsResolverStartLineNumber = 0;
		this._cachedModelDecorationsResolverEndLineNumber = 0;
	}

	public dispose(): void {
		this.converter = null;
		this.decorations = null;
		this._clearCachedModelDecorationsResolver();
	}

	public static compareDecorations(a:editorCommon.IModelDecoration, b:editorCommon.IModelDecoration): number {
		return Range.compareRangesUsingStarts(a.range, b.range);
	}

	public reset(model:editorCommon.IModel): void {
		var decorations = model.getAllDecorations(this.editorId, this.configuration.editor.readOnly),
			i:number,
			len:number,
			theirDecoration:editorCommon.IModelDecoration,
			myDecoration:ViewModelDecoration;

		this.decorations = [];
		for (i = 0, len = decorations.length; i < len; i++) {
			theirDecoration = decorations[i];
			myDecoration = new ViewModelDecoration(theirDecoration, this.converter.convertModelRangeToViewRange(theirDecoration.range, theirDecoration.options.isWholeLine));
			this.decorations[i] = myDecoration;
		}
		this._clearCachedModelDecorationsResolver();
		this.decorations.sort(ViewModelDecorations.compareDecorations);
	}

	public onModelDecorationsChanged(e:editorCommon.IModelDecorationsChangedEvent, emit:(eventType:string, payload:any)=>void): void {

		var somethingChanged = false,
			inlineDecorationsChanged = false;

		// -----------------------------------
		// Interpret addedOrChangedDecorations

		var removedMap:{[id:string]:boolean;} = {},
			addedOrChangedMap:{[id:string]:editorCommon.IModelDecorationsChangedEventDecorationData;} = {},
			theirDecoration:editorCommon.IModelDecorationsChangedEventDecorationData,
			i:number,
			skipValidation = this.configuration.editor.readOnly,
			len:number;

		for (i = 0, len = e.addedOrChangedDecorations.length; i < len; i++) {
			theirDecoration = e.addedOrChangedDecorations[i];
			if (skipValidation && theirDecoration.isForValidation) {
				continue;
			}
			if (theirDecoration.ownerId && theirDecoration.ownerId !== this.editorId) {
				continue;
			}
			addedOrChangedMap[theirDecoration.id] = theirDecoration;
		}

		for (i = 0, len = e.removedDecorations.length; i < len; i++) {
			removedMap[e.removedDecorations[i]] = true;
		}

		// Interpret changed decorations
		var usedMap:{[id:string]:boolean;} = {},
			myDecoration:ViewModelDecoration;

		for (i = 0, len = this.decorations.length; i < len; i++) {
			myDecoration = this.decorations[i];

			if (addedOrChangedMap.hasOwnProperty(myDecoration.id)) {
				usedMap[myDecoration.id] = true;
				theirDecoration = addedOrChangedMap[myDecoration.id];

				myDecoration.options = theirDecoration.options;
				myDecoration.modelRange = theirDecoration.range;
				myDecoration.range = this.converter.convertModelRangeToViewRange(theirDecoration.range, theirDecoration.options.isWholeLine);
//				console.log(theirDecoration.range.toString() + '--->' + myDecoration.range.toString());
				inlineDecorationsChanged = inlineDecorationsChanged || hasInlineChanges(myDecoration);
				somethingChanged = true;
			}

			if (removedMap.hasOwnProperty(myDecoration.id)) {
				inlineDecorationsChanged = inlineDecorationsChanged || hasInlineChanges(this.decorations[i]);
				this.decorations.splice(i, 1);
				len--;
				i--;
				somethingChanged = true;
			}
		}

		// Interpret new decorations
		let keys = Object.keys(addedOrChangedMap);
		for (let i = 0, len = keys.length; i < len; i++) {
			let id = keys[i];
			if (!usedMap.hasOwnProperty(id)) {
				theirDecoration = addedOrChangedMap[id];

				myDecoration = new ViewModelDecoration(theirDecoration, this.converter.convertModelRangeToViewRange(theirDecoration.range, theirDecoration.options.isWholeLine));
//				console.log(theirDecoration.range.toString() + '--->' + myDecoration.range.toString());
				this.decorations.push(myDecoration);
				inlineDecorationsChanged = inlineDecorationsChanged || hasInlineChanges(myDecoration);
				somethingChanged = true;
			}
		}

		if (somethingChanged) {
			this._clearCachedModelDecorationsResolver();
			this.decorations.sort(ViewModelDecorations.compareDecorations);
			var newEvent:editorCommon.IViewDecorationsChangedEvent = {
				inlineDecorationsChanged: inlineDecorationsChanged
			};
			emit(editorCommon.ViewEventNames.DecorationsChangedEvent, newEvent);
		}
	}

	public onLineMappingChanged(emit:(eventType:string, payload:any)=>void): void {
		var decorations = this.decorations,
			d:ViewModelDecoration,
			i:number,
			newRange:Range,
			somethingChanged:boolean = false,
			inlineDecorationsChanged = false,
			len:number;

		for (i = 0, len = decorations.length; i < len; i++) {
			d = decorations[i];
			newRange = this.converter.convertModelRangeToViewRange(d.modelRange, d.options.isWholeLine);
			if (!inlineDecorationsChanged && hasInlineChanges(d) && !Range.equalsRange(newRange, d.range)) {
				inlineDecorationsChanged = true;
			}
			if (!somethingChanged && !Range.equalsRange(newRange, d.range)) {
				somethingChanged = true;
			}
			d.range = newRange;
		}

		if (somethingChanged) {
			this._clearCachedModelDecorationsResolver();
			this.decorations.sort(ViewModelDecorations.compareDecorations);
			var newEvent:editorCommon.IViewDecorationsChangedEvent = {
				inlineDecorationsChanged: inlineDecorationsChanged
			};
			emit(editorCommon.ViewEventNames.DecorationsChangedEvent, newEvent);
		}
	}

	public getAllDecorations(): editorCommon.IModelDecoration[] {
		return this.decorations;
	}

	public getDecorationsViewportData(startLineNumber: number, endLineNumber: number): IDecorationsViewportData {
		var cacheIsValid = true;
		cacheIsValid = cacheIsValid && (this._cachedModelDecorationsResolver !== null);
		cacheIsValid = cacheIsValid && (this._cachedModelDecorationsResolverStartLineNumber === startLineNumber);
		cacheIsValid = cacheIsValid && (this._cachedModelDecorationsResolverEndLineNumber === endLineNumber);
		if (!cacheIsValid) {
			this._cachedModelDecorationsResolver = this._getDecorationsViewportData(startLineNumber, endLineNumber);
			this._cachedModelDecorationsResolverStartLineNumber = startLineNumber;
			this._cachedModelDecorationsResolverEndLineNumber = endLineNumber;
		}
		return this._cachedModelDecorationsResolver;
	}

	private _getDecorationsViewportData(startLineNumber: number, endLineNumber: number): IDecorationsViewportData {
		var decorationsInViewport: editorCommon.IModelDecoration[] = [],
			inlineDecorations: InlineDecoration[][] = [],
			j: number,
			intersectedStartLineNumber: number,
			intersectedEndLineNumber: number,
			decorations = this.decorations,
			d:ViewModelDecoration,
			r:editorCommon.IRange,
			i:number,
			len:number;

		for (j = startLineNumber; j <= endLineNumber; j++) {
			inlineDecorations[j - startLineNumber] = [];
		}

		for (i = 0, len = decorations.length; i < len; i++) {
			d = decorations[i];
			r = d.range;
			if (r.startLineNumber > endLineNumber) {
				// Decorations are sorted ascending by line number, it is safe to stop now
				break;
			}
			if (r.endLineNumber < startLineNumber) {
				continue;
			}

			decorationsInViewport.push(d);

			if (d.options.inlineClassName) {
				let inlineDecoration = new InlineDecoration(d.range, d.options.inlineClassName);
				intersectedStartLineNumber = Math.max(startLineNumber, r.startLineNumber);
				intersectedEndLineNumber = Math.min(endLineNumber, r.endLineNumber);
				for (j = intersectedStartLineNumber; j <= intersectedEndLineNumber; j++) {
					insert(inlineDecoration, inlineDecorations[j - startLineNumber]);
				}
			}
			if (d.options.beforeContentClassName && r.startLineNumber >= startLineNumber) {
				// TODO: What happens if the startLineNumber and startColumn is at the end of a line?
				let inlineDecoration = new InlineDecoration(
					new Range(r.startLineNumber, r.startColumn, r.startLineNumber, r.startColumn + 1),
					d.options.beforeContentClassName
				);
				insert(inlineDecoration, inlineDecorations[r.startLineNumber - startLineNumber]);
			}
			if (d.options.afterContentClassName && r.endLineNumber <= endLineNumber) {
				if (r.endColumn > 1) {
					let inlineDecoration = new InlineDecoration(
						new Range(r.endLineNumber, r.endColumn - 1, r.endLineNumber, r.endColumn),
						d.options.afterContentClassName
					);
					insert(inlineDecoration, inlineDecorations[r.endLineNumber - startLineNumber]);
				}
			}
		}

		return {
			decorations: decorationsInViewport,
			inlineDecorations: inlineDecorations
		};
	}
}

// insert sorted by startColumn. All decorations are already sorted but this is necessary
// as the startColumn of 'afterContent'-InlineDecoration is different from the decoration startColumn.
function insert(decoration: InlineDecoration, decorations: InlineDecoration[]) {
	let startColumn = decoration.range.startColumn;
	let last = decorations.length - 1;
	let idx = last;
	while (idx >= 0 && decorations[idx].range.startColumn > startColumn) {
		idx--;
	}
	if (idx === last) {
		decorations.push(decoration);
	} else {
		decorations.splice(idx + 1, 0, decoration);
	}

}

function hasInlineChanges(decoration:editorCommon.IModelDecoration) : boolean {
	let options = decoration.options;
	return !!(options.inlineClassName || options.beforeContentClassName || options.afterContentClassName);
}