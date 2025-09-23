/*
 * code.ts
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

import { Fragment, Mark, Node as ProsemirrorNode, Schema } from 'prosemirror-model';
import { EditorState, Transaction } from 'prosemirror-state';

import { MarkCommand, EditorCommandId, ProsemirrorCommand, toggleMarkType } from '../api/command';
import { setTextSelection } from 'prosemirror-utils';

import { Extension, ExtensionContext } from '../api/extension';
import { pandocAttrSpec, pandocAttrParseDom, pandocAttrToDomAttr, pandocAttrReadAST } from '../api/pandoc_attr';
import { PandocToken, PandocOutput, PandocTokenType } from '../api/pandoc';

import { kCodeText, kCodeAttr } from '../api/code';
import { delimiterMarkInputRule, MarkInputRuleFilter } from '../api/input_rule';
import { domAttrNoSpelling } from '../api/mark';
import { EditorUI } from '../api/ui-types';
import { OmniInsert, OmniInsertGroup } from '../api/omni_insert';

import { canInsertNode } from '../api/node';

const extension = (context: ExtensionContext): Extension => {
  const { pandocExtensions, ui, options } = context;

  const codeAttrs = pandocExtensions.inline_code_attributes;

  return {
    marks: [
      {
        name: 'code',
        noInputRules: true,
        noSpelling: true,
        spec: {
          group: 'formatting',
          attrs: codeAttrs ? pandocAttrSpec : {},
          parseDOM: [
            {
              tag: 'code',
              getAttrs(dom: Node | string) {
                if (codeAttrs) {
                  return pandocAttrParseDom(dom as Element, {});
                } else {
                  return {};
                }
              },
            },
          ],
          toDOM(mark: Mark) {
            const fontClass = 'pm-code pm-fixedwidth-font pm-chunk-background-color pm-block-border-color';
            const attrs = codeAttrs
              ? pandocAttrToDomAttr({
                  ...mark.attrs,
                  classes: [...mark.attrs.classes, fontClass],
                })
              : {
                  class: fontClass,
                };
            return ['code', domAttrNoSpelling(attrs)];
          },
        },
        pandoc: {
          readers: [
            {
              token: PandocTokenType.Code,
              mark: 'code',
              getText: (tok: PandocToken) => tok.c[kCodeText],
              getAttrs: (tok: PandocToken) => {
                if (codeAttrs) {
                  return pandocAttrReadAST(tok, kCodeAttr);
                } else {
                  return {};
                }
              },
            },
          ],
          writer: {
            // lowest possible mark priority since it doesn't call writeInlines
            // (so will 'eat' any other marks on the stack)
            priority: 0,
            write: (output: PandocOutput, mark: Mark, parent: Fragment) => {
              // collect code and trim it (pandoc will do this on parse anyway)
              let code = '';
              parent.forEach((node: ProsemirrorNode) => (code = code + node.textContent));
              code = code.trim();
              if (code.length > 0) {
                output.writeToken(PandocTokenType.Code, () => {
                  if (codeAttrs) {
                    output.writeAttr(mark.attrs.id, mark.attrs.classes, mark.attrs.keyvalue);
                  } else {
                    output.writeAttr();
                  }
                  output.write(code);
                });
              }
            },
          },
        },
      },
    ],

    commands: (schema: Schema) => {
      return [
        new MarkCommand(EditorCommandId.Code, ['Mod-d'], schema.marks.code),
        ...(!options.defaultCellTypePython ? [new InsertInlinCodeCommand(ui)] : [])
      ];
    },

    inputRules: (schema: Schema, filter: MarkInputRuleFilter) => {
      return [delimiterMarkInputRule('`', schema.marks.code, filter)];
    },
  };
};


export class InsertInlinCodeCommand extends ProsemirrorCommand {
  constructor(ui: EditorUI) {
    super(EditorCommandId.InlineRCode, [], insertInlineRCode, inlineRCodeOmniInsert(ui));
  }
}


function insertInlineRCode(state: EditorState, dispatch?: (tr: Transaction) => void) {
  // enable/disable command
  const schema = state.schema;
  if (!canInsertNode(state, schema.nodes.text) || !toggleMarkType(schema.marks.code)(state)) {
    return false;
  }

  if (dispatch) {
    const tr = state.tr;
    const prevSel = tr.selection;
    const mark = schema.marks.code.create();
    const node = schema.text("r ", [mark]);
    tr.insert(tr.selection.from, node);
    setTextSelection(tr.mapping.map(prevSel.from) , -1)(tr);
    dispatch(tr);
  }
  return true;
}

function inlineRCodeOmniInsert(ui: EditorUI): OmniInsert {
  return {
    name: ui.context.translateText('Inline R Code'),
    keywords: ["r"],
    description: ui.context.translateText('R code within a line or paragraph'),
    group: OmniInsertGroup.Content,
    priority: 2,
    image: () => (ui.prefs.darkMode() ? ui.images.omni_insert.r_chunk_dark : ui.images.omni_insert.r_chunk),
  };
}

export default extension;
