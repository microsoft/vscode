/*
 * comment-thread.tsx
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

import { Node as ProsemirrorNode } from 'prosemirror-model';
import { EditorView } from 'prosemirror-view';
import { findChildrenByType } from 'prosemirror-utils';
import React, { useState } from 'react';
import { deleteComment, findCommentItem, findCommentThread, createCommentItemNode, saveComment } from '../user_comment-model';
import { CommentContainer } from './comment-item';
import { synchronizeCommentViewPositions } from './layout';

interface CommentThreadContainerProps {
  readonly node: ProsemirrorNode;
  readonly view: EditorView;
  readonly username: string;

  // A callback to be invoked when the height of the thread changes
  readonly onHeightChange: (commentId: string) => void;

  // callback for when container loads
  readonly callback?: VoidFunction;
}

// Later, this will contain multiple CommentContainers
export function CommentThreadContainer({node, view, ...props}: CommentThreadContainerProps) {
  // An array of the comment ids in this thread that are currently in edit mode
  const [editingComments, setEditingComments] = useState([] as string[]);

  const handleCommentEditingChanged = (commentId: string, isEditing: boolean) => {
    const newValue = editingComments.filter(x => x !== commentId);
    if (isEditing) {
      newValue.push(commentId);
    }
    setEditingComments(newValue);
  };

  const commentItems = findChildrenByType(node, view.state.schema.nodes.user_comment_item);
  const commentIds = commentItems.map(comment => comment.node.attrs.commentId);
  const hasEditingChild = editingComments.filter(x => {
    // This filter just ensures that if any comment ids are still in the
    // editingComments list, but they're not actually present in this thread
    // (anymore), then we ignore them. I don't currently know of any way to get
    // into this state, but it has happened before (deleting a comment you're
    // still editing).
    return commentIds.indexOf(x) >= 0;
  }).length > 0;

  return <div ref={props.callback} className={"pm-user-comment-thread " + (hasEditingChild ? " active" : "")}>
    {
      commentItems.map(x => {
        const commentId = x.node.attrs.commentId;

        return <CommentContainer
          key = {x.node.attrs.commentId}
          commentId = {commentId}
          author = {x.node.attrs.author}
          content = {x.node.textContent}
          draft = {x.node.attrs.provisional}
          readonly = {props.username !== x.node.attrs.author}
          onCommentChange = {handleCommentChange.bind(null, node, view, commentId)}
          onCommentDelete = {handleCommentDelete.bind(null, node, view, commentId)}
          onCommentChangeCancel = {handleCommentChangeCancel.bind(props, node, view, commentId)}
          onCommentEditingChanged = {handleCommentEditingChanged.bind(null, commentId)}
          onHeightChange = {props.onHeightChange.bind(props, commentId)} />;
      })
    }
    <button
      className="pm-user-comment-add"
      onClick={onAddComment.bind(null, node, view, props.username)}
    />
  </div>;
}

function handleCommentChange(node: ProsemirrorNode, view: EditorView, commentId: string, content: string) {
  saveComment(commentId, node.attrs.threadId, content, view.state, view.dispatch);
}

function handleCommentDelete(node: ProsemirrorNode, view: EditorView, commentId: string) {
  deleteComment(commentId, node.attrs.threadId, view.state, view.dispatch);
}

function handleCommentChangeCancel(node: ProsemirrorNode, view: EditorView, commentId: string) {
  const commentNode = findCommentItem(commentId, node.attrs.threadId, view.state);
  if (commentNode && commentNode.node.attrs.provisional) {
    deleteComment(commentId, node.attrs.threadId, view.state, view.dispatch);
  }
  
  const syncCommentViewPos = synchronizeCommentViewPositions(view);
  // TODO: This doesn't seem to work without a setTimeout, find out why
  setTimeout(syncCommentViewPos, 0);
}

function onAddComment(node: ProsemirrorNode, view: EditorView, author: string) {

  const [threadBegin] = findCommentThread(node.attrs.threadId, view.state);
  if (!threadBegin) {
    return;
  }

  const tr = view.state.tr;
  const newComment = createCommentItemNode(view.state.schema, author);
  tr.insert(threadBegin.pos + threadBegin.node.nodeSize - 1, newComment);
  view.dispatch(tr);

  return;
}
