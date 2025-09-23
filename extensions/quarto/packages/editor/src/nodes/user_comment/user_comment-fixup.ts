/*
 * user_comment-fixup.ts
 *
 * Copyright (C) 2019-20 by RStudio, PBC
 *
 * Unless you have received this program directly from RStudio pursuant
 * to the terms of a commercial license agreement with RStudio, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */

import { Node, Schema, Slice, Fragment, NodeType } from "prosemirror-model";
import { Transaction, EditorState } from "prosemirror-state";
import { Step, ReplaceStep } from "prosemirror-transform";
import { NodeWithPos, findChildren } from "prosemirror-utils";
import { findOneNode } from "../../api/node";
import { traverseNodes, TraverseResult } from "../../api/node-traverse";
import { getUserCommentNodeCache, getUserCommentNodePairs } from "./user_comment-cache";
import { UserCommentPluginKey } from "./user_comment-constants";
import { trTransform } from "../../api/transaction";

export function userCommentBlocksToInlineFixup(schema: Schema) {

  return (tr: Transaction) => {

    // Pandoc serializes comments at the beginning of paragraphs
    // (and other blocks) as standalone blocks. This isn't what
    // we want; instead, transform comment blocks to inline blocks.

    // This happens in two phases. The first part is during the
    // user_comment_(begin|end).pandoc.reader.handler call; each
    // comment begin/end block is interpreted instead as a para
    // with a synthetic:true attribute, and the inline comment node
    // as its only child. The second phase is this fixup function,
    // where we detect such para/comment combos; the inner node is
    // moved to the next valid place for text to appear, and the
    // wrapper paragraph is deleted.

    // Because our input is a Transaction that may already have
    // changes, we'll use a dedicated Transform instance based off
    // that transaction's (end) state. This allows us to deal with
    // the problem of mutating the doc we're iterating over; we'll
    // iterate over a fixed doc, but map each new action through
    // the set of previous actions (i.e. since the creation of this
    // Transform instance).

    function isBlockComment(node: Node) {
      return node.type === schema.nodes.paragraph &&
        node.attrs.synthetic &&
        node.childCount === 1 &&
        (node.firstChild!.type === schema.nodes.user_comment_begin ||
          node.firstChild!.type === schema.nodes.user_comment_end);
    }

    return trTransform(tr, newActions => {
      // First, find all block-type comment nodes.
      for (const {pos, node} of findChildren(tr.doc, isBlockComment, true)) {
        const commentNode = node.firstChild!;
  
        // Where is this comment, in the post-mutation doc?
        const mappedPos = newActions.mapping.mapResult(pos, 1);
        const mappedEnd = newActions.mapping.mapResult(pos + node.nodeSize, 1);
        if (mappedPos.deleted) {
          // This comment has already been deleted; just continue.
          // (This probably can't happen, since comments don't nest.)
          continue;
        }
        if (mappedEnd.deleted) {
          // Hmmm, don't think we can get into this state. But if we do,
          // there's probably nothing safe we can do here.
          throw new Error("During block comment fixup, mappedEnd was deleted");
        }
  
        // Now find somewhere to insert the inline node. Currently, we
        // just find the next text node in document order, regardless
        // of depth. Note that we're traversing the post-mutation doc,
        // so no need to map positions.
        // TODO: If we're fixing up a comment end node, should we go backward?
        traverseNodes(newActions.doc, mappedEnd.pos, Infinity,
          (node2, pos2) => {
            if (node2.isText) {
              // We've found a suitable place for the comment!
              newActions.insert(pos2, [commentNode]);
  
              // Delete the synthetic paragraph
              newActions.deleteRange(mappedPos.pos, mappedEnd.pos);
  
              // Prevent plugin logic from trying to fix up our
              // transaction as if we're a copy-and-paste.
              tr.setMeta(UserCommentPluginKey, true);
  
              // Don't continue the traversal
              return TraverseResult.End;
            } else {
              // Keep searching
              return TraverseResult.Descend;
            }
          }
        );
      }
    });
  };
}

