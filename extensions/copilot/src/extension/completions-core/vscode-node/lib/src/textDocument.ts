/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { detectLanguage } from './language/languageDetection';
import { normalizeUri } from './util/uri';
import { TextEdit } from '../../types/src';
import { TextDocumentContentChangeEvent } from 'vscode-languageserver-protocol';
import { TextDocument as LspTextDocument } from 'vscode-languageserver-textdocument';
import { Position, Range, SelectedCompletionInfo } from 'vscode-languageserver-types';

export { type Position as IPosition, type Range as IRange } from '../../types/src';

export class LocationFactory {
	static range = Range.create.bind(Range);
	static position = Position.create.bind(Position);
}

interface Line {
	/**
	 * The line's text content. Doesn't include the trailing newline
	 */
	text: string;
	range: Range;
	isEmptyOrWhitespace: boolean;
}

export type IntelliSenseInsertion = SelectedCompletionInfo & {
	/**
	 * The corresponding signature information found in the tooltip.
	 */
	tooltipSignature?: string;
};

/**
 * Used to represent validation result of retrieving a text document
 */
export type TextDocumentValidation =
	| { status: 'invalid'; reason: string }
	| { status: 'notfound'; message: string }
	| { status: 'valid' };
/**
 * Used to represent validation result of retrieving a text document, plus the document itself if valid
 */
export type TextDocumentResult<TD = TextDocumentContents> =
	| { status: 'invalid'; reason: string }
	| { status: 'notfound'; message: string }
	| { status: 'valid'; document: TD };

export interface TextDocumentIdentifier {
	readonly uri: string;
}

export interface TextDocumentContents {
	/**
	 * Normalized version of .clientUri.  Intended to become identical to .clientUri in the future, for better
	 * vscode-languageserver interop.
	 *
	 * @readonly
	 */
	readonly uri: string;

	/**
	 * The identifier of the detected language associated with this document.
	 *
	 * @readonly
	 */
	readonly detectedLanguageId: string;

	/**
	 * Get the text of this document. A substring can be retrieved by
	 * providing a range.
	 *
	 * @param range (optional) An range within the document to return.
	 * If no range is passed, the full content is returned.
	 * Invalid range positions are adjusted as described in `Position.line` and `Position.character`.
	 * If the start range position is greater than the end range position,
	 * then the effect of getText is as if the two positions were swapped.

	 * @return The text of this document or a substring of the text if a
	 *         range is provided.
	 */
	getText(range?: Range): string;

	/**
	 * Converts a zero-based offset to a position.
	 *
	 * @param offset A zero-based offset.
	 * @return A valid `position`.
	 */
	positionAt(offset: number): Position;

	/**
	 * Converts the position to a zero-based offset.
	 * Invalid positions are adjusted as described in `Position.line` and `Position.character`.
	 *
	 * @param position A position.
	 * @return A valid zero-based offset.
	 */
	offsetAt(position: Position): number;

	/**
	 * The number of lines in this document.
	 *
	 * @readonly
	 */
	readonly lineCount: number;

	/**
	 * Returns a text line denoted by the line number.
	 */
	lineAt(position: number | Position): Line;

	/**
	 * Return a copy of a document with the same version number and edits both applied and reflected in .appliedEdits.
	 */
	applyEdits(edits: TextEdit[]): TextDocumentContents;
}

export interface ITextDocument extends TextDocumentContents {
	/**
	 * The original URI provided by the client.
	 *
	 * @readonly
	 */
	readonly clientUri: string;

	/**
	 * The client reported identifier of the language associated with this document.
	 *
	 * @readonly
	 * @deprecated Favor the explicitly named clientLanguageId or detectedLanguageId
	 */
	readonly languageId: string;

	/**
	 * The client reported identifier of the language associated with this document.
	 *
	 * @readonly
	 */
	readonly clientLanguageId: string;

	/**
	 * The version number of this document (it will increase after each
	 * change, including undo/redo).
	 *
	 * @readonly
	 */
	readonly version: number;

