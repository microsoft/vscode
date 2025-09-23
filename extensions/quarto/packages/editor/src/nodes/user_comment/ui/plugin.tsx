/*
 * plugin.tsx
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

import { Schema } from 'prosemirror-model';
import { Plugin } from 'prosemirror-state';
import { NodeView } from 'prosemirror-view';
import React from 'react';
import { onNodeAttached } from '../../../api/dom';
import { UserCommentViewPluginKey } from '../user_comment-constants';
import { synchronizeCommentViewPositions } from './layout';
import { createThreadIdAttr } from './common';
import { CommentThreadContainer } from './comment-thread';
import { EditorUI } from '../../../api/ui-types';
import { currentUsername } from '../../../api/user';
import { createRoot } from 'react-dom/client';

export class UserCommentViewPlugin extends Plugin {
  
  constructor(schema: Schema, ui: EditorUI) {
    super({
      key: UserCommentViewPluginKey,
      props: {
        nodeViews: {
          annotations(_node, view): NodeView {
            const div = document.createElement('div');
            div.classList.add('pm-annotations');
            while (pendingElements.length) {
              div.appendChild(pendingElements.shift()!);
            }
            div.addEventListener("focus", synchronizeCommentViewPositions(view), true);
            div.addEventListener("blur", synchronizeCommentViewPositions(view), true);

            onNodeAttached(div, document, () => {
              // Because we initially render TextareaAutosize on a detached DOM
              // node, the heights aren't correct. Firing a resize event on the
              // window forces them to re-autosize.
              window.dispatchEvent(new Event("resize"));
            });

            return {
              dom: div,
              ignoreMutation: () => true,
            };
          },
          user_comment_begin(node, view, _getPos, decorations, innerDecorations) {

            const el = document.createElement("div");
            const root = createRoot(el);
            el.classList.add('pm-user-comment-view');
            el.id = createThreadIdAttr(node.attrs.threadId);
            el.style.position = "absolute";
            el.style.zIndex = "1000";
            // Until `top` is synchronized with the node's position on screen,
            // don't show this view at all.
            el.style.top = "-10000px";
            
            // At document load time, the user_comment_begin nodes are instantiated
            // before the annotations div (that will ultimately parent them) exists.
            // Use a buffer (pendingElements) to store them.
            // TODO: would love a better way to get ahold of the annotations div.
            const annotationEl = document.querySelector("div.pm-annotations");
            if (annotationEl) {
              annotationEl.appendChild(el);
            } else {
              pendingElements.push(el);
            }

            const inlineEl = document.createElement("span");
            inlineEl.style.textDecoration = "underline";

            const syncCommentViewPos = synchronizeCommentViewPositions(view);
            function handleHeightChange() {
              syncCommentViewPos();
            }

            const nodeView: NodeView = {
              dom: inlineEl,
              contentDOM: null, // Set to inlineEl to show comment in document (for debugging)
              update(newNode) {
                if (newNode.type !== schema.nodes.user_comment_begin) {
                  // Not sure why this is required, but sometimes we get called in this state
                  // when the node is being deleted; if we return true, then the node is deleted
                  // but our destroy() is never called. If we return false then destroy() is
                  // called correctly. You can repro this by putting a comment directly between
                  // two RawInline nodes.
                  return false;
                }

                el.id = createThreadIdAttr(newNode.attrs.threadId);
                node = newNode;
                const username = currentUsername(ui.context);

                root.render(
                  <CommentThreadContainer
                    node = {newNode}
                    view = {view}
                    username = {username}
                    onHeightChange = {handleHeightChange}
                    callback={syncCommentViewPos}
                    />,
                  );``

                return true;
              },
              // selectNode() {},
              // deselectNode() {},
              // setSelection(anchor: number, head: number, root: Document) {},
              // stopEvent(event) { return false; },
              // ignoreMutation(p: MutationRecord | {type: 'selection'; target: Element;}) {},
              destroy() {
                root.unmount();
                el.remove();
              }
            };

            nodeView.update!(node, decorations, innerDecorations);

            return nodeView;
          },
        },
      }
    });
    const pendingElements: HTMLElement[] = [];
  }
}
