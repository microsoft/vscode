/*
 * decoration.ts
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


import { EditorView } from 'prosemirror-view';

import { editingRootNodeClosestToPos } from '../node';

import { kPixelUnit } from '../css';

export interface DecorationPosition {
  pos: number;
  style: { [key: string]: string };
  key: string;
}

export function textRangePopupDecorationPosition(
  view: EditorView,
  range: { from: number; to: number },
  maxWidth: number,
): DecorationPosition {
  // get the (window) DOM coordinates for the start of the range. we use range.from + 1 so
  // that ranges that are at the beginning of a line don't have their position set
  // to the previous line
  const rangeCoords = view.coordsAtPos(range.from + 1);

  // get the node, element, coordinates, and style for the current editing root
  const rangePos = view.state.doc.resolve(range.from);
  const editingNode = editingRootNodeClosestToPos(rangePos)!;
  const editingEl = view.domAtPos(editingNode!.pos + 1).node as HTMLElement;
  const editingBox = editingEl.getBoundingClientRect();
  const editingBoxStyle = window.getComputedStyle(editingEl);

  // base popup style
  const topPadding = parseInt(editingBoxStyle.paddingTop!, 10) || 0;
  const popupStyle = {
    top: rangeCoords.bottom - editingBox.top - topPadding + 5 + kPixelUnit,
  };

  // we need to compute whether the popup will be visible (horizontally), do
  // this by testing whether we have room for the max link width + controls/padding
  let style: { [key: string]: string };
  const positionRight = rangeCoords.left + maxWidth > editingBox.right;
  if (positionRight) {
    const rightCoords = view.coordsAtPos(range.to);
    const rightPos = rangeCoords.top === rightCoords.top ? editingBox.right - rightCoords.right : 0;
    style = {
      ...popupStyle,
      right: rightPos + kPixelUnit,
    };
  } else {
    const marginLeft =
      'calc(' +
      (rangeCoords.left - editingBox.left) +
      'px ' +
      ' - ' +
      editingBoxStyle.borderLeftWidth +
      ' - ' +
      editingBoxStyle.paddingLeft +
      ' - ' +
      editingBoxStyle.marginLeft +
      ' - 1ch' +
      ')';
    style = {
      ...popupStyle,
      marginLeft,
    };
  }

  // calculate key
  const key = Object.keys(style)
    .map(attrib => `${attrib}=${style[attrib]}`)
    .join(';');

  return {
    pos: editingNode.pos + editingNode.node.nodeSize - 1,
    style,
    key,
  };
}
