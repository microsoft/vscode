/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRelativePattern, match as matchGlobPattern } from '../../base/common/glob.js';
import { URI } from '../../base/common/uri.js';
import { normalize } from '../../base/common/path.js';

/** 
 * Defines a language filter with various optional properties.
 */
export interface LanguageFilter {
    readonly language?: string;
    readonly scheme?: string;
    readonly pattern?: string | IRelativePattern;
    readonly notebookType?: string;
    /** This provider is implemented in the UI thread. */
    readonly hasAccessToAllModels?: boolean;
    readonly exclusive?: boolean;
    /** This provider comes from a builtin extension. */
    readonly isBuiltin?: boolean;
}

export type LanguageSelector = string | LanguageFilter | ReadonlyArray<string | LanguageFilter>;

/**
 * Scores the given candidate against the selector.
 */
export function score(
    selector: LanguageSelector | undefined,
    candidateUri: URI,
    candidateLanguage: string,
    candidateIsSynchronized: boolean,
    candidateNotebookUri: URI | undefined,
    candidateNotebookType: string | undefined
): number {

    // If selector is an array, take the max individual value
    if (Array.isArray(selector)) {
        return selector.reduce((maxScore, filter) => {
            const value = score(
                filter, candidateUri, candidateLanguage,
                candidateIsSynchronized, candidateNotebookUri, candidateNotebookType
            );
            return Math.max(maxScore, value === 10 ? value : maxScore);
        }, 0);
    }

    // If selector is a string, handle shorthand language matching
    if (typeof selector === 'string') {
        if (!candidateIsSynchronized) return 0;
        if (selector === '*') return 5;
        return selector === candidateLanguage ? 10 : 0;
    }

    // If selector is a filter, match its properties
    if (selector) {
        const { language, pattern, scheme, hasAccessToAllModels, notebookType } = selector;

        if (!candidateIsSynchronized && !hasAccessToAllModels) {
            return 0;
        }

        // Use notebook URI if selector targets a notebook
        if (notebookType && candidateNotebookUri) {
            candidateUri = candidateNotebookUri;
        }

        let score = 0;

        // Match scheme
        if (scheme) {
            if (scheme === candidateUri.scheme) {
                score = 10;
            } else if (scheme === '*') {
                score = Math.max(score, 5);
            } else {
                return 0;
            }
        }

        // Match language
        if (language) {
            if (language === candidateLanguage) {
                score = 10;
            } else if (language === '*') {
                score = Math.max(score, 5);
            } else {
                return 0;
            }
        }

        // Match notebook type
        if (notebookType) {
            if (notebookType === candidateNotebookType) {
                score = 10;
            } else if (notebookType === '*' && candidateNotebookType !== undefined) {
                score = Math.max(score, 5);
            } else {
                return 0;
            }
        }

        // Match pattern (glob or string)
        if (pattern) {
            const normalizedPattern = normalizePattern(pattern);
            if (normalizedPattern === candidateUri.fsPath || matchGlobPattern(normalizedPattern, candidateUri.fsPath)) {
                score = 10;
            } else {
                return 0;
            }
        }

        return score;
    }

    return 0;
}

/**
 * Normalize the pattern to ensure consistent comparison.
 */
function normalizePattern(pattern: string | IRelativePattern): string | IRelativePattern {
    if (typeof pattern === 'string') {
        return pattern;
    } else {
        return { ...pattern, base: normalize(pattern.base) };
    }
}

/**
 * Check if the selector targets notebooks.
 */
export function targetsNotebooks(selector: LanguageSelector): boolean {
    if (typeof selector === 'string') {
        return false;
    }

    if (Array.isArray(selector)) {
        return selector.some(targetsNotebooks);
    }

    return !!(selector as LanguageFilter).notebookType;
	}
