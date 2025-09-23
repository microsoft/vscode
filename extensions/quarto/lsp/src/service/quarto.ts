/*
 * quarto.ts
 *
 * Copyright (C) 2023 by Posit Software, PBC
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

import { CompletionItem, Position } from "vscode-languageserver-types";

import { QuartoContext, Document, filePathForDoc, isQuartoDoc, isQuartoRevealDoc, isQuartoYaml, isQuartoDashboardDoc } from "quarto-core";

import { lines } from "core";
import { LintItem } from "editor-types";

export interface CompletionResult {
  token: string;
  completions: Completion[];
  cacheable: boolean;
}

export interface HoverResult {
  content: string;
  range: { start: Position; end: Position };
}

export interface Completion {
  type: string;
  value: string;
  display?: string;
  description?: string;
  suggest_on_accept?: boolean;
  replace_to_end?: boolean;
}

export interface EditorContext {
  path: string;
  filetype: string;
  embedded: boolean;
  line: string;
  code: string;
  position: {
    row: number;
    column: number;
  };
  explicit: boolean;
  trigger?: string;
  formats: string[];
  project_formats: string[];
  engine: string;
  client: string;
}

export const kContextHeading = "heading";
export const kContextDiv = "div";
export const kContextDivSimple = "div-simple";
export const kContextCodeblock = "codeblock";
export const kContextFigure = "figure";

export type AttrContext =
  | "heading"
  | "div"
  | "div-simple"
  | "codeblock"
  | "figure";

export interface AttrToken {
  line: string;
  context: AttrContext;
  attr: string;
  token: string;
}

export interface Quarto extends QuartoContext {
  getYamlCompletions(context: EditorContext): Promise<CompletionResult>;
  getAttrCompletions(
    token: AttrToken,
    context: EditorContext
  ): Promise<CompletionItem[]>;
  getYamlDiagnostics(context: EditorContext): Promise<LintItem[]>;
  getHover?: (context: EditorContext) => Promise<HoverResult | null>;
}


export function codeEditorContext(
  path: string,
  filetype: string,
  code: string,
  pos: Position,
  embedded: boolean,
  explicit?: boolean,
  trigger?: string
): EditorContext {
  const line = lines(code)[pos.line];
  const position = { row: pos.line, column: pos.character };

  // detect reveal document
  const formats: string[] = [];
  if (isQuartoRevealDoc(code)) {
    formats.push("revealjs");
  }
  if (isQuartoDashboardDoc(code)) {
    formats.push("dashboard");
  }

  return {
    path,
    filetype,
    embedded,
    line,
    code,
    position,
    explicit: !!explicit,
    trigger,
    formats,
    project_formats: [],
    engine: "jupyter",
    client: "lsp",
  };
}

export function docEditorContext(
  doc: Document,
  pos: Position,
  explicit: boolean,
  trigger?: string
): EditorContext {
  const path = filePathForDoc(doc);
  const filetype = isQuartoDoc(doc)
    ? "markdown"
    : isQuartoYaml(doc)
      ? "yaml"
      : "markdown"; // should never get here

  const code = doc.getText();

  return codeEditorContext(
    path,
    filetype,
    code,
    pos,
    false,
    explicit,
    trigger
  )
}
