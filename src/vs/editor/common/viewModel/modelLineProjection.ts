/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LineTokens } from '../tokens/lineTokens.js';
import { Position } from '../core/position.js';
import { IRange } from '../core/range.js';
import { EndOfLinePreference, ITextModel, PositionAffinity } from '../model.js';
import { LineInjectedText } from '../textModelEvents.js';
import { InjectedText, ModelLineProjectionData } from '../modelLineProjectionData.js';
import { ViewLineData } from '../viewModel.js';
import { IInjectedTextInlineDecorationsComputerContext, InjectedTextInlineDecorationsComputer, InlineDecoration } from './inlineDecorations.js';
import { getLineTokensWithInjections } from '../model/textModel.js';

export interface IModelLineProjection {
	isVisible(): boolean;

	/**
	 * This invalidates the current instance (potentially reuses and returns it again).
	*/
	setVisible(isVisible: boolean): IModelLineProjection;

	getProjectionData(): ModelLineProjectionData | null;
	getViewLineCount(): number;
	getViewLineContent(model: ISimpleModel, modelLineNumber: number, outputLineIndex: number): string;
	getViewLineLength(model: ISimpleModel, modelLineNumber: number, outputLineIndex: number): number;
	getViewLineMinColumn(model: ISimpleModel, modelLineNumber: number, outputLineIndex: number): number;
	getViewLineMaxColumn(model: ISimpleModel, modelLineNumber: number, outputLineIndex: number): number;
	getViewLineData(model: ISimpleModel, modelLineNumber: number, outputLineIndex: number): ViewLineData;
	getViewLinesData(model: ISimpleModel, modelLineNumber: number, outputLineIdx: number, lineCount: number, globalStartIndex: number, needed: boolean[], result: Array<ViewLineData | null>): void;

	getModelColumnOfViewPosition(outputLineIndex: number, outputColumn: number): number;
	getViewPositionOfModelPosition(deltaLineNumber: number, inputColumn: number, affinity?: PositionAffinity): Position;
	getViewLineNumberOfModelPosition(deltaLineNumber: number, inputColumn: number): number;
	normalizePosition(outputLineIndex: number, outputPosition: Position, affinity: PositionAffinity): Position;

	getInjectedTextAt(outputLineIndex: number, column: number): InjectedText | null;
}

export interface ISimpleModel {
	tokenization: {
		getLineTokens(lineNumber: number): LineTokens;
	};
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
	private readonly _projectionData: ModelLineProjectionData;
	private _isVisible: boolean;

	constructor(lineBreakData: ModelLineProjectionData, isVisible: boolean) {
		this._projectionData = lineBreakData;
		this._isVisible = isVisible;
	}

	public isVisible(): boolean {
		return this._isVisible;
	}

	public setVisible(isVisible: boolean): IModelLineProjection {
		this._isVisible = isVisible;
		return this;
	}

	public getProjectionData(): ModelLineProjectionData | null {
		return this._projectionData;
	}

	public getViewLineCount(): number {
		if (!this._isVisible) {
			return 0;
		}
		return this._projectionData.getOutputLineCount();
	}

	public getViewLineContent(model: ISimpleModel, modelLineNumber: number, outputLineIndex: number): string {
		this._assertVisible();

		const startOffsetInInputWithInjections = outputLineIndex > 0 ? this._projectionData.breakOffsets[outputLineIndex - 1] : 0;
		const endOffsetInInputWithInjections = this._projectionData.breakOffsets[outputLineIndex];

		let r: string;
		if (this._projectionData.injectionOffsets !== null) {
			const injectedTexts = this._projectionData.injectionOffsets.map(
				(offset, idx) => new LineInjectedText(
					0,
					0,
					offset + 1,
					this._projectionData.injectionOptions![idx],
					0
				)
			);
			const lineWithInjections = LineInjectedText.applyInjectedText(
				model.getLineContent(modelLineNumber),
				injectedTexts
			);
			r = lineWithInjections.substring(startOffsetInInputWithInjections, endOffsetInInputWithInjections);
		} else {
			r = model.getValueInRange({
				startLineNumber: modelLineNumber,
				startColumn: startOffsetInInputWithInjections + 1,
				endLineNumber: modelLineNumber,
				endColumn: endOffsetInInputWithInjections + 1
			});
		}

		if (outputLineIndex > 0) {
			r = spaces(this._projectionData.wrappedTextIndentLength) + r;
		}

		return r;
	}

	public getViewLineLength(model: ISimpleModel, modelLineNumber: number, outputLineIndex: number): number {
		this._assertVisible();
		return this._projectionData.getLineLength(outputLineIndex);
	}

	public getViewLineMinColumn(_model: ITextModel, _modelLineNumber: number, outputLineIndex: number): number {
		this._assertVisible();
		return this._projectionData.getMinOutputOffset(outputLineIndex) + 1;
	}

	public getViewLineMaxColumn(model: ISimpleModel, modelLineNumber: number, outputLineIndex: number): number {
		this._assertVisible();
		return this._projectionData.getMaxOutputOffset(outputLineIndex) + 1;
	}

