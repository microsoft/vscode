/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { match as matchGlobPattern } from '../../base/common/glob.js';
import { normalize } from '../../base/common/path.js';
export function score(selector, candidateUri, candidateLanguage, candidateIsSynchronized, candidateNotebookUri, candidateNotebookType) {
    if (Array.isArray(selector)) {
        // array -> take max individual value
        let ret = 0;
        for (const filter of selector) {
            const value = score(filter, candidateUri, candidateLanguage, candidateIsSynchronized, candidateNotebookUri, candidateNotebookType);
            if (value === 10) {
                return value; // already at the highest
            }
            if (value > ret) {
                ret = value;
            }
        }
        return ret;
    }
    else if (typeof selector === 'string') {
        if (!candidateIsSynchronized) {
            return 0;
        }
        // short-hand notion, desugars to
        // 'fooLang' -> { language: 'fooLang'}
        // '*' -> { language: '*' }
        if (selector === '*') {
            return 5;
        }
        else if (selector === candidateLanguage) {
            return 10;
        }
        else {
            return 0;
        }
    }
    else if (selector) {
        // filter -> select accordingly, use defaults for scheme
        const { language, pattern, scheme, hasAccessToAllModels, notebookType } = selector; // TODO: microsoft/TypeScript#42768
        if (!candidateIsSynchronized && !hasAccessToAllModels) {
            return 0;
        }
        // selector targets a notebook -> use the notebook uri instead
        // of the "normal" document uri.
        if (notebookType && candidateNotebookUri) {
            candidateUri = candidateNotebookUri;
        }
        let ret = 0;
        if (scheme) {
            if (scheme === candidateUri.scheme) {
                ret = 10;
            }
            else if (scheme === '*') {
                ret = 5;
            }
            else {
                return 0;
            }
        }
        if (language) {
            if (language === candidateLanguage) {
                ret = 10;
            }
            else if (language === '*') {
                ret = Math.max(ret, 5);
            }
            else {
                return 0;
            }
        }
        if (notebookType) {
            if (notebookType === candidateNotebookType) {
                ret = 10;
            }
            else if (notebookType === '*' && candidateNotebookType !== undefined) {
                ret = Math.max(ret, 5);
            }
            else {
                return 0;
            }
        }
        if (pattern) {
            let normalizedPattern;
            if (typeof pattern === 'string') {
                normalizedPattern = pattern;
            }
            else {
                // Since this pattern has a `base` property, we need
                // to normalize this path first before passing it on
                // because we will compare it against `Uri.fsPath`
                // which uses platform specific separators.
                // Refs: https://github.com/microsoft/vscode/issues/99938
                normalizedPattern = { ...pattern, base: normalize(pattern.base) };
            }
            if (normalizedPattern === candidateUri.fsPath || matchGlobPattern(normalizedPattern, candidateUri.fsPath)) {
                ret = 10;
            }
            else {
                return 0;
            }
        }
        return ret;
    }
    else {
        return 0;
    }
}
export function targetsNotebooks(selector) {
    if (typeof selector === 'string') {
        return false;
    }
    else if (Array.isArray(selector)) {
        return selector.some(targetsNotebooks);
    }
    else {
        return !!selector.notebookType;
    }
}
export function selectLanguageIds(selector, into) {
    if (typeof selector === 'string') {
        into.add(selector);
    }
    else if (Array.isArray(selector)) {
        for (const item of selector) {
            selectLanguageIds(item, into);
        }
    }
    else {
        const language = selector.language;
        if (language) {
            into.add(language);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFuZ3VhZ2VTZWxlY3Rvci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VTZWxlY3Rvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQW9CLEtBQUssSUFBSSxnQkFBZ0IsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBRXhGLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQXFCdEQsTUFBTSxVQUFVLEtBQUssQ0FBQyxRQUFzQyxFQUFFLFlBQWlCLEVBQUUsaUJBQXlCLEVBQUUsdUJBQWdDLEVBQUUsb0JBQXFDLEVBQUUscUJBQXlDO0lBRTdOLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO1FBQzdCLHFDQUFxQztRQUNyQyxJQUFJLEdBQUcsR0FBRyxDQUFDLENBQUM7UUFDWixLQUFLLE1BQU0sTUFBTSxJQUFJLFFBQVEsRUFBRSxDQUFDO1lBQy9CLE1BQU0sS0FBSyxHQUFHLEtBQUssQ0FBQyxNQUFNLEVBQUUsWUFBWSxFQUFFLGlCQUFpQixFQUFFLHVCQUF1QixFQUFFLG9CQUFvQixFQUFFLHFCQUFxQixDQUFDLENBQUM7WUFDbkksSUFBSSxLQUFLLEtBQUssRUFBRSxFQUFFLENBQUM7Z0JBQ2xCLE9BQU8sS0FBSyxDQUFDLENBQUMseUJBQXlCO1lBQ3hDLENBQUM7WUFDRCxJQUFJLEtBQUssR0FBRyxHQUFHLEVBQUUsQ0FBQztnQkFDakIsR0FBRyxHQUFHLEtBQUssQ0FBQztZQUNiLENBQUM7UUFDRixDQUFDO1FBQ0QsT0FBTyxHQUFHLENBQUM7SUFFWixDQUFDO1NBQU0sSUFBSSxPQUFPLFFBQVEsS0FBSyxRQUFRLEVBQUUsQ0FBQztRQUV6QyxJQUFJLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztZQUM5QixPQUFPLENBQUMsQ0FB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