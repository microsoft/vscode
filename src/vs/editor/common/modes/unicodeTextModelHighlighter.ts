/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRange, Range } from 'vs/editor/common/core/range';
import { Searcher } from 'vs/editor/common/model/textModelSearch';
import * as strings from 'vs/base/common/strings';
import { IUnicodeHighlightsResult } from 'vs/editor/common/services/editorWorkerService';
import { assertNever } from 'vs/base/common/types';

export class UnicodeTextModelHighlighter {
	public static computeUnicodeHighlights(model: IUnicodeCharacterSearcherTarget, options: UnicodeHighlighterOptions, range?: IRange): IUnicodeHighlightsResult {
		const startLine = range ? range.startLineNumber : 1;
		const endLine = range ? range.endLineNumber : model.getLineCount();

		const codePointHighlighter = new CodePointHighlighter(options);

		const candidates = codePointHighlighter.getCandidateCodePoints();
		let regex: RegExp;
		if (candidates === 'allNonBasicAscii') {
			regex = new RegExp('[^\\t\\n\\r\\x20-\\x7E]', 'g');
		} else {
			regex = new RegExp(`${buildRegExpCharClassExpr(Array.from(candidates))}`, 'g');
		}

		const searcher = new Searcher(null, regex);
		const ranges: Range[] = [];
		let hasMore = false;
		let m: RegExpExecArray | null;

		let ambiguousCharacterCount = 0;
		let invisibleCharacterCount = 0;
		let nonBasicAsciiCharacterCount = 0;

		forLoop:
		for (let lineNumber = startLine, lineCount = endLine; lineNumber <= lineCount; lineNumber++) {
			const lineContent = model.getLineContent(lineNumber);
			const lineLength = lineContent.length;

			// Reset regex to search from the beginning
			searcher.reset(0);
			do {
				m = searcher.next(lineContent);
				if (m) {
					let startIndex = m.index;
					let endIndex = m.index + m[0].length;

					// Extend range to entire code point
					if (startIndex > 0) {
						const charCodeBefore = lineContent.charCodeAt(startIndex - 1);
						if (strings.isHighSurrogate(charCodeBefore)) {
							startIndex--;
						}
					}
					if (endIndex + 1 < lineLength) {
						const charCodeBefore = lineContent.charCodeAt(endIndex - 1);
						if (strings.isHighSurrogate(charCodeBefore)) {
							endIndex++;
						}
					}
					const str = lineContent.substring(startIndex, endIndex);
					const highlightReason = codePointHighlighter.shouldHighlightNonBasicASCII(str);

					if (highlightReason !== SimpleHighlightReason.None) {
						if (highlightReason === SimpleHighlightReason.Ambiguous) {
							ambiguousCharacterCount++;
						} else if (highlightReason === SimpleHighlightReason.Invisible) {
							invisibleCharacterCount++;
						} else if (highlightReason === SimpleHighlightReason.NonBasicASCII) {
							nonBasicAsciiCharacterCount++;
						} else {
							assertNever(highlightReason);
						}

						const MAX_RESULT_LENGTH = 1000;
						if (ranges.length >= MAX_RESULT_LENGTH) {
							hasMore = true;
							break forLoop;
						}

						ranges.push(new Range(lineNumber, startIndex + 1, lineNumber, endIndex + 1));
					}
				}
			} while (m);
		}
		return {
			ranges,
			hasMore,
			ambiguousCharacterCount,
			invisibleCharacterCount,
			nonBasicAsciiCharacterCount
		};
	}

	public static computeUnicodeHighlightReason(char: string, options: UnicodeHighlighterOptions): UnicodeHighlighterReason | null {
		const codePointHighlighter = new CodePointHighlighter(options);

		const reason = codePointHighlighter.shouldHighlightNonBasicASCII(char);
		switch (reason) {
			case SimpleHighlightReason.None:
				return null;
			case SimpleHighlightReason.Invisible:
				return { kind: UnicodeHighlighterReasonKind.Invisible };

			case SimpleHighlightReason.Ambiguous: {
				const primaryConfusable = strings.AmbiguousCharacters.getPrimaryConfusable(char.codePointAt(0)!)!;
				return { kind: UnicodeHighlighterReasonKind.Ambiguous, confusableWith: String.fromCodePoint(primaryConfusable) };
			}
			case SimpleHighlightReason.NonBasicASCII:
				return { kind: UnicodeHighlighterReasonKind.NonBasicAscii };
		}
	}
}

function buildRegExpCharClassExpr(codePoints: number[], flags?: string): string {
	const src = `[${strings.escapeRegExpCharacters(
		codePoints.map((i) => String.fromCodePoint(i)).join('')
	)}]`;
	return src;
}

export const enum UnicodeHighlighterReasonKind {
	Ambiguous, Invisible, NonBasicAscii
}

export type UnicodeHighlighterReason = {
	kind: UnicodeHighlighterReasonKind.Ambiguous;
	confusableWith: string;
} | {
	kind: UnicodeHighlighterReasonKind.Invisible;
} | {
	kind: UnicodeHighlighterReasonKind.NonBasicAscii
};

class CodePointHighlighter {
	private readonly allowedCodePoints: Set<number>;
	constructor(private readonly options: UnicodeHighlighterOptions) {
		this.allowedCodePoints = new Set(options.allowedCodePoints);
	}

	public getCandidateCodePoints(): Set<number> | 'allNonBasicAscii' {
		if (this.options.nonBasicASCII) {
			return 'allNonBasicAscii';
		}

		const set = new Set<number>();

		if (this.options.invisibleCharacters) {
			for (const cp of strings.InvisibleCharacters.codePoints) {
				set.add(cp);
			}
		}

		if (this.options.ambiguousCharacters) {
			for (const cp of strings.AmbiguousCharacters.getPrimaryConfusableCodePoints()) {
				set.add(cp);
			}
		}

		for (const cp of this.allowedCodePoints) {
			set.delete(cp);
		}

		return set;
	}

	public shouldHighlightNonBasicASCII(character: string): SimpleHighlightReason {
		const codePoint = character.codePointAt(0)!;

		if (this.allowedCodePoints.has(codePoint)) {
			return SimpleHighlightReason.None;
		}

		if (this.options.nonBasicASCII) {
			return SimpleHighlightReason.NonBasicASCII;
		}

		if (this.options.invisibleCharacters) {
			const isAllowedInvisibleCharacter = character === ' ' || character === '\n' || character === '\t';
			// TODO check for emojis
			if (!isAllowedInvisibleCharacter && strings.InvisibleCharacters.isInvisibleCharacter(codePoint)) {
				return SimpleHighlightReason.Invisible;
			}
		}

		if (this.options.ambiguousCharacters) {
			if (strings.AmbiguousCharacters.isAmbiguous(codePoint)) {
				return SimpleHighlightReason.Ambiguous;
			}
		}

		return SimpleHighlightReason.None;
	}
}

const enum SimpleHighlightReason {
	None,
	NonBasicASCII,
	Invisible,
	Ambiguous
}

export interface IUnicodeCharacterSearcherTarget {
	getLineCount(): number;
	getLineContent(lineNumber: number): string;
}

export interface UnicodeHighlighterOptions {
	nonBasicASCII: boolean;
	ambiguousCharacters: boolean;
	invisibleCharacters: boolean;
	includeComments: boolean;
	includeStrings: boolean;
	allowedCodePoints: number[];
}
