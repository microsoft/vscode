/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Position} from 'vs/editor/common/core/position';
import {Range} from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {FilteredLineTokens, IdentityFilteredLineTokens} from 'vs/editor/common/viewModel/filteredLineTokens';
import {PrefixSumComputer} from 'vs/editor/common/viewModel/prefixSumComputer';
import {ILinesCollection} from 'vs/editor/common/viewModel/viewModelImpl';
import {ViewLineTokens} from 'vs/editor/common/core/viewLineToken';

export class OutputPosition {
	_outputPositionBrand: void;
	outputLineIndex: number;
	outputOffset: number;

	constructor(outputLineIndex: number, outputOffset: number) {
		this.outputLineIndex = outputLineIndex;
		this.outputOffset = outputOffset;
	}
}

export interface ILineMapping {
	getOutputLineCount(): number;
	getWrappedLinesIndent(): string;
	getInputOffsetOfOutputPosition(outputLineIndex:number, outputOffset:number): number;
	getOutputPositionOfInputOffset(inputOffset:number): OutputPosition;
}

export interface ILineMapperFactory {
	createLineMapping(lineText: string, tabSize: number, wrappingColumn: number, columnsForFullWidthChar:number, wrappingIndent:editorCommon.WrappingIndent): ILineMapping;
}

export interface IModel {
	getLineTokens(lineNumber:number, inaccurateTokensAcceptable:boolean): editorCommon.ILineTokens;
	getLineContent(lineNumber:number): string;
	getLineMinColumn(lineNumber:number): number;
	getLineMaxColumn(lineNumber:number): number;
}

export interface ISplitLine {
	isVisible():boolean;
	setVisible(isVisible:boolean):void;
	getOutputLineCount(): number;
	getOutputLineContent(model: IModel, myLineNumber: number, outputLineIndex: number): string;
	getOutputLineMinColumn(model: IModel, myLineNumber: number, outputLineIndex: number): number;
	getOutputLineMaxColumn(model: IModel, myLineNumber: number, outputLineIndex: number): number;
	getOutputLineTokens(model: IModel, myLineNumber: number, outputLineIndex: number): ViewLineTokens;
	getInputColumnOfOutputPosition(outputLineIndex: number, outputColumn: number): number;
	getOutputPositionOfInputPosition(deltaLineNumber: number, inputColumn: number): Position;
}

class IdentitySplitLine implements ISplitLine {

	private _isVisible: boolean;

	public constructor(isVisible: boolean) {
		this._isVisible = isVisible;
	}

	public isVisible():boolean {
		return this._isVisible;
	}

	public setVisible(isVisible:boolean):void {
		this._isVisible = isVisible;
	}

	public getOutputLineCount(): number {
		if (!this._isVisible) {
			return 0;
		}
		return 1;
	}

	public getOutputLineContent(model:IModel, myLineNumber:number, outputLineIndex:number): string {
		if (!this._isVisible) {
			throw new Error('Not supported');
		}
		return model.getLineContent(myLineNumber);
	}

	public getOutputLineMinColumn(model: IModel, myLineNumber: number, outputLineIndex: number): number {
		if (!this._isVisible) {
			throw new Error('Not supported');
		}
		return model.getLineMinColumn(myLineNumber);
	}

	public getOutputLineMaxColumn(model:IModel, myLineNumber:number, outputLineIndex:number): number {
		if (!this._isVisible) {
			throw new Error('Not supported');
		}
		return model.getLineMaxColumn(myLineNumber);
	}

	public getOutputLineTokens(model:IModel, myLineNumber:number, outputLineIndex:number): ViewLineTokens {
		if (!this._isVisible) {
			throw new Error('Not supported');
		}
		return IdentityFilteredLineTokens.create(model.getLineTokens(myLineNumber, true), model.getLineMaxColumn(myLineNumber) - 1);
	}

	public getInputColumnOfOutputPosition(outputLineIndex:number, outputColumn:number): number {
		if (!this._isVisible) {
			throw new Error('Not supported');
		}
		return outputColumn;
	}

	public getOutputPositionOfInputPosition(deltaLineNumber:number, inputColumn:number): Position {
		if (!this._isVisible) {
			throw new Error('Not supported');
		}
		return new Position(deltaLineNumber, inputColumn);
	}
}

