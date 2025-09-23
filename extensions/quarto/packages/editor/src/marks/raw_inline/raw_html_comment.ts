/*
 * raw_html-comment.ts
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

import { Schema, Mark, Fragment, Node as ProsemirrorNode } from 'prosemirror-model';
import { Transaction, TextSelection, EditorState } from 'prosemirror-state';

import { setTextSelection } from 'prosemirror-utils';

import { EditorCommandId, ProsemirrorCommand, toggleMarkType } from '../../api/command';
import { canInsertNode } from '../../api/node';
import { ProsemirrorWriter, PandocOutput } from '../../api/pandoc';
import { Extension, ExtensionContext } from '../../api/extension';
import { EditorUI } from '../../api/ui-types';
import { MarkTransaction } from '../../api/transaction';
import { removeInvalidatedMarks, detectAndApplyMarks, domAttrNoSpelling } from '../../api/mark';
import { matchPandocFormatComment } from '../../api/pandoc_format';
import { kHTMLCommentRegEx, isHTMLComment } from '../../api/html';
import { OmniInsertGroup } from '../../api/omni_insert';

import './raw_html_comment-styles.css';

const kHTMLEditingCommentRegEx = /^<!--# ([\s\S]*?)-->$/;

const extension = (context: ExtensionContext): Extension | null => {
  const { options, ui } = context;

  return {
    marks: [
      {
        name: 'raw_html_comment',
        noInputRules: true,
        noSpelling: true,
        spec: {
          attrs: {
            editing: { default: false },
            format: { default: false },
          },
          inclusive: false,
          excludes: 'formatting',
          parseDOM: [
            {
              tag: "span[class*='raw-html-comment']",
              getAttrs(dom: Node | string) {
                const el = dom as Element;
                return {
                  editing: el.getAttribute('data-editing') === '1',
                  format: el.getAttribute('data-format') === '1',
                };
              },
            },
          ],
          toDOM(mark: Mark) {
            const attr: Record<string,unknown> = {
              class:
                'raw-html-comment pm-fixedwidth-font ' +
                (mark.attrs.editing ? 'pm-comment-color pm-comment-background-color' : 'pm-light-text-color') +
                (mark.attrs.format && options.hideFormatComment ? ' pm-comment-hidden' : ''),
              'data-editing': mark.attrs.editing ? '1' : '0',
              'data-format': mark.attrs.format ? '1' : '0',
            };
            return ['span', domAttrNoSpelling(attr)];
          },
        },
        pandoc: {
          readers: [],
          inlineHTMLReader: (schema: Schema, html: string, writer?: ProsemirrorWriter) => {
            const isComment = isHTMLComment(html);
            if (!isComment) {
              return false;
            }

            if (writer) {
              const mark = schema.marks.raw_html_comment.create(commentMarkAttribs(html));
              writer.openMark(mark);
              writer.writeText(html);
              writer.closeMark(mark);
            }

            return isComment;
          },
          writer: {
            priority: 1,
            write: (output: PandocOutput, _mark: Mark, parent: Fragment) => {
              output.writeRawMarkdown(parent);
            },
          },
        },
      },
    ],

    appendMarkTransaction: (schema: Schema) => {
      const markType = schema.marks.raw_html_comment;
      const kHTMLCommentMarkRegEx = new RegExp(kHTMLCommentRegEx.source, 'g');
      return [
        {
          name: 'html-editing-comment-marks',
          filter: (node: ProsemirrorNode) => node.isTextblock && node.type.allowsMarkType(markType),
          append: (tr: MarkTransaction, node: ProsemirrorNode, pos: number) => {
            removeInvalidatedMarks(tr, node, pos, kHTMLCommentRegEx, markType);
            detectAndApplyMarks(
              tr,
              tr.doc.nodeAt(pos)!,
              pos,
              kHTMLCommentMarkRegEx,
              markType,
              match => commentMarkAttribs(match[1]),
              () => true,
              match => match[1],
            );
          },
        },
      ];
    },

    // insert command
    commands: (schema: Schema) => {
      return !options.commenting ? [new InsertHTMLCommentCommand(schema, ui)] : [];
    },
  };
};

export class InsertHTMLCommentCommand extends ProsemirrorCommand {
  constructor(schema: Schema, ui: EditorUI) {
    super(
      EditorCommandId.HTMLComment,
      ['Shift-Mod-c'],
      (state: EditorState, dispatch?: (tr: Transaction) => void) => {
        // make sure we can insert a text node here
        if (!canInsertNode(state, schema.nodes.text)) {
          return false;
        }

        // make sure we can apply this mark here
        if (!toggleMarkType(schema.marks.raw_html)(state)) {
          return false;
        }

        // make sure the end of the selection (where we will insert the comment)
        // isn't already in a mark of this type
        if (state.doc.rangeHasMark(state.selection.to, state.selection.to + 1, schema.marks.raw_html)) {
          return false;
        }

        if (dispatch) {
          const tr = state.tr;

          // set the selection to the end of the current selection (comment 'on' the selection)
          setTextSelection(tr.selection.to)(tr);

          // if we have a character right before us then insert a space
          const { parent, parentOffset } = tr.selection.$to;
          const charBefore = parent.textContent.slice(parentOffset - 1, parentOffset);
          if (charBefore.length && charBefore !== ' ') {
            tr.insertText(' ');
          }

          // insert the comment
          const comment = '<!--#  -->';
          const mark = schema.marks.raw_html_comment.create({ editing: true });
          tr.insert(tr.selection.to, schema.text(comment, [mark]));

          // set the selection to the middle of the comment
          tr.setSelection(new TextSelection(tr.doc.resolve(tr.selection.to - (comment.length / 2 - 1))));

          // dispatch
          dispatch(tr);
        }

        return true;
      },
      {
        name: ui.context.translateText('Comment'),
        description: ui.context.translateText('Editing comment'),
        group: OmniInsertGroup.Content,
        priority: 3,
        image: () => (ui.prefs.darkMode() ? ui.images.omni_insert.comment_dark : ui.images.omni_insert.comment),
      },
    );
  }
}

function commentMarkAttribs(comment: string) {
  return {
    editing: !!comment.match(kHTMLEditingCommentRegEx),
    format: !!matchPandocFormatComment(comment),
  };
}

export default extension;
