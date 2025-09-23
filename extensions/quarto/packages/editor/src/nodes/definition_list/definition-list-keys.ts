/*
 * definition_list-keys.ts
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

import { EditorState, Transaction } from 'prosemirror-state';
import {
  findParentNodeOfType,
  findParentNodeOfTypeClosestToPos,
  setTextSelection,
  ContentNodeWithPos,
} from 'prosemirror-utils';

import { isLastChild, isOnlyChild } from '../../api/position';

export function definitionListEnter() {
  return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
    // process if we are within a definition list
    const schema = state.schema;
    const parentDL = findParentNodeOfType(schema.nodes.definition_list)(state.selection);
    if (!parentDL) {
      return false;
    }

    // handle only empty selections
    if (!state.selection.empty) {
      return false;
    }

    // handle enter in either a term or definition
    const parentTerm = findParentNodeOfType(schema.nodes.definition_list_term)(state.selection);
    if (parentTerm) {
      return termEnter(parentTerm, state, dispatch);

      // enter in trailing empty description paragraph (append a term)
    } else if (isTrailingEmptyParagraph(state)) {
      if (dispatch) {
        endOfDescriptionEnter(state, dispatch);
      }
      return true;
    } else {
      return false;
    }
  };
}

export function definitionListBackspace() {
  return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
    // process if we are within a definition item
    const schema = state.schema;
    const dlTypes = [schema.nodes.definition_list_term, schema.nodes.definition_list_description];
    const parentTerm = findParentNodeOfType(dlTypes)(state.selection);
    if (!parentTerm) {
      return false;
    }

    if (parentTerm.node.type === schema.nodes.definition_list_term) {
      // if it's empty
      if (parentTerm.node.childCount === 0) {
        if (dispatch) {
          emptyTermBackspace(state, dispatch);
        }
        return true;
      }
    } else {
      // if the enclosing description is empty then delete it
      if (parentTerm.node.textContent.length === 0) {
        if (dispatch) {
          emptyDescriptionBackspace(parentTerm, state, dispatch);
        }

        return true;
      }
    }

    return false;
  };
}

export function definitionListTab() {
  return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
    // process if we are within a definition_term
    const schema = state.schema;
    const dlTypes = [schema.nodes.definition_list_term, schema.nodes.definition_list_description];
    const parentTerm = findParentNodeOfType(dlTypes)(state.selection);
    if (!parentTerm) {
      return false;
    }

    // advance past node
    if (dispatch) {
      const tr = state.tr;
      const advancePos = parentTerm.pos + parentTerm.node.nodeSize;
      setTextSelection(advancePos, 1)(tr).scrollIntoView();
      dispatch(tr);
    }

    return true;
  };
}

export function definitionListShiftTab() {
  return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
    // process if we are within a definition_term
    const schema = state.schema;
    const dlTypes = [schema.nodes.definition_list_term, schema.nodes.definition_list_description];
    const parentTerm = findParentNodeOfType(dlTypes)(state.selection);
    if (!parentTerm) {
      return false;
    }

    if (dispatch) {
      const tr = state.tr;
      const backwardPos = state.doc.resolve(parentTerm.pos - 1);
      const prevNode = findParentNodeOfTypeClosestToPos(backwardPos, dlTypes);
      if (prevNode) {
        setTextSelection(prevNode.start, 1)(tr).scrollIntoView();
      } else {
        const listNode = findParentNodeOfType(schema.nodes.definition_list)(tr.selection)!;
        setTextSelection(listNode.pos, -1)(tr).scrollIntoView();
      }

      dispatch(tr);
    }

    return true;
  };
}

function termEnter(term: ContentNodeWithPos, state: EditorState, dispatch?: (tr: Transaction) => void) {
  const schema = state.schema;
  const $head = state.selection.$head;

  // only handle empty selections
  if (!state.selection.empty) {
    return false;
  }

  // if we are empty then it's an exit (delete the term)
  const isEmpty = term.node.textContent.length === 0;
  if (isEmpty) {
    if (dispatch) {
      const tr = state.tr;
      tr.deleteRange(term.pos, term.pos + term.node.nodeSize);
      tr.replaceSelectionWith(schema.nodes.paragraph.create());
      setTextSelection(tr.mapping.map(state.selection.from), 1)(tr);
      dispatch(tr);
    }
    return true;

    // variable handling for non-empty
  } else {
    // selection at the beginning means insert another term above
    if ($head.parentOffset === 0) {
      if (dispatch) {
        const tr = state.tr;
        const insertPos = tr.selection.$head.before($head.depth);
        tr.insert(insertPos, schema.nodes.definition_list_term.create());
        dispatch(tr);
      }
      return true;

      // selection at the end means insert a description below
    } else if ($head.parentOffset === term.node.textContent.length) {
      if (dispatch) {
        const tr = state.tr;
        const insertPos = tr.selection.$head.after($head.depth);
        tr.insert(
          insertPos,
          schema.nodes.definition_list_description.createAndFill({}, schema.nodes.paragraph.create())!,
        );
        setTextSelection(insertPos, 1)(tr).scrollIntoView();
        dispatch(tr);
      }
      return true;
    }
  }

  return false;
}

function emptyTermBackspace(state: EditorState, dispatch: (tr: Transaction) => void) {
  const { $head } = state.selection;
  const tr = state.tr;
  // if it's the only child then delete the entire list
  if (isOnlyChild($head)) {
    const start = $head.start($head.depth - 1) - 1;
    tr.deleteRange(start, start + $head.node($head.depth - 1).nodeSize);
  } else {
    const start = $head.start($head.depth) - 1;
    tr.deleteRange(start, start + $head.node($head.depth).nodeSize);
  }
  dispatch(tr);
}

function endOfDescriptionEnter(state: EditorState, dispatch: (tr: Transaction) => void) {
  const schema = state.schema;
  const { $head } = state.selection;
  const selectionNode = $head.node($head.depth);

  const tr = state.tr;

  // if the parent description is empty then delete it
  let start = null;
  const descriptionNode = $head.node($head.depth - 1);
  if (descriptionNode.textContent.trim().length === 0) {
    start = $head.start($head.depth - 1) - 1;
    tr.deleteRange(start, start + descriptionNode.nodeSize);

    // only if at very end
    if (isLastChild($head, 2)) {
      const insertPos = tr.mapping.map($head.after($head.depth - 2));
      tr.insert(insertPos, schema.nodes.paragraph.create());
      setTextSelection(insertPos, 1)(tr).scrollIntoView();
    }

    // otherwise just delete the paragraph and insert a term
  } else {
    start = $head.start($head.depth) - 1;
    tr.deleteRange(start, start + selectionNode.nodeSize);
    start = tr.mapping.map(start);
    tr.insert(start + 1, schema.nodes.definition_list_term.create());
    setTextSelection(start, 1)(tr).scrollIntoView();
  }

  dispatch(tr);
}

function emptyDescriptionBackspace(
  description: ContentNodeWithPos,
  state: EditorState,
  dispatch: (tr: Transaction) => void,
) {
  const tr = state.tr;
  tr.deleteRange(description.pos, description.pos + description.node.nodeSize);
  setTextSelection(description.pos,-1)(tr).scrollIntoView();
  dispatch(tr);
}

function isTrailingEmptyParagraph(state: EditorState) {
  const { $head } = state.selection;
  const selectionNode = $head.node($head.depth);
  const isParagraph = selectionNode.type === state.schema.nodes.paragraph;
  const isEmpty = selectionNode.textContent.trim().length === 0;
  return isParagraph && isEmpty && isLastChild($head);
}

