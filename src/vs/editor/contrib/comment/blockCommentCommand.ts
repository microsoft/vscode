/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { ICommentsConfiguration, LanguageConfigurationRegistry } from 'vs/editor/common/modes/languageConfigurationRegistry';
import { CharCode } from 'vs/base/common/charCode';
import { ITextModel, IIdentifiedSingleEditOperation } from 'vs/editor/common/model';

export class BlockCommentCommand implements editorCommon.ICommand {

	private _selection: Selection;
	private _usedEndToken: string;

	constructor(selection: Selection) {
		this._selection = selection;
		this._usedEndToken = null;
	}

	public static _haystackHasNeedleAtOffset(haystack: string, needle: string, offset: number): boolean {
		if (offset < 0) {
			return false;
		}
		const needleLength = needle.length;
		const haystackLength = haystack.length;
		if (offset + needleLength > haystackLength) {
			return false;
		}

		for (let i = 0; i < needleLength; i++) {
			const codeA = haystack.charCodeAt(offset + i);
			const codeB = needle.charCodeAt(i);

			if (codeA === codeB) {
				continue;
			}
			if (codeA >= CharCode.A && codeA <= CharCode.Z && codeA + 32 === codeB) {
				// codeA is upper-case variant of codeB
				continue;
			}
			if (codeB >= CharCode.A && codeB <= CharCode.Z && codeB + 32 === codeA) {
				// codeB is upper-case variant of codeA
				continue;
			}

			return false;
		}
		return true;
	}

	private _createOperationsForBlockComment(selection: Range, config: ICommentsConfiguration, model: ITextModel, builder: editorCommon.IEditOperationBuilder): void {
		const startLineNumber = selection.startLineNumber;
		const startColumn = selection.startColumn;
		const endLineNumber = selection.endLineNumber;
		const endColumn = selection.endColumn;

		const startLineText = model.getLineContent(startLineNumber);
		const endLineText = model.getLineContent(endLineNumber);

		let startToken = config.blockCommentStartToken;
		let endToken = config.blockCommentEndToken;

		let startTokenIndex = startLineText.lastIndexOf(startToken, startColumn - 1 + startToken.length);
		let endTokenIndex = endLineText.indexOf(endToken, endColumn - 1 - endToken.length);

		if (startTokenIndex !== -1 && endTokenIndex !== -1) {

			if (startLineNumber === endLineNumber) {
				const lineBetweenTokens = startLineText.substring(startTokenIndex + startToken.length, endTokenIndex);

				if (lineBetweenTokens.indexOf(endToken) >= 0) {
					// force to add a block comment
					startTokenIndex = -1;
					endTokenIndex = -1;
				}
			} else {
				const startLineAfterStartToken = startLineText.substring(startTokenIndex + startToken.length);
				const endLineBeforeEndToken = endLineText.substring(0, endTokenIndex);

				if (startLineAfterStartToken.indexOf(endToken) >= 0 || endLineBeforeEndToken.indexOf(endToken) >= 0) {
					// force to add a block comment
					startTokenIndex = -1;
					endTokenIndex = -1;
				}
			}
		}

		let ops: IIdentifiedSingleEditOperation[];

		if (startTokenIndex !== -1 && endTokenIndex !== -1) {
			// Consider spaces as part of the comment tokens
			if (startTokenIndex + startToken.length < startLineText.length) {
				if (startLineText.charCodeAt(startTokenIndex + startToken.length) === CharCode.Space) {
					// Pretend the start token contains a trailing space
					startToken = startToken + ' ';
				}
			}

			if (endTokenIndex > 0) {
				if (endLineText.charCodeAt(endTokenIndex - 1) === CharCode.Space) {
					// Pretend the end token contains a leading space
					endToken = ' ' + endToken;
					endTokenIndex -= 1;
				}
			}
			ops = BlockCommentCommand._createRemoveBlockCommentOperations(
				new Range(startLineNumber, startTokenIndex + startToken.length + 1, endLineNumber, endTokenIndex + 1), startToken, endToken
			);
		} else {
			ops = BlockCommentCommand._createAddBlockCommentOperations(selection, startToken, endToken);
			this._usedEndToken = ops.length === 1 ? endToken : null;
		}

		for (let i = 0; i < ops.length; i++) {
			builder.addTrackedEditOperation(ops[i].range, ops[i].text);
		}
	}

	public static _createRemoveBlockCommentOperations(r: Range, startToken: string, endToken: string): IIdentifiedSingleEditOperation[] {
		let res: IIdentifiedSingleEditOperation[] = [];

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

	public static _createAddBlockCommentOperations(r: Range, startToken: string, endToken: string): IIdentifiedSingleEditOperation[] {
		let res: IIdentifiedSingleEditOperation[] = [];

		if (!Range.isEmpty(r)) {
			// Insert block comment start
			res.push(EditOperation.insert(new Position(r.startLineNumber, r.startColumn), startToken + ' '));

			// Insert block comment end
			res.push(EditOperation.insert(new Position(r.endLineNumber, r.endColumn), ' ' + endToken));
		} else {
			// Insert both continuously
			res.push(EditOperation.replace(new Range(
				r.startLineNumber, r.startColumn,
				r.endLineNumber, r.endColumn
			), startToken + '  ' + endToken));
		}

		return res;
	}

	public getEditOperations(model: ITextModel, builder: editorCommon.IEditOperationBuilder): void {
		const startLineNumber = this._selection.startLineNumber;
		const startColumn = this._selection.startColumn;

		model.tokenizeIfCheap(startLineNumber);
		const languageId = model.getLanguageIdAtPosition(startLineNumber, startColumn);
		const config = LanguageConfigurationRegistry.getComments(languageId);
		if (!config || !config.blockCommentStartToken || !config.blockCommentEndToken) {
			// Mode does not support block comments
			return;
		}

		this._createOperationsForBlockComment(
			this._selection, config, model, builder
		);
	}

	public computeCursorState(model: ITextModel, helper: editorCommon.ICursorStateComputerData): Selection {
		const inverseEditOperations = helper.getInverseEditOperations();
		if (inverseEditOperations.length === 2) {
			const startTokenEditOperation = inverseEditOperations[0];
			const endTokenEditOperation = inverseEditOperations[1];

			return new Selection(
				startTokenEditOperation.range.endLineNumber,
				startTokenEditOperation.range.endColumn,
				endTokenEditOperation.range.startLineNumber,
				endTokenEditOperation.range.startColumn
			);
		} else {
			const srcRange = inverseEditOperations[0].range;
			const deltaColumn = this._usedEndToken ? -this._usedEndToken.length - 1 : 0; // minus 1 space before endToken
			return new Selection(
				srcRange.endLineNumber,
				srcRange.endColumn + deltaColumn,
				srcRange.endLineNumber,
				srcRange.endColumn + deltaColumn
			);
		}
	}
}
