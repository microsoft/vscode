/*
 * completion-biblio.ts
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

import {
  CompletionItem,
  CompletionItemKind,
  MarkupKind,
} from "vscode-languageserver";
import { cslRefs } from "editor-server";

import { Document, Parser, filePathForDoc, documentFrontMatter } from "quarto-core";
import { Quarto } from "../../../quarto";

export async function biblioCompletions(
  quarto: Quarto,
  parser: Parser,
  token: string,
  doc: Document
): Promise<CompletionItem[] | null> {
  const refs = cslRefs(quarto, filePathForDoc(doc), documentFrontMatter(parser, doc));
  if (refs) {
    return refs
      .filter((ref) => ref.id.startsWith(token))
      .map((ref) => ({
        kind: CompletionItemKind.Constant,
        label: ref.id,
        documentation: ref.cite
          ? {
            kind: MarkupKind.Markdown,
            value: ref.cite,
          }
          : undefined,
      }));
  } else {
    return null;
  }
}
