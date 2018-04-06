/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Position } from 'vs/editor/common/core/position';
import { Range, IRange } from 'vs/editor/common/core/range';
import { LineTokens } from 'vs/editor/common/core/lineTokens';
import { PrefixSumComputerWithCache } from 'vs/editor/common/viewModel/prefixSumComputer';
import { ViewLineData, ICoordinatesConverter, IOverviewRulerDecorations } from 'vs/editor/common/viewModel/viewModel';
import * as viewEvents from 'vs/editor/common/view/viewEvents';
import { WrappingIndent } from 'vs/editor/common/config/editorOptions';
import { ModelDecorationOptions, ModelDecorationOverviewRulerOptions } from 'vs/editor/common/model/textModel';
import { ThemeColor, ITheme } from 'vs/platform/theme/common/themeService';
import { Color } from 'vs/base/common/color';
import { IModelDecoration, ITextModel, IModelDeltaDecoration, EndOfLinePreference } from 'vs/editor/common/model';

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
	createLineMapping(lineText: string, tabSize: number, wrappingColumn: number, columnsForFullWidthChar: number, wrappingIndent: WrappingIndent): ILineMapping;
}

export interface ISimpleModel {
	getLineTokens(lineNumber: number): LineTokens;
	getLineContent(lineNumber: number): string;
	getLineMinColumn(lineNumber: number): number;
	getLineMaxColumn(lineNumber: number): number;
	getValueInRange(range: IRange, eol?: EndOfLinePreference): string;
}

export interface ISplitLine {
	isVisible(): boolean;
	setVisible(isVisible: boolean): ISplitLine;

	getViewLineCount(): number;
	getViewLineContent(model: ISimpleModel, modelLineNumber: number, outputLineIndex: number): string;
	getViewLineMinColumn(model: ISimpleModel, modelLineNumber: number, outputLineIndex: number): number;
	getViewLineMaxColumn(model: ISimpleModel, modelLineNumber: number, outputLineIndex: number): number;
	getViewLineData(model: ISimpleModel, modelLineNumber: number, outputLineIndex: number): ViewLineData;
	getViewLinesData(model: ISimpleModel, modelLineNumber: number, fromOuputLineIndex: number, toOutputLineIndex: number, globalStartIndex: number, needed: boolean[], result: ViewLineData[]): void;

	getModelColumnOfViewPosition(outputLineIndex: number, outputColumn: number): number;
	getViewPositionOfModelPosition(deltaLineNumber: number, inputColumn: number): Position;
	getViewLineNumberOfModelPosition(deltaLineNumber: number, inputColumn: number): number;
}

export interface IViewModelLinesCollection {
	createCoordinatesConverter(): ICoordinatesConverter;

	dispose(): void;

	setWrappingSettings(wrappingIndent: WrappingIndent, wrappingColumn: number, columnsForFullWidthChar: number): boolean;
	setTabSize(newTabSize: number): boolean;
	getHiddenAreas(): Range[];
	setHiddenAreas(_ranges: Range[]): boolean;

	onModelFlushed(): void;
	onModelLinesDeleted(versionId: number, fromLineNumber: number, toLineNumber: number): viewEvents.ViewLinesDeletedEvent;
	onModelLinesInserted(versionId: number, fromLineNumber: number, toLineNumber: number, text: string[]): viewEvents.ViewLinesInsertedEvent;
	onModelLineChanged(versionId: number, lineNumber: number, newText: string): [boolean, viewEvents.ViewLinesChangedEvent, viewEvents.ViewLinesInsertedEvent, viewEvents.ViewLinesDeletedEvent];
	acceptVersionId(versionId: number): void;

	getViewLineCount(): number;
	warmUpLookupCache(viewStartLineNumber: number, viewEndLineNumber: number): void;
	getViewLinesIndentGuides(viewStartLineNumber: number, viewEndLineNumber: number): number[];
	getViewLineContent(viewLineNumber: number): string;
	getViewLineMinColumn(viewLineNumber: number): number;
	getViewLineMaxColumn(viewLineNumber: number): number;
	getViewLineData(viewLineNumber: number): ViewLineData;
	getViewLinesData(viewStartLineNumber: number, viewEndLineNumber: number, needed: boolean[]): ViewLineData[];

