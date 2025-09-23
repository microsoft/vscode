/*
 * hard_break.ts
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
import { BaseKey } from '../api/basekeys';
import { PandocOutput, PandocTokenType } from '../api/pandoc';

const extension: Extension = {
  nodes: [
    {
      name: 'hard_break',
      spec: {
        inline: true,
        group: 'inline',
        selectable: false,
        parseDOM: [{ tag: 'br' }],
        toDOM() {
          return ['br'];
        },
      },
      pandoc: {
        readers: [
          {
            token: PandocTokenType.LineBreak,
            node: 'hard_break',
          },
        ],
        writer: (output: PandocOutput) => {
          output.writeToken(PandocTokenType.LineBreak);
        },
      },
    },
  ],

  baseKeys: () => {
    return [
      { key: BaseKey.ModEnter, command: hardBreakCommandFn() },
      { key: BaseKey.ShiftEnter, command: hardBreakCommandFn() },
    ];
  },
};

export function hardBreakCommandFn() {
  return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
    const br = state.schema.nodes.hard_break;
    if (dispatch) {
      dispatch(state.tr.replaceSelectionWith(br.create()).scrollIntoView());
    }
    return true;
  };
}

export default extension;
