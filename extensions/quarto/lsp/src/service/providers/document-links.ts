/*
 * document-links.ts
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
import { HTMLElement, parse } from 'node-html-parser';
import type { CancellationToken } from 'vscode-languageserver';
import * as lsp from 'vscode-languageserver-types';
import { URI, Utils } from 'vscode-uri';

import { Disposable, coalesce, tryDecodeUri } from 'core';

import { translatePosition, makeRange, rangeContains, Token, isDisplayMath, TokenType, Document, getDocUri, getLine, Parser } from 'quarto-core';

import { LsConfiguration } from '../config';
import { ILogger } from '../logging';
import { MdTableOfContentsProvider, isTocHeaderEntry } from '../toc';
import { r } from '../util/string';
import { IWorkspace, getWorkspaceFolder, tryAppendMarkdownFileExtension } from '../workspace';
import { MdDocumentInfoCache, MdWorkspaceInfoCache } from '../workspace-cache';

export enum HrefKind {
  External,
  Internal,
  Reference,
}

export interface ExternalHref {
  readonly kind: HrefKind.External;
  readonly uri: URI;
}

export interface InternalHref {
  readonly kind: HrefKind.Internal;
  readonly path: URI;
  readonly fragment: string;
}

export interface ReferenceHref {
  readonly kind: HrefKind.Reference;
  readonly ref: string;
}

export type LinkHref = ExternalHref | InternalHref | ReferenceHref;

export function resolveInternalDocumentLink(
  sourceDocUri: URI,
  linkText: string,
  workspace: IWorkspace,
): { resource: URI; linkFragment: string } | undefined {
  // Assume it must be an relative or absolute file path
  // Use a fake scheme to avoid parse warnings
  const tempUri = URI.parse(`vscode-resource:${linkText}`);

  const docUri = workspace.getContainingDocument?.(sourceDocUri)?.uri ?? sourceDocUri;

  let resourceUri: URI | undefined;
  if (!tempUri.path) {
    // Looks like a fragment only link
    if (typeof tempUri.fragment !== 'string') {
      return undefined;
    }

    resourceUri = sourceDocUri;
  } else if (tempUri.path[0] === '/') {
    const root = getWorkspaceFolder(workspace, docUri);
    if (root) {
      resourceUri = Utils.joinPath(root, tempUri.path);
    }
  } else {
    if (docUri.scheme === 'untitled') {
      const root = getWorkspaceFolder(workspace, docUri);
      if (root) {
        resourceUri = Utils.joinPath(root, tempUri.path);
      }
    } else {
      const base = Utils.dirname(docUri);
      resourceUri = Utils.joinPath(base, tempUri.path);
    }
  }

  if (!resourceUri) {
    return undefined;
  }

  return {
    resource: resourceUri,
    linkFragment: tempUri.fragment,
  };
}

export interface MdLinkSource {
  /**
   * The full range of the link.
   */
  readonly range: lsp.Range;

  /**
   * The file where the link is defined.
   */
  readonly resource: URI;

  /**
   * The range of the entire link target.
   *
   * This includes the opening `(`/`[` and closing `)`/`]`.
   *
   * For `[boris](/cat.md#siberian "title")` this would be the range of `(/cat.md#siberian "title")`
   */
  readonly targetRange: lsp.Range;

  /**
   * The original text of the link destination in code.
   *
   * For `[boris](/cat.md#siberian "title")` this would be `/cat.md#siberian`
   *
   */
  readonly hrefText: string;

  /**
   * The original text of just the link's path in code.
   *
   * For `[boris](/cat.md#siberian "title")` this would be `/cat.md`
   */
  readonly pathText: string;

  /**
   * The range of the path in this link.
   *
   * Does not include whitespace or the link title.
   *
   * For `[boris](/cat.md#siberian "title")` this would be the range of `/cat.md#siberian`
   */
  readonly hrefRange: lsp.Range;

  /**
   * The range of the fragment within the path.
   *
   * For `[boris](/cat.md#siberian "title")` this would be the range of `#siberian`
   */
  readonly fragmentRange: lsp.Range | undefined;
}

export enum MdLinkKind {
  Link = 1,
  Definition = 2,
}