	/**
	 * Return a copy of a document with the same version number and edits both applied and reflected in .appliedEdits.
	 */
	applyEdits(edits: TextEdit[]): ITextDocument;
}

export interface INotebookCell {
	/**
	 * The index of this cell in its `NotebookDocument.cellAt` containing notebook. The
	 * index is updated when a cell is moved within its notebook. The index is `-1`
	 * when the cell has been removed from its notebook.
	 */
	readonly index: number;

	/**
	 * The text of this cell, represented as `ITextDocument`.
	 */
	readonly document: ITextDocument;

	/**
	 * The metadata of this cell. Can be anything but must be JSON-stringifyable.
	 */
	readonly metadata: { [key: string]: unknown };

	/**
	 * The kind of this cell.
	 *  1 = Markup
	 *  2 = Code
	 */
	readonly kind: 1 | 2;
}

export interface INotebookDocument {
	/**
	 * Get the cells of this notebook.
	 *
	 * @returns The cells contained by the range or all cells.
	 */
	getCells(): INotebookCell[];

	getCellFor({ uri }: { uri: string }): INotebookCell | undefined;
}

export class CopilotTextDocument implements ITextDocument {
	private constructor(
		readonly uri: string,
		private readonly _textDocument: LspTextDocument,
		readonly detectedLanguageId: string
	) { }

	/**
	 * Return a copy of a document with a new version number and changes applied. Used when a document is changed
	 * canonically (e.g., synced via textDocument/didChange).
	 */
	static withChanges(textDocument: ITextDocument, changes: TextDocumentContentChangeEvent[], version: number) {
		const lspDoc = LspTextDocument.create(
			textDocument.clientUri,
			textDocument.clientLanguageId,
			version,
			textDocument.getText()
		);
		LspTextDocument.update(lspDoc, changes, version);
		return new CopilotTextDocument(textDocument.uri, lspDoc, textDocument.detectedLanguageId);
	}

	/**
	 * Return a copy of a document with the same version number and edits applied.
	 * Used when the changes *aren't* canonical (e.g., a speculative completion request).
	 */
	applyEdits(edits: TextEdit[]) {
		const lspDoc = LspTextDocument.create(this.clientUri, this.clientLanguageId, this.version, this.getText());
		LspTextDocument.update(
			lspDoc,
			edits.map(c => ({ text: c.newText, range: c.range })),
			this.version
		);
		return new CopilotTextDocument(this.uri, lspDoc, this.detectedLanguageId);
	}

	static create(
		uri: string,
		languageId: string,
		version: number,
		text: string,
		detectedLanguageId = detectLanguage({ uri, languageId })
	) {
		return new CopilotTextDocument(
			normalizeUri(uri),
			LspTextDocument.create(uri, languageId, version, text),
			detectedLanguageId
		);
	}

	get clientUri(): string {
		return this._textDocument.uri;
	}

	get clientLanguageId(): string {
		return this._textDocument.languageId;
	}

	get languageId(): string {
		return this._textDocument.languageId;
	}

	get version(): number {
		return this._textDocument.version;
	}

	get lineCount() {
		return this._textDocument.lineCount;
	}

	getText(range?: Range): string {
		return this._textDocument.getText(range);
	}

	positionAt(offset: number): Position {
		return this._textDocument.positionAt(offset);
	}

	offsetAt(position: Position): number {
		return this._textDocument.offsetAt(position);
	}

	lineAt(position: number | Position) {
		const lineNumber = typeof position === 'number' ? position : position.line;
		if (lineNumber < 0 || lineNumber >= this.lineCount) {
			throw new RangeError('Illegal value for lineNumber');
		}
		const rangeWithNewline = Range.create(lineNumber, 0, lineNumber + 1, 0);
		const text = this.getText(rangeWithNewline).replace(/\r\n$|\r$|\n$/g, '');
		const range = Range.create(Position.create(lineNumber, 0), Position.create(lineNumber, text.length));

		const isEmptyOrWhitespace = text.trim().length === 0;
		return { text, range, isEmptyOrWhitespace };
	}
}
