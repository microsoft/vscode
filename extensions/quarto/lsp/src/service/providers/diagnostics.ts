/*
 * diagnostics.ts
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

import * as l10n from '@vscode/l10n';
import * as picomatch from 'picomatch';
import { CancellationToken, DiagnosticSeverity, Emitter, Event } from 'vscode-languageserver';
import * as lsp from 'vscode-languageserver-types';
import { URI } from 'vscode-uri';

import { Disposable, IDisposable, Limiter } from 'core';

import { translatePosition, modifyRange, Document, getDocUri } from 'quarto-core';

import { LsConfiguration } from '../config';
import { MdTableOfContentsProvider } from '../toc';
import { looksLikeMarkdownUri } from '../util/file';
import { ResourceMap } from '../util/resource-maps';
import { FileStat, IWorkspace, IWorkspaceWithWatching, statLinkToMarkdownFile } from '../workspace';
import { HrefKind, InternalHref, LinkDefinitionSet, MdLink, MdLinkDefinition, MdLinkKind, MdLinkProvider, MdLinkSource, parseLocationInfoFromFragment, ReferenceLinkMap } from './document-links';
import { ILogger, LogLevel } from '../logging';
import { Quarto } from '../quarto';
import { provideYamlDiagnostics } from './diagnostics-yaml';

/**
 * The severity at which diagnostics are reported
 */
export enum DiagnosticLevel {
  /** Don't report this diagnostic. */
  ignore = 'ignore',

  /**
   * Report the diagnostic at a hint level.
   *
   * Hints will typically not be directly reported by editors, but may show up as unused spans.
   */
  hint = 'hint',

  /** Report the diagnostic as a warning. */
  warning = 'warning',

  /** Report the diagnostic as an error. */
  error = 'error',
}

/**
 * Configure how diagnostics are computed.
 */
export interface DiagnosticOptions {

  /**
   * Should markdown be validated at all? (false disables all of the below)
   */
  readonly enabled: boolean;

  /**
   * Diagnostic level for invalid reference links, e.g. `[text][no-such-ref]`.
   */
  readonly validateReferences: DiagnosticLevel | undefined;

  /**
   * Diagnostic level for fragments links to headers in the current file that don't exist, e.g. `[text](#no-such-header)`.
   */
  readonly validateFragmentLinks: DiagnosticLevel | undefined;

  /**
   * Diagnostic level for links to local files that don't exist, e.g. `[text](./no-such-file.png)`.
   */
  readonly validateFileLinks: DiagnosticLevel | undefined;

  /**
   * Diagnostic level for the fragment part of links to other local markdown files , e.g. `[text](./file.md#no-such-header)`.
   */
  readonly validateMarkdownFileLinkFragments: DiagnosticLevel | undefined;

  /**
   * Diagnostic level for link definitions that aren't used anywhere. `[never-used]: http://example.com`.
   */
  readonly validateUnusedLinkDefinitions: DiagnosticLevel | undefined;

  /**
   * Diagnostic level for duplicate link definitions.
   */
  readonly validateDuplicateLinkDefinitions: DiagnosticLevel | undefined;

  /**
   * Glob of links that should not be validated.
   */
  readonly ignoreLinks: readonly string[];
}

function toSeverity(level: DiagnosticLevel | undefined): DiagnosticSeverity | undefined {
  switch (level) {
    case DiagnosticLevel.error: return DiagnosticSeverity.Error;
    case DiagnosticLevel.warning: return DiagnosticSeverity.Warning;
    case DiagnosticLevel.hint: return DiagnosticSeverity.Hint;
    case DiagnosticLevel.ignore: return undefined;
    case undefined: return undefined;
  }
}

/**
 * Error codes of Markdown diagnostics
 */
export enum DiagnosticCode {
  /** The linked to reference does not exist. */
  link_noSuchReferences = 'link.no-such-reference',

  /** The linked to heading does not exist in the current file. */
  link_noSuchHeaderInOwnFile = 'link.no-such-header-in-own-file',

  /** The linked to local file does not exist. */
  link_noSuchFile = 'link.no-such-file',

  /** The linked to heading does not exist in the another file. */
  link_noSuchHeaderInFile = 'link.no-such-header-in-file',

  /** The link definition is not used anywhere. */
  link_unusedDefinition = 'link.unused-definition',

  /** The link definition is not used anywhere. */
  link_duplicateDefinition = 'link.duplicate-definition',
}

/**
 * Map of file paths to markdown links to that file.
 */
class FileLinkMap {

