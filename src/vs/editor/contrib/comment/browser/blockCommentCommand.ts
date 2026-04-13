/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CharCode } from '../../../../base/common/charCode.js';
import { EditOperation, ISingleEditOperation } from '../../../common/core/editOperation.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { Selection } from '../../../common/core/selection.js';
import { ICommand, ICursorStateComputerData, IEditOperationBuilder } from '../../../common/editorCommon.js';
import { ITextModel } from '../../../common/model.js';
import { ILanguageConfigurationService } from '../../../common/languages/languageConfigurationRegistry.js';

export class BlockCommentCommand implements ICommand {

	private readonly _selection: Selection;
	private readonly _insertSpace: boolean;
	private _usedEndToken: string | null;
	private _isRemove: boolean = false;

	constructor(
		selection: Selection,
		insertSpace: boolean,
		private readonly languageConfigurationService: ILanguageConfigurationService
	) {
		this._selection = selection;
		this._insertSpace = insertSpace;
		this._usedEndToken = null;
	}

	public static findEnclosingBlockCommentRange(model: ITextModel, position: Position, languageConfigurationService: ILanguageConfigurationService): Range | null {
		const lineNumber = position.lineNumber;
		const column = position.column;

		// Get language config
		const languageId = model.getLanguageIdAtPosition(lineNumber, column);
		const config = languageConfigurationService.getLanguageConfiguration(languageId).comments;
		if (!config || !config.blockCommentStartToken || !config.blockCommentEndToken) {
			return null;
		}

		const startToken = config.blockCommentStartToken;
		const endToken = config.blockCommentEndToken;

		// Find the opening token by walking backward
		let startLine = lineNumber;
		let startCol = column;
		let foundStart = false;

		// First, search backward on the current line
		const currentLineContent = model.getLineContent(startLine);
		let idx = Math.min(startCol - 1, currentLineContent.length);
		while (idx >= 0) {
			if (BlockCommentCommand._haystackHasNeedleAtOffset(currentLineContent, startToken, idx)) {
				startCol = idx + 1; // 1-based
				foundStart = true;
				break;
			}
			idx--;
		}

		if (!foundStart) {
			for (let ln = startLine - 1; ln >= 1; ln--) {
				const lineContent = model.getLineContent(ln);
				idx = lineContent.lastIndexOf(startToken);
				if (idx !== -1) {
					startLine = ln;
					startCol = idx + 1; // 1-based
					foundStart = true;
					break;
				}
			}
		}

		if (!foundStart) {
			return null;
		}

		let endLine = startLine;
		let endCol = startCol + startToken.length;
		let foundEnd = false;

		let currentLine = startLine;
		let currentCol = endCol;

		while (currentLine <= model.getLineCount()) {
			const lineContent = model.getLineContent(currentLine);
			if (currentLine === startLine) {
				idx = lineContent.indexOf(endToken, currentCol - 1);
			} else {
				idx = lineContent.indexOf(endToken);
			}
			if (idx !== -1) {
				endLine = currentLine;
				endCol = idx + endToken.length + 1; // 1-based, exclusive end after end token
				foundEnd = true;
				break;
			}
			currentLine++;
			currentCol = 1;
		}

		if (!foundEnd) {
			return null;
		}

		const commentRange = new Range(startLine, startCol, endLine, endCol);
		if (!commentRange.containsPosition(position)) {
			return null;
		}

		// Return both the content range and token positions
		const contentRange = new Range(startLine, startCol + startToken.length, endLine, endCol - endToken.length);
		const startTokenPos = new Position(startLine, startCol);
		const endTokenPos = new Position(endLine, endCol - endToken.length + 1); // Start of end token

		// Return the full range including tokens
		const fullRange = new Range(startLine, startCol, endLine, endCol);
		return fullRange;
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

	private _createOperationsForBlockComment(selection: Range, startToken: string, endToken: string, insertSpace: boolean, model: ITextModel, builder: IEditOperationBuilder): void {
		const startLineNumber = selection.startLineNumber;
		const startColumn = selection.startColumn;
		const endLineNumber = selection.endLineNumber;
		const endColumn = selection.endColumn;

		const startLineText = model.getLineContent(startLineNumber);
		const endLineText = model.getLineContent(endLineNumber);

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

		let ops: ISingleEditOperation[];

		if (startTokenIndex !== -1 && endTokenIndex !== -1) {
			// Consider spaces as part of the comment tokens
			if (insertSpace && startTokenIndex + startToken.length < startLineText.length && startLineText.charCodeAt(startTokenIndex + startToken.length) === CharCode.Space) {
				// Pretend the start token contains a trailing space
				startToken = startToken + ' ';
			}

			if (insertSpace && endTokenIndex > 0 && endLineText.charCodeAt(endTokenIndex - 1) === CharCode.Space) {
				// Pretend the end token contains a leading space
				endToken = ' ' + endToken;
				endTokenIndex -= 1;
			}
			ops = BlockCommentCommand._createRemoveBlockCommentOperations(
				new Range(startLineNumber, startTokenIndex + startToken.length + 1, endLineNumber, endTokenIndex + 1), startToken, endToken
			);
		} else {
			ops = BlockCommentCommand._createAddBlockCommentOperations(selection, startToken, endToken, this._insertSpace);
			this._usedEndToken = ops.length === 1 ? endToken : null;
		}

		for (const op of ops) {
			builder.addTrackedEditOperation(op.range, op.text);
		}
	}

	public static _createRemoveBlockCommentOperations(r: Range, startToken: string, endToken: string): ISingleEditOperation[] {
		const res: ISingleEditOperation[] = [];

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

	public static _createAddBlockCommentOperations(r: Range, startToken: string, endToken: string, insertSpace: boolean): ISingleEditOperation[] {
		const res: ISingleEditOperation[] = [];

		if (!Range.isEmpty(r)) {
			// Insert block comment start
			res.push(EditOperation.insert(new Position(r.startLineNumber, r.startColumn), startToken + (insertSpace ? ' ' : '')));

			// Insert block comment end
			res.push(EditOperation.insert(new Position(r.endLineNumber, r.endColumn), (insertSpace ? ' ' : '') + endToken));
		} else {
			// Insert both continuously
			res.push(EditOperation.replace(new Range(
				r.startLineNumber, r.startColumn,
				r.endLineNumber, r.endColumn
			), startToken + '  ' + endToken));
		}

		return res;
	}

	public getEditOperations(model: ITextModel, builder: IEditOperationBuilder): void {
		const startLineNumber = this._selection.startLineNumber;
		const startColumn = this._selection.startColumn;

		model.tokenization.tokenizeIfCheap(startLineNumber);
		const languageId = model.getLanguageIdAtPosition(startLineNumber, startColumn);
		const config = this.languageConfigurationService.getLanguageConfiguration(languageId).comments;
		if (!config || !config.blockCommentStartToken || !config.blockCommentEndToken) {
			// Mode does not support block comments
			return;
		}

		if (this._selection.isEmpty()) {
			const result = BlockCommentCommand.findEnclosingBlockCommentRange(model, this._selection.getPosition(), this.languageConfigurationService);
			if (result) {
				// Remove start token
				const startTokenRange = new Range(result.startLineNumber, result.startColumn, result.startLineNumber, result.startColumn + 2);
				builder.addTrackedEditOperation(startTokenRange, '');

				// Remove end token
				const endTokenRange = new Range(result.endLineNumber, result.endColumn - 2, result.endLineNumber, result.endColumn);
				builder.addTrackedEditOperation(endTokenRange, '');

				this._isRemove = true;
				return;
			} else {
				alert('No enclosing comment found, proceeding with normal logic');
			}
		}

		this._createOperationsForBlockComment(this._selection, config.blockCommentStartToken, config.blockCommentEndToken, this._insertSpace, model, builder);
	}

	public computeCursorState(model: ITextModel, helper: ICursorStateComputerData): Selection {
		if (this._isRemove) {
			const inverseEditOperations = helper.getInverseEditOperations();
			const srcRange = inverseEditOperations[0].range;
			return new Selection(srcRange.startLineNumber, srcRange.startColumn, srcRange.startLineNumber, srcRange.startColumn);
		}

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
