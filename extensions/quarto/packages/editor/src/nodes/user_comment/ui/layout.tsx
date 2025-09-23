/*
 * layout.tsx
 *
 * Copyright (C) 2019-20 by RStudio, PBC
 *
 * Unless you have received this program directly from RStudio pursuant
 * to the terms of a commercial license agreement with RStudio, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */

import { EditorView } from 'prosemirror-view';
import { NodeWithPos } from 'prosemirror-utils';
import { getUserCommentNodeCache, getUserCommentNodePairs } from '../user_comment-cache';
import { getThreadElement } from './common';
import { editorScrollContainer } from '../../../api/scroll';

// Keep comment UI elements in sync with corresponding editor nodes
export function synchronizeCommentViewPositions(view: EditorView) {
  const schema = view.state.schema;

  return () => {
    const topOfDocument = view.coordsAtPos(0).top + scrollPos(view).top;

    const cache = getUserCommentNodeCache(view.state);
    if (cache.length === 0) {
      // Nothing to do.
      return;
    }
    const head = view.state.selection.head;
    const comments = getUserCommentNodePairs(schema, cache);
    const activeThreads = comments
      .filter(({begin, end}) => (begin.pos <= head && end.pos + end.node.nodeSize >= head))
      .map(({begin}) => begin);
    
    const activeThreadId = activeThreads.length > 0 ?
      activeThreads[activeThreads.length - 1].node.attrs.threadId :
      null;

    layoutCommentViews(comments.map(({begin}) => begin), activeThreadId, view, topOfDocument);
  };
}

