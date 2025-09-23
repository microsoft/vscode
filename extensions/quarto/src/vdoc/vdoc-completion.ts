/*
 * vdoc-completion.ts
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

import { commands, Position, Uri, CompletionList, CompletionItem, Range } from "vscode";
import { EmbeddedLanguage } from "./languages";
import { adjustedPosition, unadjustedRange, VirtualDoc, withVirtualDocUri } from "./vdoc";

export async function vdocCompletions(
  vdoc: VirtualDoc,
  position: Position,
  trigger: string | undefined,
  language: EmbeddedLanguage,
  parentUri: Uri
) {
  const completions = await withVirtualDocUri(vdoc, parentUri, "completion", async (uri: Uri) => {
    return await commands.executeCommand<CompletionList>(
      "vscode.executeCompletionItemProvider",
      uri,
      adjustedPosition(language, position),
      trigger
    );
  });
  return completions.items.map((completion: CompletionItem) => {
    if (language.inject && completion.range) {
      if (completion.range instanceof Range) {
        completion.range = unadjustedRange(language, completion.range);
      } else {
        completion.range.inserting = unadjustedRange(
          language,
          completion.range.inserting
        );
        completion.range.replacing = unadjustedRange(
          language,
          completion.range.replacing
        );
      }
    }
    return completion;
  });

}
