/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {Position} from 'vs/editor/common/core/position';
import {Range} from 'vs/editor/common/core/range';
import {EditStack} from 'vs/editor/common/model/editStack';
import {IChangedMarkers, ITextWithMarkers, ModelLine, ILineEdit, ILineMarker} from 'vs/editor/common/model/modelLine';
import {TextModelWithDecorations, DeferredEventsBuilder} from 'vs/editor/common/model/textModelWithDecorations';
import {IMode} from 'vs/editor/common/modes';
import EditorCommon = require('vs/editor/common/editorCommon');
import Errors = require('vs/base/common/errors');

export interface IDeltaSingleEditOperation {
	original: IValidatedEditOperation;
	isNoOp: boolean;
	deltaStartLineNumber: number;
	deltaStartColumn: number;
	deltaEndLineNumber: number;
	deltaEndColumn: number;
}

export interface IValidatedEditOperation {
	identifier: EditorCommon.ISingleEditOperationIdentifier;
	range: EditorCommon.IEditorRange;
	lines: string[];
	forceMoveMarkers: boolean;
}

interface ISequentialEdit {
	range: EditorCommon.IEditorRange;
	rangeLength: number;
	text: string;
}

export class EditableTextModel extends TextModelWithDecorations implements EditorCommon.IEditableTextModel {

	private _commandManager:EditStack;

	// for extra details about change events:
	private _isUndoing:boolean;
	private _isRedoing:boolean;

	// editable range
	private _hasEditableRange:boolean;
	private _editableRangeId:string;

	constructor(allowedEventTypes:string[], rawText:EditorCommon.IRawText, modeOrPromise:IMode|TPromise<IMode>) {
		allowedEventTypes.push(EditorCommon.EventType.ModelContentChanged);
		allowedEventTypes.push(EditorCommon.EventType.ModelContentChanged2);
		super(allowedEventTypes, rawText, modeOrPromise);

		this._commandManager = new EditStack(this);

		this._isUndoing = false;
		this._isRedoing = false;

		this._hasEditableRange = false;
		this._editableRangeId = null;
	}

	public dispose(): void {
		this._commandManager = null;
		super.dispose();
	}

	_resetValue(e:EditorCommon.IModelContentChangedFlushEvent, newValue:string): void {
		super._resetValue(e, newValue);

		// Destroy my edit history and settings
		this._commandManager = new EditStack(this);
		this._hasEditableRange = false;
		this._editableRangeId = null;
	}

	public pushStackElement(): void {
		if (this._isDisposed) {
			throw new Error('EditableTextModel.pushStackElement: Model is disposed');
		}

		this._commandManager.pushStackElement();
	}

	public pushEditOperations(beforeCursorState:EditorCommon.IEditorSelection[], editOperations:EditorCommon.IIdentifiedSingleEditOperation[], cursorStateComputer:EditorCommon.ICursorStateComputer): EditorCommon.IEditorSelection[] {
		if (this._isDisposed) {
			throw new Error('EditableTextModel.pushEditOperations: Model is disposed');
		}

		return this._commandManager.pushEditOperation(beforeCursorState, editOperations, cursorStateComputer);
	}

	/**
	 * Transform operations such that they represent the same logic edit,
	 * but that they also do not cause OOM crashes.
	 */
	private _reduceOperations(operations:IValidatedEditOperation[]): IValidatedEditOperation[] {
		if (operations.length < 1000) {
			// We know from empirical testing that a thousand edits work fine regardless of their shape.
			return operations;
		}

		// At one point, due to how events are emitted and how each operation is handled,
		// some operations can trigger a high ammount of temporary string allocations,
		// that will immediately get edited again.
		// e.g. a formatter inserting ridiculous ammounts of \n on a model with a single line
		// Therefore, the strategy is to collapse all the operations into a huge single edit operation
		return [this._toSingleEditOperation(operations)];
	}

