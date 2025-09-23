/*
 * div-tabset.ts
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

import { EditorState, Transaction } from "prosemirror-state";
import { Node as ProsemirrorNode } from 'prosemirror-model';
import { wrapIn } from "prosemirror-commands";
import { findParentNodeOfType, setTextSelection } from "prosemirror-utils";
import { EditorView } from "prosemirror-view";

import { EditorCommandId, ProsemirrorCommand, toggleWrap } from "../../api/command";
import { EditorUI } from "../../api/ui-types";
import { OmniInsertGroup } from "../../api/omni_insert";
import { pandocAttrEnsureClass } from "../../api/pandoc_attr";


export function insertTabsetCommand(ui: EditorUI) {
  return new ProsemirrorCommand(EditorCommandId.Tabset, [], insertTabsetCommandFn(ui), {
    name: ui.context.translateText('Tabset'),
    description: ui.context.translateText('Content divided into tabs'),
    group: OmniInsertGroup.Content,
    priority: 2,
    noFocus: true,
    image: () => (ui.prefs.darkMode() ? ui.images.omni_insert.tabset_dark : ui.images.omni_insert.tabset),
  });
}

function insertTabsetCommandFn(ui: EditorUI) {
  return (state: EditorState, dispatch?: (tr: Transaction) => void, view?: EditorView) => {
    
    const schema = state.schema;
    if (!toggleWrap(schema.nodes.div)(state)) {
      return false;
    }

    async function asyncInsertTabset() {
      if (dispatch) {
        const result = await ui.dialogs.insertTabset();
        if (result) {
          wrapIn(state.schema.nodes.div)(state, (tr: Transaction) => {
            // locate inserted div
            const div = findParentNodeOfType(state.schema.nodes.div)(tr.selection)!;

            // ensure that .panel-tabset is the first class then set attributes
            pandocAttrEnsureClass(result.attr, "panel-tabset");
            tr.setNodeMarkup(div.pos, div.node.type, result.attr);
           
            // insert tabset
            const tabset: ProsemirrorNode[] = result.tabs.flatMap(tab => {
              return [
                schema.nodes.heading.create(
                  { level: 2 },
                  schema.text(tab)
                ),
                schema.nodes.paragraph.create()
              ];
            });
            tr.replaceWith(div.start, div.start + 1, tabset);

            // set selection
            setTextSelection(div.start + tabset[0].nodeSize)(tr);

            // dispatch
            dispatch(tr);
          });
        }
        if (view) {
          view.focus();
        }
      }
    }
    asyncInsertTabset();

    return true;
  };
}



