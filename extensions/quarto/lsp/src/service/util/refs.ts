/*
 * refs.ts
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

import { Position } from "vscode-languageserver-types";

import { Document, Parser, isContentPosition } from "quarto-core";


export function bypassRefIntelligence(
  parser: Parser,
  doc: Document,
  pos: Position,
  line: string
): boolean {
  // bypass if the current line doesn't contain a @
  // (performance optimization so we don't execute the regexs
  // below if we don't need to)
  if (line.indexOf("@") === -1) {
    return true;
  }

  // ensure we have the file scheme
  if (!doc.uri.startsWith("file:")) {
    return true;
  }

  // check if we are in markdown
  if (!isContentPosition(parser, doc, pos)) {
    return true;
  }

  return false;
}
