/*
 * scroll.ts
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
import { findDomRefAtPos, findParentNodeOfTypeClosestToPos } from 'prosemirror-utils';

import zenscroll from 'zenscroll';

import { editingRootNodeClosestToPos, editingRootNode } from './node';

export function scrollIntoView(
  view: EditorView,
  pos: number,
  center = true,
  duration?: number,
  offset?: number,
  onDone?: VoidFunction,
) {
  // resolve position and determine container
  const $pos = view.state.doc.resolve(pos);
  const container = editingRootNodeClosestToPos($pos);

  // if we have a container then do the scroll
  if (container) {
    const schema = view.state.schema;
    const containerEl = view.nodeDOM(container.pos) as HTMLElement;
    const parentList = findParentNodeOfTypeClosestToPos($pos, [schema.nodes.ordered_list, schema.nodes.bullet_list]);
    const parentDiv = schema.nodes.div ? findParentNodeOfTypeClosestToPos($pos, schema.nodes.div) : undefined;
    const resultPos =  (parentList || parentDiv) ? $pos.before(2) : pos;
    const resultNode = findDomRefAtPos(resultPos, view.domAtPos.bind(view))
    if (resultNode) {
      const scrollNode = resultNode instanceof HTMLElement ? resultNode : resultNode.parentElement;
      if (scrollNode) {
        const scroller = zenscroll.createScroller(editorScrollContainer(containerEl), duration, offset);
      if (center) {
        scroller.center(scrollNode, duration, offset, onDone);
      } else {
        scroller.intoView(scrollNode, duration, onDone);
      }
      }
    }
  }
}

export function scrollToPos(view: EditorView, pos: number, duration?: number, offset?: number, onDone?: VoidFunction) {
  const node = view.nodeDOM(pos);
  const scrollNode = node instanceof HTMLElement ? node : node?.parentElement;
  if (scrollNode) {
    const editingRoot = editingRootNode(view.state.selection)!;
    const container = view.nodeDOM(editingRoot.pos) as HTMLElement;
    const scroller = zenscroll.createScroller(editorScrollContainer(container), duration, offset);
    if (duration) {
      scroller.to(scrollNode, duration, onDone);
    } else {
      scroller.to(scrollNode, 0, onDone);
    }
  }
}

export const kPmScrollContainer = 'pm-scroll-container';

export function editorScrollContainer(container: HTMLElement) : HTMLElement {
  return (container.closest(`.${kPmScrollContainer}`)|| container) as HTMLElement;
}