/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { compareBy, equals } from '../../../../base/common/arrays.js';
import { assertFn, checkAdjacentItems } from '../../../../base/common/assert.js';
import { BugIndicatingError } from '../../../../base/common/errors.js';
import { commonPrefixLength, commonSuffixLength } from '../../../../base/common/strings.js';
import { ISingleEditOperation } from '../editOperation.js';
import { BaseStringEdit, StringReplacement } from './stringEdit.js';
import { Position } from '../position.js';
import { Range } from '../range.js';
import { TextLength } from '../text/textLength.js';
import { AbstractText, StringText } from '../text/abstractText.js';
import { IEquatable } from '../../../../base/common/equals.js';

export class TextEdit {
	public static fromStringEdit(edit: BaseStringEdit, initialState: AbstractText): TextEdit {
		const edits = edit.replacements.map(e => TextReplacement.fromStringReplacement(e, initialState));
		return new TextEdit(edits);
	}

	public static replace(originalRange: Range, newText: string): TextEdit {
		return new TextEdit([new TextReplacement(originalRange, newText)]);
	}

	public static delete(range: Range): TextEdit {
		return new TextEdit([new TextReplacement(range, '')]);
	}

	public static insert(position: Position, newText: string): TextEdit {
		return new TextEdit([new TextReplacement(Range.fromPositions(position, position), newText)]);
	}

	public static fromParallelReplacementsUnsorted(replacements: readonly TextReplacement[]): TextEdit {
		const r = replacements.slice().sort(compareBy(i => i.range, Range.compareRangesUsingStarts));
		return new TextEdit(r);
	}

	constructor(
		public readonly replacements: readonly TextReplacement[]
	) {
		assertFn(() => checkAdjacentItems(replacements, (a, b) => a.range.getEndPosition().isBeforeOrEqual(b.range.getStartPosition())));
	}

	/**
	 * Joins touching edits and removes empty edits.
	 */
	normalize(): TextEdit {
		const replacements: TextReplacement[] = [];
		for (const r of this.replacements) {
			if (replacements.length > 0 && replacements[replacements.length - 1].range.getEndPosition().equals(r.range.getStartPosition())) {
				const last = replacements[replacements.length - 1];
				replacements[replacements.length - 1] = new TextReplacement(last.range.plusRange(r.range), last.text + r.text);
			} else if (!r.isEmpty) {
				replacements.push(r);
			}
		}
		return new TextEdit(replacements);
	}

	mapPosition(position: Position): Position | Range {
		let lineDelta = 0;
		let curLine = 0;
		let columnDeltaInCurLine = 0;

		for (const replacement of this.replacements) {
			const start = replacement.range.getStartPosition();

			if (position.isBeforeOrEqual(start)) {
				break;
			}

			const end = replacement.range.getEndPosition();
			const len = TextLength.ofText(replacement.text);
			if (position.isBefore(end)) {
				const startPos = new Position(start.lineNumber + lineDelta, start.column + (start.lineNumber + lineDelta === curLine ? columnDeltaInCurLine : 0));
				const endPos = len.addToPosition(startPos);
				return rangeFromPositions(startPos, endPos);
			}

			if (start.lineNumber + lineDelta !== curLine) {
				columnDeltaInCurLine = 0;
			}

			lineDelta += len.lineCount - (replacement.range.endLineNumber - replacement.range.startLineNumber);

			if (len.lineCount === 0) {
				if (end.lineNumber !== start.lineNumber) {
					columnDeltaInCurLine += len.columnCount - (end.column - 1);
				} else {
					columnDeltaInCurLine += len.columnCount - (end.column - start.column);
				}
			} else {
				columnDeltaInCurLine = len.columnCount;
			}
			curLine = end.lineNumber + lineDelta;
		}

		return new Position(position.lineNumber + lineDelta, position.column + (position.lineNumber + lineDelta === curLine ? columnDeltaInCurLine : 0));
	}

	mapRange(range: Range): Range {
		function getStart(p: Position | Range) {
			return p instanceof Position ? p : p.getStartPosition();
		}

		function getEnd(p: Position | Range) {
			return p instanceof Position ? p : p.getEndPosition();
		}

		const start = getStart(this.mapPosition(range.getStartPosition()));
		const end = getEnd(this.mapPosition(range.getEndPosition()));

		return rangeFromPositions(start, end);
	}