	_toSingleEditOperation(operations:IValidatedEditOperation[]): IValidatedEditOperation {
		let forceMoveMarkers = false,
			firstEditRange = operations[0].range,
			lastEditRange = operations[operations.length-1].range,
			entireEditRange = new Range(firstEditRange.startLineNumber, firstEditRange.startColumn, lastEditRange.endLineNumber, lastEditRange.endColumn),
			lastEndLineNumber = firstEditRange.startLineNumber,
			lastEndColumn = firstEditRange.startColumn,
			result: string[] = [];

		for (let i = 0, len = operations.length; i < len; i++) {
			let operation = operations[i],
				range = operation.range;

			forceMoveMarkers = forceMoveMarkers || operation.forceMoveMarkers;

			// (1) -- Push old text
			for (let lineNumber = lastEndLineNumber; lineNumber < range.startLineNumber; lineNumber++) {
				if (lineNumber === lastEndLineNumber) {
					result.push(this._lines[lineNumber - 1].text.substring(lastEndColumn - 1));
				} else {
					result.push('\n');
					result.push(this._lines[lineNumber - 1].text);
				}
			}

			if (range.startLineNumber === lastEndLineNumber) {
				result.push(this._lines[range.startLineNumber - 1].text.substring(lastEndColumn - 1, range.startColumn - 1));
			} else {
				result.push('\n');
				result.push(this._lines[range.startLineNumber - 1].text.substring(0, range.startColumn - 1));
			}

			// (2) -- Push new text
			if (operation.lines) {
				for (let j = 0, lenJ = operation.lines.length; j < lenJ; j++) {
					if (j !== 0) {
						result.push('\n');
					}
					result.push(operation.lines[j]);
				}
			}

			lastEndLineNumber = operation.range.endLineNumber;
			lastEndColumn = operation.range.endColumn;
		}

		return {
			identifier: operations[0].identifier,
			range: entireEditRange,
			lines: result.join('').split('\n'),
			forceMoveMarkers: forceMoveMarkers
		};
	}

	public applyEdits(rawOperations:EditorCommon.IIdentifiedSingleEditOperation[]): EditorCommon.IIdentifiedSingleEditOperation[] {

		let operations:IValidatedEditOperation[] = [];
		for (let i = 0; i < rawOperations.length; i++) {
			let op = rawOperations[i];
			operations[i] = {
				identifier: op.identifier,
				range: this.validateRange(op.range),
				lines: op.text ? op.text.split(/\r\n|\r|\n/) : null,
				forceMoveMarkers: op.forceMoveMarkers
			};
		}

		// Sort operations
		operations.sort((a, b) => {
			return Range.compareRangesUsingEnds(a.range, b.range);
		});

		// Operations can not overlap!
		for (let i = operations.length - 2; i >= 0; i--) {
			if (operations[i+1].range.getStartPosition().isBeforeOrEqual(operations[i].range.getEndPosition())) {
				throw new Error('Overlapping ranges are not allowed!');
			}
		}

		// console.log(JSON.stringify(operations, null, '\t'));

		operations = this._reduceOperations(operations);

		let editableRange = this.getEditableRange();
		let editableRangeStart = editableRange.getStartPosition();
		let editableRangeEnd = editableRange.getEndPosition();
		for (let i = 0; i < operations.length; i++) {
			let operationRange = operations[i].range;
			if (!editableRangeStart.isBeforeOrEqual(operationRange.getStartPosition()) || !operationRange.getEndPosition().isBeforeOrEqual(editableRangeEnd)) {
				throw new Error('Editing outside of editable range not allowed!');
			}
		}

		// Delta encode operations
		let deltaOperations = EditableTextModel._toDeltaOperations(operations);

		let reverseRanges = EditableTextModel._getInverseEditRanges(deltaOperations);
		let reverseOperations: EditorCommon.IIdentifiedSingleEditOperation[] = [];
		for (let i = 0; i < operations.length; i++) {
			reverseOperations[i] = {
				identifier: operations[i].identifier,
				range: reverseRanges[i],
				text: this.getValueInRange(operations[i].range),
				forceMoveMarkers: operations[i].forceMoveMarkers
			};
		}

		this._applyEdits(deltaOperations);

		return reverseOperations;
	}