export class SplitLine implements ISplitLine {

	private positionMapper:ILineMapping;
	private outputLineCount:number;

	private wrappedIndent:string;
	private wrappedIndentLength:number;
	private _isVisible: boolean;

	constructor(positionMapper:ILineMapping, isVisible: boolean) {
		this.positionMapper = positionMapper;
		this.wrappedIndent = this.positionMapper.getWrappedLinesIndent();
		this.wrappedIndentLength = this.wrappedIndent.length;
		this.outputLineCount = this.positionMapper.getOutputLineCount();
		this._isVisible = isVisible;
	}

	public isVisible():boolean {
		return this._isVisible;
	}

	public setVisible(isVisible:boolean):void {
		this._isVisible = isVisible;
	}

	public getOutputLineCount(): number {
		if (!this._isVisible) {
			return 0;
		}
		return this.outputLineCount;
	}

	private getInputStartOffsetOfOutputLineIndex(outputLineIndex:number): number {
		return this.positionMapper.getInputOffsetOfOutputPosition(outputLineIndex, 0);
	}

	private getInputEndOffsetOfOutputLineIndex(model:IModel, myLineNumber:number, outputLineIndex:number): number {
		if (outputLineIndex + 1 === this.outputLineCount) {
			return model.getLineMaxColumn(myLineNumber) - 1;
		}
		return this.positionMapper.getInputOffsetOfOutputPosition(outputLineIndex + 1, 0);
	}

	public getOutputLineContent(model:IModel, myLineNumber:number, outputLineIndex:number): string {
		if (!this._isVisible) {
			throw new Error('Not supported');
		}
		let startOffset = this.getInputStartOffsetOfOutputLineIndex(outputLineIndex);
		let endOffset = this.getInputEndOffsetOfOutputLineIndex(model, myLineNumber, outputLineIndex);
		let r = model.getLineContent(myLineNumber).substring(startOffset, endOffset);

		if (outputLineIndex > 0) {
			r = this.wrappedIndent + r;
		}

		return r;
	}


	public getOutputLineMinColumn(model:IModel, myLineNumber:number, outputLineIndex:number): number {
		if (!this._isVisible) {
			throw new Error('Not supported');
		}
		if (outputLineIndex > 0) {
			return this.wrappedIndentLength + 1;
		}
		return 1;
	}

	public getOutputLineMaxColumn(model:IModel, myLineNumber:number, outputLineIndex:number): number {
		if (!this._isVisible) {
			throw new Error('Not supported');
		}
		return this.getOutputLineContent(model, myLineNumber, outputLineIndex).length + 1;
	}

	public getOutputLineTokens(model:IModel, myLineNumber:number, outputLineIndex:number): ViewLineTokens {
		if (!this._isVisible) {
			throw new Error('Not supported');
		}
		let startOffset = this.getInputStartOffsetOfOutputLineIndex(outputLineIndex);
		let endOffset = this.getInputEndOffsetOfOutputLineIndex(model, myLineNumber, outputLineIndex);
		let deltaStartIndex = 0;
		if (outputLineIndex > 0) {
			deltaStartIndex = this.wrappedIndentLength;
		}
		return FilteredLineTokens.create(model.getLineTokens(myLineNumber, true), startOffset, endOffset, deltaStartIndex);
	}

	public getInputColumnOfOutputPosition(outputLineIndex:number, outputColumn:number): number {
		if (!this._isVisible) {
			throw new Error('Not supported');
		}
		let adjustedColumn = outputColumn - 1;
		if (outputLineIndex > 0) {
			if (adjustedColumn < this.wrappedIndentLength) {
				adjustedColumn = 0;
			} else {
				adjustedColumn -= this.wrappedIndentLength;
			}
		}
		return this.positionMapper.getInputOffsetOfOutputPosition(outputLineIndex, adjustedColumn) + 1;
	}

