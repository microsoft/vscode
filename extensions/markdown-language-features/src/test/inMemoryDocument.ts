/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import * as vscode from 'vscode';
export class InMemoryDocument implements vscode.TextDocument {
	private readonly _lines: string[];

	constructor(
		public readonly uri: vscode.Uri,
		private readonly _contents: string,
		public readonly version = 1,
	) {
		this._lines = this._contents.split(/\r\n|\n/g);
	}

	isUntitled: boolean = false;
	languageId: string = '';
	isDirty: boolean = false;
	isClosed: boolean = false;
	eol: vscode.EndOfLine = os.platform() === 'win32' ? vscode.EndOfLine.CRLF : vscode.EndOfLine.LF;
	notebook: undefined;

	get fileName(): string {
		return this.uri.fsPath;
	}

	get lineCount(): number {
		return this._lines.length;
	}

	lineAt(line: any): vscode.TextLine {
		return {
			lineNumber: line,
			text: this._lines[line],
			range: new vscode.Range(0, 0, 0, 0),
			firstNonWhitespaceCharacterIndex: 0,
			rangeIncludingLineBreak: new vscode.Range(0, 0, 0, 0),
			isEmptyOrWhitespace: false
		};
	}
	offsetAt(_position: vscode.Position): never {
		throw new Error('Method not implemented.');
	}
	positionAt(offset: number): vscode.Position {
		const before = this._contents.slice(0, offset);
		const newLines = before.match(/\r\n|\n/g);
		const line = newLines ? newLines.length : 0;
		// eslint-disable-next-line code-no-look-behind-regex
		const preCharacters = before.match(/(?<=\r\n|\n|^).*$/g);
		return new vscode.Position(line, preCharacters ? preCharacters[0].length : 0);
	}
	getText(range?: vscode.Range): string {
		if (!range) {
			return this._contents;
		}

		if (range.start.line !== range.end.line) {
			throw new Error('Method not implemented.');
		}

		return this._lines[range.start.line].slice(range.start.character, range.end.character);
	}
	getWordRangeAtPosition(_position: vscode.Position, _regex?: RegExp | undefined): never {
		throw new Error('Method not implemented.');
	}
	validateRange(_range: vscode.Range): never {
		throw new Error('Method not implemented.');
	}
	validatePosition(_position: vscode.Position): never {
		throw new Error('Method not implemented.');
	}
	save(): never {
		throw new Error('Method not implemented.');
	}
}
