/*
 * quarto.ts
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

import * as path from "node:path";
import * as fs from "node:fs";

import { window, env, workspace, Uri } from "vscode";
import { QuartoContext } from "quarto-core";
import { activePythonInterpreter, pythonIsCondaEnv, pythonIsVenv } from "./python";
import { isWindows } from "./platform";


import semver from "semver";


export async function configuredQuartoPath(): Promise<string | undefined> {

  const config = workspace.getConfiguration("quarto");

  // explicitly configured trumps everything
  const quartoPath = config.get("path") as string | undefined;
  if (quartoPath) {
    return quartoPath;
  }

  // if we can use pip quarto then look for it within the currently python (if its a venv/condaenv)
  const usePipQuarto = config.get("usePipQuarto", true);
  if (usePipQuarto) {
    const python = await activePythonInterpreter();
    if (python) {
      if (pythonIsVenv(python) || pythonIsCondaEnv(python)) {
        // check if there is a quarto in the parent directory
        const binDir = path.dirname(python);
        const quartoPath = path.join(binDir, isWindows() ? "quarto.exe" : "quarto");
        if (fs.existsSync(quartoPath)) {
          return quartoPath;
        }
      }
    }
  }
  return undefined;
}


export async function withMinimumQuartoVersion(
  context: QuartoContext,
  version: string,
  action: string,
  f: () => Promise<void>
) {
  if (context.available) {
    if (semver.gte(context.version, version)) {
      await f();
    } else {
      window.showWarningMessage(
        `${action} requires Quarto version ${version} or greater`,
        { modal: true }
      );
    }
  } else {
    await promptForQuartoInstallation(action);
  }
}

export async function promptForQuartoInstallation(context: string, modal = false) {
  const installQuarto = { title: "Install Quarto" };
  const detail = `Please install the Quarto CLI ${context}.`;
  const result = await window.showWarningMessage(
    "Quarto installation not found" + (!modal ? `. ${detail}` : ""),
    {
      modal,
      detail,
    },
    installQuarto
  );
  if (result === installQuarto) {
    env.openExternal(Uri.parse("https://quarto.org/docs/get-started/"));
  }
}
