/*
 * clipboard.ts
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

import { Slice, Fragment, MarkType, Node as ProsemirrorNode } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';

import { kPasteTransaction } from './transaction';

export function pasteTransaction(state: EditorState) {
  const tr = state.tr;
  tr.setMeta(kPasteTransaction, true);
  tr.setMeta('uiEvent', 'paste');
  return tr;
}

// add marks to plain text pasted into the editor (e.g. urls become links)
// https://github.com/ProseMirror/prosemirror/issues/90
export function markPasteHandler(regexp: RegExp, type: MarkType, getAttrs: (s: string) => Record<string,unknown>) {
  const handler = (fragment: Fragment) => {
    regexp.lastIndex = 0;

    const nodes: ProsemirrorNode[] = [];

    fragment.forEach((child: ProsemirrorNode) => {
      if (child.isText) {
        const { text } = child;
        let pos = 0;
        let match;

        do {
          match = regexp.exec(text!);
          if (match) {
            const start = match.index;
            const end = start + match[0].length;
            const matchText = match.length > 1 ? match[1] : match[0];
            const attrs = getAttrs instanceof Function ? getAttrs(matchText) : getAttrs;
            if (start > 0) {
              nodes.push(child.cut(pos, start));
            }
            nodes.push(type.schema.text(matchText).mark(type.create(attrs).addToSet(child.marks)));
            pos = end;
          }
        } while (match);

        if (pos < text!.length) {
          nodes.push(child.cut(pos));
        }
      } else {
        nodes.push(child.copy(handler(child.content)));
      }
    });

    regexp.lastIndex = 0;

    return Fragment.fromArray(nodes);
  };

  return (slice: Slice) => new Slice(handler(slice.content), slice.openStart, slice.openEnd);
}
