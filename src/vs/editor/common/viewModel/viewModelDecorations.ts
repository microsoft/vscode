/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../base/common/lifecycle.js';
import { Position } from '../core/position.js';
import { Range } from '../core/range.js';
import { IEditorConfiguration } from '../config/editorConfiguration.js';
import { IModelDecoration, ITextModel, PositionAffinity } from '../model.js';
import { IViewModelLines } from './viewModelLines.js';
import { ICoordinatesConverter, ViewModelDecoration } from '../viewModel.js';
import { filterFontDecorations, filterValidationDecorations } from '../config/editorOptions.js';
import { StandardTokenType } from '../encodedTokenAttributes.js';
import { InlineDecoration, InlineDecorationType } from './inlineDecorations.js';

export interface IDecorationsViewportData {
	/**
	 * decorations in the viewport.
	 */
	readonly decorations: ViewModelDecoration[];
	/**
	 * inline decorations grouped by each line in the viewport.
	 */
	readonly inlineDecorations: InlineDecoration[][];
	/**
	 * Whether the decorations affects the fonts.
	 */
	readonly hasVariableFonts: boolean;
}

export class ViewModelDecorations implements IDisposable {

	private readonly editorId: number;
	private readonly model: ITextModel;
	private readonly configuration: IEditorConfiguration;
	private readonly _linesCollection: IViewModelLines;
	private readonly _coordinatesConverter: ICoordinatesConverter;

	private _decorationsCache: { [decorationId: string]: ViewModelDecoration };

	private _cachedModelDecorationsResolver: IDecorationsViewportData | null;
	private _cachedModelDecorationsResolverViewRange: Range | null;

	constructor(editorId: number, model: ITextModel, configuration: IEditorConfiguration, linesCollection: IViewModelLines, coordinatesConverter: ICoordinatesConverter) {
		this.editorId = editorId;
		this.model = model;
		this.configuration = configuration;
		this._linesCollection = linesCollection;
		this._coordinatesConverter = coordinatesConverter;
		this._decorationsCache = Object.create(null);
		this._cachedModelDecorationsResolver = null;
		this._cachedModelDecorationsResolverViewRange = null;
	}

	private _clearCachedModelDecorationsResolver(): void {
		this._cachedModelDecorationsResolver = null;
		this._cachedModelDecorationsResolverViewRange = null;
	}

	public dispose(): void {
		this._decorationsCache = Object.create(null);
		this._clearCachedModelDecorationsResolver();
	}

	public reset(): void {
		this._decorationsCache = Object.create(null);
		this._clearCachedModelDecorationsResolver();
	}

	public onModelDecorationsChanged(): void {
		this._decorationsCache = Object.create(null);
		this._clearCachedModelDecorationsResolver();
	}

	public onLineMappingChanged(): void {
		this._decorationsCache = Object.create(null);

		this._clearCachedModelDecorationsResolver();
	}

	private _getOrCreateViewModelDecoration(modelDecoration: IModelDecoration): ViewModelDecoration {
		const id = modelDecoration.id;
		let r = this._decorationsCache[id];
		if (!r) {
			const modelRange = modelDecoration.range;
			const options = modelDecoration.options;
			let viewRange: Range;
			if (options.isWholeLine) {
				const start = this._coordinatesConverter.convertModelPositionToViewPosition(new Position(modelRange.startLineNumber, 1), PositionAffinity.Left, false, true);
				const end = this._coordinatesConverter.convertModelPositionToViewPosition(new Position(modelRange.endLineNumber, this.model.getLineMaxColumn(modelRange.endLineNumber)), PositionAffinity.Right);
				viewRange = new Range(start.lineNumber, start.column, end.lineNumber, end.column);
			} else {
				// For backwards compatibility reasons, we want injected text before any decoration.
				// Thus, move decorations to the right.
				viewRange = this._coordinatesConverter.convertModelRangeToViewRange(modelRange, PositionAffinity.Right);
			}
			r = new ViewModelDecoration(viewRange, options);
			this._decorationsCache[id] = r;
		}
		return r;
	}

	public getMinimapDecorationsInRange(range: Range): ViewModelDecoration[] {
		return this._getDecorationsInRange(range, true, false).decorations;
	}

	public getDecorationsViewportData(viewRange: Range): IDecorationsViewportData {
		let cacheIsValid = (this._cachedModelDecorationsResolver !== null);
		cacheIsValid = cacheIsValid && (viewRange.equalsRange(this._cachedModelDecorationsResolverViewRange));
		if (!cacheIsValid) {
			this._cachedModelDecorationsResolver = this._getDecorationsInRange(viewRange, false, false);
			this._cachedModelDecorationsResolverViewRange = viewRange;
		}
		return this._cachedModelDecorationsResolver!;
	}

	public getInlineDecorationsOnLine(lineNumber: number, onlyMinimapDecorations: boolean = false, onlyMarginDecorations: boolean = false): { inlineDecorations: InlineDecoration[]; hasVariableFonts: boolean } {
		const range = new Range(lineNumber, this._linesCollection.getViewLineMinColumn(lineNumber), lineNumber, this._linesCollection.getViewLineMaxColumn(lineNumber));
		const decorations = this._getDecorationsInRange(range, onlyMinimapDecorations, onlyMarginDecorations);
		return { inlineDecorations: decorations.inlineDecorations[0], hasVariableFonts: decorations.hasVariableFonts };
	}

