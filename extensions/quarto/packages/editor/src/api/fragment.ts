/*
 * fragment.ts
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

import { Fragment, Node as ProsemirrorNode } from 'prosemirror-model';

export function fragmentText(fragment: Fragment, unemoji = false) {
  let text = '';
  fragment.forEach(node => {
    const emjojiMark = node.marks.find(mark => mark.type === node.type.schema.marks.emoji);
    if (unemoji && emjojiMark) {
      return (text = text + (emjojiMark.attrs.emojihint || node.textContent));
    } else {
      return (text = text + node.textContent);
    }
  });
  return text;
}


export const mapFragment = (
  fragment: Fragment,
  map: (node: ProsemirrorNode) => ProsemirrorNode | null
): Fragment => {

  let mappedFragment = Fragment.from(fragment);
  fragment.forEach((node, _offset, index) => {
    const mappedNode = map(node);
    if (mappedNode !== null) {
      mappedFragment = mappedFragment.replaceChild(index, mappedNode);
    }
    node = mappedNode || node;
    if (node.content.childCount > 0) {
      mappedFragment = mappedFragment.replaceChild(
        index, 
        node.type.create(node.attrs, mapFragment(node.content, map))
      );
    }

  });
  return mappedFragment;
}
