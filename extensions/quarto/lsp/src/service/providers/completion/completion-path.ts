/*
 * path-completions.ts
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
import { dirname, extname, resolve } from 'path';
import type { CancellationToken, CompletionContext } from 'vscode-languageserver-protocol';
import * as lsp from 'vscode-languageserver-types';
import { URI, Utils } from 'vscode-uri';
import { isExcludedPath, LsConfiguration } from '../../config';
import { MdTableOfContentsProvider, TableOfContents, TocEntry } from '../../toc';
import { translatePosition, makeRange, getDocUri, getLine, Document, Parser } from 'quarto-core';
import { looksLikeMarkdownFilePath } from '../../util/file';
import { computeRelativePath } from '../../util/path';
import { Schemes } from '../../util/schemes';
import { r } from '../../util/string';
import { FileStat, getWorkspaceFolder, IWorkspace, openLinkToMarkdownFile } from '../../workspace';
import { MdWorkspaceInfoCache } from '../../workspace-cache';
import { MdLinkProvider } from '../document-links';
import { IncludeWorkspaceHeaderCompletions, PathCompletionOptions } from './completion';

enum CompletionContextKind {
  /** `[...](|)` */
  Link,

  /** `[...][|]` */
  ReferenceLink,

  /** `[]: |` */
  LinkDefinition,
}

interface AnchorContext {
  /**
   * Link text before the `#`.
   *
   * For `[text](xy#z|abc)` this is `xy`.
   */
  readonly beforeAnchor: string;

  /**
   * Text of the anchor before the current position.
   *
   * For `[text](xy#z|abc)` this is `z`.
   */
  readonly anchorPrefix: string;
}

interface PathCompletionContext {
  readonly kind: CompletionContextKind;

  /**
   * Text of the link before the current position
   *
   * For `[text](xy#z|abc)` this is `xy#z`.
   */
  readonly linkPrefix: string;

  /**
   * Position of the start of the link.
   *
   * For `[text](xy#z|abc)` this is the position before `xy`.
   */
  readonly linkTextStartPosition: lsp.Position;

  /**
   * Text of the link after the current position.
   *
   * For `[text](xy#z|abc)` this is `abc`.
   */
  readonly linkSuffix: string;

  /**
   * Info if the link looks like it is for an anchor: `[](#header)`
   */
  readonly anchorInfo?: AnchorContext;

  /**
   * Indicates that the completion does not require encoding.
   */
  readonly skipEncoding?: boolean;
}

function tryDecodeUriComponent(str: string): string {
  try {
    return decodeURIComponent(str);
  } catch {
    return str;
  }
}


const sortTexts = Object.freeze({
  localHeader: '1',
  workspaceHeader: '2',
});

/**
 * Adds path completions in markdown files.
 */
export class MdPathCompletionProvider {

  readonly #configuration: LsConfiguration;
  readonly #workspace: IWorkspace;
  readonly #parser: Parser;
  readonly #linkProvider: MdLinkProvider;

  readonly #workspaceTocCache: MdWorkspaceInfoCache<TableOfContents>;

  constructor(
    configuration: LsConfiguration,
    workspace: IWorkspace,
    parser: Parser,
    linkProvider: MdLinkProvider,
    tocProvider: MdTableOfContentsProvider,
  ) {
    this.#configuration = configuration;
    this.#workspace = workspace;
    this.#parser = parser;
    this.#linkProvider = linkProvider;

    this.#workspaceTocCache = new MdWorkspaceInfoCache(workspace, (doc) => tocProvider.getForDocument(doc));
  }

  public async provideCompletionItems(document: Document, position: lsp.Position, _context: CompletionContext, token: CancellationToken): Promise<lsp.CompletionItem[] | null> {
    const pathContext = this.#getPathCompletionContext(document, position);
    if (!pathContext) {
      return [];
    }
    const pathOptions: PathCompletionOptions = {
      includeWorkspaceHeaderCompletions: this.#configuration.includeWorkspaceHeaderCompletions as IncludeWorkspaceHeaderCompletions
    }


    const items: lsp.CompletionItem[] = [];
    for await (const item of this.#provideCompletionItems(document, position, pathContext, pathOptions, token)) {
      items.push(item);
    }
    return items.length > 0 ? items : null;
  }

