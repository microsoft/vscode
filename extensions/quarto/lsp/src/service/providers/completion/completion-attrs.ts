/*
 * completion-attrs.ts
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

import { AttrContext, AttrToken, EditorContext, Quarto } from "../../quarto";

export async function attrCompletions(quarto: Quarto, context: EditorContext) {

  // validate trigger
  if (context.trigger && !["="].includes(context.trigger)) {
    return null;
  }

  // check for simple div
  let token = simpleDivToken(context);

  // bypass if the current line doesn't contain a {
  // (performance optimization so we don't execute the regexs
  // below if we don't need to)
  if (!token && context.line.indexOf("{") === -1) {
    return null;
  }

  // see what kind of token we might have
  token =
    token || blockCompletionToken(context) || figureCompletionToken(context);
  if (token) {
    return quarto.getAttrCompletions(token, context);
  } else {
    return null;
  }
}

const kBlockAttrRegex = /^([\t >]*(`{3,}|#+|:{3,}).*?\{)(.*?)\}[ \t]*$/;
function blockCompletionToken(context: EditorContext): AttrToken | undefined {
  return matchCompletionToken(context, kBlockAttrRegex, (type) => {
    return type.indexOf(":") !== -1
      ? "div"
      : type.indexOf("#") !== -1
        ? "heading"
        : "codeblock";
  });
}

const kSimpleDivRegex = /(^[\t >]*(?::{3,})\s+)([\w-]+)\s*$/;
function simpleDivToken(context: EditorContext): AttrToken | undefined {
  const match = context.line.match(kSimpleDivRegex);
  // if we are at the end then return a token
  if (context.line.slice(context.position.column).trim() === "") {
    if (match) {
      return {
        line: context.line,
        context: "div-simple",
        attr: match[2],
        token: match[2],
      };
    }
  }
  return undefined;
}

const kFigureAttrRegex =
  /^([\t >]*(!\[[^\]]*\]\([^\]]+\))\{)([^}]*)\}[ \t]*$/;
function figureCompletionToken(context: EditorContext): AttrToken | undefined {
  return matchCompletionToken(context, kFigureAttrRegex, () => "figure");
}

function matchCompletionToken(
  context: EditorContext,
  pattern: RegExp,
  type: (type: string) => string
): AttrToken | undefined {
  const match = context.line.match(pattern);
  if (match) {
    // is the cursor in the attr region? (group 3)
    const beginAttr = match[1].length;
    const endAttr = match[1].length + match[3].length;
    const col = context.position.column;

    if (col >= beginAttr && col <= endAttr) {
      // is the next character a space or '}' ?
      if (context.line[col] === " " || context.line[col] === "}") {
        // token is the current location back to the next space or {
        const attrToCursor = context.line.slice(beginAttr, col);
        const spacePos = attrToCursor.lastIndexOf(" ");
        const token =
          spacePos !== -1
            ? match[3].slice(spacePos + 1, col - beginAttr)
            : match[3].slice(0, col - beginAttr);

        // return scope & token
        return {
          line: context.line,
          context: type(match[2]) as AttrContext,
          attr: match[3],
          token,
        };
      }
    }
  }
  return undefined;
}
