/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRange, Range } from 'vs/editor/common/core/range';
import { Searcher } from 'vs/editor/common/model/textModelSearch';
import * as strings from 'vs/base/common/strings';

export class UnicodeTextModelHighlighter {
	public static NON_BASIC_ASCII_REGEX = '[^\\t\\n\\r\\x20-\\x7E]';

	public static computeUnicodeHighlights(model: IUnicodeCharacterSearcherTarget, options: UnicodeHighlighterOptions, range?: IRange): Range[] {
		const startLine = range ? range.startLineNumber : 1;
		const endLine = range ? range.endLineNumber : model.getLineCount();

		const codePointHighlighter = new CodePointHighlighter(options);

		// Only check for non-basic ASCII characters
		const regex = new RegExp(UnicodeTextModelHighlighter.NON_BASIC_ASCII_REGEX, 'g');
		const searcher = new Searcher(null, regex);
		const result: Range[] = [];
		let m: RegExpExecArray | null;
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
					if (codePointHighlighter.shouldHighlightNonBasicASCII(str) !== SimpleHighlightReason.None) {
						result.push(new Range(lineNumber, startIndex + 1, lineNumber, endIndex + 1));
					}
				}
			} while (m);
		}
		return result;
	}

	public static computeUnicodeHighlightReason(char: string, options: UnicodeHighlighterOptions): UnicodeHighlighterReason | null {
		const codePointHighlighter = new CodePointHighlighter(options);

		const reason = codePointHighlighter.shouldHighlightNonBasicASCII(char);
		switch (reason) {
			case SimpleHighlightReason.None:
				return null;
			case SimpleHighlightReason.Invisible:
				return { kind: UnicodeHighlighterReasonKind.Invisible };

			case SimpleHighlightReason.Ambiguous:
				const primaryConfusable = strings.AmbiguousCharacters.getPrimaryConfusable(char.codePointAt(0)!)!;
				return { kind: UnicodeHighlighterReasonKind.Ambiguous, confusableWith: String.fromCodePoint(primaryConfusable) };

			case SimpleHighlightReason.NonBasicASCII:
				return { kind: UnicodeHighlighterReasonKind.NonBasicAscii };
		}
	}
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
	allowedCodePoints: number[];
}
