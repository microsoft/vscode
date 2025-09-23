/*
 * comment-content.tsx
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

import React, { useEffect } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { usePrevious } from '../../../api/react-hooks';


export interface ContentPanelProps {
  readonly editable: boolean;
  readonly onCommentChange: (content: string) => void;
  readonly onHeightChange: () => void;
  readonly content: string;
}

export const ContentPanel: React.FC<ContentPanelProps> = (props) => {
  
  const contentEl = React.createRef<HTMLTextAreaElement>();

  const inputChangeListener = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    props.onCommentChange(e.target.value || "")
  }

  // Without this, Enter and Backspace take effect in the main document even
  // when the focus is in the comment editor
  const keydownListener = (e: KeyboardEvent) => {
    e.stopPropagation();
  };

  useEffect(() => {
    contentEl.current!.addEventListener("keydown", keydownListener);
    if (props.editable) {
      contentEl.current!.focus();
    }
    return () => {
      contentEl.current!.removeEventListener("keydown", keydownListener);
    }
  }, []);

  const prevEditable = usePrevious(props.editable);
  useEffect(() => {
    if (props.editable && !prevEditable) {
      contentEl.current!.focus();
    }
  }, [props.editable])

  return <TextareaAutosize
    ref = {contentEl}
    className = "pm-user-comment-content"
    disabled = {!props.editable}
    value = {props.content}
    onChange = {inputChangeListener}
    onHeightChange = {props.onHeightChange}
    cacheMeasurements = {true}
  />;
}
