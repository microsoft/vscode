/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { LRUCache } from './map.js';
import { getKoreanAltChars } from './naturalLanguage/korean.js';
import { tryNormalizeToBase } from './normalization.js';
import * as strings from './strings.js';
// Combined filters
/**
 * @returns A filter which combines the provided set
 * of filters with an or. The *first* filters that
 * matches defined the return value of the returned
 * filter.
 */
export function or(...filter) {
    return function (word, wordToMatchAgainst) {
        for (let i = 0, len = filter.length; i < len; i++) {
            const match = filter[i](word, wordToMatchAgainst);
            if (match) {
                return match;
            }
        }
        return null;
    };
}
// Prefix
export const matchesStrictPrefix = _matchesPrefix.bind(undefined, false);
export const matchesPrefix = _matchesPrefix.bind(undefined, true);
function _matchesPrefix(ignoreCase, word, wordToMatchAgainst) {
    if (!wordToMatchAgainst || wordToMatchAgainst.length < word.length) {
        return null;
    }
    let matches;
    if (ignoreCase) {
        matches = strings.startsWithIgnoreCase(wordToMatchAgainst, word);
    }
    else {
        matches = wordToMatchAgainst.indexOf(word) === 0;
    }
    if (!matches) {
        return null;
    }
    return word.length > 0 ? [{ start: 0, end: word.length }] : [];
}
// Contiguous Substring
export function matchesContiguousSubString(word, wordToMatchAgainst) {
    if (word.length > wordToMatchAgainst.length) {
        return null;
    }
    const index = wordToMatchAgainst.toLowerCase().indexOf(word.toLowerCase());
    if (index === -1) {
        return null;
    }
    return [{ start: index, end: index + word.length }];
}
export function matchesBaseContiguousSubString(word, wordToMatchAgainst) {
    if (word.length > wordToMatchAgainst.length) {
        return null;
    }
    word = tryNormalizeToBase(word);
    wordToMatchAgainst = tryNormalizeToBase(wordToMatchAgainst);
    const index = wordToMatchAgainst.indexOf(word);
    if (index === -1) {
        return null;
    }
    return [{ start: index, end: index + word.length }];
}
// Substring
export function matchesSubString(word, wordToMatchAgainst) {
    if (word.length > wordToMatchAgainst.length) {
        return null;
    }
    return _matchesSubString(word.toLowerCase(), wordToMatchAgainst.toLowerCase(), 0, 0);
}
function _matchesSubString(word, wordToMatchAgainst, i, j) {
    if (i === word.length) {
        return [];
    }
    else if (j === wordToMatchAgainst.length) {
        return null;
    }
    else {
        if (word[i] === wordToMatchAgainst[j]) {
            let result = null;
            if (result = _matchesSubString(word, wordToMatchAgainst, i + 1, j + 1)) {
                return join({ start: j, end: j + 1 }, result);
            }
            return null;
        }
        return _matchesSubString(word, wordToMatchAgainst, i, j + 1);
    }
}
// CamelCase
function isLower(code) {
    return 97 /* CharCode.a */ <= code && code <= 122 /* CharCode.z */;
}
export function isUpper(code) {
    return 65 /* CharCode.A */ <= code && code <= 90 /* CharCode.Z */;
}
function isNumber(code) {
    return 48 /* CharCode.Digit0 */ <= code && code <= 57 /* CharCode.Digit9 */;
}
function isWhitespace(code) {
    return (code === 32 /* CharCode.Space */
        || code === 9 /* CharCode.Tab */
        || code === 10 /* CharCode.LineFeed */
        || code === 13 /* CharCode.CarriageReturn */);
}
const wordSeparators = new Set();
// These are chosen as natural word separators based on written text.
// It is a subset of the word separators used by the monaco editor.
'()[]{}<>`\'"-/;:,.?!'
    .split('')
    .forEach(s => wordSeparators.add(s.charCodeAt(0)));
