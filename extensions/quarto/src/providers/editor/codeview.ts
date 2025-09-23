/*
 * codeview.ts
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

import {
  CompletionItem as VCompletionItem,
  CompletionItemKind as VCompletionItemKind,
  MarkdownString,
  SnippetString,
  Range,
  Position,
  TextDocument,
  commands
} from "vscode";

import {
  CompletionItem,
  CompletionItemKind,
  CompletionItemLabelDetails,
  CompletionList,
  InsertTextFormat,
  MarkupContent,
  MarkupKind
} from "vscode-languageserver-types";

import { JsonRpcRequestTransport } from "core";

import {
  CodeViewCellContext,
  CodeViewCompletionContext,
  CodeViewExecute,
  CodeViewServer,
  DiagramState,
  kCodeViewGetCompletions,
  kCodeViewGetDiagnostics,
  LintItem
} from "editor-types";

import { embeddedLanguage } from "../../vdoc/languages";
import { virtualDocForCode } from "../../vdoc/vdoc";
import { vdocCompletions } from "../../vdoc/vdoc-completion";
import { MarkdownEngine } from "../../markdown/engine";


export function vscodeCodeViewServer(_engine: MarkdownEngine, document: TextDocument, lspRequest: JsonRpcRequestTransport): CodeViewServer {
  return {
    async codeViewAssist(context: CodeViewCellContext) {
      await commands.executeCommand("quarto.codeViewAssist", context, lspRequest);
    },
    async codeViewExecute(execute: CodeViewExecute) {
      switch (execute) {
        case "cell":
          await commands.executeCommand("quarto.runCurrentCell");
          break;
        case "cell+advance":
          await commands.executeCommand("quarto.runCurrentAdvance");
          break;
        case "above":
          await commands.executeCommand("quarto.runCellsAbove");
          break;
        case "below":
          await commands.executeCommand("quarto.runCellsBelow");
          break;
      }
    },
    async codeViewDiagnostics(context: CodeViewCellContext): Promise<LintItem[] | undefined> {
      // if this is yaml then call the lsp directly
      if (context.language === "yaml") {
        return lspRequest(kCodeViewGetDiagnostics, [context]);
      }
      return undefined;
    },
    async codeViewCompletions(context: CodeViewCompletionContext): Promise<CompletionList> {
      // if this is yaml then call the lsp directly
      if (context.language === "yaml") {
        return lspRequest(kCodeViewGetCompletions, [context]);
      }

      // see if we have an embedded langaage
      const language = embeddedLanguage(context.language);
      if (!language) {
        return {
          items: [],
          isIncomplete: false
        };
      }

      // if this is a yaml comment line then call the lsp
      const line = context.code[context.selection.start.line];
      if (language.comment && line.startsWith(`${language.comment}| `)) {
        return lspCellYamlOptionsCompletions(context, lspRequest);
      }

      // otherwise delegate to vscode completion system
      const vdoc = virtualDocForCode(context.code, language);
      const completions = await vdocCompletions(
        vdoc,
        new Position(
          context.selection.start.line,
          context.selection.start.character
        ),
        undefined,
        language,
        document.uri
      );

      return {
        items: completions.map(vsCompletionItemToLsCompletionItem),
        isIncomplete: false
      };
    },
    async codeViewPreviewDiagram(state: DiagramState, activate: boolean) {
      commands.executeCommand("quarto.previewDiagram", { state, activate });
    }
  };
}

function lspCellYamlOptionsCompletions(context: CodeViewCompletionContext, lspRequest: JsonRpcRequestTransport) {
  // strip out lines that aren't in the code block
  const code = context.code.map((codeLine, index) => {
    if (index < context.cellBegin || index > context.cellEnd) {
      return "";
    } else {
      return codeLine;
    }
  });
  // include language header (we offset cellEnd below accordingly)
  code.splice(context.cellBegin, 0, `{${context.language}}`);
  // make request
  return lspRequest(kCodeViewGetCompletions, [{
    ...context,
    code,
    cellEnd: context.cellEnd + 1,
    selection: {
      start: {
        ...context.selection.start,
        line: context.selection.start.line + 1
      },
      end: {
        ...context.selection.end,
        line: context.selection.end.line + 1
      }
    }
  }]);
}

export function vsCompletionItemToLsCompletionItem(item: VCompletionItem): CompletionItem {
  const insertText = item.insertText instanceof SnippetString
    ? item.insertText.value
    : item.insertText || "";
  const completion: CompletionItem = {
    ...labelWithDetails(item),
    kind: vsKindToLsKind(item.kind),
    detail: item.detail,
    documentation: item.documentation instanceof MarkdownString
      ? mdStringToMdContent(item.documentation)
      : item.documentation,
    sortText: item.sortText && /^\d/.test(item.sortText) ? item.sortText : undefined,
    filterText: item.filterText,
    insertText,
    insertTextFormat: item.insertText instanceof SnippetString
      ? InsertTextFormat.Snippet
      : InsertTextFormat.PlainText,
    command: item.command
  };
  if (item.range) {
    const isRange = (x?: unknown): x is Range => { return !!x && !!(x as Record<string, unknown>).start; };
    if (isRange(item.range)) {
      completion.textEdit = {
        newText: insertText,
        range: {
          start: item.range.start,
          end: item.range.end
        }
      };
    } else {
      completion.textEdit = {
        newText: insertText,
        insert: {
          start: item.range.inserting.start,
          end: item.range.replacing.end
        },
        replace: {
          start: item.range.replacing.start,
          end: item.range.replacing.end
        }
      };

    }
  }
  return completion;

}

export function labelWithDetails(item: VCompletionItem): { label: string, labelWithDetails: CompletionItemLabelDetails; } {
  if (typeof (item.label) === "string") {
    return {
      label: item.label,
      labelWithDetails: {
        detail: item.detail
      }
    };
  } else {
    return {
      label: item.label.label,
      labelWithDetails: {
        detail: item.label.detail
      }
    };
  }
}

export function vsKindToLsKind(kind?: VCompletionItemKind): CompletionItemKind | undefined {
  if (kind === undefined) {
    return undefined;
  }

  switch (kind) {
    case VCompletionItemKind.Text:
      return CompletionItemKind.Text;
    case VCompletionItemKind.Method:
      return CompletionItemKind.Method;
    case VCompletionItemKind.Function:
      return CompletionItemKind.Function;
    case VCompletionItemKind.Constructor:
      return CompletionItemKind.Constructor;
    case VCompletionItemKind.Field:
      return CompletionItemKind.Field;
    case VCompletionItemKind.Variable:
      return CompletionItemKind.Variable;
    case VCompletionItemKind.Class:
      return CompletionItemKind.Class;
    case VCompletionItemKind.Interface:
      return CompletionItemKind.Interface;
    case VCompletionItemKind.Module:
      return CompletionItemKind.Module;
    case VCompletionItemKind.Property:
      return CompletionItemKind.Property;
    case VCompletionItemKind.Unit:
      return CompletionItemKind.Unit;
    case VCompletionItemKind.Value:
      return CompletionItemKind.Value;
    case VCompletionItemKind.Enum:
      return CompletionItemKind.Enum;
    case VCompletionItemKind.Keyword:
      return CompletionItemKind.Keyword;
    case VCompletionItemKind.Snippet:
      return CompletionItemKind.Snippet;
    case VCompletionItemKind.Color:
      return CompletionItemKind.Color;
    case VCompletionItemKind.Reference:
      return CompletionItemKind.Reference;
    case VCompletionItemKind.File:
      return CompletionItemKind.File;
    case VCompletionItemKind.Folder:
      return CompletionItemKind.Folder;
    case VCompletionItemKind.EnumMember:
      return CompletionItemKind.EnumMember;
    case VCompletionItemKind.Constant:
      return CompletionItemKind.Constant;
    case VCompletionItemKind.Struct:
      return CompletionItemKind.Struct;
    case VCompletionItemKind.Event:
      return CompletionItemKind.Event;
    case VCompletionItemKind.Operator:
      return CompletionItemKind.Operator;
    case VCompletionItemKind.TypeParameter:
      return CompletionItemKind.TypeParameter;
    case VCompletionItemKind.User:
    case VCompletionItemKind.Issue:
    default:
      return CompletionItemKind.Text;
  }
}

function mdStringToMdContent(mdString: MarkdownString): MarkupContent {
  return {
    kind: MarkupKind.Markdown,
    value: mdString.value
  };
}
