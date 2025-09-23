/*
 * underline.ts
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

import { Schema, Mark, Fragment } from 'prosemirror-model';

import { MarkCommand, EditorCommandId } from '../api/command';
import { Extension, extensionIfEnabled } from '../api/extension';
import { PandocOutput, PandocTokenType } from '../api/pandoc';

import './underline-styles.css';
import { kPlatformMac } from '../api/platform';

const extension: Extension = {
  marks: [
    {
      name: 'underline',
      spec: {
        parseDOM: [
          { tag: "span[class*='underline']" },
          { tag: "span[class*='ul']" },
          { tag: "u" },
          { tag: "ins" }
        ],
        toDOM() {
          return ['span', { class: 'underline' }];
        },
      },
      pandoc: {
        readers: [
          {
            token: PandocTokenType.Underline,
            mark: 'underline',
          },
        ],
        writer: {
          priority: 7,
          write: (output: PandocOutput, _mark: Mark, parent: Fragment) => {
            output.writeMark(PandocTokenType.Underline, parent);
          },
        },
      },
    },
  ],

  commands: (schema: Schema) => {
    return [new MarkCommand(EditorCommandId.Underline, kPlatformMac ? ['Mod-u'] : [], schema.marks.underline)];
  },
};

export default extensionIfEnabled(extension, ['bracketed_spans', 'native_spans']);
