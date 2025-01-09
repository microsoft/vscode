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

/**
 * This function scores the match between a given selector and a candidate resource.
 */
export function score(
  selector: LanguageSelector | undefined,
  candidateUri: URI,
  candidateLanguage: string,
  candidateIsSynchronized: boolean,
  candidateNotebookUri: URI | undefined,
  candidateNotebookType: string | undefined
): number {
  // 如果 selector 是数组，递归计算并取最大分数
  if (Array.isArray(selector)) {
    return Math.max(...selector.map(filter => score(filter, candidateUri, candidateLanguage, candidateIsSynchronized, candidateNotebookUri, candidateNotebookType)));
  }

  // 如果 selector 是字符串，进行简化检查
  if (typeof selector === 'string') {
    if (!candidateIsSynchronized) {
      return 0;
    }
    return selector === '*' ? 5 : selector === candidateLanguage ? 10 : 0;
  }

  // 如果 selector 是对象，逐步检查每个条件
  if (selector) {
    const { language, pattern, scheme, hasAccessToAllModels, notebookType } = selector as LanguageFilter;

    // 如果数据未同步且没有完全访问权限，返回 0
    if (!candidateIsSynchronized && !hasAccessToAllModels) {
      return 0;
    }

    // 如果 selector 指定了 notebookType 且有 notebookUri，则使用 notebookUri
    const targetUri = notebookType && candidateNotebookUri ? candidateNotebookUri : candidateUri;

    let score = 0;

    // 检查 scheme 是否匹配
    if (scheme) {
      if (scheme === targetUri.scheme) {
        score = 10;
      } else if (scheme === '*') {
        score = Math.max(score, 5);
      }
    }

    // 检查 language 是否匹配
    if (language) {
      if (language === candidateLanguage) {
        score = 10;
      } else if (language === '*') {
        score = Math.max(score, 5);
      }
    }

    // 检查 notebookType 是否匹配
    if (notebookType && notebookType !== candidateNotebookType) {
      return 0; // 如果 notebookType 不匹配，返回 0
    }

    // 检查 pattern 是否匹配
    if (pattern) {
      const normalizedPattern = typeof pattern === 'string' ? pattern : { ...pattern, base: normalize(pattern.base) };

      // 如果 pattern 匹配，则分数为 10
      if (normalizedPattern === targetUri.fsPath || matchGlobPattern(normalizedPattern, targetUri.fsPath)) {
        score = 10;
      } else {
        return 0; // 如果 pattern 不匹配，返回 0
      }
    }

    return score;
  }

  return 0; // 默认返回 0
}

/**
 * This function checks if the selector targets notebooks.
 */
export function targetsNotebooks(selector: LanguageSelector): boolean {
  if (typeof selector === 'string') {
    return false;
  } else if (Array.isArray(selector)) {
    // 递归检查数组中的任意元素是否指向 notebooks
    return selector.some(targetsNotebooks);
  } else {
    // 检查是否存在 notebookType
    return !!(selector as LanguageFilter).notebookType;
  }
}
