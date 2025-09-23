/*
 * workspace-symbols.ts
 *
 * Copyright (C) 2023 by Posit Software, PBC
 * Copyright (c) Microsoft Corporation. All rights reserved.
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

import { CancellationToken } from 'vscode-languageserver';
import * as lsp from 'vscode-languageserver-types';
import { Disposable } from 'core';
import { Document } from 'quarto-core';
import { IWorkspace } from '../workspace';
import { MdWorkspaceInfoCache } from '../workspace-cache';
import { MdDocumentSymbolProvider } from './document-symbols';

export class MdWorkspaceSymbolProvider extends Disposable {

  readonly #cache: MdWorkspaceInfoCache<readonly lsp.SymbolInformation[]>;
  readonly #symbolProvider: MdDocumentSymbolProvider;

  constructor(
    workspace: IWorkspace,
    symbolProvider: MdDocumentSymbolProvider,
  ) {
    super();
    this.#symbolProvider = symbolProvider;

    this.#cache = this._register(new MdWorkspaceInfoCache(workspace, (doc, token) => this.provideDocumentSymbolInformation(doc, token)));
  }

  public async provideWorkspaceSymbols(query: string, token: CancellationToken): Promise<lsp.WorkspaceSymbol[]> {
    if (token.isCancellationRequested) {
      return [];
    }

    const allSymbols = await this.#cache.values();

    if (token.isCancellationRequested) {
      return [];
    }

    const normalizedQueryStr = query.toLowerCase();
    return allSymbols.flat().filter(symbolInformation => symbolInformation.name.toLowerCase().includes(normalizedQueryStr));
  }

  public async provideDocumentSymbolInformation(document: Document, token: CancellationToken): Promise<lsp.SymbolInformation[]> {
    const docSymbols = await this.#symbolProvider.provideDocumentSymbols(document, {}, token);
    if (token.isCancellationRequested) {
      return [];
    }
    return Array.from(this.#toSymbolInformation(document.uri, docSymbols));
  }

  *#toSymbolInformation(uri: string, docSymbols: readonly lsp.DocumentSymbol[]): Iterable<lsp.SymbolInformation> {
    for (const symbol of docSymbols) {
      yield {
        name: symbol.name,
        kind: lsp.SymbolKind.String,
        location: { uri, range: symbol.selectionRange }
      };
      if (symbol.children) {
        yield* this.#toSymbolInformation(uri, symbol.children);
      }
    }
  }
}