	// TODO: `doc` is not needed for this!
	inverseMapPosition(positionAfterEdit: Position, doc: AbstractText): Position | Range {
		const reversed = this.inverse(doc);
		return reversed.mapPosition(positionAfterEdit);
	}

	inverseMapRange(range: Range, doc: AbstractText): Range {
		const reversed = this.inverse(doc);
		return reversed.mapRange(range);
	}

	apply(text: AbstractText): string {
		let result = '';
		let lastEditEnd = new Position(1, 1);
		for (const replacement of this.replacements) {
			const editRange = replacement.range;
			const editStart = editRange.getStartPosition();
			const editEnd = editRange.getEndPosition();

			const r = rangeFromPositions(lastEditEnd, editStart);
			if (!r.isEmpty()) {
				result += text.getValueOfRange(r);
			}
			result += replacement.text;
			lastEditEnd = editEnd;
		}
		const r = rangeFromPositions(lastEditEnd, text.endPositionExclusive);
		if (!r.isEmpty()) {
			result += text.getValueOfRange(r);
		}
		return result;
	}

	applyToString(str: string): string {
		const strText = new StringText(str);
		return this.apply(strText);
	}

	inverse(doc: AbstractText): TextEdit {
		const ranges = this.getNewRanges();
		return new TextEdit(this.replacements.map((e, idx) => new TextReplacement(ranges[idx], doc.getValueOfRange(e.range))));
	}

	getNewRanges(): Range[] {
		const newRanges: Range[] = [];
		let previousEditEndLineNumber = 0;
		let lineOffset = 0;
		let columnOffset = 0;
		for (const replacement of this.replacements) {
			const textLength = TextLength.ofText(replacement.text);
			const newRangeStart = Position.lift({
				lineNumber: replacement.range.startLineNumber + lineOffset,
				column: replacement.range.startColumn + (replacement.range.startLineNumber === previousEditEndLineNumber ? columnOffset : 0)
			});
			const newRange = textLength.createRange(newRangeStart);
			newRanges.push(newRange);
			lineOffset = newRange.endLineNumber - replacement.range.endLineNumber;
			columnOffset = newRange.endColumn - replacement.range.endColumn;
			previousEditEndLineNumber = replacement.range.endLineNumber;
		}
		return newRanges;
	}

	toReplacement(text: AbstractText): TextReplacement {
		if (this.replacements.length === 0) { throw new BugIndicatingError(); }
		if (this.replacements.length === 1) { return this.replacements[0]; }

		const startPos = this.replacements[0].range.getStartPosition();
		const endPos = this.replacements[this.replacements.length - 1].range.getEndPosition();

		let newText = '';

		for (let i = 0; i < this.replacements.length; i++) {
			const curEdit = this.replacements[i];
			newText += curEdit.text;
			if (i < this.replacements.length - 1) {
				const nextEdit = this.replacements[i + 1];
				const gapRange = Range.fromPositions(curEdit.range.getEndPosition(), nextEdit.range.getStartPosition());
				const gapText = text.getValueOfRange(gapRange);
				newText += gapText;
			}
		}
		return new TextReplacement(Range.fromPositions(startPos, endPos), newText);
	}

	equals(other: TextEdit): boolean {
		return equals(this.replacements, other.replacements, (a, b) => a.equals(b));
	}

