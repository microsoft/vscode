/*
 * math-highlight.ts
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

import { PluginKey } from 'prosemirror-state';
import { DecorationSet, Decoration } from 'prosemirror-view';
import { Schema } from 'prosemirror-model';

import { markHighlightPlugin } from '../../api/mark-highlight';
import { delimiterForType } from '../../api/math';

const key = new PluginKey<DecorationSet>('math-highlight');

export function mathHighlightPlugin(schema: Schema) {
  return markHighlightPlugin(key, schema.marks.math, (_text, attrs, markRange) => {
    const kDelimClass = 'pm-markup-text-color';
    const delim = delimiterForType(String(attrs.type));
    if (markRange.to - markRange.from === delim.length * 2) {
      return [Decoration.inline(markRange.from, markRange.to, { class: kDelimClass })];
    } else {
      return [
        Decoration.inline(markRange.from, markRange.from + delim.length, { class: kDelimClass }),
        Decoration.inline(markRange.to - delim.length, markRange.to, { class: kDelimClass }),
      ];
    }
  });
}