  readonly #filesToLinksMap = new ResourceMap<{
    readonly outgoingLinks: Array<{
      readonly source: MdLinkSource;
      readonly fragment: string;
    }>;
  }>();

  constructor(links: Iterable<MdLink>) {
    for (const link of links) {
      if (link.href.kind !== HrefKind.Internal) {
        continue;
      }

      const existingFileEntry = this.#filesToLinksMap.get(link.href.path);
      const linkData = { source: link.source, fragment: link.href.fragment };
      if (existingFileEntry) {
        existingFileEntry.outgoingLinks.push(linkData);
      } else {
        this.#filesToLinksMap.set(link.href.path, { outgoingLinks: [linkData] });
      }
    }
  }

  public get size(): number {
    return this.#filesToLinksMap.size;
  }

  public entries() {
    return this.#filesToLinksMap.entries();
  }
}

export class DiagnosticOnSaveComputer {
  constructor(private readonly quarto_: Quarto) { }

  public async compute(doc: Document): Promise<lsp.Diagnostic[]> {
    return provideYamlDiagnostics(this.quarto_, doc);
  }
}

export class DiagnosticComputer {

  readonly #configuration: LsConfiguration;
  readonly #workspace: IWorkspace;
  readonly #linkProvider: MdLinkProvider;
  readonly #tocProvider: MdTableOfContentsProvider;
  readonly #logger: ILogger;

  constructor(
    configuration: LsConfiguration,
    workspace: IWorkspace,
    linkProvider: MdLinkProvider,
    tocProvider: MdTableOfContentsProvider,
    logger: ILogger,
  ) {
    this.#configuration = configuration;
    this.#workspace = workspace;
    this.#linkProvider = linkProvider;
    this.#tocProvider = tocProvider;
    this.#logger = logger;
  }

  public async compute(
    doc: Document,
    options: DiagnosticOptions,
    token: CancellationToken,
  ): Promise<{
    readonly diagnostics: lsp.Diagnostic[];
    readonly links: readonly MdLink[];
    readonly statCache: ResourceMap<{ readonly exists: boolean }>;
  }> {
    this.#logger.logDebug('DiagnosticComputer.compute', { document: doc.uri, version: doc.version });

    const { links, definitions } = await this.#linkProvider.getLinks(doc);
    const statCache = new ResourceMap<{ readonly exists: boolean }>();
    if (token.isCancellationRequested) {
      return { links, diagnostics: [], statCache };
    }

    // Current doc always implicitly exists
    statCache.set(getDocUri(doc), { exists: true });

    // base diagnostics
    const diagnostics: lsp.Diagnostic[] = [];

    // optionally produce markdown diagnostics
    if (options.enabled) {
      diagnostics.push(...(await Promise.all([
        this.#validateFileLinks(options, links, statCache, token),
        this.#validateFragmentLinks(doc, options, links, token),
        Array.from(this.#validateReferenceLinks(options, links, definitions)),
        Array.from(this.#validateUnusedLinkDefinitions(options, links)),
        Array.from(this.#validateDuplicateLinkDefinitions(options, links)),
      ])).flat());
    }

    this.#logger.logTrace('DiagnosticComputer.compute finished', { document: doc.uri, version: doc.version, diagnostics });

    return {
      links: links,
      statCache,
      diagnostics: diagnostics
    };
  }

  async #validateFragmentLinks(doc: Document, options: DiagnosticOptions, links: readonly MdLink[], token: CancellationToken): Promise<lsp.Diagnostic[]> {
    const severity = toSeverity(options.validateFragmentLinks);
    if (typeof severity === 'undefined') {
      return [];
    }

    const toc = await this.#tocProvider.getForDocument(doc);
    if (token.isCancellationRequested) {
      return [];
    }

    const diagnostics: lsp.Diagnostic[] = [];
    for (const link of links) {

      if (link.href.kind === HrefKind.Internal
        && link.source.hrefText.startsWith('#')
        && link.href.path.toString() === doc.uri.toString()
        && link.href.fragment
        && !toc.lookup(link.href.fragment)
      ) {
        // Don't validate line number links
        if (parseLocationInfoFromFragment(link.href.fragment)) {
          continue;
        }

        if (!this.#isIgnoredLink(options, link.source.hrefText)) {
          diagnostics.push({
            code: DiagnosticCode.link_noSuchHeaderInOwnFile,
            message: l10n.t('No header found: \'{0}\'', link.href.fragment),
            range: link.source.hrefRange,
            severity,
            data: {
              hrefText: link.source.hrefText
            }
          });
        }
      }
    }

    return diagnostics;
  }

  *#validateReferenceLinks(options: DiagnosticOptions, links: readonly MdLink[], definitions: LinkDefinitionSet): Iterable<lsp.Diagnostic> {
    const severity = toSeverity(options.validateReferences);
    if (typeof severity === 'undefined') {
      return [];
    }

    for (const link of links) {
      if (link.href.kind === HrefKind.Reference && !definitions.lookup(link.href.ref)) {
        yield {
          code: DiagnosticCode.link_noSuchReferences,
          message: l10n.t('No link definition found: \'{0}\'', link.href.ref),
          range: link.source.hrefRange,
          severity,
          data: {
            ref: link.href.ref,
          },
        };
      }
    }
  }

  *#validateUnusedLinkDefinitions(options: DiagnosticOptions, links: readonly MdLink[]): Iterable<lsp.Diagnostic> {
    const errorSeverity = toSeverity(options.validateUnusedLinkDefinitions);
    if (typeof errorSeverity === 'undefined') {
      return;
    }

    const usedRefs = new ReferenceLinkMap<boolean>();
    for (const link of links) {
      if (link.kind === MdLinkKind.Link && link.href.kind === HrefKind.Reference) {
        usedRefs.set(link.href.ref, true);
      }
    }

    for (const link of links) {
      if (link.kind === MdLinkKind.Definition && !usedRefs.lookup(link.ref.text)) {
        yield {
          code: DiagnosticCode.link_unusedDefinition,
          message: l10n.t('Link definition is unused'),
          range: link.source.range,
          severity: errorSeverity,
          tags: [
            lsp.DiagnosticTag.Unnecessary,
          ],
          data: link
        };
      }
    }
  }

