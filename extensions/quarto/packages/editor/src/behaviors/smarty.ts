/*
 * smarty.ts
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

import { Extension, extensionIfEnabled } from '../api/extension';


// match enDash but only for lines that aren't an html comment
const enDash = new InputRule(/[^!-`]--$/, (state: EditorState, _match: string[], _start: number, end: number) => {
  const { parent, parentOffset } = state.selection.$head;
  const precedingText = parent.textBetween(0, parentOffset);
  if (precedingText.indexOf('<!--') === -1) {
    const tr = state.tr;
    tr.insertText('–', end - 1, end);
    return tr;
  } else {
    return null;
  }
});

const emDash = new InputRule(/(^|[^`])–-$/, (state: EditorState, _match: string[], _start: number, end: number) => {
  const tr = state.tr;
  tr.insertText('—', end - 1, end);
  return tr;
});

const extension: Extension = {
  inputRules: () => {
    return [enDash, emDash];
  }
};

export default extensionIfEnabled(extension, 'smart');
