/*
 * pandoc.ts
 *
 * Copyright (C) 2022 by Posit Software, PBC
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

import { Fragment, Mark, Node as ProsemirrorNode, Schema, NodeType, Attrs } from 'prosemirror-model';

import { PandocAttr, pandocAttrReadAST, kSpanChildren, kSpanAttr } from './pandoc_attr';
import { kQuoteType, kQuoteChildren, QuoteType } from './quote';

import { stringifyMath } from './math';
import { kCodeText } from './code';
import { kLinkChildren } from './link';

import { BibliographyResult, PandocServer, PandocApiVersion, PandocAst, PandocToken } from 'editor-types';
import { PandocExtensions } from './pandoc-types';
export type { BibliographyResult, PandocServer,PandocApiVersion, PandocAst, PandocToken, PandocExtensions };


export function imageAttributesAvailable(pandocExtensions: PandocExtensions) {
  return pandocExtensions.link_attributes || pandocExtensions.raw_html;
}

export function parsePandocListOutput(output: string) {
  return output.split(/\r?\n/).filter(entry => entry.length);
}


// https://github.com/jgm/pandoc-types/blob/master/Text/Pandoc/Definition.hs
export enum PandocTokenType {
  Str = 'Str',
  Space = 'Space',
  Strong = 'Strong',
  Emph = 'Emph',
  Code = 'Code',
  Superscript = 'Superscript',
  Subscript = 'Subscript',
  Strikeout = 'Strikeout',
  SmallCaps = 'SmallCaps',
  Underline = 'Underline',
  Quoted = 'Quoted',
  RawInline = 'RawInline',
  RawBlock = 'RawBlock',
  LineBlock = 'LineBlock',
  Para = 'Para',
  Plain = 'Plain',
  Header = 'Header',
  CodeBlock = 'CodeBlock',
  BlockQuote = 'BlockQuote',
  BulletList = 'BulletList',
  OrderedList = 'OrderedList',
  DefinitionList = 'DefinitionList',
  Image = 'Image',
  Figure = 'Figure',
  Link = 'Link',
  Note = 'Note',
  Cite = 'Cite',
  Table = 'Table',
  AlignRight = 'AlignRight',
  AlignLeft = 'AlignLeft',
  AlignDefault = 'AlignDefault',
  AlignCenter = 'AlignCenter',
  ColWidth = 'ColWidth',
  ColWidthDefault = 'ColWidthDefault',
  HorizontalRule = 'HorizontalRule',
  LineBreak = 'LineBreak',
  SoftBreak = 'SoftBreak',
  Math = 'Math',
  InlineMath = 'InlineMath',
  DisplayMath = 'DisplayMath',
  Div = 'Div',
  Span = 'Span',
  Null = 'Null',
}

export interface PandocTokenReader {
  // pandoc token name (e.g. "Str", "Emph", etc.)
  readonly token: PandocTokenType;

  // If present, gives a chance for the reader to decide whether it actually
  // wants to handle the token, based on factors other than the PandocTokenType
  readonly match?: (tok: PandocToken) => boolean;

  // one and only one of these values must also be set
  readonly text?: boolean;
  readonly node?: string;
  readonly block?: string;
  readonly mark?: string;
  readonly code_block?: boolean;

  // functions for getting attributes and children
  getAttrs?: (tok: PandocToken) => Attrs;
  getChildren?: (tok: PandocToken) => unknown[];
  getText?: (tok: PandocToken) => string;

  // lower-level handler function that overrides the above handler attributes
  // (they are ignored when handler is specified)
  handler?: (schema: Schema) => (writer: ProsemirrorWriter, tok: PandocToken) => void;

  // post-processor for performing fixups that rely on seeing the entire
  // document (e.g. recognizing implicit header references)
  postprocessor?: PandocPostprocessorFn;
}

// constants used to read the contents of raw blocks
export const kRawBlockFormat = 0;
export const kRawBlockContent = 1;

// filter sequences of tokens (e.g. for reducing some adjacent tokens to a single token)
export type PandocTokensFilterFn = (tokens: PandocToken[], writer: ProsemirrorWriter) => PandocToken[];

// special reader that gets a first shot at blocks (i.e. to convert a para w/ a single image into a figure)
export type PandocBlockReaderFn = (schema: Schema, tok: PandocToken, writer: ProsemirrorWriter) => boolean;

// reader that gets a first shot at inline html (e.g. image node parsing an <img> tag)
export type PandocInlineHTMLReaderFn = (schema: Schema, html: string, writer?: ProsemirrorWriter) => boolean;

export interface ProsemirrorWriter {
  // open (then close) a node container
  openNode(type: NodeType, attrs: Attrs): void;
  closeNode(): ProsemirrorNode;

  // special open call for note node containers
  openNoteNode(ref: string): void;

  // add a node to the current container
  addNode(type: NodeType, attrs: Attrs, content: ProsemirrorNode[]): ProsemirrorNode | null;

  // open and close marks
  openMark(mark: Mark): void;
  closeMark(mark: Mark): void;

  // add text to the current node using the current mark set
  writeText(text: string): void;

  // write tokens into the current node
  writeTokens(tokens: PandocToken[]): void;

  // see if any inline HTML readers want to handle this html
  hasInlineHTMLWriter(html: string): boolean;
  writeInlineHTML(html: string): void;

  // log an unrecoginzed token type
  logUnrecognized(token: string): void;

  // log the presence of example lists
  logExampleList(): void;

  // query whether a given node type is open
  // (useful for e.g. conditional behavior when in a list or table)
  isNodeOpen(type: NodeType): boolean;
}

export interface PandocNodeWriter {
  readonly name: string;
  readonly write: PandocNodeWriterFn;
}

export type PandocNodeWriterFn = (output: PandocOutput, node: ProsemirrorNode) => void;

export type PandocPreprocessorFn = (markdown: string) => string;

export type PandocPostprocessorFn = (doc: ProsemirrorNode) => ProsemirrorNode;

export type PandocMarkdownPostProcessorFn = (markdown: string) => string;

export interface PandocMarkWriter {
  // pandoc mark name
  readonly name: string;

  // The 'priority' property allows us to dicate the order of nesting
  // for marks (this is required b/c Prosemirror uses a flat structure
  // whereby multiple marks are attached to text nodes). This allows us
  // to e.g. ensure that strong and em always occur outside code.
  readonly priority: number;

  // writer function
  readonly write: PandocMarkWriterFn;
}

export type PandocMarkWriterFn = (output: PandocOutput, mark: Mark, parent: Fragment) => void;

export const kWriteSpaces = 'writeSpaces';
export const kPreventBracketEscape = 'preventBracketEscape';

export type PandocOutputOption = typeof kWriteSpaces | typeof kPreventBracketEscape;



export interface PandocOutput {
  extensions: PandocExtensions;
  write(value: unknown): void;
  writeToken(type: PandocTokenType, content?: (() => void) | unknown): void;
  writeMark(type: PandocTokenType, parent: Fragment, expelEnclosingWhitespace?: boolean): void;
  writeArray(content: () => void): void;
  writeAttr(id?: string, classes?: string[], keyvalue?: [[string, string]]): void;
  writeText(text: string | null): void;
  writeLink(href: string, title: string, attr: PandocAttr | null, f: () => void): void;
  writeNode(node: ProsemirrorNode): void;
  writeNodes(parent: ProsemirrorNode): void;
  writeNote(note: ProsemirrorNode): void;
  writeInlines(fragment: Fragment): void;
  writeRawMarkdown(markdown: Fragment | string, escapeSymbols?: boolean): void;
  withOption(option: PandocOutputOption, value: boolean, f: () => void): void;
}

// collect the text from a collection of pandoc ast
// elements (ignores marks, useful for ast elements
// that support marks but whose prosemirror equivalent
// does not, e.g. image alt text)
// https://github.com/jgm/pandoc/blob/83880b0dbc318703babfbb6905b1046fa48f1216/src/Text/Pandoc/Shared.hs#L439
export function stringifyTokens(c: PandocToken[], unemoji = false): string {
  return c
    .map(elem => {
      if (elem.t === PandocTokenType.Str) {
        return elem.c;
      } else if (
        elem.t === PandocTokenType.Space ||
        elem.t === PandocTokenType.SoftBreak ||
        elem.t === PandocTokenType.LineBreak
      ) {
        return ' ';
      } else if (elem.t === PandocTokenType.Link) {
        return stringifyTokens(elem.c[kLinkChildren]);
      } else if (elem.t === PandocTokenType.Span) {
        const attr = pandocAttrReadAST(elem, kSpanAttr);
        if (unemoji && attr.classes && attr.classes[0] === 'emoji') {
          return attr.keyvalue[0][1];
        } else {
          return stringifyTokens(elem.c[kSpanChildren]);
        }
      } else if (elem.t === PandocTokenType.Quoted) {
        const type = elem.c[kQuoteType].t;
        const quote = type === QuoteType.SingleQuote ? "'" : '"';
        return quote + stringifyTokens(elem.c[kQuoteChildren]) + quote;
      } else if (elem.t === PandocTokenType.Math) {
        return stringifyMath(elem);
      } else if (elem.t === PandocTokenType.Code) {
        return elem.c[kCodeText];
      } else if (elem.c) {
        return stringifyTokens(elem.c);
      } else {
        return '';
      }
    })
    .join('');
}

export function forEachToken(tokens: PandocToken[], f: (tok: PandocToken) => void) {
  mapTokens(tokens, (tok: PandocToken) => {
    f(tok);
    return tok;
  });
}

export function mapTokens(tokens: PandocToken[], f: (tok: PandocToken) => PandocToken) {
  function isToken(val: unknown) {
    if (val !== null && typeof val === 'object') {
      return Object.prototype.hasOwnProperty.call(val, 't');
    } else {
      return false;
    }
  }

  function tokenHasChildren(tok: PandocToken) {
    return tok !== null && typeof tok === 'object' && Array.isArray(tok.c);
  }

  function mapValue(val: unknown): unknown {
    if (isToken(val)) {
      return mapToken(val as PandocToken);
    } else if (Array.isArray(val)) {
      return val.map(mapValue);
    } else {
      return val;
    }
  }

  function mapToken(tok: PandocToken): PandocToken {
    const mappedTok = f(tok);
    if (tokenHasChildren(mappedTok)) {
      mappedTok.c = mappedTok.c.map(mapValue);
    }
    return mappedTok;
  }

  return tokens.map(mapToken);
}

export function tokenTextEscaped(t: PandocToken) {
  return t.c.replace(/\\/g, `\\\\`);
}

// sort marks by priority (in descending order)
export function marksByPriority(marks: readonly Mark[], markWriters: { [key: string]: PandocMarkWriter }) {
  return Array.prototype.sort.call(marks, (a: Mark, b: Mark) => {
    const aPriority = markWriters[a.type.name].priority;
    const bPriority = markWriters[b.type.name].priority;
    if (aPriority < bPriority) {
      return 1;
    } else if (bPriority < aPriority) {
      return -1;
    } else {
      return 0;
    }
  }) as readonly Mark[];
}
