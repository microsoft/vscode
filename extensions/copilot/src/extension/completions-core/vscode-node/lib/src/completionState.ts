/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Position, ProposedTextEdit, TextEdit } from '../../types/src';
import { IntelliSenseInsertion, ITextDocument, type TextDocumentContents } from './textDocument';

export class CompletionState {
	readonly originalPosition: Position;
	readonly originalVersion: number;
	readonly originalOffset: number;
	private readonly _editsWithPosition: ReadonlyArray<ProposedTextEdit>;

	constructor(
		private readonly _textDocument: ITextDocument,
		private readonly _position: Position,
		edits: ProposedTextEdit[] = [],
		originalPosition?: Position,
		originalVersion?: number,
		originalOffset?: number
	) {
		this.originalPosition = originalPosition ?? Position.create(_position.line, _position.character);
		this.originalVersion = originalVersion ?? _textDocument.version;
		this.originalOffset = originalOffset ?? _textDocument.offsetAt(this.originalPosition);
		this._editsWithPosition = [...edits];
	}

	get textDocument(): TextDocumentContents {
		return this._textDocument;
	}

	get position(): Position {
		return this._position;
	}

	get editsWithPosition(): ProposedTextEdit[] {
		return [...this._editsWithPosition];
	}

	private updateState(textDocument: ITextDocument, position: Position, edits?: ProposedTextEdit[]): CompletionState {
		return new CompletionState(
			textDocument,
			position,
			edits ?? this.editsWithPosition,
			this.originalPosition,
			this.originalVersion,
			this.originalOffset
		);
	}

	updatePosition(position: Position): CompletionState {
		return this.updateState(this._textDocument, position);
	}

	addSelectedCompletionInfo(selectedCompletionInfo: IntelliSenseInsertion): CompletionState {
		if (this.editsWithPosition.find(edit => edit.source === 'selectedCompletionInfo')) {
			throw new Error('Selected completion info already applied');
		}

		const edit: TextEdit = {
			range: selectedCompletionInfo.range,
			newText: selectedCompletionInfo.text,
		};
		return this.applyEdits([edit], true);
	}

	applyEdits(edits: TextEdit[], isSelectedCompletionInfo = false): CompletionState {
		if (isSelectedCompletionInfo && edits.length > 1) {
			throw new Error('Selected completion info should be a single edit');
		}

		let textDocument = this._textDocument;
		let position = this._position;
		let offset: number = textDocument.offsetAt(position);
		const newEdits = this.editsWithPosition;

		for (const { range, newText } of edits) {
			const oldText = textDocument.getText(range);
			const oldEndOffset = textDocument.offsetAt(range.end);
			textDocument = textDocument.applyEdits([{ range, newText }]);
			// We err on the side of updating the position if it's exactly aligned with the start of the range.  This is
			// what we want in the context of applying a completion, but it does make some operations impossible, like
			// preserving a position at the start of the document (line 0 column 0).
			if (offset < textDocument.offsetAt(range.start)) {
				const edit: ProposedTextEdit = {
					range,
					newText,
					positionAfterEdit: Position.create(position.line, position.character),
				};
				if (isSelectedCompletionInfo) {
					edit.source = 'selectedCompletionInfo';
				}
				newEdits.push(edit);
				continue;
			}
			if (offset < oldEndOffset) {
				offset = oldEndOffset;
			}
			offset += newText.length - oldText.length;
			position = textDocument.positionAt(offset);
			const edit: ProposedTextEdit = {
				range,
				newText,
				positionAfterEdit: Position.create(position.line, position.character),
			};
			if (isSelectedCompletionInfo) {
				edit.source = 'selectedCompletionInfo';
			}
			newEdits.push(edit);
		}

		return this.updateState(textDocument, position, newEdits);
	}
}

export function createCompletionState(textDocument: ITextDocument, position: Position): CompletionState {
	return new CompletionState(textDocument, position);
}