	private static _toDeltaOperation(base: IValidatedEditOperation, operation:IValidatedEditOperation): IDeltaSingleEditOperation {
		let deltaStartLineNumber = operation.range.startLineNumber - (base ? base.range.endLineNumber : 0);
		let deltaStartColumn = operation.range.startColumn - (deltaStartLineNumber === 0 ? base.range.endColumn : 0);
		let deltaEndLineNumber = operation.range.endLineNumber - (base ? base.range.endLineNumber : 0);
		let deltaEndColumn = operation.range.endColumn - (deltaEndLineNumber === 0 ? base.range.endColumn : 0);

		return {
			original: operation,
			isNoOp: (
				operation.range.startLineNumber === operation.range.endLineNumber
				&& operation.range.startColumn === operation.range.endColumn
				&& (!operation.lines || operation.lines.length === 0)
			),
			deltaStartLineNumber: deltaStartLineNumber,
			deltaStartColumn: deltaStartColumn,
			deltaEndLineNumber: deltaEndLineNumber,
			deltaEndColumn: deltaEndColumn
		};
	}

	/**
	 * Assumes `operations` are validated and sorted ascending
	 */
	public static _getInverseEditRanges(operations:IDeltaSingleEditOperation[]): EditorCommon.IEditorRange[] {
		let lineNumber = 0,
			column = 0,
			result:EditorCommon.IEditorRange[] = [];

		for (let i = 0, len = operations.length; i < len; i++) {
			let op = operations[i];

			let startLineNumber = op.deltaStartLineNumber + lineNumber;
			let startColumn = op.deltaStartColumn + (op.deltaStartLineNumber === 0 ? column : 0);
			let resultRange: EditorCommon.IEditorRange;

			if (op.original.lines && op.original.lines.length > 0) {
				// There is something to insert
				if (op.original.lines.length === 1) {
					// Single line insert
					resultRange = new Range(startLineNumber, startColumn, startLineNumber, startColumn + op.original.lines[0].length);
				} else {
					// Multi line insert
					resultRange = new Range(startLineNumber, startColumn, startLineNumber + op.original.lines.length - 1, op.original.lines[op.original.lines.length - 1].length + 1);
				}
			} else {
				// There is nothing to insert
				resultRange = new Range(startLineNumber, startColumn, startLineNumber, startColumn);
			}

			lineNumber = resultRange.endLineNumber;
			column = resultRange.endColumn;

			result.push(resultRange);
		}

		return result;
	}

	private _generateSequentialEdits(operations:IDeltaSingleEditOperation[]): ISequentialEdit[] {
		let r:ISequentialEdit[] = [],
			lineNumber = 0,
			column = 0;

		for (let i = 0, len = operations.length; i < len; i++) {
			let op = operations[i];

			let startLineNumber = op.deltaStartLineNumber + lineNumber;
			let startColumn = op.deltaStartColumn + (op.deltaStartLineNumber === 0 ? column : 0);
			let endLineNumber = op.deltaEndLineNumber + lineNumber;
			let endColumn = op.deltaEndColumn + (op.deltaEndLineNumber === 0 ? column : 0);

			let range = new Range(startLineNumber, startColumn, endLineNumber, endColumn);
			let valueInRangeLength = this.getValueLengthInRange(range);

			r.push({
				range: range,
				rangeLength: valueInRangeLength,
				text: op.original.lines ? op.original.lines.join(this.getEOL()) : ''
			});

			if (op.original.lines && op.original.lines.length > 0) {
				// There is something to insert
				if (op.original.lines.length === 1) {
					// Single line insert
					lineNumber = startLineNumber;
					column = startColumn + op.original.lines[0].length;
				} else {
					// Multi line insert
					lineNumber = startLineNumber + op.original.lines.length - 1;
					column = op.original.lines[op.original.lines.length - 1].length + 1;
				}
			} else {
				// There is nothing to insert
				lineNumber = startLineNumber;
				column = startColumn;
			}
		}

		return r;
	}

