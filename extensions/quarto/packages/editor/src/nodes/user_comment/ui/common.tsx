/*
 * common.tsx
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

export function getThreadElement(threadId: any) {
  return document.getElementById(createThreadIdAttr(threadId));
}

export function createThreadIdAttr(commentId: string) {
  return `comment-thread-view-${commentId}`;
}

export function createCommentIdAttr(commentId: string) {
  return `comment-item-view-${commentId}`;
}

export function focusComment(threadId: string, commentId: string) {
  const selector = [
    `[id='${createThreadIdAttr(threadId)}'].pm-user-comment-view`,
    `[id='${createCommentIdAttr(commentId)}'].pm-user-comment-item`,
    '.pm-user-comment-content'
  ];

  const el = document.querySelector(selector.join(' ')) as HTMLElement;
  if (el) {
    el.focus();
  }
}
