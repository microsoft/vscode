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

function isValidScheme(selectorScheme: string | undefined, candidateUriScheme: string): boolean {
  if (!selectorScheme) return true;
  return selectorScheme === '*' || selectorScheme === candidateUriScheme;
}

function isValidLanguage(selectorLanguage: string | undefined, candidateLanguage: string): boolean {
  if (!selectorLanguage) return true;
  return selectorLanguage === '*' || selectorLanguage === candidateLanguage;
}

function isValidNotebookType(notebookType: string | undefined, candidateNotebookType: string | undefined): boolean {
  if (!notebookType) return true;
  return notebookType === '*' || notebookType === candidateNotebookType;
}

function isValidPattern(pattern: string | IRelativePattern | undefined, targetUriFsPath: string): boolean {
  if (!pattern) return true;
  let normalizedPattern: string | IRelativePattern;
  if (typeof pattern === 'string') {
    normalizedPattern = pattern;
  } else {
    normalizedPattern = { ...pattern, base: normalize(pattern.base) };
  }
  return normalizedPattern === targetUriFsPath || matchGlobPattern(normalizedPattern, targetUriFsPath);
}

export function score(
  selector: LanguageSelector | undefined,
  candidateUri: URI,
  candidateLanguage: string,
  candidateIsSynchronized: boolean,
  candidateNotebookUri: URI | undefined,
  candidateNotebookType: string | undefined
): number {
  // Debugging output
  console.log('Selector:', selector);
  console.log('Candidate Language:', candidateLanguage);
  console.log('Candidate URI:', candidateUri.toString());
  console.log('Candidate Is Synchronized:', candidateIsSynchronized);
  console.log('Candidate Notebook URI:', candidateNotebookUri?.toString());
  console.log('Candidate Notebook Type:', candidateNotebookType);

  // If selector is an array, take the maximum individual value
  if (Array.isArray(selector)) {
    return Math.max(...selector.map(filter =>
      score(filter, candidateUri, candidateLanguage, candidateIsSynchronized, candidateNotebookUri, candidateNotebookType)
    ));
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

    // Check synchronization and model access
    if (!candidateIsSynchronized && !hasAccessToAllModels) {
      return 0;
    }

    // Use notebookUri instead of candidateUri
    const targetUri = notebookType && candidateNotebookUri ? candidateNotebookUri : candidateUri;

    let score = 0;

    // Check scheme
    if (isValidScheme(scheme, targetUri.scheme)) {
      score = scheme === targetUri.scheme ? 10 : Math.max(score, 5);
    } else {
      return 0;
    }

    // Check language
    if (isValidLanguage(language, candidateLanguage)) {
      score = language === candidateLanguage ? 10 : Math.max(score, 5);
    } else {
      return 0;
    }

    // Check notebookType
    if (!isValidNotebookType(notebookType, candidateNotebookType)) {
      return 0;
    }

    // Check pattern
    if (isValidPattern(pattern, targetUri.fsPath)) {
      score = 10;
    } else {
      return 0;
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
