/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IViewLineTokens, LineTokens } from 'vs/editor/common/core/lineTokens';
import { Position } from 'vs/editor/common/core/position';
import { IRange } from 'vs/editor/common/core/range';
import { EndOfLinePreference, ITextModel, PositionAffinity } from 'vs/editor/common/model';
import { LineInjectedText } from 'vs/editor/common/model/textModelEvents';
import { InjectedText, ModelLineProjectionData } from 'vs/editor/common/viewModel/modelLineProjectionData';
import { SingleLineInlineDecoration, ViewLineData } from 'vs/editor/common/viewModel/viewModel';

export interface IModelLineProjection {
	isVisible(): boolean;

	/**
	 * This invalidates the current instance (potentially reuses and returns it again).
	*/
	setVisible(isVisible: boolean): IModelLineProjection;

	getLineBreakData(): ModelLineProjectionData | null;
	getViewLineCount(): number;
	getViewLineContent(model: ISimpleModel, modelLineNumber: number, outputLineIndex: number): string;
	getViewLineLength(model: ISimpleModel, modelLineNumber: number, outputLineIndex: number): number;
	getViewLineMinColumn(model: ISimpleModel, modelLineNumber: number, outputLineIndex: number): number;
	getViewLineMaxColumn(model: ISimpleModel, modelLineNumber: number, outputLineIndex: number): number;
	getViewLineData(model: ISimpleModel, modelLineNumber: number, outputLineIndex: number): ViewLineData;
	getViewLinesData(model: ISimpleModel, modelLineNumber: number, fromOutputLineIndex: number, toOutputLineIndex: number, globalStartIndex: number, needed: boolean[], result: Array<ViewLineData | null>): void;

	getModelColumnOfViewPosition(outputLineIndex: number, outputColumn: number): number;
	getViewPositionOfModelPosition(deltaLineNumber: number, inputColumn: number, affinity?: PositionAffinity): Position;
	getViewLineNumberOfModelPosition(deltaLineNumber: number, inputColumn: number): number;
	normalizePosition(outputLineIndex: number, outputPosition: Position, affinity: PositionAffinity): Position;

	getInjectedTextAt(outputLineIndex: number, column: number): InjectedText | null;
}

export interface ISimpleModel {
	getLineTokens(lineNumber: number): LineTokens;
	getLineContent(lineNumber: number): string;
	getLineLength(lineNumber: number): number;
	getLineMinColumn(lineNumber: number): number;
	getLineMaxColumn(lineNumber: number): number;
	getValueInRange(range: IRange, eol?: EndOfLinePreference): string;
}

export function createModelLineProjection(lineBreakData: ModelLineProjectionData | null, isVisible: boolean): IModelLineProjection {
	if (lineBreakData === null) {
		// No mapping needed
		if (isVisible) {
			return IdentityModelLineProjection.INSTANCE;
		}
		return HiddenModelLineProjection.INSTANCE;
	} else {
		return new ModelLineProjection(lineBreakData, isVisible);
	}
}

/**
 * This projection is used to
 * * wrap model lines
 * * inject text
 */
class ModelLineProjection implements IModelLineProjection {
	private readonly _lineBreakData: ModelLineProjectionData;
	private _isVisible: boolean;

	constructor(lineBreakData: ModelLineProjectionData, isVisible: boolean) {
		this._lineBreakData = lineBreakData;
		this._isVisible = isVisible;
	}

	public isVisible(): boolean {
		return this._isVisible;
	}

	public setVisible(isVisible: boolean): IModelLineProjection {
		this._isVisible = isVisible;
		return this;
	}

	public getLineBreakData(): ModelLineProjectionData | null {
		return this._lineBreakData;
	}

	public getViewLineCount(): number {
		if (!this._isVisible) {
			return 0;
		}
		return this._lineBreakData.getOutputLineCount();
	}

	private getInputStartOffsetOfOutputLineIndex(outputLineIndex: number): number {
		return this._lineBreakData.translateToInputOffset(outputLineIndex, 0);
	}

	private getInputEndOffsetOfOutputLineIndex(outputLineIndex: number): number {
		return this._lineBreakData.translateToInputOffset(outputLineIndex, this._lineBreakData.getMaxOutputOffset(outputLineIndex));
	}

