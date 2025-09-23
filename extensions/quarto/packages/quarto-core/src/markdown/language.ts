/*
 * lanugage.ts
 *
 * Copyright (C) 2022 by Posit Software, PBC
 *
 * Unless you have received this program directly from Posit Software pursuant
 * to the terms of a commercial license agreement with Posit Software, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */

import { Position } from "../position";

import { Token, TokenCodeBlock, TokenMath, isCodeBlock, isMath, kAttrClasses  } from "./token";

export function isLanguageBlock(token: Token) {
  return isCodeBlock(token) || isDisplayMath(token);
}

// a language block that will be executed with its results
// inclued in the document (either by an engine or because
// it is a raw or display math block)
export function isExecutableLanguageBlock(token: Token) : token is TokenMath | TokenCodeBlock {
  if (isDisplayMath(token)) {
    return true;
  } else if (isCodeBlock(token) && token.attr?.[kAttrClasses].length) {
    const clz = token.attr?.[kAttrClasses][0];
    if (!clz) {
      return false;
    }
    return !!clz.match(/^\{=?([a-zA-Z0-9_-]+)(?: *[ ,].*?)?/);
  } else {
    return false;
  }
}

export function codeForExecutableLanguageBlock(token: TokenMath | TokenCodeBlock) {
  if (isMath(token)) {
    return token.data.text;
  } else if (isCodeBlock(token)) {
    return token.data + "\n";
  } else {
    return "";
  }
}


export function languageBlockAtPosition(
  tokens: Token[],
  position: Position,
  includeFence = false
) {
  for (const languageBlock of tokens.filter(isExecutableLanguageBlock)) {
    let start = languageBlock.range.start.line;
    let end = languageBlock.range.end.line;
    if (!includeFence) {
      start++;
      end--;
    }
    if (position.line >= start && position.line <= end) {
      return languageBlock;
    }
  }
  return undefined;
}


export function isDisplayMath(token: Token): token is TokenMath {
  if (isMath(token)) {
    const math = token.data;
    return math.type === "DisplayMath";
  } else {
    return false;
  }
}

export function isDiagram(token: Token) : token is TokenCodeBlock {
  return (
    isExecutableLanguageBlockOf("mermaid")(token) ||
    isExecutableLanguageBlockOf("dot")(token)
  );
}

export function languageNameFromBlock(token: Token) {
  if (isDisplayMath(token)) {
    return "tex";
  } else if (isCodeBlock(token) && token.attr?.[kAttrClasses].length) {
    const match = token.attr?.[kAttrClasses][0].match(/^\{?=?([a-zA-Z0-9_-]+)/);
    if (match) {
      return match[1].split("-").pop() || "";
    } else {
      return "";
    }
  } else {
    return "";
  }
}

export function isExecutableLanguageBlockOf(language: string) {
  return (token: Token) : token is TokenMath | TokenCodeBlock => {
    return (
      isExecutableLanguageBlock(token) &&
      languageNameFromBlock(token) === language
    );
  };
}