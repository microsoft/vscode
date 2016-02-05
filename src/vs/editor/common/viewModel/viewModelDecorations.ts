/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Range} from 'vs/editor/common/core/range';
import EditorCommon = require('vs/editor/common/editorCommon');
import {IDisposable} from 'vs/base/common/lifecycle';

export interface IModelRangeToViewRangeConverter {
	convertModelRangeToViewRange(modelRange:EditorCommon.IRange, isWholeLine:boolean): EditorCommon.IEditorRange;
}

interface IViewModelDecoration extends EditorCommon.IModelDecoration {
	modelRange: EditorCommon.IRange;
}

interface IViewModelDecorationSource {
	id: string;
	ownerId: number;
	range: EditorCommon.IRange;
	options: EditorCommon.IModelDecorationOptions;
}

class ViewModelDecoration implements IViewModelDecoration {
	id: string;
	ownerId: number;
	range: EditorCommon.IRange;
	options: EditorCommon.IModelDecorationOptions;
	modelRange: EditorCommon.IRange;

	constructor(source:IViewModelDecorationSource, range:EditorCommon.IRange) {
		this.id = source.id;
		this.options = source.options;
		this.ownerId = source.ownerId;
		this.modelRange = source.range;
		this.range = range;
	}
}

export class ViewModelDecorations implements IDisposable {

	private editorId:number;
	private configuration:EditorCommon.IConfiguration;
	private converter:IModelRangeToViewRangeConverter;
	private decorations:IViewModelDecoration[];

	private _cachedModelDecorationsResolver:EditorCommon.IViewModelDecorationsResolver;
	private _cachedModelDecorationsResolverStartLineNumber:number;
	private _cachedModelDecorationsResolverEndLineNumber:number;

