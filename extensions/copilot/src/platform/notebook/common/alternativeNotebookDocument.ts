/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { NotebookCell, NotebookDocument, TextLine } from 'vscode';
import { DEFAULT_WORD_REGEXP, getWordAtText } from '../../../util/vs/editor/common/core/wordHelper';
import { Position, Range } from '../../../vscodeTypes';
import { PositionOffsetTransformer } from '../../editing/common/positionOffsetTransformer';
import { SnapshotDocumentLine } from '../../editing/common/textDocumentSnapshot';


export abstract class AlternativeNotebookDocument {
	private _transformer: PositionOffsetTransformer | null = null;
	private get transformer(): PositionOffsetTransformer {
		if (!this._transformer) {
			this._transformer = new PositionOffsetTransformer(this._text);
		}
		return this._transformer;
	}

	getText(range?: Range): string {
		return range ? this._getTextInRange(range) : this._text;
	}

	private _getTextInRange(_range: Range): string {
		const range = this.validateRange(_range);

		if (range.isEmpty) {
			return '';
		}

		const offsetRange = this.transformer.toOffsetRange(range);
		return this._text.substring(offsetRange.start, offsetRange.endExclusive);
	}

	constructor(protected readonly _text: string, protected readonly notebook: NotebookDocument) {

	}

	protected positionToOffset(position: Position): number {
		position = this.validatePosition(position);
		return this.transformer.getOffset(position);
	}

	/**
	 * Translates a position in the notebook document to the corresponding alternative position.
	 */
	abstract fromCellPosition(cell: NotebookCell, position: Position): Position;

	/**
	 * Translates a position in the alternative document to the corresponding cell index and position in the notebook document.
	 */
	abstract toCellPosition(position: Position): { cell: NotebookCell; position: Position } | undefined;

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


	private _lines: string[] | null = null;

	get lines(): string[] {
		if (!this._lines) {
			this._lines = this._text.split(/\r\n|\r|\n/g);
		}
		return this._lines;
	}

	get lineCount(): number {
		return this.lines.length;
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
		return this.transformer.getOffset(position);
	}

	positionAt(offset: number): Position {
		offset = Math.floor(offset);
		offset = Math.max(0, offset);

		return this.transformer.getPosition(offset);
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
}