	getAllOverviewRulerDecorations(ownerId: number, filterOutValidation: boolean, theme: ITheme): IOverviewRulerDecorations;
	getDecorationsInRange(range: Range, ownerId: number, filterOutValidation: boolean): IModelDecoration[];
}

export class CoordinatesConverter implements ICoordinatesConverter {

	private readonly _lines: SplitLinesCollection;

	constructor(lines: SplitLinesCollection) {
		this._lines = lines;
	}

	// View -> Model conversion and related methods

	public convertViewPositionToModelPosition(viewPosition: Position): Position {
		return this._lines.convertViewPositionToModelPosition(viewPosition.lineNumber, viewPosition.column);
	}

	public convertViewRangeToModelRange(viewRange: Range): Range {
		let start = this._lines.convertViewPositionToModelPosition(viewRange.startLineNumber, viewRange.startColumn);
		let end = this._lines.convertViewPositionToModelPosition(viewRange.endLineNumber, viewRange.endColumn);
		return new Range(start.lineNumber, start.column, end.lineNumber, end.column);
	}

	public validateViewPosition(viewPosition: Position, expectedModelPosition: Position): Position {
		return this._lines.validateViewPosition(viewPosition.lineNumber, viewPosition.column, expectedModelPosition);
	}

	public validateViewRange(viewRange: Range, expectedModelRange: Range): Range {
		const validViewStart = this._lines.validateViewPosition(viewRange.startLineNumber, viewRange.startColumn, expectedModelRange.getStartPosition());
		const validViewEnd = this._lines.validateViewPosition(viewRange.endLineNumber, viewRange.endColumn, expectedModelRange.getEndPosition());
		return new Range(validViewStart.lineNumber, validViewStart.column, validViewEnd.lineNumber, validViewEnd.column);
	}

	// Model -> View conversion and related methods

	public convertModelPositionToViewPosition(modelPosition: Position): Position {
		return this._lines.convertModelPositionToViewPosition(modelPosition.lineNumber, modelPosition.column);
	}

	public convertModelRangeToViewRange(modelRange: Range): Range {
		let start = this._lines.convertModelPositionToViewPosition(modelRange.startLineNumber, modelRange.startColumn);
		let end = this._lines.convertModelPositionToViewPosition(modelRange.endLineNumber, modelRange.endColumn);
		return new Range(start.lineNumber, start.column, end.lineNumber, end.column);
	}

	public modelPositionIsVisible(modelPosition: Position): boolean {
		return this._lines.modelPositionIsVisible(modelPosition.lineNumber, modelPosition.column);
	}

}

export class SplitLinesCollection implements IViewModelLinesCollection {

	private model: ITextModel;
	private _validModelVersionId: number;

	private wrappingColumn: number;
	private columnsForFullWidthChar: number;
	private wrappingIndent: WrappingIndent;
	private tabSize: number;
	private lines: ISplitLine[];

	private prefixSumComputer: PrefixSumComputerWithCache;

	private linePositionMapperFactory: ILineMapperFactory;

	private hiddenAreasIds: string[];