	public getOutputPositionOfInputPosition(deltaLineNumber:number, inputColumn:number): Position {
		if (!this._isVisible) {
			throw new Error('Not supported');
		}
		let r = this.positionMapper.getOutputPositionOfInputOffset(inputColumn - 1);
		let outputLineIndex = r.outputLineIndex;
		let outputColumn = r.outputOffset + 1;

		if (outputLineIndex > 0) {
			outputColumn += this.wrappedIndentLength;
		}

//		console.log('in -> out ' + deltaLineNumber + ',' + inputColumn + ' ===> ' + (deltaLineNumber+outputLineIndex) + ',' + outputColumn);
		return new Position(deltaLineNumber + outputLineIndex, outputColumn);
	}
}

function createSplitLine(linePositionMapperFactory:ILineMapperFactory, text:string, tabSize:number, wrappingColumn:number, columnsForFullWidthChar:number, wrappingIndent:editorCommon.WrappingIndent, isVisible: boolean): ISplitLine {
	let positionMapper = linePositionMapperFactory.createLineMapping(text, tabSize, wrappingColumn, columnsForFullWidthChar, wrappingIndent);
	if (positionMapper === null) {
		// No mapping needed
		return new IdentitySplitLine(isVisible);
	} else {
		return new SplitLine(positionMapper, isVisible);
	}
}

export class SplitLinesCollection implements ILinesCollection {

	private model: editorCommon.IModel;
	private _validModelVersionId: number;

	private wrappingColumn:number;
	private columnsForFullWidthChar:number;
	private wrappingIndent: editorCommon.WrappingIndent;
	private tabSize:number;
	private lines:ISplitLine[];
	private prefixSumComputer:PrefixSumComputer;
	private linePositionMapperFactory:ILineMapperFactory;

	private hiddenAreasIds:string[];

	constructor(model:editorCommon.IModel, linePositionMapperFactory:ILineMapperFactory, tabSize:number, wrappingColumn:number, columnsForFullWidthChar:number, wrappingIndent:editorCommon.WrappingIndent) {
		this.model = model;
		this._validModelVersionId = -1;
		this.tabSize = tabSize;
		this.wrappingColumn = wrappingColumn;
		this.columnsForFullWidthChar = columnsForFullWidthChar;
		this.wrappingIndent = wrappingIndent;
		this.linePositionMapperFactory = linePositionMapperFactory;

		this._constructLines(true);
	}

	public dispose(): void {
		this.hiddenAreasIds = this.model.deltaDecorations(this.hiddenAreasIds, []);
	}

	private _ensureValidState(): void {
		let modelVersion = this.model.getVersionId();
		if (modelVersion !== this._validModelVersionId) {
			throw new Error('SplitLinesCollection: attempt to access a \'newer\' model');
		}
	}

	private _constructLines(resetHiddenAreas:boolean): void {
		this.lines = [];

		if (resetHiddenAreas) {
			this.hiddenAreasIds = [];
		}

		let values:number[] = [];
		let linesContent = this.model.getLinesContent();
		let lineCount = linesContent.length;

		let hiddenAreas = this.hiddenAreasIds.map((areaId) => this.model.getDecorationRange(areaId)).sort(Range.compareRangesUsingStarts);
		let hiddenAreaStart = 1, hiddenAreaEnd = 0;
		let hiddenAreaIdx = -1;
		let nextLineNumberToUpdateHiddenArea = (hiddenAreaIdx + 1 < hiddenAreas.length) ? hiddenAreaEnd + 1 : lineCount + 2;

		for (let i = 0; i < lineCount; i++) {
			let lineNumber = i + 1;

			if (lineNumber === nextLineNumberToUpdateHiddenArea) {
				hiddenAreaIdx++;
				hiddenAreaStart = hiddenAreas[hiddenAreaIdx].startLineNumber;
				hiddenAreaEnd = hiddenAreas[hiddenAreaIdx].endLineNumber;
				nextLineNumberToUpdateHiddenArea = (hiddenAreaIdx + 1 < hiddenAreas.length) ? hiddenAreaEnd + 1 : lineCount + 2;
			}

			let isInHiddenArea = (lineNumber >= hiddenAreaStart && lineNumber <= hiddenAreaEnd);
			let line = createSplitLine(this.linePositionMapperFactory, linesContent[i], this.tabSize, this.wrappingColumn, this.columnsForFullWidthChar, this.wrappingIndent, !isInHiddenArea);
			values[i] = line.getOutputLineCount();
			this.lines[i] = line;
		}

		this._validModelVersionId = this.model.getVersionId();

		this.prefixSumComputer = new PrefixSumComputer(values);
	}

