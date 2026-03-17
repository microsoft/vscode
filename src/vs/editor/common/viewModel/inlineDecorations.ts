/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IModelDecoration, InjectedTextOptions, ITextModel, PositionAffinity } from '../model.js';
import { Range } from '../core/range.js';
import { Position } from '../core/position.js';
import { ICoordinatesConverter, IdentityCoordinatesConverter } from '../coordinatesConverter.js';
import { isModelDecorationVisible, ViewModelDecoration } from './viewModelDecoration.js';
import { filterFontDecorations, filterValidationDecorations, IComputedEditorOptions } from '../config/editorOptions.js';

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

/**
 * Object containing view inline decorations for a specific model line
 */
export interface LineInlineDecorations {
	/**
	 * Inline decorations for each view line in the model line
	 */
	decorations: InlineDecoration[][];
	/**
	 * Whether the decorations affect the fonts for each view line in the model line
	 */
	hasVariableFonts: boolean[];
}

/**
 * A collection of decorations in a range of lines.
 */
export interface IViewDecorationsCollection {
	/**
	 * decorations in the range of lines (ungrouped).
	 */
	readonly decorations: ViewModelDecoration[];
	/**
	 * inline decorations (grouped by each line in the range of lines).
	 */
	readonly inlineDecorations: InlineDecoration[][];
	/**
	 * Whether the decorations affect the fonts.
	 */
	readonly hasVariableFonts: boolean[];
}

export interface IInlineDecorationsComputer {
	/**
	 * Get the inline decorations for a specific model line number, split by view line number
	 */
	getInlineDecorations(modelLineNumber: number): LineInlineDecorations;
}

export interface IInlineModelDecorationsComputerContext {
	/**
	 * Get model decorations for a view range
	 */
	getModelDecorations(viewRange: Range, onlyMinimapDecorations: boolean, onlyMarginDecorations: boolean): IModelDecoration[];
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

	public getInlineDecorations(modelLineNumber: number): LineInlineDecorations {
		const modelRange = new Range(modelLineNumber, 1, modelLineNumber, this.model.getLineMaxColumn(modelLineNumber));
		const viewRange = this.coordinatesConverter.convertModelRangeToViewRange(modelRange);
		const decorationsViewportData = this.getDecorations(viewRange, false, false);
		return {
			decorations: decorationsViewportData.inlineDecorations,
			hasVariableFonts: decorationsViewportData.hasVariableFonts
		};
	}

	public getDecorations(viewRange: Range, onlyMinimapDecorations: boolean, onlyMarginDecorations: boolean): IViewDecorationsCollection {
		const modelDecorations = this.context.getModelDecorations(viewRange, onlyMinimapDecorations, onlyMarginDecorations);
		const startLineNumber = viewRange.startLineNumber;
		const endLineNumber = viewRange.endLineNumber;

		const decorationsInViewport: ViewModelDecoration[] = [];
		let decorationsInViewportLen = 0;
		const inlineDecorations: InlineDecoration[][] = [];
		const hasVariableFonts: boolean[] = [];
		for (let j = startLineNumber; j <= endLineNumber; j++) {
			inlineDecorations[j - startLineNumber] = [];
			hasVariableFonts[j - startLineNumber] = false;
		}

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
					if (decorationOptions.affectsFont) {
						hasVariableFonts[j - startLineNumber] = true;
					}
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
					if (decorationOptions.affectsFont) {
						hasVariableFonts[viewRange.startLineNumber - startLineNumber] = true;
					}
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
					if (decorationOptions.affectsFont) {
						hasVariableFonts[viewRange.endLineNumber - startLineNumber] = true;
					}
				}
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
		this.reset();
	}

	public onLineMappingChanged(): void {
		this.reset();
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
	 * Get the injections options for a model line number
	 */
	getInjectionOptions(modelLineNumber: number): InjectedTextOptions[] | null;
	/**
	 * Get the injection offsets for a model line number
	 */
	getInjectionOffsets(modelLineNumber: number): number[] | null;
	/**
	 * Get the break offets for a model line number
	 */
	getBreakOffsets(modelLineNumber: number): number[];
	/**
	 * Get the wrapped text indent length for a model line number
	 */
	getWrappedTextIndentLength(modelLineNumber: number): number;
	/**
	 * Get the view line number for the first output line of a model line
	 */
	getBaseViewLineNumber(modelLineNumber: number): number;
}

export class InjectedTextInlineDecorationsComputer implements IInlineDecorationsComputer {

