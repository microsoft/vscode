/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import {Range} from 'vs/editor/common/core/range';
import {Position} from 'vs/editor/common/core/position';
import {Selection} from 'vs/editor/common/core/selection';
import {EditOperation} from 'vs/editor/common/core/editOperation';

export class BlockCommentCommand implements EditorCommon.ICommand {

	private _selection: EditorCommon.IEditorSelection;
	private _usedEndToken: string;

	constructor(selection:EditorCommon.IEditorSelection) {
		this._selection = selection;
		this._usedEndToken = null;
	}

	public static _haystackHasNeedleAtOffset(haystack: string, needle: string, offset: number): boolean {
		if (offset < 0) {
			return false;
		}
		var needleLength = needle.length;
		var haystackLength = haystack.length;
		if (offset + needleLength > haystackLength) {
			return false;
		}
		for (var i = 0; i < needleLength; i++) {
			if (haystack.charCodeAt(offset + i) !== needle.charCodeAt(i)) {
				return false;
			}
		}
		return true;
	}

	private _createOperationsForBlockComment(selection:EditorCommon.IRange, config:Modes.ICommentsConfiguration, model:EditorCommon.ITokenizedModel, builder:EditorCommon.IEditOperationBuilder): void {
		var startLineNumber = selection.startLineNumber;
		var startColumn = selection.startColumn;
		var endLineNumber = selection.endLineNumber;
		var endColumn = selection.endColumn;

		var startToken = config.blockCommentStartToken;
		var endToken = config.blockCommentEndToken;

		var startTokenIndex = model.getLineContent(startLineNumber).lastIndexOf(startToken, startColumn - 1 + startToken.length);
		var endTokenIndex = model.getLineContent(endLineNumber).indexOf(endToken, endColumn - 1 - endToken.length);

		var ops: EditorCommon.IIdentifiedSingleEditOperation[];

		if (startTokenIndex !== -1 && endTokenIndex !== -1) {
			ops = BlockCommentCommand._createRemoveBlockCommentOperations({
				startLineNumber: startLineNumber,
				startColumn: startTokenIndex + 1 + startToken.length,
				endLineNumber: endLineNumber,
				endColumn: endTokenIndex + 1
			}, startToken, endToken);
		} else {
			ops = BlockCommentCommand._createAddBlockCommentOperations(selection, startToken, endToken);
			this._usedEndToken = ops.length === 1 ? endToken : null;
		}

		for (var i = 0; i < ops.length; i++) {
			builder.addEditOperation(ops[i].range, ops[i].text);
		}
	}

	public static _createRemoveBlockCommentOperations(r:EditorCommon.IRange, startToken:string, endToken:string): EditorCommon.IIdentifiedSingleEditOperation[] {
		var res: EditorCommon.IIdentifiedSingleEditOperation[] = [];

		if (!Range.isEmpty(r)) {
			// Remove block comment start
			res.push(EditOperation.delete(new Range(
				r.startLineNumber, r.startColumn - startToken.length,
				r.startLineNumber, r.startColumn
			)));

			// Remove block comment end
			res.push(EditOperation.delete(new Range(
				r.endLineNumber, r.endColumn,
				r.endLineNumber, r.endColumn + endToken.length
			)));
		} else {
			// Remove both continuously
			res.push(EditOperation.delete(new Range(
				r.startLineNumber, r.startColumn - startToken.length,
				r.endLineNumber, r.endColumn + endToken.length
			)));
		}

		return res;
	}

	public static _createAddBlockCommentOperations(r:EditorCommon.IRange, startToken:string, endToken:string): EditorCommon.IIdentifiedSingleEditOperation[] {
		var res: EditorCommon.IIdentifiedSingleEditOperation[] = [];

		if (!Range.isEmpty(r)) {
			// Insert block comment start
			res.push(EditOperation.insert(new Position(r.startLineNumber, r.startColumn), startToken));

			// Insert block comment end
			res.push(EditOperation.insert(new Position(r.endLineNumber, r.endColumn), endToken));
		} else {
			// Insert both continuously
			res.push(EditOperation.replace(new Range(
				r.startLineNumber, r.startColumn,
				r.endLineNumber, r.endColumn
			), startToken + endToken));
		}

		return res;
	}

	public getEditOperations(model:EditorCommon.ITokenizedModel, builder:EditorCommon.IEditOperationBuilder): void {
		var startLineNumber = this._selection.startLineNumber;
		var startColumn = this._selection.startColumn;
		var endLineNumber = this._selection.endLineNumber;
		var endColumn = this._selection.endColumn;

		let richEditSupport = model.getModeAtPosition(startLineNumber, startColumn).richEditSupport;
		let config = richEditSupport ? richEditSupport.comments : null;
		if (!config || !config.blockCommentStartToken || !config.blockCommentEndToken) {
			// Mode does not support block comments
			return;
		}

		this._createOperationsForBlockComment({
			startLineNumber: startLineNumber,
			startColumn: startColumn,
			endLineNumber: endLineNumber,
			endColumn: endColumn
		}, config, model, builder);
	}

	public computeCursorState(model:EditorCommon.ITokenizedModel, helper: EditorCommon.ICursorStateComputerData): EditorCommon.IEditorSelection {
		var inverseEditOperations = helper.getInverseEditOperations();
		if (inverseEditOperations.length === 2) {
			var startTokenEditOperation = inverseEditOperations[0];
			var endTokenEditOperation = inverseEditOperations[1];

			return Selection.createSelection(
				startTokenEditOperation.range.endLineNumber,
				startTokenEditOperation.range.endColumn,
				endTokenEditOperation.range.startLineNumber,
				endTokenEditOperation.range.startColumn
			);
		} else {
			var srcRange = inverseEditOperations[0].range;
			var deltaColumn = this._usedEndToken ? -this._usedEndToken.length : 0;
			return Selection.createSelection(
				srcRange.endLineNumber,
				srcRange.endColumn + deltaColumn,
				srcRange.endLineNumber,
				srcRange.endColumn + deltaColumn
			);
		}
	}
}
