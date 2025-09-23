/*
 * empty_mark.ts
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

import { Transaction, EditorState } from 'prosemirror-state';
import { ReplaceStep } from 'prosemirror-transform';

import { Extension } from '../api/extension';
import { getMarkRange } from '../api/mark';

const extension: Extension = {
  appendTransaction: () => {
    return [
      {
        name: 'clear_empty_mark',
        append: (tr: Transaction, transactions: readonly Transaction[], _oldState: EditorState, newState: EditorState) => {
          // if we have an empty selection
          if (newState.selection.empty) {
            // if the last change removed text
            const removedText = transactions.some(transaction =>
              transaction.steps.some(step => {
                return step instanceof ReplaceStep && step.slice.content.size === 0;
              }),
            );
            if (removedText) {
              // if there is a stored mark w/ 0 range then remove it
              newState.storedMarks?.forEach(mark => {
                const markRange = getMarkRange(tr.doc.resolve(tr.selection.from), mark.type);
                if (!markRange || markRange.from === markRange.to) {
                  tr.removeStoredMark(mark);
                }
              });
            }
          }
        },
      },
    ];
  },
};

export default extension;
