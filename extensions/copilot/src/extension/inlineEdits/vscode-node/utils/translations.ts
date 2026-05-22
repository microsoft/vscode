/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Range } from '../../../../util/vs/editor/common/core/range';
import { Position } from '../../../../util/vs/editor/common/core/position';
import { TextReplacement } from '../../../../util/vs/editor/common/core/edits/textEdit';

export function toInternalRange(range: vscode.Range): Range {
	return new Range(range.start.line + 1, range.start.character + 1, range.end.line + 1, range.end.character + 1);
}

export function toExternalRange(range: Range): vscode.Range {
	return new vscode.Range(toExternalPosition(range.getStartPosition()), toExternalPosition(range.getEndPosition()));
}

export function toInternalPosition(position: vscode.Position): Position {
	return new Position(position.line + 1, position.character + 1);
}

export function toExternalPosition(position: Position): vscode.Position {
	return new vscode.Position(position.lineNumber - 1, position.column - 1);
}

export function toInternalTextEdit(range: vscode.Range, newText: string): TextReplacement {
	return new TextReplacement(toInternalRange(range), newText);
}

export function toExternalTextEdit(edit: TextReplacement): vscode.TextEdit {
	return new vscode.TextEdit(toExternalRange(edit.range), edit.text);
}