	private getHiddenAreas(): Range[] {
		return this.hiddenAreasIds.map((decId) => {
			return this.model.getDecorationRange(decId);
		}).sort(Range.compareRangesUsingStarts);
	}

	private _reduceRanges(_ranges:editorCommon.IRange[]): Range[] {
		if (_ranges.length === 0) {
			return [];
		}
		let ranges = _ranges.map(r => this.model.validateRange(r)).sort(Range.compareRangesUsingStarts);

		let result: Range[] = [];
		let currentRangeStart = ranges[0].startLineNumber;
		let currentRangeEnd = ranges[0].endLineNumber;

		for (let i = 1, len = ranges.length; i < len; i++) {
			let range = ranges[i];

			if (range.startLineNumber > currentRangeEnd + 1) {
				result.push(new Range(currentRangeStart, 1, currentRangeEnd, 1));
				currentRangeStart = range.startLineNumber;
				currentRangeEnd = range.endLineNumber;
			} else if (range.endLineNumber > currentRangeEnd) {
				currentRangeEnd = range.endLineNumber;
			}
		}
		result.push(new Range(currentRangeStart, 1, currentRangeEnd, 1));
		return result;
	}

	public setHiddenAreas(_ranges:editorCommon.IRange[], emit:(evenType:string, payload:any)=>void): boolean {

		let newRanges = this._reduceRanges(_ranges);

		// BEGIN TODO@Martin: Please stop calling this method on each model change!
		let oldRanges = this.hiddenAreasIds.map((areaId) => this.model.getDecorationRange(areaId)).sort(Range.compareRangesUsingStarts);

		if (newRanges.length === oldRanges.length) {
			let hasDifference = false;
			for (let i = 0; i < newRanges.length; i++) {
				if (!newRanges[i].equalsRange(oldRanges[i])) {
					hasDifference = true;
					break;
				}
			}
			if (!hasDifference) {
				return false;
			}
		}
		// END TODO@Martin: Please stop calling this method on each model change!

		let newDecorations:editorCommon.IModelDeltaDecoration[] = [];
		for (let i = 0; i < newRanges.length; i++) {
			newDecorations.push({
				range: newRanges[i],
				options: {
				}
			});
		}

		this.hiddenAreasIds = this.model.deltaDecorations(this.hiddenAreasIds, newDecorations);

		let hiddenAreas = newRanges;
		let hiddenAreaStart = 1, hiddenAreaEnd = 0;
		let hiddenAreaIdx = -1;
		let nextLineNumberToUpdateHiddenArea = (hiddenAreaIdx + 1 < hiddenAreas.length) ? hiddenAreaEnd + 1 : this.lines.length + 2;

		for (let i = 0; i < this.lines.length; i++) {
			let lineNumber = i + 1;

			if (lineNumber === nextLineNumberToUpdateHiddenArea) {
				hiddenAreaIdx++;
				hiddenAreaStart = hiddenAreas[hiddenAreaIdx].startLineNumber;
				hiddenAreaEnd = hiddenAreas[hiddenAreaIdx].endLineNumber;
				nextLineNumberToUpdateHiddenArea = (hiddenAreaIdx + 1 < hiddenAreas.length) ? hiddenAreaEnd + 1 : this.lines.length + 2;
			}

			let lineChanged = false;
			if (lineNumber >= hiddenAreaStart && lineNumber <= hiddenAreaEnd) {
				// Line should be hidden
				if (this.lines[i].isVisible()) {
					this.lines[i].setVisible(false);
					lineChanged = true;
				}
			} else {
				// Line should be visible
				if (!this.lines[i].isVisible()) {
					this.lines[i].setVisible(true);
					lineChanged = true;
				}
			}
			if (lineChanged) {
				let newOutputLineCount = this.lines[i].getOutputLineCount();
				this.prefixSumComputer.changeValue(i, newOutputLineCount);
			}
		}

		emit(editorCommon.ViewEventNames.ModelFlushedEvent, null);
		return true;
	}

