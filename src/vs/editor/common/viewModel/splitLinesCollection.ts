/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { LineTokens } from 'vs/editor/common/core/lineTokens';
import { PrefixSumComputerWithCache } from 'vs/editor/common/viewModel/prefixSumComputer';
import { ViewLineData, ViewEventsCollector } from 'vs/editor/common/viewModel/viewModel';
import * as viewEvents from 'vs/editor/common/view/viewEvents';

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
	getInputOffsetOfOutputPosition(outputLineIndex: number, outputOffset: number): number;
	getOutputPositionOfInputOffset(inputOffset: number): OutputPosition;
}

export interface ILineMapperFactory {
	createLineMapping(lineText: string, tabSize: number, wrappingColumn: number, columnsForFullWidthChar: number, wrappingIndent: editorCommon.WrappingIndent): ILineMapping;
}

export interface IModel {
	getLineTokens(lineNumber: number): LineTokens;
	getLineContent(lineNumber: number): string;
	getLineMinColumn(lineNumber: number): number;
	getLineMaxColumn(lineNumber: number): number;
}

export interface ISplitLine {
	isVisible(): boolean;
	setVisible(isVisible: boolean): ISplitLine;

	getViewLineCount(): number;
	getViewLineContent(model: IModel, modelLineNumber: number, outputLineIndex: number): string;
	getViewLineMinColumn(model: IModel, modelLineNumber: number, outputLineIndex: number): number;
	getViewLineMaxColumn(model: IModel, modelLineNumber: number, outputLineIndex: number): number;
	getViewLineData(model: IModel, modelLineNumber: number, outputLineIndex: number): ViewLineData;
	getViewLinesData(model: IModel, modelLineNumber: number, fromOuputLineIndex: number, toOutputLineIndex: number, globalStartIndex: number, needed: boolean[], result: ViewLineData[]): void;

	getModelColumnOfViewPosition(outputLineIndex: number, outputColumn: number): number;
	getViewPositionOfModelPosition(deltaLineNumber: number, inputColumn: number): Position;
}

class VisibleIdentitySplitLine implements ISplitLine {

	public static INSTANCE = new VisibleIdentitySplitLine();

	private constructor() { }

	public isVisible(): boolean {
		return true;
	}

	public setVisible(isVisible: boolean): ISplitLine {
		if (isVisible) {
			return this;
		}
		return InvisibleIdentitySplitLine.INSTANCE;
	}

	public getViewLineCount(): number {
		return 1;
	}

	public getViewLineContent(model: IModel, modelLineNumber: number, outputLineIndex: number): string {
		return model.getLineContent(modelLineNumber);
	}

	public getViewLineMinColumn(model: IModel, modelLineNumber: number, outputLineIndex: number): number {
		return model.getLineMinColumn(modelLineNumber);
	}

	public getViewLineMaxColumn(model: IModel, modelLineNumber: number, outputLineIndex: number): number {
		return model.getLineMaxColumn(modelLineNumber);
	}

	public getViewLineData(model: IModel, modelLineNumber: number, outputLineIndex: number): ViewLineData {
		let lineTokens = model.getLineTokens(modelLineNumber);
		let lineContent = lineTokens.getLineContent();
		return new ViewLineData(
			lineContent,
			1,
			lineContent.length + 1,
			lineTokens.inflate()
		);
	}

	public getViewLinesData(model: IModel, modelLineNumber: number, fromOuputLineIndex: number, toOutputLineIndex: number, globalStartIndex: number, needed: boolean[], result: ViewLineData[]): void {
		if (!needed[globalStartIndex]) {
			result[globalStartIndex] = null;
			return;
		}
		result[globalStartIndex] = this.getViewLineData(model, modelLineNumber, 0);
	}

	public getModelColumnOfViewPosition(outputLineIndex: number, outputColumn: number): number {
		return outputColumn;
	}

	public getViewPositionOfModelPosition(deltaLineNumber: number, inputColumn: number): Position {
		return new Position(deltaLineNumber, inputColumn);
	}
}

class InvisibleIdentitySplitLine implements ISplitLine {

	public static INSTANCE = new InvisibleIdentitySplitLine();

	private constructor() { }

	public isVisible(): boolean {
		return false;
	}

