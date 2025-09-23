/*
 * definition_list-insert.ts
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

import { Node as ProsemirrorNode } from 'prosemirror-model';
import { Transaction } from 'prosemirror-state';
import { setTextSelection } from 'prosemirror-utils';
import { findChildrenByType } from 'prosemirror-utils';
import { trTransform } from '../../api/transaction';
import { Transform } from 'prosemirror-transform';

export function insertDefinitionList(tr: Transaction, items: ProsemirrorNode[]) {
  const schema = items[0].type.schema;
  const definitionList = schema.nodes.definition_list.createAndFill({}, items)!;
  const prevCursor = tr.selection.to;
  tr.replaceSelectionWith(definitionList);
  setTextSelection(tr.mapping.map(prevCursor) - 1, -1)(tr).scrollIntoView();
  return tr;
}

export function insertDefinitionListAppendTransaction() {
  return {
    name: 'definition-list-join',
    nodeFilter: (node: ProsemirrorNode) => node.type === node.type.schema.nodes.definition_list,
    append: (tr: Transaction) => {
      // if a transaction creates 2 adjacent definition lists then join them
      trTransform(tr, joinDefinitionListsTransform);
    },
  };
}

function joinDefinitionListsTransform(tr: Transform) {
  const nodeType = tr.doc.type.schema.nodes.definition_list;
  const lists = findChildrenByType(tr.doc, nodeType, true);
  for (const list of lists) {
    // NOTE: no mapping (checking for deletion + getting the updated
    // position) is required here because we only ever do one transform
    // (see return after tr.join below)
    const listPos = tr.doc.resolve(list.pos + 1);
    const listIndex = listPos.index(listPos.depth - 1);
    const listParent = listPos.node(listPos.depth - 1);
    if (listIndex + 1 < listParent.childCount) {
      const nextNode = listParent.child(listIndex + 1);
      if (nextNode.type === nodeType) {
        tr.join(list.pos + list.node.nodeSize);
        return;
      }
    }
  }
}
