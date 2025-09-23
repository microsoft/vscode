/*
 * math-keys.ts
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
import { setTextSelection } from "prosemirror-utils";

import { MathType, mathTypeIsActive } from "../../api/math";
import { getSelectionMarkRange } from "../../api/mark";

// enable insertion of newlines
export function displayMathNewline(state: EditorState, dispatch?: (tr: Transaction) => void) {
  // display math mark must be active
  if (!mathTypeIsActive(state, MathType.Display)) {
    return false;
  }

  // insert a newline
  if (dispatch) {
    const tr = state.tr;
    tr.insertText('\n');
    dispatch(tr);
  }
  return true;
}

export function inlineMathNav(begin: boolean) {
  return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
    // inlne math mark must be active
    if (!mathTypeIsActive(state, MathType.Inline)) {
      return false;
    }
    const range = getSelectionMarkRange(state.selection, state.schema.marks.math);
    if (!range) {
      return false;
    }
  
    // insert a newline
    if (dispatch) {
      const tr = state.tr;
      setTextSelection(begin ? (range.from+1) : (range.to-1))(tr);
      dispatch(tr);
    }
    return true;
  };
}
