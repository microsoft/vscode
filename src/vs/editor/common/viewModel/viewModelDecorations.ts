/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IDisposable } from 'vs/base/common/lifecycle';
import { Range } from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { InlineDecoration, ViewModelDecoration } from 'vs/editor/common/viewModel/viewModel';

export interface IModelRangeToViewRangeConverter {
	convertModelRangeToViewRange(modelRange: Range, isWholeLine: boolean): Range;
	convertViewRangeToModelRange(viewRange: Range): Range;
}

export interface IDecorationsViewportData {
	/**
	 * decorations in the viewport.
	 */
	readonly decorations: ViewModelDecoration[];
	/**
	 * inline decorations grouped by each line in the viewport.
	 */
	readonly inlineDecorations: InlineDecoration[][];
}

export class ViewModelDecorations implements IDisposable {

	private readonly editorId: number;
	private readonly model: editorCommon.IModel;
	private readonly configuration: editorCommon.IConfiguration;
	private readonly converter: IModelRangeToViewRangeConverter;

	private _decorationsCache: { [decorationId: string]: ViewModelDecoration; };

	private _cachedModelDecorationsResolver: IDecorationsViewportData;
	private _cachedModelDecorationsResolverViewRange: Range;

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
		this._cachedModelDecorationsResolverViewRange = null;
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

	public getDecorationsViewportData(viewRange: Range): IDecorationsViewportData {
		var cacheIsValid = true;
		cacheIsValid = cacheIsValid && (this._cachedModelDecorationsResolver !== null);
		cacheIsValid = cacheIsValid && (viewRange.equalsRange(this._cachedModelDecorationsResolverViewRange));
		if (!cacheIsValid) {
			this._cachedModelDecorationsResolver = this._getDecorationsViewportData(viewRange);
			this._cachedModelDecorationsResolverViewRange = viewRange;
		}
		return this._cachedModelDecorationsResolver;
	}

	private _getDecorationsViewportData(viewportRange: Range): IDecorationsViewportData {
		let viewportModelRange = this.converter.convertViewRangeToModelRange(viewportRange);
		let startLineNumber = viewportRange.startLineNumber;
		let endLineNumber = viewportRange.endLineNumber;
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
				let inlineDecoration = new InlineDecoration(viewRange, decorationOptions.inlineClassName, false);
				let intersectedStartLineNumber = Math.max(startLineNumber, viewRange.startLineNumber);
				let intersectedEndLineNumber = Math.min(endLineNumber, viewRange.endLineNumber);
				for (let j = intersectedStartLineNumber; j <= intersectedEndLineNumber; j++) {
					inlineDecorations[j - startLineNumber].push(inlineDecoration);
				}
			}
			if (decorationOptions.beforeContentClassName) {
				if (startLineNumber <= viewRange.startLineNumber && viewRange.startLineNumber <= endLineNumber) {
					// TODO: What happens if the startLineNumber and startColumn is at the end of a line?
					let inlineDecoration = new InlineDecoration(
						new Range(viewRange.startLineNumber, viewRange.startColumn, viewRange.startLineNumber, viewRange.startColumn + 1),
						decorationOptions.beforeContentClassName,
						true
					);
					inlineDecorations[viewRange.startLineNumber - startLineNumber].push(inlineDecoration);
				}
			}
			if (decorationOptions.afterContentClassName) {
				if (startLineNumber <= viewRange.endLineNumber && viewRange.endLineNumber <= endLineNumber && viewRange.endColumn > 1) {
					let inlineDecoration = new InlineDecoration(
						new Range(viewRange.endLineNumber, viewRange.endColumn - 1, viewRange.endLineNumber, viewRange.endColumn),
						decorationOptions.afterContentClassName,
						true
					);
					inlineDecorations[viewRange.endLineNumber - startLineNumber].push(inlineDecoration);
				}
			}
		}

		return {
			decorations: decorationsInViewport,
			inlineDecorations: inlineDecorations
		};
	}
}
