/*
 * smart-select.ts
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
import { Position, Range } from 'vscode-languageserver-types';
import { coalesce } from 'core';
import { translatePosition, areRangesEqual, makeRange, modifyRange, rangeContains, Token, isList } from 'quarto-core';
import { ILogger } from '../logging';
import { MdTableOfContentsProvider, TocEntry, isTocHeaderEntry } from '../toc';
import { getLine, Document, Parser } from 'quarto-core';
import { isEmptyOrWhitespace } from '../util/string';

export class MdSelectionRangeProvider {

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

  public async provideSelectionRanges(document: Document, positions: readonly Position[], token: CancellationToken): Promise<lsp.SelectionRange[] | undefined> {
    this.#logger.logDebug('MdSelectionRangeProvider.provideSelectionRanges', { document: document.uri, version: document.version });

    if (token.isCancellationRequested) {
      return undefined;
    }

    return coalesce(await Promise.all(positions.map(position => this.#provideSelectionRange(document, position, token))));
  }

  async #provideSelectionRange(document: Document, position: Position, token: CancellationToken): Promise<lsp.SelectionRange | undefined> {
    const headerRange = await this.#getHeaderSelectionRange(document, position, token);
    if (token.isCancellationRequested) {
      return;
    }

    const blockRange = await this.#getBlockSelectionRange(document, position, headerRange, token);
    if (token.isCancellationRequested) {
      return;
    }

    const inlineRange = createInlineRange(document, position, blockRange);
    return inlineRange ?? blockRange ?? headerRange;
  }

  async #getBlockSelectionRange(document: Document, position: Position, parent: lsp.SelectionRange | undefined, token: CancellationToken): Promise<lsp.SelectionRange | undefined> {
    const tokens = this.#parser(document);
    if (token.isCancellationRequested) {
      return undefined;
    }

    const blockTokens = getBlockTokensForPosition(tokens, position, parent);
    if (blockTokens.length === 0) {
      return undefined;
    }

    let currentRange = parent ?? createBlockRange(blockTokens.shift()!, document, position.line, undefined);
    for (let i = 0; i < blockTokens.length; i++) {
      currentRange = createBlockRange(blockTokens[i], document, position.line, currentRange);
    }
    return currentRange;
  }

  async #getHeaderSelectionRange(document: Document, position: Position, token: CancellationToken): Promise<lsp.SelectionRange | undefined> {
    const toc = await this.#tocProvider.getForDocument(document);
    if (token.isCancellationRequested) {
      return undefined;
    }

    const headerInfo = getHeadersForPosition(toc.entries, position);
    const headers = headerInfo.headers;

    let currentRange: lsp.SelectionRange | undefined;
    for (let i = 0; i < headers.length; i++) {
      currentRange = createHeaderRange(headers[i], i === headers.length - 1, headerInfo.headerOnThisLine, currentRange, getFirstChildHeader(document, headers[i], toc.entries));
    }
    return currentRange;
  }
}

function getHeadersForPosition(toc: readonly TocEntry[], position: Position): { headers: TocEntry[]; headerOnThisLine: boolean } {
  const enclosingHeaders = toc.filter(header => isTocHeaderEntry(header) && header.sectionLocation.range.start.line <= position.line && header.sectionLocation.range.end.line >= position.line);
  const sortedHeaders = enclosingHeaders.sort((header1, header2) => (header1.line - position.line) - (header2.line - position.line));
  const onThisLine = toc.find(header => header.line === position.line) !== undefined;
  return {
    headers: sortedHeaders,
    headerOnThisLine: onThisLine
  };
}

function createHeaderRange(header: TocEntry, isClosestHeaderToPosition: boolean, onHeaderLine: boolean, parent?: lsp.SelectionRange, startOfChildRange?: Position): lsp.SelectionRange | undefined {
  const range = header.sectionLocation.range;
  const contentRange = makeRange(translatePosition(range.start, { lineDelta: 1 }), range.end);
  if (onHeaderLine && isClosestHeaderToPosition && startOfChildRange) {
    // selection was made on this header line, so select header and its content until the start of its first child
    // then all of its content
    return makeSelectionRange(modifyRange(range, undefined, startOfChildRange), makeSelectionRange(range, parent));
  } else if (onHeaderLine && isClosestHeaderToPosition) {
    // selection was made on this header line and no children so expand to all of its content
    return makeSelectionRange(range, parent);
  } else if (isClosestHeaderToPosition && startOfChildRange) {
    // selection was made within content and has child so select content
    // of this header then all content then header
    return makeSelectionRange(modifyRange(contentRange, undefined, startOfChildRange), makeSelectionRange(contentRange, (makeSelectionRange(range, parent))));
  } else {
    // not on this header line so select content then header
    return makeSelectionRange(contentRange, makeSelectionRange(range, parent));
  }
}

function getBlockTokensForPosition(tokens: readonly Token[], position: Position, parent: lsp.SelectionRange | undefined): Token[] {

  const enclosingTokens = tokens.filter(token => token.range.start.line <= position.line && token.range.end.line > position.line && (!parent || (token.range.start.line >= parent.range.start.line && token.range.end.line <= parent.range.end.line + 1)) && token.range.start.line !== token.range.end.line);
  if (enclosingTokens.length === 0) {
    return [];
  }
  const sortedTokens = enclosingTokens.sort((token1, token2) => (token2.range.end.line - token2.range.start.line) - (token1.range.end.line - token1.range.start.line));
  return sortedTokens;
}

function createBlockRange(block: Token, document: Document, cursorLine: number, parent: lsp.SelectionRange | undefined): lsp.SelectionRange {
  if (block.type === 'CodeBlock') {
    return createFencedRange(block, cursorLine, document, parent);
  }

  let startLine = isEmptyOrWhitespace(getLine(document, block.range.start.line)) ? block.range.start.line + 1 : block.range.start.line;
  let endLine = startLine === block.range.end.line ? block.range.end.line : block.range.end.line - 1;
  if (block.type === 'Para' && block.range.end.line - block.range.end.line === 2) {
    startLine = endLine = cursorLine;
  } else if (isList(block) && isEmptyOrWhitespace(getLine(document, endLine))) {
    endLine = endLine - 1;
  }
  const range = makeRange(startLine, 0, endLine, getLine(document, endLine).length);
  if (parent && rangeContains(parent.range, range) && !areRangesEqual(parent.range, range)) {
    return makeSelectionRange(range, parent);
  } else if (parent && areRangesEqual(parent.range, range)) {
    return parent;
  } else {
    return makeSelectionRange(range, undefined);
  }
}

function createInlineRange(document: Document, cursorPosition: Position, parent?: lsp.SelectionRange): lsp.SelectionRange | undefined {
  const lineText = getLine(document, cursorPosition.line);
  const boldSelection = createBoldRange(lineText, cursorPosition.character, cursorPosition.line, parent);
  const italicSelection = createOtherInlineRange(lineText, cursorPosition.character, cursorPosition.line, true, parent);
  let comboSelection: lsp.SelectionRange | undefined;
  if (boldSelection && italicSelection && !areRangesEqual(boldSelection.range, italicSelection.range)) {
    if (rangeContains(boldSelection.range, italicSelection.range)) {
      comboSelection = createOtherInlineRange(lineText, cursorPosition.character, cursorPosition.line, true, boldSelection);
    } else if (rangeContains(italicSelection.range, boldSelection.range)) {
      comboSelection = createBoldRange(lineText, cursorPosition.character, cursorPosition.line, italicSelection);
    }
  }
  const linkSelection = createLinkRange(lineText, cursorPosition.character, cursorPosition.line, comboSelection ?? boldSelection ?? italicSelection ?? parent);
  const inlineCodeBlockSelection = createOtherInlineRange(lineText, cursorPosition.character, cursorPosition.line, false, linkSelection ?? parent);
  return inlineCodeBlockSelection ?? linkSelection ?? comboSelection ?? boldSelection ?? italicSelection;
}

function createFencedRange(token: Token, cursorLine: number, document: Document, parent?: lsp.SelectionRange): lsp.SelectionRange {
  const startLine = token.range.start.line;
  const endLine = token.range.end.line - 1;
  const onFenceLine = cursorLine === startLine || cursorLine === endLine;
  const fenceRange = makeRange(startLine, 0, endLine, getLine(document, endLine).length);
  const contentRange = endLine - startLine > 2 && !onFenceLine ? makeRange(startLine + 1, 0, endLine - 1, getLine(document, endLine - 1).length) : undefined;
  if (contentRange) {
    return makeSelectionRange(contentRange, makeSelectionRange(fenceRange, parent));
  } else {
    if (parent && areRangesEqual(parent.range, fenceRange)) {
      return parent;
    } else {
      return makeSelectionRange(fenceRange, parent);
    }
  }
}

function createBoldRange(lineText: string, cursorChar: number, cursorLine: number, parent?: lsp.SelectionRange): lsp.SelectionRange | undefined {
  const regex = /\*\*([^*]+\*?[^*]+\*?[^*]+)\*\*/gim;
  const matches = [...lineText.matchAll(regex)].filter(match => lineText.indexOf(match[0]) <= cursorChar && lineText.indexOf(match[0]) + match[0].length >= cursorChar);
  if (matches.length) {
    // should only be one match, so select first and index 0 contains the entire match
    const bold = matches[0][0];
    const startIndex = lineText.indexOf(bold);
    const cursorOnStars = cursorChar === startIndex || cursorChar === startIndex + 1 || cursorChar === startIndex + bold.length || cursorChar === startIndex + bold.length - 1;
    const contentAndStars = makeSelectionRange(makeRange(cursorLine, startIndex, cursorLine, startIndex + bold.length), parent);
    const content = makeSelectionRange(makeRange(cursorLine, startIndex + 2, cursorLine, startIndex + bold.length - 2), contentAndStars);
    return cursorOnStars ? contentAndStars : content;
  }
  return undefined;
}

