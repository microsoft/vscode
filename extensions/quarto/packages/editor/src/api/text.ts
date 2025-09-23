/*
 * text.ts
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

import { Node as ProsemirrorNode } from 'prosemirror-model';

export interface TextWithPos {
  readonly text: string;
  readonly pos: number;
}

export function mergedTextNodes(
  doc: ProsemirrorNode,
  filter?: (node: ProsemirrorNode, pos: number, parentNode: ProsemirrorNode | null) => boolean,
): TextWithPos[] {
  const textNodes: TextWithPos[] = [];
  let nodeIndex = 0;
  doc.descendants((node, pos, parentNode) => {
    if (node.isText) {
      // apply filter
      if (filter && !filter(node, pos, parentNode)) {
        return false;
      }

      // join existing contiguous range of text nodes or create a new one
      if (textNodes[nodeIndex]) {
        textNodes[nodeIndex] = {
          text: textNodes[nodeIndex].text + node.text,
          pos: textNodes[nodeIndex].pos,
        };
      } else {
        textNodes[nodeIndex] = {
          text: node.text || '',
          pos,
        };
      }
    } else {
      nodeIndex += 1;
    }
    return true;
  });
  return textNodes;
}

