/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IModelDecoration, InjectedTextOptions, ITextModel, PositionAffinity } from '../model.js';
import { Range } from '../core/range.js';
import { Position } from '../core/position.js';
import { ICoordinatesConverter } from '../coordinatesConverter.js';
import { isModelDecorationVisible, ViewModelDecoration } from './viewModelDecoration.js';

export const enum InlineDecorationType {
	Regular = 0,
	Before = 1,
	After = 2,
	RegularAffectingLetterSpacing = 3
}

export class InlineDecoration {
	constructor(
		public readonly range: Range,
		public readonly inlineClassName: string,
		public readonly type: InlineDecorationType
	) { }
}

export interface IDecorationsViewportData {
	/**
	 * Decorations in the viewport
	 */
	readonly decorations: ViewModelDecoration[];
	/**
	 * Inline decorations grouped by each line in the range
	 */
	readonly inlineDecorations: InlineDecoration[][];
	/**
	 * Whether the decorations affect the font
	 */
	readonly hasVariableFonts: boolean;
}

export interface IInlineDecorationsComputer {
	/**
	 * Method to get the inline decorations for a specific line number
	 */
	getInlineDecorations(lineNumber: number): InlineDecoration[][] | null;
}

export interface IInlineModelDecorationsComputerContext {
	/**
	 * get the model decorations from which to calculate the inline decorations
	 */
	getModelDecorations(range: Range, onlyMinimapDecorations: boolean, onlyMarginDecorations: boolean): IModelDecoration[];
}

export class InlineModelDecorationsComputer implements IInlineDecorationsComputer {

	private _decorationsCache: { [decorationId: string]: ViewModelDecoration };

	constructor(
		private readonly context: IInlineModelDecorationsComputerContext,
		private readonly model: ITextModel,
		private readonly coordinatesConverter: ICoordinatesConverter
	) {
		this._decorationsCache = Object.create(null);
	}

	public getInlineDecorations(lineNumber: number): InlineDecoration[][] {
		const modelRange = new Range(lineNumber, 1, lineNumber, this.model.getLineMaxColumn(lineNumber));
		const decorationData = this.getDecorations(modelRange, false, false);
		return decorationData.inlineDecorations;
	}

	public getDecorations(range: Range, onlyMinimapDecorations: boolean, onlyMarginDecorations: boolean): IDecorationsViewportData {
		const modelDecorations = this.context.getModelDecorations(range, onlyMinimapDecorations, onlyMarginDecorations);
		const startLineNumber = range.startLineNumber;
		const endLineNumber = range.endLineNumber;

		let decorationsInViewportLen = 0;
		const decorationsInViewport: ViewModelDecoration[] = [];

		const inlineDecorations: InlineDecoration[][] = [];
		for (let j = startLineNumber; j <= endLineNumber; j++) {
			inlineDecorations[j - startLineNumber] = [];
		}

		let hasVariableFonts: boolean = false;
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

	public reset(): void {
		this._decorationsCache = Object.create(null);
	}

	public onModelDecorationsChanged(): void {
		this._decorationsCache = Object.create(null);
	}

	public onLineMappingChanged(): void {
		this._decorationsCache = Object.create(null);
	}

	private _getOrCreateViewModelDecoration(modelDecoration: IModelDecoration): ViewModelDecoration {
		const id = modelDecoration.id;
		let r = this._decorationsCache[id];
		if (!r) {
			const modelRange = modelDecoration.range;
			const options = modelDecoration.options;
			let viewRange: Range;
			if (options.isWholeLine) {
				const start = this.coordinatesConverter.convertModelPositionToViewPosition(new Position(modelRange.startLineNumber, 1), PositionAffinity.Left, false, true);
				const end = this.coordinatesConverter.convertModelPositionToViewPosition(new Position(modelRange.endLineNumber, this.model.getLineMaxColumn(modelRange.endLineNumber)), PositionAffinity.Right);
				viewRange = new Range(start.lineNumber, start.column, end.lineNumber, end.column);
			} else {
				// For backwards compatibility reasons, we want injected text before any decoration.
				// Thus, move decorations to the right.
				viewRange = this.coordinatesConverter.convertModelRangeToViewRange(modelRange, PositionAffinity.Right);
			}
			r = new ViewModelDecoration(viewRange, options);
			this._decorationsCache[id] = r;
		}
		return r;
	}
}

export interface IInjectedTextInlineDecorationsComputerContext {
	/**
	 * Get the injections options for a line number
	 */
	getInjectionOptions(lineNumber: number): InjectedTextOptions[] | null;
	/**
	 * Get the injection offsets for a line number
	 */
	getInjectionOffsets(lineNumber: number): number[] | null;
	/**
	 * Get the break offets for a line number
	 */
	getBreakOffsets(lineNumber: number): number[] | null;
	/**
	 * Get the wrapped text indent length for a line number
	 */
	getWrappedTextIndentLength(lineNumber: number): number | null;
}

export class InjectedTextInlineDecorationsComputer implements IInlineDecorationsComputer {

