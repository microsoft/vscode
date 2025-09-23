/*
 * select_all.ts
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
import { EditorState, Transaction, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { findBlockNodes, ContentNodeWithPos } from 'prosemirror-utils';

import { Extension } from '../api/extension';
import { ProsemirrorCommand, EditorCommandId } from '../api/command';
import { editingRootNode } from '../api/node';

const extension: Extension = {
  commands: () => {
    return [new ProsemirrorCommand(EditorCommandId.SelectAll, ['Mod-a'], selectAll)];
  },
};

export function selectAll(state: EditorState, dispatch?: (tr: Transaction) => void, view?: EditorView) {
  if (dispatch) {
    const editingRoot = editingRootNode(state.selection);
    if (editingRoot) {
      const schema = state.schema;
      const tr = state.tr;
      if (editingRoot.node.type === schema.nodes.note) {
        tr.setSelection(childBlocksSelection(tr.doc, editingRoot));
      } else {
        const start = tr.doc.resolve(editingRoot.pos);
        const end = tr.doc.resolve(editingRoot.pos + editingRoot.node.nodeSize);
        tr.setSelection(new TextSelection(start, end));
      }
      dispatch(tr);
      if (view) {
        // we do this to escape from embedded editors e.g. codemirror
        view.focus();
      }
    }
  }
  return true;
}

function childBlocksSelection(doc: ProsemirrorNode, parent: ContentNodeWithPos) {
  const blocks = findBlockNodes(parent.node);
  const begin = parent.start + blocks[0].pos + 1;
  const lastBlock = blocks[blocks.length - 1];
  const end = parent.start + lastBlock.pos + lastBlock.node.nodeSize;
  return TextSelection.create(doc, begin, end);
}

export default extension;