  *#validateDuplicateLinkDefinitions(options: DiagnosticOptions, links: readonly MdLink[]): Iterable<lsp.Diagnostic> {
    const errorSeverity = toSeverity(options.validateDuplicateLinkDefinitions);
    if (typeof errorSeverity === 'undefined') {
      return;
    }

    const definitionMultiMap = new Map<string, MdLinkDefinition[]>();
    for (const link of links) {
      if (link.kind === MdLinkKind.Definition) {
        const existing = definitionMultiMap.get(link.ref.text);
        if (existing) {
          existing.push(link);
        } else {
          definitionMultiMap.set(link.ref.text, [link]);
        }
      }
    }

    for (const [ref, defs] of definitionMultiMap) {
      if (defs.length <= 1) {
        continue;
      }

      for (const duplicateDef of defs) {
        yield {
          code: DiagnosticCode.link_duplicateDefinition,
          message: l10n.t('Link definition for \'{0}\' already exists', ref),
          range: duplicateDef.ref.range,
          severity: errorSeverity,
          relatedInformation:
            defs
              .filter(x => x !== duplicateDef)
              .map(def => lsp.DiagnosticRelatedInformation.create(
                { uri: def.source.resource.toString(), range: def.ref.range },
                l10n.t('Link is also defined here'),
              )),
          data: duplicateDef
        };
      }
    }
  }

  async #validateFileLinks(
    options: DiagnosticOptions,
    links: readonly MdLink[],
    statCache: ResourceMap<{ readonly exists: boolean }>,
    token: CancellationToken,
  ): Promise<lsp.Diagnostic[]> {
    const pathErrorSeverity = toSeverity(options.validateFileLinks);
    if (typeof pathErrorSeverity === 'undefined') {
      return [];
    }
    const fragmentErrorSeverity = toSeverity(typeof options.validateMarkdownFileLinkFragments === 'undefined' ? options.validateFragmentLinks : options.validateMarkdownFileLinkFragments);

    // We've already validated our own fragment links in `validateOwnHeaderLinks`
    const linkSet = new FileLinkMap(links.filter(link => !link.source.hrefText.startsWith('#')));
    if (linkSet.size === 0) {
      return [];
    }

    const limiter = new Limiter(10);

    const diagnostics: lsp.Diagnostic[] = [];
    await Promise.all(
      Array.from(linkSet.entries()).map(([path, { outgoingLinks: links }]) => {
        return limiter.queue(async () => {
          if (token.isCancellationRequested) {
            return;
          }

          const resolvedHrefPath = await statLinkToMarkdownFile(this.#configuration, this.#workspace, path, statCache);
          if (token.isCancellationRequested) {
            return;
          }

          if (!resolvedHrefPath) {
            for (const link of links) {
              if (!this.#isIgnoredLink(options, link.source.pathText)) {
                diagnostics.push({
                  code: DiagnosticCode.link_noSuchFile,
                  message: l10n.t('File does not exist at path: {0}', path.fsPath),
                  range: link.source.hrefRange,
                  severity: pathErrorSeverity,
                  data: {
                    fsPath: path.fsPath,
                    hrefText: link.source.pathText,
                  }
                });
              }
            }
          } else if (typeof fragmentErrorSeverity !== 'undefined' && this.#isMarkdownPath(resolvedHrefPath)) {
            // Validate each of the links to headers in the file
            const fragmentLinks = links.filter(x => x.fragment);
            if (fragmentLinks.length) {
              const toc = await this.#tocProvider.get(resolvedHrefPath);
              if (token.isCancellationRequested) {
                return;
              }

              for (const link of fragmentLinks) {
                // Don't validate line number links
                if (parseLocationInfoFromFragment(link.fragment)) {
                  continue;
                }

                if (!toc.lookup(link.fragment) && !this.#isIgnoredLink(options, link.source.pathText) && !this.#isIgnoredLink(options, link.source.hrefText)) {
                  const range = (link.source.fragmentRange && modifyRange(link.source.fragmentRange, translatePosition(link.source.fragmentRange.start, { characterDelta: -1 }), undefined)) ?? link.source.hrefRange;
                  diagnostics.push({
                    code: DiagnosticCode.link_noSuchHeaderInFile,
                    message: l10n.t('Header does not exist in file: {0}', link.fragment),
                    range: range,
                    severity: fragmentErrorSeverity,
                    data: {
                      fragment: link.fragment,
                      hrefText: link.source.hrefText
                    },
                  });
                }
              }
            }
          }
        });
      }));
    return diagnostics;
  }

  #isMarkdownPath(resolvedHrefPath: URI) {
    return this.#workspace.hasMarkdownDocument(resolvedHrefPath) || looksLikeMarkdownUri(this.#configuration, resolvedHrefPath);
  }

  #isIgnoredLink(options: DiagnosticOptions, link: string): boolean {
    return options.ignoreLinks.some(glob => picomatch.isMatch(link, glob));
  }
}

