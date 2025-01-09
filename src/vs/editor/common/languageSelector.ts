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
  /**
   * This provider is implemented in the UI thread.
   */
  readonly hasAccessToAllModels?: boolean;
  readonly exclusive?: boolean;

  /**
   * This provider comes from a built-in extension.
   */
  readonly isBuiltin?: boolean;
}

export type LanguageSelector = string | LanguageFilter | ReadonlyArray<string | LanguageFilter>;

export function score(
  selector: LanguageSelector | undefined,
  candidateUri: URI,
  candidateLanguage: string,
  candidateIsSynchronized: boolean,
  candidateNotebookUri: URI | undefined,
  candidateNotebookType: string | undefined
): number {
  // If selector is an array, take the maximum individual value
  if (Array.isArray(selector)) {
    return Math.max(...selector.map(filter => score(filter, candidateUri, candidateLanguage, candidateIsSynchronized, candidateNotebookUri, candidateNotebookType)));
  }

  // If selector is a string, perform simplified checks
  if (typeof selector === 'string') {
    if (!candidateIsSynchronized) {
      return 0;
    }
    return selector === '*' ? 5 : selector === candidateLanguage ? 10 : 0;
  }

  // If selector is an object, check each condition step by step
  if (selector) {
    const { language, pattern, scheme, hasAccessToAllModels, notebookType } = selector as LanguageFilter;

    if (!candidateIsSynchronized && !hasAccessToAllModels) {
      return 0;
    }

    // Use notebookUri instead of candidateUri
    const targetUri = notebookType && candidateNotebookUri ? candidateNotebookUri : candidateUri;

    let score = 0;

    // Check scheme
    if (scheme && (scheme === targetUri.scheme || scheme === '*')) {
      score = scheme === targetUri.scheme ? 10 : Math.max(score, 5);
    }

    // Check language
    if (language && (language === candidateLanguage || language === '*')) {
      score = language === candidateLanguage ? 10 : Math.max(score, 5);
    }

    // Check notebookType
    if (notebookType && notebookType !== candidateNotebookType) {
      return 0;
    }

    // Check pattern
    if (pattern) {
      const normalizedPattern = typeof pattern === 'string' ? pattern : { ...pattern, base: normalize(pattern.base) };
      if (normalizedPattern === targetUri.fsPath || matchGlobPattern(normalizedPattern, targetUri.fsPath)) {
        score = 10;
      } else {
        return 0;
      }
    }

    return score;
  }

  return 0;
}

export function targetsNotebooks(selector: LanguageSelector): boolean {
  if (typeof selector === 'string') {
    return false;
  } else if (Array.isArray(selector)) {
    return selector.some(targetsNotebooks);
  } else {
    return !!(selector as LanguageFilter).notebookType;
  }
}