	constructor(model: ITextModel, linePositionMapperFactory: ILineMapperFactory, tabSize: number, wrappingColumn: number, columnsForFullWidthChar: number, wrappingIndent: WrappingIndent) {
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

	public createCoordinatesConverter(): ICoordinatesConverter {
		return new CoordinatesConverter(this);
	}

	private _ensureValidState(): void {
		let modelVersion = this.model.getVersionId();
		if (modelVersion !== this._validModelVersionId) {
			// This is pretty bad, it means we lost track of the model...
			throw new Error(`ViewModel is out of sync with Model!`);
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

	public getHiddenAreas(): Range[] {
		return this.hiddenAreasIds.map((decId) => {
			return this.model.getDecorationRange(decId);
		});
	}

	private _reduceRanges(_ranges: Range[]): Range[] {
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

	public setHiddenAreas(_ranges: Range[]): boolean {

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

		let newDecorations: IModelDeltaDecoration[] = [];
		for (let i = 0; i < newRanges.length; i++) {
			newDecorations.push({
				range: newRanges[i],
				options: ModelDecorationOptions.EMPTY
			});
		}

		this.hiddenAreasIds = this.model.deltaDecorations(this.hiddenAreasIds, newDecorations);

		let hiddenAreas = newRanges;
		let hiddenAreaStart = 1, hiddenAreaEnd = 0;
		let hiddenAreaIdx = -1;
		let nextLineNumberToUpdateHiddenArea = (hiddenAreaIdx + 1 < hiddenAreas.length) ? hiddenAreaEnd + 1 : this.lines.length + 2;

		let hasVisibleLine = false;
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
				hasVisibleLine = true;
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

		if (!hasVisibleLine) {
			// Cannot have everything be hidden => reveal everything!
			this.setHiddenAreas([]);
		}

		return true;
	}

	public modelPositionIsVisible(modelLineNumber: number, modelColumn: number): boolean {
		if (modelLineNumber < 1 || modelLineNumber > this.lines.length) {
			// invalid arguments
			return false;
		}
		return this.lines[modelLineNumber - 1].isVisible();
	}

	public setTabSize(newTabSize: number): boolean {
		if (this.tabSize === newTabSize) {
			return false;
		}
		this.tabSize = newTabSize;

		this._constructLines(false);

		return true;
	}

	public setWrappingSettings(wrappingIndent: WrappingIndent, wrappingColumn: number, columnsForFullWidthChar: number): boolean {
		if (this.wrappingIndent === wrappingIndent && this.wrappingColumn === wrappingColumn && this.columnsForFullWidthChar === columnsForFullWidthChar) {
			return false;
		}

		this.wrappingIndent = wrappingIndent;
		this.wrappingColumn = wrappingColumn;
		this.columnsForFullWidthChar = columnsForFullWidthChar;

		this._constructLines(false);

		return true;
	}

	public onModelFlushed(): void {
		this._constructLines(true);
	}

	public onModelLinesDeleted(versionId: number, fromLineNumber: number, toLineNumber: number): viewEvents.ViewLinesDeletedEvent {
		if (versionId <= this._validModelVersionId) {
			// Here we check for versionId in case the lines were reconstructed in the meantime.
			// We don't want to apply stale change events on top of a newer read model state.
			return null;
		}

		let outputFromLineNumber = (fromLineNumber === 1 ? 1 : this.prefixSumComputer.getAccumulatedValue(fromLineNumber - 2) + 1);
		let outputToLineNumber = this.prefixSumComputer.getAccumulatedValue(toLineNumber - 1);

		this.lines.splice(fromLineNumber - 1, toLineNumber - fromLineNumber + 1);
		this.prefixSumComputer.removeValues(fromLineNumber - 1, toLineNumber - fromLineNumber + 1);

		return new viewEvents.ViewLinesDeletedEvent(outputFromLineNumber, outputToLineNumber);
	}

	public onModelLinesInserted(versionId: number, fromLineNumber: number, toLineNumber: number, text: string[]): viewEvents.ViewLinesInsertedEvent {
		if (versionId <= this._validModelVersionId) {
			// Here we check for versionId in case the lines were reconstructed in the meantime.
			// We don't want to apply stale change events on top of a newer read model state.
			return null;
		}

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

		// TODO@Alex: use arrays.arrayInsert
		this.lines = this.lines.slice(0, fromLineNumber - 1).concat(insertLines).concat(this.lines.slice(fromLineNumber - 1));

		this.prefixSumComputer.insertValues(fromLineNumber - 1, insertPrefixSumValues);

		return new viewEvents.ViewLinesInsertedEvent(outputFromLineNumber, outputFromLineNumber + totalOutputLineCount - 1);
	}

	public onModelLineChanged(versionId: number, lineNumber: number, newText: string): [boolean, viewEvents.ViewLinesChangedEvent, viewEvents.ViewLinesInsertedEvent, viewEvents.ViewLinesDeletedEvent] {
		if (versionId <= this._validModelVersionId) {
			// Here we check for versionId in case the lines were reconstructed in the meantime.
			// We don't want to apply stale change events on top of a newer read model state.
			return [false, null, null, null];
		}

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

		const viewLinesChangedEvent = (changeFrom <= changeTo ? new viewEvents.ViewLinesChangedEvent(changeFrom, changeTo) : null);
		const viewLinesInsertedEvent = (insertFrom <= insertTo ? new viewEvents.ViewLinesInsertedEvent(insertFrom, insertTo) : null);
		const viewLinesDeletedEvent = (deleteFrom <= deleteTo ? new viewEvents.ViewLinesDeletedEvent(deleteFrom, deleteTo) : null);

		return [lineMappingChanged, viewLinesChangedEvent, viewLinesInsertedEvent, viewLinesDeletedEvent];
	}

	public acceptVersionId(versionId: number): void {
		this._validModelVersionId = versionId;
		if (this.lines.length === 1 && !this.lines[0].isVisible()) {
			// At least one line must be visible => reset hidden areas
			this.setHiddenAreas([]);
		}
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

	public getViewLinesIndentGuides(viewStartLineNumber: number, viewEndLineNumber: number): number[] {
		this._ensureValidState();
		viewStartLineNumber = this._toValidViewLineNumber(viewStartLineNumber);
		viewEndLineNumber = this._toValidViewLineNumber(viewEndLineNumber);

		const modelStart = this.convertViewPositionToModelPosition(viewStartLineNumber, this.getViewLineMinColumn(viewStartLineNumber));
		const modelEnd = this.convertViewPositionToModelPosition(viewEndLineNumber, this.getViewLineMaxColumn(viewEndLineNumber));

		let result: number[] = [];
		let resultRepeatCount: number[] = [];
		const modelStartLineIndex = modelStart.lineNumber - 1;
		const modelEndLineIndex = modelEnd.lineNumber - 1;

		let reqStart: Position = null;
		for (let modelLineIndex = modelStartLineIndex; modelLineIndex <= modelEndLineIndex; modelLineIndex++) {
			const line = this.lines[modelLineIndex];
			if (line.isVisible()) {
				let count = 0;
				if (modelLineIndex === modelStartLineIndex) {
					let viewLineStartIndex = line.getViewLineNumberOfModelPosition(0, modelStart.column);
					let viewLineEndIndex = line.getViewLineNumberOfModelPosition(0, this.model.getLineMaxColumn(modelLineIndex + 1));
					count = viewLineEndIndex - viewLineStartIndex + 1;
				} else {
					let viewLineStartIndex = line.getViewLineNumberOfModelPosition(0, 1);
					let viewLineEndIndex = line.getViewLineNumberOfModelPosition(0, this.model.getLineMaxColumn(modelLineIndex + 1));
					count = viewLineEndIndex - viewLineStartIndex + 1;
				}
				resultRepeatCount.push(count);
				// merge into previous request
				if (reqStart === null) {
					reqStart = new Position(modelLineIndex + 1, 0);
				}
			} else {
				// hit invisible line => flush request
				if (reqStart !== null) {
					result = result.concat(this.model.getLinesIndentGuides(reqStart.lineNumber, modelLineIndex));
					reqStart = null;
				}
			}
		}

		if (reqStart !== null) {
			result = result.concat(this.model.getLinesIndentGuides(reqStart.lineNumber, modelEnd.lineNumber));
			reqStart = null;
		}

		const viewLineCount = viewEndLineNumber - viewStartLineNumber + 1;
		let viewIndents = new Array<number>(viewLineCount);
		let currIndex = 0;
		for (let i = 0, len = result.length; i < len; i++) {
			let value = result[i];
			let count = Math.min(viewLineCount - currIndex, resultRepeatCount[i]);
			for (let j = 0; j < count; j++) {
				viewIndents[currIndex++] = value;
			}
		}
		return viewIndents;
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

	private _getViewLineNumberForModelPosition(inputLineNumber: number, inputColumn: number): number {
		let lineIndex = inputLineNumber - 1;
		if (this.lines[lineIndex].isVisible()) {
			// this model line is visible
			const deltaLineNumber = 1 + (lineIndex === 0 ? 0 : this.prefixSumComputer.getAccumulatedValue(lineIndex - 1));
			return this.lines[lineIndex].getViewLineNumberOfModelPosition(deltaLineNumber, inputColumn);
		}

		// this model line is not visible
		while (lineIndex > 0 && !this.lines[lineIndex].isVisible()) {
			lineIndex--;
		}
		if (lineIndex === 0 && !this.lines[lineIndex].isVisible()) {
			// Could not reach a real line
			return 1;
		}
		const deltaLineNumber = 1 + (lineIndex === 0 ? 0 : this.prefixSumComputer.getAccumulatedValue(lineIndex - 1));
		return this.lines[lineIndex].getViewLineNumberOfModelPosition(deltaLineNumber, this.model.getLineMaxColumn(lineIndex + 1));
	}

	public getAllOverviewRulerDecorations(ownerId: number, filterOutValidation: boolean, theme: ITheme): IOverviewRulerDecorations {
		const decorations = this.model.getOverviewRulerDecorations(ownerId, filterOutValidation);
		const result = new OverviewRulerDecorations();
		for (let i = 0, len = decorations.length; i < len; i++) {
			const decoration = decorations[i];
			const opts = <ModelDecorationOverviewRulerOptions>decoration.options.overviewRuler;
			const lane = opts.position;
			if (lane === 0) {
				continue;
			}
			const color = resolveColor(opts, theme);
			const viewStartLineNumber = this._getViewLineNumberForModelPosition(decoration.range.startLineNumber, decoration.range.startColumn);
			const viewEndLineNumber = this._getViewLineNumberForModelPosition(decoration.range.endLineNumber, decoration.range.endColumn);

			result.accept(color, viewStartLineNumber, viewEndLineNumber, lane);
		}
		return result.result;
	}

	public getDecorationsInRange(range: Range, ownerId: number, filterOutValidation: boolean): IModelDecoration[] {
		const modelStart = this.convertViewPositionToModelPosition(range.startLineNumber, range.startColumn);
		const modelEnd = this.convertViewPositionToModelPosition(range.endLineNumber, range.endColumn);

		if (modelEnd.lineNumber - modelStart.lineNumber <= range.endLineNumber - range.startLineNumber) {
			// most likely there are no hidden lines => fast path
			return this.model.getDecorationsInRange(new Range(modelStart.lineNumber, modelStart.column, modelEnd.lineNumber, modelEnd.column), ownerId, filterOutValidation);
		}

		let result: IModelDecoration[] = [];
		const modelStartLineIndex = modelStart.lineNumber - 1;
		const modelEndLineIndex = modelEnd.lineNumber - 1;

		let reqStart: Position = null;
		for (let modelLineIndex = modelStartLineIndex; modelLineIndex <= modelEndLineIndex; modelLineIndex++) {
			const line = this.lines[modelLineIndex];
			if (line.isVisible()) {
				// merge into previous request
				if (reqStart === null) {
					reqStart = new Position(modelLineIndex + 1, modelLineIndex === modelStartLineIndex ? modelStart.column : 1);
				}
			} else {
				// hit invisible line => flush request
				if (reqStart !== null) {
					const maxLineColumn = this.model.getLineMaxColumn(modelLineIndex);
					result = result.concat(this.model.getDecorationsInRange(new Range(reqStart.lineNumber, reqStart.column, modelLineIndex, maxLineColumn), ownerId, filterOutValidation));
					reqStart = null;
				}
			}
		}

		if (reqStart !== null) {
			result = result.concat(this.model.getDecorationsInRange(new Range(reqStart.lineNumber, reqStart.column, modelEnd.lineNumber, modelEnd.column), ownerId, filterOutValidation));
			reqStart = null;
		}

		return result;
	}
}

class VisibleIdentitySplitLine implements ISplitLine {

	public static readonly INSTANCE = new VisibleIdentitySplitLine();

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

	public getViewLineContent(model: ISimpleModel, modelLineNumber: number, outputLineIndex: number): string {
		return model.getLineContent(modelLineNumber);
	}

	public getViewLineMinColumn(model: ISimpleModel, modelLineNumber: number, outputLineIndex: number): number {
		return model.getLineMinColumn(modelLineNumber);
	}

	public getViewLineMaxColumn(model: ISimpleModel, modelLineNumber: number, outputLineIndex: number): number {
		return model.getLineMaxColumn(modelLineNumber);
	}

	public getViewLineData(model: ISimpleModel, modelLineNumber: number, outputLineIndex: number): ViewLineData {
		let lineTokens = model.getLineTokens(modelLineNumber);
		let lineContent = lineTokens.getLineContent();
		return new ViewLineData(
			lineContent,
			1,
			lineContent.length + 1,
			lineTokens.inflate()
		);
	}

	public getViewLinesData(model: ISimpleModel, modelLineNumber: number, fromOuputLineIndex: number, toOutputLineIndex: number, globalStartIndex: number, needed: boolean[], result: ViewLineData[]): void {
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

	public getViewLineNumberOfModelPosition(deltaLineNumber: number, inputColumn: number): number {
		return deltaLineNumber;
	}
}

class InvisibleIdentitySplitLine implements ISplitLine {

	public static readonly INSTANCE = new InvisibleIdentitySplitLine();

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

	public getViewLineContent(model: ISimpleModel, modelLineNumber: number, outputLineIndex: number): string {
		throw new Error('Not supported');
	}

	public getViewLineMinColumn(model: ISimpleModel, modelLineNumber: number, outputLineIndex: number): number {
		throw new Error('Not supported');
	}

	public getViewLineMaxColumn(model: ISimpleModel, modelLineNumber: number, outputLineIndex: number): number {
		throw new Error('Not supported');
	}

	public getViewLineData(model: ISimpleModel, modelLineNumber: number, outputLineIndex: number): ViewLineData {
		throw new Error('Not supported');
	}

	public getViewLinesData(model: ISimpleModel, modelLineNumber: number, fromOuputLineIndex: number, toOutputLineIndex: number, globalStartIndex: number, needed: boolean[], result: ViewLineData[]): void {
		throw new Error('Not supported');
	}

	public getModelColumnOfViewPosition(outputLineIndex: number, outputColumn: number): number {
		throw new Error('Not supported');
	}

	public getViewPositionOfModelPosition(deltaLineNumber: number, inputColumn: number): Position {
		throw new Error('Not supported');
	}

	public getViewLineNumberOfModelPosition(deltaLineNumber: number, inputColumn: number): number {
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

	private getInputEndOffsetOfOutputLineIndex(model: ISimpleModel, modelLineNumber: number, outputLineIndex: number): number {
		if (outputLineIndex + 1 === this.outputLineCount) {
			return model.getLineMaxColumn(modelLineNumber) - 1;
		}
		return this.positionMapper.getInputOffsetOfOutputPosition(outputLineIndex + 1, 0);
	}

	public getViewLineContent(model: ISimpleModel, modelLineNumber: number, outputLineIndex: number): string {
		if (!this._isVisible) {
			throw new Error('Not supported');
		}
		let startOffset = this.getInputStartOffsetOfOutputLineIndex(outputLineIndex);
		let endOffset = this.getInputEndOffsetOfOutputLineIndex(model, modelLineNumber, outputLineIndex);
		let r = model.getValueInRange({
			startLineNumber: modelLineNumber,
			startColumn: startOffset + 1,
			endLineNumber: modelLineNumber,
			endColumn: endOffset + 1
		});

		if (outputLineIndex > 0) {
			r = this.wrappedIndent + r;
		}

		return r;
	}

	public getViewLineMinColumn(model: ITextModel, modelLineNumber: number, outputLineIndex: number): number {
		if (!this._isVisible) {
			throw new Error('Not supported');
		}
		if (outputLineIndex > 0) {
			return this.wrappedIndentLength + 1;
		}
		return 1;
	}

	public getViewLineMaxColumn(model: ISimpleModel, modelLineNumber: number, outputLineIndex: number): number {
		if (!this._isVisible) {
			throw new Error('Not supported');
		}
		return this.getViewLineContent(model, modelLineNumber, outputLineIndex).length + 1;
	}

	public getViewLineData(model: ISimpleModel, modelLineNumber: number, outputLineIndex: number): ViewLineData {
		if (!this._isVisible) {
			throw new Error('Not supported');
		}

		let startOffset = this.getInputStartOffsetOfOutputLineIndex(outputLineIndex);
		let endOffset = this.getInputEndOffsetOfOutputLineIndex(model, modelLineNumber, outputLineIndex);

		let lineContent = model.getValueInRange({
			startLineNumber: modelLineNumber,
			startColumn: startOffset + 1,
			endLineNumber: modelLineNumber,
			endColumn: endOffset + 1
		});

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

	public getViewLinesData(model: ITextModel, modelLineNumber: number, fromOuputLineIndex: number, toOutputLineIndex: number, globalStartIndex: number, needed: boolean[], result: ViewLineData[]): void {
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

	public getViewLineNumberOfModelPosition(deltaLineNumber: number, inputColumn: number): number {
		if (!this._isVisible) {
			throw new Error('Not supported');
		}
		const r = this.positionMapper.getOutputPositionOfInputOffset(inputColumn - 1);
		return (deltaLineNumber + r.outputLineIndex);
	}
}

function createSplitLine(linePositionMapperFactory: ILineMapperFactory, text: string, tabSize: number, wrappingColumn: number, columnsForFullWidthChar: number, wrappingIndent: WrappingIndent, isVisible: boolean): ISplitLine {
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

export class IdentityCoordinatesConverter implements ICoordinatesConverter {

	private readonly _lines: IdentityLinesCollection;

	constructor(lines: IdentityLinesCollection) {
		this._lines = lines;
	}

	private _validPosition(pos: Position): Position {
		return this._lines.model.validatePosition(pos);
	}

	private _validRange(range: Range): Range {
		return this._lines.model.validateRange(range);
	}

	// View -> Model conversion and related methods

	public convertViewPositionToModelPosition(viewPosition: Position): Position {
		return this._validPosition(viewPosition);
	}

	public convertViewRangeToModelRange(viewRange: Range): Range {
		return this._validRange(viewRange);
	}

	public validateViewPosition(viewPosition: Position, expectedModelPosition: Position): Position {
		return this._validPosition(expectedModelPosition);
	}

	public validateViewRange(viewRange: Range, expectedModelRange: Range): Range {
		return this._validRange(expectedModelRange);
	}

	// Model -> View conversion and related methods

	public convertModelPositionToViewPosition(modelPosition: Position): Position {
		return this._validPosition(modelPosition);
	}

	public convertModelRangeToViewRange(modelRange: Range): Range {
		return this._validRange(modelRange);
	}

	public modelPositionIsVisible(modelPosition: Position): boolean {
		const lineCount = this._lines.model.getLineCount();
		if (modelPosition.lineNumber < 1 || modelPosition.lineNumber > lineCount) {
			// invalid arguments
			return false;
		}
		return true;
	}

}

export class IdentityLinesCollection implements IViewModelLinesCollection {

	public readonly model: ITextModel;

	constructor(model: ITextModel) {
		this.model = model;
	}

	public dispose(): void {
	}

	public createCoordinatesConverter(): ICoordinatesConverter {
		return new IdentityCoordinatesConverter(this);
	}

	public getHiddenAreas(): Range[] {
		return [];
	}

	public setHiddenAreas(_ranges: Range[]): boolean {
		return false;
	}

	public setTabSize(newTabSize: number): boolean {
		return false;
	}

	public setWrappingSettings(wrappingIndent: WrappingIndent, wrappingColumn: number, columnsForFullWidthChar: number): boolean {
		return false;
	}

	public onModelFlushed(): void {
	}

	public onModelLinesDeleted(versionId: number, fromLineNumber: number, toLineNumber: number): viewEvents.ViewLinesDeletedEvent {
		return new viewEvents.ViewLinesDeletedEvent(fromLineNumber, toLineNumber);
	}

	public onModelLinesInserted(versionId: number, fromLineNumber: number, toLineNumber: number, text: string[]): viewEvents.ViewLinesInsertedEvent {
		return new viewEvents.ViewLinesInsertedEvent(fromLineNumber, toLineNumber);
	}

	public onModelLineChanged(versionId: number, lineNumber: number, newText: string): [boolean, viewEvents.ViewLinesChangedEvent, viewEvents.ViewLinesInsertedEvent, viewEvents.ViewLinesDeletedEvent] {
		return [false, new viewEvents.ViewLinesChangedEvent(lineNumber, lineNumber), null, null];
	}

	public acceptVersionId(versionId: number): void {
	}

	public getViewLineCount(): number {
		return this.model.getLineCount();
	}

	public warmUpLookupCache(viewStartLineNumber: number, viewEndLineNumber: number): void {
	}

	public getViewLinesIndentGuides(viewStartLineNumber: number, viewEndLineNumber: number): number[] {
		const viewLineCount = viewEndLineNumber - viewStartLineNumber + 1;
		let result = new Array<number>(viewLineCount);
		for (let i = 0; i < viewLineCount; i++) {
			result[i] = 0;
		}
		return result;
	}

	public getViewLineContent(viewLineNumber: number): string {
		return this.model.getLineContent(viewLineNumber);
	}

	public getViewLineMinColumn(viewLineNumber: number): number {
		return this.model.getLineMinColumn(viewLineNumber);
	}

	public getViewLineMaxColumn(viewLineNumber: number): number {
		return this.model.getLineMaxColumn(viewLineNumber);
	}

	public getViewLineData(viewLineNumber: number): ViewLineData {
		let lineTokens = this.model.getLineTokens(viewLineNumber);
		let lineContent = lineTokens.getLineContent();
		return new ViewLineData(
			lineContent,
			1,
			lineContent.length + 1,
			lineTokens.inflate()
		);
	}

	public getViewLinesData(viewStartLineNumber: number, viewEndLineNumber: number, needed: boolean[]): ViewLineData[] {
		const lineCount = this.model.getLineCount();
		viewStartLineNumber = Math.min(Math.max(1, viewStartLineNumber), lineCount);
		viewEndLineNumber = Math.min(Math.max(1, viewEndLineNumber), lineCount);

		let result: ViewLineData[] = [];
		for (let lineNumber = viewStartLineNumber; lineNumber <= viewEndLineNumber; lineNumber++) {
			let idx = lineNumber - viewStartLineNumber;
			if (!needed[idx]) {
				result[idx] = null;
			}
			result[idx] = this.getViewLineData(lineNumber);
		}

		return result;
	}

	public getAllOverviewRulerDecorations(ownerId: number, filterOutValidation: boolean, theme: ITheme): IOverviewRulerDecorations {
		const decorations = this.model.getOverviewRulerDecorations(ownerId, filterOutValidation);
		const result = new OverviewRulerDecorations();
		for (let i = 0, len = decorations.length; i < len; i++) {
			const decoration = decorations[i];
			const opts = <ModelDecorationOverviewRulerOptions>decoration.options.overviewRuler;
			const lane = opts.position;
			if (lane === 0) {
				continue;
			}
			const color = resolveColor(opts, theme);
			const viewStartLineNumber = decoration.range.startLineNumber;
			const viewEndLineNumber = decoration.range.endLineNumber;

			result.accept(color, viewStartLineNumber, viewEndLineNumber, lane);
		}
		return result.result;
	}

	public getDecorationsInRange(range: Range, ownerId: number, filterOutValidation: boolean): IModelDecoration[] {
		return this.model.getDecorationsInRange(range, ownerId, filterOutValidation);
	}
}

class OverviewRulerDecorations {

	readonly result: IOverviewRulerDecorations = Object.create(null);

	constructor() {
	}

	public accept(color: string, startLineNumber: number, endLineNumber: number, lane: number): void {
		let prev = this.result[color];

		if (prev) {
			const prevLane = prev[prev.length - 3];
			const prevEndLineNumber = prev[prev.length - 1];
			if (prevLane === lane && prevEndLineNumber + 1 >= startLineNumber) {
				// merge into prev
				if (endLineNumber > prevEndLineNumber) {
					prev[prev.length - 1] = endLineNumber;
				}
				return;
			}

			// push
			prev.push(lane, startLineNumber, endLineNumber);
		} else {
			this.result[color] = [lane, startLineNumber, endLineNumber];
		}
	}
}


function resolveColor(opts: ModelDecorationOverviewRulerOptions, theme: ITheme): string {
	if (!opts._resolvedColor) {
		const themeType = theme.type;
		const color = (themeType === 'dark' ? opts.darkColor : themeType === 'light' ? opts.color : opts.hcColor);
		opts._resolvedColor = resolveRulerColor(color, theme);
	}
	return opts._resolvedColor;
}

function resolveRulerColor(color: string | ThemeColor, theme: ITheme): string {
	if (typeof color === 'string') {
		return color;
	}
	let c = color ? theme.getColor(color.id) : null;
	if (!c) {
		c = Color.transparent;
	}
	return c.toString();
}