export interface MdInlineLink<HrefType = LinkHref> {
  readonly kind: MdLinkKind.Link;
  readonly source: MdLinkSource;
  readonly href: HrefType;
}

export interface MdLinkDefinition {
  readonly kind: MdLinkKind.Definition;
  readonly source: MdLinkSource;
  readonly ref: {
    readonly range: lsp.Range;
    readonly text: string;
  };
  readonly href: ExternalHref | InternalHref;
}

export type MdLink = MdInlineLink | MdLinkDefinition;

function createHref(
  sourceDocUri: URI,
  link: string,
  workspace: IWorkspace,
): ExternalHref | InternalHref | undefined {
  if (/^[a-z-][a-z-]+:/i.test(link)) {
    // Looks like a uri
    return { kind: HrefKind.External, uri: URI.parse(tryDecodeUri(link)) };
  }

  const resolved = resolveInternalDocumentLink(sourceDocUri, link, workspace);
  if (!resolved) {
    return undefined;
  }

  return {
    kind: HrefKind.Internal,
    path: resolved.resource,
    fragment: resolved.linkFragment,
  };
}

function createMdLink(
  document: Document,
  targetText: string,
  preHrefText: string,
  rawLink: string,
  matchIndex: number,
  fullMatch: string,
  workspace: IWorkspace,
): MdLink | undefined {
  const isAngleBracketLink = rawLink.startsWith('<');
  const link = stripAngleBrackets(rawLink);

  let linkTarget: ExternalHref | InternalHref | undefined;
  try {
    linkTarget = createHref(getDocUri(document), link, workspace);
  } catch {
    return undefined;
  }
  if (!linkTarget) {
    return undefined;
  }

  const pre = targetText + preHrefText;
  const linkStart = document.positionAt(matchIndex);
  const linkEnd = translatePosition(linkStart, { characterDelta: fullMatch.length });

  const targetStart = translatePosition(linkStart, { characterDelta: targetText.length });
  const targetRange: lsp.Range = { start: targetStart, end: linkEnd };

  const hrefStart = translatePosition(linkStart, { characterDelta: pre.length + (isAngleBracketLink ? 1 : 0) });
  const hrefEnd = translatePosition(hrefStart, { characterDelta: link.length });
  const hrefRange: lsp.Range = { start: hrefStart, end: hrefEnd };

  return {
    kind: MdLinkKind.Link,
    href: linkTarget,
    source: {
      hrefText: link,
      resource: getDocUri(document),
      range: { start: linkStart, end: linkEnd },
      targetRange,
      hrefRange,
      ...getLinkSourceFragmentInfo(document, link, hrefStart, hrefEnd),
    }
  };
}

function getFragmentRange(text: string, start: lsp.Position, end: lsp.Position): lsp.Range | undefined {
  const index = text.indexOf('#');
  if (index < 0) {
    return undefined;
  }
  return { start: translatePosition(start, { characterDelta: index + 1 }), end };
}

function getLinkSourceFragmentInfo(document: Document, link: string, linkStart: lsp.Position, linkEnd: lsp.Position): { fragmentRange: lsp.Range | undefined; pathText: string } {
  const fragmentRange = getFragmentRange(link, linkStart, linkEnd);
  return {
    pathText: document.getText({ start: linkStart, end: fragmentRange ? translatePosition(fragmentRange.start, { characterDelta: -1 }) : linkEnd }),
    fragmentRange,
  };
}

const angleBracketLinkRe = /^<(.*)>$/;

/**
 * Used to strip brackets from the markdown link
 *
 * <http://example.com> will be transformed to http://example.com
*/
function stripAngleBrackets(link: string) {
  return link.replace(angleBracketLinkRe, '$1');
}

/**
 * Matches `[text](link)` or `[text](<link>)`
 */
