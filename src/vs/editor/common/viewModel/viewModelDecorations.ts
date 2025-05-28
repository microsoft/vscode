/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../base/common/lifecycle.js';
import { Position } from '../core/position.js';
import { Range } from '../core/range.js';
import { IModelDecoration, ITextModel, PositionAffinity } from '../model.js';
import { IViewModelLines } from './viewModelLines.js';
import { ICoordinatesConverter, InlineDecoration, InlineDecorationType, ViewModelDecoration } from '../viewModel.js';
import { StandardTokenType } from '../encodedTokenAttributes.js';

export interface IDecorationsViewportData {
	/**
	 * decorations in the viewport.
	 */
	readonly decorations: ViewModelDecoration[];
	/**
	 * inline decorations grouped by each line in the viewport.
	 */
	readonly inlineDecorations: InlineDecorations[];
}

export class InlineDecorations {

	public readonly decorations: InlineDecoration[] = [];

	private _affectsFonts: boolean = false;

	constructor() { }

	public push(range: Range, inlineClassName: string, inlineDecorationType: InlineDecorationType, affectsFont?: boolean): void {
		this.decorations.push(new InlineDecoration(range, inlineClassName, inlineDecorationType));
		if (affectsFont) {
			this._affectsFonts = true;
		}
	}

	public get affectsFonts(): boolean {
		return this._affectsFonts;
	}
}

export class ViewModelDecorations implements IDisposable {

	private readonly model: ITextModel;
	private readonly _linesCollection: IViewModelLines;
	private readonly _coordinatesConverter: ICoordinatesConverter;

	private _decorationsCache: { [decorationId: string]: ViewModelDecoration };

	private _cachedModelDecorationsResolver: IDecorationsViewportData | null;
	private _cachedModelDecorationsResolverViewRange: Range | null;

	constructor(model: ITextModel, linesCollection: IViewModelLines, coordinatesConverter: ICoordinatesConverter) {
		this.model = model;
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
		return this._getDecorationsInViewRange(range, true, false).decorations;
	}

	public getDecorationsViewportData(viewRange: Range): IDecorationsViewportData {
		let cacheIsValid = (this._cachedModelDecorationsResolver !== null);
		cacheIsValid = cacheIsValid && (viewRange.equalsRange(this._cachedModelDecorationsResolverViewRange));
		if (!cacheIsValid) {
			this._cachedModelDecorationsResolver = this._getDecorationsInViewRange(viewRange, false, false);
			this._cachedModelDecorationsResolverViewRange = viewRange;
		}
		return this._cachedModelDecorationsResolver!;
	}

	public getInlineDecorationsOnLine(lineNumber: number, onlyMinimapDecorations: boolean = false, onlyMarginDecorations: boolean = false): InlineDecorations {
		const range = new Range(lineNumber, this._linesCollection.getViewLineMinColumn(lineNumber), lineNumber, this._linesCollection.getViewLineMaxColumn(lineNumber));
		return this._getDecorationsInViewRange(range, onlyMinimapDecorations, onlyMarginDecorations).inlineDecorations[0];
	}

	private _getDecorationsInViewRange(viewRange: Range, onlyMinimapDecorations: boolean, onlyMarginDecorations: boolean): IDecorationsViewportData {
		const modelRange = this._coordinatesConverter.convertViewRangeToModelRange(viewRange);
		const data = this._linesCollection.getDecorationsDataInModelRange(modelRange, onlyMinimapDecorations, onlyMarginDecorations);
		const viewModelDecorations: ViewModelDecoration[] = [];
		for (const modelDecoration of data.modelDecorations) {
			viewModelDecorations.push(this._getOrCreateViewModelDecoration(modelDecoration));
		}
		const inlineDecorations = data.modelInlineDecorations.map((inlineDecoration) => {
			const inlineDecorations = new InlineDecorations();
			for (const decoration of inlineDecoration.decorations) {
				inlineDecorations.push(this._coordinatesConverter.convertModelRangeToViewRange(decoration.range), decoration.inlineClassName, decoration.type, inlineDecorations.affectsFonts ?? false);
			}
			return inlineDecorations;
		});
		return {
			decorations: viewModelDecorations,
			inlineDecorations: inlineDecorations
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