	private _applyEdits(operations:IDeltaSingleEditOperation[]): void {
		let sequentialEdits = this._generateSequentialEdits(operations);

		// console.log(sequentialEdits);

		this._withDeferredEvents((deferredEventsBuilder:DeferredEventsBuilder) => {
			let baseLineNumber = 0,
				baseColumn = 0,
				deltaLines = 0,
				adjustedLineNumbers = 0,
				currentLineEdits: ILineEdit[] = [],
				currentLineNumber = 0;

			let lastContentChangedVersionId = this.getVersionId();
			let lastContentChanged2VersionId = this.getVersionId();

			let adjustLineNumbers = (toLineNumber:number, delta:number): void => {
				// console.log('adjustLineNumbers: ' + toLineNumber + ' by ' + delta + ', lines.length: ' + this._lines.length);
				if (delta !== 0) {
					for (let lineNumber = adjustedLineNumbers + 1; lineNumber <= toLineNumber; lineNumber++) {
						this._lines[lineNumber - 1].updateLineNumber(deferredEventsBuilder.changedMarkers, lineNumber);
					}
				}
				adjustedLineNumbers = toLineNumber;
			};

			let pushLineEdit = (editLineNumber:number, startColumn:number, endColumn:number, text:string, forceMoveMarkers:boolean) => {
				// console.log('pushLineEdit: ' + editLineNumber + '(' + this._lines[editLineNumber - 1].text + ')' + ': [' + startColumn + ' -> ' + endColumn + ']: <<' + text + '>>');

				// Apply previous edits if they were for a different line
				if (editLineNumber !== currentLineNumber) {
					if (currentLineEdits.length > 0) {
						this._applyLineEdits(deferredEventsBuilder, currentLineNumber, currentLineEdits);
						lastContentChangedVersionId = this.getVersionId();
						currentLineEdits = [];
					}
					currentLineNumber = editLineNumber;
				}

				if (startColumn === endColumn && text.length === 0) {
					// empty edit => ignore it
					return;
				}

				currentLineEdits.push({
					startColumn: startColumn,
					endColumn: endColumn,
					text: text,
					forceMoveMarkers: forceMoveMarkers
				});
			};

			let flushLineEdits = () => {
				// console.log('flushLineEdits');
				let r = 0;
				if (currentLineEdits.length > 0) {
					r = this._applyLineEdits(deferredEventsBuilder, currentLineNumber, currentLineEdits);
					lastContentChangedVersionId = this.getVersionId();
					currentLineEdits = [];
				}
				currentLineNumber = 0;
				return r;
			};

			let lastRealOpIndex = 0;
			for (let i = operations.length - 1; i >= 0; i--) {
				if (!operations[i].isNoOp) {
					lastRealOpIndex = i;
					break;
				}
			}

			for (let i = 0, len = operations.length; i < len; i++) {
				let op = operations[i];

				let startLineNumber = op.deltaStartLineNumber + baseLineNumber;
				let startColumn = op.deltaStartColumn + (op.deltaStartLineNumber === 0 ? baseColumn : 0);
				let endLineNumber = op.deltaEndLineNumber + baseLineNumber;
				let endColumn = op.deltaEndColumn + (op.deltaEndLineNumber === 0 ? baseColumn : 0);

				baseLineNumber = startLineNumber + (op.original.lines ? op.original.lines.length - 1 : 0);
				baseColumn = endColumn;

				if (op.isNoOp) {
					continue;
				}

				// console.log();
				// console.log('-------------------');
				// console.log('OPERATION #' + (i));
				// console.log('<<<\n' + this._lines.map(l => l.text).join('\n') + '\n>>>');
				// if (currentLineEdits.length > 0) {
				// 	console.log('PENDING on line ' + currentLineNumber + ': ' + currentLineEdits.map(e => '[' + e.startColumn + ', ' + e.endColumn + ']: <<' + e.text + '>>'));
				// }
				// console.log('baseLineNumber: ' + baseLineNumber + ', baseColumn: ' + baseColumn);
				// console.log('deltaOp: [' + op.deltaStartLineNumber + ',' + op.deltaStartColumn + '] -> [' + op.deltaEndLineNumber + ',' + op.deltaEndColumn + '] : <<' + op.original.lines + '>>');
				// console.log('op: [' + startLineNumber + ',' + startColumn + '] -> [' + endLineNumber + ',' + endColumn + '] : <<' + op.original.lines + '>>');

				let deletingLinesCnt = endLineNumber - startLineNumber;
				let insertingLinesCnt = (op.original.lines ? op.original.lines.length - 1 : 0);
				let editingLinesCnt = Math.min(deletingLinesCnt, insertingLinesCnt);

				let lastLineEndColumn = 0,
					lastLineDeltaColumn = 0;

				for (let j = 0; j <= editingLinesCnt; j++) {
					let editLineNumber = startLineNumber + j;
					let editLineStartColumn = (editLineNumber === startLineNumber ? startColumn : 1);
					let editLineEndColumn = (editLineNumber === endLineNumber ? endColumn : this.getLineMaxColumn(editLineNumber));
					let editLineText = (op.original.lines ? op.original.lines[j] : '');

					pushLineEdit(
						editLineNumber,
						editLineStartColumn,
						editLineEndColumn,
						editLineText,
						op.original.forceMoveMarkers
					);

					if (j === editingLinesCnt) {
						lastLineEndColumn = editLineEndColumn;
					}
				}


				// console.log('baseColumn = endColumn: ' + endColumn);

				if (editingLinesCnt < deletingLinesCnt) {
					// Must delete some lines

					// Flush pending edits on last edited line
					lastLineDeltaColumn = flushLineEdits();
					let splitColumn = lastLineEndColumn + lastLineDeltaColumn;

					// Must delete lines
					baseColumn = splitColumn;
					// console.log('splitColumn would be: ' + splitColumn);
					// console.log('baseColumn = startColumn: ' + startColumn);

					// Split last line and collect remaining
					let endLineRemains = this._lines[endLineNumber - 1].split(deferredEventsBuilder.changedMarkers, endColumn, false);
					// this.emitModelContentChangedLineChangedEvent(endLineNumber - 1);

					this._invalidateLine(startLineNumber + editingLinesCnt - 1);

					let spliceStart = startLineNumber + editingLinesCnt;
					let spliceCnt = deletingLinesCnt - editingLinesCnt;
					adjustLineNumbers(startLineNumber + editingLinesCnt, deltaLines);
					deltaLines -= spliceCnt;

					let markersOnDeletedLines: ILineMarker[] = [];
					for (let j = 0; j < spliceCnt; j++) {
						let deleteLineIndex = spliceStart + j;
						// Collect all these markers
						markersOnDeletedLines = markersOnDeletedLines.concat(this._lines[deleteLineIndex].deleteLine(deferredEventsBuilder.changedMarkers, splitColumn, deleteLineIndex + 1));
					}

					this._lines.splice(spliceStart, spliceCnt);

					// Reconstruct first line
					this._lines[spliceStart - 1].append(deferredEventsBuilder.changedMarkers, endLineRemains);
					this._lines[spliceStart - 1].addMarkers(markersOnDeletedLines);
					this.emitModelContentChangedLineChangedEvent(spliceStart);

					this.emitModelContentChangedLinesDeletedEvent(spliceStart + 1, spliceStart + spliceCnt);
					lastContentChangedVersionId = this.getVersionId();
					// this.emitModelContentChangedLinesInsertedEvent(startLineNumber + editingLinesCnt + 1, startLineNumber + insertingLinesCnt, newLinesContent.join('\n'));
				}

				if (editingLinesCnt < insertingLinesCnt) {
					// Must insert some lines

					// Flush pending edits on last edited line
					lastLineDeltaColumn = flushLineEdits();

					// Split last line
					let splitColumn = lastLineEndColumn + lastLineDeltaColumn;
					let leftoverLine = this._lines[startLineNumber + editingLinesCnt - 1].split(deferredEventsBuilder.changedMarkers, splitColumn, op.original.forceMoveMarkers);
					this.emitModelContentChangedLineChangedEvent(startLineNumber + editingLinesCnt);

					this._invalidateLine(startLineNumber + editingLinesCnt - 1);

					// Must insert some lines
					baseColumn = op.original.lines[op.original.lines.length - 1].length + 1;
					// console.log('baseColumn = op.original.lines[op.original.lines.length - 1].length + 1: ' + (op.original.lines[op.original.lines.length - 1].length + 1));

					adjustLineNumbers(startLineNumber + editingLinesCnt, deltaLines);
					deltaLines += insertingLinesCnt - editingLinesCnt;

					let newLinesContent:string[] = [];
					// Lines in the middle
					for (let j = editingLinesCnt + 1; j <= insertingLinesCnt; j++) {
						let editLineNumber = startLineNumber + j;
						// console.log('line in the middle: ' + editLineNumber);
						this._lines.splice(editLineNumber - 1, 0, new ModelLine(editLineNumber, op.original.lines[j]));
						newLinesContent.push(op.original.lines[j]);
					}

					newLinesContent[newLinesContent.length - 1] += leftoverLine.text;

					// Last line
					this._lines[startLineNumber + insertingLinesCnt - 1].append(deferredEventsBuilder.changedMarkers, leftoverLine);

					this.emitModelContentChangedLinesInsertedEvent(startLineNumber + editingLinesCnt + 1, startLineNumber + insertingLinesCnt, newLinesContent.join('\n'));
					lastContentChangedVersionId = this.getVersionId();
				}

				// console.log('~~~');
				// console.log('RESULT: ');
				// console.log('baseLineNumber: ' + baseLineNumber + ', baseColumn: ' + baseColumn);
				// console.log('<<<\n' + this._lines.map(l => l.text).join('\n') + '\n>>>');
				// if (currentLineEdits.length > 0) {
				// 	console.log('PENDING on line ' + currentLineNumber + ': ' + currentLineEdits.map(e => '[' + e.startColumn + ', ' + e.endColumn + ']: <<' + e.text + '>>'));
				// }
				// console.log('op: [' + startLineNumber + ',' + startColumn + '] -> [' + endLineNumber + ',' + endColumn + '] : <<' + op.original.lines + '>>');

				if (i === lastRealOpIndex) {
					flushLineEdits();
				}

				let seqEdit = sequentialEdits[i];

				if (this.getVersionId() === lastContentChanged2VersionId) {
					this._increaseVersionId();
				}
				lastContentChanged2VersionId = this.getVersionId();

				// let lastContentChanged2VersionId = this.getVersionId();
				// this._increaseVersionId();
				this._emitContentChanged2(seqEdit.range.startLineNumber, seqEdit.range.startColumn, seqEdit.range.endLineNumber, seqEdit.range.endColumn, seqEdit.rangeLength, seqEdit.text, this._isUndoing, this._isRedoing);
			}

			if (this.getVersionId() > lastContentChangedVersionId) {
				// TODO@Alex: need to rewrite the eventing logic
				this.emitModelContentChangedLineChangedEventNoVersionBump(baseLineNumber);
			}

			adjustLineNumbers(this._lines.length, deltaLines);
		});
	}

