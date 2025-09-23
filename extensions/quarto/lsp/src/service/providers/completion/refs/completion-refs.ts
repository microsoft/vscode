/*
 * completion-refs.ts
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

import { Range, Position } from "vscode-languageserver-types";

import { CompletionItem, TextDocuments } from "vscode-languageserver";
import { bypassRefIntelligence } from "../../../util/refs";

import { EditorContext, Quarto } from "../../../quarto";
import { projectDirForDocument, filePathForDoc, Document, Parser } from "quarto-core";
import { biblioCompletions } from "./completion-biblio";
import { crossrefCompletions } from "./completion-crossref";
import { editorServerDocuments } from "editor-server";

export async function refsCompletions(
  quarto: Quarto,
  parser: Parser,
  doc: Document,
  pos: Position,
  context: EditorContext,
  documents: TextDocuments<Document>,
): Promise<CompletionItem[] | null> {

  // validate trigger
  if (context.trigger && !["@"].includes(context.trigger)) {
    return null;
  }

  if (bypassRefIntelligence(parser, doc, pos, context.line)) {
    return null;
  }

  // scan back from the cursor to see if there is a @
  const line = doc
    .getText(Range.create(pos.line, 0, pos.line + 1, 0))
    .trimEnd();
  const text = line.slice(0, pos.character);
  const atPos = text.lastIndexOf("@");
  const spacePos = text.lastIndexOf(" ");

  if (atPos !== -1 && atPos > spacePos) {
    // everything between the @ and the cursor must match the cite pattern
    const tokenText = text.slice(atPos + 1, pos.character);
    if (/[^@;[\]\s!,]*/.test(tokenText)) {
      // make sure there is no text directly ahead (except bracket, space, semicolon)
      const nextChar = text.slice(pos.character, pos.character + 1);
      if (!nextChar || [";", " ", "]"].includes(nextChar)) {
        // construct path
        const path = filePathForDoc(doc);
        const projectDir = projectDirForDocument(path);
        const biblioItems = await biblioCompletions(quarto, parser, tokenText, doc);
        const crossrefItems = await crossrefCompletions(
          quarto,
          tokenText,
          path,
          editorServerDocuments(documents),
          projectDir
        );
        if (biblioItems || crossrefItems) {
          return (biblioItems || []).concat(crossrefItems || []);
        } else {
          return null;
        }
      }
    }
  }

  return null;
}
