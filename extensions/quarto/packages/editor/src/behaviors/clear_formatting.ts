/*
 * clear_formatting.ts
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

import { Extension } from '../api/extension';
import { ProsemirrorCommand, EditorCommandId } from '../api/command';
import { clearFormatting } from '../api/formatting';

const extension: Extension = {
  commands: () => {
    return [new ProsemirrorCommand(EditorCommandId.ClearFormatting, ['Mod-\\'], (state: EditorState, dispatch?: (tr: Transaction) => void) => {
      if (dispatch) {
        const tr = state.tr;
        const { from, to } = tr.selection;
        clearFormatting(tr, from, to);
        dispatch(tr);
      }
      return true;
    })];
  },
};

export default extension;
