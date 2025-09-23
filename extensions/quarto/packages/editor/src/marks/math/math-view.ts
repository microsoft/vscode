/*
 * math-viewts
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

import { Plugin, PluginKey, EditorState, Transaction, Selection, EditorStateConfig } from 'prosemirror-state';
import { Schema } from 'prosemirror-model';
import { DecorationSet, EditorView, Decoration } from 'prosemirror-view';
import { keymap } from 'prosemirror-keymap';
import { AddMarkStep, RemoveMarkStep } from 'prosemirror-transform';

import { findChildrenByMark, setTextSelection } from 'prosemirror-utils';

import { getMarkRange, getMarkAttrs } from '../../api/mark';

import { MathType } from '../../api/math';
import { EditorMath, EditorUI } from '../../api/ui-types';
import { kSetMarkdownTransaction, kThemeChangedTransaction } from '../../api/transaction';
import { attrEditDecorationWidget } from '../../api/attr_edit/attr_edit-decoration';
import { EditorFormat } from '../../api/format';
import { editMathAttributes, editMathAttributesEnabled } from './math-commands';

// NOTE: rendered equations don't curently show selection background color when part
// of a larger selection (in spite of a few failed attempts to get this to work)
// it would be nice to figure out how to do this

export function mathViewPlugins(schema: Schema, format: EditorFormat, ui: EditorUI, math: EditorMath): Plugin[] {
  return [
    mathViewPlugin(schema, format, ui, math),
    keymap({
      ArrowUp: verticalArrowHandler('up'),
      ArrowDown: verticalArrowHandler('down'),
    }),
  ];
}

function mathViewPlugin(schema: Schema, format: EditorFormat, ui: EditorUI, math: EditorMath) {
  const key = new PluginKey<DecorationSet>('math-view');

  function decorationsForDoc(state: EditorState) {
    const decorations: Decoration[] = [];
    findChildrenByMark(state.doc, schema.marks.math, true).forEach(markedNode => {
      // get mark range and attributes
      const range = getMarkRange(state.doc.resolve(markedNode.pos), schema.marks.math) as { from: number; to: number };
      const attrs = getMarkAttrs(state.doc, range, schema.marks.math);

      // if the selection isn't in the mark, then show the preview
      const preview = state.selection.from < range.from || state.selection.from > range.to;
      if (preview) {
        // get the math text
        const mathText = state.doc.textBetween(range.from, range.to);

        // hide the code
        decorations.push(Decoration.inline(range.from, range.to, { style: 'display: none;' }));

        // show a math preview
        decorations.push(
          Decoration.widget(
            range.from,
            (view: EditorView, getPos: () => number | undefined) => {
              const mathjaxDiv = window.document.createElement('div');
              mathjaxDiv.classList.add('pm-math-mathjax');
              // text selection 'within' code for clicks on the preview image
              mathjaxDiv.onclick = () => {
                const tr = view.state.tr;
                let pos = getPos();
                if (pos !== undefined) {
                  if (attrs.type === MathType.Display) {
                    // set position to first non $, non whitespace character
                    const match = mathText.match(/^[$\s]+/);
                    if (match) {
                      pos += match[0].length;
                    }
                  } else {
                    // set position to the middle of the equation
                    pos = pos + mathText.length / 2;
                  }
                  setTextSelection(pos)(tr);
                  view.dispatch(tr);
                  view.focus();
                }
              };
              math.typeset(mathjaxDiv, mathText, ui.context.isActiveTab());
              return mathjaxDiv;
            },
            { key: mathText },
          ),
        );
      } 

      // for display math in quarto, show an edit widget
      if (editMathAttributesEnabled(format, state, range)) {
        decorations.push(attrEditDecorationWidget({
          pos: markedNode.pos-1,
          tags: attrs.id ? [`#${attrs.id}`] : [],
          editFn: editMathAttributes(ui),
          ui,
          offset: { top: 0, right: 6 },
        }));
      }
    });

    return DecorationSet.create(state.doc, decorations);
  }

  return new Plugin<DecorationSet>({
    key,

    state: {
      init(_config: EditorStateConfig, instance: EditorState) {
        return decorationsForDoc(instance);
      },

      apply(tr: Transaction, set: DecorationSet, oldState: EditorState, newState: EditorState) {
        // replacing the entire editor triggers decorations
        if (tr.getMeta(kSetMarkdownTransaction) || tr.getMeta(kThemeChangedTransaction)) {
          return decorationsForDoc(newState);

          // if one of the steps added or removed a mark of our type then rescan the doc.
        } else if (
          tr.steps.some(
            step =>
              (step instanceof AddMarkStep && step.mark.type === schema.marks.math) ||
              (step instanceof RemoveMarkStep && step.mark.type === schema.marks.math),
          )
        ) {
          return decorationsForDoc(newState);

          // if the previous or current state is in or at the border of a math mark, then rescan
        } else if (
          oldState.doc.rangeHasMark(oldState.selection.from - 2, oldState.selection.from + 1, schema.marks.math) ||
          getMarkRange(newState.selection.$from, schema.marks.math)
        ) {
          return decorationsForDoc(newState);

          // incremental scanning based on presence of mark in changed regions
        } else {
          // adjust decoration positions to changes made by the transaction (decorations that apply
          // to removed chunks of content will be removed by this)
          return set.map(tr.mapping, tr.doc);
        }
      },
    },

    appendTransaction: (_transactions: readonly Transaction[], oldState: EditorState, newState: EditorState) => {
      // not currently in math
      if (!getMarkRange(newState.selection.$from, schema.marks.math) && newState.selection.from > 0) {
        // did we end up just to the right of math? if so check for navigation from a distance
        // (would imply an up/down arrow)
        const prevMathRange = getMarkRange(newState.doc.resolve(newState.selection.from - 1), schema.marks.math);
        if (prevMathRange) {
          // if the selection came from afar then treat it as an actual selection
          const delta = oldState.selection.from - newState.selection.from;
          if (Math.abs(delta) > 3) {
            const tr = newState.tr;
            const mathText = newState.doc.textBetween(prevMathRange.from, prevMathRange.to);
            const attrs = getMarkAttrs(newState.doc, prevMathRange, schema.marks.math);
            if (attrs.type === MathType.Inline) {
              setTextSelection(prevMathRange.from + mathText.length / 2)(tr);
            }
            return tr;
          }
        }
      }

      return null;
    },

    props: {
      decorations(state: EditorState) {
        return key.getState(state);
      },
    },
  });
}

function verticalArrowHandler(dir: 'up' | 'down') {
  return (state: EditorState, dispatch?: (tr: Transaction) => void, view?: EditorView) => {
    if (!view) {
      return false;
    }

    const schema = state.schema;

    // see if we need to provide up/down for inline math (it doesn't work by default, likely because
    // of the display: none decorator). This implementation just moves the selection before or
    // after the mark (better than the cursor doing nothing which is what we saw w/o this) however
    // it would be cool if we could fully emulate up/down
    const range = getMarkRange(state.selection.$head, schema.marks.math);
    if (range) {
      const attrs = getMarkAttrs(state.doc, range, schema.marks.math);
      if (attrs.type === MathType.Inline) {
        if (dispatch) {
          const side = dir === 'up' ? -1 : 1;
          const $head = state.selection.$head;
          const nextPos = Selection.near(state.doc.resolve(side > 0 ? $head.after() : $head.before()), side);
          const tr = state.tr;
          tr.setSelection(nextPos);
          dispatch(tr);
        }
        return true;
      }
    }

    if (view.endOfTextblock(dir)) {
      const side = dir === 'up' ? -1 : 1;
      const $head = state.selection.$head;
      const nextPos = Selection.near(state.doc.resolve(side > 0 ? $head.after() : $head.before()), side);
      if (
        nextPos.$head &&
        nextPos.$head.parent.childCount === 1 &&
        schema.marks.math.isInSet(nextPos.$head.parent.firstChild!.marks)
      ) {
        if (dispatch) {
          const mathText = nextPos.$head.parent.textContent;
          const match = mathText.match(/^[$\s]+/);
          if (match) {
            const tr = state.tr;
            const mathPos = nextPos.$head.start($head.depth);
            setTextSelection(mathPos + match[0].length)(tr);
            dispatch(tr);
          }
        }
        return true;
      }
    }
    return false;
  };
}
