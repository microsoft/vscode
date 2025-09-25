/*
 * references.ts
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
import { URI } from 'vscode-uri';
import { Disposable } from 'core';
import { translatePosition, areRangesEqual, modifyRange, rangeContains, getDocUri, Document, Parser } from 'quarto-core';
import { LsConfiguration } from '../config';
import { ILogger } from '../logging';
import { MdTableOfContentsProvider, TocHeaderEntry, isTocHeaderEntry } from '../toc';
import { looksLikeMarkdownUri } from '../util/file';
import { IWorkspace, statLinkToMarkdownFile } from '../workspace';
import { MdWorkspaceInfoCache } from '../workspace-cache';
import { HrefKind, looksLikeLinkToResource, MdLink, MdLinkKind } from './document-links';
import { pandocSlugifier } from '../slugify';

export enum MdReferenceKind {
  Link = 1,
  Header = 2,
}

/**
 * A link in a markdown file.
 */
export interface MdLinkReference {
  readonly kind: MdReferenceKind.Link;
  readonly isTriggerLocation: boolean;
  readonly isDefinition: boolean;
  readonly location: lsp.Location;

  readonly link: MdLink;
}

/**
 * A header in a markdown file.
 */
export interface MdHeaderReference {
  readonly kind: MdReferenceKind.Header;

  readonly isTriggerLocation: boolean;
  readonly isDefinition: boolean;

  /**
   * The range of the header.
   *
   * In `# a b c #` this would be the range of `# a b c #`
   */
  readonly location: lsp.Location;

  /**
   * The text of the header.
   *
   * In `# a b c #` this would be `a b c`
   */
  readonly headerText: string;

  /**
   * The range of the header text itself.
   *
   * In `# a b c #` this would be the range of `a b c`
   */
  readonly headerTextLocation: lsp.Location;
}

export type MdReference = MdLinkReference | MdHeaderReference;

/**
 * Stateful object that computes references for markdown files.
 */
export class MdReferencesProvider extends Disposable {

  readonly #configuration: LsConfiguration;
  readonly #_parser: Parser;
  readonly #workspace: IWorkspace;
  readonly #tocProvider: MdTableOfContentsProvider;
  readonly #linkCache: MdWorkspaceInfoCache<readonly MdLink[]>;
  readonly #logger: ILogger;

  public constructor(
    configuration: LsConfiguration,
    parser: Parser,
    workspace: IWorkspace,
    tocProvider: MdTableOfContentsProvider,
    linkCache: MdWorkspaceInfoCache<readonly MdLink[]>,
    logger: ILogger,
  ) {
    super();

    this.#configuration = configuration;
    this.#_parser = parser;
    this.#workspace = workspace;
    this.#tocProvider = tocProvider;
    this.#linkCache = linkCache;
    this.#logger = logger;
    
    // _parser is intentionally unused but kept for interface compatibility
    void this.#_parser;
  }

  async provideReferences(document: Document, position: lsp.Position, context: lsp.ReferenceContext, token: CancellationToken): Promise<lsp.Location[]> {
    if (token.isCancellationRequested) {
      return [];
    }
    const allRefs = await this.getReferencesAtPosition(document, position, token);
    return allRefs
      .filter(ref => context.includeDeclaration || !ref.isDefinition)
      .map(ref => ref.location);
  }

  public async getReferencesAtPosition(document: Document, position: lsp.Position, token: CancellationToken): Promise<MdReference[]> {
    this.#logger.logDebug('ReferencesProvider.getReferencesAtPosition', { document: document.uri, version: document.version });

    const toc = await this.#tocProvider.getForDocument(document);
    if (token.isCancellationRequested) {
      return [];
    }

    const header = toc.entries.find(entry => entry.line === position.line);
    if (isTocHeaderEntry(header)) {
      return this.#getReferencesToHeader(document, header, token);
    } else {
      return this.#getReferencesToLinkAtPosition(document, position, token);
    }
  }

