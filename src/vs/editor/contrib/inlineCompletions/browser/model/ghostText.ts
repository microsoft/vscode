/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from '../../../../../base/common/arrays.js';
import { splitLines } from '../../../../../base/common/strings.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { SingleTextEdit, TextEdit } from '../../../../common/core/textEdit.js';
import { LineDecoration } from '../../../../common/viewLayout/lineDecorations.js';
import { InlineDecoration } from '../../../../common/viewModel.js';
import { ColumnRange } from '../utils.js';

export class GhostText {
	constructor(
		public readonly lineNumber: number,
		public readonly parts: GhostTextPart[],
	) {
	}

	equals(other: GhostText): boolean {
		return this.lineNumber === other.lineNumber &&
			this.parts.length === other.parts.length &&
			this.parts.every((part, index) => part.equals(other.parts[index]));
	}

	/**
	 * Only used for testing/debugging.
	*/
	render(documentText: string, debug: boolean = false): string {
		return new TextEdit([
			...this.parts.map(p => new SingleTextEdit(
				Range.fromPositions(new Position(this.lineNumber, p.column)),
				debug ? `[${p.lines.map(line => line.line).join('\n')}]` : p.lines.map(line => line.line).join('\n')
			)),
		]).applyToString(documentText);
	}

	renderForScreenReader(lineText: string): string {
		if (this.parts.length === 0) {
			return '';
		}
		const lastPart = this.parts[this.parts.length - 1];

		const cappedLineText = lineText.substr(0, lastPart.column - 1);
		const text = new TextEdit([
			...this.parts.map(p => new SingleTextEdit(
				Range.fromPositions(new Position(1, p.column)),
				p.lines.map(line => line.line).join('\n')
			)),
		]).applyToString(cappedLineText);

		return text.substring(this.parts[0].column - 1);
	}

	isEmpty(): boolean {
		return this.parts.every(p => p.lines.length === 0);
	}

	get lineCount(): number {
		return 1 + this.parts.reduce((r, p) => r + p.lines.length - 1, 0);
	}
}

export interface IGhostTextLine {
	line: string;
	lineDecorations: LineDecoration[];
}


export class GhostTextPart {

	readonly lines: IGhostTextLine[];

	constructor(
		readonly column: number,
		readonly text: string,
		/**
		 * Indicates if this part is a preview of an inline suggestion when a suggestion is previewed.
		*/
		readonly preview: boolean,
		private _inlineDecorations: InlineDecoration[] = [],
	) {
		this.lines = splitLines(this.text).map((line, i) => ({
			line,
			lineDecorations: LineDecoration.filter(this._inlineDecorations, i + 1, 1, line.length + 1)
		}));
	}

	equals(other: GhostTextPart): boolean {
		return this.column === other.column &&
			this.lines.length === other.lines.length &&
			this.lines.every((line, index) =>
				line.line === other.lines[index].line &&
				LineDecoration.equalsArr(line.lineDecorations, other.lines[index].lineDecorations)
			);
	}
}

export class GhostTextReplacement {
	public readonly parts: ReadonlyArray<GhostTextPart>;
	readonly newLines: string[];

	constructor(
		readonly lineNumber: number,
		readonly columnRange: ColumnRange,
		readonly text: string,
		public readonly additionalReservedLineCount: number = 0,
	) {
		this.parts = [
			new GhostTextPart(
				this.columnRange.endColumnExclusive,
				this.text,
				false
			),
		];
		this.newLines = splitLines(this.text);
	}

	renderForScreenReader(_lineText: string): string {
		return this.newLines.join('\n');
	}

	render(documentText: string, debug: boolean = false): string {
		const replaceRange = this.columnRange.toRange(this.lineNumber);

		if (debug) {
			return new TextEdit([
				new SingleTextEdit(Range.fromPositions(replaceRange.getStartPosition()), '('),
				new SingleTextEdit(Range.fromPositions(replaceRange.getEndPosition()), `)[${this.newLines.join('\n')}]`),
			]).applyToString(documentText);
		} else {
			return new TextEdit([
				new SingleTextEdit(replaceRange, this.newLines.join('\n')),
			]).applyToString(documentText);
		}
	}

	get lineCount(): number {
		return this.newLines.length;
	}

	isEmpty(): boolean {
		return this.parts.every(p => p.lines.length === 0);
	}

	equals(other: GhostTextReplacement): boolean {
		return this.lineNumber === other.lineNumber &&
			this.columnRange.equals(other.columnRange) &&
			this.newLines.length === other.newLines.length &&
			this.newLines.every((line, index) => line === other.newLines[index]) &&
			this.additionalReservedLineCount === other.additionalReservedLineCount;
	}
}

export type GhostTextOrReplacement = GhostText | GhostTextReplacement;

export function ghostTextsOrReplacementsEqual(a: readonly GhostTextOrReplacement[] | undefined, b: readonly GhostTextOrReplacement[] | undefined): boolean {
	return equals(a, b, ghostTextOrReplacementEquals);
}

export function ghostTextOrReplacementEquals(a: GhostTextOrReplacement | undefined, b: GhostTextOrReplacement | undefined): boolean {
	if (a === b) {
		return true;
	}
	if (!a || !b) {
		return false;
	}
	if (a instanceof GhostText && b instanceof GhostText) {
		return a.equals(b);
	}
	if (a instanceof GhostTextReplacement && b instanceof GhostTextReplacement) {
		return a.equals(b);
	}
	return false;
}