/**
 * Stateful object that can more efficiently compute diagnostics for the workspace.
 */
export interface IPullDiagnosticsManager {

  /**
   * Dispose of the diagnostic manager and clean up any associated resources.
   */
  dispose(): void;

  /**
   * Event fired when a file that Markdown document is linking to changes.
   */
  readonly onLinkedToFileChanged: Event<{
    readonly changedResource: URI;
    readonly linkingResources: readonly URI[];
  }>;

  /**
   * Compute the current diagnostics for a file.
   */
  computeDiagnostics(doc: Document, options: DiagnosticOptions, token: CancellationToken): Promise<lsp.Diagnostic[]>;

  /**
   * Clean up resources that help provide diagnostics for a document.
   *
   * You should call this when you will no longer be making diagnostic requests for a document, for example
   * when the file has been closed in the editor (but still exists on disk).
   */
  disposeDocumentResources(document: URI): void;
}

class FileLinkState extends Disposable {

  readonly #onDidChangeLinkedToFile = this._register(new Emitter<{
    readonly changedResource: URI;
    readonly linkingFiles: Iterable<URI>;
    readonly exists: boolean;
  }>);
  /**
   * Event fired with a list of document uri when one of the links in the document changes
   */
  public readonly onDidChangeLinkedToFile = this.#onDidChangeLinkedToFile.event;

  readonly #linkedToFile = new ResourceMap<{
    /**
     * Watcher for this link path
     */
    readonly watcher: IDisposable;

    /**
     * List of documents that reference the link
     */
    readonly documents: ResourceMap</* document resource*/ URI>;

    exists: boolean;
  }>();

  readonly #workspace: IWorkspaceWithWatching;
  readonly #logger: ILogger;

  constructor(workspace: IWorkspaceWithWatching, logger: ILogger) {
    super();

    this.#workspace = workspace;
    this.#logger = logger;
  }

  override dispose() {
    super.dispose();

    for (const entry of this.#linkedToFile.values()) {
      entry.watcher.dispose();
    }
    this.#linkedToFile.clear();
  }

  /**
   * Set the known links in a markdown document, adding and removing file watchers as needed
   */
  updateLinksForDocument(document: URI, links: readonly MdLink[], statCache: ResourceMap<{ readonly exists: boolean }>) {
    const linkedToResource = new Set<{ path: URI; exists: boolean }>(
      links
        .filter(link => link.href.kind === HrefKind.Internal)
        .map(link => ({ path: (link.href as InternalHref).path, exists: !!(statCache.get((link.href as InternalHref).path)?.exists) })));

    // First decrement watcher counter for previous document state
    for (const entry of this.#linkedToFile.values()) {
      entry.documents.delete(document);
    }

    // Then create/update watchers for new document state
    for (const { path, exists } of linkedToResource) {
      let entry = this.#linkedToFile.get(path);
      if (!entry) {
        entry = {
          watcher: this.#startWatching(path),
          documents: new ResourceMap(),
          exists
        };
        this.#linkedToFile.set(path, entry);
      }

      entry.documents.set(document, document);
    }

    // Finally clean up watchers for links that are no longer are referenced anywhere
    for (const [key, value] of this.#linkedToFile) {
      if (value.documents.size === 0) {
        value.watcher.dispose();
        this.#linkedToFile.delete(key);
      }
    }
  }

  public deleteDocument(resource: URI) {
    this.updateLinksForDocument(resource, [], new ResourceMap());
  }

  public tryStatFileLink(link: URI): { exists: boolean } | undefined {
    const entry = this.#linkedToFile.get(link);
    if (!entry) {
      return undefined;
    }
    return { exists: entry.exists };
  }

  #startWatching(path: URI): IDisposable {
    const watcher = this.#workspace.watchFile(path, { ignoreChange: true });
    const deleteReg = watcher.onDidDelete((resource: URI) => this.#onLinkedResourceChanged(resource, false));
    const createReg = watcher.onDidCreate((resource: URI) => this.#onLinkedResourceChanged(resource, true));
    return {
      dispose: () => {
        watcher.dispose();
        deleteReg.dispose();
        createReg.dispose();
      }
    };
  }

  #onLinkedResourceChanged(resource: URI, exists: boolean) {
    this.#logger.logTrace('FileLinkState.onLinkedResourceChanged', { resource, exists });

    const entry = this.#linkedToFile.get(resource);
    if (entry) {
      entry.exists = exists;
      this.#onDidChangeLinkedToFile.fire({
        changedResource: resource,
        linkingFiles: entry.documents.values(),
        exists,
      });
    }
  }
}

