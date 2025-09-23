/*
 * codelens.ts
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
  CodeLens,
  CodeLensProvider,
  ProviderResult,
  TextDocument,
  Range,
  CancellationToken,
} from "vscode";
import { MarkdownEngine } from "../../markdown/engine";
import { isDisplayMath } from "quarto-core";

export function quartoLensCodeLensProvider(
  engine: MarkdownEngine
): CodeLensProvider {
  return {
    provideCodeLenses(
      document: TextDocument,
      token: CancellationToken
    ): ProviderResult<CodeLens[]> {
      const lenses: CodeLens[] = [];
      const tokens = engine.parse(document);
      const mathBlocks = tokens.filter(isDisplayMath);
      for (let i = 0; i < mathBlocks.length; i++) {
        // respect cancellation request
        if (token.isCancellationRequested) {
          return [];
        }

        const block = mathBlocks[i];

        // push code lens
        const range = new Range(block.range.start.line, 0, block.range.start.line, 0);
        lenses.push(
          ...[
            new CodeLens(range, {
              title: "$(zoom-in) Preview",
              tooltip: "Preview the rendered LaTeX math",
              command: "quarto.previewMath",
              arguments: [block.range.start.line + 1],
            }),
          ]
        );

      }
      return lenses;
    },
  };
}