	public setVisible(isVisible: boolean): ISplitLine {
		if (!isVisible) {
			return this;
		}
		return VisibleIdentitySplitLine.INSTANCE;
	}

	public getViewLineCount(): number {
		return 0;
	}

	public getViewLineContent(model: IModel, modelLineNumber: number, outputLineIndex: number): string {
		throw new Error('Not supported');
	}

	public getViewLineMinColumn(model: IModel, modelLineNumber: number, outputLineIndex: number): number {
		throw new Error('Not supported');
	}

	public getViewLineMaxColumn(model: IModel, modelLineNumber: number, outputLineIndex: number): number {
		throw new Error('Not supported');
	}

	public getViewLineData(model: IModel, modelLineNumber: number, outputLineIndex: number): ViewLineData {
		throw new Error('Not supported');
	}

	public getViewLinesData(model: IModel, modelLineNumber: number, fromOuputLineIndex: number, toOutputLineIndex: number, globalStartIndex: number, needed: boolean[], result: ViewLineData[]): void {
		throw new Error('Not supported');
	}

	public getModelColumnOfViewPosition(outputLineIndex: number, outputColumn: number): number {
		throw new Error('Not supported');
	}

	public getViewPositionOfModelPosition(deltaLineNumber: number, inputColumn: number): Position {
		throw new Error('Not supported');
	}
}

export class SplitLine implements ISplitLine {

	private positionMapper: ILineMapping;
	private outputLineCount: number;

	private wrappedIndent: string;
	private wrappedIndentLength: number;
	private _isVisible: boolean;

	constructor(positionMapper: ILineMapping, isVisible: boolean) {
		this.positionMapper = positionMapper;
		this.wrappedIndent = this.positionMapper.getWrappedLinesIndent();
		this.wrappedIndentLength = this.wrappedIndent.length;
		this.outputLineCount = this.positionMapper.getOutputLineCount();
		this._isVisible = isVisible;
	}

	public isVisible(): boolean {
		return this._isVisible;
	}

	public setVisible(isVisible: boolean): ISplitLine {
		this._isVisible = isVisible;
		return this;
	}

	public getViewLineCount(): number {
		if (!this._isVisible) {
			return 0;
		}
		return this.outputLineCount;
	}

	private getInputStartOffsetOfOutputLineIndex(outputLineIndex: number): number {
		return this.positionMapper.getInputOffsetOfOutputPosition(outputLineIndex, 0);
	}

	private getInputEndOffsetOfOutputLineIndex(model: IModel, modelLineNumber: number, outputLineIndex: number): number {
		if (outputLineIndex + 1 === this.outputLineCount) {
			return model.getLineMaxColumn(modelLineNumber) - 1;
		}
		return this.positionMapper.getInputOffsetOfOutputPosition(outputLineIndex + 1, 0);
	}

	public getViewLineContent(model: IModel, modelLineNumber: number, outputLineIndex: number): string {
		if (!this._isVisible) {
			throw new Error('Not supported');
		}
		let startOffset = this.getInputStartOffsetOfOutputLineIndex(outputLineIndex);
		let endOffset = this.getInputEndOffsetOfOutputLineIndex(model, modelLineNumber, outputLineIndex);
		let r = model.getLineContent(modelLineNumber).substring(startOffset, endOffset);

		if (outputLineIndex > 0) {
			r = this.wrappedIndent + r;
		}

		return r;
	}

	public getViewLineMinColumn(model: IModel, modelLineNumber: number, outputLineIndex: number): number {
		if (!this._isVisible) {
			throw new Error('Not supported');
		}
		if (outputLineIndex > 0) {
			return this.wrappedIndentLength + 1;
		}
		return 1;
	}

	public getViewLineMaxColumn(model: IModel, modelLineNumber: number, outputLineIndex: number): number {
		if (!this._isVisible) {
			throw new Error('Not supported');
		}
		return this.getViewLineContent(model, modelLineNumber, outputLineIndex).length + 1;
	}

