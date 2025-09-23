/*
 * yamloption.ts
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

import { Node as ProsemirrorNode } from 'prosemirror-model'

import { insertNewlineAndIndent } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import { editorLanguage } from "editor-core";
import { Behavior, BehaviorContext } from ".";

export function yamlOptionBehavior(context: BehaviorContext) : Behavior {

  // track current language
  let language  = '';
  const updateLanguage = (nd: ProsemirrorNode) => {
    language = context.options.lang(nd, nd.textContent) || '';
  }
  
  return {

    keys: [
      {
        key: "Enter",
        run: (cmView: EditorView) => {
          return handlerEnterKey(cmView, language);
        },
        shift: insertNewlineAndIndent
      },
    ],

    init(pmNode) {
      updateLanguage(pmNode);
    },

    pmUpdate: (_prevNode, updateNode) => {
      updateLanguage(updateNode);
    }
  }
}


const handlerEnterKey = (cmView: EditorView, language: string) => {
 
  // capture current line
  const line = cmView.state.doc.lineAt(cmView.state.selection.main.from);
  
  // perform the default action
  if (insertNewlineAndIndent(cmView)) {
    // if the current block has a language with a commnt char defined then check
    // for a continuation of an option comment line
    const langComment = editorLanguage(language)?.comment;
    if (langComment) {
      const newlineSel = cmView.state.selection.main;
      const optionComment = `${langComment}| `;
      if (line.text.trim() === optionComment.trim()) {
        cmView.dispatch({
          changes: {
            from: newlineSel.from - line.text.length - 1,
            to: newlineSel.from,
            insert: "\n"
          }
        })
      } else if (line.text.startsWith(optionComment)) {
        cmView.dispatch({
          changes: {
            from: newlineSel.from,
            to: newlineSel.to,
            insert: optionComment,
          },
          selection: {anchor: newlineSel.from + optionComment.length}
        })
      }
    }
    return true;
  } else {
    return false;
  }
}


