/*
 * create.ts
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

import { ExtensionContext, workspace, window, ViewColumn } from "vscode";
import { QuartoContext } from "quarto-core";
import { collectFirstRun } from "./firstrun";
import { CreateProjectCommand } from "./create-project";

export async function activateCreate(
  context: ExtensionContext,
  quartoContext: QuartoContext
) {
  // open documents if there is a first-run file
  if (quartoContext.workspaceDir) {
    const firstRun = await collectFirstRun(context, quartoContext.workspaceDir);
    for (const file of firstRun) {
      const doc = await workspace.openTextDocument(file);
      await window.showTextDocument(doc, ViewColumn.Active, false);
    }
  }

  // commands
  return [
    new CreateProjectCommand("quarto.createProject", context, quartoContext),
    new CreateProjectCommand(
      "quarto.fileCreateProject",
      context,
      quartoContext
    ),
  ];
}
