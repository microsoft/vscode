/*
 * hover.ts
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


import { Hover, MarkdownString, MarkedString, Position, SignatureHelp, commands } from "vscode";
import { adjustedPosition, unadjustedRange } from "../vdoc/vdoc";
import { EmbeddedLanguage } from "../vdoc/languages";
import { Uri } from "vscode";

export async function getHover(
  uri: Uri,
  language: EmbeddedLanguage,
  position: Position
): Promise<Hover | undefined> {
  const hovers = await commands.executeCommand<Hover[]>(
    "vscode.executeHoverProvider",
    uri,
    adjustedPosition(language, position)
  );
  if (hovers && hovers.length > 0) {
    // consolidate content
    const contents = new Array<MarkdownString | MarkedString>();
    hovers.forEach((hover) => {
      hover.contents.forEach((hoverContent) => {
        contents.push(hoverContent);
      });
    });
    // adjust range if required
    const range = hovers[0].range
      ? unadjustedRange(language, hovers[0].range)
      : undefined;
    return new Hover(contents, range);
  }
  return undefined;
}

export async function getSignatureHelpHover(
  uri: Uri,
  language: EmbeddedLanguage,
  position: Position,
  triggerCharacter?: string
) {
  return await commands.executeCommand<SignatureHelp>(
    "vscode.executeSignatureHelpProvider",
    uri,
    adjustedPosition(language, position),
    triggerCharacter
  );
}
