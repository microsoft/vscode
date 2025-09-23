/*
 * terminal.ts
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

import * as os from "node:os";
import fs from "node:fs";


import { Uri, workspace, extensions, window } from "vscode";
import { pathWithForwardSlashes, shQuote, sleep, winShEscape } from "core";
import { Terminal } from "vscode";
import { QuartoContext, fileCrossrefIndexStorage } from "quarto-core";
import { TerminalOptions } from "vscode";
import { previewDirForDocument, previewTargetDir } from "./doc";
import { activeWorkspaceFolder } from "./workspace";
import { activePythonInterpreter, pythonIsCondaEnv, pythonIsVenv } from "./python";

export interface TerminalEnv {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  QUARTO_PYTHON?: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  QUARTO_R?: string;
}

export async function terminalEnv(uri?: Uri): Promise<TerminalEnv> {

  const env: TerminalEnv = {};

  // QUARTO_PYTHON
  const python = await activePythonInterpreter(uri);
  if (python) {
    env.QUARTO_PYTHON = python;
  }

  // QUARTO_R
  const workspaceFolder = activeWorkspaceFolder(uri);
  const rExtension =
    extensions.getExtension("REditorSupport.r") ||
    extensions.getExtension("Ikuyadeu.r");
  if (rExtension) {
    const rPath = workspace.getConfiguration("r.rpath", workspaceFolder?.uri);
    let quartoR: string | undefined;
    switch (os.platform()) {
      case "win32": {
        quartoR = rPath.get("windows");
        break;
      }
      case "darwin": {
        quartoR = rPath.get("mac");
        break;
      }
      case "linux": {
        quartoR = rPath.get("linux");
        break;
      }
    }
    if (quartoR) {
      env.QUARTO_R = quartoR;
    }
  }

  return env;
}

export function terminalOptions(name: string, target: Uri, env: TerminalEnv) {

  // determine preview dir (if any)
  const isFile = fs.statSync(target.fsPath).isFile();
  const previewDir = isFile ? previewDirForDocument(target) : undefined;

  // calculate cwd
  const cwd = previewDir || previewTargetDir(target);

  // create and show the terminal
  const options: TerminalOptions = {
    name,
    cwd,
    env: env as unknown as {
      [key: string]: string | null | undefined;
    },
  };

  // add crossref index path to env (will be ignored if we are in a project)
  if (isFile) {
    options.env!["QUARTO_CROSSREF_INDEX_PATH"] = fileCrossrefIndexStorage(
      target.fsPath
    );
  }

  return options;

}

export function terminalCommand(command: string, context: QuartoContext, target?: Uri) {
  const quarto = "quarto"; // binPath prepended to PATH so we don't need the full form
  const cmd: string[] = [
    context.useCmd ? winShEscape(quarto) : shQuote(quarto),
    command
  ];
  if (target) {
    cmd.push(shQuote(
      context.useCmd
        ? target.fsPath
        : pathWithForwardSlashes(target.fsPath)
    ));
  }
  return cmd;
}

export async function sendTerminalCommand(
  terminal: Terminal,
  terminalEnv: TerminalEnv,
  context: QuartoContext,
  cmd: string[]
) {

  // create cmd text
  const cmdText = context.useCmd
    ? `cmd /C"${cmd.join(" ")}"`
    : cmd.join(" ");

  // show the terminal
  terminal.show(true);

  // delay if required (e.g. to allow conda to initialized)
  // wait for up to 5 seconds (note that we can do this without
  // risk of undue delay b/c the state.isInteractedWith bit will
  // flip as soon as the environment has been activated)
  const requiredDelay = requiredTerminalDelay(terminalEnv);
  if (requiredDelay > 0) {
    const kInterval = 100;
    let totalSleep = 0;
    while (!terminal.state.isInteractedWith && totalSleep < requiredDelay) {
      await sleep(kInterval);
      totalSleep += kInterval;
    }
  }

  // send the command
  terminal.sendText(cmdText, true);
}


export async function killTerminal(name: string, before?: () => Promise<void>) {
  const terminal = window.terminals.find((terminal) => {
    return terminal.name === name;
  });
  if (terminal) {
    if (before) {
      await before();
    }
    terminal.dispose();
  }
}


function requiredTerminalDelay(env?: TerminalEnv): number {
  try {
    if (env?.QUARTO_PYTHON) {
      if (pythonIsVenv(env.QUARTO_PYTHON)) {
        return 1000;
      } else if (pythonIsCondaEnv(env.QUARTO_PYTHON)) {
        return 5000;
      } else {
        return 0;
      }
    } else {
      return 0;
    }

  } catch (err) {
    console.error(err);
    return 0;
  }
}
