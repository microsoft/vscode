/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../base/common/lifecycle.js';
import { Range } from '../core/range.js';
import { IEditorConfiguration } from '../config/editorConfiguration.js';
import { ITextModel, IModelDecoration } from '../model.js';
import { IViewModelLines } from './viewModelLines.js';
import { ViewModelDecoration } from './viewModelDecoration.js';
import { IViewDecorationsCollection, IInlineModelDecorationsComputerContext, InlineModelDecorationsComputer } from './inlineDecorations.js';
import { ICoordinatesConverter } from '../coordinatesConverter.js';
import { filterFontDecorations, filterValidationDecorations } from '../config/editorOptions.js';

export class ViewModelDecorations implements IDisposable {

	private readonly editorId: number;
	private readonly model: ITextModel;
	private readonly configuration: IEditorConfiguration;
	private readonly _linesCollection: IViewModelLines;

	private readonly _inlineDecorationsComputer: InlineModelDecorationsComputer;

	private _cachedModelDecorationsResolver: IViewDecorationsCollection | null;
	private _cachedModelDecorationsResolverViewRange: Range | null;
	private _cachedWiderModelDecorations: WiderRangeModelDecorations | null;

	constructor(editorId: number, model: ITextModel, configuration: IEditorConfiguration, linesCollection: IViewModelLines, coordinatesConverter: ICoordinatesConverter) {
		this.editorId = editorId;
		this.model = model;
		this.configuration = configuration;
		this._linesCollection = linesCollection;
		const context: IInlineModelDecorationsComputerContext = {
			getModelDecorations: (viewRange: Range, onlyMinimapDecorations: boolean, onlyMarginDecorations: boolean) => this._linesCollection.getDecorationsInRange(viewRange, this.editorId, filterValidationDecorations(this.configuration.options), filterFontDecorations(this.configuration.options), onlyMinimapDecorations, onlyMarginDecorations)
		};
		this._inlineDecorationsComputer = new InlineModelDecorationsComputer(context, model, coordinatesConverter);
		this._cachedModelDecorationsResolver = null;
		this._cachedModelDecorationsResolverViewRange = null;
		this._cachedWiderModelDecorations = null;
	}

	private _clearCachedModelDecorationsResolver(): void {
		this._cachedModelDecorationsResolver = null;
		this._cachedModelDecorationsResolverViewRange = null;
		this._cachedWiderModelDecorations = null;
	}

	public dispose(): void {
		this._inlineDecorationsComputer.reset();
		this._clearCachedModelDecorationsResolver();
	}

	public reset(): void {
		this._inlineDecorationsComputer.reset();
		this._clearCachedModelDecorationsResolver();
	}

	public onModelDecorationsChanged(): void {
		this._inlineDecorationsComputer.onModelDecorationsChanged();
		this._clearCachedModelDecorationsResolver();
	}

	public onLineMappingChanged(): void {
		this._inlineDecorationsComputer.onLineMappingChanged();

		this._clearCachedModelDecorationsResolver();
	}

	public getMinimapDecorationsInRange(range: Range): ViewModelDecoration[] {
		return this._inlineDecorationsComputer.getDecorations(range, true, false).decorations;
	}

	public getDecorationsViewportData(viewRange: Range): IViewDecorationsCollection {
		let cacheIsValid = (this._cachedModelDecorationsResolver !== null);
		cacheIsValid = cacheIsValid && (viewRange.equalsRange(this._cachedModelDecorationsResolverViewRange));
		if (!cacheIsValid) {
			const modelDecorations = this._getModelDecorationsFromWiderRange(viewRange);
			this._cachedModelDecorationsResolver = (modelDecorations
				? this._inlineDecorationsComputer.getDecorationsFromModelDecorations(viewRange, modelDecorations)
				: this._inlineDecorationsComputer.getDecorations(viewRange, false, false)
			);
			this._cachedModelDecorationsResolverViewRange = viewRange;
		}
		return this._cachedModelDecorationsResolver!;
	}