function isWordSeparator(code) {
    return isWhitespace(code) || wordSeparators.has(code);
}
function charactersMatch(codeA, codeB) {
    return (codeA === codeB) || (isWordSeparator(codeA) && isWordSeparator(codeB));
}
const alternateCharsCache = new Map();
/**
 * Gets alternative codes to the character code passed in. This comes in the
 * form of an array of character codes, all of which must match _in order_ to
 * successfully match.
 *
 * @param code The character code to check.
 */
function getAlternateCodes(code) {
    if (alternateCharsCache.has(code)) {
        return alternateCharsCache.get(code);
    }
    // NOTE: This function is written in such a way that it can be extended in
    // the future, but right now the return type takes into account it's only
    // supported by a single "alt codes provider".
    // `ArrayLike<ArrayLike<number>>` is a more appropriate type if changed.
    let result;
    const codes = getKoreanAltChars(code);
    if (codes) {
        result = codes;
    }
    alternateCharsCache.set(code, result);
    return result;
}
function isAlphanumeric(code) {
    return isLower(code) || isUpper(code) || isNumber(code);
}
function join(head, tail) {
    if (tail.length === 0) {
        tail = [head];
    }
    else if (head.end === tail[0].start) {
        tail[0].start = head.start;
    }
    else {
        tail.unshift(head);
    }
    return tail;
}
function nextAnchor(camelCaseWord, start) {
    for (let i = start; i < camelCaseWord.length; i++) {
        const c = camelCaseWord.charCodeAt(i);
        if (isUpper(c) || isNumber(c) || (i > 0 && !isAlphanumeric(camelCaseWord.charCodeAt(i - 1)))) {
            return i;
        }
    }
    return camelCaseWord.length;
}
function _matchesCamelCase(word, camelCaseWord, i, j) {
    if (i === word.length) {
        return [];
    }
    else if (j === camelCaseWord.length) {
        return null;
    }
    else if (word[i] !== camelCaseWord[j].toLowerCase()) {
        return null;
    }
    else {
        let result = null;
        let nextUpperIndex = j + 1;
        result = _matchesCamelCase(word, camelCaseWord, i + 1, j + 1);
        while (!result && (nextUpperIndex = nextAnchor(camelCaseWord, nextUpperIndex)) < camelCaseWord.length) {
            result = _matchesCamelCase(word, camelCaseWord, i + 1, nextUpperIndex);
            nextUpperIndex++;
        }
        return result === null ? null : join({ start: j, end: j + 1 }, result);
    }
}
// Heuristic to avoid computing camel case matcher for words that don't
// look like camelCaseWords.
function analyzeCamelCaseWord(word) {
    let upper = 0, lower = 0, alpha = 0, numeric = 0, code = 0;
    for (let i = 0; i < word.length; i++) {
        code = word.charCodeAt(i);
        if (isUpper(code)) {
            upper++;
        }
        if (isLower(code)) {
            lower++;
        }
        if (isAlphanumeric(code)) {
            alpha++;
        }
        if (isNumber(code)) {
            numeric++;
        }
    }
    const upperPercent = upper / word.length;
    const lowerPercent = lower / word.length;
    const alphaPercent = alpha / word.length;
    const numericPercent = numeric / word.length;
    return { upperPercent, lowerPercent, alphaPercent, numericPercent };
}
function isUpperCaseWord(analysis) {
    const { upperPercent, lowerPercent } = analysis;
    return lowerPercent === 0 && upperPercent > 0.6;
}
function isCamelCaseWord(analysis) {
    const { upperPercent, lowerPercent, alphaPercent, numericPercent } = analysis;
    return lowerPercent > 0.2 && upperPercent < 0.8 && alphaPercent > 0.6 && numericPercent < 0.2;
}
// Heuristic to avoid computing camel case matcher for words that don't
// look like camel case patterns.
function isCamelCasePattern(word) {
    let upper = 0, lower = 0, code = 0, whitespace = 0;
    for (let i = 0; i < word.length; i++) {
        code = word.charCodeAt(i);
        if (isUpper(code)) {
            upper++;
        }
        if (isLower(code)) {
            lower++;
        }
        if (isWhitespace(code)) {
            whitespace++;
        }
    }
    if ((upper === 0 || lower === 0) && whitespace === 0) {
        return word.length <= 30;
    }
    else {
        return upper <= 5;
    }
}
export function matchesCamelCase(word, camelCaseWord) {
    if (!camelCaseWord) {
        return null;
    }
    camelCaseWord = camelCaseWord.trim();
    if (camelCaseWord.length === 0) {
        return null;
    }
    if (!isCamelCasePattern(word)) {
        return null;
    }
    // TODO: Consider removing this check
    if (camelCaseWord.length > 60) {
        camelCaseWord = camelCaseWord.substring(0, 60);
    }
    const analysis = analyzeCamelCaseWord(camelCaseWord);
    if (!isCamelCaseWord(analysis)) {
        if (!isUpperCaseWord(analysis)) {
            return null;
        }
        camelCaseWord = camelCaseWord.toLowerCase();
    }
    let result = null;
    let i = 0;
    word = word.toLowerCase();
    while (i < camelCaseWord.length && (result = _matchesCamelCase(word, camelCaseWord, 0, i)) === null) {
        i = nextAnchor(camelCaseWord, i + 1);
    }
    return result;
}
// Matches beginning of words supporting non-ASCII languages
// If `contiguous` is true then matches word with beginnings of the words in the target. E.g. "pul" will match "Git: Pull"
// Otherwise also matches sub string of the word with beginnings of the words in the target. E.g. "gp" or "g p" will match "Git: Pull"
// Useful in cases where the target is words (e.g. command labels)
export function matchesWords(word, target, contiguous = false) {
    if (!target || target.length === 0) {
        return null;
    }
    let result = null;
    let targetIndex = 0;
    word = tryNormalizeToBase(word);
    target = tryNormalizeToBase(target);
    while (targetIndex < target.length) {
        result = _matchesWords(word, target, 0, targetIndex, contiguous);
        if (result !== null) {
            break;
        }
        targetIndex = nextWord(target, targetIndex + 1);
    }
    return result;
}
function _matchesWords(word, target, wordIndex, targetIndex, contiguous) {
    let targetIndexOffset = 0;
    if (wordIndex === word.length) {
        return [];
    }
    else if (targetIndex === target.length) {
        return null;
    }
    else if (!charactersMatch(word.charCodeAt(wordIndex), target.charCodeAt(targetIndex))) {
        // Verify alternate characters before exiting
        const altChars = getAlternateCodes(word.charCodeAt(wordIndex));
        if (!altChars) {
            return null;
        }
        for (let k = 0; k < altChars.length; k++) {
            if (!charactersMatch(altChars[k], target.charCodeAt(targetIndex + k))) {
                return null;
            }
        }
        targetIndexOffset += altChars.length - 1;
    }
    let result = null;
    let nextWordIndex = targetIndex + targetIndexOffset + 1;
    result = _matchesWords(word, target, wordIndex + 1, nextWordIndex, contiguous);
    if (!contiguous) {
        while (!result && (nextWordIndex = nextWord(target, nextWordIndex)) < target.length) {
            result = _matchesWords(word, target, wordIndex + 1, nextWordIndex, contiguous);
            nextWordIndex++;
        }
    }
    if (!result) {
        return null;
    }
    // If the characters don't exactly match, then they must be word separators (see charactersMatch(...)).
    // We don't want to include this in the matches but we don't want to throw the target out all together so we return `result`.
    if (word.charCodeAt(wordIndex) !== target.charCodeAt(targetIndex)) {
        // Verify alternate characters before exiting
        const altChars = getAlternateCodes(word.charCodeAt(wordIndex));
        if (!altChars) {
            return result;
        }
        for (let k = 0; k < altChars.length; k++) {
            if (altChars[k] !== target.charCodeAt(targetIndex + k)) {
                return result;
            }
        }
    }
    return join({ start: targetIndex, end: targetIndex + targetIndexOffset + 1 }, result);
}
function nextWord(word, start) {
    for (let i = start; i < word.length; i++) {
        if (isWordSeparator(word.charCodeAt(i)) ||
            (i > 0 && isWordSeparator(word.charCodeAt(i - 1)))) {
            return i;
        }
    }
    return word.length;
}
// Fuzzy
const fuzzyContiguousFilter = or(matchesPrefix, matchesCamelCase, matchesContiguousSubString);
const fuzzySeparateFilter = or(matchesPrefix, matchesCamelCase, matchesSubString);
const fuzzyRegExpCache = new LRUCache(10000); // bounded to 10000 elements
export function matchesFuzzy(word, wordToMatchAgainst, enableSeparateSubstringMatching = false) {
    if (typeof word !== 'string' || typeof wordToMatchAgainst !== 'string') {
        return null; // return early for invalid input
    }
    // Form RegExp for wildcard matches
    let regexp = fuzzyRegExpCache.get(word);
    if (!regexp) {
        regexp = new RegExp(strings.convertSimple2RegExpPattern(word), 'i');
        fuzzyRegExpCache.set(word, regexp);
    }
    // RegExp Filter
    const match = regexp.exec(wordToMatchAgainst);
    if (match) {
        return [{ start: match.index, end: match.index + match[0].length }];
    }
    // Default Filter
    return enableSeparateSubstringMatching ? fuzzySeparateFilter(word, wordToMatchAgainst) : fuzzyContiguousFilter(word, wordToMatchAgainst);
}
/**
 * Match pattern against word in a fuzzy way. As in IntelliSense and faster and more
 * powerful than `matchesFuzzy`
 */