	/**
	 * Combines two edits into one with the same effect.
	 * WARNING: This is written by AI, but well tested. I do not understand the implementation myself.
	 *
	 * Invariant:
	 * ```
	 * other.applyToString(this.applyToString(s0)) = this.compose(other).applyToString(s0)
	 * ```
	 */
	compose(other: TextEdit): TextEdit {
		const edits1 = this.normalize();
		const edits2 = other.normalize();

		if (edits1.replacements.length === 0) { return edits2; }
		if (edits2.replacements.length === 0) { return edits1; }

		const resultReplacements: TextReplacement[] = [];

		let edit1Idx = 0;
		let lastEdit1EndS0Line = 1;
		let lastEdit1EndS0Col = 1;

		let headSrcRangeStartLine = 0;
		let headSrcRangeStartCol = 0;
		let headSrcRangeEndLine = 0;
		let headSrcRangeEndCol = 0;
		let headText: string | null = null;
		let headLengthLine = 0;
		let headLengthCol = 0;

		let headHasValue = false;
		let headIsInfinite = false;

		let currentPosInS1Line = 1;
		let currentPosInS1Col = 1;

		function ensureHead() {
			if (headHasValue) { return; }

			if (edit1Idx < edits1.replacements.length) {
				const nextEdit = edits1.replacements[edit1Idx];
				const nextEditStart = nextEdit.range.getStartPosition();

				const gapIsEmpty = (lastEdit1EndS0Line === nextEditStart.lineNumber) && (lastEdit1EndS0Col === nextEditStart.column);

				if (!gapIsEmpty) {
					headSrcRangeStartLine = lastEdit1EndS0Line;
					headSrcRangeStartCol = lastEdit1EndS0Col;
					headSrcRangeEndLine = nextEditStart.lineNumber;
					headSrcRangeEndCol = nextEditStart.column;

					headText = null;

					if (lastEdit1EndS0Line === nextEditStart.lineNumber) {
						headLengthLine = 0;
						headLengthCol = nextEditStart.column - lastEdit1EndS0Col;
					} else {
						headLengthLine = nextEditStart.lineNumber - lastEdit1EndS0Line;
						headLengthCol = nextEditStart.column - 1;
					}

					headHasValue = true;
					lastEdit1EndS0Line = nextEditStart.lineNumber;
					lastEdit1EndS0Col = nextEditStart.column;
				} else {
					const nextEditEnd = nextEdit.range.getEndPosition();
					headSrcRangeStartLine = nextEditStart.lineNumber;
					headSrcRangeStartCol = nextEditStart.column;
					headSrcRangeEndLine = nextEditEnd.lineNumber;
					headSrcRangeEndCol = nextEditEnd.column;

					headText = nextEdit.text;

					let line = 0;
					let column = 0;
					const text = nextEdit.text;
					for (let i = 0; i < text.length; i++) {
						if (text.charCodeAt(i) === 10) {
							line++;
							column = 0;
						} else {
							column++;
						}
					}
					headLengthLine = line;
					headLengthCol = column;

					headHasValue = true;
					lastEdit1EndS0Line = nextEditEnd.lineNumber;
					lastEdit1EndS0Col = nextEditEnd.column;
					edit1Idx++;
				}
			} else {
				headIsInfinite = true;
				headSrcRangeStartLine = lastEdit1EndS0Line;
				headSrcRangeStartCol = lastEdit1EndS0Col;
				headHasValue = true;
			}
		}

		function splitText(text: string, lenLine: number, lenCol: number): [string, string] {
			if (lenLine === 0 && lenCol === 0) { return ['', text]; }
			let line = 0;
			let offset = 0;
			while (line < lenLine) {
				const idx = text.indexOf('\n', offset);
				if (idx === -1) { throw new BugIndicatingError('Text length mismatch'); }
				offset = idx + 1;
				line++;
			}
			offset += lenCol;
			return [text.substring(0, offset), text.substring(offset)];
		}

		for (const r2 of edits2.replacements) {
			const r2Start = r2.range.getStartPosition();
			const r2End = r2.range.getEndPosition();

			while (true) {
				if (currentPosInS1Line === r2Start.lineNumber && currentPosInS1Col === r2Start.column) { break; }
				ensureHead();

				if (headIsInfinite) {
					let distLine: number, distCol: number;
					if (currentPosInS1Line === r2Start.lineNumber) {
						distLine = 0;
						distCol = r2Start.column - currentPosInS1Col;
					} else {
						distLine = r2Start.lineNumber - currentPosInS1Line;
						distCol = r2Start.column - 1;
					}

					currentPosInS1Line = r2Start.lineNumber;
					currentPosInS1Col = r2Start.column;

					if (distLine === 0) {
						headSrcRangeStartCol += distCol;
					} else {
						headSrcRangeStartLine += distLine;
						headSrcRangeStartCol = distCol + 1;
					}
					break;
				}

				let headEndInS1Line: number, headEndInS1Col: number;
				if (headLengthLine === 0) {
					headEndInS1Line = currentPosInS1Line;
					headEndInS1Col = currentPosInS1Col + headLengthCol;
				} else {
					headEndInS1Line = currentPosInS1Line + headLengthLine;
					headEndInS1Col = headLengthCol + 1;
				}

				let r2StartIsBeforeHeadEnd = false;
				if (r2Start.lineNumber < headEndInS1Line) {
					r2StartIsBeforeHeadEnd = true;
				} else if (r2Start.lineNumber === headEndInS1Line) {
					r2StartIsBeforeHeadEnd = r2Start.column < headEndInS1Col;
				}

				if (r2StartIsBeforeHeadEnd) {
					let splitLenLine: number, splitLenCol: number;
					if (currentPosInS1Line === r2Start.lineNumber) {
						splitLenLine = 0;
						splitLenCol = r2Start.column - currentPosInS1Col;
					} else {
						splitLenLine = r2Start.lineNumber - currentPosInS1Line;
						splitLenCol = r2Start.column - 1;
					}

					let remainingLenLine: number, remainingLenCol: number;
					if (splitLenLine === headLengthLine) {
						remainingLenLine = 0;
						remainingLenCol = headLengthCol - splitLenCol;
					} else {
						remainingLenLine = headLengthLine - splitLenLine;
						remainingLenCol = headLengthCol;
					}

					if (headText !== null) {
						const [t1, t2] = splitText(headText, splitLenLine, splitLenCol);
						resultReplacements.push(new TextReplacement(new Range(headSrcRangeStartLine, headSrcRangeStartCol, headSrcRangeEndLine, headSrcRangeEndCol), t1));

						headText = t2;
						headLengthLine = remainingLenLine;
						headLengthCol = remainingLenCol;

						headSrcRangeStartLine = headSrcRangeEndLine;
						headSrcRangeStartCol = headSrcRangeEndCol;
					} else {
						let splitPosLine: number, splitPosCol: number;
						if (splitLenLine === 0) {
							splitPosLine = headSrcRangeStartLine;
							splitPosCol = headSrcRangeStartCol + splitLenCol;
						} else {
							splitPosLine = headSrcRangeStartLine + splitLenLine;
							splitPosCol = splitLenCol + 1;
						}

						headSrcRangeStartLine = splitPosLine;
						headSrcRangeStartCol = splitPosCol;

						headLengthLine = remainingLenLine;
						headLengthCol = remainingLenCol;
					}
					currentPosInS1Line = r2Start.lineNumber;
					currentPosInS1Col = r2Start.column;
					break;
				}

				if (headText !== null) {
					resultReplacements.push(new TextReplacement(new Range(headSrcRangeStartLine, headSrcRangeStartCol, headSrcRangeEndLine, headSrcRangeEndCol), headText));
				}

				currentPosInS1Line = headEndInS1Line;
				currentPosInS1Col = headEndInS1Col;
				headHasValue = false;
			}

			let consumedStartS0Line: number | null = null;
			let consumedStartS0Col: number | null = null;
			let consumedEndS0Line: number | null = null;
			let consumedEndS0Col: number | null = null;

			while (true) {
				if (currentPosInS1Line === r2End.lineNumber && currentPosInS1Col === r2End.column) { break; }
				ensureHead();

				if (headIsInfinite) {
					let distLine: number, distCol: number;
					if (currentPosInS1Line === r2End.lineNumber) {
						distLine = 0;
						distCol = r2End.column - currentPosInS1Col;
					} else {
						distLine = r2End.lineNumber - currentPosInS1Line;
						distCol = r2End.column - 1;
					}

					let rangeInS0EndLine: number, rangeInS0EndCol: number;
					if (distLine === 0) {
						rangeInS0EndLine = headSrcRangeStartLine;
						rangeInS0EndCol = headSrcRangeStartCol + distCol;
					} else {
						rangeInS0EndLine = headSrcRangeStartLine + distLine;
						rangeInS0EndCol = distCol + 1;
					}

					if (consumedStartS0Line === null) {
						consumedStartS0Line = headSrcRangeStartLine;
						consumedStartS0Col = headSrcRangeStartCol;
					}
					consumedEndS0Line = rangeInS0EndLine;
					consumedEndS0Col = rangeInS0EndCol;

					currentPosInS1Line = r2End.lineNumber;
					currentPosInS1Col = r2End.column;

					headSrcRangeStartLine = rangeInS0EndLine;
					headSrcRangeStartCol = rangeInS0EndCol;
					break;
				}

				let headEndInS1Line: number, headEndInS1Col: number;
				if (headLengthLine === 0) {
					headEndInS1Line = currentPosInS1Line;
					headEndInS1Col = currentPosInS1Col + headLengthCol;
				} else {
					headEndInS1Line = currentPosInS1Line + headLengthLine;
					headEndInS1Col = headLengthCol + 1;
				}

				let r2EndIsBeforeHeadEnd = false;
				if (r2End.lineNumber < headEndInS1Line) {
					r2EndIsBeforeHeadEnd = true;
				} else if (r2End.lineNumber === headEndInS1Line) {
					r2EndIsBeforeHeadEnd = r2End.column < headEndInS1Col;
				}

				if (r2EndIsBeforeHeadEnd) {
					let splitLenLine: number, splitLenCol: number;
					if (currentPosInS1Line === r2End.lineNumber) {
						splitLenLine = 0;
						splitLenCol = r2End.column - currentPosInS1Col;
					} else {
						splitLenLine = r2End.lineNumber - currentPosInS1Line;
						splitLenCol = r2End.column - 1;
					}

					let remainingLenLine: number, remainingLenCol: number;
					if (splitLenLine === headLengthLine) {
						remainingLenLine = 0;
						remainingLenCol = headLengthCol - splitLenCol;
					} else {
						remainingLenLine = headLengthLine - splitLenLine;
						remainingLenCol = headLengthCol;
					}

					if (headText !== null) {
						if (consumedStartS0Line === null) {
							consumedStartS0Line = headSrcRangeStartLine;
							consumedStartS0Col = headSrcRangeStartCol;
						}
						consumedEndS0Line = headSrcRangeEndLine;
						consumedEndS0Col = headSrcRangeEndCol;

						const [, t2] = splitText(headText, splitLenLine, splitLenCol);
						headText = t2;
						headLengthLine = remainingLenLine;
						headLengthCol = remainingLenCol;

						headSrcRangeStartLine = headSrcRangeEndLine;
						headSrcRangeStartCol = headSrcRangeEndCol;
					} else {
						let splitPosLine: number, splitPosCol: number;
						if (splitLenLine === 0) {
							splitPosLine = headSrcRangeStartLine;
							splitPosCol = headSrcRangeStartCol + splitLenCol;
						} else {
							splitPosLine = headSrcRangeStartLine + splitLenLine;
							splitPosCol = splitLenCol + 1;
						}

						if (consumedStartS0Line === null) {
							consumedStartS0Line = headSrcRangeStartLine;
							consumedStartS0Col = headSrcRangeStartCol;
						}
						consumedEndS0Line = splitPosLine;
						consumedEndS0Col = splitPosCol;

						headSrcRangeStartLine = splitPosLine;
						headSrcRangeStartCol = splitPosCol;

						headLengthLine = remainingLenLine;
						headLengthCol = remainingLenCol;
					}
					currentPosInS1Line = r2End.lineNumber;
					currentPosInS1Col = r2End.column;
					break;
				}

				if (consumedStartS0Line === null) {
					consumedStartS0Line = headSrcRangeStartLine;
					consumedStartS0Col = headSrcRangeStartCol;
				}
				consumedEndS0Line = headSrcRangeEndLine;
				consumedEndS0Col = headSrcRangeEndCol;

				currentPosInS1Line = headEndInS1Line;
				currentPosInS1Col = headEndInS1Col;
				headHasValue = false;
			}

			if (consumedStartS0Line !== null) {
				resultReplacements.push(new TextReplacement(new Range(consumedStartS0Line, consumedStartS0Col!, consumedEndS0Line!, consumedEndS0Col!), r2.text));
			} else {
				ensureHead();
				const insertPosS0Line = headSrcRangeStartLine;
				const insertPosS0Col = headSrcRangeStartCol;
				resultReplacements.push(new TextReplacement(new Range(insertPosS0Line, insertPosS0Col, insertPosS0Line, insertPosS0Col), r2.text));
			}
		}

		while (true) {
			ensureHead();
			if (headIsInfinite) { break; }
			if (headText !== null) {
				resultReplacements.push(new TextReplacement(new Range(headSrcRangeStartLine, headSrcRangeStartCol, headSrcRangeEndLine, headSrcRangeEndCol), headText));
			}
			headHasValue = false;
		}

		return new TextEdit(resultReplacements).normalize();
	}

