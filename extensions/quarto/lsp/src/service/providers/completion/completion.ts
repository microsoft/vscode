/*
 * completion.ts
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

import { Position } from "vscode-languageserver-textdocument";

import {
  CancellationToken,
  CompletionContext,
  CompletionItem,
  CompletionTriggerKind,
  TextDocuments
} from "vscode-languageserver";
import { Quarto } from "../../quarto";
import { attrCompletions } from "./completion-attrs";
import { latexCompletions } from "./completion-latex";
import { yamlCompletions } from "./completion-yaml";
import { shortcodeCompletions } from "./completion-shortcode";
import { refsCompletions } from "./refs/completion-refs";
import { LsConfiguration } from "../../config";
import { IWorkspace } from "../../workspace";
import { MdLinkProvider } from "../document-links";
import { MdTableOfContentsProvider } from "../../toc";
import { Document, Parser } from "quarto-core";
import { MdPathCompletionProvider } from "./completion-path";
import { docEditorContext } from "../../quarto";

/**
 * Control the type of path completions returned.
 */
export interface PathCompletionOptions {
  /**
   * Should header completions for other files in the workspace be returned when
   * you trigger completions.
   *
   * Defaults to {@link IncludeWorkspaceHeaderCompletions.never never} (not returned).
   */
  readonly includeWorkspaceHeaderCompletions?: IncludeWorkspaceHeaderCompletions;
}


/**
 * Controls if header completions for other files in the workspace be returned.
 */
export enum IncludeWorkspaceHeaderCompletions {
  /**
   * Never return workspace header completions.
   */
  never = 'never',

  /**
   * Return workspace header completions after `##` is typed.
   *
   * This lets the user signal
   */
  onDoubleHash = 'onDoubleHash',

  /**
   * Return workspace header completions after either a single `#` is typed or after `##`
   *
   * For a single hash, this means the workspace header completions will be returned along side the current file header completions.
   */
  onSingleOrDoubleHash = 'onSingleOrDoubleHash',
}

export class MdCompletionProvider {

  readonly pathCompletionProvider_: MdPathCompletionProvider;

  readonly quarto_: Quarto;
  readonly parser_: Parser;
  readonly workspace_: IWorkspace;
  readonly documents_: TextDocuments<Document>;

  constructor(
    configuration: LsConfiguration,
    quarto: Quarto,
    workspace: IWorkspace,
    documents: TextDocuments<Document>,
    parser: Parser,
    linkProvider: MdLinkProvider,
    tocProvider: MdTableOfContentsProvider,
  ) {
    this.quarto_ = quarto;
    this.parser_ = parser;
    this.workspace_ = workspace;
    this.documents_ = documents;
    this.pathCompletionProvider_ = new MdPathCompletionProvider(
      configuration,
      workspace,
      parser,
      linkProvider,
      tocProvider
    );
  }

  public async provideCompletionItems(
    doc: Document,
    pos: Position,
    context: CompletionContext,
    config: LsConfiguration,
    token: CancellationToken,
  ): Promise<CompletionItem[]> {

    if (token.isCancellationRequested) {
      return [];
    }

    const explicit = context.triggerKind === CompletionTriggerKind.TriggerCharacter;
    const trigger = context.triggerCharacter;
    const editorContext = docEditorContext(doc, pos, explicit, trigger);
    return (
      (await refsCompletions(this.quarto_, this.parser_, doc, pos, editorContext, this.documents_)) ||
      (await attrCompletions(this.quarto_, editorContext)) ||
      (await shortcodeCompletions(editorContext, this.workspace_)) ||
      (await latexCompletions(this.parser_, doc, pos, context, config)) ||
      (await yamlCompletions(this.quarto_, editorContext, true)) ||
      (await this.pathCompletionProvider_.provideCompletionItems(doc, pos, context, token)) ||
      []
    );
  }
}
