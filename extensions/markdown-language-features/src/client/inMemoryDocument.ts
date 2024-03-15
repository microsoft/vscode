/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocument } from 'vscode-languageserver-textdocument';
import * as vscode from 'vscode';
import { ITextDocument } from '../types/textDocument';

export class InMemoryDocument implements ITextDocument {

	private readonly _doc: TextDocument;

	public readonly uri: vscode.Uri;
	public readonly version: number;

	constructor(
		uri: vscode.Uri,
		contents: string,
		version: number = 0,
	) {
		this.uri = uri;
		this.version = version;
		this._doc = TextDocument.create(this.uri.toString(), 'markdown', 0, contents);
	}

	getText(range?: vscode.Range): string {
		return this._doc.getText(range);
	}

	positionAt(offset: number): vscode.Position {
		const pos = this._doc.positionAt(offset);
		return new vscode.Position(pos.line, pos.character);
	}
}