  public async getReferencesToFileInWorkspace(resource: URI, token: CancellationToken): Promise<MdReference[]> {
    this.#logger.logDebug('ReferencesProvider.getAllReferencesToFileInWorkspace', { resource });

    if (token.isCancellationRequested) {
      return [];
    }

    const allLinksInWorkspace = await this.#getAllLinksInWorkspace();

    if (token.isCancellationRequested) {
      return [];
    }

    return Array.from(this.#findLinksToFile(resource, allLinksInWorkspace, undefined));
  }

  async #getReferencesToHeader(document: Document, header: TocHeaderEntry, token: CancellationToken): Promise<MdReference[]> {


    const links = await this.#getAllLinksInWorkspace();
    if (token.isCancellationRequested) {
      return [];
    }

    const references: MdReference[] = [];

    references.push({
      kind: MdReferenceKind.Header,
      isTriggerLocation: true,
      isDefinition: true,
      location: header.headerLocation,
      headerText: header.text,
      headerTextLocation: header.headerTextLocation
    });

    for (const link of links) {
      if (link.href.kind === HrefKind.Internal
        && looksLikeLinkToResource(this.#configuration, link.href, getDocUri(document))
        && pandocSlugifier.fromHeading(link.href.fragment).value === header.slug.value
      ) {
        references.push({
          kind: MdReferenceKind.Link,
          isTriggerLocation: false,
          isDefinition: false,
          link,
          location: { uri: link.source.resource.toString(), range: link.source.hrefRange },
        });
      }
    }

    return references;
  }

  async #getReferencesToLinkAtPosition(document: Document, position: lsp.Position, token: CancellationToken): Promise<MdReference[]> {
    const docLinks = (await this.#linkCache.getForDocs([document]))[0];
    if (token.isCancellationRequested) {
      return [];
    }

    for (const link of docLinks) {
      if (link.kind === MdLinkKind.Definition) {
        // We could be in either the ref name or the definition
        if (rangeContains(link.ref.range, position)) {
          return Array.from(this.#getReferencesToLinkReference(docLinks, link.ref.text, { resource: getDocUri(document), range: link.ref.range }));
        } else if (rangeContains(link.source.hrefRange, position)) {
          return this.#getReferencesToLink(docLinks, link, position, token);
        }
      } else {
        if (rangeContains(link.source.hrefRange, position)) {
          return this.#getReferencesToLink(docLinks, link, position, token);
        }
      }
    }

    return [];
  }

  async #getReferencesToLink(docLinks: Iterable<MdLink>, sourceLink: MdLink, triggerPosition: lsp.Position, token: CancellationToken): Promise<MdReference[]> {
    if (sourceLink.href.kind === HrefKind.Reference) {
      return Array.from(this.#getReferencesToLinkReference(docLinks, sourceLink.href.ref, { resource: sourceLink.source.resource, range: sourceLink.source.hrefRange }));
    }

    // Otherwise find all occurrences of the link in the workspace
    const allLinksInWorkspace = await this.#getAllLinksInWorkspace();
    if (token.isCancellationRequested) {
      return [];
    }

    if (sourceLink.href.kind === HrefKind.External) {
      const references: MdReference[] = [];

      for (const link of allLinksInWorkspace) {
        if (link.href.kind === HrefKind.External && link.href.uri.toString() === sourceLink.href.uri.toString()) {
          const isTriggerLocation = sourceLink.source.resource.fsPath === link.source.resource.fsPath && areRangesEqual(sourceLink.source.hrefRange, link.source.hrefRange);
          references.push({
            kind: MdReferenceKind.Link,
            isTriggerLocation,
            isDefinition: false,
            link,
            location: { uri: link.source.resource.toString(), range: link.source.hrefRange },
          });
        }
      }
      return references;
    }

    const resolvedResource = await statLinkToMarkdownFile(this.#configuration, this.#workspace, sourceLink.href.path);
    if (token.isCancellationRequested) {
      return [];
    }

    const references: MdReference[] = [];

    if (resolvedResource && this.#isMarkdownPath(resolvedResource) && sourceLink.href.fragment && sourceLink.source.fragmentRange && rangeContains(sourceLink.source.fragmentRange, triggerPosition)) {
      const toc = await this.#tocProvider.get(resolvedResource);
      const entry = toc.lookup(sourceLink.href.fragment);
      if (isTocHeaderEntry(entry)) {
        references.push({
          kind: MdReferenceKind.Header,
          isTriggerLocation: false,
          isDefinition: true,
          location: entry.headerLocation,
          headerText: entry.text,
          headerTextLocation: entry.headerTextLocation
        });
      }

      for (const link of allLinksInWorkspace) {
        if (link.href.kind !== HrefKind.Internal || !looksLikeLinkToResource(this.#configuration, link.href, resolvedResource)) {
          continue;
        }

        if (pandocSlugifier.fromHeading(link.href.fragment).equals(pandocSlugifier.fromHeading(sourceLink.href.fragment))) {
          const isTriggerLocation = sourceLink.source.resource.fsPath === link.source.resource.fsPath && areRangesEqual(sourceLink.source.hrefRange, link.source.hrefRange);
          references.push({
            kind: MdReferenceKind.Link,
            isTriggerLocation,
            isDefinition: false,
            link,
            location: { uri: link.source.resource.toString(), range: link.source.hrefRange },
          });
        }
      }
    } else { // Triggered on a link without a fragment so we only require matching the file and ignore fragments
      references.push(...this.#findLinksToFile(resolvedResource ?? sourceLink.href.path, allLinksInWorkspace, sourceLink));
    }

    return references;
  }

  async #getAllLinksInWorkspace(): Promise<readonly MdLink[]> {
    return (await this.#linkCache.values()).flat();
  }

  #isMarkdownPath(resolvedHrefPath: URI) {
    return this.#workspace.hasMarkdownDocument(resolvedHrefPath) || looksLikeMarkdownUri(this.#configuration, resolvedHrefPath);
  }

  *#findLinksToFile(resource: URI, links: readonly MdLink[], sourceLink: MdLink | undefined): Iterable<MdReference> {
    for (const link of links) {
      if (link.href.kind !== HrefKind.Internal || !looksLikeLinkToResource(this.#configuration, link.href, resource)) {
        continue;
      }

      // Exclude cases where the file is implicitly referencing itself
      if (link.source.hrefText.startsWith('#') && link.source.resource.fsPath === resource.fsPath) {
        continue;
      }

      const isTriggerLocation = !!sourceLink && sourceLink.source.resource.fsPath === link.source.resource.fsPath && areRangesEqual(sourceLink.source.hrefRange, link.source.hrefRange);
      const pathRange = this.#getPathRange(link);
      yield {
        kind: MdReferenceKind.Link,
        isTriggerLocation,
        isDefinition: false,
        link,
        location: { uri: link.source.resource.toString(), range: pathRange },
      };
    }
  }

  *#getReferencesToLinkReference(allLinks: Iterable<MdLink>, refToFind: string, from: { resource: URI; range: lsp.Range }): Iterable<MdReference> {
    for (const link of allLinks) {
      let ref: string;
      if (link.kind === MdLinkKind.Definition) {
        ref = link.ref.text;
      } else if (link.href.kind === HrefKind.Reference) {
        ref = link.href.ref;
      } else {
        continue;
      }

      if (ref === refToFind && link.source.resource.fsPath === from.resource.fsPath) {
        const isTriggerLocation = from.resource.fsPath === link.source.resource.fsPath && (
          (link.href.kind === HrefKind.Reference && areRangesEqual(from.range, link.source.hrefRange)) || (link.kind === MdLinkKind.Definition && areRangesEqual(from.range, link.ref.range)));

        const pathRange = this.#getPathRange(link);
        yield {
          kind: MdReferenceKind.Link,
          isTriggerLocation,
          isDefinition: link.kind === MdLinkKind.Definition,
          link,
          location: { uri: from.resource.toString(), range: pathRange },
        };
      }
    }
  }

  /**
   * Get just the range of the file path, dropping the fragment
   */
  #getPathRange(link: MdLink): lsp.Range {
    return link.source.fragmentRange
      ? modifyRange(link.source.hrefRange, undefined, translatePosition(link.source.fragmentRange.start, { characterDelta: -1 }))
      : link.source.hrefRange;
  }
}
