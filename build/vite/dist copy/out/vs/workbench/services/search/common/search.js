/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { mapArrayOrNot } from '../../../../base/common/arrays.js';
import * as glob from '../../../../base/common/glob.js';
import * as objects from '../../../../base/common/objects.js';
import * as extpath from '../../../../base/common/extpath.js';
import { fuzzyContains, getNLines } from '../../../../base/common/strings.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import * as paths from '../../../../base/common/path.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { TextSearchCompleteMessageType } from './searchExtTypes.js';
import { isThenable } from '../../../../base/common/async.js';
export { TextSearchCompleteMessageType };
export const VIEWLET_ID = 'workbench.view.search';
export const PANEL_ID = 'workbench.panel.search';
export const VIEW_ID = 'workbench.view.search';
export const SEARCH_RESULT_LANGUAGE_ID = 'search-result';
export const SEARCH_EXCLUDE_CONFIG = 'search.exclude';
export const DEFAULT_MAX_SEARCH_RESULTS = 20000;
// Warning: this pattern is used in the search editor to detect offsets. If you
// change this, also change the search-result built-in extension
const SEARCH_ELIDED_PREFIX = '⟪ ';
const SEARCH_ELIDED_SUFFIX = ' characters skipped ⟫';
const SEARCH_ELIDED_MIN_LEN = (SEARCH_ELIDED_PREFIX.length + SEARCH_ELIDED_SUFFIX.length + 5) * 2;
export const ISearchService = createDecorator('searchService');
/**
 * TODO@roblou - split text from file search entirely, or share code in a more natural way.
 */