	public inputPositionIsVisible(inputLineNumber:number, inputColumn:number): boolean {
		if (inputLineNumber < 1 || inputLineNumber > this.lines.length) {
			// invalid arguments
			return false;
		}
		return this.lines[inputLineNumber - 1].isVisible();
	}

	public setTabSize(newTabSize:number, emit:(evenType:string, payload:any)=>void): boolean {
		if (this.tabSize === newTabSize) {
			return false;
		}
		this.tabSize = newTabSize;

		this._constructLines(false);
		emit(editorCommon.ViewEventNames.ModelFlushedEvent, null);

		return true;
	}

	public setWrappingIndent(newWrappingIndent:editorCommon.WrappingIndent, emit:(evenType:string, payload:any)=>void): boolean {
		if (this.wrappingIndent === newWrappingIndent) {
			return false;
		}
		this.wrappingIndent = newWrappingIndent;

		this._constructLines(false);
		emit(editorCommon.ViewEventNames.ModelFlushedEvent, null);

		return true;
	}

	public setWrappingColumn(newWrappingColumn:number, columnsForFullWidthChar:number, emit:(evenType:string, payload:any)=>void): boolean {
		if (this.wrappingColumn === newWrappingColumn && this.columnsForFullWidthChar === columnsForFullWidthChar) {
			return false;
		}
		this.wrappingColumn = newWrappingColumn;
		this.columnsForFullWidthChar = columnsForFullWidthChar;
		this._constructLines(false);
		emit(editorCommon.ViewEventNames.ModelFlushedEvent, null);

		return true;
	}

	public onModelFlushed(versionId:number, emit:(evenType:string, payload:any)=>void): void {
		this._constructLines(true);
		emit(editorCommon.ViewEventNames.ModelFlushedEvent, null);
	}

	public onModelLinesDeleted(versionId: number, fromLineNumber: number, toLineNumber: number, emit: (evenType: string, payload: any) => void): void {
		if (versionId <= this._validModelVersionId) {
			return;
		}
		this._validModelVersionId = versionId;

		let outputFromLineNumber = (fromLineNumber === 1 ? 1 : this.prefixSumComputer.getAccumulatedValue(fromLineNumber - 2) + 1);
		let outputToLineNumber = this.prefixSumComputer.getAccumulatedValue(toLineNumber - 1);

		this.lines.splice(fromLineNumber - 1, toLineNumber - fromLineNumber + 1);
		this.prefixSumComputer.removeValues(fromLineNumber - 1, toLineNumber - fromLineNumber + 1);

		let e:editorCommon.IViewLinesDeletedEvent = {
			fromLineNumber: outputFromLineNumber,
			toLineNumber: outputToLineNumber
		};
		emit(editorCommon.ViewEventNames.LinesDeletedEvent, e);
	}

	public onModelLinesInserted(versionId:number, fromLineNumber:number, toLineNumber:number, text:string[], emit:(evenType:string, payload:any)=>void): void {
		if (versionId <= this._validModelVersionId) {
			return;
		}
		this._validModelVersionId = versionId;

		let hiddenAreas = this.getHiddenAreas();
		let isInHiddenArea = false;
		let testPosition = new Position(fromLineNumber, 1);
		for (let i = 0; i < hiddenAreas.length; i++) {
			if (hiddenAreas[i].containsPosition(testPosition)) {
				isInHiddenArea = true;
				break;
			}
		}

		let outputFromLineNumber = (fromLineNumber === 1 ? 1 : this.prefixSumComputer.getAccumulatedValue(fromLineNumber - 2) + 1);

		let totalOutputLineCount = 0;
		let insertLines: ISplitLine[] = [];
		let insertPrefixSumValues: number[] = [];

		for (let i = 0, len = text.length; i < len; i++) {
			let line = createSplitLine(this.linePositionMapperFactory, text[i], this.tabSize, this.wrappingColumn, this.columnsForFullWidthChar, this.wrappingIndent, !isInHiddenArea);
			insertLines.push(line);

			let outputLineCount = line.getOutputLineCount();
			totalOutputLineCount += outputLineCount;
			insertPrefixSumValues.push(outputLineCount);
		}

		this.lines = this.lines.slice(0, fromLineNumber - 1).concat(insertLines).concat(this.lines.slice(fromLineNumber - 1));

		this.prefixSumComputer.insertValues(fromLineNumber - 1, insertPrefixSumValues);

		let e:editorCommon.IViewLinesInsertedEvent = {
			fromLineNumber: outputFromLineNumber,
			toLineNumber: outputFromLineNumber + totalOutputLineCount - 1
		};
		emit(editorCommon.ViewEventNames.LinesInsertedEvent, e);
	}

