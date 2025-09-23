/*
 * folding.ts
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
import { Token, isDisplayMath, isRawBlock, getLine, Document, Parser } from 'quarto-core';

import { ILogger, LogLevel } from '../logging';
import { MdTableOfContentsProvider, isTocHeaderEntry } from '../toc';
import { isEmptyOrWhitespace } from '../util/string';

const rangeLimit = 5000;

interface RegionMarker {
  readonly line: number;
  readonly isStart: boolean;
}

export class MdFoldingProvider {

  readonly #parser: Parser;
  readonly #tocProvider: MdTableOfContentsProvider;
  readonly #logger: ILogger;

  constructor(
    parser: Parser,
    tocProvider: MdTableOfContentsProvider,
    logger: ILogger,
  ) {
    this.#parser = parser;
    this.#tocProvider = tocProvider;
    this.#logger = logger;
  }

  public async provideFoldingRanges(document: Document, token: CancellationToken): Promise<lsp.FoldingRange[]> {
    this.#logger.logDebug('MdFoldingProvider.provideFoldingRanges', { document: document.uri, version: document.version });

    if (token.isCancellationRequested) {
      return [];
    }

    const foldables = await Promise.all([
      this.#getRegions(document, token),
      this.#getBlockFoldingRanges(document, token),
      this.#getHeaderFoldingRanges(document, token),

    ]);
    const result = foldables.flat();
    return result.length > rangeLimit ? result.slice(0, rangeLimit) : result;
  }

  async #getRegions(document: Document, token: CancellationToken): Promise<lsp.FoldingRange[]> {
    const tokens = this.#parser(document);
    if (token.isCancellationRequested) {
      return [];
    }

    return Array.from(this.#getRegionsFromTokens(tokens));
  }

  *#getRegionsFromTokens(tokens: readonly Token[]): Iterable<lsp.FoldingRange> {
    const nestingStack: RegionMarker[] = [];
    for (const token of tokens) {
      const marker = asRegionMarker(token);
      if (marker) {
        if (marker.isStart) {
          nestingStack.push(marker);
        } else if (nestingStack.length && nestingStack[nestingStack.length - 1].isStart) {
          yield { startLine: nestingStack.pop()!.line, endLine: marker.line, kind: lsp.FoldingRangeKind.Region };
        } else {
          // noop: invalid nesting (i.e. [end, start] or [start, end, end])
        }
      }
    }
  }

  async #getHeaderFoldingRanges(document: Document, token: CancellationToken): Promise<lsp.FoldingRange[]> {
    const toc = await this.#tocProvider.getForDocument(document);
    if (token.isCancellationRequested) {
      return [];
    }

    return toc.entries.filter(entry => isTocHeaderEntry(entry)).map((entry): lsp.FoldingRange => {
      let endLine = entry.sectionLocation.range.end.line;
      if (isEmptyOrWhitespace(getLine(document, endLine)) && endLine >= entry.line + 1) {
        endLine = endLine - 1;
      }
      return { startLine: entry.line, endLine };
    });
  }

  async #getBlockFoldingRanges(document: Document, token: CancellationToken): Promise<lsp.FoldingRange[]> {
    const tokens = this.#parser(document);
    if (token.isCancellationRequested) {
      return [];
    }
    return Array.from(this.#getBlockFoldingRangesFromTokens(document, tokens));
  }

  *#getBlockFoldingRangesFromTokens(document: Document, tokens: readonly Token[]): Iterable<lsp.FoldingRange> {
    for (const token of tokens) {
      if (isFoldableToken(token)) {
        const startLine = token.range.start.line;
        let endLine = token.range.end.line;
        if (isEmptyOrWhitespace(getLine(document, endLine)) && endLine >= startLine + 1) {
          endLine = endLine - 1;
        }

        if (endLine > startLine) {
          yield { startLine, endLine, kind: this.#getFoldingRangeKind(token) };
        }
      }
    }
  }

  #getFoldingRangeKind(listItem: Token): lsp.FoldingRangeKind | undefined {
    const html = asHtmlBlock(listItem);
    return html && html.startsWith('!--') ? lsp.FoldingRangeKind.Comment : undefined;
  }
}

function isStartRegion(t: string) { return /^\s*<!--\s*#?region\b.*-->/.test(t); }
function isEndRegion(t: string) { return /^\s*<!--\s*#?endregion\b.*-->/.test(t); }

function asRegionMarker(token: Token): RegionMarker | undefined {
  const html = asHtmlBlock(token);
  if (html === undefined) {
    return undefined;
  }

  if (isStartRegion(html)) {
    return { line: token.range.start.line, isStart: true };
  }

  if (isEndRegion(html)) {
    return { line: token.range.start.line, isStart: false };
  }

  return undefined;
}

function asHtmlBlock(token: Token): string | undefined {
  if (!(isRawBlock(token))) {
    return undefined;
  }
  if (token.data.format !== "html") {
    return undefined;
  }
  return token.data.text;
}

function isFoldableToken(token: Token) {

  switch (token.type) {
    case 'FrontMatter':
    case 'CodeBlock':
    case 'Div':
    case 'BlockQuote':
    case 'Table':
    case 'OrderedList':
    case 'BulletList':
      return token.range.end.line > token.range.start.line;

    case 'Math':
      return isDisplayMath(token) && token.range.end.line > token.range.start.line;

    case 'RawBlock':
      if (asRegionMarker(token)) {
        return false;
      }
      return token.range.end.line > token.range.start.line + 1;

    default:
      return false;
  }
}