	public _assertLineNumbersOK(): void {
		let foundMarkersCnt = 0;
		for (let i = 0, len = this._lines.length; i < len; i++) {
			let line = this._lines[i];
			let lineNumber = i + 1;

			if (line.lineNumber !== lineNumber) {
				throw new Error('Invalid lineNumber at line: ' + lineNumber + '; text is: ' + this.getValue());
			}

			let markers = line.getMarkers();
			for (let j = 0, lenJ = markers.length; j < lenJ; j++) {
				foundMarkersCnt++;
				let markerId = markers[j].id;
				let marker = this._markerIdToMarker[markerId];
				if (marker.line !== line) {
					throw new Error('Misplaced marker with id ' + markerId);
				}
			}
		}

		let totalMarkersCnt = Object.keys(this._markerIdToMarker).length;
		if (totalMarkersCnt !== foundMarkersCnt) {
			throw new Error('There are misplaced markers!');
		}
	}

	private _applyLineEdits(deferredEventsBuilder:DeferredEventsBuilder, lineNumber:number, edits:ILineEdit[]): number {
		this._invalidateLine(lineNumber - 1);
		let result = this._lines[lineNumber - 1].applyEdits(deferredEventsBuilder.changedMarkers, edits);
		this.emitModelContentChangedLineChangedEvent(lineNumber);
		return result;
	}