	toString(text: AbstractText | string | undefined): string {
		if (text === undefined) {
			return this.replacements.map(edit => edit.toString()).join('\n');
		}

		if (typeof text === 'string') {
			return this.toString(new StringText(text));
		}

		if (this.replacements.length === 0) {
			return '';
		}

		return this.replacements.map(r => {
			const maxLength = 10;
			const originalText = text.getValueOfRange(r.range);

			// Get text before the edit
			const beforeRange = Range.fromPositions(
				new Position(Math.max(1, r.range.startLineNumber - 1), 1),
				r.range.getStartPosition()
			);
			let beforeText = text.getValueOfRange(beforeRange);
			if (beforeText.length > maxLength) {
				beforeText = '...' + beforeText.substring(beforeText.length - maxLength);
			}

			// Get text after the edit
			const afterRange = Range.fromPositions(
				r.range.getEndPosition(),
				new Position(r.range.endLineNumber + 1, 1)
			);
			let afterText = text.getValueOfRange(afterRange);
			if (afterText.length > maxLength) {
				afterText = afterText.substring(0, maxLength) + '...';
			}

			// Format the replaced text
			let replacedText = originalText;
			if (replacedText.length > maxLength) {
				const halfMax = Math.floor(maxLength / 2);
				replacedText = replacedText.substring(0, halfMax) + '...' +
					replacedText.substring(replacedText.length - halfMax);
			}

			// Format the new text
			let newText = r.text;
			if (newText.length > maxLength) {
				const halfMax = Math.floor(maxLength / 2);
				newText = newText.substring(0, halfMax) + '...' +
					newText.substring(newText.length - halfMax);
			}

			if (replacedText.length === 0) {
				// allow-any-unicode-next-line
				return `${beforeText}❰${newText}❱${afterText}`;
			}
			// allow-any-unicode-next-line
			return `${beforeText}❰${replacedText}↦${newText}❱${afterText}`;
		}).join('\n');
	}
}

