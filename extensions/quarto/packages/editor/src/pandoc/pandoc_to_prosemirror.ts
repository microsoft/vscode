/*
 * pandoc_to_prosemirror.ts
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

import { Attrs, Mark, Node as ProsemirrorNode, NodeType, Schema } from 'prosemirror-model';

import {
  PandocTokenReader,
  PandocToken,
  PandocAst,
  ProsemirrorWriter,
  PandocBlockReaderFn,
  PandocInlineHTMLReaderFn,
  PandocTokensFilterFn,
  PandocTokenType,
  mapTokens,
  stringifyTokens,
  PandocExtensions,
  forEachToken,
} from '../api/pandoc';
import {
  pandocAttrReadAST,
  kCodeBlockAttr,
  kCodeBlockText,
  kPandocAttrClasses,
  kPandocAttrKeyvalue,
} from '../api/pandoc_attr';
import {
  PandocBlockCapsuleFilter,
  parsePandocBlockCapsule,
  resolvePandocBlockCapsuleText,
  decodeBlockCapsuleText,
} from '../api/pandoc_capsule';

import { PandocToProsemirrorResult, PandocLineWrapping } from './pandoc_converter';
import { kLinkTarget, kLinkTargetUrl, kLinkChildren, kLinkAttr, kLinkTargetTitle } from '../api/link';
import { kHeadingAttr, kHeadingLevel, kHeadingChildren } from '../api/heading';
import { pandocAutoIdentifier, gfmAutoIdentifier } from '../api/pandoc_id';
import { hasShortcutHeadingLinks } from '../api/pandoc_format';
import { equalsIgnoreCase } from 'core';

export function pandocToProsemirror(
  ast: PandocAst,
  schema: Schema,
  extensions: PandocExtensions,
  readers: readonly PandocTokenReader[],
  tokensFilters: readonly PandocTokensFilterFn[],
  blockReaders: readonly PandocBlockReaderFn[],
  inlineHTMLReaders: readonly PandocInlineHTMLReaderFn[],
  blockCapsuleFilters: readonly PandocBlockCapsuleFilter[],
): PandocToProsemirrorResult {
  const parser = new Parser(
    schema,
    extensions,
    readers,
    tokensFilters,
    blockReaders,
    inlineHTMLReaders,
    blockCapsuleFilters,
  );
  return parser.parse(ast);
}

class Parser {
  private readonly schema: Schema;
  private readonly extensions: PandocExtensions;
  private readonly tokensFilters: readonly PandocTokensFilterFn[];
  private readonly inlineHTMLReaders: readonly PandocInlineHTMLReaderFn[];
  private readonly blockCapsuleFilters: readonly PandocBlockCapsuleFilter[];
  private readonly handlers: { [token: string]: ParserTokenHandlerCandidate[] };

  constructor(
    schema: Schema,
    extensions: PandocExtensions,
    readers: readonly PandocTokenReader[],
    tokensFilters: readonly PandocTokensFilterFn[],
    blockReaders: readonly PandocBlockReaderFn[],
    inlineHTMLReaders: readonly PandocInlineHTMLReaderFn[],
    blockCapsuleFilters: readonly PandocBlockCapsuleFilter[],
  ) {
    this.schema = schema;
    this.extensions = extensions;
    this.tokensFilters = tokensFilters;
    this.inlineHTMLReaders = inlineHTMLReaders;
    // apply block capsule filters in reverse order
    this.blockCapsuleFilters = blockCapsuleFilters.slice().reverse();
    this.handlers = this.createHandlers(readers, blockReaders);
  }

  public parse(ast: PandocAst) {
    // create state
    const state: ParserState = new ParserState(this.schema);
    // create writer (compose state w/ writeTokens function)
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const parser = this;
    const writer: ProsemirrorWriter = {
      openNode: state.openNode.bind(state),
      closeNode: state.closeNode.bind(state),
      openNoteNode: state.openNoteNode.bind(state),
      addNode: state.addNode.bind(state),
      openMark: state.openMark.bind(state),
      closeMark: state.closeMark.bind(state),
      writeText: state.writeText.bind(state),
      hasInlineHTMLWriter(html: string) {
        return parser.hasInlineHTMLWriter(html);
      },
      writeInlineHTML(html: string) {
        return parser.writeInlineHTML(this, html);
      },
      writeTokens(tokens: PandocToken[]) {
        parser.writeTokens(this, tokens);
      },
      logUnrecognized: state.logUnrecognized.bind(state),
      logExampleList: state.logExampleList.bind(state),
      isNodeOpen: state.isNodeOpen.bind(state),
    };

    // process raw text capsules
    let targetAst = {
      ...ast,
      blocks: resolvePandocBlockCapsuleText(ast.blocks, this.blockCapsuleFilters),
    };

    // detect line wrapping
    const lineWrapping = detectLineWrapping(targetAst);

    // resolve heading ids
    targetAst = resolveHeadingIds(targetAst, this.extensions);

    // write all tokens
    writer.writeTokens(targetAst.blocks);

    // return
    return {
      doc: state.doc(),
      line_wrapping: lineWrapping,
      unrecognized: state.unrecognized(),
      example_lists: state.hasExampleLists(),
      unparsed_meta: ast.meta,
    };
  }

  private writeTokens(writer: ProsemirrorWriter, tokens: PandocToken[]) {
    // pass through tokens filters
    let targetTokens = tokens;
    this.tokensFilters.forEach(filter => {
      targetTokens = filter(targetTokens, writer);
    });

    // process tokens
    targetTokens.forEach(tok => this.writeToken(writer, tok));
  }

  private writeToken(writer: ProsemirrorWriter, tok: PandocToken) {
    // process block-level capsules
    for (const filter of this.blockCapsuleFilters) {
      const capsuleText = filter.handleToken?.(tok);
      if (capsuleText) {
        const blockCapsule = parsePandocBlockCapsule(capsuleText);
        // run all of the text filters in case there was nesting
        blockCapsule.source = decodeBlockCapsuleText(blockCapsule.source, tok, this.blockCapsuleFilters);
        filter.writeNode(this.schema, writer, blockCapsule);
        return;
      }
    }

    // look for a handler.match function that wants to handle this token
    const handlers = this.handlers[tok.t] || [];
    for (const handler of handlers) {
      // It's not enough for a pandoc reader's preferred token to match the
      // current token; it's possible based on the `match` method for the
      // reader to decline to handle it.
      if (handler.match && handler.match(tok)) {
        handler.handler(writer, tok);
        return;
      }
    }

    // if we didn't find one, look for the default handler
    for (const handler of handlers) {
      if (!handler.match) {
        handler.handler(writer, tok);
        return;
      }
    }

    // log unrecognized token
    writer.logUnrecognized(tok.t);
  }

  private hasInlineHTMLWriter(html: string) {
    for (const reader of this.inlineHTMLReaders) {
      if (reader(this.schema, html)) {
        return true;
      }
    }
    return false;
  }

  private writeInlineHTML(writer: ProsemirrorWriter, html: string) {
    for (const reader of this.inlineHTMLReaders) {
      if (reader(this.schema, html, writer)) {
        return;
      }
    }
  }

  // create parser token handler functions based on the passed readers
  private createHandlers(readers: readonly PandocTokenReader[], blockReaders: readonly PandocBlockReaderFn[]) {
    const handlers: { [token: string]: ParserTokenHandlerCandidate[] } = {};

    for (const reader of readers) {
      // resolve children (provide default impl)
      const getChildren = reader.getChildren || ((tok: PandocToken) => tok.c);

      // resolve getAttrs (provide default imple)
      const getAttrs = reader.getAttrs ? reader.getAttrs : () => ({});

      let handler: ParserTokenHandler;

      // see if there is a low-level handler
      if (reader.handler) {
        handler = reader.handler(this.schema);
      }

      // text
      else if (reader.text) {
        handler = (writer: ProsemirrorWriter, tok: PandocToken) => {
          if (reader.getText) {
            const text = reader.getText(tok);
            writer.writeText(text);
          }
        };

        // marks
      } else if (reader.mark) {
        handler = (writer: ProsemirrorWriter, tok: PandocToken) => {
          const markType = this.schema.marks[reader.mark as string];
          const mark = markType.create(getAttrs(tok));
          writer.openMark(mark);
          if (reader.getText) {
            writer.writeText(reader.getText(tok));
          } else {
            writer.writeTokens(getChildren(tok));
          }
          writer.closeMark(mark);
        };

        // blocks
      } else if (reader.block) {
        const nodeType = this.schema.nodes[reader.block];
        handler = (writer: ProsemirrorWriter, tok: PandocToken) => {
          // give the block readers first crack (e.g. handle a paragraph node with
          // a single image as a figure node)
          for (const blockReader of blockReaders) {
            if (blockReader(this.schema, tok, writer)) {
              return;
            }
          }

          writer.openNode(nodeType, getAttrs(tok));
          if (reader.getText) {
            writer.writeText(reader.getText(tok));
          } else {
            writer.writeTokens(getChildren(tok));
          }
          writer.closeNode();
        };

        // nodes
      } else if (reader.node) {
        const nodeType = this.schema.nodes[reader.node];
        handler = (writer: ProsemirrorWriter, tok: PandocToken) => {
          if (reader.getChildren) {
            writer.openNode(nodeType, getAttrs(tok));
            writer.writeTokens(getChildren(tok));
            writer.closeNode();
          } else {
            let content: ProsemirrorNode[] = [];
            if (reader.getText) {
              content = [this.schema.text(reader.getText(tok))];
            }
            writer.addNode(nodeType, getAttrs(tok), content);
          }
        };

        // code blocks
      } else if (reader.code_block) {
        handler = (writer: ProsemirrorWriter, tok: PandocToken) => {
          // type/attr/text
          const nodeType = this.schema.nodes.code_block;
          const attr = pandocAttrReadAST(tok, kCodeBlockAttr);
          const text = tok.c[kCodeBlockText] as string;

          // write node
          writer.openNode(nodeType, attr);
          writer.writeText(text);
          writer.closeNode();
        };
      } else {
        throw new Error('pandoc reader was malformed or unrecognized');
      }

      // Ensure an array exists
      handlers[reader.token] = handlers[reader.token] || [];

      handlers[reader.token].push({
        match: reader.match,
        handler,
      });
    }
    return handlers;
  }
}

class ParserState {
  private readonly schema: Schema;
  private readonly stack: ParserStackElement[];
  private readonly notes: ProsemirrorNode[];
  private marks: readonly Mark[];
  private footnoteNumber: number;
  private unrecognizedTokens: string[];
  private exampleLists: boolean;

  constructor(schema: Schema) {
    this.schema = schema;
    this.stack = [{ type: this.schema.nodes.body, attrs: {}, content: [] }];
    this.notes = [];
    this.marks = Mark.none;
    this.footnoteNumber = 1;
    this.unrecognizedTokens = [];
    this.exampleLists = false;
  }

  public doc(): ProsemirrorNode {
    const content: ProsemirrorNode[] = [];
    content.push(this.top().type.createAndFill(null, this.top().content) as ProsemirrorNode);
    content.push(this.schema.nodes.notes.createAndFill(null, this.notes) as ProsemirrorNode);
    return this.schema.topNodeType.createAndFill({}, content) as ProsemirrorNode;
  }

  public unrecognized(): string[] {
    return this.unrecognizedTokens;
  }

  public hasExampleLists(): boolean {
    return this.exampleLists;
  }

  public writeText(text: string) {
    if (!text) {
      return;
    }
    const nodes: ProsemirrorNode[] = this.top().content;
    const last: ProsemirrorNode = nodes[nodes.length - 1];
    const node: ProsemirrorNode = this.schema.text(text, this.marks);
    const merged: ProsemirrorNode | undefined = this.maybeMerge(last, node);
    if (last && merged) {
      nodes[nodes.length - 1] = merged;
    } else {
      nodes.push(node);
    }
  }

  public addNode(type: NodeType, attrs: Attrs, content: ProsemirrorNode[]) {
    const node: ProsemirrorNode | null | undefined = type.createAndFill(attrs, content, this.marks);
    if (!node) {
      return null;
    }
    if (this.stack.length) {
      if (type === this.schema.nodes.note) {
        this.notes.push(node);
      } else {
        this.top().content.push(node);
      }
    }
    return node;
  }

  public openNode(type: NodeType, attrs: Attrs) {
    this.stack.push({ type, attrs, content: [] });
  }

  public closeNode(): ProsemirrorNode {
    // get node info
    const info: ParserStackElement = this.stack.pop() as ParserStackElement;

    // clear marks if the node type isn't inline
    if (!info.type.isInline) {
      if (this.marks.length) {
        this.marks = Mark.none;
      }
    }

    return this.addNode(info.type, info.attrs, info.content) as ProsemirrorNode;
  }

  public openMark(mark: Mark) {
    this.marks = mark.addToSet(this.marks);
  }

  public closeMark(mark: Mark) {
    this.marks = mark.removeFromSet(this.marks);
  }

  public openNoteNode(ref: string) {
    this.openNode(this.schema.nodes.note, { ref, number: this.footnoteNumber++ });
  }

  public logUnrecognized(type: string) {
    if (!this.unrecognizedTokens.includes(type)) {
      this.unrecognizedTokens.push(type);
    }
  }

  public logExampleList() {
    this.exampleLists = true;
  }

  public isNodeOpen(type: NodeType) {
    return this.stack.some(value => value.type === type);
  }

  private top(): ParserStackElement {
    return this.stack[this.stack.length - 1];
  }

  private maybeMerge(a: ProsemirrorNode, b: ProsemirrorNode): ProsemirrorNode | undefined {
    if (a && a.isText && b.isText && Mark.sameSet(a.marks, b.marks)) {
      return this.schema.text(((a.text as string) + b.text) as string, a.marks);
    } else {
      return undefined;
    }
  }
}

// determine what sort of line wrapping is used within the file
function detectLineWrapping(ast: PandocAst): PandocLineWrapping {
  // look for soft breaks and classify them as column or sentence breaks
  let columnBreaks = 0;
  let sentenceBreaks = 0;
  let prevTok: PandocToken = { t: PandocTokenType.Null };
  forEachToken(ast.blocks, tok => {
    if (tok.t === PandocTokenType.SoftBreak) {
      if (
        prevTok.t === PandocTokenType.Str &&
        typeof prevTok.c === 'string' &&
        ['.', '?', '!'].includes(prevTok.c.charAt(prevTok.c.length - 1))
      ) {
        sentenceBreaks++;
      } else {
        columnBreaks++;
      }
    }
    prevTok = tok;
  });

  // need to have > 5 line breaks or more line breaks than blocks to trigger detection
  // (prevents 'over-detection' if there are stray few soft breaks)
  const lineBreaks = columnBreaks + sentenceBreaks;
  if (lineBreaks > 5 || lineBreaks > ast.blocks.length) {
    if (sentenceBreaks > columnBreaks) {
      return 'sentence';
    } else {
      return 'column';
    }
  } else {
    return 'none';
  }
}

// determine which heading ids are valid based on explicit headings contained in the
// document and any headings targeted by links. remove any heading ids not so identified
function resolveHeadingIds(ast: PandocAst, extensions: PandocExtensions) {
  // determine function we will use to create auto-identifiers
  const autoIdentifier = extensions.gfm_auto_identifiers ? gfmAutoIdentifier : pandocAutoIdentifier;

  // start with ids we know are valid (i.e. ones the user added to the doc)
  const headingIds = new Set<string>((ast.heading_ids || []).map(id => id.toLocaleLowerCase()));

  // find ids referenced in links
  let astBlocks = mapTokens(ast.blocks, tok => {
    if (tok.t === PandocTokenType.Link) {
      const target = tok.c[kLinkTarget];
      const href = target[kLinkTargetUrl] as string;
      if (href.startsWith('#')) {
        // if we have support for implicit header references and shortcut reference links,
        // also check to see whether the link text resolves to the target (in that case
        // we don't need the explicit id). note that if that heading has an explicit
        // id defined then we also leave it alone.
        const text = stringifyTokens(tok.c[kLinkChildren], extensions.gfm_auto_identifiers);
        if (
          hasShortcutHeadingLinks(extensions) &&
          equalsIgnoreCase('#' + autoIdentifier(text, extensions.ascii_identifiers), href) &&
          !headingIds.has(href.toLocaleLowerCase())
        ) {
          // return a version of the link w/o the target
          return {
            t: PandocTokenType.Link,
            c: [tok.c[kLinkAttr], tok.c[kLinkChildren], ['#', tok.c[kLinkTarget][kLinkTargetTitle]]],
          };

          // otherwise note that it's a valid id
        } else {
          headingIds.add(href.toLocaleLowerCase());
        }
      }
    }
    // default to return token unmodified
    return tok;
  });

  // remove any heading ids not created by the user or required by a link
  astBlocks = mapTokens(ast.blocks, tok => {
    if (tok.t === PandocTokenType.Header) {
      const attr = pandocAttrReadAST(tok, kHeadingAttr);
      if (attr.id && !headingIds.has('#' + attr.id.toLocaleLowerCase())) {
        return {
          t: PandocTokenType.Header,
          c: [
            tok.c[kHeadingLevel],
            ['', tok.c[kHeadingAttr][kPandocAttrClasses], tok.c[kHeadingAttr][kPandocAttrKeyvalue]],
            tok.c[kHeadingChildren],
          ],
        };
      }
    }
    // default to just reflecting back the token
    return tok;
  });

  // return the ast
  return {
    ...ast,
    blocks: astBlocks,
    heading_ids: undefined,
  };
}

interface ParserStackElement {
  type: NodeType;
  attrs: Record<string,unknown>;
  content: ProsemirrorNode[];
}

type ParserTokenHandler = (writer: ProsemirrorWriter, tok: PandocToken) => void;

interface ParserTokenHandlerCandidate {
  match?: (tok: PandocToken) => boolean;
  handler: ParserTokenHandler;
}