  async *#provideCompletionItems(document: Document, position: lsp.Position, context: PathCompletionContext, options: PathCompletionOptions, token: CancellationToken): AsyncIterable<lsp.CompletionItem> {
    switch (context.kind) {
      case CompletionContextKind.ReferenceLink: {
        yield* this.#provideReferenceSuggestions(document, position, context, token);
        return;
      }
      case CompletionContextKind.LinkDefinition:
      case CompletionContextKind.Link: {
        if (
          (context.linkPrefix.startsWith('#') && options.includeWorkspaceHeaderCompletions === IncludeWorkspaceHeaderCompletions.onSingleOrDoubleHash) ||
          (context.linkPrefix.startsWith('##') && (options.includeWorkspaceHeaderCompletions === IncludeWorkspaceHeaderCompletions.onDoubleHash || options.includeWorkspaceHeaderCompletions === IncludeWorkspaceHeaderCompletions.onSingleOrDoubleHash))
        ) {
          const insertRange = makeRange(context.linkTextStartPosition, position);
          yield* this.#provideWorkspaceHeaderSuggestions(document, position, context, insertRange, token);
          return;
        }

        const isAnchorInCurrentDoc = context.anchorInfo && context.anchorInfo.beforeAnchor.length === 0;

        // Add anchor #links in current doc
        if (context.linkPrefix.length === 0 || isAnchorInCurrentDoc) {
          const insertRange = makeRange(context.linkTextStartPosition, position);
          yield* this.#provideHeaderSuggestions(document, position, context, insertRange, token);
        }

        if (token.isCancellationRequested) {
          return;
        }

        if (!isAnchorInCurrentDoc) {
          if (context.anchorInfo) { // Anchor to a different document
            const rawUri = this.#resolveReference(document, context.anchorInfo.beforeAnchor);
            if (rawUri) {
              const otherDoc = await openLinkToMarkdownFile(this.#configuration, this.#workspace, rawUri);
              if (token.isCancellationRequested) {
                return;
              }

              if (otherDoc) {
                const anchorStartPosition = translatePosition(position, { characterDelta: -(context.anchorInfo.anchorPrefix.length + 1) });
                const range = makeRange(anchorStartPosition, position);
                yield* this.#provideHeaderSuggestions(otherDoc, position, context, range, token);
              }
            }
          } else { // Normal path suggestions
            yield* this.#providePathSuggestions(document, position, context, token);
          }
        }
      }
    }
  }

