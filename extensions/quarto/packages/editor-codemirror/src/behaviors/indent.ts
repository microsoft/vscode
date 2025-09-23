/*
 * indent.ts
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

import { indentLess, indentMore } from "@codemirror/commands";

import { indentOnInput } from "@codemirror/language";
import { keymap } from "@codemirror/view";

import { Behavior } from ".";
import { acceptCompletion, completionStatus } from "@codemirror/autocomplete";

export function tabBehavior(): Behavior {
  return {
    extensions: [
      indentOnInput(),
      keymap.of([
        {
          key: 'Tab',
          preventDefault: true,
          shift: indentLess,
          run: e => {
            if (!completionStatus(e.state)) return indentMore(e);
            return acceptCompletion(e);
          },
        },
      ])
    ]
  };
}
