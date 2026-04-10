/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { NotebookDocument, TextLine, Uri } from 'vscode';
import { isNumber, isString } from '../../../util/vs/base/common/types';
import { isUriComponents, UriComponents } from '../../../util/vs/base/common/uri';
import { Position, Range, Selection } from '../../../vscodeTypes';
import { getAlternativeNotebookDocumentProvider } from '../../notebook/common/alternativeContent';
import { AlternativeNotebookDocument } from '../../notebook/common/alternativeNotebookDocument';
import { getDefaultLanguage } from '../../notebook/common/helpers';

export interface INotebookDocumentSnapshotJSON {
	readonly type: 'notebook';
	readonly uri: UriComponents;
	readonly _text: string;
	readonly languageId: string;
	readonly version: number;
	readonly alternativeFormat: 'json' | 'xml' | 'text';
}

export function isNotebookDocumentSnapshotJSON(thing: any): thing is INotebookDocumentSnapshotJSON {
	if (!thing || typeof thing !== 'object') {
		return false;
	}
	return thing.type === 'notebook' && isUriComponents(thing.uri) && isString(thing._text) &&
		isString(thing.languageId) && isNumber(thing.version) && isString(thing.alternativeFormat);
}

export class NotebookDocumentSnapshot {
	static create(doc: NotebookDocument, format: 'json' | 'xml' | 'text'): NotebookDocumentSnapshot {
		const uri = doc.uri;
		const version = doc.version;

		const alternativeDocument = getAlternativeNotebookDocumentProvider(format).getAlternativeDocument(doc);
		return new NotebookDocumentSnapshot(doc, uri, version, format, alternativeDocument);
	}
	static fromNewText(text: string, doc: NotebookDocumentSnapshot) {
		const alternativeDocument = getAlternativeNotebookDocumentProvider(doc.alternativeFormat).getAlternativeDocumentFromText(text, doc.document);
		const nd = new NotebookDocumentSnapshot(doc.document, doc.uri, doc.version, doc.alternativeFormat, alternativeDocument);
		return nd;
	}
	static fromJSON(doc: NotebookDocument, json: INotebookDocumentSnapshotJSON): NotebookDocumentSnapshot {
		// TODO@DonJayamanne
		return NotebookDocumentSnapshot.create(doc, json.alternativeFormat);
	}

	readonly type = 'notebook';
	readonly document: NotebookDocument;
	readonly uri: Uri;
	readonly version: number;
	readonly languageId: string;


	private constructor(doc: NotebookDocument, uri: Uri, version: number, public readonly alternativeFormat: 'json' | 'xml' | 'text', private readonly _alternativeDocument: AlternativeNotebookDocument) {
		this.document = doc;
		this.uri = uri;
		this.version = version;
		this.languageId = alternativeFormat === 'text' ? getDefaultLanguage(doc) || 'python' : alternativeFormat;
	}

	getText(range?: Range): string {
		return this._alternativeDocument.getText(range);
	}

	getSelection() {
		return new Selection(0, 0, this.lineCount, 0);
	}

	getWholeRange(): Range {
		return new Range(0, 0, this.lineCount, 0);
	}

	get lines(): string[] {
		return this._alternativeDocument.lines;
	}

	get lineCount(): number {
		return this._alternativeDocument.lineCount;
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

		return this._alternativeDocument.lineAt(line);
	}
	offsetAt(position: Position): number {
		return this._alternativeDocument.offsetAt(position);
	}
	positionAt(offset: number): Position {
		return this._alternativeDocument.positionAt(offset);
	}
	validateRange(range: Range): Range {
		return this._alternativeDocument.validateRange(range);
	}

	validatePosition(position: Position): Position {
		return this._alternativeDocument.validatePosition(position);
	}
	toJSON(): INotebookDocumentSnapshotJSON {
		return {
			type: 'notebook',
			uri: this.uri.toJSON(),
			languageId: this.languageId,
			version: this.version,
			_text: this._alternativeDocument.getText(),
			alternativeFormat: this.alternativeFormat
		};
	}
}
