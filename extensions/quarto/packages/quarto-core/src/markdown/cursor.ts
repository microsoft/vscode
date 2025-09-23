/*
 * latex.ts
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

import { Range, Position } from "vscode-languageserver";

import { Document } from "../document";

import { Parser } from "./parser";
import { Token, TokenMath, isRawBlock, kAttrClasses } from "./token";
import { isDisplayMath } from "./language";



export function mathRange(parser: Parser, doc: Document, pos: Position) {
  // see if we are in a math block
  const tokens = parser(doc);
  const mathBlock = tokens.find(isMathBlockAtPosition(pos));
  if (mathBlock) {
    return {
      math: mathBlock.data.text,
      range: mathBlock.range,
    };
  }

  // see if we are in an inline range
  const line = doc
    .getText(Range.create(pos.line, 0, pos.line + 1, 0))
    .trimEnd();
  return (
    inlineMathRange(pos, line, kInlineMathPattern) ||
    inlineMathRange(pos, line, kSingleLineDisplayMathPattern)
  );
}

export function isLatexPosition(parser: Parser, doc: Document, pos: Position) {
  // math is always latex
  if (mathRange(parser, doc, pos)) {
    return true;
  }
  //
  const tokens = parser(doc);
  const codeBlock = tokens.find(isCodeBlockAtPosition(pos));
  if (codeBlock) {
    // code block is latex only if it's 'tex' or 'latex'
    return isLatexCodeBlock(codeBlock);
  } else {
    // non code block is latex
    return true;
  }
}

export function isContentPosition(parser: Parser, doc: Document, pos: Position) {
  const tokens = parser(doc);
  const codeBlock = tokens.find(isCodeBlockAtPosition(pos))
  return !codeBlock && !mathRange(parser, doc, pos);
}

function isMathBlockAtPosition(pos: Position) {
  return (token: Token) : token is TokenMath => {
    return isDisplayMath(token) && posIsWithinToken(pos, token);
  }
}

function isCodeBlockAtPosition(pos: Position) {
  return (token: Token) => {
    return ["CodeBlock", "RawBlock"].includes(token.type) && posIsWithinToken(pos, token);
  } 
}

function posIsWithinToken(pos: Position, token: Token) {
  return pos.line >= token.range.start.line && pos.line < token.range.end.line;
}

function isLatexCodeBlock(token: Token) {
  const formats = ["tex", "latex"];
  if (isRawBlock(token)) {
    const raw = token.data;
    return formats.includes(raw.format);
  } else if (token.type === "CodeBlock") {
    return formats.includes(token.attr?.[kAttrClasses][0] || "");
  } else {
    return false;
  }
}

const kInlineMathPattern = /\$([^ ].*?[^ ]?)\$/g;
const kSingleLineDisplayMathPattern = /\$\$([^\n]+?)\$\$/;

function inlineMathRange(pos: Position, line: string, pattern: RegExp) {
  pattern.lastIndex = 0;
  let match = pattern.exec(line);
  while (match) {
    const range = Range.create(
      Position.create(pos.line, match.index || 0),
      Position.create(pos.line, (match.index || 0) + match[0].length)
    );
    if (
      range.start.character <= pos.character &&
      range.end.character >= pos.character
    ) {
      return {
        math: match[1],
        range,
      };
    }
    match = pattern.exec(line);
  }
  return null;
}

