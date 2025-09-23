/*
 * definition_list-commands.ts
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

import { ProsemirrorCommand, EditorCommandId } from '../../api/command';
import { Schema, Node as ProsemirrorNode } from 'prosemirror-model';
import { EditorState, Transaction, TextSelection } from 'prosemirror-state';
import { findParentNodeOfType, setTextSelection } from 'prosemirror-utils';

import { canInsertNode } from '../../api/node';
import { insertDefinitionList } from './definition_list-insert';
import { EditorUI } from '../../api/ui-types';
import { OmniInsertGroup } from '../../api/omni_insert';

export class InsertDefinitionList extends ProsemirrorCommand {
  constructor(ui: EditorUI) {
    super(
      EditorCommandId.DefinitionList,
      [],
      (state: EditorState, dispatch?: (tr: Transaction) => void) => {
        const schema = state.schema;

        if (
          findParentNodeOfType(schema.nodes.definition_list)(state.selection) ||
          !canInsertNode(state, schema.nodes.definition_list)
        ) {
          return false;
        }

        // new definition list
        if (dispatch) {
          const tr = state.tr;

          // create new list
          const termText = insertTermText(ui);
          const term = schema.text(termText);
          insertDefinitionList(tr, [
            schema.nodes.definition_list_term.createAndFill(null, term) as ProsemirrorNode,
            createDefinitionDescription(schema),
          ]);
          const start = state.selection.from;
          tr.setSelection(TextSelection.create(tr.doc, start, start + termText.length + 1)).scrollIntoView();
          dispatch(tr);
        }
        return true;
      },
      // omni insert
      {
        name: ui.context.translateText('Definition List'),
        description: ui.context.translateText('List with a definition for each item'),
        group: OmniInsertGroup.Lists,
        priority: 3,
        image: () =>
          ui.prefs.darkMode() ? ui.images.omni_insert.definition_list_dark : ui.images.omni_insert.definition_list,
      },
    );
  }
}

class InsertDefinitionListItemCommand extends ProsemirrorCommand {
  constructor(id: EditorCommandId, createFn: () => ProsemirrorNode) {
    super(id, [], (state: EditorState, dispatch?: (tr: Transaction) => void) => {
      const schema = state.schema;

      if (!findParentNodeOfType(schema.nodes.definition_list)(state.selection)) {
        return false;
      }

      if (dispatch) {
        const tr = state.tr;
        const dlTypes = [schema.nodes.definition_list_term, schema.nodes.definition_list_description];
        const parent = findParentNodeOfType(dlTypes)(state.selection)!;
        const insertPos = parent.pos + parent.node.nodeSize;
        const insertNode = createFn();
        tr.insert(insertPos, insertNode);
        if (insertNode.textContent.length > 1) {
          tr.setSelection(TextSelection.create(tr.doc, insertPos, insertPos + insertNode.textContent.length + 1));
        } else {
          setTextSelection(insertPos, 1)(tr);
        }
        tr.scrollIntoView();

        dispatch(tr);
      }

      return true;
    });
  }
}

export class InsertDefinitionTerm extends InsertDefinitionListItemCommand {
  constructor(schema: Schema, ui: EditorUI) {
    super(EditorCommandId.DefinitionTerm, () => {
      const term = schema.text(insertTermText(ui));
      return schema.nodes.definition_list_term.createAndFill({}, term)!;
    });
  }
}

export class InsertDefinitionDescription extends InsertDefinitionListItemCommand {
  constructor(schema: Schema) {
    super(EditorCommandId.DefinitionDescription, () => {
      return createDefinitionDescription(schema);
    });
  }
}

function insertTermText(ui: EditorUI) {
  return ui.context.translateText('term');
}

function createDefinitionDescription(schema: Schema) {
  return schema.nodes.definition_list_description.createAndFill({}, schema.nodes.paragraph.create())!;
}
