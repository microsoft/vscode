/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';


export function createTextLine(line: number, offset: number, text: string, lineBreak: string): vscode.TextLine {
	let wsRe = /s*/;
	let firstNws = 0;
	if (wsRe.test(text)) {
		firstNws = wsRe.lastIndex;
	}
	return {
		lineNumber: line,
		text: text,
		range: new vscode.Range(line, offset, line, offset + text.length),
		rangeIncludingLineBreak: new vscode.Range(line, offset, line, offset + text.length + lineBreak.length),
		firstNonWhitespaceCharacterIndex: firstNws,
		isEmptyOrWhitespace: firstNws === text.length
	};
}

export function toTextLines(text: string): vscode.TextLine[] {
	let current = 0;
	const result: vscode.TextLine[] = [];
	const parts = text.split(/(\r?\n)/);
	const lines = Math.floor(parts.length / 2) + 1;
	for (let line = 0; line < lines; line++) {
		const lineText = parts[line * 2];
		const separatorIndex = line * 2 + 1;
		const separator = separatorIndex < parts.length ? parts[line * 2 + 1] : '';
		result.push(createTextLine(result.length, current, lineText, separator));
		current += lineText.length + separator.length;
	}
	return result;
}
