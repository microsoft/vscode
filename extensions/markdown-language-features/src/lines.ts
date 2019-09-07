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
	let result: vscode.TextLine[] = [];
	while (true) {
		let nextNewLine = text.indexOf('\r\n', current);
		let separator: string;
		if (nextNewLine === -1) {
			nextNewLine = text.indexOf('\n', current);
			if (nextNewLine !== -1) {
				separator = '\n';
			} else {
				separator = '';
			}
		} else {
			separator = '\r\n';
		}

		if (nextNewLine === -1) {
			break;
		}
		result.push(createTextLine(result.length, current, text.substring(current, nextNewLine), separator));
		current = nextNewLine + separator.length;
	}
	result.push(createTextLine(result.length, current, text.substring(current, text.length), ''));
	return result;
}
