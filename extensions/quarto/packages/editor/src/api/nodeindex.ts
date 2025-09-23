/*
 * nodeindex.ts
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
import { Transform, Step } from "prosemirror-transform";
import { Predicate, NodeWithPos, findChildren } from "prosemirror-utils";
import { traverseNodes, TraverseResult } from "./node-traverse";

const kVerifyIncrementalUpdate = true; // process.env.NODE_ENV !== "production"

/**
 * A NodeIndex is an immutable data structure that records and maintains a set
 * of NodeWithPos that you care about, based on a predicate function. If only a
 * small percent of nodes pass the predicate function, then maintaining a
 * NodeIndex should be faster than walking through the document (though it turns
 * out that walking the document is pretty fast too).
 * 
 * You create a NodeIndex using NodeIndex.create(predicate, doc), and then apply
 * transformations using NodeIndex#apply(tr).
 */
export class NodeIndex {

  private readonly doc: Node;
  private readonly predicate: Predicate;
  private readonly index: ReadonlyArray<NodeWithPos>;

  public static create(predicate: Predicate, doc: Node) {
    let index: NodeWithPos[] = [];
    if (predicate(doc)) {
      index.push({node: doc, pos: 0});
    }
    index = index.concat(findChildren(doc, predicate, true));

    return new NodeIndex(doc, predicate, index, true);
  }

  /**
   * @param doc The document that this NodeIndex reflects.
   * @param predicate Function that returns true for nodes that
   *   should be indexed.
   * @param index Array of NodeWithPos, ideally sorted by pos.
   * @param sorted Is the `index` array sorted by pos?
   */
  private constructor(doc: Node, predicate: Predicate, index: NodeWithPos[], sorted = false) {
    this.doc = doc;
    this.predicate = predicate;
    this.index = sorted ? index : index.concat().sort((a, b) => a.pos - b.pos);
  }

  public get length(): number {
    return this.index.length;
  }

  public getIndex(doc?: Node): ReadonlyArray<NodeWithPos> {
    if (doc) {
      if (!this.doc.eq(doc)) {
        throw new Error("Alignment error in NodeIndex#getIndex");
      }
    }
    return this.index;
  }

  public apply(t: Transform): NodeIndex {
    if (!t.before.eq(this.doc)) {
      throw new Error("Alignment error in NodeIndex#apply");
    }

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let ni: NodeIndex = this;
    for (let i = 0; i < t.steps.length; i++) {
      const oldDoc = t.docs[i];
      const newDoc = i + 1 < t.steps.length ? t.docs[i+1] : t.doc;
      ni = ni.doApply(t.steps[i], oldDoc, newDoc);
    }
    return ni;
  }

  private doApply(step: Step, _oldDoc: Node, newDoc: Node): NodeIndex {
    let newIndex: NodeWithPos[] = [];
    
    for (const nodeWithPos of this.index) {
      const result = step.getMap().mapResult(nodeWithPos.pos);
      if (!result.deleted) {
        if (result.pos === nodeWithPos.pos) {
          newIndex.push(nodeWithPos);
        } else {
          newIndex.push({node: nodeWithPos.node, pos: result.pos});
        }
      }
    }
    step.getMap().forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      traverseNodes(newDoc, newStart, newEnd, (node, pos) => {
        if (pos >= newStart && pos < newEnd) {
          // The start of the node is entirely inside the changed region; this
          // must be a new node
          if (this.predicate(node)) {
            newIndex.push({ node, pos });
          }
        } else {
          // Somewhat overlaps with the changed region; this may be a changed node
          for (let i = 0; i < newIndex.length; i++) {
            if (newIndex[i].pos === pos) {
              newIndex[i] = {node, pos};
              break;
            }
          }
        }
        return TraverseResult.Descend;
      });
    });

    newIndex.sort((a, b) => a.pos - b.pos);

    if (kVerifyIncrementalUpdate) {
      // This code is a slower, simpler version of the algorithm above. If
      // kVerifyIncrementalUpdate is enabled, we run both versions and compare
      // the results. Once we're sufficiently confident in the above algorithm
      // we can turn this off.

      const refIndex = NodeIndex.create(this.predicate, newDoc).getIndex();
      if (JSON.stringify(refIndex) !== JSON.stringify(newIndex)) {
        // tslint:disable-next-line: no-console
        console.error("NodeIndex corruption detected, this indicates a bug in NodeIndex.doApply!");
        // tslint:disable-next-line: no-console
        console.log(JSON.stringify(refIndex));
        // tslint:disable-next-line: no-console
        console.log(JSON.stringify(newIndex));
        // Recover. The concat() is necessary to get rid of the const-ness of
        // refIndex.
        newIndex = refIndex.concat();
      }
    }

    return new NodeIndex(newDoc, this.predicate, newIndex, true);
  }

  public subtract(other: NodeIndex, keyFn: (nodeWithPos: NodeWithPos) => string) {
    const otherLookup = new Map<string, boolean>();
    other.index.forEach(x => {
      otherLookup.set(keyFn(x), true);
    });

    return new NodeIndex(
      this.doc,
      this.predicate,
      this.index.filter(x => !otherLookup.has(keyFn(x))),
      true
    );
  }

  public intersect(other: NodeIndex, keyFn: (nodeWithPos: NodeWithPos) => string) {
    const otherLookup = new Map<string, boolean>();
    other.index.forEach(x => {
      otherLookup.set(keyFn(x), true);
    });

    return new NodeIndex(
      this.doc,
      this.predicate,
      this.index.filter(x => otherLookup.has(keyFn(x))),
      true
    );
  }

  public filter(keep: (nodeWithPos: NodeWithPos, index: number, array: ReadonlyArray<NodeWithPos>) => boolean) {
    return new NodeIndex(
      this.doc,
      this.predicate,
      this.index.filter(keep),
      true
    );
  }
}