	public getViewLineContent(model: ISimpleModel, modelLineNumber: number, outputLineIndex: number): string {
		this.assertVisible();

		// These offsets refer to model text with injected text.
		const startOffset = outputLineIndex > 0 ? this._lineBreakData.breakOffsets[outputLineIndex - 1] : 0;
		const endOffset = outputLineIndex < this._lineBreakData.breakOffsets.length
			? this._lineBreakData.breakOffsets[outputLineIndex]
			// This case might not be possible anyway, but we clamp the value to be on the safe side.
			: this._lineBreakData.breakOffsets[this._lineBreakData.breakOffsets.length - 1];

		let r: string;
		if (this._lineBreakData.injectionOffsets !== null) {
			const injectedTexts = this._lineBreakData.injectionOffsets.map((offset, idx) => new LineInjectedText(0, 0, offset + 1, this._lineBreakData.injectionOptions![idx], 0));
			r = LineInjectedText.applyInjectedText(model.getLineContent(modelLineNumber), injectedTexts).substring(startOffset, endOffset);
		} else {
			r = model.getValueInRange({
				startLineNumber: modelLineNumber,
				startColumn: startOffset + 1,
				endLineNumber: modelLineNumber,
				endColumn: endOffset + 1
			});
		}

		if (outputLineIndex > 0) {
			r = spaces(this._lineBreakData.wrappedTextIndentLength) + r;
		}

		return r;
	}

	public getViewLineLength(model: ISimpleModel, modelLineNumber: number, outputLineIndex: number): number {
		this.assertVisible();
		return this._lineBreakData.getLineLength(outputLineIndex);
	}

	public getViewLineMinColumn(_model: ITextModel, _modelLineNumber: number, outputLineIndex: number): number {
		this.assertVisible();
		return this._lineBreakData.getMinOutputOffset(outputLineIndex) + 1;
	}

	public getViewLineMaxColumn(model: ISimpleModel, modelLineNumber: number, outputLineIndex: number): number {
		this.assertVisible();
		return this._lineBreakData.getMaxOutputOffset(outputLineIndex) + 1;
	}

	public getViewLineData(model: ISimpleModel, modelLineNumber: number, outputLineIndex: number): ViewLineData {
		this.assertVisible();
		const lineBreakData = this._lineBreakData;
		const deltaStartIndex = (outputLineIndex > 0 ? lineBreakData.wrappedTextIndentLength : 0);

		const injectionOffsets = lineBreakData.injectionOffsets;
		const injectionOptions = lineBreakData.injectionOptions;

		let tokens: IViewLineTokens;
		let inlineDecorations: null | SingleLineInlineDecoration[];
		if (injectionOffsets) {
			const lineTokens = model.getLineTokens(modelLineNumber).withInserted(injectionOffsets.map((offset, idx) => ({
				offset,
				text: injectionOptions![idx].content,
				tokenMetadata: LineTokens.defaultTokenMetadata
			})));

			const lineStartOffsetInInputWithInjections = outputLineIndex > 0 ? lineBreakData.breakOffsets[outputLineIndex - 1] : 0;
			const lineEndOffsetInInputWithInjections = lineBreakData.breakOffsets[outputLineIndex];

			tokens = lineTokens.sliceAndInflate(lineStartOffsetInInputWithInjections, lineEndOffsetInInputWithInjections, deltaStartIndex);
			inlineDecorations = new Array<SingleLineInlineDecoration>();

			let totalInjectedTextLengthBefore = 0;
			for (let i = 0; i < injectionOffsets.length; i++) {
				const length = injectionOptions![i].content.length;
				const injectedTextStartOffsetInInputWithInjections = injectionOffsets[i] + totalInjectedTextLengthBefore;
				const injectedTextEndOffsetInInputWithInjections = injectionOffsets[i] + totalInjectedTextLengthBefore + length;

				if (injectedTextStartOffsetInInputWithInjections > lineEndOffsetInInputWithInjections) {
					// Injected text only starts in later wrapped lines.
					break;
				}

				if (lineStartOffsetInInputWithInjections < injectedTextEndOffsetInInputWithInjections) {
					// Injected text ends after or in this line (but also starts in or before this line).
					const options = injectionOptions![i];
					if (options.inlineClassName) {
						const offset = (outputLineIndex > 0 ? lineBreakData.wrappedTextIndentLength : 0);
						const start = offset + Math.max(injectedTextStartOffsetInInputWithInjections - lineStartOffsetInInputWithInjections, 0);
						const end = offset + Math.min(injectedTextEndOffsetInInputWithInjections - lineStartOffsetInInputWithInjections, lineEndOffsetInInputWithInjections);
						if (start !== end) {
							inlineDecorations.push(new SingleLineInlineDecoration(start, end, options.inlineClassName, options.inlineClassNameAffectsLetterSpacing!));
						}
					}
				}

				totalInjectedTextLengthBefore += length;
			}
		} else {
			const startOffset = this.getInputStartOffsetOfOutputLineIndex(outputLineIndex);
			const endOffset = this.getInputEndOffsetOfOutputLineIndex(outputLineIndex);
			const lineTokens = model.getLineTokens(modelLineNumber);
			tokens = lineTokens.sliceAndInflate(startOffset, endOffset, deltaStartIndex);
			inlineDecorations = null;
		}

		let lineContent = tokens.getLineContent();
		if (outputLineIndex > 0) {
			lineContent = spaces(lineBreakData.wrappedTextIndentLength) + lineContent;
		}

		const minColumn = this._lineBreakData.getMinOutputOffset(outputLineIndex) + 1;
		const maxColumn = lineContent.length + 1;
		const continuesWithWrappedLine = (outputLineIndex + 1 < this.getViewLineCount());
		const startVisibleColumn = (outputLineIndex === 0 ? 0 : lineBreakData.breakOffsetsVisibleColumn[outputLineIndex - 1]);

		return new ViewLineData(
			lineContent,
			continuesWithWrappedLine,
			minColumn,
			maxColumn,
			startVisibleColumn,
			tokens,
			inlineDecorations
		);
	}

