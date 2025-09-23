/*
 * vscode-executors.ts
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

import { Uri, commands, window, extensions } from "vscode";

import semver from "semver";
import { TextDocument } from "vscode";
import { MarkdownEngine } from "../markdown/engine";
import { documentFrontMatter } from "../markdown/document";
import { isExecutableLanguageBlockOf } from "quarto-core";
import { workspace } from "vscode";
import { JupyterKernelspec } from "core";

export interface CellExecutor {
  execute: (blocks: string[], editorUri?: Uri) => Promise<void>;
  executeSelection?: () => Promise<void>;
}

export function executableLanguages() {
  return kCellExecutors.map((executor) => executor.language);
}

export async function cellExecutorForLanguage(
  language: string,
  document: TextDocument,
  engine: MarkdownEngine,
  silent?: boolean
): Promise<CellExecutor | undefined> {
  const executor = findExecutor(language, document, engine);
  if (executor) {
    if (await ensureRequiredExtension(language, document, engine, silent)) {
      return executor;
    }
  }
  return undefined;
}

interface VSCodeCellExecutor extends CellExecutor {
  language: string;
  requiredExtensionName?: string;
  requiredExtension?: string[];
  requiredVersion?: string;
  execute: (blocks: string[], editorUri?: Uri) => Promise<void>;
  executeSelection?: () => Promise<void>;
}

const jupyterCellExecutor = (language: string): VSCodeCellExecutor => ({
  language,
  requiredExtension: ["ms-toolsai.jupyter"],
  requiredExtensionName: "Jupyter",
  requiredVersion: "2021.8.0",
  execute: async (blocks: string[]) => {
    // if there is a cell magic then we need to execute cell-by-cell
    const hasMagic = blocks.find((block) => !!block.match(/^\s*%%\w+\s/));
    if (hasMagic) {
      for (const block of blocks) {
        await commands.executeCommand(
          "jupyter.execSelectionInteractive",
          block
        );
      }
    } else {
      const code = blocks.join("\n");
      await commands.executeCommand("jupyter.execSelectionInteractive", code);
    }
  },
});

const pythonCellExecutor = jupyterCellExecutor("python");

const stataCellExecutor = jupyterCellExecutor("stata");

const rCellExecutor: VSCodeCellExecutor = {
  language: "r",
  requiredExtension: ["REditorSupport.r", "Ikuyadeu.r"],
  requiredExtensionName: "R",
  requiredVersion: "2.4.0",
  execute: async (blocks: string[]) => {
    await commands.executeCommand("r.runSelection", blocks.join("\n").trim());
  },
  executeSelection: async () => {
    await commands.executeCommand("r.runSelection");
  },
};

const reticulateCellExecutor: VSCodeCellExecutor = {
  language: "python",
  requiredExtension: ["REditorSupport.r", "Ikuyadeu.r"],
  requiredExtensionName: "R",
  requiredVersion: "2.4.0",
  execute: async (blocks: string[]) => {
    const code = blocks.join("\n").trim();
    const pythonCode = pythonWithReticulate(code);
    await commands.executeCommand("r.runSelection", pythonCode);
  },
};

const juliaCellExecutor: VSCodeCellExecutor = {
  language: "julia",
  requiredExtension: ["julialang.language-julia"],
  requiredExtensionName: "Julia",
  requiredVersion: "1.4.0",
  execute: async (blocks: string[], editorUri?: Uri) => {
    const extension = extensions.getExtension("julialang.language-julia");
    if (extension) {
      if (!extension.isActive) {
        await extension.activate();
      }
      extension.exports.executeInREPL(blocks.join("\n"), {
        filename: editorUri ? editorUri.fsPath : "code",
      });
    } else {
      window.showErrorMessage("Unable to execute code in Julia REPL");
    }
  },
};

const csharpCellExecutor: VSCodeCellExecutor = {
  language: "csharp",
  requiredExtension: ["ms-dotnettools.dotnet-interactive-vscode"],
  requiredExtensionName: "Polyglot Notebooks",
  requiredVersion: "1.0.55", // Adjust minimum version as needed
  execute: async (blocks: string[]) => {
    const extension = extensions.getExtension("ms-dotnettools.dotnet-interactive-vscode");
    if (extension) {
      if (!extension.isActive) {
        await extension.activate();
      }

      await jupyterCellExecutor("csharp").execute(blocks);
    } else {
      window.showErrorMessage("Unable to execute code - Polyglot Notebooks extension not found");
    }
  }
};

const bashCellExecutor: VSCodeCellExecutor = {
  language: "bash",
  execute: async (blocks: string[]) => {
    const terminal = window.activeTerminal || window.createTerminal();
    terminal.show();
    terminal.sendText(blocks.join("\n"));
  },
};

const shCellExecutor = { ...bashCellExecutor, language: "sh" };

const shellCellExecutor = { ...bashCellExecutor, language: "shell" };

const kCellExecutors = [
  pythonCellExecutor,
  stataCellExecutor,
  rCellExecutor,
  juliaCellExecutor,
  bashCellExecutor,
  shCellExecutor,
  shellCellExecutor,
  csharpCellExecutor
];

function findExecutor(
  language: string,
  document: TextDocument,
  engine: MarkdownEngine
): VSCodeCellExecutor | undefined {
  // if its a knitr document then we return reticulate for python
  if (
    language === reticulateCellExecutor.language &&
    isKnitrDocument(document, engine) &&
    workspace.getConfiguration("quarto").get("cells.useReticulate", true)
  ) {
    return reticulateCellExecutor;
  } else {
    return kCellExecutors.find((x) => x.language === language);
  }
}

export function isDenoDocument(
  document: TextDocument,
  engine: MarkdownEngine
) {
  // check for explicit declarations of various kinds
  const frontMatter = documentFrontMatter(engine, document);
  const jupyterOption = frontMatter["jupyter"];
  const engineOption = frontMatter["engine"];

  // jupyter options
  if (jupyterOption) {
    if (jupyterOption === "deno") {
      return true;
    } else if (typeof (jupyterOption) === "object") {
      const kernelspec = (jupyterOption as Record<string, unknown>)["kernelspec"];
      if (typeof (kernelspec) === "object") {
        return (kernelspec as JupyterKernelspec).name === "deno";
      }
    } else {
      return false;
    }
  }

  // another explicit declaration of engine that isn't jupyter
  if (engineOption && engineOption !== "jupyter") {
    return false;
  }

  // if there are typescript language blocks then this is deno
  const tokens = engine.parse(document);
  return !!tokens.find(isExecutableLanguageBlockOf("typescript"));
}

export function isKnitrDocument(
  document: TextDocument,
  engine: MarkdownEngine
) {
  // check for explicit declarations of various kinds
  const frontMatter = documentFrontMatter(engine, document);

  // engine option
  const engineOption = frontMatter["engine"];
  if (engineOption === "knitr") {
    return true;
  } else if (engineOption !== undefined) {
    return false;
  }

  // knitr options
  if (frontMatter["knitr"] !== undefined) {
    return true;
  }

  // jupyter options
  if (frontMatter["jupyter"] !== undefined) {
    return false;
  }

  // if there are R language blocks then this is knitr
  const tokens = engine.parse(document);
  return !!tokens.find(isExecutableLanguageBlockOf("r"));
}

export function pythonWithReticulate(code: string) {
  return `reticulate::repl_python(quiet = TRUE, input = r"--(${code})--")`;
}

// ensure language extension is loaded (if required)
export async function ensureRequiredExtension(
  language: string,
  document: TextDocument,
  engine: MarkdownEngine,
  silent?: boolean
): Promise<boolean> {
  const executor = findExecutor(language, document, engine);
  if (executor?.requiredExtension) {
    // validate the extension
    if (!validateRequiredExtension(executor, silent)) {
      return false;
    } else {
      // activate the extension if necessary
      const extension = extensions.getExtension(executor.requiredExtension[0]);
      if (extension) {
        if (!extension.isActive) {
          await extension.activate();
        }
        return true;
      } else {
        return false;
      }
    }
  } else {
    return false;
  }
}

function validateRequiredExtension(
  executor: VSCodeCellExecutor,
  silent = false
) {
  if (executor.requiredExtension) {
    const extensionName = executor.requiredExtensionName;
    let extension: any;
    for (const reqExtension of executor.requiredExtension) {
      extension = extensions.getExtension(reqExtension);
      if (extension) {
        break;
      }
    }
    if (extension) {
      if (executor?.requiredVersion) {
        const version = (extension.packageJSON.version || "0.0.0") as string;
        if (semver.gte(version, executor.requiredVersion)) {
          return true;
        } else {
          if (!silent) {
            window.showWarningMessage(
              `Executing ${executor.language} cells requires v${executor.requiredVersion} of the ${extensionName} extension.`
            );
          }
          return false;
        }
      } else {
        return true;
      }
    } else {
      if (!silent) {
        window.showWarningMessage(
          `Executing ${executor.language} cells requires the ${extensionName} extension.`
        );
      }
      return false;
    }
  } else {
    return true;
  }
}
