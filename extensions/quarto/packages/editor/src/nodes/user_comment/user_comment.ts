/*
 * user_comment.ts
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

/**
 * TODO
 * - See if I can use ContentMatch to find the place to insert the inline
 *   replacement for block comment (ref. exitNode in editor.ts)
 * - [Design] Hovering over the comment should indicate/emphasize the
 *   corresponding commented text
 * - Comments at the very bottom of a tall page can run off the bottom of the
 *   screen
 */

 /**
  * user_comment_begin
  *   {threadId: string}
  *   user_comment_item+
  *     {commentId: string, author: string, created: Date}
  *     user_comment_content
  * user_comment_end
  *   {threadId: string}
  */


import { Schema, Node as ProsemirrorNode, Fragment } from 'prosemirror-model';
import { Plugin, EditorState, Transaction, EditorStateConfig } from "prosemirror-state";
import { DecorationSet, EditorView, Decoration } from "prosemirror-view";

import { ProsemirrorCommand, EditorCommandId } from '../../api/command';
import { Extension, ExtensionContext } from '../../api/extension';
import { PandocOutput, ProsemirrorWriter } from '../../api/pandoc';


import { UserCommentNodeCachePlugin, getUserCommentNodeCache } from './user_comment-cache';
import { UserCommentPluginKey } from './user_comment-constants';
import { userCommentBlocksToInlineFixup, userCommentAppendTransaction } from './user_comment-fixup';
import { Comment, parseFromHTMLComment, formatAsHTMLComment, createCommentId, createCommentItemNode, htmlUnescapeComment } from './user_comment-model';

import { synchronizeCommentViewPositions } from './ui/layout';
import { UserCommentViewPlugin } from './ui/plugin';
import { focusComment } from './ui/common';

import './user_comment-styles.css';
import { LayoutEvent, ScrollEvent } from '../../api/event-types';
import { EditorUI } from '../../api/ui-types';
import { currentUsername } from '../../api/user';

const kHTMLUserCommentEnd = /^<!--\/#([\w-]+)-->$/;

