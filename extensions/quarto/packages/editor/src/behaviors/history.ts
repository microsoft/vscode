/*
 * history.ts
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

import { history, redo, undo } from 'prosemirror-history';

import { ProsemirrorCommand, EditorCommandId } from '../api/command';
import { Extension } from '../api/extension';

const extension: Extension = {
  commands: () => {
    return [
      new ProsemirrorCommand(EditorCommandId.Undo, ['Mod-z'], undo),
      new ProsemirrorCommand(EditorCommandId.Redo, ['Shift-Mod-z'], redo),
    ];
  },

  plugins: () => {
    return [history()];
  },
};

export default extension;
