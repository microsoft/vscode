/*
 * node.ts
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

import { Node as ProsemirrorNode, NodeSpec, NodeType, ResolvedPos } from 'prosemirror-model';
import { EditorState, Selection, NodeSelection, Transaction } from 'prosemirror-state';
import {
  findParentNode,
  NodeWithPos,
  findParentNodeOfType,
  findChildrenByType,
  findChildren,
  findParentNodeOfTypeClosestToPos,
  Predicate,
} from 'prosemirror-utils';

import { EditorView } from 'prosemirror-view';

import {
  PandocTokenReader,
  PandocNodeWriterFn,
  PandocPreprocessorFn,
  PandocBlockReaderFn,
  PandocInlineHTMLReaderFn,
  PandocTokensFilterFn,
  PandocMarkdownPostProcessorFn,
} from './pandoc';
import { PandocBlockCapsuleFilter } from './pandoc_capsule';

import { AttrEditOptions } from './attr_edit';
import { traverseNodes, TraverseResult } from './node-traverse';
import { CodeViewOptions } from './codeview';

export interface PandocNode {
  readonly name: string;
  readonly spec: NodeSpec;
  readonly code_view?: CodeViewOptions;
  readonly attr_edit?: () => AttrEditOptions | null;
  readonly pandoc: {
    readonly readers?: readonly PandocTokenReader[];
    readonly writer?: PandocNodeWriterFn;
    readonly preprocessor?: PandocPreprocessorFn;
    readonly tokensFilter?: PandocTokensFilterFn;
    readonly blockReader?: PandocBlockReaderFn;
    readonly inlineHTMLReader?: PandocInlineHTMLReaderFn;
    readonly blockCapsuleFilter?: PandocBlockCapsuleFilter;
    readonly markdownPostProcessor?: PandocMarkdownPostProcessorFn;
  };
}


export type NodeTraversalFn = (
  node: Node,
  pos: number,
  parent: Node,
  index: number,
) => boolean | void | null | undefined;

export function findTopLevelBodyNodes(doc: ProsemirrorNode, predicate: (node: ProsemirrorNode) => boolean) {
  const body = findChildrenByType(doc, doc.type.schema.nodes.body, false)[0];
  const offset = body.pos + 1;
  const nodes = findChildren(body.node, predicate, true);
  return nodes.map(value => ({ ...value, pos: value.pos + offset }));
}

export function findNodeOfTypeInSelection(selection: Selection, type: NodeType): NodeWithPos | undefined {
  return findSelectedNodeOfType(type, selection) || findParentNode((n: ProsemirrorNode) => n.type === type)(selection);
}

export function firstNode(parent: NodeWithPos, predicate: (node: ProsemirrorNode) => boolean) {
  let foundNode: NodeWithPos | undefined;
  parent.node.descendants((node, pos) => {
    if (!foundNode) {
      if (predicate(node)) {
        foundNode = {
          node,
          pos: parent.pos + 1 + pos,
        };
        return false;
      } else {
        return true;
      }
    } else {
      return false;
    }
  });
  return foundNode;
}

export function lastNode(parent: NodeWithPos, predicate: (node: ProsemirrorNode) => boolean) {
  let last: NodeWithPos | undefined;
  parent.node.descendants((node, pos) => {
    if (predicate(node)) {
      last = {
        node,
        pos: parent.pos + 1 + pos,
      };
    }
  });
  return last;
}

export function nodeIsActive(state: EditorState, type: NodeType, attrs = {}) {
  const predicate = (n: ProsemirrorNode) => n.type === type;
  const node = findSelectedNodeOfType(type,state.selection) || findParentNode(predicate)(state.selection);

  if (!Object.keys(attrs).length || !node) {
    return !!node;
  }

  return node.node.hasMarkup(type, attrs);
}

export function canInsertNode(context: EditorState | Selection, nodeType: NodeType) {
  const selection = asSelection(context);
  const $from = selection.$from;
  return canInsertNodeAtPos($from, nodeType);
}

export function canInsertNodeAtPos($pos: ResolvedPos, nodeType: NodeType) {
  for (let d = $pos.depth; d >= 0; d--) {
    const index = $pos.index(d);
    if ($pos.node(d).canReplaceWith(index, index, nodeType)) {
      return true;
    }
  }
  return false;
}

export function canInsertTextNode(context: EditorState | Selection) {
  const selection = asSelection(context);
  return canInsertNode(selection, selection.$head.parent.type.schema.nodes.text);
}

export function insertAndSelectNode(view: EditorView, node: ProsemirrorNode) {
  // create new transaction
  const tr = view.state.tr;

  // insert the node over the existing selection
  tr.ensureMarks(node.marks);
  tr.replaceSelectionWith(node);

  // set selection to inserted node (or don't if our selection calculate was off,
  // as can happen when we insert into a list bullet)
  const selectionPos = tr.doc.resolve(tr.mapping.map(view.state.selection.from, -1));
  const selectionNode = tr.doc.nodeAt(selectionPos.pos);
  if (selectionNode && selectionNode.type === node.type) {
    tr.setSelection(new NodeSelection(selectionPos));
  }

  // dispatch transaction
  view.dispatch(tr);
}

export function editingRootNode(selection: Selection) {
  const schema = selection.$head.node().type.schema;
  return findParentNodeOfType(schema.nodes.body)(selection) || findParentNodeOfType(schema.nodes.note)(selection);
}

export function editingRootNodeClosestToPos($pos: ResolvedPos) {
  const schema = $pos.node().type.schema;
  return (
    findParentNodeOfTypeClosestToPos($pos, schema.nodes.body) ||
    findParentNodeOfTypeClosestToPos($pos, schema.nodes.note)
  );
}

export function editingRootScrollContainerElement(view: EditorView) {
  const editingNode = editingRootNode(view.state.selection);
  if (editingNode) {
    const editingEl = view.domAtPos(editingNode.pos + 1).node;
    return editingEl.parentElement;
  } else {
    return undefined;
  }
}

export function setNodeAttrs(tr: Transaction, {pos, node}: NodeWithPos, attrs: { [key: string]: unknown }) {
  return tr.setNodeMarkup(
    pos, node.type,
    Object.assign({}, node.attrs, attrs),
    node.marks
  );
}

export function findOneNode(node: ProsemirrorNode, from: number, to: number, predicate: Predicate) {
  let result: ProsemirrorNode | null = null;
  traverseNodes(node, from, to, x => {
    if (predicate(x)) {
      result = x;
      return TraverseResult.End;
    } else {
      return undefined;
    }
  });
  return result;
}

export function findSelectedNodeOfType(nodeType: NodeType, selection: Selection) {
  if (selection instanceof NodeSelection && nodeType === selection.node.type) {
    const { node, $from } = selection;
    return { node, pos: $from.pos };
  } else {
    return undefined;
  }
}

function asSelection(context: EditorState | Selection) {
  return context instanceof EditorState ? context.selection : context;
}