export var SearchProviderType;
(function (SearchProviderType) {
    SearchProviderType[SearchProviderType["file"] = 0] = "file";
    SearchProviderType[SearchProviderType["text"] = 1] = "text";
    SearchProviderType[SearchProviderType["aiText"] = 2] = "aiText";
})(SearchProviderType || (SearchProviderType = {}));
export var QueryType;
(function (QueryType) {
    QueryType[QueryType["File"] = 1] = "File";
    QueryType[QueryType["Text"] = 2] = "Text";
    QueryType[QueryType["aiText"] = 3] = "aiText";
})(QueryType || (QueryType = {}));
export function resultIsMatch(result) {
    return !!result.rangeLocations && !!result.previewText;
}
export function isFileMatch(p) {
    return !!p.resource;
}
export function isAIKeyword(p) {
    return !!p.keyword;
}
export function isProgressMessage(p) {
    return !!p.message;
}
export var SearchCompletionExitCode;
(function (SearchCompletionExitCode) {
    SearchCompletionExitCode[SearchCompletionExitCode["Normal"] = 0] = "Normal";
    SearchCompletionExitCode[SearchCompletionExitCode["NewSearchStarted"] = 1] = "NewSearchStarted";
})(SearchCompletionExitCode || (SearchCompletionExitCode = {}));
export class FileMatch {
    constructor(resource) {
        this.resource = resource;
        this.results = [];
        // empty
    }
}
export class TextSearchMatch {
    constructor(text, ranges, previewOptions, webviewIndex) {
        this.rangeLocations = [];
        this.webviewIndex = webviewIndex;
        // Trim preview if this is one match and a single-line match with a preview requested.
        // Otherwise send the full text, like for replace or for showing multiple previews.
        // TODO this is fishy.
        const rangesArr = Array.isArray(ranges) ? ranges : [ranges];
        if (previewOptions && previewOptions.matchLines === 1 && isSingleLineRangeList(rangesArr)) {
            // 1 line preview requested
            text = getNLines(text, previewOptions.matchLines);
            let result = '';
            let shift = 0;
            let lastEnd = 0;
            const leadingChars = Math.floor(previewOptions.charsPerLine / 5);
            for (const range of rangesArr) {
                const previewStart = Math.max(range.startColumn - leadingChars, 0);
                const previewEnd = range.startColumn + previewOptions.charsPerLine;
                if (previewStart > lastEnd + leadingChars + SEARCH_ELIDED_MIN_LEN) {
                    const elision = SEARCH_ELIDED_PREFIX + (previewStart - lastEnd) + SEARCH_ELIDED_SUFFIX;
                    result += elision + text.slice(previewStart, previewEnd);
                    shift += previewStart - (lastEnd + elision.length);
                }
                else {
                    result += text.slice(lastEnd, previewEnd);
                }
                lastEnd = previewEnd;
                this.rangeLocations.push({
                    source: range,
                    preview: new OneLineRange(0, range.startColumn - shift, range.endColumn - shift)
                });
            }
            this.previewText = result;
        }
        else {
            const firstMatchLine = Array.isArray(ranges) ? ranges[0].startLineNumber : ranges.startLineNumber;
            const rangeLocs = mapArrayOrNot(ranges, r => ({
                preview: new SearchRange(r.startLineNumber - firstMatchLine, r.startColumn, r.endLineNumber - firstMatchLine, r.endColumn),
                source: r
            }));
            this.rangeLocations = Array.isArray(rangeLocs) ? rangeLocs : [rangeLocs];
            this.previewText = text;
        }
    }
}
function isSingleLineRangeList(ranges) {
    const line = ranges[0].startLineNumber;
    for (const r of ranges) {
        if (r.startLineNumber !== line || r.endLineNumber !== line) {
            return false;
        }
    }
    return true;
}
export class SearchRange {
    constructor(startLineNumber, startColumn, endLineNumber, endColumn) {
        this.startLineNumber = startLineNumber;
        this.startColumn = startColumn;
        this.endLineNumber = endLineNumber;
        this.endColumn = endColumn;
    }
}
export class OneLineRange extends SearchRange {
    constructor(lineNumber, startColumn, endColumn) {
        super(lineNumber, startColumn, lineNumber, endColumn);
    }
}
export var ViewMode;
(function (ViewMode) {
    ViewMode["List"] = "list";
    ViewMode["Tree"] = "tree";
})(ViewMode || (ViewMode = {}));
export var SearchSortOrder;
(function (SearchSortOrder) {
    SearchSortOrder["Default"] = "default";
    SearchSortOrder["FileNames"] = "fileNames";
    SearchSortOrder["Type"] = "type";
    SearchSortOrder["Modified"] = "modified";
    SearchSortOrder["CountDescending"] = "countDescending";
    SearchSortOrder["CountAscending"] = "countAscending";
})(SearchSortOrder || (SearchSortOrder = {}));
export var SemanticSearchBehavior;
(function (SemanticSearchBehavior) {
    SemanticSearchBehavior["Auto"] = "auto";
    SemanticSearchBehavior["Manual"] = "manual";
    SemanticSearchBehavior["RunOnEmpty"] = "runOnEmpty";
})(SemanticSearchBehavior || (SemanticSearchBehavior = {}));
export function getExcludes(configuration, includeSearchExcludes = true) {
    const fileExcludes = configuration && configuration.files && configuration.files.exclude;
    const searchExcludes = includeSearchExcludes && configuration && configuration.search && configuration.search.exclude;
    if (!fileExcludes && !searchExcludes) {
        return undefined;
    }
    if (!fileExcludes || !searchExcludes) {
        return fileExcludes || searchExcludes || undefined;
    }
    let allExcludes = Object.create(null);
    // clone the config as it could be frozen
    allExcludes = objects.mixin(allExcludes, objects.deepClone(fileExcludes));
    allExcludes = objects.mixin(allExcludes, objects.deepClone(searchExcludes), true);
    return allExcludes;
}
export function pathIncludedInQuery(queryProps, fsPath) {
    const globOptions = queryProps.ignoreGlobCase ? { ignoreCase: true } : undefined;
    if (queryProps.excludePattern && glob.match(queryProps.excludePattern, fsPath, globOptions)) {
        return false;
    }
    if (queryProps.includePattern || queryProps.usingSearchPaths) {
        if (queryProps.includePattern && glob.match(queryProps.includePattern, fsPath, globOptions)) {
            return true;
        }
        // If searchPaths are being used, the extra file must be in a subfolder and match the pattern, if present
        if (queryProps.usingSearchPaths) {
            return !!queryProps.folderQueries && queryProps.folderQueries.some(fq => {
                const searchPath = fq.folder.fsPath;
                if (extpath.isEqualOrParent(fsPath, searchPath, queryProps.ignoreGlobCase)) {
                    const relPath = paths.relative(searchPath, fsPath);
                    return !fq.includePattern || !!glob.match(fq.includePattern, relPath, globOptions);
                }
                else {
                    return false;
                }
            });
        }
        return false;
    }
    return true;
}
export var SearchErrorCode;
(function (SearchErrorCode) {
    SearchErrorCode[SearchErrorCode["unknownEncoding"] = 1] = "unknownEncoding";
    SearchErrorCode[SearchErrorCode["regexParseError"] = 2] = "regexParseError";
    SearchErrorCode[SearchErrorCode["globParseError"] = 3] = "globParseError";
    SearchErrorCode[SearchErrorCode["invalidLiteral"] = 4] = "invalidLiteral";
    SearchErrorCode[SearchErrorCode["rgProcessError"] = 5] = "rgProcessError";
    SearchErrorCode[SearchErrorCode["other"] = 6] = "other";
    SearchErrorCode[SearchErrorCode["canceled"] = 7] = "canceled";
})(SearchErrorCode || (SearchErrorCode = {}));
export class SearchError extends Error {
    constructor(message, code) {
        super(message);
        this.code = code;
    }
}
export function deserializeSearchError(error) {
    const errorMsg = error.message;
    if (isCancellationError(error)) {
        return new SearchError(errorMsg, SearchErrorCode.canceled);
    }
    try {
        const details = JSON.parse(errorMsg);
        return new SearchError(details.message, details.code);
    }
    catch (e) {
        return new SearchError(errorMsg, SearchErrorCode.other);
    }
}
export function serializeSearchError(searchError) {
    const details = { message: searchError.message, code: searchError.code };
    return new Error(JSON.stringify(details));
}
export function isSerializedSearchComplete(arg) {
    // eslint-disable-next-line local/code-no-any-casts
    if (arg.type === 'error') {
        return true;
        // eslint-disable-next-line local/code-no-any-casts
    }
    else if (arg.type === 'success') {
        return true;
    }
    else {
        return false;
    }
}
export function isSerializedSearchSuccess(arg) {
    return arg.type === 'success';
}
export function isSerializedFileMatch(arg) {
    return !!arg.path;
}
const filePatternIgnoreCaseOptions = { ignoreCase: true };
export function isFilePatternMatch(candidate, filePatternToUse, fuzzy = true, ignoreCase) {
    const pathToMatch = candidate.searchPath ? candidate.searchPath : candidate.relativePath;
    return fuzzy ?
        fuzzyContains(pathToMatch, filePatternToUse) :
        glob.match(filePatternToUse, pathToMatch, ignoreCase ? filePatternIgnoreCaseOptions : undefined);
}
export class SerializableFileMatch {
    constructor(path) {
        this.path = path;
        this.results = [];
    }
    addMatch(match) {
        this.results.push(match);
    }
    serialize() {
        return {
            path: this.path,
            results: this.results,
            numMatches: this.results.length
        };
    }
}
/**
 *  Computes the patterns that the provider handles. Discards sibling clauses and 'false' patterns
 */
