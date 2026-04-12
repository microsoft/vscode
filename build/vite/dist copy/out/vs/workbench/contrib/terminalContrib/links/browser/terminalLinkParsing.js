/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * This module is responsible for parsing possible links out of lines with only access to the line
 * text and the target operating system, ie. it does not do any validation that paths actually
 * exist.
 */
import { Lazy } from '../../../../../base/common/lazy.js';
/**
 * A regex that extracts the link suffix which contains line and column information. The link suffix
 * must terminate at the end of line.
 */
const linkSuffixRegexEol = new Lazy(() => generateLinkSuffixRegex(true));
/**
 * A regex that extracts the link suffix which contains line and column information.
 */
const linkSuffixRegex = new Lazy(() => generateLinkSuffixRegex(false));
function generateLinkSuffixRegex(eolOnly) {
    let ri = 0;
    let ci = 0;
    let rei = 0;
    let cei = 0;
    function r() {
        return `(?<row${ri++}>\\d+)`;
    }
    function c() {
        return `(?<col${ci++}>\\d+)`;
    }
    function re() {
        return `(?<rowEnd${rei++}>\\d+)`;
    }
    function ce() {
        return `(?<colEnd${cei++}>\\d+)`;
    }
    const eolSuffix = eolOnly ? '$' : '';
    // The comments in the regex below use real strings/numbers for better readability, here's
    // the legend:
    // - Path    = foo
    // - Row     = 339
    // - Col     = 12
    // - RowEnd  = 341
    // - ColEnd  = 789
    //
    // These all support single quote ' in the place of " and [] in the place of ()
    //
    // See the tests for an exhaustive list of all supported formats
    const lineAndColumnRegexClauses = [
        // foo:339
        // foo:339:12
        // foo:339:12-789
        // foo:339:12-341.789
        // foo:339.12
        // foo 339
        // foo 339:12                              [#140780]
        // foo 339.12
        // foo#339
        // foo#339:12                              [#190288]
        // foo#339.12
        // foo, 339                                [#217927]
        // "foo",339
        // "foo",339:12
        // "foo",339.12
        // "foo",339.12-789
        // "foo",339.12-341.789
        `(?::|#| |['"],|, )${r()}([:.]${c()}(?:-(?:${re()}\\.)?${ce()})?)?` + eolSuffix,
        // The quotes below are optional           [#171652]
        // "foo", line 339                         [#40468]
        // "foo", line 339, col 12
        // "foo", line 339, column 12
        // "foo":line 339
        // "foo":line 339, col 12
        // "foo":line 339, column 12
        // "foo": line 339
        // "foo": line 339, col 12
        // "foo": line 339, column 12
        // "foo" on line 339
        // "foo" on line 339, col 12
        // "foo" on line 339, column 12
        // "foo" line 339 column 12
        // "foo", line 339, character 12           [#171880]
        // "foo", line 339, characters 12-789      [#171880]
        // "foo", lines 339-341                    [#171880]
        // "foo", lines 339-341, characters 12-789 [#178287]
        `['"]?(?:,? |: ?| on )lines? ${r()}(?:-${re()})?(?:,? (?:col(?:umn)?|characters?) ${c()}(?:-${ce()})?)?` + eolSuffix,
        // () and [] are interchangeable
        // foo(339)
        // foo(339,12)
        // foo(339, 12)
        // foo (339)
        // foo (339,12)
        // foo (339, 12)
        // foo: (339)
        // foo: (339,12)
        // foo: (339, 12)
        // foo(339:12)                             [#229842]
        // foo (339:12)                            [#229842]
        `:? ?[\\[\\(]${r()}(?:(?:, ?|:)${c()})?[\\]\\)]` + eolSuffix,
    ];
    const suffixClause = lineAndColumnRegexClauses
        // Join all clauses together
        .join('|')
        // Convert spaces to allow the non-breaking space char (ascii 160)
        .replace(/ /g, `[${'\u00A0'} ]`);
    return new RegExp(`(${suffixClause})`, eolOnly ? undefined : 'g');
}
/**
 * Removes the optional link suffix which contains line and column information.
 * @param link The link to use.
 */
