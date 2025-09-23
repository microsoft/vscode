/*
 * strong.ts
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
import { Extension } from '../api/extension';
import { PandocOutput, PandocTokenType } from '../api/pandoc';
import { delimiterMarkInputRule, MarkInputRuleFilter } from '../api/input_rule';

const extension: Extension = {
  marks: [
    {
      name: 'strong',
      spec: {
        group: 'formatting',
        parseDOM: [
          // This works around a Google Docs misbehavior where pasted content will be inexplicably wrapped in `<b>`
          // tags with a font-weight normal.
          {
            tag: 'b',
            getAttrs: (value: string | Node) => (value as HTMLElement).style.fontWeight !== 'normal' && null,
          },
          { tag: 'strong' },
          {
            style: 'font-weight',
            getAttrs: (value: string | Node) => /^(bold(er)?|[5-9]\d{2,})$/.test(value as string) && null,
          },
        ],
        toDOM() {
          return ['strong'];
        },
      },
      pandoc: {
        readers: [
          {
            token: PandocTokenType.Strong,
            mark: 'strong',
          },
        ],
        writer: {
          priority: 3,
          write: (output: PandocOutput, _mark: Mark, parent: Fragment) => {
            output.writeMark(PandocTokenType.Strong, parent);
          },
        },
      },
    },
  ],

  commands: (schema: Schema) => {
    return [new MarkCommand(EditorCommandId.Strong, ['Mod-b'], schema.marks.strong)];
  },

  inputRules: (schema: Schema, filter: MarkInputRuleFilter) => {
    return [
      delimiterMarkInputRule('\\*\\*', schema.marks.strong, filter, '`', true),
      delimiterMarkInputRule('__', schema.marks.strong, filter, '\\w`', true),
    ];
  },
};

export default extension;