	public getViewLineData(model: IModel, modelLineNumber: number, outputLineIndex: number): ViewLineData {
		if (!this._isVisible) {
			throw new Error('Not supported');
		}

		let startOffset = this.getInputStartOffsetOfOutputLineIndex(outputLineIndex);
		let endOffset = this.getInputEndOffsetOfOutputLineIndex(model, modelLineNumber, outputLineIndex);

		let lineContent = model.getLineContent(modelLineNumber).substring(startOffset, endOffset);
		if (outputLineIndex > 0) {
			lineContent = this.wrappedIndent + lineContent;
		}

		let minColumn = (outputLineIndex > 0 ? this.wrappedIndentLength + 1 : 1);
		let maxColumn = lineContent.length + 1;

		let deltaStartIndex = 0;
		if (outputLineIndex > 0) {
			deltaStartIndex = this.wrappedIndentLength;
		}
		let lineTokens = model.getLineTokens(modelLineNumber);

		return new ViewLineData(
			lineContent,
			minColumn,
			maxColumn,
			lineTokens.sliceAndInflate(startOffset, endOffset, deltaStartIndex)
		);
	}

	public getViewLinesData(model: IModel, modelLineNumber: number, fromOuputLineIndex: number, toOutputLineIndex: number, globalStartIndex: number, needed: boolean[], result: ViewLineData[]): void {
		if (!this._isVisible) {
			throw new Error('Not supported');
		}

		for (let outputLineIndex = fromOuputLineIndex; outputLineIndex < toOutputLineIndex; outputLineIndex++) {
			let globalIndex = globalStartIndex + outputLineIndex - fromOuputLineIndex;
			if (!needed[globalIndex]) {
				result[globalIndex] = null;
				continue;
			}
			result[globalIndex] = this.getViewLineData(model, modelLineNumber, outputLineIndex);
		}
	}