export class TextReplacement implements IEquatable<TextReplacement> {
	public static joinReplacements(replacements: TextReplacement[], initialValue: AbstractText): TextReplacement {
		if (replacements.length === 0) { throw new BugIndicatingError(); }
		if (replacements.length === 1) { return replacements[0]; }

		const startPos = replacements[0].range.getStartPosition();
		const endPos = replacements[replacements.length - 1].range.getEndPosition();

		let newText = '';

		for (let i = 0; i < replacements.length; i++) {
			const curEdit = replacements[i];
			newText += curEdit.text;
			if (i < replacements.length - 1) {
				const nextEdit = replacements[i + 1];
				const gapRange = Range.fromPositions(curEdit.range.getEndPosition(), nextEdit.range.getStartPosition());
				const gapText = initialValue.getValueOfRange(gapRange);
				newText += gapText;
			}
		}
		return new TextReplacement(Range.fromPositions(startPos, endPos), newText);
	}

	public static fromStringReplacement(replacement: StringReplacement, initialState: AbstractText): TextReplacement {
		return new TextReplacement(initialState.getTransformer().getRange(replacement.replaceRange), replacement.newText);
	}

	public static delete(range: Range): TextReplacement {
		return new TextReplacement(range, '');
	}

	constructor(
		public readonly range: Range,
		public readonly text: string,
	) {
	}

