/*
 * firstrun.ts
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

import fs from "fs";
import path from "path";
import { ExtensionContext } from "vscode";

const kQuartoCreateFirstRun = "quarto.create.firstRun";

export function createFirstRun(
  context: ExtensionContext,
  projectDir: string,
  openFiles: string[]
) {
  openFiles = openFiles.map((file) =>
    path.join(projectDir, file.replace("$(dirname)", path.basename(projectDir)))
  );
  context.globalState.update(kQuartoCreateFirstRun, openFiles.join("\n"));
}

export async function collectFirstRun(
  context: ExtensionContext,
  projectDir: string
): Promise<string[]> {
  const firstRun = context.globalState
    .get<string>(kQuartoCreateFirstRun, "")
    .split("\n")
    .filter((file) => file.startsWith(projectDir) && fs.existsSync(file));
  await context.globalState.update(kQuartoCreateFirstRun, undefined);
  return firstRun;
}