export function userCommentAppendTransaction(schema: Schema, getId: () => string) {
  // Give this inner function a name so it shows up in profiler traces
  return function userCommentAppendTransactionImpl(transactions: readonly Transaction[], _oldState: EditorState, newState: EditorState) {
    // This will store our new actions
    let newSteps: Array<Step | null | undefined> = [];

    const newStateNodeIndex = getUserCommentNodeCache(newState);

    for (const transaction of transactions) {
      for (let i = 0; i < transaction.steps.length; i++) {
        const step = transaction.steps[i];
        const oldDoc = transaction.docs[i];
        const newDoc = (i+1 === transaction.docs.length) ? transaction.doc : transaction.docs[i + 1];

        // This MUST happen even if we exit early
        newSteps = newSteps.map(x => x!.map(step.getMap())).filter((value) => !!value);

        if (transaction.getMeta(UserCommentPluginKey)) {
          // Never try to fixup if it's one of our own commands that
          // caused this
          continue;
        }

        if (transaction.getMeta("history$")) {
          // Never try to fixup if we're undoing/redoing
          continue;
        }

        // eslint-disable-next-line
        step.getMap().forEach((fromA, toA, fromB, toB) => {

          const removedBeginNodes: {[key: string]: NodeWithPos} = {};
          const removedEndNodes: {[key: string]: NodeWithPos} = {};
          const addedBeginNodes: {[key: string]: NodeWithPos} = {};
          const addedEndNodes: {[key: string]: NodeWithPos} = {};

          oldDoc.nodesBetween(fromA, toA, (node, pos) => {
            if (node.type === schema.nodes.user_comment_begin) {
              removedBeginNodes[node.attrs.threadId] = {pos, node};
            } else if (node.type === schema.nodes.user_comment_end) {
              removedEndNodes[node.attrs.threadId] = {pos, node};
            }

            return true;
          });
          newDoc.nodesBetween(fromB, toB, (node, pos) => {
            if (node.type === schema.nodes.user_comment_begin) {
              if (removedBeginNodes[node.attrs.threadId]) {
                delete removedBeginNodes[node.attrs.threadId];
              } else {
                addedBeginNodes[node.attrs.threadId] = {pos, node};
              }
            } else if (node.type === schema.nodes.user_comment_end) {
              if (removedEndNodes[node.attrs.threadId]) {
                delete removedEndNodes[node.attrs.threadId];
              } else {
                addedEndNodes[node.attrs.threadId] = {pos, node};
              }
            }
            return true;
          });

          function removeCommentNodeByPos(doc: Node, nodeType: NodeType, pos: number): Step {
            const node = doc.nodeAt(pos)!;
            if (node.type !== nodeType) {
              throw new Error(`Assertion failure: Unexpected node type ${doc.nodeAt(pos)!.type} when removing comment`);
            }
            return new ReplaceStep(pos, pos + node.nodeSize, Slice.empty, false);
          }

          // Whole removed, that's fine.
          // const removedBothIds = intersectKeys(removedBeginNodes, removedEndNodes);

          // Unmatched begin was removed, must put it right back.
          const removedBeginIds = diffKeys(removedBeginNodes, removedEndNodes);
          // Unmatched end was removed, must put it right back.
          const removedEndIds = diffKeys(removedEndNodes, removedBeginNodes);

          // Whole comment was added; keep, but replace the threadId.
          const addedBothIds = intersectKeys(addedBeginNodes, addedEndNodes);
          // Unmatched begin was added, must remove it.
          const addedBeginIds = diffKeys(addedBeginNodes, addedEndNodes);
          // Unmatched end was added, must remove it.
          const addedEndIds = diffKeys(addedEndNodes, addedBeginNodes);

          for (const id of removedBeginIds) {
            newSteps.push(new ReplaceStep(fromB, fromB, new Slice(Fragment.from(removedBeginNodes[id].node), 0, 0)));
          }
          for (const id of removedEndIds) {
            newSteps.push(new ReplaceStep(toB, toB, new Slice(Fragment.from(removedEndNodes[id].node), 0, 0)));
          }

          for (const id of addedBeginIds) {
            const node = addedBeginNodes[id]!;
            newSteps.push(removeCommentNodeByPos(newDoc, schema.nodes.user_comment_begin, node.pos));
          }
          for (const id of addedEndIds) {
            const node = addedEndNodes[id]!;
            newSteps.push(removeCommentNodeByPos(newDoc, schema.nodes.user_comment_end, node.pos));
          }

          for (const id of addedBothIds) {
            const {node: beginNode, pos: beginPos} = addedBeginNodes[id];
            const {node: endNode, pos: endPos} = addedEndNodes[id];

            const matches = newStateNodeIndex.filter(({node}) => {
              return node.type === schema.nodes.user_comment_begin &&
                node.attrs.threadId === beginNode.attrs.threadId;
            }).length;
            if (matches < 2) {
              // Don't reassign id if it's not a dupe (i.e. drag-and-drop move
              // of a whole comment)
              continue;
            }

            const newId = getId();
            const beginNodeNew = extendAttrs(beginNode, {threadId: newId});
            const endNodeNew = extendAttrs(endNode, {threadId: newId});

            newSteps.push(
              new ReplaceStep(beginPos, beginPos + beginNode.nodeSize, new Slice(Fragment.from(beginNodeNew), 0, 0))
            );
            newSteps.push(
              new ReplaceStep(endPos, endPos + endNode.nodeSize, new Slice(Fragment.from(endNodeNew), 0, 0))
            );
          }
        });
      }
    }

    const tr = newState.tr;
    tr.setMeta(UserCommentPluginKey, true);
    for (const step of newSteps) {
      if (step) {
        // Before applying the current new step, map it through all the previous
        // new steps (as embodied by `tr`).
        const mappedStep = step.map(tr.mapping);
        if (mappedStep) {
          tr.step(mappedStep);
        }
      }
    }
    
    // Now, look for any comments where the begin/end nodes have nothing between
    // them. These can be deleted.

    outer:
    for (;;) {
      // The NodeIndex is a snapshot of the doc before our newSteps were applied.
      // We'll need to apply those steps, and re-apply them whenever we add more.
      const cache = newStateNodeIndex.apply(tr);
      for (const {begin, end} of getUserCommentNodePairs(schema, cache)) {
        // Look for any text node. We'll have to revisit this if we ever allow
        // non-text selections to be marked for a comment (e.g. images).
        const containsText = !!findOneNode(tr.doc,
          begin.pos + begin.node.nodeSize,
          end.pos,
          node => node.isText);

        if (!containsText) {
          // This comment contains no text; delete it.
          tr.deleteRange(end.pos, end.pos + end.node.nodeSize);
          tr.deleteRange(begin.pos, begin.pos + begin.node.nodeSize);
          // It's possible we've just deleted an empty comment and in doing
          // so caused an enclosing comment to become empty. Start the
          // search over from the beginning, using the new state.
          continue outer;
        }
      }

      break;
    }

    return tr.docChanged ? tr : null;
  };
}

function diffKeys(a: {[key: string]: unknown}, b: {[key: string]: unknown}): string[] {
  const results = [];
  for (const key of Object.keys(a)) {
    if (!b[key]) {
      results.push(key);
    }
  }
  return results;
}

function intersectKeys(a: {[key: string]: unknown}, b: {[key: string]: unknown}): string[] {
  const results = [];
  for (const key of Object.keys(a)) {
    if (b[key]) {
      results.push(key);
    }
  }
  return results;
}

function extendAttrs(node: Node, attrs: { [key: string]: unknown }): Node {
  return node.type.createChecked(
    Object.assign({}, node.attrs, attrs),
    node.content,
    node.marks
  );
}