export function resolvePatternsForProvider(globalPattern, folderPattern) {
    const merged = {
        ...(globalPattern || {}),
        ...(folderPattern || {})
    };
    return Object.keys(merged)
        .filter(key => {
        const value = merged[key];
        return typeof value === 'boolean' && value;
    });
}
export class QueryGlobTester {
    constructor(config, folderQuery) {
        this._parsedIncludeExpression = null;
        const globOptions = config.ignoreGlobCase || folderQuery.ignoreGlobCase ? { ignoreCase: true } : undefined;
        // todo: try to incorporate folderQuery.excludePattern.folder if available
        this._excludeExpression = folderQuery.excludePattern?.map(excludePattern => {
            return {
                ...(config.excludePattern || {}),
                ...(excludePattern.pattern || {})
            };
        }) ?? [];
        if (this._excludeExpression.length === 0) {
            // even if there are no folderQueries, we want to observe  the global excludes
            this._excludeExpression = [config.excludePattern || {}];
        }
        this._parsedExcludeExpression = this._excludeExpression.map(e => glob.parse(e, globOptions));
        // Empty includeExpression means include nothing, so no {} shortcuts
        let includeExpression = config.includePattern;
        if (folderQuery.includePattern) {
            if (includeExpression) {
                includeExpression = {
                    ...includeExpression,
                    ...folderQuery.includePattern
                };
            }
            else {
                includeExpression = folderQuery.includePattern;
            }
        }
        if (includeExpression) {
            this._parsedIncludeExpression = glob.parse(includeExpression, globOptions);
        }
    }
    _evalParsedExcludeExpression(testPath, basename, hasSibling) {
        // todo: less hacky way of evaluating sync vs async sibling clauses
        let result = null;
        for (const folderExclude of this._parsedExcludeExpression) {
            // find first non-null result
            const evaluation = folderExclude(testPath, basename, hasSibling);
            if (typeof evaluation === 'string') {
                result = evaluation;
                break;
            }
        }
        return result;
    }
    matchesExcludesSync(testPath, basename, hasSibling) {
        if (this._parsedExcludeExpression && this._evalParsedExcludeExpression(testPath, basename, hasSibling)) {
            return true;
        }
        return false;
    }
    /**
     * Guaranteed sync - siblingsFn should not return a promise.
     */
    includedInQuerySync(testPath, basename, hasSibling) {
        if (this._parsedExcludeExpression && this._evalParsedExcludeExpression(testPath, basename, hasSibling)) {
            return false;
        }
        if (this._parsedIncludeExpression && !this._parsedIncludeExpression(testPath, basename, hasSibling)) {
            return false;
        }
        return true;
    }
    /**
     * Evaluating the exclude expression is only async if it includes sibling clauses. As an optimization, avoid doing anything with Promises
     * unless the expression is async.
     */
    includedInQuery(testPath, basename, hasSibling) {
        const isIncluded = () => {
            return this._parsedIncludeExpression ?
                !!(this._parsedIncludeExpression(testPath, basename, hasSibling)) :
                true;
        };
        return Promise.all(this._parsedExcludeExpression.map(e => {
            const excluded = e(testPath, basename, hasSibling);
            if (isThenable(excluded)) {
                return excluded.then(excluded => {
                    if (excluded) {
                        return false;
                    }
                    return isIncluded();
                });
            }
            return isIncluded();
        })).then(e => e.some(e => !!e));
    }
    hasSiblingExcludeClauses() {
        return this._excludeExpression.reduce((prev, curr) => hasSiblingClauses(curr) || prev, false);
    }
}
function hasSiblingClauses(pattern) {
    for (const key in pattern) {
        if (typeof pattern[key] !== 'boolean') {
            return true;
        }
    }
    return false;
}
export function hasSiblingPromiseFn(siblingsFn) {
    if (!siblingsFn) {
        return undefined;
    }
    let siblings;
    return (name) => {
        if (!siblings) {
            siblings = (siblingsFn() || Promise.resolve([]))
                .then(list => list ? listToMap(list) : {});
        }
        return siblings.then(map => !!map[name]);
    };
}
export function hasSiblingFn(siblingsFn) {
    if (!siblingsFn) {
        return undefined;
    }
    let siblings;
    return (name) => {
        if (!siblings) {
            const list = siblingsFn();
            siblings = list ? listToMap(list) : {};
        }
        return !!siblings[name];
    };
}
function listToMap(list) {
    const map = {};
    for (const key of list) {
        map[key] = true;
    }
    return map;
}
export function excludeToGlobPattern(excludesForFolder) {
    return excludesForFolder.flatMap(exclude => exclude.patterns.map(pattern => {
        return exclude.baseUri ?
            {
                baseUri: exclude.baseUri,
                pattern: pattern
            } : pattern;
    }));
}
export const DEFAULT_TEXT_SEARCH_PREVIEW_OPTIONS = {
    matchLines: 100,
    charsPerLine: 10000
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VhcmNoLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3NlYXJjaC9jb21tb24vc2VhcmNoLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUVsRSxPQUFPLEtBQUssSUFBSSxNQUFNLGlDQUFpQyxDQUFDO0FBRXhELE9BQU8sS0FBSyxPQUFPLE1BQU0sb0NBQW9DLENBQUM7QUFDOUQsT0FBTyxLQUFLLE9BQU8sTUFBTSxvQ0FBb0MsQ0FBQztBQUM5RCxPQUFPLEVBQUUsYUFBYSxFQUFFLFNBQVMsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBRzlFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUc3RixPQUFPLEtBQUssS0FBSyxNQUFNLGlDQUFpQyxDQUFDO0FBQ3pELE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hFLE9BQU8sRUFBZ0MsNkJBQTZCLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUNsRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFHOUQsT0FBTyxFQUFFLDZCQUE2QixFQUFFLENBQUM7QUFFekMsTUFBTSxDQUFDLE1BQU0sVUFBVSxHQUFHLHVCQUF1QixDQUFDO0FBQ2xELE1BQU0sQ0FBQyxNQUFNLFFBQVEsR0FBRyx3QkFBd0IsQ0FBQztBQUNqRCxNQUFNLENBQUMsTUFBTSxPQUFPLEdBQUcsdUJBQXVCLENBQUM7QUFDL0MsTUFBTSxDQUFDLE1BQU0seUJBQXlCLEdBQUcsZUFBZSxDQUFDO0FBRXpELE1BQU0sQ0FBQyxNQUFNLHFCQUFxQixHQUFHLGdCQUFnQixDQUFDO0FBQ3RELE1BQU0sQ0FBQyxNQUFNLDBCQUEwQixHQUFHLEtBQUssQ0FB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