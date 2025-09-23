/*
 * node-traverse.ts
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

import { Node } from "prosemirror-model";

export enum TraverseResult {
  // Descend into children, if any
  Descend,
  // Continue to next sibling, skipping children
  Next,
  // Skip remaining siblings, continue at parent's sibling
  Up,
  // Stop traversal entirely
  End
}
export type TraverseFn = (node: Node, pos: number, parent: Node, index: number) => (TraverseResult | undefined | void);

// Traverse a node/doc within a span of positions. The given span need only
// overlap (not contain) a node for it to be included in the iteration.
//
// Versus other forms of iteration in prosemirror(-utils), traverseNodes is
// lazy and also provides a greater degree of flow control (see TraverseResult).
//
// It's OK for `from` to be negative and `to` to be larger than node.nodeSize.
//
// See also: Node.nodesBetween, prosemirror-utils' findChildren. 
export function traverseNodes(node: Node, from: number, to: number, fn: TraverseFn, debug = false) {
  if (debug) {
    // tslint:disable-next-line: no-console
    console.log(`Traversing ${node.type.name} in the range [${from}-${to}]`);
  }
  traverseNodesImpl(node, from, to, fn, 0, null, debug);
}

function traverseNodesImpl(node: Node, from: number, to: number, fn: TraverseFn,
  offset: number, _parent: Node | null, debug: boolean) : boolean {
  let pos = 0;

  for (let i = 0; i < node.content.childCount; i++) {
    const child = node.content.child(i);  
    const endPos = pos + child.nodeSize;

    if (debug) {
      // tslint:disable-next-line: no-console
      console.log(`${child.type.name} [${offset+pos}-${offset+endPos}]`);
      // tslint:disable-next-line: no-console
      console.log(`offset: ${offset}, condition: ${pos} < ${to} && ${endPos} > ${from}`);
    }

    // Don't look at nodes that fall outside of the desired range
    if (pos < to && endPos > from) {
      // Invoke the callback; the default action is Descend.
      const result = fn(child, offset + pos, node, i) || TraverseResult.Descend;

      if (result === TraverseResult.Descend) {
        // The from, to, and offset all have to be modified to be relative
        // to the child.
        if (child.content.childCount) {
          const childContentPos = pos + 1;
          if (!traverseNodesImpl(child, from - childContentPos, to - childContentPos, fn, offset + childContentPos, node, debug)) {
            // Stop all traversal
            return false;
          }
        }
      } else if (result === TraverseResult.Next) {
        // Do nothing
      } else if (result === TraverseResult.Up) {
        // Stop iterating at this level, but let parent keep going
        return true;
      } else if (result === TraverseResult.End) {
        // Stop all traversal
        return false;
      } else {
        throw new Error("Unexpected TraverseResult value");
      }
    }

    pos = endPos;
  }

  return true;
}