	public onModelLineChanged(versionId:number, lineNumber:number, newText:string, emit:(evenType:string, payload:any)=>void): boolean {
		if (versionId <= this._validModelVersionId) {
			return;
		}
		this._validModelVersionId = versionId;
		let lineIndex = lineNumber - 1;

		let oldOutputLineCount = this.lines[lineIndex].getOutputLineCount();
		let isVisible = this.lines[lineIndex].isVisible();
		let line = createSplitLine(this.linePositionMapperFactory, newText, this.tabSize, this.wrappingColumn, this.columnsForFullWidthChar, this.wrappingIndent, isVisible);
		this.lines[lineIndex] = line;
		let newOutputLineCount = this.lines[lineIndex].getOutputLineCount();

		let lineMappingChanged = false;
		let changeFrom = 0;
		let changeTo = -1;
		let insertFrom = 0;
		let insertTo = -1;
		let deleteFrom = 0;
		let deleteTo = -1;

		if (oldOutputLineCount > newOutputLineCount) {
			changeFrom = (lineNumber === 1 ? 1 : this.prefixSumComputer.getAccumulatedValue(lineNumber - 2) + 1);
			changeTo = changeFrom + newOutputLineCount - 1;
			deleteFrom = changeTo + 1;
			deleteTo = deleteFrom + (oldOutputLineCount - newOutputLineCount) - 1;
			lineMappingChanged = true;
		} else if (oldOutputLineCount < newOutputLineCount) {
			changeFrom = (lineNumber === 1 ? 1 : this.prefixSumComputer.getAccumulatedValue(lineNumber - 2) + 1);
			changeTo = changeFrom + oldOutputLineCount - 1;
			insertFrom = changeTo + 1;
			insertTo = insertFrom + (newOutputLineCount - oldOutputLineCount) - 1;
			lineMappingChanged = true;
		} else {
			changeFrom = (lineNumber === 1 ? 1 : this.prefixSumComputer.getAccumulatedValue(lineNumber - 2) + 1);
			changeTo = changeFrom + newOutputLineCount - 1;
		}

		this.prefixSumComputer.changeValue(lineIndex, newOutputLineCount);

		let e1:editorCommon.IViewLineChangedEvent;
		let e2:editorCommon.IViewLinesInsertedEvent;
		let e3:editorCommon.IViewLinesDeletedEvent;

		if (changeFrom <= changeTo) {
			for (let i = changeFrom; i <= changeTo; i++) {
				e1 = {
					lineNumber: i
				};
				emit(editorCommon.ViewEventNames.LineChangedEvent, e1);
			}
		}
		if (insertFrom <= insertTo) {
			e2 = {
				fromLineNumber: insertFrom,
				toLineNumber: insertTo
			};
			emit(editorCommon.ViewEventNames.LinesInsertedEvent, e2);
		}
		if (deleteFrom <= deleteTo) {
			e3 = {
				fromLineNumber: deleteFrom,
				toLineNumber: deleteTo
			};
			emit(editorCommon.ViewEventNames.LinesDeletedEvent, e3);
		}

		return lineMappingChanged;
	}

	public getOutputLineCount(): number {
		this._ensureValidState();
		return this.prefixSumComputer.getTotalValue();
	}

	private _toValidOutputLineNumber(outputLineNumber: number): number {
		if (outputLineNumber < 1) {
			return 1;
		}
		let outputLineCount = this.getOutputLineCount();
		if (outputLineNumber > outputLineCount) {
			return outputLineCount;
		}
		return outputLineNumber;
	}

