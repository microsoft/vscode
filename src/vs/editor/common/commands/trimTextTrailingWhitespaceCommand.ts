/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TrimTrailingWhitespaceCommand } from 'vs/editor/common/commands/trimTrailingWhitespaceCommand';
import { ISingleEditOperation } from 'vs/editor/common/core/editOperation';
import { ITextModel } from 'vs/editor/common/model';
import { Position } from 'vs/editor/common/core/position';
import * as strings from 'vs/base/common/strings';
import { Selection } from 'vs/editor/common/core/selection';
import { StandardTokenType } from 'vs/editor/common/encodedTokenAttributes';

export class TrimTextTrailingWhitespaceCommand extends TrimTrailingWhitespaceCommand {
	constructor(
		selection: Selection,
		cursors: Position[],
		trimInRegexesAndStrings: boolean
	) {
		super(selection, cursors, trimInRegexesAndStrings);
	}
	//Override base class to minimize duplicate logic
	protected trimTrailingWhitespace(model: ITextModel, cursors: Position[], trimInRegexesAndStrings: boolean): ISingleEditOperation[] {
		cursors.sort((a, b) => {
			if (a.lineNumber === b.lineNumber) {
				return a.column - b.column;
			}
			return a.lineNumber - b.lineNumber;
		});

		const operations: ISingleEditOperation[] = [];
		let cursorIndex = 0;
		const cursorLen = cursors.length;

		for (let lineNumber = 1, lineCount = model.getLineCount(); lineNumber <= lineCount; lineNumber++) {
			const lineContent = model.getLineContent(lineNumber);
			const maxLineColumn = lineContent.length + 1;
			let minEditColumn = 0;

			if (cursorIndex < cursorLen && cursors[cursorIndex].lineNumber === lineNumber) {
				minEditColumn = cursors[cursorIndex].column;
				cursorIndex++;
				if (minEditColumn === maxLineColumn) {
					continue;
				}
			}

			if (lineContent.length === 0) {
				continue;
			}

			const lastNonWhitespaceIndex = strings.lastNonWhitespaceIndex(lineContent);
			if (lastNonWhitespaceIndex === -1) {
				// Entire line is whitespace; skip it.
				continue;
			}

			let fromColumn = lastNonWhitespaceIndex + 2;
			if (!trimInRegexesAndStrings) {
				if (!model.tokenization.hasAccurateTokensForLine(lineNumber)) {
					continue;
				}

				const lineTokens = model.tokenization.getLineTokens(lineNumber);
				const fromColumnType = lineTokens.getStandardTokenType(lineTokens.findTokenIndexAtOffset(fromColumn));

				if (fromColumnType === StandardTokenType.String || fromColumnType === StandardTokenType.RegEx) {
					continue;
				}
			}

			fromColumn = Math.max(minEditColumn, fromColumn);
			operations.push({
				range: {
					startLineNumber: lineNumber,
					startColumn: fromColumn,
					endLineNumber: lineNumber,
					endColumn: maxLineColumn
				},
				text: ''
			});
		}

		return operations;
	}
}