const linkPattern = new RegExp(
  // text
  r`(!?\[` + // open prefix match -->
	/**/r`(?:` +
	/*****/r`[^\[\]\\]|` + // Non-bracket chars, or...
	/*****/r`\\.|` + // Escaped char, or...
	/*****/r`\[[^\[\]]*\]` + // Matched bracket pair
	/**/r`)*` +
  r`\])` + // <-- close prefix match

  // Destination
  r`(\(\s*)` + // Pre href
	/**/r`(` +
	/*****/r`[^\s\(\)\<](?:[^\s\(\)]|\([^\s\(\)]*?\))*|` + // Link without whitespace, or...
	/*****/r`<[^<>]+>` + // In angle brackets
	/**/r`)` +

	// Title
	/**/r`\s*(?:"[^"]*"|'[^']*'|\([^\(\)]*\))?\s*` +
  r`\)`,
  'g');

/**
* Matches `[text][ref]` or `[shorthand]` or `[shorthand][]`
*/
const referenceLinkPattern = new RegExp(
  r`(^|[^\]\\])` + // Must not start with another bracket (workaround for lack of support for negative look behinds)
  r`(?:` +
	/**/r`(?:` +
	/****/r`(` + // Start link prefix
	/******/r`!?` + // Optional image ref
	/******/r`\[((?:` +// Link text
	/********/r`\\\]|` + // escaped bracket, or...
	/********/r`[^\[\]]|` + //non bracket char, or...
	/********/r`\[[^\[\]]*\]` + // matched bracket pair
	/******/`+)*)]` + // end link  text
	/******/r`\[\s*?` + // Start of link def
	/****/r`)` + // end link prefix
	/****/r`(` +
	/******/r`[^\]]*?)\]` + //link def
	/******/r`|` +
	/******/r`\[\s*?([^\\\]]*?)\s*\])(?![\(])` +
  r`)`,
  'gm');

/**
 * Matches `<http://example.com>`
 */
const autoLinkPattern = /<(\w+:[^>\s]+)>/g;

/**
 * Matches `[text]: link`
 */
const definitionPattern = /^([\t ]*\[(?!\^)((?:\\\]|[^\]])+)\]:\s*)([^<]\S*|<[^>]+>)/gm;

