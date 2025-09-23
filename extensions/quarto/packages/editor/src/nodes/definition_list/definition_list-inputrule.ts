/*
 * definition_list-inputrule.ts
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

import { InputRule } from 'prosemirror-inputrules';
import { EditorState } from 'prosemirror-state';
import { setTextSelection, findParentNodeOfTypeClosestToPos } from 'prosemirror-utils';

import { insertDefinitionList } from './definition_list-insert';

export function definitionInputRule() {
  return new InputRule(/^:[ ]+$/, (state: EditorState, _match: RegExpMatchArray, start: number, end: number) => {
    const schema = state.schema;

    // if we are inside a definiition list description this means start a new description
    const { $head } = state.selection;
    const container = $head.node($head.depth - 1);
    const parent = $head.node($head.depth);

    // must be just ': '
    if (parent.textContent.trim() !== ':') {
      return null;
    }

    // check for : within a definition list description
    if (container.type === schema.nodes.definition_list_description && parent.type === schema.nodes.paragraph) {
      const tr = state.tr;
      const startPos = $head.start($head.depth) - 1;
      tr.deleteRange(startPos, startPos + $head.node($head.depth).nodeSize);
      const insertPos = tr.mapping.map(startPos) + 1;
      tr.insert(
        insertPos,
        schema.nodes.definition_list_description.createAndFill({}, schema.nodes.paragraph.create())!,
      );
      setTextSelection(insertPos, 1)(tr).scrollIntoView();
      return tr;

      // check for : in a paragraph immediately after another paragraph
    } else if (container.type !== schema.nodes.definition_list_description && isParagraphAfterParagraph(state)) {
      const prevPara = findParentNodeOfTypeClosestToPos(state.doc.resolve(start - 2), schema.nodes.paragraph);
      if (prevPara) {
        const tr = state.tr;
        tr.deleteRange(prevPara.start, end);
        insertDefinitionList(tr, [
          schema.nodes.definition_list_term.createAndFill({}, prevPara.node.content)!,
          schema.nodes.definition_list_description.createAndFill({}, schema.nodes.paragraph.create())!,
        ]);
        return tr;
      } else {
        return null;
      }
    } else {
      return null;
    }
  });
}

function isParagraphAfterParagraph(state: EditorState) {
  const schema = state.schema;
  const { $head } = state.selection;

  // check if the selection is in a paragraph
  const selectionInParagraph = $head.node($head.depth).type === schema.nodes.paragraph;
  if (!selectionInParagraph) {
    return false;
  }

  // check if the previous node is a paragraph
  const parent = $head.node($head.depth - 1);
  const parentIndex = $head.index($head.depth - 1);
  return parentIndex > 0 && parent.child(parentIndex - 1).type === schema.nodes.paragraph;
}
