/*
 * math-commands.ts
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

import { EditorState, Transaction, Selection } from 'prosemirror-state';
import { setTextSelection, findParentNodeOfType } from 'prosemirror-utils';

import { ProsemirrorCommand, EditorCommandId, toggleMarkType } from '../../api/command';
import { canInsertNode } from '../../api/node';
import { EditorUI } from '../../api/ui-types';
import { OmniInsert, OmniInsertGroup } from '../../api/omni_insert';
import { MathType, delimiterForType } from '../../api/math';
import { EditorView } from 'prosemirror-view';
import { getMarkRange, getMarkAttrs } from '../../api/mark';
import { EditorFormat, kQuartoDocType } from '../../api/format';

export class InsertInlineMathCommand extends ProsemirrorCommand {
  constructor(ui: EditorUI) {
    super(EditorCommandId.InlineMath, [], insertMathCommand(MathType.Inline, false), inlineMathOmniInsert(ui));
  }
}

export class InsertDisplayMathCommand extends ProsemirrorCommand {
  constructor(ui: EditorUI, allowNewline: boolean) {
    super(
      EditorCommandId.DisplayMath,
      [],
      insertMathCommand(MathType.Display, allowNewline),
      displayMathOmniInsert(ui),
    );
  }
}

function insertMathCommand(type: MathType, allowNewline: boolean) {
  return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
    // enable/disable command
    const schema = state.schema;
    if (!canInsertNode(state, schema.nodes.text) || !toggleMarkType(schema.marks.math)(state)) {
      return false;
    }

    if (dispatch) {
      const tr = state.tr;
      insertMath(state.selection, type, allowNewline, tr);
      dispatch(tr);
    }
    return true;
  };
}

function inlineMathOmniInsert(ui: EditorUI): OmniInsert {
  return {
    name: ui.context.translateText('Inline Math'),
    keywords: [ui.context.translateText('equation')],
    description: ui.context.translateText('Math within a line or paragraph'),
    group: OmniInsertGroup.Math,
    priority: 2,
    image: () => (ui.prefs.darkMode() ? ui.images.omni_insert.math_inline_dark : ui.images.omni_insert.math_inline),
  };
}

function displayMathOmniInsert(ui: EditorUI): OmniInsert {
  return {
    name: ui.context.translateText('Display Math'),
    keywords: [ui.context.translateText('equation')],
    description: ui.context.translateText('Math set apart from the main text'),
    group: OmniInsertGroup.Math,
    priority: 1,
    image: () =>
      ui.prefs.darkMode() ? ui.images.omni_insert.math_display_dark : ui.images.omni_insert.math_display,
  };
}

export function insertMath(selection: Selection, type: MathType, allowNewline: boolean, tr: Transaction) {
  // include a newline for display math in an empty paragraph
  const schema = tr.doc.type.schema;
  let content = '';
  if (type === MathType.Display) {
    const para = findParentNodeOfType(schema.nodes.paragraph)(selection);
    if (allowNewline && para && !para.node.textContent.length) {
      content = '\n\n';
    }
  }
  const delim = delimiterForType(type);
  const mathText = schema.text(delim + content + delim);
  tr.replaceSelectionWith(mathText, false);
  const mathMark = schema.marks.math.create({ type });
  const from = tr.selection.head - content.length - delim.length * 2;
  const to = from + delim.length * 2 + content.length;
  tr.addMark(from, to, mathMark);
  const pos = tr.mapping.map(selection.head) - delim.length - (content ? 1 : 0);
  return setTextSelection(pos)(tr).scrollIntoView();
}

export function editMathAttributesEnabled(
  format: EditorFormat, 
  state: EditorState, 
  range?: { from: number, to: number } | false
) {
  if (format.docTypes.includes(kQuartoDocType)) {
    if (!range) {
      range = getMarkRange(state.selection.$from, state.schema.marks.math);
    }
    if (range) {
      const mathAttrs = getMarkAttrs(state.doc, range, state.schema.marks.math);
      return mathAttrs.type === MathType.Display;
    } else {
      return false;
    }
  } else {
    return false;
  }
}

export function editMathAttributes(ui: EditorUI) {
  
  return (state: EditorState, dispatch?: (tr: Transaction) => void, view?: EditorView) => {
    
    // look one position ahead in case this resulted from a click on the edit attributes button
    const mathRange = getMarkRange(
      state.doc.resolve(state.selection.from+1), 
      state.schema.marks.math
    ) as { from: number; to: number };
    if (!mathRange) {
      // always return true so the edit button always displays
      return true;
    }

    async function asyncEditMath() {
      if (dispatch) {
       
        const mathAttrs = getMarkAttrs(state.doc, mathRange, state.schema.marks.math);
        const id = await ui.dialogs.editMath(mathAttrs.id || "");
        if (id !== null) {
          const tr = state.tr;
          const mark = state.schema.marks.math.create({ ...mathAttrs, id: id.length > 0 ? id : null });
          tr.removeMark(mathRange.from, mathRange.to, state.schema.marks.math);
          tr.addMark(mathRange.from, mathRange.to, mark);
          dispatch(tr);
        }
        if (view) {
          view.focus();
        }
      }
    }
    asyncEditMath();

    return true;
  };
}