	constructor(private readonly context: IInjectedTextInlineDecorationsComputerContext) { }

	public getInlineDecorations(modelLineNumber: number): LineInlineDecorations {
		const injectionOffsets = this.context.getInjectionOffsets(modelLineNumber);
		if (!injectionOffsets) {
			return { decorations: [], hasVariableFonts: [] };
		}
		const lineInlineDecorations = [];
		const hasVariableFonts = [];
		let totalInjectedTextLengthBefore = 0;
		let currentInjectedOffset = 0;

		const injectionOptions = this.context.getInjectionOptions(modelLineNumber);
		const breakOffsets = this.context.getBreakOffsets(modelLineNumber);

		for (let outputLineIndex = 0; outputLineIndex < breakOffsets.length; outputLineIndex++) {
			const inlineDecorations = new Array<InlineDecoration>();
			lineInlineDecorations[outputLineIndex] = inlineDecorations;
			hasVariableFonts[outputLineIndex] = false;

			const lineStartOffsetInInputWithInjections = outputLineIndex > 0 ? breakOffsets[outputLineIndex - 1] : 0;
			const lineEndOffsetInInputWithInjections = breakOffsets[outputLineIndex];

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
						const wrappedTextIndentLength = this.context.getWrappedTextIndentLength(modelLineNumber);
						const offset = (outputLineIndex > 0 ? wrappedTextIndentLength : 0);
						const start = offset + Math.max(injectedTextStartOffsetInInputWithInjections - lineStartOffsetInInputWithInjections, 0);
						const end = offset + Math.min(injectedTextEndOffsetInInputWithInjections - lineStartOffsetInInputWithInjections, lineEndOffsetInInputWithInjections - lineStartOffsetInInputWithInjections);
						if (start !== end) {
							const viewLineNumber = this.context.getBaseViewLineNumber(modelLineNumber) + outputLineIndex;
							const range = new Range(viewLineNumber, start + 1, viewLineNumber, end + 1);
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
		return { decorations: lineInlineDecorations, hasVariableFonts };
	}
}

/*
 * Inline decorations computer for a model where model line numbers are 1:1 mapped to view line numbers.
 */
export class IdentityInlineDecorationsComputer {

	private readonly _inlineDecorationsComputer: IInlineDecorationsComputer;
	private readonly _injectedTextInlineDecorationsComputer: InjectedTextInlineDecorationsComputer;

	constructor(
		private readonly editorId: number,
		private readonly model: ITextModel,
		private readonly options: IComputedEditorOptions
	) {
		const coordinatesConverter = new IdentityCoordinatesConverter(this.model);
		const context: IInlineModelDecorationsComputerContext = {
			getModelDecorations: (range: Range) => this.model.getDecorationsInRange(range, this.editorId, filterValidationDecorations(this.options), filterFontDecorations(this.options), false, false),
		};
		const injectedContext: IInjectedTextInlineDecorationsComputerContext = {
			getInjectionOptions: (lineNumber: number) => this.model.getLineInjectedText(lineNumber).map(t => t.options),
			getInjectionOffsets: (lineNumber: number) => this.model.getLineInjectedText(lineNumber).map(text => text.column - 1),
			getBreakOffsets: () => [],
			getWrappedTextIndentLength: () => 0,
			getBaseViewLineNumber: (lineNumber: number) => lineNumber
		};
		this._inlineDecorationsComputer = new InlineModelDecorationsComputer(context, this.model, coordinatesConverter);
		this._injectedTextInlineDecorationsComputer = new InjectedTextInlineDecorationsComputer(injectedContext);
	}

	public getLineInlineDecorations(lineNumber: number): InlineDecoration[] {
		// Mirroring _getViewLineRenderingData which merge inline decorations and injected text inline decorations together.
		const inlineDecorations = this._inlineDecorationsComputer.getInlineDecorations(lineNumber).decorations;
		const injectedTextInlineDecorations = this._injectedTextInlineDecorationsComputer.getInlineDecorations(lineNumber).decorations;
		const mergedInlineDecorations = [...inlineDecorations[0], ...injectedTextInlineDecorations[0] ?? []];
		return mergedInlineDecorations;
	}

	public hasVariableFonts(lineNumber: number): boolean {
		const inlineDecorationsHasVariableFonts = this._inlineDecorationsComputer.getInlineDecorations(lineNumber).hasVariableFonts;
		return inlineDecorationsHasVariableFonts[0];
	}
}