	public static _toDeltaOperations(operations:IValidatedEditOperation[]): IDeltaSingleEditOperation[] {
		let result: IDeltaSingleEditOperation[] = [];
		for (let i = 0; i < operations.length; i++) {
			result[i] = EditableTextModel._toDeltaOperation(i > 0 ? operations[i-1] : null, operations[i]);
		}
		return result;
	}

	public undo(): EditorCommon.IEditorSelection[] {
		if (this._isDisposed) {
			throw new Error('EditableTextModel.undo: Model is disposed');
		}

		return this._withDeferredEvents(() => {
			this._isUndoing = true;
			let r = this._commandManager.undo();
			this._isUndoing = false;

			if (!r) {
				return null;
			}

			this._overwriteAlternativeVersionId(r.recordedVersionId);

			return r.selections;
		});
	}

	public redo(): EditorCommon.IEditorSelection[] {
		if (this._isDisposed) {
			throw new Error('EditableTextModel.redo: Model is disposed');
		}

		return this._withDeferredEvents(() => {
			this._isRedoing = true;
			let r = this._commandManager.redo();
			this._isRedoing = false;

			if (!r) {
				return null;
			}

			this._overwriteAlternativeVersionId(r.recordedVersionId);

			return r.selections;
		});
	}

	public setEditableRange(range:EditorCommon.IRange): void {
		if (this._isDisposed) {
			throw new Error('EditableTextModel.setEditableRange: Model is disposed');
		}

		this._commandManager.clear();
		if (this._hasEditableRange) {
			this.removeTrackedRange(this._editableRangeId);
			this._editableRangeId = null;
			this._hasEditableRange = false;
		}

		if (range) {
			this._hasEditableRange = true;
			this._editableRangeId = this.addTrackedRange(range, EditorCommon.TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges);
		}
	}

