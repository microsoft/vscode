/*
 * cite-highlight.ts
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
import { DecorationSet } from 'prosemirror-view';
import { Schema } from 'prosemirror-model';

import { markHighlightPlugin, markHighlightDecorations } from '../../api/mark-highlight';

const key = new PluginKey<DecorationSet>('cite-highlight');

export function citeHighlightPlugin(schema: Schema) {
  return markHighlightPlugin(key, schema.marks.cite, (text, _attrs, markRange) => {
    return markHighlightDecorations(markRange, text, /([[\]])/g, 'pm-link-text-color pm-fixedwidth-font');
  });
}
