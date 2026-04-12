/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { asArray, coalesce } from '../../../../base/common/arrays.js';
import { DEFAULT_TEXT_SEARCH_PREVIEW_OPTIONS } from './search.js';
import { TextSearchContext2, TextSearchMatch2 } from './searchExtTypes.js';
/**
 * Checks if the given object is of type TextSearchMatch.
 * @param object The object to check.
 * @returns True if the object is a TextSearchMatch, false otherwise.
 */
function isTextSearchMatch(object) {
    return 'uri' in object && 'ranges' in object && 'preview' in object;
}
function newToOldFileProviderOptions(options) {
    return options.folderOptions.map(folderOption => ({
        folder: folderOption.folder,
        excludes: folderOption.excludes.map(e => typeof (e) === 'string' ? e : e.pattern),
        includes: folderOption.includes,
        useGlobalIgnoreFiles: folderOption.useIgnoreFiles.global,
        useIgnoreFiles: folderOption.useIgnoreFiles.local,
        useParentIgnoreFiles: folderOption.useIgnoreFiles.parent,
        followSymlinks: folderOption.followSymlinks,
        maxResults: options.maxResults,
        session: options.session // TODO: make sure that we actually use a cancellation token here.
    }));
}
export class OldFileSearchProviderConverter {
    constructor(provider) {
        this.provider = provider;
    }
    provideFileSearchResults(pattern, options, token) {
        const getResult = async () => {
            const newOpts = newToOldFileProviderOptions(options);
            return Promise.all(newOpts.map(o => this.provider.provideFileSearchResults({ pattern }, o, token)));
        };
        return getResult().then(e => coalesce(e).flat());
    }
}
function newToOldTextProviderOptions(options) {
    return options.folderOptions.map(folderOption => ({
        folder: folderOption.folder,
        excludes: folderOption.excludes.map(e => typeof (e) === 'string' ? e : e.pattern),
        includes: folderOption.includes,
        useGlobalIgnoreFiles: folderOption.useIgnoreFiles.global,
        useIgnoreFiles: folderOption.useIgnoreFiles.local,
        useParentIgnoreFiles: folderOption.useIgnoreFiles.parent,
        followSymlinks: folderOption.followSymlinks,
        maxResults: options.maxResults,
        previewOptions: newToOldPreviewOptions(options.previewOptions),
        maxFileSize: options.maxFileSize,
        encoding: folderOption.encoding,
        afterContext: options.surroundingContext,
        beforeContext: options.surroundingContext
    }));
}
export function newToOldPreviewOptions(options) {
    return {
        matchLines: options?.matchLines ?? DEFAULT_TEXT_SEARCH_PREVIEW_OPTIONS.matchLines,
        charsPerLine: options?.charsPerLine ?? DEFAULT_TEXT_SEARCH_PREVIEW_OPTIONS.charsPerLine
    };
}
export function oldToNewTextSearchResult(result) {
    if (isTextSearchMatch(result)) {
        const ranges = asArray(result.ranges).map((r, i) => {
            const previewArr = asArray(result.preview.matches);
            const matchingPreviewRange = previewArr[i];
            return { sourceRange: r, previewRange: matchingPreviewRange };
        });
        return new TextSearchMatch2(result.uri, ranges, result.preview.text);
    }
    else {
        return new TextSearchContext2(result.uri, result.text, result.lineNumber);
    }
}
export class OldTextSearchProviderConverter {
    constructor(provider) {
        this.provider = provider;
    }
    provideTextSearchResults(query, options, progress, token) {
        const progressShim = (oldResult) => {
            if (!validateProviderResult(oldResult)) {
                return;
            }
            progress.report(oldToNewTextSearchResult(oldResult));
        };
        const getResult = async () => {
            return coalesce(await Promise.all(newToOldTextProviderOptions(options).map(o => this.provider.provideTextSearchResults(query, o, { report: (e) => progressShim(e) }, token))))
                .reduce((prev, cur) => ({ limitHit: prev.limitHit || cur.limitHit }), { limitHit: false });
        };
        const oldResult = getResult();
        return oldResult.then((e) => {
            return {
                limitHit: e.limitHit,
                message: coalesce(asArray(e.message))
            };
        });
    }
}
function validateProviderResult(result) {
    if (extensionResultIsMatch(result)) {
        if (Array.isArray(result.ranges)) {
            if (!Array.isArray(result.preview.matches)) {
                console.warn('INVALID - A text search provider match\'s`ranges` and`matches` properties must have the same type.');
                return false;
            }
            if (result.preview.matches.length !== result.ranges.length) {
                console.warn('INVALID - A text search provider match\'s`ranges` and`matches` properties must have the same length.');
                return false;
            }
        }
        else {
            if (Array.isArray(result.preview.matches)) {
                console.warn('INVALID - A text search provider match\'s`ranges` and`matches` properties must have the same length.');
                return false;
            }
        }
    }
    return true;
}
export function extensionResultIsMatch(data) {
    return !!data.preview;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VhcmNoRXh0Q29udmVyc2lvblR5cGVzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3NlYXJjaC9jb21tb24vc2VhcmNoRXh0Q29udmVyc2lvblR5cGVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFJdEUsT0FBTyxFQUFFLG1DQUFtQyxFQUFFLE1BQU0sYUFBYSxDQUFDO0FBQ2xFLE9BQU8sRUFBOEYsa0JBQWtCLEVBQUUsZ0JBQWdCLEVBQWtILE1BQU0scUJBQXFCLENBQUM7QUFzU3ZSOzs7O0dBSUc7QUFDSCxTQUFTLGlCQUFpQixDQUFDLE1BQVc7SUFDckMsT0FBTyxLQUFLLElBQUksTUFBTSxJQUFJLFFBQVEsSUFBSSxNQUFNLElBQUksU0FBUyxJQUFJLE1BQU0sQ0FBQztBQUNyRSxDQUFDO0FBK0hELFNBQVMsMkJBQTJCLENBQUMsT0FBa0M7SUFDdEUsT0FBTyxPQUFPLENBQUMsYUFBYSxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDakQsTUFBTSxFQUFFLFlBQVksQ0FBQyxNQUFNO1FBQzNCLFFBQVEsRUFBRSxZQUFZLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQztRQUNqRixRQUFRLEVBQUUsWUFBWSxDQUFDLFFBQVE7UUFDL0Isb0JBQW9CLEVBQUUsWUFBWSxDQUFDLGNBQWMsQ0FBQyxNQUFNO1FBQ3hELGNBQWMsRUFBRSxZQUFZLENBQUMsY0FBYyxDQUFDLEtBQUs7UUFDakQsb0JB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