	public getViewLinesData(model: ITextModel, modelLineNumber: number, fromOutputLineIndex: number, toOutputLineIndex: number, globalStartIndex: number, needed: boolean[], result: Array<ViewLineData | null>): void {
		this.assertVisible();
		for (let outputLineIndex = fromOutputLineIndex; outputLineIndex < toOutputLineIndex; outputLineIndex++) {
			let globalIndex = globalStartIndex + outputLineIndex - fromOutputLineIndex;
			if (!needed[globalIndex]) {
				result[globalIndex] = null;
				continue;
			}
			result[globalIndex] = this.getViewLineData(model, modelLineNumber, outputLineIndex);
		}
	}

	public getModelColumnOfViewPosition(outputLineIndex: number, outputColumn: number): number {
		this.assertVisible();
		return this._lineBreakData.translateToInputOffset(outputLineIndex, outputColumn - 1) + 1;
	}

	public getViewPositionOfModelPosition(deltaLineNumber: number, inputColumn: number, affinity: PositionAffinity = PositionAffinity.None): Position {
		this.assertVisible();
		let r = this._lineBreakData.translateToOutputPosition(inputColumn - 1, affinity);
		return r.toPosition(deltaLineNumber);
	}

	public getViewLineNumberOfModelPosition(deltaLineNumber: number, inputColumn: number): number {
		this.assertVisible();
		const r = this._lineBreakData.translateToOutputPosition(inputColumn - 1);
		return deltaLineNumber + r.outputLineIndex;
	}

	public normalizePosition(outputLineIndex: number, outputPosition: Position, affinity: PositionAffinity): Position {
		const baseViewLineNumber = outputPosition.lineNumber - outputLineIndex;
		const normalizedOutputPosition = this._lineBreakData.normalizeOutputPosition(outputLineIndex, outputPosition.column - 1, affinity);
		const result = normalizedOutputPosition.toPosition(baseViewLineNumber);
		return result;
	}

	public getInjectedTextAt(outputLineIndex: number, outputColumn: number): InjectedText | null {
		return this._lineBreakData.getInjectedText(outputLineIndex, outputColumn - 1);
	}

	private assertVisible() {
		if (!this._isVisible) {
			throw new Error('Not supported');
		}
	}
}

/**
 * This projection does not change the model line.
*/
class IdentityModelLineProjection implements IModelLineProjection {
	public static readonly INSTANCE = new IdentityModelLineProjection();

	private constructor() { }

	public isVisible(): boolean {
		return true;
	}

	public setVisible(isVisible: boolean): IModelLineProjection {
		if (isVisible) {
			return this;
		}
		return HiddenModelLineProjection.INSTANCE;
	}

	public getLineBreakData(): ModelLineProjectionData | null {
		return null;
	}

	public getViewLineCount(): number {
		return 1;
	}

	public getViewLineContent(model: ISimpleModel, modelLineNumber: number, _outputLineIndex: number): string {
		return model.getLineContent(modelLineNumber);
	}

	public getViewLineLength(model: ISimpleModel, modelLineNumber: number, _outputLineIndex: number): number {
		return model.getLineLength(modelLineNumber);
	}

