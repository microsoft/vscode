/*
 * executors.ts
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

// TODO: implement some terminal based executors
// (e.g. see https://github.com/JeepShen/vscode-markdown-code-runner)


import * as vscode from "vscode";
import { TextDocument } from "vscode";

import {
  codeForExecutableLanguageBlock,
  isExecutableLanguageBlock,
  languageNameFromBlock,
  Token,
  TokenCodeBlock,
  TokenMath
} from "quarto-core";

import { lines } from "core";

import { cellOptionsForToken, kExecuteEval } from "./options";

import { CellExecutor, ExtensionHost } from "../../host";
import { executableLanguages } from "../../host/executors";


export function hasExecutor(_host: ExtensionHost, language: string) {
  return executableLanguages().includes(language);
}

export function blockHasExecutor(host: ExtensionHost, token?: Token): token is TokenMath | TokenCodeBlock {
  if (token) {
    const language = languageNameFromBlock(token);
    return isExecutableLanguageBlock(token) && hasExecutor(host, language);
  } else {
    return false;
  }
}

export function blockIsExecutable(host: ExtensionHost, token?: Token): token is TokenMath | TokenCodeBlock {
  if (token) {
    return (
      blockHasExecutor(host, token) && cellOptionsForToken(token)[kExecuteEval] !== false
    );
  } else {
    return false;
  }
}

// skip yaml options for execution
export function codeWithoutOptionsFromBlock(token: TokenMath | TokenCodeBlock) {
  if (isExecutableLanguageBlock(token)) {
    const language = languageNameFromBlock(token);
    if (hasYamlHashOptions(language)) {
      const blockLines = lines(codeForExecutableLanguageBlock(token));
      const startCodePos = blockLines.findIndex(
        (line) => !isYamlHashOption(line)
      );
      if (startCodePos !== -1) {
        return blockLines.slice(startCodePos).join("\n");
      } else {
        return "";
      }
    } else {
      return codeForExecutableLanguageBlock(token);
    }
  } else {
    return "";
  }

}

export async function executeInteractive(
  executor: CellExecutor,
  blocks: string[],
  document: TextDocument,
  cellRange?: vscode.Range
): Promise<void> {
  return await executor.execute(blocks, !document.isUntitled ? document.uri : undefined, cellRange);
}

// attempt language aware execution of current selection (returns false
// if the executor doesn't support this, in which case generic
// executeInteractive will be called)
export async function executeSelectionInteractive(executor: CellExecutor) {
  if (executor?.executeSelection) {
    await executor.executeSelection();
    return true;
  } else {
    return false;
  }
}

function hasYamlHashOptions(_language: string) {
  return ["python", "r", "julia", "bash", "sh", "shell"];
}

function isYamlHashOption(line: string) {
  return !!line.match(/^#\s*\| ?/);
}
