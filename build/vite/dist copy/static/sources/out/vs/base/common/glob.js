/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { equals } from './arrays.js';
import { isThenable } from './async.js';
import { isEqualOrParent } from './extpath.js';
import { LRUCache } from './map.js';
import { basename, extname, posix, sep } from './path.js';
import { isLinux } from './platform.js';
import { endsWithIgnoreCase, equalsIgnoreCase, escapeRegExpCharacters, ltrim } from './strings.js';
export function getEmptyExpression() {
    return Object.create(null);
}
export const GLOBSTAR = '**';
export const GLOB_SPLIT = '/';
const PATH_REGEX = '[/\\\\]'; // any slash or backslash
const NO_PATH_REGEX = '[^/\\\\]'; // any non-slash and non-backslash
const ALL_FORWARD_SLASHES = /\//g;
function starsToRegExp(starCount, isLastPattern) {
    switch (starCount) {
        case 0:
            return '';
        case 1:
            return `${NO_PATH_REGEX}*?`; // 1 star matches any number of characters except path separator (/ and \) - non greedy (?)
        default:
            // Matches:  (Path Sep OR Path Val followed by Path Sep) 0-many times except when it's the last pattern
            //           in which case also matches (Path Sep followed by Path Val)
            // Group is non capturing because we don't need to capture at all (?:...)
            // Overall we use non-greedy matching because it could be that we match too much
            return `(?:${PATH_REGEX}|${NO_PATH_REGEX}+${PATH_REGEX}${isLastPattern ? `|${PATH_REGEX}${NO_PATH_REGEX}+` : ''})*?`;
    }
}
export function splitGlobAware(pattern, splitChar) {
    if (!pattern) {
        return [];
    }
    const segments = [];
    let inBraces = false;
    let inBrackets = false;
    let curVal = '';
    for (const char of pattern) {
        switch (char) {
            case splitChar:
                if (!inBraces && !inBrackets) {
                    segments.push(curVal);
                    curVal = '';
                    continue;
                }
                break;
            case '{':
                inBraces = true;
                break;
            case '}':
                inBraces = false;
                break;
            case '[':
                inBrackets = true;
                break;
            case ']':
                inBrackets = false;
                break;
        }
        curVal += char;
    }
    // Tail
    if (curVal) {
        segments.push(curVal);
    }
    return segments;
}
function parseRegExp(pattern) {
    if (!pattern) {
        return '';
    }
    let regEx = '';
    // Split up into segments for each slash found
    const segments = splitGlobAware(pattern, GLOB_SPLIT);
    // Special case where we only have globstars
    if (segments.every(segment => segment === GLOBSTAR)) {
        regEx = '.*';
    }
    // Build regex over segments
    else {
        let previousSegmentWasGlobStar = false;
        segments.forEach((segment, index) => {
            // Treat globstar specially
            if (segment === GLOBSTAR) {
                // if we have more than one globstar after another, just ignore it
                if (previousSegmentWasGlobStar) {
                    return;
                }
                regEx += starsToRegExp(2, index === segments.length - 1);
            }
            // Anything else, not globstar
            else {
                // States
                let inBraces = false;
                let braceVal = '';
                let inBrackets = false;
                let bracketVal = '';
                for (const char of segment) {
                    // Support brace expansion
                    if (char !== '}' && inBraces) {
                        braceVal += char;
                        continue;
                    }
                    // Support brackets
                    if (inBrackets && (char !== ']' || !bracketVal) /* ] is literally only allowed as first character in brackets to match it */) {
                        let res;
                        // range operator
                        if (char === '-') {
                            res = char;
                        }
                        // negation operator (only valid on first index in bracket)
                        else if ((char === '^' || char === '!') && !bracketVal) {
                            res = '^';
                        }
                        // glob split matching is not allowed within character ranges
                        // see http://man7.org/linux/man-pages/man7/glob.7.html
                        else if (char === GLOB_SPLIT) {
                            res = '';
                        }
                        // anything else gets escaped
                        else {
                            res = escapeRegExpCharacters(char);
                        }
                        bracketVal += res;
                        continue;
                    }
                    switch (char) {
                        case '{':
                            inBraces = true;
                            continue;
                        case '[':
                            inBrackets = true;
                            continue;
                        case '}': {
                            const choices = splitGlobAware(braceVal, ',');
                            // Converts {foo,bar} => [foo|bar]
                            const braceRegExp = `(?:${choices.map(choice => parseRegExp(choice)).join('|')})`;
                            regEx += braceRegExp;
                            inBraces = false;
                            braceVal = '';
                            break;
                        }
                        case ']': {
                            regEx += ('[' + bracketVal + ']');
                            inBrackets = false;
                            bracketVal = '';
                            break;
                        }
                        case '?':
                            regEx += NO_PATH_REGEX; // 1 ? matches any single character except path separator (/ and \)
                            continue;
                        case '*':
                            regEx += starsToRegExp(1);
                            continue;
                        default:
                            regEx += escapeRegExpCharacters(char);
                    }
                }
                // Tail: Add the slash we had split on if there is more to
                // come and the remaining pattern is not a globstar
                // For example if pattern: some/**/*.js we want the "/" after
                // some to be included in the RegEx to prevent a folder called
                // "something" to match as well.
                if (index < segments.length - 1 && // more segments to come after this
                    (segments[index + 1] !== GLOBSTAR || // next segment is not **, or...
                        index + 2 < segments.length // ...next segment is ** but there is more segments after that
                    )) {
                    regEx += PATH_REGEX;
                }
            }
            // update globstar state
            previousSegmentWasGlobStar = (segment === GLOBSTAR);
        });
    }
    return regEx;
}
// regexes to check for trivial glob patterns that just check for String#endsWith
const T1 = /^\*\*\/\*\.[\w\.-]+$/; // **/*.something
const T2 = /^\*\*\/([\w\.-]+)\/?$/; // **/something
const T3 = /^{\*\*\/\*?[\w\.-]+\/?(,\*\*\/\*?[\w\.-]+\/?)*}$/; // {**/*.something,**/*.else} or {**/package.json,**/project.json}
const T3_2 = /^{\*\*\/\*?[\w\.-]+(\/(\*\*)?)?(,\*\*\/\*?[\w\.-]+(\/(\*\*)?)?)*}$/; // Like T3, with optional trailing /**
const T4 = /^\*\*((\/[\w\.-]+)+)\/?$/; // **/something/else
const T5 = /^([\w\.-]+(\/[\w\.-]+)*)\/?$/; // something/else
const CACHE = new LRUCache(10000); // bounded to 10000 elements
const FALSE = function () {
    return false;
};
const NULL = function () {
    return null;
};
/**
 * Check if a provided parsed pattern or expression
 * is empty - hence it won't ever match anything.
 *
 * See {@link FALSE} and {@link NULL}.
 */
