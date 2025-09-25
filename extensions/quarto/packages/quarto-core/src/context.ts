/*
 * context.ts
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


import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { ExecFileSyncOptions } from "node:child_process";
import * as semver from "semver";
import { execProgram, isArm_64 } from "../../core-node/src/index.js";

export interface QuartoContext {
  available: boolean;
  version: string;
  binPath: string;
  resourcePath: string;
  pandocPath: string;
  workspaceDir?: string;
  useCmd: boolean;
  runQuarto: (options: ExecFileSyncOptions, ...args: string[]) => string;
  runPandoc: (options: ExecFileSyncOptions, ...args: string[]) => string;
}

/**
 * Initialize a Quarto context.
 *
 * @param quartoPath A path to a user-specified Quarto executable. If
 *  supplied, this will be used in preference to other methods of detecting
 *  Quarto.
 * @param workspaceFolder The workspace folder to use for resolving relative
 *  paths.
 * @param additionalSearchPaths Additional paths to search for Quarto. These will only be used if
 *  Quarto is not found in the default locations or the system path.
 * @param showWarning A function to call to show a warning message.
 *
 * @returns A Quarto context.
 */
export function initQuartoContext(
  quartoPath?: string,
  workspaceFolder?: string,
  additionalSearchPaths?: string[],
  showWarning?: (msg: string) => void
): QuartoContext {
  // default warning to log
  showWarning = showWarning || console.log;

  // check for user setting (resolving workspace relative paths)
  let quartoInstall: QuartoInstallation | undefined;
  if (quartoPath) {
    if (!path.isAbsolute(quartoPath) && workspaceFolder) {
      quartoPath = path.join(workspaceFolder, quartoPath);
    }
    quartoInstall = detectUserSpecifiedQuarto(quartoPath, showWarning);
  }

  // next look on the path
  if (!quartoInstall) {
    quartoInstall = detectQuarto("quarto");
  }

  // if still not found, scan for versions of quarto in known locations
  if (!quartoInstall) {
    quartoInstall = scanForQuarto(additionalSearchPaths);
  }

  // return if we got them
  if (quartoInstall) {
    // use cmd suffix for older versions of quarto on windows
    const windows = os.platform() == "win32";
    const useCmd = windows && semver.lte(quartoInstall.version, "1.1.162");
    let pandocPath = process.env["QUARTO_PANDOC"] || path.join(quartoInstall!.binPath, "tools", "pandoc");
    // more recent versions of quarto use architecture-specific tools dir,
    // if the pandocPath is not found then look in the requisite dir for this arch
    if (!windows && !fs.existsSync(pandocPath)) {
      pandocPath = path.join(
        path.dirname(pandocPath),
        isArm_64() ? "aarch64" : "x86_64",
        path.basename(pandocPath)
      );
    }
    return {
      available: true,
      ...quartoInstall,
      pandocPath,
      workspaceDir: workspaceFolder,
      useCmd,
      runQuarto: (options: ExecFileSyncOptions, ...args: string[]) =>
        execProgram(
          path.join(quartoInstall!.binPath, "quarto" + (useCmd ? ".cmd" : "")),
          args,
          options
        ),
      runPandoc: (options: ExecFileSyncOptions, ...args: string[]) =>
        execProgram(
          pandocPath,
          args,
          options
        ),
    };
  } else {
    return quartoContextUnavailable();
  }
}

export function quartoContextUnavailable(): QuartoContext {
  return {
    available: false,
    version: "",
    binPath: "",
    resourcePath: "",
    pandocPath: "",
    useCmd: false,
    runQuarto: () => "",
    runPandoc: () => "",
  };
}

type QuartoInstallation = {
  version: string;
  binPath: string;
  resourcePath: string;
};

function detectQuarto(quartoPath: string): QuartoInstallation | undefined {
  // detect version and paths (fall back to .cmd on windows if necessary)
  const windows = os.platform() == "win32";
  let version: string | undefined;
  let paths: string[] | undefined;
  const readQuartoInfo = (bin: string) => {
    version = execProgram(bin, ["--version"]);
    paths = execProgram(bin, ["--paths"]).split(/\r?\n/);
  };
  try {
    readQuartoInfo(quartoPath);
  } catch (e) {
    if (windows) {
      try {
        readQuartoInfo(quartoPath + ".cmd");
      } catch (e) { /* */ }
    }
  }
  // return version if we have it
  if (version && paths) {
    return {
      version,
      binPath: paths[0],
      resourcePath: paths[1],
    };
  } else {
    return undefined;
  }
}

function detectUserSpecifiedQuarto(
  quartoPath: string,
  showWarning: (msg: string) => void
): QuartoInstallation | undefined {
  // validate that it exists
  if (!fs.existsSync(quartoPath)) {
    showWarning(
      "Unable to find specified quarto executable: '" + quartoPath + "'"
    );
    return undefined;
  }

  // validate that it is a file
  if (!fs.statSync(quartoPath).isFile()) {
    showWarning(
      "Specified quarto executable is a directory not a file: '" +
      quartoPath +
      "'"
    );
    return undefined;
  }

  // detect
  return detectQuarto(quartoPath);
}

/**
 * Scan for Quarto in known locations.
 *
 * @param additionalSearchPaths Additional paths to search for Quarto (optional)
 *
 * @returns A Quarto installation if found, otherwise undefined
 */
function scanForQuarto(additionalSearchPaths?: string[]): QuartoInstallation | undefined {
  const scanPaths: string[] = [];
  
  // Always use bundled Quarto CLI from VS Code extension
  try {
    const vscode = require('vscode');
    if (vscode.extensions) {
      const quartoExtension = vscode.extensions.getExtension('vscode.quarto');
      if (quartoExtension) {
        const bundledQuartoPath = path.join(quartoExtension.extensionPath, 'bin', 'bin');
        scanPaths.push(bundledQuartoPath);
      }
    }
  } catch (error) {
    // VS Code context not available - this should not happen in normal operation
    throw new Error('Quarto extension: VS Code context not available for bundled CLI access');
  }

  // Only include additional search paths if explicitly provided (for testing/development)
  if (additionalSearchPaths) {
    scanPaths.push(...additionalSearchPaths);
  }

  for (const scanPath of scanPaths.filter(fs.existsSync)) {
    const install = detectQuarto(path.join(scanPath, "quarto"));
    if (install) {
      return install;
    }
  }

  return undefined;
}
