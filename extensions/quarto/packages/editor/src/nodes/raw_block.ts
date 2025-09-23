/*
 * raw_block.ts
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

import { Node as ProsemirrorNode, Schema, NodeType } from 'prosemirror-model';

import { EditorState, Transaction } from 'prosemirror-state';
import { setBlockType } from 'prosemirror-commands';

import { findParentNode } from 'prosemirror-utils';

import { Extension, ExtensionContext } from '../api/extension';

import {
  PandocOutput,
  PandocToken,
  PandocTokenType,
  ProsemirrorWriter,
  kRawBlockContent,
  kRawBlockFormat,
} from '../api/pandoc';
import { ProsemirrorCommand, EditorCommandId } from '../api/command';

import { EditorUI } from '../api/ui-types';
import { isSingleLineHTML } from '../api/html';
import { kHTMLFormat, kTexFormat, editRawBlockCommand, isRawHTMLFormat } from '../api/raw';
import { OmniInsert, OmniInsertGroup } from '../api/omni_insert';
import { kRawInlineFormat, kRawInlineContent } from '../marks/raw_inline/raw_inline';

const extension = (context: ExtensionContext): Extension | null => {
  const { pandocExtensions, pandocCapabilities, ui } = context;

  const rawAttribute = pandocExtensions.raw_attribute;

  return {
    nodes: [
      {
        name: 'raw_block',
        spec: {
          content: 'text*',
          group: 'block',
          marks: '',
          code: true,
          defining: true,
          isolating: true,
          attrs: {
            format: {},
          },
          parseDOM: [
            {
              tag: "div[class*='raw-block']",
              preserveWhitespace: 'full',
              getAttrs: (node: Node | string) => {
                const el = node as Element;
                return {
                  format: el.getAttribute('data-format'),
                };
              },
            },
          ],
          toDOM(node: ProsemirrorNode) {
            return [
              'div',
              {
                class: 'raw-block pm-fixedwidth-font pm-code-block pm-markup-text-color',
                'data-format': node.attrs.format,
              },
              0,
            ];
          },
        },

        code_view: {
          lang: (node: ProsemirrorNode) => {
            return node.attrs.format;
          },
          attrEditFn: rawAttribute ? editRawBlockCommand(ui, pandocCapabilities.output_formats) : undefined,
          borderColorClass: 'pm-raw-block-border',
        },

        attr_edit: () => ({
          type: (schema: Schema) => schema.nodes.raw_block,
          tags: (node: ProsemirrorNode) => [node.attrs.format],
          editFn: rawAttribute
            ? () => editRawBlockCommand(ui, pandocCapabilities.output_formats)
            : () => () => false,
        }),

        pandoc: {
          readers: [
            {
              token: PandocTokenType.RawBlock,
              block: 'raw_block',
            },
          ],

          // ensure that usethis badges comment ends up in it's own block
          preprocessor: (markdown: string) => {
            return markdown.replace(/([^\n])(\n^<!-- badges: end -->$)/gm, (_match, p1, p2) => {
              return p1 + '\n' + p2;
            });
          },

          tokensFilter: (tokens: PandocToken[]) => {
            const filtered: PandocToken[] = [];
            for (let i=0; i<tokens.length; i++) {
              if (isSingleLineHtmlRawBlock(tokens[i]) && 
                  isParaOrPlain(tokens[i+1]) &&
                  isSingleLineHtmlRawBlock(tokens[i+2])) {

                const beginTag = (tokens[i].c[kRawBlockContent] as string).trimRight();
                const endTag = (tokens[i+2].c[kRawBlockContent] as string).trimRight();
                const match = beginTag.match(/^<(.*?)>$/);
                if (match && (endTag === "</" + match[1] + ">")) {
                 
                  const innerContent = tokens[i+1].c as PandocToken[];
                  innerContent.unshift({
                    t: PandocTokenType.RawInline,
                    c: ["html", beginTag]
                  });
                  innerContent.push({
                    t: PandocTokenType.RawInline,
                    c: ["html", endTag]
                  });
                  filtered.push({
                    t: PandocTokenType.Para,
                    c: innerContent
                  });
                  i += 2;
                } else {
                  filtered.push(tokens[i]);
                }
              } else {
                filtered.push(tokens[i]);
              } 
            } 

            return filtered;
          },

          // we define a custom blockReader here so that we can convert html and tex blocks with
          // a single line of code into paragraph with a raw inline
          blockReader: (schema: Schema, tok: PandocToken, writer: ProsemirrorWriter) => {
            if (tok.t === PandocTokenType.RawBlock) {
              readPandocRawBlock(schema, tok, writer);
              return true;
            } else if (isParagraphWrappingMultilineRaw(tok)) {
              const rawTok = tok.c[0];
              const format = rawTok.c[kRawBlockFormat];
              const content = rawTok.c[kRawBlockContent];
              writer.addNode(schema.nodes.raw_block, { format }, [schema.text(content)]);
              return true;
            } else if (isParagraphWrappingLatexBeginOrEnd(tok)) {
              writer.addNode(schema.nodes.raw_block, { format: kTexFormat }, [schema.text(tok.c[0].c)]);
              return true;
            } else if (isParagraphWrappingRawLatexBeginOrEnd(tok)) {
              writer.addNode(schema.nodes.raw_block, { format: kTexFormat }, [schema.text(tok.c[0].c[kRawInlineContent])]);
              return true;
            } else {
              return false;
            }
          },
          writer: (output: PandocOutput, node: ProsemirrorNode) => {
            if (!pandocExtensions.raw_attribute || node.textContent.trim() === '<!-- -->') {
              output.writeToken(PandocTokenType.Para, () => {
                output.writeRawMarkdown(node.textContent);
              });

            // raw block with embedded ``` (e.g. a commented out Rmd code chunk) needs
            // extra backticks on the outside to prevent the rmd chunk end backticks
            // from being considered the end of the raw html block.
            } else if (node.textContent.includes("\n```")) {
              // find the ``` standing by itself on a line
              const matches: RegExpExecArray[] = [];
              const embeddedTickRegEx = /\n(`{3,})\s*?\n/g;
              embeddedTickRegEx.lastIndex = 0;
              let match: RegExpExecArray | null = null;
               // tslint:disable-next-line no-conditional-assignment
              while ((match = embeddedTickRegEx.exec(node.textContent))) {
                matches.push(match);
              }
              embeddedTickRegEx.lastIndex = 0;
              const matchRev = matches.reverse();
              const ticks = (matchRev.length > 0 ? matchRev[0][1] : "```") + "`";
              output.writeToken(PandocTokenType.Para, () => {
                output.writeRawMarkdown(`${ticks}{=${node.attrs.format}}\n${node.textContent}\n${ticks}\n`);
              });
            } else {
              output.writeToken(PandocTokenType.RawBlock, () => {
                output.write(node.attrs.format);
                output.write(node.textContent);
              });
            }
          },
        },
      },
    ],

    commands: (schema: Schema) => {
      const commands: ProsemirrorCommand[] = [];

      commands.push(
        new FormatRawBlockCommand(EditorCommandId.HTMLBlock, kHTMLFormat, schema.nodes.raw_block, {
          name: ui.context.translateText('HTML Block'),
          description: ui.context.translateText('Raw HTML content'),
          group: OmniInsertGroup.Blocks,
          priority: 6,
          image: () =>
            ui.prefs.darkMode() ? ui.images.omni_insert.html_block_dark : ui.images.omni_insert.html_block,
        }),
      );

      if (pandocExtensions.raw_tex) {
        commands.push(
          new FormatRawBlockCommand(EditorCommandId.TexBlock, kTexFormat, schema.nodes.raw_block, {
            name: ui.context.translateText('TeX Block'),
            description: ui.context.translateText('Raw TeX content'),
            group: OmniInsertGroup.Blocks,
            priority: 5,
            image: () =>
              ui.prefs.darkMode() ? ui.images.omni_insert.tex_block_dark : ui.images.omni_insert.tex_block,
          }),
        );
      }

      if (rawAttribute) {
        commands.push(new RawBlockCommand(ui, pandocCapabilities.output_formats));
      }

      return commands;
    },
  };
};

function isSingleLineHtmlRawBlock(tok?: PandocToken) {
  if (tok?.t === PandocTokenType.RawBlock) {
    const format = tok.c[kRawBlockFormat];
    const text = tok.c[kRawBlockContent] as string;
    const textTrimmed = text.trimRight();
    return isRawHTMLFormat(format) && isSingleLineHTML(textTrimmed);
  } else {
    return false;
  }
}

function isParaOrPlain(tok?: PandocToken) {
  if (tok) {
    return tok.t === PandocTokenType.Plain || tok.t === PandocTokenType.Para;
  } else {
    return false;
  }
}

function readPandocRawBlock(schema: Schema, tok: PandocToken, writer: ProsemirrorWriter) {
  // single lines of html should be read as inline html (allows for
  // highlighting and more seamless editing experience)
  const format = tok.c[kRawBlockFormat];
  const text = tok.c[kRawBlockContent] as string;
  const textTrimmed = text.trimRight();
  if (isRawHTMLFormat(format) && isSingleLineHTML(textTrimmed) && writer.hasInlineHTMLWriter(textTrimmed)) {
    writer.openNode(schema.nodes.paragraph, {});
    writer.writeInlineHTML(textTrimmed);
    writer.closeNode();

    // similarly, single lines of tex (that aren't begin or end) should be read as inline tex
  } else if (format === kTexFormat && readAsInlineTex(textTrimmed)) {
    writer.openNode(schema.nodes.paragraph, {});
    const rawTexMark = schema.marks.raw_tex.create();
    writer.openMark(rawTexMark);
    writer.writeText(textTrimmed);
    writer.closeMark(rawTexMark);
    writer.closeNode();
  } else {
    writer.openNode(schema.nodes.raw_block, { format });
    writer.writeText(text);
    writer.closeNode();
  }
}


export function readAsInlineTex(tex: string) {
  tex = tex.trimRight();
  if (tex.split('\n').length === 1){
    return !isLatexBeginOrEnd(tex);
  } else {
    return false;
  }
}

function isParagraphWrappingMultilineRaw(tok: PandocToken) {
  return isSingleChildParagraph(tok) && 
         tok.c[0].t === PandocTokenType.RawInline &&
         isMultilineString(tok.c[0].c[kRawBlockContent]);
}

function isParagraphWrappingLatexBeginOrEnd(tok: PandocToken) {
  return isSingleChildParagraph(tok) &&
         tok.c[0].t === PandocTokenType.Str &&
         isLatexBeginOrEnd(tok.c[0].c);
}

function isParagraphWrappingRawLatexBeginOrEnd(tok: PandocToken) {
  return isSingleChildParagraph(tok) &&
         (tok.c[0].t === PandocTokenType.RawInline &&
         tok.c[0].c[kRawInlineFormat] === kTexFormat &&
         isLatexBeginOrEnd(tok.c[0].c[kRawInlineContent]));
}

function isLatexBeginOrEnd(str: string) {
  return str && str.trimLeft().match(/\\(begin|end)/);
}

function isSingleChildParagraph(tok: PandocToken) {
  return tok.t === PandocTokenType.Para && tok.c && tok.c.length === 1;
}

function isMultilineString(str: string) {
  return str.indexOf('\n') !== -1;
}

// base class for format specific raw block commands (e.g. html/tex)
class FormatRawBlockCommand extends ProsemirrorCommand {
  private format: string;
  private nodeType: NodeType;

  constructor(id: EditorCommandId, format: string, nodeType: NodeType, omniInsert?: OmniInsert) {
    super(
      id,
      [],
      (state: EditorState, dispatch?: (tr: Transaction) => void) => {
        if (!this.isActive(state) && !setBlockType(this.nodeType, { format })(state)) {
          return false;
        }

        if (dispatch) {
          const schema = state.schema;
          if (this.isActive(state)) {
            setBlockType(schema.nodes.paragraph)(state, dispatch);
          } else {
            setBlockType(this.nodeType, { format })(state, dispatch);
          }
        }

        return true;
      },
      omniInsert,
    );
    this.format = format;
    this.nodeType = nodeType;
  }

  public isActive(state: EditorState) {
    return !!findParentNode(node => node.type === this.nodeType && node.attrs.format === this.format)(state.selection);
  }
}

// generic raw block command (shows dialog to allow choosing from among raw formats)
class RawBlockCommand extends ProsemirrorCommand {
  constructor(ui: EditorUI, outputFormats: string[]) {
    super(EditorCommandId.RawBlock, [], editRawBlockCommand(ui, outputFormats), {
      name: ui.context.translateText('Raw Block...'),
      description: ui.context.translateText('Raw content block'),
      group: OmniInsertGroup.Blocks,
      priority: 4,
      noFocus: true,
      image: () => (ui.prefs.darkMode() ? ui.images.omni_insert.raw_block_dark : ui.images.omni_insert.raw_block),
    });
  }
}

export default extension;
