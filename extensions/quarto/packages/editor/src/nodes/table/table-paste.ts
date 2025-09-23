/*
 * table-paste.ts
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

import { Plugin, PluginKey, Transaction, EditorState } from 'prosemirror-state';
import { Slice, Node as ProsemirrorNode } from 'prosemirror-model';
import { EditorView } from 'prosemirror-view';

import { sliceHasNode } from '../../api/slice';

import { fixupTableWidths } from './table-columns';
import { forChangedNodes } from '../../api/transaction';

import { kDefaultCellClasses } from './table-nodes';

export function tablePaste() {
  return new Plugin({
    key: new PluginKey('table-paste'),
    props: {
      handlePaste: (view: EditorView, _event: Event, slice: Slice) => {
        // if the slice contains a table then we handle it
        if (sliceHasNode(slice, node => node.type === node.type.schema.nodes.table)) {
          // based on https://github.com/ProseMirror/prosemirror-view/blob/fb799aae4e9dd5cfc256708a6845d76aaaf145bf/src/input.js#L503-L510
          const tr = view.state.tr.replaceSelection(slice);
          view.dispatch(
            tr
              .scrollIntoView()
              .setMeta('paste', true)
              .setMeta('tablePaste', true)
              .setMeta('uiEvent', 'paste'),
          );
          view.dispatch(fixupTableWidths(view)(view.state.tr));
          return true;
        } else {
          return false;
        }
      },
    },
    appendTransaction: (transactions: readonly Transaction[], oldState: EditorState, newState: EditorState) => {
      // alias schema
      const schema = newState.schema;

      // only process table paste transactions
      if (!transactions.some(transaction => transaction.getMeta('tablePaste'))) {
        return null;
      }

      // cleanup table by converting the first row to header cells, ensuring that column alignments
      // are derived from the alignment of the first row, and applying the standard cell class names
      const tr = newState.tr;
      forChangedNodes(
        oldState,
        newState,
        node => node.type === node.type.schema.nodes.table,
        (node, pos) => {
          let firstRow: ProsemirrorNode;
          let currentColumn = 0;
          const columnAlignments: string[] = [];

          node.descendants((childNode, childPos, parent) => {
            // if this is a row then reset the current column to 0
            if (childNode.type === schema.nodes.table_row) {
              currentColumn = 0;
            }

            // first thing we will encounter in traveral is the first row, note that and move along to cells
            if (!firstRow) {
              // note first row
              firstRow = childNode;

              // children of the first row are the headers
            } else if (parent === firstRow) {
              // collect alignment (will be applied below to cells in this column)
              columnAlignments.push(childNode.attrs.align);

              // convert to a table header w/ default class
              const headerPos = pos + 1 + childPos;
              tr.setNodeMarkup(headerPos, undefined, {
                ...childNode.attrs,
                className: kDefaultCellClasses,
              });

              // normal cell - apply the requisite alignment and give it the default class
            } else if (childNode.type === schema.nodes.table_cell) {
              // determine alignment
              const align = columnAlignments[currentColumn] || null;

              // apply markup
              const cellPos = pos + 1 + childPos;
              tr.setNodeMarkup(cellPos, schema.nodes.table_cell, {
                ...childNode.attrs,
                align,
                className: kDefaultCellClasses,
              });
            }

            // if this is a cell then advance the current column
            if (childNode.type === schema.nodes.table_header || childNode.type === schema.nodes.table_cell) {
              currentColumn++;
            }
          });
        },
      );

      if (tr.docChanged) {
        return tr;
      } else {
        return null;
      }
    },
  });
}
