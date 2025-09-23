/*
 * completion-latex.ts
 *
 * Copyright (C) 2022 by Posit Software, PBC
 * Copyright (c) 2016 James Yu
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

// based on https://github.com/James-Yu/LaTeX-Workshop/blob/master/src/providers/completion.ts

import { Position } from "vscode-languageserver-textdocument";

import {
  CompletionContext,
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  Range,
} from "vscode-languageserver";

import { isLatexPosition } from "quarto-core";

interface LatexCommand {
  command: string;
  snippet?: string;
  detail?: string;
  documentation?: string;
}
import mathjaxImport from "./mathjax.json";
const kMathjaxCommands = mathjaxImport as Record<string, string[]>;

import mathjaxCompletions from "./mathjax-completions.json";
import { mathjaxLoadedExtensions } from "editor-server";
import { MathjaxSupportedExtension } from "editor-types";
import { Document, Parser } from "quarto-core";
import { LsConfiguration } from "../../config";

const kMathjaxCompletions = mathjaxCompletions as Record<string, LatexCommand>;

for (const key of Object.keys(kMathjaxCompletions)) {
  if (key.match(/\{.*?\}/)) {
    const ent = kMathjaxCompletions[key];
    const newKey = key.replace(/\{.*?\}/, "");
    delete kMathjaxCompletions[key];
    kMathjaxCompletions[newKey] = ent;
  }
}

// for latex we complete the subset of commands supported by mathjax
// (as those will work universally in pdf and html)
export async function latexCompletions(
  parser: Parser,
  doc: Document,
  pos: Position,
  completionContext: CompletionContext,
  config: LsConfiguration
): Promise<CompletionItem[] | null> {
  // validate trigger
  const trigger = completionContext.triggerCharacter;
  if (trigger && !["\\"].includes(trigger)) {
    return null;
  }

  // check for latex position
  if (!isLatexPosition(parser, doc, pos)) {
    return null;
  }

  // scan back from the cursor to see if there is a \
  const line = doc
    .getText(Range.create(pos.line, 0, pos.line + 1, 0))
    .trimEnd();
  const text = line.slice(0, pos.character);
  const backslashPos = text.lastIndexOf("\\");
  const spacePos = text.lastIndexOf(" ");
  if (backslashPos !== -1 && backslashPos > spacePos && text[backslashPos - 1] !== "\\") {
    const loadedExtensions = mathjaxLoadedExtensions(config.mathjaxExtensions);
    const token = text.slice(backslashPos + 1);
    const completions: CompletionItem[] = Object.keys(kMathjaxCommands)
      .filter((cmdName) => {
        if (cmdName.startsWith(token)) {
          // filter on loaded extensions
          const pkgs = kMathjaxCommands[cmdName];
          return (
            pkgs.length === 0 ||
            pkgs.some((pkg) => loadedExtensions.includes(pkg as MathjaxSupportedExtension))
          );
        } else {
          return false;
        }
      })
      .map((cmd) => {
        const mathjaxCompletion = kMathjaxCompletions[cmd];
        if (mathjaxCompletion) {
          return {
            kind: CompletionItemKind.Function,
            label: mathjaxCompletion.command,
            documentation: mathjaxCompletion.documentation,
            detail: mathjaxCompletion.detail,
            insertTextFormat: InsertTextFormat.Snippet,
            insertText: mathjaxCompletion.snippet,
          };
        } else {
          return {
            kind: CompletionItemKind.Function,
            label: cmd,
          };
        }
      });

    // single completion w/ matching token is ignored
    if (completions.length == 1 && completions[0].label === token) {
      return null;
    }

    // return completions if we have them
    if (completions.length > 0) {
      return completions;
    }
  }

  return null;
}
