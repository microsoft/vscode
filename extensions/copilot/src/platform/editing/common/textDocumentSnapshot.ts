/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { EndOfLine, TextDocument, TextLine, Uri } from 'vscode';
import { isNumber, isString } from '../../../util/vs/base/common/types';
import { isUriComponents, URI, UriComponents } from '../../../util/vs/base/common/uri';
import { DEFAULT_WORD_REGEXP, getWordAtText } from '../../../util/vs/editor/common/core/wordHelper';
import { Position, Range } from '../../../vscodeTypes';
import { PositionOffsetTransformer } from './positionOffsetTransformer';

export interface ITextDocumentSnapshotJSON {
	readonly uri: UriComponents;
	readonly _text: string;
	readonly languageId: string;
	readonly version: number;
	readonly eol: EndOfLine;
}

export function isTextDocumentSnapshotJSON(thing: any): thing is ITextDocumentSnapshotJSON {
	if (!thing || typeof thing !== 'object') {
		return false;
	}
	return isUriComponents(thing.uri) && isString(thing._text) && isString(thing.languageId) && isNumber(thing.version) && isNumber(thing.eol);
}

export class TextDocumentSnapshot {

	_textDocumentSnapshot: undefined;

	static create(doc: TextDocument): TextDocumentSnapshot {
		return new TextDocumentSnapshot(
			doc,
			doc.uri,
			doc.getText(),
			doc.languageId,
			doc.eol,
			doc.version,
		);
	}

	static fromNewText(text: string, doc: TextDocument | TextDocumentSnapshot) {
		return new TextDocumentSnapshot(
			doc instanceof TextDocumentSnapshot ? doc.document : doc,
			doc.uri,
			text,
			doc.languageId,
			doc.eol,
			doc.version + 1,
		);
	}

	static fromJSON(doc: TextDocument, json: ITextDocumentSnapshotJSON): TextDocumentSnapshot {
		return new TextDocumentSnapshot(
			doc,
			URI.from(json.uri),
			json._text,
			json.languageId,
			json.eol,
			json.version,
		);
	}

	readonly document: TextDocument;
	readonly uri: Uri;
	readonly _text: string;
	readonly languageId: string;
	readonly version: number;
	readonly eol: EndOfLine;

	private _transformer: PositionOffsetTransformer | null = null;
	public get transformer(): PositionOffsetTransformer {
		if (!this._transformer) {
			this._transformer = new PositionOffsetTransformer(this._text);
		}
		return this._transformer;
	}

	get fileName(): string {
		return this.uri.fsPath;
	}

	get isUntitled(): boolean {
		return this.uri.scheme === 'untitled';
	}

	get lineCount(): number {
		return this.lines.length;
	}

	private _lines: string[] | null = null;
	get lines(): readonly string[] {
		if (!this._lines) {
			this._lines = this._text.split(/\r\n|\r|\n/g);
		}
		return this._lines;
	}

	private constructor(document: TextDocument, uri: Uri, text: string, languageId: string, eol: EndOfLine, version: number) {
		this.document = document;
		this.uri = uri;
		this._text = text;
		this.languageId = languageId;
		this.eol = eol;
		this.version = version;
	}

	lineAt(line: number): TextLine;
	lineAt(position: Position): TextLine;
	lineAt(lineOrPosition: number | Position): TextLine {
		let line: number | undefined;
		if (lineOrPosition instanceof Position) {
			line = lineOrPosition.line;
		} else if (typeof lineOrPosition === 'number') {
			line = lineOrPosition;
		} else {
			throw new Error(`Invalid argument`);
		}
		if (line < 0 || line >= this.lines.length) {
			throw new Error('Illegal value for `line`');
		}

		return new SnapshotDocumentLine(line, this.lines[line], line === this.lines.length - 1);
	}

	offsetAt(position: Position): number {
		if (this.version === this.document.version) {
			return this.document.offsetAt(position);
		}

		position = this.validatePosition(position);
		return this.transformer.getOffset(position);
	}

	positionAt(offset: number): Position {
		if (this.version === this.document.version) {
			return this.document.positionAt(offset);
		}

		offset = Math.floor(offset);
		offset = Math.max(0, offset);

		return this.transformer.getPosition(offset);
	}

	getText(range?: Range): string {
		return range ? this._getTextInRange(range) : this._text;
	}

	private _getTextInRange(_range: Range): string {
		if (this.version === this.document.version) {
			return this.document.getText(_range);
		}

		const range = this.validateRange(_range);

		if (range.isEmpty) {
			return '';
		}

		const offsetRange = this.transformer.toOffsetRange(range);
		return this._text.substring(offsetRange.start, offsetRange.endExclusive);
	}

	getWordRangeAtPosition(_position: Position): Range | undefined {
		const position = this.validatePosition(_position);

		const wordAtText = getWordAtText(
			position.character + 1,
			DEFAULT_WORD_REGEXP,
			this.lines[position.line],
			0
		);

		if (wordAtText) {
			return new Range(position.line, wordAtText.startColumn - 1, position.line, wordAtText.endColumn - 1);
		}
		return undefined;
	}

	validateRange(range: Range): Range {
		const start = this.validatePosition(range.start);
		const end = this.validatePosition(range.end);

		if (start === range.start && end === range.end) {
			return range;
		}
		return new Range(start.line, start.character, end.line, end.character);
	}

	validatePosition(position: Position): Position {
		if (this._text.length === 0) {
			return position.with(0, 0);
		}

		let { line, character } = position;
		let hasChanged = false;

		if (line < 0) {
			line = 0;
			character = 0;
			hasChanged = true;
		} else if (line >= this.lines.length) {
			line = this.lines.length - 1;
			character = this.lines[line].length;
			hasChanged = true;
		} else {
			const maxCharacter = this.lines[line].length;
			if (character < 0) {
				character = 0;
				hasChanged = true;
			} else if (character > maxCharacter) {
				character = maxCharacter;
				hasChanged = true;
			}
		}

		if (!hasChanged) {
			return position;
		}
		return new Position(line, character);
	}

	toJSON(): ITextDocumentSnapshotJSON {
		return {
			uri: this.uri.toJSON(),
			languageId: this.languageId,
			version: this.version,
			eol: this.eol,
			_text: this._text
		};
	}
}

export class SnapshotDocumentLine implements TextLine {
	private readonly _line: number;
	private readonly _text: string;
	private readonly _isLastLine: boolean;

	constructor(line: number, text: string, isLastLine: boolean) {
		this._line = line;
		this._text = text;
		this._isLastLine = isLastLine;
	}

	public get lineNumber(): number {
		return this._line;
	}

	public get text(): string {
		return this._text;
	}

	public get range(): Range {
		return new Range(this._line, 0, this._line, this._text.length);
	}

	public get rangeIncludingLineBreak(): Range {
		if (this._isLastLine) {
			return this.range;
		}
		return new Range(this._line, 0, this._line + 1, 0);
	}

	public get firstNonWhitespaceCharacterIndex(): number {
		//TODO@api, rename to 'leadingWhitespaceLength'
		return /^(\s*)/.exec(this._text)![1].length;
	}

	public get isEmptyOrWhitespace(): boolean {
		return this.firstNonWhitespaceCharacterIndex === this._text.length;
	}
}
