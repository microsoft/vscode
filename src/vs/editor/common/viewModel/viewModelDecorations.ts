/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IDisposable } from 'vs/base/common/lifecycle';
import { Range } from 'vs/editor/common/core/range';
import { Constants } from 'vs/base/common/numbers';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { IDecorationsViewportData, InlineDecoration, ViewModelDecoration } from 'vs/editor/common/viewModel/viewModel';

export interface IModelRangeToViewRangeConverter {
	convertModelRangeToViewRange(modelRange: Range, isWholeLine: boolean): Range;
	convertViewRangeToModelRange(viewRange: Range): Range;
}

export class ViewModelDecorations implements IDisposable {

	private readonly editorId: number;
	private readonly model: editorCommon.IModel;
	private readonly configuration: editorCommon.IConfiguration;
	private readonly converter: IModelRangeToViewRangeConverter;

	private _decorationsCache: { [decorationId: string]: ViewModelDecoration; };

	private _cachedModelDecorationsResolver: IDecorationsViewportData;
	private _cachedModelDecorationsResolverStartLineNumber: number;
	private _cachedModelDecorationsResolverEndLineNumber: number;

	constructor(editorId: number, model: editorCommon.IModel, configuration: editorCommon.IConfiguration, converter: IModelRangeToViewRangeConverter) {
		this.editorId = editorId;
		this.model = model;
		this.configuration = configuration;
		this.converter = converter;
		this._decorationsCache = Object.create(null);

		this._clearCachedModelDecorationsResolver();
	}

	private _clearCachedModelDecorationsResolver(): void {
		this._cachedModelDecorationsResolver = null;
		this._cachedModelDecorationsResolverStartLineNumber = 0;
		this._cachedModelDecorationsResolverEndLineNumber = 0;
	}

	public dispose(): void {
		this._decorationsCache = null;
		this._clearCachedModelDecorationsResolver();
	}

	public reset(): void {
		this._decorationsCache = Object.create(null);
		this._clearCachedModelDecorationsResolver();
	}

	public onModelDecorationsChanged(e: editorCommon.IModelDecorationsChangedEvent, emit: (eventType: string, payload: any) => void): void {
		let changedDecorations = e.changedDecorations;
		for (let i = 0, len = changedDecorations.length; i < len; i++) {
			let changedDecoration = changedDecorations[i];
			let myDecoration = this._decorationsCache[changedDecoration];
			if (!myDecoration) {
				continue;
			}

			myDecoration.range = null;
		}

		let removedDecorations = e.removedDecorations;
		for (let i = 0, len = removedDecorations.length; i < len; i++) {
			let removedDecoration = removedDecorations[i];
			delete this._decorationsCache[removedDecoration];
		}

		this._clearCachedModelDecorationsResolver();
		emit(editorCommon.ViewEventNames.DecorationsChangedEvent, {});
	}

	public onLineMappingChanged(emit: (eventType: string, payload: any) => void): void {
		this._decorationsCache = Object.create(null);

		this._clearCachedModelDecorationsResolver();
		emit(editorCommon.ViewEventNames.DecorationsChangedEvent, {});
	}

	private _getOrCreateViewModelDecoration(modelDecoration: editorCommon.IModelDecoration): ViewModelDecoration {
		let id = modelDecoration.id;
		let r = this._decorationsCache[id];
		if (!r) {
			r = new ViewModelDecoration(modelDecoration);
			this._decorationsCache[id] = r;
		}
		if (r.range === null) {
			r.range = this.converter.convertModelRangeToViewRange(modelDecoration.range, modelDecoration.options.isWholeLine);
		}
		return r;
	}

	public getAllOverviewRulerDecorations(): ViewModelDecoration[] {
		let modelDecorations = this.model.getAllDecorations(this.editorId, this.configuration.editor.readOnly);
		let result: ViewModelDecoration[] = [], resultLen = 0;
		for (let i = 0, len = modelDecorations.length; i < len; i++) {
			let modelDecoration = modelDecorations[i];
			let decorationOptions = modelDecoration.options;

			if (!decorationOptions.overviewRuler.color) {
				continue;
			}

			let viewModelDecoration = this._getOrCreateViewModelDecoration(modelDecoration);
			result[resultLen++] = viewModelDecoration;
		}
		return result;
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
		let viewportModelRange = this.converter.convertViewRangeToModelRange(
			new Range(startLineNumber, 1, endLineNumber, Constants.MAX_SAFE_SMALL_INTEGER)
		);
		let modelDecorations = this.model.getDecorationsInRange(viewportModelRange, this.editorId, this.configuration.editor.readOnly);

		let decorationsInViewport: ViewModelDecoration[] = [], decorationsInViewportLen = 0;
		let inlineDecorations: InlineDecoration[][] = [];
		for (let j = startLineNumber; j <= endLineNumber; j++) {
			inlineDecorations[j - startLineNumber] = [];
		}

		for (let i = 0, len = modelDecorations.length; i < len; i++) {
			let modelDecoration = modelDecorations[i];
			let decorationOptions = modelDecoration.options;

			let viewModelDecoration = this._getOrCreateViewModelDecoration(modelDecoration);
			let viewRange = viewModelDecoration.range;

			decorationsInViewport[decorationsInViewportLen++] = viewModelDecoration;

			if (decorationOptions.inlineClassName) {
				let inlineDecoration = new InlineDecoration(viewRange, decorationOptions.inlineClassName);
				let intersectedStartLineNumber = Math.max(startLineNumber, viewRange.startLineNumber);
				let intersectedEndLineNumber = Math.min(endLineNumber, viewRange.endLineNumber);
				for (let j = intersectedStartLineNumber; j <= intersectedEndLineNumber; j++) {
					insert(inlineDecoration, inlineDecorations[j - startLineNumber]);
				}
			}
			if (decorationOptions.beforeContentClassName && viewRange.startLineNumber >= startLineNumber) {
				// TODO: What happens if the startLineNumber and startColumn is at the end of a line?
				let inlineDecoration = new InlineDecoration(
					new Range(viewRange.startLineNumber, viewRange.startColumn, viewRange.startLineNumber, viewRange.startColumn + 1),
					decorationOptions.beforeContentClassName
				);
				insert(inlineDecoration, inlineDecorations[viewRange.startLineNumber - startLineNumber]);
			}
			if (decorationOptions.afterContentClassName && viewRange.endLineNumber <= endLineNumber) {
				if (viewRange.endColumn > 1) {
					let inlineDecoration = new InlineDecoration(
						new Range(viewRange.endLineNumber, viewRange.endColumn - 1, viewRange.endLineNumber, viewRange.endColumn),
						decorationOptions.afterContentClassName
					);
					insert(inlineDecoration, inlineDecorations[viewRange.endLineNumber - startLineNumber]);
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