export function removeLinkSuffix(link) {
    const suffix = getLinkSuffix(link)?.suffix;
    if (!suffix) {
        return link;
    }
    return link.substring(0, suffix.index);
}
/**
 * Removes any query string from the link.
 * @param link The link to use.
 */
export function removeLinkQueryString(link) {
    // Skip ? in UNC paths
    const start = link.startsWith('\\\\?\\') ? 4 : 0;
    const index = link.indexOf('?', start);
    if (index === -1) {
        return link;
    }
    return link.substring(0, index);
}
export function detectLinkSuffixes(line) {
    // Find all suffixes on the line. Since the regex global flag is used, lastIndex will be updated
    // in place such that there are no overlapping matches.
    let match;
    const results = [];
    linkSuffixRegex.value.lastIndex = 0;
    while ((match = linkSuffixRegex.value.exec(line)) !== null) {
        const suffix = toLinkSuffix(match);
        if (suffix === null) {
            break;
        }
        results.push(suffix);
    }
    return results;
}
/**
 * Returns the optional link suffix which contains line and column information.
 * @param link The link to parse.
 */
export function getLinkSuffix(link) {
    return toLinkSuffix(linkSuffixRegexEol.value.exec(link));
}
export function toLinkSuffix(match) {
    const groups = match?.groups;
    if (!groups || match.length < 1) {
        return null;
    }
    return {
        row: parseIntOptional(groups.row0 || groups.row1 || groups.row2),
        col: parseIntOptional(groups.col0 || groups.col1 || groups.col2),
        rowEnd: parseIntOptional(groups.rowEnd0 || groups.rowEnd1 || groups.rowEnd2),
        colEnd: parseIntOptional(groups.colEnd0 || groups.colEnd1 || groups.colEnd2),
        suffix: { index: match.index, text: match[0] }
    };
}
function parseIntOptional(value) {
    if (value === undefined) {
        return value;
    }
    return parseInt(value);
}
// This defines valid path characters for a link with a suffix, the first `[]` of the regex includes
// characters the path is not allowed to _start_ with, the second `[]` includes characters not
// allowed at all in the path. If the characters show up in both regexes the link will stop at that
// character, otherwise it will stop at a space character.
const linkWithSuffixPathCharacters = /(?<path>(?:file:\/\/\/)?[^\s\|<>\[\({][^\s\|<>]*)$/;
export function detectLinks(line, os) {
    // 1: Detect all links on line via suffixes first
    const results = detectLinksViaSuffix(line);
    // 2: Detect all links without suffixes and merge non-conflicting ranges into the results
    const noSuffixPaths = detectPathsNoSuffix(line, os);
    binaryInsertList(results, noSuffixPaths);
    return results;
}
function binaryInsertList(list, newItems) {
    if (list.length === 0) {
        list.push(...newItems);
    }
    for (const item of newItems) {
        binaryInsert(list, item, 0, list.length);
    }
}
function binaryInsert(list, newItem, low, high) {
    if (list.length === 0) {
        list.push(newItem);
        return;
    }
    if (low > high) {
        return;
    }
    // Find the index where the newItem would be inserted
    const mid = Math.floor((low + high) / 2);
    if (mid >= list.length ||
        (newItem.path.index < list[mid].path.index && (mid === 0 || newItem.path.index > list[mid - 1].path.index))) {
        // Check if it conflicts with an existing link before adding
        if (mid >= list.length ||
            (newItem.path.index + newItem.path.text.length < list[mid].path.index && (mid === 0 || newItem.path.index > list[mid - 1].path.index + list[mid - 1].path.text.length))) {
            list.splice(mid, 0, newItem);
        }
        return;
    }
    if (newItem.path.index > list[mid].path.index) {
        binaryInsert(list, newItem, mid + 1, high);
    }
    else {
        binaryInsert(list, newItem, low, mid - 1);
    }
}
function detectLinksViaSuffix(line) {
    const results = [];
    // 1: Detect link suffixes on the line
    const suffixes = detectLinkSuffixes(line);
    for (const suffix of suffixes) {
        const beforeSuffix = line.substring(0, suffix.suffix.index);
        const possiblePathMatch = beforeSuffix.match(linkWithSuffixPathCharacters);
        if (possiblePathMatch && possiblePathMatch.index !== undefined && possiblePathMatch.groups?.path) {
            let linkStartIndex = possiblePathMatch.index;
            let path = possiblePathMatch.groups.path;
            // Extract a path prefix if it exists (not part of the path, but part of the underlined
            // section)
            let prefix = undefined;
            const prefixMatch = path.match(/^(?<prefix>['"]+)/);
            if (prefixMatch?.groups?.prefix) {
                prefix = {
                    index: linkStartIndex,
                    text: prefixMatch.groups.prefix
                };
                path = path.substring(prefix.text.length);
                // Don't allow suffix links to be returned when the link itself is the empty string
                if (path.trim().length === 0) {
                    continue;
                }
                // If there are multiple characters in the prefix, trim the prefix if the _first_
                // suffix character is the same as the last prefix character. For example, for the
                // text `echo "'foo' on line 1"`:
                //
                // - Prefix='
                // - Path=foo
                // - Suffix=' on line 1
                //
                // If this fails on a multi-character prefix, just keep the original.
                if (prefixMatch.groups.prefix.length > 1) {
                    if (suffix.suffix.text[0].match(/['"]/) && prefixMatch.groups.prefix[prefixMatch.groups.prefix.length - 1] === suffix.suffix.text[0]) {
                        const trimPrefixAmount = prefixMatch.groups.prefix.length - 1;
                        prefix.index += trimPrefixAmount;
                        prefix.text = prefixMatch.groups.prefix[prefixMatch.groups.prefix.length - 1];
                        linkStartIndex += trimPrefixAmount;
                    }
                }
            }
            results.push({
                path: {
                    index: linkStartIndex + (prefix?.text.length || 0),
                    text: path
                },
                prefix,
                suffix
            });
            // If the path contains an opening bracket, provide the path starting immediately after
            // the opening bracket as an additional result
            const openingBracketMatch = path.matchAll(/(?<bracket>[\[\(])(?![\]\)])/g);
            for (const match of openingBracketMatch) {
                const bracket = match.groups?.bracket;
                if (bracket) {
                    results.push({
                        path: {
                            index: linkStartIndex + (prefix?.text.length || 0) + match.index + 1,
                            text: path.substring(match.index + bracket.length)
                        },
                        prefix,
                        suffix
                    });
                }
            }
        }
    }
    return results;
}
var RegexPathConstants;
(function (RegexPathConstants) {
    RegexPathConstants["PathPrefix"] = "(?:\\.\\.?|\\~|file://)";
    RegexPathConstants["PathSeparatorClause"] = "\\/";
    // '":; are allowed in paths but they are often separators so ignore them
    // Also disallow \\ to prevent a catastropic backtracking case #24795
    RegexPathConstants["ExcludedPathCharactersClause"] = "[^\\0<>\\?\\s!`&*()'\":;\\\\]";
    RegexPathConstants["ExcludedStartPathCharactersClause"] = "[^\\0<>\\?\\s!`&*()\\[\\]'\":;\\\\]";
    RegexPathConstants["WinOtherPathPrefix"] = "\\.\\.?|\\~";
    RegexPathConstants["WinPathSeparatorClause"] = "(?:\\\\|\\/)";
    RegexPathConstants["WinExcludedPathCharactersClause"] = "[^\\0<>\\?\\|\\/\\s!`&*()'\":;]";
    RegexPathConstants["WinExcludedStartPathCharactersClause"] = "[^\\0<>\\?\\|\\/\\s!`&*()\\[\\]'\":;]";
})(RegexPathConstants || (RegexPathConstants = {}));
/**
 * A regex that matches non-Windows paths, such as `/foo`, `~/foo`, `./foo`, `../foo` and
 * `foo/bar`.
 */
const unixLocalLinkClause = '(?:(?:' + RegexPathConstants.PathPrefix + '|(?:' + RegexPathConstants.ExcludedStartPathCharactersClause + RegexPathConstants.ExcludedPathCharactersClause + '*))?(?:' + RegexPathConstants.PathSeparatorClause + '(?:' + RegexPathConstants.ExcludedPathCharactersClause + ')+)+)';
/**
 * A regex clause that matches the start of an absolute path on Windows, such as: `C:`, `c:`,
 * `file:///c:` (uri) and `\\?\C:` (UNC path).
 */
export const winDrivePrefix = '(?:\\\\\\\\\\?\\\\|file:\\/\\/\\/)?[a-zA-Z]:';
/**
 * A regex that matches Windows paths, such as `\\?\c:\foo`, `c:\foo`, `~\foo`, `.\foo`, `..\foo`
 * and `foo\bar`.
 */
const winLocalLinkClause = '(?:(?:' + `(?:${winDrivePrefix}|${RegexPathConstants.WinOtherPathPrefix})` + '|(?:' + RegexPathConstants.WinExcludedStartPathCharactersClause + RegexPathConstants.WinExcludedPathCharactersClause + '*))?(?:' + RegexPathConstants.WinPathSeparatorClause + '(?:' + RegexPathConstants.WinExcludedPathCharactersClause + ')+)+)';
function detectPathsNoSuffix(line, os) {
    const results = [];
    const regex = new RegExp(os === 1 /* OperatingSystem.Windows */ ? winLocalLinkClause : unixLocalLinkClause, 'g');
    let match;
    while ((match = regex.exec(line)) !== null) {
        let text = match[0];
        let index = match.index;
        if (!text) {
            // Something matched but does not comply with the given match index, since this would
            // most likely a bug the regex itself we simply do nothing here
            break;
        }
        // Adjust the link range to exclude a/ and b/ if it looks like a git diff
        if (
        // --- a/foo/bar
        // +++ b/foo/bar
        ((line.startsWith('--- a/') || line.startsWith('+++ b/')) && index === 4) ||
            // diff --git a/foo/bar b/foo/bar
            (line.startsWith('diff --git') && (text.startsWith('a/') || text.startsWith('b/')))) {
            text = text.substring(2);
            index += 2;
        }
        results.push({
            path: {
                index,
                text
            },
            prefix: undefined,
            suffix: undefined
        });
    }
    return results;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxMaW5rUGFyc2luZy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9saW5rcy9icm93c2VyL3Rlcm1pbmFsTGlua1BhcnNpbmcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEc7Ozs7R0FJRztBQUVILE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQXNCMUQ7OztHQUdHO0FBQ0gsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLElBQUksQ0FBUyxHQUFHLEVBQUUsQ0FBQyx1QkFBdUIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0FBQ2pGOztHQUVHO0FBQ0gsTUFBTSxlQUFlLEdBQUcsSUFBSSxJQUFJLENBQVMsR0FBRyxFQUFFLENBQUMsdUJBQXVCLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztBQUUvRSxTQUFTLHVCQUF1QixDQUFDLE9BQWdCO0lBQ2hELElBQUksRUFBRSxHQUFHLENBQUMsQ0FBQztJQUNYLElBQUksRUFBRSxHQUFHLENBQUMsQ0FBQztJQUNYLElBQUksR0FBRyxHQUFHLENBQUMsQ0FBQztJQUNaLElBQUksR0FBRyxHQUFHLENBQUMsQ0FBQztJQUNaLFNBQVMsQ0FBQztRQUNULE9BQU8sU0FBUyxFQUFFLEVBQUUsUUFBUSxDQUFDO0lBQzlCLENBQUM7SUFDRCxTQUFTLENBQUM7UUFDVCxPQUFPLFNBQVMsRUFBRSxFQUFFLFFBQVEsQ0FBQztJQUM5QixDQUFDO0lBQ0QsU0FBUyxFQUFFO1FBQ1YsT0FBTyxZQUFZLEdBQUcsRUFBRSxRQUFRLENBQUM7SUFDbEMsQ0FBQztJQUNELFNBQVMsRUFBRTtRQUNWLE9BQU8sWUFBWSxHQUFHLEVBQUUsUUFBUSxDQUFDO0lBQ2xDLENBQUM7SUFFRCxNQUFNLFNBQVMsR0FBRyxPQUFPLENBQUMsQ0FB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