	private _getDecorationsInRange(viewRange: Range, onlyMinimapDecorations: boolean, onlyMarginDecorations: boolean): IDecorationsViewportData {
		const modelDecorations = this._linesCollection.getDecorationsInRange(viewRange, this.editorId, filterValidationDecorations(this.configuration.options), filterFontDecorations(this.configuration.options), onlyMinimapDecorations, onlyMarginDecorations);
		const startLineNumber = viewRange.startLineNumber;
		const endLineNumber = viewRange.endLineNumber;

		const decorationsInViewport: ViewModelDecoration[] = [];
		let decorationsInViewportLen = 0;
		const inlineDecorations: InlineDecoration[][] = [];
		for (let j = startLineNumber; j <= endLineNumber; j++) {
			inlineDecorations[j - startLineNumber] = [];
		}

		let hasVariableFonts = false;
		for (let i = 0, len = modelDecorations.length; i < len; i++) {
			const modelDecoration = modelDecorations[i];
			const decorationOptions = modelDecoration.options;

			if (!isModelDecorationVisible(this.model, modelDecoration)) {
				continue;
			}

			const viewModelDecoration = this._getOrCreateViewModelDecoration(modelDecoration);
			const viewRange = viewModelDecoration.range;

			decorationsInViewport[decorationsInViewportLen++] = viewModelDecoration;

			if (decorationOptions.inlineClassName) {
				const inlineDecoration = new InlineDecoration(viewRange, decorationOptions.inlineClassName, decorationOptions.inlineClassNameAffectsLetterSpacing ? InlineDecorationType.RegularAffectingLetterSpacing : InlineDecorationType.Regular);
				const intersectedStartLineNumber = Math.max(startLineNumber, viewRange.startLineNumber);
				const intersectedEndLineNumber = Math.min(endLineNumber, viewRange.endLineNumber);
				for (let j = intersectedStartLineNumber; j <= intersectedEndLineNumber; j++) {
					inlineDecorations[j - startLineNumber].push(inlineDecoration);
				}
			}
			if (decorationOptions.beforeContentClassName) {
				if (startLineNumber <= viewRange.startLineNumber && viewRange.startLineNumber <= endLineNumber) {
					const inlineDecoration = new InlineDecoration(
						new Range(viewRange.startLineNumber, viewRange.startColumn, viewRange.startLineNumber, viewRange.startColumn),
						decorationOptions.beforeContentClassName,
						InlineDecorationType.Before
					);
					inlineDecorations[viewRange.startLineNumber - startLineNumber].push(inlineDecoration);
				}
			}
			if (decorationOptions.afterContentClassName) {
				if (startLineNumber <= viewRange.endLineNumber && viewRange.endLineNumber <= endLineNumber) {
					const inlineDecoration = new InlineDecoration(
						new Range(viewRange.endLineNumber, viewRange.endColumn, viewRange.endLineNumber, viewRange.endColumn),
						decorationOptions.afterContentClassName,
						InlineDecorationType.After
					);
					inlineDecorations[viewRange.endLineNumber - startLineNumber].push(inlineDecoration);
				}
			}
			if (decorationOptions.affectsFont) {
				hasVariableFonts = true;
			}
		}

		return {
			decorations: decorationsInViewport,
			inlineDecorations: inlineDecorations,
			hasVariableFonts
		};
	}
}

export function isModelDecorationVisible(model: ITextModel, decoration: IModelDecoration): boolean {
	if (decoration.options.hideInCommentTokens && isModelDecorationInComment(model, decoration)) {
		return false;
	}

	if (decoration.options.hideInStringTokens && isModelDecorationInString(model, decoration)) {
		return false;
	}

	return true;
}

export function isModelDecorationInComment(model: ITextModel, decoration: IModelDecoration): boolean {
	return testTokensInRange(
		model,
		decoration.range,
		(tokenType) => tokenType === StandardTokenType.Comment
	);
}

export function isModelDecorationInString(model: ITextModel, decoration: IModelDecoration): boolean {
	return testTokensInRange(
		model,
		decoration.range,
		(tokenType) => tokenType === StandardTokenType.String
	);
}

/**
 * Calls the callback for every token that intersects the range.
 * If the callback returns `false`, iteration stops and `false` is returned.
 * Otherwise, `true` is returned.
 */
function testTokensInRange(model: ITextModel, range: Range, callback: (tokenType: StandardTokenType) => boolean): boolean {
	for (let lineNumber = range.startLineNumber; lineNumber <= range.endLineNumber; lineNumber++) {
		const lineTokens = model.tokenization.getLineTokens(lineNumber);
		const isFirstLine = lineNumber === range.startLineNumber;
		const isEndLine = lineNumber === range.endLineNumber;

		let tokenIdx = isFirstLine ? lineTokens.findTokenIndexAtOffset(range.startColumn - 1) : 0;
		while (tokenIdx < lineTokens.getCount()) {
			if (isEndLine) {
				const startOffset = lineTokens.getStartOffset(tokenIdx);
				if (startOffset > range.endColumn - 1) {
					break;
				}
			}

			const callbackResult = callback(lineTokens.getStandardTokenType(tokenIdx));
			if (!callbackResult) {
				return false;
			}
			tokenIdx++;
		}
	}
	return true;
}