export function isEmptyPattern(pattern) {
    if (pattern === FALSE) {
        return true;
    }
    if (pattern === NULL) {
        return true;
    }
    return false;
}
function parsePattern(arg1, options) {
    if (!arg1) {
        return NULL;
    }
    // Handle relative patterns
    let pattern;
    if (typeof arg1 !== 'string') {
        pattern = arg1.pattern;
    }
    else {
        pattern = arg1;
    }
    // Whitespace trimming
    pattern = pattern.trim();
    const ignoreCase = options.ignoreCase ?? false;
    const internalOptions = {
        ...options,
        equals: ignoreCase ? equalsIgnoreCase : (a, b) => a === b,
        endsWith: ignoreCase ? endsWithIgnoreCase : (str, candidate) => str.endsWith(candidate),
        isEqualOrParent: (base, candidate) => isEqualOrParent(base, candidate, options.ignoreCase ?? !isLinux /* preserve old behaviour for when option is not adopted */)
    };
    // Check cache
    const patternKey = `${ignoreCase ? pattern.toLowerCase() : pattern}_${!!options.trimForExclusions}_${ignoreCase}`;
    let parsedPattern = CACHE.get(patternKey);
    if (parsedPattern) {
        return wrapRelativePattern(parsedPattern, arg1, internalOptions);
    }
    // Check for Trivials
    let match;
    if (T1.test(pattern)) {
        parsedPattern = trivia1(pattern.substring(4), pattern, internalOptions); // common pattern: **/*.txt just need endsWith check
    }
    else if (match = T2.exec(trimForExclusions(pattern, internalOptions))) { // common pattern: **/some.txt just need basename check
        parsedPattern = trivia2(match[1], pattern, internalOptions);
    }
    else if ((options.trimForExclusions ? T3_2 : T3).test(pattern)) { // repetition of common patterns (see above) {**/*.txt,**/*.png}
        parsedPattern = trivia3(pattern, internalOptions);
    }
    else if (match = T4.exec(trimForExclusions(pattern, internalOptions))) { // common pattern: **/something/else just need endsWith check
        parsedPattern = trivia4and5(match[1].substring(1), pattern, true, internalOptions);
    }
    else if (match = T5.exec(trimForExclusions(pattern, internalOptions))) { // common pattern: something/else just need equals check
        parsedPattern = trivia4and5(match[1], pattern, false, internalOptions);
    }
    // Otherwise convert to pattern
    else {
        parsedPattern = toRegExp(pattern, internalOptions);
    }
    // Cache
    CACHE.set(patternKey, parsedPattern);
    return wrapRelativePattern(parsedPattern, arg1, internalOptions);
}
function wrapRelativePattern(parsedPattern, arg2, options) {
    if (typeof arg2 === 'string') {
        return parsedPattern;
    }
    const wrappedPattern = function (path, basename) {
        if (!options.isEqualOrParent(path, arg2.base)) {
            // skip glob matching if `base` is not a parent of `path`
            return null;
        }
        // Given we have checked `base` being a parent of `path`,
        // we can now remove the `base` portion of the `path`
        // and only match on the remaining path components
        // For that we try to extract the portion of the `path`
        // that comes after the `base` portion. We have to account
        // for the fact that `base` might end in a path separator
        // (https://github.com/microsoft/vscode/issues/162498)
        return parsedPattern(ltrim(path.substring(arg2.base.length), sep), basename);
    };
    // Make sure to preserve associated metadata
    wrappedPattern.allBasenames = parsedPattern.allBasenames;
    wrappedPattern.allPaths = parsedPattern.allPaths;
    wrappedPattern.basenames = parsedPattern.basenames;
    wrappedPattern.patterns = parsedPattern.patterns;
    return wrappedPattern;
}
function trimForExclusions(pattern, options) {
    return options.trimForExclusions && pattern.endsWith('/**') ? pattern.substring(0, pattern.length - 2) : pattern; // dropping **, tailing / is dropped later
}
// common pattern: **/*.txt just need endsWith check
function trivia1(base, pattern, options) {
    return function (path, basename) {
        return typeof path === 'string' && options.endsWith(path, base) ? pattern : null;
    };
}
// common pattern: **/some.txt just need basename check
function trivia2(base, pattern, options) {
    const slashBase = `/${base}`;
    const backslashBase = `\\${base}`;
    const parsedPattern = function (path, basename) {
        if (typeof path !== 'string') {
            return null;
        }
        if (basename) {
            return options.equals(basename, base) ? pattern : null;
        }
        return options.equals(path, base) || options.endsWith(path, slashBase) || options.endsWith(path, backslashBase) ? pattern : null;
    };
    const basenames = [base];
    parsedPattern.basenames = basenames;
    parsedPattern.patterns = [pattern];
    parsedPattern.allBasenames = basenames;
    return parsedPattern;
}
// repetition of common patterns (see above) {**/*.txt,**/*.png}
function trivia3(pattern, options) {
    const parsedPatterns = aggregateBasenameMatches(pattern.slice(1, -1)
        .split(',')
        .map(pattern => parsePattern(pattern, options))
        .filter(pattern => pattern !== NULL), pattern);
    const patternsLength = parsedPatterns.length;
    if (!patternsLength) {
        return NULL;
    }
    if (patternsLength === 1) {
        return parsedPatterns[0];
    }
    const parsedPattern = function (path, basename) {
        for (let i = 0, n = parsedPatterns.length; i < n; i++) {
            if (parsedPatterns[i](path, basename)) {
                return pattern;
            }
        }
        return null;
    };
    const withBasenames = parsedPatterns.find(pattern => !!pattern.allBasenames);
    if (withBasenames) {
        parsedPattern.allBasenames = withBasenames.allBasenames;
    }
    const allPaths = parsedPatterns.reduce((all, current) => current.allPaths ? all.concat(current.allPaths) : all, []);
    if (allPaths.length) {
        parsedPattern.allPaths = allPaths;
    }
    return parsedPattern;
}
// common patterns: **/something/else just need endsWith check, something/else just needs and equals check
function trivia4and5(targetPath, pattern, matchPathEnds, options) {
    const usingPosixSep = sep === posix.sep;
    const nativePath = usingPosixSep ? targetPath : targetPath.replace(ALL_FORWARD_SLASHES, sep);
    const nativePathEnd = sep + nativePath;
    const targetPathEnd = posix.sep + targetPath;
    let parsedPattern;
    if (matchPathEnds) {
        parsedPattern = function (path, basename) {
            return typeof path === 'string' && ((options.equals(path, nativePath) || options.endsWith(path, nativePathEnd)) ||
                !usingPosixSep && (options.equals(path, targetPath) || options.endsWith(path, targetPathEnd))) ? pattern : null;
        };
    }
    else {
        parsedPattern = function (path, basename) {
            return typeof path === 'string' && (options.equals(path, nativePath) || (!usingPosixSep && options.equals(path, targetPath))) ? pattern : null;
        };
    }
    parsedPattern.allPaths = [(matchPathEnds ? '*/' : './') + targetPath];
    return parsedPattern;
}
function toRegExp(pattern, options) {
    try {
        const regExp = new RegExp(`^${parseRegExp(pattern)}$`, options.ignoreCase ? 'i' : undefined);
        return function (path) {
            regExp.lastIndex = 0; // reset RegExp to its initial state to reuse it!
            return typeof path === 'string' && regExp.test(path) ? pattern : null;
        };
    }
    catch {
        return NULL;
    }
}
export function match(arg1, path, options) {
    if (!arg1 || typeof path !== 'string') {
        return false;
    }
    return parse(arg1, options)(path);
}
export function parse(arg1, options = {}) {
    if (!arg1) {
        return FALSE;
    }
    // Glob with String
    if (typeof arg1 === 'string' || isRelativePattern(arg1)) {
        const parsedPattern = parsePattern(arg1, options);
        if (parsedPattern === NULL) {
            return FALSE;
        }
        const resultPattern = function (path, basename) {
            return !!parsedPattern(path, basename);
        };
        if (parsedPattern.allBasenames) {
            resultPattern.allBasenames = parsedPattern.allBasenames;
        }
        if (parsedPattern.allPaths) {
            resultPattern.allPaths = parsedPattern.allPaths;
        }
        return resultPattern;
    }
    // Glob with Expression
    return parsedExpression(arg1, options);
}
export function isRelativePattern(obj) {
    const rp = obj;
    if (!rp) {
        return false;
    }
    return typeof rp.base === 'string' && typeof rp.pattern === 'string';
}
export function getBasenameTerms(patternOrExpression) {
    return patternOrExpression.allBasenames || [];
}
export function getPathTerms(patternOrExpression) {
    return patternOrExpression.allPaths || [];
}
function parsedExpression(expression, options) {
    const parsedPatterns = aggregateBasenameMatches(Object.getOwnPropertyNames(expression)
        .map(pattern => parseExpressionPattern(pattern, expression[pattern], options))
        .filter(pattern => pattern !== NULL));
    const patternsLength = parsedPatterns.length;
    if (!patternsLength) {
        return NULL;
    }
    if (!parsedPatterns.some(parsedPattern => !!parsedPattern.requiresSiblings)) {
        if (patternsLength === 1) {
            return parsedPatterns[0];
        }
        const resultExpression = function (path, basename) {
            let resultPromises = undefined;
            for (let i = 0, n = parsedPatterns.length; i < n; i++) {
                const result = parsedPatterns[i](path, basename);
                if (typeof result === 'string') {
                    return result; // immediately return as soon as the first expression matches
                }
                // If the result is a promise, we have to keep it for
                // later processing and await the result properly.
                if (isThenable(result)) {
                    if (!resultPromises) {
                        resultPromises = [];
                    }
                    resultPromises.push(result);
                }
            }
            // With result promises, we have to loop over each and
            // await the result before we can return any result.
            if (resultPromises) {
                return (async () => {
                    for (const resultPromise of resultPromises) {
                        const result = await resultPromise;
                        if (typeof result === 'string') {
                            return result;
                        }
                    }
                    return null;
                })();
            }
            return null;
        };
        const withBasenames = parsedPatterns.find(pattern => !!pattern.allBasenames);
        if (withBasenames) {
            resultExpression.allBasenames = withBasenames.allBasenames;
        }
        const allPaths = parsedPatterns.reduce((all, current) => current.allPaths ? all.concat(current.allPaths) : all, []);
        if (allPaths.length) {
            resultExpression.allPaths = allPaths;
        }
        return resultExpression;
    }
    const resultExpression = function (path, base, hasSibling) {
        let name = undefined;
        let resultPromises = undefined;
        for (let i = 0, n = parsedPatterns.length; i < n; i++) {
            // Pattern matches path
            const parsedPattern = parsedPatterns[i];
            if (parsedPattern.requiresSiblings && hasSibling) {
                if (!base) {
                    base = basename(path);
                }
                if (!name) {
                    name = base.substring(0, base.length - extname(path).length);
                }
            }
            const result = parsedPattern(path, base, name, hasSibling);
            if (typeof result === 'string') {
                return result; // immediately return as soon as the first expression matches
            }
            // If the result is a promise, we have to keep it for
            // later processing and await the result properly.
            if (isThenable(result)) {
                if (!resultPromises) {
                    resultPromises = [];
                }
                resultPromises.push(result);
            }
        }
        // With result promises, we have to loop over each and
        // await the result before we can return any result.
        if (resultPromises) {
            return (async () => {
                for (const resultPromise of resultPromises) {
                    const result = await resultPromise;
                    if (typeof result === 'string') {
                        return result;
                    }
                }
                return null;
            })();
        }
        return null;
    };
    const withBasenames = parsedPatterns.find(pattern => !!pattern.allBasenames);
    if (withBasenames) {
        resultExpression.allBasenames = withBasenames.allBasenames;
    }
    const allPaths = parsedPatterns.reduce((all, current) => current.allPaths ? all.concat(current.allPaths) : all, []);
    if (allPaths.length) {
        resultExpression.allPaths = allPaths;
    }
    return resultExpression;
}
function parseExpressionPattern(pattern, value, options) {
    if (value === false) {
        return NULL; // pattern is disabled
    }
    const parsedPattern = parsePattern(pattern, options);
    if (parsedPattern === NULL) {
        return NULL;
    }
    // Expression Pattern is <boolean>
    if (typeof value === 'boolean') {
        return parsedPattern;
    }
    // Expression Pattern is <SiblingClause>
    if (value) {
        const when = value.when;
        if (typeof when === 'string') {
            const result = (path, basename, name, hasSibling) => {
                if (!hasSibling || !parsedPattern(path, basename)) {
                    return null;
                }
                const clausePattern = when.replace('$(basename)', () => name);
                const matched = hasSibling(clausePattern);
                return isThenable(matched) ?
                    matched.then(match => match ? pattern : null) :
                    matched ? pattern : null;
            };
            result.requiresSiblings = true;
            return result;
        }
    }
    // Expression is anything
    return parsedPattern;
}
function aggregateBasenameMatches(parsedPatterns, result) {
    const basenamePatterns = parsedPatterns.filter(parsedPattern => !!parsedPattern.basenames);
    if (basenamePatterns.length < 2) {
        return parsedPatterns;
    }
    const basenames = basenamePatterns.reduce((all, current) => {
        const basenames = current.basenames;
        return basenames ? all.concat(basenames) : all;
    }, []);
    let patterns;
    if (result) {
        patterns = [];
        for (let i = 0, n = basenames.length; i < n; i++) {
            patterns.push(result);
        }
    }
    else {
        patterns = basenamePatterns.reduce((all, current) => {
            const patterns = current.patterns;
            return patterns ? all.concat(patterns) : all;
        }, []);
    }
    const aggregate = function (path, basename) {
        if (typeof path !== 'string') {
            return null;
        }
        if (!basename) {
            let i;
            for (i = path.length; i > 0; i--) {
                const ch = path.charCodeAt(i - 1);
                if (ch === 47 /* CharCode.Slash */ || ch === 92 /* CharCode.Backslash */) {
                    break;
                }
            }
            basename = path.substring(i);
        }
        const index = basenames.indexOf(basename);
        return index !== -1 ? patterns[index] : null;
    };
    aggregate.basenames = basenames;
    aggregate.patterns = patterns;
    aggregate.allBasenames = basenames;
    const aggregatedPatterns = parsedPatterns.filter(parsedPattern => !parsedPattern.basenames);
    aggregatedPatterns.push(aggregate);
    return aggregatedPatterns;
}
// NOTE: This is not used for actual matching, only for resetting watcher when patterns change.
// That is why it's ok to avoid case-insensitive comparison here.
export function patternsEquals(patternsA, patternsB) {
    return equals(patternsA, patternsB, (a, b) => {
        if (typeof a === 'string' && typeof b === 'string') {
            return a === b;
        }
        if (typeof a !== 'string' && typeof b !== 'string') {
            return a.base === b.base && a.pattern === b.pattern;
        }
        return false;
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2xvYi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvY29tbW9uL2dsb2IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLGFBQWEsQ0FBQztBQUNyQyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sWUFBWSxDQUFDO0FBRXhDLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxjQUFjLENBQUM7QUFDL0MsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUNwQyxPQUFPLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLE1BQU0sV0FBVyxDQUFDO0FBQzFELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxlQUFlLENBQUM7QUFDeEMsT0FBTyxFQUFFLGtCQUFrQixFQUFFLGdCQUFnQixFQUFFLHNCQUFzQixFQUFFLEtBQUssRUFBRSxNQUFNLGNBQWMsQ0FBQztBQXVCbkcsTUFBTSxVQUFVLGtCQUFrQjtJQUNqQyxPQUFPLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDNUIsQ0FBQztBQU1ELE1BQU0sQ0FBQyxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUM7QUFDN0IsTUFBTSxDQUFDLE1BQU0sVUFBVSxHQUFHLEdBQUcsQ0FBQztBQUU5QixNQUFNLFVBQVUsR0FBRyxTQUFTLENBQUMsQ0FBRSx5QkFBeUI7QUFDeEQsTUFBTSxhQUFhLEdBQUcsVUFBVSxDQUFDLENBQUMsa0NBQWtDO0FBQ3BFLE1BQU0sbUJBQW1CLEdBQUcsS0FBSyxDQUFDO0FBRWxDLFNBQVMsYUFBYSxDQUFDLFNBQWlCLEVBQUUsYUFBdUI7SUFDaEUsUUFBUSxTQUFTLEVBQUUsQ0FBQztRQUNuQixLQUFLLENBQUM7WUFDTCxPQUFPLEVBQUUsQ0FBQztRQUNYLEtB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