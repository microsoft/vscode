/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { SkinnyTextDocument, SkinnyTextLine } from '../workspaceContents';

export class InMemoryDocument implements SkinnyTextDocument {

	private readonly _doc: TextDocument;

	private lines: SkinnyTextLine[] | undefined;

	constructor(
		public readonly uri: vscode.Uri, contents: string,
		public readonly version = 0,
	) {

		this._doc = TextDocument.create(uri.toString(), 'markdown', version, contents);
	}

	get lineCount(): number {
		return this._doc.lineCount;
	}

	lineAt(index: any): SkinnyTextLine {
		if (!this.lines) {
			this.lines = this._doc.getText().split(/\r?\n/).map(text => ({
				text,
				get isEmptyOrWhitespace() { return /^\s*$/.test(text); }
			}));
		}
		return this.lines[index];
	}

	positionAt(offset: number): vscode.Position {
		const pos = this._doc.positionAt(offset);
		return new vscode.Position(pos.line, pos.character);
	}

	getText(range?: vscode.Range): string {
		return this._doc.getText(range);
	}
}
