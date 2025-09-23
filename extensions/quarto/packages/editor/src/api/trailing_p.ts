/*
 * trailing_p.ts
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

import { Transaction, Selection } from 'prosemirror-state';
import { Node as ProsemirrorNode } from 'prosemirror-model';
import { Transform } from 'prosemirror-transform';
import { ContentNodeWithPos } from 'prosemirror-utils';

import { editingRootNode } from '../api/node';
import { trTransform } from '../api/transaction';
import { isParagraphNode } from '../api/paragraph';


export function insertTrailingP(tr: Transaction) {
  const editingNode = editingRootNode(tr.selection);
  if (editingNode) {
    trTransform(tr, insertTrailingPTransform(editingNode));
  }
}


export function requiresTrailingP(selection: Selection) {
  const editingRoot = editingRootNode(selection);
  if (editingRoot) {
    return !isParagraphNode(editingRoot.node.lastChild) || isDisplayMathNode(editingRoot.node.lastChild);
  } else {
    return false;
  }
}

function insertTrailingPTransform(editingNode: ContentNodeWithPos) {
  return (tr: Transform) => {
    const schema = editingNode.node.type.schema;
    tr.insert(editingNode.pos + editingNode.node.nodeSize - 1, schema.nodes.paragraph.create());
  };
}

function isDisplayMathNode(node: ProsemirrorNode | null | undefined) {
  if (node && node.firstChild) {
    return node.childCount === 1 && node.type.schema.marks.math?.isInSet(node.firstChild.marks);
  } else {
    return false;
  }
}
