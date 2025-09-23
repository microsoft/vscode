/*
 * selection.ts
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

import { Selection, NodeSelection } from 'prosemirror-state';
import { Schema } from 'prosemirror-model';
import { EditorView } from 'prosemirror-view';
import { GapCursor } from 'prosemirror-gapcursor';

import { NodeWithPos, setTextSelection } from 'prosemirror-utils';

import { kAddToHistoryTransaction, kRestoreLocationTransaction } from './transaction';
import { editingRootNode } from './node';

export function selectionIsWithin(selection: Selection, nodeWithPos: NodeWithPos) {
  const from = nodeWithPos.pos + 1;
  const to = from + nodeWithPos.node.nodeSize;
  return selectionIsWithinRange(selection, { from, to });
}

export function selectionHasRange(selection: Selection, range: { from: number; to: number }) {
  return selection.from === range.from && selection.to === range.to;
}

export function selectionIsWithinRange(selection: Selection, range: { from: number; to: number }) {
  return selection.anchor >= range.from && selection.anchor <= range.to;
}

export function selectionIsBodyTopLevel(selection: Selection) {
  const { $head } = selection;
  const parentNode = $head.node($head.depth - 1);
  return parentNode && 
         (parentNode.type === parentNode.type.schema.nodes.body ||
          (selection instanceof GapCursor && parentNode.type === parentNode.type.schema.nodes.doc));
}

export function selectionIsImageNode(schema: Schema, selection: Selection) {
  return selection instanceof NodeSelection && [schema.nodes.image, schema.nodes.figure].includes(selection.node.type);
}

export function selectionIsEmptyParagraph(schema: Schema, selection: Selection) {
  const { $head } = selection;
  return $head.parent.type === schema.nodes.paragraph && $head.parent.childCount === 0;
}

export function selectionWithinLastBodyParagraph(selection: Selection) {
  if (selectionIsBodyTopLevel(selection)) {
    const editingRoot = editingRootNode(selection);
    if (editingRoot) {
      const node = selection.$head.node();
      return node === editingRoot.node.lastChild && node.type === node.type.schema.nodes.paragraph;
    }
  }
  return false;
}

export function restoreSelection(view: EditorView, pos: number) {
  const tr = view.state.tr;
  if (pos < view.state.doc.nodeSize) {
    setTextSelection(pos)(tr);
    tr.setMeta(kAddToHistoryTransaction, false);
    tr.setMeta(kRestoreLocationTransaction, true);
    view.dispatch(tr);
  }
}
