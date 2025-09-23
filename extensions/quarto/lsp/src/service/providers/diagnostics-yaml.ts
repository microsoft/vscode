/*
 * diagnostics.ts
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
  Diagnostic,
  DiagnosticSeverity,
  Position,
  Range,
} from "vscode-languageserver";

import { Document } from "quarto-core";

import {
  Quarto,
  docEditorContext
} from "../quarto";
import { kEndColumn, kEndRow, kStartColumn, kStartRow, LintItem } from "editor-types";

export async function provideYamlDiagnostics(
  quarto: Quarto,
  doc: Document
): Promise<Diagnostic[]> {

  const context = docEditorContext(doc, Position.create(0, 0), true);
  const diagnostics = await quarto.getYamlDiagnostics(context);
  return diagnostics.map((item) => {
    return {
      severity: lintSeverity(item),
      range: Range.create(
        item[kStartRow],
        item[kStartColumn],
        item[kEndRow],
        item[kEndColumn]
      ),
      message: item.text,
      source: "quarto",
    };
  });

}

function lintSeverity(item: LintItem) {
  if (item.type === "error") {
    return DiagnosticSeverity.Error;
  } else if (item.type === "warning") {
    return DiagnosticSeverity.Warning;
  } else {
    return DiagnosticSeverity.Information;
  }
}