	public getViewLineMinColumn(model: ISimpleModel, modelLineNumber: number, _outputLineIndex: number): number {
		return model.getLineMinColumn(modelLineNumber);
	}

	public getViewLineMaxColumn(model: ISimpleModel, modelLineNumber: number, _outputLineIndex: number): number {
		return model.getLineMaxColumn(modelLineNumber);
	}

	public getViewLineData(model: ISimpleModel, modelLineNumber: number, _outputLineIndex: number): ViewLineData {
		let lineTokens = model.getLineTokens(modelLineNumber);
		let lineContent = lineTokens.getLineContent();
		return new ViewLineData(
			lineContent,
			false,
			1,
			lineContent.length + 1,
			0,
			lineTokens.inflate(),
			null
		);
	}

	public getViewLinesData(model: ISimpleModel, modelLineNumber: number, _fromOuputLineIndex: number, _toOutputLineIndex: number, globalStartIndex: number, needed: boolean[], result: Array<ViewLineData | null>): void {
		if (!needed[globalStartIndex]) {
			result[globalStartIndex] = null;
			return;
		}
		result[globalStartIndex] = this.getViewLineData(model, modelLineNumber, 0);
	}

	public getModelColumnOfViewPosition(_outputLineIndex: number, outputColumn: number): number {
		return outputColumn;
	}

	public getViewPositionOfModelPosition(deltaLineNumber: number, inputColumn: number): Position {
		return new Position(deltaLineNumber, inputColumn);
	}

	public getViewLineNumberOfModelPosition(deltaLineNumber: number, _inputColumn: number): number {
		return deltaLineNumber;
	}

	public normalizePosition(outputLineIndex: number, outputPosition: Position, affinity: PositionAffinity): Position {
		return outputPosition;
	}

	public getInjectedTextAt(_outputLineIndex: number, _outputColumn: number): InjectedText | null {
		return null;
	}
}

/**
 * This projection hides the model line.
 */
class HiddenModelLineProjection implements IModelLineProjection {
	public static readonly INSTANCE = new HiddenModelLineProjection();

	private constructor() { }

	public isVisible(): boolean {
		return false;
	}

	public setVisible(isVisible: boolean): IModelLineProjection {
		if (!isVisible) {
			return this;
		}
		return IdentityModelLineProjection.INSTANCE;
	}

	public getLineBreakData(): ModelLineProjectionData | null {
		return null;
	}

	public getViewLineCount(): number {
		return 0;
	}

	public getViewLineContent(_model: ISimpleModel, _modelLineNumber: number, _outputLineIndex: number): string {
		throw new Error('Not supported');
	}

	public getViewLineLength(_model: ISimpleModel, _modelLineNumber: number, _outputLineIndex: number): number {
		throw new Error('Not supported');
	}

	public getViewLineMinColumn(_model: ISimpleModel, _modelLineNumber: number, _outputLineIndex: number): number {
		throw new Error('Not supported');
	}

	public getViewLineMaxColumn(_model: ISimpleModel, _modelLineNumber: number, _outputLineIndex: number): number {
		throw new Error('Not supported');
	}

	public getViewLineData(_model: ISimpleModel, _modelLineNumber: number, _outputLineIndex: number): ViewLineData {
		throw new Error('Not supported');
	}

	public getViewLinesData(_model: ISimpleModel, _modelLineNumber: number, _fromOuputLineIndex: number, _toOutputLineIndex: number, _globalStartIndex: number, _needed: boolean[], _result: ViewLineData[]): void {
		throw new Error('Not supported');
	}

	public getModelColumnOfViewPosition(_outputLineIndex: number, _outputColumn: number): number {
		throw new Error('Not supported');
	}

	public getViewPositionOfModelPosition(_deltaLineNumber: number, _inputColumn: number): Position {
		throw new Error('Not supported');
	}

	public getViewLineNumberOfModelPosition(_deltaLineNumber: number, _inputColumn: number): number {
		throw new Error('Not supported');
	}

	public normalizePosition(outputLineIndex: number, outputPosition: Position, affinity: PositionAffinity): Position {
		throw new Error('Not supported');
	}

	public getInjectedTextAt(_outputLineIndex: number, _outputColumn: number): InjectedText | null {
		throw new Error('Not supported');
	}
}

let _spaces: string[] = [''];
function spaces(count: number): string {
	if (count >= _spaces.length) {
		for (let i = 1; i <= count; i++) {
			_spaces[i] = _makeSpaces(i);
		}
	}
	return _spaces[count];
}

function _makeSpaces(count: number): string {
	return new Array(count + 1).join(' ');
}
