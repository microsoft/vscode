/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocument } from 'vscode-languageserver-textdocument';
import { IPosition, makePosition } from './types/position';
import { IRange } from './types/range';
import { ITextDocument } from './types/textDocument';
import { IUri } from './types/uri';

export class InMemoryDocument implements ITextDocument {

	private readonly _doc: TextDocument;

	private lines: string[] | undefined;

	constructor(
		public readonly uri: IUri, contents: string,
		public readonly version = 0,
	) {

		this._doc = TextDocument.create(uri.toString(), 'markdown', version, contents);
	}

	get lineCount(): number {
		return this._doc.lineCount;
	}

	lineAt(index: any): string {
		if (!this.lines) {
			this.lines = this._doc.getText().split(/\r?\n/);
		}
		return this.lines[index];
	}

	positionAt(offset: number): IPosition {
		const pos = this._doc.positionAt(offset);
		return makePosition(pos.line, pos.character);
	}

	getText(range?: IRange): string {
		return this._doc.getText(range);
	}
}
