/*
 * trackselection.ts
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

import debounce from 'lodash.debounce';

import { EditorView as PMEditorView } from "prosemirror-view";
import { TextSelection, Transaction } from "prosemirror-state";

import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { cursorLineDown, cursorLineStart } from "@codemirror/commands";

import { DispatchEvent, codeViewCellContext, kCodeViewNextLineTransaction } from "editor";

import { Behavior, BehaviorContext, State } from ".";

// track the selection in prosemirror
export function trackSelectionBehavior(context: BehaviorContext) : Behavior {

  let unsubscribe: VoidFunction;

  // 500ms debounced function for code view assist request
  const codeViewAssist = debounce(() => {
    // get path and context (bail if we can't)
    const filepath = context.pmContext.ui.context.getDocumentPath();
    if (!filepath) {
      return;
    }
    const cvContext = codeViewCellContext(filepath, context.view.state);
    if (cvContext) {
      context.pmContext.ui.codeview?.codeViewAssist(cvContext);
    }
  }, 500);

  return {

    init(_pmNode, cmView) {
      unsubscribe = context.pmContext.events.subscribe(DispatchEvent, (tr: Transaction | undefined) => {
        if (tr) {
          // track selection changes that occur when we don't have focus
          if (!cmView.hasFocus && tr.selectionSet && !tr.docChanged && (tr.selection instanceof TextSelection)) {
            const cmSelection = asCodeMirrorSelection(context.view, cmView, context.getPos);
            context.withState(State.Updating, () => {
              if (cmSelection) {
                cmView.dispatch({ selection: cmSelection });
              } else {
                cmView.dispatch({ selection: EditorSelection.single(0)})
              } 
            })
          } else if (tr.getMeta(kCodeViewNextLineTransaction) === true) {
            // NOTE: this is a special directive to advance to the next line. as distinct
            // from the block above it is not a reporting of a change in the PM selection
            // but rather an instruction to move the CM selection to the next line. as 
            // such we do not encose the code in State.Updating, because we want an update
            // to the PM selection to occur
            const cmSelection = asCodeMirrorSelection(context.view, cmView, context.getPos);
            if (cmSelection) {
              if (cursorLineDown(cmView)) {
                cursorLineStart(cmView);
              } 
            }
          // for other selection changes 
          } else if (cmView.hasFocus && tr.selectionSet && (tr.selection instanceof TextSelection)) {
            codeViewAssist();
          }
        } 
      });
    },

    cleanup: () => {
      unsubscribe?.();
    }
  };

}

export const asCodeMirrorSelection = (
  pmView: PMEditorView,
  cmView: EditorView,
  getPos: (() => number) | boolean
) => {
  if (typeof(getPos) === "function") {
    const offset = getPos() + 1;
    const node = pmView.state.doc.nodeAt(getPos());
    if (node) {
      const nodeSize = node.nodeSize;
      const selection = pmView.state.selection;
      const cmRange = { from: offset, to: offset + nodeSize - 1 };
      const isWithinCm = (pos: number) => pos >= cmRange.from && pos < cmRange.to;
      if (isWithinCm(selection.from) || isWithinCm(selection.to)) {
        return EditorSelection.single(selection.from - offset, selection.to - offset);
      } else if (selection.from <= cmRange.from && selection.to >= cmRange.to) {
        return EditorSelection.single(0, cmView.state.doc.length);
      }
      
    }
  }
  return undefined;
}