export function matchesFuzzy2(pattern, word) {
    const score = fuzzyScore(pattern, pattern.toLowerCase(), 0, word, word.toLowerCase(), 0, { firstMatchCanBeWeak: true, boostFullMatch: true });
    return score ? createMatches(score) : null;
}
export function anyScore(pattern, lowPattern, patternPos, word, lowWord, wordPos) {
    const max = Math.min(13, pattern.length);
    for (; patternPos < max; patternPos++) {
        const result = fuzzyScore(pattern, lowPattern, patternPos, word, lowWord, wordPos, { firstMatchCanBeWeak: true, boostFullMatch: true });
        if (result) {
            return result;
        }
    }
    return [0, wordPos];
}
//#region --- fuzzyScore ---
export function createMatches(score) {
    if (typeof score === 'undefined') {
        return [];
    }
    const res = [];
    const wordPos = score[1];
    for (let i = score.length - 1; i > 1; i--) {
        const pos = score[i] + wordPos;
        const last = res[res.length - 1];
        if (last && last.end === pos) {
            last.end = pos + 1;
        }
        else {
            res.push({ start: pos, end: pos + 1 });
        }
    }
    return res;
}
const _maxLen = 128;
function initTable() {
    const table = [];
    const row = [];
    for (let i = 0; i <= _maxLen; i++) {
        row[i] = 0;
    }
    for (let i = 0; i <= _maxLen; i++) {
        table.push(row.slice(0));
    }
    return table;
}
function initArr(maxLen) {
    const row = [];
    for (let i = 0; i <= maxLen; i++) {
        row[i] = 0;
    }
    return row;
}
const _minWordMatchPos = initArr(2 * _maxLen); // min word position for a certain pattern position
const _maxWordMatchPos = initArr(2 * _maxLen); // max word position for a certain pattern position
const _diag = initTable(); // the length of a contiguous diagonal match
const _table = initTable();
const _arrows = initTable();
const _debug = false;
function printTable(table, pattern, patternLen, word, wordLen) {
    function pad(s, n, pad = ' ') {
        while (s.length < n) {
            s = pad + s;
        }
        return s;
    }
    let ret = ` |   |${word.split('').map(c => pad(c, 3)).join('|')}\n`;
    for (let i = 0; i <= patternLen; i++) {
        if (i === 0) {
            ret += ' |';
        }
        else {
            ret += `${pattern[i - 1]}|`;
        }
        ret += table[i].slice(0, wordLen + 1).map(n => pad(n.toString(), 3)).join('|') + '\n';
    }
    return ret;
}
function printTables(pattern, patternStart, word, wordStart) {
    pattern = pattern.substr(patternStart);
    word = word.substr(wordStart);
    console.log(printTable(_table, pattern, pattern.length, word, word.length));
    console.log(printTable(_arrows, pattern, pattern.length, word, word.length));
    console.log(printTable(_diag, pattern, pattern.length, word, word.length));
}
function isSeparatorAtPos(value, index) {
    if (index < 0 || index >= value.length) {
        return false;
    }
    const code = value.codePointAt(index);
    switch (code) {
        case 95 /* CharCode.Underline */:
        case 45 /* CharCode.Dash */:
        case 46 /* CharCode.Period */:
        case 32 /* CharCode.Space */:
        case 47 /* CharCode.Slash */:
        case 92 /* CharCode.Backslash */:
        case 39 /* CharCode.SingleQuote */:
        case 34 /* CharCode.DoubleQuote */:
        case 58 /* CharCode.Colon */:
        case 36 /* CharCode.DollarSign */:
        case 60 /* CharCode.LessThan */:
        case 62 /* CharCode.GreaterThan */:
        case 40 /* CharCode.OpenParen */:
        case 41 /* CharCode.CloseParen */:
        case 91 /* CharCode.OpenSquareBracket */:
        case 93 /* CharCode.CloseSquareBracket */:
        case 123 /* CharCode.OpenCurlyBrace */:
        case 125 /* CharCode.CloseCurlyBrace */:
            return true;
        case undefined:
            return false;
        default:
            if (strings.isEmojiImprecise(code)) {
                return true;
            }
            return false;
    }
}
function isWhitespaceAtPos(value, index) {
    if (index < 0 || index >= value.length) {
        return false;
    }
    const code = value.charCodeAt(index);
    switch (code) {
        case 32 /* CharCode.Space */:
        case 9 /* CharCode.Tab */:
            return true;
        default:
            return false;
    }
}
function isUpperCaseAtPos(pos, word, wordLow) {
    return word[pos] !== wordLow[pos];
}
export function isPatternInWord(patternLow, patternPos, patternLen, wordLow, wordPos, wordLen, fillMinWordPosArr = false) {
    while (patternPos < patternLen && wordPos < wordLen) {
        if (patternLow[patternPos] === wordLow[wordPos]) {
            if (fillMinWordPosArr) {
                // Remember the min word position for each pattern position
                _minWordMatchPos[patternPos] = wordPos;
            }
            patternPos += 1;
        }
        wordPos += 1;
    }
    return patternPos === patternLen; // pattern must be exhausted
}
var Arrow;
(function (Arrow) {
    Arrow[Arrow["Diag"] = 1] = "Diag";
    Arrow[Arrow["Left"] = 2] = "Left";
    Arrow[Arrow["LeftLeft"] = 3] = "LeftLeft";
})(Arrow || (Arrow = {}));
export var FuzzyScore;
(function (FuzzyScore) {
    /**
     * No matches and value `-100`
     */
    FuzzyScore.Default = ([-100, 0]);
    function isDefault(score) {
        return !score || (score.length === 2 && score[0] === -100 && score[1] === 0);
    }
    FuzzyScore.isDefault = isDefault;
})(FuzzyScore || (FuzzyScore = {}));
export class FuzzyScoreOptions {
    static { this.default = { boostFullMatch: true, firstMatchCanBeWeak: false }; }
    constructor(firstMatchCanBeWeak, boostFullMatch) {
        this.firstMatchCanBeWeak = firstMatchCanBeWeak;
        this.boostFullMatch = boostFullMatch;
    }
}
export function fuzzyScore(pattern, patternLow, patternStart, word, wordLow, wordStart, options = FuzzyScoreOptions.default) {
    const patternLen = pattern.length > _maxLen ? _maxLen : pattern.length;
    const wordLen = word.length > _maxLen ? _maxLen : word.length;
    if (patternStart >= patternLen || wordStart >= wordLen || (patternLen - patternStart) > (wordLen - wordStart)) {
        return undefined;
    }
    // Run a simple check if the characters of pattern occur
    // (in order) at all in word. If that isn't the case we
    // stop because no match will be possible
    if (!isPatternInWord(patternLow, patternStart, patternLen, wordLow, wordStart, wordLen, true)) {
        return undefined;
    }
    // Find the max matching word position for each pattern position
    // NOTE: the min matching word position was filled in above, in the `isPatternInWord` call
    _fillInMaxWordMatchPos(patternLen, wordLen, patternStart, wordStart, patternLow, wordLow);
    let row = 1;
    let column = 1;
    let patternPos = patternStart;
    let wordPos = wordStart;
    const hasStrongFirstMatch = [false];
    // There will be a match, fill in tables
    for (row = 1, patternPos = patternStart; patternPos < patternLen; row++, patternPos++) {
        // Reduce search space to possible matching word positions and to possible access from next row
        const minWordMatchPos = _minWordMatchPos[patternPos];
        const maxWordMatchPos = _maxWordMatchPos[patternPos];
        const nextMaxWordMatchPos = (patternPos + 1 < patternLen ? _maxWordMatchPos[patternPos + 1] : wordLen);
        for (column = minWordMatchPos - wordStart + 1, wordPos = minWordMatchPos; wordPos < nextMaxWordMatchPos; column++, wordPos++) {
            let score = Number.MIN_SAFE_INTEGER;
            let canComeDiag = false;
            if (wordPos <= maxWordMatchPos) {
                score = _doScore(pattern, patternLow, patternPos, patternStart, word, wordLow, wordPos, wordLen, wordStart, _diag[row - 1][column - 1] === 0, hasStrongFirstMatch);
            }
            let diagScore = 0;
            if (score !== Number.MIN_SAFE_INTEGER) {
                canComeDiag = true;
                diagScore = score + _table[row - 1][column - 1];
            }
            const canComeLeft = wordPos > minWordMatchPos;
            const leftScore = canComeLeft ? _table[row][column - 1] + (_diag[row][column - 1] > 0 ? -5 : 0) : 0; // penalty for a gap start
            const canComeLeftLeft = wordPos > minWordMatchPos + 1 && _diag[row][column - 1] > 0;
            const leftLeftScore = canComeLeftLeft ? _table[row][column - 2] + (_diag[row][column - 2] > 0 ? -5 : 0) : 0; // penalty for a gap start
            if (canComeLeftLeft && (!canComeLeft || leftLeftScore >= leftScore) && (!canComeDiag || leftLeftScore >= diagScore)) {
                // always prefer choosing left left to jump over a diagonal because that means a match is earlier in the word
                _table[row][column] = leftLeftScore;
                _arrows[row][column] = 3 /* Arrow.LeftLeft */;
                _diag[row][column] = 0;
            }
            else if (canComeLeft && (!canComeDiag || leftScore >= diagScore)) {
                // always prefer choosing left since that means a match is earlier in the word
                _table[row][column] = leftScore;
                _arrows[row][column] = 2 /* Arrow.Left */;
                _diag[row][column] = 0;
            }
            else if (canComeDiag) {
                _table[row][column] = diagScore;
                _arrows[row][column] = 1 /* Arrow.Diag */;
                _diag[row][column] = _diag[row - 1][column - 1] + 1;
            }
            else {
                throw new Error(`not possible`);
            }
        }
    }
    if (_debug) {
        printTables(pattern, patternStart, word, wordStart);
    }
    if (!hasStrongFirstMatch[0] && !options.firstMatchCanBeWeak) {
        return undefined;
    }
    row--;
    column--;
    const result = [_table[row][column], wordStart];
    let backwardsDiagLength = 0;
    let maxMatchColumn = 0;
    while (row >= 1) {
        // Find the column where we go diagonally up
        let diagColumn = column;
        do {
            const arrow = _arrows[row][diagColumn];
            if (arrow === 3 /* Arrow.LeftLeft */) {
                diagColumn = diagColumn - 2;
            }
            else if (arrow === 2 /* Arrow.Left */) {
                diagColumn = diagColumn - 1;
            }
            else {
                // found the diagonal
                break;
            }
        } while (diagColumn >= 1);
        // Overturn the "forwards" decision if keeping the "backwards" diagonal would give a better match
        if (backwardsDiagLength > 1 // only if we would have a contiguous match of 3 characters
            && patternLow[patternStart + row - 1] === wordLow[wordStart + column - 1] // only if we can do a contiguous match diagonally
            && !isUpperCaseAtPos(diagColumn + wordStart - 1, word, wordLow) // only if the forwards chose diagonal is not an uppercase
            && backwardsDiagLength + 1 > _diag[row][diagColumn] // only if our contiguous match would be longer than the "forwards" contiguous match
        ) {
            diagColumn = column;
        }
        if (diagColumn === column) {
            // this is a contiguous match
            backwardsDiagLength++;
        }
        else {
            backwardsDiagLength = 1;
        }
        if (!maxMatchColumn) {
            // remember the last matched column
            maxMatchColumn = diagColumn;
        }
        row--;
        column = diagColumn - 1;
        result.push(column);
    }
    if (wordLen - wordStart === patternLen && options.boostFullMatch) {
        // the word matches the pattern with all characters!
        // giving the score a total match boost (to come up ahead other words)
        result[0] += 2;
    }
    // Add 1 penalty for each skipped character in the word
    const skippedCharsCount = maxMatchColumn - patternLen;
    result[0] -= skippedCharsCount;
    return result;
}
function _fillInMaxWordMatchPos(patternLen, wordLen, patternStart, wordStart, patternLow, wordLow) {
    let patternPos = patternLen - 1;
    let wordPos = wordLen - 1;
    while (patternPos >= patternStart && wordPos >= wordStart) {
        if (patternLow[patternPos] === wordLow[wordPos]) {
            _maxWordMatchPos[patternPos] = wordPos;
            patternPos--;
        }
        wordPos--;
    }
}
function _doScore(pattern, patternLow, patternPos, patternStart, word, wordLow, wordPos, wordLen, wordStart, newMatchStart, outFirstMatchStrong) {
    if (patternLow[patternPos] !== wordLow[wordPos]) {
        return Number.MIN_SAFE_INTEGER;
    }
    let score = 1;
    let isGapLocation = false;
    if (wordPos === (patternPos - patternStart)) {
        // common prefix: `foobar <-> foobaz`
        //                            ^^^^^
        score = pattern[patternPos] === word[wordPos] ? 7 : 5;
    }
    else if (isUpperCaseAtPos(wordPos, word, wordLow) && (wordPos === 0 || !isUpperCaseAtPos(wordPos - 1, word, wordLow))) {
        // hitting upper-case: `foo <-> forOthers`
        //                              ^^ ^
        score = pattern[patternPos] === word[wordPos] ? 7 : 5;
        isGapLocation = true;
    }
    else if (isSeparatorAtPos(wordLow, wordPos) && (wordPos === 0 || !isSeparatorAtPos(wordLow, wordPos - 1))) {
        // hitting a separator: `. <-> foo.bar`
        //                                ^
        score = 5;
    }
    else if (isSeparatorAtPos(wordLow, wordPos - 1) || isWhitespaceAtPos(wordLow, wordPos - 1)) {
        // post separator: `foo <-> bar_foo`
        //                              ^^^
        score = 5;
        isGapLocation = true;
    }
    if (score > 1 && patternPos === patternStart) {
        outFirstMatchStrong[0] = true;
    }
    if (!isGapLocation) {
        isGapLocation = isUpperCaseAtPos(wordPos, word, wordLow) || isSeparatorAtPos(wordLow, wordPos - 1) || isWhitespaceAtPos(wordLow, wordPos - 1);
    }
    //
    if (patternPos === patternStart) { // first character in pattern
        if (wordPos > wordStart) {
            // the first pattern character would match a word character that is not at the word start
            // so introduce a penalty to account for the gap preceding this match
            score -= isGapLocation ? 3 : 5;
        }
    }
    else {
        if (newMatchStart) {
            // this would be the beginning of a new match (i.e. there would be a gap before this location)
            score += isGapLocation ? 2 : 0;
        }
        else {
            // this is part of a contiguous match, so give it a slight bonus, but do so only if it would not be a preferred gap location
            score += isGapLocation ? 0 : 1;
        }
    }
    if (wordPos + 1 === wordLen) {
        // we always penalize gaps, but this gives unfair advantages to a match that would match the last character in the word
        // so pretend there is a gap after the last character in the word to normalize things
        score -= isGapLocation ? 3 : 5;
    }
    return score;
}
//#endregion
//#region --- graceful ---
export function fuzzyScoreGracefulAggressive(pattern, lowPattern, patternPos, word, lowWord, wordPos, options) {
    return fuzzyScoreWithPermutations(pattern, lowPattern, patternPos, word, lowWord, wordPos, true, options);
}
export function fuzzyScoreGraceful(pattern, lowPattern, patternPos, word, lowWord, wordPos, options) {
    return fuzzyScoreWithPermutations(pattern, lowPattern, patternPos, word, lowWord, wordPos, false, options);
}
function fuzzyScoreWithPermutations(pattern, lowPattern, patternPos, word, lowWord, wordPos, aggressive, options) {
    let top = fuzzyScore(pattern, lowPattern, patternPos, word, lowWord, wordPos, options);
    if (top && !aggressive) {
        // when using the original pattern yield a result we`
        // return it unless we are aggressive and try to find
        // a better alignment, e.g. `cno` -> `^co^ns^ole` or `^c^o^nsole`.
        return top;
    }
    if (pattern.length >= 3) {
        // When the pattern is long enough then try a few (max 7)
        // permutations of the pattern to find a better match. The
        // permutations only swap neighbouring characters, e.g
        // `cnoso` becomes `conso`, `cnsoo`, `cnoos`.
        const tries = Math.min(7, pattern.length - 1);
        for (let movingPatternPos = patternPos + 1; movingPatternPos < tries; movingPatternPos++) {
            const newPattern = nextTypoPermutation(pattern, movingPatternPos);
            if (newPattern) {
                const candidate = fuzzyScore(newPattern, newPattern.toLowerCase(), patternPos, word, lowWord, wordPos, options);
                if (candidate) {
                    candidate[0] -= 3; // permutation penalty
                    if (!top || candidate[0] > top[0]) {
                        top = candidate;
                    }
                }
            }
        }
    }
    return top;
}
function nextTypoPermutation(pattern, patternPos) {
    if (patternPos + 1 >= pattern.length) {
        return undefined;
    }
    const swap1 = pattern[patternPos];
    const swap2 = pattern[patternPos + 1];
    if (swap1 === swap2) {
        return undefined;
    }
    return pattern.slice(0, patternPos)
        + swap2
        + swap1
        + pattern.slice(patternPos + 2);
}
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmlsdGVycy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvY29tbW9uL2ZpbHRlcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUNwQyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUNoRSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUN4RCxPQUFPLEtBQUssT0FBTyxNQUFNLGNBQWMsQ0FBQztBQVl4QyxtQkFBbUI7QUFFbkI7Ozs7O0dBS0c7QUFDSCxNQUFNLFVBQVUsRUFBRSxDQUFDLEdBQUcsTUFBaUI7SUFDdEMsT0FBTyxVQUFVLElBQVksRUFBRSxrQkFBMEI7UUFDeEQsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsR0FBRyxHQUFHLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ25ELE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztZQUNsRCxJQUFJLEtBQUssRUFBRSxDQUFDO2dCQUNYLE9BQU8sS0FBSyxDQUFDO1lBQ2QsQ0FBQztRQUNGLENBQUM7UUFDRCxPQUFPLElBQUksQ0FBQztJQUNiLENBQUMsQ0FBQztBQUNILENBQUM7QUFFRCxTQUFTO0FBRVQsTUFBTSxDQUFDLE1BQU0sbUJBQW1CLEdBQVksY0FBYyxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUM7QUFDbEYsTUFBTSxDQUFDLE1BQU0sYUFBYSxHQUFZLGNBQWMsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxDQUFDO0FBRTNFLFNBQVMsY0FBYyxD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