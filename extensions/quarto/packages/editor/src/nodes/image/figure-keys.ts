/*
 * figure-keys.ts
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

import { Schema } from 'prosemirror-model';
import { EditorState, Transaction, NodeSelection, Selection, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';

import {
  findParentNodeOfTypeClosestToPos,
  setTextSelection,
  ContentNodeWithPos,
  findParentNodeOfType,
  findParentNodeClosestToPos,
  NodeWithPos,
} from 'prosemirror-utils';

import { BaseKey } from '../../api/basekeys';
import { exitNode } from '../../api/command';
import { verticalArrowCanAdvanceWithinTextBlock } from '../../api/cursor';
import { findSelectedNodeOfType } from '../../api/node';

export function figureKeys(schema: Schema) {
  return [
    { key: BaseKey.Enter, command: exitNode(schema.nodes.figure, -1, false) },
    { key: BaseKey.Backspace, command: backspaceHandler() },
    { key: BaseKey.ArrowLeft, command: figureArrowHandler('left') },
    { key: BaseKey.ArrowRight, command: figureArrowHandler('right') },
    { key: BaseKey.ArrowUp, command: figureArrowHandler('up') },
    { key: BaseKey.ArrowDown, command: figureArrowHandler('down') },
  ];
}

function backspaceHandler() {
  return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
    // must be an empty selection
    const selection = state.selection;
    if (!selection.empty) {
      return false;
    }

    // must be a selection at the beginning of it's parent
    const schema = state.schema;
    const { $head } = state.selection;
    const { parentOffset } = $head;
    if (parentOffset !== 0) {
      return false;
    }

    // two scenarios: backspace within empty caption or backspace right after figure
    const isWithinEmptyCaption = $head.parent.type === schema.nodes.figure && $head.parent.childCount === 0;
    if (isWithinEmptyCaption) {
      if (dispatch) {
        // set a node selection for the figure
        const tr = state.tr;
        tr.setSelection(NodeSelection.create(tr.doc, $head.pos - 1));
        dispatch(tr);
      }
      return true;
    } else {
      // check if the previous node is a figure
      const parent = $head.node($head.depth - 1);
      const parentIndex = $head.index($head.depth - 1);
      if (parentIndex > 0) {
        const previousNode = parent.child(parentIndex - 1);
        if (previousNode.type === schema.nodes.figure) {
          if (dispatch) {
            const tr = state.tr;

            // if the current node is and empty textblock then remove it
            if ($head.node().childCount === 0) {
              const parentTextBlock = findParentNodeClosestToPos($head, node => node.isTextblock);
              if (parentTextBlock) {
                tr.deleteRange(parentTextBlock.pos, parentTextBlock.pos + parentTextBlock.node.nodeSize);
              }
            }

            const nodePos = $head.pos - previousNode.nodeSize - 1;
            const figureSelection = NodeSelection.create(tr.doc, nodePos);
            tr.setSelection(figureSelection);
            dispatch(tr);
          }
          return true;
        }
      }
    }

    return false;
  };
}

function figureArrowHandler(dir: 'up' | 'down' | 'left' | 'right') {
  return (state: EditorState, dispatch?: (tr: Transaction) => void, view?: EditorView) => {
    // select figure
    const selectFigure = (figure: ContentNodeWithPos) => {
      if (dispatch) {
        const tr = state.tr;
        const figureSelection = NodeSelection.create(state.doc, figure.pos);
        tr.setSelection(figureSelection).scrollIntoView();
        dispatch(tr);
      }
    };

    // select figure caption
    const selectFigureCaption = (figure: NodeWithPos, atEnd = false) => {
      if (dispatch) {
        const tr = state.tr;
        setTextSelection(figure.pos + (atEnd ? figure.node.textContent.length + 1 : 0), 1)(tr);
        dispatch(tr);
      }
    };

    // alias schema and selection
    const { schema, selection } = state;

    // down/right arrow for node selection w/ caption drives cursor into caption
    if (
      (dir === 'down' || dir === 'right') &&
      selection instanceof NodeSelection &&
      selection.node.type === schema.nodes.figure
    ) {
      const figure = findSelectedNodeOfType(schema.nodes.figure,selection);
      if (figure && figure.node.childCount > 0) {
        selectFigureCaption(figure);
        return true;
      }
    }

    // up/left arrow for selection in caption takes us back to the node selection
    if (
      (dir === 'up' || dir === 'left') &&
      selection instanceof TextSelection &&
      !!findParentNodeOfType(schema.nodes.figure)(selection)
    ) {
      if (dir === 'up' || (dir === 'left' && selection.$head.parentOffset === 0)) {
        const figure = findParentNodeOfType(schema.nodes.figure)(selection);
        if (figure) {
          selectFigure(figure);
          return true;
        }
      }

      // normal node traversal
    } else if (selection.empty && view && view.endOfTextblock(dir)) {
      // compute side offset
      const side = dir === 'left' || dir === 'up' ? -1 : 1;

      // get selection head
      const { $head } = selection;

      // see if this would traverse our type
      const nextPos = Selection.near(state.doc.resolve(side > 0 ? $head.after() : $head.before()), side);
      if (nextPos.$head) {
        const figure = findParentNodeOfTypeClosestToPos(nextPos.$head, schema.nodes.figure);
        if (figure) {
          // check for e.g. math where you can advance across embedded newlines
          if ((dir === 'up' || dir === 'down') && verticalArrowCanAdvanceWithinTextBlock(state.selection, dir)) {
            return false;
          }
          // arrowing back into a figure with a caption selects the caption
          if (side === -1 && figure.node.childCount > 0) {
            selectFigureCaption(figure, dir === 'left');
            // otherwise select the figure
          } else {
            selectFigure(figure);
          }
          return true;
        }
      }
    }

    // not handled
    return false;
  };
}