  /// [...](...|
  readonly #linkStartPattern = new RegExp(
    // text
    r`\[` +
		/**/r`(?:` +
		/*****/r`[^\[\]\\]|` + // Non-bracket chars, or...
		/*****/r`\\.|` + // Escaped char, or...
		/*****/r`\[[^\[\]]*\]` + // Matched bracket pair
		/**/r`)*` +
    r`\]` +
    // Destination start
    r`\(\s*(<[^\>\)]*|[^\s\(\)]*)` +
    r`$`// Must match cursor position
  );

  /// [...][...|
  readonly #referenceLinkStartPattern = /\[([^\]]*?)\]\[\s*([^\s()]*)$/;

  /// [id]: |
  readonly #definitionPattern = /^\s*\[[\w-]+\]:\s*([^\s]*)$/m;

  #getPathCompletionContext(document: Document, position: lsp.Position): PathCompletionContext | undefined {
    const line = getLine(document, position.line);

    const linePrefixText = line.slice(0, position.character);
    const lineSuffixText = line.slice(position.character);

    const linkPrefixMatch = linePrefixText.match(this.#linkStartPattern);
    if (linkPrefixMatch) {
      const isAngleBracketLink = linkPrefixMatch[1].startsWith('<');
      const prefix = linkPrefixMatch[1].slice(isAngleBracketLink ? 1 : 0);
      if (this.#refLooksLikeUrl(prefix)) {
        return undefined;
      }

      const suffix = lineSuffixText.match(/^[^)\s][^)\s>]*/);
      return {
        kind: CompletionContextKind.Link,
        linkPrefix: tryDecodeUriComponent(prefix),
        linkTextStartPosition: translatePosition(position, { characterDelta: -prefix.length }),
        linkSuffix: suffix ? suffix[0] : '',
        anchorInfo: this.#getAnchorContext(prefix),
        skipEncoding: isAngleBracketLink,
      };
    }

    const definitionLinkPrefixMatch = linePrefixText.match(this.#definitionPattern);
    if (definitionLinkPrefixMatch) {
      const isAngleBracketLink = definitionLinkPrefixMatch[1].startsWith('<');
      const prefix = definitionLinkPrefixMatch[1].slice(isAngleBracketLink ? 1 : 0);
      if (this.#refLooksLikeUrl(prefix)) {
        return undefined;
      }

      const suffix = lineSuffixText.match(/^[^\s]*/);
      return {
        kind: CompletionContextKind.LinkDefinition,
        linkPrefix: tryDecodeUriComponent(prefix),
        linkTextStartPosition: translatePosition(position, { characterDelta: -prefix.length }),
        linkSuffix: suffix ? suffix[0] : '',
        anchorInfo: this.#getAnchorContext(prefix),
        skipEncoding: isAngleBracketLink,
      };
    }

    const referenceLinkPrefixMatch = linePrefixText.match(this.#referenceLinkStartPattern);
    if (referenceLinkPrefixMatch) {
      const prefix = referenceLinkPrefixMatch[2];
      const suffix = lineSuffixText.match(/^[^\]\s]*/);
      return {
        kind: CompletionContextKind.ReferenceLink,
        linkPrefix: prefix,
        linkTextStartPosition: translatePosition(position, { characterDelta: -prefix.length }),
        linkSuffix: suffix ? suffix[0] : '',
      };
    }

    return undefined;
  }

  /**
   * Check if {@param ref} looks like a 'http:' style url.
   */
  #refLooksLikeUrl(prefix: string): boolean {
    return /^\s*[\w\d-]+:/.test(prefix);
  }

  #getAnchorContext(prefix: string): AnchorContext | undefined {
    const anchorMatch = prefix.match(/^(.*)#([\w\d-]*)$/);
    if (!anchorMatch) {
      return undefined;
    }
    return {
      beforeAnchor: anchorMatch[1],
      anchorPrefix: anchorMatch[2],
    };
  }

  async *#provideReferenceSuggestions(document: Document, position: lsp.Position, context: PathCompletionContext, token: CancellationToken): AsyncIterable<lsp.CompletionItem> {
    const insertionRange = makeRange(context.linkTextStartPosition, position);
    const replacementRange = makeRange(insertionRange.start, translatePosition(position, { characterDelta: context.linkSuffix.length }));

    const { definitions } = await this.#linkProvider.getLinks(document);
    if (token.isCancellationRequested) {
      return;
    }

    for (const def of definitions) {
      yield {
        kind: lsp.CompletionItemKind.Reference,
        label: def.ref.text,
        detail: l10n.t(`Reference link '{0}'`, def.ref.text),
        textEdit: {
          newText: def.ref.text,
          insert: insertionRange,
          replace: replacementRange,
        },
      };
    }
  }

  async *#provideHeaderSuggestions(document: Document, position: lsp.Position, context: PathCompletionContext, insertionRange: lsp.Range, token: CancellationToken): AsyncIterable<lsp.CompletionItem> {
    const toc = await TableOfContents.createForContainingDoc(this.#parser, this.#workspace, document, token);
    if (token.isCancellationRequested) {
      return;
    }

    const replacementRange = makeRange(insertionRange.start, translatePosition(position, { characterDelta: context.linkSuffix.length }));
    for (const entry of toc.entries) {
      const completionItem = this.#createHeaderCompletion(entry, insertionRange, replacementRange);
      completionItem.labelDetails = {

      };
      yield completionItem;
    }
  }

  #createHeaderCompletion(entry: TocEntry, insertionRange: lsp.Range, replacementRange: lsp.Range, filePath = ''): lsp.CompletionItem {
    const label = '#' + decodeURIComponent(entry.slug.value);
    const newText = filePath + '#' + decodeURIComponent(entry.slug.value);
    return {
      kind: lsp.CompletionItemKind.Reference,
      label,
      detail: this.#ownHeaderEntryDetails(entry),
      textEdit: {
        newText,
        insert: insertionRange,
        replace: replacementRange,
      },
    };
  }

  #ownHeaderEntryDetails(entry: TocEntry): string | undefined {
    return l10n.t(`Link to '{0}'`, '#'.repeat(entry.level) + ' ' + entry.text);
  }

  /**
   * Suggestions for headers across  all md files in the workspace
   */
  async *#provideWorkspaceHeaderSuggestions(document: Document, position: lsp.Position, context: PathCompletionContext, insertionRange: lsp.Range, token: CancellationToken): AsyncIterable<lsp.CompletionItem> {
    const tocs = await this.#workspaceTocCache.entries();
    if (token.isCancellationRequested) {
      return;
    }

    const replacementRange = makeRange(insertionRange.start, translatePosition(position, { characterDelta: context.linkSuffix.length }));
    for (const [toDoc, toc] of tocs) {
      const isHeaderInCurrentDocument = toDoc.toString() === getDocUri(document).toString();

      const rawPath = isHeaderInCurrentDocument ? '' : computeRelativePath(getDocUri(document), toDoc);
      if (typeof rawPath === 'undefined') {
        continue;
      }

      const normalizedPath = this.#normalizeFileNameCompletion(rawPath);
      const path = context.skipEncoding ? normalizedPath : encodeURI(normalizedPath);
      for (const entry of toc.entries) {
        const completionItem = this.#createHeaderCompletion(entry, insertionRange, replacementRange, path);
        completionItem.filterText = '#' + completionItem.label;
        completionItem.sortText = isHeaderInCurrentDocument ? sortTexts.localHeader : sortTexts.workspaceHeader;

        if (isHeaderInCurrentDocument) {
          completionItem.detail = this.#ownHeaderEntryDetails(entry);
        } else if (path) {
          completionItem.detail = l10n.t(`Link to '# {0}' in '{1}'`, entry.text, path);
          completionItem.labelDetails = { description: path };
        }
        yield completionItem;
      }
    }
  }

  async *#providePathSuggestions(document: Document, position: lsp.Position, context: PathCompletionContext, token: CancellationToken): AsyncIterable<lsp.CompletionItem> {
    const valueBeforeLastSlash = context.linkPrefix.substring(0, context.linkPrefix.lastIndexOf('/') + 1); // keep the last slash

    const parentDir = this.#resolveReference(document, valueBeforeLastSlash || '.');
    if (!parentDir) {
      return;
    }

    const pathSegmentStart = translatePosition(position, { characterDelta: valueBeforeLastSlash.length - context.linkPrefix.length });
    const insertRange = makeRange(pathSegmentStart, position);

    const pathSegmentEnd = translatePosition(position, { characterDelta: context.linkSuffix.length });
    const replacementRange = makeRange(pathSegmentStart, pathSegmentEnd);

    let dirInfo: Iterable<readonly [string, FileStat]>;
    try {
      dirInfo = await this.#workspace.readDirectory(parentDir);
    } catch {
      return;
    }

    if (token.isCancellationRequested) {
      return;
    }

    // eslint-disable-next-line prefer-const
    for (let [name, type] of dirInfo) {
      const uri = Utils.joinPath(parentDir, name);
      if (isExcludedPath(this.#configuration, uri)) {
        continue;
      }

      if (!type.isDirectory) {
        name = this.#normalizeFileNameCompletion(name);
      }

      const isDir = type.isDirectory;
      const newText = (context.skipEncoding ? name : encodeURIComponent(name)) + (isDir ? '/' : '');
      const label = isDir ? name + '/' : name;
      yield {
        label,
        kind: isDir ? lsp.CompletionItemKind.Folder : lsp.CompletionItemKind.File,
        detail: l10n.t(`Link to '{0}'`, label),
        documentation: isDir ? uri.path + '/' : uri.path,
        textEdit: {
          newText,
          insert: insertRange,
          replace: replacementRange,
        },
        command: isDir ? { command: 'editor.action.triggerSuggest', title: '' } : undefined,
      };
    }
  }

  #normalizeFileNameCompletion(name: string): string {
    if (this.#configuration.preferredMdPathExtensionStyle === 'removeExtension') {
      if (looksLikeMarkdownFilePath(this.#configuration, name)) {
        const ext = extname(name);
        name = name.slice(0, -ext.length);
      }
    }
    return name;
  }

  #resolveReference(document: Document, ref: string): URI | undefined {
    const docUri = this.#getFileUriOfTextDocument(document);

    if (ref.startsWith('/')) {
      const workspaceFolder = getWorkspaceFolder(this.#workspace, docUri);
      if (workspaceFolder) {
        return Utils.joinPath(workspaceFolder, ref);
      } else {
        return this.#resolvePath(docUri, ref.slice(1));
      }
    }

    return this.#resolvePath(docUri, ref);
  }

  #resolvePath(root: URI, ref: string): URI | undefined {
    try {
      if (root.scheme === Schemes.file) {
        return URI.file(resolve(dirname(root.fsPath), ref));
      } else {
        return root.with({
          path: resolve(dirname(root.path), ref),
        });
      }
    } catch {
      return undefined;
    }
  }

  #getFileUriOfTextDocument(document: Document): URI {
    return this.#workspace.getContainingDocument?.(getDocUri(document))?.uri ?? getDocUri(document);
  }
}
