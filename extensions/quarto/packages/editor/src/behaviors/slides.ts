/*
 * slides.ts
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

import { Transaction, EditorState } from "prosemirror-state";
import { setTextSelection, findParentNodeOfType } from "prosemirror-utils";

import { ExtensionContext } from "../api/extension";
import { kPresentationDocType } from "../api/format";
import { canInsertNode } from "../api/node";
import { ProsemirrorCommand, EditorCommandId } from "../api/command";
import { OmniInsertGroup } from "../api/omni_insert";
import { wrapIn } from "prosemirror-commands";

const extension = (context: ExtensionContext) => {

  const { ui, format, pandocExtensions } = context;

  if (!format.docTypes.includes(kPresentationDocType)) {
    return null;
  }

  return {
    commands: () => {
      const cmds: ProsemirrorCommand[] = [
        new ProsemirrorCommand(EditorCommandId.InsertSlidePause, [], insertSlidePause, {
          name: ui.context.translateText('Slide Pause'),
          description: ui.context.translateText('Pause after content'),
          group: OmniInsertGroup.Content,
          priority: 2,
          image: () => ui.prefs.darkMode() ? ui.images.omni_insert!.slide_pause_dark! : ui.images.omni_insert!.slide_pause!
        })
      ];

      if (pandocExtensions.fenced_divs) {
        cmds.push(new ProsemirrorCommand(EditorCommandId.InsertSlideNotes, [], insertSlideNotes, {
          name: ui.context.translateText('Slide Notes'),
          description: ui.context.translateText('Slide speaker notes'),
          group: OmniInsertGroup.Content,
          priority: 2,
          image: () => ui.prefs.darkMode() ? ui.images.omni_insert!.slide_notes_dark! : ui.images.omni_insert!.slide_notes!
        }));
        cmds.push(new ProsemirrorCommand(EditorCommandId.InsertSlideColumns, [], insertSlideColumns, {
          name: ui.context.translateText('Slide Columns'),
          description: ui.context.translateText('Two column layout'),
          group: OmniInsertGroup.Content,
          priority: 2,
          image: () => ui.prefs.darkMode() ? ui.images.omni_insert!.slide_columns_dark! : ui.images.omni_insert!.slide_columns!
        }));
      }

      return cmds;
    }

  };
};


export function insertSlideColumns(state: EditorState, dispatch?: (tr: Transaction) => void) {
  const schema = state.schema;
  if (!canInsertNode(state, schema.nodes.div)) {
    return false;
  }



  if (dispatch) {
    wrapIn(state.schema.nodes.div)(state, (tr: Transaction) => {

      const div = findParentNodeOfType(state.schema.nodes.div)(tr.selection)!;
      tr.setNodeMarkup(div.pos, div.node.type, { classes: ["columns"] });

      const columnAttrs =  { classes: ["column"], keyvalue:[["width", "50%"]] };
      const columnsContent = [
        state.schema.nodes.div.create(
          columnAttrs,
          state.schema.nodes.paragraph.create()
        ),
        state.schema.nodes.div.create(
          columnAttrs,
          state.schema.nodes.paragraph.create()
        )
      ];
      tr.replaceWith(div.start, div.start + 1, columnsContent);
      setTextSelection(div.start + 1)(tr);
     
      dispatch(tr);
    });
  }
  return true;
}

export function insertSlidePause(state: EditorState, dispatch?: (tr: Transaction) => void) {
  const schema = state.schema;
  if (!canInsertNode(state, schema.nodes.paragraph)) {
    return false;
  }
  if (dispatch) {
    const node = schema.nodes.paragraph.createAndFill(null, schema.text('. . .'));
    if (node) {
      const tr = state.tr;
      tr.replaceSelectionWith(node);
      setTextSelection(tr.selection.from - 1, -1)(tr);
      tr.replaceSelectionWith(schema.nodes.paragraph.create());
      setTextSelection(tr.selection.from - 1, -1)(tr);
      dispatch(tr);
    }
  }
  return true;
}

export function insertSlideNotes(state: EditorState, dispatch?: (tr: Transaction) => void) {
  const schema = state.schema;
  if (!canInsertNode(state, schema.nodes.div)) {
    return false;
  }
  if (dispatch) {
    const node = schema.nodes.div.createAndFill({ classes: ['notes']}, schema.nodes.paragraph.create());
    if (node) {
      const tr = state.tr;
      tr.replaceSelectionWith(node);
      setTextSelection(state.selection.from + 1, 1)(tr);
      dispatch(tr);
    }
  }
  return true;
}

export default extension;