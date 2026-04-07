/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { splitLines } from '../../../util/vs/base/common/strings';
import { StringEdit, StringReplacement } from '../../../util/vs/editor/common/core/edits/stringEdit';
import { OffsetRange } from '../../../util/vs/editor/common/core/ranges/offsetRange';
import { PrefixSumComputer } from '../../../util/vs/editor/common/model/prefixSumComputer';
import { Position, Range, TextEdit } from '../../../vscodeTypes';

export class PositionOffsetTransformer {
	private readonly _eol: string;
	private _lines: string[];
	private _lineStarts: PrefixSumComputer;

	constructor(text: string) {
		this._lines = splitLines(text);
		this._eol = text.charAt(this._lines[0].length) === '\r' ? '\r\n' : '\n';
		const lineStartValues = new Uint32Array(this._lines.length);
		for (let i = 0; i < this._lines.length; i++) {
			lineStartValues[i] = this._lines[i].length + this._eol.length;
		}
		this._lineStarts = new PrefixSumComputer(lineStartValues);
	}

	getText(): string {
		return this._lines.join(this._eol);
	}

	applyOffsetEdits(offsetEdits: StringEdit) {
		const { replacements } = offsetEdits;
		for (let i = replacements.length - 1; i >= 0; i--) {
			const edit = replacements[i];
			const range = this.toRange(edit.replaceRange);

			this._acceptDeleteRange(range);
			this._acceptInsertText(range.start, edit.newText);
		}
	}

	private _acceptDeleteRange(range: vscode.Range): void {

		if (range.start.line === range.end.line) {
			if (range.start.character === range.end.character) {
				// Nothing to delete
				return;
			}
			// Delete text on the affected line
			this._setLineText(range.start.line,
				this._lines[range.start.line].substring(0, range.start.character)
				+ this._lines[range.start.line].substring(range.end.character)
			);
			return;
		}

		// Take remaining text on last line and append it to remaining text on first line
		this._setLineText(range.start.line,
			this._lines[range.start.line].substring(0, range.start.character)
			+ this._lines[range.end.line].substring(range.end.character)
		);

		// Delete middle lines
		this._lines.splice(range.start.line + 1, range.end.line - range.start.line);
		this._lineStarts.removeValues(range.start.line + 1, range.end.line - range.start.line);
	}

	private _acceptInsertText(position: vscode.Position, insertText: string): void {
		if (insertText.length === 0) {
			// Nothing to insert
			return;
		}
		const insertLines = splitLines(insertText);
		if (insertLines.length === 1) {
			// Inserting text on one line
			this._setLineText(position.line,
				this._lines[position.line].substring(0, position.character)
				+ insertLines[0]
				+ this._lines[position.line].substring(position.character)
			);
			return;
		}

		// Append overflowing text from first line to the end of text to insert
		insertLines[insertLines.length - 1] += this._lines[position.line].substring(position.character);

		// Delete overflowing text from first line and insert text on first line
		this._setLineText(position.line,
			this._lines[position.line].substring(0, position.character)
			+ insertLines[0]
		);

		// Insert new lines & store lengths
		const newLengths = new Uint32Array(insertLines.length - 1);
		for (let i = 1; i < insertLines.length; i++) {
			this._lines.splice(position.line + 1 + i - 1, 0, insertLines[i]);
			newLengths[i - 1] = insertLines[i].length + this._eol.length;
		}

		this._lineStarts.insertValues(position.line + 1, newLengths);
	}

	/**
	 * All changes to a line's text go through this method
	 */
	private _setLineText(lineIndex: number, newValue: string): void {
		this._lines[lineIndex] = newValue;
		this._lineStarts.setValue(lineIndex, this._lines[lineIndex].length + this._eol.length);
	}

	getLineCount(): number {
		return this._lines.length;
	}

	getOffset(position: Position): number {
		position = this.validatePosition(position);
		return this._lineStarts.getPrefixSum(position.line - 1) + position.character;
	}

	getPosition(offset: number): Position {
		offset = Math.floor(offset);
		offset = Math.max(0, offset);

		const out = this._lineStarts.getIndexOf(offset);

		const lineLength = this._lines[out.index].length;

		// Ensure we return a valid position
		return new Position(out.index, Math.min(out.remainder, lineLength));
	}

	toRange(offsetRange: OffsetRange): Range {
		return new Range(this.getPosition(offsetRange.start), this.getPosition(offsetRange.endExclusive));
	}

	toOffsetRange(range: Range): OffsetRange {
		return new OffsetRange(
			this.getOffset(range.start),
			this.getOffset(range.end)
		);
	}

	toOffsetEdit(edits: readonly TextEdit[]): StringEdit {
		const validEdits = edits.map(edit => new TextEdit(this.validateRange(edit.range), edit.newText));
		return new StringEdit(validEdits.map(edit => {
			return new StringReplacement(this.toOffsetRange(edit.range), edit.newText);
		}));
	}

	toTextEdits(edit: StringEdit): TextEdit[] {
		return edit.replacements.map(edit => {
			return new TextEdit(this.toRange(edit.replaceRange), edit.newText);
		});
	}

	public validatePosition(position: vscode.Position): vscode.Position {
		if (!(position instanceof Position)) {
			throw new Error('Invalid argument');
		}

		if (this._lines.length === 0) {
			return position.with(0, 0);
		}

		let { line, character } = position;
		let hasChanged = false;

		if (line < 0) {
			line = 0;
			character = 0;
			hasChanged = true;
		}
		else if (line >= this._lines.length) {
			line = this._lines.length - 1;
			character = this._lines[line].length;
			hasChanged = true;
		}
		else {
			const maxCharacter = this._lines[line].length;
			if (character < 0) {
				character = 0;
				hasChanged = true;
			}
			else if (character > maxCharacter) {
				character = maxCharacter;
				hasChanged = true;
			}
		}

		if (!hasChanged) {
			return position;
		}
		return new Position(line, character);
	}

	validateRange(range: Range): Range {
		return new Range(
			this.validatePosition(range.start),
			this.validatePosition(range.end)
		);
	}
}
