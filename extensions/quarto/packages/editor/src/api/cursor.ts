/*
 * cursor.ts
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

import { EditorState, Transaction, NodeSelection, Selection } from 'prosemirror-state';
import { GapCursor } from 'prosemirror-gapcursor';
import { EditorView } from 'prosemirror-view';

export function codeViewArrowHandler(dir: 'up' | 'down' | 'left' | 'right', codeViewNodeTypes: string[]) {
  return (state: EditorState, dispatch?: (tr: Transaction) => void, view?: EditorView) => {
    if (state.selection.empty && !(state.selection instanceof GapCursor) && view && view.endOfTextblock(dir)) {
      const side = dir === 'left' || dir === 'up' ? -1 : 1;
      const $head = state.selection.$head;
      const nextPos = Selection.near(state.doc.resolve(side > 0 ? $head.after() : $head.before()), side);
      if (nextPos.$head && codeViewNodeTypes.includes(nextPos.$head.parent.type.name)) {
        // check for e.g. math where you can advance across embedded newlines
        if ((dir === 'up' || dir === 'down') && verticalArrowCanAdvanceWithinTextBlock(state.selection, dir)) {
          return false;
        }
        if (dispatch) {
          dispatch(state.tr.setSelection(nextPos));
        }
        return true;
      }
    }
    return false;
  };
}


export function verticalArrowCanAdvanceWithinTextBlock(selection: Selection, dir: 'up' | 'down') {
  const $head = selection.$head;
  const node = $head.node();
  if (node.isTextblock) {
    const cursorOffset = $head.parentOffset;
    const nodeText = node.textContent;
    if (dir === 'down' && nodeText.substr(cursorOffset).includes('\n')) {
      return true;
    }
    if (dir === 'up' && nodeText.substr(0, cursorOffset).includes('\n')) {
      return true;
    }
  }
  return false;
}

export function handleArrowToAdjacentNode(
  nodePos: number,
  dir: number,
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
): boolean {
  // resolve the node and position
  const node = state.doc.nodeAt(nodePos);
  if (!node) {
    return false;
  }
  const $pos = state.doc.resolve(nodePos);

  // helpers to figure out the nature of prev/next nodes
  const prevNodeSelectable = () => {
    return $pos.nodeBefore && $pos.nodeBefore.type.spec.selectable;
  };
  const nextNodeSelectable = () => {
    const nextNode = state.doc.nodeAt(nodePos + node.nodeSize);
    return nextNode?.type.spec.selectable;
  };
  const prevNodeTextBlock = () => {
    return $pos.nodeBefore && $pos.nodeBefore.isTextblock;
  };
  const nextNodeTextBlock = () => {
    const nextNode = state.doc.nodeAt(nodePos + node.nodeSize);
    return nextNode?.isTextblock;
  };
  const prevNodeCode = () => {
    return $pos.nodeBefore && !!$pos.nodeBefore.type.spec.code;
  };
  const nextNodeCode = () => {
    const nextNode = state.doc.nodeAt(nodePos + node.nodeSize);
    return !!nextNode?.type.spec.code;
  };

  // see if we can get a new selection
  const tr = state.tr;
  let selection: Selection | undefined;

  // if we are going backwards and there is no previous position, then return a gap cursor
  if (dir < 0 && !$pos.nodeBefore) {
    selection = new GapCursor(tr.doc.resolve(nodePos));

    // if we are going forwards and there is no next position, then return a gap cursor
  } else if (dir > 0 && !$pos.nodeAfter) {
    const cursorPos = nodePos + node.nodeSize;
    selection = new GapCursor(tr.doc.resolve(cursorPos));

    // if we are going backwards and the previous node can take node selections then select it
  } else if (dir < 0 && prevNodeSelectable()) {
    const prevNodePos = nodePos - $pos.nodeBefore!.nodeSize;
    selection = NodeSelection.create(tr.doc, prevNodePos);

    // if we are going forwards and the next node can take node selections then select it
  } else if (dir >= 0 && nextNodeSelectable()) {
    const nextNodePos = nodePos + node.nodeSize;
    selection = NodeSelection.create(tr.doc, nextNodePos);

    // if we are going backwards and the previous node is not a text block then create a gap cursor
  } else if (dir < 0 && (!prevNodeTextBlock() || prevNodeCode())) {
    selection = new GapCursor(tr.doc.resolve(nodePos));

    // if we are going forwards and the next node is not a text block then create a gap cursor
  } else if (dir >= 0 && (!nextNodeTextBlock() || nextNodeCode())) {
    const endPos = nodePos + node.nodeSize;
    selection = new GapCursor(tr.doc.resolve(endPos));

    // otherwise use text selection handling (handles forward/backward text selections)
  } else {
    const targetPos = nodePos + (dir < 0 ? 0 : node.nodeSize);
    const targetNode = tr.doc.nodeAt(targetPos);
    if (targetNode) {
      selection = Selection.near(tr.doc.resolve(targetPos), dir);
    }
  }

  if (selection) {
    if (dispatch) {
      tr.setSelection(selection);
      dispatch(tr);
    }
    return true;
  } else {
    return false;
  }
}
