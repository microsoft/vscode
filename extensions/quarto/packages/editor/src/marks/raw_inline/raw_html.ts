/*
 * raw_html.ts
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

import { Mark, Schema, Fragment } from 'prosemirror-model';
import { InputRule } from 'prosemirror-inputrules';
import { EditorState } from 'prosemirror-state';

import { setTextSelection } from 'prosemirror-utils';

import { PandocTokenType, PandocToken, ProsemirrorWriter, PandocOutput } from '../../api/pandoc';
import { Extension, ExtensionContext } from '../../api/extension';
import { isRawHTMLFormat } from '../../api/raw';
import { MarkInputRuleFilter } from '../../api/input_rule';

import { kRawInlineFormat, kRawInlineContent } from './raw_inline';
import { toggleMarkType } from '../../api/command';
import { domAttrNoSpelling } from '../../api/mark';
import { fragmentText } from '../../api/fragment';

const extension = (context: ExtensionContext): Extension | null => {
  const { pandocExtensions } = context;
  return {
    marks: [
      {
        name: 'raw_html',
        noInputRules: true,
        noSpelling: true,
        spec: {
          inclusive: false,
          excludes: 'formatting',
          parseDOM: [
            {
              tag: "span[class*='raw-html']",
              getAttrs() {
                return {};
              },
            },
          ],
          toDOM() {
            const attr = {
              class: 'raw-html pm-fixedwidth-font pm-markup-text-color',
            };
            return ['span', domAttrNoSpelling(attr)];
          },
        },
        pandoc: {
          readers: [
            {
              token: PandocTokenType.RawInline,
              match: (tok: PandocToken) => {
                const format = tok.c[kRawInlineFormat];
                return isRawHTMLFormat(format);
              },
              handler: (schema: Schema) => {
                return (writer: ProsemirrorWriter, tok: PandocToken) => {
                  const html = tok.c[kRawInlineContent];
                  if (writer.hasInlineHTMLWriter(html)) {
                    writer.writeInlineHTML(html);
                  } else {
                    writeInlneHTML(schema, html, writer);
                  }
                };
              },
            },
          ],

          inlineHTMLReader: (schema: Schema, html: string, writer?: ProsemirrorWriter) => {
            // read single tags as inline html
            const isSingleTag = tagStartLoc(html, html.length - 2) === 0;
            if (isSingleTag && writer) {
              writeInlneHTML(schema, html, writer);
            }
            return isSingleTag;
          },
          writer: {
            priority: 1,
            write: (output: PandocOutput, _mark: Mark, parent: Fragment) => {
              const raw = fragmentText(parent);
              if (raw.startsWith("<") && raw.endsWith(">")) {
                output.writeRawMarkdown(parent);
              } else {
                output.writeToken(PandocTokenType.RawInline, () => {
                  output.write("html");
                  output.write(raw);
                });
              }
          
            },
          },
        },
      },
    ],

    // input rules
    inputRules: (schema: Schema, filter: MarkInputRuleFilter) => {
      if (pandocExtensions.raw_html) {
        return [rawHtmlInputRule(schema, filter)];
      } else {
        return [];
      }
    },
  };
};

function writeInlneHTML(schema: Schema, html: string, writer: ProsemirrorWriter) {
  const mark = schema.marks.raw_html.create();
  writer.openMark(mark);
  writer.writeText(html);
  writer.closeMark(mark);
}

export function rawHtmlInputRule(schema: Schema, filter: MarkInputRuleFilter) {
  return new InputRule(/>$/, (state: EditorState, _match: RegExpMatchArray, start: number, end: number) => {
    const rawhtmlMark = state.schema.marks.raw_html;

    // ensure we pass all conditions for html input
    if (state.selection.empty && toggleMarkType(rawhtmlMark)(state) && filter(state, start, end)) {
      // get tag info
      const { parent, parentOffset } = state.selection.$head;
      const text = parent.textContent;
      const endLoc = parentOffset - 1;
      const tag = tagInfo(text, endLoc);
      if (tag) {
        // create transaction
        const tr = state.tr;

        // insert >
        tr.insertText('>');

        // add mark
        start = tr.selection.from - (tag.end - tag.start + 1);
        tr.addMark(start, end + 1, rawhtmlMark.create());
        tr.removeStoredMark(rawhtmlMark);

        // if it wasn't an end tag and it isn't a void tag then also
        // insert an end tag (and leave the cursor in the middle)
        if (!tag.close && !tag.void) {
          const endTag = schema.text(`</${tag.name}>`);
          tr.replaceSelectionWith(endTag, false);
          setTextSelection(tr.selection.from - endTag.textContent.length)(tr);
          tr.addMark(tr.selection.from, tr.selection.from + endTag.textContent.length, rawhtmlMark.create());
          tr.removeStoredMark(rawhtmlMark);
        }

        // return transaction
        return tr;
      }
    }

    return null;
  });
}

function tagInfo(text: string, endLoc: number) {
  const startLoc = tagStartLoc(text, endLoc);
  if (startLoc !== -1) {
    // don't match if preceding character is a backtick
    // (user is attempting to write an html tag in code)
    if (text.charAt(startLoc - 1) === '`') {
      return null;
    }
    const tagText = text.substring(startLoc, endLoc + 1);
    const match = tagText.match(/<(\/?)(\w+)/);
    if (match) {
      const name = match[2];
      if (isHTMLTag(name)) {
        return {
          name: match[2],
          close: match[1].length > 0,
          void: isVoidTag(name),
          start: startLoc,
          end: endLoc + 1,
        };
      }
    }
  }
  return null;
}

function tagStartLoc(text: string, endLoc: number) {
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let i;
  for (i = endLoc; i >= 0; i--) {
    // next character
    const ch = text[i];

    // invalid if we see another > when not in quotes
    if (ch === '>' && !inSingleQuote && !inDoubleQuote) {
      return -1;
    }

    // > terminate on < if we aren't in quotes
    if (ch === '<' && !inSingleQuote && !inDoubleQuote) {
      return i;
    }

    // handle single quote
    if (ch === "'") {
      if (inSingleQuote) {
        inSingleQuote = false;
      } else if (!inDoubleQuote) {
        inSingleQuote = true;
      }

      // handle double quote
    } else if (ch === '"') {
      if (inDoubleQuote) {
        inDoubleQuote = false;
      } else if (!inSingleQuote) {
        inDoubleQuote = true;
      }
    }
  }

  return -1;
}

function isHTMLTag(tag: string) {
  return [
    // structural
    'a',
    'article',
    'aside',
    'body',
    'br',
    'details',
    'div',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'head',
    'header',
    'hgroup',
    'hr',
    'html',
    'footer',
    'nav',
    'p',
    'section',
    'span',
    'summary',

    // metadata
    'base',
    'basefont',
    'link',
    'meta',
    'style',
    'title',

    // form
    'button',
    'datalist',
    'fieldset',
    'form',
    'input',
    'keygen',
    'label',
    'legend',
    'meter',
    'optgroup',
    'option',
    'select',
    'textarea',

    // formatting
    'abbr',
    'acronym',
    'address',
    'b',
    'bdi',
    'bdo',
    'big',
    'blockquote',
    'center',
    'cite',
    'code',
    'del',
    'dfn',
    'em',
    'font',
    'i',
    'ins',
    'kbd',
    'mark',
    'output',
    'pre',
    'progress',
    'q',
    'rp',
    'rt',
    'ruby',
    's',
    'samp',
    'small',
    'strike',
    'strong',
    'sub',
    'sup',
    'tt',
    'u',
    'var',
    'wbr',

    // list
    'dd',
    'dir',
    'dl',
    'dt',
    'li',
    'ol',
    'menu',
    'ul',

    // table
    'caption',
    'col',
    'colgroup',
    'table',
    'tbody',
    'td',
    'tfoot',
    'thead',
    'th',
    'tr',

    // scripting
    'script',
    'noscript',

    // embedded content
    'applet',
    'area',
    'audio',
    'canvas',
    'embed',
    'figcaption',
    'figure',
    'frame',
    'frameset',
    'iframe',
    'img',
    'map',
    'noframes',
    'object',
    'param',
    'source',
    'time',
    'video',
  ].includes(tag.toLowerCase());
}

function isVoidTag(tag: string) {
  return [
    'area',
    'base',
    'br',
    'col',
    'command',
    'embed',
    'hr',
    'img',
    'input',
    'keygen',
    'link',
    'meta',
    'param',
    'source',
    'track',
    'wbr',
  ].includes(tag.toLowerCase());
}

export default extension;