	get isEmpty(): boolean {
		return this.range.isEmpty() && this.text.length === 0;
	}

	static equals(first: TextReplacement, second: TextReplacement) {
		return first.range.equalsRange(second.range) && first.text === second.text;
	}

	public toSingleEditOperation(): ISingleEditOperation {
		return {
			range: this.range,
			text: this.text,
		};
	}

	public toEdit(): TextEdit {
		return new TextEdit([this]);
	}

	public equals(other: TextReplacement): boolean {
		return TextReplacement.equals(this, other);
	}

	public extendToCoverRange(range: Range, initialValue: AbstractText): TextReplacement {
		if (this.range.containsRange(range)) { return this; }

		const newRange = this.range.plusRange(range);
		const textBefore = initialValue.getValueOfRange(Range.fromPositions(newRange.getStartPosition(), this.range.getStartPosition()));
		const textAfter = initialValue.getValueOfRange(Range.fromPositions(this.range.getEndPosition(), newRange.getEndPosition()));
		const newText = textBefore + this.text + textAfter;
		return new TextReplacement(newRange, newText);
	}

	public extendToFullLine(initialValue: AbstractText): TextReplacement {
		const newRange = new Range(
			this.range.startLineNumber,
			1,
			this.range.endLineNumber,
			initialValue.getTransformer().getLineLength(this.range.endLineNumber) + 1
		);
		return this.extendToCoverRange(newRange, initialValue);
	}

