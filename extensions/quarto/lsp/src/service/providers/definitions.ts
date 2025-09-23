/*
 * definitions.ts
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
import { rangeContains, Document } from 'quarto-core';
import { LsConfiguration } from '../config';
import { MdTableOfContentsProvider, isTocHeaderEntry } from '../toc';
import { IWorkspace, statLinkToMarkdownFile } from '../workspace';
import { MdWorkspaceInfoCache } from '../workspace-cache';
import { HrefKind, LinkDefinitionSet, MdLink, MdLinkKind } from './document-links';

export class MdDefinitionProvider {

  readonly #configuration: LsConfiguration;
  readonly #workspace: IWorkspace;
  readonly #tocProvider: MdTableOfContentsProvider;
  readonly #linkCache: MdWorkspaceInfoCache<readonly MdLink[]>;

  constructor(
    configuration: LsConfiguration,
    workspace: IWorkspace,
    tocProvider: MdTableOfContentsProvider,
    linkCache: MdWorkspaceInfoCache<readonly MdLink[]>,
  ) {
    this.#configuration = configuration;
    this.#workspace = workspace;
    this.#tocProvider = tocProvider;
    this.#linkCache = linkCache;
  }

  async provideDefinition(document: Document, position: lsp.Position, token: CancellationToken): Promise<lsp.Definition | undefined> {

    if (token.isCancellationRequested) {
      return [];
    }

    const toc = await this.#tocProvider.getForDocument(document);

    if (token.isCancellationRequested) {
      return [];
    }

    const header = toc.entries.find(entry => entry.line === position.line);
    if (isTocHeaderEntry(header)) {
      return header.headerLocation;
    }

    return this.#getDefinitionOfLinkAtPosition(document, position, token);
  }

  async #getDefinitionOfLinkAtPosition(document: Document, position: lsp.Position, token: CancellationToken): Promise<lsp.Definition | undefined> {
    const docLinks = (await this.#linkCache.getForDocs([document]))[0];

    for (const link of docLinks) {
      if (link.kind === MdLinkKind.Definition && rangeContains(link.ref.range, position)) {
        return this.#getDefinitionOfRef(link.ref.text, docLinks);
      }
      if (rangeContains(link.source.hrefRange, position)) {
        return this.#getDefinitionOfLink(link, docLinks, token);
      }
    }

    return undefined;
  }

  async #getDefinitionOfLink(sourceLink: MdLink, allLinksInFile: readonly MdLink[], token: CancellationToken): Promise<lsp.Definition | undefined> {
    if (sourceLink.href.kind === HrefKind.Reference) {
      return this.#getDefinitionOfRef(sourceLink.href.ref, allLinksInFile);
    }

    if (sourceLink.href.kind === HrefKind.External || !sourceLink.href.fragment) {
      return undefined;
    }

    const resolvedResource = await statLinkToMarkdownFile(this.#configuration, this.#workspace, sourceLink.href.path);
    if (!resolvedResource || token.isCancellationRequested) {
      return undefined;
    }

    const toc = await this.#tocProvider.get(resolvedResource);
    const entry = toc.lookup(sourceLink.href.fragment);
    if (isTocHeaderEntry(entry)) {
      return entry.headerLocation;
    }
  }

  #getDefinitionOfRef(ref: string, allLinksInFile: readonly MdLink[]) {
    const allDefinitions = new LinkDefinitionSet(allLinksInFile);
    const def = allDefinitions.lookup(ref);
    return def ? { range: def.source.range, uri: def.source.resource.toString() } : undefined;
  }
}
