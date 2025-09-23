/*
 * codeviews.ts
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

import { CompletionList, Range } from "vscode-languageserver-types";
import { DiagramState } from "./diagram";

export const kCodeViewAssist = 'code_view_assist';
export const kCodeViewGetCompletions = 'code_view_get_completions';
export const kCodeViewExecute = 'code_view_execute';
export const kCodeViewPreviewDiagram = 'code_view_preview_diagram';
export const kCodeViewGetDiagnostics = 'code_view_get_diagnostics';

export type CodeViewExecute = "selection" | "cell" | "cell+advance" | "above" | "below";

export interface CodeViewActiveBlockContext {
  activeLanguage: string;
  blocks: Array<{ pos: number, language: string, code: string; active: boolean; }>;
  selection: Range;
  selectedText: string;
}

export type CodeViewSelectionAction = "nextline" | "nextblock" | "prevblock";

export interface CodeViewCellContext {
  filepath: string;
  language: string;
  code: string[];
  cellBegin: number;
  cellEnd: number;
  selection: Range;
}

export const kStartRow = "start.row";
export const kStartColumn = "start.column";
export const kEndRow = "end.row";
export const kEndColumn = "end.column";
export interface LintItem {
  [kStartRow]: number;
  [kStartColumn]: number;
  [kEndRow]: number;
  [kEndColumn]: number;
  text: string;
  type: string;
}

export interface CodeViewCompletionContext extends CodeViewCellContext {
  explicit: boolean;
}

export interface CodeViewServer {
  codeViewAssist: (contxt: CodeViewCellContext) => Promise<void>;
  codeViewExecute: (execute: CodeViewExecute, context: CodeViewActiveBlockContext) => Promise<void>;
  codeViewDiagnostics: (context: CodeViewCellContext) => Promise<LintItem[] | undefined>;
  codeViewCompletions: (context: CodeViewCompletionContext) => Promise<CompletionList>;
  codeViewPreviewDiagram: (state: DiagramState, activate: boolean) => Promise<void>;
}
