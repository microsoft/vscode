/*
 * list-indent.ts
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


import { liftTarget, ReplaceAroundStep, canJoin} from "prosemirror-transform"
import {Slice, Fragment, NodeType, Node, NodeRange} from "prosemirror-model"
import {Command, EditorState, Transaction} from "prosemirror-state"


// fork of https://github.com/ProseMirror/prosemirror-schema-list/blob/d017648e4f4472076599aa12ec839ae222e6e1b5/src/schema-list.ts#L173 
// to allow for inheriting the attributes of nodes that are lifted or sunk

/// Create a command to lift the list item around the selection up into
/// a wrapping list.
export function liftListItem(itemType: NodeType): Command {
  return function(state: EditorState, dispatch?: (tr: Transaction) => void) {
    const {$from, $to} = state.selection
    const range = $from.blockRange($to, node => node.childCount > 0 && node.firstChild!.type == itemType)
    if (!range) return false
    if (!dispatch) return true
    const node = $from.node(range.depth - 1);
    if (node.type == itemType) // Inside a parent list
      return liftToOuterList(state, dispatch, node, range)
    else // Outer list node
      return liftOutOfList(state, dispatch, range)
  }
}

/// Create a command to sink the list item around the selection down
/// into an inner list.
export function sinkListItem(itemType: NodeType): Command {
  return function(state, dispatch) {
    const {$from, $to} = state.selection
    const range = $from.blockRange($to, node => node.childCount > 0 && node.firstChild!.type == itemType)
    if (!range) return false
    const startIndex = range.startIndex
    if (startIndex == 0) return false
    const parent = range.parent, nodeBefore = parent.child(startIndex - 1)
    if (nodeBefore.type != itemType) return false

    if (dispatch) {
      const nestedBefore = nodeBefore.lastChild && nodeBefore.lastChild.type == parent.type
      const inner = Fragment.from(nestedBefore ? itemType.create() : null)
      const slice = new Slice(Fragment.from(itemType.create(null, Fragment.from(parent.type.create(parent.attrs, inner)))),
                            nestedBefore ? 3 : 1, 0)
      const before = range.start, after = range.end
      dispatch(state.tr.step(new ReplaceAroundStep(before - (nestedBefore ? 3 : 1), after,
                                                   before, after, slice, 1, true))
               .scrollIntoView())
    }
    return true
  }
}

function liftToOuterList(state: EditorState, dispatch: (tr: Transaction) => void, node: Node, range: NodeRange) {
  const tr = state.tr, end = range.end, endOfList = range.$to.end(range.depth)
  if (end < endOfList) {
    // There are siblings after the lifted items, which must become
    // children of the last item
    tr.step(new ReplaceAroundStep(end - 1, endOfList, end, endOfList,
                                  new Slice(Fragment.from(node.type.create(node.attrs, range.parent.copy())), 1, 0), 1, true))
    range = new NodeRange(tr.doc.resolve(range.$from.pos), tr.doc.resolve(endOfList), range.depth)
  }
  const target = liftTarget(range)
  if (target == null) return false
  tr.lift(range, target)
  const after = tr.mapping.map(end, -1) - 1
  if (canJoin(tr.doc, after)) tr.join(after)
  dispatch(tr.scrollIntoView())
  return true
}

function liftOutOfList(state: EditorState, dispatch: (tr: Transaction) => void, range: NodeRange) {
  const tr = state.tr, list = range.parent
  // Merge the list items into a single big item
  for (let pos = range.end, i = range.endIndex - 1, e = range.startIndex; i > e; i--) {
    pos -= list.child(i).nodeSize
    tr.delete(pos - 1, pos + 1)
  }
  const $start = tr.doc.resolve(range.start), item = $start.nodeAfter!
  if (tr.mapping.map(range.end) != range.start + $start.nodeAfter!.nodeSize) return false
  const atStart = range.startIndex == 0, atEnd = range.endIndex == list.childCount
  const parent = $start.node(-1), indexBefore = $start.index(-1)
  if (!parent.canReplace(indexBefore + (atStart ? 0 : 1), indexBefore + 1,
                         item.content.append(atEnd ? Fragment.empty : Fragment.from(list))))
    return false
  const start = $start.pos, end = start + item.nodeSize
  // Strip off the surrounding list. At the sides where we're not at
  // the end of the list, the existing list is closed. At sides where
  // this is the end, it is overwritten to its end.
  tr.step(new ReplaceAroundStep(start - (atStart ? 1 : 0), end + (atEnd ? 1 : 0), start + 1, end - 1,
                                new Slice((atStart ? Fragment.empty : Fragment.from(list.copy(Fragment.empty)))
                                          .append(atEnd ? Fragment.empty : Fragment.from(list.copy(Fragment.empty))),
                                          atStart ? 0 : 1, atEnd ? 0 : 1), atStart ? 0 : 1))
  dispatch(tr.scrollIntoView())
  return true
}