	/**
	 * Scrolling asks for the decorations of a different viewport on every frame. So when only the viewport moved
	 * since the last query, this reads the model decorations of a range one viewport height beyond each side of it,
	 * and answers the next viewports inside that range from them, without querying the model again.
	 * Returns the model decorations of `viewRange`, or `null` to read them from the model for exactly `viewRange`:
	 * after decorations or the line mapping changed (typing), so that changes don't pay for the wider range.
	 */
	private _getModelDecorationsFromWiderRange(viewRange: Range): IModelDecoration[] | null {
		const modelRange = this._linesCollection.getDecorationsModelRange(viewRange);
		if (!modelRange) {
			return null;
		}
		const filterOutValidation = filterValidationDecorations(this.configuration.options);
		const filterFonts = filterFontDecorations(this.configuration.options);
		if (this._cachedWiderModelDecorations?.covers(modelRange, filterOutValidation, filterFonts)) {
			return this._cachedWiderModelDecorations.getDecorationsInRange(modelRange);
		}

		const previousViewRange = this._cachedModelDecorationsResolverViewRange;
		if (!previousViewRange || viewRange.startLineNumber > previousViewRange.endLineNumber || viewRange.endLineNumber < previousViewRange.startLineNumber) {
			// Something changed since the last query, or the viewport jumped by more than its height.
			return null;
		}
		const viewportLineCount = viewRange.endLineNumber - viewRange.startLineNumber + 1;
		const startLineNumber = Math.max(1, viewRange.startLineNumber - viewportLineCount);
		const endLineNumber = Math.min(this._linesCollection.getViewLineCount(), viewRange.endLineNumber + viewportLineCount);
		const widerViewRange = new Range(startLineNumber, this._linesCollection.getViewLineMinColumn(startLineNumber), endLineNumber, this._linesCollection.getViewLineMaxColumn(endLineNumber));
		const widerModelRange = this._linesCollection.getDecorationsModelRange(widerViewRange);
		if (!widerModelRange || !widerModelRange.containsRange(modelRange)) {
			this._cachedWiderModelDecorations = null;
			return null;
		}
		const modelDecorations = this._linesCollection.getDecorationsInRange(widerViewRange, this.editorId, filterOutValidation, filterFonts, false, false);
		this._cachedWiderModelDecorations = new WiderRangeModelDecorations(this.model, widerModelRange, modelDecorations, filterOutValidation, filterFonts);
		return this._cachedWiderModelDecorations.getDecorationsInRange(modelRange);
	}

	public getDecorationsOnLine(lineNumber: number, onlyMinimapDecorations: boolean = false, onlyMarginDecorations: boolean = false): IViewDecorationsCollection {
		const range = new Range(lineNumber, this._linesCollection.getViewLineMinColumn(lineNumber), lineNumber, this._linesCollection.getViewLineMaxColumn(lineNumber));
		return this._inlineDecorationsComputer.getDecorations(range, onlyMinimapDecorations, onlyMarginDecorations);
	}
}

/**
 * The model decorations of a model range, from which those of the model ranges inside it are read without querying the model.
 * Like the decorations of the last viewport, these are not refreshed when the model moves its tracked ranges, which it does
 * without notifying, and which render nothing.
 */
class WiderRangeModelDecorations {

	private readonly _versionId: number;

	constructor(
		private readonly _model: ITextModel,
		private readonly _modelRange: Range,
		private readonly _modelDecorations: IModelDecoration[],
		private readonly _filterOutValidation: boolean,
		private readonly _filterFontDecorations: boolean,
	) {
		this._versionId = _model.getVersionId();
	}

	/**
	 * Whether these can tell the decorations of `modelRange`: the model's text did not change since they were read
	 * (edits notify decoration changes only after the content change), they were read with the same filters,
	 * and `modelRange` is inside the range they were read for.
	 */
	public covers(modelRange: Range, filterOutValidation: boolean, filterFontDecorations: boolean): boolean {
		return (
			this._model.getVersionId() === this._versionId
			&& filterOutValidation === this._filterOutValidation
			&& filterFontDecorations === this._filterFontDecorations
			&& this._modelRange.containsRange(modelRange)
		);
	}

	/**
	 * The decorations that the model returns for `modelRange`, a range this {@link covers}, in the same order:
	 * those that intersect or touch it. `null` when the model's sources of decorations could disagree on it.
	 */
	public getDecorationsInRange(modelRange: Range): IModelDecoration[] | null {
		const { startLineNumber, startColumn, endLineNumber, endColumn } = modelRange;
		const endsInsideLine = (endColumn < this._model.getLineMaxColumn(endLineNumber));
		const result: IModelDecoration[] = [];
		for (const decoration of this._modelDecorations) {
			const range = decoration.range;
			if (range.startLineNumber > endLineNumber || (range.startLineNumber === endLineNumber && range.startColumn > endColumn)) {
				continue;
			}
			if (range.endLineNumber < startLineNumber || (range.endLineNumber === startLineNumber && range.endColumn < startColumn)) {
				continue;
			}
			if (endsInsideLine && range.startLineNumber === endLineNumber && range.startColumn === endColumn) {
				// Bracket pair colorization stops at the first node that reaches the end of the range,
				// so it may leave out a bracket that starts exactly there (at a wrapped line's end).
				return null;
			}
			if (range.endLineNumber === startLineNumber && range.endColumn === startColumn && !range.isEmpty()) {
				// Font token decorations leave out those that end exactly at the start of the range.
				return null;
			}
			result.push(decoration);
		}
		return result;
	}
}
