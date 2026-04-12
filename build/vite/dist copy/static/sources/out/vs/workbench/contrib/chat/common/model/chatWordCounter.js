/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as markedKatexExtension from '../../../markdown/common/markedKatexExtension.js';
const r = String.raw;
/**
 * Matches `[text](link title?)` or `[text](<link> title?)`
 *
 * Taken from vscode-markdown-languageservice
 */
const linkPattern = r `(?<!\\)` + // Must not start with escape
    // text
    r `(!?\[` + // open prefix match -->
    /**/ r `(?:` +
    /*****/ r `[^\[\]\\]|` + // Non-bracket chars, or...
    /*****/ r `\\.|` + // Escaped char, or...
    /*****/ r `\[[^\[\]]*\]` + // Matched bracket pair
    /**/ r `)*` +
    r `\])` + // <-- close prefix match
    // Destination
    r `(\(\s*)` + // Pre href
    /**/ r `(` +
    /*****/ r `[^\s\(\)<](?:[^\s\(\)]|\([^\s\(\)]*?\))*|` + // Link without whitespace, or...
    /*****/ r `<(?:\\[<>]|[^<>])+>` + // In angle brackets
    /**/ r `)` +
    // Title
    /**/ r `\s*(?:"[^"]*"|'[^']*'|\([^\(\)]*\))?\s*` +
    r `\)`;
export function getNWords(str, numWordsToCount) {
    // This regex matches each word and skips over whitespace and separators. A word is:
    // A markdown link
    // Inline math
    // One chinese character
    // One or more + - =, handled so that code like "a=1+2-3" is broken up better
    // One or more characters that aren't whitepace or any of the above
    const backtick = '`';
    const wordRegExp = new RegExp('(?:' + linkPattern + ')|(?:' + markedKatexExtension.mathInlineRegExp.source + r `)|\p{sc=Han}|=+|\++|-+|[^\s\|\p{sc=Han}|=|\+|\-|${backtick}]+`, 'gu');
    const allWordMatches = Array.from(str.matchAll(wordRegExp));
    const targetWords = allWordMatches.slice(0, numWordsToCount);
    const endIndex = numWordsToCount >= allWordMatches.length
        ? str.length // Reached end of string
        : targetWords.length ? targetWords.at(-1).index + targetWords.at(-1)[0].length : 0;
    const value = str.substring(0, endIndex);
    return {
        value,
        returnedWordCount: targetWords.length === 0 ? (value.length ? 1 : 0) : targetWords.length,
        isFullString: endIndex >= str.length,
        totalWordCount: allWordMatches.length
    };
}
export function countWords(str) {
    const result = getNWords(str, Number.MAX_SAFE_INTEGER);
    return result.returnedWordCount;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFdvcmRDb3VudGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vbW9kZWwvY2hhdFdvcmRDb3VudGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxvQkFBb0IsTUFBTSxrREFBa0QsQ0FBQztBQVN6RixNQUFNLENBQUMsR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDO0FBRXJCOzs7O0dBSUc7QUFDSCxNQUFNLFdBQVcsR0FDaEIsQ0FBQyxDQUFBLFNBQVMsR0FBRyw2QkFBNkI7SUFFMUMsT0FBTztJQUNQLENBQUMsQ0FBQSxPQUFPLEdBQUcsd0JBQXdCO0lBQ25DLElBQUksQ0FBQSxDQUFDLENBQUEsS0FBSztJQUNWLE9BQU8sQ0FBQSxDQUFDLENBQUEsWUFBWSxHQUFHLDJCQUEyQjtJQUNsRCxPQUFPLENBQUEsQ0FBQyxDQUFBLE1BQU0sR0FBRyxzQkFBc0I7SUFDdkMsT0FBTyxDQUFBLENBQUMsQ0FBQSxjQUFjLEdBQUcsdUJBQXVCO0lBQ2hELElBQUksQ0FBQSxDQUFDLENBQUEsSUFBSTtJQUNULENBQUMsQ0FBQSxLQUFLLEdBQUcseUJBQXlCO0lBRWxDLGNBQWM7SUFDZCxDQUFDLENBQUEsU0FBUyxHQUFHLFdBQVc7SUFDeEIsSUFBSSxDQUFBLENBQUMsQ0FBQSxHQUFHO0lBQ1IsT0FBTyxDQUFBLENBQUMsQ0FBQSwyQ0FBMkMsR0FBRyxpQ0FBaUM7SUFDdkYsT0FBTyxDQUFBLENBQUMsQ0FBQSxxQkFBcUIsR0FBRyxvQkFBb0I7SUFDcEQsSUFBSSxDQUFBLENBQUMsQ0FBQSxHQUFHO0lBRVIsUUFBUTtJQUNSLElBQUksQ0FBQSxDQUFDLENBQUEseUNBQXlDO0lBQzlDLENBQUMsQ0FBQSxJQUFJLENBQUM7QUFFUCxNQUFNLFVBQVUsU0FBUyxDQUFDLEdBQVcsRUFBRSxlQUF1QjtJQUM3RCxvRkFBb0Y7SUFDcEYsa0JBQWtCO0lBQ2xCLGNBQWM7SUFDZCx3QkFBd0I7SUFDeEIsNkVBQTZFO0lBQzdFLG1FQUFtRTtJQUNuRSxNQUFNLFFBQVEsR0FBRyxHQUFHLENBQUM7SUFFckIsTUFBTSxVQUFVLEdBQUcsSUFBSSxNQUFNLENBQUMsS0FBSyxHQUFHLFdBQVcsR0FBRyxPQUFPLEdBQUcsb0JBQW9CLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQSxtREFBbUQsUUFBUSxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDckwsTUFBTSxjQUFjLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7SUFFNUQsTUFBTSxXQUFXLEdBQUcsY0FBYyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsZUFBZSxDQUFDLENBQUM7SUFFN0QsTUFBTSxRQUFRLEdBQUcsZUFBZSxJQUFJLGNBQWMsQ0FBQyxNQUFNO1FBQ3hELENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLHdCQUF3QjtRQUNyQyxDQUFDLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBRSxDQUFDLEtBQUssR0FBRyxXQUFXLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFdEYsTUFBTSxLQUFLLEdBQUcsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDekMsT0FBTztRQUNOLEtBQUs7UUFDTCxpQkFBaUIsRUFBRSxXQUFXLENBQUMsTUFBTSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsTUFBTTtRQUN6RixZQUFZLEVBQUUsUUFBUSxJQUFJLEdBQUcsQ0FBQyxNQUFNO1FBQ3BDLGNBQWMsRUFBRSxjQUFjLENBQUMsTUFBTTtLQUNyQyxDQUFDO0FBQ0gsQ0FBQztBQUVELE1BQU0sVUFBVSxVQUFVLENBQUMsR0FBVztJQUNyQyxNQUFNLE1BQU0sR0FBRyxTQUFTLENBQUMsR0FBRyxFQUFFLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO0lBQ3ZELE9BQU8sTUFBTSxDQUFDLGlCQUFpQixDQUFDO0FBQ2pDLENBQUMifQ==