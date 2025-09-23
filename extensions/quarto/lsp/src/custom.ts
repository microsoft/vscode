/*
 * index.ts
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
import path from "path";

import {
  defaultEditorServerOptions,
  dictionaryServerMethods,
  editorServerMethods,
  mathServerMethods,
  EditorServerOptions,
  sourceServerMethods,
  editorServerDocuments,
} from "editor-server";

import { LspConnection, registerLspServerMethods } from "core-node";
import { userDictionaryDir, Document } from "quarto-core";
import { CompletionList } from "vscode-languageserver-types";
import { Hover, Position, TextDocuments } from "vscode-languageserver";
import { CodeViewCellContext, CodeViewCompletionContext, kCodeViewAssist, kCodeViewGetDiagnostics, kCodeViewGetCompletions, LintItem } from "editor-types";
import { yamlCompletions } from "./service/providers/completion/completion-yaml";
import { yamlHover } from "./service/providers/hover/hover-yaml";
import { EditorContext, Quarto, codeEditorContext } from "./service/quarto";

export function registerCustomMethods(
  quarto: Quarto,
  connection: LspConnection,
  documents: TextDocuments<Document>
) {

  const resourcesDir = path.join(__dirname, "resources");

  const options: EditorServerOptions = {
    ...defaultEditorServerOptions(
      quarto,
      resourcesDir,
      quarto.pandocPath
    ),
    documents: editorServerDocuments(documents)
  };

  const dictionary = {
    dictionariesDir: path.join(resourcesDir, "dictionaries"),
    userDictionaryDir: userDictionaryDir()
  };

  registerLspServerMethods(connection, {
    ...editorServerMethods(options),
    ...dictionaryServerMethods(dictionary),
    ...mathServerMethods(options.documents),
    ...sourceServerMethods(options.pandoc),
    // we have the yaml hover and completions here so provide entry points for them
    [kCodeViewAssist]: args => codeViewAssist(quarto, args[0]),
    [kCodeViewGetCompletions]: args => codeViewCompletions(quarto, args[0]),
    [kCodeViewGetDiagnostics]: args => codeViewDiagnostics(quarto, args[0])
  });
}

async function codeViewDiagnostics(quarto: Quarto, context: CodeViewCellContext): Promise<LintItem[] | undefined> {
  const edContext = codeEditorContext(
    context.filepath,
    context.language == "yaml" ? "yaml" : "script",
    context.code.join("\n"),
    Position.create(0, 0),
    false
  );

  return await diagnostics(quarto, edContext) ?? undefined;

}
export async function diagnostics(quarto: Quarto, context: EditorContext): Promise<LintItem[] | null> {
  if (!quarto?.getYamlDiagnostics) return null;

  try {
    return await quarto.getYamlDiagnostics(context);
  } catch {
    return null;
  }
}

async function codeViewAssist(quarto: Quarto, context: CodeViewCellContext): Promise<Hover | undefined> {

  const edContext = codeEditorContext(
    context.filepath,
    context.language == "yaml" ? "yaml" : "script",
    context.code.join("\n"),
    Position.create(context.selection.start.line, context.selection.start.character),
    false
  );

  return await yamlHover(quarto, edContext) || undefined;
}

async function codeViewCompletions(quarto: Quarto, context: CodeViewCompletionContext): Promise<CompletionList> {
  // handle yaml completions within the lsp (the rest are currently handled in the vscode extension)
  const edContext = codeEditorContext(
    context.filepath,
    context.language == "yaml" ? "yaml" : "script",
    context.code.join("\n"),
    Position.create(context.selection.start.line, context.selection.start.character),
    true,
    context.explicit
  );
  const completions = await yamlCompletions(quarto, edContext, false);
  return {
    isIncomplete: false,
    items: completions || []
  };
}
