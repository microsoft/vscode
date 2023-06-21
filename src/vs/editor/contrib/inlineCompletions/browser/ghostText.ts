/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from 'vs/editor/common/core/range';
import { ColumnRange, applyEdits } from 'vs/editor/contrib/inlineCompletions/browser/utils';

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
		const l = this.lineNumber;
		return applyEdits(documentText, [
			...this.parts.map(p => ({
				range: { startLineNumber: l, endLineNumber: l, startColumn: p.column, endColumn: p.column },
				text: debug ? `[${p.lines.join('\n')}]` : p.lines.join('\n')
			})),
		]);
	}

	renderForScreenReader(lineText: string): string {
		if (this.parts.length === 0) {
			return '';
		}
		const lastPart = this.parts[this.parts.length - 1];

		const cappedLineText = lineText.substr(0, lastPart.column - 1);
		const text = applyEdits(cappedLineText,
			this.parts.map(p => ({
				range: { startLineNumber: 1, endLineNumber: 1, startColumn: p.column, endColumn: p.column },
				text: p.lines.join('\n')
			}))
		);

		return text.substring(this.parts[0].column - 1);
	}

	isEmpty(): boolean {
		return this.parts.every(p => p.lines.length === 0);
	}

	get lineCount(): number {
		return 1 + this.parts.reduce((r, p) => r + p.lines.length - 1, 0);
	}
}

export class GhostTextPart {
	constructor(
		readonly column: number,
		readonly lines: readonly string[],
		/**
		 * Indicates if this part is a preview of an inline suggestion when a suggestion is previewed.
		*/
		readonly preview: boolean,
	) {
	}

	equals(other: GhostTextPart): boolean {
		return this.column === other.column &&
			this.lines.length === other.lines.length &&
			this.lines.every((line, index) => line === other.lines[index]);
	}
}

export class GhostTextReplacement {
	public readonly parts: ReadonlyArray<GhostTextPart> = [
		new GhostTextPart(
			this.columnRange.endColumnExclusive,
			this.newLines,
			false
		),
	];

	constructor(
		readonly lineNumber: number,
		readonly columnRange: ColumnRange,
		readonly newLines: readonly string[],
		public readonly additionalReservedLineCount: number = 0,
	) { }

	renderForScreenReader(_lineText: string): string {
		return this.newLines.join('\n');
	}

	render(documentText: string, debug: boolean = false): string {
		const replaceRange = this.columnRange.toRange(this.lineNumber);

		if (debug) {
			return applyEdits(documentText, [
				{ range: Range.fromPositions(replaceRange.getStartPosition()), text: `(` },
				{ range: Range.fromPositions(replaceRange.getEndPosition()), text: `)[${this.newLines.join('\n')}]` }
			]);
		} else {
			return applyEdits(documentText, [
				{ range: replaceRange, text: this.newLines.join('\n') }
			]);
		}
	}

	get lineCount(): number {
		return this.newLines.length;
	}

	isEmpty(): boolean {
		return this.parts.every(p => p.lines.length === 0);
	}
}

export type GhostTextOrReplacement = GhostText | GhostTextReplacement;