	public getModelColumnOfViewPosition(outputLineIndex: number, outputColumn: number): number {
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

	public getViewPositionOfModelPosition(deltaLineNumber: number, inputColumn: number): Position {
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

function createSplitLine(linePositionMapperFactory: ILineMapperFactory, text: string, tabSize: number, wrappingColumn: number, columnsForFullWidthChar: number, wrappingIndent: editorCommon.WrappingIndent, isVisible: boolean): ISplitLine {
	let positionMapper = linePositionMapperFactory.createLineMapping(text, tabSize, wrappingColumn, columnsForFullWidthChar, wrappingIndent);
	if (positionMapper === null) {
		// No mapping needed
		if (isVisible) {
			return VisibleIdentitySplitLine.INSTANCE;
		}
		return InvisibleIdentitySplitLine.INSTANCE;
	} else {
		return new SplitLine(positionMapper, isVisible);
	}
}

export class SplitLinesCollection {

	private model: editorCommon.IModel;
	private _validModelVersionId: number;

	private wrappingColumn: number;
	private columnsForFullWidthChar: number;
	private wrappingIndent: editorCommon.WrappingIndent;
	private tabSize: number;
	private lines: ISplitLine[];

	private prefixSumComputer: PrefixSumComputerWithCache;

	private linePositionMapperFactory: ILineMapperFactory;

	private hiddenAreasIds: string[];

	constructor(model: editorCommon.IModel, linePositionMapperFactory: ILineMapperFactory, tabSize: number, wrappingColumn: number, columnsForFullWidthChar: number, wrappingIndent: editorCommon.WrappingIndent) {
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

	private _constructLines(resetHiddenAreas: boolean): void {
		this.lines = [];

		if (resetHiddenAreas) {
			this.hiddenAreasIds = [];
		}

		let linesContent = this.model.getLinesContent();
		let lineCount = linesContent.length;
		let values = new Uint32Array(lineCount);

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
			values[i] = line.getViewLineCount();
			this.lines[i] = line;
		}

		this._validModelVersionId = this.model.getVersionId();

		this.prefixSumComputer = new PrefixSumComputerWithCache(values);
	}

	private getHiddenAreas(): Range[] {
		return this.hiddenAreasIds.map((decId) => {
			return this.model.getDecorationRange(decId);
		}).sort(Range.compareRangesUsingStarts);
	}

	private _reduceRanges(_ranges: editorCommon.IRange[]): Range[] {
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

	public setHiddenAreas(eventsCollector: ViewEventsCollector, _ranges: editorCommon.IRange[]): boolean {

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

		let newDecorations: editorCommon.IModelDeltaDecoration[] = [];
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
					this.lines[i] = this.lines[i].setVisible(false);
					lineChanged = true;
				}
			} else {
				// Line should be visible
				if (!this.lines[i].isVisible()) {
					this.lines[i] = this.lines[i].setVisible(true);
					lineChanged = true;
				}
			}
			if (lineChanged) {
				let newOutputLineCount = this.lines[i].getViewLineCount();
				this.prefixSumComputer.changeValue(i, newOutputLineCount);
			}
		}

		eventsCollector.emit(new viewEvents.ViewFlushedEvent());
		return true;
	}

	public modelPositionIsVisible(modelLineNumber: number, modelColumn: number): boolean {
		if (modelLineNumber < 1 || modelLineNumber > this.lines.length) {
			// invalid arguments
			return false;
		}
		return this.lines[modelLineNumber - 1].isVisible();
	}

	public setTabSize(eventsCollector: ViewEventsCollector, newTabSize: number): boolean {
		if (this.tabSize === newTabSize) {
			return false;
		}
		this.tabSize = newTabSize;

		this._constructLines(false);
		eventsCollector.emit(new viewEvents.ViewFlushedEvent());

		return true;
	}

	public setWrappingIndent(eventsCollector: ViewEventsCollector, newWrappingIndent: editorCommon.WrappingIndent): boolean {
		if (this.wrappingIndent === newWrappingIndent) {
			return false;
		}
		this.wrappingIndent = newWrappingIndent;

		this._constructLines(false);
		eventsCollector.emit(new viewEvents.ViewFlushedEvent());

		return true;
	}

	public setWrappingColumn(eventsCollector: ViewEventsCollector, newWrappingColumn: number, columnsForFullWidthChar: number): boolean {
		if (this.wrappingColumn === newWrappingColumn && this.columnsForFullWidthChar === columnsForFullWidthChar) {
			return false;
		}
		this.wrappingColumn = newWrappingColumn;
		this.columnsForFullWidthChar = columnsForFullWidthChar;
		this._constructLines(false);
		eventsCollector.emit(new viewEvents.ViewFlushedEvent());

		return true;
	}

	public onModelFlushed(eventsCollector: ViewEventsCollector, versionId: number): void {
		this._constructLines(true);
		eventsCollector.emit(new viewEvents.ViewFlushedEvent());
	}

	public onModelLinesDeleted(eventsCollector: ViewEventsCollector, versionId: number, fromLineNumber: number, toLineNumber: number): void {
		if (versionId <= this._validModelVersionId) {
			return;
		}
		this._validModelVersionId = versionId;

		let outputFromLineNumber = (fromLineNumber === 1 ? 1 : this.prefixSumComputer.getAccumulatedValue(fromLineNumber - 2) + 1);
		let outputToLineNumber = this.prefixSumComputer.getAccumulatedValue(toLineNumber - 1);

		this.lines.splice(fromLineNumber - 1, toLineNumber - fromLineNumber + 1);
		this.prefixSumComputer.removeValues(fromLineNumber - 1, toLineNumber - fromLineNumber + 1);

		eventsCollector.emit(new viewEvents.ViewLinesDeletedEvent(outputFromLineNumber, outputToLineNumber));
	}

	public onModelLinesInserted(eventsCollector: ViewEventsCollector, versionId: number, fromLineNumber: number, toLineNumber: number, text: string[]): void {
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
		let insertPrefixSumValues = new Uint32Array(text.length);

		for (let i = 0, len = text.length; i < len; i++) {
			let line = createSplitLine(this.linePositionMapperFactory, text[i], this.tabSize, this.wrappingColumn, this.columnsForFullWidthChar, this.wrappingIndent, !isInHiddenArea);
			insertLines.push(line);

			let outputLineCount = line.getViewLineCount();
			totalOutputLineCount += outputLineCount;
			insertPrefixSumValues[i] = outputLineCount;
		}

		this.lines = this.lines.slice(0, fromLineNumber - 1).concat(insertLines).concat(this.lines.slice(fromLineNumber - 1));

		this.prefixSumComputer.insertValues(fromLineNumber - 1, insertPrefixSumValues);

		eventsCollector.emit(new viewEvents.ViewLinesInsertedEvent(outputFromLineNumber, outputFromLineNumber + totalOutputLineCount - 1));
	}

	public onModelLineChanged(eventsCollector: ViewEventsCollector, versionId: number, lineNumber: number, newText: string): boolean {
		if (versionId <= this._validModelVersionId) {
			return undefined;
		}
		this._validModelVersionId = versionId;
		let lineIndex = lineNumber - 1;

		let oldOutputLineCount = this.lines[lineIndex].getViewLineCount();
		let isVisible = this.lines[lineIndex].isVisible();
		let line = createSplitLine(this.linePositionMapperFactory, newText, this.tabSize, this.wrappingColumn, this.columnsForFullWidthChar, this.wrappingIndent, isVisible);
		this.lines[lineIndex] = line;
		let newOutputLineCount = this.lines[lineIndex].getViewLineCount();

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

		if (changeFrom <= changeTo) {
			eventsCollector.emit(new viewEvents.ViewLinesChangedEvent(changeFrom, changeTo));
		}
		if (insertFrom <= insertTo) {
			eventsCollector.emit(new viewEvents.ViewLinesInsertedEvent(insertFrom, insertTo));
		}
		if (deleteFrom <= deleteTo) {
			eventsCollector.emit(new viewEvents.ViewLinesDeletedEvent(deleteFrom, deleteTo));
		}

		return lineMappingChanged;
	}

	public getViewLineCount(): number {
		this._ensureValidState();
		return this.prefixSumComputer.getTotalValue();
	}

	private _toValidViewLineNumber(viewLineNumber: number): number {
		if (viewLineNumber < 1) {
			return 1;
		}
		let viewLineCount = this.getViewLineCount();
		if (viewLineNumber > viewLineCount) {
			return viewLineCount;
		}
		return viewLineNumber;
	}

	/**
	 * Gives a hint that a lot of requests are about to come in for these line numbers.
	 */
	public warmUpLookupCache(viewStartLineNumber: number, viewEndLineNumber: number): void {
		this.prefixSumComputer.warmUpCache(viewStartLineNumber - 1, viewEndLineNumber - 1);
	}

	public getViewLineIndentGuide(viewLineNumber: number): number {
		this._ensureValidState();
		viewLineNumber = this._toValidViewLineNumber(viewLineNumber);
		let r = this.prefixSumComputer.getIndexOf(viewLineNumber - 1);
		return this.model.getLineIndentGuide(r.index + 1);
	}

	public getViewLineContent(viewLineNumber: number): string {
		this._ensureValidState();
		viewLineNumber = this._toValidViewLineNumber(viewLineNumber);
		let r = this.prefixSumComputer.getIndexOf(viewLineNumber - 1);
		let lineIndex = r.index;
		let remainder = r.remainder;

		return this.lines[lineIndex].getViewLineContent(this.model, lineIndex + 1, remainder);
	}

	public getViewLineMinColumn(viewLineNumber: number): number {
		this._ensureValidState();
		viewLineNumber = this._toValidViewLineNumber(viewLineNumber);
		let r = this.prefixSumComputer.getIndexOf(viewLineNumber - 1);
		let lineIndex = r.index;
		let remainder = r.remainder;

		return this.lines[lineIndex].getViewLineMinColumn(this.model, lineIndex + 1, remainder);
	}

	public getViewLineMaxColumn(viewLineNumber: number): number {
		this._ensureValidState();
		viewLineNumber = this._toValidViewLineNumber(viewLineNumber);
		let r = this.prefixSumComputer.getIndexOf(viewLineNumber - 1);
		let lineIndex = r.index;
		let remainder = r.remainder;

		return this.lines[lineIndex].getViewLineMaxColumn(this.model, lineIndex + 1, remainder);
	}

	public getViewLineData(viewLineNumber: number): ViewLineData {
		this._ensureValidState();
		viewLineNumber = this._toValidViewLineNumber(viewLineNumber);
		let r = this.prefixSumComputer.getIndexOf(viewLineNumber - 1);
		let lineIndex = r.index;
		let remainder = r.remainder;

		return this.lines[lineIndex].getViewLineData(this.model, lineIndex + 1, remainder);
	}

	public getViewLinesData(viewStartLineNumber: number, viewEndLineNumber: number, needed: boolean[]): ViewLineData[] {
		this._ensureValidState();

		viewStartLineNumber = this._toValidViewLineNumber(viewStartLineNumber);
		viewEndLineNumber = this._toValidViewLineNumber(viewEndLineNumber);

		let start = this.prefixSumComputer.getIndexOf(viewStartLineNumber - 1);
		let viewLineNumber = viewStartLineNumber;
		let startModelLineIndex = start.index;
		let startRemainder = start.remainder;

		let result: ViewLineData[] = [];
		for (let modelLineIndex = startModelLineIndex, len = this.model.getLineCount(); modelLineIndex < len; modelLineIndex++) {
			let line = this.lines[modelLineIndex];
			if (!line.isVisible()) {
				continue;
			}
			let fromViewLineIndex = (modelLineIndex === startModelLineIndex ? startRemainder : 0);
			let remainingViewLineCount = line.getViewLineCount() - fromViewLineIndex;

			let lastLine = false;
			if (viewLineNumber + remainingViewLineCount > viewEndLineNumber) {
				lastLine = true;
				remainingViewLineCount = viewEndLineNumber - viewLineNumber + 1;
			}
			let toViewLineIndex = fromViewLineIndex + remainingViewLineCount;

			line.getViewLinesData(this.model, modelLineIndex + 1, fromViewLineIndex, toViewLineIndex, viewLineNumber - viewStartLineNumber, needed, result);

			viewLineNumber += remainingViewLineCount;

			if (lastLine) {
				break;
			}
		}

		return result;
	}

	public validateViewPosition(viewLineNumber: number, viewColumn: number, expectedModelPosition: Position): Position {
		this._ensureValidState();
		viewLineNumber = this._toValidViewLineNumber(viewLineNumber);

		let r = this.prefixSumComputer.getIndexOf(viewLineNumber - 1);
		let lineIndex = r.index;
		let remainder = r.remainder;

		let line = this.lines[lineIndex];

		let minColumn = line.getViewLineMinColumn(this.model, lineIndex + 1, remainder);
		let maxColumn = line.getViewLineMaxColumn(this.model, lineIndex + 1, remainder);
		if (viewColumn < minColumn) {
			viewColumn = minColumn;
		}
		if (viewColumn > maxColumn) {
			viewColumn = maxColumn;
		}

		let computedModelColumn = line.getModelColumnOfViewPosition(remainder, viewColumn);
		let computedModelPosition = this.model.validatePosition(new Position(lineIndex + 1, computedModelColumn));

		if (computedModelPosition.equals(expectedModelPosition)) {
			return new Position(viewLineNumber, viewColumn);
		}

		return this.convertModelPositionToViewPosition(expectedModelPosition.lineNumber, expectedModelPosition.column);
	}

	public convertViewPositionToModelPosition(viewLineNumber: number, viewColumn: number): Position {
		this._ensureValidState();
		viewLineNumber = this._toValidViewLineNumber(viewLineNumber);

		let r = this.prefixSumComputer.getIndexOf(viewLineNumber - 1);
		let lineIndex = r.index;
		let remainder = r.remainder;

		let inputColumn = this.lines[lineIndex].getModelColumnOfViewPosition(remainder, viewColumn);
		// console.log('out -> in ' + viewLineNumber + ',' + viewColumn + ' ===> ' + (lineIndex+1) + ',' + inputColumn);
		return this.model.validatePosition(new Position(lineIndex + 1, inputColumn));
	}

	public convertModelPositionToViewPosition(_modelLineNumber: number, _modelColumn: number): Position {
		this._ensureValidState();

		let validPosition = this.model.validatePosition(new Position(_modelLineNumber, _modelColumn));
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

		let r: Position;
		if (lineIndexChanged) {
			r = this.lines[lineIndex].getViewPositionOfModelPosition(deltaLineNumber, this.model.getLineMaxColumn(lineIndex + 1));
		} else {
			r = this.lines[inputLineNumber - 1].getViewPositionOfModelPosition(deltaLineNumber, inputColumn);
		}

		// console.log('in -> out ' + inputLineNumber + ',' + inputColumn + ' ===> ' + r.lineNumber + ',' + r);
		return r;
	}
}
