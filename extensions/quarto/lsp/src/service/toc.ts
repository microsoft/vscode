/*
 * toc.ts
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
import {
  Token,
  isCallout,
  isProof,
  isTheorem,
  makeRange,
  parseFrontMatterStr,
  isExecutableLanguageBlock,
  isWithinRange,
  isTabset,
  isFrontMatter,
  isHeader,
  isCodeBlock,
  getDocUri,
  getLine,
  Document,
  Parser,

} from 'quarto-core';

import { ILogger, LogLevel } from './logging';
import { pandocSlugifier, ISlugifier, Slug } from './slugify';

import { IWorkspace } from './workspace';
import { MdDocumentInfoCache } from './workspace-cache';

export enum TocEntryType { Title, Header, CodeCell };

export interface TocEntry {
  readonly type: TocEntryType;
  readonly slug: Slug;
  readonly text: string;
  readonly level: number;
  readonly line: number;

  /**
   * The entire range of the entry.
   *
  * For the doc:
   *
   * ```md
   * # Head #
   * text
   * # Next head #
   * ```
   *
   * This is the range from `# Head #` to `# Next head #`
   */
  readonly sectionLocation: lsp.Location;
}

export interface TocHeaderEntry extends TocEntry {
  /**
   * The range of the header declaration.
   *
   * For the doc:
   *
   * ```md
   * # Head #
   * text
   * ```
   *
   * This is the range of `# Head #`
   */
  readonly headerLocation: lsp.Location;

  /**
   * The range of the header text.
   *
   * For the doc:
   *
   * ```md
   * # Head #
   * text
   * ```
   *
   * This is the range of `Head`
   */
  readonly headerTextLocation: lsp.Location;
}

export function isTocHeaderEntry(entry?: TocEntry): entry is TocHeaderEntry {
  return entry !== undefined &&
    'headerLocation' in entry &&
    'headerTextLocation' in entry;
}

export class TableOfContents {

  public static async create(parser: Parser, document: Document, token: CancellationToken): Promise<TableOfContents> {
    const entries = await this.#buildPandocToc(parser, document, token);
    return new TableOfContents(entries, pandocSlugifier);
  }

  public static async createForContainingDoc(parser: Parser, workspace: IWorkspace, document: Document, token: CancellationToken): Promise<TableOfContents> {
    const context = workspace.getContainingDocument?.(getDocUri(document));
    if (context) {
      const entries = (await Promise.all(Array.from(context.children, async cell => {
        const doc = await workspace.openMarkdownDocument(cell.uri);
        if (!doc || token.isCancellationRequested) {
          return [];
        }
        return this.#buildPandocToc(parser, doc, token);
      }))).flat();
      return new TableOfContents(entries, pandocSlugifier);
    }

    return this.create(parser, document, token);
  }

  static async #buildPandocToc(parser: Parser, document: Document, token: CancellationToken): Promise<TocEntry[]> {

    const docUri = getDocUri(document);

    const toc: TocEntry[] = [];
    const tokens = parser(document);
    if (token.isCancellationRequested) {
      return [];
    }

    // compute restricted ranges (ignore headings in these ranges)
    const isWithinIgnoredRange = isWithinRange(tokens, token => isCallout(token) || isTheorem(token) || isProof(token));
    const isWithinTabset = isWithinRange(tokens, isTabset);

    const existingSlugEntries = new Map<string, { count: number }>();

    const toSlug = (text: string) => {
      let slug = pandocSlugifier.fromHeading(text);
      const existingSlugEntry = existingSlugEntries.get(slug.value);
      if (existingSlugEntry) {
        ++existingSlugEntry.count;
        slug = pandocSlugifier.fromHeading(slug.value + '-' + existingSlugEntry.count);
      } else {
        existingSlugEntries.set(slug.value, { count: 0 });
      }
      return slug;
    }

    const asLocation = (range: lsp.Range): lsp.Location => {
      return {
        uri: docUri.toString(),
        range
      }
    }

    const maxHeadingLevel = tokens.reduce((max: number, token: Token) => {
      return (isHeader(token) && token.data.level < max) ? token.data.level : max;
    }, 2);