	public removeCommonPrefixAndSuffix(text: AbstractText): TextReplacement {
		const prefix = this.removeCommonPrefix(text);
		const suffix = prefix.removeCommonSuffix(text);
		return suffix;
	}

	public removeCommonPrefix(text: AbstractText): TextReplacement {
		const normalizedOriginalText = text.getValueOfRange(this.range).replaceAll('\r\n', '\n');
		const normalizedModifiedText = this.text.replaceAll('\r\n', '\n');

		const commonPrefixLen = commonPrefixLength(normalizedOriginalText, normalizedModifiedText);
		const start = TextLength.ofText(normalizedOriginalText.substring(0, commonPrefixLen))
			.addToPosition(this.range.getStartPosition());

		const newText = normalizedModifiedText.substring(commonPrefixLen);
		const range = Range.fromPositions(start, this.range.getEndPosition());
		return new TextReplacement(range, newText);
	}

	public removeCommonSuffix(text: AbstractText): TextReplacement {
		const normalizedOriginalText = text.getValueOfRange(this.range).replaceAll('\r\n', '\n');
		const normalizedModifiedText = this.text.replaceAll('\r\n', '\n');

		const commonSuffixLen = commonSuffixLength(normalizedOriginalText, normalizedModifiedText);
		const end = TextLength.ofText(normalizedOriginalText.substring(0, normalizedOriginalText.length - commonSuffixLen))
			.addToPosition(this.range.getStartPosition());

		const newText = normalizedModifiedText.substring(0, normalizedModifiedText.length - commonSuffixLen);
		const range = Range.fromPositions(this.range.getStartPosition(), end);
		return new TextReplacement(range, newText);
	}

	public isEffectiveDeletion(text: AbstractText): boolean {
		let newText = this.text.replaceAll('\r\n', '\n');
		let existingText = text.getValueOfRange(this.range).replaceAll('\r\n', '\n');
		const l = commonPrefixLength(newText, existingText);
		newText = newText.substring(l);
		existingText = existingText.substring(l);
		const r = commonSuffixLength(newText, existingText);
		newText = newText.substring(0, newText.length - r);
		existingText = existingText.substring(0, existingText.length - r);

		return newText === '';
	}

	public toString(): string {
		const start = this.range.getStartPosition();
		const end = this.range.getEndPosition();
		return `(${start.lineNumber},${start.column} -> ${end.lineNumber},${end.column}): "${this.text}"`;
	}
}

function rangeFromPositions(start: Position, end: Position): Range {
	if (start.lineNumber === end.lineNumber && start.column === Number.MAX_SAFE_INTEGER) {
		return Range.fromPositions(end, end);
	} else if (!start.isBeforeOrEqual(end)) {
		throw new BugIndicatingError('start must be before end');
	}
	return new Range(start.lineNumber, start.column, end.lineNumber, end.column);
}
