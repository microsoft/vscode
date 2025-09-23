/*
 * user_comment-model.ts
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

import { Schema } from "prosemirror-model";
import { EditorState, Transaction } from "prosemirror-state";
import { NodeWithPos } from "prosemirror-utils";
import { setNodeAttrs } from "../../api/node";
import { traverseNodes } from "../../api/node-traverse";
import { randomAlphanumeric } from "../../api/util";
import { getUserCommentNodeCache } from "./user_comment-cache";
import { UserCommentPluginKey } from "./user_comment-constants";

export interface CommentThread {
  readonly threadId: string;
  readonly comments: ReadonlyArray<Comment>;
}

export interface Comment {
  readonly commentId: string;
  readonly author: string;
  readonly created: Date;
  readonly content: string;
}

// var str = '<!--#["Joe &quot;&quot; Cheng &lt;joe@rstudio.com&gt;" at 2020-03-04T05:06:07-08:00] My comment is insightful &amp; amusing-->'
// Just loosely match the begin comment--we'll do stronger parsing in a second pass
const kHTMLUserCommentBegin = /^<!--#([\w-]+)(\[[^<>]+?)-->$/;

export function parseFromHTMLComment(comment: string): CommentThread | null {
  const m1 = kHTMLUserCommentBegin.exec(comment);
  if (!m1) {
    return null;
  }

  const comments: Comment[] = [];

  // Note that this regex has the 'sticky' flag set, and thus is stateful.
  // Do not hoist it outside of this function body!
  const reHTMLUserComment = /\[([\w-]+):"([^[\]]+)" at (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{0,5})?(?:[-+]\d{2}:\d{2}|Z))\] ([^[]*)(?: |$)/y;

  const [ , threadId, commentInner] = m1;

  while (reHTMLUserComment.lastIndex !== commentInner.length) {
    const m2 = reHTMLUserComment.exec(commentInner);
    if (!m2) {
      // Something in this comment didn't feel like a user comment
      // console.warn("Invalid comment");
      return null;
    }

    const [ , commentId, author, iso8601, content] = m2;
    comments.push({
      commentId: htmlUnescapeComment(commentId),
      author: htmlUnescapeComment(author),
      created: new Date(iso8601),
      content: htmlUnescapeComment(content)
    });
  }

  if (comments.length === 0) {
    return null;
  }

  return {
    threadId: htmlUnescapeComment(threadId),
    comments
  };

}

export function formatAsHTMLComment(thread: CommentThread) {
  if (!isValidId(thread.threadId)) {
    throw new Error("Malformed comment thread id");
  }

  const result = thread.comments.map<string>(c => {
    const commentId = c.commentId;
    const author = htmlEscapeComment(c.author);
    const created = c.created.toISOString();
    const content = htmlEscapeComment(c.content);

    if (!isValidId(commentId) || author.length === 0) {
      throw new Error("Malformed comment");
    }

    return `[${commentId}:"${author}" at ${created}] ${content}`;
  }).join(" ");

  return `<!--#${thread.threadId}${result}-->`;
}

function isValidId(str: string) {
  return /^[\w-]+$/.test(str);
}

function htmlEscapeComment(str: string) {
  return str.replace(/[<>&"\r\n]/g, m => {
    switch(m) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case "\"": return "&quot;";
      case "\r": return "&#13;";
      case "\n": return "&#10;";
      case "#": return "&#35;";
      case "[": return "&#91;";
      case "]": return "&#93;";
    }
    throw new Error(`Unexpected character ${m}`);
  });
}

export function htmlUnescapeComment(html: string) {
  return new DOMParser().parseFromString(html, "text/html").documentElement.textContent!;
}

export function createCommentId() {
  return randomAlphanumeric(8);
}

export function createCommentItemNode(schema: Schema, author: string) {
  const commentId = createCommentId();
  return schema.nodes.user_comment_item.create({
    commentId,
    author,
    created: null,
    content: "",
    provisional: true
  });
}

export function findCommentThread(threadId: string, state: EditorState) {
  const cache = getUserCommentNodeCache(state);

  let begin: NodeWithPos | undefined;
  let end: NodeWithPos | undefined;

  cache.getIndex().forEach(nodeWithPos => {
    if (nodeWithPos.node.attrs.threadId === threadId) {
      if (nodeWithPos.node.type === state.schema.nodes.user_comment_begin) {
        begin = nodeWithPos;
      } else if (nodeWithPos.node.type === state.schema.nodes.user_comment_end) {
        end = nodeWithPos;
      }
    }
  });

  if (!!begin !== !!end) {
    begin = undefined;
    end = undefined;
  }
  return [begin, end];
}

export function deleteCommentThread(threadId: string, state: EditorState, dispatch?: (tr: Transaction) => void) {
  const [begin, end] = findCommentThread(threadId, state);
  if (!begin || !end) {
    return false;
  }
  if (begin.pos >= end.pos) {
    // This shouldn't ever be
    throw new Error("Comment thread begin was not earlier than comment thread end!");
  }

  if (dispatch) {
    const tr = state.tr;
    tr.delete(end.pos, end.pos + end.node.nodeSize);
    tr.delete(begin.pos, begin.pos + begin.node.nodeSize);
    tr.setMeta(UserCommentPluginKey, true);
    dispatch(tr);
  }

  return true;
}

export function findCommentItem(commentId: string, thread: string | NodeWithPos, state: EditorState) : NodeWithPos | null {
  const threadNode = resolveThread(thread, state);
  if (!threadNode) {
    return null;
  }

  let commentNode: NodeWithPos | null = null;
  traverseNodes(state.doc, threadNode.pos + 1, threadNode.pos + threadNode.node.nodeSize - 1,
    (node, pos) => {
      if (node.type === state.schema.nodes.user_comment_item) {
        if (node.attrs.commentId === commentId) {
          commentNode = {node, pos};
        }
      }
    }
  );

  return commentNode;
}

export function saveComment(commentId: string, threadId: string,
  content: string, state: EditorState, dispatch?: (tr: Transaction) => void) {

  const [begin, end] = findCommentThread(threadId, state);
  if (!begin || !end) {
    return false;
  }

  const commentItem = findCommentItem(commentId, begin, state);
  if (!commentItem) {
    return false;
  }
  
  if (dispatch) {
    const tr = state.tr;
    tr.setMeta(UserCommentPluginKey, true);

    if (begin.node.attrs.provisional) {
      setNodeAttrs(tr, begin, {provisional: undefined});
    }
    if (end.node.attrs.provisional) {
      setNodeAttrs(tr, end, {provisional: undefined});
    }

    if (commentItem.node.attrs.provisional) {
      setNodeAttrs(tr, commentItem, {
        provisional: undefined,
        created: new Date()
      });
    }
    if (content) {
      tr.insertText(content, commentItem.pos + 1, commentItem.pos + commentItem.node.nodeSize - 1);
    } else {
      tr.delete(commentItem.pos + 1, commentItem.pos + commentItem.node.nodeSize - 1);
    }

    dispatch(tr);
  }

  return true;
}

export function deleteComment(commentId: string, thread: string | NodeWithPos, state: EditorState, dispatch?: (tr: Transaction) => void) {
  const threadNode = resolveThread(thread, state);
  if (!threadNode) {
    return false;
  }

  const commentItem = findCommentItem(commentId, threadNode, state);
  if (!commentItem) {
    return false;
  }

  if (dispatch) {
    if (threadNode.node.childCount > 1) {
      // delete just the comment
      const tr = state.tr;
      tr.delete(commentItem.pos, commentItem.pos + commentItem.node.nodeSize);
      dispatch(tr);
    } else {
      // delete the whole thread
      deleteCommentThread(threadNode.node.attrs.threadId, state, dispatch);
    }
  }

  return true;
}

function resolveThread(thread: string | NodeWithPos, state: EditorState) : NodeWithPos | undefined {
  if (typeof(thread) === "string") {
    const [threadNode] = findCommentThread(thread, state);
    return threadNode;
  } else {
    const foundNode = state.doc.nodeAt(thread.pos);
    if (foundNode && foundNode.eq(thread.node)) {
      return thread;
    } else {
      // The node given to us was out of date or not found
      return resolveThread(thread.node.attrs.threadId, state);
    }
  }
}