function createOtherInlineRange(lineText: string, cursorChar: number, cursorLine: number, isItalic: boolean, parent?: lsp.SelectionRange): lsp.SelectionRange | undefined {
  const italicRegexes = [/(?:[^*]+)(\*([^*]+)(?:\*\*[^*]*\*\*)*([^*]+)\*)(?:[^*]+)/g, /^(?:[^*]*)(\*([^*]+)(?:\*\*[^*]*\*\*)*([^*]+)\*)(?:[^*]*)$/g];
  let matches = [];
  if (isItalic) {
    matches = [...lineText.matchAll(italicRegexes[0])].filter(match => lineText.indexOf(match[0]) <= cursorChar && lineText.indexOf(match[0]) + match[0].length >= cursorChar);
    if (!matches.length) {
      matches = [...lineText.matchAll(italicRegexes[1])].filter(match => lineText.indexOf(match[0]) <= cursorChar && lineText.indexOf(match[0]) + match[0].length >= cursorChar);
    }
  } else {
    matches = [...lineText.matchAll(/`[^`]*`/g)].filter(match => lineText.indexOf(match[0]) <= cursorChar && lineText.indexOf(match[0]) + match[0].length >= cursorChar);
  }
  if (matches.length) {
    // should only be one match, so select first and select group 1 for italics because that contains just the italic section
    // doesn't include the leading and trailing characters which are guaranteed to not be * so as not to be confused with bold
    const match = isItalic ? matches[0][1] : matches[0][0];
    const startIndex = lineText.indexOf(match);
    const cursorOnType = cursorChar === startIndex || cursorChar === startIndex + match.length;
    const contentAndType = makeSelectionRange(makeRange(cursorLine, startIndex, cursorLine, startIndex + match.length), parent);
    const content = makeSelectionRange(makeRange(cursorLine, startIndex + 1, cursorLine, startIndex + match.length - 1), contentAndType);
    return cursorOnType ? contentAndType : content;
  }
  return undefined;
}

function createLinkRange(lineText: string, cursorChar: number, cursorLine: number, parent?: lsp.SelectionRange): lsp.SelectionRange | undefined {
  const regex = /(\[[^()]*\])(\([^[\]]*\))/g;
  const matches = [...lineText.matchAll(regex)].filter(match => lineText.indexOf(match[0]) <= cursorChar && lineText.indexOf(match[0]) + match[0].length > cursorChar);

  if (matches.length) {
    // should only be one match, so select first and index 0 contains the entire match, so match = [text](url)
    const link = matches[0][0];
    const linkRange = makeSelectionRange(makeRange(cursorLine, lineText.indexOf(link), cursorLine, lineText.indexOf(link) + link.length), parent);

    const linkText = matches[0][1];
    const url = matches[0][2];

    // determine if cursor is within [text] or (url) in order to know which should be selected
    const nearestType = cursorChar >= lineText.indexOf(linkText) && cursorChar < lineText.indexOf(linkText) + linkText.length ? linkText : url;

    const indexOfType = lineText.indexOf(nearestType);
    // determine if cursor is on a bracket or paren and if so, return the [content] or (content), skipping over the content range
    const cursorOnType = cursorChar === indexOfType || cursorChar === indexOfType + nearestType.length;

    const contentAndNearestType = makeSelectionRange(makeRange(cursorLine, indexOfType, cursorLine, indexOfType + nearestType.length), linkRange);
    const content = makeSelectionRange(makeRange(cursorLine, indexOfType + 1, cursorLine, indexOfType + nearestType.length - 1), contentAndNearestType);
    return cursorOnType ? contentAndNearestType : content;
  }
  return undefined;
}



function getFirstChildHeader(document: Document, header?: TocEntry, toc?: readonly TocEntry[]): Position | undefined {
  let childRange: Position | undefined;
  if (header && toc) {
    const children = toc.filter(t => rangeContains(header.sectionLocation.range, t.sectionLocation.range) && t.sectionLocation.range.start.line > header.sectionLocation.range.start.line).sort((t1, t2) => t1.line - t2.line);
    if (children.length > 0) {
      childRange = children[0].sectionLocation.range.start;
      const lineText = getLine(document, childRange.line - 1);
      return childRange ? translatePosition(childRange, { lineDelta: -1, characterDelta: lineText.length }) : undefined;
    }
  }
  return undefined;
}

function makeSelectionRange(range: Range, parent: lsp.SelectionRange | undefined): lsp.SelectionRange {
  return { range, parent };
}
