/*
 * raw_tex.ts
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

import { Node as ProsemirrorNode, Mark, Fragment, Schema } from 'prosemirror-model';
import { DecorationSet } from 'prosemirror-view';
import { Plugin, PluginKey, EditorState, Transaction, TextSelection } from 'prosemirror-state';
import { InputRule, inputRules } from 'prosemirror-inputrules';

import { setTextSelection } from 'prosemirror-utils';

import { PandocToken, PandocTokenType, PandocOutput } from '../../api/pandoc';
import { Extension, ExtensionContext } from '../../api/extension';
import { kTexFormat } from '../../api/raw';
import { markHighlightPlugin, markHighlightDecorations } from '../../api/mark-highlight';
import { MarkTransaction } from '../../api/transaction';
import { domAttrNoSpelling, markIsActive, splitInvalidatedMarks } from '../../api/mark';
import { EditorCommandId, toggleMarkType } from '../../api/command';
import { texLength } from '../../api/tex';
import { MarkInputRuleFilter } from '../../api/input_rule';

import { kRawInlineFormat, kRawInlineContent, RawInlineInsertCommand } from './raw_inline';

const kTexPlaceholder = 'tex';

const extension = (context: ExtensionContext): Extension | null => {
  const { pandocExtensions } = context;

  if (!pandocExtensions.raw_tex) {
    return null;
  }

  return {
    marks: [
      {
        name: 'raw_tex',
        noInputRules: true,
        noSpelling: true,
        spec: {
          inclusive: true,
          excludes: 'formatting',
          attrs: {},
          parseDOM: [
            {
              tag: "span[class*='raw-tex']",
            },
          ],
          toDOM() {
            const attr = {
              class: 'raw-tex pm-fixedwidth-font pm-light-text-color',
            };
            return ['span', domAttrNoSpelling(attr)];
          },
        },
        pandoc: {
          readers: [
            {
              token: PandocTokenType.RawInline,
              mark: 'raw_tex',
              match: (tok: PandocToken) => {
                const format = tok.c[kRawInlineFormat];
                return format === kTexFormat;
              },
              getText: (tok: PandocToken) => {
                return tok.c[kRawInlineContent];
              },
            },
          ],
          writer: {
            priority: 1,
            write: (output: PandocOutput, _mark: Mark, parent: Fragment) => {
              output.writeRawMarkdown(parent);
            },
          },
        },
      },
    ],

    // insert command
    commands: (schema: Schema) => {
      return [new InsertInlineLatexCommand(schema)];
    },

    appendMarkTransaction: (schema: Schema) => {
      return [
        {
          name: 'remove-raw-tex-marks',
          filter: node => node.isTextblock && node.type.allowsMarkType(schema.marks.raw_tex),
          append: (tr: MarkTransaction, node: ProsemirrorNode, pos: number) => {
            splitInvalidatedMarks(tr, node, pos, texLength, schema.marks.raw_tex);
          },
        },
      ];
    },

    inputRules: (schema: Schema, filter: MarkInputRuleFilter) => {
      return [texInputRule(schema, filter)];
    },

    // plugin to add highlighting decorations
    plugins: (schema: Schema) => {
      // plugins to return
      const plugins: Plugin[] = [];

      // latex equation highlighting
      plugins.push(latexHighlightingPlugin(schema));

      // latex brace matching
      const braces = new Map([
        ['{', '}'],
        ['[', ']'],
      ]);
      plugins.push(
        inputRules({
          rules: [
            new InputRule(/(^|[^^\\])([{[])$/, (state: EditorState, match: RegExpMatchArray, start: number) => {
              if (markIsActive(state, schema.marks.raw_tex)) {
                const tr = state.tr;
                tr.insertText(match[2] + braces.get(match[2]));
                setTextSelection(start + match[1].length + 1)(tr);
                return tr;
              } else {
                return null;
              }
            }),
          ],
        }),
      );

      // return
      return plugins;
    },
  };
};

function texInputRule(schema: Schema, filter: MarkInputRuleFilter) {
  return new InputRule(/(^| )\\$/, (state: EditorState) => {
    const rawTexMark = schema.marks.raw_tex;

    if (state.selection.empty && toggleMarkType(rawTexMark)(state)) {
      // if there is no tex ahead of us or we don't pass the fitler (b/c marks that don't allow
      // input rules are active) then bail
      const $head = state.selection.$head;
      const texText = '\\' + $head.parent.textContent.slice($head.parentOffset);
      if (!texText.startsWith('\\ ')) {
        const texMatchLength = texLength(texText);
        if (texMatchLength === 0 || !filter(state, state.selection.from, state.selection.from + texMatchLength)) {
          return null;
        }
      }

      // create transaction
      const tr = state.tr;

      // insert tex backslash
      const mark = schema.marks.raw_tex.create();
      tr.addStoredMark(mark);
      tr.insertText('\\');

      // extend the mark to cover any valid tex that immediately follows the \
      const { parent, parentOffset } = tr.selection.$head;
      const text = parent.textContent.slice(parentOffset - 1);
      if (text.length > 0) {
        const length = texLength(text);
        if (length > 1) {
          const startTex = tr.selection.from - 1;
          tr.addMark(startTex, startTex + length, mark);
          return tr;
        }
      }

      // insert placeholder if it's a standalone \
      if (text === '\\' || text.startsWith('\\ ')) {
        tr.insertText(kTexPlaceholder);
        setTexSelectionAfterInsert(tr);
        return tr;
      }
    }

    // didn't find a valid context for a tex command
    return null;
  });
}

class InsertInlineLatexCommand extends RawInlineInsertCommand {
  constructor(schema: Schema) {
    super(EditorCommandId.TexInline, [], schema.marks.raw_tex, (tr: Transaction) => {
      const mark = schema.marks.raw_tex.create();
      const tex = '\\' + kTexPlaceholder;
      const node = schema.text(tex, [mark]);
      tr.replaceSelectionWith(node, false);
      setTexSelectionAfterInsert(tr);
    });
  }
}

function setTexSelectionAfterInsert(tr: Transaction) {
  tr.setSelection(
    new TextSelection(tr.doc.resolve(tr.selection.from - kTexPlaceholder.length), tr.doc.resolve(tr.selection.from)),
  );
}

const key = new PluginKey<DecorationSet>('latex-highlight');

export function latexHighlightingPlugin(schema: Schema) {
  return markHighlightPlugin(key, schema.marks.raw_tex, (text, _attrs, markRange) => {
    const kIdClass = 'pm-markup-text-color';
    return markHighlightDecorations(markRange, text, /\\[A-Za-z]+/g, kIdClass);
  });
}

export default extension;