	public getOutputLineContent(outputLineNumber: number): string {
		this._ensureValidState();
		outputLineNumber = this._toValidOutputLineNumber(outputLineNumber);
		let r = this.prefixSumComputer.getIndexOf(outputLineNumber - 1);
		let lineIndex = r.index;
		let remainder = r.remainder;

		return this.lines[lineIndex].getOutputLineContent(this.model, lineIndex + 1, remainder);
	}

	public getOutputIndentGuide(outputLineNumber:number): number {
		this._ensureValidState();
		outputLineNumber = this._toValidOutputLineNumber(outputLineNumber);
		let r = this.prefixSumComputer.getIndexOf(outputLineNumber - 1);
		return this.model.getLineIndentGuide(r.index + 1);
	}

	public getOutputLineMinColumn(outputLineNumber:number): number {
		this._ensureValidState();
		outputLineNumber = this._toValidOutputLineNumber(outputLineNumber);
		let r = this.prefixSumComputer.getIndexOf(outputLineNumber - 1);
		let lineIndex = r.index;
		let remainder = r.remainder;

		return this.lines[lineIndex].getOutputLineMinColumn(this.model, lineIndex + 1, remainder);
	}

	public getOutputLineMaxColumn(outputLineNumber: number): number {
		this._ensureValidState();
		outputLineNumber = this._toValidOutputLineNumber(outputLineNumber);
		let r = this.prefixSumComputer.getIndexOf(outputLineNumber - 1);
		let lineIndex = r.index;
		let remainder = r.remainder;

		return this.lines[lineIndex].getOutputLineMaxColumn(this.model, lineIndex + 1, remainder);
	}

	public getOutputLineTokens(outputLineNumber: number): ViewLineTokens {
		this._ensureValidState();
		outputLineNumber = this._toValidOutputLineNumber(outputLineNumber);
		let r = this.prefixSumComputer.getIndexOf(outputLineNumber - 1);
		let lineIndex = r.index;
		let remainder = r.remainder;

		return this.lines[lineIndex].getOutputLineTokens(this.model, lineIndex + 1, remainder);
	}

	public convertOutputPositionToInputPosition(viewLineNumber: number, viewColumn: number): Position {
		this._ensureValidState();
		viewLineNumber = this._toValidOutputLineNumber(viewLineNumber);

		let r = this.prefixSumComputer.getIndexOf(viewLineNumber - 1);
		let lineIndex = r.index;
		let remainder = r.remainder;

		let inputColumn = this.lines[lineIndex].getInputColumnOfOutputPosition(remainder, viewColumn);
		// console.log('out -> in ' + viewLineNumber + ',' + viewColumn + ' ===> ' + (lineIndex+1) + ',' + inputColumn);
		return this.model.validatePosition(new Position(lineIndex+1, inputColumn));
	}

	public convertInputPositionToOutputPosition(_inputLineNumber: number, _inputColumn: number): Position {
		this._ensureValidState();

		let validPosition = this.model.validatePosition(new Position(_inputLineNumber, _inputColumn));
		let inputLineNumber = validPosition.lineNumber;
		let inputColumn = validPosition.column;

		let lineIndex = inputLineNumber - 1, lineIndexChanged = false;
		while (lineIndex > 0 && !this.lines[lineIndex].isVisible()) {
			lineIndex--;
			lineIndexChanged = true;
		}
		if (lineIndex === 0 && !this.lines[lineIndex].isVisible()) {
			// Could not reach a real line
			// console.log('in -> out ' + inputLineNumber + ',' + inputColumn + ' ===> ' + 1 + ',' + 1);
			return new Position(1, 1);
		}
		let deltaLineNumber = 1 + (lineIndex === 0 ? 0 : this.prefixSumComputer.getAccumulatedValue(lineIndex - 1));

		let r:Position;
		if (lineIndexChanged) {
			r =  this.lines[lineIndex].getOutputPositionOfInputPosition(deltaLineNumber, this.model.getLineMaxColumn(lineIndex + 1));
		} else {
			r = this.lines[inputLineNumber - 1].getOutputPositionOfInputPosition(deltaLineNumber, inputColumn);
		}

		// console.log('in -> out ' + inputLineNumber + ',' + inputColumn + ' ===> ' + r.lineNumber + ',' + r);
		return r;
	}
}