const extension = (context: ExtensionContext): Extension | null => {

  const { pandocExtensions, events, ui, options } = context;

  // disable if commenting is disabled
  if (!options.commenting) {
    return null;
  }

  // short circuit to no extension if raw HTML is not supported
  if (!pandocExtensions.raw_html) {
    return null;
  }

  // return the extension
  return {
    view: (view: EditorView) => {
      // No need to unsubscribe because we live as long as the view
      events.subscribe(LayoutEvent, synchronizeCommentViewPositions(view));
      events.subscribe(ScrollEvent, synchronizeCommentViewPositions(view));
    },
    nodes: [
      // We have two almost-identical nodes to define: user_comment_begin and
      // user_comment_begin_block. So create a little true,false array and
      // map over it to create the two PandocNodes we want.
      {
        name: 'user_comment_begin',
        spec: {
          inline: true,
          selectable: false,
          defining: true,
          skip: true,
          content: "user_comment_item+",
          attrs: {
            threadId: { default: "" },
            // When true, this comment thread is a new draft. It should not be
            // written to the Pandoc output until it is committed (provisional:
            // false).
            provisional: { default: false }
          },
          group: "inline",
          parseDOM: [
            {
              tag: "span.pm-user-comment.pm-user-comment-begin",
              getAttrs(dom: Node | string) {
                const el = dom as Element;
                return {
                  threadId: el.getAttribute('data-thread-id'),
                };
              },
            },
          ],
          toDOM(node: ProsemirrorNode) {
            const attr = {
              class: 'pm-user-comment pm-user-comment-begin',
              'data-thread-id': node.attrs.threadId,
            };
            return ['span', attr, 0];
          },
        },
        pandoc: {
          inlineHTMLReader: readPandocUserCommentBegin,
          writer(output: PandocOutput, node: ProsemirrorNode) {
            if (node.attrs.provisional) {
              return;
            }

            const comments: Comment[] = [];
            node.content.forEach(n => {
              if (n.type.name === 'user_comment_item') {
                if (!n.attrs.provisional) {
                  comments.push({
                    commentId: n.attrs.commentId as string,
                    author: n.attrs.author as string,
                    created: n.attrs.created as Date,
                    content: n.textContent
                  });
                }
              }
            });
            const htmlComment = formatAsHTMLComment({ threadId: node.attrs.threadId, comments });
            output.writeRawMarkdown(htmlComment);
          },
        },
      },
      {
        name: 'user_comment_item',
        spec: {
          inline: true,
          selectable: false,
          defining: true,
          skip: true,
          content: "text*",
          attrs: {
            commentId: { default: 'unknown' },
            author: { default: '' },
            created: { default: null },
            provisional: { default: undefined }
          },
          // No group
          parseDOM: [
            {
              tag: `span.pm-user-comment-item`,
              getAttrs(dom: Node | string) {
                const el = dom as Element;
                return {
                  commentId: el.getAttribute('data-comment-id'),
                  author: el.getAttribute('data-author'),
                  created: new Date(el.getAttribute('data-created') as string),
                  content: el.getAttribute('data-content'),
                };
              },
              getContent(node, schema) {
                const content: ProsemirrorNode[] = [];
                if (node.textContent) {
                  content.push(schema.text(node.textContent));
                }
                return Fragment.from(content);
              }
            },
          ],
          toDOM(node: ProsemirrorNode) {
            const attr = {
              class: 'pm-user-comment-item',
              'data-comment-id': node.attrs.commentId,
              'data-author': node.attrs.author,
              'data-created': (node.attrs.created as Date).toISOString(),
              'data-content': node.attrs.content,
            };
            return ['span', attr, 0];
          },
        },
        // No pandoc serialization--handled at the thread level
        pandoc: {}
      },
      {
        name: 'user_comment_end',
        spec: {
          inline: true,
          selectable: false,
          skip: true,
          attrs: {
            threadId: { default: -1 },
            provisional: { default: false }
          },
          group: 'inline',
          parseDOM: [
            {
              tag: 'span.pm-user-comment.pm-user-comment-end',
              getAttrs(dom: Node | string) {
                const el = dom as Element;
                return {
                  threadId: el.getAttribute('data-thread-id'),
                };
              },
            },
          ],
          toDOM(node: ProsemirrorNode) {
            const attr = {
              class: 'pm-user-comment pm-user-comment-end',
              'data-thread-id': node.attrs.threadId,
            };
            return ['span', attr];
          },
        },
        pandoc: {
          inlineHTMLReader: readPandocUserCommentEnd,
          writer(output: PandocOutput, node: ProsemirrorNode) {
            if (node.attrs.provisional) {
              return;
            }
            const threadId = htmlEscape(node.attrs.threadId);
            const str = `<!--/#${threadId}-->`;
            output.writeRawMarkdown(str);
          },
        },
      },
    ],

    // insert command
    commands(schema: Schema) {
      return [new InsertUserCommentCommand(schema, ui)];
    },

    plugins(schema: Schema) {
      return [
        new UserCommentNodeCachePlugin(schema),
        new InsertUserCommentPlugin(schema, ui),
        new UserCommentPlugin(schema),
        new UserCommentViewPlugin(schema, ui),
      ];
    },

    fixups(schema: Schema) {
      return [
        userCommentBlocksToInlineFixup(schema)
      ];
    },

  };
};

function readPandocUserCommentBegin(schema: Schema, html: string, writer?: ProsemirrorWriter) {
  const commentThread = parseFromHTMLComment(html);
  if (!commentThread) {
    return false;
  }

  if (writer) {
    const threadAttr = {
      threadId: commentThread.threadId
    };
  
    writer.openNode(schema.nodes.user_comment_begin, threadAttr);
    for (const comment of commentThread.comments) {
      const attr = {
        commentId: comment.commentId,
        author: comment.author,
        created: comment.created,
      };
      writer.openNode(schema.nodes.user_comment_item, attr);
      writer.writeText(comment.content);
      writer.closeNode();
    }
    writer.closeNode();
  }

  return true;
}

function readPandocUserCommentEnd(schema: Schema, html: string, writer?: ProsemirrorWriter) {
  const m = kHTMLUserCommentEnd.exec(html);
  if (!m) {
    return false;
  }

  if (writer) {
    let [ , threadId] = m;
    threadId = htmlUnescapeComment(threadId);
  
    writer.openNode(schema.nodes.user_comment_end, {threadId});
    writer.closeNode();
  }

  return true;
}



