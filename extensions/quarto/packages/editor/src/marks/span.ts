/*
 * span.ts
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

import { Mark, Fragment, DOMOutputSpec, Attrs } from 'prosemirror-model';
import { EditorState, Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';

import { ExtensionContext } from '../api/extension';
import { ProsemirrorCommand, EditorCommandId } from '../api/command';
import { EditorUI } from '../api/ui-types';
import { markIsActive, getMarkAttrs, getSelectionMarkRange } from '../api/mark';
import { PandocOutput, PandocTokenType, PandocToken } from '../api/pandoc';
import {
  pandocAttrSpec,
  pandocAttrReadAST,
  pandocAttrParseDom,
  pandocAttrToDomAttr,
  kSpanAttr,
  kSpanChildren
} from '../api/pandoc_attr';

const extension = (context: ExtensionContext) => {
  const { pandocExtensions, ui } = context;

  if (!pandocExtensions.bracketed_spans && !pandocExtensions.native_spans) {
    return null;
  }

  return {
    marks: [
      {
        name: 'span',
        spec: {
          attrs: pandocAttrSpec,
          inclusive: false,
          parseDOM: [
            {
              tag: 'span[data-span="1"]',
              getAttrs(dom: Node | string) {
                const attrs: Attrs = { 'data-span': 1 };
                return {
                  ...attrs,
                  ...pandocAttrParseDom(dom as Element, attrs),
                };
              },
            },
          ],
          toDOM(mark: Mark): DOMOutputSpec {
            const attr = {
              'data-span': '1',
              ...pandocAttrToDomAttr({
                ...mark.attrs,
                classes: [...mark.attrs.classes, 'pm-span pm-span-background-color'],
              }),
            };
            return ['span', attr];
          },
        },
        pandoc: {
          readers: [
            {
              token: PandocTokenType.Span,
              mark: 'span',
              getAttrs: (tok: PandocToken) => {
                return pandocAttrReadAST(tok, kSpanAttr);
              },
              getChildren: (tok: PandocToken) => tok.c[kSpanChildren],
            },
          ],
          writer: {
            priority: 12,
            write: (output: PandocOutput, mark: Mark, parent: Fragment) => {
              output.writeToken(PandocTokenType.Span, () => {
                output.writeAttr(mark.attrs.id, mark.attrs.classes, mark.attrs.keyvalue);
                output.writeArray(() => {
                  output.writeInlines(parent);
                });
              });
            },
          },
        },
      },
    ],

    commands: () => {
      return [new SpanCommand(ui)];
    },
  };
};

class SpanCommand extends ProsemirrorCommand {
  constructor(ui: EditorUI) {
    super(EditorCommandId.Span, [], (state: EditorState, dispatch?: (tr: Transaction) => void, view?: EditorView) => {
      const schema = state.schema;

      // if there is no contiguous selection and no existing span mark active
      // then the command should be disabled (unknown what the span target is)
      if (!markIsActive(state, schema.marks.span) && state.selection.empty) {
        return false;
      }

      // if the current node doesn't allow this mark return false
      if (!state.selection.$from.node().type.allowsMarkType(schema.marks.span)) {
        return false;
      }

      async function asyncEditSpan() {
        if (dispatch) {
          let attr: Attrs = { id: null, classes: [], keyvalue: [] };
          if (markIsActive(state, schema.marks.span)) {
            attr = getMarkAttrs(state.doc, state.selection, schema.marks.span);
          }
          const result = await ui.dialogs.editSpan(attr);
          if (result) {
            const tr = state.tr;
            const range = getSelectionMarkRange(state.selection, schema.marks.span);
            tr.removeMark(range.from, range.to, schema.marks.span);
            if (result.action === 'edit') {
              const mark = schema.marks.span.create(result.attr);
              tr.addMark(range.from, range.to, mark);
            }
            dispatch(tr);
          }
        }
        if (view) {
          view.focus();
        }
      }
      asyncEditSpan();

      return true;
    });
  }
}

export default extension;