const inlineCodePattern = /(^|[^`])(`+)((?:.+?|.*?(?:(?:\r?\n).+?)*?)(?:\r?\n)?\2)(?:$|[^`])/gm;

class NoLinkRanges {
  public static compute(tokens: readonly Token[], document: Document): NoLinkRanges {
    const multiline = tokens
      .filter(t => (t.type === 'CodeBlock' || t.type === 'RawBlock' || isDisplayMath(t)))
      .map(t => ({ type: t.type, range: [t.range.start.line, t.range.end.line] as [number, number] }));

    const inlineRanges = new Map</* line number */ number, lsp.Range[]>();
    const text = document.getText();
    for (const match of text.matchAll(inlineCodePattern)) {
      const startOffset = (match.index ?? 0) + match[1].length;
      const startPosition = document.positionAt(startOffset);

      const range: lsp.Range = { start: startPosition, end: document.positionAt(startOffset + match[3].length) };
      for (let line = range.start.line; line <= range.end.line; ++line) {
        let entry = inlineRanges.get(line);
        if (!entry) {
          entry = [];
          inlineRanges.set(line, entry);
        }
        entry.push(range);
      }
    }

    return new NoLinkRanges(multiline, inlineRanges);
  }

  private constructor(
    /**
     * Block element ranges, such as code blocks. Represented by [line_start, line_end).
     */
    public readonly multiline: ReadonlyArray<{ type: TokenType, range: [number, number] }>,

    /**
     * Inline code spans where links should not be detected
     */
    public readonly inline: ReadonlyMap</* line number */ number, lsp.Range[]>
  ) { }

  contains(position: lsp.Position, excludeType = ''): boolean {
    return this.multiline.some(({ type, range }) => type !== excludeType && position.line >= range[0] && position.line < range[1]) ||
      !!this.inline.get(position.line)?.some(inlineRange => rangeContains(inlineRange, position));
  }

  concatInline(inlineRanges: Iterable<lsp.Range>): NoLinkRanges {
    const newInline = new Map(this.inline);
    for (const range of inlineRanges) {
      for (let line = range.start.line; line <= range.end.line; ++line) {
        let entry = newInline.get(line);
        if (!entry) {
          entry = [];
          newInline.set(line, entry);
        }
        entry.push(range);
      }
    }
    return new NoLinkRanges(this.multiline, newInline);
  }
}

/**
 * The place a document link links to.
 */
export type ResolvedDocumentLinkTarget =
  | { readonly kind: 'file'; readonly uri: URI; position?: lsp.Position; fragment?: string }
  | { readonly kind: 'folder'; readonly uri: URI }
  | { readonly kind: 'external'; readonly uri: URI };

/**
 * Stateless object that extracts link information from markdown files.
 */
export class MdLinkComputer {

  readonly #parser: Parser;
  readonly #workspace: IWorkspace;

  constructor(
    parser: Parser,
    workspace: IWorkspace,
  ) {
    this.#parser = parser;
    this.#workspace = workspace;
  }

  public async getAllLinks(document: Document, token: CancellationToken): Promise<MdLink[]> {
    const tokens = this.#parser(document);
    if (token.isCancellationRequested) {
      return [];
    }

    const noLinkRanges = NoLinkRanges.compute(tokens, document);

    const inlineLinks = Array.from(this.#getInlineLinks(document, noLinkRanges));
    return [
      ...inlineLinks,
      ...this.#getReferenceLinks(document, noLinkRanges.concatInline(inlineLinks.map(x => x.source.range))),
      ...this.#getLinkDefinitions(document, noLinkRanges),
      ...this.#getAutoLinks(document, noLinkRanges),
      ...this.#getHtmlLinks(document, noLinkRanges),
    ];
  }

  *#getInlineLinks(document: Document, noLinkRanges: NoLinkRanges): Iterable<MdLink> {
    const text = document.getText();
    for (const match of text.matchAll(linkPattern)) {
      const linkTextIncludingBrackets = match[1];
      const matchLinkData = createMdLink(document, linkTextIncludingBrackets, match[2], match[3], match.index ?? 0, match[0], this.#workspace);
      if (matchLinkData && !noLinkRanges.contains(matchLinkData.source.hrefRange.start)) {
        yield matchLinkData;

        // Also check for images in link text
        if (/![[(]/.test(linkTextIncludingBrackets)) {
          const linkText = linkTextIncludingBrackets.slice(1, -1);
          const startOffset = (match.index ?? 0) + 1;
          for (const innerMatch of linkText.matchAll(linkPattern)) {
            const innerData = createMdLink(document, innerMatch[1], innerMatch[2], innerMatch[3], startOffset + (innerMatch.index ?? 0), innerMatch[0], this.#workspace);
            if (innerData) {
              yield innerData;
            }
          }

          yield* this.#getReferenceLinksInText(document, linkText, startOffset, noLinkRanges);
        }
      }
    }
  }

  *#getAutoLinks(document: Document, noLinkRanges: NoLinkRanges): Iterable<MdLink> {
    const text = document.getText();
    const docUri = getDocUri(document);
    for (const match of text.matchAll(autoLinkPattern)) {
      const linkOffset = (match.index ?? 0);
      const linkStart = document.positionAt(linkOffset);
      if (noLinkRanges.contains(linkStart)) {
        continue;
      }

      const link = match[1];
      const linkTarget = createHref(docUri, link, this.#workspace);
      if (!linkTarget) {
        continue;
      }

      const linkEnd = translatePosition(linkStart, { characterDelta: match[0].length });
      const hrefStart = translatePosition(linkStart, { characterDelta: 1 });
      const hrefEnd = translatePosition(hrefStart, { characterDelta: link.length });
      const hrefRange = { start: hrefStart, end: hrefEnd };
      yield {
        kind: MdLinkKind.Link,
        href: linkTarget,
        source: {
          hrefText: link,
          resource: docUri,
          targetRange: hrefRange,
          hrefRange: hrefRange,
          range: { start: linkStart, end: linkEnd },
          ...getLinkSourceFragmentInfo(document, link, hrefStart, hrefEnd),
        }
      };
    }
  }

  #getReferenceLinks(document: Document, noLinkRanges: NoLinkRanges): Iterable<MdLink> {
    const text = document.getText();
    return this.#getReferenceLinksInText(document, text, 0, noLinkRanges);
  }

  *#getReferenceLinksInText(document: Document, text: string, startingOffset: number, noLinkRanges: NoLinkRanges): Iterable<MdLink> {
    for (const match of text.matchAll(referenceLinkPattern)) {
      const linkStartOffset = startingOffset + (match.index ?? 0) + match[1].length;
      const linkStart = document.positionAt(linkStartOffset);
      if (noLinkRanges.contains(linkStart)) {
        continue;
      }

      let hrefStart: lsp.Position;
      let hrefEnd: lsp.Position;
      let reference = match[4];
      if (reference === '') { // [ref][],
        reference = match[3];
        if (!reference) {
          continue;
        }
        const offset = linkStartOffset + 1;
        hrefStart = document.positionAt(offset);
        hrefEnd = document.positionAt(offset + reference.length);
      } else if (reference) { // [text][ref]
        const text = match[3];
        if (!text) {
          // Handle the case ![][cat]
          if (!match[0].startsWith('!')) {
            // Empty links are not valid
            continue;
          }
        }
        if (!match[0].startsWith('!')) {
          // Also get links in text
          yield* this.#getReferenceLinksInText(document, match[3], linkStartOffset + 1, noLinkRanges);
        }

        const pre = match[2];
        const offset = linkStartOffset + pre.length;
        hrefStart = document.positionAt(offset);
        hrefEnd = document.positionAt(offset + reference.length);
      } else if (match[5]) { // [ref]
        reference = match[5];
        const offset = linkStartOffset + 1;
        hrefStart = document.positionAt(offset);
        const line = getLine(document, hrefStart.line);

        // See if link looks like link definition
        if (linkStart.character === 0 && line[match[0].length - match[1].length] === ':') {
          continue;
        }

        // See if link looks like a checkbox
        const checkboxMatch = line.match(/^\s*[-*]\s*\[x\]/i);
        if (checkboxMatch && hrefStart.character <= checkboxMatch[0].length) {
          continue;
        }

        hrefEnd = document.positionAt(offset + reference.length);
      } else {
        continue;
      }

      const linkEnd = translatePosition(linkStart, { characterDelta: match[0].length - match[1].length });
      const hrefRange = { start: hrefStart, end: hrefEnd };
      yield {
        kind: MdLinkKind.Link,
        source: {
          hrefText: reference,
          pathText: reference,
          resource: getDocUri(document),
          range: { start: linkStart, end: linkEnd },
          targetRange: hrefRange,
          hrefRange: hrefRange,
          fragmentRange: undefined,
        },
        href: {
          kind: HrefKind.Reference,
          ref: reference,
        }
      };
    }
  }

  *#getLinkDefinitions(document: Document, noLinkRanges: NoLinkRanges): Iterable<MdLinkDefinition> {
    const text = document.getText();
    const docUri = getDocUri(document);
    for (const match of text.matchAll(definitionPattern)) {
      const offset = (match.index ?? 0);
      const linkStart = document.positionAt(offset);
      if (noLinkRanges.contains(linkStart)) {
        continue;
      }

      const pre = match[1];
      const reference = match[2];
      const rawLinkText = match[3].trim();
      const isAngleBracketLink = angleBracketLinkRe.test(rawLinkText);
      const linkText = stripAngleBrackets(rawLinkText);

      const target = createHref(docUri, linkText, this.#workspace);
      if (!target) {
        continue;
      }

      const hrefStart = translatePosition(linkStart, { characterDelta: pre.length + (isAngleBracketLink ? 1 : 0) });
      const hrefEnd = translatePosition(hrefStart, { characterDelta: linkText.length });
      const hrefRange = { start: hrefStart, end: hrefEnd };

      const refStart = translatePosition(linkStart, { characterDelta: 1 });
      const refRange: lsp.Range = { start: refStart, end: translatePosition(refStart, { characterDelta: reference.length }) };
      const line = getLine(document, linkStart.line);
      const linkEnd = translatePosition(linkStart, { characterDelta: line.length });
      yield {
        kind: MdLinkKind.Definition,
        source: {
          hrefText: linkText,
          resource: docUri,
          range: { start: linkStart, end: linkEnd },
          targetRange: hrefRange,
          hrefRange,
          ...getLinkSourceFragmentInfo(document, rawLinkText, hrefStart, hrefEnd),
        },
        ref: { text: reference, range: refRange },
        href: target,
      };
    }
  }

  #getHtmlLinks(document: Document, noLinkRanges: NoLinkRanges): Iterable<MdLink> {
    const text = document.getText();
    if (!/<\w/.test(text)) { // Only parse if there may be html
      return [];
    }

    try {
      const tree = parse(text);
      return this.#getHtmlLinksFromNode(document, tree, noLinkRanges);
    } catch {
      return [];
    }
  }

  static #toAttrEntry(attr: string) {
    return { attr, regexp: new RegExp(`(${attr}=["'])([^'"]*)["']`, 'i') };
  }

  static readonly #linkAttrsByTag = new Map([
    ['IMG', ['src'].map(this.#toAttrEntry)],
    ['VIDEO', ['src', 'placeholder'].map(this.#toAttrEntry)],
    ['SOURCE', ['src'].map(this.#toAttrEntry)],
    ['A', ['href'].map(this.#toAttrEntry)],
  ]);

  *#getHtmlLinksFromNode(document: Document, node: HTMLElement, noLinkRanges: NoLinkRanges): Iterable<MdLink> {
    const attrs = MdLinkComputer.#linkAttrsByTag.get(node.tagName);
    if (attrs) {
      for (const attr of attrs) {
        const link = node.attributes[attr.attr];
        if (!link) {
          continue;
        }

        const attrMatch = node.outerHTML.match(attr.regexp);
        if (!attrMatch) {
          continue;
        }

        const docUri = getDocUri(document);
        const linkTarget = createHref(docUri, link, this.#workspace);
        if (!linkTarget) {
          continue;
        }

        const linkStart = document.positionAt(node.range[0] + attrMatch.index! + attrMatch[1].length);
        if (noLinkRanges.contains(linkStart, 'html_block')) {
          continue;
        }

        const linkEnd = translatePosition(linkStart, { characterDelta: attrMatch[2].length });
        const hrefRange = { start: linkStart, end: linkEnd };
        yield {
          kind: MdLinkKind.Link,
          href: linkTarget,
          source: {
            hrefText: link,
            resource: docUri,
            targetRange: hrefRange,
            hrefRange: hrefRange,
            range: { start: linkStart, end: linkEnd },
            ...getLinkSourceFragmentInfo(document, link, linkStart, linkEnd),
          }
        };
      }
    }

    for (const child of node.childNodes) {
      if (child instanceof HTMLElement) {
        yield* this.#getHtmlLinksFromNode(document, child, noLinkRanges);
      }
    }
  }
}

export interface MdDocumentLinksInfo {
  readonly links: readonly MdLink[];
  readonly definitions: LinkDefinitionSet;
}

export class ReferenceLinkMap<T> {
  readonly #map = new Map</* normalized ref */ string, T>();

  public set(ref: string, link: T) {
    this.#map.set(this.#normalizeRefName(ref), link);
  }

  public lookup(ref: string): T | undefined {
    return this.#map.get(this.#normalizeRefName(ref));
  }

  public has(ref: string): boolean {
    return this.#map.has(this.#normalizeRefName(ref));
  }

  public [Symbol.iterator](): Iterator<T> {
    return this.#map.values();
  }

  /**
   * Normalizes a link reference. Link references are case-insensitive, so this lowercases the reference too so you can
   * correctly compare two normalized references.
   */
  #normalizeRefName(ref: string): string {
    return ref.normalize().trim().toLowerCase();
  }
}

export class LinkDefinitionSet implements Iterable<MdLinkDefinition> {
  readonly #map = new ReferenceLinkMap<MdLinkDefinition>();

  constructor(links: Iterable<MdLink>) {
    for (const link of links) {
      if (link.kind === MdLinkKind.Definition) {
        if (!this.#map.has(link.ref.text)) {
          this.#map.set(link.ref.text, link);
        }
      }
    }
  }

  public [Symbol.iterator](): Iterator<MdLinkDefinition> {
    return this.#map[Symbol.iterator]();
  }

  public lookup(ref: string): MdLinkDefinition | undefined {
    return this.#map.lookup(ref);
  }
}

/**
 * Stateful object which provides links for markdown files the workspace.
 */
export class MdLinkProvider extends Disposable {

  readonly #linkCache: MdDocumentInfoCache<MdDocumentLinksInfo>;

  readonly #linkComputer: MdLinkComputer;
  readonly #config: LsConfiguration;
  readonly #workspace: IWorkspace;
  readonly #tocProvider: MdTableOfContentsProvider;

  constructor(
    config: LsConfiguration,
    parser: Parser,
    workspace: IWorkspace,
    tocProvider: MdTableOfContentsProvider,
    logger: ILogger,
  ) {
    super();

    this.#config = config;
    this.#workspace = workspace;
    this.#tocProvider = tocProvider;

    this.#linkComputer = new MdLinkComputer(parser, this.#workspace);
    this.#linkCache = this._register(new MdDocumentInfoCache(this.#workspace, async (doc, token) => {
      logger.logDebug('LinkProvider.compute', { document: doc.uri, version: doc.version });

      const links = await this.#linkComputer.getAllLinks(doc, token);
      return {
        links,
        definitions: new LinkDefinitionSet(links),
      };
    }));
  }

  public getLinks(document: Document): Promise<MdDocumentLinksInfo> {
    return this.#linkCache.getForDocument(document);
  }

  public async provideDocumentLinks(document: Document, token: CancellationToken): Promise<lsp.DocumentLink[]> {
    if (token.isCancellationRequested) {
      return [];
    }
    const { links, definitions } = await this.getLinks(document);
    if (token.isCancellationRequested) {
      return [];
    }

    return coalesce(links.map(data => this.#toValidDocumentLink(data, definitions)));
  }

  public async resolveDocumentLink(link: lsp.DocumentLink, token: CancellationToken): Promise<lsp.DocumentLink | undefined> {
    if (token.isCancellationRequested) {
      return undefined;
    }

    const href = this.#reviveLinkHrefData(link);
    if (!href) {
      return undefined;
    }

    const target = await this.#resolveInternalLinkTarget(href.path, href.fragment, token);
    switch (target.kind) {
      case 'folder':
        link.target = this.#createCommandUri('revealInExplorer', href.path);
        break;
      case 'external':
        link.target = target.uri.toString(true);
        break;
      case 'file':
        if (target.position) {
          link.target = this.#createOpenAtPosCommand(target.uri, target.position);
        } else {
          link.target = target.uri.toString(true);
        }
        break;
    }

    return link;
  }

  public async resolveLinkTarget(linkText: string, sourceDoc: URI, token: CancellationToken): Promise<ResolvedDocumentLinkTarget | undefined> {
    if (token.isCancellationRequested) {
      return undefined;
    }

    const href = createHref(sourceDoc, linkText, this.#workspace);
    if (href?.kind !== HrefKind.Internal) {
      return undefined;
    }

    const resolved = resolveInternalDocumentLink(sourceDoc, linkText, this.#workspace);
    if (!resolved) {
      return undefined;
    }

    return this.#resolveInternalLinkTarget(resolved.resource, resolved.linkFragment, token);
  }

  async #resolveInternalLinkTarget(linkPath: URI, linkFragment: string, token: CancellationToken): Promise<ResolvedDocumentLinkTarget> {
    let target = linkPath;

    // If there's a containing document, don't bother with trying to resolve the
    // link to a workspace file as one will not exist
    const containingContext = this.#workspace.getContainingDocument?.(target);
    if (!containingContext) {
      const stat = await this.#workspace.stat(target);
      if (stat?.isDirectory) {
        return { kind: 'folder', uri: target };
      }

      if (token.isCancellationRequested) {
        return { kind: 'folder', uri: target };
      }

      if (!stat) {
        // We don't think the file exists. If it doesn't already have an extension, try tacking on a `.md` and using that instead
        let found = false;
        const dotMdResource = tryAppendMarkdownFileExtension(this.#config, target);
        if (dotMdResource) {
          if (await this.#workspace.stat(dotMdResource)) {
            target = dotMdResource;
            found = true;
          }
        }

        if (!found) {
          return { kind: 'file', uri: target };
        }
      }
    }

    if (!linkFragment) {
      return { kind: 'file', uri: target };
    }

    // Try navigating with fragment that sets line number
    const locationLinkPosition = parseLocationInfoFromFragment(linkFragment);
    if (locationLinkPosition) {
      return { kind: 'file', uri: target, position: locationLinkPosition };
    }

    // Try navigating to header in file
    const doc = await this.#workspace.openMarkdownDocument(target);
    if (token.isCancellationRequested) {
      return { kind: 'file', uri: target };
    }

    if (doc) {
      const toc = await this.#tocProvider.getForContainingDoc(doc, token);
      const entry = toc.lookup(linkFragment);
      if (isTocHeaderEntry(entry)) {
        return { kind: 'file', uri: URI.parse(entry.headerLocation.uri), position: entry.headerLocation.range.start, fragment: linkFragment };
      }
    }

    return { kind: 'file', uri: target };
  }

  #reviveLinkHrefData(link: lsp.DocumentLink): { path: URI, fragment: string } | undefined {
    if (!link.data) {
      return undefined;
    }

    const mdLink = link.data as MdLink;
    if (mdLink.href.kind !== HrefKind.Internal) {
      return undefined;
    }

    return { path: URI.from(mdLink.href.path), fragment: mdLink.href.fragment };
  }

  #toValidDocumentLink(link: MdLink, definitionSet: LinkDefinitionSet): lsp.DocumentLink | undefined {
    switch (link.href.kind) {
      case HrefKind.External: {
        return {
          range: link.source.hrefRange,
          target: link.href.uri.toString(true),
        };
      }
      case HrefKind.Internal: {
        return {
          range: link.source.hrefRange,
          target: undefined, // Needs to be resolved later
          tooltip: l10n.t('Follow link'),
          data: link,
        };
      }
      case HrefKind.Reference: {
        // We only render reference links in the editor if they are actually defined.
        // This matches how reference links are rendered by markdown-it.
        const def = definitionSet.lookup(link.href.ref);
        if (!def) {
          return undefined;
        }

        const target = this.#createOpenAtPosCommand(link.source.resource, def.source.hrefRange.start);
        return {
          range: link.source.hrefRange,
          tooltip: l10n.t('Go to link definition'),
          target: target,
          data: link
        };
      }
    }
  }

  #createCommandUri(command: string, ...args: unknown[]): string {
    return `command:${command}?${encodeURIComponent(JSON.stringify(args))}`;
  }

  #createOpenAtPosCommand(resource: URI, pos: lsp.Position): string {
    // If the resource itself already has a fragment, we need to handle opening specially
    // instead of using `file://path.md#L123` style uris
    if (resource.fragment) {
      // Match the args of `vscode.open`
      return this.#createCommandUri('quartoLanguageservice.open', resource, {
        selection: makeRange(pos, pos),
      });
    }

    return resource.with({
      fragment: `L${pos.line + 1},${pos.character + 1}`
    }).toString(true);
  }
}

/**
 * Extract position info from link fragments that look like `#L5,3`
 */
export function parseLocationInfoFromFragment(fragment: string): lsp.Position | undefined {
  const match = fragment.match(/^L(\d+)(?:,(\d+))?$/i);
  if (!match) {
    return undefined;
  }

  const line = +match[1] - 1;
  if (isNaN(line)) {
    return undefined;
  }

  const column = +match[2] - 1;
  return { line, character: isNaN(column) ? 0 : column };
}

export function createWorkspaceLinkCache(
  parser: Parser,
  workspace: IWorkspace,
) {
  const linkComputer = new MdLinkComputer(parser, workspace);
  return new MdWorkspaceInfoCache(workspace, (doc, token) => linkComputer.getAllLinks(doc, token));
}

export function looksLikeLinkToResource(configuration: LsConfiguration, href: InternalHref, targetResource: URI): boolean {
  if (href.path.fsPath === targetResource.fsPath) {
    return true;
  }

  return configuration.markdownFileExtensions.some(ext =>
    href.path.with({ path: href.path.path + '.' + ext }).fsPath === targetResource.fsPath);
}
