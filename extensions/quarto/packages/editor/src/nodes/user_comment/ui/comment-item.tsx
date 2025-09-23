/*
 * comment-item.tsx
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

import React, { useState, useRef, useEffect } from 'react';
import { createCommentIdAttr } from './common';
import { ContentPanel } from './comment-content';

interface CommentContainerProps {
  readonly commentId: string;
  readonly author: string;
  readonly created?: Date;
  readonly content: string;
  readonly readonly: boolean;
  readonly draft: boolean;
  readonly onCommentEditingChanged: (editing: boolean) => void;
  readonly onCommentChange: (content: string) => void;
  readonly onCommentChangeCancel: () => void;
  readonly onCommentDelete: () => void;
  readonly onHeightChange: () => void;
}

export function CommentContainer(props: CommentContainerProps) {
  const [pendingContent, setPendingContent] = useState("");
  const [dirty, setDirty] = useState(!!props.draft);
  const [editing, setEditing] = useState(!!props.draft);
  useEffect(() => {
    // If we're starting out in editing mode, we have to alert the parent.
    // (Surely there's a better way to do this?)
    if (editing) {
      props.onCommentEditingChanged(true);
    }
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);

  const handleOK = () => {
    props.onCommentChange(pendingContent);
    setDirty(false);
    setEditing(false);
    props.onCommentEditingChanged(false);
    containerRef.current!.focus();
  };

  const handleCancel = () => {
    setDirty(false);
    setEditing(false);
    props.onCommentEditingChanged(false);
    containerRef.current!.focus();
    props.onCommentChangeCancel();
  };

  const handleCommentChange = (content: string) => {
    if (!dirty) {
      setDirty(true);
    }
    setPendingContent(content);
  };

  const handleHeightChange = () => {
    props.onHeightChange();
  };

  const handleBeginEditing = () => {
    if (!props.readonly) {
      setEditing(true);
    }
    props.onCommentEditingChanged(true);
  };

  const handleDelete = () => {
    props.onCommentDelete();
    props.onCommentEditingChanged(false);
  };

  const containerId = createCommentIdAttr(props.commentId);
  const containerClass = "pm-user-comment-item" + (dirty ? " dirty" : "");
  
  return <div ref={containerRef} id={containerId} className={containerClass} tabIndex={0}>
    <div className="pm-user-comment-header">
      <div className="pm-user-comment-meta">
        <div className="pm-user-comment-actions">
          {!props.readonly && <button className={"pm-user-comment-edit" + (editing ? " active" : "")} onClick={handleBeginEditing}/>}
          <button className="pm-user-comment-delete" onClick={handleDelete}/>
        </div>
        <div className="pm-user-comment-author">{props.author}</div>
        {props.created && <div className="pm-user-comment-created">{props.created.toLocaleString()}</div>}
      </div>
    </div>
    <ContentPanel content={dirty ? pendingContent : props.content}
      editable={!props.readonly && editing}
      onCommentChange={handleCommentChange}
      onHeightChange={handleHeightChange}/>
    {editing && <div className="pm-user-comment-footer">
      <button onClick={handleOK} disabled={!dirty || !pendingContent}>Save</button>
      <button onClick={handleCancel}>Cancel</button>
    </div>}
  </div>;
}
