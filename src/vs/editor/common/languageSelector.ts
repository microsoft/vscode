/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRelativePattern, match as matchGlobPattern } from '../../base/common/glob.js';
import { URI } from '../../base/common/uri.js';
import { normalize } from '../../base/common/path.js';

export interface LanguageFilter {
  readonly language?: string;
  readonly scheme?: string;
  readonly pattern?: string | IRelativePattern;
  readonly notebookType?: string;
  readonly hasAccessToAllModels?: boolean;
  readonly exclusive?: boolean;
  readonly isBuiltin?: boolean;
}

export type LanguageSelector = string | LanguageFilter | ReadonlyArray<string | LanguageFilter>;

/**
 * Score a language selector against a candidate.
 * @param selector Language selector, can be a string, filter or an array of selectors
 * @param candidateUri The URI of the candidate
 * @param candidateLanguage The language of the candidate
 * @param candidateIsSynchronized Whether the candidate is synchronized
 * @param candidateNotebookUri The URI of the notebook (if any)
 * @param candidateNotebookType The type of the notebook (if any)
 * @returns A score indicating the match quality
 */
export function score(
  selector: LanguageSelector | undefined,
  candidateUri: URI,
  candidateLanguage: string,
  candidateIsSynchronized: boolean,
  candidateNotebookUri: URI | undefined,
  candidateNotebookType: string | undefined
): number {
  if (!selector) return 0;

  // If selector is an array, recursively score all items and take the max
  if (Array.isArray(selector)) {
    return Math.max(...selector.map(filter => score(filter, candidateUri, candidateLanguage, candidateIsSynchronized, candidateNotebookUri, candidateNotebookType)));
  }

  // If selector is a string, perform simple checks
  if (typeof selector === 'string') {
    return scoreStringSelector(selector, candidateLanguage, candidateIsSynchronized);
  }

  // Otherwise, it's a LanguageFilter, handle accordingly
  const { language, scheme, pattern, notebookType, hasAccessToAllModels } = selector;

  if (!candidateIsSynchronized && !hasAccessToAllModels) {
    return 0;
  }

  const targetUri = notebookType && candidateNotebookUri ? candidateNotebookUri : candidateUri;

  let score = 0;

  // Check scheme
  score += checkScheme(scheme, targetUri);

  // Check language
  score += checkLanguage(language, candidateLanguage);

  // Check notebook type
  score += checkNotebookType(notebookType, candidateNotebookType);

  // Check pattern
  score += checkPattern(pattern, targetUri);

  return score;
}

function scoreStringSelector(selector: string, candidateLanguage: string, candidateIsSynchronized: boolean): number {
  if (!candidateIsSynchronized) return 0;
  return selector === '*' ? 5 : selector === candidateLanguage ? 10 : 0;
}

function checkScheme(scheme: string | undefined, targetUri: URI): number {
  if (!scheme) return 0;
  if (scheme === targetUri.scheme) return 10;
  if (scheme === '*') return 5;
  return 0;
}

function checkLanguage(language: string | undefined, candidateLanguage: string): number {
  if (!language) return 0;
  if (language === candidateLanguage) return 10;
  if (language === '*') return 5;
  return 0;
}

function checkNotebookType(notebookType: string | undefined, candidateNotebookType: string | undefined): number {
  if (!notebookType) return 0;
  return notebookType === candidateNotebookType ? 10 : 0;
}

function checkPattern(pattern: string | IRelativePattern | undefined, targetUri: URI): number {
  if (!pattern) return 0;

  const normalizedPattern = typeof pattern === 'string' ? pattern : { ...pattern, base: normalize(pattern.base) };

  if (normalizedPattern === targetUri.fsPath || matchGlobPattern(normalizedPattern, targetUri.fsPath)) {
    return 10;
  }

  return 0;
}

/**
 * Check if the selector targets notebooks.
 * @param selector Language selector, can be a string, filter or an array of selectors
 * @returns Whether the selector targets notebooks
 */
export function targetsNotebooks(selector: LanguageSelector): boolean {
  if (typeof selector === 'string') return false;
  if (Array.isArray(selector)) return selector.some(targetsNotebooks);
  return !!(selector as LanguageFilter).notebookType;
	}