	constructor(editorId:number, configuration:EditorCommon.IConfiguration, converter:IModelRangeToViewRangeConverter) {
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

	public static compareDecorations(a:EditorCommon.IModelDecoration, b:EditorCommon.IModelDecoration): number {
		return Range.compareRangesUsingStarts(a.range, b.range);
	}

	public reset(model:EditorCommon.IModel): void {
		var decorations = model.getAllDecorations(this.editorId, this.configuration.editor.readOnly),
			i:number,
			len:number,
			theirDecoration:EditorCommon.IModelDecoration,
			myDecoration:IViewModelDecoration;

		this.decorations = [];
		for (i = 0, len = decorations.length; i < len; i++) {
			theirDecoration = decorations[i];
			myDecoration = new ViewModelDecoration(theirDecoration, this.converter.convertModelRangeToViewRange(theirDecoration.range, theirDecoration.options.isWholeLine));
			this.decorations[i] = myDecoration;
		}
		this._clearCachedModelDecorationsResolver();
		this.decorations.sort(ViewModelDecorations.compareDecorations);
	}

	public onModelDecorationsChanged(e:EditorCommon.IModelDecorationsChangedEvent, emit:(eventType:string, payload:any)=>void): void {

		var somethingChanged = false,
			inlineDecorationsChanged = false;

		// -----------------------------------
		// Interpret addedOrChangedDecorations

		var removedMap:{[id:string]:boolean;} = {},
			addedOrChangedMap:{[id:string]:EditorCommon.IModelDecorationsChangedEventDecorationData;} = {},
			theirDecoration:EditorCommon.IModelDecorationsChangedEventDecorationData,
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
			myDecoration:IViewModelDecoration;

		for (i = 0, len = this.decorations.length; i < len; i++) {
			myDecoration = this.decorations[i];

			if (addedOrChangedMap.hasOwnProperty(myDecoration.id)) {
				usedMap[myDecoration.id] = true;
				theirDecoration = addedOrChangedMap[myDecoration.id];

				myDecoration.options = theirDecoration.options;
				myDecoration.modelRange = theirDecoration.range;
				myDecoration.range = this.converter.convertModelRangeToViewRange(theirDecoration.range, theirDecoration.options.isWholeLine);
//				console.log(theirDecoration.range.toString() + '--->' + myDecoration.range.toString());

				if (myDecoration.options.inlineClassName) {
					inlineDecorationsChanged = true;
				}
				somethingChanged = true;
			}

			if (removedMap.hasOwnProperty(myDecoration.id)) {
				if (this.decorations[i].options.inlineClassName) {
					inlineDecorationsChanged = true;
				}
				this.decorations.splice(i, 1);
				len--;
				i--;
				somethingChanged = true;
			}
		}

		// Interpret new decorations
		var id:string;
		for (id in addedOrChangedMap) {
			if (!usedMap.hasOwnProperty(id) && addedOrChangedMap.hasOwnProperty(id)) {
				theirDecoration = addedOrChangedMap[id];

				myDecoration = new ViewModelDecoration(theirDecoration, this.converter.convertModelRangeToViewRange(theirDecoration.range, theirDecoration.options.isWholeLine));
//				console.log(theirDecoration.range.toString() + '--->' + myDecoration.range.toString());
				this.decorations.push(myDecoration);
				if (myDecoration.options.inlineClassName) {
					inlineDecorationsChanged = true;
				}
				somethingChanged = true;
			}
		}

		if (somethingChanged) {
			this._clearCachedModelDecorationsResolver();
			this.decorations.sort(ViewModelDecorations.compareDecorations);
			var newEvent:EditorCommon.IViewDecorationsChangedEvent = {
				inlineDecorationsChanged: inlineDecorationsChanged
			};
			emit(EditorCommon.ViewEventNames.DecorationsChangedEvent, newEvent);
		}
	}

	public onLineMappingChanged(emit:(eventType:string, payload:any)=>void): void {
		var decorations = this.decorations,
			d:IViewModelDecoration,
			i:number,
			newRange:EditorCommon.IEditorRange,
			somethingChanged:boolean = false,
			inlineDecorationsChanged = false,
			len:number;

		for (i = 0, len = decorations.length; i < len; i++) {
			d = decorations[i];
			newRange = this.converter.convertModelRangeToViewRange(d.modelRange, d.options.isWholeLine);
			if (!inlineDecorationsChanged && d.options.inlineClassName && !Range.equalsRange(newRange, d.range)) {
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
			var newEvent:EditorCommon.IViewDecorationsChangedEvent = {
				inlineDecorationsChanged: inlineDecorationsChanged
			};
			emit(EditorCommon.ViewEventNames.DecorationsChangedEvent, newEvent);
		}
	}

	public getAllDecorations(): EditorCommon.IModelDecoration[] {
		return this.decorations;
	}

	public getDecorationsResolver(startLineNumber: number, endLineNumber: number): EditorCommon.IViewModelDecorationsResolver {
		var cacheIsValid = true;
		cacheIsValid = cacheIsValid && (this._cachedModelDecorationsResolver !== null);
		cacheIsValid = cacheIsValid && (this._cachedModelDecorationsResolverStartLineNumber === startLineNumber);
		cacheIsValid = cacheIsValid && (this._cachedModelDecorationsResolverEndLineNumber === endLineNumber);
		if (!cacheIsValid) {
			this._cachedModelDecorationsResolver = this._createDecorationsResolver(startLineNumber, endLineNumber);
			this._cachedModelDecorationsResolverStartLineNumber = startLineNumber;
			this._cachedModelDecorationsResolverEndLineNumber = endLineNumber;
		}
		return this._cachedModelDecorationsResolver;
	}

	private _createDecorationsResolver(startLineNumber: number, endLineNumber: number): EditorCommon.IViewModelDecorationsResolver {
		var decorationsInViewport: EditorCommon.IModelDecoration[] = [],
			inlineDecorations: EditorCommon.IModelDecoration[][] = [],
			j: number,
			intersectedStartLineNumber: number,
			intersectedEndLineNumber: number,
			decorations = this.decorations,
			d:EditorCommon.IModelDecoration,
			r:EditorCommon.IRange,
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
				intersectedStartLineNumber = Math.max(startLineNumber, r.startLineNumber);
				intersectedEndLineNumber = Math.min(endLineNumber, r.endLineNumber);
				for (j = intersectedStartLineNumber; j <= intersectedEndLineNumber; j++) {
					inlineDecorations[j - startLineNumber].push(d);
				}
			}
		}

		return {
			getDecorations: () => {
				return decorationsInViewport;
			},
			getInlineDecorations: (lineNumber:number) => {
				if (lineNumber < startLineNumber || lineNumber > endLineNumber) {
					throw new Error('Unexpected line outside the ViewModelDecorationsResolver preconfigured range');
				}
				return inlineDecorations[lineNumber - startLineNumber];
			}
		};
	}


}