	/**
	 * Try using {@link getViewLinesData} instead.
	*/
	public getViewLineData(model: ISimpleModel, modelLineNumber: number, outputLineIndex: number): ViewLineData {
		const arr = new Array<ViewLineData>();
		this.getViewLinesData(model, modelLineNumber, outputLineIndex, 1, 0, [true], arr);
		return arr[0];
	}

	public getViewLinesData(model: ISimpleModel, modelLineNumber: number, outputLineIdx: number, lineCount: number, globalStartIndex: number, needed: boolean[], result: Array<ViewLineData | null>): void {
		this._assertVisible();

		const lineBreakData = this._projectionData;

		const injectionOffsets = lineBreakData.injectionOffsets;
		const injectionOptions = lineBreakData.injectionOptions;

		const context: IInjectedTextInlineDecorationsComputerContext = {
			getInjectionOptions: () => injectionOptions,
			getInjectionOffsets: () => injectionOffsets,
			getBreakOffsets: () => lineBreakData.breakOffsets,
			getWrappedTextIndentLength: () => lineBreakData.wrappedTextIndentLength
		};
		const computer = new InjectedTextInlineDecorationsComputer(context);
		const lineInlineDecorations = computer.getInlineDecorations(modelLineNumber);
		const lineTokens = model.tokenization.getLineTokens(modelLineNumber);
		const lineWithInjections = getLineTokensWithInjections(lineTokens, injectionOptions, injectionOffsets);

		for (let outputLineIndex = outputLineIdx; outputLineIndex < outputLineIdx + lineCount; outputLineIndex++) {
			const globalIndex = globalStartIndex + outputLineIndex - outputLineIdx;
			if (!needed[globalIndex]) {
				result[globalIndex] = null;
				continue;
			}
			result[globalIndex] = this._getViewLineData(lineWithInjections, lineInlineDecorations ? lineInlineDecorations[outputLineIndex] : [], outputLineIndex);
		}
	}

	private _getViewLineData(lineWithInjections: LineTokens, inlineDecorations: InlineDecoration[], outputLineIndex: number): ViewLineData {
		this._assertVisible();
		const lineBreakData = this._projectionData;
		const deltaStartIndex = (outputLineIndex > 0 ? lineBreakData.wrappedTextIndentLength : 0);

		const lineStartOffsetInInputWithInjections = outputLineIndex > 0 ? lineBreakData.breakOffsets[outputLineIndex - 1] : 0;
		const lineEndOffsetInInputWithInjections = lineBreakData.breakOffsets[outputLineIndex];
		const tokens = lineWithInjections.sliceAndInflate(lineStartOffsetInInputWithInjections, lineEndOffsetInInputWithInjections, deltaStartIndex);

		let lineContent = tokens.getLineContent();
		if (outputLineIndex > 0) {
			lineContent = spaces(lineBreakData.wrappedTextIndentLength) + lineContent;
		}

		const minColumn = this._projectionData.getMinOutputOffset(outputLineIndex) + 1;
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

	public getModelColumnOfViewPosition(outputLineIndex: number, outputColumn: number): number {
		this._assertVisible();
		return this._projectionData.translateToInputOffset(outputLineIndex, outputColumn - 1) + 1;
	}

	public getViewPositionOfModelPosition(deltaLineNumber: number, inputColumn: number, affinity: PositionAffinity = PositionAffinity.None): Position {
		this._assertVisible();
		const r = this._projectionData.translateToOutputPosition(inputColumn - 1, affinity);
		return r.toPosition(deltaLineNumber);
	}

	public getViewLineNumberOfModelPosition(deltaLineNumber: number, inputColumn: number): number {
		this._assertVisible();
		const r = this._projectionData.translateToOutputPosition(inputColumn - 1);
		return deltaLineNumber + r.outputLineIndex;
	}

	public normalizePosition(outputLineIndex: number, outputPosition: Position, affinity: PositionAffinity): Position {
		const baseViewLineNumber = outputPosition.lineNumber - outputLineIndex;
		const normalizedOutputPosition = this._projectionData.normalizeOutputPosition(outputLineIndex, outputPosition.column - 1, affinity);
		const result = normalizedOutputPosition.toPosition(baseViewLineNumber);
		return result;
	}

	public getInjectedTextAt(outputLineIndex: number, outputColumn: number): InjectedText | null {
		return this._projectionData.getInjectedText(outputLineIndex, outputColumn - 1);
	}

	private _assertVisible() {
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

	public getProjectionData(): ModelLineProjectionData | null {
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
		const lineTokens = model.tokenization.getLineTokens(modelLineNumber);
		const lineContent = lineTokens.getLineContent();
		return new ViewLineData(
			lineContent,
			false,
			1,
			lineContent.length + 1,
			0,
			lineTokens.inflate(),
			[]
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

	public getProjectionData(): ModelLineProjectionData | null {
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

const _spaces: string[] = [''];
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