class InsertUserCommentPlugin extends Plugin<DecorationSet> {
  constructor(_schema: Schema, ui: EditorUI) {
    super({
      state: {
        init() {
          return DecorationSet.empty;
        },
        apply: (tr: Transaction) => {
          // TODO: If the current selection is equal to or inside a comment range, don't show the
          // insert comment button
          if (tr.selection.empty) {
            return DecorationSet.empty;
          } else {
            return DecorationSet.create(tr.doc, [
              Decoration.widget(tr.selection.from-1,
                createInsertButton.bind(undefined, ui),
                { key: "insert-comment-button",
                  ignoreSelection: true,
                 }),
            ]);      
          }
        }
      },
      props: {
        decorations: (state: EditorState) => {
          return this.getState(state);
        }
      },
    });
  }
}

function createInsertButton(ui: EditorUI, view: EditorView) {
  const insertButton = document.createElement('a');
  insertButton.className = 'pm-insert-user-comment-button';
  insertButton.innerHTML = '&#x1F4AC;'; // speech bubble emoji
  insertButton.title = 'Add comment';
  insertButton.onclick = e => {
    if (view) {
      insertUserComment(ui, view.state, view.dispatch);
    }
    e.preventDefault();
    e.stopPropagation();
    return false;
  };
  return insertButton;
}

class InsertUserCommentCommand extends ProsemirrorCommand {
  constructor(_schema: Schema, ui: EditorUI) {
    super(EditorCommandId.UserComment, ['Shift-Mod-c'], (state, dispatch) => {
      return insertUserComment(ui, state, dispatch);
    }, undefined, false);
  }
}

function insertUserComment(ui: EditorUI, state: EditorState,
    dispatch?: (tr: Transaction) => void) : boolean {

  if (state.selection.empty) {
    return false;
  }

  if (dispatch) {
    const newThreadId = createCommentId();

    const commentItem = createCommentItemNode(state.schema, currentUsername(ui.context));

    const commentBegin = state.schema.nodes.user_comment_begin.create(
      {threadId: newThreadId, provisional: true}, commentItem);

    const commentEnd = state.schema.nodes.user_comment_end.create(
      {threadId: newThreadId, provisional: true});

    const tr = state.tr;
    tr.insert(state.selection.to, commentEnd);
    tr.insert(tr.mapping.map(state.selection.from), commentBegin);
    tr.setMeta(UserCommentPluginKey, true);

    dispatch(tr);

    focusComment(newThreadId, commentItem.attrs.commentId);
  }

  return true;
}

class UserCommentPlugin extends Plugin<DecorationSet> {
  constructor(schema: Schema) {
    super({
      key: UserCommentPluginKey,
      state: {
        init(_config: EditorStateConfig, instance: EditorState) : DecorationSet {
          return createCommentDecorators(instance, schema);
        },
        apply: (tr: Transaction, old: DecorationSet, _oldState: EditorState, newState: EditorState) : DecorationSet => {
          if (!tr.docChanged) {
            return old;
          }
          return createCommentDecorators(newState, schema);
        }
      },
      props: {
        decorations: (state: EditorState) => {
          return UserCommentPluginKey.getState(state);
        },
      },
      appendTransaction: userCommentAppendTransaction(schema, createCommentId)
    });
  }
}

function createCommentDecorators(state: EditorState, schema: Schema) {
  const start = new Map<string, number>();
  const end = new Map<string, number>();
  const nodeIndex = getUserCommentNodeCache(state);
  nodeIndex.getIndex(state.doc).forEach(({node, pos}) => {
    if (node.type === schema.nodes.user_comment_begin || node.type === schema.nodes.user_comment_begin_block) {
      start.set(node.attrs.threadId, pos + node.nodeSize);
    }
    else if (node.type === schema.nodes.user_comment_end) {
      end.set(node.attrs.threadId, pos);
    }
    return true;
  });
  let decorations = DecorationSet.empty;
  start.forEach((pos, threadId) => {
    const startPos = pos;
    const endPos = end.get(threadId);
    if (typeof (endPos) !== "undefined") {
      decorations = decorations.add(state.doc, [Decoration.inline(startPos, endPos, { class: "pm-comment-background-color" }, { inclusiveStart: true, inclusiveEnd: true })]);
    }
  });
  return decorations;
}

function htmlEscape(str: string) {
  return str.replace(/[<>&"\r\n]/g, m => {
    switch(m) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case "\"": return "&quot;";
      case "\r": return "&#13;";
      case "\n": return "&#10;";
    }
    throw new Error(`Unexpected character ${m}`);
  });
}

export default extension;
