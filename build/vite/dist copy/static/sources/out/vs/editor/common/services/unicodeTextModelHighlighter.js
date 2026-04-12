/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Range } from '../core/range.js';
import { Searcher } from '../model/textModelSearch.js';
import * as strings from '../../../base/common/strings.js';
import { assertNever } from '../../../base/common/assert.js';
import { DEFAULT_WORD_REGEXP, getWordAtText } from '../core/wordHelper.js';
export class UnicodeTextModelHighlighter {
    static computeUnicodeHighlights(model, options, range) {
        const startLine = range ? range.startLineNumber : 1;
        const endLine = range ? range.endLineNumber : model.getLineCount();
        const codePointHighlighter = new CodePointHighlighter(options);
        const candidates = codePointHighlighter.getCandidateCodePoints();
        let regex;
        if (candidates === 'allNonBasicAscii') {
            regex = new RegExp('[^\\t\\n\\r\\x20-\\x7E]', 'g');
        }
        else {
            regex = new RegExp(`${buildRegExpCharClassExpr(Array.from(candidates))}`, 'g');
        }
        const searcher = new Searcher(null, regex);
        const ranges = [];
        let hasMore = false;
        let m;
        let ambiguousCharacterCount = 0;
        let invisibleCharacterCount = 0;
        let nonBasicAsciiCharacterCount = 0;
        forLoop: for (let lineNumber = startLine, lineCount = endLine; lineNumber <= lineCount; lineNumber++) {
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
                    let word = getWordAtText(startIndex + 1, DEFAULT_WORD_REGEXP, lineContent, 0);
                    if (word && word.endColumn <= startIndex + 1) {
                        // The word does not include the problematic character, ignore the word
                        word = null;
                    }
                    const highlightReason = codePointHighlighter.shouldHighlightNonBasicASCII(str, word ? word.word : null);
                    if (highlightReason !== 0 /* SimpleHighlightReason.None */) {
                        if (highlightReason === 3 /* SimpleHighlightReason.Ambiguous */) {
                            ambiguousCharacterCount++;
                        }
                        else if (highlightReason === 2 /* SimpleHighlightReason.Invisible */) {
                            invisibleCharacterCount++;
                        }
                        else if (highlightReason === 1 /* SimpleHighlightReason.NonBasicASCII */) {
                            nonBasicAsciiCharacterCount++;
                        }
                        else {
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
    static computeUnicodeHighlightReason(char, options) {
        const codePointHighlighter = new CodePointHighlighter(options);
        const reason = codePointHighlighter.shouldHighlightNonBasicASCII(char, null);
        switch (reason) {
            case 0 /* SimpleHighlightReason.None */:
                return null;
            case 2 /* SimpleHighlightReason.Invisible */:
                return { kind: 1 /* UnicodeHighlighterReasonKind.Invisible */ };
            case 3 /* SimpleHighlightReason.Ambiguous */: {
                const codePoint = char.codePointAt(0);
                const primaryConfusable = codePointHighlighter.ambiguousCharacters.getPrimaryConfusable(codePoint);
                const notAmbiguousInLocales = strings.AmbiguousCharacters.getLocales().filter((l) => !strings.AmbiguousCharacters.getInstance(new Set([...options.allowedLocales, l])).isAmbiguous(codePoint));
                return { kind: 0 /* UnicodeHighlighterReasonKind.Ambiguous */, confusableWith: String.fromCodePoint(primaryConfusable), notAmbiguousInLocales };
            }
            case 1 /* SimpleHighlightReason.NonBasicASCII */:
                return { kind: 2 /* UnicodeHighlighterReasonKind.NonBasicAscii */ };
        }
    }
}
function buildRegExpCharClassExpr(codePoints, flags) {
    const src = `[${strings.escapeRegExpCharacters(codePoints.map((i) => String.fromCodePoint(i)).join(''))}]`;
    return src;
}
export var UnicodeHighlighterReasonKind;
(function (UnicodeHighlighterReasonKind) {
    UnicodeHighlighterReasonKind[UnicodeHighlighterReasonKind["Ambiguous"] = 0] = "Ambiguous";
    UnicodeHighlighterReasonKind[UnicodeHighlighterReasonKind["Invisible"] = 1] = "Invisible";
    UnicodeHighlighterReasonKind[UnicodeHighlighterReasonKind["NonBasicAscii"] = 2] = "NonBasicAscii";
})(UnicodeHighlighterReasonKind || (UnicodeHighlighterReasonKind = {}));
class CodePointHighlighter {
    constructor(options) {
        this.options = options;
        this.allowedCodePoints = new Set(options.allowedCodePoints);
        this.ambiguousCharacters = strings.AmbiguousCharacters.getInstance(new Set(options.allowedLocales));
    }
    getCandidateCodePoints() {
        if (this.options.nonBasicASCII) {
            return 'allNonBasicAscii';
        }
        const set = new Set();
        if (this.options.invisibleCharacters) {
            for (const cp of strings.InvisibleCharacters.codePoints) {
                if (!isAllowedInvisibleCharacter(String.fromCodePoint(cp))) {
                    set.add(cp);
                }
            }
        }
        if (this.options.ambiguousCharacters) {
            for (const cp of this.ambiguousCharacters.getConfusableCodePoints()) {
                set.add(cp);
            }
        }
        for (const cp of this.allowedCodePoints) {
            set.delete(cp);
        }
        return set;
    }
    shouldHighlightNonBasicASCII(character, wordContext) {
        const codePoint = character.codePointAt(0);
        if (this.allowedCodePoints.has(codePoint)) {
            return 0 /* SimpleHighlightReason.None */;
        }
        if (this.options.nonBasicASCII) {
            return 1 /* SimpleHighlightReason.NonBasicASCII */;
        }
        let hasBasicASCIICharacters = false;
        let hasNonConfusableNonBasicAsciiCharacter = false;
        if (wordContext) {
            for (const char of wordContext) {
                const codePoint = char.codePointAt(0);
                const isBasicASCII = strings.isBasicASCII(char);
                hasBasicASCIICharacters = hasBasicASCIICharacters || isBasicASCII;
                if (!isBasicASCII &&
                    !this.ambiguousCharacters.isAmbiguous(codePoint) &&
                    !strings.InvisibleCharacters.isInvisibleCharacter(codePoint)) {
                    hasNonConfusableNonBasicAsciiCharacter = true;
                }
            }
        }
        if (
        /* Don't allow mixing weird looking characters with ASCII */ !hasBasicASCIICharacters &&
            /* Is there an obviously weird looking character? */ hasNonConfusableNonBasicAsciiCharacter) {
            return 0 /* SimpleHighlightReason.None */;
        }
        if (this.options.invisibleCharacters) {
            // TODO check for emojis
            if (!isAllowedInvisibleCharacter(character) && strings.InvisibleCharacters.isInvisibleCharacter(codePoint)) {
                return 2 /* SimpleHighlightReason.Invisible */;
            }
        }
        if (this.options.ambiguousCharacters) {
            if (this.ambiguousCharacters.isAmbiguous(codePoint)) {
                return 3 /* SimpleHighlightReason.Ambiguous */;
            }
        }
        return 0 /* SimpleHighlightReason.None */;
    }
}
function isAllowedInvisibleCharacter(character) {
    return character === ' ' || character === '\n' || character === '\t';
}
var SimpleHighlightReason;
(function (SimpleHighlightReason) {
    SimpleHighlightReason[SimpleHighlightReason["None"] = 0] = "None";
    SimpleHighlightReason[SimpleHighlightReason["NonBasicASCII"] = 1] = "NonBasicASCII";
    SimpleHighlightReason[SimpleHighlightReason["Invisible"] = 2] = "Invisible";
    SimpleHighlightReason[SimpleHighlightReason["Ambiguous"] = 3] = "Ambiguous";
})(SimpleHighlightReason || (SimpleHighlightReason = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidW5pY29kZVRleHRNb2RlbEhpZ2hsaWdodGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy91bmljb2RlVGV4dE1vZGVsSGlnaGxpZ2h0ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFVLEtBQUssRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBQ2pELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUN2RCxPQUFPLEtBQUssT0FBTyxNQUFNLGlDQUFpQyxDQUFDO0FBRTNELE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsYUFBYSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFFM0UsTUFBTSxPQUFPLDJCQUEyQjtJQUNoQyxNQUFNLENBQUMsd0JBQXdCLENBQUMsS0FBc0MsRUFBRSxPQUFrQyxFQUFFLEtBQWM7UUFDaEksTUFBTSxTQUFTLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDcEQsTUFBTSxPQUFPLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsWUFBWSxFQUFFLENBQUM7UUFFbkUsTUFBTSxvQkFBb0IsR0FBRyxJQUFJLG9CQUFvQixDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBRS9ELE1BQU0sVUFBVSxHQUFHLG9CQUFvQixDQUFDLHNCQUFzQixFQUFFLENBQUM7UUFDakUsSUFBSSxLQUFhLENBQUM7UUFDbEIsSUFBSSxVQUFVLEtBQUssa0JBQWtCLEVBQUUsQ0FBQztZQUN2QyxLQUFLLEdBQUcsSUFBSSxNQUFNLENBQUMseUJBQXlCLEVBQUUs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