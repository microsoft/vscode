/*
 * user_comment-cache.ts
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

import { Node, Schema } from "prosemirror-model";
import { Plugin, EditorState } from "prosemirror-state";
import { NodeWithPos } from "prosemirror-utils";
import { NodeIndex } from "../../api/nodeindex";
import { UserCommentNodeCachePluginKey } from "./user_comment-constants";

export class UserCommentNodeCachePlugin extends Plugin {
  constructor(schema: Schema) {
    super({
      key: UserCommentNodeCachePluginKey,
      state: {
        init(_config, instance): NodeIndex {
          return NodeIndex.create(
            isCommentNode.bind(undefined, schema),
            instance.doc);
        },
        apply(tr, value) {
          return value.apply(tr);
        }
      }
    });
  }
}

export function getUserCommentNodeCache(state: EditorState): NodeIndex {
  return UserCommentNodeCachePluginKey.getState(state)!;
}

export interface NodePair {
  readonly begin: NodeWithPos;
  readonly end: NodeWithPos;
}

export function getUserCommentNodePairs(schema: Schema, cache: NodeIndex): ReadonlyArray<NodePair> {
  const results = new Array<NodePair>();

  const currentBeginTags = new Map<string, NodeWithPos[]>();
  for (const node of cache.getIndex()) {
    const threadId = node.node.attrs.threadId;
    let stack = currentBeginTags.get(threadId);
    if (isCommentBeginNode(schema, node.node)) {
      if (!stack) {
        stack = [];
        currentBeginTags.set(threadId, stack);
      }
      stack.push(node);
    } else if (isCommentEndNode(schema, node.node)) {
      if (stack && stack.length > 0) {
        const beginTag = stack.pop()!;
        results.push({begin: beginTag, end: node});
      } else {
        // TODO: Unmatched comment end tag; warn?
      }
    }
  }

  // TODO: If currentBeginTags isn't empty, warn?

  return results;
}

function isCommentNode(schema: Schema, node: Node) {
  return isCommentBeginNode(schema, node) || isCommentEndNode(schema, node);
}

function isCommentBeginNode(schema: Schema, node: Node) {
  return node.type === schema.nodes.user_comment_begin;
}

function isCommentEndNode(schema: Schema, node: Node) {
  return node.type === schema.nodes.user_comment_end;
}
