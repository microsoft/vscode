/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../base/common/lifecycle.js';
import { Range } from '../core/range.js';
import { IEditorConfiguration } from '../config/editorConfiguration.js';
import { ITextModel } from '../model.js';
import { IViewModelLines } from './viewModelLines.js';
import { ViewModelDecoration } from './viewModelDecoration.js';
import { IDecorationsViewportData, IInlineDecorationsComputerContext, InlineDecorationsComputer } from './inlineDecorations.js';
import { ICoordinatesConverter } from '../coordinatesConverter.js';
import { filterFontDecorations, filterValidationDecorations } from '../config/editorOptions.js';

export class ViewModelDecorations implements IDisposable {

	private readonly editorId: number;
	private readonly configuration: IEditorConfiguration;
	private readonly _linesCollection: IViewModelLines;

	private readonly _inlineDecorationsComputer: InlineDecorationsComputer;

	private _cachedModelDecorationsResolver: IDecorationsViewportData | null;
	private _cachedModelDecorationsResolverViewRange: Range | null;

	constructor(editorId: number, model: ITextModel, configuration: IEditorConfiguration, linesCollection: IViewModelLines, coordinatesConverter: ICoordinatesConverter) {
		this.editorId = editorId;
		this.configuration = configuration;
		this._linesCollection = linesCollection;
		const context: IInlineDecorationsComputerContext = {
			getModelDecorations: (range: Range, onlyMinimapDecorations: boolean, onlyMarginDecorations: boolean) => this._linesCollection.getDecorationsInRange(range, this.editorId, filterValidationDecorations(this.configuration.options), filterFontDecorations(this.configuration.options), onlyMinimapDecorations, onlyMarginDecorations)
		};
		this._inlineDecorationsComputer = new InlineDecorationsComputer(context, model, coordinatesConverter);
		this._cachedModelDecorationsResolver = null;
		this._cachedModelDecorationsResolverViewRange = null;
	}

	private _clearCachedModelDecorationsResolver(): void {
		this._cachedModelDecorationsResolver = null;
		this._cachedModelDecorationsResolverViewRange = null;
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

	public getDecorationsViewportData(viewRange: Range): IDecorationsViewportData {
		let cacheIsValid = (this._cachedModelDecorationsResolver !== null);
		cacheIsValid = cacheIsValid && (viewRange.equalsRange(this._cachedModelDecorationsResolverViewRange));
		if (!cacheIsValid) {
			this._cachedModelDecorationsResolver = this._inlineDecorationsComputer.getDecorations(viewRange, false, false);
			this._cachedModelDecorationsResolverViewRange = viewRange;
		}
		return this._cachedModelDecorationsResolver!;
	}

	public getDecorationsOnLine(lineNumber: number, onlyMinimapDecorations: boolean = false, onlyMarginDecorations: boolean = false): IDecorationsViewportData {
		const range = new Range(lineNumber, this._linesCollection.getViewLineMinColumn(lineNumber), lineNumber, this._linesCollection.getViewLineMaxColumn(lineNumber));
		return this._inlineDecorationsComputer.getDecorations(range, onlyMinimapDecorations, onlyMarginDecorations);
	}
}
