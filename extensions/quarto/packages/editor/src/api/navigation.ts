/*
 * navigation.ts
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

import { setTextSelection, Predicate, findChildren, findDomRefAtPos, findParentNodeOfTypeClosestToPos } from 'prosemirror-utils';

import zenscroll from 'zenscroll';

import { editingRootNodeClosestToPos } from './node';
import { kNavigationTransaction } from './transaction';
import { xrefPosition } from './xref';
import { EditorFormat, kQuartoDocType } from './format';
import { Navigation, NavigationType } from './navigation-types';
import { editorScrollContainer } from './scroll';
import { NodeSelection } from 'prosemirror-state';

export function navigateTo(
  view: EditorView,
  format: EditorFormat,
  type: NavigationType,
  location: string,
  animate = true,
): Navigation | null {
  switch (type) {
    case NavigationType.Pos:
      return navigateToPos(view, parseInt(location, 10), animate);
    case NavigationType.Id:
      return navigateToId(view, location, animate);
    case NavigationType.Href:
      return navigateToHref(view, location, animate);
    case NavigationType.Heading:
      return navigateToHeading(view, location, animate);
    case NavigationType.XRef:
      return navigateToXRef(view, format, location, animate);
    default:
      return null;
  }
}

export function navigateToId(view: EditorView, id: string, animate = true): Navigation | null {
  return navigate(view, node => id === node.attrs.navigation_id, animate);
}

export function navigateToHref(view: EditorView, href: string, animate = true): Navigation | null {
  return navigate(view, node => node.attrs.id === href, animate);
}

export function navigateToHeading(view: EditorView, heading: string, animate = true): Navigation | null {
  return navigate(
    view,
    node => {
      return (
        node.type === view.state.schema.nodes.heading &&
        node.textContent.localeCompare(heading, undefined, { sensitivity: 'accent' }) === 0
      );
    },
    animate,
  );
}

export function navigateToXRef(view: EditorView, editorFormat: EditorFormat, xref: string, animate = true): Navigation | null {
  const xrefType = editorFormat.docTypes.includes(kQuartoDocType) ? "quarto" : "bookdown";
  const xrefPos = xrefPosition(view.state.doc, xref, xrefType);
  if (xrefPos !== -1) {
    return navigateToPos(view, xrefPos, animate);
  } else {
    return null;
  }
}

export function navigateToPos(view: EditorView, pos: number, animate = true): Navigation | null {
  // get previous position
  const prevPos = view.state.selection.from;

  // need to target at least the body
  pos = Math.max(pos, 2);

  // set selection (detect node selection)
  const tr = view.state.tr;
  const pmNode = view.state.doc.nodeAt(pos);
  if (pmNode?.type.spec.selectable) {
    tr.setSelection(new NodeSelection(tr.doc.resolve(pos)));
  } else {
    setTextSelection(pos)(tr);
  }
  tr.setMeta(kNavigationTransaction, true);
  view.dispatch(tr);

  // find a targetable dom node at the position
  const node = findDomRefAtPos(pos, view.domAtPos.bind(view));
  if (node instanceof HTMLElement) {
    // auto-scroll to position (delay so we can grab the focus, as autoscrolling
    // doesn't seem to work unless you have the focus)
    setTimeout(() => {
      view.focus();

      const $pos = view.state.doc.resolve(pos);
      const container = editingRootNodeClosestToPos($pos);

      // if we have a container then do the scroll
      if (container) {
        const schema = view.state.schema;
        const containerEl = view.nodeDOM(container.pos) as HTMLElement;
        const parentList = findParentNodeOfTypeClosestToPos($pos, [schema.nodes.ordered_list, schema.nodes.bullet_list]);
        const parentDiv = schema.nodes.div ? findParentNodeOfTypeClosestToPos($pos, schema.nodes.div) : undefined;
        const resultPos = parentList || parentDiv ? $pos.before(2) : pos;
        const resultNode = view.nodeDOM(resultPos);
        if (resultNode) {
          const scrollNode = resultNode instanceof HTMLElement ? resultNode : resultNode.parentElement;
          if (scrollNode) {
            const scroller = zenscroll.createScroller(editorScrollContainer(containerEl), 700, 20);
            if (animate) {
              scroller.to(scrollNode);
            } else {
              scroller.to(scrollNode, 0);
            }
          }
        }
      }
    }, 200);

    return { pos, prevPos };
  } else {
    return null;
  }
}

function navigate(view: EditorView, predicate: Predicate, animate = true): Navigation | null {
  const result = findChildren(view.state.doc, predicate);
  if (result.length) {
    // pos points immediately before the node so add 1 to it
    const pos = result[0].pos + 1;
    return navigateToPos(view, pos, animate);
  } else {
    return null;
  }
}