export class DiagnosticsManager extends Disposable implements IPullDiagnosticsManager {

  readonly #computer: DiagnosticComputer;
  readonly #linkWatcher: FileLinkState;

  readonly #onLinkedToFileChanged = this._register(new Emitter<{
    readonly changedResource: URI;
    readonly linkingResources: readonly URI[];
  }>());
  public readonly onLinkedToFileChanged = this.#onLinkedToFileChanged.event;

  constructor(
    configuration: LsConfiguration,
    workspace: IWorkspaceWithWatching,
    linkProvider: MdLinkProvider,
    tocProvider: MdTableOfContentsProvider,
    logger: ILogger,
  ) {
    super();

    const linkWatcher = new FileLinkState(workspace, logger);
    this.#linkWatcher = this._register(linkWatcher);

    this._register(this.#linkWatcher.onDidChangeLinkedToFile(e => {
      logger.logTrace('DiagnosticsManager.onDidChangeLinkedToFile', { resource: e.changedResource });

      this.#onLinkedToFileChanged.fire({
        changedResource: e.changedResource,
        linkingResources: Array.from(e.linkingFiles),
      });
    }));

    const stateCachedWorkspace = new Proxy(workspace, {
      get(target, p, receiver) {
        if (p !== 'stat') {
          const value = Reflect.get(target, p, receiver);
          return typeof value === 'function' ? value.bind(workspace) : value;
        }

        return async function (this: unknown, resource: URI): Promise<FileStat | undefined> {
          const stat = linkWatcher.tryStatFileLink(resource);
          if (stat) {
            if (stat.exists) {
              return { isDirectory: false };
            } else {
              return undefined;
            }
          }
          return workspace.stat.call(this === receiver ? target : this, resource);
        };
      },
    });

    this.#computer = new DiagnosticComputer(configuration, stateCachedWorkspace, linkProvider, tocProvider, logger);

    this._register(workspace.onDidDeleteMarkdownDocument(uri => {
      this.#linkWatcher.deleteDocument(uri);
    }));
  }

  public async computeDiagnostics(doc: Document, options: DiagnosticOptions, token: CancellationToken): Promise<lsp.Diagnostic[]> {

    if (token.isCancellationRequested) {
      return [];
    }

    const results = await this.#computer.compute(doc, options, token);

    if (token.isCancellationRequested) {
      return [];
    }

    this.#linkWatcher.updateLinksForDocument(getDocUri(doc), results.links, results.statCache);
    return results.diagnostics;
  }

  public disposeDocumentResources(uri: URI): void {
    this.#linkWatcher.deleteDocument(uri);
  }
}