	constructor(private readonly context: IInjectedTextInlineDecorationsComputerContext) { }

	public getInlineDecorations(lineNumber: number): InlineDecoration[][] | null {
		const injectionOffsets = this.context.getInjectionOffsets(lineNumber);
		if (!injectionOffsets) {
			return null;
		}
		const lineInlineDecorations = [];
		let totalInjectedTextLengthBefore = 0;
		let currentInjectedOffset = 0;

		const injectionOptions = this.context.getInjectionOptions(lineNumber);
		const breakOffsets = this.context.getBreakOffsets(lineNumber);
		const numberOfViewLines = breakOffsets ? breakOffsets.length : 1;

		for (let outputLineIndex = 0; outputLineIndex < numberOfViewLines; outputLineIndex++) {
			const inlineDecorations = new Array<InlineDecoration>();
			lineInlineDecorations[outputLineIndex] = inlineDecorations;

			const lineStartOffsetInInputWithInjections = outputLineIndex > 0 && breakOffsets ? breakOffsets[outputLineIndex - 1] : 0;
			const lineEndOffsetInInputWithInjections = breakOffsets ? breakOffsets[outputLineIndex] : 0;

			while (currentInjectedOffset < injectionOffsets.length) {
				const length = injectionOptions![currentInjectedOffset].content.length;
				const injectedTextStartOffsetInInputWithInjections = injectionOffsets[currentInjectedOffset] + totalInjectedTextLengthBefore;
				const injectedTextEndOffsetInInputWithInjections = injectedTextStartOffsetInInputWithInjections + length;

				if (injectedTextStartOffsetInInputWithInjections > lineEndOffsetInInputWithInjections) {
					// Injected text only starts in later wrapped lines.
					break;
				}

				if (lineStartOffsetInInputWithInjections < injectedTextEndOffsetInInputWithInjections) {
					// Injected text ends after or in this line (but also starts in or before this line).
					const options = injectionOptions![currentInjectedOffset];
					if (options.inlineClassName) {
						const wrappedTextIndentLength = this.context.getWrappedTextIndentLength(lineNumber);
						const offset = (outputLineIndex > 0 && wrappedTextIndentLength ? wrappedTextIndentLength : 0);
						const start = offset + Math.max(injectedTextStartOffsetInInputWithInjections - lineStartOffsetInInputWithInjections, 0);
						const end = offset + Math.min(injectedTextEndOffsetInInputWithInjections - lineStartOffsetInInputWithInjections, lineEndOffsetInInputWithInjections - lineStartOffsetInInputWithInjections);
						if (start !== end) {
							const range = new Range(lineNumber, start + 1, lineNumber, end + 1);
							const type: InlineDecorationType = options.inlineClassNameAffectsLetterSpacing ? InlineDecorationType.RegularAffectingLetterSpacing : InlineDecorationType.Regular;
							inlineDecorations.push(new InlineDecoration(range, options.inlineClassName, type));
						}
					}
				}
				if (injectedTextEndOffsetInInputWithInjections <= lineEndOffsetInInputWithInjections) {
					totalInjectedTextLengthBefore += length;
					currentInjectedOffset++;
				} else {
					// injected text breaks into next line, process it again
					break;
				}
			}
		}
		return lineInlineDecorations;
	}
}
