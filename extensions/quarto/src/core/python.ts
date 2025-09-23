/*
 * languages.ts
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

import fs from "node:fs";
import path from "node:path";
import child_process from "node:child_process";

import { Uri, extensions } from "vscode";
import { activeWorkspaceFolder } from "./workspace";

import which from "which";
import { shQuote } from "core";

export async function activePythonInterpreter(uri?: Uri): Promise<string | undefined> {

  const workspaceFolder = activeWorkspaceFolder(uri);
  const pyExtension = extensions.getExtension("ms-python.python");
  if (pyExtension) {
    if (!pyExtension.isActive) {
      await pyExtension.activate();
    }

    const execDetails = pyExtension.exports.settings.getExecutionDetails(
      workspaceFolder?.uri
    );
    if (Array.isArray(execDetails?.execCommand)) {
      let python = execDetails.execCommand[0] as string;
      if (!path.isAbsolute(python)) {
        const path = which.sync(python, { nothrow: true });
        if (path) {
          python = path;
        }
      }
      return python;
    }
  }
  return undefined;
}


export function pythonIsVenv(python: string) {
  const binDir = path.dirname(python);
  const venvFiles = ["activate", "pyvenv.cfg", "../pyvenv.cfg"];
  return venvFiles.map((file) => path.join(binDir, file)).some(fs.existsSync);
}

export function pythonIsCondaEnv(python: string) {
  try {
    const args = [
      "-c",
      "import sys, os; print(os.path.exists(os.path.join(sys.prefix, 'conda-meta')))",
    ];
    const output = (
      child_process.execFileSync(shQuote(python), args, {
        encoding: "utf-8",
      }) as unknown as string
    ).trim();
    return output === "True";
  } catch {
    return false;
  }
}