// Vertically position the individual comment view divs (one per thread).
function layoutCommentViews(threads: NodeWithPos[], activeThreadId: string, view: EditorView, topOfDocument: number) {
  const kPadding = 12;

  const container = document.querySelector("div.pm-annotations") as (HTMLElement | undefined);
  if (!container) {
    return;
  }

  interface LayoutSpec {
    // The div.pm-user-comment-view for this comment.
    readonly el: HTMLElement;
  
    // The height of the el, in pixels.
    readonly height: number;
  
    // The y-position of the comment's begin node in the document, in pixels.
    // This is the y-position we'd use if this was the only comment.
    readonly idealTop: number;
  
    // The y-position we'd use to make no comment views overlap, if none of the
    // comments are active. This will be assigned to el.style.top, which is not
    // animated. This value may be affected by doc mutation (including comment
    // mutation), scrolling, window resizing, but NOT by selection changes. We
    // don't want any of those events to cause animated movement of comment UI.
    actualTop?: number;

    // The actual y-position we should use, after shuffling all the elements
    // around so that if any comment is active, its el is vertically aligned
    // with its document node. The difference between finalTop and actualTop
    // will be assigned to el.style.transform:translateY(xxx), which is
    // animated. This should only be affected by selection change, the one
    // situation where we want to animate the comment UI.
    finalTop?: number;
  }

  // Array of intermediate data structures that hold all the info we need to
  // perfom the layout. We'll build this up over a few passes, mutating each
  // object repeatedly.
  const layoutSpecs = new Array<LayoutSpec>();
  let activeThreadIndex = -1;

  // 1. Find all relevant CommentView divs and create a LayoutSpec for each.
  for (const thread of threads) {
    const threadId = thread.node.attrs.threadId;
    const satelliteEl = getThreadElement(threadId)!;
    if (!satelliteEl) {
      continue; // This can happen during undo/redo
    }

    // As long as we're here, try to find the active thread ID.
    // We also need to modify classes because they may affect the height of the
    // satelliteEl.
    if (threadId === activeThreadId) {
      activeThreadIndex = layoutSpecs.length;
      satelliteEl.classList.add("pm-user-comment-active");
    } else {
      satelliteEl.classList.remove("pm-user-comment-active");
    }

    layoutSpecs.push({
      el: satelliteEl,
      height: satelliteEl.getBoundingClientRect().height,
      idealTop: view.coordsAtPos(thread.pos).top - topOfDocument,
      // we'll populate these soon
      actualTop: undefined,
      finalTop: undefined
    });
  }

  // Populate actualTop: go from the top down, enforcing at least PADDING pixels
  // of spacing between each layoutSpec. The actualTop values will be used for
  // el.style.top.
  layoutSpecs.reduce((minTop, layoutSpec) => {
    layoutSpec.actualTop = Math.max(minTop, layoutSpec.idealTop);
    // The preceding line's mutation is the important side-effect. Return
    // the minTop value for the next iteration.
    return layoutSpec.actualTop + layoutSpec.height + kPadding;
  }, -Infinity);

  if (activeThreadIndex >= 0) {
    // If a thread is active, finalTop needs to be populated; it represents a
    // final pass of adjustments so that the active thread's UI is vertically
    // aligned with its corresponding document content.

    const active = layoutSpecs[activeThreadIndex];

    // Regardless of where the preceding logic wanted the active thread UI to
    // appear, we're forcing it to appear with its content.
    active.finalTop = active.idealTop;
    
    // Either of these might be zero-length, that's fine. (Note that the second
    // parameter is exclusive)
    const commentsAbove = layoutSpecs.slice(0, activeThreadIndex);
    const commentsBelow = layoutSpecs.slice(activeThreadIndex + 1);

    // Comment threads ABOVE the currently selected one are adjusted starting
    // from the bottom (hence reduceRight). Scoot each one up just enough to get
    // out of the way.
    commentsAbove.reduceRight(
      (maxBottom, layoutSpec) => {
        // Use actualTop as starting point. If we were to use idealTop, then
        // when a comment was selected, preceding comments that already had a gap
        // to this comment would still move (because "gravity" has changed).
        layoutSpec.finalTop = Math.min(maxBottom - layoutSpec.height, layoutSpec.actualTop!);
        // The preceding line's mutation is the important side-effect. Return
        // the maxBottom value for the next iteration.
        return layoutSpec.finalTop! - kPadding;
      },
      // The starting y-position above which these comments should be positioned
      active.finalTop! - kPadding
    );

    // Comment threads BELOW the currently selected one are adjusted are
    // adjusted from the top, not the bottom. Since the active comment UI can
    // only have moved upward or not at all, but definitely NOT downward, it's
    // not strictly necessary to adjust the positions of the things below; but
    // the algorithm here makes the behavior feel more "physical".
    commentsBelow.reduce(
      (minTop, layoutSpec) => {
        // Use idealTop as the starting point (unlike with commentsAbove). This
        // evokes the feeling that any threads that have been "pushed down" by a
        // comment move up when that comment is selected as that pressure is
        // relieved.
        layoutSpec.finalTop = Math.max(minTop, layoutSpec.idealTop);
        // The preceding line's mutation is the important side-effect. Return
        // the minTop value for the next iteration.
        return layoutSpec.finalTop! + layoutSpec.height + kPadding;
      },
      // The starting y-position below which these comments should be positioned
      active.finalTop! + active.height + kPadding
    );
  }

  // Now that actualTop and finalTop have been finalized, actually mutate the
  // DOM. Hopefully doing this all at once at the end will minimize reflows.
  layoutSpecs.forEach((layoutSpec) => {
    layoutSpec.el.style.top = layoutSpec.actualTop + "px";
    // Note that falsy layoutSpec.finalTop could mean undefined or 0; we don't
    // care about that distinction in this case.
    if (layoutSpec.finalTop) {
      layoutSpec.el.style.transform = `translateY(${layoutSpec.finalTop - layoutSpec.actualTop!}px)`;
    } else {
      layoutSpec.el.style.transform = "";
    }
  });
}

function scrollPos(view: EditorView) {
  const node = view.domAtPos(0)?.node;
  if (node?.nodeType !== Node.ELEMENT_NODE) {
    return {top: 0, left: 0};
  }

  const scrollEl = editorScrollContainer(node as HTMLElement);
  return {
    top: scrollEl.scrollTop,
    left: scrollEl.scrollLeft
  };
}
