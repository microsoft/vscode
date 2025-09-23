/*
 * format.ts
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
  commands,
  FormattingOptions,
  Position,
  Range,
  TextDocument,
  TextEdit,
  window,
  workspace,
  CancellationToken,
  Uri,
  TextEditor,
} from "vscode";
import {
  ProvideDocumentFormattingEditsSignature,
  ProvideDocumentRangeFormattingEditsSignature,
} from "vscode-languageclient/node";
import { lines } from "core";
import { TokenCodeBlock, TokenMath, codeForExecutableLanguageBlock, languageBlockAtPosition } from "quarto-core";

import { Command } from "../core/command";
import { isQuartoDoc } from "../core/doc";
import { MarkdownEngine } from "../markdown/engine";
import { EmbeddedLanguage, languageCanFormatDocument } from "../vdoc/languages";
import {
  languageAtPosition,
  mainLanguage,
  unadjustedRange,
  VirtualDoc,
  virtualDocForCode,
  virtualDocForLanguage,
  withVirtualDocUri,
} from "../vdoc/vdoc";


export function activateCodeFormatting(engine: MarkdownEngine) {
  return [new FormatCellCommand(engine)];
}

export function embeddedDocumentFormattingProvider(engine: MarkdownEngine) {
  return async (
    document: TextDocument,
    options: FormattingOptions,
    token: CancellationToken,
    next: ProvideDocumentFormattingEditsSignature
  ): Promise<TextEdit[] | null | undefined> => {
    if (isQuartoDoc(document, true)) {
      // ensure we are dealing w/ the active document
      const editor = window.activeTextEditor;
      const activeDocument = editor?.document;
      if (
        editor &&
        activeDocument?.uri.toString() === document.uri.toString()
      ) {
        const line = editor.selection.active.line;
        const position = new Position(line, 0);
        const tokens = engine.parse(document);
        let language = languageAtPosition(tokens, position);
        if (!language || !language.canFormat) {
          language = mainLanguage(tokens, (lang) => !!lang.canFormat);
        }
        if (language) {
          if (languageCanFormatDocument(language)) {
            const vdoc = virtualDocForLanguage(document, tokens, language);
            if (vdoc) {
              return executeFormatDocumentProvider(
                vdoc,
                document,
                formattingOptions(document.uri, vdoc.language, options)
              );
            }
          } else {
            return (await formatActiveCell(editor, engine)) || [];
          }
        }
      }
      // ensure that other formatters don't ever run over qmd files
      return [];
    } else {
      // delegate if we didn't handle it
      return next(document, options, token);
    }
  };
}

export function embeddedDocumentRangeFormattingProvider(
  engine: MarkdownEngine
) {
  return async (
    document: TextDocument,
    range: Range,
    options: FormattingOptions,
    token: CancellationToken,
    next: ProvideDocumentRangeFormattingEditsSignature
  ): Promise<TextEdit[] | null | undefined> => {
    if (isQuartoDoc(document, true)) {
      const tokens = engine.parse(document);
      const beginBlock = languageBlockAtPosition(tokens, range.start, false);
      const endBlock = languageBlockAtPosition(tokens, range.end, false);
      if (beginBlock && (beginBlock.range.start.line === endBlock?.range.start.line)) {
        const editor = window.activeTextEditor;
        if (editor?.document?.uri.toString() === document.uri.toString()) {
          return await formatActiveCell(editor, engine);
        }
      }
      // ensure that other formatters don't ever run over qmd files
      return [];
    } else {
      // if we don't perform any formatting, then call the next handler
      return next(document, range, options, token);
    }
  };
}

class FormatCellCommand implements Command {
  public readonly id = "quarto.formatCell";
  constructor(private readonly engine_: MarkdownEngine) { }

  public async execute(): Promise<void> {
    const editor = window.activeTextEditor;
    const doc = editor?.document;
    if (doc && isQuartoDoc(doc)) {
      const edits = await formatActiveCell(editor, this.engine_);
      if (edits) {
        editor.edit((editBuilder) => {
          edits.forEach((edit) => {
            editBuilder.replace(edit.range, edit.newText);
          });
        });
      } else {
        window.showInformationMessage(
          "Editor selection is not within a code cell that supports formatting."
        );
      }
    } else {
      window.showInformationMessage("Active editor is not a Quarto document");
    }
  }
}

function formattingOptions(
  uri: Uri,
  language: EmbeddedLanguage,
  defaultOptions?: FormattingOptions
): FormattingOptions {
  const config = workspace.getConfiguration(undefined, {
    uri: uri,
    languageId: language.ids[0],
  });
  return {
    tabSize: config.get<number>("editor.tabSize", defaultOptions?.tabSize ?? 4),
    insertSpaces: config.get<boolean>(
      "editor.insertSpaces",
      defaultOptions?.insertSpaces ?? true
    ),
  };
}


async function executeFormatDocumentProvider(
  vdoc: VirtualDoc,
  document: TextDocument,
  options: FormattingOptions
): Promise<TextEdit[] | undefined> {
  const edits = await withVirtualDocUri(vdoc, document.uri, "format", async (uri: Uri) => {
    return await commands.executeCommand<TextEdit[]>(
      "vscode.executeFormatDocumentProvider",
      uri,
      options
    );
  });
  if (edits) {
    return unadjustedEdits(edits, vdoc.language);
  } else {
    return undefined;
  }
}

async function formatActiveCell(editor: TextEditor, engine: MarkdownEngine): Promise<TextEdit[]> {
  const doc = editor?.document;
  const tokens = engine.parse(doc);
  const line = editor.selection.start.line;
  const position = new Position(line, 0);
  const language = languageAtPosition(tokens, position);
  const block = languageBlockAtPosition(tokens, position, false);
  if (language?.canFormat && block) {
    return formatBlock(doc, block, language);
  }
  return [];
}

async function formatBlock(doc: TextDocument, block: TokenMath | TokenCodeBlock, language: EmbeddedLanguage): Promise<TextEdit[]> {
  const blockLines = lines(codeForExecutableLanguageBlock(block));
  blockLines.push("");
  const vdoc = virtualDocForCode(blockLines, language);
  const edits = await executeFormatDocumentProvider(
    vdoc,
    doc,
    formattingOptions(doc.uri, vdoc.language)
  );
  if (edits) {
    const blockRange = new Range(
      new Position(block.range.start.line, block.range.start.character),
      new Position(block.range.end.line, block.range.end.character)
    );
    const adjustedEdits = edits
      .map(edit => {
        const range = new Range(
          new Position(edit.range.start.line + block.range.start.line + 1, edit.range.start.character),
          new Position(edit.range.end.line + block.range.start.line + 1, edit.range.end.character)
        );
        return new TextEdit(range, edit.newText);
      })
      .filter(edit => blockRange.contains(edit.range));
    return adjustedEdits;
  }
  return [];
}


function unadjustedEdits(
  edits: TextEdit[],
  language: EmbeddedLanguage
): TextEdit[] {
  return edits.map((edit) => {
    return new TextEdit(unadjustedRange(language, edit.range), edit.newText);
  });
}