	public hasEditableRange(): boolean {
		if (this._isDisposed) {
			throw new Error('EditableTextModel.hasEditableRange: Model is disposed');
		}

		return this._hasEditableRange;
	}

	public getEditableRange(): EditorCommon.IEditorRange {
		if (this._isDisposed) {
			throw new Error('EditableTextModel.getEditableRange: Model is disposed');
		}

		if (this._hasEditableRange) {
			return this.getTrackedRange(this._editableRangeId);
		} else {
			return this.getFullModelRange();
		}
	}

	private _updateLineNumbers(changedMarkers:IChangedMarkers, startLineNumber:number): void {
		let lines = this._lines,
			i:number,
			len:number,
			j:number,
			lenJ:number,
			markers:ILineMarker[],
			marker:ILineMarker;

		for (i = startLineNumber - 1, len = lines.length; i < len; i++) {
			lines[i].updateLineNumber(changedMarkers, i + 1);
		}
	}

	private emitModelContentChangedLineChangedEventNoVersionBump(lineNumber: number): void {
		let e:EditorCommon.IModelContentChangedLineChangedEvent = {
			changeType: EditorCommon.EventType.ModelContentChangedLineChanged,
			lineNumber: lineNumber,
			detail: this._lines[lineNumber - 1].text,
			versionId: this.getVersionId(),
			isUndoing: this._isUndoing,
			isRedoing: this._isRedoing
		};
		if (!this._isDisposing) {
			this.emit(EditorCommon.EventType.ModelContentChanged, e);
		}
	}

	private emitModelContentChangedLineChangedEvent(lineNumber: number): void {
		this._increaseVersionId();
		this.emitModelContentChangedLineChangedEventNoVersionBump(lineNumber);
	}

	private emitModelContentChangedLinesDeletedEvent(fromLineNumber: number, toLineNumber: number): void {
		this._increaseVersionId();
		let e:EditorCommon.IModelContentChangedLinesDeletedEvent = {
			changeType: EditorCommon.EventType.ModelContentChangedLinesDeleted,
			fromLineNumber: fromLineNumber,
			toLineNumber: toLineNumber,
			versionId: this.getVersionId(),
			isUndoing: this._isUndoing,
			isRedoing: this._isRedoing
		};
		if (!this._isDisposing) {
			this.emit(EditorCommon.EventType.ModelContentChanged, e);
		}
	}

	private emitModelContentChangedLinesInsertedEvent(fromLineNumber: number, toLineNumber: number, newLinesContent: string): void {
		this._increaseVersionId();
		let e:EditorCommon.IModelContentChangedLinesInsertedEvent = {
			changeType: EditorCommon.EventType.ModelContentChangedLinesInserted,
			fromLineNumber: fromLineNumber,
			toLineNumber: toLineNumber,
			detail: newLinesContent,
			versionId: this.getVersionId(),
			isUndoing: this._isUndoing,
			isRedoing: this._isRedoing
		};
		if (!this._isDisposing) {
			this.emit(EditorCommon.EventType.ModelContentChanged, e);
		}
	}
}