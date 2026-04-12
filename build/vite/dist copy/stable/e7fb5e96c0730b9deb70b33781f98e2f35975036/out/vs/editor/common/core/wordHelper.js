/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Iterable } from '../../../base/common/iterator.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { LinkedList } from '../../../base/common/linkedList.js';
export const USUAL_WORD_SEPARATORS = '`~!@#$%^&*()-=+[{]}\\|;:\'",.<>/?';
/**
 * Create a word definition regular expression based on default word separators.
 * Optionally provide allowed separators that should be included in words.
 *
 * The default would look like this:
 * /(-?\d*\.\d\w*)|([^\`\~\!\@\#\$\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g
 */
function createWordRegExp(allowInWords = '') {
    let source = '(-?\\d*\\.\\d\\w*)|([^';
    for (const sep of USUAL_WORD_SEPARATORS) {
        if (allowInWords.indexOf(sep) >= 0) {
            continue;
        }
        source += '\\' + sep;
    }
    source += '\\s]+)';
    return new RegExp(source, 'g');
}
// catches numbers (including floating numbers) in the first group, and alphanum in the second
export const DEFAULT_WORD_REGEXP = createWordRegExp();
export function ensureValidWordDefinition(wordDefinition) {
    let result = DEFAULT_WORD_REGEXP;
    if (wordDefinition && (wordDefinition instanceof RegExp)) {
        if (!wordDefinition.global) {
            let flags = 'g';
            if (wordDefinition.ignoreCase) {
                flags += 'i';
            }
            if (wordDefinition.multiline) {
                flags += 'm';
            }
            if (wordDefinition.unicode) {
                flags += 'u';
            }
            result = new RegExp(wordDefinition.source, flags);
        }
        else {
            result = wordDefinition;
        }
    }
    result.lastIndex = 0;
    return result;
}
const _defaultConfig = new LinkedList();
_defaultConfig.unshift({
    maxLen: 1000,
    windowSize: 15,
    timeBudget: 150
});
export function setDefaultGetWordAtTextConfig(value) {
    const rm = _defaultConfig.unshift(value);
    return toDisposable(rm);
}
export function getWordAtText(column, wordDefinition, text, textOffset, config) {
    // Ensure the regex has the 'g' flag, otherwise this will loop forever
    wordDefinition = ensureValidWordDefinition(wordDefinition);
    if (!config) {
        config = Iterable.first(_defaultConfig);
    }
    if (text.length > config.maxLen) {
        // don't throw strings that long at the regexp
        // but use a sub-string in which a word must occur
        let start = column - config.maxLen / 2;
        if (start < 0) {
            start = 0;
        }
        else {
            textOffset += start;
        }
        text = text.substring(start, column + config.maxLen / 2);
        return getWordAtText(column, wordDefinition, text, textOffset, config);
    }
    const t1 = Date.now();
    const pos = column - 1 - textOffset;
    let prevRegexIndex = -1;
    let match = null;
    for (let i = 1;; i++) {
        // check time budget
        if (Date.now() - t1 >= config.timeBudget) {
            break;
        }
        // reset the index at which the regexp should start matching, also know where it
        // should stop so that subsequent search don't repeat previous searches
        const regexIndex = pos - config.windowSize * i;
        wordDefinition.lastIndex = Math.max(0, regexIndex);
        const thisMatch = _findRegexMatchEnclosingPosition(wordDefinition, text, pos, prevRegexIndex);
        if (!thisMatch && match) {
            // stop: we have something
            break;
        }
        match = thisMatch;
        // stop: searched at start
        if (regexIndex <= 0) {
            break;
        }
        prevRegexIndex = regexIndex;
    }
    if (match) {
        const result = {
            word: match[0],
            startColumn: textOffset + 1 + match.index,
            endColumn: textOffset + 1 + match.index + match[0].length
        };
        wordDefinition.lastIndex = 0;
        return result;
    }
    return null;
}
function _findRegexMatchEnclosingPosition(wordDefinition, text, pos, stopPos) {
    let match;
    while (match = wordDefinition.exec(text)) {
        const matchIndex = match.index || 0;
        if (matchIndex <= pos && wordDefinition.lastIndex >= pos) {
            return match;
        }
        else if (stopPos > 0 && matchIndex > stopPos) {
            return null;
        }
    }
    return null;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29yZEhlbHBlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb21tb24vY29yZS93b3JkSGVscGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUM1RCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDakUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBRWhFLE1BQU0sQ0FBQyxNQUFNLHFCQUFxQixHQUFHLG1DQUFtQyxDQUFDO0FBb0J6RTs7Ozs7O0dBTUc7QUFDSCxTQUFTLGdCQUFnQixDQUFDLGVBQXVCLEVBQUU7SUFDbEQsSUFBSSxNQUFNLEdBQUcsd0JBQXdCLENBQUM7SUFDdEMsS0FBSyxNQUFNLEdBQUcsSUFBSSxxQkFBcUIsRUFBRSxDQUFDO1FBQ3pDLElBQUksWUFBWSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUNwQyxTQUFTO1FBQ1YsQ0FBQztRQUNELE1BQU0sSUFBSSxJQUFJLEdBQUcsR0FBRyxDQUFDO0lBQ3RCLENBQUM7SUFDRCxNQUFNLElBQUksUUFBUSxDQUFDO0lBQ25CLE9BQU8sSUFBSSxNQUFNLENBQUMsTUFBTSxFQUFFLEdBQUcsQ0FBQyxDQUFDO0FBQ2hDLENBQUM7QUFFRCw4RkFBOEY7QUFDOUYsTUFBTSxDQUFDLE1BQU0sbUJBQW1CLEdBQUcsZ0JBQWdCLEVBQUUsQ0FBQztBQUV0RCxNQUFNLFVBQVUseUJBQXlCLENBQUMsY0FBOEI7SUFDdkUsSUFBSSxNQUFNLEdBQVcsbUJBQW1CLENBQUM7SUFFekMsSUFBSSxjQUFjLElBQUksQ0FBQyxjQUFjLFlBQVksTUFBTSxDQUFDLEVBQUUsQ0FBQztRQUMxRCxJQUFJLENBQUMsY0FBYyxD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