    let lastLevel = 2;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (isFrontMatter(token)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const meta = parseFrontMatterStr(token.data) as any;
        if (typeof (meta) === "object" && typeof (meta.title) === "string") {
          toc.push({
            type: TocEntryType.Title,
            slug: toSlug(meta.title),
            text: meta.title,
            level: maxHeadingLevel,
            line: token.range.start.line,
            sectionLocation: asLocation(token.range),
          })
        }
      } else if (isHeader(token) && !isWithinIgnoredRange(token)) {

        // type
        const type = TocEntryType.Header;

        // text
        const text = token.data.text;

        // slug
        const slug = toSlug(text);

        // line
        const line = token.range.start.line;

        // level
        const level = isWithinTabset(token) ? lastLevel + 1 : token.data.level;
        lastLevel = token.data.level + 1;

        // sectionLocation
        const sectionStart = token.range.start;
        const containingDivElement = tokens.slice(0, i).reverse().find(el => el.type === "Div" && el.range.end.line > sectionStart.line);
        const nextPeerElement = tokens.slice(i + 1).find(el => !isWithinTabset(el) && isHeader(el) && (el.data.level <= level));
        const sectionEndLine = (nextPeerElement && containingDivElement)
          ? Math.min(nextPeerElement.range.start.line - 1, containingDivElement.range.end.line - 2)
          : nextPeerElement
            ? nextPeerElement.range.start.line - 1
            : containingDivElement
              ? containingDivElement.range.end.line - 2
              : (document.lineCount - 1);
        const sectionEndCharacter = getLine(document, sectionEndLine).length;
        const sectionLocation = makeRange(sectionStart, lsp.Position.create(sectionEndLine, sectionEndCharacter));

        // headerLocation
        const headerLocation = token.range;

        // headerTextLocation
        let headerTextLocation = token.range;
        const headerLine = getLine(document, line);
        const headerTextMatch = headerLine.match(/(^#*\s+)([^{]+)/);
        if (headerTextMatch) {
          headerTextLocation = makeRange(
            lsp.Position.create(token.range.start.line, headerTextMatch[1].length),
            lsp.Position.create(token.range.start.line, headerTextMatch[0].length))
        }

        const tocEntry: TocHeaderEntry = {
          type,
          slug,
          text,
          level,
          line,
          sectionLocation: asLocation(sectionLocation),
          headerLocation: asLocation(headerLocation),
          headerTextLocation: asLocation(headerTextLocation)
        }

        toc.push(tocEntry);

      } else if (isCodeBlock(token) && isExecutableLanguageBlock(token)) {
        const match = (token.data).match(/(?:#|\/\/|)\| label:\s+(.+)/);
        const text = match ? match[1] : `(code cell)`
        toc.push({
          type: TocEntryType.CodeCell,
          slug: toSlug(text),
          text: text,
          level: lastLevel,
          line: token.range.start.line,
          sectionLocation: asLocation(token.range),
        })
      }
    }

    return toc;
  }


  public static readonly empty = new TableOfContents([], pandocSlugifier);

  readonly #slugifier: ISlugifier;

  private constructor(
    public readonly entries: readonly TocEntry[],
    slugifier: ISlugifier,
  ) {
    this.#slugifier = slugifier;
  }

  public lookup(fragment: string): TocEntry | undefined {
    const slug = this.#slugifier.fromHeading(fragment);
    return this.entries.find(entry => entry.slug.equals(slug));
  }
}


export class MdTableOfContentsProvider extends Disposable {

  readonly #cache: MdDocumentInfoCache<TableOfContents>;

  readonly #parser: Parser;
  readonly #workspace: IWorkspace;
  readonly #logger: ILogger;

  constructor(
    parser: Parser,
    workspace: IWorkspace,
    logger: ILogger,
  ) {
    super();

    this.#parser = parser;
    this.#workspace = workspace;
    this.#logger = logger;

    this.#cache = this._register(new MdDocumentInfoCache<TableOfContents>(workspace, (doc, token) => {
      this.#logger.logDebug('TableOfContentsProvider.create', { document: doc.uri, version: doc.version });
      return TableOfContents.create(parser, doc, token);
    }));
  }

  public async get(resource: URI): Promise<TableOfContents> {
    return await this.#cache.get(resource) ?? TableOfContents.empty;
  }

  public getForDocument(doc: Document): Promise<TableOfContents> {
    return this.#cache.getForDocument(doc);
  }

  public getForContainingDoc(doc: Document, token: CancellationToken): Promise<TableOfContents> {
    return TableOfContents.createForContainingDoc(this.#parser, this.#workspace, doc, token);
  }
}
